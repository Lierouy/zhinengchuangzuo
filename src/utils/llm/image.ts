import { MentionableImage } from '../../types/mentionable'

const MAX_IMAGE_BYTES = 1024 * 512 // 压缩目标：原始字节 ≤ 512 KB
const MAX_LONG_SIDE = 2048 // 长边上限：主流视觉模型的有效分辨率
const MAX_PIXELS = 2_000_000 // 像素预算：约束极端长宽比的总开销
const INITIAL_QUALITY = 0.85 // 首次编码质量
const MIN_QUALITY = 0.55 // 质量下限：再低文字/线条会糊
const MAX_ENCODE_ATTEMPTS = 5 // 单次压缩最多编码次数
const JPEG_MIME_TYPE = 'image/jpeg'

export function parseImageDataUrl(dataUrl: string): {
  mimeType: string
  base64Data: string
} {
  const matches = dataUrl.match(/^data:([^;]+);base64,(.+)/)
  if (!matches) {
    throw new Error('Invalid image data URL format')
  }
  const [, mimeType, base64Data] = matches
  return { mimeType, base64Data }
}

type DecodedImage = {
  source: CanvasImageSource
  width: number
  height: number
  /** 回退解码时顺带得到的 data URL，可复用以省一次读取 */
  dataUrl?: string
  release: () => void
}

/**
 * 把长宽等比缩放到长边 / 像素预算之内。已在预算内则原样返回。
 */
function fitToBudget(
  width: number,
  height: number,
): { width: number; height: number } {
  const scale = Math.min(
    1,
    MAX_LONG_SIDE / Math.max(width, height),
    Math.sqrt(MAX_PIXELS / (width * height)),
  )
  if (scale >= 1) {
    return { width, height }
  }
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  }
}

function readFileAsDataURL(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = () => reject(new Error('Failed to read file'))
    reader.readAsDataURL(file)
  })
}

function loadImageElement(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error('Failed to load image'))
    image.src = dataUrl
  })
}

async function decodeImage(file: File): Promise<DecodedImage> {
  try {
    const bitmap = await createImageBitmap(file)
    return {
      source: bitmap,
      width: bitmap.width,
      height: bitmap.height,
      release: () => bitmap.close(),
    }
  } catch {
    // createImageBitmap 不支持 SVG 等格式，回退到 <img> 解码
    const dataUrl = await readFileAsDataURL(file)
    try {
      const image = await loadImageElement(dataUrl)
      return {
        source: image,
        width: image.naturalWidth || image.width,
        height: image.naturalHeight || image.height,
        dataUrl,
        release: () => {},
      }
    } catch {
      throw new Error(`Unsupported image format: ${file.type || 'unknown'}`)
    }
  }
}

/**
 * 等比缩放绘制到 canvas；JPEG 没有 alpha 通道，先铺白底避免透明区域变黑。
 */
function renderScaled(
  source: CanvasImageSource,
  width: number,
  height: number,
): HTMLCanvasElement {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) {
    throw new Error('Failed to get canvas 2d context')
  }
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, width, height)
  ctx.drawImage(source, 0, 0, width, height)
  return canvas
}

function encodeJPEG(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) {
          resolve(blob)
        } else {
          reject(new Error('Failed to encode image'))
        }
      },
      JPEG_MIME_TYPE,
      quality,
    )
  })
}

/**
 * 压到目标体积以内。
 * 用上一轮的真实字节数估算下一档质量（质量与体积近似线性），
 * 质量触底后按 √(目标/实际) 等比缩小尺寸重试一次，避免盲目 0.1 递减。
 */
async function compressToFit(
  source: CanvasImageSource,
  width: number,
  height: number,
): Promise<Blob> {
  let canvas = renderScaled(source, width, height)
  let quality = INITIAL_QUALITY
  let rescaled = false
  let smallest: Blob | null = null

  for (let attempt = 0; attempt < MAX_ENCODE_ATTEMPTS; attempt++) {
    const blob = await encodeJPEG(canvas, quality)
    if (!smallest || blob.size < smallest.size) {
      smallest = blob
    }
    if (blob.size <= MAX_IMAGE_BYTES) {
      return blob
    }
    if (attempt === MAX_ENCODE_ATTEMPTS - 1) {
      break
    }

    const ratio = Math.sqrt(MAX_IMAGE_BYTES / blob.size)
    const nextQuality = quality * ratio
    if (nextQuality >= MIN_QUALITY) {
      quality = Math.min(nextQuality, 0.9)
      continue
    }
    if (rescaled) {
      break
    }

    const scale = ratio * 0.95
    canvas = renderScaled(
      source,
      Math.max(1, Math.round(width * scale)),
      Math.max(1, Math.round(height * scale)),
    )
    quality = INITIAL_QUALITY
    rescaled = true
  }

  // 无法压到目标体积时返回最小的一次结果，而不是退回未压缩的原图
  return smallest as Blob
}

/**
 * 将用户选择的图片文件转为可发送给 LLM 的结构。
 *
 * - 若文件本身已 ≤ 目标体积且像素在预算内：原样保留（无损、动图不丢帧）
 * - 否则等比缩放 + JPEG 压缩到目标体积以内
 */
export async function fileToMentionableImage(
  file: File,
): Promise<MentionableImage> {
  const decoded = await decodeImage(file)
  try {
    const target = fitToBudget(decoded.width, decoded.height)
    const fitsOriginal =
      file.size <= MAX_IMAGE_BYTES &&
      target.width === decoded.width &&
      target.height === decoded.height

    if (fitsOriginal) {
      const data = decoded.dataUrl ?? (await readFileAsDataURL(file))
      return {
        type: 'image',
        name: file.name,
        mimeType: parseImageDataUrl(data).mimeType,
        data,
      }
    }

    const blob = await compressToFit(
      decoded.source,
      target.width,
      target.height,
    )
    return {
      type: 'image',
      name: file.name,
      mimeType: JPEG_MIME_TYPE,
      data: await readFileAsDataURL(blob),
    }
  } finally {
    decoded.release()
  }
}
