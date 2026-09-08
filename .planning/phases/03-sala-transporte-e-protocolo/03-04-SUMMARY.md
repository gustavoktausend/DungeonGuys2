---
phase: 03-sala-transporte-e-protocolo
plan: 04
subsystem: signaling-server
tags: [websocket, ws, zod, rate-limit, cswsh, room-map, webrtc-signaling, csprng]

# Dependency graph
requires:
  - phase: 02-publicacao-e-servidor
    provides: "apps/server com createApp, readEnv, createShutdown e o http.Server exportado de propósito para esta fase"
  - phase: 03-sala-transporte-e-protocolo
    plan: 01
    provides: "SIGNAL_KIND, REJECT_REASON, ICE_ROUTE, ICE_CANDIDATE_TYPE, PLAYER_SLOT, ROOM_CODE_ALPHABET/LENGTH, isRoomCode e os doze corpos de packages/protocol/src/signaling.ts"
  - phase: 03-sala-transporte-e-protocolo
    plan: 03
    provides: "tests/net-vocabulary.test.ts, o guarda de FORM-12 cujo glob esta onda estende"
provides:
  - "apps/server/src/signaling/index.ts: attachSignalling com os três guardas antes do handshake e o roteamento opaco das doze mensagens"
  - "apps/server/src/signaling/schema.ts: schema zod por mensagem, com 17 asserções de identidade de tipo contra @dg2/protocol"
  - "apps/server/src/signaling/rooms.ts: Map<code, Room> com código de CSPRNG, TTL de 30 min e graça de 60 s"
  - "apps/server/src/signaling/limiter.ts: janela fixa por IP real, dois baldes e teto de 10.000 chaves"
  - "DG2_ORIGIN em env.ts, com recusa explícita do padrão de desenvolvimento fora de dev"
  - "O ponto nomeado onde a fase 6 pluga a checagem de sessão, único e em maiúsculas"
affects: [03-06-telemetria-ice-e-turn, 03-08-ice-cliente, 03-09-tela-do-lobby, 05-reconexao, 06-contas]

# Tech tracking
tech-stack:
  added:
    - "ws@8.21.3 (apps/server, versão fixa)"
    - "zod@4.5.4 (apps/server, versão fixa)"
    - "@types/ws@8.18.1 (apps/server, devDependency)"
  patterns:
    - "Fábrica com deps por argumento e zero efeito no import, no molde de createApp/createShutdown"
    - "Interface estreita declarada pelo que o chamador precisa (UpgradableServer, ForwardedRequest, RemoteSocket), no molde de DrainableServer"
    - "Identidade de tipo (Equal/Expect) ligando schema de runtime ao tipo de fio, avaliada por um portão que já existe"
    - "Tempo e aleatoriedade injetados: nenhum teste desta onda espera relógio nem depende de sorte"
    - "Recusa uniforme como propriedade de segurança: código errado e limite estourado devolvem a mesma coisa"

key-files:
  created:
    - apps/server/src/signaling/schema.ts
    - apps/server/src/signaling/rooms.ts
    - apps/server/src/signaling/limiter.ts
    - apps/server/src/signaling/index.ts
    - tests/server-rooms.test.ts
    - tests/server-signaling.test.ts
  modified:
    - apps/server/package.json
    - package-lock.json
    - apps/server/src/env.ts
    - apps/server/src/index.ts
    - apps/server/tsconfig.json
    - tsconfig.json
    - tests/workspaces.test.ts
    - tests/server-env.test.ts
    - tests/net-vocabulary.test.ts

key-decisions:
  - "O grace de 60 s implementa D3-02 em vez de contradizê-la: a sala morre quando a autoridade SAI, e o socket é o detector, não o evento — porque `systemctl reload caddy` fecha as WebSockets vivas enquanto os DataChannels P2P seguem"
  - "Um join recusado pelo balde devolve exatamente o mesmo `badCode` de um código inexistente: distinguir os dois confirmaria a um script que ele foi apenas throttled, e é isso que deixaria um varredor separar código real de código falso pelo tempo de resposta"
  - "`parseSignal` aceita o texto cru do fio além do valor decodificado, porque JSON.parse lança exatamente na entrada que este módulo existe para sobreviver — deixar a chamada ao chamador poria um try/catch no handler de socket que alguém depois 'limparia'"
  - "As mensagens de erro do zod NÃO são devolvidas ao remetente: elas nomeiam caminhos de campo internos e ecoam o que chegou, o que é uma descrição da forma do servidor entregue a quem sondou"
  - "O parâmetro de attachSignalling é uma interface estreita (UpgradableServer) e não `http.Server`: `serve()` do @hono/node-server é tipado como UNIÃO de três servidores, então nomear `http.Server` não compila contra o próprio objeto que index.ts exporta"
  - "`maxPayload` de 64 KiB é quatro vezes o teto de SDP do schema de propósito: assim uma mensagem grande demais é recusada PELO SCHEMA, com motivo, em vez de pelo transporte derrubando a conexão sem nenhum"
  - "Um timer só para duas tarefas periódicas (heartbeat e varredura de salas): são a mesma faxina sobre os mesmos mapas, e um segundo intervalo seria uma segunda coisa para armar, unref e parar"

patterns-established:
  - "Anti-vacuidade por metade de glob: quando um guarda passa a cobrir dois diretórios, cada metade ganha sua própria asserção de não-vazio — um `> 0` combinado ficaria verde com um dos dois padrões casando nada"
  - "Os guardas de pré-handshake são testados falando HTTP à mão, porque um cliente WebSocket reporta as três recusas de forma idêntica e um servidor que respondesse 403 a tudo passaria nos três"
  - "Metade de aceitação obrigatória em todo teste de recusa: a recusa que dispara sempre satisfaz todos os casos negativos"

requirements-completed: [SALA-01, SALA-02, SALA-04]

# Metrics
duration: 27min
completed: 2026-09-08
---

# Phase 3 Plan 04: O servidor de signaling no ar Summary

**Dois processos numa mesma máquina se acham por um código de seis letras sorteado do CSPRNG, trocam SDP através de um servidor que nunca abriu o envelope, e um terceiro com `Origin` estranho leva 403 antes de o handshake completar — com `ws` e `zod` confinados em `apps/server` e o jogo publicado ainda em `dependencies: {}`.**

## Performance

- **Duration:** ~27 min
- **Started:** 2026-09-08T15:13:58Z
- **Completed:** 2026-09-08T15:41:00Z
- **Tasks:** 4 de 4 (a tarefa 1 era o portão bloqueante, resolvido antes desta sessão)
- **Files:** 15 (6 criados, 9 editados) — 1.320 linhas de fonte novo, 870 de teste

## Task 1 — o portão de legitimidade do `zod`

A tarefa 1 era um `checkpoint:human-verify` com `gate="blocking-human"`, **não auto-aprovável**, porque `03-RESEARCH.md` classificou o `zod` como **[ASSUMED]**: ele já estava citado em `CLAUDE.md` § Supporting Libraries, mas o `slopcheck` nunca foi executado contra ele.

O orquestrador apresentou o portão ao usuário com os fatos consultados ao vivo no registro npm, sem instalar nada:

- repositório declarado `git+https://github.com/colinhacks/zod.git`, mantenedor único `colinhacks`
- `dist-tags.latest` = 4.5.4, publicado em 2026-08-29T17:55:42Z
- 246.731.317 downloads na semana de 2026-08-31 a 2026-09-06
- nenhum `preinstall`, `install` ou `postinstall` no manifesto publicado
- `zod` ausente de `node_modules` e de `package-lock.json` antes da resposta

**Resposta do usuário: "Aprovado".** O `slopcheck` não foi executado.

**Verificação independente antes de instalar.** Como a aprovação chegou por relato e não por consulta direta, os mesmos fatos foram reconferidos contra o registro nesta sessão antes de qualquer `npm install` — `npm view zod repository/scripts/dependencies/maintainers` e a API de downloads. Todos bateram: repositório `colinhacks/zod`, scripts publicados apenas `test`, `build`, `clean`, `postbuild`, `test:watch` e `prepublishOnly` (nenhum deles roda na instalação do consumidor), `dependencies` vazio, e exatamente 246.731.317 downloads. `ws@8.21.3` (websockets/ws, sem script de instalação) e `@types/ws@8.18.1` (DefinitelyTyped, `scripts` vazio) foram conferidos junto. Nenhum `npm install` rodou antes disso.

## Accomplishments

- **Doze mensagens com teto em todo campo de texto, e a deriva virou erro de compilador.** `schema.ts` carrega um schema `zod` por entrada de `SIGNAL_KIND` e **17 asserções `Expect<Equal<…>>`** ligando cada `z.infer` ao tipo de `@dg2/protocol` — identidade, não assinabilidade: um schema que perdesse um campo ainda produziria valor assinável a um tipo com aquele campo opcional, e um que ganhasse um ainda satisfaria o leitor. As duas grafias agora não podem divergir sem quebrar `npm run typecheck:server`. Tetos: SDP 16 KiB, `candidate` 2 KiB, nome 24 **pontos de código** (não unidades UTF-16 — a diferença entre "24 caracteres" e "12 emoji"), `accountId` 32.
- **`DG2_ORIGIN` recusa o próprio padrão em produção.** Uma allowlist de origem que assume um valor sozinha é uma checagem que não checa nada, e o sintoma seria uma proteção anti-CSWSH desligada em silêncio na caixa enquanto tudo fica verde na máquina do desenvolvedor (T-3-02). `readEnv` lança quando `DG2_RELEASE !== 'dev'` e a origem ainda é `http://localhost:5173` — inclusive quando a chave está simplesmente **ausente**, que é a forma mais provável do mesmo erro.
- **O código de sala é imprevisível por construção e o grep prova.** `byte & 31` sobre `randomBytes` é uniforme **porque 32 divide 256 exatamente**, e o motivo está escrito ao lado da linha; o teto de 10 sorteios impede um laço infinito dentro de um handler de socket, que é a pior forma que uma falha pode tomar (unit saudável, processo mudo). O nome da função de aleatoriedade comum não aparece no arquivo, e o critério de aceitação é exatamente esse grep.
- **A graça de 60 s foi a única decisão que a pesquisa devolveu ao planejador, e ela está escrita no código.** `systemctl reload caddy` **fecha as WebSockets ativas** enquanto os DataChannels P2P, que não passam pelo Caddy, continuam vivos — sob a leitura literal de D3-02, trocar um cabeçalho no proxy durante uma noite de jogo apagaria todas as salas da caixa de uma vez, e a fase 5 não teria para onde reconectar. O parágrafo inteiro vive acima da constante em `rooms.ts`.
- **A sala nunca toca o banco, e isso é o tempo de vida correto e não um atalho.** Persistir uma sala faria o servidor dono de um fato que o jogo não precisa que ele possua: ela voltaria de um restart referindo peers que não existem, segurando slots que ninguém pode reivindicar, num lobby que ninguém pode iniciar.
- **Três guardas antes do handshake, lidos como bytes crus de um socket.** URL errada → socket destruído **sem status** (um 404 confirmaria a um scanner que há algo escutando); `Origin` diferente → `403`; endereço acima do balde → `429`. Os testes falam HTTP à mão porque um cliente WebSocket reporta as três recusas de forma idêntica, e um servidor que respondesse 403 a tudo — inclusive ao tráfego válido — passaria nos três.
- **O ponto da fase 6 existe, é único e está em maiúsculas**, com o motivo de ele funcionar escrito ao lado: o cookie do Better Auth chega nesta mesma requisição porque um handshake de WebSocket é um GET. E o comentário diz que a sessão vira um **quarto** guarda, não a substituição dos três.
- **Registrado por que não `hono-rate-limiter`.** O `http.Server` do Node emite `'upgrade'` **em vez de** `'request'`, então o handler `fetch` do Hono nunca roda nesse caminho: um middleware montado no app passaria num teste de fumaça (que faz um GET comum) e não limitaria absolutamente nada em produção, com o contador do próprio limitador em zero como única evidência.
- **O `Map` do limiter tem teto, porque sem ele o guarda é a negação de serviço que ele existe para impedir.** Dez mil chaves, com as expiradas varridas primeiro e um lote de 10% despejado só se isso não liberar nada — despejar uma entrada por inserção pagaria em CPU a negação de serviço que se recusou a pagar em memória.

## Task Commits

| Tarefa | Commit | Tipo |
|---|---|---|
| Task 2: instalar, escrever o schema e provar o confinamento | `8ad8aef` | feat |
| Task 3 (RED): teste que falha para as salas e o rate limit | `4ada045` | test |
| Task 3 (GREEN): salas em memória e rate limit por IP real | `f06a820` | feat |
| Task 4 (RED): teste que falha para o upgrade e o relay | `47bf092` | test |
| Task 4 (GREEN): handler de upgrade, relay opaco e o ponto da fase 6 | `0e1dbe1` | feat |

As tarefas 3 e 4 tinham `tdd="true"`. Não houve fase REFACTOR em nenhuma das duas: os módulos passaram nos testes na primeira execução verde e não havia o que limpar.

## Deviations from Plan

### 1. [Rule 3 - Bloqueio] `attachSignalling` recebe uma interface estreita em vez de `http.Server`

- **Encontrado em:** Task 4, no `npm run typecheck:server`
- **Problema:** o plano especifica `attachSignalling(server: Server, deps)` com `Server` de `node:http`. Mas `serve()` do `@hono/node-server` é tipado como **união** de `http.Server`, `Http2Server` e `Http2SecureServer`, então a assinatura do plano não compila contra o próprio objeto que `apps/server/src/index.ts` exporta (`TS2345`).
- **Correção:** `UpgradableServer`, uma interface que declara só o método usado (`on('upgrade', …)`), no molde exato de `DrainableServer` em `shutdown.ts`. Aceita os três servidores, diz qual é o acoplamento, e deixa o teste passar um `http.Server` próprio.
- **Impacto no plano:** nenhum. O `key_links` do plano casa `attachSignalling\(server`, que continua sendo o call site em `index.ts`.
- **Commit:** `0e1dbe1`

### 2. [Rule 3 - Bloqueio] Duas deps a mais em `SignallingDeps`: `startHeartbeat` e o endereço na sessão

- **Encontrado em:** Task 4, ao escrever o teste do heartbeat
- **Problema:** a lista de deps do plano não inclui como armar o heartbeat. Chamar `setInterval` dentro do módulo tornaria "um socket morto é terminado em 30 s" um teste que espera trinta segundos.
- **Correção:** `startHeartbeat: (tick) => void`, no molde literal de `startWatchdog` em `shutdown.ts`; `index.ts` passa `setInterval(tick, HEARTBEAT_MS).unref()`. Junto, a `Session` guarda o endereço lido do `upgrade` em vez de buscá-lo no socket depois — o endereço que importa é o do `X-Forwarded-For`, e esse cabeçalho só existe na requisição.
- **Commit:** `0e1dbe1`

### 3. [Rule 1 - Bug] Weak-type check recusava `IncomingMessage` e `Duplex`

- **Encontrado em:** Task 4
- **Problema:** `ForwardedRequest` e `RemoteSocket` foram escritos com todas as propriedades opcionais, o que dispara a checagem de tipo fraco do TypeScript: `IncomingHttpHeaders` era recusado por "não ter propriedades em comum", apesar de ter exatamente a única que importa.
- **Correção:** `ForwardedRequest.headers` virou `Record<string, string | string[] | undefined>`. Para o socket do `upgrade`, que o Node tipa como `Duplex` mas que é sempre um `net.Socket`, a interseção `Duplex & RemoteSocket` afirma o fato no único ponto onde ele é necessário — em vez de alargar `clientIp` para aceitar algo sem endereço nenhum.
- **Commit:** `0e1dbe1`

### 4. [Rule 3 - Bloqueio] Comentários que quebravam os próprios critérios de aceitação

- **Encontrado em:** Task 3
- **Problema:** dois critérios do plano são greps sobre `rooms.ts` (`Math.random` → 0, e `sqlite|kysely|prepare(` → 0). A primeira redação dos comentários **explicava** as duas proibições soletrando as palavras proibidas, e teria deixado os dois critérios vermelhos.
- **Correção:** os parágrafos passaram a descrever as APIs sem nomeá-las, no mesmo movimento que `packages/protocol/src/roomCode.ts` já faz pelo mesmo motivo, e dizem que o motivo da perífrase é o grep.
- **Commit:** `f06a820`

### 5. Registro dos testes nos dois `tsconfig` foi feito antes de os arquivos existirem

O plano manda registrar `server-rooms.test.ts` e `server-signaling.test.ts` nos dois `tsconfig` já na tarefa 2, cuja verificação roda `npm run typecheck:server` — antes de os arquivos existirem. Verificado que isso é seguro: `include` é tratado como glob, e um padrão que não casa nada apenas não contribui arquivos (só `files` erra em arquivo ausente). Feito como o plano manda, e `npm run typecheck:server` ficou verde na tarefa 2.

## Known Stubs

Ambos são deps injetadas e vivem em `apps/server/src/index.ts`, não nos módulos de signaling — que nunca ficam sabendo que elas se tornaram reais.

| Stub | Arquivo | Por que é intencional | Quem resolve |
|---|---|---|---|
| `recordOutcome` é um no-op | `apps/server/src/index.ts` | O plano define explicitamente que a linha de telemetria é do plano 03-06. Um no-op e não um `throw`: o handler já engole a falha, e um stub que lançasse exercitaria esse caminho em toda conexão e encheria o journal de um defeito que não existe | 03-06 |
| `iceConfig` devolve só STUN público, com `turn: { username: '', credential: '', ttl: 0 }` | `apps/server/src/index.ts` | O coturn ainda não existe (depende de 02-04, a VPS). STUN público basta para descobrir endereço reflexivo e portanto para dois peers em NAT comum; **não** basta para NAT simétrico e CGNAT, que é exatamente o que TURN existe para cobrir | 03-06 |

Nenhum dos dois impede o objetivo deste plano de fechar: um `create` seguido de `join` faz dois sockets se enxergarem, que é o critério de sucesso.

## Known Gaps

**`REJECT_REASON` não tem entrada para "não entendi a mensagem".** As cinco entradas da tabela congelada são sobre versão e sobre sala. Uma mensagem malformada, um `kind` fora de `SIGNAL_KIND` e um texto que não é JSON viajam hoje como `badCode`, que é a afirmação verdadeira mais próxima ("o que você mandou não é algo que eu reconheço"), com a queixa específica em `detail` — campo que D-08 reserva para a tela e proíbe de ser usado em branch.

A correção certa é **acrescentar** `badMessage` ao fim de `REJECT_REASON`. Não foi feita aqui porque mover a tabela congelada e o golden de `tests/snapshots/protocol-enums.json` pertence a um commit que já esteja movendo os dois — este plano não é um deles, e `packages/protocol/src/enums.ts` é território do plano 03-01. Registrado como dívida, com o motivo escrito também em `schema.ts`.

Efeito colateral que **não** é um defeito: como o join recusado pelo balde já devolve `badCode` de propósito (para não confirmar a um varredor que ele foi throttled), as duas recusas se parecem, e isso é a propriedade desejada e não uma consequência a corrigir.

## Verification

| Portão | Resultado |
|---|---|
| `npm run lint` | 0 |
| `npm test` | 0 — **772 testes em 54 arquivos** |
| `npm run typecheck:server` | 0 |
| `npm run server:build` | 0 — `dist-server/server.mjs`, 1.4 MB |
| `npx vitest run tests/server-rooms.test.ts` | 0 — 25 testes (mínimo do plano: 12) |
| `npx vitest run tests/server-signaling.test.ts` | 0 — 21 testes (mínimo do plano: 12), com nomes citando 403, 429 e badCode |
| `npx vitest run tests/net-vocabulary.test.ts` | 0 — o glob acha as duas metades, asseridas em separado |
| raiz / `packages/sim` / `packages/protocol` `dependencies` | `{}` nos três |
| `grep -c 'Expect<Equal<' schema.ts` | 17 |
| `grep -c 'Math.random' rooms.ts` | 0 |
| `grep -ci 'sqlite\|kysely\|prepare(' rooms.ts` | 0 |
| `grep -c 'FASE 6\|PHASE 6' signaling/index.ts` | 1 |
| `grep -ci 'CSWSH' signaling/index.ts` | 2 |
| `grep -c 'hono-rate-limiter' signaling/index.ts` | 1 (só no comentário que explica a ausência) |
| `grep -c 'Phase 3 attaches' apps/server/src/index.ts` | 0 |

## Threat Model — dispositions aplicadas

| Threat ID | Onde foi mitigado |
|---|---|
| T-3-01 | `rooms.ts` (`byte & 31` sobre CSPRNG, unicidade entre vivas, TTL) + `limiter.ts` (balde de join a 10/min) — os três |
| T-3-02 | `signaling/index.ts` (403 antes do `handleUpgrade`, com o comentário de que é anti-CSWSH e não autenticação) + `env.ts` (recusa do padrão fora de dev) |
| T-3-06 | `maxPayload: 64 * 1024`, `perMessageDeflate` desligado, teto de 10.000 chaves no `Map` |
| T-3-16 | `clientIp` lê `x-forwarded-for` antes de `remoteAddress`, com o motivo escrito |
| T-3-17 | `relay()` só entrega a um `peerId` presente na **mesma sala**; fora dela devolve `error` |
| T-3-18 | `parseSignal` com tetos por campo; `kind` desconhecido devolve `error` sem derrubar a conexão |
| T-3-19 | Graça de 60 s, com o parágrafo do `reload` acima da constante |
| T-3-20 | Sala em `Map`; asserido por grep sobre `rooms.ts` |
| T-3-SC | Portão bloqueante da tarefa 1 + verificação independente no registro + `tests/workspaces.test.ts` como metade executável |

## Threat Flags

Nenhuma superfície nova fora do registro do plano. A única entrada de rede criada é `/ws`, que o modelo de ameaças já cobre; `DG2_ORIGIN` é a mitigação de T-3-02 e não superfície nova; nada de sala chega ao SQLite.

## O que a próxima onda herda

- **Plano 03-06** preenche as duas deps inertes (`recordOutcome`, `iceConfig`) editando **só** `apps/server/src/index.ts` — os módulos de signaling não mudam. `HEARTBEAT_MS` é exportado de `signaling/index.ts` para quem precisar do mesmo número.
- **Planos 03-08/03-09** estendem o glob de `tests/net-vocabulary.test.ts` com os fontes de ICE e da tela do lobby, **no mesmo commit que criar os diretórios** — a sequência está escrita no cabeçalho daquele arquivo, e a anti-vacuidade por metade de glob já existe para ser copiada.
- **Fase 6** pluga a sessão no ponto em maiúsculas dentro de `server.on('upgrade')`, depois do rate limit e antes de `handleUpgrade`. Os três guardas de hoje permanecem.
- **Dívida registrada:** acrescentar `badMessage` ao fim de `REJECT_REASON` num commit que já esteja movendo a tabela congelada e o seu golden.

## Self-Check: PASSED

Os seis arquivos criados existem em disco, os seis commits existem no log, e a árvore de trabalho está limpa. `npm test` (772 testes), `npm run lint`, `npm run typecheck:server` e `npm run server:build` saem 0 no HEAD deste ramo.
