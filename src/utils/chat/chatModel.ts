import { Notice } from 'obsidian'

import { getChatModelClient } from '../../core/manager'
import { ZhinengchuangzuoSettings } from '../../settings/schema/setting.types'
import { ChatModel } from '../../types/chat-model.types'

/**
 * The chat model picked in the settings, or null when the selection is empty or
 * points to a model that has since been deleted. Purely local: it never builds a
 * provider client, so it is safe to use as a pre-flight check.
 */
export function getSelectedChatModel(
  settings: ZhinengchuangzuoSettings,
): ChatModel | null {
  return (
    settings.chatModels.find((model) => model.model === settings.chatModelId) ??
    null
  )
}

/** Single home of the "no model" wording, so the call sites cannot drift. */
export function notifyMissingChatModel(): void {
  new Notice('Please add a model in settings first')
}

/**
 * Resolves the client for the selected model. Returns null after telling the
 * user why, so streaming callers can simply abort instead of sending.
 */
export function resolveChatModelClient(
  settings: ZhinengchuangzuoSettings,
): ReturnType<typeof getChatModelClient> | null {
  const selected = getSelectedChatModel(settings)
  if (!selected) {
    notifyMissingChatModel()
    return null
  }

  try {
    return getChatModelClient({ modelId: selected.model, settings })
  } catch (error) {
    console.warn('Failed to resolve the chat model', error)
    notifyMissingChatModel()
    return null
  }
}
