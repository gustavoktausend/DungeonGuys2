---
phase: 3
slug: sala-transporte-e-protocolo
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-09-02
---

# Phase 3 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
> Derivado de `03-RESEARCH.md` § "Validation Architecture". Rótulos de estrutura em inglês
> (lidos por ferramenta); conteúdo em português, como o resto dos documentos do projeto.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 4.1.11 (Node, `vitest.config.ts`) · Vitest browser mode (`vitest.browser.config.ts` — Chromium, Firefox, WebKit) · @playwright/test 1.62.1 (`playwright.config.ts`, `testDir: tests/pwa`) |
| **Config file** | `vitest.config.ts`, `vitest.browser.config.ts`, `playwright.config.ts` — existentes; Wave 0 acrescenta um projeto/`testDir` para `tests/net/*.spec.ts` |
| **Quick run command** | `npx vitest run tests/<arquivo>.test.ts` |
| **Full suite command** | `npm run lint && npm test && npm run test:browser && npm run test:pwa && npm run bench:snapshot && npm run build` |
| **Estimated runtime** | ~1 s por arquivo unitário; `npm test` em segundos; suíte completa com os três motores e o PWA em poucos minutos |

Type gates por pacote: `npm run typecheck:sim`, `typecheck:protocol`, `typecheck:server`, `typecheck:pwa`.

---

## Sampling Rate

- **After every task commit:** Run `npx vitest run tests/<arquivo-tocado>.test.ts` (sub-segundo)
- **After every plan wave:** Run `npm test && npm run typecheck:protocol && npm run typecheck:server` — nas ondas que tocam o codec ou o golden dos enums, acrescentar `npm run test:browser`
- **Before `/gsd:verify-work`:** Full suite must be green — com a exceção nomeada de SALA-04 contra o coturn real, adiada junto com o 02-04
- **Max feedback latency:** 60 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| — | — | — | SALA-01 | T-3-01 (varredura de código) | Código de 6 caracteres, alfabeto sem ambiguidade, único entre salas vivas; normalização de entrada | unit | `npx vitest run tests/room-code.test.ts` | ❌ W0 | ⬜ pending |
| — | — | — | SALA-02 | — | Máquina de estado do lobby sobre `local.ts`: entrar, sair, sala cheia, sala morta | unit | `npx vitest run tests/lobby.test.ts` | ❌ W0 | ⬜ pending |
| — | — | — | SALA-02 | — | Quatro peers se veem no lobby sobre WebRTC real (dois `browserContext`) | e2e | `npx playwright test tests/net/room.spec.ts` | ❌ W0 | ⬜ pending |
| — | — | — | SALA-03 | T-3-07 (`lobbyState` forjado) | Escolha de classe propaga; slots `p0..p3` atribuídos e imutáveis; só a autoridade emite `lobbyState` | unit | `npx vitest run tests/lobby.test.ts -t slots` | ❌ W0 | ⬜ pending |
| — | — | — | SALA-03 | — | `startRun` → `RunConfig` com os quatro; hash do tick 0 confere (D3-05) | unit | `npx vitest run tests/run-config-lobby.test.ts` | ❌ W0 | ⬜ pending |
| — | — | — | SALA-04 | T-3-03 (TURN aberto) | `iceServers` inclui STUN próprio, STUN público e TURN só quando há credencial; HMAC bate com vetor conhecido; TTL correto | unit | `npx vitest run tests/turn.test.ts` | ❌ W0 | ⬜ pending |
| — | — | — | SALA-04 | T-3-04 (SSRF via TURN), T-3-10 (segredo no repo) | `ops/turnserver.conf` tem `use-auth-secret`, todos os `denied-peer-ip`, quotas, `no-cli` e nenhum segredo | unit | `npx vitest run tests/ops-config.test.ts` | ⚠️ existe, casos novos | ⬜ pending |
| — | — | — | SALA-05 | T-3-09 (IP na telemetria) | `routeOf` classifica `relay`/`direct`/`unknown`; `address`/`port` nunca chegam à tabela | unit | `npx vitest run tests/ice-route.test.ts` | ❌ W0 | ⬜ pending |
| — | — | — | SALA-05 | — | RTT: mediana de 5; ping perdido não vira infinito; 3 perdas → "sem resposta" | unit | `npx vitest run tests/ping.test.ts` | ❌ W0 | ⬜ pending |
| — | — | — | SALA-05 | — | Migração `ice_outcome` aplica; INSERT de sucesso e de falha; idempotente por id | unit | `npx vitest run tests/server-migrate.test.ts` | ⚠️ existe, casos novos | ⬜ pending |
| — | — | — | SYNC-04 | T-3-08 (snapshot enorme) | Cada parte < 16 KiB na wave 16 com 4 jogadores (sintético D3-20); decodificador confere contagem declarada antes de alocar | unit | `npx vitest run tests/snapshot-codec.test.ts -t 16` | ❌ W0 | ⬜ pending |
| — | — | — | SYNC-04 | — | Round-trip duplo do codec, idempotência de `extract`, `-0` normalizado (conferido com `Object.is`) | unit | `npx vitest run tests/snapshot-codec.test.ts` | ❌ W0 | ⬜ pending |
| — | — | — | SYNC-04 | — | O particionamento é exercido: um World forçado emite 3 partes | unit | `npx vitest run tests/snapshot-codec.test.ts -t partição` | ❌ W0 | ⬜ pending |
| — | — | — | SYNC-04 | — | Codec produz os mesmos bytes em Chromium, Firefox, WebKit e Node | cross-engine | `npm run test:browser` | ⚠️ existe, caso novo | ⬜ pending |
| — | — | — | SYNC-04 | — | Bench imprime o número no log do CI; run real até a wave 16 fica abaixo do sintético | smoke + unit | `npm run bench:snapshot` · `npx vitest run tests/snapshot-bench.test.ts` | ❌ W0 | ⬜ pending |
| — | — | — | FORM-12 | — | Nenhuma fonte de `packages/protocol` nem de `src/net/` contém "host"; `Transport` não tem `broadcast` | unit | `npx vitest run tests/protocol-vocabulary.test.ts tests/net-vocabulary.test.ts` | ⚠️ / ❌ W0 | ⬜ pending |
| — | — | — | FORM-11 | — | As tabelas de enum batem com o golden, na ordem; cada tabela espelha o tipo do sim | unit | `npx vitest run tests/protocol-enums.test.ts` | ⚠️ existe, tabelas novas | ⬜ pending |
| — | — | — | C-1 / C-2 | — | `dependencies` do jogo e de `packages/protocol` continuam `{}`; `packages/sim` não importa de `net/` | unit | `npx vitest run tests/workspaces.test.ts tests/purity.test.ts` | ⚠️ existe, casos novos | ⬜ pending |
| — | — | — | D3-07 | — | PWA instalado a partir de `/?sala=X` não fixa uma sala no `start_url` | e2e | `npx playwright test tests/pwa/room-url.spec.ts` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

*O planejador preenche `Task ID`, `Plan` e `Wave` ao criar os PLAN.md; os IDs de ameaça
`T-3-nn` seguem a ordem da tabela "Known Threat Patterns" de `03-RESEARCH.md` § Security Domain.*

---

## Wave 0 Requirements

- [ ] `tests/net/helpers.ts` — construtor de par de `Transport` sobre `local.ts`, mais o wrapper semeado de `lossy.ts`; cobre SALA-02, SALA-03
- [ ] `tests/worlds.ts` — construtores de World sintético (wave 1; wave 16 + swarm + elite; wave 40 endless), compartilhados entre teste e bench para que o teto seja um só; cobre SYNC-04
- [ ] `tools/bench/snapshot.mjs` + script `bench:snapshot` em `package.json` + passo em `.github/workflows/ci.yml`; cobre SYNC-04
- [ ] `tests/net-vocabulary.test.ts` — o grep de FORM-12 estendido a `src/net/`
- [ ] Extensão de `tests/purity.test.ts` (`FORBIDDEN_LAYER` ganha `net`) e de `eslint.config.js` (`no-restricted-imports` do sim ganha `**/net/**` e `**/net`); cobre C-2
- [ ] `tests/net/room.spec.ts` sob Playwright com dois `browserContext` no mesmo Chromium — exige um projeto novo em `playwright.config.ts` ou um `testDir` mais largo (decisão do planejador)
- [ ] Nenhuma instalação de framework é necessária: Vitest, browser mode e Playwright já estão no repositório

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| A sala fecha pelo caminho de relay contra o coturn real, entre jogadores atrás de NAT residencial | SALA-04 (critério 3) | Depende da VPS (02-04, adiado); não há como automatizar sem a caixa | Com o coturn no ar: abrir o jogo em duas redes distintas, ligar a flag de debug `iceTransportPolicy: 'relay'` num dos lados, criar e entrar na sala, confirmar "relay" no slot e a linha correspondente em `ice_outcome` |
| Ping e rota aparecem no lobby por slot e no indicador da run | SALA-05 (critério 4) | Leitura visual da tela; o número vem de teste unitário, a apresentação não | Sala com dois peers: conferir o ping numérico e "direto"/"relay" em cada slot do lobby, e o indicador no canto durante a run |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 60s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
