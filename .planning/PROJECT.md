# DungeonGuys2

## What This Is

Um pixel shooter survival roguelite co-op online para até 4 jogadores, derivado do
DungeonGuys (que segue vivo e independente). Amigos entram numa sala por código e
enfrentam juntos as mesmas waves, numa arena maior que a tela. Cada jogador tem conta
própria, com progresso que o segue entre aparelhos, e escolhe qual personagem vai jogar.
Além do survival sem fim, há um modo missão com destravamento em cadeia e objetivos de
conclusão próprios.

## Core Value

**Quatro amigos entram numa sala pelo código e lutam as mesmas waves no mesmo mundo, com
o jogo respondendo na hora para cada um.** Se tudo o mais falhar, isso precisa funcionar —
é a razão de o projeto existir e a razão de o Marco 0 ter sido construído como foi.

## Requirements

### Validated

<!-- Entregue e mergeado no Marco 0 (2026-08-28, commits a052720..2c2bc55, 244 testes). -->

- ✓ **Simulação pura e determinística** — `src/sim/` não referencia DOM, `window`,
  `performance`, `Date`, `Math.random` nem temporizadores, e não importa de `render/`,
  `ui/` ou `app/`. Garantido por regra de lint **e** por `tests/purity.test.ts`. Mesma
  seed produz a mesma run, verificado por `tests/run.test.ts` e `tests/determinism.test.ts`
  via `hashWorld` — Marco 0
- ✓ **Passo fixo de 60Hz com acumulador**, desacoplado da taxa de quadros — Marco 0
- ✓ **Mundo fixo de 2400×1600 com câmera por jogador**, culling e tilemap pré-renderizado.
  Redimensionar a janela não regenera a arena — Marco 0
- ✓ **Simulação dirigida por `InputState` tipado**, coletado fora do sim — a fronteira que
  o multiplayer vai usar — Marco 0
- ✓ **Eventos como única saída do sim** (`SimEvent` + `emit` + `drainEvents`): o sim nunca
  toca em som, DOM ou persistência — Marco 0
- ✓ **Jogo single-player completo portado do original**: 7 classes com 3 tiers, campanha
  de 16 waves + endless, chefes e mini-chefes, inimigos elite, 5 mutadores de wave, combo
  de score, loja entre waves, level-up com bênçãos, equipamentos por-run e meta-progressão
  em soul gold — Marco 0
- ✓ **PWA instalável, funcional offline**, com service worker network-first — Marco 0
- ✓ **Controles touch** (joystick analógico, botões de especial/sprint/pause, auto-aim) — Marco 0
- ✓ **Save local em `localStorage`** com recordes por classe e forge — Marco 0

### Active

<!-- Hipóteses até entregues. Ordem de prioridade declarada pelo usuário: sala primeiro. -->

- [ ] Quatro jogadores entram numa sala por código e lutam a mesma run sincronizada
- [ ] Formato de identidade e conta decidido **antes** do multiplayer, mesmo que a feature
      de login venha depois (é o que é caro mudar tarde)
- [ ] Conta de usuário com login, progresso na nuvem e identidade persistente
- [ ] Jogo, API de contas e signaling hospedados na VPS própria, sob domínio único
- [ ] Modo missão: destravamento em cadeia (pré-requisito para entrar) **e** objetivo
      próprio de conclusão (além de "sobreviva")
- [ ] Survival sem fim válido em co-op
- [ ] Ranking com score **verificado pelo servidor** re-rodando a run a partir da seed e do
      log de inputs — não score enviado pelo cliente
- [ ] Jogar sozinho offline, com política definida de sincronização ao reconectar
- [ ] Eventos sazonais
- [ ] Assets novos em resolução e direção próprias, produzidos por um agente em
      repositório separado e importados por este projeto
- [ ] Especificação técnica de assets (resolução, pivô, quadros, paleta, nomenclatura)
      publicada **antes** de o agente de assets começar a produzir
- [ ] Interface de usuário caprichada
- [ ] Personagem montado por peças — melhoria posterior, conceito a estabelecer

### Out of Scope

- **PvP** — decisão do spec de origem: o reaproveitamento do jogo atual depende de ser
  co-op contra as waves, e PvP não tolera a latência que este netcode aceita
- **Matchmaking público e diretório de salas** — entrada é por código de sala ou link
  privado; diretório exigiria estado e moderação que o projeto não quer agora
- **Servidor de jogo dedicado, por ora** — P2P host-autoritativo agora, com a fronteira
  desenhada para que mover a autoridade depois seja troca de transporte, não reescrita
- **Redesenho de classes e itens agora** — declarados provisórios em 2026-08-28; até o
  conceito novo existir, a meta é máxima semelhança com o DungeonGuys original
- **Ajuste de balanceamento de classe ou item** — mesma razão: seria trabalho jogado fora
- **Manter paridade visual com o DungeonGuys original** — abandonada de propósito ao optar
  por resolução e direção de arte novas

## Context

**Estado atual.** O Marco 0 está completo e mergeado em `main`: 33 commits de porte mais a
onda de correção da revisão final, 244 testes em 21 arquivos, os quatro portões verdes
(`lint`, `tsc --noEmit`, `test`, `build`). O jogo single-player roda na stack nova.
Nenhuma linha de rede foi escrita ainda.

**Documentos que já existem e não devem ser reinventados:**

- `docs/superpowers/specs/2026-08-27-coop-online-design.md` — spec de origem, com as
  decisões de arquitetura já tomadas e a decomposição original em Marcos 0–4
- `docs/PARIDADE.md` — o que está e o que não está verificado contra o jogo original;
  15 caixas ainda dependem de conferência humana (som, tato, FPS, PWA em aparelho real)
- `docs/DECISOES-MARCO0.md` — as 39 decisões tomadas durante a execução, com motivo e
  custo se erradas
- `docs/BACKLOG.md` — dívida técnica aberta, triada na revisão do branch inteiro

**Dívida que este projeto herda e que importa para as metas novas:**

1. **`Math.sin`, `Math.cos` e `Math.atan2` são implementation-defined** no ECMAScript. A
   simulação roda idêntica dentro de um mesmo motor, mas um host no Chrome e um cliente no
   Firefox divergem. Já era preocupação do Marco 2; **com ranking verificado por replay no
   servidor, vira bloqueador de produto.** Nenhum teste da suíte pode pegar essa classe de
   divergência, porque ambos os testes de determinismo comparam mundos no mesmo processo.
2. **`src/sim/` é um componente fortemente conexo de 8 dos 15 módulos.** Seguro como está
   (tudo em corpo de função), mas extrair um bundle headless do sim para o servidor —
   necessário para o replay do ranking e para um eventual servidor dedicado — vira
   tudo-ou-nada.
3. **`World` ainda não faz round-trip por JSON**: `world.rng` é instância de classe. O
   caminho pretendido é `rng.save()`/`rng.restore()`. Isso é desenho de snapshot do Marco 1.
4. **`updateBossPattern` não tem teste nenhum** — a maior superfície descoberta de `sim/`.
5. O deploy atual assume GitHub Pages em dois lugares (`base: '/DungeonGuys2/'` no Vite e o
   registro do service worker). Mudar para a VPS exige tocar os dois sem quebrar o offline.

**Tensões conhecidas, ainda sem resposta:**

- **Offline versus conta na nuvem**: jogar sem conexão gera progresso local; dois aparelhos
  offline geram estados divergentes da mesma conta. Exige política de conciliação, e é caro
  decidir depois que o banco tem formato.
- **Offline versus ranking**: score calculado pelo cliente não é confiável. A verificação
  por replay resolve, e depende do item 1 da dívida acima.
- **Trapaça deixou de ser inofensiva**: o spec aceitava que "cheat é trivial, é co-op entre
  amigos" porque o progresso morria no `localStorage`. Com progresso na nuvem, o host pode
  contaminar progressão persistente dos outros.

## Constraints

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

## Key Decisions

| Decisão | Rationale | Outcome |
|----------|-----------|---------|
| Simulação pura e determinística antes de qualquer rede | Sem ela, predição e reconciliação são impossíveis; é a única propriedade que faz o Marco 2 existir | ✓ Good — entregue e verificada por lint e teste |
| Repositório novo em vez de evoluir o DungeonGuys | Liberdade de refatorar sem quebrar o jogo publicado | ✓ Good — os dois seguem vivos |
| Conta com progresso na nuvem **e** identidade persistente | O jogador acha seu progresso em qualquer aparelho e os amigos o reconhecem na sala | — Pending |
| Hospedar tudo na VPS própria, domínio único | Já é paga; simplifica sessão, CORS e deploy; tira limites de camada gratuita | — Pending |
| P2P agora, servidor como opção depois | Mantém o Marco 0 intacto e adia custo de operação, sem fechar a porta | — Pending |
| Decidir o formato de identidade antes do multiplayer | É o que é caro mudar tarde; a sala não pode inventar um conceito de jogador que o login depois contradiga | — Pending |
| Ranking verificado por replay no servidor | A simulação determinística permite re-rodar a run a partir da seed e dos inputs, em vez de confiar no cliente | — Pending |
| Classes atuais mantidas; montagem por peças fica para depois | Melhorar um sistema que vai ser substituído é trabalho jogado fora | — Pending |
| Assets em repositório separado, especificação antes da produção | Fronteira limpa entre arte e engenharia; sem spec, o agente produz no formato errado | — Pending |
| Resolução e direção de arte novas | Deixa de ser troca de arquivo e vira trabalho de engenharia: `TILE`, sheets, câmera | — Pending |
| Começar fechado, abrir depois | Adia moderação, cadastro aberto e anti-abuso sem fechar a porta | — Pending |

## Evolution

Este documento evolui em transições de fase e fronteiras de marco.

**Depois de cada transição de fase** (via `/gsd-transition`):
1. Requisito invalidado? → mover para Out of Scope com a razão
2. Requisito validado? → mover para Validated com a referência da fase
3. Requisito novo surgiu? → acrescentar em Active
4. Decisão a registrar? → acrescentar em Key Decisions
5. "What This Is" ainda está correto? → atualizar se derivou

**Depois de cada marco** (via `/gsd:complete-milestone`):
1. Revisão completa de todas as seções
2. Core Value ainda é a prioridade certa?
3. Auditar Out of Scope — as razões continuam válidas?
4. Atualizar Context com o estado atual

---
*Last updated: 2026-08-28 after initialization*
