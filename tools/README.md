# `tools/` — convenção de scripts Node

Scripts utilitários que rodam **fora** do jogo: validação de manifesto de assets,
geração de tabelas, conferência de hashes-ouro. Nada aqui é empacotado pelo Vite
nem chega ao navegador.

Até o plano 01-01 este repositório não tinha nenhum script Node, então as cinco
primeiras perguntas abaixo não tinham resposta no código. Ficam decididas aqui,
e valem para todos os planos seguintes. O § 6 não é convenção: descreve um
script em particular, porque ele é o único chamado por `tsx` em vez de `node` e
a exceção precisa do motivo escrito ao lado dela.

## 1. Extensão `.mjs` explícita

Todo script usa a extensão **`.mjs`**, mesmo com `"type": "module"` no
`package.json` da raiz.

O motivo é que os scripts vivem fora dos workspaces, e quando o monorepo do
`packages/` nascer haverá mais de um `package.json` em jogo. A extensão `.mjs`
diz o formato do módulo no próprio nome do arquivo e remove a ambiguidade de
qual `package.json` vale para aquele diretório. `.cjs` só se algum dia um script
precisar de `require` — hoje nenhum precisa.

## 2. Invocação sempre por script de `package.json`

Cada script ganha uma entrada de **uma linha** em `scripts`, no estilo que o
projeto já usa:

```json
"assets:check": "node tools/check-assets-manifest.mjs"
```

O CI chama **`npm run <script>`**, nunca o caminho do arquivo. Assim renomear ou
mover um script é uma alteração de uma linha no `package.json`, e não uma
caçada por todos os workflows que o mencionam.

## 3. Falha e sucesso

- **Falha**: `console.error` com o prefixo `arquivo:ponteiro: mensagem`, seguido
  de `process.exit(1)`. O `ponteiro` é o que localiza o erro dentro do arquivo —
  número de linha, chave JSON ou JSON Pointer, conforme o formato.

  ```
  assets/manifest.json:/sprites/goblin/frames: esperado inteiro >= 1, veio "4"
  ```

- **Sucesso**: **uma** linha em `stdout` e saída **0**. Sem enfeite, sem banner.

  ```
  manifest ok: 128 entradas, 0 avisos
  ```

  A regra é sobre o `stdout` **do script**, não sobre o que aparece no terminal:
  `npm run <script>` acrescenta por conta própria quatro linhas de banner
  (`> pacote@versão`, a linha do comando e duas em branco) — e **em `stdout`**,
  não em `stderr`, então `2>/dev/null` não as remove. Para conferir a regra,
  use **`npm run --silent <script>`**, que suprime o banner e deixa só o que o
  script imprimiu. Isso é observação, não uma exceção ao § 2: o CI continua
  chamando `npm run <script>`, porque lá o banner é útil (diz qual comando
  produziu o número logo abaixo dele).

- **Sem `throw` não tratado.** Uma exceção que escapa vira stack trace e código
  de saída 1 sem mensagem acionável. Capture, imprima no formato acima e saia.

## 4. `tools/` fica fora da checagem de tipos

O `include` do `tsconfig.json` **não muda**: continua
`["src", "tests", "vite.config.ts", "eslint.config.js"]`.

`tools/` é JavaScript puro e fica fora do `tsc --noEmit`. Colocar `tools/` no
`include` exigiria tipos de Node em toda a base de código, e o `types` do
`tsconfig.json` está fixado em `["vite/client"]` — que é o que faz o
`import.meta.glob` de `tests/purity.test.ts` compilar. Não mexer.

## 5. `tools/` **é lintado** — corrigido em 2026-09-08

**O que esta seção dizia até hoje, e por que estava errado.** Ela afirmava que
`tools` estava no array `ignores` do `eslint.config.js` e defendia a exclusão
com o argumento de que a cobertura desses scripts vem de rodá-los no CI, não de
lint.

A primeira metade **deixou de ser verdade na fase 2** e a segunda nunca
sobreviveu ao exame. Hoje `eslint.config.js:61` lista
`['dist', 'dist-server', 'packages/*/dist', 'node_modules', 'tests/pwa/fixtures']`
— `tools` saiu dali, junto com `public`, e o comentário de vinte linhas acima
daquela linha explica o motivo: **todas as entradas restantes são saídas de
build, e `tools/` era uma entrada.** O argumento antigo descrevia `tools/` como
andaime que nunca é publicado, e dois arquivos contradiziam a descrição por
escrito: `tools/ops/restore-verify.mjs` roda **na VPS**, sobre o ledger vivo
(`ops/README.md` §11), e `tools/sw/emit.mjs` escreve o precache do service
worker publicado, onde um erro aparece offline, semanas depois.

Esta seção fica escrita como correção, e não reescrita como se sempre tivesse
dito isso, porque a única coisa que a versão antiga provou é que uma seção de
convenção envelhece em silêncio: o `ignores` mudou num commit da fase 2 e este
arquivo continuou afirmando o contrário por uma fase inteira. Quem lê uma
convenção precisa saber quando ela mudou e o que ela dizia antes.

**Consequência prática:** todo script de `tools/` passa por `npm run lint`,
inclusive os deste diretório e o do § 6. O custo real foi medido antes da
mudança — nove arquivos entraram no escopo e reportaram **zero** erros e zero
avisos, porque esta configuração estende o `recommended` do `typescript-eslint`
e **não** o do `@eslint/js`, então `no-undef` não está ligado e `console`,
`process` e `import.meta` não pedem bloco de globais.

O § 4 **continua valendo sem alteração**: `tools/` está fora do `tsc --noEmit`.
Lint e checagem de tipos são portões diferentes, e só um dos dois mudou.

## 6. `bench:snapshot` — o número no log, ao lado do portão

`tools/bench/snapshot.mjs` mede as três partes do snapshot binário nos dois
mundos sintéticos de pior caso (`wave16SwarmElite` e `wave40Endless` de
`tests/worlds.ts`) e imprime os seis tamanhos numa linha, com o teto ao lado:

```
snapshot wave16 parte0=1492 parte1=798 parte2=644 | wave40 parte0=3316 parte1=1228 parte2=986 | teto=16384
```

**Ele e `tests/snapshot-bench.test.ts` existem pelos motivos opostos, e por isso
os dois existem.** O teste é o portão: uma parte que alcance 16384 bytes quebra
o build antes de chegar a um jogador. O script é o holofote: uma regressão de
2,8 KiB para 9 KiB **passa** no portão e some na revisão — imprimir os números
a cada execução do CI coloca o tamanho novo no log do PR que o causou, ao lado
do diff que o causou. Só o portão esconde a deriva abaixo do teto; só o
holofote nunca diz não.

Os dois medem **os mesmos mundos**, importados de `tests/worlds.ts` e nunca
reconstruídos aqui — o cabeçalho daquele arquivo explica que uma segunda cópia
dos construtores deixaria o bench e o portão medindo coisas diferentes, os dois
verdes, um deles já sem descrever o jogo. E os dois usam **um teto só**: o
`CEILING` deste script é conferido contra o `SNAPSHOT_MAX_BYTES` do codec em
tempo de execução, e o teste confere a mesma igualdade lendo o literal daqui
como texto.

**Por que este é o único script chamado por `tsx` e não por `node`.** Ele
importa `tests/worlds.ts` e `@dg2/protocol`, que são TypeScript alcançado por
symlink de workspace (`main` aponta para `./src/index.ts`). O `node` puro não os
carrega: o type-stripping do Node 24 não faz resolução de extensão, e os dois
barrels usam `export * from './world'` sem sufixo. Por isso o `package.json` da
raiz declara `"tsx": "4.23.12"` em `devDependencies`.

Essa declaração **não instala nada**: `apps/server` já depende da mesma versão
exata e o npm a eleva para o `node_modules` da raiz, então até hoje este script
funcionava por hoisting — isto é, por acidente. Declarar é escrever o que já
era verdade. Conferido antes de commitar, e vale repetir porque é a pergunta
que a declaração levanta: `npm ci --dry-run` **continua verde** com ela, e falha
com `EUSAGE — Missing: <pacote> from lock file` para um pacote de fato novo. O
`package-lock.json` não mudou nem precisou mudar.
