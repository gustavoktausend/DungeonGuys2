# Backlog

O que ficou aberto de propósito no fim do Marco 0. Cada item foi triado na revisão do
branch inteiro, com um veredito explícito — nada aqui é esquecimento.

Este repositório não tem rastreador de issues, então este arquivo é o único lugar onde
o backlog existe. Ao fechar um item, remova-o daqui.

Ver também `docs/DECISOES-MARCO0.md` (por que cada decisão foi tomada) e
`docs/PARIDADE.md` (o que está e o que não está verificado contra o jogo original).

---

## Redesenho de classes e itens (marcador, sem data)

**Decidido em 2026-08-28.** As sete classes e o conceito de itens que vieram do
DungeonGuys original são **provisórios** no DungeonGuys2. O conceito novo de classe será
estudado depois, com calma, junto com o de itens.

Até lá a regra é: **ficar o mais parecido possível com o original**. Não ajustar
balanceamento de classe ou item, não acrescentar classe, não mudar custo, raridade ou
efeito — qualquer melhoria vira trabalho jogado fora quando o conceito novo entrar.

Isso fecha, por ora, a questão da trava do coprobo que o `docs/PARIDADE.md` deixara em
aberto: não mexer, fica como no original.

Vale saber, para quando o redesenho começar, o que hoje depende do formato atual:
`src/sim/defs/classes.ts` (as 7 classes, 3 tiers cada), `src/sim/defs/items.ts` e
`src/sim/equipment-catalog.ts`, os filtros de elegibilidade em `src/sim/equipment.ts`, o
filtro de bênção por tipo de dano em `src/sim/xp.ts`, e os desbloqueios em
`src/ui/settings.ts`. O `dmgKind` (`melee|arrow|elemental`) é o vocabulário que amarra
classe, bênção e equipamento — provavelmente o primeiro conceito a revisitar.

---

## Bloqueia o Marco 2

### `Math.sin`, `Math.cos` e `Math.atan2` são implementation-defined

O spec do co-op afirma: *"se `sim/` roda no Node dentro de um teste, roda idêntico na
máquina do host e na do cliente — é essa propriedade, e só ela, que torna predição e
reconciliação possíveis no Marco 2."*

A afirmação não se sustenta hoje. O ECMAScript não especifica a precisão de `sin`, `cos`,
`atan2` nem `hypot` — só `sqrt` é IEEE-exato. V8, SpiderMonkey e JSC não concordam no
último ulp, e nem todas as versões do V8 entre si. Um host no Chrome e um cliente no
Firefox divergem: devagar, e depois de repente. No Marco 2 isso vai parecer bug de
netcode.

O Marco 0 fechou a parte barata — os 14 `Math.hypot` de `sim/` viraram
`Math.sqrt(dx*dx+dy*dy)`, e a doutrina está registrada no cabeçalho de
`src/sim/constants.ts`. Faltam `sin`/`cos`/`atan2`, espalhados por `sim/`.

**Duas saídas, e a escolha é de arquitetura:** um `sim/math.ts` com implementações
próprias e determinísticas, ou uma decisão escrita de que os pares precisam compartilhar
o mesmo motor de JavaScript. Decidir **antes** de o Marco 2 ligar predição — depois,
qualquer troca reequilibra todas as constantes que dependem dessas funções.

**Nenhum teste desta suíte pode pegar essa classe de divergência**, porque
`tests/determinism.test.ts` e `tests/run.test.ts` comparam dois mundos no *mesmo
processo*, por construção.

### `app/input.ts` também usa `Math.hypot` e `Math.atan2`

`src/app/input.ts:64,111,113` e o `aimAngle()` em `:79,82`. A doutrina de
`sim/constants.ts` cobre só `sim/`, e isso é seguro **apenas se** o Marco 1 transmitir
`InputState` pela rede em vez de cada par recalcular o seu. Tornar isso uma decisão
explícita do Marco 1.

### `World` ainda não faz round-trip por JSON

O Marco 0 fechou o buraco de valor: o `hp: Infinity` das colunas virou
`INDESTRUCTIBLE_HP = Number.MAX_SAFE_INTEGER` (`src/sim/arena.ts:19`), que sobrevive a
`JSON.stringify`/`parse`. Mas `world.rng` é instância de classe
(`src/sim/world.ts:10`), então `JSON.parse(JSON.stringify(world))` ainda não devolve um
`World` utilizável — o caminho pretendido é `rng.save()`/`rng.restore()`
(`src/sim/rng.ts:56-63`). Isso é desenho de snapshot do Marco 1, não defeito do Marco 0.

---

## Estrutura

### `src/sim/` é um componente fortemente conexo de 8 módulos

São cinco ciclos de import, não os quatro que o ledger registrou — o não documentado é
`enemies → player → combat`. Compostos, formam um nó indivisível:
`{enemies, player, combat, special, boss, xp, run, shop}`, 8 dos 15 módulos de `sim/`.

**É seguro como está** — toda referência cruzada é em corpo de função, e os live
bindings do ESM dão conta. Mas as consequências são reais: qualquer constante futura
avaliada em tempo de módulo que cruze o nó vira `undefined` em silêncio; importar um
módulo de `sim/` puxa os oito; e extrair um bundle headless do sim para o host vira
tudo-ou-nada.

**O corte mais barato é a aresta `xp → run`:** `closeLevelUp` chama `victory` só para
resolver `pendingAfterLevelUp`. Subir essa resolução para o `step()` remove `xp → run` —
e **só** essa aresta. Fazer antes de o Marco 1 acrescentar arestas.

**Correção registrada na fase 1 (2026-08-31).** A redação anterior deste item afirmava que
`run ↔ shop` cairia junto com o corte de `xp → run`. **Isso está errado**, e contradiz a
medição do SCC feita na pesquisa da fase 1: são dois ciclos independentes, e o segundo
sobrevive ao primeiro corte. Ver o item seguinte.

### O segundo corte: `run ↔ shop` é um ciclo genuíno e independente

`closeShop → startNextWave` (`src/sim/shop.ts:57`) e `checkWaveComplete → openShop`
(`src/sim/run.ts:288`) formam um ciclo próprio entre `run.ts` e `shop.ts`. Ele **não** cai
com o corte da aresta `xp → run`: nenhuma das duas arestas que o fecham passa por `xp.ts`,
e os cabeçalhos dos dois arquivos já o descrevem como um ciclo de dois arquivos
(`src/sim/shop.ts:26-29`, `src/sim/run.ts:38-39`).

Depois do corte de `xp → run`, o nó de 8 módulos se abre em **5 + 2** componentes —
`{enemies, player, combat, special, boss}` e `{run, shop}` — com `xp.ts` livre. **A fase 1
para aí, de propósito:** cortar `run ↔ shop` exigiria subir para o `step()` a decisão de
abrir a loja e a de começar a próxima wave, e a fase 3 vai acrescentar arestas nessa mesma
região quando o snapshot e a fronteira de autoridade entrarem. Cortar agora seria refazer
o corte depois.

**Fazer quando:** a fase 3 estabilizar a fronteira de autoridade — ou antes disso, se
alguma constante avaliada em tempo de módulo precisar cruzar `run ↔ shop`, que é o modo de
falha real deste ciclo e o único que é silencioso.

### A tela do forge mora em `app/`

`src/app/forge.ts:193-239` renderiza e liga a tela do forge — markup de DOM vivendo em
`app/`. A dependência inversa (`ui/settings.ts` importando `app/save` e `app/audio`) é a
direção saudável: apresentação dependendo de serviço.

Não há ciclo de import entre `app/` e `ui/` — são arquivos diferentes e o grafo é
acíclico nessa fronteira. Então nada quebra hoje.

**Escrever a regra:** `sim/` não importa para fora (garantido por lint e por
`tests/purity.test.ts`); `app/` não importa `ui/`. Depois mover o markup do forge para
`ui/forge.ts`, deixando `buildRunConfig` e `finishRun` em `app/`.

---

## Cobertura de testes

Ordenado pelo que o Marco 1 encosta primeiro.

- **`updateBossPattern` não tem teste nenhum.** Telegraph → charging → recover, a saída
  antecipada do wall-slam, o limiar de enrage em 30% de HP e o `cdMult` que ele aplica —
  a máquina de estados mais complexa de `sim/`, verificada só por um revisor lendo. Os
  ramos endless de `bossPlanForWave` (`src/sim/boss.ts:149-156`) idem.
- **O caminho "owner sumiu" dos projéteis não tem teste.** É o único ramo de
  `bullets.ts` que existe por causa de multiplayer, então o Marco 1 é exatamente quando
  passa a importar.
- **`app/` e `ui/` não têm teste nenhum** (~1.400 linhas). Defensável no Marco 0 — não há
  jsdom na stack. Mas `recordRun` de `src/app/save.ts` é lógica pura sem DOM e sairia em
  dez minutos.
- **`tests/world.test.ts` "nextId é único e crescente"** exercita só `w.nextId++`, que é
  semântica de JavaScript, não lógica do sim. Reapertar quando existir um alocador de id
  de verdade.

Lição que vale registrar: a lacuna de poison passou 20 tasks despercebida porque o teste
se chamava `'burn e poison drenam hp e expiram'` e testava só burn. **Um teste com nome
enganoso é pior que teste faltando** — ele some da lista de lacunas de quem procura por
nome.

---

## Dependências

### Vulnerabilidades no servidor de desenvolvimento

`npm audit` acusa 3 moderadas + 1 **alta** (`vite`: bypass de `server.fs.deny` em
caminhos alternativos do **Windows**, GHSA-fx2h-pf6j-xcff) + 1 **crítica** (Vitest UI,
GHSA-5xrq-8626-4rwp — inalcançável, `vitest run` nunca sobe a UI).

**Nada disso vai para `dist/`.** Mas o aviso do esbuild ("qualquer site pode mandar
requisição ao dev server e ler a resposta") somado ao bypass de `fs.deny` no Windows, numa
máquina Windows rodando `vite dev`, é exposição real enquanto o servidor está no ar.

Mitigação é grátis: prender o dev server em localhost e não navegar em site desconhecido
com ele ligado. A correção de verdade exige o major do Vite (6 ou 7) — agendar junto com
o Marco 1, não no meio de outra coisa.

---

## Pequenos, sem pressa

- `src/sim/types.ts:268` / `src/sim/world.ts:37` — `nextWaveDelay` é declarado,
  inicializado em 3000 e **nunca lido**. Estado morto no tipo que o Marco 1 vai serializar.
- `src/sim/stats.ts:65-76` — `STAT_LABELS` e `PCT_STATS` são vocabulário de apresentação
  morando na camada pura, consumidos só por `ui/shop.ts` e `ui/screens.ts`. Não viola a
  pureza (não há DOM), mas é dado de `ui/` em `sim/`.
- **Doutrina de `rng.chance()` dividida.** Três cabeçalhos (`run.ts`, `shop.ts`,
  `boss.ts`) mandam nunca usar `chance()`, porque ele pula o sorteio em `p <= 0`; mas
  `player.ts:124` e `enemies.ts:389` usam. O esquiva-base é 0 em toda classe, então esse é
  o caminho **comum**, não uma borda. Sem impacto real (o PRNG do porte não é o
  `Math.random` do original de qualquer jeito), mas vale alinhar para que a invariante que
  três cabeçalhos afirmam seja verdadeira.
- `src/ui/settings.ts` carrega ~11 responsabilidades em 323 linhas. Dividir quando algo
  dentro dele precisar mudar, não por contagem de linha.
- `tests/purity.test.ts` tem dois pontos cegos estreitos: um token escondido em `${…}`
  dentro de template literal, e um literal de regex contendo `//`, que apagaria o resto
  daquela linha. Hoje não há regex literal em `src/sim/`; só um comentário garante isso.
