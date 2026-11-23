'use client'
import { useEffect, useRef, useState } from 'react'
import { Camera, Check, ImageUp, Loader2, Plus, RefreshCw, Sparkles } from 'lucide-react'
import { Card, ErrorBox } from '@/shared/kit/Page'
import { Btn } from '@/shared/kit/Fields'
import { scaleImageUrl } from '@/shared/kit/ScaleImage'
import { clientFetch, clientUpload } from '@/shared/lib/api'
import { fmtNumber, quiDoi } from '@/shared/lib/format'
import { shrinkImage } from '@/shared/lib/image'
import { cn } from '@/shared/lib/utils'
import type { BookingDetail } from './bookingShared'

type Key = 'dai' | 'rong' | 'cao' | 'tl'
type Form = Record<Key, string>
type Loai = 'CARTON' | 'TUI'
const EMPTY: Form = { dai: '', rong: '', cao: '', tl: '' }

/** Gợi ý từ POST /api/ai/kien-photo (KienAi.cs). null = AI không xác định được. */
interface GoiY { dai: number | null; rong: number | null; cao: number | null; trongLuong: number | null; loai: Loai | null; nguonKichThuoc: 'thuoc' | 'uoc_luong' | 'khong_ro'; ghiChu: string }

/** Server chưa có khoá AI (503) ⇒ nhớ trong phiên trang, khỏi gọi lại mỗi kiện. */
let aiOff = false

/** Kiện kế tiếp cần nhận: nhận lần lượt (kiện k = dòng thứ k của MaVanDon_PCS_DIM). Đủ số khai ⇒ mở kiện 1 để xem/sửa. */
const nextKien = (b: BookingDetail) => (b.soKienBook === 0 || b.kiens.length < b.soKienBook ? b.kiens.length + 1 : 1)

/**
 * Nhận kiện tại kho, mỗi kiện một thao tác: CHỤP ẢNH (AI đọc cân/thước, ước lượng kích thước, điền sẵn) → người kho kiểm → Lưu.
 * Quy đổi & cân tính cước do máy tính; đủ số kiện khai thì server tự chốt. Khách mang tới kho (không khai) ⇒ bấm "Xong" để chốt.
 */
export default function ReceiveWorkspace({ booking, onChange, onDone }: { booking: BookingDetail; onChange: (b: BookingDetail) => void; onDone: () => void }) {
  const [current, setCurrent] = useState(() => nextKien(booking))
  const [form, setForm] = useState<Form>(EMPTY)
  const [loai, setLoai] = useState<Loai>('CARTON')
  const [photo, setPhoto] = useState<{ file: File; url: string } | null>(null)
  const [ai, setAi] = useState<{ fields: Set<Key>; goiY: GoiY } | null>(null)
  const [aiBusy, setAiBusy] = useState(false)
  const [aiMsg, setAiMsg] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [flash, setFlash] = useState<string | null>(null)
  const [version, setVersion] = useState(0)
  const typed = useRef(new Set<Key>())
  const daiBox = useRef<HTMLInputElement>(null)
  const camera = useRef<HTMLInputElement>(null)
  const gallery = useRef<HTMLInputElement>(null)

  useEffect(() => () => { if (photo) URL.revokeObjectURL(photo.url) }, [photo])

  const declared = booking.soKienBook
  const saved = new Map(booking.kiens.map((k) => [k.kienSo, k]))
  const existing = saved.get(current)
  const chips = Math.max(declared, booking.kiens.length)
  const canAddExtra = booking.kiens.length >= declared   // kiện thực nhiều hơn khai, hoặc khách mang tới kho

  function openKien(b: BookingDetail, k: number) {
    setCurrent(k)
    const s = b.kiens.find((x) => x.kienSo === k)
    const avg = b.soKienBook > 0 && (b.kgDuKien ?? 0) > 0 ? String(Math.round(((b.kgDuKien ?? 0) / b.soKienBook) * 10) / 10) : ''
    setForm(s ? { dai: String(s.dai), rong: String(s.rong), cao: String(s.cao), tl: String(s.trongLuong) } : { ...EMPTY, tl: avg })
    setLoai(s?.loai ?? 'CARTON')
    setPhoto(null)
    setAi(null)
    setAiMsg(null)
    setError(null)
    typed.current = new Set(s ? (['dai', 'rong', 'cao', 'tl'] as Key[]) : [])   // số đã lưu coi như người nhập — AI không ghi đè
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps -- chỉ khởi tạo form cho kiện đầu tiên khi mở
  useEffect(() => { openKien(booking, nextKien(booking)) }, [])

  async function analyze(file: File) {
    if (aiOff) return
    setAiBusy(true)
    setAiMsg(null)
    try {
      const f = new FormData()
      f.append('photo', file)
      const g = await clientUpload<GoiY>('/api/ai/kien-photo', f)
      const fill: Partial<Form> = {}
      const fields = new Set<Key>()
      const put = (k: Key, v: number | null) => { if (v != null && !typed.current.has(k)) { fill[k] = String(v); fields.add(k) } }
      put('dai', g.dai); put('rong', g.rong); put('cao', g.cao); put('tl', g.trongLuong)
      setForm((cur) => ({ ...cur, ...fill }))
      if (g.loai) setLoai(g.loai)
      setAi({ fields, goiY: g })
      if (fields.size === 0) setAiMsg(g.ghiChu || 'AI không đọc được số đo từ ảnh này — nhập tay.')
    } catch (e) {
      const status = (e as { status?: number }).status
      if (status === 503) aiOff = true
      setAiMsg(status === 503 ? 'AI chưa bật trên máy chủ — nhập tay.' : e instanceof Error ? e.message : 'AI lỗi — nhập tay.')
    } finally {
      setAiBusy(false)
    }
  }

  async function pick(files: FileList | null) {
    const raw = files?.[0]
    if (camera.current) camera.current.value = ''
    if (gallery.current) gallery.current.value = ''
    if (!raw || !raw.type.startsWith('image/')) return
    const file = await shrinkImage(raw)   // nén 1 lần, dùng cho cả AI và lưu
    setPhoto({ file, url: URL.createObjectURL(file) })
    void analyze(file)
  }

  function edit(k: Key, v: string) {
    typed.current.add(k)
    setForm((cur) => ({ ...cur, [k]: v.replace(k === 'tl' ? /[^\d.]/g : /\D/g, '') }))
    setAi((cur) => (cur && cur.fields.has(k) ? { ...cur, fields: new Set(Array.from(cur.fields).filter((x) => x !== k)) } : cur))
  }

  const n = { dai: Number(form.dai), rong: Number(form.rong), cao: Number(form.cao), tl: Number(form.tl) }
  const dimOk = [n.dai, n.rong, n.cao].every((v) => Number.isInteger(v) && v >= 1 && v <= 999)
  const tlOk = form.tl.trim() !== '' && Number.isFinite(n.tl) && n.tl >= 0 && n.tl <= 99999
  const valid = dimOk && tlOk
  const qd = dimOk ? quiDoi(n.dai, n.rong, n.cao) : null
  const cw = qd !== null && tlOk ? Math.max(n.tl, qd) : null
  const isLast = declared > 0 && !existing && booking.kiens.length + 1 >= declared
  const canFinish = booking.trangThai < 2 && booking.kiens.length > 0 && (declared === 0 || booking.kiens.length < declared)

  function sameAsPrevious() {
    const prev = booking.kiens.filter((k) => k.kienSo !== current).sort((a, b) => Math.abs(a.kienSo - current) - Math.abs(b.kienSo - current))[0]
    if (!prev) return
    ;(['dai', 'rong', 'cao'] as Key[]).forEach((k) => typed.current.add(k))
    setForm((cur) => ({ dai: String(prev.dai), rong: String(prev.rong), cao: String(prev.cao), tl: cur.tl || String(prev.trongLuong) }))
    setLoai(prev.loai)
    setAi((cur) => (cur ? { ...cur, fields: new Set(Array.from(cur.fields).filter((x) => x === 'tl')) } : cur))
  }

  async function save() {
    if (!valid || busy) return
    setBusy(true)
    setError(null)
    try {
      const f = new FormData()
      f.append('kienSo', String(current))
      f.append('dai', String(n.dai)); f.append('rong', String(n.rong)); f.append('cao', String(n.cao)); f.append('trongLuong', String(n.tl)); f.append('loai', loai)
      if (photo) f.append('photo', photo.file)
      const r = await clientUpload<{ done: boolean; daNhan: number; daKhai: number }>(`/api/pickup-bookings/${booking.id}/kien`, f)
      const b = await clientFetch<BookingDetail>(`/api/pickup-bookings/${booking.id}`)
      onChange(b)
      setVersion((v) => v + 1)
      setFlash(`Đã lưu kiện ${current}${r.daKhai ? ` (${r.daNhan}/${r.daKhai})` : ` (${r.daNhan} kiện)`}`)
      if (r.done && !existing && booking.trangThai < 2) onDone()   // vừa đủ số kiện khai ⇒ server đã chốt, về phiếu
      else openKien(b, existing ? current : nextKien(b))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Lỗi lưu kiện')
    } finally {
      setBusy(false)
    }
  }

  async function finish() {
    const msg = declared ? `Mới nhận ${booking.kiens.length}/${declared} kiện. Chốt "kho đã nhận"?` : `Chốt "kho đã nhận" với ${booking.kiens.length} kiện?`
    if (!window.confirm(msg)) return
    setBusy(true)
    try {
      await clientFetch(`/api/pickup-bookings/${booking.id}/receive`, { method: 'POST' })
      onChange(await clientFetch<BookingDetail>(`/api/pickup-bookings/${booking.id}`))
      onDone()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Lỗi chốt nhận')
    } finally {
      setBusy(false)
    }
  }

  const num = (k: Key, label: string, ref?: React.RefObject<HTMLInputElement>) => {
    const byAi = ai?.fields.has(k)
    const guess = byAi && k !== 'tl' && ai?.goiY.nguonKichThuoc === 'uoc_luong'
    return (
      <label className="block">
        <span className="mb-1 flex items-center gap-1 text-[12.5px] font-medium text-text-secondary">
          {label}
          {byAi && <span className="rounded bg-amber-100 px-1 text-[11px] font-semibold text-amber-800">{guess ? 'AI ước lượng' : 'AI'}</span>}
        </span>
        <input ref={ref} value={form[k]} inputMode={k === 'tl' ? 'decimal' : 'numeric'} enterKeyHint={k === 'tl' ? 'done' : 'next'} autoComplete="off"
          onChange={(e) => edit(k, e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && k === 'tl') { e.preventDefault(); void save() } }}
          className={cn('h-12 w-full rounded-lg border bg-surface px-3 text-center text-[18px] outline-none focus:border-primary focus:ring-2 focus:ring-primary/20',
            byAi ? 'border-amber-400 bg-amber-50' : 'border-border')} />
      </label>
    )
  }

  return (
    <>
      <Card className="mb-3 print:hidden">
        <div role="progressbar" aria-valuemin={0} aria-valuemax={declared || booking.kiens.length} aria-valuenow={booking.kiens.length} aria-label="Tiến độ nhận kiện">
          {declared > 0 && <div className="h-2 overflow-hidden rounded-full bg-background"><div className="h-full bg-success transition-all" style={{ width: `${Math.min(100, (booking.kiens.length / declared) * 100)}%` }} /></div>}
          <p className="mt-1 text-[12.5px] text-text-muted">Đã nhận {booking.kiens.length}{declared ? `/${declared}` : ''} kiện</p>
        </div>
        <div className="mt-2 flex gap-2 overflow-x-auto pb-1">
          {Array.from({ length: chips }, (_, i) => i + 1).map((k) => (
            <button key={k} type="button" disabled={k > booking.kiens.length + 1} onClick={() => openKien(booking, k)}
              aria-label={`Kiện ${k}${saved.has(k) ? ' đã nhận' : ''}`} aria-current={k === current}
              className={cn('grid h-11 min-w-[44px] shrink-0 place-items-center rounded-lg border text-[14px] font-medium disabled:opacity-40',
                saved.has(k) ? 'border-success bg-success/10 text-success' : 'border-border bg-surface text-text-secondary',
                k === current && 'ring-2 ring-primary')}>
              {saved.has(k) ? <Check size={16} /> : k}
            </button>
          ))}
          {canAddExtra && (
            <button type="button" onClick={() => openKien(booking, booking.kiens.length + 1)} aria-label="Thêm kiện" aria-current={current === booking.kiens.length + 1}
              className={cn('flex h-11 shrink-0 items-center gap-1 rounded-lg border border-dashed border-border px-3 text-[13.5px] text-text-secondary',
                current === booking.kiens.length + 1 && 'ring-2 ring-primary')}>
              <Plus size={16} /> Kiện {booking.kiens.length + 1}
            </button>
          )}
        </div>
      </Card>

      {flash && !error && <p className="mb-2 text-[13px] font-medium text-success print:hidden" role="status">✓ {flash}</p>}
      {error && <div className="mb-3 print:hidden"><ErrorBox message={error} /></div>}

      <Card className="print:hidden">
        <div className="mb-3 flex items-center justify-between">
          <p className="text-[15px] font-semibold text-text-primary">Kiện {current}{declared ? ` / ${declared}` : ''}{declared && current > declared ? ' (thêm)' : ''}</p>
          {booking.kiens.some((k) => k.kienSo !== current) && <button type="button" onClick={sameAsPrevious} className="h-11 rounded-lg px-3 text-[13.5px] font-medium text-primary">Giống kiện trước</button>}
        </div>

        <input ref={camera} type="file" accept="image/*" capture="environment" hidden onChange={(e) => void pick(e.target.files)} />
        <input ref={gallery} type="file" accept="image/*" hidden onChange={(e) => void pick(e.target.files)} />
        <div className="mb-2 flex items-center gap-2">
          {photo
            // eslint-disable-next-line @next/next/no-img-element -- xem trước ảnh blob cục bộ
            ? <img src={photo.url} alt="Ảnh kiện vừa chụp" className="h-20 w-20 shrink-0 rounded-lg border border-border object-cover" />
            : existing?.hasPhoto
              // eslint-disable-next-line @next/next/no-img-element -- ảnh động qua proxy có cookie
              ? <img src={`${scaleImageUrl(`/api/pickup-bookings/${booking.id}/kien/${current}/photo`)}&v=${version}`} alt={`Ảnh kiện ${current} đã lưu`} className="h-20 w-20 shrink-0 rounded-lg border border-border object-cover" />
              : <div className="grid h-20 w-20 shrink-0 place-items-center rounded-lg border border-dashed border-border text-[11.5px] text-text-muted">Chưa ảnh</div>}
          <Btn type="button" variant={photo || existing?.hasPhoto ? 'outline' : 'primary'} className="h-14 flex-1 text-[14.5px]" onClick={() => camera.current?.click()}>
            <Camera size={20} /> {photo || existing?.hasPhoto ? 'Chụp lại' : 'Chụp ảnh kiện'}
          </Btn>
          <Btn type="button" variant="outline" className="h-14 px-3" aria-label="Chọn ảnh từ máy" onClick={() => gallery.current?.click()}><ImageUp size={20} /></Btn>
        </div>
        {!photo && !existing && !aiOff && <p className="mb-3 text-[12.5px] text-text-muted">Chụp kiện trên bàn cân (thấy màn hình cân, có thước càng tốt) — AI sẽ điền sẵn số đo.</p>}

        <div aria-live="polite">
          {aiBusy && <p className="mb-3 flex items-center gap-2 text-[13px] text-text-secondary"><Loader2 className="animate-spin" size={16} /> AI đang đọc ảnh…</p>}
          {!aiBusy && ai && ai.fields.size > 0 && (
            <div className="mb-3 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[12.5px] text-amber-900">
              <Sparkles size={16} className="mt-0.5 shrink-0" aria-hidden />
              <span className="flex-1"><b>AI gợi ý — kiểm tra trước khi lưu.</b> {ai.goiY.ghiChu}</span>
              {photo && <button type="button" onClick={() => void analyze(photo.file)} className="-my-1 flex h-9 shrink-0 items-center gap-1 rounded px-2 font-medium" aria-label="AI đọc lại ảnh"><RefreshCw size={14} /> Đọc lại</button>}
            </div>
          )}
          {!aiBusy && aiMsg && <p className="mb-3 text-[12.5px] text-text-muted">{aiMsg}</p>}
        </div>

        <div className="mb-3 grid grid-cols-2 gap-2" role="radiogroup" aria-label="Loại kiện">
          {(['CARTON', 'TUI'] as Loai[]).map((l) => (
            <button key={l} type="button" role="radio" aria-checked={loai === l} onClick={() => setLoai(l)}
              className={cn('h-11 rounded-lg border text-[14px]', loai === l ? 'border-primary bg-primary-light font-semibold text-primary' : 'border-border bg-surface text-text-secondary')}>
              {l === 'CARTON' ? 'Thùng' : 'Túi / bao'}
            </button>
          ))}
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
          {canFinish && <Btn type="button" variant="outline" className="h-12 px-3 text-[13.5px]" disabled={busy} onClick={finish}>{declared ? 'Chốt nhận' : 'Xong'}</Btn>}
          <Btn type="button" className="h-12 flex-1 text-[15px]" disabled={!valid || busy || aiBusy} onClick={save}>
            {busy ? <Loader2 className="animate-spin" size={18} /> : <Check size={18} />}
            {busy ? 'Đang lưu…' : existing ? 'Lưu sửa' : isLast ? 'Lưu kiện cuối' : 'Lưu & kiện tiếp'}
          </Btn>
        </div>
      </div>
    </>
  )
}
