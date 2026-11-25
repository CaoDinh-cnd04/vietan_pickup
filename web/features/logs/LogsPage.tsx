'use client'
import { useState } from 'react'
import { ErrorBox, PageHeader } from '@/shared/kit/Page'
import { DataTable, DateBox, Pager, SearchBox, SelectBox } from '@/shared/kit/Admin'
import { useApi, qs, type Paged } from '@/shared/lib/hooks'
import { fmtDateTime, todayInput } from '@/shared/lib/format'

interface LogRow { id: number; at: string; action: string; actionLabel: string; userId: number; userName: string; code: string | null; content: string }
type LogPage = Paged<LogRow> & { actions: { value: string; label: string }[] }

const PAGE_SIZE = 50

/** Nhật ký thao tác: ai làm gì, lúc mấy giờ (ghi tạm vào TLogs, dòng có F10 = "PICKUP:…"). */
export default function LogsPage() {
  const [from, setFrom] = useState(todayInput(-29))
  const [to, setTo] = useState(todayInput())
  const [search, setSearch] = useState('')
  const [action, setAction] = useState('')
  const [page, setPage] = useState(1)
  const { data, error, isLoading } = useApi<LogPage>(`/api/logs${qs({ fromDate: from, toDate: to, search: search.trim(), action, page, pageSize: PAGE_SIZE })}`)
  const pages = Math.max(1, Math.ceil((data?.totalCount ?? 0) / PAGE_SIZE))
  const reset = () => setPage(1)

  return (
    <div className="mx-auto max-w-7xl">
      <PageHeader title="Nhật ký thao tác" subtitle="Ai làm gì, lúc mấy giờ — kho nhận kiện, ảnh, chốt nhận, cân lại." />
      <div className="mb-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-[1fr_auto_auto_auto]">
        <SearchBox value={search} onChange={(v) => { setSearch(v); reset() }} placeholder="Người, mã đơn/kiện, nội dung" label="Tìm nhật ký" />
        <DateBox label="Từ" value={from} onChange={(v) => { setFrom(v); reset() }} />
        <DateBox label="Đến" value={to} onChange={(v) => { setTo(v); reset() }} />
        <SelectBox label="Thao tác" value={action} onChange={(v) => { setAction(v); reset() }}
          options={[{ value: '', label: 'Tất cả' }, ...(data?.actions ?? [])]} />
      </div>
      {error && <ErrorBox message={error.message} />}

      <DataTable loading={isLoading} empty={data && data.items.length === 0 ? 'Chưa có thao tác nào trong khoảng này.' : null}
        head={<tr><th>Lúc</th><th>Người</th><th>Thao tác</th><th>Mã</th><th>Nội dung</th></tr>}>
        {data?.items.map((l) => (
          <tr key={l.id}>
            <td className="whitespace-nowrap text-text-secondary">{fmtDateTime(l.at)}</td>
            <td className="whitespace-nowrap font-medium">{l.userName || `#${l.userId}`}</td>
            <td className="whitespace-nowrap">{l.actionLabel}</td>
            <td className="whitespace-nowrap font-mono text-[12.5px]">{l.code ?? '—'}</td>
            <td className="min-w-[280px]">{l.content}</td>
          </tr>
        ))}
      </DataTable>
      <Pager page={page} pages={pages} total={data?.totalCount} onPage={setPage} />
    </div>
  )
}
