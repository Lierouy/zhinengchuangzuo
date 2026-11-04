import { Notice } from 'obsidian'

/**
 * Surfaces a failed image conversion to the user. Without this the rejection
 * is unhandled and the image silently disappears from the input.
 */
export function reportImageError(error: unknown): void {
  console.error('Failed to process image', error)
  const reason = error instanceof Error ? error.message : String(error)
  new Notice(`Failed to process image: ${reason}`)
}
