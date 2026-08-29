# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-08-28)

**Core value:** Quatro amigos entram numa sala pelo código e lutam as mesmas waves no mesmo
mundo, com o jogo respondendo na hora para cada um.
**Current focus:** Phase 1 — Formato e costuras

## Current Position

Phase: 1 of 9 (Formato e costuras)
Plan: 0 of 5 in current phase
Status: Ready to plan
Last activity: 2026-08-29 — Roadmap criado a partir de REQUIREMENTS.md e research/SUMMARY.md

Progress: [░░░░░░░░░░] 0%

## Performance Metrics

**Velocity:**
- Total plans completed: 0
- Average duration: —
- Total execution time: 0.0 hours

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| - | - | - | - |

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
| *(none)* | | | |

## Session Continuity

Last session: 2026-08-29
Stopped at: ROADMAP.md, STATE.md e a tabela de rastreabilidade de REQUIREMENTS.md escritos
Resume file: None

Next: `/gsd:plan-phase 1`
