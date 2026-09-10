---
phase: 02-migra-o-para-a-vps
plan: 12
status: partial
completed: 2026-09-10
tasks_done: 2.5
tasks_total: 3
requirements: [INFRA-01, INFRA-02, INFRA-03, INFRA-04]
---

# 02-12 — Executar contra a caixa real e registrar

**O jogo está no ar no domínio próprio, sob HTTPS, servindo o commit `9cba5c9`.** A política HTTP
foi medida contra o domínio real e chega intacta ao cliente. Três itens do plano ficaram por
fazer, por escolha do operador registrada em 2026-09-10, e **três critérios de sucesso da fase 02
não fecham por causa deles** — o plano fecha `partial` de propósito.

## O que foi feito

### Task 1 — 10 dos 13 passos

| # | Passo | Resultado |
|---|---|---|
| 1 | Pacotes públicos, puxados da caixa sem credencial | ✅ 2 s e 21 s, digests anotados; visibilidade também verificada de fora com token anônimo |
| 2 | Repontar a composição | ✅ operador; o deploy 17 leu `ops/docker-compose.yml` |
| 3 | Variáveis do app | ✅ operador |
| 4 | Promover | ✅ `No services to build` + `Pulling` nas duas; dois volumes criados; ordem respeitou `depends_on` |
| 5 | O deploy pegou | ✅ `release` byte a byte igual ao sha publicado |
| 6 | Certificado | ✅ Let's Encrypt, expira 2026-12-08 22:40 GMT, redirect 302 |
| 7 | **Três `Cache-Control` (A10)** | ✅ **CONFIRMADA** — o Traefik não reescreve nada |
| 8 | CSP num navegador de verdade | ⏳ **adiado** |
| 9 | 404 honesto | ✅ 404, `text/plain`, corpo não é o índice |
| 10 | PWA instalação limpa e offline | ⏳ **adiado** |
| 11 | PWA atualização | ⏳ **adiado** |
| 12 | 503 legível por máquina | ✅ estático 200, API `{"status":"unavailable"}` em JSON com os quatro cabeçalhos |
| 13 | O vizinho | ✅ apps do infraKring `Up 2 months` intactos; load caiu; −49 MB de RAM |

### Task 2 — 3 dos 6 passos

- **1 ✅** duas tags por serviço em disco (`9cba5c9` e `e9079df`) — o mínimo que a reversão exige
- **2 ⏳ adiado** — reversão com o registro inalcançável
- **3 ✅** ensaio de restauração em contêiner descartável: exit 0, **713 ms**, sem resíduo
- **4 ✅** prova de recusa: `no matching backup files available`, exit 1, sem stack trace
- **5–6 ⏳ adiados** — monitor externo

### Task 3 — feita

`docs/OPERACAO.md` foi de 318 para **600 linhas**, com as saídas coladas e o domínio redigido como
`<DOMINIO>`. Duas asserções novas em `tests/ops-config.test.ts`, ambas provadas por remoção.

## Duas coisas que o registro se recusa a contar como prova

1. **O ensaio de restauração comparou 0 linhas com 0 linhas**, porque o ledger está vazio. Ele
   provou o **mecanismo** — réplica no volume certo, litestream restaurando, ferramentas na imagem,
   ambiente limpo alcançável — e não os **dados**. Refazê-lo depois da primeira partida com escrita
   é o que converte isso em prova.
2. **O deploy partiu do zero**, então recriar os dois serviços era inevitável e **não** confirma a
   previsão do plano 02-14 de que *todo* deploy recria ambos. Item de discrição ainda aberto; sai
   de graça no primeiro deploy que mude só a tag.

## Quatro defeitos reais encontrados e corrigidos

Nenhum estava previsto pelo plano; os quatro só apareceram porque o plano manda executar.

1. **O par de relay tornava o servidor imbootável** (`f019161`). `optional()` em `env.ts` trata
   "definida e vazia" como erro, e o Compose renderiza `KEY=${VAR}` com `VAR` indefinida como
   `KEY: ""`. O estado "sem relay", que o código documenta como suportado, era **inalcançável**.
   Medido em contêiner real. As duas linhas saíram da composição, com asserção que prende a
   ausência e obriga a fase 3 a devolvê-las **juntas**, com coturn atrás.
2. **A tag automática é impossível nesta plataforma** (`849c1d2`, revertido em `9c40f1c`).
   Detalhado abaixo — é o erro que derrubou a produção.
3. **A composição podia deixar de ser YAML sem nenhum teste notar** (`9cba5c9`). Todo o bloco a
   lia por regex. `yaml` entrou como devDependency e o primeiro caso do bloco parseia o arquivo e
   exige achar `api` e `web`.
4. **O comando do ensaio de restauração não rodava** (`35f5902`). `ops/README.md` §11 não passava
   `-e DG2_REPLICA_PATH`, que um `docker run` avulso não herda da composição. Falhava com
   `file replica path required` — mensagem sobre configuração, não sobre backup, que manda o
   leitor investigar o lugar errado.

## O erro que derrubou a produção, escrito para não se repetir

O domínio ficou em **503 entre 18:36 e 19:34** (quatro deploys, três falhos). O primeiro falhou
pelo defeito que o plano existia para achar: `DG2_IMAGE_TAG` vazia no painel. Os outros dois foram
meus, e ambos pela **mesma falha de método** — medir numa reprodução isolada e aplicar no artefato
real sem remedir.

- **Deploy 15:** propus `${DG2_IMAGE_TAG:-${SOURCE_COMMIT}}`. Medi o Compose corretamente e **nunca
  medi o Coolify**. A ideia se anula: todo `${VAR}` da composição vira campo no painel (`D2-29`,
  escrito no cabeçalho do arquivo que eu estava editando), e o Coolify injeta o commit real **só
  quando a aplicação não tem variável com esse nome**. A referência cria a linha; a linha suprime a
  injeção.
- **Deploy 16:** medi a forma `:?` num arquivo onde o valor estava **entre aspas** e apliquei sem
  aspas no real. `: ` num escalar YAML sem aspas é indicador de mapeamento. Os 65 testes ficaram
  verdes sobre um arquivo que o Docker não conseguia abrir.

O que sobreviveu: a tag é obrigatória e usa `:?`, então vazia ela falha na interpolação **nomeando
a variável**, em vez do `invalid reference format` que não nomeia nada — que era o defeito
original do deploy 14. E `docker compose config` sobre o arquivo real virou parte do procedimento.

## Divergência deliberada do plano

O plano pedia, como critério da Task 3, que `grep -c 'pendente' docs/OPERACAO.md` retornasse **0**.
**Não foi cumprido, e não deve ser.** O monitor externo realmente está pendente; apagar o marcador
para comprar uma suíte verde é exatamente a falha que o documento inteiro existe para impedir. A
asserção escrita no lugar exige o oposto: que o pendente tenha **dono, prazo e consequência**, e
que o documento diga em voz alta que a fase fecha incompleta.

O plano também falava em "as quatro variáveis do bucket" (Task 1 passo 3, Task 2 passos 3 e 4).
`D2-33` as revogou antes de o plano ser executado: não há bucket, não há credencial, e a prova de
recusa foi feita com caminho de réplica errado.

## O que fica aberto, com dono

Registrado em `docs/OPERACAO.md` § "O que continua aberto ao fim do plano 02-12", que separa
pendência de decisão registrada. Resumo:

| Item | Critério que não fecha | Condição de volta |
|---|---|---|
| Reversão com o registro inalcançável | critério 4, metade "reversível" | ~10 min; a imagem anterior **já está em disco** |
| Monitor externo | critério 4, metade "alguém avisa" | **prazo 2026-11-08** — 30 dias antes de o certificado expirar |
| CSP observado, PWA limpo e atualizado | critério 2 | num navegador; a advertência do `ops/Caddyfile` **permanece de pé** |
| Ensaio sobre dados reais | nenhum | depois da primeira partida que escreva no ledger |
| "Todo deploy recria os dois" | nenhum (discrição) | sai junto com a reversão |

**Enquanto o monitor não existir, nada avisa se o jogo cair** — nem o certificado, nem o
crash-loop que o Docker tenta para sempre (perda declarada de `P-9`, `T-2-LOOP`).

## Arquivos

**Modificados:** `ops/docker-compose.yml`, `ops/README.md`, `docs/OPERACAO.md`,
`tests/ops-config.test.ts`, `package.json`, `package-lock.json`

**Commits:** `f019161`, `849c1d2`, `9c40f1c`, `9cba5c9`, `35f5902`, `d3acd95`

**Suíte:** 919 verdes, lint limpo. `dependencies` continua `{}`.
