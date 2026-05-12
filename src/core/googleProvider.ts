/**
 * Google Compatible Provider implementation.
 */
import {
  Content,
  GenerateContentResponse,
  GoogleGenAI,
  Part,
} from '@google/genai'

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
import { NoUserAgentGoogle } from './NoUserAgentGoogle'

export class GoogleProvider extends BaseLLMProvider<
  Extract<LLMProvider, { type: 'google-compatible' }>
> {
  private client: GoogleGenAI
  private apiKey: string

  constructor(provider: Extract<LLMProvider, { type: 'google-compatible' }>) {
    super(provider)

    this.client = new (
      provider.additionalSettings?.noStainless ? NoUserAgentGoogle : GoogleGenAI
    )({
      apiKey: provider.apiKey ?? '',
      httpOptions: provider.baseUrl
        ? { baseUrl: provider.baseUrl.replace(/\/+$/, '') }
        : undefined,
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
      contents,
      config,
      model: requestModel,
    } = this.prepareRequestConfig(request, options)

    try {
      const result = await this.client.models.generateContent({
        model: requestModel,
        contents,
        config,
      })

      const messageId = crypto.randomUUID()
      return GoogleProvider.parseNonStreamingResponse(
        result,
        requestModel,
        messageId,
        this.provider.customReasoningField,
      )
    } catch (error: unknown) {
      this.handleGoogleError(error)
    }
  }

  async streamResponse(
    model: ChatModel,
    request: LLMRequestStreaming,
    options?: LLMOptions,
  ): Promise<AsyncIterable<LLMResponseStreaming>> {
    this.validateModelAndApiKey(model)

    const {
      contents,
      config,
      model: requestModel,
    } = this.prepareRequestConfig(request, options)

    try {
      const stream = (await this.client.models.generateContentStream({
        model: requestModel,
        contents,
        config,
      })) as AsyncGenerator<GenerateContentResponse, void, unknown>

      const messageId = crypto.randomUUID()
      return this.streamResponseGenerator(
        stream,
        requestModel,
        messageId,
        this.provider.customReasoningField,
      )
    } catch (error: unknown) {
      this.handleGoogleError(error)
    }
  }

  private async *streamResponseGenerator(
    stream: AsyncGenerator<GenerateContentResponse, void, unknown>,
    model: string,
    messageId: string,
    customReasoningField?: string,
  ): AsyncIterable<LLMResponseStreaming> {
    for await (const chunk of stream) {
      yield GoogleProvider.parseStreamingResponseChunk(
        chunk,
        model,
        messageId,
        customReasoningField,
      )
    }
  }

  private validateModelAndApiKey(model: ChatModel): void {
    if (model.providerType !== 'google-compatible') {
      throw new Error('Model is not a Google Compatible model')
    }
    if (!this.apiKey) {
      throw new LLMAPIKeyNotSetException(
        `Provider ${this.provider.id} API key is missing, Please set it in settings menu`,
      )
    }
  }

  private prepareRequestConfig(request: LLMRequest, options?: LLMOptions) {
    const formattedMessages = formatMessages(request.messages)
    const systemMessages = formattedMessages.filter((m) => m.role === 'system')
    const systemInstruction: string | undefined =
      systemMessages.length > 0
        ? systemMessages.map((m) => m.content).join('\n')
        : undefined

    const {
      model: _m,
      messages: _msgs,
      max_tokens,
      temperature,
      top_p,
      presence_penalty,
      frequency_penalty,
      ...rest
    } = request as LLMRequestNonStreaming & Record<string, unknown>

    const contents = formattedMessages
      .filter((m) => m.role !== 'system')
      .map((message): Content | null =>
        GoogleProvider.parseRequestMessage(message),
      )
      .filter((m): m is Content => m !== null)

    const config: Record<string, unknown> = {
      maxOutputTokens: max_tokens ?? request.max_tokens,
      temperature: temperature ?? request.temperature,
      topP: top_p ?? request.top_p,
      presencePenalty: presence_penalty ?? request.presence_penalty,
      frequencyPenalty: frequency_penalty ?? request.frequency_penalty,
      systemInstruction: systemInstruction,
      abortSignal: options?.signal,
      ...rest,
    }

    return { contents, config, model: request.model }
  }

  private handleGoogleError(error: unknown): never {
    const isInvalidApiKey =
      (error as Error).message?.includes('API_KEY_INVALID') ||
      (error as Error).message?.includes('API key not valid')

    if (isInvalidApiKey) {
      throw new LLMAPIKeyInvalidException(
        `Provider ${this.provider.id} API key is invalid, Please update it in settings menu`,
        error as Error,
      )
    }
    throw error
  }

  static parseRequestMessage(message: RequestMessage): Content | null {
    switch (message.role) {
      case 'system':
        return null
      case 'user': {
        const contentParts: Part[] = Array.isArray(message.content)
          ? message.content.map((part) => {
              switch (part.type) {
                case 'text':
                  return { text: part.text }
                case 'image_url': {
                  const { mimeType, base64Data } = parseImageDataUrl(
                    part.image_url.url,
                  )
                  GoogleProvider.validateImageType(mimeType)
                  return {
                    inlineData: {
                      data: base64Data,
                      mimeType,
                    },
                  }
                }
              }
            })
          : [{ text: message.content }]

        return {
          role: 'user',
          parts: contentParts,
        }
      }
      case 'assistant': {
        if (!message.content) return null
        return {
          role: 'model',
          parts: [{ text: message.content }],
        }
      }
    }
  }

  static parseNonStreamingResponse(
    response: GenerateContentResponse,
    model: string,
    messageId: string,
    customReasoningField?: string,
  ): LLMResponseNonStreaming {
    const parts = response.candidates?.[0]?.content?.parts ?? []
    const reasoning = GoogleProvider.extractReasoning(
      parts,
      customReasoningField,
    )

    return {
      id: messageId,
      choices: [
        {
          finish_reason: response.candidates?.[0]?.finishReason ?? null,
          message: {
            content: response.text ?? '',
            reasoning,
            role: 'assistant',
          },
        },
      ],
      created: Date.now(),
      model: model,
      object: 'chat.completion',
      usage: response.usageMetadata
        ? {
            prompt_tokens: response.usageMetadata.promptTokenCount ?? 0,
            completion_tokens: response.usageMetadata.candidatesTokenCount ?? 0,
            total_tokens: response.usageMetadata.totalTokenCount ?? 0,
          }
        : undefined,
    }
  }

  private static extractReasoning(
    parts: unknown[],
    customReasoningField?: string,
  ): string | undefined {
    const reasoningField = customReasoningField ?? 'thought'
    type PartRecord = Record<string, unknown>
    const reasoningParts = parts.filter((p: unknown) => {
      const rec = p as PartRecord
      return (
        rec[reasoningField] === true || typeof rec[reasoningField] === 'string'
      )
    })
    if (reasoningParts.length === 0) {
      return undefined
    }
    return reasoningParts
      .map((p: unknown) => {
        const rec = p as PartRecord
        return typeof rec[reasoningField] === 'string'
          ? String(rec[reasoningField])
          : String(rec.text ?? '')
      })
      .join('')
  }

  static parseStreamingResponseChunk(
    chunk: GenerateContentResponse,
    model: string,
    messageId: string,
    customReasoningField?: string,
  ): LLMResponseStreaming {
    const parts = chunk.candidates?.[0]?.content?.parts ?? []
    const reasoning = GoogleProvider.extractReasoning(
      parts,
      customReasoningField,
    )

    return {
      id: messageId,
      choices: [
        {
          finish_reason: chunk.candidates?.[0]?.finishReason ?? null,
          delta: {
            content: chunk.text ?? null,
            reasoning,
          },
        },
      ],
      created: Date.now(),
      model: model,
      object: 'chat.completion.chunk',
      usage: chunk.usageMetadata
        ? {
            prompt_tokens: chunk.usageMetadata.promptTokenCount ?? 0,
            completion_tokens: chunk.usageMetadata.candidatesTokenCount ?? 0,
            total_tokens: chunk.usageMetadata.totalTokenCount ?? 0,
          }
        : undefined,
    }
  }

  private static validateImageType(mimeType: string) {
    const SUPPORTED_IMAGE_TYPES = [
      'image/png',
      'image/jpeg',
      'image/webp',
      'image/heic',
      'image/heif',
    ]
    if (!SUPPORTED_IMAGE_TYPES.includes(mimeType)) {
      throw new Error(
        `Google does not support image type ${mimeType}, Supported types: ${SUPPORTED_IMAGE_TYPES.join(
          ', ',
        )}`,
      )
    }
  }
}
