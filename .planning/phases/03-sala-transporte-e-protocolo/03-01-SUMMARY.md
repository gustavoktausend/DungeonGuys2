---
phase: 03-sala-transporte-e-protocolo
plan: 01
subsystem: protocol
tags: [wire-format, enums, room-code, signaling, webrtc, ice, crockford-base32]

# Dependency graph
requires:
  - phase: 01-marco-0
    provides: "packages/protocol com enums.ts, version.ts, inputCodec.ts e runEnvelope.ts; packages/sim com ENEMY_DEFS, CLASS_KEYS, MUTATORS e as uniões de tipo; tests/scan.ts"
  - phase: 02-publicacao-e-servidor
    provides: "apps/server e o migrator do Kysely, que consumirão IceOutcome e o vocabulário de signaling"
provides:
  - "Código de sala do protocolo: alfabeto Crockford de 32, comprimento 6, normalização tolerante e validação estrita"
  - "MSG_KIND com dez entradas: ping no índice 8 e pong no índice 9"
  - "Quinze tabelas congeladas novas (4 de fio + 11 espelhando o sim), 19 no total, com ouro atualizado"
  - "packages/protocol/src/signaling.ts: os doze corpos de mensagem do signaling, só tipos"
  - "PROTOCOL_VERSION = '2', um bump para a fase inteira"
  - "Exceção nomeada de FORM-12: marcador por linha, lista literal de arquivos e citação de RFC"
affects: [03-02-snapshot-codec, 03-04-signaling-server, 03-05-lobby, 03-06-telemetria-ice, 04-netcode]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Tabela congelada append-only: o índice do nome é o valor de fio; ouro no mesmo commit"
    - "Pinagem dupla: valor a valor em runtime (vitest) e tipo a tipo em compile time (tsc, Equal/Expect)"
    - "Tipos de fio sem runtime: shapes em packages/protocol, validação zod em apps/server"
    - "Exceção de auditoria por marcador de linha, com lista de arquivos e citação obrigatória"

key-files:
  created:
    - packages/protocol/src/roomCode.ts
    - packages/protocol/src/signaling.ts
    - tests/room-code.test.ts
  modified:
    - packages/protocol/src/enums.ts
    - packages/protocol/src/version.ts
    - packages/protocol/src/index.ts
    - tests/protocol-enums.test.ts
    - tests/protocol-vocabulary.test.ts
    - tests/snapshots/protocol-enums.json

key-decisions:
  - "O alfabeto do código de sala é uma segunda cópia independente do de src/app/ulid.ts — acoplá-los faria uma mudança de protocolo mexer no formato do id do ledger"
  - "As onze tabelas que espelham o sim não exportam tipo derivado: o tipo já existe em @dg2/sim e runEnvelope já ocupa o nome PlayerSlot com outra forma"
  - "Os campos de versão de Create e Join são um par `Versions`, não duas strings — o que libera o nome `protocol` em IceOutcome para o transporte do par ICE, como o W3C e a coluna do banco o soletram"
  - "FORM-12 ganha exceção por marcador de linha em vez de regex mais frouxa: afrouxar o regex deixaria passar `authorityHost`"
  - "O cabeçalho de roomCode.ts descreve a geração sem soletrar o nome de nenhuma API de aleatoriedade, porque o critério de aceitação do arquivo é um grep por esses nomes"

patterns-established:
  - "Anti-vacuidade em auditoria: todo teste que conta ocorrências assere que a contagem é maior que zero, para que renomear o marcador falhe em vez de silenciar"
  - "Asserção de tipo consumida por uma tupla dentro do `it`, para que `noUnusedLocals` não recuse o alias e o leitor veja o portão na saída verde"

requirements-completed: [SALA-01, SALA-05, SYNC-04]

# Metrics
duration: 45min
completed: 2026-09-08
---

# Phase 3 Plan 01: Vocabulário do fio congelado Summary

**O código de sala, as quinze tabelas novas de enum, os doze corpos do signaling e o bump para `PROTOCOL_VERSION = '2'` — o vocabulário inteiro desta fase fechado antes que qualquer código escreva um byte com ele.**

## Performance

- **Duration:** ~45 min
- **Started:** 2026-09-08T13:07:00Z
- **Completed:** 2026-09-08T13:52:08Z
- **Tasks:** 3 de 3
- **Files modified:** 9 (3 criados, 6 editados)

## Accomplishments

- **`normalizeRoomCode` fecha a porta antes da rede.** Um jogador digita `abc-123`, `OIL123` ou cola com espaço não separável e recebe a forma canônica; digita `U` e é recusado sem gastar uma ida ao servidor. `isRoomCode` é a checagem estrita que o servidor roda, e um teste assere o contrato que liga as duas: nenhuma saída de uma é recusada pela outra.
- **Dezenove tabelas congeladas, todas com ouro no mesmo commit.** Quatro de fio novas (`SNAPSHOT_PART`, `SIGNAL_KIND`, `ICE_ROUTE`, `ICE_CANDIDATE_TYPE`) e onze espelhando o sim, pinadas **na ordem** contra `ENEMY_DEFS`, `ELITE_TYPES`, `CLASS_KEYS` e `MUTATORS` em runtime e contra `ClassKey`, `AttackKind`, `MutatorKey`, `Phase`, `GameMode` e `PlayerSlot` em tempo de compilação.
- **`ping`/`pong` têm número de fio (8 e 9)** e o doc da tabela separa, com ênfase, a mensagem de jogo do frame de controle homônimo do WebSocket.
- **O signaling existe como tipo antes de existir como código.** `authorityPeerId` é explícito em `Created` e `Joined` — a autoridade nunca é derivada do slot — e `IceOutcome` não *pode* carregar endereço nem porta: T-3-09 vira erro de compilação, não revisão de código.
- **FORM-12 sobreviveu à primeira exceção legítima** sem ser afrouxado. O `'host'` do RFC 8445 passa por um marcador de linha trancado três vezes (marcador + lista literal de arquivos + citação obrigatória da RFC), e o teste que testa o detector ganhou o caso do mesmo `'host'` **sem** marcador, que continua vermelho.

## Task Commits

1. **Task 1 (RED): teste que falha para o código de sala** — `9b0dc70` (test)
2. **Task 1 (GREEN): o código de sala como módulo do protocolo** — `ebee883` (feat)
3. **Task 2: ping/pong, as quatro tabelas de fio novas e o vocabulário do signaling** — `c4490be` (feat)
4. **Task 3: as onze tabelas que espelham o sim, pinadas na ordem** — `ac601b1` (feat)

_Task 1 tinha `tdd="true"`: o commit RED reporta 24 testes falhando, o GREEN os deixa verdes. Não houve fase REFACTOR — não havia o que limpar._

## Files Created/Modified

- `packages/protocol/src/roomCode.ts` *(criado)* — `ROOM_CODE_ALPHABET`, `ROOM_CODE_LENGTH`, `normalizeRoomCode`, `isRoomCode`. O cabeçalho registra as três decisões: o código é a única credencial (D3-09) e depende do rate limit do 03-04 (T-3-01), a geração mora no servidor, e o alfabeto é cópia independente do de `ulid.ts`.
- `packages/protocol/src/signaling.ts` *(criado)* — doze corpos de mensagem, `PeerInfo`, `IceServer`, `IceConfig`, `TurnCredential` e a união `SignalMessage`. Zero runtime: três `import type` e nada mais.
- `tests/room-code.test.ts` *(criado)* — 24 testes, tabela de 15 casos de normalização.
- `packages/protocol/src/enums.ts` — `ping`/`pong` no fim de `MSG_KIND`; quinze tabelas novas; o parágrafo de doutrina FORM-12 atualizado para descrever a exceção.
- `packages/protocol/src/version.ts` — `PROTOCOL_VERSION` de `'1'` para `'2'`, com o que mudou nesta fase escrito no comentário.
- `packages/protocol/src/index.ts` — `./roomCode` e `./signaling` no barrel, em ordem alfabética.
- `tests/protocol-enums.test.ts` — 15 tabelas novas em `TABLES`, testes de pinagem por índice, `Equal`/`Expect`, e a tabela de cardinalidades medidas.
- `tests/protocol-vocabulary.test.ts` — mecânica da exceção FORM-12 e dois testes novos; o teste do vocabulário substituto passou a ler **código** em vez de prosa.
- `tests/snapshots/protocol-enums.json` — de 4 para 19 tabelas.

## Decisions Made

- **`Create.versions` / `Join.versions` como par `Versions`, não `sim: string` + `protocol: string`.** O plano previa dois campos soltos. Com `IceOutcome` carregando `protocol`/`relayProtocol` (os nomes que o `RTCIceCandidateStats` e a coluna `ice_outcome` usam), o mesmo arquivo teria dois campos chamados `protocol` com significados diferentes. Reusar o tipo `Versions` que `checkVersions` já consome resolve a ambiguidade e diminui a superfície.
- **`SignalError`, não `Error`.** O barrel usa `export *`; um tipo chamado `Error` chegaria a todo importador de `@dg2/protocol` e sombrearia o global no arquivo que esquecesse disso.
- **`result` e os transportes de `IceOutcome` são uniões inline, não tabelas congeladas.** A perna do signaling é JSON: nenhum índice viaja, então congelar um número contra um nome não compra nada.
- **`BOSS_STATE` pinado só por valor.** `Enemy.bossState` é `string` no sim; estreitar para união moveria `SIM_VERSION`, o que a fronteira da fase proíbe. Registrado como dívida no doc da tabela e no comentário do teste.
- **`OBSTACLE_KIND` congelada mesmo sem consumidor**, com a alternativa (não congelar o que nada escreve) escrita no doc como defensável — é julgamento, não descuido.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Faltava `node_modules` no worktree**
- **Found during:** preparação (antes da Task 1)
- **Issue:** o worktree veio sem dependências instaladas, então nenhum comando de verificação do plano podia rodar.
- **Fix:** `npm ci --no-audit --no-fund` (restaura o lockfile existente; **nenhum pacote novo instalado**, `packages/protocol` continua com `dependencies: {}`).
- **Verification:** `ls node_modules/@dg2` confirma que os links de workspace apontam para os pacotes **deste** worktree, e não para os do repositório principal.
- **Committed in:** nada — `node_modules/` é gitignored.

**2. [Rule 3 - Blocking] O critério de aceitação da Task 1 contradizia a própria `<action>`**
- **Found during:** Task 1
- **Issue:** a `<action>` mandava o cabeçalho dizer que a geração mora no servidor "com `crypto`"; o critério de aceitação exigia que `grep -n "randomBytes\|randomInt\|crypto" roomCode.ts` não retornasse nada. Os dois não podem valer ao mesmo tempo.
- **Fix:** a decisão continua escrita, sem soletrar nenhum nome de API ("drawn ON THE SERVER, from the platform's CSPRNG"), e um parágrafo explica a própria omissão — o mesmo movimento que `version.ts` já faz pelo mesmo motivo. O grep de segurança prevalece: é ele que impede o arquivo de ganhar um gerador.
- **Files modified:** `packages/protocol/src/roomCode.ts`
- **Verification:** `grep -n "randomBytes\|randomInt\|crypto" packages/protocol/src/roomCode.ts` não retorna nada.
- **Committed in:** `ebee883`

**3. [Rule 1 - Bug] O critério de `signaling.ts` como substring literal é insatisfazível**
- **Found during:** Task 2
- **Issue:** o critério dizia que o arquivo não pode conter "as substrings `address` nem `port`". `port` é substring de `export` e de `import`, e o arquivo tem 29 ocorrências só por isso — o critério nunca poderia passar como escrito.
- **Fix:** verificado o que o critério de fato protege (T-3-09: o tipo **não declara** esses campos) com `grep -nE '\b(address|port)\b'`, que casa apenas palavras inteiras — 0 ocorrências. `address` também não aparece como substring.
- **Files modified:** nenhum (correção de interpretação da verificação)
- **Verification:** `grep -nE '\b(address|port)\b' packages/protocol/src/signaling.ts` sai vazio; `grep -o "port" | wc -l` retorna 29, todas dentro de `export`/`import`/`transport`.
- **Committed in:** n/a

**4. [Rule 2 - Missing critical] O teste do vocabulário substituto passou a ler código, não prosa**
- **Found during:** Task 2
- **Issue:** `tests/protocol-vocabulary.test.ts` assertava que `authority`/`peer`/`slot` apareciam nos fontes **crus** (comentários incluídos), e o próprio comentário do teste dizia que isso valia só até a fase 3 mover essas palavras "da prosa para os nomes". A partir deste plano, `signaling.ts` tem `authorityPeerId`, `peers` e `slot` como **campos** — manter a asserção fraca deixaria passar um pacote que fala de autoridade em comentário e soletra topologia nos identificadores.
- **Fix:** a asserção passou a rodar sobre `scan(src, true)` (comentários removidos), e o comentário foi reescrito para registrar a transição.
- **Files modified:** `tests/protocol-vocabulary.test.ts`
- **Verification:** o teste `o vocabulário substituto está nos NOMES, não só na prosa` passa; verificado que ele lê código, não comentário.
- **Committed in:** `c4490be`

**5. [Rule 1 - Bug] Sequências de escape viravam caracteres reais na escrita do arquivo**
- **Found during:** Task 1
- **Issue:** o separador U+00A0 escrito como `' '` chegava ao disco como o caractere real, invisível em revisão e sujeito a ser apagado por qualquer "clean up whitespace" de editor.
- **Fix:** a lista de separadores passou a ser construída por code point — `[0x20, 0x09, 0x0a, 0x0d, 0xa0].map((c) => String.fromCharCode(c))` — que é ASCII puro no fonte, legível, grepável, e sobrevive a qualquer ferramenta no caminho. O doc registra o porquê.
- **Files modified:** `packages/protocol/src/roomCode.ts`
- **Verification:** `cat -A` na linha mostra só ASCII; os 32 caracteres do alfabeto sobrevivem à normalização e `'a-b-c-1-2-3'` normaliza para `ABC123`.
- **Committed in:** `ebee883`

**6. [Rule 3 - Blocking] `_porque` não usado quebrava o lint**
- **Found during:** Task 1
- **Issue:** `@typescript-eslint/no-unused-vars` não ignora prefixo `_` em bindings de callback nesta configuração, e o terceiro parâmetro da tabela de casos era só o nome do teste.
- **Fix:** o callback do `it.each` recebe dois parâmetros; a terceira coluna é consumida pelo `%s` do título.
- **Files modified:** `tests/room-code.test.ts`
- **Verification:** `npm run lint` sai 0.
- **Committed in:** `ebee883`

---

**Total deviations:** 6 (3 × Rule 3, 2 × Rule 1, 1 × Rule 2)
**Impact on plan:** nenhuma mudança de escopo. Quatro são atrito de ambiente ou de ferramenta; duas (nº 2 e nº 3) são contradições internas do próprio plano, resolvidas a favor do critério que protege a propriedade de segurança. A nº 4 é a única que **fortalece** um portão existente, e é exatamente a mudança que o comentário do portão pedia por escrito.

## Issues Encountered

- **Base do worktree errada.** O worktree nasceu em `3f25a68`, 12 commits atrás de `4a825d1`, onde os planos da fase 3 nem existiam. Corrigido pelo `<worktree_branch_check>`: HEAD confirmado no namespace `worktree-agent-*` e `git reset --hard` para a base esperada.
- **`tests/lint-coverage.test.ts` falhou por timeout na primeira execução de `npm test`** (5 s, com o ESLint frio). Passa em toda execução seguinte, e não tem relação com este plano — é artefato de primeira execução em máquina fria. Registrado, não "consertado".
- **A asserção de tipo podia ser vazia.** `Equal`/`Expect` só valem se falharem quando deveriam. Verificado empiricamente: trocando `Phase` por `typeof GAME_MODE[number]`, o `tsc` reporta `TS2344: Type 'false' does not satisfy the constraint 'true'`. Revertido em seguida.

## User Setup Required

Nenhum — este plano não toca em serviço externo, não instala pacote e não pede segredo.

## Next Phase Readiness

Pronto para a onda 2. O que os planos seguintes herdam:

- **03-02 (codec do snapshot):** `SNAPSHOT_PART` e as onze tabelas espelhadas estão congeladas e pinadas; o codec pode indexar sem escolher número nenhum. `MSG_KIND[6]` (`snapshot`) e `MSG_KIND[7]` (`ack`) já existiam.
- **03-04 (servidor de signaling):** `SIGNAL_KIND` e os doze corpos em `signaling.ts` são a fonte única; o schema zod do servidor amarra-se a eles pela asserção `Equal`/`Expect` — o par de helpers já está escrito em `tests/protocol-enums.test.ts` e pode ser copiado. **O rate limit do `join` e a checagem de `Origin` são desse plano**, e o cabeçalho de `roomCode.ts` diz por quê: sem eles, seis caracteres não bastam (T-3-01).
- **03-06 (telemetria ICE):** `IceOutcome` já tem a forma exata da tabela `ice_outcome`, incluindo `protocol`/`relayProtocol` com os mesmos nomes das colunas.
- **Dívida registrada:** estreitar `Enemy.bossState` de `string` para união no sim, num commit que já mova `SIM_VERSION`.

## Threat Flags

Nenhuma superfície nova fora do `<threat_model>` do plano. As três mitigações atribuídas a este plano estão implementadas: T-3-01 (alfabeto e comprimento fixados como constantes exportadas, com o rate limit citado no cabeçalho), T-3-07/T-3-08 (domínios finitos para validar `lobbyState` e o índice de parte) e T-3-09 (`IceOutcome` não declara endereço nem porta, então o compilador recusa quem tentar enviá-los). T-3-SC continua válida: nenhum pacote novo foi instalado e `packages/protocol` mantém `"dependencies": {}`.

## Known Stubs

Nenhum. Todo símbolo exportado por este plano tem implementação ou é um tipo puro por desenho — `signaling.ts` não tem runtime **de propósito** (D3-14/C-3), e os consumidores dele são os planos 03-04 a 03-06 desta mesma fase.

---
*Phase: 03-sala-transporte-e-protocolo*
*Completed: 2026-09-08*
