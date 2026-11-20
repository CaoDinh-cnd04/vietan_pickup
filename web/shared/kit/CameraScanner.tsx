'use client'
import { useEffect, useRef, useState } from 'react'
import { X } from 'lucide-react'

/** QR có thể chứa đường dẫn (vd https://…/pickup/123 hoặc ?code=B123): lấy mã ở cuối; còn lại giữ nguyên. */
export function codeFromScan(raw: string): string {
  const t = raw.trim()
  if (!/^https?:\/\//i.test(t)) return t
  try {
    const u = new URL(t)
    const q = u.searchParams.get('code') ?? u.searchParams.get('id') ?? u.searchParams.get('bill')
    if (q) return q.trim()
    return decodeURIComponent(u.pathname.split('/').filter(Boolean).pop() ?? t)
  } catch {
    return t
  }
}

/**
 * Quét QR / mã vạch bằng camera sau của điện thoại (cần HTTPS). Quét được 1 mã thì gọi onResult rồi tự đóng.
 * Dùng thư viện ZXing (chạy cả iPhone/Safari); tải lười để không nặng trang khi chưa bấm quét.
 */
export default function CameraScanner({ onResult, onClose }: { onResult: (code: string) => void; onClose: () => void }) {
  const video = useRef<HTMLVideoElement>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let stop: (() => void) | undefined
    let done = false
    ;(async () => {
      try {
        if (!navigator.mediaDevices?.getUserMedia) throw new Error('Trình duyệt không hỗ trợ camera (cần mở bằng HTTPS).')
        const { BrowserMultiFormatReader } = await import('@zxing/browser')
        const reader = new BrowserMultiFormatReader()
        const controls = await reader.decodeFromConstraints(
          { video: { facingMode: { ideal: 'environment' } }, audio: false },
          video.current!,
          (result) => {
            if (!result || done) return
            done = true
            controls.stop()
            onResult(codeFromScan(result.getText()))
          },
        )
        stop = () => controls.stop()
        if (done) controls.stop()
      } catch (e) {
        setError(e instanceof Error && e.name === 'NotAllowedError' ? 'Chưa cấp quyền camera cho trang này.' : e instanceof Error ? e.message : 'Không mở được camera.')
      }
    })()
    return () => stop?.()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div className="fixed inset-0 z-[100] flex flex-col bg-black" role="dialog" aria-modal="true" aria-label="Quét mã bằng camera">
      <div className="flex items-center justify-between px-4 py-3 text-white">
        <span className="text-[15px] font-medium">Đưa QR pickup hoặc mã vạch vào khung</span>
        <button type="button" onClick={onClose} aria-label="Đóng" className="grid h-11 w-11 place-items-center rounded-full bg-white/15"><X size={22} /></button>
      </div>
      <div className="relative flex-1">
        <video ref={video} playsInline muted autoPlay className="h-full w-full object-cover" />
        <div className="pointer-events-none absolute left-1/2 top-1/2 h-56 w-56 -translate-x-1/2 -translate-y-1/2 rounded-2xl border-2 border-white/80" />
      </div>
      {error && <p className="bg-danger px-4 py-3 text-[14px] text-white" role="alert">{error}</p>}
    </div>
  )
}
