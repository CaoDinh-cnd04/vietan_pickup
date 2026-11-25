import { Search } from 'lucide-react'
import { cn } from '@/shared/lib/utils'

/** Ô tìm kiếm có icon, cao 44px (đủ chạm trên điện thoại). */
export function SearchBox({ value, onChange, placeholder, label }: { value: string; onChange: (v: string) => void; placeholder: string; label: string }) {
  return (
    <div className="relative">
      <Search size={18} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" aria-hidden />
      <input value={value} aria-label={label} placeholder={placeholder} autoComplete="off" onChange={(e) => onChange(e.target.value)}
        className="h-11 w-full rounded-lg border border-border bg-surface pl-10 pr-3 text-[15px] outline-none focus:border-primary focus:ring-2 focus:ring-primary/20" />
    </div>
  )
}

/** Ô chọn có nhãn đặt trong ô (kiểu bộ lọc CMS). */
export function SelectBox<T extends string | number>({ label, value, onChange, options }: {
  label: string; value: T; onChange: (v: T) => void; options: ReadonlyArray<{ value: T; label: string }>
}) {
  return (
    <label className="flex h-11 items-center gap-2 rounded-lg border border-border bg-surface px-3 text-[13.5px] focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/20">
      <span className="shrink-0 text-text-muted">{label}</span>
      <select value={String(value)} onChange={(e) => onChange((typeof value === 'number' ? Number(e.target.value) : e.target.value) as T)}
        className="min-w-0 flex-1 bg-transparent font-medium text-text-primary outline-none">
        {options.map((o) => <option key={String(o.value)} value={String(o.value)}>{o.label}</option>)}
      </select>
    </label>
  )
}

/** Ô ngày có nhãn đặt trong ô. */
export function DateBox({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="flex h-11 items-center gap-2 rounded-lg border border-border bg-surface px-3 text-[13.5px] focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/20">
      <span className="shrink-0 text-text-muted">{label}</span>
      <input type="date" value={value} onChange={(e) => onChange(e.target.value)} className="min-w-0 flex-1 bg-transparent font-medium text-text-primary outline-none" />
    </label>
  )
}

/** Khung bảng quản lý: cuộn ngang trên màn hẹp, đầu bảng xanh nhạt, dòng so le (như CMS). */
export function DataTable({ head, children, empty, loading }: { head: React.ReactNode; children: React.ReactNode; empty?: string | null; loading?: boolean }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-border bg-surface" aria-busy={loading}>
      <table className="w-full min-w-[720px] text-[13.5px]">
        <thead className="bg-primary-light text-left text-[12.5px] text-primary-dark [&_th]:whitespace-nowrap [&_th]:px-3 [&_th]:py-2.5 [&_th]:font-semibold">{head}</thead>
        <tbody className="[&_td]:px-3 [&_td]:py-2.5 [&_td]:align-top [&_tr:nth-child(even)]:bg-background [&_tr]:border-t [&_tr]:border-border/70">{children}</tbody>
      </table>
      {empty && <p className="px-4 py-10 text-center text-[14px] text-text-muted">{empty}</p>}
    </div>
  )
}

/** Chân bảng: tổng số dòng + phân trang. */
export function Pager({ page, pages, total, onPage }: { page: number; pages: number; total?: number; onPage: (p: number) => void }) {
  return (
    <div className="mt-3 flex items-center justify-between gap-2 text-[13px] text-text-muted">
      <span>{total != null ? `${total} dòng` : ''}</span>
      {pages > 1 && (
        <div className="flex items-center gap-2">
          <button type="button" disabled={page <= 1} onClick={() => onPage(page - 1)} className="h-11 rounded-lg border border-border bg-surface px-4 text-text-secondary disabled:opacity-40">Trước</button>
          <span>Trang {page}/{pages}</span>
          <button type="button" disabled={page >= pages} onClick={() => onPage(page + 1)} className="h-11 rounded-lg border border-border bg-surface px-4 text-text-secondary disabled:opacity-40">Sau</button>
        </div>
      )}
    </div>
  )
}

/** Ảnh thu nhỏ trong bảng (ID_Hinh) — bấm để xem lớn. */
export function Thumb({ idHinh, alt, onOpen, className }: { idHinh: number; alt: string; onOpen?: () => void; className?: string }) {
  return (
    <button type="button" onClick={onOpen} aria-label={`Xem ${alt}`} className={cn('block shrink-0 overflow-hidden rounded-md border border-border', className)}>
      {/* eslint-disable-next-line @next/next/no-img-element -- ảnh qua proxy có cookie */}
      <img src={imageUrl(idHinh)} alt={alt} loading="lazy" className="h-12 w-12 bg-slate-100 object-cover" />
    </button>
  )
}

export const imageUrl = (idHinh: number) => `/api/proxy?path=${encodeURIComponent(`/api/images/${idHinh}`)}`

/** Xem ảnh lớn (Esc / bấm nền để đóng). */
export function Lightbox({ idHinh, title, footer, onClose }: { idHinh: number; title: string; footer?: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/70 p-3" onClick={onClose}
      onKeyDown={(e) => { if (e.key === 'Escape') onClose() }}>
      <div role="dialog" aria-modal="true" aria-label={title} onClick={(e) => e.stopPropagation()} className="flex max-h-full w-full max-w-3xl flex-col overflow-hidden rounded-xl bg-surface">
        <div className="flex items-center gap-2 border-b border-border px-4 py-2">
          <p className="min-w-0 flex-1 truncate text-[15px] font-semibold text-text-primary">{title}</p>
          <button type="button" autoFocus aria-label="Đóng" onClick={onClose} className="grid h-11 w-11 place-items-center rounded-lg text-[22px] leading-none text-text-muted hover:bg-slate-100">×</button>
        </div>
        {/* eslint-disable-next-line @next/next/no-img-element -- ảnh qua proxy có cookie */}
        <img src={imageUrl(idHinh)} alt={title} className="min-h-0 flex-1 bg-black object-contain" />
        {footer && <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-border px-4 py-3 text-[13px] text-text-secondary">{footer}</div>}
      </div>
    </div>
  )
}
