# Paridade com o DungeonGuys original

Verificado em: 2026-08-28 · último commit de código: `24f5e49`
(este documento entra no commit seguinte).

Este documento fecha a Task 21 do Marco 0. Cada item da lista abaixo está
num de três estados:

- **[x] verificado** — provado por um teste automatizado, com o arquivo de
  teste citado. Código que "parece certo" mas não tem teste **não** conta.
- **[ ] aguardando o humano** — depende de olho, ouvido, mão ou hardware
  (aparência, som, tato, 60 FPS com o mundo cheio, instalar o PWA num
  celular). Só uma pessoa jogando os dois lado a lado fecha esses.
- **[ ] sem cobertura** — o comportamento existe no código mas nenhum teste
  o prova; está anotado com o arquivo/linha para quem for cobrir depois.

## Como os números deste documento foram obtidos

Três metodologias, e cada número abaixo diz de qual veio:

- **Porte (medido, headless).** A simulação é pura e determinística, então
  ela foi carregada fora do navegador e conduzida por um bot de política
  fixa: mira no inimigo vivo mais próximo, ataca sempre, especial sempre
  que sai do cooldown, mantém distância de 70% do alcance da arma (recua
  abaixo de metade disso), desvia até 300px para pegar a moeda mais
  próxima, nunca corre e nunca compra nada na loja. 40 a 800 seeds por
  configuração, 5 waves por run, milissegundos por run. Números exatos,
  com desvio padrão.
- **Original (medido, console do navegador).** O mesmo bot, reescrito no
  console de `http://127.0.0.1:8080/`, alimentando `touchVec`/`touchActive`
  e `keys['Space']` do original e lendo `gameState`, `wave`, `waveActive`,
  `enemies`, `coins`, `runGoldEarned`, `gold` e `player` direto do escopo
  global. **Nenhum arquivo do original foi tocado** — é tudo injeção em
  tempo de execução, como um humano digitando no console. O original roda
  em tempo real, então a amostra é bem menor: 22 runs de 5 waves.
- **Derivado (geometria fechada).** Onde a fórmula é fechada (distância de
  spawn, distância do baú), a distribuição foi calculada por Monte Carlo
  (400.000 amostras) sobre a *fórmula do próprio original*, sem jogar.
  Isso é mais exato do que medir e está marcado como "derivado".

O `PLAY` do original é a viewport: medido em 929x861 no navegador em que as
leituras foram feitas, ou seja uma área jogável de 865x733. O porte usa
2400x1600 (`world.play` = 2336x1472), 4,17x maior.

### Ressalva importante: o original depende da taxa de quadros

O porte simula em passo fixo de `DT_MS = 16,67ms` (`src/app/loop.ts`
acumula e chama `step` em fatias). O original simula com o `dt` real do
`requestAnimationFrame` (`dt = min(ts - lastTime, 50)`), e o monitor da
máquina onde as leituras foram feitas roda a **180Hz** — `dt ≈ 5,55ms`.

Quase tudo no original escala linearmente por `dt/16.67` e é indiferente à
taxa de quadros, mas o caminho da moeda **não é**: `c.vx *= 0.92` acontece
por *quadro*, não por segundo. O deslocamento total do arremesso de uma
moeda é `v/(1-0.92) * factor` = **12,5·v px a 60Hz contra 4,17·v px a
180Hz**. Ou seja: num monitor de 180Hz as moedas se espalham ~12px menos e
o jogador perde menos moeda.

Como a taxa de moedas perdidas é exatamente a métrica da alavanca do ímã,
o original foi lido em **dois grupos**:

1. **grupo A (10 runs)** — original nativo, a 180Hz;
2. **grupo B (12 runs)** — `window.update` (declaração de função de topo em
   script clássico, logo propriedade do objeto global e substituível de
   fora) envolvido por um acumulador que chama o `update` original em
   fatias de exatamente `1000/60` ms. O original passa a simular com o
   **mesmo passo do porte**, ainda sem tocar em nenhum arquivo.

Os dois grupos aparecem separados em tudo que depende disso.

---

## Classes (jogar uma wave com cada)

- [x] mage / archer / warrior / ninja / priestess / witch / coprobo —
      **ataque e especial** corretos
      — `tests/defs.test.ts` (as 7 classes com 3 tiers cada; todo tier com
      dano `[min,max]` e `fireRate`; melee tem `arc`/`knockback` e projétil
      tem `bulletSpeed`), `tests/special.test.ts` (as 7 classes lançam e
      gastam o cooldown; fireball, volley, whirlwind e dash checados um a
      um), `tests/combat.test.ts` (cooldown da arma, leque de `count > 1`,
      melee não cria projétil).
- [ ] **sprite e arma na mão** corretos — *aguardando o humano*. Desenho
      vive em `src/render/`, que não tem teste automatizado. Precisa de
      alguém comparando as duas telas.

## Progressão

- [x] Subir de nível abre 3 bênçãos filtradas pelo tipo de dano
      — `tests/xp.test.ts` ("oferece 3 opções distintas", "filtra as
      bênçãos pelo tipo de dano da classe").
- [x] Loja entre waves com 4 consumíveis + 4 equipamentos elegíveis
      — `tests/shop.test.ts` ("oferece 4 consumíveis e 4 equipamentos",
      "só oferece equipamento elegível para a classe").
- [x] Comprar arma troca o comportamento do ataque
      — `tests/shop.test.ts` ("arma de catálogo vira `player.weapon`
      achatada, com o nome do item") mais `tests/combat.test.ts`, que prova
      que `attack()` lê exatamente esse `player.weapon` (cooldown, leque,
      melee x projétil).
- [x] Escudo bloqueado por arma de duas mãos
      — `tests/equipment-equip.test.ts` ("shield blocked with 2H weapon") e
      `tests/shop.test.ts` ("escudo não é comprável com arma de duas mãos").
- [ ] Delta de comparação correto (incluindo dano médio)
      — *aguardando o humano*. A conta está em `src/ui/shop.ts:56-73` e usa
      a média `(damage[0]+damage[1])/2`, mas `ui/` não tem teste; ninguém
      prova que o número que aparece na tela é o certo.
- [x] Reroll encarece; curar custa 10 e cura 30
      — `tests/shop.test.ts` ("curar custa e cura 30, e não roda com hp
      cheio", "reroll troca as ofertas e fica mais caro a cada vez").
      `HEAL_PRICE = 10` em `src/sim/defs/items.ts:31`.

## Combate

- [x] Crítico, esquiva, bloqueio, lifesteal, burn, chill
      — crítico, lifesteal, burn e chill em `tests/combat.test.ts`
      ("crítico a 100% dobra e anuncia", "lifesteal a 100% cura 1 quando
      ferido", "burn e chill aplicam seus efeitos quando procam"); esquiva
      e bloqueio em `tests/player.test.ts` ("dodge a 100% anula o golpe e
      emite DODGE", "block é limitado a 75%"); o burn drenando hp e
      expirando em `tests/enemies.test.ts:122`.
- [ ] **Poison** — **sem cobertura, nem a aplicação nem o dano ao longo do
      tempo.** `applyPoison` (`src/sim/combat.ts:183`) só é chamado de
      `src/sim/bullets.ts:86`
      (`if (b.poison && !e.dead) applyPoison(e, b.poison.dps, b.poison.dur)`)
      e nenhum teste passa por ali. Cuidado com o nome do teste
      `tests/enemies.test.ts:122`, "burn e poison drenam hp e expiram": ele
      só escreve `e.burnT`/`e.burnDps` e só asserta `e.burnT`. `poisonT` não
      é escrito nem assertado em nenhum lugar da suíte.
- [x] Pierce atravessa; fireball explode em área
      — `tests/combat.test.ts` ("pierce atravessa e não rebate no mesmo
      alvo"), `tests/special.test.ts` ("fireball do mago cria um projétil
      com área").
- [x] Knockback no melee; caixas quebram
      — `tests/combat.test.ts` ("empurra o alvo para longe", "quebra caixas
      dentro do arco"), `tests/arena.test.ts` ("quebra a caixa e derruba 1
      ou 2 moedas", "dano insuficiente não quebra").

## Waves

- [x] 16 waves na campanha; endless não termina
      — `tests/run.test.ts` ("a campanha vence ao limpar a última wave",
      "no endless não há vitória, só a próxima wave").
- [x] Mini-boss nas waves 4 e 12; chefe na 16
      — `tests/boss.test.ts` ("as waves de mini-boss trazem o mini-boss
      certo": 4 -> `goblin_chief`, 12 -> `necro_lord`; "a wave final da
      campanha traz o chefe final": `WAVES_TOTAL` -> `ogre_warlord`; "waves
      comuns não têm chefe": 1 e 3) e `tests/defs.test.ts` ("as waves de
      mini-boss apontam para inimigos existentes marcados como boss").
- [ ] Chefe na wave **8** — **sem cobertura**. O ramo `BOSS_WAVES[w]` de
      `bossPlanForWave` (`src/sim/boss.ts:142`) é exercitado pela wave 16, e
      a tabela é `BOSS_WAVES = { 8: 'zombie_king', 16: 'ogre_warlord' }`
      (`src/sim/defs/enemies.ts:44`), então o mecanismo está provado — mas
      nenhum teste asserta a chave 8, e o teste de tabela em
      `tests/defs.test.ts` percorre apenas `MINIBOSS_WAVES`.
- [x] Os 5 mutadores **aparecem**
      — `tests/defs.test.ts` ("os 5 mutadores têm nome e descrição"). Da
      regra de sorteio, só a **exclusão em wave de chefe** tem teste:
      `tests/run.test.ts:57-64` ("waves de chefe não sorteiam mutador")
      entra na wave 4 e asserta `waveHasBoss === true` e
      `waveMutator === null`.
- [ ] Os 5 mutadores **fazem o que dizem** — parcial.
      `swarm`, `frenzy` e `bounty` estão provados em `tests/enemies.test.ts`.
      **Sem cobertura:** `elite` (a inundação de campeões é a
      `eliteChance` em `src/sim/enemies.ts:175-177`) e `fog` (visão
      limitada; é puramente `src/render/`, então também é *aguardando o
      humano*).
- [ ] O portão `wave >= 3` e o sorteio de 40% do mutador — **sem
      cobertura**. Os dois estão em `src/sim/run.ts:171`
      (`!world.waveHasBoss && world.wave >= 3 && world.rng.next() < 0.4`) e
      são fiéis ao original (`ORIG/engine.js:270`), mas nenhum teste entra
      numa wave abaixo de 3 para confirmar que o mutador não sai, e nenhum
      amostra a frequência. O teste citado acima prova só a cláusula do
      chefe.
- [ ] Elites a partir da wave 3 — **sem cobertura**. A trava está em
      `src/sim/enemies.ts:178` (`world.wave >= 3 && type !== 'mimic' && ...`)
      e é idêntica ao original (`ORIG/entities.js:192`), mas nenhum teste a
      exercita: `tests/enemies.test.ts` chama `makeElite` direto, sem passar
      pelo portão.

## Meta

- [ ] Soul gold acumula ao fim da run — *aguardando o humano*. Está em
      `src/app/forge.ts` / `src/ui/settings.ts`; a camada `app/` não tem
      teste automatizado neste marco.
- [x] Upgrades do forge fazem efeito na run seguinte — **o efeito dentro da
      run está provado**: `vigor`/`honed`/`fleet`/`startgold` em
      `tests/player.test.ts` ("aplica os perks de forge na camada
      permanente"), `merchant` em `tests/shop.test.ts` ("o perk merchant
      desconta"), `wise` em `tests/xp.test.ts` ("o perk wise do forge
      aumenta o xp ganho"), `golden` em `tests/loot.test.ts` ("o perk golden
      pode dobrar uma moeda, e o sorteio é incondicional").
- [ ] ...mas a ligação `Save` -> `RunConfig.forge` (comprar no forge e ver
      valer na próxima run) é `src/app/save.ts`/`src/app/forge.ts`, **sem
      cobertura** — *aguardando o humano*.
- [ ] Desbloqueio de ninja (wave 6), coprobo (wave 10), witch (nível 8)
      — **sem cobertura**. A simulação emite os eventos
      (`src/sim/run.ts:187-188` para ninja e coprobo, `src/sim/xp.ts:61`
      para witch) e `src/ui/settings.ts:92` os consome, mas nenhum teste
      cobre a emissão nem o consumo. Ver também a questão aberta sobre
      coprobo mais abaixo.
- [ ] Recordes por classe — *aguardando o humano*. `src/app/save.ts` +
      `src/ui/settings.ts:76-85` (`refreshClassRecord`), sem teste.

## Plataforma

- [ ] Controles touch num viewport de celular — *aguardando o humano*.
      `src/ui/touch.ts` existe e alimenta `app/input.ts` com o vetor
      analógico, mas só um dedo num celular fecha isso.
- [ ] PWA instalável e funcional offline — *aguardando o humano*. O
      `public/sw.js` foi reescrito na Task 20 (o do original pré-cacheava
      arquivos que não existem neste build); instalar de verdade num
      dispositivo é o único teste que vale.
- [ ] 60 FPS com o mundo cheio (wave 12+) — *aguardando o humano*. O mundo
      é 4,17x maior e a arena tem 4,17x mais colunas/caixas/armadilhas; o
      tilemap é pré-renderizado uma vez por run (`src/render/tilemap.ts`) e
      o desenho é recortado pela câmera, mas ninguém mediu o frame time.

## Novo, sem paralelo no original

- [x] Mundo 2400x1600 com câmera presa às bordas
      — `tests/camera.test.ts` (centra no alvo, não passa de nenhuma das
      quatro bordas, centra o mundo quando a viewport é maior que ele) e
      `tests/world.test.ts` ("deriva os limites de jogo do WORLD, não de
      nenhuma janela").
- [ ] Redimensionar a janela não regenera a arena — **parcial**. O lado da
      simulação está provado (`tests/world.test.ts`: `world.play` vem de
      `WORLD`, nunca de um canvas; `tests/arena.test.ts`: `generateArena` é
      determinística por seed). O lado do app — `resize()` em
      `src/main.ts:29-33` só redimensiona o canvas, e `render/tilemap.ts`
      pré-renderiza o piso uma vez por run — **não tem teste**: confirmar
      redimensionando a janela no meio de uma wave.
- [x] `npm test` verde, incluindo o teste de determinismo
      — 231 testes em 20 arquivos, verdes. `tests/determinism.test.ts`:
      mesma seed + mesmos inputs convergem em 600 ticks; seeds diferentes
      divergem; inputs diferentes divergem; o tick anda exatamente uma vez
      por `step`.

---

## Balanceamento do mundo grande (Task 21)

Quatro alavancas foram levantadas. **Duas mudaram, duas não** — e as que
não mudaram têm o número que justifica a decisão.

### 1. Ímã de moedas — **mudou**: `COIN_MAGNET` 80 -> 100

Métrica: *taxa de moedas perdidas* = moedas ainda no chão no instante em
que `waveActive` vira `false`, sobre (perdidas + coletadas na wave), waves
1 a 5. É exatamente o mesmo evento nos dois jogos — o porte não tem os
1500ms de folga pós-clear do original, e a medição é feita antes deles nos
dois lados, então a comparação é justa.

| | taxa de perda (média por run, waves 1-5) |
|---|---|
| original, grupo A — 180Hz nativo (10 runs) | 22,16% ± 2,21 |
| original, grupo B — passo fixo 16,67ms (12 runs) | 25,50% ± 2,05 |
| **original, agregado (22 runs)** | **23,98% ± 1,52** |
| porte ANTES, `COIN_MAGNET = 80` (800 seeds) | 28,51% ± 0,27 |
| **porte DEPOIS, `COIN_MAGNET = 100` (800 seeds)** | **24,66% ± 0,24** |

Curva de resposta completa do porte (mage, 800 seeds cada):

| `COIN_MAGNET` | 80 | 85 | 90 | 95 | **100** | 105 | 110 | 120 |
|---|---|---|---|---|---|---|---|---|
| taxa de perda | 28,51% | 27,31% | 26,14% | 25,37% | **24,66%** | 23,67% | 23,07% | 21,93% |

Por classe (400 seeds cada): mage 28,79% -> 24,88%; archer 33,05% ->
30,23%; warrior 14,96% -> 11,17% (amostra pequena — o bot melee morre em
~85% das runs, então esse número é indicativo, não medido de verdade).

**O ponto de partida de 130 sugerido pelo brief está refutado:** com 130 o
porte cai para ~20,5%, ficando mais generoso que qualquer leitura do
original.

Duas ressalvas honestas sobre esta alavanca:

1. Contra o **grupo B sozinho** (o que casa exatamente com o passo de tempo
   do porte), a diferença 28,51% x 25,50% tem p ≈ 0,17 — não é
   estatisticamente distinguível de zero com 12 runs. É contra o agregado
   dos 22 runs (23,98% ± 1,52) que a diferença fica significativa
   (p ≈ 0,008). Se o humano preferir travar no grupo B, o valor indicado
   seria 95 e não 100; se preferir travar no que ele vê no monitor de
   180Hz dele (grupo A), o valor indicado seria ~118.
2. A premissa do brief — "num mundo maior o jogador cobre proporcionalmente
   menos área, e moedas ficam para trás" — **não** é o que os dados
   mostram. A distância média de uma moeda perdida até o jogador é
   praticamente a mesma nos dois jogos (original 151-272px por wave; porte
   215-266px por wave). Se o tamanho do mundo fosse a causa, as moedas
   perdidas do porte estariam mais longe. Não estão. O que sobra é uma
   diferença pequena e de origem ambígua, e por isso o ajuste foi pequeno.

### 2. Baú da wave — **mudou**: retângulo inteiro -> disco de 700px

O original sorteava o baú uniformemente no retângulo jogável, e esse
retângulo **era a tela** — todo baú aparecia na tela. Num mundo 4,17x maior
a mesma fórmula joga o baú longe demais para ser encontrado.

Distância baú -> jogador, **derivada** da fórmula de cada jogo com o
jogador em posição uniforme na área jogável:

| | média | p95 | máx |
|---|---|---|---|
| original | 369px | 668px | 968px |
| porte antes (retângulo inteiro) | 958px | 1843px | 2563px |
| porte depois (disco R=700, uniforme em área) | 399px | ~666px | 703px |

Confirmado **medindo a simulação** depois da mudança: média 401px, p50
414px, máx 700px sobre 12.117 baús sorteados. O disco usa `sqrt()` no raio
para ficar uniforme em área (sem isso o baú se amontoaria nos pés do
jogador) e gasta os mesmos dois sorteios do original, então a sequência do
rng mantém o comprimento. Commit `fix(sim): bau da wave nasce dentro de
700px de um jogador`.

### 3. Distância de spawn — **não mudou**: `SPAWN_MIN`/`SPAWN_MAX` seguem 420/620

Esta era uma hipótese a confirmar ou refutar, e a medição **confirma** que
o anel atual já reproduz o original.

O original põe o inimigo colado por dentro de uma parede
(`ORIG/entities.js:174-186`). Como a área jogável dele é do tamanho da
viewport, "colado na parede" é perto do jogador. O porte não pôde copiar
isso: numa arena de 2400x1600 o mesmo código faria o inimigo nascer a até
~1400px, fora da tela e irrelevante. Daí o anel de 420-620px
(`src/sim/enemies.ts:44-45`).

Distância de spawn -> jogador:

| | n | média | p05 | p50 | p95 | mín | máx |
|---|---|---|---|---|---|---|---|
| original, **medido** no jogo rodando | 1113 | **491px** | ~165px | ~499px | ~800px | 19px | 970px |
| original, **derivado**, jogador no centro | — | 445px | 353px | 440px | 542px | 351px | 557px |
| original, **derivado**, jogador uniforme | — | 506px | 141px | 515px | 843px | 0px | 1098px |
| porte, anel 420-620 (medido e derivado batem) | 2012 | **517px** | 438px | 514px | 598px | 420px | 620px |

A média do porte fica **5% acima** da média medida do original (517 contra
491). Em tempo até o contato — esqueleto de wave 1 (1,14 px/frame), jogador
parado, cálculo fechado nos dois lados: original 6,2s, porte 7,3s. Cerca de
um segundo a mais de aviso, e isso só no caso do jogador exatamente no
centro; com o jogador em posição uniforme as duas médias praticamente
coincidem.

O que o anel **não** reproduz é a variância: o original tem cauda dos dois
lados (p05 = 165px — o inimigo às vezes nasce praticamente em cima de um
jogador encostado na parede — e p95 = 800px, máx 970px). Um anel, por
construção, não tem cauda nenhuma. Mexer em `SPAWN_MIN`/`SPAWN_MAX`
moveria a média para *longe* da do original sem devolver a cauda.
**Nenhuma mudança, e a evidência é a tabela acima.**

Se um dia se quiser a cauda de volta, o caminho não é mexer nos dois
números: é trocar o anel por uma distribuição com cauda (por exemplo
sortear o raio de uma exponencial truncada). Isso é mudança de forma, não
de valor, e não cabia nesta task.

### 4. Densidade da arena — **não mudou**: `AREA_SCALE` segue 4,1667

`AREA_SCALE = (WORLD.w * WORLD.h) / (1280 * 720)` = **4,1667**
(`src/sim/arena.ts:7`). Ele preserva exatamente a densidade por pixel do
original: o original sorteava `4 + rand(3)` colunas/caixas e `2 + rand(2)`
armadilhas para uma arena de ~1280x720; o porte multiplica esses mesmos
números-base pela razão de área.

O critério do brief para essa alavanca é literalmente "jogue e veja se a
arena parece cheia demais ou vazia demais" — isso é julgamento humano, não
medição, e por isso **o valor foi deixado como está**. Fica como item
aberto:

- **subir** `AREA_SCALE` deixa a arena mais entulhada: mais cobertura
  contra flechas e bolts, mais caixas para quebrar (mais moedas), mas
  também mais chance de o jogador se prender e de o pathing burro dos
  inimigos travar numa coluna.
- **descer** deixa a arena mais vazia e mais rápida, com menos cobertura.
- Cuidado ao mexer, **nos dois sentidos, e são dois testes diferentes**:
  - **descer** quebra `tests/arena.test.ts:37-41` ("escala a quantidade com
    a área do mundo"), que exige `obstacles.length >= 16` e
    `traps.length >= 8` — só um piso, sem razão nem tolerância. O piso de
    colunas/caixas é `round(4 * AREA_SCALE)`, então qualquer `AREA_SCALE`
    abaixo de **3,875** derruba a asserção de obstáculos (e abaixo de 3,75
    a de armadilhas).
  - **descer** também pode quebrar `tests/arena.test.ts:43-49` ("regenerar
    zera o que havia antes"), que é o teste com a tolerância apertada
    `n * 1.5` (linha 48) — é este, e não o de cima, o teste que o minor
    adiado da Task 8 nomeou. Duas gerações seguidas sorteiam
    `want ∈ {round(4·AS), round(5·AS), round(6·AS)}` de forma independente,
    então a razão entre a maior e a menor encosta em 1,5 por construção e é
    o arredondamento que decide. Com AS = 4,1667 os valores são
    {17, 21, 25} e 25 ≤ 17 × 1,5 = 25,5 passa raspando; com AS = 3,6 seriam
    {14, 18, 22} e 22 > 14 × 1,5 = 21 falha.
  - Em qualquer um dos casos o limiar/tolerância do teste tem que ser
    revisto junto, deliberadamente — não é o teste que está errado, é a
    constante que mudou debaixo dele.

### Números lado a lado da run de 5 waves

Porte: bot mage, 40 seeds, headless, no `COIN_MAGNET = 100` atual.
Original: mesmo bot, 10 runs no grupo A e 12 no grupo B.

| duração da wave (s) | 1 | 2 | 3 | 4 | 5 |
|---|---|---|---|---|---|
| original, grupo A (180Hz) | 9,44 | 11,07 | 14,40 | 12,97 | 21,83 |
| original, grupo B (passo fixo) | 8,78 | 10,70 | 14,59 | 12,28 | 21,69 |
| porte | 8,90 | 12,09 | 15,05 | 15,04 | 22,16 |

| | ouro ao fim da wave 5 | nível ao fim da wave 5 |
|---|---|---|
| original, grupo A | 154,2 ± 25,8 | 6,20 |
| original, grupo B | 141,8 ± 24,3 | 6,00 |
| porte (`COIN_MAGNET = 100`) | 130,2 | 6,10 |
| porte (`COIN_MAGNET = 80`, antes) | 126,8 | 6,13 |

As durações de wave batem quase exatamente — é a evidência mais forte de
que o ritmo do combate foi preservado. O ouro do original vem um pouco
mais alto em parte porque o original dá 1,5s de folga depois do último kill
antes de abrir a loja (`setTimeout(openShop, 1500)` em
`ORIG/entities.js:566`) e o jogo continua rodando nesse intervalo,
recolhendo moeda; o porte chama `openShop` direto (desvio deliberado da
Task 19, documentado no cabeçalho de `src/sim/run.ts`). É o único desvio de
tempo com efeito mensurável em recurso, e é pequeno.

### Um comportamento estranho, idêntico nos dois

Durante as leituras, uma run do original travou: um necromancer (inimigo
atirador, que recua do jogador) andou para **fora** do `PLAY`, e como os
projéteis do jogador morrem ao cruzar a borda do `PLAY`, ele ficou
inalcançável com 1 de hp e a wave nunca fechou. Não é um defeito do porte —
o original não prende inimigo nenhum dentro dos limites, só o jogador
(`ORIG/combat.js:82-83`), e `src/sim/player.ts` / `src/sim/enemies.ts`
reproduzem isso exatamente. Fica registrado porque é um travamento real, no
original e no porte, e alguém vai encontrá-lo.

---

## Itens estacionados por tasks anteriores para decisão humana

### Posição do arco de espada (Task 17)

O porte desenha o arco do golpe corpo-a-corpo no `x,y` capturado no evento
`{ t: 'swing' }`, no instante do golpe. O original redesenha o arco na
posição **viva** do jogador a cada frame — ou seja, no original o arco
acompanha um jogador que anda durante os ~180ms do golpe, e no porte ele
fica parado onde o golpe saiu.

Foi um desvio **deliberado**, a favor de multiplayer: cada golpe pertence
ao seu autor, e seguir o jogador local estaria errado com 4 personagens em
tela. É puramente visual e pequeno. **Quem decide se incomoda é o humano,
jogando os dois lado a lado.**

### `AREA_SCALE`

Ver a seção 4 acima. Valor atual 4,1667, preserva a densidade por pixel do
original, e a decisão de mexer é humana.

### Coprobo deveria ficar travado até a wave 10?

**Questão aberta, nada foi mudado.**

O original deixa o coprobo jogável desde um save novo: ele não tem entrada
em `UNLOCKS`, e é `UNLOCKS` (não a lista `unlocked` do save) que decide se
uma carta de classe aparece trancada. O `ORIG/engine.js:287` ainda chama
`tryUnlock('coprobo')` na wave 10, mas isso não tem efeito nenhum — é
redundante no próprio original.

O porte reproduz isso exatamente: `src/ui/settings.ts:48-52` não tem
entrada para coprobo, e `src/sim/run.ts:188` ainda emite
`{ t: 'unlock', cls: 'coprobo' }` na wave 10, pela mesma razão de
fidelidade.

Na Task 20 o coprobo chegou a ser trancado e a trava foi revertida por ser
mudança de balanceamento não pedida. **Se o coprobo *deveria* exigir wave
10 é decisão de design, não de porte.** Se a resposta for sim, o conserto é
uma linha em `UNLOCKS` (`coprobo: 'REACH WAVE 10'`) — e aí é uma mudança
consciente em relação ao original, não uma correção.

---

## Nota: `src/sim/` é puro

Confirmado por varredura em todo `src/sim/**/*.ts`: nenhuma referência a
`document`, `window`, `navigator`, `localStorage`, `performance`,
`requestAnimationFrame`, `setTimeout`, `setInterval`, `Math.random` ou
`Date.now` fora de comentários, e nenhum import de `render/`, `ui/` ou
`app/`. A regra de lint que mantém isso assim está em
`eslint.config.js:7-27` (`no-restricted-globals` + `no-restricted-properties`
+ `no-restricted-imports`, escopo `src/sim/**/*.ts`).

Ressalva: essa garantia hoje é **só do lint**. Não existe um teste em
`tests/` que faça essa varredura, então `npm test` sozinho não a prova —
`npm run lint` precisa continuar no caminho.
