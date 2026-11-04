import { z } from 'zod'

import { chatModelSchema } from '../../types/chat-model.types'
import { llmProviderSchema } from '../../types/provider.types'

export const SETTINGS_SCHEMA_VERSION = 17

/**
 * Settings
 */
export const zhinengchuangzuoSettingsSchema = z.object({
  // Version
  version: z.literal(SETTINGS_SCHEMA_VERSION).catch(SETTINGS_SCHEMA_VERSION),

  providers: z.array(llmProviderSchema).catch([]),

  chatModels: z.array(chatModelSchema).catch([]),

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
  // Chat options — each field falls back independently so one invalid value
  // cannot discard the user's other preferences.
  chatOptions: z
    .object({
      includeCurrentFileContent: z.boolean().catch(true),
      chatMaxFileChars: z.number().optional().catch(undefined),
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
