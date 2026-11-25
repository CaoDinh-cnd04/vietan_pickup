'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { ErrorBox, PageHeader } from '@/shared/kit/Page'
import { DataTable, DateBox, Pager, SearchBox, SelectBox } from '@/shared/kit/Admin'
import { useApi, qs, type Paged } from '@/shared/lib/hooks'
import { fmtDate, fmtNumber, todayInput } from '@/shared/lib/format'
import { BookingStatus, KhachName, type BookingRow } from './bookingShared'

const PAGE_SIZE = 50
const STATUS = [
  { value: -1, label: 'Tất cả' }, { value: 0, label: 'Chưa nhận' }, { value: 1, label: 'Đang nhận' },
  { value: 2, label: 'Kho đã nhận' }, { value: 3, label: 'Đã có bill' },
] as const

/** Quản lý vận đơn (MaVanDon nháp + đơn đã lập bill có lệnh pickup): mọi trạng thái, lọc theo ngày tạo / trạng thái / khách / mã. */
export default function WaybillsPage() {
  const router = useRouter()
  const [from, setFrom] = useState(todayInput(-29))
  const [to, setTo] = useState(todayInput())
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState<number>(-1)
  const [page, setPage] = useState(1)
  const { data, error, isLoading } = useApi<Paged<BookingRow>>(`/api/pickup-bookings${qs({ fromDate: from, toDate: to, status, search: search.trim(), page, pageSize: PAGE_SIZE })}`)
  const pages = Math.max(1, Math.ceil((data?.totalCount ?? 0) / PAGE_SIZE))
  const reset = () => setPage(1)

  return (
    <div className="mx-auto max-w-7xl">
      <PageHeader title="Vận đơn" subtitle="Vận đơn kho nhận — từ chờ nhận tới khi kinh doanh lập bill." />
      <div className="mb-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-[1fr_auto_auto_auto]">
        <SearchBox value={search} onChange={(v) => { setSearch(v); reset() }} placeholder="Tên khách, mã B…, số bill, tên hàng" label="Tìm vận đơn" />
        <DateBox label="Từ" value={from} onChange={(v) => { setFrom(v); reset() }} />
        <DateBox label="Đến" value={to} onChange={(v) => { setTo(v); reset() }} />
        <SelectBox label="Trạng thái" value={status} onChange={(v) => { setStatus(v); reset() }} options={STATUS} />
      </div>
      {error && <ErrorBox message={error.message} />}

      <DataTable loading={isLoading} empty={data && data.items.length === 0 ? 'Không có vận đơn nào.' : null}
        head={<tr><th>Mã</th><th>Số bill</th><th>Khách hàng</th><th>NV phụ trách</th><th>Trạng thái</th><th className="text-right">Kiện</th><th className="text-right">Kg</th><th>Hàng</th><th>Ngày</th><th>Người tạo</th></tr>}>
        {data?.items.map((b) => (
          <tr key={b.id} onClick={() => router.push(`/${b.id}`)} className="cursor-pointer hover:bg-primary-light/60">
            <td className="whitespace-nowrap font-semibold text-primary">{b.code}</td>
            <td className="whitespace-nowrap font-medium">{b.orderNumber ?? <span className="text-text-muted">—</span>}</td>
            <td className="max-w-[260px] truncate"><KhachName b={b} fallback="—" /></td>
            <td className="whitespace-nowrap">{b.saleName || '—'}</td>
            <td><BookingStatus value={b.trangThai} nhan={b.soKienNhan} khai={b.soKienBook} /></td>
            <td className="whitespace-nowrap text-right">{b.soKienNhan}{b.soKienBook ? `/${b.soKienBook}` : ''}</td>
            <td className="text-right">{b.kg ? fmtNumber(b.kg) : '—'}</td>
            <td className="max-w-[180px] truncate">{b.tenHang ?? '—'}</td>
            <td className="whitespace-nowrap text-text-secondary">{fmtDate(b.createDate)}</td>
            <td className="whitespace-nowrap">{b.staffName || '—'}</td>
          </tr>
        ))}
      </DataTable>
      <Pager page={page} pages={pages} total={data?.totalCount} onPage={setPage} />
    </div>
  )
}
