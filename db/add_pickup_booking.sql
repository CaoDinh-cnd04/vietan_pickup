-- ADR-052: LỆNH BOOK PICKUP (sale/CS book cho khách) — chức năng MỚI, hệ cũ không có. Mã pickup (PK000123) in thành QR dán/đưa giao nhận.
-- 2 bảng MỚI (đầu + dòng). KHÔNG dùng lại Pickup/PickupDetail của legacy: đó là phiên quét kiện theo số bill (PickupDetail.OrderNumber NOT NULL,
-- trigger PickupDetail_Update_Pickup ghi đè Customer_ID từ Orders, SP p_Pickup_Rows liệt kê mọi dòng Pickup) — trộn vào sẽ làm bẩn màn hệ cũ.
-- Idempotent; bảng mới, hệ cũ không đọc/ghi.
-- Chạy: sqlcmd -S . -E -C -d vietanexpress -I -f 65001 -i db\add_pickup_booking.sql   (backup DB trước khi chạy)

IF OBJECT_ID('dbo.Pickup_Booking', 'U') IS NULL
    CREATE TABLE dbo.Pickup_Booking (
        Booking_ID     bigint IDENTITY(1,1) NOT NULL PRIMARY KEY,
        Booking_Code   AS ('PK' + RIGHT('000000' + CAST(Booking_ID AS varchar(12)), 6)) PERSISTED,   -- mã in trên QR, không race
        Customer_ID    bigint        NOT NULL,
        Staff_ID       int           NOT NULL,                  -- sale/CS book
        Contact_Name   nvarchar(200) NULL,
        Contact_Phone  nvarchar(100) NULL,
        Pickup_Address nvarchar(500) NULL,
        Plan_Date      datetime      NULL,                      -- hẹn giờ lấy hàng
        Note           nvarchar(300) NULL,
        Trang_Thai     int           NOT NULL DEFAULT 0,        -- 0 đã book, 1 kho đã nhận, 2 huỷ
        Create_Date    datetime      NOT NULL DEFAULT GETDATE(),
        Received_Date  datetime      NULL,
        Received_By    int           NULL
    );
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID('dbo.Pickup_Booking') AND name = 'UX_Pickup_Booking_Code')
    CREATE UNIQUE INDEX UX_Pickup_Booking_Code ON dbo.Pickup_Booking (Booking_Code);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID('dbo.Pickup_Booking') AND name = 'IX_Pickup_Booking_Customer')
    CREATE INDEX IX_Pickup_Booking_Customer ON dbo.Pickup_Booking (Customer_ID, Create_Date DESC);
GO

IF OBJECT_ID('dbo.Pickup_Booking_Line', 'U') IS NULL
    CREATE TABLE dbo.Pickup_Booking_Line (
        ID          bigint IDENTITY(1,1) NOT NULL PRIMARY KEY,
        Booking_ID  bigint        NOT NULL REFERENCES dbo.Pickup_Booking (Booking_ID),
        Mo_Ta       nvarchar(300) NULL,                          -- mô tả hàng
        So_Kien     int           NOT NULL DEFAULT 1,
        Kg_DuKien   decimal(10,2) NULL,
        MaVanDon_ID bigint        NULL                           -- gắn vận đơn khi kho nhận / lập bill
    );
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID('dbo.Pickup_Booking_Line') AND name = 'IX_Pickup_Booking_Line_Booking')
    CREATE INDEX IX_Pickup_Booking_Line_Booking ON dbo.Pickup_Booking_Line (Booking_ID);
GO

-- Kho nhận hàng theo lệnh (ADR-053): mỗi kiện thực nhận = 1 dòng (kích thước + cân), ảnh ở bảng riêng để SELECT kích thước không kéo nhị phân.
-- Quy đổi/cân tính cước do server tính (cùng công thức legacy: dài×rộng×cao/5000, làm tròn lên rồi lùi 0,5 nếu gần hơn; cân tính cước = max(cân thực, quy đổi)).
IF OBJECT_ID('dbo.Pickup_Booking_Kien', 'U') IS NULL
    CREATE TABLE dbo.Pickup_Booking_Kien (
        Booking_ID    bigint        NOT NULL REFERENCES dbo.Pickup_Booking (Booking_ID),
        Kien_So       int           NOT NULL,
        Dai           int           NOT NULL,
        Rong          int           NOT NULL,
        Cao           int           NOT NULL,
        Trong_Luong   decimal(10,2) NOT NULL,
        Qui_Doi       decimal(10,2) NOT NULL,
        Charge_Weight decimal(10,2) NOT NULL,
        Create_Date   datetime      NOT NULL DEFAULT GETDATE(),
        Create_By     int           NULL,
        CONSTRAINT PK_Pickup_Booking_Kien PRIMARY KEY (Booking_ID, Kien_So)
    );
GO
IF OBJECT_ID('dbo.Pickup_Booking_Kien_Anh', 'U') IS NULL
    CREATE TABLE dbo.Pickup_Booking_Kien_Anh (
        Booking_ID  bigint         NOT NULL,
        Kien_So     int            NOT NULL,
        ContentType varchar(30)    NOT NULL,
        Data        varbinary(max) NOT NULL,
        CONSTRAINT PK_Pickup_Booking_Kien_Anh PRIMARY KEY (Booking_ID, Kien_So),
        CONSTRAINT FK_Pickup_Booking_Kien_Anh FOREIGN KEY (Booking_ID, Kien_So) REFERENCES dbo.Pickup_Booking_Kien (Booking_ID, Kien_So)
    );
GO
