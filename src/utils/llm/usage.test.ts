import { describe, expect, it } from 'vitest'

import { EMPTY_USAGE, mergeUsage, toUsage } from './usage'

describe('toUsage', () => {
  it('keeps only the two counters and drops provider extras', () => {
    expect(
      toUsage({
        prompt_tokens: 3,
        completion_tokens: 4,
        total_tokens: 7,
        prompt_tokens_details: { cached_tokens: 1 },
      } as never),
    ).toEqual({ prompt_tokens: 3, completion_tokens: 4 })
  })

  it('falls back to zeros for a missing or partial payload', () => {
    expect(toUsage(undefined)).toEqual(EMPTY_USAGE)
    expect(toUsage(null)).toEqual(EMPTY_USAGE)
    expect(toUsage({ completion_tokens: 2 })).toEqual({
      prompt_tokens: 0,
      completion_tokens: 2,
    })
  })

  it('never returns the shared constant itself', () => {
    const usage = toUsage(undefined)

    usage.prompt_tokens = 99

    expect(EMPTY_USAGE.prompt_tokens).toBe(0)
  })
})

describe('mergeUsage', () => {
  it('folds a later report into the running total', () => {
    expect(
      mergeUsage(
        { prompt_tokens: 3, completion_tokens: 4 },
        {
          prompt_tokens: 5,
          completion_tokens: 6,
        },
      ),
    ).toEqual({ prompt_tokens: 5, completion_tokens: 6 })
  })

  it('keeps the earlier values when a chunk carries no usage', () => {
    const current = { prompt_tokens: 3, completion_tokens: 4 }

    expect(mergeUsage(current, undefined)).toEqual(current)
  })

  it('fills a missing side without resetting the other', () => {
    expect(
      mergeUsage(
        { prompt_tokens: 3, completion_tokens: 4 },
        {
          completion_tokens: 9,
        },
      ),
    ).toEqual({ prompt_tokens: 3, completion_tokens: 9 })
  })
})
