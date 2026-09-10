---
phase: 02-migra-o-para-a-vps
plan: 14
subsystem: infra
tags: [docker, docker-compose, coolify, litestream, caddy, traefik, coturn, ghcr, sqlite, runbook]

# Dependency graph
requires:
  - phase: 02-migra-o-para-a-vps
    provides: "o `ops/Caddyfile` de contêiner com `{$DG2_UPSTREAM:api:8080}` e `root * /srv/www`, e o `DG2_BIND` configurável (02-13); a caixa provada, A1 demonstrada, o primeiro certificado emitido e as quatro regras de UFW abertas (02-04); o desligamento gracioso com `SHUTDOWN_GRACE_MS` (02-08)"
provides:
  - "`ops/docker-compose.yml`: dois serviços, DOIS volumes persistentes (banco e réplica, D2-33), tag por sha, `pull_policy: missing`, `stop_grace_period` de 30s, tetos de cgroup e de heap em par, healthcheck — e quatro ausências declaradas com o motivo"
  - "`ops/Dockerfile.api`: Node 24.20.0 LTS, Litestream 0.5.17 por sha256 verificado em camada própria, `npm ci` antes do bundle, os dois diretórios de volume com dono não-root, e o Litestream como PID 1 envolvendo o Node por `-exec`"
  - "`ops/Dockerfile.web`: Caddy 2.11.4-alpine copiando o Caddyfile do 02-13 e o `dist/` do portão cross-engine; a ausência de `USER` registrada como escolha"
  - "`ops/litestream.yml`: réplica `file` em volume persistente próprio, sem nenhuma variável de bucket (D2-33)"
  - "`ops/README.md` reescrito: runbook executável por um operador que nunca viu esta caixa, com `sudo docker` em todo lugar, a reversão por `DG2_IMAGE_TAG` sem rede, e as QUATRO regras de firewall do relay"
  - "Nove arquivos aposentados e 34 asserções removidas no MESMO commit, com cada propriedade do `dg2.service`/`litestream.service` ou herdada sobre a composição ou morta por decisão registrada"
  - "O piso anti-vacuidade descido de 13 para 9 com a conta escrita, IGUAL à contagem real — provado por remoção"
  - "A asserção de que nenhum serviço declara `ports:`, que é de quem depende a segurança do `DG2_BIND=0.0.0.0` e que o comentário do `serve()` nomeia"
affects: [02-15, 02-12, 03-04, 03-11]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Asserção que compara DOIS arquivos entre si em vez de cada um contra um literal no teste: o caminho do banco (compose ↔ litestream.yml), a raiz estática (Dockerfile.web ↔ Caddyfile), o caminho do `-config` (ENTRYPOINT ↔ COPY) e a cota do relay (README ↔ turnserver.conf)"
    - "Piso anti-vacuidade IGUAL à contagem real, não com folga: remover qualquer arquivo do subsistema fica vermelho pelo piso, que é o que torna a prova por remoção possível"
    - "Herdeira nomeada: cada asserção nova sobre a composição cita, em comentário, de qual asserção morta ela é herdeira — e as que morrem sem herdeira vão para o SUMMARY com o motivo"
    - "Exceção de gate por lista de tokens EXATOS, nunca por afrouxamento de regra: três listas novas (hosts de artefato público, valores internos de contêiner, sufixos que não são TLD) em vez de relaxar a varredura de D2-15"
    - "Valor que um teste precisa comparar não pode morar só no painel: o caminho da réplica é literal em git precisamente porque a must-have de D2-33 é comparável contra o volume"

key-files:
  created:
    - ops/docker-compose.yml
    - ops/Dockerfile.api
    - ops/Dockerfile.web
  modified:
    - ops/README.md
    - ops/litestream.yml
    - ops/coturn-dropin.conf
    - ops/turnserver.conf
    - tests/ops-config.test.ts
    - tools/ops/restore-verify.mjs
    - apps/server/src/shutdown.ts
    - apps/server/src/health.ts
    - apps/server/src/db/migrations.ts
    - apps/server/src/signaling/index.ts
    - .gitattributes

key-decisions:
  - "O caminho da réplica é LITERAL em `ops/docker-compose.yml` e chega a `ops/litestream.yml` por `${DG2_REPLICA_PATH}`: a must-have de D2-33 é que a réplica viva num volume persistente, e um valor que só o painel conhece é um valor que nenhum teste pode comparar contra um ponto de montagem"
  - "Dois volumes nomeados com pontos de montagem DISTINTOS (`/var/lib/dg2` e `/var/lib/dg2-replica`), não um subdiretório do volume do banco: um subdiretório satisfaria \"persistente\" e faria o `restore` ler de dentro do que está restaurando"
  - "Nenhum `ARG` no bloco do Litestream: um `ARG` é sobrescritível por `--build-arg`, então um pin expresso como `ARG` é um pin que qualquer um no caminho de build levanta"
  - "`ops/Dockerfile.web` não declara `USER`, e a ausência está escrita: o Caddy escreve no diretório de dados dele ao subir, a imagem alpine não traz usuário preparado, e este contêiner não publica porta, não monta volume e não abre banco"
  - "A lista `SCRIPTS` foi invertida em vez de apagada, e ganhou a metade das units: `ops/` não pode ter nenhum `.sh` nem nenhum `.service`/`.timer`"
  - "As duas asserções de credencial de bucket, que D2-33 tornou vazias, viraram UMA mais forte — as quatro variáveis não são nomeadas em lugar nenhum de `ops/` nem de `tools/ops/` — em vez de ficarem verdes sobre um palheiro vazio"
  - "DEF-02-01 fica adiado com dono nomeado (a primeira wave da fase 3 que tocar `env.ts`) e com o texto substituto JÁ DECIDIDO, porque era o runbook que faltava para decidi-lo"

patterns-established:
  - "Quando um plano apaga um arquivo, ele é dono de TODA referência pendurada a esse arquivo no repositório — não só das suas próprias. Dez foram fechadas aqui, em seis arquivos de `apps/` e `tests/`"
  - "Medição datada não se apaga quando o sujeito morre: a provação de WR-14 cita `ops/rollback.sh` stubbed, e ganhou uma nota de que o arquivo foi aposentado em vez de perder a proveniência"
  - "Restauração de mutação deliberada a partir de CÓPIA fora da árvore, conferida com `cmp` e reconferida por grep em TODAS as edições — nunca `git checkout --`"

requirements-completed: []  # INFRA-04 segue PARCIAL — ver "Issues Encountered" item 5

# Metrics
duration: 29min
completed: 2026-09-10
---

# Phase 02 Plan 14: `ops/` virou uma composição de dois contêineres Summary

**`ops/` trocou uma máquina vazia com systemd por dois Dockerfiles, uma composição com dois volumes persistentes e um runbook executável — e os nove arquivos que a containerização aposentou saíram no mesmo commit que suas 34 asserções, com o piso anti-vacuidade descido para a contagem real e provado por remoção.**

## Performance

- **Duration:** ~29 min
- **Started:** 2026-09-10T15:22:56Z (12:22 local)
- **Completed:** 2026-09-10T15:51:25Z (12:51 local)
- **Tasks:** 3/3
- **Files modified:** 16 (3 criados, 12 modificados, 10 apagados)

## Accomplishments

- **A composição que o Coolify lê existe**, com os dois volumes que D2-33 exige e com as quatro ausências (rede própria, porta no host, passo de build, label do Traefik) cada uma acompanhada do motivo — e com a consequência da tag compartilhada escrita no arquivo, para que a diferença entre "decidimos assim" e "não percebemos" seja só o parágrafo.
- **As duas imagens não constroem nada.** Ambas copiam artefatos que passaram pelo portão cross-engine (D2-05/D2-23), e o binário de terceiro que abre o banco entra com sha256 verificado numa camada própria, antes de ser extraído.
- **Os nove arquivos e as 34 asserções morreram juntos**, e cada uma das dez propriedades que as duas units garantiam foi percorrida uma a uma: sete ganharam herdeira asserida sobre a composição, três morreram por decisão registrada.
- **O piso anti-vacuidade corresponde ao conteúdo real e foi provado por remoção** — o defeito que WR-14 encontrou e que DM-20 avisou que voltaria não voltou.
- **O runbook é executável por quem nunca viu a caixa**, e diz `sudo` em todo comando de Docker, abre **quatro** regras de firewall em vez de três, e carrega a perda declarada de P-9 em voz alta.
- **Dez referências a arquivo apagado fechadas** em `apps/` e `tests/` — a outra metade do trabalho que uma remoção cria, e que o 02-13 tinha nomeado como padrão.

## Task Commits

1. **Task 1: As duas imagens, a composição, e as asserções que as prendem** — `86cb82a` (feat)
2. **Task 2: Os nove arquivos e os 34 casos, no mesmo commit — e o piso que corresponde ao conteúdo** — `fd46480` (refactor)
3. **Task 3: O runbook reescrito para a caixa que existe** — `142f9df` (docs)

## Files Created/Modified

**Criados**

- `ops/docker-compose.yml` — dois serviços, dois volumes nomeados, tag por sha, `pull_policy: missing`, `stop_grace_period: 30s`, `mem_limit` + teto de heap do V8 em par, healthcheck pelo loopback do contêiner
- `ops/Dockerfile.api` — Node 24.20.0-trixie-slim; `sqlite3`/`ca-certificates`/`wget` numa camada; Litestream 0.5.17 verificado por sha256; manifestos antes do bundle; os dois diretórios de volume dados ao usuário `node` antes do `USER`; `ENTRYPOINT` com `-exec`
- `ops/Dockerfile.web` — Caddy 2.11.4-alpine; copia `ops/Caddyfile` e `dist/` para `/srv/www`

**Apagados**

- `ops/probe/docker-compose.yml` — o andaime que provou A1 (ver "Issues Encountered" sobre o ponteiro do Coolify)
- `ops/deploy.sh`, `ops/rollback.sh`, `ops/deploy-forced.sh`, `ops/prune-releases.sh`, `ops/dg2.service`, `ops/cert-check.sh`, `ops/cert-check.service`, `ops/cert-check.timer` — D2-30
- `ops/litestream.service` — **não está na lista literal de D2-30**; morre por D2-28, porque o Litestream deixou de ser unit e virou PID 1 do contêiner

**Modificados**

- `ops/README.md` — reescrito: 14 seções, 548 linhas, `sudo docker` em oito lugares, §12 (coturn) mantida e corrigida
- `ops/litestream.yml` — réplica `file`; a prosa aponta para o `COPY` da imagem e para o painel
- `ops/coturn-dropin.conf`, `ops/turnserver.conf` — ponteiros de seção e referências a arquivo apagado
- `tests/ops-config.test.ts` — 84 → 63 casos; três listas de tokens exatos; piso 13 → 9
- `tools/ops/restore-verify.mjs`, `apps/server/src/{shutdown,health,db/migrations,signaling/index}.ts`, `tests/server-{shutdown,health,migrate}.test.ts`, `.gitattributes` — referências penduradas
- `.planning/phases/02-migra-o-para-a-vps/deferred-items.md` — DEF-02-02 resolvido; DEF-02-01 com dono; DEF-02-03 e DEF-02-04 novos

## A conta dos testes — a contagem caiu, e isso é correto

Este é o único plano da fase em que a suíte encolher é o resultado esperado.

| Etapa | `tests/ops-config.test.ts` | `npm test` |
|---|---:|---:|
| Baseline | 84 | 936 |
| Task 1 (+12 casos novos) | 96 | 948 |
| Task 2 (−34 mortos, +1 invertido) | 63 | 915 |
| Task 3 (+1 no README, −1 fundido no D2-15) | 63 | 915 |
| **Saldo** | **−21** | **−21** |

**Saíram 34**, exatamente os que DM-20 contou: 18 do bloco de scripts, 7 do
`dg2.service`, 3 do `litestream.service`, 6 de `cert-check`. **Entraram 14** (12 na
Task 1, a asserção invertida de `SCRIPTS` na Task 2, e uma no bloco do README na
Task 3), e **uma saiu por fusão** — as duas asserções de credencial de bucket que
D2-33 tornou vazias viraram uma só, mais forte. Nada disso é regressão: `npm test`
fecha verde em 915/60, `lint` em 0 e `typecheck:server` em 0.

Nenhuma falha intermitente apareceu em nenhuma das seis execuções completas.

## A herança das dez propriedades, uma a uma

Percorrida antes de apagar, como a Task 2 manda.

| Propriedade que morreu | Destino |
|---|---|
| `MemoryMax`/`MemoryHigh` + `--max-old-space-size` em par (P-10) | **Herdeira**: `mem_limit` do `api` e o teto de heap, comparados, e o `web` também com teto |
| `User=dg2`, nunca root | **Herdeira**: `ops/Dockerfile.api` declara `USER` e o valor não é root |
| `ExecStart` pelo symlink que o rollback move | **Herdeira**: toda imagem por `${DG2_IMAGE_TAG}`, nenhuma por tag móvel |
| "não publica a API fora do loopback" | **Herdeira, em forma mais forte**: nenhum serviço declara `ports:` |
| `TimeoutStopSec` > watchdog (WR-07) | **Herdeira**: `stop_grace_period` comparado com `SHUTDOWN_GRACE_MS` **importado** |
| (`litestream.service`) "é irmã e não filha" | **Herdeira, invertida pela arquitetura**: o `ENTRYPOINT` é o Litestream com `-exec`, e o Node não é o primeiro argumento — a sincronização final pertence ao processo que sobrevive ao que está drenando |
| (`litestream.service`) "lê a configuração instalada, sem valor embutido" | **Herdeira**: o caminho que o `-config` lê é comparado ao caminho que o `COPY` escreve |
| **`StartLimitIntervalSec`/`StartLimitBurst` (P-9)** | **MORRE SEM HERDEIRA.** O Docker não tem equivalente: **o systemd chegava a `failed` e parava; o Docker tenta para sempre.** É perda real, aceita em T-2-LOOP, e o que fecha a corrente de alarme passa a ser o `healthcheck` da composição mais o monitor externo de D2-21. Escrita no §10 do runbook e no comentário de `signaling/index.ts` que a citava |
| **`StateDirectory=dg2`/`StateDirectoryMode=0700`** | **MORRE SEM HERDEIRA.** O volume nomeado ocupa o lugar, e o dono não-root passou a ser garantido pelo `chown` na imagem antes do `USER` — asserido em T-2-DATA |
| O sandbox do systemd (12 diretivas) | **Substituído pela arquitetura.** O isolamento passa a ser do runtime de contêiner; `ops/coturn-dropin.conf` registra que ele é agora o **único** processo nativo deste projeto e que é por isso que o drop-in sobreviveu às units ao redor |

## A prova por remoção — feita e registrada

Obrigatória neste plano, e feita pelo método do 02-13: cópia fora da árvore
**antes**, mutação, observação, restauração **da cópia**, `cmp` byte a byte, e
reconferência por grep de **todas** as edições, não só da mutada.

1. `cp ops/coturn-dropin.conf` para o scratchpad (3064 bytes).
2. `rm ops/coturn-dropin.conf` → `ops/` fica com 7 entradas.
3. `npx vitest run tests/ops-config.test.ts` → **9 falharam, 54 passaram.**

As cinco do bloco D2-15 e a do bloco de LF/CRLF falharam **pelo piso**, com a
mensagem do piso:

```
AssertionError: os globs de ops/ e tools/ops/ vieram vazios: expected 8 to be greater than or equal to 9
    1359|       .toBeGreaterThanOrEqual(9);
```

Isto é exatamente o que o piso existe para comprar: **vermelho pelo piso, não
verde por vacuidade.** (As outras três falhas foram o próprio bloco do
`coturn-dropin.conf` e a asserção da 443, que leem o arquivo ausente por
`read()` — o guarda de vacuidade por arquivo, a outra metade de WR-14.)

4. Restaurado da cópia; `cmp` idêntico; `git diff` do arquivo vazio.
5. `npx vitest run` → **63 passaram**, e as nove edições da Task 2 reconferidas
   por grep uma a uma (piso 13 = 0, piso 9 = 2, `SCRIPTS` vazio, os cinco
   comentários corrigidos, a herdeira do `-config`, `.gitattributes`).

**A conta do piso, confirmada contra o diretório real antes de fixar o número:**
`ops/` 8 + `tools/ops/` 1 = **9 exatamente**. `tools/ops/deploy.mjs` **não existe**
— o 02-04 resolveu a Task 1 como `clique-painel` — e isso está escrito no
comentário do piso, para que o próximo leitor não conte dez.

O piso **iguala** a contagem real, sem folga, de propósito: é o que faz apagar
qualquer arquivo do subsistema ficar vermelho. Acrescentar arquivo não exige
edição; remover exige — e remover é a direção que importa.

## As quatro colisões com o bloco D2-15, tratadas por token exato

Nenhuma regra foi afrouxada. Três listas nasceram, cada uma com o motivo escrito:

| Colisão | Tratamento |
|---|---|
| `ghcr.io` e `github.com` | `PUBLIC_ARTIFACT_HOSTS`, **dois** tokens. A distinção que D2-15 de fato faz: a regra proíbe endereço porque endereço diz **onde esta caixa mora**; um registro público de artefatos diz **de onde o binário vem**, e esconder isso tiraria a proveniência do pin de T-2-SC do repositório |
| `Dockerfile.api` / `Dockerfile.web` | `api` e `web` entram em `NOT_A_TLD`, pelo mesmo motivo que `conf`, `service` e `timer` já estavam |
| `DG2_DB=/var/lib/dg2/dg2.db` e `DG2_UPSTREAM=api:8080` | `CONTAINER_INTERNAL`, tokens exatos, excusados **só** na asserção de "nenhuma chave de env com valor literal" |
| `litestream-0.5.17-linux-x86_64.tar.gz` | `gz` entra em `NOT_A_TLD` — **acréscimo além do que o plano previu**, mesma classe (extensão que este subsistema escreve) |

O domínio do jogo continua recusado, que é a prova de que nenhuma exceção abriu
buraco.

## Decisions Made

- **O caminho da réplica é literal em git, e a razão é que a must-have é comparável.** D2-33 diz que nasce "uma variável com o caminho da réplica", e o item 3 do bloco governante exige que ela viva em volume persistente. Se o valor morasse só no painel, **nenhum teste poderia compará-lo com um ponto de montagem** — e a armadilha que D2-33 registra é silenciosa, o que a torna pior que uma falha. Resolvido assim: `DG2_REPLICA_PATH` é declarada com valor literal em `ops/docker-compose.yml` (como `DG2_DB` já era) e chega a `ops/litestream.yml` por `${DG2_REPLICA_PATH}`. O nome que `docs/OPERACAO.md` dizia que "o plano 02-14 fixa" é esse.
- **Dois pontos de montagem distintos, não um subdiretório.** `/var/lib/dg2` e `/var/lib/dg2-replica`. Um subdiretório do volume do banco satisfaria "persistente" e faria o `restore` ler de dentro do que está restaurando. A asserção compara os dois e exige que o dono da réplica **não** seja o dono do banco.
- **Nenhum `ARG` no bloco do Litestream**, contra o exemplo da pesquisa: um `ARG` é sobrescritível por `--build-arg`, então um pin expresso como `ARG` é um pin que qualquer um no caminho de build levanta. Versão, nome do arquivo e sha256 são literais, e mudar de versão é um diff que muda as duas linhas juntas.
- **`DG2_PORT`, `DG2_BIND` e `DG2_ORIGIN` ficaram fora de `ENV_KEYS`**, embora o runbook as nomeie. Pô-las na lista forçaria dois tokens a mais em `CONTAINER_INTERNAL` (`8080` e `0.0.0.0`), e o próprio arquivo escreve que "uma válvula de escape longa não é um portão". A lista ficou em sete chaves e a exceção em três tokens.
- **A asserção que cita P-9 no `signaling/index.ts` foi reescrita, não apagada.** Ela dizia que `StartLimitBurst=5` podia deixar a unit em `failed`; agora diz que `restart: unless-stopped` o traz de volta para morrer de novo, **para sempre**, porque o Docker não tem o limite que interrompia o ciclo. A perda ficou mais visível, não menos.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] O runbook documentava `total-quota=1200` quando `ops/turnserver.conf` já dizia `100`**

- **Found during:** Task 3
- **Issue:** O 02-04 baixou `total-quota` de 1200 para 100 ao declarar a faixa de relay de cem portas, e ajustou `ops/turnserver.conf`. `ops/README.md` e a asserção de §12 continuaram carregando `1200` — duas afirmações sobre o mesmo limite, uma delas falsa, com teste verde sobre a falsa.
- **Fix:** O runbook passa a carregar `total-quota=100` e `user-quota=6`, e a asserção **compara o runbook com o arquivo que manda** (`/^total-quota=(\d+)$/m` em `ops/turnserver.conf`) em vez de com um literal escrito no teste. Mudar a faixa e esquecer o runbook agora é vermelho.
- **Files modified:** `ops/README.md`, `tests/ops-config.test.ts`
- **Verification:** `npx vitest run tests/ops-config.test.ts` verde; `grep total-quota` nos dois arquivos concorda
- **Committed in:** `142f9df`

**2. [Rule 1 - Bug] Dez referências a arquivo apagado, penduradas por este mesmo plano**

- **Found during:** Task 2 e Task 3
- **Issue:** A remoção dos nove arquivos deixou comentários que os nomeavam como fatos presentes, em seis arquivos fora de `ops/`. O 02-13 nomeou exatamente este defeito como padrão ("comentário que cita arquivo apagado é defeito, não higiene") e criou DEF-02-01 porque não podia fechar os dois lados; aqui **este plano é o lado que abre a ferida**, então é dele fechá-la. A pior delas: `apps/server/src/health.ts` dizia que o campo `release` "é o sha que `ops/deploy.sh` põe em `/etc/dg2/env`" — duas coisas que não existem, num comentário sobre o campo que o monitor externo lê.
- **Fix:** Reescritas, cada uma para a arquitetura que a substituiu — não apagadas. `apps/server/src/db/migrations.ts` (3, o argumento do provider estático e o de D2-07), `apps/server/src/shutdown.ts` (2, o prazo externo passa a ser o do contêiner e aponta para a comparação por import), `apps/server/src/health.ts` (1), `apps/server/src/signaling/index.ts` (1, P-9 com a perda nova), `tests/server-shutdown.test.ts` (2, inclusive o nome de um `it()`), `tests/server-health.test.ts` (1), `tests/server-migrate.test.ts` (2), `tools/ops/restore-verify.mjs` (1), `.gitattributes` (o parágrafo inteiro do motivo), `ops/coturn-dropin.conf` (3), `ops/turnserver.conf` (1), e cinco em `tests/ops-config.test.ts`.
- **Files modified:** os doze acima
- **Verification:** `grep -rn 'deploy\.sh\|rollback\.sh\|deploy-forced\|prune-releases\|cert-check\|dg2\.service\|litestream\.service' apps/ tests/ src/` devolve **só** as linhagens intencionais de `tests/ops-config.test.ts`; `git grep ... -- ops/ tools/` não imprime nada
- **Committed in:** `fd46480` e `142f9df`

**3. [Rule 1 - Bug] Prosa de bucket e ponteiro de seção em `tools/ops/restore-verify.mjs`**

- **Found during:** Task 3
- **Issue:** O script que o novo §11 manda rodar dizia "shipped to the bucket" e "restored from a bucket" (revogado por D2-33) e "`dg2.service` holds the database open" (arquivo apagado). O runbook e o script se contradiziam no próprio parágrafo que o runbook cita.
- **Fix:** "bucket" → "replica"; a condição do `-shm` passa a falar do contêiner do `api`, e ganhou a frase de que rodar contra serviço vivo é a **instrução** e não um contorno, apontando para §11.
- **Files modified:** `tools/ops/restore-verify.mjs`
- **Verification:** `grep bucket tools/ops/restore-verify.mjs` vazio; `npm test` verde
- **Committed in:** `142f9df`

**4. [Rule 2 - Correctness] `gz` acrescentado a `NOT_A_TLD`**

- **Found during:** Task 1
- **Issue:** O plano previu duas adições a `NOT_A_TLD` (`api`, `web`). O nome do tarball do Litestream termina em `.tar.gz`, e a asserção de host olha o **último** rótulo: `gz` seria lido como TLD.
- **Fix:** Token nomeado, com comentário, na mesma classe que `conf`/`service`/`timer` — extensão que este subsistema escreve. Regra não afrouxada.
- **Files modified:** `tests/ops-config.test.ts`
- **Committed in:** `86cb82a`

**5. [Rule 2 - Correctness] `ops/coturn-dropin.conf` apontava para `§10` (orçamento) e para a caixa de 2 GB**

- **Found during:** Task 3
- **Issue:** A reescrita renumerou o runbook; o orçamento saiu de §10 (agora "Supervisão") para a subseção de §12. E o texto ainda dimensionava contra "a KVM 2 de 2 GB de D2-19", que `02-CONTEXT.md` marca como **desatualizada**.
- **Fix:** Ponteiro para §12; o parágrafo passa a dizer que a caixa tem ~8 GiB partilhados e que os tetos continuam obrigatórios **pelo motivo original**, que não era escassez.
- **Files modified:** `ops/coturn-dropin.conf`
- **Committed in:** `142f9df`

---

**Total deviations:** 5 auto-fixed (2× Rule 1 de conteúdo falso, 3× Rule 1/2 de
referência pendurada e token). **Impact on plan:** nenhuma criou capacidade nova.
Três delas (1, 2, 3) corrigem afirmações **falsas** no repositório, e duas delas
foram criadas por este plano. Quatro arquivos além dos 15 do plano foram tocados
(`apps/server/src/db/migrations.ts`, `apps/server/src/signaling/index.ts`,
`tests/server-health.test.ts`, `.gitattributes`), todos com edição só de
comentário.

## Issues Encountered

**1. Dois critérios de aceitação do plano são insatisfazíveis como escritos, e os dois foram verificados na intenção.**

- **`grep -c 'linux-amd64' ops/Dockerfile.api` = 0** colidia com a própria
  instrução de avisar sobre o nome errado. O comentário de proveniência foi
  reescrito para descrever a grafia morta sem soletrá-la ("spelled the x86 way
  and NOT the amd way"), e a asserção persegue as **duas** metades. Critério
  agora satisfeito de verdade.
- **`git grep 'dg2.service\|litestream.service\|cert-check\|...' -- tests/ops-config.test.ts` não imprime nada** (critério da Task 2) **contradiz diretamente a ação da mesma tarefa**, que manda "cada uma com um comentário dizendo de qual asserção morta ela é herdeira". As duas coisas não podem ser verdade. Interpretado como **zero referências vivas** — nenhuma asserção cujo sujeito seja um arquivo apagado — e isso está cumprido; as seis linhas que sobram são linhagem mandada pelo plano, mais a proveniência datada de WR-14. O critério também só poderia fechar depois da Task 3, porque a asserção que listava as quatro units pertence ao bloco do README.

**2. A aritmética do critério "a contagem caiu em ao menos 30 em relação aos 74" não fecha com a tabela de DM-20.** 74 − 34 + ~10 = ~50, que é queda de 24, não de 30. Com o baseline real de 84 (o 02-04 e o 02-13 acrescentaram casos depois da pesquisa), o resultado é 63. O fato mensurável — **34 casos removidos, exatamente os quatro blocos que DM-20 contou** — está cumprido e a conta inteira está na tabela acima.

**3. O recurso do Coolify aponta hoje para um caminho que deixou de existir.** `ops/probe/docker-compose.yml` foi apagado na Task 1. Sob D2-32 **nada dispara deploy sozinho**, então o ponteiro quebrado é **inerte** até alguém promover à mão — e o `02-12` já tem, no `user_setup`, a tarefa de repontá-lo para `ops/docker-compose.yml`. Registrado aqui para que ninguém descubra por acidente.

**4. Um parágrafo de `ops/docker-compose.yml` ficou em português dentro de um arquivo de comentários em inglês.** O critério exige um de três tokens portugueses (`duas variáveis de tag`, `uma tag só`, `recria os dois`) e o CLAUDE.md exige comentários de código em inglês. Resolvido deixando o **registro de decisão** num bloco recuado e claramente delimitado, em português, com a introdução em inglês nomeando o mecanismo — em vez de code-switching no meio das frases.

**5. `requirements.mark-complete INFRA-04` marcou a caixa, e a marca foi revertida à mão.**

O frontmatter do plano declara `requirements: [INFRA-04]`, e o protocolo de
estado manda marcar. Mas o texto de INFRA-04 é *"backup do banco restaurável —
**verificado restaurando**, não só gerando"*, e **nada foi restaurado neste
plano**: o que existe é a composição, os dois volumes e o runbook que descreve o
ensaio. A própria linha de rastreabilidade de `REQUIREMENTS.md` (206) diz
**Partial** e nomeia o que falta — *"falta o 02-12"* —, de modo que a caixa
marcada contradiria, três parágrafos acima, a linha que a explica. O `02-12`
também declara INFRA-04, e um requisito reivindicado por dois planos não fecha no
primeiro.

Revertido para `[ ]`, e a linha de rastreabilidade ganhou a contribuição do 02-14
com o que continua faltando em caixa alta. `roadmap.update-plan-progress` e o
`[x]` da wave 10 no ROADMAP estão corretos e ficaram.

## DEF-02-01 — adiado, com dono nomeado e com o texto já decidido

**Não foi fechado, e o motivo é o contrato.** As quatro mensagens de erro de
`apps/server/src/env.ts` são o `file:pointer: message` de `tools/README.md` §3, e
`tests/server-env.test.ts:127` as persegue com `/\/etc\/dg2\/env|porta/` **num laço
sobre as chaves** — trocar o texto sem trocar a asserção deixa quatro das cinco
chaves vermelhas. São dois arquivos a mais num plano que já cruzou o limiar de 15
e que já absorveu dez consertos de Rule 1.

**O que este plano entregou a respeito dele:** a dependência que o 02-13 nomeou
como bloqueadora — "o texto substituto depende do runbook que o 02-14 reescreve" —
**deixou de existir**. `deferred-items.md` agora carrega a string substituta
literal, o regex novo da asserção, as coordenadas exatas das cinco ocorrências, e
o dono: **a primeira wave da fase 3 que tocar `apps/server/src/env.ts`**, que vai
abrir o arquivo de qualquer jeito porque `DG2_TURN_SECRET`/`DG2_TURN_REALM` são
chaves dela. Não é mais um item órfão — é um item mecânico esperando quem já vai
passar por ali.

**DEF-02-02 fechou neste plano.** `git grep 'DG2_DOMAIN' -- ops/ apps/` não
imprime nada.

**Dois itens novos registrados:** DEF-02-03 (o par de memória do drop-in do coturn
vive em dois arquivos e só um deles é comparado com o outro) e DEF-02-04 (os
ponteiros `§N` entre arquivos de `ops/` não são asseridos, e esta reescrita os
corrigiu à mão).

## Os contratos do 02-13, honrados

- **`{$DG2_UPSTREAM:api:8080}`** — o serviço chama-se `api` e escuta 8080. O helper que fatia a composição **assere os nomes dos dois serviços**, de modo que renomear o `api` fica vermelho em vez de virar um 502 sem pista.
- **`root * /srv/www`** — `ops/Dockerfile.web` copia `dist/` para lá, e a asserção **extrai a raiz do Caddyfile** e a compara com o `COPY`, em vez de repetir o literal.
- **A asserção de que nenhum serviço declara `ports:`** existe, e o comentário do `serve()` em `apps/server/src/index.ts` continua verdadeiro.
- **O bloco `header`, os três matchers com o `not`, o `file_server` sem `try_files` e o `handle_errors`** não foram tocados. A asserção de `trusted_proxies` **sobreviveu à reescrita do arquivo de teste** — as duas formas (`toContain` e o `toMatch` ancorado em `servers {`) continuam lá, e a prova por remoção do 02-13 continua valendo.

## User Setup Required

Nenhum neste plano. O `02-12` carrega os três itens de painel (visibilidade dos
pacotes do GHCR, o monitor externo com o limiar de 30 dias, e **repontar o Docker
Compose Location** de `ops/probe/docker-compose.yml` para
`ops/docker-compose.yml`).

## Next Phase Readiness

**Pronto para o `02-15`** (wave 11), que constrói e publica as duas imagens no
integrador. Ele tem agora os nomes exatos (`dg2-web`, `dg2-api`), os dois
Dockerfiles, o contexto de build (a raiz do repositório) e os dois artefatos que
as imagens copiam (`dist/` e `dist-server/server.mjs`).

**Pronto para o `02-12`** (wave 12), que promove na caixa: o runbook descreve cada
passo que ele vai exercer, e a §11 descreve o contêiner descartável do ensaio de
restauração com os três mounts e o entrypoint sobrescrito.

**Um fato que o `02-12` tem de provar e este plano só pôde declarar:** que a
réplica do Litestream **sobreviveu a um redeploy**. Os dois volumes estão
declarados e asseridos no papel; que o Coolify os crie como persistentes de
verdade é medição na caixa, e é dele.

**Uma concorrência que vale nomear:** o `02-15` e o `02-12` dependem de a
visibilidade dos pacotes do GHCR ser pública. Um pacote nasce privado, e o
`pull` da caixa sem credencial falha com uma mensagem que fala de autenticação,
não de visibilidade.

## Self-Check: PASSED

- **Três arquivos criados**, conferidos por `test -f`: `ops/docker-compose.yml`, `ops/Dockerfile.api`, `ops/Dockerfile.web`.
- **Dez arquivos apagados**, conferidos por ausência: os nove de D2-30/D2-28 mais `ops/probe/docker-compose.yml`.
- **Quinze arquivos modificados**, cada um conferido por `git log 86cb82a~1..142f9df -- <arquivo>`; todos aparecem em pelo menos um dos três commits (`tests/ops-config.test.ts` nos três, `ops/litestream.yml` em dois).
- **Três commits existem** em `git log --all`: `86cb82a`, `fd46480`, `142f9df`.
- **`ls ops/` devolve 8 entradas**, nenhuma `.sh`, `.service` ou `.timer`.
- **Portões:** `npm test` 915/60 verde, `npm run lint` 0, `npm run typecheck:server` 0, `npm run server:build` 0.
- **Varreduras de D2-15:** nenhum IP fora do loopback em `ops/`; nenhum byte CR em `ops/` nem `tools/ops/`; `git grep 'srv/dg2\|etc/dg2/env\|deploy-forced\|prune-releases\|cert-check' -- ops/ tools/` vazio.

---
*Phase: 02-migra-o-para-a-vps*
*Completed: 2026-09-10*
