---
phase: 01-formato-e-costuras
plan: 01
subsystem: testing
tags: [vite, vitest, typescript, eslint, playwright, ci, github-actions, toolchain, stdlib]

# Dependency graph
requires: []
provides:
  - "Toolchain alvo do CLAUDE.md instalada: Vite 7.3.6, TypeScript 6.0.3, Vitest 4.1.11, ESLint 10.9.1, typescript-eslint 8.68.0"
  - "Modo navegador do Vitest com os três motores (Chromium, Firefox, WebKit) provado funcionando"
  - "`vitest.config.ts` (runner de Node) e `vitest.browser.config.ts` (portão cross-engine)"
  - "Script `npm run test:browser`"
  - "`playwright` pinado exato em 1.62.1 — as builds dos motores são a variável sob teste"
  - "`.github/workflows/ci.yml`: o primeiro workflow de teste do repositório, em Node 24"
  - "Convenção escrita de scripts Node em `tools/README.md`"
  - "Oráculo fdlibm (`@stdlib/math-base-special-{sin,cos,atan2}`) disponível como devDependency"
  - "`ajv` disponível para o validador de manifesto de assets"
affects: [01-04-cross-engine, 01-09-sim-math, 01-11-manifesto-de-assets, 01-12-trigonometria, 02-infra]

# Tech tracking
tech-stack:
  added:
    - vite@7.3.6
    - typescript@6.0.3
    - vitest@4.1.11
    - eslint@10.9.1
    - typescript-eslint@8.68.0
    - "@vitest/browser-playwright@4.1.11"
    - playwright@1.62.1 (pin exato)
    - ajv@8.20.0
    - "@stdlib/math-base-special-sin@0.3.1"
    - "@stdlib/math-base-special-cos@0.3.1"
    - "@stdlib/math-base-special-atan2@0.3.1"
  patterns:
    - "Dois configs de teste separados: o que roda em Node exclui explicitamente o que só prova algo em navegador"
    - "`browser.instances` em vez de `test.workspace`: o nome do motor vira o nome do projeto do Vitest"
    - "Chave de cache do CI carrega a versão exata do Playwright lida do `package-lock.json`"
    - "Portão que ainda não passa entra no CI com `continue-on-error` e um comentário apontando o plano que o remove"

key-files:
  created:
    - vitest.config.ts
    - vitest.browser.config.ts
    - tools/README.md
    - .github/workflows/ci.yml
  modified:
    - package.json
    - package-lock.json
    - eslint.config.js

key-decisions:
  - "O `[SUS]` do slopcheck em `vitest` é falso positivo aprovado por revisão humana; a justificativa fica registrada aqui para não reaparecer como novidade a cada re-execução"
  - "`exclude` do runner de Node usa `[...defaultExclude, 'tests/cross-engine.test.ts']` em vez de só o arquivo: sobrescrever `exclude` sem os defaults faria o Vitest varrer `node_modules`"
  - "O cache de navegadores do CI **não** tem `restore-keys`: um fallback entre versões do Playwright compartilharia builds de motores diferentes e invalidaria exatamente o portão que o cache serve"
  - "`\"dependencies\": {}` foi reescrito à mão depois dos `npm i` — o npm remove objetos vazios, e o objeto vazio é invariante declarada no CLAUDE.md"
  - "`tools/` fica fora do `tsc` e fora do ESLint; a cobertura desses scripts vem de rodá-los no CI"

patterns-established:
  - "Convenção de scripts Node: `.mjs` explícito, invocação só por script de `package.json`, falha em `arquivo:ponteiro: mensagem` + exit 1, sucesso em uma linha + exit 0"
  - "Portão de legitimidade de pacote antes de qualquer `npm i`, com o veredito registrado no SUMMARY"

requirements-completed: [FORM-04]

# Metrics
duration: 14min
completed: 2026-08-31
---

# Phase 01 Plan 01: Formato e Costuras — Toolchain e Portão Cross-Engine Summary

**Toolchain do `CLAUDE.md` instalada com o audit zerado, e o modo navegador do Vitest provado subindo Chromium, Firefox e WebKit — o portão de determinismo entre motores agora tem onde rodar.**

## Performance

- **Duration:** ~14 min
- **Started:** 2026-08-31T13:37Z
- **Completed:** 2026-08-31T13:50Z
- **Tasks:** 3 de 3
- **Files modified:** 7 (4 criados, 3 modificados)

## Accomplishments

- **A suíte inteira sobreviveu à troca de toolchain sem uma linha de `src/` alterada**: 271 testes em 23 arquivos continuam verdes saindo de Vite 5.4.9/TS 5.9.3/Vitest 2.1.9 para Vite 7.3.6/TS 6.0.3/Vitest 4.1.11. Essa é a única prova de que o upgrade foi neutro.
- **T-1-06 fechado**: `npm audit` saiu de `3 moderate, 1 high, 1 critical` para **0 vulnerabilities**. O high/critical era o GHSA-fx2h-pf6j-xcff do Vite (bypass de `server.fs.deny` no Windows, que é o SO desta máquina).
- **Os três motores foram provados de verdade, não só configurados** — ver "Verificação extra" abaixo. Isso remove do plano 01-04 o risco de descobrir tarde que o WebKit não sobe nesta máquina.
- **O repositório ganhou seu primeiro workflow de teste.** Antes, os testes só rodavam dentro do job de deploy, em Node 20.

## Task Commits

1. **Task 1: Portão de legitimidade de pacotes** — sem commit (por construção: o critério de aceitação exige zero alteração de arquivo)
2. **Task 2: Subir a toolchain e criar os dois configs de teste** — `3714024` (chore)
3. **Task 3: `ci.yml`, o primeiro workflow de teste** — `933471b` (ci)

## Task 1 — o veredito do `slopcheck`, registrado

O `[SUS]` do `slopcheck` 0.6.1 em `vitest` é **falso positivo aprovado por revisão humana em
2026-08-31**. O motivo da ferramenta é heurística de distância de edição (*"Suspiciously close to
'vite'"*). Três evidências independentes: (a) `vitest@2.1.9` já estava travado em
`package-lock.json`, resolvido de `registry.npmjs.org`, `dev: true` — o pacote "suspeito" é o mesmo
que já sustentava a suíte de testes, e a Task 2 apenas sobe a versão; (b) `repository.url` aponta
para `github.com/vitest-dev/vitest`; (c) `@vitest/browser-playwright@4.1.11` declara peer
`vitest@4.1.11`, mesmo monorepo. Auditoria completa: 12 OK, 1 SUS, 0 SLOP.

As três evidências foram reconferidas contra o registro vivo durante esta execução:

| Evidência | Comando | Resultado |
|---|---|---|
| (a) já estava travado | `grep '"node_modules/vitest"' -A6 package-lock.json` | `2.1.9`, `resolved: registry.npmjs.org`, `dev: true` |
| (b) repositório oficial | `npm view vitest@4.1.11 repository.url` | `git+https://github.com/vitest-dev/vitest.git` |
| (c) mesmo monorepo | `npm view @vitest/browser-playwright@4.1.11 peerDependencies` | `{ vitest: '4.1.11', playwright: '*' }` |

**Metade automatizada do portão:** `git status --porcelain package.json package-lock.json` estava
vazio no início da execução — nenhuma instalação aconteceu antes da aprovação.

**Metade humana:** aprovada pelo desenvolvedor em 2026-08-31, antes desta execução (o executor
anterior parou neste portão e teve o worktree destruído enquanto pausado, sem ter feito nenhum
commit). As 11 versões alvo foram conferidas uma a uma no registro (`npm view <pkg>@<versão> version`)
antes de qualquer `npm i` — todas existem exatamente como planejadas.

## Files Created/Modified

- `vitest.config.ts` — runner de Node; `include` de `tests/**/*.test.ts` e `exclude` de `tests/cross-engine.test.ts` somado aos `defaultExclude`
- `vitest.browser.config.ts` — três instâncias de navegador via `@vitest/browser-playwright`, `headless: true`
- `tools/README.md` — responde às cinco perguntas de convenção de scripts Node que o repositório não respondia
- `.github/workflows/ci.yml` — job `test` em Node 24: `npm ci` → lint → test → cache de navegadores → `playwright install` → `test:browser` (vermelho de propósito) → build
- `package.json` — toolchain alvo, script `test:browser`, `playwright` sem circunflexo, `dependencies: {}` preservado
- `package-lock.json` — 303 pacotes auditados, 0 vulnerabilidades
- `eslint.config.js` — `tools` acrescentado ao `ignores`

## Verificação extra: os três motores foram realmente executados

O plano tolerava que `npm run test:browser` falhasse por ausência de `tests/cross-engine.test.ts`
(que nasce no plano 01-04). Rodando assim, o comando falha com `No test files found`, o que prova
apenas que o config resolve — não que os motores sobem.

Para não empurrar esse risco para o 01-04, criei um `tests/cross-engine.test.ts` **temporário** com
uma asserção trivial (`typeof navigator.userAgent === 'string'`), rodei e **apaguei em seguida**:

```
Test Files  3 passed (3)
     Tests  3 passed (3)
  Duration  7.00s
```

Chromium, Firefox e WebKit sobem, executam e reportam por nome de projeto. O arquivo temporário não
está em nenhum commit — `git status --short` foi conferido antes de commitar a Task 2, e o plano
01-04 encontra o caminho `tests/cross-engine.test.ts` livre.

## Decisions Made

Ver `key-decisions` no frontmatter. O ponto que mais provavelmente surpreende quem ler o `ci.yml`
depois: **o cache de navegadores não tem `restore-keys` de propósito**. `restore-keys` é o padrão em
quase todo workflow com cache, mas aqui um fallback entre versões do Playwright entregaria builds de
motores de outra versão ao job — que é exatamente a variável que o portão cross-engine existe para
controlar.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 — Invariante do CLAUDE.md] `npm` removeu o `"dependencies": {}` do `package.json`**

- **Found during:** Task 2
- **Issue:** O npm apaga objetos vazios do `package.json` ao instalar. Depois do primeiro `npm i -D`, a chave `dependencies` sumiu do arquivo. O CLAUDE.md declara `dependencies` vazio como invariante do projeto ("sem dependências de runtime no jogo publicado"), e o plano tem isso como critério de aceitação explícito.
- **Fix:** Reescrevi `"dependencies": {}` no `package.json`, na posição original (antes de `devDependencies`), junto com a adição do script `test:browser`.
- **Files modified:** `package.json`
- **Verification:** `grep '"dependencies"' -A1 package.json` → `"dependencies": {},`
- **Committed in:** `3714024`

---

**Total deviations:** 1 auto-fixed (1 × Rule 2)
**Impact on plan:** Nenhum desvio de escopo. A correção restaura uma invariante declarada, não adiciona funcionalidade.

## Issues Encountered

**1. A baseline do plano estava desatualizada (244 testes em 21 arquivos).**
Os planos 01-02 e 01-03 já haviam sido mesclados no commit base desta execução, trazendo
`src/app/ulid.ts`, `src/app/ledger.ts`, `tests/ulid.test.ts`, `tests/ledger.test.ts` e `docs/adr/`.
A baseline real e verificada era **271 testes em 23 arquivos**. Medi antes do upgrade (271 verdes,
`tsc` 0, lint 0) e depois (271 verdes) — o número que importa é a igualdade entre os dois, e ela
vale. Nenhum arquivo dos outros planos foi tocado.

**2. O worktree nasce sem `node_modules`.**
Exigiu um `npm ci` completo antes de qualquer coisa, para estabelecer a baseline verde pré-upgrade.
Sem isso não haveria com o que comparar.

**3. TypeScript instalado na baseline era 5.9.3, não o `^5.6.3` declarado.**
Era o risco sinalizado: o `src/app/ulid.ts` do plano 01-03 foi escrito contra o TS 5.9 (que tornou
`Uint8Array` genérico sobre `ArrayBufferLike`). O `npm ci` limpo trouxe 5.9.3 e a baseline saiu
verde; o salto para TS 6.0.3 também passou sem erro. **Nenhuma opção do `tsconfig.json` foi
afrouxada** — `strict`, `noUnusedLocals` e `noUnusedParameters` estão como estavam.

**4. `npm run test:browser` falha hoje, e isso é o comportamento desejado.**
Falha com `No test files found` porque `tests/cross-engine.test.ts` nasce no plano 01-04. No CI o
passo está com `continue-on-error: true` e um comentário apontando o plano 01-12 como o responsável
por remover essa marcação.

## Known Stubs

Nenhum. Este plano não escreve código de produto — o único item deliberadamente incompleto é o passo
`test:browser` do CI, marcado com `continue-on-error` e documentado acima.

## User Setup Required

Nenhuma configuração de serviço externo. O único efeito colateral local é o download dos motores do
Playwright em `~/AppData/Local/ms-playwright` (chromium-1234, firefox-1538, webkit-2336), já
concluído nesta máquina.

## Verificação final

| Portão | Comando | Resultado |
|---|---|---|
| Testes | `npm test` | 271 passed (23 files) |
| Lint | `npm run lint` | exit 0 |
| Tipos | `npx tsc --noEmit` | exit 0 (TypeScript 6.0.3) |
| Audit | `npm audit --audit-level=high` | `found 0 vulnerabilities` |
| Build | `npm run build` | exit 0 (vite v7.3.6, 48 módulos) |
| Navegadores | `npm run test:browser` (com teste temporário) | 3 passed em chromium, firefox, webkit |
| `deploy.yml` | `git status --short` | intocado |

## Next Phase Readiness

**Pronto para o plano 01-04** (o teste cross-engine): o config de navegador existe, os três motores
sobem, e o caminho `tests/cross-engine.test.ts` está livre e já é o único `include` do
`vitest.browser.config.ts` — basta criar o arquivo.

**Pronto para o plano 01-09** (port fdlibm): os três `@stdlib/math-base-special-*` estão instalados
como devDependency e servem de oráculo.

**Pronto para o plano 01-11** (manifesto de assets): `ajv` instalado e a convenção de `tools/`
escrita.

**Atenção para o plano 01-12:** a remoção do `continue-on-error` do passo `test:browser` no
`ci.yml` é critério de aceitação daquele plano, e o comentário no arquivo diz isso.

**Nota para quem for mexer no `tsconfig.json`:** `vitest.config.ts` e `vitest.browser.config.ts`
**não** estão no `include` (que segue `["src", "tests", "vite.config.ts", "eslint.config.js"]`),
então não passam pelo `tsc --noEmit`. Foi decisão de não alargar o `include`, coerente com a regra 4
do `tools/README.md`.

---
*Phase: 01-formato-e-costuras*
*Completed: 2026-08-31*
