import { fileURLToPath } from 'node:url'

import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: {
    alias: {
      // The npm package only ships type declarations (`main` is an empty
      // string), so every runtime import has to be redirected to our stub.
      obsidian: fileURLToPath(
        new URL('./src/test/mocks/obsidian.ts', import.meta.url),
      ),
    },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.{ts,tsx}'],
    setupFiles: ['./src/test/setup.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.{ts,tsx}'],
      exclude: [
        'src/**/*.test.{ts,tsx}',
        'src/test/**',
        'src/main.ts',
        'src/ChatView.tsx',
      ],
      reporter: ['text', 'html'],
    },
  },
})
