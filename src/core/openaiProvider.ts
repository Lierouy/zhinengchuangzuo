import OpenAI from 'openai'

import { ChatModel } from '../types/chat-model.types'
import { LLMProvider } from '../types/provider.types'
import {
  LLMOptions,
  LLMRequest,
  LLMRequestNonStreaming,
  LLMRequestStreaming,
} from '../types/request'
import {
  LLMResponseNonStreaming,
  LLMResponseStreaming,
} from '../types/response'
import { formatMessages } from '../utils/llm/request'

import { BaseLLMProvider } from './base'
import { LLMBaseUrlNotSetException } from './exception'
import { NoStainlessOpenAI } from './NoStainlessOpenAI'
import { OpenAIMessageAdapter } from './openaiMessageAdapter'

export class OpenAIProvider extends BaseLLMProvider<
  Extract<LLMProvider, { type: 'openai-compatible' }>
> {
  private adapter: OpenAIMessageAdapter
  private client: OpenAI

  constructor(provider: Extract<LLMProvider, { type: 'openai-compatible' }>) {
    super(provider)
    this.adapter = new OpenAIMessageAdapter(provider.customReasoningField)
    this.client = new (
      provider.additionalSettings?.noStainless ? NoStainlessOpenAI : OpenAI
    )({
      apiKey: provider.apiKey ?? '',
      baseURL: provider.baseUrl ? provider.baseUrl?.replace(/\/+$/, '') : '',
      dangerouslyAllowBrowser: true,
    })
  }

  async generateResponse(
    model: ChatModel,
    request: LLMRequestNonStreaming,
    options?: LLMOptions,
  ): Promise<LLMResponseNonStreaming> {
    return this.adapter.generateResponse(
      this.client,
      this.prepareRequest(model, request),
      options,
    )
  }

  async streamResponse(
    model: ChatModel,
    request: LLMRequestStreaming,
    options?: LLMOptions,
  ): Promise<AsyncIterable<LLMResponseStreaming>> {
    return this.adapter.streamResponse(
      this.client,
      this.prepareRequest(model, request),
      options,
    )
  }

  private prepareRequest<T extends LLMRequest>(
    model: ChatModel,
    request: T,
  ): T {
    if (model.providerType !== 'openai-compatible') {
      throw new Error('Model is not an OpenAI Compatible model')
    }
    if (!this.provider.baseUrl) {
      throw new LLMBaseUrlNotSetException(
        `Provider ${this.provider.id} base URL is missing, please set it in settings menu`,
      )
    }
    return { ...request, messages: formatMessages(request.messages) }
  }
}
