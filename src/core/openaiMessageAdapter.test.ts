import type {
  ChatCompletion,
  ChatCompletionChunk,
} from 'openai/resources/chat/completions'
import { describe, expect, it, vi } from 'vitest'

import type {
  LLMRequest,
  LLMRequestNonStreaming,
  LLMRequestStreaming,
  RequestMessage,
} from '../types/request'

import { OpenAIMessageAdapter } from './openaiMessageAdapter'

/**
 * The adapter's parsing helpers are `protected` on purpose; the test exposes
 * them through a narrow structural type instead of copying the logic.
 */
type ExposedAdapter = {
  buildChatCompletionCreateParams(args: {
    request: LLMRequest
    stream: boolean
  }): Record<string, unknown>
  parseRequestMessage(message: RequestMessage): unknown
  parseNonStreamingResponse(response: ChatCompletion): unknown
  parseStreamingResponseChunk(chunk: ChatCompletionChunk): unknown
}

const expose = (adapter: OpenAIMessageAdapter): ExposedAdapter =>
  adapter as unknown as ExposedAdapter

const textRequest = (overrides: Partial<LLMRequest> = {}): LLMRequest => ({
  model: 'gpt-4o-mini',
  messages: [{ role: 'user', content: 'hello' }],
  ...overrides,
})

describe('buildChatCompletionCreateParams', () => {
  it('maps the request and leaves streaming off by default', () => {
    const params = expose(
      new OpenAIMessageAdapter(),
    ).buildChatCompletionCreateParams({
      request: textRequest({
        temperature: 0.5,
        max_tokens: 100,
        top_p: 0.9,
      }),
      stream: false,
    })

    expect(params).toMatchObject({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: 'hello' }],
      temperature: 0.5,
      max_tokens: 100,
      top_p: 0.9,
    })
    expect(params).not.toHaveProperty('stream')
    expect(params).not.toHaveProperty('stream_options')
  })

  it('adds stream and usage tracking for streaming requests', () => {
    const params = expose(
      new OpenAIMessageAdapter(),
    ).buildChatCompletionCreateParams({
      request: textRequest({ stream: true }),
      stream: true,
    })

    expect(params.stream).toBe(true)
    expect(params.stream_options).toEqual({ include_usage: true })
  })

  it('keeps custom parameters and lets them override stream_options', () => {
    const request = {
      ...textRequest(),
      thinking: { type: 'disabled' },
      stream_options: { include_usage: false },
    } as unknown as LLMRequest

    const params = expose(
      new OpenAIMessageAdapter(),
    ).buildChatCompletionCreateParams({
      request,
      stream: true,
    })

    expect(params.thinking).toEqual({ type: 'disabled' })
    expect(params.stream_options).toEqual({ include_usage: false })
  })

  it('serializes user content parts, including images', () => {
    const params = expose(
      new OpenAIMessageAdapter(),
    ).buildChatCompletionCreateParams({
      request: textRequest({
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: 'look' },
              { type: 'image_url', image_url: { url: 'data:image/png' } },
            ],
          },
        ],
      }),
      stream: false,
    })

    expect(params.messages).toEqual([
      {
        role: 'user',
        content: [
          { type: 'text', text: 'look' },
          { type: 'image_url', image_url: { url: 'data:image/png' } },
        ],
      },
    ])
  })
})

describe('parseRequestMessage', () => {
  it('rejects array content on assistant and system turns', () => {
    const adapter = expose(new OpenAIMessageAdapter())

    expect(() =>
      adapter.parseRequestMessage({
        role: 'assistant',
        content: [{ type: 'text', text: 'x' }],
      } as unknown as RequestMessage),
    ).toThrow('Assistant message should be a string')
    expect(() =>
      adapter.parseRequestMessage({
        role: 'system',
        content: [{ type: 'text', text: 'x' }],
      } as unknown as RequestMessage),
    ).toThrow('System message should be a string')
  })
})

describe('parseNonStreamingResponse', () => {
  const response = {
    id: 'chatcmpl-1',
    created: 1,
    model: 'gpt-4o-mini',
    usage: { prompt_tokens: 1, completion_tokens: 2, total_tokens: 3 },
    choices: [
      {
        finish_reason: 'stop',
        message: { role: 'assistant', content: null },
      },
    ],
  } as unknown as ChatCompletion

  it('normalizes a null content into an empty string', () => {
    const parsed = expose(new OpenAIMessageAdapter()).parseNonStreamingResponse(
      response,
    ) as {
      choices: { message: { content: string } }[]
      object: string
      usage: unknown
    }

    expect(parsed.choices[0].message.content).toBe('')
    expect(parsed.object).toBe('chat.completion')
    // `total_tokens` from the provider is dropped: nothing reads it.
    expect(parsed.usage).toEqual({ prompt_tokens: 1, completion_tokens: 2 })
  })

  it('prefers an explicitly configured reasoning field', () => {
    const parsed = expose(
      new OpenAIMessageAdapter('my_reasoning'),
    ).parseNonStreamingResponse({
      ...response,
      choices: [
        {
          finish_reason: 'stop',
          message: {
            role: 'assistant',
            content: 'answer',
            my_reasoning: 'custom',
            reasoning_content: 'fallback',
          },
        },
      ],
    } as unknown as ChatCompletion) as {
      choices: { message: { reasoning?: string } }[]
    }

    expect(parsed.choices[0].message.reasoning).toBe('custom')
  })

  it('falls back to reasoning_content', () => {
    const parsed = expose(new OpenAIMessageAdapter()).parseNonStreamingResponse(
      {
        ...response,
        choices: [
          {
            finish_reason: 'stop',
            message: {
              role: 'assistant',
              content: 'answer',
              reasoning_content: 'thinking',
            },
          },
        ],
      } as unknown as ChatCompletion,
    ) as { choices: { message: { reasoning?: string } }[] }

    expect(parsed.choices[0].message.reasoning).toBe('thinking')
  })
})

describe('parseStreamingResponseChunk', () => {
  it('normalizes missing delta content and finish_reason', () => {
    const parsed = expose(
      new OpenAIMessageAdapter(),
    ).parseStreamingResponseChunk({
      id: 'chunk-1',
      created: 1,
      model: 'gpt-4o-mini',
      choices: [{ index: 0, delta: { role: 'assistant' } }],
    } as unknown as ChatCompletionChunk) as {
      object: string
      choices: {
        finish_reason: string | null
        delta: { content: string }
      }[]
    }

    expect(parsed.object).toBe('chat.completion.chunk')
    expect(parsed.choices[0].finish_reason).toBeNull()
    expect(parsed.choices[0].delta.content).toBe('')
  })
})

describe('generateResponse', () => {
  it('forwards the abort signal to the SDK client', async () => {
    const create = vi.fn().mockResolvedValue({
      id: 'chatcmpl-1',
      created: 1,
      model: 'gpt-4o-mini',
      choices: [
        {
          finish_reason: 'stop',
          message: { role: 'assistant', content: 'ok' },
        },
      ],
    })
    const client = { chat: { completions: { create } } }
    const signal = new AbortController().signal

    const result = await new OpenAIMessageAdapter().generateResponse(
      client as never,
      textRequest() as LLMRequestNonStreaming,
      { signal },
    )

    expect(result.choices[0].message.content).toBe('ok')
    expect(create).toHaveBeenCalledTimes(1)
    expect(create.mock.calls[0][1]).toEqual({ signal })
  })

  it('streams parsed chunks from the SDK', async () => {
    const chunks = [
      {
        id: 'c1',
        created: 1,
        model: 'm',
        choices: [{ index: 0, delta: { content: 'he' }, finish_reason: null }],
      },
      {
        id: 'c2',
        created: 1,
        model: 'm',
        choices: [
          { index: 0, delta: { content: 'llo' }, finish_reason: 'stop' },
        ],
      },
    ]
    async function* generate(): AsyncIterable<ChatCompletionChunk> {
      for (const chunk of chunks) {
        yield chunk as unknown as ChatCompletionChunk
      }
    }
    const create = vi.fn().mockResolvedValue(generate())
    const client = { chat: { completions: { create } } }

    const stream = await new OpenAIMessageAdapter().streamResponse(
      client as never,
      textRequest({ stream: true }) as LLMRequestStreaming,
    )

    const received: string[] = []
    for await (const chunk of stream) {
      received.push(chunk.choices[0]?.delta.content ?? '')
    }

    expect(received.join('')).toBe('hello')
  })
})
