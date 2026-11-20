'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import QRCode from 'qrcode'
import { ArrowLeft, PackageCheck, Printer, XCircle } from 'lucide-react'
import { Card, ErrorBox } from '@/shared/kit/Page'
import { Btn } from '@/shared/kit/Fields'
import { useAction, useApi } from '@/shared/lib/hooks'
import { fmtDateTime } from '@/shared/lib/format'
import { BookingStatus, type BookingDetail } from './bookingShared'
import ReceiveWorkspace from './ReceiveWorkspace'

/** QR chỉ chứa MÃ (PK000123): tên khách/nhân viên tra từ DB khi quét, không nhúng thông tin cá nhân vào mã. */
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
 * Chi tiết lệnh book pickup + phiếu có QR để in (giao nhận cầm đi lấy). Phiếu hiện đủ: khách, nhân viên book, kiện, địa chỉ — bản in chỉ giữ phiếu.
 */
export default function BookingDetailPage() {
  const { id } = useParams<{ id: string }>()
  const { data: loaded, error: loadError, reload } = useApi<BookingDetail>(`/api/pickup-bookings/${id}`)
  const [fresh, setFresh] = useState<BookingDetail | null>(null)
  const [receiving, setReceiving] = useState(false)
  const data = fresh && fresh.id === loaded?.id ? fresh : loaded
  const { run, busy, error } = useAction()
  const qr = useQr(data?.code)

  async function cancel() {
    if (!window.confirm(`Huỷ lệnh ${data?.code}?`)) return
    if (await run('POST', `/api/pickup-bookings/${id}/cancel`)) reload()
  }

  if (loadError) return <ErrorBox message={loadError.message} />
  if (!data) return <p className="py-6 text-[13px] text-text-muted">Đang tải…</p>
  const tongKien = data.lines.reduce((s, l) => s + l.soKien, 0)
  const tongKg = data.lines.reduce((s, l) => s + (l.kgDuKien ?? 0), 0)

  if (receiving && data.trangThai === 0) {
    return (
      <div className="mx-auto max-w-xl pb-32">
        <button type="button" onClick={() => setReceiving(false)} className="mb-3 inline-flex h-11 items-center gap-1.5 text-[13.5px] text-text-secondary"><ArrowLeft size={16} /> Về phiếu {data.code}</button>
        <Card className="mb-3">
          <p className="text-[18px] font-bold text-primary">{data.code}</p>
          <p className="truncate text-[15px] font-semibold text-text-primary">{data.customerName ?? '(không tên khách)'}</p>
          <p className="text-[12.5px] text-text-muted">
            {[data.contactName, data.contactPhone ?? data.customerPhone].filter(Boolean).join(' · ')}{data.pickupAddress ? ` · ${data.pickupAddress}` : ''}
          </p>
          <p className="text-[12.5px] text-text-muted">Book bởi {data.staffName ?? `NV ${data.staffId}`} · khai {tongKien} kiện{tongKg ? ` · ${tongKg} kg` : ''}</p>
        </Card>
        <ReceiveWorkspace booking={data} onChange={setFresh} />
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-xl pb-24 print:max-w-none print:pb-0">
      <Link href="/" className="mb-3 inline-flex h-11 items-center gap-1.5 text-[13.5px] text-text-secondary print:hidden"><ArrowLeft size={16} /> Danh sách book pickup</Link>

      <Card className="print:border-0 print:shadow-none">
        <div className="flex flex-col items-center gap-2 text-center">
          {qr
            // eslint-disable-next-line @next/next/no-img-element -- QR data URL tạo cục bộ
            ? <img src={qr} alt={`Mã QR ${data.code}`} width={220} height={220} className="h-[220px] w-[220px]" />
            : <div className="grid h-[220px] w-[220px] place-items-center text-[12px] text-text-muted">Đang tạo QR…</div>}
          <p className="text-[28px] font-bold tracking-wider text-text-primary">{data.code}</p>
          <BookingStatus value={data.trangThai} />
        </div>

        <dl className="mt-4 space-y-2 text-[14px]">
          <Row k="Khách hàng" v={data.customerName} strong />
          <Row k="Người liên hệ" v={[data.contactName, data.contactPhone ?? data.customerPhone].filter(Boolean).join(' · ') || null} />
          <Row k="Địa chỉ lấy" v={data.pickupAddress} />
          <Row k="Hẹn giờ" v={data.planDate ? fmtDateTime(data.planDate) : null} />
          <Row k="Nhân viên book" v={data.staffName ?? `NV ${data.staffId}`} />
          <Row k="Ngày book" v={fmtDateTime(data.createDate)} />
          {data.receivedDate && <Row k="Kho nhận" v={fmtDateTime(data.receivedDate)} />}
          <Row k="Ghi chú" v={data.note} />
        </dl>

        <table className="mt-4 w-full text-[13.5px]">
          <thead><tr className="border-b border-border text-left text-text-muted"><th className="py-1.5 font-medium">Hàng</th><th className="py-1.5 text-right font-medium">Kiện</th><th className="py-1.5 text-right font-medium">Kg</th></tr></thead>
          <tbody>
            {data.lines.map((l) => (
              <tr key={l.id} className="border-b border-border/60"><td className="py-1.5">{l.moTa ?? '—'}</td><td className="py-1.5 text-right">{l.soKien}</td><td className="py-1.5 text-right">{l.kgDuKien ?? ''}</td></tr>
            ))}
            <tr className="font-semibold"><td className="py-1.5">Tổng</td><td className="py-1.5 text-right">{tongKien}</td><td className="py-1.5 text-right">{tongKg || ''}</td></tr>
          </tbody>
        </table>

        {data.kiens.length > 0 && (
          <>
            <h3 className="mb-1 mt-4 text-[13.5px] font-semibold text-text-primary">Kho đã nhận ({data.kiens.length} kiện) — kích thước dùng để lập bill</h3>
            <table className="w-full text-[13.5px]">
              <thead><tr className="border-b border-border text-left text-text-muted"><th className="py-1.5 font-medium">Kiện</th><th className="py-1.5 font-medium">Dài×Rộng×Cao</th><th className="py-1.5 text-right font-medium">Cân</th><th className="py-1.5 text-right font-medium">Tính cước</th></tr></thead>
              <tbody>
                {data.kiens.map((k) => (
                  <tr key={k.kienSo} className="border-b border-border/60"><td className="py-1.5">{k.kienSo}</td><td className="py-1.5">{k.dai}×{k.rong}×{k.cao}</td><td className="py-1.5 text-right">{k.trongLuong}</td><td className="py-1.5 text-right font-medium">{k.chargeWeight}</td></tr>
                ))}
              </tbody>
            </table>
          </>
        )}
      </Card>

      {error && <div className="mt-3 print:hidden"><ErrorBox message={error} /></div>}

      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-border bg-surface p-3 [padding-bottom:max(0.75rem,env(safe-area-inset-bottom))] print:hidden">
        <div className="mx-auto flex max-w-xl gap-2">
          {data.trangThai === 0 && <Btn type="button" variant="outline" className="h-12 w-12 px-0" aria-label="Huỷ lệnh" disabled={busy} onClick={cancel}><XCircle size={20} /></Btn>}
          <Btn type="button" variant={data.trangThai === 0 ? 'outline' : 'primary'} className={data.trangThai === 0 ? 'h-12 w-12 px-0' : 'h-12 flex-1 text-[15px]'} aria-label="In phiếu QR" onClick={() => window.print()}><Printer size={20} />{data.trangThai === 0 ? '' : ' In phiếu QR'}</Btn>
          {data.trangThai === 0 && <Btn type="button" className="h-12 flex-1 text-[15px]" onClick={() => setReceiving(true)}><PackageCheck size={18} /> Nhận hàng kho</Btn>}
        </div>
      </div>
    </div>
  )
}

function Row({ k, v, strong }: { k: string; v: string | null; strong?: boolean }) {
  if (!v) return null
  return <div className="flex gap-3"><dt className="w-28 shrink-0 text-text-muted">{k}</dt><dd className={strong ? 'font-semibold text-text-primary' : 'text-text-primary'}>{v}</dd></div>
}
