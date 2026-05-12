import OpenAI from 'openai'
import {
  ChatCompletion,
  ChatCompletionChunk,
  ChatCompletionContentPart,
  ChatCompletionCreateParamsNonStreaming,
  ChatCompletionCreateParamsStreaming,
  ChatCompletionMessageParam,
} from 'openai/resources/chat/completions'

import {
  LLMOptions,
  LLMRequest,
  LLMRequestNonStreaming,
  LLMRequestStreaming,
  RequestMessage,
} from '../types/request'
import {
  LLMResponseNonStreaming,
  LLMResponseStreaming,
} from '../types/response'

export class OpenAIMessageAdapter {
  private customReasoningField?: string

  constructor(customReasoningField?: string) {
    this.customReasoningField = customReasoningField
  }

  async generateResponse(
    client: OpenAI,
    request: LLMRequestNonStreaming,
    options?: LLMOptions,
  ): Promise<LLMResponseNonStreaming> {
    const response = await client.chat.completions.create(
      this.buildChatCompletionCreateParams({
        request,
        stream: false,
      }),
      {
        signal: options?.signal,
      },
    )
    return this.parseNonStreamingResponse(response)
  }

  async streamResponse(
    client: OpenAI,
    request: LLMRequestStreaming,
    options?: LLMOptions,
  ): Promise<AsyncIterable<LLMResponseStreaming>> {
    const stream = await client.chat.completions.create(
      this.buildChatCompletionCreateParams({
        request,
        stream: true,
      }),
      {
        signal: options?.signal,
      },
    )

    return this.streamResponseGenerator(stream)
  }

  private async *streamResponseGenerator(
    stream: AsyncIterable<ChatCompletionChunk>,
  ): AsyncIterable<LLMResponseStreaming> {
    for await (const chunk of stream) {
      yield this.parseStreamingResponseChunk(chunk)
    }
  }

  protected buildChatCompletionCreateParams(params: {
    request: LLMRequest
    stream: false
  }): ChatCompletionCreateParamsNonStreaming
  protected buildChatCompletionCreateParams(params: {
    request: LLMRequest
    stream: true
  }): ChatCompletionCreateParamsStreaming
  protected buildChatCompletionCreateParams({
    request,
    stream,
  }: {
    request: LLMRequest
    stream: boolean
  }):
    | ChatCompletionCreateParamsStreaming
    | ChatCompletionCreateParamsNonStreaming {
    // Preserve any custom top-level fields from `request` so customParameters can pass through.
    const {
      max_tokens,
      temperature,
      top_p,
      frequency_penalty,
      presence_penalty,
      logit_bias,
      prediction,
      messages: _m,
      model: _mo,
      stream: _s,
      ...rest
    } = request as Record<string, unknown> as {
      max_tokens?: number
      temperature?: number
      top_p?: number
      frequency_penalty?: number
      presence_penalty?: number
      logit_bias?: unknown
      prediction?: unknown
      messages?: unknown
      model?: unknown
      stream?: unknown
      [key: string]: unknown
    }

    const out: Record<string, unknown> = {
      model: request.model,
      messages: request.messages.map((m) => this.parseRequestMessage(m)),
      max_tokens,
      temperature,
      top_p,
      frequency_penalty,
      presence_penalty,
      logit_bias,
      prediction,
      ...rest,
    }

    if (stream) {
      out.stream = true
      // Only include stream_options if not explicitly overridden in customParameters
      if (!rest.stream_options) {
        out.stream_options = {
          include_usage: true,
        }
      }
    }

    return out as unknown as
      | ChatCompletionCreateParamsStreaming
      | ChatCompletionCreateParamsNonStreaming
  }

  protected parseRequestMessage(
    message: RequestMessage,
  ): ChatCompletionMessageParam {
    switch (message.role) {
      case 'user': {
        const content = Array.isArray(message.content)
          ? message.content.map((part): ChatCompletionContentPart => {
              switch (part.type) {
                case 'text':
                  return { type: 'text', text: part.text }
                case 'image_url':
                  return { type: 'image_url', image_url: part.image_url }
              }
            })
          : message.content
        return { role: 'user', content }
      }
      case 'assistant': {
        if (Array.isArray(message.content)) {
          throw new Error('Assistant message should be a string')
        }
        return {
          role: 'assistant',
          content: message.content,
        }
      }
      case 'system': {
        if (Array.isArray(message.content)) {
          throw new Error('System message should be a string')
        }
        return { role: 'system', content: message.content }
      }
    }
  }

  private extractReasoning(
    source: Record<string, unknown>,
  ): string | undefined {
    if (this.customReasoningField && this.customReasoningField in source) {
      return source[this.customReasoningField] as string | undefined
    }
    if (typeof source.reasoning === 'string' && source.reasoning) {
      return source.reasoning
    }
    if (
      typeof source.reasoning_content === 'string' &&
      source.reasoning_content
    ) {
      return source.reasoning_content
    }
    return undefined
  }

  protected parseNonStreamingResponse(
    response: ChatCompletion,
  ): LLMResponseNonStreaming {
    return {
      id: response.id,
      choices: response.choices.map((choice) => {
        const reasoning = this.extractReasoning(
          choice.message as unknown as Record<string, unknown>,
        )

        return {
          finish_reason: choice.finish_reason,
          message: {
            content: choice.message.content ?? '',
            reasoning: reasoning,
            role: choice.message.role,
          },
        }
      }),
      created: response.created,
      model: response.model,
      object: 'chat.completion',
      usage: response.usage,
    }
  }

  protected parseStreamingResponseChunk(
    chunk: ChatCompletionChunk,
  ): LLMResponseStreaming {
    return {
      id: chunk.id,
      choices: chunk.choices.map((choice) => {
        const reasoning = this.extractReasoning(
          choice.delta as unknown as Record<string, unknown>,
        )

        return {
          finish_reason: choice.finish_reason ?? null,
          delta: {
            content: choice.delta.content ?? '',
            reasoning: reasoning,
            role: choice.delta.role,
          },
        }
      }),
      created: chunk.created,
      model: chunk.model,
      object: 'chat.completion.chunk',
      usage: chunk.usage ?? undefined,
    }
  }
}
