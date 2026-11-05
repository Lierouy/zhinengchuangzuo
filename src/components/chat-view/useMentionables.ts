import { Notice } from 'obsidian'
import { useCallback } from 'react'

import { ChatMessage, ChatUserMessage } from '../../types/chat'
import { MentionableBlock, MentionableBlockData } from '../../types/mentionable'
import {
  getMentionableKey,
  serializeMentionable,
} from '../../utils/chat/mentionable'
import { MAX_BLOCK_COUNT } from '../chat-input/ChatUserInput'

type UseMentionablesParams = {
  chatMessages: ChatMessage[]
  inputMessage: ChatUserMessage
  focusedMessageId: string | null
  setInputMessage: React.Dispatch<React.SetStateAction<ChatUserMessage>>
  setChatMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>>
  highlightMentionable: (key: string | null) => void
}

export type UseMentionables = {
  /** Adds an editor selection as a quoted excerpt to the focused message. */
  addSelectionToChat: (selectedBlock: MentionableBlockData) => void
}

function countBlocks(message: ChatUserMessage): number {
  return message.mentionables.filter((m) => m.type === 'block').length
}

/**
 * Adds a selected text block to whichever message is focused: the input box,
 * or a user message in the history. Duplicates and the excerpt limit are
 * enforced here so every entry point behaves the same.
 */
export function useMentionables({
  chatMessages,
  inputMessage,
  focusedMessageId,
  setInputMessage,
  setChatMessages,
  highlightMentionable,
}: UseMentionablesParams): UseMentionables {
  const addSelectionToChat = useCallback(
    (selectedBlock: MentionableBlockData) => {
      const mentionable: Omit<MentionableBlock, 'id'> = {
        type: 'block',
        ...selectedBlock,
      }
      const mentionableKey = getMentionableKey(
        serializeMentionable(mentionable),
      )

      const focusIsInput = focusedMessageId === inputMessage.id
      const focusedHistoryMessage =
        !focusIsInput && focusedMessageId
          ? (chatMessages.find(
              (message) =>
                message.id === focusedMessageId && message.role === 'user',
            ) as ChatUserMessage | undefined)
          : undefined

      const existsInInput =
        focusIsInput &&
        inputMessage.mentionables.some(
          (m) => getMentionableKey(serializeMentionable(m)) === mentionableKey,
        )
      const existsInHistory =
        !focusIsInput &&
        !!focusedHistoryMessage?.mentionables.some(
          (m) => getMentionableKey(serializeMentionable(m)) === mentionableKey,
        )

      if (existsInInput || existsInHistory) return

      const blockCount = focusIsInput
        ? countBlocks(inputMessage)
        : focusedHistoryMessage
          ? countBlocks(focusedHistoryMessage)
          : 0
      if (blockCount >= MAX_BLOCK_COUNT) {
        new Notice(`Up to ${MAX_BLOCK_COUNT} excerpts are allowed to be added`)
        return
      }

      if (focusIsInput) {
        setInputMessage((prev) => ({
          ...prev,
          mentionables: [...prev.mentionables, mentionable],
        }))
      } else {
        setChatMessages((prev) =>
          prev.map((message) =>
            message.id === focusedMessageId && message.role === 'user'
              ? {
                  ...message,
                  mentionables: [...message.mentionables, mentionable],
                }
              : message,
          ),
        )
      }

      highlightMentionable(mentionableKey)
    },
    [
      chatMessages,
      focusedMessageId,
      highlightMentionable,
      inputMessage,
      setChatMessages,
      setInputMessage,
    ],
  )

  return { addSelectionToChat }
}
