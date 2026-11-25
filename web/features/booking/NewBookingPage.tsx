'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, PackageOpen } from 'lucide-react'
import { Card, ErrorBox, PageHeader } from '@/shared/kit/Page'
import CustomerPicker from '@/shared/kit/CustomerPicker'
import { Btn, TextField } from '@/shared/kit/Fields'
import { useAction, useApi } from '@/shared/lib/hooks'
import { cn } from '@/shared/lib/utils'

interface Placeholder { customerId: number; customerName: string; customerCode: string | null; saleName: string }
const MODES = [{ value: 'co-san', label: 'Khách có sẵn' }, { value: 'moi', label: 'Khách mới' }] as const
type Mode = (typeof MODES)[number]['value']

/**
 * Khách tự mang hàng tới kho (không có phiếu): chọn khách → tạo vận đơn nháp CRM + mã B<ID> → vào thẳng màn nhận kiện.
 * Khách mới (chưa có hồ sơ): như công ty đang làm — tạo dưới tài khoản "tạo bill" giữ chỗ của sale phụ trách, ghi tên + SĐT khách thật
 * vào người gửi của vận đơn; hồ sơ khách chính thức do sale tạo/duyệt trong CMS.
 */
export default function NewBookingPage() {
  const router = useRouter()
  const { run, busy, error } = useAction()
  const [mode, setMode] = useState<Mode>('co-san')
  const [customer, setCustomer] = useState<{ id: number; name: string } | null>(null)
  const [account, setAccount] = useState<number | ''>('')
  const [ten, setTen] = useState('')
  const [phone, setPhone] = useState('')
  const [address, setAddress] = useState('')
  const [touched, setTouched] = useState(false)
  const accounts = useApi<{ items: Placeholder[] }>(mode === 'moi' ? '/api/placeholder-accounts' : null)

  const moi = mode === 'moi'
  const valid = moi ? account !== '' && ten.trim() !== '' && phone.trim() !== '' : customer !== null

  async function save() {
    setTouched(true)
    if (!valid || busy) return
    const body = moi
      ? { customerId: account, taiKho: true, khachMoi: ten.trim(), contactPhone: phone.trim(), pickupAddress: address.trim() || null }
      : { customerId: customer!.id, taiKho: true }
    const res = await run<{ id: number; code: string }>('POST', '/api/pickup-bookings', body)
    if (res) router.push(`/${res.id}?nhan=1`)
  }

  const missing = (ok: boolean, msg: string) => touched && !ok && <p className="mt-1 text-[12.5px] text-danger" role="alert">{msg}</p>

  return (
    <div className="mx-auto max-w-xl pb-28">
      <PageHeader title="Khách mang hàng tới" subtitle="Chọn khách là vào chụp ảnh ngay." />

      <div className="mb-3 grid grid-cols-2 rounded-lg bg-slate-100 p-1" role="tablist" aria-label="Loại khách">
        {MODES.map((m) => (
          <button key={m.value} type="button" role="tab" aria-selected={mode === m.value} onClick={() => { setMode(m.value); setTouched(false) }}
            className={cn('h-10 rounded-md text-[14.5px] transition-colors', mode === m.value ? 'bg-surface font-semibold text-primary shadow-sm' : 'text-text-secondary')}>
            {m.label}
          </button>
        ))}
      </div>

      {!moi ? (
        <Card className="mb-3">
          <CustomerPicker value={customer} onChange={setCustomer} required />
          {missing(customer !== null, 'Chọn khách hàng.')}
          <p className="mt-2 text-[12.5px] text-text-muted">Không tìm thấy khách? Chọn tab &quot;Khách mới&quot;.</p>
        </Card>
      ) : (
        <Card className="mb-3">
          <label className="block">
            <span className="mb-1 block text-[12.5px] font-medium text-text-secondary">Sale phụ trách <span className="text-danger">*</span></span>
            <select value={account} onChange={(e) => setAccount(e.target.value ? Number(e.target.value) : '')} disabled={!accounts.data}
              className="h-11 w-full rounded-lg border border-border bg-surface px-3 text-[15px] outline-none focus:border-primary focus:ring-2 focus:ring-primary/20">
              <option value="">{accounts.data ? '— Chọn sale —' : 'Đang tải…'}</option>
              {accounts.data?.items.map((a) => (
                <option key={a.customerId} value={a.customerId}>{a.saleName ? `${a.saleName} · ` : ''}{a.customerName.replace(/^=+\s*/, '')}</option>
              ))}
            </select>
          </label>
          {missing(account !== '', 'Chọn sale phụ trách khách này.')}
          <p className="mt-1 text-[12px] text-text-muted">Vận đơn tạo dưới tài khoản tạo bill của sale; sale lập hồ sơ khách trong CMS sau.</p>
          {accounts.error && <ErrorBox message={accounts.error.message} />}

          <div className="mt-3 space-y-3">
            <div>
              <TextField label="Tên khách" required value={ten} onChange={setTen} autoComplete="off" placeholder="Tên người / công ty gửi hàng" className="h-11 text-[15px]" />
              {missing(ten.trim() !== '', 'Nhập tên khách.')}
            </div>
            <div>
              <TextField label="Số điện thoại" required value={phone} onChange={setPhone} inputMode="tel" autoComplete="off" className="h-11 text-[15px]" />
              {missing(phone.trim() !== '', 'Nhập số điện thoại khách.')}
            </div>
            <TextField label="Địa chỉ (nếu có)" value={address} onChange={setAddress} autoComplete="off" className="h-11 text-[15px]" />
          </div>
        </Card>
      )}
      {error && <ErrorBox message={error} />}

      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-border bg-surface p-3 [padding-bottom:max(0.75rem,env(safe-area-inset-bottom))]">
        <div className="mx-auto max-w-xl">
          <Btn type="button" className="h-12 w-full text-[15px]" disabled={busy} onClick={save}>
            {busy ? <Loader2 className="animate-spin" size={18} /> : <PackageOpen size={18} />}
            {busy ? 'Đang lưu…' : 'Bắt đầu chụp ảnh'}
          </Btn>
        </div>
      </div>
    </div>
  )
}
