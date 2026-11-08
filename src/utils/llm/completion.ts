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

/** Appended to the answer when the model hit its output limit. */
const TRUNCATION_SUFFIX = '\n==(截断)=='

/**
 * Providers report the output limit differently: OpenAI uses `length`, Anthropic
 * passes its own `max_tokens` stop reason straight through.
 */
const isTruncated = (finishReason: string | null | undefined): boolean =>
  finishReason === 'length' || finishReason === 'max_tokens'

/**
 * The request succeeded but produced nothing to show. Callers surface this in an
 * error dialog instead of leaving the user with an unanswered message.
 */
export class EmptyResponseError extends Error {
  constructor() {
    super('The model returned an empty response')
    this.name = 'EmptyResponseError'
  }
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
  let finishReason: string | null = null
  const interceptor = createTagInterceptor()

  for await (const chunk of responseStream) {
    if (signal.aborted) break

    const contentDelta = chunk.choices[0]?.delta?.content ?? ''
    const reasoningDelta = chunk.choices[0]?.delta?.reasoning ?? ''
    finishReason = chunk.choices[0]?.finish_reason ?? finishReason

    // Usage-only chunks (OpenAI sends the totals in a chunk with an empty
    // `choices` array) carry no text. Creating the message for them would leave
    // an empty bubble when the model returns nothing at all.
    if (!assistantMessage && !contentDelta && !reasoningDelta) continue

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

    const intercepted = interceptor.push(contentDelta, reasoningDelta)

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

  if (!assistantMessage) {
    // Nothing arrived at all. A user abort is not a failure to report.
    if (signal.aborted) return
    throw new EmptyResponseError()
  }

  const finalContent = isTruncated(finishReason)
    ? final.content + TRUNCATION_SUFFIX
    : final.content
  const finalReasoning = final.reasoning || undefined

  if (
    finalContent !== assistantMessage.content ||
    (finalReasoning ?? '') !== (assistantMessage.reasoning ?? '')
  ) {
    assistantMessage = {
      ...assistantMessage,
      content: finalContent,
      reasoning: finalReasoning,
    }
    onUpdate(assistantMessage)
    onScroll?.()
  }

  if (assistantMessage.content === '' && !assistantMessage.reasoning) {
    if (signal.aborted) return
    throw new EmptyResponseError()
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
  const content = isTruncated(choice?.finish_reason)
    ? intercepted.content + TRUNCATION_SUFFIX
    : intercepted.content

  // Same rule as the streaming path: an empty answer is reported as a failure
  // instead of creating an empty assistant message.
  if (content === '' && !intercepted.reasoning) {
    throw new EmptyResponseError()
  }

  onUpdate({
    id: `assistant-${Date.now()}`,
    role: 'assistant',
    content,
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
