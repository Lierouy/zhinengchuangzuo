import { MentionableImage } from '../../types/mentionable'

const MAX_IMAGE_SIZE = 1024 * 512 // 512 KB
const MAX_DIMENSION = 2160 // 最大边长：预缩放时较长边的目标值
const SHORT_DIMENSION = 540 // 较短边长：短边超过此值才触发预缩放
const MIN_DIMENSION = 1080 // 最小边长：递归压缩的地板值，防止缩得过小

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

//  内部辅助函数
/**
 * 缩小尺寸一步：×0.9 但不跌破 MIN_DIMENSION
 * 如果当前尺寸已经 ≤ MIN_DIMENSION，返回原值（不会再放大）
 */
function shrinkDim(d: number): number {
  if (d <= MIN_DIMENSION) return d
  return Math.max(Math.round(d * 0.9), MIN_DIMENSION)
}

/**
 * 将图片以指定 quality 编码为 JPEG data URL，返回 { dataUrl, sizeInBytes }
 * 接受 HTMLImageElement 或 ImageBitmap 作为源
 */
function encodeJPEG(
  canvas: HTMLCanvasElement,
  ctx: CanvasRenderingContext2D,
  source: CanvasImageSource,
  width: number,
  height: number,
  quality: number,
): { dataUrl: string; sizeInBytes: number } {
  canvas.width = width
  canvas.height = height
  ctx.drawImage(source, 0, 0, width, height)
  const dataUrl = canvas.toDataURL('image/jpeg', quality)
  const { base64Data } = parseImageDataUrl(dataUrl)
  const sizeInBytes = Math.round((base64Data.length * 3) / 4)
  return { dataUrl, sizeInBytes }
}

//  递归压缩（纯 canvas 逻辑）
/**
 * 尝试压缩：先降 quality，quality 耗尽后缩尺寸再重试
 * 流程：
 * quality 0.9 → 0.8 → ... → 0.2
 * ↓ 仍超限
 * 缩尺寸 ×0.9，reset quality 0.9，再来一轮
 * ↓ 缩不动了
 * 认命返回当前结果
 */
function tryCompress(
  canvas: HTMLCanvasElement,
  ctx: CanvasRenderingContext2D,
  source: CanvasImageSource,
  width: number,
  height: number,
  maxSizeBytes: number,
  quality: number,
): string {
  const { dataUrl, sizeInBytes } = encodeJPEG(
    canvas,
    ctx,
    source,
    width,
    height,
    quality,
  )

  // 满足大小限制 → 成功
  if (sizeInBytes <= maxSizeBytes) return dataUrl

  // 质量还没到底 → 降一档重试
  if (quality > 0.2) {
    return tryCompress(
      canvas,
      ctx,
      source,
      width,
      height,
      maxSizeBytes,
      quality - 0.1,
    )
  }

  // 质量已到底 → 尝试缩小尺寸，然后重置 quality 再来一轮
  const newWidth = shrinkDim(width)
  const newHeight = shrinkDim(height)

  if (newWidth < width || newHeight < height) {
    return tryCompress(
      canvas,
      ctx,
      source,
      newWidth,
      newHeight,
      maxSizeBytes,
      0.9,
    )
  }

  // 缩无可缩 → 认命返回当前结果
  return dataUrl
}

/**
 * 以加载好的图片源 + 初始尺寸进行递归压缩（降 quality → 缩尺寸 → 循环）
 */
function compressImage(
  source: CanvasImageSource,
  width: number,
  height: number,
  maxSizeBytes: number,
): string {
  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Failed to get canvas 2d context')
  return tryCompress(canvas, ctx, source, width, height, maxSizeBytes, 0.9)
}

/**
 * 将 File 读成 base64 data URL（小文件快速路径）
 */
function readFileAsDataURL(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = (e) => resolve(e.target?.result as string)
    reader.onerror = () => reject(new Error('Failed to read file'))
    reader.readAsDataURL(file)
  })
}

//  公开 API
/**
 * 将用户选择的图片文件转为可发送给 LLM 的结构
 * 策略：
 * 1. 小文件（≤512KB）→ FileReader 转 base64，零开销
 * 2. 大文件 → createImageBitmap 直接解码（跳过 base64 中间层），
 *    JPEG 压缩到 512KB 以内；压缩后反而变大则退回原格式
 * @param file 原始图片文件
 * @returns MentionableImage
 */
export async function fileToMentionableImage(
  file: File,
): Promise<MentionableImage> {
  // ---- 小文件快速路径：FileReader 直接转 base64，无压缩 ----
  if (file.size <= MAX_IMAGE_SIZE) {
    const dataUrl = await readFileAsDataURL(file)
    const { mimeType } = parseImageDataUrl(dataUrl)
    return {
      type: 'image',
      name: file.name,
      mimeType,
      data: dataUrl,
    }
  }

  // ---- 大文件：createImageBitmap 直接解码，跳过 base64 中间层 ----
  // 避免 FileReader(base64) → parse → Image.decode 的双重编码开销
  let bitmap: ImageBitmap | null = null
  try {
    bitmap = await createImageBitmap(file)

    // 阶段 1：预缩放
    let width = bitmap.width
    let height = bitmap.height

    if (
      Math.min(width, height) > SHORT_DIMENSION &&
      (width > MAX_DIMENSION || height > MAX_DIMENSION)
    ) {
      if (width > height) {
        height = Math.round(height * (MAX_DIMENSION / width))
        width = MAX_DIMENSION
      } else {
        width = Math.round(width * (MAX_DIMENSION / height))
        height = MAX_DIMENSION
      }
    }

    // 阶段 2：递归压缩（ImageBitmap 可直接作为 CanvasImageSource）
    const compressedDataUrl = compressImage(
      bitmap,
      width,
      height,
      MAX_IMAGE_SIZE,
    )
    const { mimeType: compressedMimeType, base64Data: compressedBase64 } =
      parseImageDataUrl(compressedDataUrl)
    const compressedSize = Math.round((compressedBase64.length * 3) / 4)

    // 兜底：压缩后反而更大（如 PNG 文字截图）→ 退回原格式
    if (compressedSize > file.size) {
      const originalDataUrl = await readFileAsDataURL(file)
      const { mimeType: originalMimeType } = parseImageDataUrl(originalDataUrl)
      return {
        type: 'image',
        name: file.name,
        mimeType: originalMimeType,
        data: originalDataUrl,
      }
    }

    return {
      type: 'image',
      name: file.name,
      mimeType: compressedMimeType,
      data: compressedDataUrl,
    }
  } catch {
    // createImageBitmap 可能不支持某些格式（如 SVG），退回 FileReader 方案
    const dataUrl = await readFileAsDataURL(file)
    const { mimeType } = parseImageDataUrl(dataUrl)

    if (file.size <= MAX_IMAGE_SIZE) {
      return { type: 'image', name: file.name, mimeType, data: dataUrl }
    }

    // 仍需要压缩就走旧路径
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const image = new Image()
      image.onload = () => resolve(image)
      image.onerror = () => reject(new Error('Failed to load image'))
      image.src = dataUrl
    })

    let width = img.width
    let height = img.height
    if (
      Math.min(width, height) > SHORT_DIMENSION &&
      (width > MAX_DIMENSION || height > MAX_DIMENSION)
    ) {
      if (width > height) {
        height = Math.round(height * (MAX_DIMENSION / width))
        width = MAX_DIMENSION
      } else {
        width = Math.round(width * (MAX_DIMENSION / height))
        height = MAX_DIMENSION
      }
    }

    const compressedDataUrl = compressImage(img, width, height, MAX_IMAGE_SIZE)
    const { mimeType: compressedMimeType, base64Data: compressedBase64 } =
      parseImageDataUrl(compressedDataUrl)
    const compressedSize = Math.round((compressedBase64.length * 3) / 4)

    if (compressedSize > file.size) {
      return { type: 'image', name: file.name, mimeType, data: dataUrl }
    }

    return {
      type: 'image',
      name: file.name,
      mimeType: compressedMimeType,
      data: compressedDataUrl,
    }
  } finally {
    bitmap?.close()
  }
}
