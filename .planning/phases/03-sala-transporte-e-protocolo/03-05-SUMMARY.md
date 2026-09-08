---
phase: 03-sala-transporte-e-protocolo
plan: 05
subsystem: tooling
tags: [bench, ci-gate, snapshot, sync-04, tsx, tools-convention]

# Dependency graph
requires:
  - phase: 03-sala-transporte-e-protocolo
    plan: 02
    provides: "tests/worlds.ts (wave1FourPlayers, wave16SwarmElite, wave40Endless, expectedEnemies) e packages/protocol/src/snapshotCodec.ts (extractSnapshot, encodeSnapshot, SNAPSHOT_MAX_BYTES)"
  - phase: 01-marco-0
    provides: "tools/README.md §1-§5, o molde de tools/sim-version/emit.mjs, tests/helpers.ts (noInput) e o job `test` de .github/workflows/ci.yml"
  - phase: 02-infra-e-conta
    provides: "eslint.config.js sem `tools` no `ignores` (a mudança que o §5 do tools/README.md ainda negava) e o padrão de guarda estrutural de tests/ops-config.test.ts"
provides:
  - "npm run bench:snapshot: uma linha com os seis tamanhos e o teto, saída 0"
  - "tests/snapshot-bench.test.ts: o portão por parte, a run real e a checagem cruzada dos dois tetos"
  - "passo de CI que imprime o tamanho do snapshot no log do PR que o mudou"
  - "tools/README.md §5 corrigido e §6 novo; §3 ganha como conferir a regra de uma linha"
affects: [04-netcode, 05-co-op]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Bench e portão como metades de um controle só: o teste recusa o teto, o script torna a deriva abaixo do teto visível na revisão"
    - "Um teto só, conferido dos dois lados: em runtime pelo bench e por leitura de texto pelo teste"
    - "Medir o PICO ao longo da run, não o último frame — o último frame de uma run que termina é um mundo congelado"
    - "A limitação de um fixture vira asserção no próprio teste, para que ela fique falsa em voz alta quando deixar de valer"
    - "Correção de convenção escrita como correção datada, com o texto antigo citado, em vez de reescrita silenciosa"

key-files:
  created:
    - tools/bench/snapshot.mjs
    - tests/snapshot-bench.test.ts
  modified:
    - package.json
    - tools/README.md
    - .github/workflows/ci.yml

key-decisions:
  - "O alvo de comparação da run real é o sintético da wave 16, não o da wave 1: a parte 0 da run real é IGUAL à da wave 1 (260 == 260), porque ninguém morre dos dois lados"
  - "A run real é medida pelo pico de cada parte ao longo de todos os ticks, não pelo estado final"
  - "`tsx` declarado na raiz sem tocar no package-lock.json, verificado com `npm ci --dry-run` e com um controle negativo"
  - "A regra de 'uma linha' do §3 é sobre o stdout do script, e o §3 passou a dizer como observá-la (`npm run --silent`)"
  - "O §5 do tools/README.md foi reescrito como correção datada, citando o que ele dizia antes"

patterns-established:
  - "Um critério de aceitação que mede a saída de `npm run` mede também o banner do npm, que vai para stdout e não some com `2>/dev/null`"
  - "Um teste secundário cuja run termina cedo deve asserir POR QUE ela termina, senão o comentário que explica a limitação envelhece sem ninguém notar"

requirements-completed: [SYNC-04]

# Metrics
duration: ~35min
completed: 2026-09-08
---

# Phase 3 Plan 05: Bench e portão do teto do snapshot Summary

**"Cabe no fio" deixou de ser uma medição num documento e virou um comando que qualquer
pessoa roda — `snapshot wave16 parte0=1492 parte1=798 parte2=644 | wave40 parte0=3316
parte1=1228 parte2=986 | teto=16384` — e um portão que quebra o build antes de um jogador
não receber o snapshot.**

## Performance

- **Duration:** ~35 min
- **Tasks:** 2 de 2
- **Files modified:** 5 (2 criados, 3 editados)
- **Testes:** 712 na suíte inteira (52 arquivos), dos quais 6 novos

## Accomplishments

- **Os seis números entram no log do CI.** `npm run bench:snapshot` imprime uma linha e sai 0.
  A wave 16 com quatro jogadores mede 1492 / 798 / 644 bytes e a wave 40 endless mede
  3316 / 1228 / 986 — todas as seis com **mais de 4× de margem** para os 16384 bytes por
  mensagem do DataChannel. O passo entrou no job `test` entre `npm test` e
  `sim:version:verify`, exatamente onde a pesquisa o colocou.
- **O portão recusa por parte, e nomeia todas as que estouraram.** `tests/snapshot-bench.test.ts`
  acumula as violações em vez de parar na primeira, no estilo de `tests/input-codec.test.ts:96-119`:
  uma execução tem de reportar todos os problemas que consegue ver, não mandar alguém voltar
  para uma segunda viagem por um defeito que já era mensurável.
- **Os dois tetos são um só, e a checagem foi provada quebrando-a.** O bench compara o próprio
  `CEILING` com o `SNAPSHOT_MAX_BYTES` do codec em runtime; o teste lê o literal de
  `tools/bench/snapshot.mjs` **como texto** e compara com o valor importado. Trocando o
  `CEILING` para 8192, o teste sai 1 (uma falha, cinco verdes) **e** o bench recusa a rodar
  com `tools/bench/snapshot.mjs:/CEILING: o teto deste bench (8192) não bate com
  SNAPSHOT_MAX_BYTES do codec (16384)`. Revertido e reconferido verde.
- **A run real prova o que D3-20 pede dela: que o sintético é um teto, não uma amostra.**
  Quatro jogadores, input neutro, 1800 ticks, medindo o **pico** de cada parte —
  260 / 240 / 197 bytes, todas abaixo das do sintético da wave 16.
- **`tools/` é lintado, e o `tools/README.md` parou de dizer o contrário.** O §5 afirmava que
  `tools` estava no `ignores` do ESLint; isso deixou de ser verdade na fase 2 e o arquivo
  seguiu afirmando por uma fase inteira. Reescrito como **correção datada**, citando o texto
  antigo e o motivo da mudança, porque a única coisa que a versão antiga provou é que uma
  seção de convenção envelhece em silêncio.

## Task Commits

1. **Task 1: bench, script, passo de CI e correção do §5** — `3ef361d` (feat)
2. **Task 2: o portão do teto e a run real** — `6d6777c` (test)

## Files Created/Modified

- `tools/bench/snapshot.mjs` *(criado, 139 linhas)* — no molde de `tools/sim-version/emit.mjs`:
  `ROOT` por `fileURLToPath`, constantes de topo com o caminho relativo, `fail(file, pointer,
  message)`, `main()` no fim. `import` dinâmico dos dois módulos TypeScript dentro de um
  `try`, porque um `import` estático que falha derruba o processo com stack trace antes de uma
  linha deste arquivo executar — e o §3 proíbe `throw` não tratado.
- `tests/snapshot-bench.test.ts` *(criado, 182 linhas)* — 6 testes. O cabeçalho diz por que
  ele **e** o bench existem; `REAL_RUN_TICKS` carrega a limitação da run em três itens
  numerados.
- `package.json` — `"bench:snapshot": "tsx tools/bench/snapshot.mjs"` entre `sw:verify` e
  `golden:rebaseline`, e `"tsx": "4.23.12"` em `devDependencies`. `dependencies` continua `{}`.
- `tools/README.md` — §3 ganhou como conferir a regra de uma linha; §5 reescrito como
  correção; §6 novo descrevendo o bench, por que os dois controles existem e por que o `tsx`
  está declarado.
- `.github/workflows/ci.yml` — um passo, com comentário em português **sem acento**, no estilo
  do arquivo e não da regra geral do projeto.

## Decisions Made

- **O alvo de comparação da run real é o sintético da wave 16, e não o da wave 1.** A
  `<behavior>` pedia "menores que as do sintético da mesma classe", e a leitura óbvia —
  comparar com `wave1FourPlayers()`, o mundo de que a run parte — **não pode passar**: medido,
  a parte 0 da run real é 260 bytes e a da wave 1 é 260 bytes, iguais. A causa é honesta:
  a parte 0 carrega jogadores e inimigos, ninguém mata ninguém com input neutro e um jogador
  morto continua ocupando um registro, então essa parte não encolhe. O sintético que a frase de
  D3-20 nomeia é o **pior caso declarado**, que é a wave 16 — e contra ele as três partes ficam
  abaixo com folga de 5×.
- **A run real é medida pelo pico de cada parte, não pelo estado final.** O último frame desta
  run é um mundo congelado em derrota cujos projéteis já expiraram: 14 bytes na parte 1. Um
  teste que asserisse sobre esse número estaria verde sobre quase nada. O pico ao longo dos
  1800 ticks é a afirmação que vale: **em nenhum momento** da run alguma parte chegou perto do
  sintético.
- **A limitação da run virou asserção, não só comentário.** O teste assere que a run **não**
  alcança a wave 16 e que ela termina em derrota. Se um dia essas linhas ficarem vermelhas, a
  leitura correta não é "o snapshot cresceu" — é "a run parou de se comportar como a doc da
  constante diz", e a doc é o que precisa ser relida antes de o número acima voltar a valer.
  Está escrito assim dentro do teste.
- **`tsx` declarado na raiz sem tocar no `package-lock.json`, e isso foi medido antes de ser
  afirmado.** `npm ci --dry-run` continua verde com a declaração, porque `apps/server` já
  depende da mesma versão exata e o npm a eleva para o `node_modules` da raiz. O controle
  negativo confirma que a checagem é real: com um pacote de fato novo, o mesmo comando falha
  com `EUSAGE — Missing: <pacote> from lock file`. A ameaça T-3-SC está fechada com evidência,
  não com raciocínio.
- **A correção do §5 é datada e cita o texto antigo.** Escrever a seção nova como se ela sempre
  tivesse dito isso apagaria o único fato interessante: o `ignores` mudou num commit da fase 2
  e o README continuou afirmando o contrário por uma fase inteira. Quem lê uma convenção
  precisa saber quando ela mudou.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Base do worktree errada e `node_modules` ausente**
- **Found during:** preparação
- **Issue:** o worktree nasceu em `3f25a68`, antes de os planos da fase 3 existirem, e sem
  dependências instaladas.
- **Fix:** `git reset --hard c284681` pelo `<worktree_branch_check>` (HEAD confirmado no
  namespace `worktree-agent-*` **antes** do reset), depois `npm ci`. **Nenhum pacote novo
  instalado.**
- **Committed in:** nada — `node_modules/` é gitignored.

**2. [Rule 1 - Bug] O critério `npm run bench:snapshot 2>/dev/null | wc -l` retorna 5, não 1**
- **Found during:** Task 1
- **Issue:** o `npm run` imprime quatro linhas próprias de banner (`> pacote@versão`, a linha do
  comando e duas em branco) e as imprime em **`stdout`**, não em `stderr` — então `2>/dev/null`
  não as remove. O critério, lido ao pé da letra, é insatisfazível para **qualquer** script
  deste repositório sem violar o §2 do `tools/README.md`, que manda invocar sempre por
  `npm run`.
- **Fix:** resolvido a favor do que o critério protege — o `stdout` **do script** tem uma linha
  só, conferido com `npm run --silent bench:snapshot 2>/dev/null | wc -l` → **1**. E o §3 do
  `tools/README.md` passou a dizer isso: a regra é sobre o script, `npm run --silent` é como se
  observa, e o CI continua chamando `npm run` porque lá o banner é útil. A alternativa —
  um `.npmrc` com `loglevel=silent` na raiz — silenciaria o repositório inteiro para consertar
  um critério.
- **Files modified:** `tools/README.md`
- **Committed in:** `3ef361d`

**3. [Rule 1 - Bug] O mecanismo que o plano prevê para a run neutra é contradito pela medição**
- **Found during:** Task 2
- **Issue:** o plano e o § Discretion #14 dizem "com input neutro os jogadores não matam nada,
  então a contagem de inimigos fica **acima** do que uma run jogada de verdade teria". Medido:
  os jogadores também não se movem, o coorte elite da wave 1 os mata, e a `phase` sai de
  `'playing'` no **tick 614** da run. A partir daí `step` retorna cedo e o mundo congela — os
  inimigos nunca se acumulam, porque a run acaba antes.
- **Fix:** as duas leituras **concordam na conclusão** (o sintético é um teto) e discordam no
  mecanismo, então o mecanismo ficou escrito no teste **como medido**, com os três itens
  numerados: o input neutro erra alto na contagem de inimigos (o lado certo num teste de teto),
  a run termina em derrota no tick 614, e as waves de chefe não são liberadas por tempo. Os
  dois últimos viraram asserção.
- **Files modified:** `tests/snapshot-bench.test.ts`
- **Committed in:** `6d6777c`

**4. [Rule 2 - Missing critical] Medir o último frame teria deixado o teste quase vazio**
- **Found during:** Task 2
- **Issue:** consequência direta do desvio nº 3. O estado final da run é um mundo congelado com
  a parte 1 em **14 bytes**; asserir "14 < 798" é verde sobre nada, e o teste passaria a
  descrever o congelamento em vez do jogo.
- **Fix:** o laço guarda o **máximo** de cada parte em todos os ticks, e a asserção é sobre o
  pico. Custo medido: 54 ms.
- **Files modified:** `tests/snapshot-bench.test.ts`
- **Committed in:** `6d6777c`

### Escopo, não defeito

**5. A Task 2 está marcada `tdd="true"`, mas é uma tarefa só de teste.** O `files_modified` dela
tem um arquivo, `tests/snapshot-bench.test.ts`, e nenhum arquivo-fonte: o comportamento que ela
assere já existia (o codec veio do plano 03-02 e o bench veio da Task 1 deste plano). Não há
divisão RED/GREEN possível — não existe implementação a escrever. O sinal RED que **existe** foi
produzido e está registrado acima: trocar o `CEILING` para 8192 deixa o portão vermelho, o que
prova que a checagem cruzada não é vazia. O commit é `test(...)` por isso.

**6. O plano manda ler `tools/README.md` §5 e "corrigi-lo"; a correção mostrou que o §4 continua
certo.** Estão no mesmo parágrafo do plano e é fácil corrigir os dois por engano. `tools/` saiu
do `ignores` do ESLint (§5, errado) e **continua fora** do `tsc --noEmit` (§4, certo). O §5 novo
diz isso em voz alta para que a próxima leitura não junte os dois.

---

**Total deviations:** 4 corrigidas (2 × Rule 1, 1 × Rule 2, 1 × Rule 3) + 2 notas de escopo.
**Impact on plan:** nenhuma mudança de escopo e nenhum critério abandonado. Um critério de
aceitação (nº 2) não pode valer como literalmente escrito e foi resolvido a favor do que ele
protege, com a forma correta de conferi-lo escrita na convenção. Os desvios nº 3 e 4 tornam o
teste secundário mais forte do que o plano pedia.

## Issues Encountered

- **`world.players` é um `Record`, não um `Map`.** O `CLAUDE.md` registra que ele *deveria* ser
  `Map` (a ordem de iteração de chaves numéricas em objeto é crescente, não de inserção). O
  teste não depende disso: os ids dos slots vêm de `world.config.players`, e a ordem canônica
  de `step()` é problema do sim, não deste arquivo. Fica registrado porque a divergência entre
  o `CLAUDE.md` e o código é real e **não** é desta fase.
- **A medição precisou de um script descartável.** Rodei um `probe.tmp.mjs` na raiz para achar o
  tick da derrota (614), o pico das partes e a fase final antes de escrever a constante
  `REAL_RUN_TICKS` com um motivo em vez de um chute. Apagado antes do primeiro commit; nenhum
  commit o contém.

## User Setup Required

Nenhum — este plano não toca em serviço externo, não instala pacote e não pede segredo.

## Next Phase Readiness

- **SYNC-04 e o critério de sucesso 5 da fase 3 estão fechados.** Cada uma das três partes na
  wave 16 com quatro jogadores e na wave 40 endless mede menos de 16384 bytes, medido, impresso
  e asserido; o CI executa o bench; um teste falha quando os dois tetos divergem.
- **04 (netcode):** o orçamento por mensagem agora tem um dono executável. Quando o encoder de
  delta e o anel de baselines por peer entrarem, o bench mede os mesmos mundos sem ser tocado —
  e se o delta engordar a mensagem em vez de encolhê-la, o número aparece no log do PR.
- **A margem é grande e vale saber de quanto:** 4,9× na parte mais cara da wave 40. O caminho de
  partição do codec (plano 03-02) só morde perto de 1014 inimigos, o que a wave 40 com 198 não
  alcança.
- **Herdada e ainda aberta (plano 03-02, registrada no código):** `hp`/`maxHp` em `uint16` fica
  cosmeticamente errado acima da wave ~70; resolver no próximo commit que já mova `SIM_VERSION`.

## Threat Flags

Nenhuma superfície nova fora do `<threat_model>` do plano. As mitigações atribuídas a este plano
estão implementadas e conferidas:

| Ameaça | Estado | Onde |
|---|---|---|
| T-3-08 (mensagem grande no canal `unreliable`) | mitigada | `tests/snapshot-bench.test.ts` assere cada parte abaixo de 16384 na wave 16 e na wave 40; o passo de CI põe os seis números no log do PR |
| T-3-21 (dois tetos divergentes) | mitigada | O teste extrai o `CEILING` do texto do bench e compara com `SNAPSHOT_MAX_BYTES`; o bench faz a mesma comparação em runtime. **Provado quebrando**: com 8192, o teste sai 1 e o bench recusa |
| T-3-22 (bench com acesso a rede ou a segredo) | mitigada | `tools/bench/snapshot.mjs` não tem `fetch`, `process.env` nem leitura de arquivo fora do repositório; a única entrada é código-fonte que o CI acabou de clonar |
| T-3-SC (dependência nova) | mitigada com evidência | `npm ci --dry-run` verde com `tsx` declarado na raiz e `EUSAGE — Missing: … from lock file` no controle negativo. `package-lock.json` não mudou; `git diff` da base até HEAD lista cinco arquivos e nenhum deles é o lockfile |

## Known Stubs

Nenhum. Os dois arquivos criados são executáveis e executados: o bench roda no CI a cada push e
os 6 testes rodam em `npm test`.

## Self-Check: PASSED

- **Arquivos conferidos no disco:** `tools/bench/snapshot.mjs`, `tests/snapshot-bench.test.ts`,
  `tools/README.md`, `package.json`, `.github/workflows/ci.yml` — todos presentes.
- **Commits conferidos em `git log`:** `3ef361d`, `6d6777c` — ambos presentes.
- **Portões do plano:** `npm run bench:snapshot` 0 (uma linha), `npm test` 0 (712 testes,
  52 arquivos), `npm run lint` 0, `npx tsc --noEmit` 0, `npx vitest run tests/workspaces.test.ts`
  0, `npx vitest run tests/snapshot-bench.test.ts` 0 (6 testes).
- **Critérios de grep:** `scripts['bench:snapshot']` → `tsx tools/bench/snapshot.mjs`;
  `devDependencies.tsx` → `4.23.12`; `dependencies` → `{}`; `bench:snapshot` no `ci.yml` uma
  vez, na linha 125, entre `npm test` (116) e `sim:version:verify` (132); `CEILING` no teste
  4 vezes; `SNAPSHOT_MAX_BYTES` no teste 5 vezes; o texto antigo do §5 (`fica no `ignores` do
  ESLint`) → 0 ocorrências.
- **Fronteira respeitada:** `git diff --name-only` da base até HEAD lista **exatamente** os
  cinco arquivos de `files_modified`; `package-lock.json` **não** está entre eles; nenhum
  arquivo apagado em nenhum dos dois commits.
- **Não tocados de propósito:** `STATE.md` e `ROADMAP.md` — o orquestrador é o dono dessas
  escritas depois da onda.

---
*Phase: 03-sala-transporte-e-protocolo*
*Completed: 2026-09-08*
