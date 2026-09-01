---
phase: 02-migra-o-para-a-vps
plan: 01
subsystem: infra
tags: [github, actions, ci, github-pages, deploy, teste-estrutural]

# Dependency graph
requires:
  - phase: 01
    provides: "o `ci.yml` com os oito portões, construído e exercitado só na máquina do desenvolvedor, em Windows"
provides:
  - "repositório publicado em github.com/gustavoktausend/DungeonGuys2, público, com remote `origin`"
  - "execução verde do `ci.yml` num runner Linux do GitHub — o primeiro sinal de integração real do projeto"
  - "`deploy.yml` apagado antes do primeiro push: o primeiro deploy do DungeonGuys2 no GitHub Pages nunca aconteceu"
  - "GitHub Pages nunca habilitado, confirmado por 404 na API do repositório real"
  - "`tests/workflows.test.ts`: prova executável de que existe um único alvo de deploy (INFRA-01)"
affects: [02-04 secrets de deploy, 02-11 job deploy, 02-12 primeira execução contra a caixa]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "teste estrutural sobre `.github/workflows/` via `import.meta.glob` raw, casando `*.yml` E `*.yaml`"
    - "contagem exata de workflows asserida ANTES de qualquer asserção de conteúdo"
key-files:
  created:
    - tests/workflows.test.ts
  deleted:
    - .github/workflows/deploy.yml

key-decisions:
  - "Glob de duas extensões em vez de uma: o GitHub lê `.yaml` e `.yml` igualmente, então um `deploy.yaml` teria reintroduzido o Pages sem tropeçar na contagem exata nem na guarda de conteúdo"
  - "Repositório público: Actions ilimitado importa porque o `ci.yml` roda três motores de browser por push, e D2-15 mantém domínio, host e credenciais fora do repositório, então público é seguro por construção"
  - "O `deploy.yml` foi apagado ANTES do primeiro push, não depois: apagar depois teria deixado um deploy no Pages acontecer, e INFRA-01 passa a ser satisfeito por não haver espelho para matar"
  - "Um commit vazio para disparar o primeiro CI: o push que cria o branch padrão registra o workflow mas não o executa"

patterns-established:
  - "A guarda contra reintroduzir o Pages recusa os marcadores inclusive em comentário — a hora em que alguém escreveria a linha é a hora em que um job está vermelho e o caminho curto parece razoável"

requirements-completed: [INFRA-01]

# Metrics
duration: 2 sessões (task 1 em 2026-08-31; tasks 2-3 em 2026-09-01)
completed: 2026-09-01
---

# Phase 2 Plan 01: Publicação no GitHub e o primeiro CI verde

**`deploy.yml` apagado antes do primeiro push, `tests/workflows.test.ts` provando que não há
alvo de deploy para o Pages, repositório publicado, e os oito portões da fase 1 verdes num
runner Linux pela primeira vez.**

## Performance

- **Tasks:** 3
- **Task 1:** 2026-08-31 — autônoma
- **Tasks 2 e 3:** 2026-09-01 — checkpoint humano (decisão de nome/visibilidade + publicação)
- **Files:** 1 criado, 1 apagado

## Accomplishments

- **A hipótese central foi testada e se confirmou.** DM-1 mediu que `git remote -v` estava
  vazio, que a API respondia 404 e que o espelho do Pages respondia 404: o `ci.yml` que a fase 1
  inteira construiu **nunca tinha rodado fora desta máquina, em Windows**, em 161+ commits. A
  execução [33537160955](https://github.com/gustavoktausend/DungeonGuys2/actions/runs/33537160955)
  passou em `ubuntu-latest`. A partir daqui "o CI passa" deixa de ser hipótese.
- **INFRA-01 é satisfeito por não haver espelho para matar.** O `deploy.yml` foi apagado antes
  do primeiro push, então o primeiro deploy do DungeonGuys2 no GitHub Pages nunca aconteceu.
  `gh api repos/gustavoktausend/DungeonGuys2/pages` responde **404** — o site nunca foi
  habilitado. D2-18 fecha a outra ponta: como nunca houve URL de onde instalar o PWA, não há
  instalação antiga em campo para migrar.
- **A promessa virou teste.** `tests/workflows.test.ts` (395 linhas ao fim da fase) reprova
  qualquer workflow que reintroduza `upload-pages-artifact`, `deploy-pages` ou
  `configure-pages`, inclusive em comentário.

## Task Commits

1. **Task 1: Apagar o `deploy.yml` e transformar INFRA-01 em teste** — `f1fef5b` (feat)
2. **Task 2: Nome e visibilidade** — decisão humana: `DungeonGuys2`, público
3. **Task 3: Publicar e ver o CI verde** — `3e2baac` (ci, commit vazio de disparo)

## Files Created/Modified

- `.github/workflows/deploy.yml` — **apagado** (42 linhas). Era o único caminho do repositório
  para o GitHub Pages
- `tests/workflows.test.ts` — criado com 69 linhas nesta plano; cresceu para 395 ao longo da
  fase (02-08, 02-11, WR-18, WR-19 e o gate de `DEPLOY_ENABLED` acrescentaram casos)

## Decisions Made

- **Glob de duas extensões.** O plano especificava `'../.github/workflows/*.yml'`. Foi usado um
  array com `*.yml` **e** `*.yaml`, porque o GitHub lê as duas igualmente — um `deploy.yaml`
  teria reintroduzido o Pages sem tropeçar na contagem exata nem na guarda de conteúdo. Os dois
  padrões ficam numa linha só para o `key_links` do plano continuar casando, e a asserção
  literal de contagem vem antes de qualquer asserção de conteúdo, como exigido.
- **Público.** O `ci.yml` roda Chromium, Firefox e WebKit a cada push; num repositório privado a
  cota mensal de minutos de Actions vira um limite real. D2-15 mantém domínio, host e
  credenciais fora do repositório, então público é seguro por construção.
- **Commit vazio para o primeiro disparo.** O push que cria o branch padrão registra o workflow
  mas não o executa — Actions habilitado, workflow `active`, e ainda assim zero execuções.
  Verificado antes de recorrer ao commit vazio que não havia nada legítimo pendente:
  `git add --renormalize .` não produziu mudança nenhuma.

## Prova de recusa (não-vacuidade)

Executada, não presumida, em duas ocasiões:

- **Task 1:** acrescentar `# upload-pages-artifact` ao `ci.yml` fez o teste sair `1`;
  `git checkout .github/workflows/ci.yml` restaurou (`git diff HEAD` vazio) e voltou ao verde.
- **Fim da fase:** o mesmo gate pegou a prosa de três agentes diferentes — comentários contendo
  `write-all`, `ssh-keyscan` e `.ssh -- exatamente` foram todos recusados. Cada um foi resolvido
  reescrevendo o comentário, nunca afrouxando a asserção.

## Deviations from Plan

- **Task 3 rodou fora do executor.** O plano previa o executor conduzindo a publicação; o
  executor rodava em worktree e recusou corretamente criar remote ou empurrar, devolvendo o
  checkpoint. As tasks 2 e 3 foram feitas na sessão do orquestrador a pedido do usuário.
- **Uma execução vermelha precedeu a verde, por causa alheia a este plano.** A run
  [33535640912](https://github.com/gustavoktausend/DungeonGuys2/actions/runs/33535640912) teve
  `test` ✓, `pwa` ✓ e `deploy` ✗: o job de deploy do plano 02-11 estava condicionado apenas a
  `github.ref` e `github.event_name`, sem saber que seus quatro secrets vêm do plano 02-04, que
  está adiado. Corrigido em `db067b5` com um gate por variável de repositório
  (`vars.DEPLOY_ENABLED`), e a run seguinte ficou verde com `deploy: skipped`.

## Known Limits

- **`deploy` nunca executou.** Ele é pulado enquanto `DEPLOY_ENABLED` não existir. A metade
  pós-02-04 do gate está argumentada, não medida.
- **Anotação pré-existente:** `actions/checkout@v4`, `setup-node@v4`, `cache@v4` e
  `download-artifact@v4` declaram Node 20, depreciado, e estão sendo forçadas para Node 24.
  É aviso, não falha, e é anterior a esta fase — vale uma atualização de versão de action,
  em separado.
