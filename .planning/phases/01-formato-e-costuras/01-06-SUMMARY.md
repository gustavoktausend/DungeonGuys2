---
phase: 01-formato-e-costuras
plan: 06
subsystem: protocol
tags: [npm-workspaces, protocol, enums, append-only, snapshot, versioning, form-11, form-12]

# Dependency graph
requires:
  - "01-05: packages/sim como pacote, workspaces ligado e o `paths` da raiz onde entra a segunda entrada"
provides:
  - "`@dg2/protocol`: o pacote do fio, com entrada única e `dependencies: {}`"
  - "`PROTOCOL_VERSION`: separado do `SIM_VERSION`, com o motivo escrito no arquivo (D-09)"
  - "`checkVersions`: a recusa de versão pura e total, sem porta dos fundos (D-08)"
  - "`MSG_KIND`, `REJECT_REASON`, `CHANNEL_CLASS`, `OBJECTIVE_KIND`: as quatro tabelas append-only (FORM-11)"
  - "`tests/snapshots/protocol-enums.json`: o ouro das tabelas, fora de `tests/golden/` de propósito"
  - "`tests/scan.ts`: o `scan()` compartilhado, extraído de `tests/purity.test.ts`"
  - "`tests/protocol-vocabulary.test.ts`: FORM-12 virou teste, com detector mais forte que o planejado"
affects: [01-07, 01-12, 01-14]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Array `as const` é a fonte e o tipo é consequência (`typeof T[number]`) — no protocolo a relação se inverte em relação a `packages/sim`, onde a união de string literal é a fonte"
    - "Ouro de tabela em `tests/snapshots/`, separado de `tests/golden/`, para que `git log -- tests/golden/` continue sendo só história de simulação"
    - "Comparação até o maior dos dois comprimentos: append aparece como divergência no próprio índice, não como diferença de cardinalidade"
    - "Ordem de comparação como dado (`AXES`) e não como cadeia de `if` — torna revisável qual descasamento é reportado primeiro"
    - "Teste que guarda o guarda: casos positivos e negativos do detector, para impedir que alguém 'simplifique' o regex de volta ao errado"

key-files:
  created:
    - packages/protocol/package.json
    - packages/protocol/tsconfig.json
    - packages/protocol/src/version.ts
    - packages/protocol/src/enums.ts
    - packages/protocol/src/index.ts
    - tests/protocol-enums.test.ts
    - tests/protocol-vocabulary.test.ts
    - tests/scan.ts
    - tests/snapshots/protocol-enums.json
  modified:
    - tsconfig.json
    - package-lock.json

key-decisions:
  - "O detector de FORM-12 NÃO é `/\\bhost\\b/i` como o plano prescrevia: medido, esse regex não pega `hostName`, que é justamente a forma mais provável de a regra ser quebrada"
  - "`PROTOCOL_VERSION` é anotado `: string` e não deixado com o tipo literal `'1'`, porque é comparado contra strings vindas de máquina remota"
  - "`protocol` é comparada antes de `sim`: a versão de protocolo governa como a mensagem foi enquadrada, então um descasamento de sim reportado sob um de protocolo estaria reportando um campo possivelmente mal lido"
  - "`tests/purity.test.ts` NÃO foi tocado (pertence ao plano 01-08 desta wave); `tests/scan.ts` nasceu com o consumidor novo só, e a troca do import fica como follow-up"
  - "FORM-12 fica Pending: a primeira das três cláusulas do requisito foi entregue, as outras duas são de fase 3"
  - "`REQUIREMENTS.md` não foi tocado — três executores em paralelo escrevendo o mesmo arquivo é conflito garantido; a marcação é da orquestração"

requirements-completed: [FORM-11]

# Metrics
duration: ~15min
completed: 2026-08-31
---

# Phase 01 Plan 06: `@dg2/protocol` Summary

**O pacote do fio nasceu com três coisas e nada mais — versão, tabelas congeladas e uma recusa
sem porta dos fundos — e a sabotagem exigida pelo próprio plano provou que o detector de FORM-12
que o plano prescrevia não pegava `hostName`.**

## Performance

- **Duration:** ~15 min
- **Tasks:** 3 de 3
- **Files:** 11 (9 criados, 2 modificados)

## O achado que justifica a sabotagem controlada existir

O plano manda o teste de FORM-12 procurar `/\bhost\b/i`, e manda provar que ele funciona
plantando `const hostName = 'x';` em `version.ts`. As duas instruções são **incompatíveis**, e só
dá para descobrir isso executando:

```
× o regex não dispara em palavras que apenas contêm host
  expect(FORBIDDEN.test('const hostName = 1;')).toBe(true)
  → expected false to be true
```

`\b` é uma fronteira entre caractere de palavra e não-palavra. Depois de `host` em `hostName` vem
`N`, que é caractere de palavra — **não há fronteira, e não há match**. Com o regex do plano, a
sabotagem passa limpa: `hostId`, `hostName`, `isHost` e `hostPeer` — as quatro formas pelas quais
essa regra realmente seria quebrada na fase 3 — atravessam o portão sem tocar nele. O guarda
existiria, rodaria verde e não guardaria nada.

O substituto (Rule 1 — bug):

```js
const FORBIDDEN = /(?<![A-Za-z])[Hh][Oo][Ss][Tt]|(?<=[a-z0-9])H(?:ost|OST)/;
```

A primeira alternativa pega `host` no **início de um segmento de identificador** em qualquer caixa
— `host`, `Host`, `HOST`, `hostId`, `HostSlot`, `'host'` — sem pegar `ghost`, porque ali o `h` vem
precedido de letra. A segunda pega a corcova camelCase de `isHost` e `roomHost`, e exige `H`
maiúsculo exatamente para que `ghost` continue de fora. **Não há flag `i`**: ela destruiria a
segunda alternativa, fazendo `ghost` casar com `Host`.

Como o erro é sutil e a correção parece complicação gratuita, o teste ganhou um caso dedicado com
oito formas que **devem** ser pegas e quatro que **devem** passar. É o que impede a próxima pessoa
de "simplificar" de volta para o regex bonito e errado.

## Inventário de portões

| Comando | Estado | Observação |
|---|---|---|
| `npm test` | **VERDE** — 307 passed (27 files) | 289 da base + 14 (enums) + 4 (vocabulário) |
| `npx tsc --noEmit` | **VERDE** — exit 0 | |
| `npx tsc -p packages/protocol/tsconfig.json --noEmit` | **VERDE** — exit 0 | |
| `npm run lint` | **VERDE** — exit 0 | |
| `npm run build` | **VERDE** — exit 0 | 51 módulos, idêntico à base |
| `tests/golden.test.ts` | **VERDE** — 8 passed | ainda em `d3a93053`; `git diff --quiet tests/golden/` sai 0 |
| `npm run test:browser` | **VERMELHO POR DESIGN**, intocado | ver abaixo |

O `test:browser` não foi executado, e isso é uma afirmação estrutural, não uma omissão:
`vitest.browser.config.ts` tem `include: ['tests/cross-engine.test.ts']` — **um arquivo só**, que
este plano não toca, assim como não toca `packages/sim/`. Os testes novos ficam no runner de Node
por construção. Não há caminho pelo qual este plano mude aquele resultado.

O build continua em **51 módulos**: `@dg2/protocol` não é importado por nenhum código de app, só
por testes. Correto — a fase 3 é que liga o pacote ao produto.

## As duas sabotagens da Task 2, feitas e revertidas

| Sabotagem | Mensagem obtida |
|---|---|
| `'ping'` entre `'reject'` e `'lobbyState'` | `MSG_KIND[3] divergiu do ouro. ... Se foi inserção no meio ou renomeação, desfaça` |
| `'ping'` no fim de `MSG_KIND` | `MSG_KIND[8] divergiu do ouro. Se a mudança foi um APPEND no fim, atualize tests/snapshots/protocol-enums.json no mesmo commit` |
| ...e depois o ouro atualizado junto | **14 passed** — o append passa quando o ouro acompanha |

O índice sai certo nos dois casos porque a comparação anda até o **maior** dos dois comprimentos.
Se ela parasse no menor e deixasse a cardinalidade para uma asserção separada, o append falharia
com "esperava 8, recebeu 9" — verdadeiro e inútil. O índice é a metade acionável da mensagem.

`grep -n "ping"` nos dois arquivos sai vazio; `git diff --stat packages/protocol/src/version.ts`
saiu vazio depois da sabotagem da Task 3.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 — Bug] O detector de FORM-12 prescrito não pega `hostName`**

- **Found during:** Task 3, na sabotagem que o próprio critério de aceitação exige
- **Issue:** `/\bhost\b/i` não casa com identificadores compostos. A sabotagem obrigatória
  (`const hostName = 'x';`) passava limpa, ou seja, o critério de aceitação do plano era
  insatisfazível com o regex do plano
- **Fix:** detector por início de segmento de identificador mais corcova camelCase, sem flag `i`,
  mais um teste de oito casos positivos e quatro negativos guardando o guarda
- **Files modified:** `tests/protocol-vocabulary.test.ts`
- **Commit:** `cac518a`

**2. [Rule 3 — Bloqueio de fronteira de wave] `scan()` extraído sem religar `purity.test.ts`**

- **Found during:** Task 3
- **Issue:** O plano manda extrair `scan()` para `tests/scan.ts` e fazer **os dois** arquivos
  importarem dela. `tests/purity.test.ts` pertence ao plano 01-08, que executa em paralelo nesta
  wave — editá-lo seria conflito garantido no merge
- **Fix:** `tests/scan.ts` criado com a cópia verbatim e ligado só ao consumidor novo.
  `tests/purity.test.ts` fica intocado e continua com a cópia privada dele. O cabeçalho de
  `tests/scan.ts` **declara a duplicação e o follow-up em voz alta**, para que ninguém leia o
  arquivo como fonte única enquanto não é
- **Files modified:** `tests/scan.ts` (criado)
- **Commit:** `cac518a`

**3. [Rule 2 — Auditabilidade] Três comentários tropeçavam nos próprios greps de aceitação**

- **Found during:** Tasks 1 e 3
- **Issue:** O plano manda escrever a doutrina de D-08 em comentário **e** manda
  `grep -nE "...|bypass|..." version.ts` não retornar nada. A frase "não existe bypass de dev"
  fazia o grep acusar exatamente o que ela nega. Idem para `node:fs` no cabeçalho do teste de
  vocabulário, e idem para a palavra `DOM` no `tsconfig.json` do pacote
- **Fix:** as três frases foram reescritas para nomear as coisas **por descrição** em vez de por
  identificador — "porta dos fundos"/"escape hatch", "o módulo de sistema de arquivos do Node",
  "biblioteca de navegador". A doutrina sobrevive inteira; só o token some. Nos dois casos de
  código, o comentário agora **explica** por que a redação é cuidadosa, para que ninguém
  "melhore" de volta
- **Files modified:** `packages/protocol/src/version.ts`, `packages/protocol/tsconfig.json`,
  `tests/protocol-vocabulary.test.ts`
- **Commits:** `e6b9f3e`, `cac518a`

**4. [Rule 3 — Bloqueio] O barrel só ganhou `./enums` na Task 2**

- **Found during:** Task 1
- **Issue:** O plano manda a Task 1 criar `index.ts` com `export *` de `./version` **e**
  `./enums`, e verifica a Task 1 com `tsc --noEmit`. Como `enums.ts` só nasce na Task 2, a Task 1
  não poderia fechar verde
- **Fix:** `index.ts` nasceu com `./version` só; a linha de `./enums` entrou no commit GREEN da
  Task 2, junto do módulo que ela exporta
- **Files modified:** `packages/protocol/src/index.ts`
- **Commit:** `c6bf968`

**Total:** 4 auto-fixed (1 × Rule 1, 2 × Rule 3, 1 × Rule 2). Nenhuma mudança arquitetural,
nenhum checkpoint humano necessário.

### Um padrão que vale registrar para os planos seguintes

Três dos quatro desvios são a **mesma armadilha**: o plano manda escrever num comentário a palavra
que o critério de aceitação do mesmo plano proíbe. O plano 01-05 já tinha achado a quarta
ocorrência dela (`@dg2/sim/` no cabeçalho do barrel). Vale como regra para quem escrever planos
adiante: **um critério de aceitação por `grep` e uma instrução de documentar a mesma palavra são
requisitos em conflito.** A saída barata é a que foi usada quatro vezes — nomear por descrição —
mas é melhor o plano já pedir isso do que o executor descobrir.

## Decisões de conteúdo que o plano deixou em aberto

- **`REJECT_REASON` ficou nas cinco entradas do plano** (`simVersion`, `protocolVersion`,
  `roomFull`, `roomClosed`, `badCode`), embora o plano diga "pelo menos". Acrescentar razões
  especulativas numa tabela **append-only** é caro: entram no fio para sempre e não saem.
- **`OBJECTIVE_KIND` começa em `none`** para que campo ausente ou zerado decodifique como "sem
  objetivo" em vez de como um objetivo real — o valor seguro é o barato de obter por acidente.
  Há teste fixando isso.
- **`CHANNEL_CLASS` nasce sem política de backpressure**, como o registro de ameaças manda
  (T-1-03, disposição `accept`): a política é decisão medida da fase 4.
- **`checkVersions` compara `protocol` antes de `sim`**, e a ordem vive num array `AXES` em vez de
  numa cadeia de `if`, para que a escolha seja revisável. Há teste fixando a precedência.
- **`kind` amarrado a `REJECT_REASON` por teste**: `${m.kind}Version` tem de existir na tabela.
  Sem isso, os dois vocabulários poderiam divergir e a recusa chegaria ao jogador como uma razão
  que o fio não sabe expressar.

## Nota sobre FORM-12 — por que continua `Pending`

O texto do requisito tem **três** cláusulas: (1) o protocolo não contém a palavra "host";
(2) topologia estrela, uma perna por mensagem; (3) o input da autoridade passa pela mesma tabela
dos remotos.

Este plano entrega a **primeira**, e entrega bem — virou teste, com detector que resiste a
sabotagem. As outras duas são sobre a **forma das mensagens e o caminho do input**, que este plano
explicitamente não cria ("zero linha de rede"). Marcá-lo completo aqui seria a mesma antecipação
que o plano 01-05 recusou fazer com FORM-04.

**FORM-11 está inteiro** — "tabelas congeladas e append-only, verificado por teste de snapshot" é
exatamente o que existe agora.

`REQUIREMENTS.md` **não foi tocado**: três executores em paralelo escrevendo o mesmo arquivo é
conflito garantido. `requirements-completed: [FORM-11]` no frontmatter acima é o insumo para a
orquestração marcar centralmente.

## Fronteiras de wave respeitadas

`git diff --name-only` da base até o HEAD lista 9 arquivos, e **nenhum** pertence aos planos
irmãos: o `package.json` da raiz, `.github/workflows/ci.yml`, `.gitignore`, `tools/sim-version/**`
e `packages/sim/vite.config.ts` (01-07) estão intocados, assim como `packages/sim/src/xp.ts`,
`levelup.ts`, `index.ts`, `tests/scc.test.ts`, `tests/boss.test.ts` e `tests/purity.test.ts`
(01-08). Zero deleções em toda a série de commits.

O `package-lock.json` foi reescrito por `npm install`, como previsto — este é o único plano da
wave que o faz. Os três `dependencies: {}` (raiz, sim, protocol) sobreviveram ao install,
conferidos depois dele.

## Follow-ups para a orquestração

Nenhum destes foi feito, porque os arquivos pertencem a outros planos desta wave:

1. **`tests/purity.test.ts` deveria importar `scan` de `tests/scan.ts`** e apagar a cópia local
   (troca de import, uma linha, mais a remoção da função). Enquanto não acontece, as duas cópias
   têm de continuar idênticas — o cabeçalho de `tests/scan.ts` diz isso.
2. **`npm run typecheck:protocol`** deveria existir no `package.json` da raiz, espelhando
   `typecheck:sim`: `tsc -p packages/protocol/tsconfig.json --noEmit`. O `package.json` da raiz é
   do plano 01-07, então a sugestão fica aqui em vez de no arquivo.
3. **O CI deveria rodar esse script** logo depois de `typecheck:sim`. `.github/workflows/ci.yml`
   também é do 01-07.

## Known Stubs

Nenhum. Este pacote é tipos, tabelas e uma função pura — não renderiza dado, não tem fonte de
dados por ligar e não abre socket. O que parece "não terminado" (nenhum consumidor em runtime) é o
escopo declarado do plano: a fase 3 é que consome.

## Threat Flags

Nenhuma superfície nova de rede, autenticação, acesso a arquivo ou esquema em fronteira de
confiança — nada aqui executa em runtime ainda. As duas mitigações do registro foram
implementadas:

- **T-1-01 (spoofing de versão):** `checkVersions` é pura, total e simétrica; a autoridade passa
  os **próprios** valores como `ours`. Sem flag, sem leitura de ambiente e sem tolerância opcional
  — asserido por `grep` e por teste de simetria. Uma versão forjada só consegue recusar a si
  mesma, nunca alargar o que é aceito.
- **T-1-01 (tampering por reordenação de enum):** ouro versionado em
  `tests/snapshots/protocol-enums.json`, com falha nomeando tabela e índice. Provado por duas
  sabotagens.
- **T-1-03 (backpressure):** `accept`, como planejado. `CHANNEL_CLASS` existe; a política não.

## Task Commits

1. **Task 1** — `e6b9f3e` `feat(01-06)`: pacote, `PROTOCOL_VERSION` e `checkVersions`
2. **Task 2 RED** — `a1bd922` `test(01-06)`: as 14 asserções, vermelhas
3. **Task 2 GREEN** — `c6bf968` `feat(01-06)`: as quatro tabelas e o ouro
4. **Task 3** — `cac518a` `test(01-06)`: FORM-12 e o detector corrigido

## Next Phase Readiness

- **Plano 01-07 (`SIM_VERSION`):** `checkVersions` já tem o campo `sim` esperando o valor por hash
  de conteúdo. Nada em `packages/protocol` precisa mudar quando ele chegar — é só quem monta o
  `Versions` que passa a preencher com o hash real em vez de uma string de teste.
- **Plano 01-14 (serialize):** `OBJECTIVE_KIND` está congelado e na ordem definitiva; é contra
  esta lista que o `ObjectiveKind` de `packages/sim` vai ser comparado.
- **Fase 3 (salas e transporte):** o vocabulário `authority`/`peer`/`slot` está escrito na
  doutrina dos módulos, e o teste de FORM-12 já vigia identificadores compostos — `hostId` não
  passa. `MSG_KIND` cobre o ciclo de sessão inteiro que a fase vai implementar.

## Self-Check: PASSED

- Os 9 arquivos criados existem em disco (conferido por `git diff --name-only` contra a base).
- Os 4 commits existem no histórico: `e6b9f3e`, `a1bd922`, `c6bf968`, `cac518a`.
- Sequência de portões TDD presente: `test(...)` → `feat(...)` na Task 2; a Task 3 é só teste, e
  `test(...)` sozinho é a forma correta para ela.
- `.planning/STATE.md`, `.planning/ROADMAP.md` e `.planning/REQUIREMENTS.md` **não** foram tocados.
- `npm test` 307 verde, `lint` e `build` exit 0, `tests/golden/` sem diff.

---
*Phase: 01-formato-e-costuras*
*Completed: 2026-08-31*
