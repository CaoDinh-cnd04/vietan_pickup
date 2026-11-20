'use client'
import { useState } from 'react'
import { ImageOff } from 'lucide-react'
import { cn } from '@/shared/lib/utils'

/** URL ảnh cân đo qua proxy (cookie đăng nhập đi kèm, API đọc kho ảnh Images:VietAnDataPath). */
export const scaleImageUrl = (apiPath: string) => `/api/proxy?path=${encodeURIComponent(apiPath)}`

/**
 * Ảnh cân đo kiện — legacy `<img src="/VietAnDATA/Ten_Hinh">` xoay 90° (ảnh chụp ngang ở bàn cân), ẩn khi tên có "_NoDim_".
 * Máy chưa có kho ảnh / file thiếu → ô "Chưa có ảnh" thay vì ảnh vỡ. Bấm ảnh để mở cỡ lớn ở tab mới.
 * `height` = chiều cao khung (px). Khi xoay, chiều RỘNG gốc của ảnh thành chiều cao hiển thị ⇒ đặt width ảnh = height khung.
 */
export default function ScaleImage({ apiPath, name, height, className, rotate = true }: {
  apiPath: string; name: string; height: number; className?: string; rotate?: boolean
}) {
  const [failed, setFailed] = useState(false)
  if (name.includes('_NoDim_')) return null
  const url = scaleImageUrl(apiPath)
  if (failed)
    return (
      <div style={{ height }} className={cn('flex flex-col items-center justify-center gap-1 bg-background text-text-muted text-[12px]', className)} title={name}>
        <ImageOff size={20} />
        Chưa có ảnh
      </div>
    )
  return (
    <a href={url} target="_blank" rel="noreferrer" title={`${name} — bấm để xem cỡ lớn`} style={{ height }}
      className={cn('flex items-center justify-center overflow-hidden bg-[#808080]', className)}>
      {/* eslint-disable-next-line @next/next/no-img-element -- ảnh động qua proxy có cookie, không dùng next/image */}
      <img src={url} alt={name} loading="lazy" onError={() => setFailed(true)}
        style={rotate ? { width: height, maxWidth: 'none', maxHeight: 'none' } : undefined}
        className={cn('object-contain', rotate ? 'rotate-90 shrink-0' : 'max-h-full max-w-full')} />
    </a>
  )
}
