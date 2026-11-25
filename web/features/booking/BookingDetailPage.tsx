'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import QRCode from 'qrcode'
import { ArrowLeft, PackageCheck, Printer, XCircle } from 'lucide-react'
import { Card, ErrorBox } from '@/shared/kit/Page'
import { Btn } from '@/shared/kit/Fields'
import { useAction, useApi } from '@/shared/lib/hooks'
import { fmtDateTime } from '@/shared/lib/format'
import { BookingStatus, type BookingDetail } from './bookingShared'
import ReceiveWorkspace from './ReceiveWorkspace'
import PushedToCms from './PushedToCms'

/** QR chỉ chứa MÃ (B914700): tên khách/nhân viên tra từ DB khi quét, không nhúng thông tin cá nhân vào mã. */
function useQr(code: string | undefined) {
  const [url, setUrl] = useState<string | null>(null)
  useEffect(() => {
    if (!code) return
    let alive = true
    QRCode.toDataURL(code, { width: 360, margin: 1, errorCorrectionLevel: 'M' }).then((u) => { if (alive) setUrl(u) }).catch(() => { if (alive) setUrl(null) })
    return () => { alive = false }
  }, [code])
  return url
}

/**
 * Phiếu pickup có QR (giao nhận cầm đi lấy) + nút nhận hàng. Mở bằng mã quét (?nhan=1) thì vào thẳng màn nhận kiện.
 * Bill đã in bên CRM (trangThai 3) thì chỉ xem — CRM khoá sửa.
 */
export default function BookingDetailPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const autoReceive = useSearchParams().get('nhan') === '1'
  const { data: loaded, error: loadError, reload } = useApi<BookingDetail>(`/api/pickup-bookings/${id}`)
  const [fresh, setFresh] = useState<BookingDetail | null>(null)
  const [receiving, setReceiving] = useState(autoReceive)
  const [pushed, setPushed] = useState(false)   // vừa chốt nhận ⇒ màn "Đã đẩy lên CMS"
  const data = fresh && fresh.id === loaded?.id ? fresh : loaded
  const { run, busy, error } = useAction()
  const qr = useQr(data?.code)

  async function cancel() {
    if (!window.confirm(`Huỷ lệnh ${data?.code}? Vận đơn nháp sẽ bị xoá.`)) return
    if (await run('POST', `/api/pickup-bookings/${id}/cancel`)) router.push('/')
  }

  if (loadError) return <ErrorBox message={loadError.message} />
  if (!data) return <p className="py-6 text-[13px] text-text-muted">Đang tải…</p>
  const locked = data.trangThai === 3
  const contact = [data.contactName, data.contactPhone ?? data.customerPhone].filter(Boolean).join(' · ')

  if (receiving && !locked) {
    return (
      <div className="mx-auto max-w-xl pb-32">
        <div className="mb-3 flex items-center gap-2">
          <Link href="/" aria-label="Về danh sách" className="grid h-11 w-11 shrink-0 place-items-center rounded-lg border border-border bg-surface text-text-secondary"><ArrowLeft size={18} /></Link>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[16px] font-semibold text-text-primary">{data.customerName ?? '(không tên khách)'}</p>
            <p className="truncate text-[12.5px] text-text-muted">{data.code}{data.saleName ? ` · NV: ${data.saleName}` : ''}{data.tenHang ? ` · ${data.tenHang}` : ''}</p>
          </div>
          <button type="button" onClick={() => { setReceiving(false); reload() }} className="h-11 shrink-0 rounded-lg px-2 text-[13px] text-primary">Xem phiếu</button>
        </div>
        <ReceiveWorkspace booking={data} onChange={setFresh} onDone={() => { setReceiving(false); setPushed(true) }} />
      </div>
    )
  }

  if (pushed && data.trangThai >= 2) return <PushedToCms booking={data} onView={() => setPushed(false)} />

  return (
    <div className="mx-auto max-w-xl pb-24 print:max-w-none print:pb-0">
      <Link href="/" className="mb-3 inline-flex h-11 items-center gap-1.5 text-[13.5px] text-text-secondary print:hidden"><ArrowLeft size={16} /> Danh sách</Link>

      <Card className="print:border-0 print:shadow-none">
        <div className="flex flex-col items-center gap-2 text-center">
          {qr
            // eslint-disable-next-line @next/next/no-img-element -- QR data URL tạo cục bộ
            ? <img src={qr} alt={`Mã QR ${data.code}`} width={220} height={220} className="h-[220px] w-[220px]" />
            : <div className="grid h-[220px] w-[220px] place-items-center text-[12px] text-text-muted">Đang tạo QR…</div>}
          <p className="text-[28px] font-bold tracking-wider text-text-primary">{data.code}</p>
          <BookingStatus value={data.trangThai} nhan={data.kiens.length} khai={data.soKienBook} />
        </div>

        <dl className="mt-4 space-y-2 text-[14px]">
          <Row k="Khách hàng" v={data.customerName} strong />
          <Row k="NV phụ trách" v={data.saleName || null} />
          <Row k="Người liên hệ" v={contact || null} />
          <Row k="Địa chỉ lấy" v={data.pickupAddress} />
          <Row k="Hẹn giờ" v={data.planDate ? fmtDateTime(data.planDate) : null} />
          <Row k="Hàng" v={[data.tenHang, data.soKienBook ? `${data.soKienBook} kiện` : null, data.kgDuKien ? `${data.kgDuKien} kg` : null].filter(Boolean).join(' · ') || null} />
          <Row k="Nhân viên tạo" v={data.staffName} />
          <Row k="Ngày tạo" v={fmtDateTime(data.createDate)} />
          {data.receivedDate && <Row k="Kho nhận" v={fmtDateTime(data.receivedDate)} />}
          <Row k="Số bill" v={data.orderNumber ? String(data.orderNumber) : null} strong />
          <Row k="Ghi chú" v={data.note} />
        </dl>

        {data.kiens.length > 0 && (
          <>
            <h3 className="mb-1 mt-4 text-[13.5px] font-semibold text-text-primary">Kho đã nhận ({data.kiens.length} kiện)</h3>
            <table className="w-full text-[13.5px]">
              <thead><tr className="border-b border-border text-left text-text-muted"><th className="py-1.5 font-medium">Kiện</th><th className="py-1.5 font-medium">Dài×Rộng×Cao</th><th className="py-1.5 text-right font-medium">Cân</th><th className="py-1.5 text-right font-medium">Tính cước</th></tr></thead>
              <tbody>
                {data.kiens.map((k) => (
                  <tr key={k.kienSo} className="border-b border-border/60">
                    <td className="py-1.5">{k.kienSo}{k.loai === 'TUI' ? ' (túi)' : ''}</td><td className="py-1.5">{k.dai}×{k.rong}×{k.cao}</td>
                    <td className="py-1.5 text-right">{k.trongLuong}</td><td className="py-1.5 text-right font-medium">{k.chargeWeight}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}
        {data.trangThai === 2 && <p className="mt-3 rounded-lg bg-primary-light px-3 py-2 text-[12.5px] text-primary print:hidden">Kinh doanh mở vận đơn nháp {data.code} trong CRM, bổ sung người nhận rồi In bill — kích thước kiện đã có sẵn.</p>}
        {locked && <p className="mt-3 text-[12.5px] text-text-muted print:hidden">Bill đã in bên CRM — không sửa kiện ở đây nữa.</p>}
      </Card>

      {error && <div className="mt-3 print:hidden"><ErrorBox message={error} /></div>}

      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-border bg-surface p-3 [padding-bottom:max(0.75rem,env(safe-area-inset-bottom))] print:hidden">
        <div className="mx-auto flex max-w-xl gap-2">
          {data.trangThai === 0 && <Btn type="button" variant="outline" className="h-12 w-12 px-0" aria-label="Huỷ lệnh" disabled={busy} onClick={cancel}><XCircle size={20} /></Btn>}
          <Btn type="button" variant={locked ? 'primary' : 'outline'} className={locked ? 'h-12 flex-1 text-[15px]' : 'h-12 w-12 px-0'} aria-label="In phiếu QR" onClick={() => window.print()}>
            <Printer size={20} />{locked ? ' In phiếu QR' : ''}
          </Btn>
          {!locked && (
            <Btn type="button" className="h-12 flex-1 text-[15px]" onClick={() => setReceiving(true)}>
              <PackageCheck size={18} /> {data.trangThai === 2 ? 'Xem / sửa kiện' : data.kiens.length ? 'Nhận tiếp' : 'Nhận kiện'}
            </Btn>
          )}
        </div>
      </div>
    </div>
  )
}

function Row({ k, v, strong }: { k: string; v: string | null; strong?: boolean }) {
  if (!v) return null
  return <div className="flex gap-3"><dt className="w-28 shrink-0 text-text-muted">{k}</dt><dd className={strong ? 'font-semibold text-text-primary' : 'text-text-primary'}>{v}</dd></div>
}
