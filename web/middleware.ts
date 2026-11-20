import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

// Cookie đặt tên riêng (pk_*) để không đụng cookie của CRM khi chạy chung máy (cookie không tách theo cổng).
export function middleware(req: NextRequest) {
  const token = req.cookies.get('pk_access')?.value
  const { pathname } = req.nextUrl
  const isPublic = pathname.startsWith('/login') || pathname.startsWith('/api/auth')
  if (!token && !isPublic) return NextResponse.redirect(new URL('/login', req.url))
  // /login?expired=1: token trong cookie hết hạn (API trả 401) — cho vào trang đăng nhập, nếu không sẽ lặp vô hạn
  if (token && pathname === '/login' && !req.nextUrl.searchParams.has('expired')) return NextResponse.redirect(new URL('/', req.url))
  return NextResponse.next()
}

export const config = { matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'] }
