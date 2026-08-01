import { ChatCompletionCreateParams } from 'openai/resources'

export type LLMRequestBase = {
  messages: RequestMessage[]
  model: string

  max_tokens?: number // Range: [1, context_length)
  temperature?: number // Range: [0, 2]
  top_p?: number // Range: (0, 1]
  frequency_penalty?: number // Range: [-2, 2]
  presence_penalty?: number // Range: [-2, 2]

  // Additional optional parameters
  logit_bias?: Record<number, number>

  // Only available for OpenAI
  prediction?: ChatCompletionCreateParams['prediction']
}

export type LLMRequestNonStreaming = LLMRequestBase & {
  stream?: false | null
}

export type LLMRequestStreaming = LLMRequestBase & {
  stream: true
}

export type LLMRequest = LLMRequestNonStreaming | LLMRequestStreaming

type TextContent = {
  type: 'text'
  text: string
}

type ImageContentPart = {
  type: 'image_url'
  image_url: {
    url: string // URL or base64 encoded image data
  }
}

export type ContentPart = TextContent | ImageContentPart

type RequestSystemMessage = {
  role: 'system'
  content: string
}
type RequestUserMessage = {
  role: 'user'
  content: string | ContentPart[]
}

type RequestAssistantMessage = {
  role: 'assistant'
  content: string
}
export type RequestMessage =
  | RequestSystemMessage
  | RequestUserMessage
  | RequestAssistantMessage

export type LLMOptions = {
  signal?: AbortSignal
}
