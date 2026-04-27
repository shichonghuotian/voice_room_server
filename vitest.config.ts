import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    // Run test files sequentially to avoid SQLite conflicts
    pool: 'forks',
    poolOptions: {
      forks: {
        singleFork: true,
      },
    },
  },
  // Tell Vite not to try to bundle Node built-in modules
  resolve: {
    conditions: ['node'],
  },
  optimizeDeps: {
    exclude: ['node:sqlite'],
  },
  ssr: {
    noExternal: [],
  },
});
