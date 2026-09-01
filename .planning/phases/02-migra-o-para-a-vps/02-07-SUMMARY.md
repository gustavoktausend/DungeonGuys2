---
phase: 02-migra-o-para-a-vps
plan: 07
subsystem: ui
tags: [pwa, service-worker, update-prompt, d2-09, dom-ids, infra-02]

# Dependency graph
requires:
  - phase: 02
    plan: 06
    provides: "a ponta do worker: `public/sw.js` sem troca automática e sem `clients.claim()`, mais o handler de `message` que aceita `SKIP_WAITING`. Sem ele este plano não teria a quem pedir a troca"
  - phase: 02
    plan: 02
    provides: "`base: '/'`, que é o que faz `import.meta.env.BASE_URL + 'sw.js'` continuar sendo o registro certo depois da migração"
provides:
  - "`showUpdateOffer`/`hideUpdateOffer` em `src/ui/screens.ts`: o botão persistente na tela inicial e o toast, com a fiação de clique em nível de módulo"
  - "`#btn-update` no `index.html` e `dom.btnUpdate` em `src/ui/dom.ts`, no mesmo commit, como manda o cabeçalho de `dom.ts`"
  - "o ciclo completo em `src/main.ts`: `waiting` na carga, `updatefound`, `SKIP_WAITING`, `controllerchange` com guarda, e a reoferta em `quitGame`"
  - "`tests/dom-ids.test.ts`: todo id resolvido em `dom.ts` existe no `index.html` — a regra que o arquivo descrevia em prosa virou portão"
affects: [02-09 update.spec.ts exercita exatamente esta UI, fase 3 acrescenta `&& !inRoom` no gate de offer()]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "gate de segurança reusando a flag que já existe (`gameStarted`) em vez de inventar uma segunda, para que a pergunta 'estou fora de partida?' tenha uma resposta só"
    - "callback guardado em variável de módulo e listener fiado UMA vez, em vez de fiar dentro da função que oferece — a forma dos botões de compartilhamento"
    - "teste estrutural que casa DOIS arquivos (código e markup), com contagem mínima antes da comparação para que um regex morto não passe por vacuidade"
key-files:
  created:
    - tests/dom-ids.test.ts
  modified:
    - index.html
    - src/ui/dom.ts
    - src/ui/screens.ts
    - src/main.ts
    - src/style.css

key-decisions:
  - "`src/style.css` foi tocado, fora do `files_modified` do plano: NÃO existe regra `.hidden` global neste projeto, ao contrário do que o plano supõe. Uma linha, provada necessária por contrafactual em Chromium"
  - "`let gameStarted` subiu para antes do bloco de PWA: o `await loadSprites()` de topo de módulo torna a TDZ alcançável pelo callback do `register()`, e justamente no caso que a feature existe para atender"
  - "`hideUpdateOffer` fica exportada sem chamador — é a metade simétrica que o plano exige, não um stub de funcionalidade faltando"
  - "INFRA-02 continua `Pending`, pelo mesmo julgamento do 02-05 e do 02-06: os planos 02-09 e 02-12 ainda o carregam, e 'servido da VPS' depende do deploy"

patterns-established:
  - "Prova de recusa executada nos dois sentidos para cada portão novo, e contrafactual executado para cada desvio que acrescenta código fora do plano"

requirements-completed: []

# Metrics
duration: 18min
completed: 2026-09-01
---

# Phase 2 Plan 07: O aviso de atualização

**O worker que o plano 02-06 deixou esperando agora tem quem o perceba: o jogador é avisado
durante a partida, decide na tela inicial, e a troca de versão virou um evento com dono em vez
de um efeito colateral do próximo carregamento.**

## Performance

- **Duration:** ~18 min
- **Started:** 2026-09-01T02:59Z
- **Completed:** 2026-09-01T03:17Z
- **Tasks:** 2
- **Files:** 1 criado, 5 modificados

## Accomplishments

- **D2-09 fechou.** A ponta do worker (02-06) e a ponta da página (este plano) se encontram
  numa mensagem só, `{ type: 'SKIP_WAITING' }`, escrita com o mesmo nome dos dois lados e
  asserida por `tests/build-base.test.ts` — renomear de um lado só reprova a suíte.
- **Os três momentos em que o jogador está fora de partida estão cobertos**, que é o que
  impede o worker de ficar em `waiting` para sempre: já estava esperando quando a página
  carregou (`offer(reg.waiting)`), acabou de instalar (`updatefound` → `statechange`), e
  acabou de voltar ao menu (`offer(swWaiting)` no fim de `quitGame`).
- **A regra "markup e `dom.ts` andam no mesmo commit" deixou de ser prosa.** O cabeçalho de
  `dom.ts:19-21` prometia que um id faltando "aparece imediatamente como erro de runtime" — e
  a promessa é fraca justamente para um botão: o erro é um TypeError no **primeiro toque**, e
  um botão que ninguém clica em teste de fumaça embarca quebrado. `tests/dom-ids.test.ts`
  confere os **87** ids contra o `index.html` antes disso.
- **Uma armadilha de TDZ foi desarmada antes de existir.** `src/main.ts` tem `await
  loadSprites()` em topo de módulo, e `gameStarted` era declarado **depois** dele. Como o
  `.then()` do `register()` pode resolver durante essa suspensão, ler `gameStarted` de lá
  lançaria `ReferenceError` — e só no caso em que há worker esperando, que é exatamente o
  caso que esta feature existe para atender. A declaração subiu, com o porquê escrito na linha.
- **Um defeito de CSS foi encontrado por leitura e provado por execução.** Não há regra
  `.hidden` global neste projeto; sem a linha nova, o botão `RECARREGAR AGORA` ficaria visível
  na tela inicial o tempo todo, para todo mundo, desde o primeiro deploy.

## Task Commits

1. **Task 1: o botão na tela inicial, do markup ao `screens.ts`, mais o teste de ids** —
   `c211221` (feat)
2. **Task 2: detectar o worker em espera e aplicar a troca fora de partida** — `7a893ac` (feat)

## Files Created/Modified

- `tests/dom-ids.test.ts` — 84 linhas, 5 casos. Globs raw de `dom.ts` e `index.html`, guarda
  anti-vacuidade **por comprimento**, extração dos ids por regex com piso de 80 (87 hoje)
  **antes** de comparar, um caso de unicidade, a varredura que coleta todos os faltantes, e um
  caso nomeado só para `btn-update`.
- `index.html` — uma linha: `#btn-update` entre `#btn-start` e `.footer-hint`, reusando
  `.btn-pixel.secondary`. Nenhuma classe nova.
- `src/ui/dom.ts` — `btnUpdate` ao lado de `btnStart`, com o comentário de origem.
- `src/ui/screens.ts` — seção nova de 34 linhas: `applyUpdate` em nível de módulo, o
  `addEventListener` fiado **uma vez** (contagem de listeners de clique no arquivo: 8 → 9), e
  `showUpdateOffer`/`hideUpdateOffer`.
- `src/main.ts` — 68 linhas dentro, 3 fora. O bloco de PWA ganhou `swWaiting`, `swReloading`,
  `applyUpdate`, `offer`, o `.then()` com `updatefound`, e o listener de `controllerchange`
  com guarda. `quitGame` ganhou a reoferta.
- `src/style.css` — 6 linhas (5 de comentário, 1 de regra): `#btn-update.hidden { display:
  none; }`. Ver Deviations.

## Decisions Made

- **A divisão de trabalho entre as duas metades do aviso está escrita no código**, não só no
  plano: `announce()` é um toast de 2600 ms sem interação — bom para contar que algo
  aconteceu, inútil para pedir uma decisão, porque some antes de o jogador decidir. Por isso a
  metade que pede ação é um botão que **fica**, na única tela onde `gameStarted` é falso.
- **O gate não ganhou flag nova, de propósito.** `gameStarted` já é mantido por `beginRun` e
  `quitGame` e já significa exatamente "fora de partida"; uma segunda flag daria duas
  respostas para uma pergunta. O comentário na linha do gate registra que a fase 3 acrescenta
  `&& !inRoom` **ali** e em nenhum outro lugar, com o motivo: D-08 da fase 1 faz peers de
  versões diferentes recusarem-se sem bypass, então trocar de versão dentro de uma sala
  produz essa recusa no pior momento possível.
- **`if (!installing) return;` em vez de `installing?.addEventListener(...)`.** O TypeScript
  não estreita a variável capturada dentro do callback pela via do encadeamento opcional; o
  early-return estreita, e o `installing.state` de dentro do `statechange` passa a
  type-checar sem asserção.
- **`hideUpdateOffer` fica exportada e sem chamador.** É a metade simétrica que o plano exige
  (critério de aceitação nomeado), e existe para que retirar a oferta não deixe uma referência
  a worker morto pendurada em `applyUpdate`. Não foi chamada em `beginRun` porque a tela
  inicial inteira já sai de cena com `showScreen(null)`, e acrescentar a chamada mudaria o
  comportamento que `update.spec.ts` (plano 02-09) vai medir. Ver Known Stubs.
- **INFRA-02 continua `Pending`.** O frontmatter do plano o declara, mas o texto do requisito
  é "o PWA continua instalável e funcional offline **servido da VPS**", e os planos 02-09 e
  02-12 ainda o carregam. Mesmo julgamento do 02-05 e do 02-06. `REQUIREMENTS.md` intocado.
- **Comentários sem as palavras proibidas.** Três critérios de aceitação são `grep -c` sobre
  `src/main.ts`: `skipWaiting` tem de dar **0** e `controllerchange` tem de dar **1**. Como
  `grep -c` conta **linhas**, um comentário explicando "sem `skipWaiting()`" ou "um
  `controllerchange` disparado por outro motivo" reprovaria o próprio critério que documenta.
  As duas frases foram reescritas sem os tokens; o conteúdo continua lá.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Não existe regra `.hidden` global — o botão nasceria visível**

- **Found during:** Task 1, lendo `src/style.css` antes de editar.
- **Issue:** o plano instrui a reusar "as classes `.btn-pixel`, `.btn-pixel.secondary` e
  `.hidden` já existentes" e afirma que "nenhum CSS novo é necessário". As duas primeiras
  existem; **a terceira não**. Todo uso de `hidden` neste projeto é pareado com uma regra
  *escopada*: `#hud.hidden`, `#boss-bar.hidden`, `#wave-announce.hidden`,
  `#combo-display.hidden`, `.new-record.hidden`. Não há `.hidden { display: none; }` solto, e
  `src/style.css` é a única folha do projeto. Seguir o plano à letra deixaria
  `RECARREGAR AGORA` visível na tela inicial permanentemente, e `classList.remove('hidden')`
  alternando uma classe que não estiliza nada.
- **Fix:** uma regra, na forma dos cinco precedentes, junto das regras de `.btn-pixel`:
  `#btn-update.hidden { display: none; }`, com o comentário explicando por que ela precisa
  existir para que ninguém a "limpe" depois.
- **Files modified:** `src/style.css` (+6 linhas, das quais 1 de regra).
- **Escopo:** `src/style.css` está **fora** do `files_modified` do plano, mas dentro do campo
  de visão dele — um critério de aceitação da Task 1 inspeciona `git diff --stat
  src/style.css` explicitamente. Não pertence ao plano paralelo 02-08 (que é dono de
  `package.json`, `package-lock.json`, `tsconfig.json`, `eslint.config.js`, `.gitignore`,
  `.github/workflows/ci.yml` e `apps/server/`), então não houve risco de colisão. O critério
  literal era "diff vazio ou só espaçamento (**nenhuma classe nova**)": nenhuma classe nova
  foi criada — `hidden` já é usada em cinco lugares; o que entrou foi o escopo dela para um id
  novo.
- **Verification:** contrafactual executado em Chromium sobre o `dist/` real, com uma spec
  descartável (criada, rodada e **apagada** — `git status` limpo, nada commitado). Dois casos,
  ambos verdes: (1) `#btn-update` carrega com `getComputedStyle().display === 'none'` e passa
  a visível quando a classe sai, com o texto `RECARREGAR AGORA`; (2) um `<button
  class="btn-pixel secondary hidden">` com **outro id**, injetado na mesma página, computa
  `display` **diferente** de `none` — que é a prova direta de que não há regra global e de que
  a linha nova não é redundante.
- **Commit:** `c211221` (junto da Task 1).

**2. [Rule 1 - Bug] `gameStarted` estava na zona morta temporal do `await` de topo de módulo**

- **Found during:** Task 2, escrevendo `offer()`.
- **Issue:** `src/main.ts` tem `await loadSprites()` em **topo de módulo** (linha 43), e
  `let gameStarted = false` era declarado depois dele (linha 65). O bloco de PWA fica **antes**
  do `await`, e `navigator.serviceWorker.register()` devolve uma promise que pode resolver
  enquanto a avaliação do módulo está suspensa nesse `await`. O callback chamaria
  `offer(reg.waiting)`, que lê `gameStarted` — ainda em TDZ — e lançaria `ReferenceError`.
  Numa primeira visita `reg.waiting` é nulo e `offer` retorna antes de ler, então o defeito é
  invisível; ele só aparece quando **há** um worker esperando, que é precisamente o cenário
  desta feature e o que `update.spec.ts` (02-09) vai exercitar.
- **Fix:** a declaração de `gameStarted` subiu para imediatamente antes do bloco de PWA, com o
  comentário explicando por que ela não mora com as irmãs na seção de ciclo de vida. A
  alternativa — descer o bloco de PWA para depois do `await` — foi rejeitada: atrasaria o
  registro do worker (e portanto o precache) até as sprites decodificarem, o que é uma
  regressão real de comportamento.
- **Files modified:** `src/main.ts` (movimento de uma linha, mais o comentário).
- **Commit:** `7a893ac` (junto da Task 2).

### Blocking Issues

**3. [Rule 3 - Blocking] o worktree veio sem `node_modules`**

- **Found during:** antes da Task 1.
- **Fix:** `npm ci` a partir do lock — **nunca** `npm install`, que reescreveria o
  `package-lock.json` de que o plano paralelo 02-08 é dono. `git status` logo depois:
  limpo. Nenhum pacote novo, nenhuma versão alterada.
- **Commit:** nenhum — não produziu diff.

---

**Total deviations:** 3 (duas de regra 1, uma de regra 3).
**Impact on plan:** um arquivo além dos cinco previstos (`src/style.css`, +6 linhas), pelo
motivo acima. Nenhum arquivo do plano paralelo 02-08 foi tocado. Nenhuma spec de `tests/pwa/`
foi tocada ou deixada para trás.

## Issues Encountered

- **Os arquivos deste worktree estão em CRLF** (o `core.autocrlf` desta máquina, o mesmo já
  registrado pelo 02-06). As edições preservaram CRLF nos arquivos existentes; o
  `tests/dom-ids.test.ts` novo foi escrito em LF e o git o normalizou no `add`, com o aviso de
  praxe. Sem efeito sobre nada — mas é o motivo de uma primeira tentativa de edição casada por
  `\n` ter falhado silenciosamente com zero ocorrências.
- **`grep -c` conta linhas, não ocorrências.** Três critérios de aceitação da Task 2 dependem
  disso, e dois deles são satisfeitos **apenas** se os comentários evitarem os tokens que
  descrevem. Está registrado em Decisions Made porque muda como o arquivo é escrito, não o que
  ele faz.

## Threat Model

Os quatro itens do registro do plano, conferidos:

- **T-2-SYNC** (DoS, troca de versão sob os pés do jogador) — **mitigado.** `offer()` só chama
  `showUpdateOffer` com `gameStarted === false`; com partida em curso o jogador recebe
  `announce('NOVA VERSÃO PRONTA — VOLTE AO MENU PARA ATUALIZAR')` e **nada** muda. `applyUpdate`
  só é alcançável pelo clique no botão, e o botão só sai de `hidden` por esse caminho. O
  comentário do gate marca onde `&& !inRoom` entra na fase 3, com a ligação a D-08 escrita.
- **T-2-RELOADLOOP** (DoS, laço de recarregamento) — **mitigado.** Guarda `swReloading`:
  declaração, `if (swReloading) return;` e `swReloading = true;` antes do `location.reload()`.
- **T-2-STUCK** (DoS, worker parado em `waiting`) — **mitigado** nos três momentos: `waiting`
  na carga, `updatefound` → `statechange` com `controller` presente, e a reoferta em
  `quitGame`. O teste de `controller` é o que impede a primeira instalação de virar um convite
  a recarregar uma página recém-precacheada.
- **T-2-SC** (cadeia de suprimentos) — **aceito, e a premissa se manteve.** Nenhum pacote
  instalado (só `npm ci` do lock existente), nenhuma dependência nova, `dependencies` da raiz
  continua `{}`.

Nenhuma superfície nova de rede, autenticação, acesso a arquivo ou esquema. Sem `threat_flag`.

## Verification

| Portão | Resultado |
|---|---|
| `grep -c 'id="btn-update"' index.html` | 1 |
| `grep -c 'btnUpdate' src/ui/dom.ts` | 1 |
| `grep -c 'export function showUpdateOffer' src/ui/screens.ts` | 1 |
| `grep -c 'export function hideUpdateOffer' src/ui/screens.ts` | 1 |
| `grep -c "addEventListener('click'" src/ui/screens.ts` | 8 → **9** (exatamente +1, nível de módulo) |
| `grep -c 'SKIP_WAITING' src/main.ts` | **1** |
| `grep -c 'skipWaiting' src/main.ts` | **0** |
| `grep -c 'swReloading' src/main.ts` | **3** |
| `grep -c 'showUpdateOffer' src/main.ts` | 2 (import + uso) |
| `grep -c 'controllerchange' src/main.ts` | **1** |
| `grep -c 'gameStarted' src/main.ts` | 4 → **7** |
| `grep -n 'offer(swWaiting)' src/main.ts` | linha 264, **dentro** de `quitGame`, depois de `gameStarted = false` |
| **Recusa do teste novo** — `id="btn-update"` → `id="btn-updateX"` | sai **1**, com **dois** casos vermelhos, ambos nomeando `btn-update`: `expected [ 'btn-update' ] to deeply equal []` e `expected ... to contain 'id="btn-update"'` |
| Depois de restaurar | volta a **5 passed** |
| **Contrafactual do CSS** (spec descartável, apagada) | 2 passed: `#btn-update` nasce `display:none` e revela ao tirar a classe; e um botão com as **mesmas** classes e **outro** id computa `display` ≠ `none` — não há `.hidden` global |
| `npx vitest run tests/dom-ids.test.ts` | 5 passed |
| `npm test` | 39 arquivos, **446** testes verdes (eram 441 em 38 arquivos) |
| `npx tsc --noEmit` | sai 0 |
| `npm run lint` | sai 0 |
| `npm run build` | sai 0, `sw precache: 13 arquivos, cache dg2-63818d8fcd3ac13e` |
| `npm run sw:verify` | sai 0, `13 caminhos batendo com o dist/, nenhum /DungeonGuys2/ em 14 arquivos` |
| `npx playwright test install.spec.ts offline.spec.ts` | **3 passed** (nenhuma regressão) |
| `git status --short` depois do último commit | limpo |
| Arquivos tocados no total | 6 — os 5 do plano mais `src/style.css` |
| Arquivos do plano paralelo 02-08 tocados | **nenhum** |

## Known Stubs

**`hideUpdateOffer` está exportada e não tem chamador.** Não é funcionalidade faltando: é a
metade simétrica de `showUpdateOffer`, exigida nominalmente por um critério de aceitação do
plano, implementada por inteiro e correta. Não há chamador porque o fluxo desenhado não tem um
momento em que a oferta precise ser retirada sem recarregar — aceitar leva a `SKIP_WAITING` →
`controllerchange` → `location.reload()`, e a tela inicial inteira sai de cena por
`showScreen(null)` quando uma partida começa. O candidato natural a chamador é `beginRun`, e
ele foi deixado de fora deliberadamente: acrescentá-lo mudaria o comportamento que
`update.spec.ts` (plano 02-09) foi escrito para medir. Não bloqueia o objetivo deste plano.

## User Setup Required

Nenhuma. Nenhum serviço externo, nenhuma variável de ambiente, nenhum pacote novo.

## Next Phase Readiness

- **02-09 (`update.spec.ts`):** a UI existe e é observável de uma spec sem depender de tempo.
  Os ganchos estáveis são o id `#btn-update` (asserido por `tests/dom-ids.test.ts`, então não
  pode sumir em silêncio), a classe `hidden` como único mecanismo de visibilidade dele, e o
  texto `RECARREGAR AGORA`. O toast reusa `#wave-announce`, que já é o alvo de `announce()`.
  Encenação sugerida: `tests/pwa/fixtures/old-build/` → `setRoot('dist')` no mesmo servidor
  (o mesmo `serveDir`/`setRoot` que o 02-05 entregou, porque porta nova seria origem nova),
  e lembre do `clearHttpCache()`. Atenção a um detalhe do fluxo: sem `clients.claim()`, a
  página que **instala** o worker não é controlada por ele, então o ramo de `updatefound` só
  oferece quando `navigator.serviceWorker.controller` existe — a spec precisa de um `reload()`
  antes de esperar a oferta.
- **02-11 (job `pwa` no CI):** nada mudou nos pré-requisitos. `npm run test:pwa` continua
  dependendo de `npm run build` antes.
- **Fase 3 (sala):** o único ponto a tocar é a linha do gate em `offer()`, que já está
  comentada com o `&& !inRoom` e o motivo. Nenhuma flag nova deve ser criada para isso.

Sem bloqueadores.

## Self-Check: PASSED

Arquivo declarado como criado — presente: `tests/dom-ids.test.ts` (84 linhas, 5 casos verdes).

Arquivos declarados como modificados — todos presentes e commitados: `index.html`,
`src/ui/dom.ts`, `src/ui/screens.ts`, `src/main.ts`, `src/style.css`.

Commits declarados — ambos presentes no histórico deste worktree: `c211221`, `7a893ac`.
`git diff --stat` contra a base `0de450a4` mostra exatamente 6 arquivos, 196 inserções, 3
remoções — nenhuma exclusão de arquivo em nenhum dos dois commits.

Arquivos que este plano **não** podia tocar e não tocou: `package.json`, `package-lock.json`,
`tsconfig.json`, `eslint.config.js`, `.gitignore`, `.github/workflows/ci.yml`, `apps/server/`
(donos do 02-08), `public/sw.js` (02-06), e todas as specs de `tests/pwa/`. `STATE.md` e
`ROADMAP.md` intocados, como manda o modo worktree.

---
*Phase: 02-migra-o-para-a-vps*
*Completed: 2026-09-01*
