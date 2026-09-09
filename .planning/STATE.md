---
gsd_state_version: 1.0
milestone: v1.0
milestone_name: milestone
status: executing
stopped_at: Phase 2 replanned under containerization — 5 plans written, checker passed with 0 blockers
last_updated: "2026-09-09T21:21:51.790Z"
last_activity: 2026-09-09 -- Phase 02 execution started
progress:
  total_phases: 9
  completed_phases: 1
  total_plans: 40
  completed_plans: 34
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
Plan: 1 of 15
Status: Executing Phase 02
Last activity: 2026-09-09 -- Phase 02 execution started

Progress: [█████████░] 91%

## Performance Metrics

**Velocity:**

- Total plans completed: 14
- Average duration: —
- Total execution time: 0.0 hours

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 01 | 14 | - | - |

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
| Infra/VPS | 02-04 (REESCRITO 2026-09-09 sob D2-32) -- criar o recurso do jogo no Coolify pelo tunel apontando para ops/probe/docker-compose.yml, atribuir o FQDN ao servico `web`, LER (sem alterar) a limpeza automatica de imagens, criar bucket S3 privado + chave limitada a ele, e abrir as 4 regras de UFW do coturn. **Nao ha mais chave de deploy, nem os 4 secrets de SSH, nem DEPLOY_ENABLED** -- D2-32 os apagou | Aguardando usuario | 2026-08-31 (reescrito 2026-09-09) |
| Infra/VPS | 02-12 -- executar deploy, rollback e restore contra a maquina real | Bloqueado por 02-04 | 2026-08-31 |
| Infra/VPS | 03-11 -- subir o coturn na VPS, exercitar o relay entre duas redes residenciais e medir o desfecho ICE; fecha o critério 3 (SALA-04). Portão de ação humana da Task 1 apresentado em 2026-09-08; resposta: "a caixa ainda não existe". Falta: KVM 2 em São Paulo, 02-04 e 02-12 executados, decisão ssh-do-Claude vs execução manual, segundo jogador em outra rede | Bloqueado por 02-04 | 2026-09-08 |

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

Last session: 2026-09-09
Stopped at: Phase 2 replanned under containerization — 5 plans written, checker passed with 0 blockers
Resume file: .planning/phases/02-migra-o-para-a-vps/02-04-PLAN.md

Next: **`/gsd-execute-phase 2`** — os cinco planos estão escritos, commitados e verificados. O
plan-checker passou com **zero bloqueadores** e seis observações, todas tratadas ou registradas
(2026-09-09). **D2-32 fixou que nada no Coolify se altera e o deploy desta fase é disparado à mão
pelo túnel**, o que revoga D2-31, suspende D2-08 e apaga todos os segredos de deploy.

Os cinco planos, em ordem fixa (waves 8 a 12, `depends_on` em cadeia):

1. **`02-04`** (wave 8, reescrito, **`autonomous: false`**) — a caixa, os segredos, `docs/OPERACAO.md`,
   as quatro regras de UFW do coturn, e a forma do disparo manual. Prova a suposição A1 com um
   andaime descartável (`ops/probe/docker-compose.yml`, fora do glob dos testes, apagado pelo
   02-14) que de quebra **arranca o primeiro certificado do Traefik**. Aqui se escolhe entre clique
   no painel pelo túnel e um script local que faz o `curl` para a porta encaminhada — os dois
   alteram nada na caixa, e o segundo preserva a letra do critério 4 ("o deploy é um comando").

2. **`02-13`** (wave 9) — delta de código: o bind de DM-9, os cinco comentários órfãos que citam
   `dg2.service`/`ops/deploy.sh`, o `Caddyfile` sem TLS/ACME, `trusted_proxies` (DM-10),
   `auto_https off`, o upstream do contêiner.

3. **`02-14`** (wave 10) — `ops/` containerizado (Dockerfiles, compose, README reescrito) **e os 34
   testes de `tests/ops-config.test.ts` no mesmo commit**, com o piso anti-vacuidade descendo a 9.

4. **`02-15`** (wave 11, **novo — não reescreve o `02-11`, que já foi executado**) — o `ci.yml` de
   publicação de imagem, com `docker build`/`push` em passos `run:` para não quebrar o portão
   T-2-SC, mais a exceção nomeada de `packages: write` em `tests/workflows.test.ts` (DM-8).
   `DEPLOY_ENABLED` morre aqui.

5. **`02-12`** (wave 12, reescrito, **`autonomous: false`**) — a caixa de verdade: primeiro
   certificado pelo Traefik, deploy, reversão por imagem, restauração verificada e o vigia externo.

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
