# Especificação técnica de assets — DungeonGuys2 (v1)

**Para quem este documento é escrito:** o agente (ou a pessoa) que produz a arte, em **outro
repositório**, sem acesso ao código do jogo e sem ninguém para perguntar. Tudo o que você
precisa saber para entregar um spritesheet aceito está aqui, com valor numérico. Se alguma
frase deste documento exigir que você abra o código do jogo para ser entendida, isso é um
defeito da spec — reporte-o no PR.

**Versão do formato:** `v1`. O contrato é o JSON Schema
`tools/assets/schema/manifest.v1.json`, que mora no repositório do jogo e é a autoridade
executável desta spec. Onde este texto e o schema discordarem, **o schema vence** e o texto é
que está errado.

**Estado das unidades:** tudo que este documento chama de "congelado" está congelado. As
decisões D-18 a D-25 do marco 1 fecharam cada número abaixo e eles não se movem depois. Não
há nenhum valor em aberto nesta spec — se você achar que há, é bug.

---

## 1. Entrega em cinco linhas

1. Você produz um **PNG-32 sem premultiply** (spritesheet) e um **manifesto JSON** ao lado dele.
2. Os dois arquivos vão **commitados** em `public/assets/` do repositório do jogo, por PR.
3. O CI do jogo roda `npm run assets:validate` e aceita ou recusa, apontando arquivo e campo.
4. Cada spritesheet é um **lote independente**: um lote recusado não bloqueia os outros.
5. Nada além de PNG e JSON é entregue. Sem submódulo, sem pacote publicado, sem script.

---

## 2. A unidade lógica: 1 unidade = 1 pixel (D-18)

**Congelado: uma unidade de mundo do jogo é exatamente um pixel renderizado.**

O mundo tem `2400 x 1600` unidades, logo `2400 x 1600` pixels de piso. Não há fator de
conversão em lugar nenhum: se a simulação diz que um item é atraído a 100 unidades de
distância, isso são 100 pixels na tela; se diz que uma hitbox tem 26 de largura, são 26 pixels.

Por que isso importa para você: **você desenha diretamente na unidade em que o jogo pensa.**
Não existe "resolução de referência" nem escala global escondida. Um sprite de 32 pixels de
largura ocupa 32 unidades de mundo.

Por que isso está congelado: o piso do mundo é pré-renderizado inteiro em memória e ocupa
cerca de 15 MB nessas dimensões. O custo cresce com o quadrado da unidade — dobrar a densidade
para "2 pixels por unidade" quadruplicaria esse número. A alternativa (piso em pedaços
carregados sob demanda) foi descartada nesta versão. A porta continua aberta para o futuro,
mas **não** para a v1.

O mundo **não** muda de tamanho: `2400 x 1600` continua sendo `2400 x 1600`.

### A área jogável

A área em que os personagens podem andar é menor que o mundo, por uma margem de **32 pixels
nas laterais** e **64 pixels em cima e embaixo** — ou seja, `2336 x 1472` úteis. Essa margem é
onde as paredes são desenhadas.

Essa margem passa a ser uma constante própria do jogo (`PLAY_MARGIN`) em vez de ser derivada do
tamanho do tile. Isso é uma nota para quem lê o código do jogo, e a consequência para você é a
que interessa: **mudar o tamanho do tile de desenho não move as paredes**, então o tamanho do
tile é puramente uma decisão de arte.

---

## 3. Personagem: 32x48 px, desenhado a escala 1 (D-19)

**Congelado: todo personagem jogável é desenhado num quadro de `32x48` pixels, e é desenhado
na tela a escala 1 — sem ampliação, sem interpolação, um pixel do arquivo é um pixel da tela.**

Isto substitui o que existe hoje. A tabela abaixo é a medição do estado atual, para você
entender o que está mudando:

| Classe      | Quadro atual | Escala atual | Desenhado hoje | Quadro novo | Escala nova | Desenhado depois |
| ----------- | ------------ | ------------ | -------------- | ----------- | ----------- | ---------------- |
| `mage`      | 16x28        | 2            | 32x56          | 32x48       | 1           | 32x48            |
| `archer`    | 16x28        | 2            | 32x56          | 32x48       | 1           | 32x48            |
| `warrior`   | 16x28        | 2            | 32x56          | 32x48       | 1           | 32x48            |
| `ninja`     | 16x23        | 2            | 32x46          | 32x48       | 1           | 32x48            |
| `priestess` | 16x16        | 2            | 32x32          | 32x48       | 1           | 32x48            |
| `witch`     | 16x28        | 2            | 32x56          | 32x48       | 1           | 32x48            |
| `coprobo`   | 16x24        | 2            | 32x48          | 32x48       | 1           | 32x48            |

Leia a coluna "Desenhado hoje" contra "Desenhado depois": **o personagem ocupa praticamente o
mesmo espaço na tela, com quatro vezes o número de pixels.** É essa a troca. Enquadramento,
campo de visão e sensação de escala ficam idênticos aos de hoje; só o detalhe aumenta.
(`coprobo` já desenha exatamente `32x48` hoje — ele é a prova de que o alvo cabe.)

### A opção de 48x72 foi recusada

Resoluções maiores por personagem foram consideradas e **descartadas**. Um personagem de
`48x72` ocuparia 1,5 vez mais tela em cada eixo, o que encolhe o campo de visão efetivo em um
mundo cujo tamanho está congelado. O jogo é cooperativo para até quatro pessoas, e manter os
quatro visíveis é um problema que o projeto já precisa resolver; reduzir o campo de visão o
agravaria. `32x48` é o teto.

### O conceito de "escala de sprite" deixa de existir

Hoje o código do jogo tem um multiplicador global de desenho (o valor 2 da tabela acima). Com a
arte nova, ele sai do código como conceito: **o personagem é desenhado a escala 1**. Inimigos
grandes continuam podendo declarar uma escala própria no manifesto (§ 7), mas ela é uma
propriedade daquela entrada, não uma constante global.

Não escreva um campo `spriteScale` no manifesto. Ele não existe no formato v1 e o validador o
recusa explicitamente.

---

## 4. Tile: 32x32 nativo (D-20)

**Congelado: o tile de desenho é `32x32` pixels nativos. O mundo tem 75 x 50 tiles.**

`2400 / 32 = 75` e `1600 / 32 = 50`, ambos exatos. Essa é a razão inteira de o número ser 32:

| Tile candidato | `2400 / tile` | `1600 / tile` | Veredito |
| -------------- | ------------- | ------------- | -------- |
| 16             | 150           | 100           | exato, mas é a resolução antiga (metade do detalhe alvo) |
| **32**         | **75**        | **50**        | **escolhido** — exato nos dois eixos e casa com a densidade de `32x48` do personagem |
| 48             | 50            | 33,33…        | recusado — não divide a altura |
| 64             | 37,5          | 25            | recusado — não divide a largura |

Os tiles são **nativos** em `32x32`: você desenha 32x32 pixels de verdade, não 16x16
ampliados. Como a escala de desenho é 1, o que você desenha é o que aparece.

Tiles cobrem piso, paredes e as bordas entre eles. Eles ladrilham sem costura visível — o
pixel da borda direita de um tile encosta no pixel da borda esquerda do vizinho sem emenda,
sem sombra pendurada e sem meia-transparência de anti-aliasing.

---

## 5. Animações da v1: só `idle` e `run` (D-21)

**Congelado: cada personagem e cada inimigo tem exatamente duas animações, `idle` e `run`.**

- `idle` — parado.
- `run` — em movimento.

O jogo alterna entre as duas com uma única condição booleana ("está se movendo?"). Não há
direções separadas: o personagem é **espelhado horizontalmente** pelo motor quando olha para a
esquerda. **Desenhe todos os quadros virados para a direita.**

### O que está fora da v1 e por quê

`hit`, `death` e `attack` **não** fazem parte desta especificação. Não os produza para a v1.

- **Acerto** é feito pelo motor com um filtro de cor aplicado sobre o quadro atual (um clarão
  branco). Não precisa de arte.
- **Morte** é feita pelo motor com um desvanecimento. Não precisa de arte.
- **Ataque** é desenhado pelo motor como um arco de efeito separado, mais a arma segurada, que
  é um sprite à parte girado pelo motor.

Isto não fecha a porta: acrescentar `hit`, `death` ou `attack` depois é **acrescentar chaves
num schema versionado**, não migrar formato. Um manifesto v1 continua válido quando o v2
existir. Por isso a v1 pede o mínimo — o mínimo é entregável agora e não custa retrabalho
depois.

### A contagem de quadros é sua, e vai no manifesto

**A contagem de quadros de cada animação é declarada no manifesto, e não é fixa.**

Hoje o código do jogo tem o número 4 escrito à mão no relógio de animação. Um dos motivos de o
manifesto existir é justamente libertar esse número. Você declara `frameCount` por animação:
`idle` pode ter 2 quadros e `run` pode ter 6, ou o contrário, ou os dois 4. O motor lê o
manifesto.

Restrições reais, e só elas:

- `frameCount` é um inteiro `>= 1`.
- Os quadros de uma animação ficam **em sequência horizontal**, na mesma linha da folha,
  começando na coluna declarada.
- Cada animação declara a duração de um quadro em milissegundos (`frameDurationMs`), inteiro
  `>= 1`. O valor usado hoje é 140 ms por quadro; use-o como ponto de partida.

---

## 6. Rampa de recolor: obrigatória (D-22)

**Congelado: todo manifesto de personagem declara quais cores da paleta formam a rampa de
roupa. O validador recusa quem não declarar.**

O jogo troca a cor da roupa de cada jogador em tempo de execução, para que quatro amigos na
mesma sala se distingam. Ele faz isso substituindo **cores exatas** no spritesheet: percorre os
pixels da região do personagem e, para cada pixel cuja cor bate exatamente com uma cor da
rampa, escreve a cor escolhida pelo jogador — preservando a proporção de luminância entre os
tons da rampa, para a sombra continuar sendo sombra.

Três consequências que você precisa respeitar:

1. **As cores da rampa têm que ser exatas e literais.** Nada de gradiente, de dithering
   entre dois tons da rampa ou de anti-aliasing que crie tons intermediários **na roupa**. Um
   pixel com cor "quase" igual à da rampa não é recolorido e fica com a cor errada quando o
   jogador escolher outra.
2. **A rampa não pode reaparecer fora da roupa.** Se a cor da rampa também for usada na pele,
   no cabelo ou no cenário dentro da mesma região, ela será recolorida junto. Reserve as cores
   da rampa exclusivamente para a peça de roupa.
3. **A ordem importa:** declare a rampa do **tom mais escuro para o mais claro**. O motor usa a
   razão de luminância entre o primeiro e o último para reconstruir a sombra.

A paleta do resto do personagem é **livre**: pele, cabelo, arma, contorno, o que você quiser.
Só a rampa é contratada.

Formato no manifesto: `recolorRamp` é um objeto com

- `region` — o retângulo `[x, y, w, h]` da folha onde a substituição pode acontecer (todos os
  quadros do personagem cabem dentro dele);
- `colors` — um array de **2 ou mais** cores em hexadecimal `#RRGGBB` maiúsculo, ordenado do
  mais escuro para o mais claro.

Duas cores é o mínimo (é o que o jogo usa hoje: um tom base e sua sombra). Mais de duas é
permitido e recomendado se a arte nova tiver mais degraus na roupa.

### As rampas em uso hoje, para referência

Estes são os pares que o jogo usa no spritesheet atual. **Não** copie estas cores para a arte
nova — elas estão aqui só para mostrar o que "duas cores exatas, escura e clara" significa na
prática.

| Classe      | Escura    | Clara     |
| ----------- | --------- | --------- |
| `mage`      | `#5956BD` | `#5698CC` |
| `archer`    | `#3D734F` | `#4BA747` |
| `warrior`   | `#417089` | `#72D6CE` |
| `ninja`     | `#314152` | `#3D734F` |
| `priestess` | `#5698CC` | `#CAE6F5` |
| `witch`     | `#5956BD` | `#5698CC` |
| `coprobo`   | `#484646` | `#918D8D` |

---

## 7. Pivô, hitbox e a regra de cobertura (D-23)

Esta é a seção mais importante da spec, porque é a fronteira entre arte e balanceamento.

**Congelado: a hitbox é código de simulação e vive no repositório do jogo. O manifesto NÃO
declara hitbox e não pode alterá-la.**

O manifesto declara **pivô** e **dimensões visuais**. O validador confere que o sprite que você
entregou **cobre** a hitbox que o jogo já tem. Se não cobrir, o lote é recusado — e a correção
é redesenhar o sprite, nunca mexer no número da hitbox.

Por que a regra é essa: a hitbox é o que decide se um tiro acerta, e portanto é balanceamento.
Ela é versionada junto com a simulação (o jogo carrega um identificador de versão da simulação
derivado do código; mudar uma hitbox muda esse identificador e encerra a temporada de ranking).
Se um arquivo de arte pudesse mudar a hitbox, entregar um sprite passaria a invalidar rankings.
Por isso a arte não toca em balanceamento, e por isso o identificador de versão da simulação
**não** depende de nenhum arquivo de arte.

### Pivô

`pivot` é o ponto do quadro que o motor coloca na posição da entidade no mundo. Ele é dado em
pixels a partir do **canto superior esquerdo do quadro**.

O motor desenha o quadro **centrado** na posição da entidade. Para um quadro de `32x48`, isso
significa `pivot = { "x": 16, "y": 24 }` — o centro geométrico. Use o centro geométrico salvo
motivo explícito; se o seu personagem tiver um chapéu alto que desloca a massa visual, o pivô é
onde você compensa isso, e o valor declarado é o que o motor obedece.

### Dimensões visuais e a regra de cobertura

Cada entrada do mapa `entities` declara:

- `spriteWidth`, `spriteHeight` — as dimensões **nativas** do quadro daquela entidade na folha;
- `scale` — o fator de desenho daquela entidade (1 é o padrão; inimigos grandes podem usar
  mais);
- `hitboxTolerance` — `{ "x": …, "y": … }`, a razão **máxima** admitida entre a hitbox e o
  sprite desenhado, por eixo.

A conta que o validador faz, por eixo:

```
desenhado_x = spriteWidth  * scale
desenhado_y = spriteHeight * scale

hitbox_x / desenhado_x  <=  hitboxTolerance.x
hitbox_y / desenhado_y  <=  hitboxTolerance.y
```

Em palavras: **o sprite desenhado tem que ser grande o bastante para a hitbox caber dentro
dele, com a folga que aquela entrada declarou.** Um sprite pequeno demais para a sua hitbox é
recusado, porque produziria o pior bug possível de sentir e o mais difícil de reportar — levar
dano de um tiro que passou visivelmente ao lado.

A tolerância é limitada pelo schema ao intervalo `[0.5, 1.25]`. Não existe "tolerância
infinita": declarar um número fora dessa faixa é recusado pelo schema, então a folga é sempre
um valor pequeno, explícito e revisável no diff do PR.

### Por que a tolerância é por entrada, e não uma constante

Porque a relação medida **não é constante**. A tabela abaixo é a medição completa do jogo como
ele está hoje: hitbox de cada inimigo contra o tamanho em que ele é efetivamente desenhado.

| Entidade       | Hitbox (w x h) | Quadro | Escala | Desenhado (w x h) | Razão x | Razão y |
| -------------- | -------------- | ------ | ------ | ----------------- | ------- | ------- |
| `skeleton`     | 26 x 26        | 16x16  | 2      | 32 x 32           | 0,81    | 0,81    |
| `goblin`       | 24 x 24        | 16x16  | 2      | 32 x 32           | 0,75    | 0,75    |
| `demon`        | 26 x 40        | 16x23  | 2      | 32 x 46           | 0,81    | 0,87    |
| `brute`        | 52 x 62        | 32x36  | 2      | 64 x 72           | 0,81    | 0,86    |
| `mimic`        | 26 x 24        | 16x16  | 2      | 32 x 32           | 0,81    | 0,75    |
| `necromancer`  | 26 x 38        | 16x23  | 2      | 32 x 46           | 0,81    | 0,83    |
| `swampy`       | 24 x 24        | 16x16  | 2      | 32 x 32           | 0,75    | 0,75    |
| `zombie_king`  | 76 x 92        | 32x36  | 3      | 96 x 108          | 0,79    | 0,85    |
| `ogre_warlord` | 76 x 92        | 32x36  | 3      | 96 x 108          | 0,79    | 0,85    |
| `goblin_chief` | 40 x 40        | 16x16  | 2,4    | 38,4 x 38,4       | **1,04**| **1,04**|
| `necro_lord`   | 38 x 56        | 16x23  | 2,3    | 36,8 x 52,9       | **1,03**| **1,06**|

Olhe as duas últimas linhas. **`goblin_chief` e `necro_lord` têm hitbox MAIOR que o sprite
desenhado.** São chefes que herdam o quadro de um inimigo comum e o ampliam por um fator
fracionário, enquanto a hitbox foi dimensionada à mão; o resultado é uma razão acima de 1.

Se a regra fosse "hitbox igual ao sprite", esses dois seriam impossíveis de entregar sem mexer
em balanceamento — que é exatamente o que esta spec proíbe. Se a regra fosse uma tolerância
global, ela teria que ser frouxa o bastante para caber 1,06, e aí `goblin` (0,75) passaria com
uma folga de 40% sem ninguém notar.

Por isso a tolerância é **declarada por entrada**: cada entidade carrega o seu número, o número
aparece no diff do PR, e apertá-lo ou afrouxá-lo é uma decisão visível.

Ao produzir a arte nova, use a coluna "Desenhado" como alvo de tamanho — é o que preserva a
sensação de escala — e declare a tolerância a partir da razão real que a sua arte produzir,
arredondada para cima na segunda casa.

---

## 8. Formato de arquivo

**Congelado: PNG, 32 bits (RGBA, 8 bits por canal), com alfa NÃO premultiplicado.**

- **PNG-32, sem `premultiply`.** O canal alfa é armazenado separado, não pré-multiplicado nos
  canais de cor. Ferramentas que exportam alfa premultiplicado produzem halos escuros nas
  bordas quando o navegador desenha o sprite; o jogo desenha via `canvas`, que espera alfa
  reto. Se a sua ferramenta oferecer a opção, ela tem que estar **desligada**.
- **Sem paleta indexada (PNG-8).** A rampa de recolor depende de comparação de cor exata em
  RGBA; um PNG indexado atravessa uma conversão a mais antes de chegar ao `canvas`.
- **Sem perfil de cor embutido** (nada de `iCCP`, `gAMA` ou `cHRM`). Um perfil embutido faz
  navegadores diferentes decodificarem cores diferentes, e a rampa de recolor compara cores
  byte a byte. Cor gerenciada quebra o recolor **silenciosamente**, num navegador só.
- **Sem entrelaçamento** (nada de Adam7).
- **Alfa binário nos contornos.** Use alfa 0 ou 255 nas silhuetas. Meia-transparência é
  permitida dentro do sprite (vidro, brilho), mas não na borda: a borda semitransparente
  contra o piso escuro produz franjas.
- **Fundo transparente**, nunca uma cor de chroma.
- **Sem espaço morto entre quadros.** Os quadros ficam colados numa grade regular. O motor
  recorta pelo tamanho de quadro declarado; qualquer espaçamento tem que ser zero.

O manifesto declara explicitamente `"format": "png32"` e `"premultipliedAlpha": false`. Os dois
campos são obrigatórios e os dois só aceitam esses valores na v1 — eles existem para que a
recusa seja explícita se um dia outro formato aparecer, não para dar escolha.

---

## 9. Nomenclatura

Um **lote** é um par de arquivos: um PNG e o manifesto que o descreve.

```
public/assets/<lote>.png
public/assets/<lote>.manifest.json
```

O nome do lote usa `kebab-case`, apenas `a-z`, `0-9` e `-`, e obedece ao padrão:

```
<lote> ::= <familia> "-" <nome>
<familia> ::= "character" | "enemy" | "tile" | "prop"
```

Exemplos válidos: `character-mage`, `enemy-undead`, `tile-dungeon`, `prop-chest`.

O campo `sheet.file` do manifesto repete o nome do PNG e o validador confere que ele bate com o
nome do próprio manifesto: `character-mage.manifest.json` tem que declarar
`"file": "character-mage.png"`. Isso existe para que renomear um lote não deixe um manifesto
apontando para a folha errada.

### As chaves que ligam a arte ao jogo

Dentro do manifesto há dois mapas, e **as chaves dos dois são fixadas pelo código do jogo** —
você não inventa nomes.

- `characters` — chaves permitidas, e são exatamente estas sete:
  `mage`, `archer`, `warrior`, `ninja`, `priestess`, `witch`, `coprobo`.
  O schema enumera essa lista, então um erro de digitação é recusado na hora.

- `entities` — chaves permitidas, e são exatamente estas onze:
  `skeleton`, `goblin`, `demon`, `brute`, `mimic`, `necromancer`, `swampy`, `zombie_king`,
  `ogre_warlord`, `goblin_chief`, `necro_lord`.
  Estas são as chaves da tabela de inimigos da simulação. O validador confere cada uma contra o
  código do jogo e recusa nominalmente qualquer chave que não exista lá.

Um manifesto declara `characters`, ou `entities`, ou os dois — mas pelo menos um dos dois, e
não vazio. Um manifesto que não descreve nada é recusado.

---

## 10. O manifesto, campo a campo

### A grade

Uma folha tem **uma** grade: uma célula de `frameWidth` por `frameHeight`, e todos os assuntos
da folha usam essa célula e a mesma contagem de quadros. Assuntos com tamanho de célula ou
contagem de quadros diferentes vão em **folhas diferentes** — e como os lotes são
independentes, isso não custa nada além de mais um par de arquivos.

Cada assunto (personagem ou inimigo) declara a linha da grade onde ele começa, em `row`. As
linhas declaradas em `animations` são **relativas** à linha do assunto:

```
linha absoluta de uma tira  =  <assunto>.row  +  animations.<nome>.row
```

Com `animations.idle.row = 0` e `animations.run.row = 1`, um assunto em `row: 0` ocupa as
linhas 0 e 1, e o assunto seguinte começa em `row: 2`.

### Exemplo completo

Este é um manifesto completo e válido. Ele é o mesmo arquivo que o repositório do jogo mantém
como fixture de aceitação, em `tools/assets/fixtures/good/character-mage.manifest.json` —
copie-o e apague o que não se aplicar ao seu lote.

```json
{
  "$schema": "../../schema/manifest.v1.json",
  "schemaVersion": 1,
  "sheet": {
    "file": "character-mage.png",
    "width": 192,
    "height": 192,
    "format": "png32",
    "premultipliedAlpha": false
  },
  "frameWidth": 32,
  "frameHeight": 48,
  "pivot": { "x": 16, "y": 24 },
  "animations": {
    "idle": { "row": 0, "column": 0, "frameCount": 4, "frameDurationMs": 140 },
    "run":  { "row": 1, "column": 0, "frameCount": 6, "frameDurationMs": 140 }
  },
  "recolorRamp": {
    "region": [0, 0, 192, 96],
    "colors": ["#3A3A7A", "#5956BD", "#5698CC"]
  },
  "characters": {
    "mage": { "row": 0 }
  },
  "entities": {
    "skeleton": {
      "row": 2, "column": 0,
      "spriteWidth": 32, "spriteHeight": 32, "scale": 1,
      "hitboxTolerance": { "x": 0.82, "y": 0.82 }
    }
  }
}
```

O lote vizinho `tools/assets/fixtures/good/enemy-bosses.manifest.json` é o segundo exemplo, e
existe por um motivo: ele é uma folha **sem personagens** (logo, sem rampa de recolor) e contém
`necro_lord`, cuja hitbox é maior que o sprite desenhado. Se o seu lote tiver alguma dessas duas
características, é dele que você deve partir.

| Campo | Obrigatório | Significado |
| ----- | ----------- | ----------- |
| `$schema` | não | Caminho para o schema, para o seu editor completar e validar enquanto você escreve. Ignorado pelo validador. |
| `schemaVersion` | **sim** | Inteiro. Na v1 só o valor `1` é aceito. |
| `sheet.file` | **sim** | Nome do PNG, no mesmo diretório do manifesto. Tem que bater com o nome do manifesto. |
| `sheet.width`, `sheet.height` | **sim** | Dimensões do PNG em pixels, inteiros `>= 1`. |
| `sheet.format` | **sim** | Só `"png32"`. |
| `sheet.premultipliedAlpha` | **sim** | Só `false`. |
| `frameWidth`, `frameHeight` | **sim** | Tamanho da célula da grade, em pixels, inteiros `>= 1`. Para personagens: `32` e `48`. |
| `pivot.x`, `pivot.y` | **sim** | Ponto de ancoragem dentro da célula, em pixels a partir do canto superior esquerdo. Inteiros `>= 0`. |
| `animations.idle`, `animations.run` | **sim** | As duas animações da v1. Ambas obrigatórias, e nenhuma outra chave é aceita. |
| `animations.*.row` | **sim** | Linha da grade **relativa à linha do assunto**, inteiro `>= 0`. |
| `animations.*.column` | **sim** | Coluna da grade do primeiro quadro, inteiro `>= 0`. |
| `animations.*.frameCount` | **sim** | Número de quadros, inteiro `>= 1`. **Livre** — não é fixo em 4. |
| `animations.*.frameDurationMs` | **sim** | Duração de cada quadro em milissegundos, inteiro `>= 1`. Referência atual: `140`. |
| `recolorRamp` | **se houver `characters`** | Obrigatória em toda folha que desenhe personagem; dispensada numa folha só de inimigos, tile ou objeto. |
| `recolorRamp.region` | **sim**, se houver `recolorRamp` | `[x, y, w, h]` em pixels, o retângulo da folha onde a troca de cor acontece. |
| `recolorRamp.colors` | **sim**, se houver `recolorRamp` | 2 ou mais cores `#RRGGBB` maiúsculas, do tom mais escuro ao mais claro, sem repetição. |
| `characters` | ver § 9 | Mapa das classes desenhadas nesta folha. Cada entrada declara ao menos `row`. |
| `entities` | ver § 9 | Mapa dos inimigos desenhados nesta folha, com `row`, `column`, as dimensões visuais, `scale` e a tolerância de hitbox. |

Pelo menos um entre `characters` e `entities` tem que existir e não pode estar vazio: um
manifesto que não descreve nada é recusado.

Qualquer chave fora dessa lista é **recusada**, em qualquer nível. Isso é deliberado: um campo
com nome errado que fosse ignorado em silêncio viraria arte entregue com uma propriedade que
nunca chegou ao jogo, e o sintoma apareceria semanas depois como "a animação está estranha".

---

## 11. Entrega: cópia commitada em `public/assets/` (D-25)

**Congelado: os arquivos vão commitados no repositório do jogo, por PR. Sem submódulo, sem
pacote publicado, sem download em tempo de build.**

O motivo é que o build do jogo precisa ser **offline e reproduzível**. Duas coisas dependem
disso: o identificador de versão da simulação, que é um hash de artefato e não pode variar
entre duas máquinas; e o cache do aplicativo instalável, que pré-carrega os arquivos por
caminho fixo. Um submódulo ou um pacote baixado em tempo de build introduziria uma rede no
caminho e um artefato que muda sem o commit mudar.

O fluxo é:

1. Você produz `<lote>.png` e `<lote>.manifest.json`.
2. Abre um PR no repositório do jogo colocando os dois em `public/assets/`.
3. O CI roda o validador. Se recusar, a mensagem diz o arquivo e o campo — corrija e empurre de
   novo.
4. Aprovado e mesclado, a arte está no jogo.

**Lotes são independentes.** O validador reporta todos os erros de todos os lotes numa rodada
só, mas um lote recusado só bloqueia a si mesmo — você não precisa esperar que todos os
spritesheets fiquem prontos para entregar o primeiro.

Não coloque manifesto de exemplo, rascunho ou teste em `public/assets/`. Aquele diretório é
produção e o CI valida tudo que estiver lá; um arquivo quebrado deixado ali deixa o CI vermelho
para todo mundo. Exemplos vivem em `tools/assets/fixtures/`.

---

## 12. Como saber que passou

No repositório do jogo, com as dependências instaladas (`npm ci`) e a simulação compilada:

```bash
npm run sim:build      # gera o artefato de onde as hitboxes são lidas
npm run assets:validate # valida todo *.manifest.json de public/assets/
```

Para validar um diretório específico:

```bash
node tools/assets/validate.mjs caminho/do/diretorio
```

### Sucesso

Uma linha em `stdout`, código de saída **0**:

```
assets ok: 3 manifestos, 11 entidades conferidas
```

### Recusa

Uma linha por erro em `stderr`, no formato `arquivo<ponteiro JSON>: mensagem`, e código de
saída **1**. O ponteiro localiza o campo exato dentro do JSON:

```
character-broken.manifest.json:/: falta a propriedade obrigatória 'recolorRamp'
character-broken.manifest.json:/spriteScale: propriedade desconhecida 'spriteScale'
character-broken.manifest.json:/entities/brute: o sprite desenhado (40x44) não cobre a hitbox de 'brute' (52x62) no eixo x: razão 1.300 > tolerância declarada 0.82
character-broken.manifest.json:/entities/brute: o sprite desenhado (40x44) não cobre a hitbox de 'brute' (52x62) no eixo y: razão 1.409 > tolerância declarada 0.87
```

Repare que a cobertura é reportada **por eixo**: saber que o problema é a altura, e não a
largura, é a diferença entre esticar o sprite e redesenhá-lo.

Cada linha nomeia o arquivo, o campo e o que era esperado. **Nenhuma mensagem diz apenas
"inválido"** — se você receber uma que diga, é bug do validador e vale reportar.

### O que o validador NÃO faz

- Não abre o PNG. As dimensões de `sheet` são declaradas, não medidas. Declarar errado é um bug
  que aparece como quadro cortado no jogo.
- Não julga qualidade artística, estilo, paleta ou legibilidade.
- **Não executa nada vindo do manifesto.** O manifesto é dado puro, do começo ao fim.

### Se o comando falhar antes de validar

Se você vir uma mensagem pedindo `npm run sim:build`, é porque o artefato da simulação — de
onde as hitboxes são lidas — não foi gerado ainda. Rode o comando indicado e tente de novo.

---

## 13. Inventário: o que a v1 precisa

Quatro famílias. As duas primeiras têm contagem fechada — 7 personagens e 11 inimigos, porque
as chaves são fixadas pelo código do jogo (§ 9). As duas últimas têm contagem aberta: a
quantidade de variações de piso ou de objeto é decisão sua.

**Personagens (7)** — quadro `32x48`, escala 1, `idle` e `run`, rampa de recolor obrigatória:
`mage`, `archer`, `warrior`, `ninja`, `priestess`, `witch`, `coprobo`.

**Inimigos (11)** — tamanho alvo na coluna "Desenhado" da tabela da § 7, `idle` e `run`:
`skeleton`, `goblin`, `demon`, `brute`, `mimic`, `necromancer`, `swampy`, `zombie_king`,
`ogre_warlord`, `goblin_chief`, `necro_lord`.

**Tiles** — `32x32` nativos: piso (algumas variações para quebrar a repetição), parede
(topo, meio, laterais e cantos) e as bordas entre piso e parede.

**Objetos de cenário** — na mesma densidade dos tiles: baú (fechado, abrindo, aberto, vazio),
poção, moeda (animada), coluna, caixa, armadilha de espinhos (animada) e as armas seguradas.

A ordem de entrega é sua. Como os lotes são independentes, comece pelo que for mais fácil de
validar de ponta a ponta — um lote pequeno atravessando o pipeline inteiro vale mais que quatro
lotes grandes parados esperando revisão.

---

## Apêndice: a origem de cada número

Todo valor congelado nesta spec veio de uma decisão registrada do marco 1. A tabela existe para
que, daqui a um ano, ninguém precise adivinhar se um número foi medido ou chutado.

| Número | Decisão | Fonte |
| ------ | ------- | ----- |
| 1 unidade = 1 pixel | D-18 | Custo do piso pré-renderizado (~15 MB a `2400 x 1600`), que cresce com o quadrado da densidade |
| Mundo `2400 x 1600` | D-18 | Congelado antes desta spec; não muda |
| Margem 32/64 px (`PLAY_MARGIN`) | D-20 | Medido do código atual: `2336 x 1472` de área jogável |
| Personagem `32x48`, escala 1 | D-19 | Medido: hoje `16x28` a escala 2 = `32x56` desenhados. Mesma área de tela, 4x o detalhe |
| `48x72` recusado | D-19 | Encolheria o campo de visão num mundo de tamanho congelado, contra a necessidade do modo cooperativo |
| Tile `32x32` | D-20 | Único candidato que divide exato os dois eixos de `2400 x 1600` (75 x 50) |
| Só `idle` e `run` | D-21 | É exatamente o que o motor desenha hoje; acerto é filtro de cor e morte é desvanecimento |
| `frameCount` no manifesto | D-21 | Hoje o motor tem `4` escrito à mão; o manifesto liberta o número |
| Rampa obrigatória | D-22 | O motor troca cores exatas em tempo de execução para distinguir jogadores na mesma sala |
| Tolerância por entrada | D-23 | Medido: razões de 0,75 a 1,06 entre hitbox e sprite desenhado. Não há constante que sirva |
| Tolerância em `[0.5, 1.25]` | D-23 | Teto acima do pior caso medido (1,06), baixo o bastante para tornar impossível uma folga indefinida |
| PNG-32 sem premultiply | D-25 | O `canvas` do navegador espera alfa reto; premultiplicado produz halos nas bordas |
| Cópia commitada | D-25 | Build offline e reproduzível: hash da versão da simulação e pré-cache do aplicativo instalável |
