import { z } from 'zod'

const baseChatModelSchema = z.object({
  providerId: z
    .string({
      error: 'Provider ID is required',
    })
    .min(1, 'Provider ID is required'),
  id: z
    .string({
      error: 'ID is required',
    })
    .min(1, 'ID is required'),
  model: z
    .string({
      error: 'Model is required',
    })
    .min(1, 'Model is required'),
  enable: z.boolean().default(true).optional(),
  // Optional per-model settings for API tuning. Every field falls back on its
  // own so a single bad value cannot invalidate the model, and therefore cannot
  // take the whole `chatModels` array down with it.
  settings: z
    .object({
      temperature: z.number().optional().catch(undefined),
      topP: z.number().optional().catch(undefined),
      contextCount: z.number().optional().catch(undefined),
      maxTokens: z.number().optional().catch(undefined),
      streamOutput: z.boolean().optional().catch(undefined),
      // customParameters stored as array of raw strings; each entry is a top-level
      // key/value snippet that will be parsed before sending, e.g. '"thinking": {"type":"disabled"}'
      customParameters: z.array(z.string()).optional().catch(undefined),
    })
    .optional()
    .catch(undefined),
})

export const chatModelSchema = z.discriminatedUnion('providerType', [
  z.object({
    providerType: z.literal('openai-compatible'),
    ...baseChatModelSchema.shape,
  }),
  z.object({
    providerType: z.literal('anthropic-compatible'),
    ...baseChatModelSchema.shape,
  }),
])

export type ChatModel = z.infer<typeof chatModelSchema>
