import StatusBadge from '@/shared/kit/StatusBadge'

export interface BookingRow {
  id: number; code: string; customerId: number; customerName: string | null; staffId: number; staffName: string | null
  planDate: string | null; trangThai: number; createDate: string; tongSoKien: number; tongKg: number | null; note: string | null
}
export interface BookingLine { id: number; moTa: string | null; soKien: number; kgDuKien: number | null; maVanDonId: number | null }
export interface BookingDetail {
  id: number; code: string; customerId: number; customerName: string | null; customerPhone: string | null; staffId: number; staffName: string | null
  contactName: string | null; contactPhone: string | null; pickupAddress: string | null; planDate: string | null; note: string | null
  trangThai: number; createDate: string; receivedDate: string | null; lines: BookingLine[]; kiens: BookingKien[]
}
export interface BookingKien { kienSo: number; dai: number; rong: number; cao: number; trongLuong: number; quiDoi: number; chargeWeight: number; hasPhoto: boolean }

/** 0 đã book · 1 kho đã nhận · 2 huỷ (db/add_pickup_booking.sql) */
export const BOOKING_STATUS = [
  { value: 0, label: 'Đã book', tone: 'amber' as const },
  { value: 1, label: 'Kho đã nhận', tone: 'green' as const },
  { value: 2, label: 'Đã huỷ', tone: 'red' as const },
]

export function BookingStatus({ value }: { value: number }) {
  const s = BOOKING_STATUS.find((x) => x.value === value) ?? BOOKING_STATUS[0]
  return <StatusBadge tone={s.tone}>{s.label}</StatusBadge>
}
