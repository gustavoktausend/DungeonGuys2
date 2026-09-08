---
phase: 03-sala-transporte-e-protocolo
plan: 07
subsystem: infra
tags: [coturn, turn, webrtc, systemd, caddy, ops, d2-15, ssrf]

# Dependency graph
requires:
  - phase: 02-caixa-e-publicacao
    provides: "ops/ como diretório versionado, tests/ops-config.test.ts com read()/code(), ops/dg2.service como referência de MemoryHigh/MemoryMax, ops/README.md §5/§6/§10"
provides:
  - "ops/turnserver.conf — config do relay com credencial efêmera por HMAC, quotas, no-cli e as oito linhas de denied-peer-ip"
  - "ops/coturn-dropin.conf — o primeiro drop-in de systemd de ops/, com o orçamento de ~128 MB de D2-19 virando limite de cgroup"
  - "A decisão escrita da porta 443: é do Caddy; coturn em 3478 e 5349; TURN/TLS na 443 é dívida registrada com as duas saídas nomeadas"
  - "ops/README.md §12 — runbook do coturn em seis passos, com a armadilha do segredo em dois arquivos"
  - "DG2_TURN_SECRET e DG2_TURN_REALM inventariados em §5 e cobertos pelo detector de vazamento"
affects: [03-06 (env.ts e /api/rt/ice), 03-11 (validação na caixa), 04-netcode, 06-contas]

# Tech tracking
tech-stack:
  added: [coturn 4.17.2 (configuração; instalação é do plano 03-11)]
  patterns:
    - "Drop-in de systemd em vez de cópia da unit, quando o pacote do distribuidor já traz a unit"
    - "Lista de segurança CONTADA por teste, não conferida por leitura"
    - "Allowlist de literais reservados por valor exato, não por faixa"

key-files:
  created:
    - ops/turnserver.conf
    - ops/coturn-dropin.conf
  modified:
    - ops/Caddyfile
    - ops/README.md
    - tests/ops-config.test.ts

key-decisions:
  - "A porta 443 é do Caddy. coturn em 3478 (UDP e TCP) e 5349 (TLS). TURN/TLS na 443 fica como dívida registrada com duas saídas nomeadas — app layer4 do Caddy por ALPN/SNI, ou segundo IP na VPS"
  - "A unit do coturn é drop-in e não cópia: o pacote do Debian mantém coturn.service, e copiá-lo cortaria as correções de segurança do pacote"
  - "A ausência do par NODE_OPTIONS no drop-in é decisão escrita: a armadilha do heap do V8 contra o cgroup é do V8, e coturn é C"
  - "O scanner de D2-15 passa a excusar as faixas reservadas por VALOR EXATO (10.0.0.0 entra, 10.0.0.7 não), porque um endereço de RFC 1918 não diz onde a caixa mora — e recusá-lo empurraria a deny-list para fora do repositório"
  - "DG2_TURN_SECRET e DG2_TURN_REALM entram em ENV_KEYS: o par do segredo passa a ser coberto pelo detector de vazamento em vez de ficar fora dele"

patterns-established:
  - "Contagem como asserção: a deny-list é verificada por `toBe(8)`, porque o modo de falha real é publicar sete das oito linhas, e uma lista incompleta não faz barulho nenhum"
  - "Drop-in de systemd: arquivo nomeia só o que muda, com o destino em comentário no topo, e a diferença em relação às units copiadas escrita dentro do próprio arquivo"
  - "Dívida técnica registrada com as saídas nomeadas, em vez de comentário 'agendado' que envelhece para 'ninguém sabe se ainda vale'"

requirements-completed: [SALA-04]

# Metrics
duration: 10min
completed: 2026-09-08
---

# Phase 3 Plano 07: coturn versionado e a 443 decidida — Summary

**A config do relay entra no repositório com as oito linhas de `denied-peer-ip` contadas por teste, o drop-in de systemd aplicando os ~128 MB que até agora eram só um parágrafo, e o comentário "SCHEDULED FOR PHASE 3" do `Caddyfile` substituído por uma decisão com as saídas nomeadas.**

## Performance

- **Duration:** 10 min
- **Started:** 2026-09-08T13:32:42Z
- **Completed:** 2026-09-08T13:43:01Z
- **Tasks:** 2
- **Files modified:** 5 (2 criados, 3 modificados)

## Accomplishments

- **O relay não alcança a LAN da própria VPS, e isso é verificável num diff.** As oito faixas reservadas (0.0.0.0/8, os três blocos de RFC 1918, loopback, link-local, loopback v6 e a ULA de RFC 4193) estão no arquivo e são conferidas uma a uma **mais contadas**: `toBe(8)`. A contagem é o ponto — apagar o bloco inteiro seria óbvio, publicar sete das oito não faz barulho nenhum (T-3-04).
- **O orçamento de memória deixou de ser intenção.** Os ~128 MB que `ops/README.md` §10 reservava em prosa para "o coturn da fase 3" agora são `MemoryHigh=96M`/`MemoryMax=128M` num drop-in, com o teste amarrando o parágrafo ao limite.
- **A disputa da 443 virou decisão.** O `Caddyfile` não promete mais resolver o conflito depois: 443 é do Caddy, coturn em 3478 e 5349, e a dívida de TURN/TLS na 443 fica com as duas saídas escritas para quem voltar.
- **A armadilha operacional mais cara da fase está documentada onde o operador vai olhar.** O `static-auth-secret` vive em dois arquivos, e trocar num só produz o sintoma "um amigo específico nunca entra" — indistinguível de NAT ruim.
- **Nada disto depende da caixa existir.** Seis testes novos no plano 1, seis no plano 2; a suíte inteira (593 testes, 45 arquivos) segue verde.

## Task Commits

1. **Task 1: `ops/turnserver.conf` e o drop-in de systemd, com o teste estrutural** — `7948203` (feat)
2. **Task 2: Resolver o "SCHEDULED FOR PHASE 3" e escrever o §12 do runbook** — `d13aaa6` (docs)

## Files Created/Modified

- `ops/turnserver.conf` **(criado)** — Config do coturn: `listening-port=3478`, `tls-listening-port=5349`, `realm` e `static-auth-secret` como placeholders literais, `fingerprint`, `use-auth-secret`, `no-multicast-peers`, as oito `denied-peer-ip`, `user-quota=12`, `total-quota=1200`, `no-cli`. Cada bloco vem com a armadilha que evita.
- `ops/coturn-dropin.conf` **(criado)** — Drop-in para `/etc/systemd/system/coturn.service.d/dg2.conf`. `MemoryHigh=96M`, `MemoryMax=128M`, `NoNewPrivileges`, `ProtectSystem=strict`, `ProtectHome`, `PrivateTmp`. É o primeiro arquivo de `ops/` que é drop-in em vez de cópia, e a diferença está escrita dentro dele.
- `ops/Caddyfile` — O bloco `SCHEDULED FOR PHASE 3` saiu; entraram a decisão da 443, as duas saídas nomeadas (`layer4`/ALPN/SNI, segundo IP) e a advertência de que `reload` fecha as WebSockets ativas enquanto os DataChannels P2P sobrevivem. O `handle /ws` deixou de ser "reservado, sem consumidor".
- `ops/README.md` — §9 reescrita de "Agendado para a fase 3" para "A porta 443, decidida"; §6 ganhou a segunda consequência do reload; §5 ganhou `DG2_TURN_SECRET` e `DG2_TURN_REALM`; §12 novo, com os seis passos do operador, a armadilha do segredo em dois arquivos e a nota de orçamento.
- `tests/ops-config.test.ts` — Doze casos novos (62 → 74). Cobrem as diretivas do relay, a contagem da deny-list, o placeholder do segredo, a ausência da 443 nos dois arquivos, o drop-in (orçamento, endurecimento, e que não virou cópia), a remoção do comentário agendado, o CSP que já cobre `wss://`, e o §12 executável.

## Decisions Made

- **443 é do Caddy** — 3478/5349 cobrem praticamente todo NAT doméstico, que é a população deste jogo. TURN/TLS na 443 só compraria o firewall corporativo, e nenhuma das duas saídas paga o próprio peso operacional antes de existir alguém de fato trancado do lado de fora.
- **Drop-in, não cópia** — o pacote `coturn` do Debian já traz e habilita `coturn.service` desde o Buster; `/etc/default/coturn` com `TURNSERVER_ENABLED=1` é documentação de era anterior. Copiar a unit seria adotar sua manutenção e cortar as correções de segurança do pacote (T-3-SC).
- **Sem par `NODE_OPTIONS` no drop-in, de propósito** — a armadilha que `ops/dg2.service` documenta (V8 dimensiona o heap pela memória da máquina, não pelo cgroup) é do V8. coturn é C e não dimensiona nada a partir da memória da máquina, então o limite do cgroup é o único limite necessário.
- **Allowlist de IP por valor exato** — ver deviação 1. Só os **extremos** de cada faixa são escrevíveis, então um host interno real do operador não entra pela exceção.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] O portão de D2-15 recusava as oito linhas obrigatórias de `denied-peer-ip`**

- **Found during:** Task 1
- **Issue:** `tests/ops-config.test.ts` varre **todo** arquivo de `ops/` e reprova qualquer literal de IP que não seja `127.0.0.1` (e qualquer IPv6, sem exceção). O plano manda escrever oito faixas reservadas literais no `turnserver.conf`. Os dois requisitos não podiam ser satisfeitos ao mesmo tempo: a suíte ficava vermelha em quatorze matches de IPv4 e dois de IPv6 no instante em que o arquivo entrasse.
- **Fix:** Duas allowlists novas, `NON_ROUTABLE_V4` e `NON_ROUTABLE_V6`, com o motivo escrito no próprio teste: D2-15 proíbe endereço porque endereço diz **onde esta caixa mora**, e `10.0.0.0/8` não diz nada sobre esta caixa — é constante de RFC 1918, idêntica em toda implantação, e está no arquivo justamente para impedir o relay de alcançar rede privada. Um portão que a recusasse trocaria um vazamento que não pode acontecer pelo SSRF que a lista existe para prevenir. **As listas são exatas, não testes de faixa**: `10.0.0.0` e `10.255.255.255` passam, `10.0.0.7` não — um host interno real do operador não entra pela exceção.
- **Files modified:** `tests/ops-config.test.ts`
- **Verification:** Suíte verde (74/74); e a mutação de controle — apagar uma linha de `denied-peer-ip` — deixa a suíte vermelha, confirmada e revertida.
- **Committed in:** `7948203`

**2. [Rule 3 - Blocking] `turnserver.conf` era lido como nome de host público**

- **Found during:** Task 1
- **Issue:** A asserção "nenhum literal com cara de host público" trata qualquer token pontuado cujo último rótulo seja só letras como domínio, salvo as extensões conhecidas. `conf` não estava na lista, então `turnserver.conf`, `coturn-dropin.conf` e `dg2.conf` reprovavam — inclusive quando citados no runbook.
- **Fix:** `conf` acrescentado a `NOT_A_TLD`, com o comentário dizendo quais arquivos o justificam. A lista continua curta, que é o que a mantém um portão.
- **Files modified:** `tests/ops-config.test.ts`
- **Verification:** Suíte verde.
- **Committed in:** `7948203`

**3. [Rule 2 - Missing Critical] O segredo do TURN ficava fora do detector de vazamento**

- **Found during:** Task 2
- **Issue:** `ENV_KEYS` é descrito no teste como "o inventário de toda chave de `/etc/dg2/env`", e alimenta a asserção "nenhuma chave aparece com valor literal". O §12 introduz `DG2_TURN_SECRET` — a metade Node de um segredo compartilhado — e deixá-la fora significaria que a única chave nova de segredo da fase seria também a única não coberta pelo portão que existe para segredos.
- **Fix:** `DG2_TURN_SECRET` e `DG2_TURN_REALM` acrescentadas a `ENV_KEYS` e à tabela de §5, com a nota de que a **ausência** das duas é tolerada (o servidor sobe e emite ICE só com STUN) mas "definida e vazia" continua sendo erro — o que é o que deixa as ondas locais rodarem antes de a caixa existir.
- **Files modified:** `ops/README.md`, `tests/ops-config.test.ts`
- **Verification:** Suíte verde; `read('README.md')` confirma as duas chaves nomeadas, e a asserção de valor literal passa a cobri-las.
- **Committed in:** `d13aaa6`

### Critério de aceitação divergente (não corrigido — decisão registrada)

O critério `grep -c "NODE_OPTIONS\|ExecStart" ops/coturn-dropin.conf` retorna **1**, não 0. O único match é o comentário que o próprio `<action>` do plano **manda escrever**: "a ausência do par `NODE_OPTIONS` é uma decisão visível, não um esquecimento". As duas instruções do plano se contradizem, e a convenção do repositório resolve a contradição — `code()` remove comentários **antes** de assertar, exatamente para que "o arquivo explica por que não usa X" não invalide "o arquivo não usa X". A asserção executável usa `code()` e é a forma com significado; fora de comentários a contagem é **0**, verificado. Nenhum `ExecStart` existe no arquivo em nenhuma forma.

---

**Total deviations:** 3 auto-corrigidas (2 bloqueantes, 1 crítica ausente) + 1 divergência de critério registrada
**Impact on plan:** As três correções são no portão de teste, não no que ele protege — e as duas primeiras eram pré-condição para o plano poder existir. Nenhuma delas afrouxa D2-15: a allowlist de IP é por valor exato, e a de extensão ganhou um item. Sem escopo extra.

## Issues Encountered

- **A worktree nasceu 12 commits atrás da base esperada** (em `3f25a68`, `origin/main`), onde os arquivos de plano da fase 3 ainda não existiam. Resolvido com o `<worktree_branch_check>`: HEAD confirmado em `worktree-agent-a79c537213de341ba`, árvore limpa, e `git reset --hard` para `4a825d1`. Nenhum trabalho perdido — a worktree estava vazia.
- **A mutação de controle foi executada de verdade**, conforme o critério de aceitação: removida uma linha de `denied-peer-ip`, suíte vermelha (1 falha, 67 passes), arquivo restaurado de backup e suíte verde de novo (68). O portão pega o que existe para pegar.

## User Setup Required

Nenhum **nesta máquina**. O que este plano produz é executado numa VPS que ainda não existe: `ops/README.md` §12 é o runbook, e ele só faz sentido depois de o plano 02-04 entregar a caixa. O plano 03-11 é quem valida o relay em rede real.

Quando a caixa existir, o operador precisa **gerar o segredo e escrevê-lo em dois lugares** (`/etc/turnserver.conf` e `/etc/dg2/env`), e abrir 3478/udp, 3478/tcp e 5349/tcp no firewall.

## Next Phase Readiness

- **Pronto para o 03-06:** `DG2_TURN_SECRET` e `DG2_TURN_REALM` estão inventariados com o mesmo nome literal que `apps/server/src/env.ts` vai ler, e `use-auth-secret` no relay é o outro lado do HMAC que `/api/rt/ice` vai emitir.
- **Pronto para o 03-11:** os quatro arquivos existem e são copiáveis; falta só a caixa.
- **SALA-04 não fecha aqui, e isso é por construção.** Este plano é a metade **local** de "a sala fecha atrás de NAT residencial". A metade que precisa da VPS — instalar o coturn, medir o caminho relayed, confirmar que quatro amigos atrás de CGNAT entram — é do 03-11 e continua bloqueada pelo 02-04.
- **Sem bloqueadores novos.**

---
*Phase: 03-sala-transporte-e-protocolo*
*Completed: 2026-09-08*

## Self-Check: PASSED

Arquivos declarados como criados, conferidos em disco:

- `ops/turnserver.conf` — FOUND (4.971 bytes)
- `ops/coturn-dropin.conf` — FOUND (3.064 bytes)
- `.planning/phases/03-sala-transporte-e-protocolo/03-07-SUMMARY.md` — FOUND

Commits declarados, conferidos em `git log`:

- `7948203` — FOUND (Task 1)
- `d13aaa6` — FOUND (Task 2)

Portões, na worktree, a partir da base `4a825d1`:

- `npx vitest run tests/ops-config.test.ts` — 74 passes (era 62 antes do plano)
- `npm test` — 593 passes em 45 arquivos
- `npm run lint` — limpo
- `git status --short` — vazio; nenhum arquivo não rastreado deixado para trás
- Nenhuma alteração em `STATE.md` nem em `ROADMAP.md`, que são do orquestrador
