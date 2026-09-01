---
phase: 02-migra-o-para-a-vps
plan: 06
subsystem: infra
tags: [pwa, service-worker, precache, allowlist, build-step, cache-storage, infra-03]

# Dependency graph
requires:
  - phase: 02
    plan: 02
    provides: "`base: '/'`, os href root-absolutos e as duas famílias de fonte na própria origem — é o que faz o precache derivado ser uma lista de caminhos de raiz e o offline não ter terceiro nenhum no caminho"
  - phase: 02
    plan: 05
    provides: "o instrumento de medida: `install.spec.ts` e `offline.spec.ts` escritas contra o comportamento alvo e commitadas VERMELHAS, mais `clearHttpCache()`, sem o qual o offline passava sem o worker participar"
provides:
  - "`public/sw.js` como template com duas sentinelas: allowlist derivado do build, sem troca de versão automática, sem tomar páginas alheias, sem gravar resposta não-ok"
  - "`tools/sw/emit.mjs`: varre o `dist/`, deriva `dg2-<16 hex>` e a lista de precache, e reescreve `dist/sw.js`"
  - "`tools/sw/verify.mjs`: portão de quatro propriedades — sentinela sobrevivente, precache divergente, forma do nome do cache e o subcaminho do Pages no artefato (metade de artefato de INFRA-01)"
  - "`npm run sw:emit` no fim da cadeia de `build`, e `npm run sw:verify` como passo próprio"
  - "o handler de `message` que aceita `SKIP_WAITING` — a ponta do servidor do ciclo de update que o plano 02-07 liga na UI"
affects: [02-07 aviso de update na UI (o SKIP_WAITING já está do lado do worker), 02-09 api-isolation.spec e o passo sw:verify no CI, 02-11 job pwa]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "template com sentinela reescrito por script pós-build, em vez de `define()` (impossível: o Vite copia `public/` verbatim) ou plugin (enterra a lógica fora de `npm run <script>`)"
    - "allowlist derivado do artefato em vez de denylist por prefixo — a regra passa de \"lembre-se de excluir\" para \"só o que o build produziu entra\""
    - "verificador com varredura INDEPENDENTE do emissor: nada de importar o `walk()` de lá, ou os dois concordariam por construção"
    - "asserção sobre código com `tests/scan.ts` aplicado antes, quando o cabeçalho do arquivo discute a própria regra em prosa"
key-files:
  created:
    - tools/sw/emit.mjs
    - tools/sw/verify.mjs
  modified:
    - public/sw.js
    - tests/build-base.test.ts
    - package.json

key-decisions:
  - "INFRA-02 e INFRA-03 continuam `Pending` em REQUIREMENTS.md, apesar de o frontmatter do plano os declarar: os planos 02-09 e 02-12 ainda os carregam, e o precedente é o do 02-05 — não assinar embaixo de um requisito que outro plano ainda precisa completar"
  - "as menções em prosa a `skipWaiting` e a tomar controle de páginas alheias ficam em comentários de coluna zero no `sw.js`, porque os critérios de aceitação filtram com `grep -v '^//'` e um comentário indentado contaria como código"
  - "o teste usa `scan(src, true)` e não o `scan(scan(src, true), false)` de `purity.test.ts`: aqui as strings são o objeto da asserção — a sentinela mora dentro de `'dg2-__BUILD_HASH__'` e a guarda dentro de `startsWith('dg2-')`"
  - "o hash cobre CAMINHO e bytes de cada arquivo, não só os bytes: hashear só o conteúdo deixaria um rename invisível, e asset renomeado é entrada de precache que dá 404"
  - "substituição por `split/join` e não por `String.replace`: `$&` e afins são especiais numa string de substituição, e a lista de precache é conteúdo derivado de nome de arquivo"
  - "as recusas do `verify.mjs` apontam o arquivo ofensor (`dist/sw.js:/PRECACHE: ...`), como manda `tools/README.md` §3 e como faz `sim-version/verify.mjs`; só o envelope final usa o nome do próprio verificador"

patterns-established:
  - "Regra de exclusão total e sem exceções (`tudo em dist/ menos dist/sw.js`) escrita como propriedade no cabeçalho, para que a próxima pessoa não a \"conserte\" e torne o build irreprodutível"
  - "Prova de recusa executada e registrada para cada portão novo, nos dois sentidos da divergência"

requirements-completed: []

# Metrics
duration: 22min
completed: 2026-09-01
---

# Phase 2 Plan 06: O service worker que não pode esquecer

**A lista de precache deixou de ser escrita à mão e passou a ser o `dist/`; o nome do cache
deixou de ser literal e passou a ser o hash do build; e as duas specs que o plano 02-05
entregou vermelhas ficaram verdes sem uma linha delas ter sido tocada.**

## Performance

- **Duration:** ~22 min
- **Started:** 2026-09-01T02:37Z
- **Completed:** 2026-09-01T02:59Z
- **Tasks:** 3
- **Files:** 2 criados, 3 modificados

## Accomplishments

- **O critério 2 do PWA virou comando verde.** `npx playwright test` sai **0**, 3/3, quando
  entrava neste plano saindo 1. As cinco faltas que o relatório de RED do 02-05 nomeava foram
  todas fechadas: `controller` nulo no primeiro carregamento, cache `dg2-eed6d644b928dd75` em
  vez de `dungeonguys2-v1`, precache com os **13** caminhos do `dist/` (e sem `/`), a tela
  respondendo ao clique em START com o servidor derrubado, e **zero** falha de rede da própria
  origem.
- **Os dois arquivos que ninguém conseguia precachear entraram.** `/assets/index-CcdEJ3UK.js`
  (96 KB) e `/assets/index-Dy3YcBin.css` (29 KB) têm nome hasheado a cada build — eram
  exatamente os que morriam em `net::ERR_FAILED` offline. E `/fonts/OFL.txt`,
  `/assets/CREDITS.md` e `/assets/100_Anims_Order_List.txt` entraram **sem uma linha de código
  a mais**, porque a regra de exclusão é total.
- **A regra do cache inverteu.** De "lembre-se de excluir `/api/`" para "só o pathname que o
  build emitiu é respondido do cache". A fase 3 traz `/ws`, a 6 traz `/api/auth/*`, a 9 traz
  `/api/leaderboard` — nenhuma delas pode ser esquecida agora, porque o allowlist não as
  conhece. O early-return explícito dos dois ficou junto, como o plano pede, e é asserido.
- **Esquecer o passo de build passou a reprovar o build.** Provado nos dois sentidos:
  `cp public/sw.js dist/sw.js` reprova nomeando `__BUILD_HASH__`; remover `dist/fonts/OFL.txt`
  reprova nomeando o caminho que sobrou na lista; criar um arquivo a mais reprova nomeando o
  que faltou. Depois de cada prova, `npm run build && npm run sw:verify` volta a sair 0.
- **O `activate` deixou de ser um apaga-tudo.** O bloco antigo era byte a byte o mesmo do
  `sw.js` vivo do DungeonGuys original; como Cache Storage é por **origem**, mantê-lo era
  manter a forma que sabota o jogo irmão. Agora o filtro é `startsWith('dg2-')`, e o teste
  assere que existe **um só** `caches.delete` no arquivo.

## Task Commits

1. **Task 1: `public/sw.js` vira template com sentinelas, allowlist e sem troca automática** —
   `ab9bcc1` (feat)
2. **Task 2: `tools/sw/emit.mjs` deriva o precache e o nome do cache do `dist/`** — `6fc3dc4` (feat)
3. **Task 3: `tools/sw/verify.mjs`, o portão** — `12a1385` (feat)

## Files Created/Modified

- `public/sw.js` — reescrito inteiro (60 linhas fora, 105 dentro). Os cinco defeitos da tabela
  do `02-PATTERNS.md` mortos de uma vez: `CACHE` literal → `'dg2-__BUILD_HASH__'`; `PRECACHE`
  à mão com caminhos **relativos** → `__PRECACHE__`; troca incondicional no `install` → nada,
  e a troca só pelo handler de `message`; `caches.keys()` apaga-tudo mais tomada de controle →
  filtro por prefixo e nada mais; network-first com `cache.put` cego → allowlist mais
  `if (res.ok)`. Cabeçalho com as três afirmações que o plano pede, em coluna zero
- `tools/sw/emit.mjs` — 161 linhas. Varredura recursiva do `dist/` com caminhos absolutos de
  raiz e barra normal (o separador do `node:path` não pode vazar numa URL no Windows), lista
  ordenada, `sha256` sobre caminho e bytes, 16 hex, substituição das duas sentinelas, quatro
  recusas com ponteiro e uma linha em stdout
- `tools/sw/verify.mjs` — 206 linhas. Quatro propriedades, varredura própria, envelope
  `try/catch` no fim, uma linha em stdout no sucesso
- `tests/build-base.test.ts` — `describe('template do service worker')` com 7 casos (18 → 25).
  Um glob raw novo para `public/sw.js`, o filtro de comentários, e a guarda anti-vacuidade por
  **comprimento** (a lição do 02-02), aplicada tanto ao arquivo quanto ao código filtrado
- `package.json` — `sw:emit` no fim da cadeia de `build`, `sw:verify` como script próprio e
  **fora** do `build`

## Decisions Made

- **INFRA-02 e INFRA-03 continuam `Pending`.** O frontmatter do plano os declara, mas
  `02-09-PLAN.md` carrega os dois e `02-12-PLAN.md` carrega INFRA-02 — o `api-isolation.spec.ts`
  que prova a metade `/api/` de INFRA-03 é do 02-09, e "servido da VPS" de INFRA-02 depende do
  deploy. É o mesmo julgamento que o 02-05 fez ao recusar marcar INFRA-02 com a medida dizendo
  NÃO; aqui a medida diz SIM para o que existe, mas ainda falta plano com o mesmo requisito.
  `REQUIREMENTS.md` fica intocado.
- **Onde a prosa sobre a regra pode aparecer.** Três critérios de aceitação filtram o arquivo
  com `grep -v '^//'`, que só remove comentário de **coluna zero**. Um `// NO skipWaiting()`
  indentado dentro do `install` — que é como o template da pesquisa escreve — faria
  `grep -c 'skipWaiting'` retornar 2 e reprovaria o critério. Resolvido movendo as duas
  menções para o cabeçalho e deixando nos handlers um "nada mais pertence aqui — D2-09, ver o
  cabeçalho". O conteúdo continua todo lá.
- **`scan(src, true)`, não a forma dupla do `purity.test.ts`.** Lá as strings são ruído e são
  apagadas; aqui elas são o objeto: `__BUILD_HASH__` mora dentro de `'dg2-__BUILD_HASH__'` e a
  guarda do `activate` dentro de `startsWith('dg2-')`. `scan(scan(src, true), false)` apagaria
  as duas coisas que o teste existe para conferir. O motivo está escrito no arquivo.
- **O hash cobre caminho e bytes.** Hashear só os bytes deixaria um rename puro invisível — e
  um asset renomeado é uma entrada de precache que dá 404, que é o modo de falha que este
  plano inteiro existe para matar.
- **`split/join` em vez de `String.replace`.** `$&`, `$1` e `$'` são especiais na string de
  substituição do `replace`. O digest é hexadecimal e nunca teria o problema, mas a lista de
  precache é derivada de nomes de arquivo, e o dia em que um asset chegar com `$` no nome não
  é o dia de descobrir isso.
- **Prefixo das recusas do `verify.mjs`.** O plano escreve o contrato como
  `tools/sw/verify.mjs:<ponteiro>: <mensagem>`; ficou `dist/sw.js:/PRECACHE: ...`, apontando o
  arquivo **ofensor**, que é o que `tools/README.md` §3 define ("o `ponteiro` é o que localiza
  o erro dentro do arquivo", com exemplo `assets/manifest.json:/sprites/...`) e o que
  `sim-version/verify.mjs` faz. O nome do verificador aparece no envelope final, para exceção
  que escape. O formato é o mesmo; muda só qual arquivo é nomeado, e a versão adotada é a
  acionável.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] o worktree veio sem `node_modules`**

- **Found during:** antes da Task 1
- **Issue:** nenhum comando de build, teste ou lint rodava.
- **Fix:** `npm ci` a partir do lock, sem instalar nem alterar pacote nenhum. `package.json` e
  `package-lock.json` não mudaram por causa disto (a única alteração de `package.json` neste
  plano são as duas linhas de `scripts`).
- **Verification:** `npm ci` → 307 pacotes, 0 vulnerabilidades; `npm test` verde em seguida.
- **Commit:** nenhum — não produziu diff.

Nenhum outro desvio. O plano descreve os três arquivos com precisão suficiente para que a
implementação seja a leitura dele; as duas escolhas que exigiram julgamento (a coluna dos
comentários e a forma do `scan`) estão em Decisions Made porque mudam o arquivo, não o plano.

---

**Total deviations:** 1 auto-fix (regra 3), sem impacto em arquivo de fonte.
**Impact on plan:** nenhum arquivo fora dos cinco previstos. Nenhuma spec do 02-05 tocada —
`git status` confirma que só `public/sw.js`, `tests/build-base.test.ts`, `package.json` e os
dois `tools/sw/*.mjs` entraram nos commits.

## Issues Encountered

- **O git desta máquina converte LF para CRLF ao tocar os arquivos novos** (aviso em cada
  `git add`). Não afeta nada aqui — o digest é calculado sobre os bytes do `dist/` na máquina
  que constrói, e o `SIM_VERSION` já convive com a mesma propriedade —, mas vale registrar
  para quem for comparar um `dg2-<hash>` gerado no Windows com um gerado no CI (Linux):
  **eles não vão bater**, e isso é esperado. O que o `verify.mjs` confere é a **forma** do
  nome e a coerência da lista, nunca um valor fixado.
- **Rodar `npm run sw:emit` duas vezes sobre o mesmo `dist/` falha de propósito**, com
  `dist/sw.js:/CACHE: sentinela __BUILD_HASH__ não encontrada — o template regrediu, ou o
  script já rodou sobre este dist/`. É o comportamento certo (a segunda passada não teria o
  que substituir e produziria um artefato mentiroso), mas é o tipo de mensagem que assusta
  quem chamou o script à mão depois de um build completo.

## Threat Model

Os sete itens do registro do plano, conferidos:

- **T-2-CACHE** (Information Disclosure, `/api/*` no Cache Storage) — **mitigado.** O
  `respondWith` só acontece quando o pathname está em `PRECACHE_SET`, e esse conjunto é a
  varredura do `dist/`. O early-return de `/api/` e `/ws` ficou junto como documentação, e os
  três são asseridos por `tests/build-base.test.ts`. A prova executável com `/api/` de verdade
  é do plano 02-09.
- **T-2-STALE** (Tampering, resposta não-ok cacheada) — **mitigado.** `if (res.ok)` antes do
  `cache.put`, asserido no teste.
- **T-2-XORIGIN** (DoS, apagar o cache do jogo irmão) — **mitigado.** `startsWith('dg2-')`
  antes do `delete`, e o teste assere que existe exatamente **um** `caches.delete` no arquivo
  — um segundo, sem filtro, é o modo de falha que a contagem pega.
- **T-2-STALEPRE** (Tampering, precache alimentado pelo build anterior) — **mitigado.**
  `new Request(url, { cache: 'reload' })` em cada URL do `addAll`; a outra metade (o
  `Cache-Control: no-cache` do `@shell`) já veio do plano 02-03.
- **T-2-SYNC** (DoS, troca de versão sob os pés do jogador) — **mitigado.** Nenhuma troca
  automática e nenhuma tomada de página alheia; a única ocorrência de `skipWaiting` está
  depois do registro do listener de `message`, e o teste assere essa ordem. O gate de "fora de
  partida" é do plano 02-07.
- **T-2-SILENT** (Tampering, esquecer o passo de build) — **mitigado e provado nos dois
  sentidos**, com as recusas registradas na tabela de verificação abaixo.
- **T-2-SC** (cadeia de suprimentos) — **aceito, e a premissa se manteve.** Nenhum pacote
  instalado; os dois scripts usam só `node:crypto`, `node:fs`, `node:path` e `node:url`.
  `dependencies` da raiz continua `{}`.

Nenhuma superfície nova de rede, autenticação ou esquema. Sem `threat_flag`.

## Verification

| Portão | Resultado |
|---|---|
| `node --check public/sw.js` | sai 0 |
| `grep -c '__BUILD_HASH__' public/sw.js` / `__PRECACHE__` | 1 / 1 |
| `grep -v '^//' public/sw.js \| grep -c 'clients.claim'` | **0** |
| `grep -v '^//' public/sw.js \| grep -c 'skipWaiting'` | **1** |
| `grep -v '^//' public/sw.js \| grep -c "startsWith('dg2-')"` | **1** |
| `grep -v '^//' public/sw.js \| grep -c 'res.ok'` | 1 |
| `cmp tests/pwa/fixtures/old-build/sw.js public/sw.js` | sai **1** (a fixture não foi tocada) |
| `npm run build` | sai 0, com `sw precache: 13 arquivos, cache dg2-eed6d644b928dd75` |
| `node --check dist/sw.js` | sai 0 |
| sentinelas em `dist/sw.js` | 0 e 0 |
| `grep -c "const CACHE = 'dg2-" dist/sw.js` | 1, com 16 hex |
| `grep -c '/assets/index-' dist/sw.js` | 1 (a linha da lista, com os dois arquivos hasheados) |
| `grep -c '"/sw.js"' dist/sw.js` | **0** |
| `grep -c '/fonts/' dist/sw.js` | 1 (a linha da lista, com os três arquivos de `/fonts/`) |
| `cmp public/sw.js dist/sw.js` | sai 1 |
| Reprodutibilidade | dois builds seguidos: `dg2-eed6d644b928dd75` nas duas vezes |
| Sensibilidade | um `\n` no fim de `public/assets/CREDITS.md` → `dg2-89d9b7f950b35d3a`; restaurado → `dg2-eed6d644b928dd75` |
| `npm run sw:emit` duas vezes | a segunda sai 1, nomeando a sentinela |
| `npm run build && npm run sw:verify` | sai 0, uma linha |
| **Recusa 1** — `cp public/sw.js dist/sw.js` | sai **1**: `a sentinela __BUILD_HASH__ sobreviveu ao build — falta npm run sw:emit...` |
| **Recusa 2** — `rm dist/fonts/OFL.txt` | sai **1**: `sobrou na lista sem existir no dist/: /fonts/OFL.txt` |
| **Recusa 3** (extra) — arquivo a mais no `dist/` | sai **1**: `faltou na lista mas existe no dist/: /assets/probe.txt` |
| Depois de cada recusa, `npm run build && npm run sw:verify` | volta a sair 0 |
| **`npx playwright test install.spec.ts offline.spec.ts`** | **3 passed** (entrou no plano com 2 falhas) |
| `npm test` | 38 arquivos, **441** testes verdes (eram 434) |
| `npm run lint` | sai 0 |
| `npx tsc --noEmit` | sai 0 |
| `npm run typecheck:pwa` | sai 0 |
| `git status --short` depois do último commit | limpo |

### A transição, em uma linha

O relatório de RED do 02-05 listava cinco faltas. Depois deste plano: `controller` nulo no
primeiro carregamento ✓, cache `dg2-eed6d644b928dd75` na forma esperada ✓, precache com os 13
caminhos e sem `/` ✓, clique em START tirando `active` de `#start-screen` offline ✓, e a lista
de falhas de rede da própria origem vazia ✓.

## Known Stubs

Nenhum. O único caminho que existe sem consumidor é o handler de `message` que aceita
`SKIP_WAITING` — e ele **não** é stub: é a metade do worker de um protocolo de duas pontas,
implementada por inteiro e funcional. Quem posta a mensagem é a página, no plano 02-07, e essa
divisão é a que o D2-09 pede.

## User Setup Required

Nenhuma. Nenhum serviço externo, nenhuma variável de ambiente, nenhum pacote novo.

## Next Phase Readiness

- **02-07 (aviso de update na UI):** a ponta do worker está pronta e é a única que existe hoje.
  A página precisa detectar `registration.waiting`, mostrar o aviso, e postar
  `{ type: 'SKIP_WAITING' }` **fora de partida**. O nome exato da mensagem está no
  `public/sw.js` e é asserido por `tests/build-base.test.ts` — mudá-lo de um lado só reprova a
  suíte, que é o comportamento desejado.
- **02-09 (`api-isolation.spec.ts` e o passo de CI):** `npm run sw:verify` existe e é um passo
  próprio, deliberadamente **fora** do `build` — entra no `ci.yml` depois do `npm run build`,
  no mesmo lugar em que `sim:version:verify` entra depois dos testes. Para o
  `api-isolation.spec.ts`: o `route()` do `tests/pwa/helpers.ts` serve `/api/health`, e o
  allowlist garante que o pathname nunca aparece em `readCacheEntries`. Lembrete herdado do
  02-05: **chamem `clearHttpCache()`** antes de qualquer asserção offline.
- **02-11 (job `pwa` no `ci.yml`):** `npm run test:pwa` continua dependendo de `npm run build`
  ter rodado antes, e agora o build inclui o `sw:emit` — rodar as specs sobre um `dist/` de
  `vite build` cru daria vermelho, corretamente.
- **Atenção para o deploy (02-08/02-10):** o `dist/` publicado tem de ser o que passou pelo
  `sw:emit`. Como o `sw:emit` está dentro do `build` e o `sw:verify` é passo de CI depois dele,
  o caminho já é o certo — mas qualquer atalho que faça rsync de um `dist/` construído fora da
  cadeia publica um worker com sentinela.

Sem bloqueadores.

## Self-Check: PASSED

Arquivos declarados como criados — ambos presentes: `tools/sw/emit.mjs` (161 linhas),
`tools/sw/verify.mjs` (206 linhas).

Arquivos declarados como modificados — todos presentes e commitados: `public/sw.js`,
`tests/build-base.test.ts`, `package.json`.

Commits declarados — todos presentes no histórico deste worktree: `ab9bcc1`, `6fc3dc4`,
`12a1385`.

Arquivos que este plano **não** podia tocar e não tocou: `tests/pwa/install.spec.ts`,
`tests/pwa/offline.spec.ts`, `tests/pwa/helpers.ts`, `tests/pwa/fixtures/old-build/*`.

---
*Phase: 02-migra-o-para-a-vps*
*Completed: 2026-09-01*
