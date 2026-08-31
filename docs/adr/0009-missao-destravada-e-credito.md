# 0009 — Missão destravada e crédito de conclusão

- **Origem:** D-38 (`.planning/phases/01-formato-e-costuras/01-CONTEXT.md`)
- **Requisito:** MISS-03
- **Consumido por:** fase 8 (modo missão), critério 4
- **Estado:** aceito em 2026-08-31

## Contexto

As missões destravam **em cadeia** (MISS-02): concluir uma abre a seguinte, e a cadeia mantém
sempre ao menos dois nós abertos. Cada jogador tem a própria cadeia, na própria conta.

Numa sala de quatro amigos, as quatro cadeias quase nunca estarão no mesmo ponto — um jogou mais,
outro entrou ontem. Duas perguntas caem juntas: **o que a sala pode jogar**, e **quem recebe
crédito** quando a missão é concluída.

`.planning/STATE.md` listava isto como pergunta aberta, e o `.planning/ROADMAP.md` é explícito
sobre o motivo da urgência: *"precisa ser aceito ou rejeitado por escrito antes da primeira
cadeia, porque corrigir depois é migração de progressão"*. O crédito é dado gravado na conta;
mudar a regra depois exige reconstruir cadeias que já foram abertas.

## Opções

| Opção | Custo | Por que foi recusada / aceita |
|---|---|---|
| **Interseção** — a sala só joga o que **todos** destravaram | Zero | Recusada. O membro mais novo do grupo trava a sala inteira, que é o oposto de por que o jogo existe. Quatro amigos com progressos diferentes é o caso comum, não a borda |
| **União sem crédito** — quem destravou leva os outros, mas só ele recebe crédito | Baixo | Recusada. O convidado joga a missão inteira e não avança: da segunda vez ele prefere não entrar, e o grupo se separa |
| **Cadeia da sala, com crédito só ao criador** | Baixo | Recusada pelo mesmo motivo, com o agravante de tornar o crédito dependente de quem clicou em "criar sala" |
| **Cadeia de quem criou define, e todos os presentes recebem crédito** | Uma regra de crédito por participante presente na conclusão | **Aceita.** Mantém o grupo junto e faz o convidado avançar |

## Decisão

**A cadeia de quem criou a sala define o que dá para jogar.**

- O criador da sala é quem determina o conjunto de missões entráveis: as que **a cadeia dele**
  tem abertas. Uma missão trancada na cadeia do criador continua não entrável (MISS-02).
- **Quem não destravou entra como convidado.** Não há pré-requisito individual para participar de
  uma missão que a sala pode jogar; o pré-requisito é da sala, e a sala é a do criador.
- **Todos os presentes na conclusão recebem crédito** na própria conta: a missão é marcada como
  concluída na cadeia de cada participante, e a cadeia de cada um avança de acordo. "Presente na
  conclusão" é a condição — quem saiu antes do fim não recebe.

O crédito atravessa `playerId → accountId` na borda, pela regra do ADR 0001, e é gravado com a
mesma idempotência do checkpoint por wave do ADR 0008: reenviar a mesma conclusão para o mesmo
jogador é no-op.

### "Carregar um amigo" é feature aceita, por escrito

Esta decisão permite explicitamente que um jogador avançado leve um amigo por uma missão que o
amigo ainda não tinha destravado, e que o amigo **avance na própria cadeia** por causa disso.

**Isso é feature aceita por escrito, não tolerada por omissão.** Em co-op privado entre amigos
por código de sala, **carregar é o ponto** — é literalmente o que quatro amigos fazem quando um
deles é novo. O jogo é fechado por convite (`.planning/PROJECT.md`), então não existe o mercado
de "boost" que tornaria isso um problema em jogo aberto; e o ranking, que é onde o mérito
individual importa, é solo em v1 e verificado por replay (ADR 0006 e ADR 0007), portanto não é
contaminado por esta regra.

## Consequência

- **O critério 4 da fase 8** — *"numa sala, a cadeia de quem criou define o que dá para jogar, e
  todos os presentes na conclusão recebem crédito na própria conta"* — é implementação direta
  deste ADR.
- **O grupo não se separa por causa de progresso desigual**, que era o modo de falha real: com
  interseção, a sala fica refém do jogador menos avançado; sem crédito, o convidado desiste de
  entrar.
- **Custo aceito:** a cadeia deixa de ser uma medida confiável de esforço individual. Está
  aceito porque a cadeia é **acesso a conteúdo**, não placar — o placar tem regras próprias e
  mais duras (ADRs 0006 e 0007).
- **Consequência para a sala:** o criador vira uma função relevante (a cadeia dele decide), então
  a UI precisa mostrar de quem é a cadeia em uso antes da entrada, e não depois.
- **O que passa a ser caro mudar:** a regra de crédito. Restringi-la depois exigiria revogar
  conclusões já gravadas, que é migração de progressão sobre dado que o jogador já viu.
