---
phase: 02-migra-o-para-a-vps
plan: 13
subsystem: infra
tags: [caddy, traefik, docker, coolify, x-forwarded-for, rate-limiting, bind-address, hono, node-server]

# Dependency graph
requires:
  - phase: 02-migra-o-para-a-vps
    provides: "o `ops/Caddyfile` com a política HTTP inteira (02-03); `apps/server` com `readEnv`, `export const server` e o desligamento gracioso (02-08); a caixa provada, o Traefik medido e o primeiro certificado emitido (02-04)"
provides:
  - "`DG2_BIND`: o endereço de bind virou configuração validada, com padrão em loopback — o defeito DM-9 corrigido antes de o compose existir"
  - "`ops/Caddyfile` de contêiner: bloco global com `auto_https off`, `admin off` e `trusted_proxies static private_ranges`, endereço `http://:8080`, upstream por nome de serviço e raiz dentro da imagem"
  - "A metade que faltava da defesa de DM-10: o `X-Forwarded-For` do Traefik sobrevive até o `clientIp()` da fase 3, com asserção que morde (provada por remoção)"
  - "Os cinco comentários órfãos de `apps/server/src/index.ts` reescritos para Docker — nenhum aponta mais para arquivo que o 02-14 apaga"
  - "`apps/server/src/signaling/turn.ts`: o outro lado da contradição de D2-29 fechado; a metade Node do segredo do relay aponta para o painel, não para um arquivo aposentado"
  - "Três asserções novas no bloco `ops/Caddyfile` (9 → 12 casos), e a prova de que seis atravessaram a containerização intocadas"
affects: [02-14, 02-12, 02-15, 03-04, 03-11]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Chave de ambiente cujo padrão é a defesa e cuja exceção mora no compose: o código nunca carrega o valor permissivo, que só existe onde é linha revisável em diff"
    - "Prova por remoção registrada: apagar a linha que corrige o defeito deixa exatamente um teste vermelho e nada mais se mexe — asserção que passa com e sem a linha é decoração"
    - "Restauração de mutação deliberada a partir de CÓPIA fora da árvore, nunca de `git checkout --`, com reconferência por grep de TODAS as edições depois"
    - "Razão longa no cabeçalho em coluna zero, ponteiro curto ao lado da diretiva: o token greppável vive no mesmo arquivo e a varredura por `grep -v '^#'` continua medindo estado de diretiva"

key-files:
  created:
    - .planning/phases/02-migra-o-para-a-vps/deferred-items.md
  modified:
    - apps/server/src/env.ts
    - apps/server/src/index.ts
    - apps/server/src/signaling/turn.ts
    - tests/server-env.test.ts
    - ops/Caddyfile
    - tests/ops-config.test.ts

key-decisions:
  - "`DG2_BIND` lido por `required()` e não por `optional()`: ausente significa \"o padrão\", não \"esta implantação não tem\" — é a diferença entre uma chave com padrão de produção legítimo e um segredo"
  - "Nenhuma validação de formato de endereço, e a ausência é asserida: o valor legítimo é qualquer coisa que `listen(2)` aceite, e um validador recusaria um endereço válido no dia em que a topologia mudasse"
  - "`GOOD` de `tests/server-env.test.ts` passa a carregar `DG2_BIND=0.0.0.0`: um ambiente completo é o implantado, e o implantado faz bind em tudo; o padrão de loopback é provado sobre ambiente VAZIO, que é o caso para o qual o padrão existe"
  - "Raiz do estático decidida aqui como `/srv/www` — o 02-14 diz que copia o `dist/` \"para a raiz que o `root *` aponta\", então o dono do caminho é este plano"
  - "As razões de `try_files` e `handle_errors` subiram para o cabeçalho em coluna zero: os critérios do próprio plano medem com `grep -v '^#'`, que só tira comentário de coluna zero, e seriam insatisfazíveis com a prosa indentada onde estava"
  - "O `/reload/i` da asserção da 443 foi substituído por três mais fortes (o dono da 443, o dono da queda de WebSocket e o grace de 60 s do 03-04) em vez de mantido sobre uma palavra que descrevia o mecanismo aposentado"

patterns-established:
  - "Comentário que cita arquivo apagado é defeito, não higiene: varrer o arquivo inteiro quando um plano futuro apaga algo que ele nomeia"
  - "Duas afirmações contraditórias sobre onde um segredo mora é o defeito a perseguir; fechar os dois lados no mesmo commit, ou nenhum"

requirements-completed: [INFRA-02, INFRA-03, INFRA-04]

# Metrics
duration: 25min
completed: 2026-09-10
---

# Phase 02 Plan 13: O delta de código que a containerização exige — Summary

**O bind do servidor virou `DG2_BIND` com padrão em loopback e o `ops/Caddyfile` virou política HTTP de contêiner atrás do Traefik, com os dois defeitos invisíveis em teste local (DM-9 e DM-10) corrigidos e cada um preso por uma asserção que morde — provada por remoção.**

## Performance

- **Duration:** ~25 min
- **Started:** 2026-09-10T14:48Z (11:48 local)
- **Completed:** 2026-09-10T15:12Z (12:12 local)
- **Tasks:** 2/2
- **Files modified:** 6 (+1 criado)

## Accomplishments

- **DM-9 corrigido antes de custar uma noite.** `hostname: '127.0.0.1'` em dois
  contêineres é o loopback *do contêiner do Node*, e o do Caddy não tem rota para
  lá. O sintoma seria 503 em todo `/api/*` desde o primeiro deploy **com todo o
  resto verde** — o jogo estático abrindo perfeitamente, o que faz parecer
  problema de Node e é de rede. Agora é configuração: `DG2_BIND`, validado, com
  padrão no loopback, e o `0.0.0.0` **não entra no código** (`grep -c "'0.0.0.0'"`
  = 0 nos dois arquivos de `apps/server`) — ele é posto no compose pelo 02-14,
  onde é escolha revisável em diff.
- **DM-10 corrigido, e a defesa agora tem as duas metades.** O Traefik já faz a
  parte honesta (recusa `X-Forwarded-For` de peer fora da lista e põe o peer TCP
  real); faltava o Caddy parar de descartá-lo. Sem `trusted_proxies static
  private_ranges`, o `clientIp()` de `apps/server/src/signaling/limiter.ts`
  contaria a internet inteira num balde só, com os dois desfechos que o comentário
  dele já nomeia — "ninguém é limitado" ou "todo mundo é", o segundo
  indistinguível, de fora, de o servidor estar fora do ar.
- **A política HTTP atravessou inteira.** Medido por diff das diretivas: das 30
  linhas de configuração do arquivo, **quatro** mudaram (bloco global novo,
  endereço do site, os dois upstreams e a raiz). O bloco `header` com os quatro
  cabeçalhos e o CSP derivado arquivo por arquivo, os três matchers de cache com o
  `not` que os torna mutuamente exclusivos, o `file_server` sem `try_files` e o
  `handle_errors` com o 503 em JSON estão **byte a byte** onde estavam.
- **Nenhum comentário aponta mais para arquivo que o 02-14 apaga.** Os cinco
  sítios de `index.ts` que citavam `dg2.service`, `ops/deploy.sh`, `systemctl` ou
  `systemd` — inclusive a primeira linha do arquivo — viraram a justificativa
  equivalente sob Docker, e o `turn.ts` deixou de apontar a metade Node do segredo
  do relay para um arquivo que D2-29 aposentou.

## Task Commits

1. **Task 1 (RED): `DG2_BIND` entra em `readEnv` pelo teste** — `109bb81` (test)
   — 9 casos vermelhos sobre `bind`, medido: 9 falhas / 48 verdes
2. **Task 1 (GREEN): o bind vira `DG2_BIND`, e os comentários descrevem a caixa
   que existe** — `dbd8054` (feat) — `env.ts`, `index.ts`, `signaling/turn.ts`
3. **Task 2: `Caddyfile` de contêiner, com as asserções no mesmo commit** —
   `abb079d` (feat) — `ops/Caddyfile`, `tests/ops-config.test.ts`

**Plan metadata:** ver o commit final deste plano.

_Task 1 tem dois commits porque o plano a marca `tdd="true"`: o vermelho é
deliberado e está medido na mensagem do `109bb81`._

## Files Created/Modified

- `apps/server/src/env.ts` — `bind` em `ServerEnv` e `DG2_BIND` em `DEFAULTS` com
  o loopback, lido por `required()`. Dois blocos novos de razão: por que
  `required()` e não `optional()`, e por que não existe validação de formato
- `apps/server/src/index.ts` — `hostname: env.bind` no lugar do literal, e seis
  blocos de comentário reescritos (entrypoint, paragráfo do `readEnv`, política de
  reinício, bloco do `serve()`, formato de log, fiação do desligamento e a nota do
  SIGTERM)
- `apps/server/src/signaling/turn.ts` — a linha 8 não diz mais `/etc/dg2/env`; diz
  os dois lugares certos **e** a propriedade que D2-29 manda escrever em voz alta
- `tests/server-env.test.ts` — 50 → 57 casos: sete chaves, cinco padrões,
  `DG2_BIND` nas duas tabelas e um bloco novo de três casos
- `ops/Caddyfile` — reescrito para a arquitetura de D2-25; cabeçalho em prosa
  refeito de fundo, bloco global novo, endereço `http://:8080`
- `tests/ops-config.test.ts` — três asserções mudadas, três nascidas (9 → 12 no
  bloco `ops/Caddyfile`), e o comentário de `NON_ROUTABLE_V4` corrigido
- `.planning/phases/02-migra-o-para-a-vps/deferred-items.md` — **criado**, com dois
  itens (ver "Itens adiados")

## Prova por remoção — o resultado, não a intenção

O plano pede a prova registrada. Feita sobre a suíte inteira:

| | Resultado |
|---|---|
| Mutação | linha `trusted_proxies static private_ranges` apagada de `ops/Caddyfile` |
| Vermelho | **1 teste**, `ops/Caddyfile > o Caddy confia no X-Forwarded-For que o Traefik entrega (DM-10)` |
| Resto da suíte | **59 arquivos e 935 casos seguiram verdes** — nada mais se mexeu |
| Restauração | de **cópia fora da árvore** (`scratchpad/Caddyfile.intact`), conferida por `cmp` byte a byte |
| Reconferência | os 14 critérios de shell do Caddyfile **e** os 10 da Task 1, todos por grep, depois de restaurar |

A restauração por cópia é a lição do 02-04: ali um `git checkout -- <arquivo>`
usado para reverter uma mutação deliberada descartou **todas** as edições não
commitadas daquele arquivo, e a perda só foi descoberta num commit de recuperação
(`e138983`). Nesta execução a mutação foi aplicada com a árvore já carregando a
reescrita inteira do Caddyfile não commitada — `git checkout --` teria apagado as
234 linhas de trabalho.

## As seis asserções que não mudaram

Resultado, não descuido: é a evidência de que a política HTTP atravessou a
containerização inteira. Nenhuma linha destas foi tocada:

1. `não usa a diretiva route, cuja ordem seria carga funcional (P-5)`
2. `não transforma 404 em index.html servido com 200 (DM-5)`
3. `manda os quatro cabeçalhos de segurança, e do lado do site`
4. `nenhuma classe de arquivo servido fica sem Cache-Control`
5. `responde 503 legível por máquina quando o upstream cai`
6. `o CSP já cobre o wss:// do signaling sem precisar mudar`

## Portões

| Portão | Antes | Depois |
|---|---|---|
| `npm test` | 926 testes / 60 arquivos | **936 / 60, verde** |
| `npm run lint` | 0 | **0** |
| `npm run typecheck:server` | 0 | **0** |
| `npm run server:build` | verde | **verde** (1.4 MB, a chave nova em `readEnv` não muda nada) |

**+10 casos, todos esperados:** `tests/server-env.test.ts` 50 → 57 (+7: o caso das
sete chaves e o da aparagem mudaram de conteúdo, não de contagem; nascem 4 casos
de valor em branco para `DG2_BIND` e 3 casos novos no bloco do `DG2_BIND`) e
`tests/ops-config.test.ts` 81 → 84 (+3: `auto_https off`, `admin off`,
`trusted_proxies`). Nenhuma contagem encolheu.

**A falha intermitente não identificada do dia anterior não reproduziu** em
nenhuma das quatro execuções completas desta sessão (uma delas com a mutação
aplicada, que é a que teria mais chance de mascarar).

## Decisions Made

- **`required()`, não `optional()`, para `DG2_BIND`.** `optional()` existe para
  valor sem padrão honesto — um segredo, e o realm que o escopa — onde ausente
  significa "esta implantação não tem". Aqui ausente significa "o padrão", e o
  padrão é uma resposta de produção correta. Lê-lo por `optional()` tornaria
  `bind` anulável e devolveria ao chamador uma decisão que é desta camada.
- **Nenhuma validação de formato, e a ausência é asserida.** `listen(2)` aceita
  endereço v4, v6 e nome; um validador que tentasse adivinhar isso recusaria um
  valor legítimo no dia em que a topologia mudasse — recusa no boot por uma
  configuração que estava certa. O caso `'::1'`, `'::'` e `'api'` existe para que
  a ausência seja decisão e não esquecimento.
- **`GOOD` passa a carregar `DG2_BIND=0.0.0.0`.** Um "ambiente completo" é o
  implantado, e o implantado faz bind em tudo. O padrão de loopback é provado
  sobre ambiente **vazio**, que é o único caso em que um padrão vale — e com duas
  asserções, porque comparar só com `DEFAULTS.DG2_BIND` ficaria verde se a tabela
  dissesse `0.0.0.0`, que é exatamente o erro que esta chave torna possível.
- **`/srv/www` como raiz do estático.** O 02-14 diz que o `Dockerfile` da imagem
  `web` copia o `dist/` "para a raiz que o `root *` do Caddyfile aponta", então o
  dono do caminho é este plano. O valor é o da pesquisa (§"Code Examples").
- **A 443 continua dívida registrada, com o dono trocado.** `layer4` e o segundo
  IP seguem sendo as saídas nomeadas; o que mudou é que a primeira passaria a ser
  arranjada **ao lado** do Traefik e não em vez do Caddy. A asserção que persegue
  a palavra continua verde de propósito.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Consistência de documentação] O parágrafo do `readEnv` em `index.ts` dizia "All three" e apontava para um arquivo que D2-29 aposentou**

- **Found during:** Task 1 (varredura de comentários)
- **Issue:** O bloco acima de `readEnv(process.env)` dizia *"All three come from
  /etc/dg2/env"*. Duas coisas erradas: (a) as chaves deixaram de ser três há dois
  planos e esta tarefa as levou a **sete**, e (b) sob D2-29 o app **não lê**
  `/etc/dg2/env` — o que já estava escrito, em sentido contrário, no
  `ops/turnserver.conf` corrigido pelo commit `e138983` e em `docs/OPERACAO.md`.
  Era a contradição exata que o `e138983` chamou de defeito.
- **Fix:** Parágrafo reescrito: os valores vêm do **ambiente do processo** —
  variáveis do app no painel do Coolify na implantação, shell no desenvolvimento —
  sem contagem de chaves, com D2-15 preservada ("o repo continua não dizendo onde
  a máquina vive") e com a medição do valor em branco intacta. Ganhou meia frase
  que fortalece o argumento: **um campo de painel limpo e salvo produz a mesma
  string vazia** que um arquivo truncado produzia, e sem diff nenhum para notar —
  o painel torna o caso mais provável, não menos.
- **Files modified:** `apps/server/src/index.ts`
- **Verification:** `npm test` verde; `grep -c '/etc/dg2/env' apps/server/src/index.ts` = 0
- **Committed in:** `dbd8054`

**2. [Rule 2 - Consistência de documentação] `index.ts` descrevia o formato de log pelo coletor da máquina antiga**

- **Found during:** Task 1 (mesma varredura)
- **Issue:** *"One JSON object per line, which is what the journal wants"* — sob
  Docker o destino é o stdout do contêiner e o coletor é o do Docker.
- **Fix:** "One JSON object per line **on stdout**, which is what a container log
  collector wants". O plano ordena a varredura ("reescrever cada um"); este é um
  dos "outros" que ela alcança.
- **Files modified:** `apps/server/src/index.ts`
- **Verification:** `npm test` verde, `npm run lint` 0
- **Committed in:** `dbd8054`

**3. [Rule 2 - Consistência de documentação] O comentário de `NON_ROUTABLE_V4` nomeava uma linha que deixou de existir**

- **Found during:** Task 2
- **Issue:** O doc de `NON_ROUTABLE_V4` em `tests/ops-config.test.ts` dizia *"the
  loopback that `{$DG2_UPSTREAM:127.0.0.1:8080}` carries"*. Com o padrão do
  upstream trocado pelo nome de serviço, **nenhum arquivo de `ops/` ou
  `tools/ops/` soletra mais `127.0.0.1`** (conferido por `git grep`).
- **Fix:** Comentário corrigido; a entrada `'127.0.0.1'` **fica** no conjunto, de
  propósito — tirá-la faria o portão recusar um loopback legítimo amanhã, e o
  token não diz nada sobre onde esta caixa vive, que é o critério de D2-15.
- **Files modified:** `tests/ops-config.test.ts`
- **Verification:** `npx vitest run tests/ops-config.test.ts` 84 verdes
- **Committed in:** `abb079d`

### Desvios estruturais (não são correções; são o plano cumprido de outra forma)

**4. As razões de `try_files` e de `handle_errors` subiram para o cabeçalho em coluna zero**

Dois critérios de aceitação da Task 2 são `grep -v '^#' ops/Caddyfile | grep -c
'try_files'` = **0** e `... 'handle_errors'` = **1**. Medido no arquivo antes de
mexer: davam **1** e **2**, porque `grep -v '^#'` só descarta comentário de
**coluna zero** e as duas explicações viviam indentadas dentro dos blocos (o
helper `code()` do teste, que filtra `^\s*#`, nunca as viu). Os critérios eram
insatisfazíveis com a prosa onde estava.

Resolução: a razão longa subiu para a seção "WHAT CONTAINERISATION DID NOT TOUCH"
do cabeçalho — que é **onde o próprio plano manda escrevê-la** ("diga no cabeçalho
que não tocou e por quê") — e ao lado da diretiva ficou um ponteiro curto sem o
token. O token continua greppável no mesmo arquivo, a localidade continua (o
ponteiro diz onde ler), e `grep -v '^#'` volta a medir estado de diretiva, que é o
que os critérios querem medir. **As diretivas são byte a byte as mesmas** — o diff
de diretivas no corpo deste documento é a prova.

**5. A asserção da 443 perdeu o `toMatch(/reload/i)` e ganhou três**

O plano manda a asserção mudar para exigir que o arquivo diga que a 443 é do
Traefik, mantendo a recusa de `SCHEDULED FOR PHASE 3` e a exigência de `layer4`.
O `/reload/i` ficou para trás de propósito: perseguia a palavra que nomeava o
mecanismo aposentado. No lugar entraram `443 IS NOT CADDY'S`, `recreation of the
container` e o par `60 s` + `03-04` — que prende as **duas** metades do aviso que
o plano diz não poder ser separado. (O arquivo ainda contém a palavra `reload`, ao
dizer que o dono mudou, então a asserção antiga teria continuado verde sobre um
texto que mudou de sentido — é o caso exato de asserção decorativa.)

**6. Os três requisitos voltaram de `Complete` para `Partial`, contra a ação mecânica do verbo**

`requirements mark-complete` marcou `INFRA-02`, `INFRA-03` e `INFRA-04` como
**Complete** e marcou os três checkboxes — porque é o que o frontmatter deste
plano lista. **É falso, e foi corrigido.** INFRA-02 é "o PWA continua instalável e
funcional offline **servido da VPS**" e INFRA-03 fala do service worker contra
`/api/`: as duas se verificam com navegador contra a caixa, que é o **02-12**.
INFRA-04 já estava `Partial` com nota dizendo que o 02-12 devia o ensaio de
restauração — e o verbo marcou o checkbox enquanto deixava a nota de Partial na
tabela, o que é contraditório dentro do mesmo arquivo.

Os três voltaram a `[ ]` e a tabela de rastreabilidade passou a `Partial` com a
contribuição deste plano nomeada e o dono do fechamento (02-12) nomeado. Um
requisito marcado completo é exatamente o tipo de afirmação que ninguém reconfere.

**7. `state advance-plan` incrementou o contador de plano de 2 para 3**

A fase 02 executa por **wave**, não por número de plano, e o verbo incrementa de um
em um. O valor de partida (2) já era obsoleto. Corrigido à mão para **14 of 15** —
o próximo a executar — com uma nota em `STATE.md` dizendo que o contador é cego à
ordem de wave e listando o que falta (02-14, 02-15 e o 02-12 de portão humano). É a
mesma cegueira que a memória do projeto já registra para o gate de decisões.
Também corrigido: a linha de métrica que o verbo escreveu fora da tabela, movida
para "Por plano, quando medido", e a contagem `02 | 11` → `02 | 12`.

---

**Total deviations:** 3 auto-fixed (3× Rule 2 — consistência de documentação entre
arquivos, todas dentro dos arquivos declarados no plano) + 2 desvios estruturais
forçados pelos critérios do próprio plano + 2 correções de registro automático que
estava errado (requisitos e contador de plano).
**Impact on plan:** Nenhum escopo novo. Os três auto-fixes são o mesmo defeito que
o plano existe para corrigir (comentário que descreve uma máquina que não existe),
encontrado em sítios que a enumeração do plano não listava. Os dois desvios
estruturais preservam o conteúdo e tornam os critérios verificáveis.

## Itens adiados

Criado `.planning/phases/02-migra-o-para-a-vps/deferred-items.md` com dois itens.
O primeiro importa para quem planejar depois do 02-14:

- **DEF-02-01 — `/etc/dg2/env` sobrevive em `apps/` e num teste, sem dono.** Seis
  ocorrências em quatro arquivos: `env.ts` (5, incluindo as **quatro mensagens de
  erro**), `health.ts`, `tests/server-migrate.test.ts` e os comentários de
  `tests/server-shutdown.test.ts` que citam `systemctl`/`systemd`. **Não foi
  corrigido aqui de propósito**: dois dos arquivos estão fora do `files_modified`
  deste plano, e corrigir metade produziria exatamente a contradição que este plano
  existe para remover. A mensagem de erro, além disso, é o contrato
  `file:pointer: message` que `ops/README.md` §1 documenta e que **cinco**
  asserções de `tests/server-env.test.ts` perseguem; o texto substituto depende do
  runbook que o **02-14** reescreve. Precisa de um plano depois do 02-14 que mude
  os dois lados na mesma janela.
- **DEF-02-02 — `git grep 'DG2_DOMAIN' -- ops/ apps/`** só fecha depois do 02-14.
  Ver abaixo.

## Issues Encountered

**O `<verification>` do plano pede `git grep -n 'DG2_DOMAIN' -- ops/ apps/` sem
saída, e isso não é alcançável por este plano.** Depois desta execução, `apps/`
está limpo e `ops/Caddyfile` está limpo — que é o que este plano é dono. Restam 12
ocorrências em `ops/README.md`, `ops/cert-check.sh`, `ops/cert-check.service` e
`ops/cert-check.timer`, **todos do 02-14**, que reescreve o primeiro e apaga os
três por D2-30. Registrado como DEF-02-02; fecha sozinho.

**A base do plano andou um commit durante a leitura de contexto.** O HEAD conferido
no início (`e138983`) ganhou `56882a3` *(docs(02-14): reconcilia o plano com
D2-33)* às 11:47, antes do primeiro commit desta execução às 11:52. Conferido: o
commit toca **só** `02-14-PLAN.md`, sem interseção com os seis arquivos deste
plano. Nenhuma ação necessária — anotado porque a cadeia de pais do `109bb81` não
é o hash que o briefing previa.

## User Setup Required

None — nenhuma configuração de serviço externo. As duas chaves que este plano
torna configuráveis (`DG2_BIND`) ou mantém (`DG2_UPSTREAM`) são escritas pelo
**02-14** na composição, não no painel.

## Next Phase Readiness

**Pronto para o 02-14,** que é o único dependente direto:

- `ops/Caddyfile` está no estado final que o `Dockerfile` da imagem `web` copia.
  O `root * /srv/www` é o caminho para onde o `dist/` tem de ir, e
  `{$DG2_UPSTREAM:api:8080}` **fixa o nome de serviço** que a composição precisa
  dar ao Node: `api`, na porta 8080.
- `DG2_BIND` existe e tem padrão seguro, então a linha `DG2_BIND=0.0.0.0` do
  serviço `api` tem onde aterrar. **A segurança dela depende de uma propriedade que
  o 02-14 tem de asserir: nenhum serviço declara `ports:`.** O comentário do
  `serve()` em `index.ts` nomeia o plano e a asserção, justamente para que a defesa
  não se perca ao trocar de dono.
- O `stop_grace_period` do serviço `api` continua tendo de ficar **acima** do
  `SHUTDOWN_GRACE_MS`, com folga para a sincronização final do Litestream. O
  comentário da fiação do desligamento diz isso e nomeia o 02-14 como dono do
  número.

**Nada aqui foi exercido contra a caixa.** O Caddyfile não foi parseado por um
Caddy de verdade nesta execução — não há Caddy neste repositório — então
`auto_https off`, `admin off` e a sintaxe do endereço `http://:8080` estão
verificados por asserção de texto e por leitura da documentação, não por
execução. O **02-12** é quem converte isso em fato, e é também quem fecha a
advertência de que o CSP nunca foi visto por um navegador.

---
*Phase: 02-migra-o-para-a-vps*
*Completed: 2026-09-10*

## Self-Check: PASSED

Conferido em 2026-09-10, depois de escrever este documento:

- Os seis arquivos modificados e os dois criados existem em disco (`test -f`).
- Os três commits de tarefa existem em `git log` (`109bb81`, `dbd8054`, `abb079d`).
- Árvore limpa antes do commit de metadados deste plano.
