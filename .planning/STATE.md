---
gsd_state_version: 1.0
milestone: v1.0
milestone_name: milestone
status: executing
stopped_at: VPS inventariada; fase 2 a replanejar sob D-VPS-03
last_updated: "2026-09-09T00:00:00.000Z"
last_activity: 2026-09-09 -- VPS inventariada; D-VPS-01/02/03 decididas; fase 2 a replanejar como app do Coolify
progress:
  total_phases: 9
  completed_phases: 1
  total_plans: 37
  completed_plans: 24
  percent: 11
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-08-28)

**Core value:** Quatro amigos entram numa sala pelo código e lutam as mesmas waves no mesmo
mundo, com o jogo respondendo na hora para cada um.
**Current focus:** Phase 03 — sala-transporte-e-protocolo

## Current Position

Phase: 03 (sala-transporte-e-protocolo) — EXECUTING
Plan: 10 of 11 (03-11 adiado — bloqueado por 02-04)
Status: Executada 10/11 — verificação `passed` com o critério 3 (SALA-04) bloqueado pela VPS; fase NÃO marcada completa
Last activity: 2026-09-08 -- Phase 03 executed (10/11), 03-11 deferred, VERIFICATION passed-with-override

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
| Infra/VPS | 02-04 -- confirmar KVM 2 e regiao, criar bucket B2, chave de deploy, os 4 secrets E a variavel DEPLOY_ENABLED | Aguardando usuario | 2026-08-31 |
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
| job `deploy` do `.github/workflows/ci.yml` | **muda** — o Coolify puxa do GitHub; os quatro secrets e `DEPLOY_ENABLED` podem deixar de existir |
| `tests/ops-config.test.ts` | **reescrever** as asserções dos arquivos que morrem |

**Perguntas abertas para o discuss da fase 2:**

1. Dentro do container, quem serve os estáticos: o Caddy (preserva a política inteira) ou o Node?
2. coturn nativo ou container com rede do host? A faixa de relay decide.
3. SQLite em volume do Coolify — e o Litestream roda onde, com qual ciclo de vida?
4. Deploy pelo GitHub App do Coolify (fecha T8 do infraKring) ou webhook a partir do CI?
5. O build passa a rodar na caixa, com 2 vCPU. `npm run build` faz `sim:build`, `tsc` e
   `vite build`; medir antes de assumir que cabe.
6. Sem `deploy-forced.sh`, a chave restrita de deploy e seu wrapper deixam de existir — confirmar
   que o modelo de acesso do Coolify substitui a defesa que aquele wrapper comprava.

**Bugs de `ops/` achados contra a caixa real (valem em qualquer arquitetura):**

- `ops/turnserver.conf` **não declara `min-port`/`max-port`**, e `ops/README.md` §12 manda abrir
  só 3478 e 5349. Sem a faixa, o coturn aloca relay em 49152-65535/udp, que o UFW `deny incoming`
  bloqueia. Sintoma: "um amigo específico nunca entra" — indistinguível de NAT ruim.
- `DG2_PORT` tem **8080** como padrão e o Traefik já ocupa `0.0.0.0:8080`.
- `rsync` não existe na caixa (só importa se algum caminho de deploy voltar a precisar dele).

## Session Continuity

Last session: 2026-09-09
Stopped at: VPS encontrada, inventariada e acessível (`ssh dg2vps`). Três decisões tomadas (D-VPS-01/02/03). A fase 2 precisa de replanejamento sob D-VPS-03; a UAT da fase 3 segue pausada em `03-UAT.md` (portões automatizados verdes, fluxo manual parado no teste 1).
Resume file: .planning/STATE.md § Decisão de infraestrutura — 2026-09-09

Next: `/gsd-discuss-phase 2` para responder as seis perguntas abertas e replanejar 02-04/02-12 como app do Coolify; depois `/gsd-execute-phase 2`, `/gsd-execute-phase 3` (03-11) e retomar `/gsd-verify-work 3`
