using Microsoft.EntityFrameworkCore;

namespace VietAnPickup;

public sealed record ImageRowDto(long Id, string Barcode, long MaVanDonId, string Code, int? KienSo, string? CustomerName, long? OrderNumber, DateTime? CreateDate, long Size);

/// <summary>
/// Trang "Hình ảnh" của kho: ảnh kiện (AHinhAnh_Order, ImageType DIM) gắn vận đơn, lọc theo ngày chụp / khách / mã.
/// Chỉ đọc — ảnh xem qua /api/pickup-bookings/{id}/kien/{k}/photo.
/// </summary>
public static class Images
{
    /// <summary>Số kiện từ Barcode "B&lt;ID&gt;_k" hoặc "&lt;số bill&gt;_k".</summary>
    internal static int? KienOf(string barcode) =>
        barcode.LastIndexOf('_') is var i and > 0 && int.TryParse(barcode[(i + 1)..], out var k) && k > 0 ? k : null;

    public static void Map(IEndpointRouteBuilder app)
    {
        app.MapGet("/api/images", async (PickupDb db, TimeProvider clock, CancellationToken ct, DateTime? fromDate, DateTime? toDate, string search = "", int page = 1, int pageSize = 48) =>
        {
            var p0 = Math.Max(page, 1);
            var size = Math.Clamp(pageSize, 1, 120);
            var dateTo = (toDate ?? clock.GetLocalNow().DateTime).Date.AddDays(1);
            var dateFrom = (fromDate ?? dateTo.AddDays(-7)).Date;
            var s = (search ?? "").Trim();
            var (codeId, codeOn) = Bookings.ParseCode(s);
            var q = from h in db.HinhAnhs.AsNoTracking()
                    join m in db.VanDons.AsNoTracking() on h.MaVanDonId equals m.Id
                    join d in db.HinhAnhDatas.AsNoTracking() on h.Id equals d.Id
                    where h.ImageType == "DIM" && h.CreateDate >= dateFrom && h.CreateDate < dateTo
                          && (s == "" || (codeId != null && m.Id == codeId) || (codeOn != null && m.OrderNumber == codeOn) || m.CustomerName!.Contains(s) || h.Barcode.Contains(s))
                    select new { h.Id, h.Barcode, MaVanDonId = m.Id, m.CustomerName, m.OrderNumber, h.CreateDate, Size = (long)d.Data.Length };
            var total = await q.CountAsync(ct);
            var rows = await q.OrderByDescending(x => x.Id).Skip((p0 - 1) * size).Take(size).ToListAsync(ct);
            var items = rows.Select(x => new ImageRowDto(x.Id, x.Barcode, x.MaVanDonId, Bookings.Code(x.MaVanDonId), KienOf(x.Barcode), x.CustomerName, x.OrderNumber, x.CreateDate, x.Size)).ToList();
            return Results.Ok(new { items, page = p0, pageSize = size, totalCount = total });
        }).RequireAuthorization();
    }
}
