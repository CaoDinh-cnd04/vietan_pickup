export async function clientFetch<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const url = `/api/proxy?path=${encodeURIComponent(path)}`
  const res = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers ?? {}),
    },
    credentials: 'include',
  })

  if (!res.ok) {
    const err = await res.json().catch(() => ({ message: res.statusText }))
    if (res.status === 401 && typeof window !== 'undefined') {
      window.location.href = '/login?expired=1'
    }
    // Backend trả ValidationProblem ({ errors: { field: [msg] } }), Conflict ({ error }) hoặc { message }
    const firstValidation = err.errors ? Object.values(err.errors as Record<string, string[]>)[0]?.[0] : undefined
    throw Object.assign(new Error(err.message ?? err.error ?? firstValidation ?? err.title ?? 'Lỗi không xác định'), {
      status: res.status,
      body: err,
    })
  }

  const text = await res.text()
  return text ? (JSON.parse(text) as T) : ({} as T)
}

/** POST multipart (upload file). KHÔNG đặt Content-Type để trình duyệt tự thêm boundary. */
export async function clientUpload<T>(path: string, form: FormData): Promise<T> {
  const res = await fetch(`/api/proxy?path=${encodeURIComponent(path)}`, { method: 'POST', body: form, credentials: 'include' })
  const text = await res.text()
  const json = text ? JSON.parse(text) : {}
  if (!res.ok) {
    if (res.status === 401 && typeof window !== 'undefined') window.location.href = '/login?expired=1'
    const firstValidation = json.errors ? Object.values(json.errors as Record<string, string[]>)[0]?.[0] : undefined
    throw Object.assign(new Error(json.message ?? json.error ?? firstValidation ?? json.title ?? 'Lỗi không xác định'), { status: res.status, body: json })
  }
  return json as T
}

/** POST JSON rồi tải file nhị phân về máy (tên file lấy từ Content-Disposition). */
export async function clientDownload(path: string, body: unknown, fallbackName: string): Promise<void> {
  const res = await fetch(`/api/proxy?path=${encodeURIComponent(path)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    credentials: 'include',
  })
  if (!res.ok) {
    if (res.status === 401 && typeof window !== 'undefined') window.location.href = '/login?expired=1'
    const err = await res.json().catch(() => ({ message: res.statusText }))
    throw new Error(err.message ?? err.error ?? err.title ?? 'Không xuất được file')
  }
  const cd = res.headers.get('content-disposition') ?? ''
  const m = /filename\*?=(?:UTF-8'')?"?([^";]+)"?/i.exec(cd)
  const name = m ? decodeURIComponent(m[1]) : fallbackName
  const url = URL.createObjectURL(await res.blob())
  const a = document.createElement('a')
  a.href = url
  a.download = name
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

/** GET rồi tải file nhị phân (Excel xuất danh sách). Không có dòng nào → API trả 404 (legacy: không xuất file). */
export async function clientDownloadGet(path: string, fallbackName: string): Promise<void> {
  const res = await fetch(`/api/proxy?path=${encodeURIComponent(path)}`, { credentials: 'include' })
  if (!res.ok) {
    if (res.status === 401 && typeof window !== 'undefined') window.location.href = '/login?expired=1'
    const err = await res.json().catch(() => ({ message: res.statusText }))
    throw new Error(err.message ?? err.error ?? err.title ?? 'Không xuất được file')
  }
  const cd = res.headers.get('content-disposition') ?? ''
  const m = /filename\*?=(?:UTF-8'')?"?([^";]+)"?/i.exec(cd)
  const name = m ? decodeURIComponent(m[1]) : fallbackName
  const url = URL.createObjectURL(await res.blob())
  const a = document.createElement('a')
  a.href = url
  a.download = name
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}
