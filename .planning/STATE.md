---
gsd_state_version: 1.0
milestone: v1.0
milestone_name: milestone
status: executing
stopped_at: 02-15-PLAN.md Task 2 interrompida por queda de energia
last_updated: "2026-09-10T16:36:15.000Z"
last_activity: 2026-09-10
progress:
  total_phases: 9
  completed_phases: 1
  total_plans: 40
  completed_plans: 37
  percent: 11
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-08-28)

**Core value:** Quatro amigos entram numa sala pelo código e lutam as mesmas waves no mesmo
mundo, com o jogo respondendo na hora para cada um.
**Current focus:** Phase 02 — migra-o-para-a-vps

## Current Position

Phase: 02 (migra-o-para-a-vps) — EXECUTING
Plan: 15 of 15
Status: **02-15 EM EXECUÇÃO — Task 1 concluída, Task 2 interrompida no meio**
Last activity: 2026-09-10

> **A fase 02 roda por WAVE, não por número de plano**, e o contador de plano do
> GSD não sabe disso: `state advance-plan` incrementa de um em um. Concluídos:
> 02-01 a 02-11, **02-13** (wave 9) e **02-14** (wave 10). Em execução: **02-15**
> (wave 11). Falta **02-12**, que é o de portão humano contra a caixa. O número
> acima aponta o plano em curso, corrigido à mão depois do 02-14.
>
> **Um ponteiro quebrado, inerte e com dono:** o recurso do Coolify aponta para
> `ops/probe/docker-compose.yml`, que o 02-14 apagou. Sob D2-32 nada dispara
> deploy sozinho, então ele não quebra nada até alguém promover à mão — e o
> `user_setup` do **02-12** já carrega a tarefa de repontá-lo para
> `ops/docker-compose.yml`.

Progress: [█████████░] 93%

## Performance Metrics

**Velocity:**

- Total plans completed: 14
- Average duration: —
- Total execution time: 0.0 hours

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 01 | 14 | - | - |
| 02 | 12 | - | - |

**Por plano, quando medido:**

| Plano | Duração | Tarefas | Arquivos |
|-------|---------|---------|----------|
| 02-04 | ~120 min (com portão humano no meio) | 3 | 5 |
| 02-13 | ~25 min | 2 (3 commits: RED/GREEN + Task 2) | 6 modificados, 1 criado |
| 02-14 | ~29 min | 3 | 3 criados, 12 modificados, 10 apagados |

**Recent Trend:**

- Last 5 plans: —
- Trend: —

*Updated after each plan completion*

## Accumulated Context

### Decisions

Registro completo em PROJECT.md (Key Decisions). Decisões que moldam o trabalho atual:

- [2026-08-29] `TILE` muda como tamanho de tile **de desenho**; `world.play` ganha margem
  própria; `WORLD` continua 2400×1600 — fechado, não reabrir

- [2026-08-29] v1 rankeia **só solo**; ranking co-op fica para v2
- [2026-08-29] Versionamento do ranking segue o modelo **Factorio**: mudança de `SIM_VERSION`
  fecha a temporada e abre outra; replay de outra versão é recusado

- [2026-08-29] O espelho no GitHub Pages **morre** com a migração para a VPS
- [Roadmap] Temporadas fundidas ao ranking (fase 9); reconexão subiu para a fase 5;
  progressão durável na queda do host foi para a fase 6

- [2026-09-09] **02-04 Task 1 — o disparo manual do deploy é `clique-painel` (opção B).**
  Recusada a opção A (`tools/ops/deploy.mjs`): ela exigiria criar um token de API, que é um
  registro novo na instância do Coolify que o infraKring opera, e D-VPS-02 ganha de preservar a
  letra do critério 4. Consequências travadas: **`tools/ops/deploy.mjs` não nasce**; nenhum token
  de API do Coolify é criado; e o critério 4 do roadmap é lido assim, daqui para frente —
  > o critério 4 fecha nesta fase como um procedimento documentado e reversível, não como um
  > comando, por decisão de D2-32

  A metade reversível sobrevive intacta (D2-24: apontar para a imagem anterior, já em disco, com
  `pull_policy: missing` garantindo que voltar não usa rede). Nenhum dos quatro secrets de SSH
  (`DEPLOY_SSH_KEY`, `DEPLOY_HOST`, `DEPLOY_USER`, `DEPLOY_KNOWN_HOSTS`) nem `DEPLOY_ENABLED`
  será criado — D2-32 os apagou. Sob esta decisão os globs de `ops/*` + `tools/ops/*` do
  `tests/ops-config.test.ts` terminam o 02-14 com **nove entradas exatas**, não dez: é o caso
  sem o script, que o piso `>= 9` do plano 02-14 já previu de propósito.

- [2026-09-10] 02-04: o disparo do deploy é clique no painel pelo túnel (clique-painel); o critério 4 fecha como procedimento documentado e reversível, não como um comando (D2-32). tools/ops/deploy.mjs não nasce e nenhum token de API do Coolify é criado
- [2026-09-10] A1 PROVADA contra a caixa: o Coolify aceita composição de dois serviços vinda do repositório, fez pull e não build, e o Traefik emitiu o primeiro certificado do Let's Encrypt (expira 2026-12-08). O plano 02-14 mantém a forma planejada
- [2026-09-10] D2-24 fica NÃO-VERIFICADA: a limpeza automática de imagens do Coolify não foi lida, por decisão, então 'a imagem anterior já está no disco' é suposição até o 02-12 exercitar a reversão
- [2026-09-10] 02-13: `DG2_BIND` é configuração com padrão em loopback; o valor `0.0.0.0` existe só no compose do 02-14, e a segurança dele depende da asserção estrutural "nenhum serviço declara `ports:`" (T-2-BIND). Sem validação de formato, de propósito e asserido — o legítimo é o que `listen(2)` aceita
- [2026-09-10] 02-13: o `ops/Caddyfile` não declara domínio e não termina TLS — a 443 é do Traefik do Coolify. Endereço do site `http://:8080`, upstream pelo nome de serviço `api` do compose, raiz do estático `/srv/www` **dentro da imagem** (o 02-14 copia o `dist/` para lá)
- [2026-09-10] 02-13: `trusted_proxies static private_ranges` fecha a metade que faltava de DM-10 — provado por remoção: apagar a linha deixa **exatamente 1** teste vermelho e os outros 935 casos intactos
- [2026-09-10] 02-13: `/etc/dg2/env` sobrevive em `apps/server/src/env.ts` (5×, incluindo as quatro mensagens de erro), `health.ts` e dois testes — **adiado por decisão** (DEF-02-01): a mensagem é contrato de `ops/README.md` §1, que o 02-14 reescreve, e corrigir metade recria a contradição que o 02-13 existe para remover
- [2026-09-10] 02-14: D2-33 executada — `DG2_REPLICA_PATH` é **literal** em `ops/docker-compose.yml` e chega a `ops/litestream.yml` por `${...}`. Literal de propósito: a must-have de D2-33 é que a réplica viva em volume persistente, e um valor que só o painel conhece é um valor que nenhum teste pode comparar contra um ponto de montagem
- [2026-09-10] 02-14: **dois** volumes persistentes com pontos de montagem distintos (`/var/lib/dg2` e `/var/lib/dg2-replica`), não um subdiretório do volume do banco — um subdiretório satisfaria "persistente" e faria o `restore` ler de dentro do que está restaurando
- [2026-09-10] 02-14: **perda declarada de P-9** — o systemd chegava a `failed` e parava, o Docker tenta para sempre. Sem equivalente a `StartLimitBurst` no Compose, a corrente de alarme passa a ser o `healthcheck` da composição mais o monitor externo de D2-21, e o monitor deixou de ser conforto (T-2-LOOP, aceita)
- [2026-09-10] 02-14: o piso anti-vacuidade de `ops/`+`tools/ops/` desceu de 13 para **9**, **igual** à contagem real e sem folga — de modo que apagar qualquer arquivo do subsistema fica vermelho pelo piso. **Provado por remoção** (9 casos vermelhos, com a mensagem do piso), restaurado de cópia fora da árvore e reconferido por `cmp` e grep
- [2026-09-10] 02-14: **DEF-02-01 continua adiado, mas deixou de ser órfão** — dono nomeado (a primeira wave da fase 3 que tocar `apps/server/src/env.ts`) e texto substituto JÁ DECIDIDO em `deferred-items.md`, porque era o runbook que faltava. **DEF-02-02 fechado**: `git grep 'DG2_DOMAIN' -- ops/ apps/` não imprime nada

### Pending Todos

Nenhum ainda.

### Blockers/Concerns

Quatro decisões humanas de produto continuam abertas e precisam de resposta **antes** da fase
que as consome — carregadas como perguntas abertas nas fases:

- **Política de queda do host** (fases 5 e 6) — creditar run parcial, checkpoint por wave
  concluída, ou migração de host. É a mais urgente: a fase 5 já depende dela.

- **Quem pode entrar numa missão destravada** (fase 8) — a cadeia de quem criou a sala define,
  com crédito para todos os presentes? "Carregar" um amigo é feature ou não?

- **Teto do forge em runs rankeadas e de evento** (fase 9) — perfil normalizado ou teto?
- **Teto de duração para endless no ranking** (fase 9) — teto explícito ou amostragem por
  checkpoint?

Riscos técnicos herdados, já endereçados pelo roadmap: divergência de `Math.sin/cos/atan2`
entre motores (fase 1), snapshot de 13,8 KB contra limite de 16 KiB (fase 3), `updateBossPattern`
sem teste nenhum (fase 1, junto com `sim/math.ts`).

## Deferred Items

| Category | Item | Status | Deferred At |
|----------|------|--------|-------------|
| Infra/VPS | 02-04 -- A1 provada, primeiro certificado valido do Let's Encrypt, as 4 regras de UFW do coturn abertas em v4 e v6 | **RESOLVIDO 2026-09-10** (`ec56b2f`) | 2026-08-31 |
| Infra/VPS | 02-04 -- LER (sem alterar) a limpeza automatica de imagens do servidor | **Fora de escopo por decisao** -- nao lida; D2-24 fica NAO-VERIFICADA ate o 02-12 exercitar a reversao | 2026-09-10 |
| Infra/VPS | 02-04 -- bucket S3 privado + chave limitada a ele, e as 4 variaveis de bucket | **Fora de escopo por D2-33** -- nao ha bucket; a replica do Litestream vai para caminho da propria caixa. A garantia off-site cai, e a T9 do infraKring nao e fechada por esta fase | 2026-09-10 |
| Infra/VPS | 02-12 -- executar deploy, reversao por imagem, ensaio de restauracao sobre a replica `file` e provar que a replica sobrevive a um redeploy | **Desbloqueado** (02-04 concluido) | 2026-08-31 |
| Infra/VPS | 03-11 -- subir o coturn na VPS, exercitar o relay entre duas redes residenciais e medir o desfecho ICE; fecha o critério 3 (SALA-04). **A dependencia de infraestrutura CAIU**: as 4 regras de UFW estao abertas (ver `docs/OPERACAO.md` § Firewall do coturn). Falta: o ajuste do proprio `03-11-PLAN.md` (ele ainda manda reabrir as cegas so as 3 portas base, sem a faixa de relay), decisão ssh-do-Claude vs execução manual, e segundo jogador em outra rede | Parcialmente desbloqueado | 2026-09-08 |

## Nota para o planejamento da fase 3

A fase 3 declara `Depends on: Phase 2`, e a fase 2 esta em **10/12**: 02-04 e 02-12 seguem
adiados por falta da VPS (ver Deferred Items acima). A decisao do usuario foi avancar na
fase 3 pelo que e codigo puro enquanto a caixa nao existe.

Consequencia para o discuss/plan da fase 3 -- o criterio de sucesso 3 (**"a sala fecha entre
jogadores atras de NAT residencial brasileiro, incluindo pelo caminho de relay"**, SALA-04)
depende do coturn, que mora na VPS. Ele NAO pode ser fechado antes do 02-04. Todo o resto da
fase e local:

- codec binario quantizado do snapshot e o bench de CI abaixo de 16 KiB (criterio 5, SYNC-04)
- as duas classes de canal e as tabelas de enum congeladas
- codigo de sala, lobby, escolha de classe e atribuicao de slots `p0..p3` (criterios 1 e 2)
- telemetria de ping/rota e o registro do desfecho ICE (criterio 4) -- a estrutura e local,
  a medicao real precisa da caixa

**Planejada em 2026-09-05:** 11 planos em 7 ondas (commits `3b3f2a1`, `591717b`). Só o `03-11`
(onda 7, `autonomous: false`) depende da caixa: coturn real, relay real e medição ICE contra NAT
de verdade — é ele que fecha o critério 3 (SALA-04) e fica bloqueado até o 02-04. Os outros
10 planos são código puro e não esperam pela VPS. `03-04` e `03-09` também são
`autonomous: false`, mas por checkpoints locais (legitimidade do `zod`; conferência visual).

Sequencie as ondas de forma que o que depende da VPS caia nas ultimas, como a fase 2 fez.

**Executada em 2026-09-08:** ondas 1 a 6 mescladas em `main` (planos 03-01 a 03-10, cada um com
SUMMARY e Self-Check PASSED); portão pós-merge final: build 0, 886 testes em 60 arquivos, lint 0,
Playwright 11 passes, `bench:snapshot` = wave16 1492/798/644 B contra teto de 16384. Dois portões
humanos aprovados por Gustavo: legitimidade do `zod` (03-04) e conferência visual das quatro telas
(03-09). `03-VERIFICATION.md` = `passed` com **um override documentado**: o critério 3 (SALA-04)
está bloqueado por infraestrutura, não falho. **A fase não foi marcada completa de propósito** —
ela fecha quando o 03-11 rodar contra a caixa (depois de 02-04 e 02-12). Dívidas registradas nos
SUMMARYs e em `deferred-items.md`: `REJECT_REASON` sem `badMessage`; `VERSIONS.sim = 'unwired'`
(o hash do tick 0 cobre a divergência na prática); `BOSS_STATE` pinado só por valor; vetor HMAC e
`DEV_STUN_DOMAIN` por provar contra um coturn real.

**Revisão de código (`03-REVIEW.md`, 2026-09-08): 3 críticos, 10 avisos, 10 informativos — não corrigidos.**
Três achados conferidos à mão pelo orquestrador contradizem parte da verificação: **CR-01** o relay
do signaling repassa `from` sem conferir (spoofing na negociação WebRTC); **CR-03** o portão de
versão D-08 (`checkVersions`) não é chamado em nenhum lugar; **WR-01** nenhum cliente envia
`iceOutcome`, então a tabela `ice_outcome` nunca recebe linha — a metade "desfecho ICE fica
registrado" do critério 4 está implementada só do lado do servidor. Caminho sugerido:
`/gsd-code-review 3 --fix` (críticos + avisos) e depois reverificar antes de abrir a fase 4.

**Correção da revisão (`03-REVIEW-FIX.md`, 2026-09-08, `349cb7d`): 13/13 corrigidos (CR-01..03, WR-01..10), 33 testes novos,
919 verdes, lint 0, build ok, e2e de sala 1 passed.** Integrada a `main` por fast-forward a partir de `8f9cb93`. Dois sub-itens
ficaram adiados por decisão registrada: `authorityReturned` (WR-02) segue sem gatilho até a mensagem `rejoin` da fase 5 (TEMP-04),
e o limiter genérico por socket (CR-02) espera a medição da primeira sessão real (03-11). `turns:` saiu da lista de ICE até
existir passo de certificado no runbook (WR-09). Os informativos IN-01..IN-10 não foram tocados. A `03-VERIFICATION.md` é
anterior às correções e precisa ser refeita antes de a fase 4 abrir.

## Decisão de infraestrutura — 2026-09-09 (muda a fase 2)

A caixa foi encontrada, inventariada e **não está vazia**: é o host do projeto `infraKring`
(`Documents/Projetos/infraKring`), com Coolify sobre Docker, **Traefik dono de 80 e 443** (TCP e
UDP) e produção viva de outro projeto (`militias3dstore.kring.tech`). Debian 13, cgroup v2,
7,8 GiB de RAM com 5,7 livres, 85 GB de disco livres — folga bem maior que a KVM 2 de D2-19.
Inventário completo em `.vps-inventario.local` (fora do git, `*.local`). Acesso: `ssh dg2vps`
(usuário `deploy`; root não loga pela internet, é do Coolify).

**Decisões de Gustavo:**

- **D-VPS-01** O jogo vive em **`dg2.kring.tech`**. O wildcard A já resolve; não se mexe no DNS.
- **D-VPS-02** **Não mexer no infraKring.** Há produção viva ali. Dois achados de segurança
  daquele projeto (a 8080 do Traefik fora da lista do lockdown; `coolify-lockdown.service`
  inativo) ficam como observação registrada, sem ação. Alterações no host só aditivas e
  confirmadas antes.

- **D-VPS-03** **O jogo vira um app do Coolify**, containerizado, com deploy por push do GitHub.
  Escolhido sobre as alternativas (Caddy nativo atrás do Traefik; só o Node atrás do Traefik)
  por ter **um único modelo operacional na caixa** — e de quebra fecha a tarefa T8 do infraKring.

**Consequência: a fase 2 precisa ser replanejada.** Ela está em 10/12, e os dois pendentes
(02-04 e 02-12) são justamente os que a decisão reescreve. Impacto por artefato:

| Artefato de `ops/` | Destino sob D-VPS-03 |
|---|---|
| `Caddyfile` | **sobrevive dentro do container**, sem TLS/ACME, escutando porta interna — a política HTTP (CSP, HSTS, as três classes de cache, o 404 honesto, o 503 em JSON) é o que há de mais caro para reescrever |
| `deploy.sh`, `rollback.sh`, `deploy-forced.sh`, `prune-releases.sh` | **morrem** — deploy e rollback passam a ser do Coolify |
| `dg2.service` | **morre** — quem supervisiona é o Docker; os limites de memória viram limites do container |
| `cert-check.sh/.service/.timer` | **morrem** — o TLS é do Traefik |
| `litestream.service`, `litestream.yml` | **redesenhar** — como processo do container ou sidecar, sobre volume persistente do Coolify |
| `turnserver.conf`, `coturn-dropin.conf` | **provavelmente seguem nativos** — a faixa de portas de relay não convive bem com NAT de container |
| job `deploy` do `.github/workflows/ci.yml` | **vira job de publicação de imagem** — sob D2-32 não dispara nada; os quatro secrets e `DEPLOY_ENABLED` **deixam de existir**, e o que resta é o `GITHUB_TOKEN` com `packages: write` |
| `tests/ops-config.test.ts` | **reescrever** as asserções dos arquivos que morrem |

**As seis perguntas abertas foram FECHADAS** pela pesquisa de 2026-09-09
(`.planning/phases/02-migra-o-para-a-vps/02-RESEARCH.md`, que substitui a de 2026-08-31):

1. **Estáticos: o Caddy, dentro do contêiner.** Medido no vizinho (DM-11): o Traefik do Coolify
   não manda **nenhum** cabeçalho de segurança. Se o Caddy não mandar, ninguém manda — o bloco
   `header` sobrevive sem uma linha de mudança e fica mais importante do que era.

2. **coturn nativo**, confirmado pelo motivo certo (DM-15): o UFW não governa porta publicada por
   contêiner, mas governa processo nativo.

3. **Litestream como PID 1 do contêiner da API**, envolvendo o Node por `-exec`. Verificado no
   código-fonte (DM-13): `-exec` repassa o **sinal exato** ao filho e espera ele sair, então o
   desligamento gracioso do 02-08 sobrevive. Precisa de `stop_grace_period: 30s`.

4. **Nem GitHub App nem webhook: o disparo é manual (D2-32).** A API do Coolify não é alcançável
   da internet (DM-7, medido) e nenhuma das quatro saídas se faz, porque todas mexem no vizinho
   ou reintroduzem host-as-code. O CI publica a imagem; quem promove é uma pessoa, pelo túnel.

5. **O build não roda na caixa.** D2-23 se confirma: o integrador constrói e publica; à caixa
   sobra `docker pull` e start.

6. **A chave restrita de deploy simplesmente não nasce.** Sob D2-32 não há segredo de deploy
   nenhum — nem os quatro de SSH, nem o do gancho, nem `DEPLOY_ENABLED`. A defesa que o
   `deploy-forced.sh` comprava deixa de ser necessária porque não há caminho automático a
   defender.

**Bloqueadores novos que a pesquisa achou** (nenhum teste de hoje os pega):

- **DM-9** — `apps/server/src/index.ts:88` faz bind em `127.0.0.1`. Em dois contêineres isso é o
  loopback do contêiner do Node; o Caddy nunca chega lá. Sintoma seria 503 em `/api/*` desde o
  primeiro deploy, com todo o resto verde.

- **DM-8** — `tests/workflows.test.ts` assere que todo `uses:` casa `^actions/` e que nenhuma
  linha diz `: write`, o que reprova qualquer publicação em registro. Saída barata: `docker
  build`/`push` em passos `run:` (o runner já traz Docker), deixando o portão T-2-SC **intacto**,
  mais uma exceção nomeada só para `packages: write`.

- **DM-10** — o Caddy descarta `X-Forwarded-For` de origem não confiável por padrão. Sem
  `trusted_proxies static private_ranges`, o limitador da fase 3 põe a internet inteira num
  balde só.

- **DM-20** — `tests/ops-config.test.ts` tem 74 testes; **34 morrem** com os arquivos de D2-30,
  ~15 mudam, ~10 nascem, e o piso anti-vacuidade `>= 13` quebra em silêncio.

**Bugs de `ops/` achados contra a caixa real (valem em qualquer arquitetura):**

- `ops/turnserver.conf` **não declara `min-port`/`max-port`**, e `ops/README.md` §12 manda abrir
  só 3478 e 5349. Sem a faixa, o coturn aloca relay em 49152-65535/udp, que o UFW `deny incoming`
  bloqueia. Sintoma: "um amigo específico nunca entra" — indistinguível de NAT ruim.

- `DG2_PORT` tem **8080** como padrão e o Traefik já ocupa `0.0.0.0:8080`.
- `rsync` não existe na caixa (só importa se algum caminho de deploy voltar a precisar dele).

## Session Continuity

Last session: 2026-09-10T16:36:15.000Z (sessão de recuperação)
Stopped at: **`02-15-PLAN.md` Task 2, interrompida por queda de energia às ~13:29 -0300**
Resume file: None

## ⚡ Queda de energia em 2026-09-10 — o que ela fez e o que foi restaurado

A energia caiu segundos depois do commit `fe0d804` (13:28:40 -0300). O dano foi **um arquivo de
41 bytes**: `.git/refs/heads/main` ficou com o tamanho certo e conteúdo todo `NUL` — a assinatura
do NTFS quando a queda pega entre a escrita e o `fsync` do metadado. Sintoma: `git log`, `git
status` e `git branch` respondiam *"your current branch appears to be broken"*, e os 365 arquivos
rastreados apareciam como adições novas porque, sem `HEAD`, não há com o que comparar.

**Restaurado em 2026-09-10T16:33Z** a partir do reflog, que sobreviveu intacto: `refs/heads/main`
recriada em `fe0d804`. `git fsck` limpo, árvore de trabalho limpa, **913/913 testes verdes**
(a primeira execução acusou timeout de 5 s em `tests/lint-coverage.test.ts`, que levou 9,5 s de
cache frio pós-reboot; reexecutado sozinho, passa em 1,24 s). Backup do reflog, do índice e da ref
quebrada em `…/scratchpad/git-backup/`. **Nenhum commit foi perdido.**

**Lição operacional:** o reflog é o que salvou. Ele é local e não vai para o remoto — e
`origin/main` está em `0608fee`, **dezesseis commits atrás** do local. Enquanto a fase 2 não fechar,
um `git push` depois de cada wave é o seguro barato contra a próxima queda.

### Onde o `02-15` parou, exatamente

- **Task 1 — CONCLUÍDA** (`fcea7de`): o job `deploy` virou job `image`, sem ação de terceiro, com
  a exceção nomeada de `packages: write` em `tests/workflows.test.ts`.

- **Task 2 — INTERROMPIDA NO MEIO.** Ela não escreve arquivo do repositório: **executa** e cola o
  resultado no SUMMARY. O que já rendeu fato são os dois desvios achados construindo as imagens,
  ambos corrigidos e commitados:
  - `a3cf520` — o bundle do servidor não subia: `ws` é CJS e o shim de `require` lança (`package.json`).
  - `fe0d804` — a imagem da API não construía: o prebuild só é alcançado com `--ignore-scripts`
    (`ops/Dockerfile.api` + 8 asserções novas em `tests/ops-config.test.ts`).

- **O que falta na Task 2:** construir as duas imagens com as tags locais, subir o par em rede de
  ponte descartável (entrypoint do servidor sobrescrito para o Node — sem Litestream, não há
  bucket nesta máquina), fazer **as seis medições** (saúde 200 através do Caddy com o campo de
  release; os quatro cabeçalhos de segurança; as três classes de cache; 404 honesto; 503 em JSON
  com o servidor parado; banco criado e migrado dentro do contêiner), remover contêineres e rede,
  e escrever o `02-15-SUMMARY.md`.

- **Pré-condição que a queda derrubou: o Docker Desktop está desligado.** `docker info` não
  responde (`npipe:////./pipe/dockerDesktopLinuxEngine`). A Task 2 não começa sem ele, e o próprio
  plano manda parar e reportar se ele não subir em cinco minutos — não registrar a tarefa como
  feita com a fumaça pulada.

- **Artefatos de build ainda em disco** de 13:26: `dist/` e `dist-server/server.mjs`. O `verify`
  da tarefa (`npm run build && npm run server:build && npm test`) reconstrói de todo modo.

Next: **`/gsd-execute-phase 2`** — retomando o **`02-15` na Task 2** (wave 11), com o Docker
Desktop ligado antes. Depois dele, só o **`02-12`** (wave 12, `autonomous: false`, portão humano
contra a caixa) fecha a fase.

---

**Contexto anterior, ainda válido:** o `02-04` está **concluído**
(`004a8bd`, `0608fee`, `ec56b2f`; `02-04-SUMMARY.md` com Self-Check PASSED). Portões depois dele:
**926 testes em 60 arquivos, lint 0**.

**O que o 02-04 transformou em fato, e que os planos seguintes podem assumir:**

- **A1 provada.** O Coolify aceita composição de **dois serviços** vinda do repositório público,
  descobre os dois e atribui o domínio ao `web`; fez **`pull` e não `build`** (C-7). O `02-14`
  **mantém a forma planejada** — a alternativa "Docker Compose Empty" não é necessária.

- **O primeiro certificado válido existe** (Let's Encrypt, pelo Traefik do Coolify), 200 por HTTPS
  e 302 de HTTP. O 503 do catchall morreu. **INFRA-01 fechado.** O certificado **expira em
  2026-12-08**, e o alarme de 30 dias ainda não existe (é do `02-12`).

- **As quatro regras de UFW do coturn estão abertas, em v4 e v6**, com a faixa `49200:49299/udp`
  casada com `ops/turnserver.conf`. A dependência de infraestrutura do `03-11` **caiu**.

- **A forma do disparo é `clique-painel`** e o critério 4 tem leitura escrita: *procedimento
  documentado e reversível, não um comando* (D2-32). `tools/ops/deploy.mjs` **não existe**, e por
  isso os globs de `ops-config` terminam o `02-14` com **nove** entradas, não dez.

**Duas mudanças de escopo tomadas no portão humano, que os planos seguintes precisam absorver:**

- **D2-33 — não há bucket** (`97e55c7`). A réplica do Litestream vai para **caminho da própria
  caixa**, em **volume persistente**. O `02-14` muda a seção de destino de `ops/litestream.yml` de
  `s3` para `file` e declara **dois** volumes; o `02-12` prova que a réplica **sobrevive a um
  redeploy**. A garantia off-site cai por escolha registrada, e a T9 do infraKring não é fechada
  por esta fase. D2-23 foi reafirmada no mesmo portão: o integrador constrói e publica no GHCR.

- **A limpeza automática de imagens não foi lida**, por decisão. **D2-24 fica NÃO-VERIFICADA** — a
  reversão por imagem local é suposição até o `02-12` exercitá-la.

**Os quatro planos que restam**, em ordem fixa (waves 9 a 12, `depends_on` em cadeia):

1. **`02-13`** (wave 9) — delta de código: o bind de DM-9, os cinco comentários órfãos que citam
   `dg2.service`/`ops/deploy.sh`, o `Caddyfile` sem TLS/ACME, `trusted_proxies` (DM-10),
   `auto_https off`, o upstream do contêiner.

2. **`02-14`** (wave 10) — `ops/` containerizado (Dockerfiles, compose, README reescrito) **e os 34
   testes de `tests/ops-config.test.ts` no mesmo commit**, com o piso anti-vacuidade descendo a 9.
   **Apaga `ops/probe/docker-compose.yml`** no mesmo commit — o andaime já fez o trabalho dele.
   Absorve D2-33: destino `file` no `ops/litestream.yml` e os dois volumes persistentes.

3. **`02-15`** (wave 11, **novo — não reescreve o `02-11`, que já foi executado**) — o `ci.yml` de
   publicação de imagem, com `docker build`/`push` em passos `run:` para não quebrar o portão
   T-2-SC, mais a exceção nomeada de `packages: write` em `tests/workflows.test.ts` (DM-8).
   `DEPLOY_ENABLED` morre aqui.

4. **`02-12`** (wave 12, reescrito, **`autonomous: false`**) — a caixa de verdade: deploy do jogo,
   reversão por imagem (que é onde D2-24 deixa de ser suposição), ensaio de restauração sobre a
   réplica `file`, **a prova de que a réplica sobrevive a um redeploy**, e o vigia externo com o
   alarme de 30 dias. O primeiro certificado **já** foi arrancado pelo `02-04`; o que resta aqui é
   o resto. Registra também a localização do campo de domínio no painel, lacuna deixada em branco
   de propósito pelo `02-04`.

**Escopo que vazou para a fase 3 — `03-11-PLAN.md` precisa de ajuste ANTES de executar.** O `02-04`
Task 3 abre as **quatro** regras de UFW (`3478/udp`, `3478/tcp`, `5349/tcp` e a faixa de relay
`49200:49299/udp`) e cola o resultado em `docs/OPERACAO.md`. Mas o `03-11-PLAN.md`, escrito em
2026-09-05 e não revisado no replanejamento, ainda tem `user_setup` próprio mandando abrir só as
**três** portas base, sem menção nenhuma à faixa de relay, e não cita `docs/OPERACAO.md` em
`read_first` nem em `context`. Achado pelo plan-checker em 2026-09-09 (W2).

Consequência se ninguém ajustar: o trabalho do `02-04` existe, mas não está registrado onde a fase 3
vai olhar — e se a faixa de relay for revertida ou não pegar, o checklist do `03-11` não tem como
flagrar. O sintoma é "um amigo específico nunca entra", indistinguível de NAT ruim. **Ajuste
necessário:** fazer o `03-11` referenciar `docs/OPERACAO.md` § Firewall do coturn e **verificar** a
faixa de relay, em vez de reabrir cegamente só as três portas base.

Depois: `/gsd-execute-phase 2` → `/gsd-execute-phase 3` (só o 03-11, que fecha SALA-04 contra o coturn
real) → retomar `/gsd-verify-work 3`, que está pausada em `03-UAT.md` (status `partial`: os testes 15 e
17 passaram, o fluxo manual parou no teste 1 com "ERR_CONNECTION_REFUSED" e diagnóstico registrado).

Acesso à caixa nesta máquina: `ssh dg2vps` (alias em `~/.ssh/config`, usuário `deploy`). A permissão
`Bash(ssh dg2vps:*)` está em `~/.claude/settings.json`. Nunca usar o endereço literal — a regra de
revisão de SSH continua valendo para ele, de propósito.
