'use client'
import { useState } from 'react'
import { Check, Loader2 } from 'lucide-react'
import { ErrorBox } from '@/shared/kit/Page'
import { Btn } from '@/shared/kit/Fields'
import { clientFetch } from '@/shared/lib/api'
import type { BookingDetail } from './bookingShared'
import OrderPhoto from './OrderPhoto'

/**
 * Bước KHO — chỉ chụp 2 ảnh theo đơn: ảnh hàng hoá + ảnh kiện (đã đóng gói, gửi khách xem), đủ 2 ảnh thì bấm Xong ⇒ "kho đã nhận".
 * Kho không đếm / đo / chụp từng kiện / AI: số kiện theo bill, kích thước + cân do nhân viên cuối làm ở màn "Bước cuối".
 */
export default function KhoReceive({ booking, onReload, onDone }: { booking: BookingDetail; onReload: () => void; onDone: () => void }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const du = booking.goodsPhotoId != null && booking.finishedPhotoId != null
  const daChot = booking.trangThai >= 2

  async function finish() {
    if (busy || !du) return
    setBusy(true); setError(null)
    try {
      await clientFetch(`/api/pickup-bookings/${booking.id}/receive`, { method: 'POST', body: JSON.stringify({}) })
      onDone()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Lỗi chốt nhận')
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <div className="mb-3 space-y-3">
        <OrderPhoto bookingId={booking.id} kind="hang" photoId={booking.goodsPhotoId} onUploaded={onReload} />
        <OrderPhoto bookingId={booking.id} kind="kien" photoId={booking.finishedPhotoId} onUploaded={onReload} />
      </div>
      <p className="mb-3 text-center text-[12.5px] text-text-muted">Kích thước, cân: nhân viên cuối đo ở màn &quot;Bước cuối&quot; khi đã có bill và shipping mark.</p>
      {error && <ErrorBox message={error} />}

      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-border bg-surface p-3 [padding-bottom:max(0.75rem,env(safe-area-inset-bottom))]">
        <div className="mx-auto max-w-xl">
          <Btn type="button" className="h-14 w-full text-[16px]" disabled={busy || !du} onClick={finish}>
            {busy ? <Loader2 className="animate-spin" size={18} /> : <Check size={18} />}
            {busy ? 'Đang lưu…' : !du ? `Chụp đủ 2 ảnh (${Number(booking.goodsPhotoId != null) + Number(booking.finishedPhotoId != null)}/2)` : daChot ? 'Lưu lại' : 'Xong — kho đã nhận'}
          </Btn>
        </div>
      </div>
    </>
  )
}
