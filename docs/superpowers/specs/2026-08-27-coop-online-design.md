# DungeonGuys2 — Co-op online: design

> Spec de origem do projeto. Escrito em 2026-08-27 via `superpowers:brainstorming`.
> Deriva do **DungeonGuys** (https://github.com/gustavoktausend/DungeonGuys), que segue vivo e independente.

## 1. O que estamos construindo

DungeonGuys2 é um **pixel shooter survival roguelite co-op online para até 4 jogadores**: os mesmos inimigos, waves, classes e equipamentos do DungeonGuys, agora enfrentados em grupo, numa arena maior que a tela, por amigos que entram com um código de sala.

Não é PvP. Não há matchmaking público. Não há servidor de jogo dedicado.

## 2. De onde partimos

O DungeonGuys atual é um jogo de canvas HTML5 em **JavaScript vanilla com escopo global** (11 arquivos `.js` carregados por `<script>`, sem bundler), PWA com service worker, publicado estaticamente no GitHub Pages. Está estável e completo: 7 classes, campanha de 16 waves + endless, bosses e mini-bosses, inimigos elite, mutadores de wave, combo de score, loja entre waves, level-up com bênçãos, sistema de equipamentos por-run (3 fases) e meta-progressão em soul gold (forge).

Quatro características dele são incompatíveis com multiplayer, e são a razão de existir o Marco 0:

1. **A arena tem o tamanho da janela.** `resizeCanvas()` define `canvas.width/height` a partir de `window.innerWidth/Height`, e `buildTileMap()` deriva `PLAY` disso. Dois jogadores com telas diferentes teriam mundos de tamanhos diferentes.
2. **O estado é global e singular.** `player`, `enemies`, `bullets`, `coins`, `wave`… são `let` soltos em `ui.js`. Não existe noção de coleção de jogadores nem separação entre simulação e apresentação.
3. **A aleatoriedade não é semeada.** 62 chamadas de `Math.random()` espalhadas por 8 arquivos governam spawn, loot, críticos, esquiva, mutadores e tilemap.
4. **As telas congelam o mundo.** `gameState !== 'playing'` encerra o `requestAnimationFrame`; level-up e loja param tudo.

## 3. Decisões tomadas

| Decisão | Escolha | Por quê |
|---|---|---|
| Modo | **Co-op contra as waves** | Máximo reaproveitamento do jogo atual; tolerante a latência — um inimigo 80ms atrasado não é percebido |
| Infra | **P2P host-autoritativo (WebRTC), só signaling** | Custo ~zero, continua estático no Pages. Aceita-se: se o host cai a partida cai, e cheat é trivial (é co-op entre amigos) |
| Entrada | **Código de sala / link privado** | Único formato que cabe em "infra mínima" — o signaling casa duas pontas e esquece; sem diretório, sem estado |
| Relação com o original | **Repositório novo (fork limpo)** | Liberdade total de refatorar sem quebrar o jogo publicado. Aceita-se a divergência: são dois jogos daqui pra frente |
| Arena | **Mundo maior que a tela + câmera por jogador** | Permite arenas grandes e separação tática. Custo assumido: câmera, culling, minimapa, indicadores de aliado fora de tela, interest management |
| Jogadores | **Até 4 (host + 3)** | Host mantém 3 conexões — viável numa conexão doméstica |
| Pausas | **Level-up acumula; resolve no intervalo com a loja** | Nada interrompe a ação; um jogador escolhendo bênção não congela os outros três |
| Morte | **Caído + revive por aliado** | O melhor momento do co-op; quem não morreu ganha função de suporte |
| Economia | **Loot instanciado (cada um recebe o seu)** | Elimina a corrida por moeda; preserva loja e equipamentos quase como estão |
| Stack | **TypeScript + Vite** | Tipos descrevem mensagens de rede e snapshots; erro de campo vira erro de compilação em vez de dessincronização remota |
| Netcode | **Snapshot + predição local com reconciliação** | Controle responde na hora mesmo com 150ms de ping; padrão do gênero |

## 4. Decomposição em marcos

Cada marco tem spec, plano e execução próprios. A ordem é dependência, não preferência.

- **Marco 0 — Fundação: simulação pura.** Porta o jogo para TS+Vite separando simulação, render e UI; mundo fixo + câmera; passo fixo; RNG semeado; eventos. Entrega o single-player rodando na stack nova. Sem uma linha de rede. *(Detalhado neste documento.)*
- **Marco 1 — Transporte e sala.** Signaling, WebRTC DataChannel, código de sala, lobby (jogadores, classe, host inicia), protocolo tipado. Entrega: 4 navegadores conectados, ping na tela.
- **Marco 2 — Partida sincronizada.** Host roda `step()` com os inputs de todos e emite snapshots 15–20Hz; cliente prevê o próprio personagem, reconcilia e interpola os demais; interest management. Entrega: 2–4 jogadores lutando no mesmo mundo.
- **Marco 3 — Regras de co-op.** Caído/revive, loot instanciado, escala de dificuldade por número de jogadores, intervalo compartilhado (loja + bênçãos acumuladas + "pronto" com timer de segurança), fim de run coletivo. Entrega: campanha jogável em co-op.
- **Marco 4 — Resiliência e acabamento.** Queda e retomada de conexão, saída do host, minimapa, nomes e HP sobre a cabeça, meta/forge persistido.

## 5. Marco 0 em detalhe

### 5.1 A regra que governa tudo

`sim/` não importa nada de `render/`, `ui/` ou `app/`, e não toca em `document`, `canvas`, `window`, `performance` ou `Math.random`.

Se `sim/` roda no Node dentro de um teste, roda idêntico na máquina do host e na do cliente. É essa propriedade — e só ela — que torna predição e reconciliação possíveis no Marco 2.

### 5.2 Camadas

```
src/
  sim/      mundo e regras — puro, testável em Node, sem I/O
  render/   desenha um World; câmera, culling, spritesheet
  ui/       DOM: HUD, telas, loja, controles touch
  app/      cola: loop rAF, input, áudio, save, service worker
```

Mapeamento a partir do código atual:

| Hoje | Vira |
|---|---|
| `config.js` | `sim/defs/*` (classes, inimigos, mutadores, bênçãos, itens) + `render/sprites.ts` (spritesheet, coordenadas, cores) |
| `engine.js` | `sim/run.ts` (waves, spawn queue) + `app/loop.ts` (rAF, input) + `render/tilemap.ts` |
| `combat.js` | `sim/step.ts` + `sim/combat.ts` |
| `entities.js` | `sim/enemies.ts` + `sim/xp.ts` |
| `items.js` | `sim/loot.ts` (moedas, poções, baús) + `ui/shop.ts` (DOM) |
| `ui.js` | rachado em três: estado → `sim/world.ts`, stats → `sim/stats.ts`, DOM/HUD/touch/settings → `ui/` |
| `equipment.js`, `equipment-catalog.js` | `sim/equipment.ts` — **já são puros hoje**, entram quase sem alteração |
| `render.js` | `render/*` |
| `save.js`, `audio.js` | `app/save.ts`, `app/audio.ts` |

### 5.3 As quatro mudanças estruturais em `sim/`

**1. `World` no lugar das globais.** Um objeto único: `players` (mapa por id — plural desde o dia zero, mesmo com um jogador só), `enemies`, `bullets`, `enemyBullets`, `coins`, `potions`, `chests`, `obstacles`, `wave`, `spawnQueue`, `rng`, `tick`, `events`. Nada de `let player` solto.

**2. Passo fixo.** `step(world, inputsPorJogador, DT)` com `DT` constante de 1/60s, dirigido por acumulador no loop. O passo variável de hoje (`dt` vindo do `requestAnimationFrame`) impede reconciliação: reexecutar um frame precisa dar exatamente o mesmo resultado.

**3. RNG semeado.** As 62 chamadas de `Math.random()` se dividem em duas categorias, e a distinção economiza trabalho:

- As que afetam o mundo (spawn, tipo de inimigo, loot de baú, ofertas da loja, mutador, crítico, esquiva, elite) viram `world.rng.next()` — PRNG determinístico (mulberry32) semeado por run.
- As puramente cosméticas (variante de tile, jitter de partícula, posição de tocha) permanecem `Math.random()` **dentro de `render/`**. Semeá-las custaria trabalho sem retorno: não afetam o estado do mundo.

**4. A simulação relata, não fala.** Hoje `combat.js` chama `Sfx.play()` e `addFloatText()` no meio do cálculo de dano. Puro não pode: passa a `world.events.push({ type:'hit', … })`, e `app/` drena a lista para tocar som, criar texto flutuante e disparar screen shake.

Sem isso, o cliente do Marco 2 tocaria o mesmo som a cada reconciliação de um frame já reproduzido.

### 5.4 Mundo e câmera

`WORLD` passa a ser fixo em unidades lógicas — ponto de partida **2400×1600** (~3 telas de desktop) — em vez de derivar da janela. A viewport continua sendo o tamanho da janela; `render/` desenha com deslocamento de câmera centrada no jogador local, presa às bordas do mundo, e descarta o que está fora do enquadramento.

Consequências diretas: o tilemap e a arena (obstáculos, armadilhas, tochas) passam a ser gerados para o mundo, não para a janela, e o redimensionamento da janela deixa de reconstruí-los — só muda o enquadramento. O piso pré-renderizado num canvas offscreen (`renderFloorCanvas()` hoje) passa a cobrir o mundo inteiro; a 2400×1600 isso é da ordem de 15 MB de bitmap, aceitável, mas é o número a vigiar caso o mundo cresça.

### 5.5 Formato de input

```ts
type InputState = {
  tick: number;
  move: { x: number; y: number };  // -1..1, já normalizado
  aim: number;                     // radianos
  attack: boolean;
  special: boolean;
  sprint: boolean;
};
```

Um struct serializável por jogador por tick — mesmo agora que vem só do teclado local. É exatamente o que o Marco 2 envia pelo DataChannel, sem redesenho.

### 5.6 O frame, de ponta a ponta

1. `app/loop.ts` (rAF) lê teclado, mouse e toque e monta um `InputState`.
2. Acumulador: enquanto sobrar tempo, `step(world, inputs, DT)` — zero, uma ou várias vezes. O mundo só avança em fatias de 1/60s.
3. `world.events` é drenado: `app/audio.ts` toca os sons, `ui/` cria textos flutuantes e atualiza o HUD, `render/` dispara o screen shake.
4. `render(world, camera, alpha)` desenha, com `alpha` interpolando entre o penúltimo e o último estado — sem isso, 60Hz de simulação numa tela de 144Hz treme visivelmente.

O HUD passa a **ler do `world`** em vez de ser empurrado por quem causou a mudança — mesma razão do item 4 da seção 5.3.

## 6. Escopo do Marco 0

**Dentro:** o jogo atual inteiro e fiel — 7 classes, campanha e endless, bosses, mini-bosses, elites, mutadores, combo, loja, level-up, equipamentos das 3 fases, forge/soul gold, PWA, controles touch, áudio — mais mundo fixo, câmera, culling, passo fixo, RNG semeado e eventos.

**Fora, explicitamente:**

- Qualquer código de rede.
- Minimapa e indicadores de aliado fora de tela (não existem com um jogador).
- **As regras de co-op.** Level-up acumulado, revive e loot instanciado são Marco 3. O Marco 0 preserva as regras single-player como estão hoje — misturar port e regra nova torna impossível saber de qual dos dois veio uma regressão.
- A "leva 2" de UI pendente no repositório original.
- Features novas de jogo (especializações/sub-classes, meta-progressão, conquistas).

## 7. Verificação

- **Teste de determinismo** — duas instâncias de `World` com a mesma seed e a mesma sequência de inputs, N ticks, comparando um hash do estado. É o guardião da arquitetura: quebra no dia em que alguém colar `Math.random()` ou `Date.now()` dentro de `sim/`.
- **Barreira de importação** — regra de lint proibindo `sim/**` de tocar DOM, `window` ou `Math.random`. O teste acima pega o sintoma; a regra pega a causa no momento em que é escrita.
- **Testes de unidade do sim** — os 3 testes de equipamento existentes migram (hoje rodam em Node via guard UMD; passam a rodar limpo como módulos), mais cobertura nova de stats, dano e XP.
- **Paridade jogada** — rodar DungeonGuys e DungeonGuys2 lado a lado e conferir que uma run se comporta igual.

## 8. Riscos assumidos

- **Portar 2.900 linhas é grande, e regressão de port é silenciosa.** Mitigação: migrar em fatias verticais, cada uma terminando com o jogo rodando. Nunca "porta tudo e testa no fim".
- **Mundo 3× maior desbalanceia.** Inimigos demoram a chegar; moedas ficam longe. Mitigação: spawn relativo à posição do jogador e revisão do raio do ímã de moedas. Retoque de balanceamento é tarefa do marco, não surpresa.
- **O deploy deixa de ser `git push`.** O Pages passa a servir o build do Vite; a GitHub Action precisa buildar antes de publicar.
- **Host-autoritativo P2P tem limites conhecidos e aceitos:** o host tem vantagem de latência, a queda do host derruba a partida, e trapaça é trivial. São aceitáveis para co-op entre amigos e não serão combatidos.

## 9. Convenções

- Branches `feature/<nome>`; comentários de código em inglês; documentos em português.
- Fluxo por marco: `brainstorming` → spec → `writing-plans` → plano → `subagent-driven-development` → `finishing-a-development-branch`.
