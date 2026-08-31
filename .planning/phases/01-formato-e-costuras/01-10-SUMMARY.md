---
phase: 01-formato-e-costuras
plan: 10
subsystem: protocol
tags: [input-codec, quantizacao, replay, run-envelope, base64, form-06, form-03, criterio-2]

# Dependency graph
requires:
  - "01-04: tests/inputLog.ts (o codec provisório), tests/golden/campaign-mage-3000.json, createStepper().runTicks"
  - "01-06: packages/protocol, PROTOCOL_VERSION, checkVersions, Versions, VersionMismatch"
provides:
  - "`@dg2/protocol` inputCodec: `AIM_STEP`, `TICK_PACKET_BYTES`, `quantize`, `packTick`, `unpackTick`, `encodeLog`, `decodeLog`, `decodeInputRecords`, `recordsToTable`"
  - "`RunEnvelope`, `MAX_RUN_TICKS`, `RUN_FORMAT_VERSION`, `PlayerSlot`: o artefato de run de D-10 com o teto de T-1-03 no formato"
  - "`app/input.ts` quantizando dentro de `collect()`: o float do motor morre na captura"
  - "`tests/replayVerify.ts`: `verifyRunEnvelope` — o critério de sucesso 2 da fase numa função"
  - "`tests/run-envelope-replay.test.ts`: a prova por comando, com a metade negativa asserida"
affects: [01-12, 01-13, 01-14, 04-captura, 09-replay]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Quantizar na captura e nunca no consumo: o que o sim vê já é `n/127` e `i * AIM_STEP`, produtos exatos de inteiro por passo literal"
    - "Uma função pública (`quantize`) e o codec binário compartilham o MESMO par interno `toRecord`/`recordToState` — não há dois caminhos que possam divergir"
    - "Base64 escrito à mão em vez de global de plataforma: o pacote compila e roda nos dois lados sem dependência e sem declaração de ambiente"
    - "Delta e RLE como o mesmo mecanismo visto de dois lados: emitir só quando o pacote muda (delta), guardar o vão como varint de tick (RLE)"
    - "Resultado de verificação como união discriminada com `ticksReplayed` em TODOS os ramos — o campo é o que torna 'não executou nada' asserível"
    - "Teste de costura que lê o hash do ouro em vez de escrever o seu: sobrevive aos re-baselines de 01-12 e 01-13 sem ser editado"

key-files:
  created:
    - packages/protocol/src/inputCodec.ts
    - packages/protocol/src/runEnvelope.ts
    - tests/input-codec.test.ts
    - tests/replayVerify.ts
    - tests/run-envelope-replay.test.ts
  modified:
    - packages/protocol/src/index.ts
    - src/app/input.ts
    - tests/inputLog.ts

key-decisions:
  - "`MAX_RUN_TICKS` e `PlayerSlot` nasceram na Task 1, não na Task 2: `decodeLog` precisa do teto para recusar ANTES de alocar, e um teto duplicado nos dois arquivos seria pior que a antecipação"
  - "A validação de `aim` em `decodeInputRecords` foi alargada para `[-32768, 65535]`: o fixture grava o valor com sinal e o fio carrega o mesmo bit-pattern sem sinal, e `(bits << 16) >> 16` leva os dois ao mesmo ângulo"
  - "`decodeLog` ganhou um segundo guarda não pedido pelo plano — contagem de registros contra bytes recebidos — porque um cabeçalho alegando milhões de registros dentro de oito bytes é a metade barata de T-1-03"
  - "`tests/inputLog.ts` re-exporta também `GoldenSlot`/`GoldenFixture`, não só `decodeInputRecords` e `AIM_STEP`: `golden.test.ts` e `cross-engine.test.ts` importam os tipos de lá e o plano manda não tocá-los"
  - "Dois critérios de aceitação por `grep` do próprio plano eram insatisfazíveis; resolvidos nomeando por descrição, como o plano 01-06 fez quatro vezes"
  - "FORM-03 continua `Pending`: este plano entrega o campo e a recusa, não o artefato gravado com o hash real"

patterns-established:
  - "Envelope JSON legível com um único campo binário (o log em base64), e a recusa de D-11 escrita DENTRO do tipo"

requirements-completed: [FORM-06]

# Metrics
duration: ~30min
completed: 2026-08-31
---

# Phase 01 Plan 10: Codec de Input e a Costura do Critério 2 Summary

**O log de inputs virou dado em vez de cálculo — seis bytes por tick, quantizados na captura,
com `-0` canonizado e `aim` lido como int16 — e o critério de sucesso 2 da fase deixou de ser
satisfeito em pedaços: um comando prova envelope real → `checkVersions` → replay → hash, e prova
que a recusa por versão não executa um único tick.**

## Performance

- **Duration:** ~30 min
- **Tasks:** 4 de 4
- **Files:** 8 (5 criados, 3 modificados)
- **Commits:** 5

## Inventário de portões

| Comando | Estado | Observação |
|---|---|---|
| `npm test` | **VERDE** — 344 passed (30 files) | 323 da base + 15 (codec) + 6 (costura) |
| `npm run build` | **VERDE** — exit 0 | 57 módulos (eram 51: `@dg2/protocol` entrou no grafo do app) |
| `npm run lint` | **VERDE** — exit 0 | |
| `npx tsc --noEmit` | **VERDE** — exit 0 | |
| `npx tsc -p packages/protocol/tsconfig.json --noEmit` | **VERDE** — exit 0 | primeiro import cruzado do pacote resolveu |
| `npx tsc -p packages/sim/tsconfig.json --noEmit` | **VERDE** — exit 0 | |
| `npm run sim:version:verify` | **VERDE** — exit 0 | `sha256:87d695907f281755`, reprodutível e sensível |
| `tests/golden.test.ts` | **VERDE** — 8 passed | `d3a93053` intacto |
| `git diff --quiet tests/golden/` | **exit 0** | md5 `2a210c4eeadc15f06f896655eb30ef5b`, idêntico ao da base |
| `npm run test:browser` | **VERMELHO POR DESIGN** — 6 failed (6) | mesmos números; ver abaixo |

### O vermelho intencional, conferido número a número

| Motor | Hash obtido | Esperado | Checkpoints divergentes | Primeiro tick | Último |
|---|---|---|---|---|---|
| Chromium | `fa099f16` | `d3a93053` | **23/50** | 960 | 3000 |
| Firefox | `fa099f16` | `d3a93053` | **24/50** | 960 | 3000 |
| WebKit | `fa099f16` | `d3a93053` | **24/50** | 960 | 3000 |

Idêntico ao que o plano 01-04 mediu e registrou. Como este plano é dono de `tests/inputLog.ts`,
que o portão consome, o risco real era quebrar a resolução ou a forma do input e mudar o
vermelho — não mudou: o adaptador re-exporta a mesma função sob o mesmo nome e a mesma
assinatura, e o portão continua vermelho **pelo mesmo motivo**, que é o que o plano 01-12 vai
consertar.

## O hash-ouro não se mexeu, e o caminho de produção inteiro foi exercitado

Isto é o achado que mais vale registrar. O teste da Task 4 **não** replaya a forma legível do
ouro: ele monta a tabela (`recordsToTable`), passa por `encodeLog` para o blob base64, coloca o
blob no envelope, e o `verifyRunEnvelope` faz `decodeLog` daquilo antes de rodar os 3.000 ticks.
O resultado bate em `d3a93053` **na primeira execução**, sem ajuste.

Isso só é possível porque a quantização é idempotente por construção, e foi medido antes de ser
assumido, com uma sonda fora da suíte:

- `Math.round((n/127) * 127) === n` para os 255 valores de `n` — **zero** falhas;
- `Math.round((i * AIM_STEP)/AIM_STEP) & 0xffff === q` para os **65.536** códigos — zero falhas;
- 200.000 amostras de um `Rng` semeado com dupla quantização — zero divergências, comparadas com
  `Object.is`, que é o único comparador que enxerga `-0`.

A economia do formato, medida no ouro: **765 registros legíveis → 4.944 bytes de blob**
(6.592 chars de base64) cobrindo 2.997 ticks. O delta derruba as repetições que o fixture
carrega (há registros idênticos em `t=7` e `t=11`, por exemplo) sem mudar um único tick da
visão por tick — que é exatamente a propriedade que faz o hash sobreviver.

## As duas armadilhas que o plano nomeou, fechadas

**Faixa do `aim`.** `round(π/STEP)` é 32768 e `round(−π/STEP)` é −32768 — 65.537 valores para 16
bits, então uma das pontas tem de dobrar. O fio grava `q & 0xffff` e a leitura é `int16`
(`(q << 16) >> 16`), devolvendo `[−π, π)`, o mesmo domínio que `Math.atan2` produz hoje. Há dois
testes fixando isso: `0xFFFF` volta como `-AIM_STEP` (e não como `65535 * AIM_STEP`) e `32768`
volta como `-π`. O comentário no código cita `combat.ts:97-98,111-112` pelo nome, porque é lá que
a contagem de iterações do laço de normalização de ângulo mudaria.

**`-0`.** Confirmado por sonda: `Math.round(-0.4)` é `-0`, e `-0/127` também. O `| 0` depois do
clamp e o `& 0xffff` depois do arredondamento do ângulo canonizam para `+0`, e há teste que
assere `Object.is(q.move.x, -0) === false` **e** `Object.is(q.move.x, 0) === true` — as duas
metades, porque só a primeira passaria com `NaN`.

## A sabotagem controlada da Task 4

Exigida pelo critério de aceitação: mover `checkVersions` para **depois** do replay.

```
FAIL tests/run-envelope-replay.test.ts > a recusa por versão NÃO replaya: zero tick e nenhum hash
AssertionError: expected 3000 to be +0 // Object.is equality
- Expected  0
+ Received  3000
```

Dois dos seis casos ficaram vermelhos (o dedicado e o de `PROTOCOL_VERSION`, que assere a mesma
propriedade). É a **ordem** que está sob teste, e sem `ticksReplayed` nenhum dos dois conseguiria
dizer isso. Desfeita com `git checkout -- tests/replayVerify.ts`; `git status --short` vazio
depois, e a suíte de volta a 344.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 — Ordem de dependência] `runEnvelope.ts` nasceu na Task 1, não na Task 2**

- **Found during:** Task 1
- **Issue:** O `<behavior>` da Task 1 exige que `decodeLog` recuse um log que declare mais ticks
  que `MAX_RUN_TICKS`, mas o plano só cria `MAX_RUN_TICKS` na Task 2. Definir um segundo teto
  dentro de `inputCodec.ts` seria duas fontes para o mesmo número — o tipo de duplicação que o
  ADR 0011 existe para evitar.
- **Fix:** `packages/protocol/src/runEnvelope.ts` nasceu na Task 1 com `RUN_FORMAT_VERSION`,
  `MAX_RUN_TICKS` e `PlayerSlot` (o que o codec consome), e o barrel ganhou as duas linhas de
  `export *` no mesmo commit. A Task 2 completou o arquivo com o tipo `RunEnvelope` e a doutrina
  de D-10/D-11. Mesma forma do desvio nº 4 do plano 01-06, pelo mesmo motivo.
- **Files modified:** `packages/protocol/src/runEnvelope.ts`, `packages/protocol/src/index.ts`
- **Commit:** `06cbcbb`

**2. [Rule 1 — Bug de faixa] A validação de `aim` recusaria o próprio fio**

- **Found during:** Task 1
- **Issue:** O decodificador herdado do plano 01-04 valida `aim` em `[-32768, 32767]`, porque o
  fixture grava o valor **com sinal**. Mas `decodeLog` lê o campo com `getUint16`, que devolve
  `[0, 65535]`. Um log binário legítimo com ângulo negativo seria recusado como inválido.
- **Fix:** faixa alargada para `[-32768, 65535]`, com comentário explicando que as duas grafias
  são o mesmo par de bytes e que `(bits << 16) >> 16` leva ambas ao mesmo ângulo. Recusar uma
  delas faria a forma legível e a forma binária discordarem sobre um log válido.
- **Files modified:** `packages/protocol/src/inputCodec.ts`
- **Commit:** `06cbcbb`

**3. [Rule 2 — Mitigação faltando] `decodeLog` alocava pelo que o cabeçalho alegasse**

- **Found during:** Task 1
- **Issue:** O plano manda `decodeLog` recusar por **ticks**, mas não por **contagem de
  registros**. Um cabeçalho de oito bytes alegando um milhão de registros faz o decodificador
  entrar num laço de um milhão de iterações sobre bytes que nunca foram enviados — custo pago
  por quem verifica, escolhido por quem submete, que é a forma de T-1-03.
- **Fix:** guarda de `count` contra o máximo que os bytes recebidos poderiam conter
  (`(length - 8) / 7`), antes do laço, mais recusa de truncamento no meio de um varint e no meio
  de um pacote. Três testes cobrem isso.
- **Files modified:** `packages/protocol/src/inputCodec.ts`, `tests/input-codec.test.ts`
- **Commit:** `06cbcbb` / `9cc64d4`

**4. [Rule 3 — Critério de aceitação insatisfazível] `grep -c "toBeCloseTo"` deve dar 0, e o
plano manda escrever a proibição**

- **Found during:** Task 4 (na conferência dos greps)
- **Issue:** O plano manda proibir o comparador aproximado **por escrito** e, no mesmo bloco,
  exige `grep -c "toBeCloseTo" tests/input-codec.test.ts` retornando 0. O comentário que explica
  a proibição fazia o grep acusar duas ocorrências.
- **Fix:** o comentário passa a nomear o comparador **por descrição** ("the tolerance-based float
  matcher"), como o plano 01-06 fez quatro vezes. O grep volta a 0 e a doutrina sobrevive
  inteira. O próprio comentário registra por que a redação é cuidadosa.
- **Files modified:** `tests/input-codec.test.ts`
- **Commit:** `b557a47`

**5. [Rule 3 — Critério de aceitação insatisfazível] `grep -c "Math.hypot" src/app/input.ts` não
pode dar 2**

- **Found during:** Task 3
- **Issue:** O critério pede 2. Na base **intocada** o comando já devolve **3**, porque há três
  linhas com `Math.hypot` (`nearestEnemy`, a normalização do teclado e o teste da zona morta do
  joystick) — o próprio plano as cita como `:64,111,113`. `grep -c` conta linhas, não arquivos.
  Satisfazer o número literal exigiria **apagar uma chamada**, que é o oposto exato da intenção
  ("eles **ficam**").
- **Fix:** as chamadas ficaram todas, e o comentário novo de D-05 nomeia as duas funções por
  descrição em vez de por identificador. Resultado: `Math.hypot` = **3** e `Math.atan2` = **2**,
  exatamente os números da base — o grep passa a medir call sites reais em vez de prosa, que é o
  que o critério queria medir.
- **Files modified:** `src/app/input.ts`
- **Commit:** `605a9da`

**6. [Rule 2 — Fronteira de plano] `tests/inputLog.ts` re-exporta mais do que o plano listou**

- **Found during:** Task 2
- **Issue:** O plano manda reduzir o arquivo a um re-export de `decodeInputRecords` e `AIM_STEP`,
  e manda que `golden.test.ts` e `cross-engine.test.ts` **não mudem**. Mas esses dois importam
  também `GoldenFixture` (e, por consequência, `GoldenSlot`) de lá.
- **Fix:** o adaptador re-exporta `decodeInputRecords as decodeInputLog`, `AIM_STEP`,
  `InputRecord` e `PlayerSlot as GoldenSlot`, e declara `GoldenFixture` localmente — porque esse
  tipo carrega `checkpoints`, que D-11 recusa no formato e que portanto **não pode** morar no
  pacote de protocolo. O arquivo tem **15 linhas**, dentro do teto do critério.
- **Files modified:** `tests/inputLog.ts`
- **Commit:** `c5d2805`

**Total:** 6 auto-fixed (1 × Rule 1, 2 × Rule 2, 3 × Rule 3). Nenhuma mudança arquitetural,
nenhum checkpoint humano necessário.

### Acréscimos ao plano, deliberados

- **`recordsToTable` entrou na Task 1**, não na Task 4. O plano prevê o acréscimo ("se
  `inputCodec.ts` ainda não expuser um caminho..."), e antecipá-lo deixou a Task 4 sem código de
  produção novo, como o plano queria.
- **`TICK_PACKET_BYTES` foi exportado** além da lista do plano, para que a asserção de "seis
  bytes" cite a constante do formato em vez de um número mágico no teste.
- **Base64 escrito à mão** (tabela de 64 caracteres, ~35 linhas). As duas alternativas óbvias
  moram em lugares diferentes — um global de página e um buffer do Node — e `packages/protocol`
  tem `lib: ["ES2022"]` e `types: []`, então nenhuma das duas está sequer tipada ali. Trinta e
  cinco linhas compram a promessa de o pacote compilar e rodar nos dois lados sem dependência.

## Decisões de conteúdo que o plano deixou em aberto

- **O formato do blob** é: `u32 LE` de contagem de registros, `u32 LE` de span de ticks, e então
  cada registro como `varint` do delta de tick seguido do pacote de 6 bytes. Delta e RLE são o
  mesmo mecanismo por dois lados: emitir só quando o pacote **muda** (delta) e guardar o vão até
  a próxima mudança **uma vez**, como varint (RLE).
- **`RunEnvelope.seed` é redundante com `config.seed` de propósito**, e o comentário diz qual é
  autoritativo: o verificador constrói o mundo a partir de `config`, então o campo do topo só
  pode ser lido, nunca obedecido. Era isso ou tirar um campo que o D-10 lista.
- **`verifyRunEnvelope` não checa `runFormatVersion`.** O teste checa. Acrescentar uma quarta
  razão de recusa não pedida pelo plano seria decidir, sem dado, o que fazer com um envelope de
  formato antigo — que é decisão da fase 9, quando existir um formato antigo.
- **A ordem `protocol` antes de `sim`** vem de `checkVersions` (plano 01-06) e não foi
  reinventada aqui.

## Files Created/Modified

- **`packages/protocol/src/inputCodec.ts`** — `AIM_STEP`, `TICK_PACKET_BYTES`, `quantize`,
  `packTick`/`unpackTick`, `decodeInputRecords`, `recordsToTable`, `encodeLog`/`decodeLog`, mais
  base64 e varint internos. `quantize` e o codec binário compartilham o mesmo par
  `toRecord`/`recordToState`, então não existem dois caminhos que possam divergir.
- **`packages/protocol/src/runEnvelope.ts`** — `RUN_FORMAT_VERSION`, `MAX_RUN_TICKS` (`60*3600*3`),
  `PlayerSlot`, `RunEnvelope`. A recusa de D-11 está escrita **no tipo**: sem snapshot inicial,
  sem checkpoints periódicos, e com a distinção explícita de que os `checkpoints` de
  `tests/golden/` são dado de teste — que é justamente por onde essa recusa tende a vazar de volta.
- **`packages/protocol/src/index.ts`** — barrel com as duas linhas novas, em ordem alfabética.
- **`src/app/input.ts`** — `collect()` devolve o `InputState` já quantizado. Cabeçalho novo com a
  regra de D-05 e o corolário que ninguém costuma escrever: **no dia em que algum par derivar a
  própria mira do estado do mundo em vez de ler o `InputState` transmitido, o comentário fica
  falso e a garantia de determinismo vai junto.**
- **`tests/inputLog.ts`** — 15 linhas de adaptador.
- **`tests/input-codec.test.ts`** — 15 testes, corpus de `Rng` semeado, `Object.is` em todo lugar.
- **`tests/replayVerify.ts`** — `verifyRunEnvelope`, união discriminada com `ticksReplayed` nos
  quatro ramos.
- **`tests/run-envelope-replay.test.ts`** — os seis casos, com o envelope anotado como
  `RunEnvelope` para que `tsc` cobre a forma.

## Fronteiras de wave respeitadas

`git diff <base> --name-only` lista **exatamente os 8 arquivos** do `files_modified` do plano:

```
packages/protocol/src/index.ts     src/app/input.ts        tests/replayVerify.ts
packages/protocol/src/inputCodec.ts  tests/input-codec.test.ts  tests/run-envelope-replay.test.ts
packages/protocol/src/runEnvelope.ts tests/inputLog.ts
```

Nada de `packages/sim/` (01-09), nada de `package.json` da raiz, `.github/workflows/ci.yml`,
`docs/ASSET-SPEC.md` ou `tools/` (01-11). **`package-lock.json` intocado** — as dependências
vieram de `npm ci`, nunca de `npm install`. `git diff --diff-filter=D` vazio: **zero deleções**
em toda a série. Os três `dependencies: {}` (raiz, sim, protocol) continuam vazios.

## Nota sobre FORM-06 e FORM-03

**FORM-06 está inteiro.** O texto tem três cláusulas e as três estão entregues e testadas:
quantizado na captura antes de o sim ver o valor (`collect()` chama `quantize`); gravado como a
tabela resolvida pela autoridade, **incluindo** a política de preenchimento de buracos (D-04 vive
dentro de `decodeInputRecords`, com teste); e não como o tráfego que chegou (o tipo `InputTable`
é `[tick][jogador]` da tabela consumida, com o motivo escrito).

**FORM-03 continua `Pending`, de propósito.** O texto é "todo artefato de run **carrega** um
`SIM_VERSION` derivado de hash de conteúdo do artefato buildado". Este plano entrega o **campo**
no tipo e a **recusa** costurada de ponta a ponta; o hash real existe desde o plano 01-07
(`sha256:87d695907f281755`), mas **nada grava um envelope de verdade ainda** — isso é a fase 4.
Marcá-lo completo aqui seria a mesma antecipação que os planos 01-05 e 01-06 recusaram fazer.

`REQUIREMENTS.md` **não foi tocado**: três executores em paralelo escrevendo o mesmo arquivo é
conflito garantido. O `requirements-completed: [FORM-06]` do frontmatter é o insumo para a
orquestração marcar centralmente.

## Known Stubs

Nenhum stub de dado — nada aqui renderiza valor vazio nem tem fonte por ligar. Três incompletudes
**declaradas**, todas com dono e prazo escritos no código:

1. **`RunConfig.players` não existe** (nasce no plano 01-13). Enquanto isso, o índice 0 designa o
   slot local, e `runEnvelope.ts` diz isso por extenso em vez de deixar implícito — um zero
   implícito é como dois lados acabam discordando sobre quem é o jogador um.
2. **`RunEnvelope.score` é carregado e não produzido.** O campo existe porque acrescentá-lo depois
   do primeiro replay guardado seria migração; quem o preenche é a fase 4.
3. **O teto de ticks é verificado, não aplicado em toda a sua extensão.** `decodeLog` e
   `verifyRunEnvelope` recusam por contagem; o orçamento de **bytes** e de **tempo de parede** é
   da fase 9, como o próprio registro de ameaças diz.

## Threat Flags

Nenhuma superfície nova de rede, autenticação, acesso a arquivo ou esquema em fronteira de
confiança — nada aqui abre socket nem lê disco. As três mitigações do registro foram
implementadas:

- **T-1-03 (envelope como amplificador de CPU):** `MAX_RUN_TICKS` no formato desde já;
  `decodeLog` recusa por span de ticks **e** por contagem de registros contra os bytes recebidos,
  ambos antes de alocar; `verifyRunEnvelope` recusa por teto com `ticksReplayed: 0`, asserido de
  ponta a ponta.
- **T-1-01 (envelope declarando o `simVersion` do agrado do cliente):** a comparação é
  `checkVersions` contra os valores **próprios** de quem verifica, antes de qualquer
  `createWorld`. Asserido pelos seis casos, e a ordem foi provada por sabotagem.
- **T-1-02 (log adulterado com input impossível):** o clamp de `move` e o domínio de `aim` são
  aplicados **por construção** — um `int8` não tem valor fora de `[-127, 127]` e um `int16` não
  tem valor fora de `[-32768, 32767]`. Não há validador à parte que possa derivar do sim.

## Follow-ups para a orquestração

Nenhum foi feito, porque os arquivos pertencem a outros planos desta wave:

1. **`npm run typecheck:protocol`** ainda não existe no `package.json` da raiz, e o CI ainda não o
   roda. O plano 01-06 já havia registrado isso apontando o 01-07; agora o dono é o **01-11**.
   Com `inputCodec.ts` importando `@dg2/sim` por `import type`, o portão passou a ter conteúdo
   real para vigiar — foi conferido à mão nesta execução (exit 0).
2. **`tests/purity.test.ts` ainda tem a cópia privada de `scan()`** (o follow-up nº 1 do plano
   01-06). Dono: **01-09**, que é quem toca aquele arquivo nesta wave.
3. **`tests/inputLog.ts` pode desaparecer** quando `golden.test.ts` e `cross-engine.test.ts`
   puderem importar de `@dg2/protocol` direto. Não foi feito aqui porque o plano manda não tocar
   nesses dois, e porque `GoldenFixture` precisa de um lar que **não** seja o pacote de protocolo.

## Next Phase Readiness

- **Plano 01-12 (trigonometria):** o teste da Task 4 lê o hash do ouro em vez de escrever o seu,
  então o re-baseline daquele plano não exige editar `tests/run-envelope-replay.test.ts`. O
  `quantize` de `app/input.ts` também não é afetado: ele não chama trigonometria, só arredonda.
- **Plano 01-13 (`RunConfig.players`):** `PlayerSlot` já é a ordem canônica e o byte 5 do pacote
  já indexa nela. Quando `RunConfig.players` nascer, é trocar de onde `RunEnvelope.players` vem —
  o formato do fio não muda.
- **Plano 01-14 (serialize):** `hashWorld` continua importado de `tests/helpers.ts` por
  `replayVerify.ts`; o re-export prometido por aquele plano mantém o import válido.
- **Fase 4 (captura):** a autoridade monta a `InputTable` como a consumiu e chama `encodeLog`. A
  política de buracos já está no formato, então "repetir o último input" não é código de rede a
  escrever — é comportamento do decodificador, já testado.
- **Fase 9 (verificação):** `verifyRunEnvelope` é o esqueleto do worker de replay, com os dois
  guardas na ordem certa. Falta o orçamento de bytes e de tempo de parede.

## Self-Check: PASSED

- Os 5 arquivos criados e os 3 modificados existem em disco (conferido por `git diff --name-only`
  contra a base — a lista tem exatamente 8 entradas).
- Os 5 commits existem no histórico: `9cc64d4`, `06cbcbb`, `c5d2805`, `605a9da`, `b557a47`.
- Sequência de portões TDD da Task 1 presente: `test(01-10)` vermelho (15 falhas) → `feat(01-10)`
  verde (15 passes).
- `.planning/STATE.md`, `.planning/ROADMAP.md` e `.planning/REQUIREMENTS.md` **não** foram tocados.
- `tests/golden/` sem diff e com o md5 da base; `npm test` 344 verde; `build`, `lint`, os três
  `tsc` e `sim:version:verify` em exit 0; `test:browser` vermelho com os mesmos seis números.

---
*Phase: 01-formato-e-costuras*
*Completed: 2026-08-31*
