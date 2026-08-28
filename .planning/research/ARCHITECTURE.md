# Architecture Research

**Domain:** co-op online host-autoritativo por WebRTC + contas na nuvem + ranking verificado por replay, sobre um jogo de canvas determinístico já existente
**Researched:** 2026-08-28
**Confidence:** HIGH nas partes ancoradas no código deste repositório e em precedentes documentados; MEDIUM nas estimativas de banda e custo de CPU (não medidas)

> Este documento **não** re-pesquisa a arquitetura do cliente. Ela foi lida de
> `src/sim/types.ts`, `src/sim/step.ts`, `src/sim/world.ts`, `src/sim/rng.ts`,
> `src/app/loop.ts`, `src/app/input.ts`, `src/app/forge.ts`, `src/app/save.ts`,
> `src/main.ts`, `tests/helpers.ts` e `eslint.config.js`. Toda recomendação abaixo
> aponta para nomes reais de arquivo e de tipo.

---

## 0. A tese em uma página

O Marco 0 comprou três propriedades que quase nenhum projeto tem quando chega
neste ponto:

1. `step(world, inputs: Record<string, InputState>)` **já tem a assinatura de
   multiplayer**. Não há um `step(world, input)` singular para reescrever.
2. `World` **já é um objeto único, serializável por construção** — `INDESTRUCTIBLE_HP`
   em vez de `Infinity`, `Bullet.hitIds` como array em vez de `Set`, `Enemy.eliteName`
   /`eliteTint` sempre presentes em vez de opcionais. Alguém pensou em snapshot ao
   escrever cada um desses.
3. `tests/helpers.ts:hashWorld` **já é o codec de snapshot**, disfarçado de utilitário
   de teste: ele serializa o `World` inteiro com uma única regra especial
   (`rng → rng.save()`) e uma marcação de não-finitos.

O que **não** existe é a costura entre esses três fatos e o mundo externo. As cinco
decisões abaixo são as que definem se o marco funciona:

| # | Costura | Decisão recomendada |
|---|---------|---------------------|
| 1 | Fronteira de autoridade | `Authority` e `Replica` como objetos separados, ligados por um `Transport` abstrato em topologia **estrela**; o host é apenas o processo que hoje segura a autoridade — a palavra "host" não existe no protocolo |
| 2 | Sim no browser e no Node | Workspace npm `packages/sim` + artefato buildado com hash de conteúdo (`simVersion`); o SCC de 8 módulos **não é obstáculo**, porque o servidor precisa dos 15 de qualquer jeito |
| 3 | Snapshot | `sim/serialize.ts` promovido de `tests/helpers.ts`; três camadas (estático / lento / rápido), codec binário quantizado, delta contra baseline confirmada |
| 4 | Conta × run | *"`World` é tudo que uma seed mais um log de inputs reproduz. A conta é tudo que não."* — e o log gravado é o do `InputTable` da autoridade, não o que os clientes enviaram |
| 5 | Offline | Log de eventos append-only idempotente com dobra no servidor. **Não CRDT** — as operações já são monotônicas (soma, máximo, conjunto crescente) |

E o achado que muda a ordem dos marcos frente ao que o `docs/BACKLOG.md` assume:

> **`sim/math.ts` determinístico bloqueia o ranking, não o co-op.** Netcode
> host-autoritativo com snapshot corrige divergência a cada pacote; um erro de
> predição de 1e-7 px é invisível. Determinismo bit-exato é requisito de (a) lockstep,
> que não estamos fazendo, (b) verificação por replay, que estamos, e (c) o cliente
> derivar a arena da seed em vez de recebê-la. Confidence: HIGH.
>
> Corolário útil: **`generateArena` (`src/sim/arena.ts:21-70`) não usa trigonometria
> nenhuma** — só `rng`, `Math.sqrt`, `Math.round` e aritmética, todos bit-exatos por
> spec. Ou seja, obstáculos e armadilhas já são reproduzíveis entre motores hoje, e o
> cliente pode gerá-los localmente a partir da seed antes mesmo de `sim/math.ts` existir.

---

## 1. Standard Architecture

### System Overview

```
┌───────────────────────────────────────────────────────────────────────────────┐
│  CLIENTE (browser)                                                            │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐   ui/ e render/ nunca falam com net/ │
│  │   ui/    │  │ render/  │  │  app/    │   — app/ é a única cola              │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘                                     │
│       │  lê World   │  lê World   │ rAF + input + audio + save                │
│  ┌────┴─────────────┴─────────────┴────────────────────────────────────────┐  │
│  │  app/loop.ts (rAF)  →  createStepper(DT_MS).advance(elapsedMs)          │  │
│  └───────────────────────────────┬────────────────────────────────────────┘  │
│                                  │                                            │
│  ┌───────────────────────────────┴────────────────────────────────────────┐  │
│  │  net/                                                                   │  │
│  │  ┌────────────┐   ┌───────────┐   ┌────────────┐   ┌────────────────┐   │  │
│  │  │ authority  │   │  replica  │   │ inputTable │   │   snapshot     │   │  │
│  │  │ (só no     │   │ (sempre)  │   │ jitter buf │   │ encode/decode  │   │  │
│  │  │  autoritário)│  │ predição  │   │            │   │   binário      │   │  │
│  │  └─────┬──────┘   └─────┬─────┘   └────────────┘   └────────────────┘   │  │
│  │        └────────┬───────┘                                               │  │
│  │        ┌────────┴────────┐  protocol.ts — versionado, sem a palavra "host"│ │
│  │        │  Transport      │  send(to, msg, 'reliable' | 'fast')          │  │
│  │        └────────┬────────┘                                               │  │
│  └─────────────────┼────────────────────────────────────────────────────────┘  │
│  ┌─────────────────┴────────────────────────────────────────────────────────┐  │
│  │  packages/sim  —  step(), createWorld(), saveWorld(), loadWorld()         │  │
│  │  PURO. Sem DOM, sem relógio, sem Math.random. lib: ["ES2022"] (sem DOM).  │  │
│  └──────────────────────────────────────────────────────────────────────────┘  │
└──────────────────────────┬──────────────────────┬─────────────────────────────┘
        transport/rtc.ts    │                      │  HTTPS (mesmo domínio)
        (DataChannel)       │                      │
                            ▼                      ▼
┌───────────────────────────────────────┐  ┌──────────────────────────────────────┐
│  OUTROS 3 PARES (estrela, nunca malha)│  │  VPS — um domínio, três serviços     │
│  cada um roda Replica + Transport     │  │  ┌────────────┐ ┌─────────────────┐  │
└───────────────────────────────────────┘  │  │ signaling  │ │  accounts API   │  │
                            ▲              │  │ (WS, sem   │ │  (sessão, prog.,│  │
                            │              │  │  estado)   │ │   outbox sync)  │  │
                            └──────────────┼─▶└────────────┘ └────────┬────────┘  │
                              SDP / ICE    │  ┌────────────┐          │           │
                                           │  │  coturn    │  ┌───────┴────────┐  │
                                           │  │  (TURN)    │  │   Postgres     │  │
                                           │  └────────────┘  └───────┬────────┘  │
                                           │  ┌──────────────────────┴─────────┐  │
                                           │  │  replay-worker (fila)          │  │
                                           │  │  importa sim-versions/<hash>.mjs│ │
                                           │  └────────────────────────────────┘  │
                                           └──────────────────────────────────────┘
```

### Component Responsibilities

| Componente | Responsabilidade | Implementação |
|---|---|---|
| `packages/sim` | Regras, `World`, `step()`, serialização, hash | O `src/sim/` atual movido; `tsconfig` sem `DOM` |
| `net/protocol.ts` | Vocabulário do fio: tipos de mensagem, `PROTOCOL_VERSION`, tabelas de enum congeladas | Só tipos + constantes. Zero import de `app/`, `ui/`, `render/` |
| `net/transport.ts` | Interface `Transport` — `send(peer, msg, class)`, `onMessage`, `onPeerJoin/Leave` | Interface + `local.ts`, `rtc.ts`, `ws.ts`, `lossy.ts` |
| `net/authority.ts` | Roda `step()` com o `InputTable`; publica snapshots e o log de inputs | Não sabe qual jogador é local. Não sabe qual transporte é |
| `net/replica.ts` | Aplica snapshots, prevê o jogador local, reconcilia, interpola os demais | Segunda instância de `World`, mesma `step()` |
| `net/inputTable.ts` | Buffer de jitter por jogador + política de preenchimento de buraco | **O que ele resolve é o que vira o log do ranking** |
| `app/stepper.ts` | Acumulador de passo fixo, sem `performance`, sem rAF | Extraído de `app/loop.ts` |
| `app/loop.ts` | Só rAF + `performance.now()` + `render(alpha)` | Fica fino |
| `app/progression.ts` | `RunSummary` → `AccountDelta` → outbox local + fila de sync | Extraído de `app/forge.ts:finishRun` |
| `apps/server/signaling` | Casa duas pontas por código de sala e esquece | WebSocket, memória, TTL. Sem banco |
| `apps/server/api` | Sessão, contas, sync de progresso, submissão de run, leitura do ranking | HTTP + Postgres |
| `apps/server/replay-worker` | Fila; carrega `sim-versions/<simVersion>.mjs`, re-roda, credita | Processo separado, CPU limitada |

---

## 2. Recommended Project Structure

```
/
├── package.json                 # "workspaces": ["packages/*", "apps/*"]
├── packages/
│   ├── sim/                     # git mv src/sim packages/sim/src
│   │   ├── package.json         # name "@dg2/sim", version = simVersion semântico
│   │   ├── tsconfig.json        # lib: ["ES2022"]  — SEM "DOM"
│   │   └── src/
│   │       ├── math.ts          # NOVO — folha, trig determinística, importa só constants
│   │       ├── serialize.ts     # NOVO — saveWorld / loadWorld / hashWorld
│   │       ├── objectives.ts    # NOVO (fase missões) — predicados puros sobre World
│   │       ├── types.ts step.ts world.ts rng.ts ... (os 15 de hoje)
│   │       └── defs/
│   └── protocol/                # tipos de fio + PROTOCOL_VERSION + tabelas de enum
│       └── src/
├── apps/
│   ├── game/                    # o app Vite de hoje
│   │   ├── vite.config.ts       # base: '/'  (VPS, não Pages)
│   │   └── src/
│   │       ├── main.ts
│   │       ├── net/             # NOVO
│   │       │   ├── transport.ts  local.ts  rtc.ts  lossy.ts
│   │       │   ├── authority.ts  replica.ts  inputTable.ts  snapshot.ts
│   │       │   └── session.ts    # monta Authority/Replica conforme o papel
│   │       ├── app/  render/  ui/
│   └── server/
│       ├── signaling/  api/  replay-worker/
│       └── sim-versions/        # <contentHash>.mjs — artefatos históricos do sim
└── tools/
    └── assets/                  # validador do manifesto do repo de arte + packer de atlas
```

### Structure Rationale

- **`packages/sim` com `tsconfig` sem `"DOM"`**: hoje a pureza é garantida por
  `eslint.config.js` **e** por `tests/purity.test.ts`. Tirar `DOM` do `lib` transforma
  "`sim/` não toca o DOM" de regra de lint em **erro de tipo**. É o upgrade mais barato
  disponível para a propriedade em que o marco inteiro se apoia.
- **`packages/protocol` separado de `packages/sim`**: o protocolo importa `InputState`
  e `SimEvent`, mas o sim jamais importa o protocolo. Manter separados impede que a
  ansiedade de rede vaze para dentro da camada pura.
- **`apps/server/sim-versions/` com artefatos, não código-fonte**: o verificador precisa
  re-rodar uma run gravada por um cliente **antigo**. Com fonte, isso vira `git checkout`
  de tag; com artefatos versionados por hash de conteúdo, vira `await import()`.
- **`tools/assets/` neste repo, não no repo de arte**: quem valida o contrato é o
  consumidor. Ver §8.

---

## 3. A fronteira de autoridade — a pergunta central

### 3.1 O que muda no código, exatamente

Hoje:

```ts
// src/app/loop.ts — acumulador E driver rAF no mesmo lugar
export function startLoop(world: World, hooks: LoopHooks): () => void {
  let last = performance.now();          // ← o servidor não tem isto
  ...
  while (acc >= DT_MS) {
    step(world, hooks.collectInputs(world.tick));
    hooks.afterStep(world);
    acc -= DT_MS;
  }
  hooks.render(world, acc / DT_MS);      // ← o servidor não faz isto
  raf = requestAnimationFrame(frame);    // ← nem isto
}
```

Recomendação (≈20 linhas, primeira coisa a fazer no marco):

```ts
// app/stepper.ts — puro, sem globals, testável, usável no Node
export function createStepper(dtMs: number, onTick: () => void) {
  let acc = 0;
  const MAX_CATCHUP = dtMs * 5;
  return {
    advance(elapsedMs: number): number {   // retorna alpha
      acc += Math.min(elapsedMs, MAX_CATCHUP);
      while (acc >= dtMs) { onTick(); acc -= dtMs; }
      return acc / dtMs;
    },
  };
}
```

`app/loop.ts` mantém `performance.now()` e `requestAnimationFrame` e chama
`advance(now - last)`. O servidor dedicado, um dia, chama `advance` de um
`setInterval` com correção de deriva. **Dependência que força a ordem:** se isto não
for extraído agora, o servidor terá um acumulador copiado e colado que deriva
diferente do cliente — e "deriva diferente" é exatamente a classe de bug que ninguém
consegue diagnosticar sob rede.

### 3.2 Os três objetos e o que cada um não pode saber

```ts
// net/authority.ts
export type AuthorityHooks = {
  /** Uma entrada para CADA jogador conectado, todo tick. Nunca parcial. */
  pullInputs(tick: number): Record<string, InputState>;
  /** Chamado depois de cada tick. É daqui que saem snapshot e log. */
  publish(tick: number, world: World, events: SimEvent[]): void;
};
export function createAuthority(world: World, hooks: AuthorityHooks): {
  advance(elapsedMs: number): void;
};
```

**Três coisas que `authority.ts` não pode saber, e são elas que tornam a troca barata:**

1. **Qual transporte.** Nunca importa `rtc.ts`. Recebe mensagens já decodificadas.
2. **Que é "o host".** Não existe `isHost` dentro dele. Existe: este processo é a
   autoridade, ponto.
3. **Qual jogador é local.** No P2P de hoje, o jogador do host **passa pelo mesmo
   `InputTable`** dos remotos, com atraso zero. Se o host lê o próprio input direto e
   os remotos passam por buffer, a simulação do host tem um perfil de timing que o
   servidor futuro não terá — e a troca deixa de ser troca e vira retuning.

`net/replica.ts` é a contraparte, e roda **sempre**, inclusive no host, inclusive no
single-player. Ver §3.6.

### 3.3 O que o protocolo precisa ter para a troca ser barata

| Requisito | Por quê | Custo se ignorado |
|---|---|---|
| **Nomes `ClientToAuthority` / `AuthorityToClient`, nunca `HostMsg` / `PeerMsg`** | Nome vira suposição em cada call site | Renomear 200 referências e reler cada uma |
| **`peerId ≠ playerId ≠ accountId`, três espaços distintos** | O replay não pode precisar do banco de contas para rodar | Migração de dados armazenados |
| **`tick` em toda mensagem, nos dois sentidos** | `InputState` já tem; snapshot precisa também | Reconciliação impossível |
| **Handshake `{ protocolVersion, simVersion, contentVersion }` antes de qualquer estado** | Skew de versão vira corrupção silenciosa de memória | Bug fantasma "só acontece com o Pedro" |
| **Duas classes de canal: `reliable` e `fast`** | WebRTC dá as duas; WebSocket dá só `reliable` (superconjunto — funciona) | Snapshot bloqueado atrás de retransmissão = travadas |
| **Topologia estrela, uma perna, sempre** | Estrela com o host no centro ≡ estrela com o servidor no centro | Uma malha torna a troca uma reescrita |
| **Snapshot produzido só a partir de `World`** | Nada de câmera, DOM ou `Save` | O servidor não consegue produzir snapshot |

**A regra de topologia merece destaque**, porque é a que se quebra por acidente:
*toda mensagem cruza exatamente um salto, e a outra ponta desse salto é a autoridade.*
Se emote, marcador de ping ou voz forem implementados como link direto A↔B, a troca
de transporte deixa de ser troca. Escrever isso como comentário no cabeçalho de
`net/transport.ts`.

**Os três identificadores, concretamente:**

```ts
accountId  // ULID durável, emitido pelo servidor. Vive no Postgres. NUNCA entra no World.
playerId   // 'p0'..'p3'. Chave de world.players. Atribuído pela AUTORIDADE em ordem de
           // entrada. É o que o replay precisa e a única coisa que o sim conhece.
peerId     // handle do transporte. Sem sentido fora da sessão. Morre com a conexão.
```

Hoje `src/main.ts` codifica `'p1'` em cinco lugares:
`createPlayer(world, 'p1', ...)`, `updateHud(w, 'p1')`, `syncScreens(w, 'p1')`,
`createInput(canvas, world, 'p1', cam, touch)`, `finishRun(world, 'p1', won)`.
Substituir por uma variável `localPlayerId` é trabalho de dez minutos hoje e cinco
conflitos de merge depois.

### 3.4 `RunConfig` precisa virar por-jogador — e isso é a mudança de maior alavancagem

`RunConfig` hoje (`src/sim/types.ts`) é single-player disfarçado de config de run:
`classKey`, `playerName` e `forge` são de **um** jogador.

```ts
export type RunPlayerConfig = {
  id: string;            // 'p0'..'p3' — o ÍNDICE no array É a ordem canônica
  name: string;
  cls: ClassKey;
  forge: ForgeLevels;    // copiado da conta no início da run, nunca escrito de volta
};
export type RunConfig = {
  seed: number;
  mode: GameMode;              // + 'mission' depois
  missionId?: string;
  contentVersion: number;      // = 1 hoje. Existe para eventos sazonais não invalidarem replays
  players: RunPlayerConfig[];
};
```

Essa mudança sozinha resolve **quatro** problemas de uma vez:

1. `RunConfig` vira o **manifesto completo e serializável da run** — exatamente o que a
   submissão do ranking precisa enviar.
2. Resolve o risco de determinismo em `src/sim/step.ts:19`:
   `for (const id of Object.keys(world.players))`. Ordem de chaves de objeto é ordem de
   inserção — determinística **desde que a ordem de entrada seja idêntica no host e no
   cliente**, o que a rede não garante. Trocar por
   `for (const cfg of world.config.players)` dá uma ordem canônica derivada do
   manifesto. *(Nota de armadilha: se algum dia os ids virarem `'0'`, `'1'`,
   `Object.keys` passa a ordenar numericamente antes das outras chaves — mais uma razão
   para não iterar o objeto.)*
3. Dá ao sim a contagem de jogadores (`world.config.players.length`) que a escala de
   dificuldade do co-op vai precisar.
4. Dá a fronteira conta→run explicitamente: `forge` **entra** na run e nunca sai por ali.

`createPlayer(world, id, cls, name)` passa a ser `createPlayer(world, cfg)`.

**Custo se feito depois:** toda run armazenada no banco tem o formato antigo, e você
migra JSON no Postgres com `simVersion` histórico dependendo do formato.

### 3.5 Eventos durante reconciliação — sem tocar em `sim/`

Quando o `Replica` reconcilia, ele re-simula N ticks (N ≈ RTT/16.67 ≈ 6-12). Esses
ticks já foram tocados e já emitiram som. Re-emitir é o bug clássico: "o hit sound
dispara três vezes".

A tentação é um `world.silent: boolean`. **Não faça isso** — o campo entraria em
`hashWorld` e num snapshot, e host e cliente teriam valores diferentes para ele.

Política correta, inteiramente do lado do `Replica`, com **zero mudança em `sim/`**:

```
para cada tick t re-simulado:
   step(world, inputs[t]);
   const evs = drainEvents(world);
   if (t > lastPresentedTick) sink(evs);   // só o tick genuinamente novo apresenta
   // (os demais são descartados)
```

`drainEvents` já existe em `src/sim/step.ts:33`. `lastPresentedTick` é estado do
`Replica`. Custo: algumas alocações por reconciliação, irrelevante a 4 jogadores.

### 3.6 Single-player passa a ser um caso de multiplayer

Recomendação forte: `transport/local.ts` — um transporte de loopback. Single-player é
`Authority + Replica` no mesmo processo, sobre `LocalTransport` com latência zero.

Ganhos:
- Não existe caminho de código que só roda em produção. O jogo solo **é** o harness de
  teste do netcode.
- `transport/lossy.ts` (wrapper que injeta 120 ms de RTT, 25 ms de jitter e 3% de perda)
  transforma qualquer sessão solo em teste de reconciliação, reprodutível, sem
  segundo browser. **Esta é a ferramenta de teste de maior valor do marco inteiro.**
- Quando o servidor dedicado chegar, `role: 'both'` vira `role: 'replica'` e o
  transporte vira `ws.ts`. Uma linha.

Custo honesto: predizer e reconciliar em solo é overhead puro. Mitigação: com
`LocalTransport` de latência zero, a fila de reconciliação tem tamanho zero e o laço de
re-simulação nunca executa. A sobra é uma cópia de snapshot por tick, que pode ser
curto-circuitada (`Replica` compartilha a referência de `World` quando `latency === 0`).

---

## 4. Compartilhar o sim entre browser e Node

### 4.1 O SCC de 8 módulos não é o obstáculo que o backlog sugere

Grafo confirmado por leitura dos imports: o núcleo indivisível é
`{enemies, player, combat, special, boss, xp, run, shop}` — via
`enemies→player→combat→enemies`, `enemies↔boss`, `enemies→xp→run→enemies` e `run↔shop`.

O backlog diz: *"extrair um bundle headless do sim para o servidor vira tudo-ou-nada."*
Verdade. **Mas a consequência é benigna**, porque "tudo" é exatamente o que o servidor
quer: o verificador chama `step()`, e `step()` alcança os 15 módulos de qualquer forma.
Não existe caso de uso para um subconjunto.

O risco real do SCC é outro, e é pior: **qualquer `const` avaliada em tempo de módulo
que cruze o ciclo vira `undefined` em silêncio.** E essa é *exatamente* a forma de um
`sim/math.ts` com tabela de lookup (`const SIN_TABLE = buildTable()`).

→ **Regra a escrever no cabeçalho de `packages/sim/src/math.ts`: este módulo é folha.
Importa no máximo `constants.ts`. Nada o importa em tempo de avaliação de módulo além
de funções.** Fazer antes o corte `xp → run` que o backlog já identificou como o mais
barato (subir a resolução de `pendingAfterLevelUp` para `step()`) derruba `run ↔ shop`
junto e reduz o SCC de 8 para 6.

### 4.2 O obstáculo real: 88 imports sem extensão

Verificado: `src/sim/**` tem **88 imports relativos, zero com extensão `.js`**.
`tsconfig.json` usa `moduleResolution: "bundler"`. **Node ESM exige especificador
completo** — extensionless não resolve, e `--experimental-specifier-resolution=node`
foi removido. Confidence: HIGH.

Três saídas:

| Saída | Custo | Veredito |
|---|---|---|
| `tsx` / esbuild-register no servidor | Zero | Serve para desenvolver. **Não serve para o ranking** (ver 4.3) |
| Trocar para `moduleResolution: "nodenext"` e pôr `.js` em 88 imports | Meia hora mecânica; muda o hábito para sempre | Aceitável, mas o Vite não precisa disso |
| **Buildar `packages/sim` como artefato ESM único (esbuild/Vite lib mode)** | Um script | **Recomendado** |

### 4.3 Por que artefato, e não fonte: `simVersion`

O verificador de ranking precisa re-rodar uma run gravada por um cliente **de três
meses atrás**. Com fonte, isso é `git checkout` de tag dentro de um worker. Com
artefato:

```
packages/sim  ──build──▶  sim.<contentHash>.mjs
                             │
              ┌──────────────┴───────────────┐
              ▼                              ▼
    apps/game bundla este arquivo   apps/server/sim-versions/<hash>.mjs
    e reporta `simVersion` no        carregado por await import() conforme
    handshake e na submissão         o campo run.sim_version
```

**`simVersion` deve ser o hash de conteúdo do artefato buildado, jamais um semver
manual** — semver manual será esquecido no commit que muda o comportamento. Este é
literalmente o problema que o Open Hexagon resolveu versionando os scripts de fase.
Confidence: HIGH (precedente documentado).

Corolário operacional: **não minifique o artefato do sim de forma diferente entre
cliente e servidor.** Idealmente é o *mesmo arquivo*, com o mesmo hash, servido nos dois
lados. Se o cliente minifica e o servidor não, você tem dois programas com um nome só.

### 4.4 Determinismo entre motores

Confirmado por pesquisa: V8, SpiderMonkey e JavaScriptCore usam bibliotecas math
diferentes (portes distintos de fdlibm; JSC usa `cmath`), e as diferenças de último ulp
são **usadas como vetor de fingerprinting de browser** — isto é, são grandes o bastante
para classificar o motor. `Math.sqrt` é a exceção: cravado em IEEE-754 pela spec.
Confidence: HIGH.

Estado em `src/sim/`: **26 chamadas de `sin`/`cos`/`atan2`** em 6 arquivos
(`enemies.ts` 11, `combat.ts` 6, `loot.ts` 2, `run.ts` 2, `special.ts` 2, `arena.ts` 1).
Nenhum `Math.pow`, `exp`, `log`, `tan` ou `**`. `Math.round` e `Math.floor` são
exatos por spec.

**Recomendação: `packages/sim/src/math.ts`, folha, exportando `sin`, `cos`, `atan2`, e
reexportando `Math.sqrt`.** Implementação por redução de argumento + polinômio de Horner
usando somente `+ - * /`, `Math.floor`, `Math.abs`, `Math.sqrt` — todas operações
bit-exatas por IEEE-754 e por spec do ECMAScript. **O objetivo não é precisão, é
concordância.** Uma tabela de lookup com interpolação linear também serve e é ainda mais
simples de auditar; se escolher tabela, ela precisa ser construída com aritmética exata
ou embutida como literais, e o módulo precisa continuar folha (§4.1).

**Onde isso entra na ordem:** troca o comportamento em ~1e-7 relativo, o que cascateia —
todos os hashes de ouro dos 244 testes mudam. Fazer **cedo, num branch quieto**, não no
meio da fase de rede. E de novo: bloqueia o **ranking**, não o co-op.

**O buraco de `app/input.ts` fecha por decisão de protocolo, não por código.**
`src/app/input.ts:64,79,82,111,113` usa `Math.hypot` e `Math.atan2` para produzir
`InputState.aim`. Isso é seguro **se e somente se** o `aim` for calculado uma vez, pelo
cliente dono, e transmitido — nunca recalculado por outro par. Escrever essa frase em
`net/protocol.ts` como regra e o item do backlog está resolvido sem tocar em
`app/input.ts`.

---

## 5. Snapshot e serialização de estado

### 5.1 `tests/helpers.ts:hashWorld` já é o protótipo do codec

Ele resolve o problema que o backlog levanta (`world.rng` é instância de classe) com uma
linha: `if (key === 'rng') return value.save()`. Também já lida com não-finitos.
**Promover para `packages/sim/src/serialize.ts`:**

```ts
export function saveWorld(w: World): WorldSnapshot;  // objeto JSON-safe
export function loadWorld(s: WorldSnapshot): World;  // new Rng(0); rng.restore(s.rng)
export function hashWorld(w: World): string;         // os testes continuam usando
```

**Quatro consumidores forçam que isso viva em `sim/`, não em `net/`:**
(a) baseline do `Replica`; (b) entrada tardia na sala; (c) reconexão; (d) checkpoints do
verificador de replay (para não re-rodar 54.000 ticks quando só precisa auditar o final).

Diferença importante frente ao `hashWorld` atual: ele **exclui** `config` de propósito
(config é constante da run e só mascararia divergência). `saveWorld` **precisa** de
`config` na baseline — é onde estão seed, modo e os `forge` de cada jogador — mas nunca
nos deltas.

### 5.2 Três camadas de estado, três políticas

Enviar o `World` inteiro em JSON a 20 Hz não é viável. Estimativa: numa wave de chefe
com ~60 inimigos (`Enemy` tem ~40 campos), ~80 projéteis e ~120 moedas, o JSON fica na
casa de 40-80 KB por snapshot → 0,8-1,6 MB/s **por cliente**, ×3. Confidence: MEDIUM
(estimativa, não medida).

| Camada | Conteúdo | Política |
|---|---|---|
| **Estático** (uma vez por run) | `config`, `play`, `obstacles` (kind/x/y/r), `traps` | Enviado no join **ou derivado da seed** rodando `generateArena` no cliente — e isso é bit-exato hoje, sem `sim/math.ts` (§0) |
| **Lento** (dirigido por evento, canal `reliable`) | `phase`, `wave`, `waveActive`, `waveMutator`, `waveHasBoss`, `shopOffers`, `shopEquipOffers`, `rerollCost`; por jogador: `equipment`, `weapon`, `permStats`, `stats`, `level`, `xpNext`, `levelChoices` | Só quando muda. `Player.equipment` sozinho é dezenas de campos que mudam três vezes por wave — mandá-lo 20×/s é desperdício puro |
| **Rápido** (canal `fast`, 15-20 Hz, delta) | por jogador: `x y hp facing moving invincible sprinting stamina gold xp`; `enemies` (subconjunto), `bullets`, `enemyBullets`, `coins`, `potions`, `chests`, `score`, `combo`, `tick` | Binário quantizado, delta contra a última baseline confirmada |

### 5.3 Codec binário, sem dependência

`dependencies` do jogo é `{}` e deve continuar. `DataView` sobre `ArrayBuffer`, escritores
por tipo de entidade:

- **posições**: `uint16`. O mundo é 2400×1600, cabe em 12 bits com 1 unidade = 1 px.
  **Exceção crítica:** a posição autoritativa **do jogador local** vai em `float32`. Se
  a posição que alimenta a reconciliação vier quantizada, o jogador local ganha um
  tremor permanente de ±0,5 px que nenhum suavizador esconde.
- **ângulos** (`facing`, `aim`): `uint16` — 1/65536 de volta é folgado.
- **hp**: `uint16`. **flags** (`dead`, `moving`, `sprinting`, `enraged`, `fusing`): um
  `uint8` de bits.
- **strings enumeradas** (`Enemy.type`, `anim`, `elite`, `bossState`, `Chest.state`,
  `Obstacle.kind`, `AttackKind`): índice inteiro numa **tabela canônica ordenada**
  congelada em `packages/protocol`. **Cheap now, expensive forever:** essa ordenação
  entra no formato de fio *e* no formato de replay armazenado — ela é **append-only para
  sempre**. Inserir um inimigo no meio da lista invalida todo replay guardado.

**Delta contra baseline confirmada** (modelo Quake 3 / Source): o cliente confirma o
último tick de snapshot que aplicou; a autoridade codifica contra aquela baseline e
mantém um anel de ~32 snapshots por cliente (1,6 s a 20 Hz). Confidence: HIGH (padrão do
gênero, amplamente documentado).

**Identidade de entidade nos deltas.** `Enemy` tem `id: number` (de `world.nextId++`).
`Bullet`, `EnemyBullet`, `Coin`, `Potion` **não têm id**. Recomendação pragmática:
**delta por id só para `enemies`; lista completa a cada snapshot para o resto.** Projéteis
e moedas são curtos de vida e pequenos quantizados (~10 e ~5 bytes); dar id a eles
custaria um campo em `World`, mudaria `hashWorld` e re-baselinaria os testes de
determinismo, em troca de pouco.

Estimativa de payload por snapshot: inimigos 60×24 B ≈ 1,4 KB; projéteis 80×10 B =
800 B; moedas 120×5 B = 600 B; jogadores 4×24 B ≈ 96 B; cabeçalho ~64 B → **≈3 KB**,
×20 Hz = **~60 KB/s por cliente ≈ 480 kbit/s**, ×3 clientes = **~1,4 Mbit/s de upload no
host**. Com delta, tipicamente 30-50% disso. Confidence: MEDIUM.

→ **Coloque um contador de bytes/s, RTT e magnitude de erro de reconciliação no HUD de
debug na primeira fase de sincronização.** Sem esse número, todas as decisões de
otimização abaixo são chute.

### 5.4 Interest management: a resposta honesta é "ainda não"

Faça a conta antes de projetar: mundo = 2400×1600 = 3,84 M px². Viewport desktop
1920×1080 = 2,07 M px² = **54% do mundo inteiro**. Com 25% de folga, um cliente sozinho
já precisa de mais de dois terços do mundo. E em co-op os quatro se agrupam em volta da
wave — quando a contagem de entidades é máxima, as quatro câmeras se sobrepõem quase
totalmente.

**Ganho real esperado de interest management neste mundo: 20-40% no melhor caso, e
próximo de zero justamente quando o tráfego é maior.** Comparado com: quantizar +
binarizar (**5-10×**), delta contra baseline (**2-3×**), separar a camada lenta
(**tira o `equipment` de 20 Hz**).

**Ordem de ataque recomendada: (1) binário quantizado, (2) delta, (3) camadas, (4) —
só se medido — filtro de relevância.**

Se e quando o (4) for necessário, o desenho certo para este mundo:
- grade uniforme de 8×8 células de 300×200, entidades reindexadas ao mover;
- conjunto de relevância do cliente = células que a câmera toca + 1 de folga;
- **construa um snapshot por conjunto de relevância distinto, não um por cliente** — com
  quatro câmeras agrupadas, na prática você constrói um ou dois;
- **os 4 jogadores estão sempre em todo conjunto** (minimapa e indicadores de aliado fora
  de tela, do Marco 4, dependem disso);
- **nunca filtre nada que alimente a predição.** O cliente só prevê o próprio jogador,
  que colide com `obstacles` (estático, todo mundo tem tudo) e com `enemies` — e os
  inimigos perto dele já estão no conjunto por construção da câmera.

### 5.5 Entrada tardia e reconexão

`saveWorld()` completo pelo canal `reliable`. **Use o mesmo codec binário com baseline
vazia** em vez de um caminho JSON separado: um codec só significa que um bug nele aparece
no caminho comum, não só no raro.

---

## 6. Onde mora o estado de conta versus o estado de run

### 6.1 A regra que resolve todos os casos

> **`World` é tudo que uma seed mais um log de inputs reproduz.
> A conta é tudo que não.**

| Coisa | Reproduzível? | Onde mora |
|---|---|---|
| `score`, `wave`, `runKills`, `runGoldEarned`, posições, HP | sim | `World` |
| Níveis de forge no início da run | são **entrada** da run | Copiados para `RunConfig.players[i].forge`; fonte da verdade é a conta |
| Soul gold, classes destravadas, recordes | não | Conta |
| Missões destravadas / concluídas | não (o *cumprimento* é reproduzível; a *posse* não) | Ver §6.4 |
| Cosméticos possuídos | não | Conta |
| Entrada de ranking | não | Conta + tabela de ranking |

### 6.2 O funil de três camadas — e a camada que falta hoje

```
World final ──summarizeRun()──▶ RunSummary        (função pura, vive em packages/sim)
                                     │
                                     ▼
                  RunSubmission { manifest: RunConfig, inputLog, clientSummary }
                                     │  canal reliable, idempotente por runId (ULID)
                                     ▼
                     servidor: replay-worker re-roda ──▶ RunSummary autoritativo
                                     │
                                     ▼
                     mutações de conta (ledger append-only, §7)
```

Hoje `src/app/forge.ts:finishRun(world, localId, won)` faz **três coisas de uma vez**:
calcula o resultado, muta `Save`, e escreve no DOM (`dom.victoryForge.textContent`,
`dom.finalBest.textContent`). Isso precisa virar:

- `packages/sim/src/summary.ts` → `summarizeRun(world): RunSummary` — leitura pura do
  `World`, roda igual no cliente e no verificador;
- `apps/game/src/app/progression.ts` → `RunSummary → AccountDelta`, aplica localmente e
  enfileira na outbox;
- `ui/` → renderiza.

**Dependência que força a ordem:** essa separação precisa existir **antes** do co-op,
porque o co-op multiplica por quatro o número de contas que uma run toca.

### 6.3 Duas classes de estado de conta, e o que isso resolve

`PROJECT.md` levanta a tensão certa: *"trapaça deixou de ser inofensiva — o host pode
contaminar progressão persistente dos outros."*

1. **Confiado ao cliente** (soul gold, destravamentos, recordes, cosméticos possuídos):
   o cliente calcula, o servidor aceita. Trapacear aqui só prejudica o trapaceiro. É o
   que o jogo já faz no `localStorage`.
2. **Verificado pelo servidor** (posição no ranking, standing de evento sazonal, e
   **qualquer coisa que um host conceda à conta de outro jogador**): o servidor recalcula
   a partir do replay.

**Política que fecha a tensão em uma frase: uma run de co-op nunca escreve na conta de
outro jogador exceto através da verificação por replay.** O servidor credita os quatro a
partir da **sua própria** re-simulação, não da palavra do host.

**O limite honesto dessa verificação, que precisa estar escrito:** o replay prova que o
score é **alcançável a partir dos inputs submetidos**. Ele não prova que um humano
produziu aqueles inputs. O ataque residual é um bot gerando log. As mitigações são as que
o Open Hexagon usa: comparar a duração de relógio de parede reportada (timestamps
coletados pelo servidor no início e no fim) com a duração do replay, com folga de rede, e
heurísticas de entropia de input. Para um lançamento fechado entre amigos isso é mais que
suficiente. Confidence: HIGH (precedente documentado).

### 6.4 Missões e eventos sazonais atravessam a fronteira

**A decisão de desenho que torna missão verificável, e é barata só agora:** o *objetivo*
de conclusão de uma missão precisa ser avaliado **dentro do sim**, porque só assim o
verificador o recalcula ao re-rodar. E precisa ser **campo do `World`**, não `SimEvent` —
eventos são drenados e perdidos; um campo sobrevive no `World` final que o verificador
inspeciona:

```ts
// packages/sim/src/objectives.ts — predicados puros sobre World
world.objectives: Record<string, boolean>   // 'no_damage', 'under_8min', 'kill_boss_first'
```

O *destravamento* (quem pode entrar em qual missão) é conta. O *cumprimento* é sim.
`RunConfig.missionId` liga os dois.

**Eventos sazonais são conteúdo, não código.** Uma run jogada sob a tabela de mutadores
da temporada 3 não pode ser re-rodada sob a da temporada 4. Daí `contentVersion` em
`RunConfig` desde hoje, mesmo valendo sempre `1` (§3.4).

### 6.5 Esboço de esquema (Postgres, uma instância na VPS)

```sql
account(id ULID pk, handle citext unique, display_name, kind 'local'|'claimed', created_at)
credential(account_id fk, kind, secret_hash, ...)
device(account_id fk, device_id, last_seen)
account_progress(account_id pk, soul_gold int, version int, updated_at)
progress_event(id, account_id, device_id, client_seq, kind, payload jsonb, created_at,
               UNIQUE(account_id, device_id, client_seq))          -- ← toda a história offline
run(id ULID pk, submitted_by fk, sim_version, protocol_version, content_version,
    manifest jsonb, input_log bytea, status, verified_summary jsonb, created_at)
run_participant(run_id fk, account_id fk, player_index)
leaderboard_entry(season_id, mode, class_key, account_id, run_id, score)
mission(id, ...) / mission_unlock(account_id, mission_id) /
mission_completion(account_id, mission_id, objective_id, run_id)
cosmetic(id, ...) / account_cosmetic(account_id, cosmetic_id, source, granted_at)
season(id, starts_at, ends_at, content_version, ruleset jsonb)
```

**Guarde `run.input_log`.** É pequeno (§6.6) e é a única forma de reverificar depois de
corrigir um bug do sim. Descartar depois da verificação economiza megabytes e custa a
capacidade de auditar.

### 6.6 Tamanho e custo do log de replay

- Bruto: 4 jogadores × 60 Hz × 15 min = 216.000 `InputState`. Empacotado (move 2×int8,
  aim uint16, 3 bits de flags ≈ 6 bytes) = **1,3 MB**. Grande demais para ser casual.
- **Compressão 1 — delta/RLE por mudança.** Input humano muda pouco: codifique só os
  ticks que diferem do anterior, como `(varint Δtick, campos alterados)`. Corte de 3-10×.
- **Compressão 2 — não amostre a 60 Hz.** O cliente envia a 30 Hz e a autoridade repete o
  último valor no tick intermediário.
- **A regra que faz as duas funcionarem: o log é a tabela de inputs *resolvida pela
  autoridade*, incluindo a política de preenchimento de buracos — não o que os clientes
  enviaram.** Grave exatamente aquilo com que `step()` foi chamado. Se o log for o
  tráfego bruto, o replay não reproduz a run quando houve perda de pacote, e o ranking
  rejeita runs legítimas de quem tem rede ruim. **Este é o detalhe mais importante de
  todo o desenho do ranking.**
- Resultado: ~150-400 KB por run de 15 min a 4, ~50-150 KB com gzip.
- **Custo de CPU da verificação:** 15 min = 54.000 ticks. Estimando algumas centenas de
  µs por tick com 60 inimigos → **10-30 s de CPU por run**. Aceitável numa VPS com base
  de amigos, desde que: **fila com worker separado, nunca inline no request HTTP**, e
  limite de CPU por job. Confidence: MEDIUM (extrapolado da suíte de testes atual, não
  medido).
- **Decisão em aberto que precisa de resposta antes do ranking: modo endless é
  ilimitado.** Ou o log tem teto (ex.: 60 min, além disso a run é não-ranqueável), ou a
  verificação é amostrada por checkpoint. Recomendação: teto explícito, comunicado na UI.

---

## 7. Offline-first: qual mecanismo se justifica

**Recomendação: log de eventos append-only, idempotente, dobrado no servidor. Mais
last-write-wins só para preferências. Não CRDT.** Confidence: HIGH.

### Por que não CRDT

O que diverge entre dois aparelhos offline: soul gold (contador), classes destravadas
(conjunto), recordes (máximo), missões concluídas (conjunto), cosméticos (conjunto),
configurações (preferência). **Todas essas operações já são monotônicas** — soma,
máximo, conjunto crescente. Reproduzir `+120 soul gold`, `unlock('ninja')`,
`record(mage, 8400)` em **qualquer ordem** dá o mesmo estado. Você tem convergência de
graça por escolher a operação certa, sem biblioteca. Uma CRDT (Yjs/Automerge) traria
uma dependência de runtime — que as constraints do projeto proíbem no bundle do jogo —
para resolver edição concorrente de texto e lista, que este domínio não tem.

O mecanismo inteiro cabe em ~200 linhas: outbox no IndexedDB, `client_seq` monotônico por
aparelho, POST em lote, e `UNIQUE(account_id, device_id, client_seq)` no Postgres dando a
idempotência.

### A operação não-monotônica, e a política que a resolve

Gastar soul gold (`soulGold -= cost`) é a única que não converge sozinha. Dois aparelhos
offline gastam os mesmos 200 → saldo negativo.

**Política recomendada: `soulGold = max(0, Σ ganhos − Σ gastos)`; se o resultado seria
negativo, o jogador fica com os dois upgrades de forge e o saldo zerado.** Uma frase de
política, zero maquinaria, e nunca perde progresso visível. É uma moeda fictícia num
jogo co-op — ser generoso aqui não custa nada e evita a única classe de bug de sync que
gera ticket de suporte. Esta é exatamente a decisão que `PROJECT.md` marca como *"caro
decidir depois que o banco tem formato"*.

### Armazenamento local

`localStorage` é síncrono e ~5 MB. A outbox e o snapshot de conta cabem; **um log de run
de 150 KB-1,3 MB esperando envio não cabe com folga.**

- **IndexedDB** para a outbox e para as `RunSubmission` enfileiradas;
- `localStorage` continua com o blob de configurações (`src/app/save.ts`, chave
  `dungeonguys2_save_v1`) — barato, já funciona.
- **Custo já visível:** `Save` em `src/app/save.ts` é um singleton que faz `load()`
  síncrono no fim da IIFE. Uma store assíncrona transforma isso em promise, que sobe até
  `src/main.ts`. Mitigação: `main.ts` já usa `await loadSprites()` em top level, então
  top-level await está disponível.

### Identidade antes do login

O jogador precisa jogar antes de existir conta. **Na primeira execução, cunhe um
`deviceAccountId` (ULID) local e trate como conta real com `kind: 'local'`.** Fazer login
depois **reivindica** essa conta (o servidor adota o log de eventos dela), não faz merge
de duas contas.

**Recusar merge de duas contas reais, e dizer isso na UI.** Merge é o caso que não tem
resposta correta, e todo sistema que tentou resolvê-lo tarde pagou caro. Cheap now,
extremamente caro depois.

---

## 8. Pipeline de assets como repositório separado

### 8.1 Integração: pacote versionado, não submodule, não cópia manual

| Opção | Veredito |
|---|---|
| Cópia manual | **Rejeitada.** Perde proveniência. Em seis meses ninguém sabe qual commit do repo de arte gerou `dungeon_tileset.png` |
| Git submodule | **Rejeitada para projeto solo.** Fixa commit (bom), mas arrasta o *fonte* da arte (Aseprite, PNGs crus, scripts) para todo clone e todo CI, e cria uma árvore de trabalho que dá para commitar por acidente |
| **Pacote publicado / tag git** | **Recomendado.** `npm i github:usuario/dg2-assets#v1.2.0` não exige registry nenhum. Fixa versão no `package.json`, tem changelog, e o CI do repo de arte faz o trabalho de empacotar |

**Ressalva que o projeto exige explicitamente:** `dependencies` do jogo publicado deve
continuar vazio. Assets como **`devDependencies`** satisfazem isso — o Vite copia/inlina
em build, nada vai para o runtime.

### 8.2 O split de dois artefatos é a ideia estrutural

O repo de arte publica **(1) imagens** e **(2) um manifesto legível por máquina**.
O manifesto é o contrato. `src/render/sprites.ts` hoje tem coordenadas de sheet escritas
à mão — **é exatamente o arquivo que vai apodrecer**. Ele deve passar a ser *gerado a
partir de* ou *validado contra* o manifesto, nunca mantido em paralelo.

**Quem empacota o atlas é este repo, não o de arte.** O repo de arte entrega PNGs
individuais + manifesto; `tools/assets/` empacota. Razão: empacotar é uma preocupação do
consumidor e é barato refazer; re-autorar não é.

### 8.3 O que a especificação técnica precisa cravar (antes de qualquer produção)

**1. Unidades lógicas versus escala de arte — a decisão de maior custo, no topo do spec.**
`sim/` posiciona tudo em unidades lógicas: `Player { w:20, h:20 }`, `Obstacle { r:16 }`,
`WORLD { w:2400, h:1600 }`, `COIN_MAGNET = 100`, `SPAWN_MIN/MAX`. `TILE = 32` e
`SPRITE_SCALE = 2` são de render, mas `TILE` também define `world.play` em
`src/sim/world.ts:13-18`.

> **Recomendação: congelar as unidades lógicas. A escala da arte é assunto exclusivo de
> `render/`.**
>
> Se as unidades lógicas mudarem, (a) toda constante de tuning é reequilibrada, (b) o
> `docs/PARIDADE.md` inteiro é reaberto, e (c) **toda run guardada no ranking vira
> inverificável**, porque ela foi produzida sob outra física. `PROJECT.md` já suspeita
> disso (*"o `TILE` provavelmente muda quando a arte nova entrar"*) — a resposta correta é
> que `TILE` pode mudar como tamanho de tile **de desenho**, mas `world.play` deve deixar
> de derivar dele e passar a usar uma constante própria (`PLAY_MARGIN`).

**2. Convenção de pivô.** O sim posiciona entidades pelo **centro** (`x, y` com `w, h`).
Cravar: pivô horizontal = centro; vertical = centro da caixa de colisão; e cada sprite
declara `anchorX/anchorY` no manifesto.

**3. Vocabulário de animação, derivado de `sim/defs/`.** O sim já nomeia seus estados:
`Enemy.anim`, `Enemy.bossState` (telegraph/charging/recover), `Player.walkFrame`,
`Chest.state` (closed/opening/looted), `Obstacle.kind` (column/crate), `Trap` (4 quadros,
`trapFrameAt`), `ClassDef.anim`, `ClassDef.special` (7 valores),
`AttackKind` (5 valores). **Entregar a lista enumerada exata ao agente de arte**, e exigir
que o manifesto chaveie por esses nomes. Contagem de quadros e duração por quadro são
**dados no manifesto**, não números embutidos em `render/`.

**4. Paleta e tingimento.** `Enemy.eliteTint` é uma cor aplicada em render;
`Save.settings.colors` guarda RGB por classe. Os sprites precisam ser autorados de forma
que tingir funcione — máscara em escala de cinza ou uma rampa designada. Cravar a paleta
(lista de hex) e quais índices são tingíveis.

**5. Regras de atlas.** Padding ≥2 px, trimming e rotação **declarados** no manifesto,
dimensão máxima de textura (limite de canvas em aparelhos móveis).

**6. Nomenclatura.** `kebab-case`, `<categoria>/<nome>/<estado>_<quadro>.png`, ASCII
minúsculo, sem espaço. **Estável para sempre — nomes são chaves.**

**7. Esquema do manifesto + validador no CI deste repo.** JSON Schema, e um teste que
falha o build quando o manifesto referencia sprite que o jogo não conhece, ou o jogo pede
sprite que o manifesto não tem. **Este é o artefato que impede produção jogada fora**,
porque transforma "formato errado" de descoberta-na-integração em falha de CI *no repo de
arte*. Publicar o schema junto com o spec.

**8. Versionamento.** SemVer no pacote de assets + `manifestVersion`.

**9. Orçamento de bytes.** `public/sw.js` faz `cache.addAll` de um `PRECACHE` — e
`cache.addAll` rejeita a instalação inteira se **um** URL falhar. Um atlas de 40 MB
quebra o PWA offline. Cravar teto. Vigiar também o canvas de piso pré-renderizado:
2400×1600×4 B ≈ **15 MB de bitmap** hoje (o spec de origem já marca isso como número a
vigiar); uma segunda camada de piso dobra.

**10. Proveniência/licença** da arte gerada — uma linha, mas importa se o jogo abrir.

### 8.4 Lead time é a razão de isto vir primeiro

A integração dos assets é **independente de tudo em §3-§7**, exceto pela decisão (1). Mas
o **spec** trava o trabalho de outro agente, em outra sessão, e tem o maior lead time do
marco. **Publicar o spec técnico de assets na primeira fase**, e deixar a produção correr
em paralelo com todo o resto. É o único lugar do marco em que escrever um documento cedo
compra semanas.

---

## 9. Data Flow

### Input subindo

```
teclado/mouse/toque
  → app/input.ts.collect(tick)                    // aim calculado UMA vez, aqui
  → InputState { tick, move, aim, attack, special, sprint }
  → transport.send(authority, {t:'input', ...}, 'fast')     // 30 Hz, redundância: 3 últimos
  → [autoridade] net/inputTable.ts                // jitter buffer, preenche buracos
  → resolve(tick) : Record<playerId, InputState>  // ← ISTO é o que vira o log do ranking
  → step(world, inputs)
```

Redundância barata e obrigatória num canal não confiável: **cada pacote de input carrega
os últimos 3 ticks**, não só o atual. Custa ~18 bytes e elimina quase toda a interpolação
de buraco.

### Snapshot descendo

```
[autoridade] step() → publish(tick, world, events)
  → snapshot.encode(world, baseline[peer])        // binário, quantizado, delta
  → transport.send(peer, snapshot, 'fast')        // 15-20 Hz
  → [cliente] replica.applySnapshot()
       ├─ rebobina world para o estado do snapshot (loadWorld ou aplica delta)
       ├─ re-simula ticks pendentes com os próprios inputs guardados
       │     └─ drainEvents descartado para t ≤ lastPresentedTick   (§3.5)
       └─ entidades remotas: buffer de interpolação de ~100 ms (2 snapshots)
  → render(world, cam, alpha)
```

### Fim de run atravessando a fronteira de conta

```
sim: setPhase(world, 'gameover'|'victory')
  → SimEvent {t:'phase'} → app/events.ts sink
  → summarizeRun(world) : RunSummary                       [puro, packages/sim]
  → app/progression.ts : RunSummary → AccountDelta
       ├─ aplica local (Save / IndexedDB) — feedback imediato, funciona offline
       └─ enfileira progress_event na outbox
  → [autoridade] monta RunSubmission { manifest, inputLog, clientSummary }
       └─ enfileira; envia quando houver rede
  → servidor: fila → replay-worker → import(sim-versions/<simVersion>.mjs)
       → re-roda → RunSummary autoritativo → credita as 4 contas → leaderboard_entry
```

---

## 10. Architectural Patterns

### Padrão 1 — Transporte como interface, topologia como invariante

```ts
export type ChannelClass = 'reliable' | 'fast';
export interface Transport {
  send(peer: PeerId, msg: WireMessage, ch: ChannelClass): void;
  onMessage(cb: (from: PeerId, msg: WireMessage) => void): void;
  onPeerJoin(cb: (p: PeerId) => void): void;
  onPeerLeave(cb: (p: PeerId, reason: string) => void): void;
  close(): void;
}
```

**Quando usar:** sempre. **Trade-off:** uma indireção a mais em todo envio, em troca de
`rtc.ts` → `ws.ts` ser uma troca de construtor. `local.ts` e `lossy.ts` são
subprodutos gratuitos e valem mais que o custo.

### Padrão 2 — `sim/` continua sem saber que a rede existe

**Nenhum arquivo de `packages/sim` importa de `net/`.** A rede lê e escreve `World` de
fora, por `saveWorld`/`loadWorld` e por `step()`. A regra de lint de
`eslint.config.js` que hoje proíbe `render|ui|app` ganha `net` na lista, e
`tests/purity.test.ts` ganha o mesmo termo em `FORBIDDEN_LAYER`.

### Padrão 3 — Confiança em camadas, não binária

```
sim/       determinístico, sem confiança envolvida
authority  fonte da verdade DA SESSÃO. Pode mentir. É um amigo, tudo bem.
servidor   fonte da verdade DA CONTA. Não aceita a palavra da autoridade em
           nada que atravesse contas — recalcula por replay.
```

Isso responde à tensão de `PROJECT.md` sem introduzir servidor dedicado agora: a
autoridade não precisa ser confiável, porque nada de durável passa por ela sem
reverificação.

### Padrão 4 — Toda entidade em rede tem uma tabela de enum congelada

Índices inteiros no fio exigem uma ordenação canônica em `packages/protocol`.
**Append-only para sempre**, porque ela também está congelada em cada replay guardado.
Um teste que compara a tabela com um snapshot commitado impede a inserção acidental no
meio.

---

## 11. Scaling Considerations

| Escala | Ajustes |
|---|---|
| **1 sala, 4 amigos** | O desenho acima, inteiro. Signaling em memória. Verificação de replay inline num worker single-process. Sem TURN se todos estiverem em fibra doméstica |
| **~10 salas simultâneas** | **coturn na mesma VPS torna-se obrigatório** — NAT simétrico é comum em operadora móvel, e sem relay uma fração real de sessões simplesmente nunca conecta. Custo real: TURN relaya *todo* o tráfego dessas sessões (~1,4 Mbit/s por cliente relayado). Fila de replay com concorrência limitada (1-2 workers) |
| **~100 salas / ranking público** | Primeiro gargalo: **CPU de verificação de replay** (10-30 s por run). Mitigação, nessa ordem: (1) verificar só o que entra no top-N da temporada; (2) verificação amostrada por checkpoint via `loadWorld`; (3) worker em outra máquina. Segundo gargalo: **upload do host**, que não escala com a VPS — é quando o servidor dedicado deixa de ser opcional. A troca já está paga pelo desenho de §3 |

**Ordem dos gargalos, explicitamente:** upload do host quebra antes de qualquer coisa no
servidor, e é o único gargalo que a VPS não pode resolver. É a razão econômica de manter
a fronteira de autoridade limpa.

---

## 12. Anti-Patterns

### AP1 — Malha P2P

**O que fazem:** ligar cada par a cada par "porque WebRTC é P2P".
**Por que é errado:** 6 conexões em vez de 3; e a troca por servidor dedicado deixa de
ser troca. **Em vez disso:** estrela, sempre. Uma perna por mensagem.

### AP2 — O jogador do host tratado como especial

**O que fazem:** o host lê o próprio input direto no `step()`; os remotos passam pelo
buffer. **Por que é errado:** a simulação do host passa a ter um perfil de timing que o
servidor futuro não terá; a troca vira retuning de netcode.
**Em vez disso:** o input do host entra no mesmo `InputTable`, com atraso zero.

### AP3 — Snapshot que é `JSON.stringify(world)`

**Por que é errado:** ~40-80 KB por pacote, e o formato de fio passa a ser o layout de
memória — acrescentar um campo em `Enemy` muda o protocolo em silêncio.
**Em vez disso:** `encode`/`decode` explícitos em `net/snapshot.ts` com tabela de campos
versionada. (Mas **use** JSON para a baseline de reconexão no primeiro dia, e binarize
depois — só não deixe os dois caminhos coexistirem.)

### AP4 — Interest management antes de medir

**Por que é errado:** neste mundo o viewport já é 54% da arena e as câmeras se sobrepõem
justamente quando o tráfego é maior. Você gasta a fase mais difícil do marco para ganhar
20-40%, quando quantizar ganha 5-10×. **Em vez disso:** contador de bytes no HUD de debug,
depois quantizar, depois delta, depois — talvez — relevância.

### AP5 — Confiar no `SimEvent` para persistir progresso

**O que fazem:** `{t:'unlock'}` → grava na conta. É o que `main.ts` já faz hoje para
`bossKill` (`Save.data.progress.bossKills++`). **Por que é errado em rede:** eventos são
emitidos durante re-simulação de reconciliação e seriam contados duas vezes; e o
verificador do servidor não os vê (drena e descarta).
**Em vez disso:** progresso durável é derivado do `World` **final** por `summarizeRun`,
nunca acumulado a partir de eventos. Os eventos ficam para som, texto flutuante e shake —
o que o spec de origem sempre disse que eles eram.

### AP6 — `simVersion` bumpado à mão

**Por que é errado:** será esquecido no commit que muda comportamento, e aí o
verificador rejeita runs legítimas ou aceita runs sob física errada.
**Em vez disso:** hash de conteúdo do artefato buildado.

### AP7 — Merge de duas contas reais

**Por que é errado:** não tem resposta correta, e todo sistema que tentou resolver tarde
pagou caro. **Em vez disso:** conta local `kind:'local'` é **reivindicada** por um login;
duas contas reais nunca se fundem, e a UI diz isso.

---

## 13. Integration Points

### Serviços externos e de infra

| Serviço | Padrão de integração | Armadilhas |
|---|---|---|
| VPS Hostinger, domínio único | Jogo estático + `/signaling` (WS) + `/api` no mesmo host | **Mata `base: '/DungeonGuys2/'` em `vite.config.ts` e o `import.meta.env.BASE_URL + 'sw.js'` em `src/main.ts:43`.** `src/render/sprites.ts:12` também usa `BASE`. Mesma origem é o que mantém cookie e CORS triviais |
| coturn (TURN/STUN) | Mesma VPS, credenciais efêmeras emitidas pela API | Relaya todo o tráfego das sessões que caem nele. Orçar banda |
| Postgres | Uma instância; `progress_event` com unique key faz a idempotência | — |
| Service worker | `public/sw.js` é network-first para código, precache para assets | `cache.addAll` rejeita tudo se **um** URL 404. Lista de precache tem que sobreviver à troca de assets |
| Repo de assets | `devDependency` via tag git; validador de manifesto no CI | Ver §8 |

### Fronteiras internas

| Fronteira | Comunicação | Notas |
|---|---|---|
| `sim` ↔ `net` | `net` chama `step`, `saveWorld`, `loadWorld`. `sim` não conhece `net` | Acrescentar `net` à lista proibida em `eslint.config.js` e em `tests/purity.test.ts` |
| `net` ↔ `app` | `app/session.ts` monta; `app/loop.ts` chama `advance` | `ui/` e `render/` **nunca** falam com `net/` — continuam lendo `World` |
| `app` ↔ `ui` | `ui` importa serviço de `app` (direção saudável, já registrada no backlog) | Mover o markup do forge de `src/app/forge.ts:193-239` para `ui/forge.ts` antes que a fase de contas mexa no arquivo |
| cliente ↔ servidor | HTTP para conta/ranking; WS para signaling; DataChannel para jogo | Três canais, três formatos de versão no handshake |

---

## 14. Build order, com a dependência que força cada passo

### Fase A — Costuras e identidade (zero linha de rede)

| Item | Dependência que força a posição |
|---|---|
| **A0. Publicar o spec técnico de assets** (§8.3) | Destrava outro agente em outra sessão. Maior lead time do marco. Sem ele, a produção sai no formato errado |
| A1. `app/stepper.ts` extraído de `app/loop.ts` | O servidor precisa do mesmo acumulador sem rAF. Copiado, ele deriva diferente |
| A2. `localPlayerId` no lugar dos cinco `'p1'` de `main.ts` | Toda fase seguinte toca esses call sites |
| A3. **`RunConfig` por jogador + `contentVersion` + ordem canônica em `step.ts`** | Snapshot, manifesto de ranking, escala de dificuldade e fronteira de conta leem esta forma. Mudar depois é migrar dados armazenados |
| A4. Workspace `packages/sim` (+ `tsconfig` sem `DOM`) e `packages/protocol`; build com hash → `simVersion` | `net/protocol.ts` importa tipos do sim e é importado por browser **e** servidor. Escrevê-lo em `src/` e mover depois refaz todos os imports de `net/`, `app/` e do servidor de uma vez |
| A5. `sim/serialize.ts` (`saveWorld`/`loadWorld`/`hashWorld`) promovido de `tests/helpers.ts` | Quatro consumidores: baseline, join tardio, reconexão, checkpoint do verificador |
| A6. Corte da aresta `xp → run` (SCC 8 → 6) | Precisa acontecer **antes** de a rede acrescentar arestas, e torna seguro adicionar `math.ts` como folha |
| A7. `sim/math.ts` determinístico + regra de protocolo "`aim` é transmitido, nunca recalculado" | Muda todos os hashes de ouro dos 244 testes. Fazer cedo, isolado. **Bloqueia o ranking, não o co-op** |
| A8. Alvo de deploy VPS (`base: '/'`, registro do SW, precache) | Signaling e API precisam ser mesma origem que o jogo. Fazer antes evita CORS e cookie cross-site em toda fase seguinte |

### Fase B — Identidade e progressão (servidor, sem tráfego de jogo)

| Item | Dependência que força a posição |
|---|---|
| B1. `summarizeRun` puro + `app/progression.ts` extraídos de `app/forge.ts:finishRun` | O co-op multiplica por 4 as contas que uma run toca. Separar depois é refazer sob concorrência |
| B2. Esquema `account` / `progress_event` / `account_progress`; `deviceAccountId` local `kind:'local'`; política de claim | `PROJECT.md`: *"formato de identidade e conta decidido **antes** do multiplayer"*. A sala não pode inventar um conceito de jogador que o login depois contradiga |
| B3. Outbox IndexedDB + sync idempotente + política de soul gold negativo | O offline precisa funcionar **antes** de existir multiplayer — é o caminho mais simples para exercitar o sync |
| B4. Login + progresso na nuvem (UI) | Pode vir **depois** da sala, e provavelmente deve: o usuário declarou "sala primeiro". Só o *formato* (B2) é que não pode esperar |

### Fase C — Transporte e sala

| Item | Dependência que força a posição |
|---|---|
| C1. `packages/protocol`: mensagens, `PROTOCOL_VERSION`, tabelas de enum congeladas, classes de canal | Precisa de A4 para ser importável pelo servidor |
| C2. `Transport` + `local.ts` + `lossy.ts` | `lossy.ts` é a ferramenta de teste de todas as fases seguintes. Construir antes de precisar dela |
| C3. Signaling (WS, sem estado, TTL de sala) + `transport/rtc.ts` + lobby | Precisa de A8 (mesma origem) e de B2 (handle/identidade para exibir na sala) |
| C4. coturn | Sem TURN, NAT simétrico (comum em operadora móvel) impede a conexão. Descobrir isso na fase D é o pior momento possível |

### Fase D — Partida sincronizada

| Item | Dependência que força a posição |
|---|---|
| D1. `authority.ts` + `replica.ts` + `inputTable.ts` | Precisa de A1 (stepper), A3 (ordem canônica), A5 (serialize), C |
| D2. Codec de snapshot binário (camadas + delta + quantização) | Precisa das tabelas de enum de C1 |
| D3. Predição, reconciliação, supressão de eventos re-simulados (§3.5), interpolação remota | — |
| D4. **HUD de debug: bytes/s, RTT, erro de reconciliação** | Sem esse número, toda decisão de otimização depois é chute |

### Fase E — Regras de co-op

| Item | Dependência que força a posição |
|---|---|
| E1. Caído/revive, escala por `config.players.length`, intervalo compartilhado, fim de run coletivo | Precisa de A3 e B1 |
| E2. Loot instanciado (`Coin.owner`) | **Acrescentar campo a entidade em rede é bump de versão de protocolo.** Agrupe E2 com D2 ou aceite o bump conscientemente. Bônus: divide o payload de moedas por 4 |

### Fase F — Missões e temporadas

| Item | Dependência que força a posição |
|---|---|
| F1. `sim/objectives.ts` + `world.objectives` como **campo**, não evento | O verificador lê o `World` final; eventos são drenados e perdidos. Decidir depois significa que missões concluídas não são verificáveis |
| F2. Cadeia de destravamento na conta; `RunConfig.missionId` | Precisa de B2 |
| F3. Temporadas como conteúdo versionado por `contentVersion` | Precisa de A3 (o campo já existe desde a fase A) |

### Fase G — Ranking verificado

| Item | Dependência que força a posição |
|---|---|
| G1. Captura do log **na autoridade** (o que `step()` recebeu, não o que chegou pela rede) | É o que faz o replay reproduzir a run sob perda de pacote |
| G2. `RunSubmission` idempotente por `runId`; fila; `replay-worker` com `sim-versions/<hash>.mjs` | Precisa de A4 (`simVersion`), A7 (math determinística), A5 (`loadWorld`), D1 |
| G3. Cross-check de duração de relógio de parede; teto de log para endless | Único freio contra log gerado por bot; endless é ilimitado por construção |

### Fase H — Resiliência, acabamento e assets

Reconexão via baseline (`loadWorld`), queda do host (migrar ou recusar explicitamente),
minimapa, nomes/HP sobre a cabeça, integração dos assets, UI caprichada.
**A integração dos assets é independente de tudo acima**, exceto pela decisão A0/§8.3(1).

---

## 15. Barato agora, caro depois — a lista

| Decisão | Custo agora | Custo se adiada |
|---|---|---|
| `RunConfig` por jogador, com `contentVersion` (A3) | ~1 h | Migração de JSON armazenado no Postgres, com `simVersion` histórico dependendo do formato |
| Ordem canônica de jogadores em `step.ts` (A3) | 3 linhas | Dessincronização não reproduzível que se parece com bug de rede |
| Três espaços de id: `accountId` / `playerId` / `peerId` (§3.3) | Uma decisão escrita | O replay passa a precisar do banco de contas; a fronteira de autoridade vaza identidade durável |
| Protocolo sem a palavra "host", topologia estrela (§3.3) | Convenção de nomes | A troca de transporte vira reescrita — que é exatamente o que o projeto contratou não acontecer |
| `simVersion` = hash de conteúdo (§4.3) | Um script de build | Runs verificadas sob a física errada, ou rejeitadas sem motivo aparente |
| Tabelas de enum congeladas, append-only (§5.3) | Um teste de snapshot | Todo replay guardado passa a decodificar entidades erradas |
| `world.objectives` como campo, não evento (§6.4) | Um campo | Conclusão de missão deixa de ser verificável por replay |
| Log = tabela resolvida da autoridade (§6.6) | Onde você chama `record()` | O ranking rejeita runs legítimas de quem tem rede ruim |
| Política de soul gold negativo (§7) | Uma frase | Reconciliação de saldo depois que o banco tem formato |
| Recusar merge de contas; claim de conta local (§7) | Uma frase na UI | O caso sem resposta certa, resolvido tarde e caro |
| Congelar unidades lógicas; arte é escala de render (§8.3) | Uma frase no spec de assets | Retuning de toda constante, `PARIDADE.md` reaberto, **todo replay guardado inverificável** |
| Validador de manifesto de assets no CI (§8.3.7) | Meio dia | Produção de arte no formato errado, descoberta na integração |
| `app/stepper.ts` separado do rAF (A1) | ~20 linhas | Dois acumuladores que derivam diferente sob rede |
| `transport/local.ts` + `lossy.ts` (C2) | Meio dia | Netcode só testável com dois browsers e sorte |

---

## 16. Lacunas e itens que continuam em aberto

- **Estimativas de banda e de CPU de verificação são extrapolações, não medidas**
  (Confidence: MEDIUM). D4 existe para transformá-las em número real na primeira fase
  de sincronização.
- **Queda do host.** O spec de origem aceita explicitamente que "se o host cai a partida
  cai". Com progresso na nuvem isso agora significa perder a run *e* o crédito dela.
  Decisão em aberto: migração de host (o snapshot de `saveWorld` torna tecnicamente
  possível, com custo alto de eleição e re-handshake) ou creditar a run parcial
  submetendo o log até o ponto da queda. **Recomendação provisória: creditar run parcial.**
- **Teto de duração para endless no ranking.** Precisa de resposta antes de G.
- **`updateBossPattern` sem teste nenhum** (`docs/BACKLOG.md`) é a maior superfície
  descoberta de `sim/` e é uma das que `sim/math.ts` vai perturbar. Cobrir junto com A7,
  não depois.
- **Escolha entre polinômio e tabela de lookup em `sim/math.ts`** — as duas satisfazem a
  propriedade; a escolha é de auditabilidade e de custo por chamada, e merece uma medição
  rápida (26 call sites, alguns em laços quentes de `enemies.ts`).

---

## Sources

- Código deste repositório (fonte primária, HIGH): `src/sim/types.ts`, `src/sim/step.ts`,
  `src/sim/world.ts`, `src/sim/rng.ts`, `src/sim/arena.ts`, `src/sim/constants.ts`,
  `src/app/loop.ts`, `src/app/input.ts`, `src/app/forge.ts`, `src/app/save.ts`,
  `src/main.ts`, `src/render/camera.ts`, `tests/helpers.ts`, `tests/purity.test.ts`,
  `eslint.config.js`, `vite.config.ts`, `tsconfig.json`, `package.json`, `public/sw.js`
- `docs/superpowers/specs/2026-08-27-coop-online-design.md`, `docs/BACKLOG.md`,
  `.planning/PROJECT.md`
- [Implementing secure leaderboards for my game — Vittorio Romeo (Open Hexagon)](https://vittorioromeo.com/index/blog/oh_secure_leaderboards.html) — HIGH: precedente
  documentado de ranking verificado por replay (seed + log de inputs), versionamento de
  conteúdo, cross-check de relógio de parede, e as armadilhas de determinismo
- [Client-Side Prediction and Server Reconciliation — Gabriel Gambetta](https://www.gabrielgambetta.com/client-side-prediction-server-reconciliation.html) — HIGH: referência canônica do padrão
- [Netcode Architectures Part 3: Snapshot Interpolation — SnapNet](https://snapnet.dev/blog/netcode-architectures-part-3-snapshot-interpolation/) — HIGH: snapshot + delta contra baseline, buffer de interpolação
- [Client-Side Prediction and Server Reconciliation — Web Game Dev](https://www.webgamedev.com/backend/prediction-reconciliation) — MEDIUM
- [Intent to Implement: Use fdlibm for Math.cos/sin/tan — Mozilla dev-platform](https://groups.google.com/a/mozilla.org/g/dev-platform/c/0dxAO-JsoXI/m/eEhjM9VsAgAJ) e
  [Your Browser Does Math Differently on Every OS — Scrapfly](https://scrapfly.dev/posts/browser-math-os-fingerprint/) — HIGH: confirmam que
  `sin`/`cos`/`atan2` divergem entre V8, SpiderMonkey e JSC o bastante para fingerprinting
- [Math keeps changing — Tom MacWright](https://macwright.com/2020/02/14/math-keeps-changing) — MEDIUM: histórico das trocas de implementação do V8
- [import without extension — nodejs/node#30927](https://github.com/nodejs/node/issues/30927) e
  [Adding support for ESM references without a .js extension — nodejs/node#46006](https://github.com/nodejs/node/issues/46006) — HIGH: Node ESM exige especificador completo
- [node-datachannel](https://github.com/murat-dogan/node-datachannel) e
  [werift-webrtc](https://github.com/shinyoshiaki/werift-webrtc) — MEDIUM: opções de
  DataChannel em Node para um servidor dedicado futuro; `node-datachannel` (bindings de
  libdatachannel) tem throughput maior, `werift` é TS puro e menos maduro
- [TURN server in WebRTC: when you need it — BloggeekMe](https://bloggeek.me/webrtcglossary/turn/) e
  [Why WebRTC Calls Fail on Mobile Networks](https://www.expressturn.com/blog/webrtc-calls-fail-on-mobile-networks) — MEDIUM: NAT simétrico
  de operadora móvel como causa principal de falha; nenhuma fonte deu percentual confiável
- [Offline sync & conflict resolution patterns](https://www.sachith.co.uk/offline-sync-conflict-resolution-patterns-architecture-trade%E2%80%91offs-practical-guide-feb-19-2026/) e
  [Beyond Offline-First: data synchronization & CRDTs](https://medium.com/@engin.bolat/beyond-offline-first-the-nightmare-of-data-synchronization-crdts-c69501a96c8d) — MEDIUM: sincronizar *intenção* (operação) em vez de
  estado; LWW perde dados; restrições duras permanecem autoritativas no servidor
- [How to build a multirepo monorepo with npm workspaces and vite — Soledad Peñadés](https://soledadpenades.com/posts/2024/multirepo-monorepo-npm-workspaces-vite/) — MEDIUM: workspaces + Vite library mode sem
  introduzir ferramenta nova
- [Automating Content Building with GitHub Actions — MonoGame](https://docs.monogame.net/articles/getting_started/content_pipeline/automating_content_builder.html) e
  [Managing Repositories With Git Submodules — Aviator](https://www.aviator.co/blog/managing-repositories-with-git-submodules/) — MEDIUM: repositório de assets
  separado com build automatizado e combinação de artefatos

---
*Architecture research for: co-op online + contas + ranking verificado sobre simulação determinística existente*
*Researched: 2026-08-28*
</content>
</invoke>
