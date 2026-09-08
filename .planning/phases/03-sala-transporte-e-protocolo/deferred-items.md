# Itens adiados — fase 3

Descobertas fora do escopo do plano que as encontrou. Nada aqui foi corrigido.

## `SIM_VERSION` não chega ao cliente

- **Descoberto em:** plano 03-09, tarefa 3
- **O que é:** todo par anuncia `{ protocol, sim }` no `create`/`join` e no
  `hello`, e o servidor recusa na porta quando os dois lados discordam (D-08).
  `PROTOCOL_VERSION` é real e vem de `packages/protocol`. O outro é o sha256 do
  bundle da sim (D-07), gravado por `npm run sim:version` em
  `packages/sim/dist/sim-version.json` — um **artefato de build**, coberto pelo
  `.gitignore`, que nenhum módulo de `src/` lê.
- **Consequência enquanto durar:** `src/main.ts` anuncia a string `'unwired'`,
  então a metade `sim` do portão não recusa nada. Duas builds com simulações
  diferentes fecham sala e só divergem depois — que é exatamente o modo de falha
  que D-08 existe para evitar, e que o plano 03-10 pega no hash do tick 0.
- **Por que não foi resolvido aqui:** injetar o hash exige uma decisão de build
  (um `define` do Vite lendo o JSON, ou um módulo gerado ao lado dele), e
  `vite.config.ts` e `package.json` não estão em `files_modified` deste plano.
  Tomar essa decisão dentro de um plano de tela seria decidi-la no lugar errado.
- **Quem deveria resolver:** o plano que tocar a cadeia de build da sim, ou um
  plano próprio na fase 3/4. O consumidor já existe: `VERSIONS` em
  `src/main.ts`, uma linha só.
