'use client'
import { useState } from 'react'
import Link from 'next/link'
import { ExternalLink, ImageOff, Loader2 } from 'lucide-react'
import { ErrorBox, PageHeader } from '@/shared/kit/Page'
import { DateBox, Lightbox, Pager, SearchBox, SelectBox, imageUrl } from '@/shared/kit/Admin'
import StatusBadge from '@/shared/kit/StatusBadge'
import { useApi, qs, type Paged } from '@/shared/lib/hooks'
import { fmtDateTime, todayInput } from '@/shared/lib/format'

interface ImageRow {
  id: number; barcode: string; maVanDonId: number; code: string; kienSo: number | null
  customerName: string | null; orderNumber: number | null; createDate: string | null; size: number; imageType: string | null; daNhap: boolean
}

const PAGE_SIZE = 48
const TYPES = [{ value: '', label: 'Tất cả' }, { value: 'DIM', label: 'Ảnh hàng hoá (DIM)' }, { value: 'Other', label: 'Ảnh kiện đóng gói' }] as const
const NHAP = [{ value: -1, label: 'Tất cả' }, { value: 0, label: 'Chưa nhập' }, { value: 1, label: 'Đã nhập' }] as const
const kb = (n: number) => (n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.round(n / 1024)} KB`)
const typeLabel = (t: string | null) => (t === 'Other' ? 'Ảnh kiện' : 'Ảnh hàng')
const title = (r: ImageRow) => `${r.barcode}${r.kienSo ? ` · kiện ${r.kienSo}` : ''}`

/**
 * Quản lý hình ảnh (AHinhAnh_Order gắn vận đơn): DIM (ảnh hàng hoá của kho, ảnh từng kiện của bước cuối) và Other (ảnh kiện đã đóng gói, gửi khách xem).
 * "Đã nhập" = Status_Nhap 1 (đã có số cân lại). Chỉ xem.
 */
export default function ImagesPage() {
  const [from, setFrom] = useState(todayInput(-6))
  const [to, setTo] = useState(todayInput())
  const [search, setSearch] = useState('')
  const [type, setType] = useState('')
  const [nhap, setNhap] = useState<number>(-1)
  const [page, setPage] = useState(1)
  const [open, setOpen] = useState<ImageRow | null>(null)
  const { data, error, isLoading } = useApi<Paged<ImageRow>>(`/api/images${qs({ fromDate: from, toDate: to, search: search.trim(), type, nhap, page, pageSize: PAGE_SIZE })}`)
  const pages = Math.max(1, Math.ceil((data?.totalCount ?? 0) / PAGE_SIZE))
  const reset = () => setPage(1)

  return (
    <div className="mx-auto max-w-7xl">
      <PageHeader title="Hình ảnh" subtitle="Ảnh kho chụp (hàng hoá, kiện đóng gói) và ảnh bước cuối cân lại." />
      <div className="mb-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-[1fr_auto_auto_auto_auto]">
        <SearchBox value={search} onChange={(v) => { setSearch(v); reset() }} placeholder="Tên khách, mã B…, số bill" label="Tìm ảnh" />
        <DateBox label="Từ" value={from} onChange={(v) => { setFrom(v); reset() }} />
        <DateBox label="Đến" value={to} onChange={(v) => { setTo(v); reset() }} />
        <SelectBox label="Loại" value={type} onChange={(v) => { setType(v); reset() }} options={TYPES} />
        <SelectBox label="Cân lại" value={nhap} onChange={(v) => { setNhap(v); reset() }} options={NHAP} />
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
              <img src={imageUrl(r.id)} alt={`Ảnh ${title(r)}`} loading="lazy" className="aspect-square w-full bg-slate-100 object-cover" />
              <span className="block px-2.5 py-2">
                <span className="block truncate text-[13.5px] font-semibold text-text-primary">{title(r)}</span>
                <span className="block truncate text-[12.5px] text-text-secondary">{r.customerName ?? '—'}</span>
                <span className="mt-1 flex flex-wrap items-center gap-1">
                  <StatusBadge tone={r.imageType === 'Other' ? 'blue' : 'gray'}>{typeLabel(r.imageType)}</StatusBadge>
                  {r.daNhap && <StatusBadge tone="green">Đã cân lại</StatusBadge>}
                </span>
                <span className="mt-1 block truncate text-[12px] text-text-muted">{fmtDateTime(r.createDate)}</span>
              </span>
            </button>
          </li>
        ))}
      </ul>
      <Pager page={page} pages={pages} total={data?.totalCount} onPage={setPage} />

      {open && (
        <Lightbox idHinh={open.id} title={`${typeLabel(open.imageType)} · ${title(open)}`} onClose={() => setOpen(null)} footer={<>
          <span>{open.customerName ?? '—'}</span>
          <span>{fmtDateTime(open.createDate)}</span>
          <span>{kb(open.size)}</span>
          {open.orderNumber && <span>Bill: <strong className="text-text-primary">{open.orderNumber}</strong></span>}
          <Link href={`/${open.maVanDonId}`} className="ml-auto inline-flex h-11 items-center gap-1.5 rounded-lg bg-primary px-4 font-semibold text-white hover:bg-primary-dark">
            <ExternalLink size={16} aria-hidden /> Mở vận đơn
          </Link>
        </>} />
      )}
    </div>
  )
}
