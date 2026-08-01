import { z } from 'zod'

import { DEFAULT_CHAT_MODELS, DEFAULT_PROVIDERS } from '../../constants'
import { chatModelSchema } from '../../types/chat-model.types'
import { llmProviderSchema } from '../../types/provider.types'

export const SETTINGS_SCHEMA_VERSION = 17

/**
 * Settings
 */

export const zhinengchuangzuoSettingsSchema = z.object({
  // Version
  version: z.literal(SETTINGS_SCHEMA_VERSION).catch(SETTINGS_SCHEMA_VERSION),

  providers: z.array(llmProviderSchema).catch([...DEFAULT_PROVIDERS]),

  chatModels: z.array(chatModelSchema).catch([...DEFAULT_CHAT_MODELS]),

  chatModelId: z.string().catch(''), // User must configure their own model

  // Context Management: currently selected prompt group id
  selectedPromptGroupId: z.string().catch(''),

  // Context Management: maximum number of activated prompts (null = default 50)
  promptActivationLimit: z.number().nullable().default(null).catch(null),

  // Handle prompt: selected template ID from preset prompts
  handlePromptId: z.string().catch(''),
  // Handle feature limits
  handleMaxLinks: z.number().optional(),
  handleMaxChars: z.number().optional(),
  // Chat options
  chatOptions: z
    .object({
      includeCurrentFileContent: z.boolean(),
      chatMaxFileChars: z.number().optional(),
    })
    .catch({
      includeCurrentFileContent: true,
    }),
})
export type ZhinengchuangzuoSettings = z.infer<
  typeof zhinengchuangzuoSettingsSchema
>

export type SettingMigration = {
  fromVersion: number
  toVersion: number
  migrate: (data: Record<string, unknown>) => Record<string, unknown>
}
