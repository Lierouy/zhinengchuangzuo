import { describe, expect, it, vi } from 'vitest'

import { parseZhinengchuangzuoSettings } from './settings'

const validProvider = {
  id: 'p1',
  type: 'openai-compatible',
  baseUrl: 'https://example.com/v1',
}

const validModel = {
  providerType: 'openai-compatible',
  providerId: 'p1',
  id: 'm1',
  model: 'gpt-4o-mini',
}

/** `enable` is filled in by the schema, so every parsed model carries it. */
const parsedModel = { ...validModel, enable: true }

describe('parseZhinengchuangzuoSettings', () => {
  it('falls back to defaults for a non-object input', () => {
    const parsed = parseZhinengchuangzuoSettings('not settings')

    expect(parsed.version).toBe(17)
    expect(parsed.providers).toEqual([])
    expect(parsed.chatModels).toEqual([])
    expect(parsed.chatModelId).toBe('')
    expect(parsed.promptActivationLimit).toBeNull()
    expect(parsed.chatOptions).toEqual({ includeCurrentFileContent: true })
  })

  it('keeps valid providers and models', () => {
    const parsed = parseZhinengchuangzuoSettings({
      providers: [validProvider],
      chatModels: [validModel],
      chatModelId: 'gpt-4o-mini',
    })

    expect(parsed.providers).toEqual([validProvider])
    expect(parsed.chatModels).toEqual([parsedModel])
    expect(parsed.chatModelId).toBe('gpt-4o-mini')
  })

  it('drops only the broken provider instead of wiping the array', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})

    const parsed = parseZhinengchuangzuoSettings({
      providers: [validProvider, { id: 'broken' }],
      chatModels: [validModel],
    })

    expect(parsed.providers).toEqual([validProvider])
    expect(parsed.chatModels).toEqual([parsedModel])
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('Dropped 1 invalid provider'),
    )
    warn.mockRestore()
  })

  it('drops only the broken chat model', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})

    const parsed = parseZhinengchuangzuoSettings({
      providers: [validProvider],
      chatModels: [validModel, { ...validModel, providerType: 'unknown' }],
    })

    expect(parsed.chatModels).toEqual([parsedModel])
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('Dropped 1 invalid chat model'),
    )
    warn.mockRestore()
  })

  it('falls back to the current version for an unknown one', () => {
    expect(parseZhinengchuangzuoSettings({ version: 2 }).version).toBe(17)
    expect(parseZhinengchuangzuoSettings({ version: 'x' }).version).toBe(17)
  })

  it('keeps other fields when a numeric limit is malformed', () => {
    const parsed = parseZhinengchuangzuoSettings({
      handleMaxLinks: 'many',
      handleMaxChars: 400,
      chatModelId: 'gpt-4o-mini',
    })

    expect(parsed.handleMaxLinks).toBeUndefined()
    expect(parsed.handleMaxChars).toBe(400)
    expect(parsed.chatModelId).toBe('gpt-4o-mini')
  })

  it('falls back per field inside chatOptions', () => {
    const parsed = parseZhinengchuangzuoSettings({
      chatOptions: { includeCurrentFileContent: 'yes', chatMaxFileChars: 12 },
    })

    expect(parsed.chatOptions.includeCurrentFileContent).toBe(true)
    expect(parsed.chatOptions.chatMaxFileChars).toBe(12)
  })

  it('keeps a valid prompt activation limit and the selected ids', () => {
    const parsed = parseZhinengchuangzuoSettings({
      selectedPromptGroupId: 'g1',
      promptActivationLimit: 5,
      handlePromptId: 't1',
    })

    expect(parsed.selectedPromptGroupId).toBe('g1')
    expect(parsed.promptActivationLimit).toBe(5)
    expect(parsed.handlePromptId).toBe('t1')
  })
})
