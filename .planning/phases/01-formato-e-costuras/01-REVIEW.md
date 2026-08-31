---
phase: 01-formato-e-costuras
reviewed: 2026-08-31T00:00:00Z
depth: standard
files_reviewed: 53
files_reviewed_list:
  - eslint.config.js
  - packages/protocol/src/enums.ts
  - packages/protocol/src/index.ts
  - packages/protocol/src/inputCodec.ts
  - packages/protocol/src/runEnvelope.ts
  - packages/protocol/src/version.ts
  - packages/sim/src/arena.ts
  - packages/sim/src/boss.ts
  - packages/sim/src/combat.ts
  - packages/sim/src/constants.ts
  - packages/sim/src/enemies.ts
  - packages/sim/src/index.ts
  - packages/sim/src/levelup.ts
  - packages/sim/src/loot.ts
  - packages/sim/src/math.ts
  - packages/sim/src/player.ts
  - packages/sim/src/run.ts
  - packages/sim/src/serialize.ts
  - packages/sim/src/shop.ts
  - packages/sim/src/special.ts
  - packages/sim/src/stats.ts
  - packages/sim/src/step.ts
  - packages/sim/src/types.ts
  - packages/sim/src/world.ts
  - packages/sim/src/xp.ts
  - packages/sim/vite.config.ts
  - src/app/events.ts
  - src/app/forge.ts
  - src/app/input.ts
  - src/app/ledger.ts
  - src/app/loop.ts
  - src/app/save.ts
  - src/app/stepper.ts
  - src/app/ulid.ts
  - src/main.ts
  - src/render/camera.ts
  - src/render/entities.ts
  - src/render/fx.ts
  - src/render/index.ts
  - src/render/sprites.ts
  - src/render/tilemap.ts
  - src/ui/hud.ts
  - src/ui/labels.ts
  - src/ui/screens.ts
  - src/ui/settings.ts
  - src/ui/shop.ts
  - tools/assets/refusal-check.mjs
  - tools/assets/validate.mjs
  - tools/golden/rebaseline.mjs
  - tools/sim-version/emit.mjs
  - tools/sim-version/verify.mjs
  - vitest.browser.config.ts
  - vitest.config.ts
findings:
  critical: 1
  warning: 2
  info: 1
  total: 4
status: issues_found
---

# Fase 01: Relatório de Code Review

**Revisado em:** 2026-08-31T00:00:00Z
**Profundidade:** standard
**Arquivos revisados:** 53
**Status:** issues_found

## Resumo

Revisão adversarial dos 53 arquivos de origem alterados na fase 01 (protocolo,
simulação, camada de aplicação, render, UI e ferramentas de build). O foco
declarado da fase — pureza de `packages/sim/`, ausência de `Math.sin/cos/atan2`
sob `packages/sim/`, `dependencies: {}`, a separação entre os dois contratos de
`serialize.ts`, ordem canônica de jogadores e a ausência da palavra "host" em
`packages/protocol` — foi verificado item a item e **todos os sete invariantes
se sustentam** no código lido: nenhuma importação de `render/`/`ui/`/`app/`
dentro de `packages/sim/src`, nenhuma chamada literal a `Math.sin`/`Math.cos`/
`Math.atan2` fora de `math.ts`, os três `package.json` (`raiz`, `packages/sim`,
`packages/protocol`) mantêm `dependencies: {}`, `hashWorld` exclui `events` e
`config` enquanto `saveWorld`/`loadWorld` os mantêm, e a palavra "host" só
aparece no comentário autorreferente de `enums.ts`.

Dito isso, a caça explícita por "mais bugs da mesma forma" que os dois já
corrigidos em `enemies.ts` (desempate por distância e `pickSpawnAnchor`)
encontrou um efeito colateral real e não documentado em `updateEnemies`: um
`return` precoce dentro do laço de inimigos pula a limpeza do array
`world.enemies` que fica logo depois do laço, sempre que um jogador morre no
mesmo tick em que outro inimigo também é processado. É um bug de lógica
genuíno, silencioso hoje por sorte (todo leitor de `world.enemies` já filtra
`.dead` defensivamente), mas viola um invariante que o próprio arquivo depende
e é exatamente o tipo de armadilha que o objetivo "olhar order/estado
compartilhado" desta fase pede para caçar. Também foram encontradas duas
violações de menor gravidade do padrão "sempre `orderedPlayers`, nunca
`Object.values(world.players)`" — uma em `packages/sim/src/loot.ts` (inofensiva
hoje, mas o mesmo formato dos dois bugs já corrigidos) e uma em
`src/render/entities.ts` (cosmética, fora do escopo de determinismo, mas relevante
para quando o Marco 2 tiver mais de um jogador na tela).

## Structural Findings (fallow)

Nenhum `<structural_findings>` foi fornecido ao agente para esta execução —
esta seção fica vazia por não haver substrato estrutural prévio a incorporar.

## Narrative Findings (AI reviewer)

## Critical Issues

### CR-01: `return` precoce em `updateEnemies` pula a limpeza de `world.enemies` quando um jogador morre

**Arquivo:** `packages/sim/src/enemies.ts:359-367`

**Problema:**
`updateEnemies` itera `world.enemies` e, ao final da função (linha 367), sempre
deveria remover os inimigos mortos do array:

```ts
for (const e of world.enemies) {
  // ...
  if (target && !e.exploder && rectCircle(e.x, e.y, e.w, e.h, target.x, target.y, 10)) {
    damagePlayer(world, target, e.bossState === 'charging' ? Math.round(e.dmg * 1.5) : e.dmg);
    if (world.phase !== 'playing') return;   // <-- sai da FUNÇÃO INTEIRA
  }
}
world.enemies = world.enemies.filter(e => !e.dead);  // nunca executa nesse caminho
```

`damagePlayer` (`player.ts:148-151`) chama `setPhase(world, 'gameover')` quando
o HP do jogador chega a zero. Quando isso acontece dentro do laço de
`updateEnemies`, a condição `world.phase !== 'playing'` fica verdadeira e a
função retorna imediatamente — pulando não só o resto dos inimigos daquele
tick, mas também a linha 367, que é o único lugar que remove inimigos mortos
do array `world.enemies`.

Cenário de reprodução concreto e nada exótico: um inimigo com `poisonT`/`burnT`
ativo morre por dano contínuo mais cedo no mesmo laço (`killEnemy` é chamado e
marca `e.dead = true`, e o `continue` do bloco de veneno/queimadura passa para
o próximo inimigo — `enemies.ts:263-275`); em seguida, *outro* inimigo, mais
adiante no mesmo array, encosta no jogador e o mata via `damagePlayer`. O
`return` na linha 364 interrompe a função antes do `filter` — o inimigo morto
por veneno permanece dentro de `world.enemies` com `dead: true` pelo resto do
estado de `gameover` (já que `step()` nunca mais chama `updateEnemies`
enquanto `world.phase !== 'playing'`, o array nunca é limpo depois disso,
até que um novo `World` seja criado em `beginRun()`).

Hoje o impacto observável é nulo porque todo consumidor de `world.enemies`
(`updateHud`, `drawEnemies`, `killEnemy`, `updateEnemyBullets`) já filtra
`.dead` defensivamente antes de usar a lista. Mas isso é sorte de
implementação, não uma garantia: `world.enemies` é parte do `World` que
`saveWorld`/`hashWorld` serializam sem filtro nenhum (`serialize.ts`), e o
tipo `ObjectiveState.marks: number[]` (`types.ts:338`) já é descrito como "ids
de entidade que este objetivo rastreia" — um objetivo de missão que resolva
"todos os inimigos com este id morreram" a partir de `world.enemies` sem
filtrar `.dead` herdaria esse estado inconsistente. É também um invariante de
loop quebrado silenciosamente: a linha 367 existe precisamente para garantir
que, ao fim de `updateEnemies`, o array só contenha inimigos vivos: nenhum
comentário no arquivo documenta esta exceção como deliberada (diferente de
todo o resto do arquivo, que documenta cuidadosamente cada desvio do
original), o que é evidência de que se trata de um descuido, não de uma
decisão.

**Fix:**
Trocar o `return` por um `break`, deixando o `filter` de limpeza — que já está
posicionado corretamente logo após o laço — rodar em todos os casos:

```ts
    if (target && !e.exploder && rectCircle(e.x, e.y, e.w, e.h, target.x, target.y, 10)) {
      damagePlayer(world, target, e.bossState === 'charging' ? Math.round(e.dmg * 1.5) : e.dmg);
      if (world.phase !== 'playing') break; // interrompe o laço, mas não a função
    }
  }
  world.enemies = world.enemies.filter(e => !e.dead);
}
```

## Warnings

### WR-01: `loot.ts` itera `world.players` fora da ordem canônica (mesmo formato dos dois bugs já corrigidos)

**Arquivo:** `packages/sim/src/loot.ts:116`

**Problema:**
`updateChests` usa `Object.values(world.players)` para decidir se algum
jogador está perto o bastante de um baú fechado para começar a abri-lo:

```ts
const near = Object.values(world.players).some(
  p => {
    if (p.hp <= 0) return false;
    const dx = p.x - ch.x, dy = p.y - ch.y;
    return Math.sqrt(dx * dx + dy * dy) < 26;
  },
);
```

`world.ts:44-53` documenta explicitamente que os dois bugs de determinismo já
encontrados nesta fase (`nearestPlayer` e `pickSpawnAnchor`) tinham exatamente
essa forma — código que costumava andar por `Object.values(world.players)` e
herdava ordem de inserção em vez da ordem canônica de `world.config.players`.
Este é o mesmo padrão, num terceiro arquivo.

Hoje é inofensivo por dois motivos que se sobrepõem: (1) `.some()` é uma
função existencial pura — o resultado não depende da ordem de iteração, só de
quais elementos existem — e (2) o `p` "vencedor" desse `.some()` nem é
propagado: quem realmente credita a abertura do baú é `nearestPlayer(world,
ch.x, ch.y)` na próxima transição de estado (`opening` → `looted`,
`loot.ts:109`), que já usa ordem canônica; e `lootChest` nem lê o parâmetro
`_p` que recebe (comentário na linha 133-135 confirma isso de propósito).

O motivo para ainda assim reportar isto como warning: é uma armadilha para
quem editar esta função depois sem reler `world.ts:44-53`. Bastaria trocar
`.some()` por `.find()` guardando o jogador encontrado, ou adicionar qualquer
lógica que consuma `world.rng` dentro do callback, para reintroduzir
silenciosamente a mesma classe de bug que este código já pagou caro duas
vezes nesta fase.

**Fix:**
```ts
import { emit, slotForge, orderedPlayers } from './world';
// ...
const near = orderedPlayers(world).some(p => {
  if (p.hp <= 0) return false;
  const dx = p.x - ch.x, dy = p.y - ch.y;
  return Math.sqrt(dx * dx + dy * dy) < 26;
});
```

### WR-02: `save.ts` não valida o formato dos dados lidos de `localStorage`, ao contrário de `ledger.ts`

**Arquivo:** `src/app/save.ts:93-104`

**Problema:**
`ledger.ts:124-139` trata explicitamente o `localStorage` como uma fronteira
de confiança: o comentário ali diz "Stored entries cross a trust boundary: the
browser's storage is editable by hand [...] One malformed amount would turn
the whole balance into NaN, and a NaN balance silently unlocks every forge
button, so anything that does not parse as an entry is dropped on the way
in" — e `isLedgerEvent()` de fato valida tipo por campo antes de aceitar
qualquer entrada persistida.

`save.ts` guarda exatamente os níveis de forja que `ledger.ts` está
protegendo o botão de comprar (`Save.data.progress.forge[key]`, lido por
`forgeLevel()` em `app/forge.ts:15-17`), mas `load()`/`adopt()` não validam
nada:

```ts
function adopt(target: object, source: unknown): void {
  if (typeof source !== 'object' || source === null) return;
  const src = source as Record<string, unknown>;
  const dst = target as Record<string, unknown>;
  for (const key of Object.keys(dst)) {
    if (src[key] !== undefined) dst[key] = src[key];   // sem checagem de tipo
  }
}

function load(): void {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<SaveData>;
      data = defaults();
      adopt(data.settings, parsed.settings);
      adopt(data.progress, parsed.progress);
      data.records = parsed.records || {};   // atribuição direta, sem validar o shape de cada ClassRecord
    }
  } catch { data = defaults(); }
}
```

Um `localStorage` corrompido ou editado à mão (o mesmo cenário que
`ledger.ts` cita como ameaça real) pode colocar, por exemplo, uma string em
`progress.forge[key]`. Isso propaga para `app/forge.ts`:
`forgeCost()` calcula `Math.pow(1.7, forgeLevel(key))`, que vira `NaN` se
`forgeLevel(key)` for uma string não numérica; `balance(Ledger.events) < cost`
compara com `NaN`, o que é **sempre `false`** — ou seja, o guard de saldo
insuficiente deixa de bloquear a compra —; e a chamada seguinte,
`Ledger.spend(cost, 'forge')`, cai em `assertAmount(NaN)`
(`ledger.ts:117-121`), que lança `RangeError` dentro do handler de clique do
botão de forja. O resultado não é uma duplicação de moeda (o `ledger.ts`
segura essa parte), mas é uma exceção não tratada disparada por um clique de
usuário, e o mesmo tipo de poluição por tipo incorreto pode se espalhar por
`data.records[cls]` (usado sem checagem em `recordRun`/`classRecord`/
`renderStats`) sem lançar nada — apenas produzindo `NaN`/`undefined` na tela.

**Fix:**
Adicionar uma validação de shape simétrica à de `ledger.ts` antes de aceitar
os campos de `parsed.settings`/`parsed.progress`/`parsed.records`, por
exemplo validando que cada `forge[key]` é `Number.isFinite` e cada
`records[cls]` tem `score`/`wave`/`level`/`victories` numéricos antes de
`adopt`/atribuir, descartando o valor (mantendo o default) em vez de
propagá-lo:

```ts
function adopt(target: object, source: unknown): void {
  if (typeof source !== 'object' || source === null) return;
  const src = source as Record<string, unknown>;
  const dst = target as Record<string, unknown>;
  for (const key of Object.keys(dst)) {
    const value = src[key];
    if (value === undefined) continue;
    // mesmo tipo do default: number continua number, string continua string, etc.
    if (typeof value === typeof dst[key]) dst[key] = value;
  }
}
```

## Info

### IN-01: `render/entities.ts`'s `drawFog` escolhe um jogador arbitrário via `Object.values`, não o jogador local

**Arquivo:** `src/render/entities.ts:119`

**Problema:**
```ts
export function drawFog(ctx: CanvasRenderingContext2D, cam: Camera, world: World): void {
  if (world.waveMutator !== 'fog') return;
  const target = Object.values(world.players)[0];
  if (!target) return;
  ...
}
```

`drawFog` centraliza o círculo de luz do mutador "fog" no primeiro jogador que
`Object.values(world.players)` devolver — hoje, com um único jogador local por
processo (`p0`), isso é indistinguível de "o jogador local". Não é um bug de
determinismo (renderização não entra em `hashWorld`/replay), mas é o mesmo
padrão que `WR-01` e os dois bugs já corrigidos: no dia em que o Marco 2 puser
mais de um `Player` em `world.players` no mesmo cliente (tela dividida, ou
espectador), cada cliente passaria a centralizar o nevoeiro num jogador
escolhido por ordem de inserção em vez do jogador que aquela tela representa.

**Fix:**
Quando `drawFog` ganhar um parâmetro `localId` (do mesmo jeito que
`updateHud`/`syncScreens`/`app/input.ts` já recebem), trocar por
`world.players[localId]` em vez de `Object.values(world.players)[0]`.

---

_Revisado em: 2026-08-31T00:00:00Z_
_Revisor: Claude (gsd-code-reviewer)_
_Profundidade: standard_
