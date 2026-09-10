---
phase: 02-migra-o-para-a-vps
plan: 15
subsystem: infra
tags: [github-actions, ghcr, docker, caddy, litestream, sqlite, better-sqlite3, esbuild, ci]

# Dependency graph
requires:
  - phase: 02-migra-o-para-a-vps
    provides: "o `ci.yml` com o job `deploy` por rsync, a tabela de majors, o piso de permissão do workflow e os dois artefatos publicáveis (02-11); `ops/Dockerfile.web`, `ops/Dockerfile.api`, `ops/docker-compose.yml` e o runbook reescrito (02-14); a caixa provada e a decisão de que quem promove é uma pessoa (02-04); o `ops/Caddyfile` de contêiner com `{$DG2_UPSTREAM:api:8080}` (02-13)"
provides:
  - "O job `image` de `.github/workflows/ci.yml`: publica DUAS imagens tagueadas pelo sha a cada push verde na `main`, com `docker login/build/push` em passos `run:` e NENHUMA ação de terceiro"
  - "A única escrita do workflow inteiro, `packages: write`, nomeada e confinada ao job que empurra a imagem — asserida dentro da fatia daquele job"
  - "A ausência de qualquer caminho SSH/rsync/scp asserida de forma INVERTIDA, porque é propriedade a defender e não acidente do momento"
  - "`tests/workflows.test.ts` com 14 casos, nenhum mencionando `deploy`: cinco asserções da chave de deploy mortas, duas preservadas alteradas, quatro nascidas"
  - "A prova local de DM-9: o Caddy de um contêiner alcança o Node do outro, medido e colado abaixo"
  - "Os tamanhos REAIS das duas imagens e a conta de retenção de D2-24 derivada camada a camada, onde antes havia estimativa"
  - "Dois defeitos de build achados aqui e não contra a caixa: o `ws` externo que faltava no bundle, e o `--ignore-scripts` sem o qual o prebuild do better-sqlite3 nunca é alcançado"
affects: [02-12, 03-11]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Exceção de gate NOMEADA e confinada por fatia: `packages: write` é admitida como valor exato, uma única vez, e só dentro do job `image` — uma asserção que admitisse \"alguma escrita\" deixaria de ser portão"
    - "Asserção invertida sobre superfície removida: o teste persegue a AUSÊNCIA de `ssh`/`rsync`/`scp`, para que a superfície que D2-32 tirou não volte por descuido"
    - "Comando de CI exercitado localmente ANTES do primeiro push, com a tag local no lugar do sha — o job deixa de ser a primeira execução dele mesmo"
    - "Comentário de arquivo de ops corrigido POR MEDIÇÃO: o que a medição desmente sai do comentário no mesmo dia, com a data e o plano que mediram"

key-files:
  created:
    - .planning/phases/02-migra-o-para-a-vps/02-15-SUMMARY.md
  modified:
    - .github/workflows/ci.yml
    - tests/workflows.test.ts
    - package.json
    - ops/Dockerfile.api
    - ops/Caddyfile
    - tests/ops-config.test.ts

key-decisions:
  - "`DEPLOY_ENABLED` morre neste plano e não no 02-12: o raciocínio que a mantinha valia para um job que falhava por falta de segredo, e o job `image` não pode falhar por isso — a única credencial dele é o `GITHUB_TOKEN`, que o runner injeta sempre. Um `if:` que ninguém pode satisfazer seria um job PULADO para sempre, que é o caso que o próprio comentário dela diz ser pior que vermelho"
  - "Nenhuma ação de Docker entra, e o portão T-2-SC fica INTACTO: o runner hospedado já traz `docker` e `buildx`, então `login`/`build`/`push` em `run:` fazem o trabalho inteiro. Afrouxar a asserção que recusa `uses:` fora de `actions/` seria trocar um portão por conveniência"
  - "`--ignore-scripts` no `npm ci` da imagem da API é MEDIÇÃO e não precaução: sem ele o build morre no CONFIGURE do node-gyp (\"Could not find any Python installation to use\") antes que a detecção de prebuild do próprio binding.gyp rode, e o binário pré-compilado que o tarball já traz nunca é alcançado"
  - "`--external:ws` no `server:build`: o `ws` é CJS e o shim de `require` do esbuild em saída ESM lança em tempo de execução; o pacote já está no `node_modules` da imagem pelo `npm ci`, então externalizar é o conserto e não um remendo"
  - "As imagens locais ficam em disco ao fim, por decisão: é barato e é o que faz `pull_policy: missing` do compose reconhecê-las se alguém quiser subir por compose. O que NÃO fica é contêiner nem rede"
  - "O comentário do `ops/Caddyfile` que declarava uma lacuna de cabeçalhos no `handle_errors` foi corrigido: a medição mostra os quatro cabeçalhos no 503, porque `header` é diretiva de SITE e embrulha o writer antes da cadeia de erro rodar"

patterns-established:
  - "Prova por remoção como entrega do plano, não como promessa: três mutações no `ci.yml` (segunda escrita, tag móvel, passo com `ssh`), cada uma verificada vermelha e revertida, com a árvore limpa ao fim"
  - "Quando a medição local depende do host, o artefato do host vira nota do SUMMARY: o Git Bash reescreve `/srv/server.mjs` para `C:/Program Files/Git/srv/server.mjs`, e a nota é o que impede a próxima pessoa de diagnosticar a imagem por um defeito do terminal"

requirements-completed: [INFRA-01, INFRA-04]

# Metrics
duration: 100min
completed: 2026-09-10
---

# Fase 02 Plano 15: O job de publicação de imagem, exercitado antes do runner

**O `ci.yml` passa a publicar duas imagens por sha a cada push verde na `main` — sem uma linha de
código de terceiro e com uma única escrita nomeada — e os comandos exatos desse job já rodaram
nesta máquina, onde o Caddy de um contêiner alcançou o Node do outro e as seis medições fecharam.**

## Performance

- **Duração:** ~100 min de parede, com uma interrupção por queda de energia no meio
- **Iniciado:** 2026-09-10T15:15Z (commit da Task 1)
- **Concluído:** 2026-09-10T16:56Z
- **Tarefas:** 2/2
- **Arquivos modificados:** 6 (mais o SUMMARY criado)

## Realizações

- O job `deploy` por rsync deixou de existir e o job `image` ocupou o lugar dele, no mesmo commit
  que ajusta `tests/workflows.test.ts` — sem uma janela vermelha por um motivo que não é defeito.
- As duas imagens foram construídas com os comandos exatos do job e subiram juntas em rede de
  ponte: **as seis medições passaram**, incluindo a prova de DM-9 que o bind em loopback tornaria
  impossível.
- Dois defeitos de build reais foram achados AQUI, que é onde custam minutos, e não contra a
  caixa nem na primeira execução do runner.
- O tamanho das imagens deixou de ser estimativa: a conta de retenção de 5 imagens por serviço
  (D2-24) agora tem número, e o número é confortável.

## Commits das tarefas

1. **Task 1: o job `image` e o delta de `tests/workflows.test.ts`** — `fcea7de` (ci)
2. **Desvio [Regra 3] o bundle do servidor não subia** — `a3cf520` (fix)
3. **Desvio [Regra 1] a imagem da API não construía** — `fe0d804` (fix)
4. **Task 2: os comandos do job rodados localmente** — não escreve arquivo do repositório; o
   resultado é este SUMMARY
5. **Desvio [Regra 1] o comentário do Caddyfile desmentido pela medição** — `a130df3` (docs)

Entre 3 e 5 houve `49b1d6d`, que registra a recuperação do repositório após a queda de energia —
não é trabalho deste plano, mas é o que explica o intervalo no histórico.

## Arquivos criados/modificados

- `.github/workflows/ci.yml` — o job `deploy` inteiro removido; o job `image` no lugar, com
  `needs: [test, pwa]`, `timeout-minutes: 15`, grupo de concorrência próprio sem cancelamento,
  `permissions:` de job com a única escrita do arquivo, dois `download-artifact` e quatro
  comandos de Docker em passos `run:`
- `tests/workflows.test.ts` — 14 casos; a fatia passou a recortar o job `image`; a asserção de
  escrita admite exatamente `packages: write` e só dentro daquela fatia; nasceram as quatro
  (tag por sha, prazo próprio, token por `stdin`, ausência de SSH/rsync/scp)
- `package.json` — `--external:ws` no `server:build`
- `ops/Dockerfile.api` — `--ignore-scripts` no `npm ci`, com o parágrafo que explica a medição
- `tests/ops-config.test.ts` — 8 linhas de asserção prendendo o `--ignore-scripts` e o motivo
- `ops/Caddyfile` — comentário corrigido pela medição do 503

---

## Task 1 — evidência (executada antes da queda; conferida, não refeita)

Todos os critérios de aceitação foram reconferidos contra o HEAD atual:

| Critério | Comando | Resultado |
|---|---|---|
| o job `deploy` sumiu | `grep -cE '^  deploy:' .github/workflows/ci.yml` | `0` |
| o job `image` existe | `grep -cE '^  image:' .github/workflows/ci.yml` | `1` |
| nenhum caminho SSH | `grep -cE 'rsync\|ssh \|scp \|known_hosts\|id_ed25519' …` | `0` |
| nenhum segredo de deploy nomeado | `grep -c 'DEPLOY_SSH_KEY\|DEPLOY_HOST\|DEPLOY_USER\|DEPLOY_KNOWN_HOSTS\|DEPLOY_ENABLED' …` | `0` |
| uma escrita, e é a de pacotes | `grep -cE '^\s+packages: write\s*$' …` / `'^\s+[a-z-]+: write\s*$'` | `1` / `1` |
| nenhum `uses:` fora de `actions/` | `grep -oE 'uses: \S+' … \| grep -vcE 'uses: actions/'` | `0` |
| token por `stdin`, nunca em argv | `grep -c 'password-stdin' …` / `grep -cE 'docker login.*-p ' …` | `1` / `0` |
| tag por sha, nunca móvel | `grep -cE ':latest\|:main' …` / `grep -c 'GITHUB_SHA' …` | `0` / `4` |
| nenhuma publicação no Pages | `grep -cE 'upload-pages-artifact\|deploy-pages\|configure-pages\|github-pages' …` | `0` |
| prazo próprio e cancelamento desligado | `grep -c 'timeout-minutes'` / `'cancel-in-progress: false'` | `1` / `1` |
| um único workflow (INFRA-01) | `ls .github/workflows/ \| wc -l` | `1` |
| o portão | `npx vitest run tests/workflows.test.ts` | `14 passed`, **nenhum caso menciona `deploy`** |
| resto do repositório | `git grep -nE 'rsync\|known_hosts\|id_ed25519' -- .github/` | nada |
| nenhuma credencial criada | `gh variable list` / `gh secret list` | vazias — os quatro de SSH e `DEPLOY_ENABLED` nunca existiram |

### Prova por remoção (exigida pelo plano)

Três mutações aplicadas ao `ci.yml`, cada uma seguida de `npx vitest run tests/workflows.test.ts`
e revertida em seguida:

```
baseline (arvore limpa): VERDE
VERMELHO  <- uma SEGUNDA permissao de escrita (issues: write) no job image
VERMELHO  <- a tag da imagem web vira um nome MOVEL (:latest no lugar do sha)
VERMELHO  <- um passo que fala SSH com a caixa volta ao workflow
ci.yml restaurado ao original
```

`git status --short` e `git diff --stat .github/workflows/ci.yml` vazios ao fim: a prova não
deixou resíduo.

---

## Task 2 — os comandos do job, rodados nesta máquina

### Pré-condição conferida

`docker version --format '{{.Server.Version}}'` → **29.3.1**. O daemon respondeu na primeira
consulta; o laço de espera de cinco minutos não foi necessário.

### Os comandos exatos

Artefatos, com os dois scripts que o job `test` usa, na ordem:

```bash
npm run build          # SIM_VERSION = sha256:cf4cf671d9d1e56c (65948 bytes); sw precache: 13 arquivos
npm run server:build   # dist-server/server.mjs  1.3mb
```

Imagens, com os mesmos `docker build` do job — a diferença é a tag local no lugar do
`$GITHUB_SHA`:

```bash
owner=$(printf '%s' "$GITHUB_REPOSITORY_OWNER" | tr '[:upper:]' '[:lower:]')   # GustavoKTausend -> gustavoktausend
registry="ghcr.io/$owner"
docker build -f ops/Dockerfile.web -t "$registry/dg2-web:local" .
docker build -f ops/Dockerfile.api -t "$registry/dg2-api:local" .
```

O forçar-minúsculas foi exercitado com a grafia real do dono (`GustavoKTausend`) e produz
`gustavoktausend`, que é exatamente o caminho que `ops/docker-compose.yml` puxa. É o defeito que
só apareceria no primeiro push real.

O par, em rede de ponte descartável:

```bash
docker network create dg2-local-check

docker run -d --name dg2-api-check --network dg2-local-check \
  --entrypoint node \
  -e DG2_DB=/var/lib/dg2/dg2.db -e DG2_PORT=8080 -e DG2_BIND=0.0.0.0 -e DG2_RELEASE=dev \
  ghcr.io/gustavoktausend/dg2-api:local /srv/server.mjs

docker run -d --name dg2-web-check --network dg2-local-check \
  -e DG2_UPSTREAM=dg2-api-check:8080 -p 18080:8080 \
  ghcr.io/gustavoktausend/dg2-web:local
```

O entrypoint é sobrescrito para o Node **de propósito**: o Litestream é pulado porque não há
bucket nesta máquina (D2-33 trocou o destino para `file`), e o repasse de sinal dele já está
verificado no código-fonte (DM-13) — quem o exercita de verdade é o plano 02-12.

`DG2_RELEASE=dev` é o conjunto mínimo que faz `readEnv` subir sem `DG2_ORIGIN`: a recusa de
origem padrão só dispara quando o release NÃO é de desenvolvimento. Por isso o campo `release`
das medições abaixo é `dev` e não um sha.

### Tempo e tamanho

| Imagem | Build com cache | Build `--no-cache` | Tamanho | Única / compartilhada |
|---|---|---|---|---|
| `ghcr.io/gustavoktausend/dg2-web:local` | 2 s | 1 s | **89,1 MB** | 89,13 MB / 0 B |
| `ghcr.io/gustavoktausend/dg2-api:local` | 2 s | 38 s | **531 MB** | 530,9 MB / 0 B |

`docker image inspect` das duas tags sai 0.

O `--no-cache` da API custa 38 s com as camadas da base já em disco: `apt-get` dos três pacotes,
o tarball do Litestream (13,5 MB) e o `npm ci`. No runner soma-se o pull da base
`node:24.20.0-trixie-slim`, e ainda assim os `timeout-minutes: 15` do job são folgados por uma
ordem de grandeza.

**A conta de retenção de D2-24, que era estimativa e agora é medida.** O que muda a cada release,
camada a camada:

- **api** — `server.mjs` 1,34 MB + `litestream.yml` 12,3 kB + `restore-verify.mjs` 32,8 kB +
  `mkdir/chown` 20,5 kB ≈ **1,41 MB por release**. As camadas caras (base 259 MB, `apt` 13,1 MB,
  Litestream 39 MB + 13,5 MB, `npm ci` 60,1 MB) são compartilhadas enquanto o `package-lock.json`
  não se mover.
- **web** — `dist/` 471 kB + `Caddyfile` 32,8 kB ≈ **0,5 MB por release**, sobre uma base
  `caddy:2.11.4-alpine` de ~64 MB.

Cinco imagens de cada serviço custam então **~537 MB + ~91 MB ≈ 628 MB de disco**, e não 5×620 MB.
A ressalva que vale escrever: um release que mexa em dependências invalida a camada do `npm ci` e
custa ~60 MB a mais **naquele** release. É por isso que a ordem dos quatro `COPY`/`RUN` do
`ops/Dockerfile.api` é o ponto e não arrumação.

---

## As seis medições

### 1. A rota de saúde ATRAVÉS do contêiner do Caddy — a prova de DM-9

```
$ curl -sS -i http://127.0.0.1:18080/api/health
HTTP/1.1 200 OK
Cache-Control: no-store
Content-Length: 41
Content-Security-Policy: default-src 'self'; img-src 'self'; font-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'
Content-Type: application/json
Date: Thu, 10 Sep 2026 16:49:34 GMT
Referrer-Policy: strict-origin-when-cross-origin
Strict-Transport-Security: max-age=31536000; includeSubDomains
Via: 1.1 Caddy
X-Content-Type-Options: nosniff

{"status":"ok","db":true,"release":"dev"}
```

**PASSA.** 200, corpo JSON com o campo `release`, e o `Via: 1.1 Caddy` provando que a resposta
atravessou o contêiner do proxy. O upstream é o **nome do contêiner** resolvido pelo DNS interno
do Docker — o `{$DG2_UPSTREAM}` do Caddyfile substituído antes do parse, exatamente como P-6
manda. `db: true` diz que o Node abriu o banco antes de responder.

### 2. Os quatro cabeçalhos de segurança

```
OK  X-Content-Type-Options: nosniff
OK  Referrer-Policy: strict-origin-when-cross-origin
OK  Strict-Transport-Security: max-age=31536000; includeSubDomains
OK  Content-Security-Policy: default-src 'self'; img-src 'self'; font-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'
```

**PASSA.** Os quatro na mesma resposta. É este Caddy que os manda porque o Traefik do Coolify não
manda nenhum (DM-11).

### 3. As três classes de cache

```
-- (a) hash de conteúdo sob /assets --
GET /assets/index-D54zMUsn.js
HTTP/1.1 200 OK
Cache-Control: public, max-age=31536000, immutable

-- (b) nome estável (fonte) --
GET /fonts/PressStart2P-Regular.woff2
HTTP/1.1 200 OK
Cache-Control: public, max-age=0, must-revalidate

-- (b2) nome estável (ícone) --
GET /icons/icon-192.png
HTTP/1.1 200 OK
Cache-Control: public, max-age=0, must-revalidate

-- (b3) nome estável (arte sob /assets) --
GET /assets/copRobo.png
HTTP/1.1 200 OK
Cache-Control: public, max-age=0, must-revalidate

-- (c) o índice --
GET /
HTTP/1.1 200 OK
Cache-Control: no-cache

-- (c2) sw.js --
GET /sw.js
HTTP/1.1 200 OK
Cache-Control: no-cache
```

**PASSA, e a medição (b3) é a que vale ouro:** `/assets/copRobo.png` cai em `@stable` e
`/assets/index-D54zMUsn.js` cai em `@assets`, os dois sob o mesmo prefixo. É o `not` do matcher
`@stable` funcionando — sem ele o segundo `header` sobrescreveria o primeiro e desafixaria em
silêncio justamente os arquivos cujo propósito é ficarem fixados.

### 4. Rota inexistente → 404, e o corpo não é o índice (DM-5)

```
$ curl -sS -D- -o /dev/null http://127.0.0.1:18080/rota-que-nao-existe
HTTP/1.1 404 Not Found
Content-Type: text/plain; charset=utf-8
Content-Length: 13

$ curl -sS http://127.0.0.1:18080/rota-que-nao-existe
404 Not Found

bytes 404=13  bytes index=18863
OK: o corpo não é o index.html (sem doctype html)

-- controle --
GET /index.html -> 200
```

**PASSA.** Treze bytes de texto contra 18.863 do índice. A ausência de `try_files` é decisão, e
agora é decisão medida: o service worker nunca receberá uma página errada para persistir num
armazenamento que ignora `Cache-Control`.

### 5. Com o contêiner do servidor parado → 503 em JSON

```
$ docker stop dg2-api-check
$ curl -sS -i http://127.0.0.1:18080/api/health
HTTP/1.1 503 Service Unavailable
Cache-Control: no-store
Content-Security-Policy: default-src 'self'; img-src 'self'; font-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'
Content-Type: application/json
Referrer-Policy: strict-origin-when-cross-origin
Server: Caddy
Strict-Transport-Security: max-age=31536000; includeSubDomains
X-Content-Type-Options: nosniff
Date: Thu, 10 Sep 2026 16:50:25 GMT
Content-Length: 24

{"status":"unavailable"}

-- o jogo estático continua servindo --
GET /            -> 200
GET /index.html  -> 200

-- religada a api --
GET /api/health  -> 200   {"status":"ok","db":true,"release":"dev"}
```

**PASSA**, e o corpo é exatamente o que o monitor externo de D2-21 casa por palavra-chave. O jogo
estático continuou de pé com a API fora, que é a propriedade que o `handle_errors` existe para
tornar distinguível de "a caixa caiu".

**Achado desta medição:** o 503 **carrega os quatro cabeçalhos de segurança** (contados: 4). O
comentário do `ops/Caddyfile` afirmava o contrário — "the error route at the bottom does not
inherit those headers" — e convidava a próxima pessoa a fechar um buraco que nunca esteve aberto.
`header` é diretiva de **site** e embrulha o response writer antes de a cadeia de erro rodar.
Corrigido em `a130df3`.

### 6. Dentro do contêiner do servidor: banco criado e migrado

```
$ docker exec dg2-api-check ls -la /var/lib/dg2/
drwxr-xr-x 1 node node  4096 Sep 10 16:49 .
-rw-r--r-- 1 node node  4096 Sep 10 16:49 dg2.db
-rw-r--r-- 1 node node 32768 Sep 10 16:49 dg2.db-shm
-rw-r--r-- 1 node node 90672 Sep 10 16:49 dg2.db-wal

$ docker exec dg2-api-check sqlite3 /var/lib/dg2/dg2.db ".tables"
gold_entry             kysely_migration
ice_outcome            kysely_migration_lock

$ docker exec dg2-api-check sqlite3 /var/lib/dg2/dg2.db "SELECT sql FROM sqlite_master WHERE name='gold_entry';"
CREATE TABLE "gold_entry" ("id" text not null primary key, "account_id" text not null,
  "amount" integer not null, "reason" text not null, "at" integer not null, "confirmed" integer)

$ docker exec dg2-api-check sqlite3 /var/lib/dg2/dg2.db "SELECT name,type FROM sqlite_master ORDER BY type,name;"
gold_entry_account|index
ice_outcome_at|index
sqlite_autoindex_gold_entry_1|index
...
gold_entry|table
ice_outcome|table
kysely_migration|table
kysely_migration_lock|table
```

**PASSA**, e prova três coisas de uma vez: o `sqlite3` CLI está na imagem (é dele que
`tools/ops/restore-verify.mjs` depende); os dois diretórios pertencem a `node:node` antes do
`USER`, então o processo não-root escreveu; e — a mais importante — o **binário pré-compilado do
`better-sqlite3` carregou**, que é a metade do `--ignore-scripts` que só um banco aberto de
verdade demonstra. Um prebuild ausente falharia aqui, e não em produção.

### Limpeza

```bash
docker rm -f dg2-api-check dg2-web-check
docker network rm dg2-local-check
```

Contêineres e rede removidos. Restaram, intocados, o `agent-a326c8d30edfca32a-postgres-1`
(`postgres:18`, parado há 3 semanas) e a rede `agent-a326c8d30edfca32a_default`, que são de outro
projeto. As duas imagens ficam em disco por decisão.

---

## Desvios do plano

### 1. [Regra 3 — bloqueio] O bundle do servidor não subia: `ws` é CJS

- **Encontrado durante:** Task 2, ao subir o contêiner da API pela primeira vez
- **Problema:** `server:build` embutia o `ws` no bundle ESM; o shim de `require` que o esbuild
  emite em saída ESM lança em tempo de execução, e o processo morria antes de abrir o banco
- **Conserto:** `--external:ws` no script `server:build` de `package.json`. O pacote já está no
  `node_modules` da imagem pelo `npm ci --workspace @dg2/server`, então externalizar é o conserto
  e não um remendo — é o mesmo tratamento que o `better-sqlite3` já tinha
- **Arquivo:** `package.json`
- **Commit:** `a3cf520`

### 2. [Regra 1 — bug] A imagem da API não construía: o prebuild exige `--ignore-scripts`

- **Encontrado durante:** Task 2, no `docker build -f ops/Dockerfile.api`
- **Problema:** DM-12 estava certo em dizer que o `better-sqlite3` 13.0.3 traz binários
  pré-compilados para linux-x64 no tarball. O que faltava ao fato: o pacote **também** traz um
  `binding.gyp` e não declara install script próprio — e para exatamente essa forma o npm
  sintetiza `install: node-gyp rebuild`. O build morria no CONFIGURE do node-gyp com "Could not
  find any Python installation to use", antes que a detecção de prebuild do próprio `binding.gyp`
  pudesse rodar. O prebuild nunca era alcançado
- **Conserto:** `--ignore-scripts` no `npm ci` da imagem, com o parágrafo que registra a medição
  e a alternativa recusada (instalar python3/make/g++ e compilar o SQLite a cada mudança de
  dependência, numa imagem mantida cinco fundo por serviço, para produzir um binário que o
  tarball já contém). A segurança do flag é conferida e não presumida: toda outra dependência de
  produção de `@dg2/server` é JavaScript puro
- **Arquivos:** `ops/Dockerfile.api`, `tests/ops-config.test.ts` (8 linhas de asserção novas)
- **Commit:** `fe0d804`

### 3. [Regra 1 — documentação de segurança errada] O comentário do Caddyfile desmentido

- **Encontrado durante:** Task 2, medição 5
- **Problema:** o cabeçalho de `ops/Caddyfile` declarava uma lacuna — "the error route at the
  bottom does not inherit those headers" — que a medição mostra não existir
- **Conserto:** parágrafo reescrito com a medição, a data e o plano que a fizeram. Só comentário
  muda; o helper `code()` de `tests/ops-config.test.ts` filtra comentários, então nenhuma
  asserção dependia da frase. A imagem `web` foi reconstruída do arquivo corrigido e as medições
  1 e 5 refeitas contra ela, com resultado idêntico
- **Arquivo:** `ops/Caddyfile`
- **Commit:** `a130df3`

### Nota de ambiente (não é desvio, é armadilha do host)

O Git Bash reescreve argumentos que parecem caminhos POSIX: `docker run … node /srv/server.mjs`
chegou ao contêiner como `node C:/Program Files/Git/srv/server.mjs` e o Node saiu com
`MODULE_NOT_FOUND`. É artefato do terminal do Windows, **não da imagem** — `MSYS_NO_PATHCONV=1`
resolve, e o runner Linux não tem o problema. Registrado para que a próxima pessoa não diagnostique
a imagem por um defeito do terminal.

## Interrupção por queda de energia

Uma queda de energia às ~13:29 -0300 interrompeu a Task 2 depois dos dois consertos acima e
depois de os dois builds passarem. O repositório ficou com `.git/refs/heads/main` zerado e foi
restaurado pelo reflog (`49b1d6d`): `git fsck` limpo, nenhum commit perdido. A retomada
reconstruiu as duas imagens com os comandos exatos do job contra o HEAD atual — o cache tornou
isso barato — e só então mediu.

## Verificação

| Portão | Resultado |
|---|---|
| `npm run build && npm run server:build && npm test` | **exit 0** |
| `npm test` | **913 passed (60 arquivos)**, exit 0 |
| `npm run lint` | exit 0 |
| `npx vitest run tests/workflows.test.ts` | 14 passed |
| `git grep -nE 'rsync\|known_hosts\|id_ed25519' -- .github/` | nada |
| `gh variable list` / `gh secret list` | vazias |

Na primeira execução, `tests/lint-coverage.test.ts` deu timeout de 5 s com o cache do ESLint frio
(8.753 ms). Reexecutado isolado com cache quente: 2 passed em 1,19 s; e a suíte inteira em
seguida, 913/913 em 3,45 s. É característica conhecida do portão, não defeito.

## O que fica para depois

- **A visibilidade dos dois pacotes** (`dg2-web` e `dg2-api`) precisa ser trocada para pública no
  GitHub **depois da primeira execução do job `image` na `main`** — um pacote do GHCR nasce
  privado, e o Coolify puxa sem credencial apenas se for público (T-2-PKGVIS, aceito). É tarefa de
  painel, do operador.
- **Fixar por digest em vez de tag** continua registrada como melhoria conhecida (T-2-MOVTAG), não
  construída.
- **A verificação do CSP contra um browser real** continua sendo do plano 02-12: o que este plano
  mediu é que os cabeçalhos SAEM, não que o jogo carrega sem violação no console.
- **O `replicate -exec` do Litestream não foi exercitado** aqui, por decisão: sem bucket e sem
  destino nesta máquina, o entrypoint foi sobrescrito. Quem o exerce é o 02-12, contra a caixa.

## Self-Check: PASSED

- `.planning/phases/02-migra-o-para-a-vps/02-15-SUMMARY.md` — FOUND
- `.github/workflows/ci.yml` — FOUND
- `tests/workflows.test.ts` — FOUND
- `ops/Dockerfile.api` — FOUND
- `ops/Caddyfile` — FOUND
- commit `fcea7de` — FOUND
- commit `a3cf520` — FOUND
- commit `fe0d804` — FOUND
- commit `a130df3` — FOUND
