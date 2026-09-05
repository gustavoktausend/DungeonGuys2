# Phase 3: Sala, transporte e protocolo - Pattern Map

**Mapped:** 2026-09-05
**Files analyzed:** 61 (26 editados, 35 criados)
**Analogs found:** 52 / 61 (9 sem analog — todos WebRTC, `ws` e coturn, que nunca existiram neste repositório)

> Rótulos de estrutura ficam em inglês porque são lidos por ferramenta.
> O conteúdo é em português, como o resto dos documentos do projeto.
> **Comentários de código continuam em inglês** (CLAUDE.md, C-6).
>
> **Como ler:** cada excerto abaixo é código que **existe hoje** no repositório, transcrito
> verbatim, com caminho e linha. Onde a coluna "Match Quality" diz `sem analog`, a fonte é
> `03-RESEARCH.md` § "Code Examples" / § "Recommendations for Claude's Discretion" — e a
> convenção de estilo a herdar está em § "Shared Patterns" deste documento.
>
> **Não repete o mapa da fase 2.** `02-PATTERNS.md` já mapeou `tools/sw/*`, `public/sw.js`,
> `ops/*.sh`, `playwright.config.ts` e `tests/pwa/*`. Aqui eles só reaparecem quando são o
> analog mais próximo de um arquivo **novo** da fase 3.

---

## File Classification

### `packages/protocol` — protocolo e codec

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `packages/protocol/src/enums.ts` *(edita)* | protocol (tabelas congeladas) | — | ele mesmo, `:1-28` (doutrina) e `:81-102` (`OBJECTIVE_KIND`) | exato |
| `packages/protocol/src/snapshotCodec.ts` *(cria)* | protocol (codec binário) | transform / batch | **`packages/protocol/src/inputCodec.ts`** | exato |
| `packages/protocol/src/signaling.ts` *(cria)* | protocol (tipos do fio) | request-response | `packages/protocol/src/version.ts` + `runEnvelope.ts:47-60` | role-match |
| `packages/protocol/src/roomCode.ts` *(cria — ou dentro de `signaling.ts`)* | protocol (constante + validador) | transform | **`src/app/ulid.ts:20-21`** (o alfabeto) | parcial |
| `packages/protocol/src/index.ts` *(edita)* | protocol (barrel) | — | ele mesmo, `:12-15` | exato |
| `packages/protocol/src/version.ts` *(edita — bump)* | protocol (versão) | — | ele mesmo, `:20-29` | exato |

### `src/net/` — transporte do cliente (diretório novo)

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `src/net/transport.ts` *(cria)* | net-transport (interface) | event-driven | `apps/server/src/shutdown.ts:29-59` (deps como interface estreita) | parcial |
| `src/net/local.ts` *(cria)* | net-transport (fake em processo) | event-driven / pub-sub | `tests/pwa/helpers.ts:27-48` (servidor de teste com `close()`) | parcial |
| `src/net/lossy.ts` *(cria)* | net-transport (decorator semeado) | event-driven | `tests/input-codec.test.ts:96-108` (corpus semeado com `Rng`) | parcial |
| `src/net/rtc.ts` *(cria)* | net-transport (WebRTC) | streaming / event-driven | — | **sem analog** |
| `src/net/signaling.ts` *(cria)* | net-transport (cliente WS) | request-response | — | **sem analog** |
| `src/net/lobby.ts` *(cria)* | ui + app-glue (máquina de estado) | event-driven | `src/ui/screens.ts:112-153` (`syncScreens`) + `src/ui/shop.ts` | parcial |
| `src/net/ice.ts` *(cria)* | net-transport (telemetria) | request-response | — | **sem analog** |

### `apps/server/src/signaling/` — signaling (diretório novo)

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `apps/server/src/signaling/index.ts` *(cria)* | server-signaling (entrypoint do `upgrade`) | event-driven | `apps/server/src/app.ts:1-23` (fábrica pura com deps) | role-match |
| `apps/server/src/signaling/rooms.ts` *(cria)* | server-signaling (estado efêmero) | CRUD em memória | `apps/server/src/shutdown.ts:83-109` (fábrica com estado local fechado) | parcial |
| `apps/server/src/signaling/schema.ts` *(cria)* | server-signaling (validação) | transform | `apps/server/src/env.ts:47-96` (`required()` + recusa explícita) | role-match |
| `apps/server/src/signaling/turn.ts` *(cria)* | server-signaling (credencial HMAC) | transform | `tools/sim-version/emit.mjs:70-71` (`node:crypto` puro) | parcial |
| `apps/server/src/signaling/limiter.ts` *(cria)* | server-signaling (rate limit) | event-driven | `apps/server/src/shutdown.ts:83-99` (closure com estado + teto) | parcial |
| `apps/server/src/signaling/outcome.ts` *(cria)* | server-signaling (INSERT) | CRUD | `apps/server/src/health.ts:61-73` (`sqlite.prepare` + falha silenciosa) | role-match |
| `apps/server/src/index.ts` *(edita)* | server entry | event-driven | ele mesmo, `:61-76` (o `export const server` que reserva o `upgrade`) | exato |
| `apps/server/src/env.ts` *(edita)* | config | — | ele mesmo, `:47-96` | exato |
| `apps/server/src/db/migrations.ts` *(edita)* | migration | CRUD | ele mesmo, `:49-102` (`001_gold_entry`) | exato |
| `apps/server/src/db/open.ts` *(edita)* | infra (db) | CRUD | ele mesmo, `:18-30` (`GoldEntryTable` + `Schema`) | exato |
| `apps/server/package.json` *(edita)* | config (workspace) | — | ele mesmo, `:6-16` | exato |
| `apps/server/tsconfig.json` *(edita — `include` dos testes novos)* | config | — | ele mesmo, `:27-32` | exato |

### UI e cola do app

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `index.html` *(edita — 4 telas + `#net-badge` + `#btn-coop`)* | markup | — | ele mesmo, `:125-132` (`#pause-screen`) | exato |
| `src/ui/dom.ts` *(edita — 27 ids, 3 telas)* | ui registry | — | ele mesmo, `:22-32` e `:85-93` | exato |
| `src/style.css` *(edita)* | style | build-time | ele mesmo (`.class-card`, `.key`, painel do HUD) | exato |
| `src/main.ts` *(edita — `LOCAL_SLOT`, `beginRun`, `?sala=`)* | app entry | event-driven | ele mesmo, `:177-200` e `:233-251` | exato |
| `src/app/forge.ts` *(edita — `buildRunConfig` de 1 → 4)* | app-glue | transform | ele mesmo, `:19-59` | exato |
| `src/render/sprites.ts` *(edita — extrai helper puro de recolor)* | render | transform | ele mesmo, `:136-174` | exato |
| `src/ui/screens.ts` *(edita — telas novas em `SCREEN_FOR_PHASE`? não; só `announce`)* | ui component | event-driven | ele mesmo, `:29-34`, `:48-54`, `:74-89` | exato |

### `ops/` — infraestrutura do coturn

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `ops/turnserver.conf` *(cria)* | config (infra) | — | `ops/Caddyfile` (forma do cabeçalho e do placeholder) | role-match |
| `ops/coturn-dropin.conf` *(cria)* | config (infra) | — | **`ops/dg2.service:100-115`** (o par de memória) | role-match |
| `ops/Caddyfile` *(edita — resolve o comentário `:25-28`)* | config (infra) | request-response | ele mesmo, `:25-28` e `:96-102` | exato |
| `ops/README.md` *(edita — §12)* | doc (runbook) | — | ele mesmo, §9 e §10 | exato |

### Bench, CI e build

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `tools/bench/snapshot.mjs` *(cria)* | bench (script `.mjs`) | file-I/O / transform | **`tools/sim-version/emit.mjs`** | exato |
| `package.json` *(edita — `bench:snapshot`)* | config | — | ele mesmo, `:10-33` | exato |
| `.github/workflows/ci.yml` *(edita — passo do bench)* | CI config | pipeline | ele mesmo, `:104-116` | exato |
| `eslint.config.js` *(edita — `net` no `no-restricted-imports`)* | config (lint) | — | ele mesmo, `:127-132` | exato |
| `tsconfig.json` *(edita — `exclude` dos testes de servidor novos)* | config | — | ele mesmo, `:25-40` | exato |
| `playwright.config.ts` *(edita — projeto/`testDir` para `tests/net/`)* | config (test runner) | — | ele mesmo, `:19-40` | exato |
| `public/sw.js` · `public/manifest.json` *(confere `?sala=`)* | service worker / config | request-response | ele mesmo (`:125-126`, `:5-6`) | exato |

### Testes

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `tests/snapshot-codec.test.ts` *(cria)* | test (codec) | transform | **`tests/input-codec.test.ts`** | exato |
| `tests/snapshot-bench.test.ts` *(cria)* | test (teto) | batch | `tests/input-codec.test.ts:96-119` (loop com veredito) | role-match |
| `tests/worlds.ts` *(cria)* | test helper (fixtures) | — | **`tests/helpers.ts:23-49`** | exato |
| `tests/net/helpers.ts` *(cria)* | test helper (par de Transport) | event-driven | `tests/helpers.ts` (forma) + `tests/pwa/helpers.ts:1-20` (o "porquê" no cabeçalho) | exato |
| `tests/lobby.test.ts` *(cria)* | test (máquina de estado) | event-driven | `tests/stepper.test.ts` / `tests/run.test.ts` | role-match |
| `tests/room-code.test.ts` *(cria)* | test (unidade) | transform | `tests/ulid.test.ts` | exato |
| `tests/turn.test.ts` *(cria)* | test (unidade) | transform | `tests/ulid.test.ts` (vetor conhecido + injeção de deps) | role-match |
| `tests/ice-route.test.ts` *(cria)* | test (unidade) | transform | `tests/input-codec.test.ts` (tabela de casos) | role-match |
| `tests/ping.test.ts` *(cria)* | test (unidade) | event-driven | `tests/stepper.test.ts` | role-match |
| `tests/run-config-lobby.test.ts` *(cria)* | test (integração) | transform | `tests/cross-engine.test.ts:49-66` (`buildWorld` + `hashWorld`) | exato |
| `tests/net-vocabulary.test.ts` *(cria)* | test (estrutural) | file-I/O | **`tests/protocol-vocabulary.test.ts`** | exato |
| `tests/protocol-enums.test.ts` *(edita — 15 tabelas)* | test (estrutural) | file-I/O | ele mesmo, `:31-65` | exato |
| `tests/snapshots/protocol-enums.json` *(edita)* | test fixture (golden) | — | ele mesmo | exato |
| `tests/purity.test.ts` *(edita — `net` em `FORBIDDEN_LAYER`)* | test (estrutural) | file-I/O | ele mesmo, `:67-78` | exato |
| `tests/workspaces.test.ts` *(edita — `ws`/`zod` confinados)* | test (estrutural) | file-I/O | ele mesmo, `:23-58` | exato |
| `tests/server-migrate.test.ts` *(edita — `ice_outcome`)* | test (integração) | CRUD | ele mesmo, `:33-80` | exato |
| `tests/ops-config.test.ts` *(edita — `turnserver.conf`)* | test (estrutural) | file-I/O | ele mesmo, `:40-89` | exato |
| `tests/cross-engine.test.ts` *(edita — round-trip do codec)* | test (cross-engine) | transform | ele mesmo, `:49-66` | exato |
| `tests/net/room.spec.ts` *(cria)* | test (e2e) | event-driven | **`tests/pwa/install.spec.ts`** | exato |
| `tests/pwa/room-url.spec.ts` *(cria)* | test (e2e) | request-response | `tests/pwa/install.spec.ts` | exato |

---

## Pattern Assignments

### `packages/protocol/src/snapshotCodec.ts` (protocol, transform) — o analog mais forte da fase

**Analog:** `packages/protocol/src/inputCodec.ts` (444 linhas; leia inteiro antes de escrever
uma linha do codec novo — a forma é para ser copiada, não parafraseada).

**Cabeçalho que declara a fronteira e o motivo** (`inputCodec.ts:1-16`):

```ts
// inputCodec.ts — quantisation, the 6-byte tick packet, delta + RLE, and the
// hole-filling policy (FORM-06; ADR 0011: D-02, D-03, D-04, D-12).
//
// The point of this module is that the input log is DATA, not the output of a
// computation. Both quantisers turn a float into a small integer at capture
// time, and every decode is one multiplication or one division — both
// correctly rounded by IEEE-754 per the ECMAScript spec, so the value comes
// back bit-identical on any engine. What `Math.hypot` or `Math.atan2` returned
// on the machine that captured the input never reaches the recording: it dies
// in `quantize`, which is what lets the aiming code in `app/` keep using
// implementation-defined functions without putting determinism at risk (D-05).
//
// `InputState` is imported as a type only, so nothing from the simulation ends
// up in the emitted graph and this package keeps its empty dependency list.
import type { InputState } from '@dg2/sim';
import { MAX_RUN_TICKS, type PlayerSlot } from './runEnvelope';
```

> **Consequência para `snapshotCodec.ts`:** o `import type { World } from '@dg2/sim'` é a
> mesma linha 15, pelo mesmo motivo (`dependencies: {}` de `packages/protocol`, C-3). O
> cabeçalho novo tem de dizer, com a mesma ênfase: (a) o snapshot **nunca** carrega
> `obstacles`/`traps`/`play`/`config` (D3-17); (b) a partição por classe de entidade não é
> filtro de relevância e não pode virar interest management (D3-19); (c) a partição só morde
> por volta da **wave 210** e por isso é exercida por um teste que a força, não pelo bench
> (`03-RESEARCH.md:906-911`) — sem essa frase, alguém futuro conclui que é código morto.

**Constantes de layout nomeadas no topo, com o custo em bytes escrito** (`:18-38`):

```ts
/** 2*pi/65536 — one turn split into 65536 steps (0.005493 degrees). */
export const AIM_STEP = (Math.PI * 2) / 65536;

/**
 * One player's input on one tick, on the wire.
 *
 * int8 move.x, int8 move.y, uint16 LE aim, uint8 flags, uint8 player index.
 * Six bytes at 60 Hz is 360 B/s per player before delta encoding, and the
 * delta takes it to a twentieth of that in practice.
 */
export const TICK_PACKET_BYTES = 6;

/** u32 LE record count, u32 LE tick span. */
const HEADER_BYTES = 8;

/** A tick delta up to 2^32-1 needs five 7-bit groups. */
const MAX_VARINT_BYTES = 5;

const ATTACK = 1;
const SPECIAL = 2;
const SPRINT = 4;
```

> `AIM_STEP` é **exportado** e é o que o codec de snapshot tem de reusar para `facing` e para
> o ângulo de projétil — `03-RESEARCH.md` § Don't Hand-Roll: "duas quantizações de ângulo no
> mesmo código divergem no dia em que uma muda". O cabeçalho de 10 bytes de D3-18 e o
> `POS_SCALE = 8` entram aqui, nesta forma.

**A normalização de `-0`, que é estrutural e não uma linha extra** (`:66-88`):

```ts
/**
 * Quantises one move component to int8 in [-127, 127].
 *
 * The trailing `| 0` is not redundant and must not be "simplified" away.
 * `Math.round(-0.4)` returns -0, and -0/127 is -0 as well, so a barely
 * negative analog stick would inject -0 into the World. JSON serialisation
 * drops that sign silently, and `hashWorld` travels the same lossy path, so a
 * round-trip test verified by hash would PASS on data that had already been
 * corrupted. ADR 0011 therefore canonises -0 to +0 at capture rather than
 * trying to preserve a value the format cannot represent.
 */
function quantizeMove(value: number): number {
  return Math.max(-127, Math.min(127, Math.round(value * 127))) | 0;
}

/**
 * Quantises an angle in radians to the 16 bits that travel on the wire.
 *
 * `& 0xffff` also normalises -0 to 0, for the same reason as above.
 */
function quantizeAim(radians: number): number {
  return Math.round(radians / AIM_STEP) & 0xffff;
}
```

**Escrita/leitura em `DataView`, little-endian, offsets explícitos** (`:144-161`):

```ts
function writeRecord(view: DataView, offset: number, record: InputRecord): void {
  view.setInt8(offset, record.mx);
  view.setInt8(offset + 1, record.my);
  view.setUint16(offset + 2, record.aim, true);
  view.setUint8(offset + 4, record.flags);
  view.setUint8(offset + 5, record.idx);
}

function readRecord(view: DataView, offset: number, t: number): InputRecord {
  return {
    t,
    idx: view.getUint8(offset + 5),
    mx: view.getInt8(offset),
    my: view.getInt8(offset + 1),
    aim: view.getUint16(offset + 2, true),
    flags: view.getUint8(offset + 4),
  };
}
```

**A "forma inteira legível" separada do `World`, que é o que D3-18 pede** (`:40-64`):

```ts
/** The readable, integer form of a log entry — what a fixture stores. */
export type InputRecord = {
  /** Tick this input takes effect on. */
  t: number;
  /** Index into the canonical player order. */
  idx: number;
  /** int8, [-127, 127] — decodes to move.x as mx/127. */
  mx: number;
  /** int8, [-127, 127] — decodes to move.y. */
  my: number;
  /** uint16 on the wire, read back as int16 — decodes as aim * AIM_STEP. */
  aim: number;
  /** uint8: bit0 attack, bit1 special, bit2 sprint, bits 3-7 zero. */
  flags: number;
};
```

> `SnapshotRecord` é o `InputRecord` desta fase: inteiros já quantizados, um comentário por
> campo dizendo a largura e a conversão. `extractSnapshot(world) → SnapshotRecord` é o
> equivalente de `toRecord`; a hidratação de volta a `World` é **fase 4**
> (`03-RESEARCH.md:987-994`).

**Alocação defendida antes de acontecer — o padrão exato para "contagem declarada"** (`:402-428`):

```ts
export function decodeLog(
  blob: string,
  players: PlayerSlot[],
): (tick: number) => Record<string, InputState> {
  const bytes = fromBase64(blob);
  if (bytes.length < HEADER_BYTES) throw new Error('log de input truncado: falta o cabeçalho');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const count = view.getUint32(0, true);
  const ticks = view.getUint32(4, true);
  if (ticks > MAX_RUN_TICKS) {
    throw new Error(`log de input declara ${ticks} ticks, acima do teto de ${MAX_RUN_TICKS}`);
  }
  // Smallest a record can be is one varint byte plus the packet, so this is
  // the most records the received bytes could possibly hold. Checking it
  // before the loop turns "allocate for whatever the header claims" into
  // "allocate for what was actually sent".
  const room = Math.floor((bytes.length - HEADER_BYTES) / (1 + TICK_PACKET_BYTES));
  if (count > room) {
    throw new Error(
      `log de input declara ${count} registros, mais do que os ${room} que cabem nos bytes recebidos`,
    );
  }
```

> Esta é a resposta literal à ameaça T-3-08 da `03-VALIDATION.md` ("decodificador confere
> contagem declarada antes de alocar"). `playerCount`, `enemyCount`, `bulletCount`,
> `coinCount` — cada um ganha um `room` calculado do jeito acima. **Mensagens de erro em
> português**, como todas as deste arquivo.

**Base64 escrito à mão, e o motivo** (`:308-318`) — se o snapshot precisar de texto em
algum ponto (fixture, log), reuse este, não `btoa`/`Buffer`:

```ts
const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

// Base64 by hand rather than through a platform helper: the two obvious ones
// live in different places (a page global and a Node buffer), and this package
// has to compile and run in both without a dependency and without an ambient
// declaration. Sixty lines of table lookup buys that.
```

**Por que o codec cabe em `packages/protocol` — a restrição que decide** (`packages/protocol/tsconfig.json:7-14`):

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

> `DataView`, `ArrayBuffer` e `Uint8Array` estão em `ES2022`; `TextEncoder`, `crypto` e
> `WebSocket` **não**. O codec cabe sem exceção nenhuma — e é isso que prova que ele mora
> aqui e não em `src/net/`.

**O cabeçalho de `serialize.ts` que já prevê este arquivo** (`packages/sim/src/serialize.ts:23-39`) —
cite-o no cabeçalho do codec novo:

```ts
// THE SIGN OF ZERO IS THE ONE VALUE JSON LOSES HERE, AND THE HASH CANNOT SEE
// THE LOSS. `JSON.stringify(-0)` already emits "0", so the fingerprint is
// immune to the bug as it is usually written down — and that immunity is
// precisely the problem: `JSON.parse(JSON.stringify(-0))` gives back +0, and
// hashWorld travels the same lossy path, so a round-trip "verified by hash"
// passes on data that is already corrupt. Two consequences, both deliberate:
//
//   - saveWorld does NOT preserve -0, and does not pretend to. ADR 0011 puts
//     the canonicalisation at CAPTURE (`| 0` after the input quantisation), so
//     no field of a real run ever holds -0 to begin with. Normalising it here
//     as well would be a no-op on this path (JSON already collapses it) while
//     making the format look like it can carry a value it cannot; the day the
//     snapshot becomes a binary codec — where +0 and -0 are different bit
//     patterns — the normalisation belongs in that codec, next to the bits.
//   - tests/serialize.test.ts asserts the invariant STRUCTURALLY, with
//     Object.is, and never by hash alone. The hash cannot be the only witness
//     of its own serialisation path.
```

---

### `packages/protocol/src/enums.ts` (protocol, tabela congelada) — append de `ping`/`pong` + 15 tabelas

**Analog:** ele mesmo. A doutrina inteira já está escrita no cabeçalho e **não deve ser
reescrita** — só estendida.

**O cabeçalho, verbatim** (`:1-28`) — a parte `FORM-12` é o que autoriza a palavra "host"
existir nesse arquivo e em nenhum outro:

```ts
// enums.ts — the frozen wire tables (FORM-11).
//
// APPEND-ONLY. Each table is an ordered array and the INDEX of a name is its
// wire value, which makes exactly one edit safe:
//
//   append at the END      safe. Every value that already existed keeps its
//                          number, so an old reader still decodes correctly
//                          and merely does not recognise the new one.
//   insert in the MIDDLE   break. Every value after the insertion point shifts
//                          by one, so a message written as 'input' is read as
//                          'snapshot'. Nothing throws; it just misbehaves,
//                          somewhere else, later.
//   rename an entry        break, same as above wearing a different name.
//
// tests/protocol-enums.test.ts compares these against the frozen record in
// tests/snapshots/protocol-enums.json and names the table and the index it
// disagrees on. Updating the golden in the same commit is what turns "I
// appended" into a reviewable statement instead of a hope.
//
// FORM-12 — THE PROTOCOL DOES NOT CONTAIN THE WORD "host". This comment is the
// only place it appears in this package, and comments are stripped before the
// check in tests/protocol-vocabulary.test.ts. [...]
```

**A tabela que recebe o append de D3-13** (`:30-48`) — `ping` e `pong` entram **no fim**,
virando os índices 8 e 9:

```ts
/**
 * Message kinds. The index is the wire value.
 *
 * The order is the order of a session: a peer says `hello`, the authority
 * answers `welcome` or `reject`, `lobbyState` carries the slots, `startRun`
 * begins, then `input` and `snapshot` flow for the rest of the run with `ack`
 * closing the loop.
 */
export const MSG_KIND = [
  'hello',
  'welcome',
  'reject',
  'lobbyState',
  'startRun',
  'input',
  'snapshot',
  'ack',
] as const;
export type MsgKind = typeof MSG_KIND[number];
```

**O molde de toda tabela nova, incluindo a regra do índice 0** (`:81-102`):

```ts
/**
 * Mission objective kinds, on the wire from phase 8.
 *
 * `none` sits at index 0 so that an absent or zeroed objective field decodes
 * to "no objective" rather than to a real one — the safe value is the cheap
 * one to get by accident.
 *
 * The table is born here, ahead of its use, because the wire value has to be
 * frozen before anything writes it down. Plan 01-14 asserts that this list
 * matches the simulation's `ObjectiveKind` in the same order; without that
 * check the simulation and the wire would read the same integer as two
 * different objectives.
 */
export const OBJECTIVE_KIND = [
  'none',
  'defend',
  'hunt',
  'purge',
  'fetch',
  'extract',
] as const;
export type ObjectiveKind = typeof OBJECTIVE_KIND[number];
```

> **As 15 tabelas novas** (`ENEMY_TYPE`, `ELITE_TYPE`, `BOSS_STATE`, `CHEST_STATE`,
> `OBSTACLE_KIND`, `ATTACK_KIND`, `CLASS_KEY`, `MUTATOR_KEY`, `PHASE`, `GAME_MODE`,
> `PLAYER_SLOT`, `SNAPSHOT_PART`, `SIGNAL_KIND`, `ICE_ROUTE`, `ICE_CANDIDATE_TYPE` —
> cardinalidades medidas em `03-RESEARCH.md:938-954`) copiam **exatamente** essa forma: bloco
> de doc explicando o que espelha e por que existe, array `as const`, `export type X =
> typeof X[number]`. `ELITE_TYPE` e `MUTATOR_KEY` põem `'none'` no índice 0 e **repetem o
> motivo**, não linkam para ele.

**O lado do sim que já documenta o espelhamento** (`packages/sim/src/types.ts:295-300`) — o
comentário recíproco pertence a cada tipo do sim que ganhar tabela:

```ts
 * The order MIRRORS `OBJECTIVE_KIND` in packages/protocol, where the INDEX of
 * a name is its wire value. The two lists are two spellings of one table, so
 * they have to be reordered together or a message written as 'hunt' is read as
 * 'purge' — silently, somewhere else, later.
```

**O barrel, que ganha dois re-exports** (`packages/protocol/src/index.ts:1-15`):

```ts
// index.ts — the single public surface of @dg2/protocol.
//
// `exports` in package.json declares only "." and deliberately offers no
// subpaths, exactly as @dg2/sim does: one entry means one module graph, which
// is what lets the boundary of the package coincide with the boundary of
// whatever gets hashed or bundled from it.
//
// This package is types, frozen tables and one pure function. It opens no
// socket and holds no state — the transports of phases 3 to 5 import the
// shapes from here, they do not live here.

export * from './enums';
export * from './inputCodec';
export * from './runEnvelope';
export * from './version';
```

> A frase "the transports of phases 3 to 5 import the shapes from here, they do not live
> here" é o teste de aceitação do `signaling.ts` novo: se ele precisar de runtime, está no
> pacote errado.

**O bump de `PROTOCOL_VERSION`** (`packages/protocol/src/version.ts:20-29`) — `ping`/`pong`
e o codec **mudam o significado dos bytes**, então a linha 29 sobe no mesmo commit:

```ts
/**
 * Bumped by hand, and only when the meaning of bytes on the wire changes:
 * a new message kind, a changed field layout, a changed framing rule.
 *
 * Typed as `string` rather than the literal `'1'` on purpose. This value is
 * compared against strings that arrived from a remote machine, so narrowing it
 * to a literal would let the compiler "prove" things about a runtime-variable
 * comparison and reject perfectly correct future code with "no overlap".
 */
export const PROTOCOL_VERSION: string = '1';
```

---

### `tests/protocol-enums.test.ts` + `tests/snapshots/protocol-enums.json` (test, estrutural)

**Analog:** eles mesmos. As tabelas novas entram em **dois** lugares no **mesmo commit** — é
a fricção deliberada que o próprio arquivo descreve.

**O registro de tabelas e o texto de reparo** (`:31-46`):

```ts
/**
 * Every frozen table, by name. Registering a new table here AND in the golden
 * is deliberate friction: a new table is a new wire concept, and the two-file
 * edit is the moment to ask whether it really belongs on the wire.
 */
const TABLES: Record<string, readonly string[]> = {
  MSG_KIND, REJECT_REASON, CHANNEL_CLASS, OBJECTIVE_KIND,
};

const GOLDEN: Record<string, readonly string[]> = GOLD;

/** How to repair a failure, appended to the messages that need it. */
const HOWTO =
  'Se a mudança foi um APPEND no fim, atualize tests/snapshots/protocol-enums.json ' +
  'no mesmo commit. Se foi inserção no meio ou renomeação, desfaça: isso reinterpreta ' +
  'silenciosamente toda mensagem já gravada.';
```

**A comparação que aponta tabela e índice** (`:48-65`) — nada aqui muda; só o `TABLES` cresce:

```ts
describe('tabelas de enum do protocolo (FORM-11)', () => {
  it('o módulo e o ouro declaram o mesmo conjunto de tabelas', () => {
    expect(Object.keys(TABLES).sort()).toEqual(Object.keys(GOLDEN).sort());
  });

  it('cada tabela bate com o ouro valor a valor, na ordem', () => {
    for (const [name, live] of Object.entries(TABLES)) {
      const gold = GOLDEN[name] ?? [];
      // Walk to the longer of the two so an append shows up as a divergence at
      // its own index (`gold[i]` undefined) instead of as a bare length
      // mismatch. The index is the actionable half of the message.
      const n = Math.max(gold.length, live.length);
      for (let i = 0; i < n; i++) {
        expect(live[i], `${name}[${i}] divergiu do ouro. ${HOWTO}`).toBe(gold[i]);
      }
      expect(live.length, `${name} mudou de cardinalidade. ${HOWTO}`).toBe(gold.length);
    }
  });
```

**Os testes de pinagem por tabela** (`:88-101`) — cada tabela nova ganha o seu, no mesmo
estilo de uma asserção por propriedade nomeada:

```ts
  it('REJECT_REASON cobre as duas razões de versão que D-08 exige na tela', () => {
    expect(REJECT_REASON).toContain('simVersion');
    expect(REJECT_REASON).toContain('protocolVersion');
  });

  it('CHANNEL_CLASS tem as duas classes que a fase 3 vai abrir', () => {
    expect(CHANNEL_CLASS).toEqual(['reliable', 'unreliable']);
  });

  it('OBJECTIVE_KIND começa em none', () => {
    // 'none' at index 0 so that a zeroed/absent objective field decodes to
    // "no objective" rather than to a real one.
    expect(OBJECTIVE_KIND[0]).toBe('none');
  });
```

> **A pinagem contra o sim** que D3-19/#9 pede (`ENEMY_TYPE` ↔ chaves de `ENEMY_DEFS`,
> `CLASS_KEY` ↔ `ClassKey`, `PHASE` ↔ `Phase`) segue o padrão `OBJECTIVE_KIND` ↔
> `ObjectiveKind` já citado no cabeçalho do sim: comparar **na ordem**, não como conjunto.

**O golden, formato exato** (`tests/snapshots/protocol-enums.json:1-11`) — array por tabela,
indentação de 2, tabelas na ordem de declaração:

```json
{
  "MSG_KIND": [
    "hello",
    "welcome",
    "reject",
    "lobbyState",
    "startRun",
    "input",
    "snapshot",
    "ack"
  ],
```

---

### `tests/snapshot-codec.test.ts` (test, codec)

**Analog:** `tests/input-codec.test.ts`.

**O cabeçalho que proíbe o matcher de tolerância** (`:1-12`) — vale palavra por palavra para
o snapshot, e é o que `03-RESEARCH.md` § Pitfall 9 exige:

```ts
// input-codec.test.ts — FORM-06: the input log is quantised AT CAPTURE, and
// what gets written is the table the authority resolved, hole-filling
// included.
//
// Every assertion here uses Object.is, and never the tolerance-based float
// matcher. That is not style: two of these tests are ABOUT the difference
// between -0 and +0, and an approximate matcher (like `===`) reports those two
// as equal. A tolerance-based comparison in a codec test would pass on a codec
// that silently loses bits, which is the one failure this file exists to
// catch. The banned matcher is named by description because the acceptance
// check for this file is a grep for its name — the same conflict plan 01-06
// hit four times, resolved the same way.
```

**O comparador campo a campo com `Object.is`** (`:47-56`) — o `expectDeepIs` que
`03-RESEARCH.md:1449` pede é a generalização disto:

```ts
/** Field-by-field identity. `Object.is` is the only comparison that sees -0. */
function expectSameInput(got: InputState, want: InputState): void {
  expect(Object.is(got.tick, want.tick), 'tick').toBe(true);
  expect(Object.is(got.move.x, want.move.x), `move.x ${got.move.x} vs ${want.move.x}`).toBe(true);
  expect(Object.is(got.move.y, want.move.y), `move.y ${got.move.y} vs ${want.move.y}`).toBe(true);
  expect(Object.is(got.aim, want.aim), `aim ${got.aim} vs ${want.aim}`).toBe(true);
  expect(got.attack).toBe(want.attack);
  expect(got.special).toBe(want.special);
  expect(got.sprint).toBe(want.sprint);
}
```

**A idempotência sobre corpus semeado, com contagem de falhas em vez de parada no primeiro**
(`:96-119`) — é a forma exata para `extract(load(record)) === record`:

```ts
  it('é idempotente sobre 200.000 amostras de um corpus determinístico', () => {
    // Seeded Rng, never Math.random: a corpus that changes between runs turns
    // a reproducible failure into a flake.
    const rng = new Rng(0x5eed1234);
    let failures = 0;
    for (let n = 0; n < 200000; n++) {
      const sample = raw(
        n,
        rng.range(-1.5, 1.5),
        rng.range(-1.5, 1.5),
        rng.range(-Math.PI, Math.PI),
        rng.int(8),
      );
      const once = quantize(sample);
      const twice = quantize(once);
      if (
        !Object.is(once.move.x, twice.move.x) ||
        !Object.is(once.move.y, twice.move.y) ||
        !Object.is(once.aim, twice.aim)
      ) {
        failures++;
      }
    }
    expect(failures).toBe(0);
  });
```

**Construir bytes à mão para testar a recusa sem materializar o payload** (`:58-73`) — é como
se testa "declara 60000 inimigos e manda 12 bytes":

```ts
/**
 * Builds a log blob header by hand, so the tick-ceiling refusal can be tested
 * without materialising 648.001 ticks of table (which is the very cost the
 * ceiling exists to refuse paying).
 *
 * Layout under test: u32 LE record count, u32 LE tick span, then the records.
 */
function craftHeader(count: number, ticks: number): string {
  const bytes = new Uint8Array(8);
  const view = new DataView(bytes.buffer);
  view.setUint32(0, count, true);
  view.setUint32(4, ticks, true);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}
```

---

### `tests/worlds.ts` (test helper, fixtures do World sintético)

**Analog:** `tests/helpers.ts` — mesmo diretório, mesma regra de nome (`.ts` sem `.test.`),
mesma prática de explicar **por que** cada fixture é o que é.

**O manifesto base e o motivo do deep-copy** (`:15-45`):

```ts
/**
 * The run manifest almost every test builds its world from.
 *
 * The single slot is 'p1' because that is the id the suite has always passed
 * to `createPlayer`, and `runTicks` below feeds inputs under the same key —
 * `step()` iterates `config.players`, so a slot that is not listed here gets
 * no tick at all.
 */
export const BASE_CONFIG: RunConfig = {
  seed: 20260827,
  mode: 'campaign',
  players: [{
    id: 'p1',
    name: 'TEST',
    cls: 'mage',
    forge: { vigor: 0, honed: 0, fleet: 0, startgold: 0, merchant: 0, wise: 0, golden: 0 },
  }],
};

/**
 * A world from BASE_CONFIG, with `players` DEEP-COPIED.
 *
 * The copy is what lets a test write `w.config.players[0].forge.wise = 3`
 * without that value leaking into every other world built afterwards — a
 * shared literal would make the suite order-dependent, which is the one thing
 * a determinism suite must never be.
 */
export function makeTestWorld(overrides: Partial<RunConfig> = {}): World {
  const players = BASE_CONFIG.players.map(s => ({ ...s, forge: { ...s.forge } }));
  return createWorld({ ...BASE_CONFIG, players, ...overrides });
}
```

> `tests/worlds.ts` acrescenta `wave1FourPlayers()`, `wave16SwarmElite()` e
> `wave40Endless()`, construídos pelas fórmulas do sim (`makeEnemy`, `makeElite`,
> `round((4 + wave*3) * 1.6)`), com os tetos de projétil e loot como **constantes nomeadas no
> arquivo** (D3-20). O bench e o teste importam o **mesmo** módulo — é isso que faz o teto ser
> um só. Os tetos medidos que servem de ponto de partida estão em `03-RESEARCH.md:1104-1108`.

**Os campos do `World` que o codec particiona** (`packages/sim/src/types.ts:341-384`) — a
fonte da partição de D3-19; `obstacles`, `traps`, `play` e `config` **não** viajam:

```ts
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
  ...
```

---

### `tools/bench/snapshot.mjs` (bench, script `.mjs`)

**Analog:** `tools/sim-version/emit.mjs` (82 linhas — copie a estrutura inteira).

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

**Contrato de falha e de sucesso — `tools/README.md` §3 em código** (`:48-80`):

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
  ...
  console.log(`SIM_VERSION = ${simVersion}  (${bytes.length} bytes)`);
}

main();
```

> **Uma linha em `stdout`, saída 0** — para o bench essa linha é o número que o PR mostra:
> `snapshot wave16: parte0 1476 B · parte1 798 B · parte2 644 B · teto 16384 B`. O
> `03-RESEARCH.md:1096-1098` explica por que o script **e** o teste existem: o script torna a
> regressão visível, o teste quebra o build.

**A convenção que governa o arquivo** (`tools/README.md` §1-§3, verbatim):

```md
## 1. Extensão `.mjs` explícita

Todo script usa a extensão **`.mjs`**, mesmo com `"type": "module"` no
`package.json` da raiz.

## 2. Invocação sempre por script de `package.json`

O CI chama **`npm run <script>`**, nunca o caminho do arquivo.

## 3. Falha e sucesso

- **Falha**: `console.error` com o prefixo `arquivo:ponteiro: mensagem`, seguido
  de `process.exit(1)`.
- **Sucesso**: **uma** linha em `stdout` e saída **0**. Sem enfeite, sem banner.
- **Sem `throw` não tratado.**
```

> **Atenção (mudou desde a fase 2):** `tools/` **não está mais** no `ignores` do ESLint —
> `eslint.config.js:61` lista só `['dist', 'dist-server', 'packages/*/dist', 'node_modules',
> 'tests/pwa/fixtures']`. O §5 do `tools/README.md` está desatualizado; o bench novo **vai ser
> lintado**. O §4 continua valendo: `tools/` fica fora do `tsc --noEmit`.

**A entrada de uma linha em `package.json:10-33`** (junto de `sim:version`, `sw:emit`):

```json
    "sw:emit": "node tools/sw/emit.mjs",
    "sw:verify": "node tools/sw/verify.mjs",
    "golden:rebaseline": "node tools/golden/rebaseline.mjs",
```

**O passo no CI** (`.github/workflows/ci.yml:104-116`) — o bench entra depois de `npm test`,
antes de `sim:version:verify`, com o comentário dizendo o que ele prova:

```yaml
      - run: npm ci
      - run: npm run lint
      # segunda guarda de pureza de packages/sim (D-16): lib sem DOM e types vazio,
      # entao o proprio compilador recusa window/document dentro do pacote
      - run: npm run typecheck:sim
      - run: npm run typecheck:protocol
      ...
      - run: npm run typecheck:server
      - run: npm test
```

> Note que os comentários do `ci.yml` são **em português sem acento** (o arquivo inteiro é
> assim). Siga o arquivo, não a regra geral.

---

### `src/net/transport.ts`, `local.ts`, `lossy.ts` (net-transport)

**Analog parcial:** `apps/server/src/shutdown.ts` — é o arquivo deste repositório que melhor
demonstra "interface estreita + deps injetadas + o motivo escrito".

**Interface declarada pelo que o chamador precisa, não pelo objeto real** (`shutdown.ts:29-59`):

```ts
/** The database handle, in the only aspect this module needs: it can be shut. */
export interface ClosableDb {
  close(): unknown;
}

/**
 * The HTTP server, in the only aspect this module needs: it can stop accepting
 * connections and say when the last in-flight one has finished.
 *
 * Structurally satisfied by the `http.Server` that @hono/node-server's serve()
 * returns, which is the object index.ts already exports for phase 3 to attach
 * the `ws` upgrade handler to.
 */
export interface DrainableServer {
  close(onClosed: (error?: Error) => void): unknown;
}

export interface ShutdownDeps {
  server: DrainableServer;
  sqlite: ClosableDb;
  /** Ends the process. `process.exit` on the box; a spy in the test. */
  exit: (code: number) => void;
  /**
   * Arms the deadline that stops a client from postponing the restart, and
   * calls `fire` when it expires. Injected rather than called here because
   * `setTimeout` is a Node global and this module refuses to hold one — and
   * because a test that had to WAIT for a real timer would be a slow test
   * asserting a clock instead of a sequence.
   */
  startWatchdog: (fire: () => void) => void;
}
```

> É a mesma razão pela qual `Transport` existe: `local.ts` satisfaz a interface
> estruturalmente e o `lobby.ts` é testável em Node, sem browser, sem servidor, sem a caixa
> (`03-RESEARCH.md:712-714`). O `startWatchdog` injetado é o precedente exato para o timer do
> ping de 1 Hz e o timeout de 3 s de D3-13/§#11.

**Fábrica com estado fechado e idempotência declarada** (`shutdown.ts:73-109`) — a forma de
`createLocalTransport()`, `createLossy()` e do limiter do servidor:

```ts
/**
 * Builds the signal handler. Calling it starts the shutdown; calling it again
 * does nothing.
 *
 * The sequence is: stop accepting, let the in-flight work finish, close the
 * database, exit 0. Idempotency is not decoration — systemd sends SIGTERM and
 * an impatient operator adds a Ctrl+C, and a second `server.close()` invokes
 * its callback with ERR_SERVER_NOT_RUNNING, which would run the exit path a
 * second time against a handle the first one already closed.
 */
export function createShutdown({ server, sqlite, exit, startWatchdog }: ShutdownDeps): () => void {
  let started = false;
  let finished = false;
  ...
```

**A forma da interface que a pesquisa já fixou** (`03-RESEARCH.md:460-483`) — copie o
cabeçalho junto com o código, porque é ele que carrega FORM-12:

```ts
// src/net/transport.ts
// FORM-12 — EVERY MESSAGE CROSSES EXACTLY ONE HOP, AND THE FAR END OF THAT HOP IS THE
// AUTHORITY. There is deliberately no `broadcast` on this interface: a broadcast is what
// lets calling code stop thinking about legs, and the day the authority moves to a
// dedicated server the legs are the only thing that did not change. Sending to three
// peers is a loop over three sends, written where the loop is meaningful.
import type { ChannelClass } from '@dg2/protocol';

/** A transport handle. Dies with the connection; never enters the World (ADR 0001). */
export type PeerId = string;
```

**O PRNG semeado do `lossy.ts`** — o precedente está em `tests/input-codec.test.ts:97-99`:

```ts
    // Seeded Rng, never Math.random: a corpus that changes between runs turns
    // a reproducible failure into a flake.
    const rng = new Rng(0x5eed1234);
```

> `src/net/` **pode** importar `Rng` de `@dg2/sim`; o inverso é o que os três guardas
> proíbem (ver § Shared Patterns 2).

**O servidor de teste com `close()` de verdade** (`tests/pwa/helpers.ts:27-48`) — o molde de
"o fake precisa poder morrer, e o cabeçalho diz por quê":

```ts
export interface StaticServer {
  /** `http://127.0.0.1:<ephemeral port>` — a secure context, so no TLS needed. */
  readonly origin: string;
  ...
  /** Stops the listener AND destroys open sockets. Resolves when truly gone. */
  close(): Promise<void>;
}
```

---

### `src/net/lobby.ts` (ui + app-glue, event-driven)

**Analog parcial:** `src/ui/screens.ts` — mas com **uma inversão declarada**, e ela precisa
estar no cabeçalho do arquivo novo (`03-RESEARCH.md:1084-1087`, UI-SPEC "Open For The
Planner" #3).

**O padrão que o lobby NÃO segue, escrito no analog** (`screens.ts:1-12`):

```ts
// `syncScreens(world, localId)` is the *only* place that decides which
// screen is visible — it polls `world.phase` once per frame (called from
// main.ts's render hook) instead of the original's scattered `showScreen()`
// calls sprinkled through game logic. No sim or game code calls into this
// file's screen-switching; it only ever reads `world`.
```

> **O lobby é a primeira tela do jogo dirigida por estado de REDE e não por `world`.** Não há
> `World` até `startRun`. Escreva isso no cabeçalho de `src/net/lobby.ts` com essa ênfase, ou
> o próximo a mexer procura o `world` e não acha.

**A troca de tela, que continua sendo a mesma função** (`screens.ts:29-34`):

```ts
/** ORIG/engine.js:52-54. */
export function showScreen(name: string | null): void {
  for (const s of Object.values(dom.screens)) s.classList.remove('active');
  if (name && name in dom.screens) {
    dom.screens[name as keyof typeof dom.screens].classList.add('active');
  }
}
```

**Conteúdo remoto vai por nós, nunca por `innerHTML`** (`screens.ts:48-54` e `:56-73`) — o
comentário do analog **já nomeia a fase 3** como a razão de a regra existir:

```ts
/** A `<span class="...">text</span>`, built rather than concatenated. */
function span(className: string, text: string): HTMLSpanElement {
  const el = document.createElement('span');
  el.className = className;
  el.textContent = text;
  return el;
}
```

```ts
 * Built as NODES, and not as a string that gets parsed as markup. `b.icon`,
 * `b.name` and the stat labels are sim constants today, so there is no live
 * hole here; two things make it worth closing now rather than later. There is
 * no CSP, and phase 3 makes `World` contents arrive over WebRTC from a peer —
 * the moment a `Blessing` can be authored remotely, a concatenated
 * `innerHTML` is a stored-XSS sink on the origin that will be holding the
 * session cookie from phase 6 on.
```

> O nome do jogador e a classe que chegam no `lobbyState` são **exatamente** o conteúdo
> remoto dessa frase. `textContent` sempre (UI-SPEC § Accessibility, última linha).

**Remendar no lugar, não recriar** (`screens.ts:149-152`) — o mesmo gate que o lobby usa para
repintar a 1 Hz sem piscar:

```ts
  if (p && world.phase === 'levelup' && p.levelChoices !== paintedChoices) {
    paintedChoices = p.levelChoices;
    renderLevelupChoices(p.levelChoices);
  }
```

**Delegação de clique num container construído por JS** (`screens.ts:157-163`) — é o padrão
para os cards de classe do lobby:

```ts
dom.levelupChoices.addEventListener('click', e => {
  if ((e as MouseEvent).detail === 0) return; // keyboard-activated click, not a real click
  const btn = (e.target as HTMLElement).closest('.shop-item[data-i]') as HTMLElement | null;
  if (!btn || !boundWorld || !boundLocalId) return;
  ...
```

> **Ressalva da UI-SPEC:** os botões do lobby **não** usam `mouseOnly()` (Enter/Espaço têm de
> funcionar fora da run); o `#btn-relay-flag`, que fica visível durante a run, **usa**. E o
> `detail === 0` acima é a mesma guarda vista por outro ângulo — se ela ficar, o teclado não
> ativa.

**O `announce()` reservado a um caso só** (`screens.ts:180-192`):

```ts
/**
 * ORIG/engine.js:335-341 (`announceWave`). Cancels any previous hide timer
 * first — without that, a fast second announcement gets cut short by the
 * first one's timeout instead of getting its own full 2600ms.
 */
export function announce(text: string): void {
  dom.waveAnnounce.textContent = text;
  ...
```

> UI-SPEC: `announce()` **não** é usado no lobby (toast de 2600 ms, 44 px, no centro exato da
> tela — cobriria os slots). Fica reservado a "SALA ENCERRADA" (D3-02). As mudanças de estado
> do lobby vão para `#lobby-status`, `role="status" aria-live="polite"`.

---

### `index.html` + `src/ui/dom.ts` + `src/style.css` (ui, 27 ids novos)

**Analog:** os próprios arquivos.

**A forma de uma tela** (`index.html:125-132`) — os quatro `<div class="screen">` novos
copiam esta estrutura (`.screen` > `.screen-inner` > título + botões `.btn-pixel`):

```html
    <div id="pause-screen" class="screen">
      <div class="screen-inner compact">
        <div class="pause-title">— PAUSED —</div>
        <button id="btn-resume" class="btn-pixel">▶ RESUME</button>
        <button id="btn-pause-restart" class="btn-pixel secondary">↺ RESTART</button>
        <button id="btn-quit" class="btn-pixel secondary">✕ QUIT</button>
      </div>
    </div>
```

**Onde `#btn-coop` entra** (`index.html:118-119`):

```html
        <button id="btn-start" class="btn-pixel">▶ START GAME</button>
        <button id="btn-update" class="btn-pixel secondary hidden">⟳ RECARREGAR AGORA</button>
```

**O registro de telas que ganha `room`, `lobby` e `desync`** (`src/ui/dom.ts:19-32`):

```ts
// Every id is resolved with `document.getElementById(id)!` — if an id is
// missing from index.html, that surfaces immediately as a runtime error the
// first time the element is touched, not a silently-ignored null.
export const dom = {
  screens: {
    start: document.getElementById('start-screen')!,
    pause: document.getElementById('pause-screen')!,
    shop: document.getElementById('shop-screen')!,
    gameover: document.getElementById('gameover-screen')!,
    victory: document.getElementById('victory-screen')!,
    levelup: document.getElementById('levelup-screen')!,
    forge: document.getElementById('forge-screen')!,
    stats: document.getElementById('stats-screen')!,
  },
```

**Entrada comentada por bloco, citando a decisão** (`dom.ts:89-91`) — o molde de comentário
para o bloco novo:

```ts
  // The PWA update offer (D2-09): a service worker stuck in `waiting` has no
  // way to announce itself, so main.ts offers this button instead.
  btnUpdate: document.getElementById('btn-update')!,
```

**O guarda que torna a regra executável** (`tests/dom-ids.test.ts:43-48`) — **não precisa de
edição**; o `MIN_IDS` continua válido com 112 ids:

```ts
const MIN_IDS = 80;

/** Only the single-quoted single-line form, which is the only form dom.ts uses
 *  (checked: zero double-quoted calls). MIN_IDS is what notices if that ever
 *  stops being true. */
const ids = [...domSrc.matchAll(/document\.getElementById\('([^']+)'\)/g)].map(m => m[1]!);
```

> **Duas armadilhas de nome, medidas na UI-SPEC e confirmadas no código:**
> 1. `src/ui/settings.ts:55-57` faz `document.querySelectorAll('.class-card')` **global** —
>    por isso os cards do lobby são `.lobby-slot` / `.lobby-class-card`, nomes próprios, e as
>    regras de `style.css` ganham o seletor novo na lista em vez de uma cópia da declaração.
> 2. `settings.ts:32-35` dá `blur()` em **todo** botão clicado — por isso a tela nova é
>    obrigada a recolocar o foco ao abrir, ou o teclado perde o lugar a cada ação:
>    ```ts
>    // ORIG/ui.js:162-165 — buttons drop focus after click so Space (the attack
>    // key) never re-activates them, and every click gets a tiny confirmation blip.
>    document.addEventListener('click', e => {
>      const btn = (e.target as HTMLElement).closest?.('button');
>      if (btn) { btn.blur(); Sfx.play('click'); }
>    });
>    ```

**O `#net-badge` segue o HUD, que é DOM e não canvas** (`src/ui/hud.ts:5-17`):

```ts
// T1 inversion (see task-18-brief.md): the original called this from inside
// game logic — after buying something, after taking damage, after levelling.
// Here it is called once per frame from the render hook (main.ts), reading
// `world` and `world.players[localId]`. It makes no calls back into game
// logic and pushes nothing anywhere else; it only ever writes DOM text/style
// derived from the current world snapshot.
export function updateHud(world: World, localId: string): void {
  const p = world.players[localId];
  if (!p) return;
```

> O badge escreve `textContent`/`style` uma vez por quadro, no mesmo `frame()`, e **não toca
> no `world`** — a diferença é que a fonte dele é o estado de rede, não o World.

---

### `src/render/sprites.ts` (render, transform) — extrair o helper puro de recolor

**Analog:** ele mesmo. `recolorPlayerSheet` escreve no módulo-global `playerSheet`
(`:131-132`), que é a folha que a run inteira desenha:

```ts
/** Recolored copy used to draw the player. Defaults to the sheet's own colors. */
export let playerSheet: HTMLImageElement | HTMLCanvasElement = SHEET;
```

**O corpo a extrair** (`:136-174`) — o helper novo **devolve** o canvas em vez de atribuir, e
`recolorPlayerSheet` passa a ser uma linha em cima dele:

```ts
export function recolorPlayerSheet(cls: ClassKey, rgb: [number, number, number]): void {
  // each class recolors a copy of ITS OWN atlas (0x72 sheet or a mixer sheet)
  const srcSheet = ANIMS[CLASS_DEFS[cls].anim].sheet ?? SHEET;
  if (!srcSheet.complete || srcSheet.naturalWidth === 0) { playerSheet = srcSheet; return; }
  try {
    const oc = document.createElement('canvas');
    oc.width  = srcSheet.naturalWidth;
    oc.height = srcSheet.naturalHeight;
    const c = oc.getContext('2d');
    if (!c) { playerSheet = srcSheet; return; }
    c.drawImage(srcSheet, 0, 0);

    const { light, dark } = OUTFIT_COLORS[cls];
    const target = rgb;
    const shade  = lum(dark) / lum(light); // keep the original shading ratio
    ...
    c.putImageData(img, rx, ry);
    playerSheet = oc;
  } catch {
    playerSheet = srcSheet; // canvas tainted (file:// double-click) — keep defaults
  }
}
```

> **O defeito que a UI-SPEC previne:** quatro slots em quatro cores chamando essa função
> sobrescreveriam um ao outro e a run começaria com a cor do último. O lobby guarda **um
> canvas por slot**, com chave `` `${cls}|${r},${g},${b}` ``, e repinta só quando a chave
> muda. Quadro **idle 0 parado** — ao contrário do `#color-preview`, que anima:
> ```ts
> // idle animation on the preview while the start screen is up (ORIG/ui.js:645-650).
> setInterval(() => {
>   if (dom.screens.start.classList.contains('active')) {
>     previewFrame++;
>     drawColorPreview();
>   }
> }, 250);
> ```
> (`src/ui/settings.ts:135-141` — o que **não** copiar.)

**De onde vem a cor que viaja no `lobbyState`** (`src/ui/settings.ts:126-133`, `src/app/save.ts:27`):

```ts
[dom.sliderR, dom.sliderG, dom.sliderB].forEach(sl => sl.addEventListener('input', () => {
  const c: [number, number, number] = [Number(dom.sliderR.value), Number(dom.sliderG.value), Number(dom.sliderB.value)];
  ...
  Save.data.settings.colors[selectedClass] = c;
```

```ts
    colors: Record<string, [number, number, number]>;
```

---

### `src/main.ts` + `src/app/forge.ts` (app-glue) — o ponto único de integração

**Analog:** eles mesmos. `03-RESEARCH.md:1080-1083` diz que esta é a integração inteira.

**A linha que deixa de ser constante** (`src/main.ts:177-188`) — o comentário já anuncia a
mudança:

```ts
/**
 * The slot this machine plays. FORM-01/D-30 numbers the slots p0..p3, and this
 * app has always occupied the first one — it just used to spell that slot with
 * a one-based name, repeated as a literal in six places.
 *
 * The name matters more than the number. `playerId` is the slot the AUTHORITY
 * assigns and the replay knows; it is not `accountId` (the durable server ULID,
 * which never enters the World) and it is not `peerId` (a transport handle that
 * dies with the connection). When phase 4 makes this value arrive from a lobby
 * instead of being a constant, this is the single line that stops being one.
 */
const LOCAL_SLOT: PlayerSlot = 'p0';
```

**Os quatro consumidores dessa constante** (`:195-208`, `:251`) — todos passam a receber o
slot em vez de fechar sobre ele:

```ts
function frame(w: World, alpha: number): void {
  updateHud(w, LOCAL_SLOT);
  syncScreens(w, LOCAL_SLOT);
  updateCamera(cam, player, canvas.width, canvas.height);
  render(w, cam, alpha, ctx, fx, LOCAL_SLOT);
}
```

**A sequência de início de run que `startRun` (D3-05) tem de reproduzir bit a bit** (`:233-251`):

```ts
function beginRun(classKey: ClassKey, mode: GameMode, playerName: string): void {
  // tear down whatever was running before — a no-op the very first time.
  stopSimLoop?.();
  stopSimLoop = null;
  cancelAnimationFrame(pauseRaf);
  input?.destroy();

  const config = buildRunConfig(LOCAL_SLOT, classKey, mode, playerName);
  world = createWorld(config);
  buildTilemap(); // fresh floor-tile variants each run, ORIG/engine.js:171,219
  // Read back from the manifest rather than from the arguments: the manifest
  // is what a replay is rebuilt from, so a run that starts from a different
  // class than it records is a divergence nobody would see until the replay.
  const local = config.players[0];
  player = createPlayer(world, local.id, local.cls, local.name);
  startRun(world);
```

> "Read back from the manifest rather than from the arguments" é a regra que faz o `RunConfig`
> recebido pelo fio ser a única fonte — exatamente o que D3-05 precisa. `config.players[0]`
> passa a ser `config.players.find(p => p.id === mySlot)`.

**A mesma sequência, no teste que já a canoniza** (`tests/cross-engine.test.ts:49-55`) — é o
molde de `tests/run-config-lobby.test.ts`:

```ts
/** The canonical start-of-run sequence, exactly as main.ts:120-124 does it. */
function buildWorld(): World {
  const world = createWorld(GOLDEN.config);
  for (const slot of GOLDEN.config.players) createPlayer(world, slot.id, slot.cls, slot.name);
  startRun(world);
  return world;
}
```

**`buildRunConfig`, de um jogador para quatro** (`src/app/forge.ts:19-59`) — o doc-comment já
descreve a mudança que esta fase faz:

```ts
/**
 * The run manifest this machine starts a run from.
 *
 * `players` is a one-entry array today because the game is solo, and the
 * ARRAY IS THE CANONICAL ORDER (FORM-02/D-13) — `step()` iterates it. When
 * phase 4 makes a room, the authority builds this array instead, and nothing
 * inside the simulation has to change to notice.
 *
 * `slot` is a PARAMETER rather than a constant read from here, because the
 * slot is assigned by the authority (ADR 0001) and this module is not it.
 * Today main.ts always passes p0; the day a lobby answers instead, this
 * signature already says so.
 */
export function buildRunConfig(
  slot: PlayerSlot, classKey: ClassKey, mode: GameMode, playerName: string,
): RunConfig {
  return {
    // The seed is the one place a run is allowed to be non-deterministic.
    // In Marco 1 the host picks it and sends it to every client.
    seed: (Math.random() * 0xffffffff) >>> 0,
```

> **Atenção FORM-12:** o comentário da linha 37 diz "the host picks it". `src/app/` não está no
> glob de `tests/protocol-vocabulary.test.ts` hoje, mas `tests/net-vocabulary.test.ts` deve
> estender o grep a `src/net/` — e este comentário é a oportunidade de corrigir a palavra para
> "the authority" no mesmo commit que muda a linha. `Math.random()` sai daqui: a autoridade
> emite a seed e ela chega no `startRun`.

**A forma do `RunConfig` que viaja** (`packages/sim/src/types.ts:243-278`):

```ts
export type PlayerSlot = 'p0' | 'p1' | 'p2' | 'p3';
...
export type RunPlayer = {
  id: PlayerSlot;
  name: string;
  cls: ClassKey;
  forge: ForgeLevels;
};

/** Everything the sim needs from the outside, decided once per run. */
export type RunConfig = {
  seed: number;
  mode: GameMode;
  /**
   * Every player of the run, and THE ORDER OF THIS ARRAY IS THE CANONICAL
   * ORDER (FORM-02/D-13). `step()` iterates it — not `Object.keys(players)` —
   * so that who gets which draw from `world.rng` is decided by the run
   * manifest instead of by the order in which people happened to join.
   */
  players: RunPlayer[];
};
```

---

### `apps/server/src/signaling/index.ts` (server-signaling, event-driven)

**Analog de forma:** `apps/server/src/app.ts` — fábrica pura, deps por argumento, zero efeito
colateral no import.

**O cabeçalho que explica a divisão `app.ts` puro / `index.ts` com efeitos** (`app.ts:1-11`):

```ts
// app.ts — the Hono application, and nothing else.
//
// Split from index.ts deliberately. index.ts opens a real database file, runs
// migrations and binds a port; none of that is something a test should have to
// do to ask what /api/health returns. Importing THIS module has no side effects
// at all, which is why tests/server-health.test.ts can drive the route through
// Hono's built-in app.request() without a socket ever existing.
//
// createApp takes its dependencies as arguments rather than reading them from
// module scope, for the same reason: a module-level singleton holding an open
// database would put the side effect back, one import away.
```

**A assinatura de fábrica com deps tipadas** (`app.ts:16-24`):

```ts
export interface AppDeps {
  /** An already-open, already-migrated handle. Opening is index.ts's job. */
  sqlite: SqliteHandle;
  /** The git sha of the running release, from DG2_RELEASE. */
  release: string;
}

export function createApp({ sqlite, release }: AppDeps) {
  const app = new Hono();
```

> `attachSignalling(server, deps)` é `createApp` com um verbo diferente. Deps: `origin`,
> `limiter`, `sqlite`/`db`, `turnSecret | null`, `now()`. Os testes locais (onda 5) devem
> conseguir dirigir salas **sem** socket, do mesmo jeito que `app.request()` dirige a rota.

**O ponto exato onde o `ws` se anexa** (`apps/server/src/index.ts:61-76`) — este comentário é
o contrato que esta fase cumpre, e ele deve ser **atualizado** (deixar de dizer "Phase 3
attaches" e passar a dizer o que foi feito):

```ts
/**
 * The real `http.Server`, kept in a named export rather than discarded.
 *
 * Phase 3 attaches the `ws` signalling server to this object's `upgrade` event
 * with `noServer: true`, which is what makes it possible to authenticate a
 * WebSocket BEFORE completing the handshake. That this object is reachable at
 * all is the entire reason Hono was chosen over Fastify, whose websocket plugin
 * keeps the server behind its own abstraction.
 *
 * hostname is access control, not configuration: bound to loopback, the process
 * is reachable only through Caddy, so the API cannot be spoken to outside TLS.
 * Binding every interface instead — the default if this argument is dropped —
 * would publish the API to the internet on a plain HTTP port and leave the
 * defence to a firewall nobody has configured (T-2-BIND).
 */
export const server = serve({ fetch: app.fetch, port: env.port, hostname: '127.0.0.1' });
```

**A ordem fixa dos efeitos em `index.ts`** (`:1-7`) — a linha do `attachSignalling` entra
**depois** do `createApp` e **antes** do `createShutdown`:

```ts
// index.ts — the entrypoint dg2.service runs. Everything here is a side effect,
// in a fixed order: read the environment, open the database, migrate, serve.
//
// The one other entrypoint in this repository, src/main.ts, has the same shape
// and the same top-level `await`. The difference is what failure means: a
// browser that cannot load sprites still shows a menu, while a server that
// cannot migrate must not answer a single request.
```

**O corpo do `upgrade`, com o ponto nomeado da fase 6** — sem analog no repo; fonte
`03-RESEARCH.md:1291-1328`, e o comentário **é** o entregável de D3-09:

```ts
    // Origin is anti-CSWSH, NOT authentication: a browser sends it honestly, a non-browser
    // client forges it. What protects a room is its code (D3-09). Saying so here is what
    // stops phase 6 from treating this line as a guarantee it never was (P-7).
    ...
    // PHASE 6 PLUGS THE SESSION CHECK HERE, and nowhere else (D3-09). The Better Auth
    // cookie arrives on this very request — a WebSocket handshake is a GET, so the cookie
    // is sent automatically and same-origin. Everything above stays; this becomes a
    // fourth guard, not a replacement for the first three.
```

---

### `apps/server/src/env.ts` (config) — `DG2_TURN_SECRET` / `DG2_TURN_REALM` / origem

**Analog:** ele mesmo.

**O `required()` que trata "definida e vazia" como erro** (`:47-73`) — as variáveis novas
seguem esta função, com **uma diferença deliberada**: sem valor padrão (um segredo padrão é
vulnerabilidade) e com a **ausência tolerada**:

```ts
/**
 * Reads one key, treating "defined and blank" as an ERROR rather than as
 * absent.
 *
 * `??` — which is what this replaces — falls back only on null/undefined, and
 * a systemd `EnvironmentFile` does not produce undefined. `DG2_DB=` with
 * nothing after it, a value commented out by deleting the right-hand side, a
 * trailing key: every one of those arrives as the empty string, and every one
 * of them is an ordinary edit to the single file ops/README.md §5 asks the
 * operator to hand-write.
 *
 * Blank is not defaulted back to the production value either, and that is the
 * deliberate half. An operator who wrote the key meant something by it; taking
 * the default would mean the file says one thing and the process does another,
 * which is the same silence with a different shape.
 */
function required(source: EnvSource, name: string, fallback: string): string {
```

**Os defaults exportados para que o teste asserte a mesma string** (`:37-45`):

```ts
/**
 * The production defaults, exported so a test asserts the same strings the
 * process uses rather than a copy of them.
 */
export const DEFAULTS = {
  DG2_DB: '/var/lib/dg2/dg2.db',
  DG2_PORT: '8080',
  DG2_RELEASE: 'dev',
} as const;
```

**A validação com a explicação do modo de falha** (`:75-96`) — o molde para "sem
`DG2_TURN_SECRET` o servidor sobe, avisa e emite ICE só com STUN":

```ts
/**
 * Validates the environment or throws. The caller decides what a failure
 * means; on the box it means exit 1 before anything is opened or bound.
 *
 * The port is the case worth spelling out. `Number('')` is 0, and 0 is a
 * PERFECTLY VALID argument to listen(2) meaning "pick any free port" — so the
 * unit would report `active`, nothing would answer on 8080, Caddy would return
 * 503, and every symptom would point at Caddy. It is refused explicitly for
 * that reason, alongside the digits-only test that also rejects '0x1f', '8e3'
 * and ' 80 80'.
 */
export function readEnv(source: EnvSource): ServerEnv {
  const dbPath = required(source, 'DG2_DB', DEFAULTS.DG2_DB);
  const release = required(source, 'DG2_RELEASE', DEFAULTS.DG2_RELEASE);

  const rawPort = required(source, 'DG2_PORT', DEFAULTS.DG2_PORT);
  const port = Number(rawPort);
  if (!/^[0-9]+$/.test(rawPort) || !Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`/env/DG2_PORT: "${rawPort}" não é uma porta entre 1 e 65535`);
  }

  return { dbPath, port, release };
}
```

> **A regra de design que este arquivo carrega** (`:9-22`): ele toma o ambiente como
> argumento e nunca toca `process`, e é por isso que `tests/server-env.test.ts` mora no
> programa de tipos da raiz sem entrada em nenhum `tsconfig`. Todo módulo novo do signaling
> que **não** precisar de globais de Node (`schema.ts`, `turn.ts` com `createHmac` injetado,
> `rooms.ts`) ganha o mesmo benefício. Os que precisarem (`index.ts` do signaling) exigem
> entrada em `apps/server/tsconfig.json:32` **e** em `tsconfig.json:40`, duas vezes, como
> `server-migrate` e `server-health` já exigem.

---

### `apps/server/src/db/migrations.ts` + `open.ts` (migration, CRUD) — a tabela `ice_outcome`

**Analog:** eles mesmos, `001_gold_entry`.

**A regra aditiva, escrita acima do objeto** (`migrations.ts:13-28`):

```ts
// The migration symbols come from 'kysely/migration', NOT from 'kysely'. The
// snippet in 02-RESEARCH.md:1009 imports them from the root barrel, which was
// right for an older release: kysely 0.29 moved them behind a subpath export
// and left the root names in place as `KyselyTypeError` sentinels, so importing
// from 'kysely' fails at the compiler with a message pointing here — and, in
// the case of `Migrator`, would be plain `undefined` at runtime.
import type { Kysely } from 'kysely';
import type { Migration, MigrationProvider } from 'kysely/migration';

// D2-07: migrations are ALWAYS additive. No DROP and no rename inside a
// version, ever. ops/rollback.sh moves the `current` symlink back to a previous
// release in seconds — and that rolls the CODE back while leaving the DATABASE
// exactly where the newer code left it. A destructive migration turns a
// 10-second rollback into data that is simply gone. Additive-only is what makes
// the rollback path safe to actually use.
const migrations: Record<string, Migration> = {
```

**A forma de uma migração, com o comentário por coluna** (`:49-102`) — `002_ice_outcome`
copia isto, incluindo o `notNull` explícito na PK textual e o índice pela pergunta que a
tabela vai responder:

```ts
  '001_gold_entry': {
    async up(db: Kysely<unknown>): Promise<void> {
      await db.schema
        .createTable('gold_entry')
        // Client-generated ULID. PRIMARY KEY is the UNIQUE(id) of D-27: it is
        // what makes syncing the same entry twice a no-op instead of duplicated
        // money, so the id is the deduplication mechanism and not just a label.
        //
        // `notNull` is NOT redundant next to `primaryKey`, and leaving it off
        // is what would void the sentence above. SQLite permits NULL in any
        // PRIMARY KEY that is not INTEGER — a documented bug kept for backward
        // compatibility — and NULLs never collide under the implied unique
        // index. [...]
        .addColumn('id', 'text', c => c.primaryKey().notNull())
        .addColumn('account_id', 'text', c => c.notNull())
        ...
        .execute();

      // The read this table will actually serve: one account's entries in time
      // order, for the balance and for the sync watermark.
      await db.schema
        .createIndex('gold_entry_account')
        .on('gold_entry')
        .columns(['account_id', 'at'])
        .execute();
    },
```

> `ice_outcome` (colunas em `03-RESEARCH.md:1056-1070`) tem PK textual (ULID do cliente, D-27,
> idempotência) → **o mesmo `notNull` explícito**. Índice em `(at)`, para que "qual foi a taxa
> de relay no último mês" seja um `SELECT`. **`address` e `port` não entram** — são IPs de
> jogador, e D3-14 limita o dado pessoal ao ULID.

**O `down` que só existe para dev** (`:105-115`):

```ts
    /**
     * `down` exists for local development only — dropping a table and starting
     * over while the schema is still being designed. Production NEVER runs it:
     * index.ts only ever calls migrateToLatest(), and the additive rule above
     * is what makes the symlink rollback safe. [...]
     */
```

**A interface de linha + o `Schema` que ganha a segunda entrada** (`open.ts:18-30`):

```ts
export interface GoldEntryTable {
  id: string;
  account_id: string;
  amount: number;
  reason: string;
  at: number;
  confirmed: number | null;
}

/** Every table this server knows about. Exactly one, deliberately (D2-01). */
export interface Schema {
  gold_entry: GoldEntryTable;
}
```

> A frase "Exactly one, deliberately (D2-01)" **tem de ser reescrita** no mesmo commit — vira
> duas, e o motivo da segunda (D3-14: só o desfecho ICE vai ao banco, a sala **nunca**, C-12)
> vai junto.

**O INSERT em si** — analog parcial `health.ts:61-73` (uso do handle cru, `prepare`, e falha
que não derruba nada):

```ts
export function healthBody(sqlite: SqliteHandle, release: string): HealthBody {
  let db = false;
  try {
    const row = sqlite.prepare('select count(*) as n from kysely_migration').get() as
      | { n: number }
      | undefined;
    db = (row?.n ?? 0) > 0;
  } catch {
    // Swallowed on purpose: the caller gets a boolean and the reason stays in
    // the process. Anything more specific than `false` is topology.
    db = false;
  }
```

> Um `iceOutcome` que falha ao gravar **não pode** derrubar a sala. Mesma estrutura: engolir,
> logar, seguir.

**O teste, com a asserção que carrega o requisito** (`tests/server-migrate.test.ts:16-19,49-53`):

```ts
// The load-bearing assertion is idempotency. migrateToLatest() runs on EVERY
// start of dg2.service (D2-07), including the restarts systemd performs by
// itself, so "applying the same migration twice is a no-op" is not a nicety —
// it is the property that lets a deploy, a rollback and a reboot all be safe.
```

```ts
/** A migrated in-memory database, plus the handles to inspect and close it. */
function migrated(): ReturnType<typeof openDb> & { migrator: Migrator } {
  const opened = openDb(':memory:');
  return { ...opened, migrator: new Migrator({ db: opened.db, provider }) };
}
```

> Os casos novos: a migração 002 aplica; `results` tem **duas** entradas na ordem certa;
> INSERT de sucesso e de falha; INSERT duas vezes com o mesmo id é no-op. O `COLUMNS`
> (`:47`) ganha o irmão `ICE_COLUMNS`.

---

### `ops/turnserver.conf` + `ops/coturn-dropin.conf` (config, infra)

**Analog de forma:** `ops/Caddyfile` (cabeçalho que explica cada decisão e a armadilha que ela
evita) e `ops/dg2.service:100-115` (o par de memória).

**O comentário que esta fase resolve** (`ops/Caddyfile:25-28`) — a decisão escrita substitui
essas quatro linhas:

```
# SCHEDULED FOR PHASE 3: port 443 will be contested — TURN over TLS wants
# 443/tcp to cross corporate firewalls, and so does this server. This file does
# not solve that. The note is here so whoever comes back knows the collision is
# on the calendar, not an oversight.
```

**O bloco já cabeado, sem consumidor** (`ops/Caddyfile:96-102`) — o comentário muda de
"reservado" para "em uso":

```
    # Reserved for phase 3 signalling. It exists now so the shape is visible in
    # review; no code in this phase talks to it. Caddy upgrades a WebSocket
    # through reverse_proxy without an extra module, so the block will not need
    # to change when the signalling server arrives.
    handle /ws {
        reverse_proxy {$DG2_UPSTREAM:127.0.0.1:8080}
    }
```

**O CSP que já cobre `wss://`** (`ops/Caddyfile:65-66`) — nada a mudar, e vale confirmar no
teste:

```
        #   connect-src  the API on this origin. 'self' also covers wss:// on
        #                the same host, which is what /ws needs in phase 3.
```

**O par de memória que o drop-in do coturn imita — com a diferença deliberada** (`ops/dg2.service:100-115`):

```ini
# Memory, AS A PAIR — never one of these without the NODE_OPTIONS line above
# (P-10). V8 sizes its default old space from the MACHINE's memory, not from
# the cgroup limit, so on a 2 GB box it grows straight past a 256 MiB cgroup
# and the kernel OOM-kills the process instead of the collector reclaiming.
# With the heap capped below the cgroup ceiling, V8 collects aggressively first
# and the limit behaves as back-pressure rather than as an execution.
#
# Budget on the KVM 2 box of D2-19: Caddy ~64M, this unit 256M, Litestream
# ~64M, ~128M held back for the phase-3 coturn. The point is not hygiene — it
# is that a leak in the phase-3 signalling must not be able to take the API
# down with it.
#
# Both limits are silently IGNORED under cgroup v1. The box is Debian 11+ /
# Ubuntu 22.04+, which is cgroup v2; ops/README.md §3 records why that matters.
MemoryHigh=200M
MemoryMax=256M
```

> Os "~128M held back for the phase-3 coturn" são os `MemoryHigh=96M` / `MemoryMax=128M` do
> drop-in (`03-RESEARCH.md:767-782`). E o drop-in **não** ganha par `NODE_OPTIONS`: coturn é C,
> não dimensiona nada a partir da memória da máquina. Escreva isso no arquivo, como a pesquisa
> escreveu — a ausência precisa ser uma decisão visível.

**A unit é drop-in, não cópia** — o pacote Debian já traz `coturn.service`
(`03-RESEARCH.md:762-765`). É a diferença explícita em relação a `ops/dg2.service`, que é um
arquivo inteiro nosso.

**O teste que já existe e ganha casos** (`tests/ops-config.test.ts:40-89`):

```ts
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
  // and not.toMatch below it. [...]
  expect((src as string).length, `ops/${name} veio vazio`).toBeGreaterThan(200);
  return src as string;
}
```

```ts
/**
 * Drops whole-line comments: every line whose first non-blank character is `#`.
 *
 * THIS FILTER IS NOT OPTIONAL. ops/Caddyfile explains, in its own comments, why
 * it does NOT use `try_files` and why it does NOT use `route`; the shell scripts
 * name `curl` and `git` in the headers that forbid them. Without the filter each
 * absence assertion below would fail against the very file that satisfies it [...]
 */
function code(name: string): string {
```

> Os casos novos de `turnserver.conf`: presença de `use-auth-secret`, de **todos** os
> `denied-peer-ip`, das quotas e de `no-cli`; e **ausência** de segredo real — o
> `static-auth-secret` é placeholder (D2-15). Note que o `code()` **tira comentários antes de
> assertar**, então "o arquivo explica por que não usa X" nunca invalida "o arquivo não usa X".

---

### `tests/net/room.spec.ts` e `tests/pwa/room-url.spec.ts` (test, e2e)

**Analog:** `tests/pwa/install.spec.ts` + `tests/pwa/helpers.ts` + `playwright.config.ts`.

**A config, com o "por que este runner e não o outro" no cabeçalho** (`playwright.config.ts:1-40`):

```ts
// The PWA gate (INFRA-02, INFRA-03). A config of its own, for the same reason
// vitest.browser.config.ts is a file of its own: the shape is dictated by what
// the gate has to prove, and this comment is where that reasoning is kept.
//
// ONE browser, deliberately. Playwright only supports service workers in
// Chromium [...]
//
// NO globally managed dev server either. Each spec builds and destroys its own
// through tests/pwa/helpers.ts, because offline.spec.ts has to KILL it in the
// middle of the test [...]
export default defineConfig({
  testDir: 'tests/pwa',
  testMatch: '**/*.spec.ts',

  // The specs register service workers on the same origin, and Cache Storage
  // is per ORIGIN, not per scope: two specs at once would see each other's
  // caches and each other's workers. Serial here is not lost speed, it is the
  // only way the assertions mean anything.
  fullyParallel: false,
  workers: 1,

  reporter: 'list',
  ...
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
});
```

> `tests/net/room.spec.ts` precisa de **dois `browserContext` no mesmo Chromium**. Duas saídas
> (decisão do planejador, `03-VALIDATION.md` Wave 0): um projeto novo com `testDir:
> 'tests/net'`, ou alargar o `testDir`. O `fullyParallel: false` do arquivo atual **não** é
> herdado por acidente — se as specs de rede forem para um projeto próprio, a serialização
> precisa ser escrita de novo, e ela é necessária pelo mesmo motivo (uma origem, um servidor,
> salas em memória compartilhadas).

**A forma de uma spec** (`tests/pwa/install.spec.ts:24-45`) — `afterEach` tolerante, `expect.soft`
para nomear todas as falhas de uma vez:

```ts
let server: StaticServer;

test.afterEach(async () => {
  // Tolerant on purpose: a spec may already have killed it mid-test.
  await server.close().catch(() => {});
});

test('instalação limpa: o worker espera, e o precache cobre o dist inteiro', async ({ page }) => {
  server = await serveDir('dist');
  await page.goto(server.origin);
  await waitForActivated(page);

  // Soft, all four of them, so ONE run names every behaviour that is still
  // missing instead of stopping at the first. [...]
  expect
    .soft(await controllerScript(page), 'sem clients.claim(), a página que instalou não é controlada')
    .toBeNull();
```

**O helper que serve `dist/` e pode ser morto** (`tests/pwa/helpers.ts:1-20`) — o servidor de
signaling nos testes de rede precisa do mesmo contrato de vida:

```ts
// tests/pwa/helpers.ts — the instruments the PWA specs measure with.
//
// Written in the shape of tests/helpers.ts: a .ts module with no `.test.` in
// the name, exporting fixtures plus the comment that explains WHY each fixture
// is what it is. Two of those "why"s are load-bearing here.
//
// 1. WHY serveDir() RETURNS A close().
//    context.setOffline() is CDP emulation, and there is an open report that it
//    does not reach requests made by a service worker
//    (microsoft/playwright#2311). [...]
```

> **A armadilha nomeada em `03-RESEARCH.md:1139-1144`:** D-08 recusa versões diferentes sem
> bypass, então testar co-op local exige o **mesmo build** nas duas abas — e dois `npm run
> dev` em portas diferentes têm origens diferentes, que a checagem de `Origin` do `upgrade`
> vai recusar. **Documente o comando exato de teste manual**, ou a primeira sessão de debug
> vira caça a um bug que não existe.

**Onde o round-trip do codec entra de graça nos três motores** (`tests/cross-engine.test.ts:1-8`):

```ts
// cross-engine.test.ts — the BROWSER leg of the determinism gate.
//
// This is the only test in the suite that can fail for the reason it exists
// to catch. tests/determinism.test.ts compares two worlds in the SAME process
// on the SAME engine, so by construction it can never see an engine
// disagreeing with another engine. This file runs the identical golden run in
// Chromium, Firefox and WebKit (vitest.browser.config.ts) and compares each
// engine's hashWorld against the golden recorded from Node.
```

> `vitest.browser.config.ts:10` tem `include: ['tests/cross-engine.test.ts']` — **um arquivo
> só**. O round-trip do codec entra **dentro** de `cross-engine.test.ts` (um `describe` a
> mais), não num arquivo novo, a menos que o `include` mude no mesmo commit. E
> `vitest.config.ts:16` exclui esse arquivo do runner de Node de propósito.

---

## Shared Patterns

Padrões transversais que valem para **todo** arquivo desta fase.

### 1. Comentário que carrega a decisão, não a descrição

**Fonte:** todo o repositório; o exemplo mais denso é `packages/protocol/src/version.ts:1-18`.
**Aplicar a:** todos os arquivos novos.

```ts
// version.ts — PROTOCOL_VERSION and the version refusal (D-08, D-09).
//
// PROTOCOL_VERSION IS NOT SIM_VERSION. The two numbers answer different
// questions and are deliberately kept apart:
//
//   SIM_VERSION       a content hash of the simulation bundle, computed by the
//                     build. Changing it CLOSES A SEASON [...]
//   PROTOCOL_VERSION  a hand-bumped integer, below. Changing it only REFUSES A
//                     CONNECTION. [...]
//
// Folding them into one number would make a wire-format tweak close a season
// for no reason at all — which is why they are two fields in `Versions` and
// two separate comparisons in `checkVersions`, not one concatenated string.
```

A forma é sempre a mesma: **o nome do arquivo, a decisão em maiúsculas, e o que aconteceria se
fosse do outro jeito.** Cada arquivo desta fase tem uma dessas frases obrigatórias:

| Arquivo | A frase que precisa estar no cabeçalho |
|---|---|
| `src/net/transport.ts` | não existe `broadcast`; toda mensagem cruza um salto (FORM-12) |
| `src/net/lossy.ts` | a injeção de falha é **semeada**, e o seed sai na mensagem de falha |
| `src/net/lobby.ts` | primeira tela dirigida por **estado de rede**, não por `world` |
| `src/net/rtc.ts` | só a **autoridade** chama `createDataChannel`; o convidado recebe por `ondatachannel` |
| `src/net/ice.ts` | `getStats()` **não** é a fonte do ping (D3-13); é a única fonte da rota |
| `apps/server/src/signaling/index.ts` | `Origin` é anti-CSWSH, **não** autenticação; a fase 6 pluga aqui e só aqui |
| `apps/server/src/signaling/rooms.ts` | sala é estado efêmero, `Map` em memória, **nunca** no banco (C-12) |
| `packages/protocol/src/snapshotCodec.ts` | o estático vem da seed; a partição não é interest management; ela só morde na wave ~210 |
| `ops/turnserver.conf` | o segredo é placeholder; ele vive em **dois** arquivos na caixa e trocar num só dá "um amigo específico nunca entra" |

### 2. Os três guardas de pureza, e como estendê-los para `net`

**Fonte:** `tests/purity.test.ts:1-18`, `eslint.config.js:81-134`, `packages/sim/tsconfig.json`.
**Aplicar a:** a onda que cria `src/net/`.

O cabeçalho do teste enumera os três e diz exatamente o que cada um **não** vê:

```ts
// purity.test.ts — the third of the three independent guards on the purity of
// packages/sim (D-16). The other two are eslint.config.js (the
// `packages/sim/src/**/*.ts` block) and packages/sim/tsconfig.json, whose
// `lib` has no browser library and whose `types` is empty, so the compiler
// itself rejects `window` and `document`.
//
// This test is not redundant with eslint.config.js, which structurally
// cannot see:
//   - `new Date()` / `Date.parse` / `Date.UTC` [...]
//   - `globalThis.window` — `no-restricted-globals` matches bare identifiers;
//   - `const { random } = Math` — destructuring is not a member expression;
//   - `from '../render'` — `no-restricted-imports` patterns are
//     gitignore-style, and `**/render/**` requires a segment AFTER `render/`.
```

**O que muda, linha por linha:**

`tests/purity.test.ts:78` — `FORBIDDEN_LAYER` ganha `net`:

```ts
/** Any import/export-from whose specifier mentions render/, ui/ or app/ —
 *  bare directory (`'../render'`) included. */
const LAYER_IMPORT = /\b(?:from|import)\s*\(?\s*['"]([^'"]+)['"]/g;
const FORBIDDEN_LAYER = /(^|[/\\])(render|ui|app)([/\\]|$)/;
```

`eslint.config.js:123-132` — o `no-restricted-imports` ganha `**/net/**` **e** `**/net`, e o
comentário já explica por que as duas formas são necessárias:

```ts
      // The patterns are gitignore-style: '**/render/**' requires a segment
      // AFTER 'render/', so a bare-directory import (`from '../render'`)
      // slips past it. The '**/render' forms close that hole.
      // tests/purity.test.ts asserts the same rule independently.
      'no-restricted-imports': ['error', {
        patterns: [
          '**/render/**', '**/ui/**', '**/app/**',
          '**/render', '**/ui', '**/app',
        ],
      }],
```

`tests/purity.test.ts:31-40` — `EXPECTED_FILE_COUNT` é **exato** e não muda nesta fase
(`src/net/` não é `packages/sim`), mas leia o motivo antes de mexer:

```ts
/**
 * Exact count, on purpose — this used to be a lower bound, and a lower bound
 * does not notice a file left behind by an extraction, which is precisely the
 * failure mode of the move that created this package. [...]
 */
const EXPECTED_FILE_COUNT = 28;
```

> **A direção importa:** `src/net/` **pode** importar de `@dg2/sim` e `@dg2/protocol`
> (`lossy.ts` usa `Rng`). O proibido é o inverso.

### 3. Grep de vocabulário como teste, não como revisão (FORM-12)

**Fonte:** `tests/protocol-vocabulary.test.ts`.
**Aplicar a:** `tests/net-vocabulary.test.ts` (novo), estendendo o glob a `src/net/**` e
`apps/server/src/signaling/**`.

**A justificativa, que é metade do arquivo** (`:1-20`):

```ts
// protocol-vocabulary.test.ts — FORM-12: the protocol does not contain the
// word "host".
//
// This is a rule about naming, which is exactly the kind of rule that decays
// when it is enforced by review: reviewers get tired, and the first `hostId`
// that slips through makes the second one look like precedent. So it is a
// test.
//
// The rule is not cosmetic. [...] A protocol full of `hostId` describes a
// topology; a protocol of AUTHORITY, PEER and SLOT describes a role, and roles
// survive being relocated.
//
// Comments are stripped before matching, because a comment is where the word
// legitimately appears — explaining why it is not used. String bodies are NOT
// stripped: a literal `'host'` travels on the wire just like an identifier
// would, so it breaks the rule exactly as much.
```

**O regex, com a armadilha medida** (`:33-50`) — copie o regex, não reescreva:

```ts
/**
 * Matches "host" at the start of an identifier segment, in any casing [...]
 *
 * Deliberately NOT `/\bhost\b/i`, which is the obvious spelling and the wrong
 * one: `\b` after "host" demands a non-word character, so `hostId` and
 * `hostName` — the single most likely way this rule ever gets broken — do not
 * match it. That was measured, not assumed: with `/\bhost\b/i` in place, a
 * planted `const hostName = 'x';` passed the audit clean.
 *
 * Equally deliberately not `/host/i`, which flags `ghost`. A guard that cries
 * wolf is a guard someone deletes.
 */
const FORBIDDEN = /(?<![A-Za-z])[Hh][Oo][Ss][Tt]|(?<=[a-z0-9])H(?:ost|OST)/;

/** What to say instead. Kept here so the test documents the substitution. */
const REPLACEMENTS = ['authority', 'peer', 'slot'];
```

**O guarda anti-vacuidade e o teste do detector** (`:52-57`, `:84-103`) — os dois são
obrigatórios no arquivo novo:

```ts
  it('o glob encontrou os fontes de packages/protocol', () => {
    // Without this, a broken glob would make every check below pass on an
    // empty set — the failure mode that makes a guard worthless.
    expect(Object.keys(FILES).length).toBeGreaterThan(0);
  });
```

```ts
  it('o detector pega as formas reais e ignora as inocentes', () => {
    // This test guards the guard. [...]
    for (const bad of [
      'const host = p;', 'const hostName = 1;', 'hostId: string',
      "kind: 'host'", "kind: 'HOST'", 'const isHost = true;',
      'type HostSlot = number;', 'room.roomHost',
    ]) {
```

> **Uma asserção do arquivo existente vira falsa nesta fase** (`:70-82`): "Today the
> substitution lives in the doctrine comments, because this package is still only tables and
> types — there is no room code yet to hold an `authority` identifier. **Phase 3 is what moves
> these words from prose into names**". Depois desta fase o teste pode assertar identificadores
> reais, não só menções. Atualizar esse comentário faz parte do trabalho.
>
> **E o `Transport` não tem `broadcast`** — é uma asserção do teste novo
> (`03-VALIDATION.md`, linha de FORM-12).

### 4. Glob `?raw` + guarda anti-vacuidade por **comprimento**

**Fonte:** `tests/purity.test.ts:21-29`, `tests/ops-config.test.ts:45-64`,
`tests/workspaces.test.ts:39-51`, `tests/dom-ids.test.ts:50-58`.
**Aplicar a:** todo teste estrutural novo.

```ts
// Vite's raw glob, not node:fs — tsconfig's `types` is ["vite/client"] only.
const FILES = import.meta.glob<string>('../packages/sim/src/**/*.ts', {
  query: '?raw', import: 'default', eager: true,
});
```

```ts
  // Anti-vacuity by LENGTH, never by type: vitest.config.ts sets `css: true`
  // precisely because the default stubs modules to '' -- and '' is a string, so
  // a toBeTypeOf('string') guard passes on exactly the input it exists to
  // reject. The same trap applies to any glob that misses.
```

### 5. Confinamento de dependência, escrito e executável

**Fonte:** `tests/workspaces.test.ts:1-58`, `packages/protocol/package.json:11`,
`apps/server/package.json:6-16`.
**Aplicar a:** a onda que instala `ws`, `@types/ws` e `zod`.

```ts
// workspaces.test.ts — the executable half of D2-04: server dependencies are
// confined to apps/server, and everything else in this repository publishes
// nothing at runtime.
// [...] A `npm i <pkg>` typed at the repository root instead of with
// `-w apps/server` is a one-character mistake that nothing else in the
// toolchain notices: the build still passes, the tests still pass, and the game
// quietly starts shipping a server framework to the browser. This file is what
// notices.
```

```ts
/** Every manifest that must declare `dependencies` present and empty. */
const MUST_BE_EMPTY = [
  '../package.json',
  '../packages/sim/package.json',
  '../packages/protocol/package.json',
];
```

O manifesto do servidor, que é o único com `dependencies` cheio, e onde `ws`/`zod` entram:

```json
{
  "name": "@dg2/server",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "dependencies": {
    "@hono/node-server": "2.1.1",
    "better-sqlite3": "13.0.3",
    "hono": "4.13.5",
    "kysely": "0.29.5"
  },
  "devDependencies": {
    "@types/better-sqlite3": "^7.6.13",
    "esbuild": "0.28.2",
    "tsx": "4.23.12"
  }
}
```

> Versões fixas sem `^` nas `dependencies` (`@types/*` levam `^`). `ws@8.21.3` e `zod@4.5.4`
> entram assim; `@types/ws@8.18.1` vai em `devDependencies`.
>
> **`packages/protocol` continua com `dependencies: {}`** — a asserção de `purity.test.ts:85-92`
> é `toEqual({})`, "not 'no keys': npm silently deletes an empty object on install".

### 6. Erro em português, comentário em inglês

**Fonte:** todo o repositório. `inputCodec.ts:194-199` e `env.ts:68-71` são os dois exemplos
canônicos.

```ts
    throw new Error(
      `input log inválido em t=${record.t} idx=${record.idx}: ${field}=${String(
        record[field as keyof InputRecord],
      )}`,
    );
```

```ts
    throw new Error(
      `/env/${name}: definida e vazia — ponha um valor em /etc/dg2/env ou apague a linha`,
    );
```

Nomes de `describe`/`it` também em português (`'tabelas de enum do protocolo (FORM-11)'`,
`'pureza de packages/sim'`), com o identificador do requisito entre parênteses.

### 7. Dois `ping` com o mesmo nome, em camadas diferentes

**Fonte:** `03-RESEARCH.md:637-640` (Pitfall 10).
**Aplicar a:** `apps/server/src/signaling/index.ts` **e** `src/net/rtc.ts` — um comentário em
cada:

- o heartbeat do `ws` usa frames de controle `ping`/`pong` **do protocolo WebSocket**;
- as mensagens `ping`/`pong` de D3-13 são **do jogo**, no DataChannel `unreliable`, índices 8
  e 9 da `MSG_KIND`.

São coisas diferentes com o mesmo nome. Um comentário em cada arquivo evita a confusão que
custaria uma tarde.

### 8. O `?sala=` e o `?ice=` não podem virar entrada de cache

**Fonte:** `public/sw.js:125-126` (`/api/` e `/ws` já passam direto),
`public/manifest.json:5-6` (`start_url` e `scope` em `"."`), e a UI-SPEC (a query sai da URL
com `history.replaceState` depois de consumida).

**Nota de build:** o Vite **não reescreve `public/`** — qualquer mudança em `sw.js` ou
`manifest.json` passa pelo passo `tools/sw/emit.mjs` (`package.json:26`) e pelo portão
`sw:verify` (`:27`), que o CI roda duas vezes (`ci.yml:174` e no job `pwa`).

---

## No Analog Found

Arquivos sem nenhum parente próximo no repositório. Para estes, a fonte é `03-RESEARCH.md`, e
a convenção de estilo a herdar é a de § Shared Patterns acima.

| File | Role | Data Flow | Reason | Fonte |
|------|------|-----------|--------|-------|
| `src/net/rtc.ts` | net-transport | streaming / event-driven | Nunca existiu WebRTC neste repositório. Perfect negotiation tem sutilezas de `signalingState` que só aparecem com 4 pares | `03-RESEARCH.md:513-555` (Padrão 3) e `:1424-1438` (os dois DataChannels) |
| `src/net/signaling.ts` | net-transport | request-response | Nenhum cliente WebSocket existe no jogo; `dependencies: {}` proíbe biblioteca (C-1) | `03-RESEARCH.md:396-422` (o fluxo da sala) |
| `src/net/ice.ts` | net-transport | request-response | `getStats()` nunca foi chamado neste código | `03-RESEARCH.md:1393-1418` (`routeOf`) |
| `apps/server/src/signaling/index.ts` (o corpo do `upgrade`) | server-signaling | event-driven | Nenhum `server.on('upgrade')` existe; `ws` é dependência nova | `03-RESEARCH.md:1291-1328` |
| `apps/server/src/signaling/limiter.ts` | server-signaling | event-driven | Nenhum rate limit existe. `hono-rate-limiter` **não serve**: o `upgrade` é emitido no lugar de `request` | `03-RESEARCH.md:1333-1347` (+ Pitfall 1 e 2) |
| `apps/server/src/signaling/turn.ts` | server-signaling | transform | Nenhum HMAC existe no servidor | `03-RESEARCH.md:1352-1387` |
| `apps/server/src/signaling/schema.ts` | server-signaling | transform | `zod` é dependência nova; a asserção `Equal/Expect` não tem precedente aqui | `03-RESEARCH.md:674-690` |
| `ops/turnserver.conf` | config (infra) | — | Nenhuma config de coturn existe. Forma herdada do `ops/Caddyfile`, conteúdo de `STACK.md` § "Configuração mínima obrigatória do coturn" | `CLAUDE.md` § coturn + `03-RESEARCH.md:754-800` |
| `ops/coturn-dropin.conf` | config (infra) | — | Todas as units de `ops/` são arquivos inteiros nossos; esta é a primeira que é **drop-in** sobre uma unit do distribuidor | `03-RESEARCH.md:762-782` |

---

## Metadata

**Analog search scope:** `packages/protocol/src/`, `packages/sim/src/`, `apps/server/src/`,
`src/` (app, ui, render), `tests/` (incl. `tests/pwa/`), `tools/`, `ops/`,
`.github/workflows/`, e os quatro `tsconfig.json` + os três configs de runner.

**Files scanned:** 47 lidos integralmente ou em trechos dirigidos; 0 modificados.

**Layout confirmado em disco** (não presumido do `CLAUDE.md`): npm workspaces com
`packages/sim`, `packages/protocol` e `apps/server`. **`apps/web` NÃO existe** — o cliente
segue na raiz (`src/`, `index.html`, `public/`), como D3-12 decidiu pela terceira vez.
`package.json:6-9` declara `workspaces: ["packages/*", "apps/*"]`.

**Os três guardas de `packages/sim`, localizados para o executor:**
1. **Lint** — `eslint.config.js:81-134`, bloco `files: ['packages/sim/src/**/*.ts']`
   (`no-restricted-globals`, `no-restricted-properties`, `no-restricted-imports`).
2. **Teste** — `tests/purity.test.ts:67-78` (`FORBIDDEN` e `FORBIDDEN_LAYER`) e `:85-92`
   (`dependencies: {}`).
3. **Compilador** — `packages/sim/tsconfig.json` (`lib` sem DOM, `types: []`), espelhado em
   `packages/protocol/tsconfig.json:13-14` e invertido em `apps/server/tsconfig.json:15-16`.

**Pattern extraction date:** 2026-09-05

---

*Phase: 3-Sala, transporte e protocolo*
*Pattern map written: 2026-09-05*
