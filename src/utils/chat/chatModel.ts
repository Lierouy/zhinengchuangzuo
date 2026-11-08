import { App, Notice } from 'obsidian'

import { getChatModelClient } from '../../core/manager'
import { ZhinengchuangzuoSettings } from '../../settings/schema/setting.types'
import { ChatModel } from '../../types/chat-model.types'
import { LLMProvider } from '../../types/provider.types'
/** A model is enabled unless it was explicitly turned off. */
export function isChatModelEnabled(model: ChatModel): boolean {
  return model.enable ?? true
}

/** Why the configured chat model cannot be used right now. */
export type ChatModelProblem = 'not-selected' | 'disabled' | 'missing-provider'

/** The model `chatModelId` points at, ignored when that model has been deleted. */
function findSelectedChatModel(
  settings: ZhinengchuangzuoSettings,
): ChatModel | null {
  return (
    settings.chatModels.find((model) => model.model === settings.chatModelId) ??
    null
  )
}

/**
 * Single place that decides whether a request may be sent. The disabled check
 * lives here (not only in the pickers) so the "enable" switch cannot be
 * bypassed by a hand-edited config or a stale selection.
 */
export function getChatModelProblem(
  settings: ZhinengchuangzuoSettings,
): ChatModelProblem | null {
  const model = findSelectedChatModel(settings)
  if (!model) return 'not-selected'
  if (!isChatModelEnabled(model)) return 'disabled'
  if (!settings.providers.some((p) => p.id === model.providerId)) {
    return 'missing-provider'
  }
  return null
}

const CHAT_MODEL_PROBLEM_MESSAGES: Record<ChatModelProblem, string> = {
  'not-selected': 'Please add a model in settings first',
  disabled:
    'The selected model is disabled, enable it or pick another model in settings',
  'missing-provider': 'The provider for this model is not configured',
}

export function notifyChatModelProblem(problem: ChatModelProblem): void {
  new Notice(CHAT_MODEL_PROBLEM_MESSAGES[problem])
}

/**
 * Models carry their own copy of the provider type. Editing a provider's type
 * has to propagate, otherwise every model under it fails the client's type
 * guard on its next request.
 */
export function syncModelsProviderType(
  chatModels: ChatModel[],
  providerId: string,
  providerType: ChatModel['providerType'],
): ChatModel[] {
  return chatModels.map((model) =>
    model.providerId === providerId && model.providerType !== providerType
      ? { ...model, providerType }
      : model,
  )
}

/**
 * Resolves the client for the selected model. Returns null after telling the
 * user why, so streaming callers can simply abort instead of sending.
 */
export function resolveChatModelClient(
  settings: ZhinengchuangzuoSettings,
  app: App,
): ReturnType<typeof getChatModelClient> | null {
  const problem = getChatModelProblem(settings)
  if (problem) {
    notifyChatModelProblem(problem)
    return null
  }

  const selected = findSelectedChatModel(settings)
  if (!selected) return null

  try {
    return getChatModelClient({
      modelId: selected.model,
      settings,
      // Keys live in Obsidian's SecretStorage; the resolver is injected here so
      // `core` stays free of app-level APIs.
      resolveApiKey: (provider) => resolveProviderApiKey(app, provider),
    })
  } catch (error) {
    console.warn('Failed to resolve the chat model', error)
    notifyChatModelProblem('not-selected')
    return null
  }
}

/**
 * The provider's API key, read from Obsidian's own secret storage.
 * `provider.apiKey` holds the storage id and never the secret itself,
 * so the plugin config stays free of credentials.
 */
export function resolveProviderApiKey(app: App, provider: LLMProvider): string {
  if (!provider.apiKey) return ''
  return app.secretStorage.getSecret(provider.apiKey) ?? ''
}
