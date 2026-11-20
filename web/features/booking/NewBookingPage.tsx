'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, Plus, Save, Trash2 } from 'lucide-react'
import { Card, ErrorBox, PageHeader } from '@/shared/kit/Page'
import CustomerPicker from '@/shared/kit/CustomerPicker'
import { Btn, TextAreaField, TextField } from '@/shared/kit/Fields'
import { useAction } from '@/shared/lib/hooks'

interface Line { moTa: string; soKien: string; kg: string }
const emptyLine = (): Line => ({ moTa: '', soKien: '1', kg: '' })

/**
 * Book pickup mới (ADR-052). Một cột trên điện thoại; nút Lưu cố định ở đáy. Nhân viên book = người đăng nhập (server gán).
 * Lưu → Pickup_Booking + Pickup_Booking_Line, server sinh mã PK… rồi mở trang chi tiết để in QR.
 */
export default function NewBookingPage() {
  const router = useRouter()
  const { run, busy, error } = useAction()
  const [customer, setCustomer] = useState<{ id: number; name: string } | null>(null)
  const [contactName, setContactName] = useState('')
  const [contactPhone, setContactPhone] = useState('')
  const [address, setAddress] = useState('')
  const [plan, setPlan] = useState('')
  const [note, setNote] = useState('')
  const [lines, setLines] = useState<Line[]>([emptyLine()])
  const [touched, setTouched] = useState(false)

  const lineOk = (l: Line) => Number.isInteger(Number(l.soKien)) && Number(l.soKien) >= 1 && Number(l.soKien) <= 9999 && (l.kg.trim() === '' || Number(l.kg) >= 0)
  const valid = customer !== null && lines.length > 0 && lines.every(lineOk)
  const patch = (i: number, p: Partial<Line>) => setLines((cur) => cur.map((l, k) => (k === i ? { ...l, ...p } : l)))

  async function save() {
    setTouched(true)
    if (!valid || busy) return
    const res = await run<{ id: number; code: string }>('POST', '/api/pickup-bookings', {
      customerId: customer!.id,
      contactName: contactName.trim() || null,
      contactPhone: contactPhone.trim() || null,
      pickupAddress: address.trim() || null,
      planDate: plan || null,
      note: note.trim() || null,
      lines: lines.map((l) => ({ moTa: l.moTa.trim() || null, soKien: Number(l.soKien), kgDuKien: l.kg.trim() === '' ? null : Number(l.kg) })),
    })
    if (res) router.push(`/${res.id}`)
  }

  return (
    <div className="mx-auto max-w-xl pb-28">
      <PageHeader title="Book pickup mới" subtitle="Chọn khách, khai hàng. Lưu xong có mã và QR để giao nhận." />

      <Card className="mb-3">
        <CustomerPicker value={customer} onChange={setCustomer} required />
        {touched && !customer && <p className="mt-1 text-[12.5px] text-danger" role="alert">Chọn khách hàng.</p>}
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <TextField label="Người liên hệ lấy hàng" value={contactName} onChange={setContactName} autoComplete="off" hint="Để trống: tự lấy từ hồ sơ khách" />
          <TextField label="Số điện thoại" value={contactPhone} onChange={setContactPhone} inputMode="tel" autoComplete="off" />
        </div>
        <div className="mt-3"><TextField label="Địa chỉ lấy hàng" value={address} onChange={setAddress} autoComplete="off" /></div>
        <div className="mt-3"><TextField label="Hẹn giờ lấy" type="datetime-local" value={plan} onChange={setPlan} /></div>
      </Card>

      <Card title="Hàng cần lấy" className="mb-3">
        <ul className="space-y-3">
          {lines.map((l, i) => (
            <li key={i} className="rounded-lg border border-border p-3">
              <TextField label={`Mô tả hàng ${lines.length > 1 ? i + 1 : ''}`.trim()} value={l.moTa} onChange={(v) => patch(i, { moTa: v })} placeholder="VD: quần áo, mỹ phẩm…" autoComplete="off" />
              <div className="mt-2 grid grid-cols-[1fr_1fr_auto] items-end gap-2">
                <TextField label="Số kiện" value={l.soKien} inputMode="numeric" onChange={(v) => patch(i, { soKien: v.replace(/\D/g, '') })} />
                <TextField label="Cân dự kiến (kg)" value={l.kg} inputMode="decimal" onChange={(v) => patch(i, { kg: v.replace(/[^\d.]/g, '') })} />
                <button type="button" aria-label="Bỏ dòng hàng này" disabled={lines.length === 1} onClick={() => setLines((cur) => cur.filter((_, k) => k !== i))}
                  className="grid h-11 w-11 place-items-center rounded-lg border border-border text-text-muted disabled:opacity-30"><Trash2 size={18} /></button>
              </div>
              {touched && !lineOk(l) && <p className="mt-1 text-[12.5px] text-danger" role="alert">Số kiện từ 1 đến 9999.</p>}
            </li>
          ))}
        </ul>
        <button type="button" onClick={() => setLines((cur) => [...cur, emptyLine()])}
          className="mt-3 flex h-11 w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-border text-[13.5px] text-text-secondary"><Plus size={16} /> Thêm dòng hàng</button>
      </Card>

      <Card className="mb-3"><TextAreaField label="Ghi chú" value={note} onChange={setNote} rows={2} /></Card>
      {error && <ErrorBox message={error} />}

      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-border bg-surface p-3 [padding-bottom:max(0.75rem,env(safe-area-inset-bottom))]">
        <div className="mx-auto max-w-xl">
          <Btn type="button" className="h-12 w-full text-[15px]" disabled={busy} onClick={save}>
            {busy ? <Loader2 className="animate-spin" size={18} /> : <Save size={18} />} {busy ? 'Đang lưu…' : 'Lưu & tạo QR'}
          </Btn>
        </div>
      </div>
    </div>
  )
}
