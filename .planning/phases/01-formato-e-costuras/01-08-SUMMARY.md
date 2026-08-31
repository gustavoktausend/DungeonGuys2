---
phase: 01-formato-e-costuras
plan: 08
subsystem: testing
tags: [tarjan, scc, module-cycle, determinism, boss-pattern, vitest, import-graph]

# Dependency graph
requires:
  - phase: 01-05
    provides: "packages/sim como pacote @dg2/sim, com o barrel src/index.ts e os 25 módulos movidos verbatim"
provides:
  - "packages/sim/src/levelup.ts — pickBlessing e closeLevelUp fora do componente fortemente conexo"
  - "tests/scc.test.ts — Tarjan sobre o grafo de imports de valor, com teto de 5 asserido a cada rodada"
  - "tests/boss.test.ts — 11 casos diretos de updateBossPattern, incluindo o ramo `ring` que nunca havia executado"
  - "Prova empírica de que o corte foi estrutural: hash-ouro d3a93053 e md5 do fixture inalterados"
affects: [01-09, 01-12, phase-03-netcode]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Meta-teste que calcula uma propriedade do grafo de módulos em vez de confiar em revisão de diff"
    - "Corte de ciclo por extração de arquivo, não por adiamento de resolução, para preservar world.tick"
    - "Sabotagem controlada como prova de que um meta-teste é capaz de falhar"

key-files:
  created:
    - packages/sim/src/levelup.ts
    - tests/scc.test.ts
  modified:
    - packages/sim/src/xp.ts
    - packages/sim/src/index.ts
    - tests/purity.test.ts
    - tests/boss.test.ts

key-decisions:
  - "As duas arestas de closeLevelUp (victory e openShop) saíram juntas por extração de arquivo; adiar a resolução para step() mudaria world.tick e não seria neutro"
  - "tests/scc.test.ts mede imports de VALOR: import type é erasado pelo compilador e não cria aresta em tempo de execução"
  - "run <-> shop fica como dívida registrada e asserida, não como falha"
  - "As asserções do ramo ring são sobre a contagem de projéteis (12/16), nunca sobre vx/vy, porque os valores mudam de propósito quando a trigonometria trocar"
  - "FORM-04 NÃO foi marcado completo: o portão cross-engine segue vermelho por design até o plano 01-12"

patterns-established:
  - "Teto de ciclo como número calculado: baixar quando um corte merecer, nunca subir para um diff passar"
  - "Comentários são removidos antes de varrer imports, porque o cabeçalho de xp.ts narra as arestas que o teste assere terem sumido"

requirements-completed: []

# Metrics
duration: 15min
completed: 2026-08-31
---

# Phase 1 Plan 08: Preparação do sim/ para a troca de trigonometria — Summary

**O componente fortemente conexo de `packages/sim` caiu de 8 para 5 módulos por extração de `levelup.ts`, com o tamanho do ciclo virando número calculado por Tarjan a cada rodada, e o ramo `ring` de `updateBossPattern` ganhou cobertura direta pela primeira vez — tudo com o hash-ouro `d3a93053` intacto, que é a prova de que o corte foi estrutural.**

## Performance

- **Duration:** ~15 min
- **Started:** 2026-08-31T11:51Z
- **Completed:** 2026-08-31T12:06Z
- **Tasks:** 3
- **Files modified:** 6 (2 criados, 4 modificados)
- **Suíte:** 289 → 305 testes (25 → 26 arquivos), nenhum teste perdido

## Accomplishments

- **O corte do ciclo, feito pelo diagnóstico certo.** `docs/BACKLOG.md` e o roadmap diziam que bastava cortar `xp → run`. A pesquisa já havia mostrado que isso é falso, e este plano confirmou por execução: cortar uma aresta só deixa os mesmos 8 módulos, porque `xp → shop → run → enemies → xp` fecha o ciclo sozinho. As duas saídas de `closeLevelUp` saíram juntas para `levelup.ts`, e o resultado medido é exatamente **5 + 2**.
- **O tamanho do ciclo deixou de ser prosa.** `tests/scc.test.ts` monta o grafo e roda Tarjan a cada `npx vitest run`. A fase 03 vai acrescentar arestas; a regressão agora tem quem a pegue.
- **O ramo `ring` executou em teste pela primeira vez.** 15 linhas que empurram 12 ou 16 projéteis com `Math.cos`/`Math.sin` e que, até aqui, nenhum teste tocava — justamente uma das superfícies que o `sim/math.ts` vai perturbar.
- **A neutralidade do corte está provada, não afirmada.** A região movida tem md5 idêntico ao original (`5cbfec97c379434244dc75007dba1b1f`), o hash-ouro segue `d3a93053` e o fixture segue `2a210c4eeadc15f06f896655eb30ef5b`.

## Task Commits

1. **Task 1: Cortar as duas arestas separando `levelup.ts` de `xp.ts`** — `7d9580b` (refactor)
2. **Task 2: `tests/scc.test.ts` — o teto do ciclo virou asserção** — `3f5456c` (test)
3. **Task 3: Cobertura direta de `updateBossPattern`** — `5d21b9a` (test)

## Files Created/Modified

- `packages/sim/src/levelup.ts` **(novo)** — `pickBlessing` e `closeLevelUp`, movidos corpo por corpo. Nó com arestas só de saída: leva `./run` e `./shop` para fora do componente.
- `packages/sim/src/xp.ts` — perdeu os dois imports e as duas funções; fica com `gainXp`, `maybeOpenLevelUp` e `rollLevelChoices`. Cabeçalho ganhou a seção `CYCLE CUT` registrando o corte, por que as duas arestas tinham de sair juntas, e por que foi extração de arquivo e não adiamento para `step()`.
- `packages/sim/src/index.ts` — `export * from './levelup'` em ordem alfabética. Superfície pública só cresceu; nada foi reestruturado nem estreitado (o plano 01-07 usa este arquivo como entry do build de lib).
- `tests/purity.test.ts` — contagem exata de arquivos de 25 para 26.
- `tests/scc.test.ts` **(novo)** — Tarjan sobre imports de valor; 5 testes.
- `tests/boss.test.ts` — 11 casos diretos novos; os 2 de integração via `updateEnemies` ficaram.

## Decisions Made

**Extração de arquivo em vez de adiar a resolução para `step()`.** Adiar mudaria o valor de `world.tick` no instante em que `openShop` roda, arriscando deslocar um tick entre a escolha da bênção e a abertura da loja. A extração é idêntica por construção — mesmas chamadas, mesma ordem, mesmo tick, mesma sequência de consumo de `world.rng` — e o hash-ouro é a testemunha.

**O SCC é medido sobre imports de valor.** `import type` é erasado pelo compilador: não cria aresta em tempo de execução, não pode produzir binding `undefined`, e contá-lo inflaria o componente com arestas que não existem no bundle emitido. O `LAYER_IMPORT` de `purity.test.ts` casa tipo e valor — correto para a pergunta dele, errado para esta. O filtro está documentado em inglês dentro do arquivo, no ponto exato onde o teste deixaria de medir o que promete.

**Comentários são removidos antes de varrer imports.** Não é cosmético: o cabeçalho novo de `xp.ts` narra as arestas que o teste assere terem sumido ("used to import `victory` from ./run"). Um scanner que lesse comentários ressuscitaria o ciclo que ele existe para policiar.

**Asserções de `ring` sobre contagem, nunca sobre `vx`/`vy`.** 12 e 16 sobrevivem à troca de trigonometria; os valores mudam de propósito. É o que torna esta cobertura útil como linha de base para o plano 01-12.

**`run ↔ shop` fica.** É ciclo genuíno e independente (`shop.ts:57` e `run.ts:288`), não cai com o corte em `xp.ts`, e quebrá-lo está fora do escopo desta fase. Está asserido como esperado, com comentário apontando o `docs/BACKLOG.md` — dívida registrada, não falha.

## Verificação de que os testes novos mordem

Dois testes de mutação, ambos revertidos em seguida; nenhum entrou em commit.

**Sabotagem do SCC** (exigida pelo plano). Acrescentando `import { victory } from './run';` mais um uso de valor a `xp.ts`, `tests/scc.test.ts` falhou em 3 dos 5 casos, com a mensagem:

> `o maior ciclo tem 8 módulos (teto 5): boss, combat, enemies, player, run, shop, special, xp`

Os 8 membros são exatamente o baseline da pesquisa — o teste reproduz o componente original quando a aresta volta, e nomeia os infratores. Revertido com `git checkout -- packages/sim/src/xp.ts`.

**Mutação do ramo `ring`.** Trocando `e.enraged ? 16 : 12` por `? 15 : 11` em `boss.ts`, os dois testes de `ring` falharam (`expected 11 to have a length of 12`, `expected 15 to have a length of 16`), provando que o ramo realmente executa e não passa por vacuidade. Revertido com `git checkout -- packages/sim/src/boss.ts`; `git diff --stat packages/sim/src/boss.ts` está vazio.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] `EXPECTED_FILE_COUNT` já estava em 25, não em 24**

- **Found during:** Task 1
- **Issue:** O plano manda atualizar a contagem exata de `tests/purity.test.ts` "de 24 para 25". O plano foi escrito contra o estado anterior ao 01-05; na base real o valor já era **25** (24 módulos movidos + o barrel). Aplicar a instrução literal deixaria a contagem defasada em um e o teste vermelho assim que `levelup.ts` entrasse.
- **Fix:** Atualizado de **25 para 26**, com o comentário do bloco reescrito para explicitar a aritmética (24 movidos + `index.ts` + `levelup.ts`).
- **Files modified:** `tests/purity.test.ts`
- **Verification:** `npx vitest run tests/purity.test.ts` passa; a suíte inteira segue verde.
- **Committed in:** `7d9580b`

**2. [Rule 3 - Blocking] `npm ci` necessário na worktree**

- **Found during:** Setup
- **Issue:** A worktree nasceu sem `node_modules`.
- **Fix:** `npm ci` (nunca `npm install`, por causa da fronteira de wave com o plano 01-06, que é o dono do `package-lock.json`).
- **Verification:** `git status --short` vazio logo após — o lockfile não foi reescrito. `0 vulnerabilities`.
- **Committed in:** nada a commitar.

### Critérios de aceitação ajustados (3 greps literais)

Três critérios do plano pedem `grep -c ... == 0` sobre termos que as **próprias instruções do plano** mandam escrever em comentário. Onde o conflito era resolvível sem perda, reescrevi o comentário; onde o comentário é a documentação pedida, mantive e registro aqui.

1. **`grep -c "closeLevelUp\|pickBlessing" packages/sim/src/xp.ts` retorna 2, não 0.** As duas ocorrências são de comentário: o cabeçalho aponta para onde as funções foram, e a seção `CYCLE CUT` — que o plano manda escrever — cita `closeLevelUp` pelo nome. **Zero referências de código**, que é a intenção do critério ("as duas funções saíram inteiras"): `grep` filtrando linhas de comentário não retorna nada, e `npm run typecheck:sim` passa sem os imports.
2. **`grep -c "node:fs" tests/scc.test.ts`** — era 1 por um comentário dizendo que `node:fs` **não** é usado (mesma frase que existe em `purity.test.ts`). Reescrito para "rather than a filesystem read". Agora **0**.
3. **`grep -c "toBeCloseTo" tests/boss.test.ts`** — era 1 por um comentário explicando que asserção aproximada é proibida nesta fase. Reescrito para "Nenhuma asserção aproximada aqui, por regra da fase". Agora **0**.

### Diferença factual encontrada contra a especificação do caso `charging` na parede

O plano descreve o caso como "`stateT` vira 0, saem eventos `shake` e `explosion`, e o clamp é aplicado". `stateT = 0` é estado **intermediário**: `boss.ts:96` roda no mesmo tick e converte `stateT <= 0` em `bossState = 'recover'` com `stateT = 450`. Conforme a instrução explícita do plano ("se algum dos dez casos falhar contra o código de hoje, corrigir a expectativa do teste depois de ler o código, não corrigir o código"), o teste assere o estado final observável — `recover` / `450` — mais o clamp e os dois eventos, com comentário explicando a sequência. `boss.ts` não foi tocado.

---

**Total deviations:** 2 auto-fixed (2 blocking) + 3 critérios de grep ajustados + 1 expectativa de teste corrigida contra o código real.
**Impact on plan:** Nenhum desvio de escopo. Nenhuma linha de simulação alterada além da movimentação literal da Task 1.

## Issues Encountered

**Nenhum bloqueador.** Dois pontos de atrito operacional, ambos contornados:

- O guard de isolamento da worktree recusa comandos Bash compostos, o que inclui `git commit -m` com mensagem multi-linha. As três mensagens foram escritas em arquivo temporário e aplicadas com `git commit -F`, com o arquivo removido em seguida.
- O plano cita caminhos `src/sim/*`, que não existem mais desde o 01-05. Traduzidos para `packages/sim/src/*` na leitura.

## Fronteiras de wave respeitadas

`git diff --name-only` contra a base lista **exatamente** os 6 arquivos do `files_modified` do plano:

```
packages/sim/src/index.ts
packages/sim/src/levelup.ts
packages/sim/src/xp.ts
tests/boss.test.ts
tests/purity.test.ts
tests/scc.test.ts
```

`package-lock.json`, `package.json` (raiz), `tsconfig.json` (raiz), `.github/workflows/ci.yml` e `packages/sim/vite.config.ts` **não foram tocados** — território dos planos 01-06 e 01-07. O barrel `packages/sim/src/index.ts` só **ganhou** uma linha de export; nada foi reestruturado nem estreitado, para não quebrar o build de lib que o 01-07 está configurando em paralelo.

## Estado dos portões

| Portão | Resultado |
|---|---|
| `npx vitest run` | **305 passed (26 arquivos)** — 289 da base + 16 novos, nenhum perdido |
| `npx vitest run tests/golden.test.ts` | **8 passed**, hash `d3a93053` |
| `git diff --quiet tests/golden/` | **exit 0** — fixture md5 `2a210c4eeadc15f06f896655eb30ef5b` |
| `npm run lint` | **exit 0** |
| `npm run typecheck:sim` | **exit 0** |
| `npm run build` | **exit 0** |
| `npm run test:browser` | **6 failed (6)** — vermelho por design, idêntico à base |

Sobre o portão cross-engine: segue vermelho pelo mesmo motivo de antes — divergência de trigonometria entre motores, que o plano 01-12 resolve. Confirmei que a falha continua sendo a asserção de hash (`expected "d3a93053", received "fa099f16"` no WebKit) e **não** um erro de resolução de módulo, o que seria o sintoma de a edição do barrel ter quebrado algo. Nem consertei, nem afrouxei, nem re-baselinei.

## Sobre FORM-04

**Deliberadamente não marcado como completo.** `FORM-04` ("a mesma run produz resultado bit-idêntico no navegador e no Node") é compartilhado pelos planos 01-01, 01-04, 01-05, 01-08, 01-09 e 01-12, e só é satisfeito quando a trigonometria vendorizada entrar. O portão `test:browser` vermelho é a prova literal de que o requisito ainda não está cumprido. `.planning/REQUIREMENTS.md` não foi tocado; marcar agora seria registrar como verdadeiro algo que a suíte contradiz.

## Next Phase Readiness

**Pronto para o `sim/math.ts` (planos 01-09 e 01-12).** As duas precondições que este plano existia para entregar estão de pé:

- O ciclo cabe em 5 módulos, então uma `const` avaliada em tempo de módulo — a forma de uma tabela de lookup trigonométrica — não vira `undefined` em silêncio ao atravessar o componente. E o teto é verificado a cada rodada, não uma vez.
- `updateBossPattern` tem linha de base direta, incluindo `ring`. Quando o hash-ouro mudar no 01-12, a mudança poderá ser atribuída à troca de trigonometria em vez de a uma regressão — que é exatamente a ambiguidade que este plano eliminou.

**Herança para quem for cortar mais ciclo:** `run ↔ shop` continua lá, com o par asserido em `tests/scc.test.ts` e a técnica de corte já demonstrada. Quando alguém for fazê-lo, é baixar `MAX_SCC` e atualizar `EXPECTED_CYCLES` — o teste diz na hora se o corte funcionou.

---
*Phase: 01-formato-e-costuras*
*Completed: 2026-08-31*
