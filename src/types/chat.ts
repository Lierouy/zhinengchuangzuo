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
export type ChatAssistantMetadata = {
  usage?: ResponseUsage
  model?: string
  /** Names of the context prompts that were activated for this request. */
  activePrompts?: string[]
  /** Local clock, epoch milliseconds, taken when the answer was received. */
  createdAt?: number
}

export type ChatAssistantMessage = {
  role: 'assistant'
  content: string
  reasoning?: string
  id: string
  metadata?: ChatAssistantMetadata
}

export type ChatMessage = ChatUserMessage | ChatAssistantMessage

/** Consecutive assistant messages rendered together as one visual group. */
export type ChatAssistantMessageGroup = ChatAssistantMessage[]

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
  metadata?: ChatAssistantMetadata
}
export type SerializedChatMessage =
  SerializedChatUserMessage | SerializedChatAssistantMessage

/** Input of the "handle current file" stream: preset system prompt + file prompt. */
export type HandleStreamInput = {
  systemPrompt: string
  prompt: string
}
