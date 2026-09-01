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

/** The four shell scripts, in the order a deploy touches them. */
const SCRIPTS = ['deploy-forced.sh', 'deploy.sh', 'rollback.sh', 'prune-releases.sh'];

describe('scripts de ops/', () => {
  it('o glob encontrou os quatro scripts', () => {
    const found = Object.keys(OPS).filter((p) => p.endsWith('.sh')).sort();
    expect(found).toEqual(SCRIPTS.map((n) => `../ops/${n}`).sort());
  });

  it('todo script abre com set -eu', () => {
    const bad: string[] = [];
    for (const name of SCRIPTS) {
      // The shebang is a `#` line, so it is gone with the comments; the first
      // line that survives has to be the one that makes an unset variable or a
      // failed command stop the script instead of continuing into a half-done
      // deploy.
      const first = code(name).split('\n').find((line) => line.trim() !== '');
      if (first?.trim() !== 'set -eu') bad.push(`${name}: ${first ?? '<vazio>'}`);
    }
    expect(bad).toEqual([]);
  });

  it('a troca de symlink é atômica: mv -T, nunca ln -sfn direto no alvo vivo', () => {
    const bad: string[] = [];
    for (const name of ['deploy.sh', 'rollback.sh']) {
      const src = code(name);
      if (!src.includes('mv -T')) bad.push(`${name}: sem mv -T`);
      // `ln -sfn` over an existing symlink unlinks and recreates it, so every
      // line that creates one must be writing to a temporary name — the `mv -T`
      // that follows is what makes the publish atomic.
      for (const line of src.split('\n')) {
        if (line.includes('ln -sfn') && !line.includes('.tmp')) bad.push(`${name}: ${line.trim()}`);
      }
    }
    expect(bad).toEqual([]);
  });

  it('rollback.sh não faz nenhuma chamada de rede (D2-06)', () => {
    // Not comment-stripped on purpose: the requirement is that these words do
    // not appear in the file AT ALL. A revert is needed exactly when the
    // infrastructure that would serve a download is what failed.
    const bad: string[] = [];
    for (const word of ['curl', 'wget', 'git ', 'npm ']) {
      if (read('rollback.sh').includes(word)) bad.push(word);
    }
    expect(bad).toEqual([]);
  });

  it('rollback.sh nunca toca no banco (D2-07)', () => {
    expect(read('rollback.sh')).not.toContain('var/lib/dg2');
  });

  it('prune-releases.sh resolve o symlink vivo e retém 5', () => {
    const src = code('prune-releases.sh');
    expect(src).toContain('readlink');
    expect(src).toMatch(/^KEEP=5$/m);
  });

  it('deploy-forced.sh só aceita rsync --server e um sha de 40 hexadecimais', () => {
    const src = code('deploy-forced.sh');
    expect(src).toContain('SSH_ORIGINAL_COMMAND');
    expect(src).toContain('rsync --server ');
    expect(src).toContain('^[0-9a-f]{40}$');
  });

  it('nenhum script desliga a verificação de host do SSH', () => {
    const bad: string[] = [];
    for (const [path, src] of Object.entries(OPS)) {
      if (/StrictHostKeyChecking\s*=\s*no\b/.test(src)) bad.push(path);
    }
    expect(bad).toEqual([]);
  });
});
