import StatusBadge from '@/shared/kit/StatusBadge'

/** Lệnh pickup = vận đơn nháp CRM (MaVanDon), mã quét B<ID>. */
export interface BookingRow {
  id: number; code: string; customerId: number | null; customerName: string | null; staffName: string | null
  planDate: string | null; trangThai: number; createDate: string | null; soKienBook: number; soKienNhan: number; kg: number | null
  tenHang: string | null; orderNumber: number | null
}
export interface BookingDetail {
  id: number; code: string; customerId: number | null; customerName: string | null; customerPhone: string | null; staffName: string | null
  contactName: string | null; contactPhone: string | null; pickupAddress: string | null; planDate: string | null; tenHang: string | null; note: string | null
  trangThai: number; createDate: string | null; receivedDate: string | null; soKienBook: number; kgDuKien: number | null; orderNumber: number | null
  kiens: BookingKien[]
}
export interface BookingKien {
  kienSo: number; loai: 'CARTON' | 'TUI'; dai: number; rong: number; cao: number; trongLuong: number; quiDoi: number; chargeWeight: number; hasPhoto: boolean
}

/** Trạng thái suy ra ở API (Bookings.StatusOf): chưa kiện nào · đã có kiện · kho chốt · CRM đã in bill (khoá sửa). */
export const BOOKING_STATUS = [
  { value: 0, label: 'Chờ lấy', tone: 'amber' as const },
  { value: 1, label: 'Đang nhận', tone: 'blue' as const },
  { value: 2, label: 'Kho đã nhận', tone: 'green' as const },
  { value: 3, label: 'Đã lập bill', tone: 'gray' as const },
]

export function BookingStatus({ value }: { value: number }) {
  const s = BOOKING_STATUS.find((x) => x.value === value) ?? BOOKING_STATUS[0]
  return <StatusBadge tone={s.tone}>{s.label}</StatusBadge>
}
