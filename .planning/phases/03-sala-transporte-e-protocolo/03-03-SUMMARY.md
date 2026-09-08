---
phase: 03-sala-transporte-e-protocolo
plan: 03
subsystem: net-client
tags: [transport, lobby, ping, rtt, form-12, purity-guard, in-process-testing]

# Dependency graph
requires:
  - phase: 01-marco-0
    provides: "packages/sim com Rng, RunConfig, RunPlayer, ForgeLevels e PlayerSlot; tests/scan.ts; o trio de guardas de pureza"
  - phase: 02-publicacao-e-servidor
    provides: "apps/server/src/shutdown.ts, o analog de interface estreita com deps injetadas e startWatchdog"
  - phase: 03-sala-transporte-e-protocolo
    plan: 01
    provides: "MSG_KIND com ping/pong em 8 e 9, CHANNEL_CLASS, CLASS_KEY, PLAYER_SLOT, ICE_ROUTE, REJECT_REASON, GAME_MODE"
provides:
  - "src/net/transport.ts: a interface Transport SEM broadcast, mais PeerId, Unsubscribe e Schedule"
  - "src/net/local.ts: transporte em processo com entrega por microtask, par e estrela"
  - "src/net/lossy.ts: decorator de perda/duplicação/reordenação semeado por Rng, com report()"
  - "src/net/lobby.ts: a máquina de estado da sala, dirigida por rede e não por World"
  - "src/net/ping.ts: ping/pong de 7 bytes, mediana de 5, timeout de 3 s, 'sem resposta' em 3 perdas"
  - "tests/net/helpers.ts: makePair, makeStar, withLoss, flush, fakeClock e transporte gravador"
  - "O terceiro guarda de FORM-12 (tests/net-vocabulary.test.ts) e net nos outros dois"
affects: [03-08-telemetria-ice, 03-09-tela-do-lobby, 03-10-webrtc-e-run-config, 04-netcode]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Interface estreita declarada pelo que o chamador precisa, satisfeita estruturalmente por local.ts, lossy.ts e, depois, rtc.ts"
    - "Tempo como argumento: `Schedule` injetado, nenhum timer de plataforma capturado em src/net/"
    - "Entrega assíncrona por queueMicrotask no dublê, para que o teste em processo tenha a mesma forma de execução que a rede"
    - "Injeção de falha semeada com o seed na mensagem de falha (report()), nunca com aleatoriedade não reproduzível"
    - "Guarda estreita all-or-nothing que RECONSTRÓI campo a campo em vez de deixar passar o objeto do JSON.parse"
    - "Enquadramento: byte 0 é o índice de MSG_KIND; despacho pelo kind ANTES de tocar no corpo"

key-files:
  created:
    - src/net/transport.ts
    - src/net/local.ts
    - src/net/lossy.ts
    - src/net/lobby.ts
    - src/net/ping.ts
    - tests/net/helpers.ts
    - tests/net-vocabulary.test.ts
    - tests/lobby.test.ts
    - tests/ping.test.ts
  modified:
    - tests/purity.test.ts
    - eslint.config.js

key-decisions:
  - "`Schedule` mora em transport.ts, e não em lobby.ts ou ping.ts, porque devolve `Unsubscribe` e porque declará-lo em qualquer um dos dois faria os dois se importarem por causa de um alias"
  - "`startRoom({ seed, mode })` recebe a seed como argumento, não como dep da fábrica: a seed é sorteada quando a run começa, não quando o lobby é montado"
  - "O forge de cada jogador viaja no `hello`, porque `RunPlayer.forge` é POR JOGADOR e um RunConfig montado sem ele daria a todos um forge zerado em silêncio"
  - "O atraso de lossy.ts é contado em saltos de microtask, não em milissegundos: o que um teste de rede precisa de 'atraso' é ORDEM, e ms exigiria um relógio"
  - "A mediana usa o meio BAIXO no empate em vez da média dos dois centrais — a média inventaria um número que nenhum pacote produziu"
  - "`rtt()` devolve null enquanto o estado é 'sem-resposta', para que um chamador que esqueça de olhar o estado não consiga mostrar um número velho"
  - "A recusa é idempotente por peer: o convidado se anuncia duas vezes de propósito, e uma sala cheia respondia duas vezes ao mesmo peer"
  - "A autoridade cria o pinger de um peer quando ele é ADMITIDO, não quando a conexão abre — um peer prestes a ser recusado não ganha laço de medição"

patterns-established:
  - "Teste de guarda alimentado por transporte gravador com remetente arbitrário, ao lado do teste de comportamento sobre a topologia real"
  - "O teste monta e lê o quadro à mão quando o FORMATO é o que está sendo especificado — usar o codec do módulo para verificar o módulo passa com qualquer formato consistente consigo mesmo"
  - "Paleta por máquina no teste de apresentação: uma paleta única esconderia um consumidor que derivasse a cor localmente em vez de usar a que chegou"

requirements-completed: [SALA-02, SALA-03, SALA-05]

# Metrics
duration: 29min
completed: 2026-09-08
---

# Phase 3 Plan 03: A sala como máquina de estado testável em Node Summary

**Quatro peers entram numa sala, escolhem classe, recebem `p0..p3` em ordem de entrada e um deles sai sem derrubar a sala — provado em Node em menos de um segundo, sem browser, sem servidor de signaling e sem a VPS, sobre uma interface `Transport` que deliberadamente não tem `broadcast`.**

## Performance

- **Duration:** ~29 min
- **Started:** 2026-09-08T14:08:00Z
- **Completed:** 2026-09-08T14:37:00Z
- **Tasks:** 3 de 3
- **Files modified:** 11 (9 criados, 2 editados)

## Accomplishments

- **A fase 4 já tem cabo.** `src/net/local.ts` é um `Transport` que entrega por `queueMicrotask` — nunca síncrono, e o cabeçalho explica por quê: entrega síncrona transforma um `send` dentro de um `onMessage` em recursão em vez de fila, e o teste em processo deixa de ter a mesma forma de execução que o de rede. `tests/lobby.test.ts` roda 18 casos sobre a topologia estrela real em 291 ms.
- **`Transport` não tem `broadcast`, e agora isso é um teste.** `tests/net-vocabulary.test.ts` assere a ausência contra o texto do arquivo com os comentários removidos — e, do outro lado, assere que a palavra **continua** no texto cru, porque apagar o parágrafo que explica a ausência deixaria o portão verde com o motivo da regra perdido.
- **Os três guardas de pureza agora dizem `net` independentemente**, e foi verificado empiricamente: um `packages/sim/src/__probe.ts` importando `'../../../src/net/transport'` faz o `npm run lint` sair 1, e a forma de diretório nu (`'../../../src/net'`) também — as duas formas do padrão, pelo motivo que o comentário existente já explicava. O `tests/purity.test.ts` recusa o mesmo import por conta própria, sem o ESLint.
- **A guarda do `lobbyState` é all-or-nothing e reconstrói campo a campo.** Um teste dedicado manda dois ocupantes com só o segundo inválido: um validador que aplicasse enquanto valida deixaria o primeiro entrar, que é exatamente a forma que um payload real toma. Nada que o `JSON.parse` produziu é retido — nem chave extra, nem `__proto__` próprio.
- **O número do ping é a mediana de cinco, e some em vez de mentir.** 10, 200, 12, 11, 13 dão **12** e não 49,2; um ping perdido não entra na janela como infinito; três perdas seguidas fazem `state()` virar `'sem-resposta'` e `rtt()` devolver `null`, porque um ping congelado em "10 ms" durante uma queda lê como conexão funcionando.
- **Nenhum relógio atravessa o fio.** O quadro de 7 bytes carrega `seq` e `tick`; o instante fica num `Map` local. Um carimbo no fio exigiria os dois lados concordando sobre um relógio — não concordam — e entregaria ao lado remoto um valor sobre o qual ele pode simplesmente mentir.
- **Nenhum módulo de `src/net/` captura timer de plataforma.** `grep -c 'setTimeout\|setInterval'` devolve 0 em `lobby.ts` e em `ping.ts`, comentários incluídos. Sete segundos de medição de RTT rodam em microssegundos.

## Task Commits

1. **Task 1: `Transport`, cabo em processo, decorator semeado e os três guardas** — `89bb4ff` (feat)
2. **Task 2 (RED): teste que falha para a máquina de estado do lobby** — `e21e734` (test)
3. **Task 2 (GREEN): a máquina de estado do lobby** — `3453751` (feat)
4. **Task 3 (RED): teste que falha para o ping/pong e a mediana de cinco** — `b3d99bf` (test)
5. **Task 3 (GREEN): ping/pong de 7 bytes e o resumo por slot** — `d5fc3ef` (feat)

_As tarefas 2 e 3 têm `tdd="true"`. Os dois commits RED reportam vermelho por ausência do módulo; os GREEN os deixam verdes. Não houve fase REFACTOR em nenhuma das duas — o que havia a limpar foi limpo dentro do próprio verde e está registrado em Deviations._

## Files Created/Modified

- `src/net/transport.ts` *(criado)* — `Transport`, `PeerId`, `Unsubscribe`, `Schedule`. O cabeçalho carrega FORM-12 em maiúsculas, a ausência deliberada de `broadcast`, a regra de ADR 0001 (`peerId` morre com a conexão e nunca entra no `World`) e o adiamento de `apps/web` (D3-12).
- `src/net/local.ts` *(criado)* — `createLocalNetwork`, `createLocalPair`, `createLocalStar`. Entrega por microtask, `close()` que dispara `onPeerLeave` nos parceiros, payload **copiado** no `send` (um chamador com um buffer de rascunho por tick funcionaria aqui e corromperia tudo no fio). A estrela não liga convidado com convidado — a topologia é asserida por construção.
- `src/net/lossy.ts` *(criado)* — `createLossyTransport` com `dropRate`, `duplicateRate`, `reorderRate` e `maxDelayHops`, todos com padrões nomeados e exportados. Semeado por `Rng` de `@dg2/sim`; `report()` devolve seed e contadores para a mensagem de falha. Configuração toda-zero não consome nada do gerador.
- `src/net/lobby.ts` *(criado, 721 linhas)* — `createLobby`. Autoridade: lista em ordem de entrada, teto de quatro, `roomFull`/`roomClosed`, mudança de classe, reemissão a 1 Hz, `startRoom` que fecha a sala e monta o `RunConfig`. Convidado: aplica `lobbyState` só do `authorityPeerId` anunciado, eco otimista de classe, evento de sala morta. Guardas nomeadas para `lobbyState`, `hello` e `startRun`.
- `src/net/ping.ts` *(criado)* — `createPinger`, `PING_INTERVAL_MS`, `PING_TIMEOUT_MS`, `PING_WINDOW`, `PING_LOSSES_FOR_SILENCE`, `PING_FRAME_BYTES`. O comentário obrigatório da armadilha 10 e o de `getStats()` estão no cabeçalho, ambos fora do código.
- `tests/net/helpers.ts` *(criado)* — `flush` (barreira de macrotask, com o motivo escrito: um `await` só drena uma camada), `makePair`, `makeStar`, `withLoss`, `fakeClock` (com guarda contra callback que se re-arma em 0 ms) e `recordingTransport` (entrega **síncrona**, o oposto de `local.ts`, e o cabeçalho diz quando usar cada um).
- `tests/net-vocabulary.test.ts` *(criado)* — 5 testes. Regex `FORBIDDEN` copiada verbatim, guarda anti-vacuidade, o teste que testa o detector (com `localhost` como o quase-acerto que este lado do fio produz), a ausência de `broadcast` e a lista vazia de reivindicantes do marcador de exceção. O comentário registra a sequência em que o glob cresce (03-04, 03-08, 03-09) e por que escrevê-lo hoje quebraria o próprio guarda.
- `tests/lobby.test.ts` *(criado)* — 18 testes, sendo 2 com `slots` no nome.
- `tests/ping.test.ts` *(criado)* — 10 testes, com `mediana` e `sem resposta` nos nomes.
- `tests/purity.test.ts` — `FORBIDDEN_LAYER` de `(render|ui|app)` para `(render|ui|app|net)`, com o parágrafo que registra qual direção é permitida e por que `EXPECTED_FILE_COUNT` **não** muda.
- `eslint.config.js` — `no-restricted-imports` do bloco de `packages/sim/src` ganha `'**/net/**'` **e** `'**/net'`.

## Decisions Made

- **`Schedule` mora em `transport.ts`.** O plano pedia a injeção mas não disse onde declarar o tipo. Pôr em `lobby.ts` ou em `ping.ts` faria os dois se importarem por causa de um alias de tipo — e na tarefa 3 o lobby passou a importar o pinger, o que fecharia o ciclo. Ele devolve `Unsubscribe`, então mora ao lado dele.
- **`startRoom({ seed, mode })` em vez de `seed` na fábrica.** A seed é sorteada quando a run começa, não quando o lobby é montado, e um convidado não tem seed nenhuma para passar. Com a seed como argumento, `LobbyDeps` fica igual para os dois papéis.
- **O forge viaja no `hello`.** `RunPlayer.forge` é por jogador, e o comentário do próprio tipo em `packages/sim` avisa que um valor único por run daria a todos o da autoridade em silêncio. Montar o `RunConfig` sem receber o forge de cada um seria exatamente esse bug. Validado com teto de sanidade (`MAX_FORGE_LEVEL`), documentado como teto de sanidade e não como regra da forja.
- **O atraso de `lossy.ts` é contado em saltos de microtask.** Milissegundos exigiriam um relógio, e o que um teste de rede precisa de "atraso" é ORDEM — que B possa ultrapassar A. Saltos produzem isso, não custam timer e são drenados pelo mesmo `flush()`. Registrado no cabeçalho, com a nota de que latência de parede é outro instrumento se a fase 4 precisar.
- **`local.ts.rtt()` devolve `null`, sempre.** Nada mede um link que não sai do processo, e inventar um número plausível deixaria um teste asserir uma ida e volta que nenhum código calculou. O número da tela vem do `createPinger`.
- **A mediana toma o meio baixo no empate.** Média dos dois centrais inventaria um valor que nenhum pacote produziu, e este número vai numa tela ao lado do nome de um jogador como medição. No regime permanente a janela tem cinco amostras e a questão não aparece.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Base do worktree errada e `node_modules` ausente**
- **Found during:** preparação, antes da Task 1
- **Issue:** o worktree nasceu em `3f25a68`, onde os planos da fase 3 e a saída da onda 1 não existem, e sem dependências instaladas.
- **Fix:** `git reset --hard 5edf9bf` pelo `<worktree_branch_check>` (HEAD confirmado no namespace `worktree-agent-*` antes), depois `npm ci`. **Nenhum pacote novo instalado** — T-3-SC continua válida.
- **Verification:** `test -f .planning/.../03-03-PLAN.md` e `npm ci` reportando 315 pacotes do lockfile existente.
- **Committed in:** nada — reset e `node_modules/` não entram em commit.

**2. [Rule 1 - Bug] A sala cheia respondia duas vezes ao mesmo peer**
- **Found during:** Task 2, fase GREEN
- **Issue:** o convidado se anuncia duas vezes de propósito (na construção e no evento de join), porque escolher um dos dois momentos produz um convidado que às vezes nunca aparece na sala. A autoridade respondia `roomFull` às duas, e o teste do quinto peer pegou: `['roomFull', 'roomFull']`.
- **Fix:** a recusa virou idempotente por peer — um `Set<PeerId>` de já-recusados, limpo quando a conexão daquele peer cai, para que uma tentativa genuína depois de um lugar vagar seja ouvida.
- **Files modified:** `src/net/lobby.ts`
- **Verification:** o teste passa com `['roomFull']`; a sala continua com quatro.
- **Committed in:** `3453751`

**3. [Rule 1 - Bug] O teste de D3-03 não podia provar o que dizia provar**
- **Found during:** Task 2, fase GREEN
- **Issue:** o teste usava **uma** função `colorFor` para todas as máquinas. Com uma paleta só, dois magos têm por construção a mesma cor, então a asserção "as cores diferem" era insatisfazível — e, pior, um lobby que **derivasse** a cor da classe localmente, em vez de usar a que chegou no `lobbyState`, passaria em tudo. D3-06 diz que a cor sai das settings de **cada** aparelho e viaja.
- **Fix:** `paletteFor(peerId)` dá uma paleta por máquina, e a asserção passou a ser "cada cor é a que a paleta DAQUELE peer produz". O teste ficou mais forte do que estava escrito.
- **Files modified:** `tests/lobby.test.ts`
- **Verification:** as duas cores diferem e cada uma bate com a paleta do remetente.
- **Committed in:** `3453751`

**4. [Rule 2 - Missing critical] O `startRun` recebido não era validado**
- **Found during:** Task 2
- **Issue:** a `<action>` do plano nomeia a guarda estreita para o `lobbyState` e não menciona o `startRun`. Mas o `RunConfig` que chega por ali é entregue direto ao construtor do mundo no plano 03-10, e um `{}` vindo de um par produziria uma exceção **dentro de um callback de transporte** — onde ela derruba todos os ouvintes que ainda não rodaram. Autoridade trapaceira é aceita por desenho (T-3-12); autoridade malformada não é a mesma coisa.
- **Fix:** `readRunConfig` reusa as mesmas primitivas (`isSlot`, `isName`, `isClassKey`, `isForge`) e devolve `null` em vez de lançar.
- **Files modified:** `src/net/lobby.ts`
- **Verification:** `npx tsc --noEmit` e a suíte inteira verdes; a função segue o mesmo contrato all-or-nothing das outras.
- **Committed in:** `3453751`

**5. [Rule 1 - Bug] Quadros de ping caíam no `JSON.parse` do lobby**
- **Found during:** Task 3, ao ligar o pinger ao lobby
- **Issue:** o despacho original decodificava o corpo **antes** de olhar o kind. Os quadros `ping`/`pong` são 7 bytes binários no mesmo transporte, então cada um deles entrava no `JSON.parse` e saía por um `catch` — uma vez por segundo por peer, com pilha, num caminho que roda para sempre enquanto a sala existir.
- **Fix:** `kindOf(payload)` lê o byte 0 e o despacho decide antes; `parseBody` só é chamado para os três kinds que carregam JSON.
- **Files modified:** `src/net/lobby.ts`
- **Verification:** os 18 testes do lobby e os 10 do ping seguem verdes; `npm test` com 664 testes verde.
- **Committed in:** `d5fc3ef`

---

**Total deviations:** 5 (1 × Rule 3, 3 × Rule 1, 1 × Rule 2)
**Impact on plan:** nenhuma mudança de escopo, e a lista de `files_modified` foi respeitada exatamente — `git diff --name-only` da base até HEAD lista os onze arquivos do plano e nenhum outro. `package-lock.json` não foi tocado. As nº 2, 3 e 5 são defeitos encontrados pelos próprios testes; a nº 4 fecha um buraco que o plano não nomeou mas que a fronteira de confiança do próprio `<threat_model>` implica.

## Issues Encountered

- **A ordem de entrada precisou virar um fato do teste, não um efeito colateral.** Quatro `createLobby` chamados em sequência mandam quatro `hello` na mesma leva de microtasks, e a ordem de chegada seria a ordem de envio — verdadeira, mas por acidente. O helper `join()` faz um `flush()` entre as entradas, de modo que "ANA, BIA, CID, DUL" é a ordem que o teste construiu e é ela que vira `p0..p3`.
- **`tests/scan.ts` não entende literal de expressão regular**, e é ele que remove comentários antes da auditoria FORM-12 ler `src/net/`. Um `/` abrindo um regex que contivesse `//` engoliria o resto do arquivo e a auditoria ficaria verde sobre nada. Nenhum arquivo de `src/net/` usa literal de regex, e o motivo está escrito no cabeçalho de `lobby.ts` para quem for acrescentar um.
- **Dois critérios de aceitação são `grep` sobre o texto inteiro**, comentários incluídos: `setTimeout|setInterval` tem de dar 0 em `lobby.ts` e em `ping.ts`. Isso proíbe até *mencionar* essas APIs na prosa que explica por que elas não são usadas — os cabeçalhos dizem "nenhum timer de plataforma capturado" em vez de soletrar os nomes. Mesmo tipo de tensão que o plano 03-01 encontrou em `roomCode.ts`, e resolvida do mesmo jeito: o grep de segurança prevalece.

## User Setup Required

Nenhum — este plano não toca em serviço externo, não instala pacote e não pede segredo. `dependencies: {}` do jogo continua vazio, asserido por `tests/workspaces.test.ts`.

## Next Phase Readiness

- **03-08 (telemetria ICE):** o campo `route` de `OccupantView` existe e vale `'unknown'`, que é o índice 0 da tabela congelada exatamente para isto. `refreshPings()` em `lobby.ts` é o ponto único onde a rota entra, e o comentário ali já diz que a fonte é `getStats()` e que o RTT **não** vem de lá.
- **03-09 (tela do lobby):** `lobby.state()` devolve `LobbyView` com tudo que a UI-SPEC pede por card — nome, classe, cor, slot, `connected` e `ping`. `src/net/lobby.ts` não contém `innerHTML` e não vai conter: a pintura por `textContent` é contrato daquele plano, e o cabeçalho deste arquivo diz por quê.
- **03-10 (WebRTC e RunConfig):** `rtc.ts` só precisa satisfazer `Transport` estruturalmente; `createLobby` não muda uma linha. `startRoom({ seed, mode })` já devolve o `RunConfig` na ordem canônica e emite `startRun` validado do outro lado.
- **Fase 4:** `lossy.ts` está pronto para quebrar o cabo de forma reproduzível quando o codec de snapshot for testado sob perda, e `Schedule` já é o vocabulário de tempo da camada inteira.
- **Dívida registrada:** o glob de `tests/net-vocabulary.test.ts` precisa crescer para `apps/server/src/signaling/**` no plano 03-04, **no mesmo commit** que criar o diretório — escrevê-lo antes deixaria o guarda anti-vacuidade vermelho, e é assim que ele deve se comportar.

## Known Stubs

| Stub | Arquivo | Motivo e quem resolve |
|---|---|---|
| `route` sempre `'unknown'` no `lobbyState` | `src/net/lobby.ts`, `refreshPings()` | Intencional e previsto pelo plano ("a rota ainda é `'unknown'` nesta onda"). A fonte é `getStats()` do `RTCPeerConnection`, que não existe até o plano 03-10 criar a conexão; **quem preenche é o plano 03-08**. O valor não é um placeholder arbitrário: `'unknown'` é o índice 0 da tabela congelada, escolhido para que dado ausente nunca decodifique como `direct` e enviese a medição para baixo. |
| `rtt()` de `local.ts` devolve `null` | `src/net/local.ts` | Não é stub e sim a resposta correta: nada mede um link que não sai do processo. O número da tela vem de `createPinger`. Documentado no próprio método. |

Nenhum outro. Todo símbolo exportado por este plano tem implementação e teste.

## Threat Flags

Nenhuma superfície nova fora do `<threat_model>` do plano. As quatro mitigações atribuídas a este plano estão implementadas e testadas:

| Ameaça | Onde | Prova |
|---|---|---|
| T-3-07 (`lobbyState` forjado) | `readLobbyState` + `readOccupant` | 5 testes: remetente errado, `authorityPeerId` divergente, `cls` fora da tabela, nome acima de 24 pontos de código, cor fora de 0..255, e o caso de aplicação parcial |
| T-3-07b (autoridade derivada do slot) | `readLobbyState`, primeira linha | A autoridade é o `authorityPeerId` explícito; teste dedicado com corpo que se declara de outra autoridade |
| T-3-14 (XSS armazenado por nome) | `src/net/lobby.ts` inteiro | `grep -c innerHTML` devolve 0; o módulo não constrói markup e o cabeçalho registra por quê |
| T-3-15 (convidado derrubando a sala) | `onPeerLeave` da autoridade | Teste dedicado: um convidado sai, os outros três seguem no lobby e ninguém recebe sala morta |
| T-3-SC (instalação de pacotes) | — | Nenhum pacote instalado; `package-lock.json` não aparece no diff |

## Self-Check: PASSED

- **Arquivos criados, conferidos no disco:** `src/net/transport.ts`, `src/net/local.ts`, `src/net/lossy.ts`, `src/net/lobby.ts`, `src/net/ping.ts`, `tests/net/helpers.ts`, `tests/net-vocabulary.test.ts`, `tests/lobby.test.ts`, `tests/ping.test.ts` — todos presentes.
- **Commits conferidos em `git log`:** `89bb4ff`, `e21e734`, `3453751`, `b3d99bf`, `d5fc3ef` — todos presentes.
- **Portões do plano:** `npm run lint` 0 · `npm test` 0 (664 testes, 49 arquivos) · `npx tsc --noEmit` 0 · `npx vitest run tests/purity.test.ts tests/net-vocabulary.test.ts tests/lint-coverage.test.ts tests/workspaces.test.ts` 0 (17 testes).
- **Critérios de aceitação medidos:** `broadcast` em 2 linhas de `transport.ts` e 0 fora de comentário · `queueMicrotask` 4× em `local.ts` · `Math.random` 0 e `Rng` 3× em `lossy.ts` · `'**/net/**'` e `'**/net'` no `eslint.config.js` · `(render|ui|app|net)` no `purity.test.ts` · `world` fora de comentário 0 em `lobby.ts` · `innerHTML` 0 · `setTimeout|setInterval` 0 em `lobby.ts` e em `ping.ts` · `websocket` 2× e `getStats` 2× em `ping.ts`, ambos só em comentário · `vitest run tests/lobby.test.ts -t slots` 0 com 2 testes.
- **Portão de lint provado empiricamente:** `packages/sim/src/__probe.ts` com `from '../../../src/net/transport'` faz o lint sair 1; com `from '../../../src/net'` também; o `purity.test.ts` recusa o mesmo import por conta própria. O arquivo foi apagado em seguida e a árvore está limpa.
- **Fronteira respeitada:** `git diff --name-only 5edf9bf HEAD` lista exatamente os onze arquivos de `files_modified` · nenhum arquivo apagado (`--diff-filter=D` vazio) · `STATE.md` e `ROADMAP.md` intocados, como a execução em worktree exige.

---
*Phase: 03-sala-transporte-e-protocolo*
*Completed: 2026-09-08*
