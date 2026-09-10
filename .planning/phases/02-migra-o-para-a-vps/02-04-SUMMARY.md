---
phase: 02-migra-o-para-a-vps
plan: 04
subsystem: infra
tags: [coolify, docker-compose, traefik, lets-encrypt, coturn, ufw, litestream, vps]

# Dependency graph
requires:
  - phase: 02-migra-o-para-a-vps
    provides: "ops/turnserver.conf e tests/ops-config.test.ts (02-03); apps/server com /api/health e o campo release (02-08); o ci.yml verde num runner (02-01/02-11)"
provides:
  - "A1 PROVADA: o Coolify aceita uma composição de dois serviços vinda do repositório público, descobre os dois e atribui o domínio ao serviço `web`"
  - "O primeiro certificado válido do Let's Encrypt para o domínio do jogo, emitido pelo Traefik do Coolify — fecha a metade aberta de INFRA-01"
  - "`ops/probe/docker-compose.yml`: o andaime descartável que provou A1 sem depender de nenhum artefato de build"
  - "A faixa de relay do coturn declarada (`49200`-`49299`) E aberta no UFW em v4 e v6, com `total-quota` casada por asserção calculada — as duas metades de C-5"
  - "`docs/OPERACAO.md`: o registro datado de operação da fase, com as seções que os planos 02-12 e 02-14 preenchem"
  - "A forma do disparo manual decidida (`clique-painel`) e o critério 4 do roadmap reconciliado por escrito antes de alguém tentar verificá-lo"
affects: [02-12, 02-14, 02-15, 03-11, fase-3-sala-transporte-e-protocolo]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Andaime com data de morte marcada, fora do glob dos testes: ops/probe/ é deliberadamente invisível a tests/ops-config.test.ts porque as asserções daquele arquivo são promessas sobre o que a caixa executa para sempre"
    - "Asserção calculada do próprio arquivo em vez de constante copiada: total-quota é comparada com max-port menos min-port, então mudar a faixa e esquecer a cota fica vermelho"
    - "Registro de operação com estado explícito por seção: seção não executada fica declaradamente vazia com motivo e data, nunca apagada"

key-files:
  created:
    - ops/probe/docker-compose.yml
    - docs/OPERACAO.md
  modified:
    - ops/turnserver.conf
    - tests/ops-config.test.ts
    - .planning/STATE.md

key-decisions:
  - "Task 1 resolvida como `clique-painel` (opção B): nenhum token de API do Coolify é criado, e `tools/ops/deploy.mjs` não nasce"
  - "O critério 4 do roadmap fecha nesta fase como procedimento documentado e reversível, não como um comando, por decisão de D2-32"
  - "D2-33 absorvida em execução: não há bucket; a réplica do Litestream vai para caminho da própria caixa, em volume persistente, e a garantia off-site cai por escolha registrada"
  - "A configuração de limpeza automática de imagens NÃO foi lida, por decisão — e D2-24 fica explicitamente não-verificada em consequência"

patterns-established:
  - "Publicar antes de mandar o Coolify reler: o recurso lê o GitHub, não a máquina local, e o sintoma de esquecer é 'nenhum serviço descoberto', indistinguível de incompatibilidade do Coolify"
  - "Prova de execução entra em docs/OPERACAO.md como FATO, nunca como saída verbatim: o `subject=CN=` do openssl É o domínio, e D2-15 não abre exceção para prova"

requirements-completed: [INFRA-01, INFRA-04]

# Metrics
duration: ~2h (com o portão humano no meio)
completed: 2026-09-10
---

# Phase 2 Plan 04: A caixa, o primeiro certificado e o registro de operação — Summary

**A1 deixou de ser suposição: o Coolify subiu dois contêineres a partir de uma composição versionada neste repositório e o Traefik emitiu o primeiro certificado válido do Let's Encrypt para o domínio do jogo — com a faixa de relay do coturn declarada no arquivo e aberta no firewall, nas duas metades, e `docs/OPERACAO.md` aberto como o lugar único de prova de execução.**

## Performance

- **Duração:** ~2h de parede, com um portão de ação humana bloqueante no meio
- **Iniciado:** 2026-09-09
- **Concluído:** 2026-09-10
- **Tarefas:** 3 de 3
- **Arquivos modificados:** 5 (2 criados, 3 alterados)

## Accomplishments

- **A suposição A1 virou fato medido.** O log do primeiro deploy do Coolify (2026-09-09, 23:24:34 a 23:24:51) mostra o recurso importando `gustavoktausend/DungeonGuys2:main` no commit `0608fee` — exatamente o commit da Task 2 —, puxando `caddy:2.11.4-alpine` **duas vezes, uma por serviço**, e subindo os dois contêineres (`web-oagwo5ol1daqeyzcogxo84hs-232441691653` e `api-oagwo5ol1daqeyzcogxo84hs-232441692904`). **Foi `pull`, não `build`**: C-7 satisfeito, o Coolify não injeta construção sobre uma composição que não declara build. Consequência direta: **o plano 02-14 mantém a forma planejada**, e a alternativa custeada pela pesquisa ("Docker Compose Empty", colar o YAML no painel ao custo de D2-15 para aquele arquivo) não é necessária.
- **O primeiro certificado válido existe, e o catchall morreu.** Resposta **200 por HTTPS** com cadeia do Let's Encrypt (`C=US, O=Let's Encrypt, CN=YR2`), válida de 2026-09-09 22:40:52 GMT a **2026-12-08 22:40:51 GMT**, e HTTP respondendo 302 para HTTPS. Antes era 503 com o `TRAEFIK DEFAULT CERT` autoassinado, que é o estado medido em DM-18. É a metade não fechada de **INFRA-01**, agora fechada.
- **As duas metades de C-5 feitas no mesmo plano.** `min-port=49200` / `max-port=49299` declarados em `ops/turnserver.conf`, com `total-quota` de 1200 para 100 e `user-quota` de 12 para 6; e as quatro regras abertas no UFW **em IPv4 e IPv6** (3 regras base viraram 14), cada uma com comentário. O defeito que isto corrige é o mais caro de diagnosticar da fase 3: sem a faixa, o coturn aloca relay em 49152-65535/udp, o `deny incoming` bloqueia a faixa inteira, o relay autentica, entrega um endereço ao navegador e o tráfego nunca chega — com o sintoma "um amigo específico nunca entra", indistinguível de NAT ruim.
- **`docs/OPERACAO.md` aberto com 315 linhas e estado explícito por seção.** Três seções preenchidas com prova de execução, uma declaradamente vazia com motivo e data, duas pendentes para o 02-12, e uma que fica aberta para sempre por D2-11.
- **O critério 4 tem uma leitura escrita antes de alguém tentar verificá-lo** — que era a razão de a Task 1 ser um portão e não uma nota de rodapé.

## Task Commits

1. **Task 1: A forma do disparo manual, e a reconciliação do critério 4** — `004a8bd` (docs)
2. **Task 2: A composição de prova, a faixa de relay, o registro de operação e as asserções** — `0608fee` (feat)
3. **Task 3: A caixa — recurso do Coolify, primeiro certificado e firewall** — `ec56b2f` (docs)

## Files Created/Modified

- `ops/probe/docker-compose.yml` (**novo**, 68 linhas) — o andaime descartável que provou A1. Dois serviços, `caddy:2.11.4-alpine` fixado em tag de patch exata, `expose: ['80']` só no `web`, `restart: unless-stopped` nos dois. Sem `networks`, sem porta publicada no host, sem passo de build. Vive em `ops/probe/` porque o glob `../ops/*` de `tests/ops-config.test.ts` não desce em subdiretório: é andaime, e o plano 02-14 o apaga no mesmo commit em que cria o compose de verdade.
- `ops/turnserver.conf` — `min-port`/`max-port` declarados; `total-quota` 1200 → 100 e `user-quota` 12 → 6; o parágrafo do 443 reescrito (o dono passou a ser o Traefik do Coolify, não o Caddy, e a dívida de TURN sobre TLS ficou mais caro de pagar porque a saída pelo `layer4` do Caddy não alcança uma porta que seu contêiner não tem); e um parágrafo em caixa alta no cabeçalho com o defeito corrigido e a metade que vive na caixa.
- `docs/OPERACAO.md` (**novo**, 315 linhas) — inventário da caixa, a regra de ouro, os riscos herdados do vizinho, as variáveis do painel, publicar e reverter, as duas pegadinhas do primeiro deploy, e as seis seções de marcador.
- `tests/ops-config.test.ts` — 7 casos novos (74 → 81): a faixa de relay como faixa de verdade, `total-quota` contra o tamanho calculado da faixa, e um bloco de 5 casos para `docs/OPERACAO.md` com glob raw próprio, piso anti-vacuidade de 2000 bytes, as seis seções por título exato e unicidade, e o portão D2-15 aplicado **antes** de qualquer saída colada.
- `.planning/STATE.md` — a decisão da Task 1 registrada durável.

## Decisions Made

**1. Task 1 — `clique-painel` (opção B), e a frase que fecha o critério 4.**
Gustavo recusou a opção A (`tools/ops/deploy.mjs`) porque ela exigiria criar um token de API — um registro novo na instância do Coolify que o infraKring opera. É a aplicação mais estrita de D-VPS-02, coerente com D2-32 e com "não vamos alterar NADA sobre o coolify". A frase de reconciliação, literal, está em `docs/OPERACAO.md` § Publicar e reverter:

> o critério 4 fecha nesta fase como um procedimento documentado e reversível, não como um comando, por decisão de D2-32

A metade reversível sobrevive intacta (D2-24 + `pull_policy: missing`). Consequências travadas: **`tools/ops/deploy.mjs` não existe** (ele estava em `files_modified` do frontmatter porque o plano previa os dois caminhos); **nenhum token de API foi criado**; e **nenhum dos quatro secrets de SSH** (`DEPLOY_SSH_KEY`, `DEPLOY_HOST`, `DEPLOY_USER`, `DEPLOY_KNOWN_HOSTS`) **nem `DEPLOY_ENABLED` será criado** — D2-32 os apagou antes de nascerem.

**Nota para o executor do 02-14:** sob esta decisão os globs `ops/*` + `tools/ops/*` terminam o 02-14 com **nove entradas exatas**, não dez. É o caso sem o script, e é exatamente por isso que o 02-14 fixa o piso anti-vacuidade em `9`. Não há nada a mudar naquele plano; a conta dele agora está decidida.

**2. D2-33, tomada durante este plano: não há bucket.**
O item de `user_setup` do bucket **sai do escopo por decisão registrada, não por omissão**. O Litestream 0.5 suporta réplica `file`, então a réplica contínua sobrevive e só o **destino** muda: um caminho da própria caixa, em volume persistente. O `replicate -exec`, o repasse de sinal de DM-13 e o `stop_grace_period: 30s` continuam idênticos — só a seção de destino do `ops/litestream.yml` muda de `s3` para `file`. Quatro variáveis **deixaram de existir**: `LITESTREAM_BUCKET`, `LITESTREAM_ENDPOINT`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`.

O critério 4 continua fechando — o ensaio de D2-03 roda na caixa, em diretório descartável, sobre a réplica `file`, e "restaurado num ambiente limpo com o resultado anotado" segue literalmente verdadeiro. **O que cai é a garantia off-site**, e isso é escolha e não descuido: a réplica protege contra corrupção do banco, migração ruim e deploy errado, **não** contra perder a caixa. A tarefa **T9 do infraKring deixa de ser fechada por esta fase**. E anda com uma armadilha escrita em voz alta no runbook: **o caminho da réplica tem de viver num volume persistente**, ou o primeiro redeploy apaga o backup em silêncio — o pior modo de falha possível, porque o backup continua parecendo existir. O 02-14 declara os dois volumes; o 02-12 prova que a réplica sobreviveu a um redeploy.

**D2-23 reafirmada no mesmo portão:** o integrador constrói e publica no GHCR, a caixa faz `pull` — o que o deploy de hoje já exercitou. O 02-15 segue como planejado. O que é manual é só o **disparo** (D2-32), nunca a **construção**.

**3. A limpeza automática de imagens não foi lida, por decisão.**
O passo B5 do `user_setup` não foi executado. A seção § Limpeza automática de imagens do servidor fica **declaradamente vazia, com motivo e data**, em vez de apagada — apagá-la transformaria uma lacuna conhecida numa lacuna invisível. A consequência está escrita sem inventar tarefa para ela: **D2-24 fica não-verificada.** A afirmação de que a imagem anterior "já está no disco" é hoje suposição, não fato medido; se o gatilho do Coolify for agressivo, pode não haver imagem anterior no dia em que a reversão importar (C-3). O 02-12 exercita a reversão de verdade e é ele quem transforma isso em fato, em qualquer das duas direções.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] As duas asserções de cota do teste contradiziam o arquivo que a mesma tarefa alterava**
- **Encontrado durante:** Task 2
- **Problema:** O bloco `ops/turnserver.conf` de `tests/ops-config.test.ts` exigia, por `toContain`, as linhas literais `user-quota=12` e `total-quota=1200`. A própria ação da Task 2 manda baixar os dois números, e um dos seus critérios de aceitação exige `grep -c 'total-quota=1200'` igual a 0. As asserções antigas e o arquivo novo não podiam coexistir.
- **Correção:** As duas linhas da lista passaram a `user-quota=6` e `total-quota=100`, com comentário dizendo que elas só fixam o valor e que o casamento com a faixa é garantido pela asserção calculada que nasceu ao lado.
- **Arquivos:** `tests/ops-config.test.ts`
- **Verificação:** `npx vitest run tests/ops-config.test.ts` = 81 passes.
- **Commitado em:** `0608fee`

**2. [Rule 2 - Correctness] O cabeçalho de `ops/turnserver.conf` apontava o segredo do relay para um lugar que D2-29 tinha desativado**
- **Encontrado durante:** Task 2
- **Problema:** O cabeçalho dizia que a metade Node do `static-auth-secret` vive em `/etc/dg2/env`. D2-29 mudou isso: as variáveis do app passaram para o painel do Coolify, e o par passou a existir em **dois lugares de naturezas diferentes** — um arquivo no host e um painel web. Deixar a frase antiga seria contradizer, no mesmo commit, o `docs/OPERACAO.md` que a mesma tarefa escreve — e o arquivo cujo motivo de existir é não estar errado por meses apontaria para um local morto, com o sintoma "um amigo específico nunca entra" e o operador procurando no arquivo errado.
- **Correção:** Duas linhas do cabeçalho reescritas, citando D2-29 e nomeando as duas naturezas, com a referência cruzada para `docs/OPERACAO.md`.
- **Arquivos:** `ops/turnserver.conf`
- **Verificação:** `npx vitest run tests/ops-config.test.ts` verde, incluindo o portão D2-15 sobre o arquivo cru.
- **Commitado em:** `0608fee`

### Consequências de decisão, registradas como tais e não como desvio

- **`tools/ops/deploy.mjs` não foi criado.** Ele está no `files_modified` do frontmatter do plano porque o plano previa os dois caminhos da Task 1. Sob `clique-painel` ele não existe. O `files_modified` real deste plano são **quatro** arquivos do repositório (mais `.planning/STATE.md`), não cinco.
- **O item de `user_setup` que pedia o token de API sai do escopo**, por ser condicionado à opção A.
- **Os dois itens de `user_setup` do bucket saem do escopo** por D2-33 (acima).
- **O item B5 do `user_setup` (ler a limpeza de imagens) não foi executado** por decisão (acima).

---

**Total de desvios:** 2 auto-corrigidos (1 × Rule 3, 1 × Rule 2)
**Impacto no plano:** nenhum escopo novo. O primeiro era pré-requisito aritmético do próprio plano; o segundo é duas linhas de comentário num arquivo que a tarefa já estava editando, evitando que o commit contivesse duas afirmações contraditórias sobre onde um segredo mora.

## Issues Encountered

**1. Duas tentativas perdidas no painel do Coolify — as duas vão para o runbook.**

- **O recurso lê o GitHub, não esta máquina.** A primeira tentativa listou **zero serviços**. A causa não era o Coolify: `origin/main` estava **113 commits atrás** do local e `ops/probe/docker-compose.yml` só existia aqui, então o clone não tinha o arquivo. O sintoma — "nenhum serviço descoberto" — é indistinguível de "o Coolify não suporta esta composição", que é precisamente a conclusão errada que faria o 02-14 mudar de forma sem motivo. Resolvido empurrando `3f25a68..0608fee`. **Publicar antes de mandar o Coolify reler** entrou em `docs/OPERACAO.md` como passo obrigatório do procedimento de publicação, não como recomendação.
- **O campo de domínio já põe o esquema.** Digitar a URL completa produziu `https://https://…` e o erro `Invalid URL … The hostname must be a fully qualified domain name`. O valor que funciona é **só o hostname**. A localização exata do campo no painel **não está registrada**: quem executou não a informou, e inventá-la seria pior que deixá-la em branco. Ficou como lacuna nomeada para o 02-12.

**2. Um `git checkout --` apagou trabalho da Task 2 e foi recuperado de backup.**
Ao provar por mutação que a asserção de cota calculada realmente morde (alterei `max-port` e confirmei o vermelho: *"total-quota=100 excede as 50 portas da faixa"*), reverti a mutação com `git checkout -- ops/turnserver.conf` — que descartou **todas** as edições não commitadas do arquivo, não só a mutação. Recuperado byte a byte da cópia que eu havia feito antes da mutação, e reconferido por grep e pelo teste. Lição registrada: numa mutação deliberada, restaurar da cópia, nunca do índice.

**3. Não consegui reconferir o estado da caixa por conta própria.** A chamada `ssh dg2vps` com `sudo` (somente leitura: `ufw status`, `df`, `docker system df`) foi bloqueada pelo classificador de permissões. Não contornei. O checkpoint foi escrito com os números medidos pela pesquisa de 2026-09-09, e todos os fatos de execução deste SUMMARY vêm do operador.

## Verification

| Portão | Resultado |
|---|---|
| `npm test` | **926 testes em 60 arquivos, verde** (eram 919 antes do plano; +7 do bloco novo) |
| `npm run lint` | **0** |
| `npx vitest run tests/ops-config.test.ts` | **81 passes** (eram 74) |
| Mutação da asserção de cota | vermelha com a mensagem certa, e verde ao restaurar |
| `grep` de IPv4 em `docs/OPERACAO.md` | nada além do excusado, mesmo depois da prova de execução |
| A1 | **provada** — dois serviços descobertos, `pull` e não `build`, dois contêineres `Started` |
| Certificado | **200 por HTTPS**, cadeia do Let's Encrypt, expira **2026-12-08** |
| UFW | 3 regras base → **14**, com as quatro do coturn em v4 e v6 |

A contagem de testes **não mudou** entre a Task 2 e a Task 3: a Task 3 só acrescentou prosa a `docs/OPERACAO.md`, e o bloco novo assere estrutura e ausência de vazamento, não volume.

Sobre a linha de verificação `git grep -nE '([0-9]{1,3}\.){3}[0-9]{1,3}' -- docs/ ops/ tools/ops/`: ela imprime 6 linhas, **todas** pré-existentes e **todas** da deny-list de `ops/turnserver.conf` (as faixas reservadas de RFC 1918, RFC 6598, loopback e link-local). O portão executável correspondente — o bloco D2-15 do teste — as excusa por token exato, e o comentário dele explica por quê em detalhe: recusá-las empurraria a deny-list para fora do repositório, trocando um vazamento de endereço que ela não sofre pelo SSRF que ela existe para impedir. A linha do plano é uma forma mais grosseira do mesmo portão; o portão fino está verde.

## Known Stubs

Nenhum. `ops/probe/docker-compose.yml` **não** é stub: é andaime com data de morte declarada no próprio cabeçalho e com o número do plano que o remove (02-14). Ele fez o trabalho dele hoje.

## User Setup Required

**Nada pendente deste plano.** Os quatro itens de `user_setup` foram resolvidos, três deles executados e um fora de escopo por decisão:

| Item | Desfecho |
|---|---|
| Coolify — criar o recurso e atribuir o FQDN ao `web` | **executado** (A1 provada) |
| Coolify — LER a limpeza automática de imagens | **não executado, por decisão** (D2-24 fica não-verificada) |
| Coolify — token de API | **fora de escopo** (opção `clique-painel`) |
| Bucket S3 e as quatro variáveis | **fora de escopo** (D2-33) |
| UFW — as quatro regras do coturn | **executado** (v4 e v6, 14 regras) |

## Next Phase Readiness

**Desbloqueados por este plano:**

- **02-13, 02-14, 02-15** — A1 provada significa que o 02-14 mantém a forma planejada: compose de dois serviços vindo do git, sem cair na alternativa de colar o YAML no painel. O 02-14 também ganhou duas obrigações novas de D2-33: a seção de destino do `ops/litestream.yml` muda de `s3` para `file`, e os **dois** volumes persistentes (banco e réplica) têm de ser declarados.
- **02-12** — é quem exercita o que ficou em aberto: a reversão por imagem local (que hoje é suposição, porque a limpeza não foi lida), o ensaio de restauração sobre a réplica `file`, **a prova de que a réplica sobrevive a um redeploy**, e o monitor externo. Também é quem registra a localização do campo de domínio no painel.
- **03-11 (fase 3)** — a dependência de infraestrutura **caiu**: as quatro regras do coturn estão abertas. O ajuste apontado pelo plan-checker (W2) **continua pendente e agora é mais urgente**: o `03-11-PLAN.md` tem `user_setup` próprio mandando abrir só as **três** portas base, sem menção à faixa de relay, e não cita `docs/OPERACAO.md`. Ele precisa passar a **verificar** `docs/OPERACAO.md` § Firewall do coturn em vez de reabrir às cegas.

**Dívidas e lacunas que saem deste plano, nomeadas:**

1. **D2-24 não-verificada** — a reversão por imagem local depende de uma rotina de limpeza que não foi lida e que este projeto não controla.
2. **Sem garantia off-site** — D2-33. A T9 do infraKring não é fechada por esta fase.
3. **A localização do campo de domínio no painel** — lacuna em branco de propósito, para o 02-12.
4. **O alarme de 30 dias do certificado mudou de dono** e ainda não existe: o certificado expira em **2026-12-08**, o alarme deveria soar por volta de **2026-11-08**, e o monitor externo é do 02-12. Até ele existir, ninguém avisa.
5. **A lacuna de D2-11 segue aberta** — PWA em iOS/Safari físico sem cobertura, e o Playwright só suporta service worker em Chromium, então Firefox e WebKit também ficam de fora. A caixa em `docs/PARIDADE.md` permanece **aberta** ao fim da fase, e o **critério 2** do roadmap deve ser lido com essa ressalva.
6. **Dois riscos herdados do infraKring** ficam como observação sem ação (D-VPS-02), registrados em `docs/OPERACAO.md` § Riscos herdados como causa possível de incidente: a 8080 do Traefik publicada em todas as interfaces e fora da lista do lockdown, e o `coolify-lockdown.service` inativo.

---
*Phase: 02-migra-o-para-a-vps*
*Completed: 2026-09-10*

## Self-Check: PASSED

Todos os arquivos declarados existem em disco e os tres commits de tarefa existem no historico
(`004a8bd`, `0608fee`, `ec56b2f`). Conferido em 2026-09-10.
