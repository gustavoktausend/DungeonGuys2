import tseslint from 'typescript-eslint';

export default tseslint.config(
  // 'dist' is anchored at the repo root in flat config — it does NOT match a
  // nested one — so 'packages/*/dist' is needed for the lib bundles (the
  // @dg2/sim artifact whose sha256 is SIM_VERSION). Linting minified output is
  // meaningless: it reports ~92 no-unused-expressions on esbuild's comma
  // operators, none of which is a defect in the source.
  // tests/pwa/fixtures is the same kind of thing as 'dist' and for the same
  // reason: it IS a dist, frozen byte for byte (plan 02-05), so it carries the
  // very minified bundle the sentence above is about — 279 errors, none of
  // them a defect in any source file. Linting it would also be worse than
  // useless: an autofix there would rewrite the frozen artifact, which is the
  // one thing tests/build-base.test.ts exists to prevent.
  // 'dist-server' is the third instance of the same thing: the esbuild bundle
  // of apps/server, which inlines hono and kysely and reports 38 errors from
  // THEIR source, not from ours. The bare 'dist' entry does not cover it —
  // measured, 38 errors — because flat-config ignores match by path segment.
  // apps/server/src, the actual input, stays linted; see the block below.
  //
  // WHAT IS NO LONGER HERE: 'tools' and 'public'. Every entry above is a build
  // OUTPUT, and those two were inputs — the only two, which is why they never
  // fit the sentence the rest of this comment is making.
  //
  //   tools/ was excused as "build scaffolding that never ships", and two of
  //   its files contradict that in writing. tools/ops/restore-verify.mjs runs
  //   ON the VPS: ops/README.md §11 documents it as an operator command, and
  //   it shells out to litestream and sqlite3 over the live ledger. It is
  //   product code that runs in front of a real database on a real box, by the
  //   very definition the block below uses to justify linting apps/server —
  //   and it was unlinted. tools/sw/emit.mjs writes the precache of the
  //   published service worker, where a mistake surfaces offline, weeks later,
  //   with nothing to correlate.
  //
  //   'public' was in the list with NO justification at all, and public/sw.js
  //   is the shipped service worker: the client file this phase spent the most
  //   effort on, carrying the cache-poisoning and /api/ isolation logic. It is
  //   also the only script under public/ — the rest is fonts, icons, art and a
  //   manifest, none of which ESLint would look at anyway — so no carve-out
  //   pattern is needed to reach it, and the simplest change is the whole
  //   change.
  //
  // COST, MEASURED before making the change and not predicted: nine files come
  // into scope (eight .mjs of tools/ plus public/sw.js) and they report ZERO
  // errors and ZERO warnings under this configuration. The review that raised
  // this expected "a handful of findings on first run"; there are none. Part
  // of why is worth writing down, because it is a loaded gun rather than good
  // news: this config extends typescript-eslint's `recommended` and NOT
  // @eslint/js's, so `no-undef` is not among the enabled rules. That is what
  // lets public/sw.js name `self`, `caches` and `clients` without a
  // service-worker globals block. Adding `js.configs.recommended` one day
  // therefore means adding `languageOptions.globals` for that file in the same
  // commit — declaring the globals NOW would be configuration for a rule that
  // is not enabled, which is the kind of thing that outlives its reason.
  //
  // tests/lint-coverage.test.ts is the executable half: it asks ESLint itself,
  // through isPathIgnored, which files this list reaches. An `ignores` entry
  // is the one part of a lint configuration whose failure mode is silence — a
  // broken rule turns something red, a widened ignore turns nothing red ever
  // again.
  { ignores: ['dist', 'dist-server', 'packages/*/dist', 'node_modules', 'tests/pwa/fixtures'] },
  ...tseslint.configs.recommended,
  {
    // apps/server/src is linted, and its ABSENCE from the `ignores` above is
    // the decision, not an oversight: it is product code that runs in front of
    // a real database on a real box, so it gets the same recommended rules as
    // src/ and packages/. This sentence used to draw the contrast against
    // tools/, "build scaffolding that never ships" — and tools/ops/ met every
    // word of the description on THIS side of the contrast, which is what
    // WR-22 found. The distinction the sentence was reaching for is between
    // source and build output, and that is what the list above now draws.
    //
    // This block therefore adds no rules at all. It exists to record the other
    // half: NONE of the purity restrictions written for packages/sim below
    // apply here, and none of them should. The server is supposed to read the
    // wall clock, open files, listen on a socket and reach for `process` — a
    // rule forbidding those would be forbidding the entire reason the process
    // exists. Determinism is a property of the simulation, not of the host.
    files: ['apps/server/src/**/*.ts'],
  },
  {
    // sim/ must stay pure: no I/O, no DOM, no wall-clock, no unseeded randomness.
    files: ['packages/sim/src/**/*.ts'],
    rules: {
      'no-restricted-globals': ['error',
        { name: 'window',                 message: 'sim/ is pure — see plan T1-T6' },
        { name: 'document',               message: 'sim/ is pure — emit an event instead (T5)' },
        { name: 'navigator',              message: 'sim/ is pure — see plan T1-T6' },
        { name: 'localStorage',           message: 'sim/ is pure — pass values via RunConfig (T5)' },
        { name: 'performance',            message: 'use world.tick (T4)' },
        { name: 'requestAnimationFrame',  message: 'sim/ is pure — the loop lives in app/' },
        { name: 'setTimeout',             message: 'sim/ is pure — use world.tick (T4)' },
        { name: 'setInterval',            message: 'sim/ is pure — use world.tick (T4)' },
      ],
      // D-01: the engine's transcendental functions are implementation-
      // approximated, so Chromium, Firefox, WebKit and Node may each return
      // different bits for the same angle — measured on this simulation in
      // plan 01-04, three fingerprints across four engines. sim/math.ts holds
      // bit-exact ports of the three the game actually needs; the other five
      // are listed so the next one to be reached for is refused at the door
      // instead of being discovered by a desynchronised co-op session.
      'no-restricted-properties': ['error',
        { object: 'Math', property: 'random', message: 'use world.rng (T3)' },
        { object: 'Date', property: 'now',    message: 'use world.tick (T4)' },
        { object: 'Math', property: 'sin',    message: 'use sin from sim/math.ts — the engine version is implementation-approximated (D-01)' },
        { object: 'Math', property: 'cos',    message: 'use cos from sim/math.ts — the engine version is implementation-approximated (D-01)' },
        { object: 'Math', property: 'atan2',  message: 'use atan2 from sim/math.ts — the engine version is implementation-approximated (D-01)' },
        { object: 'Math', property: 'tan',    message: 'no bit-exact port exists yet — add one to sim/math.ts before using it (D-01)' },
        { object: 'Math', property: 'pow',    message: 'no bit-exact port exists yet — use repeated multiplication, or add one to sim/math.ts (D-01)' },
        { object: 'Math', property: 'exp',    message: 'no bit-exact port exists yet — add one to sim/math.ts before using it (D-01)' },
        { object: 'Math', property: 'log',    message: 'no bit-exact port exists yet — add one to sim/math.ts before using it (D-01)' },
        { object: 'Math', property: 'hypot',  message: 'use Math.sqrt(dx * dx + dy * dy) — the spec pins sqrt to IEEE-754, hypot it does not (D-01)' },
      ],
      // packages/sim/src/math.ts — the replacement itself — gets NO override,
      // and the absence is the point. The rule matches the member expression
      // `Math.<name>`, never a bare identifier, so the module's own `export
      // function sin` and its internal calls are already out of reach; only a
      // literal `Math.sin` inside it would trip, and that is exactly the thing
      // that must never exist there. An exemption block would open the hole in
      // the one file where it costs the most: math.ts silently delegating to
      // the engine would keep every test green while giving back the very
      // divergence the port was written to remove.
      // The patterns are gitignore-style: '**/render/**' requires a segment
      // AFTER 'render/', so a bare-directory import (`from '../render'`)
      // slips past it. The '**/render' forms close that hole.
      // tests/purity.test.ts asserts the same rule independently.
      'no-restricted-imports': ['error', {
        patterns: [
          '**/render/**', '**/ui/**', '**/app/**',
          '**/render', '**/ui', '**/app',
        ],
      }],
    },
  },
);
