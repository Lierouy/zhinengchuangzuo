import { describe, expect, it } from 'vitest'

import { formatTimestamp } from './LLMResponseInfoPopover'

describe('formatTimestamp', () => {
  it('formats a local timestamp on a 24-hour clock, down to the second', () => {
    // Built from local parts so the assertion does not depend on the time zone.
    const timestamp = new Date(2026, 10, 14, 23, 52, 4).getTime()

    expect(formatTimestamp(timestamp)).toBe('2026-11-14 | 23:52:04')
  })

  it('pads single-digit parts', () => {
    const timestamp = new Date(2026, 0, 5, 9, 8, 7).getTime()

    expect(formatTimestamp(timestamp)).toBe('2026-01-05 | 09:08:07')
  })

  it('keeps midnight on the 24-hour clock', () => {
    const timestamp = new Date(2026, 0, 1, 0, 0, 0).getTime()

    expect(formatTimestamp(timestamp)).toBe('2026-01-01 | 00:00:00')
  })
})
