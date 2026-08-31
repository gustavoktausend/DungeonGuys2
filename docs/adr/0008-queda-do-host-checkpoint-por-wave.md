# 0008 — Queda do host: checkpoint por wave concluída

- **Origem:** D-37 (`.planning/phases/01-formato-e-costuras/01-CONTEXT.md`)
- **Requisito:** TEMP-03
- **Consumido por:** fases 5 (co-op e resiliência) e 6 (contas), critério 5 da fase 6
- **Estado:** aceito em 2026-08-31

## Contexto

O netcode é P2P host-autoritativo: um dos quatro jogadores é a autoridade, e a sala é estado
efêmero que morre com o processo dele. O spec de origem já aceita que a queda do host mata a
partida. O que ele **não** resolve é o que acontece com a **progressão** de quarenta minutos de
jogo dos outros três.

`.planning/STATE.md` marcava esta como a mais urgente das quatro perguntas abertas, porque a
fase 5 já depende dela, e a fase 6 depende do **formato** do que for gravado. O critério 5 da
fase 6 é literal: *"Se o host cai no meio da run, a progressão durável das waves já concluídas
continua creditada na conta de cada participante."*

É decisão desta fase porque o checkpoint é **dado gravado**: define uma tabela no servidor e uma
mensagem entre a autoridade e a API. Escolher o formato depois de existirem contas é migração de
progressão.

## Opções

| Opção | Custo | Por que foi recusada / aceita |
|---|---|---|
| **Creditar a run parcial** — a autoridade submete o log até o instante da queda | Baixo em código, alto em superfície de trapaça | Recusada. Cria um caminho de submissão sem fim de run, que é exatamente o caminho que um host malicioso quer: interromper a própria run no melhor momento. E o valor a creditar precisaria ser derivado de um estado que ninguém mais viu |
| **Migração de host** — outro peer assume a autoridade e a run continua | Alto — transferência de estado autoritativo, re-handshake dos três, e o dobro de casos de borda em toda reconexão | Recusada. É caro, e o `.planning/ROADMAP.md` já registra que amigos toleram a limitação **se ela for declarada**. Continua sendo a landing zone se a autoridade um dia sair do host |
| **Nada — a queda perde tudo** | Zero | Recusada. Contradiz TEMP-03 e é a experiência que faz o grupo parar de jogar |
| **Checkpoint de progressão durável por wave concluída** | Uma tabela e uma mensagem por wave | **Aceita.** Perde no máximo uma wave, sem abrir caminho de submissão parcial e sem transferir autoridade |

## Decisão

**Cada wave concluída credita progressão na conta de cada participante, na hora.** A queda do
host perde **apenas a wave em andamento**.

- **Sem migração de host.** A sala morre com a autoridade, e os jogadores leem por quê (TEMP-04).
- **Sem submissão de run parcial.** Não existe caminho de entrada no placar para uma run que não
  terminou. Progressão durável e score de ranking são coisas separadas: a queda credita a
  primeira e nunca a segunda.

### Formato do checkpoint

Porque é dado gravado, o formato é decisão desta fase:

> **Um registro por `(run, wave, jogador)`.**

- `run` — o `runId` da run (emitido pelo servidor quando existir, conforme RANK-02).
- `wave` — o número da wave concluída.
- `jogador` — o `accountId`, já traduzido a partir do `playerId` pela autoridade (ADR 0001). A
  simulação não conhece conta; a travessia acontece na borda.
- Carga: a progressão durável creditada por aquela wave para aquele jogador.

A trinca `(run, wave, jogador)` é **única**, e é isso que torna o crédito **idempotente**:
reenviar o mesmo checkpoint — por retentativa de rede, por reconexão, ou porque a autoridade não
recebeu a confirmação — é no-op. É a mesma propriedade que o `UNIQUE(eventId)` compra para o
ledger de soul gold no ADR 0010, aplicada ao crédito por wave.

## Consequência

- **O critério 5 da fase 6 é implementação direta deste ADR**, e o critério 5 da fase 5
  (reconexão) fica independente dele: reconectar é problema de transporte, creditar já aconteceu.
- **O pior caso é perder uma wave**, e ele é explicável ao jogador numa frase.
- **Custo aceito:** uma escrita no servidor por wave concluída por jogador — até quatro escritas
  por wave. Numa sala de amigos numa VPS pequena isso é desprezível; se um dia não for, a saída é
  agrupar as quatro numa transação por wave, o que **não** muda o formato do registro.
- **Custo aceito:** a run interrompida não pontua no placar, mesmo tendo sido jogada. Isso é
  escolhido: abrir submissão parcial abriria o caminho de trapaça que a fase 9 inteira existe
  para fechar.
- **O que passa a ser caro mudar:** a granularidade. Trocar `(run, wave, jogador)` por algo mais
  fino depois exige reprocessar histórico que não foi gravado nessa granularidade.
