// @vitest-environment happy-dom
import { act, renderHook } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { AppProvider } from '../../contexts/app-context'
import type { ZhinengchuangzuoSettings } from '../../settings/schema/setting.types'
import { createFakeApp } from '../../test/fakes/fakeApp'
import type { HandleStreamInput } from '../../types/chat'

import { useHandleStream } from './useHandleStream'

const mocks = vi.hoisted(() => ({
  runCompletion: vi.fn(
    (_params: { request: { messages: unknown }; signal: AbortSignal }) =>
      Promise.resolve(),
  ),
  resolveChatModelClient: vi.fn(),
}))

vi.mock('../../utils/llm/completion', () => ({
  runCompletion: mocks.runCompletion,
  EmptyResponseError: class EmptyResponseError extends Error {},
}))

vi.mock('../../utils/chat/chatModel', () => ({
  resolveChatModelClient: mocks.resolveChatModelClient,
}))

const settings = {
  version: 17,
  providers: [],
  chatModels: [],
  chatModelId: 'gpt-4o-mini',
  selectedPromptGroupId: '',
  promptActivationLimit: null,
  handlePromptId: 'template-1',
  chatOptions: { includeCurrentFileContent: true },
} as ZhinengchuangzuoSettings

const input: HandleStreamInput = {
  systemPrompt: 'system prompt',
  prompt: 'file prompt',
}

const app = createFakeApp().app

const wrapper = ({ children }: { children: ReactNode }) => (
  <AppProvider app={app}>{children}</AppProvider>
)

const setup = (hasActiveStreams: () => boolean) => {
  const registerAbortController = vi.fn(() => () => {})
  const setChatMessages = vi.fn()
  const hook = renderHook(
    () =>
      useHandleStream({
        settings,
        setChatMessages,
        autoScrollToBottom: vi.fn(),
        hasActiveStreams,
        registerAbortController,
      }),
    { wrapper },
  )
  return { ...hook, registerAbortController, setChatMessages }
}

describe('useHandleStream', () => {
  beforeEach(() => {
    mocks.runCompletion.mockClear()
    mocks.resolveChatModelClient.mockReset()
    mocks.resolveChatModelClient.mockReturnValue({
      providerClient: {
        generateResponse: vi.fn(),
        streamResponse: vi.fn(),
      },
      model: {
        providerType: 'openai-compatible' as const,
        providerId: 'p1',
        id: 'm1',
        model: 'gpt-4o-mini',
      },
    })
  })

  it('does nothing while another response is streaming', async () => {
    const { result, registerAbortController } = setup(() => true)

    await act(async () => {
      await result.current.startHandleStream(input)
    })

    // No request is prepared and no abort controller is registered, so the
    // running answer keeps streaming untouched.
    expect(mocks.resolveChatModelClient).not.toHaveBeenCalled()
    expect(mocks.runCompletion).not.toHaveBeenCalled()
    expect(registerAbortController).not.toHaveBeenCalled()
    expect(result.current.handleStreamActive).toBe(false)
  })

  it('streams the prompt once nothing else is running', async () => {
    const { result, registerAbortController } = setup(() => false)

    await act(async () => {
      await result.current.startHandleStream(input)
    })

    expect(mocks.runCompletion).toHaveBeenCalledTimes(1)
    expect(mocks.runCompletion.mock.calls[0][0].request.messages).toEqual([
      { role: 'system', content: 'system prompt' },
      { role: 'user', content: 'file prompt' },
    ])
    expect(registerAbortController).toHaveBeenCalledTimes(1)
    expect(result.current.handleStreamActive).toBe(false)
  })

  it('does not start when the model cannot be resolved', async () => {
    mocks.resolveChatModelClient.mockReturnValue(null)
    const { result, registerAbortController } = setup(() => false)

    await act(async () => {
      await result.current.startHandleStream(input)
    })

    expect(mocks.runCompletion).not.toHaveBeenCalled()
    expect(registerAbortController).not.toHaveBeenCalled()
    expect(result.current.handleStreamActive).toBe(false)
  })
})
