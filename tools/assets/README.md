# `tools/assets/` — o formato do manifesto e o validador que o torna executável

Este diretório é a metade executável de [`docs/ASSET-SPEC.md`](../../docs/ASSET-SPEC.md). A
spec explica os números ao agente de arte; o schema e o validador daqui são o que **recusa** um
lote que não os respeite, no CI, antes de qualquer merge.

Segue a convenção de [`tools/README.md`](../README.md): `.mjs`, invocação por script de
`package.json`, `console.error` com prefixo `arquivo:ponteiro: mensagem` e `process.exit(1)`,
uma linha em `stdout` no sucesso.

```
schema/manifest.v1.json   o contrato, versionado no nome do arquivo
validate.mjs              o validador: schema + cobertura de hitbox
refusal-check.mjs         o portão que prova que a recusa funciona
fixtures/good/            manifestos que TÊM que passar
fixtures/bad/             manifestos que TÊM que ser recusados
```

## Comandos

| Comando | O que faz |
| ------- | --------- |
| `npm run assets:validate` | Valida `public/assets/` — é o que roda contra a arte de verdade |
| `npm run assets:selftest` | Valida `fixtures/good/`; tem que sair 0 |
| `npm run assets:refusal` | Roda o validador contra `fixtures/bad/` e **exige** que ele recuse, apontando os três defeitos por nome |

Os três dependem de `packages/sim/dist/sim.js`, de onde as hitboxes são lidas. Rode
`npm run sim:build` antes, ou o validador falha com uma mensagem dizendo exatamente isso.

O `assets:refusal` é um script, e não um `!` invertendo o código de saída no workflow, por dois
motivos. O primeiro é a convenção de [`tools/README.md`](../README.md) §2: o CI chama
`npm run <script>`, nunca um caminho de arquivo. O segundo é o que importa: **um "saiu 1?" nu é
uma armadilha.** O `validate.mjs` também sai 1 quando `packages/sim/dist/sim.js` não existe,
então uma inversão ingênua ficaria verde numa máquina onde a simulação nunca foi compilada, sem
provar nada. O `refusal-check.mjs` confere **quais** defeitos foram apontados, um marcador por
defeito da fixture.

## Por que `ajv` é a exceção ao `dependencies: {}`

O `package.json` da raiz mantém `dependencies` vazio — é invariante do projeto: o jogo
publicado não carrega dependência de runtime. `ajv` entra como **devDependency** e é importado
**só** por `validate.mjs`, que vive em `tools/` e nunca é empacotado pelo Vite nem chega ao
navegador. Escrever um validador de JSON Schema à mão custaria centenas de linhas e erraria
justamente nos cantos que o `strict: true` do `ajv` existe para pegar.

## Por que o schema é `v1` no nome

Acrescentar `hit`, `death` ou `attack` depois é criar `manifest.v2.json` **ao lado** deste, não
editar este. Um manifesto v1 continua válido quando o v2 existir, e o campo `schemaVersion` do
manifesto diz qual contrato aplicar. É o que torna "acrescentar animação depois" um append e
não uma migração.

## As fixtures

### `fixtures/good/`

Dois lotes, ambos válidos. São ao mesmo tempo teste de aceitação e **exemplo copiável** para o
agente de arte — `docs/ASSET-SPEC.md` § 10 aponta para o primeiro.

- **`character-mage.manifest.json`** — célula `32x48`, o caso comum: um personagem com rampa de
  recolor e um inimigo de razão normal (`skeleton`, hitbox 26x26 contra 32x32 desenhado, razão
  0,8125 dentro da tolerância declarada de 0,82).
- **`enemy-bosses.manifest.json`** — célula `64x72`, e existe por um motivo específico: prova
  que a regra de cobertura **aceita hitbox maior que o sprite**. `necro_lord` tem hitbox
  38x56 contra 37x53 desenhado, razões 1,027 e 1,057 — acima de 1. Se a regra fosse igualdade,
  ou se a tolerância fosse global, este lote seria impossível de entregar sem mexer em
  balanceamento, que é exatamente o que a spec proíbe. Ele também demonstra o caso da folha sem
  personagens, em que a rampa de recolor não é exigida.

### `fixtures/bad/character-broken.manifest.json`

Um único arquivo com **três defeitos deliberados e distintos**, para que a mensagem de recusa
seja exercitada em três eixos diferentes em vez de um só. Nenhum deles é acidental — se algum
dia este arquivo passar, o validador regrediu.

| # | Defeito | Como o validador tem que pegar | Mensagem esperada |
| - | ------- | ------------------------------ | ----------------- |
| 1 | Falta `recolorRamp`, que é obrigatória sempre que a folha declara `characters` (D-22) | `if`/`then` do schema | `/: falta a propriedade obrigatória 'recolorRamp'` |
| 2 | Campo `spriteScale` no topo — o conceito de escala global **saiu** do formato quando o personagem passou a ser desenhado a escala 1 (D-19), e um campo obsoleto tem que ser recusado, não ignorado | `additionalProperties: false` | `/spriteScale: propriedade desconhecida 'spriteScale'` |
| 3 | `brute` declara sprite 40x44, que não cobre a hitbox 52x62 de `ENEMY_DEFS` dentro da tolerância declarada (razões 1,300 e 1,409 contra 0,82 e 0,87) | Segunda camada do validador, contra `packages/sim/dist/sim.js` | `/entities/brute: o sprite desenhado ... nao cobre a hitbox ...` |

O defeito 3 falha nos **dois** eixos, então a recusa produz quatro linhas para três defeitos.
Isso é intencional: reportar por eixo diz ao agente de arte se ele precisa alargar, esticar ou
os dois.

Por que os defeitos estão documentados aqui e não num campo `_whyBroken` dentro do JSON: o
schema usa `additionalProperties: false`, então um campo de comentário no manifesto seria um
**quarto** erro e diluiria a demonstração dos três.

### Por que as fixtures não moram em `public/assets/`

`public/assets/` é produção e `npm run assets:validate` valida tudo que estiver lá. Um manifesto
inválido commitado naquele diretório deixaria o CI vermelho para sempre, para todo mundo.
