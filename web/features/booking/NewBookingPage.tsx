'use client'
import { useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { ChevronDown, Loader2, PackageOpen, Save } from 'lucide-react'
import { Card, ErrorBox, PageHeader } from '@/shared/kit/Page'
import CustomerPicker from '@/shared/kit/CustomerPicker'
import { Btn, TextAreaField, TextField } from '@/shared/kit/Fields'
import { useAction } from '@/shared/lib/hooks'

/**
 * Book pickup (sale/CS) hoặc ?taiKho=1: khách tự mang hàng tới kho (bỏ bước pickup). Cả hai tạo vận đơn nháp CRM + mã B<ID>.
 * Book: chỉ bắt buộc khách + số kiện; liên hệ/địa chỉ/hẹn giờ để trống thì server lấy từ hồ sơ khách (gom trong "Thêm thông tin").
 * Tại kho: chỉ chọn khách → vào thẳng màn nhận kiện, số kiện đếm theo thực nhận.
 */
export default function NewBookingPage() {
  const router = useRouter()
  const taiKho = useSearchParams().get('taiKho') === '1'
  const { run, busy, error } = useAction()
  const [customer, setCustomer] = useState<{ id: number; name: string } | null>(null)
  const [soKien, setSoKien] = useState('1')
  const [kg, setKg] = useState('')
  const [tenHang, setTenHang] = useState('')
  const [contactName, setContactName] = useState('')
  const [contactPhone, setContactPhone] = useState('')
  const [address, setAddress] = useState('')
  const [plan, setPlan] = useState('')
  const [note, setNote] = useState('')
  const [touched, setTouched] = useState(false)

  const n = Number(soKien)
  const soKienOk = taiKho || (Number.isInteger(n) && n >= 1 && n <= 9999)
  const kgOk = kg.trim() === '' || (Number.isFinite(Number(kg)) && Number(kg) >= 0)
  const valid = customer !== null && soKienOk && kgOk

  async function save() {
    setTouched(true)
    if (!valid || busy) return
    const res = await run<{ id: number; code: string }>('POST', '/api/pickup-bookings', taiKho
      ? { customerId: customer!.id, taiKho: true, tenHang: tenHang.trim() || null, note: note.trim() || null }
      : {
          customerId: customer!.id, soKien: n, kgDuKien: kg.trim() === '' ? null : Number(kg), tenHang: tenHang.trim() || null,
          contactName: contactName.trim() || null, contactPhone: contactPhone.trim() || null, pickupAddress: address.trim() || null,
          planDate: plan || null, note: note.trim() || null,
        })
    if (res) router.push(taiKho ? `/${res.id}?nhan=1` : `/${res.id}`)
  }

  return (
    <div className="mx-auto max-w-xl pb-28">
      <PageHeader
        title={taiKho ? 'Khách mang hàng tới kho' : 'Book pickup mới'}
        subtitle={taiKho ? 'Chọn khách rồi cân, đo, chụp từng kiện ngay — không cần book trước.' : 'Chọn khách, số kiện. Lưu xong có mã QR cho giao nhận.'} />

      <Card className="mb-3">
        <CustomerPicker value={customer} onChange={setCustomer} required />
        {touched && !customer && <p className="mt-1 text-[12.5px] text-danger" role="alert">Chọn khách hàng.</p>}

        {!taiKho && (
          <div className="mt-3 grid grid-cols-2 gap-3">
            <TextField label="Số kiện" required value={soKien} inputMode="numeric" onChange={(v) => setSoKien(v.replace(/\D/g, ''))} className="h-11 text-[15px]" />
            <TextField label="Cân dự kiến (kg)" value={kg} inputMode="decimal" onChange={(v) => setKg(v.replace(/[^\d.]/g, ''))} className="h-11 text-[15px]" />
          </div>
        )}
        {touched && !soKienOk && <p className="mt-1 text-[12.5px] text-danger" role="alert">Số kiện từ 1 đến 9999.</p>}
        <div className="mt-3">
          <TextField label="Tên hàng" value={tenHang} onChange={setTenHang} placeholder="VD: quần áo, mỹ phẩm…" autoComplete="off" className="h-11 text-[15px]" />
        </div>
      </Card>

      {taiKho ? (
        <Card className="mb-3"><TextAreaField label="Ghi chú" value={note} onChange={setNote} rows={2} /></Card>
      ) : (
        <details className="group mb-3 rounded-lg border border-border bg-surface">
          <summary className="flex h-12 cursor-pointer list-none items-center justify-between px-4 text-[14px] font-medium text-text-secondary">
            Thêm thông tin (liên hệ, địa chỉ, hẹn giờ)
            <ChevronDown size={18} className="transition-transform group-open:rotate-180" aria-hidden />
          </summary>
          <div className="space-y-3 border-t border-border px-4 pb-4 pt-3">
            <p className="text-[12.5px] text-text-muted">Để trống thì lấy theo hồ sơ khách hàng.</p>
            <div className="grid gap-3 sm:grid-cols-2">
              <TextField label="Người liên hệ lấy hàng" value={contactName} onChange={setContactName} autoComplete="off" />
              <TextField label="Số điện thoại" value={contactPhone} onChange={setContactPhone} inputMode="tel" autoComplete="off" />
            </div>
            <TextField label="Địa chỉ lấy hàng" value={address} onChange={setAddress} autoComplete="off" />
            <TextField label="Hẹn giờ lấy" type="datetime-local" value={plan} onChange={setPlan} />
            <TextAreaField label="Ghi chú" value={note} onChange={setNote} rows={2} />
          </div>
        </details>
      )}
      {error && <ErrorBox message={error} />}

      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-border bg-surface p-3 [padding-bottom:max(0.75rem,env(safe-area-inset-bottom))]">
        <div className="mx-auto max-w-xl">
          <Btn type="button" className="h-12 w-full text-[15px]" disabled={busy} onClick={save}>
            {busy ? <Loader2 className="animate-spin" size={18} /> : taiKho ? <PackageOpen size={18} /> : <Save size={18} />}
            {busy ? 'Đang lưu…' : taiKho ? 'Bắt đầu nhận hàng' : 'Lưu & tạo QR'}
          </Btn>
        </div>
      </div>
    </div>
  )
}
