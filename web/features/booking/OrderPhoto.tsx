'use client'
import { useRef, useState } from 'react'
import { Camera, ImageUp, Loader2, Package, PackageCheck } from 'lucide-react'
import { imageUrl } from '@/shared/kit/Admin'
import { clientUpload } from '@/shared/lib/api'
import { shrinkImage } from '@/shared/lib/image'

const KINDS = {
  hang: { title: 'Ảnh hàng hoá', empty: 'Chụp hàng lúc nhận (chưa đóng).', done: 'Đã có ảnh hàng hoá.', Icon: Package },
  kien: { title: 'Ảnh kiện', empty: 'Kiện đã đóng gói xong, chụp gửi khách xem.', done: 'Đã có — gửi khách xem.', Icon: PackageCheck },
} as const

/**
 * Ảnh theo đơn của kho (1 tấm/loại, chụp là tải lên ngay, chụp lại thay ảnh cũ):
 * "hang" = ảnh hàng hoá (lưu loại DIM), "kien" = ảnh kiện đã đóng gói, gửi khách xem (loại Other). Kho KHÔNG chụp từng kiện / AI — việc đó ở bước cuối.
 */
export default function OrderPhoto({ bookingId, kind, photoId, onUploaded }: { bookingId: number; kind: keyof typeof KINDS; photoId: number | null; onUploaded: () => void }) {
  const camera = useRef<HTMLInputElement>(null)
  const gallery = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [v, setV] = useState(0)
  const k = KINDS[kind]

  async function pick(files: FileList | null) {
    const raw = files?.[0]
    if (camera.current) camera.current.value = ''
    if (gallery.current) gallery.current.value = ''
    if (!raw || !raw.type.startsWith('image/')) return
    setBusy(true); setError(null)
    try {
      const f = new FormData()
      f.append('photo', await shrinkImage(raw))
      await clientUpload(`/api/pickup-bookings/${bookingId}/photo/${kind}`, f)
      setV((x) => x + 1)
      onUploaded()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Lỗi tải ảnh')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="rounded-lg border border-border bg-surface p-3 print:hidden">
      <input ref={camera} type="file" accept="image/*" capture="environment" hidden onChange={(e) => void pick(e.target.files)} />
      <input ref={gallery} type="file" accept="image/*" hidden onChange={(e) => void pick(e.target.files)} />
      <div className="flex items-center gap-3">
        {photoId
          // eslint-disable-next-line @next/next/no-img-element -- ảnh qua proxy có cookie
          ? <img src={`${imageUrl(photoId)}&v=${v}`} alt={k.title} className="h-16 w-16 shrink-0 rounded-lg border border-border object-cover" />
          : <span className="grid h-16 w-16 shrink-0 place-items-center rounded-lg border border-dashed border-border text-text-muted"><k.Icon size={24} aria-hidden /></span>}
        <div className="min-w-0 flex-1">
          <p className="text-[14px] font-semibold text-text-primary">{k.title}</p>
          <p className={error ? 'text-[12.5px] text-danger' : 'text-[12.5px] text-text-muted'}>{error ?? (photoId ? k.done : k.empty)}</p>
        </div>
      </div>
      <div className="mt-2 grid grid-cols-2 gap-2">
        <button type="button" disabled={busy} onClick={() => camera.current?.click()}
          className="inline-flex h-11 items-center justify-center gap-1.5 rounded-lg border border-border text-[13.5px] font-medium text-text-secondary hover:bg-background disabled:opacity-50">
          {busy ? <Loader2 size={16} className="animate-spin" /> : <Camera size={16} />}{photoId ? 'Chụp lại' : 'Chụp'}
        </button>
        <button type="button" disabled={busy} onClick={() => gallery.current?.click()}
          className="inline-flex h-11 items-center justify-center gap-1.5 rounded-lg border border-border text-[13.5px] font-medium text-text-secondary hover:bg-background disabled:opacity-50">
          <ImageUp size={16} /> Tải ảnh lên
        </button>
      </div>
    </div>
  )
}
