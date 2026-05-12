import { UseMutationResult, useMutation } from '@tanstack/react-query'
import { Notice } from 'obsidian'
import { useCallback, useEffect, useRef, useState } from 'react'

import { useApp } from '../../contexts/app-context'
import { useSettings } from '../../contexts/settings-context'
import {
  LLMAPIKeyInvalidException,
  LLMAPIKeyNotSetException,
  LLMBaseUrlNotSetException,
  LLMModelNotFoundException,
} from '../../core/exception'
import { getChatModelClient } from '../../core/manager'
import { ChatAssistantMessage, ChatMessage } from '../../types/chat'
import {
  LLMRequestNonStreaming,
  LLMRequestStreaming,
} from '../../types/request'
import { PromptGenerator } from '../../utils/chat/promptGenerator'
import { ModelSettings, buildModelRequest } from '../../utils/model-settings'
import { ErrorModal } from '../modals/ErrorModal'

const COMMON_HTML_TAGS = new Set([
  'html',
  'base',
  'head',
  'link',
  'meta',
  'style',
  'title',
  'body',
  'address',
  'article',
  'aside',
  'footer',
  'header',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'hgroup',
  'main',
  'nav',
  'section',
  'search',
  'blockquote',
  'dd',
  'div',
  'dl',
  'dt',
  'figcaption',
  'figure',
  'hr',
  'li',
  'menu',
  'ol',
  'p',
  'pre',
  'ul',
  'a',
  'abbr',
  'b',
  'bdi',
  'bdo',
  'br',
  'cite',
  'code',
  'data',
  'dfn',
  'em',
  'i',
  'kbd',
  'mark',
  'q',
  'rp',
  'rt',
  'ruby',
  's',
  'samp',
  'small',
  'span',
  'strong',
  'sub',
  'sup',
  'time',
  'u',
  'var',
  'wbr',
  'area',
  'audio',
  'img',
  'map',
  'track',
  'video',
  'embed',
  'fencedframe',
  'iframe',
  'object',
  'picture',
  'source',
  'svg',
  'math',
  'canvas',
  'noscript',
  'script',
  'del',
  'ins',
  'caption',
  'col',
  'colgroup',
  'table',
  'tbody',
  'td',
  'tfoot',
  'th',
  'thead',
  'tr',
  'button',
  'datalist',
  'fieldset',
  'form',
  'input',
  'label',
  'legend',
  'meter',
  'optgroup',
  'option',
  'output',
  'progress',
  'select',
  'textarea',
  'details',
  'dialog',
  'summary',
  'slot',
  'template',
  'selectedcontent',
])

/**
 * Extract non-standard XML tag content from model output and move it to reasoning.
 * Some models wrap thinking content in custom XML tags (e.g. <thinking>...</thinking>).
 * This function detects such tags, strips them from `content`, and appends their
 * inner text to `reasoning`.
 */
function interceptTagContent(
  content: string,
  reasoning: string,
): { content: string; reasoning: string } {
  if (!content.trimStart().startsWith('<')) {
    return { content, reasoning }
  }

  const match = content.match(/^\s*<([a-zA-Z0-9_-]{1,15})>/)
  if (!match) {
    return { content, reasoning }
  }

  const tagName = match[1].toLowerCase()
  // Only intercept tags NOT in the common HTML whitelist
  if (COMMON_HTML_TAGS.has(tagName)) {
    return { content, reasoning }
  }

  const tagStartStr = match[0]
  const tagEndStr = `</${match[1]}>`

  const startIndex = content.indexOf(tagStartStr)
  if (startIndex === -1) {
    return { content, reasoning }
  }

  const endIndex = content.indexOf(tagEndStr)
  let extractedThought: string
  let newContent: string

  if (endIndex !== -1) {
    // Tag is fully closed
    extractedThought = content.substring(
      startIndex + tagStartStr.length,
      endIndex,
    )
    newContent =
      content.substring(0, startIndex) +
      content.substring(endIndex + tagEndStr.length)
  } else {
    // Tag is still open (streaming)
    extractedThought = content.substring(startIndex + tagStartStr.length)
    newContent = content.substring(0, startIndex)
  }

  const newReasoning = (
    (reasoning ? reasoning + '\n' : '') + extractedThought
  ).trim()
  return { content: newContent, reasoning: newReasoning }
}

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
    { chatMessages: ChatMessage[]; _conversationId: string }
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

  const [clientState, setClientState] = useState<{
    providerClient:
      | ReturnType<typeof getChatModelClient>['providerClient']
      | null
    model: ReturnType<typeof getChatModelClient>['model'] | null
  }>({ providerClient: null, model: null })

  useEffect(() => {
    try {
      if (settings.chatModels.length === 0) {
        setClientState({ providerClient: null, model: null })
        return
      }
      const result = getChatModelClient({
        modelId: settings.chatModelId,
        settings,
        setSettings,
      })
      setClientState({
        providerClient: result.providerClient,
        model: result.model,
      })
    } catch (error) {
      if (error instanceof LLMModelNotFoundException) {
        if (settings.chatModels.length === 0) {
          setClientState({ providerClient: null, model: null })
          return
        }
        // Fallback to the first chat model if the selected chat model is not found
        const firstChatModel = settings.chatModels[0]
        setSettings({
          ...settings,
          chatModelId: firstChatModel.model,
          chatModels: settings.chatModels.map((m) =>
            m.model === firstChatModel.model ? { ...m, enable: true } : m,
          ),
        })
        // settings update will re-trigger this effect
        return
      }
      setClientState({ providerClient: null, model: null })
    }
  }, [settings, setSettings])

  const { providerClient, model } = clientState

  const submitChatMutation = useMutation({
    mutationFn: async ({
      chatMessages,
      _conversationId,
    }: {
      chatMessages: ChatMessage[]
      _conversationId: string
    }) => {
      const lastMessage = chatMessages.at(-1)
      if (!lastMessage) return

      if (!providerClient || !model) {
        new Notice('Please add a model in settings first')
        return
      }

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

        const useStreaming = !!baseRequest.stream

        if (useStreaming) {
          const responseStream = await providerClient.streamResponse(
            model,
            baseRequest as LLMRequestStreaming,
            { signal: abortController.signal },
          )

          let assistantMessage: ChatAssistantMessage | null = null
          let rawContentBuffer = ''
          let accumulatedReasoning = ''

          for await (const chunk of responseStream) {
            if (abortController.signal.aborted) break

            if (!assistantMessage) {
              assistantMessage = {
                id: `assistant-${Date.now()}`,
                role: 'assistant',
                content: '',
                metadata: {
                  usage: {
                    prompt_tokens: 0,
                    completion_tokens: 0,
                    total_tokens: 0,
                  },
                  model: model.model,
                },
              }
              setChatMessages((prev) =>
                assistantMessage ? [...prev, assistantMessage] : prev,
              )
            }

            if (assistantMessage) {
              const contentChunk = chunk.choices[0]?.delta?.content ?? ''
              const reasoningChunk = chunk.choices[0]?.delta?.reasoning ?? ''

              rawContentBuffer += contentChunk
              accumulatedReasoning += reasoningChunk

              let displayContent = rawContentBuffer
              let displayReasoning = accumulatedReasoning

              // Intercept non-standard XML tags (e.g. <thinking>) and move to reasoning
              const intercepted = interceptTagContent(
                displayContent,
                displayReasoning,
              )
              displayContent = intercepted.content
              displayReasoning = intercepted.reasoning

              assistantMessage.content = displayContent
              assistantMessage.reasoning = displayReasoning || undefined

              const currentUsage = assistantMessage.metadata?.usage ?? {
                prompt_tokens: 0,
                completion_tokens: 0,
                total_tokens: 0,
              }
              assistantMessage.metadata = {
                ...assistantMessage.metadata,
                usage: {
                  prompt_tokens:
                    chunk.usage?.prompt_tokens ?? currentUsage.prompt_tokens,
                  completion_tokens:
                    chunk.usage?.completion_tokens ??
                    currentUsage.completion_tokens,
                  total_tokens:
                    chunk.usage?.total_tokens ?? currentUsage.total_tokens,
                },
              }

              const assistant = assistantMessage
              setChatMessages((prev) => {
                const newMessages = [...prev]
                const currentId = assistant.id
                const idx = newMessages.findIndex((m) => m.id === currentId)
                if (idx !== -1)
                  newMessages[idx] = {
                    ...assistant,
                    content: assistant.content,
                    reasoning: assistant.reasoning,
                    metadata: assistant.metadata,
                  }
                return newMessages
              })
              try {
                autoScrollToBottom()
              } catch (e) {
                /* ignore scrolling errors */
              }
            }
          }
        } else {
          const nonStreamResponse = await providerClient.generateResponse(
            model,
            baseRequest as LLMRequestNonStreaming,
            { signal: abortController.signal },
          )
          const choice = nonStreamResponse.choices?.[0]

          let content = choice?.message?.content ?? ''
          let reasoning = choice?.message?.reasoning ?? ''

          // Intercept non-standard XML tags (e.g. <thinking>) and move to reasoning
          const intercepted = interceptTagContent(content, reasoning)
          content = intercepted.content
          reasoning = intercepted.reasoning

          const assistantMessage: ChatAssistantMessage = {
            id: `assistant-${Date.now()}`,
            role: 'assistant',
            content: content,
            reasoning: reasoning || undefined,
            metadata: {
              usage: nonStreamResponse.usage ?? {
                prompt_tokens: 0,
                completion_tokens: 0,
                total_tokens: 0,
              },
              model: nonStreamResponse.model,
            },
          }
          setChatMessages((prev) => [...prev, assistantMessage])
          try {
            autoScrollToBottom()
          } catch (e) {
            /* ignore scrolling errors */
          }
        }
      } catch (error) {
        if (error instanceof Error && error.name === 'AbortError') return
        throw error
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
