'use client'
import Link from 'next/link'
import { AlertTriangle, CheckCircle2, List } from 'lucide-react'
import { Card } from '@/shared/kit/Page'
import { Btn } from '@/shared/kit/Fields'
import { fmtDateTime, fmtNumber } from '@/shared/lib/format'
import { cn } from '@/shared/lib/utils'
import type { BookingDetail } from './bookingShared'

/**
 * Bước sau khi lưu kiện cuối (tự chốt hoặc bấm Xong): tóm tắt những gì đã ghi vào bảng dùng chung với CMS/CRM.
 * App ghi thẳng vào DB của CMS khi lưu từng kiện — màn này chỉ xác nhận, không gửi thêm gì.
 */
export default function PushedToCms({ booking, onView }: { booking: BookingDetail; onView: () => void }) {
  const ks = booking.kiens
  const thuc = ks.reduce((s, k) => s + k.trongLuong, 0)
  const cuoc = ks.reduce((s, k) => s + k.chargeWeight, 0)
  const coAnh = ks.filter((k) => k.hasPhoto).length

  return (
    <div className="mx-auto max-w-xl pb-28">
      <div className="mb-4 flex flex-col items-center gap-1 pt-2 text-center">
        <CheckCircle2 size={48} className="text-success" aria-hidden />
        <h1 className="text-[20px] font-bold text-text-primary">Đã đẩy lên CMS</h1>
        <p className="text-[14px] text-text-secondary">{booking.code} · {booking.customerName ?? '(không tên khách)'}</p>
      </div>

      <Card className="mb-3" title="Đã ghi">
        <ul className="space-y-3 text-[14px]">
          <Item ok title={`Vận đơn nháp ${booking.code}`} table="MaVanDon"
            detail={`${ks.length} kiện · cân thực ${fmtNumber(thuc)} kg · tính cước ${fmtNumber(cuoc)} kg`} />
          <Item ok title={`Kích thước ${ks.length} kiện`} table="MaVanDon_PCS_DIM" detail="Dài × rộng × cao, quy đổi, cân tính cước" />
          <Item ok={coAnh === ks.length} title={`Ảnh ${coAnh}/${ks.length} kiện`} table="AHinhAnh_Order"
            detail={coAnh === ks.length ? 'Đủ ảnh mỗi kiện' : `Thiếu ảnh ${ks.length - coAnh} kiện — bấm "Xem phiếu" để chụp bổ sung`} />
          <Item ok title="Kho đã nhận" table="Pickup" detail={booking.receivedDate ? fmtDateTime(booking.receivedDate) : 'Đã chốt'} />
        </ul>
      </Card>

      <Card className="mb-3" title="Các kiện" padded={false}>
        <table className="w-full text-[13.5px]">
          <thead>
            <tr className="border-b border-border bg-primary-light text-left text-text-secondary">
              <th className="px-4 py-2 font-medium">Kiện</th><th className="py-2 font-medium">D×R×C</th>
              <th className="py-2 text-right font-medium">Cân</th><th className="py-2 text-right font-medium">Cước</th><th className="px-4 py-2 text-right font-medium">Ảnh</th>
            </tr>
          </thead>
          <tbody>
            {ks.map((k) => (
              <tr key={k.kienSo} className="border-b border-border/60 last:border-0 even:bg-background">
                <td className="px-4 py-2">{k.kienSo}{k.loai === 'TUI' ? ' (túi)' : ''}</td>
                <td className="py-2">{k.dai}×{k.rong}×{k.cao}</td>
                <td className="py-2 text-right">{fmtNumber(k.trongLuong)}</td>
                <td className="py-2 text-right font-medium">{fmtNumber(k.chargeWeight)}</td>
                <td className={cn('px-4 py-2 text-right', k.hasPhoto ? 'text-success' : 'text-amber-700')}>{k.hasPhoto ? 'Có' : 'Thiếu'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      <p className="rounded-lg bg-primary-light px-3 py-2 text-[13px] text-primary">
        Tiếp theo: kinh doanh mở vận đơn {booking.code} trong CMS, bổ sung người nhận rồi In bill.
      </p>

      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-border bg-surface p-3 [padding-bottom:max(0.75rem,env(safe-area-inset-bottom))]">
        <div className="mx-auto flex max-w-xl gap-2">
          <Btn type="button" variant="outline" className="h-12 px-4 text-[15px]" onClick={onView}>Xem phiếu</Btn>
          <Link href="/" className="inline-flex h-12 flex-1 items-center justify-center gap-2 rounded-lg bg-primary text-[15px] font-semibold text-white active:bg-primary-dark">
            <List size={18} aria-hidden /> Về danh sách
          </Link>
        </div>
      </div>
    </div>
  )
}

function Item({ ok, title, table, detail }: { ok: boolean; title: string; table: string; detail: string }) {
  return (
    <li className="flex gap-3">
      {ok ? <CheckCircle2 size={20} className="mt-0.5 shrink-0 text-success" aria-label="Đã ghi" />
        : <AlertTriangle size={20} className="mt-0.5 shrink-0 text-amber-600" aria-label="Thiếu" />}
      <span className="min-w-0">
        <span className="block font-semibold text-text-primary">{title}</span>
        <span className="block text-[13px] text-text-secondary">{detail}</span>
        <span className="block text-[11.5px] text-text-muted">Bảng {table}</span>
      </span>
    </li>
  )
}
