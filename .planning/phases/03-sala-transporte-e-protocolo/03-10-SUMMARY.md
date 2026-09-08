---
phase: 03-sala-transporte-e-protocolo
plan: 10
subsystem: run-config-e-e2e
tags: [run-config, tick-0-hash, desync, playwright, e2e, webrtc, form-12, teste-estrutural]

# Dependency graph
requires:
  - phase: 03-sala-transporte-e-protocolo
    plan: 03
    provides: "createLobby, startRoom, a guarda estreita do lobbyState/startRun, createPinger e tests/net/helpers.ts"
  - phase: 03-sala-transporte-e-protocolo
    plan: 04
    provides: "attachSignalling com origin/rooms/limiters injetados, e a checagem de Origin antes do handshake"
  - phase: 03-sala-transporte-e-protocolo
    plan: 08
    provides: "createSignalingClient, createRtcTransport com connectionOf, routeOf sobre getStats"
  - phase: 03-sala-transporte-e-protocolo
    plan: 09
    provides: "As tres telas, initRoom(deps), showDesync, o badge e o #btn-start-run sem acao"
  - phase: 02-publicacao-e-servidor
    provides: "tests/pwa/helpers.ts (serveDir), playwright.config.ts, o job pwa do CI e o sw allowlist"
provides:
  - "src/app/forge.ts: buildRunConfig(seed, mode, ocupantes) e localForge(), sem sorteio proprio"
  - "src/main.ts: o assento local como variavel, beginRun(manifesto, assento) e newSeed()"
  - "src/net/lobby.ts: tickZeroHash, a troca de impressao digital pelo ack, onDesync e setRoute"
  - "src/ui/room.ts: o clique de INICIAR, a sonda de rota de 1 Hz e a tela de divergencia ligada"
  - "tests/net/e2e-helpers.ts: o dist/ e o /ws numa origem so, sem banco"
  - "tests/net/room.spec.ts: a prova de ponta a ponta da sala em Chromium"
  - "tests/pwa/room-url.spec.ts: o start_url que nao guarda a sala"
  - "playwright.config.ts com dois projetos, e os scripts test:e2e/typecheck:net"
affects: [03-11-relay-contra-a-caixa, 04-netcode, 05-reconexao]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Manifesto como unica fonte da run: uma funcao monta o RunConfig para solo e para co-op, e a seed e argumento"
    - "Prova simetrica: o mesmo kind (`ack`) carrega a impressao digital nos dois sentidos, e quem nota abre a tela"
    - "Capacidade assincrona empurrada para dentro (setRoute) quando a interface estreita nao pode crescer"
    - "Auditoria ESTRUTURAL de modulos que nao carregam sob Node (forge.ts, main.ts), com guarda anti-vacuidade por tamanho"
    - "Adulteracao em transito no teste: o transporte reescreve o quadro antes da entrega, em vez de trocar a funcao de hash"
    - "Projetos do Playwright por diretorio, com o motivo do workers:1 escrito uma vez e valendo para os dois"

key-files:
  created:
    - tests/run-config-lobby.test.ts
    - tests/net/e2e-helpers.ts
    - tests/net/room.spec.ts
    - tests/net/tsconfig.json
    - tests/pwa/room-url.spec.ts
  modified:
    - src/app/forge.ts
    - src/main.ts
    - src/net/lobby.ts
    - src/ui/room.ts
    - playwright.config.ts
    - tsconfig.json
    - package.json
    - .github/workflows/ci.yml
    - tests/pwa/helpers.ts

key-decisions:
  - "A impressao digital do tick 0 viaja no kind `ack`, e nao num kind novo: `packages/protocol` nao esta em files_modified, e a tabela MSG_KIND descreve `ack` como o que FECHA O LACO — que e literalmente o que este par de mensagens faz"
  - "O `ack` e SIMETRICO: a autoridade manda a propria impressao digital junto do startRun e cada convidado responde com a sua, entao cada lado compara um par e cada lado pode ser o que nota. Uma sala em que so a autoridade comparasse deixaria o jogador divergente numa run que ninguem lhe disse estar errada"
  - "`tickZeroHash` mora em lobby.ts e NAO e uma dependencia injetada: existe exatamente uma resposta certa para 'como se constroi o mundo inicial' (D-11), e uma dep com muitas respostas possiveis das quais so uma e correta e uma armadilha. A divergencia do teste e forcada adulterando o manifesto EM TRANSITO, que e a forma real da falha"
  - "A rota entra no lobby por `setRoute` (empurrada) em vez de o lobby perguntar: `routeOf` e assincrona e le um `RTCPeerConnection`, e alargar `Transport` para acomoda-la poria WebRTC na interface que `local.ts` e `lossy.ts` tambem satisfazem"
  - "`buildRunConfig` e `main.ts` sao auditados pelo TEXTO e nao importados: os dois tocam o DOM na carga (forge.ts importa ui/dom.ts, que resolve 116 elementos), entao sob Node nem carregam. E o mesmo motivo do cabecalho de ui/room.ts, e a resposta e a que tests/rtc-shape.test.ts ja registrou"
  - "A spec de ponta a ponta usa TRES contextos e nao dois: a ultima afirmacao e sobre quem FICA quando a autoridade sai, e esse alguem nao pode ser o convidado que acabou de sair"
  - "O helper de e2e nao abre banco nenhum: `recordOutcome`/`forgetOutcomes` sao no-ops, que e exatamente o caso que signaling/index.ts documenta ao mante-los como argumentos separados"
  - "`test:pwa` continua significando SO o portao do PWA (`--project=pwa`), e `test:e2e` e o que roda os dois: um projeto unico sobre um diretorio alargado teria mudado em silencio o que o comando citado em 02-VALIDATION.md prova"

patterns-established:
  - "Adulteracao em transito como forma de forcar divergencia num teste de rede, com o motivo escrito: um hash falsificado provaria so que a comparacao compara"
  - "Assercao de tela por CLASSE e nao por visibilidade quando o CSS esconde por opacity (o toBeVisible do Playwright e verdadeiro para todas as telas ao mesmo tempo)"

requirements-completed: [SALA-02, SALA-03]

# Metrics
duration: 33min
completed: 2026-09-08
---

# Phase 3 Plan 10: O laco fechado — do manifesto ao hash do tick 0 Summary

**`▶ INICIAR` passou a iniciar a run: a autoridade emite um `RunConfig` com a seed, cada maquina constroi o mundo pela mesma sequencia canonica e devolve o `hashWorld` do tick 0, e os dois lados comparam antes de qualquer outra coisa — provado por tres contextos de navegador que abrem uma sala por loopback, se veem com ping e rota `direto`, escolhem classe, comecam a mesma run e sobrevivem a saida um do outro.**

## Performance

- **Duration:** ~33 min
- **Started:** 2026-09-08T18:20:00Z
- **Completed:** 2026-09-08T18:53:00Z
- **Tasks:** 3 de 3
- **Files:** 14 (5 criados, 9 editados)

## Accomplishments

- **A frase inteira da fase e verdade, em Chromium, sem mock nenhum.** `tests/net/room.spec.ts` roda em 36 s e prova, numa execucao, as sete afirmacoes: o codigo de seis caracteres aparece; um segundo contexto entra por ele; as duas cadeiras aparecem nos dois; a perna medida mostra `N ms · direto` **dos dois lados** (o numero e a rota vem de fontes diferentes — `ping`/`pong` e `getStats()`); a classe escolhida por um viaja ate a tela do outro; `▶ INICIAR` poe os tres numa run e **nenhuma** tela de divergencia aparece; um convidado que sai nao derruba a sala e quem a criou saindo a encerra com a frase literal do contrato de copy.
- **O hash do tick 0 e simetrico, e essa foi a decisao que mudou o desenho.** A primeira leitura obvia era "o convidado prova, a autoridade julga". Ela deixa o jogador divergente numa run que ninguem lhe disse estar errada — que e o modo de falha mais caro possivel, porque ele *parece* estar jogando. A autoridade manda a propria impressao digital junto do `startRun`, cada peer responde com a sua, e **cada lado compara um par**. O teste assere a consequencia exata: o que um lado chama de "o seu" e o que o outro chama de "o da sala".
- **A camada estatica nao viaja, e agora isso e um teste sobre os BYTES.** `Object.keys` do corpo do `startRun` que saiu no fio e exatamente `['mode','players','seed']`. O hash do tick 0 e o que torna essa economia segura: se a arena nao fosse derivavel da seed, os dois numeros divergiriam e a sala diria isso na hora — no lobby, e nao quarenta segundos depois.
- **A ordem do array de `players` e carga, e agora ha um teste que quebra se deixar de ser.** Dois manifestos que diferem **so** na ordem produzem `hashWorld` diferentes. Sem essa asserção, FORM-02/D-13 seria uma frase num comentario, e o dia em que alguem "ordenasse por nome para ficar bonito" o replay passaria a reconstruir outro mundo em silencio.
- **`LOCAL_SLOT` deixou de ser constante — a linha que o Marco 0 anunciou.** O assento chega **com** o manifesto, porque o `RunConfig` nao pode dize-lo sozinho: ele nomeia `p0..p3` e nada nele diz qual e esta maquina (`peerId` nunca entra no `World`, ADR 0001). `beginRun` agora cria um player por assento e le o local por `find(p => p.id === slot)` — `players[0]` deixou de ser "eu" e passou a ser "quem entrou primeiro".
- **Solo virou uma sala de um jogador, e isso apagou um caminho de codigo.** `buildRunConfig(seed, mode, ocupantes)` monta o manifesto dos dois lados; `Math.random()` saiu de `forge.ts` e a seed passou a ser sorteada **no ponto de entrada**, uma vez, por `crypto.getRandomValues` — a forma certa (uint32) na fonte, em vez de um `>>> 0` carregando a correcao.
- **A lacuna que o plano 03-08 deixou por escrito esta fechada.** `route` era `'unknown'` fixo; agora `src/ui/room.ts` le `routeOf(rtc.connectionOf(peer))` uma vez por segundo e empurra o resultado com `lobby.setRoute`, que o relata no proximo resumo (D3-16). A sonda repete em vez de medir uma vez so **porque o ICE pode renomear o par no meio da sessao** — um caminho direto que cai para o relay e exatamente o evento que o badge existe para mostrar.
- **`tests/pwa/room-url.spec.ts` responde a pergunta em aberto da pesquisa medindo a URL RESOLVIDA.** `start_url: "."` e o texto certo tanto no mundo em que funciona quanto no em que nao funciona; o que distingue os dois e o `href` do documento na hora de resolver. A spec instala a partir de `/?sala=ABC123` e assere que o resolvido e `${origin}/`, que o `scope` tambem nao carrega a sala, e — a metade que ninguem lembra de medir — que a consulta nao virou uma entrada de Cache Storage propria.
- **O helper de e2e e a topologia do Caddy colapsada num processo, e isso era obrigatorio.** A checagem de `Origin` do plano 03-04 compara byte a byte e D-08 recusa builds diferentes sem bypass: um WebSocket numa segunda porta seria uma segunda origem, e a spec estaria provando uma forma que producao nao tem. `serveDir` ganhou **um** campo (`upgradable`) e o signaling se pendura no mesmo `http.Server`. Nada e persistido — sem banco, sem arquivo deixado para tras.
- **A configuracao do Playwright agora tem dois projetos, e `test:pwa` continua significando a mesma coisa.** `03-VALIDATION.md` deixou essa decisao para o planejador; a resposta e `--project=pwa` para o portao antigo e `test:e2e` para os dois, porque um projeto unico sobre um diretorio alargado teria mudado em silencio o que o comando citado em `02-VALIDATION.md` prova. O `workers: 1` passou a valer para os dois pelo mesmo motivo escrito de outra forma: uma origem, um processo de signaling e um `Map` de salas em memoria.

## Task Commits

| Tarefa | Commit | Tipo |
|---|---|---|
| Task 1 (RED): teste que falha para o manifesto e o assento local | `cb9f7e1` | test |
| Task 1 (GREEN): `buildRunConfig` de um para quatro, e o assento que chega da sala | `0c1bdee` | feat |
| Task 2 (RED): teste que falha para o `startRun` pelo lobby e a prova do tick 0 | `849ec84` | test |
| Task 2 (GREEN): `INICIAR` inicia a run, e o hash do tick 0 e comparado | `2dbfad0` | feat |
| Task 3: dois navegadores fechando uma sala, e o PWA que nao guarda a sala | `6651b88` | test |

As tarefas 1 e 2 tem `tdd="true"`. O commit RED da tarefa 1 reporta **6 de 14** vermelhos e o da tarefa 2 **9 de 21** — vermelhos por comportamento e por texto, nao por ausencia de modulo, porque metade do arquivo mede propriedades do `RunConfig` que ja eram verdadeiras. Nao houve fase REFACTOR em nenhuma das duas.

## Files Created/Modified

- `src/app/forge.ts` — `buildRunConfig(seed, mode, ocupantes)` com os assentos saindo de `PLAYER_SLOT`, `localForge()` como unica grafia dos sete perks desta maquina, `RunOccupant` com `forge` opcional (ausente = esta maquina, a unica cujo forge mora no Save daqui), e um teto explicito de 1 a 4 ocupantes. A linha 37 foi corrigida no mesmo commit (FORM-12): o comentario da seed diz **autoridade**.
- `src/main.ts` — o assento local virou `let`, com o doc-comment reescrito para dizer o que aconteceu em vez de apagado; `SOLO_SLOT` e o **ultimo literal de assento do arquivo**, e e o que o plano sanciona; `beginRun(config, slot)` cria um player por assento na ordem do manifesto e le o local pelo assento; `newSeed()` com `crypto.getRandomValues`; `onStart` liga o manifesto a `beginRun` e `onQuit` liga a tela de divergencia ao mesmo caminho de saida da tela de pause.
- `src/net/lobby.ts` — `tickZeroHash` (a sequencia canonica, uma vez so), `KIND_ACK` com a impressao digital nos dois sentidos, `readHash` com teto de 16 caracteres (o valor vai para uma tela), `onDesync`, `setRoute`, `mySlot()` e o paragrafo em maiusculas dizendo que a run comeca **local e sem sincronia** e que o streaming e a fase 4 — sem ele, os personagens parados leem como bug.
- `src/ui/room.ts` — o clique de `▶ INICIAR` (com a guarda por `lastView.closed`, que e o estado que a sala ja publica), `armRouteProbe` a 1 Hz cancelada no teardown, `onDesync(showDesync)`, `deps.newSeed`, `deps.onQuit`, e o arredondamento do ping.
- `tests/run-config-lobby.test.ts` *(criado, 21 testes)* — as duas metades declaradamente diferentes: comportamento sobre a topologia real de `tests/net/helpers.ts`, e auditoria estrutural sobre o texto de `forge.ts`/`main.ts`, com o motivo e a guarda anti-vacuidade no cabecalho.
- `tests/net/e2e-helpers.ts` *(criado)* — `serveGame(dir)`: o `dist/` e o `/ws` numa origem efemera so, log coletado em vez de impresso, heartbeat desarmado no `close()`.
- `tests/net/room.spec.ts` *(criado)* — as sete afirmacoes com `expect.soft`, tres contextos, e o cabecalho explicando por que nao ha STUN, por que nao ha flag de midia falsa e por que a tela e asserida pela classe `active`.
- `tests/net/tsconfig.json` *(criado)* — no molde do irmao do PWA, cobrindo **os dois arquivos** que a raiz exclui e deixando `helpers.ts` fora, com o motivo escrito nos dois lugares.
- `tests/pwa/room-url.spec.ts` *(criado)* — a URL resolvida, o scope, e a ausencia de entrada de cache por convite.
- `tests/pwa/helpers.ts` — `StaticServer` ganhou `upgradable`, tipado como o unico metodo que o segundo consumidor usa, na forma que `UpgradableServer` do signaling ja estabeleceu.
- `playwright.config.ts`, `tsconfig.json`, `package.json`, `.github/workflows/ci.yml` — os dois projetos, o `exclude` por arquivo, `test:e2e`/`typecheck:net`, e os dois passos novos no CI.

## Deviations from Plan

### Ajustes automaticos

**1. [Rule 3 - Blocking] `buildRunConfig` nao pode ser importado sob Node, entao o teste o audita pelo texto**

- **Found during:** Task 1
- **Issue:** o plano manda `tests/run-config-lobby.test.ts` cobrir o comportamento de `buildRunConfig`, que mora em `src/app/forge.ts`. Esse modulo importa `./save`, `../ui/dom`, `../ui/screens` e `../ui/events`; `ui/dom.ts` resolve 116 elementos com `document.getElementById` **no corpo do modulo**. Sob o runner de Node, sem jsdom (que nao esta instalado e nao pode ser instalado — `dependencies` fica vazio e nenhum pacote e adicionado por este plano), importar `forge.ts` lanca antes da primeira asserção. Nenhum teste do repositorio o importa, exatamente por isso.
- **Fix:** o comportamento do manifesto (as cinco propriedades do `<behavior>` que sao sobre `RunConfig` → `hashWorld`) e medido de verdade, sobre manifestos escritos a mao e sobre os que **a sala monta** pelo caminho real; e as duas propriedades que sao sobre o TEXTO de `forge.ts`/`main.ts` (a seed deixou de ser sorteada ali; o assento deixou de ser constante) sao asseridas estruturalmente, com `tests/scan.ts` removendo comentarios e uma guarda anti-vacuidade por tamanho. E o padrao que o plano 03-08 registrou em `tests/rtc-shape.test.ts` para exatamente este caso, e o cabecalho do arquivo o cita e diz que a prova de comportamento desses dois arquivos e `tests/net/room.spec.ts`.
- **Files modified:** `tests/run-config-lobby.test.ts`
- **Commit:** `cb9f7e1`

**2. [Rule 3 - Blocking] `serveDir` precisou expor o `http.Server` para o signaling se pendurar nele**

- **Found during:** Task 3
- **Issue:** o plano manda reusar `serveDir` de `tests/pwa/helpers.ts` **e** anexar `attachSignalling` ao mesmo `http.Server`. `StaticServer` nao expunha o servidor, e nao ha como chegar nele de fora.
- **Fix:** um campo, `upgradable`, tipado como o **unico metodo** que o segundo consumidor usa (`on('upgrade', ...)`), na forma que `UpgradableServer` de `apps/server/src/signaling/index.ts` ja estabeleceu — nada ganhou acesso ao listener que as specs do PWA possuem. A alternativa era uma segunda copia do servidor estatico, incluindo a guarda de path traversal e a regra de 404-nunca-index.html, que sao justamente as duas que nao devem existir em duplicata.
- **Files modified:** `tests/pwa/helpers.ts`
- **Commit:** `6651b88`

**3. [Rule 1 - Bug] O ping aparecia na tela como `0.7000000029802322 ms`**

- **Found during:** Task 3, na primeira execucao da spec de ponta a ponta
- **Issue:** `rtt()` e a mediana de diferencas entre duas leituras de `performance.now()`, que e um double. Em loopback isso imprime `0.7000000029802322 ms · direto`; numa conexao real imprimiria `23.400000000000006 ms`. So um navegador de verdade poderia mostrar isso — os testes em Node alimentavam inteiros.
- **Fix:** `Math.round` em `slotLine`, com o motivo escrito: a medicao continua exata (e comparada contra faixas e e o que um relatorio de bug deve carregar), e o arredondamento pertence a frase que uma pessoa le.
- **Files modified:** `src/ui/room.ts`
- **Commit:** `6651b88`

**4. [Rule 1 - Bug] `toBeVisible()` e verdadeiro para todas as telas ao mesmo tempo**

- **Found during:** Task 3
- **Issue:** `.screen` esconde por `opacity: 0` + `pointer-events: none` (style.css:91-106) e nao por `display: none`, e a visibilidade do Playwright nao olha opacidade. A primeira versao da spec passou pelo `toBeVisible` do lobby com a tela da sala ainda na frente, e so o texto do codigo (`——————`, o placeholder) denunciou.
- **Fix:** as telas passaram a ser asseridas pela classe `active`, que e a que `showScreen` liga, com o episodio registrado no comentario da constante para que ninguem "simplifique" de volta.
- **Files modified:** `tests/net/room.spec.ts`
- **Commit:** `6651b88`

**5. [Rule 2 - Missing critical] `beginRun` recusa um manifesto sem assento para esta maquina**

- **Found during:** Task 1
- **Issue:** com quatro assentos, um manifesto em que `find(p => p.id === slot)` falha produziria uma run renderizada de um mundo em que esta maquina nao esta — tela em branco, sem erro.
- **Fix:** guarda explicita com log; e do lado do lobby, um `startRun` que chegue antes do `lobbyState` fechado (do qual sai o assento) e recusado em vez de adivinhado, com o comentario dizendo por que a ordenacao do canal confiavel torna isso impossivel — para que a ordenacao continue sendo um fato e nao uma suposicao.
- **Files modified:** `src/main.ts`, `src/net/lobby.ts`
- **Commit:** `0c1bdee`

**6. [Rule 3 - Blocking] O `onStart` do lobby e da view passou a carregar o assento**

- **Found during:** Task 1
- **Issue:** `main.ts` precisa do assento para chamar `beginRun`, e nao tem como derivar: o `RunConfig` nomeia `p0..p3` e nada nele diz qual e esta maquina. Derivar por nome+classe seria errado por construcao — classes repetidas sao normais (D3-03).
- **Fix:** `Lobby.onStart` e `RoomDeps.onStart` passaram a `(config, slot)`. O lobby e o unico lugar que conhece os dois espacos, entao e onde a traducao pertence (ADR 0001). `src/net/lobby.ts` e `src/ui/room.ts` estao em `files_modified` do plano; a mudanca so caiu na tarefa 1 em vez da 2.
- **Files modified:** `src/net/lobby.ts`, `src/ui/room.ts`
- **Commit:** `0c1bdee`

### Fora de escopo, registrado e nao corrigido

- **`SIM_VERSION` continua sem chegar ao cliente.** `src/main.ts` ainda anuncia `sim: 'unwired'`. `package.json` esta em `files_modified` deste plano, mas `vite.config.ts` nao — e injetar o hash exige um `define` do Vite lendo `packages/sim/dist/sim-version.json`, que e uma decisao de build. O item segue em `deferred-items.md` sem alteracao. Consequencia enquanto durar: a metade `sim` do portao de versao nao recusa nada; a rede de seguranca e justamente o hash do tick 0 que este plano acabou de ligar, que pega duas builds com simulacoes diferentes **no lobby** em vez de quarenta segundos depois.

## Known Stubs

Nenhum. Os quatro stubs que o plano 03-09 registrou foram fechados por este plano, exceto `VERSIONS.sim`, que esta acima como item adiado com o dono nomeado:

| Stub de 03-09 | Estado |
|---|---|
| `#btn-start-run` sem manipulador de clique | **Fechado** — o clique chama `startRoom` com a seed e o modo |
| `onStart` so escrevia no console | **Fechado** — chama `beginRun(manifesto, assento)` |
| `showDesync` existia e ninguem chamava | **Fechado** — `lobby.onDesync(showDesync)` |
| `VERSIONS.sim === 'unwired'` | **Aberto**, adiado, dono nomeado (cadeia de build) |
| `route: 'unknown'` fixo (lacuna do 03-08) | **Fechado** — `setRoute` alimentado por `routeOf`/`connectionOf` |

## Threat Flags

Nada novo. As tres mitigacoes que o `<threat_model>` deste plano atribui a estes arquivos estao no codigo e cobertas por teste: **T-3-35** (um `startRun` de quem nao e a autoridade e descartado, e um `ack` de quem nao esta na sala tambem), **T-3-32** (`tests/pwa/room-url.spec.ts` mede o `start_url` resolvido e as entradas de cache) e **T-3-37** (o `✕` da divergencia usa `deps.onQuit`, o mesmo caminho da tela de pause — a run divergente e encerrada, nao escondida). **T-3-36** ja era mitigado pela guarda estreita do plano 03-03 e ganhou um vizinho: `readHash` limita o tamanho do valor que vai para a tela. **T-3-SC** continua verdadeiro: `package-lock.json` nao mudou, nenhum pacote foi instalado, e a versao do Playwright segue fixada em 1.62.1.

## Verification

| Portao | Resultado |
|---|---|
| `npm run build` | **0** |
| `npm test` | **0** — 60 arquivos, **886 testes** |
| `npm run test:e2e` | **0** — 12 specs, projetos `pwa` (11) e `net` (1), em 54 s |
| `npm run test:browser` | **0** — 12 testes em Chromium, Firefox e WebKit |
| `npm run bench:snapshot` | **0** — wave40 parte0=3316 B, teto 16384 B |
| `npm run lint` | **0** |
| `npx tsc --noEmit` | **0** |
| `npm run typecheck:net` | **0** |
| `npm run typecheck:pwa` | **0** |
| `npm run typecheck:sim` / `:protocol` / `:server` | **0** |
| `npm run sw:verify` | **0** — 13 caminhos de precache batendo com o `dist/` |
| `npx vitest run tests/golden.test.ts tests/determinism.test.ts` | **0** — a run solo nao regrediu |

Criterios de aceitacao medidos: `Math.random` em `forge.ts` = **0**; o substantivo proibido em `forge.ts` (case-insensitive) = **0**; `const LOCAL_SLOT` em `main.ts` = **0**; `tests/run-config-lobby.test.ts` = **21 testes** (o minimo era 7 e depois 12), com um deles nomeando `ORDEM`; `hashWorld` em `lobby.ts` = **3**; `obstacles|traps` em linhas de codigo de `lobby.ts` = **0**; `desync` em `room.ts` = **5**; `fase 4` em `lobby.ts` = **1**; `testDir: 'tests/net'` e `testDir: 'tests/pwa'` = **1** cada; `typecheck:net` no CI = **1**; `test:e2e` no CI = **1**; `exclude` da raiz com os dois arquivos de `tests/net/` e **sem** `helpers.ts`; `--project=pwa --list` lista **5 arquivos, nenhum de `tests/net`**; `--list` lista os **dois** projetos.

## Self-Check: PASSED

- **Arquivos criados, conferidos no disco:** `tests/run-config-lobby.test.ts`, `tests/net/e2e-helpers.ts`, `tests/net/room.spec.ts`, `tests/net/tsconfig.json`, `tests/pwa/room-url.spec.ts` — todos presentes.
- **Arquivos modificados, conferidos no disco:** `src/app/forge.ts`, `src/main.ts`, `src/net/lobby.ts`, `src/ui/room.ts`, `playwright.config.ts`, `tsconfig.json`, `package.json`, `.github/workflows/ci.yml`, `tests/pwa/helpers.ts` — todos presentes.
- **Commits conferidos em `git log`:** `cb9f7e1`, `0c1bdee`, `849ec84`, `2dbfad0`, `6651b88` — todos presentes no ramo do worktree, sobre a base `ebd1628`.
- **Arvore limpa:** nenhum arquivo nao rastreado sobrou; `test-results/` do Playwright foi apagado; `package-lock.json` nao foi tocado; nenhum servidor de e2e ficou de pe (os helpers derrubam o listener, destroem os sockets e desarmam o heartbeat no `close()`).
- **Nao tocados de proposito:** `STATE.md` e `ROADMAP.md`, que o orquestrador escreve depois da onda.
