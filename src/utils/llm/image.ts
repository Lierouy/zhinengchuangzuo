import { MentionableImage } from '../../types/mentionable'

const MAX_IMAGE_BYTES = 1024 * 512 // 体积阈值：不超过该值的图片无需压缩
const MAX_LONG_SIDE = 2048 // 长边上限：主流视觉模型的有效分辨率
const MAX_PIXELS = 2_000_000 // 像素预算：约束极端长宽比的总开销
const INITIAL_QUALITY = 0.85 // 首次编码质量
const MIN_QUALITY = 0.55 // 质量下限：再低文字/线条会糊
const MAX_ENCODE_ATTEMPTS = 5 // 单次压缩最多编码次数
const JPEG_MIME_TYPE = 'image/jpeg'
const PNG_MIME_TYPE = 'image/png'

/**
 * 两家 provider 都支持的格式；其余格式（含 gif）在添加时转码，避免请求被拒。
 * GIF 动图只在首帧有意义，多帧数据纯属浪费，因此不做特殊对待。
 */
const SUPPORTED_IMAGE_MIME_TYPES = new Set([
  JPEG_MIME_TYPE,
  PNG_MIME_TYPE,
  'image/webp',
])

/** `file.type` 可能为空（拖拽、部分系统），此时按扩展名推断格式。 */
const EXTENSION_MIME_TYPES: Record<string, string> = {
  jpg: JPEG_MIME_TYPE,
  jpeg: JPEG_MIME_TYPE,
  png: PNG_MIME_TYPE,
  webp: 'image/webp',
  gif: 'image/gif',
  svg: 'image/svg+xml',
  bmp: 'image/bmp',
  avif: 'image/avif',
  heic: 'image/heic',
  heif: 'image/heif',
  tif: 'image/tiff',
  tiff: 'image/tiff',
  ico: 'image/x-icon',
}

export function resolveImageMimeType(file: File): string {
  const type = file.type.toLowerCase()
  if (type === 'image/jpg') return JPEG_MIME_TYPE
  if (type) return type
  const extension = /\.([^./\\]+)$/.exec(file.name)?.[1]?.toLowerCase()
  return (
    (extension && EXTENSION_MIME_TYPES[extension]) || 'application/octet-stream'
  )
}

/** True for files the image pipeline should try to convert. */
export function isImageFile(file: File): boolean {
  return resolveImageMimeType(file).startsWith('image/')
}

/** Rewrites a data URL prefix so the declared format is what the provider sees. */
function withDataUrlMimeType(dataUrl: string, mimeType: string): string {
  if (dataUrl.startsWith(`data:${mimeType};`)) return dataUrl
  return dataUrl.replace(/^data:[^;,]*/, `data:${mimeType}`)
}

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
      throw new Error(
        `Cannot convert ${resolveImageMimeType(file)}, unsupported image format`,
      )
    }
  }
}

/**
 * 等比缩放绘制到 canvas；JPEG 没有 alpha 通道，先铺白底避免透明区域变黑。
 * `background` 为 null 时保留透明通道（用于 PNG 转码）。
 */
function renderScaled(
  source: CanvasImageSource,
  width: number,
  height: number,
  background: string | null = '#ffffff',
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
  if (background) {
    ctx.fillStyle = background
    ctx.fillRect(0, 0, width, height)
  }
  ctx.drawImage(source, 0, 0, width, height)
  return canvas
}

function encodeImage(
  canvas: HTMLCanvasElement,
  mimeType: string,
  quality?: number,
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) {
          resolve(blob)
        } else {
          reject(new Error('Failed to encode image'))
        }
      },
      mimeType,
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
    const blob = await encodeImage(canvas, JPEG_MIME_TYPE, quality)
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
 * 非白名单格式（GIF/SVG/AVIF/BMP 等）在保持原始尺寸的前提下转成无损 PNG，
 * 保留透明通道；PNG 超出体积阈值时直接交给压缩流程，不再单独试 JPEG。
 * Returns null when the PNG does not fit, so the caller falls back to compression.
 */
async function convertToPng(
  source: CanvasImageSource,
  width: number,
  height: number,
): Promise<Blob | null> {
  const png = await encodeImage(
    renderScaled(source, width, height, null),
    PNG_MIME_TYPE,
  )
  return png.size <= MAX_IMAGE_BYTES ? png : null
}

/**
 * 将用户选择的图片文件转为可发送给 LLM 的结构。
 *
 * - 白名单格式且体积/像素都在预算内：原样保留，不重新编码
 * - 非白名单格式且体积/像素正常：只转格式（PNG），不缩放
 * - 体积或像素超标，或转出的 PNG 超过阈值：等比缩放 + JPEG 压缩
 * - 浏览器无法解码的格式：抛错，调用方负责提示并阻止添加
 */
export async function fileToMentionableImage(
  file: File,
): Promise<MentionableImage> {
  const declaredMime = resolveImageMimeType(file)
  const decoded = await decodeImage(file)
  try {
    const target = fitToBudget(decoded.width, decoded.height)
    const withinBudget =
      file.size <= MAX_IMAGE_BYTES &&
      target.width === decoded.width &&
      target.height === decoded.height

    if (withinBudget && SUPPORTED_IMAGE_MIME_TYPES.has(declaredMime)) {
      const data = decoded.dataUrl ?? (await readFileAsDataURL(file))
      return {
        type: 'image',
        name: file.name,
        mimeType: declaredMime,
        // Providers read the format from the data URL prefix, which is derived
        // from `file.type` and may be missing for dragged files.
        data: withDataUrlMimeType(data, declaredMime),
      }
    }

    const converted = withinBudget
      ? await convertToPng(decoded.source, decoded.width, decoded.height)
      : null
    if (converted) {
      return {
        type: 'image',
        name: file.name,
        mimeType: PNG_MIME_TYPE,
        data: await readFileAsDataURL(converted),
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
