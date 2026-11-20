'use client'
import useSWR, { type SWRConfiguration } from 'swr'
import { useState, useCallback } from 'react'
import { clientFetch } from '@/shared/lib/api'

/** Gộp params (bỏ giá trị rỗng/null) thành query string. */
export function qs(params: Record<string, string | number | boolean | null | undefined>): string {
  const sp = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null || v === '') continue
    sp.set(k, String(v))
  }
  const s = sp.toString()
  return s ? `?${s}` : ''
}

/** GET có cache SWR; `path` = null để tạm dừng. */
export function useApi<T>(path: string | null, options?: SWRConfiguration<T>) {
  const { data, error, isLoading, mutate } = useSWR<T>(path, (p: string) => clientFetch<T>(p), {
    revalidateOnFocus: false,
    keepPreviousData: true,
    ...options,
  })
  return { data, error: error as (Error & { status?: number }) | undefined, isLoading, reload: () => mutate() }
}

export interface Paged<T> {
  items: T[]
  page: number
  pageSize: number
  totalCount: number
  totalPages?: number
}

/** Gọi API ghi (POST/PUT/DELETE) với trạng thái busy + lỗi. */
export function useAction() {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const run = useCallback(async <T,>(method: 'POST' | 'PUT' | 'DELETE', path: string, body?: unknown): Promise<T | undefined> => {
    setBusy(true)
    setError(null)
    try {
      return await clientFetch<T>(path, {
        method,
        body: body === undefined ? undefined : JSON.stringify(body),
      })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Lỗi không xác định')
      return undefined
    } finally {
      setBusy(false)
    }
  }, [])
  return { run, busy, error, setError }
}
