# 0012 — Objetivos como campo do `World`

- **Origem:** FORM-08 (`.planning/REQUIREMENTS.md`), com a forma do campo deixada ao planejador
- **Requisito:** FORM-08
- **Consumido por:** fase 1 (`sim/serialize.ts`) e fase 8 (modo missão), critério 5
- **Estado:** aceito em 2026-08-31

## Contexto

A regra do projeto, fixada no Marco 0, é que **eventos são a única saída do sim**. Ela está
escrita no próprio código, em dez linhas:

```ts
// src/sim/world.ts:54-57
/** The only way sim/ talks to the outside world (T5). */
export function emit(world: World, event: SimEvent): void {
  world.events.push(event);
}

// src/sim/step.ts:35-40
/** Hands the tick's events to app/ and clears them. */
export function drainEvents(world: World): SimEvent[] {
  const out = world.events;
  world.events = [];
  return out;
}
```

O modo missão (fase 8) precisa de objetivos com estado: quantos inimigos do alvo já caíram, quanto
tempo resta na limpeza cronometrada, quantos itens foram entregues. A pergunta é se isso sai por
evento, como todo o resto, ou se vira campo do `World`.

O critério 5 da fase 8 decide: *"a conclusão da missão é verificável por replay: re-rodar a seed e
o log chega ao mesmo desfecho de objetivo"*.

## Opções

| Opção | Custo | Por que foi recusada / aceita |
|---|---|---|
| **Objetivo como evento drenável**, seguindo a regra geral | Zero em desenho | Recusada. `drainEvents` **esvazia** `world.events` a cada tick, e quem drena é `app/`. O que `app/` consumiu **não sobrevive ao snapshot**: um verificador que re-roda a run reconstrói o mundo, não o que a UI de outra pessoa viu. Objetivo por evento é objetivo não verificável |
| **Objetivo em `app/`**, alimentado por eventos do sim | Baixo | Recusada pelo mesmo motivo, agravado: a regra de conclusão sairia de `sim/`, e o verificador da fase 9 teria de reimplementá-la — duas implementações que divergem com o tempo, e a divergência aparece como "replay não confere" |
| **Objetivo como campo do `World`** | Um campo a mais no snapshot e no round-trip | **Aceita.** É a exceção deliberada à regra dos eventos, e é o que torna o critério 5 alcançável |
| **Campo opcional**, presente só em run de missão | Zero aparente | Recusada. Ver a doutrina de forma estável, abaixo |

## Decisão

**`world.objectives` é campo do `World`**, e essa é a **exceção deliberada** à regra de que
eventos são a única saída do sim.

A regra continua valendo para todo o resto: `emit` e `drainEvents` seguem sendo o canal de saída
para HUD, áudio e efeito. O que muda é que o **estado** do objetivo — não a notificação sobre ele
— vive dentro do mundo, é avaliado dentro de `sim/`, entra no `hashWorld` e faz round-trip por
`sim/serialize.ts` como qualquer outro campo (FORM-07). Eventos de objetivo continuam existindo
para a UI reagir sem varrer estado; eles são **derivados** do campo, nunca a fonte dele.

### Forma estável, sempre presente

`world.objectives` é **sempre presente e sempre com a mesma forma**, inclusive numa run de
campanha ou de endless que não tem missão nenhuma — nesse caso, com a lista de objetivos vazia.

Isto segue a doutrina já registrada em `src/sim/types.ts:130-133`, sobre `eliteName` e
`eliteTint`:

> *"Both are always present (null until makeElite runs) so every Enemy has the same shape — an
> optional key would come and go across snapshots."*

Uma chave opcional **iria e viria entre snapshots**: dois mundos idênticos hasheariam diferente
conforme a chave existisse ou não, e o codec binário da fase 3 teria de carregar um bit de
presença por campo. Forma estável é o que faz `hashWorld` significar a mesma coisa em toda run.

## Consequência

- **O critério 5 da fase 8 fica alcançável:** re-rodar seed e log reconstrói o estado do objetivo,
  porque ele está no mundo. A conclusão da missão é verificável pelo mesmo caminho que o score.
- **A regra de conclusão mora em `sim/`, uma vez só.** Não existe segunda implementação no
  verificador para divergir da primeira.
- **`world.objectives` entra no `SIM_VERSION`.** Mudar a regra de um objetivo muda o resultado de
  um replay, e portanto **fecha a temporada** pelo ADR 0005 — o que é correto, e é o mesmo
  tratamento que rebalancear um inimigo recebe.
- **Custo aceito:** o snapshot cresce, e a fase 3 já opera perto do limite (13,8 KB medidos contra
  16 KiB). Uma lista vazia em run sem missão custa quase nada; uma missão ativa custa o estado dos
  objetivos dela, e o desenho do campo (deixado ao planejador) tem esse orçamento como restrição.
- **Custo aceito:** a exceção à regra dos eventos precisa ser lembrada. Este ADR é o lugar em que
  ela está escrita, para que a próxima pessoa que ler `emit` e `drainEvents` não a tome por
  descuido.
- **O que passa a ser caro mudar:** a decisão em si, depois da fase 8. Migrar objetivo de campo
  para evento invalidaria todo replay de missão guardado.
