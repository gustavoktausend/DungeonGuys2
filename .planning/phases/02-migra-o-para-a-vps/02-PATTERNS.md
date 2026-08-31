# Phase 2: Migração para a VPS - Pattern Map

**Mapped:** 2026-08-31
**Files analyzed:** 39 (14 editados/removidos, 25 criados)
**Analogs found:** 27 / 39 (12 sem analog no repositório — todos em `ops/` e `apps/server/`)

> Rótulos de estrutura ficam em inglês porque são lidos por ferramenta.
> O conteúdo é em português, como o resto dos documentos do projeto.
> Comentários de código continuam em inglês (CLAUDE.md).
>
> **Como ler:** cada excerto abaixo é código que **existe hoje** no repositório, com caminho e
> linha. Onde a coluna "Match Quality" diz `sem analog`, a fonte é `02-RESEARCH.md` § "Code
> Examples" — e a convenção de estilo a herdar está em § "Shared Patterns" deste documento.

---

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `vite.config.ts` *(edita)* | config (build) | build-time | ele mesmo, `:5` | exato |
| `index.html` *(edita)* | markup/config | build-time | ele mesmo, `:8-13`, `:119` | exato |
| `public/manifest.json` *(confere)* | config | build-time | ele mesmo, `:5-6` | exato |
| `public/sw.js` *(reescreve)* | service worker | request-response + cache | ele mesmo, `:20-74` (o defeito) + `02-RESEARCH.md:1113` (o alvo) | parcial |
| `src/main.ts` *(edita)* | app entry / bootstrap | event-driven | ele mesmo, `:33-40` (registro) e `:188-197` (`quitGame`) | exato |
| `src/ui/screens.ts` *(edita)* | UI component | event-driven | ele mesmo, `:159-168` (`announce`) e `:207-210` (wiring de botão) | exato |
| `src/ui/dom.ts` *(edita)* | UI registry | — | ele mesmo, `:85-96` | exato |
| `src/style.css` *(edita, D2-20)* | style | build-time | ele mesmo, `:4-20` (bloco `:root`) | exato |
| `public/fonts/*.woff2` *(cria, D2-20)* | asset | file-I/O | `public/assets/`, `public/icons/` | role-match |
| `package.json` *(edita)* | config (monorepo) | — | ele mesmo, `:6-8` e `:16-24` | exato |
| `tools/sw/emit.mjs` *(cria)* | utility (build step) | file-I/O / transform | **`tools/sim-version/emit.mjs`** | exato |
| `tools/sw/verify.mjs` *(cria)* | utility (build gate) | file-I/O / transform | **`tools/sim-version/verify.mjs`** | exato |
| `tools/ops/restore-verify.mjs` *(cria)* | utility (ops) | batch / subprocess | `tools/sim-version/verify.mjs` + `tools/golden/rebaseline.mjs:18-25` | role-match |
| `tests/build-base.test.ts` *(cria)* | test (estrutural) | file-I/O | **`tests/purity.test.ts`** | exato |
| `tests/workflows.test.ts` *(cria)* | test (estrutural) | file-I/O | **`tests/purity.test.ts`** | exato |
| `tests/server-migrate.test.ts` *(cria)* | test (integração) | CRUD | `tests/save-trust.test.ts:27-33` (re-import por caso) | parcial |
| `tests/server-health.test.ts` *(cria)* | test (integração) | request-response | `tests/save-trust.test.ts` | parcial |
| `playwright.config.ts` *(cria)* | config (test runner) | — | **`vitest.browser.config.ts`** | role-match |
| `tests/pwa/helpers.ts` *(cria)* | test helper | — | **`tests/helpers.ts`** | exato |
| `tests/pwa/fixtures/old-build/` *(cria)* | test fixture | file-I/O | `tools/assets/fixtures/{good,bad}/` | role-match |
| `tests/pwa/install.spec.ts` *(cria)* | test (e2e) | request-response | `tests/cross-engine.test.ts` (forma), `tests/purity.test.ts` (nomes) | parcial |
| `tests/pwa/update.spec.ts` *(cria)* | test (e2e) | event-driven | idem | parcial |
| `tests/pwa/offline.spec.ts` *(cria)* | test (e2e) | request-response | idem | parcial |
| `tests/pwa/api-isolation.spec.ts` *(cria)* | test (e2e) | request-response | idem | parcial |
| `tests/pwa/tsconfig.json` *(cria, contingente)* | config | — | `packages/protocol/tsconfig.json` | role-match |
| `.github/workflows/ci.yml` *(edita)* | CI config | pipeline | ele mesmo, `:50-60` (cache do Playwright) | exato |
| `.github/workflows/deploy.yml` *(remove)* | CI config | pipeline | — | — |
| `apps/server/package.json` *(cria)* | config (workspace) | — | **`packages/protocol/package.json`** | exato |
| `apps/server/tsconfig.json` *(cria)* | config (workspace) | — | **`packages/protocol/tsconfig.json`** | exato |
| `apps/server/src/index.ts` *(cria)* | server entry | request-response | `src/main.ts:22-48` (forma de entrypoint) | parcial |
| `apps/server/src/health.ts` *(cria)* | route/controller | request-response | — | **sem analog** |
| `apps/server/src/db/open.ts` *(cria)* | infra (db) | CRUD | — | **sem analog** |
| `apps/server/src/db/migrations.ts` *(cria)* | migration | CRUD | `docs/adr/0010` + `src/app/ledger.ts:41-53` (forma do dado) | parcial |
| `ops/Caddyfile` *(cria)* | config (infra) | request-response | — | **sem analog** |
| `ops/dg2.service` · `ops/litestream.service` · `ops/cert-check.{service,timer}` *(cria)* | config (infra) | — | — | **sem analog** |
| `ops/litestream.yml` *(cria)* | config (infra) | streaming | — | **sem analog** |
| `ops/deploy.sh` · `ops/rollback.sh` · `ops/prune-releases.sh` · `ops/cert-check.sh` *(cria)* | script (ops) | batch | — | **sem analog** |
| `ops/README.md` *(cria)* | doc (runbook) | — | **`tools/README.md`** | role-match |
| `docs/OPERACAO.md` *(cria)* | doc (registro) | — | `docs/PARIDADE.md:1-16` | role-match |

---

## Pattern Assignments

### `tools/sw/emit.mjs` (utility, build step) — o analog mais forte da fase

**Analog:** `tools/sim-version/emit.mjs` (leia inteiro; são 82 linhas e a forma é para ser copiada).

**Cabeçalho que declara a fronteira do hash** (`:1-33`) — o novo script tem de fazer o
movimento **invertido** e dizer isso no mesmo lugar:

```js
// emit.mjs — SIM_VERSION, step 2 of the build (D-07).
//
// THE HASH OF AN ARTIFACT CANNOT LIVE INSIDE THAT ARTIFACT.
//
// Injecting the value into the bundle would change its bytes and therefore
// change its hash — the definition would eat itself. So the build is two steps:
// step 1 (`npm run sim:build`) emits packages/sim/dist/sim.js, and this step
// writes the value into a SIBLING file, packages/sim/dist/sim-version.json.
```

> Consequência para `tools/sw/emit.mjs`: como o `sw.js` **precisa** carregar o hash dentro de
> si, a regra vira "o hash cobre **tudo em `dist/` exceto `dist/sw.js`**", escrita no cabeçalho
> com a mesma ênfase. `02-RESEARCH.md` § Padrão 3.

**Resolução de caminhos e constantes de topo** (`:34-46`):

```js
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const BUNDLE_REL = 'packages/sim/dist/sim.js';
const OUTPUT_REL = 'packages/sim/dist/sim-version.json';
const BUNDLE = join(ROOT, BUNDLE_REL);
const OUTPUT = join(ROOT, OUTPUT_REL);

/** How many hex characters of the digest become the version. */
const DIGEST_CHARS = 16;
```

**Contrato de falha e de sucesso** (`:48-52` e `:54-80`) — é o `tools/README.md` §3 em código:

```js
/** Failure: `file:pointer: message` on stderr, exit 1 (tools/README.md §3). */
function fail(file, pointer, message) {
  console.error(`${file}:${pointer}: ${message}`);
  process.exit(1);
}

function main() {
  let bytes;
  try {
    bytes = readFileSync(BUNDLE);
  } catch (error) {
    return fail(
      BUNDLE_REL,
      '/',
      `não consegui ler o bundle — rode \`npm run sim:build\` antes: ${error.message}`,
    );
  }

  if (bytes.length === 0) {
    return fail(BUNDLE_REL, '/', 'bundle vazio — o build da etapa 1 não emitiu nada');
  }

  const digest = createHash('sha256').update(bytes).digest('hex');
  const simVersion = `sha256:${digest.slice(0, DIGEST_CHARS)}`;
  // ...
  console.log(`SIM_VERSION = ${simVersion}  (${bytes.length} bytes)`);
}

main();
```

Note o formato: **mensagens de erro em português**, comentários em inglês, `sha256` do
`node:crypto` (nunca hash artesanal), uma linha em `stdout` no sucesso.

---

### `tools/sw/verify.mjs` (utility, build gate)

**Analog:** `tools/sim-version/verify.mjs` — o análogo direto de `sim:version:verify`.

**Cabeçalho que nomeia as duas propriedades verificadas** (`:1-18`):

```js
// verify.mjs — the automated test of FORM-03, listed in 01-VALIDATION.md.
//
// A version number is worth nothing unless BOTH halves hold, and neither half
// implies the other:
//
//   REPRODUCIBLE — the same source always yields the same value. ...
//   SENSITIVE — a change in the simulation always yields a different value. ...
//
// This runs the REAL two-step chain (`sim:build` then `emit.mjs`) and reads
// the emitted sim-version.json, rather than re-implementing the hash here — a
// verifier that recomputes the value its own way stops testing the tool and
// starts testing itself.
```

> Aplicação em `tools/sw/verify.mjs`: **não recalcular** a lista de precache do zero e comparar
> com ela mesma. Ler `dist/sw.js`, extrair o que está lá, e comparar com uma **varredura
> independente do `dist/`** — mais a checagem de sentinela sobrevivente (`__PRECACHE__`,
> `__BUILD_HASH__`), que é o caso "alguém rodou `vite build` cru".

**Execução de subprocesso que não usa `process.exit` no meio** (`:59-71`):

```js
/** Runs a Node script under ROOT. Throws instead of exiting — see the header. */
function node(argv, label) {
  try {
    execFileSync(process.execPath, argv, {
      cwd: ROOT,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch (error) {
    const output = `${error.stdout ?? ''}${error.stderr ?? ''}`.trim();
    throw new Error(`${label} falhou:\n${output}`);
  }
}
```

**Envelope final — nenhuma exceção escapa** (`:149-153`):

```js
try {
  main();
} catch (error) {
  fail('tools/sim-version/verify.mjs', '/', error.message);
}
```

---

### `tools/ops/restore-verify.mjs` (utility, ops)

**Analog primário:** `tools/sim-version/verify.mjs` (contrato de falha + `execFileSync`).
**Analog secundário:** `tools/golden/rebaseline.mjs:1-25` — o script que **muda o mundo** e por
isso abre com a regra que o governa e exige `--confirm`:

```js
// rebaseline.mjs — the ONLY auditable path to change a golden hash.
//
// RULE OF THE PLAN, and it is not decoration:
//
//   A COMMIT THAT CHANGES A GOLDEN HASH CHANGES NOTHING ELSE.
// ...
// Without --confirm the script only reports what it would do, and exits 1.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
```

> `restore-verify.mjs` **não** muda o banco vivo (`litestream restore -o` escreve noutro lugar),
> então não precisa de `--confirm`. Mas herda: imports `node:` explícitos, `execFileSync`,
> `try/finally` para limpar o diretório temporário, e a linha única de sucesso.
> O esqueleto pronto está em `02-RESEARCH.md:1243` § Code Examples.

---

### `tests/build-base.test.ts` e `tests/workflows.test.ts` (test, estrutural)

**Analog:** `tests/purity.test.ts` — o único teste do repositório que assere uma propriedade
**estrutural do repositório** em vez de comportamento do jogo. É a forma exata dos dois novos.

**Leitura de arquivo em teste — `import.meta.glob`, nunca `node:fs`** (`:21-29`):

```ts
// Vite's raw glob, not node:fs — tsconfig's `types` is ["vite/client"] only.
const FILES = import.meta.glob<string>('../packages/sim/src/**/*.ts', {
  query: '?raw', import: 'default', eager: true,
});

// The package manifest, read the same way, for the `dependencies: {}` check.
const MANIFEST = import.meta.glob<string>('../packages/sim/package.json', {
  query: '?raw', import: 'default', eager: true,
});
```

**Guarda contra passar por vacuidade** (`:31-40` e `:81-83`) — **crítico para
`build-base.test.ts`**, porque `dist/` é ignorado pelo git (`.gitignore:2`) e pode não existir:

```ts
/**
 * Exact count, on purpose — this used to be a lower bound, and a lower bound
 * does not notice a file left behind by an extraction, which is precisely the
 * failure mode of the move that created this package.
 */
const EXPECTED_FILE_COUNT = 28;

  it('encontrou exatamente os arquivos do pacote', () => {
    expect(Object.keys(FILES).length).toBe(EXPECTED_FILE_COUNT);
  });
```

**Asserção sobre manifesto JSON, com a razão da igualdade estrita** (`:85-92`) — a forma que
`tests/workflows.test.ts` copia para asserir ausência de Pages, e que serviria para estender a
checagem de `dependencies: {}` à raiz (D2-04):

```ts
  it('packages/sim declara dependencies vazio', () => {
    const raw = MANIFEST['../packages/sim/package.json'];
    expect(raw, 'o glob não encontrou packages/sim/package.json').toBeTypeOf('string');
    const pkg = JSON.parse(raw!) as { dependencies?: Record<string, string> };
    // Equality with {}, not "no keys": npm silently deletes an empty object on
    // install, and the invariant of CLAUDE.md is that the key is there and empty.
    expect(pkg.dependencies).toEqual({});
  });
```

**Coleta de violações em lista, não `expect` por arquivo** (`:94-104`) — a falha diz *quais*
arquivos, não só *que* falhou:

```ts
  it('nenhum arquivo toca DOM, relógio de parede ou aleatoriedade não semeada', () => {
    const bad: string[] = [];
    for (const [path, src] of Object.entries(FILES)) {
      const code = scan(scan(src, true), false);
      for (const re of FORBIDDEN) {
        const m = code.match(re);
        if (m) bad.push(`${path}: ${m[0]}`);
      }
    }
    expect(bad).toEqual([]);
  });
```

> Para `tests/workflows.test.ts`: o glob é `'../.github/workflows/*.yml'`, e os padrões
> proibidos são `deploy-pages`, `upload-pages-artifact`, `github-pages`. Ao contrário de
> `purity.test.ts`, **não** use `tests/scan.ts` — ele remove comentários de TypeScript, e um
> `#` de YAML não é `//`. Um `deploy-pages` comentado num workflow ainda é um workflow que
> alguém vai descomentar; aqui a prosa **não** é isenta.

---

### `tests/server-migrate.test.ts` e `tests/server-health.test.ts` (test, integração)

**Analog parcial:** `tests/save-trust.test.ts:27-33` — o padrão de re-importar um módulo cujo
efeito acontece na inicialização (exatamente o caso do `apps/server/src/index.ts`, que migra no
topo do módulo):

```ts
/** Fresh module instance, so `load()` re-runs against the stub above. */
async function loadSave(raw: unknown): Promise<{ data: SaveData }> {
  stubStorage(raw === undefined ? null : JSON.stringify(raw));
  vi.resetModules();
  const mod = await import('../src/app/save');
  return mod.Save;
}
```

**Lacuna real, que o planejador precisa resolver antes de escrever a task:** nenhum teste em
`tests/` importa de `node:` hoje (verificado: `grep -rn "from 'node:" tests` → vazio), porque o
`tsconfig.json` da raiz fixa `types: ["vite/client"]` (`:14`) e `tools/README.md` §4 proíbe
mexer nisso. Um teste que abre um SQLite em arquivo temporário precisa de tipos de Node.
Os dois caminhos com precedente no repositório:

1. **`tsconfig` próprio para o subdiretório**, como `packages/protocol/tsconfig.json` faz com
   `lib`/`types` reduzidos — a `02-VALIDATION.md` já sugere isso para `tests/pwa/`;
2. **manter o teste fora do `include` da raiz** e cobri-lo por um script npm próprio.

Isto é `sem analog` de verdade: **nenhum teste Node-API existe neste repositório**. Decidir
antes, não durante.

---

### `playwright.config.ts` (config, test runner)

**Analog:** `vitest.browser.config.ts` — o precedente de "config separada por runner, com o
comentário explicando por que a **forma** foi escolhida":

```ts
import { defineConfig } from 'vitest/config';
import { playwright } from '@vitest/browser-playwright';

// The cross-engine determinism gate: the same hashWorld in Chromium, Firefox
// and WebKit. browser.instances (not test.workspace, not separate projects)
// makes the engine name the Vitest project name, so a failure already reads
// "webkit > determinismo entre motores" without extra plumbing.
export default defineConfig({
  test: {
    include: ['tests/cross-engine.test.ts'],
    browser: {
      enabled: true,
      provider: playwright(),
      headless: true,
      instances: [
        { browser: 'chromium' },
        { browser: 'firefox' },
        { browser: 'webkit' },
      ],
    },
  },
});
```

**Não-colisão com o Vitest** (`vitest.config.ts:6-10`) — o `include` do runner Node é
`tests/**/*.test.ts`, então specs `.spec.ts` em `tests/pwa/` **não** precisam de exclusão:

```ts
export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    exclude: [...defaultExclude, 'tests/cross-engine.test.ts'],
  },
});
```

> A exclusão de `cross-engine.test.ts` existe porque ele "só prova algo contra motores reais".
> O mesmo raciocínio deve aparecer no comentário do `playwright.config.ts`: **um browser só**,
> porque service worker no Playwright é Chromium-only (`02-VALIDATION.md` § Lacuna).

---

### `tests/pwa/helpers.ts` (test helper)

**Analog:** `tests/helpers.ts` — módulo `.ts` sem `.test.` no nome, exportando fixtures e
utilidades, com comentário que explica **por que a fixture é o que é**:

```ts
/**
 * A world from BASE_CONFIG, with `players` DEEP-COPIED.
 *
 * The copy is what lets a test write `w.config.players[0].forge.wise = 3`
 * without that value leaking into every other world built afterwards — a
 * shared literal would make the suite order-dependent, which is the one thing
 * a determinism suite must never be.
 */
export function makeTestWorld(overrides: Partial<RunConfig> = {}): World {
```

Mesmo movimento em `tests/pwa/helpers.ts`: o servidor estático da fixture precisa ser
**derrubável** (`server.close()`), e o comentário tem de dizer por quê — `setOffline()` é
emulação por CDP e há relato de que não alcança requisições do service worker
(`02-VALIDATION.md` § Notas, item 2).

---

### `public/sw.js` (service worker) — o arquivo é reescrito inteiro

**Analog:** ele mesmo. O cabeçalho atual (`:1-19`) **documenta o próprio defeito** que D2-10
mata — cite-o no commit, porque é a prova de que o incidente já aconteceu neste repositório:

```js
// Task 20 debt #1 (task-20-brief.md): the scaffolding task copied ORIG's
// sw.js verbatim, precaching per-file sources (`engine.js`, `combat.js`, ...)
// that don't exist in this Vite-built app — `cache.addAll`
// rejects the whole install if any single URL 404s, so this would have
// broken PWA install outright the moment something registered it.
```

**Os cinco defeitos, com linha, para o diff ser conferível:**

| Defeito | Linha atual | O que substitui |
|---|---|---|
| `CACHE` literal, nunca bumpado | `:20` `const CACHE = 'dungeonguys2-v1';` | `'dg2-' + __BUILD_HASH__` |
| `PRECACHE` escrito à mão, com caminhos relativos | `:22-30` | `__PRECACHE__` derivado do `dist/` |
| `skipWaiting()` no install | `:36` | nada — o `message` handler decide (D2-09) |
| `caches.keys()` + delete-tudo e `clients.claim()` | `:42-44` | filtro por prefixo `dg2-`, sem `claim` (DM-3) |
| network-first com `cache.put` sem checar `res.ok` | `:65-73` | allowlist + `if (res.ok)` (P-2) |

```js
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});
```

> Este bloco é **byte a byte o mesmo** que o `sw.js` vivo do DungeonGuys original
> (`02-RESEARCH.md` DM-3). Cache Storage é por origem: manter a forma `keys()`-e-apaga-tudo
> num domínio compartilhado é o que sabotaria o jogo irmão. O template alvo está em
> `02-RESEARCH.md:1113`.

**Padrão de nomenclatura por prefixo — o precedente é `src/app/save.ts:6-11`:**

```ts
// Key change (resolution, task-20-brief.md): the key becomes
// `dungeonguys2_save_v1`, not `dungeonguys_save_v1`. Both games are served
// from the same `github.io` origin and would otherwise share one
// `localStorage`, letting one game's progress overwrite the other's.
```

O `dg2-` do nome do cache é a mesma decisão, um armazenamento adiante — e o cabeçalho do
`sw.js` novo deve dizer isso, porque `save.ts` só viu metade do problema.

---

### `src/main.ts` (app entry, event-driven)

**Analog:** ele mesmo, duas costuras.

**A costura 1 — o registro atual** (`:33-40`), que muda pouco mas ganha o ciclo de update:

```ts
// ─── PWA (Step 6, task-20-brief.md) ───────────────────────────────────────
// `import.meta.env.BASE_URL` is Vite's `base` (vite.config.ts: '/DungeonGuys2/'
// in production, '/' in dev) — registering a relative 'sw.js' would resolve
// against the current page instead and 404 once the app is nested under a
// repo subpath. ORIG/ui.js:282-284.
if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  navigator.serviceWorker.register(import.meta.env.BASE_URL + 'sw.js').catch(() => {});
}
```

> O comentário fica **desatualizado** no instante em que `base` vira `'/'`. Reescrevê-lo é
> parte da tarefa de `base` (Fatia A), não da tarefa do `sw.js` — a CONTEXT.md exige que as
> duas sejam tarefas separadas.

**A costura 2 — o gate "fora de partida" já existe** (`:64`, `:178`, `:188-197`):

```ts
let gameStarted = false; // false until the first beginRun() — guards `world.phase` reads
```

```ts
/** ORIG/engine.js:228 (`quitGame`). */
function quitGame(): void {
  stopSimLoop?.();
  stopSimLoop = null;
  cancelAnimationFrame(pauseRaf);
  input?.destroy();
  gameStarted = false; // Escape must be a no-op again until the next run starts
  dom.hud.classList.add('hidden');
  showScreen('start');
  Sfx.stopMusic();
}
```

`quitGame()` é literalmente "voltou ao menu, `gameStarted === false`, tela `start` visível" —
é o ponto exato onde o aviso persistente de D2-09 deve reaparecer. **Não invente uma flag
nova.**

**Padrão de fiação de callback com estado do jogo** (`:217-224`) — a forma que a oferta de
update deve seguir (fecha sobre o estado, não o lê de fora):

```ts
createPauseControl(
  () => (gameStarted ? world.phase : null),
  paused => { /* ... */ },
  { onRestart: startFromSelection, onQuit: quitGame },
);
```

---

### `src/ui/screens.ts` + `src/ui/dom.ts` + `index.html` (UI component)

**Analog:** `src/ui/screens.ts:159-168` — `announce()`, o toast que a pesquisa recomenda para a
metade "durante a partida":

```ts
let announceTimer: ReturnType<typeof setTimeout> | undefined;

/**
 * ORIG/engine.js:335-341 (`announceWave`). Cancels any previous hide timer
 * first — without that, a fast second announcement gets cut short by the
 * first one's timeout instead of getting its own full 2600ms.
 */
export function announce(text: string): void {
  dom.waveAnnounce.textContent = text;
  dom.waveAnnounce.classList.remove('hidden', 'show');
  void dom.waveAnnounce.offsetWidth; // restart the CSS animation
  dom.waveAnnounce.classList.add('show');
  clearTimeout(announceTimer);
  announceTimer = setTimeout(() => dom.waveAnnounce.classList.remove('show'), 2600);
}
```

**Padrão de fiação de botão — módulo-nível, `mouseOnly`** (`:207-210`):

```ts
dom.btnShareWa.addEventListener('click', mouseOnly(() => shareWhatsApp(false)));
dom.btnShareTg.addEventListener('click', mouseOnly(() => shareTelegram(false)));
dom.btnShareWaVictory.addEventListener('click', mouseOnly(() => shareWhatsApp(true)));
dom.btnShareTgVictory.addEventListener('click', mouseOnly(() => shareTelegram(true)));
```

**Elemento resolvido uma vez, em `dom.ts`** (`:85-96`), com o comentário de origem — o botão
`RECARREGAR AGORA` entra aqui, não por `getElementById` inline:

```ts
  // Pause screen buttons (ORIG/ui.js:173-176) — Escape-only under task-18;
  // Task 20 wires the clicks too.
  btnResume: document.getElementById('btn-resume')!,
  btnPauseRestart: document.getElementById('btn-pause-restart')!,
  btnQuit: document.getElementById('btn-quit')!,
  btnStart: document.getElementById('btn-start')!,
```

> `dom.ts:19-21` explica a regra: *"Every id is resolved with
> `document.getElementById(id)!` — if an id is missing from index.html, that surfaces
> immediately as a runtime error"*. Ou seja: **o markup em `index.html` e a entrada em
> `dom.ts` andam no mesmo commit**, ou o jogo quebra no boot.

**Onde o markup entra** (`index.html:119-120`) — logo abaixo do START, dentro do
`#start-screen`:

```html
        <button id="btn-start" class="btn-pixel">▶ START GAME</button>
        <div class="footer-hint">Survive the waves. Collect gold. Die gloriously.</div>
```

**`GAME_URL` aponta para o Pages** (`screens.ts:180`) — muda junto com o domínio (D2-15: o
domínio real vem de `/etc/dg2/env` **no servidor**; aqui é uma constante de cliente e vai para
o bundle público, então não é segredo):

```ts
const GAME_URL = 'https://gustavoktausend.github.io/DungeonGuys2/';
```

---

### `index.html` + `src/style.css` + `public/fonts/` (build-time, D2-05/DM-5/D2-20)

**Analog:** o próprio `index.html:8-14`, que reúne os três defeitos numa janela de sete linhas:

```html
  <link rel="manifest" href="manifest.json" />
  <link rel="icon" href="icons/icon-192.png" />
  <link rel="apple-touch-icon" href="icons/icon-192.png" />
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Press+Start+2P&family=Pixelify+Sans:wght@400;500;600;700&display=swap" rel="stylesheet" />
```

- `:8-10` são os `href` relativos que o Vite **não** reescreve (DM-5) → viram `/manifest.json`,
  `/icons/icon-192.png`.
- `:11-13` são as três linhas que D2-20 remove, substituídas por `@font-face` local.

**Onde o `@font-face` encosta no CSS** (`src/style.css:4-20`) — o bloco `:root` de variáveis
é o topo do arquivo; `--pixel-font` e `--display-font` são consumidos em ~40 regras
(`grep -n "font-family" src/style.css`), então **as declarações mudam, os consumidores não**:

```css
:root {
  --dungeon-bg:    #0a0a0f;
  --leather:       #221610;
  ...
```

**Onde os `.woff2` moram** — `public/assets/` e `public/icons/` são o precedente de binário
servido verbatim (`public/assets/`: 129 KB; `public/icons/`: 69 KB). Um `public/fonts/` novo
entra no `dist/` pelo mesmo caminho e, por consequência, no precache derivado **sem código
extra** — que é exatamente o argumento de D2-20.

---

### `package.json` (config, monorepo)

**Analog:** ele mesmo. **Workspaces** (`:6-8`) — D2-04 acrescenta `"apps/*"`:

```json
  "workspaces": [
    "packages/*"
  ],
```

**Scripts — a simetria que `typecheck:server` e `sw:emit`/`sw:verify` devem manter** (`:11-25`):

```json
    "build": "npm run sim:build && npm run sim:version && tsc --noEmit && vite build",
    "test": "vitest run",
    "test:browser": "vitest run --config vitest.browser.config.ts",
    "typecheck:sim": "tsc -p packages/sim/tsconfig.json --noEmit",
    "typecheck:protocol": "tsc -p packages/protocol/tsconfig.json --noEmit",
    "sim:build": "vite build --config packages/sim/vite.config.ts",
    "sim:version": "node tools/sim-version/emit.mjs",
    "sim:version:verify": "node tools/sim-version/verify.mjs",
```

O par `sim:version` / `sim:version:verify` é o molde literal de `sw:emit` / `sw:verify`
(`tools/README.md` §2: uma linha, invocada por `npm run`, nunca pelo caminho do arquivo).

**A invariante que D2-04 protege** (`:27`):

```json
  "dependencies": {},
```

---

### `apps/server/package.json` e `apps/server/tsconfig.json` (config, workspace)

**Analog:** `packages/protocol/` — o workspace mais novo, e o único que já declara dependência
de outro workspace.

`packages/protocol/package.json` inteiro:

```json
{
  "name": "@dg2/protocol",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "exports": {
    ".": "./src/index.ts"
  },
  "dependencies": {},
  "devDependencies": {
    "@dg2/sim": "*"
  }
}
```

> `apps/server/package.json` copia tudo isso e **quebra uma coisa de propósito**: `dependencies`
> deixa de ser `{}` (hono, `@hono/node-server`, better-sqlite3, kysely). É o único lugar do
> repositório onde isso é permitido, e o comentário de D2-04 tem de estar no `package.json` da
> raiz ou no `ops/README.md`, já que JSON não aceita comentário.

`packages/protocol/tsconfig.json:6-15` — o comentário que explica por que `lib`/`types` são
restritos, e que **o servidor inverte**:

```jsonc
    // Same shape as packages/sim, for a related but distinct reason. The sim
    // is pure because determinism demands it; the protocol is runtime-agnostic
    // because the SAME wire vocabulary has to compile inside a browser tab and
    // inside a Node process. No browser library in `lib`, no ambient `types`,
    // so a stray reference to a page-only global fails here even though the
    // root tsconfig (which does have the browser library) would accept it.
    "lib": ["ES2022"],
    "types": [],
```

> `apps/server/tsconfig.json` é o **espelho**: `lib: ["ES2022"]` (sem DOM) e
> `types: ["node"]` — o único tsconfig do repositório que pede tipos de Node. Escreva a razão
> no mesmo lugar, no mesmo tom.

**Integração que ninguém pega sozinho:** o `include` do `tsconfig.json` da raiz é
`["src", "tests", "packages", "vite.config.ts", "eslint.config.js"]` (`:25`) — **`apps` não
está lá**, então `tsc --noEmit` do `build` não cobre o servidor. Daí `typecheck:server` ter de
ser um script à parte, simétrico aos dois que já existem. Já o `eslint.config.js:9` ignora
`['dist', 'packages/*/dist', 'public', 'node_modules', 'tools']` — **`apps/` não está
ignorado**, então `npm run lint` vai lintar `apps/server/src/**/*.ts` a partir do primeiro
commit. Decida qual das duas coisas acontece (lintar com um bloco `files:` próprio, ou
ignorar) **na mesma task que cria o workspace**.

---

### `apps/server/src/db/migrations.ts` (migration, CRUD)

**Sem analog de código.** A fonte da forma é `02-RESEARCH.md:1009` § Code Examples (provider
estático, não `FileMigrationProvider`).

**Mas a forma do dado tem analog, e ele diverge do exemplo da pesquisa.**
`src/app/ledger.ts:41-53` é o `LedgerEvent` que o cliente grava hoje:

```ts
export type LedgerEvent = {
  /** Client-generated ULID; the server's UNIQUE(id) dedupe key (D-27). */
  id: string;
  /** Stamped at creation, even while the account is local and unclaimed (D-31). */
  accountId: string;
  /** Positive grants, negative spends. The balance is their sum (D-28). */
  amount: number;
  reason: LedgerReason;
  /** Epoch ms, for display only — the ordering is carried by the ULID. */
  at: number;
  /** Server watermark. Absent means the entry has not been confirmed yet. */
  confirmed?: number;
};
```

**Divergência a resolver antes de escrever a migração** (o planejador decide, e registra):

| Exemplo em `02-RESEARCH.md:1009` | Cliente hoje (`src/app/ledger.ts:41-53`) | Observação |
|---|---|---|
| `delta` | `amount` | Nomes diferentes para o mesmo campo |
| `created_at` | `at` | idem |
| `device_id` (notNull) | **não existe** | Um campo `notNull` que nenhum cliente produz |
| — | `confirmed` (marca d'água) | D2-02 pede a marca d'água **por nome**; falta no exemplo |

O `docs/adr/0010-soul-gold-ledger-append-only.md` §"O ledger (D-27, D-28, D-29)" é a fonte
canônica; a pesquisa é sugestão. `tests/ledger.test.ts` e `tests/ulid.test.ts` já travam o
formato do lado do cliente.

---

### `apps/server/src/index.ts` (server entry, request-response)

**Analog parcial de forma:** `src/main.ts:22-48` — o único outro entrypoint do repositório, e
tem a mesma propriedade "efeito colateral no topo do módulo, incluindo `await`":

```ts
const canvas = document.getElementById('game-canvas') as HTMLCanvasElement;
const ctx = canvas.getContext('2d')!;
// ...
await loadSprites();
initStartScreen();
```

O servidor faz o mesmo movimento com `await new Migrator(...).migrateToLatest()` antes de
`serve()` (D2-07). O código de referência completo está em `02-RESEARCH.md:1057`.

**Sem analog:** `health.ts`, `db/open.ts`. Nada no repositório abre banco, escuta porta ou
responde HTTP. Siga `02-RESEARCH.md` § Code Examples e as recomendações de discrição 1, 2 e 3.

---

### `.github/workflows/ci.yml` (CI config, pipeline)

**Analog:** ele mesmo. **O cache de browser por versão exata do lock já existe** (`:50-60`) — o
job `pwa` reaproveita, **não** reinventa:

```yaml
      # A versao exata do Playwright e a variavel do experimento de determinismo:
      # um cache compartilhado entre versoes diferentes invalida o portao.
      - id: playwright-version
        run: echo "version=$(node -p "require('./package-lock.json').packages['node_modules/playwright'].version")" >> "$GITHUB_OUTPUT"

      - uses: actions/cache@v4
        with:
          path: ~/.cache/ms-playwright
          key: ${{ runner.os }}-ms-playwright-${{ steps.playwright-version.outputs.version }}

      - run: npx playwright install --with-deps chromium firefox webkit
```

**Forma dos passos** (`:11-23`) — `checkout@v4`, `setup-node@v4` com `node-version: '24'` e
`cache: npm`, `npm ci`, depois um `- run: npm run <script>` por portão:

```yaml
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '24'
          cache: npm

      - run: npm ci
      - run: npm run lint
```

**Convenção de comentário observada e que os jobs novos devem manter:** os comentários do
`ci.yml` são **em português sem acentos**, e explicam *por que o passo existe e o que a falha
dele significa*, não o que o comando faz (`:25-30`, `:62-69`). Exemplo:

```yaml
      # FORM-03: prova que o SIM_VERSION e reproduzivel (dois builds da mesma
      # fonte dao o mesmo valor) e sensivel (editar packages/sim/src muda o
      # valor). Roda aqui, e nao so no build final, para que a perda de
      # reprodutibilidade apareca no proprio PR que a causou
```

**O que o `deploy.yml` faz de errado, para o diff de remoção ficar justificado** (`deploy.yml:24-32`):

```yaml
          node-version: 20
          cache: npm
      - run: npm ci
      - run: npm run lint
      - run: npm test
      - run: npm run build
      - uses: actions/upload-pages-artifact@v3
```

Node 20 (o `ci.yml` usa 24), `lint`/`test`/`build` duplicados, e nenhum dos portões caros
(`sim:version:verify`, `test:browser`). É o argumento executável de DM-4.

---

### `ops/README.md` e `docs/OPERACAO.md` (doc)

**Analog de `ops/README.md`:** `tools/README.md` — decisões numeradas, cada uma com o motivo,
escritas para o leitor futuro que vai querer mudá-las:

```markdown
# `tools/` — convenção de scripts Node

Scripts utilitários que rodam **fora** do jogo: ...

Até o plano 01-01 este repositório não tinha nenhum script Node, então as cinco
perguntas abaixo não tinham resposta no código. Ficam decididas aqui, e valem
para todos os planos seguintes.

## 1. Extensão `.mjs` explícita
```

O `ops/README.md` é o mesmo movimento para um diretório que também nasce vazio de convenção:
como reconstruir a caixa, onde mora `/etc/dg2/env`, quais units instalar, e por que
`ln -sfn` direto no `current` não serve.

**Analog de `docs/OPERACAO.md`:** `docs/PARIDADE.md:1-16` — documento datado, com estados
explícitos por item e a regra de que só conta o que foi provado:

```markdown
# Paridade com o DungeonGuys original

Verificado em: 2026-08-28 · último commit de código: `24f5e49`
(este documento entra no commit seguinte).

- **[x] verificado** — provado por um teste automatizado, com o arquivo de
  teste citado. Código que "parece certo" mas não tem teste **não** conta.
- **[ ] aguardando o humano** — depende de olho, ouvido, mão ou hardware ...
```

`docs/OPERACAO.md` recebe: o ensaio de restauração de D2-03 (data, duração, o que faltou), a
primeira checagem verde do monitor externo (D2-21), e nada mais.

**Ligação obrigatória com `docs/PARIDADE.md:234-237`** — a caixa que D2-11 manda deixar
**aberta**:

```markdown
- [ ] PWA instalável e funcional offline — *aguardando o humano*. O
      `public/sw.js` foi reescrito na Task 20 (o do original pré-cacheava
      arquivos que não existem neste build); instalar de verdade num
      dispositivo é o único teste que vale.
```

> Se algum plano tocar essa linha, ele deve **atualizar o texto** (o `sw.js` deixou de ser o
> da Task 20) **sem marcar a caixa**. Marcar é contradizer D2-11.

---

## Shared Patterns

### 1. Contrato de script `.mjs` — falha e sucesso
**Source:** `tools/README.md` §1-§5 e `tools/sim-version/emit.mjs:48-52`
**Apply to:** `tools/sw/emit.mjs`, `tools/sw/verify.mjs`, `tools/ops/restore-verify.mjs`

```js
/** Failure: `file:pointer: message` on stderr, exit 1 (tools/README.md §3). */
function fail(file, pointer, message) {
  console.error(`${file}:${pointer}: ${message}`);
  process.exit(1);
}
```

Regras que vêm junto: extensão `.mjs`; entrada de **uma linha** em `scripts` do
`package.json` e invocação sempre por `npm run`; **uma** linha em `stdout` no sucesso, sem
banner; nenhum `throw` não tratado; `tools/` fora do `tsconfig` e dentro do `ignores` do
ESLint (`eslint.config.js:9`) — a cobertura vem de rodar no CI.

### 2. Leitura de arquivo dentro de teste
**Source:** `tests/purity.test.ts:21-29`
**Apply to:** `tests/build-base.test.ts`, `tests/workflows.test.ts`

```ts
// Vite's raw glob, not node:fs — tsconfig's `types` is ["vite/client"] only.
const FILES = import.meta.glob<string>('../packages/sim/src/**/*.ts', {
  query: '?raw', import: 'default', eager: true,
});
```

Nenhum teste do repositório importa `node:*`. Quebrar isso exige `tsconfig` próprio — ver a
lacuna dos testes de servidor acima.

### 3. Guarda contra teste vacuamente verde
**Source:** `tests/purity.test.ts:81-83`
**Apply to:** todo teste estrutural novo, e **em especial** `tests/build-base.test.ts`

`dist/` é gitignored (`.gitignore:2`) e pode não existir quando o teste roda. Um glob vazio
passa em silêncio. Assere a contagem antes de asserir o conteúdo.

### 4. Confinamento de dependências
**Source:** `package.json:27` (`"dependencies": {}`), `packages/sim/package.json:11`,
`packages/protocol/package.json:11`, `tests/purity.test.ts:85-92`
**Apply to:** `apps/server/package.json`, `package.json` da raiz

O teste cobre **só** `packages/sim`. A raiz e `apps/*` não têm guarda executável — se o
planejador quiser uma (e D2-04 é literalmente sobre isso), a forma pronta está no excerto de
`purity.test.ts:85-92`, é um `it` de seis linhas, e cabe em `tests/build-base.test.ts`.

### 5. Prefixo próprio em armazenamento compartilhado por origem
**Source:** `src/app/save.ts:6-11`, `src/app/ledger.ts:17-19`
**Apply to:** nome do cache do service worker (`dg2-*`), e ao filtro do `activate`

O `localStorage` já foi resolvido por prefixo; Cache Storage é o mesmo problema um andar
acima, e **não** tem solução por nome — só por origem (DM-3). O filtro por prefixo é o que
impede o SW deste jogo de apagar cache alheio.

### 6. Idioma e tom
**Source:** `CLAUDE.md` § Constraints; `tests/*.test.ts`; `.github/workflows/ci.yml:19-45`
**Apply to:** tudo

- Comentários de código: **inglês**.
- Nomes de `describe`/`it` e mensagens de erro dos scripts: **português**
  (`describe('pureza de packages/sim')`, `'bundle vazio — o build da etapa 1 não emitiu nada'`).
- Comentários de workflow YAML: **português sem acentos** (convenção observada em `ci.yml`).
- Comentários explicam **por que**, e o que a falha significa — não o que a linha faz.

### 7. Comentário que documenta o próprio incidente
**Source:** `public/sw.js:5-19`, `tools/sim-version/emit.mjs:3`, `tools/golden/rebaseline.mjs:3-11`
**Apply to:** todo arquivo novo que existe por causa de um defeito conhecido

Este repositório escreve o incidente no cabeçalho do arquivo que o corrigiu. `tools/sw/emit.mjs`
tem um a herdar por escrito: *"lista de precache escrita à mão já quebrou uma vez aqui"*.

---

## No Analog Found

Arquivos sem nenhum equivalente no repositório. Para todos eles a fonte é
`02-RESEARCH.md` § "Code Examples" (com número de linha abaixo), e a convenção de estilo a
herdar é a de `tools/` (§ Shared Patterns 1 e 6).

| File | Role | Data Flow | Reason | Fonte do padrão |
|------|------|-----------|--------|-----------------|
| `ops/Caddyfile` | config (infra) | request-response | Não existe nenhum arquivo de servidor web no repo | `02-RESEARCH.md:903` |
| `ops/dg2.service` | config (infra) | — | Nenhuma unit de systemd existe | `02-RESEARCH.md:959` |
| `ops/litestream.service` · `ops/litestream.yml` | config (infra) | streaming | idem; e o `replica:` singular do v0.5 é armadilha (P-8) | `02-RESEARCH.md` P-8 |
| `ops/cert-check.{sh,service,timer}` | script + config | batch | Nenhum `.sh` é versionado hoje (`git ls-files` confirma) | `02-RESEARCH.md:1296` |
| `ops/deploy.sh` · `ops/rollback.sh` · `ops/prune-releases.sh` | script (ops) | batch | idem | `02-RESEARCH.md:605` (Padrão 1) |
| `apps/server/src/health.ts` | route/controller | request-response | Nenhuma rota HTTP existe no projeto | `02-RESEARCH.md:1057` |
| `apps/server/src/db/open.ts` | infra (db) | CRUD | Nenhum banco existe; `localStorage` é o único armazenamento | `02-RESEARCH.md:1057` |
| `tests/server-*.test.ts` | test (integração) | CRUD / request-response | Nenhum teste usa API de Node; `types: ["vite/client"]` bloqueia | ver § Pattern Assignments |
| `.github/workflows/ci.yml` job `deploy` | CI config | pipeline | Nenhum deploy por SSH existe; o `deploy.yml` atual é Pages | `02-RESEARCH.md:1324` |

**Nota sobre `ops/` como diretório:** é novo, e a CONTEXT.md já registra isso
(`<code_context>` § "Configuração de infra ainda não existe no repositório"). O que ele
**herda** do repositório não é forma de arquivo, é disciplina: script que falha em silêncio
não conta, comentário diz por quê, e nada com segredo entra no git (`/etc/dg2/env` fica fora,
D2-15).

---

## Notas para o planejador (achados colaterais do mapeamento)

1. **`vite.config.ts` tem exatamente 7 linhas** e o comentário `// GitHub Pages serves the repo
   under /DungeonGuys2/` (`:3`) morre junto com o `base`. A tarefa de Fatia A é literalmente
   duas linhas de código e três comentários desatualizados (aqui, `src/main.ts:33-37`,
   `screens.ts:180`).
2. **`public/manifest.json:5-6`** usa `"start_url": "."` e `"scope": "."` — DM-6 mediu que
   **não precisa mudar**. Resistir à tentação de "arrumar" é parte da tarefa.
3. **`dist/` já existe na máquina** com `assets/index-BIs87PxM.css` e `index-DuyWLVhi.js` — os
   dois nomes hasheados que hoje nenhum precache alcança, e o alvo direto de D2-10.
4. **A fixture `tests/pwa/fixtures/old-build/`** precisa do `public/sw.js` **atual** (2549 B,
   idêntico ao `dist/sw.js` — medido pela pesquisa). Congele-a **antes** da task que reescreve
   o `sw.js`, ou o fixture nasce já sendo o build novo.
5. **`tools/assets/fixtures/{good,bad}/`** é o precedente de fixture versionada que existe para
   provar aceitação **e** recusa; `tests/pwa/fixtures/old-build/` é o mesmo tipo de artefato.

---

## Metadata

**Analog search scope:** `src/`, `tests/`, `tools/`, `packages/`, `public/`, `docs/`,
`.github/workflows/`, arquivos de config da raiz
**Files scanned:** 31 lidos integralmente ou em trecho dirigido; `git ls-files` varrido para
confirmar ausência de `.sh`/`.service`/`Dockerfile`
**Pattern extraction date:** 2026-08-31
