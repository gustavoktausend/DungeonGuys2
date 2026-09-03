---
phase: 3
slug: sala-transporte-e-protocolo
status: approved
shadcn_initialized: false
preset: none
created: 2026-09-03
---

# Phase 3 — UI Design Contract

> Contrato visual e de interação das telas novas desta fase: criar/entrar na sala, lobby,
> erro de conexão, sala morta, divergência de hash e o indicador de rede da run.
> Gerado pelo gsd-ui-researcher, verificado pelo gsd-ui-checker.
>
> Rótulos de estrutura ficam em inglês porque são lidos por ferramenta. O conteúdo é em
> português, como o resto dos documentos do projeto.
>
> **Regra que governa este documento inteiro:** as telas desta fase são **telas novas no
> padrão existente**. Nenhum token novo, nenhuma família de fonte nova, nenhuma cor nova,
> nenhuma dependência. Onde este documento parece inventar algo, ele está citando
> `src/style.css` ou `index.html` — com linha.

---

## Design System

| Property | Value |
|----------|-------|
| Tool | **none** — sem shadcn, sem Tailwind, sem biblioteca de componentes |
| Preset | not applicable |
| Component library | **none** — HTML/CSS à mão em `index.html` + `src/style.css`, dirigido por `src/ui/` |
| Icon library | **none** — glifos literais no markup (`▶ ✕ ↺ ◆ ⚔ ★ ∞ ⚒`), sem pacote de ícones |
| Font | `--display-font: 'Press Start 2P'` (títulos, botões, rótulos) e `--pixel-font: 'Pixelify Sans'` (prosa), ambas auto-hospedadas em `public/fonts/` por D2-20 |

**Gate do shadcn: recusado, com motivo.** `components.json`, `tailwind.config.*` e
`postcss.config.*` não existem; não há React. A restrição de `dependencies: {}` no jogo
publicado (CLAUDE.md § Constraints) proíbe qualquer biblioteca de runtime — e um design
system que exige build de componentes seria a primeira. Registry safety gate: não se aplica.

**O sistema existente, catalogado** (não re-especificar, só reusar):

| Peça | Onde | Como esta fase usa |
|---|---|---|
| Casca de tela (`.screen` / `.screen-inner.compact`) | `style.css:90-142,1271-1283` | As quatro telas novas são `<div class="screen"><div class="screen-inner compact">` — moldura de madeira dupla, painel indigo, sem borda arredondada |
| Placa de título (`.shop-title`) | `style.css:1287-1294` | Título de cada tela nova |
| Botão primário (`.btn-pixel`) | `style.css:1295-1306` | Ação principal de cada tela |
| Botão secundário (`.btn-pixel.secondary`) | `style.css:1304-1305` | Voltar / sair / tentar de novo |
| Card selecionável (`.class-card`) | `style.css:206-232,1309-1316` | Base visual do card de slot e do seletor de classe do lobby (**com nome de classe próprio** — ver Component Inventory) |
| Slot vazio (`.slot-chip.empty`) | `style.css:824,1381` | Estado "vazio" do slot |
| Campo de texto (`#hero-name`) | `style.css:296-315,1325-1328` | Base visual do campo de código |
| Cores de status (`.fx-pos` / `.fx-neg`) | `style.css:1344-1345` | Faixas de qualidade do ping |
| `showScreen(name)` / `hideAllScreens()` | `src/ui/screens.ts:29-38` | Troca de tela; as telas novas entram em `dom.screens` |
| `announce(text)` | `src/ui/screens.ts:185-196` | Toast central de 2600 ms — **uso restrito**, ver Accessibility |
| Blur + `Sfx.play('click')` global em todo `<button>` | `src/ui/settings.ts:32-35` | Botão novo ganha som e perde foco de graça — ver Accessibility |
| `dom` resolvido uma vez + `tests/dom-ids.test.ts` | `src/ui/dom.ts`, `tests/dom-ids.test.ts` | Todo id novo entra em `dom.ts` **no mesmo commit** do markup |

**Idioma da interface.** Copy nova em **português do Brasil com acento**. Precedente já
publicado: `index.html:119` (`⟳ RECARREGAR AGORA`, D2-09), `screens.ts:265`
(`announce('NOVA VERSÃO PRONTA')` — `Ã` na `--display-font`) e `index.html:60`
(`COPROBÔ`, `Ô` na mesma fonte). As telas legadas seguem em inglês; **traduzi-las está fora
do escopo desta fase** e não é dívida desta fase.

**Vocabulário (FORM-12).** No código, no protocolo, em nome de variável, de arquivo e de
mensagem: *autoridade / peers / slots*. Na tela, para o jogador: **"quem criou a sala"**.
`tests/protocol-vocabulary.test.ts` faz o grep; a copy desta tabela é a única fonte de texto
de tela desta fase.

---

## Spacing Scale

Valores declarados para **todo CSS novo** (múltiplos de 4, sem exceção):

| Token | Value | Usage nesta fase |
|-------|-------|------------------|
| xs | 4px | Espaço entre o nome do slot e a linha de ping; padding interno do chip "você" |
| sm | 8px | Gap dentro do card de slot; padding vertical de chip |
| md | 12px | Gap entre cards de slot; gap do seletor de classe (bate com `.class-cards` e `.toggle-row`, `style.css:189,493`) |
| lg | 16px | Gap entre blocos de uma tela (código ↔ slots ↔ ações); padding horizontal de botão |
| xl | 24px | Separação entre os dois blocos da tela de sala (criar ↔ entrar) |
| 2xl | 32px | Não usado nesta fase |
| 3xl | 64px | Não usado nesta fase |

**Exceptions** — herdadas de classes existentes, **usadas sem redeclarar**, nunca copiadas
para regra nova:

1. `.screen-inner` `padding: 42px 52px` / `.screen-inner.compact` `padding: 32px 44px; gap: 18px` (`style.css:113,142`).
2. Bordas de 3px do skin craftpix (`style.css:1274,1297,1311`) — é a espessura do pixel-art, não espaçamento.
3. `min-height: 44px` em todo controle interativo novo — alvo de toque, ver Accessibility. Precedente: `#btn-touch-pause` é 44×44 (`style.css:1058-1062`).
4. Avatar do slot: canvas de **48×56**, exatamente o `#color-preview` (`index.html:79`), para reusar a escala `s = 1.7` de `settings.ts:113-124` sem recalibrar.

**Layout responsivo:** `src/style.css` não tem **nenhuma** `@media`. O responsivo do projeto
é `clamp()` + `flex-wrap` + `.screen-inner { max-height: 92vh; overflow-y: auto }`. As telas
novas seguem isso: nenhuma media query nova, os quatro cards de slot num
`display: flex; flex-wrap: wrap; gap: 12px` que quebra sozinho no celular.

---

## Typography

Três famílias-papel, quatro tamanhos, **dois pesos**. Todos os `clamp()` abaixo já existem
no arquivo — a coluna "origem" prova.

| Role | Size | Weight | Line Height | Família | Origem do valor |
|------|------|--------|-------------|---------|-----------------|
| Display — código da sala | `clamp(20px, 5vw, 38px)` | 400 | 1.15 | Press Start 2P | `style.css:1258` (`.title-glow/.title-main`) |
| Heading — placa de título da tela | `clamp(13px, 2.6vw, 20px)` | 400 | 1.2 | Press Start 2P | `style.css:1260` (`.shop-title`) |
| Label — botões, nome do slot, chips, rótulos | `clamp(11px, 1.8vw, 15px)` | 400 | 1.2 | Press Start 2P | `style.css:1266` (`.btn-pixel`) |
| Body — prosa, erro, ping, dica | `clamp(11px, 1.5vw, 14px)` | 400 (600 em valor destacado) | 1.5 | Pixelify Sans | `style.css:1110` (`#class-record`); `line-height: 1.5` de `.class-desc` (`style.css:255`) |

**Os dois pesos:** 400 e 600. Press Start 2P só existe em 400 — é fonte de um peso só, e é
por isso que ela nunca carrega ênfase. O 600 vem do eixo `wght` da Pixelify Sans
(`style.css:22-28`) e é **reservado** para o valor dentro de uma frase: o número do ping, os
dois números de versão na recusa por versão, e os dois hashes na tela de divergência. Em
nenhum outro lugar.

**Caixa:** UPPERCASE só em Label/Heading/Display (botão, nome, chip, título) — é o padrão do
jogo. Prosa em **caixa de frase**, na Body, com ponto final. Precedente:
`index.html:120` (`Survive the waves. Collect gold. Die gloriously.`). Frase de erro em caixa
alta é ilegível e não vai acontecer nesta fase.

**Nome de jogador é conteúdo remoto.** `heroName()` (`settings.ts:200-203`) já entrega
maiúscula e no máximo 12 caracteres, mas o nome que chega do peer não passou por lá. Ao
pintar: `textContent` (nunca `innerHTML` — o cabeçalho de `screens.ts:56-71` avisa que é
**esta fase** que abre esse buraco), corte duro em 12 pontos de código, e
`overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 12ch` para que
nenhum nome empurre layout.

**Glifos:** só o conjunto já publicado — `▶ ✕ ↺ ◆ ⚔ ★ ∞ ⚒ ✦ »`. Glifo fora dessa lista cai
na fonte do sistema e quebra o look pixel; se um for necessário, ele entra por decisão, não
por descuido.

---

## Color

Zero token de cor novo. A paleta efetiva do jogo é o skin craftpix (`style.css:51-58`), que
sobrepõe o bronze/dourado original.

| Role | Value | Usage |
|------|-------|-------|
| Dominant (60%) | `--cp-panel` **#222034** sobre o fundo de tela `radial-gradient(#2a1d12 → #0a0a0f)` (`style.css:1270`) | Painel de toda tela nova, e o fundo atrás dela |
| Secondary (30%) | `--cp-panel-edge` **#2c2a46** (card de slot), `--cp-wood-frame` **#3f3f74** (moldura, botão secundário), `--cp-header` **#45283c** (placa de título) | Superfícies de segundo nível: cards de slot, seletor de classe, campo de código, placas |
| Accent (10%) | `--cp-btn` **#49662f** (com `--cp-btn-hi` #6d9447 no realce) | Ver lista fechada abaixo |
| Destructive | `--cp-accent` **#ac3232** (`--cp-accent-hi` #d05a5a no texto sobre painel) | Erro, divergência, badge de relay forçado |
| Tinta | `--cp-ink-light` **#ece9f7** (texto principal), `--cp-ink-dark` **#c7c3e0** (texto secundário) | Texto |

**Accent reserved for** — lista fechada, nesta fase o verde `--cp-btn` aparece **só** em:

1. `#btn-create-room` — "▶ CRIAR SALA"
2. `#btn-join-room` — "▶ ENTRAR"
3. `#btn-start-run` — "▶ INICIAR" (só a autoridade vê)
4. `#btn-retry-join` — "↺ TENTAR DE NOVO"
5. O card de classe **selecionado** no seletor do lobby (`.lobby-class-card.selected`)

Voltar, sair e copiar link são `.btn-pixel.secondary` (violeta `--cp-wood-frame`). Nenhum
outro elemento desta fase é verde.

**Destructive reserved for:**

1. `#room-error` — texto de recusa/falha (`--cp-accent-hi`, sobre o painel)
2. A placa de título da tela de divergência (`--cp-accent` de fundo)
3. `#btn-relay-flag` — o badge de relay forçado (fundo `--cp-accent`, tinta `--cp-ink-light`)
4. O estado ruim do ping ("sem resposta" / > 150 ms)

**Faixas de qualidade do ping** — reusam as cores de status já declaradas (`style.css:1344-1345`):

| Faixa | Cor | Contraste sobre #2c2a46 |
|---|---|---|
| ≤ 80 ms | **#8fbf6a** (`.fx-pos`) | ~6,3:1 — passa AA |
| 81–150 ms | `--cp-ink-dark` **#c7c3e0** | ~11:1 — passa AA |
| > 150 ms ou "sem resposta" | **#d9605a** (`.fx-neg`) | ~3,5:1 — **abaixo de AA para texto pequeno** |

O vermelho fica, com a mitigação escrita: **a cor nunca é o único sinal**. O texto já diz o
número ou diz "sem resposta", e a rota já diz "relay" por extenso. Quem não distingue a cor
lê exatamente a mesma informação. Trocar por um vermelho mais claro inventaria um token fora
do skin, o que este documento proíbe.

**"direto" e "relay" não são cores.** Relay não é erro — é o caminho funcionando. Os dois
saem em `--cp-ink-dark`, texto por extenso, sem ícone e sem cor própria.

---

## Copywriting Contract

| Element | Copy |
|---------|------|
| Primary CTA | **▶ CRIAR SALA** |
| Empty state heading | **VAZIO** (card de slot sem jogador) |
| Empty state body | *Você está sozinho na sala. Pode iniciar assim mesmo.* (aparece sob os slots quando só a autoridade está conectada — ensina D3-04 no lugar onde ela vale) |
| Error state | *Não consegui conectar com quem criou a sala.* + botão **↺ TENTAR DE NOVO** |
| Destructive confirmation | Sair da sala (autoridade): primeiro clique troca o rótulo para **✕ SAIR MESMO? A SALA ACABA**, o segundo confirma; volta sozinho ao rótulo original em 3 s |

### Tabela completa de copy

Botões e rótulos em CAIXA ALTA (Label). Frases em caixa de frase (Body). `{ }` é
interpolação.

| Contexto | Copy | Origem |
|---|---|---|
| Entrada no fluxo (tela inicial) | `◆ JOGAR COM AMIGOS` | novo |
| Título da tela de sala | `SALA` | novo |
| Botão criar | `▶ CRIAR SALA` | novo |
| Rótulo do campo de código | `— CÓDIGO DA SALA —` | padrão de `.color-label` (`index.html:73,77`) |
| Placeholder do campo | `ABC123` | novo |
| Botão entrar | `▶ ENTRAR` | novo |
| Voltar | `✕ VOLTAR` | padrão `✕ CLOSE` (`index.html:143`) |
| Conectando (status) | `Conectando…` | D3-08 |
| Código inválido no cliente (antes de enviar) | `Código de 6 caracteres, sem O, I, L nem U.` | Discretion #1 / RESEARCH #1 |
| `badCode` | `Não existe sala com esse código. Confira as letras e tente de novo.` | `REJECT_REASON` |
| `roomFull` | `Essa sala já está com quatro jogadores.` | `REJECT_REASON` |
| `roomClosed` | `Essa sala não existe mais.` | `REJECT_REASON` |
| `protocolVersion` | `Versões diferentes: a sua é {ours}, a da sala é {theirs}. Recarregue a página e tente de novo.` | D-08 + `VersionMismatch` |
| `simVersion` | `Versões do jogo diferentes: a sua é {ours}, a da sala é {theirs}. Recarregue a página e tente de novo.` | D-08 + `VersionMismatch` |
| Servidor fora / WebSocket não abriu | `Não consegui falar com o servidor. Tente de novo em instantes.` | novo |
| WebRTC falhou (convidado) | `Não consegui conectar com quem criou a sala.` | **D3-08, literal** |
| Botão de retry | `↺ TENTAR DE NOVO` | **D3-08, literal** |
| Sala morta | `Quem criou a sala saiu. A sala acabou.` | **D3-02, literal** |
| Título do lobby | `LOBBY` | novo |
| Rótulo do código no lobby | `— CÓDIGO —` | padrão `.color-label` |
| Copiar link | `COPIAR LINK` | **D3-07, literal** |
| Confirmação de cópia (`#lobby-status`) | `Link copiado.` | novo |
| Falha ao copiar | `Não consegui copiar. Selecione o link e copie à mão.` | novo |
| Rótulo do seletor de classe | `— SUA CLASSE —` | padrão `— CHOOSE YOUR CLASS —` |
| Modo da run (só leitura) | `MODO · CAMPANHA` / `MODO · SEM FIM` | mapeia `campaign`/`endless` |
| Slot vazio | `VAZIO` | novo |
| Slot negociando | `conectando` | **D3-08, literal** |
| Rota | `direto` / `relay` | **D3-15, literal** |
| Ping | `{n} ms · {rota}` | D3-15/D3-16 |
| Ping sem resposta | `sem resposta` | RESEARCH #11 (3 perdas seguidas) |
| Chip do jogador local | `VOCÊ` | novo |
| Chip da autoridade | `CRIOU A SALA` | FORM-12 (jamais "HOST") |
| Iniciar (só a autoridade) | `▶ INICIAR` | D3-04 |
| Sair (convidado) | `✕ SAIR DA SALA` | novo |
| Sair (autoridade, 1º clique) | `✕ SAIR DA SALA` → `✕ SAIR MESMO? A SALA ACABA` | D3-02 |
| Entrou/saiu (`#lobby-status`) | `{NOME} entrou.` / `{NOME} saiu.` | novo |
| Título da divergência | `MUNDOS DIFERENTES` | D3-05 |
| Corpo da divergência | `Os dois lados montaram mundos diferentes no tick 0. A run não vale. Copie os dois códigos e avise.` | D3-05 |
| Rótulos dos hashes | `o seu:` / `o da sala:` | D3-05 (FORM-12: não "o do host") |
| Fechar divergência | `✕ SAIR DA SALA` | novo |
| Badge de relay forçado | `RELAY FORÇADO (DEBUG) ✕` | RESEARCH #6 (badge é não-negociável) |
| Confirmação ao desligar o badge | recarrega a página; sem texto adicional | RESEARCH #6 |

**O que esta fase não escreve:** nada de "pronto", nada de contagem regressiva, nada de
chat, emote, expulsar ou espectador (Deferred em 03-CONTEXT.md). Se uma dessas palavras
aparecer numa tela, é escopo vazando.

---

## Screens & States

Quatro telas novas (todas `<div class="screen">` dentro de `#ui-overlay`, entradas novas em
`dom.screens`) + um overlay de rede fora do `#ui-overlay`.

### 1. `#room-screen` — criar / entrar (SALA-01, D3-07)

```
┌─ SALA ──────────────────────────────┐   placa .shop-title
│                                     │
│        ▶ CRIAR SALA                 │   .btn-pixel (accent)
│                                     │   ← 24px
│  ─────────  ou  ─────────           │   separador em Body, --cp-ink-dark
│                                     │
│      — CÓDIGO DA SALA —             │   Label
│      [ A B C 1 2 3 ]                │   #join-code, 6 chars, uppercase
│        ▶ ENTRAR                     │   .btn-pixel (accent)
│                                     │
│  {status / erro}                    │   #room-status / #room-error
│        ✕ VOLTAR                     │   .btn-pixel.secondary
└─────────────────────────────────────┘
```

| Estado | O que muda |
|---|---|
| `idle` | `#room-status` e `#room-error` vazios e sem altura reservada além de 1 linha |
| `criando` | `#room-status` = "Conectando…", os dois botões de ação `disabled`, `#join-code` `readonly` |
| `entrando` | igual, mais o código congelado no campo |
| `recusado` | `#room-error` com a copy do `REJECT_REASON`, botões reabilitados, foco volta para `#join-code` |
| `falhou WebRTC` | `#room-error` = "Não consegui conectar com quem criou a sala."; `#btn-retry-join` aparece; `#btn-join-room` some enquanto o retry está na tela |
| `sala morta` | tela aberta por cima do que estiver, `#room-error` = "Quem criou a sala saiu. A sala acabou." |

**Estado disabled** (não existe hoje no CSS): `.btn-pixel:disabled, .btn-pixel.secondary:disabled { opacity: 0.5; cursor: not-allowed; filter: none; transform: none; }` — a única regra de estado nova desta fase.

**"Voltar ao menu" de D3-02 é esta tela**, não a tela inicial: é o menu deste fluxo, e deixa
o jogador a um clique de entrar de novo. `✕ VOLTAR` leva à tela inicial.

**Deep link `?sala=CODIGO`:** no boot, com a query presente, abre `#room-screen`, preenche
`#join-code` normalizado e põe o foco em `#btn-join-room` (não dispara o join sozinho — o
jogador confirma). Depois de consumida, a query sai da URL com `history.replaceState`, pela
mesma razão que a `?ice=` sai (RESEARCH #6): recarregar não deve tentar entrar de novo numa
sala que já morreu. **"COPIAR LINK" monta o link a partir do código da sala, nunca de
`location.href`** — é o que impede a flag de debug de viajar junto.

### 2. `#lobby-screen` — o lobby (SALA-02, SALA-03, SALA-05)

```
┌─ LOBBY ─────────────────────────────────────────┐
│              — CÓDIGO —                         │
│              A B C 1 2 3                        │  #lobby-code, Display
│   [https://…/?sala=ABC123]  COPIAR LINK         │  #lobby-link + #btn-copy-link
│                                                 │
│  ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐    │  #lobby-slots, flex-wrap, gap 12
│  │ [48x56]│ │ [48x56]│ │        │ │        │    │  avatar na cor do jogador
│  │ GUSTAVO│ │ ANA    │ │  VAZIO │ │  VAZIO │    │  Label, 12ch, ellipsis
│  │ MAGE   │ │ ARCHER │ │        │ │        │    │  Body
│  │ VOCÊ · │ │ 42 ms ·│ │        │ │        │    │  chips + ping/rota
│  │ CRIOU  │ │ direto │ │        │ │        │    │
│  └────────┘ └────────┘ └────────┘ └────────┘    │
│                                                 │
│  Você está sozinho na sala. Pode iniciar        │  empty state (só quando sozinho)
│  assim mesmo.                                   │
│                                                 │
│           — SUA CLASSE —                        │
│  [MAGE][ARCHER][WARRIOR][NINJA][…]              │  #lobby-class, .lobby-class-card
│                                                 │
│  MODO · CAMPANHA        {#lobby-status}         │
│        ▶ INICIAR      ✕ SAIR DA SALA            │
└─────────────────────────────────────────────────┘
```

| Estado | O que muda |
|---|---|
| `sozinho` | 3 cards "VAZIO"; a frase de empty state aparece; `▶ INICIAR` **habilitado** (D3-04) |
| `slot conectando` | card com o avatar em silhueta (`opacity: 0.5`), nome vazio, linha de ping = "conectando" |
| `slot conectado` | avatar na cor, nome, classe, `{n} ms · {rota}`, atualizado a cada 1 s (D3-16) |
| `slot sem resposta` | linha de ping = "sem resposta" em #d9605a; o card **não** some (D3-08: a sala não cai por causa de um convidado) |
| `convidado` | `▶ INICIAR` **não existe no DOM** para quem não é a autoridade (não é `disabled`: ausente) |
| `local` | o card do jogador local leva o chip `VOCÊ`; o da autoridade leva `CRIOU A SALA`; os dois chips convivem no mesmo card |

**Sem estado "pronto" e sem timer** (D3-04, e recusado explicitamente em Deferred).

**Classes repetidas são normais** (D3-03): dois cards com `MAGE` não recebem aviso, marca
nem cor diferente — a distinção é a cor da roupa no avatar (D3-06) e o nome.

**Seletor de classe:** o clique pinta o card local **na hora** (eco otimista) e manda a
mudança; o `lobbyState` seguinte é a verdade e sobrescreve. Sem spinner, sem trava.

**Avatar do slot — a armadilha que custa uma tarde:** `recolorPlayerSheet()`
(`src/render/sprites.ts:142-174`) escreve no módulo-global `playerSheet`, que é a folha que a
run inteira desenha. **O lobby não pode chamá-la**: quatro slots em quatro cores
sobrescreveriam um ao outro e a run começaria com a cor do último. O executor extrai o corpo
dela num helper puro que **devolve** o canvas recolorido (e `recolorPlayerSheet` passa a ser
uma linha em cima dele), e o lobby guarda um canvas por slot em cache com chave
`` `${cls}|${r},${g},${b}` ``, repintando só quando a chave muda. Quadro **idle 0 parado** —
sem `setInterval`, ao contrário de `#color-preview` (`settings.ts:134-140`): são quatro
canvases, e o lobby não precisa de animação para comunicar nada.

### 3. `#desync-screen` — divergência do hash do tick 0 (D3-05)

Modal de tela cheia, placa de título em `--cp-accent`:

```
┌─ MUNDOS DIFERENTES ─────────────────┐
│ Os dois lados montaram mundos       │
│ diferentes no tick 0. A run não     │
│ vale. Copie os dois códigos e       │
│ avise.                              │
│                                     │
│   o seu:      a1b2c3d4…             │  #desync-ours, peso 600, selecionável
│   o da sala:  9f8e7d6c…             │  #desync-theirs, peso 600, selecionável
│                                     │
│        ✕ SAIR DA SALA               │
└─────────────────────────────────────┘
```

`html, body { user-select: none }` (`style.css:69`) impede copiar. Os dois hashes precisam de
`user-select: text; cursor: text` — sem isso, a copy "copie os dois códigos" é mentira.
`#btn-desync-close` usa o **mesmo caminho de quit da tela de pause** (`deps.onQuit`,
`screens.ts:326`): deixar uma run divergente rodando atrás de um modal não é estado que esta
fase suporta.

### 4. `#net-badge` — indicador da run (D3-15), fora do `#ui-overlay`

Elemento fixo, **um só**, vivo do momento em que existe sessão de sala (lobby) até ela
acabar — é o mesmo elemento que a fase 4 herda como está e a fase 5 estende com
"reconectando".

- Conteúdo: `#net-route` = `{n} ms · direto|relay` para o convidado; para a autoridade,
  `pior {n} ms · {rota}` entre os slots conectados, ou nada quando está sozinha.
- Mais `#btn-relay-flag`, visível só com a flag de debug ligada.
- **DOM, não canvas.** O HUD deste jogo é DOM (`src/ui/hud.ts` escreve `textContent`/`style`
  em elementos de `index.html`; nada de HUD é desenhado no canvas). O badge segue o HUD:
  texto em `#hud`-style, pintado no mesmo `frame()` uma vez por quadro, sem tocar no `world`.
- Posição: canto inferior esquerdo (`left: 12px; bottom: 12px`), `pointer-events: none` no
  container e `auto` só no `#btn-relay-flag`.
- Com controles de toque ligados, o polegar esquerdo mora ali: `#touch-ui.enabled ~ #net-badge`
  move para o rodapé central (`left: 50%; transform: translateX(-50%)`). **Combinador `~`, não
  `+`** — `#hud.hidden + #touch-ui` (`style.css:981`) já não casa nada porque
  `#hurt-flash` está entre os dois em `index.html`; repetir o erro sairia caro. `#net-badge` vai
  **depois** de `#touch-ui` no markup.
- `z-index: 11` — acima do `#ui-overlay` (10), para que o badge de relay forçado apareça
  também com o lobby aberto, que é o que RESEARCH #6 exige, com um elemento só.

### 5. Entrada no fluxo

`#btn-coop` (`◆ JOGAR COM AMIGOS`, `.btn-pixel.secondary`) entra em `index.html` logo depois
de `#btn-start` e antes de `#btn-update`. Nome, cor e classe já estão escolhidos na tela
inicial; o lobby só permite trocar a classe.

---

## Component Inventory

| Componente | Base visual | Regra |
|---|---|---|
| `.lobby-slot` | `.class-card` | **Nome de classe próprio, obrigatoriamente.** `settings.ts:55-57` faz `document.querySelectorAll('.class-card')` global — reusar o nome faria `refreshClassCards()` mexer nos cards do lobby. As regras de `style.css` ganham `.lobby-slot` na lista de seletores; nenhuma cópia de declaração |
| `.lobby-slot.empty` | `.slot-chip.empty` | Fundo `--cp-slot-empty`, sem avatar, texto `VAZIO` |
| `.lobby-class-card` | `.class-card` | Mesmo motivo. Selecionado usa `--cp-btn`, igual a `.class-card.selected` |
| `.lobby-chip` | `.key` (`style.css:541-554`) | Chip pequeno para `VOCÊ` / `CRIOU A SALA` |
| `#join-code` | `#hero-name` | `type="text"` (obrigatório: `isTextInput()` só engole tecla de `type="text"`, `events.ts:19-22` — com outro tipo, digitar o código dispararia atalho de jogo), `maxlength="6"`, `autocapitalize="characters"`, `autocomplete="off"`, `spellcheck="false"`, `text-transform: uppercase`, `letter-spacing: 0.3em` |
| `#lobby-link` | `#hero-name`, menor | `readonly`, Body, `text-overflow: ellipsis`, `user-select: text` |
| `#room-error` | novo, 3 linhas | Body, `--cp-accent-hi`, `role="alert"` |
| `#room-status` / `#lobby-status` | novo, 1 linha | Body, `--cp-ink-dark`, `role="status" aria-live="polite"`, `min-height: 1.5em` reservada para o layout não pular |
| `#net-badge` | painel do HUD (`style.css:1348-1353`) | `--cp-panel` + borda 3px `--cp-wood-dark`, Body |
| `#btn-relay-flag` | `.aim-toggle` | Fundo `--cp-accent`, tinta `--cp-ink-light` |

---

## DOM Contract

Todo id abaixo entra em `index.html` **e** em `src/ui/dom.ts` no mesmo commit —
`tests/dom-ids.test.ts` falha por nome se um faltar. `dom.screens` ganha `room`, `lobby` e
`desync`. Os 25 ids levam o total de 87 para 112; `MIN_IDS = 80` continua válido sem edição.

| id | Elemento | Tela |
|---|---|---|
| `btn-coop` | `<button class="btn-pixel secondary">` | inicial |
| `room-screen` | `<div class="screen">` | sala |
| `btn-create-room` | `<button class="btn-pixel">` | sala |
| `join-code` | `<input type="text">` | sala |
| `btn-join-room` | `<button class="btn-pixel">` | sala |
| `btn-retry-join` | `<button class="btn-pixel">` | sala |
| `room-status` | `<div role="status" aria-live="polite">` | sala |
| `room-error` | `<div role="alert">` | sala |
| `btn-room-back` | `<button class="btn-pixel secondary">` | sala |
| `lobby-screen` | `<div class="screen">` | lobby |
| `lobby-code` | `<div>` | lobby |
| `lobby-link` | `<input readonly>` | lobby |
| `btn-copy-link` | `<button class="btn-pixel secondary">` | lobby |
| `lobby-slots` | `<div>` container | lobby |
| `lobby-empty-hint` | `<div>` | lobby |
| `lobby-class` | `<div>` container | lobby |
| `lobby-mode` | `<div>` | lobby |
| `lobby-status` | `<div role="status" aria-live="polite">` | lobby |
| `btn-start-run` | `<button class="btn-pixel">` | lobby |
| `btn-leave-room` | `<button class="btn-pixel secondary">` | lobby |
| `desync-screen` | `<div class="screen">` | divergência |
| `desync-ours` | `<span>` | divergência |
| `desync-theirs` | `<span>` | divergência |
| `btn-desync-close` | `<button class="btn-pixel secondary">` | divergência |
| `net-badge` | `<div>` fixo | run + lobby |
| `net-route` | `<span>` | run + lobby |
| `btn-relay-flag` | `<button>` | run + lobby |

**Cardinalidade:** os quatro cards de slot e os cards de classe são filhos **construídos por
JS** dentro de `#lobby-slots` / `#lobby-class`, sem id próprio — mesmo padrão de
`#shop-slots`, `#forge-list` e `#levelup-choices`. Construídos **uma vez** ao abrir o lobby e
remendados no lugar a 1 Hz (`textContent`/`classList`), nunca recriados: recriar quatro
canvases por segundo é lixo de GC e pisca.

**`#btn-start-run` é ausência, não `disabled`, para o convidado.** Um botão desabilitado
convida a clicar e a perguntar por quê; a autoridade é única (D3-02) e a assimetria é
permanente.

---

## Accessibility

Hoje o repositório tem **zero** atributo `aria-*` e **zero** `role=` (verificado em
`index.html` e `src/ui/*.ts`). Esta fase não conserta o passado; ela declara o mínimo
verificável para as telas novas.

| Item | Contrato |
|---|---|
| Ordem de foco | Ordem do DOM, sem `tabindex` positivo. Sala: `#btn-create-room` → `#join-code` → `#btn-join-room` → `#btn-room-back`. Lobby: `#btn-copy-link` → cards de classe → `#btn-start-run` → `#btn-leave-room` |
| Foco ao abrir | Ao abrir a tela de sala: foco em `#btn-create-room`; vindo de `?sala=`: foco em `#btn-join-room`. Ao abrir o lobby: foco em `#btn-copy-link`. **Isso é obrigatório**, não cortesia: `settings.ts:32-35` dá `blur()` em todo botão clicado, então quem navega por teclado perde o lugar a cada ação se a tela não recolocar o foco |
| Foco visível | `:focus-visible { outline: 2px solid var(--cp-ink-light); outline-offset: 2px; }` nos controles das telas novas. Não existe estilo de foco global hoje; sem isso o teclado navega às cegas |
| Ativação por teclado | Os botões destas telas **não** usam `mouseOnly()` (`events.ts:12-14`). Aquele guarda existe porque Espaço é a tecla de ataque **durante a run**; nas telas de sala e lobby não há run, e Enter/Espaço precisam funcionar. Exceção única: `#btn-relay-flag`, que fica visível durante a run e por isso **usa** `mouseOnly()` |
| Anúncio de mudança de estado | `#lobby-status` (`role="status" aria-live="polite"`) recebe "{NOME} entrou.", "{NOME} saiu.", "Link copiado." e limpa em 3 s. `#room-error` é `role="alert"`. **`announce()` não é usado no lobby**: é um toast de 2600 ms em 44px no centro exato da tela (`style.css:1065-1079`) e cobriria os slots. `announce()` fica reservado a um caso: "SALA ENCERRADA", quando a sala morre e a tela troca embaixo do jogador |
| Alvo de toque | `min-height: 44px` (e `min-width: 44px` em botão só de ícone) em todo controle novo. Precedente medido: `#btn-touch-pause` é 44×44. `.btn-pixel` no tamanho mínimo de fonte fica em ~41px — por isso a regra é explícita |
| Zoom / viewport | Não mexer no `<meta name="viewport">` (`maximum-scale=1.0, user-scalable=no`, `index.html:5`): é o que impede zoom acidental no joystick. As telas novas compensam com corpo de 11px mínimo e alvos de 44px |
| Rolagem | Herdada de `.screen-inner { max-height: 92vh; overflow-y: auto }`. O lobby com 4 slots + seletor de 7 classes **vai** rolar num celular deitado; nada de `overflow: hidden` em contêiner novo |
| Cor nunca sozinha | Ping ruim diz "sem resposta"; relay diz "relay"; slot vazio diz "VAZIO"; erro é frase, não borda vermelha |
| Conteúdo remoto | `textContent` sempre. `innerHTML` em qualquer nó que carregue dado de peer é defeito de segurança nesta fase, não estilo — `screens.ts:56-71` já explica por quê |

---

## Registry Safety

| Registry | Blocks Used | Safety Gate |
|----------|-------------|-------------|
| shadcn official | — | not applicable — shadcn não é usado (sem React, sem `components.json`, `dependencies: {}` é invariante do projeto) |
| third-party | nenhum | not applicable — nenhum registry declarado; gate de vetting não executado porque não há bloco de terceiro a vetar |

**Superfície de terceiros nesta fase: zero.** Nenhum ícone empacotado, nenhum CSS de CDN,
nenhuma fonte remota (as duas famílias são auto-hospedadas desde D2-20). A única regra de
segurança que esta fase acrescenta é a de conteúdo remoto na tabela de Accessibility.

---

## Open For The Planner

Coisas que este contrato deliberadamente não fecha, porque são de plano e não de design:

1. **Quando `#net-badge` aparece pela primeira vez** — junto do lobby ou só depois do primeiro `pong`. O contrato exige que ele exista nos dois; a ordem é de implementação.
2. **Onde mora o cache de canvas dos avatares** — `src/net/lobby.ts` ou um helper em `src/render/sprites.ts`. O contrato exige apenas que `recolorPlayerSheet` **não** seja chamada pelo lobby.
3. **Se `#room-screen` e `#lobby-screen` compartilham um módulo** (`src/net/lobby.ts`) ou são dois. O cabeçalho do arquivo precisa dizer que estas são as primeiras telas dirigidas por estado de rede e não por `world` (RESEARCH #13).

---

## Checker Sign-Off

- [ ] Dimension 1 Copywriting: PASS
- [ ] Dimension 2 Visuals: PASS
- [ ] Dimension 3 Color: PASS
- [ ] Dimension 4 Typography: PASS
- [ ] Dimension 5 Spacing: PASS
- [ ] Dimension 6 Registry Safety: PASS

**Approval:** pending

---

*Phase: 3-Sala, transporte e protocolo*
*UI spec written: 2026-09-03*
