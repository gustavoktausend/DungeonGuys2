---
phase: 03-sala-transporte-e-protocolo
fixed_at: 2026-09-08T23:39:09Z
review_path: .planning/phases/03-sala-transporte-e-protocolo/03-REVIEW.md
iteration: 1
findings_in_scope: 13
fixed: 13
skipped: 0
status: all_fixed
---

# Fase 3: Relatório de Correção da Revisão de Código

**Corrigido em:** 2026-09-08T23:39:09Z
**Revisão de origem:** .planning/phases/03-sala-transporte-e-protocolo/03-REVIEW.md
**Iteração:** 1

**Resumo:**
- Achados no escopo (`critical_warning`): 13 — CR-01..CR-03 e WR-01..WR-10
- Corrigidos: 13 (dois com sub-itens adiados por decisão registrada, ver "Decisões e desvios")
- Pulados: 0
- Fora do escopo (não tocados): IN-01..IN-10

Cada achado virou um commit atômico `fix(03): …` no branch de correção
`gsd-reviewfix/03-98`, criado a partir de `main` em `8f9cb93` e integrado a
`main` por fast-forward ao final. Toda correção veio com o teste que a pina no
mesmo commit; os três críticos ganharam teste de regressão dedicado.

## Rodada completa de verificação (resultado real)

Executada no worktree isolado, no estado final do branch (`856b80f`):

| Verificação | Comando | Resultado |
|---|---|---|
| Suíte Node | `npm test` (`vitest run`) | **60 arquivos, 919 testes, 0 falhas** (baseline antes das correções: 886 testes; 33 novos) |
| Lint | `npm run lint` (`eslint .`) | **0 erros, 0 avisos** |
| Tipos | `typecheck:sim`, `typecheck:protocol`, `typecheck:server`, `typecheck:net`, `typecheck:pwa`, `tsc --noEmit` (raiz) | **todos com saída 0** |
| Build | `npm run build` (sim:build → sim:version → tsc → vite build → sw:emit) e `npm run sw:verify` | **ok**; o bundle publicado carrega `sha256:cf4cf671d9d1e56c` como `VERSIONS.sim` e zero ocorrências de `unwired` |
| E2E de sala | `npx playwright test --project=net` (Chromium real, três contextos, loopback) | **1 passed (41,9 s)**, incluindo as asserções novas de SALA-05 e a saída da autoridade sob o novo mapeamento de falha |

`apps/server/package.json` não declara scripts; `npm test` e `npm run lint` da
raiz cobrem o servidor (os testes do servidor rodam na mesma suíte e os tipos em
`typecheck:server`).

Observação sobre `tests/lint-coverage.test.ts` (WR-22): esse caso estourou o
timeout de 5 s duas vezes ao longo do trabalho — na rodada de baseline no
worktree, **antes de qualquer correção**, e numa rodada de conferência no
checkout principal depois do fast-forward (6,3 s). Nas duas, o restante da
suíte passou (918/919). Rodado sozinho no checkout principal, passa em ~0,8 s,
duas vezes seguidas; na rodada completa final do worktree passou dentro da
suíte. Nenhum dos 13 commits toca `eslint.config.js` nem esse teste (medido:
`git log 8f9cb93..HEAD` sobre os dois arquivos é vazio). O que acontece é o
`isPathIgnored` do ESLint disputando CPU com 60 arquivos em transformação
paralela numa máquina fria; é uma condição de ambiente pré-existente, não do
código desta correção, e fica registrada aqui para não ser lida como
regressão.

## Problemas corrigidos

### CR-01: O relay confia no campo `from` e permite spoofing de identidade

**Arquivos modificados:** `apps/server/src/signaling/index.ts`, `src/ui/room.ts`, `tests/server-signaling.test.ts`, `tests/room-ui.test.ts`
**Commit:** `4fb8bdf`
**Correção aplicada:** `relay()` compara `message.from` com `session.peerId` e recusa a divergência (`badCode`, "remetente não corresponde a esta conexão"); o que chega ao destinatário é reenviado com `from` restabelecido a partir da sessão. No cliente, `relayAllowed()` (função pura exportada) só entrega ao `rtc.accept()` um relay vindo da autoridade nomeada em `created`/`joined` (convidado) ou de um peer presente no último roster `peers` (autoridade); o roster é substituído inteiro a cada `peers`. Teste de regressão: três peers numa sala, o terceiro assina uma `answer` como a autoridade endereçada ao segundo — recebe `error`, e a vítima não recebe nada (asserido com um helper `silence`).

### CR-02: `create`/`join` aceitos com a sessão já numa sala — salas ilimitadas e assentos-fantasma

**Arquivos modificados:** `apps/server/src/signaling/index.ts`, `apps/server/src/signaling/rooms.ts`, `tests/server-rooms.test.ts`, `tests/server-signaling.test.ts`
**Commit:** `5e58853`
**Correção aplicada:** `seatedAlready()` recusa `create` e `join` quando `session.code !== null` (antes do balde de join, para não gastar ficha numa recusa que não é palpite). `MAX_ROOMS = 1000` em `rooms.ts`; `create()` passa a devolver `Room | null` e o handler responde `roomFull` no teto. `rooms.join()` virou idempotente por `peerId` (o assento existente é devolvido, sem trocar de slot). Testes: segundo `create` na mesma conexão recusado; `join` noutra sala com a sessão já sentada recusado sem tocar a segunda sala; `MAX_ROOMS + 1` devolve `null` e uma sala varrida libera a vaga; `join` repetido mantém o slot.

### CR-03: O portão de versão (D-08) não é aplicado em lugar nenhum

**Arquivos modificados:** `apps/server/src/signaling/rooms.ts`, `apps/server/src/signaling/index.ts`, `src/net/lobby.ts`, `src/ui/room.ts`, `src/main.ts`, `src/vite-env.d.ts` (novo), `vite.config.ts`, `tests/lobby.test.ts`, `tests/run-config-lobby.test.ts`, `tests/server-rooms.test.ts`, `tests/server-signaling.test.ts`
**Commit:** `808bcbe`
**Correção aplicada:** (a) `Room` guarda `versions` (copiado, não aliasado) do `create`; `rooms.join()` compara com `checkVersions(room.versions, peer.versions)` e recusa com `simVersion`/`protocolVersion` carregando o `mismatch`; o handler compõe o `detail` "A da sala é X." (texto livre, nunca condição). O `create` também recusa `protocolVersion` quando o eixo `protocol` difere do `PROTOCOL_VERSION` do servidor — a metade que o servidor consegue julgar sozinho. (b) O `hello` entre peers carrega `versions`; `readAnnounce` exige o par (bounded a 64 chars) e descarta um `hello` sem ele; `onAnnounce` refuta com `checkVersions(self.versions, hello.versions)` e o `reject` passa a carregar `detail` (bounded a 200); `onRejected(reason, detail)` e a tela usam `versionRefusal` também no caminho entre peers. (c) `VERSIONS.sim` deixa de ser o literal `'unwired'`: `vite.config.ts` lê `packages/sim/dist/sim-version.json` e injeta `__SIM_VERSION__` via `define`; um `vite build` sem o artefato **recusa** (medido: falha com a mensagem que aponta `npm run sim:build && npm run sim:version`); só o dev server usa o placeholder. Medido no bundle: `sha256:cf4cf671d9d1e56c` presente, `unwired` ausente.

### WR-01: A telemetria de ICE (SALA-05) nunca é enviada pelo cliente

**Arquivos modificados:** `src/ui/room.ts`, `src/net/ice.ts`, `src/main.ts`, `tests/net/e2e-helpers.ts`, `tests/net/room.spec.ts`, `tests/room-ui.test.ts`
**Commit:** `8bb0d0b`
**Correção aplicada:** `armOutcomeReports()` (exportada, testável em Node) assina `rtc.onPeerJoin`/`onPeerLeave` e envia uma linha por perna: `connected` quando os dois canais abrem (rota lida de `getStats()`), `failed` quando o transporte desiste com `REASON_FAILED` (a conexão ainda está lá porque `fireLeave` avisa antes de fechar — WR-08). Leitura que falha envia `UNKNOWN_ROUTE` (agora exportado de `ice.ts`) em vez de nada. `RoomDeps.ulid` vem de `src/app/ulid.ts` via `main.ts`. `e2e-helpers.ts` coleta os desfechos e a spec afirma que as duas pontas da perna A–B reportaram `connected`/`direct` — passou no Chromium.

### WR-02: `closed` nunca emitido, `leave` nunca enviado, `authorityReturned` nunca chamado

**Arquivos modificados:** `apps/server/src/signaling/index.ts`, `apps/server/src/signaling/rooms.ts`, `src/net/rtc.ts`, `src/ui/room.ts`, `tests/server-signaling.test.ts`, `tests/server-rooms.test.ts`, `tests/room-ui.test.ts`, `tests/rtc-shape.test.ts`
**Commit:** `5c782d9`
**Correção aplicada:** `closeRoom()` no servidor envia `{ kind: 'closed', reason: 'roomClosed' }` a cada ocupante restante e desliga a sessão dele (`session.code = null`), em dois eventos: o `leave` explícito da autoridade (que agora apaga a sala na hora via `rooms.remove()`, sem graça) e a varredura (`sweep(onRemove)` entrega cada sala removida ao callback). `join` durante a graça é recusado com `roomClosed`. O `leave` de qualquer peer zera `session.code` antes de qualquer ramo. No cliente, `teardown()` envia `leave` antes de fechar o socket, e `rtc.ts` liga `channel.onclose → fireLeave(REASON_CLOSED)` como sinal rápido. Ver "Decisões e desvios" para o que NÃO foi feito e por quê.

### WR-03: `handle()` sem `try/catch`

**Arquivos modificados:** `apps/server/src/signaling/index.ts`, `apps/server/src/signaling/rooms.ts`, `tests/server-signaling.test.ts`, `tests/server-rooms.test.ts`
**Commit:** `b3422cc`
**Correção aplicada:** `ws.on('message')` envolve `handle()` em `try/catch`: a exceção vira linha no journal (`handler`, com `peerId` e `kind`) e recusa `badCode` ao remetente. `create` só liga a sessão à sala depois de `iceConfig()` e devolve a sala (`rooms.remove`) se a emissão lançar; `join` devolve o assento (`rooms.leave`). Teste com `iceConfig` lançando: a conexão sobrevive, nenhuma sala fica meio-aberta, e o mesmo socket cria/entra depois com o slot certo.

### WR-04: `outbox` do signaling não é limpo na queda

**Arquivos modificados:** `src/net/signaling.ts`, `tests/net-signaling.test.ts`
**Commit:** `666d8b6`
**Correção aplicada:** `dropped()` esvazia o `outbox` inteiro. A fila inteira, e não só a mensagem de entrada, porque nada enfileirado antes da queda pode valer depois dela: o servidor dá um `peerId` novo por conexão, então qualquer relay guardado seria recusado na porta (CR-01) e um `create`/`join` guardado seria aceito para uma tela que já desistiu. Teste: `create` pendente + queda antes de abrir → reconexão com outbox vazio, e um novo pedido manda um só `create`.

### WR-05: Mensagens de erro erradas — `serverDown` e o retry de WebRTC inalcançáveis

**Arquivos modificados:** `src/net/signaling.ts`, `src/net/lobby.ts`, `src/ui/room.ts`, `tests/net-signaling.test.ts`, `tests/lobby.test.ts`, `tests/room-ui.test.ts`
**Commit:** `76c55ac`
**Correção aplicada:** `SignalRefusal`/`SignalRefused` ganham `source: 'server' | 'local' | 'socket'`; a queda do socket rejeita com `source: 'socket'` e `fail()` mostra `COPY.serverDown`. `onRoomDead(cb: (reason) => void)` propaga a palavra do transporte. Na tela, um `REASON_FAILED` da autoridade **antes de a perna ter aberto** vai para `rtcFailed()` (volta à tela da sala com `COPY.rtcFailed` e o botão de tentar de novo, D3-08); depois de conectada, continua sendo `roomDead()` (D3-02). `joinRoom` deixa de marcar qualquer erro como `retryable`. **Requer verificação humana**: o caminho "negociação falhou antes de abrir" não é exercitável pelo e2e em loopback; a e2e cobriu a saída limpa da autoridade (passou com a frase do contrato).

### WR-06: O convidado vê o próprio modo, não o da autoridade

**Arquivos modificados:** `src/net/lobby.ts`, `src/ui/room.ts`, `tests/lobby.test.ts`, `tests/run-config-lobby.test.ts`, `tests/room-ui.test.ts`
**Commit:** `ca0a837`
**Correção aplicada:** `LobbyDeps.mode: () => GameMode` (lido a cada `publish()`), `mode` no corpo do `lobbyState` validado contra `GAME_MODE` (all-or-nothing), `LobbyView.mode: GameMode | null` (null no convidado até o primeiro roster). A tela pinta `el.lobbyMode` por `modeLabel(view.mode)` em `paintLobby`, e `enter()` pinta o estado inicial na hora (`paintLobby(lobby.state())`) em vez de esperar a primeira emissão. Teste: a autoridade troca de modo e o convidado vê a troca na emissão seguinte; `mode` inválido descarta a mensagem inteira.

### WR-07: `crypto.randomUUID()` quebra o boot fora de contexto seguro

**Arquivos modificados:** `src/main.ts`, `tests/run-config-lobby.test.ts`
**Commit:** `a604907`
**Correção aplicada:** `accountId` sai de `crypto.getRandomValues(new Uint8Array(16))` em 32 hex (o teto `MAX_ACCOUNT_ID` do schema; forma medida em Node). Asserção estrutural: `main.ts` não contém `randomUUID`.

### WR-08: `rtc.ts` nunca fecha nem remove uma perna que falhou

**Arquivos modificados:** `src/net/rtc.ts`, `tests/rtc-shape.test.ts`
**Commit:** `b5ee1de`
**Correção aplicada:** `fireLeave()` avisa os ouvintes e **depois** fecha os canais, fecha a `RTCPeerConnection` e remove a perna de `legs`; `openLeg()` trata uma perna `gone` como ausente; `close()` passa a delegar a `fireLeave`. A ordem (avisar, depois fechar) é pinada pelo teste estrutural porque é o que permite ao WR-01 ler o último par tentado.

### WR-09: `turns:` na 5349 sem `cert`/`pkey`, e deny-list com três faixas faltando

**Arquivos modificados:** `apps/server/src/signaling/turn.ts`, `ops/turnserver.conf`, `ops/README.md`, `tests/turn.test.ts`, `tests/ops-config.test.ts`
**Commit:** `58f7ff0`
**Correção aplicada:** Escolhida a alternativa que o próprio revisor chamou de honesta: `iceServers()` **deixa de anunciar** `turns:` até existir o passo do certificado (o motivo está escrito em `turn.ts`, em `turnserver.conf` e numa subseção nova de §12 do runbook — "TLS na 5349: declarada, não anunciada"). A porta continua declarada e no firewall. Deny-list ganha `100.64.0.0/10` (RFC 6598), `fe80::/10` e `::ffff:0:0/96`; `tests/ops-config.test.ts` passa a contar **onze** linhas e as exceções de D2-15 (`NON_ROUTABLE_V4`/`V6`) admitem exatamente os pontos das faixas novas. Ver "Decisões e desvios".

### WR-10: O username do TURN carrega o código da sala em texto claro

**Arquivos modificados:** `apps/server/src/signaling/turn.ts`, `ops/turnserver.conf`, `tests/turn.test.ts`
**Commit:** `856b80f`
**Correção aplicada:** `username = ${expiry}:${tag}` com `tag = HMAC-SHA256(secret, "code:slot")` em base64url cortado a 16 chars; a credencial continua HMAC-SHA1/base64 sobre o username (o que o `use-auth-secret` do coturn calcula). Vetor novo pinado (`1756003600:gKGiQi0WbgIIl_0a` / `gGxahfL6eQwogZHqSL0McNChs6g=`) e confirmado por dois caminhos independentes (`node:crypto` e `openssl`); a receita de dois passos está no cabeçalho do teste. O teste afirma que o username não contém o código nem o slot e que o tag é chaveado.

## Decisões e desvios em relação à sugestão do revisor

- **WR-02 — `closed` NÃO é enviado quando o socket da autoridade cai (início da graça).** O revisor sugeriu enviar no `close`. Fazer isso derrubaria as sessões de DataChannel de quatro jogadores por causa de um `systemctl reload caddy` que só tocou a perna de signaling — exatamente o cenário para o qual a graça de 60 s foi escrita em `rooms.ts`. `closed` sai no `leave` explícito e quando a varredura apaga a sala de fato; entre os dois, o convidado descobre pelo DataChannel (`channel.onclose`, agora ligado). Registrado no comentário de `closeRoom()`.
- **WR-02 — item (4), `authorityReturned`, continua sem gatilho.** Ligá-lo exige uma mensagem `rejoin` no protocolo (fase 5, TEMP-04); remover a graça reverteria uma decisão escrita e dois testes que a pinam. O meio-termo aplicado: `join` durante a graça é recusado com `roomClosed`, para que ninguém receba um `authorityPeerId` morto, e a interface documenta que a função não está ligada nesta fase. **Item adiado, não corrigido**; a verificação da fase não deve tratar o cenário de reload do Caddy como coberto.
- **CR-02 — limiter por socket para mensagens em geral (o "além disso" do revisor) não foi implementado.** As duas medidas estruturais fecham a via de flood por `create` (uma sala por conexão + `MAX_ROOMS`, com o `upgradeLimiter` limitando reconexões por endereço). Um teto genérico de 60/min por socket corre o risco de cortar uma rajada legítima de trickle ICE da autoridade (três pernas × dezenas de candidatos nos primeiros segundos), e o número certo é uma medição que a primeira sessão real (03-11) ainda vai fornecer — o mesmo motivo pelo qual `UPGRADE_LIMIT` está marcado como "não afinado".
- **WR-05 — o retry (D3-08) vale para a perna da autoridade que falha ANTES de abrir; uma perna que abriu e depois falhou continua sendo "a sala acabou".** O revisor propôs tratar todo `REASON_FAILED` da autoridade como retry. A leitura aplicada segue a copy do contrato ("Não consegui conectar com quem criou a sala") e mantém a spec e2e honesta: com a autoridade sumindo no meio da sessão, um "tente de novo" levaria a um `join` numa sala em graça, que agora é recusado.
- **WR-09 — `turns:` removida em vez de `cert=`/`pkey=` acrescentados.** A VPS não existe, o certificado é renovado pelo Caddy num diretório que o usuário do coturn não lê, e uma cópia manual "funciona até a primeira renovação e depois falha sem log do lado do jogo" — o modo de falha que os testes de `ops/` existem para impedir. O dia em que o passo entrar no runbook, a URL volta em uma linha e `tests/turn.test.ts` cobra três URLs de novo.
- **CR-03 — o `create` também é julgado no eixo `protocol` pelo servidor.** Não estava na sugestão, mas é a promessa que o comentário de `packages/protocol/src/signaling.ts` já fazia ("lets the SERVER refuse a build it cannot pair with"); custa uma linha e um teste.

## Problemas pulados

Nenhum. Os dois sub-itens adiados (`authorityReturned` e o limiter por socket) estão descritos acima com o motivo.

## Fora do escopo desta iteração

IN-01 a IN-10 não foram tocados (escopo `critical_warning`). Dois deles ganharam cobertura lateral sem edição dedicada: IN-04 (segundo `startRun` no convidado) continua aberto; IN-06 (`readEntry` por cast) continua aberto.

## Estado da integração

- Branch `gsd-reviewfix/03-98`: 13 commits sobre `8f9cb93`, integrados a `main` por `git merge --ff-only` (`8f9cb93..856b80f`, 24 arquivos, +1760/−202); branch temporário apagado após o fast-forward. `main` está em `856b80f`.
- Worktree em `…/scratchpad/sv-03-reviewfix-EZvt4C`: `git worktree remove --force` desregistrou o worktree mas não conseguiu apagar o diretório na primeira tentativa ("Directory not empty", bloqueio de arquivo do Windows logo depois do Playwright); pela ordem transacional, a sentinela foi **mantida** nesse instante. Na tentativa seguinte o diretório foi apagado, `git worktree prune` confirmou a lista limpa, e só então `.review-fix-recovery-pending.json` foi removida.
- Estado final do repositório principal: `git status` mostra apenas este arquivo como não rastreado; nenhum worktree extra, nenhum branch `gsd-reviewfix/*`.
- Este arquivo (`03-REVIEW-FIX.md`) ficou **não commitado** no repositório principal, conforme combinado.

---

_Corrigido em: 2026-09-08T23:39:09Z_
_Corretor: Claude (gsd-code-fixer)_
_Iteração: 1_
