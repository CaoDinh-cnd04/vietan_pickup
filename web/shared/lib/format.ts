/** Định dạng hiển thị dùng chung (vi-VN). */
const num = new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 2 })
const int = new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 0 })

export function fmtNumber(v: number | null | undefined): string {
  return v == null ? '' : num.format(v)
}

export function fmtInt(v: number | null | undefined): string {
  return v == null ? '' : int.format(v)
}

export function fmtDate(v: string | Date | null | undefined): string {
  if (!v) return ''
  const d = typeof v === 'string' ? new Date(v) : v
  if (Number.isNaN(d.getTime())) return ''
  // dd/MM/yyyy có đệm 0 như legacy ({0:dd/MM/yyyy}) — "01/10/2026", không "1/10/2026"
  return d.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

export function fmtDateTime(v: string | Date | null | undefined): string {
  if (!v) return ''
  const d = typeof v === 'string' ? new Date(v) : v
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleString('vi-VN', { hour12: false })
}

/** yyyy-MM-dd cho <input type="date">. */
export function toInputDate(v: string | Date | null | undefined): string {
  if (!v) return ''
  const d = typeof v === 'string' ? new Date(v) : v
  if (Number.isNaN(d.getTime())) return ''
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

export function todayInput(offsetDays = 0): string {
  const d = new Date()
  d.setDate(d.getDate() + offsetDays)
  return toInputDate(d)
}

/** Đúng công thức JS của legacy: dài × rộng × cao / 5000, làm tròn lên rồi lùi 0,5 nếu gần hơn. */
export function quiDoi(dai: number, rong: number, cao: number): number {
  const raw = (dai * rong * cao) / 5000
  const up = Math.ceil(raw)
  return up - 0.5 > raw ? up - 0.5 : up
}
