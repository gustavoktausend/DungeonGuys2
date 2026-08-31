---
phase: 01-formato-e-costuras
plan: 07
subsystem: build
tags: [sim-version, reprodutibilidade, vite-lib, hash-de-conteudo, ci, form-03, d-06, d-07, d-34]

# Dependency graph
requires:
  - "01-01: .github/workflows/ci.yml, tools/README.md (a convenção de scripts Node), toolchain Vite 7.3.6"
  - "01-05: packages/sim como pacote com entrada única (o barrel packages/sim/src/index.ts é o `entry` deste build)"
provides:
  - "`npm run sim:build`: artefato próprio de `packages/sim` em modo lib, byte-reproduzível — `packages/sim/dist/sim.js`"
  - "`npm run sim:version`: etapa 2 do build, escreve `packages/sim/dist/sim-version.json` com o sha256 do artefato"
  - "`npm run sim:version:verify`: o teste automatizado de FORM-03 — prova reprodutibilidade E sensibilidade"
  - "`SIM_VERSION` com valor real (`sha256:` + 16 hex), a base de D-34 (mudança fecha temporada) e de `checkVersions` (01-06/01-10)"
  - "A fronteira de D-06 escrita no código, em `tools/sim-version/emit.mjs`"
affects: [01-06, 01-10-protocolo, 01-12-trigonometria]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Build em duas etapas para quebrar a circularidade: o hash de um artefato mora num arquivo IRMÃO, nunca dentro do artefato"
    - "O verificador roda a cadeia real (`sim:build` → `emit.mjs`) e lê o JSON emitido, em vez de recalcular o hash do seu jeito — recalcular pararia de testar a ferramenta e passaria a testar a si mesmo"
    - "Perturbação controlada com restauração byte a byte em `try/finally`; nada dentro da janela perturbada pode chamar `process.exit()`, porque sair pula o `finally` e deixa a sonda no disco"
    - "O verificador rebuilda DEPOIS de restaurar, para não deixar `dist/` descrevendo uma árvore que não existe mais"

key-files:
  created:
    - packages/sim/vite.config.ts
    - tools/sim-version/emit.mjs
    - tools/sim-version/verify.mjs
  modified:
    - package.json
    - .gitignore
    - eslint.config.js
    - .github/workflows/ci.yml

key-decisions:
  - "A sonda de sensibilidade é uma constante exportada, NÃO um comentário como o plano pedia — medido: um comentário não move o hash, porque o bundle é minificado. Ver Deviations"
  - "`publicDir: false`: sem isso o build copiava `public/` inteiro (manifest, sw.js, ícones) para dentro de `packages/sim/dist`"
  - "Caminhos do `packages/sim/vite.config.ts` são relativos à RAIZ do repositório: o root `tsconfig.json` type-checa `packages/**` com `types: [\"vite/client\"]` e sem `@types/node`, então um `node:url` ali quebraria o `npm run build`"
  - "`eslint.config.js` ganhou `packages/*/dist`: em flat config o padrão `'dist'` é ancorado na raiz e não pega o `dist` aninhado"
  - "16 caracteres hex do digest (64 bits) — colisão acidental é irrelevante nesta escala, e o valor cabe numa mensagem de erro de tela"

patterns-established:
  - "Sonda de sensibilidade tem que sobreviver ao minificador; comentário não sobrevive"
  - "Verificador de propriedade afirma as DUAS metades na linha de sucesso, com os valores medidos"

requirements-completed: [FORM-03]

# Metrics
duration: ~25min
completed: 2026-08-31
---

# Phase 01 Plan 07: `SIM_VERSION` como hash de conteúdo Summary

**O `SIM_VERSION` deixou de ser uma promessa e virou `sha256:14a0ceb2dd977384` — o hash dos 59.895
bytes que `packages/sim` emite, provado reprodutível e sensível por um comando que roda no CI.**

## A medição, refeita no Vite 7.3.6

A premissa de D-07 tinha sido medida no Vite 5.4.21, antes de o plano 01-01 subir a toolchain e de o
01-05 transformar `src/sim/` em `packages/sim`. Refeita agora, com três `npm run sim:build`
consecutivos:

| | Pesquisa (Vite 5.4.21) | **Agora (Vite 7.3.6)** |
|---|---|---|
| Tamanho de `packages/sim/dist/sim.js` | 55.425 bytes | **59.895 bytes** |
| sha256 (16 hex, o `SIM_VERSION`) | — | **`sha256:14a0ceb2dd977384`** |
| sha256 completo | — | `14a0ceb2dd9773843e8e27d39345ebc175c6fd6720a833b79dbc0cfd8784def0` |
| Três builds seguidos | mesmo hash | **mesmo hash** |
| Caminhos absolutos no artefato | 0 | **0** |
| Módulos transformados | — | **25** |

**A propriedade sobreviveu ao major; o número não.** Os 4.470 bytes a mais não são regressão: são o
esbuild do Vite 7 emitindo diferente do Vite 5, mais os dois módulos que o 01-05 avisou que
entrariam — o próprio barrel `index.ts` e o `types.ts`, que virou módulo de runtime (vazio) porque
`export * from './types'` é sintaticamente re-export de valor. Os 25 módulos batem exatamente com a
contagem de `tests/purity.test.ts`. **Trate 55.425 como data point histórico, não como valor
esperado** — e trate 59.895 do mesmo jeito no dia em que a toolchain subir de novo, que por D-07 é
um evento agendado que fecha a temporada.

**Bônus medido, e ele importa mais do que parece:** o artefato não contém **nenhum byte CR**, mesmo
com `core.autocrlf=true` nesta máquina Windows entregando as fontes com CRLF na árvore de trabalho.
O esbuild normaliza as quebras de linha antes de emitir, então o final de linha do checkout não
vaza para dentro do hash. Sem isso, o mesmo commit daria `SIM_VERSION` diferente no Windows e no CI
Linux, e o handshake de sala (D-08) recusaria dois jogadores do mesmo commit.

## Tasks

| # | Task | Commit | Resultado |
|---|---|---|---|
| 1 | Build em modo lib de `packages/sim`, reproduzível por medição | `7019bcd` | `npm run sim:build` verde, três builds com hash idêntico |
| 2 | `SIM_VERSION` — etapa 2 do build e o verificador de FORM-03 | `f92929b` | `npm run sim:version:verify` verde, afirmando as duas propriedades |

## A circularidade, e como ela foi quebrada

O hash de um artefato não pode morar dentro do artefato: injetá-lo mudaria os bytes e portanto o
hash. Então o build tem duas etapas, e o valor cai num arquivo **irmão**:

```
etapa 1: npm run sim:build   → packages/sim/dist/sim.js          (59.895 bytes)
etapa 2: npm run sim:version → packages/sim/dist/sim-version.json {"simVersion":"sha256:14a0ceb2dd977384","bytes":59895}
```

`grep -c "sim-version.json" packages/sim/dist/sim.js` retorna **0** — o artefato não sabe o nome do
arquivo que o descreve, e é assim que a definição para de se morder. E
`grep -rn "sim-version.json" src packages --include=*.ts` também não retorna nada: **nesta fase
nenhum código de aplicação lê o valor**. Os consumidores são o CI e o verificador; o primeiro
consumidor de produto é o `checkVersions` de 01-06/01-10.

## As duas metades de FORM-03

Nenhuma das duas implica a outra, e o verificador prova as duas com os valores na tela:

```
sim-version ok: reprodutível (sha256:14a0ceb2dd977384 em 3 builds) e sensível
                (perturbar packages/sim/src/constants.ts deu sha256:19709c8d6ba27b35)
```

- **Reprodutível** — dois builds da mesma fonte dão o mesmo valor. Um valor que oscila fecharia a
  temporada no sorteio (D-34) e faria de cada handshake de sala uma moeda ao ar (D-08).
- **Sensível** — uma mudança na simulação sempre muda o valor. Um valor que fica parado enquanto o
  código anda é **pior do que não ter valor**: certificaria dois builds divergentes como a mesma
  era, e a dessincronização apareceria quarenta segundos dentro da partida em vez de na porta.

A perturbação é aplicada em `try/finally` e o arquivo volta byte a byte, inclusive em caso de erro —
`git status --porcelain packages/sim/src` fica vazio depois de rodar. **Nada dentro da janela
perturbada chama `process.exit()`**, porque sair pula o `finally` e deixaria a sonda no disco; os
helpers lançam exceção e quem decide sair é o `catch` de fora.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] A sonda de sensibilidade do plano era um comentário, e um comentário não move o hash**

- **Found during:** Task 2
- **Issue:** o plano manda a perturbação ser "um comentário a um arquivo de `packages/sim/src/`".
  Com `minify: true` — que o mesmo plano exige, e sobre o qual a medição de reprodutibilidade foi
  feita — o esbuild remove comentários antes de os bytes serem hasheados. A asserção de
  sensibilidade falharia **sobre uma propriedade que está funcionando como projetado**.
- **Medido, não suposto:**

  | Estado de `packages/sim/src/constants.ts` | `SIM_VERSION` |
  |---|---|
  | original | `14a0ceb2dd977384` |
  | com `// probe comment` no fim | `14a0ceb2dd977384` — **não mudou** |
  | com `export const __simVersionProbe = 20260831;` no fim | `19709c8d6ba27b35` — mudou |

- **Fix:** a sonda passou a ser uma constante exportada. O barrel faz `export * from './constants'`,
  então ela é export da entrada e o Rollup não pode descartá-la.
- **Consequência, e ela merece estar escrita:** o `SIM_VERSION` segue **código emitido, não texto de
  fonte**. Reformatar um arquivo ou reescrever um comentário **não** fecha a temporada; rebalancear
  um inimigo fecha. Isso é desejável — mas invalida a leitura literal do must-have "uma edição em
  qualquer arquivo de `packages/sim/src` muda o `SIM_VERSION`", que deve ser lido como "qualquer
  edição que mude o código emitido". Registrado no cabeçalho de `emit.mjs` e de `verify.mjs`.
- **Files modified:** tools/sim-version/verify.mjs
- **Commit:** `f92929b`

**2. [Rule 3 - Blocking] O build copiava a PWA inteira para dentro de `packages/sim/dist`**

- **Found during:** Task 1
- **Issue:** com o root do Vite na raiz do repositório, o `publicDir` padrão é o `public/` do jogo, e
  o primeiro `sim:build` deixou `manifest.json`, `sw.js`, `assets/` e `icons/` ao lado de `sim.js`.
  Não contaminava o hash (só `sim.js` é hasheado), mas contamina o diretório que o `emptyOutDir`
  gerencia e confunde quem for auditar o artefato.
- **Fix:** `publicDir: false` no `packages/sim/vite.config.ts`. Uma biblioteca não tem asset
  estático. Depois disso `ls packages/sim/dist` mostra exatamente `sim.js` e `sim-version.json`.
- **Files modified:** packages/sim/vite.config.ts
- **Commit:** `7019bcd`

**3. [Rule 3 - Blocking] O novo artefato quebrou `npm run lint` com 92 erros**

- **Found during:** Task 1
- **Issue:** o `ignores` do flat config é `['dist', 'public', 'node_modules', 'tools']`, e em flat
  config o padrão `'dist'` é **ancorado na raiz** — não pega um `dist` aninhado. O ESLint passou a
  lintar `packages/sim/dist/sim.js` minificado e reportou 92
  `@typescript-eslint/no-unused-expressions` sobre operadores vírgula do esbuild, nenhum dos quais é
  defeito de fonte.
- **Fix:** `'packages/*/dist'` acrescentado ao `ignores`, com o porquê no comentário. Cobre também
  `packages/protocol/dist` quando aquele pacote ganhar build.
- **Verificado que não havia mais nada afetado:** `tests/purity.test.ts` globa
  `../packages/sim/src/**/*.ts` (não alcança `dist`), o `include` do Vitest é `tests/**/*.test.ts`, e
  o `tsc` não compila `.js` sem `allowJs`. Só o ESLint precisava do ajuste.
- **Files modified:** eslint.config.js
- **Commit:** `7019bcd`

**4. [Rule 2 - Missing] O verificador deixava `dist/` envenenado**

- **Found during:** Task 2
- **Issue:** depois da perturbação e da restauração da fonte, `packages/sim/dist/` continuava com o
  bundle **perturbado** e o `sim-version.json` com o hash da sonda. Quem rodasse
  `npm run sim:version:verify` antes de um deploy publicaria um `SIM_VERSION` que não corresponde a
  commit nenhum — um verificador que envenena o que verifica é armadilha.
- **Fix:** `verify.mjs` faz mais um build+emit **depois** de restaurar e assere que o valor voltou a
  ser o primeiro. Isso também é uma terceira prova de reprodutibilidade de graça (daí "em 3 builds"
  na linha de sucesso).
- **Files modified:** tools/sim-version/verify.mjs
- **Commit:** `f92929b`

### Decisões de forma que o plano deixou em aberto

**Caminhos relativos à raiz do repositório, e não ao arquivo de config.** O plano não diz como o
`packages/sim/vite.config.ts` deve localizar sua entrada. O caminho idiomático
(`fileURLToPath(new URL(...))`) **não é utilizável aqui**: o `tsconfig.json` da raiz inclui
`packages`, então o `tsc --noEmit` do `npm run build` type-checa esse arquivo, e o projeto tem
`types: ["vite/client"]` com **nenhum `@types/node` instalado** — um `import ... from 'node:url'`
quebraria o build, e instalar `@types/node` exigiria reescrever o `package-lock.json`, que nesta
wave pertence ao plano 01-06. Então o config usa caminhos relativos ao cwd e o cabeçalho registra
que a única invocação suportada é `npm run sim:build`, que o npm sempre roda da raiz. Os scripts de
`tools/` **não** têm essa limitação (não são type-checados, por `tools/README.md` §4) e usam
`import.meta.url` como o `tools/golden/rebaseline.mjs` já fazia.

## Files Created/Modified

- **`packages/sim/vite.config.ts`** (novo) — `build.lib` com `entry` no barrel, `formats: ['es']`,
  `fileName` fixo em `sim.js`, `target: 'es2022'`, `sourcemap: false`, `minify: true`,
  `emptyOutDir: true`, `publicDir: false`. O cabeçalho registra que a reprodutibilidade é
  **requisito** e cita a medição.
- **`tools/sim-version/emit.mjs`** (novo) — sha256 de `node:crypto` sobre os **bytes** do bundle.
  O cabeçalho escreve a fronteira de D-06 (o hash cobre o que o barrel alcança: `sim/` + `sim/defs/`
  + constantes; HUD, áudio e sprite ficam de fora **por construção**, não por regra que alguém
  precisa lembrar) e a exceção conhecida que o plano 01-12 resolve (`STAT_LABELS` e `PCT_STATS` são
  vocabulário de HUD e hoje entram no hash). Registra também por que o valor não vem de metadado de
  arquivo: um carimbo de tempo não sobrevive a `git clone`.
- **`tools/sim-version/verify.mjs`** (novo) — o teste automatizado de FORM-03. Segue
  `tools/README.md`: `.mjs`, invocado por script de `package.json`, `console.error` no formato
  `arquivo:ponteiro: mensagem` + `exit 1` na falha, **uma** linha em `stdout` no sucesso (a saída dos
  processos filhos é capturada, não repassada). Usa `execFileSync(process.execPath, [...])` com
  argumentos literais, como o `rebaseline.mjs` — sem shell, sem superfície de injeção.
- **`package.json`** — `sim:build`, `sim:version`, `sim:version:verify`; `build` encadeado para
  `sim:build` → `sim:version` → `tsc --noEmit` → `vite build`. `"dependencies": {}` preservado.
- **`.gitignore`** — `packages/sim/dist` explícito (já coberto pelo `dist/`, mas o artefato é a
  ENTRADA do `SIM_VERSION` e commitá-lo deixaria um hash velho sobreviver ao código que ele descreve).
- **`eslint.config.js`** — `packages/*/dist` no `ignores` (ver deviation 3).
- **`.github/workflows/ci.yml`** — `npm run sim:version:verify` depois de `npm test`.
  **O passo `test:browser` foi preservado como estava**, com `continue-on-error: true`: ele é o
  portão cross-engine de 01-04, vermelho de propósito até 01-12, e a remoção daquele
  `continue-on-error` continua sendo critério de aceitação daquele plano — não deste.

## Verification

| Portão | Comando | Resultado |
|---|---|---|
| Reprodutibilidade (3 builds) | script de medição + `sim:version:verify` | **mesmo sha256 nas três** |
| Sem caminho absoluto | `grep -cE "[A-Za-z]:\\\\|/home/|/Users/" packages/sim/dist/sim.js` | **0** |
| Sem sourcemap | `ls packages/sim/dist/*.map` | **nada** |
| Sem byte CR | `node -p "...includes(13)"` | **false** |
| FORM-03 | `npm run sim:version:verify` | **exit 0**, afirma reprodutível E sensível |
| Fonte restaurada | `git status --porcelain packages/sim/src` | **vazio** |
| Hash não mora no artefato | `grep -c "sim-version.json" packages/sim/dist/sim.js` | **0** |
| Nenhum consumidor de app | `grep -rn "sim-version.json" src packages --include=*.ts` | **nada** |
| CI | `grep -c "sim:version:verify" .github/workflows/ci.yml` | **1** |
| `.gitignore` | `grep -c "packages/sim/dist" .gitignore` | **1** |
| Suíte de Node | `npm test` | **289 passed (25 files)** — baseline intacto |
| Lint | `npm run lint` | **exit 0** |
| Build encadeado | `npm run build` | **exit 0**, app em 51 módulos (igual à base) |
| Hash-ouro | `tests/golden/campaign-mage-3000.json` | **`d3a93053`**, intocado |
| Lockfile | `git diff HEAD -- package-lock.json` | **vazio** (usei `npm ci`) |

`npm run test:browser` continua **vermelho de propósito** (6 failed) — portão de 01-04, resolvido em
01-12. Nada aqui o tocou.

## Known Stubs

Nenhum. O plano não deixa placeholder: o `SIM_VERSION` tem valor real, medido, e os dois comandos
que o produzem e o verificam rodam de verdade.

A única dívida registrada é a **exceção de D-06 já conhecida e já atribuída**: `STAT_LABELS` e
`PCT_STATS` são vocabulário de HUD e hoje entram no hash, porque o barrel os alcança. Está escrita no
cabeçalho de `emit.mjs` e o plano 01-12 a resolve junto com o re-baseline.

## Threat Flags

Nenhuma superfície nova. As três entradas do registro STRIDE do plano ficaram cobertas:

- **T-1-01 (SIM_VERSION forjado)** — o valor é derivado do **próprio** artefato de quem verifica, por
  `sha256` de `node:crypto`. Nada nesta fase aceita um `SIM_VERSION` vindo de fora.
- **T-1-05 (toolchain mudando o artefato em silêncio)** — `sim:version:verify` no CI detecta perda de
  reprodutibilidade no PR que a causar. E este plano já é a primeira demonstração viva da
  consequência aceita por D-07: **o Vite 5 → 7 mudou o artefato de 55.425 para 59.895 bytes**.
- **T-1-06 (caminho absoluto vazando)** — `sourcemap: false` + verificação explícita por `grep`, mais
  o `publicDir: false` que tirou do diretório arquivos que não deveriam estar lá.

## Notes para os próximos planos

- **01-06 / 01-10 (`checkVersions`):** o valor a comparar sai de
  `packages/sim/dist/sim-version.json`, campo `simVersion`, formato `sha256:` + 16 hex. Ele **não**
  está importável por código de app hoje; quem for consumi-lo precisa decidir como o valor entra no
  bundle do cliente (provavelmente `define` do Vite ou um módulo gerado), e essa é uma decisão de
  produto que este plano deliberadamente não tomou.
- **01-12 (trigonometria):** ao trocar `Math.sin`/`cos`/`atan2` por `sim/math.ts`, o `SIM_VERSION`
  **vai mudar** — é o comportamento correto, e é a hora de re-baselinar o hash-ouro e resolver a
  exceção de `STAT_LABELS`/`PCT_STATS`. Registre o novo `sha256:` no summary daquele plano, como
  este registrou o seu.
- **Quem subir Vite ou TypeScript:** o `sim:version:verify` **não** vai falhar (ele prova
  reprodutibilidade dentro de uma execução, não estabilidade entre versões). O que muda é o valor.
  Por D-07/D-34, isso fecha a temporada — trate como evento agendado e registre o antes e o depois.

## Self-Check: PASSED

- `packages/sim/vite.config.ts` — FOUND
- `tools/sim-version/emit.mjs` — FOUND
- `tools/sim-version/verify.mjs` — FOUND
- `.planning/phases/01-formato-e-costuras/01-07-SUMMARY.md` — FOUND
- commit `7019bcd` — FOUND
- commit `f92929b` — FOUND
