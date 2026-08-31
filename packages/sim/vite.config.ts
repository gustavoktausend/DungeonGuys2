// packages/sim/vite.config.ts — byte-for-byte reproducibility is a REQUIREMENT
// here, not a nicety: the sha256 of the emitted bundle IS the SIM_VERSION (D-07).
// A build that emits different bytes for the same source would close the ranking
// season at random, so every option below is chosen to remove a source of drift:
//   - `sourcemap: false` — a sourcemap embeds absolute paths, and a path is not
//     portable between two machines that must agree on one hash.
//   - `minify: true` — esbuild's output is a pure function of the input.
//   - `emptyOutDir: true` — a stale sibling file must never survive into dist/.
//   - one entry, `formats: ['es']`, fixed `fileName` — no hashed name, no
//     variant, no chance of hashing the wrong artifact.
// Measured on Vite 5.4.21 during research: three consecutive builds produced
// byte-identical output (55425 B, same sha256) with zero absolute paths in the
// bundle. Plan 01-01 moved the toolchain to Vite 7.3.6 and the measurement was
// re-run there — see 01-07-SUMMARY.md for the current size and hash. Bumping
// Vite or TypeScript changes those bytes on purpose: it closes the season, as a
// scheduled event rather than a surprise.
//
// Paths are relative to the REPOSITORY ROOT, not to this file: the only
// supported invocation is `npm run sim:build`, which npm always runs from the
// root. Resolving them against this file would need `node:url`, and the root
// tsconfig.json type-checks `packages/**` with `types: ["vite/client"]` and no
// @types/node installed — so a Node built-in import here would break the build.
import { defineConfig } from 'vite';

export default defineConfig({
  // Root is the repository root (see above), so the default publicDir would be
  // the PWA's public/ and Vite would copy manifest.json, sw.js and every icon
  // into dist/ next to the bundle. A library has no static assets: `false`
  // keeps this directory holding exactly the two files SIM_VERSION is about.
  publicDir: false,
  build: {
    lib: {
      entry: 'packages/sim/src/index.ts',
      formats: ['es'],
      fileName: () => 'sim.js',
    },
    outDir: 'packages/sim/dist',
    target: 'es2022',
    sourcemap: false,
    minify: true,
    emptyOutDir: true,
  },
});
