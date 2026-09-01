---
phase: 02-migra-o-para-a-vps
plan: 09
subsystem: testing
tags: [playwright, service-worker, pwa, cache-storage, github-actions, ci]

# Dependency graph
requires:
  - phase: 02-05
    provides: "runner de Playwright, tests/pwa/helpers.ts (serveDir/setRoot/route/waitForActivated/clearHttpCache/readCacheEntries) e a fixture old-build"
  - phase: 02-06
    provides: "public/sw.js derivado do build, com allowlist, nome de cache por hash e a guarda de res.ok; tools/sw/verify.mjs"
  - phase: 02-07
    provides: "o ciclo de update no cliente — #btn-update, showUpdateOffer, SKIP_WAITING e a guarda de controllerchange"
  - phase: 02-08
    provides: "a forma do corpo de GET /api/health, replicada pela rota simulada"
provides:
  - "tests/pwa/update.spec.ts — atualização in-place a partir de uma instalação antiga, terminando com exatamente um cache"
  - "tests/pwa/api-isolation.spec.ts — /api/ e /ws fora de todo cache da origem, e a guarda de res.ok provada nas duas direções"
  - "job `pwa` no ci.yml — as quatro specs a cada push, com cache de browser por versão exata do lock"
  - "correção em public/sw.js: o activate passa a alcançar o cache 'dungeonguys2-v1', anterior ao esquema de nome por hash"
  - "docs/PARIDADE.md com o alcance real da lacuna de PWA, e a caixa ainda aberta"
affects: [02-11, 03, 06]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Prova de não-vacuidade por remoção: cada spec nova foi vista falhar com a funcionalidade desligada antes de ser aceita"
    - "Chave de cache de browser no CI derivada da versão exata do lock MAIS o conjunto de motores instalado"
    - "Asserção sobre uma caixa de markdown, para que uma decisão registrada não vire cobertura imaginária"

key-files:
  created:
    - tests/pwa/update.spec.ts
    - tests/pwa/api-isolation.spec.ts
  modified:
    - tests/pwa/helpers.ts
    - public/sw.js
    - tests/build-base.test.ts
    - .github/workflows/ci.yml
    - docs/PARIDADE.md

key-decisions:
  - "O activate do service worker passou a alcançar o nome de cache anterior ao esquema por hash ('dungeonguys2-v1'): um filtro por prefixo não pode casar um nome escrito antes de o prefixo existir, e sem isso toda instalação anterior à reescrita carregaria um build morto para sempre"
  - "A identidade do worker que controla a página é medida por `controller === registration.active`, nunca por scriptURL: os dois workers vivem em /sw.js e a comparação de URL não poderia falhar"
  - "A chave de cache de browser do job `pwa` tem a mesma FORMA da do job `test`, com o conjunto de motores no sufixo — chave literalmente igual faria o job de 3 motores baixar 2 deles em toda execução"
  - "A caixa de PWA de docs/PARIDADE.md continua aberta e agora tem um teste que reprova quem a marcar"

patterns-established:
  - "Prova de não-vacuidade por remoção: desligar a funcionalidade, ver a spec vermelha, restaurar, ver verde — registrado no SUMMARY, não só afirmado"
  - "Varredura sobre TODOS os caches de caches.keys(), não só o corrente: um cache órfão de um worker antigo é exatamente onde ninguém olharia"
  - "Asserção negativa sobre escrita assíncrona precisa de espera explícita: o worker não faz await do cache.put, então 'não foi gravado' medido imediatamente passaria contra um worker que grava um milissegundo depois"

requirements-completed: [INFRA-02, INFRA-03]

# Metrics
duration: 22min
completed: 2026-09-01
---

# Phase 02 Plan 09: Specs de atualização e isolação de `/api/`, e o job `pwa` no CI

**As duas specs de Playwright que faltavam — atualização in-place a partir da instalação antiga, e `/api/` fora de todo cache com a guarda de `res.ok` provada nas duas direções — mais o job `pwa` que as roda a cada push; e a correção do `activate` que a primeira delas encontrou.**

## Performance

- **Duration:** ~22 min
- **Started:** 2026-09-01T00:29:00Z
- **Completed:** 2026-09-01T00:51:00Z
- **Tasks:** 3
- **Files modified:** 7 (2 criados, 5 modificados)

## Accomplishments

- **`tests/pwa/update.spec.ts`** encena o deploy de verdade: instala a partir de
  `tests/pwa/fixtures/old-build`, troca a raiz servida **sem fechar o servidor** (mesma origem,
  mesma porta — um servidor novo seria uma origem nova, e o experimento seria outro), assere que
  o worker novo instala e **fica esperando** sem tomar o controle (D2-09), clica em `#btn-update`
  e mede o estado de chegada: exatamente **um** cache, com nome `dg2-<16 hex>`, contendo o
  precache do build novo, e o jogo ainda iniciável depois disso.
- **Essa spec encontrou um defeito real de produção** e o fez falhar antes de qualquer conserto:
  o `activate` filtrava por `startsWith('dg2-')`, que **não casa** `dungeonguys2-v1`. Toda
  instalação feita antes da reescrita carregaria um build inteiro morto em Cache Storage para
  sempre — exatamente T-2-STALECACHE, na única atualização em que a limpeza mais importa.
- **`tests/pwa/api-isolation.spec.ts`** cobre as duas metades de INFRA-03 e nenhuma delas pode
  ficar verde sem fazer o que diz: cinco chamadas a `/api/health` mais uma a `/ws` **voltam 200**
  (a requisição passa, ela só não é guardada) e o retrato de **todos** os caches sai idêntico ao
  de antes; e com o precache de `/manifest.json` apagado, um 502 não reaparece no cache e a 200
  seguinte reaparece.
- **Job `pwa` no `ci.yml`**, independente do `test`, com `npm run build` → portão do worker →
  as quatro specs. Só Chromium, porque o Playwright suporta service worker apenas nesse motor.
- **`docs/PARIDADE.md`** passou a dizer o que de fato é coberto, com a caixa ainda `- [ ]` — e
  `tests/build-base.test.ts` agora reprova quem a marcar.

## Task Commits

1. **Task 1: `update.spec.ts` — do build antigo ao novo, com um cache no fim** — `d01a22e` (test)
2. **Task 2: `api-isolation.spec.ts` — `/api/` fora do cache, e não-`ok` nunca gravado** — `dd06e72` (test)
3. **Task 3: O job `pwa` no CI, e o texto de `docs/PARIDADE.md` sem marcar a caixa** — `e054d16` (ci)

## Files Created/Modified

- `tests/pwa/update.spec.ts` *(novo)* — a atualização in-place, da instalação antiga ao estado
  de chegada com um cache só.
- `tests/pwa/api-isolation.spec.ts` *(novo)* — `/api/` e `/ws` fora de todo cache; `res.ok`
  provado nas duas direções.
- `tests/pwa/helpers.ts` — `distPathnames()` promovido a instrumento compartilhado, para a spec
  nova comparar o cache final contra o `dist/` de verdade em vez de contra uma lista escrita à mão.
- `public/sw.js` — `LEGACY_CACHE = 'dungeonguys2-v1'` e o `activate` alcançando-o. Uma lista
  fechada de um nome, não um alargamento: `dungeonguys-v3`, do jogo irmão, continua de fora.
- `tests/build-base.test.ts` — duas guardas novas: a limpeza do nome antigo não pode sumir, e a
  caixa de PWA de `docs/PARIDADE.md` não pode ser marcada.
- `.github/workflows/ci.yml` — o job `pwa`.
- `docs/PARIDADE.md` — o texto da linha do PWA, com o alcance medido da lacuna.

## Decisions Made

1. **Identidade, não `scriptURL`, para saber quem controla a página.** O plano pedia assertar
   que `navigator.serviceWorker.controller.scriptURL` ainda correspondia ao worker antigo. Os
   dois workers vivem em `/sw.js`, então essa comparação é entre duas strings idênticas e **não
   poderia falhar**. A spec usa `controller === registration.active` e
   `controller !== registration.waiting`, dentro de um único `page.evaluate` para que a
   identidade de objeto sobreviva. Está comentado no arquivo.

2. **Chave de cache de browser com o conjunto de motores no sufixo.** O plano pedia "o mesmo par
   de passos" e o critério de aceitação pedia chave "idêntica em **forma**". Chave literalmente
   igual entre um job de 3 motores e um de 1 é uma armadilha silenciosa: `actions/cache` não
   regrava uma chave já ocupada, então se o job `pwa` terminasse primeiro, o `test` restauraria
   um cache só com Chromium e baixaria Firefox e WebKit em toda execução dali em diante. A chave
   nova é `...-<versão>-chromium`; a do job `test` não foi tocada.

3. **Uma espera explícita antes de assertar "não foi gravado".** O worker não faz `await` do
   `cache.put`. Sem a pausa, a metade do 502 passaria também contra um worker que gravasse a
   resposta um milissegundo depois — que é o bug que ela existe para pegar. O lado positivo usa
   `expect.poll`, pelo mesmo motivo na direção oposta.

## Provas de não-vacuidade executadas

Cada uma foi rodada de verdade, vista vermelha, e restaurada:

| Prova | Como | Resultado |
|---|---|---|
| `update.spec.ts` mede a UI de D2-09 | `showUpdateOffer` desligado em `src/main.ts`, rebuild | ✗ falhou em `#btn-update` visível (`resolved to <button ... class="... hidden">`); restaurado → ✓ |
| `api-isolation.spec.ts` mede `res.ok` | condição `if (res.ok)` removida de `public/sw.js`, rebuild | ✗ falhou em "uma resposta não-ok não pode virar conteúdo permanente"; restaurado → ✓ |
| a caixa de PARIDADE é mesmo guardada | `- [ ]` trocado por `- [x]` na linha 234 | ✗ falhou em "a caixa do PWA continua desmarcada"; restaurado → ✓ |
| o `activate` não alcançava o cache antigo | nenhuma — a spec **nasceu vermelha** por esse motivo | ✗ `["dg2-63818d8fcd3ac13e", "dungeonguys2-v1"]`; consertado → ✓ |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] O `activate` do service worker não alcançava o cache anterior ao esquema de nome por hash**

- **Found during:** Task 1 (`update.spec.ts`)
- **Issue:** O filtro de limpeza é `k.startsWith('dg2-')`, e o único nome que a versão anterior
  do jogo usou é `dungeonguys2-v1` — escrito antes de o prefixo existir, e portanto fora do
  alcance do filtro. Consequência em produção: **toda instalação anterior à reescrita mantém um
  build inteiro em Cache Storage para sempre**, e a atualização em que a limpeza mais importa é
  justamente a que não limpa nada. É T-2-STALECACHE, que o registro de ameaças deste plano manda
  mitigar, e o critério de aceitação exigia literalmente "comprimento exatamente 1" e "ausência
  de `dungeonguys2-v1`" — a spec estava certa e o worker estava errado.
- **Fix:** `const LEGACY_CACHE = 'dungeonguys2-v1';` e o predicado do `activate` passou a ser
  `k.startsWith('dg2-') || k === LEGACY_CACHE`. **Uma lista fechada de um nome, não um
  alargamento do filtro:** o nome é nosso, só o DungeonGuys2 o usou, e o `dungeonguys-v3` do
  jogo irmão continua deliberadamente de fora (DM-3/P-11). O comentário no arquivo diz que nada
  novo entra nessa lista, porque todo nome de D2-10 em diante carrega o prefixo por construção.
- **Files modified:** `public/sw.js`, `tests/build-base.test.ts` (guarda para que a correção não
  seja removida em silêncio)
- **Verification:** `npx playwright test tests/pwa/update.spec.ts` passou de ✗ para ✓;
  `npm run sw:verify` verde; as asserções estruturais existentes continuam valendo — ainda **um**
  `startsWith('dg2-')` e **um** `caches.delete` no arquivo (o alcance aumentou, a superfície não).
- **Committed in:** `d01a22e` (commit da Task 1)

**2. [Rule 3 - Escopo] `public/sw.js` está fora do conjunto de arquivos declarado pelo plano**

- **Found during:** Task 1
- **Issue:** O plano lista seis arquivos e `public/sw.js` não é um deles. A instrução de execução
  paralela manda tratar qualquer mudança fora do conjunto como desvio e reportá-la.
- **Fix:** A mudança foi feita, porque sem ela três coisas do próprio plano ficariam falsas ao
  mesmo tempo — o `must_have` "depois dela sobra exatamente um cache", o critério de aceitação da
  Task 1, e a mitigação de T-2-STALECACHE no registro de ameaças. A alternativa seria enfraquecer
  a spec para caber no defeito. **Sem conflito com o plano 02-10**, que é dono de `ops/`,
  `tools/ops/restore-verify.mjs` e `tests/ops-config.test.ts`; nenhum desses foi tocado.
- **Files modified:** `public/sw.js`
- **Verification:** `npm test` (468/468), `npm run lint`, `npm run sw:verify`, `npm run test:pwa`
  (6/6) — todos verdes.
- **Committed in:** `d01a22e`

**3. [Rule 3 - Blocking] `distPathnames()` promovido a `tests/pwa/helpers.ts`**

- **Found during:** Task 1
- **Issue:** A asserção final da spec compara o cache que sobrou contra o `dist/` de verdade, e a
  varredura recursiva só existia como função local de `install.spec.ts` — que **não** está no
  conjunto de arquivos deste plano.
- **Fix:** A varredura foi para `tests/pwa/helpers.ts`, que está no conjunto, com o comentário que
  explica por que ela é uma varredura de verdade e nunca uma lista escrita à mão (a lista escrita
  à mão *é* o defeito documentado pelo worker antigo). `install.spec.ts` **não foi tocado** e
  mantém sua cópia; unificar as duas é uma linha para quem mexer nos dois arquivos juntos.
- **Files modified:** `tests/pwa/helpers.ts`
- **Verification:** `npm run typecheck:pwa` e `npm run lint` verdes; as duas specs de instalação
  continuam passando.
- **Committed in:** `d01a22e`

**4. [Rule 2 - Missing Critical] `clearHttpCache()` nas duas specs novas**

- **Found during:** Tasks 1 e 2
- **Issue:** O plano não pedia `clearHttpCache` em nenhuma das duas. O contexto da wave anterior
  avisa que o mesmo falso-verde medido em 02-05 alcança as duas: o servidor de fixture manda
  `Cache-Control: public, max-age=31536000` nos hasheados, e em `api-isolation` a metade do 502 é
  **estruturalmente** dependente disso — com uma cópia no cache HTTP o `fetch` de dentro do worker
  nunca chega ao 502 e a metade inteira passaria contra qualquer worker.
- **Fix:** `clearHttpCache(page)` depois do `setRoot('dist')` em `update.spec.ts` (para o build
  novo chegar mesmo ao browser) e antes da rede ser consultada em `api-isolation.spec.ts`. As
  respostas 502 simuladas saem com `no-store`, para que a falha também não possa responder pela
  recuperação. Ambos comentados no lugar.
- **Files modified:** `tests/pwa/update.spec.ts`, `tests/pwa/api-isolation.spec.ts`
- **Verification:** as duas specs verdes; a de `res.ok` comprovadamente vermelha com a
  funcionalidade desligada, o que só é possível porque a rede é de fato consultada.
- **Committed in:** `d01a22e`, `dd06e72`

**5. [Rule 1 - Bug de teste] Asserção de controlador por identidade, não por `scriptURL`**

- **Found during:** Task 1
- **Issue:** O plano pedia `controller.scriptURL` correspondendo ao worker antigo. Os dois
  workers vivem em `/sw.js`; a asserção compararia duas strings idênticas e não poderia falhar.
- **Fix:** `controller === registration.active` e `controller !== registration.waiting`, num
  único `page.evaluate` para preservar identidade de objeto, mais a coexistência dos **dois**
  caches no estado intermediário como testemunha comportamental de que o `activate` novo ainda
  não rodou. O motivo está comentado no arquivo.
- **Files modified:** `tests/pwa/update.spec.ts`
- **Verification:** a spec falha com a oferta desligada e passa com ela — o caminho medido é o
  real.
- **Committed in:** `d01a22e`

**6. [Rule 2 - Missing Critical] Sufixo de motores na chave de cache do CI**

- **Found during:** Task 3
- **Issue:** O plano pedia "o **mesmo** par de passos" do job `test`. Chave literalmente idêntica
  entre um job de 3 motores e um de 1 degrada silenciosamente: `actions/cache` não regrava chave
  ocupada, então se o `pwa` gravasse primeiro, o `test` baixaria Firefox e WebKit em toda execução
  até a versão do Playwright mudar.
- **Fix:** Mesma **forma** (o critério de aceitação pede "idêntica em forma"), com `-chromium` no
  fim. O passo `id: playwright-version` é idêntico ao do job `test`. A chave do job `test` não foi
  tocada.
- **Files modified:** `.github/workflows/ci.yml`
- **Verification:** `npx vitest run tests/workflows.test.ts` verde (segue um só workflow, sem
  padrão de Pages); os três `grep` do critério de aceitação retornam 1, 1 e 1.
- **Committed in:** `e054d16`

---

**Total deviations:** 6 auto-corrigidos (2 bugs, 3 funcionalidade crítica ausente, 1 de escopo)
**Impact on plan:** Nenhum aumento de escopo. Cinco dos seis são consequência direta de o plano
ter sido escrito antes de as specs existirem; o primeiro é um defeito de produção que as specs
existem para encontrar, e encontraram. O único desvio de arquivo fora do conjunto declarado
(`public/sw.js`) não colide com o plano 02-10.

## Issues Encountered

- **`caches.keys()` inclui o cache do worker antigo, e o `activate` novo não o alcançava.**
  Resolvido corrigindo o worker, não a spec — ver desvio 1. Foi a única falha real da execução;
  todo o resto do caminho de atualização (instalação da fixture, troca de raiz, install do worker
  novo, espera, oferta, clique, `SKIP_WAITING`, `controllerchange`, reload) funcionou de primeira.
- **Detectar o reload disparado por `controllerchange`.** Resolvido com um marcador em `window`
  antes do clique mais `page.waitForFunction(() => !('__beforeUpdate' in window))` e
  `waitForLoadState('load')` — `waitForURL` não serve, porque um reload não muda a URL.
- Nenhum problema de ambiente. `npm ci` a partir do lockfile, sem tocar em
  `package.json`/`package-lock.json`.

## Known Stubs

Nenhum. As duas specs exercitam código real, e nenhum caminho novo foi deixado com valor de
marcador.

## Threat Flags

Nenhuma superfície de segurança nova. As mudanças são de teste, de CI e de documentação, mais a
correção do `activate` — que **reduz** superfície (dado do build anterior deixa de sobreviver
indefinidamente no aparelho) sem alargar o filtro de exclusão do jogo irmão.

## Verificação final

| Portão | Resultado |
|---|---|
| `npm test` | ✓ 468/468 em 42 arquivos |
| `npm run build` | ✓ |
| `npm run sw:verify` | ✓ `dg2-63818d8fcd3ac13e`, 13 caminhos batendo com o `dist/` |
| `npm run test:pwa` | ✓ 6 testes em 4 specs |
| `npx vitest run tests/build-base.test.ts` | ✓ 29 |
| `npx vitest run tests/workflows.test.ts` | ✓ 2 — um workflow só, sem padrão de Pages |
| `npm run lint` | ✓ |
| `npm run typecheck:pwa` | ✓ |
| `grep -c 'test:pwa' .github/workflows/ci.yml` | 1 |
| `grep -c 'sw:verify' .github/workflows/ci.yml` | 1 |
| `grep -c 'playwright install --with-deps chromium$'` | 1 |
| `grep -c 'PWA instalável e funcional offline' docs/PARIDADE.md` | 1, e a linha começa com `- [ ]` |
| `grep -c 'Chromium' docs/PARIDADE.md` | 1 |

## User Setup Required

Nenhum. Não há repositório no GitHub nem remoto configurado, então o job `pwa` **nunca foi
executado remotamente** — ele foi validado rodando localmente a mesma sequência de comandos que
declara (`npm ci` → `npm run build` → portão do worker → as quatro specs). Nada de
`git remote add`, `git push` ou `gh repo create` foi feito.

## Next Phase Readiness

- Os critérios de sucesso 2 e 3 da fase estão cobertos por comando, e a cobertura roda a cada push.
- **Para o plano 02-11:** o job `deploy` deve declarar `needs: [test, pwa]` — está registrado em
  comentário no `ci.yml`.
- **Para o verificador da fase:** a caixa de PWA de `docs/PARIDADE.md` continua aberta **por
  decisão registrada (D2-11)** e **não** é pendência da fase. Há um teste que reprova quem a
  marcar. O alcance da lacuna é maior do que "iOS/Safari físico": o Playwright suporta service
  worker apenas em Chromium, então Firefox e WebKit também ficam sem cobertura, mesmo no CI.
- **Para a fase 3:** o `/ws` já é exercitado por `api-isolation.spec.ts` e já está provado fora
  do cache antes de existir. `src/main.ts` marca o ponto exato onde a guarda `&& !inRoom` entra.
- **Para a fase 6:** a varredura de `/api/` sobre **todos** os caches é o que segura T-2-CACHE
  quando as respostas passarem a carregar sessão.

## Self-Check: PASSED

Arquivos declarados, conferidos em disco: `tests/pwa/update.spec.ts`,
`tests/pwa/api-isolation.spec.ts`, `tests/pwa/helpers.ts`, `public/sw.js`,
`tests/build-base.test.ts`, `.github/workflows/ci.yml`, `docs/PARIDADE.md`,
`.planning/phases/02-migra-o-para-a-vps/02-09-SUMMARY.md` — todos presentes.

Commits declarados, conferidos em `git log`: `d01a22e`, `dd06e72`, `e054d16` — todos presentes,
mais `6262fe1` com este documento. Árvore de trabalho limpa.

Nenhum arquivo do plano paralelo 02-10 (`ops/`, `tools/ops/restore-verify.mjs`,
`tests/ops-config.test.ts`) aparece em nenhum dos quatro commits. `STATE.md` e `ROADMAP.md` não
foram tocados — são do orquestrador.

---
*Phase: 02-migra-o-para-a-vps*
*Completed: 2026-09-01*
