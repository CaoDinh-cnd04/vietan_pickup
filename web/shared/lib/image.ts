const MAX_SIDE = 1400

/**
 * Thu nhỏ ảnh điện thoại (3–8MB) xuống ≤1400px JPEG ~0,2–0,4MB: nhanh trên 4G, lọt giới hạn body của Vercel và nhẹ cho SQL Server
 * (ảnh lưu thẳng trong DB, ADR-051/053). Lỗi ⇒ gửi ảnh gốc.
 */
export async function shrinkImage(file: File): Promise<File> {
  try {
    const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' })
    const scale = Math.min(1, MAX_SIDE / Math.max(bmp.width, bmp.height))
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(bmp.width * scale)
    canvas.height = Math.round(bmp.height * scale)
    canvas.getContext('2d')!.drawImage(bmp, 0, 0, canvas.width, canvas.height)
    bmp.close()
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/jpeg', 0.75))
    if (!blob || blob.size >= file.size) return file
    return new File([blob], file.name.replace(/\.[^.]+$/, '') + '.jpg', { type: 'image/jpeg' })
  } catch {
    return file
  }
}
