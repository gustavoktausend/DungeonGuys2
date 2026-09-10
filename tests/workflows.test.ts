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
// Since plan 02-11 the file guards a second thing, and plan 02-15 changed what
// that thing IS. It used to be the shape of the one job that held an SSH key
// with write access to the box; under D2-32 no such job and no such key exist,
// and what the file guards now is the shape of the job that PUBLISHES AN IMAGE
// to a registry. Those assertions are not style — they are the mitigations of
// T-2-SSH, T-2-SC, T-2-TOKEN, T-2-CREDLOG, T-2-MOVTAG and T-2-RACE written as a
// gate, and a gate is the only form in which a mitigation does not regress in
// silence six months from now.
//
// THE SSH ASSERTIONS DID NOT SIMPLY DIE: one of them was INVERTED. Five of the
// six cases that guarded the key path are gone because the path is gone, but
// "no line of the workflow speaks to the box over the network" replaced them,
// because the absence of that path is a property to defend rather than an
// accident of the moment. The workflow cooperates by never spelling the three
// command names in its own prose — the same device it already uses for the
// broad permission value — which is what lets the refusal here stay blind to
// comments without making the file unable to explain itself.
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

/** The composition of plan 02-14, read for ONE reason: it is the consumer of
 *  what the publishing job pushes, and the two files carry the image names as
 *  separate literals. Two copies of a value that must agree are one edit away
 *  from not agreeing, and the symptom here would be a deploy pulling a name
 *  nobody pushed — a container that never starts, on a box reached through a
 *  tunnel, with the panel reporting only that the pull failed.
 *
 *  It is globbed here and not in tests/ops-config.test.ts, which owns ops/,
 *  because the file under repair is the workflow: the assertion belongs beside
 *  the thing that must agree with the composition rather than inside the suite
 *  that would also go red for thirty unrelated reasons. Its own glob, so the
 *  exact-count guard over FILES above is untouched. */
const COMPOSE_PATH = '../ops/docker-compose.yml';
const COMPOSE = import.meta.glob<string>('../ops/docker-compose.yml', {
  query: '?raw', import: 'default', eager: true,
});

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
 * Just the `image` job's lines, sliced out of the workflow by indentation.
 *
 * Job-scoped assertions need the slice and not the file, and the reasoning did
 * not change when the job did — only the name. `timeout-minutes:` and a
 * `permissions:` block are both things another job could legitimately carry one
 * day, and a whole-file match would then be green while the one job that writes
 * outside this repository carried neither, which is the failure this helper
 * exists to make impossible rather than unlikely.
 *
 * The end of the slice is the next line at TWO spaces that is not a comment:
 * job keys sit at two, everything inside a job sits at four or more. `image`
 * is currently last, so the slice usually runs to the end of file; the search
 * is there so that stops being load-bearing the moment a job is appended.
 */
function imageJob(src: string): string {
  const lines = src.split('\n');
  const start = lines.findIndex((l) => /^ {2}image:[ \t]*\r?$/.test(l));
  expect(start, 'não há job `image:` no ci.yml').toBeGreaterThanOrEqual(0);
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i++) {
    if (/^ {2}[^\s#]/.test(lines[i]!)) { end = i; break; }
  }
  const slice = lines.slice(start, end).join('\n');
  // Anti-vacuity, and the number is a real floor rather than `> 0`: a slice
  // that found the heading and stopped at the next line is a slice every
  // "nothing is missing" assertion below would pass over.
  //
  // MEASURED, not guessed: the job is ~5.3 KB as written. The floor sits well
  // under that on purpose — its job is to catch a slice that collapsed, not to
  // police how much prose the job carries, and a floor pinned to today's byte
  // count would turn every comment edit into a red test for no property at all.
  expect(slice.length, 'a fatia do job `image` veio vazia ou truncada').toBeGreaterThan(2000);
  return slice;
}

/**
 * The `image` job's own `if:`, and only it.
 *
 * COLUMN FOUR IS THE WHOLE POINT, which is why this is a regex and not a
 * search over imageJob(). A job key sits at four spaces and a step key at
 * eight, so a plain scan of the slice would hand back a step-level condition —
 * and every assertion built on the result would then be measuring the wrong
 * line while reading as though it measured the gate. The job has no step-level
 * `if:` today; that is exactly the kind of fact that stops being true quietly,
 * which is why the column is in the regex and not in a comment.
 */
function imageIf(src: string): string {
  const m = /^ {4}if:[ \t]*(\S[^\n]*?)[ \t]*\r?$/m.exec(imageJob(src));
  expect(m, 'o job `image` não declara `if:` no nível do job').not.toBeNull();
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

// T-2-SC. The pipeline that publishes is the worst place in the project to take
// a dependency on a stranger: an action is code, it runs in the same job, and
// every `uses:` here names a MAJOR tag, which moves — `actions/checkout@v7`
// today is not the commit it pointed at last month, and no diff in this
// repository records that. Keeping every `uses:` inside actions/ does not make
// the CI safe, but it makes the set of people who can change what runs beside
// the registry token exactly one.
//
// This is where plan 02-15 could have gone the other way and did not. Publishing
// to a registry is normally written with `docker/login-action` and
// `docker/build-push-action`, and both would fail here — so the cheap move was
// to loosen the filter below. The hosted runner already ships `docker` and
// `buildx`, so `run:` steps do the whole job and this assertion stays exactly as
// it was written when there was nothing to publish. If those actions ever come
// back to the table, all four relevant ones have been measured as node24 and so
// would not fight the runtime gate further down — but they are not here today,
// and the day somebody adds one they should have to come here and say so.
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

  it('a única escrita concedida é `packages: write`, e só no job que empurra a imagem (T-2-TOKEN)', () => {
    const src = ci();
    // The other direction, and it is not the same assertion: the block above
    // pins what the floor IS, this one pins that nothing anywhere raises it.
    // `write-all` and a per-scope `: write` are the two spellings, and a job
    // block sits below the workflow block rather than under it — a nested
    // `permissions:` REPLACES the outer one, it does not intersect with it.
    expect(src).not.toContain('write-all');
    const writes = (s: string) => s
      .split('\n')
      .filter((l) => /^\s+[a-z-]+:\s*write\s*\r?$/.test(l))
      .map((l) => l.trim());
    // THE EXCEPTION IS NAMED ON PURPOSE, and this used to be `toEqual([])`.
    // Pushing to the registry with the GITHUB_TOKEN requires this scope and
    // there is no way around it that is not worse — a classic personal token
    // with package-write scope, living in a secret, is a long-lived credential
    // in a third-party service where this is an ephemeral job token.
    //
    // What is NOT acceptable is a gate that admits "some write": the list is
    // compared by equality against exactly one entry, spelled out, so a second
    // scope or a different one fails by naming itself in the diff of the
    // failure. Measured by removal: adding `contents: write` to any job, or
    // renaming this one, turns this red and nothing else in the suite moves.
    expect(writes(src), 'o workflow concede escrita além de `packages: write`')
      .toEqual(['packages: write']);
    // And it is INSIDE the publishing job, not merely somewhere in the file.
    // Without this half, moving the grant up to column zero — which would hand
    // it to `test` and `pwa`, the two jobs that run the whole toolchain and
    // download three browser engines — would leave the assertion above green.
    expect(writes(imageJob(src)), 'a escrita não está no job que empurra a imagem')
      .toEqual(['packages: write']);
  });
});


// Node 20 is gone from the runners, and "gone" does not mean refused. An action
// whose own action.yml still says `runs.using: node20` is FORCED onto Node 24,
// and every job that touches one is annotated. Forced is not supported: the
// people who ship the action never exercised its vendored dependencies against
// 24, so the annotation is the runner announcing that it is guessing on our
// behalf — inside the pipeline that publishes, among other places.
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
// pair this workflow uses to carry the published bytes from `test` to `image`.
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

// The shape of the one job that writes anything outside this repository.
// Nothing below is style. Each assertion is a mitigation from plan 02-15's
// threat register turned into something a command refuses, which is the only
// form in which a mitigation survives the six months after the person who wrote
// it stopped thinking about it. None of this has ever run against the real
// registry — the first real execution is the first push to main — so the gate is
// all the assurance there is today.
//
// WHAT THIS BLOCK USED TO BE, because the deletion is the larger half of the
// diff and a reader deserves the accounting. It guarded the job that carried an
// SSH key with write access to the box, with six cases. Under D2-32 the panel
// API on that box is not reachable from the internet, every way of reaching it
// would have meant changing a neighbouring project's configuration, and so the
// CI stops deploying and only publishes. Five of those cases are gone because
// what they guarded is gone: the pinned host key, the mode of the private key,
// its deletion at the end, the absolute `--link-dest`, and the refusal of four
// empty secrets. A sixth is gone with the repository variable that gated the
// job — it existed because that job FAILED for want of a secret, and this one
// cannot: its only credential is the token the runner always injects, so an
// `if:` nobody can satisfy would have turned a job that was red for weeks into
// a job skipped forever, which the variable's own comment called the worse case.
// The decision is written in the workflow too, not only here and in the plan's
// summary, because that is where somebody will be standing when they wonder.
//
// Two cases survived with their subject changed, and five are new. The one worth
// pointing at is the LAST one, which is an inversion rather than a replacement:
// it asserts that no line of the workflow speaks to the box over the network.
// That absence is the whole of what D2-32 bought — there is no longer a
// write-capable credential for the box stored in a third-party service, which
// was exactly the risk the retired 7.6 KB wrapper existed to contain, and CR-01
// had already found a leak in that wrapper. An absence nobody asserts is an
// accident of the moment rather than a property.
describe('o caminho que publica a imagem', () => {
  it('duas publicações nunca correm ao mesmo tempo (T-2-RACE)', () => {
    const src = ci();
    // Same property, different subject: what two concurrent runs would corrupt
    // used to be the release symlink on disk and is now the registry. The group
    // is named for what it protects so that the name does not outlive the
    // reason, which is what `deploy-vps` had started to do.
    expect(hasLine(src, 'group: publish-image'), 'o grupo de concorrência sumiu').toBe(true);
    // Turning cancellation back on would look like a tidy-up and would mean a
    // push killed halfway, leaving partial layers in the registry under a tag
    // that already looks published.
    expect(hasLine(src, 'cancel-in-progress: false'), 'o cancelamento foi religado').toBe(true);
  });

  it('a publicação só sai depois dos dois portões, e só de um push na main (D2-08 aplicada à imagem)', () => {
    const src = ci();
    // Both gates, not one: `test` proves the artifact, `pwa` proves the service
    // worker that will serve it offline. Whole line, not substring — see
    // hasLine, and note that `needs: [test, pwa]` also appears inside a comment
    // in the `pwa` job, which is the measured reason hasLine exists at all.
    expect(hasLine(src, 'needs: [test, pwa]'), 'a publicação não depende dos dois portões').toBe(true);
    const cond = imageIf(src);
    expect(cond, 'o gate de branch sumiu').toContain("github.ref == 'refs/heads/main'");
    expect(cond, 'o gate de evento sumiu').toContain("github.event_name == 'push'");
    // AND NOTHING ELSE, which is the half that changed. The third clause this
    // condition used to carry read a repository variable, and it was load-bearing
    // while the job could fail for want of a secret. It cannot any more, so the
    // variable would gate a job nobody can un-skip. Refusing `vars.` here is
    // what keeps it from coming back as a one-line "fix" during an incident;
    // the day a repository variable is legitimately needed, somebody has to come
    // here and say so.
    expect(cond, 'o gate voltou a depender de uma variável de repositório')
      .not.toContain('vars.');
    // And `secrets.` stays refused for the original reason, which survives the
    // job it was written for: the contexts a JOB-level `if:` can read are
    // github, needs, vars and inputs. A condition that tried to read a secret
    // would not error — it evaluates to nothing, the condition is never true,
    // and the job silently stops running forever. Same defect, wearing the one
    // disguise nobody checks for, because it shows up green.
    expect(cond, 'gate de job lendo `secrets`, contexto que não existe aí')
      .not.toContain('secrets.');
  });

  it('a imagem é tagueada pelo sha, e nenhuma linha tagueia por nome móvel (T-2-MOVTAG)', () => {
    const src = ci();
    // Shell line continuations folded first, so a command written across lines
    // counts as the single command it is — the same fold the retired ssh
    // assertions used, kept for the same reason.
    const folded = imageJob(src).replace(/\\\r?\n\s*/g, ' ');
    const commands = folded.split('\n').filter((l) => /\bdocker (build|push)\b/.test(l));
    // Anti-vacuity, and the number is the real count: two builds and two
    // pushes. A regex that stopped matching would leave the filter below
    // inspecting nothing at all, with the assertion green.
    expect(commands.length, 'nenhum `docker build`/`docker push` encontrado — o job mudou de forma?')
      .toBe(4);
    // Per command, never by counting occurrences: counting would stay green if
    // one command carried the sha twice while another carried none.
    expect(commands.filter((l) => !l.includes('$GITHUB_SHA')).map((l) => l.trim()))
      .toEqual([]);
    // And the moving spellings are refused across the WHOLE file, prose
    // included. `:latest` is the one somebody adds so the panel has a friendly
    // name to point at, and it destroys the rollback of D2-24: there is no
    // "previous image" once the previous name points at the new content.
    expect(src, 'uma tag móvel entrou no workflow').not.toMatch(/:latest\b/);
    expect(src, 'uma tag móvel entrou no workflow').not.toMatch(/:main\b/);
  });

  it('o job que publica tem prazo próprio (WR-18)', () => {
    const job = imageJob(ci());
    // With cancellation switched off — which is itself a decision, since a push
    // killed mid-transfer leaves partial layers in the registry — a hung
    // transfer holds the concurrency group for the full six-hour job limit.
    // Every later publication queues behind it, including the one that would
    // fix whatever is hung.
    const m = /^ {4}timeout-minutes:[ \t]*(\d+)[ \t]*\r?$/m.exec(job);
    expect(m, 'o job `image` não declara timeout-minutes').not.toBeNull();
    // A ceiling, because a `timeout-minutes: 360` would satisfy "it has one"
    // and would be the six-hour default wearing a hat.
    expect(Number(m![1]), 'o prazo é largo demais para significar algo')
      .toBeLessThanOrEqual(30);
  });

  it('o token do registro entra por stdin, e nenhuma linha o passa em argv (T-2-CREDLOG)', () => {
    const src = ci();
    const folded = imageJob(src).replace(/\\\r?\n\s*/g, ' ');
    const logins = folded.split('\n').filter((l) => /\bdocker login\b/.test(l));
    // Exactly one, not "at least one": a second login is either a second
    // registry nobody discussed or the same one being re-authenticated, and
    // both deserve to be noticed.
    expect(logins.length, 'nenhum `docker login` encontrado — o job mudou de forma?').toBe(1);
    expect(logins.filter((l) => !l.includes('--password-stdin')).map((l) => l.trim()))
      .toEqual([]);
    // The two spellings that put the secret in argv instead, where it reaches
    // the process table of the runner and any log that echoes the command.
    // `--password-stdin` does not match either of these, which is the point.
    expect(src, 'a senha do registro foi para a linha de comando')
      .not.toMatch(/docker login[^\n]*\s-p\s/);
    expect(src, 'a senha do registro foi para a linha de comando')
      .not.toMatch(/--password[= ]/);
  });

  it('nenhuma linha do workflow fala com a caixa pela rede (D2-32, T-2-SSH)', () => {
    const src = ci();
    // THE INVERSION, and it is the assertion that preserves what D2-32 bought.
    // No credential with write access to the box is stored in a third-party
    // service any more, and the only way that stays true is if the absence is
    // asserted rather than remembered.
    //
    // COMMENTS ARE NOT EXEMPT HERE, and the workflow cooperates by never
    // spelling the three command names in its own prose — the device it already
    // uses for the broad permission value, whose literal spelling is likewise
    // kept out of the file so a substring refusal can stay blind. The
    // alternative was anchoring whole lines the way hasLine() does, which would
    // have let a commented-out command through; and a commented-out command is
    // exactly the line somebody uncomments while a deploy is broken and the
    // short path looks reasonable. The cost is that the workflow must explain
    // this absence without naming it, which it does, in the comment block of
    // the publishing job.
    //
    // No anti-vacuity guard of its own: ci() already refuses an empty or
    // truncated file, which is the failure that would turn an absence assertion
    // green for the wrong reason.
    const bad = src
      .split('\n')
      .filter((l) => /\b(ssh|rsync|scp)\b/i.test(l))
      .map((l) => l.trim());
    expect(bad, 'o workflow voltou a ter um caminho de rede para a caixa').toEqual([]);
  });

  it('as duas imagens publicadas são as duas que a composição puxa (D2-23, D2-24)', () => {
    const src = ci();
    const compose = COMPOSE[COMPOSE_PATH];
    expect(compose, `o glob não encontrou ${COMPOSE_PATH}`).toBeTypeOf('string');
    expect(compose!.length, 'ops/docker-compose.yml está vazio ou truncado').toBeGreaterThan(2000);
    // The NAME, not the tag: the workflow spells the tag as the commit sha and
    // the composition spells it as a panel variable, and that difference IS the
    // contract — the integrator builds, a person promotes (D2-32). What must
    // agree is which two images exist.
    const names = (s: string) => [...new Set(
      [...s.matchAll(/\/(dg2-[a-z0-9-]+):/g)].map((m) => m[1]!),
    )].sort();
    const pushed = names(src);
    const pulled = names(compose!);
    // Anti-vacuity on both sides, and it is the real count: two services, two
    // images. A regex that stopped matching would compare two empty arrays and
    // pass.
    expect(pushed.length, 'o ci.yml não empurra duas imagens — o job mudou de forma?').toBe(2);
    expect(pulled.length, 'a composição não puxa duas imagens').toBe(2);
    expect(pushed, 'o ci.yml publica nomes que a composição não puxa').toEqual(pulled);
    // And the same registry host on both sides, which the name comparison above
    // cannot see: two identical names under different hosts would pass it.
    expect(src, 'o ci.yml mudou de registro').toContain('ghcr.io');
    expect(compose, 'a composição mudou de registro').toContain('ghcr.io');
  });
});
