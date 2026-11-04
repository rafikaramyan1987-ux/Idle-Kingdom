import { defineConfig } from 'vitest/config';

export default defineConfig({
  define: { __CRAZYGAMES__: 'false' },
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
  },
});
