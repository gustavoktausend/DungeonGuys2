import { defineConfig, defaultExclude } from 'vitest/config';

// Node runner. cross-engine.test.ts is excluded on purpose: it only proves
// something when run against real browser engines (vitest.browser.config.ts).
// Passing it under Node would be false confidence, not coverage.
export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    // `css: false` (the default) replaces every CSS module with an empty
    // string to skip the transform — and it does that by matching the file
    // extension, so it swallows `?raw` too. build-base.test.ts reads
    // src/style.css as raw text to prove the @font-face blocks are there and
    // self-hosted; with the default it would read '' and pass by vacuity.
    // Only that one test imports CSS, so the cost is a single transform.
    css: true,
    exclude: [...defaultExclude, 'tests/cross-engine.test.ts'],
  },
});
