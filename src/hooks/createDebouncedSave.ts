import debounce from 'lodash.debounce'

export type DebouncedSave<T> = {
  call: (id: string, items: T[]) => Promise<void>
  flush: () => Promise<void>
  /** Drops a pending write, e.g. after the data it belongs to was deleted. */
  cancel: () => void
}

/**
 * Debounces writes while still returning a promise per call.
 * A superseded call resolves without writing (the newer call owns the write),
 * so awaiting callers never hang and never see a stale error.
 */
export function createDebouncedSave<T>(
  save: (id: string, items: T[]) => Promise<void>,
): DebouncedSave<T> {
  let pendingResolve: (() => void) | null = null
  let pendingReject: ((error: unknown) => void) | null = null

  const settlePending = () => {
    pendingResolve?.()
    pendingResolve = null
    pendingReject = null
  }

  const run = async (id: string, items: T[]) => {
    const resolve = pendingResolve
    const reject = pendingReject
    pendingResolve = null
    pendingReject = null
    try {
      await save(id, items)
      resolve?.()
    } catch (error) {
      if (reject) reject(error)
      else throw error
    }
  }

  const debounced = debounce(run, 300, { maxWait: 1000 })

  return {
    call: (id, items) => {
      // A newer call supersedes the pending one; resolve it so its awaiter
      // does not hang forever.
      settlePending()
      return new Promise<void>((resolve, reject) => {
        pendingResolve = resolve
        pendingReject = reject
        void debounced(id, items)
      })
    },
    flush: () => {
      // `run` settles the pending promise itself once the write completes, so
      // awaiting the debounced result waits for the actual write.
      return Promise.resolve(debounced.flush())
    },
    cancel: () => {
      settlePending()
      debounced.cancel()
    },
  }
}
