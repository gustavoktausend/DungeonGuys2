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
// The one import from apps/ in this file, and it carries the phase's only
// number that has to agree across a process boundary: the container's stop
// deadline — `stop_grace_period` in ops/docker-compose.yml — must sit ABOVE the
// process's own watchdog. It used to be systemd's TimeoutStopSec in a unit that
// D2-30 retired; the number moved, the requirement did not.
// Importing beats copying because a copy is what drifts. It costs nothing:
// shutdown.ts holds no Node global by design, so it compiles inside this
// program exactly as it compiles inside apps/server's.
import { SHUTDOWN_GRACE_MS } from '../apps/server/src/shutdown';

// Vite's raw glob, not node:fs — tsconfig's `types` is ["vite/client"] only.
// The pattern globs the directory rather than a suffix because the Caddyfile
// has no extension.
const OPS = import.meta.glob<string>('../ops/*', {
  query: '?raw', import: 'default', eager: true,
});

// tools/ops/ is the Node half of the same subsystem: restore-verify.mjs is the
// only executable of this phase that does NOT live in ops/, because it follows
// tools/README.md rather than the shell conventions of §1. It is asserted here,
// next to the units it exercises, instead of in a file of its own.
const TOOLS_OPS = import.meta.glob<string>('../tools/ops/*', {
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
  // TYPE IS NOT THE GUARD; LENGTH IS. `''` is a string, so a glob that resolves
  // and reads nothing passes toBeTypeOf and then SATISFIES every not.toContain
  // and not.toMatch below it. Measured on this file before the floor existed,
  // with ops/rollback.sh stubbed to '' (a file D2-30 has since retired, which
  // does not touch the measurement): 44 of 46 tests stayed green, and the
  // two that survived included both assertions that carry the requirement —
  // D2-06 (nenhuma chamada de rede) and D2-07 (nunca toca no banco). They
  // passed over an empty haystack.
  //
  // tests/dom-ids.test.ts:50-54 records the same trap from plan 02-02, where a
  // `?raw` CSS import stubbed to '' shipped a green test that had read nothing.
  // This file — the one guarding infrastructure that has never executed — was
  // the one that skipped the lesson.
  //
  // The floor is far below the smallest real file (ops/Dockerfile.web, 2.3 kB)
  // on purpose: it must catch emptiness and never police size. The previous
  // holder of that title left with D2-30, and the floor did not move with it —
  // it answers to emptiness, not to whatever happens to be smallest.
  expect((src as string).length, `ops/${name} veio vazio`).toBeGreaterThan(200);
  return src as string;
}

/** The same guard, for the Node half. */
function readTool(name: string): string {
  const src = TOOLS_OPS[`../tools/ops/${name}`];
  expect(src, `o glob não encontrou tools/ops/${name}`).toBeTypeOf('string');
  expect((src as string).length, `tools/ops/${name} veio vazio`).toBeGreaterThan(200);
  return src as string;
}

// docs/OPERACAO.md — the phase's operations record, and the THIRD half of this
// subsystem. It gets a glob of its own rather than joining OPS because it is
// prose and not configuration: almost every assertion above is about a
// directive the box executes, and none of those applies to a document.
//
// It is asserted HERE, next to the files it describes, for the reason the
// tools/ops/ comment above gives: this is where the operator-facing half of
// ops/ is already ruled over, and a separate test file would be a second place
// to remember. What it buys is not style — the D2-15 leak gate is the point.
// Task 3 of plan 02-04 pastes command output from a live box into this file,
// and pasted output is the single most likely way an address or a credential
// ever enters this repository.
const DOCS = import.meta.glob<string>('../docs/OPERACAO.md', {
  query: '?raw', import: 'default', eager: true,
});

/** The same anti-vacuity guard, for the document. */
function readDoc(): string {
  const src = DOCS['../docs/OPERACAO.md'];
  expect(src, 'o glob não encontrou docs/OPERACAO.md').toBeTypeOf('string');
  // The floor is higher than the 200 bytes of read() because this file has a
  // declared minimum of 90 lines in the plan that creates it: a stub of four
  // headings would satisfy every `toContain` below and prove nothing.
  expect((src as string).length, 'docs/OPERACAO.md veio vazio ou é um esqueleto')
    .toBeGreaterThan(2000);
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
  const stripped = read(name)
    .split('\n')
    .filter((line) => !/^\s*#/.test(line))
    .join('\n');
  // The second floor, and it is not redundant with the first: most assertions
  // in this file read code(), not read(), so a file that passed the length
  // guard while being nothing but prose would still hand them an empty
  // haystack. Every ops/ file here is majority comment by design, so this is
  // the number the vacuity would actually hide behind. Smallest real value is
  // ops/Dockerfile.web, at 88 bytes once stripped — it is three directives under
  // a long header, which is what every file of ops/ looks like by design.
  expect(stripped.trim().length, `ops/${name} é só comentário`).toBeGreaterThan(50);
  return stripped;
}

describe('ops/Caddyfile', () => {
  it('roteia /api, /ws e o estático a partir da raiz dentro da imagem', () => {
    const cfg = code('Caddyfile');
    expect(cfg).toContain('handle /api/*');
    expect(cfg).toContain('reverse_proxy');
    expect(cfg).toContain('handle /ws');
    // The path ops/Dockerfile.web copies dist/ into: if the two ever disagree,
    // the container serves an empty directory and every request is a 404. It
    // used to be a release symlink that a deploy script swapped under a running
    // Caddy — D2-24 replaced that with "point at the previous image", so the
    // bytes now live INSIDE the image and changing version is changing
    // container.
    expect(cfg).toContain('root * /srv/www');
    // The old root has to be GONE rather than merely outvoted: a Caddyfile
    // carrying both would serve whichever one Caddy resolved first, and the
    // stale one is the one that still exists on the box being migrated from.
    expect(cfg).not.toContain('/srv/dg2/current');
  });

  it('usa {$VAR} no upstream, e o endereço do site não carrega domínio (P-6)', () => {
    const cfg = code('Caddyfile');
    // P-6 used to be about the SITE ADDRESS carrying the domain. The site
    // address carries no placeholder at all now — the Traefik router of Coolify
    // owns the name — so the trap moved to the one placeholder left in the file,
    // and the rule did not move with it: {$VAR} is substituted before the parse
    // and {env.VAR} is resolved too late.
    expect(cfg).toContain('{$DG2_UPSTREAM');
    expect(cfg).not.toContain('{env.DG2_UPSTREAM}');
    // Scheme AND port. A port-only address would still let Caddy choose HTTPS
    // for itself, which is the other way to arrive at the ACME attempt that
    // `auto_https off` exists to prevent.
    expect(cfg, 'o endereço do site não é esquema + porta').toMatch(/^http:\/\/:\d+ \{/m);
    // read() and not code(): a domain leaked in a comment is leaked all the
    // same, so this one sweeps the whole file (D2-15).
    expect(read('Caddyfile'), 'o Caddyfile voltou a nomear o domínio')
      .not.toContain('DG2_DOMAIN');
  });

  it('o bloco global desliga o ACME, porque o certificado é do Traefik (T-2-ACME)', () => {
    const cfg = code('Caddyfile');
    expect(cfg).toContain('auto_https off');
    // Left on, Caddy would request a certificate for a name it does not control
    // and would take 80 and 443 of its own namespace to do it; what a browser
    // gets is a redirect loop. It is an outage this container inflicts on
    // itself on the first deploy, with nothing external to blame.
    //
    // The global block must also be the FIRST block: Caddy refuses one that
    // follows a site block, so getting this wrong is a parse failure at boot
    // rather than a silently ignored option.
    expect(cfg.trim().startsWith('{')).toBe(true);
  });

  it('a API de administração do Caddy fica desligada (T-2-ADMIN)', () => {
    // It listens on a fixed local port by default and accepts arbitrary
    // configuration reloads from anything that reaches it. Nothing in this
    // deployment uses it, so it is surface with no consumer.
    expect(code('Caddyfile')).toContain('admin off');
  });

  it('o Caddy confia no X-Forwarded-For que o Traefik entrega (DM-10)', () => {
    // THE ONE ASSERTION IN THIS FILE WHOSE DEFECT WOULD ONLY SHOW UP IN A PHASE
    // THAT HAS NOT RUN YET, which is exactly why it is here and not there.
    //
    // Without this line Caddy discards an incoming X-Forwarded-For from an
    // untrusted source — by default and on purpose, because a client can forge
    // one — and replaces it with the address it saw itself, which behind a proxy
    // is the proxy's. apps/server/src/signaling/limiter.ts then counts the whole
    // internet in one bucket, and the two outcomes are "nobody is limited" or
    // "everybody is", the second being indistinguishable from the outside from
    // the server being down.
    //
    // WHAT IT BUYS: the client's real address survives both hops, so the rate
    // limiter of phase 3 means something. Traefik already does the other half —
    // it too refuses a forwarded address from a peer outside its trusted list —
    // and without both halves the defence does not exist (T-2-XFF).
    const cfg = code('Caddyfile');
    expect(cfg).toContain('trusted_proxies static private_ranges');
    // Inside `servers`, which is the only block where Caddy reads it. The same
    // words in the wrong place are a no-op that looks like a fix.
    expect(cfg).toMatch(/servers\s*\{[^}]*trusted_proxies static private_ranges/);
  });

  it('não usa a diretiva route, cuja ordem seria carga funcional (P-5)', () => {
    // A directive opens a line, so anchoring to the start of a line is precise
    // enough to tell the directive from any word that merely contains it.
    expect(code('Caddyfile')).not.toMatch(/^\s*route\b/m);
  });

  it('não transforma 404 em index.html servido com 200 (DM-5)', () => {
    expect(code('Caddyfile')).not.toContain('try_files');
  });

  it('manda os quatro cabeçalhos de segurança, e do lado do site', () => {
    // Caddy sends none of these by default, HSTS included — automatic TLS and
    // HSTS are different things and only the first one is automatic.
    const cfg = code('Caddyfile');
    for (const h of [
      'X-Content-Type-Options nosniff',
      'Referrer-Policy strict-origin-when-cross-origin',
      'Strict-Transport-Security',
      'Content-Security-Policy',
    ]) {
      expect(cfg, `o Caddyfile não manda ${h}`).toContain(h);
    }
    // `preload` is a one-way door: getting off the list takes months, and this
    // is one box whose domain may still move. Its ABSENCE is the decision.
    expect(cfg).not.toContain('preload');
    // No 'unsafe-inline' anywhere: index.html carries one module script and no
    // style element, and el.style.foo from JavaScript is CSSOM, which style-src
    // does not govern.
    expect(cfg).not.toContain("'unsafe-inline'");
    expect(cfg).not.toContain("'unsafe-eval'");
    expect(cfg).toContain("frame-ancestors 'none'");
    // Before the static `handle`, so /api and /ws answers carry them too. The
    // index comparison is the assertion: inside the handle they would cover the
    // game and nothing else.
    const header = cfg.indexOf('X-Content-Type-Options');
    const handle = cfg.indexOf('handle /api/*');
    expect(header).toBeGreaterThan(-1);
    expect(header, 'o bloco de header tem de vir antes dos handle').toBeLessThan(handle);
  });

  it('nenhuma classe de arquivo servido fica sem Cache-Control', () => {
    // /assets/dungeon_tileset.png, /fonts/*.woff2 and /icons/*.png are copied
    // from public/ verbatim: STABLE NAMES, MUTABLE BYTES. They used to match no
    // matcher at all, so the browser applied heuristic freshness and a redeploy
    // of changed art under the same filename served stale bytes to anyone not
    // yet controlled by a new service worker.
    const cfg = code('Caddyfile');
    expect(cfg).toContain('@stable');
    expect(cfg).toContain('must-revalidate');
    // The `not` is load-bearing rather than decorative: @assets and @stable
    // both match /assets/index-<hash>.js, both are `header` directives, and
    // whichever ran second would overwrite the other — silently unpinning
    // exactly the two files whose whole point is being pinned.
    expect(cfg).toMatch(/@stable\s*\{[^}]*not path \/assets\/index-\*\.js/);
    // And the immutable pin survives, because dropping it is the other way to
    // make this test pass.
    expect(cfg).toContain('public, max-age=31536000, immutable');
    expect(cfg).toContain('@shell');
  });

  it('responde 503 legível por máquina quando o upstream cai', () => {
    const cfg = code('Caddyfile');
    expect(cfg).toContain('handle_errors');
    expect(cfg).toContain('{"status":"unavailable"}');
  });

  it('a disputa da 443 virou decisão escrita, e a 443 deixou de ser do Caddy', () => {
    // read() e não code(): a decisão VIVE num comentário, e esta é justamente a
    // asserção que code() tornaria vazia — o texto que ela persegue nunca
    // esteve fora de um comentário.
    const cfg = read('Caddyfile');
    // O que saiu. Um comentário que promete resolver algo depois envelhece para
    // "ninguém sabe se isso ainda vale", que é pior que não ter nota nenhuma.
    expect(cfg, 'o Caddyfile ainda adia a decisão da 443')
      .not.toContain('SCHEDULED FOR PHASE 3');
    // O DONO TROCOU, e é a parte nova desta asserção. A 443 é do Traefik do
    // Coolify, que termina o TLS e é compartilhado com a produção de outro
    // projeto na mesma caixa. Escrito no arquivo, isso é o que impede a próxima
    // pessoa de "devolver" a 443 ao Caddy e derrubar o vizinho junto.
    expect(cfg, 'o Caddyfile não diz a quem pertence a 443')
      .toMatch(/443 IS NOT CADDY'S/);
    expect(cfg).toMatch(/Traefik/);
    // O que já estava e continua: a saída nomeada, para que a dívida seja
    // reconsiderável em vez de redescoberta. `layer4` é o app do Caddy que
    // rotearia por ALPN/SNI.
    expect(cfg).toContain('layer4');
    // E a advertência que o plano 03-04 paga com o grace de 60 s, também com o
    // dono trocado: quem fecha as WebSockets ativas deixou de ser um reload e
    // passou a ser a recriação do contêiner. As duas metades andam juntas —
    // remover uma traz de volta "todo mundo caiu ao mesmo tempo e eu não fiz
    // nada".
    expect(cfg).toMatch(/recreation of the container/);
    expect(cfg).toContain('60 s');
    expect(cfg).toContain('03-04');
  });

  it('o CSP já cobre o wss:// do signaling sem precisar mudar', () => {
    // connect-src 'self' inclui wss:// na mesma origem, então /ws entrar em uso
    // NÃO é motivo para afrouxar o CSP. O caso existe para que a próxima pessoa
    // que "precisar liberar o WebSocket" encontre a resposta já testada.
    const cfg = code('Caddyfile');
    expect(cfg).toMatch(/connect-src 'self'/);
    expect(cfg).not.toContain('connect-src *');
    expect(cfg).not.toMatch(/connect-src[^;"]*wss:/);
  });
});

/**
 * ops/docker-compose.yml sliced into its services, and the slicing itself
 * carries an assertion: the names have to be exactly `web` and `api`.
 *
 * That is not bookkeeping. ops/Caddyfile defaults its upstream to `api:8080`,
 * so the Compose service name is half of a contract written in a different
 * file — rename the service and the only symptom is every /api request becoming
 * a 502 with nothing in either file looking wrong.
 *
 * Line-based rather than a YAML parser because this program has no YAML
 * dependency and the structure being read is two levels deep. code() and not
 * read(): every assertion below is about the state of a directive, and the
 * header of that file explains at length four directives it deliberately does
 * NOT declare — without the comment filter, the explanation would fail the
 * assertions it exists to justify.
 */
function composeServices(): Map<string, string> {
  const out = new Map<string, string>();
  let inServices = false;
  let current: string | null = null;
  let buf: string[] = [];
  const flush = (): void => {
    if (current !== null) out.set(current, buf.join('\n'));
    current = null;
    buf = [];
  };
  for (const line of code('docker-compose.yml').split('\n')) {
    if (/^services:\s*$/.test(line)) { inServices = true; continue; }
    // Any other column-zero key ends the services block.
    if (/^\S/.test(line)) { flush(); inServices = false; continue; }
    if (!inServices) continue;
    const m = /^ {2}([A-Za-z][\w-]*):\s*$/.exec(line);
    if (m) { flush(); current = m[1]!; continue; }
    if (current !== null) buf.push(line);
  }
  flush();
  expect([...out.keys()].sort(), 'os serviços da composição mudaram de nome')
    .toEqual(['api', 'web']);
  return out;
}

/** The named volumes declared at the bottom of the composition. */
function composeVolumes(): string[] {
  const names: string[] = [];
  let inVolumes = false;
  for (const line of code('docker-compose.yml').split('\n')) {
    if (/^volumes:\s*$/.test(line)) { inVolumes = true; continue; }
    if (/^\S/.test(line)) { inVolumes = false; continue; }
    if (!inVolumes) continue;
    const m = /^ {2}([A-Za-z][\w-]*):\s*$/.exec(line);
    if (m) names.push(m[1]!);
  }
  return names;
}

/**
 * The composition and the two images, and every case here is the HEIR of an
 * assertion that died with ops/dg2.service or ops/litestream.service. Each one
 * names its ancestor, because a property that migrated without a note reads like
 * a property that was dropped.
 *
 * The whole point of writing them in the same commit that creates the files, and
 * before the commit that deletes the units, is that no window exists in which a
 * property of this deployment is unguarded.
 */
/**
 * The tag expression both services carry, spelled once here because it appears
 * three times in the composition and every assertion about it has to mean the
 * same thing.
 *
 * The REQUIRED form, `:?`, and not a default. A default was tried on 2026-09-10
 * and took production down: referencing `${SOURCE_COMMIT}` makes Coolify create an
 * empty SOURCE_COMMIT panel variable, and Coolify injects the real commit only
 * when no such variable exists — the reference suppressed the very injection it
 * depended on. The composition header carries the full measurement. What `:?`
 * buys is that a blank tag fails at interpolation, naming the variable, instead
 * of reaching the daemon as `image: '...:'` and coming back `invalid reference
 * format`, which names nothing.
 */
const TAG_EXPR =
  '${DG2_IMAGE_TAG:?defina a tag no painel: sha de commit de 40 hex, o mesmo que o job image publicou}';

describe('ops/docker-compose.yml e as duas imagens', () => {
  it('não declara o par de relay, porque Compose não sabe dizer "ausente"', () => {
    // MEASURED IN A REAL CONTAINER, not read off the spec. `- KEY=${VAR}` with
    // VAR undefined renders `KEY: ""` and the container receives the key PRESENT
    // AND EMPTY; `optional()` in apps/server/src/env.ts refuses blank on purpose
    // (T-3-10), so declaring the pair here made the state the server calls
    // supported — no relay at all — impossible to reach, and the api could not
    // boot in ANY configuration. The short form `- KEY` renders `KEY: null` and
    // would be absent, but Coolify appends `env_file: .env` to every service, so
    // one blank row in the panel re-injects the empty value.
    //
    // This assertion is what stops phase 3 from returning ONE of the two lines,
    // or from returning them before coturn exists to give them a value. The
    // names are matched without a following `=` or `:` so the D2-15 anti-leak
    // block below is not tripped by this test's own vocabulary.
    const api = composeServices().get('api')!;
    for (const key of ['DG2_TURN_SECRET', 'DG2_TURN_REALM']) {
      expect(
        new RegExp(`^\\s*-\\s*${key}\\b`, 'm').test(api),
        `o serviço api declara ${key}: Compose entregaria a chave vazia e o servidor recusa subir`,
      ).toBe(false);
    }
  });

  it('limita a memória do cgroup E o heap do V8, e o segundo é menor (P-10)', () => {
    // Heir of the dg2.service pair. V8 sizes its default old space from the
    // MACHINE's memory — nearly 8 GiB on this box — and not from the cgroup
    // ceiling, so a limit on one without the other converts a slow leak into an
    // OOM-kill instead of into garbage collection. The pair IS the assertion,
    // and the two numbers are compared rather than merely both present.
    const api = composeServices().get('api')!;
    const heap = /--max-old-space-size=(\d+)/.exec(api);
    const cgroup = /^\s*mem_limit:\s*(\d+)m\s*$/m.exec(api);
    expect(heap, 'o serviço api não declara teto de heap do V8').not.toBeNull();
    expect(cgroup, 'o serviço api não declara mem_limit').not.toBeNull();
    expect(Number(heap![1])).toBeLessThan(Number(cgroup![1]));
    // And the other service is capped too, for the neighbour's sake rather than
    // for this project's: the ceilings exist so a leak in the phase 3 signalling
    // cannot reach another project's production on the same box (T-2-MEM).
    const web = composeServices().get('web')!;
    expect(web, 'o serviço web não declara mem_limit').toMatch(/^\s*mem_limit:/m);
  });

  it('nenhum serviço publica porta no host — é disso que o bind de contêiner depende', () => {
    // THE HEIR OF "não publica a API fora do loopback", AND THE ASSERTION THIS
    // ARCHITECTURE ACTUALLY NEEDS. The old unit could be checked for the absence
    // of a wide bind address; this deployment binds every interface ON PURPOSE
    // (DM-9), because 127.0.0.1 would be the loopback of the api container and
    // Caddy lives in another one. What replaces the defence is structural: with
    // nothing published on the host, the port crosses neither the UFW nor the
    // NAT, and the only origin that can reach it is the bridge Coolify created
    // (T-2-BIND).
    //
    // apps/server/src/index.ts names this file and this assertion in the comment
    // above serve(). Delete this case and that comment becomes a lie — which is
    // why it is spelled out there and asserted here.
    expect(code('docker-compose.yml'), 'a composição publicou porta no host')
      .not.toMatch(/^\s*ports:/m);
  });

  it('não declara rede própria nem passo de build', () => {
    const yml = code('docker-compose.yml');
    // Coolify's own documentation records that declaring a network here causes
    // intermittent route loss in Traefik — and the route that drops is shared
    // with the neighbouring project (T-2-NEIGHBOR).
    expect(yml, 'a composição declarou rede própria').not.toMatch(/^\s*networks:/m);
    // D2-23: the images COPY artifacts that passed the cross-engine gate. A
    // build step here would be a no-op today and construction on a 2-vCPU box
    // shared with production tomorrow, and it would annul phase 1 (T-2-BUILD).
    expect(yml, 'a composição declarou passo de build').not.toMatch(/^\s*build:/m);
  });

  it('dá ao contêiner mais tempo que o watchdog do processo pede (WR-07)', () => {
    // Heir of TimeoutStopSec, and the form that made it right survives: the
    // process's own deadline is IMPORTED from apps/server/src/shutdown.ts, not
    // copied, because a copy is what drifts. The Node process drains for up to
    // SHUTDOWN_GRACE_MS and only THEN does Litestream run its final sync, so
    // Docker's 10 s default would cut the second step — and what is lost are the
    // last writes of a currency ledger (T-2-BACKUP).
    const api = composeServices().get('api')!;
    const m = /^\s*stop_grace_period:\s*(\d+)s\s*$/m.exec(api);
    expect(m, 'o serviço api herda os 10s do padrão do Docker').not.toBeNull();
    expect(Number(m![1]) * 1000).toBeGreaterThan(SHUTDOWN_GRACE_MS);
  });

  it('toda imagem é referenciada pela tag de sha, nunca por uma tag móvel (C-6)', () => {
    // Heir of "arranca pelo symlink que o rollback move". A moving tag destroys
    // the rollback of D2-24 outright: there is no "previous image" when the
    // previous NAME points at the new content (T-2-ROLLBACK).
    //
    // The expression gained a default — the commit Coolify is deploying — so the
    // ordinary deploy needs no hand-typed tag. BOTH SIDES OF IT ARE STILL A SHA:
    // DG2_IMAGE_TAG is the panel override that D2-24 pulls to revert, and
    // SOURCE_COMMIT is written by Coolify as the full 40-hex commit. Neither is a
    // name a publisher can move, which is the whole content of C-6.
    const bad: string[] = [];
    for (const [name, body] of composeServices()) {
      // `.+?` and not `\S+`: the required-variable form carries a human error
      // message, and a message worth reading has spaces in it.
      const m = /^\s*image:\s*(.+?)\s*$/m.exec(body);
      expect(m, `o serviço ${name} não declara imagem`).not.toBeNull();
      if (!m![1]!.endsWith(`:${TAG_EXPR}`)) bad.push(`${name}: ${m![1]}`);
    }
    expect(bad, 'imagem fora da tag de sha').toEqual([]);
    expect(code('docker-compose.yml')).not.toMatch(/:(latest|main)\b/);
  });

  it('a tag da imagem e DG2_RELEASE são a MESMA expressão, caractere a caractere', () => {
    // What makes step 5 of the deploy check mean anything: the health route is
    // compared byte for byte against the sha that was published, and it can only
    // carry the truth if the string that names the release is the string that
    // names the image. Two copies that must agree are one edit away from not
    // agreeing, and the symptom is the quietest kind — a deploy check that passes
    // while reporting a release nobody is running.
    //
    // Compared to EACH OTHER and not to a literal spelled in this test: a literal
    // here would be a third copy, and the third copy is the one nobody updates.
    const api = composeServices().get('api')!;
    const release = /^\s*-\s*DG2_RELEASE=(.+?)\s*$/m.exec(api);
    expect(release, 'o serviço api não declara DG2_RELEASE').not.toBeNull();
    const image = /^\s*image:\s*[^\s:]+:(\$\{.+?)\s*$/m.exec(api);
    expect(image, 'o serviço api não declara imagem com interpolação').not.toBeNull();
    expect(release![1], 'DG2_RELEASE divergiu da tag da imagem').toBe(image![1]);
  });

  it('todo serviço busca no registro só o que não estiver em disco (D2-24)', () => {
    // The line that makes reverting use NO NETWORK, which is the scenario the
    // rollback exists for — the network being one of the things that may be
    // broken. Asserted per service, because one service missing it is enough to
    // turn a rollback into a pull.
    const bad: string[] = [];
    for (const [name, body] of composeServices()) {
      if (!/^\s*pull_policy:\s*missing\s*$/m.test(body)) bad.push(name);
    }
    expect(bad, 'serviço sem pull_policy: missing').toEqual([]);
  });

  it('o caminho do banco é a MESMA string nos dois arquivos, comparada entre eles', () => {
    // Neither side is compared against a literal written here: the test reads
    // both files and compares them to each other, so the pair cannot drift in
    // the one direction that matters. The symptom of drift is the quietest a
    // backup has — litestream replicating a file nobody writes, reporting
    // success throughout.
    const api = composeServices().get('api')!;
    const declared = /^\s*-\s*DG2_DB=(\S+)\s*$/m.exec(api);
    expect(declared, 'o serviço api não declara o caminho do banco').not.toBeNull();
    expect(code('litestream.yml'), 'o Litestream replica outro caminho')
      .toContain(`path: ${declared![1]}`);
  });

  it('a réplica do Litestream vive num SEGUNDO volume persistente (D2-33)', () => {
    // THE ASSERTION AGAINST A SILENT FAILURE, AND THE SILENCE IS WHAT MAKES IT
    // WORTH A CASE OF ITS OWN. If the replica path fell in a container layer,
    // the first redeploy would erase the backup WITH NO ERROR AT ALL: the
    // configuration still names a path, litestream still reports success, and
    // the loss is discovered on the one day the backup is needed. D2-33 records
    // the trap explicitly; this is what keeps it shut.
    //
    // A SECOND volume, not a subdirectory of the database's: two volumes is the
    // literal requirement, and a replica inside the database's own volume would
    // satisfy "persistent" while making `restore` read from the thing it is
    // restoring.
    const api = composeServices().get('api')!;
    const replica = /^\s*-\s*DG2_REPLICA_PATH=(\S+)\s*$/m.exec(api);
    expect(replica, 'o serviço api não declara o caminho da réplica').not.toBeNull();
    const dbMount = /^\s*-\s*([\w-]+):(\/\S+)\s*$/gm;
    const mounts = [...api.matchAll(dbMount)].map((m) => [m[1]!, m[2]!] as const);
    expect(mounts.length, 'o serviço api monta menos de dois volumes')
      .toBeGreaterThanOrEqual(2);
    const declaredVolumes = composeVolumes();
    const holder = mounts.find(([, target]) => replica![1]!.startsWith(`${target}/`));
    expect(holder, `nada monta um volume que contenha ${replica![1]}`).toBeTruthy();
    expect(declaredVolumes, `${holder?.[0]} não é volume nomeado da composição`)
      .toContain(holder![0]);
    // And it is not the database's volume.
    const dbPath = /^\s*-\s*DG2_DB=(\S+)\s*$/m.exec(api)![1]!;
    const dbHolder = mounts.find(([, target]) => dbPath.startsWith(`${target}/`));
    expect(holder![0], 'a réplica mora no volume do banco, não num segundo')
      .not.toBe(dbHolder![0]);
  });

  it('o Dockerfile.api roda como usuário não-root', () => {
    // Heir of "roda como dg2 num sandbox, nunca como root". The process opens a
    // durable database on a mounted volume, on a box that hosts another
    // project's production (T-2-DATA).
    const img = code('Dockerfile.api');
    const m = /^USER\s+(\S+)\s*$/m.exec(img);
    expect(m, 'ops/Dockerfile.api não declara USER').not.toBeNull();
    expect(m![1]).not.toBe('root');
  });

  it('o Litestream é PID 1 e o Node é filho dele, não o contrário', () => {
    // Heir of "é irmã de dg2.service e não filha". Measured in the v0.5 source:
    // `replicate -exec` forwards the exact signal and WAITS for the child before
    // the final sync, so the graceful shutdown of plan 02-08 survives with no
    // tini, no shell trap and no supervisor. A shell entrypoint with a `trap` is
    // the classic PID 1 trap and would eat the signal in silence.
    const img = code('Dockerfile.api');
    const m = /^ENTRYPOINT\s+(\[[\s\S]*?\])/m.exec(img);
    expect(m, 'ops/Dockerfile.api não declara ENTRYPOINT em forma exec').not.toBeNull();
    const argv = [...m![1]!.matchAll(/"([^"]*)"/g)].map((x) => x[1]!);
    expect(argv[0], 'o ENTRYPOINT não começa pelo litestream').toBe('litestream');
    expect(argv).toContain('-exec');
    // The Node process is an ARGUMENT to -exec and never the entrypoint itself.
    expect(argv.indexOf('-exec')).toBeGreaterThan(0);
    expect(argv[argv.indexOf('-exec') + 1], 'o -exec não envolve o node')
      .toMatch(/^node\s/);
    // Heir of "lê a configuração instalada, sem valor embutido". The old unit
    // read a file an operator had copied onto the box by hand and an
    // EnvironmentFile systemd expanded; there is neither. The config enters the
    // IMAGE by COPY, so the reviewable copy and the running copy are the same
    // file — and the path the entrypoint reads is compared to the path the image
    // writes, rather than both being trusted to say the same thing.
    const config = argv[argv.indexOf('-config') + 1];
    expect(argv, 'o ENTRYPOINT não passa -config').toContain('-config');
    expect(img, `nada copia ops/litestream.yml para ${config}`)
      .toContain(`COPY ops/litestream.yml ${config}`);
  });

  it('o Dockerfile.web copia o dist/ para a raiz que o Caddyfile serve', () => {
    // Two files that have to agree, compared to each other. Disagree and the
    // container serves an empty directory: every request a 404, with Caddy
    // healthy and nothing in any log saying why.
    const root = /^\s*root \* (\S+)\s*$/m.exec(code('Caddyfile'));
    expect(root, 'o Caddyfile não declara raiz estática').not.toBeNull();
    expect(code('Dockerfile.web'), 'a imagem copia o dist/ para outro lugar')
      .toContain(`dist/ ${root![1]}`);
    // And nothing is built here: the bytes are the artifact that passed the
    // cross-engine gate (D2-05/D2-23, T-2-BUILD).
    expect(code('Dockerfile.web')).not.toMatch(/npm (ci|run|install)/);
  });

  it('o binário do Litestream entra com sha256 fixado e verificado (T-2-SC)', () => {
    // A third-party binary that opens the database. The pin is only worth
    // something if it is CHECKED before extraction, so both halves are asserted:
    // the digest literal and the verification step.
    const img = code('Dockerfile.api');
    const sha = /\b[0-9a-f]{64}\b/.exec(img);
    expect(sha, 'ops/Dockerfile.api não fixa o sha256 do tarball').not.toBeNull();
    expect(img).toContain('sha256sum -c');
    // The asset name the release actually publishes. The spelling used by the
    // phase research does not exist and produces a 404 at build time, which is
    // cheap to catch here and expensive to catch there.
    expect(img).toContain('linux-x86_64');
    expect(img).not.toContain('linux-amd64');
  });
});

/**
 * The shell scripts of ops/: NONE, and the empty list is the assertion.
 *
 * D2-30 retired `deploy.sh`, `rollback.sh`, `deploy-forced.sh`,
 * `prune-releases.sh` and `cert-check.sh` — 18 cases of this file died with
 * them, in the same commit, because a window in which the suite is red for a
 * reason that is not a defect teaches everyone to ignore a red suite.
 *
 * THE LIST WAS INVERTED RATHER THAN DELETED, and that is the part worth reading.
 * "ops/ contains no shell script" is a property D2-30 wants PRESERVED: what
 * executes now is Docker, reading ops/docker-compose.yml and the two
 * Dockerfiles. Kept as an assertion, it stops a deploy script from being
 * reintroduced out of habit — which is exactly how a repository ends up with two
 * deploy paths, one of which is the one nobody remembered to update.
 */
const SCRIPTS: string[] = [];

describe('scripts de ops/', () => {
  it('ops/ não tem nenhum script de shell, e a ausência é a propriedade (D2-30)', () => {
    const found = Object.keys(OPS).filter((p) => p.endsWith('.sh')).sort();
    expect(found, 'um script de shell voltou para ops/')
      .toEqual(SCRIPTS.map((n) => `../ops/${n}`).sort());
    // And no systemd unit either: the four the box would have installed are gone
    // with the same decision, and the supervisor is Docker. Asserted next to the
    // scripts because both absences answer the same question — "who executes
    // this?" — and the answer moved for both at once.
    const units = Object.keys(OPS).filter(
      (p) => p.endsWith('.service') || p.endsWith('.timer'),
    );
    expect(units, 'uma unit do systemd voltou para ops/').toEqual([]);
  });
});

/**
 * O relay da fase 3 (SALA-04). Nada disto roda nesta máquina nem na próxima —
 * a caixa é do plano 02-04 e o coturn é do 03-11. Estes casos são a única
 * coisa que separa "a config está certa" de "a config está no repositório",
 * e o intervalo entre as duas afirmações é medido em meses.
 */
describe('ops/turnserver.conf', () => {
  it('declara as portas, a credencial efêmera e os tetos de abuso', () => {
    const cfg = code('turnserver.conf');
    for (const line of [
      // 3478 e 5349 são a decisão da fase: a 443 fica com o Caddy.
      'listening-port=3478',
      'tls-listening-port=5349',
      // Credencial efêmera por HMAC. Uma dupla fixa aqui seria um relay que
      // qualquer um usa para sempre no dia em que vazasse (T-3-03).
      'use-auth-secret',
      // Os tetos de banda e de alocação (T-3-05). Os dois desceram em 02-04
      // para casar com a faixa de relay de D2-27: a asserção calculada logo
      // abaixo é quem garante o casamento: estas duas linhas só fixam o valor.
      'user-quota=6',
      'total-quota=100',
      // A interface de gestão, onde historicamente moraram os CVEs do coturn
      // (T-3-27), e o multicast, que é amplificação de graça.
      'no-cli',
      'no-multicast-peers',
    ]) {
      expect(cfg, `turnserver.conf não declara ${line}`).toContain(line);
    }
  });

  it('declara a faixa de relay, e ela é uma faixa de verdade (D2-27, C-5)', () => {
    // A METADE DECLARADA da correção de C-5. Sem estas duas linhas o coturn
    // aloca relay no espaço efêmero inteiro (49152-65535/udp), que o UFW
    // `deny incoming` da caixa bloqueia por completo — e o relay AUTENTICA,
    // entrega um endereço ao navegador, e o tráfego nunca chega. O sintoma é
    // "um amigo específico nunca entra", indistinguível de NAT ruim.
    //
    // A outra metade é a regra de firewall, que não é versionável: ela vive na
    // caixa. O que este arquivo pode asserir é que a faixa existe e está
    // registrada em docs/OPERACAO.md, e o bloco daquele arquivo fecha o elo.
    const cfg = code('turnserver.conf');
    const min = /^min-port=(\d+)$/m.exec(cfg);
    const max = /^max-port=(\d+)$/m.exec(cfg);
    expect(min, 'turnserver.conf não declara min-port').not.toBeNull();
    expect(max, 'turnserver.conf não declara max-port').not.toBeNull();
    const lo = Number(min![1]);
    const hi = Number(max![1]);
    expect(Number.isInteger(lo) && Number.isInteger(hi)).toBe(true);
    // Uma faixa invertida ou degenerada é a forma de errar que não faz barulho:
    // o coturn recusaria a config, mas só na caixa, meses depois.
    expect(hi, 'max-port não é maior que min-port').toBeGreaterThan(lo);
    // Acima do espaço privilegiado e dentro do efêmero, que é onde um relay
    // deve alocar.
    expect(lo).toBeGreaterThan(1024);
    expect(hi).toBeLessThan(65536);
  });

  it('total-quota não promete mais alocações do que a faixa entrega (C-5)', () => {
    // A ASSERÇÃO QUE IMPEDE C-5 DE VOLTAR PELA METADE, e o número NÃO é
    // copiado: ele sai do próprio arquivo. Cada alocação de relay consome uma
    // porta da faixa, então a cota da máquina não pode ser maior que o tamanho
    // dela. O valor antigo (1200 contra cem portas) prometia doze vezes o que a
    // faixa pode entregar — o limite real teria sido "o coturn ficou sem
    // porta", chegando como alocação falha em vez de como cota, que é o mesmo
    // sintoma silencioso de sempre.
    //
    // Comparar contra uma constante copiada aqui deixaria passar exatamente o
    // erro que importa: mudar a faixa e esquecer a cota.
    const cfg = code('turnserver.conf');
    const lo = Number(/^min-port=(\d+)$/m.exec(cfg)![1]);
    const hi = Number(/^max-port=(\d+)$/m.exec(cfg)![1]);
    const total = Number(/^total-quota=(\d+)$/m.exec(cfg)![1]);
    const user = Number(/^user-quota=(\d+)$/m.exec(cfg)![1]);
    const range = hi - lo + 1;
    expect(total, `total-quota=${total} excede as ${range} portas da faixa`)
      .toBeLessThanOrEqual(range);
    // E a cota por usuário não pode ser a cota da máquina: um único jogador
    // autenticado não segura a caixa inteira.
    expect(user, 'user-quota não é menor que total-quota').toBeLessThan(total);
  });

  it('recusa as onze faixas reservadas, e são ONZE (T-3-04)', () => {
    // A CONTAGEM É A ASSERÇÃO. O modo de falha real não é apagar o bloco — é
    // publicar dez das onze linhas, e uma deny-list incompleta não faz barulho
    // nenhum: o relay funciona, o jogo funciona, e uma família inteira de
    // endereços continua alcançável a partir da internet. Conferir por leitura
    // é exatamente o que não pega isso.
    const cfg = code('turnserver.conf');
    for (const range of [
      '0.0.0.0-0.255.255.255',
      '10.0.0.0-10.255.255.255',
      // RFC 6598, o espaço compartilhado do CGNAT — e o que provedores de
      // máquinas virtuais usam nas redes internas: os vizinhos da própria VPS.
      '100.64.0.0-100.127.255.255',
      '127.0.0.0-127.255.255.255',
      '169.254.0.0-169.254.255.255',
      '172.16.0.0-172.31.255.255',
      '192.168.0.0-192.168.255.255',
      // IPv6 não é opcional: o acesso residencial brasileiro passou de metade
      // em IPv6, então uma lista só-v4 deixa aberta a metade moderna.
      '::1',
      'fc00::-fdff:ffff:ffff:ffff:ffff:ffff:ffff:ffff',
      // O link-local de IPv6, par do 169.254 acima (WR-09).
      'fe80::-febf:ffff:ffff:ffff:ffff:ffff:ffff:ffff',
      // IPv4 mapeado em IPv6: as faixas v4 acima escritas de um jeito que uma
      // regra só-v4 pode não reconhecer, dependendo da normalização.
      '::ffff:0.0.0.0-::ffff:255.255.255.255',
    ]) {
      expect(cfg, `falta denied-peer-ip=${range}`).toContain(`denied-peer-ip=${range}`);
    }
    expect((cfg.match(/^denied-peer-ip=/gm) ?? []).length,
      'a lista de denied-peer-ip não tem exatamente onze linhas').toBe(11);
  });

  it('o static-auth-secret é o placeholder literal, nunca um segredo (D2-15)', () => {
    // O arquivo é versionado; o valor real existe só em /etc/ na caixa, 0600.
    const cfg = code('turnserver.conf');
    const m = /^static-auth-secret=(.*)$/m.exec(cfg);
    expect(m, 'turnserver.conf não declara static-auth-secret').not.toBeNull();
    expect(m![1].trim()).toBe('SUBSTITUA_NA_CAIXA');
    // E a forma genérica, porque a asserção acima passa a valer nada no dia em
    // que alguém acrescentar uma SEGUNDA linha com o valor de verdade: nenhuma
    // corrida longa de caracteres de segredo em lugar nenhum do arquivo,
    // comentários incluídos.
    const runs = read('turnserver.conf').match(/[A-Za-z0-9+/]{32,}={0,2}/g) ?? [];
    expect(runs, 'algo com cara de segredo entrou em turnserver.conf').toEqual([]);
    // O realm também é placeholder: nada versionado diz onde a máquina mora.
    expect(cfg).toContain('realm=SEU_DOMINIO');
  });

  it('nem o relay nem o drop-in pedem a 443 — ela é do Caddy', () => {
    // A decisão que substituiu o comentário "SCHEDULED FOR PHASE 3". Se um dia
    // TURN/TLS na 443 for construído, é aqui que a colisão apareceria primeiro.
    for (const file of ['turnserver.conf', 'coturn-dropin.conf']) {
      expect(code(file), `${file} disputa a 443 com o Caddy`)
        .not.toMatch(/^(?:tls-)?listening-port=443$/m);
    }
  });
});

describe('ops/coturn-dropin.conf', () => {
  it('declara o orçamento de memória de §10 e o endurecimento do processo', () => {
    const unit = code('coturn-dropin.conf');
    for (const line of [
      // Os ~128 M que ops/README.md §10 reservava só em prosa (D2-19).
      'MemoryHigh=96M',
      'MemoryMax=128M',
      // O mesmo endurecimento que a unit do servidor carregava antes de D2-30
      // aposentá-la, aqui para um processo que termina UDP escolhido por
      // atacante (T-3-28). O coturn continua nativo no host (D2-26), então o
      // sandbox dele continua sendo do systemd e não de um contêiner.
      'NoNewPrivileges=true',
      'ProtectSystem=strict',
      'ProtectHome=true',
      'PrivateTmp=true',
    ]) {
      expect(unit, `o drop-in não declara ${line}`).toContain(line);
    }
    // O destino fica no topo do arquivo, em comentário: um drop-in copiado
    // para /etc/systemd/system/ sem o diretório .d é um arquivo inerte.
    expect(read('coturn-dropin.conf')).toContain('coturn.service.d');
  });

  it('é drop-in e não cópia da unit do distribuidor (T-3-SC)', () => {
    // Um ExecStart aqui significaria ter copiado coturn.service, e a partir daí
    // as correções de segurança do pacote parariam de chegar à caixa.
    const unit = code('coturn-dropin.conf');
    expect(unit, 'o drop-in tem ExecStart — virou cópia da unit')
      .not.toContain('ExecStart');
    // A ausência do par NODE_OPTIONS é decisão, não esquecimento: a armadilha
    // do heap do V8 contra o limite do cgroup é problema do V8, e coturn é C.
    // O comentário que explica isso vive no arquivo; code() o remove antes,
    // que é o que impede a explicação de invalidar a asserção.
    expect(unit).not.toContain('NODE_OPTIONS');
    expect(unit).toContain('[Service]');
  });
});

describe('ops/litestream.yml', () => {
  it('usa a chave replica no SINGULAR, como o v0.5 exige (P-8)', () => {
    // Every pre-v0.5 tutorial shows a plural list. Pasting one makes litestream
    // reject or ignore the configuration, and the way that is discovered is by
    // needing the backup. The comment stripping matters here: the file EXPLAINS
    // the plural form in prose, and without the filter the explanation would
    // fail the assertion it exists to justify.
    const yml = code('litestream.yml');
    const lines = yml.split('\n');
    expect(lines.filter((l) => l.includes('replica:'))).toHaveLength(1);
    expect(lines.filter((l) => l.includes('replicas:'))).toHaveLength(0);
  });

  it('replica o banco que o serviço `api` escreve, para um caminho local (D2-33)', () => {
    const yml = code('litestream.yml');
    // The path the COMPOSITION hands the server, not the one a StateDirectory
    // used to create — the unit that owned that directive is gone and the volume
    // of ops/docker-compose.yml took its place. If the two files ever disagree,
    // litestream replicates a file nobody writes and reports success; the
    // cross-file comparison that prevents it lives in the composition's block.
    expect(yml).toContain('/var/lib/dg2/dg2.db');
    // `file`, not `s3`. D2-33 revoked the bucket and kept the MECHANISM: the
    // `replicate -exec` of D2-28, the signal forwarding of DM-13 and the 30 s
    // stop grace are all untouched. Only the destination moved, and asserting
    // the absence of the old one is what keeps a pasted pre-D2-33 snippet from
    // reintroducing a target nobody created.
    expect(yml).toContain('type: file');
    expect(yml).not.toContain('type: s3');
    expect(yml).not.toContain('endpoint:');
    // And the destination arrives as an environment reference, exactly as the
    // bucket values used to — which is what lets the composition be the single
    // place the real path is written, and therefore comparable to the volume.
    expect(yml).toContain('path: ${DG2_REPLICA_PATH}');
  });

  it('não nomeia nenhuma variável de bucket — as quatro foram revogadas (D2-33)', () => {
    // read() and not code(): the point is that the four names are GONE, and a
    // name surviving in a comment is the one that sends an operator looking for
    // a credential nobody ever created. The file explains the revocation without
    // spelling them, which is the shape that keeps this assertion honest.
    const yml = read('litestream.yml');
    for (const key of ['AWS_ACCESS_KEY_ID', 'AWS_SECRET_ACCESS_KEY',
                       'LITESTREAM_BUCKET', 'LITESTREAM_ENDPOINT']) {
      expect(yml, `${key} sobreviveu a D2-33 em ops/litestream.yml`).not.toContain(key);
    }
  });
});

/**
 * Every configuration key of the app. The runbook is the only inventory of them.
 *
 * IT USED TO BE "every key of /etc/dg2/env", AND THAT FILE NO LONGER EXISTS:
 * D2-29 moved the app's configuration into the Coolify panel, and
 * ops/docker-compose.yml is what declares which keys exist while the panel
 * decides what they are worth. The list itself survived the move intact, because
 * what it rules over is not a file — it is that a key nobody named anywhere is
 * the one a rebuild discovers by the service failing to start.
 *
 * Two edits came with the containerisation. `DG2_DOMAIN` LEFT: the domain is no
 * longer a key at all, it is the FQDN the Coolify resource assigns to the `web`
 * service, and nothing in this repository spells it. `DG2_IMAGE_TAG` ARRIVED: it
 * is the value that makes the rollback of D2-24 possible, so an operator who
 * cannot find its name cannot revert.
 *
 * The four bucket keys LEFT TOO, revoked by D2-33 before they were ever set — and
 * `DG2_REPLICA_PATH` took their place. The D2-15 block below asserts that the
 * four names appear nowhere in ops/, because a name surviving in prose sends an
 * operator looking for a credential nobody created.
 */
/**
 * Removes `${...}` interpolations, INNERMOST FIRST, so that a nested default
 * collapses instead of leaving debris behind.
 *
 * The single-pass `\$\{[^}]*\}` this replaced could not see nesting: against
 * `${DG2_IMAGE_TAG:-${SOURCE_COMMIT}}` its `[^}]*` stopped at the FIRST `}` and
 * left a stray `}` on the line, so `- DG2_RELEASE=${...:-${...}}` cleaned down to
 * `- DG2_RELEASE=}` and the anti-leak assertions below read that brace as a
 * literal value. A false positive on a leak check is not harmless: it is the
 * kind that gets an assertion loosened until it stops catching real leaks.
 *
 * Looping on `[^{}]*` — a body containing NEITHER brace — makes each pass strip
 * only complete innermost groups, and repeating drains the nest from the inside
 * out. Unbalanced braces simply survive, which is the safe direction: they stay
 * visible to the caller's regex instead of silently eating the rest of the line.
 */
function stripInterpolations(line: string): string {
  let out = line;
  let prev: string;
  do {
    prev = out;
    out = out.replace(/\$\{[^{}]*\}/g, '');
  } while (out !== prev);
  return out;
}

const ENV_KEYS = [
  'DG2_IMAGE_TAG', 'DG2_UPSTREAM', 'DG2_DB', 'DG2_RELEASE', 'DG2_REPLICA_PATH',
  // Fase 3. DG2_TURN_SECRET entra nesta lista pelo motivo pelo qual a lista
  // existe: é a metade Node de um segredo que também vive em
  // /etc/turnserver.conf, e a asserção de "nenhuma chave aparece com valor
  // literal" é o que impede o par de vazar pelo lado mais fácil de esquecer.
  'DG2_TURN_SECRET', 'DG2_TURN_REALM',
];

describe('ops/README.md', () => {
  it('o runbook nomeia todas as chaves de configuração do app', () => {
    // SURVIVED THE REWRITE UNCHANGED IN SUBSTANCE, because it was never about the
    // machine: a key that exists and is named nowhere is the one a rebuild
    // discovers by the service failing to start. Only the inventory it checks
    // against moved, from a file on a box to a panel.
    const readme = read('README.md');
    expect(ENV_KEYS.filter((k) => !readme.includes(k))).toEqual([]);
  });

  it('o runbook diz onde o recurso do Coolify aponta, e é um caminho deste repositório', () => {
    // Replaces the case about `systemctl reload caddy` not re-reading an
    // EnvironmentFile — a trap of a machine with units on it. THE EQUIVALENT TRAP
    // OF THIS ARCHITECTURE is the compose pointer: the Coolify resource clones the
    // REMOTE repository and reads one path out of it, so a pointer aimed at a file
    // the clone does not have lists ZERO SERVICES. Measured on 2026-09-09, and the
    // symptom is indistinguishable from "Coolify does not support this
    // composition" — which is the wrong conclusion, and an expensive one.
    const readme = read('README.md');
    expect(readme, 'o runbook não nomeia o caminho da composição')
      .toContain('ops/docker-compose.yml');
    expect(readme).toContain('Docker Compose Location');
    // And the prerequisite that made the first attempt fail: push before asking
    // Coolify to re-read.
    expect(readme.toLowerCase()).toMatch(/empurrar a `?main`? para o github/i);
  });

  it('o runbook diz sudo em todo comando de Docker (DM-17)', () => {
    // Replaces the case about the production node_modules and the CLI the restore
    // drill needs — the first of which CEASED TO EXIST with DM-12 (the prebuilds
    // travel inside the npm tarball) and the second of which now lives in the
    // image. What replaced both as the first thing that trips an operator is the
    // docker group: the deploy user is not in it, by a reasonable decision of the
    // neighbouring project that is not ours to change. Without `sudo` the very
    // first command fails with a message that points at the daemon.
    const readme = read('README.md');
    expect(readme.split('\n').filter((l) => l.includes('sudo docker')).length,
      'o runbook usa `sudo docker` em menos de três lugares').toBeGreaterThanOrEqual(3);
    // And the reason, not just the prefix: a runbook that says `sudo` without
    // saying why invites someone to "fix" it by joining the group, which is
    // equivalent to root on a box running another project's production.
    expect(readme).toContain('grupo `docker`');
  });

  it('o runbook fixa a retenção em 5 imagens e declara a degradação (D2-24/C-3)', () => {
    // Replaces the case about installing the systemd units in order. The number is
    // NOT NEW — it is the retention the retired pruning script had already decided,
    // carried over, which is why it is continuity of operation rather than an
    // invention. What is new, and is the part that had to be written down, is the
    // honesty: the symlink was a STRUCTURAL guarantee and a local image is a
    // PROBABILISTIC one, dependent on a cleanup routine this project does not
    // control and which is SERVER configuration shared with the neighbour.
    const readme = read('README.md');
    expect(readme).toContain('5 imagens por serviço');
    expect(readme, 'o runbook não declara a degradação de estrutural para probabilística')
      .toMatch(/probabil/i);
    expect(readme).toContain('docs/OPERACAO.md');
  });

  it('o runbook reverte apontando a tag para o sha anterior, sem rede', () => {
    // Replaces the case about chowning to root what the deploy key may not
    // rewrite — there is no deploy key and no release tree. The capability it
    // guarded, though, is the one D2-06 existed for and D2-24 inherited: the
    // rollback must work with the registry unreachable, because that is the
    // scenario it exists for. Both halves are asserted, since a rollback
    // documented without the no-network property is a rollback someone will
    // "improve" into a pull.
    const readme = read('README.md');
    expect(readme.split('\n').filter((l) => l.includes('DG2_IMAGE_TAG')).length)
      .toBeGreaterThanOrEqual(2);
    expect(readme).toContain('pull_policy: missing');
    expect(readme, 'o runbook não diz que reverter não usa rede').toMatch(/não usa rede/);
  });

  it('o runbook manda abrir QUATRO regras, a faixa de relay incluída (C-5)', () => {
    // Replaces the case about rrsync. This is the most expensive defect of phase 3
    // to diagnose, and the runbook is where its two halves are named together:
    // declaring the range without opening it and opening it without declaring it
    // produce THE SAME SYMPTOM — the relay authenticates, hands the browser an
    // address, and the traffic never arrives.
    const readme = read('README.md');
    for (const rule of ['3478/udp', '3478/tcp', '5349/tcp', '49200']) {
      expect(readme, `o runbook não manda abrir ${rule}`).toContain(rule);
    }
    // The two halves named in the SAME paragraph, which is the requirement: split
    // across sections, a reader does one and believes they are done.
    const para = read('README.md').split(/\n\s*\n/).find((p) => p.includes('49200'));
    expect(para, 'o parágrafo da faixa não existe').toBeTruthy();
    expect(para!, 'o parágrafo da faixa não nomeia o sintoma das duas metades')
      .toMatch(/min-port/);
    expect(para!).toMatch(/mesmo sintoma/);
  });

  it('o runbook põe o alarme de 30 dias do certificado no monitor externo (D2-16)', () => {
    // Replaces the case about §9 having stopped scheduling the 443. The capability
    // this one guards is the one D2-30 took away: the local certificate check died
    // because the certificate became Traefik's, AND Let's Encrypt ended its expiry
    // e-mail — so nobody warns for free any more. The threshold MOVED OWNER, from a
    // unit on this box to a third-party panel, and if that service is ever swapped
    // the threshold has to travel with it. That sentence is the assertion.
    const readme = read('README.md');
    expect(readme, 'o runbook não registra o limiar de 30 dias').toContain('30 dias');
    expect(readme, 'o runbook não diz que o alarme trocou de dono').toMatch(/mudou de dono/);
    // Both legs of the one remaining monitor: availability by keyword AND
    // certificate expiry. One without the other is half a replacement.
    expect(readme.toLowerCase()).toContain('keyword');
  });

  it('o runbook escreve que o Docker tenta para sempre onde o systemd parava (P-9)', () => {
    // THE DECLARED LOSS, AND THE CASE EXISTS SO THAT IT STAYS DECLARED. The
    // retired unit gave up after a few starts and reached `failed`, which was the
    // first link of the D2-16 alarm chain. Compose has no equivalent and inventing
    // a supervisor contradicts D2-22, so a broken migration is now an INVISIBLE
    // restart loop — and what closes the alarm chain became the healthcheck plus
    // the external monitor (T-2-LOOP, accepted).
    const readme = read('README.md');
    expect(readme, 'o runbook não escreve a diferença de supervisão')
      .toMatch(/o Docker tenta para sempre/);
    expect(readme).toMatch(/`failed`/);
    expect(readme, 'o runbook não nomeia o que fechou a corrente de alarme')
      .toContain('healthcheck');
  });

  it('o ensaio de restauração roda num contêiner descartável, e NÃO vira timer (D2-03)', () => {
    // The case survives in purpose and changes in environment. "Ambiente limpo" is
    // the literal text of the phase criterion, and it stopped being a temporary
    // directory on the same machine: it is a new container, with both volumes
    // mounted read-only and the entrypoint overridden, because the image already
    // carries the litestream binary, the sqlite3 CLI and the config.
    const readme = read('README.md');
    expect(readme).toContain('restore-verify.mjs');
    expect(readme).toContain('D2-03');
    // The container, spelled with the three properties that make it a clean room:
    // disposable, read-only, and not running the image's normal entrypoint.
    expect(readme).toContain('--rm');
    expect(readme).toContain('--entrypoint node');
    expect(readme, 'o ensaio não monta os volumes em somente-leitura').toMatch(/:ro\b/);
    // And the refusal that D2-03 decided: no recurring timer on a box with nobody
    // on call. An unattended drill failing in silence is WORSE than no drill,
    // because it was counted as one.
    expect(readme).toMatch(/recusa o timer recorrente/);
  });

  it('§12 é executável por um operador que nunca viu um coturn', () => {
    const readme = read('README.md');
    expect(readme, 'não existe §12').toMatch(/^## 12\./m);
    for (const step of [
      // Instalar, e saber que a unit vem do pacote.
      'apt-get install -y coturn',
      // Copiar a config e fechá-la.
      '/etc/turnserver.conf',
      'chmod 0600 /etc/turnserver.conf',
      // O drop-in vai para o diretório .d, não para /etc/systemd/system direto:
      // copiado no lugar errado, ele é um arquivo inerte e nada avisa.
      'coturn.service.d',
      'daemon-reload',
      // E conferir de verdade, porque ProtectSystem=strict pode recusar o start.
      'systemctl enable --now coturn',
      'systemctl status coturn',
    ]) {
      expect(readme, `§12 não manda: ${step}`).toContain(step);
    }
    // A versão é a do distribuidor, e isso é ESCOLHA: ele mantém as correções de
    // segurança e a unit. Sem a frase, a próxima pessoa "atualiza" para a última
    // do projeto e passa a manter a unit à mão.
    expect(readme, '§12 não registra de quem é a versão instalada')
      .toMatch(/distribuidor do Debian/);
    expect(readme).toContain('no-cli');
  });

  it('§12 escreve que o segredo mora em DOIS lugares (T-3-11)', () => {
    // SURVIVED INTACT, AND O NÚMERO MÍNIMO NÃO DESCE. O sintoma de trocar num só
    // é "um amigo específico nunca entra", que é indistinguível de NAT ruim — e
    // por isso capaz de custar uma noite. O runbook é o único lugar onde as duas
    // metades aparecem juntas.
    //
    // O que mudou é só a natureza do segundo lugar: era outro arquivo na mesma
    // máquina, e agora é um painel web (D2-29). A dessincronização ficou MAIS
    // fácil, não menos, porque os dois lugares deixaram de ser do mesmo tipo.
    const readme = read('README.md');
    expect(readme).toContain('static-auth-secret');
    expect(readme.split('\n').filter((l) => l.includes('DG2_TURN_SECRET')).length,
      'DG2_TURN_SECRET aparece em menos de dois lugares').toBeGreaterThanOrEqual(2);
    expect(readme).toContain('um amigo específico nunca entra');
    // E o ato que aplica a troca do lado do app. Não é mais um `restart` de unit:
    // o contêiner só lê variável de ambiente quando é recriado, e uma chave nova
    // que nenhum processo releu é uma chave que não existe.
    expect(readme).toContain('systemctl restart coturn');
    expect(readme, '§12 não diz como o lado do app relê a chave')
      .toMatch(/redeploy o recurso/);
  });

  it('§12 amarra o orçamento de memória ao drop-in que o aplica, e a cota à faixa', () => {
    // O teto de cgroup continua sendo o mesmo par. O que mudou é a COTA: o plano
    // 02-04 baixou `total-quota` de 1200 para 100 ao declarar a faixa de relay de
    // cem portas, e o runbook carregava o número antigo — duas afirmações sobre o
    // mesmo limite, uma delas falsa. Este caso compara o runbook com o arquivo que
    // manda, em vez de com um literal escrito aqui.
    const readme = read('README.md');
    expect(readme).toContain('MemoryHigh=96M');
    expect(readme).toContain('MemoryMax=128M');
    const quota = /^total-quota=(\d+)$/m.exec(code('turnserver.conf'));
    expect(quota, 'ops/turnserver.conf não declara total-quota').not.toBeNull();
    expect(readme, `o runbook não carrega o total-quota real (${quota![1]})`)
      .toContain(`total-quota=${quota![1]}`);
    // E o orçamento da caixa: não é a VPS de 2 GB que D2-19 supunha, é uma máquina
    // partilhada com produção de outro projeto. O motivo do limite sobreviveu; o
    // número de referência, não.
    expect(readme, '§12 ainda descreve a caixa de 2 GB').toMatch(/não é a VPS de 2 GB/);
  });
});

describe('tools/ops/restore-verify.mjs', () => {
  it('consulta a coluna que a tabela realmente tem', () => {
    // 02-RESEARCH.md:1243 says `delta`. The canonical name is `amount`, from
    // LedgerEvent in src/app/ledger.ts by way of docs/adr/0010, and that is what
    // apps/server/src/db/migrations.ts creates. A probe naming a column that
    // does not exist fails with "no such column" — during the outage, which is
    // the one moment nobody has to spend reading SQL.
    const src = readTool('restore-verify.mjs');
    expect(src).toContain('sum(amount)');
    expect(src).not.toContain('sum(delta)');
    expect(src).toContain('gold_entry');
    // count(*) alone survives a restore that lost every value; the sum alone
    // survives one that merged two rows. The probe is both.
    expect(src).toContain('count(*)');
    // An empty ledger has to compare 0 against 0. Without coalesce the sum is
    // NULL, the concatenation collapses, and the check passes by comparing
    // nothing to nothing.
    expect(src).toContain('coalesce');
  });

  it('restaura para fora do vivo e limpa atrás de si', () => {
    const src = readTool('restore-verify.mjs');
    // `-o` writes elsewhere; the live database is never touched, which is the
    // literal requirement of D2-03 and not a nicety.
    expect(src).toMatch(/'restore'.*'-o'|'-o'.*restored/s);
    expect(src).toContain('mkdtempSync');
    expect(src).toContain('finally');
    expect(src).toContain('rmSync');
  });

  it('compara uma janela fixa, não o total de um banco que se mexe', () => {
    // `litestream restore` answers with whatever has already reached the
    // bucket, and replication is asynchronous by construction. Comparing that
    // against the live TOTAL means any write in the seconds before the drill
    // prints NÃO CONFERE. Measured against the real script with three rows
    // appended after the copy: exactly that, red over a healthy backup — and
    // the operator so trained is the operator who stops believing the one check
    // whose entire value is being believed.
    //
    // The ledger is append-only and litestream replicates pages, so the restore
    // is a prefix of the live table in rowid order. Asking the live database
    // for that same prefix is exact no matter how many rows arrive meanwhile.
    const src = readTool('restore-verify.mjs');
    expect(src).toContain('max(rowid)');
    expect(src).toContain('where rowid <=');
    // The rowid watermark is interpolated into SQL and arrives from a restored
    // file, so it is validated as an integer first.
    expect(src).toMatch(/\/\^-\?\\d\+\$\//);
    // Measured after the fix, same six scenarios: replica three rows behind now
    // passes; empty replica, a row missing from the prefix, a tampered amount,
    // and "behind AND holed" all still fail. The lag is reported on the pass,
    // because "identical" and "identical as of 3s ago" are different facts and
    // D2-03 asks for the second one.
    expect(src).toContain('defasagem');
    // An empty restore has no prefix, so it agrees with the empty prefix of
    // anything: the prefix comparison alone cannot see it, and this guard is
    // what does.
    expect(src).toContain('back.count === 0 && before.count > 0');
    // No inequality on the sum, ever: amounts are SIGNED (a spend is a negative
    // entry), so "restaurado <= vivo" would be a false invariant.
    expect(src).not.toMatch(/sum\s*<=|<=\s*.*\.sum/);
  });

  it('abre os dois bancos em somente-leitura (D2-03)', () => {
    // The sqlite3 CLI opens READ-WRITE by default, and against a WAL database
    // that creates the -shm file if absent and checkpoints on close. The drill
    // is run by hand, as root or as the operator, so a -wal or -shm created
    // under that identity leaves the dg2 user unable to write to its own
    // database — the verification of the backup becoming the outage. And
    // litestream has to be the only checkpointer.
    //
    // Measured by running the real script with a fake sqlite3 that logs its
    // argv: before the flag, not one of the calls carried it.
    const src = readTool('restore-verify.mjs');
    expect(src).toContain("'-readonly'");
    // Every call, not just the one against the live file: a stray read-write
    // open of the restored copy is harmless but the asymmetry is how the flag
    // gets dropped from the one that matters.
    const calls = [...src.matchAll(/run\('sqlite3',\s*\[([^\]]*)\]/g)];
    expect(calls.length).toBeGreaterThan(0);
    for (const c of calls) expect(c[1]).toContain("'-readonly'");
  });

  it('segue o contrato de falha e não deixa exceção escapar', () => {
    const src = readTool('restore-verify.mjs');
    // tools/README.md §3: `file:pointer: message` on stderr, exit 1, and no
    // bare throw — a stack trace is exit 1 with no actionable message.
    expect(src).toContain('console.error');
    expect(src).toContain('process.exit(1)');
    expect(src).toMatch(/catch\s*\(\s*error\s*\)\s*\{\s*\n?\s*fail\(/);
  });
});

/**
 * The six sections of docs/OPERACAO.md that are OPEN when plan 02-04 writes the
 * file, by their exact title. Each one is a promise that a later step fills in,
 * and the failure mode of a promise like that is a heading quietly renamed:
 * Task 3 of this plan and plans 02-12 and 02-14 look for these strings, and a
 * section renamed between writing and filling becomes a second section instead
 * of a filled one — with the operator pasting real output under a heading
 * nobody reads again.
 *
 * The titles are asserted as `## ` prefixed so that a mention in running prose
 * cannot satisfy them. They are also asserted to appear EXACTLY ONCE, which is
 * the half that catches the rename: a renamed heading plus a re-added one is
 * two, and a cross-reference written with `##` instead of `§` is two as well.
 */
const OPERACAO_SECOES = [
  // Task 3 of plan 02-04, against the live box.
  'Limpeza automática de imagens do servidor',
  'Primeiro certificado e prova de A1',
  'Firewall do coturn',
  // Plan 02-12.
  'Ensaio de restauração',
  'Monitor externo',
  // Stays open past the end of the phase, on purpose (D2-11).
  'O que esta fase deliberadamente não cobre',
];

describe('docs/OPERACAO.md', () => {
  it('abre as seis seções que os passos seguintes preenchem, e cada uma existe UMA vez', () => {
    const doc = readDoc();
    for (const secao of OPERACAO_SECOES) {
      const hits = doc.split('\n').filter((l) => l.startsWith(`## ${secao}`));
      expect(hits.length, `docs/OPERACAO.md não tem exatamente uma seção "## ${secao}"`).toBe(1);
    }
  });

  it('aponta para PARIDADE e reconcilia o critério 4 do roadmap por escrito', () => {
    const doc = readDoc();
    // docs/PARIDADE.md is the analogue of form AND the place where the D2-11 gap
    // stays recorded as an open box. A reader who lands here has to be able to
    // find it without being told it exists.
    expect(doc, 'docs/OPERACAO.md não cita PARIDADE').toContain('PARIDADE');
    // THE SENTENCE THAT KEEPS THE PHASE VERIFICATION FROM FAILING BY SURPRISE.
    // Criterion 4 of the roadmap demands that "o deploy é um comando e é
    // reversível". D2-32 revoked the automatic trigger, so the half that says
    // "um comando" needed a written reading BEFORE anyone tried to verify it —
    // that is the whole output of Task 1 of plan 02-04, and prose is where it
    // lives. Asserting the reference makes it impossible to delete silently.
    expect(doc, 'a reconciliação do critério 4 não está escrita').toContain('critério 4');
    // The relay range, which is the link to ops/turnserver.conf: the declared
    // half lives in that file and the opened half lives on the box, and this
    // document is the only place where the two are recorded side by side (C-5).
    expect(doc, 'a faixa de relay não está registrada').toContain('49200');
  });

  it('não carrega literal de IP além do loopback e do bind (D2-15)', () => {
    // THE REASON THIS BLOCK EXISTS. Task 3 pastes `ufw status`, response headers
    // and a certificate chain from a live box into this file, and pasted output
    // is the single most likely way an address ever enters this repository. The
    // gate has to be here BEFORE the paste, not after.
    //
    // The same exact-token exemption as the ops/ block above: `127.0.0.1` is the
    // loopback, `0.0.0.0` is the documented value of DG2_BIND (DM-9), and
    // neither says where this box lives. An operator's real address cannot ride
    // in under the exemption because only those two are spellable.
    const doc = readDoc();
    const bad: string[] = [];
    for (const m of doc.matchAll(/\b(?:\d{1,3}\.){3}\d{1,3}\b/g)) {
      if (!NON_ROUTABLE_V4.has(m[0])) bad.push(m[0]);
    }
    expect(bad).toEqual([]);
  });

  it('nomeia as variáveis do painel sem jamais atribuir valor a nenhuma (D2-29)', () => {
    // A key may be NAMED anywhere — naming them is the whole job of this
    // document, since D2-29 moved them from a file on the host into a web
    // panel's database and the repository is now the only inventory of WHICH
    // keys exist. What it may never do is ASSIGN one.
    //
    // `=` ONLY, and the exclusion of `:` is reasoned rather than convenient.
    // The ops/ block above tests `[=:]` because shell and YAML use both; prose
    // uses `:` for apposition, and `LITESTREAM_BUCKET: o bucket da réplica` is
    // a sentence and not a leak. What a pasted panel row or an env dump carries
    // is the `=` form, and that is the shape this assertion is for.
    const doc = readDoc();
    const bad: string[] = [];
    for (const line of doc.split('\n')) {
      const clean = stripInterpolations(line)
        .replace(/\$[A-Za-z_][A-Za-z0-9_]*/g, '');
      for (const key of ENV_KEYS) {
        if (new RegExp(`${key}\\s*=\\s*\\S`).test(clean)) bad.push(line.trim());
      }
    }
    expect(bad).toEqual([]);
  });

  it('nenhuma das duas credenciais do bucket aparece com valor, em nenhuma sintaxe', () => {
    // The stricter form, for the two keys whose leak is unrecoverable: neither
    // `=` nor `:` may be followed by anything that is not an interpolation or a
    // table separator. A credential does not care which syntax leaked it, and
    // unlike the generic keys above these two have no legitimate reason to be
    // followed by a literal anywhere in a document.
    const doc = readDoc();
    const bad: string[] = [];
    for (const line of doc.split('\n')) {
      for (const key of ['AWS_SECRET_ACCESS_KEY', 'AWS_ACCESS_KEY_ID']) {
        const m = new RegExp(`${key}\\s*[=:]\\s*(\\S+)`).exec(line);
        if (!m) continue;
        if (/^\$\{[^}]*\}$/.test(m[1]!)) continue;
        bad.push(line.trim());
      }
    }
    expect(bad).toEqual([]);
  });
});

/**
 * Suffixes that make a dotted token a FILE or a systemd unit and not a host.
 * Every entry is one this subsystem actually writes today, and the list is
 * meant to STAY short: it is the escape hatch of the hostname assertion below,
 * and a long escape hatch is not a gate.
 */
const NOT_A_TLD = new Set([
  // Files this subsystem names, or that the webroot serves.
  'md', 'sh', 'yml', 'json', 'js', 'ts', 'mjs', 'html', 'css', 'png', 'txt',
  'db', 'tmp',
  // ops/turnserver.conf, ops/coturn-dropin.conf, and the /etc paths §12 names.
  'conf',
  // systemd.
  'service', 'timer', 'target',
  // The two Dockerfile suffixes, for exactly the reason 'conf' and 'service'
  // are above: they are extensions THIS subsystem writes, and the hostname
  // assertion below reads `Dockerfile.api` as a two-label domain. Neither is a
  // real TLD, so excusing them widens nothing.
  'api', 'web',
  // The release tarball ops/Dockerfile.api downloads, whose name ends in
  // `.tar.gz`. Only the last label is tested, so `gz` is the one that matters.
  'gz',
  // `binding.gyp`, named in the comment of ops/Dockerfile.api that plan 02-15
  // wrote after MEASURING why `--ignore-scripts` is required: npm synthesises
  // `install: node-gyp rebuild` for any package that ships one of these and
  // declares no install script, which is how better-sqlite3's prebuilt binary
  // was being bypassed. The name has to be in the file for that reasoning to be
  // checkable, and it is an extension rather than a TLD — the same argument
  // that put 'conf' and 'service' on this list.
  'gyp',
]);

/**
 * The TWO public artifact hosts ops/ is allowed to name: the image registry the
 * composition pulls from, and the host the Litestream binary is downloaded from.
 *
 * THIS IS NOT A LOOSENING OF D2-15, AND THE DISTINCTION THE RULE ACTUALLY MAKES
 * IS THE WHOLE ARGUMENT. That rule forbids "segredo, domínio, host ou IP"
 * because an address says WHERE THIS BOX LIVES. A public artifact registry says
 * where a BINARY comes from — it is the same string in every deployment on
 * earth, and it has to be in the file for the pin of T-2-SC to be reviewable at
 * all. Hiding it would push the provenance out of the repository in exchange for
 * an address leak that these two names cannot carry.
 *
 * Exactness, as with the reserved ranges above: the tokens are spelled in full,
 * so the game's own domain is still refused — which is the proof that this
 * exception opened no hole. Two entries, and the list is meant to STAY two.
 */
const PUBLIC_ARTIFACT_HOSTS = new Set(['ghcr.io', 'github.com']);

/**
 * The container-internal values ops/docker-compose.yml assigns literally, and
 * which the "no env key carries a literal value" assertion would otherwise
 * refuse.
 *
 * The same reasoning, one level down: a path INSIDE a container and a Compose
 * service name say nothing about where this box lives, and the second one does
 * not even resolve outside the bridge network of that one composition. They are
 * literals on purpose — the panel cannot own them, because a test compares each
 * of them against a second file that has to agree (ops/litestream.yml for the
 * database path, ops/Caddyfile for the upstream), and a value only the panel
 * knows is a value no test can compare.
 *
 * Token exactness, as with the reserved ranges: the exact path is excused, a
 * neighbouring path is not.
 */
const CONTAINER_INTERNAL = new Set([
  '/var/lib/dg2/dg2.db',
  'api:8080',
  // The replica directory, and it is a literal for a REASON THAT IS THE WHOLE
  // POINT OF D2-33 rather than for convenience: the must-have is that the replica
  // lives on a PERSISTENT VOLUME, and a value only the panel knows is a value no
  // test can compare against a volume mount. The silent failure this buys a guard
  // against — a replica in a container layer, erased by the first redeploy with no
  // error — is worth one more exact token.
  '/var/lib/dg2-replica/dg2',
]);

/**
 * The four bucket keys D2-33 revoked, swept for across the whole subsystem by the
 * block below.
 *
 * Named rather than inlined because the list has to be the SAME four in both
 * places it is checked — here and in ops/litestream.yml's own block — and the
 * list is the kind of thing that gets three of four entries on a rewrite.
 */
const REVOKED_BUCKET_KEYS = [
  'LITESTREAM_BUCKET', 'LITESTREAM_ENDPOINT',
  'AWS_ACCESS_KEY_ID', 'AWS_SECRET_ACCESS_KEY',
];

/**
 * The ONLY IP literals allowed into ops/: the loopback, the bind address the
 * composition hands the server, and the endpoints of the reserved ranges
 * ops/turnserver.conf forbids the relay to address.
 *
 * No file in ops/ spells the loopback any more — the Caddyfile's upstream
 * default became a compose service name when the deployment became two
 * containers — and the token stays excused anyway, because `127.0.0.1` says as
 * little about where this box lives as the ranges below it do.
 *
 * Excusing them does not open a hole in D2-15. That rule forbids "segredo,
 * domínio, host ou IP" because those say WHERE THIS BOX LIVES; 10.0.0.0/8 says
 * nothing about this box. It is a constant of RFC 1918, byte-identical in every
 * deployment on earth, and it is in the file precisely to stop the relay
 * reaching a private network. A gate that refused it would push the deny-list
 * out of the repository — trading an address leak it cannot suffer for the SSRF
 * the list exists to prevent (T-3-04).
 *
 * The set is EXACT rather than a subnet test, and that is the part doing the
 * work: `10.0.0.0` and `10.255.255.255` are excused, `10.0.0.7` is not. An
 * operator's real internal host cannot ride in under the exemption, because
 * only the two ENDPOINTS of each range are spellable.
 */
const NON_ROUTABLE_V4 = new Set([
  '127.0.0.1',
  '0.0.0.0', '0.255.255.255',
  '10.0.0.0', '10.255.255.255',
  // RFC 6598 shared address space — the CGNAT range, a constant like the rest.
  '100.64.0.0', '100.127.255.255',
  '127.0.0.0', '127.255.255.255',
  '169.254.0.0', '169.254.255.255',
  '172.16.0.0', '172.31.255.255',
  '192.168.0.0', '192.168.255.255',
  // The upper end of the IPv4-mapped IPv6 line, which spells a v4 address.
  '255.255.255.255',
]);

/**
 * The IPv6 half of the same exemption, and the same exactness. Four tokens,
 * because that is all the deny-list spells that the address regex below can
 * see: the loopback, the upper ends of the RFC 4193 unique-local and the
 * link-local ranges, and the `::ffff` prefix of the IPv4-mapped line. The
 * lower ends `fc00::` and `fe80::` are not here because the compressed form
 * matches neither alternative of that regex, so they never reach this set.
 */
const NON_ROUTABLE_V6 = new Set([
  '::1',
  'fdff:ffff:ffff:ffff:ffff:ffff:ffff:ffff',
  'febf:ffff:ffff:ffff:ffff:ffff:ffff:ffff',
  '::ffff',
]);

/**
 * The two tokens in ops/ that are member access wearing a hostname's shape:
 * `cache.addAll` and `{env.VAR}`, both of them prose in ops/Caddyfile. Only the
 * TWO-label form is excused — `env.VAR` is a placeholder and `env.exemplo.com`
 * is a domain, and the label count is what tells them apart.
 */
const MEMBER_ACCESS = new Set(['cache', 'env']);

describe('nenhum arquivo de ops/ ou tools/ops/ carrega endereço ou segredo (D2-15)', () => {
  /**
   * The files this block rules over, with the WR-14 floor applied to each.
   *
   * These assertions iterate the globs DIRECTLY instead of going through
   * read(), so they do not inherit that guard — and every one of them is a
   * `bad` list expected to be empty, which is precisely the shape that a glob
   * returning nothing satisfies in full. The block that enforces D2-15 is the
   * last one that can afford to pass over an empty haystack.
   */
  function scanned(): [string, string][] {
    const entries = Object.entries({ ...OPS, ...TOOLS_OPS }) as [string, string][];
    // THE FLOOR CAME DOWN FROM 13 TO 9 IN THE SAME COMMIT THE COUNT FELL, which
    // is the only way a floor like this stays honest. D2-30 retired nine files
    // and the containerisation added three, so here is the arithmetic, written
    // down because the next person to touch ops/ needs to know where the number
    // came from instead of guessing at it:
    //
    //   ops/        8  Caddyfile, README.md, coturn-dropin.conf, litestream.yml,
    //                  turnserver.conf, docker-compose.yml, Dockerfile.api,
    //                  Dockerfile.web
    //   tools/ops/  1  restore-verify.mjs
    //   ------------------------------------------------------------------
    //   total       9
    //
    // There is no slack, deliberately. 9 IS the real count, so deleting any one
    // file of this subsystem turns this block red WITH THE FLOOR'S OWN MESSAGE
    // rather than green over a shorter list — which is the whole property, and
    // it was proved by removal rather than by reading. Adding a file needs no
    // edit here; removing one does, and removal is the direction that matters.
    //
    // The other half of the count is the per-file length guard below, and it is
    // the one that caught WR-14: a glob that resolves and reads '' satisfies
    // every `not.toContain` beneath it.
    //
    // `tools/ops/deploy.mjs` is NOT in the count: plan 02-04 resolved its Task 1
    // as `clique-painel`, so the deploy trigger is an operator in a panel and
    // that script was never created.
    expect(entries.length, 'os globs de ops/ e tools/ops/ vieram vazios')
      .toBeGreaterThanOrEqual(9);
    for (const [path, src] of entries) {
      expect(src, `${path} não é string`).toBeTypeOf('string');
      expect(src.length, `${path} veio vazio`).toBeGreaterThan(200);
    }
    return entries;
  }

  // NOTHING here is comment-stripped: a domain leaked in a comment is leaked
  // all the same.
  it('os únicos literais de IP permitidos são o loopback e as faixas reservadas que o relay recusa', () => {
    const bad: string[] = [];
    for (const [path, src] of scanned()) {
      for (const m of src.matchAll(/\b(?:\d{1,3}\.){3}\d{1,3}\b/g)) {
        if (!NON_ROUTABLE_V4.has(m[0])) bad.push(`${path}: ${m[0]}`);
      }
      // IPv6 was uncovered until now, and the box is Brazilian residential
      // infrastructure where IPv6 is past half of all traffic — an address
      // leaked in that spelling is exactly as leaked. Both forms: full groups,
      // and the `::`-compressed one. A time of day shares the shape; there is
      // none in ops/ today, and in a leak gate a false positive is a nuisance
      // where a false negative is the leak.
      for (const m of src.matchAll(/\b(?:[0-9a-f]{1,4}:){2,}(?:[0-9a-f]{1,4})?\b|::[0-9a-f]{1,4}\b/gi)) {
        if (!NON_ROUTABLE_V6.has(m[0].toLowerCase())) bad.push(`${path}: ${m[0]}`);
      }
    }
    expect(bad).toEqual([]);
  });

  it('nenhum literal com cara de host público', () => {
    // D2-15 covers "segredo, domínio, host ou IP" and this block used to check
    // only the IP. Nothing caught `DG2_DOMAIN=<um domínio>` in the Caddyfile,
    // `LITESTREAM_BUCKET=<um bucket>` in litestream.yml, or a hostname sitting
    // in a comment in the runbook.
    //
    // The rule: any dot-separated token whose LAST label is letters-only and is
    // not a file extension this repository writes. That is what a public name
    // looks like and what a filename does not.
    //
    // ops/ ONLY, and the exclusion of tools/ops/ is reasoned rather than
    // convenient. This assertion rests on "a dot between two words is
    // suspicious", which holds for config and shell and is simply false for
    // JavaScript: `back.count`, `process.env` and `error.stdout` are all
    // member access and all have the shape. Excusing them would mean an
    // allowlist that grows with every local variable, and an allowlist that
    // grows is not a gate. tools/ops/ is still covered by the IP, env-key and
    // credential assertions in this block — what it loses is only the bare
    // hostname sitting in a comment.
    const bad: string[] = [];
    for (const [path, src] of scanned().filter(([p]) => p.startsWith('../ops/'))) {
      for (const m of src.matchAll(/\b[a-z0-9][a-z0-9-]*(?:\.[a-z0-9][a-z0-9-]*)+\b/gi)) {
        const labels = m[0].split('.');
        const tail = labels[labels.length - 1]!;
        // A version number, a port, an IPv4: the last label is not a word, so
        // it is not a TLD. The IPv4 assertion above owns those.
        if (!/^[a-z]{2,}$/i.test(tail)) continue;
        if (NOT_A_TLD.has(tail.toLowerCase())) continue;
        if (labels.length === 2 && MEMBER_ACCESS.has(labels[0]!)) continue;
        // The registry and the release host, by exact token. See the constant.
        if (PUBLIC_ARTIFACT_HOSTS.has(m[0].toLowerCase())) continue;
        bad.push(`${path}: ${m[0]}`);
      }
    }
    expect(bad).toEqual([]);
  });

  it('nenhuma chave de configuração do app aparece com valor literal', () => {
    // The generalisation of the credential assertion below to all eight keys,
    // and to the two syntaxes that carry them. A key may be NAMED anywhere;
    // what it may never be is ASSIGNED.
    const bad: string[] = [];
    for (const [path, src] of scanned()) {
      for (const line of src.split('\n')) {
        // Every way of REFERENCING a variable is erased first, so that what
        // survives is an assignment and nothing else. Three spellings, and all
        // three are in ops/ today:
        //
        //   ${VAR}          shell and YAML
        //   {$VAR:default}  Caddy — the form that legitimately carries the
        //                   loopback default the IP assertion above rules on
        //   $VAR            bare shell. D2-30 retired the five scripts that
        //                   spelled it, so ops/ has at most one site left and
        //                   soon none. The erasure STAYS: it is the order-
        //                   sensitive third step, which must run LAST so it
        //                   cannot eat the `$` of the two brace forms, and this
        //                   subsystem is one `sh` away from spelling it again.
        //
        // `DG2_DOMAIN=$OUTRA` therefore reads as an empty right-hand side,
        // which is correct: assigning from another variable is not a literal.
        const clean = stripInterpolations(line)
          .replace(/\{\$[^}]*\}/g, '')
          .replace(/\$[A-Za-z_][A-Za-z0-9_]*/g, '');
        // Container-internal values are excused here and NOWHERE ELSE in this
        // block: they are assignments, which is what this assertion rules on,
        // and they are not addresses, which is what D2-15 forbids. Checked by
        // exact token against the untouched line, so a neighbouring path still
        // fails.
        if ([...CONTAINER_INTERNAL].some((t) => line.includes(t))) continue;
        for (const key of ENV_KEYS) {
          if (new RegExp(`${key}\\s*[=:]\\s*\\S`).test(clean)) bad.push(`${path}: ${line.trim()}`);
        }
      }
    }
    expect(bad).toEqual([]);
  });

  it('nenhuma variável de bucket é nomeada em lugar nenhum do subsistema (D2-33)', () => {
    // THIS REPLACED TWO ASSERTIONS THAT WENT VACUOUS, AND THE REPLACEMENT IS
    // STRICTLY STRONGER. They required that a line naming a bucket credential also
    // carry a `${...}`, so that
    //
    //   grep -rn 'AWS_SECRET_ACCESS_KEY' ops/ | grep -v '\${'
    //
    // was a leak detector needing no judgement to read. D2-33 revoked the bucket
    // before any of it was ever set: no bucket exists, no provider credential
    // exists, and the Litestream replica is a path on this box. With the keys gone
    // from ops/, both assertions passed over an empty haystack — which is exactly
    // the WR-14 shape this file exists to refuse.
    //
    // So the rule became an ABSENCE instead of a syntax requirement: the four names
    // appear NOWHERE. That is the must-have of D2-33 turned into a command, and the
    // reason it is worth a case of its own is the failure it prevents — a revoked
    // variable surviving in a table or a comment sends an operator hunting for a
    // credential nobody ever created, and then creating one.
    //
    // NOT comment-stripped: a name in a comment misleads exactly as well.
    //
    // docs/OPERACAO.md is deliberately NOT covered here. It NAMES the four, in the
    // paragraph explaining that they were revoked — which is the right place for
    // that sentence, and it keeps its own stricter assertion that none of them is
    // ever followed by a value.
    const bad: string[] = [];
    for (const [path, src] of scanned()) {
      for (const key of REVOKED_BUCKET_KEYS) {
        if (src.includes(key)) bad.push(`${path}: ${key}`);
      }
    }
    expect(bad, 'uma variável de bucket sobreviveu a D2-33').toEqual([]);
  });
});

// A property of the CHECKOUT, not of the commit — which is exactly why it needs
// a gate. `core.autocrlf=true` is the default of Git for Windows, and it turns
// every LF in the index into CRLF on disk. The committed blobs are clean (0x0D
// bytes: zero, in all of them); the files the developer edits and the files a
// `scp` from this machine would carry are not.
//
// What that costs is not cosmetic. In POSIX shell a `\` at the end of a line
// escapes the NEXT character, and with CRLF the next character is the CR — so
// the newline survives as a command separator and the continuation is severed.
// `dash` refuses all five scripts of ops/ for that reason alone, including
// files nobody has ever edited. `sh -n` under Git for Windows is bash, which
// tolerates the CR silently, so the local check does not show it: it took
// running the same files through `dash -n` to see it at all.
//
// systemd is the other victim and the quieter one — it does not strip a
// trailing CR, so `ExecStart=/usr/bin/node ...\r` would carry the CR into the
// argument.
//
// The fix is .gitattributes pinning `eol=lf` on the paths the Linux box
// executes. This block is what keeps it pinned.
describe('os arquivos que a caixa executa nascem com LF', () => {
  it('nenhum arquivo de ops/ ou tools/ops/ chega ao disco com CRLF', () => {
    const entries = Object.entries({ ...OPS, ...TOOLS_OPS }) as [string, string][];
    // The same anti-vacuity floor the D2-15 block uses, and for the same
    // reason: `bad` being empty is satisfied in full by having looked at
    // nothing. The arithmetic behind the 9 is written out once, in the
    // `scanned()` helper of that block; it came down from 13 in the same commit
    // that deleted the nine files of D2-30.
    expect(entries.length, 'os globs de ops/ e tools/ops/ vieram vazios')
      .toBeGreaterThanOrEqual(9);
    const bad: string[] = [];
    for (const [path, src] of entries) {
      expect(src.length, `${path} veio vazio`).toBeGreaterThan(200);
      const cr = (src.match(/\r/g) ?? []).length;
      if (cr > 0) bad.push(`${path}: ${cr} bytes CR`);
    }
    expect(bad).toEqual([]);
  });
});
