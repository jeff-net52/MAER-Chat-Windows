import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    pool: 'threads',
    fileParallelism: false,
    maxWorkers: 1,
    minWorkers: 1,
    testTimeout: 10_000,
    hookTimeout: 10_000,
    restoreMocks: true,
  },
})
