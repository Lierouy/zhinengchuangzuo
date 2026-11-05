import { Notice } from 'obsidian'
import { useCallback, useState } from 'react'

import { getChatModelClient } from '../../core/manager'
import { TemplateManager } from '../../database/template/TemplateManager'
import { ZhinengchuangzuoSettings } from '../../settings/schema/setting.types'
import { ChatAssistantMessage, ChatMessage } from '../../types/chat'
import { RequestMessage } from '../../types/request'
import { runCompletion } from '../../utils/llm/completion'
import { ModelSettings, buildModelRequest } from '../../utils/model-settings'

type UseHandleStreamParams = {
  settings: ZhinengchuangzuoSettings
  templateManager: TemplateManager
  setChatMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>>
  autoScrollToBottom: () => void
  abortActiveStreams: () => void
  registerAbortController: (controller: AbortController) => () => void
}

export type UseHandleStream = {
  /** Streams the "handle this file" prompt into the conversation. */
  startHandleStream: (fileContent: string) => Promise<void>
  /** True while this hook owns a running stream. */
  handleStreamActive: boolean
}

/**
 * The "单独处理当前文件" flow: takes a pre-built file prompt from a command and
 * streams the model's answer as a new assistant message.
 */
export function useHandleStream({
  settings,
  templateManager,
  setChatMessages,
  autoScrollToBottom,
  abortActiveStreams,
  registerAbortController,
}: UseHandleStreamParams): UseHandleStream {
  const [handleStreamActive, setHandleStreamActive] = useState(false)

  const startHandleStream = useCallback(
    async (fileContent: string) => {
      try {
        abortActiveStreams()
        setHandleStreamActive(true)

        const client = resolveClientOrNotify(settings)
        if (!client) return
        const { providerClient, model } = client

        const abortController = new AbortController()
        const unregister = registerAbortController(abortController)

        try {
          const handlePrompt = await resolveHandlePrompt(
            templateManager,
            settings.handlePromptId,
          )
          if (!handlePrompt) {
            new Notice('Select the prompt to use in the settings first')
            return
          }

          const messages: RequestMessage[] = [
            { role: 'system', content: handlePrompt },
            { role: 'user', content: fileContent },
          ]
          const rawSettings: ModelSettings = model.settings ?? {}
          const { baseRequest } = buildModelRequest(
            model,
            rawSettings,
            messages,
          )

          await runCompletion({
            providerClient,
            model,
            request: baseRequest,
            signal: abortController.signal,
            onUpdate: (assistantMessage) => {
              setChatMessages((prev) => upsertMessage(prev, assistantMessage))
            },
            onScroll: autoScrollToBottom,
          })
        } finally {
          unregister()
        }
      } catch (error) {
        if (error instanceof Error && error.name === 'AbortError') return
        console.error('StartHandleStream failed', error)
        new Notice('Unable to start file processing, please check the console')
      } finally {
        setHandleStreamActive(false)
      }
    },
    [
      abortActiveStreams,
      registerAbortController,
      setChatMessages,
      autoScrollToBottom,
      settings,
      templateManager,
    ],
  )

  return { startHandleStream, handleStreamActive }
}

/** Resolves the chat model, notifying the user when nothing is configured. */
function resolveClientOrNotify(
  settings: ZhinengchuangzuoSettings,
): ReturnType<typeof getChatModelClient> | null {
  try {
    return getChatModelClient({ modelId: settings.chatModelId, settings })
  } catch (error) {
    console.warn('Failed to resolve the chat model', error)
    new Notice('Please add a model in settings first')
    return null
  }
}

async function resolveHandlePrompt(
  templateManager: TemplateManager,
  handlePromptId: string,
): Promise<string> {
  if (!handlePromptId) return ''
  const template = await templateManager.findById(handlePromptId)
  return template?.content.trim() ?? ''
}

/** Replaces the streaming assistant message in place, or appends it once. */
function upsertMessage(
  messages: ChatMessage[],
  assistantMessage: ChatAssistantMessage,
): ChatMessage[] {
  const index = messages.findIndex((m) => m.id === assistantMessage.id)
  if (index === -1) return [...messages, assistantMessage]
  const next = [...messages]
  next[index] = assistantMessage
  return next
}
