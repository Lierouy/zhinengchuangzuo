import { z } from 'zod'

export const baseLlmProviderSchema = z.object({
  id: z.string().min(1, 'id is required'),
  baseUrl: z.string().optional(),
  apiKey: z.string().optional(),
  customReasoningField: z.string().optional(),
  additionalSettings: z.record(z.string(), z.string()).optional(),
})

/*
 * When adding a new provider, make sure to update these files:
 * 1. src/types/provider.types.ts
 * 2. src/types/chat-model.types.ts
 * 3. src/constants.ts
 * 4. src/core/manager.ts
 * 5. src/core/(name)Provider.ts
 */
export const llmProviderSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('openai-compatible'),
    ...baseLlmProviderSchema.shape,
    baseUrl: z
      .string({
        required_error: 'Base URL is required',
      })
      .min(1, 'Base URL is required'),
    additionalSettings: z
      .object({
        noStainless: z.boolean().optional(),
      })
      .optional(),
  }),
  z.object({
    type: z.literal('anthropic-compatible'),
    ...baseLlmProviderSchema.shape,
    additionalSettings: z
      .object({
        noStainless: z.boolean().optional(),
      })
      .optional(),
  }),
  z.object({
    type: z.literal('google-compatible'),
    ...baseLlmProviderSchema.shape,
    additionalSettings: z
      .object({
        noStainless: z.boolean().optional(),
      })
      .optional(),
  }),
])

export type LLMProvider = z.infer<typeof llmProviderSchema>
export type LLMProviderType = LLMProvider['type']
