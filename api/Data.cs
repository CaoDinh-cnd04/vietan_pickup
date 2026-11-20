using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata;

namespace VietAnPickup;

// ---- Bảng MỚI (db/add_pickup_booking.sql) -------------------------------------------------------------------------------------------------------

/// <summary>Lệnh book pickup. Code (PK000123) là cột tính toán PERSISTED, in thành QR. Trang_Thai: 0 đã book, 1 kho đã nhận, 2 huỷ.</summary>
public class PickupBooking
{
    public long Id { get; set; }
    public string Code { get; set; } = "";
    public long CustomerId { get; set; }
    public int StaffId { get; set; }
    public string? ContactName { get; set; }
    public string? ContactPhone { get; set; }
    public string? PickupAddress { get; set; }
    public DateTime? PlanDate { get; set; }
    public string? Note { get; set; }
    public int TrangThai { get; set; }
    public DateTime CreateDate { get; set; }
    public DateTime? ReceivedDate { get; set; }
    public int? ReceivedBy { get; set; }
    public List<PickupBookingLine> Lines { get; set; } = [];
}

public class PickupBookingLine
{
    public long Id { get; set; }
    public long BookingId { get; set; }
    public string? MoTa { get; set; }
    public int SoKien { get; set; } = 1;
    public decimal? KgDuKien { get; set; }
    public long? MaVanDonId { get; set; }
}

/// <summary>Một kiện kho thực nhận: kích thước + cân; quy đổi/cân tính cước do server tính.</summary>
public class PickupBookingKien
{
    public long BookingId { get; set; }
    public int KienSo { get; set; }
    public int Dai { get; set; }
    public int Rong { get; set; }
    public int Cao { get; set; }
    public decimal TrongLuong { get; set; }
    public decimal QuiDoi { get; set; }
    public decimal ChargeWeight { get; set; }
    public DateTime CreateDate { get; set; }
    public int? CreateBy { get; set; }
}

/// <summary>Ảnh kiện (đã nén ở trình duyệt) — bảng riêng để truy vấn kích thước không kéo nhị phân.</summary>
public class PickupBookingKienAnh
{
    public long BookingId { get; set; }
    public int KienSo { get; set; }
    public string ContentType { get; set; } = "image/jpeg";
    public byte[] Data { get; set; } = [];
}

// ---- Bảng CRM có sẵn — CHỈ ĐỌC (tên khách, tên nhân viên, đăng nhập) ---------------------------------------------------------------------------

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
    public DbSet<PickupBooking> Bookings => Set<PickupBooking>();
    public DbSet<PickupBookingLine> Lines => Set<PickupBookingLine>();
    public DbSet<PickupBookingKien> Kiens => Set<PickupBookingKien>();
    public DbSet<PickupBookingKienAnh> Anhs => Set<PickupBookingKienAnh>();
    public DbSet<Customer> Customers => Set<Customer>();
    public DbSet<User> Users => Set<User>();
    public DbSet<BaseCode> BaseCodes => Set<BaseCode>();

    protected override void OnModelCreating(ModelBuilder m)
    {
        m.Entity<PickupBooking>(b =>
        {
            b.ToTable("Pickup_Booking");
            b.HasKey(e => e.Id);
            b.Property(e => e.Id).HasColumnName("Booking_ID").ValueGeneratedOnAdd();
            b.Property(e => e.Code).HasColumnName("Booking_Code").HasMaxLength(20).ValueGeneratedOnAddOrUpdate();   // cột tính toán PERSISTED
            b.Property(e => e.Code).Metadata.SetAfterSaveBehavior(PropertySaveBehavior.Ignore);
            b.Property(e => e.CustomerId).HasColumnName("Customer_ID");
            b.Property(e => e.StaffId).HasColumnName("Staff_ID");
            b.Property(e => e.ContactName).HasColumnName("Contact_Name").HasMaxLength(200);
            b.Property(e => e.ContactPhone).HasColumnName("Contact_Phone").HasMaxLength(100);
            b.Property(e => e.PickupAddress).HasColumnName("Pickup_Address").HasMaxLength(500);
            b.Property(e => e.PlanDate).HasColumnName("Plan_Date");
            b.Property(e => e.Note).HasColumnName("Note").HasMaxLength(300);
            b.Property(e => e.TrangThai).HasColumnName("Trang_Thai");
            b.Property(e => e.CreateDate).HasColumnName("Create_Date");
            b.Property(e => e.ReceivedDate).HasColumnName("Received_Date");
            b.Property(e => e.ReceivedBy).HasColumnName("Received_By");
            b.HasMany(e => e.Lines).WithOne().HasForeignKey(l => l.BookingId);
        });
        m.Entity<PickupBookingLine>(b =>
        {
            b.ToTable("Pickup_Booking_Line");
            b.HasKey(e => e.Id);
            b.Property(e => e.Id).HasColumnName("ID").ValueGeneratedOnAdd();
            b.Property(e => e.BookingId).HasColumnName("Booking_ID");
            b.Property(e => e.MoTa).HasColumnName("Mo_Ta").HasMaxLength(300);
            b.Property(e => e.SoKien).HasColumnName("So_Kien");
            b.Property(e => e.KgDuKien).HasColumnName("Kg_DuKien").HasColumnType("decimal(10,2)");
            b.Property(e => e.MaVanDonId).HasColumnName("MaVanDon_ID");
        });
        m.Entity<PickupBookingKien>(b =>
        {
            b.ToTable("Pickup_Booking_Kien");
            b.HasKey(e => new { e.BookingId, e.KienSo });
            b.Property(e => e.BookingId).HasColumnName("Booking_ID").ValueGeneratedNever();
            b.Property(e => e.KienSo).HasColumnName("Kien_So").ValueGeneratedNever();
            b.Property(e => e.TrongLuong).HasColumnName("Trong_Luong").HasColumnType("decimal(10,2)");
            b.Property(e => e.QuiDoi).HasColumnName("Qui_Doi").HasColumnType("decimal(10,2)");
            b.Property(e => e.ChargeWeight).HasColumnName("Charge_Weight").HasColumnType("decimal(10,2)");
            b.Property(e => e.CreateDate).HasColumnName("Create_Date");
            b.Property(e => e.CreateBy).HasColumnName("Create_By");
        });
        m.Entity<PickupBookingKienAnh>(b =>
        {
            b.ToTable("Pickup_Booking_Kien_Anh");
            b.HasKey(e => new { e.BookingId, e.KienSo });
            b.Property(e => e.BookingId).HasColumnName("Booking_ID").ValueGeneratedNever();
            b.Property(e => e.KienSo).HasColumnName("Kien_So").ValueGeneratedNever();
            b.Property(e => e.ContentType).HasMaxLength(30);
        });
        m.Entity<Customer>(b => { b.ToTable("TCustomer"); b.HasKey(e => e.CustomerID); b.Property(e => e.CustomerID).ValueGeneratedNever(); });
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
