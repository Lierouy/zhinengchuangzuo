import { ZhinengchuangzuoSettings } from '../settings/schema/setting.types'
import { ChatModel } from '../types/chat-model.types'
import { LLMProvider } from '../types/provider.types'

import { AnthropicProvider } from './anthropicProvider'
import { BaseLLMProvider } from './base'
import { LLMModelNotFoundException } from './exception'
import { OpenAIProvider } from './openaiProvider'

/*
 * OpenAI-compatible provider includes token usage statistics
 * in the final chunk of the stream (following OpenAI's behavior).
 */
function getProviderClient({
  providerId,
  settings,
}: {
  providerId: string
  settings: ZhinengchuangzuoSettings
}): BaseLLMProvider<LLMProvider> {
  const provider = settings.providers.find((p) => p.id === providerId)
  if (!provider) {
    throw new Error(`Provider ${providerId} not found`)
  }

  switch (provider.type) {
    case 'openai-compatible': {
      return new OpenAIProvider(provider)
    }
    case 'anthropic-compatible': {
      return new AnthropicProvider(provider)
    }
  }
}

export function getChatModelClient({
  modelId,
  settings,
}: {
  modelId: string
  settings: ZhinengchuangzuoSettings
}): {
  providerClient: BaseLLMProvider<LLMProvider>
  model: ChatModel
} {
  const chatModel = settings.chatModels.find((model) => model.model === modelId)
  if (!chatModel) {
    throw new LLMModelNotFoundException(`Chat model ${modelId} not found`)
  }

  const providerClient = getProviderClient({
    providerId: chatModel.providerId,
    settings,
  })

  return {
    providerClient,
    model: chatModel,
  }
}
