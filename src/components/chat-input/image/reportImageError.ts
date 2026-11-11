import { Notice } from 'obsidian'

import { MentionableImage } from '../../../types/mentionable'
import { fileToMentionableImage } from '../../../utils/llm/image'

/**
 * Surfaces a failed image conversion to the user. Without this the rejection
 * is unhandled and the image silently disappears from the input.
 */
export function reportImageError(error: unknown): void {
  console.error('Failed to process image', error)
  const reason = error instanceof Error ? error.message : String(error)
  new Notice(`Failed to process image ${reason}`)
}

/**
 * Converts each file on its own so one unsupported image is reported and
 * skipped instead of discarding the rest of the batch.
 */
export async function convertImagesSafely(
  files: File[],
): Promise<MentionableImage[]> {
  const results = await Promise.allSettled(
    files.map((file) => fileToMentionableImage(file)),
  )

  const images: MentionableImage[] = []
  for (const result of results) {
    if (result.status === 'fulfilled') {
      images.push(result.value)
    } else {
      reportImageError(result.reason)
    }
  }
  return images
}
