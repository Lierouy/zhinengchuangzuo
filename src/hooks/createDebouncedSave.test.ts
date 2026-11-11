import { afterEach, describe, expect, it, vi } from 'vitest'

import { createDebouncedSave } from './createDebouncedSave'

describe('createDebouncedSave', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('writes once after the debounce window', async () => {
    vi.useFakeTimers()
    const save = vi.fn(async () => {})
    const debounced = createDebouncedSave<number>(save)

    const promise = debounced.call('chat-1', [1])
    await vi.advanceTimersByTimeAsync(299)
    expect(save).not.toHaveBeenCalled()

    await vi.advanceTimersByTimeAsync(1)
    await promise

    expect(save).toHaveBeenCalledTimes(1)
    expect(save).toHaveBeenCalledWith('chat-1', [1])
  })

  it('lets a newer call supersede the pending one without hanging it', async () => {
    vi.useFakeTimers()
    const save = vi.fn(async () => {})
    const debounced = createDebouncedSave<number>(save)

    const first = debounced.call('chat-1', [1])
    const second = debounced.call('chat-1', [2])

    await expect(first).resolves.toBeUndefined()
    await vi.advanceTimersByTimeAsync(300)
    await second

    expect(save).toHaveBeenCalledTimes(1)
    expect(save).toHaveBeenCalledWith('chat-1', [2])
  })

  it('flushes a pending write immediately', async () => {
    vi.useFakeTimers()
    const save = vi.fn(async () => {})
    const debounced = createDebouncedSave<number>(save)

    const promise = debounced.call('chat-1', [1])
    await debounced.flush()
    await promise

    expect(save).toHaveBeenCalledWith('chat-1', [1])
  })

  it('drops a pending write on cancel but resolves the caller', async () => {
    vi.useFakeTimers()
    const save = vi.fn(async () => {})
    const debounced = createDebouncedSave<number>(save)

    const promise = debounced.call('chat-1', [1])
    debounced.cancel()

    await expect(promise).resolves.toBeUndefined()
    await vi.advanceTimersByTimeAsync(1_000)
    expect(save).not.toHaveBeenCalled()
  })

  it('propagates a write failure to the pending caller', async () => {
    vi.useFakeTimers()
    const save = vi.fn(async () => {
      throw new Error('disk full')
    })
    const debounced = createDebouncedSave<number>(save)

    const promise = debounced.call('chat-1', [1])
    const expectation = expect(promise).rejects.toThrow('disk full')

    await vi.advanceTimersByTimeAsync(300)
    await expectation
  })

  it('writes at most once per maxWait window under constant input', async () => {
    vi.useFakeTimers()
    const save = vi.fn(async () => {})
    const debounced = createDebouncedSave<number>(save)

    for (let index = 0; index < 5; index++) {
      void debounced.call('chat-1', [index])
      await vi.advanceTimersByTimeAsync(200)
    }

    expect(save).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(400)
  })
})
