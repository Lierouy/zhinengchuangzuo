import { ContentPart, RequestMessage } from '../../types/request'

/** Separator marking where two messages were merged into one. */
const MESSAGE_SEPARATOR = '\n\n---\n\n'

const toParts = (content: string | ContentPart[]): ContentPart[] =>
  typeof content === 'string' ? [{ type: 'text', text: content }] : content

/** A text part that carries no content, e.g. an empty body after stripping. */
const isBlankPart = (part: ContentPart): boolean =>
  part.type === 'text' && part.text.trim().length === 0

/** True when the content has nothing to send (no text and no images). */
const isEmptyContent = (content: string | ContentPart[]): boolean =>
  typeof content === 'string'
    ? content.trim().length === 0
    : content.every(isBlankPart)

/**
 * Concatenates message contents, handling both string and ContentPart[] formats.
 * Returns either a string or ContentPart[] depending on the message role.
 *
 * The boundary between the two messages is kept in both shapes: text-only
 * content joins the texts, while content with images gets an explicit separator
 * part so the messages do not silently run into each other.
 */
function concatenateMessageContent(
  prevContent: string | ContentPart[],
  currentContent: string | ContentPart[],
): string | ContentPart[] {
  const prevParts = toParts(prevContent).filter((part) => !isBlankPart(part))
  const currParts = toParts(currentContent).filter((part) => !isBlankPart(part))

  const merged = [...prevParts, ...currParts]
  if (merged.length === 0) return ''

  if (merged.every((part) => part.type === 'text')) {
    return merged.map((part) => part.text).join(MESSAGE_SEPARATOR)
  }

  // No boundary left to mark when one side contributed nothing.
  if (prevParts.length === 0 || currParts.length === 0) return merged

  return [...prevParts, { type: 'text', text: MESSAGE_SEPARATOR }, ...currParts]
}

/**
 * Formats the messages to ensure proper alternation between user and
 * assistant messages. It merges consecutive messages of the same role.
 * If a merge involves ContentPart[] and/or string representations,
 * both are first normalized into arrays, then merged so that all text parts are combined.
 *
 * This function helps maintain proper message structure for LLM APIs that require
 * alternating user and assistant messages. Consecutive messages of the same role
 * are merged to ensure compatibility with various LLM providers.
 *
 * All system messages are collected, concatenated, and placed at the beginning.
 */
export function formatMessages(messages: RequestMessage[]): RequestMessage[] {
  const formattedMessages: RequestMessage[] = []

  const systemMessages = messages.filter((msg) => msg.role === 'system')
  const nonSystemMessages = messages.filter((msg) => msg.role !== 'system')

  // Collect all system messages and concatenate them
  if (systemMessages.length > 0) {
    const combinedSystemContent = systemMessages
      .map((msg) => (typeof msg.content === 'string' ? msg.content : ''))
      .filter((content) => content.trim().length > 0)
      .join(MESSAGE_SEPARATOR)

    if (combinedSystemContent.trim().length > 0) {
      formattedMessages.push({
        role: 'system',
        content: combinedSystemContent,
      })
    }
  }

  // Merge consecutive messages of the same role.
  // Always push a shallow copy so the caller's message objects are never mutated.
  for (const currentMessage of nonSystemMessages) {
    const prevMessage = formattedMessages[formattedMessages.length - 1]

    if (prevMessage && prevMessage.role === currentMessage.role) {
      formattedMessages[formattedMessages.length - 1] = {
        ...prevMessage,
        content: concatenateMessageContent(
          prevMessage.content,
          currentMessage.content,
        ),
      } as RequestMessage
    } else if (!isEmptyContent(currentMessage.content)) {
      // A blank turn carries no information and some providers reject it, so
      // it is dropped instead of being sent (or merged into a later message).
      formattedMessages.push({ ...currentMessage })
    }
  }

  return formattedMessages
}
