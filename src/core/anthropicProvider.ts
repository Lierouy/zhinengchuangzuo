/**
 * Anthropic Compatible Provider implementation.
 */
import Anthropic from '@anthropic-ai/sdk'

import { ChatModel } from '../types/chat-model.types'
import { LLMProvider } from '../types/provider.types'
import {
  LLMOptions,
  LLMRequest,
  LLMRequestNonStreaming,
  LLMRequestStreaming,
  RequestMessage,
} from '../types/request'
import {
  LLMResponseNonStreaming,
  LLMResponseStreaming,
} from '../types/response'
import { parseImageDataUrl } from '../utils/llm/image'
import { formatMessages } from '../utils/llm/request'

import { LLMProviderClient } from './base'
import { LLMException } from './exception'
import { NoStainlessAnthropic } from './NoStainlessAnthropic'

type AnthropicCompatibleProvider = Extract<
  LLMProvider,
  { type: 'anthropic-compatible' }
>

export function createAnthropicProvider(
  provider: AnthropicCompatibleProvider,
  resolvedApiKey?: string,
): LLMProviderClient {
  // `resolvedApiKey` is the SecretStorage lookup.
  const apiKey = resolvedApiKey ?? ''
  const client = new (
    provider.additionalSettings?.noStainless ? NoStainlessAnthropic : Anthropic
  )({
    apiKey,
    baseURL: provider.baseUrl
      ? provider.baseUrl.replace(/\/+$/, '')
      : undefined,
    dangerouslyAllowBrowser: true,
  })

  const validateModelAndApiKey = (model: ChatModel): void => {
    if (model.providerType !== 'anthropic-compatible') {
      throw new Error('Model is not an Anthropic compatible model')
    }
    if (!apiKey) {
      throw new LLMException(
        'api-key-not-set',
        `Provider ${provider.id} API key is missing`,
      )
    }
  }

  const prepareRequestConfig = (request: LLMRequest) => {
    const { systemContent, messages } = parseMessages(
      formatMessages(request.messages),
    )
    const {
      model: _model,
      messages: _msgs,
      max_tokens,
      ...rest
    } = request as LLMRequestNonStreaming & Record<string, unknown>

    return {
      systemContent,
      messages,
      // Anthropic's own API requires max_tokens, but anthropic-compatible
      // providers often accept (and default) it. Only send it when configured
      // so the plugin never imposes its own output cap.
      maxTokens: max_tokens ?? request.max_tokens,
      rest,
      model: request.model,
    }
  }

  const handleAnthropicError = (error: unknown): never => {
    if (error instanceof Anthropic.APIError && error.status === 401) {
      throw new LLMException(
        'api-key-invalid',
        `Provider ${provider.id} API key is invalid`,
        error as Error,
      )
    }
    throw error
  }

  const generateResponse = async (
    model: ChatModel,
    request: LLMRequestNonStreaming,
    options?: LLMOptions,
  ): Promise<LLMResponseNonStreaming> => {
    validateModelAndApiKey(model)
    const {
      systemContent,
      messages,
      maxTokens,
      rest,
      model: requestModel,
    } = prepareRequestConfig(request)

    try {
      const response = await client.messages.create(
        {
          model: requestModel,
          messages,
          system: systemContent,
          ...(maxTokens === undefined ? {} : { max_tokens: maxTokens }),
          ...rest,
          stream: false,
        } as Anthropic.MessageCreateParamsNonStreaming,
        {
          signal: options?.signal,
        },
      )

      const messageId = response.id ?? crypto.randomUUID()
      const textContent = response.content
        .filter((block): block is Anthropic.TextBlock => block.type === 'text')
        .map((block) => block.text)
        .join('\n')

      const reasoning = extractReasoning(
        response.content,
        provider.customReasoningField,
      )

      const usage = response.usage as unknown as Record<string, number>
      const promptTokens = computePromptTokens(usage)

      return {
        id: messageId,
        choices: [
          {
            finish_reason: response.stop_reason ?? null,
            message: {
              content: textContent,
              reasoning,
              role: 'assistant',
            },
          },
        ],
        created: Date.now(),
        model: requestModel,
        object: 'chat.completion',
        usage: {
          prompt_tokens: promptTokens,
          completion_tokens: usage.output_tokens,
          total_tokens: promptTokens + usage.output_tokens,
        },
      }
    } catch (error: unknown) {
      return handleAnthropicError(error)
    }
  }

  const streamResponse = async (
    model: ChatModel,
    request: LLMRequestStreaming,
    options?: LLMOptions,
  ): Promise<AsyncIterable<LLMResponseStreaming>> => {
    validateModelAndApiKey(model)
    const {
      systemContent,
      messages,
      maxTokens,
      rest,
      model: requestModel,
    } = prepareRequestConfig(request)

    try {
      const stream = await client.messages.create(
        {
          model: requestModel,
          messages,
          system: systemContent,
          ...(maxTokens === undefined ? {} : { max_tokens: maxTokens }),
          ...rest,
          stream: true,
        } as Anthropic.MessageCreateParamsStreaming,
        {
          signal: options?.signal,
        },
      )

      return streamResponseGenerator(
        stream,
        requestModel,
        provider.customReasoningField,
      )
    } catch (error: unknown) {
      return handleAnthropicError(error)
    }
  }

  return { generateResponse, streamResponse }
}

async function* streamResponseGenerator(
  stream: AsyncIterable<Anthropic.MessageStreamEvent>,
  model: string,
  customReasoningField?: string,
): AsyncIterable<LLMResponseStreaming> {
  const messageId = crypto.randomUUID()
  let inputTokens = 0
  const reasoningField = customReasoningField
    ? customReasoningField
    : 'thinking_delta'

  for await (const chunk of stream) {
    if (chunk.type === 'message_start') {
      const usage = chunk.message.usage as unknown as Record<string, number>
      inputTokens = computePromptTokens(usage)

      yield {
        id: chunk.message.id || messageId,
        choices: [
          {
            finish_reason: null,
            delta: { role: 'assistant', content: '' },
          },
        ],
        created: Date.now(),
        model,
        object: 'chat.completion.chunk',
        usage: {
          prompt_tokens: inputTokens,
          completion_tokens: chunk.message.usage.output_tokens,
          total_tokens: inputTokens + chunk.message.usage.output_tokens,
        },
      }
    }

    if (
      chunk.type === 'content_block_delta' &&
      chunk.delta.type === 'text_delta'
    ) {
      yield {
        id: messageId,
        choices: [
          {
            finish_reason: null,
            delta: { content: chunk.delta.text },
          },
        ],
        created: Date.now(),
        model,
        object: 'chat.completion.chunk',
      }
    }

    if (
      chunk.type === 'content_block_delta' &&
      chunk.delta.type === reasoningField
    ) {
      const deltaAny = chunk.delta as unknown as Record<string, unknown>
      const rawReasoning =
        deltaAny[reasoningField.replace('_delta', '')] ??
        deltaAny.thinking ??
        deltaAny.thought ??
        deltaAny.text
      const reasoningText = typeof rawReasoning === 'string' ? rawReasoning : ''
      yield {
        id: messageId,
        choices: [
          {
            finish_reason: null,
            delta: { reasoning: reasoningText },
          },
        ],
        created: Date.now(),
        model,
        object: 'chat.completion.chunk',
      }
    }

    if (chunk.type === 'message_delta') {
      const outputTokens = chunk.usage?.output_tokens ?? 0
      yield {
        id: messageId,
        choices: [
          {
            finish_reason: chunk.delta.stop_reason ?? null,
            delta: { content: null },
          },
        ],
        created: Date.now(),
        model,
        object: 'chat.completion.chunk',
        usage: {
          prompt_tokens: inputTokens,
          completion_tokens: outputTokens,
          total_tokens: inputTokens + outputTokens,
        },
      }
    }
  }
}

function extractReasoning(
  content: Anthropic.ContentBlock[],
  customReasoningField?: string,
): string | undefined {
  const reasoningField = customReasoningField ?? 'thinking'
  const reasoningBlocks = content.filter(
    (block) =>
      (block as unknown as Record<string, unknown>).type === reasoningField,
  )
  if (reasoningBlocks.length === 0) return undefined
  return reasoningBlocks
    .map((block) => {
      const rec = block as unknown as Record<string, unknown>
      const raw = rec[reasoningField] ?? rec.text ?? rec.thought ?? rec.thinking
      return typeof raw === 'string' ? raw : ''
    })
    .join('\n')
}

function computePromptTokens(usage: Record<string, number>): number {
  return (
    (usage.input_tokens ?? 0) +
    (usage.cache_creation_input_tokens ?? 0) +
    (usage.cache_read_input_tokens ?? 0)
  )
}

function parseMessages(messages: RequestMessage[]): {
  systemContent: string | undefined
  messages: Anthropic.MessageParam[]
} {
  const anthropicMessages: Anthropic.MessageParam[] = []
  let systemContent = ''

  for (const msg of messages) {
    if (msg.role === 'system') {
      systemContent += msg.content + '\n'
      continue
    }

    if (msg.role === 'user') {
      if (Array.isArray(msg.content)) {
        const parts: Anthropic.ContentBlockParam[] = msg.content.map((part) => {
          if (part.type === 'text') {
            return { type: 'text', text: part.text }
          }
          if (part.type === 'image_url') {
            const { mimeType, base64Data } = parseImageDataUrl(
              part.image_url.url,
            )
            return {
              type: 'image',
              source: {
                type: 'base64',
                media_type: mimeType as
                  'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp',
                data: base64Data,
              },
            }
          }
          return { type: 'text', text: '' }
        })
        anthropicMessages.push({ role: 'user', content: parts })
      } else {
        anthropicMessages.push({ role: 'user', content: msg.content })
      }
    } else if (msg.role === 'assistant') {
      if (msg.content) {
        anthropicMessages.push({
          role: 'assistant',
          content: msg.content,
        })
      }
    }
  }

  return {
    systemContent: systemContent.trim() ? systemContent.trim() : undefined,
    messages: anthropicMessages,
  }
}
