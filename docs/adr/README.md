# Registro de decisões de arquitetura (ADR)

Este diretório guarda as decisões que o projeto **decide agora e implementa depois**. Elas
foram tomadas na fase 1 porque são caras de mudar mais tarde: descrevem dado gravado,
formato de fio ou regra de identidade, e corrigi-las depois de existirem contas, replays e
placar é migração de dados, não refatoração.

Uma decisão só entra aqui quando está **fechada**. Se ainda houver escolha em aberto, ela
continua sendo pergunta em `.planning/ROADMAP.md` e em `.planning/STATE.md` — não vira ADR.

As fases 5, 6, 8 e 9 citam este diretório nominalmente. Por isso a convenção de nome importa
mais que o volume de prosa.

## Convenção de nome

`docs/adr/NNNN-slug.md`

- `NNNN` — quatro dígitos, numeração sequencial a partir de `0001`.
- Um arquivo por decisão. Nunca dois assuntos no mesmo arquivo.
- Um número **nunca é reaproveitado**. Uma decisão revogada continua no lugar, com o estado
  marcado no cabeçalho e um link para o ADR que a substitui — o histórico é o valor do
  registro.
- `slug` em minúsculas, sem acento, palavras separadas por hífen.

## Formato obrigatório

Cada ADR tem estas quatro seções, nesta ordem, em português:

1. `## Contexto` — o que é verdade hoje e por que a decisão precisa existir agora.
2. `## Opções` — as alternativas consideradas, **incluindo as recusadas**, com o custo de cada uma.
3. `## Decisão` — o que fica valendo, escrito de forma citável por quem for implementar.
4. `## Consequência` — o que a escolha comprou, que porta ela fechou, e o que passa a ser caro
   mudar depois.

O cabeçalho de cada ADR cita o id `D-NN` de
`.planning/phases/01-formato-e-costuras/01-CONTEXT.md` que originou a decisão, o requisito de
`.planning/REQUIREMENTS.md` que ela atende, e a fase que a consome. É o formato que
`docs/DECISOES-MARCO0.md` já usa — *decisão, motivo, custo se errado* — acrescido da seção de
opções, porque estas são decisões de arquitetura e não de execução.

## Índice

| # | Título | Origem | Requisito | Consumido por |
|---|--------|--------|-----------|---------------|
| [0001](0001-identidade-em-tres-espacos.md) | Identidade em três espaços | D-30 | FORM-01 | fases 4, 5, 6, 9 |
| [0002](0002-claim-da-conta-local.md) | Claim da conta local | D-31 | FORM-01, CONTA-05 | fase 6 |
| [0003](0003-merge-por-campo-do-save.md) | Merge por campo do save | D-32 | CONTA-03, CONTA-04 | fase 6 |
| [0004](0004-settings-identidade-sincroniza.md) | Settings: identidade sincroniza, preferência fica no aparelho | D-33 | CONTA-05, CONTA-06 | fase 6 |
| [0005](0005-temporada-por-sim-version.md) | Temporada fecha por `SIM_VERSION` | D-34, D-07, D-08 | TEMP-01 | fase 9 |
| [0006](0006-categorias-do-placar.md) | Categorias do placar | D-35 | RANK-04 | fase 9 |
| [0007](0007-perfil-normalizado-forge-desligado.md) | Perfil normalizado: forge desligado em run rankeada | D-36 | RANK-02, RANK-04 | fase 9 |
| [0008](0008-queda-do-host-checkpoint-por-wave.md) | Queda do host: checkpoint por wave concluída | D-37 | TEMP-03 | fases 5 e 6 |
| [0009](0009-missao-destravada-e-credito.md) | Missão destravada e crédito de conclusão | D-38 | MISS-03 | fase 8 |
| [0010](0010-soul-gold-ledger-append-only.md) | Soul gold: ledger append-only | D-26, D-27, D-28, D-29 | FORM-05 | fases 1 e 6 |
| [0011](0011-formato-de-replay.md) | Formato do artefato de run | D-10, D-11, D-12, D-04 | FORM-06 | fases 4 e 9 |
| [0012](0012-objetivos-como-campo-do-world.md) | Objetivos como campo do `World` | FORM-08 | FORM-08 | fases 1 e 8 |
