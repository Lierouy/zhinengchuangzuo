import { ZhinengchuangzuoSettings } from '../settings/schema/setting.types'
import { ChatModel } from '../types/chat-model.types'
import { LLMProvider } from '../types/provider.types'

import { createAnthropicProvider } from './anthropicProvider'
import { LLMProviderClient } from './base'
import { LLMException } from './exception'
import { createOpenAIProvider } from './openaiProvider'

/** Turns a provider into the key its client should authenticate with. */
export type ApiKeyResolver = (provider: LLMProvider) => string

/*
 * OpenAI-compatible provider includes token usage statistics
 * in the final chunk of the stream (following OpenAI's behavior).
 */
function getProviderClient({
  providerId,
  settings,
  resolveApiKey,
}: {
  providerId: string
  settings: ZhinengchuangzuoSettings
  resolveApiKey?: ApiKeyResolver
}): LLMProviderClient {
  const provider = settings.providers.find((p) => p.id === providerId)
  if (!provider) {
    throw new Error(`Provider ${providerId} not found`)
  }

  switch (provider.type) {
    case 'openai-compatible':
      return createOpenAIProvider(provider, resolveApiKey?.(provider))
    case 'anthropic-compatible':
      return createAnthropicProvider(provider, resolveApiKey?.(provider))
  }
}

export function getChatModelClient({
  modelId,
  settings,
  resolveApiKey,
}: {
  modelId: string
  settings: ZhinengchuangzuoSettings
  resolveApiKey?: ApiKeyResolver
}): {
  providerClient: LLMProviderClient
  model: ChatModel
} {
  const chatModel = settings.chatModels.find((model) => model.model === modelId)
  if (!chatModel) {
    throw new LLMException('model-not-found', `Chat model ${modelId} not found`)
  }

  const providerClient = getProviderClient({
    providerId: chatModel.providerId,
    settings,
    resolveApiKey,
  })

  return {
    providerClient,
    model: chatModel,
  }
}
