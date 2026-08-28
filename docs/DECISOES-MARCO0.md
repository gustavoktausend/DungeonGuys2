# Decisões do Marco 0

Durante a execução do plano do Marco 0, apareceu o que o plano não previa: conflitos
entre tasks, defeitos no próprio plano, achados de revisão que contrariavam o que
estava escrito. Cada um foi decidido na hora, com o motivo e o custo caso a decisão
esteja errada — para que dê para desfazer o que ficou ruim sem reconstituir o
raciocínio meses depois.

São 37 decisões, em ordem de execução. As das tasks 1–19 foram tomadas em 2026-08-27;
as das tasks 20–21 e da revisão final do branch, em 2026-08-27/28.

Três merecem leitura mesmo de quem não vai mexer no código, porque são casos em que o
**plano estava errado e o processo pegou**:

- **Task 8 (`rectCircle`)** — o plano tratava (rx,ry) como canto superior esquerdo; o
  original trata como centro. Não corrigido, a detecção de acerto de projétil ficaria
  deslocada em metade da largura do inimigo no jogo inteiro.
- **Task 9 (teste de determinismo)** — o teste que o spec chama de "guardião de toda a
  arquitetura" passava pelo motivo errado: `hashWorld` incluía a seed, então dois mundos
  com seeds diferentes já divergiam no tick 0, sem nada ter simulado.
- **Task 21 (ímã de moedas)** — o valor 130 sugerido pelo próprio plano foi refutado por
  medição: poria o porte em ~20,5% de moedas perdidas, mais generoso que qualquer
  leitura do original. O valor adotado foi 100.

Ver também `docs/PARIDADE.md` (o que está e o que não está verificado contra o original)
e `docs/BACKLOG.md` (o que ficou aberto de propósito).

---

## Task 1

a sonda da barreira exercitou só window/Math.random/Date.now; a restrição de import (`**/render/**`, `**/ui/**`, `**/app/**`) não foi confirmada empiricamente. — Em vez de abrir uma rodada de correção por um Minor, carrego a sonda de import para o dispatch da Task 2, que é a primeira a criar arquivo sob src/sim/. — Custo se errado: baixo e detectado cedo — se a regra de import não disparar, a Task 2 acusa na hora, e nada entre a Task 1 e a Task 2 depende dela.


## Task 4

não bloquear por verificação de navegador indisponível. — O plano tem etapas de conferência manual no navegador em 8 tasks (4, 10, 12, 15, 17, 18, 19, 20) e nenhuma ferramenta desta sessão consegue executá-las. A lógica em questão continua coberta por leitura de código na revisão e por testes unitários onde possível; o que só o olho humano pega — enquadramento, animação, som, toque — vai ser reunido numa única lista de conferência prática para o usuário, que é exatamente o que a Task 21 já produz em docs/PARIDADE.md. Acrescentar lá os itens de navegador adiados de cada task. — Custo se errado: médio e visível — um defeito puramente visual ou de sensação sobreviveria até a conferência final em vez de ser pego na task de origem. Nenhum defeito de lógica escapa, porque esses têm teste.


## Task 5

`ShopItem.dmgKind` em types.ts está largo demais — o revisor achou que ele admite 'ranged' (via a união com Archetype), enquanto o vocabulário real é 'melee'|'arrow'|'elemental', como o Blessing.dmgKind ao lado já faz certo. É um defeito meu, do plano. Nenhum item atual usa 'ranged' e nada consome o campo até a loja, então aperto o tipo na Task 19, onde o filtro é implementado e onde a confusão morderia. — Custo se errado: baixo — um item futuro com 'ranged' sumiria da loja em silêncio; nenhum existe hoje.


## Task 8

o `rectCircle` que escrevi no plano está errado. O original (ORIG/items.js:354-358) trata (rx,ry) como o CENTRO do retângulo (`rx - rw/2` a `rx + rw/2`) e usa `<` estrito; o do plano trata como canto superior esquerdo e usa `<=`. Conferi os dois chamadores (combat.js:375 e entities.js:419): ambos passam `e.x, e.y`, que é o centro do inimigo. Logo o original está certo e o plano está errado. — Portar o original fielmente e corrigir o terceiro caso do teste, que assumia a semântica de canto e falharia contra o port fiel. — Custo se errado: alto se ignorado — a detecção de acerto de projétil ficaria deslocada em metade da largura do inimigo em todo o jogo.


## Task 9

aceitar a correção que o implementador fez no meu teste de hpRegen. O teste do plano setava `p.permStats.hpRegen = 5`, mas `updatePlayer` lê `p.stats.hpRegen`, que é a camada derivada — e nada re-derivava. Do jeito que escrevi, o teste falharia. A correção (setar também `p.stats.hpRegen`) espelha exatamente o que o teste de armadura logo abaixo já fazia. O implementador sinalizou em vez de absorver em silêncio, que é o comportamento certo. — Custo se errado: nenhum; a alternativa seria chamar recalcStats(p), equivalente.


## Task 9 — achado Importante, rotulado plan-mandated

o teste "seeds diferentes divergem" passa por motivo errado. `hashWorld` inclui `world.config`, que carrega a seed — então dois mundos com seeds diferentes já divergem no tick 0, sem nada ter simulado. Pior: com arena vazia e dodge/block em 0, nada no player consome o rng, então o teste passaria mesmo se a simulação nunca tocasse o rng. — O spec chama esse teste de "guardião de toda a arquitetura"; um guardião que aprova por engano não é guardião, então a autoridade vinculante manda consertar, apesar de o plano ter escrito o hashWorld assim. Correção: (a) `hashWorld` passa a excluir `config` também — é entrada constante da run, não estado de simulação; (b) os testes de convergência e de divergência por seed passam a chamar `generateArena(w)`, que consome rng de verdade e escreve estado de verdade, então a divergência passa a vir do rng em vez do rótulo. — Custo se errado: baixo e visível — se a correção estiver errada, o próprio teste falha na hora.


## Task 10

nomes de teste em português não são violação da convenção. A regra do plano é "comentários de código em inglês, documentos em português"; nome de teste é descrição, não comentário, e o padrão é consistente desde a Task 2. Registrado uma vez para não voltar a ser levantado. — Custo se errado: nenhum.


## Task 12

o tipo `EnemyBullet` que escrevi no plano está errado nos dois campos que inventei. Conferi ORIG/combat.js:454 e ORIG/entities.js:379: os projéteis inimigos do original têm exatamente {x, y, vx, vy, dmg, dist, dead}. (a) `life` deve virar `dist` — o campo acumula distância percorrida e é comparado com 600, então "life" engana quem ler, sugerindo contagem regressiva; (b) `kind` deve sair — não existe no original, não tem produtor real (o implementador teve que cravar 'bolt') e não tem consumidor, e um campo constante num tipo compartilhado convida código futuro a ramificar sobre um valor que nunca varia. — Custo se errado: baixo; se a Task 17 precisar distinguir projéteis inimigos visualmente, o campo volta com um produtor de verdade.


## Task 12 — Importante 1

faltou o guard de fase no step(). O brief da task mostra `if (world.phase !== 'playing') return;` logo após o tick++, espelhando ORIG/engine.js:346, mas meu dispatch disse "o step ganha só as duas chamadas" e o implementador leu ao pé da letra — a ambiguidade é minha. É um buraco real: agora que updateEnemies está no pipeline, um jogador morto deixaria os inimigos continuarem perseguindo, matando e pontuando nos ticks seguintes. Dormente só porque main.ts ainda não roda step() em laço. — Adicionar o guard. — Custo se errado: nenhum; tick++ fica antes do guard, então o teste de tick continua valendo.


## Task 12 — Importante 2

a mensagem do commit 70f771e afirma "creditam xp ao matador", o que esta task deliberadamente NÃO faz (Ruling 2 do pré-flight). O texto veio do template do plano, escrito antes de eu decidir a troca 11/12. — Corrigir por `git commit --amend`, não por nota em commit posterior: 70f771e é HEAD, o repositório não tem remote algum e o branch nunca foi publicado, então nada pode estar baseado nele. A alternativa deixa uma afirmação falsa permanente no histórico sobre quando o XP entrou. — Custo se errado: nenhum, não há histórico compartilhado para reescrever.


## Task 11

meu plano se contradiz sobre onde mora `fireProjectile` — o Step 4 manda portá-la para bullets.ts, mas o arquivo de teste que eu mesmo escrevi a importa de combat.ts. O implementador seguiu o teste. — Mantenho em combat.ts: o par attack→fireProjectile é coeso, o teste é o artefato mais preciso dos dois, e a divisão resultante faz sentido (combat.ts produz dano e projéteis; bullets.ts simula projétil em voo). Mover não compra nada. Registrar aqui porque a Task 13 (especiais) também importa fireProjectile e precisa saber de onde. — Custo se errado: nenhum, é posição de arquivo sem efeito de comportamento.


## Task 14 — concern 2

o original é a autoridade; a assinatura do plano estava errada. `updateBossPattern` devolve boolean (usado para suprimir o movimento de perseguição quando o padrão assume o controle) e não recebe `factor`, porque DT_MS e TICK_FACTOR já são constantes de módulo aqui. — Custo se errado: nenhum, é a forma do original.


## Task 15 — concern

o caminho "wave limpa, mas não é a última" não tem para onde ir — ele deveria abrir a loja, e openShop só nasce na Task 19. O implementador deixou eventos de som e anúncio mais um comentário marcando o ponto de engate. Aceito: é sequenciamento do plano, não defeito. MAS o brief da Task 19 NÃO manda ligar esse ponto — ele só define openShop/closeShop. Sem instrução extra, a lacuna sobreviveria. — CARREGAR NO DISPATCH DA TASK 19: ligar checkWaveComplete ao openShop no ponto marcado em run.ts. — Custo se errado: alto e silencioso — o jogo travaria na wave 1 e nenhum teste atual pegaria, porque nenhum exercita esse ramo.


## Task 15 — Importante, plan-mandated

o teste "600 ticks não divergem" que escrevi não exercita progressão de wave alguma. O revisor instrumentou o cenário: em 600 ticks a wave fica em 1 e o waveTimer chega a ~10s dos 30s necessários, então nem a conclusão de wave, nem uma segunda startNextWave, nem vitória/derrota são alcançadas. E as asserções (contagem de inimigos, número da wave) são mais rasas que o hashWorld que o resto da suíte já usa. — O spec chama o teste de determinismo de guardião da arquitetura; um teste que anuncia cobrir uma run com waves e nunca avança uma wave engana quem lê. Consertar: mais ticks, input roteirizado e comparação por hashWorld, mais uma asserção de que a run de fato saiu do lugar (senão o teste volta a ser vacuoso em silêncio). — Custo se errado: baixo e imediato; se o conserto estiver errado o próprio teste falha.


## Task 16

Task 16: Ruling A: `RunConfig.forge` que escrevi tem 6 perks; o jogo tem 7. Falta `golden` (GOLDEN TOUCH, ui.js:468, max 3, 10% de chance de moeda dobrada por nível), usado em ORIG/entities.js:494 dentro do updateCoins — justamente a função desta task. Conferi os 7 usos de forgeLevel no original: vigor/honed/fleet/startgold já estão no createPlayer, wise e golden são desta task, merchant é da Task 19. Nenhuma outra lacuna. — Acrescentar `golden` ao tipo, ao BASE_CONFIG dos testes e ao literal do main.ts. — Custo se errado: baixo; sem ele o perk simplesmente não existiria no jogo novo.


## Task 16

Task 16: Ruling B: o tipo `Chest` que escrevi não tem `fade`. No original (ORIG/items.js: 223-231) o baú saqueado desvanece em 1500ms e só então sai do array. Sem o campo, ou o baú vazio fica para sempre na tela ou some na hora. — Acrescentar `fade: number`.


## Task 16

Task 16: Ruling C: meu teste "o perk wise aumenta o xp ganho" é aritmeticamente impossível. Ele espera p.xp === 150 depois de gainXp(100) com wise=5, mas XP_BASE é 100 — ganhar 150 de xp cruza o limiar, sobe de nível e deixa 50. O port fiel dá 50. Além disso wise=5 excede o teto de 3 do próprio jogo. — Reescrever com valores legais e abaixo do limiar, isolando o multiplicador: wise=3, gainXp 50, esperar 65 e nível 1.


## Task 16

Task 16: Ruling D: manter o guard de fase do pickBlessing e consertar os TESTES. O original tem `if (!b || gameState !== 'levelup') return;` — é proteção real contra escolher bênção fora da tela. Meus três testes não põem o mundo em 'levelup' antes de chamar, então o guard os derrubava. Largar um guard para satisfazer um teste mal escrito é inverter a autoridade. — Custo se errado: nenhum; o conserto é uma linha por teste.


## Task 16 — Importante 1

o 4º parágrafo da mensagem do commit dfabc76 está em inglês, violando a convenção de commits em português. Corrigir por amend na mesma rodada da outra correção — mesmo precedente da Task 12: sem remote, branch nunca publicado.


## Task 16 — Importante 2

meu teste "a sorte do jogador influencia o loot" afirma algo falso sobre o jogo. `lootChest` nunca lê `stats.luck` — nem no port nem no original. A sorte afeta a CHANCE DE O BAÚ APARECER (run.ts) e a queda de poção no killEnemy, não o conteúdo do baú. Como os dois lados da comparação saem de sorteios idênticos, `withLuck(200) >= withLuck(0)` passa por construção, com os valores exatamente iguais. — Trocar por um teste que afirme o que é verdade: que o conteúdo do baú independe da sorte, com igualdade estrita e um comentário dizendo onde a sorte realmente atua. Transforma uma mentira em fato documentado. — Custo se errado: nenhum; o comportamento não muda, só o que o teste alega.


## Task 16 — deixado em aberto (parked)

`updateCoins` divide por `dist` no ímã de moedas; com a moeda exatamente sobre o jogador (dist === 0) isso dá NaN em c.x/c.y. O original tem o MESMO buraco (ORIG/entities.js:487-491), então corrigir seria desvio de fidelidade, e em jogo real a distância nunca é exatamente zero em ponto flutuante. — Deixo parado, NÃO corrijo agora. Mas ele casa com o item de atenção aberto na Task 4: o hashWorld transforma NaN em null, e dois mundos ambos com NaN pareceriam idênticos. Vários testes criam moeda em cima do jogador e portanto produzem NaN em silêncio hoje. — LEVAR À REVISÃO FINAL DO BRANCH para triagem. — Custo se errado: baixo em jogo, mas mascara divergência em teste.


## Task 17 — 1

a glosa em português da ordem de desenho que escrevi no plano está errada. A ordem literal é: tiles, TOCHAS, armadilhas, baús, moedas, poções, projéteis, projéteis inimigos, SWINGS, telegraphs, obstáculos, inimigos, jogador, PARTÍCULAS, névoa, TEXTOS. Eu pus as tochas no fim e agrupei os três efeitos. O implementador seguiu o arquivo, que é o certo.


## Task 17 — 2

meu `Fx.draw(ctx, cam)` de chamada única não consegue reproduzir a ordem — os três efeitos que o Fx possui aparecem em posições 9, 14 e 16, separadas por inimigos, jogador e névoa. Com tudo no fim, os swings passam a desenhar por cima do jogador e as partículas por cima da névoa. — Quebrar em três métodos e chamar nas posições certas. — Custo se errado: puramente visual, mas é o tipo de erro que nenhum teste pega.


## Task 17 — 3

o shake do original desvanece — `f = shakeT / 220` multiplica o deslocamento. Meu esqueleto de shakeOffset() não tem esse fator, então o tremor cortaria seco em vez de suavizar.


## Task 17 — 4

o animTick do original divide por 140, não por 120 como escrevi.


## Task 17 — 5

o rastro de fogo da fireball (ORIG/render.js:126) não foi portado porque drawBullets não recebe o Fx. É perda visual real — dar acesso ao fx.


## Task 17 — deixado em aberto (parked)

o arco de espada usa o x,y capturado no evento, enquanto o original desenha sempre na posição VIVA do jogador, então lá o arco acompanha quem se move durante os ~180ms do golpe e aqui ele fica parado. — Não corrijo: capturar a posição no evento é o comportamento CERTO para vários jogadores, onde cada golpe pertence ao seu autor; seguir o jogador local seria errado com 4 personagens. É desvio consciente a favor do Marco 2. — Custo se errado: puramente visual e pequeno. LEVAR À LISTA DE PARIDADE da Task 21, para o humano julgar se incomoda jogando lado a lado.


## Task 18 — flags 1 e 4

pausar parando e reiniciando o loop, com efeitos congelados, é MAIS fiel que a minha instrução. Eu disse "para de simular mas continua renderizando"; o original faz `if (gameState !== 'playing') return;` no loop, ou seja, para o rAF inteiro e congela tudo. O implementador seguiu o original. Aceito, minha instrução é que estava errada.


## Task 18 — flag 2

dom.ts resolver mais ids do que o intervalo literal que citei está certo — o updateHUD original consultava vários elementos ad hoc fora daquele bloco.


## Task 18 — Importante

exportar `comboMult` do sim e importar na ui em vez de manter as duas cópias. `ui/` pode importar de `sim/` (só o inverso é proibido), a função é pura e sem DOM, e fórmula duplicada é exatamente o que deriva numa mudança de balanceamento futura sem nenhum teste reclamar. — Custo se errado: nenhum.


## Task 19

aceitar o novo ciclo de modulos xp -> shop -> run -> enemies -> xp. E o quarto ciclo do projeto, todos so em corpo de funcao. Ja esta no ledger como item estrutural para a revisao final do branch — este dispatch nao e a hora de reestruturar.


## Task 20 — Importante 1 — bossKills

corrigir. Conferi ORIG/entities.js:437-438 (`Save.data.progress.bossKills++`) contra src/sim/enemies.ts:362, onde a linha virou comentario "app-layer, dropped". A Task 20 E a camada de aplicacao e ela entregou a tela de stats que exibe esse contador, entao ficou uma tela mostrando zero para sempre. Precisa de evento novo no sim (`{ t: 'bossKill' }`), o que sai da lista de arquivos do brief — autorizo, porque a alternativa e publicar uma tela quebrada. — Custo se errado: um evento a mais no sim; o teste de determinismo diz na hora se algo quebrou.


## Task 20 — Importante 2 — trava do coprobo

reverter para o ORIG. Conferi ORIG/ui.js:226-231 e save.js:12 eu mesmo. O comentario do implementador esta certo nos fatos (coprobo nao esta em `unlocked` por padrao) e errado na conclusao: `locked = !!UNLOCKS[cls] && !Save.isUnlocked(cls)`, e como o ORIG nao tem entrada de coprobo em UNLOCKS, ele e jogavel desde o save zerado. Travar a classe e mudanca de balanceamento, e a constraint global diz literalmente que isso e Task 21, nao correcao de passagem. Restaurar tambem o comentario do ORIG/ui.js:535 sobre a contagem `playable`. Levar a trava como CANDIDATA a Task 21. — Custo se errado: o jogador ganha uma classe cedo demais; reversivel numa linha.


## Task 20 — Importante 3 — mouseOnly quadruplicado

deduplicar. Mesma pergunta que a Task 18 ja respondeu (comboMult), e respondi igual: uma definicao, importada. Quatro copias byte-identicas de um predicado derivam na primeira vez que alguem quiser permitir ativacao por teclado numa tela so. Unificar tambem `isTextInput`, adotando o predicado do ORIG (`tagName === 'INPUT' && type === 'text'`) — o revisor apontou que a versao atual e que e o desvio, e fidelidade e constraint global. — Custo se errado: com um slider focado, Escape e M voltam a responder como no ORIG. Baixo.


## Task 21 — Step 1 — metodo de medicao

medir o port headless em vez de pedir ao humano que jogue os dois lado a lado. O sim do port e puro e deterministico, entao uma politica de input roteirizada roda milhares de ticks em milissegundos e produz numero exato onde jogar a olho produz estimativa. Do lado do ORIG, derivar por geometria o que for de forma fechada e ler o resto do console (verifiquei que gameState/wave/enemies/coins/player sao todos alcancaveis num http.server). Decidido com o humano. — Custo se errado: os dois lados usam metodos diferentes, entao um vies sistematico poderia passar batido; mitigado por derivar o lado do ORIG analiticamente onde a geometria e fechada.


## Task 21 — Step 2 item 4 — AREA_SCALE

NAO mexer. AREA_SCALE = (2400*1600)/(1280*720) = 4,1667 preserva exatamente a densidade por pixel do original, e a propria instrucao do brief e "jogue e veja se parece cheia ou vazia demais" — julgamento humano, nao medicao. Vai para o PARIDADE.md como item aberto explicito, para o humano ajustar um numero se incomodar. Decidido com o humano. — Custo se errado: a arena parece cheia ou vazia demais ate alguem trocar um numero; reversivel numa linha.


## Task 21 — escopo do fix

dobrar os minors 3, 4, 5, 6 e 7 para dentro desta rodada, contra o protocolo que manda minors nunca entrarem no laco. Razao: 3, 4 e 5 sao exatamente a mesma classe de defeito dos dois Importantes (caixa marcada ou citacao afirmando mais do que o teste citado contem) no mesmo arquivo que o fix ja vai abrir, e o valor inteiro de um documento de paridade e a citacao ser conferivel — deixar quatro citacoes sabidamente erradas num arquivo que o implementador esta editando e desperdicio garantido, porque a revisao final so vai reapontar. 6 e 7 sao um comentario de uma linha cada, nos dois arquivos que a task ja tocou. — Custo se errado: o diff do fix fica maior e a re-revisao escopada tem mais o que ler; nenhum risco de comportamento, porque nada disso e codigo executavel exceto o comentario.


