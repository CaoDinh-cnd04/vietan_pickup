'use client'
import { useEffect, useRef, useState } from 'react'
import { clientFetch } from '@/shared/lib/api'
import { qs } from '@/shared/lib/hooks'
import { Field } from '@/shared/kit/Fields'

interface Row { customerID: number; customerCode: string | null; customerName: string | null }

/** Chọn khách hàng bằng tìm kiếm nhanh (engine=fast). */
export default function CustomerPicker({
  label = 'Khách hàng',
  value,
  onChange,
  required,
}: {
  label?: string
  value: { id: number; name: string } | null
  onChange: (v: { id: number; name: string } | null) => void
  required?: boolean
}) {
  const [text, setText] = useState('')
  const [rows, setRows] = useState<Row[]>([])
  const [open, setOpen] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout>>()

  useEffect(() => {
    if (!open || text.trim().length < 2) {
      setRows([])
      return
    }
    clearTimeout(timer.current)
    timer.current = setTimeout(async () => {
      try {
        const res = await clientFetch<{ items: Row[] }>(`/api/customers${qs({ searchText: text.trim(), searchType: 1, page: 1, pageSize: 8, engine: 'fast' })}`)
        setRows(res.items ?? [])
      } catch {
        setRows([])
      }
    }, 300)
    return () => clearTimeout(timer.current)
  }, [text, open])

  return (
    <Field label={label} required={required}>
      <div className="relative">
        {value ? (
          <div className="flex items-center justify-between h-9 rounded-lg border border-border bg-background px-3 text-[13px]">
            <span className="truncate">{value.name} {value.id > 0 && <span className="text-text-muted">#{value.id}</span>}</span>
            <button type="button" className="text-primary text-[12px]" onClick={(e) => { e.preventDefault(); onChange(null) }}>Đổi</button>
          </div>
        ) : (
          <input
            value={text}
            onChange={(e) => { setText(e.target.value); setOpen(true) }}
            onFocus={() => setOpen(true)}
            placeholder="Gõ ≥ 2 ký tự tên khách…"
            className="w-full h-9 rounded-lg border border-border bg-surface px-3 text-[13px] focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
          />
        )}
        {!value && open && rows.length > 0 && (
          <ul className="absolute z-20 mt-1 w-full max-h-64 overflow-auto rounded-lg border border-border bg-surface shadow-card text-[13px]">
            {rows.map((r) => (
              <li key={r.customerID}>
                <button
                  type="button"
                  className="w-full text-left px-3 py-2 hover:bg-primary-light"
                  onClick={(e) => {
                    // nằm trong <label> (Field): chặn hành vi label chuyển click sang ô đầu tiên — sau re-render đó là nút "Đổi" ⇒ bỏ chọn ngay
                    e.preventDefault()
                    onChange({ id: r.customerID, name: r.customerName ?? '' }); setOpen(false); setText('')
                  }}
                >
                  {r.customerName} <span className="text-text-muted">· {r.customerCode}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Field>
  )
}
