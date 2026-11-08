import { useCallback, useState } from 'react'

import { ZhinengchuangzuoSettings } from '../../settings/schema/setting.types'
import {
  ChatAssistantMessage,
  ChatMessage,
  HandleStreamInput,
} from '../../types/chat'
import { RequestMessage } from '../../types/request'
import { resolveChatModelClient } from '../../utils/chat/chatModel'
import { runCompletion } from '../../utils/llm/completion'
import { ModelSettings, buildModelRequest } from '../../utils/model-settings'
import { CONSOLE_HINT, reportError } from '../../utils/reportError'

type UseHandleStreamParams = {
  settings: ZhinengchuangzuoSettings
  setChatMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>>
  autoScrollToBottom: () => void
  abortActiveStreams: () => void
  registerAbortController: (controller: AbortController) => () => void
}

export type UseHandleStream = {
  /** Streams the "handle this file" prompt into the conversation. */
  startHandleStream: (input: HandleStreamInput) => Promise<void>
  /** True while this hook owns a running stream. */
  handleStreamActive: boolean
}

/**
 * The "单独处理当前文件" flow: takes the preset system prompt and a pre-built file
 * prompt from the command, then streams the model's answer as a new assistant
 * message.
 */
export function useHandleStream({
  settings,
  setChatMessages,
  autoScrollToBottom,
  abortActiveStreams,
  registerAbortController,
}: UseHandleStreamParams): UseHandleStream {
  const [handleStreamActive, setHandleStreamActive] = useState(false)

  const startHandleStream = useCallback(
    async (input: HandleStreamInput) => {
      try {
        abortActiveStreams()
        setHandleStreamActive(true)

        const client = resolveChatModelClient(settings)
        if (!client) return
        const { providerClient, model } = client

        const abortController = new AbortController()
        const unregister = registerAbortController(abortController)

        try {
          const messages: RequestMessage[] = [
            { role: 'system', content: input.systemPrompt },
            { role: 'user', content: input.prompt },
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
        reportError(`Failed to start processing the file, ${CONSOLE_HINT}`, error)
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
    ],
  )

  return { startHandleStream, handleStreamActive }
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
