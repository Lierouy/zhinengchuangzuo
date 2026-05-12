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

import { BaseLLMProvider } from './base'
import {
  LLMAPIKeyInvalidException,
  LLMAPIKeyNotSetException,
} from './exception'
import { NoStainlessAnthropic } from './NoStainlessAnthropic'

export class AnthropicProvider extends BaseLLMProvider<
  Extract<LLMProvider, { type: 'anthropic-compatible' }>
> {
  private client: Anthropic
  private apiKey: string

  constructor(
    provider: Extract<LLMProvider, { type: 'anthropic-compatible' }>,
  ) {
    super(provider)

    this.client = new (
      provider.additionalSettings?.noStainless
        ? NoStainlessAnthropic
        : Anthropic
    )({
      apiKey: provider.apiKey ?? '',
      baseURL: provider.baseUrl
        ? provider.baseUrl.replace(/\/+$/, '')
        : undefined,
      dangerouslyAllowBrowser: true,
    })
    this.apiKey = provider.apiKey ?? ''
  }

  async generateResponse(
    model: ChatModel,
    request: LLMRequestNonStreaming,
    options?: LLMOptions,
  ): Promise<LLMResponseNonStreaming> {
    this.validateModelAndApiKey(model)
    const {
      systemContent,
      messages,
      maxTokens,
      rest,
      model: requestModel,
    } = this.prepareRequestConfig(request)

    try {
      const response = await this.client.messages.create(
        {
          model: requestModel,
          messages,
          system: systemContent,
          max_tokens: maxTokens,
          ...rest,
          stream: false,
        } as Anthropic.MessageCreateParamsNonStreaming,
        {
          signal: options?.signal,
        },
      )

      const messageId = response.id ?? crypto.randomUUID()
      const content = response.content
        .filter((block): block is Anthropic.TextBlock => block.type === 'text')
        .map((block) => block.text)
        .join('\n')

      const reasoning = AnthropicProvider.extractReasoning(
        response.content,
        this.provider.customReasoningField,
      )

      const usage = response.usage as unknown as Record<string, number>
      const promptTokens = AnthropicProvider.computePromptTokens(usage)

      return {
        id: messageId,
        choices: [
          {
            finish_reason: response.stop_reason ?? null,
            message: {
              content,
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
      this.handleAnthropicError(error)
    }
  }

  async streamResponse(
    model: ChatModel,
    request: LLMRequestStreaming,
    options?: LLMOptions,
  ): Promise<AsyncIterable<LLMResponseStreaming>> {
    this.validateModelAndApiKey(model)
    const {
      systemContent,
      messages,
      maxTokens,
      rest,
      model: requestModel,
    } = this.prepareRequestConfig(request)

    try {
      const stream = await this.client.messages.create(
        {
          model: requestModel,
          messages,
          system: systemContent,
          max_tokens: maxTokens,
          ...rest,
          stream: true,
        } as Anthropic.MessageCreateParamsStreaming,
        {
          signal: options?.signal,
        },
      )

      return AnthropicProvider.streamResponseGenerator(
        stream,
        requestModel,
        this.provider.customReasoningField,
      )
    } catch (error: unknown) {
      this.handleAnthropicError(error)
    }
  }

  private validateModelAndApiKey(model: ChatModel): void {
    if (model.providerType !== 'anthropic-compatible') {
      throw new Error('Model is not an Anthropic Compatible model')
    }
    if (!this.apiKey) {
      throw new LLMAPIKeyNotSetException(
        `Provider ${this.provider.id} API key is missing, please set it in settings menu`,
      )
    }
  }

  private prepareRequestConfig(request: LLMRequest) {
    const { systemContent, messages } = AnthropicProvider.parseMessages(
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
      maxTokens: max_tokens ?? request.max_tokens ?? 4096,
      rest,
      model: request.model,
    }
  }

  private handleAnthropicError(error: unknown): never {
    if (error instanceof Anthropic.APIError && error.status === 401) {
      throw new LLMAPIKeyInvalidException(
        `Provider ${this.provider.id} API key is invalid, Please update it in settings menu`,
        error as Error,
      )
    }
    throw error
  }

  private static async *streamResponseGenerator(
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
        inputTokens = AnthropicProvider.computePromptTokens(usage)

        yield {
          id: chunk.message.id || messageId,
          choices: [
            {
              finish_reason: null,
              delta: { role: 'assistant', content: '' },
            },
          ],
          created: Date.now(),
          model: model,
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
          model: model,
          object: 'chat.completion.chunk',
        }
      }

      if (
        chunk.type === 'content_block_delta' &&
        chunk.delta.type === reasoningField
      ) {
        const deltaAny = chunk.delta as unknown as Record<string, unknown>
        const reasoningText = String(
          deltaAny[reasoningField.replace('_delta', '')] ??
            deltaAny.thinking ??
            deltaAny.thought ??
            deltaAny.text ??
            '',
        )
        yield {
          id: messageId,
          choices: [
            {
              finish_reason: null,
              delta: { reasoning: reasoningText },
            },
          ],
          created: Date.now(),
          model: model,
          object: 'chat.completion.chunk',
        }
      }

      if (chunk.type === 'message_delta') {
        yield {
          id: messageId,
          choices: [
            {
              finish_reason: chunk.delta.stop_reason ?? null,
              delta: { content: null },
            },
          ],
          created: Date.now(),
          model: model,
          object: 'chat.completion.chunk',
          usage: {
            prompt_tokens: inputTokens,
            completion_tokens: chunk.usage.output_tokens,
            total_tokens: inputTokens + chunk.usage.output_tokens,
          },
        }
      }
    }
  }

  private static extractReasoning(
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
      .map((b) => {
        const rec = b as unknown as Record<string, unknown>
        return String(
          rec[reasoningField] ?? rec.text ?? rec.thought ?? rec.thinking ?? '',
        )
      })
      .join('\n')
  }

  private static computePromptTokens(usage: Record<string, number>): number {
    return (
      (usage.input_tokens ?? 0) +
      (usage.cache_creation_input_tokens ?? 0) +
      (usage.cache_read_input_tokens ?? 0)
    )
  }

  static parseMessages(messages: RequestMessage[]): {
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
          const parts: Anthropic.ContentBlockParam[] = msg.content.map(
            (part) => {
              if (part.type === 'text') {
                return { type: 'text', text: part.text }
              } else if (part.type === 'image_url') {
                const { mimeType, base64Data } = parseImageDataUrl(
                  part.image_url.url,
                )
                return {
                  type: 'image',
                  source: {
                    type: 'base64',
                    media_type: mimeType as
                      | 'image/jpeg'
                      | 'image/png'
                      | 'image/gif'
                      | 'image/webp',
                    data: base64Data,
                  },
                }
              }
              return { type: 'text', text: '' }
            },
          )
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
}
