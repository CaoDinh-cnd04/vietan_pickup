import { NextRequest, NextResponse } from 'next/server'

const API = process.env.PICKUP_API_URL ?? 'http://localhost:5090'

/** Chuyển tiếp tới API pickup, gắn Bearer từ cookie httpOnly. JSON/text giữ nguyên; nhị phân (ảnh kiện) chuyển nguyên byte. */
async function proxy(req: NextRequest): Promise<NextResponse> {
  try {
    const path = req.nextUrl.searchParams.get('path') ?? ''
    if (!path.startsWith('/api/')) return NextResponse.json({ message: 'Đường dẫn không hợp lệ' }, { status: 400 })
    const token = req.cookies.get('pk_access')?.value
    const reqType = req.headers.get('content-type') ?? ''
    const isMultipart = reqType.toLowerCase().startsWith('multipart/form-data')
    const headers: Record<string, string> = { 'Content-Type': isMultipart ? reqType : 'application/json' }
    if (token) headers['Authorization'] = `Bearer ${token}`

    const url = new URL(`${API}${path}`)
    req.nextUrl.searchParams.forEach((v, k) => { if (k !== 'path') url.searchParams.set(k, v) })
    const body = req.method !== 'GET' && req.method !== 'HEAD' ? (isMultipart ? await req.arrayBuffer() : await req.text()) : undefined

    const res = await fetch(url.toString(), { method: req.method, headers, body })
    if (res.status === 204 || res.status === 205 || res.status === 304) return new NextResponse(null, { status: res.status })
    const ct = res.headers.get('content-type') ?? ''
    if (!ct || ct.includes('json') || ct.startsWith('text/')) {
      return new NextResponse(await res.text(), { status: res.status, headers: { 'Content-Type': 'application/json' } })
    }
    return new NextResponse(await res.arrayBuffer(), { status: res.status, headers: { 'Content-Type': ct, 'Cache-Control': res.headers.get('cache-control') ?? 'no-store' } })
  } catch (err: unknown) {
    return NextResponse.json({ message: `Không kết nối được API: ${err instanceof Error ? err.message : String(err)}` }, { status: 502 })
  }
}

export const GET = proxy
export const POST = proxy
export const DELETE = proxy
