# Việt An Pickup

Book pickup + QR + kho nhận hàng (có AI đọc ảnh kiện). **Dự án riêng, chỉ kết nối SQL Server** (DB `vietanexpress` dùng chung với CRM), không phụ thuộc code CRM và **không có bảng riêng**: ghi thẳng vào bảng CRM theo đúng quy ước bên CRM (ADR-050/051).

## Luồng
App chỉ dành cho **kho**. Sale/CS tạo lệnh ở hệ khác (CRM); app đọc ra cho kho, chia 2 tab theo nguồn và chỉ hiện việc còn phải làm:
1. **Tab Pickup**: lệnh trong bảng `Pickup` chưa chốt (`Pick_Date_End` trống), `Pick_Date` trong 7 ngày, chưa gắn vận đơn. Chạm 1 lệnh ⇒ tạo **vận đơn nháp** `MaVanDon` cho khách của lệnh, gắn vào lệnh (`Note = "B<ID>[ - ghi chú cũ]"`) rồi vào màn nhận kiện (`api/Pickups.cs`). Từ đó lệnh nằm ở tab Vận đơn.
2. **Tab Vận đơn**: `MaVanDon` nháp (chưa số bill) chưa nhận xong, 60 ngày gần nhất.
3. **Khách tự mang hàng tới kho**: *Nhận tại kho* → chọn khách → vào thẳng màn nhận kiện (không khai trước số kiện, bấm *Xong* để chốt).
4. Nhận đủ số kiện khai (hoặc bấm *Xong*) ⇒ chốt "kho đã nhận" và đơn **biến mất** khỏi danh sách.
5. **Kho quét mã** (`B<ID>`, `B<ID>/kiện` hoặc số bill 7 số) → vào **thẳng** màn nhận kiện. Mỗi kiện: **chụp ảnh → AI điền sẵn** dài/rộng/cao/cân/loại → người kho kiểm → Lưu. Quy đổi `D×R×C/5000` (làm tròn lên bước 0,5) và cân tính cước = max(cân thực, quy đổi) do server tính. Đủ số kiện khai thì tự chốt "kho đã nhận".
6. **Kinh doanh** mở vận đơn nháp trong CRM (kích thước kiện, ảnh đã có sẵn), bổ sung người nhận rồi **In** — CRM cấp số bill và từ đó khoá sửa; app này cũng chỉ còn xem.

Trạng thái (suy ra, không lưu): Chờ lấy (chưa kiện nào) · Đang nhận · Kho đã nhận (`Pickup.Pick_Date_End`) · Đã lập bill (`MaVanDon.OrderNumber`).

## Bảng SQL (tất cả là bảng CRM)
| Bảng | App ghi gì |
|---|---|
| `MaVanDon` | Tạo vận đơn nháp như CRM (Status=1, AWB="", ConsigneeEmail="", CustomerName=SenderName=tên khách, Customer_Staff_ID = NV phụ trách khách, DateTime_Pickup_Est = hẹn giờ). Khi nhận kiện: cập nhật `So_Kien`, `Trong_Luong` = tổng cân thực. Huỷ = xoá thật (chỉ lệnh app tạo, chưa nhận kiện). Đã có `OrderNumber` ⇒ không ghi nữa. |
| `MaVanDon_PCS_DIM` | 1 dòng / kiện; **kiện k = dòng thứ k theo ID** (quy ước `p_MVD_Get_PCS_DIM`). Trigger CRM `MaVanDon_PCS_DIM_Create_DIM` tự cập nhật `Order_MaVanDon_MNF.DIM`. |
| `Pickup` | 1 dòng / lệnh, liên kết bằng `Note = "B<ID>"` (hoặc `"B<ID> - ghi chú"`). `Total_So_kien_Bill` = số khai, `Total_So_kien_Nhan`/`Total_So_Kg` = thực nhận, `Pick_Date_End` = lúc chốt. `Trang_Thai` luôn 1 để màn quét hệ cũ (`p_Prickup_Get_Last` tìm phiên `Trang_Thai=0`) không nối kiện bill khác vào. **Không ghi `PickupDetail`** (cột số bill bắt buộc — chưa có lúc nhận). |
| `AHinhAnh_Order` + `AHinhAnh_Order_Data` | Ảnh kiện: Barcode `B<ID>_<kiện>`, ImageType `DIM`, `MaVanDon_ID`, 1 ảnh/kiện (chụp lại = thay dữ liệu). CRM đổi sang `<số bill>_<kiện>` khi in bill. |
| `TCustomer`, `USERS`, `TBaseCode` | Chỉ ĐỌC (khách, đăng nhập, khung giờ chặn). |

4 bảng `Pickup_Booking*` của bản trước không còn dùng — dọn trên DB local bằng `db/drop_pickup_booking_old.sql` (chạy tay, sau khi backup).

Đăng nhập dùng bảng `USERS` theo luật legacy (ngoài giờ → STATUS=ACTIVE → bcrypt / MD5-lossy / plaintext), **không ghi ngược** vào `USERS`.

## AI đọc ảnh kiện
`POST /api/ai/kien-photo` (`api/KienAi.cs`) gửi ảnh (đã nén ở trình duyệt) tới Gemini (`gemini-3.5-flash`, thinking low cho nhanh), nhận JSON: dài/rộng/cao, cân, loại thùng/túi, nguồn số đo, ghi chú.
- **Cân** chỉ điền khi đọc được số trên màn hình cân trong ảnh — ảnh không cho biết khối lượng.
- **Kích thước**: đọc thước/nhãn nếu có, không thì *ước lượng* (ô gắn nhãn "AI ước lượng").
- Ô AI điền có viền vàng + nhãn "AI"; người kho sửa ô nào thì nhãn ô đó mất. Không bao giờ tự lưu.
- Khoá: `Gemini:ApiKey` trong `appsettings.Development.json` hoặc biến môi trường `GEMINI_API_KEY`. Không có khoá ⇒ AI tắt, app vẫn nhập tay bình thường.

## Chạy
```powershell
# API (http://localhost:5090)
cd api
copy appsettings.Development.example.json appsettings.Development.json   # sửa chuỗi kết nối, khoá JWT, khoá AI
$env:ASPNETCORE_ENVIRONMENT='Development'; dotnet run

# Web (http://localhost:3010)
cd web; npm install; npm run dev
```
`PICKUP_API_URL` (web) trỏ tới API, mặc định `http://localhost:5090`. Không commit `appsettings.Development.json`.
Quét QR bằng camera điện thoại cần HTTPS (vd `ngrok http 3010`).

⚠️ Bảng `MaVanDon`, `Pickup`, `MaVanDon_PCS_DIM`, `AHinhAnh_Order` ở production hiện do **hệ cũ ghi** (sổ `WRITE-OWNERSHIP.md` bên CRM) — thống nhất với chủ dự án trước khi cho app này ghi production.
