import { ChatModel } from './types/chat-model.types'
import { LLMProvider, LLMProviderType } from './types/provider.types'

export const CHAT_VIEW_TYPE = 'zncz-chat-view'

// Default model ids - since there are no defaults, these won't be used
// User must configure their own provider and model
export const DEFAULT_CHAT_MODEL_ID = ''
export const RECOMMENDED_MODELS_FOR_CHAT: string[] = []

/*
 * When adding a new provider, make sure to update these files:
 * 1. src/types/provider.types.ts
 * 2. src/types/chat-model.types.ts
 * 3. src/constants.ts
 * 4. src/core/manager.ts
 * 5. src/core/(name)Provider.ts
 */
const COMMON_ADDITIONAL_SETTINGS = [
  {
    label: '无请求标头',
    key: 'noStainless',
    type: 'toggle',
    required: false,
    description: '如果部分供应商或中转接口发生兼容性错误，可以开启此选项。',
  },
] as const

export const PROVIDER_TYPES_INFO = {
  'openai-compatible': {
    label: 'OpenAI 兼容',
    additionalSettings: [...COMMON_ADDITIONAL_SETTINGS],
  },

  'anthropic-compatible': {
    label: 'Anthropic 兼容',
    additionalSettings: [...COMMON_ADDITIONAL_SETTINGS],
  },

  'google-compatible': {
    label: 'Google 兼容',
    additionalSettings: [...COMMON_ADDITIONAL_SETTINGS],
  },
} as const satisfies Record<
  LLMProviderType,
  {
    label: string
    additionalSettings: {
      label: string
      key: string
      type: 'text' | 'toggle'
      placeholder?: string
      description?: string
      required?: boolean
    }[]
  }
>
/*
 * Important:
 * 1. When adding new default provider, settings migration should be added
 * 2. If there's same provider id in user's settings, it's data should be overwritten by default provider
 */
export const DEFAULT_PROVIDERS: readonly LLMProvider[] = []
export const DEFAULT_CHAT_MODELS: readonly ChatModel[] = []
