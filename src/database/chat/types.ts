import { SerializedChatMessage } from '../../types/chat'

export const CHAT_SCHEMA_VERSION = 1
export const CHAT_INDEX_SCHEMA_VERSION = 1

/**
 * One entry of the chat index card. Deliberately excludes `messages` so the
 * history dropdown never has to read conversation bodies.
 */
export type ChatIndexEntry = {
  id: string
  title: string
  createdAt: number
  updatedAt: number
}

export type ChatConversation = {
  id: string
  title: string
  messages: SerializedChatMessage[]
  createdAt: number
  updatedAt: number
  schemaVersion: number
}

export type ChatConversationMetadata = {
  id: string
  title: string
  createdAt: number
  updatedAt: number
  schemaVersion: number
}
