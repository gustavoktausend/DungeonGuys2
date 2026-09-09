---
phase: 2
slug: migra-o-para-a-vps
status: mapeado (planos 02-01 a 02-12); addendum de 2026-09-09 para as ondas 8 a 12 (02-04, 02-13, 02-14, 02-15, 02-12)
nyquist_compliant: true
wave_0_complete: false
created: 2026-08-31
amended: 2026-09-09
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
| 02-02 T1 | 02-02 | 1 | INFRA-01 | — | `base` e `'/'`; nenhuma fonte carrega `/DungeonGuys2/` | unit | `npx vitest run tests/build-base.test.ts` | ❌ W0 | ⬜ pending |
| 02-06 T3 | 02-06 | 3 | INFRA-01 | — | Nenhum arquivo emitido em `dist/` carrega `/DungeonGuys2/` (metade de artefato: `npm test` roda antes de `npm run build` no CI) | build gate | `npm run build && npm run sw:verify` | ❌ W0 | ⬜ pending |
| 02-01 T1 | 02-01 | 1 | INFRA-01 | T-2-PAGES | Nenhum workflow publica no GitHub Pages | unit | `npx vitest run tests/workflows.test.ts` | ❌ W0 | ⬜ pending |
| 02-10 T2 | 02-10 | 5 | INFRA-01 | T-2-TLS | O script de vigilancia local do certificado existe e falha por codigo de saida | estrutural | `sh -n ops/cert-check.sh && npx vitest run tests/ops-config.test.ts` | ❌ W0 | ⬜ pending |
| 02-12 T1 | 02-12 | 7 | INFRA-01 | T-2-TLS | Dominio serve HTTPS com certificado valido, emitido no primeiro boot | shell (VPS) | `ops/cert-check.sh` | ❌ W0 | ⬜ pending |
| 02-12 T3 | 02-12 | 7 | INFRA-01 | T-2-TLS / T-2-MUTE | Certificado com mais de 30 dias, continuamente, e o monitor externo ja ficou verde **e** vermelho | timer + monitor externo | `systemctl start cert-check.service` · monitor externo em `/api/health` | ❌ W0 | ⬜ pending |
| 02-05 T3 → 02-06 T3 | 02-05 / 02-06 | 2 → 3 | INFRA-02 | — | Instalacao limpa: SW ativa e o precache cobre todo o `dist/`. Escrita em VERMELHO no 02-05, vira verde no 02-06 | e2e | `npx playwright test tests/pwa/install.spec.ts` | ❌ W0 | ⬜ pending |
| 02-05 T3 → 02-06 T3 | 02-05 / 02-06 | 2 → 3 | INFRA-02 | — | Offline depois da instalacao, **sem nunca ter jogado**, com zero falha de rede da propria origem (possivel por D2-20) | e2e | `npx playwright test tests/pwa/offline.spec.ts` | ❌ W0 | ⬜ pending |
| 02-05 T3 | 02-05 | 2 | INFRA-02 | — | Manifesto instalavel: `scope`/`start_url` batem com o escopo do SW | e2e | `npx playwright test tests/pwa/install.spec.ts` | ❌ W0 | ⬜ pending |
| 02-05 T2 | 02-05 | 2 | INFRA-02 | T-2-VACUOUS | A fixture da instalacao antiga e o worker de ANTES da reescrita, e foi construida DEPOIS da mudanca de `base` | unit | `npx vitest run tests/build-base.test.ts` | ❌ W0 | ⬜ pending |
| 02-07 T1 | 02-07 | 4 | INFRA-02 | T-2-STUCK | Todo id resolvido em `dom.ts` existe no `index.html`, inclusive `btn-update` | unit | `npx vitest run tests/dom-ids.test.ts` | ❌ W0 | ⬜ pending |
| 02-09 T2 | 02-09 | 5 | INFRA-03 | T-2-CACHE | `/api/*` nunca entra em nenhum cache da origem | e2e | `npx playwright test tests/pwa/api-isolation.spec.ts` | ❌ W0 | ⬜ pending |
| 02-09 T2 | 02-09 | 5 | INFRA-03 | T-2-STALE | Resposta nao-`ok` nunca e gravada, e uma 200 seguinte E gravada (guarda anti-vacuidade) | e2e | `npx playwright test tests/pwa/api-isolation.spec.ts` | ❌ W0 | ⬜ pending |
| 02-09 T1 | 02-09 | 5 | INFRA-03 | T-2-STALECACHE | Nome do cache deriva do build; a atualizacao deixa **um** cache e apaga `dungeonguys2-v1` | e2e | `npx playwright test tests/pwa/update.spec.ts` | ❌ W0 | ⬜ pending |
| 02-06 T3 | 02-06 | 3 | INFRA-03 | T-2-SILENT | O passo de build rodou de verdade (sem sentinela sobrando, precache batendo com o `dist/`) | build gate | `npm run sw:verify` | ❌ W0 | ⬜ pending |
| 02-09 T3 | 02-09 | 5 | INFRA-02 / INFRA-03 | — | Os quatro testes de PWA rodam no CI a cada push | pipeline | `npm run build && npm run sw:verify && npm run test:pwa` | ❌ W0 | ⬜ pending |
| 02-03 T1..T3 | 02-03 | 1 | INFRA-01 / INFRA-04 | T-2-404 / T-2-ROLLBACK / T-2-KEY | Caddyfile sem `try_files` e com `{$VAR}`; symlink trocado com `mv -T`; rollback sem rede; nenhum segredo nem IPv4 em `ops/` | estrutural | `npx vitest run tests/ops-config.test.ts` | ❌ W0 | ⬜ pending |
| 02-08 T1 | 02-08 | 4 | INFRA-04 | T-2-DEPLEAK | A raiz continua com `dependencies` vazio e `apps/server` tem exatamente as quatro dependencias | unit | `npx vitest run tests/workspaces.test.ts` | ❌ W0 | ⬜ pending |
| 02-08 T2 | 02-08 | 4 | INFRA-04 | T-2-DATA | Migracao roda e e idempotente (dois starts seguidos); colunas iguais ao `LedgerEvent` canonico | integracao | `npx vitest run tests/server-migrate.test.ts` | ❌ W0 | ⬜ pending |
| 02-08 T3 | 02-08 | 4 | INFRA-04 | T-2-LEAK / T-2-BIND | `/api/health` responde 200, com exatamente tres chaves, e escuta em loopback | integracao | `npx vitest run tests/server-health.test.ts` | ❌ W0 | ⬜ pending |
| 02-10 T1 | 02-10 | 5 | INFRA-04 | T-2-MEM / T-2-LOOP / T-2-SECRET | `MemoryMax` pareado com o heap do V8, `StartLimitBurst`, `replica` singular, e nenhum segredo literal | estrutural | `npx vitest run tests/ops-config.test.ts` | ❌ W0 | ⬜ pending |
| 02-11 T1..T2 | 02-11 | 6 | INFRA-01 / INFRA-04 | T-2-SSH / T-2-SC / T-2-RACE | Sem `ssh-keyscan`, sem `StrictHostKeyChecking=no`, `concurrency` presente, e so acoes da propria GitHub | unit | `npx vitest run tests/workflows.test.ts` | ❌ W0 | ⬜ pending |
| 02-12 T2 | 02-12 | 7 | INFRA-04 | T-2-ROLLBACK | Deploy e um comando e e reversivel, com o GitHub irrelevante na reversao | shell (VPS) | `ops/deploy.sh <sha>` · `ops/rollback.sh` | ❌ W0 | ⬜ pending |
| 02-12 T3 | 02-12 | 7 | INFRA-04 | T-2-BACKUP | Backup **restaurado** e conferido contra o banco vivo, com prova de recusa | shell (VPS) | `node tools/ops/restore-verify.mjs` | ❌ W0 | ⬜ pending |

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

## Addendum — replanejamento de 2026-09-09 (planos 02-04, 02-13, 02-14, 02-15, 02-12)

> A tabela de `## Per-Task Verification Map` acima é de 2026-08-31 e descreve o conjunto
> original de doze planos. **Dez deles foram executados e as linhas correspondentes continuam
> válidas.** As linhas que apontam para `ops/cert-check.sh`, `ops/deploy.sh` e `ops/rollback.sh`
> descrevem arquivos que o plano 02-14 remove (D2-30) — **não as execute**. As substituições
> estão abaixo, e elas são o contrato de validação das ondas 8 a 12.

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|--------|
| 02-04 T2 | 02-04 | 8 | INFRA-04 | T-2-RELAY / T-2-SECRET | Faixa de relay declarada e `total-quota` menor ou igual ao tamanho da faixa, calculado do próprio arquivo; `docs/OPERACAO.md` sem endereço nem credencial | estrutural | `npx vitest run tests/ops-config.test.ts` | ⬜ pending |
| 02-04 T3 | 02-04 | 8 | INFRA-01 | T-2-TLS / T-2-NEIGHBOR | A1 provada: o Coolify lê a composição do repositório e o Traefik emite o primeiro certificado; as quatro regras de UFW abertas | shell + painel (VPS) | saída colada em `docs/OPERACAO.md` | ⬜ pending |
| 02-13 T1 | 02-13 | 9 | INFRA-04 | T-2-BIND | `DG2_BIND` com padrão em loopback, recusado em branco, `0.0.0.0` aceito e fora do código | unit | `npx vitest run tests/server-env.test.ts` | ⬜ pending |
| 02-13 T2 | 02-13 | 9 | INFRA-02 / INFRA-03 | T-2-XFF / T-2-ACME / T-2-HEADER | `trusted_proxies static private_ranges`, `auto_https off` e `admin off` presentes; os quatro cabeçalhos e as três classes de cache intactos; nenhum domínio no arquivo | estrutural | `npx vitest run tests/ops-config.test.ts` | ⬜ pending |
| 02-14 T1 | 02-14 | 10 | INFRA-04 | T-2-SC / T-2-MEM / T-2-BACKUP / T-2-ROLLBACK | Nenhum `ports:`, nenhum `networks:`, nenhum `build:`; `pull_policy: missing`; tag por sha; `mem_limit` pareado com o heap do V8; `stop_grace_period` maior que `SHUTDOWN_GRACE_MS` importado; `ENTRYPOINT` com `-exec`; Litestream fixado por sha256 | estrutural | `npx vitest run tests/ops-config.test.ts` | ⬜ pending |
| 02-14 T2 | 02-14 | 10 | INFRA-04 | T-2-VACUOUS | Nenhum `.sh` em `ops/`; piso anti-vacuidade dos globs em 9 e **provado por remoção** | estrutural | `npx vitest run tests/ops-config.test.ts` | ⬜ pending |
| 02-14 T3 | 02-14 | 10 | INFRA-04 | T-2-SECRET / T-2-LOOP | O runbook diz `sudo docker`, a retenção de 5, a reversão por `DG2_IMAGE_TAG`, as quatro regras do coturn, o alerta de 30 dias, e que o Docker tenta para sempre onde o systemd chegava a `failed` | estrutural | `npx vitest run tests/ops-config.test.ts` | ⬜ pending |
| 02-15 T1 | 02-15 | 11 | INFRA-01 / INFRA-04 | T-2-SC / T-2-TOKEN / T-2-SSH / T-2-MOVTAG | Nenhuma ação de terceiro; **exatamente um** `packages: write` e só no job da imagem; tag por sha; token por `stdin`; nenhuma linha com `ssh`/`rsync`/`scp`; nenhum marcador do Pages | unit | `npx vitest run tests/workflows.test.ts` | ⬜ pending |
| 02-15 T2 | 02-15 | 11 | INFRA-02 / INFRA-03 / INFRA-04 | T-2-BIND / T-2-HEADER / T-2-404 | Os comandos do job rodados localmente; o Caddy de um contêiner alcança o Node do outro; quatro cabeçalhos, três classes de cache, 404 honesto e 503 em JSON medidos na resposta real | shell (local, Docker) | `npm run build && npm run server:build && npm test` mais as seis medições coladas no SUMMARY | ⬜ pending |
| 02-12 T1 | 02-12 | 12 | INFRA-01 / INFRA-02 / INFRA-03 | T-2-TLS / T-2-CACHE / T-2-CSP | Certificado válido do Traefik; os três `Cache-Control` contra o domínio real (A10); CSP observado no navegador; PWA instalado, offline e atualizado | shell + navegador (VPS) | saída colada em `docs/OPERACAO.md` | ⬜ pending |
| 02-12 T2 | 02-12 | 12 | INFRA-01 / INFRA-04 | T-2-ROLLBACK / T-2-BACKUP / T-2-MUTE / T-2-HOSTS | Reversão com o registro **inalcançável**; restauração em contêiner descartável com duração medida e prova de recusa; monitor verde **e** vermelho, com alerta de certificado de 30 dias | shell (VPS) + painel de terceiro | saída colada em `docs/OPERACAO.md` | ⬜ pending |
| 02-12 T3 | 02-12 | 12 | INFRA-01..04 | T-2-SECRET | Nenhuma seção de `docs/OPERACAO.md` ficou com texto de marcador; nenhum endereço nem credencial nas saídas coladas | estrutural | `npx vitest run tests/ops-config.test.ts` | ⬜ pending |

### Comandos manuais que SUBSTITUEM os da tabela original

| Saiu (arquivo removido por D2-30) | Entrou |
|---|---|
| `ops/cert-check.sh` | conferência de fora da cadeia TLS servida pelo Traefik, mais o monitor externo com alerta de expiração de 30 dias |
| `ops/deploy.sh <sha>` | a forma de disparo manual decidida no plano 02-04, mais a comparação do campo de release da rota de saúde com o sha publicado |
| `ops/rollback.sh` | apontar `DG2_IMAGE_TAG` para o sha anterior e promover, **com o host do registro resolvendo para um endereço morto** |
| `node tools/ops/restore-verify.mjs` na máquina | o mesmo script num **contêiner descartável** da imagem do servidor, com o volume do banco em somente-leitura |

### Sampling Rate das ondas 8 a 12

- **Por commit de tarefa:** `npm test`
- **Por onda:** `npm run lint && npm test && npm run build && npm run sw:verify && npm run server:build && npm run test:e2e`
- **Portão de fase:** a suíte completa verde no CI **mais** as execuções contra a caixa das ondas 8 e 12, com a saída colada em `docs/OPERACAO.md`

### Lacunas de amostragem declaradas

- O `-exec` do Litestream **não** é exercitado localmente no plano 02-15 (não há bucket na máquina de desenvolvimento): o entrypoint é sobrescrito para o Node. O repasse de sinal está verificado no código-fonte do Litestream (DM-13) e é exercitado de verdade no plano 02-12.
- A porta interna `8080` **não** é exercitada pela composição de prova do plano 02-04, que usa o padrão da imagem oficial do Caddy. O número muda, o mecanismo não; a porta real é provada no plano 02-15 (local) e no 02-12 (caixa).
- O `healthcheck` da composição e a política de reinício do Docker **não** têm portão automatizado: a corrente de alarme é o monitor externo, e o plano 02-12 a exercita fazendo o monitor ficar vermelho.

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s (laço rápido)
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
