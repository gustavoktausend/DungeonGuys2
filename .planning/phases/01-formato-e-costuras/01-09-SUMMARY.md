---
phase: 01-formato-e-costuras
plan: 09
subsystem: sim
tags: [fdlibm, determinismo, ponto-flutuante, trigonometria, ieee-754, stdlib, vitest]

# Dependency graph
requires:
  - phase: 01-05
    provides: "packages/sim como workspace @dg2/sim, com o barrel index.ts como entrada única do bundle"
  - phase: 01-08
    provides: "levelup.ts e o corte do ciclo; tests/scc.test.ts com teto 5 e a contagem exata de arquivos em purity.test.ts"
  - phase: 01-01
    provides: "os três oráculos @stdlib/math-base-special-{sin,cos,atan2} como devDependency"
  - phase: 01-07
    provides: "SIM_VERSION em duas etapas e o sim:version:verify que confirma reprodutibilidade e sensibilidade"
provides:
  - "packages/sim/src/math.ts — port fdlibm vendorizado de sin, cos e atan2, bit-exato em qualquer motor ES2015+"
  - "Domínio restrito asserido: RangeError fora de |x| < 2^20·pi/2, e a mesma guarda também recusa NaN e infinitos"
  - "tests/math-oracle.test.ts — 18 testes de bit-exatidão contra o oráculo, comparados por Object.is"
  - "A base sobre a qual o plano 01-12 troca os 27 call sites e re-baselina o hash-ouro"
affects: [01-12, 01-04, fase-04-netcode, fase-06-ranking]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Módulo folha em packages/sim: zero linha de import, só literais e as views sobre um ArrayBuffer de 8 bytes no tempo de módulo"
    - "Oráculo de port é o mesmo port, nunca o motor: comparação por Object.is, sem tolerância"
    - "Restrição de domínio como asserção que lança, não como comentário"

key-files:
  created:
    - packages/sim/src/math.ts
    - tests/math-oracle.test.ts
  modified:
    - packages/sim/src/index.ts
    - tests/purity.test.ts

key-decisions:
  - "atan fica deliberadamente SEM guarda de domínio — ele não faz redução de argumento e atan2 lhe entrega y/x, um quociente que estoura para infinito sempre que duas entidades estão quase alinhadas num eixo; uma guarda ali recusaria atan2(1, 1e-7), que é um quadro comum do jogo"
  - "Math.round entra no conjunto permitido junto de Math.abs: a ECMA-262 o fixa até a direção do desempate, então não é fonte de divergência entre motores, e rempio2Medium precisa dele para ser bit-idêntico ao oráculo"
  - "REMPIO2_MAX = 1647099 (o inteiro exato de fromWords(0x413921fb, 0)), e não 1647099.3291652855: só o primeiro coincide exatamente com a condição de ramo do e_rem_pio2.c"
  - "Sondagem de endianness no tempo de módulo, em vez de assumir little-endian — duas operações sobre as próprias views, sem chamar nada"
  - "Dois arrays de resto separados (SIN_REMAINDER e COS_REMAINDER) em vez de um compartilhado"

patterns-established:
  - "Port numérico vendorizado: cabeçalho declara a propriedade comprada, as operações permitidas e a fonte de registro função a função"
  - "Corpus de teste determinístico gerado por Rng semeado com literal, cobrindo ramo a ramo a redução de argumento"

requirements-completed: [FORM-04]

# Metrics
duration: 13min
completed: 2026-08-31
---

# Phase 01 Plano 09: Port fdlibm de sin, cos e atan2 Summary

**`packages/sim/src/math.ts` nasce como módulo folha de 577 linhas — sin, cos e atan2 em polinômio JS puro, bit-exatos contra o oráculo fdlibm em 18 testes, com RangeError fora do domínio suportado — sem que nenhum call site seja trocado e com o hash-ouro `d3a93053` intacto.**

## Performance

- **Duration:** 13 min
- **Started:** 2026-08-31T15:14:00Z
- **Completed:** 2026-08-31T15:27:00Z
- **Tasks:** 2
- **Files modified:** 4 (2 criados, 2 modificados)

## Accomplishments

- **A trigonometria do projeto deixou de ser do motor.** `sin`, `cos` e `atan2` transcritos do
  msun do FreeBSD (`s_sin.c`, `s_cos.c`, `k_sin.c`, `k_cos.c`, `e_rem_pio2.c`) e do Go
  (`math/atan.go`, `math/atan2.go`), construídos só sobre `+ − × ÷` e comparações, mais acesso
  a bits por `Float64Array`/`Uint32Array` sobre um `ArrayBuffer` de 8 bytes.
- **Bit-exatidão confirmada na primeira execução**, sem um único ajuste de transcrição: 18 testes
  verdes contra os três oráculos, sobre um corpus de ~2.200 ângulos e ~2.600 pares.
- **Domínio restrito virou asserção.** A metade de argumento grande do `e_rem_pio2.c` (207 linhas
  de multiprecisão, o trecho mais fácil de portar errado) ficou de fora, e no lugar dela há um
  `RangeError` escrito na forma negada — que, de graça, também recusa `NaN` e infinitos em vez de
  deixá-los contaminar o `World` inteiro.
- **A fronteira do plano foi respeitada literalmente:** `git diff` vazio em `arena.ts`, `boss.ts`,
  `combat.ts`, `enemies.ts`, `loot.ts`, `run.ts` e `special.ts`; hash-ouro `d3a93053` e md5
  `2a210c4eeadc15f06f896655eb30ef5b` de `tests/golden/campaign-mage-3000.json` inalterados.

## Task Commits

Cada task foi commitada atomicamente:

1. **Task 1: O teste de oráculo, escrito antes do módulo existir** — `60318d6` (test — portão RED)
2. **Task 2: O port fdlibm com domínio restrito** — `cff4568` (feat — portão GREEN)

Não houve commit de REFACTOR: a transcrição passou bit-exata de primeira e mexer nela depois disso
só adicionaria risco sem melhorar nada.

## Files Created/Modified

- `packages/sim/src/math.ts` (**criado**, 577 linhas) — port vendorizado. Acesso a bits
  (`getHighWord`, `getLowWord`, `fromWords`) com sondagem de endianness; máscaras e constantes
  float64 literais; `kernelSin`, `kernelCos` + `polyvalC13`/`polyvalC46`; `rempio2` e
  `rempio2Medium`; `sin`, `cos`; `atan` + `polyvalP`/`polyvalQ`; `atan2`; `copysign` e `signbit`.
  **Zero linha de `import`.**
- `tests/math-oracle.test.ts` (**criado**, 231 linhas) — FORM-04. 18 testes: bit-exatidão de
  `sin`/`cos`/`atan2` no corpus inteiro, um teste por ramo da redução de argumento, os casos
  especiais de `atan2`, e o bloco de domínio (`2**21`, a borda exata, `NaN`, `±Infinity`, a
  mensagem do erro).
- `packages/sim/src/index.ts` (**modificado**) — uma linha: `export * from './math'`, em ordem
  alfabética entre `./loot` e `./player`.
- `tests/purity.test.ts` (**modificado**) — `EXPECTED_FILE_COUNT` de 26 para 27, com o comentário
  registrando que o arquivo novo é o `math.ts` deste plano.

## Decisions Made

1. **`atan` não recebeu guarda de domínio, ao contrário do que a `<action>` da Task 2 pedia.**
   Ver a deviação 1 abaixo — é a decisão mais importante do plano e a única que muda o desenho.
2. **`Math.round` entrou no conjunto de builtins permitidos.** A prosa do plano diz "só
   `Math.sqrt` e `Math.abs`"; `rempio2Medium` precisa de `round` para ser bit-idêntico ao
   oráculo. A ECMA-262 especifica `Math.round` por completo, inclusive a direção do desempate
   (empate vai para o maior), então ele não é *implementation-approximated* e não é fonte de
   divergência. O § Pattern 1 da pesquisa já o listava entre os `Math.*` "exatos por spec e que
   ficam", e o critério de aceitação (`grep -cE "Math\.(sin|cos|atan2|tan|pow|exp|log|hypot)"`)
   não o inclui. Nota lateral: `Math.sqrt` acabou **não sendo usado** — nenhuma das três funções
   precisa de raiz.
3. **`REMPIO2_MAX = 1647099`, não `1647099.3291652855`.** O exemplo da pesquisa usa o valor
   decimal de 2^20·π/2. O ramo real do fdlibm é `ix < 0x413921fb` sobre a *palavra alta*, e
   `fromWords(0x413921fb, 0)` é exatamente o inteiro 1647099. Com o valor decimal, a faixa
   `[1647099, 1647099.3291652855)` passaria pela guarda e só seria pega mais fundo. Com o
   inteiro, a comparação `!(Math.abs(x) < REMPIO2_MAX)` **é** a condição de ramo, não uma
   aproximação dela. Há um teste dedicado a essa borda.
4. **Sondagem de endianness em vez de assumir little-endian.** `F64[0] = 2` e uma pergunta sobre
   qual lane saiu zero. É a única computação de tempo de módulo além de aritmética de literais,
   e não toca nada fora do arquivo — o módulo continua folha.
5. **Um array de resto por ponto de entrada** (`SIN_REMAINDER`, `COS_REMAINDER`), espelhando o
   oráculo, em vez de um compartilhado. Não podem se intercalar hoje, mas dois arrays literais
   custam 16 bytes e removem a pergunta.
6. **Sem commit de REFACTOR.** O ciclo TDD tem RED e GREEN; a fase de limpeza foi dispensada
   porque a transcrição passou bit-exata sem iteração.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 — Bug] A guarda de domínio NÃO foi colocada em `atan`**

- **Found during:** Task 2 (o port)
- **Issue:** A `<action>` da Task 2 manda pôr a guarda "no topo de `sin`, `cos` e `atan`". Aplicá-la
  em `atan` estaria errado por duas razões independentes. (a) `atan` **não faz redução de
  argumento** — é uma aproximação racional com redução própria de intervalo, exata para qualquer
  entrada finita e para os dois infinitos; a restrição de domínio existe por causa do `rempio2`,
  que `atan` nunca chama. (b) `atan2` alimenta `atan` com `y / x`, e esse quociente estoura para
  `Infinity` sempre que duas entidades estão quase alinhadas num eixo: `atan2(1, 1e-7)` dá 1e7, e
  `atan2(1e300, 1e-300)` dá `Infinity`. Com a guarda em `atan`, um quadro comum do jogo lançaria
  `RangeError` e mataria a partida — e a bit-exatidão contra o oráculo, exigida pela `<behavior>`
  da Task 1, quebraria nesses mesmos pontos.
- **Fix:** A guarda ficou nos dois pontos onde o `rempio2` é de fato alcançado: no topo de `sin` e
  de `cos` (forma negada, que também pega `NaN`), mais um `throw` estrutural no ramo abandonado
  dentro do próprio `rempio2`, documentando exatamente onde o port para. `atan` e `atan2` seguem
  totais, e o JSDoc de `atan` explica em inglês por que a ausência da guarda é deliberada, para
  que ninguém "conserte" isso depois.
- **Files modified:** `packages/sim/src/math.ts`
- **Verification:** `tests/math-oracle.test.ts` cobre o caso explicitamente — "razão íngreme cujo
  quociente estoura para infinito não é recusada", com `atan2(1e300, 1e-300)` e `atan2(1, 1e-7)`
  comparados ao oráculo por `Object.is`; e o corpus de `atan2` inclui 800 pares de razão íngreme.
- **Committed in:** `cff4568`

**2. [Rule 3 — Blocking] Dois critérios de aceitação contradiziam a `<action>` da mesma task**

- **Found during:** Task 2 (verificação)
- **Issue:** O plano manda escrever, em comentário, que `Math.sin`/`Math.cos`/`Math.atan2` são
  proibidos ali e que a fonte foi o `@stdlib` — e depois assere
  `grep -cE "Math\.(sin|cos|atan2|...)" == 0` e "`@stdlib` aparece só no teste". A primeira
  redação do cabeçalho satisfazia a `<action>` e reprovava nos dois greps (3 e 2 ocorrências).
- **Fix:** Reescrevi as três frases do cabeçalho para dizer a mesma coisa sem os tokens literais:
  "a seno, cosseno e arco-tangente de dois argumentos embutidos no motor" em vez das expressões
  de membro, e "os ports JavaScript de referência, que servem de oráculo em
  `tests/math-oracle.test.ts`" em vez do nome do pacote. **A intenção dos dois critérios é
  atendida integralmente** — não há referência de código à trigonometria do motor, e o oráculo é
  nomeado só no teste — e agora a letra também.
- **Files modified:** `packages/sim/src/math.ts`
- **Verification:** os dois greps voltam 0; `grep -rn "@stdlib" packages/ src/` não devolve nada.
- **Committed in:** `cff4568`

**3. [Rule 3 — Nota, não alteração] O critério `grep -c "kernel_rempio2\|payne"`**

- **Found during:** Task 2
- **Issue:** O plano manda documentar por que o kernel de Payne-Hanek não foi transcrito, e
  também assere que esse grep volte 0.
- **Fix:** O comentário no ramo abandonado do `rempio2` escreve **"Payne-Hanek"** com maiúscula (o
  nome próprio, como o próprio plano o escreve) e nunca o identificador `kernel_rempio2`. O grep,
  que é sensível a maiúsculas, volta **0**, e a intenção — *o kernel não foi transcrito* — vale
  literalmente: as 207 linhas não existem no arquivo. Registrado aqui porque, num grep
  `-i`, o critério reprovaria por causa de um comentário que o próprio plano pediu.
- **Files modified:** nenhum (é uma nota sobre a redação)
- **Verification:** `grep -c "kernel_rempio2\|payne" packages/sim/src/math.ts` → 0
- **Committed in:** `cff4568`

---

**Total deviations:** 2 auto-corrigidas (1 bug de desenho, 1 bloqueio de critério) + 1 nota de redação
**Impact on plan:** A deviação 1 é a única de substância e torna o módulo **mais** correto do que o
plano pedia — sem ela, o port passaria nos testes de `sin`/`cos` e quebraria em partida. As outras
duas são de redação de comentário, sem efeito sobre o código emitido. Nenhum aumento de escopo:
nada além de `math.ts`, do barrel, do teste novo e da contagem em `purity.test.ts` foi tocado.

## Issues Encountered

- **`node_modules` não existia no worktree.** Resolvido com `npm ci` (nunca `npm install`, para não
  colidir com os planos 01-10 e 01-11 no `package-lock.json`). Os 153 pacotes transitivos do
  `@stdlib` já estavam no lockfile, vindos do plano 01-01. `package-lock.json` **não foi modificado**.
- **Interop do `@stdlib` com TypeScript.** Os três pacotes usam `export =` e o `tsconfig.json` da
  raiz não liga `esModuleInterop`. Verifiquei antes de escrever o teste, com um arquivo de sonda
  descartado: `moduleResolution: "bundler"` já implica `allowSyntheticDefaultImports`, então o
  `import` default funciona tanto no `tsc` quanto no Vitest. Nenhuma mudança de configuração foi
  necessária — o que importa, porque o `tsconfig.json` é compartilhado.
- **Nenhum problema numérico.** A transcrição bateu bit a bit contra os três oráculos na primeira
  execução, incluindo os ramos de cancelamento exato (`|x| ≈ π/2, π, 3π/2, 2π`), os atalhos de
  argumento minúsculo (2^-26 para `sin`, 2^-27 para `cos`), `sin(-0) = -0` e os quatro pares de
  zeros com sinal do `atan2`.

## Verificação

| Portão | Resultado |
|--------|-----------|
| `npx vitest run tests/math-oracle.test.ts` | **18 passed (18)** |
| `npm test` | **341 passed em 29 arquivos** — baseline 323/28 mais os 18 novos, nenhum perdido |
| `npm run typecheck:sim` | exit 0 |
| `npm run lint` | exit 0 |
| `npm run build` | exit 0 |
| `npm run sim:version:verify` | exit 0 — reprodutível em 3 builds e sensível |
| `git diff --quiet tests/golden/` | exit 0 — **hash-ouro `d3a93053` intacto** |
| md5 de `tests/golden/campaign-mage-3000.json` | `2a210c4eeadc15f06f896655eb30ef5b` — inalterado |
| `git diff --stat` nos 7 arquivos de call site | vazio — nenhum consumidor trocado |
| `npx vitest run tests/scc.test.ts` | verde, teto 5 — o módulo folha não entrou em ciclo nenhum |
| `npm run test:browser` | **6 failed (6)** — vermelho por desenho, como esperado; é o plano 01-12 que o vira |

### Critérios de aceitação, um a um

| Critério | Resultado |
|----------|-----------|
| `grep -cE "toBeCloseTo\|toFixed\|Number.EPSILON" tests/math-oracle.test.ts` | 0 |
| `grep -c "Object.is" tests/math-oracle.test.ts` | 13 (≥ 3) |
| `grep -c "Math.random" tests/math-oracle.test.ts` | 0 |
| `grep -cE "Math\.(sin\|cos\|atan2\|tan\|pow\|exp\|log\|hypot)" packages/sim/src/math.ts` | 0 |
| `grep -c "^import" packages/sim/src/math.ts` | 0 — módulo folha |
| `wc -l packages/sim/src/math.ts` | 577 (entre 400 e 900; a pesquisa estimou ~573) |
| `grep -c "kernel_rempio2\|payne" packages/sim/src/math.ts` | 0 |
| `grep -c "@stdlib" packages/sim/src/math.ts` | 0 — o oráculo só é nomeado no teste |

### `SIM_VERSION` — mudou, e está certo

| | Antes (base 4d09784) | Depois |
|---|---|---|
| Bytes do bundle | 59.895 | **65.225** (+5.330) |
| `SIM_VERSION` | `sha256:87d695907f281755` | **`sha256:f390f346cb595f1d`** |

O valor mudou porque `math.ts` entrou no bundle emitido pelo barrel — exatamente o sinal que o
plano 01-07 construiu o `sim:version:verify` para medir. A ferramenta confirma que o novo valor é
**reprodutível** (três builds, mesmo hash) e **sensível** (perturbar `constants.ts` dá
`sha256:620319149faff51d`). O valor "antes" foi medido neste worktree removendo temporariamente a
linha do barrel e reconstruindo; a linha foi restaurada e o build refeito antes do commit.

## Fronteiras da wave

Nada fora do escopo declarado foi tocado. `package-lock.json` intacto; nenhum arquivo de
`packages/protocol/`, `src/app/input.ts`, `tests/inputLog.ts`, `tests/replayVerify.ts`,
`docs/ASSET-SPEC.md`, `tools/assets/`, `.github/workflows/ci.yml` ou dos *scripts* do
`package.json` da raiz foi alterado. `git status` limpo depois do commit final.

## User Setup Required

Nenhum — não há serviço externo a configurar.

## Next Phase Readiness

- **O plano 01-12 tem tudo de que precisa.** `sin`, `cos` e `atan2` estão exportados por
  `@dg2/sim` e provados bit-exatos. O que falta lá é trocar os 27 call sites (12 `sin`, 12 `cos`,
  3 `atan2`, em `arena.ts`, `boss.ts`, `combat.ts`, `enemies.ts`, `loot.ts`, `run.ts` e
  `special.ts`), acrescentar a regra de lint bloqueando a trigonometria do motor dentro de
  `packages/sim/**`, e re-baselinar o hash-ouro.
- **Separar nascimento de adoção pagou.** Como este plano não trocou call site nenhum, o
  hash-ouro `d3a93053` é a prova de que a mudança de hash do 01-12 virá da trigonometria e de
  mais nada.
- **Ponto de atenção para o 01-12:** ao trocar os call sites, todo ângulo que chegar a `sin` ou
  `cos` passa a ser validado. Isso é o objetivo, mas significa que qualquer caminho que hoje
  produza `NaN` em silêncio (por exemplo uma divisão por zero a montante) vai virar `RangeError`
  visível. Se algum teste da suíte quebrar assim no 01-12, a causa é anterior à trigonometria —
  é um bug que este módulo revelou, não que ele criou.
- **`npm run test:browser` continua vermelho** (6/6) e deve continuar até o 01-12. Ele é o
  critério de sucesso 1 da fase e só fica verde quando a `sim/` de fato usar este módulo.

---
*Phase: 01-formato-e-costuras*
*Completed: 2026-08-31*
