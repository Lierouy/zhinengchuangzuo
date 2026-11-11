import { describe, expect, it } from 'vitest'

import {
  MENTION_TRIGGER,
  TEMPLATE_TRIGGER,
  isOtherTriggerActive,
} from './typeahead-triggers'

describe('isOtherTriggerActive', () => {
  it('ignores the trigger owned by the caller', () => {
    expect(isOtherTriggerActive('hello @note', MENTION_TRIGGER)).toBe(false)
    expect(isOtherTriggerActive('/template', TEMPLATE_TRIGGER)).toBe(false)
  })

  it('detects another trigger at the start of the input', () => {
    expect(isOtherTriggerActive('@note', TEMPLATE_TRIGGER)).toBe(true)
    expect(isOtherTriggerActive('/template', MENTION_TRIGGER)).toBe(true)
  })

  it('detects another trigger after whitespace or an opening paren', () => {
    expect(isOtherTriggerActive('see @note', TEMPLATE_TRIGGER)).toBe(true)
    expect(isOtherTriggerActive('say\n/template', MENTION_TRIGGER)).toBe(true)
    expect(isOtherTriggerActive('(@note)', TEMPLATE_TRIGGER)).toBe(true)
  })

  it('ignores a trigger glued to other characters', () => {
    expect(isOtherTriggerActive('mail@host', TEMPLATE_TRIGGER)).toBe(false)
    expect(isOtherTriggerActive('a/b', MENTION_TRIGGER)).toBe(false)
  })

  it('ignores a finished trigger followed by whitespace', () => {
    expect(isOtherTriggerActive('/template ', MENTION_TRIGGER)).toBe(false)
    expect(isOtherTriggerActive('@note next', TEMPLATE_TRIGGER)).toBe(false)
  })

  it('only reports the most recent active trigger', () => {
    // The `/` menu is already closed by the space, the `@` menu is open.
    expect(isOtherTriggerActive('/template @note', TEMPLATE_TRIGGER)).toBe(true)
    expect(isOtherTriggerActive('/template @note', MENTION_TRIGGER)).toBe(false)
  })

  it('treats the trigger character literally', () => {
    // No trigger escapes are supported, but a lone character must not throw.
    expect(isOtherTriggerActive('(', MENTION_TRIGGER)).toBe(false)
    expect(isOtherTriggerActive('', MENTION_TRIGGER)).toBe(false)
  })
})
