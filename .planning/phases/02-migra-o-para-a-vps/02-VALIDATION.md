---
phase: 2
slug: migra-o-para-a-vps
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-08-31
---

# Phase 2 — Validation Strategy

> Contrato de validação da fase, para amostragem de feedback durante a execução.
> Derivado de `02-RESEARCH.md` § "Validation Architecture".
>
> Rótulos de estrutura ficam em inglês porque são lidos por ferramenta; o conteúdo é em
> português, como o resto dos documentos do projeto.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** (unidade, Node) | Vitest 4.1.11 — `vitest.config.ts`, `include: ['tests/**/*.test.ts']` |
| **Framework** (cross-engine) | Vitest browser mode + `@vitest/browser-playwright` 4.1.11 — `vitest.browser.config.ts` |
| **Framework** (PWA/e2e) — **novo** | `@playwright/test` **1.62.1** (versão exata, casando com o `playwright` já travado no lock) — `playwright.config.ts` |
| **Config file** | `vitest.config.ts` e `vitest.browser.config.ts` existem; `playwright.config.ts` → **Wave 0** |
| **Quick run command** | `npm test` |
| **Full suite command** | `npm run lint && npm run typecheck:sim && npm run typecheck:protocol && npm test && npm run sim:version:verify && npm run assets:selftest && npm run assets:refusal && npm run assets:validate && npm run test:browser && npm run build && npm run sw:verify && npm run test:pwa` |
| **Estimated runtime** | `npm test` ~segundos; suíte completa ~minutos (dominada por `test:browser` e pelo job `pwa`) |
| **Naming** | Specs do Playwright em `tests/pwa/*.spec.ts`. O `include` do Vitest é `*.test.ts` — **não há colisão** e nenhuma exclusão é necessária |

---

## Sampling Rate

- **After every task commit:** `npm test` (Vitest Node — segundos)
- **After every plan wave:** `npm run lint && npm test && npm run build && npm run sw:verify && npm run test:pwa`
- **Before `/gsd:verify-work`:** suíte completa verde no CI (incluindo `test:browser` e o job
  `pwa`) **mais** os quatro comandos de shell da VPS executados uma vez, com a saída colada
  em `docs/OPERACAO.md`
- **Max feedback latency:** ~30 s para o laço rápido (`npm test`)

---

## Per-Task Verification Map

> Mapeado por requisito enquanto os PLAN.md não existem. O planejador deve reescrever a
> coluna `Task ID` ao produzir as tarefas, preservando comando e tipo.

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| TBD | TBD | TBD | INFRA-01 | — | `base` é `'/'`; nada em `dist/` carrega `/DungeonGuys2/` | unit | `npx vitest run tests/build-base.test.ts` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | INFRA-01 | — | Nenhum workflow publica no GitHub Pages | unit | `npx vitest run tests/workflows.test.ts` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | INFRA-01 | T-2-TLS | Domínio serve HTTPS com certificado válido | shell (VPS) | `ops/cert-check.sh` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | INFRA-01 | T-2-TLS | Certificado com >30 dias, continuamente | timer + monitor externo | `systemctl start cert-check.service` · monitor externo em `/api/health` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | INFRA-02 | — | Instalação limpa: SW ativa e o precache cobre todo o `dist/` | e2e | `npx playwright test tests/pwa/install.spec.ts` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | INFRA-02 | — | Offline depois da instalação, **sem nunca ter jogado** | e2e | `npx playwright test tests/pwa/offline.spec.ts` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | INFRA-02 | — | Manifesto instalável: `scope`/`start_url` batem com o escopo do SW | e2e | `npx playwright test tests/pwa/install.spec.ts` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | INFRA-03 | T-2-CACHE | `/api/*` nunca entra no Cache Storage | e2e | `npx playwright test tests/pwa/api-isolation.spec.ts` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | INFRA-03 | T-2-CACHE | Resposta não-`ok` nunca é gravada no cache | e2e | `npx playwright test tests/pwa/api-isolation.spec.ts` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | INFRA-03 | — | Nome do cache deriva do build; update deixa **um** cache | e2e | `npx playwright test tests/pwa/update.spec.ts` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | INFRA-03 | — | O passo de build rodou de verdade (sem sentinela sobrando) | build gate | `npm run sw:verify` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | INFRA-04 | — | Deploy é um comando e é reversível | shell (VPS) | `ops/deploy.sh <sha>` · `ops/rollback.sh` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | INFRA-04 | — | Migração roda e é idempotente (dois starts seguidos) | integração | `npx vitest run tests/server-migrate.test.ts` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | INFRA-04 | T-2-LEAK | `/api/health` responde 200 e não vaza nada não-público | integração | `npx vitest run tests/server-health.test.ts` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | INFRA-04 | — | Backup **restaurado** e conferido contra o banco vivo | shell (VPS) | `node tools/ops/restore-verify.mjs` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Success Criteria → Sinal Observável → Onde É Medido

| # | Critério | Sinal observável que prova | Onde é medido |
|---|---|---|---|
| **1** | Jogo no domínio próprio sob HTTPS, e **um** alvo de deploy | (a) `curl -sI https://$DG2_DOMAIN/` → `200` com cadeia TLS válida; (b) `grep -r 'deploy-pages\|upload-pages-artifact' .github/` → **vazio**; (c) `openssl x509 -checkend 2592000` → exit 0; (d) o monitor externo registrou ao menos uma checagem verde | (a) shell na VPS + navegador; (b) `tests/workflows.test.ts` **no CI**; (c) `cert-check.timer` na VPS; (d) painel do monitor externo, registrado em `docs/OPERACAO.md` |
| **2** | Instalação limpa **e** atualização a partir de instalação antiga funcionam; abre sem rede | (a) `install.spec.ts`: `navigator.serviceWorker.controller !== null` e `caches.keys()` = 1 cache, cujo conteúdo é **exatamente** a lista de `dist/` menos `sw.js`; (b) `update.spec.ts`: partindo do fixture do SW velho, `registration.waiting` aparece, o botão de update dispara `controllerchange`, e depois sobra **1** cache; (c) `offline.spec.ts`: com o servidor derrubado, `page.reload()` renderiza a tela inicial e o botão START responde | Playwright no CI, projeto **chromium** |
| **3** | `/api/` nunca servido do cache; não-`ok` nunca gravado; deploy novo não deixa cache velho | (a) `api-isolation.spec.ts`: depois de N chamadas a `/api/health`, nenhuma URL com `/api/` aparece em nenhum `cache.keys()`; (b) rota mockada devolvendo 502 para um asset precacheado → aquele asset **não** muda no cache; (c) `update.spec.ts` assere `caches.keys().length === 1` e que o nome mudou | Playwright no CI, projeto **chromium** |
| **4** | Deploy é um comando e é reversível; backup **restaurado** e o resultado anotado | (a) `ops/deploy.sh <sha>` termina 0 e `readlink /srv/dg2/current` aponta para o sha; (b) `ops/rollback.sh` volta o symlink e o `index.html` servido bate o hash do release anterior, **com a rede do GitHub irrelevante**; (c) `node tools/ops/restore-verify.mjs` imprime linha verde e sai 0; (d) existe arquivo em `docs/` com data, duração e o que faltou | (a)(b)(c) shell na VPS; (d) revisão de artefato — o verificador da fase abre o arquivo |

---

## Wave 0 Requirements

- [ ] `npm i -D @playwright/test@1.62.1` — versão exata, casando com o `playwright` 1.62.1 do lock
- [ ] `playwright.config.ts` — `testDir: 'tests/pwa'`, `projects: [{ name: 'chromium' }]`, `webServer` servindo `dist/`
- [ ] `tests/pwa/helpers.ts` — servidor estático controlável (fixture), `waitForActivated()`, `readCacheEntries()`
- [ ] `tests/pwa/fixtures/old-build/` — o `dist/` de **antes** da reescrita do `sw.js`, com o `public/sw.js` atual, servindo de "instalação antiga" do critério 2
- [ ] `tests/pwa/install.spec.ts`, `update.spec.ts`, `offline.spec.ts`, `api-isolation.spec.ts`
- [ ] `tests/build-base.test.ts` — assere que nada em `dist/` contém `/DungeonGuys2/`
- [ ] `tests/workflows.test.ts` — assere ausência de deploy para Pages (INFRA-01 executável)
- [ ] `tests/server-migrate.test.ts` e `tests/server-health.test.ts` — precisam que o Vitest da raiz enxergue `apps/server`; conferir se `include: tests/**` mais os `paths` do `tsconfig.json` bastam, ou se `apps/server` precisa de config própria
- [ ] `ops/cert-check.sh`, `ops/deploy.sh`, `ops/rollback.sh`, `tools/ops/restore-verify.mjs`
- [ ] Job `pwa` no `ci.yml` (reaproveita o cache de browser já existente) e job `deploy`

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Deploy e rollback na VPS real | INFRA-04 | Só existe contra a máquina provisionada; o CI não tem SSH para ela no laço de teste | `ops/deploy.sh <sha>`; conferir `readlink /srv/dg2/current`; `ops/rollback.sh`; conferir que o `index.html` servido voltou ao hash anterior |
| Ensaio de restauração do backup | INFRA-04 | D2-03 pede restauração **anotada**, não automatizada — a evidência é o registro, não um exit code | `node tools/ops/restore-verify.mjs`; colar data, duração e o que faltou em `docs/OPERACAO.md` |
| Primeira checagem verde do monitor externo | INFRA-01 | O painel é de terceiro; não há API garantida para assertar no CI | Apontar o monitor para `https://$DG2_DOMAIN/api/health` com keyword `"status":"ok"`; registrar a primeira checagem verde em `docs/OPERACAO.md` |
| PWA em iOS/Safari físico | INFRA-02 | **Lacuna aceita por D2-11** — não será feita nesta fase | — |

---

## Lacuna aceita, registrada por escolha (D2-11)

> **PWA em iOS/Safari físico permanece sem cobertura, por decisão, e a caixa correspondente
> em `docs/PARIDADE.md` ("PWA instalável e funcional offline — *aguardando o humano*",
> § Plataforma) permanece ABERTA ao fim desta fase.** A pesquisa **ampliou** o alcance
> medido da lacuna: o Playwright só suporta service worker em Chromium
> `[CITED: playwright.dev/docs/service-workers]`, então Firefox e WebKit — mesmo em desktop,
> mesmo no CI — também ficam sem cobertura de service worker.
>
> **O verificador da fase deve ler o critério 2 com essa ressalva e NÃO tratar a caixa aberta
> como pendência da fase.**

---

## Notas de projeto do teste de PWA

1. **Service worker no Playwright é Chromium-only.** O projeto Playwright desta fase tem
   **um** browser. Ver a lacuna acima.
2. **Não confie só em `context.setOffline()`** — é emulação por CDP e há relato aberto de que
   não alcança requisições feitas pelo service worker (`microsoft/playwright#2311`). O teste
   de offline **derruba o servidor estático de verdade** (fecha o `http.Server` da fixture) e,
   por cima, chama `setOffline(true)`. Assim prova offline mesmo se a emulação falhar.
3. **Colete `requestfailed` filtrando por origem própria** — as fontes do Google vão falhar
   offline e isso é esperado; assertar `failed.length === 0` sem filtro produz vermelho que
   não é defeito.
4. **Contexto seguro:** `http://localhost` e `http://127.0.0.1` contam. O teste **não**
   precisa de TLS.
5. **Não use `serviceWorkers: 'block'`** no contexto — inutilizaria o teste inteiro.
6. **Typecheck:** o `tsconfig.json` da raiz inclui `tests` e fixa `types: ["vite/client"]`.
   Se `@playwright/test` reclamar de tipos de Node, a saída barata é um
   `tests/pwa/tsconfig.json` próprio — **não** acrescentar `"node"` ao `types` da raiz, que
   afrouxaria a disciplina DOM-only do cliente.

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s (laço rápido)
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
