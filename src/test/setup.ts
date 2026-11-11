import { cleanup } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { afterEach, vi } from 'vitest'

// Vitest runs without `globals`, so Testing Library cannot register its own
// auto-cleanup and the mounted trees would leak between tests.
afterEach(() => {
  cleanup()
})

// Lexical and Radix touch browser observers while mounting. Component tests
// opt into a DOM environment per file; these stubs keep the node environment
// safe for any module that merely references them.
if (typeof globalThis.ResizeObserver === 'undefined') {
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe(): void {}
      unobserve(): void {}
      disconnect(): void {}
    },
  )
}

if (typeof globalThis.matchMedia === 'undefined') {
  vi.stubGlobal('matchMedia', () => ({
    matches: false,
    addEventListener: () => {},
    removeEventListener: () => {},
  }))
}
