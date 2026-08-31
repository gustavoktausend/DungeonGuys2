---
phase: 01-formato-e-costuras
plan: 02
subsystem: docs
tags: [adr, identidade, ledger, replay, ranking, temporada, co-op, backlog]

# Dependency graph
requires:
  - phase: 01-formato-e-costuras
    provides: "01-CONTEXT.md com D-01 a D-38, 01-RESEARCH.md com o mapa de responsabilidade arquitetural"
provides:
  - "docs/adr/ com convenção NNNN-slug.md, formato de quatro seções e índice de 12 decisões"
  - "ADR 0001: os três espaços de identidade (accountId / playerId / peerId) com dono, ciclo de vida e regra de travessia"
  - "ADR 0002: ULID local não-reivindicado no primeiro boot e a regra de claim da fase 6"
  - "ADR 0003: uma regra de merge por campo do save (MAX, união, ledger, fila)"
  - "ADR 0004: name e colors sincronizam; volume, mute, autoAim, shake e mode ficam por aparelho"
  - "ADR 0005: esquema (temporada, SIM_VERSION), recusa sem bypass de dev, e o teto de endless nomeado como a única pergunta aberta"
  - "ADR 0006: modo x tamanho de grupo x perfil como colunas desde o primeiro board"
  - "ADR 0007: run rankeada roda com forge zerado (perfil normalizado)"
  - "ADR 0008: checkpoint de progressão por wave concluída, um registro por (run, wave, jogador)"
  - "ADR 0009: a cadeia de quem criou a sala define, e carregar um amigo é feature aceita"
  - "ADR 0010: ledger append-only de soul gold, com o formato de fio adiado para a fase 6"
  - "ADR 0011: envelope de replay, teto de ticks no formato e canonização de -0 para +0"
  - "ADR 0012: world.objectives como campo, exceção deliberada à regra dos eventos"
  - "docs/BACKLOG.md corrigido no ponto que contradizia a medição do SCC, com o segundo corte registrado"
affects: [01-03-ledger, 01-06-serialize, phase-04-sala, phase-05-coop, phase-06-contas, phase-08-missao, phase-09-ranking]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "ADR numerado em docs/adr/NNNN-slug.md com quatro seções obrigatórias e citação do id D-NN de origem"

key-files:
  created:
    - docs/adr/README.md
    - docs/adr/0001-identidade-em-tres-espacos.md
    - docs/adr/0002-claim-da-conta-local.md
    - docs/adr/0003-merge-por-campo-do-save.md
    - docs/adr/0004-settings-identidade-sincroniza.md
    - docs/adr/0005-temporada-por-sim-version.md
    - docs/adr/0006-categorias-do-placar.md
    - docs/adr/0007-perfil-normalizado-forge-desligado.md
    - docs/adr/0008-queda-do-host-checkpoint-por-wave.md
    - docs/adr/0009-missao-destravada-e-credito.md
    - docs/adr/0010-soul-gold-ledger-append-only.md
    - docs/adr/0011-formato-de-replay.md
    - docs/adr/0012-objetivos-como-campo-do-world.md
  modified:
    - docs/BACKLOG.md

key-decisions:
  - "Três das quatro perguntas de produto abertas do STATE.md ficam fechadas por escrito: queda do host (ADR 0008), missão destravada (ADR 0009) e teto do forge (ADR 0007)"
  - "A quarta — teto de duração para endless — tem a forma decidida (teto explícito na UI) e só o número fica com a fase 9, porque D-11 fechou a alternativa de verificação amostrada"
  - "O formato de fio do LedgerEvent em packages/protocol fica adiado para a fase 6, com a razão escrita na seção Consequência do ADR 0010"
  - "O ADR 0011 fixa o campo de teto de ticks no formato desde agora e canoniza -0 para +0 na captura, porque o round-trip por JSON perde o sinal em silêncio"
  - "docs/BACKLOG.md afirmava que o ciclo entre run e shop cairia com o corte da aresta de xp; a afirmação foi corrigida e o segundo corte virou item de dívida"

patterns-established:
  - "Convenção de ADR: docs/adr/NNNN-slug.md, quatro dígitos, número nunca reaproveitado, quatro seções em português (Contexto, Opções, Decisão, Consequência), cabeçalho citando o D-NN de origem"
  - "Nenhum ADR pode conter decisão em aberto: se a decisão não está fechada, ela continua sendo pergunta no ROADMAP e não vira ADR"
  - "Adiamento deliberado é registrado como tal, com a razão e o tier nomeado, em vez de virar omissão"

requirements-completed: [FORM-01]

# Metrics
duration: 16min
completed: 2026-08-31
---

# Phase 1 Plan 02: ADRs de formato e costuras Summary

**Doze ADRs em `docs/adr/` que fecham identidade, save, ranking, temporada, co-op, soul gold, replay e objetivos — mais a correção do `docs/BACKLOG.md` no ponto em que ele contradizia a medição do SCC.**

## Performance

- **Duration:** 16 min
- **Started:** 2026-08-31T12:58:10Z
- **Completed:** 2026-08-31T13:13:37Z
- **Tasks:** 3
- **Files modified:** 14 (13 criados, 1 modificado)

## Accomplishments

- **`docs/adr/` nasce com convenção estável.** `NNNN-slug.md`, quatro dígitos, número nunca
  reaproveitado, quatro seções obrigatórias em português, e cabeçalho citando o `D-NN` de origem.
  É o diretório que as fases 5, 6, 8 e 9 vão citar nominalmente.
- **Três das quatro perguntas de produto que o `STATE.md` listava como bloqueantes estão
  fechadas por escrito:** queda do host (ADR 0008), missão destravada (ADR 0009) e teto do forge
  (ADR 0007). A quarta — teto de endless — está nomeada com a porta que se fechou (D-11), a forma
  decidida (teto explícito na UI) e só o número entregue à fase 9, com o campo já reservado no
  formato de replay.
- **Nenhuma decisão em aberto disfarçada de decisão registrada.**
  `grep -riE "\b(TBD|a definir|decidir depois)\b" docs/adr/` não retorna nada.
- **O que a fase deliberadamente não constrói está escrito como adiamento com razão:** o formato
  de fio do `LedgerEvent` em `packages/protocol` fica para a fase 6, e o ADR 0010 diz isso na
  seção `## Consequência` e diz por quê — não existe consumidor de rede do ledger antes da fase 6,
  e o que é caro mudar depois (forma append-only local e `eventId` ULID) nasce agora.
- **`docs/BACKLOG.md` corrigido e ampliado:** a afirmação de que o ciclo `run ↔ shop` cairia junto
  com o corte da aresta `xp → run` estava errada e foi corrigida; o segundo corte virou item de
  dívida, com `closeShop → startNextWave` (`shop.ts:57`) e `checkWaveComplete → openShop`
  (`run.ts:288`) citados, e com o registro de que a fase 1 para em 5 + 2 componentes de propósito.

## Task Commits

Each task was committed atomically:

1. **Task 1: Convenção, índice e os quatro ADRs de identidade e save** — `5693261` (docs)
2. **Task 2: Os cinco ADRs de ranking, temporada e co-op** — `88d3e42` (docs)
3. **Task 3: ADRs de soul gold, replay e objetivos, mais a dívida do segundo corte** — `1db1cfc` (docs)

## Files Created/Modified

- `docs/adr/README.md` — convenção `NNNN-slug`, formato de quatro seções, índice das 12 decisões e a seção de adiamentos deliberados
- `docs/adr/0001-identidade-em-tres-espacos.md` — D-30: `accountId` / `playerId` / `peerId`, cada um com dono, ciclo de vida e regra de travessia; `accountId` nunca entra no `World`
- `docs/adr/0002-claim-da-conta-local.md` — D-31: ULID local não-reivindicado no primeiro boot; o mesmo campo `accountId` com marcador de origem
- `docs/adr/0003-merge-por-campo-do-save.md` — D-32: `MAX` para recordes, união para destravados, ledger para soul gold, fila local para ranking; nenhuma é last-write-wins
- `docs/adr/0004-settings-identidade-sincroniza.md` — D-33: `name` e `colors` sincronizam por última escrita com carimbo; `volume`, `mute`, `autoAim`, `shake` e `mode` ficam por aparelho
- `docs/adr/0005-temporada-por-sim-version.md` — D-34/D-07/D-08: `(temporada, SIM_VERSION)`, recusa simétrica sem bypass de dev, e o teto de endless nomeado como a única pergunta que segue aberta
- `docs/adr/0006-categorias-do-placar.md` — D-35: modo × tamanho de grupo × perfil como colunas desde o primeiro board, com v1 rankeando só solo
- `docs/adr/0007-perfil-normalizado-forge-desligado.md` — D-36: forge zerado em run rankeada, com a alternativa de teto recusada e o custo registrado
- `docs/adr/0008-queda-do-host-checkpoint-por-wave.md` — D-37: crédito por wave concluída, um registro por `(run, wave, jogador)`, idempotente
- `docs/adr/0009-missao-destravada-e-credito.md` — D-38: a cadeia de quem criou a sala define, e carregar um amigo é feature aceita por escrito
- `docs/adr/0010-soul-gold-ledger-append-only.md` — D-26..D-29: saldo atual descartado com o precedente do cabeçalho de `src/app/save.ts`, ledger em chave própria, compactação por marca d'água, e o adiamento do formato de fio para a fase 6
- `docs/adr/0011-formato-de-replay.md` — D-10/D-11/D-12/D-04: envelope JSON com log em base64, replay a partir da seed, teto de `60 × 3600 × 3` ticks no formato desde agora, canonização de `-0` para `+0` na captura, e verificação amostrada declarada fora
- `docs/adr/0012-objetivos-como-campo-do-world.md` — FORM-08: `world.objectives` como campo, com `emit`/`drainEvents` citados e a doutrina de forma estável de `types.ts:130-133`
- `docs/BACKLOG.md` — afirmação errada sobre `run ↔ shop` corrigida; entrada nova para o segundo corte do ciclo

## Decisions Made

- **Os requisitos citados no índice do README foram conferidos contra `.planning/REQUIREMENTS.md`**
  em vez de inventados: `CONTA-03`, `CONTA-04`, `CONTA-05`, `CONTA-06`, `RANK-02`, `RANK-04`,
  `TEMP-01`, `TEMP-03` e `MISS-03` existem e casam com a decisão de cada ADR.
- **O `progress.forge` foi tratado como estado derivado do ledger** no ADR 0003, em vez de entrar
  como campo primário na tabela de merge. Sincronizá-lo por si só duplicaria a fonte da verdade —
  D-28 já o define como derivado, e a tabela de merge tinha de refletir isso.
- **O ADR 0011 registra explicitamente a consequência para a fase 3** (codec binário: `-0` e `+0`
  têm padrões de bits diferentes em `Float64Array`), porque a canonização na captura é o que
  impede a diferença entre o caminho JSON e o caminho binário de virar divergência de hash.
- **O README ganhou uma seção "Adiamentos deliberados"** listando os dois itens que esta fase não
  constrói (formato de fio do `LedgerEvent`, número do teto de endless), para que a ausência seja
  encontrável a partir do índice e não só dentro do ADR que a menciona.

## Deviations from Plan

None - plan executed exactly as written.

O único ajuste de redação foi interno ao ADR 0001: a frase original *"Decidir depois de existirem
replays é migração"* disparava o próprio portão de verificação da Task 1 (que proíbe a expressão
"decidir depois" em qualquer ADR). Foi reescrita para *"Fixar esses campos só quando já existirem
replays guardados é migração de dados, não refatoração"*, sem mudar o sentido. Isso é o portão
funcionando, não desvio de plano.

## Issues Encountered

- **Os três comandos `node -e` de verificação das tasks saem com código 0.** O da Task 1 falhou na
  primeira execução pelo motivo descrito acima, e passou depois da reescrita da frase.
- Nenhum outro problema. O plano não escreve uma linha de código, então não houve portão de build,
  lint ou teste a atravessar.

## Threat Register

As três ameaças do `<threat_model>` do plano, todas com disposição `mitigate`, estão cobertas:

| Threat ID | Onde ficou mitigada |
|-----------|---------------------|
| T-1-01 (spoofing de `SIM_VERSION`) | ADR 0005 — recusa simétrica, a autoridade compara com o **próprio** valor, o cliente nunca escolhe a versão de referência, e não existe bypass de dev |
| T-1-02 (tampering de `eventId`) | ADR 0010 — ULID com 80 bits de aleatoriedade criptográfica e `UNIQUE(id)` como dedupe no servidor (fase 6); sincronizar duas vezes é no-op por construção |
| T-1-03 (replay como amplificador de CPU) | ADR 0011 — campo de teto de ticks **no formato agora**, com o valor de referência `60 × 3600 × 3`; a aplicação é da fase 9 |

Nenhuma superfície de segurança nova foi introduzida: o plano é documento puro, sem endpoint, sem
caminho de autenticação, sem acesso a arquivo e sem mudança de esquema executável.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- **`docs/adr/` está pronto para ser citado nominalmente** pelos planos das fases 5, 6, 8 e 9, com
  índice e convenção fixados.
- **O plano 01-03** (`src/app/ledger.ts`, `src/app/ulid.ts`) tem o ADR 0010 como especificação
  escrita: chave `dungeonguys2_ledger_v1`, sem código de migração, sem tipo de evento `legacy`,
  gasto como evento negativo, saldo por soma, e compactação por marca d'água.
- **O plano 01-06** (`sim/serialize.ts`) tem a política de `-0` do ADR 0011 e a forma estável de
  `world.objectives` do ADR 0012 como restrição de desenho.
- **Bloqueadores:** nenhum. A única pergunta de produto que segue aberta — o **número** do teto de
  duração para endless — é consumida pela fase 9 e depende do bench de CPU que a própria fase 9
  vai medir; o campo que a carrega já existe no formato.

---
*Phase: 01-formato-e-costuras*
*Completed: 2026-08-31*

## Nota sobre FORM-01

`FORM-01` é reivindicado por **dois** planos desta fase: este (a metade escrita — os ADRs) e o
`01-13` (a metade de código — `RunConfig` por jogador e o `step()` iterando a ordem canônica).
O `requirements-completed` deste sumário registra a cobertura da metade escrita; a marcação
definitiva em `.planning/REQUIREMENTS.md` é do orquestrador, depois do `01-13`.

## Self-Check: PASSED

**Arquivos declarados — todos encontrados:**

- FOUND: `docs/adr/README.md`
- FOUND: `docs/adr/0001-identidade-em-tres-espacos.md`
- FOUND: `docs/adr/0002-claim-da-conta-local.md`
- FOUND: `docs/adr/0003-merge-por-campo-do-save.md`
- FOUND: `docs/adr/0004-settings-identidade-sincroniza.md`
- FOUND: `docs/adr/0005-temporada-por-sim-version.md`
- FOUND: `docs/adr/0006-categorias-do-placar.md`
- FOUND: `docs/adr/0007-perfil-normalizado-forge-desligado.md`
- FOUND: `docs/adr/0008-queda-do-host-checkpoint-por-wave.md`
- FOUND: `docs/adr/0009-missao-destravada-e-credito.md`
- FOUND: `docs/adr/0010-soul-gold-ledger-append-only.md`
- FOUND: `docs/adr/0011-formato-de-replay.md`
- FOUND: `docs/adr/0012-objetivos-como-campo-do-world.md`
- FOUND: `docs/BACKLOG.md`
- FOUND: `.planning/phases/01-formato-e-costuras/01-02-SUMMARY.md`

`ls docs/adr/` lista **13** arquivos (12 ADRs + README), como a verificação do plano exige.

**Commits declarados — todos encontrados:**

- FOUND: `5693261`
- FOUND: `88d3e42`
- FOUND: `1db1cfc`
- FOUND: `22565bc` (metadados do plano)

**Verificações automatizadas do plano — as três saem com código 0:**

- Task 1: `adr 0001-0004 ok`
- Task 2: `adr 0005-0009 ok`
- Task 3: `adr 0010-0012 + backlog ok`
- `grep -riE "\b(TBD|a definir|decidir depois)\b" docs/adr/` — sem retorno

**Known Stubs:** nenhum. O plano é documento puro; não há dado mocado, componente sem fonte nem
placeholder de UI.
