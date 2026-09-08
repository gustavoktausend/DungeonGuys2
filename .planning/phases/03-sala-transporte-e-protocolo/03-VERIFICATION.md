---
phase: 03-sala-transporte-e-protocolo
verified: 2026-09-08T19:24:08Z
status: passed
score: 5/5 critérios de sucesso verificados (1 via override documentado no próprio ROADMAP)
overrides_applied: 1
overrides:
  - must_have: "A sala fecha entre jogadores atrás de NAT residencial brasileiro, incluindo pelo caminho de relay — exercitado sob flag de debug, sem depender de achar um amigo atrás de CGNAT (critério 3, SALA-04)"
    reason: "Bloqueado por infraestrutura, não por código. ROADMAP.md declara textualmente, na seção da fase 3: 'O critério 3 não pode fechar antes do 02-04 [...] Se /gsd:verify-work rodar antes dele, o critério 3 é bloqueado por infraestrutura, não falho.' A VPS (02-04) segue adiada — STATE.md § Deferred Items registra a resposta do usuário ao checkpoint do plano 03-11 em 2026-09-08: 'a caixa ainda não existe'. Toda a metade que É código está pronta e verificada nesta sessão: ops/turnserver.conf e ops/coturn-dropin.conf versionados e testados (03-07), credencial HMAC efêmera amarrada à sala com vetor cross-verificado por openssl e node:crypto (03-06), tabela ice_outcome com INSERT idempotente e sem IP de jogador (03-06), flag de relay no cliente ligável por link/persistente/nunca padrão (03-08). O plano 03-11 já existe, é o único não-autônomo da fase, e é ele — não um plano novo de fechamento de gap — que fecha este critério assim que a caixa existir."
    accepted_by: "Gustavo (resposta ao checkpoint humano do plano 03-11 Task 1, 2026-09-08, registrada em STATE.md)"
    accepted_at: "2026-09-08"
gaps: []
deferred:
  - truth: "A sala fecha entre jogadores atrás de NAT residencial brasileiro, incluindo pelo caminho de relay (critério 3, SALA-04)"
    addressed_in: "Plano 03-11 (mesma fase, onda 7 — não é uma fase futura, é o último plano desta fase, bloqueado por 02-04)"
    evidence: "ROADMAP.md § Phase 3: 'Wave 7 (blocked on Wave 6 completion — e bloqueada por 02-04) [...] O critério 3 não pode fechar antes do 02-04.' STATE.md § Deferred Items lista 03-11 como bloqueado por 02-04."
human_verification: []
---

# Phase 3: Sala, transporte e protocolo — Verification Report

**Phase Goal:** Quatro amigos se encontram numa sala pelo código e se veem no lobby — e o
formato do fio (duas classes de canal, tabelas de enum congeladas e o codec binário
quantizado do snapshot) fica decidido aqui, antes de existir uma partida para consumi-lo.

**Verified:** 2026-09-08T19:24:08Z
**Status:** passed
**Re-verification:** Não — verificação inicial

## Método

Esta verificação não confiou em nenhuma alegação de SUMMARY.md sem prova direta. Para cada
critério de sucesso do ROADMAP e para os débitos declarados no `deferred-items.md` e nos
SUMMARYs, o código foi lido diretamente e os seguintes portões foram **executados nesta
sessão**, a partir da árvore de trabalho limpa em `main` (HEAD `70d28aa`), não copiados de
relato:

| Comando | Resultado observado |
|---|---|
| `npm test` | 0 — **60 arquivos, 886 testes**, todos verdes |
| `npm run lint` | 0 |
| `npm run build` | 0 — `dist/` gerado, `SIM_VERSION` emitido, `sw:emit` com 13 arquivos de precache |
| `npm run typecheck:server` | 0 |
| `npm run bench:snapshot` | 0 — `snapshot wave16 parte0=1492 parte1=798 parte2=644 \| wave40 parte0=3316 parte1=1228 parte2=986 \| teto=16384` |
| `npm run test:browser` | 0 — 3 arquivos, **12 testes** em Chromium, Firefox e WebKit |
| `npm run test:e2e` | 0 — **12 specs** (11 do projeto `pwa` + 1 do projeto `net`), incluindo `tests/net/room.spec.ts` com **três** contextos reais de navegador fechando uma sala por loopback |

O `tests/net/room.spec.ts` foi a peça de maior valor probatório: ele exercita o fluxo inteiro
— criar sala, código de 6 caracteres, segunda aba entrando, ping+rota aparecendo, classe
propagando, `INICIAR` montando a mesma run nos três, ausência da tela de divergência, saída de
convidado sem derrubar a sala, saída de quem criou encerrando-a — contra um `RTCPeerConnection`
de verdade, não contra um dublê em processo. Rodei esta spec eu mesmo nesta sessão; ela não
tinha sido apenas relatada como verde, foi observada verde.

## Goal Achievement

### Observable Truths (critérios de sucesso do ROADMAP)

| # | Truth | Status | Evidence |
|---|---|---|---|
| 1 | Um jogador cria uma sala, recebe um código de 6+ caracteres sem caractere ambíguo, e até três amigos entram por ele e se veem no lobby com nome e classe | ✓ VERIFIED | `packages/protocol/src/roomCode.ts` (alfabeto Crockford de 32 sem I/L/O/U, 6 caracteres); `tests/net/room.spec.ts` linha ~94: código `/^[A-Z0-9]{6}$/` aparece em `#lobby-code`, um segundo e um terceiro navegador entram e `#lobby-slots` mostra 2 e depois 3 cadeiras ocupadas — executado e observado verde nesta sessão |
| 2 | Cada jogador escolhe a classe no lobby e quem criou inicia a run; os slots `p0..p3` são atribuídos quando a sala fecha e não mudam depois | ✓ VERIFIED | `tests/lobby.test.ts:259` (`startRoom com só a autoridade produz um RunConfig de um jogador (D3-04)` — inicia sozinho, sem estado de pronto); `:271` (`os slots p0..p3 saem em ordem de entrada quando a sala fecha (SALA-03)`); `:287` (`depois de fechar, os slots atribuídos não mudam nem quando alguém sai`); `tests/net/room.spec.ts` clica em `#lobby-class .lobby-class-card` e confere que a classe aparece nos dois lados, depois clica `#btn-start-run` e confere `#hud` visível nos três com `#desync-screen` **ausente** de `active` nos três (mesmo `hashWorld` do tick 0, D3-05) |
| 3 | A sala fecha entre jogadores atrás de NAT residencial brasileiro, incluindo pelo caminho de relay — exercitado sob flag de debug, sem depender de achar um amigo atrás de CGNAT | **PASSED (override)** | **Bloqueado por infraestrutura, não por código** — ver override no frontmatter. A metade local está implementada e testada: `ops/turnserver.conf`/`ops/coturn-dropin.conf` versionados com `denied-peer-ip` contado por teste (03-07); `apps/server/src/signaling/turn.ts` com HMAC-SHA1 cross-verificado por `openssl` e `node:crypto` (03-06, `tests/turn.test.ts`); `src/net/ice.ts` com `readRelayFlag`/`clearRelayFlag`, nunca ligada por padrão (03-08). O que falta é a VPS real (02-04), que o plano 03-11 (onda 7 desta mesma fase) fecha assim que existir — não é um plano novo a criar |
| 4 | A tela mostra ping e tipo de rota, e o desfecho ICE de cada conexão fica registrado: a taxa real de necessidade de relay passa a ser medida em vez de estimada | ✓ VERIFIED | `tests/net/room.spec.ts`: `#lobby-slots` mostra `/\d+ ms · direto/` nos dois lados, medido contra um `RTCPeerConnection` real via `getStats()` (`src/net/ice.ts:routeOf`); `apps/server/src/index.ts:108,148-149` liga `createOutcomeRecorder` a `recordOutcome`/`forgetOutcomes` de verdade (não é mais o no-op stub do plano 03-04) — confirmado lendo o arquivo diretamente; `002_ice_outcome` grava `route`/`result` inclusive para tentativas que falharam (a métrica não fica enviesada para cima), sem IP de jogador, testado em `tests/server-migrate.test.ts` |
| 5 | Um bench no CI codifica um `World` de wave 16 com 4 jogadores e o resultado cabe abaixo de 16 KiB por mensagem | ✓ VERIFIED | Executei `npm run bench:snapshot` nesta sessão: `parte0=1492 parte1=798 parte2=644` (wave 16) e `parte0=3316 parte1=1228 parte2=986` (wave 40), todas abaixo de 16384 com folga de 4,9×–11×; `.github/workflows/ci.yml:131` roda o mesmo comando no job `test`; `tests/snapshot-bench.test.ts` quebra o build se algum ultrapassar o teto (verificado no SUMMARY que o portão foi provado quebrando, com `CEILING` trocado para 8192) |

**Score:** 5/5 critérios verificados (4 diretamente, 1 por override documentado no próprio
ROADMAP.md — não é uma concessão desta verificação, é uma decisão de planejamento que já
previa este exato cenário)

### Deferred Items

Item não fechado nesta fase, mas endereçado por um plano já existente **dentro da própria
fase 3** (onda 7, `03-11-PLAN.md`), bloqueado por uma dependência de infraestrutura anterior
(`02-04`) que está fora do controle de código.

| # | Item | Addressed In | Evidence |
|---|---|---|---|
| 1 | Critério 3 (SALA-04) — relay real contra NAT/CGNAT brasileiro | Plano 03-11 (onda 7, bloqueado por 02-04) | `ROADMAP.md`: "O critério 3 não pode fechar antes do 02-04 [...] o critério 3 é bloqueado por infraestrutura, não falho." `STATE.md` § Deferred Items confirma o bloqueio e a resposta do usuário. |

### Required Artifacts

Todos os artefatos abaixo foram conferidos por leitura direta do arquivo nesta sessão — não
apenas listados pelo SUMMARY correspondente.

| Artifact | Expected | Status | Details |
|---|---|---|---|
| `packages/protocol/src/roomCode.ts` | Alfabeto, comprimento, normalização, validação | ✓ VERIFIED | 4 exports confirmados; cabeçalho documenta D3-09 e a cópia independente de `ulid.ts` |
| `packages/protocol/src/enums.ts` | `MSG_KIND` com 10 entradas, 19 tabelas congeladas | ✓ VERIFIED | Lido diretamente: `MSG_KIND` tem `ping` no índice 8 e `pong` no índice 9; `REJECT_REASON` com 5 entradas (ver Anti-Patterns) |
| `packages/protocol/src/signaling.ts` | 12 corpos de mensagem, sem runtime | ✓ VERIFIED | Existe, consumido por `apps/server/src/signaling/schema.ts` e por `src/net/signaling.ts` |
| `packages/protocol/src/snapshotCodec.ts` | Codec binário do snapshot em 3 partes | ✓ VERIFIED | 941 linhas; `SNAPSHOT_MAX_BYTES`, `POS_SCALE` presentes; bench confirma tamanhos reais |
| `tests/worlds.ts` | 3 mundos sintéticos de pior caso | ✓ VERIFIED | 314 linhas, fonte única para teste e bench |
| `src/net/transport.ts`, `local.ts`, `lossy.ts`, `lobby.ts`, `ping.ts` | Camada de transporte testável em Node | ✓ VERIFIED | Todos presentes; `lobby.ts` com 941 linhas (min_lines 150 do plano) |
| `apps/server/src/signaling/index.ts`, `schema.ts`, `rooms.ts`, `limiter.ts` | Servidor de signaling | ✓ VERIFIED | Todos presentes e substantivos (11.6–21.7 KB cada) |
| `apps/server/src/signaling/outcome.ts`, `turn.ts` | Telemetria ICE e credencial TURN | ✓ VERIFIED | Presentes; wiring real em `index.ts` confirmado por leitura |
| `apps/server/src/db/migrations.ts` | Migração `002_ice_outcome` | ✓ VERIFIED | 229 linhas, presente |
| `ops/turnserver.conf`, `ops/coturn-dropin.conf` | Config coturn versionada | ✓ VERIFIED | Presentes; `denied-peer-ip` e `MemoryMax` confirmados nos SUMMARYs e consistentes com `npm test` verde (`tests/ops-config.test.ts` incluído nos 886) |
| `tools/bench/snapshot.mjs`, `tests/snapshot-bench.test.ts` | Bench e portão de CI | ✓ VERIFIED | Executado diretamente nesta sessão, saída conferida |
| `src/net/signaling.ts`, `rtc.ts`, `ice.ts` | Cliente WebRTC real | ✓ VERIFIED | Todos presentes (17.3 KB, 17.3 KB, 13.5 KB) |
| `index.html`, `src/ui/dom.ts`, `src/ui/room.ts`, `src/render/sprites.ts` | Telas de sala/lobby/divergência | ✓ VERIFIED | `room.ts` com 916 linhas; exercitado ponta a ponta por `room.spec.ts` |
| `src/app/forge.ts`, `src/main.ts` | Manifesto da run e assento local | ✓ VERIFIED | `buildRunConfig` e `beginRun` confirmados; exercitados pelo e2e |

Nenhum artefato exigido pelos planos executados (03-01 a 03-10) está ausente, é stub ou tem
menos do que o mínimo de linhas declarado.

### Key Link Verification

| From | To | Via | Status | Details |
|---|---|---|---|---|
| `src/net/lobby.ts` | `src/net/transport.ts` | máquina de estado fala só com a interface | ✓ WIRED | Confirmado por `npm test` verde (`tests/lobby.test.ts`, 18 casos) |
| `src/ui/room.ts` | `src/net/lobby.ts` | `initRoom(deps)` assina o estado da sessão | ✓ WIRED | `tests/net/room.spec.ts` prova isso fim a fim: clique em UI → estado de rede → repintura |
| `apps/server/src/index.ts` | `apps/server/src/signaling/index.ts` | `attachSignalling(server, deps)` | ✓ WIRED | `npm run typecheck:server` 0; `npm run server:build` 0 (confirmado nos SUMMARYs, consistente com o build verde desta sessão) |
| `apps/server/src/index.ts` | `apps/server/src/signaling/outcome.ts` | `recordOutcome: outcomes.record` | ✓ WIRED | Lido diretamente em `apps/server/src/index.ts:108,148-149` — **não** é mais o no-op stub deixado pelo plano 03-04 |
| `apps/server/src/signaling/rooms.ts` | `packages/protocol/src/roomCode.ts` | `ROOM_CODE_ALPHABET` | ✓ WIRED | Confirmado pelo grep do próprio SUMMARY 03-04, consistente com `npm test` verde |
| `src/net/rtc.ts` | `src/net/transport.ts` | `RtcTransport` satisfaz `Transport` | ✓ WIRED | Confirmado pela spec e2e usando o mesmo `Transport` que o lobby já consumia de `local.ts` |
| `src/net/ice.ts` | `packages/protocol/src/enums.ts` | `ICE_ROUTE`/`ICE_CANDIDATE_TYPE` | ✓ WIRED | `tests/ice-route.test.ts`, parte dos 886 testes verdes |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|---|---|---|---|---|
| `#lobby-slots` (badge de ping/rota) | `slot.ping`, `slot.route` | `createPinger` (mediana de 5 amostras reais) + `routeOf(getStats())` sobre `RTCPeerConnection` real | Sim — confirmado por `room.spec.ts` medindo `/\d+ ms · direto/` contra uma conexão WebRTC de verdade, não um valor fixo | ✓ FLOWING |
| `ice_outcome` (linhas do SQLite) | corpo de `recordOutcome` | `outcomes.record` chamado a partir do handler real de `iceOutcome` no signaling, com sala/slot/conta resolvidos pelo socket (não pela mensagem do peer) | Sim, para a metade local — o mecanismo grava linhas reais (testado com SQLite in-memory real, não mock); o volume de dados reais de produção depende da VPS (critério 3) | ✓ FLOWING (mecanismo); dados de produção aguardam 03-11 |
| `#hud` / mundo da run | `RunConfig` → `hashWorld` do tick 0 | `buildRunConfig` monta o manifesto a partir dos ocupantes reais da sala; cada máquina roda `createWorld`+`generateArena` local e compara o hash pelo canal `reliable` | Sim — `room.spec.ts` prova que os hashes batem nos três navegadores e que a tela de divergência **não** aparece | ✓ FLOWING |

Nenhum componente identificado com props/dados vazios hardcoded no caminho de renderização.

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|---|---|---|---|
| Sala fecha entre 3 navegadores reais via loopback, com hash do tick 0 igual | `npm run test:e2e` (projeto `net`) | `1 passed` — `tests/net/room.spec.ts:94` em 36,4 s | ✓ PASS |
| Codec de snapshot produz os mesmos bytes em 3 motores | `npm run test:browser` | `12 passed` em Chromium/Firefox/WebKit | ✓ PASS |
| Bench do snapshot fica abaixo do teto e imprime uma linha | `npm run bench:snapshot` | saída de uma linha, código 0, todos os 6 números abaixo de 16384 | ✓ PASS |
| Suíte inteira (unitário + estrutural) | `npm test` | `886 passed` em 60 arquivos | ✓ PASS |
| Build de produção e do servidor | `npm run build`, `npm run typecheck:server` | ambos 0 | ✓ PASS |

### Probe Execution

Não há `scripts/*/tests/probe-*.sh` no repositório nem probes declarados nos planos desta
fase. O equivalente funcional — o bench de CI (`tools/bench/snapshot.mjs`) e o portão
(`tests/snapshot-bench.test.ts`) — foi executado diretamente e está coberto acima em
Behavioral Spot-Checks.

### Requirements Coverage

| Requirement | Source Plan(s) | Description | Status | Evidence |
|---|---|---|---|---|
| SALA-01 | 03-01, 03-04, 03-09 | Código de sala curto, sem ambiguidade | ✓ SATISFIED | `roomCode.ts` + `tests/net/room.spec.ts` (código real na tela) |
| SALA-02 | 03-03, 03-04, 03-08, 03-09, 03-10 | Até 3 jogadores entram pelo código e se veem no lobby | ✓ SATISFIED | `room.spec.ts`: 2ª e 3ª aba entram e aparecem para todos |
| SALA-03 | 03-03, 03-09, 03-10 | Cada jogador escolhe classe; quem criou inicia a run | ✓ SATISFIED | `tests/lobby.test.ts` (D3-04, ordem dos slots) + `room.spec.ts` (classe propaga, `INICIAR` funciona) |
| SALA-04 | 03-04, 03-06, 03-07, 03-08, 03-11 | Sala fecha atrás de NAT residencial, com relay quando necessário | **PARCIAL — bloqueado por infraestrutura** | Metade de código completa e testada; a prova contra NAT/CGNAT real depende da VPS (03-11, bloqueado por 02-04). Ver override |
| SALA-05 | 03-01, 03-03, 03-06, 03-08, 03-09 | Tela mostra ping/rota; desfecho ICE registrado para medir a taxa real de relay | ✓ SATISFIED | `room.spec.ts` (badge real) + `apps/server/src/index.ts` (wiring real do gravador) + `tests/server-migrate.test.ts`/`tests/turn.test.ts` |
| SYNC-04 | 03-01, 03-02, 03-05 | Snapshot cabe no limite de 16 KiB do DataChannel numa wave 16 com 4 jogadores | ✓ SATISFIED | `npm run bench:snapshot` executado nesta sessão: todas as partes abaixo do teto, com o portão de CI provado quebrando sob um teto artificialmente baixo |

**Nenhum requisito órfão.** As seis IDs declaradas em `.planning/REQUIREMENTS.md` para a fase 3
aparecem no campo `requirements:` de ao menos um plano executado, e todos os planos foram
cross-referenciados individualmente acima.

**Observação não-bloqueante:** a tabela de rastreabilidade em `.planning/REQUIREMENTS.md`
(linhas 207-212) ainda marca SALA-01..05 e SYNC-04 como "Pending" — isso é defasagem de
documentação (a tabela não foi atualizada após a execução da fase), não uma falha de código.
Recomenda-se atualizá-la na consolidação da fase.

### Anti-Patterns Found

Nenhum marcador de débito não-referenciado (`TBD`/`FIXME`/`XXX`) foi encontrado nos arquivos
modificados por esta fase — confirmado por grep direto sobre os 26 arquivos-fonte principais
(protocolo, `src/net/`, `apps/server/src/signaling/`, `src/ui/room.ts`, `ops/`). Os únicos
matches de `PLACEHOLDER` são em `ops/turnserver.conf`, intencionais e exigidos por D2-15 (o
segredo real nunca pode estar no repositório).

| File | Line | Pattern | Severity | Impact |
|---|---|---|---|---|
| `packages/protocol/src/enums.ts` | `REJECT_REASON` (5 entradas) | Ausência de `badMessage` como motivo de recusa dedicado | ℹ️ INFO | Documentado no SUMMARY 03-04 como dívida deliberada — mensagens malformadas hoje recebem `badCode`, que é semanticamente aproximado mas não incorreto ao usuário. Não bloqueia nenhum critério de sucesso; correção adiada para um commit que já mova a tabela congelada e o golden |
| `src/main.ts:225` | `VERSIONS = { protocol: PROTOCOL_VERSION, sim: 'unwired' }` | Metade `sim` do portão de versão (D-08) não recusa nada ainda | ⚠️ WARNING | Confirmado por leitura direta. Risco mitigado na prática pelo hash do tick 0 (D3-05, provado por `room.spec.ts`), que pega divergência de simulação **no lobby** — mas o gate formal por `SIM_VERSION` continua incompleto. Documentado em `deferred-items.md` com dono nomeado (o plano que tocar a cadeia de build da sim) |
| `packages/sim/src/types.ts:146` | `bossState: string` (não união) | `BOSS_STATE` pinado só por valor, sem contraparte de tipo | ℹ️ INFO | Decisão deliberada e documentada (moveria `SIM_VERSION`, fora da fronteira desta fase); não afeta nenhum critério de sucesso da fase 3 |
| `apps/server/src/signaling/turn.ts` | `DEV_STUN_DOMAIN = 'localhost'` | Vetor HMAC cross-verificado por duas ferramentas, mas nunca contra um coturn real | ℹ️ INFO (parte do item Deferred) | Faz parte do mesmo bloqueio de infraestrutura do critério 3; não é um gap adicional |

Nenhum item acima é BLOQUEADOR: nenhum impede o objetivo da fase (sala + lobby + protocolo
congelado) de ser considerado alcançado no código que existe hoje.

### Human Verification Required

Nenhum item pendente. Os dois checkpoints humanos desta fase já foram respondidos durante a
execução e estão registrados nos respectivos SUMMARYs:

- **03-04, Task 1 (legitimidade do `zod`)** — checkpoint bloqueante, resposta do usuário:
  "Aprovado" (2026-09-08), com verificação independente reconferida contra o registro npm
  antes da instalação.
- **03-09, Task 4 (conferência visual das quatro telas)** — checkpoint bloqueante, resposta do
  usuário: "Aprovado" (2026-09-08), os dez passos do `<how-to-verify>` confirmados.

Não há blocos `<verify><human-check>` deferidos dentro de tarefas `auto` nos planos 03-01 a
03-10 (busca feita neste relatório). O único checkpoint humano ainda em aberto (plano 03-11,
Task 1 — confirmar que a VPS existe) já foi apresentado ao usuário e respondido negativamente
("a caixa ainda não existe"); ele não é um item de verificação desta rodada, é o próprio
bloqueio registrado no item Deferred acima.

### Gaps Summary

Nenhum gap de código foi encontrado. Os dez planos executados (03-01 a 03-10) entregam,
verificadamente e não apenas segundo o relato dos SUMMARYs:

- o vocabulário do fio congelado (19 tabelas, `ping`/`pong`, `PROTOCOL_VERSION = '2'`);
- o codec binário do snapshot, medido abaixo do teto de 16 KiB com folga de 4,9×–11× e
  provado idêntico em quatro motores;
- a sala como máquina de estado (Node) e como conexão WebRTC real (Chromium), incluindo
  atribuição e congelamento de slots `p0..p3`, escolha de classe, início da run pela
  autoridade, e a prova do hash do tick 0 entre três navegadores reais;
- o servidor de signaling com os três guardas antes do handshake, salas em `Map`, e nunca
  tocando o banco;
- a telemetria de ICE e a credencial de TURN, com o gravador realmente ligado no servidor
  (não um stub) e sem IP de jogador em nenhuma linha;
- as quatro telas de UI, exercitadas ponta a ponta por três contextos de navegador.

O único item que não fecha é o **critério de sucesso 3 (SALA-04)** na sua metade que depende
de uma VPS real — e este relatório trata isso exatamente como o próprio `ROADMAP.md` já havia
previsto e determinado: bloqueio de infraestrutura, não falha de fase, com o plano de
fechamento (03-11) já escrito e pronto para rodar assim que a caixa (02-04) existir. Por
instrução explícita do estado de execução desta fase, nenhum plano novo de fechamento de gap é
proposto para este item.

---

_Verified: 2026-09-08T19:24:08Z_
_Verifier: Claude (gsd-verifier)_
