---
phase: 03-sala-transporte-e-protocolo
plan: 08
subsystem: net-client
tags: [websocket, webrtc, perfect-negotiation, datachannel, ice, getstats, telemetria, form-12, teste-estrutural]

# Dependency graph
requires:
  - phase: 03-sala-transporte-e-protocolo
    plan: 01
    provides: "SIGNAL_KIND, ICE_ROUTE, ICE_CANDIDATE_TYPE, REJECT_REASON, normalizeRoomCode, PROTOCOL_VERSION, os tipos de signaling.ts com authorityPeerId explícito e IceOutcome sem endereço"
  - phase: 03-sala-transporte-e-protocolo
    plan: 02
    provides: "SNAPSHOT_MAX_BYTES, o orçamento contra o qual o limite negociado pelo SCTP é comparado"
  - phase: 03-sala-transporte-e-protocolo
    plan: 03
    provides: "A interface Transport (sem broadcast), Schedule, Unsubscribe, local.ts como comportamento de referência, tests/net/helpers.ts e o guarda tests/net-vocabulary.test.ts"
  - phase: 03-sala-transporte-e-protocolo
    plan: 04
    provides: "O outro lado exato da conversa: o schema zod por mensagem com os tetos de texto, o relay opaco e o caminho /ws"
  - phase: 02-publicacao-e-servidor
    provides: "apps/server/src/shutdown.ts — o molde de deps injetadas (startWatchdog) que este plano aplica três vezes"
provides:
  - "src/net/signaling.ts: cliente do WebSocket de signaling com a abertura do socket injetada, recusa local de código inválido e reabertura com backoff"
  - "src/net/rtc.ts: perfect negotiation com o papel fixado, os dois DataChannels sobre uma associação SCTP, e um Transport sobre WebRTC"
  - "src/net/ice.ts: routeOf a partir das estatísticas da conexão, buildOutcome (inclusive a linha de falha) e a flag de relay ligável por link"
  - "tests/rtc-shape.test.ts: o teste estrutural que impede a simplificação das opções dos dois canais"
  - "A lista literal de arquivos exemptos de FORM-12 no lado do cliente, com exatamente ice.ts"
affects: [03-09-tela-do-lobby, 03-10-webrtc-e-run-config, 04-netcode, 05-reconexao]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Capacidade de plataforma como argumento: open(url), createConnection(config), storage e replaceUrl — três injeções pelo mesmo motivo que startWatchdog em shutdown.ts"
    - "Teste ESTRUTURAL sobre o texto do arquivo quando a API não existe no runner, com guarda anti-vacuidade por comprimento em dois níveis e filtro de comentários antes de assertar"
    - "Papel fixado e não negociado: quem criou a sala é o lado impolido, todo convidado é o polido — um booleano decide quem abre canal E quem cede na colisão"
    - "Perífrase deliberada quando o critério de aceitação é um grep: o comentário explica a opção proibida sem soletrar o nome que o grep procura"
    - "Exceção de vocabulário com três fechaduras (marcador por linha, lista literal de arquivos, citação obrigatória da RFC) em vez de regex mais larga"

key-files:
  created:
    - src/net/signaling.ts
    - src/net/rtc.ts
    - src/net/ice.ts
    - tests/net-signaling.test.ts
    - tests/rtc-shape.test.ts
    - tests/ice-route.test.ts
  modified:
    - tests/net-vocabulary.test.ts

key-decisions:
  - "`create`/`join` recebem uma `Identity` (accountId, name, versions) e não só `versions`: o schema do plano 03-04 exige os três, e uma mensagem sem eles é recusada na porta antes de chegar ao roteamento"
  - "A recusa de versão carrega `ours` ESTRUTURALMENTE e repassa `detail` verbatim: este lado conhece com certeza o par que enviou, e `theirs` chega no campo que D-08 reserva para a tela — extrair `theirs` do texto seria ramificar em prosa escrita para um humano"
  - "`readRelayFlag` recebe a URL INTEIRA e não só a parte de consulta, para que remover `ice=relay` preserve o `?sala=` de que o link de convite depende (D3-07)"
  - "`RtcTransport` multiplexa N pernas sob UM `Transport`, porque é essa a forma que `createLocalStar` já tem e é o que faz a troca ser de construtor e não de chamador"
  - "A promessa de entrada é REJEITADA quando o socket cai, em vez de ficar pendente: uma tela de 'criando sala…' que espera para sempre é a forma de travamento mais cara de diagnosticar, porque não há erro em lugar nenhum"
  - "`onPeerJoin` só dispara quando os DOIS canais estão abertos: com um só, o primeiro `ping` iria para um canal inexistente e o número da tela começaria com uma perda"
  - "Quando `result` é `failed`, `buildOutcome` força `route: 'unknown'` e preserva os tipos de candidato do último par: uma tentativa não pode virar sucesso, mas o par tentado é a única pista de por que falhou"
  - "`isSameNetwork` é a única razão pela qual o nome do tipo de candidato do RFC 8445 aparece em src/net/ — e ela existe porque uma bateria de testes feita numa LAN produziria uma taxa de conexão direta perfeita e sem valor preditivo"

patterns-established:
  - "Sonda descartável para provar assinabilidade estrutural: um arquivo de duas linhas em src/net/ que atribui o objeto real (WebSocket, RTCPeerConnection) à interface estreita, rodado sob tsc e apagado em seguida"
  - "Probe de guarda: plantar a violação (identificador proibido + linha marcada em arquivo fora da lista) e conferir que os TRÊS testes de exceção falham, cada um nomeando a fechadura que cedeu"

requirements-completed: [SALA-02, SALA-04, SALA-05]

# Metrics
duration: 25min
completed: 2026-09-08
---

# Phase 3 Plan 08: O cabo de verdade — signaling, WebRTC e a rota Summary

**O `Transport` que o lobby já usa agora tem uma implementação sobre WebRTC: perfect negotiation com a autoridade fixada como lado impolido, dois DataChannels com opções opostas sobre uma associação SCTP, e a rota lida das estatísticas da conexão sem que um único IP de jogador seja tocado — tudo provado em Node, sem navegador, sem socket e sem instalar um pacote.**

## Performance

- **Duration:** ~25 min
- **Started:** 2026-09-08T12:47:00Z
- **Completed:** 2026-09-08T13:12:00Z
- **Tasks:** 3 de 3
- **Files:** 7 (6 criados, 1 editado) — 1.145 linhas de fonte, 708 de teste

## Accomplishments

- **O protocolo inteiro do signaling roda em Node sem abrir um socket.** `open(url)` é dependência, no molde literal de `startWatchdog` em `shutdown.ts`, e é isso que permite exercitar as doze mensagens, a recusa local de código, a rejeição da promessa pendente e a reabertura com backoff em 11 milissegundos. `grep -c "new WebSocket"` devolve 0 no módulo, que é o critério de aceitação — e uma sonda descartável provou que o chamador do navegador entrega `url => new WebSocket(url)` **sem cast**, porque `SocketLike` foi escrita com as formas de evento do DOM de propósito.
- **Um código malformado nunca sai da máquina.** `join` chama `normalizeRoomCode` antes de qualquer coisa e recusa localmente com a frase da UI-SPEC. As duas economias são concretas e estão escritas ao lado do código: uma ida ao servidor, e uma ficha do balde de rate limit que é o que torna seis caracteres suficientes (T-3-01) — um erro de digitação não deve consumir a mesma cota que uma varredura.
- **Reconectar o WebSocket não é reconectar a sala, e isso está em maiúsculas no cabeçalho.** D3-11 mantém o socket vivo durante a partida como gancho; a reconexão de sessão (ICE restart, voltar ao slot) é TEMP-04, fase 5. Sem o parágrafo, a presença de um laço de retentativa leria como "a fase 5 já funciona", e o sintoma seria uma sala que esquece quem eram seus jogadores.
- **As opções dos dois canais viraram um teste que não depende de navegador.** `tests/rtc-shape.test.ts` lê o texto de `rtc.ts` e assere: exatamente uma criação de cada canal, `ordered: true` na mesma expressão do `ctl`, `maxRetransmits: 0` na mesma expressão do `rt`, a opção irmã de tempo de vida ausente do arquivo **inteiro** (texto cru, comentários incluídos), bundle máximo presente uma vez, o manipulador do lado do convidado presente, e `'relay'` aparecendo em **uma** linha, casando um regex que exige a forma condicional. O cabeçalho diz, com ênfase, que ele não é um teste de comportamento — a prova de comportamento é a spec de Playwright do plano 03-10.
- **`'relay'` não pode virar incondicional sem quebrar o portão.** O teste conta as linhas com o literal (`toBe(1)`) e casa `/iceTransportPolicy:\s*\S+\s*\?\s*'relay'\s*:\s*'all'/`. Um valor fixo forçaria todo jogador pelo relay — mais latência, mais banda paga na VPS, e o caminho direto nunca exercitado, com nada na tela dizendo que foi de propósito.
- **A rota aceita as duas grafias de "este par venceu", e ainda dá precedência ao motor.** A ordem é: o par que o relatório de transporte apontou, depois `state === 'succeeded'`, depois a marca de par nomeado. Depender de um valor só é o modo de falha em que toda linha da tabela vira `unknown` — nada quebra, nada lança, e a medição simplesmente deixa de existir.
- **Dado ausente nunca lê como conexão direta.** `direct` exige as **duas** pontas conhecidas; uma ponta ilegível devolve `unknown`. O viés de um erro aqui iria para baixo — a direção tranquilizadora, que é a que ninguém investiga.
- **Nenhum IP de jogador é lido, e o teste prova sobre relatórios que os trazem.** Os pares sintéticos carregam endereço e porta de propósito: sem isso, a asserção de ausência passaria por vacuidade. `Object.keys` do resultado é exatamente `['local','protocol','relayProtocol','remote','route']`, e o grep de aceitação sobre linhas não-comentadas devolve 0 (T-3-09, D3-14).
- **A metade que quase ninguém escreve foi escrita: a linha de falha.** `buildOutcome` com `result: 'failed'` força `route: 'unknown'` e preserva os tipos do último par tentado. Sem ela a tabela mede só os sucessos e a taxa de necessidade de relay fica errada para cima — que é o número inteiro pelo qual D3-14 existe.
- **A flag de relay é ligável por um link num celular, persiste, some da URL e o `?sala=` sobrevive.** As três alternativas estão descartadas por escrito no cabeçalho, cada uma com o ponto concreto onde falha. E está escrito que o badge é a parte **não negociável**, com o motivo: sem sinal visível, alguém liga, esquece, reporta "o jogo está com lag", e o diagnóstico custa mais do que a flag economizou.
- **A exceção de FORM-12 chegou ao lado do cliente com três fechaduras, e o probe empírico mostrou as três cedendo em separado.** Plantando `const hostName = 1; // FORM-12-EXEMPT: RFC 8445` mais um uso não marcado em `ping.ts`, os três testes falham nomeando o que cedeu: o identificador não marcado é pego pela auditoria principal, o arquivo fora da lista é pego pela lista literal, e a contagem de linhas marcadas denuncia a segunda. O arquivo foi restaurado e a árvore ficou limpa.

## Task Commits

| Tarefa | Commit | Tipo |
|---|---|---|
| Task 1 (RED): teste que falha para o cliente do signaling | `ea914eb` | test |
| Task 1 (GREEN): cliente do WebSocket com o socket injetado | `73b008d` | feat |
| Task 2: perfect negotiation, os dois canais e o Transport sobre WebRTC | `e02ca70` | feat |
| Task 3 (RED): teste que falha para a rota, o desfecho e a flag | `f4a686e` | test |
| Task 3 (GREEN): `ice.ts` e a lista literal de exemptos | `a8d3ee9` | feat |

As tarefas 1 e 3 têm `tdd="true"`; os dois commits RED reportam vermelho por ausência do módulo. A tarefa 2 não é TDD por construção — seu teste é estrutural e só existe depois do texto que ele lê. Não houve fase REFACTOR em nenhuma das duas TDD: o que havia a limpar foi limpo dentro do próprio verde.

## Files Created/Modified

- `src/net/signaling.ts` *(criado, 444 linhas)* — `createSignalingClient({ url, open, log, now, schedule })`. `create`, `join`, `send`, `onSignal`, `onDisconnected`, `close`. Fila de saída drenada no handshake, `kind` conferido contra `SIGNAL_KIND` antes de qualquer despacho, `JSON.parse` embrulhado, backoff exponencial com teto e com reset por conexão estável. `SignalRefused` carrega `reason` (tabela congelada, ramificável), `detail` (tela, nunca condição) e `ours`.
- `src/net/rtc.ts` *(criado, 395 linhas)* — `createRtcTransport(deps)` devolvendo `RtcTransport extends Transport`. Perfect negotiation da MDN com `makingOffer`/`ignoreOffer`/`settingRemoteAnswer` e `setLocalDescription()` sem argumento; `polite = !authority`; `ctl` e `rt` criados só pela autoridade e recebidos pelo convidado por rótulo; bundle máximo; `binaryType` forçado a buffer; `connectionState === 'failed'` avisa **só** aquela perna (D3-08); o limite negociado pela associação é lido e comparado ao orçamento de 16 KiB.
- `src/net/ice.ts` *(criado, 306 linhas)* — `routeOf`, `isSameNetwork`, `buildOutcome`, `readRelayFlag`, `clearRelayFlag`, mais `RELAY_FLAG_KEY`/`RELAY_FLAG_PARAM`/`RELAY_FLAG_VALUE`. Cabeçalho separando as duas fontes com ênfase (as estatísticas **não** são a fonte do ping; **são** a única fonte da rota) e registrando que "copiar link" monta o link do código da sala, nunca do endereço atual do navegador.
- `tests/net-signaling.test.ts` *(criado)* — 11 testes sobre um socket duplo deliberadamente burro, que não conhece o protocolo e não responde sozinho.
- `tests/rtc-shape.test.ts` *(criado)* — 9 testes estruturais, molde de `ops-config.test.ts`, com dois pisos de anti-vacuidade (texto cru e texto sem comentários).
- `tests/ice-route.test.ts` *(criado)* — 15 testes sobre relatórios sintéticos do W3C, com endereço e porta presentes nos relatórios de propósito.
- `tests/net-vocabulary.test.ts` — a auditoria principal passou a remover as linhas marcadas do texto CRU antes do `scan` (a mesma técnica e o mesmo comentário do irmão do protocolo), a lista literal `EXEMPT_FILES` nasceu com `['ice.ts']`, a citação obrigatória virou um teste próprio com anti-vacuidade `toBe(1)`, e um teste novo assere que o glob cobre os três fontes desta onda pelo nome.

## Decisions Made

- **`Identity` em vez de só `versions`.** O plano escreve `create(versions)` e `join(code, versions)`. O schema do plano 03-04 exige `accountId` e `name` nas duas mensagens, e uma `create` sem eles é recusada na porta — a assinatura do plano produziria um cliente que nunca cria sala nenhuma. `Identity = { accountId, name, versions }` mantém `versions` no ponto de chamada, como a prosa do plano enfatiza, e deixa `SignalingDeps` exatamente com as quatro dependências que o plano lista.
- **A recusa de versão: `ours` estrutural, `theirs` no `detail`.** `SignalError` tem `reason` e `detail` e nada mais; não existe campo estruturado para a versão do outro lado, e o plano 03-04 já registrou como dívida que `REJECT_REASON` não tem entrada para "não entendi". Então este lado entrega o que sabe com certeza — o par que acabou de enviar — e repassa `detail` **verbatim**, que é onde o lado que tem os dois números compõe a frase. Parsear `detail` para extrair `theirs` seria ramificar em texto escrito para um humano, exatamente o que D-08 proíbe.
- **A URL inteira, e não a parte de consulta.** O plano nomeia `readRelayFlag({ search, ... })`. Reconstruir o endereço a partir de um pedaço arrastaria junto o `?sala=` de que o link de convite depende (D3-07), e o sintoma seria "o link parou de abrir a sala" aparecendo semanas depois de alguém ligar a flag uma vez. Com a URL inteira, a remoção é cirúrgica e o teste assere as duas metades: `ice=relay` some, `sala=ABC123` fica.
- **`RtcTransport` cobre a estrela inteira, não uma perna.** `createLocalStar` já entrega à autoridade **um** `Transport` que fala com os três convidados, e é contra essa forma que o lobby foi escrito. Uma fábrica por perna obrigaria alguém a escrever um multiplexador em 03-10, e a promessa de "troca de construtor" deixaria de ser literal. As três funções que passam do `Transport` (`connect`, `accept`, `connectionOf`) são a costura com o signaling e com a telemetria e não aparecem acima desta camada.
- **`onPeerJoin` espera os dois canais.** Anunciar a entrada com só o confiável aberto faria o pinger mandar o primeiro quadro para um canal inexistente, e o número da tela começaria com uma perda contabilizada.
- **`isSameNetwork` é a exceção de FORM-12, e ela tem trabalho.** O plano exige exatamente uma linha marcada; a alternativa seria uma constante artificial só para hospedar o marcador. Dois jogadores na mesma casa produzem um par de interface local e uma taxa de conexão direta perfeita — sem valor preditivo, e indistinguível na tabela de uma travessia de NAT real. Separar esses casos é o que faz a medição de D3-14 significar alguma coisa, e é a única razão pela qual o nome do RFC 8445 aparece em `src/net/`.
- **O candidato nulo não é encaminhado.** O fim da coleta de candidatos chega como um candidato ausente; relayá-lo faria o servidor recusar um corpo pelo schema, e a recusa apareceria no log como um erro sem causa aparente.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Bloqueio] Base do worktree errada e `node_modules` ausente**
- **Encontrado em:** preparação, antes da Task 1
- **Problema:** o worktree nasceu em `3f25a68`, onde os planos da fase 3 e a saída das ondas 1–3 não existem, e sem dependências instaladas.
- **Correção:** `git reset --hard 8600423` pelo `<worktree_branch_check>` (HEAD confirmado no namespace `worktree-agent-*` antes, como o passo 0 exige), depois `npm ci`. **Nenhum pacote novo instalado** — T-3-SC continua válida e `package-lock.json` não aparece no diff.
- **Verificação:** `test -f .../03-08-PLAN.md` verde; `npm ci` saiu 0 a partir do lockfile existente.
- **Committed in:** nada — reset e `node_modules/` não entram em commit.

**2. [Rule 3 - Bloqueio] A assinatura de `create`/`join` do plano não passa pelo schema do servidor**
- **Encontrado em:** Task 1, ao conferir `apps/server/src/signaling/schema.ts`
- **Problema:** `create(versions)` produziria `{ kind: 'create', versions }`, e `Create` exige `accountId` e `name`. A mensagem seria recusada por `parseSignal` antes de chegar ao roteamento — o cliente nunca criaria uma sala.
- **Correção:** `Identity = { accountId, name, versions }` como argumento de `create` e segundo argumento de `join`. As quatro deps que o plano lista (`open`, `log`, `now`, `schedule`) ficaram intactas, mais a `url`, que `open(url)` implica.
- **Files modified:** `src/net/signaling.ts`
- **Verificação:** o teste assere o corpo exato que sai (`{ kind, accountId, name, versions }`), que é o que o schema aceita.
- **Committed in:** `73b008d`

**3. [Rule 3 - Bloqueio] `readRelayFlag` precisa da URL inteira para não quebrar o link de convite**
- **Encontrado em:** Task 3
- **Problema:** com só a parte de consulta, remover `ice=relay` e reconstruir o endereço perderia o `?sala=` — que é o parâmetro de que o link de convite depende (D3-07).
- **Correção:** a dep passou a ser `url` (o endereço completo) e a remoção usa o parser de URL padrão, disponível nos dois ambientes e sem efeito nenhum.
- **Files modified:** `src/net/ice.ts`, `tests/ice-route.test.ts`
- **Verificação:** teste dedicado assere que `ice=relay` some **e** que `sala=ABC123` fica.
- **Committed in:** `a8d3ee9`

**4. [Rule 2 - Missing critical] A promessa de entrada ficava pendente para sempre quando o socket caía**
- **Encontrado em:** Task 1
- **Problema:** o `<behavior>` do plano nomeia o `onDisconnected` e a reabertura, mas não diz o que acontece com uma `create`/`join` em curso. Sem tratamento, ela nunca resolve nem rejeita: a tela de "criando sala…" gira para sempre, sem erro em lugar nenhum e sem nada no log — a forma de travamento mais cara de diagnosticar.
- **Correção:** a queda rejeita a promessa pendente com `roomClosed` e o motivo escrito; `close()` faz o mesmo.
- **Files modified:** `src/net/signaling.ts`
- **Verificação:** teste dedicado (`a promessa pendente é rejeitada quando o socket cai`).
- **Committed in:** `73b008d`

**5. [Rule 2 - Missing critical] O envelope de entrada não era conferido**
- **Encontrado em:** Task 1
- **Problema:** o plano diz — corretamente — que o cliente **não valida SDP**. Mas `created`/`joined` são os únicos corpos cujos campos este módulo LÊ, e um deles truncado entregaria `undefined` como `authorityPeerId` ao lobby, que decide com base nele quem pode emitir `lobbyState` (T-3-31).
- **Correção:** `readEntry` confere os quatro identificadores como texto e a presença de `ice`/`turn`, e devolve `null` em vez de lançar; a promessa é rejeitada com o motivo logado. SDP e candidato continuam intocados.
- **Files modified:** `src/net/signaling.ts`
- **Verificação:** `npx tsc --noEmit` e os 11 testes verdes; o corpo do relay atravessa o módulo sem ser lido, asserido por igualdade profunda.
- **Committed in:** `73b008d`

### Interpretações registradas

**6. "A recusa por `protocolVersion` chega com os dois valores"** — implementada como `ours` estrutural mais `detail` repassado verbatim, pelo motivo em *Decisions Made*. Não há campo estruturado para `theirs` no `SignalError` da tabela congelada, e inventar um exigiria mover `packages/protocol`, que é território do plano 03-01. A dívida é a mesma que o plano 03-04 já registrou em *Known Gaps* sobre `REJECT_REASON` sem entrada para "não entendi a mensagem": quando aquele commit acontecer, um campo estruturado de versão cabe no mesmo movimento.

**7. `isSameNetwork` não estava no plano.** Ela existe porque o plano exige exatamente uma linha com `FORM-12-EXEMPT` em `ice.ts` e nenhuma das três responsabilidades nomeadas compara com o tipo de candidato de interface local. A alternativa seria uma constante artificial hospedando o marcador; esta é uma função exportada, testada, com um motivo de produto escrito. O plano 03-09 a consome ao decidir o texto do badge.

---

**Total deviations:** 5 auto-corrigidas (3 × Rule 3, 2 × Rule 2) + 2 interpretações registradas.
**Impacto no plano:** nenhuma mudança de escopo. `git diff --name-only` da base até HEAD lista exatamente os sete arquivos de `files_modified` e nenhum outro; nenhum arquivo apagado (`--diff-filter=D` vazio); `package-lock.json` intocado; `apps/server/**` intocado, como a execução em paralelo com o plano 03-06 exige.

## Issues Encountered

- **Três critérios de aceitação são greps sobre o texto INTEIRO, comentários incluídos**, e um deles proíbe mencionar a própria coisa que o plano manda explicar: `maxPacketLifeTime` tem de dar 0 em `rtc.ts`, e a `<action>` pede que os dois motivos das opções mutuamente exclusivas estejam escritos. Resolvido do jeito que `roomCode.ts` e `rooms.ts` já resolveram a mesma tensão: a prosa descreve a opção sem soletrar o nome ("a opção irmã, a de tempo de vida"), e diz que a perífrase existe por causa do grep. O mesmo vale para `bundlePolicy: 'max-bundle'` (exatamente uma ocorrência) e `iceTransportPolicy: 'relay'` (zero).
- **`scan` apaga comentários de bloco INTEIROS, quebras de linha incluídas.** Isso importa para `rtc-shape.test.ts`, que assere por linha: um comentário de bloco no meio de uma linha de código juntaria dois trechos numa linha só da saída. Nenhum comentário inline de bloco foi usado em `rtc.ts`, e a asserção de "uma linha só com `'relay'`" depende disso.
- **Assinabilidade estrutural do DOM não é óbvia e foi medida, não assumida.** Duas sondas descartáveis de duas linhas em `src/net/`, rodadas sob `tsc` e apagadas: `(url) => new WebSocket(url)` satisfaz `SocketLike` sem cast, e `RTCPeerConnection` satisfaz `StatsSource` sem cast. As formas dos eventos em `SocketLike` foram escolhidas por causa da primeira — parâmetros mais largos teriam quebrado a contravariância e obrigado o chamador do navegador a um cast, que é exatamente o tipo de ruído que faz alguém abandonar a interface estreita.
- **O runner de Node não tem `CloseEvent`.** Os eventos do duplo são objetos vazios com asserção de tipo, e o comentário diz por quê: o módulo lê **um** campo de **um** evento (`data`), e fabricar os outros custaria uma dependência de plataforma para carregar zero informação.

## User Setup Required

Nenhum. Este plano não instala pacote, não toca serviço externo e não pede segredo. `dependencies` do jogo continua `{}`, conferido no fim (`node -p …` imprime `{}`) e asserido por `tests/workspaces.test.ts`. `npm run build` sai 0 com os três módulos novos na árvore de importação disponível.

## Known Gaps

**O `route` do `lobbyState` continua `'unknown'`, e este plano não podia mudá-lo.** O plano 03-03 registrou em *Known Stubs* que "quem preenche é o plano 03-08", e este plano entrega a **fonte** (`routeOf`) — mas `src/net/lobby.ts` **não está em `files_modified`** deste plano, e a fiação em `refreshPings()` precisa de uma `RTCPeerConnection` viva, que só existe quando o plano 03-10 constrói a sala de verdade. A separação é do planejador e está correta: `routeOf` é testável hoje sobre relatórios sintéticos, a fiação não é testável hoje de forma nenhuma. **Quem fecha o stub é o plano 03-10**, chamando `routeOf(transport.connectionOf(peer))` dentro de `refreshPings()`.

**Sem entrada de `REJECT_REASON` para "não entendi a mensagem", e sem campo estruturado para a versão do outro lado.** Herdado do plano 03-04 e registrado de novo porque este plano é o consumidor: uma recusa por versão entrega `ours` estruturalmente e depende do `detail` para o resto. Os dois cabem no mesmo commit futuro, o que já estiver movendo a tabela congelada e o golden de `tests/snapshots/protocol-enums.json`.

## Known Stubs

Nenhum introduzido por este plano. Todo símbolo exportado tem implementação e teste; nenhum valor codificado flui para a tela; nenhum componente ficou sem fonte de dados dentro da fronteira deste plano. O único valor fixo é o `null` de `rtt()` em `rtc.ts`, e ele não é stub e sim a resposta correta — pelo mesmo motivo documentado em `local.ts`: o número da tela vem de `createPinger` (D3-13), e devolver aqui a medição das estatísticas mostraria ao jogador uma quantidade que não é a latência do jogo.

## Threat Flags

Nenhuma superfície nova fora do `<threat_model>` do plano. As sete mitigações atribuídas estão implementadas:

| Ameaça | Onde | Prova |
|---|---|---|
| T-3-09 (IP na telemetria) | `routeOf`, `buildOutcome` | `Object.keys` do resultado é exatamente cinco chaves; teste com relatórios que TRAZEM endereço e porta; grep de aceitação sobre linhas não-comentadas devolve 0 |
| T-3-29 (flag ligada por acidente) | `readRelayFlag` | Nunca ligada por padrão (teste dedicado); a query some da URL com `?sala=` preservado; só o valor nomeado liga; o cabeçalho registra que "copiar link" monta do código da sala |
| T-3-30 (SDP malformado) | `src/net/signaling.ts` | O corpo do relay atravessa o cliente sem ser lido, asserido por igualdade profunda com um "SDP" que nenhum parser aceitaria |
| T-3-15 (convidado derrubando a sala) | `rtc.ts`, `onconnectionstatechange` | `failed` chama `fireLeave` **daquela** perna e não toca em mais nada (D3-08) |
| T-3-08b (mensagem acima do negociado) | `reportNegotiatedLimit` | O limite da associação é lido quando a perna abre e vai para o log quando fica abaixo de `SNAPSHOT_MAX_BYTES` |
| T-3-31 (peer se dizendo autoridade) | `readEntry` | `authorityPeerId` vem do envelope do servidor, é conferido como texto e nunca derivado do slot; o comentário registra a regra ao lado do campo |
| T-3-SC (biblioteca de WebRTC/WebSocket) | — | Nenhum pacote instalado; `package-lock.json` fora do diff; `dependencies` do jogo `{}`; `npm run build` verde |

## Verification

| Portão | Resultado |
|---|---|
| `npm run lint` | 0 |
| `npm test` | 0 — **809 testes em 57 arquivos** |
| `npx tsc --noEmit` | 0 |
| `npm run build` | 0 — `dist/` gerado, `dependencies` intacto |
| `npx vitest run tests/net-signaling.test.ts` | 0 — 11 testes (mínimo do plano: 7) |
| `npx vitest run tests/rtc-shape.test.ts` | 0 — 9 testes (mínimo do plano: 7) |
| `npx vitest run tests/ice-route.test.ts` | 0 — 15 testes (mínimo do plano: 11) |
| `npx vitest run tests/net-vocabulary.test.ts` | 0 — 8 testes, incluindo `a lista de arquivos exemptos é exatamente ['ice.ts']` |
| `tests/protocol-vocabulary.test.ts tests/workspaces.test.ts tests/purity.test.ts` | 0 |
| `node -p "…dependencies"` | `{}` |

Critérios de aceitação medidos, um a um: `new WebSocket` 0 · `normalizeRoomCode` 3 · `fase 5\|TEMP-04` 1 · `createDataChannel` 2 · `maxPacketLifeTime` 0 · `bundlePolicy: 'max-bundle'` 1 · `ondatachannel` 2 · `iceTransportPolicy: 'relay'` 0 · `broadcast` fora de comentário 0 · `FORM-12-EXEMPT` 1 (com `RFC 8445` na mesma linha) · `\.address|\.port\b` fora de comentário e da linha marcada 0 · armazenamento global do navegador 0 · `dg2.ice` 1 · endereço atual do navegador 0.

## Next Phase Readiness

- **03-09 (tela do lobby):** `readRelayFlag`/`clearRelayFlag` expõem o estado que `#btn-relay-flag` lê e o desligamento que ele chama; `RELAY_FLAG_KEY` é exportada para quem precisar do nome. `isSameNetwork` está pronta para o texto do badge. Nenhum módulo deste plano constrói markup.
- **03-10 (WebRTC e RunConfig):** as três peças se encaixam sem cola nova. `createSignalingClient(...).onSignal` entrega os três verbos de relay direto ao `accept` do `RtcTransport`; `connectionOf(peer)` alimenta `routeOf`; `buildOutcome` monta a linha que volta pelo mesmo WebSocket, que continua aberto por desenho (D3-11). É lá também que o stub de `route` no `lobbyState` fecha.
- **Fase 4 (netcode):** o `Transport` sobre WebRTC tem exatamente os seis membros que `local.ts` tem, então os testes em processo do lobby e do pinger continuam sendo a especificação executável do comportamento, e `lossy.ts` continua sendo o jeito reproduzível de quebrar o cabo.
- **Fase 5 (reconexão):** o gancho está no lugar e nomeado. `onDisconnected` já existe, o socket já se reabre sozinho, e o cabeçalho de `signaling.ts` diz em maiúsculas o que ainda **não** acontece — para que a fase 5 saiba exatamente o que lhe cabe.

## Self-Check: PASSED

- **Arquivos conferidos no disco:** `src/net/signaling.ts`, `src/net/rtc.ts`, `src/net/ice.ts`, `tests/net-signaling.test.ts`, `tests/rtc-shape.test.ts`, `tests/ice-route.test.ts`, `tests/net-vocabulary.test.ts` — todos presentes.
- **Commits conferidos em `git log`:** `ea914eb`, `73b008d`, `e02ca70`, `f4a686e`, `a8d3ee9` — todos presentes, todos nesta branch.
- **Fronteira respeitada:** `git diff --name-only` da base até HEAD lista exatamente os sete arquivos de `files_modified`; `--diff-filter=D` vazio; `apps/server/**`, `package-lock.json`, `STATE.md` e `ROADMAP.md` intocados.
- **Guarda provado empiricamente:** violação plantada em `src/net/ping.ts` (identificador proibido + linha marcada em arquivo fora da lista) fez os três testes de exceção falharem, cada um nomeando a fechadura que cedeu; o arquivo foi restaurado e `git status` voltou a listar só o esperado.
- **Assinabilidade provada empiricamente:** duas sondas descartáveis sob `tsc` — o socket do navegador satisfaz `SocketLike` e a conexão do navegador satisfaz `StatsSource`, as duas sem cast. Ambas apagadas.

---
*Phase: 03-sala-transporte-e-protocolo*
*Completed: 2026-09-08*
