'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { LogOut, QrCode } from 'lucide-react'

function readName(): string {
  try {
    const c = document.cookie.split('; ').find((x) => x.startsWith('pk_user='))
    return c ? (JSON.parse(decodeURIComponent(c.slice(8))).fullName ?? '') : ''
  } catch { return '' }
}

/** Khung gọn cho điện thoại: tên app + người đăng nhập + đăng xuất. Không menu — toàn bộ luồng nằm trong 3 trang. */
export default function AppLayout({ children }: { children: React.ReactNode }) {
  const [name, setName] = useState('')
  useEffect(() => setName(readName()), [])
  async function logout() {
    await fetch('/api/auth/logout', { method: 'POST' })
    window.location.href = '/login'
  }
  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-10 flex h-14 items-center justify-between border-b border-border bg-surface px-4">
        <Link href="/" className="flex items-center gap-2 text-[15px] font-semibold text-primary"><QrCode size={20} /> Book &amp; nhận pickup</Link>
        <div className="flex items-center gap-2 text-[13px] text-text-secondary">
          <span className="max-w-[40vw] truncate">{name}</span>
          <button type="button" onClick={logout} aria-label="Đăng xuất" className="grid h-11 w-11 place-items-center rounded-lg text-text-muted"><LogOut size={18} /></button>
        </div>
      </header>
      <main className="p-4">{children}</main>
    </div>
  )
}
