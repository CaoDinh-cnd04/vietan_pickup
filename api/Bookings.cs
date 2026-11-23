using Microsoft.EntityFrameworkCore;

namespace VietAnPickup;

public sealed record CreateBookingRequest(long CustomerId, int SoKien = 0, decimal? KgDuKien = null, string? TenHang = null, string? ContactName = null,
    string? ContactPhone = null, string? PickupAddress = null, DateTime? PlanDate = null, string? Note = null, bool TaiKho = false);

public sealed record KienDto(int KienSo, string Loai, int Dai, int Rong, int Cao, decimal TrongLuong, decimal QuiDoi, decimal ChargeWeight, bool HasPhoto);
public sealed record RowDto(long Id, string Code, long? CustomerId, string? CustomerName, string StaffName, DateTime? PlanDate, int TrangThai,
    DateTime? CreateDate, int SoKienBook, int SoKienNhan, decimal? Kg, string? TenHang, long? OrderNumber);
public sealed record DetailDto(long Id, string Code, long? CustomerId, string? CustomerName, string? CustomerPhone, string StaffName,
    string? ContactName, string? ContactPhone, string? PickupAddress, DateTime? PlanDate, string? TenHang, string? Note, int TrangThai, DateTime? CreateDate,
    DateTime? ReceivedDate, int SoKienBook, decimal? KgDuKien, long? OrderNumber, IReadOnlyList<KienDto> Kiens);

/// <summary>
/// Book pickup + kho nhận hàng trên BẢNG CRM (không bảng riêng):
/// book = vận đơn nháp MaVanDon (mã quét B&lt;ID&gt;, kiện B&lt;ID&gt;/k — CRM hiểu dạng này, ADR-050) + 1 dòng Pickup (Note = B&lt;ID&gt;);
/// khách mang hàng tới kho = như trên nhưng không khai số kiện, kho chốt tay. Mỗi kiện kho nhận = 1 dòng MaVanDon_PCS_DIM (kiện k = dòng thứ k theo ID)
/// + ảnh AHinhAnh_Order (B&lt;ID&gt;_k, DIM) / AHinhAnh_Order_Data. Kinh doanh mở bill nháp trong CRM, bổ sung người nhận rồi In (CRM cấp số bill, khoá sửa).
/// Trạng thái suy ra: 0 chờ lấy · 1 đang nhận · 2 kho đã nhận · 3 đã lập bill.
/// </summary>
public static class Bookings
{
    public const long MaxPhotoBytes = 8 * 1024 * 1024;
    public const string PrintedMessage = "Bill này đã được in, không được cập nhật lại";   // đúng thông báo CRM/legacy
    private static readonly string[] Loais = ["CARTON", "TUI"];

    public static string Code(long id) => $"B{id}";
    private static string NoteOf(long id, string? note) => string.IsNullOrWhiteSpace(note) ? Code(id) : $"{Code(id)} - {note.Trim()}";
    private static string? UserNote(long id, string? note) => note is { } n && n.StartsWith(Code(id) + " - ") ? n[(Code(id).Length + 3)..] : null;

    /// <summary>Công thức legacy: dài×rộng×cao/5000, làm tròn lên theo bước 0,5 (đúng x.5 → lên số nguyên kế tiếp).</summary>
    internal static decimal QuiDoi(int dai, int rong, int cao)
    {
        var raw = (decimal)dai * rong * cao / 5000m;
        var up = Math.Ceiling(raw);
        return up - 0.5m > raw ? up - 0.5m : up;
    }

    /// <summary>Chuẩn hoá mã quét như CRM resolve-code: bỏ khoảng trắng, '_'→'/'. "B123[/k]" = vận đơn nháp; 7 số = số bill Việt An.</summary>
    internal static (long? Id, long? OrderNumber) ParseCode(string? raw)
    {
        var c = new string((raw ?? "").Where(ch => !char.IsWhiteSpace(ch)).ToArray()).Replace('_', '/').ToUpperInvariant();
        var head = c.Split('/')[0];
        if (head.Length > 1 && head[0] == 'B' && long.TryParse(head[1..], out var id) && id > 0) return (id, null);
        if (head.Length == 7 && long.TryParse(head, out var on)) return (null, on);
        return (null, null);
    }

    internal static string? DetectType(ReadOnlySpan<byte> h) =>
        h.Length >= 3 && h[0] == 0xFF && h[1] == 0xD8 && h[2] == 0xFF ? "image/jpeg"
        : h.Length >= 8 && h[..8].SequenceEqual(new byte[] { 0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A }) ? "image/png"
        : h.Length >= 12 && h[..4].SequenceEqual("RIFF"u8) && h[8..12].SequenceEqual("WEBP"u8) ? "image/webp"
        : null;

    internal static int StatusOf(long? orderNumber, DateTime? receivedDate, int dims) => orderNumber is > 0 ? 3 : receivedDate is not null ? 2 : dims > 0 ? 1 : 0;

    private static IResult Bad(string msg) => Results.BadRequest(new { error = msg });
    private static IResult Missing() => Results.NotFound(new { error = "Không tìm thấy lệnh pickup / vận đơn." });

    private static Task<Pickup?> FindPickup(PickupDb db, long id)
    {
        var code = Code(id);
        return db.Pickups.Where(p => p.Note == code || p.Note!.StartsWith(code + " - ")).OrderByDescending(p => p.Id).FirstOrDefaultAsync();
    }

    /// <summary>Transaction chạy trong execution strategy (bắt buộc khi bật EnableRetryOnFailure).</summary>
    private static Task<T> InTx<T>(PickupDb db, Func<Task<T>> work, CancellationToken ct) =>
        db.Database.CreateExecutionStrategy().ExecuteAsync(async () =>
        {
            await using var tx = await db.Database.BeginTransactionAsync(ct);
            var r = await work();
            await tx.CommitAsync(ct);
            return r;
        });

    private static Dictionary<string, string[]>? ValidateCreate(CreateBookingRequest r)
    {
        var e = new Dictionary<string, string[]>();
        if (r.CustomerId <= 0) e["customerId"] = ["Chọn khách hàng."];
        if (r.TaiKho ? r.SoKien is < 0 or > 9999 : r.SoKien is < 1 or > 9999) e["soKien"] = ["Số kiện từ 1 đến 9999."];
        if (r.KgDuKien is < 0 or > 99999) e["kgDuKien"] = ["Cân dự kiến từ 0 đến 99999 kg."];
        if ((r.TenHang?.Length ?? 0) > 300 || (r.ContactName?.Length ?? 0) > 200 || (r.ContactPhone?.Length ?? 0) > 100
            || (r.PickupAddress?.Length ?? 0) > 1000 || (r.Note?.Length ?? 0) > 250)
            e["text"] = ["Tên hàng, liên hệ, địa chỉ hoặc ghi chú quá dài."];
        return e.Count == 0 ? null : e;
    }

    private static async Task<IResult> LoadAsync(PickupDb db, long id, CancellationToken ct)
    {
        var v = await db.VanDons.AsNoTracking().FirstOrDefaultAsync(x => x.Id == id, ct);
        if (v is null) return Missing();
        var p = await FindPickup(db, id);
        var c = await db.Customers.AsNoTracking().Where(x => x.CustomerID == v.CustomerId).Select(x => new { x.CustomerName, x.Phone, x.Tel }).FirstOrDefaultAsync(ct);
        var u = await db.Users.AsNoTracking().FirstOrDefaultAsync(x => x.Id == v.CreateUser, ct);
        var dims = await db.Dims.AsNoTracking().Where(d => d.MaVanDonId == (int)id).OrderBy(d => d.Id).ToListAsync(ct);
        var photos = (await (from h in db.HinhAnhs.AsNoTracking()
                             join d in db.HinhAnhDatas.AsNoTracking() on h.Id equals d.Id
                             where h.MaVanDonId == id && h.ImageType == "DIM"
                             select h.Barcode).ToListAsync(ct)).ToHashSet();
        bool HasPhoto(int k) => photos.Contains($"{Code(id)}_{k}") || (v.OrderNumber is > 0 && photos.Contains($"{v.OrderNumber}_{k}"));
        var kiens = dims.Select((d, i) => new KienDto(i + 1, d.Loai, d.Dai, d.Rong, d.Cao, d.TrongLuong, d.QuiDoi ?? 0, d.ChargeWeight ?? 0, HasPhoto(i + 1))).ToList();
        return Results.Ok(new DetailDto(v.Id, Code(v.Id), v.CustomerId, c?.CustomerName ?? v.CustomerName, c?.Phone ?? c?.Tel, Auth.StaffName(u),
            v.SenderContactName, v.SenderPhone, v.SenderAddress, v.PickupEst, v.TenHang, UserNote(id, p?.Note),
            StatusOf(v.OrderNumber, p?.PickDateEnd, dims.Count), p?.PickDate ?? v.CreateDate, p?.PickDateEnd,
            p?.SoKienBook ?? v.SoKien ?? 0, dims.Count == 0 ? v.TrongLuong : null, v.OrderNumber, kiens));
    }

    public static void Map(IEndpointRouteBuilder app)
    {
        var g = app.MapGroup("/api/pickup-bookings").RequireAuthorization();

        app.MapGet("/api/customers", async (PickupDb db, string? searchText, int pageSize, CancellationToken ct) =>
        {
            var s = (searchText ?? "").Trim();
            if (s.Length < 2) return Results.Ok(new { items = Array.Empty<object>() });
            var items = await db.Customers.AsNoTracking().Where(c => c.IsDeleted != true && (c.CustomerName!.Contains(s) || c.CustomerCode!.Contains(s)))
                .OrderBy(c => c.CustomerName).Take(Math.Clamp(pageSize, 1, 20))
                .Select(c => new { customerID = c.CustomerID, customerCode = c.CustomerCode, customerName = c.CustomerName }).ToListAsync(ct);
            return Results.Ok(new { items });
        }).RequireAuthorization();

        // Book pickup (hoặc khách mang tới kho): vận đơn nháp + dòng Pickup, cùng 1 transaction.
        g.MapPost("", async (CreateBookingRequest r, PickupDb db, HttpContext http, TimeProvider clock, CancellationToken ct) =>
        {
            if (ValidateCreate(r) is { } err) return Results.ValidationProblem(err);
            var cust = await db.Customers.AsNoTracking().Where(c => c.CustomerID == r.CustomerId)
                .Select(c => new { c.CustomerName, c.ContactName, c.ContactPhone, c.Phone, c.Tel, c.Address1, c.StaffId }).FirstOrDefaultAsync(ct);
            if (cust is null) return Results.ValidationProblem(new Dictionary<string, string[]> { ["customerId"] = ["Không tìm thấy khách hàng."] });

            static string? Pick(string? typed, params string?[] fallback) =>
                !string.IsNullOrWhiteSpace(typed) ? typed.Trim() : fallback.FirstOrDefault(x => !string.IsNullOrWhiteSpace(x))?.Trim();
            var uid = Auth.UserId(http);
            var now = clock.GetLocalNow().DateTime;
            var v = new MaVanDon
            {
                // Như CRM tạo vận đơn nháp: Status=1, AWB="", CustomerName = SenderName = tên khách, Customer_Staff_ID = NV phụ trách khách.
                CustomerId = r.CustomerId, Status = 1, Awb = "", ConsigneeEmail = "", CustomerName = cust.CustomerName, SenderName = cust.CustomerName,
                SenderContactName = Pick(r.ContactName, cust.ContactName), SenderPhone = Pick(r.ContactPhone, cust.ContactPhone, cust.Phone, cust.Tel),
                SenderAddress = r.TaiKho ? null : Pick(r.PickupAddress, cust.Address1), PickupEst = r.TaiKho ? now : r.PlanDate,
                TenHang = r.TenHang?.Trim(), SoKien = r.SoKien > 0 ? r.SoKien : null, TrongLuong = r.KgDuKien,
                CustomerStaffId = cust.StaffId, CreateUser = uid, ModifyUser = uid, CreateDate = now.Date, ModifyDate = now.Date,
            };
            await InTx(db, async () =>
            {
                db.VanDons.Add(v);
                await db.SaveChangesAsync(ct);
                db.Pickups.Add(new Pickup { StaffId = uid, CustomerId = r.CustomerId, SoKienBook = r.SoKien, SoKienNhan = 0, PickDate = now, Note = NoteOf(v.Id, r.Note) });
                await db.SaveChangesAsync(ct);
                return true;
            }, ct);
            return Results.Created($"/api/pickup-bookings/{v.Id}", new { id = v.Id, code = Code(v.Id) });
        });

        // Danh sách: vận đơn nháp + vận đơn có lệnh pickup (kể cả đã in bill) trong khoảng ngày.
        g.MapGet("", async (PickupDb db, DateTime? fromDate, DateTime? toDate, CancellationToken ct, int status = -1, string @group = "", string search = "", int page = 1, int pageSize = 25) =>
        {
            var p0 = Math.Max(page, 1);
            var size = Math.Clamp(pageSize, 1, 200);
            var dateTo = (toDate ?? DateTime.Today).Date;
            var dateFrom = (fromDate ?? dateTo.AddDays(-30)).Date;
            var s = (search ?? "").Trim();
            var (codeId, codeOn) = ParseCode(s);
            var q = from m in db.VanDons.AsNoTracking()
                    let pk = db.Pickups.Where(p => p.Note == "B" + m.Id.ToString() || p.Note!.StartsWith("B" + m.Id.ToString() + " - ")).OrderByDescending(p => p.Id).FirstOrDefault()
                    let dims = db.Dims.Count(d => d.MaVanDonId == m.Id)
                    let st = m.OrderNumber > 0 ? 3 : pk != null && pk.PickDateEnd != null ? 2 : dims > 0 ? 1 : 0
                    where m.CreateDate >= dateFrom && m.CreateDate <= dateTo && (m.OrderNumber == null || pk != null)
                          && (status == -1 || st == status)
                          && (@group != "can" || st < 2) && (@group != "xong" || st >= 2)   // nhóm cho kho: cần nhận (0,1) · đã nhận (2,3)
                          && (s == "" || (codeId != null && m.Id == codeId) || (codeOn != null && m.OrderNumber == codeOn) || m.CustomerName!.Contains(s) || m.TenHang!.Contains(s))
                    select new { m.Id, m.CustomerId, m.CustomerName, m.CreateUser, m.PickupEst, m.CreateDate, m.SoKien, m.TrongLuong, m.TenHang, m.OrderNumber,
                                 PickDate = (DateTime?)pk!.PickDate, SoKienBook = (int?)pk!.SoKienBook, St = st, Dims = dims };
            var total = await q.CountAsync(ct);
            var rows = await q.OrderByDescending(x => x.Id).Skip((p0 - 1) * size).Take(size).ToListAsync(ct);
            var uids = rows.Select(x => x.CreateUser).Distinct().ToList();
            var users = await db.Users.AsNoTracking().Where(u => uids.Contains(u.Id)).ToDictionaryAsync(u => u.Id, ct);
            var items = rows.Select(x => new RowDto(x.Id, Code(x.Id), x.CustomerId, x.CustomerName, Auth.StaffName(x.CreateUser is { } cu ? users.GetValueOrDefault(cu) : null),
                x.PickupEst, x.St, x.PickDate ?? x.CreateDate, x.SoKienBook ?? x.SoKien ?? 0, x.Dims, x.TrongLuong, x.TenHang, x.OrderNumber)).ToList();
            return Results.Ok(new { items, page = p0, pageSize = size, totalCount = total });
        });

        g.MapGet("/{id:long}", (long id, PickupDb db, CancellationToken ct) => LoadAsync(db, id, ct));

        // Quét QR / mã vạch: B<ID>[/kiện] hoặc số bill 7 số → id vận đơn.
        g.MapGet("/by-code/{code}", async (string code, PickupDb db, CancellationToken ct) =>
        {
            var (id, on) = ParseCode(code);
            long? found = id is not null ? await db.VanDons.Where(m => m.Id == id).Select(m => (long?)m.Id).FirstOrDefaultAsync(ct)
                : on is not null ? await db.VanDons.Where(m => m.OrderNumber == on).OrderByDescending(m => m.Id).Select(m => (long?)m.Id).FirstOrDefaultAsync(ct)
                : null;
            return found is { } f ? Results.Ok(new { id = f }) : Results.NotFound(new { error = $"Không nhận ra mã \"{code}\"." });
        });

        // Huỷ: chỉ lệnh do app này tạo (có dòng Pickup), chưa nhận kiện, chưa in bill — xoá thật vận đơn nháp như CRM "Xóa vận đơn nháp".
        g.MapPost("/{id:long}/cancel", async (long id, PickupDb db, CancellationToken ct) =>
        {
            var v = await db.VanDons.FirstOrDefaultAsync(x => x.Id == id, ct);
            if (v is null) return Missing();
            if (v.OrderNumber is > 0) return Results.Conflict(new { error = PrintedMessage });
            var p = await FindPickup(db, id);
            if (p is null) return Bad("Vận đơn này không do app pickup tạo — xoá trong CRM.");
            if (await db.Dims.AnyAsync(d => d.MaVanDonId == (int)id, ct) || await db.HinhAnhs.AnyAsync(h => h.MaVanDonId == id, ct))
                return Bad("Kho đã nhận kiện — không huỷ được. Sửa hoặc xoá vận đơn trong CRM.");
            await InTx(db, async () =>
            {
                await db.Database.ExecuteSqlInterpolatedAsync($"DELETE FROM MaVanDon_ChiTietHang WHERE MaVanDonID = {id}", ct);
                db.Pickups.Remove(p);
                db.VanDons.Remove(v);
                await db.SaveChangesAsync(ct);
                return true;
            }, ct);
            return Results.Ok(new { id });
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
            var loai = string.IsNullOrEmpty(form["loai"]) ? "CARTON" : form["loai"].ToString().ToUpperInvariant();
            if (!Loais.Contains(loai)) return Bad("Loại kiện là CARTON hoặc TUI.");

            byte[]? photo = null; string? type = null;
            if (form.Files.GetFile("photo") is { } file)
            {
                if (file.Length is 0 or > MaxPhotoBytes) return Bad($"Ảnh phải từ 1 byte đến {MaxPhotoBytes / 1024 / 1024}MB.");
                using var ms = new MemoryStream((int)file.Length);
                await file.CopyToAsync(ms, ct);
                photo = ms.ToArray();
                type = DetectType(photo);
                if (type is null) return Bad("Chỉ nhận ảnh jpg, png, webp.");
            }

            var v = await db.VanDons.FirstOrDefaultAsync(x => x.Id == id, ct);
            if (v is null) return Missing();
            if (v.OrderNumber is > 0) return Results.Conflict(new { error = PrintedMessage });
            var dims = await db.Dims.Where(d => d.MaVanDonId == (int)id).OrderBy(d => d.Id).ToListAsync(ct);
            if (kien > dims.Count + 1) return Bad($"Nhận lần lượt — kiện tiếp theo là {dims.Count + 1}.");

            var staff = Auth.UserId(req.HttpContext);
            var now = clock.GetLocalNow().DateTime;
            var qd = QuiDoi(dai, rong, cao);
            var p = await FindPickup(db, id);
            var r = await InTx(db, async () =>
            {
                var row = kien <= dims.Count ? dims[kien - 1] : null;
                if (row is null) { db.Dims.Add(row = new PcsDim { MaVanDonId = (int)id }); dims.Add(row); }
                row.SoLuong = 1; row.Loai = loai; row.Dai = dai; row.Rong = rong; row.Cao = cao; row.TrongLuong = tl; row.QuiDoi = qd; row.ChargeWeight = Math.Max(tl, qd);

                if (photo is not null)
                {
                    var barcode = $"{Code(id)}_{kien}";
                    var h = await db.HinhAnhs.Where(x => x.MaVanDonId == id && x.Barcode == barcode && x.ImageType == "DIM").OrderByDescending(x => x.Id).FirstOrDefaultAsync(ct);
                    if (h is null)
                    {
                        var ext = type switch { "image/png" => "png", "image/webp" => "webp", _ => "jpg" };
                        db.HinhAnhs.Add(h = new HinhAnh { Barcode = barcode, TenHinh = $"{now:yyyyMMdd}-{Guid.NewGuid():N}.{ext}", CreateDate = now, ImageType = "DIM", MaVanDonId = id });
                        await db.SaveChangesAsync(ct);   // cần ID_Hinh cho dòng nhị phân
                    }
                    var data = await db.HinhAnhDatas.FirstOrDefaultAsync(x => x.Id == h.Id, ct);
                    if (data is null) db.HinhAnhDatas.Add(data = new HinhAnhData { Id = h.Id });
                    data.ContentType = type!; data.Data = photo; data.CreateDate = now;
                }

                if (p is null) db.Pickups.Add(p = new Pickup { CustomerId = v.CustomerId, SoKienBook = v.SoKien ?? 0, PickDate = now, Note = Code(id) });   // vận đơn nháp tạo từ CRM
                var count = dims.Count;
                var kg = dims.Sum(d => d.TrongLuong);
                p.StaffId = staff; p.SoKienNhan = count; p.TongKg = kg;
                if (p.PickDateEnd is null && p.SoKienBook > 0 && count >= p.SoKienBook) p.PickDateEnd = now;   // đủ số kiện khai ⇒ tự chốt
                v.SoKien = p.PickDateEnd is not null ? count : Math.Max(p.SoKienBook ?? 0, count);
                v.TrongLuong = kg; v.ModifyUser = staff; v.ModifyDate = now.Date;
                await db.SaveChangesAsync(ct);
                return new { kienSo = kien, quiDoi = qd, chargeWeight = Math.Max(tl, qd), daNhan = count, daKhai = p.SoKienBook ?? 0, done = p.PickDateEnd is not null };
            }, ct);
            return Results.Ok(r);
        }).DisableAntiforgery().WithMetadata(new Microsoft.AspNetCore.Mvc.RequestSizeLimitAttribute(MaxPhotoBytes + 1024 * 1024));

        g.MapGet("/{id:long}/kien/{kienSo:int}/photo", async (long id, int kienSo, PickupDb db, HttpContext http, CancellationToken ct) =>
        {
            var on = await db.VanDons.Where(m => m.Id == id).Select(m => m.OrderNumber).FirstOrDefaultAsync(ct);
            string b1 = $"{Code(id)}_{kienSo}", b2 = $"{on}_{kienSo}";
            var a = await (from h in db.HinhAnhs.AsNoTracking()
                           join d in db.HinhAnhDatas.AsNoTracking() on h.Id equals d.Id
                           where h.MaVanDonId == id && h.ImageType == "DIM" && (h.Barcode == b1 || h.Barcode == b2)
                           orderby h.Id descending
                           select new { d.Data, d.ContentType }).FirstOrDefaultAsync(ct);
            if (a is null) return Results.NotFound();
            http.Response.Headers.CacheControl = "private, max-age=3600";
            http.Response.Headers["X-Content-Type-Options"] = "nosniff";
            return Results.File(a.Data, a.ContentType);
        });

        // Chốt "kho đã nhận" khi số kiện thực khác số khai (hoặc khách mang tới kho, không khai trước).
        g.MapPost("/{id:long}/receive", async (long id, HttpContext http, PickupDb db, TimeProvider clock, CancellationToken ct) =>
        {
            var v = await db.VanDons.FirstOrDefaultAsync(x => x.Id == id, ct);
            if (v is null) return Missing();
            if (v.OrderNumber is > 0) return Results.Conflict(new { error = PrintedMessage });
            var count = await db.Dims.CountAsync(d => d.MaVanDonId == (int)id, ct);
            if (count == 0) return Bad("Chưa nhận kiện nào.");
            var p = await FindPickup(db, id);
            if (p is null) return Missing();
            var now = clock.GetLocalNow().DateTime;
            p.PickDateEnd ??= now; p.StaffId = Auth.UserId(http); p.SoKienNhan = count;
            v.SoKien = count; v.ModifyDate = now.Date; v.ModifyUser = p.StaffId;
            await db.SaveChangesAsync(ct);
            return Results.Ok(new { id, trangThai = 2 });
        });
    }
}
