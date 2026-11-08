import { LLMProviderClient } from '../../core/base'
import { ChatAssistantMessage } from '../../types/chat'
import { ChatModel } from '../../types/chat-model.types'
import {
  LLMRequestNonStreaming,
  LLMRequestStreaming,
} from '../../types/request'
import { ResponseUsage } from '../../types/response'

import { createTagInterceptor, interceptTagContent } from './reasoning'

const EMPTY_USAGE: ResponseUsage = {
  prompt_tokens: 0,
  completion_tokens: 0,
  total_tokens: 0,
}

export type RunCompletionParams = {
  providerClient: LLMProviderClient
  model: ChatModel
  /** Request built by `buildModelRequest`; `stream` decides the code path. */
  request: Record<string, unknown>
  signal: AbortSignal
  /** Called with the latest snapshot whenever the assistant message changes. */
  onUpdate: (message: ChatAssistantMessage) => void
  onScroll?: () => void
  /** Context prompt names to record on the assistant message, for diagnostics. */
  activePrompts?: string[]
}

/**
 * Runs a single completion (streaming or not) and reports the assistant message
 * through `onUpdate`. Aborts are swallowed so callers do not need to special-case
 * `AbortError`.
 */
export async function runCompletion({
  providerClient,
  model,
  request,
  signal,
  onUpdate,
  onScroll,
  activePrompts,
}: RunCompletionParams): Promise<void> {
  try {
    if (request.stream) {
      await runStreamingCompletion({
        providerClient,
        model,
        request: request as LLMRequestStreaming,
        signal,
        onUpdate,
        onScroll,
        activePrompts,
      })
    } else {
      await runNonStreamingCompletion({
        providerClient,
        model,
        request: request as LLMRequestNonStreaming,
        signal,
        onUpdate,
        onScroll,
        activePrompts,
      })
    }
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') return
    throw error
  }
}

async function runStreamingCompletion({
  providerClient,
  model,
  request,
  signal,
  onUpdate,
  onScroll,
  activePrompts,
}: Omit<RunCompletionParams, 'request'> & {
  request: LLMRequestStreaming
}): Promise<void> {
  const responseStream = await providerClient.streamResponse(model, request, {
    signal,
  })

  let assistantMessage: ChatAssistantMessage | null = null
  const interceptor = createTagInterceptor()

  for await (const chunk of responseStream) {
    if (signal.aborted) break

    if (!assistantMessage) {
      assistantMessage = {
        id: `assistant-${Date.now()}`,
        role: 'assistant',
        content: '',
        metadata: {
          usage: { ...EMPTY_USAGE },
          model: model.model,
          ...(activePrompts?.length ? { activePrompts } : {}),
        },
      }
    }

    const intercepted = interceptor.push(
      chunk.choices[0]?.delta?.content ?? '',
      chunk.choices[0]?.delta?.reasoning ?? '',
    )

    const currentUsage: ResponseUsage =
      assistantMessage.metadata?.usage ?? EMPTY_USAGE
    assistantMessage = {
      ...assistantMessage,
      content: intercepted.content,
      reasoning: intercepted.reasoning || undefined,
      metadata: {
        ...assistantMessage.metadata,
        usage: {
          prompt_tokens:
            chunk.usage?.prompt_tokens ?? currentUsage.prompt_tokens,
          completion_tokens:
            chunk.usage?.completion_tokens ?? currentUsage.completion_tokens,
          total_tokens: chunk.usage?.total_tokens ?? currentUsage.total_tokens,
        },
      },
    }

    onUpdate(assistantMessage)
    onScroll?.()
  }

  // Release any closing-tag tail held back during streaming.
  const final = interceptor.flush()
  if (
    assistantMessage &&
    (final.content !== assistantMessage.content ||
      final.reasoning !== (assistantMessage.reasoning ?? ''))
  ) {
    onUpdate({
      ...assistantMessage,
      content: final.content,
      reasoning: final.reasoning || undefined,
    })
    onScroll?.()
  }
}

async function runNonStreamingCompletion({
  providerClient,
  model,
  request,
  signal,
  onUpdate,
  onScroll,
  activePrompts,
}: Omit<RunCompletionParams, 'request'> & {
  request: LLMRequestNonStreaming
}): Promise<void> {
  const response = await providerClient.generateResponse(model, request, {
    signal,
  })
  const choice = response.choices?.[0]

  const intercepted = interceptTagContent(
    choice?.message?.content ?? '',
    choice?.message?.reasoning ?? '',
  )

  onUpdate({
    id: `assistant-${Date.now()}`,
    role: 'assistant',
    content: intercepted.content,
    reasoning: intercepted.reasoning || undefined,
    metadata: {
      usage: response.usage ?? { ...EMPTY_USAGE },
      // Same configured name the streaming path records; providers may echo an
      // internal model id in `response.model` instead.
      model: model.model,
      ...(activePrompts?.length ? { activePrompts } : {}),
    },
  })
  onScroll?.()
}
