# Phase 1: Formato e costuras - Pattern Map

**Mapped:** 2026-08-31
**Files analyzed:** 54 arquivos/grupos a criar ou modificar
**Analogs found:** 46 / 54 (8 sem análogo — convenção nova, listada em `## No Analog Found`)

> Rótulos de estrutura ficam em inglês porque são lidos por ferramenta.
> O conteúdo é em português. Os trechos de código são citados **literalmente** do repositório.

Esta fase não é de feature: é de **congelamento de formato e reestruturação**. O resultado prático é
que a maioria dos "novos" arquivos ou (a) é código existente **movido**, ou (b) é módulo puro cujo
molde já existe em `src/sim/`, ou (c) é ferramenta Node — categoria para a qual **este repositório
não tem nenhuma convenção ainda**. O planejador deve tratar as três de forma diferente.

**Três medições que o planejador precisa ter em mãos:**

| Medida | Valor real, conferido hoje |
|--------|----------------------------|
| Imports que referenciam `sim/` de **fora** de `src/sim` | **108 linhas em 36 arquivos** (`src/app`, `src/render`, `src/ui`, `src/main.ts`, `tests/`) |
| Imports relativos **internos** a `src/sim` | **83 linhas** — continuam relativos, **não mudam** |
| Barrel/`index.ts` em `src/sim` | **não existe** — `packages/sim/src/index.ts` é convenção nova |
| Call sites de trigonometria em `src/sim` | **27** (12 `sin`, 12 `cos`, 3 `atan2`) em **7** arquivos. `constants.ts:4` é comentário, não conta |
| Testes hoje | 244 testes em 21 arquivos; **zero** deles importa de `src/app/` |
| Scripts Node (`.mjs`/`.cjs`) no repositório | **zero** — `find` fora de `node_modules`/`dist` não achou nenhum |

---

## File Classification

### packages/sim — extração + módulos novos

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `packages/sim/src/math.ts` (NOVO) | module puro (folha) | transform | `src/sim/rng.ts` (63 l.) | role-match |
| `packages/sim/src/serialize.ts` (NOVO) | module puro | serialização | `tests/helpers.ts:33-62` + `src/sim/rng.ts:56-62` | exact (é o código a promover) |
| `packages/sim/src/index.ts` (NOVO) | barrel / entry do pacote | — | — | **no analog** |
| `packages/sim/src/step.ts` (MOD) | orquestrador de tick | event-driven | ele mesmo, `src/sim/step.ts:14-33` | exact |
| `packages/sim/src/xp.ts` (MOD — corte do SCC) | module de regra | event-driven | ele mesmo, `src/sim/xp.ts:107-114` | exact |
| `packages/sim/src/types.ts` (MOD — `RunConfig.players`, `objectives`) | tipos | — | ele mesmo, `src/sim/types.ts:224-284` | exact |
| `packages/sim/src/world.ts` (MOD — `objectives`, remover `nextWaveDelay`) | factory de estado | — | ele mesmo, `src/sim/world.ts:6-52` | exact |
| `packages/sim/src/constants.ts` (MOD — doutrina, `SPRITE_SCALE`) | config/const | — | ele mesmo, `src/sim/constants.ts:1-34` | exact |
| `packages/sim/src/stats.ts` (MOD — mover `STAT_LABELS`/`PCT_STATS`) | module de regra | transform | ele mesmo, `src/sim/stats.ts:65-76` | exact |
| 7 arquivos de trigonometria (MOD): `arena.ts`, `boss.ts`, `combat.ts`, `enemies.ts`, `loot.ts`, `run.ts`, `special.ts` | modules de regra | transform | eles mesmos (linhas na tabela abaixo) | exact |
| 24 arquivos de `src/sim/**` movidos (MOD — só caminho) | — | — | — | mecânico |
| `packages/sim/package.json` (NOVO) | config | — | `package.json` (raiz) | role-match |
| `packages/sim/tsconfig.json` (NOVO) | config | — | `tsconfig.json` (raiz) | exact |
| `packages/sim/vite.config.ts` (NOVO) | config de build | — | `vite.config.ts` (raiz, 7 l.) | role-match |

### packages/protocol — nasce nesta fase

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `packages/protocol/src/enums.ts` (NOVO) | tabela congelada append-only | — | `src/sim/defs/mutators.ts` (12 l.) | role-match |
| `packages/protocol/src/version.ts` (NOVO) | const + função pura de checagem | request-response | `src/sim/constants.ts` (const + doutrina no header) | partial |
| `packages/protocol/src/inputCodec.ts` (NOVO) | codec binário | transform | `src/sim/rng.ts` (bit ops) + `src/app/input.ts:102-128` (forma do `InputState`) | partial |
| `packages/protocol/src/index.ts` (NOVO) | barrel | — | — | **no analog** |
| `packages/protocol/package.json` (NOVO) | config | — | `package.json` (raiz) | role-match |

### src/app e src/ — ficam na raiz (D-15)

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `src/app/stepper.ts` (NOVO) | driver de passo fixo | event-driven | `src/app/loop.ts:15-44` | exact (é extração literal) |
| `src/app/loop.ts` (MOD — vira só adaptador de rAF) | adaptador de plataforma | event-driven | ele mesmo | exact |
| `src/app/input.ts` (MOD — quantização D-02/D-03) | captura | request-response | ele mesmo, `:102-128` | exact |
| `src/app/ledger.ts` (NOVO) | store persistente append-only | CRUD/append | `src/app/save.ts:56-129` | role-match |
| `src/app/ulid.ts` (NOVO, ou dentro de `ledger.ts`) | utility | transform | `src/sim/rng.ts:12-18` (bit ops determinísticas) | partial |
| `src/main.ts` (MOD — imports + `'p1'` em 6 lugares) | composition root | — | ele mesmo, `:99-105,113-130` | exact |
| `src/render/**`, `src/ui/**` (MOD — só imports) | — | — | — | mecânico |

### tools/ — o diretório não existe

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `tools/sim-version/emit.mjs` (NOVO) | script Node de build | file-I/O | — | **no analog** |
| `tools/sim-version/verify.mjs` (NOVO) | script Node de verificação | file-I/O | — | **no analog** |
| `tools/golden/rebaseline.mjs` (NOVO) | script Node de manutenção | file-I/O | — | **no analog** |
| `tools/assets/validate.mjs` (NOVO) | validador de CI | file-I/O | — | **no analog** |
| `tools/assets/schema/manifest.v1.json` (NOVO) | schema versionado | — | `public/manifest.json` (só como "JSON commitado") | partial |

### tests/

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `tests/math-oracle.test.ts` (NOVO) | teste unitário de módulo folha | transform | `tests/rng.test.ts` (76 l.) | exact |
| `tests/cross-engine.test.ts` (NOVO) | teste de integração multi-motor | — | `tests/determinism.test.ts` | role-match |
| `tests/scc.test.ts` (NOVO) | meta-teste de invariante do repo | file-I/O | `tests/purity.test.ts` | exact |
| `tests/protocol-vocabulary.test.ts` (NOVO — FORM-12) | meta-teste de invariante | file-I/O | `tests/purity.test.ts:28-45,77-86` | exact |
| `tests/protocol-enums.test.ts` (NOVO) | teste de snapshot de tabela | — | `tests/defs.test.ts:1-43` | role-match |
| `tests/canonical-order.test.ts` (NOVO) | teste unitário de determinismo | — | `tests/determinism.test.ts:22-32` | exact |
| `tests/serialize.test.ts` (NOVO) | teste unitário de round-trip | — | `tests/determinism.test.ts:57-66` | role-match |
| `tests/input-codec.test.ts` (NOVO) | teste unitário de codec | transform | `tests/rng.test.ts` | role-match |
| `tests/stepper.test.ts` (NOVO) | teste unitário de módulo `app/` | event-driven | `tests/camera.test.ts` (47 l.) | role-match |
| `tests/ledger.test.ts` (NOVO) | teste unitário de store | CRUD | `tests/camera.test.ts` (forma) | partial |
| `tests/ulid.test.ts` (NOVO) | teste unitário | transform | `tests/rng.test.ts` | role-match |
| `tests/identity.test.ts` (NOVO — FORM-01) | meta-teste | file-I/O | `tests/purity.test.ts` | role-match |
| `tests/purity.test.ts` (MOD — 3 asserções novas) | meta-teste | file-I/O | ele mesmo | exact |
| `tests/boss.test.ts` (MOD — **estender**, 10 casos) | teste unitário | — | `tests/combat.test.ts:9-19` (helpers de montagem) | exact |
| `tests/helpers.ts` (MOD — `hashWorld` sai) | helper de teste | — | ele mesmo | exact |
| `tests/golden/campaign-mage-3000.json` (NOVO) | dado de teste versionado | — | — | **no analog** |
| 21 arquivos de teste (MOD — só imports) | — | — | — | mecânico |

### Configuração de raiz e CI

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `package.json` (MOD — workspaces, devDeps, scripts) | config | — | ele mesmo (22 l.) | exact |
| `tsconfig.json` (MOD — `include` dos pacotes) | config | — | ele mesmo (17 l.) | exact |
| `vitest.config.ts` (NOVO) | config de teste | — | `vite.config.ts` | role-match |
| `vitest.browser.config.ts` (NOVO) | config de teste | — | `vite.config.ts` | partial |
| `eslint.config.js` (MOD — estender `no-restricted-properties`) | config de lint | — | ele mesmo, `:20-23` | exact |
| `.github/workflows/ci.yml` (NOVO) | config de CI | — | `.github/workflows/deploy.yml` (42 l.) | role-match |

### docs/

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `docs/adr/NNNN-slug.md` × 9 (D-30..D-38) | documento de decisão | — | `docs/DECISOES-MARCO0.md` | partial (formato de conteúdo, não de arquivo) |
| `docs/adr/README.md` (índice) | documento | — | — | **no analog** |
| Spec técnica de assets (FORM-09) | documento | — | `docs/PARIDADE.md` / `docs/BACKLOG.md` (estilo) | partial |

---

## Pattern Assignments

### `packages/sim/src/math.ts` (module puro folha, transform)

**Analog:** `src/sim/rng.ts` — é o **único outro módulo folha** de `src/sim` (não importa nada de
`sim/`), e é o que já estabelece o contrato "algoritmo determinístico com manipulação de bits,
documentado no cabeçalho, exportando funções curtas com JSDoc de uma linha".

**Header + estado de módulo** (`src/sim/rng.ts:1-9`):

```typescript
// rng.ts — seeded PRNG (mulberry32). The whole state is one 32-bit int,
// so a snapshot can carry it verbatim.

export class Rng {
  private s: number;

  constructor(seed: number) {
    this.s = seed >>> 0;
  }
```

Convenção a copiar: cabeçalho `// nome.ts — o que é, em inglês, e a propriedade que ele compra`.
Comentários de código em inglês; nomes de teste em português.

**Aritmética de bits determinística** (`src/sim/rng.ts:12-18`) — o precedente de que `Math.imul`,
`>>>` e literais são o vocabulário aceito em `sim/`:

```typescript
  next(): number {
    this.s = (this.s + 0x6d2b79f5) >>> 0;
    let t = this.s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
```

**A doutrina que `math.ts` fecha** — está escrita em `src/sim/constants.ts:1-20` e é o briefing
literal de D-01. O planejador deve mandar **reescrever este bloco** no mesmo commit, porque ele diz
"OPEN ITEM for Marco 2" sobre exatamente o que esta fase entrega:

```typescript
// constants.ts — fixed timestep and world geometry.
//
// ─── Floating-point doctrine for sim/ ─────────────────────────────────────────
// ECMAScript leaves `Math.hypot`, `Math.sin`, `Math.cos` and `Math.atan2`
// IMPLEMENTATION-DEFINED: the spec only asks for an implementation-approximated
// result, so two engines (a Chrome host, a Firefox client) may legitimately
// return different bits for the same inputs. `Math.sqrt` is the exception —
// the spec pins it to IEEE-754, so it is bit-exact everywhere.
```

**Os 27 call sites, com linha exata** (medidos hoje; `constants.ts:4` é comentário e **não** é call
site):

| Arquivo | Linhas |
|---------|--------|
| `src/sim/arena.ts` | `:109` (`cos` + `sin` na mesma linha) |
| `src/sim/boss.ts` | `:116` (`cos` + `sin` na mesma linha) |
| `src/sim/combat.ts` | `:62`, `:63`, `:85`, `:86` (`cos`/`sin`), `:96`, `:110` (`atan2`) |
| `src/sim/enemies.ts` | `:156`, `:157`, `:170`, `:171`, `:304` (`atan2`), `:307`, `:308`, `:385`, `:386`, `:387`, `:388` |
| `src/sim/loot.ts` | `:153`, `:154` |
| `src/sim/run.ts` | `:239`, `:240` |
| `src/sim/special.ts` | `:73`, `:74` |

**Forma típica de um call site** (`src/sim/arena.ts:105-111`) — mostra que a troca é literalmente de
import, sem mudança de expressão:

```typescript
    for (let i = 0; i < n; i++) {
      const a = world.rng.next() * Math.PI * 2;
      world.coins.push({
        x: o.x, y: o.y,
        vx: Math.cos(a) * 2, vy: Math.sin(a) * 2,
        dead: false, bob: world.rng.next() * 6,
      });
    }
```

**Cuidado de domínio** — `src/sim/combat.ts:96-99` é o único lugar onde o valor de `atan2` alimenta
um laço de normalização de ângulo. Trocar o domínio de `aim` mudaria a contagem de iterações e,
portanto, os bits:

```typescript
      let diff = Math.atan2(o.y - p.y, o.x - p.x) - angle;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      if (Math.abs(diff) <= arc / 2) damageCrate(world, o, w.damage[1]);
```

---

### `packages/sim/src/serialize.ts` (module puro, serialização)

**Analog:** `tests/helpers.ts:33-62`. Não é "parecido": **é o código a promover**. Copiar verbatim,
mudando só o caminho e acrescentando `saveWorld`/`loadWorld`.

```typescript
/**
 * A stable fingerprint of everything the simulation owns. Excludes `events`
 * (drained every tick by app/) and `config` (the run's constant input — seed,
 * mode, class, name, forge levels — never changes across ticks, so including
 * it can only mask or fake a divergence, never reveal one). Includes the rng
 * cursor, so a divergence in random draws shows up even when no entity moved
 * yet.
 */
export function hashWorld(world: World): string {
  const snapshot = JSON.stringify(world, (key, value) => {
    if (key === 'events') return undefined;
    if (key === 'config') return undefined;
    if (key === 'rng') return (value as { save(): number }).save();
    // JSON.stringify collapses NaN, Infinity and -Infinity all to `null`, so
    // an unfiltered replacer gives the same fingerprint to a healthy world
    // and to one that has diverged into NaN — the exact opposite of what a
    // determinism guard is for. Tag them apart instead.
    if (typeof value === 'number' && !Number.isFinite(value)) {
      return Number.isNaN(value) ? 'NaN' : value > 0 ? 'Inf' : '-Inf';
    }
    return value;
  });
  // FNV-1a, 32-bit
  let h = 0x811c9dc5;
  for (let i = 0; i < snapshot.length; i++) {
    h ^= snapshot.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16);
}
```

**A metade que `loadWorld` precisa** (`src/sim/rng.ts:56-62`) — o `Rng` é a **única** instância de
classe no `World` (`src/sim/types.ts:249`: `rng: Rng;`), então é o único revive necessário:

```typescript
  save(): number {
    return this.s;
  }

  restore(s: number): void {
    this.s = s >>> 0;
  }
```

**Contrato que difere do análogo:** `hashWorld` exclui `config`; `saveWorld` **não pode** excluir —
são contratos diferentes. O planejador precisa dizer isso explicitamente, senão o desenvolvedor copia
o replacer inteiro e quebra o round-trip.

**Onde `objectives` entra** — `src/sim/world.ts:6-52` é o único lugar onde um campo novo do `World`
nasce, e a doutrina "sempre presente, mesma forma" já está no projeto:

```typescript
export function createWorld(config: RunConfig): World {
  return {
    tick: 0,
    phase: 'playing',
    rng: new Rng(config.seed),
    // Play bounds come from WORLD, never from a canvas (T6).
    play: {
      left: TILE,
      right: WORLD.w - TILE,
      top: TILE * 2,
      bottom: WORLD.h - TILE * 2,
    },
```

O campo morto a remover no mesmo commit é `nextWaveDelay: 3000,` (`src/sim/world.ts:37`, tipo em
`src/sim/types.ts:270`).

---

### `packages/sim/src/step.ts` (MOD — ordem canônica, D-13)

**Analog:** ele mesmo. O bloco a substituir é `src/sim/step.ts:21-24`:

```typescript
  for (const id of Object.keys(world.players)) {
    const input = inputs[id];
    if (input) updatePlayer(world, world.players[id], input);
  }
```

**Contexto que não pode mudar** (`src/sim/step.ts:1-5`) — a ordem das etapas é o contrato:

```typescript
// step.ts — one simulation tick. Everything the world does happens here,
// in this order. Later tasks add stages; the order is the contract — it
// comes from ORIG/combat.js:3-20, and reordering it changes behavior (e.g.
// a bullet that kills in the same tick an enemy moves resolves differently
// depending on which runs first).
```

**O tipo a estender** (`src/sim/types.ts:224-235`) — `RunConfig` hoje é single-player e é o único
canal de entrada do mundo externo; `players` (array em ordem canônica) é acréscimo natural:

```typescript
/** Everything the sim needs from the outside, decided once per run. */
export type RunConfig = {
  seed: number;
  mode: GameMode;
  classKey: ClassKey;
  playerName: string;
  /** Forge levels, read from Save by app/ — sim never touches localStorage. */
  forge: {
    vigor: number; honed: number; fleet: number;
    startgold: number; merchant: number; wise: number; golden: number;
  };
};
```

E `players` continua `Record` (D-13), como já declarado em `src/sim/types.ts:254`:
`players: Record<string, Player>;`.

**Construção do `RunConfig` fica em `app/`** — `src/app/forge.ts:18-40` é o analog exato para a
versão por jogador, e o comentário de `:20-22` documenta a única não-determinística permitida:

```typescript
export function buildRunConfig(classKey: ClassKey, mode: GameMode, playerName: string): RunConfig {
  return {
    // The seed is the one place a run is allowed to be non-deterministic.
    // In Marco 1 the host picks it and sends it to every client.
    seed: (Math.random() * 0xffffffff) >>> 0,
```

---

### `packages/sim/src/xp.ts` (MOD — corte do SCC)

**Analog:** ele mesmo. A função a esvaziar é `src/sim/xp.ts:107-114`; as duas arestas a cortar são
`openShop` e `victory`, e **as duas** precisam sair (RESEARCH § Pitfall 3):

```typescript
export function closeLevelUp(world: World, p: Player): void {
  setPhase(world, 'playing');
  // wave-end events that fired while choosing resume now
  const after = world.pendingAfterLevelUp;
  world.pendingAfterLevelUp = null;
  if (after === 'shop') openShop(world, p);
  if (after === 'victory') victory(world);
}
```

**Convenção de documentar desvio deliberado** (`src/sim/xp.ts:1-20`) — este arquivo é o melhor
exemplo do padrão "cabeçalho lista cada desvio do original com o porquê". Qualquer mudança de
comportamento nesta fase deve entrar assim, no cabeçalho do arquivo:

```typescript
// xp.ts — leveling and the level-up blessing pick.
// Ported from ORIG/entities.js:68-86 (gainXp), :124-172 (maybeOpenLevelUp,
// rollLevelChoices, pickBlessing, closeLevelUp).
//
// Deliberate deviations from the original — see task-16-brief.md:
```

O mesmo padrão, mais denso, está em `src/sim/boss.ts:1-33` — e `:30-33` **nomeia o ciclo de imports**
que esta fase vai mexer.

---

### `src/app/stepper.ts` (NOVO — driver, event-driven)

**Analog:** `src/app/loop.ts:15-44`. É extração literal: o acumulador e o `MAX_CATCHUP` saem, o `rAF`
e o `performance.now()` ficam.

```typescript
/** Starts the loop; the returned function stops it. */
export function startLoop(world: World, hooks: LoopHooks): () => void {
  let last = performance.now();
  let acc = 0;
  let raf = 0;
  let running = true;

  // A long stall (tab in the background) must not trigger a spiral of death.
  const MAX_CATCHUP = DT_MS * 5;

  const frame = (now: number) => {
    if (!running) return;
    acc += Math.min(now - last, MAX_CATCHUP);
    last = now;

    while (acc >= DT_MS) {
      step(world, hooks.collectInputs(world.tick));
      hooks.afterStep(world);
      acc -= DT_MS;
    }

    hooks.render(world, acc / DT_MS);
    raf = requestAnimationFrame(frame);
  };
```

**A fronteira de hooks já existe** (`src/app/loop.ts:8-12`) — copiar o tipo, não inventar outro:

```typescript
export type LoopHooks = {
  collectInputs(tick: number): Record<string, InputState>;
  afterStep(world: World): void;
  render(world: World, alpha: number): void;
};
```

**Quem já passa esses hooks** (`src/main.ts:99-105`) — é o call site que o stepper não pode quebrar:

```typescript
function startSimLoop(): void {
  stopSimLoop = startLoop(world, {
    collectInputs: tick => input.collect(tick),
    afterStep: w => { sink(drainEvents(w)); fx.update(DT_MS); },
    render: frame,
  });
}
```

**Os 6 `'p1'` literais de `main.ts`** (conferidos): `:76`, `:77`, `:123`, `:127`, `:150`, `:154`.
Trocar por `LOCAL_SLOT` muda o hash — tem de ir no mesmo commit do re-baseline.

---

### `src/app/input.ts` (MOD — quantização, D-02/D-03)

**Analog:** ele mesmo. O ponto único de entrada é `collect()`, `src/app/input.ts:102-128`:

```typescript
    collect(tick: number): Record<string, InputState> {
      const p = world.players[localId];
      if (!p) return {};
      let x = 0, y = 0;
      if (keys['KeyW'] || keys['ArrowUp']) y -= 1;
      if (keys['KeyS'] || keys['ArrowDown']) y += 1;
      if (keys['KeyA'] || keys['ArrowLeft']) x -= 1;
      if (keys['KeyD'] || keys['ArrowRight']) x += 1;
      if (x !== 0 || y !== 0) {
        const len = Math.hypot(x, y);
        x /= len; y /= len;
      } else if (Math.hypot(touch.vec.x, touch.vec.y) > TOUCH_DEADZONE) {
        // no key pressed: fall back to the joystick, keeping its partial
        // magnitude (an analog stick, unlike WASD, isn't always full-speed).
        x = touch.vec.x; y = touch.vec.y;
      }
      const input: InputState = {
        tick,
        move: { x, y },
        aim: aimAngle(),
        attack: mouseDown || !!keys['Space'] || !!keys['KeyZ'] || (touch.active && world.enemies.some(e => !e.dead)),
        special: specialQueued,
        sprint: !!(keys['ShiftLeft'] || keys['ShiftRight']),
      };
      specialQueued = false; // edge-triggered: one cast per press
      return { [localId]: input };
    },
```

Os `Math.hypot` de `:111` e `:113` e o `Math.atan2` de `:79`/`:82` **ficam** (D-05). A quantização
entra entre a montagem de `x,y,aim` e a construção do objeto `input`.

**O tipo consumido** (`src/sim/types.ts:237-243`) — `aim` continua `number` em radianos:

```typescript
export type InputState = {
  tick: number;
  move: { x: number; y: number };  // each component in [-1, 1], already normalized
  aim: number;                     // radians
  attack: boolean;
  special: boolean;
  sprint: boolean;
};
```

---

### `src/app/ledger.ts` (NOVO — store persistente, append)

**Analog:** `src/app/save.ts:56-129`. É o único módulo de persistência do projeto e estabelece:
chave versionada em `const KEY`, módulo-IIFE com `export const`, `persist()`/`load()` com
`try/catch` silencioso, e getter `get data()`.

```typescript
export const Save = (() => {
  const KEY = 'dungeonguys2_save_v1';

  const defaults = (): SaveData => ({
```

```typescript
  function persist(): void {
    try { localStorage.setItem(KEY, JSON.stringify(data)); } catch { /* storage unavailable */ }
  }

  function load(): void {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<SaveData>;
        data = defaults();
        Object.assign(data.settings, parsed.settings);
        Object.assign(data.progress, parsed.progress);
        data.records = parsed.records || {};
      }
    } catch { data = defaults(); }
  }
```

```typescript
  load();
  return {
    get data() { return data; },
    persist, recordRun, classRecord, isUnlocked, unlock,
  };
})();
```

**O precedente exato de "descartar em vez de migrar"** (D-26) já está escrito no cabeçalho deste
arquivo, `src/app/save.ts:6-11` — o ADR deve citá-lo:

```typescript
// Key change (resolution, task-20-brief.md): the key becomes
// `dungeonguys2_save_v1`, not `dungeonguys_save_v1`. Both games are served
// from the same `github.io` origin and would otherwise share one
// `localStorage`, letting one game's progress overwrite the other's. The
// original's legacy `dg_*` key migration is dropped entirely — there is no
// legacy save under this key.
```

**O campo a abandonar** é `soulGold: 0,` em `src/app/save.ts:65` (dentro de `defaults()`) e
`soulGold: number;` em `:40`.

---

### `packages/protocol/src/enums.ts` (NOVO — tabela congelada)

**Analog:** `src/sim/defs/mutators.ts` (12 linhas) — o menor e mais limpo exemplo de "módulo que é só
uma tabela literal, tipada, com header explicando a origem":

```typescript
// mutators.ts — MUTATORS, ported verbatim from ORIG/ui.js:116-122.
// Rotating modifiers on non-boss waves.

import type { MutatorKey } from '../types';

export const MUTATORS: Record<MutatorKey, { name: string; desc: string }> = {
  swarm:  { name: 'SWARM',      desc: 'MORE BUT WEAKER FOES' },
  frenzy: { name: 'FRENZY',     desc: 'FASTER ENEMIES' },
  bounty: { name: 'BOUNTY',     desc: 'DOUBLE GOLD' },
  elite:  { name: 'ELITE HUNT', desc: 'MANY CHAMPIONS' },
  fog:    { name: 'FOG',        desc: 'LIMITED VISION' },
};
```

**União de string literal como fonte do tipo** (`src/sim/types.ts:6-12`) — o projeto já usa exatamente
isso, e é o que o enum congelado do protocolo deve espelhar:

```typescript
export type ClassKey = 'mage' | 'archer' | 'warrior' | 'ninja' | 'priestess' | 'witch' | 'coprobo';
export type AttackKind = 'melee' | 'bolt' | 'arrow' | 'bullet' | 'fireball';
export type DamageKind = 'melee' | 'arrow' | 'bullet' | 'bolt' | 'fireball';
export type Archetype = 'melee' | 'ranged' | 'elemental';
export type MutatorKey = 'swarm' | 'frenzy' | 'bounty' | 'elite' | 'fog';
export type Phase = 'playing' | 'levelup' | 'shop' | 'gameover' | 'victory';
export type GameMode = 'campaign' | 'endless';
```

Diferença que o planejador deve mandar aplicar: no protocolo o **array `as const`** é a fonte
(ordem = formato de fio) e o tipo deriva dele, não o contrário.

---

### `tests/scc.test.ts`, `tests/protocol-vocabulary.test.ts`, `tests/identity.test.ts` (meta-testes)

**Analog:** `tests/purity.test.ts`. É o único meta-teste do repositório — o que lê os **fontes** e
assere um invariante. As três peças reutilizáveis:

**1. Carregar os fontes sem `node:fs`** (`tests/purity.test.ts:17-20`) — importante porque
`tsconfig.json:14` fixa `"types": ["vite/client"]`:

```typescript
// Vite's raw glob, not node:fs — tsconfig's `types` is ["vite/client"] only.
const FILES = import.meta.glob<string>('../src/sim/**/*.ts', {
  query: '?raw', import: 'default', eager: true,
});
```

**2. O `scan()` que tira comentários e strings** (`tests/purity.test.ts:22-45`) — é exatamente o que
FORM-12 (`/\bhost\b/i` fora de comentário) precisa, sem escrever nada novo:

```typescript
/**
 * Removes comments; also blanks string/template literal bodies when
 * `keepStrings` is false. Strings are consumed atomically either way, so a
 * "//" inside a literal is never mistaken for a comment. sim/ contains no
 * regex literals (checked), so the ambiguous `/` case does not arise.
 */
function scan(src: string, keepStrings: boolean): string {
  let out = '', i = 0;
  while (i < src.length) {
    const two = src.slice(i, i + 2);
    if (two === '//') { while (i < src.length && src[i] !== '\n') i++; continue; }
    if (two === '/*') { const end = src.indexOf('*/', i + 2); i = end < 0 ? src.length : end + 2; continue; }
    const c = src[i];
    if (c === '"' || c === "'" || c === '`') {
      const start = i++;
      while (i < src.length && src[i] !== c) { if (src[i] === '\\') i++; i++; }
      i++;
      out += keepStrings ? src.slice(start, i) : '""';
      continue;
    }
    out += c; i++;
  }
  return out;
}
```

**3. Extração de imports** (`tests/purity.test.ts:55-58`) — é o grafo que `tests/scc.test.ts` precisa
para rodar Tarjan; o regex já existe:

```typescript
/** Any import/export-from whose specifier mentions render/, ui/ or app/ —
 *  bare directory (`'../render'`) included. */
const LAYER_IMPORT = /\b(?:from|import)\s*\(?\s*['"]([^'"]+)['"]/g;
const FORBIDDEN_LAYER = /(^|[/\\])(render|ui|app)([/\\]|$)/;
```

> Atenção para `tests/scc.test.ts`: o grafo de RESEARCH é de **imports de valor**, excluindo
> `import type`. O `LAYER_IMPORT` acima casa os dois — o planejador precisa especificar o filtro
> adicional de `import type`, senão o SCC medido não bate com o da pesquisa.

**4. Forma de asserção "lista de infratores vazia"** (`tests/purity.test.ts:65-75`) — dá mensagem de
falha que nomeia o arquivo, que é o que um meta-teste precisa:

```typescript
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

**A asserção a apertar** (`tests/purity.test.ts:61-63`) — hoje é frouxa e D-16 pede que vire exata,
mais a de `dependencies: {}`:

```typescript
  it('encontrou os arquivos de sim/', () => {
    expect(Object.keys(FILES).length).toBeGreaterThanOrEqual(15);
  });
```

---

### `tests/math-oracle.test.ts`, `tests/input-codec.test.ts`, `tests/ulid.test.ts` (unit, módulo folha)

**Analog:** `tests/rng.test.ts` (76 linhas). É o teste de módulo determinístico e puro do projeto:
import direto, `describe` com o nome do módulo, `it` em português, e a asserção final de
`save`/`restore` que é o mesmo formato do "round-trip idempotente" que o codec precisa.

```typescript
import { describe, it, expect } from 'vitest';
import { Rng } from '../src/sim/rng';

describe('Rng', () => {
  it('produz a mesma sequência para a mesma seed', () => {
    const a = new Rng(12345);
    const b = new Rng(12345);
    const seqA = Array.from({ length: 100 }, () => a.next());
    const seqB = Array.from({ length: 100 }, () => b.next());
    expect(seqA).toEqual(seqB);
  });
```

```typescript
  it('save/restore retoma exatamente a mesma sequência', () => {
    const r = new Rng(2024);
    for (let i = 0; i < 50; i++) r.next();
    const snapshot = r.save();
    const expected = Array.from({ length: 20 }, () => r.next());
    r.restore(snapshot);
    const actual = Array.from({ length: 20 }, () => r.next());
    expect(actual).toEqual(expected);
  });
```

**Padrão de corpus determinístico** (`tests/rng.test.ts:19-26,28-36`): laço de 1.000/2.000 amostras
sobre um `Rng` semeado, nunca `Math.random`. É exatamente o que o corpus do oráculo fdlibm deve usar.

> **Divergência obrigatória do análogo:** `tests/combat.test.ts:40` usa `toBeCloseTo`. Isso é
> legítimo lá e **proibido** nos testes desta fase (RESEARCH § Anti-Patterns). O planejador deve
> escrever isso no plano, porque copiar o estilo do vizinho é o erro natural.

---

### `tests/canonical-order.test.ts`, `tests/serialize.test.ts`, `tests/cross-engine.test.ts`

**Analog:** `tests/determinism.test.ts` (77 linhas) + `tests/helpers.ts:5-31`.

**Roteiro de inputs** (`tests/determinism.test.ts:7-19`) — o molde do log de ouro. Nota: ele usa
`Math.sin`/`Math.cos` para *gerar* o roteiro, o que é aceitável dentro de um processo, mas **não** no
teste cross-engine — lá o roteiro tem de vir do JSON de ouro:

```typescript
// A scripted input sequence: moves, attacks and specials at fixed ticks.
function scripted(tick: number): Record<string, InputState> {
  return {
    p1: {
      tick,
      move: { x: Math.sin(tick / 17), y: Math.cos(tick / 23) },
      aim: (tick % 360) * (Math.PI / 180),
      attack: tick % 7 === 0,
      special: tick % 211 === 0,
      sprint: tick % 90 < 30,
    },
  };
}
```

**Forma "duas execuções, um hash"** (`tests/determinism.test.ts:22-32`) — é literalmente a forma do
teste de ordem canônica, trocando `makeTestWorld()` duplicado por ordem de criação embaralhada:

```typescript
  it('duas instâncias com a mesma seed e os mesmos inputs convergem', () => {
    const a = makeTestWorld();
    const b = makeTestWorld();
    generateArena(a);
    generateArena(b);
    createPlayer(a, 'p1', 'mage', 'T');
    createPlayer(b, 'p1', 'mage', 'T');
    runTicks(a, 600, scripted);
    runTicks(b, 600, scripted);
    expect(hashWorld(a)).toBe(hashWorld(b));
  });
```

**Teste de que o hash distingue estados patológicos** (`tests/determinism.test.ts:57-66`) — o molde
para o caso sintético de `-0` que `tests/serialize.test.ts` precisa (RESEARCH § Pitfall 5):

```typescript
  it('hashWorld distingue NaN, Infinity e -Infinity entre si e de um número', () => {
    const mk = (hp: number) => {
      const w = makeTestWorld();
      createPlayer(w, 'p1', 'mage', 'T');
      w.players.p1.hp = hp;
      return hashWorld(w);
    };
    const hashes = [mk(NaN), mk(Infinity), mk(-Infinity), mk(0)];
    expect(new Set(hashes).size).toBe(4);
  });
```

**Fixture e driver de ticks** (`tests/helpers.ts:5-31`) — o `BASE_CONFIG` é o que vira o `config` do
JSON de ouro, e `runTicks` é o que `createStepper(...).runTicks` substitui:

```typescript
export const BASE_CONFIG: RunConfig = {
  seed: 20260827,
  mode: 'campaign',
  classKey: 'mage',
  playerName: 'TEST',
  forge: { vigor: 0, honed: 0, fleet: 0, startgold: 0, merchant: 0, wise: 0, golden: 0 },
};
```

```typescript
/** Advances the world n ticks. `inputs` may vary per tick via a callback. */
export function runTicks(
  world: World,
  n: number,
  inputs: (tick: number) => Record<string, InputState> = t => ({ p1: noInput(t) }),
): void {
  for (let i = 0; i < n; i++) {
    step(world, inputs(world.tick));
    world.events.length = 0; // events are presentation; not part of sim state
  }
}
```

---

### `tests/boss.test.ts` (MOD — estender com 10 casos diretos)

**Analog para os helpers de montagem:** `tests/combat.test.ts:9-19` — o padrão de "monta o mundo e a
entidade à mão, chama a função direto":

```typescript
function setup(cls: Player['cls'] = 'mage'): { w: World; p: Player } {
  const w = makeTestWorld();
  const p = createPlayer(w, 'p1', cls, 'T');
  return { w, p };
}

function enemyAt(w: World, x: number, y: number): Enemy {
  const e = makeEnemy(w, 'skeleton', x, y);
  w.enemies.push(e);
  return e;
}
```

**O que existe hoje e NÃO pode ser substituído** — `tests/boss.test.ts:48-66` exercita
`updateBossPattern` só indiretamente, via `updateEnemies`, e assere `enemies.length`. Estes dois
testes ficam; os 10 casos diretos são **acréscimo**:

```typescript
describe('padrão de chefe', () => {
  it('o chefe invoca lacaios ao longo do tempo', () => {
    const w = makeTestWorld();
    createPlayer(w, 'p1', 'mage', 'T');
    spawnBoss(w, 'zombie_king', 0, 1);
    for (let i = 0; i < 600; i++) updateEnemies(w);
    expect(w.enemies.length).toBeGreaterThan(1);
  });
```

**A superfície a cobrir** — `src/sim/boss.ts:58` é a assinatura a chamar direto, e `:109-123` é o ramo
`ring` que hoje nunca executa em teste algum e que o `sim/math.ts` vai perturbar:

```typescript
export function updateBossPattern(world: World, e: Enemy, dx: number, dy: number, dist: number): boolean {
  if (!e.abilities) return false;
```

```typescript
  if (e.abilities.ring && e.cd.ring >= e.abilities.ring * cdMult && dist < 420) {
    e.cd.ring = 0;
    const n = e.enraged ? 16 : 12;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      world.enemyBullets.push({
        x: e.x, y: e.y,
        vx: Math.cos(a) * 3.8, vy: Math.sin(a) * 3.8,
        dmg: 12, dist: 0, dead: false,
      });
    }
```

**Os números que os testes vão asserir** vêm de `src/sim/defs/enemies.ts:20-32` — `zombie_king` só
tem `charge`, `ogre_warlord` tem `charge` **e** `ring`:

```typescript
  zombie_king:  { hp: 1500, speed: 0.8,  w: 76, h: 92, score: 500,  gold: 25, anim: 'big_zombie', potion: 1, dmg: 16,
                  boss: 'ZOMBIE KING',  scale: 3, summons: ['skeleton', 'goblin'],
                  abilities: { charge: 6500 } },
  ogre_warlord: { hp: 3200, speed: 0.9,  w: 76, h: 92, score: 1500, gold: 50, anim: 'ogre',       potion: 1, dmg: 22,
                  boss: 'OGRE WARLORD', scale: 3, summons: ['demon', 'brute'],
                  abilities: { charge: 8000, ring: 7000 } },
```

---

### `tests/protocol-enums.test.ts` (snapshot de tabela congelada)

**Analog:** `tests/defs.test.ts:1-43` — o teste que assere forma e cardinalidade de tabelas de dados:

```typescript
import { describe, it, expect } from 'vitest';
import { CLASS_DEFS, CLASS_KEYS } from '../src/sim/defs/classes';
import { ENEMY_DEFS, ELITE_TYPES, MINIBOSS_WAVES } from '../src/sim/defs/enemies';
```

```typescript
describe('defs de classes', () => {
  it('tem as 7 classes, cada uma com 3 tiers', () => {
    expect(CLASS_KEYS).toHaveLength(7);
    for (const k of CLASS_KEYS) {
      expect(CLASS_DEFS[k]).toBeDefined();
      expect(CLASS_DEFS[k].tiers).toHaveLength(3);
    }
  });
```

Diferença obrigatória: o teste de FORM-11 compara contra um **arquivo de ouro versionado**, não
contra um número inline — inserir no meio precisa falhar, acrescentar no fim precisa passar depois de
atualizar o ouro no mesmo PR.

---

### `tests/stepper.test.ts`, `tests/ledger.test.ts` (teste de módulo fora de `sim/`)

**Analog:** `tests/camera.test.ts` (47 linhas). **Importante:** nenhum teste do repositório importa de
`src/app/` hoje (conferido: `grep -rln "src/app/" tests/` não retorna nada). O único precedente de
testar um módulo **não-sim** em Node é este, sobre `src/render/camera.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { createCamera, updateCamera, worldToScreen, isVisible } from '../src/render/camera';
import { WORLD } from '../src/sim/constants';

describe('câmera', () => {
  it('centra no alvo quando ele está longe das bordas', () => {
    const cam = createCamera();
    updateCamera(cam, { x: 1200, y: 800 }, 800, 600);
    expect(cam.x).toBe(1200 - 400);
    expect(cam.y).toBe(800 - 300);
  });
```

Lição prática para o planejador: `camera.ts` é testável porque **não toca DOM** — recebe `w`/`h` como
argumento. `stepper.ts` precisa nascer com a mesma propriedade (recebe `elapsedMs`, não lê relógio), e
`ledger.ts` precisa separar a lógica pura (`balance`, compactação) do acesso a `localStorage`, senão
não há como testá-lo neste setup.

---

### Configuração

**`vitest.config.ts` / `vitest.browser.config.ts`** — analog: `vite.config.ts` (7 linhas, o arquivo
inteiro). Convenção: ESM, `defineConfig`, comentário de uma linha explicando o porquê:

```typescript
import { defineConfig } from 'vite';

// GitHub Pages serves the repo under /DungeonGuys2/
export default defineConfig({
  base: '/DungeonGuys2/',
  build: { target: 'es2022', outDir: 'dist' },
});
```

**`packages/sim/tsconfig.json`** — analog: `tsconfig.json` da raiz (o arquivo inteiro). D-16 muda
`"lib"` (tira `DOM`) e `"types"` (esvazia); tudo o mais é herança direta:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "lib": ["ES2022", "DOM"],
    "strict": true,
    "noUncheckedIndexedAccess": false,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noEmit": true,
    "isolatedModules": true,
    "skipLibCheck": true,
    "types": ["vite/client"]
  },
  "include": ["src", "tests", "vite.config.ts", "eslint.config.js"]
}
```

> Cuidado: `"types": ["vite/client"]` é o que faz `import.meta.glob` compilar em
> `tests/purity.test.ts`. Se o tsconfig da raiz mudar, os meta-testes quebram.

**`packages/sim/package.json` / `packages/protocol/package.json`** — analog: `package.json` da raiz.
`"type": "module"`, `"private": true`, e o invariante `"dependencies": {}`:

```json
{
  "name": "dungeonguys2",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc --noEmit && vite build",
    "preview": "vite preview",
    "test": "vitest run",
    "test:watch": "vitest",
    "lint": "eslint ."
  },
  "dependencies": {},
  "devDependencies": {
    "typescript": "^5.6.3",
    "typescript-eslint": "^8.8.1",
    "eslint": "^9.12.0",
    "vite": "^5.4.9",
    "vitest": "^2.1.3"
  }
}
```

**`.github/workflows/ci.yml`** — analog: `.github/workflows/deploy.yml` (42 linhas), o **único**
workflow existente. Copiar o esqueleto de job, trocar `node-version: 20` por `24`, e acrescentar o
cache de navegadores do Playwright. **Não tocar no `deploy.yml`** (é a fase 2 que o mata):

```yaml
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm
      - run: npm ci
      - run: npm run lint
      - run: npm test
      - run: npm run build
```

---

## Shared Patterns

### Estilo de import (aplicar a TODOS os arquivos)

**Fonte:** repositório inteiro, verificado em 191 linhas de import.
**Aplica a:** todos os arquivos novos e às 108 linhas reescritas pela extração.

- Relativo, **sem extensão**, aspas simples: `from './constants'`, `from '../sim/types'`
- `import type { ... }` para tipos, sempre separado do import de valor
- Imports de valor primeiro, `import type` por último no bloco
- **Não existe barrel** em `src/sim` — cada consumidor importa do módulo específico

```typescript
import { updatePlayer } from './player';
import { updateBullets } from './bullets';
import { updateEnemies, updateEnemyBullets } from './enemies';
import { updatePotions, updateChests, updateCoins } from './loot';
import { updateSpawnQueue, checkWaveComplete } from './run';
import { DT_MS } from './constants';
import type { InputState, SimEvent, World } from './types';
```

(`src/sim/step.ts:6-12`)

E do lado de fora, a forma que as 108 linhas têm hoje:

```typescript
import { DT_MS } from '../sim/constants';
import { step } from '../sim/step';
import type { InputState, World } from '../sim/types';
```

(`src/app/loop.ts:4-6`) — e nos testes, `from '../src/sim/world'` (`tests/helpers.ts:1-3`).

**Consequência para o plano:** a extração troca `'../sim/X'` e `'./sim/X'` por um especificador de
pacote. Se o pacote expuser um barrel (`@dg2/sim`), as 108 linhas colapsam em menos linhas e o diff
muda de forma; se expuser subpaths (`@dg2/sim/constants`), o diff é 1:1. **O planejador precisa
escolher e escrever qual**, porque as duas produzem planos de execução diferentes. O código de
exemplo de RESEARCH usa as duas formas (`from '@dg2/sim'` e `from '@dg2/sim/math'`) — a ambiguidade
tem de morrer no plano.

### Pureza de `sim/` — a regra a estender, não redesenhar

**Fonte:** `eslint.config.js:6-35`
**Aplica a:** `packages/sim/**` (o `files:` glob muda de caminho) e ao acréscimo de
`sin`/`cos`/`atan2`/`tan`/`pow`/`exp`/`log`/`hypot`.

```javascript
    // sim/ must stay pure: no I/O, no DOM, no wall-clock, no unseeded randomness.
    files: ['src/sim/**/*.ts'],
    rules: {
      'no-restricted-globals': ['error',
        { name: 'window',                 message: 'sim/ is pure — see plan T1-T6' },
        { name: 'document',               message: 'sim/ is pure — emit an event instead (T5)' },
```

```javascript
      'no-restricted-properties': ['error',
        { object: 'Math', property: 'random', message: 'use world.rng (T3)' },
        { object: 'Date', property: 'now',    message: 'use world.tick (T4)' },
      ],
```

Convenção da mensagem: `message` sempre diz **o que usar em vez** e cita a origem da regra. As
mensagens novas devem citar `sim/math.ts` e a decisão D-01.

O comentário de `eslint.config.js:24-27` documenta por que existem duas formas de padrão em
`no-restricted-imports` e por que o teste duplica a regra — é o precedente de "lint e teste cobrem
buracos diferentes", que é exatamente a arquitetura de três guardas de D-16:

```javascript
      // The patterns are gitignore-style: '**/render/**' requires a segment
      // AFTER 'render/', so a bare-directory import (`from '../render'`)
      // slips past it. The '**/render' forms close that hole.
      // tests/purity.test.ts asserts the same rule independently.
```

### Comentário de cabeçalho de módulo

**Fonte:** todos os arquivos de `src/sim/` e `src/app/`
**Aplica a:** todo arquivo novo

Formato: `// nome.ts — o que é, em uma frase.` seguido de (quando aplicável) a origem
(`Ported from ORIG/...`) e um bloco `// Deliberate deviations ... :` com bullet por desvio. Em
inglês. Exemplos densos: `src/sim/boss.ts:1-33`, `src/sim/xp.ts:1-20`, `src/app/save.ts:1-11`,
`tests/purity.test.ts:1-14`.

Para os arquivos desta fase, o "ORIG" equivalente é a decisão do CONTEXT.md. O padrão a copiar é
`src/sim/constants.ts:46-55`, onde uma constante carrega a medição que a justifica:

```typescript
/**
 * px radius auto-collect. The original's value is 80 (ORIG/config.js:4);
 * this is the one number Task 21 raised. Measured with the same scripted
 * bot on both games, "coins still on the floor when the wave ends" over
 * waves 1-5: the original loses 23.98% +/- 1.52 (22 runs read out of the
 * running original), this port at 80 loses 28.51% +/- 0.27 (800 seeds,
 * headless). At 100 the port loses 24.66% — back on the original's number.
 * See docs/PARIDADE.md for the full response curve and the caveat about
 * the original's frame-rate dependence.
 */
export const COIN_MAGNET = 100;
```

### Eventos como única saída do sim

**Fonte:** `src/sim/world.ts:54-64`, `src/sim/step.ts:35-40`
**Aplica a:** qualquer código novo dentro de `packages/sim` — e é a regra da qual FORM-08
(`world.objectives`) é a **exceção deliberada**.

```typescript
/** The only way sim/ talks to the outside world (T5). */
export function emit(world: World, event: SimEvent): void {
  world.events.push(event);
}
```

```typescript
/** Hands the tick's events to app/ and clears them. */
export function drainEvents(world: World): SimEvent[] {
  const out = world.events;
  world.events = [];
  return out;
}
```

O ADR de FORM-08 tem de citar estas 10 linhas e explicar por que objetivos de missão **não** passam
por aqui.

### Nomenclatura de teste

**Fonte:** os 21 arquivos de teste
**Aplica a:** todos os testes novos

- `describe` nomeia o módulo ou a capacidade, em português minúsculo: `'pureza de src/sim'`,
  `'determinismo da simulação'`, `'padrão de chefe'`, `'câmera'`
- `it` é uma frase declarativa em português, no presente: `'save/restore retoma exatamente a mesma
  sequência'`
- Import fixo de `vitest` na linha 1: `import { describe, it, expect } from 'vitest';`
- Sem `beforeEach` em nenhum arquivo do repositório — o estado nasce por helper (`makeTestWorld`,
  `setup`, `enemyAt`), o que é o que torna cada `it` independente

---

## No Analog Found

Arquivos sem correspondente próximo no repositório. O planejador deve **inventar a convenção
explicitamente no plano** e não deixar para o executor decidir.

| File | Role | Data Flow | Reason |
|------|------|-----------|--------|
| `tools/sim-version/emit.mjs` | script Node de build | file-I/O | **Não existe nenhum `.mjs`/`.cjs` no repositório** (`find` fora de `node_modules`/`dist`: zero). Nada roda em Node fora do Vitest. Não há convenção de shebang, de parsing de argumento, de código de saída nem de formato de mensagem de erro |
| `tools/sim-version/verify.mjs` | script Node | file-I/O | idem |
| `tools/golden/rebaseline.mjs` | script Node de manutenção | file-I/O | idem — e este ainda precisa de uma convenção de confirmação (`--confirm`) que não tem precedente |
| `tools/assets/validate.mjs` | validador de CI | file-I/O | idem — e é o único que terá dependência (`ajv`), o que exige uma regra escrita de por que ela não viola `dependencies: {}` |
| `tools/assets/schema/manifest.v1.json` | JSON Schema versionado | — | Não há schema de nenhum tipo no projeto. `public/manifest.json` é um manifesto de PWA, não um schema |
| `packages/sim/src/index.ts` | barrel / superfície pública | — | `src/sim` **não tem** `index.ts`. `src/render/index.ts` existe mas é um compositor de desenho (`export function render(...)`), não um re-export — não serve de molde |
| `packages/protocol/src/index.ts` | barrel | — | idem |
| `tests/golden/campaign-mage-3000.json` | dado de teste versionado | — | Não existe `tests/` com fixture em arquivo; todo dado de teste é literal inline. Nem `tests/golden/` nem qualquer `.json` sob `tests/` |

**O que o planejador precisa decidir para os `.mjs`** (nenhuma destas perguntas tem resposta no
repositório):

1. Extensão e formato: `.mjs` explícito (RESEARCH usa) ou `.js` valendo-se de `"type": "module"` do
   `package.json:5` — que é o que `eslint.config.js` já faz (ele é ESM com `import tseslint from
   'typescript-eslint';` numa extensão `.js`).
2. Como são invocados: script em `package.json` (`"scripts"` tem 6 entradas hoje, todas de uma linha)
   ou chamada direta no `ci.yml`.
3. Como reportam falha: RESEARCH propõe `console.error` + `process.exit(1)`. Não há precedente —
   escrever isso como regra.
4. Se entram no `tsconfig.json:16` `"include"` (hoje: `["src", "tests", "vite.config.ts",
   "eslint.config.js"]`) ou ficam fora da checagem de tipos.
5. Se o `eslint.config.js:4` `ignores` (`['dist', 'public', 'node_modules']`) precisa mudar para
   cobrir ou ignorar `tools/`.

**Para os ADRs (`docs/adr/NNNN-slug.md`)**, o análogo de **conteúdo** — não de arquivo — é
`docs/DECISOES-MARCO0.md`, que já estabeleceu o formato do projeto para registrar decisão:
*decisão — motivo — custo se errado*.

```
usar branch de feature em vez de worktree. — O repositório é novo, não contém código
algum e não há trabalho concorrente do qual isolar; o risco que o worktree mitiga não
existe aqui. — Custo se errado: baixo; se surgir trabalho paralelo, criar o worktree
depois é trivial.
```

O que não existe: um arquivo por decisão, numeração de quatro dígitos, índice. Isso é convenção nova.

---

## Notas de risco para o planejador

1. **A extração é tudo-ou-nada e a rede é a suíte.** 108 linhas de import em 36 arquivos mudam de uma
   vez; 244 testes em 21 arquivos são a única verificação. O plano deve tratar "suíte verde antes e
   depois, sem nenhuma outra mudança no mesmo commit" como critério da task de extração.
2. **Três "análogos" desta fase são o próprio arquivo sendo editado** (`step.ts`, `xp.ts`,
   `loop.ts`). Isso é bom: o risco não é de estilo, é de semântica. O plano precisa citar as linhas
   exatas (`step.ts:21-24`, `xp.ts:107-114`, `loop.ts:15-44`) na ação, não descrever a mudança em
   prosa.
3. **`tests/helpers.ts` perde `hashWorld` mas é importado por praticamente toda a suíte.** Manter um
   re-export a partir de `packages/sim` ou reescrever os imports é decisão do plano — e é a mesma
   ambiguidade barrel-vs-subpath da seção de imports.
4. **Nenhum teste toca `src/app/` hoje.** Quatro dos testes novos (`stepper`, `ledger`, `ulid`,
   `input-codec`) inauguram essa categoria. Se `stepper.ts` ou `ledger.ts` nascerem acoplados a
   `performance`/`localStorage`, não haverá como testá-los sem introduzir jsdom — que o projeto não
   tem. **Testabilidade é requisito de desenho aqui, não consequência.**
5. **`toBeCloseTo` existe na suíte** (`tests/combat.test.ts:40`) e é proibido nos testes desta fase.
   Escrever a proibição no plano.

---

## Metadata

**Analog search scope:** `src/sim/` (24 arquivos), `src/sim/defs/` (5), `src/app/` (6), `src/render/`
(5), `src/ui/` (7), `src/main.ts`, `tests/` (22), raiz (`package.json`, `tsconfig.json`,
`vite.config.ts`, `eslint.config.js`), `.github/workflows/`, `docs/`, `public/`
**Files scanned:** 78 arquivos listados; 26 lidos integralmente ou em trecho dirigido
**Measurements re-verified in this pass:** contagem de trigonometria (27 call sites em 7 arquivos),
imports cruzando `sim/` (108 em 36 arquivos), imports internos (83), ausência de `.mjs`/`.cjs`,
ausência de `tools/`, ausência de `docs/adr/`, ausência de `vitest.config.*`, ausência de
`src/sim/index.ts`, ausência de teste importando `src/app/`
**Pattern extraction date:** 2026-08-31
