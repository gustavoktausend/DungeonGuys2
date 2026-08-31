import { defineConfig } from 'vitest/config';
import { playwright } from '@vitest/browser-playwright';

// The cross-engine determinism gate: the same hashWorld in Chromium, Firefox
// and WebKit. browser.instances (not test.workspace, not separate projects)
// makes the engine name the Vitest project name, so a failure already reads
// "webkit > determinismo entre motores" without extra plumbing.
export default defineConfig({
  test: {
    include: ['tests/cross-engine.test.ts'],
    browser: {
      enabled: true,
      provider: playwright(),
      headless: true,
      instances: [
        { browser: 'chromium' },
        { browser: 'firefox' },
        { browser: 'webkit' },
      ],
    },
  },
});
