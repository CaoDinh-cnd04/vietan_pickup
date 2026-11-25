'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, PackageOpen } from 'lucide-react'
import { Card, ErrorBox, PageHeader } from '@/shared/kit/Page'
import CustomerPicker from '@/shared/kit/CustomerPicker'
import { Btn } from '@/shared/kit/Fields'
import { useAction } from '@/shared/lib/hooks'

/**
 * Khách tự mang hàng tới kho (không có phiếu): chỉ chọn khách → tạo vận đơn nháp CRM + mã B<ID> → vào thẳng màn nhận kiện,
 * số kiện đếm theo thực nhận.
 */
export default function NewBookingPage() {
  const router = useRouter()
  const { run, busy, error } = useAction()
  const [customer, setCustomer] = useState<{ id: number; name: string } | null>(null)
  const [touched, setTouched] = useState(false)

  async function save() {
    setTouched(true)
    if (!customer || busy) return
    const res = await run<{ id: number; code: string }>('POST', '/api/pickup-bookings', { customerId: customer.id, taiKho: true })
    if (res) router.push(`/${res.id}?nhan=1`)
  }

  return (
    <div className="mx-auto max-w-xl pb-28">
      <PageHeader title="Khách mang hàng tới" subtitle="Chọn khách là vào chụp kiện ngay." />

      <Card className="mb-3">
        <CustomerPicker value={customer} onChange={setCustomer} required />
        {touched && !customer && <p className="mt-1 text-[12.5px] text-danger" role="alert">Chọn khách hàng.</p>}
      </Card>
      {error && <ErrorBox message={error} />}

      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-border bg-surface p-3 [padding-bottom:max(0.75rem,env(safe-area-inset-bottom))]">
        <div className="mx-auto max-w-xl">
          <Btn type="button" className="h-12 w-full text-[15px]" disabled={busy} onClick={save}>
            {busy ? <Loader2 className="animate-spin" size={18} /> : <PackageOpen size={18} />}
            {busy ? 'Đang lưu…' : 'Bắt đầu chụp kiện'}
          </Btn>
        </div>
      </div>
    </div>
  )
}
