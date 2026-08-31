---
phase: 01-formato-e-costuras
plan: 04
subsystem: determinism
tags: [stepper, fixed-timestep, golden-fixture, cross-engine, vitest-browser, replay, form-10, form-04]

# Dependency graph
requires:
  - "01-01: vitest.config.ts (runner de Node), vitest.browser.config.ts (três motores), tools/README.md"
provides:
  - "`src/app/stepper.ts`: passo fixo puro, dirigível por milissegundos ou por contagem de ticks"
  - "`createStepper(world).runTicks(n, collect)` — o driver de replay e de verificação headless"
  - "`tests/golden/campaign-mage-3000.json`: ouro versionado com log em inteiros quantizados"
  - "`tests/inputLog.ts`: decodificador do log (lar provisório do codec até o plano 01-10)"
  - "`tools/golden/rebaseline.mjs` + `npm run golden:rebaseline`: o único caminho auditável para mudar um hash-ouro"
  - "`tests/cross-engine.test.ts`: o portão FORM-04, vermelho de propósito até o plano 01-12"
  - "Medição por motor da divergência de trigonometria nesta simulação"
affects: [01-09-sim-math, 01-10-protocolo, 01-12-trigonometria, 09-replay]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "O acumulador de passo fixo recebe os milissegundos por argumento; nenhum símbolo de relógio no módulo"
    - "Ouro de teste guarda inteiros quantizados, nunca floats: um roteiro gerado por trigonometria divergiria sozinho"
    - "Log esparso com política de buracos no formato (D-04): tick sem registro repete o último input do jogador"
    - "Portão de determinismo compara a TRAJETÓRIA (checkpoints), não só o estado terminal"
    - "Um commit que muda um hash-ouro não muda mais nada"

key-files:
  created:
    - src/app/stepper.ts
    - tests/stepper.test.ts
    - tests/inputLog.ts
    - tests/golden.test.ts
    - tests/cross-engine.test.ts
    - tests/golden/campaign-mage-3000.json
    - tools/golden/rebaseline.mjs
  modified:
    - src/app/loop.ts
    - package.json
    - .gitignore
    - .planning/REQUIREMENTS.md

key-decisions:
  - "A seed do roteiro de inputs NÃO é arbitrária: foi escolhida por varredura porque a maioria das seeds produz divergência transitória, que sara antes do tick 3000 e deixa o hash final concordando nos quatro motores"
  - "O portão compara 50 checkpoints além do hash final; o hash final sozinho não é detector suficiente nesta simulação"
  - "`DT_MS * 3` não são três fatias inteiras (o produto arredonda para 50, meio ulp abaixo), então `advance(DT_MS*3)` executa 2 ticks — o teste assere a verdade do IEEE-754, não a frase do plano"
  - "`aim` decodificado como int16, mantendo [−π, π), o domínio que `Math.atan2` já produz"
  - "FORM-04 continua Pending: o portão existe, mas o requisito é resultado bit-idêntico, e isso só chega no plano 01-12"

patterns-established:
  - "Fixture de ouro serializado com um registro por linha, para que o diff nomeie os ticks que mudaram"
  - "Emissor de hash via `import.meta.env.VITE_GOLDEN_EMIT` + `--disableConsoleIntercept`"

requirements-completed: [FORM-10]

# Metrics
duration: ~35min
completed: 2026-08-31
---

# Phase 01 Plan 04: Passo Fixo e Portão Cross-Engine Summary

**O passo fixo saiu do `rAF` e virou um objeto puro dirigível por contagem de ticks, e sobre ele
foi construído o portão de determinismo entre motores — que está vermelho nos três navegadores,
de propósito, com a divergência medida e localizada no tick 960.**

## Performance

- **Duration:** ~35 min
- **Started:** 2026-08-31T13:55Z
- **Completed:** 2026-08-31T14:28Z
- **Tasks:** 3 de 3
- **Files:** 11 (7 criados, 4 modificados)

## Inventário explícito de portões: o que está verde e o que está vermelho

Este plano entrega um teste que **falha de propósito**. Para que ninguém confunda o vermelho
intencional com regressão:

| Script | Estado | Observação |
|---|---|---|
| `npm test` | **VERDE** — 288 passed (25 files) | 271 da baseline + 9 do stepper + 8 do ouro |
| `npm run lint` | **VERDE** — exit 0 | |
| `npx tsc --noEmit` | **VERDE** — exit 0 | |
| `npm run build` | **VERDE** — exit 0 | 49 módulos |
| `npm run golden:rebaseline -- --confirm` | **VERDE** — exit 0 | imprime `<hash antigo> -> <hash novo>` |
| `node tools/golden/rebaseline.mjs` (sem `--confirm`) | **exit 1 POR DESIGN** | é o guarda; não escreve nada |
| `npm run test:browser` | **VERMELHO POR DESIGN** — 6 failed (6) | o entregável deste plano |

**`npm test` não executa `tests/cross-engine.test.ts`** — ele está no `exclude` do
`vitest.config.ts` desde o plano 01-01. O vermelho fica confinado a `npm run test:browser`.

### O texto exato da falha esperada

`npm run test:browser`, nos três motores:

```
FAIL |chromium| tests/cross-engine.test.ts > determinismo entre motores > a run de ouro produz o mesmo hashWorld neste motor
Expected: "d3a93053"
Received: "fa099f16"

FAIL |chromium| tests/cross-engine.test.ts > determinismo entre motores > os hashes intermediários batem, para localizar o tick da divergência
Expected: "nenhuma divergência"
Received: "23/50 checkpoints divergem; primeiro no tick 960 (ouro e0db14a, este motor cc71d284); último no tick 3000"
```

`firefox` e `webkit` produzem o mesmo, com `24/50` em vez de `23/50`.

**Qualquer outro resultado é regressão.** Em particular: se `npm run test:browser` passar antes do
plano 01-12, o portão foi desarmado, não consertado.

## Resultado medido por motor

| Motor | `hashWorld` no tick 3000 | Checkpoints divergentes | Primeiro tick | Último tick |
|---|---|---|---|---|
| **Node 24.11.1** (o ouro) | `d3a93053` | — (referência) | — | — |
| **Chromium** | `fa099f16` | **23 de 50** | **960** | 3000 |
| **Firefox** | `fa099f16` | **24 de 50** | **960** | 3000 |
| **WebKit** | `fa099f16` | **24 de 50** | **960** | 3000 |

Os três navegadores concordam entre si e discordam do Node — coerente com a pesquisa, que já tinha
Firefox e WebKit idênticos em `sin`. A contagem de checkpoints (23 vs 24) é o que ainda separa o
Chromium dos outros dois.

## Task Commits

1. **Task 1 (TDD RED)** — `03f926c` `test(01-04)`: os sete comportamentos do passo fixo, vermelhos
2. **Task 1 (TDD GREEN)** — `2e27182` `feat(01-04)`: `app/stepper.ts` criado, `loop.ts` reduzido ao adaptador
3. **Task 2** — `9db5552` `feat(01-04)`: ouro, decodificador, perna Node e script de re-baseline
4. **Task 3 (correção de seed)** — `01ca392` `fix(01-04)`: hash `e22dd9fb -> d3a93053`
5. **Task 3** — `ff3a0ec` `feat(01-04)`: o portão cross-engine

## A descoberta que mudou o plano: a divergência transitória

Esta é a parte que mais importa para quem ler depois.

Na primeira montagem, o portão ficou **meio vermelho**: os checkpoints divergiam em todos os
motores, mas o teste do **hash final passava nos três**. A instrução do plano é explícita — "se os
quatro motores concordarem, algo está errado no portão, investigar antes de declarar a task
pronta". Investiguei.

**A causa:** a divergência entre motores é **transitória**. Ela nasce cedo (tick 180 na primeira
seed), mas as entidades que divergiram — inimigos, projéteis, moedas — morrem ou são coletadas, e a
diferença de 1 ULP sai do mundo junto com elas. Medido na primeira seed: Chromium divergia em 5 de
50 checkpoints (ticks 180 a 1380), Firefox e WebKit em 3 de 50 (ticks 180 a 1140). Depois disso o
estado **reconvergia** com o Node, e o hash do tick 3000 batia nos quatro motores.

Isso é exatamente o risco que a pesquisa registrou no Pitfall 2 ("o hash convergido por acaso bateu
com o baseline do Node... **não conte com isso**"), só que aqui ele apareceu como um portão que
parecia funcionar e não funcionava.

**A correção**, e por que ela custou uma troca de hash:

1. Varri **3.000 seeds** de roteiro em Node, medindo fase final e trecho vivo de cada uma.
2. Peguei as **90 de maior trecho vivo** e rodei todas as 90 nos três navegadores, comparando o hash
   do tick 3000 contra o do Node.
3. **Cinco seeds** mantêm a divergência viva até o tick 3000 nos três motores. Adotei a de maior
   trecho vivo: `0x0d6b0975`, 1800 ticks vivos.

Com ela o portão ficou **6 de 6 vermelho**, e a divergência agora vai do tick 960 até o 3000 sem
sarar. A justificativa está escrita no `LOG_SEED` do `rebaseline.mjs` para que ninguém "limpe" a
constante achando que é arbitrária.

**Consequência de design, registrada:** neste jogo o hash terminal **não é** detector suficiente de
divergência entre motores. A trajetória é. O plano tratava os checkpoints como diagnóstico
secundário ("para dizer em qual tick começou"); a medição mostra que eles são a asserção que
sustenta o portão. O comentário no `tests/cross-engine.test.ts` diz isso, para que ninguém apague o
teste de checkpoints achando que é redundante.

## A segunda descoberta: o muro de fase, e por que 3000 ticks não são 3000 ticks

`step()` retorna logo depois de `world.tick++` quando `world.phase !== 'playing'`. Toda fase que não
seja `playing` é, portanto, **estado absorvente** para um driver de ticks puro.

Medido em 400 seeds: **nenhuma** ficou `playing` por 3000 ticks. A run sempre limpa a onda 1
(382/400, indo para `shop`) ou morre (18/400, indo para `gameover`) antes disso. Na seed adotada o
muro é o tick **1800** — o maior trecho vivo que a varredura de 3.000 seeds encontrou. Os
1.200 ticks restantes só incrementam o contador.

Isso **não** enfraquece o portão (a divergência nasce no tick 960, dentro do trecho vivo, e
sobrevive até o fim), mas é uma propriedade real do fixture e está fixada por teste
(`LIVE_UNTIL = 1800` em `tests/golden.test.ts`): se alguém mexer no balanceamento e o muro andar, o
teste fica vermelho em vez de o fixture silenciosamente parar de exercitar o que foi gravado para
exercitar.

**Item deferido:** passar do muro exige resolver `levelup`/`shop`, o que exige **escolher um
upgrade** — política de camada `app/`, não do portão. Isso pertence ao driver de replay (fase 9) ou
ao plano 01-10. Registrado abaixo em "Deferred Items".

## Files Created/Modified

- **`src/app/stepper.ts`** — `createStepper(world)` com `advance(elapsedMs, collect, afterStep?)` e
  `runTicks(n, collect)`; `MAX_CATCHUP_MS = DT_MS * 5`. Aritmética movida sem reescrita. O módulo
  não contém `performance`, `Date`, `requestAnimationFrame` nem `setTimeout` — asserido no próprio
  fonte pelo teste, não só por grep
- **`src/app/loop.ts`** — reduzido a relógio + `rAF` + flag de `running`. `startLoop(world, hooks)`
  intacto (`main.ts:99-105` depende dele). Os hooks entram embrulhados em arrow para não perderem o
  `this`
- **`tests/stepper.test.ts`** — 9 testes cobrindo os sete comportamentos, mais a delegação do
  `loop.ts`
- **`tests/inputLog.ts`** — `AIM_STEP`, `decodeInputLog`, tipos `InputRecord`/`GoldenSlot`/
  `GoldenFixture`. Valida faixa e integralidade de cada registro; `aim` lido como **int16**
- **`tests/golden/campaign-mage-3000.json`** — `config` (seed 20260827, campaign, mage, GOLD),
  slot único `p0`, `ticks: 3000`, `maxTicks: 648000`, 765 registros esparsos, `hash`, 50 checkpoints
- **`tests/golden.test.ts`** — perna Node (8 testes) e emissor sob `VITE_GOLDEN_EMIT`
- **`tests/cross-engine.test.ts`** — o portão FORM-04
- **`tools/golden/rebaseline.mjs`** — segue `tools/README.md`; exige `--confirm`, só Node
- **`package.json`** — script `golden:rebaseline`
- **`.gitignore`** — `tests/__screenshots__/` e `.vitest-attachments/`

## Decisões e detalhes que surpreendem

**`DT_MS * 3` executa 2 ticks, não 3.** O plano listava como comportamento esperado que
`advance(DT_MS * 3)` rodasse 3 ticks com alpha 0. **Isso é falso em IEEE-754** e o teste diz a
verdade em vez da frase. `DT_MS` é `16.666666666666668`, o double logo *acima* de 50/3; o produto
por 3 dá `50.0000000000000035`, exatamente meio ulp de 50, e o desempate para par arredonda para
**50 exato** — 3,55e-15 *abaixo* de três fatias. O terceiro tick corretamente não dispara. Cobri o
comportamento pretendido com `DT_MS * 2` (2 ticks, alpha 0, exato) e documentei o caso de 3 num
teste próprio. **Não** "consertei" o acumulador: mudar a aritmética alteraria o ritmo de render do
jogo por um motivo que não é um bug.

**`--disableConsoleIntercept` é obrigatório no re-baseline.** O reporter padrão do Vitest 4 engole
`console.log` de teste que passa, então sem essa flag a linha `GOLDEN_HASH=` nunca chega ao script.
Descoberto por sonda antes de projetar em cima da suposição.

**O ouro não precisou de `resolveJsonModule`.** `moduleResolution: "bundler"` já resolve o import de
JSON; `npx tsc --noEmit` sai 0 sem tocar no `tsconfig.json`.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 — Bug no portão] O hash final não detectava a divergência**

- **Found during:** Task 3
- **Issue:** Com a seed original, o teste de hash final passava nos três navegadores porque a
  divergência sarava antes do tick 3000. Metade do portão estava verde sem valer nada.
- **Fix:** Varredura de 3.000 seeds em Node + 90 candidatas nos três navegadores; adotada
  `0x0d6b0975`, cuja divergência sobrevive ao tick 3000 nos três motores.
- **Files modified:** `tools/golden/rebaseline.mjs`, `tests/golden/campaign-mage-3000.json`,
  `tests/golden.test.ts`
- **Commit:** `01ca392`

**2. [Rule 2 — Correção de especificação] `DT_MS * 3` não são três ticks**

- **Found during:** Task 1
- **Issue:** O `<behavior>` do plano afirma que `advance(DT_MS * 3)` executa 3 ticks e devolve alpha
  0. Medido: executa 2, com alpha `0.9999999999999996`.
- **Fix:** O comportamento "vários ticks numa chamada, alpha 0" ficou coberto por `DT_MS * 2`
  (exato), e o caso de 3 ganhou teste próprio afirmando a verdade, com a explicação do arredondamento.
- **Commit:** `03f926c` / `2e27182`

**3. [Rule 2 — Artefato gerado] Screenshots do modo navegador ficavam sem rastreio**

- **Found during:** Task 3
- **Issue:** O portão é vermelho por design, então `tests/__screenshots__/` e `.vitest-attachments/`
  são regerados a cada execução.
- **Fix:** Acrescentados ao `.gitignore` com o motivo escrito.
- **Commit:** `ff3a0ec`

**4. [Rule 2 — Emissão de checkpoints] O emissor precisou de uma segunda linha**

- **Found during:** Task 2
- **Issue:** O plano especifica só `GOLDEN_HASH=`, mas a Task 3 exige que os `checkpoints` entrem no
  ouro "pelo mesmo caminho auditável".
- **Fix:** O emissor imprime também `GOLDEN_CHECKPOINTS=`. O `stdout` de sucesso do script
  continua sendo **uma** linha, como manda o `tools/README.md`.
- **Commit:** `9db5552`

**Total:** 4 auto-fixed (1 × Rule 1, 3 × Rule 2). Nenhuma mudança arquitetural; nenhum
checkpoint humano necessário.

## Deferred Items

1. **Driver de replay que atravessa `levelup`/`shop`.** Exige política de escolha de upgrade
   (camada `app/`). Sem ele, todo fixture longo bate num estado absorvente. Dono natural: o worker
   de replay da fase 9, ou o plano 01-10 ao definir o envelope de replay.
2. **`tests/inputLog.ts` é lar provisório.** O plano 01-10 promove o codec para
   `packages/protocol/src/inputCodec.ts`. O cabeçalho do arquivo diz isso.
3. **O `continue-on-error` do passo `test:browser` no `ci.yml`** continua necessário e continua
   apontando o plano 01-12 — este plano confirma que o portão é vermelho, então a marcação está
   correta hoje.

## Known Stubs

Nenhum. Nada aqui renderiza dado vazio nem tem fonte de dados por ligar. O único item
deliberadamente incompleto é o portão cross-engine, que é vermelho **por especificação** e cujo
fechamento é critério de aceitação do plano 01-12.

## Nota sobre FORM-04

**FORM-04 continua `Pending` no `REQUIREMENTS.md`, de propósito.** O texto do requisito é "a mesma
run produz resultado bit-idêntico no navegador e no Node, com trigonometria própria em
`sim/math.ts`" — e hoje ela **não** produz: é o que este plano acabou de medir. O que existe agora
é o *portão* que verifica FORM-04. Quem fecha o requisito é o plano 01-12, e o teste que prova o
fechamento já está escrito e rodando.

(O SUMMARY do plano 01-01 lista `requirements-completed: [FORM-04]`; pela leitura do texto do
requisito isso foi adiantado — o 01-01 entregou a infraestrutura do portão, não o resultado
bit-idêntico. Deixo registrado sem alterar o documento daquele plano.)

## Threat Flags

Nenhuma superfície nova de rede, autenticação, acesso a arquivo ou esquema em fronteira de
confiança. As duas mitigações do registro do plano foram implementadas:

- **T-1-03** (teto de ticks): `maxTicks: 648000` está no fixture desde o primeiro commit dele, e
  `runTicks` recebe contagem explícita em vez de laçar até o fim do log. Asserido por teste.
- **T-1-01** (hash-ouro alterado sem auditoria): `rebaseline.mjs` exige `--confirm`, roda só em
  Node, imprime o diff de hashes, e a regra "um commit que muda um hash não muda mais nada" está
  escrita no topo do arquivo — e foi seguida nesta própria execução (`01ca392` muda o hash e mais
  nada além do que o define).

## Next Phase Readiness

- **Plano 01-12 (trigonometria):** o portão está pronto e calibrado. Depois da troca, espere
  re-baseline pelo caminho auditável e `npm run test:browser` **verde**; aí o `continue-on-error` do
  `ci.yml` sai.
- **Plano 01-09 (`sim/math.ts`):** `createStepper(...).runTicks` é o driver headless para comparar
  antes/depois sem navegador.
- **Plano 01-10 (protocolo):** `tests/inputLog.ts` é o codec a promover; o formato do log
  (inteiros, esparso, política de buracos, `maxTicks`) já está fixado por teste, e a promoção não
  pode mudar o hash.

## Self-Check: PASSED

Os 9 arquivos declarados existem em disco e os 6 commits existem no histórico.
`.planning/STATE.md` e `.planning/ROADMAP.md` não foram tocados (`git diff --stat` vazio contra o
commit base) — a orquestração é dona dessas escritas.

---
*Phase: 01-formato-e-costuras*
*Completed: 2026-08-31*
