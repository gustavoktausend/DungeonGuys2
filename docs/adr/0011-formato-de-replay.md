# 0011 — Formato do artefato de run

- **Origem:** D-10, D-11, D-12, D-04 (`.planning/phases/01-formato-e-costuras/01-CONTEXT.md`)
- **Requisito:** FORM-06 (com FORM-03 e FORM-07)
- **Consumido por:** fase 4 (captura do log na autoridade) e fase 9 (verificação), critérios 1 e 3
- **Estado:** aceito em 2026-08-31

## Contexto

A fase 9 só aceita um score depois de **re-rodar a run inteira** a partir da seed e do log de
inputs. O que a autoridade grava na fase 4 é, portanto, o insumo de um sistema que ainda não
existe — e uma vez que houver replays guardados e placar aberto, o formato não pode mais mudar
sem invalidar o histórico.

Três forças puxam o desenho em direções diferentes: o artefato precisa ser **inspecionável** (um
replay que ninguém consegue abrir é um replay que ninguém depura), **pequeno** (uma run de 20 min
são 72.000 ticks) e **suficiente** (tudo que a run precisa para ser reconstruída, e nada que a
torne forjável).

## Opções

| Opção | Custo | Por que foi recusada / aceita |
|---|---|---|
| **Snapshot inicial embutido** em vez de partir da seed | Médio — e perigoso | Recusada. Um snapshot inicial adulterado é um `World` inicial arbitrário: o verificador re-roda a partir do que o atacante mandou. Partir da seed torna o setup **derivado**, não declarado |
| **Checkpoints periódicos de hash** dentro do formato | Baixo | Recusada por D-11. Convidam a verificação amostrada, que é verificação parcial vendida como completa; e mascaram divergência de setup, porque o primeiro checkpoint válido esconde os ticks anteriores |
| **Binário puro**, sem envelope legível | Baixo | Recusada. Abrir um replay passaria a exigir ferramenta própria, exatamente quando o problema a depurar é "por que este replay não confere" |
| **JSON puro**, com o log como array de objetos | Zero | Recusada por tamanho: o log é 99% dos bytes, e JSON por tick estoura o orçamento de 100 KB por run |
| **Envelope JSON legível + log binário em base64** | Baixo | **Aceita.** Inspecionável onde importa, compacto onde pesa |

## Decisão

### O envelope (D-10)

O artefato de run é um **envelope JSON legível**, contendo:

- a **seed**;
- o **`RunConfig`** completo, com `players[]` na ordem canônica (FORM-02);
- o **`SIM_VERSION`** (FORM-03), que o ADR 0005 usa para aceitar ou recusar;
- o **score alegado**;
- o **`hashWorld` final**;
- o **teto de ticks** (ver abaixo);
- o **log de inputs**, como **blob binário em base64** dentro do próprio envelope.

Dá para abrir um replay num editor de texto e ler tudo que importa sem ferramenta; o log — que é
99% dos bytes — fica compacto. Orçamento: 20–40 KB gzipado por run de 20 minutos.

### O replay parte da seed (D-11)

O verificador roda **`createWorld(config)`** (`src/sim/world.ts:6`) e **`generateArena`**
(`src/sim/arena.ts:22`) a partir da seed e do `RunConfig` do envelope, e **só então** aplica o
log.

- **Não há snapshot inicial embutido.**
- **Não há checkpoints periódicos de hash no formato.**

Consequência buscada: um setup divergente **falha no tick 0**, em vez de ser mascarado por um
checkpoint válido mais adiante.

### O log (D-12, D-04)

- Gravado **por tick, só o que mudou** — delta mais RLE. Um jogador só aparece no tick em que o
  `InputState` dele muda; o input muda cinco a dez vezes por segundo, não sessenta.
- A ordem dentro do tick é a **ordem canônica do `RunConfig`**.
- É a tabela **resolvida pela autoridade**, **não o tráfego que chegou**.
- **Política de preenchimento de buracos (D-04), que é parte do formato e não do código de rede:**
  quando o input de um jogador **não chega a tempo** do tick, a autoridade **repete o último input
  conhecido** daquele jogador e **grava isso** no log. O log é o que a simulação consumiu, e por
  isso é reproduzível por construção.

### Teto de ticks — no formato, desde agora

O envelope carrega um **campo de teto de ticks desde agora**, mesmo que quem o **aplica** seja a
fase 9. Acrescentar o campo depois de existirem replays é migração de formato.

Valor de referência: **`60 × 3600 × 3` ticks** — sessenta ticks por segundo, três horas de
parede. É o orçamento duro do worker de replay: um log adversarial alegando uma run de dez horas
são 2,16 milhões de ticks, e dez submissões em paralelo derrubam uma VPS pequena. O teto tem de
ser **estrutural**, não uma checagem que alguém pode esquecer de aplicar num endpoint novo.

O ADR 0005 registra a contrapartida de produto: como não há verificação amostrada, o teto de
duração para endless será **explícito e comunicado na UI**, e o número final é escolha da fase 9,
com o campo já esperando por ele aqui.

### Política de `-0`

O formato **canoniza `-0` para `+0` na captura** — `| 0` depois do `Math.round`, no ato de
quantizar o input (D-02, D-03) — e **não** o preserva.

O motivo é que `-0` **não sobrevive ao round-trip por JSON**: `JSON.stringify(-0)` produz `"0"`, e
o sinal se perde em silêncio. E o `hashWorld`, que passa pelo **mesmo caminho lossy**, não
consegue detectar essa perda: um teste de "round-trip verificado por hash" **passaria com o dado
já corrompido**. Canonizar na captura é o que impede o formato de carregar um valor que ele não
sabe representar.

### Verificação amostrada está fora

D-11 fechou essa porta **para a fase 9**. Sem checkpoints periódicos no formato, não há o que
amostrar: a verificação é integral ou não é.

## Consequência

- **O critério 1 da fase 9** — *"um score só aparece depois de o servidor re-rodar a run a partir
  da seed e do log e chegar ao mesmo resultado"* — é possível porque nada do estado inicial é
  declarado pelo cliente: tudo é derivado da seed.
- **O critério 3 da fase 9** — teto de ticks, de bytes e de tempo de parede — encontra o campo de
  teto já no artefato, e não precisa inferi-lo.
- **Consequência para a fase 3 (snapshot):** se o snapshot virar **codec binário**, `-0` e `+0`
  têm **padrões de bits diferentes** em `Float64Array`. A canonização na captura, decidida aqui, é
  o que impede que essa diferença vire divergência de hash entre o caminho JSON e o caminho
  binário. `sim/serialize.ts` precisa normalizar `-0` no hash pelo mesmo motivo.
- **Custo aceito:** o log passa a ser a versão da autoridade dos fatos. Em co-op, o host **pode**
  omitir inputs alheios, e não há defesa perfeita em P2P. A defesa suficiente é que forjar um log
  que produza score alto exige **jogar bem** — e é por isso que o ADR 0006 separa solo de co-op
  por coluna e o v1 rankeia só solo.
- **Custo aceito:** base64 infla o log em 33% dentro do envelope. Compensa pela inspecionabilidade,
  e o gzip do transporte devolve boa parte.
- **O que passa a ser caro mudar:** todos os campos do envelope, a partir do primeiro replay
  guardado — em especial o teto de ticks e a ausência de checkpoints, que são justamente os dois
  que este ADR fixa antes de o formato ter usuário.
