'use client'
import { useState } from 'react'
import Link from 'next/link'
import { ErrorBox, PageHeader } from '@/shared/kit/Page'
import { DataTable, DateBox, Lightbox, Pager, SearchBox, SelectBox, Thumb } from '@/shared/kit/Admin'
import { useApi, qs, type Paged } from '@/shared/lib/hooks'
import { fmtDateTime, fmtNumber, todayInput } from '@/shared/lib/format'
import { cn } from '@/shared/lib/utils'
import { dimText, type RwRow } from './reweightShared'

const PAGE_SIZE = 50
const LECH = [{ value: 0, label: 'Tất cả' }, { value: 1, label: 'Lệch ≥ 0,5 kg' }] as const

/** Quản lý cân lại (Order_VietAn_Reweight): mỗi dòng 1 kiện — số kho đo lúc nhận so với số cân lại ở bước cuối, lệch cân tính cước. */
export default function ReweightListPage() {
  const [from, setFrom] = useState(todayInput(-29))
  const [to, setTo] = useState(todayInput())
  const [search, setSearch] = useState('')
  const [lech, setLech] = useState<0 | 1>(0)
  const [page, setPage] = useState(1)
  const [open, setOpen] = useState<RwRow | null>(null)
  const { data, error, isLoading } = useApi<Paged<RwRow>>(`/api/reweight${qs({ fromDate: from, toDate: to, search: search.trim(), lech, page, pageSize: PAGE_SIZE })}`)
  const pages = Math.max(1, Math.ceil((data?.totalCount ?? 0) / PAGE_SIZE))
  const reset = () => setPage(1)

  return (
    <div className="mx-auto max-w-7xl">
      <PageHeader title="Cân lại" subtitle="Kết quả bước cuối (Order_VietAn_Reweight) so với số kho đo lúc nhận." />
      <div className="mb-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-[1fr_auto_auto_auto]">
        <SearchBox value={search} onChange={(v) => { setSearch(v); reset() }} placeholder="Số bill hoặc mã kiện (6193393_1)" label="Tìm cân lại" />
        <DateBox label="Từ" value={from} onChange={(v) => { setFrom(v); reset() }} />
        <DateBox label="Đến" value={to} onChange={(v) => { setTo(v); reset() }} />
        <SelectBox label="Lọc" value={lech} onChange={(v) => { setLech(v); reset() }} options={LECH} />
      </div>
      {error && <ErrorBox message={error.message} />}

      <DataTable loading={isLoading} empty={data && data.items.length === 0 ? 'Không có kiện nào được cân lại trong khoảng này.' : null}
        head={<tr><th>Ảnh</th><th>Kiện</th><th>Khách</th><th>Kho đo</th><th>Cân lại</th><th className="text-right">Lệch (kg)</th><th>Người cân</th><th>Lúc</th></tr>}>
        {data?.items.map((r) => (
          <tr key={r.id}>
            <td>{r.hasPhoto ? <Thumb idHinh={r.idHinh} alt={`ảnh kiện ${r.orderNumber}_${r.kienSo}`} onOpen={() => setOpen(r)} /> : <span className="text-[12px] text-text-muted">—</span>}</td>
            <td className="whitespace-nowrap font-semibold">
              {r.maVanDonId ? <Link href={`/${r.maVanDonId}`} className="text-primary hover:underline">{r.orderNumber}_{r.kienSo}</Link> : `${r.orderNumber}_${r.kienSo}`}
            </td>
            <td className="max-w-[220px] truncate">{r.customerName ?? '—'}</td>
            <td className="whitespace-nowrap">{r.kho ? <>{dimText(r.kho)} · {fmtNumber(r.kho.trongLuong)} kg<br /><span className="text-text-muted">cước {fmtNumber(r.kho.chargeWeight)}</span></> : <span className="text-text-muted">—</span>}</td>
            <td className="whitespace-nowrap">{dimText(r.canLai)} · {fmtNumber(r.canLai.trongLuong)} kg<br /><span className="text-text-muted">cước {fmtNumber(r.canLai.chargeWeight)}</span></td>
            <td className={cn('whitespace-nowrap text-right font-semibold', r.lech == null ? 'text-text-muted' : Math.abs(r.lech) >= 0.5 ? (r.lech > 0 ? 'text-danger' : 'text-amber-700') : 'text-success')}>
              {r.lech == null ? '—' : `${r.lech > 0 ? '+' : ''}${fmtNumber(r.lech)}`}
            </td>
            <td className="whitespace-nowrap">{r.canLai.userName || <span className="text-text-muted">hệ cũ</span>}</td>
            <td className="whitespace-nowrap text-text-secondary">{fmtDateTime(r.canLai.at)}</td>
          </tr>
        ))}
      </DataTable>
      <Pager page={page} pages={pages} total={data?.totalCount} onPage={setPage} />

      {open && (
        <Lightbox idHinh={open.idHinh} title={`Kiện ${open.orderNumber}_${open.kienSo}`} onClose={() => setOpen(null)}
          footer={<><span>{open.customerName ?? '—'}</span><span>Cân lại: {dimText(open.canLai)} · {fmtNumber(open.canLai.trongLuong)} kg</span>{open.kho && <span>Kho đo: {dimText(open.kho)} · {fmtNumber(open.kho.trongLuong)} kg</span>}</>} />
      )}
    </div>
  )
}
