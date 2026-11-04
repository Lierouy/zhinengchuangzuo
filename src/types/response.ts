export type LLMResponseBase = {
  id: string
  created?: number
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

export type ResponseUsage = {
  prompt_tokens: number
  completion_tokens: number
  total_tokens: number
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
