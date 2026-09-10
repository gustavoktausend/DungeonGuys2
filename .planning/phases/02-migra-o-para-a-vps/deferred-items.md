# Itens adiados — fase 02

Achados fora do escopo do plano em que foram descobertos. Cada um diz quem
precisa ser o dono e por que não pôde ser resolvido ali.

---

## DEF-02-01 — `/etc/dg2/env` sobrevive em `apps/` e em um teste, sem dono

**Descoberto em:** execução do 02-13 (Task 1), ao reescrever os comentários de
`apps/server/src/index.ts`.

**O que é.** D2-29 aposentou `/etc/dg2/env` como lugar dos segredos do app: as
variáveis passam a viver no painel do Coolify. O `ops/turnserver.conf` foi
corrigido no commit `e138983` e o `apps/server/src/signaling/turn.ts` foi
corrigido pelo 02-13. Restam seis ocorrências em quatro arquivos que **nenhum
plano da fase é dono**:

| Arquivo | Ocorrências | O que diz |
|---|---|---|
| `apps/server/src/env.ts` | 5 | o cabeçalho (`env.ts — /etc/dg2/env turned into typed configuration`), o comentário de `required()` (que também cita `EnvironmentFile` e `ops/README.md §5`) e **as quatro mensagens de erro** (`ponha um valor em /etc/dg2/env ou apague a linha`, e as de `DG2_ORIGIN` e do par TURN) |
| `apps/server/src/health.ts` | 1 | comentário |
| `tests/server-migrate.test.ts` | 1 | comentário |
| `tests/server-shutdown.test.ts` | 0 (mas cita `systemctl`/`systemd` em 2 comentários) | justifica o SIGTERM pela máquina antiga |

**Por que não foi resolvido no 02-13.** Duas razões, e a segunda é a que decide:

1. **Dois dos arquivos estão fora do `files_modified` do plano** (`health.ts` e
   `tests/server-migrate.test.ts`). Corrigir metade produziria exatamente o
   defeito que o 02-13 existe para remover: duas afirmações contraditórias sobre
   onde um segredo mora, no mesmo subsistema.
2. **A mensagem de erro é contrato de operação, não comentário.** Ela é o
   `file:pointer: message` que `ops/README.md` §1 documenta, é perseguida por
   cinco asserções de `tests/server-env.test.ts` (`/\/etc\/dg2\/env|porta/`), e o
   texto substituto depende do runbook que o **02-14** reescreve — o 02-14 tem
   critério `grep -c 'etc/dg2/env' ops/README.md` = 0, mas não toca em `apps/`.
   Trocar a mensagem antes do runbook deixaria as duas metades fora de sincronia
   em vez de alinhadas.

**Quem deve ser o dono.** Um plano depois do 02-14, que mude os dois lados na
mesma janela: as quatro mensagens de `env.ts` + os comentários de `env.ts`,
`health.ts`, `tests/server-migrate.test.ts` e `tests/server-shutdown.test.ts`, com
as cinco asserções de `tests/server-env.test.ts` ajustadas no mesmo commit.

**Por que não é urgente.** A mensagem continua acionável — ela nomeia a chave, que
é a parte que o operador precisa — e aponta para um arquivo que existe na caixa
para o coturn. O custo é um leitor futuro procurando segredo do app no lugar
errado, não uma falha de execução.

---

## DEF-02-02 — `git grep 'DG2_DOMAIN' -- ops/ apps/` só fecha depois do 02-14

**Descoberto em:** execução do 02-13 (verificação de plano).

**O que é.** O `<verification>` do 02-13 pede que `git grep -n 'DG2_DOMAIN' --
ops/ apps/` não imprima nada. Depois desta execução, `apps/` está limpo e
`ops/Caddyfile` está limpo — que é o que este plano é dono. Sobram 12 ocorrências
em quatro arquivos de `ops/`, todos do **02-14**: `README.md` (reescrito),
`cert-check.sh`, `cert-check.service` e `cert-check.timer` (apagados por D2-30).

**Ação:** nenhuma. O item fecha sozinho quando o 02-14 rodar; a reconferência
pertence à verificação da fase.
