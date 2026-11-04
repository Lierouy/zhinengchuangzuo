import {
  ChatAssistantMessageGroup,
  ChatMessage,
  ChatUserMessage,
} from '../../types/chat'

export function groupAssistantMessages(
  messages: ChatMessage[],
): (ChatUserMessage | ChatAssistantMessageGroup)[] {
  return messages.reduce(
    (
      acc: (ChatUserMessage | ChatAssistantMessageGroup)[],
      message,
    ): (ChatUserMessage | ChatAssistantMessageGroup)[] => {
      if (message.role === 'user') {
        // Always push user messages directly
        acc.push(message)
      } else {
        // For assistant messages, check if we can add to an existing group
        const lastItem = acc[acc.length - 1]

        // Non-user messages are always assistant messages here, so only the
        // previous item's shape decides whether to extend the current group.
        if (Array.isArray(lastItem)) {
          lastItem.push(message)
        } else {
          // Otherwise, create a new group
          acc.push([message])
        }
      }
      return acc
    },
    [],
  )
}
