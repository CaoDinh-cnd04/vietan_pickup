using System.Security.Claims;
using Microsoft.EntityFrameworkCore;

namespace VietAnPickup;

public sealed record LogRowDto(long Id, DateTime At, string Action, string ActionLabel, int UserId, string UserName, string? Code, string Content);

/// <summary>
/// Nhật ký thao tác (ai làm gì, lúc mấy giờ) — GHI TẠM vào bảng legacy TLogs, chưa có bảng riêng:
/// F10 = "PICKUP:&lt;thao tác&gt;" (lọc riêng dòng của app), F11 = "&lt;user id&gt;|&lt;tên&gt;", F12 = mã (B&lt;ID&gt;, &lt;số bill&gt;_&lt;kiện&gt;…), LogContent = mô tả.
/// Ghi trong cùng transaction với thao tác (raw SQL dùng transaction đang mở của DbContext).
/// </summary>
public static class AppLog
{
    public const string Source = "PICKUP:";

    public static readonly IReadOnlyDictionary<string, string> Labels = new Dictionary<string, string>
    {
        ["tao-tai-kho"] = "Tạo vận đơn tại kho",
        ["bat-dau-pickup"] = "Bắt đầu nhận lệnh Pickup",
        ["luu-kien"] = "Lưu kiện (kho)",
        ["chot-nhan"] = "Chốt kho đã nhận",
        ["huy"] = "Huỷ lệnh",
        ["anh-hang"] = "Ảnh hàng hoá",
        ["anh-hoan-thien"] = "Ảnh hoàn thiện",
        ["anh-kien"] = "Ảnh kiện (đóng gói)",
        ["xoa-anh"] = "Xoá ảnh",
        ["can-lai"] = "Cân lại kiện (bước cuối)",
    };

    internal static Task WriteAsync(PickupDb db, HttpContext http, string action, string? code, string content, CancellationToken ct)
    {
        var uid = Auth.UserId(http);
        var name = http.User.FindFirstValue("full_name") ?? "";
        var now = http.RequestServices.GetRequiredService<TimeProvider>().GetLocalNow().DateTime;
        return db.Database.ExecuteSqlInterpolatedAsync(
            $"INSERT INTO TLogs (LogDate, LogContent, F10, F11, F12) VALUES ({now}, {content}, {Source + action}, {$"{uid}|{name}"}, {code})", ct);
    }

    private static (int Id, string Name) UserOf(string? f11)
    {
        var parts = (f11 ?? "").Split('|', 2);
        return (int.TryParse(parts[0], out var id) ? id : 0, parts.ElementAtOrDefault(1) ?? "");
    }

    public static void Map(IEndpointRouteBuilder app)
    {
        app.MapGet("/api/logs", async (PickupDb db, TimeProvider clock, CancellationToken ct, DateTime? fromDate, DateTime? toDate,
            string search = "", string action = "", int page = 1, int pageSize = 50) =>
        {
            var p0 = Math.Max(page, 1);
            var size = Math.Clamp(pageSize, 1, 200);
            var dateTo = (toDate ?? clock.GetLocalNow().DateTime).Date.AddDays(1);
            var dateFrom = (fromDate ?? dateTo.AddDays(-7)).Date;
            var s = (search ?? "").Trim();
            var tag = Source + (action ?? "");
            var q = db.Logs.AsNoTracking().Where(l => l.F10!.StartsWith(tag) && l.LogDate >= dateFrom && l.LogDate < dateTo
                && (s == "" || l.LogContent.Contains(s) || l.F11!.Contains(s) || l.F12!.Contains(s)));
            var total = await q.CountAsync(ct);
            var rows = await q.OrderByDescending(l => l.Id).Skip((p0 - 1) * size).Take(size).ToListAsync(ct);
            var items = rows.Select(l =>
            {
                var a = l.F10![Source.Length..];
                var (uid, name) = UserOf(l.F11);
                return new LogRowDto(l.Id, l.LogDate, a, Labels.GetValueOrDefault(a, a), uid, name, l.F12, l.LogContent);
            }).ToList();
            return Results.Ok(new { items, page = p0, pageSize = size, totalCount = total, actions = Labels.Select(x => new { value = x.Key, label = x.Value }) });
        }).RequireAuthorization();
    }
}
