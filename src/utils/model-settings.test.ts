import { beforeEach, describe, expect, it, vi } from 'vitest'

import { buildModelRequest, sanitizeModelSettings } from './model-settings'

describe('sanitizeModelSettings', () => {
  it('keeps valid values and clamps them to their allowed range', () => {
    expect(
      sanitizeModelSettings({
        temperature: 2.789,
        topP: -0.5,
        contextCount: 0,
        maxTokens: 0.9,
      }),
    ).toEqual({
      temperature: 2,
      topP: 0,
      contextCount: 1,
      maxTokens: 1,
      customParameters: [],
    })
  })

  it('truncates to two decimals instead of rounding', () => {
    const result = sanitizeModelSettings({ temperature: 0.999, topP: 0.999 })
    expect(result.temperature).toBe(0.99)
    expect(result.topP).toBe(0.99)
  })

  it('drops non-numeric values instead of sending NaN', () => {
    const result = sanitizeModelSettings({
      temperature: Number.NaN,
      topP: Number.NaN,
      contextCount: 5,
    })

    expect(result).not.toHaveProperty('temperature')
    expect(result).not.toHaveProperty('topP')
    expect(result.contextCount).toBe(5)
  })

  it('clamps infinities to the configured bounds', () => {
    const result = sanitizeModelSettings({
      temperature: Number.POSITIVE_INFINITY,
      topP: Number.POSITIVE_INFINITY,
    })

    expect(result.temperature).toBe(2)
    expect(result.topP).toBe(1)
  })

  it('normalizes custom parameters and defaults to an empty list', () => {
    expect(
      sanitizeModelSettings({ customParameters: [' a ', '', '  ', 'b'] })
        .customParameters,
    ).toEqual(['a', 'b'])
    expect(sanitizeModelSettings({}).customParameters).toEqual([])
  })
})

describe('buildModelRequest', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('defaults to streaming and maps the API field names', () => {
    const { baseRequest } = buildModelRequest(
      { id: 'gpt-4o-mini' },
      {
        temperature: 0.5,
        topP: 0.8,
        maxTokens: 100,
      },
      [],
    )

    expect(baseRequest).toEqual({
      stream: true,
      model: 'gpt-4o-mini',
      messages: [],
      temperature: 0.5,
      top_p: 0.8,
      max_tokens: 100,
    })
  })

  it('honors an explicit streamOutput=false', () => {
    const { baseRequest } = buildModelRequest(
      { id: 'm' },
      {
        streamOutput: false,
      },
      [],
    )
    expect(baseRequest.stream).toBe(false)
  })

  it('merges custom parameters as top-level request fields', () => {
    const { baseRequest } = buildModelRequest(
      { id: 'm' },
      {
        customParameters: ['"thinking": {"type":"disabled"}', '{"top_k": 5}'],
      },
      [],
    )

    expect(baseRequest.thinking).toEqual({ type: 'disabled' })
    expect(baseRequest.top_k).toBe(5)
  })

  it('lets custom parameters override generated fields', () => {
    const { baseRequest } = buildModelRequest(
      { id: 'm' },
      {
        maxTokens: 10,
        customParameters: ['"max_tokens": 999'],
      },
      [],
    )

    expect(baseRequest.max_tokens).toBe(999)
  })

  it('ignores invalid custom parameters and keeps the rest', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const { baseRequest } = buildModelRequest(
      { id: 'm' },
      {
        customParameters: ['not json at all', '{"valid": true}'],
      },
      [],
    )

    expect(baseRequest.valid).toBe(true)
    expect(warn).toHaveBeenCalled()
  })
})
