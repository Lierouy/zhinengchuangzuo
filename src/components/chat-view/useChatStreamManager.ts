import { UseMutationResult, useMutation } from '@tanstack/react-query'
import { Notice } from 'obsidian'
import { useCallback, useRef } from 'react'

import { useApp } from '../../contexts/app-context'
import { useSettings } from '../../contexts/settings-context'
import {
  LLMAPIKeyInvalidException,
  LLMAPIKeyNotSetException,
  LLMBaseUrlNotSetException,
  LLMModelNotFoundException,
} from '../../core/exception'
import { getChatModelClient } from '../../core/manager'
import { ChatMessage } from '../../types/chat'
import { PromptGenerator } from '../../utils/chat/promptGenerator'
import { runCompletion } from '../../utils/llm/completion'
import { ModelSettings, buildModelRequest } from '../../utils/model-settings'
import { ErrorModal } from '../modals/ErrorModal'

type UseChatStreamManagerParams = {
  setChatMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>>
  autoScrollToBottom: () => void
  promptGenerator: PromptGenerator
}

export type UseChatStreamManager = {
  abortActiveStreams: () => void
  submitChatMutation: UseMutationResult<
    void,
    Error,
    { chatMessages: ChatMessage[] }
  >
  registerAbortController: (c: AbortController) => () => void
}

export function useChatStreamManager({
  setChatMessages,
  autoScrollToBottom,
  promptGenerator,
}: UseChatStreamManagerParams): UseChatStreamManager {
  const app = useApp()
  const { settings, setSettings } = useSettings()

  const activeStreamAbortControllersRef = useRef<AbortController[]>([])

  const abortActiveStreams = useCallback(() => {
    for (const abortController of activeStreamAbortControllersRef.current) {
      abortController.abort()
    }
    activeStreamAbortControllersRef.current = []
  }, [])

  const registerAbortController = useCallback((c: AbortController) => {
    activeStreamAbortControllersRef.current.push(c)
    return () => {
      activeStreamAbortControllersRef.current =
        activeStreamAbortControllersRef.current.filter(
          (controller) => controller !== c,
        )
    }
  }, [])

  const submitChatMutation = useMutation({
    mutationFn: async ({ chatMessages }: { chatMessages: ChatMessage[] }) => {
      const lastMessage = chatMessages.at(-1)
      if (!lastMessage) return

      // Resolved per request instead of being mirrored into state: the client
      // is only needed here, and the old derive-in-an-effect version cost an
      // extra render every time settings changed.
      const resolveClient = () => {
        try {
          return getChatModelClient({
            modelId: settings.chatModelId,
            settings,
          })
        } catch (error) {
          if (!(error instanceof LLMModelNotFoundException)) throw error
          // Only repair the settings when the selection is genuinely broken.
          if (settings.chatModels.length > 0) {
            const firstChatModel = settings.chatModels[0]
            setSettings({
              ...settings,
              chatModelId: firstChatModel.model,
              chatModels: settings.chatModels.map((m) =>
                m.model === firstChatModel.model ? { ...m, enable: true } : m,
              ),
            })
          }
          return null
        }
      }

      const client = resolveClient()
      if (!client) {
        new Notice('Please add a model in settings first')
        return
      }
      const { providerClient, model } = client

      abortActiveStreams()
      const abortController = new AbortController()
      activeStreamAbortControllersRef.current.push(abortController)

      try {
        const rawSettings: ModelSettings = model.settings ?? {}
        const { baseRequest, settings } = buildModelRequest(
          model,
          rawSettings,
          [],
        )

        const requestMessages = await promptGenerator.generateRequestMessages({
          messages: chatMessages,
          contextCount: settings.contextCount,
        })

        baseRequest.messages = requestMessages

        await runCompletion({
          providerClient,
          model,
          request: baseRequest,
          signal: abortController.signal,
          onUpdate: (assistantMessage) => {
            setChatMessages((prev) => {
              const idx = prev.findIndex((m) => m.id === assistantMessage.id)
              if (idx === -1) return [...prev, assistantMessage]
              const next = [...prev]
              next[idx] = assistantMessage
              return next
            })
          },
          onScroll: autoScrollToBottom,
        })
      } finally {
        activeStreamAbortControllersRef.current =
          activeStreamAbortControllersRef.current.filter(
            (c) => c !== abortController,
          )
      }
    },
    onError: (error) => {
      const isSettingsError =
        error instanceof LLMAPIKeyNotSetException ||
        error instanceof LLMAPIKeyInvalidException ||
        error instanceof LLMBaseUrlNotSetException

      const fullMessage = error.message
      const shortMessage =
        fullMessage.length > 200 ? fullMessage.slice(0, 200) + '…' : fullMessage

      new ErrorModal(
        app,
        'Error',
        isSettingsError ? fullMessage : shortMessage,
        isSettingsError
          ? (error as { rawError?: Error }).rawError?.message
          : fullMessage,
        {
          showSettingsButton: isSettingsError,
        },
      ).open()
      console.error('Failed to generate response', error)
    },
  })

  return {
    abortActiveStreams,
    submitChatMutation,
    registerAbortController,
  }
}
