<!-- GSD:project-start source:PROJECT.md -->
## Project

**DungeonGuys2**

Um pixel shooter survival roguelite co-op online para até 4 jogadores, derivado do
DungeonGuys (que segue vivo e independente). Amigos entram numa sala por código e
enfrentam juntos as mesmas waves, numa arena maior que a tela. Cada jogador tem conta
própria, com progresso que o segue entre aparelhos, e escolhe qual personagem vai jogar.
Além do survival sem fim, há um modo missão com destravamento em cadeia e objetivos de
conclusão próprios.

**Core Value:** **Quatro amigos entram numa sala pelo código e lutam as mesmas waves no mesmo mundo, com
o jogo respondendo na hora para cada um.** Se tudo o mais falhar, isso precisa funcionar —
é a razão de o projeto existir e a razão de o Marco 0 ter sido construído como foi.

### Constraints

- **Tech stack**: TypeScript + Vite, sem dependências de runtime no jogo publicado
  (`dependencies` vazio) — o jogo é canvas puro e precisa continuar assim
- **Pureza**: `src/sim/` não pode referenciar DOM, `window`, `navigator`, `localStorage`,
  `performance`, `Date`, `Math.random`, `requestAnimationFrame` nem `setTimeout`, nem
  importar de `render/`, `ui/` ou `app/`. Imposto por lint e por teste — é a propriedade
  que o multiplayer inteiro compra
- **Passo fixo**: `DT_MS = 1000/60`; `TICK_FACTOR = DT_MS / 16.67` preserva o tuning do
  original
- **Mundo**: `WORLD = { w: 2400, h: 1600 }`, `TILE = 32` — o `TILE` provavelmente muda
  quando a arte nova entrar
- **Infra**: VPS Hostinger própria; jogo, API e signaling no mesmo servidor, domínio único.
  Operação é do usuário, incluindo TLS e uptime
- **Netcode**: P2P host-autoritativo por WebRTC agora, com a fronteira desenhada para que
  mover a autoridade para um servidor depois seja troca de transporte, não reescrita
- **Assets**: produzidos em repositório separado por um agente em outra sessão; este
  projeto consome arquivos prontos. A especificação técnica precisa preceder a produção
- **Público**: fechado primeiro (amigos por código de sala), com a arquitetura pronta para
  abrir. Só o que é caro mudar depois — formato de conta e identidade — se decide agora
- **Idioma**: comentários de código em inglês; documentos e mensagens de commit em português
<!-- GSD:project-end -->

<!-- GSD:stack-start source:research/STACK.md -->
## Technology Stack

## Resumo executivo em cinco frases
## Recommended Stack
### Core Technologies
| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| **Node.js** | **24.x LTS** (24.11.1) | Runtime do servidor de API/signaling e do worker de replay | Active LTS até out/2026, depois Maintenance; já é a versão da máquina de dev. Node 26 é *Current*, não LTS — não colocar em VPS. Node 22 entra em Maintenance |
| **Caddy** | **2.11.4** (2026-06-03) | Servidor web na porta 443: estático + reverse proxy | TLS automático (Let's Encrypt/ZeroSSL) com renovação sem cron, HTTP/2 e HTTP/3 por padrão, WebSocket upgrade sem módulo extra, binário único sem dependências. O Caddyfile deste projeto cabe em 20 linhas |
| **Hono** | **4.13.5** | Framework HTTP da API de contas/ranking | Web-standard `Request`/`Response` — o Better Auth monta direto, sem adaptador. Leve, tipado, roda em Node via `@hono/node-server`. Fastify seria igualmente defensável, mas exigiria adaptador para o Better Auth |
| **`@hono/node-server`** | **2.1.1** | Cola Hono ↔ `node:http` | Expõe o `http.Server` real, que é **necessário** para anexar o `ws` no evento `upgrade` |
| **`ws`** | **8.21.3** | Servidor WebSocket do signaling | Padrão de fato no Node desde sempre, ativo (última publicação 2026-08-07), zero dependências, e o modo `noServer: true` permite autenticar **antes** de completar o handshake |
| **coturn** | **4.17.2** (2026-08) | STUN + TURN próprio | Única implementação livre madura de TURN. `use-auth-secret` dá credenciais efêmeras por HMAC sem tabela de usuários no TURN. Ver a seção TURN — este é o item mais subestimado do stack |
| **Better Auth** | **1.7.2** | Contas, sessões, senha, OAuth futuro | Auto-hospedado de verdade (o banco é seu), agnóstico de framework, sessão em cookie com tabela de sessões no banco → **revogação funciona**, o que importa agora que trapaça contamina progresso na nuvem. Lucia foi descontinuado em mar/2025; Auth.js está em manutenção de segurança sob o guarda-chuva do Better Auth |
| **SQLite** (via **`better-sqlite3`**) | **13.0.3** | Contas, progressão, missões, ranking, fila de verificação | Um arquivo, zero operação, backup trivial, e a escala do projeto (amigos por código de sala) está três ordens de grandeza abaixo do limite. API síncrona é vantagem num servidor pequeno: sem pool, sem `await` em caminho quente |
| **Kysely** | **0.29.5** | Query builder tipado + migrações | O Better Auth já usa Kysely no núcleo — adotá-lo evita **duas** camadas de query no mesmo processo. Migrator embutido, SQL portável para Postgres no dia em que migrar |
| **systemd** | (do SO) | Supervisão de processo | Já está instalado, sobrevive a reboot sem `pm2 startup`, logs no journald de graça, e dá sandbox (`NoNewPrivileges`, `MemoryMax`, `ProtectSystem`) sem container |
### Supporting Libraries
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| **`zod`** | **4.5.1** | Validação do protocolo de signaling e dos payloads de sync/ranking | Toda mensagem que entra pela rede. O `packages/protocol` define os schemas uma vez e os dois lados importam — tipo e validador da mesma fonte |
| **`@types/ws`** | **8.18.1** | Tipos do `ws` | Sempre (devDependency) |
| **`pino`** | **10.3.1** | Log estruturado JSON para o journald | Desde o primeiro dia — depurar desconexão de WebRTC sem log correlacionado por sala é inviável |
| **`@node-rs/argon2`** | **2.1.0** | Hash de senha argon2id, binário pré-compilado | **Só se** você quiser argon2id. O padrão do Better Auth é scrypt do `node:crypto`, que é adequado e não adiciona módulo nativo. Recomendação: **fique no padrão** |
| **`tsx`** | **4.23.12** | Rodar TypeScript direto em dev no servidor | Dev do `apps/server`. Em produção, build com `esbuild` |
| **`esbuild`** | **0.28.2** | Bundle do servidor para produção | Um arquivo `server.mjs`, sem `node_modules` na VPS exceto os nativos (`better-sqlite3`) |
| **`node-datachannel`** | **0.33.1** | `RTCPeerConnection` nativo no Node (libdatachannel) | **Não agora.** É o caminho de migração: o dia em que a autoridade sair do host, o servidor entra na sala como mais um peer WebRTC e o protocolo não muda. Registrar como opção, não instalar |
| **`@stdlib/math-base-special-{sin,cos,atan2}`** | **0.3.1** | Referência para o port fdlibm | **devDependency apenas**, como oráculo do teste que valida o `sim/math.ts` vendorizado (ver seção de determinismo) |
### Development Tools
| Tool | Purpose | Notes |
|------|---------|-------|
| **npm workspaces** | Monorepo `packages/sim`, `packages/protocol`, `apps/web`, `apps/server` | Já vem no npm 11.6.2. Não instale pnpm/turbo/nx: quatro pacotes não justificam um orquestrador |
| **Vite 7.3.6** | Build do cliente | **Não pule para o 8.2.2.** O 8.x é novíssimo; o 7.3.6 já corrige o GHSA-fx2h-pf6j-xcff do backlog e é a linha `previous` estável |
| **Vitest 4.1.11** | Testes | Peer deps: `vite ^6 \|\| ^7 \|\| ^8` — casa com Vite 7.3.6 |
| **`@playwright/test` 1.62.1** | **Teste de determinismo entre motores** | O item que falta na suíte: rodar N ticks e comparar `hashWorld` em Chromium, Firefox, WebKit **e** Node contra um hash-ouro versionado. É a única coisa capaz de pegar a divergência que `determinism.test.ts` não pega por construção |
| **ESLint 10.9.1 + typescript-eslint 8.68.0** | Lint e regra de pureza | Estender `no-restricted-properties` de `src/sim/**` com `sin`, `cos`, `atan2`, `tan`, `pow`, `exp`, `log`, `hypot` — a regra que hoje só cobre `Math.random` e `Date.now` |
| **Litestream** | Backup contínuo do SQLite | Binário único + unit systemd; replica o WAL para S3/B2. A alternativa pobre é `VACUUM INTO` noturno + rclone |
## STUN/TURN — a resposta com números
### Preciso mesmo de TURN?
### Quanto falha sem TURN — a matemática
| Fonte | Faixa |
|---|---|
| bloggeek.me (Tsahi Levent-Levi) | 0–50%, "meça, não presuma" |
| Kranky Geek / levantamentos de produção | 15–20% |
| Consenso "usuários de internet residencial" | 10–20% |
| Redes corporativas com firewall gerenciado | 60–85% |
| `p` por par | Sala de 2 (1 link) | Sala de 3 (2 links) | **Sala de 4 (3 links)** |
|---|---|---|---|
| 5% | 5,0% | 9,8% | **14,3%** |
| **10%** | 10,0% | 19,0% | **27,1%** |
| **15%** | 15,0% | 27,8% | **38,6%** |
| **20%** | 20,0% | 36,0% | **48,8%** |
| 30% | 30,0% | 51,0% | 65,7% |
### Quanto custa de banda
- Snapshot de **2 KB** a **20 Hz** por cliente → 40 KB/s descendo do host para cada um.
- Inputs subindo: ~6 B/tick × 60 Hz ≈ 0,4 KB/s por cliente — desprezível.
- Host com 3 clientes → **~120 KB/s de egresso do host**.
| Cenário | Tráfego no TURN | Por hora de sessão | Sessões-hora em KVM 1 (4 TB) | em KVM 2 (8 TB) |
|---|---|---|---|---|
| 1 dos 3 links relayed | ~82 KB/s | **~0,29 GB** | ~13.800 | ~27.600 |
| 2 dos 3 links relayed | ~164 KB/s | ~0,58 GB | ~6.900 | ~13.800 |
| **3 de 3 relayed (pior caso)** | **~246 KB/s (≈2 Mbit/s)** | **~0,87 GB** | **~4.700** | **~9.400** |
- **Latência: +20 a 80 ms** dependendo da distância ao relay. Com o TURN na mesma VPS e jogadores brasileiros, é o extremo baixo dessa faixa — mas escolha uma região da VPS **no Brasil ou em São Paulo**, não em Vilnius, ou o relay vira +200 ms.
- **CPU/pps**, não bytes: coturn a 2 Mbit/s de UDP em pacotes pequenos custa mais interrupções do que largura.
- **Abuso**: um TURN aberto é relay de spam e vetor de SSRF para a sua própria rede.
### Configuração mínima obrigatória do coturn
# /etc/turnserver.conf
# TURN REST API: credenciais efêmeras por HMAC, sem tabela de usuários no TURN
# --- não negociáveis: um TURN aberto é relay de spam e SSRF para a sua LAN ---
### O conflito da porta 443
### Configuração ICE no cliente
## Determinismo entre motores — a resposta com custo
### O que a especificação realmente diz
| Motor | `sin`/`cos`/`tan` | Consequência |
|---|---|---|
| **V8 (Chrome, Node, Edge)** | Rotina embutida derivada de fdlibm/glibc `dbl-64`, estaticamente ligada | Mesmos bits em todo SO — **mas** o V8 trocou `Math.tanh` pelo `std::tanh` do sistema no **Chrome 148** (commit `c1486295ae5`, V8 14.8.57). O precedente existe: o V8 *pode* delegar ao libm do host quando quiser |
| **SpiderMonkey (Firefox)** | fdlibm apenas sob a pref `javascript.options.use_fdlibm_for_sin_cos_tan` / Resist Fingerprinting; caso contrário usa o libm da plataforma | Firefox no Windows (UCRT), no macOS (`libsystem_m`) e no Linux (glibc) podem divergir entre si e do V8 |
| **JavaScriptCore (Safari)** | Funções transcendentais **nativas da plataforma** | Diverge do V8 por construção. Não há pref para desligar isso |
### O que É garantido pela especificação
### As opções, custeadas
| # | Opção | O que muda | Custo | Garantia | Reequilíbrio? |
|---|---|---|---|---|---|
| **A** | **`sim/math.ts` com port fdlibm em JS puro** — `sin`, `cos`, `atan2` vendorizados | 30 call sites em 8 arquivos + ~550 LOC novos | **2–4 dias** | Bit-exato em qualquer motor ES2015+ | Não. Só re-baselinar os hashes-ouro |
| **B** | **Tabela de lookup + ângulo quantizado** — ângulo vira `uint16` (1/65536 de volta), tabela literal commitada | Formato do `aim` no `InputState`, e todo consumidor de ângulo | 1–2 dias + retuning de mira | Bit-exato; e de quebra encolhe o input log | Sim, sutilmente: mira ganha granularidade de 0,0055° |
| **C** | **Ponto fixo em toda a `sim/`** | Toda a aritmética; posições, velocidades, dano, stats | **3–6 semanas** + rebalanceamento completo | Máxima. Também elimina risco de ordem de operações | Sim, tudo |
| **D** | **Exigir o mesmo motor** | Nada de código; uma decisão escrita | 0 | **Nenhuma.** Exclui Firefox/Safari e o V8 já mostrou que muda | — |
| **E** | **Compilar a `sim/` para WASM** (Rust/AssemblyScript) | Reescrever 2.974 linhas | **Meses** | Máxima — floats do WASM são totalmente especificados, libm vai compilada junto | Sim, tudo |
### Recomendação: **A agora. B só se o profiler pedir. C e E nunca (para este jogo).**
| Função | Origem de referência | LOC aprox. |
|---|---|---|
| `getHighWord` / `getLowWord` | view `Float64Array`/`Uint32Array` compartilhada | 30 |
| `kernelSin`, `kernelCos` | FreeBSD msun `k_sin.c` / `k_cos.c` | 90 |
| `rempio2` (redução de argumento) | FreeBSD msun `e_rem_pio2.c` — a parte grande | 250 |
| `sin`, `cos` | FreeBSD msun `s_sin.c` / `s_cos.c` | 60 |
| `atan`, `atan2` | Go `math/atan.go` / `math/atan2.go` | 120 |
### Armadilhas de determinismo além de sin/cos/atan2
- **`app/input.ts` usa `Math.hypot` e `Math.atan2`** (`:64,79,82,111,113`). Só é seguro se o Marco 1 **transmitir o `InputState`** pela rede em vez de cada peer recalcular. Torne isso uma decisão escrita do protocolo, não um acidente.
- **`world.players` deve ser `Map`, não objeto** — chaves numéricas em objeto iteram em ordem crescente, não de inserção; trocar o id de string para número mudaria a ordem de `step()` silenciosamente.
- **`-0` no hash**: `hashWorld` precisa normalizar `-0` para `0`, ou dois mundos idênticos hasheiam diferente.
- **`world.rng` é instância de classe** (backlog): `rng.save()`/`rng.restore()` precisam entrar no formato de snapshot **e** no formato de replay. Um replay que não restaura o estado do PRNG não é um replay.
- **Validar `InputState` dentro de `step()`**, não num validador à parte. Clamp de `move` em [-1,1] e de `aim` no domínio, por construção. Um validador separado deriva do sim com o tempo, e a divergência aparece como "replay não confere".
## Rodar a sim headless no Node
### O ciclo de 8 módulos não é bloqueador
### Layout do monorepo
### `SIM_VERSION` — a coluna que salva o ranking
- em **todo run record** enviado ao ranking;
- no **handshake da sala** (versões diferentes = recusar entrada, com mensagem clara, em vez de dessincronizar em silêncio 40 segundos depois);
- na resposta de `/api/leaderboard`, para o cliente saber que uma entrada é de outra era.
### O worker de replay
- **Nunca no event loop principal.** `worker_threads` com pool de 1–2 (a VPS é pequena), fila persistida em SQLite (`status: pending|running|ok|rejected|error`).
- **Orçamento duro**: `MAX_TICKS = 60 * 3600 * 3` e timeout de parede de ~5 s por job. Um input log adversarial alegando uma run de 10 horas é um DoS trivial; o teto tem que ser estrutural.
- **Ordem de grandeza**: uma run de 20 min = 72.000 ticks. Sem render, com ~100 entidades, `step()` na casa de 10–20 µs → **~1 a 1,5 s por verificação**. Meça com um bench antes de assumir; mas isso confirma que verificação assíncrona por fila é folgada, e que verificação síncrona no request é desnecessária.
- **Tamanho do input log**: `InputState` empacotado em 6 bytes (`move.x` int8, `move.y` int8, `aim` uint16, flags uint8). 72.000 ticks × 6 B = 432 KB cru por jogador; com delta/RLE (o input muda ~5–10 vezes por segundo, não 60) cai para **20–40 KB gzipado**. Orçamento de upload: 100 KB por run. Perfeitamente enviável — não precisa de streaming nem de chunking.
- **Em co-op, o log autoritativo é o do host** — o log mesclado dos 4 jogadores como o host os consumiu. Isso significa que o host pode omitir inputs alheios. Não há defesa perfeita em P2P; a defesa suficiente é que forjar um log que produza score alto exige **jogar bem**. Consequência de produto: considere **rankings separados para solo e co-op**, e trate a run de co-op como score do host com os demais creditados.
## Auth — cookie de sessão vs JWT, e o WebSocket
### A pergunta que decide
| Mecanismo | Funciona? | Avaliação |
|---|---|---|
| **Cookie same-origin** | **Sim** — o handshake é um GET HTTP e o cookie vai automaticamente | **Recomendado.** Zero código no cliente. Valide no evento `upgrade` antes do `handleUpgrade` |
| Ticket de uso único na query string | Sim | **Construa junto, mesmo sem precisar hoje.** É o único que funciona quando a autoridade sair da mesma origem, ou quando houver cliente nativo |
| Token via `Sec-WebSocket-Protocol` | Sim, mas é gambiarra | Não. Aparece em logs e viola a semântica do cabeçalho |
| Primeira mensagem após o open | Sim, mas tarde | Não. Você já aceitou uma conexão não autenticada e precisa de timeout de graça |
### Recomendação
## Banco de dados
### O esquema onde as decisões caras moram
| Tipo de dado | Regra | Por quê |
|---|---|---|
| Recorde por classe | `MAX(local, servidor)` | Monotônico, comutativo, sem conflito possível |
| Missões/classes destravadas | `UNIÃO` dos conjuntos | Idem — dois aparelhos offline nunca produzem conflito |
| **Soul gold** | **Ledger append-only com id gerado no cliente** | Last-write-wins numa moeda **perde ou duplica dinheiro**. Com ledger + `UNIQUE(id)`, sincronizar duas vezes é no-op, e dois aparelhos offline simplesmente somam |
| Entradas de ranking | Fila local, envio ao reconectar, verificação assíncrona | Score de cliente nunca é confiado, mesmo online |
## Deploy e supervisão numa VPS
### Caddyfile completo
### systemd
# /etc/systemd/system/dg2.service
### PWA + API na mesma origem: as três correções obrigatórias no `sw.js`
## Installation
# --- apps/server ---
# --- packages/sim, packages/protocol ---
# packages/sim: dependencies MUST stay empty. protocol depends only on zod.
# --- raiz: ferramentas ---
# --- upgrade da toolchain existente (agendado no backlog) ---
# --- VPS (Debian/Ubuntu) ---
# litestream: binário do release do GitHub + unit systemd
## Alternatives Considered
| Recomendado | Alternativa | Quando a alternativa é melhor |
|---|---|---|
| Hono 4.13.5 | **Fastify 5.12.1** + `@fastify/websocket` 11.3.0 | Se você quiser schema-validation e logging integrados no framework, e não se importar de escrever um adaptador para o Better Auth. Igualmente sólido — a escolha é de gosto |
| `ws` 8.21.3 | **uWebSockets.js** | Milhares de conexões simultâneas por processo. Não está no npm (só GitHub), é C++, e você não vai ter mil salas |
| SQLite / better-sqlite3 | **PostgreSQL 18** (`pg` 8.23.0 ou `postgres` 3.4.9) | Quando houver mais de um processo escrevendo, ou `LISTEN/NOTIFY` para eventos entre workers, ou segunda máquina |
| SQLite local | **`@libsql/client` 0.17.4** (libSQL/Turso) | Se um dia quiser réplicas embarcadas ou o modo hospedado. Hoje adiciona uma camada sem remover trabalho |
| scrypt (padrão do Better Auth) | **`@node-rs/argon2` 2.1.0** | Se você quiser argon2id explicitamente. Binários pré-compilados, sem node-gyp. O padrão é adequado |
| Signaling próprio com `ws` | **PeerJS 1.5.5** + `peer` 1.0.2 (broker) | Protótipo de fim de semana. Esconde a config do `RTCPeerConnection` que você **precisa** controlar (ICE servers, `ordered:false/maxRetransmits:0`, ICE restart) e você brigaria com ele no Marco 4 |
| P2P host-autoritativo | **Colyseus 0.18.5** | É o destino natural quando a autoridade sair do host. Adotá-lo **agora** contradiz a decisão registrada no spec, mas registre-o: é a landing zone, e adotá-lo depois é troca de transporte se o `InputState`/snapshot já forem os limites |
| Ports fdlibm vendorizados | **`@stdlib/*` em runtime** | Nunca, aqui: quebra o `dependencies: {}` e traz um grafo enorme de micro-pacotes CommonJS. Como oráculo de teste, é perfeito |
| Tabela de lookup para sin/cos (opção B) | fdlibm puro (opção A) | Adote B **depois de medir**, se `sin`/`cos` aparecerem no profiler. B também encolhe o input log, o que é um bônus secundário |
| Vite 7.3.6 | Vite 8.2.2 | Depois que o 8.x tiver alguns meses. Hoje `previous` é a escolha conservadora e já resolve o CVE do backlog |
| TypeScript 6.0.3 | TypeScript 7.0.2 (tsgo, 10× mais rápido) | **Bloqueado**: `typescript-eslint@8.68.0` declara peer `typescript >=4.8.4 <6.1.0`, e o TS 7.0 não tem API programática estável (prevista para 7.1). Adotar TS 7 hoje quebra o portão de lint |
## What NOT to Use
| Evitar | Por quê | Usar em vez disso |
|---|---|---|
| **Nenhum TURN (só STUN público)** | 27–49% das salas de 4 não fecham; host atrás de CGNAT derruba a sala inteira. STUN não faz relay, só descobre endereço | coturn 4.17.2 próprio + STUN público como candidato *adicional* |
| **TURN público/grátis** (Open Relay etc.) | Rate limit, sem SLA, e você roteia o tráfego dos seus jogadores por um desconhecido | coturn próprio |
| **coturn sem `denied-peer-ip`** | Relay aberto = spam relay + SSRF para a sua própria LAN a partir da internet | O bloco de `denied-peer-ip` da seção TURN, mais `user-quota`/`total-quota` |
| **`simple-peer` 9.11.1** | Última publicação **26/01/2023** — 3,5 anos sem manutenção, e o WebRTC mudou nesse tempo | `RTCPeerConnection` direto (~200 linhas) |
| **socket.io 4.8.3** | Adiciona um runtime de cliente a um jogo que hoje publica **zero dependências**, e traz framing/reconnect/rooms que o signaling não usa | `ws` no servidor, `WebSocket` nativo no cliente |
| **Lucia** | **Descontinuado em março de 2025**; o pacote npm carrega aviso de deprecação e virou material didático | Better Auth 1.7.2 |
| **Auth.js / NextAuth** | Em manutenção **só de segurança** desde set/2025, sob o guarda-chuva do próprio Better Auth; e a forma é de Next.js | Better Auth 1.7.2 |
| **Keycloak / Ory Kratos / Zitadel** | JVM ou multi-serviço em Go; 1 GB+ de RAM e semanas de operação para uma tela de login de jogo entre amigos | Better Auth 1.7.2 |
| **JWT em `localStorage`** | XSS rouba, não há revogação (e agora trapaça contamina progresso na nuvem), **e não resolve o WebSocket** porque o browser não deixa definir cabeçalhos | Cookie httpOnly same-origin; JWT só como ticket de 30 s se a origem se dividir |
| **Firebase / Supabase / PlayFab / Nakama Cloud** | SaaS. Contradiz a decisão explícita de auto-hospedagem e reintroduz limites de camada gratuita | O stack deste documento |
| **MongoDB** | Formato errado (os dados são relacionais e o ranking é `ORDER BY`), e fome de RAM numa VPS pequena | SQLite |
| **`node:sqlite`** | Stability **1.2 (Release Candidate)** em Node 24 — API quase fechada, mas é o banco de contas | `better-sqlite3` 13.0.3; reavaliar quando for Stable |
| **`Math.sin`/`cos`/`atan2` em `src/sim/`** | Implementation-defined; V8, SpiderMonkey e JSC discordam, e o V8 já trocou `tanh` pelo libm do sistema no Chrome 148 | `sim/math.ts` com port fdlibm; regra de lint bloqueando |
| **"Exigir que todos usem Chrome"** | Não é garantia nem dentro do V8 (precedente do Chrome 148), e exclui Firefox e Safari de um jogo web | Opção A da tabela de determinismo |
| **Node 26 na VPS** | *Current*, não LTS | Node 24 LTS |
| **TypeScript 7.0.2 agora** | `typescript-eslint@8.68.0` declara peer `<6.1.0`; TS 7.0 não expõe API programática estável (chega no 7.1) | TypeScript 6.0.3 |
| **Guardar salas no banco** | Sala é estado efêmero; o spec já aceita que a queda do host mata a partida | `Map<code, Room>` em memória, morre com o processo |
| **`skipWaiting()` no service worker com multiplayer** | Um deploy no meio da partida troca o controller e pode dar versões diferentes da sim aos peers | Prompt de atualização aplicado só entre runs |
## Stack Patterns by Variant
- Acrescente rate limiting (`hono-rate-limiter` 0.5.3) em `/api/auth/*`, `/api/rt/ice` e no upload de run.
- Migre o ranking para PostgreSQL 18 quando o worker de replay precisar rodar em outro processo/máquina.
- `total-quota` do coturn passa a ser dimensionamento, não só anti-abuso.
- O servidor entra na sala como mais um peer via `node-datachannel` 0.33.1 — **o protocolo não muda**, o que é exatamente a promessa registrada no PROJECT.md.
- Ou troque para Colyseus 0.18.5 sobre WebSocket, se aceitar reescrever a camada de transporte.
- Em ambos, `packages/sim` continua sendo a mesma fonte: é por isso que ela vira um pacote agora e não depois.
- Suba a estimativa de `p` para 30%+ — CGNAT de operadora se comporta como NAT simétrico e frequentemente descarta UDP não solicitado.
- TURN deixa de ser fallback e vira o caminho comum. Reveja o dimensionamento de banda com `p = 0,5`.
- Aí sim, opção C (ponto fixo) ou E (WASM). Ambas são projetos de semanas a meses. A opção A é suficiente para ranking entre amigos e para netcode co-op — e é reversível.
## Version Compatibility
| Pacote | Compatível com | Notas |
|---|---|---|
| `vitest@4.1.11` | `vite ^6 \|\| ^7 \|\| ^8` | Vite 7.3.6 casa. Não misture Vitest 2.x com Vite 7 |
| `typescript-eslint@8.68.0` | `typescript >=4.8.4 <6.1.0`, `eslint ^8.57 \|\| ^9 \|\| ^10` | **Teto duro em TS 6.x.** TS 7.0.2 quebra o lint |
| `typescript@6.0.3` | Último da linha JS, dentro do peer acima | Alvo do upgrade. TS 7 quando `typescript-eslint` suportar (após TS 7.1) |
| `better-auth@1.7.2` | `better-sqlite3@13`, Kysely no núcleo | Monte `/api/auth/*` **antes** de qualquer catch-all no Hono |
| `@hono/node-server@2.1.1` | `hono@4.13.5`, Node 24 | Precisa expor o `http.Server` para o `ws` anexar no `upgrade` |
| `better-sqlite3@13.0.3` | Node 24 (ABI 137) | Módulo nativo: recompila a cada major do Node. Prebuilds cobrem Linux x64/arm64 |
| `ws@8.21.3` | Node ≥10; `noServer:true` + `server.on('upgrade')` | Não use `new WebSocketServer({ server })` — perde a chance de rejeitar antes do handshake |
| `packages/sim` | `dependencies: {}` — invariante | Asserir no `tests/purity.test.ts`. É a regra que mantém a sim carregável em qualquer lugar |
| `@playwright/test@1.62.1` | Chromium, Firefox, WebKit empacotados | Fixe a versão: um upgrade do Playwright troca as builds dos motores, que é exatamente a variável do teste de determinismo |
| coturn 4.17.2 | — | Vários CVEs históricos ficaram nas interfaces de gestão; rode a última e mantenha `no-cli` |
## Decidir cedo — o que é caro mudar depois
## Sources
- `https://tc39.es/ecma262/multipage/numbers-and-dates.html` — texto literal do ECMA-262 sobre o objeto `Math` e fdlibm ("recommended but not specified"); lista de funções `implementation-approximated`
- `/better-auth/better-auth` (Context7) — sessões em cookie, adaptador `better-sqlite3`, montagem em Hono, plugin `jwt`/`bearer`, `trustedOrigins`
- Registro npm consultado diretamente em 2026-08-28 — todas as versões deste documento (`npm view <pkg> version` e `peerDependencies`)
- `https://github.com/coturn/coturn/releases` — coturn 4.17.2 (2026-08-10)
- `https://github.com/caddyserver/caddy/releases` — Caddy v2.11.4 (2026-06-03)
- `https://nodejs.org/api/sqlite.html` + issue `nodejs/node#57445` — `node:sqlite` em Stability 1.2 (RC)
- `https://github.com/coturn/coturn/wiki/turnserver` + `draft-uberti-behave-turn-rest-00` — `use-auth-secret` e credenciais efêmeras por HMAC
- Código-fonte de `@stdlib/math-base-special-sin@0.3.1` e `-atan2@0.3.1` (jsdelivr) — confirmado: ports em JS puro de FreeBSD msun `s_sin.c` e de Go `math/atan2.go`, sobre `getHighWord` + kernels polinomiais, sem chamar `Math.sin`
- `https://groups.google.com/a/mozilla.org/g/dev-platform/c/0dxAO-JsoXI` — Intent to Implement do Firefox: fdlibm para `sin`/`cos`/`tan` atrás da pref `javascript.options.use_fdlibm_for_sin_cos_tan`, não por padrão; `atan2` não coberto
- `https://bugzilla.mozilla.org/show_bug.cgi?id=531915` — "Floating point differences between platforms" no SpiderMonkey
- `https://scrapfly.dev/posts/browser-math-os-fingerprint/` — V8 trocou `Math.tanh` pelo `std::tanh` do host no **Chrome 148** (commit `c1486295ae5`, V8 14.8.57); CSS trig chama o libm do host
- `https://denolib.github.io/v8-docs/ieee754_8cc_source.html` — `v8/src/base/ieee754.cc` adaptado do fdlibm
- `https://bloggeek.me/webrtcglossary/turn/` — 0–50% das sessões via relay conforme a base de usuários; causas (NAT simétrico, CGNAT móvel, firewall corporativo); custo de banda e TURN/TLS em 443
- `https://bloggeek.me/webrtcglossary/nat/` — 10–20% dos usuários WebRTC não conseguem P2P direto
- Levantamentos Kranky Geek citados em múltiplas fontes — 15–20% em produção; 60–85% em ambiente corporativo
- `+20 a 80 ms` de latência adicional por relay — múltiplas fontes de operação WebRTC concordam
- **A matemática de composição (1−(1−p)³) é derivação própria** a partir da topologia estrela de 4 jogadores descrita no spec
- Tecnoblog, NIC.br e Sabermeuip — CGNAT amplamente usado por provedores regionais e pela Claro/NET na maior parte dos planos residenciais de fibra/cabo; expansão de IPv6 em 2025–2026 como alternativa
- Internet Society Pulse / APNIC — Brasil acima de 50% de adoção IPv6 desde jun/2024; global cruzou 50% em mar/2026
- Documentação e reviews de planos Hostinger VPS — KVM 1: 4 TB/mês; KVM 2: 8 TB/mês; excedente vira throttle para 10 Mbit/s, sem cobrança extra. **Confirmar no painel da conta antes de dimensionar**
- `https://devblogs.microsoft.com/typescript/announcing-typescript-7-0/` + issue `typescript-eslint#10940` — TS 7.0 sem API programática estável; suporte no typescript-eslint não planejado até TS 7.1
- MDN `RTCPeerConnection.createDataChannel()` — `ordered`/`maxRetransmits`/`maxPacketLifeTime` mutuamente exclusivos
- `src/sim/` — contagem de `Math.*`: 13 `sin`, 13 `cos`, 4 `atan2`, 0 `pow`/`exp`/`log`/`tan`; `hypot` só em comentário; 2.974 LOC em 15 módulos
- `public/sw.js` — network-first para todo GET, `skipWaiting()` + `clients.claim()`, `CACHE` fixo em `'dungeonguys2-v1'`
- `vite.config.ts` — `base: '/DungeonGuys2/'`; `src/main.ts:43` registra via `import.meta.env.BASE_URL`
- `eslint.config.js` — regra de pureza atual de `src/sim/**` (`no-restricted-globals`, `no-restricted-properties` com `Math.random` e `Date.now`, `no-restricted-imports`)
- `package.json` — hoje: `dependencies: {}`, Vite 5.4.9, TS 5.6.3, Vitest 2.1.3; máquina em Node 24.11.1 / npm 11.6.2
<!-- GSD:stack-end -->

<!-- GSD:conventions-start source:CONVENTIONS.md -->
## Conventions

Conventions not yet established. Will populate as patterns emerge during development.
<!-- GSD:conventions-end -->

<!-- GSD:architecture-start source:ARCHITECTURE.md -->
## Architecture

Architecture not yet mapped. Follow existing patterns found in the codebase.
<!-- GSD:architecture-end -->

<!-- GSD:skills-start source:skills/ -->
## Project Skills

No project skills found. Add skills to any of: `.claude/skills/`, `.agents/skills/`, `.cursor/skills/`, `.github/skills/`, or `.codex/skills/` with a `SKILL.md` index file.
<!-- GSD:skills-end -->

<!-- GSD:workflow-start source:GSD defaults -->
## GSD Workflow Enforcement

Before using Edit, Write, or other file-changing tools, start work through a GSD command so planning artifacts and execution context stay in sync.

Use these entry points:
- `/gsd-quick` for small fixes, doc updates, and ad-hoc tasks
- `/gsd-debug` for investigation and bug fixing
- `/gsd-execute-phase` for planned phase work

Do not make direct repo edits outside a GSD workflow unless the user explicitly asks to bypass it.
<!-- GSD:workflow-end -->



<!-- GSD:profile-start -->
## Developer Profile

> Profile not yet configured. Run `/gsd-profile-user` to generate your developer profile.
> This section is managed by `generate-claude-profile` -- do not edit manually.
<!-- GSD:profile-end -->
