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
interface GoiY { dai: number | null; rong: number | null; cao: number | null; trongLuong: number | null; nguonKichThuoc: 'thuoc' | 'uoc_luong' | 'khong_ro'; ghiChu: string }

/** Đọc mã QR / mã vạch shipping mark trong ảnh (null nếu không thấy). */
async function readCode(file: File): Promise<string | null> {
  const { BrowserMultiFormatReader } = await import('@zxing/browser')
  const url = URL.createObjectURL(file)
  try { return (await new BrowserMultiFormatReader().decodeFromImageUrl(url)).getText() } catch { return null } finally { URL.revokeObjectURL(url) }
}

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
  const [aiGuess, setAiGuess] = useState(false)   // AI ƯỚC LƯỢNG kích thước (thùng không ghi số đo)
  const [fromKho, setFromKho] = useState<Set<Key>>(new Set())   // ô đang là số kho đo lúc nhận (điền sẵn)
  const [aiBusy, setAiBusy] = useState(false)
  const [aiMsg, setAiMsg] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [flash, setFlash] = useState<string | null>(null)
  const [scanning, setScanning] = useState(false)
  const [dragging, setDragging] = useState(false)
  const [pending, setPending] = useState<{ file: File; url: string } | null>(null)   // ảnh tải lên trước khi có mã kiện
  const [reading, setReading] = useState(false)
  const pendingRef = useRef<File | null>(null)
  const startCamera = useRef<HTMLInputElement>(null)
  const startGallery = useRef<HTMLInputElement>(null)
  const typed = useRef(new Set<Key>())
  const formRef = useRef<Form>(EMPTY)
  formRef.current = form
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
    setFromKho(!x?.canLai && x?.kho ? new Set<Key>(['dai', 'rong', 'cao', 'tl']) : new Set())
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
      if (pendingRef.current) { applyPhoto(pendingRef.current); pendingRef.current = null; setPending(null) }   // ảnh đã tải trước ⇒ gắn cho kiện vừa mở
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
      // Thùng không ghi số đo ⇒ AI chỉ ƯỚC LƯỢNG kích thước: không đè số đã đo thật (kho đo / đã cân lại), chỉ điền ô trống.
      const guess = g.nguonKichThuoc === 'uoc_luong'
      const put = (k: Key, v: number | null) => {
        if (v == null || typed.current.has(k) || (guess && k !== 'tl' && formRef.current[k] !== '')) return
        fill[k] = String(v); fields.add(k)
      }
      put('dai', g.dai); put('rong', g.rong); put('cao', g.cao); put('tl', g.trongLuong)
      setForm((cur) => ({ ...cur, ...fill }))
      setAiFields(fields)
      setAiGuess(g.nguonKichThuoc === 'uoc_luong')
      setFromKho((cur) => new Set(Array.from(cur).filter((k) => !fields.has(k))))
      const keptKho = guess && (['dai', 'rong', 'cao'] as Key[]).some((k) => !fields.has(k) && formRef.current[k] !== '')
      setAiMsg(keptKho ? 'Thùng không ghi số đo — giữ số kho đã đo, AI chỉ ước lượng nên không điền đè. Kiểm lại nếu cần.'
        : fields.size === 0 ? g.ghiChu || 'AI không đọc được số từ ảnh — nhập tay.' : g.ghiChu || null)
    } catch (e) {
      if (seq !== aiSeq.current) return
      setAiMsg(e instanceof Error ? e.message : 'AI lỗi — nhập tay.')
    } finally {
      if (seq === aiSeq.current) setAiBusy(false)
    }
  }

  function applyPhoto(file: File) {
    typed.current = new Set()
    setPhoto({ file, url: URL.createObjectURL(file) })
    void analyze(file)
  }

  async function pick(files: FileList | null) {
    const raw = files?.[0]
    if (camera.current) camera.current.value = ''
    if (gallery.current) gallery.current.value = ''
    if (!raw || !raw.type.startsWith('image/')) return
    applyPhoto(await shrinkImage(raw))
  }

  /** Chụp / tải ảnh khi CHƯA có mã kiện: đọc QR shipping mark trong ảnh để tự tìm kiện; không đọc được thì giữ ảnh, chờ gõ mã. */
  async function pickFirst(files: FileList | null) {
    const raw = files?.[0]
    if (startCamera.current) startCamera.current.value = ''
    if (startGallery.current) startGallery.current.value = ''
    if (!raw || !raw.type.startsWith('image/')) return
    setReading(true); setError(null)
    try {
      const [file, found] = await Promise.all([shrinkImage(raw), readCode(raw)])
      pendingRef.current = file
      if (pending) URL.revokeObjectURL(pending.url)
      setPending({ file, url: URL.createObjectURL(file) })
      if (found) await lookup(found)
      else scanBox.current?.focus()
    } finally {
      setReading(false)
    }
  }

  function edit(k: Key, v: string) {
    typed.current.add(k)
    setForm((cur) => ({ ...cur, [k]: k === 'tl' ? toDecimal(v) : v.replace(/\D/g, '') }))
    setAiFields((cur) => (cur.has(k) ? new Set(Array.from(cur).filter((x) => x !== k)) : cur))
    setFromKho((cur) => (cur.has(k) ? new Set(Array.from(cur).filter((x) => x !== k)) : cur))
  }

  const n = { dai: Number(form.dai), rong: Number(form.rong), cao: Number(form.cao), tl: Number(form.tl) }
  const valid = [n.dai, n.rong, n.cao].every((v) => Number.isInteger(v) && v >= 1 && v <= 999)
    && form.tl.trim() !== '' && Number.isFinite(n.tl) && n.tl >= 0 && n.tl <= 999
  const hasPhoto = Boolean(photo || kien?.idHinh)
  const thumb = Boolean(photo || (kien?.idHinh && kien.hasPhoto))
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
        {label}
        {aiFields.has(k) && <span className="rounded bg-amber-100 px-1 text-[11px] font-semibold text-amber-800">{aiGuess && k !== 'tl' ? 'AI ước lượng' : 'AI'}</span>}
        {fromKho.has(k) && <span className="rounded bg-slate-100 px-1 text-[11px] font-semibold text-slate-600">Kho đo</span>}
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

      {!bill && !busy && (
        <Card className={cn(dragging && 'ring-2 ring-primary')}>
          <div onDragOver={(e) => { e.preventDefault(); setDragging(true) }} onDragLeave={() => setDragging(false)}
            onDrop={(e) => { e.preventDefault(); setDragging(false); void pickFirst(e.dataTransfer.files) }}>
            <input ref={startCamera} type="file" accept="image/*" capture="environment" hidden onChange={(e) => void pickFirst(e.target.files)} />
            <input ref={startGallery} type="file" accept="image/*" hidden onChange={(e) => void pickFirst(e.target.files)} />
            {pending ? (
              <div className="mb-3 flex items-center gap-3">
                {/* eslint-disable-next-line @next/next/no-img-element -- xem trước ảnh blob cục bộ */}
                <img src={pending.url} alt="Ảnh kiện đang chờ mã" className="h-20 w-20 shrink-0 rounded-lg border border-border object-cover" />
                <p className="text-[13.5px] text-text-secondary">Không đọc được mã trên ảnh — <strong>gõ hoặc quét mã kiện</strong> ở ô trên, ảnh sẽ dùng cho kiện đó.</p>
              </div>
            ) : (
              <p className="mb-3 text-[14px] text-text-secondary">Quét hoặc gõ mã kiện ở ô trên — hoặc chụp / tải ảnh kiện lên trước: ảnh thấy rõ QR shipping mark thì app tự tìm kiện.</p>
            )}
            <div className="flex gap-2">
              <Btn type="button" className="h-14 flex-1 text-[15px]" disabled={reading} onClick={() => startCamera.current?.click()}><Camera size={20} /> Chụp ảnh</Btn>
              <Btn type="button" variant="outline" className="h-14 flex-1 text-[15px]" disabled={reading} onClick={() => startGallery.current?.click()}>
                {reading ? <Loader2 size={20} className="animate-spin" /> : <ImageUp size={20} />} {reading ? 'Đang đọc mã…' : 'Tải ảnh lên'}
              </Btn>
            </div>
            <p className="mt-2 hidden text-[12px] text-text-muted sm:block">Hoặc kéo thả ảnh vào khung này.</p>
          </div>
        </Card>
      )}
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

          <Card className={cn(dragging && 'ring-2 ring-primary')}>
            <div onDragOver={(e) => { e.preventDefault(); setDragging(true) }} onDragLeave={() => setDragging(false)}
              onDrop={(e) => { e.preventDefault(); setDragging(false); void pick(e.dataTransfer.files) }}>
            <p className="mb-2 text-[20px] font-bold text-text-primary">Kiện {current}<span className="text-text-muted"> / {bill.soKien}</span></p>
            {kien?.kho && (
              <p className="mb-2 text-[13px] text-text-secondary">Kho đo: {kien.kho.dai}×{kien.kho.rong}×{kien.kho.cao} cm · {fmtNumber(kien.kho.trongLuong)} kg · tính cước {fmtNumber(kien.kho.chargeWeight)} kg</p>
            )}
            {kien?.canLai && (
              <p className="mb-2 text-[13px] text-success">Đã cân lại{kien.canLai.userName ? ` bởi ${kien.canLai.userName}` : ''} lúc {fmtDateTime(kien.canLai.at)} — lưu lại sẽ cập nhật.</p>
            )}

            <input ref={camera} type="file" accept="image/*" capture="environment" hidden onChange={(e) => void pick(e.target.files)} />
            <input ref={gallery} type="file" accept="image/*" hidden onChange={(e) => void pick(e.target.files)} />
            <div className="mb-3 flex items-stretch gap-2">
              {photo
                // eslint-disable-next-line @next/next/no-img-element -- xem trước ảnh blob cục bộ
                ? <img src={photo.url} alt="Ảnh kiện vừa chụp" className="h-20 w-20 shrink-0 rounded-lg border border-border object-cover" />
                : kien?.idHinh && kien.hasPhoto
                  // eslint-disable-next-line @next/next/no-img-element -- ảnh qua proxy có cookie
                  ? <img src={imageUrl(kien.idHinh)} alt={`Ảnh kiện ${current} đã lưu`} className="h-20 w-20 shrink-0 rounded-lg border border-border object-cover" />
                  : null}
              {/* có ảnh thu nhỏ ⇒ 2 nút xếp dọc cho khỏi tràn trên điện thoại */}
              <div className={cn('grid min-w-0 flex-1 gap-2', thumb ? 'grid-cols-1' : 'grid-cols-2')}>
                <Btn type="button" variant={hasPhoto ? 'outline' : 'primary'} className={cn('w-full text-[15px]', thumb ? 'h-11' : 'h-14')} onClick={() => camera.current?.click()}>
                  <Camera size={20} /> {hasPhoto ? 'Chụp lại' : 'Chụp ảnh'}
                </Btn>
                <Btn type="button" variant="outline" className={cn('w-full text-[15px]', thumb ? 'h-11' : 'h-14')} onClick={() => gallery.current?.click()}>
                  <ImageUp size={20} /> Tải ảnh lên
                </Btn>
              </div>
            </div>
            <p className="-mt-1 mb-2 hidden text-[12px] text-text-muted sm:block">Hoặc kéo thả ảnh vào khung này.</p>
            {aiBusy && <p className="mb-2 flex items-center gap-2 text-[13px] text-amber-700"><Sparkles size={16} className="animate-pulse" aria-hidden /> AI đang đọc số trên thùng…</p>}
            {aiMsg && !aiBusy && <p className="mb-2 text-[13px] text-text-secondary">{aiMsg}</p>}
            {kien?.idHinh && !kien.hasPhoto && !photo && <p className="mb-2 text-[12.5px] text-text-muted">Kiện có ảnh cũ (hệ cũ, không xem được ở đây) — chụp ảnh mới để thay.</p>}

            <div className="grid grid-cols-2 gap-3">
              {num('dai', 'Dài (cm)')}{num('rong', 'Rộng (cm)')}{num('cao', 'Cao (cm)')}{num('tl', 'Cân (kg)')}
            </div>
            </div>
          </Card>

          <div className="fixed inset-x-0 bottom-0 z-20 border-t border-border bg-surface p-3 [padding-bottom:max(0.75rem,env(safe-area-inset-bottom))]">
            <div className="mx-auto max-w-xl">
              <Btn type="button" className="h-14 w-full text-[16px]" disabled={!valid || !hasPhoto || busy} onClick={save}>
                {busy ? <Loader2 className="animate-spin" size={18} /> : <Check size={18} />}
                {busy ? 'Đang lưu…' : !hasPhoto ? 'Chụp hoặc tải ảnh kiện trước' : `Lưu kiện ${current} lên CMS`}
              </Btn>
            </div>
          </div>
        </>
      )}

      {scanning && <CameraScanner onClose={() => setScanning(false)} onResult={(c) => { setScanning(false); void lookup(c) }} />}
    </div>
  )
}
