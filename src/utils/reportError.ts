import { Notice } from 'obsidian'

/** Appended to messages whose technical details only exist in the console. */
export const CONSOLE_HINT = 'see the console for details'

/**
 * One failed action, one log line, one notice. Catch blocks used to spell this
 * pair out by hand, which is how the same failure ended up with three different
 * wordings and, in a few places, two different strings in one block.
 */
export function reportError(message: string, error: unknown): void {
  console.error(message, error)
  new Notice(message)
}
