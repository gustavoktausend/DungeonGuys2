---
phase: 01-formato-e-costuras
plan: 13
subsystem: sim
tags: [ordem-canonica, identidade, run-config, forge-por-slot, d-13, d-30, form-01, form-02, adr-0001]

# Dependency graph
requires:
  - phase: 01-10
    provides: "RunEnvelope, o codec de input e o PlayerSlot {id,cls,name} do protocolo, ao lado dos quais o RunConfig novo tem de caber"
  - phase: 01-12
    provides: "o hash-ouro 53f86446, o slot local ja em p0, world.objectives e o portao cross-engine verde"
  - phase: 01-04
    provides: "tests/golden/campaign-mage-3000.json e a regra de commit de tools/golden/rebaseline.mjs"
  - phase: 01-05
    provides: "packages/sim como workspace @dg2/sim"
provides:
  - "RunConfig.players[] — id, nome, classe e forge por slot, e a ORDEM do array e a ordem canonica"
  - "PlayerSlot ('p0'..'p3'), ForgeLevels e RunPlayer em packages/sim/src/types.ts"
  - "step() iterando o manifesto da run em vez de Object.keys(world.players)"
  - "slotForge(world, id) e orderedPlayers(world) em packages/sim/src/world.ts"
  - "nearestPlayer e pickSpawnAnchor livres de ordem de insercao — dois canais de desync que o plano nao previa"
  - "hashWorld indiferente a ordem de chegada: o detector de desync parou de inventar desync"
  - "tests/canonical-order.test.ts (FORM-02, criterio de sucesso 4) e tests/identity.test.ts (FORM-01)"
  - "Fixture de ouro migrado de esquema com hash INALTERADO em 53f86446, num commit de um arquivo"
affects: [01-14, fase-04-netcode, fase-05-coop, fase-06-contas, fase-09-ranking]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "A ordem canonica mora no manifesto da run, nao na estrutura de dados: o Record continua Record (JSON-safe), e quem decide a ordem e o array que o replay ja le"
    - "Migracao de esquema de fixture e re-baseline de hash sao commits de especies diferentes: a migracao so e valida se o hash NAO muda, e vale a pena aceitar um commit vermelho para manter a regra de um-arquivo"
    - "Sabotagem controlada tambem para teste-guarda: um teste que nasce verde precisa ser visto falhar antes de valer como guarda"
    - "Um valor por jogador se resolve pelo jogador que a funcao ja tem em escopo — nunca por um campo global da run"

key-files:
  created:
    - tests/canonical-order.test.ts
    - tests/identity.test.ts
  modified:
    - packages/sim/src/types.ts
    - packages/sim/src/world.ts
    - packages/sim/src/step.ts
    - packages/sim/src/player.ts
    - packages/sim/src/shop.ts
    - packages/sim/src/xp.ts
    - packages/sim/src/loot.ts
    - packages/sim/src/enemies.ts
    - src/app/forge.ts
    - src/main.ts
    - tests/helpers.ts
    - tests/inputLog.ts
    - tests/world.test.ts
    - tests/loot.test.ts
    - tests/player.test.ts
    - tests/shop.test.ts
    - tests/xp.test.ts
    - tests/golden.test.ts
    - tests/cross-engine.test.ts
    - tests/run-envelope-replay.test.ts
    - tests/golden/campaign-mage-3000.json
    - tools/golden/rebaseline.mjs

key-decisions:
  - "O teste vermelho expos DOIS canais de desync alem do step(): nearestPlayer (desempate de distancia) e pickSpawnAnchor (rng.pick sobre um array em ordem de insercao). Corrigidos, porque sem eles a propria propriedade que o plano compra nao se sustenta"
  - "hashWorld passou a re-chavear players na ordem canonica: sem isso duas salas bit-identicas fingerprintam diferente so pela ordem de entrada — o detector de desync relatando um desync que nao existe"
  - "buildRunConfig recebe o slot por PARAMETRO em vez de ler LOCAL_SLOT: o slot e da autoridade (ADR 0001), e importar de main.ts para app/forge.ts criaria um ciclo de modulo"
  - "A migracao do fixture foi ANTECIPADA para logo depois da Task 1, e nao deixada para a Task 3, porque a Task 2 nao pode trocar step() enquanto o dado ainda tem o esquema antigo"
  - "tests/identity.test.ts NAO tira comentarios antes de varrer, ao contrario de purity.test.ts — e a escolha esta explicada no proprio arquivo"

patterns-established:
  - "Um par de commits (codigo vermelho -> dado verde) e o preco de manter `git log -- tests/golden/` legivel; a mensagem do primeiro declara o vermelho e por que ele existe"
  - "Todo teste de ordem canonica precisa de um CONTROLE que prove que o roteiro move o mundo, ou ele passa por vacuidade"

requirements-completed: [FORM-01, FORM-02]

# Metrics
duration: ~25min
completed: 2026-08-31
---

# Phase 01 Plano 13: Ordem canônica e os três espaços de identidade Summary

**Embaralhar a ordem em que quatro pessoas entram numa sala deixou de mudar o resultado da
partida — e o teste que prova isso encontrou mais dois canais de dessincronização que o plano
não conhecia, ambos corrigidos, com o hash-ouro parado em `53f86446` do começo ao fim.**

## Performance

- **Duration:** ~25 min
- **Started:** 2026-08-31T13:10Z
- **Completed:** 2026-08-31T13:35Z
- **Tasks:** 3 de 3
- **Files:** 24 (2 criados, 22 modificados)

## O vermelho, medido — porque um teste que passa nos dois casos não testa nada

`tests/canonical-order.test.ts` foi escrito **antes** da correção e rodado contra o
`Object.keys(world.players)` original. As duas medições, do commit `19ca12d`:

| Teste | Resultado contra `Object.keys` |
|---|---|
| embaralhar a ordem de criação não muda o hash, em três permutações | **falhou** — `p0,p1,p2,p3` deu `c40e44bb`; `p2,p0,p3,p1` deu `277df22b` |
| a ordem de iteração é a do manifesto, não a de `Object.keys` | **falhou** — `48ecea90` igual a `48ecea90`: o manifesto era **inerte** |

Os outros três comportamentos (controle, slot ausente do mundo, slot sem input) já passavam,
como esperado — eles descrevem o que não devia mudar.

A segunda medição é a mais informativa das duas. Ela roda num mundo **sem inimigos** (sem
`startRun`), então o único caminho sensível a ordem que sobra é o laço de jogadores do
`step()`, através do sorteio de espalhamento por tiro de `combat.ts:57`. Com o manifesto
invertido e a ordem de criação fixa, os dois mundos saíam **bit a bit idênticos** — prova
direta de que `config.players` não estava sendo lido por ninguém.

## O que o teste vermelho encontrou e o plano não previa

O plano nomeia um ponto: `step.ts:21`. **Havia três.** Trocar só o `step()` não teria feito o
teste passar, e é por isso que ele foi escrito antes.

| Ponto | O que fazia | Por que dessincroniza |
|---|---|---|
| `step.ts:21` | `for (const id of Object.keys(world.players))` | O previsto pelo plano: quem entrou primeiro é atualizado primeiro, e toda a cadeia `updatePlayer → attack → dealDamage → killEnemy → gainXp` consome o mesmo `world.rng` |
| `enemies.ts:56` — `nearestPlayer` | `for (const p of Object.values(world.players))` com comparação **estrita** (`d < bestD`) | Empate de distância é vencido por quem vem primeiro — e quatro jogadores no mesmo ponto de spawn é **como toda run começa**, não um caso raro |
| `enemies.ts:141` — `pickSpawnAnchor` | `Object.values(...).filter(vivos)` entregue a `world.rng.pick(alive)` | O **mesmo sorteio** escolhe um jogador diferente conforme quem entrou primeiro. A onda inteira nasce em outro lugar, com o cursor do rng parecendo perfeitamente saudável |

`loot.ts:116` também itera `Object.values(world.players)`, e **foi deixado como está**: é um
`.some()` com predicado puro, logo indiferente a ordem por construção. Registrado aqui para que
a omissão não pareça esquecimento.

A correção dos dois novos é `orderedPlayers(world)`, ao lado de `slotForge` em `world.ts` —
`enemies.ts` já importava desse módulo, então nenhuma aresta nova de import nasceu e o teto 5
do teste de SCC não se moveu.

## `hashWorld` estava inventando desync

O achado mais desconfortável da execução, e ele não estava no plano.

`JSON.stringify` emite chave de objeto em **ordem de inserção**. Então, mesmo com as três
correções acima, dois mundos com simulações **bit a bit idênticas** produziriam impressões
digitais diferentes pelo único motivo de as quatro pessoas terem entrado em outra sequência.

Isso não é um detalhe de teste. `hashWorld` é o esqueleto do `serialize.ts` da fase 4 (D-13 e o
próprio `01-CONTEXT.md` dizem isso) — é **o detector de desync**. Deixá-lo assim entregaria à
fase 4 um detector que dispara falso positivo em toda sala cujos membros entraram fora de
ordem, que é a maioria delas.

`hashWorld` passou a re-chavear `players` na ordem canônica antes de serializar, reusando o
mesmo `orderedPlayers` da simulação — uma definição só de ordem canônica, não duas. **Ordem de
chave dentro do Record não é estado da simulação**; quem está nele, e o que essas pessoas são,
continua comparado exatamente como antes.

**Isso não moveu nenhum hash gravado**, e o motivo é estrutural, não sorte: um mundo cuja ordem
de inserção já bate com o manifesto — toda run solo, o ouro inclusive — serializa nos mesmos
bytes. Verificado: `53f86446` em Node e nos três navegadores, e os 50 checkpoints.

## O hash-ouro: migração de esquema, não re-baseline

| | Antes | Depois |
|---|---|---|
| `hash` do fixture | `53f86446` | **`53f86446`** |
| linhas de `hash` no diff contra a base | — | **0** |
| checkpoints alterados | — | **0 de 50** |
| registros do log alterados | — | **0 de 765** |
| arquivos no commit da migração (`1c0f5d4`) | — | **1** |

O `config` passou de `{seed, mode, classKey, playerName, forge}` para `{seed, mode, players}`, e
a lista `players` que o fixture carregava no topo desde o plano 01-04 foi **absorvida** pelo
`config`. Duas listas de quem está na run são duas respostas para a mesma pergunta, e a
simulação só lê uma.

`git log -- tests/golden/` continua legível, agora com quatro entradas e uma delas de espécie
diferente das outras três — o que é exatamente o ponto:

```
1c0f5d4 test(01-13): MIGRACAO DE ESQUEMA do ouro, hash INALTERADO em 53f86446
feb22fa test(01-12): re-baselina o ouro, d3a93053 -> 53f86446
01ca392 fix(01-04): troca a seed do ouro para uma que preserva a divergencia
9db5552 feat(01-04): ouro versionado e o unico caminho auditavel para muda-lo
```

O guarda também foi exercitado depois da migração: `node tools/golden/rebaseline.mjs` **sem**
`--confirm` sai 1, lê o fixture novo corretamente (765 registros, hash atual `53f86446`) e não
escreve nada.

## O forge deixou de ser da run e passou a ser de cada jogador

Os quatro pontos de leitura já tinham o jogador em escopo, então a resolução por slot não
inventou regra nova — e em solo o valor é idêntico ao de hoje, que é o que o hash inalterado
prova.

| Ponto | Antes | Agora | O que passa a significar em co-op |
|---|---|---|---|
| `player.ts` `createPlayer` | `world.config.forge` | `slotForge(world, id)` | Cada um começa com o próprio vigor/honed/fleet |
| `shop.ts` `itemPrice` | `world.config.forge.merchant`, com `_p` **ignorado** | `slotForge(world, p.id).merchant` | Duas pessoas na mesma loja veem preços diferentes |
| `xp.ts` `gainXp` | `world.config.forge.wise` | `slotForge(world, p.id).wise` | O bônus é de quem ganhou o XP |
| `loot.ts` moeda | `world.config.forge.golden` | `slotForge(world, target.id).golden` | A moeda dobra para quem a coletou |

O sorteio de `loot.ts` continua **incondicional** (Ruling A): a moeda consome exatamente um
`rng.next()` qualquer que seja o nível de `golden`, então uma sala cujos membros forjaram
níveis diferentes continua consumindo rng de forma idêntica. Trocar por `chance()` aqui teria
reintroduzido a divergência que o comentário original existe para impedir — agora com quatro
níveis diferentes na mesma sala em vez de um.

Um slot fora do manifesto recebe `NO_FORGE` (os sete níveis em zero), congelado e compartilhado,
em vez de lançar. Não é leniência com manifesto malformado: é a resposta honesta para um jogador
que o manifesto não descreve, e é **determinística**, que é a única propriedade que importa —
todo peer calcula o mesmo nada.

## `SIM_VERSION` — mudou, e devia mudar

| | Antes (base `2e2ff57`) | Depois (HEAD) | Delta |
|---|---|---|---|
| Bytes de `packages/sim/dist/sim.js` | 64.619 | **65.206** | **+587** |
| `SIM_VERSION` | `sha256:c47283ea6fe7512c` | **`sha256:6b911d9a41921637`** | |

O valor "antes" foi **medido nesta árvore** antes da primeira edição, não copiado do SUMMARY do
01-12 — e bateu com ele, o que é confirmação independente. O crescimento é `slotForge`,
`orderedPlayers` e o laço novo de `step()`; os tipos novos (`PlayerSlot`, `ForgeLevels`,
`RunPlayer`) são apagados na compilação e não pesam um byte.

`npm run sim:version:verify` sai 0 e afirma as duas metades com os valores na tela: reprodutível
(mesmo hash em 3 builds) e sensível (perturbar `constants.ts` deu `sha256:0feecbbe909cb1c2`).

## `tests/identity.test.ts` — sabotagem controlada, feita e desfeita

O arquivo nasce verde, porque descreve um invariante que já vale. Um teste-guarda que nunca foi
visto falhar é um teste-guarda que ninguém sabe se existe, então as três asserções foram
sabotadas uma a uma, e as três sabotagens revertidas:

| Sabotagem | Resultado |
|---|---|
| `export type SabotageAccount = { accountId: string }` em `packages/sim/src/types.ts` | falha nomeando **`../packages/sim/src/types.ts`** |
| carimbo em runtime: `world.players.p2.accountId = '01J-SABOTAGE'` | falha com **`caminhos infratores: $.players.p2.accountId`** |
| `createPlayer(world, 'host', 'mage', 'HOST')` | falha com **`ids fora de p0..p3: host`** |

As três foram desfeitas (`git checkout -- <arquivo>` e restauração de cópia); `git status` limpo
e o arquivo verde antes do commit `07cba86`.

**As duas varreduras são complementares e as duas são necessárias.** A de fonte pega a
**intenção** — alguém acrescentou o campo a um tipo. A do `World` serializado pega o
**acidente** — alguém carimbou o valor em runtime sem declarar nada. Nenhuma das duas pega o
caso da outra. Há também um quinto teste que parece trivial e não é: ele assere que o glob
encontrou mais de 20 arquivos, porque um glob vazio faria as duas varreduras passarem por
vacuidade.

A varredura de fonte **não tira comentários**, ao contrário de `purity.test.ts`. Lá os nomes
proibidos (`Date.now`, `random`) aparecem legitimamente em prosa sobre o código original, e sem
a limpeza o teste seria inutilizável. Aqui é o oposto: esse vocabulário é da autoridade e do
servidor de contas, e mencioná-lo em comentário dentro de `packages/sim` é o primeiro passo de
alguém acrescentá-lo. O custo — falso positivo num comentário que diga "aqui não tem accountId"
— está escrito no próprio arquivo, junto com a razão de a explicação morar **fora** do pacote.

## Task Commits

| # | Task | Commit | Tipo | Estado da suíte |
|---|---|---|---|---|
| 1a | `RunConfig.players[]` e o forge por slot | `7f46196` | feat | **vermelho de propósito** (2 arquivos derivados do ouro) |
| 1b | Migração de esquema do ouro, **um arquivo** | `1c0f5d4` | test | verde, 364 passed |
| 2a | O teste vermelho da ordem canônica | `19ca12d` | test | vermelho (2 de 5, medidos acima) |
| 2b | `step()` itera o manifesto + os dois canais novos + `hashWorld` | `c727d34` | feat | verde, 369 passed |
| 3 | `tests/identity.test.ts` | `07cba86` | test | verde, 374 passed |

## Verificação

| Portão | Resultado |
|--------|-----------|
| `npm test` | **374 passed em 33 arquivos** (baseline 362 + 12 novos, nenhum perdido) |
| `npm run test:browser` | **6 passed (6)** — chromium, webkit e firefox, nomeados um a um |
| `npx vitest run tests/canonical-order.test.ts` | 5 passed, três permutações |
| `npx vitest run tests/identity.test.ts` | 5 passed |
| `npx vitest run tests/purity.test.ts` / `tests/scc.test.ts` | 9 passed — 27 módulos, teto 5, nenhum dos dois se moveu |
| `npm run build` | exit 0 — 59 módulos |
| `npm run lint` | exit 0 |
| `npm run typecheck:sim` | exit 0 |
| `npx tsc --noEmit` | exit 0 |
| `npm run sim:version:verify` | exit 0 — reprodutível e sensível |
| `npm run assets:selftest` / `assets:refusal` / `assets:validate` | os três exit 0 |
| `node tools/golden/rebaseline.mjs` sem `--confirm` | exit 1, nada escrito |
| `git show --stat 1c0f5d4` | **um único arquivo** |
| `git diff <base> HEAD -- tests/golden/*.json \| grep hash` | **0 linhas** — o hash nunca entrou no diff |
| `git diff --stat <base> HEAD -- package.json package-lock.json` | vazio — nenhum dos dois tocado |

### Critérios de aceitação, um a um

| Critério | Resultado |
|---|---|
| `grep -c "classKey" packages/sim/src/types.ts` | **0** — ver Deviations, o critério está velho |
| `grep -c "playerName" packages/sim/src/types.ts` | 0 |
| `grep -c "PlayerSlot" packages/sim/src/types.ts` | 3 |
| `grep -rn "world.config.forge\|config\.forge\b" packages src tests` | nada |
| `grep -c "export function slotForge" packages/sim/src/world.ts` | 1 |
| `grep -c "_p" packages/sim/src/shop.ts` | 0 |
| `grep -c "Object.keys(world.players)" packages/sim/src/step.ts` | 0 |
| `grep -c "config.players" packages/sim/src/step.ts` | 1 (≥ 1) |
| `grep -c "toBeCloseTo" tests/canonical-order.test.ts` | 0 |
| `grep -rn "accountId\|peerId" packages/sim/src/` | nada |
| `config` do fixture tem `players` com um slot `p0`, sem `classKey`/`playerName`/`forge` no topo | sim |
| `git diff` do fixture não mostra mudança na linha do `hash` | confirmado, 0 linhas |
| `npx vitest run tests/golden.test.ts` | 8 passed |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Dois canais de dessincronização por ordem de entrada, além do `step()`**

- **Found during:** Task 2, pelo teste vermelho — que é a razão de ele ter sido escrito antes
- **Issue:** `nearestPlayer` (`enemies.ts:56`) e `pickSpawnAnchor` (`enemies.ts:141`) também
  iteravam `Object.values(world.players)`, ou seja, ordem de inserção. O primeiro desempata
  distância pelo primeiro que vê, e quatro jogadores sobre o mesmo ponto de spawn é como toda
  run começa; o segundo entrega o array a `world.rng.pick`, então o **mesmo sorteio** escolhe
  outro jogador conforme quem entrou primeiro. Corrigir só o `step()` deixaria o teste vermelho
  — e, pior, deixaria a propriedade que o plano compra sem valer.
- **Fix:** `orderedPlayers(world)` em `world.ts`, ao lado de `slotForge`. `enemies.ts` já
  importava desse módulo, então nenhuma aresta nova de import; SCC continua com teto 5.
  `loot.ts:116` foi deliberadamente **não** alterado — é um `.some()` com predicado puro.
- **Files modified:** `packages/sim/src/world.ts`, `packages/sim/src/enemies.ts`
- **Commit:** `c727d34`

**2. [Rule 2 - Correção crítica] `hashWorld` dependia da ordem de inserção do Record**

- **Found during:** Task 2
- **Issue:** `JSON.stringify` emite chave em ordem de inserção. Com as correções acima, dois
  mundos bit a bit idênticos ainda fingerprintavam diferente só porque as pessoas entraram em
  outra sequência. `hashWorld` é o detector de desync e o esqueleto do `serialize.ts` da fase 4:
  entregá-lo assim significaria falso positivo em toda sala montada fora de ordem.
- **Fix:** re-chaveamento de `players` na ordem canônica antes de serializar, reusando
  `orderedPlayers` — uma definição de ordem canônica, não duas. Nenhum hash gravado se moveu,
  por construção: mundos cuja inserção já bate com o manifesto serializam nos mesmos bytes.
- **Files modified:** `tests/helpers.ts`
- **Commit:** `c727d34`

**3. [Rule 3 - Bloqueio] A ordem das tasks do plano não é executável como escrita**

- **Found during:** Task 1
- **Issue:** O plano deixa a migração do fixture para a Task 3, mas a Task 2 troca o `step()`
  para iterar `config.players` — campo que o fixture ainda não tinha. A suíte ficaria vermelha
  da Task 2 até a Task 3, e os critérios de aceitação da Task 2 (`npx vitest run` verde **e**
  `git diff --quiet tests/golden/` saindo 0) não podem valer ao mesmo tempo.
- **Fix:** a migração foi **antecipada** para logo depois do commit de código da Task 1, como
  commit próprio de um arquivo. O par `7f46196` → `1c0f5d4` tem exatamente **um** commit
  vermelho, e a mensagem dele declara o vermelho e por que existe. A partir de `1c0f5d4` toda
  fronteira de commit é verde, e a Task 3 verificou a migração em vez de executá-la. Foi o mesmo
  arranjo do plano 01-12 (`365d8f7` → `feb22fa`), que já tinha aceitado três testes vermelhos
  entre commits pelo mesmo motivo: a regra escrita em `tools/golden/rebaseline.mjs` exige que
  um commit que toca `tests/golden/` não toque em mais nada.
- **Files modified:** nenhum a mais do que o plano previa — só a ordem mudou

**4. [Rule 3 - Bloqueio] `buildRunConfig` não alcança `LOCAL_SLOT`**

- **Found during:** Task 1
- **Issue:** O plano manda `buildRunConfig` montar `players: [{ id: LOCAL_SLOT, ... }]`, mas
  `LOCAL_SLOT` mora em `src/main.ts`, que **importa** `src/app/forge.ts`. Importar de volta
  criaria um ciclo de módulo com `main.ts`, que tem `await loadSprites()` no topo.
- **Fix:** o slot virou **parâmetro**: `buildRunConfig(slot, classKey, mode, playerName)`. É a
  forma correta de qualquer jeito — o slot é atribuído pela autoridade (ADR 0001), e `forge.ts`
  não é ela. Hoje `main.ts` sempre passa `p0`; no dia em que um lobby responder, a assinatura já
  diz isso. `beginRun` também passou a ler classe e nome de `config.players[0]` em vez das
  variáveis locais, para que a run comece do mesmo lugar de onde o replay a reconstrói.
- **Files modified:** `src/app/forge.ts`, `src/main.ts`
- **Commit:** `7f46196`

**5. [Rule 3 - Bloqueio] `tools/golden/rebaseline.mjs` quebraria com o fixture novo**

- **Found during:** Task 1
- **Issue:** Fora dos `files_modified` do plano. `serialize()` escreve
  `"players": ${JSON.stringify(f.players)}` como campo de topo; com o campo absorvido pelo
  `config`, o próximo `--confirm` gravaria `"players": undefined` e produziria **JSON
  inválido** — destruindo o ouro exatamente na ferramenta que existe para protegê-lo.
- **Fix:** `freshFixture()` e `serialize()` atualizados para a forma nova, mais o comentário de
  `main()` que listava `config/players/ticks/log`. Exercitado depois: o guarda sem `--confirm`
  lê o fixture migrado corretamente (765 registros, `53f86446`) e sai 1 sem escrever.
- **Files modified:** `tools/golden/rebaseline.mjs`
- **Commit:** `7f46196`

**6. [Rule 3 - Nota, nenhuma alteração] O critério do `classKey` contradiz a ação do plano**

- **Found during:** Task 1 — o mesmo defeito de planejamento que outros cinco executores desta
  fase encontraram
- **Issue:** O critério diz que `grep -c "classKey" packages/sim/src/types.ts` deve "mostrar o
  campo apenas dentro de `RunPlayer`". Mas a **ação** do mesmo plano especifica `RunPlayer` com
  `cls: ClassKey`, não `classKey`. O grep é sensível a maiúsculas, então `ClassKey` não casa com
  `classKey`, e o resultado é **0**, igual ao de `playerName`.
- **Fix:** nenhum. `cls` é o nome certo por três razões independentes: é o que a ação do plano
  manda, é o que a lista `players` do fixture já usava desde 01-04, e é o que torna `RunPlayer`
  estruturalmente atribuível ao `PlayerSlot` de `@dg2/protocol` — sem isso,
  `RunEnvelope.players` e `decodeLog` precisariam de conversão. A intenção do critério (que
  `classKey` e `playerName` saiam do topo do `RunConfig`) está satisfeita e verificada.
- **Files modified:** nenhum

**7. [Rule 2 - Documentação] Colisão de nome entre os dois `PlayerSlot`**

- **Found during:** Task 1
- **Issue:** `@dg2/protocol` **já exporta** um `PlayerSlot`, e é um objeto `{id, cls, name}`. O
  novo `PlayerSlot` de `@dg2/sim` é a união `'p0'|'p1'|'p2'|'p3'`. Nomes iguais, tipos
  diferentes, pacotes diferentes. Nenhum arquivo importa os dois hoje, mas o próximo leitor não
  tem como saber disso.
- **Fix:** o JSDoc do tipo em `packages/sim/src/types.ts` aponta explicitamente para o homônimo
  do protocolo e diz qual é qual. Renomear o do protocolo seria mexer no formato do envelope,
  que está fora do escopo deste plano e é caro depois de haver replays gravados.
- **Files modified:** `packages/sim/src/types.ts`
- **Commit:** `7f46196`

---

**Total deviations:** 1 bug real com dois pontos (Rule 1), 1 correção crítica no detector de
desync (Rule 2), 3 bloqueios de execução (Rule 3), 1 nota de critério contraditório sem
alteração e 1 de documentação. Nenhuma mudança arquitetural, nenhum checkpoint humano
necessário, nenhum aumento de escopo.

## Issues Encountered

- **`node_modules` não existia no worktree.** Resolvido com `npm ci` (nunca `npm install`).
  `package.json` e `package-lock.json` **não** foram modificados — `git diff` vazio contra a
  base para os dois, confirmado no fim.
- **Os navegadores do Playwright não estavam instalados no worktree.**
  `npx playwright install chromium firefox webkit` uma vez; a versão do Playwright é fixa em
  `1.62.1` no `package.json`, que é exatamente a variável do experimento cross-engine.
- **`BASE_CONFIG` precisou de cópia profunda em `makeTestWorld`.** Seis linhas de teste escrevem
  em `w.config.players[0].forge`; com o literal compartilhado, um teste que subisse `merchant`
  para 5 vazaria para todo mundo construído depois e a suíte passaria a depender da ordem de
  execução — a única coisa que uma suíte de determinismo nunca pode ser. `makeTestWorld` agora
  copia `players` e o `forge` de cada slot.
- **O slot de `BASE_CONFIG` é `p1`, não `p0`.** Deliberado: é o id que a suíte sempre passou ao
  `createPlayer` e a chave sob a qual `runTicks` alimenta inputs. Como `step()` agora itera
  `config.players`, um slot que não estivesse listado ali não receberia tick nenhum, e ~250
  asserções ficariam mudas em silêncio. Trocar para `p0` seria um plano à parte, e não teria
  ganho nenhum: esses mundos não têm relação com o slot do aplicativo.
- **`tests/enemies.test.ts` cria jogadores `'a'` e `'b'`, fora do manifesto.** Continua
  funcionando e **não** foi alterado: `orderedPlayers` acrescenta os não-descritos depois dos do
  manifesto, ordenados por id, e como aquele teste nunca chama `step()`, o comportamento é
  idêntico ao de antes. `createPlayer` manteve `id: string` de propósito — estreitar para
  `PlayerSlot` quebraria esse teste sem comprar nada, já que `world.players` continua
  `Record<string, Player>` por D-13.

## Known Stubs

Nenhum. Tudo o que este plano introduz tem consumidor: `RunConfig.players` é lido por `step()`,
por `slotForge`, por `orderedPlayers`, pelo `hashWorld` e pelos dois testes novos; `PlayerSlot`
tipa `LOCAL_SLOT` e o parâmetro de `buildRunConfig`.

O único ponto que **parece** um stub e não é: `players` tem um elemento só, hoje e até a fase 4.
Isso não é dado vazio — é o tamanho verdadeiro de uma sala solo, e o array existe agora
justamente para que crescer não seja mudança de formato.

## Threat Flags

Nenhuma. Nenhuma superfície nova de rede, de autenticação, de acesso a arquivo ou de esquema em
fronteira de confiança. As duas mitigações do registro do plano foram implementadas e
verificadas, e a disposição `accept` continua válida:

- **T-1-01 (tampering — canal lateral por ordem de entrada):** `step()` itera
  `world.config.players`, e mais dois canais que o registro não conhecia foram fechados
  (`nearestPlayer`, `pickSpawnAnchor`). `tests/canonical-order.test.ts` prova em três
  permutações, com um controle que impede a passagem por vacuidade.
- **T-1-01 (spoofing — identidade atravessando entre os três espaços):**
  `tests/identity.test.ts` assere por fonte **e** por serialização, e as três asserções foram
  vistas falhar sob sabotagem controlada.
- **T-1-02 (forge inflado atravessando o `RunConfig`) — `accept`, e continua:** o `RunConfig`
  ainda é montado pelo cliente. D-36 já registrou que a run rankeada da fase 9 roda com perfil
  normalizado e o servidor reconstrói o `RunConfig` a partir da conta. **O que mudou para
  melhor:** o forge agora é por slot, então a fase 9 pode normalizar o perfil de **um** jogador
  sem tocar nos outros — antes, um único campo de run tornava isso impossível de expressar.

## Fronteiras da wave

Nada fora do escopo declarado foi tocado, com duas exceções documentadas nas deviações 1 e 5
(`packages/sim/src/enemies.ts` e `tools/golden/rebaseline.mjs`), ambas necessárias para que a
propriedade do plano valesse e para que a ferramenta do ouro não quebrasse.
**`package.json` e `package-lock.json` intactos.** `.planning/STATE.md` e `.planning/ROADMAP.md`
**não** foram modificados: a orquestração é dona dessas escritas.

## User Setup Required

Nenhum. Numa máquina nova, `npx playwright install chromium firefox webkit` uma vez para rodar
`npm run test:browser` localmente — o CI já faz isso, com cache chaveado pela versão exata do
Playwright.

## Next Phase Readiness

- **Critério de sucesso 4 da fase: atingido e verificável por comando.** FORM-02 fechou;
  embaralhar a ordem de entrada não move um bit, provado em três permutações mais a leitura
  direta do manifesto.
- **FORM-01 fechou a metade testável.** A metade escrita é o ADR 0001, que já existia; o que
  faltava era asserção executável, e agora as duas varreduras a fazem. O que o teste **não**
  prova — que três espaços é o desenho certo — continua em `01-VALIDATION.md` § Manual-Only, e
  está dito no próprio arquivo.
- **Fase 4 (netcode):** a ordem canônica vive no manifesto da run, que é de onde o transporte já
  vai lê-la, e `hashWorld` parou de reportar desync falso por ordem de chegada. Um lobby que
  atribua `p0..p3` e monte `config.players` é tudo o que falta desse lado.
- **Fase 5 (co-op) e fase 6 (contas):** o forge por slot já existe, então quatro perfis
  diferentes na mesma sala não são mudança de formato. A travessia `accountId → playerId`
  continua fora de `packages/sim`, e agora há teste que impede o contrário.
- **Fase 9 (ranking):** o `RunConfig` que o verificador reconstrói já descreve todos os
  jogadores; normalizar o perfil de um deles é editar um elemento do array.
- **Plano 01-14:** nada aqui o bloqueia. `ObjectiveKind` segue esperando o teste que o prende ao
  `OBJECTIVE_KIND` do protocolo.

## Deferred Items

1. **`npm run typecheck:protocol` continua não existindo.** Os planos 01-06, 01-10, 01-11 e
   01-12 adiaram cada um; este também, porque a instrução da wave proíbe editar o `package.json`
   da raiz. Registrado para não se perder.
2. **`RunEnvelope.players` ficou redundante com `RunConfig.players`.** O JSDoc do `PlayerSlot`
   do protocolo diz literalmente "Until `RunConfig.players` exists, index 0 designates the local
   slot" — e agora ele existe. Hoje os dois carregam a mesma lista
   (`run-envelope-replay.test.ts` alimenta um com o outro), o que é duas fontes para uma verdade.
   Remover o campo é mudança de **formato de envelope** e custa `RUN_FORMAT_VERSION`; não é
   deste plano, e é barato agora porque ainda não há replay gravado em produção. **Vale decidir
   antes da fase 9.**
3. **Os dois `PlayerSlot` continuam homônimos** entre `@dg2/sim` e `@dg2/protocol`. Documentado
   dos dois lados por comentário; renomear o do protocolo é a mesma decisão de formato do item 2
   e cabe junto com ele.
4. **`createPlayer` aceita `id: string`, não `PlayerSlot`.** Estreitar exigiria mudar
   `tests/enemies.test.ts` e não compra nada enquanto `world.players` for
   `Record<string, Player>` por D-13. `tests/identity.test.ts` cobre o risco por outro caminho:
   assere que todo id dentro de `world.players` casa com `/^p[0-3]$/`.

## Self-Check: PASSED

- `tests/canonical-order.test.ts` — FOUND
- `tests/identity.test.ts` — FOUND
- `packages/sim/src/types.ts` — FOUND, com `PlayerSlot`, `ForgeLevels` e `RunPlayer`
- `packages/sim/src/world.ts` — FOUND, com `slotForge` e `orderedPlayers`
- `tests/golden/campaign-mage-3000.json` — FOUND, hash `53f86446`
- `.planning/phases/01-formato-e-costuras/01-13-SUMMARY.md` — FOUND
- commit `7f46196` — FOUND
- commit `1c0f5d4` — FOUND, um único arquivo
- commit `19ca12d` — FOUND
- commit `c727d34` — FOUND
- commit `07cba86` — FOUND
- Diff total contra a base `2e2ff57`: 24 arquivos, todos dentro do escopo declarado mais
  `packages/sim/src/enemies.ts` e `tools/golden/rebaseline.mjs` das deviações 1 e 5.
  `package.json` e `package-lock.json` ausentes da lista, como exigido pela wave.

---
*Phase: 01-formato-e-costuras*
*Completed: 2026-08-31*
