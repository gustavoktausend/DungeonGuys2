---
gsd_state_version: 1.0
milestone: v1.0
milestone_name: milestone
status: executing
stopped_at: Phase 2 context gathered
last_updated: "2026-09-01T01:41:07.432Z"
last_activity: 2026-09-01 -- Phase 02 execution started
progress:
  total_phases: 9
  completed_phases: 1
  total_plans: 26
  completed_plans: 14
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
Plan: 1 of 12
Status: Executing Phase 02
Last activity: 2026-09-01 -- Phase 02 execution started

Progress: [░░░░░░░░░░] 0%

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

## Nota para o planejamento da fase 3

A fase 3 declara `Depends on: Phase 2`, e a fase 2 esta em **10/12**: 02-04 e 02-12 seguem
adiados por falta da VPS (ver Deferred Items acima). A decisao do usuario foi avancar na
fase 3 pelo que e codigo puro enquanto a caixa nao existe.

Consequencia para o discuss/plan da fase 3 -- o criterio de sucesso 3 (**"a sala fecha entre
jogadores atras de NAT residencial brasileiro, incluindo pelo caminho de relay"**, SALA-03)
depende do coturn, que mora na VPS. Ele NAO pode ser fechado antes do 02-04. Todo o resto da
fase e local:

- codec binario quantizado do snapshot e o bench de CI abaixo de 16 KiB (criterio 5, SYNC-04)
- as duas classes de canal e as tabelas de enum congeladas
- codigo de sala, lobby, escolha de classe e atribuicao de slots `p0..p3` (criterios 1 e 2)
- telemetria de ping/rota e o registro do desfecho ICE (criterio 4) -- a estrutura e local,
  a medicao real precisa da caixa

Sequencie as ondas de forma que o que depende da VPS caia nas ultimas, como a fase 2 fez.

## Session Continuity

Last session: 2026-08-31T20:56:34.236Z
Stopped at: Phase 2 context gathered
Resume file: .planning/phases/02-migra-o-para-a-vps/02-CONTEXT.md

Next: `/gsd:plan-phase 1`
