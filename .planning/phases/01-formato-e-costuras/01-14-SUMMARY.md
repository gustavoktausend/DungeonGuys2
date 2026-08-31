---
phase: 01-formato-e-costuras
plan: 14
subsystem: sim
tags: [serializacao, round-trip, sinal-do-zero, objetivos, form-07, form-08, adr-0011, adr-0012, criterio-3]

# Dependency graph
requires:
  - phase: 01-13
    provides: "hashWorld re-chaveando players pela ordem canonica, orderedPlayers e RunConfig.players[] — o corpo que este plano promoveu ao pacote"
  - phase: 01-12
    provides: "world.objectives como campo do World, o hash-ouro 53f86446 e o portao cross-engine verde"
  - phase: 01-10
    provides: "quantize() de @dg2/protocol — a canonizacao na captura que torna o invariante de -0 uma afirmacao sobre o jogo"
  - phase: 01-06
    provides: "a tabela OBJECTIVE_KIND de @dg2/protocol, com a qual a lista do sim agora tem paridade asserida"
  - phase: 01-05
    provides: "packages/sim como workspace @dg2/sim, e o barrel que delimita o SIM_VERSION"
provides:
  - "packages/sim/src/serialize.ts — os DOIS contratos num arquivo, com a diferenca escrita: hashWorld e impressao digital, saveWorld/loadWorld sao lossless"
  - "saveWorld(world): SerializedWorld — JSON-safe, rng virado cursor, config INCLUIDO"
  - "loadWorld(data): World — reconstroi o unico objeto de classe do World por new Rng(0) + restore()"
  - "SerializedWorld = Omit<World,'rng'> & { rng: number } — o tipo do que o formato consegue carregar"
  - "hashWorld deixou de morar em tests/helpers.ts e virou codigo do pacote, entrando no SIM_VERSION"
  - "tests/serialize.test.ts — 16 testes: FORM-07, FORM-08 e os dois contratos"
  - "diffStrict e findNegativeZero: comparacao estrutural por Object.is e varredura de -0, ambas com auto-teste de deteccao"
  - "Paridade EM ORDEM entre ObjectiveKind (sim) e OBJECTIVE_KIND (protocolo), exaustiva nas duas direcoes"
  - "Medicao do World serializado com 4 jogadores, com o formato congelado — o numero que a fase 3 vai precisar"
affects: [fase-03-snapshot, fase-04-netcode, fase-08-missoes, fase-09-replay]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Dois contratos no mesmo arquivo so sao seguros se a diferenca estiver ESCRITA: o cabecalho de serialize.ts nomeia o erro (copiar o replacer inteiro) antes que alguem o cometa"
    - "saveWorld passa por JSON.stringify + JSON.parse de proposito: e o que torna verdadeira a promessa do tipo de retorno, e garante que save->texto->load e save->load sejam o mesmo caminho"
    - "Toda varredura que assere 'lista vazia' planta um caso antes, para provar que consegue achar algum — senao 'nao ha' e 'nao varreu' passam igual"
    - "Uma tabela que existe em dois pacotes que nao podem se importar so nao diverge se um teste importar os dois; Record<Union, number> da a lista de runtime que o tipo nao tem, exaustiva por construcao"
    - "Prova de RED por perturbacao: injetar o defeito que o plano existe para impedir e registrar quantos testes ficam vermelhos"

key-files:
  created:
    - packages/sim/src/serialize.ts
    - tests/serialize.test.ts
  modified:
    - packages/sim/src/index.ts
    - tests/helpers.ts
    - tests/purity.test.ts

key-decisions:
  - "saveWorld NAO canoniza -0, e isso e o oposto de um descuido: se canonizasse, o teste sintetico que prova que a comparacao estrutural pega o que o hash nao pega deixaria de poder existir"
  - "hashWorld tambem nao ganhou normalizacao de -0, apesar da frase do ADR 0011: na rota JSON ela seria comprovadamente no-op, e o corpo tinha de ser movido sem uma alteracao para o ouro nao se mexer"
  - "saveWorld nao re-chaveia players: ordem de chave nao e estado, o JSON preserva a que recebeu, e o fingerprint ja canoniza na hora de hashear — uma definicao de ordem canonica, nao duas"
  - "saveWorld inclui events: 'lossless' e contrato sobre bytes, nao sobre importancia; um snapshot tirado antes de app/ drenar tem de voltar com a mesma forma"
  - "O mundo dos testes passa por startRun, nao so por generateArena: step() sozinho nunca abre uma wave, e um fixture sem isso roda 600 ticks com zero inimigos"
  - "A contagem de tests/purity.test.ts foi de 27 para 28, nao de 26 para 27 como o plano dizia — o numero do plano estava defasado desde o math.ts do plano 01-09"

patterns-established:
  - "O hash nao pode ser a unica testemunha do proprio caminho de serializacao — quando o verificador e o verificado compartilham a rota lossy, e preciso uma segunda testemunha independente"

requirements-completed: [FORM-07, FORM-08]

# Metrics
duration: ~55min
completed: 2026-08-31
---

# Phase 01 Plan 14: Serializacao do World e Objetivos no Round-Trip Summary

`hashWorld` saiu de `tests/helpers.ts` e virou codigo do pacote ao lado de `saveWorld`/`loadWorld`,
com a diferenca entre impressao digital e forma lossless escrita no arquivo — e o round-trip passou
a ser verificado por duas testemunhas independentes, porque a primeira nao consegue ver o furo que
existe nela mesma.

## O ponto do plano, e ele nao e o codigo

O `serialize.ts` novo tem 157 linhas, das quais o corpo de `hashWorld` veio movido sem uma
alteracao. A parte que custou pensamento foi outra: **`hashWorld` e `saveWorld` sao contratos
diferentes que dividem um arquivo**, e a forma de errar e a mais natural que existe — copiar o
replacer de um para o outro. Ele compila. O round-trip continua batendo por hash. E o manifesto da
run desaparece sem barulho.

Entao a diferenca esta escrita duas vezes: no cabecalho do arquivo, nomeando o erro antes de
alguem o cometer, e dentro do proprio `saveWorld`, na linha do unico transform que ele faz.

Nao ficou como afirmacao de comentario. Perturbei o `saveWorld` com exatamente essa exclusao e
rodei a suite: **cinco testes ficaram vermelhos**, incluindo os dois que existem so para esse
contrato. Restaurei o arquivo por `git checkout` e reconferi que `grep -c "key === 'config'"`
voltou a 1 — a exclusao existe num lugar so.

## O furo do `-0`, que e o inverso do que a documentacao herdada diz

O `CLAUDE.md` e a pesquisa herdada dizem que *"`hashWorld` precisa normalizar `-0` para `0`, ou
dois mundos identicos hasheiam diferente"*. Isso esta invertido: `JSON.stringify(-0)` ja produz
`"0"`, entao o hash de hoje e imune ao bug descrito.

**O furo real e pior, e e o motivo de este plano existir.** `JSON.parse(JSON.stringify(-0))`
devolve `+0` — o sinal se perde — e `hashWorld` percorre exatamente o mesmo caminho lossy. Logo um
teste de round-trip *"verificado por hash antes e depois"* **passa com o dado ja corrompido**. O
verificador e o verificado compartilham a rota que perde a informacao.

O teste que prova isso e uma asserção so:

```
expect(hashWorld(back)).toBe(hashWorld(w));                 // o hash nao ve
expect(diffStrict(w, back).join('\n'))
  .toBe('$.players.p1.x: -0 !== 0');                        // a estrutura ve
```

E o invariante do formato (ADR 0011 — canonizar na captura, nao preservar) esta asserido numa run
real, com os inputs passando pelo `quantize` de `@dg2/protocol`, que e o que `app/input.ts` chama
antes de o sim ver qualquer valor. Sem isso o teste falaria de uma rota que jogador nenhum produz.

**A varredura planta um `-0` antes de asserir que nao ha nenhum.** Uma lista vazia devolvida por um
scanner quebrado le exatamente igual a uma lista vazia de uma run limpa; sem o auto-teste, *"nao ha
`-0`"* e *"nao varreu nada"* sao o mesmo teste passando. O mesmo tratamento foi dado a varredura de
JSON-safety: ela roda tambem no `World` **vivo**, onde tem de acusar **exatamente um** infrator —
`$.rng: instância de classe`. Essa linha e a forma executavel da afirmacao que o `loadWorld` faz em
comentario: o `Rng` e a unica instancia de classe do `World`, e por isso o unico revive.

## Medicao do `World` serializado, para a fase 3

Medido com o formato congelado deste plano, `JSON.stringify(saveWorld(w)).length`, 4 jogadores
(mage/archer/warrior/ninja), seed 20260827. **Nenhum destes numeros virou asserção** — eles se
mexem com balanceamento e viveriam quebrando um teste que nao e sobre balanceamento.

| Situacao | Total | players | enemies | obstacles | traps | config | objectives |
|---|---|---|---|---|---|---|---|
| wave 1, 5 inimigos, tick 300 | **14.030 B** | 5.182 | 2.948 | 2.410 | 600 | 549 | 2 |
| wave 16, 9 inimigos (pico), tick 120 | **16.179 B** | 5.045 | 5.427 | 2.411 | 600 | 549 | 2 |
| wave 16, pico observado na amostra (tick 225) | **18.724 B** | 5.241 | 4.890 | 2.411 | 600 | 549 | 2 |

Referencia da pesquisa, com o formato antigo: 12.528 B e 17.744 B. A diferenca esperada e o
`config`, que `saveWorld` inclui por contrato e o `hashWorld` nunca carregou.

Tres fatos uteis para a fase 3:

- **O limite de 16 KiB do DataChannel (16.384 B) e ultrapassado numa wave 16 com 9 inimigos vivos.**
  Nao e um caso extremo construido: e uma wave do meio do jogo com quatro amigos.
- **`obstacles` + `traps` = 3.010 B constantes**, gerados uma vez por `generateArena` e nunca mais
  alterados. Confere com os 3.011 B da pesquisa. Candidatos obvios a sair do snapshot recorrente.
- **`config` = 549 B tambem constantes** por run, e o proprio contrato deste arquivo diz por que
  eles existem — sao a diferenca entre um snapshot e uma impressao digital. Na fase 3 eles cabem no
  handshake da sala, nao em cada snapshot.

## FORM-08 — objetivos, e a tabela que nao pode divergir em silencio

`world.objectives` faz round-trip campo a campo, nasce `[]` em `createWorld` e **`drainEvents` nao
o toca** — que e a forma executavel da excecao deliberada do ADR 0012. A regra do projeto e que
eventos sao a unica saida do sim; objetivo e a excecao, porque o que `app/` drenou nao sobrevive ao
snapshot, e um objetivo alcancado por evento seria inverificavel por replay.

O teste de paridade e o que impede a divergencia entre `ObjectiveKind` (sim) e `OBJECTIVE_KIND`
(protocolo). O sim **nao pode** importar `@dg2/protocol` — `dependencies: {}` em `packages/sim` e
invariante — entao a lista existe duas vezes, e este teste, que importa as duas, e a unica coisa
que as mantem iguais.

O `ObjectiveKind` do sim e um **tipo**, sem lista de runtime. A ponte e um
`Record<ObjectiveKind, number>`, que e exaustivo **por construcao nas duas direcoes**: um `kind`
acrescentado a uniao sem ser listado nao compila, e um listado que nao esta na uniao tambem nao. A
comparacao e **em ordem**, porque `OBJECTIVE_KIND` e append-only e o indice E o valor de fio.

Tambem provado por perturbacao: troquei `'hunt'` por `'purge'` na tabela do protocolo e o teste
ficou vermelho nomeando a ordem divergente. Restaurei por `git checkout`.

## Criterios por `grep` que nao batem literalmente — e por que

Este e o defeito recorrente da fase, e o plano 01-14 traz dois casos:

**1. `tests/purity.test.ts`: o plano manda ir de 26 para 27; o valor real na base era 27.** O
`math.ts` do plano 01-09 ja tinha consumido esse incremento. Fui de **27 para 28**, que e a
intencao (um modulo novo no pacote, mudado no mesmo commit, deliberadamente), e atualizei o
comentario que explica a conta.

**2. `grep -cE "toBeCloseTo|toEqual\(" tests/serialize.test.ts` retorna 1, nao 0.** A unica
ocorrencia e a linha 19 do cabecalho, que **proibe** `toBeCloseTo` — o plano manda escrever a regra
em comentario e depois manda o `grep` da mesma palavra dar zero. A intencao esta satisfeita, e e
verificavel por um grep de call site em vez de um grep de palavra:

```
grep -cE "\.(toEqual|toBeCloseTo)\(" tests/serialize.test.ts   ->  0
```

Zero call sites de `toEqual` e de `toBeCloseTo` no arquivo. Mantive o nome no comentario porque uma
regra que nao da para grepar e uma regra mais fraca.

## Onde eu deliberadamente nao segui uma frase escrita

O ADR 0011 diz, na secao de Consequencia: *"`sim/serialize.ts` precisa normalizar `-0` no hash pelo
mesmo motivo"*. **Nao normalizei, e a decisao esta escrita no cabecalho do arquivo.** Tres razoes,
em ordem de peso:

1. Na rota JSON a normalizacao seria **comprovadamente no-op** — `JSON.stringify` ja colapsa `-0`
   em `"0"`, entao a linha nao mudaria um byte do hash.
2. O plano manda mover o corpo de `hashWorld` **sem uma alteracao**, e a razao dada e exatamente a
   que importa: o hash-ouro e o portao cross-engine nao podem se mexer por causa de uma edicao
   cosmetica.
3. O lugar certo dessa normalizacao e o **codec binario da fase 3**, onde `+0` e `-0` tem padroes
   de bits diferentes em `Float64Array` e a normalizacao deixa de ser no-op. O cabecalho de
   `serialize.ts` diz isso explicitamente, para que a fase 3 encontre a instrucao onde vai precisar
   dela.

Se o revisor discordar, a mudanca e uma linha e o teste de ouro prova em segundos que ela e neutra.

## `RunEnvelope.players` — a questao aberta que o plano 01-13 deixou

Este plano **nao a resolve e nao a piora**. `serialize.ts` nao toca em `packages/protocol`, e
`saveWorld` carrega o `RunConfig` inteiro do `World` sem nenhuma referencia ao `RunEnvelope`.

Registro so o que este trabalho acrescenta a decisao: agora ha uma medicao. `config` serializado
sao **549 B**, e ele e constante durante a run. A redundancia entre `RunEnvelope.players` e
`RunConfig.players` custa esses bytes duas vezes no artefato de run, o que continua sendo pouco
diante do log — ou seja, a medicao **nao** cria urgencia nova para o bump de `RUN_FORMAT_VERSION`.
A decisao segue do orquestrador / do usuario.

## Task-by-task

| Task | O que | Commit | Tipo | Verificacao |
|---|---|---|---|---|
| 1 | `serialize.ts` com os dois contratos; barrel; `helpers.ts` re-exporta; purity 27→28 | `884c102` | feat | 374 passed, tsc 0, lint 0, ouro intacto |
| 2 | FORM-07: round-trip por hash **e** por `Object.is`, RNG, `config`, `-0`, `MAX_SAFE_INTEGER` | `b5b71ce` | test | 385 passed (+11) |
| 3 | FORM-08: objetivos no round-trip, `drainEvents`, paridade com o protocolo, JSON-safety | `8717eb2` | test | 390 passed (+5), 3 motores verdes |

## Verificacao

| Comando | Resultado |
|---|---|
| `npx vitest run` | **390 passed, 34 files** (base era 374 em 33 — nenhum perdido, +16 novos) |
| `npm run test:browser` | **6 passed (6), 3 files** — Chromium, Firefox e WebKit verdes |
| `git diff --quiet tests/golden/` | exit **0** |
| Hash-ouro em `campaign-mage-3000.json` | **`53f86446`** — inalterado |
| `git log -- tests/golden/` | **4 entradas** — inalterado |
| `npx tsc --noEmit` | 0 |
| `npm run typecheck:sim` | 0 |
| `npm run lint` | 0 |
| `npm run build` | 0 |
| `npm run sim:version:verify` | 0 — reprodutivel em 3 builds e sensivel |
| `npx vitest run tests/serialize.test.ts` | **16 passed** |
| `grep -c "export function hashWorld" packages/sim/src/serialize.ts` | 1 |
| `grep -c "export function hashWorld" tests/helpers.ts` | 0 |
| `grep -c "hashWorld" tests/helpers.ts` | 2 (a re-exportacao e o JSDoc dela) |
| `grep -c "key === 'config'" packages/sim/src/serialize.ts` | **1** |
| `grep -c "restore" packages/sim/src/serialize.ts` | 3 |
| `grep -c "Object.is" tests/serialize.test.ts` | 9 |
| `grep -cE "\.(toEqual\|toBeCloseTo)\(" tests/serialize.test.ts` | **0 call sites** |
| `git diff --diff-filter=D` contra a base | vazio — nenhum arquivo apagado |
| `package.json` / `package-lock.json` | **nao modificados** |

**`SIM_VERSION` novo: `sha256:1c42939b1aba2cd9`** (65.969 bytes), antes `sha256:6b911d9a41921637`.
Mudou porque `serialize.ts` entrou no barrel e portanto no bundle — que e o sinal pretendido, nao
um efeito colateral.

## Desvios do plano

**1. [Regra 3 - Bloqueio] `busyWorld` precisava de `startRun`, nao de `generateArena`**

- **Encontrado em:** Task 2
- **Problema:** o plano manda construir o mundo ocupado com o helper existente e 600 ticks. Segui
  o molde do `determinism.test.ts` (`generateArena` + `createPlayer` + `runTicks`) e medi o
  resultado: **wave 0, `waveActive` false, zero inimigos** — e continuava assim no tick 1200.
  `step()` nunca abre uma wave sozinho.
- **Correcao:** a sequencia canonica de inicio de run (`createPlayer` → `startRun`), a mesma que o
  `golden.test.ts` usa e que o `main.ts` faz. No tick 600: wave 1, 2 inimigos, 3 moedas, 25
  obstaculos, 8 armadilhas.
- **Por que importa:** com arrays vazios, todo o resto do arquivo passaria vacuamente. O motivo esta
  escrito no JSDoc do `busyWorld`, com o numero medido, para nao ser reintroduzido.
- **Commit:** `b5b71ce`

**2. [Regra 2 - Correcao critica] Varreduras que asseriam "lista vazia" sem provar que enxergam**

- **Encontrado em:** Tasks 2 e 3
- **Problema:** `findNegativeZero` e a varredura de JSON-safety asseriam listas vazias. Um scanner
  quebrado devolve exatamente a mesma lista vazia. Nao pedido pelo plano, mas e o mesmo defeito que
  este plano inteiro existe para atacar num nivel acima.
- **Correcao:** a varredura de `-0` planta um `-0` e exige encontra-lo antes de asserir que nao ha
  nenhum; a de JSON-safety roda tambem no `World` vivo e exige **exatamente um** infrator
  (`$.rng`), o que de quebra torna executavel a afirmacao de unicidade do `Rng`.
- **Commits:** `b5b71ce`, `8717eb2`

**3. [Criterio defasado] Contagem de `tests/purity.test.ts`**

- 26→27 no plano; o valor real na base era 27 e foi para **28**. Detalhado acima.
- **Commit:** `884c102`

**4. [Criterio contraditorio] `grep -cE "toBeCloseTo|toEqual\("` retorna 1**

- A unica ocorrencia e o comentario que **proibe** o matcher, escrito porque o proprio plano manda
  escreve-lo. Zero call sites. Detalhado acima.
- **Commit:** `b5b71ce`

Nenhum desvio exigiu decisao arquitetural (Regra 4). Nenhum portao de autenticacao ocorreu.

## Known Stubs

Nenhum. `saveWorld`, `loadWorld` e `hashWorld` estao completos e exercitados por dado real; nada
neste plano devolve valor fixo, vazio ou de placeholder.

## Threat Flags

Nenhuma superficie nova. O registro do plano continua coberto:

- **T-1-03 (DoS em `loadWorld` sobre dado nao confiavel):** a reconstrucao e declarativa —
  `JSON.parse` mais um `Rng` revivido. Sem `eval`, sem `new Function`, sem construir classe a partir
  de nome vindo do dado. O trabalho e proporcional ao payload, e o teto de bytes e de ticks vive no
  envelope do plano 01-10.
- **T-1-01 (round-trip corrompido passando no teste de hash):** mitigado pelas duas testemunhas, com
  o caso sintetico de `-0` provando que a segunda pega o que a primeira nao pega.
- **T-1-02 (divergencia entre as tabelas de objetivo):** mitigado pelo teste de paridade em ordem,
  provado vermelho por perturbacao.

## Self-Check: PASSED

Arquivos declarados como criados/modificados, conferidos no disco:

- `packages/sim/src/serialize.ts` — FOUND
- `tests/serialize.test.ts` — FOUND
- `packages/sim/src/index.ts` — FOUND, com `export * from './serialize'`
- `tests/helpers.ts` — FOUND, com a re-exportacao e sem o corpo antigo
- `tests/purity.test.ts` — FOUND, com `EXPECTED_FILE_COUNT = 28`

Commits conferidos em `git log`:

- `884c102` — FOUND
- `b5b71ce` — FOUND
- `8717eb2` — FOUND

Arvore de trabalho limpa antes deste commit; `STATE.md` e `ROADMAP.md` **nao** foram tocados.
