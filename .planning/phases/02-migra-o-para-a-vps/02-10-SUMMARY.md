---
phase: 02-migra-o-para-a-vps
plan: 10
subsystem: infra
tags: [systemd, litestream, sqlite, backup, restore, tls, certificate, openssl, cgroup, sandbox, better-sqlite3, ops]

# Dependency graph
requires:
  - phase: 02-08
    provides: "apps/server, o server.mjs empacotado com better-sqlite3 externo, a tabela gold_entry e a coluna amount"
  - phase: 02-03
    provides: "ops/ — layout de disco, os dois symlinks, o contrato de falha em shell e tests/ops-config.test.ts"
provides:
  - "ops/dg2.service — supervisão com limite de início, sandbox e o par MemoryMax/heap do V8"
  - "ops/litestream.service e ops/litestream.yml — réplica contínua do WAL para bucket S3-compatível, com replica no singular"
  - "ops/cert-check.{sh,service,timer} — a perna local de D2-16, conferindo o certificado servido na 443"
  - "tools/ops/restore-verify.mjs — restauração para diretório descartável e comparação de conteúdo"
  - "ops/README.md §10 e §11 — ordem de instalação das units, a cadeia de alarme, e o passo manual de /srv/dg2/node_modules"
affects: [02-12, fase-3-signaling, fase-6-contas]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Unit de systemd com limite de início explícito, para que a falha vire estado failed em vez de laço"
    - "Teto de memória do cgroup sempre pareado com o teto de heap do runtime"
    - "Verificação de backup por consulta de conteúdo, nunca por diff binário"
    - "Alarme por código de saída de unit oneshot, sem notificação embutida no script"

key-files:
  created:
    - ops/dg2.service
    - ops/litestream.service
    - ops/litestream.yml
    - ops/cert-check.sh
    - ops/cert-check.service
    - ops/cert-check.timer
    - tools/ops/restore-verify.mjs
  modified:
    - ops/README.md
    - tests/ops-config.test.ts

key-decisions:
  - "A lacuna do /srv/dg2/node_modules que 02-08 achou foi fechada aqui, com o passo manual documentado em §3 e asserido por teste"
  - "cert-check.service roda como dg2 num sandbox, e não como root, apesar de só ler um certificado público"
  - "litestream.service ganhou StartLimitIntervalSec/StartLimitBurst explícitos, que o plano não pedia"
  - "restore-verify.mjs aceita LITESTREAM_CONFIG do ambiente, com o caminho instalado como padrão"
  - "O runbook ganhou seções 10 e 11 no fim, sem renumerar as existentes, para não quebrar as referências de ops/deploy.sh e ops/litestream.yml"

patterns-established:
  - "Toda linha de ops/ que nomeia uma credencial traz o ${...} junto, o que torna um grep de uma linha um detector de vazamento sem julgamento"
  - "Asserção de par (MemoryHigh < MemoryMax, heap < MemoryHigh) em vez de asserção de presença, quando o defeito é a desproporção e não a ausência"
  - "O teste de ops/ passou a cobrir tools/ops/ pelo mesmo arquivo, com um segundo glob e o mesmo guarda anti-vacuidade"

requirements-completed: [INFRA-01, INFRA-04]

# Metrics
duration: 19min
completed: 2026-09-01
---

# Phase 02 Plan 10: Units, réplica contínua e ensaio de restauração — Summary

**A cadeia "supervisão → teto de memória → alarme quando quebra → backup contínuo → restauração conferível" existe inteira em diff, com o `replica` singular do Litestream v0.5, o par `MemoryMax`/`--max-old-space-size`, o limite de início que faz a unit chegar a `failed`, e a coluna `amount` que a tabela realmente tem.**

## Performance

- **Duration:** 19 min
- **Started:** 2026-09-01T00:29:00Z (horário local -03:00)
- **Completed:** 2026-09-01T00:48:09-03:00
- **Tasks:** 3 de 3
- **Files modified:** 9 (7 criados, 2 alterados)

## Accomplishments

- **As cinco armadilhas medidas nasceram fechadas.** `StartLimitIntervalSec=60` +
  `StartLimitBurst=5` (P-9), o par `MemoryMax=256M` + `--max-old-space-size=192` (P-10), o
  `replica` singular do Litestream v0.5 (P-8), o `-checkend` contra o certificado servido e não
  o arquivo em disco (T-2-TLS), e a sonda em `sum(amount)` em vez de `sum(delta)`.
- **A lacuna que 02-08 encontrou e não pôde fechar está fechada.** `ops/README.md` §3 ganhou
  uma subseção inteira sobre `npm i --prefix /srv/dg2 better-sqlite3@13.0.3`: por que o bundle
  deixa o especificador nu, como o Node o resolve subindo do caminho **real** do release até
  `/srv/dg2/node_modules`, por que o `WorkingDirectory` não participa disso, e quando repetir
  (troca de major do Node ou da versão do pacote). `dg2.service` carrega o mesmo raciocínio em
  comentário, ao lado do `ExecStart`. Sem isso, o primeiro `systemctl start dg2` morria com
  `ERR_MODULE_NOT_FOUND` antes de abrir o banco.
- **O runbook passou de 217 para 395 linhas**, com duas seções novas: §10 (as quatro units, a
  ordem de instalação em seis passos, e a cadeia de alarme escrita ponta a ponta) e §11 (o
  backup contínuo e o ensaio de restauração, incluindo por que ele **não** vira timer).
- **`tests/ops-config.test.ts` passou de 17 para 40 asserções**, e passou a cobrir `tools/ops/`
  pelo mesmo arquivo. A suíte inteira foi de 464 para 487 testes.
- **O `cert-check.sh` foi executado de verdade**, contra um host real e contra dois caminhos de
  falha — não é só `sh -n`.

## Task Commits

1. **Task 1: `dg2.service` e a replicação contínua do banco** — `15f11cd` (feat)
2. **Task 2: `cert-check` — a perna local da vigilância** — `c638a95` (feat)
3. **Task 3: `restore-verify.mjs` — restaurar de verdade e conferir conteúdo** — `7318afa` (feat)

## Files Created/Modified

- `ops/dg2.service` (99 linhas) — supervisão da API. Limite de início, sandbox de 12
  diretivas, `StateDirectory=dg2` em vez de exceção de escrita à mão, `ExecStart` pelo symlink
  `current-server` para o rollback trocar o binário junto, e o par de memória.
- `ops/litestream.service` (62 linhas) — a réplica, irmã e não filha de `dg2.service`:
  `Wants=`, nunca `Requires=`, para que o backup sobreviva ao Node cair. `ReadWritePaths`
  explícito porque esta unit não declara `StateDirectory`. `MemoryMax=64M`.
- `ops/litestream.yml` (39 linhas) — `dbs` com uma entrada e `replica` **singular**.
  Bucket, endpoint e credenciais como referência de ambiente; nenhum valor.
- `ops/cert-check.sh` (60 linhas, modo `100755`) — abre TLS na 443, extrai o certificado e
  passa ao `-checkend` de 30 dias. O código de saída é o mecanismo inteiro.
- `ops/cert-check.service` (36 linhas) — `oneshot` sem `Restart`, para a unit poder **ficar**
  `failed`. Sem `[Install]`: quem é habilitado é o timer.
- `ops/cert-check.timer` (22 linhas) — `OnCalendar=daily`, `RandomizedDelaySec=1h`,
  `Persistent=true`.
- `tools/ops/restore-verify.mjs` (140 linhas) — restaura com `litestream restore -o` para um
  `mkdtempSync` e compara `count(*) || '|' || coalesce(sum(amount), 0)` nos dois bancos.
- `ops/README.md` (217 → 395 linhas) — §1, §2 e §3 atualizados; §10 e §11 novas.
- `tests/ops-config.test.ts` (17 → 40 asserções) — units, yml, cert-check, runbook e
  `tools/ops/`.

## Decisions Made

**O runbook ganhou seções no fim, sem renumerar.** `ops/deploy.sh` referencia §4 e
`ops/litestream.yml` referencia §3; nada referencia §8 ou §9 (verificado por grep em todo o
repositório). Inserir as units como §8 teria empurrado duas seções e deixado referências
válidas em texto e inválidas em intenção. §10 e §11 no fim custam uma leitura menos linear e
não custam correção nenhuma.

**`cert-check.service` roda como `dg2` num sandbox.** O plano só pedia `Type=oneshot`,
`EnvironmentFile` e `ExecStart`. Rodar como root um script que abre conexão de rede e faz pipe
entre dois processos `openssl` é privilégio sem contrapartida. A unit não declara `[Install]`
de propósito: habilitar o `.service` de um par timer/service é o erro clássico, e a ausência da
seção faz o `systemctl enable cert-check.service` recusar em vez de criar um serviço que roda
uma vez no boot e nunca mais.

**`restore-verify.mjs` lê `LITESTREAM_CONFIG` do ambiente**, com `/etc/litestream.yml` como
padrão. O padrão é o que a caixa usa; a variável é o que torna o script testável fora dela sem
editar o arquivo. Não muda o comportamento na VPS.

**`process.exit(main())` em vez de `process.exit(1)` no meio.** O `finally` que apaga o
diretório temporário está dentro de `main()`, e uma saída no meio do `try` o puliaria — o
arquivo restaurado é uma cópia completa do ledger, e deixá-lo em `/tmp` faria do verificador o
vazamento. O caminho de divergência devolve 1 em vez de lançar, porque uma divergência é a
**resposta** do script, não um acidente interno, e merece o ponteiro `/gold_entry` em vez de
ser embrulhada como erro genérico.

**A sonda usa `count(*)` E a soma.** Contagem sozinha sobrevive a uma restauração que perdeu
todos os valores; a soma sozinha sobrevive a uma que fundiu duas linhas numa. As duas juntas
pegam os dois casos.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing critical functionality] O passo de produção de `better-sqlite3` não estava documentado em lugar nenhum**

- **Found during:** Task 3 (e sinalizado pelo prompt, a partir do SUMMARY de 02-08)
- **Issue:** `server:build` deixa `better-sqlite3` como especificador nu de propósito (é módulo
  nativo; esbuild não empacota `.node`). `ops/README.md` não mencionava `node_modules` nem
  `better-sqlite3` em lugar nenhum, e nenhum plano da fase possuía os dois arquivos ao mesmo
  tempo. O primeiro `systemctl start dg2` morreria com `ERR_MODULE_NOT_FOUND` antes de abrir o
  banco — e, porque a migração roda antes de aceitar requisição, o sintoma seria a unit em
  `failed` com um erro de import, sem nada no runbook para explicar.
- **Fix:** subseção nova em `ops/README.md` §3 com o comando, o mecanismo de resolução, o
  motivo de o diretório ficar **acima** das árvores de release (sobrevive a deploy e a
  reversão), a confirmação de que a caixa não precisa de toolchain, e quando repetir. Linha
  nova em §2 (layout de disco), passo 2 da ordem de instalação em §10, e um comentário no
  `ExecStart` de `dg2.service`.
- **Files modified:** `ops/README.md`, `ops/dg2.service`
- **Verification:** teste novo `o runbook registra o node_modules de produção e o CLI que a
  restauração usa` assere `better-sqlite3`, `/srv/dg2/node_modules` e `ERR_MODULE_NOT_FOUND` no
  runbook.
- **Committed in:** `15f11cd` (o comentário na unit) e `7318afa` (o runbook)

**2. [Rule 2 - Missing critical functionality] `ops/README.md` tocado na Task 1, uma tarefa antes do previsto**

- **Found during:** Task 1
- **Issue:** o critério de aceitação da Task 1 diz que
  `grep -rn 'AWS_SECRET_ACCESS_KEY' ops/ | grep -v '${'` não imprime nada. A linha
  `| \`AWS_SECRET_ACCESS_KEY\` | credencial da réplica |` de `ops/README.md`, escrita em 02-03,
  já violava isso — nomeia a chave sem trazer o `${`. O critério só passaria depois da Task 3,
  que é quem possui o README no plano.
- **Fix:** as duas linhas de credencial da tabela de §5 passaram a escrever a forma
  interpolada, e o parágrafo seguinte registra **por quê**: com a convenção "toda ocorrência do
  nome traz o `${...}` junto", aquele grep vira um detector de vazamento que não precisa de
  julgamento para ser lido — qualquer saída é um achado. `ops/README.md` está no
  `files_modified` do plano, então nada fora do conjunto foi tocado.
- **Files modified:** `ops/README.md`
- **Verification:** teste novo `toda linha que nomeia uma credencial traz o ${...} junto`,
  cobrindo as duas chaves em todo arquivo de `ops/`.
- **Committed in:** `15f11cd`

**3. [Rule 2 - Missing critical functionality] `litestream.service` ganhou limite de início, que o plano não pedia**

- **Found during:** Task 1
- **Issue:** o plano especifica `Restart=always` para a unit da réplica e não menciona
  `StartLimit*`. Litestream não sai por falha de rede (ele mesmo repete), mas **sai** por erro
  de configuração ou credencial errada — exatamente os dois erros que este plano pode conter,
  já que nada aqui jamais rodou. Sem limite, uma credencial errada vira laço invisível e o
  backup fica "rodando" por meses sem ter replicado um byte. É o mesmo P-9, na unit que menos
  perdoa.
- **Fix:** `StartLimitIntervalSec=60` + `StartLimitBurst=5` em `[Unit]`, com o comentário
  explicando a diferença entre blip de rede e erro de configuração.
- **Files modified:** `ops/litestream.service`
- **Verification:** `npx vitest run tests/ops-config.test.ts` verde; a asserção de irmandade
  (`Wants=`, nunca `Requires=`/`BindsTo=`) cobre a unit.
- **Committed in:** `15f11cd`

**4. [Rule 2 - Missing critical functionality] Sandbox em `cert-check.service`**

- **Found during:** Task 2
- **Issue:** o plano pede `Type=oneshot`, `EnvironmentFile`, `ExecStart` e "sem `Restart`" — o
  que, sem `User=`, deixaria a unit rodando como root.
- **Fix:** `User=dg2`/`Group=dg2` mais o mesmo bloco de sandbox das outras units, reduzido ao
  que um script que só abre uma conexão TLS precisa.
- **Files modified:** `ops/cert-check.service`
- **Verification:** o script foi executado de fato contra `example.com` (saída 0, uma linha),
  contra `DG2_DOMAIN` ausente (saída 1, mensagem do `:?`) e contra um host inexistente (saída
  1, `cert-check.sh:host:443: não consegui completar o handshake TLS`).
- **Committed in:** `c638a95`

### Critério de aceitação que não fecha na forma literal

**`grep -c 'mkdtemp' tools/ops/restore-verify.mjs` retorna 2, e não 1.** O import nomeado
(`import { mkdtempSync, rmSync } from 'node:fs';`) e a chamada são duas linhas, e a contagem do
`grep -c` é de linhas. O esqueleto de referência do próprio plano
(`02-RESEARCH.md:1243`) tem exatamente a mesma contagem, então o critério está mal-especificado
e não descreve nenhum código alcançável com import nomeado. Fechá-lo exigiria import de
namespace (`import * as fs`), que contraria a convenção de `tools/sim-version/verify.mjs` e de
`tools/golden/rebaseline.mjs` — contorcer o código para satisfazer um `grep` seria trocar uma
convenção real por um número. A propriedade que o critério quer (o script cria diretório
temporário novo e limpa atrás de si) está asserida por teste. Os outros quatro critérios do
mesmo bloco — `sum(amount)`=1, `sum(delta)`=0, `finally`=1, `gold_entry`≥1 — fecham na forma
literal.

---

**Total deviations:** 4 auto-corrigidas (4× Rule 2), mais um critério de aceitação
documentado como mal-especificado.
**Impact on plan:** nenhuma expansão de escopo. Três das quatro são endurecimento de
configuração de segurança/confiabilidade na exata superfície que o plano criou; a quarta é uma
linha de documentação tocada uma tarefa antes. Nenhum arquivo fora do `files_modified` do plano
foi alterado.

## Issues Encountered

**A worktree veio sem `node_modules`.** Resolvido com `npm ci` a partir do lockfile —
`package.json` e `package-lock.json` não são deste plano e não foram tocados. 0
vulnerabilidades.

**O `-checkend` do `openssl` não aceita certificado por pipe sem `-noout`.** A forma do
esqueleto da pesquisa (`openssl s_client | openssl x509 -noout -checkend N`) funciona, mas
engole a distinção entre "não conectou" e "certificado vence em breve": num pipe, o status é o
do último comando. O script separa as duas etapas — captura o certificado numa variável,
verifica se veio vazio, e só então roda o `-checkend` — para que cada modo de falha tenha a sua
própria mensagem. Confirmado executando os três caminhos.

**Comentário que reprovava a própria asserção.** O comentário original de `dg2.service` sobre
`StateDirectory` dizia "implies `ReadWritePaths` for it", o que fazia
`grep -c 'ReadWritePaths' ops/dg2.service` retornar 1 quando o critério exige 0. Reescrito para
"grants this unit write access to it" — mesma informação, sem a string. Mesma classe de
problema resolvida no cabeçalho de `cert-check.sh`, que não pode conter a substring `mail`
(está dentro de "e-mail") nem `checkend` duas vezes.

## User Setup Required

Nada é configurável desta máquina, e nada deste plano roda aqui. **O plano 02-12 executa tudo
isto na VPS**, e as pendências que ele herda são:

- criar o bucket S3-compatível e as credenciais, e escrevê-las em `/etc/dg2/env`
  (`LITESTREAM_BUCKET`, `LITESTREAM_ENDPOINT`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`);
- instalar o binário do Litestream 0.5.16 em `/usr/local/bin` e o `sqlite3` e `openssl` da
  distribuição;
- rodar `npm i --prefix /srv/dg2 better-sqlite3@13.0.3` **antes** do primeiro start;
- contratar o monitor externo de `/api/health` com keyword `"status":"ok"` (D2-21) — a segunda
  perna de D2-16, que este plano não pode criar;
- rodar `node tools/ops/restore-verify.mjs` uma vez e registrar data, tempo e o que faltou em
  `docs/`.

## Next Phase Readiness

**Pronto:** os quatro arquivos de unit, a configuração da réplica e o verificador de
restauração existem, são revisáveis em diff, e estão cobertos por 40 asserções estruturais. A
ordem de instalação está escrita em seis passos numerados. O `ExecStart` pelo symlink fecha o
contrato com `ops/rollback.sh`.

**A ressalva que continua valendo, e que 02-03 já registrava:** nada em `ops/` jamais rodou
contra um sistema de arquivos real. `sh -n` prova sintaxe, `vitest` prova estrutura, e nenhum
dos dois prova comportamento. O que este plano acrescenta ao lado honesto da conta é que
`cert-check.sh` **foi** executado de fato, contra um host real e contra dois caminhos de falha,
e que `restore-verify.mjs` foi executado até o ponto em que a ausência do `litestream` o para —
provando o contrato de falha e a limpeza do diretório temporário, mas não a restauração.

**Bloqueadores para 02-12:** nenhum técnico. Os itens de §"User Setup Required" são todos
operação na caixa, que é o que 02-12 é.

## Self-Check: PASSED

Arquivos criados, todos presentes:
`ops/dg2.service`, `ops/litestream.service`, `ops/litestream.yml`, `ops/cert-check.sh`,
`ops/cert-check.service`, `ops/cert-check.timer`, `tools/ops/restore-verify.mjs`.

Commits, todos presentes em `git log`: `15f11cd`, `c638a95`, `7318afa`.

Portões verdes na ponta: `npm test` 487/487 · `npm run lint` · `npx tsc --noEmit` ·
`npm run typecheck:server` · `sh -n ops/cert-check.sh` · `node --check tools/ops/restore-verify.mjs` ·
`grep -rn 'AWS_SECRET_ACCESS_KEY' ops/ | grep -v '${'` sem saída.

---
*Phase: 02-migra-o-para-a-vps*
*Completed: 2026-09-01*
