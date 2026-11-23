using Microsoft.EntityFrameworkCore;

namespace VietAnPickup;

// Dự án KHÔNG có bảng riêng: lệnh book = vận đơn nháp CRM (MaVanDon chưa có OrderNumber, mã quét B<ID>), theo đúng quy ước ADR-050 bên CRM.
// Chỉ map các cột dự án đọc/ghi; cột khác của bảng legacy để NULL/mặc định như khi CRM tạo vận đơn nháp.

/// <summary>Vận đơn (bill). OrderNumber NULL = nháp; CRM cấp số khi In và từ đó KHOÁ sửa ("Bill này đã được in…").</summary>
public class MaVanDon
{
    public long Id { get; set; }
    public long? CustomerId { get; set; }
    public string? Awb { get; set; }
    public string? CustomerName { get; set; }
    public string? SenderName { get; set; }
    public string? SenderAddress { get; set; }
    public string? SenderContactName { get; set; }
    public string? SenderPhone { get; set; }
    public string ConsigneeEmail { get; set; } = "";   // NOT NULL trong DB thật (CRM luôn ghi "")
    public int? Status { get; set; }
    public DateTime? CreateDate { get; set; }          // cột kiểu date
    public DateTime? ModifyDate { get; set; }
    public int? CreateUser { get; set; }
    public int? ModifyUser { get; set; }
    public string? TenHang { get; set; }
    public int? SoKien { get; set; }
    public decimal? TrongLuong { get; set; }
    public long? OrderNumber { get; set; }
    public long? CustomerStaffId { get; set; }
    public DateTime? PickupEst { get; set; }
}

/// <summary>Kích thước kiện của vận đơn. Kiện thứ k = dòng thứ k theo ID (quy ước p_MVD_Get_PCS_DIM). Có trigger sinh Order_MaVanDon_MNF.DIM.</summary>
public class PcsDim
{
    public long Id { get; set; }
    public int MaVanDonId { get; set; }
    public int SoLuong { get; set; } = 1;
    public string Loai { get; set; } = "CARTON";
    public int Dai { get; set; }
    public int Rong { get; set; }
    public int Cao { get; set; }
    public decimal TrongLuong { get; set; }
    public decimal? QuiDoi { get; set; }
    public decimal? ChargeWeight { get; set; }
}

/// <summary>
/// Phiên pickup legacy — 1 dòng / lệnh book, liên kết vận đơn qua Note = "B&lt;MaVanDonID&gt;".
/// Trang_Thai luôn 1 để màn quét của hệ cũ (p_Prickup_Get_Last tìm phiên Trang_Thai=0) không nối kiện bill khác vào; Pick_Date_End NULL = kho chưa chốt nhận.
/// </summary>
public class Pickup
{
    public int Id { get; set; }
    public int StaffId { get; set; }
    public long? CustomerId { get; set; }
    public int? SoKienNhan { get; set; }
    public int? SoKienBook { get; set; }
    public decimal? TongKg { get; set; }
    public DateTime PickDate { get; set; }
    public string? Note { get; set; }
    public int TrangThai { get; set; } = 1;
    public DateTime? PickDateEnd { get; set; }
}

/// <summary>Ảnh hàng (ADR-050): ảnh theo kiện Barcode = B&lt;ID&gt;_&lt;kiện&gt; (bill nháp), ImageType DIM, 1 ảnh/kiện; CRM đổi sang &lt;số bill&gt;_&lt;kiện&gt; khi in.</summary>
public class HinhAnh
{
    public long Id { get; set; }
    public string Barcode { get; set; } = "";
    public string TenHinh { get; set; } = "";
    public DateTime? CreateDate { get; set; }
    public string? ImageType { get; set; }
    public long? MaVanDonId { get; set; }
}

/// <summary>Nhị phân ảnh (ADR-051) — bảng riêng để SELECT AHinhAnh_Order không kéo nhị phân.</summary>
public class HinhAnhData
{
    public long Id { get; set; }
    public string ContentType { get; set; } = "image/jpeg";
    public byte[] Data { get; set; } = [];
    public DateTime CreateDate { get; set; }
}

// ---- CRM — CHỈ ĐỌC ---------------------------------------------------------------------------------------------------------------------------

public class Customer
{
    public long CustomerID { get; set; }
    public string? CustomerCode { get; set; }
    public string? CustomerName { get; set; }
    public string? Address1 { get; set; }
    public string? ContactName { get; set; }
    public string? ContactPhone { get; set; }
    public string? Phone { get; set; }
    public string? Tel { get; set; }
    public int? StaffId { get; set; }
    public bool? IsDeleted { get; set; }
}

public class User
{
    public int Id { get; set; }
    public string? UserName { get; set; }
    public string? UserPassword { get; set; }
    public string? PasswordBcrypt { get; set; }
    public string? FirstName { get; set; }
    public string? LastName { get; set; }
    public string? Status { get; set; }
}

public class BaseCode
{
    public int BaseID { get; set; }
    public string? Option1 { get; set; }
    public string? Option2 { get; set; }
}

public class PickupDb(DbContextOptions<PickupDb> options) : DbContext(options)
{
    public DbSet<MaVanDon> VanDons => Set<MaVanDon>();
    public DbSet<PcsDim> Dims => Set<PcsDim>();
    public DbSet<Pickup> Pickups => Set<Pickup>();
    public DbSet<HinhAnh> HinhAnhs => Set<HinhAnh>();
    public DbSet<HinhAnhData> HinhAnhDatas => Set<HinhAnhData>();
    public DbSet<Customer> Customers => Set<Customer>();
    public DbSet<User> Users => Set<User>();
    public DbSet<BaseCode> BaseCodes => Set<BaseCode>();

    protected override void OnModelCreating(ModelBuilder m)
    {
        m.Entity<MaVanDon>(b =>
        {
            b.ToTable("MaVanDon");
            b.HasKey(e => e.Id);
            b.Property(e => e.Id).HasColumnName("ID").ValueGeneratedOnAdd();
            b.Property(e => e.CustomerId).HasColumnName("CustomerID");
            b.Property(e => e.Awb).HasColumnName("AWB").HasMaxLength(40);
            b.Property(e => e.CustomerName).HasMaxLength(500);
            b.Property(e => e.SenderName).HasMaxLength(500);
            b.Property(e => e.SenderAddress).HasMaxLength(1000);
            b.Property(e => e.SenderContactName).HasMaxLength(200);
            b.Property(e => e.SenderPhone).HasMaxLength(100);
            b.Property(e => e.ConsigneeEmail).HasMaxLength(300);
            b.Property(e => e.CreateDate).HasColumnType("date");
            b.Property(e => e.ModifyDate).HasColumnType("date");
            b.Property(e => e.TenHang).HasColumnName("Ten_hang").HasMaxLength(300);
            b.Property(e => e.SoKien).HasColumnName("So_Kien");
            b.Property(e => e.TrongLuong).HasColumnName("Trong_Luong").HasColumnType("decimal(18,2)");
            b.Property(e => e.CustomerStaffId).HasColumnName("Customer_Staff_ID");
            b.Property(e => e.PickupEst).HasColumnName("DateTime_Pickup_Est");
        });
        m.Entity<PcsDim>(b =>
        {
            b.ToTable("MaVanDon_PCS_DIM", t => t.HasTrigger("MaVanDon_PCS_DIM_Create_DIM"));   // trigger ⇒ EF không dùng OUTPUT clause
            b.HasKey(e => e.Id);
            b.Property(e => e.Id).HasColumnName("ID").ValueGeneratedOnAdd();
            b.Property(e => e.MaVanDonId).HasColumnName("MaVanDonID");
            b.Property(e => e.Loai).HasMaxLength(100);
            b.Property(e => e.TrongLuong).HasColumnType("decimal(9,2)");
            b.Property(e => e.QuiDoi).HasColumnType("decimal(9,2)");
            b.Property(e => e.ChargeWeight).HasColumnType("decimal(9,2)");
        });
        m.Entity<Pickup>(b =>
        {
            b.ToTable("Pickup");
            b.HasKey(e => e.Id);
            b.Property(e => e.Id).HasColumnName("Pickup_ID").ValueGeneratedOnAdd();
            b.Property(e => e.StaffId).HasColumnName("Staff_ID");
            b.Property(e => e.CustomerId).HasColumnName("Customer_ID");
            b.Property(e => e.SoKienNhan).HasColumnName("Total_So_kien_Nhan");
            b.Property(e => e.SoKienBook).HasColumnName("Total_So_kien_Bill");
            b.Property(e => e.TongKg).HasColumnName("Total_So_Kg").HasColumnType("decimal(18,2)");
            b.Property(e => e.PickDate).HasColumnName("Pick_Date");
            b.Property(e => e.Note).HasMaxLength(300);
            b.Property(e => e.TrangThai).HasColumnName("Trang_Thai");
            b.Property(e => e.PickDateEnd).HasColumnName("Pick_Date_End");
        });
        m.Entity<HinhAnh>(b =>
        {
            b.ToTable("AHinhAnh_Order");
            b.HasKey(e => e.Id);
            b.Property(e => e.Id).HasColumnName("ID_Hinh").ValueGeneratedOnAdd();
            b.Property(e => e.Barcode).HasMaxLength(20);
            b.Property(e => e.TenHinh).HasColumnName("Ten_Hinh").HasMaxLength(100);
            b.Property(e => e.CreateDate).HasColumnName("Create_Date");
            b.Property(e => e.ImageType).HasMaxLength(20);
            b.Property(e => e.MaVanDonId).HasColumnName("MaVanDon_ID");
        });
        m.Entity<HinhAnhData>(b =>
        {
            b.ToTable("AHinhAnh_Order_Data");
            b.HasKey(e => e.Id);
            b.Property(e => e.Id).HasColumnName("ID_Hinh").ValueGeneratedNever();
            b.Property(e => e.ContentType).HasMaxLength(30);
            b.Property(e => e.CreateDate).HasColumnName("Create_Date");
        });
        m.Entity<Customer>(b =>
        {
            b.ToTable("TCustomer");
            b.HasKey(e => e.CustomerID);
            b.Property(e => e.CustomerID).ValueGeneratedNever();
            b.Property(e => e.StaffId).HasColumnName("Staff_ID");
        });
        m.Entity<User>(b =>
        {
            b.ToTable("USERS");
            b.HasKey(e => e.Id);
            b.Property(e => e.Id).HasColumnName("ID").ValueGeneratedNever();
            b.Property(e => e.UserName).HasColumnName("USER_NAME");
            b.Property(e => e.UserPassword).HasColumnName("USER_PASSWORD");
            b.Property(e => e.PasswordBcrypt).HasColumnName("PASSWORD_BCRYPT");
            b.Property(e => e.FirstName).HasColumnName("FIRST_NAME");
            b.Property(e => e.LastName).HasColumnName("LAST_NAME");
            b.Property(e => e.Status).HasColumnName("STATUS");
        });
        m.Entity<BaseCode>(b => { b.ToTable("TBaseCode"); b.HasKey(e => e.BaseID); b.Property(e => e.BaseID).ValueGeneratedNever(); });
    }
}
