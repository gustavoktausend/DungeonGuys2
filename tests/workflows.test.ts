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

describe('alvo único de deploy (INFRA-01)', () => {
  // Exact count, and checked BEFORE any assertion about content: an empty glob
  // would pass every "nothing matches" test in silence, and a resurrected
  // deploy.yml has to fail for existing at all, not only for what it contains.
  // Adding a workflow means changing this number in the same commit — which is
  // exactly the moment to ask whether the new one publishes anything.
  it('encontrou exatamente um workflow, e é o ci.yml', () => {
    expect(Object.keys(FILES).length).toBe(1);
    expect(
      FILES['../.github/workflows/ci.yml'],
      'o glob não encontrou .github/workflows/ci.yml',
    ).toBeTypeOf('string');
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
