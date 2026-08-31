# `tools/` — convenção de scripts Node

Scripts utilitários que rodam **fora** do jogo: validação de manifesto de assets,
geração de tabelas, conferência de hashes-ouro. Nada aqui é empacotado pelo Vite
nem chega ao navegador.

Até o plano 01-01 este repositório não tinha nenhum script Node, então as cinco
perguntas abaixo não tinham resposta no código. Ficam decididas aqui, e valem
para todos os planos seguintes.

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

- **Sem `throw` não tratado.** Uma exceção que escapa vira stack trace e código
  de saída 1 sem mensagem acionável. Capture, imprima no formato acima e saia.

## 4. `tools/` fica fora da checagem de tipos

O `include` do `tsconfig.json` **não muda**: continua
`["src", "tests", "vite.config.ts", "eslint.config.js"]`.

`tools/` é JavaScript puro e fica fora do `tsc --noEmit`. Colocar `tools/` no
`include` exigiria tipos de Node em toda a base de código, e o `types` do
`tsconfig.json` está fixado em `["vite/client"]` — que é o que faz o
`import.meta.glob` de `tests/purity.test.ts` compilar. Não mexer.

## 5. `tools/` fica no `ignores` do ESLint

`tools` está no array `ignores` do `eslint.config.js`, ao lado de `dist`,
`public` e `node_modules`.

A cobertura desses scripts vem de **rodá-los no CI**, não de lint: um validador
de manifesto que roda a cada push já prova que carrega, que parseia e que decide
certo. Lint sobre eles pagaria configuração de ambiente Node (globais, `types`)
sem comprar erro nenhum que a execução não pegue antes.
