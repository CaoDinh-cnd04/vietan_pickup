'use client'
import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Camera, Loader2, Plus, QrCode, Search } from 'lucide-react'
import { ErrorBox, PageHeader } from '@/shared/kit/Page'
import CameraScanner, { codeFromScan } from '@/shared/kit/CameraScanner'
import { clientFetch } from '@/shared/lib/api'
import { useApi, qs, type Paged } from '@/shared/lib/hooks'
import { fmtDateTime, todayInput } from '@/shared/lib/format'
import { cn } from '@/shared/lib/utils'
import { BOOKING_STATUS, BookingStatus, type BookingRow } from './bookingShared'

const PAGE_SIZE = 25
const PK_CODE = /^PK\d+$/i

/**
 * Danh sách lệnh book pickup (ADR-052). Thiết kế cho điện thoại: một ô tìm (mã PK…, tên khách, nhân viên) + chip trạng thái, mỗi lệnh là một thẻ
 * chạm được (không bảng ngang). Chạm thẻ → chi tiết + QR.
 */
export default function BookingsPage() {
  const router = useRouter()
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState(-1)
  const [page, setPage] = useState(1)
  const [cameraOpen, setCameraOpen] = useState(false)
  const [scanError, setScanError] = useState<string | null>(null)
  const { data, error, isLoading } = useApi<Paged<BookingRow>>(
    `/api/pickup-bookings${qs({ fromDate: todayInput(-60), toDate: todayInput(), status, search: search.trim(), page, pageSize: PAGE_SIZE })}`,
  )
  async function openByCode(raw: string) {
    try {
      const b = await clientFetch<{ id: number }>(`/api/pickup-bookings/by-code/${encodeURIComponent(codeFromScan(raw).trim())}`)
      router.push(`/${b.id}`)
    } catch (e) {
      setScanError(e instanceof Error ? e.message : 'Không nhận ra mã')
    }
  }
  const chips = [{ value: -1, label: 'Tất cả' }, ...BOOKING_STATUS.map((s) => ({ value: s.value, label: s.label }))]
  const pages = Math.max(1, Math.ceil((data?.totalCount ?? 0) / PAGE_SIZE))

  return (
    <>
      <PageHeader title="Book pickup" subtitle="Sale/CS book lệnh lấy hàng cho khách — mỗi lệnh có mã và QR để giao nhận cầm, kho quét khi nhận." />
      <Link href="/new"
        className="mb-3 flex h-12 w-full items-center justify-center gap-2 rounded-lg bg-primary text-[15px] font-medium text-white shadow-btn active:bg-primary-dark sm:w-auto sm:px-6">
        <Plus size={18} /> Book pickup mới
      </Link>

      <div className="mb-2 flex gap-2">
        <div className="relative min-w-0 flex-1">
          <Search size={18} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
          <input value={search} aria-label="Tìm hoặc quét mã pickup" placeholder="Quét/gõ mã PK…, hoặc tìm tên khách" autoComplete="off" enterKeyHint="go"
            onChange={(e) => { setSearch(e.target.value); setPage(1) }}
            onKeyDown={(e) => { if (e.key === 'Enter' && PK_CODE.test(search.trim())) { e.preventDefault(); void openByCode(search) } }}
            className="h-12 w-full rounded-lg border border-border bg-surface pl-10 pr-3 text-[16px] outline-none focus:border-primary focus:ring-2 focus:ring-primary/20" />
        </div>
        <button type="button" aria-label="Quét QR bằng camera" onClick={() => setCameraOpen(true)}
          className="grid h-12 w-12 shrink-0 place-items-center rounded-lg border border-border bg-surface text-text-secondary"><Camera size={20} /></button>
      </div>
      {cameraOpen && <CameraScanner onClose={() => setCameraOpen(false)} onResult={(c) => { setCameraOpen(false); void openByCode(c) }} />}
      <div className="mb-3 flex gap-2 overflow-x-auto pb-1" role="radiogroup" aria-label="Lọc trạng thái">
        {chips.map((c) => (
          <button key={c.value} type="button" role="radio" aria-checked={status === c.value} onClick={() => { setStatus(c.value); setPage(1) }}
            className={cn('h-11 shrink-0 rounded-full border px-4 text-[13.5px] transition-colors',
              status === c.value ? 'border-primary bg-primary-light/60 font-semibold text-primary' : 'border-border bg-surface text-text-secondary')}>
            {c.label}
          </button>
        ))}
      </div>

      {(error || scanError) && <ErrorBox message={scanError ?? error!.message} />}
      <ul className="space-y-2" aria-busy={isLoading}>
        {isLoading && !data && <li className="flex items-center gap-2 py-4 text-[13px] text-text-muted"><Loader2 className="animate-spin" size={16} /> Đang tải…</li>}
        {data && data.items.length === 0 && <li className="py-6 text-center text-[13px] text-text-muted">Chưa có lệnh book pickup nào trong 60 ngày qua.</li>}
        {data?.items.map((b) => (
          <li key={b.id}>
            <button type="button" onClick={() => router.push(`/${b.id}`)}
              className="flex min-h-[72px] w-full items-center gap-3 rounded-lg border border-border bg-surface px-3 py-2.5 text-left active:bg-primary-light">
              <QrCode size={28} className="shrink-0 text-primary" aria-hidden />
              <span className="min-w-0 flex-1">
                <span className="flex items-center justify-between gap-2">
                  <span className="text-[15px] font-semibold text-primary">{b.code}</span>
                  <BookingStatus value={b.trangThai} />
                </span>
                <span className="block truncate text-[14.5px] text-text-primary">{b.customerName ?? '(không tên khách)'}</span>
                <span className="block truncate text-[12.5px] text-text-muted">
                  {b.tongSoKien} kiện{b.tongKg ? ` · ${b.tongKg} kg` : ''} · {b.staffName ?? 'NV ' + b.staffId} · {fmtDateTime(b.createDate)}
                </span>
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
    </>
  )
}
