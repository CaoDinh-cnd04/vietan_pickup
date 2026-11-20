'use client'
import { useState } from 'react'
import { Loader2, LogIn } from 'lucide-react'
import { Btn, TextField } from '@/shared/kit/Fields'
import { ErrorBox } from '@/shared/kit/Page'

export default function LoginPage() {
  const [userName, setUserName] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (busy) return
    setBusy(true)
    setError(null)
    try {
      const res = await fetch('/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ userName, password }) })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(res.status >= 500 ? 'Máy chủ gặp lỗi, thử lại sau.' : (data.error ?? 'Đăng nhập không thành công'))
      window.location.href = '/'
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Đăng nhập không thành công')
      setBusy(false)
    }
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-4 p-4">
      <h1 className="text-center text-[20px] font-semibold text-text-primary">Việt An Pickup</h1>
      <form onSubmit={submit} className="space-y-3 rounded-xl border border-border bg-surface p-4">
        <TextField label="Tên đăng nhập" value={userName} onChange={setUserName} autoComplete="username" autoCapitalize="none" />
        <TextField label="Mật khẩu" type="password" value={password} onChange={setPassword} autoComplete="current-password" />
        {error && <ErrorBox message={error} />}
        <Btn type="submit" className="h-12 w-full text-[15px]" disabled={busy || !userName || !password}>
          {busy ? <Loader2 className="animate-spin" size={18} /> : <LogIn size={18} />} Đăng nhập
        </Btn>
      </form>
    </main>
  )
}
