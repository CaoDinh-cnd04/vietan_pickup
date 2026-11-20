'use client'
import { useEffect, useRef, useState } from 'react'
import { Camera, Check, ImageUp, Loader2 } from 'lucide-react'
import { Card, ErrorBox } from '@/shared/kit/Page'
import { Btn } from '@/shared/kit/Fields'
import { scaleImageUrl } from '@/shared/kit/ScaleImage'
import { clientFetch, clientUpload } from '@/shared/lib/api'
import { fmtNumber, quiDoi } from '@/shared/lib/format'
import { shrinkImage } from '@/shared/lib/image'
import { cn } from '@/shared/lib/utils'
import type { BookingDetail } from './bookingShared'

type Form = { dai: string; rong: string; cao: string; tl: string }
const EMPTY: Form = { dai: '', rong: '', cao: '', tl: '' }

const declaredOf = (b: BookingDetail) => b.lines.reduce((s, l) => s + l.soKien, 0)
function firstMissing(b: BookingDetail): number {
  const have = new Set(b.kiens.map((k) => k.kienSo))
  const total = declaredOf(b)
  for (let k = 1; k <= total; k++) if (!have.has(k)) return k
  return Math.max(total, ...b.kiens.map((k) => k.kienSo), 0) + 1
}

/**
 * Phần "nhận kiện" nằm NGAY TRONG trang chi tiết lệnh PK (ADR-053, gộp màn): mỗi kiện một thao tác (ảnh + dài/rộng/cao/cân),
 * quy đổi & cân tính cước do máy tính, đủ số kiện khai thì server tự chốt "kho đã nhận". Cân điền sẵn = cân dự kiến/số kiện.
 */
export default function ReceiveWorkspace({ booking, onChange }: { booking: BookingDetail; onChange: (b: BookingDetail) => void }) {
  const [current, setCurrent] = useState(() => firstMissing(booking))
  const [form, setForm] = useState<Form>(EMPTY)
  const [photo, setPhoto] = useState<{ file: File; url: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [flash, setFlash] = useState<string | null>(null)
  const [version, setVersion] = useState(0)
  const daiBox = useRef<HTMLInputElement>(null)
  const camera = useRef<HTMLInputElement>(null)
  const gallery = useRef<HTMLInputElement>(null)

  useEffect(() => () => { if (photo) URL.revokeObjectURL(photo.url) }, [photo])

  const declared = declaredOf(booking)
  const declaredKg = booking.lines.reduce((s, l) => s + (l.kgDuKien ?? 0), 0)
  const saved = new Map(booking.kiens.map((k) => [k.kienSo, k]))
  const maxKien = Math.max(declared, ...booking.kiens.map((k) => k.kienSo), 0)
  const existing = saved.get(current)

  function openKien(b: BookingDetail, k: number) {
    setCurrent(k)
    const s = b.kiens.find((x) => x.kienSo === k)
    const total = declaredOf(b)
    const kg = b.lines.reduce((x, l) => x + (l.kgDuKien ?? 0), 0)
    setForm(s
      ? { dai: String(s.dai), rong: String(s.rong), cao: String(s.cao), tl: String(s.trongLuong) }
      : { ...EMPTY, tl: total > 0 && kg > 0 ? String(Math.round((kg / total) * 10) / 10) : '' })
    setPhoto(null)
    setError(null)
    setTimeout(() => daiBox.current?.focus(), 50)
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps -- chỉ khởi tạo form cho kiện đầu tiên khi mở
  useEffect(() => { openKien(booking, firstMissing(booking)) }, [])

  function pick(files: FileList | null) {
    const f = files?.[0]
    if (!f || !f.type.startsWith('image/')) return
    setPhoto({ file: f, url: URL.createObjectURL(f) })
    if (camera.current) camera.current.value = ''
    if (gallery.current) gallery.current.value = ''
  }

  const n = { dai: Number(form.dai), rong: Number(form.rong), cao: Number(form.cao), tl: Number(form.tl) }
  const dimOk = [n.dai, n.rong, n.cao].every((v) => Number.isInteger(v) && v >= 1 && v <= 999)
  const tlOk = form.tl.trim() !== '' && Number.isFinite(n.tl) && n.tl >= 0 && n.tl <= 99999
  const valid = dimOk && tlOk
  const qd = dimOk ? quiDoi(n.dai, n.rong, n.cao) : null
  const cw = qd !== null && tlOk ? Math.max(n.tl, qd) : null
  const isLastMissing = booking.kiens.length + (existing ? 0 : 1) >= declared

  function sameAsPrevious() {
    const prev = [...booking.kiens].filter((k) => k.kienSo !== current).sort((a, b) => Math.abs(a.kienSo - current) - Math.abs(b.kienSo - current))[0]
    if (prev) setForm({ dai: String(prev.dai), rong: String(prev.rong), cao: String(prev.cao), tl: form.tl || String(prev.trongLuong) })
  }

  async function save() {
    if (!valid || busy) return
    setBusy(true)
    setError(null)
    try {
      const f = new FormData()
      f.append('kienSo', String(current))
      f.append('dai', String(n.dai)); f.append('rong', String(n.rong)); f.append('cao', String(n.cao)); f.append('trongLuong', String(n.tl))
      if (photo) f.append('photo', await shrinkImage(photo.file))
      const r = await clientUpload<{ done: boolean; daNhan: number; daKhai: number }>(`/api/pickup-bookings/${booking.id}/kien`, f)
      const b = await clientFetch<BookingDetail>(`/api/pickup-bookings/${booking.id}`)
      onChange(b)
      setVersion((v) => v + 1)
      setFlash(`Đã lưu kiện ${current} (${r.daNhan}/${r.daKhai})`)
      if (!r.done) openKien(b, firstMissing(b))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Lỗi lưu kiện')
    } finally {
      setBusy(false)
    }
  }

  async function finishEarly() {
    if (!window.confirm(`Mới nhận ${booking.kiens.length}/${declared} kiện. Chốt "kho đã nhận"?`)) return
    setBusy(true)
    try {
      await clientFetch(`/api/pickup-bookings/${booking.id}/receive`, { method: 'POST' })
      onChange(await clientFetch<BookingDetail>(`/api/pickup-bookings/${booking.id}`))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Lỗi chốt nhận')
    } finally {
      setBusy(false)
    }
  }

  const num = (k: keyof Form, label: string, ref?: React.RefObject<HTMLInputElement>) => (
    <label className="block">
      <span className="mb-1 block text-[12.5px] font-medium text-text-secondary">{label}</span>
      <input ref={ref} value={form[k]} inputMode={k === 'tl' ? 'decimal' : 'numeric'} enterKeyHint={k === 'tl' ? 'done' : 'next'} autoComplete="off"
        onChange={(e) => setForm({ ...form, [k]: e.target.value.replace(k === 'tl' ? /[^\d.]/g : /\D/g, '') })}
        onKeyDown={(e) => { if (e.key === 'Enter' && k === 'tl') { e.preventDefault(); void save() } }}
        className="h-12 w-full rounded-lg border border-border bg-surface px-3 text-center text-[18px] outline-none focus:border-primary focus:ring-2 focus:ring-primary/20" />
    </label>
  )

  return (
    <>
      <Card className="mb-3 print:hidden">
        <div role="progressbar" aria-valuemin={0} aria-valuemax={declared} aria-valuenow={Math.min(booking.kiens.length, declared)} aria-label="Tiến độ nhận kiện">
          <div className="h-2 overflow-hidden rounded-full bg-background"><div className="h-full bg-success transition-all" style={{ width: `${declared ? Math.min(100, (booking.kiens.length / declared) * 100) : 0}%` }} /></div>
          <p className="mt-1 text-[12.5px] text-text-muted">Đã nhận {booking.kiens.length}/{declared} kiện{declaredKg ? ` · khai ${declaredKg} kg` : ''}</p>
        </div>
        <div className="mt-2 flex gap-2 overflow-x-auto pb-1">
          {Array.from({ length: maxKien }, (_, i) => i + 1).map((k) => (
            <button key={k} type="button" onClick={() => openKien(booking, k)} aria-label={`Kiện ${k}${saved.has(k) ? ' đã nhận' : ''}`} aria-current={k === current}
              className={cn('grid h-11 min-w-[44px] shrink-0 place-items-center rounded-lg border text-[14px] font-medium',
                saved.has(k) ? 'border-success bg-success/10 text-success' : 'border-border bg-surface text-text-secondary',
                k === current && 'ring-2 ring-primary')}>
              {saved.has(k) ? <Check size={16} /> : k}
            </button>
          ))}
        </div>
      </Card>

      {flash && !error && <p className="mb-2 text-[13px] font-medium text-success print:hidden" role="status">✓ {flash}</p>}
      {error && <div className="mb-3 print:hidden"><ErrorBox message={error} /></div>}

      <Card className="print:hidden">
        <div className="mb-3 flex items-center justify-between">
          <p className="text-[15px] font-semibold text-text-primary">Kiện {current}{declared ? ` / ${declared}` : ''}{current > declared ? ' (thêm)' : ''}</p>
          {booking.kiens.length > 0 && <button type="button" onClick={sameAsPrevious} className="h-11 rounded-lg px-3 text-[13.5px] font-medium text-primary">Giống kiện trước</button>}
        </div>

        <input ref={camera} type="file" accept="image/*" capture="environment" hidden onChange={(e) => pick(e.target.files)} />
        <input ref={gallery} type="file" accept="image/*" hidden onChange={(e) => pick(e.target.files)} />
        <div className="mb-3 flex items-center gap-2">
          {photo
            // eslint-disable-next-line @next/next/no-img-element -- xem trước ảnh blob cục bộ
            ? <img src={photo.url} alt="Ảnh kiện vừa chụp" className="h-20 w-20 shrink-0 rounded-lg border border-border object-cover" />
            : existing?.hasPhoto
              // eslint-disable-next-line @next/next/no-img-element -- ảnh động qua proxy có cookie
              ? <img src={`${scaleImageUrl(`/api/pickup-bookings/${booking.id}/kien/${current}/photo`)}&v=${version}`} alt={`Ảnh kiện ${current} đã lưu`} className="h-20 w-20 shrink-0 rounded-lg border border-border object-cover" />
              : <div className="grid h-20 w-20 shrink-0 place-items-center rounded-lg border border-dashed border-border text-[11.5px] text-text-muted">Chưa ảnh</div>}
          <Btn type="button" variant="outline" className="h-14 flex-1 text-[14.5px]" onClick={() => camera.current?.click()}><Camera size={20} /> {photo || existing?.hasPhoto ? 'Chụp lại' : 'Chụp ảnh'}</Btn>
          <Btn type="button" variant="outline" className="h-14 px-3" aria-label="Chọn ảnh từ máy" onClick={() => gallery.current?.click()}><ImageUp size={20} /></Btn>
        </div>

        <div className="grid grid-cols-2 gap-3">
          {num('dai', 'Dài (cm)', daiBox)}
          {num('rong', 'Rộng (cm)')}
          {num('cao', 'Cao (cm)')}
          {num('tl', 'Cân thực (kg)')}
        </div>
        <p className="mt-3 text-[13.5px] text-text-secondary" aria-live="polite">
          Quy đổi <b>{qd === null ? '—' : fmtNumber(qd)}</b> · Cân tính cước <b className="text-primary">{cw === null ? '—' : fmtNumber(cw)} kg</b>
        </p>
      </Card>

      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-border bg-surface p-3 [padding-bottom:max(0.75rem,env(safe-area-inset-bottom))] print:hidden">
        <div className="mx-auto flex max-w-xl gap-2">
          {booking.kiens.length > 0 && booking.kiens.length < declared && (
            <Btn type="button" variant="outline" className="h-12 px-3 text-[13.5px]" disabled={busy} onClick={finishEarly}>Chốt nhận</Btn>
          )}
          <Btn type="button" className="h-12 flex-1 text-[15px]" disabled={!valid || busy} onClick={save}>
            {busy ? <Loader2 className="animate-spin" size={18} /> : <Check size={18} />}
            {busy ? 'Đang lưu…' : isLastMissing ? 'Lưu kiện cuối' : 'Lưu & kiện tiếp'}
          </Btn>
        </div>
      </div>
    </>
  )
}
