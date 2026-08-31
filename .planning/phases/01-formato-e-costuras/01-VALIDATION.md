---
phase: 1
slug: formato-e-costuras
status: planned
nyquist_compliant: true
wave_0_complete: false
created: 2026-08-31
---

# Phase 1 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
> Derivado de `01-RESEARCH.md` § Validation Architecture. Todos os números
> abaixo foram medidos neste repositório, não estimados.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 2.1.9 hoje → **4.1.11** (alvo) + `@vitest/browser-playwright` 4.1.11 |
| **Config file** | Nenhum hoje — Vitest roda com defaults sobre `vite.config.ts`. Nascem `vitest.config.ts` e `vitest.browser.config.ts` na Wave 0 |
| **Quick run command** | `npx vitest run <arquivo>` (suíte inteira: 2,3 s) |
| **Full suite command** | `npm test && npx vitest run --config vitest.browser.config.ts` |
| **Estimated runtime** | ~2,3 s em Node; ~40–90 s com os três motores de navegador |
| **Estado atual** | 244 testes em 21 arquivos, todos verdes |

---

## Sampling Rate

- **After every task commit:** `npx vitest run` (só Node — 2,3 s, não sobe navegador)
- **After every plan wave:** `npm test` **+** `npx vitest run --config vitest.browser.config.ts` (chromium/firefox/webkit). O portão de navegador só precisa rodar quando algo em `sim/` mudou.
- **Before `/gsd:verify-work`:** suíte completa verde nos **quatro** motores + `node tools/assets/validate.mjs` + `node tools/sim-version/verify.mjs`
- **Max feedback latency:** 3 s no laço por task; 90 s no portão de wave

---

## Per-Task Verification Map

> Task IDs são preenchidos pelo `gsd-planner`. A linha de requisito abaixo é o
> contrato que cada task herda: nenhuma task pode fechar sem que o comando da
> sua linha esteja verde.

**Threat IDs** — definidos aqui a partir de `01-RESEARCH.md` § Security Domain.
Os blocos `<threat_model>` dos PLAN.md **devem reusar estes mesmos IDs**, para que
a coluna *Threat Ref* abaixo não vire referência solta:

| ID | Ameaça | STRIDE | Mitigação padrão |
|----|--------|--------|------------------|
| T-1-01 | `SIM_VERSION` forjado pelo cliente | Spoofing | A recusa é simétrica; a autoridade compara com o **próprio** valor, o cliente nunca escolhe a versão de referência |
| T-1-02 | `eventId` de ledger colidindo ou sendo reusado | Tampering | ULID com 80 bits de aleatoriedade criptográfica + `UNIQUE(id)` no servidor (fase 6); o teste de monotonicidade mora aqui |
| T-1-03 | Formato de replay como amplificador de CPU (teto de ticks) | Denial of Service | A verificação é da fase 9, **mas o campo de teto tem de existir no formato agora** — acrescentá-lo depois é migração |
| T-1-04 | Manifesto de assets malicioso vindo de PR externo | Tampering | `ajv` com `strict: true` rodando em CI antes de qualquer merge; nenhuma execução de código a partir do manifesto |
| T-1-05 | Slopsquat / typosquat em devDependency nova | Tampering | `slopcheck` antes de instalar; versões pinadas no lockfile; Playwright pinado exato |
| T-1-06 | Bypass de `server.fs.deny` do Vite no Windows (GHSA-fx2h-pf6j-xcff) | Information Disclosure | Upgrade para Vite 7.3.6; até lá, prender o dev server em `localhost` |

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 01-13 T3 | 01-13 | 7 | FORM-01 | — | `World` não carrega `accountId` nem `peerId`; travessia de identidade não vaza entre espaços | unit | `npx vitest run tests/identity.test.ts` | ❌ W0 | ⬜ pending |
| 01-13 T2 | 01-13 | 7 | FORM-02 | — | Ordem de entrada não influencia resultado — sem canal lateral por ordem de jogador | unit | `npx vitest run tests/canonical-order.test.ts` | ❌ W0 | ⬜ pending |
| 01-07 T2 | 01-07 | 4 | FORM-03 | T-1-01 | `SIM_VERSION` reproduzível; divergência recusa entrada na sala em vez de dessincronizar | integration | `node tools/sim-version/verify.mjs` | ❌ W0 | ⬜ pending |
| 01-04 T3 / 01-12 T3 | 01-04, 01-12 | 2, 6 | FORM-04 | — | `hashWorld` idêntico em node/chromium/firefox/webkit contra o ouro versionado | integration | `npx vitest run --config vitest.browser.config.ts` | ❌ W0 | ⬜ pending |
| 01-09 T1-T2 | 01-09 | 5 | FORM-04 | — | `sim/math.ts` bit-exato contra o oráculo `@stdlib`; `throw` fora do domínio `\|x\| < 2^20` | unit | `npx vitest run tests/math-oracle.test.ts` | ❌ W0 | ⬜ pending |
| 01-03 T2 | 01-03 | 1 | FORM-05 | T-1-02 | Saldo = soma do ledger; evento duplicado é no-op (idempotência por `UNIQUE(id)`); gasto é negativo | unit | `npx vitest run tests/ledger.test.ts` | ❌ W0 | ⬜ pending |
| 01-03 T1 | 01-03 | 1 | FORM-05 | T-1-02 | ULID: 26 chars, alfabeto Crockford, monotônico no mesmo ms — id de cliente não colide | unit | `npx vitest run tests/ulid.test.ts` | ❌ W0 | ⬜ pending |
| 01-10 T1 | 01-10 | 5 | FORM-06 | T-1-03 | `encode(decode(x)) === x`; `-0` normalizado; pacote de 6 bytes; buraco no log = repetir último input | unit | `npx vitest run tests/input-codec.test.ts` | ❌ W0 | ⬜ pending |
| 01-14 T2 | 01-14 | 8 | FORM-07 | — | `saveWorld`/`loadWorld` round-trip por hash **e** por `Object.is` estrutural; RNG restaurado | unit | `npx vitest run tests/serialize.test.ts` | ❌ W0 | ⬜ pending |
| 01-14 T3 | 01-14 | 8 | FORM-08 | — | `world.objectives` sobrevive ao round-trip e não é evento drenável | unit | `npx vitest run tests/serialize.test.ts` | ❌ W0 | ⬜ pending |
| 01-11 T3 | 01-11 | 5 | FORM-09 | T-1-04 | Manifesto bom passa; manifesto ruim é recusado com mensagem apontando o campo | integration | `node tools/assets/validate.mjs` | ❌ W0 | ⬜ pending |
| 01-04 T1 | 01-04 | 2 | FORM-10 | — | `stepper.advance(ms)` produz n ticks exatos; `MAX_CATCHUP` respeitado; sem leitura de relógio | unit | `npx vitest run tests/stepper.test.ts` | ❌ W0 | ⬜ pending |
| 01-06 T2 | 01-06 | 4 | FORM-11 | — | Snapshot dos enums: inserir no meio falha, acrescentar no fim passa | unit | `npx vitest run tests/protocol-enums.test.ts` | ❌ W0 | ⬜ pending |
| 01-06 T3 | 01-06 | 4 | FORM-12 | — | Nenhum fonte de `packages/protocol` contém `/\bhost\b/i` fora de comentário | unit | `npx vitest run tests/protocol-vocabulary.test.ts` | ❌ W0 | ⬜ pending |
| 01-05 T3 / 01-08 T2 | 01-05, 01-08 | 3, 4 | (invariante) | — | `packages/sim` mantém `dependencies: {}`; pureza; SCC ≤ 5 | unit | `npx vitest run tests/purity.test.ts` | ⚠️ existe, faltam 3 asserções | ⬜ pending |
| 01-08 T3 | 01-08 | 4 | (invariante) | — | `updateBossPattern`: 10 casos diretos, incluindo o ramo `ring` que hoje nunca executa | unit | `npx vitest run tests/boss.test.ts` | ⚠️ existe, sem cobertura direta | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `vitest.config.ts` — nasce com a extração de workspaces (não existe hoje)
- [ ] `vitest.browser.config.ts` — instâncias chromium / firefox / webkit
- [ ] `.github/workflows/ci.yml` — Node 24, cache de npm e dos navegadores do Playwright
- [ ] `tests/golden/campaign-mage-3000.json` — ouro inicial, gravado **antes** do `math.ts` (para provar que o portão falha) e refeito **depois** (para provar que ele passa)
- [ ] `tools/golden/rebaseline.mjs` — o único caminho auditável para mudar um hash-ouro
- [ ] `tests/cross-engine.test.ts` — FORM-04
- [ ] `tests/math-oracle.test.ts` — FORM-04 (`@stdlib` como oráculo, devDependency)
- [ ] `tests/canonical-order.test.ts` — FORM-02 (critério 4)
- [ ] `tests/serialize.test.ts` — FORM-07 / FORM-08 (critério 3)
- [ ] `tests/input-codec.test.ts` — FORM-06
- [ ] `tests/stepper.test.ts` — FORM-10
- [ ] `tests/protocol-enums.test.ts` + `tests/protocol-vocabulary.test.ts` — FORM-11 / FORM-12
- [ ] `tests/ledger.test.ts` + `tests/ulid.test.ts` — FORM-05
- [ ] `tests/identity.test.ts` — FORM-01
- [ ] `tools/assets/schema/manifest.v1.json` + `tools/assets/validate.mjs` + fixtures boa/ruim — FORM-09
- [ ] `tests/scc.test.ts` — assere que o componente fortemente conexo de `packages/sim` não passa de 5
- [ ] Ampliar `tests/boss.test.ts` com os 10 casos de `updateBossPattern`
- [ ] Ampliar `tests/purity.test.ts`: asserir `dependencies: {}` e apertar o `>= 15` para o número real de arquivos

*Instalação de framework: nenhuma — Vitest já está no projeto. Falta o upgrade para 4.1.11 e os dois pacotes de navegador.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Os três espaços de identidade, a política de merge por campo, o esquema `(temporada, SIM_VERSION)` e as categorias do placar estão **escritos e corretos** | FORM-01 | São ADRs — decisões escritas nesta fase e implementadas nas fases 6, 8 e 9. Um teste consegue asserir que o `World` não carrega `accountId`, mas não que a decisão registrada é a certa | Ler o ADR e confirmar que cada um dos três espaços tem dono, ciclo de vida e regra de travessia declarados; confirmar que nenhuma decisão diz "decidir depois" |
| A spec técnica de assets é **suficiente para outro agente produzir arte em outro repositório** | FORM-09 | O validador de manifesto prova o formato, não a completude semântica. Só um leitor externo revela ambiguidade | Ler `docs/ASSET-SPEC.md` fingindo não conhecer o projeto: toda unidade lógica (pixel por unidade de mundo, origem do sprite, relação hitbox↔sprite, paleta, nomenclatura) tem valor numérico congelado? |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references — cada arquivo listado abaixo nasce num plano desta fase
- [x] No watch-mode flags (`vitest run`, nunca `vitest` sozinho)
- [x] Feedback latency < 3 s por task / < 90 s por wave
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** planejada em 2026-08-31 — 14 planos em 8 waves; ver `.planning/ROADMAP.md` § Phase 1
