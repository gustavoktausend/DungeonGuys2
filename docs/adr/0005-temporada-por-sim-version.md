# 0005 — Temporada fecha por `SIM_VERSION`

- **Origem:** D-34, com as consequências de D-07 e D-08 (`.planning/phases/01-formato-e-costuras/01-CONTEXT.md`)
- **Requisito:** TEMP-01
- **Consumido por:** fase 9 (ranking verificado e temporadas), critério 4
- **Estado:** aceito em 2026-08-31

## Contexto

Um placar verificado por replay só é comparável dentro de **uma** versão da simulação. Se um
inimigo for rebalanceado, a mesma seed com o mesmo log de inputs produz outro resultado — e as
duas entradas do placar deixam de significar a mesma coisa. Pior: o replay antigo passa a
**falhar** a verificação, sem que ninguém tenha trapaceado.

O `SIM_VERSION` (FORM-03) já é hash de conteúdo do bundle emitido de `packages/sim` (D-07), e
por D-06 ele cobre só a simulação: HUD, áudio e sprite não o movem; rebalancear um inimigo move.
Falta decidir o que o **placar** faz quando esse valor muda — e essa decisão é esquema de banco,
porque decide se a tabela de score tem coluna de temporada desde o primeiro registro.

Este ADR precisa existir **antes do primeiro board**. Acrescentar a coluna depois de existirem
entradas obriga a inventar a que temporada elas pertenciam.

## Opções

| Opção | Custo | Por que foi recusada / aceita |
|---|---|---|
| **Placar único, sem versão** | Zero | Recusada. O primeiro patch de balanceamento mata o placar: entradas incomparáveis convivendo e replays antigos falhando a verificação sem culpa de ninguém |
| **Re-verificar tudo a cada mudança**, mantendo apenas o que ainda confere | Alto — e destrutivo | Recusada. Apaga o recorde de quem jogou legitimamente, e o custo de CPU cresce com o tamanho do placar |
| **Congelar a simulação** para não mudar de versão | Zero em código, altíssimo em produto | Recusada. Proíbe corrigir bug e rebalancear pelo resto da vida do jogo |
| **Esquema `(temporada, SIM_VERSION)`** — modelo Factorio | Uma coluna a mais e uma tela de recusa | **Aceita.** Transforma a mudança de versão em evento agendado com histórico preservado |

## Decisão

O placar é chaveado por **`(temporada, SIM_VERSION)`**, escrito assim **antes do primeiro
board**. Modelo Factorio:

- Uma mudança de `SIM_VERSION` **fecha** a temporada corrente e **abre** outra.
- O placar anterior é **preservado e rotulado** com a versão em que foi feito. Nada é apagado e
  nada é recalculado.
- Um replay de outra versão é **recusado**, com a razão na tela.

### A recusa (D-08)

A recusa é **sempre**, e mostra as duas versões — a do artefato e a do cliente — mais a ação
(recarregar). Vale para **entrada em sala** e para **carregar replay**.

**Não existe bypass de dev.** Um bypass que existe é um bypass que vaza para produção, e
dessincronização silenciosa é a falha mais cara de diagnosticar do projeto: ela aparece quarenta
segundos depois como "o jogo bugou". Se o atrito de testar duas builds lado a lado se mostrar
insuportável, a saída é rodar o **mesmo** build nas duas abas.

A comparação é **simétrica e feita pela autoridade**, contra o **próprio** valor dela. O cliente
nunca escolhe a versão de referência; ele apenas declara a sua, e uma declaração divergente é
motivo de recusa, não de negociação.

### A consequência aceita de D-07

Como o `SIM_VERSION` é hash do bundle emitido, com o build fixado para ser reproduzível e a
toolchain pinada no `package-lock.json`, **subir Vite ou TypeScript fecha a temporada**. Isso é
aceito de propósito: vira **evento agendado**, anunciado junto com o encerramento da temporada,
e não surpresa no meio de um placar em disputa. Atualização de dependência passa a ser agendada
com o calendário de temporada, como qualquer outra mudança que muda o resultado de um replay.

### A pergunta que continua aberta

Das quatro perguntas de produto que `.planning/STATE.md` listava como bloqueantes, três estão
fechadas — queda do host (ADR 0008), missão destravada (ADR 0009) e teto do forge (ADR 0007). A
quarta **continua aberta**, e este ADR a nomeia em vez de deixá-la sumir:

> **Teto de duração para endless no ranking.**

Endless é ilimitado por construção: um log alegando dez horas são 2,16 milhões de ticks, e dez
submissões simultâneas derrubam a fila de verificação. Havia duas saídas — teto explícito
comunicado na UI, ou **verificação amostrada por checkpoint**. **D-11 fechou a segunda:** o
formato de replay do ADR 0011 parte da seed e **não carrega checkpoints periódicos de hash**,
então não há o que amostrar. Acrescentá-los mais tarde é migração de formato.

Logo, o teto **será** explícito e comunicado na UI — isso está decidido aqui. O que fica com a
**fase 9** é apenas o **número**, que depende do bench de CPU por tick que a própria fase 9 vai
medir (`.planning/ROADMAP.md`, Phase 9, `--research-phase`). O campo que carrega o teto já nasce
no formato agora, pelo ADR 0011, exatamente para que fixar o número mais tarde seja preencher um
campo e não migrar um artefato.

## Consequência

- **A tabela de score nasce com coluna de temporada e coluna de `SIM_VERSION`.** Nenhuma entrada
  jamais precisa ter a sua origem adivinhada.
- **O critério 4 da fase 9** — *"quando o `SIM_VERSION` muda, a temporada fecha e uma nova abre
  com o placar anterior preservado e rotulado"* — é implementação direta deste ADR.
- **Atualizar a toolchain passa a ter custo de produto**, não só de engenharia. É o preço de o
  `SIM_VERSION` ser hash de conteúdo em vez de semver escrito à mão, e é preferível ao contrário:
  um semver à mão eventualmente **não** é incrementado, e aí duas simulações diferentes disputam
  o mesmo placar em silêncio.
- **Porta fechada:** verificação amostrada por checkpoint, para sempre, enquanto este formato
  valer. Ela sai da fase 9 como opção.
- **O que passa a ser caro mudar:** o par `(temporada, SIM_VERSION)` como chave. Trocá-lo depois
  do primeiro board reescreve todas as entradas.
