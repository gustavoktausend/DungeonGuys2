import { defineConfig, defaultExclude } from 'vitest/config';

// Node runner. cross-engine.test.ts is excluded on purpose: it only proves
// something when run against real browser engines (vitest.browser.config.ts).
// Passing it under Node would be false confidence, not coverage.
export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    exclude: [...defaultExclude, 'tests/cross-engine.test.ts'],
  },
});
