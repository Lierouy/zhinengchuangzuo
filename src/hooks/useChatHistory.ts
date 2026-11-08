import debounce from 'lodash.debounce'
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
  deleteConversation: (id: string) => Promise<void>
  getChatMessagesById: (id: string) => Promise<ChatMessage[] | null>
  updateConversationTitle: (id: string, title: string) => Promise<void>
  chatList: ChatConversationMetadata[]
  /** Re-reads the conversation list from disk. */
  refreshChatList: () => Promise<void>
  /** Drops a save that is still waiting for its debounce window. */
  cancelPendingSaves: () => void
}

type DebouncedSave = {
  call: (id: string, messages: ChatMessage[]) => Promise<void>
  flush: () => void
  /** Drops a pending write, e.g. after the data it belongs to was deleted. */
  cancel: () => void
}

/**
 * Debounces conversation saves while still returning a promise per call.
 * A superseded call resolves without writing (the newer call owns the write),
 * so awaiting callers never hang and never see a stale error.
 */
function createDebouncedSave(
  save: (id: string, messages: ChatMessage[]) => Promise<void>,
): DebouncedSave {
  let pendingResolve: (() => void) | null = null
  let pendingReject: ((error: unknown) => void) | null = null

  const settlePending = () => {
    pendingResolve?.()
    pendingResolve = null
    pendingReject = null
  }

  const run = async (id: string, messages: ChatMessage[]) => {
    const resolve = pendingResolve
    const reject = pendingReject
    pendingResolve = null
    pendingReject = null
    try {
      await save(id, messages)
      resolve?.()
    } catch (error) {
      if (reject) reject(error)
      else throw error
    }
  }

  const debounced = debounce(run, 300, { maxWait: 1000 })

  return {
    call: (id, messages) => {
      // A newer call supersedes the pending one; resolve it so its awaiter
      // does not hang forever.
      settlePending()
      return new Promise<void>((resolve, reject) => {
        pendingResolve = resolve
        pendingReject = reject
        void debounced(id, messages)
      })
    },
    flush: () => {
      // `run` settles the pending promise itself once the write completes.
      void debounced.flush()
    },
    cancel: () => {
      settlePending()
      debounced.cancel()
    },
  }
}

export function useChatHistory(): UseChatHistory {
  const app = useApp()
  const chatManager = useChatManager()
  const [chatList, setChatList] = useState<ChatConversationMetadata[]>([])

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
        upsertChatList(toChatMetadata(updated))
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
    createDebouncedSave((id, messages) =>
      saveConversationRef.current(id, messages),
    ),
  )

  useEffect(() => {
    return () => {
      // Flush pending writes so nothing is lost when the view closes.
      debouncedSave.flush()
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

  const deleteConversation = useCallback(
    async (id: string): Promise<void> => {
      if (!(await chatManager.deleteChat(id))) return
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
      return conversation.messages.map((message) =>
        deserializeChatMessage(message, app),
      )
    },
    [chatManager, app],
  )

  const updateConversationTitle = useCallback(
    async (id: string, title: string): Promise<void> => {
      if (title.length === 0) {
        throw new Error('Chat title cannot be empty')
      }
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
