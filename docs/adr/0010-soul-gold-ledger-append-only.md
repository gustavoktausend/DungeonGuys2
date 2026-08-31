# 0010 — Soul gold: ledger append-only

- **Origem:** D-26, D-27, D-28, D-29 (`.planning/phases/01-formato-e-costuras/01-CONTEXT.md`)
- **Requisito:** FORM-05
- **Consumido por:** fase 1 (`src/app/ledger.ts`) e fase 6 (sincronização), critério 3
- **Estado:** aceito em 2026-08-31

## Contexto

Hoje o soul gold é um **contador mutável**: `progress.soulGold`, um `number` dentro de
`dungeonguys2_save_v1` (`src/app/save.ts`). Funciona enquanto o save vive num aparelho só.

A partir da fase 6 ele passa a existir em dois lugares — o aparelho e o servidor — e CONTA-04
exige que jogar offline funcione. Um contador sincronizado por última escrita **perde ou duplica
dinheiro**: o aparelho que sincroniza por último apaga o ganho do outro, e uma retentativa de
rede credita duas vezes. Não existe regra de merge correta para um contador; a correção tem de
vir da forma do dado.

O critério 3 da fase 6 é literal: *"o soul gold ganho entra exatamente uma vez: repetir a
sincronização não duplica, e restaurar um save antigo não ressuscita saldo já gasto"*. As duas
metades dessa frase são propriedades de um ledger, não de um contador.

Sobra a pergunta do saldo que já existe hoje.

## Opções

| Opção | Custo | Por que foi recusada / aceita |
|---|---|---|
| **Manter o contador**, sincronizado por última escrita | Zero | Recusada. Perde ou duplica dinheiro, e nenhuma das duas metades do critério 3 é alcançável |
| **Contador + log de auditoria separado** | Médio | Recusada. Duas fontes da verdade que divergem em silêncio; o bug aparece como saldo que não bate com o histórico, e não há qual dos dois corrigir |
| **Ledger, com migração do saldo atual** por um evento `legacy` | Baixo em código, permanente em manutenção | Recusada. Acrescenta um tipo de evento que existe só para um save — o do desenvolvedor — e que fica no formato para sempre |
| **Ledger append-only, descartando o saldo atual** | Um saldo perdido, do desenvolvedor | **Aceita.** O formato nasce limpo, sem caso especial permanente |

## Decisão

### O saldo existente é descartado (D-26)

O `progress.soulGold` gravado em `dungeonguys2_save_v1` é **descartado**: **sem código de
migração** e **sem tipo de evento `legacy`**. O jogo nunca foi publicado sob domínio próprio, e o
único save real é o do desenvolvedor.

Isto tem **precedente escrito neste repositório**. O cabeçalho de `src/app/save.ts` registra a
mesma escolha, feita no Marco 0 pelo mesmo motivo:

> *"The original's legacy `dg_*` key migration is dropped entirely — there is no legacy save
> under this key."*

Lá a chave mudou de `dungeonguys_save_v1` para `dungeonguys2_save_v1` e a migração foi
abandonada de propósito. Aqui o contador vira ledger e o saldo é abandonado pelo mesmo raciocínio:
código de migração que roda uma vez, para um save, fica no projeto para sempre.

### O ledger (D-27, D-28, D-29)

- **Chave própria:** `dungeonguys2_ledger_v1`, **separada do save**. O ledger cresce e compacta
  com regras próprias; misturá-lo ao save acoplaria os dois ciclos de vida.
- **Nasce vazio.**
- **Cada evento tem um `eventId` que é um ULID gerado no cliente**, no momento do evento, com 80
  bits de aleatoriedade criptográfica. O servidor da fase 6 deduplica por `UNIQUE(id)`.
  Funciona offline, vale para qualquer origem de soul gold (fim de run, missão, selo de
  temporada) com uma regra só, e o próprio id já carrega ordem temporal. **Sincronizar duas vezes
  é no-op por construção**, não por verificação.
- **O gasto também é evento**, **negativo**, no mesmo ledger, com id próprio.
- **O saldo é a soma** de todos os eventos. Não existe campo de saldo autoritativo.
- **O nível do forge é estado derivado**, gravado na mesma transação que o evento de gasto que o
  produziu.
- **Regra de compactação**, decidida agora porque é formato, mesmo que o servidor só exista na
  fase 6: eventos **já confirmados pelo servidor** colapsam num **único evento de saldo
  consolidado**, carregando a **marca d'água da confirmação**; **só os pendentes ficam
  individualmente**. Sem essa regra o ledger cresce sem limite no `localStorage`; com ela, o
  tamanho é proporcional ao que ainda não sincronizou.

O carimbo de dono de cada evento é o `accountId` do ADR 0001, que no primeiro boot é o ULID local
não-reivindicado do ADR 0002 — um só formato de dono, desde o primeiro evento.

### O que este ADR deliberadamente **não** decide agora

O **formato de fio/servidor do `LedgerEvent` fica adiado para a fase 6**. O mapa de
responsabilidade arquitetural de `.planning/phases/01-formato-e-costuras/01-RESEARCH.md` atribui
ao ledger um tier secundário em **`packages/protocol`** — o formato do evento na rede — e nesta
fase esse tier **não nasce**. O `LedgerEvent` vive inteiro em `src/app/ledger.ts` (plano 01-03).
A razão está na seção seguinte, e é o motivo de isto ser adiamento e não omissão.

## Consequência

- **O critério 3 da fase 6 sai da forma do dado, não de código de sincronização.** *"Repetir a
  sincronização não duplica"* é `UNIQUE(eventId)`; *"restaurar um save antigo não ressuscita saldo
  já gasto"* é o gasto ser evento no mesmo ledger, com id próprio, que volta junto na restauração.
- **O tier de `packages/protocol` do ledger fica adiado para a fase 6, e isso é decisão, não
  esquecimento.** Não existe **consumidor de rede** do ledger antes da fase 6: nada no fio, em
  nenhuma das fases 3, 4 e 5, lê ou escreve `LedgerEvent`. O que é caro mudar depois é a **forma
  append-only local** e o **`eventId` ULID gerado no cliente** — e os dois nascem **agora**,
  congelados, no plano 01-03. O envelope de sincronização que a fase 6 acrescentar é **adição
  sobre um formato local já fechado**, não migração dele. Criar `packages/protocol` com um
  `LedgerEvent` sem consumidor agora significaria congelar um formato de fio contra requisitos que
  ainda não existem, que é a forma mais cara de errar.
- **O caminho de migração fica não exercitado até a fase 6**, e isso foi escolhido sabendo do
  custo: abre-se mão de testar a migração antes de ela valer dinheiro de verdade. O que torna o
  risco aceitável é que a fase 6 não migra saldo nenhum — ela **importa eventos** de um formato
  que já nasceu no formato final.
- **Custo aceito:** o ledger guarda mais bytes que um contador. A regra de compactação existe
  para que esse custo seja proporcional ao pendente, e não ao histórico.
- **Custo aceito:** o saldo de soul gold do desenvolvedor é perdido na primeira execução com o
  ledger.
- **O que passa a ser caro mudar:** a forma append-only e o `eventId`. Reconstruir histórico que
  nunca foi gravado é impossível — é exatamente por isso que este ADR descarta o contador em vez
  de tentar migrá-lo.
