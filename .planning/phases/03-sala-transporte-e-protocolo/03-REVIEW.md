---
phase: 03-sala-transporte-e-protocolo
reviewed: 2026-09-08T19:26:12Z
depth: standard
files_reviewed: 70
files_reviewed_list:
  - .github/workflows/ci.yml
  - apps/server/package.json
  - apps/server/src/db/migrations.ts
  - apps/server/src/db/open.ts
  - apps/server/src/env.ts
  - apps/server/src/index.ts
  - apps/server/src/signaling/index.ts
  - apps/server/src/signaling/limiter.ts
  - apps/server/src/signaling/outcome.ts
  - apps/server/src/signaling/rooms.ts
  - apps/server/src/signaling/schema.ts
  - apps/server/src/signaling/turn.ts
  - apps/server/tsconfig.json
  - ops/README.md
  - ops/coturn-dropin.conf
  - ops/turnserver.conf
  - packages/protocol/src/enums.ts
  - packages/protocol/src/index.ts
  - packages/protocol/src/roomCode.ts
  - packages/protocol/src/signaling.ts
  - packages/protocol/src/snapshotCodec.ts
  - packages/protocol/src/version.ts
  - src/app/forge.ts
  - src/main.ts
  - src/net/ice.ts
  - src/net/lobby.ts
  - src/net/local.ts
  - src/net/lossy.ts
  - src/net/ping.ts
  - src/net/rtc.ts
  - src/net/signaling.ts
  - src/net/transport.ts
  - src/render/sprites.ts
  - src/style.css
  - src/ui/dom.ts
  - src/ui/room.ts
  - tests/cross-engine.test.ts
  - tests/ice-route.test.ts
  - tests/lobby.test.ts
  - tests/net-signaling.test.ts
  - tests/net-vocabulary.test.ts
  - tests/net/e2e-helpers.ts
  - tests/net/helpers.ts
  - tests/net/room.spec.ts
  - tests/net/tsconfig.json
  - tests/ops-config.test.ts
  - tests/ping.test.ts
  - tests/protocol-enums.test.ts
  - tests/protocol-vocabulary.test.ts
  - tests/purity.test.ts
  - tests/pwa/helpers.ts
  - tests/pwa/room-url.spec.ts
  - tests/room-code.test.ts
  - tests/room-ui.test.ts
  - tests/rtc-shape.test.ts
  - tests/run-config-lobby.test.ts
  - tests/server-env.test.ts
  - tests/server-migrate.test.ts
  - tests/server-rooms.test.ts
  - tests/server-signaling.test.ts
  - tests/snapshot-bench.test.ts
  - tests/snapshot-codec.test.ts
  - tests/snapshots/protocol-enums.json
  - tests/snapshots/snapshot-codec.json
  - tests/turn.test.ts
  - tests/workspaces.test.ts
  - tests/worlds.test.ts
  - tests/worlds.ts
  - tools/README.md
  - tools/bench/snapshot.mjs
findings:
  critical: 3
  warning: 10
  info: 10
  total: 23
status: issues_found
---

# Fase 3: Relatório de Revisão de Código

**Revisado em:** 2026-09-08T19:26:12Z
**Profundidade:** standard
**Arquivos revisados:** 70
**Status:** issues_found

## Resumo

Revisão adversarial dos 70 arquivos da fase 3 (servidor de signaling em `apps/server/src/signaling/`, pacote `@dg2/protocol`, camada `src/net/`, tela de sala em `src/ui/room.ts`, configuração do coturn em `ops/`, CI e a suíte de testes). Todo dado que chega pela rede — mensagens de signaling, `lobbyState`, `startRun`, bytes de snapshot — foi tratado como controlado por um atacante, conforme o contexto do projeto.

A qualidade da base é alta: injeção de dependências consistente, validação all-or-nothing no lobby, decodificador de snapshot que recusa antes de alocar, limiter com teto de chaves, migrações aditivas, e uma suíte de testes que documenta os motivos de cada asserção. Os testes estruturais (anti-vacuidade por comprimento, filtro de comentários) são um padrão sólido.

Três problemas, porém, são bloqueantes:

1. **O relay copia `from` sem conferir o remetente** — dentro de uma sala, qualquer ocupante pode enviar `offer`/`answer`/`candidate` em nome de outro peer, o que permite sequestrar a negociação WebRTC de um vizinho. O cliente tampouco confere de quem aceita.
2. **`create`/`join` são aceitos com a sessão já numa sala** — um único socket cria salas sem limite (esgotamento de memória sob `MemoryMax=256M`) e deixa assentos-fantasma que nunca são liberados.
3. **O portão de versão (D-08) não é aplicado em lugar nenhum** — o servidor ignora `versions`, o `hello` entre peers não carrega versão, `checkVersions` só é chamado em testes, e `VERSIONS.sim` é a string `'unwired'`. Dois builds diferentes emparelham em silêncio.

Além disso, a telemetria de ICE (SALA-05) foi construída de ponta a ponta no servidor mas **nenhum cliente a envia**; `closed` nunca é emitido, `leave` nunca é enviado e `authorityReturned` nunca é chamado — a "graça de 60 s" hoje só atrasa a exclusão da sala. Detalhes abaixo.

## Problemas Críticos

### CR-01: O relay confia no campo `from` e permite spoofing de identidade na negociação WebRTC

**Arquivo:** `apps/server/src/signaling/index.ts:263-275` (e `:401-407`); `src/net/rtc.ts:306-336`
**Problema:** `relay()` verifica que o **destinatário** (`message.to`) está na sala do remetente, mas copia `message.from` **verbatim**, sem compará-lo com `session.peerId`. Um ocupante qualquer (já dentro da sala pelo código) pode enviar `{ kind: 'answer', from: <peerId da autoridade>, to: <peerId de um convidado>, sdp }` e o convidado aplica a resposta como se viesse da autoridade — `rtc.accept()` usa `message.from` para escolher a perna (`openLeg(message.from)`) sem conferir nada. Consequências: sequestro da negociação de um vizinho (o convidado fecha a conexão com o atacante em vez de com a autoridade), injeção de candidatos ICE falsos, e criação ilimitada de `RTCPeerConnection` no lado da vítima (cada `from` inventado vira uma perna nova em `legs`). O teste `tests/server-signaling.test.ts:279-299` só afirma que um `from` **honesto** chega intacto; não há teste com `from` forjado. O comentário do próprio `relay()` afirma a propriedade errada ("THE ADDRESSEE MUST BE IN THE SENDER'S ROOM") e nada sobre o remetente.
**Correção:**
```ts
// apps/server/src/signaling/index.ts — relay()
const relay = (ws: WebSocket, session: Session, message: Offer | Answer | Candidate): void => {
  const room = session.code === null ? undefined : deps.rooms.get(session.code);
  if (!room || !room.occupants.has(message.to)) {
    refuse(ws, 'badCode', 'destinatário não está nesta sala');
    return;
  }
  if (message.from !== session.peerId) {
    // The sender is the socket, never the body (same doctrine as T-3-24).
    refuse(ws, 'badCode', 'remetente não corresponde a esta conexão');
    return;
  }
  const target = byPeerId.get(message.to);
  if (!target) { refuse(ws, 'badCode', 'destinatário não está conectado'); return; }
  sendTo(target, { ...message, from: session.peerId });
};
```
E, como defesa em profundidade no cliente (`src/ui/room.ts:539-543`), o convidado só deve aceitar relay de `joined.authorityPeerId`, e a autoridade só de peers presentes no último `peers`/roster:
```ts
if (message.kind === 'offer' || message.kind === 'answer' || message.kind === 'candidate') {
  const allowed = authority ? knownPeers.has(message.from) : message.from === joined.authorityPeerId;
  if (allowed) rtc.accept(message);
  return;
}
```
Acrescentar em `tests/server-signaling.test.ts` um caso "um offer com `from` de outro peer é recusado e não chega ao destinatário".

### CR-02: `create`/`join` aceitos com a sessão já numa sala — criação ilimitada de salas e assentos-fantasma

**Arquivo:** `apps/server/src/signaling/index.ts:337-357` (create), `:360-398` (join); `apps/server/src/signaling/rooms.ts:187-214`
**Problema:** Nenhum dos dois handlers verifica `session.code !== null`. Duas consequências independentes:

1. **Esgotamento de memória com um socket só.** `create` não passa por nenhum limiter (o `joinLimiter` só cobre `join`; o `upgradeLimiter` só o handshake) e não há teto global de salas. Um cliente não-navegador (que forja `Origin` em uma linha, como o próprio comentário em `:180-185` admite) envia `create` em laço: cada mensagem cria um `Room` que vive 30 minutos (a autoridade continua conectada, então a graça nunca começa). A dezenas de milhares de mensagens por segundo, o processo atinge `MemoryMax=256M` em bem menos de um minuto e o kernel mata a unit — derrubando todas as salas legítimas.
2. **Assentos-fantasma.** Um peer em A que faz `join B` (ou `create`) troca `session.code`, mas o ocupante em A permanece no `Map` para sempre (o `close` só limpa `session.code` atual). O assento de A fica ocupado até A morrer — e um `join` **repetido na mesma sala** pelo mesmo peer (`rooms.ts:211-212`, `occupants.set(peer.peerId, occupant)` com `freeSlot` já contando o próprio assento) **muda o slot** do peer no meio do lobby e libera o antigo. Um fantasma também é um assento a menos para quem tem o código.

**Correção:**
```ts
// index.ts — no topo de case 'create' e case 'join'
if (session.code !== null) {
  refuse(ws, 'badCode', 'esta conexão já está numa sala — saia antes de entrar em outra');
  return;
}
```
```ts
// rooms.ts — teto global, exportado e testado
export const MAX_ROOMS = 1000;
const create = (peer: ArrivingPeer): Room | null => {
  if (rooms.size >= MAX_ROOMS) return null; // handler refuses with 'roomFull'
  ...
};
```
Além disso, um limiter por socket para mensagens em geral (mesma `createLimiter`, chave `session.peerId`, p.ex. 60/min) fecha a via de flood por `create`/`offer`. Acrescentar testes: "segundo create na mesma conexão é recusado", "join numa sala com a sessão já em outra é recusado", "MAX_ROOMS refusa o próximo create".

### CR-03: O portão de versão (D-08) não é aplicado em nenhum ponto do sistema

**Arquivo:** `apps/server/src/signaling/index.ts:338-342` e `:373-377`; `src/net/lobby.ts:688-693`; `packages/protocol/src/version.ts:97`; `src/main.ts:225`
**Problema:** D-08 e o cabeçalho de `version.ts` afirmam "DIFFERENT VERSIONS ALWAYS REFUSE, AND THERE IS NO DEV ESCAPE HATCH". Medido no código:
- O servidor recebe `message.versions` em `create` e `join` (o schema os exige) e **nunca os lê** — `Room` não guarda versões, e os `RejectReason` `simVersion`/`protocolVersion` nunca são emitidos por ele. O comentário em `packages/protocol/src/signaling.ts:94-98` promete exatamente o contrário ("lets the SERVER refuse a build it cannot pair with").
- O `hello` entre peers (`lobby.ts:688-693`) carrega `accountId, name, cls, color, forge` e **nenhuma versão**; `readAnnounce` não valida nenhuma.
- `checkVersions` não é chamado em `src/` nem em `apps/` — só em testes.
- `VERSIONS.sim` é o literal `'unwired'` em toda build (`main.ts:225`, registrado como stub), então mesmo que a comparação existisse, a metade `sim` compararia strings iguais.

Resultado: dois builds com `packages/sim` diferentes emparelham; o hash do tick 0 (D3-05) só pega divergência na **construção** do mundo, não em `step()`, então a divergência aparece "quarenta segundos depois, em outro lugar" — a falha que o projeto declara ser a mais cara. A UI já tem `versionRefusal()` em `room.ts:119-123` para um caminho que hoje nunca dispara.
**Correção:** (a) guardar `versions` no `Room` em `create` e comparar em `join` com `checkVersions(room.versions, message.versions)`, respondendo `{ kind: 'error', reason: mismatch.kind === 'sim' ? 'simVersion' : 'protocolVersion', detail: \`a sua é ${theirs}, a da sala é ${ours}\` }`; (b) incluir `versions` no `hello` e refutar em `onAnnounce` com `refuse(from, ...)` — o servidor é uma defesa, o peer é a outra; (c) ligar `VERSIONS.sim` a `packages/sim/dist/sim-version.json` via `import.meta.env`/`define` no `vite.config.ts` (o artefato já existe para o CI), ou, no mínimo, fazer o build falhar se `sim === 'unwired'` fora de `DEV`. Enquanto (c) não entrar, registrar em `03-VERIFICATION.md` que o critério D-08 **não** está fechado.

## Avisos

### WR-01: A telemetria de ICE (SALA-05) nunca é enviada pelo cliente — `buildOutcome` é código morto

**Arquivo:** `src/ui/room.ts:594-613`; `src/net/ice.ts:249-264`; `apps/server/src/signaling/outcome.ts`
**Problema:** A migração `002_ice_outcome`, `createOutcomeRecorder`, o handler `iceOutcome` e a cota de 20 por peer estão implementados e testados no servidor; `buildOutcome` está implementado e testado em `ice.ts`. Mas nenhuma linha de `src/` chama `buildOutcome` nem envia `{ kind: 'iceOutcome' }` — `armRouteProbe` só usa `routeOf` para pintar a rota. A tabela que existe para "substituir uma estimativa por uma medição" (D3-14) ficará vazia em produção, e o dimensionamento do coturn seguirá sendo o número emprestado que o código diz querer eliminar. A linha de falha (`result: 'failed'`) também nunca é gerada.
**Correção:** em `enter()` (`room.ts`), assinar `rtc.onPeerJoin`/`rtc.onPeerLeave` e, uma vez por perna, montar e enviar o desfecho:
```ts
const reported = new Set<string>();
const report = async (peer: string, result: 'connected' | 'failed') => {
  if (reported.has(peer)) return; reported.add(peer);
  const pc = rtc.connectionOf(peer);
  const stats = pc ? await routeOf(pc).catch(() => null) : null;
  c.send(buildOutcome(deps.ulid, {
    code: joined.code, slot: joined.slot,
    report: stats ?? EMPTY_REPORT, rttMs: null, result,
  }));
};
rtc.onPeerJoin((peer) => { void report(peer, 'connected'); });
rtc.onPeerLeave((peer, reason) => { if (reason === REASON_FAILED) void report(peer, 'failed'); });
```
`deps.ulid` vem de `src/app/ulid.ts` via `main.ts`. Acrescentar à spec `tests/net/room.spec.ts` uma asserção de que o servidor recebeu um `iceOutcome` por perna (o `recordOutcome` de `e2e-helpers.ts` pode coletar em vez de ser no-op).

### WR-02: `closed` nunca é emitido, `leave` nunca é enviado e `authorityReturned` nunca é chamado — o fim da sala é detectado só pelo timeout do ICE

**Arquivo:** `apps/server/src/signaling/index.ts:309-332` e `:409-420`; `apps/server/src/signaling/rooms.ts:234-251`; `src/ui/room.ts:625-643`; `src/net/rtc.ts:184-201` e `:254-258`
**Problema:** Três metades de um mesmo mecanismo estão desligadas:
- O servidor tem o tipo `Closed`, o `RejectReason` `roomClosed` e o handler em `room.ts:553` (`if (message.kind === 'closed') roomDead()`), mas **nunca envia** `closed` — nem quando a autoridade sai, nem quando `sweep()` remove a sala. Os convidados só descobrem que a sala acabou quando `pc.connectionState` chega a `'failed'` (`rtc.ts:256`), o que em Chromium leva vários segundos após o fechamento remoto; `rtc.ts` **não** liga `channel.onclose`, que seria o sinal rápido. A spec e2e (`room.spec.ts:175-179`) precisa de 25 s de timeout para observar isso.
- `teardown()` em `room.ts` fecha o WebSocket sem enviar `leave`; o handler `leave` do servidor (`:409-420`) é código que nenhum cliente exercita. E quando a autoridade **envia** `leave`, o servidor não zera `session.code`, então um `create` seguinte na mesma conexão sobrepõe a sessão (ver CR-02).
- `rooms.authorityReturned` está implementado e testado (`server-rooms.test.ts:256-292`), mas **nenhuma mensagem do protocolo o aciona**. A "graça de 60 s" — justificada por `systemctl reload caddy` em `rooms.ts:37-56` e `ops/README.md §9` — hoje só atrasa a exclusão: a autoridade que reconecta ganha um `peerId` novo, e `join` lhe dá um assento novo (ou `roomFull`) numa sala cujo `authorityPeerId` aponta para um socket morto; durante a graça, novos convidados entram e recebem esse `authorityPeerId` morto sem nenhum aviso. A verificação de `03-VERIFICATION.md` não deve tratar o cenário do reload do Caddy como coberto.
**Correção:** (1) no `close`/`leave` da autoridade e no `sweep()`, enviar `{ kind: 'closed', code, reason: 'roomClosed' }` a cada ocupante restante e desligar suas sessões da sala (`session.code = null`); (2) em `room.ts` `teardown()`, `client.send({ kind: 'leave', peerId })` antes de `client.close()`; (3) em `rtc.ts` `bindChannel`, `channel.onclose = () => fireLeave(leg, REASON_CLOSED)`; (4) ou implementar uma mensagem `rejoin` que chame `authorityReturned` (fase 5), ou remover a graça até então e documentar a regra operacional — meio mecanismo é pior que nenhum, pelo argumento do próprio arquivo.

### WR-03: `handle()` não tem `try/catch` — qualquer exceção no handler de mensagem derruba o processo inteiro

**Arquivo:** `apps/server/src/signaling/index.ts:300-307` e `:335-468`; `apps/server/src/signaling/rooms.ts:167-175`
**Problema:** `ws.on('message', ...)` chama `handle()` diretamente. `rooms.create` lança por design após `MAX_CODE_ATTEMPTS` colisões, e `deps.iceConfig` (`turnCredential`) pode lançar. Uma exceção num listener de `EventEmitter` vira `uncaughtException` → Node encerra → todas as salas da caixa morrem, e o `StartLimitBurst=5` de `dg2.service` pode deixar a unit em `failed`. O único `try` é o do `iceOutcome`. A robustez de "um erro numa sala nunca derruba outra" que o servidor promete depende de um invólucro que não existe.
**Correção:**
```ts
ws.on('message', (data: Buffer) => {
  const parsed = parseSignal(data.toString('utf8'));
  if (!parsed.ok) { sendTo(ws, parsed.error); return; }
  try {
    handle(ws, session, parsed.message);
  } catch (error) {
    deps.log('handler', { peerId: session.peerId, kind: parsed.message.kind,
      error: error instanceof Error ? error.message : String(error) });
    refuse(ws, 'badCode', 'o servidor não conseguiu processar a mensagem');
  }
});
```
E em `case 'create'`, tratar `null`/exceção de `rooms.create` com `refuse(ws, 'roomFull', ...)` em vez de propagar.

### WR-04: O `outbox` do cliente de signaling não é limpo na queda — `create`/`join` obsoletos são reenviados na reconexão

**Arquivo:** `src/net/signaling.ts:229`, `:310-324`, `:355-360`, `:375-378`
**Problema:** `enter()` empurra a mensagem para `outbox` quando o socket ainda não abriu. Se o socket cai antes de abrir, `dropped()` **rejeita a promessa** (`roomClosed`) mas deixa a mensagem no `outbox`; `armRetry()` reconecta e `onopen` a envia. O servidor então cria uma sala (ou entra numa) para uma conexão cujo cliente já desistiu: a tela mostra erro, mas a máquina é autoridade de uma sala-fantasma por 30 minutos (ou ocupa um assento-fantasma, ver CR-02). Um segundo clique em "criar sala" gera uma segunda sala na mesma conexão.
**Correção:** em `dropped()`, `outbox = []` junto com `settleRefusal(...)`; e em `enter()`, não enfileirar mensagens de entrada — se o socket não está aberto, rejeitar após um prazo ou só enviar dentro de `onopen` quando `pending` ainda for o mesmo objeto. Teste: "um create pendente quando o socket cai não é reenviado na reconexão".

### WR-05: Mensagens de erro erradas — `serverDown` e o caminho de retry de WebRTC (D3-08) são inalcançáveis

**Arquivo:** `src/ui/room.ts:431-446`, `:460-491`, `:615-623`; `src/net/lobby.ts:792-802`; `src/net/signaling.ts:321`
**Problema:** Três cruzamentos de fio:
- Quando o WebSocket cai durante `create`/`join`, `signaling.ts:321` converte a queda em `SignalRefused('roomClosed')`; `fail()` então mostra `REFUSAL_COPY.roomClosed` = "Essa sala não existe mais." para um servidor **fora do ar**. `COPY.serverDown` ("Não consegui falar com o servidor…") nunca é exibido em nenhum caminho.
- Quando a negociação WebRTC de um convidado falha (`rtc.ts` → `fireLeave(leg, REASON_FAILED)`), o lobby ignora `reason` (`lobby.ts:792`) e, como `peer === authorityPeerId`, dispara `onRoomDead` → "Quem criou a sala saiu. A sala acabou." — a sala está viva e quem saiu foi ninguém. O `btnRetryJoin` e `COPY.rtcFailed`, criados para D3-08 ("WebRTC failing is a retry, not a dead end", `dom.ts:162`), só são alcançáveis pelo erro de programação `'já há uma entrada de sala em curso'`.
- `joinRoom` marca como `retryable` qualquer erro que não seja `SignalRefused`, mostrando "Não consegui conectar com quem criou a sala" antes de qualquer tentativa de WebRTC.
**Correção:** distinguir a queda do socket na origem — `dropped()` rejeita com uma classe própria (`SignalingDisconnected`) ou com `reason: 'roomClosed'` mais um campo `cause: 'socket'`, e `fail()` mapeia isso para `COPY.serverDown`; no lobby, propagar `reason` em `onRoomDead(cb: (reason) => void)` e, em `room.ts`, tratar `REASON_FAILED` vindo da autoridade como `fail(new Error('rtc'), true)` (mostra `rtcFailed` + retry) em vez de `roomDead()`.

### WR-06: O convidado vê o **próprio** modo selecionado no lobby, não o modo que a autoridade vai iniciar

**Arquivo:** `src/ui/room.ts:563`; `src/net/lobby.ts:663-676`
**Problema:** `el.lobbyMode.textContent = deps.identity().mode === 'endless' ? ... : ...` lê a seleção local. O `lobbyState` (`{ authorityPeerId, closed, occupants }`) não carrega o modo, e o modo só viaja em `startRun`. Um convidado com "SEM FIM" selecionado na tela inicial verá "MODO · SEM FIM" enquanto a autoridade iniciará "CAMPANHA". Etiqueta incorreta na única tela que existe para alinhar expectativas antes da run.
**Correção:** incluir `mode: GameMode` no corpo de `lobbyState` (validado em `readLobbyState` contra `GAME_MODE`) e um `mode` no `LobbyView`; a autoridade o lê de `deps.identity().mode` a cada `publish()`; `paintLobby` pinta `el.lobbyMode` a partir de `view.mode`. Atualizar `tests/lobby.test.ts` (`lobbyState()` fixture) e a guarda all-or-nothing.

### WR-07: `crypto.randomUUID()` no topo de `main.ts` quebra o boot fora de contexto seguro (teste em celular via LAN)

**Arquivo:** `src/main.ts:235`
**Problema:** `Crypto.randomUUID()` é `[SecureContext]`: em `http://192.168.x.x:5173` (o cenário de "testar num celular, onde o NAT residencial aparece", que os planos citam) a função é `undefined` e a linha lança `TypeError` na avaliação do módulo — o jogo inteiro (inclusive o modo solo) deixa de carregar, não só a sala. `crypto.getRandomValues` (já usado em `newSeed`) está disponível em qualquer contexto.
**Correção:**
```ts
const accountId = Array.from(crypto.getRandomValues(new Uint8Array(16)), b => b.toString(16).padStart(2, '0')).join('');
```
(32 hex, o mesmo teto `MAX_ACCOUNT_ID` do schema.)

### WR-08: `rtc.ts` nunca fecha nem remove uma perna que falhou; `pc` morto continua em `legs` e recebe `getStats()` a cada segundo

**Arquivo:** `src/net/rtc.ts:254-258`, `:175-182`, `:338-340`, `:378-390`
**Problema:** Em `connectionState === 'failed'`, `fireLeave` marca `leg.gone = true` mas não chama `pc.close()` nem `legs.delete(peer)`. A `RTCPeerConnection` falha continua reservando portas/candidatos até `close()` do transporte; `connectionOf(peer)` a devolve, e `armRouteProbe` (`room.ts:599-609`) continua chamando `routeOf(pc)` nela enquanto o ocupante estiver `connected` no roster. Um `accept()` posterior para o mesmo `from` retorna a perna morta (`openLeg` devolve `existing`) e sai em `if (leg.gone) return` — a reconexão da fase 5 encontrará um estado que não pode reutilizar.
**Correção:** em `fireLeave`, após notificar: `for (const ch of leg.channels.values()) ch.close(); leg.pc.close(); legs.delete(leg.peer);` — e em `openLeg`, tratar `existing?.gone` como ausente.

### WR-09: `ops/turnserver.conf` anuncia TLS na 5349 sem `cert`/`pkey`, e a deny-list omite três faixas relevantes

**Arquivo:** `ops/turnserver.conf:26`, `:71-79`; `apps/server/src/signaling/turn.ts:106`; `ops/README.md §12` (linhas 557-588)
**Problema:** `turn.ts` emite `turns:${domain}:5349` para todo peer com credencial, mas a config não tem `cert=`/`pkey=` e o runbook §12 não tem o passo de apontar o coturn para o certificado que o Caddy renova (nem a permissão de leitura sob `ProtectSystem=strict`). O coturn sobe sem o listener TLS e loga o erro; o navegador tenta `turns:` e falha — exatamente para a população (firewall que só deixa TLS passar) para a qual a URL existe. Além disso, a deny-list cobre IPv4 privado e ULA IPv6 mas não `fe80::/10` (link-local IPv6, o par do `169.254.0.0/16` já bloqueado), `100.64.0.0/10` (espaço CGNAT, usado por provedores de VPS em redes internas) nem `::ffff:0:0/96` (IPv4 mapeado em IPv6, que pode contornar as regras v4 dependendo da normalização). O teste `tests/ops-config.test.ts:596-619` afirma **exatamente oito** linhas, então a correção precisa atualizar os dois juntos.
**Correção:** acrescentar em `turnserver.conf`:
```
cert=/etc/letsencrypt/live/SEU_DOMINIO/fullchain.pem   # ou o caminho do Caddy, ver §12
pkey=/etc/letsencrypt/live/SEU_DOMINIO/privkey.pem
denied-peer-ip=100.64.0.0-100.127.255.255
denied-peer-ip=fe80::-febf:ffff:ffff:ffff:ffff:ffff:ffff:ffff
denied-peer-ip=::ffff:0.0.0.0-::ffff:255.255.255.255
```
documentar em §12 de onde vem o certificado (Caddy em `/var/lib/caddy/.local/share/caddy/certificates/...` exige `ReadOnlyPaths` no drop-in ou uma cópia por hook), e atualizar a contagem do teste para 11. Alternativa honesta: remover `turns:` de `iceServers()` até o passo existir, com o motivo escrito.

### WR-10: O nome de usuário TURN carrega o código da sala em texto claro — a única credencial da sala vaza na rede de acesso

**Arquivo:** `apps/server/src/signaling/turn.ts:71-77`
**Problema:** `username = \`${expiry}:${roomCode}:${slot}\``. O atributo USERNAME de STUN/TURN viaja em claro em `turn:` sobre UDP e TCP (só `turns:` cifra). Um observador no caminho entre o jogador e o relay (Wi-Fi aberto, provedor) lê o código de seis caracteres, que em D3-09 é a única credencial da sala, e entra nela. A "amarração à sala" que D3-10 quer não exige o código em claro.
**Correção:** amarrar sem revelar — `const tag = createHmac('sha256', secret).update(\`${roomCode}:${slot}\`).digest('base64url').slice(0, 16); const username = \`${expiry}:${tag}\`;` — o operador ainda correlaciona uma linha do journal com uma sala recomputando o HMAC com o segredo que já tem. Atualizar o vetor de `tests/turn.test.ts` (o teste é sobre HMAC-SHA1 do username, que continua valendo).

## Informativos

### IN-01: `touch` é chamado para qualquer peer, mas o comentário e o teste falam em "mensagem da autoridade"

**Arquivo:** `apps/server/src/signaling/index.ts:404`; `apps/server/src/signaling/rooms.ts:98`, `:216-219`
**Problema:** `lastSeen` é documentado como "When the authority last spoke" e o TTL como "sem mensagem da autoridade", mas `touch()` roda para `offer`/`answer`/`candidate` de qualquer ocupante. Um convidado mantém viva uma sala cuja autoridade está muda há horas (mas conectada).
**Correção:** `if (session.code !== null && room.authorityPeerId === session.peerId) deps.rooms.touch(...)`, ou corrigir a documentação para "qualquer ocupante".

### IN-02: `authorityReturned` reinsere o ocupante no fim do `Map`, quebrando a "ordem de chegada" do roster

**Arquivo:** `apps/server/src/signaling/rooms.ts:242-246`
**Problema:** `occupants.delete` + `occupants.set` move a autoridade para o fim da iteração; `rosterOf()` promete "in arrival order". Sem efeito hoje (WR-02), mas será quando a fase 5 usar a função.
**Correção:** reconstruir o `Map` preservando a posição, ou guardar um `arrivedAt`/índice explícito no `Occupant` e ordenar por ele.

### IN-03: Cadeira "conectando" pinta a faixa verde

**Arquivo:** `src/ui/room.ts:737`
**Problema:** `pingBand(o.connected ? o.ping : 0)` passa `0` para um assento desconectado → `'fx-pos'` (verde) sob o texto "conectando". A cor não é o único sinal, mas é o sinal errado.
**Correção:** `pingBand(o.connected ? o.ping : null)` ou uma classe neutra quando `!o.connected`.

### IN-04: O convidado aceita um segundo `startRun` e reinicia a run

**Arquivo:** `src/net/lobby.ts:775-789`
**Problema:** `startRoom` é idempotente na autoridade, mas o caminho do convidado não confere `started !== null` antes de disparar `startCbs` de novo — um segundo quadro (autoridade defeituosa, ou reenvio) reconstrói o mundo no meio da partida.
**Correção:** `if (started) return;` antes de `started = config`.

### IN-05: `rttMs` chega sem limites e vai para uma coluna `integer`

**Arquivo:** `apps/server/src/signaling/schema.ts:286`; `apps/server/src/signaling/outcome.ts:139`
**Problema:** `z.number().nullable()` aceita negativos e frações; SQLite grava `REAL` numa coluna de afinidade `INTEGER`. Consultas de percentil misturam tipos.
**Correção:** `z.number().int().min(0).max(60_000).nullable()` no schema, ou `Math.round` + clamp em `record()`.

### IN-06: `readEntry` devolve `peers`, `slot`, `ice` e `turn` por cast, sem validar

**Arquivo:** `src/net/signaling.ts:203-220`
**Problema:** `peers as readonly PeerInfo[]`, `slot as PeerInfo['slot']`, `ice as unknown as IceConfig`. Uma resposta malformada do servidor chega a `createRtcTransport`/`createLobby` como se fosse válida. Consistente com o resto do módulo ser "estreito de propósito", mas `slot` fora de `PLAYER_SLOT` e `peers` sem `peerId` são baratos de recusar.
**Correção:** validar `slot` contra `PLAYER_SLOT` e cada `peers[i].peerId` como string não vazia; recusar com `settleRefusal('badCode', ...)` como já se faz para o envelope.

### IN-07: A topologia de desenvolvimento não permite testar com um segundo aparelho

**Arquivo:** `apps/server/src/index.ts:88`; `apps/server/src/env.ts:79`; `src/main.ts:211-213`
**Problema:** O servidor escuta só em `127.0.0.1`, `DG2_ORIGIN` padrão é `http://localhost:5173`, e o cliente em `DEV` monta `ws://${location.hostname}:8080/ws`. Um celular na LAN abrindo `http://192.168.x.x:5173` recebe 403 (origem diferente) e, mesmo com `DG2_ORIGIN` ajustado, não alcança um servidor em loopback. O plano 03-11 prevê a "primeira sessão real de quatro jogadores" como checagem manual; hoje ela exige a caixa ou um túnel.
**Correção:** documentar em `ops/README.md` (ou num `docs/dev.md`) o passo de dev-LAN (`DG2_ORIGIN=http://<ip>:5173`, um `DG2_BIND` opcional só em `DG2_RELEASE=dev`), ou registrar explicitamente que o teste com dois aparelhos só acontece contra a VPS.

### IN-08: `SNAPSHOT_MAX_BYTES` não é aplicado pelo codec, e `put8`/`put16` truncam contagens sem aviso

**Arquivo:** `packages/protocol/src/snapshotCodec.ts:112`, `:606`, `:622`, `:642`, `:650`, `:666-671`
**Problema:** O teto de 16 KiB só é verificado em testes e no bench. `encodeSnapshot` aloca o buffer pelo tamanho real mas escreve a contagem com `& 0xff`/`& 0xffff`, então um registro com >65535 inimigos (ou >255 jogadores num registro forjado) produz uma mensagem internamente inconsistente que `readCount` não pega (a contagem declarada é menor que os bytes). O comentário (c) do cabeçalho descreve uma "partição" que só existe por classe de entidade — não há mecanismo para uma parte que cruze o teto.
**Correção:** em `encodeSnapshot`, lançar se `part.byteLength > SNAPSHOT_MAX_BYTES` (ou devolver um resultado que a fase 4 possa tratar), e lançar em `encodeActors`/`encodeProjectiles`/`encodePickups` se alguma contagem exceder o tipo do campo. Reescrever o comentário (c) para dizer que a partição é por classe e que o teto é um portão externo.

### IN-09: Os botões de reiniciar iniciam uma run **solo** enquanto uma sessão de sala está viva

**Arquivo:** `src/main.ts:529-531`, `:558`; `src/ui/room.ts` (nenhum `leave()` nesses caminhos)
**Problema:** `btnRestart`, `btnVictoryRestart` e o restart da pausa chamam `startFromSelection()` sem consultar a sala. A autoridade que "reinicia" após um game over co-op começa uma run local de um jogador com o lobby, os pingers e a conexão dos convidados ainda ativos; os convidados ficam num mundo terminado sem aviso. O badge continua visível.
**Correção:** enquanto uma sessão existir, os botões de reiniciar voltam à sala (`room.open()` ou um `room.restart()` que reemite `startRun` pela autoridade) em vez de `startFromSelection()`; para convidados, o botão deve estar ausente como o `▶ INICIAR`.

### IN-10: `readRelayFlag` chama `localStorage` sem proteção no boot

**Arquivo:** `src/net/ice.ts:292`, `:300`; `src/main.ts:51-55`
**Problema:** `setItem` lança `QuotaExceededError`/`SecurityError` em Safari privado ou com armazenamento bloqueado; a chamada está no topo de `main.ts`, antes de qualquer tela, e a flag é só depuração. `Save` pré-existente provavelmente já assume o mesmo, mas esta é uma dependência nova e evitável no caminho crítico do boot.
**Correção:** envolver `setItem`/`getItem` em `try { ... } catch { return false; }` dentro de `readRelayFlag` — uma flag de depuração que não persiste é preferível a um jogo que não abre.

---

_Revisado em: 2026-09-08T19:26:12Z_
_Revisor: Claude (gsd-code-reviewer)_
_Profundidade: standard_
