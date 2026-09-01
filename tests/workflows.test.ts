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

/**
 * Just the `deploy` job's lines, sliced out of the workflow by indentation.
 *
 * Job-scoped assertions need the slice and not the file. `timeout-minutes:`
 * and `if: always()` are both things another job could legitimately carry one
 * day, and a whole-file match would then be green while the one job that holds
 * a private key carried neither — which is the failure this helper exists to
 * make impossible rather than unlikely.
 *
 * The end of the slice is the next line at TWO spaces that is not a comment:
 * job keys sit at two, everything inside a job sits at four or more. `deploy`
 * is currently last, so the slice usually runs to the end of file; the search
 * is there so that stops being load-bearing the moment a job is appended.
 */
function deployJob(src: string): string {
  const lines = src.split('\n');
  const start = lines.findIndex((l) => /^ {2}deploy:[ \t]*\r?$/.test(l));
  expect(start, 'não há job `deploy:` no ci.yml').toBeGreaterThanOrEqual(0);
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i++) {
    if (/^ {2}[^\s#]/.test(lines[i]!)) { end = i; break; }
  }
  const slice = lines.slice(start, end).join('\n');
  // Anti-vacuity, and the number is a real floor rather than `> 0`: a slice
  // that found the heading and stopped at the next line is a slice every
  // "nothing is missing" assertion below would pass over.
  expect(slice.length, 'a fatia do job `deploy` veio vazia ou truncada').toBeGreaterThan(1500);
  return slice;
}

/**
 * The `deploy` job's own `if:`, and only it.
 *
 * COLUMN FOUR IS THE WHOLE POINT, which is why this is a regex and not a
 * search over deployJob(). A job key sits at four spaces and a step key at
 * eight, so a plain scan of the slice would hand back the `if: always()` of
 * the key-cleanup step — and every assertion built on the result would then be
 * measuring the wrong line while reading as though it measured the gate.
 */
function deployIf(src: string): string {
  const m = /^ {4}if:[ \t]*(\S[^\n]*?)[ \t]*\r?$/m.exec(deployJob(src));
  expect(m, 'o job `deploy` não declara `if:` no nível do job').not.toBeNull();
  return m![1]!;
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
// same job, and every `uses:` here names a MAJOR tag, which moves —
// `actions/checkout@v7` today is not the commit it pointed at last month, and no
// diff in this repository records that. Keeping every `uses:` inside actions/
// does not make the CI safe, but it makes the set of people who can change what
// runs next to the key exactly one.
//
// That sentence used to read "`@v4` is a moving tag", back when every step in
// the file carried that number. The number is gone — the Node 20 deprecation
// took the whole set past it, and the five actions no longer share one major —
// so the example above is an example and nothing depends on it. What the digits
// have to satisfy is the describe further down, which pins the property instead.
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

  it('o teto do GITHUB_TOKEN é do WORKFLOW, não de um job só (WR-19)', () => {
    const src = ci();
    // COLUMN ZERO IS THE WHOLE ASSERTION, and the reason this is a regex
    // rather than the hasLine() above. `contents: read` was ALREADY in the
    // file before this test existed — the deploy job carries its own block —
    // so `toContain('contents: read')`, and hasLine() too, since it ignores
    // indentation by design, would have been green against the very state
    // this is here to refuse. Proof by removal, run: deleting the top-level
    // block turns this red and nothing else in the suite moves.
    //
    // What the indentation buys: `permissions:` nested under a job governs
    // that job alone, and `test` and `pwa` declared none. A job with no block
    // inherits the REPOSITORY default, which for anything created before the
    // 2023 change is write-all — and those two are the jobs that run the whole
    // toolchain and download three browser engines. The wide token was on the
    // large surface and the narrow one on the small.
    const top = /^permissions:[ \t]*\r?\n((?:[ \t]+\S[^\n]*\r?\n)+)/m.exec(src);
    expect(top, 'não há bloco `permissions:` na coluna zero do ci.yml').not.toBeNull();
    const entries = top![1]!.split('\n').map((l) => l.trim()).filter((l) => l !== '');
    // Exactly one, and it is the read. A floor that also granted something
    // else would not be a floor.
    expect(entries, 'o teto do workflow concede mais que `contents: read`')
      .toEqual(['contents: read']);
  });

  it('nenhum escopo de permissão é concedido para escrita', () => {
    const src = ci();
    // The other direction, and it is not the same assertion: the block above
    // pins what the floor IS, this one pins that nothing anywhere raises it.
    // `write-all` and a per-scope `: write` are the two spellings, and a job
    // block sits below the workflow block rather than under it — a nested
    // `permissions:` REPLACES the outer one, it does not intersect with it.
    expect(src).not.toContain('write-all');
    const raised = src
      .split('\n')
      .filter((l) => /^\s+[a-z-]+:\s*write\s*\r?$/.test(l))
      .map((l) => l.trim());
    expect(raised).toEqual([]);
  });
});


// Node 20 is gone from the runners, and "gone" does not mean refused. An action
// whose own action.yml still says `runs.using: node20` is FORCED onto Node 24,
// and every job that touches one is annotated. Forced is not supported: the
// people who ship the action never exercised its vendored dependencies against
// 24, so the annotation is the runner announcing that it is guessing on our
// behalf — inside the pipeline that holds the deploy key, among other places.
//
// The TABLE is the property, and it is why this is not a list of version
// strings. `toContain('actions/cache@v6')` would go stale the day v7 ships and
// would never have said anything about a runtime in the first place. What has to
// hold is "no major known to be node20", and majors are frozen history: every
// number below was read from `runs.using` in that action's own action.yml at
// that tag, and a published tag cannot change what it says retroactively. That
// is also what makes this checkable with no network at test time.
//
// The trap is written down because it is not guessable. Bumping everything to v5
// LOOKS like the fix and leaves the annotation exactly where it stood:
// upload-artifact reaches node24 only at v6, and download-artifact only at v7.
// Their v5 is node20 wearing a newer number — and those two are precisely the
// pair this workflow uses to carry the published bytes from `test` to `deploy`.
const MIN_NODE24_MAJOR: Readonly<Record<string, number | undefined>> = {
  'checkout': 5,
  'setup-node': 5,
  'cache': 5,
  'upload-artifact': 6,
  'download-artifact': 7,
};

describe('nenhuma ação roda no runtime depreciado (Node 20)', () => {
  it('todo `uses:` está num major que declara node24', () => {
    const src = ci();
    // The same extraction as the T-2-SC test above, on purpose rather than by
    // accident: that one proves who owns the action, this one proves what it
    // runs on, and a second regex would be a second thing to keep in step.
    const found = [...src.matchAll(/^\s*(?:-\s+)?uses:\s*(\S+)/gm)].map((m) => m[1]!);
    // Anti-vacuity, for the same reason as everywhere else in this file: a regex
    // that stopped matching would leave the loop below inspecting nothing at all
    // and the assertion green, which is how a guard rots with the suite intact.
    expect(found.length, 'o regex de `uses:` não encontrou ações — o formato mudou?')
      .toBeGreaterThanOrEqual(5);
    const bad: string[] = [];
    for (const use of found) {
      // An unrecognised shape is a FAILURE, never a skip. A commit-SHA pin, a
      // `@main`, a `docker://` image — each would sail past a filter written the
      // other way round, and the point of this loop is that a runtime nobody
      // looked up cannot get in. Pinning by SHA is a defensible hardening one
      // day; the day somebody does it, they should have to come here and say so.
      const m = /^actions\/([A-Za-z0-9._-]+)@v(\d+)(?:\.\d+)*$/.exec(use);
      if (m === null) {
        bad.push(`${use}: não é actions/<nome>@v<major> — não dá para conferir o runtime`);
        continue;
      }
      const floor = MIN_NODE24_MAJOR[m[1]!];
      // An action missing from the table fails too. Adding one means opening its
      // action.yml, reading `runs.using` and writing the number down here, which
      // is exactly the step that would otherwise get skipped.
      if (floor === undefined) {
        bad.push(`${use}: ação fora da tabela — leia o runs.using dela e acrescente`);
        continue;
      }
      if (Number(m[2]!) < floor) {
        bad.push(`${use}: node20; o primeiro major em node24 é v${floor}`);
      }
    }
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

    // WR-18, and it rides the same loop for the same reason: per command, so
    // that one invocation carrying the option twice cannot cover for another
    // carrying none. Without IdentitiesOnly=yes, an ssh-agent holding other
    // identities gets them offered FIRST and can exhaust MaxAuthTries before
    // the deploy key is ever reached. The symptom is `Permission denied
    // (publickey)` with the right key sitting right there in $HOME/.ssh —
    // which is precisely the confusing failure the step above says it exists
    // to prevent, arriving by a second door. No agent runs on a hosted runner
    // today; the pipeline that carries a private key is the wrong one to leave
    // depending on that.
    expect(spawnsSsh.filter((l) => !l.includes('IdentitiesOnly=yes'))).toEqual([]);
  });

  it('a chave privada nunca existe legível para todos (WR-18)', () => {
    const job = deployJob(ci());
    // `printf ... > file` creates with the process umask, which is 0022 on the
    // runner image — so the key spends the gap between the redirect and the
    // chmod at 0644. Small on an ephemeral hosted runner and not small on a
    // self-hosted one, and the fix is the same size as the reasoning that
    // justified pinning the host key: one line.
    //
    // Matching the redirect and requiring umask on the SAME line is what makes
    // this structural instead of hopeful: a `umask 077` sitting anywhere in
    // the step would satisfy a whole-step search while a later redirect ran
    // outside the subshell that carries it.
    const writes = job.split('\n').filter((l) => /> *"\$HOME\/\.ssh\//.test(l));
    expect(writes.length, 'nenhuma escrita em $HOME/.ssh — o job mudou de forma?')
      .toBeGreaterThanOrEqual(2);
    expect(writes.filter((l) => !l.includes('umask 077')).map((l) => l.trim())).toEqual([]);
  });

  it('a chave privada é apagada ao fim, tenha o deploy passado ou não (WR-18)', () => {
    const job = deployJob(ci());
    const folded = job.replace(/\\\r?\n\s*/g, ' ');
    const removal = folded.split('\n').filter((l) => /\brm -f\b.*id_ed25519/.test(l));
    expect(removal.length, 'nada apaga a chave privada ao fim do job').toBe(1);
    // `if: always()` and not a bare last step: a step with no condition is
    // SKIPPED once an earlier one fails, so the cleanup would run in exactly
    // the runs where nothing went wrong and skip the ones where something did.
    expect(hasLine(job, 'if: always()'), 'a limpeza da chave não roda quando o deploy falha')
      .toBe(true);
  });

  it('o job que carrega a chave tem prazo próprio (WR-18)', () => {
    const job = deployJob(ci());
    // With cancel-in-progress: false — which is itself a decision, since a
    // deploy killed mid-transfer leaves a partial release on disk — a hung
    // rsync or ssh holds the `deploy-vps` group for the full six-hour job
    // limit. Every subsequent deploy queues behind it, including the one that
    // would fix whatever is hung.
    const m = /^ {4}timeout-minutes:[ \t]*(\d+)[ \t]*\r?$/m.exec(job);
    expect(m, 'o job `deploy` não declara timeout-minutes').not.toBeNull();
    // A ceiling, because a `timeout-minutes: 360` would satisfy "it has one"
    // and would be the six-hour default wearing a hat.
    expect(Number(m![1]), 'o prazo é largo demais para significar algo')
      .toBeLessThanOrEqual(30);
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
    // Clause by clause over the isolated condition, where this used to pin the
    // whole `if:` as a single literal through hasLine(). The literal was the
    // wrong unit: ANDing a third clause onto the gate read as "the gate
    // changed shape" — the same red a DELETED gate produces — so the file had
    // no way to say "these two must be there" without also saying "and nothing
    // else may be". Two clauses that must be present is the property; what
    // stands beside them is the next test's business.
    const cond = deployIf(src);
    expect(cond, 'o gate de branch sumiu').toContain("github.ref == 'refs/heads/main'");
    expect(cond, 'o gate de evento sumiu').toContain("github.event_name == 'push'");
  });

  it('o deploy é pulado enquanto o alvo de publicação não existir (D2-08)', () => {
    const cond = deployIf(ci());
    // Without this clause the job runs on EVERY push to main and dies on the
    // empty-secret guard of its first step, because plan 02-04 — the one that
    // creates the four secrets and the box — is deferred. Measured, on the
    // first real run this workflow ever had: `test` green, `pwa` green,
    // `deploy` red. A job that stays red for weeks teaches everybody to stop
    // reading red CI, which is the exact opposite of what this gate was built
    // to buy.
    expect(cond, 'o deploy roda sem saber se o alvo de publicação existe')
      .toContain("vars.DEPLOY_ENABLED == 'true'");
    // And it has to be `vars`, which is why this is not the assertion above
    // spelled twice. The contexts a JOB-level `if:` can read are github,
    // needs, vars and inputs — `secrets` is not among them. A condition that
    // tried to read one would not error: it evaluates to nothing, the
    // condition is never true, and the job silently stops running forever.
    // Same defect, wearing the one disguise nobody checks for, because it
    // shows up green.
    expect(cond, 'gate de job lendo `secrets`, contexto que não existe aí')
      .not.toContain('secrets.');
  });

  it('os quatro segredos continuam recusados vazios (D2-08)', () => {
    const job = deployJob(ci());
    // The second line of defence, and it catches a DIFFERENT failure from the
    // gate above: the repository variable says the target was configured, the
    // `:?` says the value actually arrived. A secret that exists and is empty
    // satisfies the first and is stopped only by the second — by name, before
    // any connection, instead of as `Permission denied (publickey)` thirty
    // seconds into a transfer. Now that the gate exists, deleting these four
    // looks like a tidy-up; this is what refuses it.
    for (const name of ['DEPLOY_SSH_KEY', 'DEPLOY_KNOWN_HOSTS', 'DEPLOY_USER', 'DEPLOY_HOST']) {
      expect(job, `o guarda de segredo vazio de ${name} sumiu`)
        .toMatch(new RegExp(`\\$\\{${name}:\\?`));
    }
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
