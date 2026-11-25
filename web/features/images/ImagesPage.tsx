'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { ExternalLink, ImageOff, Loader2, Search, X } from 'lucide-react'
import { ErrorBox, PageHeader } from '@/shared/kit/Page'
import { DateField } from '@/shared/kit/Fields'
import { scaleImageUrl } from '@/shared/kit/ScaleImage'
import { useApi, qs, type Paged } from '@/shared/lib/hooks'
import { fmtDateTime, todayInput } from '@/shared/lib/format'

interface ImageRow {
  id: number; barcode: string; maVanDonId: number; code: string; kienSo: number | null
  customerName: string | null; orderNumber: number | null; createDate: string | null; size: number
}

const PAGE_SIZE = 48
const photoUrl = (r: ImageRow) => scaleImageUrl(`/api/pickup-bookings/${r.maVanDonId}/kien/${r.kienSo ?? 1}/photo`)
const kb = (n: number) => (n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.round(n / 1024)} KB`)

/** Quản trị hình ảnh kiện (tạm): ảnh kho đã chụp, lọc theo ngày / khách / mã; bấm ảnh để xem lớn và mở vận đơn. Chỉ xem. */
export default function ImagesPage() {
  const [from, setFrom] = useState(todayInput(-6))
  const [to, setTo] = useState(todayInput())
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [open, setOpen] = useState<ImageRow | null>(null)
  const { data, error, isLoading } = useApi<Paged<ImageRow>>(`/api/images${qs({ fromDate: from, toDate: to, search: search.trim(), page, pageSize: PAGE_SIZE })}`)
  const pages = Math.max(1, Math.ceil((data?.totalCount ?? 0) / PAGE_SIZE))

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(null) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader title="Hình ảnh kiện" subtitle={data ? `${data.totalCount} ảnh` : 'Ảnh kho chụp khi nhận kiện'} />

      <div className="mb-4 grid gap-3 sm:grid-cols-[1fr_auto_auto]">
        <div className="relative">
          <Search size={18} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" aria-hidden />
          <input value={search} aria-label="Tìm ảnh" placeholder="Tên khách, mã B…, số bill" autoComplete="off"
            onChange={(e) => { setSearch(e.target.value); setPage(1) }}
            className="h-11 w-full rounded-lg border border-border bg-surface pl-10 pr-3 text-[15px] outline-none focus:border-primary focus:ring-2 focus:ring-primary/20" />
        </div>
        <DateField label="Từ ngày" value={from} onChange={(v) => { setFrom(v); setPage(1) }} className="h-11" />
        <DateField label="Đến ngày" value={to} onChange={(v) => { setTo(v); setPage(1) }} className="h-11" />
      </div>

      {error && <ErrorBox message={error.message} />}
      {isLoading && !data && <p className="flex items-center gap-2 py-4 text-[13px] text-text-muted"><Loader2 className="animate-spin" size={16} /> Đang tải…</p>}
      {data && data.items.length === 0 && (
        <div className="flex flex-col items-center gap-2 py-12 text-[14px] text-text-muted"><ImageOff size={28} aria-hidden /> Không có ảnh nào trong khoảng này.</div>
      )}

      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
        {data?.items.map((r) => (
          <li key={r.id}>
            <button type="button" onClick={() => setOpen(r)} className="block w-full overflow-hidden rounded-lg border border-border bg-surface text-left hover:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30">
              {/* eslint-disable-next-line @next/next/no-img-element -- ảnh qua proxy có cookie, không dùng next/image */}
              <img src={photoUrl(r)} alt={`Ảnh ${r.code} kiện ${r.kienSo ?? ''}`} loading="lazy" className="aspect-square w-full bg-slate-100 object-cover" />
              <span className="block px-2.5 py-2">
                <span className="block truncate text-[13.5px] font-semibold text-text-primary">{r.code}{r.kienSo ? ` · kiện ${r.kienSo}` : ''}</span>
                <span className="block truncate text-[12.5px] text-text-secondary">{r.customerName ?? '—'}</span>
                <span className="block truncate text-[12px] text-text-muted">{fmtDateTime(r.createDate)}</span>
              </span>
            </button>
          </li>
        ))}
      </ul>

      {pages > 1 && (
        <div className="mt-4 flex items-center justify-between gap-2">
          <button type="button" disabled={page <= 1} onClick={() => setPage(page - 1)} className="h-11 rounded-lg border border-border bg-surface px-4 text-[13.5px] disabled:opacity-40">Trước</button>
          <span className="text-[13px] text-text-muted">Trang {page}/{pages}</span>
          <button type="button" disabled={page >= pages} onClick={() => setPage(page + 1)} className="h-11 rounded-lg border border-border bg-surface px-4 text-[13.5px] disabled:opacity-40">Sau</button>
        </div>
      )}

      {open && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/70 p-3" onClick={() => setOpen(null)}>
          <div role="dialog" aria-modal="true" aria-label={`Ảnh ${open.code}`} onClick={(e) => e.stopPropagation()}
            className="flex max-h-full w-full max-w-3xl flex-col overflow-hidden rounded-xl bg-surface">
            <div className="flex items-center gap-2 border-b border-border px-4 py-2">
              <p className="min-w-0 flex-1 truncate text-[15px] font-semibold text-text-primary">{open.code}{open.kienSo ? ` · kiện ${open.kienSo}` : ''}</p>
              <button type="button" aria-label="Đóng" onClick={() => setOpen(null)} className="grid h-11 w-11 place-items-center rounded-lg text-text-muted hover:bg-slate-100"><X size={20} /></button>
            </div>
            {/* eslint-disable-next-line @next/next/no-img-element -- ảnh qua proxy có cookie */}
            <img src={photoUrl(open)} alt={`Ảnh ${open.code} kiện ${open.kienSo ?? ''}`} className="min-h-0 flex-1 bg-black object-contain" />
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-border px-4 py-3 text-[13px] text-text-secondary">
              <span>{open.customerName ?? '—'}</span>
              <span>{fmtDateTime(open.createDate)}</span>
              <span>{kb(open.size)}</span>
              <span>Mã ảnh: {open.barcode}</span>
              {open.orderNumber && <span>Bill: <strong className="text-text-primary">{open.orderNumber}</strong></span>}
              <Link href={`/${open.maVanDonId}`} className="ml-auto inline-flex h-11 items-center gap-1.5 rounded-lg bg-primary px-4 font-semibold text-white hover:bg-primary-dark">
                <ExternalLink size={16} aria-hidden /> Mở vận đơn
              </Link>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
