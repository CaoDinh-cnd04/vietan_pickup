using Microsoft.EntityFrameworkCore;

namespace VietAnPickup;

public sealed record ImageRowDto(long Id, string Barcode, long MaVanDonId, string Code, int? KienSo, string? CustomerName, long? OrderNumber, DateTime? CreateDate, long Size,
    string? ImageType, bool DaNhap);

/// <summary>
/// Trang "Hình ảnh": ảnh gắn vận đơn trong AHinhAnh_Order — DIM (ảnh hàng / kiện) và Other (ảnh hoàn thiện gửi khách),
/// lọc theo ngày chụp, loại, đã nhập kích thước (Status_Nhap), khách / mã. Chỉ đọc; xem ảnh qua /api/images/{ID_Hinh}.
/// </summary>
public static class Images
{
    /// <summary>Số kiện từ Barcode "B&lt;ID&gt;_k" hoặc "&lt;số bill&gt;_k".</summary>
    internal static int? KienOf(string barcode) =>
        barcode.LastIndexOf('_') is var i and > 0 && int.TryParse(barcode[(i + 1)..], out var k) && k > 0 ? k : null;

    /// <summary>Đọc file "photo" (tuỳ chọn) trong form: trả lỗi (tiếng Việt) hoặc null; Photo null = không gửi ảnh.</summary>
    internal static async Task<(string? Error, byte[]? Photo, string? Type)> ReadPhotoAsync(IFormCollection form, CancellationToken ct)
    {
        if (form.Files.GetFile("photo") is not { } file) return (null, null, null);
        if (file.Length is 0 or > Bookings.MaxPhotoBytes) return ($"Ảnh phải từ 1 byte đến {Bookings.MaxPhotoBytes / 1024 / 1024}MB.", null, null);
        using var ms = new MemoryStream((int)file.Length);
        await file.CopyToAsync(ms, ct);
        var bytes = ms.ToArray();
        return Bookings.DetectType(bytes) is { } t ? (null, bytes, t) : ("Chỉ nhận ảnh jpg, png, webp.", null, null);
    }

    /// <summary>
    /// Ghi ảnh vào AHinhAnh_Order + AHinhAnh_Order_Data (ADR-051 CRM): h null ⇒ tạo dòng mới; có ⇒ thay dữ liệu, giữ ID_Hinh (1 tấm/kiện như CRM).
    /// Gọi trong transaction.
    /// </summary>
    internal static async Task<HinhAnh> PutAsync(PickupDb db, HinhAnh? h, string barcode, string imageType, long maVanDonId, byte[] data, string contentType, DateTime now, CancellationToken ct)
    {
        if (h is null)
        {
            var ext = contentType switch { "image/png" => "png", "image/webp" => "webp", _ => "jpg" };
            db.HinhAnhs.Add(h = new HinhAnh { Barcode = barcode, TenHinh = $"{now:yyyyMMdd}-{Guid.NewGuid():N}.{ext}", CreateDate = now, ImageType = imageType, MaVanDonId = maVanDonId });
            await db.SaveChangesAsync(ct);   // cần ID_Hinh cho dòng nhị phân
        }
        else h.Barcode = barcode;
        var d = await db.HinhAnhDatas.FirstOrDefaultAsync(x => x.Id == h.Id, ct);
        if (d is null) db.HinhAnhDatas.Add(d = new HinhAnhData { Id = h.Id });
        d.ContentType = contentType; d.Data = data; d.CreateDate = now;
        return h;
    }

    /// <summary>Trả nhị phân ảnh (null ⇒ 404).</summary>
    internal static async Task<IResult> ServeAsync(PickupDb db, long? idHinh, HttpContext http, CancellationToken ct)
    {
        var a = idHinh is { } id ? await db.HinhAnhDatas.AsNoTracking().Where(d => d.Id == id).Select(d => new { d.Data, d.ContentType }).FirstOrDefaultAsync(ct) : null;
        if (a is null) return Results.NotFound();
        http.Response.Headers.CacheControl = "private, max-age=60";
        http.Response.Headers["X-Content-Type-Options"] = "nosniff";
        return Results.File(a.Data, a.ContentType);
    }

    public static void Map(IEndpointRouteBuilder app)
    {
        app.MapGet("/api/images", async (PickupDb db, TimeProvider clock, CancellationToken ct, DateTime? fromDate, DateTime? toDate, string search = "", string type = "", int nhap = -1, int page = 1, int pageSize = 48) =>
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
                    where (type == "" ? h.ImageType == "DIM" || h.ImageType == "Other" : h.ImageType == type) && h.CreateDate >= dateFrom && h.CreateDate < dateTo
                          && (nhap == -1 || (nhap == 1 ? h.StatusNhap == 1 : h.StatusNhap == null || h.StatusNhap != 1))
                          && (s == "" || (codeId != null && m.Id == codeId) || (codeOn != null && m.OrderNumber == codeOn) || m.CustomerName!.Contains(s) || h.Barcode.Contains(s))
                    select new { h.Id, h.Barcode, MaVanDonId = m.Id, m.CustomerName, m.OrderNumber, h.CreateDate, Size = (long)d.Data.Length, h.ImageType, h.StatusNhap };
            var total = await q.CountAsync(ct);
            var rows = await q.OrderByDescending(x => x.Id).Skip((p0 - 1) * size).Take(size).ToListAsync(ct);
            var items = rows.Select(x => new ImageRowDto(x.Id, x.Barcode, x.MaVanDonId, Bookings.Code(x.MaVanDonId), KienOf(x.Barcode), x.CustomerName, x.OrderNumber, x.CreateDate, x.Size,
                x.ImageType, x.StatusNhap == 1)).ToList();
            return Results.Ok(new { items, page = p0, pageSize = size, totalCount = total });
        }).RequireAuthorization();

        // Xem 1 ảnh theo ID_Hinh (mọi loại: DIM, Other).
        app.MapGet("/api/images/{idHinh:long}", (long idHinh, PickupDb db, HttpContext http, CancellationToken ct) => ServeAsync(db, idHinh, http, ct)).RequireAuthorization();
    }
}
