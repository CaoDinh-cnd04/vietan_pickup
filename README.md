# Việt An Pickup

Book pickup + QR + kho nhận hàng. **Dự án riêng, chỉ kết nối SQL Server** (DB `vietanexpress` dùng chung với CRM) — không phụ thuộc code CRM.

## Luồng
1. Sale/CS **book pickup** cho khách → mã `PK000123` + QR (QR chỉ chứa mã; tên khách/nhân viên tra từ DB khi quét).
2. Giao nhận cầm phiếu QR đi lấy hàng.
3. Kho **quét mã** ở trang danh sách → mở lệnh → bấm **Nhận hàng kho** → mỗi kiện một thao tác (ảnh + dài/rộng/cao/cân). Quy đổi và cân tính cước server tự tính (dài×rộng×cao/5000, lấy số lớn hơn giữa cân thực và quy đổi). Đủ số kiện khai thì tự chốt "kho đã nhận".
4. Kinh doanh mở lệnh PK để xem kích thước kiện và lập bill.

Ba trang: `/` (danh sách + ô quét/tìm), `/new` (book mới), `/[id]` (phiếu QR + nhận kiện).

## Bảng SQL
| Bảng | Vai trò |
|---|---|
| `Pickup_Booking`, `Pickup_Booking_Line`, `Pickup_Booking_Kien`, `Pickup_Booking_Kien_Anh` | **Mới, dự án này sở hữu** — script `db/add_pickup_booking.sql` (idempotent, đã chạy DB local, CHƯA chạy production) |
| `TCustomer`, `USERS`, `TBaseCode` | CRM — chỉ ĐỌC (tên khách, đăng nhập, khung giờ chặn) |

Đăng nhập dùng bảng `USERS` theo luật legacy (ngoài giờ → STATUS=ACTIVE → bcrypt / MD5-lossy / plaintext), **không ghi ngược** vào `USERS`.

## Chạy
```powershell
# API (http://localhost:5090)
cd api
copy appsettings.Development.example.json appsettings.Development.json   # sửa chuỗi kết nối + khoá JWT
$env:ASPNETCORE_ENVIRONMENT='Development'; dotnet run

# Web (http://localhost:3010)
cd web; npm install; npm run dev
```
Chạy script DB trên máy local trước: `db/add_pickup_booking.sql`. **Không chạy trên server công ty** tới khi deploy.

`PICKUP_API_URL` (web) trỏ tới API, mặc định `http://localhost:5090`. Không commit `appsettings.Development.json`.
