import { defineConfig, devices } from '@playwright/test';

// The PWA gate (INFRA-02, INFRA-03). A config of its own, for the same reason
// vitest.browser.config.ts is a file of its own: the shape is dictated by what
// the gate has to prove, and this comment is where that reasoning is kept.
//
// ONE browser, deliberately. Playwright only supports service workers in
// Chromium, so listing Firefox and WebKit here would not widen coverage — it
// would manufacture two green projects that never registered a worker at all.
// That widens the gap D2-11 already accepted: not just "no real iOS/Safari
// device", but "no service worker outside Chromium, not even on desktop CI".
// The widening is recorded in 02-VALIDATION.md § Lacuna; it is a decision,
// not something discovered here.
//
// NO globally managed dev server either. Each spec builds and destroys its own
// through tests/pwa/helpers.ts, because offline.spec.ts has to KILL it in the
// middle of the test — which a server owned by the runner cannot be asked to
// do, since the runner keeps it alive for the whole session.
export default defineConfig({
  testDir: 'tests/pwa',
  testMatch: '**/*.spec.ts',

  // The specs register service workers on the same origin, and Cache Storage
  // is per ORIGIN, not per scope: two specs at once would see each other's
  // caches and each other's workers. Serial here is not lost speed, it is the
  // only way the assertions mean anything.
  fullyParallel: false,
  workers: 1,

  reporter: 'list',

  use: {
    // Never 'block' — it would silently turn the whole suite into a test of
    // nothing, since every assertion below is about a service worker.
    serviceWorkers: 'allow',
  },

  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
});
