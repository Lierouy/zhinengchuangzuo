import { SerializedEditorState } from 'lexical'

import { Mentionable, SerializedMentionable } from './mentionable'
import { ContentPart } from './request'
import { ResponseUsage } from './response'

export type ChatUserMessage = {
  role: 'user'
  content: SerializedEditorState | null
  promptContent: string | ContentPart[] | null
  id: string
  mentionables: Mentionable[]
}
export type ChatAssistantMessage = {
  role: 'assistant'
  content: string
  reasoning?: string
  id: string
  metadata?: {
    usage?: ResponseUsage
    model?: string
  }
}

export type ChatMessage = ChatUserMessage | ChatAssistantMessage

export type AssistantToolMessageGroup = ChatAssistantMessage[]

export type SerializedChatUserMessage = {
  role: 'user'
  content: SerializedEditorState | null
  promptContent: string | ContentPart[] | null
  id: string
  mentionables: SerializedMentionable[]
}
export type SerializedChatAssistantMessage = {
  role: 'assistant'
  content: string
  reasoning?: string
  id: string
  metadata?: {
    usage?: ResponseUsage
    model?: string
  }
}
export type SerializedChatMessage =
  | SerializedChatUserMessage
  | SerializedChatAssistantMessage

export type ChatConversation = {
  schemaVersion: number
  id: string
  title: string
  createdAt: number
  updatedAt: number
  messages: SerializedChatMessage[]
}
export type ChatConversationMeta = {
  schemaVersion: number
  id: string
  title: string
  createdAt: number
  updatedAt: number
}
