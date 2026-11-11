import { beforeEach, describe, expect, it } from 'vitest'

import type { ZhinengchuangzuoSettings } from '../../settings/schema/setting.types'
import { createFakeApp } from '../../test/fakes/fakeApp'
import { Notice } from '../../test/mocks/obsidian'

import {
  getChatModelProblem,
  isChatModelEnabled,
  notifyChatModelProblem,
  resolveChatModelClient,
  resolveProviderApiKey,
  syncModelsProviderType,
} from './chatModel'

const settings = (
  overrides: Partial<ZhinengchuangzuoSettings> = {},
): ZhinengchuangzuoSettings => ({
  version: 17,
  providers: [],
  chatModels: [],
  chatModelId: '',
  selectedPromptGroupId: '',
  promptActivationLimit: null,
  handlePromptId: '',
  chatOptions: { includeCurrentFileContent: true },
  ...overrides,
})

const openAIProvider = {
  id: 'p1',
  type: 'openai-compatible' as const,
  baseUrl: 'https://example.com/v1',
}

const openAIModel = {
  providerType: 'openai-compatible' as const,
  providerId: 'p1',
  id: 'm1',
  model: 'gpt-4o-mini',
}

describe('isChatModelEnabled', () => {
  it('treats a missing flag as enabled', () => {
    expect(isChatModelEnabled(openAIModel)).toBe(true)
    expect(isChatModelEnabled({ ...openAIModel, enable: false })).toBe(false)
  })
})

describe('getChatModelProblem', () => {
  it('reports a missing selection', () => {
    expect(getChatModelProblem(settings())).toBe('not-selected')
  })

  it('reports a disabled model before anything else', () => {
    const configured = settings({
      providers: [openAIProvider],
      chatModels: [{ ...openAIModel, enable: false }],
      chatModelId: 'gpt-4o-mini',
    })

    expect(getChatModelProblem(configured)).toBe('disabled')
  })

  it('reports a model whose provider was deleted', () => {
    const configured = settings({
      chatModels: [openAIModel],
      chatModelId: 'gpt-4o-mini',
    })

    expect(getChatModelProblem(configured)).toBe('missing-provider')
  })

  it('returns null when the model is usable', () => {
    const configured = settings({
      providers: [openAIProvider],
      chatModels: [openAIModel],
      chatModelId: 'gpt-4o-mini',
    })

    expect(getChatModelProblem(configured)).toBeNull()
  })
})

describe('notifyChatModelProblem', () => {
  beforeEach(() => {
    Notice.messages.length = 0
  })

  it('surfaces a message for every problem', () => {
    notifyChatModelProblem('not-selected')
    notifyChatModelProblem('disabled')
    notifyChatModelProblem('missing-provider')

    expect(Notice.messages).toHaveLength(3)
    expect(Notice.messages.every((message) => message.length > 0)).toBe(true)
  })
})

describe('syncModelsProviderType', () => {
  it('updates only the models of the edited provider', () => {
    const anchor = { ...openAIModel, id: 'm1' }
    const other = { ...openAIModel, id: 'm2', providerId: 'p2' }

    const result = syncModelsProviderType(
      [anchor, other],
      'p1',
      'anthropic-compatible',
    )

    expect(result[0].providerType).toBe('anthropic-compatible')
    expect(result[1]).toBe(other)
  })

  it('keeps object identity when nothing changes', () => {
    const model = { ...openAIModel }
    const result = syncModelsProviderType([model], 'p1', 'openai-compatible')

    expect(result[0]).toBe(model)
  })
})

describe('resolveProviderApiKey', () => {
  it('reads the secret by id and tolerates a missing value', () => {
    const { app, secrets } = createFakeApp()
    secrets.set('secret-p1', 'sk-test')

    expect(
      resolveProviderApiKey(app, { ...openAIProvider, apiKey: 'secret-p1' }),
    ).toBe('sk-test')
    expect(
      resolveProviderApiKey(app, { ...openAIProvider, apiKey: undefined }),
    ).toBe('')
    expect(
      resolveProviderApiKey(app, { ...openAIProvider, apiKey: 'unknown' }),
    ).toBe('')
  })
})

describe('resolveChatModelClient', () => {
  beforeEach(() => {
    Notice.messages.length = 0
  })

  it('returns null and notifies when the model is not usable', () => {
    const { app } = createFakeApp()

    expect(resolveChatModelClient(settings(), app)).toBeNull()
    expect(Notice.messages).toHaveLength(1)
  })

  it('builds a client for a configured model', () => {
    const { app, secrets } = createFakeApp()
    secrets.set('secret-p1', 'sk-test')
    const configured = settings({
      providers: [{ ...openAIProvider, apiKey: 'secret-p1' }],
      chatModels: [openAIModel],
      chatModelId: 'gpt-4o-mini',
    })

    const resolved = resolveChatModelClient(configured, app)

    expect(resolved).not.toBeNull()
    expect(resolved?.model).toEqual(openAIModel)
    expect(typeof resolved?.providerClient.generateResponse).toBe('function')
    expect(typeof resolved?.providerClient.streamResponse).toBe('function')
  })
})
