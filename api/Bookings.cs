using Microsoft.EntityFrameworkCore;

namespace VietAnPickup;

public sealed record BookingLineRequest(string? MoTa, int SoKien = 1, decimal? KgDuKien = null);
public sealed record CreateBookingRequest(long CustomerId, BookingLineRequest[]? Lines, string? ContactName = null, string? ContactPhone = null,
    string? PickupAddress = null, DateTime? PlanDate = null, string? Note = null);

public sealed record LineDto(long Id, string? MoTa, int SoKien, decimal? KgDuKien, long? MaVanDonId);
public sealed record KienDto(int KienSo, int Dai, int Rong, int Cao, decimal TrongLuong, decimal QuiDoi, decimal ChargeWeight, bool HasPhoto);
public sealed record RowDto(long Id, string Code, long CustomerId, string? CustomerName, int StaffId, string StaffName, DateTime? PlanDate,
    int TrangThai, DateTime CreateDate, int TongSoKien, decimal? TongKg, string? Note);
public sealed record DetailDto(long Id, string Code, long CustomerId, string? CustomerName, string? CustomerPhone, int StaffId, string StaffName,
    string? ContactName, string? ContactPhone, string? PickupAddress, DateTime? PlanDate, string? Note, int TrangThai, DateTime CreateDate,
    DateTime? ReceivedDate, IReadOnlyList<LineDto> Lines, IReadOnlyList<KienDto> Kiens);

/// <summary>
/// Book pickup + kho nhận hàng. QR CHỈ chứa mã PK… (tên khách/nhân viên tra từ DB khi quét). Mỗi kiện kho nhận = ảnh + dài/rộng/cao/cân trong MỘT yêu cầu;
/// server tự tính quy đổi + cân tính cước; đủ số kiện khai thì tự chuyển "kho đã nhận".
/// </summary>
public static class Bookings
{
    public const long MaxPhotoBytes = 8 * 1024 * 1024;

    /// <summary>Công thức JS legacy: dài×rộng×cao/5000, làm tròn lên rồi lùi 0,5 nếu gần hơn.</summary>
    internal static decimal QuiDoi(int dai, int rong, int cao)
    {
        var raw = (decimal)dai * rong * cao / 5000m;
        var up = Math.Ceiling(raw);
        return up - 0.5m > raw ? up - 0.5m : up;
    }

    /// <summary>Loại ảnh theo chữ ký đầu file (không tin đuôi/MIME do client gửi); null nếu không phải jpg/png/webp.</summary>
    internal static string? DetectType(ReadOnlySpan<byte> h) =>
        h.Length >= 3 && h[0] == 0xFF && h[1] == 0xD8 && h[2] == 0xFF ? "image/jpeg"
        : h.Length >= 8 && h[..8].SequenceEqual(new byte[] { 0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A }) ? "image/png"
        : h.Length >= 12 && h[..4].SequenceEqual("RIFF"u8) && h[8..12].SequenceEqual("WEBP"u8) ? "image/webp"
        : null;

    private static IResult Bad(string msg) => Results.BadRequest(new { error = msg });
    private static IResult Missing() => Results.NotFound(new { error = "Không tìm thấy lệnh book pickup." });

    private static Dictionary<string, string[]>? ValidateCreate(CreateBookingRequest r)
    {
        var e = new Dictionary<string, string[]>();
        if (r.CustomerId <= 0) e["customerId"] = ["Chọn khách hàng."];
        if (r.Lines is null || r.Lines.Length == 0) e["lines"] = ["Khai ít nhất 1 dòng hàng."];
        else if (r.Lines.Length > 50) e["lines"] = ["Tối đa 50 dòng hàng."];
        else if (r.Lines.Any(l => l.SoKien is < 1 or > 9999)) e["lines"] = ["Số kiện từ 1 đến 9999."];
        else if (r.Lines.Any(l => (l.MoTa?.Length ?? 0) > 300 || l.KgDuKien is < 0 or > 99999)) e["lines"] = ["Mô tả tối đa 300 ký tự, cân từ 0 đến 99999."];
        if ((r.ContactName?.Length ?? 0) > 200 || (r.ContactPhone?.Length ?? 0) > 100 || (r.PickupAddress?.Length ?? 0) > 500 || (r.Note?.Length ?? 0) > 300)
            e["text"] = ["Thông tin liên hệ, địa chỉ hoặc ghi chú quá dài."];
        return e.Count == 0 ? null : e;
    }

    private static async Task<IResult> LoadAsync(PickupDb db, IQueryable<PickupBooking> q, CancellationToken ct)
    {
        var b = await q.AsNoTracking().Include(x => x.Lines).FirstOrDefaultAsync(ct);
        if (b is null) return Missing();
        var c = await db.Customers.AsNoTracking().Where(x => x.CustomerID == b.CustomerId).Select(x => new { x.CustomerName, x.Phone, x.Tel }).FirstOrDefaultAsync(ct);
        var u = await db.Users.AsNoTracking().FirstOrDefaultAsync(x => x.Id == b.StaffId, ct);
        var photos = (await db.Anhs.AsNoTracking().Where(x => x.BookingId == b.Id).Select(x => x.KienSo).ToListAsync(ct)).ToHashSet();   // chỉ số kiện, không kéo nhị phân
        var kiens = await db.Kiens.AsNoTracking().Where(x => x.BookingId == b.Id).OrderBy(x => x.KienSo).ToListAsync(ct);
        return Results.Ok(new DetailDto(b.Id, b.Code, b.CustomerId, c?.CustomerName, c?.Phone ?? c?.Tel, b.StaffId, Auth.StaffName(u), b.ContactName, b.ContactPhone,
            b.PickupAddress, b.PlanDate, b.Note, b.TrangThai, b.CreateDate, b.ReceivedDate,
            b.Lines.OrderBy(l => l.Id).Select(l => new LineDto(l.Id, l.MoTa, l.SoKien, l.KgDuKien, l.MaVanDonId)).ToList(),
            kiens.Select(k => new KienDto(k.KienSo, k.Dai, k.Rong, k.Cao, k.TrongLuong, k.QuiDoi, k.ChargeWeight, photos.Contains(k.KienSo))).ToList()));
    }

    public static void Map(IEndpointRouteBuilder app)
    {
        var g = app.MapGroup("/api/pickup-bookings").RequireAuthorization();

        // Khách tìm nhanh cho ô chọn khách (đọc TCustomer).
        app.MapGet("/api/customers", async (PickupDb db, string? searchText, int pageSize, CancellationToken ct) =>
        {
            var s = (searchText ?? "").Trim();
            if (s.Length < 2) return Results.Ok(new { items = Array.Empty<object>() });
            var items = await db.Customers.AsNoTracking().Where(c => c.IsDeleted != true && (c.CustomerName!.Contains(s) || c.CustomerCode!.Contains(s)))
                .OrderBy(c => c.CustomerName).Take(Math.Clamp(pageSize, 1, 20))
                .Select(c => new { customerID = c.CustomerID, customerCode = c.CustomerCode, customerName = c.CustomerName }).ToListAsync(ct);
            return Results.Ok(new { items });
        }).RequireAuthorization();

        g.MapPost("", async (CreateBookingRequest r, PickupDb db, HttpContext http, TimeProvider clock, CancellationToken ct) =>
        {
            if (ValidateCreate(r) is { } err) return Results.ValidationProblem(err);
            var cust = await db.Customers.AsNoTracking().Where(c => c.CustomerID == r.CustomerId)
                .Select(c => new { c.ContactName, c.ContactPhone, c.Phone, c.Tel, c.Address1 }).FirstOrDefaultAsync(ct);
            if (cust is null) return Results.ValidationProblem(new Dictionary<string, string[]> { ["customerId"] = ["Không tìm thấy khách hàng."] });

            // Để trống thì tự lấy từ hồ sơ khách (đỡ gõ tay); nhập tay thì giữ nguyên.
            static string? Pick(string? typed, params string?[] fallback) =>
                !string.IsNullOrWhiteSpace(typed) ? typed.Trim() : fallback.FirstOrDefault(x => !string.IsNullOrWhiteSpace(x))?.Trim();
            var b = new PickupBooking
            {
                CustomerId = r.CustomerId, StaffId = Auth.UserId(http), CreateDate = clock.GetLocalNow().DateTime, TrangThai = 0,
                ContactName = Pick(r.ContactName, cust.ContactName), ContactPhone = Pick(r.ContactPhone, cust.ContactPhone, cust.Phone, cust.Tel),
                PickupAddress = Pick(r.PickupAddress, cust.Address1), PlanDate = r.PlanDate, Note = r.Note?.Trim(),
                Lines = r.Lines!.Select(l => new PickupBookingLine { MoTa = l.MoTa?.Trim(), SoKien = l.SoKien, KgDuKien = l.KgDuKien }).ToList(),
            };
            db.Bookings.Add(b);
            await db.SaveChangesAsync(ct);
            return Results.Created($"/api/pickup-bookings/{b.Id}", new { id = b.Id, code = b.Code });
        });

        g.MapGet("", async (PickupDb db, DateTime? fromDate, DateTime? toDate, CancellationToken ct, int status = -1, string search = "", int page = 1, int pageSize = 25) =>
        {
            var p = Math.Max(page, 1);
            var size = Math.Clamp(pageSize, 1, 200);
            var dateTo = (toDate ?? DateTime.Today).Date.AddDays(1).AddTicks(-1);
            var dateFrom = (fromDate ?? dateTo.Date.AddDays(-30)).Date;
            var s = (search ?? "").Trim();
            var q = from b in db.Bookings.AsNoTracking()
                    join c in db.Customers.AsNoTracking() on b.CustomerId equals c.CustomerID into cj
                    from c in cj.DefaultIfEmpty()
                    join u in db.Users.AsNoTracking() on b.StaffId equals u.Id into uj
                    from u in uj.DefaultIfEmpty()
                    where b.CreateDate >= dateFrom && b.CreateDate <= dateTo && (status == -1 || b.TrangThai == status)
                          && (s == "" || b.Code.Contains(s) || (c != null && c.CustomerName!.Contains(s)) || (u != null && (u.FirstName!.Contains(s) || u.LastName!.Contains(s) || u.UserName!.Contains(s))))
                    select new { b, c, u };
            var total = await q.CountAsync(ct);
            var rows = await q.OrderByDescending(x => x.b.Id).Skip((p - 1) * size).Take(size).ToListAsync(ct);
            var ids = rows.Select(x => x.b.Id).ToList();
            var sums = await db.Lines.AsNoTracking().Where(l => ids.Contains(l.BookingId))
                .GroupBy(l => l.BookingId).Select(x => new { x.Key, Kien = x.Sum(l => l.SoKien), Kg = x.Sum(l => l.KgDuKien) }).ToDictionaryAsync(x => x.Key, ct);
            var items = rows.Select(x => new RowDto(x.b.Id, x.b.Code, x.b.CustomerId, x.c?.CustomerName, x.b.StaffId, Auth.StaffName(x.u), x.b.PlanDate, x.b.TrangThai,
                x.b.CreateDate, sums.TryGetValue(x.b.Id, out var t) ? t.Kien : 0, sums.TryGetValue(x.b.Id, out var t2) ? t2.Kg : null, x.b.Note)).ToList();
            return Results.Ok(new { items, page = p, pageSize = size, totalCount = total });
        });

        g.MapGet("/{id:long}", (long id, PickupDb db, CancellationToken ct) => LoadAsync(db, db.Bookings.Where(b => b.Id == id), ct));

        g.MapGet("/by-code/{code}", (string code, PickupDb db, CancellationToken ct) =>
        {
            var c = new string((code ?? "").Where(ch => !char.IsWhiteSpace(ch)).ToArray()).ToUpperInvariant();   // không phân biệt hoa thường/khoảng trắng
            return c.Length is 0 or > 20
                ? Task.FromResult(Results.NotFound(new { error = "Mã pickup không hợp lệ." }))
                : LoadAsync(db, db.Bookings.Where(b => b.Code == c), ct);
        });

        g.MapPost("/{id:long}/cancel", async (long id, PickupDb db, CancellationToken ct) =>
        {
            var b = await db.Bookings.FirstOrDefaultAsync(x => x.Id == id, ct);
            if (b is null) return Missing();
            if (b.TrangThai != 0) return Bad("Chỉ huỷ được lệnh chưa nhận kho.");
            b.TrangThai = 2;
            await db.SaveChangesAsync(ct);
            return Results.Ok(new { id = b.Id, trangThai = b.TrangThai });
        });

        g.MapPost("/{id:long}/kien", async (long id, HttpRequest req, PickupDb db, TimeProvider clock, CancellationToken ct) =>
        {
            if (!req.HasFormContentType) return Bad("Cần gửi multipart/form-data.");
            IFormCollection form;
            try { form = await req.ReadFormAsync(ct); }
            catch (InvalidDataException) { return Bad("Dữ liệu tải lên không hợp lệ."); }

            static bool Int(string? s, int min, int max, out int v) => int.TryParse(s, out v) && v >= min && v <= max;
            if (!Int(form["kienSo"], 1, 9999, out var kien)) return Bad("Số kiện từ 1 đến 9999.");
            if (!Int(form["dai"], 1, 999, out var dai) || !Int(form["rong"], 1, 999, out var rong) || !Int(form["cao"], 1, 999, out var cao))
                return Bad("Dài, rộng, cao là số nguyên từ 1 đến 999 (cm).");
            if (!decimal.TryParse(form["trongLuong"], System.Globalization.NumberStyles.Number, System.Globalization.CultureInfo.InvariantCulture, out var tl) || tl < 0 || tl > 99999)
                return Bad("Cân nặng từ 0 đến 99999 kg.");

            byte[]? photo = null; string? type = null;
            var file = form.Files.GetFile("photo");
            if (file is not null)
            {
                if (file.Length is 0 or > MaxPhotoBytes) return Bad($"Ảnh phải từ 1 byte đến {MaxPhotoBytes / 1024 / 1024}MB.");
                using var ms = new MemoryStream((int)file.Length);
                await file.CopyToAsync(ms, ct);
                photo = ms.ToArray();
                type = DetectType(photo);
                if (type is null) return Bad("Chỉ nhận ảnh jpg, png, webp.");
            }

            var b = await db.Bookings.Include(x => x.Lines).FirstOrDefaultAsync(x => x.Id == id, ct);
            if (b is null) return Missing();
            if (b.TrangThai == 2) return Bad("Lệnh đã huỷ.");

            var staff = Auth.UserId(req.HttpContext);
            var qd = QuiDoi(dai, rong, cao);
            var cw = Math.Max(tl, qd);
            var now = clock.GetLocalNow().DateTime;
            var row = await db.Kiens.FirstOrDefaultAsync(x => x.BookingId == id && x.KienSo == kien, ct);
            if (row is null) db.Kiens.Add(row = new PickupBookingKien { BookingId = id, KienSo = kien, CreateDate = now });
            row.Dai = dai; row.Rong = rong; row.Cao = cao; row.TrongLuong = tl; row.QuiDoi = qd; row.ChargeWeight = cw; row.CreateBy = staff;
            if (photo is not null)
            {
                var a = await db.Anhs.FirstOrDefaultAsync(x => x.BookingId == id && x.KienSo == kien, ct);
                if (a is null) db.Anhs.Add(a = new PickupBookingKienAnh { BookingId = id, KienSo = kien });
                a.ContentType = type!; a.Data = photo;
            }
            await db.SaveChangesAsync(ct);   // kiện + ảnh đi cùng một lần lưu (FK ảnh → kiện)

            var daNhan = await db.Kiens.CountAsync(x => x.BookingId == id, ct);
            var daKhai = b.Lines.Sum(l => l.SoKien);
            if (daNhan >= daKhai && b.TrangThai == 0)
            {
                b.TrangThai = 1; b.ReceivedDate = now; b.ReceivedBy = staff;
                await db.SaveChangesAsync(ct);
            }
            return Results.Ok(new { kienSo = kien, quiDoi = qd, chargeWeight = cw, daNhan, daKhai, done = b.TrangThai == 1 });
        }).DisableAntiforgery().WithMetadata(new Microsoft.AspNetCore.Mvc.RequestSizeLimitAttribute(MaxPhotoBytes + 1024 * 1024));

        g.MapGet("/{id:long}/kien/{kienSo:int}/photo", async (long id, int kienSo, PickupDb db, HttpContext http, CancellationToken ct) =>
        {
            var a = await db.Anhs.AsNoTracking().Where(x => x.BookingId == id && x.KienSo == kienSo).Select(x => new { x.Data, x.ContentType }).FirstOrDefaultAsync(ct);
            if (a is null) return Results.NotFound();
            http.Response.Headers.CacheControl = "private, max-age=3600";
            http.Response.Headers["X-Content-Type-Options"] = "nosniff";
            return Results.File(a.Data, a.ContentType);
        });

        g.MapPost("/{id:long}/receive", async (long id, HttpContext http, PickupDb db, TimeProvider clock, CancellationToken ct) =>
        {
            var b = await db.Bookings.FirstOrDefaultAsync(x => x.Id == id, ct);
            if (b is null) return Missing();
            if (b.TrangThai == 2) return Bad("Lệnh đã huỷ.");
            if (!await db.Kiens.AnyAsync(x => x.BookingId == id, ct)) return Bad("Chưa nhận kiện nào.");
            if (b.TrangThai == 0)
            {
                b.TrangThai = 1; b.ReceivedDate = clock.GetLocalNow().DateTime; b.ReceivedBy = Auth.UserId(http);
                await db.SaveChangesAsync(ct);
            }
            return Results.Ok(new { id = b.Id, trangThai = b.TrangThai });
        });
    }
}
