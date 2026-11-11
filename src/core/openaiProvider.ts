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

import { LLMProviderClient } from './base'
import { LLMException } from './exception'
import { NoStainlessOpenAI } from './NoStainlessOpenAI'
import { OpenAIMessageAdapter } from './openaiMessageAdapter'

type OpenAICompatibleProvider = Extract<
  LLMProvider,
  { type: 'openai-compatible' }
>

export function createOpenAIProvider(
  provider: OpenAICompatibleProvider,
  resolvedApiKey?: string,
): LLMProviderClient {
  const adapter = new OpenAIMessageAdapter(provider.customReasoningField)
  const client = new (
    provider.additionalSettings?.noStainless ? NoStainlessOpenAI : OpenAI
  )({
    // `resolvedApiKey` is the SecretStorage lookup.
    apiKey: resolvedApiKey ?? '',
    baseURL: provider.baseUrl ? provider.baseUrl.replace(/\/+$/, '') : '',
    dangerouslyAllowBrowser: true,
  })

  const prepareRequest = <T extends LLMRequest>(
    model: ChatModel,
    request: T,
  ): T => {
    if (model.providerType !== 'openai-compatible') {
      throw new Error('Model is not an OpenAI compatible model')
    }
    if (!provider.baseUrl) {
      throw new LLMException(
        'base-url-not-set',
        `Provider ${provider.id} base URL is missing`,
      )
    }
    return { ...request, messages: formatMessages(request.messages) }
  }

  return {
    async generateResponse(
      model: ChatModel,
      request: LLMRequestNonStreaming,
      options?: LLMOptions,
    ): Promise<LLMResponseNonStreaming> {
      return adapter.generateResponse(
        client,
        prepareRequest(model, request),
        options,
      )
    },

    async streamResponse(
      model: ChatModel,
      request: LLMRequestStreaming,
      options?: LLMOptions,
    ): Promise<AsyncIterable<LLMResponseStreaming>> {
      return adapter.streamResponse(
        client,
        prepareRequest(model, request),
        options,
      )
    },
  }
}
