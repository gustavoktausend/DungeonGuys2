// ops-config.test.ts — the executable half of ops/.
//
// Nothing in ops/ runs on this machine: it is configuration and shell that a
// VPS will execute later (plan 02-12). That is exactly why it needs a test —
// the failure mode of infra config is that it is wrong for months and nobody
// finds out until the night it matters. Every assertion here is one of the
// traps the phase research measured, turned into a command:
//
//   P-5   `handle` is reordered by Caddy, `route` is not — so `route` is banned
//   P-6   {$VAR} works in a site address, {env.VAR} does not
//   P-12  a relative --link-dest silently stops deduplicating
//   DM-5  no try_files: a 404 must stay a 404, or the SW caches a wrong page
//   D2-06 rollback touches no network, or it fails in the one case it exists for
//   D2-07 rollback touches no database, or reverting code reverts data
//   D2-15 no secret and no address ever enters the repository
import { describe, it, expect } from 'vitest';

// Vite's raw glob, not node:fs — tsconfig's `types` is ["vite/client"] only.
// The pattern globs the directory rather than a suffix because the Caddyfile
// has no extension.
const OPS = import.meta.glob<string>('../ops/*', {
  query: '?raw', import: 'default', eager: true,
});

/**
 * Reads one file of ops/ with the anti-vacuity guard attached. Every assertion
 * below goes through here, so a renamed or deleted file fails loudly instead of
 * turning the whole suite into a green no-op over an empty glob.
 */
function read(name: string): string {
  const src = OPS[`../ops/${name}`];
  expect(src, `o glob não encontrou ops/${name}`).toBeTypeOf('string');
  return src as string;
}

/**
 * Drops whole-line comments: every line whose first non-blank character is `#`.
 *
 * THIS FILTER IS NOT OPTIONAL. ops/Caddyfile explains, in its own comments, why
 * it does NOT use `try_files` and why it does NOT use `route`; the shell scripts
 * name `curl` and `git` in the headers that forbid them. Without the filter each
 * absence assertion below would fail against the very file that satisfies it —
 * the documentation would invalidate the code it documents, and the obvious
 * "fix" would be to delete the explanation. Strip first, then assert.
 */
function code(name: string): string {
  return read(name)
    .split('\n')
    .filter((line) => !/^\s*#/.test(line))
    .join('\n');
}

describe('ops/Caddyfile', () => {
  it('roteia /api, /ws e o estático a partir do symlink de release', () => {
    const cfg = code('Caddyfile');
    expect(cfg).toContain('handle /api/*');
    expect(cfg).toContain('reverse_proxy');
    expect(cfg).toContain('handle /ws');
    // The same path ops/deploy.sh swaps: if the two ever disagree, the box
    // serves an empty directory and every request is a 404.
    expect(cfg).toContain('root * /srv/dg2/current');
  });

  it('usa {$VAR} no endereço do site, nunca {env.VAR} (P-6)', () => {
    const cfg = code('Caddyfile');
    expect(cfg).toContain('{$DG2_DOMAIN}');
    expect(cfg).not.toContain('{env.DG2_DOMAIN}');
  });

  it('não usa a diretiva route, cuja ordem seria carga funcional (P-5)', () => {
    // A directive opens a line, so anchoring to the start of a line is precise
    // enough to tell the directive from any word that merely contains it.
    expect(code('Caddyfile')).not.toMatch(/^\s*route\b/m);
  });

  it('não transforma 404 em index.html servido com 200 (DM-5)', () => {
    expect(code('Caddyfile')).not.toContain('try_files');
  });

  it('responde 503 legível por máquina quando o upstream cai', () => {
    const cfg = code('Caddyfile');
    expect(cfg).toContain('handle_errors');
    expect(cfg).toContain('{"status":"unavailable"}');
  });
});
