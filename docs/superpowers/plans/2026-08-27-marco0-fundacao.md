# Marco 0 — Fundação: simulação pura — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Portar o DungeonGuys para TypeScript + Vite separando simulação pura de render/UI, com mundo de tamanho fixo, câmera, passo fixo, RNG semeado e eventos — entregando o single-player idêntico ao atual sobre uma base que aceita netcode.

**Architecture:** Quatro camadas. `sim/` contém o mundo e suas regras como funções puras sobre um objeto `World`, sem DOM, sem `window`, sem `Math.random` — roda igual no Node e no browser. `render/` desenha um `World` recebido de fora, com câmera e culling. `ui/` cuida do DOM. `app/` é a cola: loop com acumulador de passo fixo, input, áudio, save. A simulação nunca chama som nem DOM: ela empilha eventos em `world.events`, que `app/` drena.

**Tech Stack:** TypeScript 5.x, Vite 5.x, Vitest 2.x, ESLint 9 (flat config). Sem framework de UI — DOM direto, como hoje. Canvas 2D.

**Spec:** `docs/superpowers/specs/2026-08-27-coop-online-design.md`

## Global Constraints

- **Repositório de origem (somente leitura):** `C:\Users\Gustavo\Documents\Nova pasta\DungeonGuys` — referido daqui em diante como `ORIG/`. Nunca modificar nada lá.
- **Repositório de destino:** `C:\Users\Gustavo\Documents\Nova pasta\DungeonGuys2`. Todos os caminhos deste plano são relativos a ele.
- **`sim/` é puro.** Nenhum arquivo sob `src/sim/` pode importar de `src/render/`, `src/ui/` ou `src/app/`, nem referenciar `document`, `window`, `navigator`, `localStorage`, `performance`, `Date`, `Math.random`, `requestAnimationFrame` ou `setTimeout`. Isso é imposto por lint (Task 1) e por teste (Task 4).
- **Passo fixo:** `DT_MS = 1000 / 60` (16.666…ms). `TICK_FACTOR = DT_MS / 16.67` — o código original multiplica velocidades por `dt / 16.67`; manter esse divisor preserva o tuning exato.
- **Tamanho do mundo:** `WORLD = { w: 2400, h: 1600 }` em unidades lógicas. `TILE = 32`.
- **Comentários de código em inglês.** Documentos e mensagens de commit em português.
- **Branch:** `feature/marco0-fundacao`. Commit a cada task, com `Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>` na última linha.
- **Sem dependências de runtime.** O jogo publicado não pode carregar biblioteca alguma; tudo em `dependencies` deve ficar vazio, só `devDependencies`.
- **Fidelidade de comportamento:** salvo onde este plano diz o contrário explicitamente, todo número, fórmula e regra do jogo original é preservado. Se um valor parecer errado durante o port, preserve-o e anote — mudança de balanceamento é a Task 21, não uma correção de passagem.

---

## Transformações de port (T1–T6)

Muitas tasks pedem "porte a função X aplicando T1–T6". Estas são as seis transformações mecânicas, definidas aqui uma vez.

**T1 — Sem globais.** O que era variável global vira campo de `World`, passado como parâmetro.

| Original | Porte |
|---|---|
| `player` | `world.players[id]` (a função recebe `p: Player`) |
| `enemies`, `bullets`, `enemyBullets`, `coins`, `potions`, `chests`, `obstacles`, `traps`, `spawnQueue` | `world.enemies`, `world.bullets`, … |
| `wave`, `waveActive`, `waveTimer`, `waveMutator`, `waveHasBoss`, `score`, `gold`, `combo`, `comboTimer` | `world.wave`, `world.waveActive`, … |
| `gameState` | `world.phase` (`'playing' | 'levelup' | 'shop' | 'gameover' | 'victory'`) |
| `PLAY` | `world.play` (calculado uma vez de `WORLD`) |
| `particles`, `floatTexts`, `meleeSwings`, `shakeT`, `shakeMag`, `animTick`, `tileMap` | **não vão para `sim/`** — são apresentação; viram eventos (T5) e estado de `render/` |

**T2 — Passo fixo.** Toda função que recebia `dt` passa a não receber nada de tempo e usa as constantes:
- `dt / 16.67` → `TICK_FACTOR`
- `dt` usado como milissegundos (ex.: `p.invincible -= dt`) → `DT_MS`
- `dt / 1000` → `DT_MS / 1000`

**T3 — Aleatoriedade.** Em `sim/`, `Math.random()` → `world.rng.next()`. Idiomas comuns já têm helper (Task 2): `Math.floor(Math.random()*n)` → `world.rng.int(n)`; `Math.random() < p` → `world.rng.chance(p)`; `arr[Math.floor(Math.random()*arr.length)]` → `world.rng.pick(arr)`. **Exceção:** aleatoriedade puramente cosmética (variante de tile, jitter de partícula, posição de tocha) permanece `Math.random()` e vive em `render/`.

**T4 — Tempo.** `performance.now()` e `Date.now()` não existem em `sim/`. Use `world.tick` (contador de passos, 60 por segundo):
- `trapFrameAt`: `Math.floor(performance.now() / 450 + tr.offset) % 4` → `Math.floor(world.tick / 27 + tr.offset) % 4` (450ms ÷ 16.667ms/tick ≈ 27 ticks)
- `lastShot` / `now - lastShot < effRate` → contador regressivo `p.attackTimer` em ms, decrementado `DT_MS` por tick; dispara quando `<= 0`.

**T5 — A simulação relata, não fala.** Chamadas de I/O viram eventos empilhados em `world.events`:

| Original | Porte |
|---|---|
| `Sfx.play('hit')` | `world.events.push({ t: 'sfx', name: 'hit' })` |
| `addFloatText(x, y, txt, color)` | `world.events.push({ t: 'float', x, y, text: String(txt), color })` |
| `spawnParticles(x, y, color, n)` | `world.events.push({ t: 'particles', x, y, color, count: n })` |
| `addShake(mag, dur)` | `world.events.push({ t: 'shake', mag, dur })` |
| `document.getElementById('hurt-flash')…` | `world.events.push({ t: 'hurtFlash' })` |
| `showScreen(n)` / `hideAllScreens()` | mudar `world.phase`; `ui/` reage à mudança |
| `announceWave(txt)` | `world.events.push({ t: 'announce', text: txt })` |
| `Save.*`, `tryUnlock(...)`, `forgeLevel(...)` | **não entram em `sim/`**. Valores de forge são lidos por `app/` no início da run e passados a `createWorld` via `RunConfig` (Task 3). Desbloqueios viram eventos (`{ t: 'unlock', cls }`). |

**T6 — Mundo fixo.** `canvas.width` → `WORLD.w`; `canvas.height` → `WORLD.h`. `PLAY` deixa de ser recalculado em resize; é derivado de `WORLD` uma vez em `createWorld`.

---

## File Structure

```
DungeonGuys2/
├── index.html                    shell: canvas + todas as telas de UI
├── package.json  tsconfig.json  vite.config.ts  eslint.config.js
├── .github/workflows/deploy.yml  build + publish no gh-pages
├── public/
│   ├── assets/  icons/           copiados de ORIG/
│   ├── manifest.json  sw.js      copiados de ORIG/
├── src/
│   ├── main.ts                   ponto de entrada; monta app
│   ├── sim/                      PURO — sem DOM, sem window, sem Math.random
│   │   ├── constants.ts          DT_MS, TICK_FACTOR, WORLD, TILE
│   │   ├── rng.ts                PRNG mulberry32 com estado serializável
│   │   ├── types.ts              World, Player, Enemy, Bullet, InputState, SimEvent…
│   │   ├── world.ts              createWorld(seed, config); derivação de `play`
│   │   ├── step.ts               step(world, inputs) — pipeline de um tick
│   │   ├── stats.ts              baseStats, recalcStats
│   │   ├── equipment.ts          regras puras de equipar (port quase literal)
│   │   ├── equipment-catalog.ts  32 itens (port literal)
│   │   ├── arena.ts              generateArena, resolveObstacles, traps
│   │   ├── player.ts             createPlayer, updatePlayer, damagePlayer
│   │   ├── combat.ts             attack, meleeAttack, dealDamage
│   │   ├── bullets.ts            fireProjectile, updateBullets, updateEnemyBullets
│   │   ├── special.ts            castSpecial — os 7 especiais
│   │   ├── enemies.ts            spawnEnemy, makeEnemy, updateEnemies, killEnemy
│   │   ├── boss.ts               spawnBoss, updateBossPattern
│   │   ├── xp.ts                 gainXp, bênçãos, pickBlessing
│   │   ├── loot.ts               moedas, poções, baús
│   │   ├── shop.ts               rollOffers, buyOffer, itemPrice (lógica pura)
│   │   ├── run.ts                startRun, startNextWave, checkWaveComplete
│   │   └── defs/                 dados puros
│   │       ├── classes.ts  enemies.ts  items.ts  blessings.ts  mutators.ts
│   ├── render/
│   │   ├── sprites.ts            SHEET, ANIMS, coordenadas, recolor
│   │   ├── camera.ts             câmera + culling
│   │   ├── tilemap.ts            piso pré-renderizado do mundo
│   │   ├── entities.ts           desenha jogador, inimigos, projéteis, loot
│   │   ├── fx.ts                 partículas, textos flutuantes, shake, névoa, tochas
│   │   └── index.ts              render(world, camera, alpha)
│   ├── ui/
│   │   ├── dom.ts                refs de elementos
│   │   ├── hud.ts                HUD lendo do world
│   │   ├── screens.ts            start, pause, gameover, levelup, victory
│   │   ├── shop.ts               DOM da loja
│   │   └── touch.ts              joystick e botões touch
│   └── app/
│       ├── loop.ts               rAF + acumulador de passo fixo
│       ├── input.ts              teclado/mouse/touch → InputState
│       ├── audio.ts              Sfx (port literal de ORIG/audio.js)
│       ├── save.ts               Save (port literal de ORIG/save.js)
│       ├── forge.ts              meta-progressão; produz RunConfig
│       └── events.ts             drena world.events para áudio/UI/render
└── tests/
    ├── rng.test.ts  determinism.test.ts  purity.test.ts
    ├── stats.test.ts  equipment.test.ts  equipment-equip.test.ts
    ├── equipment-catalog.test.ts  arena.test.ts  player.test.ts
    ├── combat.test.ts  enemies.test.ts  run.test.ts  xp.test.ts  loot.test.ts
    └── helpers.ts                fixtures: makeTestWorld, runTicks
```

---

### Task 1: Scaffold — Vite, TypeScript, Vitest, barreira de pureza, deploy

**Files:**
- Create: `package.json`, `tsconfig.json`, `vite.config.ts`, `eslint.config.js`, `.gitignore`
- Create: `index.html`, `src/main.ts`
- Create: `.github/workflows/deploy.yml`
- Create: `tests/smoke.test.ts`
- Copy de `ORIG/`: `assets/`, `icons/`, `manifest.json`, `sw.js` → `public/`

**Interfaces:**
- Consumes: nada (primeira task)
- Produces: `npm run dev`, `npm run build`, `npm test`, `npm run lint`. Barreira de lint que reprova qualquer uso de DOM/`Math.random`/`performance` sob `src/sim/**`.

- [ ] **Step 1: Criar `package.json`**

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

- [ ] **Step 2: Criar `tsconfig.json`**

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

`noUncheckedIndexedAccess` fica `false` de propósito: o código itera arrays por índice em dezenas de lugares e ligá-lo transformaria o port numa chuva de `!`.

- [ ] **Step 3: Criar `vite.config.ts`**

```ts
import { defineConfig } from 'vite';

// GitHub Pages serves the repo under /DungeonGuys2/
export default defineConfig({
  base: '/DungeonGuys2/',
  build: { target: 'es2022', outDir: 'dist' },
});
```

- [ ] **Step 4: Criar `eslint.config.js` — a barreira de pureza**

```js
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist', 'public', 'node_modules'] },
  ...tseslint.configs.recommended,
  {
    // sim/ must stay pure: no I/O, no DOM, no wall-clock, no unseeded randomness.
    files: ['src/sim/**/*.ts'],
    rules: {
      'no-restricted-globals': ['error',
        { name: 'window',                 message: 'sim/ is pure — see plan T1-T6' },
        { name: 'document',               message: 'sim/ is pure — emit an event instead (T5)' },
        { name: 'navigator',              message: 'sim/ is pure — see plan T1-T6' },
        { name: 'localStorage',           message: 'sim/ is pure — pass values via RunConfig (T5)' },
        { name: 'performance',            message: 'use world.tick (T4)' },
        { name: 'requestAnimationFrame',  message: 'sim/ is pure — the loop lives in app/' },
        { name: 'setTimeout',             message: 'sim/ is pure — use world.tick (T4)' },
        { name: 'setInterval',            message: 'sim/ is pure — use world.tick (T4)' },
      ],
      'no-restricted-properties': ['error',
        { object: 'Math', property: 'random', message: 'use world.rng (T3)' },
        { object: 'Date', property: 'now',    message: 'use world.tick (T4)' },
      ],
      'no-restricted-imports': ['error', {
        patterns: ['**/render/**', '**/ui/**', '**/app/**'],
      }],
    },
  },
);
```

- [ ] **Step 5: Criar `.gitignore`**

```
node_modules/
dist/
*.local
.DS_Store
```

- [ ] **Step 6: Copiar assets do repositório original**

```bash
mkdir -p public
cp -r "../DungeonGuys/assets" public/assets
cp -r "../DungeonGuys/icons"  public/icons
cp    "../DungeonGuys/manifest.json" public/manifest.json
cp    "../DungeonGuys/sw.js"         public/sw.js
```

- [ ] **Step 7: Criar `index.html`**

Copie `ORIG/index.html` inteiro e faça exatamente três mudanças:
1. Trocar as 11 tags `<script src="...js">` (linhas 279–289 do original) por uma só: `<script type="module" src="/src/main.ts"></script>`.
2. Trocar `<title>` e qualquer texto de título visível de "DungeonGuys" para "DungeonGuys2".
3. Trocar `href="style.css"` por `href="/src/style.css"` e copiar `ORIG/style.css` para `src/style.css` sem alterações.

Toda a marcação de telas (start, pause, gameover, levelup, shop, victory, HUD, controles touch) é preservada como está — as tasks de UI dependem desses ids.

- [ ] **Step 8: Criar `src/main.ts` provisório**

```ts
import './style.css';

// Placeholder entry point; Task 4 replaces this with the real loop.
const canvas = document.getElementById('game-canvas') as HTMLCanvasElement;
const ctx = canvas.getContext('2d')!;
ctx.fillStyle = '#1a1a2e';
ctx.fillRect(0, 0, canvas.width, canvas.height);
```

- [ ] **Step 9: Criar `tests/smoke.test.ts`**

```ts
import { describe, it, expect } from 'vitest';

describe('toolchain', () => {
  it('runs tests', () => {
    expect(1 + 1).toBe(2);
  });
});
```

- [ ] **Step 10: Instalar e rodar tudo**

Run: `npm install && npm test && npm run lint && npm run build`
Expected: os quatro passam. `dist/` é gerado.

- [ ] **Step 11: Provar que a barreira de pureza realmente dispara**

Crie `src/sim/__barrier_check.ts` com:

```ts
export const bad = () => Math.random() + Date.now() + window.innerWidth;
```

Run: `npm run lint`
Expected: FALHA com três erros — `Math.random` ("use world.rng (T3)"), `Date.now` ("use world.tick (T4)") e `window` ("sim/ is pure").

Se algum dos três não aparecer, a regra está mal configurada — conserte antes de seguir.

- [ ] **Step 12: Remover o arquivo de prova**

```bash
rm src/sim/__barrier_check.ts
npm run lint
```
Expected: PASSA.

- [ ] **Step 13: Criar `.github/workflows/deploy.yml`**

```yaml
name: Deploy to GitHub Pages

on:
  push:
    branches: [main]
  workflow_dispatch:

permissions:
  contents: read
  pages: write
  id-token: write

concurrency:
  group: pages
  cancel-in-progress: true

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
      - uses: actions/upload-pages-artifact@v3
        with:
          path: dist

  deploy:
    needs: build
    runs-on: ubuntu-latest
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    steps:
      - id: deployment
        uses: actions/deploy-pages@v4
```

Diferente do original (que empurrava `main` para `gh-pages`), este builda antes de publicar — e o build só passa se lint e testes passarem.

- [ ] **Step 14: Commit**

```bash
git add -A
git commit -m "chore: scaffold Vite + TypeScript + Vitest com barreira de pureza do sim

A regra de lint sobre src/sim/** proibe DOM, window, performance,
Math.random e Date.now, e bloqueia import de render/ui/app. Deploy
passa a buildar antes de publicar no Pages.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: RNG semeado

O jogo original faz 62 chamadas de `Math.random()`. As que afetam o mundo passam por aqui. O estado é um único inteiro de 32 bits, exposto por `save()`/`restore()` — o Marco 2 vai precisar dele dentro do snapshot, então já nasce serializável.

**Files:**
- Create: `src/sim/rng.ts`
- Test: `tests/rng.test.ts`

**Interfaces:**
- Consumes: nada
- Produces: `class Rng` com `next(): number` (`[0,1)`), `int(n): number`, `intRange(min,max): number` (inclusivo nos dois extremos), `range(min,max): number` (float), `chance(p): boolean`, `pick<T>(arr: readonly T[]): T`, `shuffled<T>(arr: readonly T[]): T[]`, `save(): number`, `restore(s: number): void`.

- [ ] **Step 1: Escrever os testes falhando**

```ts
// tests/rng.test.ts
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

  it('produz sequências diferentes para seeds diferentes', () => {
    const a = new Rng(1);
    const b = new Rng(2);
    expect(a.next()).not.toBe(b.next());
  });

  it('gera valores em [0, 1)', () => {
    const r = new Rng(7);
    for (let i = 0; i < 1000; i++) {
      const v = r.next();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it('int(n) fica em [0, n)', () => {
    const r = new Rng(99);
    for (let i = 0; i < 1000; i++) {
      const v = r.int(6);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(6);
      expect(Number.isInteger(v)).toBe(true);
    }
  });

  it('intRange é inclusivo nos dois extremos', () => {
    const r = new Rng(5);
    const seen = new Set<number>();
    for (let i = 0; i < 2000; i++) seen.add(r.intRange(3, 5));
    expect([...seen].sort()).toEqual([3, 4, 5]);
  });

  it('chance(0) nunca acontece e chance(1) sempre acontece', () => {
    const r = new Rng(42);
    for (let i = 0; i < 200; i++) {
      expect(r.chance(0)).toBe(false);
      expect(r.chance(1)).toBe(true);
    }
  });

  it('pick devolve um elemento do array', () => {
    const r = new Rng(3);
    const arr = ['a', 'b', 'c'] as const;
    for (let i = 0; i < 100; i++) expect(arr).toContain(r.pick(arr));
  });

  it('shuffled preserva os elementos e não muta a entrada', () => {
    const r = new Rng(11);
    const src = [1, 2, 3, 4, 5];
    const out = r.shuffled(src);
    expect(src).toEqual([1, 2, 3, 4, 5]);
    expect([...out].sort((x, y) => x - y)).toEqual([1, 2, 3, 4, 5]);
  });

  it('save/restore retoma exatamente a mesma sequência', () => {
    const r = new Rng(2024);
    for (let i = 0; i < 50; i++) r.next();
    const snapshot = r.save();
    const expected = Array.from({ length: 20 }, () => r.next());
    r.restore(snapshot);
    const actual = Array.from({ length: 20 }, () => r.next());
    expect(actual).toEqual(expected);
  });
});
```

- [ ] **Step 2: Rodar para ver falhar**

Run: `npx vitest run tests/rng.test.ts`
Expected: FALHA — "Failed to resolve import '../src/sim/rng'".

- [ ] **Step 3: Implementar `src/sim/rng.ts`**

```ts
// rng.ts — seeded PRNG (mulberry32). The whole state is one 32-bit int,
// so a snapshot can carry it verbatim.

export class Rng {
  private s: number;

  constructor(seed: number) {
    this.s = seed >>> 0;
  }

  /** Uniform float in [0, 1). */
  next(): number {
    this.s = (this.s + 0x6d2b79f5) >>> 0;
    let t = this.s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** Integer in [0, n). */
  int(n: number): number {
    return Math.floor(this.next() * n);
  }

  /** Integer in [min, max], both inclusive. */
  intRange(min: number, max: number): number {
    return min + this.int(max - min + 1);
  }

  /** Float in [min, max). */
  range(min: number, max: number): number {
    return min + this.next() * (max - min);
  }

  /** True with probability p (p <= 0 never, p >= 1 always). */
  chance(p: number): boolean {
    if (p <= 0) return false;
    if (p >= 1) return true;
    return this.next() < p;
  }

  pick<T>(arr: readonly T[]): T {
    return arr[this.int(arr.length)];
  }

  /** Fisher-Yates on a copy; the input is untouched. */
  shuffled<T>(arr: readonly T[]): T[] {
    const out = arr.slice();
    for (let i = out.length - 1; i > 0; i--) {
      const j = this.int(i + 1);
      [out[i], out[j]] = [out[j], out[i]];
    }
    return out;
  }

  save(): number {
    return this.s;
  }

  restore(s: number): void {
    this.s = s >>> 0;
  }
}
```

- [ ] **Step 4: Rodar os testes**

Run: `npx vitest run tests/rng.test.ts && npm run lint`
Expected: 9 testes passam; lint passa (`Math.imul` e `Math.floor` são permitidos — só `Math.random` é bloqueado).

- [ ] **Step 5: Commit**

```bash
git add src/sim/rng.ts tests/rng.test.ts
git commit -m "feat(sim): RNG semeado mulberry32 com estado serializável

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Constantes, tipos e `World`

Este é o contrato que todas as tasks seguintes consomem. Os tipos são escritos por inteiro agora — nenhuma task posterior deve inventar campos.

**Files:**
- Create: `src/sim/constants.ts`, `src/sim/types.ts`, `src/sim/world.ts`
- Test: `tests/world.test.ts`

**Interfaces:**
- Consumes: `Rng` (Task 2)
- Produces: `DT_MS`, `TICK_FACTOR`, `WORLD`, `TILE`; todos os tipos abaixo; `createWorld(config: RunConfig): World`; `emit(world, event)`.

- [ ] **Step 1: Criar `src/sim/constants.ts`**

```ts
// constants.ts — fixed timestep and world geometry.

/** One simulation tick, in milliseconds. The sim never sees any other delta. */
export const DT_MS = 1000 / 60;

/**
 * The original game multiplied per-frame velocities by `dt / 16.67`.
 * Keeping that divisor preserves the exact tuning of every speed constant.
 */
export const TICK_FACTOR = DT_MS / 16.67;

export const TILE = 32;

/** Logical world size, independent of any window. */
export const WORLD = { w: 2400, h: 1600 } as const;
```

- [ ] **Step 2: Criar `src/sim/types.ts`**

```ts
// types.ts — the whole shape of the simulation. sim/ owns these; render/, ui/
// and app/ read them but never define their own parallel shapes.

export type ClassKey = 'mage' | 'archer' | 'warrior' | 'ninja' | 'priestess' | 'witch' | 'coprobo';
export type AttackKind = 'melee' | 'bolt' | 'arrow' | 'bullet' | 'fireball';
export type DamageKind = 'melee' | 'arrow' | 'bullet' | 'bolt' | 'fireball';
export type Archetype = 'melee' | 'ranged' | 'elemental';
export type MutatorKey = 'swarm' | 'frenzy' | 'bounty' | 'elite' | 'fog';
export type Phase = 'playing' | 'levelup' | 'shop' | 'gameover' | 'victory';
export type GameMode = 'campaign' | 'endless';

export type Bounds = { left: number; right: number; top: number; bottom: number };

export type Stats = {
  hpRegen: number; lifeSteal: number; dmgPct: number;
  meleeDmg: number; rangedDmg: number; elementalDmg: number;
  atkSpeedPct: number; crit: number; armor: number; dodge: number;
  range: number; speedPct: number; luck: number; stamina: number;
  burn: number; chill: number; block: number;
};

/** Stat mods may also carry `maxHp`, which Stats itself does not have. */
export type Mods = Partial<Stats> & { maxHp?: number };

/** Flat weapon shape — same as a CLASS_DEFS tier. `player.weapon` is always this. */
export type Weapon = {
  name: string;
  sprite: string | null;
  attack: AttackKind;
  fireRate: number;
  range: number;
  damage: [number, number];
  bulletSpeed?: number;
  pierce?: number;
  count?: number;
  arc?: number;
  knockback?: number;
  aoe?: number;
  poison?: { dps: number; dur: number } | null;
};

export type ItemSlot = 'weapon' | 'offhand' | 'helm' | 'armor' | 'boots' | 'ring' | 'amulet';
export type EquipSlot = 'weapon' | 'offhand' | 'helm' | 'armor' | 'boots' | 'ring1' | 'ring2' | 'amulet';

/** A catalog entry. Weapons nest their combat params under `.weapon`. */
export type EquipItem = {
  id: string;
  name: string;
  icon: string;
  slot: ItemSlot;
  archetype: Archetype | null;
  classReq: ClassKey[] | null;
  twoHanded?: boolean;
  mods: Mods;
  price: number;
  weapon?: Omit<Weapon, 'name'>;
};

/**
 * The `weapon` slot may hold either a catalog EquipItem or a bare CLASS_DEFS
 * tier (the starting weapon). `equipDelta` in the original relies on telling
 * them apart by the presence of `damage`; the port keeps that behavior.
 */
export type Equipment = Record<EquipSlot, EquipItem | Weapon | null>;

/** Shop consumable (ITEM_POOL). */
export type ShopItem = {
  name: string;
  icon: string;
  price: number;
  mods: Mods;
  dmgKind?: Archetype | 'arrow' | 'melee' | 'elemental';
};

export type Blessing = {
  name: string;
  icon: string;
  mods: Mods;
  dmgKind?: 'melee' | 'arrow' | 'elemental';
};

export type Offer<T> = { item: T; sold: boolean };

export type Player = {
  id: string;
  name: string;
  cls: ClassKey;
  x: number; y: number; w: number; h: number;
  hp: number; maxHp: number;
  speed: number;
  stamina: number; sprinting: boolean;
  invincible: number;      // ms remaining
  specialTimer: number;    // ms remaining
  attackTimer: number;     // ms until the next attack is allowed
  regenAcc: number;        // fractional HP carry
  dustTimer: number;       // ms since the last sprint dust puff
  facing: number;          // radians
  moving: boolean;
  walkFrame: number; walkTimer: number;
  level: number; xp: number; xpNext: number;
  gold: number;
  equipment: Equipment;
  weapon: Weapon;
  permStats: Stats; permMaxHp: number;
  stats: Stats;            // derived: permStats + equipment
  pendingLevelUps: number;
  levelChoices: Blessing[];
};

export type Enemy = {
  id: number;
  type: string;
  x: number; y: number; w: number; h: number;
  hp: number; maxHp: number;
  speed: number;
  score: number;
  goldDrop: number;
  potionChance: number;
  dmg: number;
  boss: string | null;
  scale: number;
  summons: string[] | null;
  summonTimer: number;
  anim: string;
  dead: boolean;
  moving: boolean;
  elite: string | null;
  eliteName?: string;
  eliteTint: string | null;
  regen: number;
  hitFlash: number;
  poisonT: number; poisonDps: number;
  burnT: number; burnDps: number;
  slowT: number;
  shooter: ShooterDef | null;
  shootT: number;
  exploder: ExploderDef | null;
  fusing: boolean; fuseT: number;
  /** ability key -> cooldown in ms, e.g. { charge: 6500, ring: 7000 } */
  abilities: Record<string, number> | null;
  cd: Record<string, number>;
  bossState: string;
  stateT: number;
  trapT: number;
  chargeDir: { x: number; y: number };
  enraged: boolean;
};

export type Bullet = {
  /** Player id that fired it — damage, lifesteal and score credit follow this. */
  owner: string;
  x: number; y: number; vx: number; vy: number;
  angle: number; speed: number; range: number;
  damage: [number, number];
  pierce: number;
  aoe: number;
  poison: { dps: number; dur: number } | null;
  type: AttackKind;
  hitIds: number[];   // enemy ids already hit (array, not Set — must serialize)
  dist: number;
  dead: boolean;
};

export type EnemyBullet = {
  x: number; y: number; vx: number; vy: number;
  dmg: number; life: number; dead: boolean; kind: string;
};

export type ShooterDef  = { range: number; interval: number; bulletSpeed: number; dmg: number };
export type ExploderDef = { fuse: number; radius: number; dmg: number; triggerDist: number };

/** A CLASS_DEFS entry. */
export type ClassDef = {
  hp: number;
  speed: number;
  anim: string;
  special: 'fireball' | 'volley' | 'whirlwind' | 'dash' | 'nova' | 'emp' | 'hex';
  specialCd: number;
  tiers: Weapon[];
};

/** An ENEMY_DEFS entry. */
export type EnemyDef = {
  hp: number; speed: number; w: number; h: number;
  score: number; gold: number; anim: string;
  potion: number; dmg: number;
  shooter?: ShooterDef;
  exploder?: ExploderDef;
  boss?: string;
  scale?: number;
  summons?: string[];
  abilities?: Record<string, number>;
};

export type EliteType = {
  name: string; tint: string;
  hp: number; speed?: number; dmg?: number; regen?: number; scaleUp?: number;
};

export type Coin   = { x: number; y: number; vx: number; vy: number; bob: number; dead: boolean };
export type Potion = { x: number; y: number; bob: number; dead: boolean };
export type Chest  = { x: number; y: number; state: 'closed' | 'opening' | 'looted'; timer: number };
export type Obstacle = { kind: 'column' | 'crate'; x: number; y: number; r: number; hp: number; dead: boolean };
export type Trap   = { x: number; y: number; offset: number };
export type SpawnEntry = { delay: number; type: string };

export type SimEvent =
  | { t: 'sfx'; name: string }
  | { t: 'float'; x: number; y: number; text: string; color: string }
  | { t: 'particles'; x: number; y: number; color: string; count: number }
  | { t: 'shake'; mag: number; dur: number }
  | { t: 'swing'; x: number; y: number; angle: number; range: number; arc: number }
  | { t: 'hurtFlash' }
  | { t: 'announce'; text: string }
  | { t: 'unlock'; cls: ClassKey }
  | { t: 'phase'; from: Phase; to: Phase }
  | { t: 'bossMusic'; on: boolean };

/** Everything the sim needs from the outside, decided once per run. */
export type RunConfig = {
  seed: number;
  mode: GameMode;
  classKey: ClassKey;
  playerName: string;
  /** Forge levels, read from Save by app/ — sim never touches localStorage. */
  forge: {
    vigor: number; honed: number; fleet: number;
    startgold: number; merchant: number; wise: number;
  };
};

export type InputState = {
  tick: number;
  move: { x: number; y: number };  // each component in [-1, 1], already normalized
  aim: number;                     // radians
  attack: boolean;
  special: boolean;
  sprint: boolean;
};

export type World = {
  tick: number;
  phase: Phase;
  rng: Rng;
  play: Bounds;
  config: RunConfig;
  nextId: number;

  players: Record<string, Player>;
  enemies: Enemy[];
  bullets: Bullet[];
  enemyBullets: EnemyBullet[];
  coins: Coin[];
  potions: Potion[];
  chests: Chest[];
  obstacles: Obstacle[];
  traps: Trap[];
  spawnQueue: SpawnEntry[];

  wave: number;
  waveActive: boolean;
  waveTimer: number;
  waveHasBoss: boolean;
  waveMutator: MutatorKey | null;
  nextWaveDelay: number;
  pendingAfterLevelUp: 'shop' | 'victory' | null;

  score: number;
  combo: number;
  comboTimer: number;
  runKills: number;
  runGoldEarned: number;

  shopOffers: Offer<ShopItem>[];
  shopEquipOffers: Offer<EquipItem>[];
  rerollCost: number;

  events: SimEvent[];
};

import type { Rng } from './rng';
```

Mova o `import type { Rng }` para o topo do arquivo ao criar — está no fim aqui só para o bloco ler de cima para baixo.

- [ ] **Step 3: Escrever `tests/world.test.ts` falhando**

```ts
import { describe, it, expect } from 'vitest';
import { createWorld, emit } from '../src/sim/world';
import { WORLD, TILE } from '../src/sim/constants';
import type { RunConfig } from '../src/sim/types';

const config: RunConfig = {
  seed: 1234,
  mode: 'campaign',
  classKey: 'mage',
  playerName: 'TEST',
  forge: { vigor: 0, honed: 0, fleet: 0, startgold: 0, merchant: 0, wise: 0 },
};

describe('createWorld', () => {
  it('começa no tick 0, fase playing, sem entidades', () => {
    const w = createWorld(config);
    expect(w.tick).toBe(0);
    expect(w.phase).toBe('playing');
    expect(w.enemies).toEqual([]);
    expect(w.bullets).toEqual([]);
    expect(Object.keys(w.players)).toEqual([]);
    expect(w.wave).toBe(0);
  });

  it('deriva os limites de jogo do WORLD, não de nenhuma janela', () => {
    const w = createWorld(config);
    expect(w.play).toEqual({
      left: TILE,
      right: WORLD.w - TILE,
      top: TILE * 2,
      bottom: WORLD.h - TILE * 2,
    });
  });

  it('semeia o rng com config.seed', () => {
    const a = createWorld(config);
    const b = createWorld(config);
    expect(a.rng.next()).toBe(b.rng.next());

    const c = createWorld({ ...config, seed: 999 });
    expect(c.rng.next()).not.toBe(createWorld(config).rng.next());
  });

  it('emit empilha eventos em ordem', () => {
    const w = createWorld(config);
    emit(w, { t: 'sfx', name: 'hit' });
    emit(w, { t: 'shake', mag: 6, dur: 220 });
    expect(w.events).toEqual([
      { t: 'sfx', name: 'hit' },
      { t: 'shake', mag: 6, dur: 220 },
    ]);
  });

  it('nextId é único e crescente', () => {
    const w = createWorld(config);
    const a = w.nextId++;
    const b = w.nextId++;
    expect(b).toBe(a + 1);
  });
});
```

- [ ] **Step 4: Rodar para ver falhar**

Run: `npx vitest run tests/world.test.ts`
Expected: FALHA — "Failed to resolve import '../src/sim/world'".

- [ ] **Step 5: Implementar `src/sim/world.ts`**

```ts
// world.ts — the single mutable state object the whole simulation operates on.
import { Rng } from './rng';
import { WORLD, TILE } from './constants';
import type { RunConfig, SimEvent, World } from './types';

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
    config,
    nextId: 1,

    players: {},
    enemies: [],
    bullets: [],
    enemyBullets: [],
    coins: [],
    potions: [],
    chests: [],
    obstacles: [],
    traps: [],
    spawnQueue: [],

    wave: 0,
    waveActive: false,
    waveTimer: 0,
    waveHasBoss: false,
    waveMutator: null,
    nextWaveDelay: 3000,
    pendingAfterLevelUp: null,

    score: 0,
    combo: 0,
    comboTimer: 0,
    runKills: 0,
    runGoldEarned: 0,

    shopOffers: [],
    shopEquipOffers: [],
    rerollCost: 5,

    events: [],
  };
}

/** The only way sim/ talks to the outside world (T5). */
export function emit(world: World, event: SimEvent): void {
  world.events.push(event);
}

/** Changes phase and reports it, so ui/ can react without polling. */
export function setPhase(world: World, to: World['phase']): void {
  if (world.phase === to) return;
  emit(world, { t: 'phase', from: world.phase, to });
  world.phase = to;
}
```

- [ ] **Step 6: Rodar os testes**

Run: `npx vitest run && npm run lint && npx tsc --noEmit`
Expected: todos passam.

- [ ] **Step 7: Commit**

```bash
git add src/sim/constants.ts src/sim/types.ts src/sim/world.ts tests/world.test.ts
git commit -m "feat(sim): constantes de passo fixo, tipos do mundo e createWorld

World substitui as globais de ui.js; os limites de jogo passam a
derivar de WORLD (2400x1600) em vez do tamanho da janela.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: `step()` de passo fixo, loop com acumulador e o teste de determinismo

O `step()` nasce quase vazio — só avança o tick. Cada task de 8 a 15 acrescenta uma etapa ao pipeline. O que importa aqui é o **teste de determinismo**, que passa a rodar em toda task seguinte e é o guardião da arquitetura.

**Files:**
- Create: `src/sim/step.ts`, `src/app/loop.ts`
- Modify: `src/main.ts`
- Test: `tests/helpers.ts`, `tests/determinism.test.ts`

**Interfaces:**
- Consumes: `createWorld`, `World`, `InputState` (Task 3)
- Produces:
  - `step(world: World, inputs: Record<string, InputState>): void`
  - `drainEvents(world: World): SimEvent[]`
  - `startLoop(world: World, hooks: LoopHooks): () => void` — devolve uma função que para o loop
  - `LoopHooks = { collectInputs(tick: number): Record<string, InputState>; afterStep(world: World): void; render(world: World, alpha: number): void }`
  - `tests/helpers.ts`: `makeTestWorld(overrides?: Partial<RunConfig>): World`, `runTicks(world, n, inputs?): void`, `hashWorld(world): string`, `noInput(tick): InputState`

- [ ] **Step 1: Escrever `tests/helpers.ts`**

```ts
import { createWorld } from '../src/sim/world';
import { step } from '../src/sim/step';
import type { InputState, RunConfig, World } from '../src/sim/types';

export const BASE_CONFIG: RunConfig = {
  seed: 20260827,
  mode: 'campaign',
  classKey: 'mage',
  playerName: 'TEST',
  forge: { vigor: 0, honed: 0, fleet: 0, startgold: 0, merchant: 0, wise: 0 },
};

export function makeTestWorld(overrides: Partial<RunConfig> = {}): World {
  return createWorld({ ...BASE_CONFIG, ...overrides });
}

export function noInput(tick: number): InputState {
  return { tick, move: { x: 0, y: 0 }, aim: 0, attack: false, special: false, sprint: false };
}

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

/**
 * A stable fingerprint of everything the simulation owns. Excludes `events`
 * (drained every tick by app/) and includes the rng cursor, so a divergence in
 * random draws shows up even when no entity moved yet.
 */
export function hashWorld(world: World): string {
  const snapshot = JSON.stringify(world, (key, value) => {
    if (key === 'events') return undefined;
    if (key === 'rng') return (value as { save(): number }).save();
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

Atenção ao serializar `rng`: `JSON.stringify` chama o replacer com o valor original, então `value.save()` funciona. Se `Rng` ganhar campos no futuro, o replacer continua reduzindo-o ao cursor.

- [ ] **Step 2: Escrever `tests/determinism.test.ts` falhando**

```ts
import { describe, it, expect } from 'vitest';
import { makeTestWorld, runTicks, hashWorld, noInput } from './helpers';
import type { InputState } from '../src/sim/types';

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

describe('determinismo da simulação', () => {
  it('duas instâncias com a mesma seed e os mesmos inputs convergem', () => {
    const a = makeTestWorld();
    const b = makeTestWorld();
    runTicks(a, 600, scripted);
    runTicks(b, 600, scripted);
    expect(hashWorld(a)).toBe(hashWorld(b));
  });

  it('seeds diferentes divergem', () => {
    const a = makeTestWorld({ seed: 1 });
    const b = makeTestWorld({ seed: 2 });
    runTicks(a, 600, scripted);
    runTicks(b, 600, scripted);
    expect(hashWorld(a)).not.toBe(hashWorld(b));
  });

  it('o tick avança exatamente uma vez por step', () => {
    const w = makeTestWorld();
    runTicks(w, 120);
    expect(w.tick).toBe(120);
  });

  it('inputs diferentes produzem mundos diferentes', () => {
    const a = makeTestWorld();
    const b = makeTestWorld();
    runTicks(a, 300, scripted);
    runTicks(b, 300, t => ({ p1: noInput(t) }));
    expect(hashWorld(a)).not.toBe(hashWorld(b));
  });
});
```

Os testes 2 e 4 falham enquanto `step()` estiver vazio (nada consome o rng nem reage a input) — isso é esperado e correto. Marque-os com `it.skip` **apenas até a Task 9**, quando o jogador passa a se mover e a consumir o rng; a Task 9 os reativa. Anote isso num comentário no arquivo para que não sejam esquecidos:

```ts
// NOTE: 'seeds diferentes divergem' and 'inputs diferentes produzem mundos
// diferentes' only have teeth once the player moves (Task 9). Keep them
// skipped until then, and un-skip in Task 9.
```

- [ ] **Step 3: Rodar para ver falhar**

Run: `npx vitest run tests/determinism.test.ts`
Expected: FALHA — "Failed to resolve import '../src/sim/step'".

- [ ] **Step 4: Implementar `src/sim/step.ts`**

```ts
// step.ts — one simulation tick. Everything the world does happens here,
// in this order. Later tasks add stages; the order is the contract.
import type { InputState, SimEvent, World } from './types';

export function step(world: World, inputs: Record<string, InputState>): void {
  world.tick++;
  void inputs; // stages added in Tasks 9-15
}

/** Hands the tick's events to app/ and clears them. */
export function drainEvents(world: World): SimEvent[] {
  const out = world.events;
  world.events = [];
  return out;
}
```

- [ ] **Step 5: Rodar os testes**

Run: `npx vitest run tests/determinism.test.ts`
Expected: PASSAM os testes 1 e 3; 2 e 4 pulados.

- [ ] **Step 6: Implementar `src/app/loop.ts`**

```ts
// loop.ts — fixed-timestep driver. The sim only ever advances in DT_MS slices;
// rendering interpolates between the last two states so 60Hz simulation does
// not stutter on a 144Hz display.
import { DT_MS } from '../sim/constants';
import { step } from '../sim/step';
import type { InputState, World } from '../sim/types';

export type LoopHooks = {
  collectInputs(tick: number): Record<string, InputState>;
  afterStep(world: World): void;
  render(world: World, alpha: number): void;
};

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

  raf = requestAnimationFrame(frame);
  return () => {
    running = false;
    cancelAnimationFrame(raf);
  };
}
```

- [ ] **Step 7: Ligar em `src/main.ts`**

```ts
import './style.css';
import { createWorld } from './sim/world';
import { drainEvents } from './sim/step';
import { startLoop } from './app/loop';
import { noInputFor } from './app/input-stub';

const canvas = document.getElementById('game-canvas') as HTMLCanvasElement;
const ctx = canvas.getContext('2d')!;
canvas.width = window.innerWidth;
canvas.height = window.innerHeight;

const world = createWorld({
  seed: 20260827,
  mode: 'campaign',
  classKey: 'mage',
  playerName: 'DEV',
  forge: { vigor: 0, honed: 0, fleet: 0, startgold: 0, merchant: 0, wise: 0 },
});

// Proof-of-life for the fixed timestep; replaced by the real render in Task 10.
startLoop(world, {
  collectInputs: tick => ({ p1: noInputFor(tick) }),
  afterStep: w => { drainEvents(w); },
  render: (w, alpha) => {
    ctx.fillStyle = '#1a1a2e';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#e8dcc8';
    ctx.font = '16px monospace';
    ctx.fillText(`tick ${w.tick}  alpha ${alpha.toFixed(2)}`, 20, 40);
  },
});
```

E `src/app/input-stub.ts`:

```ts
import type { InputState } from '../sim/types';

/** Placeholder until Task 10 wires real keyboard/mouse/touch input. */
export function noInputFor(tick: number): InputState {
  return { tick, move: { x: 0, y: 0 }, aim: 0, attack: false, special: false, sprint: false };
}
```

- [ ] **Step 8: Verificar no navegador**

Run: `npm run dev` e abrir `http://localhost:5173/DungeonGuys2/`
Expected: fundo escuro com `tick N alpha 0.xx` subindo. Deixar a aba em segundo plano por 10s e voltar: o tick **não** dá um salto enorme (o `MAX_CATCHUP` segura), e a página não trava.

- [ ] **Step 9: Rodar tudo e commitar**

```bash
npm test && npm run lint && npx tsc --noEmit
git add -A
git commit -m "feat: passo fixo, loop com acumulador e teste de determinismo

step() avanca o mundo em fatias de 16.67ms; o loop interpola o
render com alpha. O teste de determinismo compara o hash de dois
mundos com a mesma seed e passa a rodar em toda task seguinte.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: Dados puros (`sim/defs/`)

Port literal das tabelas de dados. Nenhuma lógica, nenhum número alterado — o teste de integridade existe justamente para provar isso.

**Files:**
- Create: `src/sim/defs/classes.ts`, `src/sim/defs/enemies.ts`, `src/sim/defs/items.ts`, `src/sim/defs/blessings.ts`, `src/sim/defs/mutators.ts`
- Modify: `src/sim/constants.ts` (constantes de jogo)
- Test: `tests/defs.test.ts`

**Interfaces:**
- Consumes: tipos da Task 3
- Produces:
  - `CLASS_DEFS: Record<ClassKey, ClassDef>`, `CLASS_KEYS: ClassKey[]`
  - `ENEMY_DEFS: Record<string, EnemyDef>`, `ELITE_TYPES: Record<string, EliteType>`, `MINIBOSS_WAVES: Record<number, string>`, `WAVE_DURATION: number`
  - `ITEM_POOL: ShopItem[]`, `HEAL_PRICE: number`
  - `LEVELUP_POOL: Blessing[]`, `XP_BASE`, `XP_GROWTH`, `LEVEL_HP`
  - `MUTATORS: Record<MutatorKey, { name: string; desc: string }>`
  - Em `constants.ts`: `STAMINA_BASE = 100`, `SPRINT_MULT = 1.55`, `FATIGUE_MULT = 0.7`, `STAMINA_DRAIN = 30`, `STAMINA_REGEN = 18`, `COMBO_WINDOW = 3000`, `COIN_MAGNET = 80`, `SPRITE_SCALE = 2`, `WAVES_TOTAL`, `FORGE_RATE`

- [ ] **Step 1: Portar as tabelas**

Copie verbatim, adicionando só a anotação de tipo:

| Destino | Origem |
|---|---|
| `defs/classes.ts` → `CLASS_DEFS` | `ORIG/config.js:249-315` |
| `defs/enemies.ts` → `ENEMY_DEFS`, `ELITE_TYPES`, `MINIBOSS_WAVES`, `WAVE_DURATION` | `ORIG/entities.js:3-30`, `:33-38`, `:60`, `:61` |
| `defs/items.ts` → `ITEM_POOL`, `HEAL_PRICE` | `ORIG/ui.js:70-97`, `:98` |
| `defs/blessings.ts` → `LEVELUP_POOL`, `XP_BASE`, `XP_GROWTH`, `LEVEL_HP` | `ORIG/entities.js:88-107`, `:64-66` |
| `defs/mutators.ts` → `MUTATORS` | `ORIG/ui.js:116-122` |
| `constants.ts` → constantes de stamina/combo | `ORIG/ui.js:51-55`, `:110` |
| `constants.ts` → `COIN_MAGNET`, `SPRITE_SCALE` | `ORIG/config.js:4`, `:5` |
| `constants.ts` → `WAVES_TOTAL`, `FORGE_RATE` | `ORIG/config.js` (procure por `WAVES_TOTAL` e `FORGE_RATE`) |

Duas observações do port:

- `CLASS_DEFS` usa `Math.PI * 0.65` etc. nos arcos de melee — mantenha as expressões, não pré-calcule.
- `LEVELUP_POOL` e `ITEM_POOL` usam a chave `dmgKind` com os valores `'melee' | 'arrow' | 'elemental'`. Isso **não** é o mesmo que `Archetype` (`'melee' | 'ranged' | 'elemental'`). Mantenha os dois vocabulários separados — `playerDmgKind()` produz o primeiro e `playerArchetype()` o segundo, e trocar um pelo outro quebra o filtro da loja em silêncio.

Adicione no topo de `defs/classes.ts`:

```ts
export const CLASS_KEYS: ClassKey[] = ['mage', 'archer', 'warrior', 'ninja', 'priestess', 'witch', 'coprobo'];
```

- [ ] **Step 2: Escrever `tests/defs.test.ts`**

```ts
import { describe, it, expect } from 'vitest';
import { CLASS_DEFS, CLASS_KEYS } from '../src/sim/defs/classes';
import { ENEMY_DEFS, ELITE_TYPES, MINIBOSS_WAVES } from '../src/sim/defs/enemies';
import { ITEM_POOL } from '../src/sim/defs/items';
import { LEVELUP_POOL } from '../src/sim/defs/blessings';
import { MUTATORS } from '../src/sim/defs/mutators';
import { baseStats } from '../src/sim/stats';

const STAT_KEYS = new Set([...Object.keys(baseStats()), 'maxHp']);

describe('defs de classes', () => {
  it('tem as 7 classes, cada uma com 3 tiers', () => {
    expect(CLASS_KEYS).toHaveLength(7);
    for (const k of CLASS_KEYS) {
      expect(CLASS_DEFS[k]).toBeDefined();
      expect(CLASS_DEFS[k].tiers).toHaveLength(3);
    }
  });

  it('todo tier tem dano [min, max] com min <= max e fireRate positivo', () => {
    for (const k of CLASS_KEYS) {
      for (const t of CLASS_DEFS[k].tiers) {
        expect(t.damage).toHaveLength(2);
        expect(t.damage[0]).toBeLessThanOrEqual(t.damage[1]);
        expect(t.fireRate).toBeGreaterThan(0);
        expect(t.range).toBeGreaterThan(0);
      }
    }
  });

  it('armas melee têm arc e knockback; armas de projétil têm bulletSpeed', () => {
    for (const k of CLASS_KEYS) {
      for (const t of CLASS_DEFS[k].tiers) {
        if (t.attack === 'melee') {
          expect(t.arc).toBeGreaterThan(0);
          expect(t.knockback).toBeGreaterThan(0);
        } else {
          expect(t.bulletSpeed).toBeGreaterThan(0);
        }
      }
    }
  });
});

describe('defs de inimigos', () => {
  it('todo inimigo tem hp, speed e caixa positivos', () => {
    for (const [name, d] of Object.entries(ENEMY_DEFS)) {
      expect(d.hp, name).toBeGreaterThan(0);
      expect(d.speed, name).toBeGreaterThan(0);
      expect(d.w, name).toBeGreaterThan(0);
      expect(d.h, name).toBeGreaterThan(0);
    }
  });

  it('tudo que um chefe invoca existe no catálogo', () => {
    for (const [name, d] of Object.entries(ENEMY_DEFS)) {
      for (const s of d.summons ?? []) {
        expect(ENEMY_DEFS[s], `${name} invoca ${s}`).toBeDefined();
      }
    }
  });

  it('as waves de mini-boss apontam para inimigos existentes marcados como boss', () => {
    for (const [wave, type] of Object.entries(MINIBOSS_WAVES)) {
      const def = ENEMY_DEFS[type];
      expect(def, `wave ${wave}`).toBeDefined();
      expect(def.boss, `wave ${wave}`).toBeTruthy();
    }
  });

  it('todo elite tem tint e multiplicador de hp', () => {
    for (const [name, e] of Object.entries(ELITE_TYPES)) {
      expect(e.tint, name).toMatch(/^#[0-9a-f]{6}$/i);
      expect(e.hp, name).toBeGreaterThan(1);
    }
  });
});

describe('tabelas de progressão', () => {
  it('todo mod de item e de bênção usa uma chave de stat válida', () => {
    for (const it of ITEM_POOL) {
      for (const k of Object.keys(it.mods)) {
        expect(STAT_KEYS.has(k), `${it.name} usa mod desconhecido "${k}"`).toBe(true);
      }
    }
    for (const b of LEVELUP_POOL) {
      for (const k of Object.keys(b.mods)) {
        expect(STAT_KEYS.has(k), `${b.name} usa mod desconhecido "${k}"`).toBe(true);
      }
    }
  });

  it('todo item da loja tem preço positivo e nome único', () => {
    const names = ITEM_POOL.map(i => i.name);
    expect(new Set(names).size).toBe(names.length);
    for (const it of ITEM_POOL) expect(it.price, it.name).toBeGreaterThan(0);
  });

  it('as bênçãos restritas usam apenas os três dmgKind conhecidos', () => {
    for (const b of LEVELUP_POOL) {
      if (b.dmgKind) expect(['melee', 'arrow', 'elemental']).toContain(b.dmgKind);
    }
  });

  it('os 5 mutadores têm nome e descrição', () => {
    expect(Object.keys(MUTATORS)).toHaveLength(5);
    for (const [k, m] of Object.entries(MUTATORS)) {
      expect(m.name, k).toBeTruthy();
      expect(m.desc, k).toBeTruthy();
    }
  });
});
```

Este arquivo importa `baseStats` da Task 7. Se a Task 5 for executada antes da 7, escreva `STAT_KEYS` como literal com as 17 chaves de `Stats` mais `maxHp` e troque pelo import na Task 7.

- [ ] **Step 3: Rodar**

Run: `npx vitest run tests/defs.test.ts && npm run lint && npx tsc --noEmit`
Expected: todos passam. Qualquer falha aqui é erro de transcrição — volte ao original e confira o número.

- [ ] **Step 4: Commit**

```bash
git add src/sim/defs src/sim/constants.ts tests/defs.test.ts
git commit -m "feat(sim): portar tabelas de dados (classes, inimigos, itens, bencaos, mutadores)

Port literal, sem alteracao de numero. Teste de integridade cobre
tiers, invocacoes de chefe, chaves de mod e unicidade de nomes.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: Equipamentos — regras e catálogo

O código de equipamento do original **já é puro** (`ORIG/equipment.js` não toca DOM nem `Math.random`). Este é o port mais barato do plano e traz junto os três testes que já existiam.

**Files:**
- Create: `src/sim/equipment.ts`, `src/sim/equipment-catalog.ts`
- Test: `tests/equipment.test.ts`, `tests/equipment-equip.test.ts`, `tests/equipment-catalog.test.ts`

**Interfaces:**
- Consumes: tipos da Task 3
- Produces: `EQUIP_SLOTS: EquipSlot[]`, `emptyEquipment(): Equipment`, `sumEquipmentMods(eq): Mods`, `computeEffectiveStats(permStats, eq): Stats`, `effectiveMaxHp(permMaxHp, eq): number`, `archetypeOf(attack): Archetype`, `isEligible(item, classKey, archetype): boolean`, `resolveRingSlot(eq): 'ring1'|'ring2'`, `targetSlot(item, eq): EquipSlot`, `canEquip(item, eq): boolean`, `equipInto(eq, item): Equipment`, `EQUIPMENT: EquipItem[]`

- [ ] **Step 1: Portar `ORIG/equipment.js` → `src/sim/equipment.ts`**

Copie as 11 funções verbatim (linhas 6–91), com estas mudanças e nenhuma outra:
- adicionar tipos de parâmetro e retorno conforme o bloco *Produces* acima;
- trocar `function f(...)` por `export function f(...)`;
- **remover** o guard UMD do final (linhas 93–96) — em ESM o `export` já resolve;
- `sumEquipmentMods` itera `Object.entries(item.mods)`; em TS, tipar o acumulador como `Mods` e indexar com `as keyof Mods`.

Nenhuma regra muda: escudo continua bloqueado por arma de duas mãos, anel continua caindo em `ring1` quando ambos estão cheios, `equipInto` continua devolvendo um objeto novo sem mutar a entrada.

- [ ] **Step 2: Portar `ORIG/equipment-catalog.js` → `src/sim/equipment-catalog.ts`**

Copie os 32 itens verbatim. Mudanças: `const EQUIPMENT` → `export const EQUIPMENT: EquipItem[]`; remover o guard UMD final. Mantenha `Math.PI * 0.75` etc. como expressões.

- [ ] **Step 3: Migrar os três testes**

Para cada arquivo em `ORIG/tests/` (`equipment.test.js`, `equipment-equip.test.js`, `equipment-catalog.test.js`), crie o equivalente `.ts` em `tests/` aplicando esta conversão mecânica:

```ts
// antes (Node puro)
const assert = require('assert');
const eq = require('../equipment.js');
assert.strictEqual(eq.EQUIP_SLOTS.length, 8, 'should have 8 slots');
assert.deepStrictEqual(Object.keys(empty).sort(), [...eq.EQUIP_SLOTS].sort());
assert.ok(eq.EQUIP_SLOTS.every(s => empty[s] === null), 'all slots null');

// depois (vitest)
import { describe, it, expect } from 'vitest';
import * as eq from '../src/sim/equipment';

describe('EQUIP_SLOTS', () => {
  it('tem 8 slots', () => {
    expect(eq.EQUIP_SLOTS).toHaveLength(8);
  });
  it('emptyEquipment cria todos os slots nulos', () => {
    const empty = eq.emptyEquipment();
    expect(Object.keys(empty).sort()).toEqual([...eq.EQUIP_SLOTS].sort());
    expect(eq.EQUIP_SLOTS.every(s => empty[s] === null)).toBe(true);
  });
});
```

Regra de conversão: `assert.strictEqual(a, b)` → `expect(a).toBe(b)`; `assert.deepStrictEqual(a, b)` → `expect(a).toEqual(b)`; `assert.ok(x)` → `expect(x).toBe(true)`; a mensagem do assert vira o nome do `it`. **Nenhum caso de teste é removido ou enfraquecido** — se um assert não tiver equivalente óbvio, mantenha-o como `expect(cond).toBe(true)` com a mensagem original no nome do `it`.

- [ ] **Step 4: Rodar**

Run: `npx vitest run tests/equipment*.test.ts && npm run lint && npx tsc --noEmit`
Expected: todos passam, com pelo menos a mesma contagem de asserções dos originais.

- [ ] **Step 5: Commit**

```bash
git add src/sim/equipment.ts src/sim/equipment-catalog.ts tests/equipment*.test.ts
git commit -m "feat(sim): portar regras e catalogo de equipamento com os testes existentes

O modulo original ja era puro; o port remove o guard UMD e adiciona
tipos. Os tres testes de Node viram testes de Vitest sem perder casos.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 7: Camada de stats

**Files:**
- Create: `src/sim/stats.ts`
- Test: `tests/stats.test.ts`

**Interfaces:**
- Consumes: `computeEffectiveStats`, `effectiveMaxHp`, `archetypeOf` (Task 6); `CLASS_DEFS` (Task 5)
- Produces: `baseStats(): Stats`, `recalcStats(p: Player): void`, `startWeapon(cls: ClassKey): Weapon`, `maxStamina(p: Player): number`, `playerDmgKind(p: Player): 'melee'|'arrow'|'elemental'`, `playerArchetype(p: Player): Archetype`, `applyMods(p: Player, mods: Mods): void`, `STAT_LABELS`, `PCT_STATS`

- [ ] **Step 1: Escrever `tests/stats.test.ts` falhando**

```ts
import { describe, it, expect } from 'vitest';
import { baseStats, recalcStats, startWeapon, maxStamina, playerDmgKind, playerArchetype, applyMods } from '../src/sim/stats';
import { emptyEquipment } from '../src/sim/equipment';
import type { EquipItem, Player } from '../src/sim/types';

function makePlayer(cls: Player['cls'] = 'mage'): Player {
  const weapon = startWeapon(cls);
  const p = {
    id: 'p1', name: 'T', cls,
    x: 0, y: 0, w: 20, h: 20,
    hp: 100, maxHp: 100, speed: 2.6,
    stamina: 100, sprinting: false,
    invincible: 0, specialTimer: 0, attackTimer: 0,
    regenAcc: 0, dustTimer: 0, facing: 0, moving: false,
    walkFrame: 0, walkTimer: 0,
    level: 1, xp: 0, xpNext: 100, gold: 0,
    equipment: emptyEquipment(),
    weapon,
    permStats: baseStats(), permMaxHp: 100,
    stats: baseStats(),
    pendingLevelUps: 0, levelChoices: [],
  } as Player;
  p.equipment.weapon = weapon;
  recalcStats(p);
  return p;
}

const helm: EquipItem = {
  id: 'h_test', name: 'TEST HELM', icon: '⛑', slot: 'helm',
  archetype: null, classReq: null, mods: { armor: 4, dmgPct: 10, maxHp: 25 }, price: 10,
};

describe('baseStats', () => {
  it('começa com as 17 stats zeradas', () => {
    const s = baseStats();
    expect(Object.keys(s)).toHaveLength(17);
    expect(Object.values(s).every(v => v === 0)).toBe(true);
  });

  it('devolve um objeto novo a cada chamada', () => {
    const a = baseStats();
    a.armor = 5;
    expect(baseStats().armor).toBe(0);
  });
});

describe('recalcStats', () => {
  it('soma os mods do equipamento sobre a camada permanente', () => {
    const p = makePlayer();
    p.equipment.helm = helm;
    recalcStats(p);
    expect(p.stats.armor).toBe(4);
    expect(p.stats.dmgPct).toBe(10);
  });

  it('maxHp vem de permMaxHp mais os mods, e não entra em stats', () => {
    const p = makePlayer();
    p.equipment.helm = helm;
    recalcStats(p);
    expect(p.maxHp).toBe(125);
    expect('maxHp' in p.stats).toBe(false);
  });

  it('não deixa hp acima do novo maxHp', () => {
    const p = makePlayer();
    p.hp = 100;
    p.permMaxHp = 60;
    recalcStats(p);
    expect(p.hp).toBe(60);
  });

  it('não altera a camada permanente', () => {
    const p = makePlayer();
    p.equipment.helm = helm;
    recalcStats(p);
    expect(p.permStats.armor).toBe(0);
  });
});

describe('applyMods', () => {
  it('mods permanentes entram em permStats e reaparecem em stats', () => {
    const p = makePlayer();
    applyMods(p, { dmgPct: 4, crit: 3 });
    expect(p.permStats.dmgPct).toBe(4);
    expect(p.stats.crit).toBe(3);
  });

  it('ganhar maxHp permanente também cura essa quantia', () => {
    const p = makePlayer();
    p.hp = 50;
    applyMods(p, { maxHp: 15 });
    expect(p.permMaxHp).toBe(115);
    expect(p.hp).toBe(65);
  });

  it('perder maxHp não cura e nunca desce de 30', () => {
    const p = makePlayer();
    p.permMaxHp = 35;
    p.hp = 35;
    applyMods(p, { maxHp: -20 });
    expect(p.permMaxHp).toBe(30);
    expect(p.hp).toBe(30);
  });
});

describe('classificação de dano', () => {
  it('mage é elemental, archer é arrow/ranged, warrior é melee', () => {
    expect(playerDmgKind(makePlayer('mage'))).toBe('elemental');
    expect(playerArchetype(makePlayer('mage'))).toBe('elemental');
    expect(playerDmgKind(makePlayer('archer'))).toBe('arrow');
    expect(playerArchetype(makePlayer('archer'))).toBe('ranged');
    expect(playerDmgKind(makePlayer('warrior'))).toBe('melee');
    expect(playerArchetype(makePlayer('warrior'))).toBe('melee');
  });

  it('coprobo atira bullet, que é arrow em dmgKind e ranged em archetype', () => {
    expect(playerDmgKind(makePlayer('coprobo'))).toBe('arrow');
    expect(playerArchetype(makePlayer('coprobo'))).toBe('ranged');
  });
});

describe('maxStamina', () => {
  it('é 100 mais a stat de stamina', () => {
    const p = makePlayer();
    expect(maxStamina(p)).toBe(100);
    p.permStats.stamina = 30;
    recalcStats(p);
    expect(maxStamina(p)).toBe(130);
  });
});
```

- [ ] **Step 2: Rodar para ver falhar**

Run: `npx vitest run tests/stats.test.ts`
Expected: FALHA — módulo não encontrado.

- [ ] **Step 3: Implementar `src/sim/stats.ts`**

Porte de `ORIG/ui.js:14-66` e `ORIG/entities.js:112-122` e `ORIG/items.js:46-58`, aplicando T1 (o `player` global vira parâmetro `p`):

```ts
// stats.ts — the permanent stat layer and its derivation into effective stats.
import { computeEffectiveStats, effectiveMaxHp, archetypeOf } from './equipment';
import { CLASS_DEFS } from './defs/classes';
import { STAMINA_BASE } from './constants';
import type { Archetype, ClassKey, Mods, Player, Stats, Weapon } from './types';

/** All 17 stats at zero. A fresh object every call. */
export function baseStats(): Stats {
  return {
    hpRegen: 0, lifeSteal: 0, dmgPct: 0,
    meleeDmg: 0, rangedDmg: 0, elementalDmg: 0,
    atkSpeedPct: 0, crit: 0, armor: 0, dodge: 0,
    range: 0, speedPct: 0, luck: 0, stamina: 0,
    burn: 0, chill: 0, block: 0,
  };
}

/** Re-derives p.stats and p.maxHp from the permanent layer plus equipment. */
export function recalcStats(p: Player): void {
  p.stats = computeEffectiveStats(p.permStats, p.equipment);
  p.maxHp = effectiveMaxHp(p.permMaxHp, p.equipment);
  if (p.hp > p.maxHp) p.hp = p.maxHp;
}

export function startWeapon(cls: ClassKey): Weapon {
  return CLASS_DEFS[cls].tiers[0];
}

export function maxStamina(p: Player): number {
  return STAMINA_BASE + p.stats.stamina;
}

/** Damage-table bucket: melee | arrow | elemental (NOT the archetype vocabulary). */
export function playerDmgKind(p: Player): 'melee' | 'arrow' | 'elemental' {
  const atk = p.weapon.attack;
  if (atk === 'melee') return 'melee';
  if (atk === 'arrow' || atk === 'bullet') return 'arrow';
  return 'elemental';
}

/** Equipment eligibility bucket: melee | ranged | elemental. */
export function playerArchetype(p: Player): Archetype {
  return archetypeOf(p.weapon.attack);
}

/** Permanent gains from blessings and shop consumables. */
export function applyMods(p: Player, mods: Mods): void {
  let heal = 0;
  for (const [k, v] of Object.entries(mods)) {
    if (k === 'maxHp') {
      p.permMaxHp = Math.max(30, p.permMaxHp + (v as number));
      if ((v as number) > 0) heal += v as number; // permanent max HP also heals
    } else {
      const key = k as keyof Stats;
      p.permStats[key] = (p.permStats[key] || 0) + (v as number);
    }
  }
  recalcStats(p);
  if (heal) p.hp = Math.min(p.maxHp, p.hp + heal);
}

export const STAT_LABELS: Record<string, string> = {
  hpRegen: 'HP REGEN', lifeSteal: 'LIFESTEAL', dmgPct: 'DAMAGE',
  meleeDmg: 'MELEE DMG', rangedDmg: 'RANGED DMG', elementalDmg: 'ELEM DMG',
  atkSpeedPct: 'ATK SPEED', crit: 'CRIT', armor: 'ARMOR',
  dodge: 'DODGE', range: 'RANGE', speedPct: 'SPEED', luck: 'LUCK',
  stamina: 'STAMINA', maxHp: 'MAX HP', burn: 'BURN', chill: 'CHILL', block: 'BLOCK',
};

export const PCT_STATS = new Set([
  'dmgPct', 'atkSpeedPct', 'speedPct', 'crit', 'dodge',
  'lifeSteal', 'luck', 'burn', 'chill', 'block',
]);
```

Atenção a um detalhe que o teste cobre: `applyMods` com `maxHp` negativo aplica o piso de 30 **e** não cura; `recalcStats` então apara o `hp`.

- [ ] **Step 4: Rodar**

Run: `npx vitest run && npm run lint && npx tsc --noEmit`
Expected: todos passam. `tests/defs.test.ts` agora pode importar `baseStats` de verdade — troque o literal se você tiver deixado um.

- [ ] **Step 5: Commit**

```bash
git add src/sim/stats.ts tests/stats.test.ts tests/defs.test.ts
git commit -m "feat(sim): camada de stats com player como parametro

baseStats/recalcStats/applyMods deixam de operar sobre o global
'player' e recebem o jogador, preparando a colecao de jogadores.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 8: Arena — obstáculos, armadilhas e colisão

**Files:**
- Create: `src/sim/arena.ts`
- Test: `tests/arena.test.ts`

**Interfaces:**
- Consumes: `World`, `emit` (Task 3), `WORLD`, `TILE` (Task 3/5)
- Produces: `generateArena(world): void`, `resolveObstacles(ent: {x,y}, radius, world): void`, `trapFrameAt(world, trap): number`, `trapDangerous(world, trap): boolean`, `damageCrate(world, o: Obstacle, dmg: number): void`, `rectCircle(rx,ry,rw,rh,cx,cy,cr): boolean`

**Desvio deliberado deste task:** o original espalha 4–6 obstáculos e 2–3 armadilhas numa arena do tamanho da janela (~1280×720 = 0,92 Mpx). O mundo agora tem 3,84 Mpx — 4,17× a área. Manter os números absolutos deixaria a arena vazia, o que não é "preservar o balanceamento", é alterá-lo por omissão. As contagens escalam pela área (`AREA_SCALE`), preservando a **densidade** original. O ajuste fino fica para a Task 21.

- [ ] **Step 1: Escrever `tests/arena.test.ts` falhando**

```ts
import { describe, it, expect } from 'vitest';
import { makeTestWorld } from './helpers';
import { generateArena, resolveObstacles, trapDangerous, trapFrameAt, damageCrate, rectCircle } from '../src/sim/arena';
import { WORLD } from '../src/sim/constants';

describe('generateArena', () => {
  it('é determinística para a mesma seed', () => {
    const a = makeTestWorld(); generateArena(a);
    const b = makeTestWorld(); generateArena(b);
    expect(a.obstacles).toEqual(b.obstacles);
    expect(a.traps).toEqual(b.traps);
  });

  it('difere entre seeds', () => {
    const a = makeTestWorld({ seed: 1 }); generateArena(a);
    const b = makeTestWorld({ seed: 2 }); generateArena(b);
    expect(a.obstacles).not.toEqual(b.obstacles);
  });

  it('mantém tudo dentro dos limites de jogo', () => {
    const w = makeTestWorld(); generateArena(w);
    for (const o of [...w.obstacles, ...w.traps]) {
      expect(o.x).toBeGreaterThan(w.play.left);
      expect(o.x).toBeLessThan(w.play.right);
      expect(o.y).toBeGreaterThan(w.play.top);
      expect(o.y).toBeLessThan(w.play.bottom);
    }
  });

  it('deixa o centro do mundo livre para o spawn', () => {
    const w = makeTestWorld(); generateArena(w);
    const cx = WORLD.w / 2, cy = WORLD.h / 2;
    for (const o of w.obstacles) expect(Math.hypot(o.x - cx, o.y - cy)).toBeGreaterThanOrEqual(150);
    for (const t of w.traps)     expect(Math.hypot(t.x - cx, t.y - cy)).toBeGreaterThanOrEqual(140);
  });

  it('escala a quantidade com a área do mundo', () => {
    const w = makeTestWorld(); generateArena(w);
    expect(w.obstacles.length).toBeGreaterThanOrEqual(16);
    expect(w.traps.length).toBeGreaterThanOrEqual(8);
  });

  it('regenerar zera o que havia antes', () => {
    const w = makeTestWorld();
    generateArena(w);
    const n = w.obstacles.length;
    generateArena(w);
    expect(w.obstacles.length).toBeLessThanOrEqual(n * 1.5);
  });
});

describe('resolveObstacles', () => {
  it('empurra a entidade para fora de um obstáculo sólido', () => {
    const w = makeTestWorld();
    w.obstacles = [{ kind: 'column', x: 100, y: 100, r: 16, hp: Infinity, dead: false }];
    const ent = { x: 105, y: 100 };
    resolveObstacles(ent, 10, w);
    expect(Math.hypot(ent.x - 100, ent.y - 100)).toBeCloseTo(26, 5);
  });

  it('ignora obstáculos destruídos', () => {
    const w = makeTestWorld();
    w.obstacles = [{ kind: 'crate', x: 100, y: 100, r: 14, hp: 0, dead: true }];
    const ent = { x: 101, y: 100 };
    resolveObstacles(ent, 10, w);
    expect(ent).toEqual({ x: 101, y: 100 });
  });

  it('não mexe em quem já está fora', () => {
    const w = makeTestWorld();
    w.obstacles = [{ kind: 'column', x: 100, y: 100, r: 16, hp: Infinity, dead: false }];
    const ent = { x: 200, y: 200 };
    resolveObstacles(ent, 10, w);
    expect(ent).toEqual({ x: 200, y: 200 });
  });
});

describe('armadilhas', () => {
  it('o ciclo de espinhos vem do tick, não do relógio', () => {
    const w = makeTestWorld();
    const trap = { x: 0, y: 0, offset: 0 };
    w.tick = 0;
    expect(trapFrameAt(w, trap)).toBe(0);
    expect(trapDangerous(w, trap)).toBe(false);
    w.tick = 27 * 2; // two 450ms steps in
    expect(trapFrameAt(w, trap)).toBe(2);
    expect(trapDangerous(w, trap)).toBe(true);
  });
});

describe('damageCrate', () => {
  it('quebra a caixa e derruba 1 ou 2 moedas', () => {
    const w = makeTestWorld();
    const crate = { kind: 'crate' as const, x: 50, y: 50, r: 14, hp: 40, dead: false };
    w.obstacles = [crate];
    damageCrate(w, crate, 100);
    expect(crate.dead).toBe(true);
    expect(w.coins.length).toBeGreaterThanOrEqual(1);
    expect(w.coins.length).toBeLessThanOrEqual(2);
    expect(w.events.some(e => e.t === 'sfx' && e.name === 'chest')).toBe(true);
  });

  it('dano insuficiente não quebra', () => {
    const w = makeTestWorld();
    const crate = { kind: 'crate' as const, x: 50, y: 50, r: 14, hp: 40, dead: false };
    damageCrate(w, crate, 10);
    expect(crate.dead).toBe(false);
    expect(crate.hp).toBe(30);
  });
});

describe('rectCircle', () => {
  it('detecta sobreposição e ausência dela', () => {
    expect(rectCircle(0, 0, 10, 10, 5, 5, 2)).toBe(true);
    expect(rectCircle(0, 0, 10, 10, 50, 50, 2)).toBe(false);
    expect(rectCircle(0, 0, 10, 10, 12, 5, 3)).toBe(true);
  });
});
```

- [ ] **Step 2: Rodar para ver falhar**

Run: `npx vitest run tests/arena.test.ts`
Expected: FALHA — módulo não encontrado.

- [ ] **Step 3: Implementar `src/sim/arena.ts`**

Porte de `ORIG/config.js:100-167` e `ORIG/items.js:354-358`, aplicando T1, T3, T4, T5, T6:

```ts
// arena.ts — per-run layout (columns, crates, spike traps) and circle collision.
import { emit } from './world';
import { WORLD } from './constants';
import type { Obstacle, Trap, World } from './types';

/** The original tuned its counts for a ~1280x720 arena; keep that density. */
const AREA_SCALE = (WORLD.w * WORLD.h) / (1280 * 720);

/** A fresh random layout each run: solid columns, breakable crates, spike traps. */
export function generateArena(world: World): void {
  world.obstacles = [];
  world.traps = [];

  const { rng, play } = world;
  const margin = 110;
  const cx = WORLD.w / 2, cy = WORLD.h / 2;

  const spots: { x: number; y: number }[] = [];
  const want = Math.round((4 + rng.int(3)) * AREA_SCALE);
  let attempts = 0;
  while (spots.length < want && attempts++ < want * 60) {
    const x = play.left + margin + rng.next() * (play.right - play.left - margin * 2);
    const y = play.top + margin + rng.next() * (play.bottom - play.top - margin * 2);
    if (Math.hypot(x - cx, y - cy) < 150) continue;           // keep the spawn clear
    if (spots.some(s => Math.hypot(x - s.x, y - s.y) < 110)) continue;
    spots.push({ x, y });
  }

  spots.forEach((s, i) => {
    if (i < 2 || rng.chance(0.5)) {
      world.obstacles.push({ kind: 'column', x: s.x, y: s.y, r: 16, hp: Infinity, dead: false });
    } else {
      world.obstacles.push({ kind: 'crate', x: s.x, y: s.y, r: 14, hp: 40, dead: false });
    }
  });

  const trapCount = Math.round((2 + rng.int(2)) * AREA_SCALE);
  attempts = 0;
  while (world.traps.length < trapCount && attempts++ < trapCount * 60) {
    const x = play.left + margin + rng.next() * (play.right - play.left - margin * 2);
    const y = play.top + margin + rng.next() * (play.bottom - play.top - margin * 2);
    if (Math.hypot(x - cx, y - cy) < 140) continue;
    if (world.obstacles.some(o => Math.hypot(x - o.x, y - o.y) < 90)) continue;
    if (world.traps.some(t => Math.hypot(x - t.x, y - t.y) < 130)) continue;
    world.traps.push({ x, y, offset: rng.next() * 4 });
  }
}

/** Pushes a circular entity out of solid obstacles. */
export function resolveObstacles(ent: { x: number; y: number }, radius: number, world: World): void {
  for (const o of world.obstacles) {
    if (o.dead) continue;
    const dx = ent.x - o.x, dy = ent.y - o.y;
    const d = Math.hypot(dx, dy), min = o.r + radius;
    if (d < min && d > 0.001) {
      ent.x = o.x + (dx / d) * min;
      ent.y = o.y + (dy / d) * min;
    }
  }
}

/** 450ms per frame in the original; 450 / 16.667 = 27 ticks (T4). */
const TRAP_TICKS_PER_FRAME = 27;

export function trapFrameAt(world: World, tr: Trap): number {
  return Math.floor(world.tick / TRAP_TICKS_PER_FRAME + tr.offset) % 4;
}

/** Spikes are out on frames 2 and 3. */
export function trapDangerous(world: World, tr: Trap): boolean {
  return trapFrameAt(world, tr) >= 2;
}

export function damageCrate(world: World, o: Obstacle, dmg: number): void {
  o.hp -= dmg;
  emit(world, { t: 'particles', x: o.x, y: o.y, color: '#8B6914', count: 5 });
  if (o.hp <= 0 && !o.dead) {
    o.dead = true;
    emit(world, { t: 'sfx', name: 'chest' });
    emit(world, { t: 'particles', x: o.x, y: o.y, color: '#b8945a', count: 14 });
    const n = 1 + world.rng.int(2);
    for (let i = 0; i < n; i++) {
      const a = world.rng.next() * Math.PI * 2;
      world.coins.push({
        x: o.x, y: o.y,
        vx: Math.cos(a) * 2, vy: Math.sin(a) * 2,
        dead: false, bob: world.rng.next() * 6,
      });
    }
  }
}

export function rectCircle(
  rx: number, ry: number, rw: number, rh: number,
  cx: number, cy: number, cr: number,
): boolean {
  const nx = Math.max(rx, Math.min(cx, rx + rw));
  const ny = Math.max(ry, Math.min(cy, ry + rh));
  return (cx - nx) ** 2 + (cy - ny) ** 2 <= cr * cr;
}
```

`rectCircle` está em `ORIG/items.js:354-358` — copie o corpo real de lá se ele diferir deste; o teste acima vale para a versão clássica de "ponto mais próximo do retângulo".

- [ ] **Step 4: Rodar**

Run: `npx vitest run && npm run lint && npx tsc --noEmit`
Expected: todos passam.

- [ ] **Step 5: Commit**

```bash
git add src/sim/arena.ts tests/arena.test.ts
git commit -m "feat(sim): arena determinística no mundo fixo

Obstaculos e armadilhas passam a ser gerados sobre WORLD com o rng
semeado; o ciclo dos espinhos vem de world.tick em vez de
performance.now(). As contagens escalam pela area para preservar a
densidade original.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 9: Jogador — criação, movimento e dano recebido

Aqui o `step()` ganha sua primeira etapa real e os dois testes de determinismo adiados na Task 4 passam a ter dentes.

**Files:**
- Create: `src/sim/player.ts`
- Modify: `src/sim/step.ts`, `tests/determinism.test.ts` (remover os `it.skip`)
- Test: `tests/player.test.ts`

**Interfaces:**
- Consumes: `baseStats`, `recalcStats`, `startWeapon`, `maxStamina` (Task 7); `emptyEquipment` (Task 6); `resolveObstacles`, `trapDangerous` (Task 8); `CLASS_DEFS` (Task 5)
- Produces: `createPlayer(world, id, cls, name): Player`, `updatePlayer(world, p, input): void`, `damagePlayer(world, p, raw): void`

- [ ] **Step 1: Escrever `tests/player.test.ts` falhando**

```ts
import { describe, it, expect } from 'vitest';
import { makeTestWorld, noInput } from './helpers';
import { createPlayer, updatePlayer, damagePlayer } from '../src/sim/player';
import { generateArena } from '../src/sim/arena';
import { WORLD } from '../src/sim/constants';
import type { InputState, World, Player } from '../src/sim/types';

function setup(): { w: World; p: Player } {
  const w = makeTestWorld();
  const p = createPlayer(w, 'p1', 'mage', 'TEST');
  return { w, p };
}

function moveInput(x: number, y: number, extra: Partial<InputState> = {}): InputState {
  return { ...noInput(0), move: { x, y }, ...extra };
}

describe('createPlayer', () => {
  it('nasce no centro do mundo com a arma inicial da classe', () => {
    const { w, p } = setup();
    expect(p.x).toBe(WORLD.w / 2);
    expect(p.y).toBe(WORLD.h / 2);
    expect(p.weapon.attack).toBe('bolt');
    expect(w.players.p1).toBe(p);
  });

  it('entra com hp cheio e stats derivados', () => {
    const { p } = setup();
    expect(p.hp).toBe(p.maxHp);
    expect(p.maxHp).toBe(100);
    expect(p.level).toBe(1);
  });

  it('aplica os perks de forge na camada permanente', () => {
    const w = makeTestWorld();
    w.config.forge = { vigor: 2, honed: 3, fleet: 1, startgold: 2, merchant: 0, wise: 0 };
    const p = createPlayer(w, 'p1', 'mage', 'T');
    expect(p.maxHp).toBe(120);        // 100 + 2 * 10
    expect(p.permStats.dmgPct).toBe(6);  // 3 * 2
    expect(p.permStats.speedPct).toBe(2); // 1 * 2
    expect(p.gold).toBe(30);          // 2 * 15
  });
});

describe('updatePlayer — movimento', () => {
  it('anda na direção do input', () => {
    const { w, p } = setup();
    const x0 = p.x;
    updatePlayer(w, p, moveInput(1, 0));
    expect(p.x).toBeGreaterThan(x0);
    expect(p.y).toBe(WORLD.h / 2);
  });

  it('não anda sem input e marca moving = false', () => {
    const { w, p } = setup();
    const before = { x: p.x, y: p.y };
    updatePlayer(w, p, moveInput(0, 0));
    expect(p.x).toBe(before.x);
    expect(p.y).toBe(before.y);
    expect(p.moving).toBe(false);
  });

  it('fica preso dentro dos limites de jogo', () => {
    const { w, p } = setup();
    for (let i = 0; i < 2000; i++) updatePlayer(w, p, moveInput(-1, -1));
    expect(p.x).toBeGreaterThanOrEqual(w.play.left + 10);
    expect(p.y).toBeGreaterThanOrEqual(w.play.top + 10);
    for (let i = 0; i < 4000; i++) updatePlayer(w, p, moveInput(1, 1));
    expect(p.x).toBeLessThanOrEqual(w.play.right - 10);
    expect(p.y).toBeLessThanOrEqual(w.play.bottom - 10);
  });

  it('não atravessa uma coluna: fica na borda dela', () => {
    const { w, p } = setup();
    const col = { kind: 'column' as const, x: p.x + 20, y: p.y, r: 16, hp: Infinity, dead: false };
    w.obstacles = [col];
    for (let i = 0; i < 60; i++) updatePlayer(w, p, moveInput(1, 0));
    // pushed to exactly r + playerRadius = 16 + 10 away, never inside
    expect(Math.hypot(p.x - col.x, p.y - col.y)).toBeCloseTo(26, 5);
  });
});

describe('updatePlayer — stamina', () => {
  it('correr drena stamina e acelera', () => {
    const { w, p } = setup();
    const slow = { ...p, x: p.x };
    updatePlayer(w, p, moveInput(1, 0, { sprint: true }));
    expect(p.stamina).toBeLessThan(100);
    expect(p.sprinting).toBe(true);
    expect(p.x - slow.x).toBeGreaterThan(0);
  });

  it('sem stamina não corre', () => {
    const { w, p } = setup();
    p.stamina = 0;
    updatePlayer(w, p, moveInput(1, 0, { sprint: true }));
    expect(p.sprinting).toBe(false);
  });

  it('parar de correr regenera stamina', () => {
    const { w, p } = setup();
    p.stamina = 50;
    for (let i = 0; i < 60; i++) updatePlayer(w, p, moveInput(0, 0));
    expect(p.stamina).toBeGreaterThan(50);
    expect(p.stamina).toBeLessThanOrEqual(100);
  });
});

describe('updatePlayer — regeneração e temporizadores', () => {
  it('hpRegen cura ao longo do tempo, sem passar do máximo', () => {
    const { w, p } = setup();
    p.permStats.hpRegen = 5;
    p.hp = 50;
    for (let i = 0; i < 120; i++) updatePlayer(w, p, noInput(i));
    expect(p.hp).toBeGreaterThan(50);
    expect(p.hp).toBeLessThanOrEqual(p.maxHp);
  });

  it('invencibilidade e cooldown de especial decaem por tick', () => {
    const { w, p } = setup();
    p.invincible = 600;
    p.specialTimer = 8000;
    updatePlayer(w, p, noInput(0));
    expect(p.invincible).toBeCloseTo(600 - 1000 / 60, 5);
    expect(p.specialTimer).toBeCloseTo(8000 - 1000 / 60, 5);
  });

  it('armadilha ativa machuca quem pisa nela', () => {
    const { w, p } = setup();
    w.tick = 27 * 2; // spikes out
    w.traps = [{ x: p.x, y: p.y, offset: 0 }];
    updatePlayer(w, p, noInput(0));
    expect(p.hp).toBeLessThan(p.maxHp);
  });
});

describe('damagePlayer', () => {
  it('armadura reduz o dano pela fórmula armor/(armor+15)', () => {
    const { w, p } = setup();
    p.permStats.armor = 15;
    p.stats.armor = 15;
    damagePlayer(w, p, 100);
    expect(p.hp).toBe(p.maxHp - 50);
  });

  it('nunca causa menos de 1 de dano', () => {
    const { w, p } = setup();
    p.stats.armor = 10000;
    damagePlayer(w, p, 1);
    expect(p.hp).toBe(p.maxHp - 1);
  });

  it('respeita invencibilidade', () => {
    const { w, p } = setup();
    p.invincible = 500;
    damagePlayer(w, p, 50);
    expect(p.hp).toBe(p.maxHp);
  });

  it('dodge a 100% anula o golpe e emite DODGE', () => {
    const { w, p } = setup();
    p.stats.dodge = 100; // capped at 60 by the formula
    let dodged = 0;
    for (let i = 0; i < 200; i++) {
      p.invincible = 0;
      p.hp = p.maxHp;
      damagePlayer(w, p, 10);
      if (p.hp === p.maxHp) dodged++;
    }
    expect(dodged).toBeGreaterThan(80);  // ~60% of 200
    expect(dodged).toBeLessThan(160);
  });

  it('block é limitado a 75%', () => {
    const { w, p } = setup();
    p.stats.block = 999;
    let blocked = 0;
    for (let i = 0; i < 400; i++) {
      p.invincible = 0;
      p.hp = p.maxHp;
      damagePlayer(w, p, 10);
      if (p.hp === p.maxHp) blocked++;
    }
    expect(blocked).toBeGreaterThan(240); // ~75% of 400
    expect(blocked).toBeLessThan(360);
  });

  it('hp zerado leva o mundo para gameover', () => {
    const { w, p } = setup();
    p.hp = 1;
    damagePlayer(w, p, 999);
    expect(p.hp).toBe(0);
    expect(w.phase).toBe('gameover');
  });
});
```

- [ ] **Step 2: Rodar para ver falhar**

Run: `npx vitest run tests/player.test.ts`
Expected: FALHA — módulo não encontrado.

- [ ] **Step 3: Implementar `src/sim/player.ts`**

Porte de `ORIG/engine.js:170-215` (criação), `ORIG/combat.js:22-97` (update) e `ORIG/entities.js:265-292` (dano), aplicando T1–T6:

```ts
// player.ts — creation, per-tick update and the incoming-damage pipeline.
import { emit, setPhase } from './world';
import { DT_MS, TICK_FACTOR, WORLD, STAMINA_BASE, SPRINT_MULT, FATIGUE_MULT, STAMINA_DRAIN, STAMINA_REGEN } from './constants';
import { CLASS_DEFS } from './defs/classes';
import { emptyEquipment } from './equipment';
import { baseStats, recalcStats, startWeapon, maxStamina } from './stats';
import { resolveObstacles, trapDangerous } from './arena';
import type { ClassKey, InputState, Player, World } from './types';

export function createPlayer(world: World, id: string, cls: ClassKey, name: string): Player {
  const def = CLASS_DEFS[cls];
  const weapon = startWeapon(cls);
  const forge = world.config.forge;

  const p: Player = {
    id, name, cls,
    x: WORLD.w / 2, y: WORLD.h / 2, w: 20, h: 20,
    hp: 0, maxHp: 0,
    speed: def.speed,
    stamina: STAMINA_BASE, sprinting: false,
    invincible: 0, specialTimer: 0, attackTimer: 0,
    regenAcc: 0, dustTimer: 0,
    facing: 0, moving: false, walkFrame: 0, walkTimer: 0,
    level: 1, xp: 0, xpNext: 100,
    gold: forge.startgold * 15,
    equipment: emptyEquipment(),
    weapon,
    permStats: baseStats(),
    permMaxHp: def.hp,
    stats: baseStats(),
    pendingLevelUps: 0,
    levelChoices: [],
  };

  p.equipment.weapon = weapon;

  // forge perks feed the permanent layer
  p.permMaxHp += forge.vigor * 10;
  p.permStats.dmgPct += forge.honed * 2;
  p.permStats.speedPct += forge.fleet * 2;

  recalcStats(p);
  p.hp = p.maxHp;

  world.players[id] = p;
  return p;
}

export function updatePlayer(world: World, p: Player, input: InputState): void {
  if (p.invincible > 0) p.invincible -= DT_MS;
  if (p.specialTimer > 0) p.specialTimer -= DT_MS;
  if (p.attackTimer > 0) p.attackTimer -= DT_MS;

  // passive HP regen: 0.2 HP/s per point, fractional carry
  if (p.stats.hpRegen > 0 && p.hp < p.maxHp) {
    p.regenAcc += (DT_MS / 1000) * 0.2 * p.stats.hpRegen;
    if (p.regenAcc >= 1) {
      const heal = Math.floor(p.regenAcc);
      p.regenAcc -= heal;
      p.hp = Math.min(p.maxHp, p.hp + heal);
    }
  }

  // The input arrives already normalized; app/input handles keyboard vs analog.
  const dx = input.move.x;
  const dy = input.move.y;

  p.moving = dx !== 0 || dy !== 0;
  if (p.moving) {
    p.walkTimer += DT_MS;
    if (p.walkTimer > 120) { p.walkFrame = (p.walkFrame + 1) % 4; p.walkTimer = 0; }
  }

  // stamina: sprint drains, recovery slows you to 70%
  const wantSprint = input.sprint && p.moving && p.stamina > 0;
  let staminaMult = 1;
  if (wantSprint) {
    p.sprinting = true;
    p.stamina = Math.max(0, p.stamina - (STAMINA_DRAIN * DT_MS) / 1000);
    staminaMult = SPRINT_MULT;
    p.dustTimer += DT_MS;
    if (p.dustTimer > 90) {
      p.dustTimer = 0;
      emit(world, { t: 'particles', x: p.x - dx * 12, y: p.y + 14, color: 'rgba(180,170,150,0.8)', count: 2 });
    }
  } else {
    p.sprinting = false;
    if (p.stamina < maxStamina(p)) {
      p.stamina = Math.min(maxStamina(p), p.stamina + (STAMINA_REGEN * DT_MS) / 1000);
      staminaMult = FATIGUE_MULT;
    }
  }

  const effSpeed = p.speed * (1 + p.stats.speedPct / 100) * staminaMult;
  const nx = p.x + dx * effSpeed * TICK_FACTOR;
  const ny = p.y + dy * effSpeed * TICK_FACTOR;
  const margin = 10;
  p.x = Math.max(world.play.left + margin, Math.min(world.play.right - margin, nx));
  p.y = Math.max(world.play.top + margin, Math.min(world.play.bottom - margin, ny));
  resolveObstacles(p, 10, world);

  for (const tr of world.traps) {
    if (trapDangerous(world, tr) && Math.hypot(p.x - tr.x, p.y - tr.y) < 18) damagePlayer(world, p, 10);
  }

  // aim is decided by app/input (mouse, or nearest enemy under auto-aim)
  p.facing = input.aim;
}

export function damagePlayer(world: World, p: Player, raw: number): void {
  if (p.invincible > 0) return;
  p.invincible = 600;
  const st = p.stats;

  if (world.rng.chance(Math.min(60, st.dodge) / 100)) {
    emit(world, { t: 'float', x: p.x, y: p.y - 26, text: 'DODGE', color: '#3498db' });
    emit(world, { t: 'sfx', name: 'dodge' });
    return;
  }

  // shield block: a flat chance (capped) to fully negate the hit
  if (st.block > 0 && world.rng.chance(Math.min(75, st.block) / 100)) {
    emit(world, { t: 'float', x: p.x, y: p.y - 26, text: 'BLOCK', color: '#aab7c4' });
    emit(world, { t: 'sfx', name: 'dodge' });
    return;
  }

  const dmg = Math.max(1, Math.round(raw * (1 - st.armor / (st.armor + 15))));
  p.hp -= dmg;
  emit(world, { t: 'particles', x: p.x, y: p.y, color: '#ff0000', count: 8 });
  emit(world, { t: 'float', x: p.x, y: p.y - 30, text: '-' + dmg, color: '#e74c3c' });
  emit(world, { t: 'shake', mag: 6, dur: 220 });
  emit(world, { t: 'hurtFlash' });
  emit(world, { t: 'sfx', name: 'hurt' });

  if (p.hp <= 0) {
    p.hp = 0;
    setPhase(world, 'gameover');
  }
}
```

Note a mudança de ordem em `damagePlayer`: o original consulta `dodge` **antes** de `block` — preservado. E o `invincible = 600` é atribuído antes das checagens, como no original, então um golpe esquivado também concede o período de invencibilidade.

- [ ] **Step 4: Ligar no `step()`**

```ts
// src/sim/step.ts
import { updatePlayer } from './player';
import type { InputState, SimEvent, World } from './types';

export function step(world: World, inputs: Record<string, InputState>): void {
  world.tick++;
  for (const id of Object.keys(world.players)) {
    const input = inputs[id];
    if (input) updatePlayer(world, world.players[id], input);
  }
}
```

Iterar por `Object.keys(world.players)` (e não por `Object.values`) mantém a ordem de inserção explícita — determinismo depende de ordem estável de iteração.

- [ ] **Step 5: Reativar os testes de determinismo adiados**

Em `tests/determinism.test.ts`, remova os `it.skip` dos dois testes marcados na Task 4 e faça os quatro criarem um jogador antes de rodar os ticks:

```ts
import { createPlayer } from '../src/sim/player';
// ...dentro de cada teste, logo após makeTestWorld():
createPlayer(w, 'p1', 'mage', 'T');
```

- [ ] **Step 6: Rodar tudo**

Run: `npx vitest run && npm run lint && npx tsc --noEmit`
Expected: todos passam, incluindo os quatro de determinismo.

- [ ] **Step 7: Commit**

```bash
git add src/sim/player.ts src/sim/step.ts tests/player.test.ts tests/determinism.test.ts
git commit -m "feat(sim): jogador puro dirigido por InputState

updatePlayer deixa de ler teclado, mouse e performance.now: recebe
um InputState e o passo fixo. damagePlayer emite eventos em vez de
tocar som e mexer no DOM. Os testes de determinismo saem do skip.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 10: Câmera, render base e input — o primeiro jogável

Ao fim desta task dá para andar por um mundo de 2400×1600 com a câmera seguindo. É o marco de confiança do plano: a arquitetura de `sim/` puro + `render/` separado prova que funciona antes de portar combate e inimigos.

**Files:**
- Create: `src/render/camera.ts`, `src/render/sprites.ts`, `src/render/tilemap.ts`, `src/render/entities.ts`, `src/render/index.ts`
- Create: `src/app/input.ts`
- Delete: `src/app/input-stub.ts`
- Modify: `src/main.ts`
- Test: `tests/camera.test.ts`

**Interfaces:**
- Consumes: `World`, `Player`, `WORLD`, `TILE` (Tasks 3/5), `createPlayer` (Task 9), `generateArena` (Task 8)
- Produces:
  - `createCamera(): Camera`, `updateCamera(cam, target, viewW, viewH): void`, `worldToScreen(cam, x, y): {x,y}`, `isVisible(cam, x, y, pad): boolean`
  - `Camera = { x: number; y: number; w: number; h: number }` — `x`/`y` são o canto superior esquerdo do enquadramento, em coordenadas de mundo
  - `loadSprites(): Promise<void>`, `SHEET`, `ANIMS`, `WEAPON_SPRITES`, `FLOOR_TILES`, `WALL_TILES`, `recolorPlayerSheet(cls, rgb)`
  - `buildTilemap(): void` (pré-renderiza o piso do mundo inteiro num canvas offscreen)
  - `render(world, cam, alpha, ctx): void`
  - `createInput(canvas, world, localId, cam): { collect(tick: number): Record<string, InputState> }`

- [ ] **Step 1: Escrever `tests/camera.test.ts` falhando**

```ts
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

  it('não passa da borda esquerda/superior do mundo', () => {
    const cam = createCamera();
    updateCamera(cam, { x: 10, y: 10 }, 800, 600);
    expect(cam.x).toBe(0);
    expect(cam.y).toBe(0);
  });

  it('não passa da borda direita/inferior do mundo', () => {
    const cam = createCamera();
    updateCamera(cam, { x: WORLD.w, y: WORLD.h }, 800, 600);
    expect(cam.x).toBe(WORLD.w - 800);
    expect(cam.y).toBe(WORLD.h - 600);
  });

  it('centra o mundo quando a viewport é maior que ele', () => {
    const cam = createCamera();
    updateCamera(cam, { x: 100, y: 100 }, WORLD.w + 400, WORLD.h + 200);
    expect(cam.x).toBe(-200);
    expect(cam.y).toBe(-100);
  });

  it('converte mundo para tela subtraindo a câmera', () => {
    const cam = createCamera();
    updateCamera(cam, { x: 1200, y: 800 }, 800, 600);
    expect(worldToScreen(cam, 1200, 800)).toEqual({ x: 400, y: 300 });
  });

  it('isVisible respeita o padding', () => {
    const cam = createCamera();
    updateCamera(cam, { x: 1200, y: 800 }, 800, 600);
    expect(isVisible(cam, 1200, 800, 0)).toBe(true);
    expect(isVisible(cam, 0, 0, 0)).toBe(false);
    expect(isVisible(cam, cam.x - 30, 800, 64)).toBe(true);
  });
});
```

- [ ] **Step 2: Rodar para ver falhar**

Run: `npx vitest run tests/camera.test.ts`
Expected: FALHA — módulo não encontrado.

- [ ] **Step 3: Implementar `src/render/camera.ts`**

```ts
// camera.ts — the viewport into the fixed world. Pure math, unit-testable.
import { WORLD } from '../sim/constants';

export type Camera = { x: number; y: number; w: number; h: number };

export function createCamera(): Camera {
  return { x: 0, y: 0, w: 0, h: 0 };
}

/**
 * Centres on target, clamped to the world. When the viewport is larger than
 * the world, the world is centred instead (negative camera origin).
 */
export function updateCamera(cam: Camera, target: { x: number; y: number }, viewW: number, viewH: number): void {
  cam.w = viewW;
  cam.h = viewH;
  cam.x = viewW >= WORLD.w ? (WORLD.w - viewW) / 2 : clamp(target.x - viewW / 2, 0, WORLD.w - viewW);
  cam.y = viewH >= WORLD.h ? (WORLD.h - viewH) / 2 : clamp(target.y - viewH / 2, 0, WORLD.h - viewH);
}

export function worldToScreen(cam: Camera, x: number, y: number): { x: number; y: number } {
  return { x: x - cam.x, y: y - cam.y };
}

/** Culling test: is this world point inside the viewport, with `pad` slack? */
export function isVisible(cam: Camera, x: number, y: number, pad = 0): boolean {
  return x >= cam.x - pad && x <= cam.x + cam.w + pad
      && y >= cam.y - pad && y <= cam.y + cam.h + pad;
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}
```

- [ ] **Step 4: Portar sprites e tilemap**

`src/render/sprites.ts` — porte de `ORIG/config.js:1-95` e `:172-248`: `SHEET`, `COP_SHEET`, `ANIMS`, `frames()`, `MIMIC_F`, `FLASK_RED`, `CHEST_FRAMES`, `CHEST_EMPTY`, `COIN_FRAMES`, `WEAPON_SPRITES`, `FLOOR_TILES`, `WALL_TILES`, `OBSTACLE_SPRITES`, `SPIKE_FRAMES`, `OUTFIT_COLORS`, `CLASS_REGION`, `playerSheet`, `recolorPlayerSheet`, `lum`. Duas mudanças: os caminhos de imagem passam a apontar para `/DungeonGuys2/assets/...` (use `import.meta.env.BASE_URL`), e `loadSprites()` devolve uma `Promise` que resolve quando `SHEET` e `COP_SHEET` terminam de carregar — o original dependia de `SHEET.complete` ser checado a cada frame.

```ts
export function loadSprites(): Promise<void> {
  const wait = (img: HTMLImageElement) =>
    img.complete && img.naturalWidth > 0
      ? Promise.resolve()
      : new Promise<void>(res => { img.onload = () => res(); img.onerror = () => res(); });
  return Promise.all([wait(SHEET), wait(COP_SHEET)]).then(() => undefined);
}
```

`src/render/tilemap.ts` — porte de `ORIG/engine.js:62-158` (`buildTileMap` + `renderFloorCanvas`), com T6: as dimensões vêm de `WORLD`, não do canvas, e a função roda **uma vez** por run em vez de a cada resize. A variação de tile continua usando `Math.random()` — é cosmética e vive em `render/` (T3). Exporte `buildTilemap(): void` e `drawTiles(ctx, cam): void`, onde `drawTiles` faz um único `drawImage` da região visível do canvas offscreen:

```ts
export function drawTiles(ctx: CanvasRenderingContext2D, cam: Camera): void {
  if (!floorCanvas) return;
  ctx.drawImage(floorCanvas, cam.x, cam.y, cam.w, cam.h, 0, 0, cam.w, cam.h);
}
```

Cuidado com o tamanho: `WORLD.w * WORLD.h * 4` bytes ≈ 15 MB. Se o canvas offscreen falhar em algum dispositivo, o `drawImage` vira no-op — por isso o guard `if (!floorCanvas)`.

- [ ] **Step 5: Implementar `src/render/entities.ts` e `src/render/index.ts` (apenas o jogador, por ora)**

Porte de `ORIG/render.js:258-310` (`drawPlayer`, `drawHeldWeapon`), com a única mudança de aplicar a câmera: toda coordenada de desenho passa por `worldToScreen`. O restante das funções de desenho entra na Task 17.

```ts
// src/render/index.ts
import { drawTiles } from './tilemap';
import { drawPlayer } from './entities';
import type { Camera } from './camera';
import type { World } from '../sim/types';

export function render(world: World, cam: Camera, alpha: number, ctx: CanvasRenderingContext2D): void {
  ctx.imageSmoothingEnabled = false;
  ctx.clearRect(0, 0, cam.w, cam.h);
  drawTiles(ctx, cam);
  for (const id of Object.keys(world.players)) drawPlayer(ctx, cam, world.players[id]);
  void alpha; // interpolation of remote entities arrives in Marco 2
}
```

O `alpha` é aceito e ignorado por enquanto: com um jogador local e simulação a 60Hz o ganho é marginal, e interpolar posições exige guardar o estado anterior — trabalho que só se paga no Marco 2. Manter o parâmetro na assinatura evita mudar todos os chamadores depois.

- [ ] **Step 6: Implementar `src/app/input.ts`**

Esta é a peça que mantém `sim/` puro: tudo que é teclado, mouse, toque, auto-aim e "atirar segurando" é resolvido aqui e sai como um `InputState`.

```ts
// input.ts — turns keyboard/mouse/touch plus world context into an InputState.
import { worldToScreen, type Camera } from '../render/camera';
import type { InputState, World } from '../sim/types';

export function createInput(canvas: HTMLCanvasElement, world: World, localId: string, cam: Camera) {
  const keys: Record<string, boolean> = {};
  const mouse = { x: 0, y: 0 };
  let mouseDown = false;
  let specialQueued = false;

  addEventListener('keydown', e => {
    if ((e.target as HTMLElement)?.tagName === 'INPUT') return;
    keys[e.code] = true;
    if (e.code === 'KeyE') specialQueued = true;
    if (e.code === 'Space' || e.code.startsWith('Arrow')) e.preventDefault();
  });
  addEventListener('keyup', e => { keys[e.code] = false; });
  canvas.addEventListener('mousemove', e => { mouse.x = e.clientX; mouse.y = e.clientY; });
  canvas.addEventListener('mousedown', e => {
    if (e.button === 0) mouseDown = true;
    if (e.button === 2) specialQueued = true;
  });
  addEventListener('mouseup', e => { if (e.button === 0) mouseDown = false; });
  canvas.addEventListener('contextmenu', e => e.preventDefault());

  /** Aim at the mouse, or at the nearest enemy when auto-aim is on. */
  function aimAngle(): number {
    const p = world.players[localId];
    if (!p) return 0;
    const s = worldToScreen(cam, p.x, p.y);
    return Math.atan2(mouse.y - s.y, mouse.x - s.x);
  }

  return {
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
      }
      const input: InputState = {
        tick,
        move: { x, y },
        aim: aimAngle(),
        attack: mouseDown || !!keys['Space'] || !!keys['KeyZ'],
        special: specialQueued,
        sprint: !!(keys['ShiftLeft'] || keys['ShiftRight']),
      };
      specialQueued = false; // edge-triggered: one cast per press
      return { [localId]: input };
    },
  };
}
```

Auto-aim e o auto-ataque do touch dependem da lista de inimigos e entram na Task 12, quando existirem inimigos — este arquivo ganha `nearestEnemy(world, p)` lá.

- [ ] **Step 7: Ligar tudo em `src/main.ts`**

```ts
import './style.css';
import { createWorld } from './sim/world';
import { drainEvents } from './sim/step';
import { createPlayer } from './sim/player';
import { generateArena } from './sim/arena';
import { startLoop } from './app/loop';
import { createInput } from './app/input';
import { createCamera, updateCamera } from './render/camera';
import { loadSprites } from './render/sprites';
import { buildTilemap } from './render/tilemap';
import { render } from './render/index';

const canvas = document.getElementById('game-canvas') as HTMLCanvasElement;
const ctx = canvas.getContext('2d')!;

function resize() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  ctx.imageSmoothingEnabled = false;
}
resize();
addEventListener('resize', resize);

await loadSprites();

const world = createWorld({
  seed: 20260827, mode: 'campaign', classKey: 'mage', playerName: 'DEV',
  forge: { vigor: 0, honed: 0, fleet: 0, startgold: 0, merchant: 0, wise: 0 },
});
generateArena(world);
buildTilemap();
const player = createPlayer(world, 'p1', 'mage', 'DEV');

const cam = createCamera();
const input = createInput(canvas, world, 'p1', cam);

startLoop(world, {
  collectInputs: tick => input.collect(tick),
  afterStep: w => { drainEvents(w); },
  render: (w, alpha) => {
    updateCamera(cam, player, canvas.width, canvas.height);
    render(w, cam, alpha, ctx);
  },
});
```

- [ ] **Step 8: Verificar no navegador**

Run: `npm run dev`
Expected, tudo verificado à mão:
1. O mago aparece no centro e anda com WASD e com as setas.
2. A câmera segue e **para** nas bordas do mundo — ande até cada um dos quatro cantos e confirme que a parede fica encostada na borda da tela.
3. Segurar Shift acelera; a stamina esgota e a velocidade cai enquanto ela regenera.
4. O personagem não atravessa colunas nem caixas.
5. Redimensionar a janela muda o enquadramento e **não** regenera a arena (os obstáculos ficam nos mesmos lugares do mundo).
6. Console sem erros.

O item 5 é o que prova a T6: no jogo original, redimensionar reconstruía o mundo inteiro.

- [ ] **Step 9: Commit**

```bash
rm src/app/input-stub.ts
npm test && npm run lint && npx tsc --noEmit
git add -A
git commit -m "feat(render): camera, tilemap do mundo e input real — primeiro jogavel

O mundo passa a ter 2400x1600 fixos com a camera seguindo o jogador e
presa as bordas. Redimensionar a janela so muda o enquadramento.
InputState e montado em app/input, mantendo sim/ sem teclado e mouse.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 11: Combate do jogador — ataque, projéteis e pipeline de dano

**Files:**
- Create: `src/sim/combat.ts`, `src/sim/bullets.ts`
- Modify: `src/sim/step.ts`, `src/sim/player.ts` (chamar `attack` quando `input.attack`)
- Test: `tests/combat.test.ts`

**Interfaces:**
- Consumes: `Player`, `Enemy`, `Bullet`, `World`; `damageCrate`, `rectCircle` (Task 8); `playerDmgKind` (Task 7)
- Produces:
  - `attack(world, p): void` — respeita `p.attackTimer`
  - `fireProjectile(world, p, angle, type, w): void`
  - `meleeAttack(world, p, angle, w): void`
  - `dealDamage(world, p, e, damage, kind, fx?, fy?): void`
  - `applyBurn(e, dps, dur)`, `applyPoison(e, dps, dur)`
  - `updateBullets(world): void`, `explode(world, b): void`

**Mudança de assinatura deliberada:** `dealDamage` no original lê o `player` global. Aqui ele recebe o jogador atacante. Isso é o que permite, no Marco 3, creditar kill, ouro e lifesteal a quem de fato bateu — e não custa nada agora.

- [ ] **Step 1: Escrever `tests/combat.test.ts` falhando**

```ts
import { describe, it, expect } from 'vitest';
import { makeTestWorld } from './helpers';
import { createPlayer } from '../src/sim/player';
import { attack, dealDamage, fireProjectile, meleeAttack } from '../src/sim/combat';
import { updateBullets } from '../src/sim/bullets';
import { makeEnemy } from '../src/sim/enemies';
import type { Enemy, Player, World } from '../src/sim/types';

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

describe('attack', () => {
  it('respeita o cooldown da arma', () => {
    const { w, p } = setup();
    attack(w, p);
    expect(w.bullets).toHaveLength(1);
    attack(w, p);
    expect(w.bullets).toHaveLength(1); // still cooling down
    p.attackTimer = 0;
    attack(w, p);
    expect(w.bullets).toHaveLength(2);
  });

  it('atkSpeedPct encurta o cooldown', () => {
    const { w, p } = setup();
    attack(w, p);
    const slow = p.attackTimer;
    p.attackTimer = 0;
    p.stats.atkSpeedPct = 100;
    attack(w, p);
    expect(p.attackTimer).toBeCloseTo(slow / 2, 5);
  });

  it('armas com count > 1 abrem um leque', () => {
    const w = makeTestWorld();
    const p = createPlayer(w, 'p1', 'archer', 'T');
    p.weapon = { ...p.weapon, count: 3 };
    attack(w, p);
    expect(w.bullets).toHaveLength(3);
    const angles = w.bullets.map(b => b.angle);
    expect(new Set(angles).size).toBe(3);
  });

  it('arma melee não cria projétil', () => {
    const w = makeTestWorld();
    const p = createPlayer(w, 'p1', 'warrior', 'T');
    attack(w, p);
    expect(w.bullets).toHaveLength(0);
    expect(w.events.some(e => e.t === 'swing')).toBe(true);
  });
});

describe('fireProjectile', () => {
  it('marca o dono e herda o alcance da arma mais a stat range', () => {
    const { w, p } = setup();
    p.stats.range = 50;
    fireProjectile(w, p, 0, 'bolt', p.weapon);
    expect(w.bullets[0].owner).toBe('p1');
    expect(w.bullets[0].range).toBe(p.weapon.range + 50);
  });
});

describe('meleeAttack', () => {
  it('acerta quem está dentro do arco e do alcance', () => {
    const w = makeTestWorld();
    const p = createPlayer(w, 'p1', 'warrior', 'T');
    const e = enemyAt(w, p.x + 30, p.y);
    const hp0 = e.hp;
    meleeAttack(w, p, 0, p.weapon);
    expect(e.hp).toBeLessThan(hp0);
  });

  it('não acerta quem está atrás', () => {
    const w = makeTestWorld();
    const p = createPlayer(w, 'p1', 'warrior', 'T');
    const e = enemyAt(w, p.x - 30, p.y);
    const hp0 = e.hp;
    meleeAttack(w, p, 0, p.weapon);
    expect(e.hp).toBe(hp0);
  });

  it('não acerta quem está fora do alcance', () => {
    const w = makeTestWorld();
    const p = createPlayer(w, 'p1', 'warrior', 'T');
    const e = enemyAt(w, p.x + 500, p.y);
    const hp0 = e.hp;
    meleeAttack(w, p, 0, p.weapon);
    expect(e.hp).toBe(hp0);
  });

  it('empurra o alvo para longe', () => {
    const w = makeTestWorld();
    const p = createPlayer(w, 'p1', 'warrior', 'T');
    const e = enemyAt(w, p.x + 30, p.y);
    meleeAttack(w, p, 0, p.weapon);
    expect(e.x).toBeGreaterThan(p.x + 30);
  });

  it('quebra caixas dentro do arco', () => {
    const w = makeTestWorld();
    const p = createPlayer(w, 'p1', 'warrior', 'T');
    const crate = { kind: 'crate' as const, x: p.x + 30, y: p.y, r: 14, hp: 40, dead: false };
    w.obstacles = [crate];
    meleeAttack(w, p, 0, p.weapon);
    expect(crate.hp).toBeLessThan(40);
  });
});

describe('dealDamage', () => {
  it('soma dano plano por tipo de arma e a % de dano', () => {
    const { w, p } = setup();
    p.stats.elementalDmg = 10;
    p.stats.dmgPct = 100;
    p.stats.crit = 0;
    const e = enemyAt(w, 100, 100);
    const hp0 = e.hp;
    dealDamage(w, p, e, [10, 10], 'bolt');
    // (10 + 10) * 2 = 40
    expect(hp0 - e.hp).toBe(40);
  });

  it('crítico a 100% dobra e anuncia', () => {
    const { w, p } = setup();
    p.stats.crit = 100;
    const e = enemyAt(w, 100, 100);
    const hp0 = e.hp;
    dealDamage(w, p, e, [10, 10], 'bolt');
    expect(hp0 - e.hp).toBe(20);
    expect(w.events.some(ev => ev.t === 'float' && ev.text.endsWith('!'))).toBe(true);
  });

  it('nunca causa menos de 1', () => {
    const { w, p } = setup();
    p.stats.dmgPct = -1000;
    p.stats.crit = 0;
    const e = enemyAt(w, 100, 100);
    const hp0 = e.hp;
    dealDamage(w, p, e, [1, 1], 'bolt');
    expect(hp0 - e.hp).toBe(1);
  });

  it('lifesteal a 100% cura 1 quando ferido', () => {
    const { w, p } = setup();
    p.stats.lifeSteal = 100;
    p.hp = p.maxHp - 5;
    const e = enemyAt(w, 100, 100);
    dealDamage(w, p, e, [1, 1], 'bolt');
    expect(p.hp).toBe(p.maxHp - 4);
  });

  it('burn e chill aplicam seus efeitos quando procam', () => {
    const { w, p } = setup();
    p.stats.burn = 100;
    p.stats.chill = 100;
    const e = enemyAt(w, 100, 100);
    dealDamage(w, p, e, [1, 1], 'bolt');
    expect(e.burnT).toBeGreaterThan(0);
    expect(e.slowT).toBe(1500);
  });

  it('é determinístico com a mesma seed', () => {
    const run = () => {
      const { w, p } = setup();
      p.stats.crit = 40;
      const e = enemyAt(w, 100, 100);
      for (let i = 0; i < 20; i++) dealDamage(w, p, e, [10, 30], 'bolt');
      return e.hp;
    };
    expect(run()).toBe(run());
  });
});

describe('updateBullets', () => {
  it('move o projétil e acumula distância', () => {
    const { w, p } = setup();
    fireProjectile(w, p, 0, 'bolt', p.weapon);
    const x0 = w.bullets[0].x;
    updateBullets(w);
    expect(w.bullets[0].x).toBeGreaterThan(x0);
    expect(w.bullets[0].dist).toBeGreaterThan(0);
  });

  it('some ao passar do alcance', () => {
    const { w, p } = setup();
    fireProjectile(w, p, 0, 'bolt', { ...p.weapon, range: 10 });
    for (let i = 0; i < 20; i++) updateBullets(w);
    expect(w.bullets).toHaveLength(0);
  });

  it('atinge um inimigo uma única vez com pierce 0', () => {
    const { w, p } = setup();
    const e = enemyAt(w, p.x + 20, p.y);
    fireProjectile(w, p, 0, 'bolt', { ...p.weapon, pierce: 0 });
    const hp0 = e.hp;
    for (let i = 0; i < 10; i++) updateBullets(w);
    expect(e.hp).toBeLessThan(hp0);
    expect(w.bullets).toHaveLength(0);
  });

  it('pierce atravessa e não rebate no mesmo alvo', () => {
    const { w, p } = setup();
    const a = enemyAt(w, p.x + 20, p.y);
    const b = enemyAt(w, p.x + 60, p.y);
    fireProjectile(w, p, 0, 'bolt', { ...p.weapon, pierce: 2, damage: [5, 5] as [number, number] });
    for (let i = 0; i < 20; i++) updateBullets(w);
    expect(a.hp).toBeLessThan(a.maxHp);
    expect(b.hp).toBeLessThan(b.maxHp);
  });

  it('some ao sair dos limites do mundo', () => {
    const { w, p } = setup();
    p.x = w.play.right - 5;
    fireProjectile(w, p, 0, 'bolt', p.weapon);
    for (let i = 0; i < 30; i++) updateBullets(w);
    expect(w.bullets).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Rodar para ver falhar**

Run: `npx vitest run tests/combat.test.ts`
Expected: FALHA — módulos não encontrados.

- [ ] **Step 3: Portar `src/sim/combat.ts`**

Origem: `ORIG/combat.js:99-121` (`attack`), `:144-184` (`meleeAttack`), `:305-341` (`dealDamage`), `ORIG/entities.js:293-302` (`applyPoison`, `applyBurn`). Aplique T1–T5, mais estas três mudanças específicas:

1. **`attack` sem relógio.** O original compara `performance.now() - lastShot` com `effRate`. Aqui: se `p.attackTimer > 0`, retorna; senão dispara e faz `p.attackTimer = w.fireRate / (1 + p.stats.atkSpeedPct / 100)`. O decremento por tick já está em `updatePlayer` (Task 9).
2. **`attack` não checa `gameState`.** Quem decide se o mundo está jogando é o `step()`, que só chama o pipeline em `phase === 'playing'`.
3. **`dealDamage` recebe o atacante.** Assinatura `dealDamage(world, p, e, damage, kind, fx?, fy?)`; todo `player.stats` vira `p.stats`, `player.hp` vira `p.hp`, `player.weapon` vira `p.weapon`.

O `spread` de `fireProjectile` (`(Math.random() - 0.5) * 0.04`) **afeta o mundo** — vira `(world.rng.next() - 0.5) * 0.04` (T3), não fica em render.

- [ ] **Step 4: Portar `src/sim/bullets.ts`**

Origem: `ORIG/combat.js:122-143` (`fireProjectile`), `:284-297` (`explode`), `:342-397` (`updateBullets`). Aplique T1–T5, mais:

- `bullets.push({...})` ganha `owner: p.id`;
- `hitIds: new Set()` vira `hitIds: []`, e `b.hitIds.has(e.id)` vira `b.hitIds.includes(e.id)`, `b.hitIds.add(e.id)` vira `b.hitIds.push(e.id)`;
- os limites de tela viram `world.play` (T6);
- `dealDamage(...)` passa a receber `world.players[b.owner]`; se o dono não existir mais, o projétil morre sem dano.

- [ ] **Step 5: Ligar no `step()` e no `updatePlayer`**

Em `updatePlayer`, ao final, depois de `p.facing = input.aim`:

```ts
if (input.attack) attack(world, p);
```

Em `step()`, depois do laço de jogadores:

```ts
updateBullets(world);
```

- [ ] **Step 6: Rodar**

Run: `npx vitest run && npm run lint && npx tsc --noEmit`
Expected: todos passam, incluindo os de determinismo (o `dealDamage` agora consome o rng, então eles têm dentes de verdade).

- [ ] **Step 7: Commit**

```bash
git add src/sim/combat.ts src/sim/bullets.ts src/sim/step.ts src/sim/player.ts tests/combat.test.ts
git commit -m "feat(sim): combate do jogador com dano atribuido ao atacante

dealDamage passa a receber o jogador em vez de ler o global, e os
projeteis carregam o dono. Cooldown de ataque vira contador em ticks
no lugar de performance.now(). hitIds vira array serializavel.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 12: Inimigos — spawn, elites, IA, projéteis inimigos e morte

**Files:**
- Create: `src/sim/enemies.ts`
- Modify: `src/sim/step.ts`, `src/app/input.ts` (auto-aim e auto-ataque do touch)
- Test: `tests/enemies.test.ts`

**Interfaces:**
- Consumes: `ENEMY_DEFS`, `ELITE_TYPES` (Task 5); `dealDamage`, `applyBurn`, `applyPoison` (Task 11); `damagePlayer` (Task 9); `resolveObstacles` (Task 8)
- Produces: `makeEnemy(world, type, x, y): Enemy`, `makeElite(world, e): void`, `spawnEnemy(world, type): void`, `updateEnemies(world): void`, `updateEnemyBullets(world): void`, `killEnemy(world, e, killer?): void`, `selfDetonate(world, e): void`, `nearestPlayer(world, x, y): Player | null`

**Desvio deliberado — onde os inimigos nascem.** O original faz spawn colado na parede da arena, que tinha o tamanho da tela e portanto estava sempre perto do jogador. Num mundo 3× maior, isso faria o jogador esperar dezenas de segundos por inimigos que nascem do outro lado do mapa. O port passa a fazer spawn **num anel ao redor do jogador**, entre `SPAWN_MIN = 420` e `SPAWN_MAX = 620` px, respeitando `world.play` e evitando obstáculos. Com um jogador só, isso reproduz de perto a distância que o original entregava. Com vários (Marco 3), o anel é sorteado ao redor de um jogador escolhido pelo rng.

- [ ] **Step 1: Escrever `tests/enemies.test.ts` falhando**

```ts
import { describe, it, expect } from 'vitest';
import { makeTestWorld } from './helpers';
import { createPlayer } from '../src/sim/player';
import { makeEnemy, makeElite, spawnEnemy, updateEnemies, killEnemy, nearestPlayer } from '../src/sim/enemies';

describe('makeEnemy', () => {
  it('escala hp e velocidade com a wave', () => {
    const w = makeTestWorld();
    w.wave = 1;
    const early = makeEnemy(w, 'skeleton', 0, 0);
    w.wave = 10;
    const late = makeEnemy(w, 'skeleton', 0, 0);
    expect(late.hp).toBeGreaterThan(early.hp);
    expect(late.speed).toBeGreaterThan(early.speed);
  });

  it('a velocidade para de escalar na wave 30', () => {
    const w = makeTestWorld();
    w.wave = 30;
    const a = makeEnemy(w, 'skeleton', 0, 0);
    w.wave = 60;
    const b = makeEnemy(w, 'skeleton', 0, 0);
    expect(b.speed).toBe(a.speed);
  });

  it('recebe um id único', () => {
    const w = makeTestWorld();
    const a = makeEnemy(w, 'skeleton', 0, 0);
    const b = makeEnemy(w, 'skeleton', 0, 0);
    expect(b.id).not.toBe(a.id);
  });

  it('o mutador swarm enfraquece os comuns mas não os chefes', () => {
    const w = makeTestWorld();
    w.wave = 5;
    const normal = makeEnemy(w, 'skeleton', 0, 0);
    const boss = makeEnemy(w, 'zombie_king', 0, 0);
    w.waveMutator = 'swarm';
    expect(makeEnemy(w, 'skeleton', 0, 0).hp).toBeLessThan(normal.hp);
    expect(makeEnemy(w, 'zombie_king', 0, 0).hp).toBe(boss.hp);
  });

  it('frenzy acelera e bounty dobra o ouro', () => {
    const w = makeTestWorld();
    w.wave = 3;
    const base = makeEnemy(w, 'goblin', 0, 0);
    w.waveMutator = 'frenzy';
    expect(makeEnemy(w, 'goblin', 0, 0).speed).toBeCloseTo(base.speed * 1.35, 5);
    w.waveMutator = 'bounty';
    expect(makeEnemy(w, 'goblin', 0, 0).goldDrop).toBe(base.goldDrop * 2);
  });
});

describe('makeElite', () => {
  it('multiplica hp e marca o tipo', () => {
    const w = makeTestWorld();
    const e = makeEnemy(w, 'skeleton', 0, 0);
    const hp0 = e.hp;
    makeElite(w, e);
    expect(e.elite).toBeTruthy();
    expect(e.hp).toBeGreaterThan(hp0);
    expect(e.hp).toBe(e.maxHp);
    expect(e.eliteTint).toMatch(/^#/);
  });
});

describe('spawnEnemy', () => {
  it('nasce num anel ao redor do jogador, não em cima dele', () => {
    const w = makeTestWorld();
    const p = createPlayer(w, 'p1', 'mage', 'T');
    for (let i = 0; i < 50; i++) spawnEnemy(w, 'skeleton');
    for (const e of w.enemies) {
      const d = Math.hypot(e.x - p.x, e.y - p.y);
      expect(d).toBeGreaterThanOrEqual(300);
      expect(e.x).toBeGreaterThanOrEqual(w.play.left);
      expect(e.x).toBeLessThanOrEqual(w.play.right);
      expect(e.y).toBeGreaterThanOrEqual(w.play.top);
      expect(e.y).toBeLessThanOrEqual(w.play.bottom);
    }
  });

  it('é determinístico', () => {
    const run = () => {
      const w = makeTestWorld();
      createPlayer(w, 'p1', 'mage', 'T');
      for (let i = 0; i < 10; i++) spawnEnemy(w, 'goblin');
      return w.enemies.map(e => [Math.round(e.x), Math.round(e.y)]);
    };
    expect(run()).toEqual(run());
  });
});

describe('updateEnemies', () => {
  it('persegue o jogador', () => {
    const w = makeTestWorld();
    const p = createPlayer(w, 'p1', 'mage', 'T');
    const e = makeEnemy(w, 'skeleton', p.x + 400, p.y);
    w.enemies.push(e);
    const d0 = Math.hypot(e.x - p.x, e.y - p.y);
    for (let i = 0; i < 30; i++) updateEnemies(w);
    expect(Math.hypot(e.x - p.x, e.y - p.y)).toBeLessThan(d0);
  });

  it('chill reduz a velocidade enquanto dura', () => {
    const w = makeTestWorld();
    const p = createPlayer(w, 'p1', 'mage', 'T');
    const fast = makeEnemy(w, 'skeleton', p.x + 400, p.y);
    const slow = makeEnemy(w, 'skeleton', p.x + 400, p.y + 200);
    slow.slowT = 5000;
    w.enemies.push(fast, slow);
    const d0 = Math.hypot(slow.x - p.x, slow.y - p.y);
    const f0 = Math.hypot(fast.x - p.x, fast.y - p.y);
    for (let i = 0; i < 30; i++) updateEnemies(w);
    const df = f0 - Math.hypot(fast.x - p.x, fast.y - p.y);
    const ds = d0 - Math.hypot(slow.x - p.x, slow.y - p.y);
    expect(ds).toBeLessThan(df);
  });

  it('burn e poison drenam hp e expiram', () => {
    const w = makeTestWorld();
    createPlayer(w, 'p1', 'mage', 'T');
    const e = makeEnemy(w, 'skeleton', 5000, 5000);
    e.burnT = 200; e.burnDps = 100;
    w.enemies.push(e);
    const hp0 = e.hp;
    for (let i = 0; i < 60; i++) updateEnemies(w);
    expect(e.hp).toBeLessThan(hp0);
    expect(e.burnT).toBeLessThanOrEqual(0);
  });

  it('encosta no jogador e causa dano', () => {
    const w = makeTestWorld();
    const p = createPlayer(w, 'p1', 'mage', 'T');
    w.enemies.push(makeEnemy(w, 'skeleton', p.x + 5, p.y));
    updateEnemies(w);
    expect(p.hp).toBeLessThan(p.maxHp);
  });
});

describe('killEnemy', () => {
  it('marca morto, dá score, ouro e xp e conta o kill', () => {
    const w = makeTestWorld();
    const p = createPlayer(w, 'p1', 'mage', 'T');
    const e = makeEnemy(w, 'skeleton', 100, 100);
    w.enemies.push(e);
    killEnemy(w, e, p);
    expect(e.dead).toBe(true);
    expect(w.score).toBeGreaterThan(0);
    expect(w.runKills).toBe(1);
    expect(w.coins.length).toBeGreaterThan(0);
    expect(p.xp).toBeGreaterThan(0);
  });

  it('não credita duas vezes', () => {
    const w = makeTestWorld();
    const p = createPlayer(w, 'p1', 'mage', 'T');
    const e = makeEnemy(w, 'skeleton', 100, 100);
    w.enemies.push(e);
    killEnemy(w, e, p);
    const score = w.score;
    killEnemy(w, e, p);
    expect(w.score).toBe(score);
  });
});

describe('nearestPlayer', () => {
  it('devolve o mais próximo e ignora os mortos', () => {
    const w = makeTestWorld();
    const a = createPlayer(w, 'a', 'mage', 'A');
    const b = createPlayer(w, 'b', 'mage', 'B');
    a.x = 0; a.y = 0;
    b.x = 1000; b.y = 0;
    expect(nearestPlayer(w, 100, 0)).toBe(a);
    a.hp = 0;
    expect(nearestPlayer(w, 100, 0)).toBe(b);
  });
});
```

- [ ] **Step 2: Rodar para ver falhar**

Run: `npx vitest run tests/enemies.test.ts`
Expected: FALHA — módulo não encontrado.

- [ ] **Step 3: Portar `src/sim/enemies.ts`**

Origem: `ORIG/entities.js:39-58` (`makeElite`), `:174-198` (`spawnEnemy`), `:200-251` (`makeEnemy`), `:252-264` (`selfDetonate`), `:310-426` (`updateEnemies`), `:427-466` (`killEnemy`), `ORIG/combat.js:477+` (`updateEnemyBullets`). Aplique T1–T6, mais:

1. **`makeEnemy` ganha `id: world.nextId++`.**
2. **`spawnEnemy` usa o anel** descrito acima, no lugar do sorteio de lado da parede:

```ts
const SPAWN_MIN = 420;
const SPAWN_MAX = 620;

function spawnPoint(world: World): { x: number; y: number } {
  const anchor = pickSpawnAnchor(world); // a living player, or the world centre
  for (let i = 0; i < 24; i++) {
    const a = world.rng.next() * Math.PI * 2;
    const r = world.rng.range(SPAWN_MIN, SPAWN_MAX);
    const x = anchor.x + Math.cos(a) * r;
    const y = anchor.y + Math.sin(a) * r;
    if (x < world.play.left + 20 || x > world.play.right - 20) continue;
    if (y < world.play.top + 20 || y > world.play.bottom - 20) continue;
    if (world.obstacles.some(o => !o.dead && Math.hypot(x - o.x, y - o.y) < o.r + 24)) continue;
    return { x, y };
  }
  // fallback: clamp a point on the ring into bounds rather than give up
  const a = world.rng.next() * Math.PI * 2;
  return {
    x: Math.max(world.play.left + 20, Math.min(world.play.right - 20, anchor.x + Math.cos(a) * SPAWN_MIN)),
    y: Math.max(world.play.top + 20, Math.min(world.play.bottom - 20, anchor.y + Math.sin(a) * SPAWN_MIN)),
  };
}
```

O laço de tentativas tem limite fixo e um fallback determinístico — nunca pode virar laço infinito nem consumir uma quantidade variável de números do rng, o que quebraria o determinismo.

3. **`updateEnemies` mira `nearestPlayer(world, e.x, e.y)`** em vez do `player` global. Se não houver jogador vivo, o inimigo apenas decai seus temporizadores e não se move.
4. **`killEnemy` recebe o matador** (`killer?: Player`) e credita xp/ouro a ele; sem matador (morte por dano ambiental), o loot cai mas o xp não é creditado. Adicione o guard `if (e.dead) return;` no topo — o teste de duplo crédito cobre isso.
5. **`updateEnemyBullets`** atinge `nearestPlayer` dentro do raio e chama `damagePlayer(world, alvo, dmg)`.

- [ ] **Step 4: Ligar no `step()`**

```ts
export function step(world: World, inputs: Record<string, InputState>): void {
  world.tick++;
  if (world.phase !== 'playing') return;
  for (const id of Object.keys(world.players)) {
    const input = inputs[id];
    if (input) updatePlayer(world, world.players[id], input);
  }
  updateBullets(world);
  updateEnemyBullets(world);
  updateEnemies(world);
}
```

- [ ] **Step 5: Auto-aim e auto-ataque do touch em `src/app/input.ts`**

Agora que existem inimigos, complete `aimAngle()`:

```ts
function nearestEnemy(p: { x: number; y: number }) {
  let best = null, bestD = Infinity;
  for (const e of world.enemies) {
    if (e.dead) continue;
    const d = Math.hypot(e.x - p.x, e.y - p.y);
    if (d < bestD) { bestD = d; best = e; }
  }
  return best;
}

function aimAngle(): number {
  const p = world.players[localId];
  if (!p) return 0;
  if (autoAim) {
    const e = nearestEnemy(p);
    if (e) return Math.atan2(e.y - p.y, e.x - p.x);
  }
  const s = worldToScreen(cam, p.x, p.y);
  return Math.atan2(mouse.y - s.y, mouse.x - s.x);
}
```

E no `collect`, o ataque passa a incluir o auto-ataque do touch: `attack: mouseDown || !!keys['Space'] || !!keys['KeyZ'] || (touchActive && world.enemies.some(e => !e.dead))`.

- [ ] **Step 6: Rodar e verificar no navegador**

Run: `npx vitest run && npm run lint && npx tsc --noEmit && npm run dev`

Para ver inimigos antes da Task 15 (que traz as waves), chame no console: `spawnEnemy(world, 'skeleton')` — exponha `window.__world = world` e os módulos em `main.ts` temporariamente, ou adicione um `for (let i = 0; i < 5; i++) spawnEnemy(world, 'skeleton');` logo após `createPlayer`. Confirme: os esqueletos aparecem a distância, perseguem, encostam e causam dano; atirar neles funciona; eles morrem e derrubam moedas.

Remova esse spawn temporário antes do commit.

- [ ] **Step 7: Commit**

```bash
git add src/sim/enemies.ts src/sim/step.ts src/app/input.ts tests/enemies.test.ts
git commit -m "feat(sim): inimigos com spawn em anel ao redor do jogador

Inimigos ganham id, miram o jogador mais proximo e creditam xp ao
matador. O spawn deixa de colar na parede (que era perto quando a
arena tinha o tamanho da tela) e passa a nascer num anel de 420-620px
ao redor de um jogador, preservando o ritmo original no mundo maior.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 13: Habilidades especiais

**Files:**
- Create: `src/sim/special.ts`
- Modify: `src/sim/player.ts` (disparar quando `input.special`)
- Test: `tests/special.test.ts`

**Interfaces:**
- Consumes: `CLASS_DEFS` (Task 5); `fireProjectile` (Task 11); `dealDamage`, `applyBurn` (Task 11); `nearestPlayer` (Task 12)
- Produces: `castSpecial(world, p): void`

- [ ] **Step 1: Escrever `tests/special.test.ts` falhando**

```ts
import { describe, it, expect } from 'vitest';
import { makeTestWorld } from './helpers';
import { createPlayer } from '../src/sim/player';
import { castSpecial } from '../src/sim/special';
import { makeEnemy } from '../src/sim/enemies';
import { CLASS_DEFS } from '../src/sim/defs/classes';
import type { ClassKey } from '../src/sim/types';

const ALL: ClassKey[] = ['mage', 'archer', 'warrior', 'ninja', 'priestess', 'witch', 'coprobo'];

describe('castSpecial', () => {
  it('põe o especial em cooldown pelo valor da classe', () => {
    const w = makeTestWorld();
    const p = createPlayer(w, 'p1', 'mage', 'T');
    castSpecial(w, p);
    expect(p.specialTimer).toBe(CLASS_DEFS.mage.specialCd);
  });

  it('não dispara enquanto está em cooldown', () => {
    const w = makeTestWorld();
    const p = createPlayer(w, 'p1', 'mage', 'T');
    castSpecial(w, p);
    const bullets = w.bullets.length;
    castSpecial(w, p);
    expect(w.bullets).toHaveLength(bullets);
  });

  it('as 7 classes lançam sem erro e todas gastam o cooldown', () => {
    for (const cls of ALL) {
      const w = makeTestWorld();
      const p = createPlayer(w, 'p1', cls, 'T');
      w.enemies.push(makeEnemy(w, 'skeleton', p.x + 40, p.y));
      expect(() => castSpecial(w, p)).not.toThrow();
      expect(p.specialTimer, cls).toBe(CLASS_DEFS[cls].specialCd);
      expect(w.events.some(e => e.t === 'sfx' && e.name === 'special'), cls).toBe(true);
    }
  });

  it('fireball do mago cria um projétil com área', () => {
    const w = makeTestWorld();
    const p = createPlayer(w, 'p1', 'mage', 'T');
    castSpecial(w, p);
    expect(w.bullets).toHaveLength(1);
    expect(w.bullets[0].aoe).toBeGreaterThan(0);
    expect(w.bullets[0].type).toBe('fireball');
  });

  it('volley do arqueiro cria vários projéteis', () => {
    const w = makeTestWorld();
    const p = createPlayer(w, 'p1', 'archer', 'T');
    castSpecial(w, p);
    expect(w.bullets.length).toBeGreaterThan(1);
  });

  it('whirlwind do guerreiro fere quem está em volta', () => {
    const w = makeTestWorld();
    const p = createPlayer(w, 'p1', 'warrior', 'T');
    const e = makeEnemy(w, 'skeleton', p.x + 30, p.y);
    w.enemies.push(e);
    const hp0 = e.hp;
    castSpecial(w, p);
    expect(e.hp).toBeLessThan(hp0);
  });

  it('dash do ninja move o jogador', () => {
    const w = makeTestWorld();
    const p = createPlayer(w, 'p1', 'ninja', 'T');
    p.facing = 0;
    const x0 = p.x;
    castSpecial(w, p);
    expect(p.x).toBeGreaterThan(x0);
  });

  it('é determinístico', () => {
    const run = () => {
      const w = makeTestWorld();
      const p = createPlayer(w, 'p1', 'archer', 'T');
      castSpecial(w, p);
      return w.bullets.map(b => Math.round(b.angle * 1e6));
    };
    expect(run()).toEqual(run());
  });
});
```

- [ ] **Step 2: Rodar para ver falhar** — `npx vitest run tests/special.test.ts`, esperado FALHA por módulo ausente.

- [ ] **Step 3: Portar `src/sim/special.ts`**

Origem: `ORIG/combat.js:186-283` (`castSpecial`, o `switch` com os 7 casos). Aplique T1–T5, mais:

- guard de entrada vira `if (p.specialTimer > 0) return;` (o `gameState` sai — quem filtra é o `step`);
- `player.def.specialCd` vira `CLASS_DEFS[p.cls].specialCd`; `player.def.special` vira `CLASS_DEFS[p.cls].special`;
- o ângulo vem de `p.facing` (que `updatePlayer` já definiu a partir de `input.aim`), não de `aimAngle()`;
- `dash` deve respeitar `world.play` e `resolveObstacles` no destino, senão o ninja atravessa parede — o original respeitava porque o clamp acontecia no frame seguinte; mantenha o clamp explícito aqui.

- [ ] **Step 4: Ligar em `updatePlayer`**, logo após a chamada de `attack`:

```ts
if (input.special) castSpecial(world, p);
```

- [ ] **Step 5: Rodar e commitar**

```bash
npx vitest run && npm run lint && npx tsc --noEmit
git add src/sim/special.ts src/sim/player.ts tests/special.test.ts
git commit -m "feat(sim): as 7 habilidades especiais

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 14: Chefes — spawn e padrões de ataque

**Files:**
- Create: `src/sim/boss.ts`
- Modify: `src/sim/enemies.ts` (delegar o padrão de chefe)
- Test: `tests/boss.test.ts`

**Interfaces:**
- Consumes: `ENEMY_DEFS`, `MINIBOSS_WAVES` (Task 5); `makeEnemy`, `nearestPlayer` (Task 12); `damagePlayer` (Task 9)
- Produces: `spawnBoss(world, type, index, total): void`, `updateBossPattern(world, e, dx, dy, dist, factor): void`, `bossPlanForWave(world, wave): string[]`

- [ ] **Step 1: Escrever `tests/boss.test.ts` falhando**

```ts
import { describe, it, expect } from 'vitest';
import { makeTestWorld } from './helpers';
import { createPlayer } from '../src/sim/player';
import { spawnBoss, bossPlanForWave } from '../src/sim/boss';
import { updateEnemies } from '../src/sim/enemies';
import { WAVES_TOTAL } from '../src/sim/constants';

describe('bossPlanForWave', () => {
  it('waves comuns não têm chefe', () => {
    const w = makeTestWorld();
    expect(bossPlanForWave(w, 1)).toEqual([]);
    expect(bossPlanForWave(w, 3)).toEqual([]);
  });

  it('as waves de mini-boss trazem o mini-boss certo', () => {
    const w = makeTestWorld();
    expect(bossPlanForWave(w, 4)).toEqual(['goblin_chief']);
    expect(bossPlanForWave(w, 12)).toEqual(['necro_lord']);
  });

  it('a wave final da campanha traz o chefe final', () => {
    const w = makeTestWorld();
    expect(bossPlanForWave(w, WAVES_TOTAL)).toContain('ogre_warlord');
  });
});

describe('spawnBoss', () => {
  it('cria um inimigo marcado como chefe, dentro dos limites', () => {
    const w = makeTestWorld();
    createPlayer(w, 'p1', 'mage', 'T');
    spawnBoss(w, 'zombie_king', 0, 1);
    expect(w.enemies).toHaveLength(1);
    const b = w.enemies[0];
    expect(b.boss).toBe('ZOMBIE KING');
    expect(b.x).toBeGreaterThanOrEqual(w.play.left);
    expect(b.x).toBeLessThanOrEqual(w.play.right);
  });

  it('vários chefes nascem em posições diferentes', () => {
    const w = makeTestWorld();
    createPlayer(w, 'p1', 'mage', 'T');
    spawnBoss(w, 'zombie_king', 0, 2);
    spawnBoss(w, 'ogre_warlord', 1, 2);
    expect(w.enemies[0].x).not.toBe(w.enemies[1].x);
  });
});

describe('padrão de chefe', () => {
  it('o chefe invoca lacaios ao longo do tempo', () => {
    const w = makeTestWorld();
    createPlayer(w, 'p1', 'mage', 'T');
    spawnBoss(w, 'zombie_king', 0, 1);
    for (let i = 0; i < 600; i++) updateEnemies(w);
    expect(w.enemies.length).toBeGreaterThan(1);
  });

  it('é determinístico', () => {
    const run = () => {
      const w = makeTestWorld();
      createPlayer(w, 'p1', 'mage', 'T');
      spawnBoss(w, 'zombie_king', 0, 1);
      for (let i = 0; i < 300; i++) updateEnemies(w);
      return w.enemies.length;
    };
    expect(run()).toBe(run());
  });
});
```

- [ ] **Step 2: Rodar para ver falhar** — esperado FALHA por módulo ausente.

- [ ] **Step 3: Portar `src/sim/boss.ts`**

Origem: `ORIG/entities.js:303-309` (`spawnBoss`), `ORIG/combat.js:398-476` (`updateBossPattern`), e a função `bossPlanForWave` de `ORIG/engine.js` (procure por `bossPlanForWave`). Aplique T1–T6, mais:

- `spawnBoss` posiciona em `canvas.width / 2 + (index - (total-1)/2) * 140` → `WORLD.w / 2 + ...`, e o `y` deve ficar a ~`SPAWN_MIN` do jogador mais próximo, não no topo da tela;
- `updateBossPattern` recebe `world` e usa `nearestPlayer` como alvo;
- `e.cd` (cooldowns de habilidade) decrementa `DT_MS` por tick (T2).

- [ ] **Step 4: Rodar e commitar**

```bash
npx vitest run && npm run lint && npx tsc --noEmit
git add src/sim/boss.ts src/sim/enemies.ts tests/boss.test.ts
git commit -m "feat(sim): chefes e mini-chefes com padroes deterministicos

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 15: Ciclo da run — waves, mutadores, vitória e derrota

**Files:**
- Create: `src/sim/run.ts`
- Modify: `src/sim/step.ts`
- Test: `tests/run.test.ts`

**Interfaces:**
- Consumes: `spawnEnemy`, `makeEnemy` (Task 12); `spawnBoss`, `bossPlanForWave` (Task 14); `MUTATORS` (Task 5); `setPhase` (Task 3)
- Produces: `startRun(world): void`, `startNextWave(world): void`, `pickEnemyType(world, wave): string`, `updateSpawnQueue(world): void`, `checkWaveComplete(world): void`, `victory(world): void`

- [ ] **Step 1: Escrever `tests/run.test.ts` falhando**

```ts
import { describe, it, expect } from 'vitest';
import { makeTestWorld, runTicks } from './helpers';
import { createPlayer } from '../src/sim/player';
import { startRun, startNextWave, pickEnemyType, checkWaveComplete } from '../src/sim/run';
import { WAVES_TOTAL } from '../src/sim/constants';

describe('startRun', () => {
  it('gera a arena, cria a wave 1 e deixa a fase em playing', () => {
    const w = makeTestWorld();
    createPlayer(w, 'p1', 'mage', 'T');
    startRun(w);
    expect(w.obstacles.length).toBeGreaterThan(0);
    expect(w.wave).toBe(1);
    expect(w.waveActive).toBe(true);
    expect(w.phase).toBe('playing');
    expect(w.spawnQueue.length).toBeGreaterThan(0);
  });
});

describe('startNextWave', () => {
  it('avança a wave e limpa o loot do chão', () => {
    const w = makeTestWorld();
    createPlayer(w, 'p1', 'mage', 'T');
    startRun(w);
    w.coins.push({ x: 0, y: 0, vx: 0, vy: 0, bob: 0, dead: false });
    startNextWave(w);
    expect(w.wave).toBe(2);
    expect(w.coins).toEqual([]);
  });

  it('zera o combo entre waves', () => {
    const w = makeTestWorld();
    createPlayer(w, 'p1', 'mage', 'T');
    startRun(w);
    w.combo = 10;
    startNextWave(w);
    expect(w.combo).toBe(0);
  });

  it('waves de chefe não sorteiam mutador', () => {
    const w = makeTestWorld();
    createPlayer(w, 'p1', 'mage', 'T');
    w.wave = 3;
    startNextWave(w); // wave 4 = mini-boss
    expect(w.waveHasBoss).toBe(true);
    expect(w.waveMutator).toBeNull();
  });

  it('a fila de spawn cresce com a wave', () => {
    const w = makeTestWorld();
    createPlayer(w, 'p1', 'mage', 'T');
    startRun(w);
    const early = w.spawnQueue.length;
    w.wave = 8;
    startNextWave(w);
    expect(w.spawnQueue.length).toBeGreaterThan(early);
  });

  it('anuncia a wave', () => {
    const w = makeTestWorld();
    createPlayer(w, 'p1', 'mage', 'T');
    startRun(w);
    expect(w.events.some(e => e.t === 'announce')).toBe(true);
  });
});

describe('pickEnemyType', () => {
  it('só sorteia tipos liberados para a wave', () => {
    const w = makeTestWorld();
    for (let i = 0; i < 200; i++) {
      expect(['skeleton', 'goblin']).toContain(pickEnemyType(w, 1));
    }
  });

  it('waves altas liberam os tipos avançados', () => {
    const w = makeTestWorld();
    const seen = new Set<string>();
    for (let i = 0; i < 500; i++) seen.add(pickEnemyType(w, 6));
    expect(seen.size).toBeGreaterThan(2);
  });
});

describe('checkWaveComplete', () => {
  it('não completa enquanto sobram inimigos ou fila', () => {
    const w = makeTestWorld();
    createPlayer(w, 'p1', 'mage', 'T');
    startRun(w);
    checkWaveComplete(w);
    expect(w.wave).toBe(1);
  });

  it('a campanha vence ao limpar a última wave', () => {
    const w = makeTestWorld();
    createPlayer(w, 'p1', 'mage', 'T');
    startRun(w);
    w.wave = WAVES_TOTAL;
    w.spawnQueue = [];
    w.enemies = [];
    w.waveActive = true;
    checkWaveComplete(w);
    expect(w.phase).toBe('victory');
  });

  it('no endless não há vitória, só a próxima wave', () => {
    const w = makeTestWorld({ mode: 'endless' });
    createPlayer(w, 'p1', 'mage', 'T');
    startRun(w);
    w.wave = WAVES_TOTAL;
    w.spawnQueue = [];
    w.enemies = [];
    w.waveActive = true;
    checkWaveComplete(w);
    expect(w.phase).not.toBe('victory');
  });
});

describe('run completa', () => {
  it('600 ticks de simulação com waves não quebram nem divergem', () => {
    const build = () => {
      const w = makeTestWorld();
      createPlayer(w, 'p1', 'mage', 'T');
      startRun(w);
      return w;
    };
    const a = build(), b = build();
    runTicks(a, 600);
    runTicks(b, 600);
    expect(a.enemies.length).toBe(b.enemies.length);
    expect(a.wave).toBe(b.wave);
  });
});
```

- [ ] **Step 2: Rodar para ver falhar** — esperado FALHA por módulo ausente.

- [ ] **Step 3: Portar `src/sim/run.ts`**

Origem: `ORIG/engine.js:160-248` (`startGame`, só a parte de estado de run — a criação do jogador já está na Task 9), `:275-340` (`startNextWave`), `pickEnemyType`, `announceWave`; `ORIG/entities.js:534-544` (`updateSpawnQueue`), `:545-569` (`checkWaveComplete`), `:570+` (`victory`). Aplique T1–T6, mais:

- `announceWave` vira `emit(world, { t: 'announce', text })` — o `setTimeout` de 2600ms que escondia o texto é problema de `ui/`, não do sim;
- `tryUnlock('ninja')` e `tryUnlock('coprobo')` viram `emit(world, { t: 'unlock', cls })`;
- `Sfx.setBossMode(...)` vira `emit(world, { t: 'bossMusic', on })`;
- `gameOver()` **não** entra aqui: o sim só faz `setPhase(world, 'gameover')` (Task 9), e `app/` grava o save e mostra a tela;
- o baú da wave usa `world.rng` e é posicionado dentro de `world.play` (o mundo maior deixa o baú longe — a Task 21 revisita).

- [ ] **Step 4: Ligar no `step()`** — o pipeline completo:

```ts
export function step(world: World, inputs: Record<string, InputState>): void {
  world.tick++;
  if (world.phase !== 'playing') return;
  if (world.comboTimer > 0) {
    world.comboTimer -= DT_MS;
    if (world.comboTimer <= 0) world.combo = 0;
  }
  for (const id of Object.keys(world.players)) {
    const input = inputs[id];
    if (input) updatePlayer(world, world.players[id], input);
  }
  updateBullets(world);
  updateEnemyBullets(world);
  updateEnemies(world);
  updatePotions(world);   // Task 16
  updateChests(world);    // Task 16
  updateCoins(world);     // Task 16
  updateSpawnQueue(world);
  checkWaveComplete(world);
}
```

As três chamadas marcadas como Task 16 ainda não existem — comente-as agora e descomente na Task 16. A **ordem** é a mesma de `ORIG/combat.js:3-20` e é parte do contrato: mudá-la muda o comportamento (um projétil que mata na mesma iteração em que o inimigo se move dá resultado diferente se a ordem inverter).

- [ ] **Step 5: Verificar no navegador**

Chame `startRun(world)` em `main.ts` no lugar do `generateArena` avulso. Jogue uma wave inteira: os inimigos entram aos poucos, a wave é anunciada, ao limpar tudo a próxima começa.

- [ ] **Step 6: Commit**

```bash
npx vitest run && npm run lint && npx tsc --noEmit
git add src/sim/run.ts src/sim/step.ts src/main.ts tests/run.test.ts
git commit -m "feat(sim): ciclo de waves, mutadores e condicao de vitoria

O pipeline do step passa a ter a ordem completa de ORIG/combat.js.
Anuncios, desbloqueios e musica de chefe viram eventos.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 16: XP, bênçãos e loot

**Files:**
- Create: `src/sim/xp.ts`, `src/sim/loot.ts`
- Modify: `src/sim/step.ts` (descomentar as três chamadas), `src/sim/enemies.ts` (`killEnemy` chama `gainXp`)
- Test: `tests/xp.test.ts`, `tests/loot.test.ts`

**Interfaces:**
- Consumes: `LEVELUP_POOL`, `XP_BASE`, `XP_GROWTH`, `LEVEL_HP`, `COIN_MAGNET` (Task 5); `applyMods`, `recalcStats`, `playerDmgKind` (Task 7); `setPhase` (Task 3)
- Produces:
  - `gainXp(world, p, amount): void`, `rollLevelChoices(world, p): void`, `pickBlessing(world, p, index): void`
  - `updateCoins(world): void`, `updatePotions(world): void`, `updateChests(world): void`, `lootChest(world, p, chest): void`

**Sobre o level-up:** o Marco 0 preserva a regra single-player — subir de nível pausa a partida. O sim faz `setPhase(world, 'levelup')` e preenche `p.levelChoices`; a `ui/` desenha a partir daí. Nenhum HTML é gerado dentro de `sim/` (o original montava `innerHTML` em `rollLevelChoices`). A regra co-op de acumular bênçãos é Marco 3.

- [ ] **Step 1: Escrever `tests/xp.test.ts`**

```ts
import { describe, it, expect } from 'vitest';
import { makeTestWorld } from './helpers';
import { createPlayer } from '../src/sim/player';
import { gainXp, rollLevelChoices, pickBlessing } from '../src/sim/xp';
import { XP_BASE, XP_GROWTH, LEVEL_HP } from '../src/sim/defs/blessings';

describe('gainXp', () => {
  it('acumula xp sem subir de nível abaixo do limiar', () => {
    const w = makeTestWorld();
    const p = createPlayer(w, 'p1', 'mage', 'T');
    gainXp(w, p, XP_BASE - 1);
    expect(p.level).toBe(1);
    expect(p.xp).toBe(XP_BASE - 1);
  });

  it('sobe de nível, aumenta maxHp, cura e enfileira a escolha', () => {
    const w = makeTestWorld();
    const p = createPlayer(w, 'p1', 'mage', 'T');
    p.hp = 50;
    gainXp(w, p, XP_BASE);
    expect(p.level).toBe(2);
    expect(p.permMaxHp).toBe(100 + LEVEL_HP);
    expect(p.hp).toBe(50 + LEVEL_HP);
    expect(p.pendingLevelUps).toBe(1);
    expect(p.xpNext).toBe(Math.round(XP_BASE * XP_GROWTH));
  });

  it('xp em excesso pode subir vários níveis de uma vez', () => {
    const w = makeTestWorld();
    const p = createPlayer(w, 'p1', 'mage', 'T');
    gainXp(w, p, XP_BASE * 10);
    expect(p.level).toBeGreaterThan(2);
    expect(p.pendingLevelUps).toBe(p.level - 1);
  });

  it('o perk wise do forge aumenta o xp ganho', () => {
    const w = makeTestWorld();
    w.config.forge.wise = 5;
    const p = createPlayer(w, 'p1', 'mage', 'T');
    gainXp(w, p, 100);
    expect(p.xp).toBe(150); // 100 * (1 + 5 * 0.1)
  });

  it('subir de nível leva o mundo para a fase levelup', () => {
    const w = makeTestWorld();
    const p = createPlayer(w, 'p1', 'mage', 'T');
    gainXp(w, p, XP_BASE);
    expect(w.phase).toBe('levelup');
    expect(p.levelChoices).toHaveLength(3);
  });
});

describe('rollLevelChoices', () => {
  it('oferece 3 opções distintas', () => {
    const w = makeTestWorld();
    const p = createPlayer(w, 'p1', 'mage', 'T');
    rollLevelChoices(w, p);
    expect(p.levelChoices).toHaveLength(3);
    expect(new Set(p.levelChoices.map(b => b.name)).size).toBe(3);
  });

  it('filtra as bênçãos pelo tipo de dano da classe', () => {
    const w = makeTestWorld();
    const p = createPlayer(w, 'p1', 'mage', 'T'); // elemental
    for (let i = 0; i < 60; i++) {
      rollLevelChoices(w, p);
      for (const b of p.levelChoices) {
        if (b.dmgKind) expect(b.dmgKind).toBe('elemental');
      }
    }
  });

  it('é determinística', () => {
    const run = () => {
      const w = makeTestWorld();
      const p = createPlayer(w, 'p1', 'mage', 'T');
      rollLevelChoices(w, p);
      return p.levelChoices.map(b => b.name);
    };
    expect(run()).toEqual(run());
  });

  it('não gera HTML', () => {
    const w = makeTestWorld();
    const p = createPlayer(w, 'p1', 'mage', 'T');
    rollLevelChoices(w, p);
    for (const b of p.levelChoices) expect(JSON.stringify(b)).not.toContain('<');
  });
});

describe('pickBlessing', () => {
  it('aplica os mods e consome um level-up pendente', () => {
    const w = makeTestWorld();
    const p = createPlayer(w, 'p1', 'mage', 'T');
    p.pendingLevelUps = 1;
    p.levelChoices = [{ name: 'MIGHT', icon: '💪', mods: { dmgPct: 4 } }];
    pickBlessing(w, p, 0);
    expect(p.permStats.dmgPct).toBe(4);
    expect(p.pendingLevelUps).toBe(0);
    expect(w.phase).toBe('playing');
  });

  it('com level-ups na fila, oferece de novo em vez de fechar', () => {
    const w = makeTestWorld();
    const p = createPlayer(w, 'p1', 'mage', 'T');
    p.pendingLevelUps = 2;
    p.levelChoices = [{ name: 'MIGHT', icon: '💪', mods: { dmgPct: 4 } }];
    pickBlessing(w, p, 0);
    expect(p.pendingLevelUps).toBe(1);
    expect(p.levelChoices).toHaveLength(3);
  });

  it('índice inválido não faz nada', () => {
    const w = makeTestWorld();
    const p = createPlayer(w, 'p1', 'mage', 'T');
    p.pendingLevelUps = 1;
    p.levelChoices = [];
    pickBlessing(w, p, 5);
    expect(p.pendingLevelUps).toBe(1);
  });
});
```

- [ ] **Step 2: Escrever `tests/loot.test.ts`**

```ts
import { describe, it, expect } from 'vitest';
import { makeTestWorld } from './helpers';
import { createPlayer } from '../src/sim/player';
import { updateCoins, updatePotions, updateChests, lootChest } from '../src/sim/loot';
import { COIN_MAGNET } from '../src/sim/constants';

describe('moedas', () => {
  it('são atraídas quando entram no raio do ímã', () => {
    const w = makeTestWorld();
    const p = createPlayer(w, 'p1', 'mage', 'T');
    const coin = { x: p.x + COIN_MAGNET - 10, y: p.y, vx: 0, vy: 0, bob: 0, dead: false };
    w.coins.push(coin);
    const d0 = Math.hypot(coin.x - p.x, coin.y - p.y);
    updateCoins(w);
    expect(Math.hypot(coin.x - p.x, coin.y - p.y)).toBeLessThan(d0);
  });

  it('coletar dá ouro e conta no total da run', () => {
    const w = makeTestWorld();
    const p = createPlayer(w, 'p1', 'mage', 'T');
    w.coins.push({ x: p.x, y: p.y, vx: 0, vy: 0, bob: 0, dead: false });
    const gold0 = p.gold;
    updateCoins(w);
    expect(p.gold).toBeGreaterThan(gold0);
    expect(w.runGoldEarned).toBeGreaterThan(0);
    expect(w.coins).toHaveLength(0);
  });

  it('moedas longe ficam paradas', () => {
    const w = makeTestWorld();
    const p = createPlayer(w, 'p1', 'mage', 'T');
    const coin = { x: p.x + 800, y: p.y, vx: 0, vy: 0, bob: 0, dead: false };
    w.coins.push(coin);
    const x0 = coin.x;
    updateCoins(w);
    expect(Math.abs(coin.x - x0)).toBeLessThan(1);
  });
});

describe('poções', () => {
  it('curam ao encostar e não passam do máximo', () => {
    const w = makeTestWorld();
    const p = createPlayer(w, 'p1', 'mage', 'T');
    p.hp = 10;
    w.potions.push({ x: p.x, y: p.y, bob: 0, dead: false });
    updatePotions(w);
    expect(p.hp).toBeGreaterThan(10);
    expect(p.hp).toBeLessThanOrEqual(p.maxHp);
    expect(w.potions).toHaveLength(0);
  });

  it('não são consumidas com hp cheio', () => {
    const w = makeTestWorld();
    const p = createPlayer(w, 'p1', 'mage', 'T');
    w.potions.push({ x: p.x, y: p.y, bob: 0, dead: false });
    updatePotions(w);
    expect(w.potions).toHaveLength(1);
  });
});

describe('baús', () => {
  it('abrem ao encostar e saem do estado fechado', () => {
    const w = makeTestWorld();
    const p = createPlayer(w, 'p1', 'mage', 'T');
    w.chests.push({ x: p.x, y: p.y, state: 'closed', timer: 0 });
    for (let i = 0; i < 120; i++) updateChests(w);
    expect(w.chests[0].state).not.toBe('closed');
  });

  it('lootChest entrega recompensa e é determinístico', () => {
    const run = () => {
      const w = makeTestWorld();
      const p = createPlayer(w, 'p1', 'mage', 'T');
      const chest = { x: p.x, y: p.y, state: 'opening' as const, timer: 0 };
      lootChest(w, p, chest);
      return { coins: w.coins.length, potions: w.potions.length, enemies: w.enemies.length, gold: p.gold };
    };
    expect(run()).toEqual(run());
  });

  it('a sorte do jogador influencia o loot', () => {
    const withLuck = (luck: number) => {
      let total = 0;
      for (let seed = 0; seed < 40; seed++) {
        const w = makeTestWorld({ seed });
        const p = createPlayer(w, 'p1', 'mage', 'T');
        p.stats.luck = luck;
        lootChest(w, p, { x: p.x, y: p.y, state: 'opening', timer: 0 });
        total += w.coins.length + w.potions.length;
      }
      return total;
    };
    expect(withLuck(200)).toBeGreaterThanOrEqual(withLuck(0));
  });
});
```

- [ ] **Step 3: Rodar para ver falhar** — esperado FALHA por módulos ausentes.

- [ ] **Step 4: Portar `src/sim/xp.ts`**

Origem: `ORIG/entities.js:68-86` (`gainXp`), `:124-173` (`maybeOpenLevelUp`, `rollLevelChoices`, `pickBlessing`, `closeLevelUp`). Aplique T1–T5, mais:

- `forgeLevel('wise')` vira `world.config.forge.wise` (T5);
- `rollLevelChoices` perde inteiramente o bloco de `innerHTML`: só filtra o pool por `playerDmgKind(p)` e faz `p.levelChoices = world.rng.shuffled(pool).slice(0, 3)`;
- `closeLevelUp` vira `setPhase(world, 'playing')` mais o tratamento de `world.pendingAfterLevelUp` (`'shop'` → `setPhase(world,'shop')`, `'victory'` → `victory(world)`); nada de `requestAnimationFrame` nem `updateHUD` (T5);
- `tryUnlock('witch')` no nível 8 vira `emit(world, { t: 'unlock', cls: 'witch' })`.

**Desvio deliberado registrado:** o original embaralha com `[...pool].sort(() => Math.random() - 0.5)`, um embaralhamento enviesado que favorece a ordem original do array. `rng.shuffled()` é Fisher-Yates e distribui de verdade. Na prática as bênçãos do fim do `LEVELUP_POOL` (IGNITE, FROST) passam a aparecer tanto quanto as do começo. É correção, não regressão — mas registre no commit para que ninguém a leia como bug depois.

- [ ] **Step 5: Portar `src/sim/loot.ts`**

Origem: `ORIG/entities.js:473-504` (`updateCoins`), `ORIG/items.js:203-221` (`updatePotions`), `:223-246` (`updateChests`), `:247-280` (`lootChest`). Aplique T1–T5, mais:

- moedas e poções miram **o jogador mais próximo** e creditam a ele (`p.gold += …`), em vez do `gold` global; `world.runGoldEarned` continua sendo o total da run;
- `updateChests` procura qualquer jogador dentro do raio de abertura;
- o mimic que sai de um baú entra por `makeEnemy(world, 'mimic', …)`.

- [ ] **Step 6: Descomentar as três chamadas no `step()`** (`updatePotions`, `updateChests`, `updateCoins`), e em `killEnemy` chamar `gainXp(world, killer, e.score)` quando houver matador.

- [ ] **Step 7: Rodar e commitar**

```bash
npx vitest run && npm run lint && npx tsc --noEmit
git add src/sim/xp.ts src/sim/loot.ts src/sim/step.ts src/sim/enemies.ts tests/xp.test.ts tests/loot.test.ts
git commit -m "feat(sim): xp, bencaos e loot sem tocar no DOM

rollLevelChoices deixa de montar innerHTML: preenche p.levelChoices e
a UI desenha a partir dai. Ouro e pocoes passam a creditar o jogador
mais proximo em vez de um global.

Desvio consciente: o embaralhamento por sort(() => random - 0.5) do
original era enviesado; rng.shuffled() usa Fisher-Yates, entao as
bencaos do fim do pool passam a aparecer com a frequencia devida.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 17: Render completo

Traz para `render/` tudo o que `ORIG/render.js` desenhava, mais os efeitos que antes eram estado global (partículas, textos flutuantes, screen shake) e agora chegam por evento.

**Files:**
- Create: `src/render/fx.ts`
- Modify: `src/render/entities.ts`, `src/render/index.ts`
- Create: `src/app/events.ts`
- Modify: `src/main.ts`

**Interfaces:**
- Consumes: `SimEvent` (Task 3), `Camera` (Task 10), `isVisible` (Task 10)
- Produces:
  - `createFx(): Fx` — guarda `particles`, `floatTexts`, `swings`, `shake`
  - `Fx.handle(event: SimEvent): void`, `Fx.update(dtMs: number): void`, `Fx.draw(ctx, cam): void`, `Fx.shakeOffset(): {x,y}`, `Fx.setShakeEnabled(v: boolean): void`
  - `drawEnemies`, `drawBullets`, `drawEnemyBullets`, `drawCoins`, `drawPotions`, `drawChests`, `drawObstacles`, `drawTraps`, `drawTorches`, `drawFog`, `drawBossTelegraphs` — todas `(ctx, cam, world)`
  - `createEventSink(fx, ui, audio): (events: SimEvent[]) => void`

- [ ] **Step 1: Portar as funções de desenho**

Uma a uma, de `ORIG/render.js`, com **duas** mudanças e nenhuma outra:

1. Toda coordenada passa por `worldToScreen(cam, x, y)`.
2. Toda função de desenho de entidade começa com um teste de culling: `if (!isVisible(cam, e.x, e.y, 96)) continue;`.

| Função | Origem |
|---|---|
| `drawTiles` | já feita na Task 10 |
| `drawFog` | `ORIG/render.js:31-41` |
| `drawTorches` | `:56-87` |
| `drawBullets` | `:88-140` |
| `drawObstacles` | `:141-149` |
| `drawTraps` | `:150-156` — o frame vem de `trapFrameAt(world, tr)` (T4) |
| `drawBossTelegraphs` | `:157-174` |
| `drawEnemyBullets` | `:175-191` |
| `drawMeleeSwings` | `:192-217` — agora desenha os swings acumulados em `Fx`, não `world.meleeSwings` |
| `drawEnemies` | `:218-257` |
| `drawCoins` | `:311-322` |
| `drawPotions` | `:323-334` |
| `drawChests` | `:335-356` |
| `drawFloatTexts` | `:357-371` — agora de `Fx` |
| `drawParticles` | `:372-379` — agora de `Fx` |

`TORCH_POSITIONS` (`ORIG/render.js:55`) era recalculado a cada resize; agora é calculado uma vez para o mundo, em `buildTilemap`.

`animTick` (`ORIG/config.js:168`) era um contador global incrementado no update; passa a ser derivado do render: `Math.floor(performance.now() / 120) % 4`. Animação é apresentação — não pertence ao sim.

- [ ] **Step 2: Implementar `src/render/fx.ts`**

`Fx` é o estado de apresentação que antes vivia em globais. Ele **consome eventos** e envelhece por conta própria:

```ts
// fx.ts — presentation-only state fed by sim events.
import type { SimEvent } from '../sim/types';
import { worldToScreen, isVisible, type Camera } from './camera';

type Particle = { x: number; y: number; vx: number; vy: number; life: number; color: string };
type FloatText = { x: number; y: number; text: string; color: string; life: number };
type Swing = { x: number; y: number; angle: number; range: number; arc: number; life: number };

export function createFx() {
  const particles: Particle[] = [];
  const floatTexts: FloatText[] = [];
  const swings: Swing[] = [];
  let shakeT = 0, shakeMag = 0;
  let enabled = true; // mirrors the "screen shake" setting

  return {
    setShakeEnabled(v: boolean) { enabled = v; },

    handle(ev: SimEvent) {
      switch (ev.t) {
        case 'particles':
          for (let i = 0; i < ev.count; i++) {
            const a = Math.random() * Math.PI * 2;      // cosmetic randomness stays here (T3)
            const s = 1 + Math.random() * 2;
            particles.push({ x: ev.x, y: ev.y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 1, color: ev.color });
          }
          break;
        case 'float':
          floatTexts.push({ x: ev.x, y: ev.y, text: ev.text, color: ev.color, life: 1 });
          break;
        case 'swing':
          swings.push({ x: ev.x, y: ev.y, angle: ev.angle, range: ev.range, arc: ev.arc, life: 1 });
          break;
        case 'shake':
          if (!enabled) break;
          shakeMag = Math.max(shakeMag, ev.mag);
          shakeT = Math.max(shakeT, ev.dur);
          break;
        default:
          break; // sfx / announce / phase / unlock are handled elsewhere
      }
    },

    update(dtMs: number) {
      if (shakeT > 0) { shakeT -= dtMs; if (shakeT <= 0) shakeMag = 0; }
      for (const p of particles) { p.x += p.vx; p.y += p.vy; p.life -= 0.04; }
      for (const f of floatTexts) { f.y -= 0.6; f.life -= 0.02; }
      for (const s of swings) s.life -= 0.12;
      prune(particles); prune(floatTexts); prune(swings);
    },

    shakeOffset() {
      if (shakeMag <= 0) return { x: 0, y: 0 };
      return { x: (Math.random() - 0.5) * shakeMag, y: (Math.random() - 0.5) * shakeMag };
    },

    draw(ctx: CanvasRenderingContext2D, cam: Camera) {
      for (const s of swings) {
        if (!isVisible(cam, s.x, s.y, 96)) continue;
        const p = worldToScreen(cam, s.x, s.y);
        ctx.save();
        ctx.globalAlpha = s.life;
        ctx.strokeStyle = '#ffe066';
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.arc(p.x, p.y, s.range, s.angle - s.arc / 2, s.angle + s.arc / 2);
        ctx.stroke();
        ctx.restore();
      }
      for (const q of particles) {
        if (!isVisible(cam, q.x, q.y, 32)) continue;
        const p = worldToScreen(cam, q.x, q.y);
        ctx.globalAlpha = Math.max(0, q.life);
        ctx.fillStyle = q.color;
        ctx.fillRect(p.x - 2, p.y - 2, 4, 4);
      }
      ctx.globalAlpha = 1;
      ctx.font = 'bold 14px monospace';
      ctx.textAlign = 'center';
      for (const f of floatTexts) {
        if (!isVisible(cam, f.x, f.y, 48)) continue;
        const p = worldToScreen(cam, f.x, f.y);
        ctx.globalAlpha = Math.max(0, f.life);
        ctx.fillStyle = f.color;
        ctx.fillText(f.text, p.x, p.y);
      }
      ctx.globalAlpha = 1;
      ctx.textAlign = 'left';
    },
  };
}

function prune<T extends { life: number }>(arr: T[]): void {
  for (let i = arr.length - 1; i >= 0; i--) if (arr[i].life <= 0) arr.splice(i, 1);
}
```

Duas ressalvas sobre esse bloco:

- Os valores de decaimento (`0.04`, `0.02`, `0.6`, `0.12`) devem sair de `ORIG/entities.js:521-533` (`updateParticles`) e `ORIG/items.js:286-294` (`updateFloatTexts`) — copie os do original, não os invente.
- O `draw` acima é a estrutura correta (culling, alpha por `life`, conversão de coordenadas), mas o **estilo visual** — cores, espessura, sombra do texto, forma da partícula — deve ser copiado de `ORIG/render.js:192-217`, `:357-371` e `:372-379`. Onde o original e o esqueleto acima discordarem na aparência, o original vence.

- [ ] **Step 3: Implementar `src/app/events.ts`**

```ts
// events.ts — routes one tick's sim events to sound, UI and effects.
import type { SimEvent } from '../sim/types';

export function createEventSink(deps: {
  fx: { handle(e: SimEvent): void };
  playSfx(name: string): void;
  announce(text: string): void;
  hurtFlash(): void;
  unlock(cls: string): void;
  bossMusic(on: boolean): void;
  onPhase(from: string, to: string): void;
}) {
  return (events: SimEvent[]) => {
    for (const ev of events) {
      deps.fx.handle(ev);
      switch (ev.t) {
        case 'sfx': deps.playSfx(ev.name); break;
        case 'announce': deps.announce(ev.text); break;
        case 'hurtFlash': deps.hurtFlash(); break;
        case 'unlock': deps.unlock(ev.cls); break;
        case 'bossMusic': deps.bossMusic(ev.on); break;
        case 'phase': deps.onPhase(ev.from, ev.to); break;
        default: break;
      }
    }
  };
}
```

- [ ] **Step 4: Compor em `render/index.ts` e `main.ts`**

`render()` passa a desenhar na ordem exata de `ORIG/render.js:3-30` (piso → armadilhas → obstáculos → loot → telegraphs → inimigos → projéteis → jogador → swings → partículas → textos → tochas → névoa), aplicando o `shakeOffset()` como `ctx.translate` antes de tudo e revertendo depois.

Em `main.ts`, `afterStep` passa a ser `sink(drainEvents(w))` e `render` chama `fx.update(DT_MS)` antes de desenhar.

- [ ] **Step 5: Verificar no navegador**

Jogue duas waves inteiras e confirme, item a item: inimigos desenhados com barra de vida e flash ao tomar dano; projéteis com rastro; melee com o arco; moedas girando e sendo puxadas; poções; baús abrindo; espinhos animados; tochas iluminando; névoa no mutador FOG; números de dano subindo; screen shake ao levar hit; chefe com telegraph. Verifique o FPS com o mundo cheio — o culling deve manter 60.

- [ ] **Step 6: Commit**

```bash
npm test && npm run lint && npx tsc --noEmit
git add src/render src/app/events.ts src/main.ts
git commit -m "feat(render): desenho completo com culling e efeitos por evento

Particulas, textos flutuantes, swings e screen shake saem do estado
global do jogo e passam a viver em render/fx, alimentados pelos
eventos que o sim emite. Toda entidade fora do enquadramento e
descartada antes de desenhar.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 18: HUD e telas

**Files:**
- Create: `src/ui/dom.ts`, `src/ui/hud.ts`, `src/ui/screens.ts`
- Modify: `src/main.ts`

**Interfaces:**
- Consumes: `World`, `Player`, `Phase` (Task 3); `maxStamina`, `STAT_LABELS`, `PCT_STATS` (Task 7); `pickBlessing` (Task 16)
- Produces:
  - `dom` — objeto com as referências de elemento, resolvidas uma vez
  - `updateHud(world, localId): void`
  - `showScreen(name: string | null): void`, `syncScreens(world, localId): void`, `announce(text): void`, `hurtFlash(): void`

**A inversão que importa:** no original, `updateHUD()` era chamada de dentro da lógica (depois de comprar, de tomar dano, de subir de nível). Aqui ela é chamada **uma vez por frame** a partir do `world`. Nenhum código de jogo empurra nada para o DOM.

- [ ] **Step 1: Portar `src/ui/dom.ts`** — de `ORIG/ui.js:138-168`, trocando as constantes soltas por um objeto exportado e tipando cada elemento. Toda referência resolvida com `document.getElementById(...)!`; se algum id não existir, o erro aparece na hora, não silenciosamente.

- [ ] **Step 2: Portar `src/ui/hud.ts`** — de `ORIG/items.js:295-352` (`updateHUD`). Aplique T1 (lê `world` e `world.players[localId]`) e remova toda chamada externa. A barra de stamina usa `maxStamina(p)`; a de especial usa `p.specialTimer / CLASS_DEFS[p.cls].specialCd`.

- [ ] **Step 3: Portar `src/ui/screens.ts`** — de `ORIG/engine.js:55-60` (`showScreen`, `hideAllScreens`), `ORIG/entities.js:131-147` (a parte de `innerHTML` de `rollLevelChoices`, que sai do sim e vem para cá) e `ORIG/engine.js:255-274` (a montagem da tela de game over).

`syncScreens(world, localId)` compara `world.phase` com a tela visível e reage — é o único lugar que decide qual tela aparece:

```ts
const SCREEN_FOR_PHASE: Record<Phase, string | null> = {
  playing: null,
  levelup: 'levelup',
  shop: 'shop',
  gameover: 'gameover',
  victory: 'victory',
};
```

A tela de level-up desenha `p.levelChoices` (que o sim preencheu, sem HTML) e liga cada botão a `pickBlessing(world, p, i)`. As teclas 1/2/3 continuam funcionando — o handler vive em `ui/`, não em `app/input.ts`, porque só faz sentido com a tela aberta.

- [ ] **Step 4: Ligar em `main.ts`** — dentro de `render`, antes de desenhar: `updateHud(world, 'p1'); syncScreens(world, 'p1');`.

- [ ] **Step 5: Verificar no navegador** — HP, ouro, wave, score, XP, stamina e cooldown de especial corretos e atualizando; subir de nível abre a tela com 3 bênçãos e as teclas 1/2/3 escolhem; morrer abre o game over com os números certos; pausa com Esc.

- [ ] **Step 6: Commit**

```bash
npm test && npm run lint && npx tsc --noEmit
git add src/ui src/main.ts
git commit -m "feat(ui): HUD e telas dirigidas pelo world

updateHud passa a rodar uma vez por frame lendo o mundo, em vez de
ser empurrada por quem causou a mudanca. A tela ativa e decidida por
world.phase.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 19: Loja

**Files:**
- Create: `src/sim/shop.ts`, `src/ui/shop.ts`
- Test: `tests/shop.test.ts`

**Interfaces:**
- Consumes: `ITEM_POOL`, `HEAL_PRICE` (Task 5); `EQUIPMENT`, `isEligible`, `canEquip`, `targetSlot`, `equipInto` (Task 6); `applyMods`, `recalcStats`, `playerDmgKind`, `playerArchetype` (Task 7)
- Produces (puro, em `sim/shop.ts`): `openShop(world, p)`, `closeShop(world)`, `rollOffers(world, p)`, `itemPrice(world, p, item)`, `buyOffer(world, p, i)`, `buyEquipOffer(world, p, i)`, `shopHeal(world, p)`, `shopReroll(world, p)`, `equipItem(world, p, item)`
- Produces (DOM, em `ui/shop.ts`): `renderShop(world, localId)`, `equipDelta(p, item): string`

- [ ] **Step 1: Escrever `tests/shop.test.ts`**

```ts
import { describe, it, expect } from 'vitest';
import { makeTestWorld } from './helpers';
import { createPlayer } from '../src/sim/player';
import { rollOffers, itemPrice, buyOffer, buyEquipOffer, shopHeal, shopReroll, equipItem } from '../src/sim/shop';
import { EQUIPMENT } from '../src/sim/equipment-catalog';
import { HEAL_PRICE } from '../src/sim/defs/items';

describe('rollOffers', () => {
  it('oferece 4 consumíveis e 4 equipamentos', () => {
    const w = makeTestWorld();
    const p = createPlayer(w, 'p1', 'mage', 'T');
    rollOffers(w, p);
    expect(w.shopOffers).toHaveLength(4);
    expect(w.shopEquipOffers).toHaveLength(4);
  });

  it('só oferece equipamento elegível para a classe', () => {
    const w = makeTestWorld();
    const p = createPlayer(w, 'p1', 'mage', 'T');
    for (let i = 0; i < 40; i++) {
      rollOffers(w, p);
      for (const o of w.shopEquipOffers) {
        if (o.item.slot === 'weapon') expect(o.item.archetype).toBe('elemental');
        if (o.item.classReq) expect(o.item.classReq).toContain('mage');
      }
    }
  });

  it('é determinística', () => {
    const run = () => {
      const w = makeTestWorld();
      const p = createPlayer(w, 'p1', 'mage', 'T');
      rollOffers(w, p);
      return w.shopOffers.map(o => o.item.name);
    };
    expect(run()).toEqual(run());
  });
});

describe('itemPrice', () => {
  it('encarece conforme a wave', () => {
    const w = makeTestWorld();
    const p = createPlayer(w, 'p1', 'mage', 'T');
    const item = { name: 'X', icon: '', price: 100, mods: {} };
    w.wave = 1;
    const early = itemPrice(w, p, item);
    w.wave = 10;
    expect(itemPrice(w, p, item)).toBeGreaterThan(early);
  });

  it('o perk merchant desconta', () => {
    const w = makeTestWorld();
    const p = createPlayer(w, 'p1', 'mage', 'T');
    const item = { name: 'X', icon: '', price: 100, mods: {} };
    w.wave = 1;
    const full = itemPrice(w, p, item);
    w.config.forge.merchant = 5;
    expect(itemPrice(w, p, item)).toBeLessThan(full);
  });

  it('nunca custa menos de 1', () => {
    const w = makeTestWorld();
    const p = createPlayer(w, 'p1', 'mage', 'T');
    w.config.forge.merchant = 100;
    expect(itemPrice(w, p, { name: 'X', icon: '', price: 1, mods: {} })).toBeGreaterThanOrEqual(1);
  });
});

describe('compras', () => {
  it('sem ouro não compra', () => {
    const w = makeTestWorld();
    const p = createPlayer(w, 'p1', 'mage', 'T');
    rollOffers(w, p);
    p.gold = 0;
    buyOffer(w, p, 0);
    expect(w.shopOffers[0].sold).toBe(false);
  });

  it('comprar debita, marca vendido e aplica os mods', () => {
    const w = makeTestWorld();
    const p = createPlayer(w, 'p1', 'mage', 'T');
    rollOffers(w, p);
    p.gold = 9999;
    const before = { ...p.permStats };
    buyOffer(w, p, 0);
    expect(w.shopOffers[0].sold).toBe(true);
    expect(p.gold).toBeLessThan(9999);
    expect(p.permStats).not.toEqual(before);
  });

  it('não compra duas vezes a mesma oferta', () => {
    const w = makeTestWorld();
    const p = createPlayer(w, 'p1', 'mage', 'T');
    rollOffers(w, p);
    p.gold = 9999;
    buyOffer(w, p, 0);
    const gold = p.gold;
    buyOffer(w, p, 0);
    expect(p.gold).toBe(gold);
  });

  it('escudo não é comprável com arma de duas mãos', () => {
    const w = makeTestWorld();
    const p = createPlayer(w, 'p1', 'mage', 'T');
    p.gold = 9999;
    const twoH = EQUIPMENT.find(i => i.slot === 'weapon' && i.twoHanded)!;
    const shield = EQUIPMENT.find(i => i.slot === 'offhand')!;
    equipItem(w, p, twoH);
    w.shopEquipOffers = [{ item: shield, sold: false }];
    buyEquipOffer(w, p, 0);
    expect(w.shopEquipOffers[0].sold).toBe(false);
  });
});

describe('equipItem', () => {
  it('arma de catálogo vira player.weapon achatada, com o nome do item', () => {
    const w = makeTestWorld();
    const p = createPlayer(w, 'p1', 'mage', 'T');
    const staff = EQUIPMENT.find(i => i.id === 'w_runed')!;
    equipItem(w, p, staff);
    expect(p.weapon.name).toBe(staff.name);
    expect(p.weapon.attack).toBe('bolt');
    expect(p.weapon.fireRate).toBe(185);
  });

  it('arma de duas mãos limpa o offhand', () => {
    const w = makeTestWorld();
    const p = createPlayer(w, 'p1', 'mage', 'T');
    equipItem(w, p, EQUIPMENT.find(i => i.slot === 'offhand')!);
    expect(p.equipment.offhand).not.toBeNull();
    equipItem(w, p, EQUIPMENT.find(i => i.slot === 'weapon' && i.twoHanded)!);
    expect(p.equipment.offhand).toBeNull();
  });
});

describe('cura e reroll', () => {
  it('curar custa e cura 30, e não roda com hp cheio', () => {
    const w = makeTestWorld();
    const p = createPlayer(w, 'p1', 'mage', 'T');
    p.gold = 100; p.hp = 10;
    shopHeal(w, p);
    expect(p.hp).toBe(40);
    expect(p.gold).toBe(100 - HEAL_PRICE);
    p.hp = p.maxHp;
    const gold = p.gold;
    shopHeal(w, p);
    expect(p.gold).toBe(gold);
  });

  it('reroll troca as ofertas e fica mais caro a cada vez', () => {
    const w = makeTestWorld();
    const p = createPlayer(w, 'p1', 'mage', 'T');
    rollOffers(w, p);
    p.gold = 100;
    const first = w.rerollCost;
    shopReroll(w, p);
    expect(w.rerollCost).toBeGreaterThan(first);
  });
});
```

- [ ] **Step 2: Rodar para ver falhar** — esperado FALHA por módulo ausente.

- [ ] **Step 3: Portar a lógica para `src/sim/shop.ts`**

Origem: `ORIG/items.js:3-19` (`openShop`, `closeShop`), `:22-27` (`equipItem`), `:30-44` (`rollOffers`), `ORIG/ui.js:100-108` (`itemPrice`), `ORIG/items.js:129-143` (`buyOffer`), `:170-183` (`buyEquipOffer`), `:184-201` (`shopHeal`, `shopReroll`). Aplique T1–T5, mais:

- `gold` global vira `p.gold`; `forgeLevel('merchant')` vira `world.config.forge.merchant`;
- os `sort(() => Math.random() - 0.5)` viram `world.rng.shuffled(...)` — mesmo desvio consciente registrado na Task 16;
- todas as chamadas a `updateHUD()` e `renderShop()` saem: o HUD lê do mundo a cada frame (Task 18) e a `ui/shop.ts` redesenha ao detectar mudança nas ofertas;
- `openShop` faz `setPhase(world, 'shop')` e `rollOffers`; `closeShop` faz `setPhase(world, 'playing')` e `startNextWave`.

- [ ] **Step 4: Portar o DOM para `src/ui/shop.ts`** — `ORIG/items.js:60-64` (`fmtMod`), `:65-128` (`renderShop`), `:144-169` (`equipDelta`). Só HTML: lê `world.shopOffers` / `world.shopEquipOffers` e o jogador, e liga os botões às funções puras da etapa anterior.

- [ ] **Step 5: Rodar e verificar no navegador** — limpar uma wave abre a loja; comprar consumível muda os stats no painel; comprar arma troca o sprite na mão e o comportamento do tiro; a comparação de delta aparece; reroll encarece; curar funciona; sair inicia a próxima wave.

- [ ] **Step 6: Commit**

```bash
npx vitest run && npm run lint && npx tsc --noEmit
git add src/sim/shop.ts src/ui/shop.ts tests/shop.test.ts
git commit -m "feat(sim,ui): loja com logica pura separada do DOM

Precos, ofertas e compras viram funcoes puras testaveis em Node; o
HTML da loja fica em ui/. Ouro passa a ser do jogador.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 20: Camada de aplicação — áudio, save, forge, touch e PWA

O que sobrou do jogo original que não é simulação nem desenho.

**Files:**
- Create: `src/app/audio.ts`, `src/app/save.ts`, `src/app/forge.ts`, `src/ui/touch.ts`, `src/ui/settings.ts`
- Modify: `src/main.ts`, `public/sw.js`

**Interfaces:**
- Consumes: `RunConfig` (Task 3), `Save` shape do original
- Produces:
  - `Sfx` — mesma API do original: `init()`, `play(name)`, `startMusic()`, `stopMusic()`, `setBossMode(on)`, `setVolume(v)`
  - `Save` — mesma API: `data`, `persist()`, `recordRun(cls, run)`, `classRecord(cls)`, `isUnlocked(cls)`, `unlock(cls)`
  - `buildRunConfig(cls, mode, name): RunConfig` — lê o forge do `Save` e sorteia a seed
  - `finishRun(world, localId, won): void` — grava o resultado da run no `Save`
  - `setupTouch(canvas): { vec: {x,y}; active: boolean }`

- [ ] **Step 1: Portar `src/app/audio.ts`** — `ORIG/audio.js` inteiro. Port literal: já é um módulo isolado (IIFE `Sfx`) que só toca som. Trocar a IIFE por `export const Sfx = (() => { … })()` e tipar. `Math.random()` continua permitido aqui — não é `sim/`.

- [ ] **Step 2: Portar `src/app/save.ts`** — `ORIG/save.js` inteiro, mesma conversão. **Troque a chave** `dungeonguys_save_v1` por `dungeonguys2_save_v1`: os dois jogos rodam no mesmo domínio (`github.io`) e compartilhariam `localStorage`, o que faria o progresso de um sobrescrever o do outro. Mantenha a migração de chaves legadas removida — não há legado aqui.

- [ ] **Step 3: Implementar `src/app/forge.ts`**

```ts
// forge.ts — meta progression lives outside the sim; it only produces a RunConfig.
import { Save } from './save';
import type { ClassKey, GameMode, RunConfig } from '../sim/types';

export function forgeLevel(key: string): number {
  return Save.data.progress.forge[key] ?? 0;
}

export function buildRunConfig(classKey: ClassKey, mode: GameMode, playerName: string): RunConfig {
  return {
    // The seed is the one place a run is allowed to be non-deterministic.
    // In Marco 1 the host picks it and sends it to every client.
    seed: (Math.random() * 0xffffffff) >>> 0,
    mode,
    classKey,
    playerName,
    forge: {
      vigor: forgeLevel('vigor'),
      honed: forgeLevel('honed'),
      fleet: forgeLevel('fleet'),
      startgold: forgeLevel('startgold'),
      merchant: forgeLevel('merchant'),
      wise: forgeLevel('wise'),
    },
  };
}
```

Porte também a UI do forge (compra de upgrades com soul gold) de `ORIG/ui.js` — procure por `forgeLevel`, `refreshForgeButton` e a tela de forge.

- [ ] **Step 4: `finishRun`** — porte de `ORIG/engine.js:255-274` (`gameOver`) a parte de persistência: converter `runGoldEarned` em soul gold por `FORGE_RATE`, chamar `Save.recordRun`, atualizar os elementos da tela final. Isso é chamado por `main.ts` ao ver `world.phase` virar `'gameover'` ou `'victory'` — o sim não sabe que save existe.

- [ ] **Step 5: Portar touch e settings** — `ORIG/ui.js:291-368` (joystick e botões), `:369-404` (auto-aim), `:405-438` (som e volume), `:439-450` (screen shake), `:225-280` (desbloqueios, records, seleção de classe e cor), `:189-224` (compartilhar). O joystick alimenta `app/input.ts` com o vetor analógico: em `collect`, quando não há tecla pressionada e `|touch.vec| > 0.12`, use `touch.vec` (que preserva a magnitude parcial).

- [ ] **Step 6: PWA** — atualizar `public/sw.js`: trocar o nome do cache para `dungeonguys2-v1` e os caminhos para os arquivos buildados. Como o Vite gera nomes com hash, a estratégia network-first do original continua sendo a certa; garanta que o `sw.js` seja registrado com `import.meta.env.BASE_URL + 'sw.js'`.

- [ ] **Step 7: Verificar no navegador e em modo mobile** — som e música; mute com M; volume; auto-aim; screen shake ligável; joystick e botões de ataque/especial num viewport de celular; instalar como PWA; sobreviver a um reload offline; soul gold acumulando entre runs e os upgrades do forge fazendo efeito.

- [ ] **Step 8: Commit**

```bash
npm test && npm run lint && npx tsc --noEmit
git add src/app src/ui public/sw.js src/main.ts
git commit -m "feat(app): audio, save, forge, touch e PWA

Save usa a chave dungeonguys2_save_v1 para nao colidir com o jogo
original no mesmo dominio do github.io. O forge deixa de ser lido
dentro do jogo: vira RunConfig entregue ao criar o mundo.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 21: Balanceamento do mundo grande e paridade

A última task fecha o que o mundo 4,17× maior desregulou e prova que o port está fiel.

**Files:**
- Modify: `src/sim/constants.ts`, `src/sim/enemies.ts`, `src/sim/run.ts`, `src/sim/loot.ts`
- Create: `docs/PARIDADE.md`

- [ ] **Step 1: Levantar os números que a mudança de mundo afetou**

Rode uma run de 5 waves nos dois jogos, lado a lado, e anote: tempo até o primeiro inimigo alcançar o jogador; tempo médio para limpar uma wave; ouro ao fim da wave 5; nível ao fim da wave 5; quantas moedas ficaram no chão sem ser coletadas.

- [ ] **Step 2: Ajustar os quatro pontos conhecidos**

1. **Ímã de moedas** (`COIN_MAGNET = 80`). Num mundo maior o jogador cobre proporcionalmente menos área, e moedas ficam para trás. Aumente até que a taxa de moedas perdidas volte ao valor medido no original. Ponto de partida: 130.
2. **Baú da wave** (`ORIG/engine.js`, o bloco `if (wave >= 2 …)`). Um baú sorteado em qualquer ponto de 2400×1600 raramente é encontrado. Posicione-o dentro de um raio de ~700px de um jogador.
3. **Distância de spawn** (`SPAWN_MIN`/`SPAWN_MAX`, Task 12). Compare o tempo até o contato com a medição do original e ajuste.
4. **Densidade da arena** (`AREA_SCALE`, Task 8). Jogue e veja se a arena parece cheia demais ou vazia demais; ajuste o multiplicador, não os números-base.

Cada ajuste é um commit próprio, com o número medido antes e depois na mensagem.

- [ ] **Step 3: Escrever `docs/PARIDADE.md`** — a lista de verificação abaixo, com o resultado de cada item preenchido:

```markdown
# Paridade com o DungeonGuys original

Verificado em: <data> · commit: <sha>

## Classes (jogar uma wave com cada)
- [ ] mage / archer / warrior / ninja / priestess / witch / coprobo
      — ataque, especial, sprite e arma na mão corretos

## Progressão
- [ ] Subir de nível abre 3 bênçãos filtradas pelo tipo de dano
- [ ] Loja entre waves com 4 consumíveis + 4 equipamentos elegíveis
- [ ] Comprar arma troca o comportamento do ataque
- [ ] Escudo bloqueado por arma de duas mãos
- [ ] Delta de comparação correto (incluindo dano médio)
- [ ] Reroll encarece; curar custa 10 e cura 30

## Combate
- [ ] Crítico, esquiva, bloqueio, lifesteal, burn, chill, poison
- [ ] Pierce atravessa; fireball explode em área
- [ ] Knockback no melee; caixas quebram

## Waves
- [ ] 16 waves na campanha; endless não termina
- [ ] Mini-boss nas waves 4 e 12; chefe nas 8 e 16
- [ ] Os 5 mutadores aparecem e fazem o que dizem
- [ ] Elites a partir da wave 3

## Meta
- [ ] Soul gold acumula ao fim da run
- [ ] Upgrades do forge fazem efeito na run seguinte
- [ ] Desbloqueio de ninja (wave 6), coprobo (wave 10), witch (nível 8)
- [ ] Recordes por classe

## Plataforma
- [ ] Controles touch num viewport de celular
- [ ] PWA instalável e funcional offline
- [ ] 60 FPS com o mundo cheio (wave 12+)

## Novo, sem paralelo no original
- [ ] Mundo 2400x1600 com câmera presa às bordas
- [ ] Redimensionar a janela não regenera a arena
- [ ] npm test verde, incluindo o teste de determinismo
```

- [ ] **Step 4: Rodar a suíte inteira uma última vez**

Run: `npm run lint && npx tsc --noEmit && npm test && npm run build`
Expected: os quatro passam.

- [ ] **Step 5: Commit final**

```bash
git add -A
git commit -m "chore: balanceamento do mundo grande e checklist de paridade

Ima de moedas, posicao do bau, distancia de spawn e densidade da
arena reajustados contra medicoes feitas no jogo original.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## Como saber que o Marco 0 acabou

1. `npm run lint && npx tsc --noEmit && npm test && npm run build` — os quatro verdes.
2. `docs/PARIDADE.md` com todos os itens marcados.
3. O jogo publicado no Pages joga como o original, num mundo maior com câmera.
4. `src/sim/` não contém uma única referência a DOM, `window`, `performance`, `Date.now` ou `Math.random` — e a regra de lint garante que continue assim.

O item 4 é o que o Marco 1 vai comprar: uma simulação que roda igual em dois computadores.
