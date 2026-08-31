# Phase 1: Formato e costuras - Research

**Researched:** 2026-08-31
**Domain:** determinismo de ponto flutuante entre motores JS, formato de replay/snapshot,
extração de monorepo, versionamento por hash de conteúdo, spec de assets validada em CI
**Confidence:** HIGH (quase tudo foi medido neste repositório ou executado nos quatro motores)

> Rótulos de estrutura ficam em inglês porque são lidos por ferramenta.
> O conteúdo é em português, como o resto dos documentos do projeto.
> Comentários de código, quando aparecem nos exemplos, ficam em inglês.

---

<user_constraints>
## User Constraints (from CONTEXT.md)

`\.planning/phases/01-formato-e-costuras/01-CONTEXT.md` é o registro autoritativo. Copiado
aqui na íntegra porque é o contrato do planejador.

### Locked Decisions

**Trigonometria e quantização de input (FORM-04, FORM-06)**

- **D-01:** `sim/math.ts` implementa `sin`, `cos` e `atan2` como **port de polinômio em JS puro**
  (fdlibm — FreeBSD msun para `sin`/`cos`, Go `math/atan2` para `atan2`), construído só sobre
  operações exatas por spec. Não é tabela de lookup. Motivo: aceita qualquer ângulo em radianos,
  cobre também os ângulos internos do sim (spread de tiro, anéis de spawn, padrão de chefe, tiro de
  inimigo) que não vêm de input nenhum, e não exige retuning de mira. Os ~30 call sites viram troca
  de import.
- **D-02:** `InputState.aim` **continua `number` em radianos**. A quantização acontece em
  `app/input.ts`, arredondando ao passo de `2π/65536` (0,0055°) **antes** de o sim ver o valor. O log
  grava o `uint16`; recarregar multiplica de volta — multiplicação IEEE-754 é exatamente arredondada,
  então o valor volta bit-idêntico. Nenhum consumidor de ângulo dentro de `sim/` muda de unidade.
- **D-03:** `InputState.move.x` e `.move.y` são **quantizados em int8** em `[-127, 127]`, valor
  efetivo `n/127`. Isso tira o resultado de `Math.hypot` (implementation-defined) do caminho do dado
  gravado — o que o sim vê é o inteiro, não o float do motor. A magnitude parcial do joystick
  analógico continua preservada. Fecha o pacote de 6 bytes por tick.
- **D-04:** **Política de preenchimento de buracos:** quando o input de um jogador não chega a tempo
  do tick, a autoridade repete o **último input conhecido** daquele jogador e grava isso no log. A
  política é parte do formato, não do código de rede.
- **D-05:** **Regra escrita do protocolo:** o `InputState` quantizado é o que atravessa a rede e o
  que entra no log. **Nenhum peer recalcula** mira ou movimento a partir de estado do mundo. Isso é o
  que torna seguro `app/input.ts` continuar usando `Math.hypot` e `Math.atan2`
  (`:64,79,82,111,113`). Auto-aim continua fora de `sim/`.

**`SIM_VERSION` e versionamento (FORM-03, FORM-11, FORM-12)**

- **D-06:** O hash de conteúdo do `SIM_VERSION` cobre **apenas a simulação** — os módulos de `sim/`
  mais `sim/defs/` (classes, inimigos, itens, bênçãos, mutadores) e as constantes. Um ajuste de HUD,
  de áudio ou de sprite **não** fecha a temporada. Rebalancear um inimigo **fecha** — e isso é
  correto, porque muda o resultado de um replay.
- **D-07:** O valor é o **hash do bundle emitido de `packages/sim`**, com o build fixado para ser
  reproduzível (sem timestamp, sem caminho absoluto, ordem de módulos estável) e a versão da
  toolchain pinada no `package-lock.json`. Consequência aceita: subir Vite ou TypeScript fecha a
  temporada — evento agendado, não surpresa.
- **D-08:** Versões diferentes **recusam sempre**, com as duas versões e a razão na tela
  (recarregar). **Não existe bypass de dev.** Vale para entrada em sala e para carregar replay.
  Dessincronização silenciosa é a falha mais cara de diagnosticar do projeto.
- **D-09:** `PROTOCOL_VERSION` é **separado** do `SIM_VERSION` e **nasce nesta fase**, em
  `packages/protocol`, junto com as tabelas de enum congeladas e append-only de FORM-11. Ciclos de
  vida distintos: `SIM_VERSION` fecha temporada; `PROTOCOL_VERSION` só impede conexão. FORM-12 (o
  protocolo não contém a palavra "host") vale para esse pacote.

**Artefato de run e serialização (FORM-02, FORM-06, FORM-07, FORM-08)**

- **D-10:** O artefato de run é um **envelope JSON legível** (seed, `RunConfig`, `SIM_VERSION`, score
  alegado, `hashWorld` final) com o **log de inputs como blob binário em base64** dentro dele. Dá
  para abrir um replay num editor sem ferramenta, e o log — que é 99% dos bytes — fica compacto.
  Orçamento: 20-40 KB gzipado por run de 20 min.
- **D-11:** O replay **parte da seed**: o verificador roda `createWorld(config)` + `generateArena` e
  só depois aplica o log. Não há snapshot inicial embutido e **não há checkpoints periódicos de
  hash** no formato. Se o setup divergir, a verificação falha no tick 0 em vez de mascarar o
  problema.
- **D-12:** O log é gravado **por tick, só o que mudou** (delta + RLE): um jogador só aparece no tick
  em que o `InputState` dele muda. A ordem dentro do tick é a ordem canônica do `RunConfig`. É a
  tabela **resolvida pela autoridade**, não o tráfego que chegou.
- **D-13:** `world.players` **continua `Record<string, Player>`** — serializa por JSON sem tratamento
  especial. `step()` passa a iterar `world.config.players` (array, ordem canônica) indexando o
  Record, em vez de `Object.keys(world.players)` (`step.ts:19`). A ordem canônica vive no manifesto
  da run, que é onde o replay já vai procurar.

**Estrutura de pacotes (FORM-04, FORM-10)**

- **D-14:** `packages/sim` e `packages/protocol` são **extraídos nesta fase** com npm workspaces. Não
  é opcional dado D-07: "hash do bundle emitido de `packages/sim`" exige que a simulação tenha um
  artefato de build próprio.
- **D-15:** O rearranjo é de **apenas os dois pacotes**. `src/app`, `src/render`, `src/ui`,
  `index.html` e `vite.config.ts` **ficam na raiz**. `apps/web` e `apps/server` não nascem aqui: a
  fase 2 mexe em `base`, service worker e deploy, e mover o app agora seria migrar duas coisas na
  mesma semana.
- **D-16:** A pureza de `sim/` passa a ter **três guardas independentes**:
  `packages/sim/tsconfig.json` com `"lib": ["ES2022"]` (sem `DOM`) — o compilador recusa `window` e
  `document`; as regras de lint atuais **continuam** (elas cobrem `Math.random`, `Date.now` e os
  imports proibidos, que nenhum `lib` pega); e `tests/purity.test.ts` continua, agora asserindo
  também `dependencies: {}`.
- **D-17:** **Ordem interna da fase:** a extração dos pacotes vem **primeiro de tudo** — antes do
  corte da aresta `xp -> run` e antes do `sim/math.ts`. Assim o `sim/math.ts` nasce no lugar
  definitivo e os hashes-ouro são refeitos uma vez só. A sequência já travada pelo roadmap (corte do
  SCC **antes** do `math.ts`; cobertura de `updateBossPattern` **junto** com o `math.ts`) permanece.

**Spec técnica de assets (FORM-09)**

- **D-18:** **Unidade lógica congelada: 1 unidade = 1 pixel renderizado.** `WORLD` 2400x1600 continua
  sendo 2400x1600 px de piso pré-renderizado — os mesmos ~15 MB de hoje. Toda constante de `sim/`
  (alcance, `COIN_MAGNET`, hitbox) continua significando pixel, e nada de balanceamento se move por
  mudança de unidade.
- **D-19:** **Resolução base do personagem: 32x48 px, desenhado a escala 1.** O personagem ocupa
  exatamente o mesmo espaço na tela que hoje (32x56 desenhados a partir de 16x28 a
  `SPRITE_SCALE = 2`), com quatro vezes o detalhe. Enquadramento, campo de visão e sensação de escala
  ficam idênticos. `SPRITE_SCALE` sai do código como conceito.
- **D-20:** **`TILE` de desenho = 32** (75x50 tiles no mundo). Os tiles novos são 32x32 nativos em vez
  de 16x16 dobrados. Divide exato nos dois eixos de `WORLD` — 48 e 64 não dividem. `TILE` deixa de
  aparecer nas contas de `world.play`, que ganha `PLAY_MARGIN` própria (decisão já travada a
  montante), e passa a ser puramente de desenho.
- **D-21:** A spec exige **apenas `idle` e `run`** por personagem — exatamente o que
  `render/entities.ts` desenha. Acerto continua sendo tint e morte continua sendo fade. A **contagem
  de quadros por animação é declarada no manifesto**, não fixa em 4, para que `render/sprites.ts`
  pare de ter coordenada escrita à mão sem prender o artista a um número.
- **D-22:** **Rampa de recolor obrigatória.** Paleta livre para o artista, mas cada personagem
  declara no manifesto quais cores são a rampa de roupa, e o validador do CI recusa um sprite que não
  a declare. Preserva a troca de cor por jogador que `render/sprites.ts` já faz e que CONTA-06 vai
  precisar.
- **D-23:** **A hitbox manda em `sim/defs`, o CI confere.** A hitbox continua sendo código de
  simulação — versionada pelo `SIM_VERSION`, revisável em diff. O manifesto declara o pivô e as
  dimensões visuais, e o validador recusa um sprite que não cubra a hitbox declarada em
  `sim/defs/enemies.ts`. O agente de arte **não** mexe em balanceamento, e o `SIM_VERSION` não passa
  a depender de arquivo de arte.
- **D-24:** **Manifesto JSON por spritesheet**, contra um **JSON Schema versionado** que mora neste
  repositório. O validador vive em `tools/assets/` e roda no CI **deste** repo, para que o agente de
  arte receba o erro sem humano no meio. Sheets independentes: um lote errado não bloqueia os outros.
- **D-25:** **Entrega por cópia commitada.** PNG-32 sem premultiply e os manifestos vivem commitados
  em `public/assets/`, atualizados por PR do agente de arte. Nada de submódulo, nada de pacote
  publicado. O build fica offline e reproduzível — que é o que o hash do `SIM_VERSION` e o precache
  do PWA precisam.

**Soul gold e save local (FORM-05)**

- **D-26:** O `progress.soulGold` gravado hoje em `dungeonguys2_save_v1` é **descartado**. O ledger
  nasce vazio, sem código de migração e sem tipo de evento `legacy`. O jogo nunca foi publicado sob
  domínio próprio e o único save real é o do desenvolvedor.
- **D-27:** O `eventId` de cada concessão é um **ULID gerado no cliente**, no momento do evento; o
  servidor (fase 6) deduplica por `UNIQUE(id)`. Funciona offline, funciona para qualquer origem de
  soul gold (fim de run, missão, selo de temporada) com uma regra só, e o próprio id já carrega ordem
  temporal. Sincronizar duas vezes é no-op.
- **D-28:** **O gasto também é evento**, negativo, no mesmo ledger, com id próprio. Saldo = soma de
  tudo. É o que faz "restaurar um save antigo não ressuscita saldo já gasto" (critério 3 da fase 6)
  funcionar sem caso especial, e dá o log de auditoria sem o qual não existe rollback. O nível do
  forge vira estado derivado, gravado na mesma transação que o gasto.
- **D-29:** O ledger mora em **chave própria `dungeonguys2_ledger_v1`**, separada do save. **Regra de
  compactação decidida agora** (é formato), mesmo que o servidor só exista na fase 6: eventos já
  confirmados pelo servidor colapsam num único evento de saldo consolidado com a marca d'água da
  confirmação; só os pendentes ficam individualmente.

**Decisões escritas, não implementadas (FORM-01)** — viram ADRs numerados em `docs/adr/`:

- **D-30:** **Identidade em três espaços:** `accountId` (ULID durável do servidor, nunca entra no
  `World`) / `playerId` (`p0..p3`, slot atribuído pela autoridade, é o que o replay conhece) /
  `peerId` (handle do transporte, morre com a conexão).
- **D-31:** **A conta local do primeiro boot recebe um ULID local marcado como não-reivindicado.** O
  login da fase 6 troca-o por um `accountId` do servidor e grava o de origem no registro do claim —
  reivindicar duas vezes é detectável e reivindicar com uma conta que já tem progresso é recusável
  com explicação (critério 4 da fase 6). Não é um quarto espaço de identidade: é o mesmo campo
  `accountId` com um marcador de origem. Os eventos do ledger já nascem carimbados com ele.
- **D-32:** **Política de merge por campo do save:** recordes por classe fundem por
  `MAX(local, servidor)`; missões e classes destravadas fundem por **união**; soul gold é o ledger de
  D-27/D-28; entradas de ranking vão para fila local e verificação assíncrona.
- **D-33:** **Settings — identidade sincroniza, preferências não.** `name` e `colors` sincronizam por
  última escrita com carimbo de tempo (CONTA-06 exige que cheguem aos amigos na sala sem redigitar).
  `volume`, `mute`, `autoAim`, `shake` e `mode` ficam **por aparelho**.
- **D-34:** **Esquema `(temporada, SIM_VERSION)`** escrito antes do primeiro board. Modelo Factorio:
  mudança de `SIM_VERSION` fecha a temporada e abre outra, com o placar anterior preservado e
  rotulado; replay de outra versão é recusado com a razão na tela.
- **D-35:** **Categorias do placar:** modo x tamanho de grupo x perfil, nunca misturados. v1 rankeia
  **só solo**; as outras dimensões existem como coluna desde o primeiro board para que abrir co-op
  depois não seja migração.
- **D-36:** **Teto do forge em runs rankeadas: perfil normalizado — forge desligado.** Runs rankeadas
  rodam com forge zerado. O board fica comparável, um jogador novo compete no dia 1, e a superfície
  de verificação encolhe: o servidor reconstrói o `RunConfig` sem precisar confiar em nível de forge
  nenhum. É o valor que a coluna "perfil" carrega em v1.
- **D-37:** **Política de queda do host: checkpoint de progressão durável por wave concluída.** Cada
  wave concluída credita progressão na conta de cada participante na hora; a queda perde só a wave em
  andamento. Sem migração de host, sem submissão de run parcial. Formato do checkpoint: um registro
  por `(run, wave, jogador)`.
- **D-38:** **Missão destravada: a cadeia de quem criou a sala define** o que dá para jogar; quem não
  destravou entra como convidado; **todos os presentes na conclusão recebem crédito** na própria
  conta. "Carregar" um amigo é feature aceita por escrito.

### Claude's Discretion

- **CI e hashes-ouro cross-engine** (critério de sucesso 1). Hoje `.github/workflows/` só tem
  `deploy.yml` — não existe workflow de teste. Onde os hashes-ouro moram, como são versionados, quem
  pode refazê-los, e como a atualização em massa causada pelo `sim/math.ts` é feita de forma
  auditável. Playwright com versão fixa (um upgrade troca as builds dos motores, que é justamente a
  variável do teste).
- **Como o corte da aresta `xp -> run` é feito** (SCC de 8 -> 6 módulos).
- **Como `updateBossPattern` ganha cobertura** — junto com o `math.ts`, não depois.
- **`app/stepper.ts`** (FORM-10): como o passo fixo é extraído de `app/loop.ts:17-40`, que hoje usa
  `performance.now()` e `requestAnimationFrame` diretamente.
- **Forma de `world.objectives`** (FORM-08): que seja campo do `World` e não evento drenável está
  decidido; o formato do campo é desenho do planejador, e ele entra no round-trip de
  `sim/serialize.ts` como qualquer outro campo.
- **Promoção de `hashWorld` e da serialização** de `tests/helpers.ts:38-62` para
  `packages/sim/src/serialize.ts`, incluindo a normalização de `-0` (hoje ausente).
- **Formato exato do JSON Schema do manifesto** e a estrutura de `tools/assets/`.
- **Numeração e nomes dos arquivos de ADR** dentro da convenção `docs/adr/NNNN-slug.md`.

### Deferred Ideas (OUT OF SCOPE)

- **Verificação amostrada por checkpoint no ranking está fora.** D-11 elimina essa opção para a fase
  9. O **teto de duração para endless no ranking** terá que ser um teto explícito comunicado na UI.
- **`apps/web` e `apps/server`** — layout completo do monorepo adiado (D-15). Reavaliar na fase 2 ou
  3.
- **Piso em chunks sob demanda** — descartado nesta fase (D-18).
- **Animações de `hit`, `death` e `attack`** — fora da spec de assets v1 (D-21).
- **`sim/math.ts` com tabela de lookup** (opção B) — recusado em D-01.
- **Auto-aim dentro de `sim/`** — recusado em D-05.
- **Bypass de versão em desenvolvimento** — recusado em D-08.
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Descrição (literal de REQUIREMENTS.md) | Suporte desta pesquisa |
|----|----------------------------------------|------------------------|
| FORM-01 | Três espaços de identidade (`accountId`/`playerId`/`peerId`); o replay depende só do `playerId` | § Architecture Patterns — Padrão 7 (ADRs) + § Don't Hand-Roll (ULID) |
| FORM-02 | `RunConfig.players[]` com id, nome, classe e forge; `step()` itera nessa ordem canônica | § Pitfall 4 (ordem de `Object.keys` medida), § Code Example 5 |
| FORM-03 | `SIM_VERSION` derivado de hash de conteúdo do artefato buildado | § Architecture Patterns — Padrão 4 (build em duas etapas), reprodutibilidade **medida** |
| FORM-04 | Resultado bit-idêntico no navegador e no Node, com `sim/math.ts` sobre operações exatas | § Summary (divergência **provada** nos 4 motores), § Padrão 1, § Code Example 1 |
| FORM-05 | Soul gold por eventos idempotentes com id próprio; saldo derivado | § Don't Hand-Roll (ULID sem dependência), § Padrão 6 |
| FORM-06 | Log de inputs quantizado na captura, tabela resolvida pela autoridade | § Padrão 2 (pacote de 6 bytes), § Pitfall 2 (faixa do `uint16`), § Code Example 2 |
| FORM-07 | `World` serializa/desserializa sem perda, RNG incluído | § Padrão 5, § Pitfall 5 (`-0` e o furo do hash), medições de tamanho |
| FORM-08 | Objetivos de missão como campo do `World`, não evento drenável | § Padrão 5 (o que entra em `serialize.ts`) |
| FORM-09 | Spec de assets publicada + validador de manifesto no CI | § Padrão 8, § Code Example 6, § Pitfall 7 (relação hitbox↔sprite medida) |
| FORM-10 | Passo fixo separado de `requestAnimationFrame` | § Padrão 3, § Code Example 3 |
| FORM-11 | Enums do protocolo congelados e append-only, verificado por snapshot | § Padrão 7, § Validation Architecture |
| FORM-12 | O protocolo não contém a palavra "host" | § Padrão 7 + teste de lint/snapshot em § Validation Architecture |
</phase_requirements>

---

## Project Constraints (from CLAUDE.md)

Diretivas acionáveis extraídas de `./CLAUDE.md`. Têm a mesma autoridade que as decisões travadas.

| # | Diretiva | Onde esta pesquisa a respeita |
|---|----------|-------------------------------|
| C-1 | `dependencies: {}` no jogo publicado — invariante | Nenhuma recomendação adiciona dependência de runtime. `@stdlib` e `ajv` são **devDependencies**, e ULID é escrito à mão (§ Don't Hand-Roll) |
| C-2 | `src/sim/` puro: sem DOM, `window`, `navigator`, `localStorage`, `performance`, `Date`, `Math.random`, `rAF`, `setTimeout`; sem importar `render/`, `ui/`, `app/` | Verificado: `src/sim` compila limpo com `"lib": ["ES2022"], "types": []` (exit 0). Zero `Math.random` e zero `Math.hypot` em código real |
| C-3 | `DT_MS = 1000/60`; `TICK_FACTOR = DT_MS / 16.67` | Nada nesta pesquisa toca neles |
| C-4 | `WORLD = { w: 2400, h: 1600 }`, `TILE = 32` | D-18/D-20 confirmam; a pesquisa só mede a consequência sobre hitbox×sprite |
| C-5 | Netcode P2P host-autoritativo com fronteira desenhada | FORM-12 tratado como regra de vocabulário do `packages/protocol` |
| C-6 | Assets vêm de repositório separado; spec precede produção | § Padrão 8 desenha a spec + validador antes de qualquer arte |
| C-7 | Determinismo **opção A** já decidida (fdlibm vendorizado; não ponto fixo, não WASM) | § Padrão 1 detalha o port e **prova** que ele resolve |
| C-8 | Armadilhas já documentadas: `Map` vs objeto, `-0` no hash, `rng.save/restore`, validação de `InputState` dentro de `step()`, `Math.hypot` em `app/input.ts` | Cada uma reavaliada contra o código real em § Common Pitfalls — **duas estavam invertidas** |
| C-9 | Monorepo alvo `packages/sim`, `packages/protocol`, `apps/web`, `apps/server` | D-15 limita a esta fase os dois `packages/` |
| C-10 | Toolchain: Vite 7.3.6, TS 6.0.3, Vitest 4.1.11, `@playwright/test` 1.62.1 pinado | Versões reconferidas no registro npm hoje (§ Standard Stack) |
| C-11 | Comentários de código em inglês; documentos e commits em português | Este documento e os exemplos seguem a regra |
| C-12 | GSD: nada de edição direta fora de um comando GSD | Esta pesquisa não editou nada do repositório (`git status` limpo) |

---

## Summary

Esta fase tem um item que domina todos os outros, e ele deixou de ser hipótese. **Rodei a
simulação real deste repositório, bundlada, por 3.000 ticks a partir da mesma seed e com o mesmo
roteiro de inputs, em Node 24, Chromium 151, Firefox 153 e WebKit 26.5. Saíram três `hashWorld`
diferentes.** Node deu `9f870f80`, Chromium `18539474`, Firefox e WebKit `e934dfd7`. A primeira
divergência de hash aparece no **tick 361** para o Chromium (6 segundos de jogo) e no **tick 541**
para Firefox/WebKit (9 segundos). Depois substituí `Math.sin`, `Math.cos` e `Math.atan2` por ports
fdlibm em JS puro — sem tocar em mais nada — e os **quatro motores convergiram em `9f870f80`**. A
opção A não é a mitigação recomendada de uma dívida teórica: é a correção medida de uma falha que já
existe e que derrubaria a fase 4 em menos de dez segundos de partida.

O resto da fase é congelar formatos, e a pesquisa encontrou **três afirmações herdadas que não se
sustentam contra o código**. (1) Cortar só a aresta `xp → run` **não** reduz o SCC: rodei Tarjan
sobre o grafo de imports de valor e o componente continua com os mesmos 8 módulos, porque
`xp → shop → run → enemies → xp` fecha sozinho. É preciso cortar as **duas** saídas de
`closeLevelUp`, e o resultado é 5 + 2, não 6 — `run ↔ shop` **não** cai junto, ao contrário do que o
`BACKLOG.md` diz. (2) A normalização de `-0` no `hashWorld` está descrita ao contrário:
`JSON.stringify(-0)` já produz `"0"`, então o hash de hoje é imune; o problema real é que o
round-trip **perde** o sinal e o hash, por usar o mesmo caminho lossy, **não consegue detectar a
perda** — um teste "round-trip verificado por hash" passaria com o dado corrompido. (3) A contagem de
call sites de trigonometria é **27** (12 `sin`, 12 `cos`, 3 `atan2`, em 7 arquivos), não 26 nem 30:
os outros eram ocorrências dentro de comentários.

O terceiro eixo é o custo. O port fdlibm com o domínio restrito a `|x| < 2^20` — que cobre com folga
qualquer ângulo que este jogo produz — sai em **~573 linhas de código**, porque dá para descartar o
`kernel_rempio2` de Payne-Hanek (207 linhas, o trecho mais arriscado). O bundle de `packages/sim`
já é **byte-reproduzível** hoje (três builds, mesmo sha256, zero caminho absoluto), o que valida a
premissa de D-07 — mas o hash **não pode morar dentro do artefato que ele descreve**, então o
`SIM_VERSION` precisa de um build em duas etapas. E a verificação de replay é folgada: uma run de 20
minutos (72.000 ticks) re-executa em **0,29 s** neste hardware.

**Primary recommendation:** siga a ordem de D-17 (pacotes → corte do SCC → `math.ts` + cobertura de
`updateBossPattern` → formatos → spec de assets), e faça do teste cross-engine o **primeiro**
artefato executável da fase, rodando contra o código de hoje. Ele vai falhar imediatamente — é assim
que se sabe que ele funciona — e vira o portão que valida o `sim/math.ts` no momento em que ele
entra.

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Trigonometria determinística (`sin`/`cos`/`atan2`) | `packages/sim` (núcleo puro) | — | É a propriedade que o multiplayer compra; tem de viver dentro do limite versionado pelo `SIM_VERSION`. Nunca em `app/` |
| Quantização de `aim` e `move` | `app/input.ts` (captura) | `packages/protocol` (formato do byte) | D-02/D-03: a quantização é **na captura**, antes de o sim ver o valor. O sim continua consumindo `number` |
| Auto-aim, `nearestEnemy`, `hypot` de teclado | `app/input.ts` | — | D-05: fica fora de `sim/`, e é seguro só porque o `InputState` trafega em vez de ser recalculado |
| Serialização do `World` (`saveWorld`/`loadWorld`/`hashWorld`) | `packages/sim` | — | Precisa conhecer `Rng` e a forma interna; hoje mora em `tests/helpers.ts:38-62`, que é o lugar errado |
| `RunConfig` por jogador e ordem canônica | `packages/sim` (tipo) | `app/forge.ts` (construção) | `RunConfig` já é o único canal de entrada do mundo externo; `buildRunConfig` já vive em `app/` |
| Passo fixo / acumulador | `app/stepper.ts` (novo) | `app/loop.ts` (só o `rAF`) | FORM-10: o passo tem de ser dirigível por teste e por servidor sem relógio de tela |
| `SIM_VERSION` (cálculo) | Script de build (`tools/`) | `packages/sim` (consome como artefato) | O hash de X não pode morar dentro de X |
| `PROTOCOL_VERSION` e enums congelados | `packages/protocol` | — | D-09: ciclo de vida distinto do `SIM_VERSION` |
| Ledger de soul gold + ULID | `app/` (novo `app/ledger.ts`) | `packages/protocol` (formato do evento) | `sim/` não pode ver `localStorage` nem `Date`; o ledger é estado de conta, não de mundo |
| Validador de manifesto de assets | `tools/assets/` (Node, devDependency) | CI | D-24: fora do bundle do jogo, então `ajv` é permitido |
| Hashes-ouro cross-engine | `tests/` + CI | `packages/sim` (produz o valor) | O ouro é dado de teste versionado, não código de produção |
| Desenho de sprite, `SPRITE_SCALE`, recolor | `render/` | manifesto de assets | D-19/D-22: a arte não entra no `SIM_VERSION`; a hitbox continua em `sim/defs` |

---

## Standard Stack

### Core

Tudo abaixo é **devDependency**. O jogo publicado continua com `dependencies: {}` (C-1).

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `vitest` | **4.1.11** | Runner de teste, agora também em modo navegador | Já é o runner do projeto (2.1.9 instalado, 244 testes verdes). O 4.x traz `browser.instances`, que roda **o mesmo arquivo de teste** em Chromium, Firefox e WebKit sem escrever harness `[CITED: docs Vitest — guide/browser/multiple-setups]` |
| `@vitest/browser-playwright` | **4.1.11** | Provider Playwright do modo navegador do Vitest | É o pacote oficial que substitui o antigo `provider: 'playwright'` string. Peer: `vitest@4.1.11`, `playwright@*` `[VERIFIED: npm registry]` |
| `playwright` / `@playwright/test` | **1.62.1** (**pinar exato**) | Builds de Chromium/Firefox/WebKit | As builds dos motores **são a variável sob teste**. `^1.62.1` reintroduz a não-determinismo que o teste existe para pegar. Use `"playwright": "1.62.1"` sem circunflexo |
| `vite` | **7.3.6** | Build do cliente e de `packages/sim` | Fecha o GHSA-fx2h-pf6j-xcff do backlog (`npm audit` hoje: 3 moderate + 1 high + 1 critical). O 8.2.2 existe mas é novíssimo `[VERIFIED: npm registry]` |
| `typescript` | **6.0.3** | Compilador | **Teto duro**: `typescript-eslint@8.68.0` declara peer `typescript >=4.8.4 <6.1.0`. TS 7.0.2 quebra o portão de lint `[VERIFIED: npm registry — peerDependencies conferidas hoje]` |
| `typescript-eslint` | **8.68.0** | Lint tipado + regra de pureza | Peer `eslint ^8.57 \|\| ^9 \|\| ^10`. A regra de pureza de hoje é estendida, não redesenhada |
| `eslint` | **10.9.1** | Lint | Dentro do peer acima |
| `ajv` | **8.20.0** | Validador de JSON Schema para o manifesto de assets | Só em `tools/assets/`, fora do bundle. 4 dependências diretas, todas conhecidas. Draft 2020-12 suportado |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `@stdlib/math-base-special-sin` | **0.3.1** | Oráculo do teste do port fdlibm | **devDependency apenas.** Puxa **153 pacotes transitivos** (medido) — nunca em runtime |
| `@stdlib/math-base-special-cos` | **0.3.1** | idem | idem |
| `@stdlib/math-base-special-atan2` | **0.3.1** | idem | idem |
| `esbuild` | **0.28.2** | Bundle/minify determinístico | Já vem embutido no Vite (0.21.5 hoje). Só instale explicitamente se o script do `SIM_VERSION` precisar dele fora do Vite |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Vitest browser mode (`browser.instances`) | `@playwright/test` com harness próprio | Playwright puro dá controle total do ciclo de vida do navegador e mensagens de falha desenhadas à mão; custa um segundo runner, um segundo config e um segundo relatório no CI. **Recomendado: Vitest browser mode**, porque o teste é "rodar uma função pura e comparar uma string", não navegar numa página |
| `ajv` no validador | Validador escrito à mão em ~150 linhas | Zero dependência, mas você reimplementa `$ref`, `oneOf`, `format` e mensagens de erro — e o público-alvo do erro é um agente em outro repositório, que precisa de mensagem precisa. **Use `ajv`**; ele nunca entra no bundle |
| ULID escrito à mão | `ulid@3.0.2` / `ulidx@2.4.1` | Ambos são runtime do jogo → violam `dependencies: {}` (C-1). A spec do ULID cabe em ~40 linhas (§ Don't Hand-Roll). **Escreva à mão, com teste contra os vetores da spec** |
| Vendorizar `@stdlib` inteiro | Vendorizar o subconjunto com domínio restrito | O conjunto completo é ~958 linhas de código; restringir a `\|x\| < 2^20` corta o `kernel_rempio2` (207 linhas) e chega a **~573**. **Restrinja o domínio** e falhe alto fora dele |
| Hash de conteúdo dos **fontes** de `sim/` | Hash do **bundle emitido** (D-07) | Hash dos fontes é mais simples e não precisa de build em duas etapas, mas não pega mudança de toolchain — que é exatamente o que D-07 quer pegar. **Mantenha D-07** e resolva a circularidade com duas etapas |

**Installation:**

```bash
# devDependencies do upgrade de toolchain (raiz do monorepo)
npm i -D vite@7.3.6 typescript@6.0.3 vitest@4.1.11 typescript-eslint@8.68.0 eslint@10.9.1

# portão cross-engine — playwright PINADO, sem circunflexo
npm i -D @vitest/browser-playwright@4.1.11
npm i -D -E playwright@1.62.1
npx playwright install chromium firefox webkit

# oráculo do port fdlibm (devDependency; 153 pacotes transitivos)
npm i -D @stdlib/math-base-special-sin@0.3.1 @stdlib/math-base-special-cos@0.3.1 @stdlib/math-base-special-atan2@0.3.1

# validador do manifesto de assets (tools/, fora do bundle)
npm i -D ajv@8.20.0
```

**Version verification:** todas as versões acima foram confirmadas contra o registro npm em
2026-08-31 com `npm view <pkg> version` e `npm view <pkg> peerDependencies`. `packages/sim` e o
`package.json` publicado do jogo mantêm `dependencies: {}` — o `tests/purity.test.ts` passa a asserir
isso (D-16).

---

## Package Legitimacy Audit

`slopcheck` 0.6.1 executado em 2026-08-31 sobre os 13 pacotes recomendados
(`python -m slopcheck install ...`). Resultado agregado: **12 OK, 1 SUS, 0 SLOP**.

| Package | Registry | Age | Source Repo | slopcheck | Disposition |
|---------|----------|-----|-------------|-----------|-------------|
| `vite` | npm | criado 2020-04-21 | github.com/vitejs/vite | [OK] | Aprovado |
| `vitest` | npm | criado 2021-12-03 | github.com/vitest-dev/vitest | **[SUS]** | **Aprovado — falso positivo**, ver abaixo |
| `@vitest/browser-playwright` | npm | criado 2025-10-01 | github.com/vitest-dev/vitest (monorepo) | [OK] | Aprovado |
| `playwright` | npm | criado 2015-01-23 | github.com/microsoft/playwright | [OK] | Aprovado |
| `@playwright/test` | npm | criado 2020-09-24 | github.com/microsoft/playwright | [OK] | Aprovado |
| `typescript` | npm | criado 2012-10-01 | github.com/microsoft/TypeScript | [OK] | Aprovado |
| `typescript-eslint` | npm | criado 2019-08-13 | github.com/typescript-eslint/typescript-eslint | [OK] | Aprovado |
| `eslint` | npm | criado 2013-07-04 | github.com/eslint/eslint | [OK] | Aprovado |
| `ajv` | npm | criado 2015-05-29 | github.com/ajv-validator/ajv | [OK] | Aprovado |
| `@stdlib/math-base-special-sin` | npm | criado 2021-06-15 | github.com/stdlib-js/math-base-special-sin | [OK] | Aprovado (devDependency) |
| `@stdlib/math-base-special-cos` | npm | criado 2021-06-15 | github.com/stdlib-js/math-base-special-cos | [OK] | Aprovado (devDependency) |
| `@stdlib/math-base-special-atan2` | npm | criado 2021-06-15 | github.com/stdlib-js/math-base-special-atan2 | [OK] | Aprovado (devDependency) |
| `esbuild` | npm | criado 2017-11-26 | github.com/evanw/esbuild | [OK] | Aprovado |

**Packages removed due to slopcheck [SLOP] verdict:** nenhum.

**Packages flagged as suspicious [SUS]:** `vitest`. O motivo dado pelo slopcheck é
*"Suspiciously close to 'vite'. Could be a typosquat. Did you mean: vite"* — uma heurística de
distância de edição. **É falso positivo, com três evidências independentes:** (a) `vitest@2.1.9` já
está instalado neste repositório e roda os 244 testes hoje; (b) o `repository.url` aponta para
`github.com/vitest-dev/vitest`, a org oficial do projeto; (c) `@vitest/browser-playwright@4.1.11`
declara peer `vitest@4.1.11` — os dois vêm do mesmo monorepo. Não é preciso `checkpoint:human-verify`
para este pacote, mas o planejador deve **registrar a justificativa no plano** para que o alerta não
reapareça como novidade a cada re-execução.

**Nota sobre `@stdlib`:** os três pacotes são legítimos e são ports em JS puro de FreeBSD msun / Go,
mas puxam **153 pacotes transitivos** (medido com `npm i` numa árvore limpa). Isso é aceitável como
devDependency e **inaceitável** como runtime — é a razão de C-1 existir e de D-01 escolher vendorizar
em vez de depender.

---

## Architecture Patterns

### System Architecture Diagram

```
                         CAPTURA                                    AUTORIDADE / VERIFICAÇÃO
  ┌──────────────────────────────────────────┐        ┌────────────────────────────────────────┐
  │ teclado / mouse / touch                  │        │ envelope de run (JSON legível)         │
  │            │                             │        │  { seed, RunConfig, SIM_VERSION,       │
  │            ▼                             │        │    score, hashFinal, log: base64 }     │
  │  app/input.ts  collect(tick)             │        └───────────────┬────────────────────────┘
  │   ├─ nearestEnemy / aimAngle  (hypot,    │                        │ 1. compara SIM_VERSION
  │   │   atan2 — FICAM AQUI, D-05)          │                        │    ├─ difere → RECUSA explícita (D-08)
  │   ▼                                      │                        │    └─ igual  → segue
  │  QUANTIZAÇÃO (D-02/D-03)                 │                        ▼
  │   aim  → round(a/STEP) & 0xFFFF  uint16  │              2. createWorld(RunConfig)
  │   move → round(v*127)|0          int8×2  │                 generateArena(world)      (D-11)
  │   flags→ attack|special|sprint   uint8   │                        │
  │            │                             │                        ▼
  │            ▼  6 bytes/tick/jogador       │              3. para cada tick do log:
  │  InputState decodificado (number)  ──────┼──┐                aplica delta+RLE (D-12)
  └──────────────────────────────────────────┘  │                preenche buraco = último
                                                 │                input conhecido (D-04)
              ┌──────────────────────────────────┘                      │
              ▼                                                          ▼
  ┌───────────────────────────────────────────────────────────────────────────────────┐
  │  app/stepper.ts   (FORM-10 — acumulador puro, SEM performance.now, SEM rAF)        │
  │     advance(elapsedMs, collectInputs) → n × step()                                 │
  └───────────────┬─────────────────────────────────────────┬─────────────────────────┘
                  │ dirigido por rAF no navegador           │ dirigido por laço no Node
                  ▼                                          ▼
  ┌────────────────────────────────────────────────────────────────────────────────────┐
  │ packages/sim   —   dependencies: {}   —   lib: ES2022, sem DOM                     │
  │                                                                                     │
  │   step(world, inputs)                                                               │
  │     └─ itera world.config.players (ordem canônica, D-13)  ← NÃO Object.keys         │
  │        └─ updatePlayer → combat → enemies → bullets → loot → run                    │
  │             └─ TODA trigonometria via  sim/math.ts  (fdlibm vendorizado, D-01)      │
  │                                                                                     │
  │   world: { rng: Rng, players: Record, enemies[], objectives, … }                    │
  │            │                                                                        │
  │   sim/serialize.ts   saveWorld / loadWorld / hashWorld  (rng.save/restore)          │
  └───────────────┬───────────────────────────────┬────────────────────────────────────┘
                  │                                │
                  ▼                                ▼
     drainEvents(world) → app/ → render/   hashWorld(world) → comparado com HASH-OURO
     (apresentação; NUNCA objetivos)                    │
                                                        ▼
                                     ┌──────────────────────────────────────────┐
                                     │ CI: mesmo teste em 4 motores             │
                                     │  node · chromium · firefox · webkit      │
                                     │  falha nomeia o motor divergente         │
                                     └──────────────────────────────────────────┘

  BUILD (duas etapas — o hash de X não cabe dentro de X)
   packages/sim  ──vite build --lib──▶  dist/sim.js  ──sha256──▶  sim-version.json
                                                                        │
                                              importado por app/, protocol/, tools/, servidor
```

### Recommended Project Structure

Alvo desta fase (D-14/D-15). `apps/` **não** nasce aqui.

```
/
├── package.json              # workspaces: ["packages/*"] ; dependencies: {}
├── vite.config.ts            # app na raiz, inalterado (fase 2 mexe em `base`)
├── index.html                # fica na raiz
├── packages/
│   ├── sim/
│   │   ├── package.json      # "dependencies": {} — asserido por teste
│   │   ├── tsconfig.json     # "lib": ["ES2022"], "types": []  (D-16, verificado: compila)
│   │   ├── vite.config.ts    # build.lib, minify determinístico, sourcemap: false
│   │   └── src/              # os 24 arquivos de src/sim/ + math.ts + serialize.ts
│   └── protocol/
│       ├── package.json      # PROTOCOL_VERSION, enums congelados (D-09/D-11/D-12)
│       └── src/
├── src/                      # app/, render/, ui/, main.ts — ficam onde estão
│   └── app/stepper.ts        # NOVO (FORM-10)
├── tools/
│   ├── sim-version/          # script de hash do bundle (etapa 2 do build)
│   └── assets/               # validador de manifesto + JSON Schema versionado (D-24)
├── docs/adr/                 # NOVO — ADRs de D-30 a D-38 (vinculantes p/ fases 5,6,8,9)
├── tests/
│   ├── golden/               # hashes-ouro versionados + log de inputs de referência
│   └── cross-engine.test.ts  # roda em node + chromium + firefox + webkit
└── .github/workflows/
    ├── deploy.yml            # existe hoje
    └── ci.yml                # NOVO — lint, test, cross-engine, validador de assets
```

### Pattern 1: `sim/math.ts` — port fdlibm com domínio restrito

**What:** um módulo **folha** (não importa nada de `sim/`) exportando `sin`, `cos` e `atan2`
construídos só sobre `+ − × ÷` e `Math.sqrt`, mais manipulação de bits via `Float64Array`/`Uint32Array`
compartilhados. Nada avaliado em tempo de módulo além de constantes literais.

**When to use:** substitui os **27 call sites** medidos (12 `sin`, 12 `cos`, 3 `atan2`) em 7
arquivos: `arena.ts` (1+1), `boss.ts` (1+1), `combat.ts` (2+2+2), `enemies.ts` (5+5+1), `loot.ts`
(1+1), `run.ts` (1+1), `special.ts` (1+1). Nenhum outro `Math.*` sai: `Math.sqrt` (25 usos),
`Math.PI` (36), `Math.max` (35), `Math.min` (31), `Math.round` (16), `Math.floor` (7), `Math.abs`
(2), `Math.imul` (2), `Math.trunc` (2) são todos exatos por spec e **ficam**.

**Custo real, com fonte por função** (linhas de código, sem comentários nem branco, medidas no
`@stdlib` 0.3.1 instalado):

| Função | Origem de referência | LOC de código |
|--------|----------------------|---------------|
| `getHighWord` / `getLowWord` / `fromWords` | views `Float64Array`/`Uint32Array` compartilhadas | 71 |
| `kernelSin` | FreeBSD msun `k_sin.c` | 22 |
| `kernelCos` (+ 2 polyval) | FreeBSD msun `k_cos.c` | 33 |
| `rempio2` main + `rempio2_medium` | FreeBSD msun `e_rem_pio2.c` | 177 |
| ~~`kernel_rempio2` (Payne-Hanek)~~ | só para `\|x\| ≥ 2^20` | **207 — DESCARTAR** |
| `sin` | msun `s_sin.c` | 37 |
| `cos` | msun `s_cos.c` | 37 |
| `atan` (+ 2 polyval) | Go `math/atan.go` | 68 |
| `atan2` | Go `math/atan2.go` | 47 |
| `copysign`, `ldexp`, `signbit` | msun auxiliares | 81 |
| Constantes float64 (`eps`, `pi`, `half-pi`, máscaras de high word, …) | literais | ~15 |
| **Total com domínio restrito** | | **~573** |
| Total sem restrição | | ~780 |

**Por que descartar o `kernel_rempio2` é seguro e não é atalho:** o `rempio2` do fdlibm só entra no
caminho Payne-Hanek quando `|x| ≥ 2^20 · π/2 ≈ 1.647.099` (constante `MEDIUM = 0x413921fb`,
lida do fonte). Os ângulos que este jogo produz vêm de `atan2` (limitado a ±π), de
`(i/n)·2π` no anel de chefe, de `rng.next()·2π` nos anéis de spawn e de `angle + spread` — o maior
|x| possível está na casa de `4π ≈ 12,6`. Restringir o domínio elimina as 207 linhas mais
difíceis de auditar e mais fáceis de portar errado. **A restrição precisa ser uma asserção, não um
comentário:** fora do domínio, `throw`. Um `NaN` silencioso aqui é exatamente a classe de falha que a
fase existe para eliminar.

**Anti-armadilha de tempo de módulo:** o `@stdlib` usa arrays de escratch em escopo de módulo
(`var TX = [0,0,0]; var TY = [0,0];` em `rempio2/lib/main.js`). Isso é seguro num sim single-threaded
e **não** cruza o SCC — `math.ts` é folha. Mas escreva-as como `const` de array literal dentro do
módulo, nunca como resultado de uma chamada a outro módulo de `sim/`.

**Example:**

```ts
// packages/sim/src/math.ts — vendored fdlibm port. Only +,-,*,/ and Math.sqrt:
// ECMA-262 pins those five to IEEE-754 with correct rounding, so every engine
// returns the same bits. Domain is restricted on purpose — see rempio2().
// Source of record: FreeBSD msun s_sin.c / k_sin.c / e_rem_pio2.c, Go math/atan2.go.

const BUF = new ArrayBuffer(8);
const F64 = new Float64Array(BUF);
const U32 = new Uint32Array(BUF); // little-endian index checked at module load

/** |x| above this needs Payne-Hanek reduction, which this port does NOT ship. */
const REMPIO2_MAX = 1647099.3291652855; // 2^20 * pi/2

export function sin(x: number): number {
  if (!(Math.abs(x) < REMPIO2_MAX)) {
    // Loud on purpose: a silent NaN here is the failure this module exists to kill.
    throw new RangeError(`sim/math.sin: |x| out of supported domain: ${x}`);
  }
  // ... argument reduction + kernelSin/kernelCos
}
```

### Pattern 2: quantização na captura — o pacote de 6 bytes

**What:** `app/input.ts:collect()` passa a produzir um `InputState` **já quantizado**. O sim continua
recebendo `number`; o que muda é que o número passa a ser o produto exato de um inteiro por um passo
literal, e não a saída de `Math.atan2` do motor.

**Layout do tick (D-03/D-10), 6 bytes por jogador:**

| Offset | Tipo | Campo | Codificação |
|--------|------|-------|-------------|
| 0 | `int8` | `move.x` | `round(x*127) \| 0`, faixa `[-127,127]`, decodifica `n/127` |
| 1 | `int8` | `move.y` | idem |
| 2..3 | `uint16 LE` | `aim` | `round(a/STEP) & 0xFFFF`, `STEP = 2π/65536` |
| 4 | `uint8` | flags | bit0 `attack`, bit1 `special`, bit2 `sprint`, bits 3-7 reservados (zero) |
| 5 | `uint8` | `playerIdx` | índice na ordem canônica de `RunConfig.players` (D-12/D-13) |

**Medido:** o passo de `aim` é **0,005493°**, o erro máximo de arredondamento é **0,002747°**, e
`encode(decode(x)) === x` em 200.000 amostras aleatórias — a quantização é idempotente, que é a
propriedade de que o replay precisa. O `move` diagonal do teclado (`1/√2`) vira `int8 90`, que
decodifica para `0,708661`; a magnitude do vetor passa de `1,000000` para **`1,002199`** (+0,22%).
Isso é uma mudança de tuning real, pequena e permanente — e é o preço, já aceito, de tirar
`Math.hypot` do dado gravado.

**A armadilha de faixa que o texto de D-02 não fecha:** `round(π/STEP) = 32768` e
`round(−π/STEP) = −32768`. São **65.537** valores distintos para 16 bits. Recomendação: gravar
`q & 0xFFFF` no fio e **decodificar como `int16`** (`(q << 16) >> 16`), o que devolve `aim` à faixa
`[−π, π)` — a mesma que `Math.atan2` produz hoje. Decodificar como `uint16` (faixa `[0, 2π)`) também
é correto matematicamente, mas muda o número de iterações dos laços
`while (diff > Math.PI) diff -= Math.PI*2` em `combat.ts:97-98,111-112`, o que muda o resultado em
ponto flutuante no limite do arco de melee. **Prefira `int16` e não mexa no domínio que o sim já vê.**

**Segunda armadilha:** `Math.round(-0.4)` retorna **`-0`** (verificado), e `-0/127` é `-0`. Sem o
`| 0`, um joystick levemente negativo injeta `-0` em `move.x`, que atravessa o `World` e é perdido na
serialização JSON (§ Pitfall 5). O `| 0` normaliza — `Math.round(-0.4) | 0` é `+0`, verificado.

### Pattern 3: `app/stepper.ts` — o passo fixo sem relógio de tela (FORM-10)

**What:** o acumulador sai de `app/loop.ts:15-44` e vira um objeto puro, testável, que não conhece
`performance.now()` nem `requestAnimationFrame`. `loop.ts` fica só com o adaptador de `rAF`.

Hoje `startLoop` mistura três coisas em 30 linhas: a fonte de tempo (`performance.now()`), o
acumulador com `MAX_CATCHUP = DT_MS * 5`, e o `rAF`. O corte é limpo porque `main.ts:100-105` já
passa `collectInputs`, `afterStep` e `render` como hooks — a fronteira já existe, só está no arquivo
errado.

```ts
// src/app/stepper.ts — fixed-timestep accumulator. No wall clock, no rAF:
// the caller supplies elapsed milliseconds. This is what lets a test, a
// headless Node replay and a future server drive the same sim.
import { DT_MS } from '@dg2/sim';
import { step } from '@dg2/sim';
import type { InputState, World } from '@dg2/sim';

/** A long stall (background tab) must not trigger a spiral of death. */
export const MAX_CATCHUP_MS = DT_MS * 5;

export function createStepper(world: World) {
  let acc = 0;
  return {
    /** Advances the world by whole ticks; returns the render interpolation alpha. */
    advance(elapsedMs: number, collect: (tick: number) => Record<string, InputState>,
            afterStep?: (w: World) => void): number {
      acc += Math.min(elapsedMs, MAX_CATCHUP_MS);
      while (acc >= DT_MS) {
        step(world, collect(world.tick));
        afterStep?.(world);
        acc -= DT_MS;
      }
      return acc / DT_MS;
    },
    /** Replay/verification driver: exactly n ticks, no clock involved. */
    runTicks(n: number, collect: (tick: number) => Record<string, InputState>): void {
      for (let i = 0; i < n; i++) step(world, collect(world.tick));
    },
  };
}
```

`main.ts` ganha `'p1'` em **6 lugares** (`:76, :77, :123, :127, :150, :154`). A extração do stepper é
o momento barato de trocar por uma constante `LOCAL_SLOT` alinhada com o `playerId` `p0..p3` de
FORM-01 — mas note que trocar `'p1'` por `'p0'` **muda o hash** de qualquer coisa que dependa do id,
então faça junto com o re-baseline do `math.ts`, não separado.

### Pattern 4: `SIM_VERSION` — build em duas etapas

**What:** D-07 pede o hash do bundle emitido de `packages/sim`. **O hash de um artefato não pode
morar dentro do artefato** — injetá-lo via `define` mudaria os bytes e portanto o hash. A saída é
duas etapas.

```
etapa 1:  vite build --config packages/sim/vite.config.ts
             ↳ packages/sim/dist/sim.js       (byte-reproduzível — medido)
etapa 2:  node tools/sim-version/emit.mjs
             ↳ packages/sim/dist/sim-version.json   { "simVersion": "sha256:cc73256c…" }
```

`app/`, `packages/protocol` e (na fase 6) o servidor importam `sim-version.json`. O bundle do sim
nunca contém a própria versão.

**Reprodutibilidade — medida, não presumida.** Rodei `vite build` em modo `lib` sobre a superfície
pública de `src/sim` três vezes seguidas: `55.425 bytes`, sha256 idêntico nas três, com
`minify: true` e `sourcemap: false`. Uma quarta verificação: `grep` por caminho absoluto no artefato
→ **0 ocorrências**. A premissa de D-07 se sustenta na toolchain de hoje (Vite 5.4.21); reconfirme
depois do upgrade para 7.3.6, porque é exatamente o tipo de coisa que um major muda.

**O que entra no hash (D-06):** os 24 arquivos de `packages/sim/src/**` — que é o que o bundle
contém. Como o hash é do **artefato**, a fronteira é automática: um arquivo que não é importado pelo
entry não entra. Isso é uma propriedade, não um acidente — mas significa que `STAT_LABELS` e
`PCT_STATS` (`sim/stats.ts:65-76`), que são vocabulário de apresentação consumidos só por
`ui/screens.ts` e `ui/shop.ts`, **entram no `SIM_VERSION` e fecham a temporada quando alguém renomear
um rótulo de HUD**. Isso contradiz D-06 ("um ajuste de HUD não fecha a temporada"). Duas saídas: mover
os dois para `ui/`, ou aceitar e documentar. **Recomendo mover** — é uma decisão de dez minutos agora
e uma temporada fechada à toa depois.

**O handshake e a recusa (D-08):**

```ts
// packages/protocol/src/version.ts
export type VersionMismatch = {
  kind: 'sim' | 'protocol';
  ours: string;
  theirs: string;
};

/** No dev bypass, by decision D-08: a bypass that exists is a bypass that ships. */
export function checkVersions(ours: Versions, theirs: Versions): VersionMismatch | null {
  if (ours.sim !== theirs.sim) return { kind: 'sim', ours: ours.sim, theirs: theirs.sim };
  if (ours.protocol !== theirs.protocol) {
    return { kind: 'protocol', ours: ours.protocol, theirs: theirs.protocol };
  }
  return null;
}
```

A mensagem na tela precisa dos **dois** valores e da ação (recarregar). "Versão incompatível" sozinho
custa uma hora de depuração por ocorrência.

### Pattern 5: `packages/sim/src/serialize.ts` — promoção do `hashWorld`

**What:** `tests/helpers.ts:38-62` já é 90% do `serialize.ts`. O que ele faz hoje e deve continuar
fazendo: exclui `events` (apresentação) e `config` (constante da run), converte `rng` via `.save()`, e
**etiqueta `NaN`/`Infinity`/`-Infinity` separadamente** — sem isso, um mundo que divergiu para `NaN`
teria a mesma impressão digital de um mundo saudável.

O que precisa nascer junto:

| Função | Responsabilidade | Cuidado |
|--------|------------------|---------|
| `saveWorld(world): SerializedWorld` | JSON-safe, `rng` → `number` | **Não** excluir `config`: `saveWorld` é lossless, `hashWorld` é fingerprint. São contratos diferentes |
| `loadWorld(data): World` | reconstrói `new Rng(0)` + `rng.restore(s)` | `Rng` é a **única** instância de classe no `World` (verificado) — nada mais precisa de revive |
| `hashWorld(world): string` | fingerprint estável | Mantém as exclusões de hoje |

**Medições de tamanho, neste repositório, com 4 jogadores:**

| Situação | `World` serializado | players | enemies | obstacles | traps |
|----------|--------------------|---------|---------|-----------|-------|
| wave 1, 7 inimigos | **12.528 B** | 4.779 | 4.054 | 2.411 | 600 |
| wave 16, 12 inimigos | **17.744 B** | 5.675 | 7.200 | 2.411 | 600 |

Dois fatos úteis para a fase 3: (a) a wave 16 **já passa** do limite de 16 KiB do DataChannel com só
12 inimigos vivos; (b) `obstacles` + `traps` = **3.011 B constantes**, geradas uma vez por
`generateArena` e nunca mais alteradas — são candidatas óbvias a sair do snapshot recorrente. Nada
disso é escopo desta fase, mas o **formato** decidido aqui é o que permite ou impede a separação.

**`world.objectives` (FORM-08):** qualquer que seja a forma, ela precisa ser (a) JSON-safe sem
`Map`/`Set`/classe, (b) presente desde a criação do mundo com a mesma forma sempre — o comentário em
`types.ts:130-131` sobre `eliteName`/`eliteTint` já estabeleceu essa doutrina no projeto ("uma chave
opcional iria e viria entre snapshots"), e ela vale aqui. Uma chave que só existe em modo missão é
uma divergência de hash esperando o momento errado.

**Estado morto para decidir agora:** `world.nextWaveDelay` (`types.ts:270`, `world.ts:37`) é
inicializado em `3000` e **nunca lido**. Ele está prestes a entrar num formato congelado. Removê-lo
custa uma linha hoje e muda o hash (que vai mudar de qualquer jeito com o `math.ts`); mantê-lo custa
4 bytes por snapshot para sempre. **Remova, no mesmo commit do re-baseline.**

### Pattern 6: ledger de soul gold append-only (FORM-05)

**What:** `app/ledger.ts` novo, chave `dungeonguys2_ledger_v1` (D-29), separado de
`dungeonguys2_save_v1`. Cada evento tem um ULID gerado no cliente (D-27), positivo para concessão e
negativo para gasto (D-28). Saldo = soma.

```ts
// src/app/ledger.ts
export type LedgerEvent = {
  id: string;            // ULID, client-generated, dedup key on the server (D-27)
  accountId: string;     // stamped at creation, even while local/unclaimed (D-31)
  amount: number;        // positive = grant, negative = spend (D-28)
  reason: 'run' | 'mission' | 'season' | 'forge';
  at: number;            // ms epoch, for display only — the ULID carries the ordering
  confirmed?: string;    // server watermark once acknowledged (D-29 compaction)
};

export function balance(events: readonly LedgerEvent[]): number {
  let n = 0;
  for (const e of events) n += e.amount;
  return n;
}
```

O `progress.soulGold` de `app/save.ts:65` é **descartado** (D-26) — sem código de migração e sem tipo
de evento `legacy`. Vale registrar no ADR que o caminho de migração fica, portanto, **não
exercitado** até a fase 6, que é o custo consciente dessa escolha.

### Pattern 7: `packages/protocol` — enums congelados e o vocabulário sem "host"

**What:** o pacote nasce nesta fase (D-09) contendo três coisas e nada mais: `PROTOCOL_VERSION`, as
tabelas de enum append-only (FORM-11) e os tipos do envelope de run e do log de inputs.

**Append-only, verificado por snapshot:** o teste grava o array de nomes na ordem e compara com um
arquivo versionado. Inserir no meio ou renomear **falha**; acrescentar no fim passa depois de o ouro
ser atualizado no mesmo PR.

```ts
// packages/protocol/src/enums.ts — append-only. Adding at the end is fine.
// Reordering or renaming is a wire break and the snapshot test will say so.
export const MSG_KIND = [
  'hello', 'welcome', 'reject', 'lobbyState', 'startRun',
  'input', 'snapshot', 'ack',
] as const;
```

**FORM-12 ("o protocolo não contém a palavra host"):** é verificável por teste, não por revisão. Um
teste que lê os fontes de `packages/protocol/src/**` e falha se encontrar `/\bhost\b/i` fora de
comentário é dez linhas e usa exatamente o mesmo `scan()` de `tests/purity.test.ts:28-45`, que já
sabe tirar comentários e strings. O vocabulário substituto: `authority`, `peer`, `slot`.

**ADRs (`docs/adr/`, D-30 a D-38):** o diretório não existe hoje. As fases 5, 6, 8 e 9 vão citá-lo
nominalmente, então a convenção de nome importa mais que o conteúdo: `docs/adr/NNNN-slug.md`, quatro
dígitos, e um `docs/adr/README.md` com o índice. Nove arquivos, um por decisão, com contexto/opções/
consequência.

### Pattern 8: manifesto de assets + validador de CI (FORM-09)

**What:** um JSON Schema versionado em `tools/assets/schema/manifest.v1.json`, um validador em
`tools/assets/validate.mjs` rodando `ajv`, e um manifesto por spritesheet em `public/assets/`.

**O que a spec precisa congelar, derivado do código real:**

| Item | Valor congelado | Onde o código de hoje mostra o porquê |
|------|-----------------|--------------------------------------|
| Unidade lógica | 1 unidade = 1 px renderizado | `WORLD = {2400,1600}` em `constants.ts:34`; `COIN_MAGNET = 100` é raio em px |
| Personagem | 32×48 px, escala 1 | Hoje `16×28` × `SPRITE_SCALE = 2` = 32×56 desenhados (`sprites.ts:30-34`, `entities.ts:41-44`) |
| Tile | 32×32 nativo | `TILE = 32`; 2400/32 = 75 e 1600/32 = 50, exatos |
| Animações v1 | só `idle` e `run` | `entities.ts:64` escolhe `p.moving ? animSet.run : animSet.idle` — não há terceira |
| Contagem de quadros | **declarada no manifesto** | `entities.ts:63` tem `Math.floor(performance.now()/140) % 4` **hard-coded em 4**, e `sprites.ts:76-80` faz ping-pong manual no mimic para caber no relógio de 4. O manifesto tira os dois |
| Rampa de recolor | obrigatória, declarada | `OUTFIT_COLORS` (`sprites.ts:108-116`) é um par exato `light`/`dark` por classe; `CLASS_REGION` (`:118-126`) é a faixa recolorida |
| Pivô e cobertura de hitbox | declarados; CI confere contra `sim/defs/enemies.ts` | Ver tabela abaixo |

**A relação hitbox↔sprite, medida:** as hitboxes de `sim/defs/enemies.ts` **não** são iguais ao
sprite desenhado, e a relação não é constante.

| Inimigo | Hitbox (`w`×`h`) | Sprite fonte | `scale` | Desenhado hoje | Razão hitbox/desenho |
|---------|------------------|--------------|---------|----------------|----------------------|
| `skeleton` | 26×26 | 16×16 | — | 32×32 | 0,81 × 0,81 |
| `demon` | 26×40 | 16×23 | — | 32×46 | 0,81 × 0,87 |
| `brute` | 52×62 | 32×36 | — | 64×72 | 0,81 × 0,86 |
| `zombie_king` | 76×92 | 32×36 | 3 | 96×108 | 0,79 × 0,85 |
| `necro_lord` | 38×56 | 16×23 | 2,3 | ~37×53 | 1,03 × 1,06 |

`necro_lord` é o caso que prova que a regra é "o CI **confere** a cobertura", e não "o CI **deriva** a
hitbox": a hitbox dele é maior que o sprite desenhado. A regra do validador deve ser uma tolerância
declarada por entrada, não uma igualdade — e a mensagem de erro precisa dizer qual sprite não cobre
qual hitbox de qual entrada de `ENEMY_DEFS`, porque quem lê é um agente em outro repositório.

**Estado de partida:** `public/assets/` tem hoje **dois PNGs** (`dungeon_tileset.png` 39.623 B,
`copRobo.png` 76.798 B) e nenhum manifesto. `tools/` não existe. O validador precisa nascer com um
manifesto de exemplo **bom** e um **ruim** commitados, porque o critério de sucesso 5 exige demonstrar
a recusa.

### Anti-Patterns to Avoid

- **`const X = f()` em tempo de módulo cruzando o SCC.** É a razão de o corte vir antes do `math.ts`
  (D-17). `math.ts` é folha e usa só literais, então o risco é baixo — mas a regra vale para
  **qualquer** constante nova em `sim/` enquanto o componente existir.
- **Oráculo de teste comparando o port com `Math.sin` do motor.** Medido: `@stdlib` (fdlibm) e o
  `Math.sin` do Node divergem em **~0,9%** das amostras aleatórias, e o `Math.atan2` em **~25%**, por
  1 ULP. Um teste `expect(sin(x)).toBe(Math.sin(x))` falha por construção. O oráculo correto é
  `expect(ourSin(x)).toBe(stdlibSin(x))` — bit-exato contra o **mesmo** port.
- **`toBeCloseTo` em qualquer teste de determinismo.** Aproximação é o oposto do que se está
  verificando. Use `toBe` sobre `Object.is` ou compare padrões de bits.
- **Validar `InputState` num módulo separado de `step()`.** Um validador à parte deriva do sim com o
  tempo, e a divergência aparece como "replay não confere" meses depois. O clamp mora dentro de
  `step()`/`updatePlayer`.
- **`^` na versão do Playwright.** Um minor troca as builds dos motores, que é a variável do
  experimento. Pinar exato.
- **Checkpoints de hash no formato de replay.** Recusado em D-11 — não reintroduza "só para depurar".
- **`skipWaiting()` no service worker** enquanto houver multiplayer: `public/sw.js:37` faz isso hoje.
  Não é escopo desta fase (é a fase 2), mas é a mesma família de problema.

---

## Don't Hand-Roll

| Problema | Não construa | Use em vez disso | Por quê |
|----------|--------------|------------------|---------|
| Rodar o mesmo teste em Chromium/Firefox/WebKit | Harness próprio de `playwright.launch()` + `addScriptTag` | `vitest@4` com `browser.instances` e `@vitest/browser-playwright` | O projeto nasce nomeando o motor divergente de graça, e o CI tem um relatório só. Eu escrevi o harness manual para esta pesquisa: são ~60 linhas que você teria de manter |
| Validar JSON Schema | Validador próprio com `oneOf`/`$ref` | `ajv@8.20.0` (devDependency, em `tools/`) | O consumidor da mensagem de erro é um agente automatizado noutro repositório. Erro impreciso = ciclo de ida e volta sem humano para desempatar |
| Redução de argumento de `sin`/`cos` | Um `x % (2π)` "que dá no mesmo" | Port do `rempio2` de FreeBSD msun (177 linhas com domínio restrito) | `x % (2π)` perde precisão catastroficamente já em `x ≈ 100`, porque `2π` não é representável. É a parte que existe justamente para isso |
| Comparação de floats em teste | `toBeCloseTo`, epsilon, `toFixed` | `Object.is` ou comparação de `BigUint64Array` sobre o buffer | Uma divergência de 1 ULP é exatamente o que derruba o replay, e é exatamente o que um epsilon esconde |
| Hash de conteúdo | Concatenar `mtime`, tamanho e nome | `node:crypto` `createHash('sha256')` sobre os bytes do artefato | `node:crypto` é da plataforma, não é dependência, e o hash tem de sobreviver a `git clone` (que zera `mtime`) |

**Exceção deliberada — ULID escrito à mão.** `ulid@3.0.2` e `ulidx@2.4.1` existem e são legítimos, mas
o ledger roda no jogo publicado e C-1 é invariante. A spec do ULID é curta o bastante para ser
transcrita com segurança **e testada contra os vetores da própria spec**: 128 bits = 48 bits de
timestamp em ms + 80 bits de aleatoriedade; string canônica de 26 caracteres (10 de tempo + 16 de
aleatoriedade) em Crockford Base32 `0123456789ABCDEFGHJKMNPQRSTVWXYZ` (sem I, L, O, U); ordenação
lexicográfica = ordenação temporal; dentro do mesmo milissegundo, o componente aleatório é
**incrementado em 1 no bit menos significativo, com carry**
`[CITED: github.com/ulid/spec]`. São ~40 linhas sobre `crypto.getRandomValues`, que existe em `app/`
(mas jamais em `sim/`). Os testes obrigatórios: 26 caracteres, alfabeto restrito, monotonicidade
dentro do mesmo ms, e ordenação lexicográfica batendo com ordenação temporal.

**Key insight:** neste projeto a regra "não faça à mão" tem uma fronteira nítida e ela é a fronteira
do bundle. Dentro do jogo publicado, `dependencies: {}` obriga a escrever à mão e a **testar
pesado** (fdlibm, ULID). Fora dele — `tools/`, `tests/`, CI — não há desculpa para reimplementar nada,
e é onde `ajv`, `@stdlib` e o Playwright entram sem culpa.

---

## Runtime State Inventory

Esta fase renomeia imports em massa, extrai pacotes, muda o formato de save e descarta um contador
persistido. Um `grep` acha arquivos; não acha o que está guardado fora deles.

| Category | Items Found | Action Required |
|----------|-------------|-----------------|
| **Stored data** | `localStorage['dungeonguys2_save_v1']` no navegador do desenvolvedor, contendo `progress.soulGold` (`app/save.ts:57,65`). É o único save real que existe — o jogo nunca foi publicado sob domínio próprio. **Nenhum banco, nenhuma coleção vetorial, nenhum Redis** — o projeto não tem servidor ainda | **Código, não migração.** D-26 descarta o valor. O ledger nasce em chave nova `dungeonguys2_ledger_v1` (D-29). Não escrever código de migração; escrever no ADR que a decisão foi consciente |
| **Live service config** | `.github/workflows/deploy.yml` é o **único** workflow e publica no GitHub Pages. A configuração vive no git, mas o **ambiente `github-pages`** e as permissões `pages: write`/`id-token: write` vivem nas configurações do repositório no GitHub, fora do git. Nenhum n8n, Datadog, Cloudflare ou Tailscale neste projeto | O CI novo (`ci.yml`) precisa instalar navegadores do Playwright — é passo novo, não herdado. **Não mexer no `deploy.yml`**: INFRA-01 (fase 2) é quem mata o Pages |
| **OS-registered state** | **Nenhum — verificado.** Não há Task Scheduler, pm2, systemd ou launchd envolvidos; o projeto é build estático + `vite dev` | Nenhuma |
| **Secrets / env vars** | **Nenhum — verificado.** Não há `.env`, nem SOPS, nem segredo no workflow além do `GITHUB_TOKEN` implícito. `vite.config.ts` usa só `base: '/DungeonGuys2/'`, e `main.ts:43` lê `import.meta.env.BASE_URL` | Nenhuma nesta fase. A fase 2 muda `base` e é onde isso importa |
| **Build artifacts** | `node_modules/` e `dist/` (ambos no `.gitignore`). Cache de navegadores do Playwright em `%LOCALAPPDATA%\ms-playwright` — hoje contém **só `chromium-1234`**; Firefox e WebKit foram instalados durante esta pesquisa. `package-lock.json` (101 KB) muda inteiro com o upgrade de toolchain | **Reinstalação necessária**: `npm ci` depois do upgrade, e `npx playwright install chromium firefox webkit` na máquina de dev **e** no CI. A extração de workspaces reescreve o `package-lock.json` — commite-o no mesmo PR |
| **Dados de teste que viram estado** | **A criar:** `tests/golden/*.json`. Não existem hoje. A partir do momento em que existirem, são estado versionado que **precisa ser refeito** quando o `math.ts` entrar | Definir no plano **quem** pode refazer o ouro e **como** (§ Validation Architecture) |

**A pergunta canônica:** depois que todo arquivo do repositório for atualizado, o que ainda carrega o
nome antigo? Resposta medida: **108 linhas de import** referenciando `sim/` a partir de 36 arquivos
fora de `src/sim` (`app/`, `render/`, `ui/`, `main.ts`, `tests/`), mais **83 imports relativos
internos** dentro de `src/sim`. A extração de `packages/sim` toca as 108; as 83 continuam relativas e
não mudam. Nenhuma delas é estado de runtime — mas as 108 são o motivo de a extração ser
tudo-ou-nada, e a rede de segurança são os **244 testes em 21 arquivos** que estão verdes hoje.

---

## Common Pitfalls

### Pitfall 1: a divergência de trigonometria não é teórica, e o teste de hoje não a vê

**O que dá errado.** `tests/determinism.test.ts` compara dois mundos **no mesmo processo, no mesmo
motor**. Por construção ele não pode falhar por divergência de motor. O comentário em
`sim/constants.ts:18-20` já diz isso, e está certo.

**Medido, em 2026-08-31, nesta máquina.** A simulação real, bundlada, 3.000 ticks, mesma seed
(20260827), mesmo roteiro de inputs:

| Motor | `hashWorld` após 3.000 ticks | Primeira divergência |
|-------|------------------------------|----------------------|
| Node v24.11.1 (V8 13.6.233.10) | `9f870f80` | (referência) |
| Chromium 151.0.7922.34 | `18539474` | **tick 361** |
| Firefox 153.0 | `e934dfd7` | **tick 541** |
| WebKit 26.5 (build do Playwright) | `e934dfd7` | **tick 541** |

Divergência por função, 20.000 amostras no domínio real do jogo, contra o Node:

| Motor | `sin` | `cos` | `atan2` | `sqrt` |
|-------|-------|-------|---------|--------|
| Chromium | 638 (**3,19%**) | 694 (3,47%) | 3.479 (**17,39%**) | **0** |
| Firefox | 479 (2,40%) | 513 (2,56%) | **0** | **0** |
| WebKit | 479 (2,40%) | 513 (2,56%) | 3.476 (17,38%) | **0** |

Todas as divergências são de **1 ULP**. Firefox e WebKit concordam entre si em `sin` (0 divergências
em 20.000). **`Math.sqrt` não divergiu em nenhum motor** — a doutrina de `constants.ts:7-8` está
empiricamente correta.

**Por que acontece.** O ECMA-262 marca `sin`, `cos`, `atan2` como *implementation-approximated*; só
`+ − × ÷ sqrt` são IEEE-754 com arredondamento correto `[CITED: tc39.es/ecma262 — Math object]`. E
note o par mais incômodo da tabela: **Node 24 e Chromium 151 são os dois V8** e mesmo assim divergem
em 3,19% de `sin`. "Exigir o mesmo motor" não é garantia nem dentro da mesma família.

**Como evitar.** Substituí `Math.sin`/`cos`/`atan2` pelos ports fdlibm em JS puro do `@stdlib`, sem
tocar em mais nada do bundle, e re-rodei nos quatro motores: **`9f870f80` nos quatro**. A opção A
resolve, medido.

**Sinais de alerta.** Um jogador específico "teleporta" e só ele. Um replay que passava falha depois
de `apt upgrade nodejs` sem mudança de código. Sem o portão cross-engine no CI, esses sinais só
aparecem na fase 4, dentro de uma sessão de rede, onde o custo de diagnóstico é dez vezes maior.

### Pitfall 2: o oráculo do port não pode ser o `Math` do motor

**O que dá errado.** O reflexo natural é testar `expect(ourSin(x)).toBe(Math.sin(x))`. Isso falha,
e falha de um jeito que parece bug no port.

**Medido.** Comparando `@stdlib` (fdlibm) contra o `Math` do Node 24 sobre 202.000 amostras:
`sin` diverge em **1.856** casos (0,92%), `cos` em **1.867** (0,92%), e `atan2` em **12.430 de
50.000** (**24,9%**) — sempre por 1 ULP. O V8 é *adaptado de* fdlibm, não é fdlibm.

**Como evitar.** O oráculo é o **mesmo** port: `expect(ourSin(x)).toBe(stdlibSin(x))`, bit-exato,
sobre um corpus que cubra os ramos do `rempio2` (`|x| ≤ π/4`, `≤ 3π/4`, `≤ 5π/4`, `≤ 3π`, `< 2^20`) e
os casos especiais de `atan2` (zeros com sinal, infinitos, `NaN`, os quatro quadrantes). E um teste
adicional que **assere o `throw`** fora do domínio suportado.

**Consequência de planejamento:** trocar `Math.*` por `sim/math.ts` **muda o resultado da simulação**.
Todos os hashes-ouro precisam ser refeitos. Curiosidade útil: no experimento acima o hash convergido
(`9f870f80`) por acaso bateu com o baseline do Node — a distribuição de ângulos daqueles 3.000 ticks
não tocou nenhum ponto de divergência do V8. **Não conte com isso**; planeje o re-baseline como
trabalho certo.

### Pitfall 3: cortar `xp → run` sozinho não desfaz o SCC

**O que dá errado.** O `docs/BACKLOG.md` diz: *"O corte mais barato é a aresta `xp → run` […] remove
`xp → run`, e `run ↔ shop` cai junto."* O roadmap herdou como "SCC 8 → 6". **Nenhuma das duas coisas
é verdade.**

**Medido.** Rodei Tarjan sobre o grafo de imports **de valor** (excluindo `import type`) dos 24
arquivos de `src/sim`. Componente único de tamanho 8:
`{boss, combat, enemies, player, run, shop, special, xp}` — confere com o backlog. Simulando cortes:

| Corte | SCC resultante |
|-------|----------------|
| baseline | **8**: boss, combat, enemies, player, run, shop, special, xp |
| só `xp → run` | **8** (inalterado) — `xp → shop → run → enemies → xp` fecha sozinho |
| só `xp → shop` | **8** (inalterado) |
| `xp → run` **e** `xp → shop` | **5** {boss, combat, enemies, player, special} + **2** {run, shop} |
| só `enemies → xp` | **5** + **2** (mesmo resultado) |
| só `shop → run` | **7** (shop sai) |

`run ↔ shop` é um ciclo genuíno e independente: `shop.ts:57` (`closeShop → startNextWave`) e
`run.ts:288` (`checkWaveComplete → openShop`). Ele **não** cai com o corte de `xp`.

**Como evitar.** O corte mínimo é o **rabo de `closeLevelUp`**. `xp.ts:107-114` é a única função do
arquivo que usa `victory` (`xp.ts:45`) e `openShop` (`xp.ts:46`), e ela as usa só para resolver
`world.pendingAfterLevelUp`. Subir essa resolução para `step()` remove as **duas** arestas de uma vez
— um único edit, duas linhas de import a menos, e o resultado é 5 + 2. Se o objetivo for `sim/`
totalmente acíclico, o segundo corte é `closeShop → startNextWave` pela mesma técnica; mas isso é
escopo além do que a fase pediu.

**Sinal de alerta.** Alguém "confirma" que o corte funcionou olhando o diff em vez de rodar o cálculo.
**O plano deve incluir um teste que compute o SCC e assere o tamanho**, porque senão a regressão volta
na primeira aresta nova da fase 3.

### Pitfall 4: a ordem de `Object.keys(world.players)` é ordem de inserção

**O que dá errado.** `step.ts:21` faz `for (const id of Object.keys(world.players))`. As chaves são
`'p0'..'p3'` — strings não-numéricas, então o JavaScript preserva **ordem de inserção**, não ordem
lexicográfica.

**Medido.** Criando os mesmos quatro jogadores em ordens diferentes:

```
A (p0,p1,p2,p3) → Object.keys = p0,p1,p2,p3
B (p2,p0,p3,p1) → Object.keys = p2,p0,p3,p1
```

Como `updatePlayer` chama `attack` → `dealDamage` → `killEnemy` → `gainXp` e todos consomem
`world.rng` na mesma sequência global, trocar a ordem de iteração troca quem recebe qual sorteio. O
critério de sucesso 4 existe exatamente por isso.

**Como evitar.** D-13: iterar `world.config.players` (array, ordem canônica) indexando o Record.

```ts
// packages/sim/src/step.ts
// Iterate the canonical order from RunConfig, never Object.keys(world.players):
// object keys follow insertion order, so two peers that joined in a different
// order would step players in a different order and diverge.
for (const slot of world.config.players) {
  const p = world.players[slot.id];
  if (!p) continue;
  const input = inputs[slot.id];
  if (input) updatePlayer(world, p, input);
}
```

**Nota:** o teste do critério 4 precisa embaralhar a **ordem de criação** (`createPlayer`), não a
ordem do array `inputs` — é a inserção no Record que carrega a armadilha.

### Pitfall 5: `-0` — a descrição herdada está invertida, e o furo real é outro

**O que a documentação diz.** `CLAUDE.md` e a pesquisa registram: *"`hashWorld` precisa normalizar
`-0` para `0`, ou dois mundos idênticos hasheiam diferente."*

**O que o código faz.** `JSON.stringify(-0)` produz a string `"0"` — verificado. Como `hashWorld`
(`tests/helpers.ts:42`) é construído sobre `JSON.stringify`, **`-0` já está normalizado hoje** e não
existe o bug descrito. Varri o `World` inteiro recursivamente a cada tick por 6.000 ticks procurando
qualquer campo que chegasse a `-0`: **nenhum**.

**O furo real, e é pior.** `JSON.parse(JSON.stringify(-0))` devolve `+0` — o sinal é **perdido**. Isso
significa que:

1. `saveWorld`/`loadWorld` sobre JSON **não é lossless** para `-0`; e
2. um teste "round-trip verificado por hash antes e depois" (critério de sucesso 3) **passa com o
   dado corrompido**, porque o hash usa o mesmo caminho lossy que a serialização.

O hash não pode ser a única testemunha do seu próprio caminho de serialização.

**E `-0` vai passar a existir.** A quantização de D-03 usa `Math.round(v*127)`, e `Math.round(-0.4)`
é `-0` (verificado); `-0/127` também é `-0`. Sem normalização explícita, um joystick levemente
negativo injeta `-0` em `move.x`.

**Como evitar.**
1. Normalizar na fonte: `Math.round(v * 127) | 0` (verificado: devolve `+0`).
2. O teste de round-trip de FORM-07 precisa de uma verificação **estrutural** além do hash — um
   `deepEqualStrict` que use `Object.is` — ou de um caso sintético que grave `-0` num campo e
   asserte o que o formato promete.
3. Se a fase 3 trocar JSON por codec binário, `-0` volta a ser um problema de hash de verdade: em
   `Float64Array`, `-0` e `+0` têm padrões de bits diferentes. **Decida agora** se o formato
   canoniza ou preserva `-0`, e escreva no ADR.

**Bônus verificado, para não gastar esforço à toa:** JSON faz round-trip **exato** de doubles.
200.000 valores aleatórios em faixas de expoente de 2^-30 a 2^30: **zero** divergências. E
`Number.MAX_SAFE_INTEGER` (o `INDESTRUCTIBLE_HP` de `arena.ts:19`) sobrevive. O único buraco do JSON
para este `World` é o sinal do zero.

### Pitfall 6: `updateBossPattern` não tem teste, e o ramo `ring` está morto na suíte

**Medido.** `tests/boss.test.ts` tem 7 testes. `updateBossPattern` **nunca é chamado diretamente** por
teste nenhum (grep em `tests/`: zero ocorrências de `updateBossPattern`, `bossState` ou `chargeDir`).
Os dois testes do bloco "padrão de chefe" o exercitam **indiretamente**, via `updateEnemies` com
`zombie_king`, e asseram apenas `enemies.length` — ou seja, provam que o chefe invoca lacaios, e nada
sobre a máquina de estados.

Pior: `zombie_king` tem `abilities: { charge: 6500 }` e `ogre_warlord` tem
`{ charge: 8000, ring: 7000 }`. `ogre_warlord` aparece nos testes só em
`boss.test.ts:43` (`spawnBoss`, sem rodar ticks). **O ramo `ring` de `boss.ts:109-123` — 15 linhas
que empurram 12 ou 16 projéteis com `Math.cos`/`Math.sin` — nunca executa em teste algum.** É
literalmente uma das superfícies que o `sim/math.ts` vai perturbar.

**Como evitar.** Cobertura direta, chamando `updateBossPattern(world, e, dx, dy, dist)` com o inimigo
montado à mão:

| Caso | Entrada | Assere |
|------|---------|--------|
| Sem `abilities` | `e.abilities = null` | retorna `false`, nada muda |
| Enrage | `hp = maxHp*0.29`, não enraged | `enraged = true`, `speed × 1,35`, evento `float 'ENRAGED!'`; e **não dispara duas vezes** |
| `cdMult` | enraged vs não | cooldown efetivo 0,6× |
| `telegraph` | `bossState='telegraph'`, `stateT=1` | vai para `charging`, `stateT=520`, retorna `true` |
| `charging` normal | dentro dos limites | posição avança `speed*7*TICK_FACTOR`, retorna `true` |
| `charging` no muro | `x` fora de `play` | `stateT=0`, eventos `shake`+`explosion`, clamp aplicado |
| `recover` | `stateT=1` | vira `chase`, retorna `true` |
| `ring` | `ogre_warlord`, `cd.ring` maduro, `dist<420` | **12** projéteis; enraged → **16**; `cd.ring=0`; retorna `false` |
| `charge` | `dist` em `(120, 520)` | `bossState='telegraph'`, `chargeDir = {dx/dist, dy/dist}` |
| Fora de alcance | `dist=600` | nenhuma habilidade dispara, retorna `false` |

Esses testes precisam existir **antes** do `math.ts`, não depois — é a única forma de saber que a
mudança de hash veio da troca de trigonometria e não de uma regressão.

### Pitfall 7: `SPRITE_SCALE` vive em `sim/`, e sair dele muda o `SIM_VERSION`

**O que dá errado.** `SPRITE_SCALE = 2` está em `sim/constants.ts:59`, é importado por
`sim/enemies.ts:34`, e D-19 quer que ele "saia do código como conceito". Como o `SIM_VERSION` é hash
do bundle de `packages/sim` (D-07), remover uma constante de lá **fecha a temporada**.

Nesta fase isso é grátis — não existe placar. A partir da fase 9, não é. **A remoção de `SPRITE_SCALE`
de `sim/` precisa acontecer nesta fase ou na 7, nunca depois.** Se a fase 7 for tocar nele de novo,
registre isso no ADR de assets como consequência conhecida.

O mesmo raciocínio vale para `STAT_LABELS`/`PCT_STATS` (§ Padrão 4) e para
`world.nextWaveDelay` (§ Padrão 5): **toda limpeza de `sim/` fica cara depois do primeiro board.**
Faça as três no mesmo commit do re-baseline.

### Pitfall 8: o CI de teste não existe

**Medido.** `.github/workflows/` contém **um** arquivo, `deploy.yml`. Ele roda `npm run lint`,
`npm test` e `npm run build`, mas dentro do job de deploy e com `node-version: 20` — enquanto a
máquina de dev está no **Node 24.11.1** e o `CLAUDE.md` fixa Node 24 LTS. E `npm audit` acusa hoje
**3 moderate + 1 high + 1 critical**.

**Como evitar.** Um `ci.yml` separado, em `pull_request` e `push`, com Node 24, cache de npm **e**
cache dos navegadores do Playwright (chave = versão pinada), rodando: lint → `vitest run` (Node) →
`vitest run --browser` (3 motores) → validador de assets → build. O `deploy.yml` continua como está
até a fase 2 matá-lo.

---

## Code Examples

### 1. O portão cross-engine (critério de sucesso 1)

```ts
// vitest.browser.config.ts — the same test file runs in three engines.
// Playwright's browser builds ARE the variable under test: the version is
// pinned exactly in package.json, never with a caret.
import { defineConfig } from 'vitest/config';
import { playwright } from '@vitest/browser-playwright';

export default defineConfig({
  test: {
    include: ['tests/cross-engine.test.ts'],
    browser: {
      enabled: true,
      provider: playwright(),
      headless: true,
      instances: [
        { browser: 'chromium' },
        { browser: 'firefox' },
        { browser: 'webkit' },
      ],
    },
  },
});
```

```ts
// tests/cross-engine.test.ts — runs unchanged in Node and in all three browsers.
import { describe, it, expect } from 'vitest';
import { createWorld, createPlayer, startRun, hashWorld } from '@dg2/sim';
import { createStepper } from '../src/app/stepper';
import GOLDEN from './golden/campaign-mage-3000.json';

describe('determinismo entre motores', () => {
  it('a run de ouro produz o mesmo hashWorld neste motor', () => {
    const world = createWorld(GOLDEN.config);
    for (const slot of GOLDEN.config.players) {
      createPlayer(world, slot.id, slot.cls, slot.name);
    }
    startRun(world);
    createStepper(world).runTicks(GOLDEN.ticks, decodeInputLog(GOLDEN.log));

    // The engine name comes from the Vitest project name, so a failure
    // says "webkit > determinismo entre motores" without extra plumbing.
    expect(hashWorld(world)).toBe(GOLDEN.hash);
  });

  it('os hashes intermediários batem, para localizar o tick da divergência', () => {
    // ... same run, comparing GOLDEN.checkpoints every 60 ticks.
    // These checkpoints are TEST data, not part of the replay format (D-11).
  });
});
```

**Como o ouro é versionado e refeito.** `tests/golden/campaign-mage-3000.json` guarda `config`,
`ticks`, `log` (base64) e `hash`. Refazer é um script explícito
(`node tools/golden/rebaseline.mjs --confirm`) que **só roda em Node**, grava o novo valor, e imprime
o diff dos hashes. Regra do plano: **um PR que muda um hash-ouro não pode mudar mais nada** — assim o
`git log` de `tests/golden/` é a lista auditável de tudo que já alterou a simulação. O primeiro
re-baseline é o commit do `sim/math.ts`.

### 2. Codec do log de inputs (FORM-06)

```ts
// packages/protocol/src/inputCodec.ts
/** 2*pi/65536 — one turn split into 65536 steps (0.005493 degrees). */
export const AIM_STEP = (Math.PI * 2) / 65536;

/** Quantizes at CAPTURE time, before sim/ ever sees the value (D-02/D-03). */
export function quantize(raw: RawInput): InputState {
  // `| 0` matters: Math.round(-0.4) is -0, and -0 survives into the World but
  // NOT through JSON.stringify, which silently turns it into +0.
  const mx = Math.max(-127, Math.min(127, Math.round(raw.move.x * 127))) | 0;
  const my = Math.max(-127, Math.min(127, Math.round(raw.move.y * 127))) | 0;
  const q  = Math.round(raw.aim / AIM_STEP) & 0xffff;
  return {
    tick: raw.tick,
    move: { x: mx / 127, y: my / 127 },
    // Decode as int16, not uint16: that keeps `aim` in [-pi, pi), the same
    // domain Math.atan2 produces today, so combat.ts's angle-normalising
    // while-loops keep their current iteration count and their current bits.
    aim: ((q << 16) >> 16) * AIM_STEP,
    attack: raw.attack, special: raw.special, sprint: raw.sprint,
  };
}

export function packTick(idx: number, s: InputState, out: DataView, off: number): number {
  out.setInt8(off, Math.round(s.move.x * 127) | 0);
  out.setInt8(off + 1, Math.round(s.move.y * 127) | 0);
  out.setUint16(off + 2, Math.round(s.aim / AIM_STEP) & 0xffff, true);
  out.setUint8(off + 4, (s.attack ? 1 : 0) | (s.special ? 2 : 0) | (s.sprint ? 4 : 0));
  out.setUint8(off + 5, idx); // index into RunConfig.players (canonical order)
  return off + 6;
}
```

### 3. `SIM_VERSION` — etapa 2 do build

```js
// tools/sim-version/emit.mjs
// The hash of an artifact cannot live inside that artifact: injecting it would
// change the bytes and therefore the hash. So it lands in a sibling file.
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';

const BUNDLE = 'packages/sim/dist/sim.js';
const bytes = readFileSync(BUNDLE);
const simVersion = 'sha256:' + createHash('sha256').update(bytes).digest('hex').slice(0, 16);

writeFileSync(
  'packages/sim/dist/sim-version.json',
  JSON.stringify({ simVersion, bytes: bytes.length }, null, 2) + '\n',
);
console.log(`SIM_VERSION = ${simVersion}  (${bytes.length} bytes)`);
```

```ts
// packages/sim/vite.config.ts — reproducibility is a requirement, not a nicety.
// Measured on this repo: three consecutive builds produced byte-identical
// output (55425 B, same sha256) with zero absolute paths in the bundle.
import { defineConfig } from 'vite';
export default defineConfig({
  build: {
    lib: { entry: 'src/index.ts', formats: ['es'], fileName: () => 'sim.js' },
    target: 'es2022',
    sourcemap: false, // a sourcemap embeds paths; paths are not portable
    minify: true,
    emptyOutDir: true,
  },
});
```

### 4. Oráculo do port fdlibm

```ts
// tests/math-oracle.test.ts — @stdlib is a devDependency ONLY. It pulls 153
// transitive packages; packages/sim keeps dependencies: {}.
import { describe, it, expect } from 'vitest';
import stdlibSin from '@stdlib/math-base-special-sin';
import stdlibCos from '@stdlib/math-base-special-cos';
import stdlibAtan2 from '@stdlib/math-base-special-atan2';
import { sin, cos, atan2 } from '@dg2/sim/math';

// Deterministic corpus: mulberry32, never Math.random — a flaky corpus turns
// a 1-ULP regression into a test that fails once a week and gets muted.
function corpus(): number[] { /* ... covers every rempio2 branch ... */ }

describe('sim/math contra o oráculo fdlibm', () => {
  it('sin é bit-exato contra @stdlib', () => {
    for (const x of corpus()) {
      // toBe uses Object.is: -0 !== +0 here, which is exactly what we want.
      expect(Object.is(sin(x), stdlibSin(x))).toBe(true);
    }
  });

  // NOT `expect(sin(x)).toBe(Math.sin(x))`: measured, @stdlib and V8 disagree
  // on 0.92% of sin samples and 24.9% of atan2 samples, always by 1 ULP.
  // The engine's Math is the thing we are replacing, not the reference.

  it('recusa alto fora do domínio suportado', () => {
    expect(() => sin(2 ** 21)).toThrow(RangeError);
  });
});
```

### 5. Ordem canônica e round-trip (critérios 3 e 4)

```ts
// tests/serialize.test.ts
it('embaralhar a ordem de entrada não muda o resultado', () => {
  const run = (joinOrder: string[]) => {
    const w = createWorld(CONFIG);              // CONFIG.players is canonical: p0..p3
    for (const id of joinOrder) createPlayer(w, id, 'mage', id);
    startRun(w);
    createStepper(w).runTicks(600, scripted);
    return hashWorld(w);
  };
  expect(run(['p0', 'p1', 'p2', 'p3'])).toBe(run(['p2', 'p0', 'p3', 'p1']));
});

it('saveWorld/loadWorld faz round-trip sem perda', () => {
  const w = buildBusyWorld();
  const before = hashWorld(w);
  const back = loadWorld(saveWorld(w));
  expect(hashWorld(back)).toBe(before);
  // The hash alone is not enough: it goes through the same JSON path that
  // silently turns -0 into +0. Compare structurally, with Object.is.
  expect(strictDeepEqual(back, w)).toBe(true);
  expect(back.rng.save()).toBe(w.rng.save());
});
```

### 6. Validador de manifesto de assets (critério 5)

```js
// tools/assets/validate.mjs — runs in CI; ajv is a devDependency and never
// reaches the game bundle.
import Ajv from 'ajv';
import { readFileSync, readdirSync } from 'node:fs';
import { ENEMY_DEFS } from '../../packages/sim/dist/sim.js';

const ajv = new Ajv({ allErrors: true, strict: true });
const validate = ajv.compile(JSON.parse(readFileSync('tools/assets/schema/manifest.v1.json')));

let failed = 0;
for (const file of readdirSync('public/assets').filter(f => f.endsWith('.manifest.json'))) {
  const m = JSON.parse(readFileSync(`public/assets/${file}`));
  if (!validate(m)) {
    // The reader of this message is an agent in another repository: name the
    // file, the JSON pointer and the expected shape, never just "invalid".
    for (const e of validate.errors) {
      console.error(`${file}${e.instancePath}: ${e.message}`);
    }
    failed++;
    continue;
  }
  // Beyond the schema: sim/defs owns the hitbox, the manifest declares the
  // art, and CI checks coverage (D-23). necro_lord's hitbox is LARGER than
  // its drawn sprite, so this is a declared tolerance, never an equality.
  for (const [key, sprite] of Object.entries(m.entities ?? {})) {
    const def = ENEMY_DEFS[key];
    if (!def) { console.error(`${file}: '${key}' is not in sim/defs/enemies.ts`); failed++; continue; }
    if (sprite.w * sprite.scale < def.w * sprite.hitboxTolerance) {
      console.error(`${file}: '${key}' sprite ${sprite.w}x${sprite.h} does not cover hitbox ${def.w}x${def.h}`);
      failed++;
    }
  }
}
process.exit(failed ? 1 : 0);
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| "Chrome × Firefox divergem em `sin`; Chrome × Chrome não" | **Node 24 e Chromium 151 são ambos V8 e divergem em 3,19% de `sin`** (medido hoje) | Contínuo; o V8 muda entre versões | "Exigir o mesmo motor" não é saída nem dentro da mesma família |
| `provider: 'playwright'` como string no config do Vitest | Pacote `@vitest/browser-playwright` importado como função | Vitest 4 (out/2025) | Um novo devDependency explícito; o config antigo não é mais válido |
| `test.workspace` / projetos separados por navegador | `test.browser.instances` | Vitest 3 | Cache melhor e um relatório único; é a forma recomendada hoje `[CITED: docs Vitest — blog/vitest-3]` |
| Verificação de replay "custa 1-1,5 s por run" (estimativa da pesquisa anterior) | **0,29 s por run de 20 min** (medido: 3,97 µs/tick) | — | A fila de verificação da fase 9 é ainda mais folgada do que se supunha |
| `World` de wave 1 ocupa 13,8 KB | **12,5 KB na wave 1, 17,7 KB na wave 16** (medido, 4 jogadores) | — | A wave 16 já estoura os 16 KiB do DataChannel com só 12 inimigos vivos |
| Contagem de trigonometria: "26 ou 30 call sites" | **27** (12 `sin`, 12 `cos`, 3 `atan2`), 7 arquivos | — | Fecha o gap registrado em `research/SUMMARY.md:572` |
| "`sim/` tem 15 módulos" | **24 arquivos** (19 em `sim/`, 5 em `sim/defs/`), 2.974 LOC | — | O número de LOC estava certo; o de arquivos, não |

**Deprecado/desatualizado neste repositório:**
- `deploy.yml` roda testes em `node-version: 20`; a máquina de dev e o `CLAUDE.md` estão em Node 24.
- Vite 5.4.21 carrega o GHSA-fx2h-pf6j-xcff (bypass de `server.fs.deny` no Windows), e a máquina é
  Windows. `npm audit`: 3 moderate + 1 high + 1 critical.
- `tests/purity.test.ts:62` assere `>= 15` arquivos em `sim/`; são 24. Assertion frouxa que não pega
  um arquivo perdido na extração — aperte no mesmo commit.

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | O `WebKit` do Playwright se comporta como o Safari real do iOS para efeito de `Math.sin`. **É build própria do Playwright, rodando sobre a libm do Windows nesta máquina** — não é o JavaScriptCore da Apple num iPhone | Pitfall 1 | O portão de CI continua válido (ele testa as builds do Playwright, que é o que o CI roda), mas **não prova nada sobre iOS**. Como a opção A elimina a dependência de libm por completo, o risco prático é baixo — mas não escreva "testado no Safari" em lugar nenhum |
| A2 | Um port fiel do `@stdlib` produz saída bit-idêntica ao `@stdlib`. Provei com o **próprio `@stdlib`** injetado, não com um port meu | Pitfall 2, Padrão 1 | Se a transcrição para TS mudar a ordem de uma operação, o resultado muda 1 ULP e o oráculo pega — que é a razão de o oráculo existir. Risco contido pelo teste |
| A3 | Vite 7.3.6 mantém a reprodutibilidade byte-a-byte que medi no Vite 5.4.21 | Padrão 4 | Se não mantiver, `SIM_VERSION` fica instável entre máquinas. **Refaça a medição dos três builds logo após o upgrade** — é um comando |
| A4 | O domínio `\|x\| < 2^20` cobre todo ângulo que o sim produz hoje **e no futuro** | Padrão 1 | Um recurso futuro (acumulador de fase, tempo em radianos) poderia estourar. O `throw` transforma o risco silencioso num crash localizável, que é o objetivo |
| A5 | O log de inputs de uma run de 20 min cabe em 20-40 KB gzipado (D-10) | Padrão 2 | Não medi — não existe log ainda. 72.000 ticks × 6 B = 432 KB crus; o delta+RLE de D-12 é que faz a conta fechar. **Meça na primeira run gravada**, antes de fixar o orçamento de upload da fase 9 |
| A6 | `esbuild` com `minify: true` é determinístico entre versões diferentes do esbuild | Padrão 4 | Não é — e não precisa ser. É justamente o que D-07 quer capturar: mudar a toolchain fecha a temporada, por decisão |
| A7 | A tolerância de cobertura hitbox↔sprite é declarada por entrada no manifesto | Padrão 8 | Se for uma constante global, `necro_lord` (hitbox maior que o sprite) quebra o validador ou obriga a afrouxar a regra para todos |

---

## Open Questions

1. **`STAT_LABELS`/`PCT_STATS` saem de `sim/stats.ts`?**
   - O que sabemos: são vocabulário de HUD (`ui/screens.ts:14`, `ui/shop.ts:17`), estão dentro do
     bundle de `packages/sim`, e portanto dentro do `SIM_VERSION` (D-06/D-07).
   - O que não está claro: se D-06 ("ajuste de HUD não fecha a temporada") deve ser honrado
     movendo-os, ou se a exceção é aceitável.
   - Recomendação: **mover para `ui/`** nesta fase, junto com a remoção de `SPRITE_SCALE` e
     `nextWaveDelay`. Custa minutos agora e uma temporada fechada à toa depois.

2. **O `playerId` local vira `p0` (hoje é `'p1'` em 6 lugares de `main.ts`)?**
   - O que sabemos: FORM-01/D-30 definem os slots como `p0..p3`. O código usa `'p1'` para o jogador
     solo.
   - O que não está claro: se a troca acontece nesta fase ou na 3 (quando a autoridade atribui slots).
   - Recomendação: **trocar nesta fase**, no mesmo commit do re-baseline de hashes — porque muda o
     hash e você só quer pagar esse re-baseline uma vez.

3. **`sim/` fica totalmente acíclico ou para em 5 + 2?**
   - O que sabemos: o corte do rabo de `closeLevelUp` leva a `{boss, combat, enemies, player,
     special}` + `{run, shop}`. Quebrar `run ↔ shop` exige o mesmo tratamento em
     `closeShop → startNextWave`.
   - Recomendação: parar em 5 + 2 nesta fase (é o que o roadmap pediu) e **registrar o segundo corte
     no backlog**, porque a fase 3 vai acrescentar arestas.

4. **Codificação de `aim`: `int16` ou `uint16` na decodificação?**
   - O que sabemos: `int16` preserva a faixa `[−π, π)` que o sim vê hoje; `uint16` a move para
     `[0, 2π)` e muda a contagem de iterações dos laços de normalização de ângulo em
     `combat.ts:97-98,111-112`, o que muda bits no limite do arco de melee.
   - Recomendação: **`int16`**. O fio continua carregando 16 bits; só a interpretação muda.

5. **Quem pode refazer um hash-ouro, e como isso é auditado?**
   - Área de discrição explícita do CONTEXT.
   - Recomendação: script dedicado com `--confirm`, rodando **só em Node**, e a regra de que um PR que
     mexe em `tests/golden/` não mexe em mais nada. Assim `git log -- tests/golden/` é a história
     completa das mudanças de simulação — que é exatamente o que a fase 9 vai precisar consultar.

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | tudo | ✓ | **24.11.1** | — |
| npm (workspaces) | D-14 | ✓ | **11.6.2** | — |
| Vitest | suíte atual | ✓ | **2.1.9** (alvo 4.1.11) | — |
| Vite | build | ✓ | **5.4.21** (alvo 7.3.6) | — |
| esbuild | bundle | ✓ | **0.21.5** (via Vite) | — |
| Playwright (npm) | portão cross-engine | ✓ | **1.62.1** | — |
| Chromium (build do Playwright) | portão cross-engine | ✓ | 151.0.7922.34 (`chromium-1234`) | — |
| Firefox (build do Playwright) | portão cross-engine | ✓ | 153.0 — **instalado durante esta pesquisa** | — |
| WebKit (build do Playwright) | portão cross-engine | ✓ | 26.5 — **instalado durante esta pesquisa** | — |
| `@stdlib/math-base-special-*` | oráculo do port | ✓ (registro) | 0.3.1 | Vetores de referência gravados em arquivo, se a devDependency incomodar |
| `ajv` | validador de manifesto | ✓ (registro) | 8.20.0 | Validador à mão (não recomendado) |
| `slopcheck` | auditoria de pacotes | ✓ | 0.6.1 (via `python -m slopcheck`) | — |
| Rede para `npm ci` no CI | CI | ✓ | — | — |
| GitHub Actions | CI | ✓ (só `deploy.yml` existe) | — | — |

**Missing dependencies with no fallback:** nenhuma.

**Missing dependencies with fallback:** nenhuma.

**Notas de ambiente que o plano precisa tratar:**
- O **CI ainda não tem os navegadores**. Um passo `npx playwright install --with-deps chromium firefox
  webkit` é obrigatório, e o cache deve ser chaveado pela versão **exata** do Playwright.
- O binário do `slopcheck` não fica no `PATH` desta máquina; ele funciona via
  `python -m slopcheck`. O comando dele também aborta com `FileNotFoundError` ao tentar invocar `npm`
  no final — o **veredito sai antes** do erro, então a auditoria é utilizável, mas não encadeie o
  `slopcheck install` com o install de verdade num script.
- `docs/adr/` e `tools/` **não existem** — são diretórios novos desta fase.

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest 2.1.9 hoje → **4.1.11** (alvo) + `@vitest/browser-playwright` 4.1.11 |
| Config file | **Nenhum** hoje — Vitest roda com defaults sobre `vite.config.ts`. Nasce `vitest.config.ts` + `vitest.browser.config.ts` (Wave 0) |
| Quick run command | `npx vitest run <arquivo>` (a suíte inteira leva **2,3 s**) |
| Full suite command | `npm test && npx vitest run --config vitest.browser.config.ts` |
| Estado atual | **244 testes em 21 arquivos, todos verdes** |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| FORM-01 | Os três espaços de identidade estão em ADR; o `World` não contém `accountId` nem `peerId` | unit | `npx vitest run tests/identity.test.ts` | ❌ Wave 0 |
| FORM-02 | `step()` itera a ordem canônica; embaralhar a entrada não muda o hash | unit | `npx vitest run tests/canonical-order.test.ts` | ❌ Wave 0 |
| FORM-03 | Dois builds consecutivos dão o mesmo `SIM_VERSION`; um edit em `sim/` muda-o | integration | `node tools/sim-version/verify.mjs` | ❌ Wave 0 |
| FORM-04 | Mesmo `hashWorld` em node/chromium/firefox/webkit contra o ouro | integration | `npx vitest run --config vitest.browser.config.ts` | ❌ Wave 0 |
| FORM-04 | `sim/math.ts` bit-exato contra o oráculo `@stdlib`; `throw` fora do domínio | unit | `npx vitest run tests/math-oracle.test.ts` | ❌ Wave 0 |
| FORM-05 | Saldo = soma do ledger; evento duplicado é no-op; gasto é negativo | unit | `npx vitest run tests/ledger.test.ts` | ❌ Wave 0 |
| FORM-05 | ULID: 26 chars, alfabeto Crockford, monotônico no mesmo ms | unit | `npx vitest run tests/ulid.test.ts` | ❌ Wave 0 |
| FORM-06 | `encode(decode(x)) === x`; `-0` normalizado; pacote de 6 bytes; buraco = último input | unit | `npx vitest run tests/input-codec.test.ts` | ❌ Wave 0 |
| FORM-07 | `saveWorld`/`loadWorld` round-trip por hash **e** por `Object.is` estrutural; RNG restaurado | unit | `npx vitest run tests/serialize.test.ts` | ❌ Wave 0 |
| FORM-08 | `world.objectives` sobrevive ao round-trip; não é evento drenável | unit | `npx vitest run tests/serialize.test.ts` | ❌ Wave 0 |
| FORM-09 | Manifesto bom passa; manifesto ruim é recusado com mensagem apontando o campo | integration | `node tools/assets/validate.mjs` | ❌ Wave 0 |
| FORM-10 | `stepper.advance(ms)` produz n ticks exatos; `MAX_CATCHUP` respeitado; sem relógio | unit | `npx vitest run tests/stepper.test.ts` | ❌ Wave 0 |
| FORM-11 | Snapshot dos enums; inserir no meio falha, acrescentar no fim passa | unit | `npx vitest run tests/protocol-enums.test.ts` | ❌ Wave 0 |
| FORM-12 | Nenhum fonte de `packages/protocol` contém `/\bhost\b/i` fora de comentário | unit | `npx vitest run tests/protocol-vocabulary.test.ts` | ❌ Wave 0 |
| (invariante) | `packages/sim` mantém `dependencies: {}`; pureza; SCC ≤ 5 | unit | `npx vitest run tests/purity.test.ts` | ⚠️ existe, precisa de 3 asserções novas |
| (invariante) | `updateBossPattern`: 10 casos diretos (§ Pitfall 6) | unit | `npx vitest run tests/boss.test.ts` | ⚠️ existe, sem cobertura direta |

### Sampling Rate

- **Por commit de task:** `npx vitest run` (Node) — 2,3 s hoje. Não roda navegador.
- **Por merge de wave:** `npm test` **+** `npx vitest run --config vitest.browser.config.ts` (3
  motores). É o portão que só faz sentido rodar quando algo de `sim/` mudou.
- **Portão de fase:** suíte completa verde nos quatro motores + `node tools/assets/validate.mjs` +
  `node tools/sim-version/verify.mjs`, antes de `/gsd:verify-work`.

### Wave 0 Gaps

- [ ] `vitest.config.ts` — nasce com a extração de workspaces (não existe hoje)
- [ ] `vitest.browser.config.ts` — instâncias chromium/firefox/webkit
- [ ] `.github/workflows/ci.yml` — Node 24, cache de npm + de navegadores do Playwright
- [ ] `tests/golden/campaign-mage-3000.json` — ouro inicial (gravado **antes** do `math.ts`, para
      provar que o portão falha; refeito **depois**, para provar que ele passa)
- [ ] `tools/golden/rebaseline.mjs` — o único caminho auditável para mudar um ouro
- [ ] `tests/cross-engine.test.ts` — cobre FORM-04
- [ ] `tests/math-oracle.test.ts` — cobre FORM-04 (`@stdlib` como oráculo)
- [ ] `tests/canonical-order.test.ts` — cobre FORM-02 (critério 4)
- [ ] `tests/serialize.test.ts` — cobre FORM-07/FORM-08 (critério 3)
- [ ] `tests/input-codec.test.ts` — cobre FORM-06
- [ ] `tests/stepper.test.ts` — cobre FORM-10
- [ ] `tests/protocol-enums.test.ts` + `tests/protocol-vocabulary.test.ts` — FORM-11/FORM-12
- [ ] `tests/ledger.test.ts` + `tests/ulid.test.ts` — FORM-05
- [ ] `tests/identity.test.ts` — FORM-01
- [ ] `tools/assets/schema/manifest.v1.json` + `validate.mjs` + fixtures boa/ruim — FORM-09
- [ ] `tests/scc.test.ts` — assere que o componente fortemente conexo de `packages/sim` não passa de 5
- [ ] Ampliar `tests/boss.test.ts` com os 10 casos de `updateBossPattern`
- [ ] Ampliar `tests/purity.test.ts`: asserir `dependencies: {}` e apertar o `>= 15` para o número
      real de arquivos

*Instalação de framework: nenhuma — Vitest já está no projeto. O que falta é o upgrade para 4.1.11 e
os dois pacotes de navegador.*

---

## Security Domain

Esta fase não tem rede, não tem servidor, não tem autenticação e não processa entrada de terceiros
em runtime. A superfície de segurança é a **cadeia de suprimentos** e a **integridade do formato**.

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | não | Contas só existem na fase 6 |
| V3 Session Management | não | Idem |
| V4 Access Control | não | Nenhum recurso protegido nesta fase |
| V5 Input Validation | **sim (parcial)** | O `InputState` é validado **dentro de `step()`** (clamp de `move` em `[-1,1]`, `aim` no domínio), nunca num validador à parte — C-8. O validador de manifesto usa `ajv` com `strict: true` |
| V6 Cryptography | **sim (parcial)** | `SIM_VERSION` usa `node:crypto` SHA-256 (nunca hash caseiro). O ULID usa `crypto.getRandomValues`, nunca `Math.random`. **Nenhuma criptografia é escrita à mão** |
| V14 Configuration | **sim** | Versões pinadas no `package-lock.json`; Playwright pinado exato; `npm audit` hoje acusa 1 high + 1 critical, resolvidos pelo upgrade do Vite |

### Known Threat Patterns for este stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Slopsquat / typosquat em devDependency nova | Tampering | `slopcheck` antes de instalar (executado; 12 OK, 1 falso positivo justificado) |
| Bypass de `server.fs.deny` do Vite no Windows (GHSA-fx2h-pf6j-xcff) | Information Disclosure | Upgrade para Vite 7.3.6; até lá, prender o dev server em `localhost` |
| Formato de replay como amplificador de CPU (teto de ticks) | Denial of Service | Fora do escopo desta fase (é a fase 9), **mas o campo de teto tem de existir no formato agora** — acrescentá-lo depois é migração |
| `SIM_VERSION` forjado pelo cliente | Spoofing | A recusa de D-08 é simétrica e a autoridade compara com o **próprio** valor; o cliente nunca escolhe a versão de referência |
| `eventId` de ledger colidindo ou sendo reusado | Tampering | ULID com 80 bits de aleatoriedade criptográfica + `UNIQUE(id)` no servidor (fase 6); o teste de monotonicidade mora aqui |
| Manifesto de assets malicioso vindo de PR externo | Tampering | `ajv` com `strict: true`, validador rodando em CI **antes** de qualquer merge; nenhuma execução de código a partir do manifesto |

---

## Sources

### Primary (HIGH confidence)

- **Este repositório, executado em 2026-08-31.** Todas as medições numéricas deste documento
  (divergência entre motores, tamanho de `World`, custo por tick, SCC via Tarjan, contagem de
  `Math.*` com comentários removidos, reprodutibilidade do bundle, `-0`, round-trip de JSON,
  quantização de `aim`/`move`, compilação de `src/sim` sem `DOM`). Nenhum arquivo de medição ficou no
  repositório — `git status` limpo.
- **Playwright 1.62.1** com Chromium 151.0.7922.34, Firefox 153.0 e WebKit 26.5, mais Node 24.11.1
  (V8 13.6.233.10) — o experimento de determinismo cross-engine e o experimento de convergência com
  o shim fdlibm.
- **Código-fonte de `@stdlib/math-base-special-{sin,cos,atan2,kernel-sin,kernel-cos,rempio2,atan}`
  0.3.1**, instalado e lido: contagem de linhas por função, a constante `MEDIUM = 0x413921fb` que
  delimita o caminho Payne-Hanek, e os arrays de escratch `TX`/`TY` em escopo de módulo.
- **Registro npm consultado diretamente em 2026-08-31** — versões e `peerDependencies` de todos os
  pacotes recomendados.
- **`slopcheck` 0.6.1** — auditoria de legitimidade dos 13 pacotes.
- **Documentação do Vitest via Context7** (`/vitest-dev/vitest`) — `browser.instances` com
  `@vitest/browser-playwright`, `docs/guide/browser/multiple-setups.md` e `docs/config/browser/playwright.md`.
- **`github.com/ulid/spec`** — layout de 128 bits, alfabeto Crockford Base32, regra de monotonicidade.
- **`.planning/`** — `PROJECT.md`, `REQUIREMENTS.md`, `ROADMAP.md`, `STATE.md`, `01-CONTEXT.md`,
  `research/{SUMMARY,STACK,PITFALLS,ARCHITECTURE,FEATURES}.md`.
- **`docs/BACKLOG.md`, `docs/DECISOES-MARCO0.md`, `docs/PARIDADE.md`** — dívida triada do Marco 0.

### Secondary (MEDIUM confidence)

- **ECMA-262** (`tc39.es/ecma262`, seção do objeto `Math`) — `sin`/`cos`/`atan2` são
  *implementation-approximated*; `+ − × ÷ sqrt` são IEEE-754 com arredondamento correto. Citado a
  partir do `CLAUDE.md` e de `research/STACK.md`, não relido nesta sessão — mas **confirmado
  empiricamente** pelas medições acima.
- **`CLAUDE.md`** — a tabela de stack e as decisões de determinismo (opção A) que esta pesquisa
  reconfirma e, em três pontos, corrige.

### Tertiary (LOW confidence)

- A afirmação de que o WebKit do Playwright representa o Safari do iOS. **Não verificada**, marcada em
  A1 do Assumptions Log.
- O orçamento de 20-40 KB gzipado para o log de inputs (D-10). Herdado da pesquisa anterior, **não
  medido** — marcado em A5.

---

## Metadata

**Confidence breakdown:**

- **Determinismo entre motores e a solução: HIGH** — executado nos quatro motores, com e sem o port,
  neste repositório, hoje. Não é inferência.
- **Custo e forma do port fdlibm: HIGH** — LOC contadas no código real do `@stdlib`; a constante que
  delimita o domínio lida do fonte.
- **SCC e o corte correto: HIGH** — Tarjan rodado sobre o grafo real, com simulação de cada corte
  candidato. Corrige o `BACKLOG.md` e o roadmap.
- **Serialização, `-0`, round-trip de JSON: HIGH** — 200.000 amostras e uma varredura recursiva de
  6.000 ticks.
- **Reprodutibilidade do bundle / `SIM_VERSION`: MEDIUM-HIGH** — medida três vezes no Vite 5.4.21;
  precisa de nova medição após o upgrade para 7.3.6 (A3).
- **Quantização de input: HIGH nos números, MEDIUM na consequência de tuning** — o passo, o erro e a
  idempotência foram medidos; o efeito de +0,22% na magnitude diagonal é aritmética verificada, mas
  o efeito **na jogabilidade** não foi jogado.
- **Spec de assets: MEDIUM** — a relação hitbox↔sprite foi medida entrada por entrada, mas a forma do
  JSON Schema é desenho, não descoberta.
- **Orçamento do log de inputs: LOW** — herdado, não medido (A5).

**Research date:** 2026-08-31
**Valid until:** ~2026-09-30 para o stack e as versões. **Sem prazo** para as medições feitas neste
repositório — elas só mudam quando o código mudar. A medição cross-engine, porém, muda a cada
atualização de motor: é exatamente por isso que ela vira teste de CI em vez de ficar num documento.
