---
phase: 03-sala-transporte-e-protocolo
plan: 09
subsystem: ui-sala
tags: [ui, lobby, dom-contract, css-skin, deep-link, xss, form-12, injecao-de-plataforma]

# Dependency graph
requires:
  - phase: 03-sala-transporte-e-protocolo
    plan: 03
    provides: "createLobby, LobbyView/OccupantView, createPinger e o resumo de ping por slot"
  - phase: 03-sala-transporte-e-protocolo
    plan: 08
    provides: "createSignalingClient com open(url) injetado, createRtcTransport, readRelayFlag/clearRelayFlag e BAD_CODE_MESSAGE"
  - phase: 03-sala-transporte-e-protocolo
    plan: 01
    provides: "normalizeRoomCode, PROTOCOL_VERSION, REJECT_REASON, CLASS_KEY e os tipos de signaling"
  - phase: 02-publicacao-e-servidor
    provides: "O skin craftpix em src/style.css, tests/dom-ids.test.ts e o par sw:emit/sw:verify"
provides:
  - "index.html: #room-screen, #lobby-screen, #desync-screen, #net-badge e #btn-coop"
  - "src/ui/dom.ts: as 27 entradas novas e room/lobby/desync em dom.screens"
  - "src/ui/room.ts: a view das telas de rede e a sessão de sala, carregável no Node"
  - "src/render/sprites.ts: recolorSheet, o recolor PURO que devolve a folha"
  - "src/main.ts: a leitura única de ?sala= e ?ice= no boot, e o badge no frame()"
  - "tests/room-ui.test.ts e o glob de net-vocabulary crescido para src/ui/room.ts"
affects: [03-10-webrtc-e-run-config, 04-netcode, 05-reconexao]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "View de rede que não importa dom.ts nem sprites.ts: elementos e desenho chegam por initRoom(deps), no molde de open(url) — é o que a torna carregável sob Node sem jsdom"
    - "Componente novo entra na LISTA DE SELETORES da regra existente, nunca copiando declarações"
    - "Nome de classe CSS próprio (.lobby-slot, .lobby-class-card) quando um querySelectorAll global já reivindica o nome antigo"
    - "Cards construídos uma vez e remendados no lugar (textContent/classList), com o canvas repintado só quando a chave de cache muda"
    - "Perífrase no comentário quando o critério de aceitação é um grep sobre o texto do arquivo, comentários incluídos"

key-files:
  created:
    - src/ui/room.ts
    - tests/room-ui.test.ts
    - .planning/phases/03-sala-transporte-e-protocolo/deferred-items.md
  modified:
    - index.html
    - src/ui/dom.ts
    - src/style.css
    - src/render/sprites.ts
    - src/main.ts
    - tests/net-vocabulary.test.ts

key-decisions:
  - "`src/ui/room.ts` não importa `ui/dom.ts` nem `render/sprites.ts`: os dois tocam a plataforma na carga (cem getElementById, um `new Image()`), e importar qualquer um tornaria o módulo inutilizável fora do navegador — a metade pura da tela deixaria de ter teste"
  - "A sessão de sala (signaling + WebRTC + lobby) mora na view, e não em main.ts: as três telas são um fluxo só, e o estado que elas pintam é o da sessão"
  - "O badge sobrevive ao fim da sessão quando a flag de relay está ligada — esconder o único sinal de que tudo passa pelo relay é o que transforma 'o jogo está com lag' em uma hora de diagnóstico"
  - "`route: 'unknown'` imprime só o número, sem `direto`: dizer 'direto' para uma rota que esta máquina não mediu é justamente a metade tranquilizadora da afirmação"
  - "O badge diz `—` e não `sem resposta` quando não há número: ele tem uma linha e não distingue 'ainda não medi' de 'medi e está mudo'; o card do slot, que tem espaço, distingue"
  - "`#btn-start-run` fica ligado a nada NESTE plano, com o motivo escrito no lugar do clique: iniciar a run é escolher assento e seed e comparar o hash do tick 0, que é o assunto inteiro do plano 03-10"

patterns-established:
  - "Teste de view em duas metades declaradamente diferentes: funções puras importadas e chamadas, mais asserção estrutural sobre o texto para as regras da forma 'isto nunca aparece'"
  - "Fumaça de ambiente antes do checkpoint humano: subir o servidor de signaling e criar uma sala por socket antes de mandar o usuário abrir o navegador"

requirements-completed: []

# Metrics
duration: 24min
completed: 2026-09-08
---

# Phase 3 Plan 09: As quatro telas da sala Summary

**As telas de sala, lobby e divergência existem no padrão craftpix sem um token, uma fonte ou uma `@media` nova, com os 27 ids conferidos por teste, o avatar de cada slot na cor do seu dono sem sobrescrever a folha que a run inteira desenha, e um `?sala=ABC123` que abre o fluxo de entrada e some da barra de endereço — tudo sobre uma view que não importa o DOM e por isso tem teste em Node.**

> **Estado: as tarefas 1 a 3 estão prontas e commitadas. A tarefa 4 é um
> `checkpoint:human-verify` bloqueante e está AGUARDANDO A CONFERÊNCIA VISUAL DO
> USUÁRIO.** Um agente de continuação registra a resposta aqui e fecha o plano.

## Performance

- **Duration:** ~24 min (tarefas 1–3)
- **Started:** 2026-09-08T16:13:05Z
- **Tasks:** 3 de 4 (a quarta é o portão humano)
- **Files:** 9 (3 criados, 6 editados)

## Accomplishments

- **A tela existe no padrão, e o padrão não foi tocado.** `grep -c "@media" src/style.css` continua **0**, nenhum token de cor novo entrou, e cada componente novo foi acrescentado à **lista de seletores** da regra que já existia (`.lobby-slot` ao lado de `.class-card`, `.lobby-chip` ao lado de `.key`, `#join-code` ao lado de `#hero-name`) em vez de copiar declarações. As únicas regras genuinamente novas são o estado `disabled`, o foco visível, o alvo de 44 px, o layout dos slots, o badge e os dois hashes selecionáveis.
- **`src/ui/room.ts` não importa `ui/dom.ts` nem `render/sprites.ts`, e essa é a decisão que sustenta o teste.** Os dois tocam a plataforma no instante em que são carregados — um resolve cem elementos, o outro constrói um `Image` — então importar qualquer um faria o módulo lançar em Node. Elementos, recolor e moldura chegam por `initRoom(deps)`, no molde literal de `open(url)` em `net/signaling.ts`. Resultado: `tests/room-ui.test.ts` **chama** o corte de nome, a chave do cache, a faixa de ping e o link de convite, sob Node, sem jsdom — 15 testes em 435 ms.
- **Quatro bonecos em quatro cores, e a folha da run intacta.** `recolorPlayerSheet` escrevia no módulo-global `playerSheet`, que é a folha que a run inteira desenha; quatro slots chamando-a se sobrescreveriam e a run começaria com a cor do último. `recolorSheet` **devolve** o canvas, `recolorPlayerSheet` virou uma linha em cima dele, e `grep -c "playerSheet =" src/render/sprites.ts` devolve **1** — a única escritora que existe.
- **O nome de um peer não vira elemento.** `grep -c "innerHTML" src/ui/room.ts` é **0**, e não por acaso de estilo: a palavra não aparece nem em comentário, porque o critério é um grep sobre o texto do arquivo. O corte é por **ponto de código** e não por `slice`, então doze emoji são doze caracteres na tela e não seis mais meio par substituto. O teste passa `<img src=x onerror=alert(1)>` e assere que o valor sai literal — correto **porque** ele aterrissa por `textContent`, e escapar aqui produziria dupla codificação na tela.
- **`▶ INICIAR` é ausência, não `disabled`.** O nó está no markup, `ui/dom.ts` guarda a referência, e a view o **remove** quando esta máquina não é a autoridade — a referência sobrevive à remoção, então ele volta ao lugar se esta máquina criar uma sala depois. `grep` confirma `btnStartRun.remove()` presente e `btnStartRun.disabled` ausente.
- **Nenhum temporizador, ao contrário de `#color-preview`.** `grep -c "setInterval" src/ui/room.ts` é 0. Os quatro cards são construídos **uma vez** e remendados no lugar; o canvas só é repintado quando a chave `${classe}|${r},${g},${b}` muda. Quatro canvases recriados por segundo seriam lixo de GC e piscada, e o lobby não comunica nada movendo-se.
- **O clique por teclado funciona.** `grep -c "detail === 0"` é 0: aquela guarda existe porque Espaço é a tecla de ataque **durante a run**, e não há run atrás destas telas. A exceção é `#btn-relay-flag`, que fica visível durante a run e usa a guarda — e o nome dela aparece **exatamente uma vez** no arquivo, o que exigiu import de namespace e uma perífrase no comentário, no mesmo padrão que `rtc.ts` usa para a opção que não pode soletrar.
- **O link compartilhado não carrega a flag de debug.** `inviteLink` é montado de `origin + BASE_URL + código` e descarta tudo depois de `?` e `#`; `grep -c "location.href" src/ui/room.ts` é **0**. O teste monta a partir de uma base com `?ice=relay#x` e assere que o resultado é só `?sala=ABC123` (T-3-29).
- **A query é lida uma vez e some.** `readRelayFlag` reconstrói a URL sem `ice` **preservando** o resto, e só então `?sala=` é lido, normalizado e removido com `history.replaceState`. `public/` não mudou: `start_url` e `scope` seguem `"."`, `sw.js` já deixa `/api/` e `/ws` passarem, e `npm run sw:verify` sai 0.
- **O ambiente do checkpoint foi testado antes de ser pedido.** O servidor de signaling subiu com `DG2_DB=./dev-signaling.db`, `/api/health` respondeu `{"status":"ok"}`, e um socket com `Origin: http://localhost:5173` mandou um `create` e recebeu `created` com o código `QP3VKE` e a lista de servidores ICE. O processo foi encerrado e os três arquivos de banco apagados — a árvore ficou limpa.

## Task Commits

| Tarefa | Commit | Tipo |
|---|---|---|
| Task 1: markup das quatro telas, os 27 ids e o CSS | `bb996ea` | feat |
| Task 2 (RED): teste que falha para a view da sala | `58141e0` | test |
| Task 2 (GREEN): recolor puro, cache por slot e a view | `a42e116` | feat |
| Task 3: `#btn-coop`, `?sala=`, copiar link e o badge | `b51fa9f` | feat |

A tarefa 2 tem `tdd="true"`. O commit RED reporta vermelho por ausência do módulo (`Failed to resolve import "../src/ui/room"`); o GREEN o deixa verde. Não houve fase REFACTOR: o que havia a limpar foi limpo dentro do próprio verde e está em Deviations.

## Files Created/Modified

- `index.html` — três `.screen` novas dentro do `#ui-overlay`, `#net-badge` **fora** dele e **depois** de `#touch-ui`, e `#btn-coop` entre `#btn-start` e `#btn-update`. `#join-code` com `type="text"` (obrigatório: `isTextInput()` só engole tecla de `type="text"`), `maxlength`, `autocapitalize`, `autocomplete` e `spellcheck`; `role="alert"` no erro e `role="status" aria-live="polite"` nas duas linhas de estado.
- `src/ui/dom.ts` — 27 entradas novas agrupadas por tela, cada bloco com o comentário que cita a decisão, mais `room`/`lobby`/`desync` em `dom.screens`. Total de `getElementById`: 116.
- `src/style.css` — sete regras existentes ganharam seletores na lista; a seção nova traz `disabled`, `:focus-visible`, `min-height: 44px`, `#lobby-slots` em `flex-wrap`, o canvas de 48×56, o corte de nome em `12ch`, os dois hashes com `user-select: text` e `#touch-ui.enabled ~ #net-badge` — combinador `~`, com o motivo (`style.css:981` já não casa nada por causa de um elemento no meio).
- `src/render/sprites.ts` — `recolorSheet(cls, rgb)` puro, com o `try`/`catch` da folha contaminada preservado em **todos** os caminhos de falha; `recolorPlayerSheet` reduzida a uma linha.
- `src/ui/room.ts` *(criado, 815 linhas)* — cabeçalho com a inversão (telas dirigidas por rede e não por `World`), o motivo de não importar o DOM, as cinco decisões que a view codifica e a regra do conteúdo remoto. Metade pura exportada (`clipName`, `avatarKey`, `pingBand`, `slotLine`, `badgeLine`, `inviteLink`), tabela `COPY` única, e `initRoom(deps)` com a sessão de sala inteira.
- `src/main.ts` — a leitura única da query no boot, `SIGNALING_URL` (mesma origem em produção, a unidade em 8080 em dev, casando com o padrão de `DG2_ORIGIN`), `VERSIONS`, o `accountId` de sessão, `initRoom(...)`, `#btn-coop` e `room.paintBadge()` dentro do `frame()`.
- `tests/room-ui.test.ts` *(criado, 15 testes)* — o cabeçalho diz que o runner é Node sem jsdom e que a prova com DOM real é a spec de Playwright do plano 03-10.
- `tests/net-vocabulary.test.ts` — glob crescido com `src/ui/room.ts`, mais um teste nomeando o arquivo e o parágrafo que registra por que é um arquivo e não o diretório `src/ui/**`.

## Deviations from Plan

### Ajustes automáticos

**1. [Rule 1 - Bug] O número de ids do critério estava velho: 124, não 112**

- **Found during:** Task 1
- **Issue:** o critério de aceitação diz que `grep -o 'id="[a-z-]*"' index.html | sort -u | wc -l` deve devolver 112, número herdado da UI-SPEC ("os 25 ids levam o total de 87 para 112"). O `index.html` na base desta onda já tinha **97** ids, não 87, e a tabela § DOM Contract lista **27** linhas, não 25.
- **Fix:** os 27 ids entraram como especificado; o total é 97 + 27 = **124**. Nenhuma mudança de código — o que estava errado era o número no critério, e `tests/dom-ids.test.ts` (que compara os dois arquivos em vez de contar) passa.
- **Commit:** `bb996ea`

**2. [Rule 2 - Missing critical] A sessão de sala foi ligada, ou o checkpoint não teria o que verificar**

- **Found during:** Task 3
- **Issue:** as tarefas descrevem telas e fluxo, mas nada nelas cria uma sala — e os passos 4 a 7 do `<how-to-verify>` pedem para criar uma sala e entrar de uma segunda aba. Sem o signaling, o `RtcTransport` e o `createLobby` amarrados, `▶ CRIAR SALA` não teria efeito.
- **Fix:** `initRoom` monta a sessão inteira (cliente de signaling → transporte WebRTC → lobby), assina os eventos e pinta. Os três módulos vêm prontos das ondas 2 e 4; nada de rede foi escrito aqui.
- **Commit:** `b51fa9f`

**3. [Rule 3 - Blocking] `entry` declarado e nunca lido derrubava o `tsc --noEmit`**

- **Found during:** Task 2
- **Fix:** variável removida; `openLobbyScreen(joined)` já recebe o que ela guardaria.
- **Commit:** `a42e116`

**4. [Rule 3 - Blocking] Dois greps de aceitação contam comentários**

- **Found during:** Task 2
- **Issue:** `grep -c "innerHTML"` precisa devolver 0 e `grep -c "mouseOnly"` precisa devolver 1 — e o cabeçalho citava a primeira palavra, e um import nomeado gastaria a única ocorrência da segunda.
- **Fix:** perífrase no comentário ("a propriedade de markup de qualquer nó") e import de namespace com o motivo escrito. É o padrão que o plano 03-08 registrou para o mesmo tipo de critério.
- **Commit:** `a42e116`

**5. [Rule 1 - Bug] Uma expectativa do próprio teste estava errada**

- **Found during:** Task 2 (GREEN)
- **Issue:** o teste do badge esperava `'40 ms'` para um convidado cujo slot tinha `route: 'direct'`; a resposta certa é `'40 ms · direto'`.
- **Fix:** expectativa corrigida e um caso novo acrescentado (`—` antes do primeiro `pong`), que é o estado em que o badge nasce.
- **Commit:** `a42e116`

### Fora de escopo, registrado e não corrigido

- `tests/lint-coverage.test.ts` estourou o timeout de 5 s na primeira execução da suíte nesta máquina (o `eslint` frio demora mais que isso). Verde em todas as execuções seguintes, inclusive na final com 865 testes. Nada foi mudado.
- A ligação de `SIM_VERSION` ao cliente — ver `deferred-items.md` na pasta desta fase.

## Known Stubs

| Stub | Arquivo | Por que, e quem resolve |
|---|---|---|
| `#btn-start-run` não tem manipulador de clique | `src/ui/room.ts` (bloco de wiring, com o comentário no lugar do clique) | Iniciar a run é escolher assento e seed, montar o mundo em cada máquina e comparar o hash do tick 0 — o assunto inteiro do **plano 03-10**, que lista este arquivo entre os que edita. Até lá o botão aparece e fica habilitado para a autoridade, exatamente como a UI-SPEC exige, e clicar não faz nada. |
| `onStart` só escreve no console | `src/main.ts` | Mesma razão: o manifesto chega, e transformá-lo em run é o **plano 03-10** (`LOCAL_SLOT` deixa de ser constante). |
| `VERSIONS.sim` é a string `'unwired'` | `src/main.ts` | O hash do bundle da sim é artefato de build (`packages/sim/dist/sim-version.json`, no `.gitignore`) e nada o injeta no cliente ainda. Enquanto for assim, a metade `sim` do portão de versão não recusa nada. Registrado em `deferred-items.md`. |
| `showDesync` existe e ninguém chama | `src/ui/room.ts` | A tela de divergência é pintada quando os hashes do tick 0 discordam — **plano 03-10** (D3-05). |

## Threat Flags

Nada novo. As três mitigações que o `<threat_model>` deste plano atribui a estes arquivos estão no código e cobertas por teste: T-3-14 (`textContent` sempre; `innerHTML` ausente até em comentário; corte em 12 pontos de código), T-3-29 (link montado do código da sala; `?ice=` removido com `replaceState`; badge permanente) e T-3-34 (`max-width: 12ch` com elipse mais o corte duro). T-3-32 é negativa e verificada: `public/` não mudou e `npm run sw:verify` sai 0.

## Verification

| Portão | Resultado |
|---|---|
| `npm run build` | **0** |
| `npm test` | **0** — 59 arquivos, **865 testes** |
| `npm run lint` | **0** |
| `npm run sw:verify` | **0** — 13 caminhos de precache batendo com o `dist/` |
| `npx vitest run tests/dom-ids.test.ts tests/room-ui.test.ts tests/net-vocabulary.test.ts tests/build-base.test.ts tests/workspaces.test.ts` | **0** |
| Checkpoint visual (Task 4) | **AGUARDANDO O USUÁRIO** |

Critérios de aceitação medidos: `@media` = 0, `btn-pixel:disabled` = 1, `focus-visible` = 2, `#touch-ui.enabled ~ #net-badge` = 1 e a forma com `+` = 0, `innerHTML` = 0, `setInterval` = 0, `detail === 0` = 0, `announce(` = 1, `.focus()` = 9, `mouseOnly` = 1, `location.href` em `room.ts` = 0, `navigator.clipboard` = 1, `playerSheet =` = 1, `room-ui` com 15 testes.

## Self-Check

Preenchido pelo agente que fecha o plano depois do checkpoint.
