'use client'
import { Suspense, useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname, useSearchParams } from 'next/navigation'
import { LogOut, User } from 'lucide-react'
import { cn } from '@/shared/lib/utils'

function readName(): string {
  try {
    const c = document.cookie.split('; ').find((x) => x.startsWith('pk_user='))
    return c ? (JSON.parse(decodeURIComponent(c.slice(8))).fullName ?? '') : ''
  } catch { return '' }
}

/** Menu của app — 3 lối vào. `/[id]` (phiếu) thuộc "Phiếu pickup". */
const NAV = [
  { key: 'list', href: '/', label: 'Phiếu pickup' },
  { key: 'book', href: '/new', label: 'Book lấy hàng' },
  { key: 'kho', href: '/new?taiKho=1', label: 'Nhận tại kho' },
] as const

function MainNav() {
  const pathname = usePathname()
  const taiKho = useSearchParams().get('taiKho') === '1'
  const current = pathname === '/new' ? (taiKho ? 'kho' : 'book') : 'list'
  return (
    <ul className="flex min-w-0 items-center gap-px overflow-x-auto">
      {NAV.map((n) => (
        <li key={n.key}>
          <Link href={n.href} aria-current={current === n.key ? 'page' : undefined}
            className={cn('inline-flex h-11 items-center whitespace-nowrap rounded-lg px-3 text-[13px] font-semibold md:h-[30px]',
              current === n.key ? 'bg-primary text-white' : 'text-nav-muted hover:bg-white/[0.08] hover:text-white')}>
            {n.label}
          </Link>
        </li>
      ))}
    </ul>
  )
}

/** Khung giống CMS: dải tài khoản (đen) + thanh menu (đen than), nội dung phủ phần còn lại. */
export default function AppLayout({ children }: { children: React.ReactNode }) {
  const [name, setName] = useState('')
  useEffect(() => setName(readName()), [])
  async function logout() {
    await fetch('/api/auth/logout', { method: 'POST' })
    window.location.href = '/login'
  }
  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-30 font-nav print:hidden">
        <div className="flex h-7 items-center gap-3 bg-utility px-4 text-[11.5px] font-medium text-utility-muted md:h-6 md:px-5" role="region" aria-label="Tài khoản">
          <span>Kho nhận hàng</span>
          <div className="ml-auto flex items-center gap-3">
            <span className="inline-flex min-w-0 items-center gap-1.5"><User size={13} aria-hidden /><strong className="max-w-[40vw] truncate font-semibold text-white">{name || 'Tài khoản'}</strong></span>
            <span className="h-3 w-px bg-utility-muted/35" aria-hidden />
            <button type="button" onClick={logout} className="inline-flex items-center gap-1.5 hover:text-white"><LogOut size={13} aria-hidden />Đăng xuất</button>
          </div>
        </div>
        <nav aria-label="Menu" className="flex h-12 items-center gap-0.5 bg-nav px-2 md:h-10 md:px-5">
          <Link href="/" className="mr-2 flex shrink-0 items-center gap-2 text-[15px] font-bold text-white md:mr-3">
            <img src="/logo.webp" alt="" className="h-[26px] w-[26px] rounded-full bg-white" />
            <span className="hidden sm:inline">Việt An</span>
            <small className="rounded border border-nav-muted px-1.5 py-px text-[11px] font-semibold text-nav-muted">Pickup</small>
          </Link>
          <Suspense><MainNav /></Suspense>
        </nav>
      </header>
      <main className="p-4 md:p-5">{children}</main>
    </div>
  )
}
