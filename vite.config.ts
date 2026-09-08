import { readFileSync } from 'node:fs';
import { defineConfig } from 'vite';

/** Where step 2 of the build (tools/sim-version/emit.mjs) writes SIM_VERSION. */
const SIM_VERSION_REL = 'packages/sim/dist/sim-version.json';

/**
 * What the sim bundle was announced as when it does not exist yet.
 *
 * Reachable in DEVELOPMENT ONLY. Two tabs of one dev server announce the same
 * placeholder and pair; a placeholder can never reach a published build,
 * because a `vite build` without the artifact refuses below instead of
 * shipping a value that compares equal to every other build's. That refusal
 * is the D-08 property at the build step: there is no escape hatch, and the
 * dev placeholder is not one — it is what "no artifact" honestly reads as.
 */
const SIM_VERSION_UNBUILT = 'unwired';

/**
 * The `sim` half of the version pair the client announces (D-07, D-08).
 *
 * Read from the sibling file emit.mjs writes, NEVER from the bundle: the hash
 * of an artifact cannot live inside that artifact (the definition would eat
 * itself), which is why the build is two steps and this config reads step 2.
 */
function simVersion(command: 'build' | 'serve'): string {
  let raw: string;
  try {
    raw = readFileSync(new URL(SIM_VERSION_REL, import.meta.url), 'utf8');
  } catch (error) {
    if (command === 'serve') return SIM_VERSION_UNBUILT;
    throw new Error(
      `vite.config.ts:/define/__SIM_VERSION__: ${SIM_VERSION_REL} não existe — rode \`npm run sim:build && npm run sim:version\` antes de \`vite build\` (D-08): ${String(error)}`,
    );
  }
  const parsed: unknown = JSON.parse(raw);
  const value = typeof parsed === 'object' && parsed !== null
    ? (parsed as { simVersion?: unknown }).simVersion
    : undefined;
  if (typeof value !== 'string' || value.length === 0 || value === SIM_VERSION_UNBUILT) {
    throw new Error(`vite.config.ts:/define/__SIM_VERSION__: ${SIM_VERSION_REL} sem um simVersion válido`);
  }
  return value;
}

// The game is served from the root of its own domain by Caddy's file_server,
// whose root points at the /srv/dg2/current symlink (D2-06). No repo subpath.
export default defineConfig(({ command }) => ({
  base: '/',
  build: { target: 'es2022', outDir: 'dist' },
  define: {
    __SIM_VERSION__: JSON.stringify(simVersion(command)),
  },
}));
