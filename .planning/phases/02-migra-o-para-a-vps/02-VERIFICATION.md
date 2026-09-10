---
phase: 02-migra-o-para-a-vps
verified: 2026-09-10T17:10:00Z
status: gaps_found
score: 6/10 must-haves verified
overrides_applied: 0
gaps:
  - truth: "Uma instalação limpa do PWA e uma atualização a partir de uma instalação antiga funcionam contra o domínio real da VPS, e o jogo abre sem rede depois de instalado"
    status: partial
    reason: "A suíte Playwright (11/11) prova o mecanismo do service worker contra um dist local — instalação, precache, ativação, atualização, cache único. O que falta é a mesma prova contra o domínio real servido pela VPS/Traefik: os passos 10 e 11 da Task 1 do plano 02-12 ficaram marcados '⏳ adiado' por escolha do operador em 2026-09-10, e docs/OPERACAO.md e STATE.md nomeiam isso como item aberto do critério 2."
    artifacts:
      - path: "docs/OPERACAO.md"
        issue: "Seção 'O que continua aberto ao fim do plano 02-12', item 3 — PWA instalação/atualização contra o domínio real não foi executado"
    missing:
      - "Instalar o PWA num perfil de navegador limpo contra o domínio real, desligar a rede, confirmar que a tela inicial abre e o botão de começar responde"
      - "Publicar uma segunda imagem, promovê-la, e confirmar no navegador já instalado que o aviso de atualização aparece, não troca de versão em partida, e sobra um cache só"
  - truth: "O CSP do Caddyfile deixou de ser derivado-da-fonte e passou a ser observado num navegador de verdade, sem nada bloqueado no console"
    status: failed
    reason: "ops/Caddyfile ainda carrega literalmente o aviso 'UNVERIFIED AGAINST A RUNNING BROWSER: this repository has no Caddy to parse the file and no deployment to serve it' (linhas 202-205). O passo 8 da Task 1 do plano 02-12 ficou '⏳ adiado'."
    artifacts:
      - path: "ops/Caddyfile"
        issue: "Comentário de advertência sobre CSP não observado continua no arquivo, sem ter sido substituído pela confirmação"
    missing:
      - "Abrir o jogo com o console do navegador aberto contra o domínio real, jogar uma partida curta, confirmar que os dois spritesheets, as duas fontes e o áudio carregam sem bloqueio de CSP, e atualizar o comentário do Caddyfile para refletir a observação"
  - truth: "Promover uma versão é um procedimento executado e registrado; voltar para a imagem anterior funciona com o registro INALCANÇÁVEL"
    status: partial
    reason: "A promoção real foi executada e registrada (deploy 17, commit 9cba5c9, byte-a-byte no /api/health). A metade 'reversível' não foi exercida no cenário que importa: o passo 2 da Task 2 do plano 02-12 (reversão com o host do registro apontando para um endereço morto) ficou '⏳ adiado'. A imagem anterior já está em disco (duas tags por serviço, confirmado), mas isso prova só a pré-condição, não o comportamento sob falha de rede."
    artifacts:
      - path: "docs/OPERACAO.md"
        issue: "Seção 'O que continua aberto ao fim do plano 02-12', item 1 — reversão com registro inalcançável não foi exercida"
    missing:
      - "Confirmar com o operador, acrescentar a linha temporária de resolução de nomes que torna o registro morto, apontar DG2_IMAGE_TAG para o sha anterior, promover, confirmar subida sem busca no registro e rota de saúde no sha anterior, remover a linha e verificar a remoção, voltar ao sha novo"
  - truth: "Um monitor de terceiro registrou uma checagem verde E tem alerta de expiração de certificado com 30 dias configurado"
    status: failed
    reason: "O monitor externo não existe. docs/OPERACAO.md § 'Monitor externo (D2-16/D2-21)' está explicitamente marcado '(pendente — plano 02-12)' com o texto 'o monitor NÃO existe'. tests/ops-config.test.ts confirma que a seção nomeia o prazo de 2026-11-08 e a palavra INCOMPLETA, mas não que o monitor esteja configurado — a asserção do plano testa que a pendência é RASTREÁVEL, não que ela esteja resolvida."
    artifacts:
      - path: "docs/OPERACAO.md"
        issue: "Seção de monitor externo permanece vazia de execução, com dono e prazo, mas sem checagem verde nem vermelha registradas"
    missing:
      - "Cadastrar um serviço de monitoramento HTTP na rota /api/health com keyword matching em status=ok"
      - "Configurar alerta de expiração de certificado com limiar de 30 dias (prazo real: 2026-11-08)"
      - "Provar o alarme: derrubar o contêiner do servidor, confirmar checagem vermelha, subir de volta, confirmar checagem verde — com as duas datas anotadas"
---

# Phase 2: Migração para a VPS — Verification Report

**Phase Goal:** Exercitar TLS, deploy, service worker e backup enquanto a única coisa em risco é
um jogo single-player que já funciona — a regra é nunca migrar infra e estrear rede na mesma
semana.
**Verified:** 2026-09-10T17:10:00Z
**Status:** gaps_found
**Re-verification:** Não — verificação inicial (nenhum `02-VERIFICATION.md` prévio encontrado)

## Contexto herdado do orquestrador (confirmado, não repetido)

O plano `02-12` fechou como `status: partial` por decisão explícita do operador em 2026-09-10.
Três itens foram deliberadamente adiados e estão documentados com dono e condição de volta em
`docs/OPERACAO.md` § "O que continua aberto ao fim do plano 02-12". As decisões registradas
**D2-11** (PWA em iOS/Safari físico), **D2-32** (disparo de deploy manual) e **D2-33** (sem
garantia off-site de backup) foram tratadas como decisões, não como pendências — confirmado contra
`docs/OPERACAO.md` § "Decisões registradas — NÃO são pendências" e não aparecem nos `gaps`
estruturados acima.

## Goal Achievement

### Observable Truths

Base: os 4 Success Criteria literais do `ROADMAP.md` § Phase 2, explodidos nas sub-afirmações que
o próprio plano `02-12` (o plano de reconciliação final da fase, `must_haves.truths`) e
`docs/OPERACAO.md`/`STATE.md` usam para separar o que fechou do que não fechou.

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | (SC1) O jogo abre no domínio próprio sob HTTPS e existe um único alvo de deploy — GitHub Pages não recebe build | ✓ VERIFIED | `.github/workflows/deploy.yml` não existe; `tests/workflows.test.ts` varre todos os workflows atrás de `upload-pages-artifact`/`deploy-pages`/`configure-pages`/`github-pages` e passa. `docs/OPERACAO.md` § "Primeiro certificado" e § "Primeira promoção real" registram certificado Let's Encrypt válido de 2026-09-09 22:40:52 a 2026-12-08 22:40:51, emitido pelo ACME do Traefik, raiz respondendo 200 por HTTPS, HTTP redirecionando 302 |
| 2 | (SC2) Instalação limpa do PWA e atualização a partir de instalação antiga funcionam **contra o domínio real da VPS**, e o jogo abre sem rede depois de instalado | ✗ FAILED | Mecanismo comprovado localmente (11/11 specs Playwright em Chromium real, rodadas por mim: `install.spec.ts`, `offline.spec.ts`, `update.spec.ts`, `room-url.spec.ts`, `api-isolation.spec.ts`). **Mas a prova contra o domínio real não foi feita** — passos 10 e 11 da Task 1 do 02-12 ficaram `⏳ adiado`, confirmado em `docs/OPERACAO.md` e `STATE.md` ("3. CSP observado no navegador, PWA limpo offline e PWA atualizado — critério 2") |
| 3 | (SC2, sub-item) CSP do Caddyfile observado num navegador de verdade contra o domínio, sem nada bloqueado no console | ✗ FAILED | `ops/Caddyfile` linhas 202-205 ainda contêm literalmente "UNVERIFIED AGAINST A RUNNING BROWSER: this repository has no Caddy to parse the file and no deployment to serve it. The directive list is derived from source, not observed." Não foi atualizado — passo 8 da Task 1 do 02-12 ficou `⏳ adiado` |
| 4 | (SC3) Uma requisição a `/api/` nunca é servida do cache, uma resposta não-`ok` nunca é gravada nele, e um deploy novo não deixa cache velho para trás | ✓ VERIFIED | Rodei `tests/pwa/api-isolation.spec.ts` e `tests/pwa/update.spec.ts` diretamente (Playwright/Chromium real): "/api/ e /ws nunca entram em cache nenhum da origem" passa, "resposta não-ok nunca é gravada, e a 200 seguinte é" passa, "atualização a partir da instalação antiga: um clique, e sobra um cache só" passa. `tools/sw/emit.mjs`/`tools/sw/verify.mjs` derivam o nome do cache do hash do build (`dg2-917996e0ac455823`, confirmado rodando `npm run sw:verify`) |
| 5 | (SC3, evidência de apoio) Os três `Cache-Control` chegam ao cliente exatamente como o Caddy escreveu, atravessando o Traefik sem reescrita (suposição A10) | ✓ VERIFIED | `docs/OPERACAO.md` § "Os três Cache-Control contra o domínio real — a suposição A10, CONFIRMADA": medido contra o domínio, `immutable` em assets com hash, `must-revalidate` em nomes estáveis, `no-cache` no índice e no manifest — os quatro cabeçalhos de segurança também intactos, inclusive no 503. `ops/Caddyfile` implementa os três matchers (`@assets`, `@stable`, `@shell`) |
| 6 | (SC4) "O deploy é um comando" — reconciliado como procedimento documentado e reversível por decisão `D2-32`, não como um comando único | ✓ VERIFIED (via decisão registrada) | `docs/OPERACAO.md` § "Publicar e reverter" documenta o procedimento de 5 passos e a frase de reconciliação: "o critério 4 fecha nesta fase como um procedimento documentado e reversível, não como um comando, por decisão de D2-32". `tests/ops-config.test.ts` (`describe('docs/OPERACAO.md')`, caso "aponta para PARIDADE e reconcilia o critério 4") força a presença literal da string "critério 4" no documento — não é uma alegação sem prova, é uma asserção executável |
| 7 | (SC4) A reversão funciona com o registro de imagens **INALCANÇÁVEL** | ✗ FAILED | `docs/OPERACAO.md` § "O que continua aberto..." item 1: "Reversão com o registro inalcançável — critério 4, metade 'reversível'". O passo 2 da Task 2 do 02-12 ficou `⏳ adiado`. Duas tags por serviço em disco foram confirmadas (`9cba5c9…` e `e9079df…`), o que prova a pré-condição, não o comportamento sob falha de rede real |
| 8 | (SC4) O backup do banco foi restaurado num ambiente limpo e o resultado da restauração está anotado (data e duração) | ✓ VERIFIED | `docs/OPERACAO.md` § "Ensaio de restauração (D2-03)": executado 2026-09-10 em contêiner descartável, volumes montados somente-leitura, `exit 0`, **713 ms**, sem resíduo. Prova de recusa também executada: credencial/caminho errado falha com `no matching backup files available`, uma linha, `exit 1`, sem stack trace. O documento é honesto sobre a limitação: o ledger tinha 0 linhas, então o ensaio prova o **mecanismo**, não os dados — e o próprio plano 02-12 declara que isso já fecha o critério ("nenhum — o critério 4 já fecha") |
| 9 | (SC4) Um monitor de terceiro tem checagem verde registrada E alerta de expiração de certificado (30 dias) configurado | ✗ FAILED | `docs/OPERACAO.md` § "Monitor externo (D2-16/D2-21)" está literalmente marcado `(pendente — plano 02-12)`, primeira frase: "o monitor NÃO existe". Prazo registrado: 2026-11-08 (30 dias antes do certificado expirar em 2026-12-08). `tests/ops-config.test.ts` só garante que a pendência é **rastreável** (nomeia dono e prazo), não que esteja resolvida |
| 10 | O infraKring (vizinho, produção viva de outro projeto na mesma caixa) continua no ar e intocado depois de toda a operação | ✓ VERIFIED | `docs/OPERACAO.md` § "O vizinho, antes e depois": apps do infraKring `Up 2 months` antes e depois, stack do Coolify (6 contêineres) `healthy` nos dois momentos, load average caiu (0,73→0,65), RAM disponível caiu apenas 49 MB dentro do orçamento dos `mem_limit` declarados em `ops/docker-compose.yml` (96 MB web / 320 MB api) |

**Score:** 6/10 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `.github/workflows/ci.yml` | jobs `test`, `pwa`, `image`; nenhum job `deploy-vps`/SSH | ✓ VERIFIED | 3 jobs confirmados (`test` linha 99, `pwa` linha 236, `image` linha 352); `grep -n "deploy-vps\|ssh-keyscan"` retorna zero em `ci.yml` — o job antigo baseado em SSH/rsync foi removido, substituído pelo `image` job que publica no GHCR (consistente com D2-08/D2-32) |
| `tests/workflows.test.ts` | prova executável de alvo único de deploy | ✓ VERIFIED | Varre literais de Pages (`upload-pages-artifact`, `deploy-pages`, `configure-pages`, `github-pages`) em todos os workflows; passa |
| `vite.config.ts` | `base: '/'` | ✓ VERIFIED | Linha 49 confirma |
| `ops/Caddyfile` | política HTTP de contêiner, 3 classes de cache, 503 JSON, `trusted_proxies` | ✓ VERIFIED (com ressalva) | 307 linhas, `auto_https off`, `admin off`, `trusted_proxies static private_ranges`, matchers `@assets`/`@stable`/`@shell`, `handle_errors` com `{"status":"unavailable"}`. **Ressalva:** ainda carrega o aviso "UNVERIFIED AGAINST A RUNNING BROWSER" sobre o CSP (truth #3, FAILED) |
| `ops/docker-compose.yml` | 2 serviços, sem build, sem porta publicada, 2 volumes persistentes | ✓ VERIFIED | 203 linhas; `web`/`api` sem `build:`, `expose` sem `ports:`, `pull_policy: missing`, `DG2_IMAGE_TAG:?` obrigatório (sem default automático — decisão medida), volumes nomeados `dg2-data`/`dg2-replica`, nenhuma variável `LITESTREAM_BUCKET`/`LITESTREAM_ENDPOINT`/`AWS_ACCESS_KEY_ID`/`AWS_SECRET_ACCESS_KEY` (grep confirma zero ocorrências, D2-33 aplicado) |
| `ops/README.md` | runbook executável, `sudo` em todo comando Docker | ✓ VERIFIED | 560 linhas; 8 ocorrências de `sudo docker` |
| `tests/ops-config.test.ts` | asserções que impedem regressão de config e de `docs/OPERACAO.md` | ✓ VERIFIED | 1858 linhas, 69 casos, todos passando (`npx vitest run tests/ops-config.test.ts` rodado por mim: 69/69). Bloco `describe('docs/OPERACAO.md')` tem 7+ casos, incluindo a asserção deliberada que **não** exige zero ocorrências de "pendente" (ver Anti-Patterns) |
| `docs/OPERACAO.md` | registro datado, saídas coladas, ≥170 linhas | ✓ VERIFIED | 600 linhas (min_lines 170 do plano 02-12 excedido), saídas de comando coladas com domínio redigido como `<DOMINIO>` |
| `apps/server/src/env.ts`, `index.ts` | `DG2_BIND` padrão loopback | ✓ VERIFIED | `DEFAULTS.DG2_BIND = '127.0.0.1'` (linha 97), comentário em `index.ts` explica por que `0.0.0.0` só é seguro quando declarado explicitamente no compose |
| `apps/server/src/health.ts` | `/api/health` sem vazar dado não-público | ✓ VERIFIED | `db` calculado por `COUNT` em `kysely_migration` (prova real de migração aplicada, não `select 1`); `release` vem de `DG2_RELEASE`; nenhum path, hostname ou versão de lib exposta — documentado linha a linha no próprio arquivo |
| `public/sw.js`, `tools/sw/emit.mjs`, `tools/sw/verify.mjs` | template + build derivado + portão de CI | ✓ VERIFIED | `npm run sw:emit` e `npm run sw:verify` rodados por mim: `sw ok: dg2-917996e0ac455823, 13 caminhos de precache batendo com o dist/, e nenhum /DungeonGuys2/ em 14 arquivos` |
| `tests/pwa/*.spec.ts` (5 arquivos) | instalação, offline, atualização, isolamento de `/api/`, url de sala | ✓ VERIFIED | 863 linhas totais; rodei `npx playwright test --project=pwa`: **11/11 passando** |

### Key Link Verification

| From | To | Via | Status | Details |
|------|-----|-----|--------|---------|
| `.github/workflows/ci.yml` (job `image`) | `ops/Dockerfile.web`, `ops/Dockerfile.api` | `docker build -f ops/Dockerfile.web ...` / `-f ops/Dockerfile.api ...` | ✓ WIRED | Linhas 447-448 do `ci.yml` confirmadas por grep |
| `ops/Caddyfile` (`handle /api/*`) | serviço `api` da composição | `reverse_proxy {$DG2_UPSTREAM:api:8080}` | ✓ WIRED | Linha 222; `DG2_UPSTREAM=api:8080` declarado em `ops/docker-compose.yml` linha 112 |
| `src/main.ts` | `public/sw.js` | `postMessage({type:'SKIP_WAITING'})` → `self.skipWaiting()` | ✓ WIRED | `src/main.ts:121` envia a mensagem; `public/sw.js:114` a consome — confirmado por grep dos dois lados |
| `tools/sw/emit.mjs` | `dist/sw.js` | substituição de sentinelas após `vite build` | ✓ WIRED | Execução real (`npm run build` + `sw:emit` + `sw:verify`) produziu `sw ok` sem discrepância |
| `docs/OPERACAO.md` | `tools/ops/restore-verify.mjs` | saída colada do ensaio, com data e duração | ✓ WIRED | Seção "Ensaio de restauração (D2-03)" cola o comando exato e a saída (713 ms, exit 0) |
| `docs/OPERACAO.md` | critério 4 do roadmap | frase de reconciliação de D2-32 | ✓ WIRED | `tests/ops-config.test.ts` força a presença literal de "critério 4" no documento |

### Data-Flow Trace (Level 4)

Fase majoritariamente de infraestrutura (não há componente de UI renderizando dados dinâmicos de
uma API neste escopo, além do que os testes de PWA já cobrem). O único fluxo de dado dinâmico
relevante é `GET /api/health` → `db: true/false` a partir de `COUNT(*) FROM kysely_migration`
(consulta real, não estática) — confirmado por leitura de `apps/server/src/health.ts` e pela
medição colada em `docs/OPERACAO.md` (`{"status":"ok","db":true,"release":"9cba5c9…"}` contra o
domínio real). Nenhum "hollow prop" ou fluxo desconectado encontrado nos arquivos varridos.

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Suíte completa de testes unitários/integração | `npm test` | `Test Files 60 passed (60)`, `Tests 919 passed (919)` | ✓ PASS |
| Lint | `npm run lint` | saída vazia (exit 0) | ✓ PASS |
| Build completo (sim + client + service worker) | `npm run build` | `dist/` gerado, `sw ok: dg2-917996e0ac455823` | ✓ PASS |
| Portão do service worker | `npm run sw:verify` | "13 caminhos de precache batendo com o dist/, e nenhum /DungeonGuys2/ em 14 arquivos" | ✓ PASS |
| Suíte Playwright de PWA (Chromium real) | `npx playwright test --project=pwa` | 11/11 passed | ✓ PASS |
| Config de ops isolada | `npx vitest run tests/ops-config.test.ts` | 69/69 passed | ✓ PASS |
| GitHub Pages ausente | `ls .github/workflows/deploy.yml` | `No such file or directory` | ✓ PASS |

### Probe Execution

Nenhum probe convencional (`scripts/*/tests/probe-*.sh`) declarado nos planos ou presente no
repositório para esta fase. **Step 7c: SKIPPED (nenhum probe encontrado).**

### Requirements Coverage

| Requirement | Source Plans | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| INFRA-01 | 02-01, 02-02, 02-03, 02-04, 02-10, 02-11, 02-15 | Jogo single-player na VPS, domínio único com TLS, GitHub Pages morto | ✓ SATISFIED | Truths #1, #10. Certificado válido medido contra domínio real; `deploy.yml` removido; `tests/workflows.test.ts` guarda contra reintrodução |
| INFRA-02 | 02-02, 02-05, 02-06, 02-07, 02-09, 02-13 | PWA instalável e funcional offline servido da VPS | ✗ BLOCKED | Truths #2, #3. Mecanismo provado localmente (11/11 Playwright); prova contra o domínio real da VPS explicitamente adiada (`docs/OPERACAO.md`) |
| INFRA-03 | 02-06, 02-09, 02-13 | Service worker não cacheia `/api/`, só guarda respostas `ok`, deriva nome do cache do build | ✓ SATISFIED | Truths #4, #5. Comportamento provado por testes automatizados em navegador real (Chromium/Playwright) e por `Cache-Control` confirmado contra o domínio real (A10). *Nota: `.planning/REQUIREMENTS.md` ainda marca esta linha como "Partial" citando "a prova em navegador são do 02-12" — a leitura mais estrita seria exigir também o passo de navegador do 02-12 contra o domínio, que ficou combinado com o item de CSP/PWA (critério 2), não com este requisito. Reporto a divergência para reconciliação humana, mas a evidência técnica direta (SW behavior + Cache-Control real) sustenta SATISFIED* |
| INFRA-04 | 02-03, 02-04, 02-08, 02-10, 02-11, 02-13, 02-14, 02-15 | Deploy é um comando, processo supervisionado, backup restaurável verificado restaurando | ✗ BLOCKED | Truths #6 (verified via decisão), #7 (failed), #8 (verified), #9 (failed). "Comando" reconciliado por decisão D2-32; reversão sob registro inalcançável e monitor externo (a metade "supervisionado") não executados |

**Requisitos órfãos:** nenhum. Todos os 4 IDs de `INFRA-01..04` mapeados em `.planning/REQUIREMENTS.md`
para a Fase 2 aparecem no campo `requirements:` de pelo menos um dos 15 planos, e nenhum plano
declara um ID fora deste conjunto.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `docs/OPERACAO.md` | 7, 182, 264, 524, 526 | 5 ocorrências de "pendente" | ℹ️ INFO | Não é um marcador de débito de código (`TBD`/`FIXME`/`XXX`) — é prosa operacional. Cada ocorrência tem dono, prazo ou consequência nomeada (confirmado por leitura das 5 linhas). O próprio plano `02-12` previa que este grep retornasse 0 e o executor **deliberadamente não cumpriu**, documentando a divergência no SUMMARY como escolha correta (apagar o marcador seria "comprar uma suíte verde" escondendo o monitor ausente). `tests/ops-config.test.ts` reflete essa decisão: não assere ausência de "pendente", assere presença de dono/prazo/consequência. Não é um antipadrão de execução — é honestidade documental por desenho |
| `ops/Caddyfile` | 202-205 | Comentário "UNVERIFIED AGAINST A RUNNING BROWSER" sobre o CSP | ⚠️ WARNING | Já capturado como truth #3 FAILED — não é um antipadrão de código, é a mesma lacuna registrada duas vezes (arquivo + gap). Listado aqui só para rastreabilidade cruzada |
| `ops/turnserver.conf`, `ops/README.md` | várias | Palavra "placeholder" para segredo/domínio | ℹ️ INFO | Por desenho (D2-15): nenhum segredo ou endereço real pode viver no repositório. Não é código incompleto |

**Nenhum marcador `TODO`/`FIXME`/`XXX`/`TBD`/`HACK` encontrado** em `ops/`, `apps/server/src/`,
`tools/ops/`, `tools/sw/` ou `.github/workflows/ci.yml` (grep dedicado, zero resultados) — o
**debt marker gate** do processo de verificação não encontra nada para bloquear por essa via.

### Human Verification Required

Nenhum item novo de verificação humana é necessário além do que já está listado como `gaps`
estruturados acima — são as mesmas três lacunas que `docs/OPERACAO.md` e `STATE.md` já nomeiam com
dono (o operador) e condição de volta, e que só podem ser fechadas contra a caixa real (não há
como um agente as verificar programaticamente). Por isso este relatório usa `status: gaps_found`
e não `human_needed`: a pendência não é "preciso que um humano confirme algo ambíguo", é "o
trabalho ainda não foi executado contra a caixa real", que é exatamente o que a Fase 02 e o
`SUMMARY.md` do 02-12 já admitem.

### Gaps Summary

A Fase 02 entrega um jogo real no ar, no domínio próprio, sob HTTPS, com a política HTTP medida
(não suposta) contra o domínio de produção, um pipeline de imagem que publica por sha, um
service-worker cuja política de cache está provada por 11 testes de navegador real, e um ensaio de
restauração de backup executado com sucesso e com prova de recusa. Os testes automatizados (919
unitários + 69 de config + 11 de PWA) passam integralmente, e o lint está limpo.

Três itens, porém, permanecem genuinamente incompletos — não são decisões registradas, são
trabalho adiado com dono e prazo, confirmado por três fontes independentes e concordantes
(`docs/OPERACAO.md`, `.planning/STATE.md`, e o `SUMMARY.md` do plano 02-12):

1. **Critério 2 (PWA contra o domínio real + CSP observado)** — o mecanismo está provado
   localmente; falta exercitá-lo contra a caixa real, incluindo o CSP num console de navegador de
   verdade.
2. **Critério 4, metade "reversível"** — a reversão nunca foi exercitada com o registro de imagens
   inalcançável, que é o cenário em que ela de fato importaria.
3. **Critério 4, metade "alguém avisa"** — o monitor externo não existe. Isso importa mais do que
   um item isolado: enquanto ele não existir, nada avisa se o certificado expirar (prazo real:
   2026-11-08) nem se o jogo cair num crash-loop que o Docker tenta para sempre.

Nenhum destes três é adiável para uma fase posterior do roadmap — as Fases 3 em diante (sala,
transporte, protocolo) não tocam TLS, PWA, CSP, reversão de deploy ou monitoramento externo, então
o **Step 9b (deferred items) não se aplica**: são lacunas reais desta fase, não trabalho
reagendado para depois.

---

_Verified: 2026-09-10T17:10:00Z_
_Verifier: Claude (gsd-verifier)_
