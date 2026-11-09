import { App } from 'obsidian'
import { useCallback, useEffect, useRef, useState } from 'react'

import { editorStateToPlainText } from '../components/chat-input/editor-state-to-plain-text'
import { MAX_NAME_LENGTH } from '../constants'
import { useApp } from '../contexts/app-context'
import { toChatMetadata } from '../database/chat/ChatManager'
import { ChatConversationMetadata } from '../database/chat/types'
import { ChatMessage, SerializedChatMessage } from '../types/chat'
import { Mentionable } from '../types/mentionable'
import { cleanupEditorState } from '../utils/chat/lexical'
import {
  deserializeMentionable,
  serializeMentionable,
} from '../utils/chat/mentionable'

import { createDebouncedSave } from './createDebouncedSave'
import { useChatManager } from './useJsonManagers'

type UseChatHistory = {
  /**
   * Debounced save. The returned promise resolves once the pending write
   * finishes (or immediately if a newer call superseded it), so callers can
   * await it and surface failures.
   */
  createOrUpdateConversation: (
    id: string,
    messages: ChatMessage[],
  ) => Promise<void>
  /** Immediate save, bypassing the debounce. Used when the view is closing. */
  saveNow: (id: string, messages: ChatMessage[]) => Promise<void>
  /**
   * Writes whatever the debounce is still holding. Must run before switching or
   * deleting a conversation: a newer save always supersedes the pending one, so
   * an unflushed write would be dropped without ever reaching the disk.
   */
  flushPendingSaves: () => Promise<void>
  deleteConversation: (id: string) => Promise<void>
  getChatMessagesById: (id: string) => Promise<ChatMessage[] | null>
  updateConversationTitle: (id: string, title: string) => Promise<void>
  chatList: ChatConversationMetadata[]
  /** Re-reads the conversation list from disk. */
  refreshChatList: () => Promise<void>
  /** Drops a save that is still waiting for its debounce window. */
  cancelPendingSaves: () => void
}

export function useChatHistory(): UseChatHistory {
  const app = useApp()
  const chatManager = useChatManager()
  const [chatList, setChatList] = useState<ChatConversationMetadata[]>([])
  /**
   * Conversations this view has seen on disk. A save whose target is missing
   * only creates a file for a conversation that was never stored; if it was
   * known before, it has been deleted (here, in another window or by the user)
   * and recreating it from memory would resurrect deleted data.
   */
  const knownConversationIds = useRef(new Set<string>())

  // Keeps the dropdown in sync without rescanning the chat directory: the
  // manager returns the conversation it just wrote, which is all we need.
  const upsertChatList = useCallback((chat: ChatConversationMetadata) => {
    setChatList((prev) =>
      [chat, ...prev.filter((item) => item.id !== chat.id)].sort(
        (a, b) => b.updatedAt - a.updatedAt,
      ),
    )
  }, [])

  const fetchChatList = useCallback(async () => {
    try {
      setChatList(await chatManager.listChats())
    } catch (error) {
      // Never leave an unhandled rejection behind; the previous list stays.
      console.error('Failed to load the conversation list', error)
    }
  }, [chatManager])

  useEffect(() => {
    void fetchChatList()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const saveConversation = useCallback(
    async (id: string, messages: ChatMessage[]): Promise<void> => {
      const serializedMessages = messages.map(serializeChatMessage)

      // Single read: the manager compares against what is on disk and only
      // writes when something actually changed.
      const updated = await chatManager.updateMessages(id, serializedMessages)
      if (updated) {
        knownConversationIds.current.add(id)
        upsertChatList(toChatMetadata(updated))
        return
      }

      if (knownConversationIds.current.has(id)) {
        // The file is gone: it was deleted while this view kept its copy in
        // memory. Writing it back would restore a conversation the user
        // removed, so drop the save instead.
        console.warn(
          `The conversation ${id} has not been saved, is no longer exists on disk`,
        )
        return
      }

      const firstUserMessage = messages.find((v) => v.role === 'user')
      const created = await chatManager.createChat({
        id,
        title: firstUserMessage?.content
          ? editorStateToPlainText(firstUserMessage.content).substring(
              0,
              MAX_NAME_LENGTH,
            )
          : 'New chat',
        messages: serializedMessages,
      })
      knownConversationIds.current.add(id)
      upsertChatList(toChatMetadata(created))
    },
    [chatManager, upsertChatList],
  )

  // Keep the debounced instance in a ref so it survives re-renders and can be
  // flushed on unmount. The save implementation is read through a ref so the
  // debounced instance never captures a stale closure.
  const saveConversationRef = useRef(saveConversation)
  saveConversationRef.current = saveConversation

  const [debouncedSave] = useState(() =>
    createDebouncedSave<ChatMessage>((id, messages) =>
      saveConversationRef.current(id, messages),
    ),
  )

  useEffect(() => {
    return () => {
      // Flush pending writes so nothing is lost when the view closes.
      void debouncedSave.flush()
    }
  }, [debouncedSave])

  const createOrUpdateConversation = useCallback(
    (id: string, messages: ChatMessage[]): Promise<void> =>
      debouncedSave.call(id, messages),
    [debouncedSave],
  )

  const saveNow = useCallback(
    (id: string, messages: ChatMessage[]): Promise<void> =>
      saveConversationRef.current(id, messages),
    [],
  )

  const cancelPendingSaves = useCallback(() => {
    debouncedSave.cancel()
  }, [debouncedSave])

  const flushPendingSaves = useCallback(
    (): Promise<void> => debouncedSave.flush(),
    [debouncedSave],
  )

  const deleteConversation = useCallback(
    async (id: string): Promise<void> => {
      if (!(await chatManager.deleteChat(id))) return
      knownConversationIds.current.delete(id)
      setChatList((prev) => prev.filter((chat) => chat.id !== id))
    },
    [chatManager],
  )

  const getChatMessagesById = useCallback(
    async (id: string): Promise<ChatMessage[] | null> => {
      const conversation = await chatManager.findById(id)
      if (!conversation) {
        return null
      }
      knownConversationIds.current.add(id)
      return conversation.messages.map((message) =>
        deserializeChatMessage(message, app),
      )
    },
    [chatManager, app],
  )

  const updateConversationTitle = useCallback(
    async (id: string, title: string): Promise<void> => {
      // Empty titles are rejected by `ChatManager.updateChat` itself (with the
      // same message), so the check is not repeated here.
      const updated = await chatManager.updateChat(id, { title })
      if (!updated) {
        throw new Error('Conversation not found')
      }
      upsertChatList(toChatMetadata(updated))
    },
    [chatManager, upsertChatList],
  )

  return {
    createOrUpdateConversation,
    saveNow,
    flushPendingSaves,
    deleteConversation,
    getChatMessagesById,
    updateConversationTitle,
    chatList,
    refreshChatList: fetchChatList,
    cancelPendingSaves,
  }
}

const serializeChatMessage = (message: ChatMessage): SerializedChatMessage => {
  switch (message.role) {
    case 'user': {
      return {
        role: 'user',
        // Editor state is kept in full in memory and only trimmed here, at save time.
        content: message.content ? cleanupEditorState(message.content) : null,
        promptContent: null, // compiled per request; persisting it would store file bodies and image data
        id: message.id,
        mentionables: message.mentionables.map(serializeMentionable),
      }
    }
    case 'assistant':
      return {
        role: 'assistant',
        content: message.content,
        reasoning: message.reasoning,
        id: message.id,
        metadata: message.metadata,
      }
  }
}

const deserializeChatMessage = (
  message: SerializedChatMessage,
  app: App,
): ChatMessage => {
  switch (message.role) {
    case 'user': {
      return {
        role: 'user',
        content: message.content,
        promptContent: message.promptContent,
        id: message.id,
        mentionables: message.mentionables
          .map((m) => deserializeMentionable(m, app))
          .filter((m): m is Mentionable => m !== null),
      }
    }
    case 'assistant': {
      return {
        role: 'assistant',
        content: message.content,
        reasoning: message.reasoning,
        id: message.id,
        metadata: message.metadata,
      }
    }
  }
}
