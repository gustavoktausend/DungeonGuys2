# 0004 — Settings: identidade sincroniza, preferência fica no aparelho

- **Origem:** D-33 (`.planning/phases/01-formato-e-costuras/01-CONTEXT.md`)
- **Requisito:** CONTA-05, CONTA-06
- **Consumido por:** fase 6 (contas, progressão na nuvem e offline), critério 2
- **Estado:** aceito em 2026-08-31

## Contexto

O bloco `settings` de `src/app/save.ts` mistura duas naturezas num objeto só:

```
settings: { mute, autoAim, name, colors, mode, volume, shake }
```

`name` e `colors` são **identidade** — é o que os amigos veem na sala. `volume`, `mute`,
`autoAim`, `shake` e `mode` são **preferência do aparelho** — dependem de fone, de tamanho de
tela e de o controle ser toque ou mouse.

CONTA-06 exige que o nome e a aparência cheguem aos amigos na sala **sem redigitar**. Se
`settings` inteiro ficar por aparelho, o jogador redigita nome e cor em todo navegador novo. Se
`settings` inteiro sincronizar, o volume que ele ajustou no desktop pisa no volume do celular —
e `src/app/input.ts` já trata auto-aim de forma diferente entre toque e mouse, então sincronizar
`autoAim` quebraria o controle no aparelho de destino.

Isto é decisão de formato porque decide **o que o servidor guarda**. Um campo que sincroniza
precisa de carimbo de tempo gravado junto; um campo que não sincroniza nunca sai do
`localStorage`.

## Opções

| Opção | Custo | Por que foi recusada / aceita |
|---|---|---|
| **Tudo por aparelho** | Zero | Recusada. Contradiz CONTA-06 diretamente: o jogador redigita nome e cor em todo aparelho |
| **Tudo sincroniza** | Zero | Recusada. Sincronizar o volume do desktop para o celular é bug, não recurso, e sincronizar `autoAim` quebra o controle entre toque e mouse |
| **Perfil de settings por aparelho, escolhido no login** | Médio — uma tela nova e um conceito novo | Recusada. Resolve o problema com um seletor que o jogador teria de entender, para um ganho que a divisão por campo já entrega |
| **Divisão por campo: identidade sincroniza, preferência não** | Um carimbo de tempo por campo sincronizado | **Aceita.** É a menor divisão que satisfaz CONTA-06 sem estragar o aparelho de destino |

## Decisão

O bloco `settings` é dividido em dois grupos, com regras diferentes.

### Sincroniza — identidade

- **`name`**
- **`colors`**

Regra de merge: **última escrita com carimbo de tempo**. É a única regra da qual last-write-wins
é a resposta certa, porque não há noção de "maior" nem de "união" para um nome: o jogador quer o
valor que ele escolheu por último, em qualquer aparelho. O carimbo é gravado **junto com o
valor**, no ato da edição, e viaja com ele na sincronização.

Motivo: CONTA-06 exige que cheguem aos amigos na sala sem redigitar. O nome e a cor são o que
identifica o jogador na tela dos outros três — é a única parte de `settings` que outra pessoa vê.

### Não sincroniza — preferência do aparelho

- **`volume`**
- **`mute`**
- **`autoAim`**
- **`shake`**
- **`mode`**

Ficam **por aparelho**, no `localStorage`, e nunca sobem para o servidor. Sincronizar o volume do
desktop para o celular é bug, não recurso. `autoAim` é o caso mais explícito: `src/app/input.ts`
já o trata de forma diferente entre toque e mouse, e um valor vindo do outro aparelho chegaria
errado por construção. `shake` depende de tamanho de tela e de tolerância pessoal a movimento;
`mode` é onde o jogador parou naquele aparelho.

## Consequência

- **O critério 2 da fase 6** — *"o nome e a aparência chegam aos amigos na sala sem redigitar
  nada"* — é atendido por dois campos, não pelo bloco inteiro.
- **O servidor guarda dois campos de settings, com carimbo**, e mais nada. A superfície de
  sincronização de preferência é zero, então não há classe de bug "o aparelho errado ganhou".
- **Custo aceito:** trocar de aparelho reajusta volume, vibração e auto-aim. É trabalho de dez
  segundos e é feito uma vez por aparelho — contra o risco permanente de um ajuste remoto piorar
  o aparelho em uso.
- **O que passa a ser caro mudar:** o carimbo de tempo de `name` e `colors` precisa ser gravado
  desde a primeira versão que sincroniza. Acrescentá-lo depois deixa todo valor já gravado sem
  ordem, e o primeiro merge vira sorteio.
