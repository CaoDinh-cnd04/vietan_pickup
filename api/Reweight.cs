using System.Runtime.CompilerServices;
using Microsoft.EntityFrameworkCore;

namespace VietAnPickup;

public sealed record DimDto(int Dai, int Rong, int Cao, decimal TrongLuong, decimal? QuiDoi, decimal? ChargeWeight);
public sealed record RwDto(int Dai, int Rong, int Cao, decimal TrongLuong, decimal? QuiDoi, decimal? ChargeWeight, DateTime? At, string UserName);
public sealed record RwKienDto(int KienSo, long? IdHinh, bool HasPhoto, DimDto? Kho, RwDto? CanLai);
public sealed record RwBillDto(long OrderNumber, long MaVanDonId, string Code, string? CustomerName, int SoKien, int? KienScan, IReadOnlyList<RwKienDto> Kiens);
public sealed record RwRowDto(long Id, long IdHinh, bool HasPhoto, string OrderNumber, int KienSo, long? MaVanDonId, string? CustomerName,
    RwDto CanLai, DimDto? Kho, decimal? Lech);

/// <summary>Dòng đọc thô từ Order_VietAn_Reweight (bảng có trigger ⇒ không map EF, đọc/ghi bằng SQL).</summary>
public sealed class RwRow
{
    public long ID { get; set; }
    public long ID_Hinh { get; set; }
    public string OrderNumber { get; set; } = "";
    public int Kien_So { get; set; }
    public int Dai { get; set; }
    public int Rong { get; set; }
    public int Cao { get; set; }
    public decimal TrongLuong { get; set; }
    public decimal? QuiDoi { get; set; }
    public decimal? ChargeWeight { get; set; }
    public int? UserID { get; set; }
    public DateTime? At { get; set; }
}

/// <summary>
/// BƯỚC CUỐI (sau khi có bill + dán shipping mark): quét mã kiện "&lt;số bill&gt;/&lt;kiện&gt;" → chụp ảnh → AI đọc số kho ghi tay → lưu cân lại.
/// Ghi như màn "Nhập kích thước" của CMS/CRM (ReweightEntryWriter = p_VietAn_Reweight_Create): ảnh DIM barcode "&lt;số bill&gt;_&lt;kiện&gt;"
/// (1 tấm/kiện, chụp lại = thay dữ liệu, ảnh kho "B&lt;ID&gt;_k" được đổi mã sang số bill), Order_VietAn_Reweight theo ID_Hinh (có ⇒ cập nhật + Update_Date),
/// ảnh Status_Nhap = 1. Trigger Order_VietAn_Reweight_Reweight_Tang bật/hạ cờ Over_ReWeight trên Orders.
/// Khác CRM: UserID = người lưu (CRM ghi 0) để biết ai cân.
/// </summary>
public static class Reweight
{
    private const string Cols = "ID, ID_Hinh, OrderNumber, Kien_So, Dai, Rong, Cao, TrongLuong, QuiDoi, ChargeWeight, UserID, ISNULL(Update_Date, Create_Date) AS At";

    /// <summary>Khách mới (tài khoản giữ chỗ của sale) ⇒ tên khách thật kèm "(khách mới)".</summary>
    private static string? ShownName(string? customerName, string? senderName) =>
        Bookings.KhachMoiOf(customerName, senderName) is { } k ? $"{k} (khách mới)" : customerName;

    private static IResult Bad(string msg) => Results.BadRequest(new { error = msg });

    /// <summary>"6193393/1", "6193393_1", "6193393" (số bill 7 số) hoặc "B914708[/1]" (vận đơn đã có bill).</summary>
    internal static (long? Id, long? OrderNumber, int? Kien) ParseScan(string? raw)
    {
        var c = new string((raw ?? "").Where(ch => !char.IsWhiteSpace(ch)).ToArray()).Replace('_', '/').ToUpperInvariant();
        var parts = c.Split('/');
        int? kien = parts.Length > 1 && int.TryParse(parts[1], out var k) && k > 0 ? k : null;
        var (id, on) = Bookings.ParseCode(parts[0]);
        return (id, on, kien);
    }

    private static async Task<Dictionary<int, string>> UserNamesAsync(PickupDb db, IEnumerable<int?> ids, CancellationToken ct)
    {
        var list = ids.OfType<int>().Where(i => i > 0).Distinct().ToList();
        return list.Count == 0 ? [] : await db.Users.AsNoTracking().Where(u => list.Contains(u.Id)).ToDictionaryAsync(u => u.Id, u => Auth.StaffName(u), ct);
    }

    private static RwDto ToRw(RwRow r, Dictionary<int, string> users) =>
        new(r.Dai, r.Rong, r.Cao, r.TrongLuong, r.QuiDoi, r.ChargeWeight, r.At, r.UserID is { } u ? users.GetValueOrDefault(u, "") : "");

    /// <summary>Ảnh DIM của kiện: theo số bill hoặc còn mã vận đơn nháp (chưa đổi mã khi in bill).</summary>
    private static IQueryable<HinhAnh> KienImages(PickupDb db, long on, long mvdId) =>
        db.HinhAnhs.Where(h => h.ImageType == "DIM" && (h.Barcode.StartsWith(on.ToString() + "_") || (h.MaVanDonId == mvdId && h.Barcode.StartsWith("B" + mvdId.ToString() + "_"))));

    private static async Task<IResult> LoadBillAsync(PickupDb db, MaVanDon v, int? kienScan, CancellationToken ct)
    {
        var on = v.OrderNumber!.Value;
        var dims = await db.Dims.AsNoTracking().Where(d => d.MaVanDonId == (int)v.Id).OrderBy(d => d.Id).ToListAsync(ct);
        var imgs = await KienImages(db, on, v.Id).AsNoTracking()
            .Select(h => new { h.Id, h.Barcode, HasData = db.HinhAnhDatas.Any(d => d.Id == h.Id) }).ToListAsync(ct);
        var ons = on.ToString();
        var rws = await db.Database.SqlQuery<RwRow>(FormattableStringFactory.Create($"SELECT {Cols} FROM Order_VietAn_Reweight WHERE OrderNumber = {{0}}", ons)).ToListAsync(ct);
        var users = await UserNamesAsync(db, rws.Select(r => r.UserID), ct);
        var soKien = new[] { v.SoKien ?? 0, dims.Count, rws.Count == 0 ? 0 : rws.Max(r => r.Kien_So), kienScan ?? 0, 1 }.Max();
        var kiens = Enumerable.Range(1, soKien).Select(k =>
        {
            var img = imgs.Where(i => Images.KienOf(i.Barcode) == k).OrderByDescending(i => i.Id).FirstOrDefault();
            var rw = rws.Where(r => r.Kien_So == k).OrderByDescending(r => img is not null && r.ID_Hinh == img.Id).ThenByDescending(r => r.ID).FirstOrDefault();
            var d = k <= dims.Count ? dims[k - 1] : null;
            return new RwKienDto(k, img?.Id, img?.HasData ?? false, d is null ? null : new DimDto(d.Dai, d.Rong, d.Cao, d.TrongLuong, d.QuiDoi, d.ChargeWeight),
                rw is null ? null : ToRw(rw, users));
        }).ToList();
        return Results.Ok(new RwBillDto(on, v.Id, Bookings.Code(v.Id), ShownName(v.CustomerName, v.SenderName), soKien, kienScan, kiens));
    }

    public static void Map(IEndpointRouteBuilder app)
    {
        var g = app.MapGroup("/api/reweight").RequireAuthorization();

        // Quét mã kiện trên shipping mark → thông tin bill + từng kiện (số kho đo, số đã cân lại, ảnh).
        g.MapGet("/lookup", async (PickupDb db, CancellationToken ct, string code = "") =>
        {
            var (id, on, kien) = ParseScan(code);
            if (id is null && on is null) return Bad($"Không nhận ra mã \"{code}\" — quét mã kiện trên shipping mark (số bill/kiện).");
            var v = await db.VanDons.AsNoTracking().Where(m => id != null ? m.Id == id : m.OrderNumber == on).OrderByDescending(m => m.Id).FirstOrDefaultAsync(ct);
            if (v is null) return Results.NotFound(new { error = $"Không tìm thấy bill \"{code}\"." });
            if (v.OrderNumber is not > 0) return Bad($"{Bookings.Code(v.Id)} chưa có số bill — kinh doanh in bill trước rồi mới cân lại.");
            return await LoadBillAsync(db, v, kien, ct);
        });

        // Lưu cân lại 1 kiện (ảnh tuỳ chọn nếu kiện đã có ảnh).
        g.MapPost("/{on:long}/{kien:int}", async (long on, int kien, HttpRequest req, PickupDb db, TimeProvider clock, CancellationToken ct) =>
        {
            if (!req.HasFormContentType) return Bad("Cần gửi multipart/form-data.");
            var form = await req.ReadFormAsync(ct);
            static bool Int(string? s, int min, int max, out int v) => int.TryParse(s, out v) && v >= min && v <= max;
            if (kien is < 1 or > 9999) return Bad("Số kiện từ 1 đến 9999.");
            if (!Int(form["dai"], 1, 999, out var dai) || !Int(form["rong"], 1, 999, out var rong) || !Int(form["cao"], 1, 999, out var cao))
                return Bad("Dài, rộng, cao là số nguyên từ 1 đến 999 (cm).");
            if (!decimal.TryParse(form["trongLuong"], System.Globalization.NumberStyles.Number, System.Globalization.CultureInfo.InvariantCulture, out var tl) || tl < 0 || tl > 999)
                return Bad("Cân nặng từ 0 đến 999 kg.");   // cột decimal(5,2)
            var (err, photo, type) = await Images.ReadPhotoAsync(form, ct);
            if (err is not null) return Bad(err);

            var v = await db.VanDons.AsNoTracking().Where(m => m.OrderNumber == on).OrderByDescending(m => m.Id).FirstOrDefaultAsync(ct);
            if (v is null) return Results.NotFound(new { error = $"Không tìm thấy bill {on}." });
            var img = await KienImages(db, on, v.Id).Where(h => h.Barcode.EndsWith("_" + kien.ToString())).OrderByDescending(h => h.Id).FirstOrDefaultAsync(ct);
            if (img is not null && Images.KienOf(img.Barcode) != kien) img = null;   // EndsWith "_1" khớp cả "_11"
            if (img is null && photo is null) return Bad("Chụp ảnh kiện trước khi lưu — cân lại gắn với ảnh.");

            var uid = Auth.UserId(req.HttpContext);
            var now = clock.GetLocalNow().DateTime;
            var qd = Bookings.QuiDoi(dai, rong, cao);
            var cw = Math.Max(tl, qd);
            var barcode = $"{on}_{kien}";
            var ons = on.ToString();
            await db.Database.CreateExecutionStrategy().ExecuteAsync(async () =>
            {
                await using var tx = await db.Database.BeginTransactionAsync(ct);
                img = photo is not null ? await Images.PutAsync(db, img, barcode, "DIM", v.Id, photo, type!, now, ct) : img!;
                img.Barcode = barcode;
                img.StatusNhap = 1;   // legacy: ảnh đã nhập kích thước
                img.MaVanDonId ??= v.Id;
                await db.SaveChangesAsync(ct);
                await db.Database.ExecuteSqlInterpolatedAsync($"""
                    IF EXISTS (SELECT 1 FROM Order_VietAn_Reweight WHERE ID_Hinh = {img.Id})
                        UPDATE Order_VietAn_Reweight SET OrderNumber = {ons}, Kien_So = {kien}, Barcode = {barcode}, Dai = {dai}, Rong = {rong}, Cao = {cao},
                            TrongLuong = {tl}, QuiDoi = {qd}, ChargeWeight = {cw}, Ref_Info = {img.TenHinh}, UserID = {uid}, Update_Date = {now}
                        WHERE ID_Hinh = {img.Id}
                    ELSE
                        INSERT INTO Order_VietAn_Reweight (ID_Hinh, OrderNumber, Kien_So, Barcode, Dai, Rong, Cao, TrongLuong, QuiDoi, ChargeWeight, Ref_Info, UserID, Create_Date)
                        VALUES ({img.Id}, {ons}, {kien}, {barcode}, {dai}, {rong}, {cao}, {tl}, {qd}, {cw}, {img.TenHinh}, {uid}, {now})
                    """, ct);
                await AppLog.WriteAsync(db, req.HttpContext, "can-lai", barcode,
                    $"Cân lại {barcode}: {dai}×{rong}×{cao} cm, {tl} kg, quy đổi {qd}, tính cước {cw} kg{(photo is not null ? ", ảnh mới" : "")}", ct);
                await tx.CommitAsync(ct);
            });
            return Results.Ok(new { kienSo = kien, quiDoi = qd, chargeWeight = cw, idHinh = img!.Id });
        }).DisableAntiforgery().WithMetadata(new Microsoft.AspNetCore.Mvc.RequestSizeLimitAttribute(Bookings.MaxPhotoBytes + 1024 * 1024));

        // Quản lý cân lại: danh sách Order_VietAn_Reweight theo ngày (tạo/sửa), so với số kho đo (MaVanDon_PCS_DIM kiện k).
        g.MapGet("", async (PickupDb db, TimeProvider clock, CancellationToken ct, DateTime? fromDate, DateTime? toDate, string search = "", int lech = 0, int page = 1, int pageSize = 50) =>
        {
            var p0 = Math.Max(page, 1);
            var size = Math.Clamp(pageSize, 1, 200);
            var dateTo = (toDate ?? clock.GetLocalNow().DateTime).Date.AddDays(1);
            var dateFrom = (fromDate ?? dateTo.AddDays(-7)).Date;
            var like = "%" + (search ?? "").Trim().Replace("[", "[[]").Replace("%", "[%]").Replace("_", "[_]") + "%";
            var all = await db.Database.SqlQuery<RwRow>(FormattableStringFactory.Create(
                    $"SELECT {Cols} FROM Order_VietAn_Reweight WHERE ISNULL(Update_Date, Create_Date) >= {{0}} AND ISNULL(Update_Date, Create_Date) < {{1}} AND Barcode LIKE {{2}}",
                    dateFrom, dateTo, like))
                .OrderByDescending(r => r.ID).Take(5000).ToListAsync(ct);   // trần 5000 dòng/khoảng lọc — đủ cho màn quản lý tạm

            var onList = all.Select(r => long.TryParse(r.OrderNumber, out var n) ? n : 0).Where(n => n > 0).Distinct().ToList();
            var bills = await db.VanDons.AsNoTracking().Where(m => m.OrderNumber != null && onList.Contains(m.OrderNumber.Value))
                .Select(m => new { m.Id, OrderNumber = m.OrderNumber!.Value, m.CustomerName, m.SenderName }).ToListAsync(ct);
            var bill = bills.GroupBy(b => b.OrderNumber).ToDictionary(x => x.Key, x => x.OrderByDescending(b => b.Id).First());
            var mvdIds = bill.Values.Select(b => (int)b.Id).ToList();
            var dims = (await db.Dims.AsNoTracking().Where(d => mvdIds.Contains(d.MaVanDonId)).OrderBy(d => d.Id).ToListAsync(ct)).GroupBy(d => d.MaVanDonId).ToDictionary(x => x.Key, x => x.ToList());
            var idHinhs = all.Select(r => r.ID_Hinh).ToList();
            var withData = (await db.HinhAnhDatas.AsNoTracking().Where(d => idHinhs.Contains(d.Id)).Select(d => d.Id).ToListAsync(ct)).ToHashSet();
            var users = await UserNamesAsync(db, all.Select(r => r.UserID), ct);

            var rows = all.Select(r =>
            {
                var b = long.TryParse(r.OrderNumber, out var n) ? bill.GetValueOrDefault(n) : null;
                var d = b is not null && dims.TryGetValue((int)b.Id, out var ds) && r.Kien_So >= 1 && r.Kien_So <= ds.Count ? ds[r.Kien_So - 1] : null;
                var kho = d is null ? null : new DimDto(d.Dai, d.Rong, d.Cao, d.TrongLuong, d.QuiDoi, d.ChargeWeight);
                decimal? diff = kho?.ChargeWeight is { } k && r.ChargeWeight is { } c ? c - k : null;
                return new RwRowDto(r.ID, r.ID_Hinh, withData.Contains(r.ID_Hinh), r.OrderNumber, r.Kien_So, b?.Id, ShownName(b?.CustomerName, b?.SenderName), ToRw(r, users), kho, diff);
            }).Where(x => lech == 0 || (x.Lech is { } l && Math.Abs(l) >= 0.5m)).ToList();
            return Results.Ok(new { items = rows.Skip((p0 - 1) * size).Take(size), page = p0, pageSize = size, totalCount = rows.Count });
        });
    }
}
