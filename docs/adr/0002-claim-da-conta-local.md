# 0002 — Claim da conta local

- **Origem:** D-31 (`.planning/phases/01-formato-e-costuras/01-CONTEXT.md`)
- **Requisito:** FORM-01, CONTA-05
- **Consumido por:** fase 6 (contas, progressão na nuvem e offline), critério 4
- **Estado:** aceito em 2026-08-31

## Contexto

O jogo precisa ser jogável no primeiro clique, sem cadastro. Isso significa que existe
progresso — recordes, classes destravadas, soul gold — **antes** de existir conta. Quando o
login chegar na fase 6, esse progresso tem que ter dono, e o dono tem que ser reivindicável.

O problema é que a conta local e a conta do servidor não podem ser espaços de identidade
diferentes: se forem, todo consumidor de `accountId` passa a ter dois caminhos, e os eventos
do ledger de soul gold (ADR 0010), que nascem carimbados com a conta, ficariam com dois
formatos de carimbo.

O critério 4 da fase 6 é literal: *"A conta local criada no primeiro boot é reivindicada por
um login; reivindicar com uma conta que já tem progresso é recusado com explicação — duas
contas reais nunca se fundem."* Fundir duas contas reais é irreversível e não tem
desfazimento correto: recorde não sabe de quem era, e soul gold gasto não volta.

## Opções

| Opção | Custo | Por que foi recusada / aceita |
|---|---|---|
| **Sem conta local** — progresso anônimo até o login, e nada é reivindicado | Zero | Recusada. Joga fora o progresso de quem jogou antes de criar conta, que é justamente o jogador que ainda não decidiu ficar |
| **Um quarto espaço de identidade** (`localId`, separado de `accountId`) | Alto | Recusada. Duplica todo consumidor de identidade e obriga o `LedgerEvent` a carregar dois formatos de dono |
| **Fusão automática no login** | Baixo agora, irreversível depois | Recusada. Reivindicar com uma conta que já tem progresso funde duas contas reais, sem desfazimento correto |
| **Mesmo campo `accountId`, com marcador de origem** | Um campo booleano no save e uma tabela de claim no servidor | **Aceita.** Um só espaço de identidade, e a recusa do critério 4 vira consulta, não heurística |

## Decisão

No **primeiro boot**, o cliente gera um **ULID local** e o grava como `accountId`, marcado
como **não-reivindicado**.

- **Não é um quarto espaço de identidade.** É o mesmo campo `accountId` do ADR 0001, com um
  marcador de origem (`local` / `servidor`). Todo consumidor de `accountId` — inclusive o
  carimbo de dono dos eventos do ledger do ADR 0010 — continua com um só formato.
- O ULID é gerado no cliente, com a mesma primitiva de aleatoriedade criptográfica do
  `eventId` do ledger (80 bits), e **fora de `sim/`**: identidade não é simulação.
- **O login da fase 6 troca** o ULID local por um `accountId` emitido pelo servidor e **grava o
  de origem no registro do claim**, do lado do servidor. O registro do claim é a única fonte da
  verdade sobre qual ULID local virou qual conta.
- **Reivindicar duas vezes é detectável:** o mesmo ULID local aparecendo num segundo claim
  colide com o registro existente, e a segunda tentativa é recusada.
- **Reivindicar com uma conta que já tem progresso é recusável com explicação:** se a conta de
  destino já tem recordes, classes destravadas ou saldo de ledger, o claim é recusado e o
  jogador lê por quê, com as duas opções (entrar na conta existente e perder o progresso local,
  ou criar conta nova). O sistema **nunca** funde as duas.

## Consequência

- **O critério 4 da fase 6 vira consulta, não heurística.** "Já foi reivindicado?" e "a conta de
  destino tem progresso?" são duas leituras de tabela; nenhuma delas depende de comparar
  progresso para adivinhar intenção.
- **Os eventos do ledger nascem carimbados com o dono certo desde o primeiro boot**, mesmo antes
  de existir servidor. Quando o claim acontece, o servidor reescreve o dono dos eventos
  importados uma única vez, na transação do claim — e não precisa de tipo de evento especial
  para isso.
- **Custo aceito:** o jogador que jogou muito offline em dois aparelhos diferentes, sem conta,
  terá dois ULIDs locais e só poderá reivindicar um deles. Isso é escolhido de propósito: o
  contrário é fusão automática, e fusão automática de duas contas reais não tem volta.
- **O que passa a ser caro mudar:** o marcador de origem é campo do save local desde o primeiro
  boot. Acrescentá-lo depois exigiria adivinhar a origem de saves já gravados.
