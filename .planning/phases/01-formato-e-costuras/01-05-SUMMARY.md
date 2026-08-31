---
phase: 01-formato-e-costuras
plan: 05
subsystem: packaging
tags: [npm-workspaces, monorepo, barrel, purity, sim-version, eslint, tsconfig, form-04]

# Dependency graph
requires:
  - "01-01: vitest.config.ts, vitest.browser.config.ts, .github/workflows/ci.yml, toolchain TS 6.0.3"
  - "01-04: tests/golden/campaign-mage-3000.json — o hash-ouro que serve de prova de que a extração foi mecânica"
provides:
  - "`packages/sim`: a simulação como pacote npm com artefato de build próprio, que é o que D-07 exige para o `SIM_VERSION`"
  - "`@dg2/sim`: superfície pública única (barrel), sem subcaminhos — uma entrada, um bundle, um hash"
  - "`packages/sim/tsconfig.json`: a terceira guarda de pureza (lib ES2022 sem biblioteca de navegador, `types: []`)"
  - "`npm run typecheck:sim`: a guarda do compilador virou comando, e entrou no CI"
  - "`tests/purity.test.ts`: contagem exata de arquivos + asserção de `dependencies: {}`"
  - "npm workspaces ligado (`workspaces: [\"packages/*\"]`) — o caminho por onde `packages/protocol` entra no plano 01-10"
affects: [01-06, 01-07, 01-09-sim-math, 01-10-protocolo, 01-12-trigonometria, 01-14-serialize]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Um pacote, uma entrada: `exports` só com `\".\"`, para que a fronteira do hash coincida com a fronteira do pacote"
    - "Três guardas independentes para a mesma invariante — lint, compilador e teste — cada uma cobrindo o que as outras estruturalmente não veem"
    - "Contagem exata de arquivos em meta-teste de extração; limite inferior não detecta arquivo esquecido"
    - "`paths` sem `baseUrl` — a forma que sobrevive ao TS 6/7"
    - "Prova de movimentação mecânica: `git diff -M --stat` com `| 0` em todos os arquivos movidos"

key-files:
  created:
    - packages/sim/package.json
    - packages/sim/tsconfig.json
    - packages/sim/src/index.ts
  modified:
    - package.json
    - package-lock.json
    - tsconfig.json
    - eslint.config.js
    - tests/purity.test.ts
    - .github/workflows/ci.yml
    - "42 arquivos de src/app, src/render, src/ui, src/main.ts e tests/ (só o especificador)"
  moved:
    - "24 arquivos de src/sim/** para packages/sim/src/** (git mv, zero linhas editadas)"

key-decisions:
  - "`baseUrl` foi removido do plano: o TS 6.0.3 o rejeita com TS5101 (erro, não aviso) e ele some no TS 7. `paths` sozinho resolve, com os caminhos relativos ao tsconfig"
  - "A mudança do `import.meta.glob` de `tests/purity.test.ts` foi antecipada da Task 3 para a Task 2, porque sem ela a suíte da Task 2 não fecha verde — e a suíte verde É o critério da Task 2"
  - "`resolve.alias` NÃO foi necessário em nenhum dos três configs: o symlink de workspace resolve `@dg2/sim` no Vite, no Vitest de Node e no Vitest de navegador"
  - "A contagem exata de `purity.test.ts` é 25, não 24: os 24 módulos movidos mais o `index.ts`, que também é código do pacote e também precisa ser puro"
  - "`import * as eq from '@dg2/sim'` em dois testes de equipamento — o namespace ficou mais largo do que era, mas todos os usos são `eq.X` e não há colisão de nome no barrel"
  - "FORM-04 continua Pending, pelo mesmo motivo do plano 01-04: o requisito é resultado bit-idêntico, e ele chega no 01-12"

patterns-established:
  - "Cabeçalho do barrel declara que acrescentar um módulo ali muda o `SIM_VERSION` — o sinal é intencional, não efeito colateral"
  - "Sabotagem controlada como critério de aceitação de guarda: injetar a violação, ver as três falharem, reverter"

requirements-completed: []

# Metrics
duration: ~15min
completed: 2026-08-31
---

# Phase 01 Plan 05: Extração de `packages/sim` Summary

**A simulação virou pacote npm com superfície pública única, e o hash-ouro do plano 01-04 saiu do
outro lado sem mudar um dígito — que é a prova de que os 24 arquivos foram movidos e não editados.**

## Performance

- **Duration:** ~15 min
- **Started:** 2026-08-31T14:31Z
- **Completed:** 2026-08-31T14:46Z
- **Tasks:** 3 de 3
- **Files:** 74 (3 criados, 24 movidos, 47 modificados)

## A dupla prova de que a extração foi mecânica

Esta é a única coisa que este plano tinha de provar, e ela é verificável por dois caminhos
independentes:

**1. O hash-ouro não mudou.** `tests/golden/campaign-mage-3000.json` tem o mesmo md5 antes e depois
(`2a210c4eeadc15f06f896655eb30ef5b`), e `git diff --quiet tests/golden/` sai 0. O
`tests/golden.test.ts` roda a run de 3000 ticks e continua batendo em `d3a93053`.

**2. O git diz que os arquivos não mudaram.** `git diff -M --stat` da base até o HEAD mostra os 24
arquivos movidos com **`| 0`** — zero linhas alteradas em cada um:

```
{src/sim => packages/sim/src}/arena.ts             |  0
{src/sim => packages/sim/src}/boss.ts              |  0
...                                                    (24 arquivos, todos 0)
packages/sim/src/index.ts                          | 40 ++++++++++++++++++++++
```

O `git mv` preservou o histórico e o commit da Task 1 registrou os 24 como `rename ... (100%)`.

## Inventário de portões: o que está verde e o que está vermelho

| Script | Estado | Observação |
|---|---|---|
| `npm test` | **VERDE** — 289 passed (25 files) | 288 da base + 1 novo (`dependencies` vazio), exigido pela Task 3 |
| `npx tsc --noEmit` | **VERDE** — exit 0 | |
| `npm run typecheck:sim` | **VERDE** — exit 0 | script novo deste plano |
| `npm run lint` | **VERDE** — exit 0 | |
| `npm run build` | **VERDE** — exit 0 | 51 módulos |
| `npm run test:browser` | **VERMELHO POR DESIGN** — 6 failed (6) | inalterado; ver abaixo |

### O vermelho intencional continua vermelho pelo mesmo motivo

Conferido nos três motores, com o texto idêntico ao que o plano 01-04 registrou:

```
Expected: "d3a93053"
Received: "fa099f16"

Expected: "nenhuma divergência"
Received: "23/50 checkpoints divergem; primeiro no tick 960 (ouro e0db14a, este motor cc71d284); último no tick 3000"
```

Chromium `23/50`, Firefox e WebKit `24/50` — os mesmos números de antes, o mesmo tick de origem
(960), os mesmos hashes. Isso importa por um motivo específico: o risco real desta extração era o
portão quebrar por **falha de resolução de módulo** e o vermelho continuar vermelho por um motivo
diferente, o que pareceria sucesso e não seria. Os valores idênticos provam que o teste ainda
resolve, ainda roda e ainda compara o ouro.

## A contagem de testes: 288 → 289, e por que isso não é regressão

A instrução de execução pede "mesma contagem, isto é um move, não uma feature". A contagem final é
**289**, e a diferença é uma única asserção que a **Task 3 do plano manda criar**: o teste que lê
`packages/sim/package.json` e assere `dependencies: {}` (mitigação de T-1-05 do registro de ameaças).
Nenhum teste foi perdido — 25 arquivos antes, 25 depois, e os 288 originais continuam lá.

## Task Commits

1. **Task 1** — `fa3814b` `refactor(01-05)`: pacote criado, 24 arquivos movidos, workspaces ligado
2. **Task 2** — `1207abf` `refactor(01-05)`: 42 arquivos religados a `@dg2/sim`
3. **Task 3** — `b40097c` `feat(01-05)`: as três guardas de pureza apertadas
4. **Correção de auditabilidade** — `2738d7a` `docs(01-05)`: comentário do barrel

## A sabotagem controlada, feita e revertida

A Task 3 exige provar que as três guardas são independentes e que **todas** pegam a mesma violação.
Acrescentei `const x = window;` ao fim de `packages/sim/src/constants.ts` e rodei as três:

| Guarda | Comando | O que disse |
|---|---|---|
| **Lint** | `npm run lint` | `66:11 error Unexpected use of 'window'. sim/ is pure — see plan T1-T6 no-restricted-globals` |
| **Compilador** | `npm run typecheck:sim` | `constants.ts(66,11): error TS2304: Cannot find name 'window'.` |
| **Teste** | `npx vitest run tests/purity.test.ts` | `+ "../packages/sim/src/constants.ts: window"` |

O `TS2304` é a evidência que interessa: ele só existe porque `packages/sim/tsconfig.json` não tem
biblioteca de navegador no `lib` — no `tsconfig.json` da raiz, que tem `DOM`, a mesma linha
compilaria. A guarda nova é real, não decorativa.

Revertido com `git checkout -- packages/sim/src/constants.ts`; `git status --short -- packages` saiu
vazio e as três voltaram ao verde antes do commit da Task 3.

## Files Created/Modified

- **`packages/sim/package.json`** — `@dg2/sim`, privado, `type: module`, `dependencies: {}`, e
  `main`/`types`/`exports["."]` todos em `./src/index.ts`. Uma entrada só
- **`packages/sim/tsconfig.json`** — `lib: ["ES2022"]` e `types: []`. O comentário no arquivo
  explica que essa é a terceira guarda e por que ela não é redundante
- **`packages/sim/src/index.ts`** — barrel com 24 `export *` em ordem alfabética. O cabeçalho diz
  que este arquivo é ao mesmo tempo a superfície pública e o entry do bundle, e que acrescentar um
  módulo aqui muda o `SIM_VERSION`
- **`tsconfig.json`** (raiz) — `packages` no `include` e `paths` para `@dg2/sim`. `types:
  ["vite/client"]` intocado
- **`package.json`** (raiz) — `workspaces`, script `typecheck:sim`, `dependencies: {}` preservado
- **`eslint.config.js`** — o glob do bloco de pureza seguiu o código; as regras não foram
  redesenhadas (trigonometria é do plano 01-12)
- **`tests/purity.test.ts`** — glob novo, contagem exata (25), teste de `dependencies`, cabeçalho
  reescrito para descrever as três guardas em vez de duas
- **`.github/workflows/ci.yml`** — `npm run typecheck:sim` logo depois de `npm run lint`
- **42 arquivos** de `src/app`, `src/render`, `src/ui`, `src/main.ts` e `tests/` — só especificador

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 — Bloqueio] `baseUrl` é erro no TypeScript 6.0.3, não aviso**

- **Found during:** Task 1
- **Issue:** O plano prescreve `"baseUrl": "."` junto com `paths`. O TS 6.0.3 responde
  `tsconfig.json(15,5): error TS5101: Option 'baseUrl' is deprecated and will stop functioning in
  TypeScript 7.0`, e aborta antes de checar qualquer arquivo. O `CLAUDE.md` já registra TS 7 como
  destino bloqueado só pelo `typescript-eslint`, então adicionar hoje uma opção que morre no TS 7
  seria dívida nascida vencida.
- **Fix:** `baseUrl` removido. Desde o TS 4.1, `paths` funciona sozinho e os caminhos são resolvidos
  relativos ao próprio `tsconfig.json`. Comentário no arquivo explicando.
- **Files modified:** `tsconfig.json`
- **Commit:** `fa3814b`

**2. [Rule 3 — Bloqueio] O `import.meta.glob` de `purity.test.ts` teve de mudar na Task 2**

- **Found during:** Task 2
- **Issue:** O plano coloca a troca do glob (`../src/sim/**` → `../packages/sim/src/**`) na Task 3,
  mas o critério de aceitação da Task 2 é a suíte verde. Com o glob antigo o `FILES` fica vazio e
  `purity.test.ts` falha — a Task 2 não poderia fechar.
- **Fix:** Só a **string do caminho** foi antecipada para a Task 2, que é exatamente a categoria de
  mudança daquele commit (troca de especificador). As duas mudanças substantivas — contagem exata e
  teste de `dependencies` — ficaram na Task 3, como planejado.
- **Files modified:** `tests/purity.test.ts`
- **Commit:** `1207abf`

**3. [Rule 2 — Auditabilidade] O comentário do barrel citava um subcaminho literal**

- **Found during:** verificação final
- **Issue:** O cabeçalho do `index.ts` explicava que subcaminhos não existem escrevendo o literal
  `@dg2/sim/math`. O critério de aceitação da Task 1 é `grep -rn "@dg2/sim/" packages src tests` não
  retornar nada, e a frase fazia o grep acusar exatamente o que ela nega — um falso positivo plantado
  no repositório para todo auditor futuro.
- **Fix:** Frase reescrita sem o literal; o grep agora sai 1 (sem resultados).
- **Files modified:** `packages/sim/src/index.ts`
- **Commit:** `2738d7a`

**Total:** 3 auto-fixed (2 × Rule 3, 1 × Rule 2). Nenhuma mudança arquitetural; nenhum checkpoint
humano necessário.

### Números do plano que estavam desatualizados

Não são desvios de execução, mas o plano foi escrito antes dos planos 01-03 e 01-04 mesclarem.
Registrado para quem for comparar plano e resultado:

| O plano diz | O real |
|---|---|
| "os 244 testes continuam verdes" | 288 na base, 289 no fim |
| "108 linhas de import em 36 arquivos" | 42 arquivos religados (mais os de `stepper`, `golden`, `inputLog`, `cross-engine`) |
| "o número real de arquivos do pacote (24 hoje)" | **25** — os 24 movidos mais o `index.ts` |
| "`tests/golden/inputLog.ts`" | o arquivo é `tests/inputLog.ts` |

## Descobertas que valem para os próximos planos

**O symlink de workspace bastou nos três configs.** O plano previa `resolve.alias` como correção
prescrita se Vite, Vitest de Node ou Vitest de navegador falhassem em resolver `@dg2/sim`. Nenhum
falhou — inclusive o modo navegador, que serve o módulo por HTTP. **Nenhum dos três configs foi
tocado**, o que mantém `vite.config.ts` com sete linhas e evita três lugares para manter em sincronia
quando `packages/protocol` nascer no plano 01-10.

**O bundle do app passou de 49 para 51 módulos**, e os dois a mais são explicáveis exatamente:
`index.ts` (o barrel) e `types.ts`. O `types.ts` era um módulo puramente de tipos, apagado na
transpilação; o `export * from './types'` do barrel é sintaticamente um re-export de valor, então ele
vira um módulo de runtime — vazio, porque todos os seus exports são tipos. Custo de bytes: nenhum
relevante (`dist/assets/index-*.js` em 90,51 kB / 30,67 kB gzip). Vale registrar porque **o plano
01-06/01-07 vai hashear esse bundle**: o `SIM_VERSION` inclui um módulo vazio por construção do
barrel, e isso é estável, não ruído.

**Não há colisão de nome entre os 24 módulos.** O `tsc` do pacote sai 0, e é ele quem detectaria
(TS2308) qualquer nome exportado por dois módulos. O plano previa desambiguação por re-export
nomeado; não foi preciso. Consequência: quem acrescentar um símbolo à sim precisa saber que o nome
agora é global dentro do pacote.

## Deferred Items

1. **`tests/helpers.ts` continua com `hashWorld`.** A promoção para
   `packages/sim/src/serialize.ts` é do plano 01-14, e o plano 01-05 proíbe fazer as duas coisas no
   mesmo commit — com razão: seria impossível distinguir "a extração quebrou algo" de "a promoção
   quebrou algo".
2. **`tests/inputLog.ts` continua onde está.** Promoção para `packages/protocol` no plano 01-10.
3. **`packages/protocol` não nasceu aqui**, de propósito. O `workspaces: ["packages/*"]` já está
   ligado, então ele é `mkdir` + `npm install`, sem mexer em config de raiz.
4. **`apps/web` e `apps/server` continuam não existindo** (D-15). `src/app`, `src/render`, `src/ui`,
   `index.html` e `vite.config.ts` seguem na raiz.
5. **`continue-on-error` do `test:browser` no `ci.yml`** continua necessário e continua apontando o
   plano 01-12.

## Known Stubs

Nenhum. Nada aqui renderiza dado vazio nem tem fonte de dados por ligar. Este plano não escreve
código de produto — move código existente e aperta guardas.

## Nota sobre FORM-04

**FORM-04 continua `Pending` no `REQUIREMENTS.md`, e o `REQUIREMENTS.md` não foi tocado.** O
frontmatter deste plano lista `requirements: [FORM-04]`, mas o texto do requisito é "a mesma run
produz resultado bit-idêntico no navegador e no Node, com trigonometria própria em `sim/math.ts`" —
e este plano nem produz resultado bit-idêntico (o portão cross-engine continua vermelho, medido
acima) nem cria `math.ts`. O que ele entrega é o **lugar definitivo** onde o `math.ts` vai nascer,
que é precisamente o motivo de D-17 mandar extrair o pacote antes do plano 01-12. Marcar FORM-04
aqui repetiria a antecipação que o plano 01-04 já apontou no SUMMARY do 01-01.

## Threat Flags

Nenhuma superfície nova de rede, autenticação, acesso a arquivo ou esquema em fronteira de confiança.
As duas mitigações do registro do plano foram implementadas:

- **T-1-05** (dependência de runtime entrando em `packages/sim`): `"dependencies": {}` no
  `package.json` do pacote **e** asserção em `tests/purity.test.ts`. A asserção compara com `{}` e
  não com "zero chaves", porque o npm **apaga** objetos vazios ao instalar — o modo de falha real é a
  chave sumir, não ela ganhar conteúdo. Conferido nesta execução: `dependencies: {}` sobreviveu tanto
  ao `npm ci` quanto ao `npm install` que criou o symlink, nos dois `package.json`.
- **T-1-01** (fronteira do que entra no `SIM_VERSION`): `exports` só com `"."`, sem subcaminho, e
  `grep -rn "@dg2/sim/" packages src tests` sem resultados.

## Next Phase Readiness

- **Planos 01-06/01-07 (`SIM_VERSION`):** o pacote tem entrada única e artefato próprio, que era o
  pré-requisito de D-07. Ler a nota sobre o módulo vazio de `types.ts` no bundle antes de hashear.
- **Plano 01-09 (`sim/math.ts`):** o arquivo nasce em `packages/sim/src/math.ts` e entra no barrel.
  As três guardas já cobrem o caminho novo automaticamente — mas `EXPECTED_FILE_COUNT` em
  `tests/purity.test.ts` vira **26** no mesmo commit, deliberadamente (é para isso que a contagem é
  exata).
- **Plano 01-10 (protocolo):** `workspaces: ["packages/*"]` já resolve `packages/protocol` sem tocar
  em config de raiz. Repetir aqui o par `main`/`types`/`exports` e o `dependencies` (que no protocol
  é `{ zod }`, não vazio — a asserção de `purity.test.ts` é específica de `packages/sim`).
- **Plano 01-12 (trigonometria):** o portão continua calibrado e vermelho pelos mesmos números.

## Self-Check: PASSED

- Os 3 arquivos criados existem em disco: `packages/sim/package.json`, `packages/sim/tsconfig.json`,
  `packages/sim/src/index.ts`.
- Os 4 commits existem no histórico: `fa3814b`, `1207abf`, `b40097c`, `2738d7a`.
- `.planning/STATE.md` e `.planning/ROADMAP.md` **não** foram tocados — a orquestração é dona dessas
  escritas. `.planning/REQUIREMENTS.md` também não, pelo motivo explicado na nota sobre FORM-04.
- `git status --short` vazio antes deste SUMMARY.

---
*Phase: 01-formato-e-costuras*
*Completed: 2026-08-31*
