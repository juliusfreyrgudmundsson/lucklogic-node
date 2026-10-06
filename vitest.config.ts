import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    // tests/live talks to a real API and runs only through `npm run test:live`.
    exclude: process.env.LUCKLOGIC_LIVE ? [] : ['tests/live/**'],
  },
});
