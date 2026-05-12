import { ZhinengchuangzuoSettings } from '../settings/schema/setting.types'
import { ChatModel } from '../types/chat-model.types'
import { LLMProvider } from '../types/provider.types'

import { AnthropicProvider } from './anthropicProvider'
import { BaseLLMProvider } from './base'
import { LLMModelNotFoundException } from './exception'
import { GoogleProvider } from './googleProvider'
import { OpenAIProvider } from './openaiProvider'

/*
 * OpenAI-compatible provider includes token usage statistics
 * in the final chunk of the stream (following OpenAI's behavior).
 */

export function getProviderClient({
  providerId,
  settings,
  setSettings,
}: {
  providerId: string
  settings: ZhinengchuangzuoSettings
  setSettings?: (newSettings: ZhinengchuangzuoSettings) => void | Promise<void>
}): BaseLLMProvider<LLMProvider> {
  const provider = settings.providers.find((p) => p.id === providerId)
  if (!provider) {
    throw new Error(`Provider ${providerId} not found`)
  }

  const _onProviderUpdate = setSettings
    ? async (targetProviderId: string, update: Partial<LLMProvider>) => {
        const updatedProviders: LLMProvider[] = settings.providers.map(
          (item) =>
            item.id === targetProviderId
              ? ({ ...item, ...update } as LLMProvider)
              : item,
        )
        await setSettings({
          ...settings,
          providers: updatedProviders,
        })
      }
    : undefined

  switch (provider.type) {
    case 'openai-compatible': {
      return new OpenAIProvider(provider)
    }
    case 'anthropic-compatible': {
      return new AnthropicProvider(provider)
    }
    case 'google-compatible': {
      return new GoogleProvider(provider)
    }
  }
}

export function getChatModelClient({
  modelId,
  settings,
  setSettings,
}: {
  modelId: string
  settings: ZhinengchuangzuoSettings
  setSettings: (newSettings: ZhinengchuangzuoSettings) => void | Promise<void>
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
    setSettings,
  })

  return {
    providerClient,
    model: chatModel,
  }
}
