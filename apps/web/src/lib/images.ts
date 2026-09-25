/** Longest side we keep; enough for any screen, far smaller than camera originals. */
const MAX_SIDE = 2560
/** Files under this size and within MAX_SIDE are kept as they are. */
const KEEP_BELOW = 1.5 * 1024 * 1024

/**
 * Makes a pasted or dropped image reasonable to store and sync: big photos and screenshots are
 * scaled down and re-encoded as WebP. GIFs (animation) and SVGs are kept as they are.
 */
export async function prepareImage(file: Blob): Promise<{ blob: Blob; mime: string }> {
  const mime = file.type || 'image/png'
  if (mime === 'image/gif' || mime === 'image/svg+xml') return { blob: file, mime }
  let bitmap: ImageBitmap
  try {
    bitmap = await createImageBitmap(file)
  } catch {
    return { blob: file, mime }
  }
  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height))
  if (scale === 1 && file.size <= KEEP_BELOW) {
    bitmap.close()
    return { blob: file, mime }
  }
  const width = Math.round(bitmap.width * scale)
  const height = Math.round(bitmap.height * scale)
  const canvas = new OffscreenCanvas(width, height)
  const ctx = canvas.getContext('2d')
  if (!ctx) {
    bitmap.close()
    return { blob: file, mime }
  }
  ctx.drawImage(bitmap, 0, 0, width, height)
  bitmap.close()
  const blob = await canvas.convertToBlob({ type: 'image/webp', quality: 0.86 })
  // Some images compress worse as WebP; keep the smaller one if no resize was needed.
  return blob.size < file.size || scale < 1 ? { blob, mime: 'image/webp' } : { blob: file, mime }
}
