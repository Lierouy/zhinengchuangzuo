export type LLMResponseBase = {
  id: string
  model: string
  usage?: ResponseUsage
}

export type LLMResponseNonStreaming = LLMResponseBase & {
  choices: NonStreamingChoice[]
  object: 'chat.completion'
}

export type LLMResponseStreaming = LLMResponseBase & {
  choices: StreamingChoice[]
  object: 'chat.completion.chunk'
}

/**
 * Only the two counts the plugin shows are kept. Providers return more detail
 * (`cached_tokens`, `reasoning_tokens`, `total_tokens`, timings), but nothing
 * here reads it, so it is dropped where the payload enters: see
 * `utils/llm/usage.ts`.
 */
export type ResponseUsage = {
  prompt_tokens: number
  completion_tokens: number
}

type NonStreamingChoice = {
  finish_reason: string | null // Depends on the model. Ex: 'stop' | 'length' | 'content_filter'
  message: {
    content: string | null
    reasoning?: string | null
    role: string
  }
}

type StreamingChoice = {
  finish_reason: string | null
  delta: {
    content?: string | null
    reasoning?: string | null
    role?: string
  }
}
