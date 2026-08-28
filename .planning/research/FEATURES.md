# Feature Research

**Domain:** survival roguelite co-op online (arena wave-based, até 4 jogadores, sala por código)
**Researched:** 2026-08-28
**Confidence:** MÉDIA-ALTA — wikis oficiais e um relato técnico primário sustentam o núcleo; a
parte de balanceamento vem majoritariamente de discussão de comunidade (marcada como MÉDIA/BAIXA
no lugar em que aparece)

> **Este é um marco subsequente.** O jogo single-player (7 classes, 16 waves + endless, chefes,
> elites, 5 mutadores, combo, loja, bênçãos, equipamentos, soul gold) já existe e **não** é
> objeto desta pesquisa. Tudo abaixo trata do que se acrescenta: co-op, contas, missões,
> ranking, eventos, skins.

---

## Feature Landscape

### Table Stakes (o jogador espera; a falta faz o jogo parecer quebrado)

| Feature | Por que é esperado | Complexidade | Notas |
|---------|--------------------|--------------|-------|
| Sala por código com lobby legível (quem entrou, classe escolhida, quem é host, pronto) | É a única porta de entrada do jogo; se o lobby não mostra estado, o grupo não sabe se vai começar | MÉDIA | Já é o Marco 1 do spec de origem |
| Nome e barra de vida sobre a cabeça dos aliados | Com 4 personagens iguais na tela, sem isso ninguém sabe quem é quem nem quem está morrendo | BAIXA | Marco 4 do spec; é table stakes, não acabamento |
| Minimapa + indicador de aliado fora da tela | Consequência direta do mundo 2400×1600 com câmera por jogador: 3 telas de mundo, o aliado passa a maior parte do tempo invisível | MÉDIA | **Não é opcional neste desenho.** Sem isso, "co-op" vira quatro jogos solo no mesmo servidor |
| Caído + revive por aliado | Padrão do gênero (L4D, Vermintide, DRG, RoR2); dá função a quem sobreviveu | MÉDIA | **Já decidido** no spec de origem |
| Política de morte definitiva: espectar aliado + respawn no início da wave seguinte | Sem isso o jogador morto fica olhando tela preta por 10 minutos e sai da sala. Respawn em onda é o padrão consolidado | MÉDIA | O jogo hoje só tem "game over". Precisa de estado `spectating` no `World` |
| Loot instanciado (cada um recebe o seu) | Elimina a corrida por moeda, que é o jeito mais rápido de azedar co-op entre amigos | MÉDIA | **Já decidido** no spec de origem |
| Intervalo compartilhado: loja + bênçãos acumuladas + "pronto" com timer de segurança | Sem timer, um jogador que foi ao banheiro trava três pessoas | MÉDIA | **Já decidido**. O timer de segurança é a parte que costuma ser esquecida |
| Escala de dificuldade por número de jogadores | Sem ela, 4 jogadores trivializam o jogo e o co-op perde graça em duas waves | MÉDIA | Ver seção C — a escolha de *o que* escalar importa mais que o número |
| Indicador de conexão (ping, "reconectando", "host saiu") | Em P2P a partida cai; o jogador precisa saber que caiu a rede e não o jogo | BAIXA | |
| Reconexão e tratamento da saída do host | Amigos em conexão doméstica caem. Sem tratamento, cada queda perde 20 minutos do grupo | ALTA | Marco 4. É o item mais caro do "acabamento" |
| Tela de resultado de fim de run **por jogador** dentro do resultado do grupo | Cada um quer ver o próprio dano/score; um número só do grupo apaga a contribuição individual | BAIXA | |
| Conta com login, recuperação de acesso e progresso que segue o jogador | Prometido no Core Value; sem recuperação de acesso, perder a conta é perder tudo | ALTA | Ver seção F |
| Jogar offline e sincronizar depois, sem perder progresso | O jogo já é PWA offline; regredir isso seria perda de feature | ALTA | Ver seção F — resolve-se escolhendo tipos de dado que fundem |
| HUD de objetivo de missão visível para os 4, com progresso | Com câmera por jogador, ninguém consegue "ver" o objetivo. O HUD é o único canal | BAIXA | Pré-requisito de qualquer objetivo que não seja "mate tudo" |
| Briefing de missão antes de entrar (objetivo, falha, recompensa) | Objetivo descoberto no meio da luta é objetivo falhado | BAIXA | |

### Differentiators (o que faz este jogo valer a pena)

| Feature | Proposta de valor | Complexidade | Notas |
|---------|-------------------|--------------|-------|
| **Ranking verificado por replay no servidor** (seed + log de inputs re-rodado) | Quase nenhum jogo pequeno faz. Transforma o placar de "quem edita melhor o localStorage" em "quem joga melhor". É a razão de a simulação ser pura | ALTA | Ver seção D. Bloqueado por dívida técnica conhecida (`Math.sin/cos/atan2`) |
| **Modo missão com objetivos que mudam o problema de combate** | Waves puras esgotam; objetivo que reposiciona o perigo renova o mesmo conteúdo sem arte nova | MÉDIA-ALTA | Ver seção B. O risco é virar recado (ver anti-features) |
| **Endless em co-op com placar por tamanho de grupo** | "Até que wave vocês quatro chegaram" é a conversa que o gênero gera naturalmente | MÉDIA | Depende de conta + escala co-op |
| **Seed semanal compartilhada** (mesmo desafio para todos, janela fixa) | Resolve justiça do placar **e** serve de evento sazonal, com custo de configuração | BAIXA-MÉDIA | Ver seções D e E. Melhor razão valor/custo do projeto inteiro |
| **Identidade persistente dentro da sala privada** (o amigo te reconhece, o histórico te segue) | Jogos de sala por código costumam ser anônimos e descartáveis; identidade dá continuidade sem exigir matchmaking | MÉDIA | Diferencia justamente por ser fechado |
| **Continuidade entre aparelhos** (começa no celular, continua no PC) | O PWA + conta dá isso de graça; poucos jogos do nicho têm | MÉDIA | Depende de conta |
| **Personagem montado por peças** (marco futuro) | Multiplica identidade sem multiplicar arte, se as peças forem *lentes* e não números | ALTA | Ver seção A — desenhar a partir do modelo do Brotato, não do zero |
| Direção de arte e resolução próprias | Deixa de ser clone visual do original | ALTA | Repositório separado; depende de spec de asset publicada antes |

### Anti-Features (pedidas com frequência, prejudiciais aqui)

| Feature | Apelo aparente | Por que faz mal **neste** projeto | Alternativa |
|---------|----------------|-----------------------------------|-------------|
| PvP | "já tem 4 jogadores conectados" | Já fora de escopo: o netcode aceito (P2P host-autoritativo, snapshot 15–20Hz) não tolera; e reaproveitar o jogo atual depende de ser co-op contra as waves | Nada. Manter fora |
| Matchmaking público / diretório de salas | "achar gente para jogar" | Exige estado, moderação, anti-abuso e denúncia — três sistemas que o projeto não tem quem opere | Código de sala + link privado (já decidido) |
| Chat de texto ou voz no jogo | "co-op precisa de comunicação" | Um dev indie de jogo social relata >200 mil denúncias/ano e descreve o resultado como sem-saída: sem moderar, endossa; moderando, drena recurso e gera review negativa. Público fechado não elimina o risco quando o placar for público | Pings contextuais (ping de posição/perigo/"preciso de revive") e Discord. Ping resolve 90% da comunicação de co-op de horda |
| Fogo amigo | "tensão, coordenação" | Em jogo de horda com bullet-hell e 4 jogadores em tela, vira griefing acidental constante; e com progresso na nuvem, o griefing passa a custar progresso real | Manter desligado. Se quiser tensão, usar mecânicas de espaço (área do especial que atrapalha, não fere) |
| Troca de itens / economia entre jogadores | "ajudar o amigo novo" | Cria transferência de valor entre contas → cria incentivo a trapaça e obriga o servidor a arbitrar. Contradiz loot instanciado | Escala de dificuldade e bênção de suporte. Se quiser generosidade, um item que *dá buff ao aliado*, não que transfere posse |
| Battle pass, moeda premium, energia, login diário | "retenção" | Custo de operação contínuo (arte de temporada, loja, pagamento, suporte) que este projeto não sustenta; e login diário pune quem joga em rajada — que é como amigos jogam | Evento por seed compartilhada + selo permanente no perfil (seção E) |
| Meta-progressão vertical crescendo sem teto na conta | "sensação de progredir" | Já existe (forge/soul gold) e vai colidir de frente com o ranking: comparar contas com stats permanentes diferentes não é ranking de habilidade. Também quebra co-op misto (conta veterana + conta nova = passageiro) | Teto no forge **e** perfil normalizado (forge desligado) nas runs rankeadas. Todo desbloqueio novo, lateral |
| Gate de missão por repetição ("jogue 10 runs", "junte 5000 de moeda") | "conteúdo dura mais" | É a definição de grind; e em co-op multiplica por 4 (cada amigo precisa fazer o próprio) | Gate por conquista distinta + crédito para todos os presentes (seção B) |
| Escolta de NPC | "variedade de objetivo" | Os três jogos que tentaram exatamente isto têm o modo mais odiado do próprio jogo: Warframe *Defection* ("de longe o pior tipo de missão"), DRG *Escort Duty* ("shooter sobre trilhos mal feito") e KF2 *Objective Mode* ("universalmente odiado"). Aqui é pior: exigiria pathfinding de NPC numa arena com obstáculos, código que o projeto não tem, e a arena de 2400×1600 dá muito espaço para o NPC se perder | Não construir. Se precisar de "objeto que se move", que seja empurrado/ativado por jogador e sem IA |
| Objetivo com 4 pontos simultâneos obrigatórios (tipo *Interception*/*Disruption*) | "força cooperação" | Obriga os 4 a se separarem num mundo de 3 telas com câmera por jogador — cada um joga sozinho, sem ver ninguém. E torna a missão insolúvel em solo e em dupla | Se quiser dispersão, usar **entrega** (seção B): paraleliza por escolha, não por obrigação |
| Objetivos-recado (soldar, apertar botão, esperar barra encher) | "dá o que fazer" | É exatamente o diagnóstico do fracasso do KF2 Objective Mode: *"em qualquer mapa você a) solda um objetivo, b) escolta um drone, c) defende uma área e aperta um botão"* — sem variedade, sem personalidade | Todo objetivo precisa mudar **de onde vem o perigo**, não acrescentar tarefa |
| Placar global único misturando solo, dupla e quarteto; campanha e endless; com e sem forge | "um placar só, mais simples" | Não é comparável; a primeira pessoa a notar isso deslegitima o placar inteiro | Categorias explícitas: modo × tamanho do grupo × perfil (normalizado/livre) |
| Nome de exibição livre e público sem qualquer filtro | "identidade" | No dia em que o placar é público, o nome é conteúdo publicado. Vira moderação | Nome só visível dentro da sala e no placar; lista de bloqueio simples + capacidade de renomear via servidor |
| Host migration completo | "a partida não cai" | Reeleger host exige transferir estado autoritativo com consistência; custo alto para um caso que amigos toleram | Salvar o resumo da run ao cair e oferecer "recomeçar a wave"; declarar a limitação |
| Kick por votação / sistema de denúncia | "controlar abuso" | Só faz sentido com desconhecidos. Com sala por código, o host fecha a sala | Host pode remover; sala é privada |
| Recompensa cosmética como isca de evento antes de existir pipeline de arte | "evento precisa de prêmio" | Compromete o agente de assets a um calendário. É o item que quebra projetos pequenos | Selo/título textual e entrada permanente no perfil (custo zero de arte) |
| Sincronização de nuvem por "última escrita vence" | "é o mais simples" | É o mais simples e o que perde progresso: dois aparelhos offline geram estados divergentes da mesma conta e um deles é apagado | Escolher tipos que fundem: conjunto, `max()`, ledger idempotente (seção F) |

---

## A. O modelo de personagem do Brotato (insumo para o marco futuro)

**Confiança: ALTA** para a mecânica (wiki oficial + guias convergentes); MÉDIA para a leitura de
design.

### O que um personagem é, concretamente

No Brotato o personagem **não** é um conjunto de habilidades. É uma **lente sobre um pool de
stats compartilhado**, e se decompõe em seis peças de dados:

1. **Deltas planos** sobre o pool comum de stats (Max HP, Speed, Armor, Dodge, Melee/Ranged/
   Elemental Damage, Attack Speed, Range, HP Regen, Life Steal, Crit, Engineering, Harvesting,
   Luck). Ex.: Brawler `-50 Range`, `-50 Ranged Damage`; Ghost `+30% Dodge`, `-100 Armor`.
2. **Modificadores sobre modificações** — o truque central. O Ranger não ganha dano: ganha
   *"Ranged Damage modifications are increased by 50%"*. Ou seja, **todo item que dá dano à
   distância rende 50% mais nas mãos dele**. Engineer: *"Engineering modifications increased by
   25%"*. Chunky: *"Max HP modifications increased by 25%"*. Isso faz o **mesmo pool de itens**
   parecer diferente em cada personagem, sem escrever um item novo.
3. **Restrições duras que removem opções.** Ranger *não pode equipar armas corpo a corpo*.
   Mage tem `-100%` de modificações de dano corpo a corpo **e** à distância — o que não é uma
   penalidade, é um **funil**: só sobra elemental. Pacifist tem `-100% Damage` e ganha material
   e XP por inimigo *vivo* no fim da wave — inverte o jogo inteiro.
4. **Equipamento inicial**, que semeia a direção (Ranger→Pistol, Mage→Snake + Scared Sausage,
   Engineer→Wrench, Cyborg→Minigun).
5. **Viés de loja por tag de item.** Mage, Technomage e Demon têm *chance maior de itens
   elementais aparecerem na loja*. Direciona sem garantir — a run continua sendo sorteio.
6. **Condição de desbloqueio**, sempre **lateral**: vencer com outro personagem, ou atingir um
   marco (`+60% Dodge` destrava o Ghost; 5 torretas simultâneas destrava o Engineer).

Algumas variações mexem em uma sétima alavanca: **número de slots de arma** (o teto é 6).

### Como a identidade se divide entre personagem e run

- O personagem define **direção e restrição**; os itens da run definem **o build específico e
  quase toda a potência absoluta**.
- A progressão típica de uma run de 20 waves é descrita assim pelos guias: waves 1–3 fundação
  (uma arma + lifesteal), **waves 4–7 é quando o build ganha identidade** ao preencher os slots,
  waves 8–12 é a fase de escala em que se dobra a aposta nas sinergias. Ou seja: **na metade da
  run, os itens já dominam os números; o personagem permanece como o formato do multiplicador.**
- Estimativa útil para desenhar: o personagem é da ordem de 20–30% do poder final e ~100% da
  *direção*. Trocar de personagem não muda o que existe no jogo — muda **o que é bom**.

### Por que funciona (e o que copiar)

- **Alavanca de conteúdo.** 60+ personagens sobre um único pool de itens. Personagem é *dado*,
  não código. É a razão de o jogo parecer enorme com um catálogo modesto.
- **Legibilidade antes da run.** O cartão do personagem cabe numa tela; o jogador entra com um
  plano. Isso é o que torna o roguelite "decidível" em vez de sorte pura.
- **Modificadores negativos extremos são recurso, não bug.** `-100%` em algo cria um
  quebra-cabeça (Pacifist, Mage), e quebra-cabeça é replay value barato.
- **Meta-progressão sem poder.** O dev é explícito: o jogo não foi feito para se vencer sozinho
  depois de N horas. Desbloqueio adiciona **pergunta**, não força. Isso é o oposto do forge/soul
  gold atual deste projeto — e é a razão de o Brotato conviver bem com comparação entre jogadores.
- **Custo documentado do modelo:** parte da comunidade acha *"chato ter que vencer com cada
  personagem para destravar coisa"*. Ou seja, condição de desbloqueio "vença com X" **é** um gate
  de repetição disfarçado. Ver seção B para a correção.

### Tradução para "personagem montado por peças" (marco futuro)

- Cada **peça** deve carregar os mesmos três tipos de alavanca: delta plano, modificador-sobre-
  modificações e **restrição**. Peça que só soma número não cria identidade — cria planilha.
- Manter **slots poucos e nomeados** (ex.: corpo / afinidade de arma / passiva) com poucas opções
  por slot. Combinatória livre destrói duas coisas que o Brotato compra de propósito: legibilidade
  e balanceamento autoral.
- **As 7 classes atuais viram presets** de combinação de peças. Isso preserva o jogo existente,
  dá ponto de partida ao jogador novo e evita a tela em branco.
- **Resumo em uma tela** da combinação montada (stats finais + restrições + viés de loja) é
  requisito, não polimento.
- **Fronteira com a conta:** peças são desbloqueio **lateral** de conta (seção F). Se peça virar
  poder acumulável, o modelo colapsa no problema do forge.
- **Fronteira com o ranking:** combinações montadas pelo jogador tornam o placar livre menos
  comparável. Mais uma razão para o placar competitivo usar perfil normalizado (seção D).

---

## B. Catálogo de objetivos de missão, avaliado para 4 jogadores neste mundo

O motor **já tem duas primitivas de objetivo**: `checkWaveComplete` encerra a wave por
`WAVE_DURATION = 30000` (sobreviver 30s) ou por `waveHasBoss` (matar o chefe). Um sistema de
missão é a generalização disso: uma lista de condições puras avaliadas por tick, com estado de
conclusão e de falha, emitidas como evento.

**Contexto que muda tudo na avaliação:** mundo 2400×1600 (≈3 telas), **câmera por jogador**, e
inimigos por wave. Um jogador quase nunca vê os outros três.

| Objetivo | Veredito 4p | Análise |
|----------|-------------|---------|
| **Exterminar a wave** | ✅ base | Já existe. Escala com contagem de inimigos sem esforço |
| **Matar alvo (chefe / N elites marcados)** | ✅ ótimo | Concentra os 4 no mesmo ponto, que é onde o co-op é divertido. Já existe como wave de chefe. Variante barata: "mate os 3 elites marcados antes do fim da wave" — DRG: Survivor usa exatamente isso, com timer de ameaça correndo enquanto o elite vive |
| **Sobreviver N segundos sob mutador** | ✅ ótimo | Já existe; os 5 mutadores já são conteúdo. Custo ~zero |
| **Defender um ponto fixo** (cristal/portal com vida própria) | ✅ o melhor de todos | Puxa os 4 para o mesmo lugar → resolve o problema da câmera por jogador de graça. Cria papéis emergentes (2 seguram o ponto, 2 interceptam) sem sistema de papéis. Estado de falha legível (barra de vida do objeto). É o tipo canônico de Warframe/Warcraft-descendentes por essa razão |
| **Defesa móvel sequencial** (defenda A por 20s, depois B, depois C) | ✅ bom | Mantém o grupo junto **e** faz o mapa grande valer a pena. Zero IA: os pontos são estáticos, só a ordem muda. Reaproveita a lógica de "defender ponto" com um índice |
| **Coleta e entrega** (inimigo dropa item; leve até um coletor) | ✅ bom, o único que paraleliza bem | Paraleliza **por escolha**: 4 jogadores podem carregar em paralelo ou revezar. Solo continua possível (mais lento). É o modelo *Excavation*. Cuidado: exige carregar objeto → estado novo no jogador, e decidir o que acontece ao ser derrubado |
| **Limpeza cronometrada** (mate a wave antes do relógio) | ✅ bom, barato | Reenquadra o combate sem conteúdo novo. Escala limpo com nº de jogadores (o timer é o mesmo, a força do time é maior) |
| **Sobreviva e depois extraia** (chegar a uma zona no fim) | 🟡 parcial | Funciona como **encerramento** (cria tensão final), não como objetivo inteiro — sozinho é caminhada. Regra de 4p: exigir "todos os vivos dentro da zona" cria espera; usar "zona ativa enquanto houver ≥1 vivo dentro, conclui em T segundos" e teleportar/creditar quem estiver caído |
| **N pontos simultâneos** (*Interception*, *Disruption*) | ❌ adiar | Obriga separação em 4 pontos num mundo de 3 telas: cada jogador joga sozinho e não vê ninguém. Em solo/dupla vira rotação frenética entre pontos, um modo diferente do jogo. Warframe convive com isso porque tem mobilidade extrema e specters de IA; este jogo não tem nenhum dos dois |
| **Escoltar NPC** | ❌ nunca | Ver anti-features. Três jogos, três modos mais odiados. Além do custo de pathfinding numa arena com obstáculos, o relato de solo é literalmente "consertar e matar ao mesmo tempo, olhando para o objeto" |
| **Objetivo de restrição** ("não tome dano", "não use especial") | 🟡 só como secundário **por jogador** | Em co-op um objetivo de restrição coletivo é arruinado pelo erro de um. Se usar, que seja bônus individual, avaliado por jogador, que não faz a missão falhar |
| **Proteger um jogador designado** | ❌ | Pune o mais fraco do grupo e cria constrangimento social. É a única mecânica desta lista que estraga a amizade |

### Cinco regras derivadas (usar como critério de aceitação de qualquer objetivo)

1. **O objetivo tem que mudar de onde vem o perigo, não acrescentar tarefa.** É o diagnóstico
   literal do fracasso do KF2 Objective Mode. "Defender um ponto" muda a geometria da luta;
   "apertar um botão" não muda nada e ainda tira o jogador do combate.
2. **Tem que ser avaliável dentro de `sim/`, puro e determinístico.** Objetivo que depende de UI,
   de tempo real ou de `Math.random` inviabiliza a verificação por replay do ranking.
3. **Tem que ter leitura de progresso no HUD dos 4.** Com câmera por jogador, o HUD é o único
   canal comum. Objetivo sem readout compartilhado é objetivo invisível para 3 dos 4.
4. **Prefira objetivos que paralelizam por escolha (entrega) a objetivos que obrigam a separar
   (interception) ou que proíbem separar (escolta).** É a lição direta de Helldivers 2: quando a
   missão pressupõe divisão, um sub-grupo puxa toda a pressão e o outro passeia.
5. **A falha não pode vir do erro isolado de um jogador**, a menos que seja recuperável. Falha
   coletiva instantânea por causa de um é o jeito mais rápido de acabar com a sala.

### Como encadear missões sem virar grind

- **Gate por conquista distinta, não por repetição.** "Complete a missão 3" é gate; "jogue 10
  runs" e "junte 5000 de moeda" são grind. O critério: o gate pede algo que o jogador **ainda não
  fez**, não algo que ele já sabe fazer, de novo.
- **DAG, não corrente.** Sempre ≥2 nós abertos ao mesmo tempo (modelo star chart/junções do
  Warframe, ilhas do Into the Breach). Assim uma parede nunca é parada total: o jogador troca de
  ramo em vez de sair.
- **Pré-requisitos em "OU".** "Complete 2 das 3 missões deste tier" custa o mesmo para
  implementar e elimina o bloqueio por uma missão que aquele grupo não curte.
- **Não usar "vença com o personagem X" como caminho único.** É exatamente a crítica registrada
  ao Brotato. Se quiser incentivar variedade, que seja **um** dos caminhos possíveis.
- **A regra co-op mais importante: todos os presentes na conclusão recebem crédito**,
  independentemente de quem era host ou de quem tinha a missão destravada. Sem isso, o amigo que
  chegou depois nunca alcança o grupo, e o grupo é obrigado a rejogar a cadeia inteira uma vez
  por pessoa — que é precisamente o grind que se queria evitar. Aceite explicitamente que isso
  permite "carregar" um amigo: em co-op privado entre amigos, carregar é feature.
- **A cadeia do host define o que a sala pode entrar.** Quem ainda não destravou pode entrar como
  convidado. Simples, e coerente com a regra acima.

---

## C. Escala de dificuldade por número de jogadores

**Confiança: MÉDIA** (wikis + discussão de comunidade; números são ponto de partida para tuning,
não verdade medida).

### O que os jogos do gênero fazem

| Jogo | O que escala | Resultado observado |
|------|--------------|---------------------|
| **Gunfire Reborn** | Vida/escudo de inimigo para **300% / 500% / 700%** com 2/3/4 jogadores | Reclamação recorrente de bullet sponge: *"escalam por jogador mas é muito desbalanceado, precisam baixar os multiplicadores"* |
| **Risk of Rain 2** | Quantidade de inimigos, quantidade de itens no mapa, **custo** dos itens, velocidade de avanço da dificuldade e drops de chefe — tudo por jogador. Não multiplica HP diretamente (HP vem do nível: +30% vida e +20% dano por nível) | Modelo mais elogiado. **Bug conhecido e instrutivo:** se 3 dos 4 saem, o jogo continua escalado para 4 pelo resto da partida |
| **Alien Swarm: Reactive Drop** | Taxa de spawn (acima de 4 jogadores, dobra a quantidade de inimigos básicos) | Escala por quantidade, não por esponja |
| **Brotato (co-op local)** | **Nada.** Material e XP são *compartilhados* entre todos | Fica mais fácil com mais gente; habilidades de personagem empilham |
| **GTFO** | Nada. Menos de 4 jogadores enfrenta os mesmos inimigos e os mesmos suprimentos | Escolha deliberada: o jogo é feito para 4 |

### Recomendação para este projeto

**Escalar quantidade, não vida.** Três razões específicas daqui:

1. O jogo já é horda com projéteis; inflar HP de trash mob transforma a fantasia "limpar a tela"
   em "roer inimigo", que é exatamente a reclamação registrada no Gunfire Reborn.
2. O **combo de score** existente premia abates encadeados — HP inflado quebra o combo e portanto
   quebra o score, que é a base do ranking.
3. Quantidade escala de graça no motor: `spawnQueue` já monta a wave; é multiplicar contagem.

**Ponto de partida para tuning (não medido — validar jogando):**

- **Contagem de inimigos por wave:** `×(1 + 0,75·(N−1))` → 1,00 / 1,75 / 2,50 / 3,25. Sublinear
  de propósito: com loot instanciado, cada inimigo a mais é renda para *todo mundo*, então
  escalar linear infla a economia da loja (que foi tunada para solo).
- **Vida de chefe e mini-chefe:** `×(1 + 0,6·(N−1))`. Aqui **é** preciso mexer em HP, porque
  chefe é um só e não dá para "escalar quantidade" sem virar outra coisa. Sem isso o chefe derrete
  em segundos com 4 jogadores.
- **Dano de inimigo: não escalar.** Escalar dano pune desproporcionalmente quem está mais fraco e
  torna o revive impossível — mata a mecânica que é o melhor momento do co-op.
- **Sangramento do caído escala ao contrário:** menos aliados vivos → timer maior. Com 3 aliados
  o revive é trivial; com 1, quase impossível. O timer constante quebra os dois extremos.
- **Loja:** manter loot instanciado e vigiar a renda por jogador por wave. Se subir, o botão a
  girar é o `0,75` acima, não o preço (preço por jogador, como RoR2 faz, confunde o grupo).

### Quando o grupo muda de tamanho no meio

Este é o detalhe que RoR2 erra e que vale copiar do Gunfire Reborn: **reescalar apenas na
fronteira de wave**, nunca no meio. Mexer em contagem/HP com a wave em curso é mudança de estado
autoritativo no pior momento possível. E a run precisa carregar `partySizeMax` no resumo: para o
placar, uma run que começou com 4 e terminou com 1 não é uma run solo.

### Placar e tamanho de grupo

Score em co-op é **score do time**. Comparar run de 4 com run solo é a primeira coisa que
deslegitima um placar. Categorias separadas por tamanho de grupo, sempre.

---

## D. Ranking

**Confiança: ALTA** para a técnica de verificação (relato técnico primário de um jogo indie que
a implementou); MÉDIA para as preferências de jogador.

### O que os jogadores realmente querem ver rankeado

Os roguelikes convergem para **múltiplas categorias**, não uma. Cogmind ranqueia por *área mais
profunda alcançada* com desempate em kills de chefe, regiões visitadas e data. Retropath expõe
"Endless High Score" e "Speedrun" separados. E há uma crítica de fundo que importa aqui: em jogo
com elementos aleatórios, **placar de tempo limitado é loteria de seed** — aleatoriedade só é
justa se o tempo for ilimitado (ou se a seed for a mesma para todos).

Traduzindo para este jogo:

| Categoria | Métrica primária | Desempate | Por quê |
|-----------|------------------|-----------|---------|
| **Endless** | Wave alcançada | Score, depois tempo | "Até que wave vocês chegaram" é a frase que o gênero produz sozinho. É o análogo de "profundidade" |
| **Campanha (16 waves)** | Vitória sim/não, depois tempo | Score | Clear mais rápido é a métrica competitiva natural de conteúdo fixo |
| **Evento com seed** | Score | Wave, tempo | Comparável de verdade porque a seed é a mesma |

Padrão de implementação que vale copiar: o Slay the Spire empacota tudo num **inteiro único
comparável** (`vitória×1e8 + andares×1e6 + badges×1e4 + (9999−tempo)`). Ordenação trivial,
verificação trivial, sem ambiguidade de critério.

### Seed livre × seed compartilhada

- **Seed livre** = placar de loteria + moagem. Serve como "hall da fama", não como competição.
- **Seed compartilhada com janela** é o padrão consolidado: StS *Daily Climb* (seed nova por dia,
  uma entrada por jogador por dia); RoR2 *Prismatic Trials* (**seed nova a cada 72h, idêntica
  para todos os jogadores e todas as plataformas**, tudo padronizado — só a escolha de personagem
  e loadout varia, *"para que todos compitam nas mesmas circunstâncias"*; top 10 exibido; **sem
  recompensa**, só o placar).
- **Recomendação: dois quadros.**
  1. **Evento com seed (semanal)** — mesma seed para todos, uma entrada por conta por janela,
     categorias por tamanho de grupo. É o quadro competitivo *e* o veículo do evento sazonal
     (seção E). Custo: baixo.
  2. **Endless de todos os tempos (seed livre)** — assumidamente "hall da fama", rotulado como
     tal para não prometer justiça que não entrega.

### A colisão entre ranking e meta-progressão

O forge/soul gold é **poder vertical de conta**. Um placar de contas com stats permanentes
diferentes não mede habilidade. **Recomendação: a run de evento roda com perfil normalizado** —
forge desligado, equipamento inicial fixo, apenas o personagem escolhido. Três benefícios:
comparabilidade real; jogador novo pode competir no dia 1; e o servidor **não precisa conhecer o
estado da conta para re-rodar a run**, o que reduz drasticamente a superfície da verificação.

### Verificação por replay — o que ela exige

Precedente concreto (Open Hexagon, jogo indie, implementado e publicado): em vez do score, o
cliente envia o **arquivo de replay** — *sequência de inputs mais metadados (seed do gerador,
nível, nome)* — e o servidor re-executa contra os arquivos oficiais do jogo. Requisitos que ele
teve de satisfazer, e o mapeamento para este projeto:

| Requisito | Status aqui |
|-----------|-------------|
| PRNG portável (ele trocou o `<random>` do C++ por PCG) | ✅ já resolvido: mulberry32 semeado |
| Passo fixo, independente da máquina | ✅ já resolvido: `DT_MS = 1000/60` com acumulador |
| Eliminar otimizações que quebram reprodutibilidade em ponto flutuante (ele teve *desync* por `-ffast-math`) | ⚠️ **análogo exato da dívida nº 1 deste projeto**: `Math.sin/cos/atan2` são *implementation-defined* no ECMAScript → Chrome e Firefox divergem. É bloqueador de produto para ranking, e **nenhum teste da suíte atual pega isso** (ambos comparam mundos no mesmo processo) |
| Simulação executável fora do cliente | ⚠️ dívida nº 2: `sim/` é componente fortemente conexo de 8 de 15 módulos; extrair bundle headless é tudo-ou-nada |
| Anti-cheat de tempo: comparar tempo de parede decorrido com a duração do replay, com tolerância de rede | ➕ acrescentar; é barato e pega aceleração de tempo |
| Anti-cheat de propriedades visuais: em vez de checksum por frame (caro em memória), ele **injeta o valor dessas propriedades no estado do gerador aleatório uma vez por frame** | ➕ técnica elegante e barata; anotar para consideração |

**Duas consequências de escopo que precisam ser decididas cedo:**

1. **Ranking co-op é substancialmente mais caro que ranking solo.** O servidor precisa dos quatro
   fluxos de input **e do tick exato em que o host aplicou cada um** — que é o artefato correto de
   qualquer forma, mas é preciso desenhá-lo no protocolo. Recomendação: **v1 rankeia só solo**;
   co-op rankeado depois, ou num quadro separado com verificação mais fraca.
2. **Tamanho do log.** 60 ticks/s × ~20 min ≈ 72.000 ticks. Com input empacotado em ~8 bytes por
   jogador: ~0,6 MB solo, ~2,3 MB com 4. Compressível bem (inputs se repetem entre ticks — delta +
   RLE), mas é decisão de formato, não detalhe de implementação.

### O que **não** fazer

Aceitar score enviado pelo cliente "por enquanto". A comunidade do Slay the Spire descreve o
resultado: *"muitas das pontuações incríveis no topo do Daily Climb vêm de gente que trapaceia"*.
Um placar sem verificação nasce morto e não dá para consertar depois sem apagar tudo.

---

## E. Eventos sazonais

**Confiança: MÉDIA** (padrões documentados de liveops + exemplos concretos de jogos do gênero).

### A forma mais barata que ainda parece evento

Um evento é sentido como evento quando tem **quatro coisas**, nenhuma das quais é conteúdo novo:

1. **Nome e tema** ("Noite Púrpura").
2. **Janela com contagem regressiva** (começo e fim visíveis).
3. **Algo compartilhado que todo mundo está enfrentando ao mesmo tempo** — a seed é isso.
4. **Rastro permanente no perfil** (selo/título com data).

### Escada de custo

| Nível | Forma | Custo | Sustentável aqui? |
|-------|-------|-------|-------------------|
| 1 | **Run com seed semanal + placar + selo no perfil.** Zero conteúdo novo: uma seed, duas datas, uma entrada por conta | BAIXO | ✅ **É a recomendação.** É exatamente o modelo Prismatic Trials / Daily Climb |
| 2 | **Pilha de modificadores reusando os 5 mutadores existentes** ("esta semana toda wave tem Névoa + Elite Rush") | BAIXO | ✅ sim — é arquivo de configuração |
| 3 | **Regra especial de evento** (chefe aparece na wave 5; loja com preço pela metade; sem loja) | BAIXO-MÉDIO | ✅ sim, se as regras forem flags no `World`, não código novo por evento |
| 4 | **Troca de paleta temática** de tiles/inimigos + nome | MÉDIO | 🟡 só depois de a arte nova existir; exige a spec de asset prever paleta trocável |
| 5 | **Variante de inimigo exclusiva de evento** (elite reskinado com um comportamento alterado) | MÉDIO | 🟡 um por ano, não um por mês |
| 6 | **Moeda de evento + loja de evento + cosméticos** | ALTO | ❌ exige pipeline de arte com calendário. É a armadilha clássica que quebra projeto pequeno |
| 7 | **Bioma/história por temporada** | ALTO | ❌ fora de questão |

### Regras que barateiam o resto

- **Evento é configuração, não conteúdo.** Se um evento exige código novo, não é evento — é
  feature com prazo.
- **Agende com antecedência, em dados.** Um arquivo de calendário (ou uma tabela no servidor) com
  os eventos do semestre já definidos. Evento que exige o dev presente toda semana não sobrevive
  ao terceiro mês.
- **Recompensa é registro, não poder.** Selo, título, entrada permanente no perfil. Recompensa que
  dá poder cria FOMO e contamina o balanceamento e o placar; recompensa cosmética cria dependência
  do pipeline de arte. Texto e data custam zero das duas coisas.
- **Reaproveite o par evento↔placar.** O mesmo mecanismo serve às duas features: a seed semanal
  *é* o evento e *é* o quadro justo. Duas features Active do PROJECT.md por um sistema.

---

## F. A fronteira conta × run

**Confiança: ALTA** (a regra decorre da arquitetura e dos padrões documentados de sincronização;
os exemplos de falha são observados).

### A regra em uma frase

**A conta é dona de identidade, do que está disponível e do histórico. A run é dona de todo o
poder.**

| Pertence à **conta** | Pertence à **run** |
|----------------------|--------------------|
| Id do usuário, nome de exibição, cor/avatar — o mesmo id que a sala mostra | Nível, XP, bênçãos |
| **Desbloqueios** (classes/personagens disponíveis, missões destravadas, peças no futuro, cosméticos possuídos) | Equipamento, ouro, combo, wave, mutadores sorteados |
| Histórico: recordes, estatísticas, conquistas, entradas de placar, selos de evento | Seed e log de inputs |
| Preferências e configurações | Tamanho do grupo e a escala de dificuldade derivada |
| Moeda de desbloqueio lateral (soul gold, se permanecer) | Estado de caído/revive |

### Os cinco erros clássicos, especificamente

1. **Poder vertical na conta.** É o erro que já existe aqui: forge/soul gold. Consequências
   concretas: (a) o balanceamento passa a ser contra um estado de conta desconhecido; (b) o placar
   deixa de medir habilidade; (c) o jogador novo encontra conteúdo tunado para contas evoluídas;
   (d) **em co-op misto, a conta veterana carrega e a conta nova vira passageira** — que é o
   contrário do valor central do projeto. Mitigação recomendada: **teto no forge** + **perfil
   normalizado nas runs rankeadas e de evento**; todo desbloqueio novo, lateral (modelo Brotato:
   *"o conteúdo de meta-progressão nunca te faz vencer; ele só faz o jogo crescer"*).
2. **Estado de run na conta.** Salvar run em andamento na nuvem cria save-scum entre aparelhos e o
   pior caso de merge que existe. Run em andamento é **local ao host** e some se a partida cair.
3. **O cliente do host escrevendo na conta dos convidados.** Tensão já registrada no PROJECT.md:
   com progresso na nuvem, host malicioso contamina progressão persistente alheia. Regra: **o host
   relata; o servidor decide o que concede.** Política v1 barata e defensável: **co-op concede
   apenas desbloqueios (lateral) e missões da cadeia; moeda e recorde de placar vêm só de runs
   solo verificadas.** Assim, o pior que um host trapaceiro faz é destravar conteúdo para amigos —
   o que já é permitido, porque "carregar" é feature.
4. **Sincronização por "última escrita vence".** É o padrão mais comum e o que perde progresso:
   dois aparelhos offline geram histórias divergentes e uma é descartada. **A saída não é um
   algoritmo de merge melhor — é escolher tipos de dado que fundem:**

   | Dado | Tipo que funde | Como funde | Estado atual no `save.ts` |
   |------|----------------|------------|---------------------------|
   | Desbloqueios | **Conjunto de ids** | União — idempotente, sempre correto | ✅ já é conjunto (`unlock`/`isUnlocked`) |
   | Recordes | **`max()` por campo** | Trivial | ✅ `records` já é por classe com comparação de recorde |
   | Missões concluídas | **Conjunto de ids** | União | ➕ a criar — nascer como conjunto |
   | Selos de evento | **Conjunto de ids** | União | ➕ a criar |
   | Moeda (soul gold) | **Ledger append-only de resumos de run, com id de run como chave de idempotência** — nunca "gold = 500" | Servidor aplica cada resumo uma vez | ⚠️ hoje é contador mutável (`meta.soulGold`) — **é o único dado do save atual que conflita de verdade** |
   | Níveis de forge | **`max()` por chave** | Trivial | ✅ `forge` já é `Record<chave, nível>`; funde por `max` |
   | Configurações | Última escrita vence | Aceitável | ✅ |

   Feito isso, o problema de conciliação praticamente desaparece — sobra um único dado
   (`soulGold`) para redesenhar, e ele precisa ser redesenhado **antes de o banco ter formato**,
   como o próprio PROJECT.md avisa.
5. **Exigir login para jogar.** O jogo é PWA offline; exigir conta na primeira sessão regride uma
   feature entregue. Padrão recomendado: **conta convidada local criada no primeiro boot** (id
   local, já no formato de identidade definitivo), com "reivindicar conta" depois, que envia o
   estado local. Isso satisfaz o requisito do PROJECT.md de **decidir o formato de identidade
   agora mesmo que o login venha depois** — o formato existe desde o dia 1, o backend vem quando
   vier.

---

## Feature Dependencies

```
[Formato de identidade decidido]           <- raiz; barato agora, caríssimo depois
    ├──habilita──> [Sala por código com identidade estável]
    ├──habilita──> [Conta convidada local / offline-first]
    │                   └──habilita──> [Conta na nuvem (login + recuperação)]
    │                                        ├──requer──> [Tipos de save que fundem
    │                                        │             (conjunto / max / ledger)]
    │                                        ├──habilita──> [Placar]
    │                                        ├──habilita──> [Eventos sazonais (selo, 1 entrada)]
    │                                        ├──habilita──> [Cadeia de missão entre aparelhos]
    │                                        └──habilita──> [Posse de skins/cosméticos]
    └──habilita──> [Crédito de missão para todos os presentes]

[Sala por código] ──requer──> [Partida sincronizada]
                                  ├──requer──> [Escala de dificuldade por nº de jogadores]
                                  ├──requer──> [Caído/revive + espectar/respawn]
                                  ├──requer──> [Loot instanciado]
                                  ├──requer──> [Minimapa + indicador de aliado]
                                  └──habilita──> [Endless co-op] ──habilita──> [Placar co-op]

[Sistema de objetivo puro em sim/] ──habilita──> [Modo missão]
                                        └──requer──> [HUD de objetivo compartilhado]
                                        └──requer──> [Cadeia/DAG de destravamento]

[Placar verificado por replay]
    ├──requer──> [Math determinístico entre motores (dívida nº 1)]
    ├──requer──> [Bundle headless de sim/ (dívida nº 2)]
    ├──requer──> [World com round-trip por JSON / rng.save()-restore() (dívida nº 3)]
    ├──requer──> [Formato de log de inputs + compressão]
    └──requer──> [Perfil normalizado (forge fora)]

[Seed semanal compartilhada] ──É O MESMO SISTEMA QUE──> [Evento sazonal nível 1]

[Meta-progressão vertical (forge)] ──CONFLITA COM──> [Placar comparável]
[Objetivo que obriga separar (4 pontos)] ──CONFLITA COM──> [Câmera por jogador em mundo 3 telas]
[Chat in-game] ──CONFLITA COM──> [Ausência de equipe de moderação]
```

### Notas de dependência

- **Tudo que persiste depende do formato de identidade, não do backend.** Esta é a distinção que
  destrava o roadmap: modo missão, cadeia de destravamento e até placar local podem ser
  construídos sobre `localStorage` **desde que o id do jogador já esteja no formato final**. O
  backend de conta pode vir depois sem reescrita. É literalmente o que o PROJECT.md decidiu; esta
  pesquisa confirma que é possível.
- **Placar depende de conta, de determinismo entre motores e de perfil normalizado.** As três. Se
  qualquer uma faltar, o placar existe mas não significa nada — e placar sem significado é pior
  que placar nenhum, porque não dá para consertar retroativamente.
- **Eventos sazonais dependem de conta e de placar**, e depois disso custam quase nada. Ordem
  natural: conta → seed compartilhada + placar → evento é configuração.
- **Modo missão não depende de conta nem de co-op.** Pode ser construído e validado em solo. Mas
  a **regra de crédito co-op** precisa estar decidida antes de a primeira cadeia existir, senão a
  progressão dos amigos diverge e a correção é migração de dados.
- **Escala co-op depende de loot instanciado** estar decidido (está) porque o número de spawns
  define a renda por jogador na loja.
- **Skins dependem de conta** (posse) e da spec de asset publicada antes da produção.
- **Personagem por peças depende de**: o modelo de peças-como-lente (seção A), das classes atuais
  virarem presets, e da fronteira conta×run estar resolvida (peça é desbloqueio lateral de conta).
  Depende também de o placar já ter perfil normalizado, senão a combinatória arruína o placar.

---

## MVP Definition

### Launch With (v1 — este marco)

- [ ] **Formato de identidade do jogador definido e em uso** — é o que é caro mudar depois;
      barato agora
- [ ] **Conta convidada local** no formato final, offline-first, com caminho de "reivindicar"
      desenhado (mesmo que não implementado)
- [ ] **Sala por código + lobby + 4 jogadores na mesma run sincronizada** — é o Core Value
- [ ] **Regras de co-op**: caído/revive, loot instanciado, intervalo com "pronto" + timer,
      fim de run coletivo
- [ ] **Espectar + respawn na wave seguinte** — sem isso, o morto sai da sala
- [ ] **Escala de dificuldade por número de jogadores** (quantidade, não esponja)
- [ ] **Minimapa + nome/HP de aliado + indicador fora de tela** — obrigatório com câmera por
      jogador
- [ ] **Endless jogável em co-op**
- [ ] **Save com tipos que fundem** (conjunto / `max()` / ledger idempotente) — inclusive o
      redesenho do `soulGold`, antes de o banco existir

### Add After Validation (v1.x)

- [ ] **Backend de conta**: login, recuperação, save na nuvem, reivindicação da conta convidada
      — gatilho: a sala funcionar e valer a pena persistir
- [ ] **Modo missão com 4–5 tipos de objetivo**: defender ponto, matar alvo/elites marcados,
      limpeza cronometrada, coleta-e-entrega, sobreviver-e-extrair — gatilho: sistema de objetivo
      puro em `sim/` existir
- [ ] **Cadeia de missão em DAG** com pré-requisitos em "OU" e crédito para todos os presentes
- [ ] **Placar solo verificado por replay** — gatilho: dívida nº 1 (`Math.sin/cos/atan2`)
      resolvida e bundle headless extraído
- [ ] **Seed semanal + evento nível 1** (nome, janela, selo) — cai quase de graça depois do placar

### Future Consideration (v2+)

- [ ] **Placar co-op verificado** — adiar: exige log dos 4 inputs com o tick de aplicação; decidir
      só depois de o solo funcionar
- [ ] **Eventos nível 2–3** (pilhas de mutadores, regras especiais) — adiar até o calendário
      provar que roda sem o dev presente
- [ ] **Skins / direção de arte nova** — adiar até a spec de asset estar publicada e o pipeline
      do agente separado ter entregue algo
- [ ] **Personagem montado por peças** — adiar: depende de conceito estabelecido (seção A) e
      invalida balanceamento e placar se entrar cedo
- [ ] **UI caprichada** — adiar de propósito: polir telas que vão mudar com a arte nova é trabalho
      jogado fora
- [ ] **Objetivos de múltiplos pontos simultâneos** — adiar indefinidamente; só faz sentido se o
      mundo ganhar mobilidade rápida ou aliados de IA

---

## Feature Prioritization Matrix

| Feature | Valor p/ jogador | Custo | Prioridade |
|---------|------------------|-------|------------|
| Sala por código + partida sincronizada 4p | ALTO | ALTO | **P1** |
| Formato de identidade decidido | MÉDIO (invisível) | BAIXO | **P1** — melhor razão custo/benefício do projeto |
| Regras de co-op (caído/revive, loot instanciado, intervalo) | ALTO | MÉDIO | **P1** |
| Escala de dificuldade por nº de jogadores | ALTO | BAIXO | **P1** |
| Minimapa + indicadores de aliado | ALTO | MÉDIO | **P1** (table stakes deste desenho de mundo) |
| Espectar + respawn na wave seguinte | ALTO | MÉDIO | **P1** |
| Save com tipos que fundem (+ redesenho do soulGold) | MÉDIO (invisível) | BAIXO | **P1** — barato agora, migração depois |
| Endless em co-op | ALTO | BAIXO | **P1** (reusa o que existe) |
| Reconexão / saída do host | ALTO | ALTO | **P2** |
| Conta na nuvem (login, recuperação, sync) | ALTO | ALTO | **P2** |
| Modo missão (5 objetivos + HUD + DAG) | ALTO | MÉDIO-ALTO | **P2** |
| Placar solo verificado por replay | MÉDIO-ALTO | ALTO | **P2** (bloqueado por dívida técnica) |
| Seed semanal + evento nível 1 | MÉDIO | BAIXO | **P2** (praticamente grátis depois do placar) |
| Determinismo de `Math.sin/cos/atan2` entre motores | BAIXO (invisível) | MÉDIO | **P2** — vira P1 no instante em que o placar entrar no escopo |
| Ping contextual (substituto do chat) | MÉDIO | BAIXO | **P2** |
| Placar co-op | MÉDIO | ALTO | **P3** |
| Skins / arte nova | ALTO | ALTO | **P3** (depende de repo externo) |
| Personagem por peças | ALTO | ALTO | **P3** (conceito ainda não existe) |
| UI caprichada | MÉDIO | MÉDIO | **P3** (depois da arte) |
| Eventos nível 3+ | BAIXO | ALTO | **P3** / provavelmente nunca |

---

## Competitor Feature Analysis

| Feature | Brotato | Risk of Rain 2 | Deep Rock Galactic / DRG: Survivor | Nossa abordagem |
|---------|---------|----------------|-------------------------------------|-----------------|
| Identidade de personagem | Lente sobre pool comum: deltas + modificador-sobre-modificações + restrições + item inicial + viés de loja | Survivor com kit de habilidades fixo; itens dão o poder | Classe com ferramentas fixas; upgrades por conta | Manter as 7 classes; no futuro, peças no modelo do Brotato, com as classes como presets |
| Meta-progressão | **Nenhuma vertical**; só desbloqueio lateral de personagens e itens | Desbloqueio lateral (itens e survivors entram no pool) | Vertical, mas com teto (promoções, overclocks) | Forge existe e é vertical → limitar com teto + perfil normalizado no rankeado |
| Escala co-op | **Nenhuma**; material e XP compartilhados | Quantidade de inimigos, itens, custo, ritmo de dificuldade e drops de chefe por jogador | Escala por nº de anões e por Hazard | Quantidade (sublinear), HP só de chefe, dano não escala; loot instanciado (≠ Brotato) |
| Objetivos além de sobreviver | Nenhum (20 waves + chefe) | Teleporter event + chefe | Missões com objetivo por tipo; Survivor usa "mate os elites antes do timer" | Defender ponto, matar alvo, limpeza cronometrada, entrega, extrair |
| Placar | Não é o foco | Prismatic Trials: seed a cada 72h idêntica para todos, top 10, sem recompensa | Não é o foco | Evento com seed (justo, verificado) + endless de seed livre (hall da fama) |
| Evento sazonal | — | Trial com seed rotativa | Assignments / eventos sazonais com cosméticos | Nível 1 e 2: seed semanal + pilhas de mutador; nada de moeda ou loja de evento |
| Comunicação | Local (mesmo sofá) | Chat de texto | Ping contextual + emotes + voz | Ping contextual; Discord para voz |

---

## Sources

**Personagens / Brotato**
- Brotato Wiki — Characters (definição de personagem: deltas, modificadores sobre modificações,
  restrições, item inicial, condição de desbloqueio) — https://brotato.wiki.spellsandguns.com/Characters — **ALTA**
- Brotato Stats / Unlocks / Build guides (pool de stats, slots de arma, viés de loja por tag,
  arco da run por wave) — https://brotato-builds.com/stats , https://brotato-builds.com/unlocks ,
  https://choostgames.com/blog/brotato-build-guide/ — **MÉDIA**
- Discussões Steam sobre ausência de meta-progressão de stat no Brotato e a crítica de "vencer com
  cada personagem para destravar" —
  https://steamcommunity.com/app/1942280/discussions/0/3593338530520108432/ ,
  https://steamcommunity.com/app/1942280/discussions/0/3807278817572227914/ — **MÉDIA**
- Brotato co-op local (material e XP compartilhados, até 4 jogadores) —
  https://brotato-builds.com/coop , https://www.co-optimus.com/game/16083/pc/brotato.html — **MÉDIA**

**Objetivos de missão**
- WARFRAME Wiki — Mission types (catálogo de objetivos e se mantêm ou dividem o esquadrão) —
  https://wiki.warframe.com/w/Mission , https://wiki.warframe.com/w/Defense — **ALTA**
- Warframe *Defection* — por que escolta de NPC falha (pathfinding, tédio, solo insustentável) —
  https://warframe.fandom.com/wiki/Defection ,
  https://forums.warframe.com/topic/1257364-somebody-break-the-news-to-de-gamers-hate-escort-missions-stop-making-these/ — **MÉDIA**
- Warframe *Interception* — o custo de obrigar 4 pontos simultâneos e o que vira em solo —
  https://wiki.warframe.com/w/Interception ,
  https://nerdburglars.net/gameguides/how-to-solo-steel-path-interception-in-warframe/ — **MÉDIA**
- Deep Rock Galactic — críticas a *Escort Duty* (linearidade, ritmo, solo) —
  https://steamcommunity.com/app/548430/discussions/1/5077247980466938991/ — **MÉDIA**
- Killing Floor 2 *Objective Mode* — o caso de fracasso mais próximo deste projeto (wave shooter +
  objetivos genéricos) — https://steamcommunity.com/app/232090/discussions/0/1651045226222593238/ ,
  https://killingfloor.fandom.com/wiki/Objective_Mode — **MÉDIA**
- Helldivers 2 — o que acontece quando a missão pressupõe divisão do time —
  https://steamcommunity.com/app/553850/discussions/0/4142816460199214967/ — **BAIXA-MÉDIA**
- Deep Rock Galactic: Survivor — objetivos dentro de um survivor-like (elites marcados + timer de
  ameaça) — https://deeprockgalactic.wiki.gg/wiki/Survivor:Objectives — **MÉDIA**

**Escala co-op**
- Gunfire Reborn Wiki + discussões (300%/500%/700% de vida e a reclamação de bullet sponge) —
  https://gunfirereborn.fandom.com/wiki/Multiplayer ,
  https://steamcommunity.com/app/1217060/discussions/0/3070866588614852084/ — **MÉDIA**
- Risk of Rain 2 Wiki — Difficulty (o que escala por jogador; +30% vida/+20% dano por nível) e o
  bug de não reescalar quando jogadores saem — https://riskofrain2.fandom.com/wiki/Difficulty ,
  https://steamcommunity.com/app/632360/discussions/0/1675812484358005043/ — **MÉDIA-ALTA**
- Alien Swarm: Reactive Drop e GTFO como extremos (escalar spawn × não escalar nada) —
  https://steamcommunity.com/app/563560/discussions/0/2850173019327797064 — **BAIXA-MÉDIA**

**Ranking e verificação**
- Vittorio Romeo — *Implementing secure leaderboards for my game* (replay verificado no servidor:
  o que se envia, PRNG portável, passo fixo, desync por `-ffast-math`, anti-cheat de tempo,
  propriedades visuais injetadas no RNG) —
  https://vittorioromeo.com/index/blog/oh_secure_leaderboards.html — **ALTA** (relato técnico primário)
- Risk of Rain 2 Wiki — Prismatic Trials (seed de 72h idêntica em todas as plataformas, tudo
  padronizado, top 10, sem recompensa) — https://riskofrain2.wiki.gg/wiki/Prismatic_Trials — **ALTA**
- Slay the Spire — Daily Challenge (seed diária, uma entrada por dia) e a fórmula de score
  empacotada num inteiro; e o relato de trapaça no topo do placar —
  https://slay-the-spire.fandom.com/wiki/Daily_Challenge ,
  https://spire-codex.com/mechanics/score-formula ,
  https://steamcommunity.com/app/646570/discussions/0/1728701877503087255/ — **MÉDIA-ALTA**
- Cogmind — categorias e desempates de placar em roguelike —
  https://www.gridsagegames.com/cogmind/scores/ — **MÉDIA**
- "Scoring in Roguelikes" (aleatoriedade + tempo limitado = loteria) —
  https://www.magicaltimebean.com/2014/09/1863/ — **MÉDIA**

**Eventos sazonais e liveops**
- Guia de liveops sobre componentes reusáveis (objetivos modulares, pools de recompensa,
  configuração pelo backend, agendamento automático) e alternância de formatos de evento —
  https://galaxy4games.com/en/knowledgebase/blog/how-do-we-build-daily-challenges-or-live-events-into-games — **MÉDIA**
- Modelos de cadência de conteúdo para times pequenos —
  https://wardrome.com/the-evolution-of-live-service-models-in-indie-games/ — **BAIXA-MÉDIA**

**Contas, meta-progressão e sincronização**
- Debate documentado sobre meta-progressão de stat em roguelites ("falhar para cima" × melhorar) —
  https://bugnet.io/blog/how-to-design-a-roguelite-meta-progression ,
  https://www.resetera.com/threads/im-starting-to-feel-that-stat-based-meta-progression-is-starting-to-ruin-roguelites-generally-speaking.1509337/ — **MÉDIA**
- Políticas de conflito de save em nuvem (PlayFab / Google Play Games / GDK: unidade atômica de
  conflito, timestamps, escolha do usuário, merge por slot) —
  https://learn.microsoft.com/en-us/gaming/playfab/player-progression/game-saves/conflicts ,
  https://developer.android.com/games/pgs/savedgames — **ALTA**
- Ônus de moderação de chat para times pequenos (>200 mil denúncias/ano, dilema sem saída) —
  https://medium.com/@imperium42/silent-chat-moderation-in-games-the-epic-solution-f416b585006f ,
  https://www.modulate.ai/tip-sheets/moderation-best-practices-for-indie-games — **MÉDIA**
- Fogo amigo e griefing em co-op (sistemas de mitigação e por que plataformas desligam) —
  https://giantbomb.com/wiki/Concepts/Friendly_Fire — **BAIXA-MÉDIA**
- Respawn em onda e espectar como padrão de co-op —
  https://www.gamedev.net/forums/topic/537640-respawn-in-multiplayer-coop-games/537640/ — **BAIXA-MÉDIA**

**Código deste repositório (inspeção direta — ALTA)**
- `src/sim/run.ts` — `checkWaveComplete` já implementa duas primitivas de objetivo:
  `WAVE_DURATION` (sobreviver 30s) e `waveHasBoss` (matar o chefe)
- `src/sim/types.ts` — `World` já tem `wave`, `waveActive`, `waveTimer`, `waveHasBoss`,
  `waveMutator`, `score` e `players` como mapa
- `src/app/save.ts` — formato atual do save: `records` (funde por `max`), `meta.forge`
  (`Record<chave,nível>`, funde por `max`), `unlock/isUnlocked` (conjunto, funde por união) e
  `meta.soulGold` (**contador mutável — o único campo que conflita de verdade na sincronização**)

---
*Feature research for: survival roguelite co-op online (marco de co-op, contas, missões, ranking, eventos)*
*Researched: 2026-08-28*
</content>
</invoke>
