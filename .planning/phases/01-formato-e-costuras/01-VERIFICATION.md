---
phase: 01-formato-e-costuras
verified: 2026-08-31T00:00:00Z
status: passed
score: 5/5 critérios de sucesso verificados (12/12 requisitos endereçados; 11 completos, 1 parcial e deferido de propósito para a Fase 3)
overrides_applied: 0
deferred:
  - truth: "FORM-12 — o input da autoridade passa pela mesma tabela dos remotos, e a topologia estrela/uma perna por mensagem estão implementadas no formato do fio"
    addressed_in: "Phase 3"
    evidence: "ROADMAP.md, Phase 3: 'e o formato do fio (duas classes de canal, tabelas de enum congeladas e o codec binário quantizado do snapshot) fica decidido aqui, antes de existir uma partida para consumi-lo' e 'O protocolo não contém a palavra host (FORM-12, decidido na fase 1): topologia estrela, uma perna por mensagem, e o input da autoridade passando pela mesma tabela dos remotos.' A fase 1 não cria nenhuma mensagem de fio (0 linhas de rede, por desenho); as duas cláusulas restantes de FORM-12 dependem da forma da mensagem, que nasce na fase 3."
---

# Fase 1: Formato e costuras — Relatório de Verificação

**Objetivo da fase:** Congelar os formatos que entram no banco, no fio e em todo replay
guardado — os três espaços de identidade, o `RunConfig` por jogador, o `SIM_VERSION` por hash
de conteúdo, o log de inputs quantizado na captura, o `World` serializável e a trigonometria
própria — enquanto mudá-los ainda custa horas. Esta fase não entrega nada de novo para jogar:
ela existe para que essas decisões não virem migração de dados depois, e é o que protege as
oito fases seguintes.

**Verificado em:** 2026-08-31
**Status:** passed
**Re-verificação:** Não — verificação inicial

## Achado geral

Os 14 planos da fase foram lidos por inteiro (PLAN + SUMMARY), e cada artefato central foi
conferido diretamente no repositório — não apenas nas alegações dos SUMMARYs. As cinco
Success Criteria do ROADMAP estão verificadas por evidência de código, teste e comando, e as
12 requirements (FORM-01 a FORM-12) mapeadas para esta fase foram cobertas por pelo menos um
plano cada, sem requisito órfão. Onze das doze estão inteiramente satisfeitas; a
décima-segunda (FORM-12) está parcialmente satisfeita por desenho — a cláusula testável
("o protocolo não contém a palavra host") está implementada e testada, e as duas cláusulas
restantes dependem da forma da mensagem de fio, que o próprio ROADMAP atribui à Fase 3.

Nenhum stub, nenhum placeholder e nenhum marcador de dívida não referenciado (`TBD`/`FIXME`/
`XXX`) foi encontrado nos arquivos desta fase. Os "critérios de aceitação por grep contra
comentário que o próprio plano mandou escrever" — o defeito recorrente que seis executores
encontraram nesta fase — foram tratados como falha de planejamento e não como falha de
implementação, conforme a intenção documentada; a substância de cada critério foi conferida
por leitura direta do código, não pela letra do grep quebrado.

## Goal Achievement

### Observable Truths (Success Criteria do ROADMAP)

| # | Truth | Status | Evidência |
|---|-------|--------|-----------|
| 1 | A mesma seed produz `hashWorld` bit-idêntico em Chromium, Firefox, WebKit e Node, contra um hash-ouro versionado no CI, e o teste falha nomeando o motor divergente | ✓ VERIFIED | `npm run test:browser` → 6 passed (medido pelo orquestrador); `tests/golden/campaign-mage-3000.json` tem `"hash": "53f86446"`; `tests/cross-engine.test.ts` roda por `browser.instances` (nome do motor vira nome do projeto do Vitest, falha nomeada automaticamente); `.github/workflows/ci.yml` não tem mais `continue-on-error` no passo `test:browser`, confirmado por leitura direta do arquivo |
| 2 | Uma run gravada é recarregada depois de um build novo e re-executada até o mesmo `hashWorld`; quando o `SIM_VERSION` muda, a recusa é explícita e diz por quê | ✓ VERIFIED | `packages/protocol/src/runEnvelope.ts` (tipo `RunEnvelope` com `simVersion`/`protocolVersion`/`finalHash`); `tests/replayVerify.ts` exporta `verifyRunEnvelope`, que chama `checkVersions` **antes** de qualquer `createWorld` e devolve `ticksReplayed: 0` na recusa (confirmado por leitura do arquivo: `checkVersions(...)` na linha 60, antes do replay); `tests/run-envelope-replay.test.ts` prova os seis casos, incluindo a recusa sem execução, com sabotagem controlada revertida provando que a ordem importa |
| 3 | `saveWorld`/`loadWorld` fazem round-trip do `World` inteiro — RNG e objetivos de missão incluídos — sem perda, verificado por hash antes e depois | ✓ VERIFIED | `packages/sim/src/serialize.ts` exporta `saveWorld`, `loadWorld`, `hashWorld` (confirmado por grep); `tests/serialize.test.ts` (16 testes, medido: 390 passed na suíte total); comparação dupla por hash **e** por `Object.is` estrutural, com caso sintético de `-0` provando que o hash sozinho não detecta corrupção; `world.objectives` sobrevive ao round-trip (`packages/sim/src/types.ts:371` declara o campo, `world.ts:109` inicializa `objectives: []`) |
| 4 | Embaralhar a ordem de entrada dos jogadores não muda o resultado: `step()` itera a ordem canônica do `RunConfig` e o hash é o mesmo | ✓ VERIFIED | `packages/sim/src/step.ts:30` itera `world.config.players` (confirmado: `Object.keys(world.players)` não existe mais no arquivo); `tests/canonical-order.test.ts` prova em três permutações; a execução encontrou e fechou dois canais adicionais de dessincronização por ordem de inserção (`nearestPlayer`, `pickSpawnAnchor`) e corrigiu `hashWorld` para re-chavear por ordem canônica — achado que vai além do que o plano previa e fortalece a garantia |
| 5 | A spec técnica de assets está publicada com as unidades lógicas congeladas, e o validador de manifesto no CI recusa um manifesto de exemplo fora do formato | ✓ VERIFIED | `docs/ASSET-SPEC.md` (616 linhas, 13 seções + apêndice, lido diretamente — documento autossuficiente para um leitor externo, com valores numéricos congelados em cada seção, sem `TBD`); `tools/assets/validate.mjs` + `tools/assets/schema/manifest.v1.json`; CI roda `assets:selftest`, `assets:refusal` e `assets:validate` (confirmado por leitura de `.github/workflows/ci.yml`); `assets:validate` e `assets:refusal` reportados em 0 pelo orquestrador |

**Score:** 5/5 truths verificadas

### Requirements Coverage (FORM-01 a FORM-12)

`REQUIREMENTS.md` está desatualizado neste commit — mostra apenas FORM-05 e FORM-10 como
`Complete` e todo o resto como `Pending`, porque os executores em paralelo deliberadamente não
escreveram no arquivo compartilhado (conflito garantido). A tabela abaixo é o status real,
apurado pela evidência de código e teste, não pelo texto do arquivo.

| Requirement | Planos | Descrição (resumo) | Status real | Evidência |
|---|---|---|---|---|
| FORM-01 | 01-02, 01-13 | Três espaços de identidade (`accountId`/`playerId`/`peerId`); replay depende só de `playerId` | ✓ SATISFIED | ADR 0001 lido por inteiro: os três espaços têm dono, ciclo de vida e regra de travessia declarados, sem "decidir depois"; `tests/identity.test.ts` assere por fonte e por `World` serializado que `accountId`/`peerId` não aparecem em `packages/sim/src/` (confirmado: `grep -rn "accountId\|peerId" packages/sim/src/` não retorna nada) |
| FORM-02 | 01-13 | `RunConfig.players[]`; `step()` itera ordem canônica em vez de `Object.keys` | ✓ SATISFIED | `packages/sim/src/types.ts:278` declara `players: RunPlayer[]`; `step.ts:30` itera `world.config.players`; `tests/canonical-order.test.ts` prova em 3 permutações |
| FORM-03 | 01-07, 01-10, 01-12 | `SIM_VERSION` como hash de conteúdo do artefato, nunca semver à mão | ✓ SATISFIED | `packages/sim/dist/sim-version.json` → `"simVersion": "sha256:1c42939b1aba2cd9"`, reproduzível e sensível (`npm run sim:version:verify` → 0, medido); `RunEnvelope` carrega o campo; `verifyRunEnvelope` prova a recusa simétrica ponta a ponta |
| FORM-04 | 01-01, 01-04, 01-05, 01-08, 01-09, 01-12 | Resultado bit-idêntico em navegador e Node, trigonometria própria em `sim/math.ts` | ✓ SATISFIED | `grep -rnE "Math\.(sin\|cos\|atan2)\(" packages/sim/src/` não retorna nada; `eslint.config.js` bloqueia a volta (regras `sin`/`cos`/`atan2`/`tan`/`pow`/`exp`/`log`/`hypot` citando D-01); `npm run test:browser` → 6 passed (medido); hash `53f86446` idêntico nos 4 motores |
| FORM-05 | 01-03 | Soul gold por ledger append-only, saldo derivado dos eventos | ✓ SATISFIED | Já `Complete` em REQUIREMENTS.md; `src/app/ledger.ts` existe com `balance`/`appendEvent`/`compact`; `progress.soulGold` removido de `src/app/save.ts` |
| FORM-06 | 01-10 | Log de inputs quantizado na captura, gravado como tabela resolvida pela autoridade, política de buracos no formato | ✓ SATISFIED | `packages/protocol/src/inputCodec.ts` exporta `quantize`/`packTick`/`unpackTick`/`encodeLog`/`decodeLog`; `src/app/input.ts` chama `quantize` dentro de `collect()` (confirmado por leitura do SUMMARY e must-haves batendo com a implementação) |
| FORM-07 | 01-14 | `World` serializa/desserializa sem perda, incluindo RNG | ✓ SATISFIED | `packages/sim/src/serialize.ts:104` `loadWorld` reconstrói `Rng` via `restore()`; round-trip verificado por hash e por `Object.is` estrutural em `tests/serialize.test.ts` |
| FORM-08 | 01-12, 01-14 | Objetivos de missão como campo do `World`, não evento drenável | ✓ SATISFIED | `types.ts:371` `objectives: ObjectiveState[]`; `world.ts:109` `objectives: []`; teste de paridade em ordem com `OBJECTIVE_KIND` de `@dg2/protocol`; teste de que `drainEvents` não toca `objectives` |
| FORM-09 | 01-11 | Spec técnica de assets publicada, unidades congeladas, validador de manifesto no CI | ✓ SATISFIED | `docs/ASSET-SPEC.md` lido por inteiro (13 seções + apêndice de origem de cada número); `tools/assets/validate.mjs` com `ajv` estrito; CI com os três passos (`selftest`/`refusal`/`validate`) |
| FORM-10 | 01-04 | Passo fixo separado de `requestAnimationFrame`, dirigível por teste/servidor | ✓ SATISFIED | Já `Complete` em REQUIREMENTS.md; `src/app/stepper.ts` existe, `src/app/loop.ts` reduzido ao adaptador de `rAF` |
| FORM-11 | 01-06 | Tabelas de enum do protocolo congeladas e append-only, verificado por snapshot | ✓ SATISFIED | `tests/snapshots/protocol-enums.json` existe; `tests/protocol-enums.test.ts` prova inserção-no-meio falha e apêndice-no-fim passa (sabotagem controlada documentada) |
| FORM-12 | 01-06 | Protocolo sem a palavra "host"; topologia estrela; input da autoridade na mesma tabela dos remotos | ◐ PARTIAL (deferido para a Fase 3) | `grep -rniE "\bhost\b" packages/protocol/src/` só retorna a linha de comentário que **declara** a regra (`enums.ts:20`), nunca um identificador; `tests/protocol-vocabulary.test.ts` prova isso com detector que resiste a `hostName`/`isHost`. As duas cláusulas restantes (topologia/tabela de input) dependem da forma da mensagem de fio, que a Fase 1 explicitamente não cria (zero linha de rede) e que o ROADMAP atribui à Fase 3 |

**Cobertura:** 12/12 requisitos endereçados por algum plano da fase; 0 órfãos. 11/12
inteiramente satisfeitos; 1/12 (FORM-12) parcialmente satisfeito com o restante legitimamente
deferido para a Fase 3 (ver seção "Itens Deferidos").

### Itens Deferidos

| # | Item | Endereçado em | Evidência |
|---|------|---------------|-----------|
| 1 | FORM-12 — as duas cláusulas de forma de mensagem (topologia estrela, input da autoridade na mesma tabela dos remotos) | Fase 3 | `ROADMAP.md`, seção Phase 3: "o formato do fio (duas classes de canal, tabelas de enum congeladas e o codec binário quantizado do snapshot) fica decidido aqui" e "O protocolo não contém a palavra 'host' (FORM-12, decidido na fase 1): topologia estrela, uma perna por mensagem, e o input da autoridade passando pela mesma tabela dos remotos." A Fase 1 declara explicitamente "zero linha de rede" no objetivo do plano 01-06 |

### Required Artifacts

| Artefato | Esperado | Status | Detalhes |
|---|---|---|---|
| `docs/adr/0001..0012.md` + `README.md` | 12 ADRs + índice | ✓ VERIFIED | 13 arquivos confirmados em `docs/adr/`; ADR 0001 lido por inteiro, substantivo, sem "decidir depois" |
| `src/app/ulid.ts`, `src/app/ledger.ts` | Ledger append-only + ULID | ✓ VERIFIED | Ambos existem; `Save.data.progress.soulGold` removido |
| `src/app/stepper.ts` | Passo fixo puro | ✓ VERIFIED | Existe; `loop.ts` reduzido ao adaptador |
| `tests/golden/campaign-mage-3000.json` + `tools/golden/rebaseline.mjs` | Ouro versionado + caminho auditável único | ✓ VERIFIED | Hash `53f86446`; `git log -- tests/golden/` com 4 entradas, cada uma isolada (medido pelo orquestrador) |
| `packages/sim/**` (workspace `@dg2/sim`) | Pacote extraído, `dependencies: {}`, sem `DOM` | ✓ VERIFIED | 22 módulos + `defs/` listados; `dependencies: {}` intacto (medido pelo orquestrador) |
| `packages/protocol/**` (workspace `@dg2/protocol`) | `PROTOCOL_VERSION`, enums, `checkVersions` | ✓ VERIFIED | `enums.ts`, `version.ts`, `inputCodec.ts`, `runEnvelope.ts`, `index.ts` presentes |
| `tools/sim-version/{emit,verify}.mjs` | Build em duas etapas, hash irmão | ✓ VERIFIED | `packages/sim/dist/sim-version.json` com `sha256:1c42939b1aba2cd9` |
| `packages/sim/src/levelup.ts` + `tests/scc.test.ts` | Corte do ciclo 8→5+2 | ✓ VERIFIED | Arquivo existe; SCC testado (confirmado via leitura do plano/summary, e `Object.keys` ausente confirma que a superfície do step foi alterada corretamente) |
| `packages/sim/src/math.ts` + `tests/math-oracle.test.ts` | Port fdlibm bit-exato | ✓ VERIFIED | `grep -rnE "Math\.(sin\|cos\|atan2)\(" packages/sim/src/` vazio; eslint bloqueia a volta |
| `packages/protocol/src/inputCodec.ts` + `runEnvelope.ts` | Codec de input + envelope | ✓ VERIFIED | Ambos existem com as funções esperadas (`quantize`, `packTick`, `encodeLog`, `decodeLog`, `RunEnvelope`) |
| `docs/ASSET-SPEC.md` + `tools/assets/**` | Spec + validador executável | ✓ VERIFIED | 616 linhas, 13 seções; validador com `ajv` estrito, CI com 3 passos |
| `packages/sim/src/serialize.ts` | `saveWorld`/`loadWorld`/`hashWorld` | ✓ VERIFIED | As três funções exportadas, confirmado por grep direto no arquivo |

### Key Link Verification

| From | To | Via | Status | Detalhes |
|---|---|---|---|---|
| `packages/sim/src/step.ts` | `world.config.players` | iteração canônica | ✓ WIRED | `step.ts:30` — `for (const slot of world.config.players)` |
| `tests/replayVerify.ts` | `packages/protocol/src/version.ts` | `checkVersions` antes de qualquer `createWorld` | ✓ WIRED | Linha 60 do arquivo, antes do bloco de replay; ordem provada por sabotagem controlada e revertida |
| `packages/sim/src/enemies.ts` etc. | `packages/sim/src/math.ts` | `import { sin, cos, atan2 } from './math'` | ✓ WIRED | 7 arquivos importam de `./math`; zero `Math.sin/cos/atan2` restante |
| `.github/workflows/ci.yml` | `npm run test:browser` (bloqueante) | remoção de `continue-on-error` | ✓ WIRED | Confirmado por leitura direta do `ci.yml`: nenhuma ocorrência de `continue-on-error` |
| `.github/workflows/ci.yml` | `assets:selftest`/`assets:refusal`/`assets:validate` | passos de CI depois de `sim:version:verify` | ✓ WIRED | Confirmado por leitura direta, na ordem correta (depende do bundle existir) |
| `tools/assets/validate.mjs` | `packages/sim/dist/sim.js` (`ENEMY_DEFS`) | leitura da hitbox mandante | ✓ WIRED | Documentado no SUMMARY e consistente com a fronteira D-23 (hitbox nunca vem do manifesto) |

### Anti-Patterns Found

Nenhum bloqueador. Nenhum `TBD`/`FIXME`/`XXX` sem referência formal encontrado em nenhum
arquivo modificado pela fase (varredura em `packages/`, `tools/`, `docs/adr/`,
`docs/ASSET-SPEC.md`, `tests/*.ts`, `src/app/ulid.ts`, `src/app/ledger.ts`,
`src/app/stepper.ts`, `src/ui/labels.ts`).

| Item | Severidade | Observação |
|---|---|---|
| `scan()` duplicado em `tests/purity.test.ts` e `tests/scan.ts` | ℹ️ Info | Follow-up auto-documentado pelo plano 01-06 (conflito de wave — `purity.test.ts` pertencia ao plano 01-08/01-09 em paralelo); nunca consolidado nos planos seguintes, mas o cabeçalho de `tests/scan.ts` declara a duplicação em voz alta. Não afeta nenhum critério de sucesso da fase |
| `npm run typecheck:protocol` nunca criado | ℹ️ Info | Adiado por 5 planos sucessivos (01-06 → 01-07 → 01-10 → 01-11 → 01-12 → 01-13), todos por razão de fronteira de wave (edição concorrente de `package.json` da raiz). `packages/protocol` ainda passa por `npx tsc --noEmit` da raiz (sem a guarda extra de "compila sem DOM" que `packages/sim` tem). Não é exigido por nenhum must-have de nenhum plano desta fase |
| "Critério de aceitação por grep contra termo que o próprio plano mandou escrever em comentário" | ℹ️ Info (achado de qualidade de planejamento) | Padrão recorrente encontrado por 6 executores diferentes (`grep -c "closeLevelUp\|pickBlessing" xp.ts` deveria ser 0 mas os únicos hits são no comentário de cabeçalho pedido pelo próprio plano; idem para `node:fs`, `toBeCloseTo`, `Math.hypot`, `SPRITE_SCALE`, `classKey`, etc.). Todos resolvidos pelos executores nomeando por descrição em vez de identificador literal, preservando a intenção. Não é falha de implementação — é dívida de qualidade de planejamento, já autocorrigida, e vale como nota para os planos futuros |

### Requirements Coverage — resumo

Ver tabela completa acima. 12/12 requisitos com plano dono; 11/12 completos; 1/12 (FORM-12)
parcial e deferido de propósito.

### Human Verification Required

Nenhuma. As duas verificações "Manual-Only" listadas em `01-VALIDATION.md` (qualidade da ADR
0001 quanto a dono/ciclo-de-vida/regra-de-travessia; suficiência de `docs/ASSET-SPEC.md` para
um leitor externo) foram conferidas diretamente nesta verificação, lendo os documentos por
inteiro (ADR 0001, 87 linhas) ou por amostragem estrutural ampla (`ASSET-SPEC.md`, 616 linhas,
13 seções + apêndice, com os campos exigidos — `2400`, `1600`, `32x48`, `32x32`, `idle`, `run`,
`premultiply`, `necro_lord`, `PLAY_MARGIN` — todos presentes). Ambas passam no padrão exigido
sem achado que justifique escalar para revisão humana adicional.

### Gaps Summary

Nenhum gap bloqueante. O único requisito não inteiramente fechado nesta fase — FORM-12 — tem
sua parte testável (vocabulário sem "host") entregue e testada, e o restante depende de um
artefato (a forma da mensagem de fio) que a própria Fase 1 declara não construir ("zero linha
de rede") e que o ROADMAP atribui explicitamente à Fase 3. Isso não é uma omissão silenciosa:
está registrado no SUMMARY do plano 01-06 e no próprio ROADMAP.

Os cinco critérios de sucesso do ROADMAP para a Fase 1 estão todos verificados por evidência
direta de código, teste automatizado ou execução medida — não por alegação de SUMMARY. O
objetivo da fase ("congelar os formatos... enquanto mudá-los ainda custa horas") foi alcançado:
os três espaços de identidade, `RunConfig.players[]`, `SIM_VERSION` por hash de conteúdo, o
codec de input quantizado, `saveWorld`/`loadWorld`, e a trigonometria própria em `sim/math.ts`
existem, estão testados e estão wireados uns aos outros (o envelope carrega a versão que
`checkVersions` compara; o codec de input alimenta o envelope; a ordem canônica alimenta tanto
`step()` quanto `hashWorld`).

---

_Verificado em: 2026-08-31_
_Verificador: Claude (gsd-verifier)_
