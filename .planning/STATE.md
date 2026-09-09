---
gsd_state_version: 1.0
milestone: v1.0
milestone_name: milestone
status: executing
stopped_at: Phase 3 UI-SPEC approved
last_updated: "2026-09-09T00:00:00.000Z"
last_activity: 2026-09-09 -- Sessão retomada; revisão da fase 3 corrigida 13/13, reverificação pendente
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

## Session Continuity

Last session: 2026-09-09
Stopped at: Sessão retomada — revisão da fase 3 corrigida (13/13, `349cb7d`); falta reverificar a fase e abrir a fase 4
Resume file: .planning/phases/03-sala-transporte-e-protocolo/03-REVIEW-FIX.md

Next: reverificar a fase 3 (`/gsd-verify-work 3`, a `03-VERIFICATION.md` é anterior às correções); depois `/gsd-discuss-phase 4`; `/gsd-execute-phase 3` de novo quando a VPS existir (03-11)
