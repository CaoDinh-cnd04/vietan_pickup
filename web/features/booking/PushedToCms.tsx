'use client'
import Link from 'next/link'
import { CheckCircle2, List } from 'lucide-react'
import { Card } from '@/shared/kit/Page'
import { Btn } from '@/shared/kit/Fields'
import { imageUrl } from '@/shared/kit/Admin'
import { fmtDateTime } from '@/shared/lib/format'
import { KhachName, type BookingDetail } from './bookingShared'

/**
 * Sau khi kho bấm Xong: xác nhận đã ghi vào DB dùng chung với CMS (vận đơn nháp, 2 ảnh, kho đã nhận) và bước tiếp theo.
 * App ghi thẳng DB của CMS lúc chụp ảnh / chốt — màn này chỉ xác nhận, không gửi thêm gì.
 */
export default function PushedToCms({ booking, onView }: { booking: BookingDetail; onView: () => void }) {
  const photos = [...booking.goodsPhotoIds.map((pid, i) => [`Hàng hoá ${i + 1}`, pid] as const), ['Ảnh kiện', booking.finishedPhotoId] as const]

  return (
    <div className="mx-auto max-w-xl pb-28">
      <div className="mb-4 flex flex-col items-center gap-1 pt-2 text-center">
        <CheckCircle2 size={48} className="text-success" aria-hidden />
        <h1 className="text-[20px] font-bold text-text-primary">Đã đẩy lên CMS</h1>
        <p className="text-[14px] text-text-secondary">{booking.code} · <KhachName b={booking} /></p>
      </div>

      <Card className="mb-3" title="Đã ghi">
        <ul className="space-y-3 text-[14px]">
          <Item title={`Vận đơn nháp ${booking.code}`} table="MaVanDon" detail={booking.soKienBook ? `Khai ${booking.soKienBook} kiện` : 'Số kiện theo bill'} />
          <Item title={`${booking.goodsPhotoIds.length} ảnh hàng hoá + ảnh kiện`} table="AHinhAnh_Order (DIM, Other)" detail="Ảnh kiện gửi khách xem" />
          <Item title="Kho đã nhận" table="Pickup" detail={booking.receivedDate ? fmtDateTime(booking.receivedDate) : 'Đã chốt'} />
        </ul>
        <div className="mt-3 flex flex-wrap gap-3">
          {photos.map(([t, pid]) => pid && (
            <div key={t} className="text-center text-[12px] text-text-muted">
              {/* eslint-disable-next-line @next/next/no-img-element -- ảnh qua proxy có cookie */}
              <img src={imageUrl(pid)} alt={t} className="mb-1 h-24 w-24 rounded-lg border border-border object-cover" />{t}
            </div>
          ))}
        </div>
      </Card>

      <p className="rounded-lg bg-primary-light px-3 py-2 text-[13px] text-primary">
        Tiếp theo: kinh doanh mở vận đơn {booking.code} trong CMS, bổ sung người nhận rồi In bill và dán shipping mark.
        Nhân viên cuối quét mã kiện ở màn &quot;Bước cuối&quot; để đo, cân.
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

function Item({ title, table, detail }: { title: string; table: string; detail: string }) {
  return (
    <li className="flex gap-3">
      <CheckCircle2 size={20} className="mt-0.5 shrink-0 text-success" aria-label="Đã ghi" />
      <span className="min-w-0">
        <span className="block font-semibold text-text-primary">{title}</span>
        <span className="block text-[13px] text-text-secondary">{detail}</span>
        <span className="block text-[11.5px] text-text-muted">Bảng {table}</span>
      </span>
    </li>
  )
}
