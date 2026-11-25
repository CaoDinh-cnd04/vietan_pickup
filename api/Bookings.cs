using Microsoft.EntityFrameworkCore;

namespace VietAnPickup;

public sealed record ReceiveRequest(int? SoKien = null);   // null = kho không đếm (số kiện theo bill ở bước cuối)
public sealed record CreateBookingRequest(long CustomerId, int SoKien = 0, decimal? KgDuKien = null, string? TenHang = null, string? ContactName = null,
    string? ContactPhone = null, string? PickupAddress = null, DateTime? PlanDate = null, string? Note = null, bool TaiKho = false,
    string? KhachMoi = null);   // KhachMoi: tên khách thật khi chưa có hồ sơ — vận đơn tạo dưới tài khoản giữ chỗ của sale (CustomerId)

public sealed record KienDto(int KienSo, string Loai, int Dai, int Rong, int Cao, decimal TrongLuong, decimal QuiDoi, decimal ChargeWeight, bool HasPhoto);
public sealed record RowDto(long Id, string Code, long? CustomerId, string? CustomerName, string StaffName, DateTime? PlanDate, int TrangThai,
    DateTime? CreateDate, int SoKienBook, int SoKienNhan, decimal? Kg, string? TenHang, long? OrderNumber, string SaleName, string? KhachMoi);
public sealed record DetailDto(long Id, string Code, long? CustomerId, string? CustomerName, string? CustomerPhone, string StaffName,
    string? ContactName, string? ContactPhone, string? PickupAddress, DateTime? PlanDate, string? TenHang, string? Note, int TrangThai, DateTime? CreateDate,
    DateTime? ReceivedDate, int SoKienBook, decimal? KgDuKien, long? OrderNumber, IReadOnlyList<KienDto> Kiens, string SaleName, long? FinishedPhotoId, string? KhachMoi,
    int SoKienNhan, long? GoodsPhotoId);

/// <summary>
/// Book pickup + kho nhận hàng trên BẢNG CRM (không bảng riêng):
/// book = vận đơn nháp MaVanDon (mã quét B&lt;ID&gt;, kiện B&lt;ID&gt;/k — CRM hiểu dạng này, ADR-050) + 1 dòng Pickup (Note = B&lt;ID&gt;);
/// khách mang hàng tới kho = như trên nhưng không khai số kiện. KHO chỉ chốt SỐ KIỆN thực nhận (Pickup) + ảnh theo đơn (ảnh hàng DIM, ảnh hoàn thiện
/// Other, barcode = mã đơn); KHÔNG đo/chụp từng kiện — kích thước, cân do BƯỚC CUỐI cân lại từ ảnh (Reweight.cs). MaVanDon_PCS_DIM chỉ còn đọc (dữ liệu cũ).
/// Kinh doanh mở bill nháp trong CRM, bổ sung người nhận rồi In (CRM cấp số bill, khoá sửa).
/// Trạng thái suy ra: 0 chờ nhận · 1 đang nhận (dữ liệu cũ có kiện) · 2 kho đã nhận · 3 đã lập bill.
/// </summary>
public static class Bookings
{
    public const long MaxPhotoBytes = 8 * 1024 * 1024;
    public const string PrintedMessage = "Bill này đã được in, không được cập nhật lại";   // đúng thông báo CRM/legacy

    public static string Code(long id) => $"B{id}";
    internal static string NoteOf(long id, string? note) => string.IsNullOrWhiteSpace(note) ? Code(id) : $"{Code(id)} - {note.Trim()}";
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

    /// <summary>
    /// Tài khoản "tạo bill" giữ chỗ của sale (TCustomer tên bắt đầu "=", vd "=====(VA Bình Dương)") — công ty dùng cho khách chưa có hồ sơ.
    /// Vận đơn của khách mới: CustomerName = tên tài khoản giữ chỗ, SenderName = tên khách thật ⇒ trả tên khách thật để hiển thị.
    /// </summary>
    internal static bool IsPlaceholder(string? customerName) => customerName?.TrimStart().StartsWith('=') ?? false;
    internal static string? KhachMoiOf(string? customerName, string? senderName) =>
        IsPlaceholder(customerName) && !string.IsNullOrWhiteSpace(senderName) && !IsPlaceholder(senderName) ? senderName.Trim() : null;

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
        if (r.KhachMoi is not null && (string.IsNullOrWhiteSpace(r.KhachMoi) || string.IsNullOrWhiteSpace(r.ContactPhone))) e["khachMoi"] = ["Khách mới: nhập tên và số điện thoại."];
        if ((r.KhachMoi?.Length ?? 0) > 200) e["khachMoi"] = ["Tên khách quá dài."];
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
        var c = await db.Customers.AsNoTracking().Where(x => x.CustomerID == v.CustomerId).Select(x => new { x.CustomerName, x.Phone, x.Tel, x.StaffId }).FirstOrDefaultAsync(ct);
        var saleId = v.CustomerStaffId > 0 ? v.CustomerStaffId : c?.StaffId;   // NV phụ trách khách (Customer_Staff_ID thường = 0 ⇒ lấy theo hồ sơ khách)
        var sale = saleId is { } si ? await db.Users.AsNoTracking().FirstOrDefaultAsync(x => x.Id == (int)si, ct) : null;
        var u = await db.Users.AsNoTracking().FirstOrDefaultAsync(x => x.Id == v.CreateUser, ct);
        var dims = await db.Dims.AsNoTracking().Where(d => d.MaVanDonId == (int)id).OrderBy(d => d.Id).ToListAsync(ct);
        var photos = (await (from h in db.HinhAnhs.AsNoTracking()
                             join d in db.HinhAnhDatas.AsNoTracking() on h.Id equals d.Id
                             where h.MaVanDonId == id && h.ImageType == "DIM"
                             select h.Barcode).ToListAsync(ct)).ToHashSet();
        var finished = await OrderPhotoAsync(db, id, "Other", ct);
        var goods = await OrderPhotoAsync(db, id, "DIM", ct);
        bool HasPhoto(int k) => photos.Contains($"{Code(id)}_{k}") || (v.OrderNumber is > 0 && photos.Contains($"{v.OrderNumber}_{k}"));
        var kiens = dims.Select((d, i) => new KienDto(i + 1, d.Loai, d.Dai, d.Rong, d.Cao, d.TrongLuong, d.QuiDoi ?? 0, d.ChargeWeight ?? 0, HasPhoto(i + 1))).ToList();
        return Results.Ok(new DetailDto(v.Id, Code(v.Id), v.CustomerId, c?.CustomerName ?? v.CustomerName, c?.Phone ?? c?.Tel, Auth.StaffName(u),
            v.SenderContactName, v.SenderPhone, v.SenderAddress, v.PickupEst, v.TenHang, UserNote(id, p?.Note),
            StatusOf(v.OrderNumber, p?.PickDateEnd, dims.Count), p?.PickDate ?? v.CreateDate, p?.PickDateEnd,
            p?.SoKienBook ?? v.SoKien ?? 0, dims.Count == 0 ? v.TrongLuong : null, v.OrderNumber, kiens, Auth.StaffName(sale), finished?.Id, KhachMoiOf(v.CustomerName, v.SenderName),
            Math.Max(p?.SoKienNhan ?? 0, dims.Count), goods?.Id));
    }

    /// <summary>
    /// Ảnh THEO ĐƠN do kho chụp (1 tấm/loại, có dữ liệu trong AHinhAnh_Order_Data): "DIM" = ảnh hàng hoá, "Other" = ảnh hoàn thiện gửi khách.
    /// Barcode = mã đơn, KHÔNG có "_" (quy ước CRM "ảnh theo đơn") ⇒ không lẫn với ảnh kiện "&lt;bill&gt;_k" của bước cuối / màn Nhập kích thước.
    /// </summary>
    private static Task<HinhAnh?> OrderPhotoAsync(PickupDb db, long id, string imageType, CancellationToken ct) =>
        db.HinhAnhs.Where(h => h.MaVanDonId == id && h.ImageType == imageType && !h.Barcode.Contains("_") && db.HinhAnhDatas.Any(d => d.Id == h.Id))
            .OrderByDescending(h => h.Id).FirstOrDefaultAsync(ct);

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

        // Tài khoản tạo bill (giữ chỗ) của từng sale — chọn khi khách mới chưa có hồ sơ.
        app.MapGet("/api/placeholder-accounts", async (PickupDb db, CancellationToken ct) =>
        {
            var rows = await db.Customers.AsNoTracking().Where(c => c.IsDeleted != true && c.CustomerName!.StartsWith("="))
                .Select(c => new { c.CustomerID, c.CustomerCode, c.CustomerName, c.StaffId }).ToListAsync(ct);
            var sids = rows.Select(r => r.StaffId).OfType<int>().Distinct().ToList();
            var users = await db.Users.AsNoTracking().Where(u => sids.Contains(u.Id)).ToDictionaryAsync(u => u.Id, ct);
            var items = rows.Select(r => new
            {
                customerId = r.CustomerID, customerName = r.CustomerName, customerCode = r.CustomerCode,
                saleName = r.StaffId is { } sid ? Auth.StaffName(users.GetValueOrDefault(sid)) : "",
            }).OrderBy(x => x.saleName == "" ? 1 : 0).ThenBy(x => x.saleName).ThenBy(x => x.customerName).ToList();
            return Results.Ok(new { items });
        }).RequireAuthorization();

        // Book pickup (hoặc khách mang tới kho): vận đơn nháp + dòng Pickup, cùng 1 transaction.
        g.MapPost("", async (CreateBookingRequest r, PickupDb db, HttpContext http, TimeProvider clock, CancellationToken ct) =>
        {
            if (ValidateCreate(r) is { } err) return Results.ValidationProblem(err);
            var cust = await db.Customers.AsNoTracking().Where(c => c.CustomerID == r.CustomerId)
                .Select(c => new { c.CustomerName, c.ContactName, c.ContactPhone, c.Phone, c.Tel, c.Address1, c.StaffId }).FirstOrDefaultAsync(ct);
            if (cust is null) return Results.ValidationProblem(new Dictionary<string, string[]> { ["customerId"] = ["Không tìm thấy khách hàng."] });
            if (r.KhachMoi is not null && !IsPlaceholder(cust.CustomerName))
                return Results.ValidationProblem(new Dictionary<string, string[]> { ["customerId"] = ["Khách mới phải tạo dưới tài khoản tạo bill (giữ chỗ) của sale."] });
            var khachMoi = r.KhachMoi?.Trim();

            static string? Pick(string? typed, params string?[] fallback) =>
                !string.IsNullOrWhiteSpace(typed) ? typed.Trim() : fallback.FirstOrDefault(x => !string.IsNullOrWhiteSpace(x))?.Trim();
            var uid = Auth.UserId(http);
            var now = clock.GetLocalNow().DateTime;
            var v = new MaVanDon
            {
                // Như CRM tạo vận đơn nháp: Status=1, AWB="", CustomerName = SenderName = tên khách, Customer_Staff_ID = NV phụ trách khách.
                // Khách mới: CustomerID = tài khoản giữ chỗ của sale, SenderName/liên hệ = khách thật (không lấy SĐT/địa chỉ của tài khoản giữ chỗ).
                CustomerId = r.CustomerId, Status = 1, Awb = "", ConsigneeEmail = "", CustomerName = cust.CustomerName, SenderName = khachMoi ?? cust.CustomerName,
                SenderContactName = khachMoi ?? Pick(r.ContactName, cust.ContactName),
                SenderPhone = khachMoi is not null ? r.ContactPhone!.Trim() : Pick(r.ContactPhone, cust.ContactPhone, cust.Phone, cust.Tel),
                SenderAddress = khachMoi is not null ? r.PickupAddress?.Trim() : r.TaiKho ? null : Pick(r.PickupAddress, cust.Address1), PickupEst = r.TaiKho ? now : r.PlanDate,
                TenHang = r.TenHang?.Trim(), SoKien = r.SoKien > 0 ? r.SoKien : null, TrongLuong = r.KgDuKien,
                CustomerStaffId = cust.StaffId, CreateUser = uid, ModifyUser = uid, CreateDate = now.Date, ModifyDate = now.Date,
            };
            await InTx(db, async () =>
            {
                db.VanDons.Add(v);
                await db.SaveChangesAsync(ct);
                db.Pickups.Add(new Pickup { StaffId = uid, CustomerId = r.CustomerId, SoKienBook = r.SoKien, SoKienNhan = 0, PickDate = now, Note = NoteOf(v.Id, r.Note) });
                await db.SaveChangesAsync(ct);
                await AppLog.WriteAsync(db, http, "tao-tai-kho", Code(v.Id), khachMoi is null ? $"Tạo vận đơn {Code(v.Id)} cho khách {cust.CustomerName}" : $"Tạo vận đơn {Code(v.Id)} cho KHÁCH MỚI {khachMoi} ({v.SenderPhone}) dưới tài khoản {cust.CustomerName}", ct);
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
                          && (s == "" || (codeId != null && m.Id == codeId) || (codeOn != null && m.OrderNumber == codeOn) || m.CustomerName!.Contains(s) || m.SenderName!.Contains(s) || m.TenHang!.Contains(s))
                    select new { m.Id, m.CustomerId, m.CustomerName, m.SenderName, m.CreateUser, m.PickupEst, m.CreateDate, m.SoKien, m.TrongLuong, m.TenHang, m.OrderNumber,
                                 PickDate = (DateTime?)pk!.PickDate, SoKienBook = (int?)pk!.SoKienBook, PkNhan = (int?)pk!.SoKienNhan, St = st, Dims = dims,
                                 SaleId = m.CustomerStaffId > 0 ? m.CustomerStaffId : db.Customers.Where(c => c.CustomerID == m.CustomerId).Select(c => (long?)c.StaffId).FirstOrDefault() };   // NV phụ trách khách
            var total = await q.CountAsync(ct);
            var rows = await q.OrderByDescending(x => x.Id).Skip((p0 - 1) * size).Take(size).ToListAsync(ct);
            var uids = rows.Select(x => x.CreateUser).Concat(rows.Select(x => (int?)x.SaleId)).Distinct().ToList();
            var users = await db.Users.AsNoTracking().Where(u => uids.Contains(u.Id)).ToDictionaryAsync(u => u.Id, ct);
            var items = rows.Select(x => new RowDto(x.Id, Code(x.Id), x.CustomerId, x.CustomerName, Auth.StaffName(x.CreateUser is { } cu ? users.GetValueOrDefault(cu) : null),
                x.PickupEst, x.St, x.PickDate ?? x.CreateDate, x.SoKienBook ?? x.SoKien ?? 0, Math.Max(x.PkNhan ?? 0, x.Dims), x.TrongLuong, x.TenHang, x.OrderNumber,
                Auth.StaffName(x.SaleId is { } si ? users.GetValueOrDefault((int)si) : null), KhachMoiOf(x.CustomerName, x.SenderName))).ToList();
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
        g.MapPost("/{id:long}/cancel", async (long id, PickupDb db, HttpContext http, CancellationToken ct) =>
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
                await AppLog.WriteAsync(db, http, "huy", Code(id), $"Huỷ lệnh {Code(id)} ({v.CustomerName})", ct);
                return true;
            }, ct);
            return Results.Ok(new { id });
        });

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

        // Ảnh theo đơn của kho: kind "hang" = ảnh hàng hoá (DIM), "kien" = ảnh kiện đã đóng gói, gửi khách xem (Other). Barcode = mã đơn
        // (B<ID> hoặc số bill, không "_" ⇒ màn Nhập kích thước legacy không liệt kê). 1 tấm/loại/đơn — chụp lại thay dữ liệu.
        g.MapPost("/{id:long}/photo/{kind}", async (long id, string kind, HttpRequest req, PickupDb db, TimeProvider clock, CancellationToken ct) =>
        {
            var (imageType, action, label) = kind switch
            {
                "hang" => ("DIM", "anh-hang", "ảnh hàng hoá"),
                "kien" => ("Other", "anh-kien", "ảnh kiện"),
                _ => ("", "", ""),
            };
            if (imageType == "") return Bad("Loại ảnh là hang hoặc kien.");
            if (!req.HasFormContentType) return Bad("Cần gửi multipart/form-data.");
            var (err, photo, type) = await Images.ReadPhotoAsync(await req.ReadFormAsync(ct), ct);
            if (err is not null) return Bad(err);
            if (photo is null) return Bad("Chưa chọn ảnh.");
            var v = await db.VanDons.AsNoTracking().FirstOrDefaultAsync(x => x.Id == id, ct);
            if (v is null) return Missing();
            var now = clock.GetLocalNow().DateTime;
            var barcode = v.OrderNumber is > 0 ? v.OrderNumber.Value.ToString() : Code(id);
            var h = await OrderPhotoAsync(db, id, imageType, ct);
            var replaced = h is not null;
            h = await InTx(db, async () =>
            {
                var r = await Images.PutAsync(db, h, barcode, imageType, id, photo, type!, now, ct);
                await db.SaveChangesAsync(ct);
                await AppLog.WriteAsync(db, req.HttpContext, action, barcode, replaced ? $"Chụp lại {label} {barcode}" : $"Chụp {label} {barcode}", ct);
                return r;
            }, ct);
            return Results.Ok(new { idHinh = h.Id });
        }).DisableAntiforgery().WithMetadata(new Microsoft.AspNetCore.Mvc.RequestSizeLimitAttribute(MaxPhotoBytes + 1024 * 1024));

        // Chốt "kho đã nhận" khi số kiện thực khác số khai (hoặc khách mang tới kho, không khai trước).
        // Kho chốt "đã nhận": chỉ cần đủ 2 ảnh theo đơn (ảnh hàng hoá + ảnh kiện). Kho không đếm/đo/chụp từng kiện — số kiện theo bill,
        // kích thước, cân do bước cuối cân lại từ ảnh. SoKien (tuỳ chọn) = số kiện kho đếm được, nếu có.
        g.MapPost("/{id:long}/receive", async (long id, ReceiveRequest r, HttpContext http, PickupDb db, TimeProvider clock, CancellationToken ct) =>
        {
            if (r.SoKien is < 1 or > 9999) return Bad("Số kiện từ 1 đến 9999.");
            var v = await db.VanDons.FirstOrDefaultAsync(x => x.Id == id, ct);
            if (v is null) return Missing();
            if (v.OrderNumber is > 0) return Results.Conflict(new { error = PrintedMessage });
            if (await OrderPhotoAsync(db, id, "DIM", ct) is null || await OrderPhotoAsync(db, id, "Other", ct) is null)
                return Bad("Chụp đủ 2 ảnh (ảnh hàng hoá và ảnh kiện) rồi mới bấm Xong.");
            var count = r.SoKien;
            var now = clock.GetLocalNow().DateTime;
            var p = await FindPickup(db, id);
            if (p is null) db.Pickups.Add(p = new Pickup { CustomerId = v.CustomerId, SoKienBook = v.SoKien ?? 0, PickDate = now, Note = Code(id) });   // vận đơn nháp tạo từ CRM
            var sua = p.PickDateEnd is not null;
            p.PickDateEnd ??= now; p.StaffId = Auth.UserId(http);
            if (count is { } c) { p.SoKienNhan = c; v.SoKien = c; }
            v.ModifyDate = now.Date; v.ModifyUser = p.StaffId;
            await InTx(db, async () =>
            {
                await db.SaveChangesAsync(ct);
                await AppLog.WriteAsync(db, http, "chot-nhan", Code(id),
                    $"{(sua ? "Kho lưu lại" : "Kho đã nhận")}, đủ ảnh hàng hoá + ảnh kiện{(count is { } n ? $", {n} kiện" : "")}{(p.SoKienBook > 0 ? $" (khai {p.SoKienBook})" : "")}", ct);
                return true;
            }, ct);
            return Results.Ok(new { id, trangThai = 2 });
        });
    }
}
