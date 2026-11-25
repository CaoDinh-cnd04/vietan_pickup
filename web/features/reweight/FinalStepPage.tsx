'use client'
import { useEffect, useRef, useState } from 'react'
import { Camera, Check, CheckCircle2, ImageUp, Loader2, QrCode, ScanLine, Sparkles } from 'lucide-react'
import { Card, ErrorBox, PageHeader } from '@/shared/kit/Page'
import { Btn } from '@/shared/kit/Fields'
import { imageUrl } from '@/shared/kit/Admin'
import CameraScanner, { codeFromScan } from '@/shared/kit/CameraScanner'
import { clientFetch, clientUpload } from '@/shared/lib/api'
import { shrinkImage } from '@/shared/lib/image'
import { fmtDateTime, fmtNumber } from '@/shared/lib/format'
import { cn } from '@/shared/lib/utils'
import { toDecimal } from '@/features/booking/bookingShared'
import type { RwBill, RwKien } from './reweightShared'

type Key = 'dai' | 'rong' | 'cao' | 'tl'
type Form = Record<Key, string>
const EMPTY: Form = { dai: '', rong: '', cao: '', tl: '' }
interface GoiY { dai: number | null; rong: number | null; cao: number | null; trongLuong: number | null; ghiChu: string }

/** Kiện kế tiếp chưa cân lại (hết thì kiện 1). */
const nextKien = (b: RwBill, from = 0) => b.kiens.find((k) => k.kienSo > from && !k.canLai)?.kienSo ?? b.kiens.find((k) => !k.canLai)?.kienSo ?? 1

/**
 * BƯỚC CUỐI — sau khi kinh doanh in bill và dán shipping mark: quét mã kiện (số bill/kiện) → chụp ảnh kiện → AI đọc số kho ghi tay
 * (dài/rộng/cao/cân) → người kiểm → Lưu ⇒ ghi Order_VietAn_Reweight như màn "Nhập kích thước" của CMS (CMS khỏi nhập tay).
 * Ô điền sẵn số kho đã đo lúc nhận (nếu có); chụp ảnh mới thì AI điền đè.
 */
export default function FinalStepPage() {
  const [code, setCode] = useState('')
  const [bill, setBill] = useState<RwBill | null>(null)
  const [current, setCurrent] = useState(1)
  const [form, setForm] = useState<Form>(EMPTY)
  const [photo, setPhoto] = useState<{ file: File; url: string } | null>(null)
  const [aiFields, setAiFields] = useState<Set<Key>>(new Set())
  const [aiBusy, setAiBusy] = useState(false)
  const [aiMsg, setAiMsg] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [flash, setFlash] = useState<string | null>(null)
  const [scanning, setScanning] = useState(false)
  const typed = useRef(new Set<Key>())
  const aiSeq = useRef(0)
  const scanBox = useRef<HTMLInputElement>(null)
  const camera = useRef<HTMLInputElement>(null)
  const gallery = useRef<HTMLInputElement>(null)

  useEffect(() => () => { if (photo) URL.revokeObjectURL(photo.url) }, [photo])
  useEffect(() => { scanBox.current?.focus() }, [])

  const kien: RwKien | undefined = bill?.kiens.find((k) => k.kienSo === current)

  function openKien(b: RwBill, k: number) {
    setCurrent(k)
    const x = b.kiens.find((i) => i.kienSo === k)
    const src = x?.canLai ?? x?.kho
    setForm(src ? { dai: String(src.dai), rong: String(src.rong), cao: String(src.cao), tl: String(src.trongLuong) } : EMPTY)
    setPhoto(null); setAiFields(new Set()); setAiMsg(null); setError(null)
    aiSeq.current++; setAiBusy(false)
    typed.current = new Set()   // số điền sẵn (kho đo / đã cân) — AI được điền đè khi chụp ảnh mới
  }

  async function lookup(raw: string) {
    const c = codeFromScan(raw).trim()
    if (!c) return
    setError(null); setFlash(null); setBusy(true)
    try {
      const b = await clientFetch<RwBill>(`/api/reweight/lookup?code=${encodeURIComponent(c)}`)
      setBill(b)
      openKien(b, b.kienScan ?? nextKien(b))
      setCode('')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Không tìm thấy mã')
    } finally {
      setBusy(false)
    }
  }

  async function analyze(file: File) {
    const seq = ++aiSeq.current
    setAiBusy(true); setAiMsg(null)
    try {
      const f = new FormData()
      f.append('photo', file)
      const g = await clientUpload<GoiY>('/api/ai/kien-photo', f)
      if (seq !== aiSeq.current) return
      const fill: Partial<Form> = {}
      const fields = new Set<Key>()
      const put = (k: Key, v: number | null) => { if (v != null && !typed.current.has(k)) { fill[k] = String(v); fields.add(k) } }
      put('dai', g.dai); put('rong', g.rong); put('cao', g.cao); put('tl', g.trongLuong)
      setForm((cur) => ({ ...cur, ...fill }))
      setAiFields(fields)
      setAiMsg(fields.size === 0 ? g.ghiChu || 'AI không đọc được số từ ảnh — nhập tay.' : g.ghiChu || null)
    } catch (e) {
      if (seq !== aiSeq.current) return
      setAiMsg(e instanceof Error ? e.message : 'AI lỗi — nhập tay.')
    } finally {
      if (seq === aiSeq.current) setAiBusy(false)
    }
  }

  async function pick(files: FileList | null) {
    const raw = files?.[0]
    if (camera.current) camera.current.value = ''
    if (gallery.current) gallery.current.value = ''
    if (!raw || !raw.type.startsWith('image/')) return
    const file = await shrinkImage(raw)
    typed.current = new Set()
    setPhoto({ file, url: URL.createObjectURL(file) })
    void analyze(file)
  }

  function edit(k: Key, v: string) {
    typed.current.add(k)
    setForm((cur) => ({ ...cur, [k]: k === 'tl' ? toDecimal(v) : v.replace(/\D/g, '') }))
    setAiFields((cur) => (cur.has(k) ? new Set(Array.from(cur).filter((x) => x !== k)) : cur))
  }

  const n = { dai: Number(form.dai), rong: Number(form.rong), cao: Number(form.cao), tl: Number(form.tl) }
  const valid = [n.dai, n.rong, n.cao].every((v) => Number.isInteger(v) && v >= 1 && v <= 999)
    && form.tl.trim() !== '' && Number.isFinite(n.tl) && n.tl >= 0 && n.tl <= 999
  const hasPhoto = Boolean(photo || kien?.idHinh)
  const done = bill ? bill.kiens.filter((k) => k.canLai).length : 0

  async function save() {
    if (!bill || !valid || !hasPhoto || busy) return
    setBusy(true); setError(null)
    try {
      const f = new FormData()
      f.append('dai', String(n.dai)); f.append('rong', String(n.rong)); f.append('cao', String(n.cao)); f.append('trongLuong', String(n.tl))
      if (photo) f.append('photo', photo.file)
      await clientUpload(`/api/reweight/${bill.orderNumber}/${current}`, f)
      const b = await clientFetch<RwBill>(`/api/reweight/lookup?code=${bill.orderNumber}`)
      setBill(b)
      const left = b.kiens.filter((k) => !k.canLai).length
      setFlash(`Đã đẩy kiện ${bill.orderNumber}/${current} lên CMS${left ? ` — còn ${left} kiện` : ' — đủ kiện'}`)
      if (left) openKien(b, nextKien(b, current))
      else { openKien(b, current); scanBox.current?.focus() }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Lỗi lưu cân lại')
    } finally {
      setBusy(false)
    }
  }

  const num = (k: Key, label: string) => (
    <label className="block">
      <span className="mb-1 flex items-center gap-1 text-[12.5px] font-medium text-text-secondary">
        {label}{aiFields.has(k) && <span className="rounded bg-amber-100 px-1 text-[11px] font-semibold text-amber-800">AI</span>}
      </span>
      <input value={form[k]} inputMode={k === 'tl' ? 'decimal' : 'numeric'} autoComplete="off" onChange={(e) => edit(k, e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter' && k === 'tl') { e.preventDefault(); void save() } }}
        className={cn('h-12 w-full rounded-lg border bg-surface px-3 text-center text-[18px] outline-none focus:border-primary focus:ring-2 focus:ring-primary/20',
          aiFields.has(k) ? 'border-amber-400 bg-amber-50' : 'border-border')} />
    </label>
  )

  return (
    <div className="mx-auto max-w-xl pb-28">
      <PageHeader title="Bước cuối — cân lại" subtitle="Quét mã kiện trên shipping mark, chụp ảnh, kiểm số rồi lưu lên CMS." />

      <form className="mb-3 flex gap-2" onSubmit={(e) => { e.preventDefault(); void lookup(code) }}>
        <div className="relative min-w-0 flex-1">
          <ScanLine size={18} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" aria-hidden />
          <input ref={scanBox} value={code} onChange={(e) => setCode(e.target.value)} aria-label="Mã kiện" placeholder="Số bill/kiện, vd 6193393/1" autoComplete="off" enterKeyHint="go"
            className="h-12 w-full rounded-lg border border-border bg-surface pl-10 pr-3 text-[16px] outline-none focus:border-primary focus:ring-2 focus:ring-primary/20" />
        </div>
        <Btn type="button" className="h-12 px-4" onClick={() => setScanning(true)} aria-label="Quét bằng camera"><QrCode size={20} /></Btn>
      </form>

      {error && <ErrorBox message={error} />}
      {flash && !error && <p className="mb-3 flex items-center gap-2 rounded-lg bg-success/10 px-3 py-2 text-[14px] font-medium text-success" role="status"><CheckCircle2 size={18} aria-hidden /> {flash}</p>}

      {!bill && !busy && <p className="py-10 text-center text-[14px] text-text-muted">Quét hoặc gõ mã kiện để bắt đầu.</p>}
      {busy && !bill && <p className="flex items-center justify-center gap-2 py-10 text-[13px] text-text-muted"><Loader2 className="animate-spin" size={16} /> Đang tìm…</p>}

      {bill && (
        <>
          <Card className="mb-3">
            <p className="text-[16px] font-semibold text-text-primary">{bill.customerName ?? '(không tên khách)'}</p>
            <p className="text-[13px] text-text-muted">Bill <strong className="text-text-primary">{bill.orderNumber}</strong> · {bill.code} · đã cân {done}/{bill.soKien} kiện</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {bill.kiens.map((k) => (
                <button key={k.kienSo} type="button" onClick={() => openKien(bill, k.kienSo)} aria-current={k.kienSo === current}
                  aria-label={`Kiện ${k.kienSo}${k.canLai ? ' đã cân lại' : ''}`}
                  className={cn('flex h-11 min-w-[52px] items-center justify-center gap-1 rounded-lg border px-2 text-[14px] font-medium',
                    k.canLai ? 'border-success bg-success/10 text-success' : 'border-border bg-surface text-text-secondary', k.kienSo === current && 'ring-2 ring-primary')}>
                  {k.canLai && <Check size={14} aria-hidden />}{k.kienSo}
                </button>
              ))}
            </div>
          </Card>

          <Card>
            <p className="mb-2 text-[20px] font-bold text-text-primary">Kiện {current}<span className="text-text-muted"> / {bill.soKien}</span></p>
            {kien?.kho && (
              <p className="mb-2 text-[13px] text-text-secondary">Kho đo: {kien.kho.dai}×{kien.kho.rong}×{kien.kho.cao} cm · {fmtNumber(kien.kho.trongLuong)} kg · tính cước {fmtNumber(kien.kho.chargeWeight)} kg</p>
            )}
            {kien?.canLai && (
              <p className="mb-2 text-[13px] text-success">Đã cân lại{kien.canLai.userName ? ` bởi ${kien.canLai.userName}` : ''} lúc {fmtDateTime(kien.canLai.at)} — lưu lại sẽ cập nhật.</p>
            )}

            <input ref={camera} type="file" accept="image/*" capture="environment" hidden onChange={(e) => void pick(e.target.files)} />
            <input ref={gallery} type="file" accept="image/*" hidden onChange={(e) => void pick(e.target.files)} />
            <div className="mb-3 flex items-center gap-2">
              {photo
                // eslint-disable-next-line @next/next/no-img-element -- xem trước ảnh blob cục bộ
                ? <img src={photo.url} alt="Ảnh kiện vừa chụp" className="h-20 w-20 shrink-0 rounded-lg border border-border object-cover" />
                : kien?.idHinh && kien.hasPhoto
                  // eslint-disable-next-line @next/next/no-img-element -- ảnh qua proxy có cookie
                  ? <img src={imageUrl(kien.idHinh)} alt={`Ảnh kiện ${current} đã lưu`} className="h-20 w-20 shrink-0 rounded-lg border border-border object-cover" />
                  : null}
              <Btn type="button" variant={hasPhoto ? 'outline' : 'primary'} className="h-14 flex-1 text-[15px]" onClick={() => camera.current?.click()}>
                <Camera size={20} /> {hasPhoto ? 'Chụp lại' : 'Chụp ảnh kiện'}
              </Btn>
              <Btn type="button" variant="outline" className="h-14 w-14 px-0" aria-label="Chọn ảnh có sẵn" onClick={() => gallery.current?.click()}><ImageUp size={20} /></Btn>
            </div>
            {aiBusy && <p className="mb-2 flex items-center gap-2 text-[13px] text-amber-700"><Sparkles size={16} className="animate-pulse" aria-hidden /> AI đang đọc số trên thùng…</p>}
            {aiMsg && !aiBusy && <p className="mb-2 text-[13px] text-text-secondary">{aiMsg}</p>}
            {kien?.idHinh && !kien.hasPhoto && !photo && <p className="mb-2 text-[12.5px] text-text-muted">Kiện có ảnh cũ (hệ cũ, không xem được ở đây) — chụp ảnh mới để thay.</p>}

            <div className="grid grid-cols-2 gap-3">
              {num('dai', 'Dài (cm)')}{num('rong', 'Rộng (cm)')}{num('cao', 'Cao (cm)')}{num('tl', 'Cân (kg)')}
            </div>
          </Card>

          <div className="fixed inset-x-0 bottom-0 z-20 border-t border-border bg-surface p-3 [padding-bottom:max(0.75rem,env(safe-area-inset-bottom))]">
            <div className="mx-auto max-w-xl">
              <Btn type="button" className="h-14 w-full text-[16px]" disabled={!valid || !hasPhoto || busy} onClick={save}>
                {busy ? <Loader2 className="animate-spin" size={18} /> : <Check size={18} />}
                {busy ? 'Đang lưu…' : !hasPhoto ? 'Chụp ảnh kiện trước' : `Lưu kiện ${current} lên CMS`}
              </Btn>
            </div>
          </div>
        </>
      )}

      {scanning && <CameraScanner onClose={() => setScanning(false)} onResult={(c) => { setScanning(false); void lookup(c) }} />}
    </div>
  )
}
