---
phase: 03-sala-transporte-e-protocolo
plan: 06
subsystem: signaling-server
tags: [sqlite, kysely, migration, telemetria-ice, turn, hmac, coturn, env, d3-10, d3-14]

# Dependency graph
requires:
  - phase: 02-publicacao-e-servidor
    provides: "openDb com os quatro pragmas, o provider estático de migrações, readEnv/DEFAULTS e o padrão de falha engolida de health.ts"
  - phase: 03-sala-transporte-e-protocolo
    plan: 01
    provides: "ICE_ROUTE, ICE_CANDIDATE_TYPE, IceOutcome, IceConfig, IceServer e TurnCredential em packages/protocol"
  - phase: 03-sala-transporte-e-protocolo
    plan: 04
    provides: "attachSignalling com recordOutcome e iceConfig já como deps injetadas, e o try que engole em volta da chamada"
  - phase: 03-sala-transporte-e-protocolo
    plan: 07
    provides: "ops/turnserver.conf com use-auth-secret e o realm; DG2_TURN_SECRET/DG2_TURN_REALM já inventariadas no detector de vazamento"
provides:
  - "apps/server/src/db/migrations.ts: 002_ice_outcome, aditiva, com índice em (at)"
  - "apps/server/src/db/open.ts: IceOutcomeTable e a segunda entrada em Schema"
  - "apps/server/src/signaling/outcome.ts: createOutcomeRecorder com INSERT OR IGNORE, teto por peer e falha engolida"
  - "apps/server/src/signaling/turn.ts: turnCredential (HMAC-SHA1, TTL 1 h, amarrada à sala), iceServers, NO_TURN e DEV_STUN_DOMAIN"
  - "apps/server/src/env.ts: optional() e o par DG2_TURN_SECRET/DG2_TURN_REALM, com a ausência tolerada"
  - "SignallingDeps.recordOutcome com dois argumentos: o corpo e a atribuição resolvida pelo socket"
affects: [03-08-ice-cliente, 03-11-validacao-na-caixa, 04-netcode, 05-reconexao, 06-contas]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Fábrica com estado fechado e deps por argumento, no molde de rooms.ts/limiter.ts"
    - "Vetor conhecido calculado por ferramenta externa (openssl) e recomputado no teste por node:crypto, nunca pelo código sob teste"
    - "optional() como irmão de required(): ausência tolerada, branco recusado, e sem parâmetro de fallback para que um segredo padrão seja impossível de escrever"
    - "Par de chaves de env validado como par: meia configuração é recusada nos dois sentidos"
    - "Atribuição resolvida pelo servidor e passada como segundo argumento, para que o corpo da mensagem não tenha voto sobre a que sala ele pertence"

key-files:
  created:
    - apps/server/src/signaling/outcome.ts
    - apps/server/src/signaling/turn.ts
    - tests/turn.test.ts
  modified:
    - apps/server/src/db/migrations.ts
    - apps/server/src/db/open.ts
    - apps/server/src/env.ts
    - apps/server/src/index.ts
    - apps/server/src/signaling/index.ts
    - apps/server/tsconfig.json
    - tsconfig.json
    - tests/server-migrate.test.ts
    - tests/server-env.test.ts
    - tests/server-signaling.test.ts

key-decisions:
  - "`recordOutcome` passou a receber DOIS argumentos, e o segundo é a propriedade de segurança: a sala, o slot e a conta do reporte são resolvidos pelo socket e nunca lidos do corpo, senão um peer poderia inclinar a medição de uma sala em que nunca entrou (T-3-24)"
  - "Statement cru do better-sqlite3 e não o query builder: o insert do Kysely é uma promessa, e uma rejeição assíncrona escapa inteira do try/catch síncrono do handler — o swallow do plano 03-04 deixaria de engolir e uma escrita falha viraria unhandled rejection"
  - "`forget(peerId)` devolve a cota junto com o socket. Sem isso o Map cresce uma entrada por conexão já aceita e nunca encolhe, que é exatamente o mapa ilimitado e chaveado por entrada remota que limiter.ts se recusa a ser"
  - "`route` e `result` são validados no gravador e não na coluna: o SQLite guarda o texto que receber, então um décimo-terceiro valor não falharia — faria a taxa de relay silenciosamente parar de somar um"
  - "`at` é carimbado pelo servidor. Um instante escolhido pelo repórter decidiria onde as linhas dele caem no índice pelo qual todas as outras são lidas"
  - "`optional()` não tem parâmetro de fallback — não 'o padrão é vazio', mas nenhum parâmetro — porque é o que torna impossível escrever um segredo padrão neste arquivo (T-3-10)"
  - "O par de TURN é recusado pela metade nos DOIS sentidos: segredo sem realm produz credencial que o coturn não aceita, e realm sem segredo é um operador que configurou o relay e esqueceu a linha que deixa este processo falar com ele — os dois têm o mesmo sintoma mudo"
  - "O vetor conhecido existe porque o coturn é a outra metade do cálculo e não está neste repositório: um teste que comparasse a nossa saída com a nossa própria saída ficaria verde enquanto o relay recusasse toda credencial na caixa"

patterns-established:
  - "Vetor criptográfico com duas testemunhas: o literal fixado, mais uma recomputação à mão no próprio teste, para que re-baselinar a partir da implementação ainda esbarre em HMAC-SHA1/base64"
  - "Ausência tolerada como estado suportado e nomeado, com aviso único no boot — não é erro, mas também não se descobre pela reclamação de um jogador"
  - "Coluna que não existe como asserção: o teste lista os nomes proibidos um a um, mesmo já tendo fixado o conjunto, porque é a linha que diz o motivo em voz alta"

requirements-completed: [SALA-04, SALA-05]

# Metrics
duration: 18min
completed: 2026-09-08
---

# Phase 3 Plano 06: telemetria de ICE e credencial de TURN — Summary

**A pergunta "quantas das nossas salas precisaram de relay" deixou de ser um número emprestado de survey alheio e virou um `SELECT` sobre linhas que o próprio jogo grava — inclusive as de falha, que são a metade que impede a taxa de sair errada para cima — e o servidor passou a emitir credencial de relay que expira em uma hora e morre com a sala, sem jamais entregar o segredo e sem deixar de subir na máquina onde o coturn ainda não existe.**

## Performance

- **Duration:** ~18 min
- **Started:** 2026-09-08T12:47Z (horário local −03:00)
- **Completed:** 2026-09-08T13:03 −03:00
- **Tasks:** 2 de 2, ambas `tdd="true"`
- **Files:** 13 (3 criados, 10 modificados)

## Accomplishments

- **A linha de falha é gravada, e é ela que faz o número significar alguma coisa.** Uma tabela alimentada só por conexões que deram certo mede os sucessos e nada mais, e a taxa que ela reporta fica errada para cima **para sempre, sem sintoma** — porque toda linha dentro dela é verdadeira. `route: 'unknown'` com `result: 'failed'` e as cinco colunas do par em NULL é a forma honesta de dizer "nunca chegamos lá", e há um teste dedicado a ela.
- **Nenhuma coluna guarda o endpoint de rede de um jogador, e a ausência é asserida duas vezes.** Uma vez pelo conjunto exato de doze colunas, e outra por uma lista de nomes proibidos que existe só para dizer o motivo em voz alta (T-3-09). O `grep` do critério de aceitação confirma que nem a palavra sobrevive em `migrations.ts` — o comentário que explica a decisão fala em *endpoint*, nunca nos dois termos que o portão procura.
- **O reporte é atribuído pelo socket, não pelo remetente.** `IceOutcome` carrega `code` e `slot`, e os dois são **ignorados**: a sala vem da sessão daquele socket, e o slot e a conta vêm do registro de ocupante daquela sala. Um teste manda um reporte nomeando `ZZZZZZ`/`p3` de dentro de uma sala real e confirma que o que chegou ao gravador foi a sala real e o `p0` verdadeiro (T-3-24) — enquanto o corpo da medição chega intacto, porque o servidor resolve a **atribuição**, não reescreve o dado.
- **A idempotência é o próprio `id`, no mesmo mecanismo que D-27 dá ao ledger.** `INSERT OR IGNORE` mais `notNull` explícito na PK textual — o SQLite permite NULL em qualquer PRIMARY KEY que não seja INTEGER, e NULLs nunca colidem, então sem essa palavra o `OR IGNORE` não ignora nada. Reportar duas vezes deixa uma linha, e **a primeira vence**: o teste confirma que um segundo reporte com `rttMs` diferente não sobrescreve.
- **A credencial bate com um vetor que duas ferramentas independentes concordaram.** `openssl dgst -sha1 -hmac` e `node:crypto` produziram o mesmo `AuH1uQQpb2Nf9yhX3BCTz3dWt5w=` para `1756003600:ABCDEF:p1`, e o literal está fixado no teste com o comando para recalculá-lo. Isso importa porque **o coturn é a outra metade do cálculo e não está neste repositório**: um teste que comparasse a nossa saída com a nossa própria saída ficaria verde enquanto `use-auth-secret` recusasse toda credencial na caixa — e o sintoma seria "um amigo específico nunca entra", indistinguível de NAT ruim.
- **O segredo não sai daqui, e há três asserções sobre isso.** `JSON.stringify` do resultado não o contém, nenhum campo individual o contém, e o objeto tem exatamente três chaves — porque uma quarta é como um segredo vazaria (T-3-23). O mesmo teste roda sobre a lista inteira de `iceServers`, que é o que de fato viaja dentro de `created`/`joined`.
- **Sem `DG2_TURN_SECRET` o servidor sobe, avisa uma vez e serve ICE só com STUN.** É o que permite às ondas locais desta fase rodarem antes da VPS existir, e é a única chave da interface `ServerEnv` cujo `null` é resposta legítima. **Definida e vazia continua sendo erro**, pela mesma doutrina de todas as outras: quem escreveu a linha quis dizer alguma coisa, e tratar branco como ausente transformaria um erro de digitação num deployment silenciosamente sem relay.
- **O STUN público é adicional e nunca substituto (C-8), e a ordem está asserida.** O nosso primeiro, o público em segundo. Uma segunda opinião sobre o endereço reflexivo não custa nada e cobre o minuto em que o nosso STUN está reiniciando — mas trocar o nosso por ele poria um terceiro no caminho de toda sala que este jogo abrir.
- **`5349` e não `443`, com o motivo herdado.** As três URLs de relay respeitam a decisão que o plano 03-07 registrou em `ops/turnserver.conf`: a 443 é do Caddy, e as duas saídas para mudar isso estão nomeadas lá.

## Task Commits

| Tarefa | Gate | Commit | Tipo |
|---|---|---|---|
| Task 1: tabela `ice_outcome` e o gravador | RED | `17c1bff` | test |
| Task 1: tabela `ice_outcome` e o gravador | GREEN | `68a808e` | feat |
| Task 2: credencial de TURN, env e config de ICE | RED | `1053713` | test |
| Task 2: credencial de TURN, env e config de ICE | GREEN | `1dff3e5` | feat |

Nenhuma das duas teve fase REFACTOR: os módulos passaram na primeira execução verde e não havia o que limpar. A sequência de gates está no log — `test(` antes de `feat(` nas duas tarefas.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] O contador por peer vazava uma entrada por conexão já aceita**

- **Encontrado em:** Task 1, ao escrever o teto de 20 por `peerId`
- **Problema:** o teto exige um `Map<peerId, contagem>` fechado no gravador. O `peerId` é sorteado por socket e nunca some do mapa, então o mapa cresce uma entrada para cada conexão que o processo já aceitou e **nunca encolhe** — sob `MemoryMax=256M`, é exatamente o mapa ilimitado e chaveado por entrada remota que `limiter.ts` se recusa a ser, com outro nome. O plano não menciona liberação.
- **Correção:** `forget(peerId)` no gravador, chamado no handler de `close` ao lado dos dois `delete` que já existiam. É exato e não precisa de heurística: não há varredura, despejo nem teto para calibrar, porque o `peerId` vive exatamente o tempo de uma conexão (ADR 0001). Isso acrescentou `forgetOutcomes` a `SignallingDeps` — argumento separado de `recordOutcome` para que um chamador sem nada a liberar passe um no-op só nele.
- **Files modified:** `apps/server/src/signaling/outcome.ts`, `apps/server/src/signaling/index.ts`, `apps/server/src/index.ts`, `tests/server-migrate.test.ts`, `tests/server-signaling.test.ts`
- **Commit:** `68a808e`

**2. [Rule 3 - Bloqueio] `recordOutcome` precisou de um segundo argumento, e `tests/server-signaling.test.ts` teve de acompanhar**

- **Encontrado em:** Task 1
- **Problema:** o plano manda "acrescentar ao `row` o `peerId` do remetente e o `room_code` da sala", mas a dep herdada da onda 3 é `(row: IceOutcome) => void` — não há por onde passar a atribuição sem ou mutar a mensagem recebida (que é o corpo que o peer enviou) ou mudar a assinatura. Mutar seria pior: deixaria os dois valores no mesmo objeto que o cliente controla, e a distinção entre "o que ele disse" e "o que nós resolvemos" desapareceria na primeira leitura futura.
- **Correção:** `recordOutcome: (row, from: OutcomeSource) => void`. O segundo argumento é a atribuição resolvida pelo servidor e o primeiro segue sendo, palavra por palavra, o que chegou pelo fio. `tests/server-signaling.test.ts` — que **não** está na lista de `files_modified` do plano — teve de ser editado para satisfazer a interface, e ganhou três casos que só existem por causa desta mudança: a atribuição resolvida, o reporte de quem não está em sala nenhuma, e a devolução da cota no `close`.
- **Impacto no plano:** nenhum. O `key_link` casa `recordOutcome` em `signaling/index.ts`, que continua sendo o call site.
- **Commit:** `68a808e`

**3. [Rule 1 - Bug] A asserção da conta no teste novo usava o `accountId` errado**

- **Encontrado em:** Task 1, na primeira execução verde
- **Problema:** o caso "a sala e o slot vêm do socket" asseria `accountId === 'c'`, chutado a partir de outros testes do arquivo; o helper `openRoom()` cria a sala com `'conta-a'`.
- **Correção:** asserção corrigida para `'conta-a'`. O teste continua provando o que existe para provar — que a conta vem do registro de ocupante e não da mensagem.
- **Commit:** `68a808e`

### Escolhas dentro da discricionariedade do plano

- **`DEV_STUN_DOMAIN = 'localhost'`.** O plano diz "sem segredo, devolve `iceServers(realm ?? domainPadrão, null)`" sem nomear o padrão. Escolhido `localhost`, exportado de `turn.ts` com o motivo escrito: resolve para esta máquina, onde nada escuta na 3478, então a coleta de candidatos simplesmente não acha nada e a entrada de STUN público ao lado responde. A alternativa — nomear um domínio que este deployment não possui — mandaria o navegador de todo desenvolvedor a um estranho.
- **`NO_TURN` exportado de `turn.ts`** em vez de repetido em `index.ts`: é a forma que a onda 3 já enviava (`ttl: 0`), agora com um nome e o motivo de `ttl: 0` ser um valor e não um campo ausente — a forma da mensagem não muda com o estado do deployment (FORM-12).
- **`log` extraído para uma constante em `index.ts`.** Passou a ter dois consumidores (o signaling e o gravador), e duas cópias do formato são uma edição de distância de não serem o mesmo formato.

**Total de deviações:** 3 auto-corrigidas (1 crítica ausente, 1 bloqueante, 1 bug) + 3 escolhas registradas.

## Known Stubs

**Nenhum.** Os dois stubs que o plano 03-04 deixou em `apps/server/src/index.ts` foram substituídos por implementações reais neste plano, e nenhum novo foi introduzido:

| Stub herdado | Estado |
|---|---|
| `recordOutcome` era um no-op | Substituído por `outcomes.record`, que grava de verdade |
| `iceConfig` devolvia só STUN público, com `turn` zerado | Substituído por `iceServers(turnDomain, cred)` com credencial por sala e por slot |

A única referência remanescente a "03-06" em `apps/server/src/` é um comentário em `rooms.ts` explicando por que a **sala** não vai ao banco enquanto a telemetria vai — descrição correta do estado atual, não marcador de trabalho pendente.

## Verification

| Portão | Resultado |
|---|---|
| `npm run lint` | 0 |
| `npm test` | 0 — **812 testes em 55 arquivos** (antes: 772 em 54) |
| `npm run typecheck:server` | 0 |
| `npm run server:build` | 0 — `dist-server/server.mjs`, 1.4 MB |
| `npx tsc --noEmit` (programa raiz) | 0 |
| `npm run typecheck:protocol` / `typecheck:sim` | 0 |
| `npx vitest run tests/server-migrate.test.ts` | 0 — **24 testes** (mínimo do plano: 9), com nomes citando `idempot` e `failed` |
| `npx vitest run tests/turn.test.ts` | 0 — **13 testes** (mínimo do plano: 9), 5 nomes citando `vetor` ou `segredo` |
| `npx vitest run tests/server-env.test.ts` | 0 — inclui "a ausência do segredo é tolerada" |
| `npx vitest run tests/server-signaling.test.ts` | 0 — 24 testes |
| `npx vitest run tests/net-vocabulary.test.ts` | 0 — os dois módulos novos entram no glob do signaling e passam |
| `grep -cE "'address'\|'port'\|\baddress\b\|\bport\b" migrations.ts` | 0 |
| `grep -c "Exactly one, deliberately" open.ts` | 0 |
| `grep -cE "Math\.random\|crypto\.createCipher\|md5" turn.ts` | 0 |
| `DEFAULTS` contém `TURN` | 0 |
| `git grep static-auth-secret` fora de `ops/` e `.planning/` | só asserções sobre o placeholder em `tests/ops-config.test.ts`; nenhum valor real |
| raiz `dependencies` | `{}` — nada foi instalado neste plano |

## Threat Model — dispositions aplicadas

| Threat ID | Onde foi mitigado |
|---|---|
| T-3-03 | `turn.ts` — credencial efêmera de 1 h, assinada, amarrada a `roomCode` e slot; emitida dentro do signaling, sem endpoint HTTP aberto |
| T-3-09 | `002_ice_outcome` não declara colunas de endpoint; asserido pelo conjunto exato de colunas **e** pela lista de nomes proibidos |
| T-3-23 | `turnCredential` devolve três campos; três asserções de que o segredo não aparece no resultado nem na lista de `iceServers` serializada |
| T-3-24 | `signaling/index.ts` resolve sala, slot e conta pelo socket; `OutcomeSource` é o segundo argumento e a mensagem não tem voto |
| T-3-25 | `MAX_OUTCOMES_PER_PEER = 20`, com `record` devolvendo `false` sem lançar, e `forget` devolvendo a cota no `close` |
| T-3-26 | `try/catch` em `outcome.ts` no molde de `health.ts:61-73`, mais o `try` do handler que sobrevive até a uma dep que lança |
| T-3-10 | `optional()` sem parâmetro de fallback; asserido que `DEFAULTS` não contém `TURN` |
| T-3-SC | Nenhum pacote instalado; `node:crypto` vem do Node 24 e `package-lock.json` não foi tocado |

## Threat Flags

Nenhuma superfície nova fora do registro do plano. A tabela nova é escrita por um caminho que já existia (`iceOutcome`, cuja fronteira o modelo já cobre) e não é lida por nenhuma rota HTTP; nenhum endpoint foi criado; a única saída nova de dado para o cliente é a credencial de TURN, que é a mitigação de T-3-03 e não superfície adicional.

## O que a próxima onda herda

- **Plano 03-08 (cliente de ICE)** consome `ice`/`turn` de `created`/`joined` exatamente como já vinham; o que mudou é que `turn.ttl` agora pode ser `3600` de verdade. `NO_TURN` (`ttl: 0`) continua sendo o que chega quando não há relay, e é o valor pelo qual o cliente distingue os dois casos.
- **Plano 03-11 (validação na caixa)** é quem prova que a credencial que este arquivo minta é a mesma que o coturn aceita. O vetor conhecido reduz o risco, mas não substitui a validação: ele fixa o **nosso** lado do cálculo.
- **A pergunta que a tabela agora responde:** `select route, count(*) from ice_outcome where at > ? group by route` — e o índice em `(at)` existe para que ela seja um `SELECT` e não um script.
- **Dívida herdada e não paga aqui:** `badMessage` em `REJECT_REASON` continua registrado pelo plano 03-04 como pendente, e este plano não moveu a tabela congelada.

## Self-Check: PASSED

Os três arquivos criados existem em disco (`apps/server/src/signaling/outcome.ts`, `apps/server/src/signaling/turn.ts`, `tests/turn.test.ts`), os quatro commits existem no log (`17c1bff`, `68a808e`, `1053713`, `1dff3e5`), e todos os portões de verificação saem 0 no HEAD deste ramo.
