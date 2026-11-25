'use client'
import { useRef, useState } from 'react'
import { Camera, Loader2, PackageCheck } from 'lucide-react'
import { imageUrl } from '@/shared/kit/Admin'
import { clientUpload } from '@/shared/lib/api'
import { shrinkImage } from '@/shared/lib/image'

/**
 * Ảnh hoàn thiện (hàng đã đóng xong, gửi khách xem) — 1 tấm/đơn, lưu loại "Other". Chụp là tải lên ngay; chụp lại thay ảnh cũ.
 * Khác ảnh kiện (loại DIM, theo từng kiện, AI đọc số ghi tay).
 */
export default function FinishedPhoto({ bookingId, photoId, onUploaded }: { bookingId: number; photoId: number | null; onUploaded: () => void }) {
  const input = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [v, setV] = useState(0)

  async function pick(files: FileList | null) {
    const raw = files?.[0]
    if (input.current) input.current.value = ''
    if (!raw || !raw.type.startsWith('image/')) return
    setBusy(true); setError(null)
    try {
      const f = new FormData()
      f.append('photo', await shrinkImage(raw))
      await clientUpload(`/api/pickup-bookings/${bookingId}/finished-photo`, f)
      setV((x) => x + 1)
      onUploaded()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Lỗi tải ảnh')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex items-center gap-3 rounded-lg border border-border bg-surface p-3 print:hidden">
      <input ref={input} type="file" accept="image/*" capture="environment" hidden onChange={(e) => void pick(e.target.files)} />
      {photoId
        // eslint-disable-next-line @next/next/no-img-element -- ảnh qua proxy có cookie
        ? <img src={`${imageUrl(photoId)}&v=${v}`} alt="Ảnh hoàn thiện" className="h-16 w-16 shrink-0 rounded-lg border border-border object-cover" />
        : <span className="grid h-16 w-16 shrink-0 place-items-center rounded-lg border border-dashed border-border text-text-muted"><PackageCheck size={24} aria-hidden /></span>}
      <div className="min-w-0 flex-1">
        <p className="text-[14px] font-semibold text-text-primary">Ảnh hoàn thiện</p>
        <p className="text-[12.5px] text-text-muted">{error ?? (photoId ? 'Đã có — gửi khách xem.' : 'Hàng đã đóng xong, chụp gửi khách xem.')}</p>
      </div>
      <button type="button" disabled={busy} onClick={() => input.current?.click()}
        className="inline-flex h-11 shrink-0 items-center gap-1.5 rounded-lg border border-border px-3 text-[13.5px] font-medium text-text-secondary hover:bg-background disabled:opacity-50">
        {busy ? <Loader2 size={16} className="animate-spin" /> : <Camera size={16} />}{photoId ? 'Chụp lại' : 'Chụp'}
      </button>
    </div>
  )
}
