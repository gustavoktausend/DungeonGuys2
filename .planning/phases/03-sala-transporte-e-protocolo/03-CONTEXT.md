# Phase 3: Sala, transporte e protocolo - Context

**Gathered:** 2026-09-02
**Status:** Ready for planning

> Rótulos de estrutura ficam em inglês porque são lidos por ferramenta.
> O conteúdo é em português, como o resto dos documentos do projeto.
>
> **Convenção de numeração:** as decisões desta fase são `D3-01` a `D3-20`. As decisões
> da fase 1 são citadas como `D-nn (fase 1)` e as da fase 2 como `D2-nn (fase 2)`, para que
> nunca se confundam. **Aviso ao planejador:** o gate de cobertura de decisões do GSD não
> lê a numeração por fase — a cobertura de `D3-nn` pelos planos precisa ser conferida à mão
> ou pelo plan-checker, como foi feito na fase 2.

<domain>
## Phase Boundary

Esta fase faz quatro amigos se encontrarem numa sala pelo código e se verem no lobby com
nome, classe e cor, sobre uma conexão WebRTC em estrela cuja autoridade é a máquina de quem
criou a sala. E decide o **formato do fio** antes de existir partida para consumi-lo: as duas
classes de canal, as tabelas de enum congeladas que faltam, o vocabulário do signaling e o
codec binário quantizado do snapshot — medido num bench de CI contra o limite de 16 KiB por
mensagem do DataChannel.

**Requisitos cobertos:** SALA-01, SALA-02, SALA-03, SALA-04, SALA-05, SYNC-04 (6 requisitos),
mais a metade pendente de FORM-12 (topologia estrela e o input da autoridade passando pela
mesma tabela dos remotos — ver REQUIREMENTS.md, "Partial").

**Fora do escopo desta fase, explicitamente:**

- **Partida sincronizada.** Predição local, reconciliação, interpolação de remotos, o
  encoder de delta contra baseline, o anel de baselines por peer e a política de
  backpressure são a **fase 4**. Esta fase implementa e mede só o snapshot completo
  (D3-18); ao iniciar, a run começa local e sem sincronia (D3-05).
- **Reconexão e ICE restart.** TEMP-04 é a **fase 5**. Esta fase deixa o gancho (o
  WebSocket de signaling vivo durante a partida, D3-11) e nada mais.
- **Conta, login e sessão.** Better Auth, cookie, `/api/auth/*` e a tabela `user` são a
  **fase 6**. O `upgrade` do WebSocket nasce sem sessão (D3-09), com um ponto único nomeado
  para a fase 6 plugar.
- **Regras de co-op** (caído/revive, loot, escala, minimapa, nome sobre a cabeça) — fase 5.
- **Interest management** — fora do marco, por decisão registrada em REQUIREMENTS.md.
- **Nenhuma mudança em `packages/sim`** que mova o `SIM_VERSION`. As tabelas de enum novas
  nascem em `packages/protocol` espelhando os tipos do sim, como `OBJECTIVE_KIND` já faz.

**Dependência de infra (nota do STATE.md, herdada da fase 2 incompleta):** o critério 3
(SALA-04, a sala fechando pelo caminho de relay) depende do coturn, que mora na VPS, e o
02-04 (provisionar a caixa) segue adiado. Tudo o mais é código local. **As ondas que dependem
da caixa vão por último**, como a fase 2 fez — e o critério 3 não pode ser dado como fechado
antes do 02-04.

</domain>

<decisions>
## Implementation Decisions

### Sala e lobby (SALA-01, SALA-02, SALA-03)

- **D3-01:** **WebRTC abre no join e o lobby trafega nele.** A máquina de quem criou a sala
  é a autoridade do lobby; `lobbyState` vai pelo canal `reliable`. O servidor só casa as
  pontas (signaling) e não guarda regra nenhuma de sala — como o spec de origem descreve.
  Consequências: falha de NAT aparece **no lobby**, antes de iniciar; ping e rota aparecem
  no lobby (critério 4); FORM-12 vale desde a primeira mensagem; e a fase 4 não troca de
  transporte para começar a partida.
- **D3-02:** **A sala morre com quem a criou.** Se a autoridade fecha a aba ou cai antes de
  iniciar, todos voltam ao menu com aviso claro ("quem criou a sala saiu"). Não existe
  migração de autoridade, nem no lobby: há um caminho só para "quem manda", consistente com
  o spec de origem e com D-37 (fase 1). O servidor apaga a sala quando o WebSocket da
  autoridade fecha.
- **D3-03:** **Classes repetidas são permitidas.** Dois magos na mesma sala são distinguidos
  pela cor de roupa por jogador (D3-06, rampa de recolor de D-22) e, na fase 5, pelo nome
  sobre a cabeça. Sem regra de exclusividade, sem disputa por classe — e as classes são
  provisórias até o redesenho por peças.
- **D3-04:** **Quem criou inicia quando quiser, inclusive sozinho.** Sem estado de "pronto"
  e sem timer: a autoridade vê quem está na sala e a classe de cada um, e decide. Uma sala
  com um jogador inicia normalmente — **solo passa a ser um caso de multiplayer** (pesquisa
  §3.6), o que testa o pipeline inteiro sem precisar de um amigo. Entre amigos, o combinado
  é por voz.
- **D3-05:** **Ao iniciar, nesta fase, cada máquina cria o World e compara o hash do
  tick 0.** `startRun` entrega o `RunConfig` (seed, modo, os slots com nome, classe e forge
  de cada um). Cada cliente roda `createWorld` + `generateArena` localmente e manda o
  `hashWorld` do tick 0 à autoridade pelo canal `reliable`; divergência vira erro na tela,
  com os dois hashes. A run começa **local e sem sincronia** (os outros personagens ficam
  parados) — é a prova de que seed, config e slots chegam bit-idênticos, e é exatamente
  onde a fase 4 encaixa.
- **D3-06:** **A cor da roupa viaja no `lobbyState` como dado de apresentação**, fora do
  `RunConfig` e fora do sim. O lobby mostra cada boneco na cor certa e a fase 4 já renderiza
  os remotos como eles se veem. É um campo numa mensagem que ainda não está congelada. A cor
  vem das settings locais (`Save.data.settings.colors[cls]`); sincronizá-la pela conta é
  CONTA-06, fase 6.
- **D3-07:** **Entrada por código e por link.** `https://<domínio>/?sala=CODIGO` abre o jogo
  já no fluxo de entrada; o link é só o código na URL, sem estado a mais no servidor. O
  lobby tem "copiar link". Atenção: o service worker e o `start_url` do PWA não podem tratar
  a query como página nova nem cacheá-la como shell distinto.
- **D3-08:** **Um convidado que não conecta falha sozinho.** Se a conexão WebRTC com a
  autoridade falha mesmo pelo relay, o convidado vê "não consegui conectar com quem criou a
  sala" — distinto de "conectado com lag", como a pesquisa pede — e um botão "tentar de
  novo". A autoridade e os outros continuam no lobby e veem o slot dele como "conectando" ou
  vazio. **A sala nunca cai por causa de um convidado.**

### Signaling e TURN sem conta (SALA-04)

- **D3-09:** **O `upgrade` do WebSocket confere só origem e rate limit.** Sem sessão até a
  fase 6: o handler confere o header `Origin` (mesma origem) e limita por IP; o que protege
  a sala é o código. O peer se apresenta com o `accountId` local (ULID não-reivindicado,
  ADR 0002) e o nome das settings, como dado **auto-declarado** que a autoridade usa só para
  exibir e correlacionar — nada durável depende dele nesta fase. A checagem de sessão fica
  como **um único ponto nomeado** no `upgrade`, onde a fase 6 pluga o Better Auth sem mover
  nada.
- **D3-10:** **A credencial efêmera de TURN vem pelo próprio signaling**, na resposta de
  criar ou entrar na sala: `username` e `credential` (HMAC do `static-auth-secret` do
  coturn, TURN REST API) com TTL curto (1 h), amarrados à sala. Só quem o servidor está
  casando recebe credencial; **não existe endpoint HTTP aberto** para pedir relay. O cliente
  nunca vê o segredo. `user-quota` e `total-quota` no coturn são o teto de abuso.
- **D3-11:** **O WebSocket de signaling continua vivo durante a partida**, com keepalive. É
  o canal de ICE restart e reconexão da fase 5 (TEMP-04) e o da telemetria ICE desta fase
  (D3-14). A sala em memória some quando o WebSocket da autoridade fecha; o servidor sabe
  quando a sala acabou sem inventar estado.
- **D3-12:** **`apps/web` fica na raiz — terceira vez.** O deploy real nunca rodou (02-04 e
  02-12 aguardam a VPS); mover `dist/` e os caminhos de rsync, Playwright e CI antes disso
  muda o alvo de um teste que ainda não aconteceu. O código de rede do cliente nasce em
  `src/net/` e move junto quando for a hora. Reavaliar **depois do primeiro deploy real**.

### Ping, rota e telemetria ICE (SALA-05)

- **D3-13:** **"Ping" é uma mensagem `ping`/`pong` própria no canal `unreliable`.** A
  autoridade manda `ping` com carimbo e o peer devolve `pong`; o RTT medido é o do caminho
  que input e snapshot vão usar na fase 4, igual em todo motor. `ping` e `pong` são
  **acrescentados ao fim** da `MSG_KIND` (append é a única edição segura da tabela), e o
  golden `tests/snapshots/protocol-enums.json` muda **no mesmo commit**. `getStats()` do
  `RTCPeerConnection` não é a fonte do número da tela.
- **D3-14:** **O desfecho ICE vai para uma tabela append-only no SQLite**, reportado pelo
  peer via o WebSocket de signaling já aberto: sala, slot, rota (direto/relay), par de
  candidatos local/remoto (tipo e transporte), RTT, resultado (conectou/falhou), data. Sem
  dado pessoal além do ULID local. **Falha de conexão também gera linha** — é o dado que
  mede a necessidade de relay. É a segunda tabela do banco, via o migrator que a fase 2
  criou (D2-02/D2-07: só aditiva). Medir vira um `SELECT`; sobrevive à rotação do journald
  e entra no backup do Litestream de graça.
- **D3-15:** **A tela mostra ping e rota no lobby por slot, e num indicador discreto durante
  a run.** No lobby, cada slot exibe o ping e "direto" ou "relay"; a tabela guarda o par
  completo, a tela não. Na run (que nesta fase começa local, D3-05), um indicador pequeno num
  canto com ping e rota, que a fase 4 herda como está e a fase 5 estende com "reconectando"
  (FEATURES: indicador de conexão é table stakes).
- **D3-16:** **A autoridade relaya o resumo de ping e rota de cada slot no `lobbyState`**,
  atualizado a cada segundo. Na topologia estrela um convidado só mede o próprio link; com o
  resumo, todos veem quem está com lag ou em relay.

### Codec do snapshot (SYNC-04)

- **D3-17:** **A camada estática é derivada da seed em cada cliente.** `startRun` leva só o
  `RunConfig`; cada cliente roda `createWorld` + `generateArena`, bit-exato desde o
  `sim/math.ts`. O snapshot **nunca** carrega `obstacles`, `traps`, `play` nem `config`. É o
  mesmo caminho do replay (D-11, fase 1): **um** jeito de construir o mundo inicial, e o
  hash do tick 0 de D3-05 é a prova de que ele fecha.
- **D3-18:** **O formato nasce com baseline e `ack`; só o snapshot completo é implementado
  aqui.** O cabeçalho da mensagem `snapshot` carrega o `tick` e o tick da baseline (0 =
  completo), e `ack` já existe na `MSG_KIND`. Esta fase implementa, testa em round-trip e
  mede o snapshot completo (baseline vazia) — que é o que entrada tardia e reconexão usam. O
  encoder de delta e o anel de baselines por peer são a **fase 4**, onde há tráfego real
  para medir contra.
- **D3-19:** **Quando um snapshot não cabe em 16 KiB, ele é particionado por classe de
  entidade em mensagens independentes e auto-contidas**: jogadores e inimigos numa,
  projéteis noutra, moedas/poções/baús noutra — cada uma com `tick` e índice de parte, **sem
  remontagem** (perder uma parte não invalida as outras). Cabe por construção até uma parte
  sozinha estourar. O bench assere **cada parte** abaixo de 16 KiB na wave 16 e numa wave de
  endless declarada no código como teto conhecido. Fragmentar e remontar por conta própria
  está recusado.
- **D3-20:** **O bench do CI usa um World sintético de pior caso construído pelas fórmulas do
  próprio sim**: inimigos por `startNextWave` (`4 + wave*3`, ×1,6 com `swarm`, mais chefe),
  projéteis e moedas nos tetos plausíveis, quatro jogadores equipados. Determinístico,
  rápido, e o teto declarado fica visível no código do bench. Um teste secundário confere
  que uma run real jogada até a wave 16 fica **abaixo** do sintético — se ficar acima, o
  sintético está errado, não o jogo.

### Claude's Discretion

Decisões técnicas deixadas para o pesquisador e o planejador resolverem a partir do código e
da pesquisa. Onde a pesquisa já dá um padrão, ele é o ponto de partida.

- **Alfabeto e tamanho exato do código de sala** (6+ caracteres, sem caractere ambíguo —
  critério 1). Tipo Crockford sem `0/O/1/I/L`, insensível a caixa, gerado no servidor com
  aleatoriedade criptográfica, sem colisão com sala viva.
- **TTL de sala ociosa no servidor** e intervalo de keepalive do WebSocket (D3-11).
- **Vocabulário do signaling** (`create`, `join`, `offer`, `answer`, `candidate`, `leave`,
  `iceOutcome`, credencial TURN…): se vira tabela congelada em `packages/protocol` como
  `MSG_KIND`, e como é validado. Restrição: `packages/protocol` nasceu com
  `dependencies: {}` (fase 1); a pesquisa sugere `zod`, que pode viver só em `apps/server`.
- **`Transport` como interface + `local.ts` + `lossy.ts`** (pesquisa, Padrão 1 e item C2 da
  ordem de build): a fase 4 e todo teste de rede dependem de um transporte em processo. A
  forma exata é do planejador; que exista é forte recomendação da pesquisa.
- **Perfect negotiation com a autoridade como o lado impolido** (pesquisa); `bundlePolicy`,
  `iceTransportPolicy: 'all'` por padrão.
- **Como ligar a flag de debug do relay** (`iceTransportPolicy: 'relay'`, critério 3): query
  string, `localStorage` ou toggle escondido nas settings. Precisa existir e ser
  documentada; nunca ligada por padrão.
- **Porta 443 fica com o Caddy; coturn em 3478 (UDP+TCP) e 5349 (TLS)** — pesquisa §"O
  conflito da porta 443": TURN/TLS na 443 é dívida registrada, não construída. STUN público
  como candidato **adicional** ao próprio coturn. Unit do systemd do coturn com `MemoryMax`
  (os ~128 MB reservados em `ops/README.md`), `denied-peer-ip` e `no-cli` obrigatórios.
- **Implementação do rate limit** do `upgrade` (D3-09): `hono-rate-limiter` ou contador
  simples por IP — o custo de errar é baixo enquanto o público é fechado.
- **Layout binário exato do snapshot** (D3-17 a D3-20): `DataView` sobre `ArrayBuffer`,
  `uint16` para posições (1 unidade = 1 px, cabe em 12 bits) e ângulos, `uint16` para hp,
  `uint8` de flags, índices das tabelas congeladas para os enums — com a **posição do jogador
  local em `float32`** (pesquisa §5.3: quantizá-la dá tremor permanente na reconciliação) e a
  **normalização de `-0` dentro do codec** (o cabeçalho de `serialize.ts` já diz que é ali
  que ela pertence). Delta por id só para `enemies` na fase 4; `Bullet`, `Coin` e `Potion`
  seguem sem id.
- **Tabelas de enum que faltam congelar** para o codec: `Enemy.type`, `anim`, `elite`,
  `bossState`, `Chest.state`, `Obstacle.kind`, `AttackKind`, `ClassKey`, `MutatorKey`,
  `Phase`, `GameMode`… Nascem em `packages/protocol` espelhando o sim, append-only, com o
  mesmo golden e o mesmo teste de pinagem que `OBJECTIVE_KIND` já tem.
- **Onde o codec mora**: `packages/protocol` sem import de runtime do sim (decodifica para
  `SerializedWorld`, com `rng` como número), ou junto de `packages/sim/src/serialize.ts`.
- **Frequência do ping** (D3-13) e janela de média mostrada na tela.
- **Texto, layout e fluxo das telas** de criar/entrar, lobby, erro de conexão e aviso de
  sala morta. O roadmap marca `UI hint: yes` — `/gsd:ui-phase 3` é opção antes de planejar.
- **Ordem interna da fase.** Duas restrições: (1) o que depende da VPS (coturn, relay real,
  medição de ICE contra a caixa) vai nas últimas ondas; (2) o append de `ping`/`pong` à
  `MSG_KIND` e a atualização do golden acontecem no mesmo commit.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Escopo e requisitos desta fase
- `.planning/ROADMAP.md` § "Phase 3: Sala, transporte e protocolo" — Goal, os 5 Success
  Criteria, e as duas notas ("por que o codec vem aqui" e "o protocolo não contém a palavra
  host")
- `.planning/REQUIREMENTS.md` § "Sala e transporte (SALA)" e § "Partida sincronizada
  (SYNC)" — texto literal de SALA-01 a SALA-05 e SYNC-04; a nota de mapeamento "SYNC-04 →
  Phase 3"; a linha "FORM-12 — Partial" da rastreabilidade; e Out of Scope (interest
  management)
- `.planning/PROJECT.md` — Core Value, Constraints (netcode P2P host-autoritativo com
  fronteira para servidor; `dependencies: {}`), e § Context (dívida herdada, itens 1-5)
- `.planning/STATE.md` § "Nota para o planejamento da fase 3" — o critério 3 depende do
  02-04; sequenciar as ondas com a VPS por último

### Decisões travadas antes desta fase (não reabrir)
- `.planning/phases/01-formato-e-costuras/01-CONTEXT.md` — **D-02 a D-05** (input quantizado
  na captura, preenchimento de buraco, `InputState` viaja e nunca é recalculado), **D-08 e
  D-09** (recusa sem bypass; `PROTOCOL_VERSION` separado), **D-11** (replay parte da seed —
  o precedente de D3-17), **D-13** (`world.players` é Record, `step()` itera
  `config.players`), **D-22** (rampa de recolor por jogador), **D-33** (`name` e `colors`
  são identidade), **D-37** (sem migração de host)
- `.planning/phases/02-migra-o-para-a-vps/02-CONTEXT.md` — **D2-01/D2-04** (`apps/server`
  com Hono, `apps/web` fica na raiz), **D2-02/D2-07** (migrações só aditivas, via migrator
  do Kysely), **D2-09** (aviso de atualização só fora de sala), **D2-15** (config em `ops/`,
  segredos em `/etc/dg2/env`), **D2-19** (KVM 2, `MemoryMax` por unit); e o item
  "Exclusão de `/ws` no service worker" da seção Deferred, já resolvido em `public/sw.js`
- `docs/adr/0001-identidade-em-tres-espacos.md` — `accountId`/`playerId`/`peerId`, slots
  atribuídos pela autoridade em ordem de entrada quando a sala fecha, tradução `peerId →
  playerId` na borda do transporte
- `docs/adr/0002-claim-da-conta-local.md` — o ULID local não-reivindicado com que o peer se
  apresenta em D3-09
- `docs/adr/0011-formato-de-replay.md` — o pacote de 6 bytes, a tabela resolvida pela
  autoridade e a política de buraco que o input da fase 4 vai alimentar
- `docs/adr/0008-queda-do-host-checkpoint-por-wave.md` — por que D3-02 não migra autoridade
- `docs/superpowers/specs/2026-08-27-coop-online-design.md` § 3 e § 4 — "signaling casa duas
  pontas e esquece", "código de sala / link privado", Marco 1 = transporte e sala
- `docs/DECISOES-MARCO0.md` — as 39 decisões do Marco 0; ler antes de contradizer qualquer
  escolha de `sim/` ou de build

### Pesquisa que sustenta estas decisões
- `.planning/research/SUMMARY.md` § "Fase 3: Transporte, sala e protocolo" (entregáveis),
  § "Decidir cedo" (itens 1, 9, 10, 12, 16, 18) e § "Research Flags" (fase 3 tem o código
  no STACK.md; pesquisa dispensável, mas o planejador deve ler as seções abaixo)
- `.planning/research/ARCHITECTURE.md` § 3.3 (o que o protocolo precisa ter; a regra de
  topologia "toda mensagem cruza exatamente um salto"), § 5.1-5.5 (três camadas de estado,
  codec binário sem dependência, identidade de entidade nos deltas, entrada tardia com o
  mesmo codec), § 9 (fluxo de input e snapshot), § 10 Padrão 1 (`Transport` como
  interface), § 14 Fase C (ordem de build C1-C4)
- `.planning/research/PITFALLS.md` § 4 (o snapshot ingênuo não cabe: os números medidos
  neste repositório, 13,8 KB na wave 1, 38-60 KB extrapolados na wave 16; dois canais;
  backpressure é fase 4), § 11 (NAT e o conflito da porta 443), § 15 (código de sala de 6+
  caracteres)
- `.planning/research/STACK.md` § "STUN/TURN — a resposta com números" (matemática de
  composição para sala de 4, custo de banda), § "Configuração mínima obrigatória do
  coturn" (`use-auth-secret`, `denied-peer-ip`, quotas, o snippet do HMAC), § "O conflito
  da porta 443", § "Configuração ICE no cliente" (`iceTransportPolicy: 'relay'` como flag
  de debug; os dois `createDataChannel`), § "Auth — cookie de sessão vs JWT, e o WebSocket"
  (o `upgrade` com `noServer: true` — **assume sessão do Better Auth; D3-09 substitui a
  checagem por origem + rate limit nesta fase**)
- `.planning/research/FEATURES.md` § "Table Stakes" — lobby legível e indicador de conexão

### Código que esta fase estende
- `packages/protocol/src/enums.ts:38-79` — `MSG_KIND` (`hello`, `welcome`, `reject`,
  `lobbyState`, `startRun`, `input`, `snapshot`, `ack`), `REJECT_REASON`, `CHANNEL_CLASS`; o
  cabeçalho explica o vocabulário autoridade/peers/slots e por que só append é seguro.
  D3-13 acrescenta `ping` e `pong` ao fim
- `packages/protocol/src/version.ts` — `PROTOCOL_VERSION` e `checkVersions`, a recusa sem
  bypass que o handshake `hello`/`welcome`/`reject` executa
- `packages/protocol/src/inputCodec.ts` — o pacote de 6 bytes e a `InputTable`; é o
  precedente de estilo do codec de snapshot (`DataView`, LE, cabeçalho documentado)
- `tests/snapshots/protocol-enums.json` + `tests/protocol-enums.test.ts` +
  `tests/protocol-vocabulary.test.ts` — o golden das tabelas e o grep de "host"
- `packages/sim/src/serialize.ts` — `saveWorld`/`loadWorld` (JSON, lossless) e
  `hashWorld`; o cabeçalho diz onde a normalização de `-0` pertence quando o codec for
  binário
- `packages/sim/src/types.ts:86-111,243-300,341-384` — `Player`, `PlayerSlot`, `RunPlayer`,
  `RunConfig`, `InputState`, `World`: os campos que o codec particiona (D3-19)
- `packages/sim/src/world.ts:74` (`createWorld`), `packages/sim/src/arena.ts:23`
  (`generateArena`), `packages/sim/src/run.ts:107` (`startRun`) — o que cada cliente roda ao
  receber `startRun` (D3-05, D3-17)
- `src/main.ts:188` — `LOCAL_SLOT: PlayerSlot = 'p0'`, "a única linha que deixa de ser
  constante" quando o slot vier do lobby; `beginRun` em `:239-260`
- `src/app/forge.ts:32` — `buildRunConfig(slot, classKey, mode, playerName)`: monta um só
  jogador com `Math.random()` como seed; a autoridade passa a montar os quatro e a emitir
  a seed
- `src/ui/settings.ts:193-196` e `src/render/sprites.ts:109-154` — de onde vêm o nome e a
  cor que viajam no lobby (D3-06, D3-09)
- `src/ui/screens.ts` (`showScreen`, `announce`, `showUpdateOffer`) e `index.html:18-230`
  — as telas existentes; o lobby é uma tela nova no mesmo padrão
- `src/app/stepper.ts:31` — `createStepper`, o passo fixo separado do rAF (FORM-10) que a
  fase 4 vai dirigir por snapshot
- `apps/server/src/index.ts:76` — `export const server`, o `http.Server` real, com o
  comentário que reserva o evento `upgrade` para esta fase
- `apps/server/src/app.ts` — `createApp` sem efeito colateral, testável por `app.request()`
- `apps/server/src/db/migrations.ts` — o provider estático; a tabela de D3-14 é a segunda
  migração, aditiva
- `apps/server/src/env.ts` — `DG2_DB`, `DG2_PORT`, `DG2_RELEASE`; o `static-auth-secret` do
  coturn entra aqui como variável de `/etc/dg2/env`
- `ops/Caddyfile` — o bloco `handle /ws` já existe sem consumidor; o CSP `connect-src 'self'`
  já cobre `wss://`; o comentário "SCHEDULED FOR PHASE 3" sobre a porta 443
- `ops/dg2.service:46,114-115` — o par `--max-old-space-size` / `MemoryMax` que a unit do
  coturn imita
- `ops/README.md` § 9 e § 10 — o agendado para a fase 3 e o orçamento de memória
- `public/sw.js:125-126` — `/api/` e `/ws` já passam direto pelo service worker
- `public/manifest.json:5-6` — `start_url` e `scope` em `"."`, a serem conferidos contra
  `?sala=` (D3-07)
- `tests/cross-engine.test.ts` e `vitest.browser.config.ts` — o portão de três motores;
  o round-trip do codec deve entrar nele
- `.github/workflows/ci.yml` — os portões existentes; o bench de D3-20 entra como passo
  próprio com o número impresso no log

### A criar nesta fase
- `src/net/` — `Transport`, `rtc.ts`, `signaling.ts` (cliente), `lobby.ts`, `local.ts`,
  `lossy.ts`
- `apps/server/src/signaling/` — `ws` com `noServer: true` no `upgrade`, salas em memória,
  credencial TURN, gravação do desfecho ICE
- `packages/protocol/src/snapshotCodec.ts` (ou equivalente) e as tabelas de enum novas
- `ops/turnserver.conf` + unit do coturn, na mesma convenção de `ops/`
- O bench do CI (D3-20) e a tela de lobby

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **`packages/protocol` já tem a espinha do protocolo**: `MSG_KIND` cobre o ciclo de vida
  inteiro de uma sessão (handshake, lobby, start, input, snapshot, ack), `REJECT_REASON` já
  tem `roomFull`/`roomClosed`/`badCode`, `CHANNEL_CLASS` já é `reliable`/`unreliable`, e
  `checkVersions` já implementa a recusa sem bypass. Esta fase acrescenta `ping`/`pong`,
  as tabelas de entidade e os corpos das mensagens — não redesenha.
- **`inputCodec.ts` é o modelo de estilo do codec de snapshot**: `DataView` LE, constantes
  de layout nomeadas, cabeçalho de comentário que explica cada byte, teste de round-trip
  e golden de fixture.
- **`serialize.ts` já resolve o round-trip do World** (`rng` como cursor, `-0` documentado)
  e `hashWorld` já é a comparação do tick 0 de D3-05 — sem código novo para a prova.
- **`createWorld` + `generateArena` + `startRun`** já são o caminho que o replay usa (D-11);
  D3-17 só o reaproveita para o cliente da sala.
- **`apps/server/src/index.ts` já exporta o `http.Server`** de propósito, com o comentário
  reservando o `upgrade` para o `ws`; `createApp` é testável sem socket, e o padrão
  (`app.ts` puro / `index.ts` com efeitos) é o que o signaling deve seguir.
- **O migrator do Kysely já existe** com a regra "só aditiva" (D2-07): a tabela de D3-14 é
  um objeto a mais em `migrations.ts`.
- **`ops/` já tem a convenção** (Caddyfile, units, scripts, README numerado) para o coturn
  entrar sem inventar formato; o `/ws` no Caddy e no service worker já estão prontos.
- **`tests/cross-engine.test.ts`** roda o mesmo golden em Chromium, Firefox e WebKit — o
  round-trip do codec e o `hashWorld` do tick 0 entram nele de graça.

### Established Patterns
- **Autoridade / peers / slots, nunca "host"** (FORM-12, grep em
  `tests/protocol-vocabulary.test.ts`). Vale para `src/net/` e para o signaling, inclusive
  nomes de mensagem e de variável. "Quem criou a sala" é como o **usuário** fala; no código
  é a autoridade.
- **Tabelas append-only com golden** — toda tabela nova segue `enums.ts` +
  `protocol-enums.test.ts`; a atualização do golden vai no mesmo commit da tabela.
- **Nada de rede dentro de `packages/sim`**: os três guardas (tsconfig sem DOM, lint,
  `purity.test.ts`) continuam. O codec importa tipos do sim, nunca o contrário.
- **`app.ts` puro / `index.ts` com efeitos** no servidor; **tela lê do `world`** no cliente
  (`syncScreens` uma vez por frame). O lobby não tem `World` ainda — é a única tela
  dirigida por estado de rede, e isso deve ficar dito no arquivo.
- **Config em `ops/`, segredos em `/etc/dg2/env`** (D2-15): o `static-auth-secret` do
  coturn é lido pelo servidor **e** pelo coturn do mesmo arquivo de env.
- **Vite não reescreve `public/`**: qualquer mudança em `sw.js` ou `manifest.json` para o
  `?sala=` de D3-07 passa pelo passo de build de `tools/sw/`.

### Integration Points
- **`src/main.ts:188` (`LOCAL_SLOT`) e `beginRun`** — o slot e o `RunConfig` passam a vir
  do lobby em vez de constante e de `buildRunConfig` local. Único ponto onde o jogo
  single-player e o co-op se encontram.
- **`apps/server/src/index.ts:76` → `server.on('upgrade')`** — a fronteira nova do servidor.
- **`ops/Caddyfile` `handle /ws`** → `reverse_proxy` → `ws` — já cabeado, sem consumidor.
- **`packages/protocol` ↔ `packages/sim`** — o codec lê `World`; as tabelas novas espelham
  os tipos do sim e são pinadas por teste (padrão `OBJECTIVE_KIND` ↔ `ObjectiveKind`).
- **`apps/server/src/db/migrations.ts`** — a tabela de desfecho ICE.
- **`.github/workflows/ci.yml`** — o bench de 16 KiB como portão.
- **Lobby ↔ `Save.data.settings`** — nome e cor entram no lobby a partir das settings
  locais; nada é gravado de volta.

### Constraints que limitam as opções
- **16 KiB por mensagem de DataChannel** (Firefox fragmenta, Chromium não remonta) — é
  restrição medida, e a razão de D3-19 e D3-20.
- **`dependencies: {}` no jogo publicado** — nenhuma biblioteca de WebRTC, signaling ou
  serialização no cliente; `RTCPeerConnection`, `WebSocket` e `DataView` nativos.
- **VPS de 2 GB** com Caddy, Node, SQLite, Litestream e agora coturn; ~128 MB reservados
  para o coturn (`ops/README.md` § 10).
- **A caixa não existe ainda** (02-04 adiado): o relay real, o coturn e a medição de ICE
  contra a internet só podem ser exercitados no fim. Testes locais precisam de dois
  contextos de navegador (Playwright já está no CI) e do `local.ts`.
- **`MSG_KIND` só aceita append** — qualquer mensagem nova entra no fim.
- **Versões diferentes recusam sempre** (D-08): testar co-op local exige o **mesmo build**
  nas duas abas; não existe bypass e não será criado.

</code_context>

<specifics>
## Specific Ideas

- **"O servidor só casa as pontas e esquece"** (D3-01) foi escolhido contra guardar o lobby
  no servidor justamente para que a falha de NAT apareça no lobby e não ao apertar
  iniciar — e para que a fase 4 não troque de transporte no meio.
- **"A sala nunca cai por causa de um convidado"** (D3-08) e **"a sala morre com quem a
  criou"** (D3-02) são as duas metades da mesma regra: um caminho só para "quem manda", e
  todo o resto degrada individualmente.
- **Solo é um caso de multiplayer** (D3-04): uma sala de um jogador inicia. É o que permite
  testar o pipeline inteiro sem amigo, e o que faz o single-player e o co-op partilharem
  `beginRun`.
- **A prova do tick 0** (D3-05): em vez de "confiar que a config chegou", cada cliente
  manda o `hashWorld` do mundo recém-criado. É barato, é o mesmo `hashWorld` do portão de
  três motores, e pega no lobby o que senão apareceria na fase 4 como "dessincronizou em
  40 segundos".
- **Medir em vez de estimar** (D3-14): a tabela de desfecho ICE existe para substituir os
  números de terceiros (10-20% de relay por par) pelo número real desta base de amigos, e
  as falhas entram na conta.
- **"Formato decidido aqui, encoder exercitado na fase 4"** (D3-18): a mesma lógica do
  roadmap para o codec vale para o delta — o cabeçalho já sabe o que é uma baseline, mesmo
  que nesta fase ela seja sempre vazia.
- **Particionar, não fragmentar** (D3-19): cada parte é um snapshot válido do que carrega;
  não há estado de remontagem num canal que perde pacotes.

</specifics>

<deferred>
## Deferred Ideas

Consequências registradas e portas que estas decisões deixaram encostadas:

- **Migração de autoridade** (lobby ou partida) — recusada em D3-02. Se um dia entrar,
  é redesenho da fase 5 em diante e contradiz D-37; hoje o caminho é "declarar a limitação
  aos amigos".
- **"Pronto" e timer de segurança no lobby** — recusados em D3-04. O timer de segurança
  aparece pela primeira vez no intervalo compartilhado (COOP-06, fase 5); se o lobby
  precisar de um depois, reaproveitar aquele.
- **Ticket de uso único para o WebSocket** — adiado (D3-09). Volta quando a origem se
  dividir ou houver cliente nativo; o ponto nomeado no `upgrade` é onde ele entra.
- **Endpoint `GET /api/rt/ice`** — não construído (D3-10). Se a fase 6 quiser quota de
  relay por conta, a credencial passa a ser emitida por sessão, ainda pelo signaling.
- **TURN sobre TLS na porta 443** — dívida registrada, não construída. Opções quando
  aparecer: app `layer4` do Caddy roteando por ALPN/SNI, ou segundo IP na VPS.
- **Encoder de delta, anel de baselines por peer, política de `ack` e backpressure** —
  fase 4, por medição. O formato de D3-18 já os prevê.
- **`apps/web`** — quarta vez adiado (D3-12). Reavaliar depois do primeiro deploy real
  contra a caixa (02-12).
- **Reconexão e ICE restart** — fase 5 (TEMP-04). D3-11 deixa o WebSocket vivo como gancho.
- **Cor da roupa vinda da conta** — CONTA-06, fase 6. Nesta fase ela vem das settings
  locais (D3-06).
- **`getStats()` na telemetria** — não adotado (D3-13). Se a fase 4 quiser comparar o RTT
  da aplicação com o do transporte, é um campo a mais na tabela de D3-14.
- **Interest management** — fora do marco (REQUIREMENTS.md); o particionamento de D3-19 não
  é filtro de relevância e não deve virar um por acidente.

Nenhum item de escopo criativo (chat, voz, emote, expulsar jogador, espectador) apareceu na
discussão — ela ficou dentro da fronteira da fase.

</deferred>

---

*Phase: 3-Sala, transporte e protocolo*
*Context gathered: 2026-09-02*
