import { z } from 'zod'

const baseChatModelSchema = z.object({
  providerId: z
    .string({
      required_error: 'Provider ID is required',
    })
    .min(1, 'Provider ID is required'),
  id: z
    .string({
      required_error: 'ID is required',
    })
    .min(1, 'ID is required'),
  model: z
    .string({
      required_error: 'Model is required',
    })
    .min(1, 'Model is required'),
  enable: z.boolean().default(true).optional(),
  // Optional per-model settings for API tuning
  settings: z
    .object({
      temperature: z.number().optional(),
      topP: z.number().optional(),
      contextCount: z.number().optional(),
      maxTokens: z.number().optional(),
      streamOutput: z.boolean().optional(),
      // customParameters stored as array of raw strings; each entry is a top-level
      // key/value snippet that will be parsed before sending, e.g. '"thinking": {"type":"disabled"}'
      customParameters: z.array(z.string()).optional(),
    })
    .optional(),
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
  z.object({
    providerType: z.literal('google-compatible'),
    ...baseChatModelSchema.shape,
  }),
])

export type ChatModel = z.infer<typeof chatModelSchema>
