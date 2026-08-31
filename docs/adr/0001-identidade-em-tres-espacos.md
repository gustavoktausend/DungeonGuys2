# 0001 — Identidade em três espaços

- **Origem:** D-30 (`.planning/phases/01-formato-e-costuras/01-CONTEXT.md`)
- **Requisito:** FORM-01
- **Consumido por:** fases 4 (sala e transporte), 5 (co-op), 6 (contas), 9 (ranking)
- **Estado:** aceito em 2026-08-31

## Contexto

Hoje o jogo é solo e não existe identidade nenhuma: `World` guarda `players` como
`Record<string, Player>` com uma chave inventada pelo `app/`, e o save local
(`dungeonguys2_save_v1`) não tem dono. Nada disso resiste ao co-op.

A partir da fase 4 três coisas diferentes precisam de nome ao mesmo tempo: **quem é o
jogador** (a conta que acumula progresso entre aparelhos), **qual slot ele ocupa na run**
(o que a simulação move e o que o replay reproduz) e **por qual conexão ele está falando**
(o handle do transporte, que troca a cada reconexão de WebRTC).

Se os três forem o mesmo campo, três coisas quebram de uma vez: o `World` passa a carregar
dado de conta e o replay deixa de ser reproduzível sem o banco; a reconexão de TEMP-04 vira
troca de identidade dentro da simulação; e o ranking da fase 9 passa a confiar num id que o
cliente escolheu.

Isto é formato, não implementação: são campos que entram em snapshot, em replay guardado e
em tabela de banco. Fixar esses campos só quando já existirem replays guardados é migração de
dados, não refatoração.

## Opções

| Opção | Custo | Por que foi recusada / aceita |
|---|---|---|
| **Um único id** — a conta é o jogador é o peer | Zero agora | Recusada. Põe `accountId` dentro do `World`, e todo replay guardado passa a depender do banco de contas para ser lido. Também torna a reconexão uma mudança de identidade no meio da simulação |
| **Dois espaços** — conta + slot, com o transporte reusando o slot | Baixo | Recusada. O slot é estável durante a run inteira; a conexão não é. Reusar o slot como handle de transporte apaga a distinção entre "o jogador saiu" e "a conexão caiu", que é exatamente o que TEMP-04 precisa distinguir |
| **Três espaços com donos distintos** | Um campo a mais no manifesto da run e uma tabela de tradução na autoridade | **Aceita.** É o menor desenho em que o replay não conhece conta e a reconexão não toca a simulação |

## Decisão

Uma run distingue **três** espaços de identidade, cada um com dono, ciclo de vida e regra de
travessia declarados.

### `accountId` — dono: o servidor de contas

- **O que é:** ULID durável emitido pelo servidor (fase 6). É a identidade que acumula
  progresso, soul gold, missões destravadas e entradas de ranking.
- **Ciclo de vida:** nasce no cadastro (ou no primeiro boot, como ULID local não-reivindicado —
  ver ADR 0002) e **nunca** morre; sobrevive a troca de aparelho, a logout e a reinstalação.
- **Regra de travessia:** **`accountId` nunca entra no `World`.** Nenhum campo de `sim/`, de
  snapshot ou do log de inputs carrega `accountId`. Ele vive no manifesto da sala e nas tabelas
  do servidor, do lado de fora de `packages/sim`.

### `playerId` — dono: a autoridade da sala

- **O que é:** o slot `p0`, `p1`, `p2` ou `p3`, atribuído pela autoridade no momento em que a
  sala fecha. É o **único** espaço de identidade que a simulação e o replay conhecem: é a chave
  de `world.players` e a coluna do log de inputs.
- **Ciclo de vida:** nasce quando a sala fecha e vive até o fim da run. Um jogador que
  reconecta volta para **o mesmo** `playerId`; um slot vago não é reciclado dentro da mesma run.
- **Regra de travessia:** a tradução `accountId → playerId` acontece **uma vez**, quando a sala
  fecha, e é **responsabilidade da autoridade**. O resultado é a ordem canônica de `players[]`
  no `RunConfig` (FORM-02), que é o que `step()` itera. A travessia inversa
  (`playerId → accountId`), usada para creditar progressão e score, vive **fora de `sim/`** — na
  autoridade e no servidor, nunca dentro da simulação.

### `peerId` — dono: a camada de transporte

- **O que é:** o handle da conexão — a chave do `RTCPeerConnection` e do canal de signaling.
- **Ciclo de vida:** nasce no handshake e **morre com a conexão**. Uma reconexão produz um
  `peerId` novo para o mesmo `playerId` e o mesmo `accountId`.
- **Regra de travessia:** o transporte traduz `peerId → playerId` na borda de entrada, antes de
  qualquer mensagem chegar ao sim. Nenhuma camada acima do transporte vê `peerId`. FORM-12 (o
  protocolo não contém a palavra "host") vale aqui: `peerId` identifica uma conexão, não um papel.

## Consequência

- **Um replay é reproduzível sem nenhum dado de conta.** O verificador da fase 9 carrega seed,
  `RunConfig` e log de inputs, e roda `step()` sem consultar o banco de contas uma única vez.
  Essa é a propriedade que este ADR existe para comprar.
- **Reconexão (TEMP-04) deixa de tocar a simulação.** Trocar `peerId` é evento de transporte; o
  `playerId` não se move, então nem o `World` nem o log de inputs registram a queda.
- **O ranking nunca confia em id escolhido pelo cliente.** O `accountId` vem do servidor e o
  `playerId` vem da autoridade; o cliente não emite nenhum dos dois.
- **Custo aceito:** a autoridade passa a manter uma tabela de tradução em memória por sala, e
  todo relatório de fim de run (crédito de progressão, submissão de score) precisa fazer a
  travessia inversa explicitamente. É trabalho a mais, e é onde um bug de crédito apareceria —
  por isso o crédito por wave do ADR 0008 grava `(run, wave, jogador)` já traduzido.
- **O que passa a ser caro mudar:** o formato de `playerId` (`p0..p3`) está congelado dentro de
  todo replay guardado a partir da fase 4. Trocá-lo depois invalida o placar.
