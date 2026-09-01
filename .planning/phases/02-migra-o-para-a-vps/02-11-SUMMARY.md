---
phase: 02-migra-o-para-a-vps
plan: 11
subsystem: infra
tags: [github-actions, ci, deploy, rsync, ssh, artifact, concurrency, supply-chain]

# Dependency graph
requires:
  - phase: 02-01
    provides: "deploy.yml apagado e tests/workflows.test.ts com a guarda de contagem exata e a lista de padrões de Pages"
  - phase: 02-09
    provides: "o job `pwa`, e a disciplina de chave de cache distinta que este plano herda"
  - phase: 02-08
    provides: "npm run server:build, o bundle dist-server/server.mjs com better-sqlite3 externo"
  - phase: 02-03
    provides: "ops/deploy.sh <sha40>, ops/deploy-forced.sh e o layout de /srv/dg2/"
  - phase: 02-10
    provides: "dg2.service e o /srv/dg2/node_modules que o bundle precisa para subir"
provides:
  - "job `deploy` no ci.yml — needs dos dois portões, gate de branch, concurrency, dois rsync com --link-dest absoluto e a troca de symlink por SSH"
  - "os dois upload-artifact no job `test`, com sw:verify e server:build antes deles"
  - "seis asserções novas em tests/workflows.test.ts: T-2-SC, T-2-SSH, T-2-RACE, D2-05, D2-08 e P-12"
  - "hasLine() — asserção por linha inteira, depois de a asserção por substring ter sido medida vacua"
affects: [02-12, 02-04]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Artefato entre jobs em vez de rebuild, para que 'o publicado é o testado' seja literal e não estatístico"
    - "Segredo entra por `env:` do passo, nunca interpolado dentro do `run:`"
    - "Guarda de segredo vazio no primeiro passo que o usa, com o nome do secret na mensagem"
    - "Asserção por linha inteira (`hasLine`) quando o literal também aparece em prosa no mesmo arquivo"

key-files:
  created: []
  modified:
    - .github/workflows/ci.yml
    - tests/workflows.test.ts

key-decisions:
  - "sw:verify roda TAMBÉM no job que sobe o artefato: o portão do job `pwa` prova algo sobre outro dist/, não sobre o que viaja para a caixa"
  - "StrictHostKeyChecking=yes aparece três vezes e não duas: o plano pede dois rsync mais um ssh, e o critério foi transcrito de um exemplo com um rsync só"
  - "$HOME e não `~` dentro do -e do rsync: entre aspas duplas o shell não expande til, e o rsync entrega a string ao exec sem passar por shell"
  - "permissions: contents: read no job que carrega a chave — acréscimo de Rule 2, e o único item deste plano que pode surpreender na primeira execução real"
  - "REQUIREMENTS.md NÃO foi tocado: INFRA-01 e INFRA-04 não estão cumpridos enquanto 02-04 e 02-12 estiverem adiados"

patterns-established:
  - "Prova de não-vacuidade por remoção aplicada a TODA asserção nova, e não só à que o plano pediu — foi assim que se descobriu que uma delas era vácua"
  - "Comentário de workflow que precisa citar um comando proibido escreve o perigo sem escrever o nome, porque a guarda é substring literal e cobre prosa"

requirements-completed: []

# Metrics
duration: 15min
completed: 2026-09-01
---

# Phase 02 Plan 11: O CI ligado à caixa — artefato, rsync e troca de symlink — Summary

**Publicar passou a ser `git push` na `main`: o job `test` sobe os dois artefatos que já
passaram pelos portões, e um job `deploy` novo os leva por `rsync` sobre SSH e manda a caixa
trocar o symlink — com a chave de host fixada de um secret, `--link-dest` absoluto nos dois
envios, e seis asserções que reprovam cada uma dessas propriedades quando ela regride.**

## Performance

- **Duration:** ~15 min
- **Started:** 2026-09-01T00:55:00-03:00
- **Completed:** 2026-09-01T01:10:00-03:00
- **Tasks:** 2 de 2
- **Files modified:** 2 (0 criados, 2 modificados)

## Accomplishments

- **D2-05 deixou de ser uma intenção e virou bytes.** O job `test` agora roda `sw:verify` e
  `server:build` depois do `build` e sobe `dist/` e `dist-server/` como artefatos. O job
  `deploy` **baixa** esses dois — não reconstrói. A diferença só aparece no dia em que o build
  deixa de ser reprodutível, que é exatamente o dia em que ninguém está olhando.
- **O job `deploy` existe onde `needs:` funciona.** `needs: [test, pwa]`,
  `if: github.ref == 'refs/heads/main' && github.event_name == 'push'` (D2-08),
  `concurrency: { group: deploy-vps, cancel-in-progress: false }` (T-2-RACE), dois `rsync` com
  `--link-dest` **absoluto** (P-12) e um `ssh` chamando `/srv/dg2/bin/deploy.sh $GITHUB_SHA` —
  a única forma de argumento que o `command=` da chave aceita.
- **Nenhuma descoberta de chave de host, e nenhuma ação de terceiro.** O `known_hosts` vem
  fixado de secret; os quatro segredos entram por `env:` e nunca interpolados dentro do
  `run:`; e todo `uses:` do arquivo é da própria GitHub, agora asserido.
- **As seis asserções novas foram todas vistas vermelhas por remoção** — e uma delas nasceu
  vácua e foi consertada por causa disso (ver desvio 6). A prova por remoção não é cerimônia:
  foi ela que encontrou o defeito.
- **O arquivo foi lido por um parser estrutural**, e não só por `grep`: os três jobs, o
  `needs`, o `if`, o `concurrency`, o `permissions`, o `env` e os seis passos do `deploy`
  nascem no nível de aninhamento que deveriam. Ver "O que foi e o que não foi verificado".

## Task Commits

1. **Task 1: O job `test` emite os dois artefatos publicáveis** — `9f13a76` (ci)
2. **Task 2: O job `deploy` — rsync, symlink, e a chave de host que não se descobre** — `b3c31f0` (ci)

## Files Created/Modified

- `.github/workflows/ci.yml` (132 → 285 linhas) — quatro passos novos no fim do job `test`
  (`sw:verify`, `server:build`, dois `upload-artifact@v4` com `retention-days: 7`) e o job
  `deploy` inteiro: dois `download-artifact@v4`, o passo que escreve chave e `known_hosts`,
  dois `rsync` e a ativação por `ssh`.
- `tests/workflows.test.ts` (69 → 210 linhas) — `CI_PATH`, o helper `ci()` com a guarda de
  arquivo vazio/truncado, o helper `hasLine()`, e três `describe` novos com seis asserções.

## Decisions Made

1. **`sw:verify` roda também no job que sobe o artefato.** O job `pwa` já tinha o seu desde
   02-09, e ele continua onde está — mas ele protege *outro* `dist/`, o que as specs de
   Playwright servem. O `dist/` que viaja para a caixa é o do job `test`, e um portão que roda
   num job vizinho não é um portão sobre estes bytes. Custa ~1 s e fecha a lacuna.

2. **`$HOME` e não `~` dentro do `-e` do `rsync`.** Entre aspas duplas o shell **não** expande
   o til, e o `rsync` divide a string do `-e` por espaços e a entrega ao `exec` sem shell
   nenhum. O `~` sobreviveria hoje só porque o OpenSSH expande til em caminho de identidade
   por conta própria — depender disso é depender de um detalhe de implementação num caminho
   que ninguém vai testar de novo. Está comentado no arquivo.

3. **`permissions: contents: read` no job que carrega a chave.** Ele não faz `checkout` e não
   escreve no repositório; o token da GitHub não tem o que fazer ali. `download-artifact@v4`
   dentro da mesma execução usa o token de runtime e não o `GITHUB_TOKEN`, então a restrição
   não deveria alcançá-lo. **"Não deveria" é o nível de certeza honesto aqui** — é o único
   item deste plano que pode surpreender na primeira execução real, e está listado abaixo
   como coisa a observar no plano 02-12.

4. **`REQUIREMENTS.md` não foi tocado.** O plano declara `requirements: [INFRA-01, INFRA-04]`,
   mas nenhum dos dois está cumprido: os quatro secrets não existem (02-04 adiado) e nada
   deste caminho jamais rodou contra a caixa (02-12 adiado). Marcar a caixinha aqui trocaria
   uma pendência visível por uma invisível.

## Provas de não-vacuidade executadas

Cada uma foi rodada de verdade, vista vermelha, e o arquivo restaurado de uma cópia (nunca por
`git checkout`, que teria descartado o trabalho não commitado do momento):

| Prova | Como | Resultado |
|---|---|---|
| a busca de chave de host é mesmo recusada | uma linha de comentário com o comando proibido, no fim do `ci.yml` | ✗ `expected ... not to contain 'ssh-keyscan'`; restaurado → ✓ |
| a fixação é por comando, não por contagem | `-o StrictHostKeyChecking=yes` removido **só** da ativação por `ssh` | ✗ `expected [ Array(1) ] to deeply equal []`; restaurado → ✓ |
| `--link-dest` absoluto é medido | um dos dois trocado por `../current/` | ✗ `expected [ '../current/' ] to deeply equal []`; restaurado → ✓ |
| ação de terceiro é recusada | `- uses: webfactory/ssh-agent@v0.9.0` acrescentado | ✗ `expected [ 'webfactory/ssh-agent@v0.9.0' ]`; restaurado → ✓ |
| o cancelamento não pode ser religado | `cancel-in-progress: false` → `true` | ✗ `to contain 'cancel-in-progress: false'`; restaurado → ✓ |
| o deploy depende dos **dois** portões | `needs: [test, pwa]` → `needs: test` | **✗ verde na primeira tentativa** — ver desvio 6; depois do conserto, ✗ `o deploy não depende dos dois portões`; restaurado → ✓ |
| o gate de branch é medido | `if:` reduzido a `github.event_name == 'push'` | ✗ `o gate de branch e de evento mudou de forma`; restaurado → ✓ |

## Deviations from Plan

### Critérios de aceitação que o próprio plano tornou impossíveis

**1. [Rule 1 - Critério obsoleto] `grep -c 'sw:verify' ci.yml` retorna 2, não 1**

- **Found during:** Task 1
- **Issue:** O critério pede 1, e a ação do mesmo plano manda acrescentar
  `- run: npm run sw:verify` ao job `test`. O plano 02-09 — do qual este depende — já tinha
  posto um no job `pwa`, e o SUMMARY dele registra `grep -c 'sw:verify'` = 1. Os dois números
  não podem valer ao mesmo tempo.
- **Fix:** O passo foi acrescentado, como a ação manda, e a contagem é 2. A alternativa seria
  não acrescentá-lo e deixar o artefato publicável sem portão de worker no job que o publica,
  o que contradiz o objetivo declarado do plano.
- **Files modified:** `.github/workflows/ci.yml`
- **Commit:** `9f13a76`

**2. [Rule 1 - Critério obsoleto] `grep -c 'StrictHostKeyChecking=yes'` retorna 3, não 2**

- **Found during:** Task 2
- **Issue:** O critério foi transcrito do exemplo da pesquisa (`02-RESEARCH.md:1324-1366`), que
  tem **um** `rsync` e **um** `ssh`. A ação deste plano pede **dois** `rsync` (cliente e
  servidor) mais o `ssh` de ativação — três comandos que abrem conexão.
- **Fix:** A opção é literal nos três. Considerei defini-la uma vez numa variável de ambiente
  para bater o número, e recusei: cada comando carregar a própria fixação é o que faz um
  comando novo, escrito por outra pessoa, ficar inseguro de forma **visível** em vez de
  herdar segurança de uma linha distante.
- **Files modified:** `.github/workflows/ci.yml`
- **Commit:** `b3c31f0`

### Auto-fixed Issues

**3. [Rule 1 - Bug] `~` dentro de aspas duplas não é expandido**

- **Found during:** Task 2
- **Issue:** O exemplo da pesquisa escreve `-e "ssh ... -i ~/.ssh/id_ed25519"`. O shell não
  expande til entre aspas duplas, e o `rsync` entrega a string ao `exec` sem shell, então o
  `ssh` recebe o til literal. Funciona hoje só porque o OpenSSH expande til em caminho de
  identidade por conta própria — um detalhe de implementação, num caminho que não tem teste.
- **Fix:** `$HOME` nos três comandos, que o shell expande mesmo entre aspas. Comentado no
  arquivo, com o motivo.
- **Commit:** `b3c31f0`

**4. [Rule 2 - Missing Critical] Segredos por `env:`, e guarda de segredo vazio**

- **Found during:** Task 2
- **Issue:** O exemplo da pesquisa interpola `${{ secrets.* }}` **dentro** do `run:`. Para um
  valor multilinha como a chave privada isso significa colar o texto no meio de uma string
  entre aspas, num script que fica em disco no runner. E um secret ausente chega como string
  vazia: o sintoma seria um `Permission denied (publickey)` trinta segundos depois, no meio de
  uma transferência, sem dizer qual dos quatro faltou. Como 02-04 está adiado, **a primeira
  execução real deste job vai encontrar exatamente esse caso**.
- **Fix:** Os quatro segredos entram por `env:` (dois no job, dois no passo) e o primeiro
  passo faz `: "${VAR:?secret VAR vazio ou ausente}"` nos quatro. A mensagem nomeia o secret e
  nunca o valor.
- **Commit:** `b3c31f0`

**5. [Rule 2 - Missing Critical] `permissions: contents: read` no job `deploy`**

- **Found during:** Task 2
- **Issue:** O plano não pede. O job herdaria as permissões padrão do repositório para o
  `GITHUB_TOKEN`, ao lado de uma chave privada com escrita na VPS — que é precisamente o
  cenário que o registro de ameaças deste plano existe para reduzir.
- **Fix:** `permissions: contents: read`. Ver a decisão 3 acima para o nível de certeza: é o
  único acréscimo deste plano que pode falhar na primeira execução real, e está listado como
  item a observar no 02-12.
- **Commit:** `b3c31f0`

**6. [Rule 1 - Bug de teste] `toContain('needs: [test, pwa]')` era vácuo**

- **Found during:** Task 2, na prova de não-vacuidade
- **Issue:** Reduzi o `needs` do job `deploy` a `needs: test` esperando ver vermelho, e a
  suíte ficou **verde**. Motivo: o comentário do job `pwa`, deixado pelo plano 02-09 como
  recado para este plano, contém a string ``needs: [test, pwa]``. A asserção por substring
  estava lendo o recado, não o job. Exatamente a classe de defeito que este arquivo declara no
  cabeçalho estar caçando — e que só apareceu porque a prova por remoção foi executada em vez
  de afirmada.
- **Fix:** Helper `hasLine(src, literal)`, que casa uma linha **inteira** (indentação à parte,
  com `\r?` no fim porque o repositório é CRLF no Windows e LF no runner). Aplicado a
  `needs`, ao `if:` completo, a `group: deploy-vps`, a `cancel-in-progress: false`,
  a `name: dist` e a `name: server`. O comentário de `hasLine` registra o episódio, porque a
  próxima pessoa vai querer saber por que não é um `toContain`.
- **Verification:** com o conserto, `needs: test` **e** o `if:` reduzido ficam vermelhos, cada
  um com a sua mensagem.
- **Commit:** `b3c31f0`

**7. [Rule 2 - Missing Critical] Uma quarta asserção: `--link-dest` absoluto (P-12)**

- **Found during:** Task 2
- **Issue:** O plano pede três asserções de segurança e deixa P-12 como critério de `grep`.
  Mas P-12 é a armadilha cujo modo de falha é **silêncio** — o `rsync` não erra, só não faz
  hardlink, e o sintoma é disco cheio meses depois. Um `grep` num critério de aceitação
  protege o dia de hoje; um teste protege o dia em que alguém "arruma" o caminho.
- **Fix:** `it('todo --link-dest é caminho absoluto (P-12)')`, com guarda anti-vacuidade e
  prova por remoção.
- **Commit:** `b3c31f0`

**8. [Rule 3 - Blocking] O comentário do `ci.yml` não pode nomear o comando que ele proíbe**

- **Found during:** Task 2
- **Issue:** A ação do plano manda comentar "**Nunca `ssh-keyscan`**", e o mesmo plano manda
  assertar que o `ci.yml` **não contém** essa string. `tests/workflows.test.ts` declara no
  cabeçalho que prosa não é isenta, e por bom motivo: um comando proibido comentado é uma
  linha que alguém descomenta quando um deploy está vermelho.
- **Fix:** A guarda ficou literal (a forma forte), e o comentário do workflow descreve o
  perigo sem escrever o nome — "descobri-la aqui dentro seria confiar no primeiro que
  responder" — e diz explicitamente que o teste recusa a alternativa pelo nome, inclusive em
  comentário. O comentário do teste explica a assimetria para quem estranhar.
- **Commit:** `b3c31f0`

---

**Total deviations:** 8 — 2 critérios de aceitação obsoletos por dependência (documentados, não
contornados), 3 correções de Rule 1, 3 acréscimos de Rule 2/3.
**Impact on plan:** Nenhum aumento de escopo; os dois arquivos declarados são os dois arquivos
tocados. Seis dos oito são consequência de o plano ter sido escrito contra o exemplo da
pesquisa e contra o estado do repositório **antes** da wave 5.

## O que foi e o que NÃO foi verificado

Esta seção existe porque a diferença importa mais neste plano do que em qualquer outro da fase.

**Verificado de verdade, nesta máquina:**

| Portão | Resultado |
|---|---|
| `npm test` | ✓ 497/497 em 42 arquivos (eram 491 na base) |
| `npx vitest run tests/workflows.test.ts` | ✓ 8 testes |
| as sete provas por remoção | ✓ todas vermelhas quando deviam, verdes de volta |
| `npm run build` | ✓ |
| `npm run sw:verify` | ✓ `dg2-63818d8fcd3ac13e`, 13 caminhos batendo com o `dist/` |
| `npm run server:build` | ✓ `dist-server/server.mjs`, 557,5 KB |
| `npm run lint` | ✓ |
| `npx tsc --noEmit` | ✓ |
| `npm run typecheck:server` | ✓ |
| forma do YAML | ✓ por leitor estrutural descartável (não commitado): 3 jobs na ordem `test, pwa, deploy`; `needs`, `if`, `runs-on`, `concurrency`, `permissions`, `env` e 6 passos aninhados onde deviam; sem TAB; sem chave duplicada |
| ASCII puro no `ci.yml` | ✓ 0 linhas fora de `[ -~]` — a convenção do arquivo é português sem acentos |

**NÃO verificado, e não verificável hoje:**

- **O workflow nunca foi lido pelo GitHub.** Não há repositório remoto nem `git remote`
  configurado, e nada de `git push`, `git remote add` ou `gh repo create` foi feito. O leitor
  estrutural acima é um parser de subconjunto escrito para este arquivo — ele não é o
  analisador do GitHub Actions e não valida expressões `${{ }}`, nomes de evento nem versões
  de ação.
- **O job `deploy` nunca executou.** Os quatro secrets (`DEPLOY_SSH_KEY`, `DEPLOY_HOST`,
  `DEPLOY_USER`, `DEPLOY_KNOWN_HOSTS`) não existem: o plano 02-04 está adiado. Nenhum valor de
  secret, domínio, host ou IP foi escrito no repositório (D2-15).
- **Nada de `ops/` jamais rodou contra um sistema de arquivos real** — isso vem dos planos
  02-03 e 02-10, e continua valendo. Este plano acrescenta o outro lado do fio; os dois lados
  seguem sem nunca terem se falado.
- **`permissions: contents: read` com `download-artifact@v4` não foi exercitado.** É o item
  deste plano com maior chance de surpreender na primeira execução real.

## Known Stubs

Nenhum stub no sentido de valor de marcador: não há lista vazia, texto "em breve" nem
componente sem fonte de dado. O que existe é um caminho **completo e nunca executado**, que é
coisa diferente e está inteiramente descrito na seção acima.

## Threat Flags

Nenhuma superfície fora do registro de ameaças do próprio plano. As cinco entradas
(T-2-SSH, T-2-KEY, T-2-SC, T-2-RACE, T-2-DRIFT, T-2-LOCAL) estão mitigadas como o plano
prevê, e quatro delas agora têm teste. T-2-KEY continua sendo mitigada **fora** deste
arquivo — pelo `command=` da `authorized_keys` na caixa (`ops/deploy-forced.sh`), que é onde
ela pertence: um job comprometido continua sem shell na VPS.

## Issues Encountered

- **A asserção que nasceu vácua** (desvio 6) foi o único problema real da execução, e foi
  encontrada pelo procedimento — não por revisão. Vale registrar como argumento a favor do
  procedimento: quatro das sete provas confirmaram o esperado, uma refutou.
- **`node_modules` não veio no worktree.** Resolvido com `npm ci` a partir do lockfile, sem
  tocar em `package.json` nem em `package-lock.json`.
- **Nenhum parser de YAML no projeto**, e `npx --yes` está fora de questão para baixar um. Daí
  o leitor estrutural descartável, no scratchpad, fora do repositório.

## Next Phase Readiness

- **Para o plano 02-04** (criar os secrets): o job espera exatamente `DEPLOY_SSH_KEY`,
  `DEPLOY_KNOWN_HOSTS`, `DEPLOY_USER` e `DEPLOY_HOST`, e recusa qualquer um deles vazio com o
  nome na mensagem. A chave pública correspondente precisa entrar na `authorized_keys` de
  `dg2-deploy` com o `command=` de `ops/deploy-forced.sh`.
- **Para o plano 02-12** (a execução real), na ordem em que devem ser observados:
  1. o `download-artifact` sob `permissions: contents: read` — decisão 3;
  2. o `deploy-forced.sh` aceitando o `rsync --server` que o cliente gera com `-az --delete
     --link-dest`, que é argv que ninguém viu ainda;
  3. `stat -c %h` num arquivo repetido entre dois releases, para confirmar que o
     `--link-dest` de fato deduplicou (contagem de links > 1) — é a única forma de fechar
     P-12 de verdade, porque a falha dele é silenciosa;
  4. o bit de execução de `/srv/dg2/bin/*.sh` na caixa, que o 02-10 registra como armadilha.
- **Para o verificador da fase:** INFRA-01 e INFRA-04 **continuam pendentes** e
  `REQUIREMENTS.md` não foi alterado por este plano, deliberadamente — ver decisão 4.
- `STATE.md` e `ROADMAP.md` não foram tocados: são do orquestrador.

## Self-Check: PASSED

Arquivos declarados, conferidos em disco: `.github/workflows/ci.yml`,
`tests/workflows.test.ts`, `.planning/phases/02-migra-o-para-a-vps/02-11-SUMMARY.md` — todos
presentes. As contagens de linha declaradas foram medidas contra a base `7f0d780`, não
estimadas (a primeira versão desta seção trazia dois números errados, corrigidos aqui).

Commits declarados, conferidos em `git log`: `9f13a76`, `b3c31f0` — presentes, mais `39aadff`
e o commit desta correção. Árvore de trabalho limpa, nenhum arquivo não rastreado, nenhuma
deleção em nenhum dos commits.

Nenhum arquivo fora dos dois declarados pelo plano foi tocado. `STATE.md`, `ROADMAP.md` e
`REQUIREMENTS.md` não aparecem em commit nenhum deste plano. Nenhum `git remote`, `git push`
nem criação de repositório foi executado — não há remoto configurado.

---
*Phase: 02-migra-o-para-a-vps*
*Completed: 2026-09-01*
