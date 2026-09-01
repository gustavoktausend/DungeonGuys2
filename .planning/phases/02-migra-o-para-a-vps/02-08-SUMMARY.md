---
phase: 02-migra-o-para-a-vps
plan: 08
subsystem: infra
tags: [apps-server, npm-workspaces, hono, kysely, better-sqlite3, migration, health-endpoint, loopback, infra-04]

# Dependency graph
requires:
  - phase: 02
    plan: 06
    provides: "o precedente de portão próprio (`sw:verify`) fora do `build`, e a convenção de comentário do `ci.yml` que o passo `typecheck:server` copia"
provides:
  - "o workspace `apps/server`: o único manifesto do repositório com `dependencies` não vazio, e a raiz continua com `{}`"
  - "`openDb(path)`: os quatro pragmas (WAL, synchronous NORMAL, foreign_keys, busy_timeout) num só lugar, mais o tipo `Schema` do Kysely"
  - "o provider estático de migração e a tabela `gold_entry`, espelhando o `LedgerEvent` do cliente — ou seja, existe o que restaurar"
  - "`GET /api/health` em `127.0.0.1`, com corpo de exatamente três chaves e `Cache-Control: no-store`"
  - "`export const server` em `index.ts`: o `http.Server` real onde a fase 3 anexa o `ws` no evento `upgrade`"
  - "`npm run typecheck:server` e `npm run server:build`, mais o passo de typecheck no `ci.yml`"
  - "`tests/workspaces.test.ts`: o confinamento de dependências vira reprovável por comando"
affects:
  - "02-09: o passo de CI de `sw:verify` e a `api-isolation.spec` encontram `/api/health` já existindo"
  - "02-10: o `dg2.service` depende de o processo sair não-zero quando a migração falha (P-9), e de o bind ser loopback para o `RestrictAddressFamilies` fazer sentido"
  - "02-11: o job de CI já tem `typecheck:server`; `server:build` é o que produz o artefato que o deploy copia"
  - "02-12: o ensaio de restauração de INFRA-04 agora tem um esquema para comparar"
  - "fase 3: `export const server` é o ponto de anexo do `ws`; fase 6: a FK para a tabela `user` do Better Auth entra em `gold_entry` quando o Better Auth existir"

# Tech tracking
tech-stack:
  added:
    - "hono 4.13.5 (apps/server)"
    - "@hono/node-server 2.1.1 (apps/server)"
    - "better-sqlite3 13.0.3 (apps/server)"
    - "kysely 0.29.5 (apps/server)"
    - "@types/better-sqlite3 7.6.13, esbuild 0.28.2, tsx 4.23.12 (devDependencies de apps/server)"
  patterns:
    - "dependência de runtime confinada a um workspace, com o confinamento asserido por teste em vez de prometido por convenção"
    - "`tsconfig` por pacote invertendo o molde: `types: [\"node\"]` sem `DOM`, o espelho exato de packages/protocol"
    - "provider de migração como objeto literal, para que o passo que roda antes de servir não dependa de resolver caminho em runtime"
    - "aplicação separada do entrypoint por FÁBRICA com dependências injetadas, e não por instância de módulo — importar `app.ts` não abre banco nem porta"
    - "corpo de resposta pública asserido por igualdade de conjunto de chaves, para que o campo acrescentado com pressa reprove no commit que o acrescenta"
key-files:
  created:
    - apps/server/package.json
    - apps/server/tsconfig.json
    - apps/server/src/index.ts
    - apps/server/src/app.ts
    - apps/server/src/health.ts
    - apps/server/src/db/open.ts
    - apps/server/src/db/migrations.ts
    - tests/workspaces.test.ts
    - tests/server-migrate.test.ts
    - tests/server-health.test.ts
  modified:
    - package.json
    - package-lock.json
    - tsconfig.json
    - eslint.config.js
    - .gitignore
    - .github/workflows/ci.yml

key-decisions:
  - "As quatro dependências de runtime ficam PINADAS sem caret (`\"hono\": \"4.13.5\"`, não `\"^4.13.5\"`). A pesquisa auditou versões, não faixas: com caret, o próximo `npm install` numa máquina limpa poderia resolver para uma versão que ninguém passou pelo slopcheck. O precedente é `@playwright/test`, pinado pela mesma razão — a versão é a variável, não um detalhe."
  - "`app.ts` exporta `createApp(deps)` em vez de uma instância `app` de módulo, contra a letra do plano. Uma instância no escopo do módulo precisaria de um handle de banco global e mutável (ou de um `setDeps()`), o que devolveria ao import justamente o efeito colateral que a divisão entre `app.ts` e `index.ts` existe para remover. Os bindings do Hono (`c.env`) não servem: no adaptador de Node eles são `{ incoming, outgoing }`, não nossos."
  - "`export const server` em vez de `const server`: com `noUnusedLocals: true` uma constante não usada reprova o typecheck, e exportar é mais honesto que um `void server` — a fase 3 vai importá-la de verdade."
  - "`id` aparece como anulável no `PRAGMA table_info` e o teste assere isso explicitamente, com a razão: SQLite permite NULL num TEXT PRIMARY KEY por compatibilidade histórica. A propriedade que importa (D-27) é a unicidade, e ela tem teste próprio."
  - "`reason` não ganhou CHECK constraint. O vocabulário é do cliente (`LedgerReason`), e fixá-lo em DDL significaria uma migração a cada razão nova, numa tabela que esta fase nem escreve."
  - "INFRA-04 continua `Pending`. Este plano entrega o que restaurar, não o ensaio de restauração; 02-03, 02-04, 02-10, 02-11 e 02-12 também o carregam. Precedente do 02-05 e do 02-06: não assinar embaixo de um requisito que outros planos ainda precisam completar."

patterns-established:
  - "Prova de recusa executada para cada portão novo: dependência vazada na raiz, sétima coluna na migração, e erro plantado em `apps/server/src` para provar que o lint realmente o cobre"
  - "Guarda anti-vacuidade por COMPRIMENTO e nunca por tipo — `''` é string e passaria por `toBeTypeOf` (herdado do 02-02)"

requirements-completed: []

# Metrics
duration: 20min
completed: 2026-09-01
---

# Phase 2 Plan 08: O primeiro processo Node do projeto

**Existe um banco com esquema aplicado — ou seja, existe o que restaurar — e um processo que
migra antes de aceitar requisição, escuta só em loopback, e responde uma rota de saúde que
não conta nada de privado; e as quatro dependências que isso custou não encostaram na raiz.**

## Performance

- **Duration:** ~20 min
- **Tasks:** 3
- **Files:** 10 criados, 6 modificados
- **Testes:** 441 → **459** (+18, em 3 arquivos novos); 38 → 41 arquivos de teste

## Accomplishments

- **A doutrina do `dependencies: {}` sobreviveu ao primeiro servidor, e agora é executável.**
  A raiz, `packages/sim` e `packages/protocol` declaram `dependencies` igual a `{}`;
  `apps/server` declara exatamente quatro chaves, nem mais nem menos. Provado por recusa:
  plantar `hono` na raiz derruba **dois** testes de `tests/workspaces.test.ts`. O teste também
  cobre `devDependencies` da raiz, porque um `npm i -D hono` lá satisfaria a asserção de
  `dependencies` e ainda assim colocaria o pacote no programa da raiz, ao alcance de `src/`.
- **Descoberta ao escrever o teste: a raiz não tinha a chave `dependencies`.** O plano a
  referenciava em `package.json:27` e ela simplesmente não existia — o CLAUDE.md a trata como
  invariante e o `purity.test.ts:85-92` explica por que a igualdade é com `{}` e não com
  "sem chaves" (o npm apaga um objeto vazio no install). Sem a chave, `npm i` na raiz não
  teria nada com que colidir. Foi acrescentada.
- **As três pontas de integração que ninguém pega sozinho estão fechadas, e cada uma foi
  medida e não presumida.** `apps` não estava no `include` do `tsconfig.json` da raiz, então
  `typecheck:server` é o único lugar onde o servidor compila — e também o único onde os dois
  testes de servidor compilam, já que a raiz agora os exclui por precisarem de tipos de Node.
  `apps` não está no `ignores` do ESLint e continua não estando: um erro plantado em
  `apps/server/src/health.ts` foi recusado com dois erros, então o lint cobre o servidor de
  verdade.
- **A tabela `gold_entry` espelha o cliente, não o rascunho da pesquisa.** A reconciliação era
  o coração da Task 2 e as quatro divergências foram resolvidas a favor de
  `src/app/ledger.ts:41-53`: `amount` (assinado) e não `delta`, `at` e não `created_at`,
  **nenhuma** coluna de aparelho — um `notNull` que o cliente nunca produz tornaria toda
  inserção impossível — e `confirmed` anulável, a marca d'água que D2-02 pede por nome e que o
  rascunho omitia.
- **A idempotência tem prova de dado, não só de contrato.** O teste escreve uma linha entre a
  primeira e a segunda `migrateToLatest()`: se a segunda fizesse qualquer coisa, é essa linha
  que sumiria. Assertir só `results === []` seria uma afirmação sobre o array de resultados, e
  não sobre o banco. Isso importa porque a migração roda em **todo** start do serviço,
  incluindo os restarts que o systemd faz sozinho (D2-07).
- **O corpo do `/api/health` é asserido pelo que NÃO tem.** Igualdade de conjunto de chaves
  mais comprimento (`['db', 'release', 'status']`, exatamente 3), e a busca literal por `/`,
  `dg2.db`, `sqlite` e `Error` no corpo serializado. É o campo de depuração acrescentado com
  pressa daqui a duas fases que essas asserções existem para reprovar — esta é a única
  superfície do sistema lida a cada minuto por um serviço de terceiro (D2-21).
- **O `server.mjs` sai com `better-sqlite3` como especificador nu.** 557 KB, e o módulo nativo
  ficou externo — que é o que permite instalá-lo uma vez em `/srv/dg2/node_modules` e deixar a
  resolução do Node encontrá-lo subindo a árvore. Bônus verificado: `better-sqlite3` 13 embarca
  os prebuilds de `linux-x64` e `linux-arm64` **dentro do tarball**, sem `postinstall` nenhum —
  o risco A2 da pesquisa (VPS precisando de `build-essential` + `python3`) está descartado.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] `Migrator`, `Migration` e `MigrationProvider` não existem mais na raiz do `kysely`**

- **Found during:** Task 2
- **Issue:** O exemplo de `02-RESEARCH.md:1009` importa os símbolos de migração de `'kysely'`.
  Na 0.29.5 eles foram movidos para o subpath `'kysely/migration'`, e os nomes na raiz
  sobraram como sentinelas `KyselyTypeError<"import from 'kysely/migration' instead">`. O
  sintoma em runtime foi `TypeError: Migrator is not a constructor`, com os 7 testes falhando.
- **Fix:** `import type { Migration, MigrationProvider } from 'kysely/migration'` em
  `migrations.ts`, `import { Migrator } from 'kysely/migration'` em `index.ts` e nos dois
  testes. O `Kysely` em si continua vindo da raiz. A razão ficou escrita no cabeçalho de
  `migrations.ts`, apontando que a pesquisa descreve uma release anterior.
- **Files modified:** `apps/server/src/db/migrations.ts`, `apps/server/src/index.ts`,
  `tests/server-migrate.test.ts`, `tests/server-health.test.ts`
- **Commit:** e88d02b (e 0596af7 para os arquivos da Task 3)

**2. [Rule 3 - Blocking] O bundle do servidor entrou no lint e derrubou `npm run lint`**

- **Found during:** Task 3
- **Issue:** `npm run server:build` cria `dist-server/server.mjs`, que inlina hono e kysely.
  O ESLint o varreu e reportou **38 erros** — `no-this-alias`, `no-unused-expressions`,
  `no-unused-vars` — todos da fonte DELES, nenhum um defeito deste repositório. A entrada
  `'dist'` do `ignores` não cobre: em flat config ela casa por segmento de caminho.
- **Fix:** `'dist-server'` acrescentado ao `ignores`, ao lado de `'dist'`, `'packages/*/dist'` e
  `'tests/pwa/fixtures'`, com o comentário no mesmo tom dos que já estavam ali. `apps/server/src`
  — a entrada, não o artefato — continua lintado, e isso foi provado por recusa depois da
  mudança.
- **Files modified:** `eslint.config.js`
- **Commit:** 0596af7

**3. [Rule 2 - Missing] A raiz não declarava `dependencies`**

- **Found during:** Task 1
- **Issue:** O plano referencia `dependencies: {}` em `package.json:27` como a invariante que
  D2-04 protege. A chave não existia no arquivo. `tests/workspaces.test.ts` precisa assertir
  igualdade estrita com `{}`, e `expect(undefined).toEqual({})` reprova — corretamente, porque
  uma chave ausente é uma invariante invisível para quem lê o manifesto.
- **Fix:** `"dependencies": {}` acrescentado à raiz, antes de `devDependencies`.
- **Files modified:** `package.json`
- **Commit:** e888007

### Divergências deliberadas dos critérios de aceitação

Três critérios de aceitação do plano são `grep` sobre um token que a **ação** do mesmo plano
manda escrever num comentário. São contradições internas, e foram resolvidas sempre a favor
do critério executável, reescrevendo o comentário para preservar a informação:

| Token | Critério | Ação do plano | Resolução |
|---|---|---|---|
| `device_id` | `grep -c` deve dar 0 em `migrations.ts` | "Escrever isso num comentário da migração" | O comentário diz "not-null per-device identifier column", sem o literal |
| `FileMigrationProvider` | `grep -c` deve dar 0 em `migrations.ts` | "Comentário explicando" por que não é usado | O comentário diz "the file-reading provider Kysely ships in 'kysely/migration'" |
| `SIM_VERSION` | `grep -c` deve dar 0 em `apps/server/src/` | "Comentário registrando o que não entra no corpo, item por item: [...] e `SIM_VERSION`" | O comentário de `health.ts` diz "the simulation version hash", com o caminho `packages/sim/dist/sim-version.json` para quem for procurar |

Um quarto caso, `0.0.0.0` em `index.ts`, foi resolvido igual: o comentário diz "binding every
interface instead — the default if this argument is dropped".

### Desvio de sequenciamento

O critério da Task 1 `npm run typecheck:server` sai 0 é insatisfazível na Task 1: `apps/server/src`
só nasce na Task 2, e `tsc` reprova com **TS18003 (No inputs were found)** num programa vazio.
O commit da Task 1 (`e888007`) é verde em `lint`, `tsc --noEmit` da raiz e `npm test`, e vermelho
apenas nesse script; a partir do commit da Task 2 (`e88d02b`) ele fica verde e assim permanece.
O próprio plano já o re-verifica no `<verify>` das Tasks 2 e 3.

## Notas para os próximos planos

- **`ops/README.md` ainda não registra o `/srv/dg2/node_modules`.** O plano afirma que ele "já
  registra" que `better-sqlite3` é instalado uma vez ali, de onde a resolução de especificador
  nu do `server.mjs` o alcança. Não registra — `ops/README.md` não menciona `node_modules` nem
  `better-sqlite3` em lugar nenhum. `ops/` não está no `files_modified` deste plano e não foi
  tocado; **02-10 ou 02-11 precisa escrever isso**, ou o primeiro deploy vai falhar com
  `ERR_MODULE_NOT_FOUND` num módulo que o bundle deliberadamente não carrega.
- **`apps/server/package.json` não declara `main`/`types`/`exports`,** ao contrário do molde de
  `packages/protocol`. É deliberado: `index.ts` tem efeito colateral (abre banco, escuta porta),
  e anunciá-lo como ponto de entrada importável convidaria alguém a fazê-lo.

## Threat Flags

Nenhuma superfície de segurança fora do `<threat_model>` do plano. As cinco disposições
`mitigate` que tocam este plano estão implementadas e cobertas por asserção: T-2-BIND
(`hostname: '127.0.0.1'`), T-2-LEAK (igualdade de conjunto de chaves + ausência de caminho no
corpo), T-2-LOOP (`process.exit(1)` antes de `serve()`), T-2-DATA (`PRIMARY KEY` no ULID,
`amount` assinado, regra aditiva escrita na migração) e T-2-DEPLEAK (`tests/workspaces.test.ts`).

## Verification

| Portão | Resultado |
|---|---|
| `npm run lint` | 0 |
| `npx tsc --noEmit` | 0 |
| `npm run typecheck:sim` / `:protocol` / `:pwa` / `:server` | 0, 0, 0, 0 |
| `npm test` | **459 passed** (41 arquivos) |
| `npm run server:build` | `dist-server/server.mjs`, 557,5 KB |
| `better-sqlite3` externo como especificador nu | `from "better-sqlite3"` presente no bundle |
| `npm run build && npm run sw:verify` | 0 — `dg2-eed6d644b928dd75`, 13 caminhos |
| `npx playwright test tests/pwa/*.spec.ts` | **3/3** |
| `tests/workflows.test.ts` | verde após a mudança no `ci.yml`, sem ter sido enfraquecido |

**Provas de recusa executadas:**

1. `dependencies: { hono }` plantado na raiz → 2 testes de `workspaces.test.ts` reprovam.
2. Sétima coluna acrescentada à migração → 2 testes de `server-migrate.test.ts` reprovam.
3. `const unusedProbe: any = 1` plantado em `apps/server/src/health.ts` → lint reprova com 2
   erros, provando que o servidor está coberto.

Todas as três foram revertidas e o portão voltou a verde.

## Known Stubs

Nenhum. A tabela `gold_entry` não é escrita por nada nesta fase, mas isso é a decisão do
plano e não um stub: o ledger continua no `localStorage` do cliente (D-29) até a fase 6, e a
tabela existe para que INFRA-04 tenha o que restaurar.
