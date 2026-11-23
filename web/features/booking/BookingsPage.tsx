'use client'
import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Camera, ChevronRight, Loader2, PackageOpen, Plus, QrCode, Search, X } from 'lucide-react'
import { ErrorBox } from '@/shared/kit/Page'
import CameraScanner, { codeFromScan } from '@/shared/kit/CameraScanner'
import { clientFetch } from '@/shared/lib/api'
import { useApi, qs, type Paged } from '@/shared/lib/hooks'
import { fmtDateTime, todayInput } from '@/shared/lib/format'
import { cn } from '@/shared/lib/utils'
import { BookingStatus, type BookingRow } from './bookingShared'

const PAGE_SIZE = 25
/** Mã quét: B<ID>[/kiện] (vận đơn nháp) hoặc số bill 7 số. */
const SCAN_CODE = /^(B\d+([/_]\d+)?|\d{7})$/i
/** Hai nhóm cho kho (API group): cần nhận = chưa nhận + đang nhận · đã nhận = đã nhận đủ + đã có bill. */
const TABS = [{ value: 'can', label: 'Cần nhận' }, { value: 'xong', label: 'Đã nhận' }] as const

/**
 * Trang chủ cho kho, thiết kế cho điện thoại: MỘT nút chính "Nhận hàng" (quét QR phiếu, hoặc khách mang tới không có phiếu),
 * danh sách chia 2 tab. Chạm phiếu chưa nhận xong ⇒ vào thẳng màn nhận kiện; phiếu đã xong ⇒ xem phiếu.
 */
export default function BookingsPage() {
  const router = useRouter()
  const [search, setSearch] = useState('')
  const [tab, setTab] = useState<(typeof TABS)[number]['value']>('can')
  const [page, setPage] = useState(1)
  const [sheetOpen, setSheetOpen] = useState(false)
  const [cameraOpen, setCameraOpen] = useState(false)
  const [scanError, setScanError] = useState<string | null>(null)
  const term = search.trim()
  const { data, error, isLoading } = useApi<Paged<BookingRow>>(
    // đang tìm thì tìm trong cả hai nhóm, để gõ mã phiếu đã nhận vẫn ra
    `/api/pickup-bookings${qs({ fromDate: todayInput(-60), toDate: todayInput(), group: term ? '' : tab, search: term, page, pageSize: PAGE_SIZE })}`,
  )
  async function openByCode(raw: string) {
    try {
      const b = await clientFetch<{ id: number }>(`/api/pickup-bookings/by-code/${encodeURIComponent(codeFromScan(raw).trim())}`)
      router.push(`/${b.id}?nhan=1`)
    } catch (e) {
      setScanError(e instanceof Error ? e.message : 'Không nhận ra mã')
    }
  }
  const pages = Math.max(1, Math.ceil((data?.totalCount ?? 0) / PAGE_SIZE))

  return (
    <div className="mx-auto max-w-xl">
      <button type="button" onClick={() => { setScanError(null); setSheetOpen(true) }}
        className="mb-2 flex h-16 w-full items-center justify-center gap-3 rounded-xl bg-primary text-[18px] font-semibold text-white shadow-btn active:bg-primary-dark">
        <PackageOpen size={24} aria-hidden /> Nhận hàng
      </button>
      <Link href="/new" className="mb-4 flex h-11 items-center justify-center gap-2 rounded-lg border border-border bg-surface text-[14px] font-medium text-text-secondary active:bg-primary-light">
        <Plus size={18} aria-hidden /> Book lấy hàng (cho sale)
      </Link>

      <div className="relative mb-3">
        <Search size={18} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" aria-hidden />
        <input value={search} aria-label="Tìm phiếu" placeholder="Tìm mã phiếu B…, số bill, tên khách" autoComplete="off" enterKeyHint="go"
          onChange={(e) => { setSearch(e.target.value); setPage(1) }}
          onKeyDown={(e) => { if (e.key === 'Enter' && SCAN_CODE.test(term)) { e.preventDefault(); void openByCode(search) } }}
          className="h-12 w-full rounded-lg border border-border bg-surface pl-10 pr-3 text-[16px] outline-none focus:border-primary focus:ring-2 focus:ring-primary/20" />
      </div>

      {!term && (
        <div className="mb-3 grid grid-cols-2 rounded-lg bg-slate-100 p-1" role="tablist" aria-label="Nhóm phiếu">
          {TABS.map((t) => (
            <button key={t.value} type="button" role="tab" aria-selected={tab === t.value} onClick={() => { setTab(t.value); setPage(1) }}
              className={cn('h-10 rounded-md text-[14.5px] transition-colors', tab === t.value ? 'bg-surface font-semibold text-primary shadow-sm' : 'text-text-secondary')}>
              {t.label}{tab === t.value && data ? ` (${data.totalCount})` : ''}
            </button>
          ))}
        </div>
      )}

      {(error || scanError) && <div className="mb-3"><ErrorBox message={scanError ?? error!.message} /></div>}
      <ul className="space-y-2" aria-busy={isLoading}>
        {isLoading && !data && <li className="flex items-center gap-2 py-4 text-[13px] text-text-muted"><Loader2 className="animate-spin" size={16} /> Đang tải…</li>}
        {data && data.items.length === 0 && (
          <li className="py-8 text-center text-[14px] text-text-muted">
            {term ? 'Không tìm thấy phiếu nào.' : tab === 'can' ? 'Không còn phiếu nào cần nhận.' : 'Chưa có phiếu nào đã nhận trong 60 ngày qua.'}
          </li>
        )}
        {data?.items.map((b) => (
          <li key={b.id}>
            <button type="button" onClick={() => router.push(b.trangThai < 2 ? `/${b.id}?nhan=1` : `/${b.id}`)}
              className="flex min-h-[72px] w-full items-center gap-3 rounded-lg border border-border bg-surface px-3 py-2.5 text-left active:bg-primary-light">
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[15.5px] font-semibold text-text-primary">{b.customerName ?? '(không tên khách)'}</span>
                {b.saleName && <span className="block truncate text-[13px] text-text-secondary">NV: {b.saleName}</span>}
                <span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
                  <BookingStatus value={b.trangThai} nhan={b.soKienNhan} khai={b.soKienBook} />
                  <span className="text-[12.5px] text-text-muted">
                    {b.code}{b.trangThai === 0 && b.soKienBook ? ` · ${b.soKienBook} kiện` : ''}{b.kg ? ` · ${b.kg} kg` : ''} · {fmtDateTime(b.createDate)}
                  </span>
                </span>
              </span>
              <ChevronRight size={20} className="shrink-0 text-text-muted" aria-hidden />
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

      {sheetOpen && (
        <div className="fixed inset-0 z-30 flex items-end bg-black/40" onClick={() => setSheetOpen(false)}>
          <div role="dialog" aria-modal="true" aria-label="Nhận hàng" onClick={(e) => e.stopPropagation()}
            className="mx-auto w-full max-w-xl rounded-t-2xl bg-surface p-4 [padding-bottom:max(1rem,env(safe-area-inset-bottom))]">
            <div className="mb-3 flex items-center justify-between">
              <p className="text-[17px] font-semibold text-text-primary">Nhận hàng</p>
              <button type="button" aria-label="Đóng" onClick={() => setSheetOpen(false)} className="grid h-11 w-11 place-items-center rounded-lg text-text-muted"><X size={20} /></button>
            </div>
            <button type="button" onClick={() => { setSheetOpen(false); setCameraOpen(true) }}
              className="mb-2 flex min-h-[64px] w-full items-center gap-3 rounded-xl bg-primary px-4 text-left text-white active:bg-primary-dark">
              <QrCode size={26} aria-hidden />
              <span><span className="block text-[16px] font-semibold">Quét mã QR trên phiếu</span><span className="block text-[12.5px] opacity-90">Hàng giao nhận mang về có phiếu</span></span>
            </button>
            <Link href="/new?taiKho=1" onClick={() => setSheetOpen(false)}
              className="flex min-h-[64px] w-full items-center gap-3 rounded-xl border border-border px-4 text-left active:bg-primary-light">
              <Camera size={26} className="text-primary" aria-hidden />
              <span><span className="block text-[16px] font-semibold text-text-primary">Không có phiếu</span><span className="block text-[12.5px] text-text-muted">Khách mang hàng tới — chọn khách rồi chụp kiện</span></span>
            </Link>
          </div>
        </div>
      )}
      {cameraOpen && <CameraScanner onClose={() => setCameraOpen(false)} onResult={(c) => { setCameraOpen(false); void openByCode(c) }} />}
    </div>
  )
}
