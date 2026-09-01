// workflows.test.ts — the executable half of INFRA-01. The requirement says the
// game has a single deploy target; this file turns that from a promise into
// something a command can refuse. It is the companion of the deletion of
// .github/workflows/deploy.yml, which happened BEFORE this repository was ever
// pushed, so the GitHub Pages mirror of DungeonGuys2 never existed at all —
// there is no farewell to publish because there is nothing to say goodbye to
// (D2-18).
//
// Publishing to Pages would not merely duplicate the VPS: it would be
// destructive. The live service worker of the original DungeonGuys calls
// caches.keys() and deletes every cache on the origin that is not its own
// (DM-3). Two games sharing one github.io origin means each one wipes the
// other's offline cache, and no amount of cache naming fixes it — only a
// separate origin does, which is what this phase's migration buys.
//
// Unlike purity.test.ts, this file does NOT strip comments before matching, and
// tests/scan.ts is deliberately not reused here: scan.ts removes TypeScript
// comments (`//` and `/* */`), and YAML's `#` is neither of those. Beyond the
// mismatch, a commented-out `deploy-pages` is still a workflow that somebody
// will uncomment. Here prose is not exempt.
//
// Since plan 02-11 the file guards a second thing: the shape of the one job
// that holds an SSH key with write access to the box. Those assertions are not
// style — they are the mitigations of T-2-SSH, T-2-SC and T-2-RACE written as a
// gate, and a gate is the only form in which a mitigation does not regress in
// silence six months from now.
import { describe, it, expect } from 'vitest';

// Vite's raw glob, not node:fs — the root tsconfig's `types` is ["vite/client"]
// only, and tools/README.md §4 forbids touching it. Both extensions are
// matched: GitHub reads .yml and .yaml alike, so globbing only .yml would leave
// a deploy.yaml free to reintroduce Pages without tripping anything here.
const FILES = import.meta.glob<string>(['../.github/workflows/*.yml', '../.github/workflows/*.yaml'], {
  query: '?raw', import: 'default', eager: true,
});

/** Literal markers of a GitHub Pages publication path, as they appear in a
 *  workflow: the two actions that upload and publish the artifact, the one that
 *  configures Pages, and the deployment environment name. Plain substrings, not
 *  regexes — there is no legitimate reason for any of them to appear in this
 *  repository, so there is nothing to except. */
const FORBIDDEN = [
  'upload-pages-artifact',
  'deploy-pages',
  'configure-pages',
  'github-pages',
];

/** The one workflow this repository has. Named once so the helper below and the
 *  exact-count guard cannot drift apart. */
const CI_PATH = '../.github/workflows/ci.yml';

/** The workflow source, with the emptiness check that every assertion in this
 *  file depends on. `''.includes(x)` is false for every x, so a glob that
 *  silently stopped matching — a renamed directory, a changed Vite root — would
 *  turn every "does not contain" test here green at the same moment. The floor
 *  is a real number rather than `> 0` because a truncated file is the same
 *  failure wearing a different hat. */
function ci(): string {
  const src = FILES[CI_PATH];
  expect(src, `o glob não encontrou ${CI_PATH}`).toBeTypeOf('string');
  expect(src!.length, 'ci.yml está vazio ou truncado').toBeGreaterThan(2000);
  return src!;
}

/** True when the workflow has a line that IS this literal, indentation aside.
 *
 *  A bare `includes` is not enough for anything that also gets talked about in
 *  prose, and this file is full of prose: `needs: [test, pwa]` appears inside a
 *  comment in the `pwa` job, left there by plan 02-09 as a note to plan 02-11.
 *  A substring check therefore stayed green while the deploy job's own `needs:`
 *  had been cut down to a single gate — measured, not imagined: the
 *  proof-by-removal for that assertion failed to go red, which is how the hole
 *  was found. Anchoring the whole line is the fix, and the trailing \r is there
 *  because this repository is checked out CRLF on Windows and LF on the runner. */
function hasLine(src: string, literal: string): boolean {
  const escaped = literal.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`^[ \\t]*${escaped}[ \\t]*\\r?$`, 'm').test(src);
}

describe('alvo único de deploy (INFRA-01)', () => {
  // Exact count, and checked BEFORE any assertion about content: an empty glob
  // would pass every "nothing matches" test in silence, and a resurrected
  // deploy.yml has to fail for existing at all, not only for what it contains.
  // Adding a workflow means changing this number in the same commit — which is
  // exactly the moment to ask whether the new one publishes anything.
  it('encontrou exatamente um workflow, e é o ci.yml', () => {
    expect(Object.keys(FILES).length).toBe(1);
    expect(FILES[CI_PATH], `o glob não encontrou ${CI_PATH}`).toBeTypeOf('string');
  });

  // Violations are collected into a list instead of asserted one by one, so a
  // failure names which file and which marker — the same shape purity.test.ts
  // uses, for the same reason.
  it('nenhum workflow publica no GitHub Pages', () => {
    const bad: string[] = [];
    for (const [path, src] of Object.entries(FILES)) {
      for (const marker of FORBIDDEN) {
        if (src.includes(marker)) bad.push(`${path}: ${marker}`);
      }
    }
    expect(bad).toEqual([]);
  });
});

// D2-05 says the published bytes are the bytes that passed the gates. The only
// way to mean that literally is to move an artifact between jobs instead of
// building twice: two builds of the same source are equal until the day they
// are not, and that day arrives without an announcement.
describe('o artefato publicado é o artefato testado (D2-05)', () => {
  it('o CI emite os dois artefatos publicáveis', () => {
    const src = ci();
    // Two uploads, never one: the client dist/ and the bundled server travel
    // together, or the box ends up serving halves of two different commits.
    expect((src.match(/upload-artifact/g) ?? []).length).toBeGreaterThanOrEqual(2);
    expect(hasLine(src, 'name: dist'), 'nenhum artefato chamado `dist`').toBe(true);
    expect(hasLine(src, 'name: server'), 'nenhum artefato chamado `server`').toBe(true);
    // The gates the uploaded bytes must have cleared, asserted here because
    // they have to run in the SAME job that uploads. A sw:verify somewhere else
    // in the file proves something about somebody else's dist/.
    expect(src).toContain('npm run sw:verify');
    expect(src).toContain('npm run server:build');
  });
});

// T-2-SC. The pipeline that holds the deploy key is the worst place in the
// project to take a dependency on a stranger: an action is code, it runs in the
// same job, and `@v4` is a moving tag. Keeping every `uses:` inside actions/
// does not make the CI safe, but it makes the set of people who can change what
// runs next to the key exactly one.
describe('nenhuma ação de terceiro roda no CI (T-2-SC)', () => {
  it('todo `uses:` é uma ação da própria GitHub', () => {
    const src = ci();
    // The raw value of every `uses:`, whatever its shape — `owner/repo@ref`, a
    // local `./path`, a `docker://` image. Capturing the shapes we do NOT want
    // is the point: a form this test fails to recognise has to fail loudly
    // rather than slip out of the sample.
    const found = [...src.matchAll(/^\s*(?:-\s+)?uses:\s*(\S+)/gm)].map((m) => m[1]!);
    // Anti-vacuity, and the reason it is a number instead of `> 0`: a regex
    // that stopped matching would let the filter below pass having inspected
    // nothing at all, which is how a guard rots with every test still green.
    expect(found.length, 'o regex de `uses:` não encontrou ações — o formato mudou?')
      .toBeGreaterThanOrEqual(5);
    const bad = found.filter((a) => !/^actions\/[A-Za-z0-9._-]+@\S+$/.test(a));
    expect(bad).toEqual([]);
  });
});

// The shape of the one job that holds an SSH key with write access to the box.
// Nothing below is style. Each assertion is a mitigation from this plan's threat
// register turned into something a command refuses, which is the only form in
// which a mitigation survives the six months after the person who wrote it has
// stopped thinking about it. None of this has ever run against the real box —
// that is plan 02-12 — so the gate is all the assurance there is today.
describe('o caminho que carrega a chave de deploy', () => {
  it('não descobre a chave de host — ela vem fixada de um secret (T-2-SSH)', () => {
    const src = ci();
    // Plain substrings, and prose is not exempt here either: a commented-out
    // host-key scan is precisely the line somebody uncomments while a deploy is
    // red and the short path looks reasonable. That is also why the workflow's
    // own comment spells the danger out without ever naming the command.
    expect(src).not.toContain('ssh-keyscan');
    expect(src).not.toContain('StrictHostKeyChecking=no');
    expect(src).not.toContain('StrictHostKeyChecking=accept-new');

    // And every command that actually spawns ssh must pin it. Counting
    // occurrences would be brittle and, worse, would stay green if one command
    // carried the option twice while another carried none — so the check is per
    // command, with shell line continuations folded first so that a multi-line
    // rsync counts as the single command it is. The \r is not decoration: this
    // repository is checked out with CRLF on Windows and LF on the runner.
    const folded = src.replace(/\\\r?\n\s*/g, ' ');
    const spawnsSsh = folded.split('\n').filter((l) => /\bssh -/.test(l));
    expect(spawnsSsh.length, 'nenhuma invocação de ssh encontrada — o job mudou de forma?')
      .toBeGreaterThanOrEqual(3);
    expect(spawnsSsh.filter((l) => !l.includes('StrictHostKeyChecking=yes'))).toEqual([]);
  });

  it('dois deploys nunca correm sobre o mesmo symlink (T-2-RACE)', () => {
    const src = ci();
    expect(hasLine(src, 'group: deploy-vps'), 'o grupo de concorrência sumiu').toBe(true);
    // Turning cancellation back on would look like a tidy-up and would mean a
    // release killed halfway through a transfer, left on disk under its sha.
    expect(hasLine(src, 'cancel-in-progress: false'), 'o cancelamento foi religado').toBe(true);
  });

  it('o deploy só sai depois dos dois portões, e só de um push na main (D2-08)', () => {
    const src = ci();
    // Both gates, not one: `test` proves the artifact, `pwa` proves the service
    // worker that will serve it offline. Whole line, not substring — see hasLine.
    expect(hasLine(src, 'needs: [test, pwa]'), 'o deploy não depende dos dois portões').toBe(true);
    expect(
      hasLine(src, "if: github.ref == 'refs/heads/main' && github.event_name == 'push'"),
      'o gate de branch e de evento mudou de forma',
    ).toBe(true);
  });

  it('todo --link-dest é caminho absoluto (P-12)', () => {
    const src = ci();
    // rsync resolves a relative --link-dest against the DESTINATION, so a
    // relative one works by accident in some layouts and fails in others with
    // no error at all — just no hardlink. The symptom is a full disk months
    // later with nothing pointing back here, which is why this is a gate and
    // not a comment.
    const dests = [...src.matchAll(/--link-dest=(\S+)/g)].map((m) => m[1]!);
    expect(dests.length, 'nenhum --link-dest encontrado — o job mudou de forma?')
      .toBeGreaterThanOrEqual(2);
    expect(dests.filter((p) => !p.startsWith('/'))).toEqual([]);
  });
});
