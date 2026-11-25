using System.Text.RegularExpressions;
using Microsoft.EntityFrameworkCore;

namespace VietAnPickup;

public sealed record PickupRowDto(int PickupId, long? CustomerId, string? CustomerName, string StaffName, DateTime PickDate, int SoKienBook, string? Note);

/// <summary>
/// Tab "Pickup" của kho: lệnh trong bảng Pickup (hệ cũ / CRM) chưa chốt (Pick_Date_End trống), Pick_Date trong 7 ngày,
/// và chưa gắn vận đơn nháp. Kho bắt đầu nhận ⇒ tạo vận đơn nháp MaVanDon cho khách của lệnh và gắn vào lệnh (Note = "B&lt;ID&gt;[ - ghi chú cũ]");
/// từ đó nhận kiện / tự chốt như mọi vận đơn nháp (Bookings), lệnh chuyển sang tab "Vận đơn".
/// </summary>
public static class Pickups
{
    private const int Days = 7;
    private const int NoteMax = 150;   // Pickup.Note nvarchar(150)
    private static readonly Regex Linked = new(@"^B(\d+)(\s-\s|$)", RegexOptions.CultureInvariant);

    /// <summary>ID vận đơn nháp mà Note của lệnh trỏ tới (B&lt;ID&gt; hoặc "B&lt;ID&gt; - …"), không có thì null.</summary>
    internal static long? LinkedId(string? note) => note is { } n && Linked.Match(n) is { Success: true } m && long.TryParse(m.Groups[1].Value, out var id) ? id : null;

    public static void Map(IEndpointRouteBuilder app)
    {
        var g = app.MapGroup("/api/pickups").RequireAuthorization();

        g.MapGet("", async (PickupDb db, TimeProvider clock, CancellationToken ct, string search = "") =>
        {
            var from = clock.GetLocalNow().DateTime.Date.AddDays(-(Days - 1));
            var open = await db.Pickups.AsNoTracking().Where(p => p.PickDateEnd == null && p.PickDate >= from).OrderByDescending(p => p.Id).ToListAsync(ct);
            var linkIds = open.Select(p => LinkedId(p.Note)).OfType<long>().ToList();
            var withDraft = (await db.VanDons.AsNoTracking().Where(m => linkIds.Contains(m.Id)).Select(m => m.Id).ToListAsync(ct)).ToHashSet();
            open = open.Where(p => LinkedId(p.Note) is not { } id || !withDraft.Contains(id)).ToList();

            var cids = open.Select(p => p.CustomerId).OfType<long>().Distinct().ToList();
            var names = await db.Customers.AsNoTracking().Where(c => cids.Contains(c.CustomerID)).ToDictionaryAsync(c => c.CustomerID, c => c.CustomerName, ct);
            var uids = open.Select(p => p.StaffId).Distinct().ToList();
            var users = await db.Users.AsNoTracking().Where(u => uids.Contains(u.Id)).ToDictionaryAsync(u => u.Id, ct);
            var s = (search ?? "").Trim();
            var items = open
                .Select(p => new PickupRowDto(p.Id, p.CustomerId, p.CustomerId is { } c ? names.GetValueOrDefault(c) : null, Auth.StaffName(users.GetValueOrDefault(p.StaffId)),
                    p.PickDate, p.SoKienBook ?? 0, p.Note))
                .Where(x => s == "" || x.PickupId.ToString() == s || (x.CustomerName?.Contains(s, StringComparison.OrdinalIgnoreCase) ?? false)
                            || (x.Note?.Contains(s, StringComparison.OrdinalIgnoreCase) ?? false))
                .ToList();
            return Results.Ok(new { items, totalCount = items.Count });
        });

        // Bắt đầu nhận 1 lệnh Pickup: tạo vận đơn nháp + gắn vào lệnh; lệnh đã gắn thì trả vận đơn đó.
        g.MapPost("/{pickupId:int}/start", async (int pickupId, PickupDb db, HttpContext http, TimeProvider clock, CancellationToken ct) =>
        {
            var p = await db.Pickups.AsNoTracking().FirstOrDefaultAsync(x => x.Id == pickupId, ct);
            if (p is null) return Results.NotFound(new { error = "Không tìm thấy lệnh pickup." });
            if (LinkedId(p.Note) is { } lid && await db.VanDons.AnyAsync(m => m.Id == lid, ct)) return Results.Ok(new { id = lid });
            if (p.PickDateEnd is not null) return Results.BadRequest(new { error = "Lệnh pickup này đã chốt." });
            if (p.CustomerId is not > 0) return Results.BadRequest(new { error = "Lệnh pickup chưa có khách hàng — bổ sung khách trong CRM trước." });
            var cust = await db.Customers.AsNoTracking().Where(c => c.CustomerID == p.CustomerId)
                .Select(c => new { c.CustomerName, c.ContactName, c.ContactPhone, c.Phone, c.Tel, c.Address1, c.StaffId }).FirstOrDefaultAsync(ct);
            if (cust is null) return Results.BadRequest(new { error = "Không tìm thấy khách hàng của lệnh pickup." });

            static string? First(params string?[] xs) => xs.FirstOrDefault(x => !string.IsNullOrWhiteSpace(x))?.Trim();
            var uid = Auth.UserId(http);
            var now = clock.GetLocalNow().DateTime;
            var v = new MaVanDon
            {
                // Như vận đơn nháp CRM (xem Bookings create): Status=1, AWB="", CustomerName = SenderName = tên khách.
                CustomerId = p.CustomerId, Status = 1, Awb = "", ConsigneeEmail = "", CustomerName = cust.CustomerName, SenderName = cust.CustomerName,
                SenderContactName = First(cust.ContactName), SenderPhone = First(cust.ContactPhone, cust.Phone, cust.Tel), SenderAddress = First(cust.Address1),
                PickupEst = p.PickDate, SoKien = p.SoKienBook > 0 ? p.SoKienBook : null,
                CustomerStaffId = cust.StaffId, CreateUser = uid, ModifyUser = uid, CreateDate = now.Date, ModifyDate = now.Date,
            };
            // Gắn bằng UPDATE có điều kiện Note cũ: 2 người cùng bấm thì chỉ 1 người tạo được vận đơn, người kia rollback.
            var linked = await db.Database.CreateExecutionStrategy().ExecuteAsync(async () =>
            {
                await using var tx = await db.Database.BeginTransactionAsync(ct);
                db.VanDons.Add(v);
                await db.SaveChangesAsync(ct);
                var note = Bookings.NoteOf(v.Id, p.Note);
                if (note.Length > NoteMax) note = note[..NoteMax];
                var n = p.Note is null
                    ? await db.Database.ExecuteSqlInterpolatedAsync($"UPDATE Pickup SET Note = {note} WHERE Pickup_ID = {pickupId} AND Note IS NULL AND Pick_Date_End IS NULL", ct)
                    : await db.Database.ExecuteSqlInterpolatedAsync($"UPDATE Pickup SET Note = {note} WHERE Pickup_ID = {pickupId} AND Note = {p.Note} AND Pick_Date_End IS NULL", ct);
                if (n == 0) return false;   // dispose không commit ⇒ rollback vận đơn vừa thêm
                await tx.CommitAsync(ct);
                return true;
            });
            return linked ? Results.Ok(new { id = v.Id }) : Results.Conflict(new { error = "Lệnh này vừa được người khác nhận — tải lại danh sách." });
        });
    }
}
