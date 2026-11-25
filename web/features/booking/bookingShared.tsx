import StatusBadge from '@/shared/kit/StatusBadge'

/** Lệnh pickup = vận đơn nháp CRM (MaVanDon), mã quét B<ID>. */
export interface BookingRow {
  id: number; code: string; customerId: number | null; customerName: string | null; staffName: string | null
  planDate: string | null; trangThai: number; createDate: string | null; soKienBook: number; soKienNhan: number; kg: number | null
  tenHang: string | null; orderNumber: number | null; saleName: string
}
/** Lệnh bảng Pickup chưa gắn vận đơn (tab Pickup của kho). */
export interface PickupRow {
  pickupId: number; customerId: number | null; customerName: string | null; staffName: string; pickDate: string; soKienBook: number; note: string | null
}
export interface BookingDetail {
  id: number; code: string; customerId: number | null; customerName: string | null; customerPhone: string | null; staffName: string | null
  contactName: string | null; contactPhone: string | null; pickupAddress: string | null; planDate: string | null; tenHang: string | null; note: string | null
  trangThai: number; createDate: string | null; receivedDate: string | null; soKienBook: number; kgDuKien: number | null; orderNumber: number | null
  kiens: BookingKien[]; saleName: string
}
export interface BookingKien {
  kienSo: number; loai: 'CARTON' | 'TUI'; dai: number; rong: number; cao: number; trongLuong: number; quiDoi: number; chargeWeight: number; hasPhoto: boolean
}

/** Trạng thái suy ra ở API (Bookings.StatusOf): 0 chưa kiện nào · 1 đã có kiện · 2 kho đã nhận đủ/bấm Xong · 3 CRM đã in bill (khoá sửa). */
export const BOOKING_STATUS = [
  { value: 0, label: 'Chưa nhận', tone: 'amber' as const },
  { value: 1, label: 'Đang nhận', tone: 'blue' as const },
  { value: 2, label: '✓ Đã nhận đủ', tone: 'green' as const },
  { value: 3, label: '🔒 Đã có bill', tone: 'gray' as const },
]

/** Nhãn trạng thái; "Đang nhận" kèm số kiện (2/5) để kho biết còn bao nhiêu. */
export function BookingStatus({ value, nhan, khai }: { value: number; nhan?: number; khai?: number }) {
  const s = BOOKING_STATUS.find((x) => x.value === value) ?? BOOKING_STATUS[0]
  const count = value === 1 && nhan ? ` ${nhan}${khai ? `/${khai}` : ''} kiện` : ''
  return <StatusBadge tone={s.tone}>{s.label}{count}</StatusBadge>
}

/** Ô nhập kg: bàn phím iPhone tiếng Việt có dấu phẩy thập phân ⇒ đổi "," thành ".", chỉ giữ chữ số và 1 dấu chấm. */
export function toDecimal(v: string): string {
  const [int, ...rest] = v.replace(/,/g, '.').replace(/[^\d.]/g, '').split('.')
  return rest.length ? `${int}.${rest.join('')}` : int
}
