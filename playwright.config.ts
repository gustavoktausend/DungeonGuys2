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
// do, since the runner keeps it alive for the whole session. The room specs of
// tests/net/ own theirs for the same reason and one more: theirs also carries
// the signalling leg, and killing the origin is how the "quem criou a sala
// saiu" path gets exercised.
//
// TWO PROJECTS, ONE PER DIRECTORY, AND THE DECISION IS DELIBERATE.
// 03-VALIDATION.md left the wiring of the room specs open, and the answer is
// two projects with their own `testDir` rather than one project over a widened
// directory: `npm run test:pwa` has to keep meaning exactly the PWA gate that
// 02-VALIDATION.md and the CI job refer to, and a single project would have
// silently changed what that command proves. The two share every option below,
// which is what says they are two halves of one gate rather than two gates.
//
// `fullyParallel: false` AND `workers: 1` NOW COVER BOTH, and the reason is the
// same one written a different way. The PWA specs share an origin's Cache
// Storage; the room specs share an origin, a signalling process and a `Map` of
// rooms that lives in memory — so two of them at once would each be looking at
// the other's rooms, and a code drawn by one could be joined by the other.
// Serial is not lost speed here either; it is the only way the assertions mean
// anything.
export default defineConfig({
  testMatch: '**/*.spec.ts',

  fullyParallel: false,
  workers: 1,

  reporter: 'list',

  use: {
    // Never 'block' — it would silently turn the PWA half into a test of
    // nothing, since every assertion there is about a service worker. The room
    // specs load the same built client, which registers one on boot.
    serviceWorkers: 'allow',
  },

  projects: [
    { name: 'pwa', testDir: 'tests/pwa', use: { ...devices['Desktop Chrome'] } },
    {
      name: 'net',
      testDir: 'tests/net',
      use: { ...devices['Desktop Chrome'] },
      // The default 30 s is a PWA-shaped budget and the room spec does not fit
      // it: one test opens three browser contexts, boots the client in each,
      // completes two ICE negotiations and waits for two seconds of relayed
      // ping summaries before it can assert on a measured route. Raised here
      // rather than globally so the PWA half keeps its tight budget — a spec
      // that starts taking a minute there is a regression, not a long test.
      timeout: 120_000,
    },
  ],
});
