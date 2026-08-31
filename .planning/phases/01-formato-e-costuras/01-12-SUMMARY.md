---
phase: 01-formato-e-costuras
plan: 12
subsystem: sim
tags: [determinismo, fdlibm, cross-engine, hash-ouro, sim-version, d-06, d-19, d-30, form-04, form-08]

# Dependency graph
requires:
  - phase: 01-09
    provides: "packages/sim/src/math.ts — sin, cos e atan2 bit-exatos, exportados pelo barrel e sem consumidor"
  - phase: 01-04
    provides: "tests/golden/campaign-mage-3000.json, tools/golden/rebaseline.mjs e o portao cross-engine vermelho por desenho"
  - phase: 01-07
    provides: "sim:version:verify, e o registro de que STAT_LABELS/PCT_STATS eram a violacao de D-06 a pagar aqui"
  - phase: 01-06
    provides: "packages/protocol e a tabela OBJECTIVE_KIND que ObjectiveKind espelha"
  - phase: 01-08
    provides: "levelup.ts, o corte do ciclo e a contagem de 27 modulos em purity.test.ts"
provides:
  - "packages/sim sem Math.sin/cos/atan2 — os 27 call sites apontam para sim/math.ts"
  - "Regra de lint bloqueando sin, cos, atan2, tan, pow, exp, log e hypot dentro de packages/sim/src, provada por sabotagem controlada"
  - "O MESMO hashWorld em Node, Chromium, Firefox e WebKit — 53f86446 — pela primeira vez no projeto"
  - "npm run test:browser bloqueante no CI: o continue-on-error saiu"
  - "World com forma congelada: objectives presente desde createWorld, nextWaveDelay removido"
  - "STAT_LABELS e PCT_STATS fora do SIM_VERSION (src/ui/labels.ts), e o conceito de escala de sprite fora de sim/"
  - "O primeiro e unico re-baseline de hash-ouro da fase, num commit de um arquivo so"
affects: [01-14, fase-04-netcode, fase-07-arte, fase-08-missoes, fase-09-ranking]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Troca de trigonometria como troca de IMPORT, nunca de expressao: nenhuma formula reescrita, nenhuma operacao reordenada, para que a mudanca de hash tenha uma unica causa atribuivel"
    - "Regra de lint provada por sabotagem controlada e desfeita, em vez de assumida — inclusive dentro do proprio modulo substituto"
    - "Medicao de hash de bundle fora da arvore (probe com CONTROLE): so se pode confiar no numero 'antes' depois que o mesmo aparato reproduz o numero 'depois' ja conhecido"
    - "Um numero que e estado do World fica em sim/ e muda de NOME; o CONCEITO de apresentacao sai para render/"

key-files:
  created:
    - src/ui/labels.ts
  modified:
    - packages/sim/src/arena.ts
    - packages/sim/src/boss.ts
    - packages/sim/src/combat.ts
    - packages/sim/src/enemies.ts
    - packages/sim/src/loot.ts
    - packages/sim/src/run.ts
    - packages/sim/src/special.ts
    - packages/sim/src/constants.ts
    - packages/sim/src/stats.ts
    - packages/sim/src/types.ts
    - packages/sim/src/world.ts
    - src/main.ts
    - src/render/entities.ts
    - src/ui/screens.ts
    - src/ui/shop.ts
    - eslint.config.js
    - tests/cross-engine.test.ts
    - tests/golden/campaign-mage-3000.json
    - .github/workflows/ci.yml

key-decisions:
  - "packages/sim/src/math.ts NAO recebeu excecao da regra de lint — o plano permitia as duas formas, e uma excecao ali abriria o buraco no unico arquivo onde ele custa mais caro"
  - "O cabecalho de tests/cross-engine.test.ts foi reescrito (fora dos files_modified do plano): dizia 'EXPECTED TO BE RED', o que passou a ser um convite para tratar o verde como portao desarmado"
  - "Tres criterios de aceitacao com grep literal foram satisfeitos na LETRA reescrevendo comentarios, nao ignorados — ver Deviations"
  - "SIM_VERSION 'antes' foi MEDIDO, nao herdado do SUMMARY do 01-09, com um probe validado por controle"

patterns-established:
  - "Commit de hash-ouro toca um arquivo, e `git log -- tests/golden/` continua sendo a lista completa do que ja alterou a simulacao"
  - "Um comentario que manda esperar vermelho vira defeito no dia em que a coisa fica verde: envelhece junto com o portao"

requirements-completed: [FORM-04, FORM-08]

# Metrics
duration: ~22min
completed: 2026-08-31
---

# Phase 01 Plano 12: Trigonometria propria, forma congelada e o unico re-baseline Summary

**Os quatro motores concordam. Node, Chromium, Firefox e WebKit produzem o mesmo `hashWorld`
`53f86446` na run de ouro — e nos 50 checkpoints intermediarios — pela primeira vez na historia
do projeto, com o portao que nasceu vermelho no plano 01-04 agora verde e bloqueante no CI.**

## Performance

- **Duration:** ~22 min
- **Started:** 2026-08-31T15:39Z
- **Completed:** 2026-08-31T16:01Z
- **Tasks:** 3 de 3
- **Files:** 20 (1 criado, 19 modificados)

## O portao — medido, nao inferido

`npm run test:browser`, rodado nesta arvore, com `--reporter=verbose` para nomear cada motor:

```
✓ |chromium| a run de ouro produz o mesmo hashWorld neste motor
✓ |chromium| os hashes intermediários batem, para localizar o tick da divergência
✓ |webkit|   a run de ouro produz o mesmo hashWorld neste motor
✓ |webkit|   os hashes intermediários batem, para localizar o tick da divergência
✓ |firefox|  a run de ouro produz o mesmo hashWorld neste motor
✓ |firefox|  os hashes intermediários batem, para localizar o tick da divergência

Test Files  3 passed (3)      Tests  6 passed (6)
```

**Os dois testes por motor importam, nao so o primeiro.** O plano 01-04 descobriu que neste jogo
a divergencia entre motores e transitoria — nasce, e sara quando as entidades divergentes morrem —
e por isso escolheu a seed `0x0d6b0975`, cuja divergencia sobrevive ate o tick 3000. Um hash
terminal verde sozinho nao seria prova; os 50 checkpoints sao. Todos os 50 batem, nos tres motores.

Antes (plano 01-04): `6 failed (6)`, `expected d3a93053, received fa099f16`, primeira divergencia
no tick 960, 23/50 checkpoints no Chromium e 24/50 no Firefox e no WebKit.

## O re-baseline: `d3a93053` -> `53f86446`, e a que se deve

O primeiro e unico re-baseline da fase, gravado por `npm run golden:rebaseline -- --confirm`, na
perna de Node. **Commit `feb22fa`, um arquivo, 51 linhas: o hash e os 50 checkpoints.** Os 765
registros do log nao mudaram — o roteiro e o mesmo, quem mudou foi a simulacao.

A mudanca tem **duas** causas, e elas foram medidas **separadamente**, porque as tasks 1 e 2
foram commitadas separadamente e a suite foi rodada entre elas:

| Etapa | Hash | Causa |
|---|---|---|
| Base `0a4e077` | `d3a93053` | — |
| Depois da Task 1 (so a troca de trigonometria) | **`fa099f16`** | os 27 call sites passam a usar `sim/math.ts` |
| Depois da Task 2 (forma do `World`) | **`53f86446`** | `nextWaveDelay` removido, `objectives: []` acrescentado |

**O valor intermediario nao e coincidencia, e e o achado mais interessante desta execucao.**
`fa099f16` e exatamente o hash que Chromium, Firefox e WebKit produziam **antes** desta fase,
quando ainda usavam a trigonometria embutida do proprio motor. Ou seja: o port fdlibm chega ao
mesmo resultado que os tres navegadores ja calculavam, e **quem estava sozinho era o Node** — o
mesmo V8 que roda no Chromium, em outra versao. Registrado como medicao, sem teoria por cima;
mas e o precedente do Chrome 148 (`Math.tanh` delegado ao libm do host) aparecendo de novo, e a
razao de "exigir que todos usem Chrome" nunca ter sido garantia de nada.

`git log -- tests/golden/` continua com tres entradas, todas explicaveis:

```
feb22fa test(01-12): re-baselina o ouro, d3a93053 -> 53f86446
01ca392 fix(01-04): troca a seed do ouro para uma que preserva a divergencia
9db5552 feat(01-04): ouro versionado e o unico caminho auditavel para muda-lo
```

O guarda tambem foi exercitado: `node tools/golden/rebaseline.mjs` **sem** `--confirm` sai 1 e nao
escreve nada, como projetado.

## `SIM_VERSION` — mudou duas vezes por motivos diferentes, e ENCOLHEU

| | Antes (base `0a4e077`) | Depois (HEAD) | Delta |
|---|---|---|---|
| Bytes de `packages/sim/dist/sim.js` | 65.225 | **64.619** | **−606** |
| `SIM_VERSION` | `sha256:f390f346cb595f1d` | **`sha256:c47283ea6fe7512c`** | |

O valor "antes" foi **medido nesta arvore**, nao copiado do SUMMARY do 01-09. Como
`git checkout <base> -- packages/sim/src` foi recusado pelo ambiente, a medicao foi feita fora da
arvore: `git archive` das fontes da base para um diretorio temporario, build com uma copia da
`packages/sim/vite.config.ts` apontando para la — **mais um CONTROLE**, o mesmo aparato alimentado
com as fontes ATUAIS. O controle devolveu `sha256:c47283ea6fe7512c` / 64.619 bytes, identico ao
`npm run sim:version` de verdade, o que prova que o nome do diretorio do probe nao vaza para o
bundle e portanto que o numero da base e confiavel. Ele bateu com o que o 01-09 tinha registrado
(`f390f346cb595f1d`), o que e confirmacao independente e nao suposicao. O diretorio do probe foi
removido; `git status` limpo.

**O bundle diminuiu, e essa e a entrega de D-06 ficando mensuravel.** As duas tabelas de rotulo de
HUD sairam do artefato hasheado. A partir daqui, renomear `ATK SPEED` para `ATTACK SPEED` nao
muda um byte do `SIM_VERSION`, nao fecha temporada de ranking (D-34) e nao recusa entrada em sala
(D-08). Era a violacao de D-06 que o plano 01-07 marcou explicitamente para ser paga aqui.

`npm run sim:version:verify` sai 0 e afirma as duas metades com os valores na tela: reprodutivel
(mesmo hash em 3 builds) e sensivel (perturbar `constants.ts` deu `sha256:9811ca2f460d6647`).

## A regra de lint — provada, nao assumida

`eslint.config.js` ganhou oito entradas em `no-restricted-properties` para `packages/sim/src/**`:
`sin`, `cos`, `atan2` (que tem substituto e a mensagem diz qual), mais `tan`, `pow`, `exp`, `log`
e `hypot` (que nao tem, e a mensagem diz para escrever um antes de usar). Todas citam D-01, no
formato que o arquivo ja usava: dizer **o que usar em vez** e **de onde vem a regra**.

**Sabotagem controlada, feita e desfeita** — porque uma regra que nunca disparou e uma regra que
nao se sabe se existe:

| Sabotagem | Resultado |
|---|---|
| `Math.sin(0)` reintroduzido em `packages/sim/src/loot.ts:154` | `npm run lint` **exit 1**: `'Math.sin' is restricted from being used. use sin from sim/math.ts — the engine version is implementation-approximated (D-01)` |
| `Math.cos(0)` reintroduzido em `packages/sim/src/math.ts:417` | `npm run lint` **exit 1**, mesma forma de mensagem para `Math.cos` |

As duas foram revertidas a partir de copias tomadas antes; `git diff --stat packages/sim/src/math.ts`
voltou vazio e `npm run lint` voltou a sair 0 antes do commit.

O segundo caso e deliberado e vale explicar. O plano oferecia duas formas de tratar o `math.ts`:
um bloco de excecao, **ou** escrever a regra de modo que ele nao fosse alcancado. **Escolhi nao dar
excecao nenhuma.** A regra casa com a expressao de membro `Math.<nome>` e nunca com um
identificador nu, entao o proprio `export function sin` do modulo e suas chamadas internas ja
estao fora de alcance por construcao; a unica coisa que dispararia ali e um `Math.sin` literal
dentro do substituto — que e exatamente o que jamais pode existir. Uma excecao abriria o buraco no
arquivo onde ele custa mais caro: `math.ts` delegando em silencio para o motor manteria a suite
inteira verde e devolveria de presente a divergencia que o port foi escrito para remover. O
`eslint.config.js` carrega esse raciocinio em comentario, para que ninguem "conserte" a ausencia.

## As cinco mudancas de forma, num re-baseline so

| Mudanca | Onde | Por que agora |
|---|---|---|
| `STAT_LABELS` + `PCT_STATS` -> `src/ui/labels.ts` | saiu de `sim/stats.ts` | D-06: renomear rotulo de HUD nao pode fechar temporada |
| `SPRITE_SCALE` -> `DEFAULT_ENTITY_SCALE` | numero fica em `sim/constants.ts`, conceito vai para `render/entities.ts` | D-19: o numero escreve `Enemy.scale` e e estado do `World`; a escala de desenho nao e |
| `nextWaveDelay` removido | `sim/types.ts`, `sim/world.ts` | inicializado em 3000 e nunca lido; estava prestes a entrar num formato congelado |
| `world.objectives` nasce | `sim/types.ts`, `sim/world.ts` | FORM-08: campo do `World`, nao evento drenavel |
| `'p1'` -> `LOCAL_SLOT = 'p0'` | `src/main.ts` | FORM-01/D-30: os slots sao `p0..p3` |

Sobre `DEFAULT_ENTITY_SCALE`, para a **fase 7**: o numero continua 2 dos dois lados hoje, mas eles
querem dizer coisas diferentes e agora podem se separar. Quando a arte de 32x48 entrar, quem vira
1 e o `SPRITE_SCALE` **local de `render/entities.ts`** — e essa edicao nao vai tocar em
`packages/sim` nem mudar o `SIM_VERSION`. Antes deste plano, ela teria fechado uma temporada.

Sobre `world.objectives`, as tres propriedades que definem a forma estao escritas como comentario
no `ObjectiveState`, porque sao o motivo de ela ser essa: **(a)** e campo do `World` e nao evento
drenavel — progresso alcancado por `world.events` seria inverificavel por replay, ja que quem
drena e `app/` e o que `app/` consumiu nao sobrevive ao snapshot (ADR 0012); **(b)** e JSON-safe,
sem `Map`, sem `Set` e sem instancia de classe, porque `world.rng` e a unica instancia de classe do
`World` e vai continuar sendo; **(c)** esta sempre presente com a mesma forma, mesmo numa run de
campanha sem missao — a mesma doutrina ja escrita no comentario de `eliteName`/`eliteTint`.
`ObjectiveKind` espelha a ordem de `OBJECTIVE_KIND` de `packages/protocol`, e o comentario aponta
que o plano 01-14 e quem prende as duas listas uma na outra por teste.

O `'p1'` dos testes existentes **nao** mudou, como o plano pediu: eles montam mundos proprios e
nada os liga ao slot do aplicativo. O ouro do 01-04 ja usava `p0`, entao essa troca nao acrescentou
nada ao re-baseline.

## Task Commits

| # | Task | Commit | Tipo |
|---|---|---|---|
| 1 | Os 27 call sites e a regra de lint que impede a volta | `c15a777` | feat |
| 2 | Congelar a forma do `World` e tirar o vocabulario de HUD do bundle | `365d8f7` | feat |
| 3a | O re-baseline do ouro, **sozinho** | `feb22fa` | test |
| 3b | O portao cross-engine passa a ser bloqueante | `6dc07f6` | ci |

A Task 3 virou dois commits de proposito: a regra escrita no topo de `tools/golden/rebaseline.mjs`
diz que um commit que muda um hash-ouro nao muda mais nada, e o passo de CI nao e o ouro.

## Verificacao

| Portao | Resultado |
|--------|-----------|
| `npm run test:browser` | **6 passed (6)** — chromium, firefox e webkit, nomeados um a um |
| `npx vitest run tests/golden.test.ts` | 8 passed — a perna Node no mesmo hash |
| `npm test` | **362 passed em 31 arquivos** — a baseline inteira, nenhum perdido, nenhum novo |
| `npm run lint` | exit 0 |
| `npm run typecheck:sim` | exit 0 |
| `npx tsc --noEmit` | exit 0 |
| `npm run build` | exit 0 — 59 modulos |
| `npm run sim:version:verify` | exit 0 — reprodutivel e sensivel |
| `npm run assets:selftest` / `assets:refusal` / `assets:validate` | os tres exit 0 |
| `git show --stat feb22fa` | **um unico arquivo** |
| `grep -c "continue-on-error" .github/workflows/ci.yml` | 0 |
| `git diff --stat <base> HEAD -- package.json package-lock.json` | vazio — nenhum dos dois tocado |

### Criterios de aceitacao, um a um

| Criterio | Resultado |
|---|---|
| `grep -rnE "Math\.(sin\|cos\|atan2)\(" packages/sim/src/` | nada |
| `grep -rc "from './math'"` nos sete arquivos | 1 em cada um dos sete |
| `grep -rc "Math.sqrt" packages/sim/src/` somado | **27** — ver Deviations, o 25 do plano esta velho e o invariante se manteve |
| `npx vitest run tests/math-oracle.test.ts` | 18 passed |
| `OPEN ITEM` no bloco de doutrina de `constants.ts` | removido |
| `grep -rn "STAT_LABELS\|PCT_STATS" packages/sim/src/` | nada |
| `grep -c "export const STAT_LABELS" src/ui/labels.ts` | 1 |
| `grep -rn "SPRITE_SCALE" packages/sim/src/` | nada |
| `grep -c "DEFAULT_ENTITY_SCALE" packages/sim/src/constants.ts` | 1 (>= 1) |
| `grep -c "SPRITE_SCALE" src/render/entities.ts` | 5 (>= 1) |
| `grep -rn "nextWaveDelay" packages src tests` | nada |
| `grep -c "objectives" packages/sim/src/types.ts` | 3 (>= 2) |
| `grep -c "objectives: \[\]" packages/sim/src/world.ts` | 1 |
| `grep -c "'p1'" src/main.ts` | **0** — ver Deviations |
| `grep -c "LOCAL_SLOT" src/main.ts` | 7 (>= 7) |
| `npx vitest run tests/purity.test.ts` / `tests/scc.test.ts` | verdes; `EXPECTED_FILE_COUNT` segue 27, nenhum modulo entrou ou saiu |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Documentacao incorreta] O cabecalho de `tests/cross-engine.test.ts` mandava esperar vermelho**

- **Found during:** Task 3
- **Issue:** O arquivo abre com "It is EXPECTED TO BE RED until plan 01-12...". A partir do commit
  `feb22fa` isso passou a ser falso, e falso do jeito perigoso: um comentario que manda esperar
  vermelho e o convite para o proximo leitor tratar o verde como portao desarmado — que e
  exatamente o modo de falha que o proprio 01-04 descreve ("se passar antes do 01-12, o portao foi
  desarmado, nao consertado"). O arquivo nao estava em `files_modified`.
- **Fix:** Cabecalho reescrito: registra que era vermelho por desenho de 01-04 a 01-12, que agora
  e verde nos quatro motores em `53f86446`, e **guarda a medicao** (o passo intermediario
  `fa099f16` e o que ele revela sobre o Node). A instrucao operacional que importa foi mantida
  intacta: se voltar a ficar vermelho, nao afrouxar a comparacao nem largar um motor.
- **Files modified:** `tests/cross-engine.test.ts`
- **Committed in:** `6dc07f6`

**2. [Rule 3 - Criterio contradizia a acao] Tres greps literais contra comentarios que o plano pediu**

- **Found during:** Tasks 1, 2 e 3 — o mesmo defeito de planejamento que outros quatro executores
  desta fase encontraram
- **Issue:** Em tres pontos o plano manda escrever um termo em comentario e depois assere que o
  grep daquele termo volte 0:
  - `src/main.ts`: "trocar os seis literais `'p1'`" + `grep -c "'p1'" src/main.ts == 0`. O JSDoc
    natural do `LOCAL_SLOT` explica de onde ele veio, e ao nomear o valor antigo reprovava.
  - `packages/sim/src/constants.ts`: "renomear `SPRITE_SCALE` ... com JSDoc explicando ... que a
    escala de desenho de sprite deixou de morar aqui" + `grep -rn "SPRITE_SCALE" packages/sim/src/`
    sem retorno.
  - o bloco de doutrina: pede registrar que a troca fechou o item, sem poder escrever as expressoes
    de membro proibidas.
- **Fix:** Os tres comentarios foram reescritos para dizer **a mesma coisa** sem os tokens
  literais — "um nome um-baseado, repetido como literal em seis lugares"; "costumava ter o nome de
  sprites"; "a seno, cosseno e arco-tangente de dois argumentos embutidos no motor". **A intencao e
  a letra passaram a valer juntas**, e nao houve criterio atendido so no espirito. A rastreabilidade
  nao se perdeu: `git log -S SPRITE_SCALE` acha o rename, e a constante do lado de `render/`
  mantem o ponteiro.
- **Files modified:** `src/main.ts`, `packages/sim/src/constants.ts`
- **Committed in:** `c15a777`, `365d8f7`

**3. [Rule 3 - Nota, nenhuma alteracao] O criterio `Math.sqrt == 25` esta desatualizado, e o invariante se manteve**

- **Found during:** Task 1
- **Issue:** O criterio diz que a soma de `grep -rc "Math.sqrt" packages/sim/src/` "continua em 25".
  Ela vale **27**, e ja valia 27 na base — confirmado com `git grep -c "Math.sqrt" 0a4e077`. A
  diferenca sao as duas mencoes em comentario dentro do proprio bloco de doutrina de
  `constants.ts`: sao **25 chamadas de verdade** mais 2 linhas de prosa, e o grep do criterio nao
  distingue.
- **Fix:** Nenhum. O que o criterio quer garantir — que nenhum `Math.sqrt` foi trocado por engano —
  foi verificado diretamente: `git diff -U0 packages/sim/src | grep "Math.sqrt"` devolve quatro
  linhas, todas de comentario reescrito em `constants.ts`, duas removidas e duas acrescentadas,
  saldo zero. Nenhuma chamada foi tocada.
- **Files modified:** nenhum
- **Verification:** base 27, HEAD 27, delta 0

**4. [Decisao de desenho] `math.ts` nao recebeu excecao da regra de lint**

- **Found during:** Task 1
- **Issue:** O plano pede que `packages/sim/src/math.ts` seja "excecao da propria regra",
  oferecendo duas formas: um bloco de override, **ou** escrever a regra de modo que ele nao seja
  alcancado.
- **Fix:** A segunda forma, que o plano permite explicitamente. Detalhes e o raciocinio completo na
  secao "A regra de lint" acima; em resumo, um override ali seria o pior lugar do repositorio para
  abrir um buraco, e a regra ja nao alcanca o modulo por construcao. A ausencia esta comentada no
  `eslint.config.js` para nao parecer esquecimento, e a sabotagem em `math.ts:417` prova que o
  arquivo esta de fato coberto.
- **Files modified:** `eslint.config.js`
- **Committed in:** `c15a777`

---

**Total deviations:** 1 de documentacao (Rule 2), 2 de criterio contraditorio (Rule 3, uma sem
alteracao) e 1 decisao de desenho que o plano ja autorizava. Nenhuma mudanca arquitetural, nenhum
checkpoint humano necessario, nenhum aumento de escopo.

## Issues Encountered

- **`node_modules` nao existia no worktree.** Resolvido com `npm ci` (nunca `npm install`).
  `package-lock.json` **nao foi modificado** — confirmado por `git status` limpo logo apos, e por
  `git diff` vazio contra a base no fim.
- **`git checkout <base> -- packages/sim/src` foi recusado pelo ambiente.** Era o caminho direto
  para medir o `SIM_VERSION` da base. Contornado com o probe fora da arvore + controle descrito
  acima, que acabou sendo **melhor** do que o caminho bloqueado: o controle prova que a medicao e
  valida, coisa que a mutacao temporaria da arvore nao provaria, e nunca poe a arvore de trabalho
  num estado inconsistente.
- **A guarda de dominio de `sin`/`cos` (`|x| < 2^20`) nunca disparou.** Era o risco que o SUMMARY do
  01-09 sinalizou — todo angulo que chega ao `sin`/`cos` passa a ser validado, e um `NaN` que hoje
  corre em silencio viraria `RangeError` visivel. Rodei a suite inteira, os 3000 ticks da run de
  ouro nos quatro motores, e nada lancou. Nenhum caminho de `sim/` estava produzindo angulo fora
  de dominio.
- **`LIVE_UNTIL = 1800` sobreviveu a troca.** Era o risco silencioso desta execucao: o fixture fixa
  o tick em que a onda 1 fecha, e a nova trigonometria poderia ter movido esse muro — o que teria
  significado que o ouro parou de exercitar o que foi gravado para exercitar. O teste
  "simula de verdade ate a onda 1 fechar" passou sem alteracao, nos tres estados intermediarios em
  que a suite foi rodada.
- **Nenhum teste precisou ser reescrito.** Os tres que ficaram vermelhos entre as tasks 1 e 3
  (`golden.test.ts` x2 e `run-envelope-replay.test.ts`) derivam todos do `hash` do fixture; o
  re-baseline os fechou sem tocar em nenhum deles. Nenhum teste dependia de `nextWaveDelay` nem
  importava `STAT_LABELS` de `sim/`.

## Known Stubs

**`world.objectives` nasce vazio e nada o preenche — e isso e intencional, nao um fio solto.**

- **Arquivo:** `packages/sim/src/world.ts` (`objectives: []`) e `packages/sim/src/types.ts`
  (`ObjectiveKind`, `ObjectiveState`)
- **Por que:** FORM-08 pede o **campo**, nao o comportamento. O objetivo deste plano e que a forma
  do `World` esteja congelada **antes** do primeiro board, porque acrescentar o campo depois
  custaria outro re-baseline e, a partir da fase 9, uma temporada. O tipo existe agora para que o
  formato pare de mudar; o preenchimento e a leitura sao da **fase 8** (modo missao). O comentario
  em `ObjectiveState` diz que `[]` e um valor real e nao uma ausencia, exatamente para que ninguem
  o trate como campo opcional.
- **Nao bloqueia o objetivo do plano:** o objetivo era congelar a forma, e ela esta congelada e
  hasheada.

Alem desse, nenhum. Nada aqui renderiza dado vazio nem tem fonte de dados por ligar.

## Threat Flags

Nenhuma. Nenhuma superficie nova de rede, de autenticacao, de acesso a arquivo ou de esquema em
fronteira de confianca. As tres mitigacoes do registro do plano foram implementadas e verificadas:

- **T-1-01 (tampering de hash-ouro sem rastro):** o unico caminho usado foi
  `npm run golden:rebaseline -- --confirm`, so em Node; o guarda sem `--confirm` foi exercitado e
  saiu 1 sem escrever; e `git show --stat feb22fa` lista **um** arquivo.
- **T-1-01 (spoofing — `SIM_VERSION` fechando temporada por mudanca de HUD):** `STAT_LABELS` e
  `PCT_STATS` sairam do bundle e ele **encolheu 606 bytes**. A promessa de D-06 passou a ser
  verificavel, nao declarada.
- **T-1-03 (divergencia entre motores so descoberta em partida ao vivo):** o `continue-on-error`
  saiu do `ci.yml`; o portao derruba o CI a partir daqui.

## Fronteiras da wave

Nada fora do escopo declarado foi tocado, com a unica excecao documentada na deviacao 1
(`tests/cross-engine.test.ts`). **`package.json` e `package-lock.json` intactos** — `git diff`
vazio contra a base para os dois. `.planning/STATE.md` e `.planning/ROADMAP.md` **nao** foram
modificados: a orquestracao e dona dessas escritas.

## User Setup Required

Nenhum. Para rodar o portao localmente numa maquina nova e preciso
`npx playwright install chromium firefox webkit` uma vez — o CI ja faz isso, com cache chaveado
pela versao exata do Playwright (que e a variavel do experimento).

## Next Phase Readiness

- **Criterio de sucesso 1 da fase: atingido e verificavel por comando.** FORM-04 fechou de fato,
  nao so instrumentado. O SUMMARY do 01-04 registrou que FORM-04 devia continuar `Pending` ate
  aqui; agora ha resultado bit-identico nos quatro motores, medido.
- **Fase 4 (netcode):** a propriedade que o multiplayer inteiro compra esta comprada. Dois peers em
  navegadores diferentes rodando o mesmo `SIM_VERSION` produzem o mesmo `World`. O que falta e
  transporte, nao determinismo.
- **Fase 7 (arte):** trocar a escala de desenho para 1 e uma edicao de uma linha em
  `src/render/entities.ts` que nao toca `packages/sim` e nao fecha temporada. Antes deste plano,
  fecharia.
- **Fase 8 (missoes):** `world.objectives` ja existe, ja e hasheado e ja tem a forma decidida.
  Preencher nao muda o formato.
- **Plano 01-14:** `ObjectiveKind` esta em `packages/sim/src/types.ts` na mesma ordem de
  `OBJECTIVE_KIND` de `packages/protocol`, esperando o teste que prende as duas listas.

## Deferred Items

1. **`npm run typecheck:protocol` continua nao existindo.** Os planos 01-06, 01-10 e 01-11 adiaram
   cada um; este tambem, porque a instrucao da wave proibe editar o `package.json` da raiz.
   Registrado para nao se perder — nao e deste plano nem foi resolvido aqui.
2. **`Math.tan`, `pow`, `exp`, `log` e `hypot` estao bloqueados sem substituto.** A regra recusa e
   a mensagem manda escrever o port antes de usar. Nenhum e usado hoje em `packages/sim`
   (`hypot` so aparecia em comentario, e o comentario foi reescrito). O dia em que um for preciso,
   o custo e um port novo em `math.ts` com teste de oraculo — o padrao ja esta estabelecido pelo
   01-09.

## Self-Check: PASSED

- `src/ui/labels.ts` — FOUND
- `packages/sim/src/math.ts` — FOUND (do 01-09, agora com sete consumidores)
- `tests/golden/campaign-mage-3000.json` — FOUND, hash `53f86446`
- `.planning/phases/01-formato-e-costuras/01-12-SUMMARY.md` — FOUND
- commit `c15a777` — FOUND
- commit `365d8f7` — FOUND
- commit `feb22fa` — FOUND, um unico arquivo
- commit `6dc07f6` — FOUND
- Diff total contra a base `0a4e077`: 20 arquivos, todos dentro do escopo declarado mais o
  `tests/cross-engine.test.ts` da deviacao 1. `package.json` e `package-lock.json` ausentes da
  lista, como exigido pela wave.

---
*Phase: 01-formato-e-costuras*
*Completed: 2026-08-31*
