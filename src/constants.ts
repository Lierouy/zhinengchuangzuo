import { LLMProviderType } from './types/provider.types'

export const CHAT_VIEW_TYPE = 'zncz-chat-view'

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
