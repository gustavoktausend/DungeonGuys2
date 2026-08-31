# 0003 — Merge por campo do save

- **Origem:** D-32 (`.planning/phases/01-formato-e-costuras/01-CONTEXT.md`)
- **Requisito:** CONTA-03, CONTA-04
- **Consumido por:** fase 6 (contas, progressão na nuvem e offline), critério 3
- **Estado:** aceito em 2026-08-31

## Contexto

`src/app/save.ts` guarda hoje um único objeto em `dungeonguys2_save_v1`, com três blocos de
naturezas completamente diferentes: `settings` (preferência), `records` (recorde por classe) e
`progress` (contadores, `unlocked`, `soulGold`, `forge`).

Quando a fase 6 acrescentar sincronização, esse objeto passa a existir em dois lugares — o
aparelho e o servidor — e os dois podem divergir, porque CONTA-04 exige que jogar offline
funcione. Aplicar **uma** regra de merge ao objeto inteiro é o erro clássico: last-write-wins
no objeto todo faz o aparelho que sincronizou por último apagar o recorde feito no outro.

A regra de merge é formato: ela decide o que o servidor precisa guardar. Um campo que vai ser
fundido por `MAX` guarda valor; um campo que vai ser fundido por união guarda conjunto; um
campo que vai ser fundido por soma guarda **lançamentos**, não saldo. Escolher depois é
migração de esquema.

## Opções

| Opção | Custo | Por que foi recusada / aceita |
|---|---|---|
| **Last-write-wins no save inteiro** | Zero | Recusada. O aparelho que sincroniza por último apaga o progresso do outro, e numa moeda isso **perde ou duplica dinheiro** |
| **CRDT genérico** para o save todo | Alto — biblioteca, tamanho e um modelo mental novo | Recusada. Três dos quatro campos já são monotônicos e comutativos por natureza; um CRDT genérico paga o preço de um caso que não existe |
| **Última escrita com carimbo, campo a campo** | Baixo | Recusada como regra geral: resolve `settings` (ADR 0004), mas continua perdendo recorde e continua errada para moeda |
| **Uma regra por campo, escolhida pela natureza do dado** | Um parágrafo de regra por campo | **Aceita.** Cada campo ganha a regra que torna o conflito impossível em vez de resolvido |

## Decisão

A sincronização do save usa **uma regra de merge por campo**. Não existe regra "do save".

| Campo | Regra | Por quê |
|---|---|---|
| **Recordes por classe** (`records`) | `MAX(local, servidor)` por classe e por métrica | Recorde só sobe. `MAX` é monotônico e comutativo: a ordem de sincronização não importa, e nenhuma sequência de sincronizações produz conflito |
| **Missões e classes destravadas** (`progress.unlocked`, cadeia de missões) | **União** dos conjuntos | Destravar só acrescenta. União é monotônica e comutativa pelo mesmo motivo |
| **Soul gold** (`progress.soulGold` hoje) | **Ledger append-only** do ADR 0010 — união dos eventos por `eventId`, saldo derivado por soma | Uma moeda não tolera last-write-wins: perde ou duplica dinheiro. Com ledger e `UNIQUE(id)`, sincronizar duas vezes é no-op |
| **Entradas de ranking** | **Fila local**, envio ao reconectar, **verificação assíncrona** no servidor | Score de cliente nunca é confiado, nem online. A fila é local porque a run pode terminar offline; a verificação é assíncrona porque re-rodar a run custa CPU (fase 9) |
| **Settings** | Ver ADR 0004 — `name` e `colors` sincronizam por última escrita com carimbo; o resto fica por aparelho | Preferência de aparelho não é progresso |

**Nenhuma dessas regras é last-write-wins, e isso é a decisão.** As três primeiras são
**monotônicas e comutativas**: dois aparelhos offline nunca produzem conflito, porque não existe
par de operações cuja ordem mude o resultado. Não há resolução de conflito a escrever, porque
não há conflito a resolver.

O `forge` (`progress.forge`) **não** entra na tabela como campo primário: pelo ADR 0010 ele é
**estado derivado** do ledger, gravado na mesma transação do gasto. Sincronizá-lo por si só
duplicaria a fonte da verdade.

## Consequência

- **O critério 3 da fase 6 sai de graça.** *"Repetir a sincronização não duplica"* é consequência
  de `UNIQUE(eventId)`; *"restaurar um save antigo não ressuscita saldo já gasto"* é consequência
  de o gasto ser evento no mesmo ledger.
- **O esquema do servidor fica determinado por este ADR**, não pelo código da fase 6: recordes são
  colunas de valor, destravados são tabela de associação, soul gold é tabela de lançamentos com
  `UNIQUE(id)`, ranking é fila com estado (`pending|running|ok|rejected|error`).
- **Custo aceito:** o soul gold guarda mais bytes que um contador, e a compactação do ADR 0010
  existe justamente para que esse custo não cresça sem limite.
- **O que passa a ser caro mudar:** a natureza de cada campo. Transformar um contador em ledger
  depois de ele valer dinheiro exige reconstruir histórico que não foi gravado — e é exatamente
  por isso que o ADR 0010 descarta o contador atual em vez de migrá-lo.
