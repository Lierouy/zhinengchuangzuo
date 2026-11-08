import { z } from 'zod'

import { chatModelSchema } from '../../types/chat-model.types'
import { llmProviderSchema } from '../../types/provider.types'

import {
  ZhinengchuangzuoSettings,
  zhinengchuangzuoSettingsSchema,
} from './setting.types'

/**
 * The schema replaces a whole array with its `[]` fallback as soon as one entry
 * fails, so a single malformed provider would also wipe every model that points
 * at it. Drop only the broken entries here and let the rest parse normally.
 */
function keepValidEntries(
  label: string,
  value: unknown,
  schema: z.ZodType,
): unknown {
  if (!Array.isArray(value)) return value
  const kept = value.filter((entry) => schema.safeParse(entry).success)
  const dropped = value.length - kept.length
  if (dropped > 0) {
    console.warn(`Dropped ${dropped} invalid ${label} while loading settings`)
  }
  return kept
}

function dropInvalidEntries(data: unknown): unknown {
  if (typeof data !== 'object' || data === null || Array.isArray(data)) {
    return data
  }

  const record = { ...(data as Record<string, unknown>) }
  if (Array.isArray(record.providers)) {
    record.providers = keepValidEntries(
      'provider',
      record.providers,
      llmProviderSchema,
    )
  }
  if (Array.isArray(record.chatModels)) {
    record.chatModels = keepValidEntries(
      'chat model',
      record.chatModels,
      chatModelSchema,
    )
  }
  return record
}

export function parseZhinengchuangzuoSettings(
  data: unknown,
): ZhinengchuangzuoSettings {
  try {
    return zhinengchuangzuoSettingsSchema.parse(dropInvalidEntries(data))
  } catch (error) {
    console.warn('Invalid settings provided, using defaults', error)
    return zhinengchuangzuoSettingsSchema.parse({})
  }
}
