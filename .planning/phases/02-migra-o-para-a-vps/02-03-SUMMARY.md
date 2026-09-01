---
phase: 02-migra-o-para-a-vps
plan: 03
subsystem: infra
tags: [caddy, systemd, ssh, rsync, deploy, rollback, posix-sh, vitest]

# Dependency graph
requires:
  - phase: 01-fundacao
    provides: "tests/purity.test.ts como forma de teste estrutural sobre glob raw; tools/README.md como contrato de falha de script"
provides:
  - "ops/Caddyfile — roteamento /api, /ws e estático, cache por classe de arquivo, 503 JSON no handle_errors"
  - "ops/deploy.sh — troca atômica dos dois symlinks de release e restart condicional de dg2.service"
  - "ops/rollback.sh — reversão sem nenhuma chamada de rede e sem tocar no banco"
  - "ops/prune-releases.sh — retenção de 5 por raiz, resolvendo o symlink vivo antes de apagar"
  - "ops/deploy-forced.sh — command= da chave dg2-deploy, aceita só rsync --server e deploy.sh <sha40>"
  - "ops/README.md — runbook de reconstrução da caixa e inventário das 8 chaves de /etc/dg2/env sem valores"
  - "tests/ops-config.test.ts — P-5, P-6, P-12, DM-5, D2-06 e D2-15 reprováveis num comando"
affects: [02-10-units-systemd, 02-11-job-de-deploy-no-ci, 02-12-execucao-na-caixa, 03-netcode]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "ops/ versionado: config de infra revisável em diff, segredos só em /etc/dg2/env"
    - "Contrato de falha de tools/README.md §3 traduzido para POSIX sh"
    - "Teste estrutural sobre import.meta.glob('../ops/*', ?raw) com filtro de comentários antes de asserções de ausência"

key-files:
  created:
    - ops/Caddyfile
    - ops/deploy.sh
    - ops/rollback.sh
    - ops/prune-releases.sh
    - ops/deploy-forced.sh
    - ops/README.md
    - tests/ops-config.test.ts
  modified: []

key-decisions:
  - "Sem valor padrão em {$DG2_DOMAIN}: variável ausente deixa o endereço de site vazio e o Caddy recusa no parse — falha barulhenta no boot em vez de servir sob o nome errado"
  - "A poda no fim do deploy é não-fatal mas barulhenta: o symlink já foi trocado, então sair 1 diria ao CI que um deploy que está no ar não aconteceu"
  - "swap_symlink duplicado em deploy.sh e rollback.sh em vez de sourced de um common.sh: uma reversão que depende de um segundo arquivo é uma reversão com um segundo jeito de quebrar"
  - "deploy.sh e rollback.sh chamam systemctl via `sudo -n`, com sudoers de dois verbos numa unit só, documentado no runbook §4"

patterns-established:
  - "Higiene de grep em teste de config: filtrar linhas cujo primeiro caractere não-branco é # antes de qualquer asserção de ausência, porque os arquivos explicam nos comentários o que não usam"
  - "Símbolo vivo nunca é apagado por script de limpeza: resolver readlink -f do symlink antes de podar"
  - "Validação de argumento que vira caminho é recusa (40 hex exatos), nunca sanitização"

requirements-completed: [INFRA-01, INFRA-04]

# Metrics
duration: 16min
completed: 2026-09-01
---

# Phase 2 Plan 03: Configuração e scripts da caixa Summary

**O caminho inteiro de "um comando publica, um comando reverte" existe em diff: `Caddyfile` com 503 legível por máquina e sem `try_files`, troca de symlink por `rename(2)`, reversão sem rede, e 17 asserções que reprovam as cinco armadilhas medidas pela pesquisa.**

## Performance

- **Duration:** 16 min
- **Started:** 2026-09-01T01:42:00Z
- **Completed:** 2026-09-01T01:58:01Z
- **Tasks:** 3
- **Files modified:** 7 criados, 0 modificados

## Accomplishments

- `ops/Caddyfile` roteia `/api/*` e `/ws` para o upstream em loopback e serve o resto pelo symlink de release, com `Cache-Control` imutável só no `/assets` de nome hasheado e `no-cache` no shell — a metade servidora de P-4, sem a qual o `{cache:'reload'}` do `cache.addAll` sozinho não resolve nada.
- `deploy.sh` troca os dois symlinks com `ln -sfn` num temporário seguido de `mv -T`, e reinicia `dg2.service` **só** quando o `sha256` do `server.mjs` mudou ou a unit está fora — o restart re-executa a migração, que é a única operação do deploy capaz de falhar.
- `rollback.sh` escolhe o release anterior por mtime, ignora o vivo, e não contém `curl`, `wget`, `git ` nem `npm ` em ponto nenhum do arquivo (nem em comentário) — D2-06 virou asserção, não promessa.
- `deploy-forced.sh` reduz a chave que vive num CI de terceiro a exatamente duas capacidades: escrever sob a árvore de releases e trocar um symlink.
- `ops/README.md` (217 linhas) é o runbook que uma reconstrução segue de cima a baixo, com as oito chaves de `/etc/dg2/env` nomeadas e nenhum valor, nenhum domínio e nenhum IPv4 que não seja o loopback.
- `tests/ops-config.test.ts` (17 testes) fecha P-5 (`route` proibido), P-6 (`{$VAR}` sim, `{env.VAR}` não), P-12 (documentado no runbook), DM-5 (sem `try_files`), o `ln -sfn` não atômico, D2-06 e D2-15.

## Task Commits

1. **Task 1: `ops/Caddyfile` e o teste estrutural de `ops/`** — `44f350b` (feat)
2. **Task 2: `deploy.sh`, `rollback.sh`, `prune-releases.sh` e o comando forçado da chave** — `85c4211` (feat)
3. **Task 3: `ops/README.md` — o runbook de reconstruir a caixa** — `f2d2a08` (docs)

## Files Created/Modified

- `ops/Caddyfile` — endereço de site por `{$DG2_DOMAIN}`, três blocos `handle` mutuamente exclusivos, cache por classe de arquivo, `handle_errors` com 503 JSON e `no-store`.
- `ops/deploy.sh` — layout de disco documentado no cabeçalho (a decisão que o resto da fase herda), troca atômica dos dois symlinks, restart condicional por hash, poda não-fatal no fim.
- `ops/rollback.sh` — reversão por argumento ou pelo release anterior por mtime; zero rede, zero referência ao diretório de estado.
- `ops/prune-releases.sh` — `KEEP=5` por raiz, `readlink -f` dos dois symlinks vivos antes de qualquer `rm`.
- `ops/deploy-forced.sh` — parser de `SSH_ORIGINAL_COMMAND` com dois formatos aceitos e recusa explícita de sessão interativa.
- `ops/README.md` — nove seções numeradas: o que mora aqui, layout, pacotes, usuários, `/etc/dg2/env`, o drop-in do Caddy e a regra reload ≠ restart, publicar/reverter, o que a fase não tem, e o que está agendado para a fase 3.
- `tests/ops-config.test.ts` — glob raw sobre `../ops/*`, filtro de comentários, guardas anti-vacuidade em toda leitura.

## Decisions Made

- **`{$DG2_DOMAIN}` sem valor padrão.** `{$DG2_DOMAIN:localhost}` deixaria a caixa subir sob o nome errado em silêncio se o drop-in de env sumisse. Sem padrão, o endereço fica vazio e o Caddy recusa no parse. Também é o que faz `grep -c '{\$DG2_DOMAIN}'` retornar exatamente 1.
- **A poda é não-fatal no `deploy.sh`, mas nunca silenciosa.** No momento em que ela roda o symlink já foi trocado; sair 1 ali reportaria ao CI que um deploy que **está no ar** falhou. O erro vai para stderr no formato do contrato e o deploy segue verde.
- **`swap_symlink` duplicado em vez de um `common.sh`.** Dez linhas repetidas custam menos que um `rollback.sh` que depende de um segundo arquivo estar presente e correto no dia em que tudo mais quebrou.
- **`@gateway` em vez de `@api` como nome do matcher do `handle_errors`.** O `handle_errors` é outro escopo, e reusar o nome do bloco de cima faria o leitor procurar uma relação que não existe.
- **Retenção 5 escrita como `KEEP=5` numa linha própria**, para que o teste possa assertar a constante com `/^KEEP=5$/m` em vez de procurar um `5` solto.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] Bit de execução no índice do git para os quatro scripts**
- **Found during:** Task 2
- **Issue:** `git add` no Windows registra modo `100644`. Um `command="/srv/dg2/bin/deploy-forced.sh"` na `authorized_keys` apontando para arquivo não executável falha com "Permission denied" no primeiro deploy — e o sintoma (SSH fecha a conexão) não aponta para a causa.
- **Fix:** `git update-index --chmod=+x` nos quatro `.sh`; o commit registra `create mode 100755`. O runbook §1 explica por que o lugar de arrumar é o índice, não o `chmod` da instalação.
- **Files modified:** `ops/deploy.sh`, `ops/rollback.sh`, `ops/prune-releases.sh`, `ops/deploy-forced.sh`
- **Verification:** `git ls-files -s ops/` mostra `100755` nos quatro
- **Committed in:** `85c4211`

**2. [Rule 2 - Missing Critical] Privilégio para o restart condicional, e o sudoers que o concede**
- **Found during:** Task 2
- **Issue:** `deploy.sh` roda como `dg2-deploy` (sem shell, sem root) e precisa de `systemctl restart dg2`. Sem isso o restart condicional — metade do valor do script — não funciona, e o plano não dizia por onde vem o privilégio.
- **Fix:** Os scripts chamam `SYSTEMCTL="sudo -n systemctl"`. `sudo -n` nunca abre prompt, então uma regra faltando falha na hora em vez de pendurar num terminal que não existe, e é no-op quando um operador roda como root. O runbook §4 traz o drop-in exato, com dois verbos numa unit só e `NOPASSWD`.
- **Files modified:** `ops/deploy.sh`, `ops/rollback.sh`, `ops/README.md`
- **Verification:** `sh -n` limpo; a regra de sudoers está no runbook e é o que o plano 02-12 vai instalar
- **Committed in:** `85c4211`, `f2d2a08`

**3. [Rule 2 - Missing Critical] Validação do sha também dentro de `deploy.sh` e `rollback.sh`**
- **Found during:** Task 2
- **Issue:** O plano pedia o `^[0-9a-f]{40}$` só em `deploy-forced.sh`. Mas o argumento vira caminho por concatenação: `deploy.sh ../../etc` resolve para um diretório que existe e apontaria `current` para fora da árvore de releases. Os dois scripts também são chamáveis à mão.
- **Fix:** O mesmo `grep -Eq '^[0-9a-f]{40}$'` nos três, com comentário dizendo que recusar é uma decisão e sanitizar é um palpite.
- **Files modified:** `ops/deploy.sh`, `ops/rollback.sh`
- **Verification:** `npx vitest run tests/ops-config.test.ts` verde; `sh -n` limpo
- **Committed in:** `85c4211`

**4. [Rule 2 - Missing Critical] Checagem explícita do bundle do servidor antes do `sha256sum`**
- **Found during:** Task 2
- **Issue:** O plano só mandava recusar se `/srv/dg2/releases/$SHA` não existisse. Faltando `server-releases/$SHA/server.mjs`, o `sha256sum` morreria sob `set -e` com a mensagem dele, fora do contrato `script:ponteiro: mensagem` de `tools/README.md` §3 — exatamente o "falha em silêncio não conta" que `ops/` herda.
- **Fix:** `[ -f "$SERVER_REL/server.mjs" ] || fail ...` nos dois scripts, antes de qualquer hash.
- **Files modified:** `ops/deploy.sh`, `ops/rollback.sh`
- **Verification:** `sh -n` limpo; caminho de erro segue o formato do contrato
- **Committed in:** `85c4211`

---

**Total deviations:** 4 auto-fixed (4 missing critical)
**Impact on plan:** Todos os quatro são condições para "um comando publica, um comando reverte" funcionar de fato na caixa; nenhum acrescenta arquivo, dependência ou superfície nova. Sem escopo extra.

## Issues Encountered

- **Conflito entre um critério de aceitação e o teste descrito no plano.** O plano mandava o teste assertar ausência de `curl`/`git`/`wget`/`npm` em `rollback.sh` **depois** de filtrar comentários, mas o critério de aceitação (`grep -c 'curl\|wget\|git \|npm ' ops/rollback.sh` → 0) roda sobre o arquivo cru. Resolvido pelo critério mais estrito: `rollback.sh` não contém nenhuma das quatro palavras em ponto nenhum, e o cabeçalho explica a proibição sem nomeá-las ("no version-control client, no HTTP fetcher, no package manager"). O teste correspondente é o único que **não** filtra comentários, e o comentário dele diz por quê.
- **A mesma restrição vale para `/var/lib/dg2` em `rollback.sh`** (critério: 0 ocorrências). O cabeçalho fala em "the state directory" e "outside the release tree" em vez do caminho literal; o caminho está documentado no cabeçalho de `deploy.sh` e no runbook §2, que são os lugares onde ele pertence.
- **`[ ... ] && continue` é um defeito sob `set -eu`:** um teste falso faz a lista AND retornar não-zero e o script morre no meio da poda. Todos os laços usam `if`, e há comentário no `prune-releases.sh` registrando o motivo.

## Known Stubs

| Stub | Arquivo | Por que é intencional |
|---|---|---|
| `handle /ws` sem consumidor | `ops/Caddyfile` | Reservado para o signaling da fase 3. O plano pede explicitamente que exista agora "para que a forma seja visível"; nenhum código desta fase o usa, e o Caddy faz upgrade de WebSocket pelo `reverse_proxy` sem módulo extra, então o bloco não muda quando o consumidor chegar. |
| `DG2_RELEASE` e as quatro chaves de Litestream nomeadas mas não usadas por nenhum arquivo deste plano | `ops/README.md` | O inventário é o entregável (a lista de chaves **sem valores** de D2-15). Os consumidores são `ops/dg2.service` (plano 02-10), `ops/litestream.yml` (02-10) e `/api/health` (02-08). |

Nenhum dos dois impede o objetivo do plano: o caminho de publicar e reverter está completo e testado sem eles.

## Threat Flags

Nenhuma superfície de segurança fora do `<threat_model>` do plano. As seis disposições `mitigate` estão implementadas e asseridas: T-2-404 (sem `try_files`), T-2-KEY (`deploy-forced.sh` + `nologin` + `no-pty` documentados), T-2-ROLLBACK (zero rede), T-2-DATA (nenhuma referência ao diretório de estado no `rollback.sh`), T-2-SECRET (nenhum IPv4 além do loopback, nenhuma credencial com valor), T-2-LEAKERR (corpo genérico no `handle_errors`).

## User Setup Required

None nesta fase — nada aqui tocou a máquina. O plano 02-12 executa estes arquivos na caixa real; o runbook `ops/README.md` é o documento que ele segue, incluindo o drop-in de sudoers de §4 e o `systemctl edit caddy` de §6.

## Next Phase Readiness

- **Pronto para 02-10 (units do systemd):** o layout de disco está fixado e documentado; `dg2.service` só precisa apontar `WorkingDirectory` para `/srv/dg2/current-server`, que é o symlink que `deploy.sh` já troca.
- **Pronto para 02-11 (job de deploy no CI):** o contrato do lado da caixa está fechado — o job precisa fazer `rsync --link-dest=<absoluto>` para `/srv/dg2/releases/<sha>/` e depois `ssh ... /srv/dg2/bin/deploy.sh <sha>`. Os dois formatos são os únicos que `deploy-forced.sh` aceita.
- **Pronto para 02-12 (execução na caixa):** `ops/README.md` é o runbook de cima a baixo.
- **Ressalva registrada:** nenhum destes arquivos foi executado contra um sistema de arquivos real. `sh -n` prova sintaxe, não comportamento. O primeiro exercício de verdade — inclusive do `mv -T`, do `sudo -n` e da regra de sudoers — é o plano 02-12, e ele deve incluir um `rollback.sh` de ensaio logo depois do primeiro deploy, enquanto ainda não há nada a perder.

## Self-Check: PASSED

Sete arquivos criados, todos presentes em disco; os quatro `.sh` com modo `100755`. Três commits
de tarefa presentes em `git log` (`44f350b`, `85c4211`, `f2d2a08`), mais o commit de metadados.
`npm test` (414 testes, 36 arquivos), `npm run lint` e `npx tsc --noEmit` verdes; `sh -n` limpo
nos quatro scripts; os treze `grep` dos critérios de aceitação das três tarefas conferidos um a um.

---
*Phase: 02-migra-o-para-a-vps*
*Completed: 2026-09-01*
