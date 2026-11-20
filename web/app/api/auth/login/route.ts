import { NextRequest, NextResponse } from 'next/server'

const API = process.env.PICKUP_API_URL ?? 'http://localhost:5090'

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}))
  let res: Response
  try {
    res = await fetch(`${API}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  } catch {
    return NextResponse.json({ error: 'Không kết nối được máy chủ.' }, { status: 502 })
  }
  const data = await res.json().catch(() => ({}))
  if (!res.ok) return NextResponse.json(data, { status: res.status >= 500 ? 502 : res.status })

  const opts = { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax' as const, path: '/', maxAge: 12 * 3600 }
  const response = NextResponse.json({ ok: true })
  response.cookies.set('pk_access', data.accessToken ?? '', opts)
  response.cookies.set('pk_user', JSON.stringify({ fullName: data.fullName ?? data.userName ?? '' }), { ...opts, httpOnly: false })
  return response
}
