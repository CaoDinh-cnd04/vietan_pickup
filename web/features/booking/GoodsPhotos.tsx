'use client'
import { useRef, useState } from 'react'
import { Camera, ImageUp, Loader2, Package, X } from 'lucide-react'
import { imageUrl } from '@/shared/kit/Admin'
import { clientFetch, clientUpload } from '@/shared/lib/api'
import { shrinkImage } from '@/shared/lib/image'

const MAX = 10   // = Bookings.MaxGoodsPhotos (API)

/**
 * Ảnh hàng hoá của kho — NHIỀU tấm (tối đa 10/đơn, loại DIM, barcode = mã đơn): chụp thêm / chọn nhiều ảnh từ thư viện, mỗi tấm tải lên ngay;
 * bấm × để xoá ảnh chụp nhầm.
 */
export default function GoodsPhotos({ bookingId, ids, onChanged }: { bookingId: number; ids: number[]; onChanged: () => void }) {
  const camera = useRef<HTMLInputElement>(null)
  const gallery = useRef<HTMLInputElement>(null)
  const [progress, setProgress] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const room = MAX - ids.length

  async function add(files: FileList | null) {
    const list = Array.from(files ?? []).filter((f) => f.type.startsWith('image/'))
    if (camera.current) camera.current.value = ''
    if (gallery.current) gallery.current.value = ''
    if (list.length === 0) return
    setError(null)
    const take = list.slice(0, room)
    try {
      for (let i = 0; i < take.length; i++) {
        setProgress(`Đang tải ${i + 1}/${take.length}…`)
        const f = new FormData()
        f.append('photo', await shrinkImage(take[i]))
        await clientUpload(`/api/pickup-bookings/${bookingId}/photo/hang`, f)
      }
      if (list.length > take.length) setError(`Chỉ tải ${take.length} ảnh — tối đa ${MAX} ảnh hàng hoá mỗi đơn.`)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Lỗi tải ảnh')
    } finally {
      setProgress(null)
      onChanged()
    }
  }

  async function remove(idHinh: number) {
    if (!window.confirm('Xoá ảnh hàng hoá này?')) return
    setError(null)
    try {
      await clientFetch(`/api/pickup-bookings/${bookingId}/photo/${idHinh}`, { method: 'DELETE' })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Lỗi xoá ảnh')
    } finally {
      onChanged()
    }
  }

  const busy = progress !== null
  return (
    <div className="rounded-lg border border-border bg-surface p-3 print:hidden">
      <input ref={camera} type="file" accept="image/*" capture="environment" hidden onChange={(e) => void add(e.target.files)} />
      <input ref={gallery} type="file" accept="image/*" multiple hidden onChange={(e) => void add(e.target.files)} />
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <p className="text-[14px] font-semibold text-text-primary">Ảnh hàng hoá <span className="font-normal text-text-muted">({ids.length}/{MAX})</span></p>
        {progress && <span className="flex items-center gap-1 text-[12.5px] text-primary"><Loader2 size={14} className="animate-spin" /> {progress}</span>}
      </div>

      {ids.length === 0 ? (
        <div className="mb-2 flex items-center gap-3 text-[12.5px] text-text-muted">
          <span className="grid h-16 w-16 shrink-0 place-items-center rounded-lg border border-dashed border-border"><Package size={24} aria-hidden /></span>
          Chụp hàng lúc nhận (chưa đóng) — chụp được nhiều tấm.
        </div>
      ) : (
        <ul className="mb-2 grid grid-cols-3 gap-2 sm:grid-cols-5">
          {ids.map((id, i) => (
            <li key={id} className="relative">
              <a href={imageUrl(id)} target="_blank" rel="noreferrer" aria-label={`Xem ảnh hàng hoá ${i + 1}`}>
                {/* eslint-disable-next-line @next/next/no-img-element -- ảnh qua proxy có cookie */}
                <img src={imageUrl(id)} alt={`Ảnh hàng hoá ${i + 1}`} loading="lazy" className="aspect-square w-full rounded-lg border border-border bg-slate-100 object-cover" />
              </a>
              <button type="button" onClick={() => void remove(id)} disabled={busy} aria-label={`Xoá ảnh hàng hoá ${i + 1}`}
                className="absolute -right-1 -top-1 grid h-9 w-9 place-items-center rounded-full border border-border bg-surface text-danger shadow-sm disabled:opacity-50">
                <X size={16} />
              </button>
            </li>
          ))}
        </ul>
      )}
      {error && <p className="mb-2 text-[12.5px] text-danger" role="alert">{error}</p>}

      <div className="grid grid-cols-2 gap-2">
        <button type="button" disabled={busy || room <= 0} onClick={() => camera.current?.click()}
          className="inline-flex h-11 items-center justify-center gap-1.5 rounded-lg border border-border text-[13.5px] font-medium text-text-secondary hover:bg-background disabled:opacity-50">
          <Camera size={16} /> {ids.length ? 'Chụp thêm' : 'Chụp'}
        </button>
        <button type="button" disabled={busy || room <= 0} onClick={() => gallery.current?.click()}
          className="inline-flex h-11 items-center justify-center gap-1.5 rounded-lg border border-border text-[13.5px] font-medium text-text-secondary hover:bg-background disabled:opacity-50">
          <ImageUp size={16} /> Tải ảnh lên
        </button>
      </div>
    </div>
  )
}
