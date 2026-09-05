# Phase 3: Sala, transporte e protocolo - Research

**Researched:** 2026-09-02
**Domain:** WebRTC em estrela (sala, lobby, ICE/TURN), signaling por WebSocket, e codec binário quantizado de snapshot
**Confidence:** HIGH nas partes medidas neste repositório e verificadas em fonte oficial; MEDIUM nas escolhas de dimensionamento (TTL, frequência de ping, cotas)

> Rótulos de estrutura em inglês porque são lidos por ferramenta. Conteúdo em português,
> como o resto dos documentos do projeto — mesma convenção do `03-CONTEXT.md`.
>
> **Aviso ao planejador:** o gate de cobertura de decisões do GSD não lê `D3-nn`. A cobertura
> das vinte decisões pelos planos precisa ser conferida à mão ou pelo plan-checker.

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

Copiadas verbatim de `03-CONTEXT.md` § Implementation Decisions. **Não reabrir.**

**Sala e lobby (SALA-01, SALA-02, SALA-03)**

- **D3-01:** **WebRTC abre no join e o lobby trafega nele.** A máquina de quem criou a sala
  é a autoridade do lobby; `lobbyState` vai pelo canal `reliable`. O servidor só casa as
  pontas (signaling) e não guarda regra nenhuma de sala.
- **D3-02:** **A sala morre com quem a criou.** Se a autoridade fecha a aba ou cai antes de
  iniciar, todos voltam ao menu com aviso claro ("quem criou a sala saiu"). Não existe
  migração de autoridade, nem no lobby. O servidor apaga a sala quando o WebSocket da
  autoridade fecha.
- **D3-03:** **Classes repetidas são permitidas.** Distinguidas pela cor de roupa por
  jogador (D3-06, rampa de recolor de D-22) e, na fase 5, pelo nome sobre a cabeça.
- **D3-04:** **Quem criou inicia quando quiser, inclusive sozinho.** Sem estado de "pronto"
  e sem timer. Uma sala com um jogador inicia normalmente — **solo passa a ser um caso de
  multiplayer**.
- **D3-05:** **Ao iniciar, nesta fase, cada máquina cria o World e compara o hash do
  tick 0.** `startRun` entrega o `RunConfig`; cada cliente roda `createWorld` +
  `generateArena` localmente e manda o `hashWorld` do tick 0 à autoridade pelo canal
  `reliable`; divergência vira erro na tela, com os dois hashes. A run começa **local e sem
  sincronia**.
- **D3-06:** **A cor da roupa viaja no `lobbyState` como dado de apresentação**, fora do
  `RunConfig` e fora do sim. Vem de `Save.data.settings.colors[cls]`.
- **D3-07:** **Entrada por código e por link.** `https://<domínio>/?sala=CODIGO`. O lobby
  tem "copiar link". O service worker e o `start_url` do PWA não podem tratar a query como
  página nova nem cacheá-la como shell distinto.
- **D3-08:** **Um convidado que não conecta falha sozinho.** Mensagem distinta de
  "conectado com lag", botão "tentar de novo". **A sala nunca cai por causa de um
  convidado.**

**Signaling e TURN sem conta (SALA-04)**

- **D3-09:** **O `upgrade` do WebSocket confere só origem e rate limit.** Sem sessão até a
  fase 6. O peer se apresenta com o `accountId` local (ULID não-reivindicado, ADR 0002) e o
  nome das settings, como dado **auto-declarado**. A checagem de sessão fica como **um único
  ponto nomeado** no `upgrade`.
- **D3-10:** **A credencial efêmera de TURN vem pelo próprio signaling**, na resposta de
  criar ou entrar na sala: `username` e `credential` (HMAC do `static-auth-secret`, TURN
  REST API) com TTL curto (1 h), amarrados à sala. **Não existe endpoint HTTP aberto.** O
  cliente nunca vê o segredo. `user-quota` e `total-quota` são o teto de abuso.
- **D3-11:** **O WebSocket de signaling continua vivo durante a partida**, com keepalive.
  A sala em memória some quando o WebSocket da autoridade fecha.
- **D3-12:** **`apps/web` fica na raiz — terceira vez.** O código de rede do cliente nasce
  em `src/net/` e move junto quando for a hora. Reavaliar **depois do primeiro deploy real**.

**Ping, rota e telemetria ICE (SALA-05)**

- **D3-13:** **"Ping" é uma mensagem `ping`/`pong` própria no canal `unreliable`.** `ping` e
  `pong` são **acrescentados ao fim** da `MSG_KIND`, e o golden
  `tests/snapshots/protocol-enums.json` muda **no mesmo commit**. `getStats()` não é a fonte
  do número da tela.
- **D3-14:** **O desfecho ICE vai para uma tabela append-only no SQLite**, reportado pelo
  peer via o WebSocket já aberto: sala, slot, rota, par de candidatos local/remoto (tipo e
  transporte), RTT, resultado, data. Sem dado pessoal além do ULID local. **Falha de conexão
  também gera linha.** Segunda migração, aditiva (D2-02/D2-07).
- **D3-15:** **A tela mostra ping e rota no lobby por slot, e num indicador discreto durante
  a run.** A tabela guarda o par completo, a tela não.
- **D3-16:** **A autoridade relaya o resumo de ping e rota de cada slot no `lobbyState`**,
  atualizado a cada segundo.

**Codec do snapshot (SYNC-04)**

- **D3-17:** **A camada estática é derivada da seed em cada cliente.** O snapshot **nunca**
  carrega `obstacles`, `traps`, `play` nem `config`.
- **D3-18:** **O formato nasce com baseline e `ack`; só o snapshot completo é implementado
  aqui.** O cabeçalho carrega o `tick` e o tick da baseline (0 = completo). O encoder de
  delta e o anel de baselines são a **fase 4**.
- **D3-19:** **Quando um snapshot não cabe em 16 KiB, ele é particionado por classe de
  entidade em mensagens independentes e auto-contidas**: jogadores e inimigos numa,
  projéteis noutra, moedas/poções/baús noutra — cada uma com `tick` e índice de parte,
  **sem remontagem**. O bench assere **cada parte** abaixo de 16 KiB na wave 16 e numa wave
  de endless declarada no código como teto conhecido. Fragmentar e remontar por conta
  própria está recusado.
- **D3-20:** **O bench do CI usa um World sintético de pior caso construído pelas fórmulas
  do próprio sim** (`4 + wave*3`, ×1,6 com `swarm`, mais chefe; projéteis e moedas nos tetos
  plausíveis; quatro jogadores equipados). Um teste secundário confere que uma run real
  jogada até a wave 16 fica **abaixo** do sintético.

### Claude's Discretion

Áreas que esta pesquisa resolve — as recomendações estão na seção
`## Recommendations for Claude's Discretion`, item por item, com fonte.

- Alfabeto e tamanho exato do código de sala · TTL de sala ociosa e keepalive do WebSocket ·
  Vocabulário do signaling e como é validado · `Transport` como interface + `local.ts` +
  `lossy.ts` · Perfect negotiation com a autoridade como o lado impolido · Como ligar a flag
  de debug do relay · Porta 443 fica com o Caddy; coturn em 3478/5349 com unit e `MemoryMax`
  · Implementação do rate limit do `upgrade` · Layout binário exato do snapshot · Tabelas de
  enum que faltam congelar · Onde o codec mora · Frequência do ping e janela de média ·
  Texto, layout e fluxo das telas · Ordem interna da fase.

### Deferred Ideas (OUT OF SCOPE)

Migração de autoridade · "Pronto" e timer no lobby · Ticket de uso único para o WebSocket ·
Endpoint `GET /api/rt/ice` · TURN sobre TLS na 443 · Encoder de delta, anel de baselines,
`ack` e backpressure · `apps/web` · Reconexão e ICE restart · Cor vinda da conta ·
`getStats()` na telemetria de RTT · Interest management.

**Nada desta lista deve aparecer num plano desta fase.**

</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Descrição (REQUIREMENTS.md) | O que desta pesquisa sustenta |
|----|------------------------------|-------------------------------|
| **SALA-01** | Um jogador cria uma sala e recebe um código curto, sem ambiguidade de caracteres | § Discretion #1 (alfabeto Crockford já existente em `src/app/ulid.ts:20`, 6 caracteres = 30 bits, geração no servidor com `node:crypto`), § Pitfall 6 (enumeração) |
| **SALA-02** | Até três jogadores entram pelo código e se veem no lobby | § Discretion #3 (vocabulário de signaling), #4 (`Transport`), #5 (perfect negotiation), § Architecture Patterns (diagrama e fluxo) |
| **SALA-03** | Cada jogador escolhe sua classe no lobby e quem criou a sala inicia a run | § Discretion #4 e #13 (lobby dirigido por `local.ts`, `LOCAL_SLOT` deixa de ser constante), § Code Examples #5 |
| **SALA-04** | A sala fecha atrás de NAT residencial brasileiro, usando relay quando a direta falha | § Discretion #6 (flag de relay), #7 (coturn: portas, drop-in de systemd, `MemoryMax`, quotas), § Code Examples #3, § Environment Availability |
| **SALA-05** | A tela mostra ping e tipo de rota, e o cliente registra o desfecho ICE | § Discretion #11 (frequência e janela do ping), #12 (`getStats` só para a rota; campos verificados no W3C), § Code Examples #4, § Validation |
| **SYNC-04** | O snapshot cabe no limite de mensagem do DataChannel numa wave 16 com quatro jogadores | § Measured Baseline (números novos, medidos hoje neste repositório), § Discretion #8 (layout byte a byte), #9 (tabelas), #10 (onde mora), #14 (bench) |
| **FORM-12** (metade pendente) | Topologia estrela, uma perna por mensagem, input da autoridade pela mesma tabela | § Architecture Patterns Padrão 1 (a interface `Transport` **sem** `broadcast`), § Anti-Patterns AP2 |

</phase_requirements>

---

## Summary

Esta fase tem três blocos com riscos muito diferentes, e a pesquisa mudou o peso relativo
deles.

**O codec é o bloco de menor risco, e a medição de hoje prova isso.** Rodei o `saveWorld`
deste repositório contra mundos sintéticos: **4 jogadores na wave 16 com `swarm` e todo
inimigo elite dão 82 KiB de JSON**, e a wave 40 de endless dá 158 KiB — números maiores do
que os 38–60 KB extrapolados em `PITFALLS.md` § 4, porque a extrapolação de lá não contava
projéteis, loot e jogadores equipados. Com o layout binário desta pesquisa, o mesmo mundo dá
**2,85 KiB somando as três partes**, e a maior parte sozinha (jogadores + inimigos) dá
**1,44 KiB** — dez vezes abaixo do teto de 16 KiB. O particionamento de D3-19 só começaria a
morder por volta da **wave 210**. Isso não torna D3-19 inútil: torna-o uma estrutura que o
formato carrega e um teste força, em vez de um caminho que o jogo percorre.

**O bloco de sala e transporte é o de risco médio, e o risco está nos detalhes de borda**,
não no WebRTC. O padrão de perfect negotiation da MDN se aplica literalmente, com a
autoridade como o lado impolido, e o `ws` com `noServer: true` é exatamente a forma
documentada de autenticar antes do handshake. As três armadilhas que valem o preço da
pesquisa são: (a) o evento `upgrade` do Node é emitido **no lugar** de `request`, então
`hono-rate-limiter` — a opção que o CONTEXT levanta — nunca roda ali, por construção; (b) o
Caddy **substitui** o `X-Forwarded-For` de origem não confiável, então limitar por
`socket.remoteAddress` limitaria a internet inteira num balde só, porque atrás do proxy todo
mundo é `127.0.0.1`; (c) `systemctl reload caddy` **fecha as WebSockets ativas**, o que sob a
leitura estrita de D3-02 apagaria todas as salas em jogo.

**O bloco de TURN é o de maior risco residual, e é o único que não fecha nesta sessão.** O
coturn mora na VPS, o 02-04 segue adiado, e o critério 3 não pode ser dado como fechado
antes dele — como o `STATE.md` já registra. O que esta pesquisa acrescenta é o formato
concreto (drop-in de systemd em vez de unit copiada, porque o pacote Debian já traz a sua) e
um alerta operacional: o `static-auth-secret` vive em **dois** arquivos, `/etc/turnserver.conf`
e `/etc/dg2/env`, e trocá-lo num só quebra o relay em silêncio.

**Primary recommendation:** implemente o codec e o `Transport` em processo primeiro — os dois
são puros, testáveis em Node, e destravam o bench de CI que fecha SYNC-04 sem depender da
caixa. Faça o append de `ping`/`pong` junto do golden no primeiro commit de protocolo, para
que nenhum plano posterior precise mexer numa tabela congelada. Deixe coturn, credencial HMAC
e medição real de ICE nas últimas ondas.

---

## Measured Baseline

**Medido hoje, neste repositório**, com `tsx` sobre `@dg2/sim` — não extrapolado. Mundos
construídos pelas fórmulas do próprio sim (`makeEnemy`, `makeElite`, `startNextWave`),
quatro jogadores equipados com os oito primeiros itens do `EQUIPMENT`, todo inimigo com
elite aplicado (pior caso do mutador `elite`).

| Cenário | `saveWorld` em JSON | inimigos | jogadores | projéteis | loot | estático |
|---|---|---|---|---|---|---|
| 4 jogadores, wave 1 (7 inimigos) | **21,0 KiB** | 4,0 KiB | 5,2 KiB | 5,1 KiB | 2,0 KiB | 3,3 KiB |
| 4 jogadores, **wave 16 + swarm + elite** (83 inimigos) | **82,0 KiB** | 47,1 KiB | 5,2 KiB | 16,1 KiB | 8,9 KiB | 3,3 KiB |
| 4 jogadores, wave 40 endless + swarm + elite (198 inimigos) | **158,0 KiB** | 111,7 KiB | 5,2 KiB | 23,5 KiB | 12,9 KiB | 3,3 KiB |

**Custo por entidade em JSON: inimigo 581 B, jogador 1338 B.** `PITFALLS.md` § 4 registrou
725 B e 1261 B; a diferença no inimigo é de composição de campos (o mundo de lá não tinha
elite em todos), e a ordem de grandeza confere. `[VERIFIED: medição própria em
packages/sim, 2026-09-02]`

Três consequências que o planejador precisa carregar:

1. **A wave 1 com 4 jogadores já passa de 16 KiB — 21,0 KiB medidos.** O número de 13,8 KB
   do roadmap era um mundo mais magro. A conclusão do roadmap (o codec é requisito, não
   otimização) fica **mais** forte, não menos.
2. **Os inimigos são 57% do payload na wave 16 e 71% na wave 40.** É onde o codec compra
   tudo o que compra.
3. **A camada estática (obstacles + traps + play) são 3,3 KiB constantes**, e D3-17 já a tira
   do fio inteiramente. Sozinho, isso é 20% da wave 1.

---

## Architectural Responsibility Map

| Capacidade | Tier primário | Tier secundário | Por que esse tier é o dono |
|---|---|---|---|
| Criar sala / gerar código | API/Backend (`apps/server`) | — | O código precisa ser único entre salas vivas e imprevisível; só o servidor vê o conjunto e tem CSPRNG confiável |
| Casar as pontas (SDP, ICE candidates) | API/Backend (signaling `ws`) | — | Duas máquinas atrás de NAT não têm outro rendezvous. O servidor relaya bytes opacos e não interpreta nada (D3-01) |
| Emitir credencial TURN | API/Backend | — | O `static-auth-secret` nunca sai do servidor (D3-10) |
| Estado do lobby (quem está, classe, cor, pronto para iniciar) | Browser/Client — **a autoridade** | — | D3-01: o servidor não guarda regra de sala. O lobby é `lobbyState` sobre o canal `reliable` |
| Atribuição de slots `p0..p3` | Browser/Client — **a autoridade** | — | ADR 0001: a autoridade atribui na ordem de entrada quando a sala fecha |
| Negociação WebRTC (offer/answer/candidate) | Browser/Client (`src/net/rtc.ts`) | Backend só como correio | Perfect negotiation é papel de par, não de servidor |
| Codificar / decodificar snapshot | `packages/protocol` (bytes) | `src/net/` na fase 4 (hidratação) | O codec tem de compilar em browser **e** em Node (worker de replay, servidor dedicado futuro). Ver § Discretion #10 |
| Medir RTT da aplicação | Browser/Client (canal `unreliable`) | — | D3-13: o RTT que importa é o do caminho que input e snapshot vão usar |
| Detectar rota (direto/relay) | Browser/Client (`getStats()`) | — | Só o `RTCPeerConnection` sabe qual par de candidatos venceu |
| Persistir desfecho ICE | API/Backend (SQLite) | Cliente reporta | D3-14: sobrevive à rotação do journald e entra no backup de graça |
| Derivar arena/obstáculos da seed | Browser/Client (`@dg2/sim`) | — | D3-17: um jeito só de construir o mundo inicial, o mesmo do replay (D-11) |
| Terminar TLS, servir estático, proxy do `/ws` | CDN/Static (Caddy) | — | Já cabeado em `ops/Caddyfile`, sem consumidor |
| Relay de mídia/dados quando ICE direto falha | Infra (coturn) | — | Única implementação livre madura de TURN |

**Onde uma capacidade seria misatribuída por acidente:** guardar o `lobbyState` no servidor
(seria mais fácil de escrever e contradiria D3-01, e a falha de NAT só apareceria ao apertar
iniciar), e deixar o servidor de signaling validar SDP (ele é correio, não parte; validar
SDP acopla o servidor à versão do WebRTC dos clientes).

---

## Project Constraints (from CLAUDE.md)

Diretivas acionáveis extraídas de `./CLAUDE.md`. **Autoridade igual à das decisões travadas.**

| # | Diretiva | Consequência direta para esta fase |
|---|---|---|
| C-1 | **`dependencies: {}` no jogo publicado** | Zero biblioteca de WebRTC, signaling ou serialização no cliente. `RTCPeerConnection`, `WebSocket`, `DataView`, `crypto.getRandomValues` nativos. Nada de `simple-peer`, `socket.io`, `peerjs` |
| C-2 | **`packages/sim` não referencia DOM, `window`, `performance`, `Date`, `Math.random`, nem importa de `render/`/`ui/`/`app/`** | `src/net/` entra na lista proibida (ARCHITECTURE Padrão 2): `eslint.config.js` `no-restricted-imports` e `tests/purity.test.ts:78` `FORBIDDEN_LAYER` ganham `net` |
| C-3 | **`packages/protocol` nasceu com `dependencies: {}`; `zod` pode viver só em `apps/server`** | Ver § Discretion #3: tipos no protocolo, validação com zod no servidor, ligadas por asserção de tipo em tempo de compilação |
| C-4 | **Passo fixo `DT_MS = 1000/60`** | O ping (D3-13) mede em milissegundos de parede, não em ticks — mas o `tick` viaja junto na mensagem para correlacionar com a fase 4 |
| C-5 | **`WORLD = { w: 2400, h: 1600 }`, `TILE = 32`** | Define a faixa de quantização de posição. `TILE` "provavelmente muda quando a arte nova entrar" — `WORLD` não, e é `WORLD` que o codec usa |
| C-6 | **Comentários de código em inglês; documentos e commits em português** | Vale para `src/net/`, `apps/server/src/signaling/`, `packages/protocol/src/snapshotCodec.ts` |
| C-7 | **Não usar `Math.sin/cos/atan2` em `packages/sim`; `sim/math.ts` é o substituto** | O codec **não** faz trigonometria; reusa `AIM_STEP` de `inputCodec.ts` para ângulos |
| C-8 | **Nada de SaaS (Firebase/Supabase/PlayFab/Nakama); auto-hospedagem** | O signaling é `ws` próprio, o TURN é coturn próprio. STUN público só como candidato **adicional** |
| C-9 | **Sem TURN público/grátis** | Open Relay e similares estão fora |
| C-10 | **`skipWaiting()` só entre runs** | Já resolvido em `public/sw.js:112-115` (mensagem `SKIP_WAITING`) e em D2-09. D3-07 acrescenta: o `?sala=` não pode virar uma entrada nova de cache |
| C-11 | **`ws` 8.21.3 com `noServer: true` + `server.on('upgrade')`** — "não use `new WebSocketServer({ server })`" | Verificado: é a única forma de recusar antes do handshake |
| C-12 | **Guardar salas no banco está proibido** — sala é estado efêmero, `Map<code, Room>` em memória | Só o **desfecho ICE** vai para o SQLite (D3-14), nunca a sala |
| C-13 | **Node 24 LTS na VPS; migrações Kysely só aditivas** | A tabela de D3-14 é a segunda entrada em `apps/server/src/db/migrations.ts` |
| C-14 | **Rate limiting em `/api/auth/*`, `/api/rt/ice` e upload de run** (variante "público aberto") | Nesta fase, o alvo é o `upgrade` e a tentativa de entrar por código. Ver § Discretion #7 |
| C-15 | **Todo o trabalho passa por comando GSD** (§ GSD Workflow Enforcement) | Nenhuma edição direta fora de `/gsd:execute-phase` |

**Nenhuma recomendação desta pesquisa contradiz estas quinze diretivas.** A única que chega
perto é a validação do signaling: a resposta (§ Discretion #3) mantém `packages/protocol` com
`dependencies: {}` e põe o `zod` só em `apps/server`, exatamente como C-3 permite.

---

## Standard Stack

### Core

Esta fase adiciona **duas** dependências ao repositório inteiro, ambas em `apps/server`.

| Biblioteca | Versão | Onde | Propósito | Por que é o padrão |
|---|---|---|---|---|
| `ws` | **8.21.3** | `apps/server` (`dependencies`) | Servidor WebSocket do signaling | Padrão de fato no Node; `noServer: true` + `server.on('upgrade')` é a forma documentada de autenticar antes de completar o handshake. Zero dependência obrigatória. `[VERIFIED: npm registry + Context7 /websockets/ws]` |
| `@types/ws` | **8.18.1** | `apps/server` (`devDependencies`) | Tipos | Necessário porque `apps/server/tsconfig.json` tem `types: ["node"]` e `strict: true` `[VERIFIED: npm registry]` |

### Supporting

| Biblioteca | Versão | Onde | Quando usar |
|---|---|---|---|
| `zod` | **4.5.4** | `apps/server` (`dependencies`) | Validação de toda mensagem de signaling que entra pela rede. **Opcional** — ver § Discretion #3 para a alternativa sem dependência e o motivo de eu recomendar adotá-la mesmo assim `[VERIFIED: npm registry]` |
| `node:crypto` | (do Node 24) | `apps/server` | `randomInt`/`randomBytes` para o código de sala; `createHmac('sha1', …)` para a credencial TURN. Zero instalação |

### Alternatives Considered

| Em vez de | Poderia usar | Trade-off |
|---|---|---|
| `ws` 8.21.3 | `uWebSockets.js` | Milhares de conexões por processo. Não está no npm, é C++, e o projeto não terá mil salas. `STACK.md` já recusou |
| `ws` no servidor | `socket.io` | Acrescenta runtime **no cliente**, o que viola C-1. Recusado em `STACK.md` § What NOT to Use |
| `RTCPeerConnection` direto | `simple-peer` 9.11.1 | Sem publicação desde 26/01/2023. Recusado em `STACK.md` |
| Signaling próprio | PeerJS + broker | Esconde a config de ICE que esta fase **precisa** controlar. Recusado em `STACK.md` |
| `zod` no servidor | Type guards escritos à mão | Zero dependência, mas ~120 linhas de guarda para doze mensagens, e a guarda e o tipo divergem em silêncio. Ver § Discretion #3 |
| `hono-rate-limiter` 0.5.3 | — | **Não se aplica aqui.** O evento `upgrade` do Node é emitido **no lugar** de `request`, então middleware Hono nunca vê a requisição. Além disso a 0.5.3 declara `unstorage ^1.17.3` como peer obrigatório `[VERIFIED: npm registry + nodejs.org/api/http]` |
| coturn próprio | TURN público/grátis | Recusado em C-9 e em `STACK.md` |

**Installation:**

```bash
# apps/server apenas. O cliente NÃO ganha nenhuma dependência (C-1).
npm install --workspace apps/server ws@8.21.3 zod@4.5.4
npm install --workspace apps/server --save-dev @types/ws@8.18.1

# VPS (Debian/Ubuntu), na onda que depende do 02-04:
sudo apt-get install -y coturn
```

**Version verification** (executada em 2026-09-02):

```
npm view ws version              -> 8.21.3   (modificado 2026-08-07)
npm view @types/ws version       -> 8.18.1   (modificado 2025-08-03)
npm view zod version             -> 4.5.4    (modificado 2026-08-29)
npm view hono-rate-limiter version -> 0.5.3  (peer: hono ^4.10.8, unstorage ^1.17.3)
```

`zod` subiu de 4.5.1 (registrado em `CLAUDE.md`) para **4.5.4**. `ws` e `@types/ws` batem
com o documento. `[VERIFIED: npm registry, 2026-09-02]`

---

## Package Legitimacy Audit

Executado com `slopcheck` (instalado nesta sessão) contra o registro npm, mais consulta
direta ao registro e à documentação oficial via Context7.

| Pacote | Registro | Idade | Downloads/semana | Repositório | slopcheck | Disposição |
|---|---|---|---|---|---|---|
| `ws` | npm | 14 anos (criado 2011-12-04) | **269.847.194** | github.com/websockets/ws | **[OK]** | **Aprovado** |
| `@types/ws` | npm | 10 anos (criado 2016-05-17) | **72.216.596** | DefinitelyTyped | **[OK]** | **Aprovado** |
| `zod` | npm | — | — | github.com/colinhacks/zod | não rodado | **[ASSUMED]** — já citado em `CLAUDE.md` § Supporting Libraries; rodar `slopcheck install zod` antes de instalar |

**Pacotes removidos por veredito [SLOP]:** nenhum.
**Pacotes marcados [SUS]:** nenhum.

`npm view ws scripts` não mostra `postinstall`. As entradas `bufferutil` e `utf-8-validate`
que aparecem no manifesto do `ws` são **peer dependencies opcionais** (aceleradores nativos),
não dependências obrigatórias — o `ws` roda em JS puro sem elas. `[VERIFIED: npm registry]`

> `slopcheck install` terminou com um traceback do Python **depois** de imprimir os dois
> vereditos: ele tenta invocar `npm install` em seguida e a chamada falha neste Windows. O
> veredito é válido e **nada foi instalado**. Se o executor quiser repetir a checagem, use
> `python -m slopcheck install <pkg>` e leia só a parte acima do traceback.

**Nenhuma dependência nova entra em `packages/sim`, `packages/protocol` ou na raiz.** Um
teste desta fase deve assertar isso: `tests/workspaces.test.ts` já existe e é o lugar.

---

## Architecture Patterns

### System Architecture Diagram

```
                      ┌──────────────────── VPS (uma caixa) ────────────────────┐
                      │                                                          │
 navegador            │   Caddy :443                    Node :8080 (loopback)    │
 (autoridade)         │   ┌──────────────┐              ┌─────────────────────┐  │
 ┌────────────┐       │   │ handle /ws   ├─ upgrade ───▶│ server.on('upgrade')│  │
 │ criar sala ├───────┼──▶│ reverse_proxy│              │  · Origin           │  │
 │            │  wss  │   ├──────────────┤              │  · rate limit / IP  │  │
 │            │◀──────┼───┤ X-Fwd-For    │              │  · [ponto da fase 6]│  │
 └─────┬──────┘       │   ├──────────────┤              └──────────┬──────────┘  │
       │              │   │ handle /api/*│                         │             │
       │              │   ├──────────────┤              ┌──────────▼──────────┐  │
       │              │   │ handle (est.)│              │ salas: Map<code,Room>│ │
       │              │   └──────────────┘              │ (memória, C-12)     │  │
       │              │                                 └──────────┬──────────┘  │
       │              │                                            │             │
       │              │   coturn :3478 udp/tcp                     ▼             │
       │              │          :5349 tls          ┌──────────────────────────┐ │
       │              │   ┌───────────────┐         │ SQLite: ice_outcome      │ │
       │              │   │ use-auth-secret│◀── mesmo│ (append-only, D3-14)     │ │
       │              │   │ denied-peer-ip │  segredo└──────────────────────────┘ │
       │              │   └───────▲───────┘                                       │
       └──────────────┴───────────┼───────────────────────────────────────────────┘
                                  │ relay quando ICE direto falha
       ┌──────────────────────────┼──────────────────────────┐
       │                          │                          │
       ▼                          ▼                          ▼
 ┌───────────┐            ┌───────────┐              ┌───────────┐
 │ convidado │            │ convidado │              │ convidado │
 │    p1     │            │    p2     │              │    p3     │
 └─────┬─────┘            └─────┬─────┘              └─────┬─────┘
       │                        │                          │
       └────────────────────────┴──────────────────────────┘
                       TODAS as pernas vão à AUTORIDADE.
                       Nenhuma perna p1↔p2 existe (FORM-12).

   Por perna, dois DataChannels sobre a MESMA conexão SCTP:
     ctl  { ordered: true }                  lobbyState, startRun, reject, hash do tick 0
     rt   { ordered:false, maxRetransmits:0 } input, snapshot, ping, pong
```

**Fluxo de uma sala, do clique ao lobby:**

```
autoridade                     servidor                      convidado
    │                              │                              │
    ├─ WS open ───────────────────▶│                              │
    ├─ {create, versions} ────────▶│  gera código (CSPRNG),       │
    │◀─ {created, code, ice} ──────┤  cria Room, emite cred TURN  │
    │                              │                              │
    │                              │◀────────── WS open ──────────┤
    │                              │◀─ {join, code, versions} ────┤
    │                              │  checkVersions → reject?     │
    │◀─ {joined, peerId, hello} ───┤─ {joined, ice} ─────────────▶│
    │                              │                              │
    │  cria RTCPeerConnection      │                              │  cria RTCPeerConnection
    │  cria os 2 DataChannels      │                              │  (só recebe ondatachannel)
    │  = lado IMPOLIDO             │                              │  = lado POLIDO
    ├─ {offer, to:peerId} ────────▶│─ relay opaco ───────────────▶│
    │◀─ relay opaco ───────────────┤◀─ {answer, to:authority} ────┤
    ├─ {candidate} ◀──────────────▶│◀──────────────▶ {candidate}  │
    │                              │                              │
    │═══════ ctl aberto ═══════════════════════════════════════════│
    ├─ lobbyState (slots, ping, rota) ─── 1 Hz ────────────────────▶│
    │◀── ping/pong no rt ─── 1 Hz ─────────────────────────────────▶│
    ├─ {iceOutcome} ──────────────▶│  INSERT ice_outcome           │
    │                              │◀─ {iceOutcome} ───────────────┤
    │                              │                              │
    ├─ startRun {RunConfig} ───────────────────────────────────────▶│
    │◀── hash do tick 0 (D3-05) ───────────────────────────────────┤
```

### Recommended Project Structure

```
packages/protocol/src/
├── enums.ts              # + ping/pong em MSG_KIND, + as tabelas de entidade e de signaling
├── signaling.ts          # NOVO: os tipos do vocabulário de signaling (sem runtime)
├── snapshotCodec.ts      # NOVO: DataView LE, três partes, sem import de runtime do sim
└── index.ts              # + os dois novos re-exports

src/net/                  # NOVO. Nada aqui é importado por packages/sim (C-2)
├── transport.ts          # a interface Transport + PeerId. O cabeçalho carrega FORM-12
├── local.ts              # transporte em processo: duas pontas, sem rede
├── lossy.ts              # decorator de falha determinística (drop/reorder/delay)
├── rtc.ts                # RTCPeerConnection, perfect negotiation, os dois canais
├── signaling.ts          # cliente do WebSocket; reconecta o WS, não a sala (fase 5)
├── lobby.ts              # a máquina de estado do lobby, dirigida por Transport
└── ice.ts                # getStats() → rota; a flag de debug de relay

apps/server/src/signaling/
├── index.ts              # server.on('upgrade'): Origin, rate limit, [ponto da fase 6]
├── rooms.ts              # Map<code, Room>, TTL, código de sala, atribuição de slots
├── schema.ts             # zod + a asserção de igualdade com os tipos de @dg2/protocol
├── turn.ts               # credencial efêmera por HMAC (TURN REST API)
└── outcome.ts            # INSERT em ice_outcome

ops/
├── turnserver.conf       # config do coturn, sem segredo real (D2-15)
└── coturn-dropin.conf    # → /etc/systemd/system/coturn.service.d/dg2.conf
```

### Pattern 1 — `Transport` como interface, topologia como invariante

**O quê:** toda a rede do cliente fala com uma interface, não com `RTCDataChannel`.
**Quando usar:** sempre. É o que faz `rtc.ts → ws.ts` ser troca de construtor, e o que dá
`local.ts` e `lossy.ts` de graça.

```ts
// src/net/transport.ts
// FORM-12 — EVERY MESSAGE CROSSES EXACTLY ONE HOP, AND THE FAR END OF THAT HOP IS THE
// AUTHORITY. There is deliberately no `broadcast` on this interface: a broadcast is what
// lets calling code stop thinking about legs, and the day the authority moves to a
// dedicated server the legs are the only thing that did not change. Sending to three
// peers is a loop over three sends, written where the loop is meaningful.
import type { ChannelClass } from '@dg2/protocol';

/** A transport handle. Dies with the connection; never enters the World (ADR 0001). */
export type PeerId = string;

/** Every subscribe returns its own unsubscribe — no removeListener by identity. */
export type Unsubscribe = () => void;

export interface Transport {
  send(to: PeerId, payload: ArrayBuffer, ch: ChannelClass): void;
  onMessage(cb: (from: PeerId, payload: ArrayBuffer, ch: ChannelClass) => void): Unsubscribe;
  onPeerJoin(cb: (peer: PeerId) => void): Unsubscribe;
  onPeerLeave(cb: (peer: PeerId, reason: string) => void): Unsubscribe;
  /** Latest application-level RTT in ms (D3-13), or null while unmeasured. */
  rtt(peer: PeerId): number | null;
  close(): void;
}
```

`[CITED: .planning/research/ARCHITECTURE.md § 10 Padrão 1]` — a forma acima difere da
pesquisa em três pontos deliberados: `ChannelClass` vem de `@dg2/protocol` em vez de ser
redeclarado (a tabela já está congelada em `enums.ts:74`), `payload` é `ArrayBuffer` e não um
`WireMessage` tipado (o codec já resolve o enquadramento, e um tipo estruturado aqui faria o
transporte conhecer o protocolo), e cada `on*` devolve o próprio cancelamento.

### Pattern 2 — `lossy.ts` injeta falha de forma determinística

**O quê:** um decorator de `Transport` que descarta, duplica, reordena e atrasa por um PRNG
**semeado**.
**Por quê:** uma falha de teste com `Math.random()` não se reproduz, e um teste de rede que
falha uma vez em cinquenta execuções é um teste que alguém desliga.

```ts
// src/net/lossy.ts
// The fault injection is SEEDED, and that is the whole point: a red run prints its seed,
// and re-running with that seed reproduces the exact interleaving. `Rng` comes from
// @dg2/sim — net/ importing sim is allowed; the reverse is what the three purity guards
// forbid (C-2).
import { Rng } from '@dg2/sim';
```

### Pattern 3 — Perfect negotiation com a autoridade como lado impolido

Padrão da MDN aplicado literalmente. Na estrela, o papel é natural e **não precisa ser
negociado**: quem criou a sala é sempre impolido, todo convidado é sempre polido.

```ts
// src/net/rtc.ts — MDN Perfect negotiation, com `polite` fixado pelo papel.
let makingOffer = false;
let ignoreOffer = false;
let isSettingRemoteAnswerPending = false;

pc.onnegotiationneeded = async () => {
  try {
    makingOffer = true;
    await pc.setLocalDescription();          // no argument: creates the right kind
    signaler.send({ description: pc.localDescription });
  } finally {
    makingOffer = false;
  }
};

pc.onicecandidate = ({ candidate }) => signaler.send({ candidate });

signaler.onmessage = async ({ description, candidate }) => {
  if (description) {
    const readyForOffer =
      !makingOffer && (pc.signalingState === 'stable' || isSettingRemoteAnswerPending);
    const offerCollision = description.type === 'offer' && !readyForOffer;
    ignoreOffer = !polite && offerCollision;
    if (ignoreOffer) return;
    isSettingRemoteAnswerPending = description.type === 'answer';
    await pc.setRemoteDescription(description);
    isSettingRemoteAnswerPending = false;
    if (description.type === 'offer') {
      await pc.setLocalDescription();
      signaler.send({ description: pc.localDescription });
    }
  } else if (candidate) {
    try { await pc.addIceCandidate(candidate); }
    catch (err) { if (!ignoreOffer) throw err; }
  }
};
```
`[CITED: developer.mozilla.org/en-US/docs/Web/API/WebRTC_API/Perfect_negotiation]`

**Quem cria os DataChannels:** só a autoridade. O convidado recebe por `ondatachannel`. Isso
mantém uma renegociação só e faz o `onnegotiationneeded` disparar num lado apenas no caminho
feliz — a colisão fica sendo o caso raro que o padrão acima cobre, e não o normal.

### Anti-Patterns to Avoid

- **`channel.send(JSON.stringify(world))`** — 82 KiB medidos na wave 16, cinco vezes o teto.
  `[VERIFIED: medição própria]`
- **Um canal só.** Snapshot em canal confiável e ordenado causa head-of-line blocking: um
  pacote perdido trava todos os snapshots seguintes. É o sintoma "congela e depois
  teleporta". `[CITED: PITFALLS.md § 4]`
- **`broadcast()` na interface `Transport`.** Ver Padrão 1.
- **Fragmentar e remontar por conta própria.** Recusado em D3-19, e a razão é que remontagem
  é estado num canal que perde pacotes. Particionar por classe de entidade não tem estado.
- **Rate limit por `socket.remoteAddress`.** Atrás do Caddy, todo cliente é `127.0.0.1`. Ver
  § Pitfall 2.
- **Tratar o fechamento do WebSocket como "o jogador saiu".** ADR 0001 separa `peerId` de
  `playerId` exatamente para que a fase 5 possa distinguir os dois; queimar a distinção agora
  custa a fase 5 inteira.
- **Deixar a flag de relay ligada sem sinal visível.** Ver § Discretion #6.

---

## Recommendations for Claude's Discretion

Cada item da lista de `03-CONTEXT.md` § Claude's Discretion, resolvido, com fonte e com o
custo de errar.

### #1 — Alfabeto e tamanho do código de sala

**Recomendação: 6 caracteres do alfabeto Crockford Base32, gerados no servidor com
`crypto.randomInt`, comparados contra as salas vivas antes de emitir.**

O alfabeto **já existe neste repositório**, em `src/app/ulid.ts:20`:

```
0123456789ABCDEFGHJKMNPQRSTVWXYZ      // sem I, L, O, U
```

- **Onde a constante deve morar:** `packages/protocol`, não em `src/app/ulid.ts`. O servidor
  gera e o cliente valida antes de enviar; os dois importam de `@dg2/protocol`. `ulid.ts`
  mantém a sua cópia — são dois usos independentes de um mesmo alfabeto público, e acoplá-los
  faria uma mudança de protocolo mexer no formato do id do ledger.
- **Normalização na entrada:** maiúscula, e o mapa de decodificação Crockford —
  `I`→`1`, `L`→`1`, `O`→`0`, e `U` recusado. Isso é o que torna o código "insensível a caixa"
  e tolerante ao erro de leitura que o alfabeto foi desenhado para evitar.
- **Entropia:** 32⁶ = **1.073.741.824** códigos. Com 50 salas vivas, um palpite acerta com
  probabilidade 4,7·10⁻⁸. Com o rate limit de #7 (10 tentativas/min/IP), varrer o espaço leva
  ordens de grandeza mais tempo do que o TTL da sala. `PITFALLS.md` § 15 pede "6+ caracteres
  de um alfabeto sem ambiguidade" — 6 é o piso e é suficiente **porque** o rate limit existe.
- **Geração:** `crypto.randomInt(0, 32)` seis vezes, ou `randomBytes(6)` com rejeição dos
  valores ≥ 248 para não enviesar (256 % 32 = 0, então `byte & 31` **não** enviesa neste caso
  — 32 divide 256 exatamente; use `randomBytes(6)` e `& 31`, é uniforme e é uma linha).
- **Colisão:** `while (rooms.has(code))` com teto de 10 tentativas antes de erro. Com 50 salas
  em 10⁹ códigos, o laço roda uma vez.

**Custo de errar:** um código de 4 caracteres (10⁶) com rate limit fraco é varrível em horas,
e o código é a única credencial da sala (D3-09).

### #2 — TTL de sala ociosa e keepalive do WebSocket

| Parâmetro | Recomendação | Fonte / razão |
|---|---|---|
| Heartbeat do WS (servidor→cliente) | **30 s**, terminando quem não devolveu o pong anterior | Padrão literal do README do `ws` (`isAlive`/`terminate`). Janela de detecção 30–60 s `[CITED: github.com/websockets/ws README]` |
| TTL de sala ociosa | **30 min** desde a última mensagem da autoridade | Um lobby esperando amigos fica 15 min de forma legítima; uma run em andamento gera keepalive, então "ocioso" é ocioso de verdade |
| Grace após o WS da autoridade fechar | **60 s** antes de apagar a sala | Ver a ressalva abaixo — é a única recomendação desta pesquisa que pede o aval do planejador |
| `maxPayload` do `WebSocketServer` | **64 KiB** | O padrão do `ws` é **100 MiB**. Numa caixa de 2 GB com 256 MB de cgroup, um cliente pode alocar 100 MiB por socket. SDP com muitos candidatos fica na casa de 4–8 KiB; 64 KiB é folga de 8× `[CITED: Context7 /websockets/ws — Payload Limits]` |
| `perMessageDeflate` | **deixar desligado** (é o padrão do servidor) | O README avisa: "increased concurrency, especially on Linux, can lead to catastrophic memory fragmentation and slow performance". O tráfego é SDP e JSON pequeno `[CITED: github.com/websockets/ws README]` |

> **Ressalva sobre o grace de 60 s — o planejador precisa decidir.** D3-02 diz: "O servidor
> apaga a sala quando o WebSocket da autoridade fecha." Verifiquei que **`systemctl reload
> caddy` fecha as WebSockets ativas** e que a comunidade do Caddy relata fechamento de
> streams ociosos. Sob a leitura estrita, um `reload` do Caddy no meio de uma noite de jogo
> apaga **todas** as salas do servidor de uma vez — enquanto os DataChannels P2P, que não
> passam pelo Caddy, continuam vivos. As duas saídas honestas:
> **(a)** grace de 60 s antes de apagar, com o cliente reconectando o WS (compatível com o
> espírito de D3-02: a sala morre quando a autoridade **sai**, não quando um socket pisca), ou
> **(b)** leitura estrita, e `ops/README.md` ganha uma linha: "nunca `reload` no Caddy com
> gente jogando; use uma janela".
> Recomendo **(a)**, porque (b) transfere para um humano uma regra que o código consegue
> carregar. Registrado também em § Open Questions.
> `[VERIFIED: caddyserver.com/docs/caddyfile/directives/reverse_proxy — sem timeout padrão de
> leitura; caddyserver/caddy#6420 — reload fecha WebSockets ativas]`

**Cuidado de nomenclatura:** o heartbeat do `ws` usa frames de controle `ping`/`pong` **do
protocolo WebSocket**. As mensagens `ping`/`pong` de D3-13 são **do jogo**, no
DataChannel `unreliable`. São coisas diferentes com o mesmo nome, em camadas diferentes. Um
comentário em cada arquivo evita a confusão que custaria uma tarde.

### #3 — Vocabulário do signaling: onde vive e como é validado

**Recomendação: tabela congelada + tipos em `packages/protocol`, validação com `zod` em
`apps/server`, ligadas por uma asserção de igualdade em tempo de compilação.**

```ts
// packages/protocol/src/enums.ts — APPEND-ONLY, mesma doutrina de MSG_KIND.
/**
 * The signalling vocabulary. This is the SERVER leg — the messages that cross the
 * WebSocket. MSG_KIND is the PEER leg, over the DataChannel. Two tables because they are
 * two wires: the server is a post office that never opens an envelope, and folding the
 * two vocabularies together would let a peer address the server by accident.
 */
export const SIGNAL_KIND = [
  'create', 'created',      // authority asks for a room, server answers with code + ICE
  'join', 'joined',         // guest asks by code, server answers with ICE + peer list
  'peers',                  // authority learns a peer arrived or left
  'offer', 'answer', 'candidate',  // opaque relay — the server never parses these
  'leave', 'closed',        // orderly exit; room is gone
  'iceOutcome',             // D3-14 telemetry
  'error',                  // refusal, carrying a REJECT_REASON index
] as const;
```

- **Doze entradas**, todas append-only, registradas no `TABLES` de
  `tests/protocol-enums.test.ts` e no golden `tests/snapshots/protocol-enums.json` **no mesmo
  commit** — a fricção deliberada que o cabeçalho daquele teste descreve.
- **`packages/protocol/src/signaling.ts`** carrega só os `type` de cada corpo. Zero runtime,
  zero dependência: `dependencies: {}` intacto (C-3).
- **`apps/server/src/signaling/schema.ts`** carrega os schemas `zod`, mais o par de helpers
  que impede a deriva:

```ts
// apps/server/src/signaling/schema.ts
// The schema and the wire type are two spellings of one thing, and the failure mode of two
// spellings is that they drift in silence. These two lines make the drift a compiler error
// inside `npm run typecheck:server`, which is a gate that already exists.
type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends (<T>() => T extends B ? 1 : 2)
  ? true : false;
type Expect<T extends true> = T;

const Join = z.object({ code: z.string().length(6), name: z.string().max(24), /* … */ });
type _JoinMatches = Expect<Equal<z.infer<typeof Join>, protocol.Join>>;
```

**Por que zod e não guardas à mão:** doze mensagens dão ~120 linhas de guarda. A guarda e o
tipo divergem em silêncio; com a asserção acima o schema e o tipo não podem divergir. E o
servidor **já** carrega dependências (`hono`, `kysely`, `better-sqlite3`) — o custo marginal
é zero, ao contrário do cliente.

**Por que não zod no cliente:** C-1. E não é necessário: as mensagens que chegam ao cliente
pelo DataChannel são **binárias**, validadas estruturalmente pelo próprio codec (contagens
declaradas conferidas contra os bytes recebidos, exatamente como `decodeLog` já faz em
`inputCodec.ts:330-338`). A exceção é `lobbyState`, que é JSON vindo de um par não confiável:
merece ~30 linhas de guarda estreita em `src/net/lobby.ts` (comprimento de nome, `cls` contra
`CLASS_KEY`, cores em 0..255), e o arquivo deve dizer por que a guarda existe.

**JSON ou binário no signaling?** JSON. O SDP já é texto, o WebSocket é confiável e frio, e
JSON é depurável no DevTools — que é onde essa camada será depurada.

### #4 — `Transport` + `local.ts` + `lossy.ts`

A interface está em § Architecture Patterns Padrão 1. As três notas de implementação que
importam:

- **`local.ts` entrega em microtask, não sincronamente.** Entrega síncrona esconde toda
  reentrância: um `send` dentro de um `onMessage` viraria recursão em vez de fila. Um
  `queueMicrotask` por entrega custa nada e faz o teste em processo ter a mesma forma de
  execução que o de rede.
- **`lossy.ts` é semeado** (Padrão 2), e o seed vai na mensagem de falha do teste.
- **Ordem de construção:** `lobby.ts` deve ser escrito **contra `local.ts` primeiro**, antes
  de `rtc.ts` existir. Isso é o que torna a máquina de estado do lobby testável em Node, sem
  Playwright, sem servidor e sem a caixa — e é o que permite que a onda de WebRTC seja curta.

### #5 — Perfect negotiation, `bundlePolicy`, `iceTransportPolicy`

Código completo em Padrão 3. Configuração:

```ts
new RTCPeerConnection({
  iceServers,                       // ver #6 e #7
  iceTransportPolicy: relayDebug ? 'relay' : 'all',
  bundlePolicy: 'max-bundle',       // um transporte SCTP para os dois DataChannels
});
```

`bundlePolicy: 'max-bundle'` é o que faz os dois canais dividirem **uma** associação SCTP e
**um** par de candidatos ICE — o que por sua vez é o que faz "a rota" ser uma pergunta com
uma resposta só, em vez de uma por canal. `[CITED: .planning/research/STACK.md § Configuração
ICE no cliente]`

### #6 — Como ligar a flag de debug do relay

**Recomendação: `?ice=relay` lido uma vez no boot, persistido em
`localStorage['dg2.ice']`, removido da URL com `history.replaceState`, e sinalizado por um
badge visível permanente.** Nunca ligada por padrão.

| Opção | A favor | Contra |
|---|---|---|
| Query string pura | Trivial; combina com o `?sala=` que D3-07 já parseia | Viaja se alguém colar a URL inteira num chat, e some ao recarregar — então nunca sobrevive a um teste de reconexão |
| `localStorage` puro | Persistente | Ligar exige DevTools; ninguém liga num celular |
| Toggle escondido nas settings | Descobrível pelo dono | Uma tela a mais nesta fase |
| **Query string → localStorage + strip + badge** | Ligável por link num celular, persistente, e nunca vaza no "copiar link" | Três linhas a mais |

O **badge é a parte não-negociável**. Sem ele, alguém liga a flag, esquece, e reporta "o jogo
está com lag" — e o diagnóstico custa mais do que a flag economizou. O badge tem de aparecer
no lobby **e** no indicador da run (D3-15), com o texto dizendo "relay forçado (debug)" e um
jeito de desligar.

Nota: "copiar link" (D3-07) monta o link a partir do **código da sala**, não da URL atual,
então o `strip` protege contra colar a URL do navegador, que é o caminho real.

### #7 — coturn: portas, unit, quotas

**A porta 443 continua com o Caddy. coturn em 3478 (UDP+TCP) e 5349 (TLS).** TURN/TLS na 443
é dívida registrada, não construída — `ops/Caddyfile` já tem o comentário "SCHEDULED FOR
PHASE 3" e `ops/README.md` § 9 já registra o conflito. Esta fase **resolve o comentário** com
a decisão escrita, não com código. `[CITED: .planning/research/STACK.md § O conflito da porta
443]`

**A unit é um drop-in, não uma cópia.** Verificado: em Debian Buster / Ubuntu Disco em diante
o pacote `coturn` **já traz** `coturn.service` e não usa mais `/etc/default/coturn`. Copiar a
unit como `ops/dg2.service` faz seria assumir a manutenção de um arquivo do distribuidor.
`[VERIFIED: manpages.debian.org/testing/coturn + coturn/coturn#146]`

```ini
# ops/coturn-dropin.conf → /etc/systemd/system/coturn.service.d/dg2.conf
# A DROP-IN, not a copy of the unit: Debian's coturn package ships coturn.service and
# maintains it. Overriding three lines keeps the package's upgrades and adds only the
# budget of ops/README.md §10 — the ~128 MB held back for this process.
[Service]
MemoryHigh=96M
MemoryMax=128M
# No NODE_OPTIONS pair here: the V8-heap-vs-cgroup trap of dg2.service is a V8 problem.
# coturn is C, it sizes nothing from the machine's memory, and the cgroup limit is the
# only limit it needs.
NoNewPrivileges=true
ProtectSystem=strict
ProtectHome=true
PrivateTmp=true
```

`ops/turnserver.conf` segue o bloco de `STACK.md` § Configuração mínima obrigatória do
coturn, verbatim, com **`static-auth-secret` como placeholder** — nunca o valor real (D2-15,
e `tests/ops-config.test.ts` deve assertar isso, como já assere para os outros arquivos de
`ops/`).

**A armadilha operacional que precisa entrar em `ops/README.md` § 12:** o
`static-auth-secret` vive em **dois** arquivos — `/etc/turnserver.conf` (lido pelo coturn) e
`/etc/dg2/env` como `DG2_TURN_SECRET` (lido pelo Node). Trocar num só faz o relay recusar
toda credencial, e o sintoma é "um amigo específico nunca entra" — indistinguível de NAT
ruim. Os dois arquivos são root-only 0600.

**`env.ts` e a degradação sem a caixa.** `DG2_TURN_SECRET` e `DG2_TURN_REALM` entram em
`apps/server/src/env.ts` seguindo o padrão de `required()`, com **uma diferença deliberada**:
não têm valor padrão (um segredo padrão é uma vulnerabilidade), e a **ausência** é tolerada —
o servidor sobe, loga um aviso, e emite config de ICE só com STUN. **Definida e vazia
continua sendo erro**, exatamente como as outras três. Isso é o que permite às ondas locais
rodarem antes do 02-04.

### #8 — Layout binário do snapshot, byte a byte

Estilo herdado de `packages/protocol/src/inputCodec.ts`: `DataView`, little-endian,
constantes de layout nomeadas, cabeçalho que explica cada campo, teste de round-trip.

**Três decisões de layout que valem a justificativa:**

**(a) Posição em `uint16` com 1/8 de pixel, não 1 pixel.** `WORLD` é 2400×1600. Com
`POS_SCALE = 8`, um `uint16` cobre 0..8191,875 px — 3,4× o mundo, com 0,125 px de precisão.
Custa os **mesmos dois bytes** que 1 px e elimina, de graça, o tremor de grade que a fase 4
teria de suavizar em toda entidade remota.

**(b) A posição dos quatro jogadores em `float32`, não só a do local.** `ARCHITECTURE.md`
§ 5.3 avisa que quantizar a posição do jogador local dá tremor permanente na reconciliação, e
propõe `float32` só para ele. Mas isso torna a mensagem **diferente para cada destinatário**,
e a autoridade passaria a codificar três vezes por tick em vez de uma. Quatro jogadores ×
4 bytes extras = **16 bytes por snapshot**, 320 B/s a 20 Hz. Pagar 16 bytes para que o
snapshot seja **os mesmos bytes para todo mundo** é barato e simplifica o encoder da fase 4
inteira. A garantia da pesquisa (a posição que alimenta a reconciliação nunca é quantizada)
fica satisfeita para os quatro.

**(c) `id` do inimigo em `uint32`, não `uint16`.** Medido: no pior caso (`swarm` em toda
wave), `world.nextId` **passa de 65535 na wave 164**. O `id` só é lido pelo delta da fase 4,
mas o formato congela aqui — e um `id` que dá a volta faz dois inimigos aliasarem no delta,
com sintoma de dessincronização silenciosa. Dois bytes a mais por inimigo, contra um defeito
que só aparece em endless longo. `[VERIFIED: medição própria]`

**Cabeçalho comum, 10 bytes:**

```
u8   kind          índice em MSG_KIND ('snapshot')
u8   part          índice em SNAPSHOT_PART
u32  tick          LE
u32  baselineTick  LE — 0 = completo. SEMPRE 0 nesta fase (D3-18)
```

**Parte 0 — `actors` (jogadores + inimigos + os escalares da run):**

```
[cabeçalho 10 B]
u32  rng           world.rng.save() — o cursor, como saveWorld já faz
u32  nextId
u8   phase         índice em PHASE
u16  wave
u8   waveFlags     bit0 waveActive, bit1 waveHasBoss
u8   waveMutator   índice em MUTATOR_KEY (0 = 'none')
u32  score
u16  combo
u8   playerCount
  por jogador (29 B):
    u8   slot      índice em PLAYER_SLOT
    u8   cls       índice em CLASS_KEY
    f32  x         float32 LE — ver (b)
    f32  y
    u16  facing    AIM_STEP, o MESMO de inputCodec.ts
    u16  hp
    u16  maxHp
    u16  stamina   ×100
    u16  level
    u32  gold
    u32  xp
    u8   flags     bit0 moving, bit1 sprinting, bit2 invincible>0, bit3 down
u16  enemyCount
  por inimigo (16 B):
    u32  id
    u16  x         POS_SCALE = 8
    u16  y
    u16  hp        clamp em 65535 — ver a nota abaixo
    u16  maxHp     clamp em 65535
    u8   type      índice em ENEMY_TYPE
    u8   elite     índice em ELITE_TYPE (0 = 'none')
    u8   bossState índice em BOSS_STATE
    u8   flags     bit0 dead, bit1 moving, bit2 enraged, bit3 fusing,
                   bit4 hitFlash>0, bit5 slowT>0, bit6 burnT>0, bit7 poisonT>0
```

**Parte 1 — `projectiles`:**

```
[cabeçalho 10 B]
u16  bulletCount   ; por bullet (8 B): u16 x, u16 y, u16 angle, u8 type (ATTACK_KIND), u8 ownerSlot
u16  enemyBulletCount ; por enemyBullet (6 B): u16 x, u16 y, u16 angle
```

**Parte 2 — `pickups`:**

```
[cabeçalho 10 B]
u16  coinCount   ; por coin   (4 B): u16 x, u16 y
u16  potionCount ; por potion (4 B): u16 x, u16 y
u16  chestCount  ; por chest  (5 B): u16 x, u16 y, u8 state (CHEST_STATE)
```

**Os escalares ficam na parte 0 de propósito.** Um snapshot sem jogadores não existe, então a
parte 0 é a única que nunca é vazia — e as partes 1 e 2 carregam o próprio `tick`, então
perder a parte 0 não as invalida (D3-19).

**Números resultantes** (mesmos mundos da § Measured Baseline):

| Cenário | parte 0 | parte 1 | parte 2 | soma | JSON equivalente | redução |
|---|---|---|---|---|---|---|
| wave 16 + swarm + elite (83 inimigos) | **1476 B** (1,44 KiB) | 798 B | 644 B | **2918 B (2,85 KiB)** | 82,0 KiB | **28×** |
| wave 40 endless (198 inimigos) | **3316 B** (3,24 KiB) | 1140 B | 922 B | **5378 B (5,25 KiB)** | 158,0 KiB | **30×** |

**Quando o particionamento de D3-19 morde:** a parte 0 só passa de 16 KiB com **1014
inimigos**, o que pela fórmula `round((4 + w*3) * 1.6)` é a **wave ~210**. Isso significa que
o bench de D3-20 vai passar com margem de 11× na wave 16 — e que o mecanismo de partição
precisa ser exercido por um **teste que o força** (um World com contagem absurda declarada no
teste), não pelo bench. Registrar isso no cabeçalho do codec evita que alguém futuro conclua
que a partição é código morto e a apague.

**A normalização de `-0`.** É estrutural, não uma linha extra: `Math.round(-0.4 * 8) | 0` dá
`0`, e o clamp `Math.max(0, …)` mata o resto. Idêntico ao idioma de `inputCodec.ts:72`, e o
cabeçalho de `serialize.ts` prevê exatamente isto ("o dia em que o snapshot virar um codec
binário, a normalização pertence a esse codec, ao lado dos bits"). O teste tem de conferir
com `Object.is`, nunca por hash — a mesma armadilha que `tests/serialize.test.ts` já
documenta.

**A nota sobre `hp` em `uint16`.** Medido: o maior `def.hp` é 3200 (`necro_lord`), o maior
multiplicador de elite é 2,2 (`brutish`), e `hp = def.hp + floor(wave*def.hp*0.12)`. O
produto passa de 65535 por volta da **wave 70**. A saída boa — mandar `hp/maxHp` como razão e
derivar `maxHp` de uma função exportada do sim — **está fechada nesta fase**, porque exportar
essa função move o `SIM_VERSION`, e a fronteira da fase proíbe. Então: `hp` e `maxHp` ambos
`uint16` com clamp, e o clamp documentado como limite cosmético conhecido de endless
profundo (acima da wave 70 a barra fica cheia por mais tempo do que deveria; nenhum cliente
calcula dano, então nada além da barra é afetado — verificado: `src/render/entities.ts:328`
e `src/ui/hud.ts:83` são os dois únicos consumidores, e ambos usam a razão). Registrar como
dívida para o próximo commit que já mova o `SIM_VERSION`.

### #9 — Tabelas de enum a congelar

Cardinalidades **medidas no sim**, não presumidas. Todas nascem em
`packages/protocol/src/enums.ts`, append-only, registradas em `TABLES` e no golden **no mesmo
commit**, com um teste de pinagem contra o tipo do sim no padrão que `OBJECTIVE_KIND` ↔
`ObjectiveKind` já tem.

| Tabela | Espelha | Valores, na ordem | n |
|---|---|---|---|
| `ENEMY_TYPE` | chaves de `ENEMY_DEFS` | skeleton, goblin, demon, brute, mimic, necromancer, swampy, zombie_king, ogre_warlord, goblin_chief, necro_lord | **11** |
| `ELITE_TYPE` | `'none'` + `ELITE_TYPES` | none, swift, brutish, vampiric | **4** |
| `BOSS_STATE` | literais de `boss.ts` | chase, telegraph, charging, recover | **4** |
| `CHEST_STATE` | `Chest['state']` | closed, opening, looted | **3** |
| `OBSTACLE_KIND` | `Obstacle['kind']` | column, crate | **2** |
| `ATTACK_KIND` | `AttackKind` | melee, bolt, arrow, bullet, fireball | **5** |
| `CLASS_KEY` | `ClassKey` | mage, archer, warrior, ninja, priestess, witch, coprobo | **7** |
| `MUTATOR_KEY` | `'none'` + `MutatorKey` | none, swarm, frenzy, bounty, elite, fog | **6** |
| `PHASE` | `Phase` | playing, levelup, shop, gameover, victory | **5** |
| `GAME_MODE` | `GameMode` | campaign, endless | **2** |
| `PLAYER_SLOT` | `PlayerSlot` (sim) | p0, p1, p2, p3 | **4** |
| `SNAPSHOT_PART` | novo | actors, projectiles, pickups | **3** |
| `SIGNAL_KIND` | novo | ver § Discretion #3 | **12** |
| `ICE_ROUTE` | novo | unknown, direct, relay | **3** |
| `ICE_CANDIDATE_TYPE` | W3C / RFC 8445 | host, srflx, prflx, relay | **4** |

**`anim` NÃO precisa de tabela, e não vai no fio.** Verificado: `Enemy.anim` é atribuído uma
única vez em `makeEnemy` a partir de `ENEMY_DEFS[type].anim`, e `grep` não encontra nenhuma
outra atribuição a `.anim` em `packages/sim`. Igual para `eliteName` e `eliteTint`, que só
saem de `ELITE_TYPES[key]`. Todos são deriváveis de `type` + `elite`, que já viajam. Isso
tira uma tabela de 9 valores e um byte por inimigo. `[VERIFIED: grep em packages/sim/src]`

**`OBSTACLE_KIND` vai mesmo assim**, embora D3-17 tire `obstacles` do fio. Duas linhas, e o
Padrão 4 da pesquisa ("toda entidade em rede tem uma tabela congelada") vale para o dia em
que a arena deixar de ser derivada da seed. É um julgamento, e a alternativa (não congelar o
que nada escreve) é defensável — registrado como tal.

**Ordem `'none'` no índice 0**, em `ELITE_TYPE` e `MUTATOR_KEY`, pelo mesmo motivo escrito no
comentário de `OBJECTIVE_KIND`: um campo zerado ou ausente decodifica para "nenhum" em vez de
para um valor real.

**Regra que precisa ficar escrita:** `ENEMY_TYPE` também congela dentro de todo replay
guardado a partir da fase 4. Inserir um inimigo no meio da lista invalida replay armazenado.
`[CITED: ARCHITECTURE.md § 5.3 e § 10 Padrão 4]`

### #10 — Onde o codec mora

**Recomendação: `packages/protocol/src/snapshotCodec.ts`, com import `type`-only de
`@dg2/sim`, codificando de/para um `SnapshotRecord` plano — não para um `World`.**

O argumento decisivo é a `tsconfig` que já existe: `packages/protocol/tsconfig.json` tem
`lib: ["ES2022"]` e `types: []`, então `DataView`, `ArrayBuffer` e `Uint8Array` estão
disponíveis e `TextEncoder`, `crypto` e `WebSocket` não. O codec cabe ali sem exceção
nenhuma. O que **não** cabe é a hidratação: reconstruir um `Enemy` completo exige
`ENEMY_DEFS` em runtime, o que faria `@dg2/protocol` depender do bundle do sim e contradiria
o próprio `index.ts` do pacote ("este pacote é tipos, tabelas congeladas e uma função pura").

A divisão:

| Camada | Onde | O quê |
|---|---|---|
| `World → SnapshotRecord` | `packages/protocol` (`extractSnapshot`) | Lê um `World` por parâmetro (`import type`), quantiza, produz inteiros |
| `SnapshotRecord → bytes` | `packages/protocol` (`encodeSnapshot`) | `DataView` LE, três partes |
| `bytes → SnapshotRecord` | `packages/protocol` (`decodeSnapshot`) | Com as checagens de limite que `decodeLog` já faz |
| `SnapshotRecord → World` | **fase 4**, em `src/net/` | Precisa de `ENEMY_DEFS` em runtime. Fora do escopo desta fase (D3-18) |

É exatamente a divisão que `inputCodec.ts` já pratica: `InputRecord` é a forma inteira legível,
`InputState` é o tipo importado como `type`, e nada do sim entra no grafo emitido.

**O round-trip que D3-18 pede, então, é duplo** — e os dois lados são necessários pelo mesmo
motivo que `inputCodec` tem os dois:
1. `decodeSnapshot(encodeSnapshot(r)) === r`, campo a campo, para um `r` já quantizado;
2. `encodeSnapshot(decodeSnapshot(bytes)) === bytes`, byte a byte.

E a idempotência de `extractSnapshot`: `extract(load(record)) === record`. Sem essa
propriedade o formato é um resumo com perda, não uma gravação.

### #11 — Frequência do ping e janela da média

| Parâmetro | Recomendação | Razão |
|---|---|---|
| Frequência | **1 Hz** | D3-16 já relaya o resumo a cada segundo; amostrar mais rápido só produziria números que a tela descarta |
| Formato | `u8 kind` + `u16 seq` + `u32 tick` = **7 bytes** | O carimbo de tempo fica **local**, num `Map<seq, performance.now()>`. Nenhum relógio atravessa o fio, então não há skew nem nada a forjar |
| Janela mostrada | **mediana das últimas 5 amostras** (≈5 s) | A média é arrastada por um pico só; a mediana de 5 ignora um outlier e ainda responde em 3 s a uma degradação real |
| Perda | `ping` sem `pong` em **3 s** conta como perdido, não como RTT infinito | O canal é `unreliable` — perder um ping é normal e não é sinal de nada |
| Sem resposta | **3 perdas consecutivas** → a tela mostra "sem resposta", não um número velho | Um ping congelado em "42 ms" durante uma queda é pior que nenhum número |

`ping`/`pong` são **acrescentados ao fim de `MSG_KIND`**, virando os índices 8 e 9, e o
golden muda no mesmo commit (D3-13). Depois do append, `MSG_KIND` tem 10 entradas.

### #12 — Rota e telemetria ICE: os campos exatos

D3-13 tira o `getStats()` da medição de RTT. Ele continua sendo a **única** fonte da rota, e
os nomes de campo estão verificados contra a especificação do W3C:

```
pc.getStats()
  → report tipo 'transport'      → selectedCandidatePairId
  → report tipo 'candidate-pair' → state ('succeeded'), nominated, localCandidateId,
                                    remoteCandidateId, currentRoundTripTime
  → report tipo 'local-candidate' /
           'remote-candidate'    → candidateType ('host'|'srflx'|'prflx'|'relay'),
                                    protocol ('udp'|'tcp'), relayProtocol, address, port
```

- **Rota = `relay`** se `candidateType` de **qualquer** das duas pontas for `'relay'`; senão
  `direct`. Um par `srflx`↔`srflx` é direto (atravessou o NAT), e essa é a distinção que a
  taxa real de necessidade de relay precisa.
- **`address` e `port` NÃO vão para a tabela.** São IPs de jogadores. D3-14 diz "sem dado
  pessoal além do ULID local", e `candidateType` + `protocol` + `relayProtocol` respondem a
  pergunta inteira.
- **O `RTCStatsIceCandidatePairState` inclui `'succeeded'`?** A enumeração do W3C que li
  lista `new, checking, connected, completed, failed, disconnected, closed`. Os navegadores
  reportam `'succeeded'` na prática. **Escreva o código para aceitar `succeeded` OU
  `nominated === true`**, e não dependa de um valor só. `[ASSUMED — a divergência entre a
  enumeração da spec e o que os motores reportam não foi confirmada num navegador nesta
  sessão]`
- **A linha de falha também é gravada** (D3-14): quando `iceConnectionState` vai a `failed`,
  grave `route: 'unknown'`, `result: 'failed'` e o último par tentado. Sem essa metade a
  tabela mede só os sucessos, e a taxa fica errada para cima.

`[VERIFIED: w3.org/TR/webrtc-stats — RTCIceCandidateStats, RTCIceCandidatePairStats,
RTCTransportStats.selectedCandidatePairId]`

**A tabela (segunda migração, aditiva, D2-02/D2-07):**

```
ice_outcome
  id                text primary key not null   -- ULID gerado no cliente (idempotência)
  room_code         text not null
  slot              text not null               -- p0..p3
  account_id        text not null               -- o ULID local não-reivindicado (ADR 0002)
  route             text not null               -- índice de ICE_ROUTE, como texto
  local_candidate   text                        -- candidateType
  remote_candidate  text
  protocol          text                        -- udp | tcp
  relay_protocol    text                        -- null quando não é relay
  rtt_ms            integer
  result            text not null               -- connected | failed
  at                integer not null            -- epoch ms
```

Índice em `(at)`, para que a pergunta "qual foi a taxa de relay no último mês" seja um
`SELECT` e não um script.

### #13 — Telas, e o `LOCAL_SLOT`

O roadmap marca `UI hint: yes` e `/gsd:ui-phase 3` é opção antes de planejar. As três coisas
que a pesquisa consegue afirmar:

- **`src/main.ts:188` (`LOCAL_SLOT: PlayerSlot = 'p0'`) é a integração inteira.** O comentário
  ali já diz que é "a única linha que deixa de ser constante". O slot passa a vir do
  `startRun` recebido, e `buildRunConfig` (`src/app/forge.ts:32`) passa de um jogador para os
  quatro, com a autoridade emitindo a seed em vez do `Math.random()` da linha 37.
- **O lobby é a primeira tela do jogo dirigida por estado de rede, não pelo `world`.** Todo o
  resto de `src/ui/screens.ts` lê do `World` uma vez por frame (`syncScreens`). O lobby não
  tem `World` ainda. **Isso tem de estar escrito no cabeçalho de `src/net/lobby.ts`**, ou o
  próximo a mexer vai procurar o `world` e não achar.
- **`tests/dom-ids.test.ts` já obriga** que todo id novo em `index.html` tenha entrada em
  `src/ui/dom.ts` no mesmo commit. A tela de lobby herda essa regra de graça.

### #14 — O bench de D3-20 e como ele roda no CI

**Recomendação: um script `tools/bench/snapshot.mjs` invocado por `npm run bench:snapshot`,
mais um teste em `tests/` que assere o teto.** Os dois, não um só, e por motivos diferentes:

- **O script imprime o número no log do CI** — é o que faz uma regressão de 2,8 KiB para
  9 KiB ser visível no PR que a causou, mesmo sem estourar o teto.
- **O teste falha o build** — é o portão.

`tools/README.md` § 1 e § 2 já fixam a convenção: extensão `.mjs` explícita, invocação sempre
por script de `package.json`. O passo entra em `.github/workflows/ci.yml` no job `test`,
depois de `npm test`.

**O World sintético (D3-20)** é construído pelas fórmulas do próprio sim — `makeEnemy`,
`makeElite`, a contagem `round((4 + wave*3) * 1.6)` — com os tetos de projéteis e loot
declarados como constantes nomeadas **no arquivo do bench**, para que o teto conhecido fique
visível onde ele é usado. Os valores que medi e que são um ponto de partida defensável:
80 bullets + 24 enemyBullets, 140 coins, 12 potions, 4 chests na wave 16.

**O teste secundário** (uma run real até a wave 16 fica abaixo do sintético) precisa de uma
run real. A run de ouro de `tests/golden/campaign-mage-3000.json` é solo e de 3000 ticks — não
chega à wave 16 com quatro jogadores. Duas saídas: gravar uma fixture nova (cara), ou rodar o
stepper com input neutro por N ticks e comparar (barato, e prova o que importa: que o
sintético é um teto, não uma amostra). **Recomendo a segunda**, com a limitação escrita: com
input neutro os jogadores não matam nada, então a contagem de inimigos fica **acima** do
normal, o que é o lado certo em que errar num teste de teto.

**O round-trip do codec entra em `tests/cross-engine.test.ts`** e ganha os três motores de
graça — é onde a divergência de codificação entre motores apareceria, se houvesse.

### #15 — Ordem interna da fase

Duas restrições do CONTEXT: o que depende da VPS vai por último; o append de `ping`/`pong` e
o golden vão no mesmo commit.

| Onda | Conteúdo | Depende da caixa? | Prova |
|---|---|---|---|
| **1 — Protocolo** | As 15 tabelas de enum + append de `ping`/`pong` + golden, tudo num commit. Tipos de signaling. `PROTOCOL_VERSION` sobe | não | `protocol-enums.test.ts` verde com o golden novo |
| **2 — Codec** | `snapshotCodec.ts`: extract, encode, decode, as três partes | não | round-trip duplo + idempotência; entra em `cross-engine.test.ts` |
| **3 — Bench** | World sintético, `tools/bench/snapshot.mjs`, passo de CI, teste do teto, teste que força a partição | não | **Fecha SYNC-04 e o critério 5** |
| **4 — Transporte em processo** | `Transport`, `local.ts`, `lossy.ts`, `lobby.ts`; `net` entra em `FORBIDDEN_LAYER` e no lint do sim; `LOCAL_SLOT` deixa de ser constante | não | máquina de estado do lobby testada em Node, sem browser |
| **5 — Signaling** | `ws` noServer, `upgrade` (Origin + rate limit + ponto da fase 6), `Map<code,Room>`, código de sala, TTL, keepalive, migração de `ice_outcome` | não | testes contra `createApp`/`server` local |
| **6 — WebRTC e telas** | `rtc.ts` (perfect negotiation, dois canais), `signaling.ts` cliente, telas de criar/entrar/lobby/erro, `?sala=`, prova do hash do tick 0 | não | **Playwright com dois `browserContext`** fechando uma sala por loopback. **Fecha os critérios 1, 2 e 4 (parte local)** |
| **7 — VPS** | `ops/turnserver.conf`, drop-in, `ops/README.md` § 12, `DG2_TURN_SECRET`/`DG2_TURN_REALM`, credencial HMAC, flag de relay contra o coturn real, medição real de ICE | **SIM — bloqueada por 02-04** | **Critério 3, que não pode fechar antes da caixa** |

Sete ondas contra as "4 (estimativa)" do roadmap. A diferença é que a pesquisa separa
protocolo, codec e bench, que o roadmap agrupou — o planejador pode fundir 1–3 se preferir.

**Nota sobre a onda 6 e o teste local:** D-08 recusa versões diferentes sem bypass, então
testar co-op local exige **o mesmo build nas duas abas**. Com Playwright isso é automático
(um `dist/` só). Com duas abas à mão em dev, é preciso o mesmo servidor de dev — dois `npm
run dev` em portas diferentes dariam `SIM_VERSION` iguais, mas origens diferentes, o que a
checagem de `Origin` do `upgrade` (D3-09) vai recusar. **Documente o comando exato de teste
manual**, ou a primeira sessão de debug vira uma caça a um bug que não existe.

---

## Don't Hand-Roll

| Problema | Não construa | Use | Por quê |
|---|---|---|---|
| Colisão de oferta SDP (glare) | Sua própria máquina de estado de negociação | **Perfect negotiation da MDN**, verbatim | `signalingState`, rollback e `have-local-offer` têm sutilezas que só aparecem com 4 pares. Sintoma: funciona com 2, falha intermitentemente com 4 |
| Autenticar antes do handshake WS | `verifyClient` do `ws` | `noServer: true` + `server.on('upgrade')` | `verifyClient` é desencorajado e não dá acesso ao socket cru para responder um 401 legível |
| Relay quando ICE direto falha | Um proxy TCP próprio | **coturn** com `use-auth-secret` | TURN é RFC 8656, com permissões, canais e alocações. Um relay caseiro sem `denied-peer-ip` é SSRF para a própria LAN |
| Credencial de TURN | Usuário/senha fixo | **HMAC-SHA1 efêmero** (TURN REST API) | Credencial fixa vazada = proxy aberto, e a fatura de banda é sua |
| Gerar código de sala | `Math.random().toString(36)` | `crypto.randomBytes` + Crockford | O código é a única credencial da sala. `Math.random` não é CSPRNG |
| Detectar peer morto | Timeout na aplicação | Heartbeat `ping`/`pong` do `ws` com `isAlive` | Um socket TCP meio-aberto não emite `close`. Sem heartbeat, salas fantasma acumulam na `Map` |
| Serializar o World | `JSON.stringify` | O codec binário desta fase | 82 KiB medidos contra 2,85 KiB |
| Codificar ângulo | Uma segunda quantização | **`AIM_STEP` de `inputCodec.ts`** | Duas quantizações de ângulo no mesmo código divergem no dia em que uma muda |
| Base64 no protocolo | `btoa` / `Buffer` | O `toBase64` que `inputCodec.ts:263` já tem | Os dois helpers de plataforma vivem em lugares diferentes, e `packages/protocol` compila nos dois runtimes |
| Rate limit do `upgrade` | `hono-rate-limiter` | Contador por IP escrito à mão (~40 linhas) | O `upgrade` é emitido **no lugar** de `request`; middleware Hono nunca roda ali |
| ULID do reporte de ICE | Um contador | `src/app/ulid.ts` (já existe) | Idempotência na tabela append-only, mesmo padrão de D-27 |

**Key insight:** nesta fase, quase toda tentação de escrever algo próprio é uma tentação de
reimplementar uma coisa que **já está neste repositório** — `AIM_STEP`, o base64 de
`inputCodec`, o alfabeto de `ulid.ts`, `hashWorld`, o migrator, a convenção de `ops/`. O
codec binário e o `Transport` são o que de fato é novo.

---

## Common Pitfalls

### Pitfall 1 — `hono-rate-limiter` no `upgrade` não roda, e o teste de fumaça não pega

**O que dá errado:** monta-se `honoRateLimiter()` como middleware, o `upgrade` continua sem
limite nenhum, e o teste de fumaça (que faz um GET normal) passa.
**Por que acontece:** o `http.Server` do Node emite `'upgrade'` **em vez de** `'request'`
quando o cabeçalho `Upgrade` está presente. A documentação do Node é explícita: "only regular
`'request'` events are emitted… unless you listen to this event, in which case they are all
accepted (i.e. the `'upgrade'` event is emitted instead)". O handler `fetch` do Hono nunca é
chamado. `[VERIFIED: nodejs.org/api/http.html#event-upgrade_1]`
**Como evitar:** contador próprio dentro do handler de `upgrade`. Ver Code Example #2.
**Sinal de alerta:** o contador do limitador nunca sobe em produção enquanto o `/ws` recebe
conexões.

### Pitfall 2 — Rate limit por `socket.remoteAddress` atrás do Caddy limita a internet inteira

**O que dá errado:** o balde é `127.0.0.1` para todo mundo. Ou ninguém é limitado (limite
alto) ou todos são (limite baixo), e o segundo caso é indistinguível de "o servidor caiu".
**Por que acontece:** o Caddy termina o TLS e abre uma conexão nova para o loopback.
**Como evitar:** ler `X-Forwarded-For`. O Caddy **substitui** esse cabeçalho para origem não
confiável por padrão, então o valor é o IP real do cliente e não é forjável — desde que
`trusted_proxies` não seja configurado de forma frouxa. Em dev, sem proxy, o cabeçalho é
ausente e `socket.remoteAddress` é o fallback correto.
`[VERIFIED: caddyserver.com/docs/caddyfile/directives/reverse_proxy]`
**Sinal de alerta:** o log do limitador só mostra `::ffff:127.0.0.1`.

### Pitfall 3 — `systemctl reload caddy` apaga todas as salas

**O que dá errado:** um `reload` (para trocar um cabeçalho, ajustar cache) fecha as
WebSockets ativas. Sob a leitura estrita de D3-02, o servidor apaga todas as salas na hora —
enquanto os DataChannels P2P, que não passam pelo Caddy, continuam funcionando. O jogo segue,
o servidor esqueceu, e a fase 5 não tem para onde reconectar.
**Por que acontece:** o Caddy fecha streams ativos no reload por padrão, e o `ops/README.md`
§ 6 já registra o parente disso (o reload não relê o `EnvironmentFile`).
**Como evitar:** grace de 60 s antes de apagar a sala, com o cliente reconectando o WS — ou a
regra operacional escrita. Ver § Discretion #2 e § Open Questions.
`[VERIFIED: caddyserver/caddy#6420]`
**Sinal de alerta:** "todo mundo caiu ao mesmo tempo, e eu não fiz nada" logo depois de um
deploy que tocou o `Caddyfile`.

### Pitfall 4 — O limite de 16 KiB é um orçamento, não uma trava de 2026

**O que dá errado:** alguém verifica `pc.sctp.maxMessageSize`, vê 262144 no Chrome, conclui
que o teto de 16 KiB é folclore, e manda snapshots de 40 KB.
**Por que acontece:** a recomendação de 16 KiB vem da § 6.6 do rascunho de data channels e do
período pré-Firefox 57 (2017), quando o Firefox fragmentava em PPID e o Chromium não
remontava. Hoje o piso negociado é 64 KiB (`max-message-size` do RFC 8841, padrão 64 KB
quando ausente) e os motores aceitam mais.
**Os três motivos pelos quais 16 KiB continua sendo o número certo aqui, e nenhum deles é
compatibilidade:**
1. **Head-of-line blocking entre canais.** A MDN é explícita: sem o interleaving do RFC 8260,
   uma mensagem grande num canal bloqueia a latência dos **outros** canais. Este projeto roda
   `ctl` e `rt` na mesma associação SCTP (`bundlePolicy: 'max-bundle'`), então um snapshot
   grande no `rt` atrasa o `lobbyState` no `ctl`.
2. **Perda multiplicada no canal não confiável.** Com `maxRetransmits: 0`, uma mensagem que
   ocupa N pacotes se perde se **qualquer** um se perder. A 1% de perda de pacote, uma
   mensagem de 16 KiB (~14 pacotes a 1200 B) se perde ~13% das vezes; uma de 4 KiB, ~4%.
3. **É o upload doméstico da autoridade que quebra primeiro**, não o motor
   (`PITFALLS.md` § 4).
**Como evitar:** manter D3-19 e o teto, e **corrigir a justificativa no cabeçalho do codec**
para os três motivos acima. Adicionalmente, ler `pc.sctp?.maxMessageSize` em runtime e logar
se for menor que 16 KiB — é grátis e cobre o motor exótico.
`[VERIFIED: MDN Using_data_channels; lgrahl.de/articles/demystifying-webrtc-dc-size-limit]`

### Pitfall 5 — `maxPayload` padrão de 100 MiB numa caixa de 2 GB

**O que dá errado:** cada socket pode alocar até 100 MiB. Dez sockets maliciosos derrubam o
processo por `MemoryMax=256M` antes de qualquer rate limit atuar.
**Como evitar:** `new WebSocketServer({ noServer: true, maxPayload: 64 * 1024 })`.
`[CITED: Context7 /websockets/ws — Payload Limits]`
**Sinal de alerta:** a unit `dg2` reinicia com OOM sem que o tráfego legítimo tenha crescido.

### Pitfall 6 — Código de sala enumerável

**O que dá errado:** o código é a única credencial (D3-09). Sem rate limit no `join`, um
script varre o espaço e entra em salas alheias.
**Como evitar:** 6 caracteres (10⁹) **mais** um balde separado de tentativas de `join` por IP
(10/min), **mais** o TTL da sala. Os três, não um. `[CITED: PITFALLS.md § 15]`
**Sinal de alerta:** picos de `error: badCode` no log vindos de um IP só.

### Pitfall 7 — `Origin` não é autenticação

**O que dá errado:** confia-se no cabeçalho `Origin` como se fosse uma prova. Um navegador o
envia honestamente; qualquer cliente não-navegador o forja.
**Por que importa aqui:** D3-09 já diz que "o que protege a sala é o código" — a checagem de
`Origin` existe para bloquear **CSWSH** (um site de terceiro abrindo WebSocket na sua origem
com os cookies do usuário), não para autenticar. Escrever isso no comentário do handler evita
que a fase 6 confie em algo que nunca foi uma garantia.

### Pitfall 8 — O `id` de inimigo dando a volta em `uint16`

**O que dá errado:** `world.nextId` passa de 65535 na **wave 164** no pior caso, dois
inimigos aliasam no delta da fase 4, e o sintoma é dessincronização silenciosa em endless
longo — o tipo de defeito mais caro deste projeto.
**Como evitar:** `uint32`. Dois bytes por inimigo. `[VERIFIED: medição própria]`

### Pitfall 9 — `-0` no codec, invisível para o hash

**O que dá errado:** um teste de round-trip verificado por hash **passa** sobre dados já
corrompidos, porque `JSON.stringify(-0)` já emite `"0"`.
**Como evitar:** o teste do codec compara com `Object.is`, campo a campo, nunca só por hash —
exatamente como `tests/serialize.test.ts` já faz. A normalização é estrutural
(`Math.round(x*8) | 0` mais o clamp), no idioma de `inputCodec.ts:72`.
`[CITED: packages/sim/src/serialize.ts, cabeçalho]`

### Pitfall 10 — Dois `ping` com o mesmo nome

**O que dá errado:** alguém "unifica" o heartbeat do `ws` com o `ping` de D3-13, ou depura um
achando que é o outro.
**Como evitar:** um comentário em cada lugar dizendo qual camada é qual. São dois mecanismos,
em dois transportes, com dois propósitos: um detecta socket morto, o outro mede o RTT do
caminho que a fase 4 vai usar.

---

## Code Examples

### #1 — `upgrade` com Origin, rate limit e o ponto nomeado da fase 6

```ts
// apps/server/src/signaling/index.ts
import { WebSocketServer } from 'ws';
import type { Server } from 'node:http';

// 64 KiB, not the 100 MiB default. An SDP offer with a lot of candidates is 4-8 KiB; the
// default would let one socket allocate more than this unit's whole MemoryMax (P-5).
const wss = new WebSocketServer({ noServer: true, maxPayload: 64 * 1024 });

function onSocketError(err: Error): void { log.warn({ err }, 'upgrade socket'); }

export function attachSignalling(server: Server, deps: Deps): void {
  server.on('upgrade', (req, socket, head) => {
    socket.on('error', onSocketError);

    if (req.url !== '/ws') { socket.destroy(); return; }

    // Origin is anti-CSWSH, NOT authentication: a browser sends it honestly, a non-browser
    // client forges it. What protects a room is its code (D3-09). Saying so here is what
    // stops phase 6 from treating this line as a guarantee it never was (P-7).
    if (req.headers.origin !== deps.origin) {
      socket.write('HTTP/1.1 403 Forbidden\r\n\r\n'); socket.destroy(); return;
    }

    if (!deps.limiter.take(clientIp(req, socket))) {
      socket.write('HTTP/1.1 429 Too Many Requests\r\n\r\n'); socket.destroy(); return;
    }

    // PHASE 6 PLUGS THE SESSION CHECK HERE, and nowhere else (D3-09). The Better Auth
    // cookie arrives on this very request — a WebSocket handshake is a GET, so the cookie
    // is sent automatically and same-origin. Everything above stays; this becomes a
    // fourth guard, not a replacement for the first three.

    socket.removeListener('error', onSocketError);
    wss.handleUpgrade(req, socket, head, ws => wss.emit('connection', ws, req));
  });
}
```
`[CITED: Context7 /websockets/ws — Authenticate WebSocket Connections]`

### #2 — Rate limit por IP real, atrás do Caddy

```ts
// apps/server/src/signaling/limiter.ts
// Behind Caddy every socket is 127.0.0.1, so remoteAddress would put the whole internet in
// one bucket (P-2). Caddy REPLACES X-Forwarded-For for untrusted sources, so the value
// here is the real client and is not forgeable. With no proxy (dev) the header is absent
// and remoteAddress is the right answer.
function clientIp(req: IncomingMessage, socket: Duplex): string {
  const fwd = req.headers['x-forwarded-for'];
  if (typeof fwd === 'string' && fwd.length > 0) return fwd.split(',')[0].trim();
  return (socket as { remoteAddress?: string }).remoteAddress ?? 'unknown';
}

// A fixed window, swept lazily, with a HARD CAP on the map. An unbounded Map keyed by
// remote input is itself the denial of service it was written to prevent.
const MAX_TRACKED = 10_000;
```

### #3 — Credencial efêmera de TURN e a config de ICE

```ts
// apps/server/src/signaling/turn.ts — TURN REST API (draft-uberti-behave-turn-rest-00).
// The client never sees the secret; it receives a username/credential pair that expires.
// Tied to the room so a leaked pair cannot outlive the session it was issued for (D3-10).
import { createHmac } from 'node:crypto';

const TTL_SECONDS = 3600;

export function turnCredential(secret: string, roomCode: string, slot: string) {
  const expiry = Math.floor(Date.now() / 1000) + TTL_SECONDS;
  const username = `${expiry}:${roomCode}:${slot}`;
  const credential = createHmac('sha1', secret).update(username).digest('base64');
  return { username, credential, ttl: TTL_SECONDS };
}

// The ICE config the client builds from it. Public STUN is an ADDITIONAL candidate source
// next to our own coturn, never a replacement (C-8): a second opinion on the reflexive
// address costs nothing and covers the minute our own STUN is restarting.
export function iceServers(domain: string, cred: TurnCredential | null): RTCIceServer[] {
  const servers: RTCIceServer[] = [
    { urls: `stun:${domain}:3478` },
    { urls: 'stun:stun.l.google.com:19302' },
  ];
  if (cred) {
    servers.push({
      urls: [
        `turn:${domain}:3478?transport=udp`,
        `turn:${domain}:3478?transport=tcp`,
        `turns:${domain}:5349`,
      ],
      username: cred.username,
      credential: cred.credential,
    });
  }
  return servers;
}
```
`[CITED: .planning/research/STACK.md § Configuração mínima obrigatória do coturn]`

### #4 — Rota a partir de `getStats()`

```ts
// src/net/ice.ts
// getStats() is NOT the source of the ping on screen (D3-13) — it is the only source of the
// ROUTE. Written to accept either spelling of "this pair won": the W3C enum lists
// 'succeeded' among neither, while engines report it, so `nominated` is the second witness.
export async function routeOf(pc: RTCPeerConnection): Promise<IceRoute> {
  const stats = await pc.getStats();
  let pair: RTCIceCandidatePairStats | undefined;
  for (const r of stats.values()) {
    if (r.type === 'candidate-pair' && (r.state === 'succeeded' || r.nominated)) pair = r;
  }
  if (!pair) return { route: 'unknown', local: null, remote: null, protocol: null };

  const local = stats.get(pair.localCandidateId) as RTCIceCandidateStats | undefined;
  const remote = stats.get(pair.remoteCandidateId) as RTCIceCandidateStats | undefined;
  const relayed = local?.candidateType === 'relay' || remote?.candidateType === 'relay';
  // address and port are deliberately NOT read: they are players' IPs, and D3-14 keeps the
  // table to the ULID and nothing else personal.
  return {
    route: relayed ? 'relay' : 'direct',
    local: local?.candidateType ?? null,
    remote: remote?.candidateType ?? null,
    protocol: local?.protocol ?? null,
    relayProtocol: local?.relayProtocol ?? null,
  };
}
```
`[VERIFIED: w3.org/TR/webrtc-stats]`

### #5 — Os dois DataChannels, criados só pela autoridade

```ts
// src/net/rtc.ts
// Two channels, one SCTP association (bundlePolicy: 'max-bundle'). The classes are already
// frozen in CHANNEL_CLASS (packages/protocol/src/enums.ts:74) — this is where they become
// two objects.
//
// ONLY THE AUTHORITY CALLS createDataChannel. A guest gets them through `ondatachannel`.
// That keeps the happy path to a single renegotiation and leaves the collision handled by
// perfect negotiation as the rare case it should be, not the normal one.
const ctl = pc.createDataChannel('ctl', { ordered: true });
const rt  = pc.createDataChannel('rt',  { ordered: false, maxRetransmits: 0 });

// `ordered`, `maxRetransmits` and `maxPacketLifeTime` are mutually exclusive in the spec:
// setting maxRetransmits AND maxPacketLifeTime throws. Only one is set here.
```

### #6 — Round-trip do codec, no estilo de `inputCodec`

```ts
// tests/snapshot-codec.test.ts
it('decode(encode(r)) devolve o mesmo registro, campo a campo', () => {
  const r = extractSnapshot(worstCaseWorld());
  const back = decodeSnapshot(encodeSnapshot(r));
  // Object.is, never a hash: hashWorld travels a lossy path and would pass on data that is
  // already corrupt — the exact trap serialize.ts's header documents (P-9).
  expectDeepIs(back, r);
});

it('encode(decode(bytes)) devolve os mesmos bytes', () => {
  const bytes = encodeSnapshot(extractSnapshot(worstCaseWorld()));
  expect(new Uint8Array(encodeSnapshot(decodeSnapshot(bytes)))).toEqual(new Uint8Array(bytes));
});

it('cada parte cabe em 16 KiB na wave 16 com quatro jogadores (SYNC-04)', () => {
  for (const part of encodeSnapshotParts(extractSnapshot(wave16Swarm()))) {
    expect(part.byteLength).toBeLessThan(16 * 1024);
  }
});
```

---

## State of the Art

| Abordagem antiga | Abordagem atual | Quando mudou | Impacto aqui |
|---|---|---|---|
| DataChannel: 16 KiB é um teto de compatibilidade | 64 KiB é o piso negociado (`max-message-size`, RFC 8841); motores aceitam ≥ 256 KiB | Firefox 57 (nov/2017) implementou EOR | O teto de 16 KiB **continua certo aqui**, por HOL blocking e perda multiplicada — mas a justificativa do código tem de ser essa. Ver Pitfall 4 |
| Interleaving de SCTP resolve o HOL blocking | RFC 8260 (ndata) publicado, adoção em browser ainda irregular | 2017–hoje | Não se pode contar com ele. É o motivo pelo qual mensagem pequena continua importando |
| coturn configurado por `/etc/default/coturn` + `TURNSERVER_ENABLED=1` | O pacote traz `coturn.service` e habilita na instalação | Debian Buster / Ubuntu Disco | A unit é um **drop-in**, não uma cópia. Ver § Discretion #7 |
| `verifyClient` do `ws` | `noServer: true` + `server.on('upgrade')` | há anos | É o que dá o socket cru para responder 401/403/429 legível |
| nginx com `proxy_read_timeout` de 60 s derrubando salas | Caddy sem timeout de leitura por padrão | — | A armadilha de `PITFALLS.md` § 15 **não se aplica** a este projeto. A que se aplica é outra: reload fecha streams (Pitfall 3) |
| SDP como blob a validar | SDP como blob **opaco** que o servidor relaya sem parsear | prática corrente | Mantém o servidor desacoplado da versão de WebRTC dos clientes |

**Deprecado / desatualizado:**
- **`simple-peer`** — sem publicação desde 26/01/2023.
- **`Math.random()` para código de sala** — o código é credencial.
- **A frase "o Firefox fragmenta em 16 KiB e o Chromium não remonta"** como justificativa
  atual: era verdade até o Firefox 57. Substituir pelos três motivos de Pitfall 4.

---

## Assumptions Log

| # | Afirmação | Seção | Risco se estiver errada |
|---|---|---|---|
| A1 | `RTCStatsIceCandidatePairState` na prática inclui `'succeeded'`, embora a enumeração do W3C que li não o liste | Discretion #12 | `routeOf` nunca acha o par e toda linha da tabela vira `unknown`. **Mitigado no código**: aceita `succeeded` OU `nominated` |
| A2 | Tetos plausíveis de projéteis/moedas/poções/baús (80/140/12/4 na wave 16) | Discretion #14, Measured Baseline | O sintético subestima e o teste secundário (run real acima do sintético) fica vermelho — que é o lado certo em que errar, porque o teste **avisa** |
| A3 | 30 min de TTL de sala ociosa, 30 s de heartbeat, 60 s de grace | Discretion #2 | Salas fantasma na `Map` (TTL alto) ou lobby derrubado enquanto se espera um amigo (TTL baixo). Baixo custo de ajustar depois |
| A4 | 1 Hz de ping, mediana de 5, 3 s de timeout, 3 perdas para "sem resposta" | Discretion #11 | Número instável ou lento na tela. Cosmético, ajustável |
| A5 | 10 tentativas de `join`/min/IP e 20 `upgrade`/min/IP | Discretion #1, #7 | Alto demais não protege contra varredura; baixo demais bloqueia quatro amigos atrás de um CGNAT compartilhado — **este caso é real no Brasil** e merece teste manual |
| A6 | `zod` 4.5.4 é seguro e apropriado (não passou por `slopcheck` nesta sessão) | Standard Stack | Rodar `python -m slopcheck install zod` antes de instalar |
| A7 | `perMessageDeflate` desligado é o padrão do servidor no `ws` 8.21.3 | Discretion #2 | Se estiver ligado, fragmentação de memória na caixa de 2 GB. **Conferir no README da versão instalada** |
| A8 | O Caddy fecha WebSockets ativas num `reload` na versão 2.11.4 em particular | Pitfall 3 | Se não fechar, o grace de 60 s é desnecessário (mas inofensivo) |
| A9 | Congelar `OBSTACLE_KIND` agora vale a pena, mesmo que nada nesta fase o escreva | Discretion #9 | Uma tabela a mais no golden, sem consumidor. Custo próximo de zero nos dois sentidos |

---

## Open Questions (RESOLVED)

As quatro perguntas foram fechadas no planejamento; cada uma aponta abaixo para a decisão e o
plano que a resolveram.

1. **O grace de 60 s antes de apagar a sala contradiz D3-02 ou implementa D3-02?**
   - **O que se sabe:** D3-02 diz "o servidor apaga a sala quando o WebSocket da autoridade
     fecha". Verificado que `systemctl reload caddy` fecha WebSockets ativas.
   - **O que não está claro:** se a intenção de D3-02 era "quando a autoridade **sai**" (e o
     socket é só o detector) ou "quando o socket fecha, literalmente".
   - **Recomendação:** grace de 60 s, apresentado ao usuário como esclarecimento de D3-02 e
     não como mudança. A alternativa é uma regra operacional escrita em `ops/README.md`.
   - **RESOLVED:** adotado no plano **03-04** (Task 3, `rooms.ts`) como esclarecimento de D3-02 —
     a constante de 60 s carrega o motivo acima dela e a ameaça está registrada como T-3-19.

2. **`p0` é sempre a autoridade?**
   - **O que se sabe:** ADR 0001 diz que a autoridade atribui os slots na ordem de entrada,
     quando a sala fecha. Quem cria entra primeiro.
   - **O que não está claro:** se isso é uma garantia do protocolo ou um acidente da ordem.
     Se for garantia, código do cliente vai passar a assumir `slot === 'p0'` para saber se é
     a autoridade — e FORM-12 diz que o protocolo não codifica a topologia.
   - **Recomendação:** **não** derivar autoridade do slot. O `welcome`/`joined` diz
     explicitamente qual `peerId` é a autoridade. Custa um campo e mantém a promessa de que
     mover a autoridade para um servidor é troca de construtor.
   - **RESOLVED:** autoridade **nunca** derivada do slot — `Created`/`Joined` carregam
     `authorityPeerId` explícito nos tipos do plano **03-01**, e o cliente do plano **03-08** o lê
     do `created`/`joined` (T-3-31). FORM-12 continua valendo.

3. **O `?sala=` interage com o `start_url: "."` do manifest?**
   - **O que se sabe:** `public/sw.js:125-126` já deixa `/api/` e `/ws` passarem, e a
     allowlist de precache é por caminho — `/?sala=ABC` casa `/` e é servido do cache, que é
     o comportamento certo. `start_url` e `scope` são `"."`.
   - **O que não está claro:** se um PWA instalado a partir de `/?sala=ABC` grava esse
     `start_url`, fazendo o app abrir sempre numa sala morta.
   - **Recomendação:** um teste de Playwright em `tests/pwa/` que instala a partir de
     `/?sala=X` e confere o `start_url` resolvido. A infraestrutura já existe.
   - **RESOLVED:** plano **03-10**, Task 3 — `tests/pwa/room-url.spec.ts` instala a partir de
     `/?sala=X` e assere que o `start_url` resolvido não contém `sala=`; a query sai com
     `replaceState` no boot (D3-07, T-3-32).

4. **Quatro amigos atrás do mesmo CGNAT compartilham IP para o rate limit?**
   - **O que se sabe:** `STACK.md` documenta que CGNAT é amplamente usado no Brasil.
   - **O que não está claro:** com que frequência quatro jogadores da mesma sala saem pelo
     mesmo endereço público.
   - **Recomendação:** limites folgados (20 `upgrade`/min) e um teste manual na primeira
     sessão real de quatro pessoas. O custo de errar é baixo enquanto o público é fechado.
   - **RESOLVED:** limites folgados no plano **03-04** (`limiter.ts`: `upgrade` 20/min/IP e `join`
     10/min/IP, com a lacuna do CGNAT escrita em comentário) e a medição no plano **03-11**
     (passo 7 do roteiro manual, T-3-38).

---

## Environment Availability

| Dependência | Requerida por | Disponível | Versão | Fallback |
|---|---|---|---|---|
| Node.js | tudo | ✓ | 24.11.1 | — |
| npm | workspaces | ✓ | 11.6.2 | — |
| Playwright | teste de duas abas (onda 6) | ✓ | 1.62.1 | — |
| Chromium (Playwright) | teste de duas abas | ✓ | cache local | — |
| Firefox (Playwright) | `cross-engine` do codec | ✓ | cache local | — |
| WebKit (Playwright) | `cross-engine` do codec | ✗ local, ✓ no CI | — | O CI instala os três (`ci.yml`) |
| OpenSSL | conferir o HMAC à mão em debug | ✓ | 3.2.4 | `node:crypto` |
| `ws` 8.21.3 | signaling | ✗ | — | Instalar (§ Standard Stack) |
| **coturn** | **relay real, critério 3 (SALA-04)** | **✗** | — | **Nenhum.** Mora na VPS |
| **VPS (02-04)** | coturn, medição real de ICE, TLS | **✗ — adiado** | — | **Nenhum** |

**Faltando sem fallback:**
- **coturn e a VPS.** O critério 3 (SALA-04) **não pode ser dado como fechado** antes do
  02-04 — o `STATE.md` já registra, e a onda 7 é onde isso mora. Tudo o mais desta fase roda
  local, incluindo o critério 5 (SYNC-04), que é o de maior valor técnico.

**Faltando com fallback:**
- WebKit local: o portão `cross-engine` roda no CI com os três motores instalados. Um dev
  local que rode `npm run test:browser` sem WebKit vê um projeto faltando, não um falso verde
  — `vitest.browser.config.ts` lista os três explicitamente.

---

## Validation Architecture

`workflow.nyquist_validation` está `true` em `.planning/config.json`.

### Test Framework

| Propriedade | Valor |
|---|---|
| Framework (Node) | **Vitest 4.1.11**, `vitest.config.ts` — `include: ['tests/**/*.test.ts']`, exclui `cross-engine.test.ts` |
| Framework (motores) | **Vitest browser mode**, `vitest.browser.config.ts` — Chromium, Firefox, WebKit via `@vitest/browser-playwright` |
| Framework (e2e/PWA) | **@playwright/test 1.62.1**, `playwright.config.ts` — `testDir: tests/pwa`, só Chromium, `workers: 1` |
| Comando rápido | `npx vitest run tests/<arquivo>.test.ts` |
| Suíte completa | `npm test && npm run test:browser && npm run test:pwa` |
| Type gates | `npm run typecheck:sim`, `:protocol`, `:server`, `:pwa` |

### Phase Requirements → Test Map

| Req | Comportamento | Tipo | Comando automatizado | Existe? |
|---|---|---|---|---|
| SALA-01 | Código de 6 caracteres, alfabeto sem ambiguidade, único entre salas vivas | unit | `npx vitest run tests/room-code.test.ts` | ❌ Wave 0 |
| SALA-01 | Normalização de entrada (caixa, `I/L→1`, `O→0`, `U` recusado) | unit | idem | ❌ Wave 0 |
| SALA-02 | Máquina de estado do lobby: entrar, sair, sala cheia, sala morta | unit (sobre `local.ts`) | `npx vitest run tests/lobby.test.ts` | ❌ Wave 0 |
| SALA-02 | Quatro peers se veem no lobby, sobre WebRTC real | e2e | `npx playwright test tests/net/room.spec.ts` | ❌ Wave 0 |
| SALA-03 | Escolha de classe propaga; slots `p0..p3` atribuídos e imutáveis | unit | `npx vitest run tests/lobby.test.ts -t slots` | ❌ Wave 0 |
| SALA-03 | `startRun` → `RunConfig` com os quatro; hash do tick 0 confere (D3-05) | unit | `npx vitest run tests/run-config-lobby.test.ts` | ❌ Wave 0 |
| SALA-04 | `iceServers` inclui STUN próprio, STUN público e TURN quando há credencial | unit | `npx vitest run tests/turn.test.ts` | ❌ Wave 0 |
| SALA-04 | HMAC da credencial bate com um vetor conhecido; TTL correto | unit | idem | ❌ Wave 0 |
| SALA-04 | `ops/turnserver.conf` tem `use-auth-secret`, todos os `denied-peer-ip`, quotas, `no-cli`, e **nenhum segredo** | unit | `npx vitest run tests/ops-config.test.ts` | ⚠️ arquivo existe, casos novos |
| SALA-04 | **A sala fecha pelo relay contra o coturn real** | **manual-only** | — | 🔒 **Bloqueado por 02-04.** Não há como automatizar sem a caixa |
| SALA-05 | `routeOf` classifica `relay`/`direct`/`unknown` a partir de relatórios sintéticos | unit | `npx vitest run tests/ice-route.test.ts` | ❌ Wave 0 |
| SALA-05 | RTT: mediana de 5, ping perdido não vira infinito, 3 perdas → "sem resposta" | unit | `npx vitest run tests/ping.test.ts` | ❌ Wave 0 |
| SALA-05 | Migração `ice_outcome` aplica; INSERT de sucesso e de falha; idempotente por id | unit | `npx vitest run tests/server-migrate.test.ts` | ⚠️ arquivo existe, casos novos |
| **SYNC-04** | **Cada parte < 16 KiB na wave 16 com 4 jogadores (sintético D3-20)** | unit | `npx vitest run tests/snapshot-codec.test.ts -t 16` | ❌ Wave 0 |
| SYNC-04 | Round-trip duplo do codec + idempotência de `extract` | unit | `npx vitest run tests/snapshot-codec.test.ts` | ❌ Wave 0 |
| SYNC-04 | `-0` normalizado, conferido com `Object.is` e nunca por hash | unit | idem | ❌ Wave 0 |
| SYNC-04 | Codec produz os mesmos bytes em Chromium, Firefox, WebKit e Node | cross-engine | `npm run test:browser` | ⚠️ arquivo existe, caso novo |
| SYNC-04 | O particionamento **é exercido**: um World forçado emite 3 partes | unit | `npx vitest run tests/snapshot-codec.test.ts -t partição` | ❌ Wave 0 |
| SYNC-04 | Bench imprime o número no log do CI | smoke | `npm run bench:snapshot` | ❌ Wave 0 |
| SYNC-04 | Run real até a wave 16 fica abaixo do sintético | unit | `npx vitest run tests/snapshot-bench.test.ts` | ❌ Wave 0 |
| FORM-12 | Nenhuma fonte de `packages/protocol` contém "host" (inclui as tabelas novas) | unit | `npx vitest run tests/protocol-vocabulary.test.ts` | ✅ existe |
| FORM-12 | `Transport` não tem `broadcast`; `src/net/` não usa "host" | unit | `npx vitest run tests/net-vocabulary.test.ts` | ❌ Wave 0 |
| FORM-11 | As 15 tabelas batem com o golden, na ordem | unit | `npx vitest run tests/protocol-enums.test.ts` | ⚠️ arquivo existe, tabelas novas |
| FORM-11 | Cada tabela do protocolo espelha o tipo do sim (padrão `OBJECTIVE_KIND`) | unit | idem | ❌ Wave 0 |
| C-2 | `packages/sim` não importa de `net/` | unit | `npx vitest run tests/purity.test.ts` | ⚠️ `FORBIDDEN_LAYER` ganha `net` |
| C-1 | `dependencies` do jogo e de `packages/protocol` continuam `{}` | unit | `npx vitest run tests/workspaces.test.ts` | ⚠️ arquivo existe, caso novo |
| D3-07 | PWA instalado a partir de `/?sala=X` não fixa uma sala no `start_url` | e2e | `npx playwright test tests/pwa/room-url.spec.ts` | ❌ Wave 0 |

### Sampling Rate

- **Por commit de task:** `npx vitest run tests/<arquivo-tocado>.test.ts` — sub-segundo.
- **Por merge de onda:** `npm test && npm run typecheck:protocol && npm run typecheck:server`.
  Nas ondas 2, 3 e 6 acrescentar `npm run test:browser`.
- **Portão de fase:** `npm run lint && npm test && npm run test:browser && npm run test:pwa &&
  npm run bench:snapshot && npm run build` inteiramente verdes antes de `/gsd:verify-work`.
  **Com a exceção nomeada de SALA-04 contra a caixa real**, que fica adiado com o 02-04.

### Wave 0 Gaps

Infraestrutura de teste que precisa existir antes que os testes acima possam ser escritos:

- [ ] `tests/net/helpers.ts` — construtor de par de `Transport` sobre `local.ts`, mais o
      wrapper semeado de `lossy.ts`; cobre SALA-02, SALA-03
- [ ] `tests/worlds.ts` — construtores de World sintético (wave 1, wave 16 + swarm + elite,
      wave 40 endless), **compartilhados entre o teste e o bench** para que o teto seja um só;
      cobre SYNC-04. O harness de medição desta pesquisa está no scratchpad e serve de ponto
      de partida
- [ ] `tools/bench/snapshot.mjs` + `"bench:snapshot"` em `package.json` + passo em `ci.yml`;
      cobre SYNC-04
- [ ] `tests/net-vocabulary.test.ts` — o grep de FORM-12 estendido a `src/net/`; cobre FORM-12
- [ ] Extensão de `tests/purity.test.ts:78` (`FORBIDDEN_LAYER` ganha `net`) e de
      `eslint.config.js` (`no-restricted-imports` do sim ganha `**/net/**` e `**/net`);
      cobre C-2
- [ ] `tests/net/room.spec.ts` sob Playwright — **dois `browserContext` no mesmo Chromium**.
      Contextos partilham o processo do navegador mas não o estado de sessão, que é
      exatamente a fronteira certa para dois jogadores; WebRTC entre eles fecha por loopback
      sem STUN. **Não precisa de `--use-fake-device-for-media-stream`**: DataChannel não toca
      `getUserMedia`. `playwright.config.ts` atual é `testDir: 'tests/pwa'`, então este
      arquivo exige um **projeto novo** na config ou um `testDir` mais largo — decisão do
      planejador `[CITED: playwright.dev/docs/browser-contexts]`
- [ ] Nenhuma instalação de framework é necessária: Vitest, browser mode e Playwright já estão

---

## Security Domain

`security_enforcement` não está desligado em `.planning/config.json` (chave ausente = ligado).

### Applicable ASVS Categories

| Categoria ASVS | Aplica | Controle padrão nesta fase |
|---|---|---|
| **V2 Authentication** | **não** (por decisão) | D3-09 adia a sessão para a fase 6. O código de sala é a única credencial, e isso está registrado. O ponto nomeado no `upgrade` é onde V2 entra |
| **V3 Session Management** | parcial | O TTL de sala e o keepalive são o gerenciamento de sessão que existe. A credencial TURN expira em 1 h (D3-10) |
| **V4 Access Control** | **sim** | Só quem apresenta o código entra na sala. Só a autoridade emite `startRun`. O servidor recusa `offer`/`answer` endereçados a peer que não está na sala |
| **V5 Input Validation** | **sim** | `zod` em `apps/server` para o signaling; checagens de limite no codec binário (contagem declarada vs. bytes recebidos, como `decodeLog` já faz); guardas estreitas em `lobbyState` |
| **V6 Cryptography** | **sim** | `node:crypto` — `randomBytes` para o código, `createHmac('sha1')` para o TURN REST API. **Nada de criptografia escrita à mão** |
| **V7 Error Handling / Logging** | **sim** | `REJECT_REASON` chega à tela com os dois valores (D-08); o log do servidor correlaciona por código de sala; nada de stack trace para o cliente (o `handle_errors` do Caddy já faz isso) |
| **V13 API / Web Service** | **sim** | O `upgrade` confere `Origin` (anti-CSWSH), tem rate limit e `maxPayload` |

### Known Threat Patterns for WebRTC + WebSocket + coturn

| Padrão | STRIDE | Mitigação |
|---|---|---|
| **Varredura de código de sala** | Information Disclosure | 6 caracteres (10⁹) + rate limit por IP no `join` + TTL de sala `[CITED: PITFALLS.md § 15]` |
| **Cross-Site WebSocket Hijacking** | Spoofing | Checagem de `Origin` no `upgrade` (D3-09). Só cobre navegador — está escrito no comentário |
| **TURN aberto como relay de spam** | Elevation of Privilege | `use-auth-secret` (nunca credencial fixa) + credencial efêmera de 1 h amarrada à sala |
| **TURN como SSRF para a LAN da VPS** | Elevation of Privilege | O bloco completo de `denied-peer-ip` (RFC 1918, loopback, link-local, ULA v6) + `no-multicast-peers`. **Não negociável** `[CITED: STACK.md]` |
| **Exaustão de banda/CPU no TURN** | Denial of Service | `user-quota=12`, `total-quota=1200`, `MemoryMax=128M` no drop-in |
| **Exaustão de memória pelo WebSocket** | Denial of Service | `maxPayload: 64 KiB` (padrão é 100 MiB), teto no Map do rate limiter, `MemoryMax=256M` já na unit |
| **Peer malicioso mandando `lobbyState` forjado** | Tampering | Só a autoridade emite `lobbyState`; o cliente descarta o que vier de outro `peerId`. Guardas de comprimento e domínio nos campos |
| **Peer malicioso mandando snapshot enorme** | Denial of Service | O decodificador confere a contagem declarada contra os bytes recebidos **antes** de alocar — exatamente o que `decodeLog` faz em `inputCodec.ts:330-338`. Copiar o padrão, não reinventá-lo |
| **IP de jogador vazando na telemetria** | Information Disclosure | `address` e `port` do `getStats()` **não** vão para a tabela (D3-14) |
| **Segredo do TURN no repositório** | Information Disclosure | `ops/turnserver.conf` só com placeholder; `tests/ops-config.test.ts` assere (D2-15) |
| **`static-auth-secret` divergente entre os dois arquivos** | Denial of Service | `ops/README.md` § 12 documenta o par. Sintoma indistinguível de NAT ruim, por isso precisa estar escrito |
| **Autoridade trapaceira** | Tampering | **Fora do escopo desta fase, e por desenho.** ARCHITECTURE Padrão 3: a autoridade é fonte da verdade da **sessão**, não da **conta**. Nada durável passa por ela sem reverificação (fase 6 em diante) |

---

## Sources

### Primary (HIGH confidence)

- **Medição própria** sobre `packages/sim` deste repositório com `tsx`, 2026-09-02 — tamanhos
  de `saveWorld` em JSON por cenário, custo por entidade, cardinalidade das tabelas de enum,
  wave de estouro de `uint16` para `id` (164) e para `hp` (~70), estimativa binária do layout
  proposto
- **Leitura do código-fonte deste repositório** — `packages/protocol/src/{enums,inputCodec,version,index}.ts`,
  `packages/sim/src/{types,serialize,world,run,enemies,arena,index}.ts`, `packages/sim/src/defs/enemies.ts`,
  `apps/server/src/{index,app,env}.ts`, `apps/server/src/db/migrations.ts`,
  `src/{main,app/forge,app/ulid,ui/settings,ui/screens,render/entities,ui/hud}.ts`,
  `ops/{Caddyfile,dg2.service,README.md}`, `public/{sw.js,manifest.json}`,
  `eslint.config.js`, todos os `tsconfig.json`, `.github/workflows/ci.yml`,
  `tests/{protocol-enums,protocol-vocabulary,purity,ops-config,dom-ids,cross-engine,lint-coverage}.test.ts`
- **Context7 `/websockets/ws`** — `noServer: true` + `server.on('upgrade')`, autenticação
  antes do handshake com resposta 401 no socket cru, heartbeat `isAlive`/`terminate`,
  `maxPayload`, `perMessageDeflate`
- `https://developer.mozilla.org/en-US/docs/Web/API/WebRTC_API/Perfect_negotiation` — o
  padrão completo, `makingOffer`/`ignoreOffer`/`isSettingRemoteAnswerPending`,
  `setLocalDescription()` sem argumento
- `https://developer.mozilla.org/en-US/docs/Web/API/WebRTC_API/Using_data_channels` —
  "keep message sizes moderately small", head-of-line blocking sem RFC 8260, `max-message-size`
  do RFC 8841 com padrão de 64 KB
- `https://www.w3.org/TR/webrtc-stats/` — `RTCIceCandidateStats` (`candidateType`, `protocol`,
  `relayProtocol`), `RTCIceCandidatePairStats` (`state`, `nominated`, `localCandidateId`,
  `remoteCandidateId`, `currentRoundTripTime`), `RTCTransportStats.selectedCandidatePairId`
- `https://nodejs.org/api/http.html#event-upgrade_1` — o evento `upgrade` é emitido **no
  lugar** de `request`; sem listener, o socket é destruído
- `https://caddyserver.com/docs/caddyfile/directives/reverse_proxy` — `X-Forwarded-For`
  substituído para origem não confiável; sem timeout padrão de leitura/escrita no stream
- **Registro npm consultado diretamente em 2026-09-02** — `ws@8.21.3`, `@types/ws@8.18.1`,
  `zod@4.5.4`, `hono-rate-limiter@0.5.3` (peer `unstorage`), idade e downloads
- **`slopcheck`** — `ws` e `@types/ws` ambos `[OK]`
- **Pesquisa deste projeto** — `.planning/research/ARCHITECTURE.md` §§ 3.3, 5.1–5.5, 9, 10, 14;
  `.planning/research/PITFALLS.md` §§ 4, 11, 15; `.planning/research/STACK.md` § STUN/TURN,
  § coturn, § porta 443, § ICE no cliente; `.planning/research/FEATURES.md` § Table Stakes

### Secondary (MEDIUM confidence)

- `https://lgrahl.de/articles/demystifying-webrtc-dc-size-limit.html` (Lennart Grahl) —
  história do teto de 16 KiB, EOR, ndata, comportamento de Chromium vs. Firefox. Confere com
  a MDN nos pontos que se sobrepõem
- `https://blog.mozilla.org/webrtc/large-data-channel-messages/` — EOR no Firefox 57
- `https://manpages.debian.org/testing/coturn/turnserver.1.en.html` +
  `github.com/coturn/coturn#146` — o pacote traz `coturn.service`; `/etc/default/coturn` é
  histórico
- `https://playwright.dev/docs/browser-contexts` — múltiplos contextos num navegador,
  isolados como janelas anônimas
- `https://github.com/caddyserver/caddy/issues/6420` — reload fecha WebSockets ativas

### Tertiary (LOW confidence — marcado para validação)

- Que os motores reportem `'succeeded'` como `RTCStatsIceCandidatePairState` (A1). Mitigado
  no código com o segundo critério `nominated`
- Que o Caddy 2.11.4 **especificamente** feche WebSockets no reload (A8). A recomendação é
  inofensiva se estiver errada
- Números de dimensionamento: TTL, keepalive, frequência de ping, cotas de rate limit
  (A3, A4, A5) — escolhas de engenharia com fonte parcial, ajustáveis com custo baixo

---

## Metadata

**Confidence breakdown:**

| Área | Nível | Razão |
|---|---|---|
| Layout e tamanho do codec | **HIGH** | Medido neste repositório hoje, não extrapolado. Os três números que mais importam (82 KiB de JSON na wave 16, 1,44 KiB na maior parte binária, wave ~210 para a partição morder) vêm de execução, não de estimativa |
| Tabelas de enum | **HIGH** | Cardinalidades lidas do sim por script; ausência de mutação de `anim`/`eliteName` confirmada por grep |
| Perfect negotiation e os dois canais | **HIGH** | MDN, verbatim, mais a documentação do `RTCPeerConnection` |
| `ws` e o `upgrade` | **HIGH** | Context7 sobre o repositório oficial, mais a documentação do Node sobre o evento |
| Rota via `getStats()` | **MEDIUM-HIGH** | Nomes de campo verificados no W3C; o valor `'succeeded'` do estado é o único ponto assumido, e o código o contorna |
| coturn e a unit | **MEDIUM** | O formato de drop-in e o comportamento do pacote Debian estão verificados; **nada foi executado contra uma caixa**, porque ela não existe (02-04) |
| Dimensionamento (TTL, ping, cotas) | **MEDIUM** | Escolhas de engenharia com fonte parcial. Registradas em § Assumptions Log |
| Grace de 60 s / reload do Caddy | **MEDIUM** | O comportamento está documentado em issue; a versão exata não foi testada. Registrado em § Open Questions |
| Fechamento do critério 3 (SALA-04) | **N/A** | **Bloqueado por 02-04.** Nenhuma pesquisa fecha isso; só a caixa |

**Research date:** 2026-09-02
**Valid until:** 2026-10-02 para as versões de pacote e o comportamento dos motores (30 dias,
stack estável). As medições sobre `packages/sim` valem até o `SIM_VERSION` mudar — se ele
mudar, **re-rode o bench antes de confiar nos números desta página.**

---

*Phase: 3 — Sala, transporte e protocolo*
*Research completed: 2026-09-02*
