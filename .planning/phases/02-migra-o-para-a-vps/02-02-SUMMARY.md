---
phase: 02-migra-o-para-a-vps
plan: 02
subsystem: infra
tags: [vite, pwa, service-worker, fonts, woff2, self-hosting, vitest, caddy]

# Dependency graph
requires:
  - phase: 01
    provides: "o cliente Vite com `base` de GitHub Pages, o `public/sw.js` de precache manual, e a forma de teste estrutural de tests/purity.test.ts"
provides:
  - "`dist/` servível da raiz de um domínio próprio, sem o subcaminho `/DungeonGuys2/`"
  - "manifesto e ícones com `href` absoluto de raiz, que resolvem certo em qualquer profundidade de URL"
  - "Press Start 2P e Pixelify Sans auto-hospedadas em `public/fonts/`, copiadas verbatim para `dist/fonts/`"
  - "zero requisição a terceiro no caminho de carregamento do jogo"
  - "`tests/build-base.test.ts`: guarda estrutural que reprova quem reintroduzir o subcaminho ou a fonte remota"
affects: [02-03 Caddyfile e file_server, 02-05 fixture de instalação antiga, 02-06 service worker de escopo /, 02-07 ciclo de update do SW]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "teste estrutural sobre a FONTE via `import.meta.glob` raw, com guarda anti-vacuidade por conteúdo"
    - "assets de fonte servidos da própria origem por caminho literal estável, sem hash, para serem precacheáveis"
key-files:
  created:
    - public/fonts/PressStart2P-Regular.woff2
    - public/fonts/PixelifySans-Variable.woff2
    - public/fonts/OFL.txt
    - tests/build-base.test.ts
  modified:
    - vite.config.ts
    - index.html
    - src/main.ts
    - src/ui/screens.ts
    - src/style.css
    - vitest.config.ts

key-decisions:
  - "`public/manifest.json` deliberadamente intocado: `start_url`/`scope` em `\".\"` resolvem para `/` quando servidos de `/manifest.json` (DM-6), e o teste reprova quem 'arrumar'"
  - "`public/sw.js` deliberadamente intocado: é a fixture de instalação antiga que 02-05 congela e 02-06 substitui (P-1)"
  - "`GAME_URL` derivado de `location.origin + import.meta.env.BASE_URL` em vez de literal novo: o domínio nunca entra no repositório (D2-15)"
  - "Só o subset latin de cada família: é a mesma cobertura de glifos que o Google servia para os caracteres que o jogo usa"
  - "Pixelify Sans como arquivo variável único (`wght` 400..700) em vez de quatro estáticos"
  - "`css: true` no vitest.config.ts: sem isso o Vitest zera todo módulo CSS por extensão, `?raw` incluído, e a asserção sobre `@font-face` passaria vazia"

patterns-established:
  - "Guarda anti-vacuidade por CONTEÚDO, não por tipo: `toBeTypeOf('string')` sozinho aceita `''` e deixa o teste passar sem ler nada"
  - "`href`/`url()` absolutos de raiz para todo recurso escrito à mão, já que o Vite só reescreve o que ele mesmo gera"

requirements-completed: [INFRA-01, INFRA-02]

# Metrics
duration: 12min
completed: 2026-08-31
---

# Phase 2 Plan 02: Cliente na raiz do domínio, fontes na própria origem

**`base: '/'` com manifesto e ícones root-absolutos, Press Start 2P e Pixelify Sans auto-hospedadas em `public/fonts/`, e um teste estrutural de 13 casos que reprova a volta do subcaminho do Pages ou da fonte remota.**

## Performance

- **Duration:** ~12 min
- **Started:** 2026-08-31T22:43:00Z
- **Completed:** 2026-08-31T22:55:00Z
- **Tasks:** 2
- **Files modified:** 10 (4 criados, 6 modificados)

## Accomplishments

- O `dist/` produzido agora é servível da raiz de qualquer servidor estático. Nenhum arquivo de
  fonte, config ou markup carrega mais `/DungeonGuys2/` — é a pré-condição física do
  `file_server` do Caddy (02-03), do service worker de escopo `/` (02-06) e da fixture de
  instalação antiga (02-05).
- O jogo carregado não faz **nenhuma** requisição a terceiro. As duas famílias vêm de
  `public/fonts/`, entram em `dist/fonts/` pela cópia verbatim do `public/`, e por consequência
  entrarão no precache derivado de 02-06 sem código extra. É isso que permite ao
  `offline.spec.ts` assertar zero falhas de rede sem filtro por origem (D2-20).
- O link de compartilhamento passou a apontar para o domínio de onde o jogador realmente abriu
  o jogo, e o nome do domínio nunca precisa entrar no repositório (D2-15).
- `tests/build-base.test.ts` fecha a porta: 13 casos que reprovam a reintrodução do subcaminho,
  a remoção do `base: '/'`, o `href` relativo, o "conserto" do manifesto, o domínio cravado no
  share e a fonte de terceiro.

## Task Commits

1. **Task 1: `base: '/'`, caminhos absolutos de raiz e o teste estrutural** — `33518b1` (feat)
2. **Task 2: As duas fontes vêm para a própria origem (D2-20)** — `ea21fa6` (feat)

## Files Created/Modified

- `vite.config.ts` — `base` de `'/DungeonGuys2/'` para `'/'`; o comentário sobre GitHub Pages deu lugar ao fato novo (Caddy `file_server` sobre o symlink `/srv/dg2/current`, D2-06)
- `index.html` — manifesto e os dois ícones com `href` absoluto de raiz, com o motivo em comentário; caíram os dois `preconnect` e o `<link>` de `fonts.googleapis.com`
- `src/main.ts` — só o comentário do bloco PWA, que afirmava um `base` que deixou de existir. A chamada `register(import.meta.env.BASE_URL + 'sw.js')` não mudou
- `src/ui/screens.ts` — `GAME_URL` derivado de `location.origin + import.meta.env.BASE_URL`; os dois usos em `shareWhatsApp`/`shareTelegram` não mudaram
- `src/style.css` — dois blocos `@font-face` acima do `:root`, com `src: url('/fonts/...woff2')` e `font-display: swap`. Os ~40 consumidores de `font-family` estão intactos (a contagem de `var(--pixel-font)` segue em 6)
- `public/fonts/PressStart2P-Regular.woff2` — 12.512 B, subset latin, peso 400, v16
- `public/fonts/PixelifySans-Variable.woff2` — 12.016 B, subset latin, fonte variável eixo `wght` 400..700, v3
- `public/fonts/OFL.txt` — os dois avisos de copyright mais o texto integral da SIL OFL 1.1
- `tests/build-base.test.ts` — 13 casos sobre a fonte do repositório
- `vitest.config.ts` — `css: true`, com o motivo em comentário

## Decisions Made

- **Testar a fonte, não o `dist/`.** Desvio deliberado da letra de `02-VALIDATION.md`, registrado
  em comentário no topo do próprio arquivo de teste: no `ci.yml` o `npm test` roda **antes** do
  `npm run build`, então um teste que globasse `dist/` passaria por vacuidade no CI — o diretório
  simplesmente não existe ainda. A metade de artefato entra em `tools/sw/verify.mjs` no 02-06,
  que roda depois do build.
- **Subset latin apenas.** A API do Google devolve cyrillic, greek e latin-ext além do latin, mas
  o texto do jogo (incluindo o `Ô` de "COPROBÔ" e os acentos das mensagens de share) cabe todo em
  `U+0000-00FF`. Os símbolos da UI (`✦ ⚔ ◆ ★ ☠ 🏆`) já hoje caem no fallback: não estão em
  nenhum dos subsets dessas duas famílias. Nenhuma regressão de cobertura, 24 KB no total.
- **Pixelify Sans variável, um arquivo.** O `METADATA.pb` confirma `PixelifySans[wght].ttf`, e a
  API entrega um `.woff2` com `font-weight: 400 700` — cobre os pesos 400/500/600/700 que o
  `index.html` pedia, num arquivo só.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] O Vitest entregava `src/style.css` como string vazia, e a guarda anti-vacuidade não pegava**

- **Found during:** Task 2 (asserções de `@font-face`)
- **Issue:** `expect(styleCss).toContain("font-family: 'Press Start 2P'")` falhou com
  `expected '' to contain ...`. A causa não é o glob: `import.meta.glob` **encontrava** o arquivo
  (1 chave), mas o conteúdo vinha vazio. O `css: false` padrão do Vitest substitui todo módulo CSS
  por string vazia para pular o transform, e faz isso casando a **extensão** — o que engole o
  `?raw` junto. Provado com sonda: as três formas (`?raw` em glob de diretório, `?raw` em glob de
  arquivo único, `?inline`) retornavam `length 0`; com `css: true`, as três retornam 39.878.
  Pior que a falha: a guarda anti-vacuidade que eu havia escrito usava `toBeTypeOf('string')`, e
  `''` **é** string — então na Task 1 o teste passou verde sem nunca ter lido uma linha de CSS.
- **Fix:** duas coisas. (a) `css: true` no `vitest.config.ts`, com comentário explicando que só
  este teste importa CSS, então o custo é um transform. (b) a guarda anti-vacuidade passou a
  conferir **conteúdo**: um `it.each` com comprimento mínimo por arquivo, que é o que teria pego
  isto de primeira. `node:fs` não era alternativa — não há `@types/node` instalado e o `types` do
  `tsconfig.json` é `["vite/client"]`.
- **Files modified:** `vitest.config.ts`, `tests/build-base.test.ts`
- **Verification:** mutação — com `css: false` de volta, exatamente 2 casos falham
  (`o glob leu src/style.css por inteiro` e `as duas famílias são declaradas localmente`), com a
  mensagem `src/style.css veio vazio ou truncado: expected 0 to be greater than 1000`. Com
  `css: true`, 13/13 verdes. A guarda morde.
- **Committed in:** `ea21fa6`

---

**Total deviations:** 1 auto-fix (Rule 3 - blocking).
**Impact on plan:** `vitest.config.ts` não estava em `files_modified`, mas sem ele a asserção
central da Task 2 é impossível de escrever com honestidade. O achado de tabela é o segundo: a
forma `toBeTypeOf('string')` herdada de `purity.test.ts` é uma guarda anti-vacuidade fraca para
qualquer arquivo que o runner possa stubar. Sem escopo extra.

## Issues Encountered

- **Um critério de aceitação é literalmente inalcançável, e o substantivo passa.** O plano pede
  `npm run build && grep -c 'DungeonGuys2' dist/index.html` → 0. O resultado é **1**, e a única
  ocorrência é `<title>DungeonGuys2 — Pixel Shooter</title>` — o nome do produto, não o
  subcaminho. O mesmo texto amplo demais aparece no bloco `<verification>`. O que importa está
  verificado: `grep -c 'DungeonGuys2/' dist/index.html` → **0**, e nenhum arquivo em todo o
  `dist/` contém o subcaminho. Renomear o título seria mudança de produto não pedida. Se um
  verificador rodar o critério ao pé da letra, vai dar vermelho — está aqui para não virar
  surpresa.
- **A8 (licença OFL) estava por conferir e agora está conferida.** `METADATA.pb` de
  `google/fonts` declara `license: "OFL"` para as duas famílias. O corpo dos dois `OFL.txt` de
  origem é byte a byte idêntico (diferem só no fim de linha), então `public/fonts/OFL.txt` traz
  os dois avisos de copyright e uma cópia do texto da licença — o que a cláusula 2 da própria OFL
  pede. Nenhum pacote npm foi instalado (T-2-SC).

## Threat Model

Os três itens do registro estão mitigados como planejado:

- **T-2-3P** (Information Disclosure) — as duas famílias saíram do caminho de carregamento;
  `grep -c 'fonts.googleapis.com\|fonts.gstatic.com' index.html` → 0, e `dist/index.html` idem.
  A opção (c) do P-7 (precache `no-cors`) continua recusada.
- **T-2-PATH** (Tampering) — `href="/manifest.json"` e duas ocorrências de
  `href="/icons/icon-192.png"`. Os `url()` do `@font-face` são root-absolutos pelo mesmo motivo,
  e neste caso o motivo é mais forte: a folha de estilo é hasheada para dentro de `/assets/`,
  então um caminho relativo resolveria contra aquele diretório. A outra metade (recusar
  `try_files`) é do 02-03.
- **T-2-SC** (Tampering) — os `.woff2` vieram da API oficial, entram no repositório em revisão de
  diff (staged como binário, 12.512 B e 12.016 B, magic `wOF2` conferido), e a licença foi
  verificada e versionada antes da cópia.

## Verification

| Portão | Resultado |
|---|---|
| `npx vitest run tests/build-base.test.ts` | 13/13 verdes |
| `npm test` | 36 arquivos, 410 testes verdes (eram 403 antes do plano) |
| `npx tsc --noEmit` | sai 0 |
| `npm run lint` | sai 0 |
| `npm run build` | sai 0 |
| `grep -rn 'DungeonGuys2/' vite.config.ts index.html src/ public/manifest.json` | nada |
| `grep -rl 'DungeonGuys2/' dist/` | nenhum arquivo |
| `grep -c 'gstatic' dist/index.html` | 0 |
| `ls dist/fonts/*.woff2` | os mesmos dois de `public/fonts/` |
| `git diff --stat public/sw.js public/manifest.json` | vazio — nenhum dos dois foi tocado |

## User Setup Required

None — nenhum serviço externo a configurar. Os `.woff2` já estão versionados; não há passo de
download em build nem em deploy.

## Next Phase Readiness

Pronto para os planos que dependiam desta fatia:

- **02-03 (Caddyfile):** o `file_server` pode apontar para a raiz do `dist/`. Vale reforçar o que
  DM-5 recomenda e o threat model registra: **não** usar `try_files {path} /index.html` — o jogo
  não tem roteamento de cliente, e um 404 honesto é melhor que um `index.html` servido com 200
  numa URL errada, que o service worker então guardaria.
- **02-05 (fixture de instalação antiga):** `public/sw.js` está intocado, byte a byte como estava
  — a fixture pode ser congelada a partir dele com segurança.
- **02-06 (service worker de escopo `/`):** o precache derivado do `dist/` vai alcançar
  `dist/fonts/*.woff2` por caminho literal estável (sem hash) sem código extra. A metade de
  artefato do teste de subcaminho ("nada em `dist/` contém `/DungeonGuys2/`") é para o
  `tools/sw/verify.mjs` deste plano, que roda depois do build.

Sem bloqueadores.

---
*Phase: 02-migra-o-para-a-vps*
*Completed: 2026-08-31*
