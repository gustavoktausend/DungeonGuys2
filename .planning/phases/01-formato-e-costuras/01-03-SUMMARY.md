---
phase: 01-formato-e-costuras
plan: 03
subsystem: database
tags: [ulid, ledger, soul-gold, localstorage, idempotency, crockford-base32, tdd]

# Dependency graph
requires: []
provides:
  - "ULID gerado no cliente sem dependência de runtime (`src/app/ulid.ts`)"
  - "Ledger append-only de soul gold com núcleo puro testável em Node (`src/app/ledger.ts`)"
  - "Chave de idempotência que a fase 6 deduplica por `UNIQUE(id)`"
  - "`accountId` local de origem marcada, carimbado em todo evento (D-31)"
  - "Regra de compactação por marca d'água escrita em código (D-29)"
affects: [06-contas-e-progressao, 08-ranking, 09-temporadas]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Núcleo puro sobre arrays separado da metade persistente, no mesmo módulo"
    - "Injeção de relógio e fonte de bytes por fábrica, em vez de mock de global"
    - "Validação na fronteira do armazenamento: entrada malformada é descartada, não somada"

key-files:
  created:
    - src/app/ulid.ts
    - src/app/ledger.ts
    - tests/ulid.test.ts
    - tests/ledger.test.ts
  modified:
    - src/app/forge.ts
    - src/app/save.ts
    - src/ui/settings.ts

key-decisions:
  - "`reason` ganhou o valor `compaction`: o evento consolidado precisa de um motivo próprio, e chamá-lo de `run` mentiria para o log de auditoria"
  - "`compact` reaproveita o id do confirmado mais novo em vez de gerar um ULID: a função é pura, e reusar um id que o servidor já aceitou mantém `UNIQUE(id)` satisfeito e torna a compactação idempotente"
  - "`grant`/`spend` recusam valores não inteiros ou não positivos; `finishRun` protege o caso de run sem ouro, que não escreve evento"
  - "`load()` do save passou a adotar só as chaves que `defaults()` declara — com `Object.assign` a chave descartada voltava do armazenamento e era regravada a cada persist"
  - "O tipo `RecordedReason` impede no compilador que um chamador registre um evento `compaction` à mão"

patterns-established:
  - "Módulo `app/` com metade pura e metade persistente: os testes exercitam a pura por arrays, sem jsdom"
  - "Fábrica com dependências injetadas (`createUlidFactory`) como forma padrão de tornar testável o que lê relógio ou entropia"
  - "Dado vindo do armazenamento atravessa um type guard antes de virar estado"

requirements-completed: [FORM-05]

# Metrics
duration: 25min
completed: 2026-08-31
---

# Phase 1 Plan 03: Ledger de soul gold Summary

**Soul gold virou ledger append-only com ULID escrito à mão como chave de idempotência: o saldo é a soma dos eventos, o gasto do forge é um evento negativo, e o contador mutável saiu do save sem código de transporte.**

## Performance

- **Duration:** ~25 min
- **Started:** 2026-08-31T12:50:00Z
- **Completed:** 2026-08-31T13:13:52Z
- **Tasks:** 3
- **Files modified:** 7 (4 criados, 3 alterados)

## Accomplishments

- **ULID em 139 linhas, sem dependência de runtime.** 48 bits de tempo + 80 bits de
  `crypto.getRandomValues`, 26 caracteres Crockford. `dependencies: {}` continua intacto,
  como o `CLAUDE.md` exige. O vetor da própria spec (`1469918176385 → 01ARYZ6S41`) é teste.
- **Saldo derivado, nunca armazenado.** `balance(events)` é a única forma de saber quanto o
  jogador tem. Não existe mais campo para sobrescrever, então last-write-wins não tem onde
  perder nem duplicar dinheiro.
- **Idempotência provada por teste.** `appendEvent` ignora id repetido mesmo quando o resto
  do evento difere — o id manda, não o conteúdo, exatamente como o `UNIQUE(id)` da fase 6.
- **Gasto é evento.** `buyForge` grava `Ledger.spend(cost, 'forge')` e o nível do forge na
  mesma sequência; restaurar um save antigo não ressuscita saldo gasto, porque o saldo é
  soma e não um campo.
- **Compactação decidida em código, não em prosa.** `compact` colapsa os confirmados num
  evento consolidado com a marca d'água mais alta, preserva os pendentes e é idempotente.
- **271 testes verdes** (244 originais + 11 de ULID + 16 de ledger), `tsc --noEmit` e
  `eslint` em 0, `git diff --stat src/sim/` vazio.

## Task Commits

1. **Task 1: ULID escrito à mão** — `4d41bdf` (test, RED) → `a9276b4` (feat, GREEN)
2. **Task 2: Ledger append-only** — `f4409b3` (test, RED) → `b6d7b83` (feat, GREEN)
3. **Task 3: Religar o forge e apagar `progress.soulGold`** — `593f5b0` (feat)

Os dois planos TDD cumpriram o portão RED → GREEN na ordem: em ambos o teste foi commitado
falhando (módulo inexistente) antes da implementação. Nenhum REFACTOR foi necessário.

## Files Created/Modified

- `src/app/ulid.ts` — ULID transcrito da spec; `createUlidFactory(deps)` injeta relógio e
  fonte de bytes, `ulid` é a instância ligada a `Date.now` e `crypto.getRandomValues`
- `src/app/ledger.ts` — núcleo puro (`balance`/`appendEvent`/`compact`) e metade persistente
  (`Ledger`) sob a chave `dungeonguys2_ledger_v1`
- `tests/ulid.test.ts` — 11 testes: tamanho, alfabeto, vetor da spec, carry, ordem
  lexicográfica, relógio para trás, esgotamento dos 80 bits
- `tests/ledger.test.ts` — 16 testes: soma, idempotência, ordem irrelevante, gasto negativo,
  compactação e seus invariantes, validação de valores
- `src/app/forge.ts` — as quatro leituras viraram `balance(Ledger.events)`; `buyForge` gasta
  pelo ledger, `finishRun` concede pelo ledger
- `src/app/save.ts` — `SaveData` perdeu `soulGold`; `load()` adota só as chaves conhecidas
- `src/ui/settings.ts` — o painel de perfil lê o saldo do ledger

## Decisions Made

1. **`reason` ganhou um quinto valor, `compaction`.** O plano enumerou
   `'run' | 'mission' | 'season' | 'forge'`, mas o evento consolidado que `compact` produz
   precisa de um motivo. Rotulá-lo como `run` corromperia o log de auditoria — que é
   justamente o que D-28 diz que o ledger existe para dar. O tipo `RecordedReason` exclui
   `compaction` da superfície de `grant`/`spend`, então nenhum chamador o registra à mão.
2. **`compact` reaproveita o id do confirmado mais novo.** Gerar um ULID novo tornaria a
   função impura (leria relógio e entropia), e o núcleo puro é a propriedade que os testes
   compram. Reusar um id que o servidor já aceitou mantém `UNIQUE(id)` satisfeito e faz
   `compact(compact(x)) === compact(x)` cair de graça.
3. **Run sem ouro não escreve evento.** `grant` recusa valores não positivos; `finishRun`
   guarda com `if (forged > 0)`. Um evento de valor zero seria ruído no log e o guard também
   cobre `NaN`, que passaria despercebido por uma soma.
4. **Dado vindo do armazenamento é validado.** O `<threat_model>` deste plano nomeia
   `localStorage → aplicação` como fronteira de confiança. Ver a justificativa completa nas
   deviations abaixo.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] `Object.assign` ressuscitava a chave descartada a cada persist**

- **Found during:** Task 3 (religar o forge e apagar `progress.soulGold`)
- **Issue:** O plano afirma que "um save que ainda tiver a chave simplesmente a perde no
  primeiro `persist()`, porque `defaults()` deixa de conhecê-la". Isso não é verdade com o
  `load()` existente: `Object.assign(data.progress, parsed.progress)` copia **todas** as
  chaves do objeto armazenado, inclusive as que o schema não declara mais. O
  `soulGold` antigo voltaria para `data.progress` como propriedade fantasma e seria
  regravado no armazenamento em todo `persist()`, indefinidamente. Isso contraria D-26
  ("descartado") e deixa um campo morto com valor de moeda ao lado do ledger que agora é
  dono do mesmo dinheiro — exatamente o tipo de fantasma que a política de merge por campo
  de D-32 poderia recolher na fase 6 e recontar como saldo.
- **Fix:** `load()` passou a usar um helper `adopt(target, source)` que copia apenas as
  chaves que `defaults()` declara. Não lê o valor antigo, não o converte e não nomeia campo
  nenhum — portanto não é código de transporte (D-26 continua respeitado) e o critério
  `grep -rn "soulGold" src/app/save.ts` segue vazio.
- **Files modified:** `src/app/save.ts`
- **Verification:** `npx tsc --noEmit` em 0, 271 testes verdes, `npm run build` bem-sucedido
- **Committed in:** `593f5b0` (commit da Task 3)

**2. [Rule 2 - Missing Critical] Validação da entrada vinda do armazenamento**

- **Found during:** Task 2 (ledger)
- **Issue:** O `<threat_model>` do plano nomeia `localStorage → aplicação` como fronteira de
  confiança, mas o plano não pedia validação ao carregar. Sem ela, um `amount` adulterado ou
  truncado (`"120"`, `null`, `NaN`) tornaria `balance()` igual a `NaN`. E `NaN < cost` é
  `false`, o que **destravaria todos os botões de compra do forge** — o jogador compraria
  upgrades permanentes de graça, e cada compra gravaria um evento negativo sobre um saldo já
  sem sentido.
- **Fix:** Type guard `isLedgerEvent` aplicado a cada item ao carregar; o que não passa é
  descartado. Os que passam entram pelo mesmo `appendEvent` do runtime, de modo que um
  arquivo com id repetido colapsa em um evento em vez de pagar duas vezes. Somado a isso,
  `assertAmount` recusa valores não inteiros ou não positivos em `grant`/`spend`.
- **Files modified:** `src/app/ledger.ts`
- **Verification:** Teste `recusa valores que não são inteiros positivos` (6 asserções) verde
- **Committed in:** `b6d7b83` (commit da Task 2)

**3. [Rule 3 - Blocking] Anotação de tipo em `Uint8Array` no `createUlidFactory`**

- **Found during:** Task 1 (ULID)
- **Issue:** `npx tsc --noEmit` falhou com TS2322 — o TypeScript instalado é 5.9.3, onde
  `Uint8Array` é genérico sobre `ArrayBufferLike`. O tipo inferido de
  `new Uint8Array(RANDOM_BYTES)` fixa `Uint8Array<ArrayBuffer>` e rejeita o bloco devolvido
  por `takeBytes`, tipado como `Uint8Array<ArrayBufferLike>`.
- **Fix:** Anotação explícita `let random: Uint8Array = ...`, com comentário explicando por
  que a inferência não serve.
- **Files modified:** `src/app/ulid.ts`
- **Verification:** `npx tsc --noEmit` sai em 0
- **Committed in:** `a9276b4` (commit da Task 1)

---

**Total deviations:** 3 auto-fixed (1 bug, 1 missing critical, 1 blocking)
**Impact on plan:** As três são de correção ou segurança. A #1 é o que faz a afirmação do
próprio plano sobre D-26 ser verdadeira; a #2 fecha uma fronteira que o threat model do plano
já nomeava; a #3 é um erro de compilação. Nenhuma amplia escopo — nenhum arquivo fora dos sete
declarados em `files_modified` foi tocado.

## Issues Encountered

- **`src/sim/run.ts:298` menciona `soulGold` num comentário.** Deixado intacto: a restrição
  do plano proíbe tocar `src/sim/`, e o critério é `grep -rn "progress.soulGold" src/`, que
  não casa com o texto do comentário (`Save.recordRun/soulGold forging`). O comentário
  descreve o que `app/` faz depois da run, e continua correto em espírito.
- **`src/ui/dom.ts:100` tem `soulGold`.** É o handle do elemento `#soul-gold`, não a moeda.
  Mantido.
- **`docs/adr/` ainda não existe** neste worktree — o plano 01-02 o cria em paralelo. As
  decisões foram lidas de D-26 a D-31 no `01-CONTEXT.md`, como o `<read_first>` da Task 2
  previa para esse caso.
- **Aviso de `innerHTML` em `forge.ts`.** Pré-existente e fora de escopo: a string é montada
  a partir da tabela literal `FORGE_UPGRADES`, definida no próprio módulo, sem entrada do
  usuário. Nenhum dado do ledger é interpolado como HTML.

## Threat Flags

Nenhuma superfície nova fora do `<threat_model>` do plano. O `accountId` local que `Ledger`
cunha no primeiro boot já estava previsto por D-31 e não é identidade autenticada — é um
marcador de origem que a fase 6 troca por um `accountId` de servidor.

## Known Stubs

Nenhum. `compact` não tem chamador ainda porque nada confirma eventos antes da fase 6 — é API
exportada e testada, decidida agora porque é formato, exatamente como D-29 pede. Não é stub:
não devolve valor de mentira nem alimenta a UI com dado vazio.

## Next Phase Readiness

- **Pronto para a fase 6.** O formato do evento, a chave de idempotência, o carimbo de
  `accountId` e a regra de compactação estão em código e testados. Falta só o transporte.
- **`Ledger` não expõe `apply(event)` nem `compactStored()`.** A fase 6 vai precisar dos
  dois para aplicar o que vem do servidor e para disparar a compactação; ficaram de fora
  porque hoje seriam código morto. O núcleo puro que eles vão usar já existe.
- **Ranking de co-op continua em aberto** — o `reason` `'run'` não distingue solo de co-op,
  e o stack recomenda placares separados. Decisão da fase 8, não desta.

## Self-Check: PASSED

Arquivos criados verificados em disco: `src/app/ulid.ts`, `src/app/ledger.ts`,
`tests/ulid.test.ts`, `tests/ledger.test.ts`.
Commits verificados em `git log`: `4d41bdf`, `a9276b4`, `f4409b3`, `b6d7b83`, `593f5b0`.

---
*Phase: 01-formato-e-costuras*
*Completed: 2026-08-31*
