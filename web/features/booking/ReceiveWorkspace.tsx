'use client'
import { useEffect, useRef, useState } from 'react'
import { Camera, Check, ChevronDown, ImageUp, Loader2, Plus, RefreshCw, Sparkles } from 'lucide-react'
import { Card, ErrorBox } from '@/shared/kit/Page'
import { Btn } from '@/shared/kit/Fields'
import { scaleImageUrl } from '@/shared/kit/ScaleImage'
import { clientFetch, clientUpload } from '@/shared/lib/api'
import { shrinkImage } from '@/shared/lib/image'
import { cn } from '@/shared/lib/utils'
import { toDecimal, type BookingDetail } from './bookingShared'

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
  const aiSeq = useRef(0)   // lượt đọc AI mới nhất; kết quả lượt cũ về muộn thì bỏ
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
    aiSeq.current++   // AI đang đọc ảnh kiện trước ⇒ bỏ kết quả
    setAiBusy(false)
    setAi(null)
    setAiMsg(null)
    setError(null)
    typed.current = new Set(s ? (['dai', 'rong', 'cao', 'tl'] as Key[]) : [])   // số đã lưu coi như người nhập — AI không ghi đè
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps -- chỉ khởi tạo form cho kiện đầu tiên khi mở
  useEffect(() => { openKien(booking, nextKien(booking)) }, [])

  async function analyze(file: File) {
    if (aiOff) return
    const seq = ++aiSeq.current
    setAiBusy(true)
    setAiMsg(null)
    try {
      const f = new FormData()
      f.append('photo', file)
      const g = await clientUpload<GoiY>('/api/ai/kien-photo', f)
      if (seq !== aiSeq.current) return   // đã chụp ảnh khác / đổi kiện — bỏ kết quả cũ
      const fill: Partial<Form> = {}
      const fields = new Set<Key>()
      const put = (k: Key, v: number | null) => { if (v != null && !typed.current.has(k)) { fill[k] = String(v); fields.add(k) } }
      put('dai', g.dai); put('rong', g.rong); put('cao', g.cao); put('tl', g.trongLuong)
      setForm((cur) => ({ ...cur, ...fill }))
      if (g.loai) setLoai(g.loai)
      setAi({ fields, goiY: g })
      if (fields.size === 0) setAiMsg(g.ghiChu || 'AI không đọc được số đo từ ảnh này — nhập tay.')
    } catch (e) {
      if (seq !== aiSeq.current) return
      const status = (e as { status?: number }).status
      if (status === 503) aiOff = true
      setAiMsg(status === 503 ? 'AI chưa bật trên máy chủ — nhập tay.' : e instanceof Error ? e.message : 'AI lỗi — nhập tay.')
    } finally {
      if (seq === aiSeq.current) setAiBusy(false)
    }
  }

  async function pick(files: FileList | null) {
    const raw = files?.[0]
    if (camera.current) camera.current.value = ''
    if (gallery.current) gallery.current.value = ''
    if (!raw || !raw.type.startsWith('image/')) return
    const file = await shrinkImage(raw)   // nén 1 lần, dùng cho cả AI và lưu
    typed.current = new Set()   // chụp/chọn ảnh mới = muốn đọc lại ⇒ AI được điền đè cả số cũ; ô gõ tay trong lúc AI đang đọc vẫn giữ
    setPhoto({ file, url: URL.createObjectURL(file) })
    void analyze(file)
  }

  function edit(k: Key, v: string) {
    typed.current.add(k)
    setForm((cur) => ({ ...cur, [k]: k === 'tl' ? toDecimal(v) : v.replace(/\D/g, '') }))
    setAi((cur) => (cur && cur.fields.has(k) ? { ...cur, fields: new Set(Array.from(cur.fields).filter((x) => x !== k)) } : cur))
  }

  const n = { dai: Number(form.dai), rong: Number(form.rong), cao: Number(form.cao), tl: Number(form.tl) }
  const dimOk = [n.dai, n.rong, n.cao].every((v) => Number.isInteger(v) && v >= 1 && v <= 999)
  const tlOk = form.tl.trim() !== '' && Number.isFinite(n.tl) && n.tl >= 0 && n.tl <= 99999
  const valid = dimOk && tlOk
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
      setFlash(`Đã lưu kiện ${current} lên CMS${r.daKhai ? ` (${r.daNhan}/${r.daKhai})` : ` (${r.daNhan} kiện)`}`)
      if (r.done && !existing && booking.trangThai < 2) onDone()   // vừa đủ số kiện khai ⇒ server đã chốt, về phiếu
      else openKien(b, existing ? current : nextKien(b))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Lỗi lưu kiện')
    } finally {
      setBusy(false)
    }
  }

  async function finish() {
    const msg = declared ? `Mới nhận ${booking.kiens.length}/${declared} kiện. Xong — không còn kiện nào nữa?` : `Xong — đã nhận ${booking.kiens.length} kiện?`
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

  const hasPhoto = Boolean(photo || existing?.hasPhoto)
  return (
    <>
      <div className="mb-3 flex items-center justify-between gap-2 print:hidden">
        <p className="text-[22px] font-bold text-text-primary">
          Kiện {current}{declared ? <span className="text-text-muted"> / {declared}</span> : ''}
          {declared > 0 && current > declared && <span className="ml-1 text-[14px] font-medium text-amber-700">(thêm)</span>}
        </p>
        {booking.kiens.some((k) => k.kienSo !== current) && <button type="button" onClick={sameAsPrevious} className="h-11 rounded-lg px-3 text-[13.5px] font-medium text-primary">Giống kiện trước</button>}
      </div>

      {(booking.kiens.length > 0 || canAddExtra) && (
        <details className="group mb-3 rounded-lg border border-border bg-surface print:hidden" open={existing !== undefined}>
          <summary className="flex h-11 cursor-pointer list-none items-center justify-between px-3 text-[13.5px] text-text-secondary">
            <span>Đã lưu {booking.kiens.length}{declared ? `/${declared}` : ''} kiện · <span className="text-primary">sửa kiện đã lưu</span></span>
            <ChevronDown size={18} className="transition-transform group-open:rotate-180" aria-hidden />
          </summary>
          <div className="flex flex-wrap gap-2 border-t border-border p-3">
            {Array.from({ length: chips }, (_, i) => i + 1).map((k) => (
              <button key={k} type="button" disabled={k > booking.kiens.length + 1} onClick={() => openKien(booking, k)}
                aria-label={`Kiện ${k}${saved.has(k) ? ' đã lưu' : ''}`} aria-current={k === current}
                className={cn('flex h-11 min-w-[52px] items-center justify-center gap-1 rounded-lg border px-2 text-[14px] font-medium disabled:opacity-40',
                  saved.has(k) ? 'border-success bg-success/10 text-success' : 'border-border bg-surface text-text-secondary',
                  k === current && 'ring-2 ring-primary')}>
                {saved.has(k) && <Check size={14} aria-hidden />}{k}
              </button>
            ))}
            {canAddExtra && (
              <button type="button" onClick={() => openKien(booking, booking.kiens.length + 1)} aria-label="Thêm kiện" aria-current={current === booking.kiens.length + 1}
                className={cn('flex h-11 items-center gap-1 rounded-lg border border-dashed border-border px-3 text-[13.5px] text-text-secondary',
                  current === booking.kiens.length + 1 && 'ring-2 ring-primary')}>
                <Plus size={16} /> Thêm kiện
              </button>
            )}
          </div>
        </details>
      )}

      {flash && !error && <p className="mb-2 rounded-lg bg-success/10 px-3 py-2 text-[14px] font-medium text-success print:hidden" role="status">✓ {flash}</p>}
      {error && <div className="mb-3 print:hidden"><ErrorBox message={error} /></div>}

      <Card className="print:hidden">
        <input ref={camera} type="file" accept="image/*" capture="environment" hidden onChange={(e) => void pick(e.target.files)} />
        <input ref={gallery} type="file" accept="image/*" hidden onChange={(e) => void pick(e.target.files)} />
        {hasPhoto ? (
          <div className="mb-3 flex items-center gap-2">
            {photo
              // eslint-disable-next-line @next/next/no-img-element -- xem trước ảnh blob cục bộ
              ? <img src={photo.url} alt="Ảnh kiện vừa chụp" className="h-20 w-20 shrink-0 rounded-lg border border-border object-cover" />
              // eslint-disable-next-line @next/next/no-img-element -- ảnh động qua proxy có cookie
              : <img src={`${scaleImageUrl(`/api/pickup-bookings/${booking.id}/kien/${current}/photo`)}&v=${version}`} alt={`Ảnh kiện ${current} đã lưu`} className="h-20 w-20 shrink-0 rounded-lg border border-border object-cover" />}
            <Btn type="button" variant="outline" className="h-14 flex-1 text-[14.5px]" onClick={() => camera.current?.click()}><Camera size={20} /> Chụp lại</Btn>
            <Btn type="button" variant="outline" className="h-14 px-3" aria-label="Chọn ảnh có sẵn" onClick={() => gallery.current?.click()}><ImageUp size={20} /></Btn>
          </div>
        ) : (
          <div className="mb-3">
            <Btn type="button" className="h-20 w-full text-[18px]" onClick={() => camera.current?.click()}><Camera size={26} /> Chụp kiện</Btn>
            <button type="button" onClick={() => gallery.current?.click()} className="mt-1 h-11 w-full text-[13.5px] text-text-secondary">hoặc chọn ảnh có sẵn</button>
          </div>
        )}

        <div aria-live="polite">
          {aiBusy && <p className="mb-3 flex items-center gap-2 rounded-lg bg-primary-light px-3 py-2 text-[14px] text-primary"><Loader2 className="animate-spin" size={18} /> AI đang đọc số trên thùng…</p>}
          {!aiBusy && ai && ai.fields.size > 0 && (
            <div className="mb-3 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[13px] text-amber-900">
              <Sparkles size={16} className="mt-0.5 shrink-0" aria-hidden />
              <span className="flex-1"><b>Ô viền vàng do AI điền — xem lại rồi Lưu.</b> {ai.goiY.ghiChu}</span>
              {photo && <button type="button" onClick={() => void analyze(photo.file)} className="-my-1 flex h-9 shrink-0 items-center gap-1 rounded px-2 font-medium" aria-label="AI đọc lại ảnh"><RefreshCw size={14} /> Đọc lại</button>}
            </div>
          )}
          {!aiBusy && aiMsg && <p className="mb-3 text-[13px] text-text-muted">{aiMsg}</p>}
        </div>

        <div className="grid grid-cols-2 gap-3">
          {num('dai', 'Dài (cm)', daiBox)}
          {num('rong', 'Rộng (cm)')}
          {num('cao', 'Cao (cm)')}
          {num('tl', 'Cân (kg)')}
        </div>

        <div className="mt-3 grid grid-cols-2 gap-2" role="radiogroup" aria-label="Loại kiện">
          {(['CARTON', 'TUI'] as Loai[]).map((l) => (
            <button key={l} type="button" role="radio" aria-checked={loai === l} onClick={() => setLoai(l)}
              className={cn('h-11 rounded-lg border text-[14px]', loai === l ? 'border-primary bg-primary-light font-semibold text-primary' : 'border-border bg-surface text-text-secondary')}>
              {l === 'CARTON' ? 'Thùng' : 'Túi / bao'}
            </button>
          ))}
        </div>
      </Card>

      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-border bg-surface p-3 [padding-bottom:max(0.75rem,env(safe-area-inset-bottom))] print:hidden">
        <div className="mx-auto flex max-w-xl gap-2">
          {canFinish && <Btn type="button" variant="outline" className="h-14 px-4 text-[15px]" disabled={busy} onClick={finish}>Xong</Btn>}
          <Btn type="button" className="h-14 flex-1 text-[16px]" disabled={!valid || busy || aiBusy} onClick={save}>
            {busy ? <Loader2 className="animate-spin" size={20} /> : <Check size={20} />}
            {busy ? 'Đang lưu…' : existing ? `Lưu sửa kiện ${current}` : isLast ? `Lưu kiện ${current} (cuối)` : `Lưu kiện ${current}`}
          </Btn>
        </div>
      </div>
    </>
  )
}
