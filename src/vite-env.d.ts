/// <reference types="vite/client" />

/**
 * SIM_VERSION, injected at build time by the `define` in vite.config.ts from
 * packages/sim/dist/sim-version.json (D-07). It is the `sim` half of the pair
 * every peer announces and the door refuses on (D-08): two builds of the game
 * that carry different simulation bundles must never pair, and this is the
 * value that tells them apart.
 *
 * A `declare const` and not an import of the JSON file, because the file is a
 * build ARTIFACT that is gitignored — it exists after `npm run sim:version`
 * and not before — and an import that fails to resolve would take the whole
 * client down with it in development. The config decides what to inject in
 * each mode; the source only declares that something will be.
 */
declare const __SIM_VERSION__: string;
