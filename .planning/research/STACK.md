# Stack Research

**Domínio:** backend auto-hospedado (contas + signaling WebRTC + ranking verificado por replay) para um jogo de canvas em TypeScript/Vite já publicado, numa VPS única
**Researched:** 2026-08-28
**Confidence:** ALTA para versões e infra; ALTA para o veredito de determinismo; MÉDIA para os números de TURN (faixa medida pela indústria, não medida neste jogo)

---

## Resumo executivo em cinco frases

1. **TURN não é opcional.** Sem um coturn próprio, entre **27% e 49% das salas de 4 jogadores** terão pelo menos um jogador que simplesmente não consegue entrar — e no Brasil, onde CGNAT residencial é a regra, o pior caso é o host atrás de CGNAT, que derruba a sala inteira.
2. **A determinância entre motores tem solução barata e conhecida:** trocar 30 chamadas de `Math.sin`/`Math.cos`/`Math.atan2` em `src/sim/` por um port fdlibm em JavaScript puro. Custo estimado 2–4 dias. Sem isso o ranking verificado não existe.
3. **Um processo Node, uma porta, um domínio:** Hono + `ws` no mesmo servidor HTTP, Caddy na frente servindo o `dist/` estático e fazendo proxy de `/api` e `/ws`. Cookie de sessão same-origin resolve auth do HTTP **e** do WebSocket sem JWT.
4. **SQLite basta** e vai bastar por muito tempo. O que é caro decidir errado não é o banco, é o **formato do ledger de progressão offline** e a coluna `sim_version` das entradas de ranking.
5. **A extração do sim para o servidor não é bloqueada pelo ciclo de 8 módulos** — porque a unidade extraída é o diretório `src/sim/` inteiro, e o ciclo só impede extração *parcial*.

---

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

---

## STUN/TURN — a resposta com números

### Preciso mesmo de TURN?

**Sim, e é obrigatório, não "recomendado".** Três motivos empilhados:

1. **NAT simétrico e CGNAT quebram STUN por construção.** O NAT simétrico atribui uma porta pública diferente por destino: o mapeamento que o servidor STUN vê não é o mapeamento que o outro peer precisaria usar, e o pacote do peer bate num pinhole aberto só para o IP do STUN. Não há truque; só relay resolve.
2. **CGNAT residencial é a norma no Brasil.** Claro/NET usa CGNAT na maior parte dos planos residenciais de fibra e cabo, e provedores regionais adotam em massa por escassez de IPv4. Isso não é o caso raro do enterprise — é o público-alvo deste jogo.
3. **A topologia estrela multiplica a chance de falha.** Host-autoritativo com 4 jogadores = **3 conexões independentes** partindo do host. Basta uma falhar para a sala não fechar.

### Quanto falha sem TURN — a matemática

Faixas medidas pela indústria para a probabilidade **por par** de precisar de relay (`p`):

| Fonte | Faixa |
|---|---|
| bloggeek.me (Tsahi Levent-Levi) | 0–50%, "meça, não presuma" |
| Kranky Geek / levantamentos de produção | 15–20% |
| Consenso "usuários de internet residencial" | 10–20% |
| Redes corporativas com firewall gerenciado | 60–85% |

Numa estrela de 4 jogadores, `P(pelo menos um link precisa de relay) = 1 − (1−p)³`:

| `p` por par | Sala de 2 (1 link) | Sala de 3 (2 links) | **Sala de 4 (3 links)** |
|---|---|---|---|
| 5% | 5,0% | 9,8% | **14,3%** |
| **10%** | 10,0% | 19,0% | **27,1%** |
| **15%** | 15,0% | 27,8% | **38,6%** |
| **20%** | 20,0% | 36,0% | **48,8%** |
| 30% | 30,0% | 51,0% | 65,7% |

**Leitura direta:** com o `p = 10–20%` típico de internet residencial, **entre 27% e 49% das salas cheias de 4 jogadores teriam pelo menos um amigo que não consegue entrar.** Sem TURN isso não é degradação — é a tela travada em "conectando…". E se o **host** estiver atrás de CGNAT, os três links falham de uma vez: a sala não existe.

Fator atenuante real: **o Brasil passou de 50% de adoção IPv6 desde 2024.** Quando os dois peers têm IPv6 nativo, não há NAT no caminho e a conexão direta funciona (sujeita apenas ao firewall). **Habilite IPv6 na VPS e nos candidatos ICE** — é a mitigação mais barata que existe e derruba `p` significativamente para os pares que a têm. Mas é uma loteria por par: você não controla o provedor do amigo.

### Quanto custa de banda

Premissas explícitas (ajuste quando medir o snapshot real do Marco 2):

- Snapshot de **2 KB** a **20 Hz** por cliente → 40 KB/s descendo do host para cada um.
- Inputs subindo: ~6 B/tick × 60 Hz ≈ 0,4 KB/s por cliente — desprezível.
- Host com 3 clientes → **~120 KB/s de egresso do host**.

O TURN vê cada byte duas vezes (entra e sai):

| Cenário | Tráfego no TURN | Por hora de sessão | Sessões-hora em KVM 1 (4 TB) | em KVM 2 (8 TB) |
|---|---|---|---|---|
| 1 dos 3 links relayed | ~82 KB/s | **~0,29 GB** | ~13.800 | ~27.600 |
| 2 dos 3 links relayed | ~164 KB/s | ~0,58 GB | ~6.900 | ~13.800 |
| **3 de 3 relayed (pior caso)** | **~246 KB/s (≈2 Mbit/s)** | **~0,87 GB** | **~4.700** | **~9.400** |

**Conclusão: banda não é o gargalo.** Um plano KVM 2 da Hostinger (8 TB/mês) aguenta ~9.400 horas de sessão *totalmente* relayed por mês — muito além do que um jogo entre amigos vai gerar. E a Hostinger não cobra excedente: reduz para 10 Mbit/s até o próximo ciclo, o que ainda comporta ~5 sessões simultâneas relayed. O custo real do TURN é outro:

- **Latência: +20 a 80 ms** dependendo da distância ao relay. Com o TURN na mesma VPS e jogadores brasileiros, é o extremo baixo dessa faixa — mas escolha uma região da VPS **no Brasil ou em São Paulo**, não em Vilnius, ou o relay vira +200 ms.
- **CPU/pps**, não bytes: coturn a 2 Mbit/s de UDP em pacotes pequenos custa mais interrupções do que largura.
- **Abuso**: um TURN aberto é relay de spam e vetor de SSRF para a sua própria rede.

### Configuração mínima obrigatória do coturn

```conf
# /etc/turnserver.conf
listening-port=3478
tls-listening-port=5349
realm=SEU_DOMINIO
fingerprint

# TURN REST API: credenciais efêmeras por HMAC, sem tabela de usuários no TURN
use-auth-secret
static-auth-secret=<segredo longo, o MESMO que a API usa>

# --- não negociáveis: um TURN aberto é relay de spam e SSRF para a sua LAN ---
no-multicast-peers
denied-peer-ip=0.0.0.0-0.255.255.255
denied-peer-ip=10.0.0.0-10.255.255.255
denied-peer-ip=127.0.0.0-127.255.255.255
denied-peer-ip=169.254.0.0-169.254.255.255
denied-peer-ip=172.16.0.0-172.31.255.255
denied-peer-ip=192.168.0.0-192.168.255.255
denied-peer-ip=::1
denied-peer-ip=fc00::-fdff:ffff:ffff:ffff:ffff:ffff:ffff:ffff
user-quota=12
total-quota=1200
no-cli
```

O cliente **nunca** recebe o `static-auth-secret`. A API autenticada emite as credenciais:

```ts
// apps/server/src/ice.ts — TURN REST API (draft-uberti-behave-turn-rest-00)
// username = "<unix expiry>:<userId>", credential = base64(HMAC-SHA1(secret, username))
const expiry = Math.floor(Date.now() / 1000) + 3600;
const username = `${expiry}:${userId}`;
const credential = createHmac('sha1', TURN_SECRET).update(username).digest('base64');
```

### O conflito da porta 443

O Caddy é dono de 443/tcp. O coturn fica em **3478 (UDP+TCP) e 5349 (TLS)**. Isso cobre praticamente todo NAT e firewall doméstico. TURN/TLS em 443 só é necessário atrás de firewall corporativo que só libera 443 — **não resolva isso agora**. Se um dia aparecer, as opções são um segundo IP na VPS ou o app `layer4` do Caddy roteando por ALPN/SNI. Registrar como dívida, não construir.

### Configuração ICE no cliente

```ts
new RTCPeerConnection({
  iceServers: [
    { urls: 'stun:SEU_DOMINIO:3478' },
    { urls: ['turn:SEU_DOMINIO:3478?transport=udp',
             'turn:SEU_DOMINIO:3478?transport=tcp',
             'turns:SEU_DOMINIO:5349'],
      username, credential },                       // from GET /api/rt/ice
  ],
  iceTransportPolicy: 'all',                        // 'relay' only for testing
  bundlePolicy: 'max-bundle',
});
```

**Truque de teste que vale ouro:** rodar com `iceTransportPolicy: 'relay'` força *todo* tráfego pelo TURN. É a única forma de exercitar o caminho relayed sem procurar um amigo atrás de CGNAT. Coloque isso atrás de uma flag de debug desde o Marco 1.

**Canais de dados** — decida antes de escrever o protocolo, porque muda a semântica das mensagens:

```ts
// unreliable, unordered: snapshots and inputs — stale data is worthless
pc.createDataChannel('rt', { ordered: false, maxRetransmits: 0 });
// reliable, ordered: lobby, class pick, run start, chat, end-of-run
pc.createDataChannel('ctl', { ordered: true });
```

---

## Determinismo entre motores — a resposta com custo

### O que a especificação realmente diz

Citação literal do ECMA-262 sobre o objeto `Math` (verificado em tc39.es hoje):

> *"Although the choice of algorithms is left to the implementation, it is recommended (but not specified by this standard) that implementations use the approximation algorithms for IEEE 754-2019 arithmetic contained in fdlibm."*

**"Recommended (but not specified)" = você não pode confiar.** Confirmação empírica do estado atual dos motores:

| Motor | `sin`/`cos`/`tan` | Consequência |
|---|---|---|
| **V8 (Chrome, Node, Edge)** | Rotina embutida derivada de fdlibm/glibc `dbl-64`, estaticamente ligada | Mesmos bits em todo SO — **mas** o V8 trocou `Math.tanh` pelo `std::tanh` do sistema no **Chrome 148** (commit `c1486295ae5`, V8 14.8.57). O precedente existe: o V8 *pode* delegar ao libm do host quando quiser |
| **SpiderMonkey (Firefox)** | fdlibm apenas sob a pref `javascript.options.use_fdlibm_for_sin_cos_tan` / Resist Fingerprinting; caso contrário usa o libm da plataforma | Firefox no Windows (UCRT), no macOS (`libsystem_m`) e no Linux (glibc) podem divergir entre si e do V8 |
| **JavaScriptCore (Safari)** | Funções transcendentais **nativas da plataforma** | Diverge do V8 por construção. Não há pref para desligar isso |

Bibliotecas de math diferentes discordam em **~25% de todas as entradas**, tipicamente por 1 ulp. Um ulp por frame, a 60 Hz, com realimentação (posição → distância → dano → estado), diverge visivelmente em segundos. E `atan2` não é coberto por *nenhuma* das iniciativas de fdlibm acima.

**Veredito: exigir motor compartilhado não é uma opção.** Excluiria Firefox e Safari, e nem entre versões do Chrome se sustenta.

### O que É garantido pela especificação

Isto é a boa notícia, e é o que torna a solução barata: `+`, `−`, `*`, `/` e `Math.sqrt` são **exatamente especificados** como IEEE-754 binary64 com arredondamento para o mais próximo. JavaScript não permite contração FMA — cada operação arredonda. Logo:

> **Qualquer implementação de `sin`/`cos`/`atan2` escrita em JavaScript puro sobre `+ − * / sqrt` e manipulação de bits produz os mesmos bits em todo motor conforme.**

Também especificados e seguros: `Math.floor`, `ceil`, `round`, `trunc`, `abs`, `min`, `max`, `sign`, `imul` (usado no mulberry32), `Number.prototype.toString` (round-trip exato), `Array.prototype.sort` (estável desde ES2019), ordem de iteração de `Map`/`Set` (inserção) e de `Object.keys` (índices inteiros em ordem crescente, depois strings em ordem de inserção).

### As opções, custeadas

| # | Opção | O que muda | Custo | Garantia | Reequilíbrio? |
|---|---|---|---|---|---|
| **A** | **`sim/math.ts` com port fdlibm em JS puro** — `sin`, `cos`, `atan2` vendorizados | 30 call sites em 8 arquivos + ~550 LOC novos | **2–4 dias** | Bit-exato em qualquer motor ES2015+ | Não. Só re-baselinar os hashes-ouro |
| **B** | **Tabela de lookup + ângulo quantizado** — ângulo vira `uint16` (1/65536 de volta), tabela literal commitada | Formato do `aim` no `InputState`, e todo consumidor de ângulo | 1–2 dias + retuning de mira | Bit-exato; e de quebra encolhe o input log | Sim, sutilmente: mira ganha granularidade de 0,0055° |
| **C** | **Ponto fixo em toda a `sim/`** | Toda a aritmética; posições, velocidades, dano, stats | **3–6 semanas** + rebalanceamento completo | Máxima. Também elimina risco de ordem de operações | Sim, tudo |
| **D** | **Exigir o mesmo motor** | Nada de código; uma decisão escrita | 0 | **Nenhuma.** Exclui Firefox/Safari e o V8 já mostrou que muda | — |
| **E** | **Compilar a `sim/` para WASM** (Rust/AssemblyScript) | Reescrever 2.974 linhas | **Meses** | Máxima — floats do WASM são totalmente especificados, libm vai compilada junto | Sim, tudo |

### Recomendação: **A agora. B só se o profiler pedir. C e E nunca (para este jogo).**

**Por que A:** o levantamento no código atual mostra que a superfície é minúscula.

```
src/sim/ — 2.974 LOC, 15 módulos
  Math.sin    13 ocorrências
  Math.cos    13 ocorrências
  Math.atan2   4 ocorrências   (combat.ts:96,110 · enemies.ts:304)
  Math.pow / exp / log / tan / hypot:  ZERO em código (só em comentários)
```

**Trinta call sites.** Não há `pow`, `exp`, `log` nem `tan` — o Marco 0 já limpou os `hypot`. `Math.imul` (×2, no mulberry32) e `Math.sqrt` (×27) são exatos por especificação e ficam como estão.

O que vendorizar em `src/sim/math.ts` (licenças Sun/SunPro, BSD-3 do Go e Apache-2.0 do stdlib — todas permitem cópia com aviso preservado, e **mantêm `dependencies: {}` vazio**):

| Função | Origem de referência | LOC aprox. |
|---|---|---|
| `getHighWord` / `getLowWord` | view `Float64Array`/`Uint32Array` compartilhada | 30 |
| `kernelSin`, `kernelCos` | FreeBSD msun `k_sin.c` / `k_cos.c` | 90 |
| `rempio2` (redução de argumento) | FreeBSD msun `e_rem_pio2.c` — a parte grande | 250 |
| `sin`, `cos` | FreeBSD msun `s_sin.c` / `s_cos.c` | 60 |
| `atan`, `atan2` | Go `math/atan.go` / `math/atan2.go` | 120 |

Use `@stdlib/math-base-special-{sin,cos,atan2}@0.3.1` como **devDependency e oráculo do teste** — são exatamente esses ports em JS puro (verificado: `s_sin.c` do FreeBSD 9.3 e `math/atan2.go` do Go), então um teste que compara o seu `sim/math.ts` contra eles em 10⁷ entradas aleatórias prova a correção do port. Não os use em runtime: o grafo de micro-pacotes do stdlib é enorme e CommonJS, e violaria o `dependencies: {}` do jogo.

**Ordem de execução, e isso importa:**

1. Escrever `sim/math.ts` + teste-oráculo contra o stdlib.
2. Trocar os 30 call sites.
3. Estender a regra de lint de `src/sim/**` para proibir `Math.sin|cos|tan|atan|atan2|pow|exp|log|hypot|cbrt|sinh|cosh|tanh`.
4. Re-baselinar os hashes de `determinism.test.ts` e `run.test.ts`.
5. **Só então** criar o teste Playwright cross-engine (Chromium/Firefox/WebKit/Node → mesmo `hashWorld`), que é o guardião que a suíte não tem hoje.
6. **Só então** começar a gravar entradas de ranking.

**Fazer isto ANTES de qualquer score entrar no banco.** Depois, cada mudança na implementação invalida todo o ranking — e é exatamente por isso que existe a coluna `sim_version` da próxima seção.

### Armadilhas de determinismo além de sin/cos/atan2

- **`app/input.ts` usa `Math.hypot` e `Math.atan2`** (`:64,79,82,111,113`). Só é seguro se o Marco 1 **transmitir o `InputState`** pela rede em vez de cada peer recalcular. Torne isso uma decisão escrita do protocolo, não um acidente.
- **`world.players` deve ser `Map`, não objeto** — chaves numéricas em objeto iteram em ordem crescente, não de inserção; trocar o id de string para número mudaria a ordem de `step()` silenciosamente.
- **`-0` no hash**: `hashWorld` precisa normalizar `-0` para `0`, ou dois mundos idênticos hasheiam diferente.
- **`world.rng` é instância de classe** (backlog): `rng.save()`/`rng.restore()` precisam entrar no formato de snapshot **e** no formato de replay. Um replay que não restaura o estado do PRNG não é um replay.
- **Validar `InputState` dentro de `step()`**, não num validador à parte. Clamp de `move` em [-1,1] e de `aim` no domínio, por construção. Um validador separado deriva do sim com o tempo, e a divergência aparece como "replay não confere".

---

## Rodar a sim headless no Node

### O ciclo de 8 módulos não é bloqueador

O backlog registra que `{enemies, player, combat, special, boss, xp, run, shop}` formam um componente fortemente conexo de 8 dos 15 módulos, e que extrair um bundle headless "vira tudo-ou-nada". **Correto, e irrelevante — porque a unidade de extração certa é o diretório `src/sim/` inteiro (2.974 LOC), não um subconjunto.** O ciclo só impede extração *parcial*. Ele continua custando duas coisas reais, que valem regra escrita:

1. Nenhuma constante avaliada em tempo de módulo pode cruzar o nó (viraria `undefined` em silêncio).
2. Importar um módulo puxa os oito — irrelevante num servidor, e o corte barato da aresta `xp → run` que o backlog descreve continua valendo por higiene.

### Layout do monorepo

```
package.json                 # workspaces: ["packages/*", "apps/*"]
packages/
  sim/                       # src/sim/ movido inteiro. type: module. sem dependencies.
    package.json             # "exports": { ".": "./src/index.ts" }  ← TS source, não build
  protocol/                  # tipos + schemas zod das mensagens de rede e do run record
apps/
  web/                       # o app Vite atual (src/render, src/ui, src/app, index.html)
  server/                    # Hono + ws + coturn creds + worker de replay
```

**A regra que faz tudo funcionar:** `packages/sim` é consumido como **código TypeScript**, não como artefato compilado. O Vite transpila para o browser; o `tsx` (dev) e o `esbuild` (prod) transpilam para o servidor. Se você buildar `packages/sim` separadamente para o servidor, ganha duas cadeias de transpilação — e um dia elas divergem em algo como downleveling de `**` ou ordem de avaliação. **Uma fonte, dois transpiladores, um alvo (`es2022`).** Sem dual-build CJS+ESM.

Adicione ao `tests/purity.test.ts` a asserção de que `packages/sim/package.json` tem `dependencies` vazio — é a versão executável da regra.

### `SIM_VERSION` — a coluna que salva o ranking

Derive um hash de conteúdo de `packages/sim/**` no build (script + `define` do Vite) e carimbe-o:

- em **todo run record** enviado ao ranking;
- no **handshake da sala** (versões diferentes = recusar entrada, com mensagem clara, em vez de dessincronizar em silêncio 40 segundos depois);
- na resposta de `/api/leaderboard`, para o cliente saber que uma entrada é de outra era.

Sem isso, qualquer ajuste de balanceamento invalida silenciosamente todo o ranking anterior e você só descobre quando 100% das verificações começarem a falhar. **Esta coluna é mais cara de acrescentar depois do que qualquer outra escolha deste documento.**

### O worker de replay

```
apps/server/src/verify/worker.ts   — worker_threads, importa packages/sim
```

- **Nunca no event loop principal.** `worker_threads` com pool de 1–2 (a VPS é pequena), fila persistida em SQLite (`status: pending|running|ok|rejected|error`).
- **Orçamento duro**: `MAX_TICKS = 60 * 3600 * 3` e timeout de parede de ~5 s por job. Um input log adversarial alegando uma run de 10 horas é um DoS trivial; o teto tem que ser estrutural.
- **Ordem de grandeza**: uma run de 20 min = 72.000 ticks. Sem render, com ~100 entidades, `step()` na casa de 10–20 µs → **~1 a 1,5 s por verificação**. Meça com um bench antes de assumir; mas isso confirma que verificação assíncrona por fila é folgada, e que verificação síncrona no request é desnecessária.
- **Tamanho do input log**: `InputState` empacotado em 6 bytes (`move.x` int8, `move.y` int8, `aim` uint16, flags uint8). 72.000 ticks × 6 B = 432 KB cru por jogador; com delta/RLE (o input muda ~5–10 vezes por segundo, não 60) cai para **20–40 KB gzipado**. Orçamento de upload: 100 KB por run. Perfeitamente enviável — não precisa de streaming nem de chunking.
- **Em co-op, o log autoritativo é o do host** — o log mesclado dos 4 jogadores como o host os consumiu. Isso significa que o host pode omitir inputs alheios. Não há defesa perfeita em P2P; a defesa suficiente é que forjar um log que produza score alto exige **jogar bem**. Consequência de produto: considere **rankings separados para solo e co-op**, e trate a run de co-op como score do host com os demais creditados.

---

## Auth — cookie de sessão vs JWT, e o WebSocket

### A pergunta que decide

O `WebSocket` do browser **não permite definir cabeçalhos HTTP**. Não existe `Authorization: Bearer` num `new WebSocket(...)`. Isso elimina, sozinho, metade do apelo do JWT.

O que *sobra* para autenticar o WebSocket:

| Mecanismo | Funciona? | Avaliação |
|---|---|---|
| **Cookie same-origin** | **Sim** — o handshake é um GET HTTP e o cookie vai automaticamente | **Recomendado.** Zero código no cliente. Valide no evento `upgrade` antes do `handleUpgrade` |
| Ticket de uso único na query string | Sim | **Construa junto, mesmo sem precisar hoje.** É o único que funciona quando a autoridade sair da mesma origem, ou quando houver cliente nativo |
| Token via `Sec-WebSocket-Protocol` | Sim, mas é gambiarra | Não. Aparece em logs e viola a semântica do cabeçalho |
| Primeira mensagem após o open | Sim, mas tarde | Não. Você já aceitou uma conexão não autenticada e precisa de timeout de graça |

### Recomendação

**Sessão em cookie como fonte da verdade; ticket JWT curto como transporte, projetado desde já.**

```ts
// apps/server/src/auth.ts
import { betterAuth } from 'better-auth';
import Database from 'better-sqlite3';

export const auth = betterAuth({
  database: new Database('/var/lib/dg2/dg2.sqlite'),
  emailAndPassword: { enabled: true },          // scrypt by default — no native module
  session: { expiresIn: 60 * 60 * 24 * 30, updateAge: 60 * 60 * 24 },
  trustedOrigins: ['https://SEU_DOMINIO'],
  advanced: { defaultCookieAttributes: { httpOnly: true, secure: true, sameSite: 'lax' } },
});
```

```ts
// apps/server/src/index.ts — one process, one port
const app = new Hono();
app.all('/api/auth/*', (c) => auth.handler(c.req.raw));   // before any catch-all
app.get('/api/rt/ice', requireSession, iceCredentials);   // ephemeral TURN creds
app.route('/api', apiRoutes);

const server = serve({ fetch: app.fetch, port: 8080 });
const wss = new WebSocketServer({ noServer: true });      // ws@8.21.3

server.on('upgrade', async (req, socket, head) => {
  if (new URL(req.url!, 'http://x').pathname !== '/ws') return socket.destroy();
  const session = await auth.api.getSession({ headers: toHeaders(req.headers) });
  if (!session) { socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n'); return socket.destroy(); }
  wss.handleUpgrade(req, socket, head, (ws) => wss.emit('connection', ws, session.user));
});
```

**Por que same-origin resolve tanto:** o jogo, a API e o `/ws` sob `https://SEU_DOMINIO` significam **sem CORS, sem `credentials: 'include'`, sem preflight, sem `crossSubDomainCookies`, e sem o ITP do Safari tratando a API como terceiro**. A decisão de "domínio único" já registrada no PROJECT.md é a que paga por isso — vale a pena manter mesmo quando for tentador colocar a API num subdomínio.

**Por que não JWT em `localStorage`:** XSS rouba o token, não há revogação (e agora trapaça contamina progresso na nuvem — revogar é requisito), e **não resolve o WebSocket de qualquer forma**. O uso legítimo de JWT aqui é estreito e específico: o plugin `jwt()` do Better Auth para emitir um ticket de 30 s, uso único, quando a origem deixar de ser a mesma.

**Decisão cara de mudar depois** (o PROJECT.md já sinaliza): o **formato de identidade**. Fixe agora: `userId` opaco (UUIDv7 ou ULID), imutável, nunca o e-mail, nunca o nome de exibição; `displayName` mutável e não único; a sala referencia sempre `userId`. Um `playerId` inventado pelo Marco 1 que depois não case com o `userId` do login é exatamente a reescrita que o projeto quer evitar.

---

## Banco de dados

**SQLite via `better-sqlite3@13.0.3`, `journal_mode=WAL`, `synchronous=NORMAL`, `foreign_keys=ON`.**

Por quê: o volume é ínfimo (contas + progressão + ranking de um jogo entre amigos), um único processo escreve, a API síncrona elimina pool e `await` no caminho quente, backup é copiar um arquivo, e não há daemon a mais consumindo RAM na VPS. `better-auth` tem adaptador SQLite de primeira classe (`new Database(...)` direto no campo `database`).

**Por que não `node:sqlite` ainda:** em Node 24 está em **Stability 1.2 (Release Candidate)**. A API está quase fechada, mas "quase" não é o que se quer no banco de contas. Reavaliar quando promovido a Stable — a migração é pequena e vale a pena aí, porque elimina o único módulo nativo do servidor.

**Quando migrar para PostgreSQL 18:** múltiplos processos escrevendo, `LISTEN/NOTIFY`, ou mais de uma máquina. Nada disso está no horizonte. Mas **projete portável**: sem tipos exclusivos do SQLite, timestamps como `INTEGER` epoch-ms, e migrações em SQL puro pelo migrator do Kysely.

### O esquema onde as decisões caras moram

```sql
-- Better Auth owns: user, session, account, verification

-- Progression: server-authoritative for monotonic fields
CREATE TABLE profile (
  user_id      TEXT PRIMARY KEY REFERENCES user(id),
  display_name TEXT NOT NULL,
  created_at   INTEGER NOT NULL
);

-- Soul gold as an APPEND-ONLY LEDGER, not a balance column.
-- This is the decision that is expensive to change later.
CREATE TABLE gold_entry (
  id        TEXT PRIMARY KEY,       -- ULID minted by the CLIENT
  user_id   TEXT NOT NULL REFERENCES user(id),
  run_id    TEXT,                   -- NULL for spends
  delta     INTEGER NOT NULL,       -- +earn / -spend
  reason    TEXT NOT NULL,
  device_id TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  UNIQUE (id)                       -- ← idempotency: replaying an offline log twice is a no-op
);

CREATE TABLE unlock (                -- missions/classes: a SET, merged by UNION
  user_id TEXT NOT NULL, key TEXT NOT NULL, unlocked_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, key)
);

CREATE TABLE run (
  id            TEXT PRIMARY KEY,   -- ULID minted by the client
  user_id       TEXT NOT NULL,
  mode          TEXT NOT NULL,      -- 'solo' | 'coop'
  class_id      TEXT NOT NULL,
  seed          INTEGER NOT NULL,
  sim_version   TEXT NOT NULL,      -- ← content hash of packages/sim. NOT optional.
  input_log     BLOB NOT NULL,      -- packed + gzipped
  claimed_score INTEGER NOT NULL,
  verified_score INTEGER,           -- NULL until verified
  status        TEXT NOT NULL,      -- pending | ok | mismatch | rejected | error
  created_at    INTEGER NOT NULL
);
CREATE INDEX run_board ON run (mode, class_id, verified_score DESC)
  WHERE status = 'ok';
```

**Política de conciliação offline** — a "tensão sem resposta" do PROJECT.md, resolvida pelo formato acima:

| Tipo de dado | Regra | Por quê |
|---|---|---|
| Recorde por classe | `MAX(local, servidor)` | Monotônico, comutativo, sem conflito possível |
| Missões/classes destravadas | `UNIÃO` dos conjuntos | Idem — dois aparelhos offline nunca produzem conflito |
| **Soul gold** | **Ledger append-only com id gerado no cliente** | Last-write-wins numa moeda **perde ou duplica dinheiro**. Com ledger + `UNIQUE(id)`, sincronizar duas vezes é no-op, e dois aparelhos offline simplesmente somam |
| Entradas de ranking | Fila local, envio ao reconectar, verificação assíncrona | Score de cliente nunca é confiado, mesmo online |

A fila de runs não sincronizadas pode ficar em **`localStorage`** — já está lá o resto do save, os payloads são dezenas de KB, e trocar por IndexedDB agora é complexidade sem retorno. Migre se e quando um input log passar de ~1 MB.

---

## Deploy e supervisão numa VPS

### Caddyfile completo

```caddyfile
SEU_DOMINIO {
    encode zstd gzip

    # API + signaling — must come BEFORE the static handler
    handle /api/* { reverse_proxy localhost:8080 }
    handle /ws    { reverse_proxy localhost:8080 }

    handle {
        root * /srv/dg2/dist

        # Vite emits content-hashed filenames — cache them forever
        @assets path /assets/*
        header @assets Cache-Control "public, max-age=31536000, immutable"

        # These MUST NOT be cached long, or the PWA freezes on an old build forever
        @shell path /index.html / /sw.js /manifest.json
        header @shell Cache-Control "no-cache"

        try_files {path} /index.html
        file_server
    }
}
```

**Por que Caddy e não nginx:** TLS automático com renovação sem cron nem certbot, HTTP/3 por padrão, WebSocket upgrade sem `proxy_set_header Upgrade`/`Connection` manual, e binário único. A operação é do usuário — cada peça de infra que não precisa de manutenção é uma que não vai quebrar num domingo.

### systemd

```ini
# /etc/systemd/system/dg2.service
[Service]
ExecStart=/usr/bin/node /srv/dg2/server/server.mjs
Environment=NODE_ENV=production
EnvironmentFile=/etc/dg2/env          # DB path, TURN_SECRET, BETTER_AUTH_SECRET
Restart=always
RestartSec=2
User=dg2
NoNewPrivileges=true
ProtectSystem=strict
ReadWritePaths=/var/lib/dg2
MemoryMax=512M
[Install]
WantedBy=multi-user.target
```

Três units: `dg2.service`, `coturn.service`, `litestream.service`. **Por que não PM2:** systemd já está lá, sobrevive a reboot sem `pm2 startup`, e o journald resolve log e rotação de graça. **Docker é opcional** — numa VPS de 1–2 GB rodando um processo Node, um `better-sqlite3` e um coturn, o container adiciona camada sem remover trabalho. Se você já opera com Docker, use; não adote por causa deste projeto.

### PWA + API na mesma origem: as três correções obrigatórias no `sw.js`

O service worker atual (`public/sw.js`) tem três problemas que **só aparecem quando a API entra na mesma origem**:

**1. Ele vai cachear `/api/`.** O handler hoje faz network-first para *todo* GET e escreve a resposta no Cache Storage. Um `GET /api/leaderboard` seria servido obsoleto offline, e — pior — respostas com estado de conta ficariam legíveis no Cache Storage por qualquer script da origem. Correção:

```js
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);
  // Never let the SW touch the API or the signaling endpoint.
  if (url.origin === location.origin &&
      (url.pathname.startsWith('/api/') || url.pathname === '/ws')) return;
  // ... existing cache-first / network-first logic
});
```

**2. `skipWaiting()` + `clients.claim()` são perigosos com multiplayer.** Um deploy que aterrissa no meio de uma partida troca o controller e pode entregar a dois peers versões diferentes da `sim/`. Substitua por um prompt de "atualização disponível" que só aplica **entre runs**, e nunca com uma sala aberta. Isso é a contrapartida direta da coluna `sim_version`.

**3. `CACHE = 'dungeonguys2-v1'` é bumpado à mão e vai apodrecer.** Injete o hash de build:

```js
const CACHE = 'dg2-' + __BUILD_HASH__;   // Vite define()
```

**4. Bônus, do backlog:** `base: '/DungeonGuys2/'` no `vite.config.ts` vira `base: '/'`. O registro em `src/main.ts:43` já usa `import.meta.env.BASE_URL`, então acompanha sozinho — é literalmente uma linha. Mas isso quebra o deploy no GitHub Pages: decida se o Pages continua como espelho (aí precisa de dois builds) ou se morre. **Recomendação: morre.** Domínio único é o que paga o cookie same-origin.

---

## Installation

```bash
# --- apps/server ---
npm i -w apps/server hono @hono/node-server ws better-auth better-sqlite3 kysely zod pino
npm i -D -w apps/server @types/ws @types/better-sqlite3 tsx esbuild

# --- packages/sim, packages/protocol ---
# packages/sim: dependencies MUST stay empty. protocol depends only on zod.
npm i -w packages/protocol zod

# --- raiz: ferramentas ---
npm i -D @playwright/test          # cross-engine determinism gate
npm i -D @stdlib/math-base-special-sin @stdlib/math-base-special-cos \
         @stdlib/math-base-special-atan2   # ORACLE ONLY — never a runtime dep

# --- upgrade da toolchain existente (agendado no backlog) ---
npm i -D vite@7.3.6 vitest@4.1.11 typescript@6.0.3 eslint@10 typescript-eslint@8.68.0

# --- VPS (Debian/Ubuntu) ---
sudo apt install caddy coturn
# litestream: binário do release do GitHub + unit systemd
```

---

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

---

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

---

## Stack Patterns by Variant

**Se o jogo virar público (fora do círculo de amigos):**
- Acrescente rate limiting (`hono-rate-limiter` 0.5.3) em `/api/auth/*`, `/api/rt/ice` e no upload de run.
- Migre o ranking para PostgreSQL 18 quando o worker de replay precisar rodar em outro processo/máquina.
- `total-quota` do coturn passa a ser dimensionamento, não só anti-abuso.

**Se a autoridade sair do host para o servidor (pós-P2P):**
- O servidor entra na sala como mais um peer via `node-datachannel` 0.33.1 — **o protocolo não muda**, o que é exatamente a promessa registrada no PROJECT.md.
- Ou troque para Colyseus 0.18.5 sobre WebSocket, se aceitar reescrever a camada de transporte.
- Em ambos, `packages/sim` continua sendo a mesma fonte: é por isso que ela vira um pacote agora e não depois.

**Se a maioria dos jogadores estiver em celular (4G/5G):**
- Suba a estimativa de `p` para 30%+ — CGNAT de operadora se comporta como NAT simétrico e frequentemente descarta UDP não solicitado.
- TURN deixa de ser fallback e vira o caminho comum. Reveja o dimensionamento de banda com `p = 0,5`.

**Se um dia precisar de determinismo à prova de bala (torneio, prêmio, PvP):**
- Aí sim, opção C (ponto fixo) ou E (WASM). Ambas são projetos de semanas a meses. A opção A é suficiente para ranking entre amigos e para netcode co-op — e é reversível.

---

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

---

## Decidir cedo — o que é caro mudar depois

Ordenado por custo de reverter, do maior para o menor:

1. **Formato de identidade** (`userId` opaco imutável, `displayName` mutável). Já sinalizado no PROJECT.md. Se o Marco 1 inventar um `playerId` que o login depois contradiga, é reescrita.
2. **Soul gold como ledger append-only com id gerado no cliente.** Um `balance INTEGER` parece mais simples por três semanas e depois perde ou duplica dinheiro na primeira sincronização offline dupla.
3. **Coluna `sim_version` em `run`** e no handshake da sala. Acrescentar depois significa que todo ranking já gravado é de era desconhecida.
4. **Trocar `Math.sin`/`cos`/`atan2` ANTES do primeiro score gravado.** Depois, a troca invalida o ranking inteiro — e a alternativa (nunca trocar) mata o ranking verificado.
5. **Divisão dos DataChannels** (`rt` não confiável/não ordenado, `ctl` confiável/ordenado). Depois de o protocolo existir, remapear mensagens entre canais é refatoração ampla.
6. **Domínio único, uma origem.** Dividir depois (API em subdomínio) reintroduz CORS, ITP do Safari e a necessidade do ticket JWT.
7. **`base: '/'` no Vite e a morte do GitHub Pages.** Uma linha, mas decide se existem um ou dois alvos de deploy pelo resto do projeto.

---

## Sources

**Alta confiança — especificação e documentação oficial**
- `https://tc39.es/ecma262/multipage/numbers-and-dates.html` — texto literal do ECMA-262 sobre o objeto `Math` e fdlibm ("recommended but not specified"); lista de funções `implementation-approximated`
- `/better-auth/better-auth` (Context7) — sessões em cookie, adaptador `better-sqlite3`, montagem em Hono, plugin `jwt`/`bearer`, `trustedOrigins`
- Registro npm consultado diretamente em 2026-08-28 — todas as versões deste documento (`npm view <pkg> version` e `peerDependencies`)
- `https://github.com/coturn/coturn/releases` — coturn 4.17.2 (2026-08-10)
- `https://github.com/caddyserver/caddy/releases` — Caddy v2.11.4 (2026-06-03)
- `https://nodejs.org/api/sqlite.html` + issue `nodejs/node#57445` — `node:sqlite` em Stability 1.2 (RC)
- `https://github.com/coturn/coturn/wiki/turnserver` + `draft-uberti-behave-turn-rest-00` — `use-auth-secret` e credenciais efêmeras por HMAC
- Código-fonte de `@stdlib/math-base-special-sin@0.3.1` e `-atan2@0.3.1` (jsdelivr) — confirmado: ports em JS puro de FreeBSD msun `s_sin.c` e de Go `math/atan2.go`, sobre `getHighWord` + kernels polinomiais, sem chamar `Math.sin`

**Alta confiança — motores JavaScript**
- `https://groups.google.com/a/mozilla.org/g/dev-platform/c/0dxAO-JsoXI` — Intent to Implement do Firefox: fdlibm para `sin`/`cos`/`tan` atrás da pref `javascript.options.use_fdlibm_for_sin_cos_tan`, não por padrão; `atan2` não coberto
- `https://bugzilla.mozilla.org/show_bug.cgi?id=531915` — "Floating point differences between platforms" no SpiderMonkey
- `https://scrapfly.dev/posts/browser-math-os-fingerprint/` — V8 trocou `Math.tanh` pelo `std::tanh` do host no **Chrome 148** (commit `c1486295ae5`, V8 14.8.57); CSS trig chama o libm do host
- `https://denolib.github.io/v8-docs/ieee754_8cc_source.html` — `v8/src/base/ieee754.cc` adaptado do fdlibm

**Média confiança — números de TURN (faixas da indústria, verificadas em fontes independentes que concordam)**
- `https://bloggeek.me/webrtcglossary/turn/` — 0–50% das sessões via relay conforme a base de usuários; causas (NAT simétrico, CGNAT móvel, firewall corporativo); custo de banda e TURN/TLS em 443
- `https://bloggeek.me/webrtcglossary/nat/` — 10–20% dos usuários WebRTC não conseguem P2P direto
- Levantamentos Kranky Geek citados em múltiplas fontes — 15–20% em produção; 60–85% em ambiente corporativo
- `+20 a 80 ms` de latência adicional por relay — múltiplas fontes de operação WebRTC concordam
- **A matemática de composição (1−(1−p)³) é derivação própria** a partir da topologia estrela de 4 jogadores descrita no spec

**Média confiança — contexto brasileiro**
- Tecnoblog, NIC.br e Sabermeuip — CGNAT amplamente usado por provedores regionais e pela Claro/NET na maior parte dos planos residenciais de fibra/cabo; expansão de IPv6 em 2025–2026 como alternativa
- Internet Society Pulse / APNIC — Brasil acima de 50% de adoção IPv6 desde jun/2024; global cruzou 50% em mar/2026
- Documentação e reviews de planos Hostinger VPS — KVM 1: 4 TB/mês; KVM 2: 8 TB/mês; excedente vira throttle para 10 Mbit/s, sem cobrança extra. **Confirmar no painel da conta antes de dimensionar**

**Média confiança — ferramentas**
- `https://devblogs.microsoft.com/typescript/announcing-typescript-7-0/` + issue `typescript-eslint#10940` — TS 7.0 sem API programática estável; suporte no typescript-eslint não planejado até TS 7.1
- MDN `RTCPeerConnection.createDataChannel()` — `ordered`/`maxRetransmits`/`maxPacketLifeTime` mutuamente exclusivos

**Leitura direta do repositório (fonte primária deste projeto)**
- `src/sim/` — contagem de `Math.*`: 13 `sin`, 13 `cos`, 4 `atan2`, 0 `pow`/`exp`/`log`/`tan`; `hypot` só em comentário; 2.974 LOC em 15 módulos
- `public/sw.js` — network-first para todo GET, `skipWaiting()` + `clients.claim()`, `CACHE` fixo em `'dungeonguys2-v1'`
- `vite.config.ts` — `base: '/DungeonGuys2/'`; `src/main.ts:43` registra via `import.meta.env.BASE_URL`
- `eslint.config.js` — regra de pureza atual de `src/sim/**` (`no-restricted-globals`, `no-restricted-properties` com `Math.random` e `Date.now`, `no-restricted-imports`)
- `package.json` — hoje: `dependencies: {}`, Vite 5.4.9, TS 5.6.3, Vitest 2.1.3; máquina em Node 24.11.1 / npm 11.6.2

---
*Stack research for: backend auto-hospedado (contas + signaling WebRTC + ranking verificado) para jogo TypeScript/Vite em VPS única*
*Researched: 2026-08-28*
