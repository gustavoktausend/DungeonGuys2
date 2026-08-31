# 0006 — Categorias do placar

- **Origem:** D-35 (`.planning/phases/01-formato-e-costuras/01-CONTEXT.md`)
- **Requisito:** RANK-04
- **Consumido por:** fase 9 (ranking verificado e temporadas), critério 3
- **Estado:** aceito em 2026-08-31

## Contexto

Um score de campanha e um score de endless não medem a mesma coisa. Um score de quatro jogadores
e um score solo também não: pelo desenho de COOP-03, mais jogadores muda a **quantidade** de
inimigos, então a run inteira tem outra forma. E uma run com forge alto contra uma run com forge
zerado compara equipamento, não jogo.

Misturar qualquer um desses eixos num placar só produz um ranking em que estar no topo significa
ter escolhido a categoria certa. RANK-04 é literal sobre isso: *"o placar separa as categorias
que não se comparam"*.

O que torna isto decisão de **formato** — e portanto desta fase, não da fase 9 — é que as
categorias são **colunas da tabela de score**. Uma coluna que nasce depois obriga a inventar o
valor dela para todas as entradas já existentes. E `.planning/STATE.md` já registra que **v1
rankeia só solo**: se as colunas de co-op não nascerem agora, abrir co-op na v2 vira migração do
placar em disputa.

## Opções

| Opção | Custo | Por que foi recusada / aceita |
|---|---|---|
| **Um placar só** | Zero | Recusada. Estar no topo passa a significar ter escolhido a categoria certa |
| **Uma tabela por categoria**, criada quando a categoria abre | Baixo agora, alto depois | Recusada. Abrir co-op na v2 vira criação de tabela e reprocessamento; e consultas comparativas passam a precisar de união entre tabelas |
| **Filtros só na UI**, com a tabela achatada | Baixo | Recusada. Filtro de apresentação sobre dado sem coluna não separa nada: o valor teria de ser inferido do artefato de run a cada consulta |
| **Colunas desde o primeiro board**, com v1 populando só solo | Três colunas e um índice | **Aceita.** Abrir uma dimensão depois é passar a gravar valores novos numa coluna que já existe |

## Decisão

O placar separa **modo × tamanho de grupo × perfil**, e essas três dimensões **nunca** são
misturadas numa mesma listagem.

| Dimensão | O que separa | Valores em v1 |
|---|---|---|
| **Modo** | `campaign` e `endless` medem coisas diferentes | ambos |
| **Tamanho de grupo** | 1, 2, 3 ou 4 jogadores — por COOP-03, a run muda de forma com a contagem | apenas `1` recebe entradas |
| **Perfil** | a configuração com que a run rodou — ver ADR 0007 | apenas `normalizado` (forge desligado) |

**As três dimensões existem como coluna desde o primeiro board.** v1 **rankeia só solo** e só
perfil normalizado; as demais colunas existem, com domínio de valores já definido, e simplesmente
não recebem entradas ainda.

O par `(temporada, SIM_VERSION)` do ADR 0005 é ortogonal a estas três: a chave completa de uma
listagem é `(temporada, SIM_VERSION, modo, tamanho de grupo, perfil)`.

## Consequência

- **Abrir ranking de co-op na v2 não é migração.** É passar a gravar `tamanho de grupo > 1` numa
  coluna que já existe, com índice já criado. Nenhuma entrada antiga precisa ser reescrita.
- **O critério 3 da fase 9** — *"o placar separa modo × tamanho de grupo × perfil sem nunca
  misturá-los"* — vira uma cláusula de consulta, não uma regra de aplicação que alguém pode
  esquecer de aplicar num endpoint novo.
- **Custo aceito:** em v1 duas das três colunas têm um único valor cada, o que parece
  sobre-engenharia lida hoje. É o preço de não migrar um placar em disputa — e é barato porque
  três colunas custam três colunas.
- **Consequência de produto herdada da pesquisa:** como em co-op o log autoritativo é o do host,
  a run de co-op entra como score **do host**, com os demais participantes creditados. Separar
  solo de co-op por coluna é o que torna essa assimetria aceitável em vez de contaminante.
- **O que passa a ser caro mudar:** o domínio de valores de cada dimensão. Acrescentar um valor
  novo (um modo novo, por exemplo) é barato; **fundir** duas dimensões depois não é.
