---
phase: 02-migra-o-para-a-vps
plan: 05
subsystem: infra
tags: [pwa, playwright, service-worker, e2e, fixture, test-infra, cache-storage]

# Dependency graph
requires:
  - phase: 02
    plan: 02
    provides: "`base: '/'`, os `href` root-absolutos e as fontes na própria origem — sem isso o escopo do worker seria `/DungeonGuys2/` e a fixture mediria outra coisa"
provides:
  - "`@playwright/test` 1.62.1 e `playwright.config.ts`: runner de PWA de um browser só, serial, sem servidor gerenciado pelo runner"
  - "`tests/pwa/helpers.ts`: servidor estático derrubável em porta efêmera, com troca de raiz e rotas dinâmicas, leitura do Cache Storage, espera de ativação, coleta de falhas por origem e limpeza do cache HTTP"
  - "`tests/pwa/fixtures/old-build/`: a instalação antiga do critério 2, congelada, com o `sw.js` byte a byte igual ao `public/sw.js` atual"
  - "`install.spec.ts` e `offline.spec.ts` em VERMELHO, afirmando o comportamento alvo do plano 02-06"
  - "`npm run test:pwa` e `npm run typecheck:pwa`"
affects: [02-06 reescrita do sw.js, 02-07 ciclo de update na UI, 02-09 update.spec e api-isolation.spec, 02-11 job pwa no ci.yml]

# Tech tracking
tech-stack:
  added:
    - "@playwright/test 1.62.1 (exato, casando com o `playwright` já travado no lock)"
    - "@types/node ^24 (devDependency; pré-requisito do `types: [\"node\"]` que o plano pede)"
  patterns:
    - "config de runner separada por runner, com o comentário explicando por que a FORMA foi escolhida"
    - "`tsconfig` de subdiretório que ADICIONA tipos de Node, em vez de afrouxar o `types: [\"vite/client\"]` da raiz"
    - "spec escrita contra o comportamento alvo e commitada vermelha; a transição para verde é a evidência"
    - "asserções `expect.soft` em spec de RED planejado: uma rodada nomeia tudo o que falta, e o relatório vira o briefing do plano seguinte"
key-files:
  created:
    - playwright.config.ts
    - tests/pwa/tsconfig.json
    - tests/pwa/helpers.ts
    - tests/pwa/install.spec.ts
    - tests/pwa/offline.spec.ts
    - tests/pwa/fixtures/README.md
    - tests/pwa/fixtures/old-build/ (14 arquivos)
  modified:
    - package.json
    - package-lock.json
    - tsconfig.json
    - tests/build-base.test.ts
    - eslint.config.js
    - .gitignore

key-decisions:
  - "`offline.spec.ts` derruba o servidor ANTES do reload que põe o worker no controle, não depois: um reload online intermediário deixaria um worker network-first aquecer o cache com os arquivos que ele falhou em precachear, e o teste passaria pelo motivo errado"
  - "`clearHttpCache()` entrou porque sem ele o teste era falso verde MEDIDO, não hipotético — o `Cache-Control` de um ano dos assets hasheados fazia o cache HTTP responder offline e o service worker nunca ser consultado"
  - "`expect.soft` nas asserções centrais das duas specs: enquanto elas são vermelhas de propósito, o relatório de falha É a especificação entregue ao plano 02-06"
  - "INFRA-02 continua `Pending` em REQUIREMENTS.md — este plano entrega a medida, e a medida hoje diz NÃO"
  - "servidor de teste responde 404 para caminho inexistente, nunca `index.html`: espelha a recusa de `try_files` do Caddyfile (02-03)"

patterns-established:
  - "Fixture de artefato congelado com guarda anti-vacuidade no Vitest, conferida por mutação antes de ser aceita"
  - "Guarda anti-vacuidade sempre por COMPRIMENTO (herdado da lição do 02-02), nunca por `toBeTypeOf('string')`"

requirements-completed: []

# Metrics
duration: 20min
completed: 2026-09-01
---

# Phase 2 Plan 05: O instrumento de medida do critério 2

**Runner de PWA de um browser só, a instalação antiga congelada com guarda anti-vacuidade conferida por mutação, e duas specs que reprovam nomeando exatamente o que o plano 02-06 precisa entregar.**

## Performance

- **Duration:** ~20 min
- **Started:** 2026-09-01T02:22:47Z
- **Completed:** 2026-09-01T02:42:34Z
- **Tasks:** 3
- **Files:** 7 criados (mais os 14 da fixture), 6 modificados

## Accomplishments

- **"Instalou e joga offline" virou um comando.** `npm run test:pwa` sai **1** hoje, e sai por
  asserção de comportamento: `controller` não nulo no primeiro carregamento, cache chamado
  `dungeonguys2-v1` em vez de `dg2-<16 hex>`, precache com 3 arquivos a menos que o `dist/`, e —
  no offline — a tela pintando mas o clique em START não fazendo nada, com
  `/assets/index-*.css` e `/assets/index-*.js` morrendo em `net::ERR_FAILED`.
- **A janela de congelamento da fixture foi respeitada e é verificável.** O `dist/` foi
  construído com `base: '/'` já valendo (02-02) e o `public/sw.js` ainda antigo; `cmp` entre a
  fixture e `public/sw.js` sai 0. Cinco casos novos em `tests/build-base.test.ts` reprovam quem
  regenerar o diretório — e a guarda foi **conferida por mutação**, não presumida.
- **O typecheck do cliente não afrouxou.** `tests/pwa/` ganhou `tsconfig` próprio com
  `types: ["node"]`; a raiz continua em `types: ["vite/client"]` e agora exclui `tests/pwa`.
  `npx tsc --noEmit` e `npm run typecheck:pwa` saem 0, e nenhum arquivo de `src/` passou a
  enxergar `process` ou `Buffer`.
- **Um falso verde foi encontrado e fechado antes de virar hábito.** Detalhado abaixo: o cache
  HTTP conseguia servir o jogo inteiro offline sem o service worker participar.

## Task Commits

1. **Task 1: runner, `tsconfig` próprio e helpers** — `c318551` (test)
2. **Task 2: fixture congelada e a guarda anti-vacuidade** — `26f8897` (test)
3. **Task 3: as duas specs em RED** — `03afe51` (test)

## Files Created/Modified

- `playwright.config.ts` — `testDir: 'tests/pwa'`, um projeto (`chromium`), `fullyParallel: false`
  e `workers: 1`, `reporter: 'list'`, `serviceWorkers: 'allow'`, sem servidor gerenciado pelo
  runner. Os três "porquês" no comentário: service worker é Chromium-only no Playwright, Cache
  Storage é por origem (logo, serial), e o `offline.spec.ts` precisa matar o servidor no meio
- `tests/pwa/tsconfig.json` — `types: ["node"]`, `lib: ["ES2023","DOM"]`,
  `include: [".", "../../playwright.config.ts"]` e **`exclude: []`**
- `tests/pwa/helpers.ts` — 6 exportações: `serveDir` (com `origin`/`setRoot`/`route`/`close`),
  `waitForActivated`, `readCacheEntries`, `collectSameOriginFailures`, `clearHttpCache`, e o
  tipo `RouteHandler`
- `tests/pwa/install.spec.ts` — 2 testes: instalação limpa (vermelho) e manifesto instalável (verde)
- `tests/pwa/offline.spec.ts` — 1 teste (vermelho)
- `tests/pwa/fixtures/old-build/` — os 14 arquivos do `dist/` daquele instante
- `tests/pwa/fixtures/README.md` — a janela de congelamento e a regra de nunca regenerar
- `tests/build-base.test.ts` — `describe('fixture da instalação antiga')` com 5 casos (13 → 18)
- `tsconfig.json` — `exclude: ["tests/pwa"]`
- `package.json` / `package-lock.json` — `@playwright/test` 1.62.1 exato, `@types/node` ^24, e os
  scripts `test:pwa` e `typecheck:pwa`
- `eslint.config.js` — `tests/pwa/fixtures` no `ignores`
- `.gitignore` — `test-results/` e `playwright-report/`

## Decisions Made

- **A ordem do `offline.spec.ts` mudou de propósito.** O plano descreve: navegar → ativar →
  `reload()` para o worker assumir → derrubar → `reload()`. Ficou: navegar → ativar → limpar o
  cache HTTP → derrubar → **um** `reload()` que faz os dois papéis. Motivo medido: com o reload
  online no meio, o worker antigo (network-first, que grava toda resposta 200) enche o Cache
  Storage com exatamente os arquivos que ele **não** precacheia, e o teste fica verde provando o
  contrário do que afirma. O reload único continua pondo a página sob o worker — uma navegação
  nova sempre nasce sob o worker ativo, com ou sem `clients.claim()`.
- **`expect.soft` nas asserções centrais.** Numa spec que vai ficar vermelha por um plano
  inteiro, parar na primeira falha desperdiça a rodada. Com soft, uma execução lista as três
  faltas de `install.spec.ts` e as duas de `offline.spec.ts` — é literalmente o briefing do
  02-06, e é também o que faz o critério de aceitação ("o relatório nomeia nome de cache,
  conjunto de precache e `controller`") ser satisfeito numa rodada só.
- **INFRA-02 não foi marcado como concluído.** O plano declara `requirements: [INFRA-02]`, mas o
  que ele entrega é o instrumento; o requisito só fecha no 02-06, quando as specs virarem verdes.
  Marcar agora seria assinar embaixo de um teste que diz NÃO. `REQUIREMENTS.md` fica intocado.
- **Dois comentários foram reescritos para não colidirem com os `grep` de aceitação.** O plano
  pede o comentário explicando o browser único **e** `grep -c 'firefox\|webkit'` = 0; e pede
  ausência de servidor gerenciado **e** `grep -c 'webServer'` = 0. Resolvido escrevendo "Firefox"
  e "WebKit" capitalizados (como o resto da documentação do projeto já faz) e descrevendo o
  servidor sem citar o nome da opção. Os dois `grep` retornam 0 e as duas explicações continuam lá.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing critical] `offline.spec.ts` era um falso verde: quem servia era o cache HTTP, não o service worker**

- **Found during:** Task 3, na primeira execução
- **Issue:** a spec passou em 410 ms com o worker **antigo** — que não precacheia nenhum dos dois
  bundles. A causa: `tests/pwa/helpers.ts` manda `Cache-Control: public, max-age=31536000` para
  assets hasheados (de propósito, é o mesmo cabeçalho que o Caddy vai mandar), e num reload o
  Chromium serve subrecursos do cache HTTP sem tocar na rede — logo, sem consultar o worker. O
  documento principal tem `no-cache`, então ele passa pelo worker; todo o resto não. Um teste que
  pode passar com um service worker que não precacheia nada não é um teste do precache. É a
  ameaça T-2-FALSEGREEN por uma porta que o plano não previu: o registro só cita a emulação de
  `setOffline`.
- **Fix:** `clearHttpCache(page)` novo em `helpers.ts` — sessão CDP, `Network.clearBrowserCache`,
  chamado logo antes de derrubar o servidor. Cache Storage não é afetado (ignora `Cache-Control`
  por desenho). Chromium-only, o que não custa nada num runner que já é Chromium-only.
- **Verification:** mutação natural — sem a chamada, verde em 410 ms; com ela, vermelho nomeando
  `/assets/index-Dy3YcBin.css` e `/assets/index-CcdEJ3UK.js` em `net::ERR_FAILED` e o clique em
  START sem efeito.
- **Files modified:** `tests/pwa/helpers.ts`, `tests/pwa/offline.spec.ts`
- **Commit:** `03afe51`

**2. [Rule 3 - Blocking] `@types/node` não estava instalado, e o `types: ["node"]` do plano exige**

- **Found during:** Task 1
- **Issue:** nenhum teste do repositório importava de `node:` até agora (o `types` da raiz é
  `["vite/client"]`), então `@types/node` nunca entrou. Sem ele, `types: ["node"]` falha com
  "Cannot find type definition file for 'node'" e `import ... from 'node:http'` não resolve.
- **Fix:** `npm i -D @types/node@^24`, casando com o Node 24 LTS do projeto. Pacote canônico do
  DefinitelyTyped, sem `postinstall`; entrou como devDependency, e `dependencies` da raiz continua
  vazio.
- **Files modified:** `package.json`, `package-lock.json`
- **Commit:** `c318551`

**3. [Rule 3 - Blocking] a fixture congelada quebrou o `npm run lint`**

- **Found during:** Task 2
- **Issue:** `tests/pwa/fixtures/old-build/assets/index-CcdEJ3UK.js` é o bundle minificado, e
  `eslint .` não o ignorava — **279 erros** de `no-unused-expressions` sobre os operadores vírgula
  do esbuild, nenhum deles defeito de fonte. É exatamente o que o comentário do `ignores` já
  descreve para `dist`.
- **Fix:** `tests/pwa/fixtures` no array `ignores` do `eslint.config.js`, com o motivo escrito —
  incluindo o motivo extra: um autofix ali reescreveria o artefato congelado, que é a única coisa
  que `tests/build-base.test.ts` existe para impedir.
- **Files modified:** `eslint.config.js`
- **Commit:** `26f8897`

**4. [Rule 3 - Blocking] `exclude` é herdado por `extends`, e teria zerado o typecheck novo**

- **Found during:** Task 1
- **Issue:** `tests/pwa/tsconfig.json` estende o da raiz, e a raiz passou a carregar
  `exclude: ["tests/pwa"]`. `include`/`exclude` são herdados; sem reafirmar, o config filho
  excluiria o próprio diretório e passaria por vacuidade — o `include: ["."]` que o plano
  especifica não basta sozinho.
- **Fix:** `"exclude": []` reafirmado no filho, com o motivo em comentário. De quebra,
  `playwright.config.ts` entrou no `include` do filho: sem isso ele não seria typecheckado por
  ninguém (a raiz não o inclui, e o Playwright transpila sem conferir tipos).
- **Files modified:** `tests/pwa/tsconfig.json`
- **Commit:** `c318551`

**5. [Rule 3 - Blocking] `test-results/` ficava sujando a árvore**

- **Found during:** Task 3
- **Issue:** o Playwright grava um `error-context.md` por teste que falha, e estas specs falham de
  propósito por mais um plano inteiro — o diretório é reescrito a cada rodada.
- **Fix:** `test-results/` e `playwright-report/` no `.gitignore`, ao lado do bloco que já existe
  pelo mesmo motivo para o Vitest browser mode.
- **Files modified:** `.gitignore`
- **Commit:** `03afe51`

### Nota de ambiente

O worktree veio sem `node_modules`; `npm ci` foi rodado a partir do lock antes de qualquer coisa.
Não é desvio de plano, mas explica por que a instalação do `@playwright/test` aparece sobre uma
árvore recém-instalada.

---

**Total deviations:** 5 auto-fixes (1 × regra 2, 4 × regra 3), mais um desvio de ordem em
`offline.spec.ts` registrado em Decisions Made.
**Impact on plan:** nenhum arquivo fora do previsto além de `eslint.config.js` e `.gitignore`,
ambos de uma linha lógica. O achado de tabela é o do cache HTTP: **qualquer** teste de PWA deste
projeto que não limpe o cache HTTP antes de ir offline pode passar sem o service worker existir.
Vale para o `update.spec.ts` e o `api-isolation.spec.ts` do plano 02-09.

## Issues Encountered

- **`npx playwright test --list` mostra o caminho com `\` no Windows** (`tests\pwa\install.spec.ts`)
  enquanto o `testMatch` é escrito com `/`. Não é problema — o Playwright normaliza — mas quem
  comparar a saída literal com a do CI (Linux) vai ver strings diferentes.
- **`server.close()` sozinho não derruba nada.** Sem `closeAllConnections()`, os sockets keep-alive
  que o Chromium mantém deixam o callback pendente para sempre; o helper chama os dois, nessa
  ordem, com o motivo em comentário. Se isso for esquecido no 02-09, o sintoma será um `afterEach`
  que trava, não um teste vermelho.

## Threat Model

- **T-2-VACUOUS** (Tampering, fixture regenerada) — **mitigado e conferido por mutação.** Trocando
  o `sw.js` da fixture por um template pós-02-06, exatamente 3 casos falham, nomeando
  `dungeonguys2-v1` ausente e `__PRECACHE__` presente. Restaurada, 18/18 verdes e `cmp` contra
  `public/sw.js` sai 0.
- **T-2-FALSEGREEN** (Tampering, offline que não prova offline) — **mitigado, e mais fundo do que
  o registro previa.** O servidor é fechado de verdade antes do `setOffline(true)`, como o plano
  pede; além disso o cache HTTP é esvaziado, sem o que a spec passava com o worker antigo.
- **T-2-CACHE** (Information Disclosure, `/api/*` no Cache Storage) — a **medida** foi construída
  como planejado: `readCacheEntries` e o `route()` do servidor são o que torna o
  `api-isolation.spec.ts` do plano 02-09 possível. A mitigação em si continua sendo do 02-06.
- **T-2-SC** (Tampering, cadeia de suprimentos) — `@playwright/test@1.62.1` instalado com `-E`,
  casando com o `playwright` já travado; `@types/node@^24` é o pacote canônico do DefinitelyTyped.
  Nenhum dos dois roda `postinstall`. `dependencies` da raiz continua `{}`.

Nada de superfície nova de rede, autenticação ou esquema. Sem `threat_flag`.

## Verification

| Portão | Resultado |
|---|---|
| `npx tsc --noEmit` | sai 0 (raiz continua em `types: ["vite/client"]`) |
| `npm run typecheck:pwa` | sai 0 |
| `npm test` | 38 arquivos, **434** testes verdes (eram 429) |
| `npm run lint` | sai 0 |
| `npx playwright test` | **sai 1** — 2 falhas, 1 passa |
| `npx playwright test --list` | 3 testes, todos no projeto `chromium`, em nenhum outro |
| `cmp tests/pwa/fixtures/old-build/sw.js public/sw.js` | sai 0 |
| `node -p "…devDependencies['@playwright/test']"` | `1.62.1` (sem `^`, sem `~`) |
| `node -p "…devDependencies['playwright']"` | `1.62.1` |
| `grep -c "name: 'chromium'" playwright.config.ts` | 1 |
| `grep -c 'firefox\|webkit' playwright.config.ts` | 0 |
| `grep -c "serviceWorkers: 'block'" playwright.config.ts` | 0 |
| `grep -c 'webServer' playwright.config.ts` | 0 |
| `grep -c 'skipWaiting' …/old-build/sw.js` | 1 |
| `grep -c '__PRECACHE__' …/old-build/sw.js` | 0 |
| `grep -c 'href="/manifest.json"' …/old-build/index.html` | 1 |
| mutação da fixture | 3 casos falham nomeando o motivo; restaurada, 18/18 |
| mutação do `clearHttpCache` | sem ele, offline verde em 410 ms; com ele, vermelho |

### O relatório de RED, na íntegra do que importa

`install.spec.ts` (3 asserções soft):
- `controller` recebeu `"http://127.0.0.1:PORT/sw.js"`, esperava `null` (D2-09)
- nome do cache recebeu `"dungeonguys2-v1"`, esperava `/^dg2-[0-9a-f]{16}$/` (D2-10)
- precache: faltam `/assets/100_Anims_Order_List.txt`, `/assets/CREDITS.md`, `/fonts/OFL.txt`;
  sobra `/`

`offline.spec.ts` (2 asserções soft):
- clicar em START não tira `active` de `#start-screen` — pintou, não rodou
- falhas de rede da própria origem: `/assets/index-Dy3YcBin.css` e `/assets/index-CcdEJ3UK.js`,
  ambas `net::ERR_FAILED`

## Known Stubs

Nenhum stub. As duas specs vermelhas **não** são stubs: são asserções completas sobre o
comportamento alvo, e a vermelhidão é o resultado planejado do plano (P-1, reconciliação 3 da
fase). Elas viram verdes pelo plano 02-06, sem serem editadas.

## User Setup Required

Nenhum serviço externo. Numa máquina limpa, `npx playwright install chromium` é necessário uma
vez — no CI isso já é feito pelo passo que existe desde a fase 1, e o job `pwa` do plano 02-11
reaproveita o mesmo cache por versão exata do lock.

## Next Phase Readiness

- **02-06 (reescrita do `sw.js`):** o briefing está pronto e é executável. `npm run test:pwa` lista
  as cinco faltas. Ponto de atenção que este plano mediu: o precache alvo tem de incluir também
  `/assets/100_Anims_Order_List.txt`, `/assets/CREDITS.md` e `/fonts/OFL.txt` (o `dist/` inteiro
  menos `sw.js` são **13** caminhos), e **não** deve incluir `/` — a spec espera `/index.html` e o
  mapeamento de `/` feito no `fetch`, como o template da pesquisa faz.
- **02-09 (`update.spec.ts` e `api-isolation.spec.ts`):** `setRoot()` e `route()` já existem e não
  foram exercitados por nenhuma spec ainda — são para lá. **Chamem `clearHttpCache()`** antes de
  qualquer asserção offline, pelo motivo medido acima.
- **02-11 (job `pwa` no `ci.yml`):** `npm run test:pwa` depende de `npm run build` ter rodado antes
  (as specs servem `dist/`). O `ci.yml` hoje termina no build, então o passo novo vai depois dele.

Sem bloqueadores.

## Self-Check: PASSED

Arquivos declarados como criados — todos presentes: `playwright.config.ts`,
`tests/pwa/tsconfig.json`, `tests/pwa/helpers.ts`, `tests/pwa/install.spec.ts`,
`tests/pwa/offline.spec.ts`, `tests/pwa/fixtures/README.md`,
`tests/pwa/fixtures/old-build/sw.js`, `tests/pwa/fixtures/old-build/index.html`.

Commits declarados — todos presentes no histórico: `c318551`, `26f8897`, `03afe51`.

---
*Phase: 02-migra-o-para-a-vps*
*Completed: 2026-09-01*
