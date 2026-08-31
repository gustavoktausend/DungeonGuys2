---
phase: 01-formato-e-costuras
plan: 11
subsystem: assets
tags: [asset-spec, json-schema, ajv, validacao, ci, hitbox, recolor, form-09, d-18, d-19, d-20, d-21, d-22, d-23, d-24, d-25, t-1-04, t-1-05]

# Dependency graph
requires:
  - "01-01: tools/README.md (a convenção de scripts Node) e .github/workflows/ci.yml"
  - "01-05: packages/sim/src/defs/enemies.ts como pacote — é de onde ENEMY_DEFS sai"
  - "01-07: npm run sim:build e packages/sim/dist/sim.js — o artefato de onde as hitboxes são lidas em tempo de validação"
provides:
  - "docs/ASSET-SPEC.md: a spec técnica autossuficiente consumida por um agente em OUTRO repositório, sem humano no meio"
  - "tools/assets/schema/manifest.v1.json: o contrato executável, JSON Schema draft 2020-12 versionado no nome do arquivo"
  - "npm run assets:validate: valida public/assets/ — o caminho por onde a arte de verdade chega"
  - "npm run assets:selftest: prova a aceitação (fixtures/good)"
  - "npm run assets:refusal: prova a recusa e QUAIS defeitos foram apontados (critério de sucesso 5 da fase)"
  - "A fronteira arte↔balanceamento escrita em código: a hitbox é lida de ENEMY_DEFS e nunca derivada do manifesto"
affects: [fase-07-integracao-de-arte, repositorio-de-assets]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Duas camadas de validação, e as DUAS sempre rodam: schema (ajv strict + allErrors) e cobertura de hitbox. Um produtor com dois problemas independentes descobre os dois numa ida só, não um por push"
    - "Tolerância declarada POR ENTRADA e limitada em [0.5, 1.25]: a razão medida hitbox÷sprite não é constante (0,75 a 1,06), então nenhuma constante global serve — e o teto impede 'declarar um número enorme' como escape"
    - "O portão da recusa confere QUAIS defeitos foram apontados, não só o código de saída: validate.mjs também sai 1 quando o bundle da sim não existe, então uma inversão ingênua ficaria verde sem provar nada"
    - "additionalProperties: false em todos os níveis — campo com nome errado é recusado, nunca ignorado em silêncio"
    - "Mensagem de erro como produto: 'caminho:/ponteiro/json: mensagem' nomeando o campo e a forma esperada, porque quem lê é um agente automatizado que não pode fazer pergunta de acompanhamento"

key-files:
  created:
    - docs/ASSET-SPEC.md
    - tools/assets/schema/manifest.v1.json
    - tools/assets/validate.mjs
    - tools/assets/refusal-check.mjs
    - tools/assets/README.md
    - tools/assets/fixtures/good/character-mage.manifest.json
    - tools/assets/fixtures/good/enemy-bosses.manifest.json
    - tools/assets/fixtures/bad/character-broken.manifest.json
  modified:
    - package.json
    - .github/workflows/ci.yml

key-decisions:
  - "`recolorRamp` é exigida por `if`/`then` (obrigatória sempre que a folha declarar `characters`), não incondicionalmente: uma folha de tile ou de inimigo não tem roupa para recolorir e seria forçada a inventar uma rampa"
  - "As chaves de `entities` NÃO são enumeradas no schema, de propósito — quem confere é o validador, contra ENEMY_DEFS do bundle. Um schema com a lista copiada envelheceria em silêncio. As de `characters` são enumeradas, porque são um conjunto fechado que o schema pode carregar sem envelhecer"
  - "O script de recusa chama-se `assets:refusal`, e não `assets:selftest:refusal`, para que `grep -c \"assets:selftest\" ci.yml` continue valendo 1 como o critério de aceitação exige, com os dois passos presentes no CI"
  - "Duas fixtures boas em vez de uma: uma folha tem UMA célula de grade, e `necro_lord` (37x53) não cabe na célula 32x48 do personagem. Sem a segunda, o caminho de ACEITAÇÃO da razão maior que 1 não seria exercitado por ninguém"
  - "Os três defeitos da fixture ruim estão documentados em `tools/assets/README.md` e não num campo `_whyBroken`: com `additionalProperties: false`, o campo de comentário seria um QUARTO erro e diluiria a demonstração"
  - "`ajv` importado como `ajv/dist/2020.js` — o build de draft 2020-12; o build padrão não entende o `$schema` do contrato"

patterns-established:
  - "Portão de recusa afirma os defeitos por nome, um marcador por defeito da fixture"
  - "Spec escrita para um leitor externo carrega o apêndice 'a origem de cada número', para que ninguém precise adivinhar depois se um valor foi medido ou chutado"

requirements-completed: [FORM-09]

# Metrics
duration: ~21min
completed: 2026-08-31
---

# Phase 01 Plan 11: Spec técnica de assets e o validador que a torna executável Summary

**A especificação de assets está publicada com toda unidade lógica congelada em número, e a
regra que separa arte de balanceamento virou código: o CI aceita o manifesto bom, recusa o
ruim apontando arquivo e campo, e a hitbox continua morando em `ENEMY_DEFS`.**

Este era o item de maior lead time do marco, porque o consumidor da spec é um agente em outro
repositório que não pode fazer perguntas. `docs/ASSET-SPEC.md` foi escrito para ser suficiente
sozinho: 13 seções, um inventário do que produzir e um apêndice que dá a origem de cada número.

## Tasks

| # | Task | Commit | Resultado |
|---|---|---|---|
| 1 | `docs/ASSET-SPEC.md` — as unidades congeladas | `547abd9` | Spec publicada, verificação automatizada verde, zero itens em aberto |
| 2 | JSON Schema versionado e as fixtures | `e2f8489` | Schema compila em `strict: true`, duas fixtures boas passam, a ruim é recusada |
| 3 | `validate.mjs` — a recusa que roda no CI | `da1ea72` | `assets:selftest`, `assets:refusal` e `assets:validate` verdes e no `ci.yml` |

## A medição, refeita contra `packages/sim/src/defs/`

O objetivo do plano cita três razões medidas. Todas as três reproduzem exatamente a partir do
código, então a tabela da spec é derivação e não cópia. Mas a medição completa achou **um
quarto caso** que o plano não mencionava:

| Entidade | Hitbox | Quadro | Escala | Desenhado | Razão x | Razão y |
|---|---|---|---|---|---|---|
| `skeleton` | 26x26 | 16x16 | 2 | 32x32 | 0,81 | 0,81 |
| `goblin` | 24x24 | 16x16 | 2 | 32x32 | 0,75 | 0,75 |
| `demon` | 26x40 | 16x23 | 2 | 32x46 | 0,81 | 0,87 |
| `brute` | 52x62 | 32x36 | 2 | 64x72 | 0,81 | 0,86 |
| `mimic` | 26x24 | 16x16 | 2 | 32x32 | 0,81 | 0,75 |
| `necromancer` | 26x38 | 16x23 | 2 | 32x46 | 0,81 | 0,83 |
| `swampy` | 24x24 | 16x16 | 2 | 32x32 | 0,75 | 0,75 |
| `zombie_king` | 76x92 | 32x36 | 3 | 96x108 | 0,79 | 0,85 |
| `ogre_warlord` | 76x92 | 32x36 | 3 | 96x108 | 0,79 | 0,85 |
| **`goblin_chief`** | **40x40** | 16x16 | **2,4** | **38,4x38,4** | **1,04** | **1,04** |
| **`necro_lord`** | **38x56** | 16x23 | **2,3** | **36,8x52,9** | **1,03** | **1,06** |

**`goblin_chief` é o segundo caso de hitbox maior que o sprite**, e o mecanismo é o mesmo do
`necro_lord`: um chefe que herda o quadro de um inimigo comum e o amplia por um fator
fracionário (2,4 e 2,3), enquanto a hitbox foi dimensionada à mão. Isso reforça — não
enfraquece — a decisão D-23: dois de onze não é um caso patológico isolado, é um padrão da
família de chefes, e uma tolerância global teria que ser frouxa o bastante para os dois,
deixando `goblin` (0,75) passar com 40% de folga sem ninguém notar.

A derivação: `scale` vem de `ENEMY_DEFS[key].scale || SPRITE_SCALE` (`packages/sim/src/enemies.ts:85`,
`SPRITE_SCALE = 2`), o quadro vem de `ANIMS[def.anim]` em `src/render/sprites.ts:31-45`, e o
desenho é `frame * scale` em `src/render/entities.ts:41-42,297`.

## O que ficou congelado, e onde

| Congelado | Valor | Onde vive agora |
|---|---|---|
| Unidade lógica (D-18) | 1 unidade = 1 pixel; mundo 2400x1600 | `docs/ASSET-SPEC.md` § 2 |
| Personagem (D-19) | `32x48`, escala 1; `48x72` recusado | § 3 |
| Tile (D-20) | `32x32` nativo, 75x50 no mundo; margem 32/64 px vira `PLAY_MARGIN` | § 4 |
| Animações (D-21) | só `idle` e `run`; `hit`/`death`/`attack` fora da v1 | § 5 |
| Contagem de quadros (D-21) | declarada em `frameCount`, não fixa em 4 | § 5 + schema |
| Rampa de recolor (D-22) | obrigatória em toda folha com personagem, ≥2 cores `#RRGGBB`, do escuro ao claro | § 6 + `if`/`then` do schema |
| Hitbox (D-23) | mora em `ENEMY_DEFS`; manifesto declara pivô e visual; tolerância por entrada em `[0.5, 1.25]` | § 7 + `validate.mjs` |
| Formato (D-24, D-25) | PNG-32 sem premultiply, sem perfil de cor, sem entrelaçamento; cópia commitada em `public/assets/` | § 8, § 11 |

## A fronteira arte↔balanceamento, escrita em código

A regra que D-23 pede é a razão de o validador ter duas camadas em vez de uma:

```
hitbox / (spriteWidth * scale)  <=  hitboxTolerance   (por eixo)
```

A hitbox do lado esquerdo é lida de `ENEMY_DEFS`, importado do bundle `packages/sim/dist/sim.js`.
Ela **nunca** sai do manifesto. Consequência que o plano pedia explicitamente e que agora está
garantida por construção: **o `SIM_VERSION` não passa a depender de arquivo de arte.** Entregar
um sprite não fecha temporada de ranking; mexer numa hitbox continua fechando, como deve.

A tolerância ser por entrada não é conveniência — é o que torna `necro_lord` e `goblin_chief`
entregáveis sem tocar em balanceamento. O teto de 1,25 no schema fecha o buraco óbvio: não dá
para declarar tolerância infinita e passar qualquer coisa.

## A prova de que a recusa funciona

Saída real de `node tools/assets/validate.mjs tools/assets/fixtures/bad`, código de saída 1:

```
tools/assets/fixtures/bad/character-broken.manifest.json:/: falta a propriedade obrigatória 'recolorRamp'
tools/assets/fixtures/bad/character-broken.manifest.json:/spriteScale: propriedade desconhecida 'spriteScale' — o formato v1 recusa campo com nome errado em vez de ignorá-lo em silêncio; confira a grafia em docs/ASSET-SPEC.md § 10
tools/assets/fixtures/bad/character-broken.manifest.json:/entities/brute: o sprite desenhado (40x44) não cobre a hitbox de 'brute' (52x62) no eixo x: razão 1.300 > tolerância declarada 0.82
tools/assets/fixtures/bad/character-broken.manifest.json:/entities/brute: o sprite desenhado (40x44) não cobre a hitbox de 'brute' (52x62) no eixo y: razão 1.409 > tolerância declarada 0.87
```

Três defeitos deliberados, quatro linhas (a cobertura é reportada por eixo, porque saber se o
problema é altura ou largura é a diferença entre esticar e redesenhar). O defeito 2 é o mais
significativo: `spriteScale` é justamente o conceito que **saiu** do formato quando o personagem
passou a ser desenhado a escala 1 (D-19), e um campo obsoleto ignorado em silêncio viraria arte
entregue com uma propriedade que nunca chegou ao jogo.

E a aceitação:

```
assets ok: 2 manifesto(s) em tools/assets/fixtures/good, 3 entidade(s) conferida(s) contra ENEMY_DEFS
```

## O modelo de ameaça, endereçado

| Ameaça | Como ficou |
|---|---|
| T-1-04 — manifesto malicioso de PR externo | `ajv` em `{ allErrors: true, strict: true }` + `additionalProperties: false` em todos os níveis, rodando no CI antes de qualquer merge. `grep -cE "eval\|new Function\|require\(m\|import\(m" tools/assets/validate.mjs` = **0** — nada vindo do manifesto é executado, e o único import dinâmico do arquivo aponta para um caminho fixo do próprio repositório que nenhum manifesto influencia |
| T-1-04 — manifesto tentando redefinir hitbox | A hitbox é lida de `ENEMY_DEFS` e o validador só **confere cobertura**. O manifesto não tem campo de hitbox: declarar um é erro de `additionalProperties` |
| T-1-05 — `ajv` no bundle do jogo | `dependencies: {}` intacto (asserido: `node -e "...Object.keys(p.dependencies).length..."` sai 0). `ajv` segue devDependency, importado só de `tools/`, que o Vite não empacota. O cabeçalho de `validate.mjs` explica isso, porque alguém vai perguntar |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Funcionalidade crítica ausente] Segunda fixture boa, `enemy-bosses.manifest.json`**
- **Found during:** Task 2
- **Issue:** Uma folha tem **uma** célula de grade. A fixture `character-mage` usa célula `32x48`, e `necro_lord` (37x53 desenhado) não cabe nela. Com uma fixture só, o caminho de **aceitação** da razão maior que 1 — a propriedade inteira que justifica D-23 — não seria exercitado por teste nenhum.
- **Fix:** `tools/assets/fixtures/good/enemy-bosses.manifest.json`, célula `64x72`, com `brute` (0,81/0,86) e `necro_lord` (1,027/1,057 contra tolerâncias 1,03/1,06). De quebra cobre o caso da folha sem personagens, em que a rampa de recolor não é exigida.
- **Files modified:** `tools/assets/fixtures/good/enemy-bosses.manifest.json`
- **Commit:** `e2f8489`

**2. [Rule 2 - Funcionalidade crítica ausente] `refusal-check.mjs` em vez de inverter o código de saída no workflow**
- **Found during:** Task 3
- **Issue:** O plano pedia "um passo no CI que roda o validador contra `fixtures/bad` e exige que ele falhe". Um `!` invertendo o código de saída é uma **armadilha**: `validate.mjs` também sai 1 quando `packages/sim/dist/sim.js` não existe, então o passo ficaria verde numa máquina onde a sim nunca foi compilada, sem provar absolutamente nada sobre a recusa.
- **Fix:** `tools/assets/refusal-check.mjs` confere `status === 1` **e** que a saída aponta os três defeitos por marcador nomeado. Também respeita `tools/README.md` §2 (o CI chama `npm run <script>`, nunca um caminho de arquivo) e evita depender do shell do runner.
- **Files modified:** `tools/assets/refusal-check.mjs`, `package.json`, `.github/workflows/ci.yml`
- **Commit:** `da1ea72`

**3. [Rule 3 - Bloqueio] `strictRequired` do `ajv` recusou os ramos de `anyOf` e `if`**
- **Found during:** Task 2
- **Issue:** `strict: true` liga `strictRequired`, que exige que toda propriedade listada em `required` esteja declarada em `properties` **do mesmo objeto de schema**. Os ramos `{ "type": "object", "required": ["characters"] }` não compilavam: `Error: strict mode: required property "characters" is not defined at ".../anyOf/0"`.
- **Fix:** cada ramo declara localmente `"properties": { "<chave>": { "type": "object" } }`. As restrições reais continuam nas `properties` do topo; a declaração local só satisfaz o `strictRequired`. Relaxar `strictRequired` seria a saída errada — é justamente esse tipo de checagem que o modo estrito compra.
- **Files modified:** `tools/assets/schema/manifest.v1.json`
- **Commit:** `e2f8489`

**4. [Rule 2 - Funcionalidade crítica ausente] `tools/assets/README.md`**
- **Found during:** Task 2
- **Issue:** O critério de aceitação da Task 2 oferecia documentar os três defeitos "num campo `_whyBroken` **ou** em comentário no `README` de `tools/assets/`". O campo dentro do JSON seria um **quarto** erro sob `additionalProperties: false` e diluiria a demonstração dos três.
- **Fix:** README com a tabela dos três defeitos, a mensagem esperada de cada um, o porquê de `ajv` ser a exceção ao `dependencies: {}`, e o porquê de as fixtures não morarem em `public/assets/`.
- **Files modified:** `tools/assets/README.md`
- **Commit:** `e2f8489`

**5. [Rule 2 - Correção] `npm run assets:validate` também entrou no CI**
- **Found during:** Task 3
- **Issue:** O plano pedia só o `assets:selftest` e o passo de recusa. Mas `docs/ASSET-SPEC.md` § 12 **promete ao agente de arte** que o CI roda `npm run assets:validate` contra `public/assets/` — e uma spec que promete um portão inexistente é pior que uma spec sem portão.
- **Fix:** terceiro passo no `ci.yml`. Hoje o diretório não tem manifesto e o passo é verde por vacuidade (`assets ok: 0 manifesto(s)`); ele existe para já estar lá no dia em que o primeiro lote chegar, sem depender de alguém lembrar.
- **Files modified:** `.github/workflows/ci.yml`
- **Commit:** `da1ea72`

### Contradição de critério de aceitação, resolvida explicitamente

O critério da Task 3 pede `grep -c "assets:selftest" .github/workflows/ci.yml` == **1**, e ao
mesmo tempo pede que o CI contenha o passo de recusa. Nomear o segundo script
`assets:selftest:refusal` — o nome sugerido pelo texto do plano — faria o `grep` contar **2**
linhas e reprovar o critério literal.

**Resolvido satisfazendo a intenção:** o script chama-se **`assets:refusal`**. O `grep` vale 1,
os dois passos estão no CI, e o nome fica mais legível. O comentário do `ci.yml` explica os
três passos por nome.

### Interpretação registrada: `recolorRamp` obrigatória

O critério da Task 2 diz "o schema declara `recolorRamp` como obrigatória". Implementado como
`if`/`then`: **obrigatória sempre que a folha declarar `characters`**, dispensada numa folha só
de inimigos, tiles ou objetos. D-22 fala de personagem ("cada **personagem** declara"), e exigir
uma rampa de roupa de uma folha de tile forçaria o agente de arte a inventar duas cores sem
significado — exatamente o tipo de campo cerimonial que envelhece mal. A propriedade que importa
está provada: a fixture ruim omite a rampa numa folha **com** personagem e é recusada por nome.

## Não feito, de propósito

- **`npm run typecheck:protocol`** (pendência anotada pelo plano 01-06, oferecida como opcional
  a quem tocasse `package.json` e `ci.yml`): **não feito**. O plano 01-10 está editando
  `packages/protocol/**` neste mesmo wave, em outro worktree. Acrescentar um script apontando
  para um `tsconfig.json` que está sendo escrito em paralelo compra conflito de merge e CI
  vermelho por uma razão que não é deste plano. Fica para quem tocar `package.json` depois do
  merge do 01-10.
- **Postura do job de browser preservada.** `continue-on-error: true` em `npm run test:browser`
  intacto, e o cache do Playwright continua **sem** `restore-keys`. Nenhum passo novo faz o
  sucesso do workflow depender do portão cross-engine.
- **O validador não abre o PNG.** `sheet.width`/`height` são declarados, não medidos. Ler o
  cabeçalho IHDR de um PNG é trivial, mas conferir `format`, `premultipliedAlpha`, perfil de cor
  e entrelaçamento de verdade é um decodificador — e um decodificador de imagem processando
  arquivo de PR externo é uma superfície de ataque nova para resolver um problema que a fase 7
  vai ver na primeira renderização. Está escrito na spec § 12 sob "O que o validador NÃO faz".

## Known Stubs

Nenhum stub de código. Um único caso de "verde por vacuidade", deliberado e documentado:
`npm run assets:validate` roda contra `public/assets/`, que hoje não tem nenhum
`*.manifest.json` — a arte chega na fase 7. O passo imprime `assets ok: 0 manifesto(s)` e sai 0.
Está registrado no comentário do `ci.yml` e nesta seção para que ninguém o confunda com um
portão que passou por mérito.

## Verification

| Portão | Resultado |
|---|---|
| `npm test` | **323 passed (28 files)** — o baseline, intacto; este plano não escreve código de simulação |
| `npm run lint` | 0 |
| `npm run build` | 0 |
| `npm run sim:version:verify` | 0 — `sha256:87d695907f281755`, inalterado pelo plano |
| `git diff --quiet tests/golden/` | 0 — nada tocado |
| `npm run assets:selftest` | 0 — `2 manifesto(s), 3 entidade(s) conferida(s)` |
| `npm run assets:refusal` | 0 — `recusa ok: 3 defeitos apontados por campo` |
| `npm run assets:validate` | 0 — `0 manifesto(s) em public/assets` |
| Bundle ausente | mensagem `artefato da simulação ausente — rode \`npm run sim:build\``, exit 1, sem stack trace |
| `grep -c "strict" tools/assets/validate.mjs` | 5 |
| `grep -cE "eval\|new Function\|require\(m\|import\(m" validate.mjs` | 0 |
| `grep -c "assets:selftest" ci.yml` | 1 |
| `grep -riE "\b(TBD\|a definir\|a combinar)\b" docs/ASSET-SPEC.md` | vazio |
| `dependencies` da raiz | `{}` — `ajv` segue devDependency |
| `package-lock.json` | **não modificado** |
| Arquivos de 01-09 / 01-10 | **nenhum tocado** — o diff contra a base tem 10 arquivos, todos deste plano |

## Self-Check: PASSED

Todos os 8 arquivos declarados como criados existem em disco. Os 3 commits de task existem no
log (`547abd9`, `e2f8489`, `da1ea72`), sobre a base `4d09784`. Árvore de trabalho limpa.
