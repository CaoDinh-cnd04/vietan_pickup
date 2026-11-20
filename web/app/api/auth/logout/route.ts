import { NextResponse } from 'next/server'

export async function POST() {
  const response = NextResponse.json({ ok: true })
  response.cookies.delete('pk_access')
  response.cookies.delete('pk_user')
  return response
}
