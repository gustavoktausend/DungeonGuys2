# Phase 1: Formato e costuras - Context

**Gathered:** 2026-08-31
**Status:** Ready for planning

> Rótulos de estrutura ficam em inglês porque são lidos por ferramenta.
> O conteúdo é em português, como o resto dos documentos do projeto.

<domain>
## Phase Boundary

Esta fase congela os formatos que entram no banco, no fio e em todo replay guardado:
os três espaços de identidade, o `RunConfig` por jogador, o `SIM_VERSION` por hash de
conteúdo, o log de inputs quantizado na captura, o `World` serializável, a trigonometria
própria e a especificação técnica de assets.

**Zero linha de rede.** Nada de novo para jogar. A fase existe para que essas decisões
não virem migração de dados depois, e é o que protege as oito fases seguintes.

**Requisitos cobertos:** FORM-01 a FORM-12 (12 requisitos).

**Fora do escopo desta fase, explicitamente:** qualquer código de sala, transporte,
signaling ou sincronização (fases 3-5); qualquer mudança em `render/` além do que a
extração de pacotes exigir (fase 7); implementação de conta, login ou sincronização em
nuvem (fase 6); implementação de ranking, temporada ou missão (fases 8-9). As decisões
de formato **dessas** fases são escritas aqui como ADR e implementadas lá.

</domain>

<decisions>
## Implementation Decisions

### Trigonometria e quantização de input (FORM-04, FORM-06)

- **D-01:** `sim/math.ts` implementa `sin`, `cos` e `atan2` como **port de polinômio em
  JS puro** (fdlibm — FreeBSD msun para `sin`/`cos`, Go `math/atan2` para `atan2`),
  construído só sobre operações exatas por spec. Não é tabela de lookup. Motivo: aceita
  qualquer ângulo em radianos, cobre também os ângulos internos do sim (spread de tiro,
  anéis de spawn, padrão de chefe, tiro de inimigo) que não vêm de input nenhum, e não
  exige retuning de mira. Os ~30 call sites viram troca de import.
- **D-02:** `InputState.aim` **continua `number` em radianos**. A quantização acontece em
  `app/input.ts`, arredondando ao passo de `2π/65536` (0,0055°) **antes** de o sim ver o
  valor. O log grava o `uint16`; recarregar multiplica de volta — multiplicação IEEE-754 é
  exatamente arredondada, então o valor volta bit-idêntico. Nenhum consumidor de ângulo
  dentro de `sim/` muda de unidade.
- **D-03:** `InputState.move.x` e `.move.y` são **quantizados em int8** em `[-127, 127]`,
  valor efetivo `n/127`. Isso tira o resultado de `Math.hypot` (implementation-defined) do
  caminho do dado gravado — o que o sim vê é o inteiro, não o float do motor. A magnitude
  parcial do joystick analógico continua preservada. Fecha o pacote de 6 bytes por tick.
- **D-04:** **Política de preenchimento de buracos:** quando o input de um jogador não
  chega a tempo do tick, a autoridade repete o **último input conhecido** daquele jogador e
  grava isso no log. A política é parte do formato, não do código de rede.
- **D-05:** **Regra escrita do protocolo:** o `InputState` quantizado é o que atravessa a
  rede e o que entra no log. **Nenhum peer recalcula** mira ou movimento a partir de estado
  do mundo. Isso é o que torna seguro `app/input.ts` continuar usando `Math.hypot` e
  `Math.atan2` (`:64,79,82,111,113`). Auto-aim continua fora de `sim/`.

### `SIM_VERSION` e versionamento (FORM-03, FORM-11, FORM-12)

- **D-06:** O hash de conteúdo do `SIM_VERSION` cobre **apenas a simulação** — os módulos
  de `sim/` mais `sim/defs/` (classes, inimigos, itens, bênçãos, mutadores) e as
  constantes. Um ajuste de HUD, de áudio ou de sprite **não** fecha a temporada.
  Rebalancear um inimigo **fecha** — e isso é correto, porque muda o resultado de um replay.
- **D-07:** O valor é o **hash do bundle emitido de `packages/sim`**, com o build fixado
  para ser reproduzível (sem timestamp, sem caminho absoluto, ordem de módulos estável) e a
  versão da toolchain pinada no `package-lock.json`. Consequência aceita: subir Vite ou
  TypeScript fecha a temporada — evento agendado, não surpresa.
- **D-08:** Versões diferentes **recusam sempre**, com as duas versões e a razão na tela
  (recarregar). **Não existe bypass de dev.** Vale para entrada em sala e para carregar
  replay. Dessincronização silenciosa é a falha mais cara de diagnosticar do projeto.
- **D-09:** `PROTOCOL_VERSION` é **separado** do `SIM_VERSION` e **nasce nesta fase**, em
  `packages/protocol`, junto com as tabelas de enum congeladas e append-only de FORM-11.
  Ciclos de vida distintos: `SIM_VERSION` fecha temporada; `PROTOCOL_VERSION` só impede
  conexão. FORM-12 (o protocolo não contém a palavra "host") vale para esse pacote.

### Artefato de run e serialização (FORM-02, FORM-06, FORM-07, FORM-08)

- **D-10:** O artefato de run é um **envelope JSON legível** (seed, `RunConfig`,
  `SIM_VERSION`, score alegado, `hashWorld` final) com o **log de inputs como blob binário
  em base64** dentro dele. Dá para abrir um replay num editor sem ferramenta, e o log — que
  é 99% dos bytes — fica compacto. Orçamento: 20-40 KB gzipado por run de 20 min.
- **D-11:** O replay **parte da seed**: o verificador roda `createWorld(config)` +
  `generateArena` e só depois aplica o log. Não há snapshot inicial embutido e **não há
  checkpoints periódicos de hash** no formato. Se o setup divergir, a verificação falha no
  tick 0 em vez de mascarar o problema.
- **D-12:** O log é gravado **por tick, só o que mudou** (delta + RLE): um jogador só
  aparece no tick em que o `InputState` dele muda. A ordem dentro do tick é a ordem
  canônica do `RunConfig`. É a tabela **resolvida pela autoridade**, não o tráfego que
  chegou.
- **D-13:** `world.players` **continua `Record<string, Player>`** — serializa por JSON sem
  tratamento especial. `step()` passa a iterar `world.config.players` (array, ordem
  canônica) indexando o Record, em vez de `Object.keys(world.players)` (`step.ts:19`). A
  ordem canônica vive no manifesto da run, que é onde o replay já vai procurar.

### Estrutura de pacotes (FORM-04, FORM-10)

- **D-14:** `packages/sim` e `packages/protocol` são **extraídos nesta fase** com npm
  workspaces. Não é opcional dado D-07: "hash do bundle emitido de `packages/sim`" exige
  que a simulação tenha um artefato de build próprio.
- **D-15:** O rearranjo é de **apenas os dois pacotes**. `src/app`, `src/render`, `src/ui`,
  `index.html` e `vite.config.ts` **ficam na raiz**. `apps/web` e `apps/server` não nascem
  aqui: a fase 2 mexe em `base`, service worker e deploy, e mover o app agora seria migrar
  duas coisas na mesma semana.
- **D-16:** A pureza de `sim/` passa a ter **três guardas independentes**:
  `packages/sim/tsconfig.json` com `"lib": ["ES2022"]` (sem `DOM`) — o compilador recusa
  `window` e `document`; as regras de lint atuais **continuam** (elas cobrem `Math.random`,
  `Date.now` e os imports proibidos, que nenhum `lib` pega); e `tests/purity.test.ts`
  continua, agora asserindo também `dependencies: {}`.
- **D-17:** **Ordem interna da fase:** a extração dos pacotes vem **primeiro de tudo** —
  antes do corte da aresta `xp -> run` e antes do `sim/math.ts`. Assim o `sim/math.ts` nasce
  no lugar definitivo e os hashes-ouro são refeitos uma vez só. A sequência já travada pelo
  roadmap (corte do SCC **antes** do `math.ts`; cobertura de `updateBossPattern` **junto**
  com o `math.ts`) permanece.

### Spec técnica de assets (FORM-09)

- **D-18:** **Unidade lógica congelada: 1 unidade = 1 pixel renderizado.** `WORLD`
  2400x1600 continua sendo 2400x1600 px de piso pré-renderizado — os mesmos ~15 MB de hoje.
  Toda constante de `sim/` (alcance, `COIN_MAGNET`, hitbox) continua significando pixel, e
  nada de balanceamento se move por mudança de unidade.
- **D-19:** **Resolução base do personagem: 32x48 px, desenhado a escala 1.** O personagem
  ocupa exatamente o mesmo espaço na tela que hoje (32x56 desenhados a partir de 16x28 a
  `SPRITE_SCALE = 2`), com quatro vezes o detalhe. Enquadramento, campo de visão e sensação
  de escala ficam idênticos. `SPRITE_SCALE` sai do código como conceito.
- **D-20:** **`TILE` de desenho = 32** (75x50 tiles no mundo). Os tiles novos são 32x32
  nativos em vez de 16x16 dobrados. Divide exato nos dois eixos de `WORLD` — 48 e 64 não
  dividem. `TILE` deixa de aparecer nas contas de `world.play`, que ganha `PLAY_MARGIN`
  própria (decisão já travada a montante), e passa a ser puramente de desenho.
- **D-21:** A spec exige **apenas `idle` e `run`** por personagem — exatamente o que
  `render/entities.ts` desenha. Acerto continua sendo tint e morte continua sendo fade. A
  **contagem de quadros por animação é declarada no manifesto**, não fixa em 4, para que
  `render/sprites.ts` pare de ter coordenada escrita à mão sem prender o artista a um número.
- **D-22:** **Rampa de recolor obrigatória.** Paleta livre para o artista, mas cada
  personagem declara no manifesto quais cores são a rampa de roupa, e o validador do CI
  recusa um sprite que não a declare. Preserva a troca de cor por jogador que
  `render/sprites.ts` já faz e que CONTA-06 vai precisar.
- **D-23:** **A hitbox manda em `sim/defs`, o CI confere.** A hitbox continua sendo código
  de simulação — versionada pelo `SIM_VERSION`, revisável em diff. O manifesto declara o
  pivô e as dimensões visuais, e o validador recusa um sprite que não cubra a hitbox
  declarada em `sim/defs/enemies.ts`. O agente de arte **não** mexe em balanceamento, e o
  `SIM_VERSION` não passa a depender de arquivo de arte.
- **D-24:** **Manifesto JSON por spritesheet**, contra um **JSON Schema versionado** que
  mora neste repositório. O validador vive em `tools/assets/` e roda no CI **deste** repo,
  para que o agente de arte receba o erro sem humano no meio. Sheets independentes: um lote
  errado não bloqueia os outros.
- **D-25:** **Entrega por cópia commitada.** PNG-32 sem premultiply e os manifestos vivem
  commitados em `public/assets/`, atualizados por PR do agente de arte. Nada de submódulo,
  nada de pacote publicado. O build fica offline e reproduzível — que é o que o hash do
  `SIM_VERSION` e o precache do PWA precisam.

### Soul gold e save local (FORM-05)

- **D-26:** O `progress.soulGold` gravado hoje em `dungeonguys2_save_v1` é **descartado**.
  O ledger nasce vazio, sem código de migração e sem tipo de evento `legacy`. O jogo nunca
  foi publicado sob domínio próprio e o único save real é o do desenvolvedor.
- **D-27:** O `eventId` de cada concessão é um **ULID gerado no cliente**, no momento do
  evento; o servidor (fase 6) deduplica por `UNIQUE(id)`. Funciona offline, funciona para
  qualquer origem de soul gold (fim de run, missão, selo de temporada) com uma regra só, e
  o próprio id já carrega ordem temporal. Sincronizar duas vezes é no-op.
- **D-28:** **O gasto também é evento**, negativo, no mesmo ledger, com id próprio. Saldo =
  soma de tudo. É o que faz "restaurar um save antigo não ressuscita saldo já gasto"
  (critério 3 da fase 6) funcionar sem caso especial, e dá o log de auditoria sem o qual
  não existe rollback. O nível do forge vira estado derivado, gravado na mesma transação
  que o gasto.
- **D-29:** O ledger mora em **chave própria `dungeonguys2_ledger_v1`**, separada do save.
  **Regra de compactação decidida agora** (é formato), mesmo que o servidor só exista na
  fase 6: eventos já confirmados pelo servidor colapsam num único evento de saldo
  consolidado com a marca d'água da confirmação; só os pendentes ficam individualmente.

### Decisões escritas, não implementadas (FORM-01)

Estas viram **ADRs numerados em `docs/adr/`** — um arquivo por decisão, com contexto,
opções e consequência. Não viram código nesta fase. `docs/adr/` é o diretório que as fases
5, 6, 8 e 9 vão citar nominalmente.

- **D-30:** **Identidade em três espaços** (já travado a montante, formalizado em ADR):
  `accountId` (ULID durável do servidor, nunca entra no `World`) / `playerId` (`p0..p3`,
  slot atribuído pela autoridade, é o que o replay conhece) / `peerId` (handle do
  transporte, morre com a conexão).
- **D-31:** **A conta local do primeiro boot recebe um ULID local marcado como
  não-reivindicado.** O login da fase 6 troca-o por um `accountId` do servidor e grava o de
  origem no registro do claim — reivindicar duas vezes é detectável e reivindicar com uma
  conta que já tem progresso é recusável com explicação (critério 4 da fase 6). Não é um
  quarto espaço de identidade: é o mesmo campo `accountId` com um marcador de origem. Os
  eventos do ledger já nascem carimbados com ele.
- **D-32:** **Política de merge por campo do save:** recordes por classe fundem por
  `MAX(local, servidor)`; missões e classes destravadas fundem por **união**; soul gold é o
  ledger de D-27/D-28; entradas de ranking vão para fila local e verificação assíncrona.
- **D-33:** **Settings — identidade sincroniza, preferências não.** `name` e `colors`
  sincronizam por última escrita com carimbo de tempo (CONTA-06 exige que cheguem aos
  amigos na sala sem redigitar). `volume`, `mute`, `autoAim`, `shake` e `mode` ficam **por
  aparelho**: sincronizar o volume do desktop para o celular é bug, não recurso — e
  `app/input.ts` já trata auto-aim diferente entre touch e mouse.
- **D-34:** **Esquema `(temporada, SIM_VERSION)`** escrito antes do primeiro board. Modelo
  Factorio (já travado a montante): mudança de `SIM_VERSION` fecha a temporada e abre outra,
  com o placar anterior preservado e rotulado; replay de outra versão é recusado com a razão
  na tela.
- **D-35:** **Categorias do placar:** modo x tamanho de grupo x perfil, nunca misturados.
  v1 rankeia **só solo** (já travado a montante); as outras dimensões existem como coluna
  desde o primeiro board para que abrir co-op depois não seja migração.
- **D-36:** **Teto do forge em runs rankeadas: perfil normalizado — forge desligado.** Runs
  rankeadas rodam com forge zerado. O board fica comparável, um jogador novo compete no dia
  1, e a superfície de verificação encolhe: o servidor reconstrói o `RunConfig` sem precisar
  confiar em nível de forge nenhum. É o valor que a coluna "perfil" carrega em v1.
- **D-37:** **Política de queda do host: checkpoint de progressão durável por wave
  concluída.** Cada wave concluída credita progressão na conta de cada participante na hora;
  a queda perde só a wave em andamento. Sem migração de host, sem submissão de run parcial.
  Formato do checkpoint: um registro por `(run, wave, jogador)`. É o que o critério 5 da
  fase 6 já promete literalmente.
- **D-38:** **Missão destravada: a cadeia de quem criou a sala define** o que dá para jogar;
  quem não destravou entra como convidado; **todos os presentes na conclusão recebem
  crédito** na própria conta. "Carregar" um amigo é feature aceita por escrito — em co-op
  privado entre amigos, carregar é o ponto.

### Claude's Discretion

Decisões técnicas deixadas para o pesquisador e o planejador resolverem a partir do código:

- **CI e hashes-ouro cross-engine** (critério de sucesso 1). Hoje `.github/workflows/` só
  tem `deploy.yml` — não existe workflow de teste. Onde os hashes-ouro moram, como são
  versionados, quem pode refazê-los, e como a atualização em massa causada pelo
  `sim/math.ts` é feita de forma auditável. Playwright com versão fixa (um upgrade troca as
  builds dos motores, que é justamente a variável do teste).
- **Como o corte da aresta `xp -> run` é feito** (SCC de 8 -> 6 módulos).
- **Como `updateBossPattern` ganha cobertura** — junto com o `math.ts`, não depois.
- **`app/stepper.ts`** (FORM-10): como o passo fixo é extraído de `app/loop.ts:17-40`, que
  hoje usa `performance.now()` e `requestAnimationFrame` diretamente.
- **Forma de `world.objectives`** (FORM-08): que seja campo do `World` e não evento
  drenável está decidido; o formato do campo é desenho do planejador, e ele entra no
  round-trip de `sim/serialize.ts` como qualquer outro campo.
- **Promoção de `hashWorld` e da serialização** de `tests/helpers.ts:38-62` para
  `packages/sim/src/serialize.ts`, incluindo a normalização de `-0` (hoje ausente).
- **Formato exato do JSON Schema do manifesto** e a estrutura de `tools/assets/`.
- **Numeração e nomes dos arquivos de ADR** dentro da convenção `docs/adr/NNNN-slug.md`.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Decisões de produto e escopo
- `.planning/PROJECT.md` — Core Value, requisitos Active/Validated/Out of Scope, Key
  Decisions, e a seção Context com a dívida técnica herdada do Marco 0 (itens 1-5)
- `.planning/REQUIREMENTS.md` — o texto literal de FORM-01 a FORM-12 e a tabela de
  rastreabilidade requisito -> fase
- `.planning/ROADMAP.md` — Goal, Success Criteria (5), a sequência interna que não pode ser
  trocada, e a lista "escritos aqui, implementados depois" da Phase 1
- `.planning/STATE.md` — decisões já travadas e as perguntas abertas (quatro delas fechadas
  por D-35 a D-38)

### Pesquisa que sustenta as decisões
- `.planning/research/SUMMARY.md` — a seção "Fase 1" com a lista de entregáveis; a tabela
  "Decidir cedo" (itens 1, 4, 5, 6, 7, 13, 18); e "Gaps to Address", que registra a
  divergência polinômio x tabela e que a contagem de call sites (26 ou 30) precisa ser
  recontada na execução
- `.planning/research/STACK.md` — a tabela de opções A-E de determinismo com custos; a
  lista de armadilhas além de `sin`/`cos`/`atan2` (`Math.hypot` em `app/input.ts`, `-0` no
  hash, `world.rng` como instância de classe); e a tabela de origem do port fdlibm por
  função com LOC estimado
- `.planning/research/ARCHITECTURE.md` — layout do monorepo, `SIM_VERSION`, o worker de
  replay e o orçamento do input log
- `.planning/research/PITFALLS.md` — os números medidos **neste** repositório (13,8 KB de
  `World` serializado, ~15 MB do piso pré-renderizado, `updateBossPattern` sem teste)
- `.planning/research/FEATURES.md` — ranking verificado por replay e o que ele derrota

### Estado do Marco 0
- `docs/superpowers/specs/2026-08-27-coop-online-design.md` — spec de origem, decisões de
  arquitetura já tomadas
- `docs/DECISOES-MARCO0.md` — as 39 decisões da execução do Marco 0, com motivo e custo se
  erradas. Ler antes de contradizer qualquer escolha de `sim/`
- `docs/BACKLOG.md` — dívida técnica aberta, triada na revisão do branch inteiro
- `docs/PARIDADE.md` — o que está e o que não está verificado contra o jogo original; a
  curva de resposta de `COIN_MAGNET` e a ressalva sobre dependência de frame rate

### Código que esta fase reescreve
- `src/sim/constants.ts:1-20` — a doutrina de ponto flutuante do Marco 0 e o `OPEN ITEM`
  que o `sim/math.ts` fecha. É o briefing do D-01
- `src/sim/types.ts:250-284` — `RunConfig`, `InputState` e `World` como estão hoje
- `src/sim/step.ts:19` — o `Object.keys(world.players)` que D-13 substitui
- `tests/helpers.ts:38-62` — `hashWorld`, com o replacer de `rng` e de não-finitos; é o
  esqueleto de `serialize.ts`
- `src/app/input.ts:110-118` — onde a quantização de D-02 e D-03 acontece
- `src/app/loop.ts:17-40` — o passo fixo acoplado a `requestAnimationFrame` que FORM-10
  separa
- `src/app/save.ts:57-70` — `dungeonguys2_save_v1` e `progress.soulGold`, o contador que
  D-26 descarta
- `eslint.config.js:6-42` — as regras de pureza de `src/sim/**` que D-16 preserva
- `src/render/sprites.ts:15-45` — as coordenadas escritas à mão que o manifesto de D-24
  substitui na fase 7

### A criar nesta fase
- `docs/adr/` — os ADRs de D-30 a D-38. **Vinculantes para as fases 5, 6, 8 e 9**
- A spec técnica de assets de FORM-09 (D-18 a D-25), consumida por outro agente em outro
  repositório

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **`tests/helpers.ts:hashWorld`** já serializa `world.rng` via `.save()` e etiqueta `NaN`,
  `Infinity` e `-Infinity` separadamente. É `sim/serialize.ts` pronto, faltando a
  normalização de `-0` e a promoção para dentro do pacote.
- **`src/sim/rng.ts:55-62`** já expõe `save()`/`restore()` sobre um único int32 — o
  round-trip de FORM-07 não precisa inventar nada para o RNG.
- **`src/sim/constants.ts:1-20`** já documenta por que `Math.sqrt` fica e `Math.hypot` sai.
  A auditoria de `sim/` confirma: 13 `sin`, 13 `cos`, 4 `atan2`, zero `pow`/`exp`/`log`/`tan`,
  e `hypot` só em comentário. `Math.sqrt` aparece 20+ vezes e **fica** (pinado a IEEE-754).
- **`eslint.config.js`** já tem a regra de pureza; estendê-la com `sin`, `cos`, `atan2`,
  `tan`, `pow`, `exp`, `log` e `hypot` em `no-restricted-properties` é acréscimo de linhas,
  não desenho novo.
- **244 testes em 21 arquivos** com os quatro portões verdes — a rede de segurança para a
  extração de pacotes de D-14 (que, se quebrar, quebra tudo de uma vez).

### Established Patterns
- **`sim/` é puro por três guardas** (lint, `tests/purity.test.ts`, e a partir desta fase o
  tsconfig sem `DOM`). Nenhuma decisão desta fase pode introduzir DOM, relógio ou
  aleatoriedade não semeada em `sim/`.
- **Eventos são a única saída do sim** (`SimEvent` + `emit` + `drainEvents`). FORM-08 é
  exatamente a exceção a essa regra: objetivos de missão são **campo** do `World`, não
  evento, porque evento drenável não é verificável por replay.
- **`RunConfig` é o único canal de entrada do mundo externo** para o sim (`forge` já entra
  por ele). O `RunConfig` por jogador de FORM-02 é a extensão natural desse padrão.
- **`DT_MS = 1000/60` e `TICK_FACTOR = DT_MS/16.67`** preservam o tuning do original.
  Nenhuma decisão desta fase mexe neles.

### Integration Points
- **`src/sim/step.ts:19`** — o ponto único onde a ordem de iteração dos jogadores muda
  (D-13).
- **`src/app/input.ts:collect()`** — o ponto único onde a quantização entra (D-02, D-03).
- **`src/app/loop.ts:startLoop`** — o que `app/stepper.ts` extrai (FORM-10); `main.ts:43`
  registra o service worker via `import.meta.env.BASE_URL`, que a **fase 2** toca.
- **`package.json`** — hoje `dependencies: {}`, Vite 5.4.9, TS 5.6.3, Vitest 2.1.3. A
  extração de workspaces e o upgrade de toolchain agendado no backlog se encontram aqui.
- **`.github/workflows/deploy.yml`** — único workflow existente. O CI de teste
  cross-engine do critério 1 não tem onde morar ainda.

### Constraints que limitam as opções
- `packages/sim` mantém `dependencies: {}` — invariante, asserida por teste.
- `WORLD = { w: 2400, h: 1600 }` não muda; o piso pré-renderizado é ~15 MB e cresce com o
  quadrado (motivo direto de D-18).
- `src/sim/` é um componente fortemente conexo de 8 dos 15 módulos: qualquer `const`
  avaliada em tempo de módulo que cruze o ciclo vira `undefined` em silêncio. É por isso que
  o corte do SCC vem antes do `sim/math.ts`, e por isso que D-01 (polinômio, sem tabela
  construída em tempo de módulo) é a escolha mais segura das duas.

</code_context>

<specifics>
## Specific Ideas

- **"Recusa sempre, sem bypass"** (D-08) foi escolhido contra a conveniência de testar duas
  builds lado a lado. A justificativa registrada: um bypass que existe é um bypass que vaza
  para produção, e dessincronização silenciosa aparece 40 segundos depois como "o jogo
  bugou".
- **O personagem tem que ocupar o mesmo espaço na tela** (D-19). A resolução dobra e a
  escala cai de 2 para 1 justamente para que enquadramento, campo de visão e sensação de
  escala fiquem idênticos — a arte melhora, o jogo não muda de forma. A opção de 48x72 foi
  recusada porque encolher o campo de visão piora o que COOP-04 (fase 5) existe para
  consertar.
- **A arte não mexe em balanceamento** (D-23). A hitbox continua sendo código de simulação,
  versionada pelo `SIM_VERSION`; o manifesto só declara o visual e o CI confere a cobertura.
- **"Carregar um amigo é feature"** (D-38) — aceito explicitamente por escrito, não tolerado
  por omissão.
- **Descartar o soul gold existente** (D-26) foi escolhido sabendo que abre mão de exercitar
  o caminho de migração antes de ele valer dinheiro de verdade.

</specifics>

<deferred>
## Deferred Ideas

Consequências registradas — não são ideias soltas, são portas que estas decisões fecharam:

- **Verificação amostrada por checkpoint no ranking está fora.** D-11 (replay parte da seed,
  sem checkpoints periódicos de hash no formato) elimina essa opção para a fase 9. O **teto
  de duração para endless no ranking** — a única das perguntas abertas do STATE.md que
  permanece aberta — terá que ser um teto explícito comunicado na UI. Acrescentar
  checkpoints ao formato depois é migração.
- **`apps/web` e `apps/server`** — layout completo do monorepo adiado (D-15). Reavaliar na
  fase 2 ou 3, quando o servidor tiver conteúdo e o deploy já tiver estabilizado.
- **Piso em chunks sob demanda** — descartado nesta fase (D-18). Volta a ser opção se a
  densidade de arte um dia exigir mais que 1 px por unidade lógica; é trabalho de `render/`,
  não de formato.
- **Animações de `hit`, `death` e `attack`** — fora da spec de assets v1 (D-21). Acrescentar
  animações depois é append no manifesto, não migração — o schema versionado de D-24 suporta.
- **`sim/math.ts` com tabela de lookup** (opção B da pesquisa) — recusado em D-01. Se o
  profiler apontar `sin`/`cos` como gargalo real nos laços quentes de `enemies.ts`, a troca
  continua possível, mas passaria a ser mudança de `SIM_VERSION` e fechamento de temporada.
- **Auto-aim dentro de `sim/`** — recusado em D-05 como escopo novo. `nearestEnemy` e
  `aimAngle` continuam em `app/input.ts`; a segurança vem de o `InputState` ser transmitido,
  não recalculado.
- **Bypass de versão em desenvolvimento** — recusado em D-08. Se o atrito de testar co-op
  local se mostrar insuportável na fase 3, a solução será rodar o mesmo build nas duas abas,
  não relaxar a regra.

Nenhum item de escopo criativo apareceu na discussão — ela ficou dentro da fronteira da fase.

</deferred>

---

*Phase: 1-Formato e costuras*
*Context gathered: 2026-08-31*
