# Pitfalls — co-op P2P, contas próprias, ranking verificado, offline e arte nova

**Domínio:** jogo de navegador já publicado ganhando rede P2P, contas auto-hospedadas,
sincronização offline e ranking verificado por replay — operado por uma pessoa.
**Pesquisado:** 2026-08-28
**Confiança geral:** ALTA nos itens medidos neste repositório e nos verificados em fonte
oficial; MÉDIA nos itens de prática de mercado (marcados individualmente).

---

## Como ler este documento

Isto **não** é uma lista de "cuidado com X". Cada armadilha tem: o que quebra, por que
quebra *neste projeto*, o sinal que aparece antes de custar caro, a prevenção acionável e
a fase que precisa resolvê-la.

**Números medidos aqui, não estimados.** Onde aparece "medido", eu rodei o código deste
repositório para obter o número (os arquivos de medição foram removidos; nada ficou no
repositório).

**Riscos já aceitos conscientemente** pelo spec de origem (`§8 Riscos assumidos`) e pelas
"Tensões conhecidas" do `PROJECT.md` estão marcados com **[JÁ ACEITO]** e são
*reavaliados* contra os requisitos novos — não reapresentados como novidade.

---

## Ranking por custo esperado

Ordenado por `impacto × probabilidade × custo de corrigir tarde`. O raciocínio está
visível na tabela: o que empurra um item para o topo é quase sempre "a correção tardia
exige mudar um formato que já está no banco ou na rede".

| # | Armadilha | Impacto | Prob. | Custo se corrigir tarde | Por que está nesta posição |
|---|-----------|---------|-------|--------------------------|-----------------------------|
| 1 | Replay prova a run, mas não prova a *configuração* da run | Fatal para o ranking | Alta | Muda formato de submissão + esquema do banco + invalida todo score existente | O ranking inteiro vira teatro e ninguém percebe até alguém testar. Correção tarde = apagar o board |
| 2 | Divergência de trigonometria entre motores **e entre versões do mesmo motor** | Fatal para replay e para predição | Certa se não tratada | Trocar `sin/cos/atan2` reequilibra todas as constantes → rebalanceamento → invalida replays | **[JÁ ACEITO como dívida #1]**, mas o inimigo mudou: não é só Chrome×Firefox, é Safari e é o tempo |
| 3 | Sem `SIM_VERSION` derivado automaticamente + temporadas | Ranking morre no 1º patch | Certa | Board inteiro vira não-verificável de uma vez | O redesenho de classes já está agendado no BACKLOG; ele *vai* invalidar tudo |
| 4 | Snapshot ingênuo: não cabe na mensagem nem no upload do host | Marco 2 não funciona | Certa se não medida | Reescrever protocolo depois que UI, replay e reconciliação dependem dele | **Medido: 10–21 KB por snapshot**, acima do limite seguro de 16 KiB do DataChannel |
| 5 | Save como blob único → LWW → perda silenciosa e duplicação | Perde progresso de jogador real | Alta | Migração de esquema com dados já divergentes em produção | `SaveData` hoje é um JSON só; "PUT do blob" é o caminho óbvio e é o errado |
| 6 | Host trapaceiro contamina contas alheias | Confiança do grupo | Média | Rollback manual de contas sem log de auditoria = impossível | **[JÁ ACEITO]** quando o progresso morria no `localStorage`. Deixou de ser aceitável |
| 7 | Ordem de iteração de `world.players` | Dessincronização silenciosa | Alta | Aparece como "bug de netcode" e consome semanas | `step()` itera `Object.keys(world.players)` — ordem de inserção, não determinística entre pares |
| 8 | Service worker de escopo raiz engolindo `/api/` | PWA quebrado + dado autenticado em cache | Alta | Cache já instalado no aparelho dos jogadores; difícil de expurgar | O `sw.js` atual faz network-first e **cacheia até resposta 500** |
| 9 | Escopo: sete produtos num marco só | Projeto para | Alta | Perda de meses | Multiplayer + contas + missões + ranking + offline + temporadas + arte |
| 10 | Arte nova é mudança de *simulação*, não troca de arquivo | Rebalanceamento + replays inválidos | Alta | Refazer arte no formato certo | Hitboxes vivem em `sim/defs/enemies.ts` e derivam do tamanho do sprite atual |
| 11 | NAT: 8–22% dos pares não conectam sem TURN | "O jogo não funciona" para um amigo | Certa | Subir TURN depois é fácil; descobrir tarde queima a estreia | Sem TURN, alguém do grupo simplesmente nunca entra |
| 12 | iOS/Safari: WebRTC suspenso em segundo plano | Metade do público móvel cai | Alta | Nada a fazer no código; só desenho de UX | Limitação de plataforma, não bug |
| 13 | VPS de um só: TLS, backup e ausência de plantão | Jogo fora do ar dias | Média | Restaurar backup nunca testado no pior dia possível | Let's Encrypt **parou de mandar e-mail de expiração** em jun/2025 |
| 14 | Aplicar a doutrina "`dependencies` vazio" ao servidor | Criptografia artesanal | Média | Vazamento de senha | A regra é do *jogo publicado*, não da API. Fácil de confundir |
| 15 | Verificador de replay como amplificador de CPU | VPS derrubada de graça | Média | Fila e limites depois do incidente | Um log alegando 10h de run = 2,16M ticks para o servidor mastigar |
| 16 | Corridas de setup do WebRTC (glare, ICE) | Sala que "às vezes não entra" | Alta | Refatorar o transporte | Clássico: funciona a dois, quebra a quatro |

---

## Armadilhas críticas

### 1. O replay prova a run, mas não prova a configuração da run

**O que dá errado.**
O plano é: cliente manda `seed` + log de inputs; servidor re-roda `step()` e confere o
score. Isso prova apenas *"esses inputs, com essa configuração, produzem esse score"*.
Não prova nada sobre a configuração. Em `RunConfig` (`src/sim/types.ts`) estão
`seed`, `mode`, `classKey` e **`forge`** — os níveis de meta-progressão que multiplicam
vida, dano, velocidade e ouro. Um cliente que submete `forge: { vigor: 99, honed: 99, ... }`
produz um replay **perfeitamente consistente** com um score absurdo. O servidor confirma,
porque a matemática fecha.

Segundo furo, mais sutil: se o cliente escolhe a `seed`, existe *seed farming*. O jogador
roda 500 seeds em segundo plano (a simulação faz **10 minutos de jogo em ~50 ms** — medido
neste repositório), escolhe a que dá a arena mais fácil e o melhor sorteio de loja, e só
então joga a run "de verdade". O replay é honesto. A vantagem é enorme.

**Por que acontece.** "Verificado por replay" soa como prova completa, e é a linguagem que
o `PROJECT.md` usa. A intuição de que "o servidor re-roda, então está seguro" esconde que
a *entrada* da re-execução ainda vem do cliente.

**Prevenção.**
1. **A `seed` é emitida pelo servidor.** Começar uma run pontuável é uma chamada à API que
   devolve `{ runId, seed, simVersion, expiresAt }`. Mata seed farming, dá um limite
   natural de taxa e dá ao servidor um registro de que a run existiu.
2. **O `RunConfig` é reconstruído no servidor a partir do estado da conta**, nunca aceito
   do cliente. O servidor sabe quais níveis de forge a conta tinha quando emitiu o
   `runId`; congela isso junto com a seed.
3. **Run offline não é pontuável, por construção** — sem `runId` do servidor, sem ranking.
   Isso resolve a tensão "Offline versus ranking" do `PROJECT.md` sem inventar política
   nova: não é uma restrição arbitrária, é a consequência de (1).
4. Deixar explícito o que o replay **não** cobre: ele derrota score forjado e stat editing;
   **não** derrota aimbot/bot, porque inputs superhumanos são inputs válidos. Como o `sim/`
   já impõe cooldowns e cadência de arma, o teto do bot é "mira perfeita" — aceitável entre
   amigos, e o texto do ranking deve dizer isso em vez de prometer o que não entrega.

**Sinais de alerta (antes de custar).**
- O tipo da mensagem de submissão contém `forge`, `classKey` ou `seed` vindos do cliente.
- Existe um caminho de código onde `createWorld(config)` no servidor usa `config` do corpo
  da requisição.
- A primeira pessoa que testar mandando `forge` alterado entra no topo do board.

**Fase:** decidir no desenho de **identidade e conta** (o `runId` é um objeto da conta);
implementar na fase de **ranking**. A decisão precede a fase que a consome.

---

### 2. Trigonometria: o inimigo não é o Firefox, é o Safari e é o calendário

**[JÁ ACEITO como dívida #1 do `PROJECT.md` / `BACKLOG.md`.] Reavaliação:** a dívida está
corretamente identificada, mas o modelo de ameaça descrito ("um host no Chrome e um
cliente no Firefox divergem") está **desatualizado e leva à mitigação errada**.

**O que a pesquisa mostra.**
- O ECMAScript de fato não especifica precisão para `sin`, `cos`, `atan2`, `pow`, `exp`,
  `log`, `tanh` etc. — apenas `sqrt` é IEEE-exato. **(CONFIANÇA ALTA, texto da spec.)**
- V8 e SpiderMonkey usam ports (levemente diferentes) de fdlibm; V8 hoje empacota e linka
  a própria matemática estaticamente, o que a torna **idêntica em todo sistema
  operacional**. Na prática, Chrome × Firefox raramente divergem em `sin`/`cos` hoje.
  **(CONFIANÇA MÉDIA.)**
- **JavaScriptCore (Safari) usa a libm da plataforma.** Ou seja, o resultado depende do
  sistema operacional — e o público móvel deste jogo é iOS/Safari por definição (PWA no
  iPhone não tem outro motor). **(CONFIANÇA MÉDIA-ALTA.)**
- **O mesmo motor muda de resposta entre versões.** Exemplos documentados:
  `Math.tanh(0.1)` mudou entre Node 4 e Node 6; `Math.pow(1/3,3)` mudou entre Node 10 e
  Node 12; o Chrome 148 passou `Math.tanh` de fdlibm para a `std::tanh` da plataforma,
  reintroduzindo diferença por SO (Linux/macOS/Windows divergem em até 2 ULP).
  **(CONFIANÇA ALTA, exemplos concretos com valores.)**

**Por que isso muda a mitigação.** O `BACKLOG.md` oferece duas saídas: "`sim/math.ts`
próprio" **ou** "decisão escrita de que os pares compartilham o mesmo motor". A segunda
saída **deixa de existir** com ranking verificado no servidor: um lado é Node numa VPS, o
outro é Safari num iPhone, e a verificação precisa continuar valendo daqui a dois anos,
depois de `apt upgrade nodejs`. Não há como pinar "mesmo motor" nesse cenário.

**Prevenção.**
1. **`sim/math.ts` deixa de ser opção e vira requisito.** A regra que torna isso viável:
   **toda função construída só com `+`, `−`, `×`, `÷` e `Math.sqrt` sobre doubles é
   bit-exata em qualquer motor**, porque a spec fixa essas cinco operações em IEEE-754 com
   arredondamento correto. Então `sin`/`cos`/`atan2` próprios (redução de argumento +
   polinômio minimax, ou LUT com constantes literais no fonte) são determinísticos por
   construção.
2. **O escopo é finito e mensurável: 30 chamadas** — 13 `Math.sin`, 13 `Math.cos`,
   4 `Math.atan2` em `src/sim/` (contadas hoje). `Math.max/min/round/floor/trunc/abs/imul/sqrt`
   são todas exatas e ficam. Restam 2 `Math.hypot` a converter (a doutrina já está escrita
   em `sim/constants.ts`).
3. **Quantizar `aim` na fronteira de input** (ver armadilha 4) elimina o `Math.atan2` de
   `src/app/input.ts:79,82,111,113` do problema: se o ângulo trafega como inteiro de 16
   bits, nenhum par recalcula `atan2`. Isso fecha o segundo item do BACKLOG sem escrever
   `app/math.ts`.
4. **Fazer antes de qualquer replay ser gravado e antes de congelar balanceamento.** Trocar
   a implementação de trig muda todos os resultados no último bit → muda desfechos → muda
   balanceamento → invalida replays gravados. É irreversível de graça só enquanto não
   existe board.
5. **Teste que a suíte atual não pode ter:** um replay de ouro (`seed` + log de inputs +
   hash final por tick) versionado no repositório, executado **no CI em Node e num
   navegador headless**, comparando hashes. O `BACKLOG.md` já registra que
   `determinism.test.ts` não pega essa classe de divergência por comparar dois mundos no
   mesmo processo — esse teste é a correção.

**Nota tranquilizadora, para não gastar esforço à toa.** Diferente de C++, JavaScript não
permite reassociação nem fast-math: o minificador do Vite não é fonte de divergência.
Serialização também não é: `JSON.stringify`/`parse` de doubles em JS faz round-trip exato.
A fonte de divergência é só a biblioteca matemática do motor.

**Sinais de alerta.**
- Um jogador específico (sempre o mesmo, sempre no iPhone) "teleporta" ou vê inimigos em
  lugar diferente, e só ele.
- O replay de uma run passa hoje e falha depois de uma atualização do Node na VPS, sem que
  o código tenha mudado. **Este é o sinal definitivo**, e só aparece se existir o corpus
  de replays de ouro rodando no CI.

**Fase:** decidir e implementar **antes da partida sincronizada (Marco 2)** e
obrigatoriamente antes do ranking.

---

### 3. Sem versionamento automático da simulação, o ranking morre no primeiro patch

**O que dá errado.** Toda mudança que altera a saída de `step()` — ajuste de dano, uma
constante de spawn, a troca de `Math.sin` da armadilha 2, o redesenho de classes já
agendado no `BACKLOG.md`, a arte nova mexendo em hitbox — faz o servidor re-executar um
replay antigo e obter score diferente. O verificador então rejeita runs legítimas. Se o
jogo rejeita silenciosamente, o board congela; se aceita mesmo assim, a verificação virou
enfeite.

**Precedente real.** O Factorio simplesmente **recusa** replays de outra versão: "Cannot
play replay — save game version". A justificativa dos desenvolvedores é exatamente a
cascata determinística: um bíter a menos numa wave muda o consumo de munição, que muda o
horário do trem, que muda tudo depois. O StarCraft faz o oposto e mantém as regras antigas
disponíveis para reproduzir replays da era em que foram gravados. São as duas únicas
estratégias que funcionam; não há terceira. **(CONFIANÇA ALTA — comportamento documentado
em fórum oficial e comunidade.)**

**Por que acontece.** "Essa mudança é pequena, não afeta a simulação" é exatamente o
julgamento humano que erra. E a versão do jogo (`package.json`) não serve: ela sobe por
mudança de UI também, e não sobe quando alguém edita uma constante sem lembrar.

**Prevenção.**
1. **`SIM_VERSION` derivado, não lembrado.** Um hash de conteúdo de `src/sim/**` calculado
   no build e embutido no bundle. O humano nunca decide se mudou — o hash decide.
2. **Todo replay e toda entrada de ranking carregam o `SIM_VERSION` com que foram
   gravados.** O servidor guarda os bundles históricos do sim e replica cada run sob a
   versão dela (estratégia StarCraft), *ou* declara que a mudança de versão fecha o board
   (estratégia Factorio). Para um dev solo, a segunda é honesta e muito mais barata.
3. **Temporadas não são feature de fim de projeto — são a estratégia de versionamento do
   ranking.** Um board é escopado por `(temporada, SIM_VERSION)`. Quando o hash muda, abre
   temporada nova. Isso transforma "quebrei todos os replays" de incidente em evento
   planejado, com narrativa para o jogador. **Consequência de ordenação: o esquema de
   temporada precisa existir antes do primeiro board público, mesmo que a primeira
   temporada dure para sempre.**
4. **Não lançar board "de todos os tempos" antes do redesenho de classes e da arte nova.**
   O `BACKLOG.md` já declara que as 7 classes e os itens são **provisórios**. Um board
   permanente construído sobre regras declaradamente provisórias nasce condenado.
5. Guarda de CI: se o hash de `src/sim/**` mudar e o corpus de replays de ouro mudar de
   resultado, o build **falha** e exige decisão explícita (bump + arquivar board). Nada de
   descobrir em produção.

**Sinais de alerta.**
- Existe uma constante `SIM_VERSION = 1` escrita à mão em algum arquivo.
- O board tem coluna de score mas não tem coluna de versão nem de temporada.
- Alguém comenta "esse patch é só visual" sobre uma mudança em `sim/`.

**Fase:** **ranking** (implementação), mas o esquema de `(temporada, versão)` é decisão de
**modelagem de dados da conta** — antes do banco ter formato.

---

### 4. O snapshot ingênuo não cabe na mensagem, e o upload do host não aguenta

**O que dá errado — com números medidos neste repositório.**

Serializando o `World` como o `hashWorld` dos testes já faz:

| Situação | Snapshot completo | Só o dinâmico (players+enemies+bullets+coins) |
|---|---|---|
| 1 jogador, wave 1 | 6,1–9,6 KB | 1,9 KB |
| 4 jogadores, wave 1 | 13,8–16,4 KB | 10,3 KB |
| 4 jogadores, wave de chefe (14 inimigos) | **21,1 KB** | 18,1 KB |

Custo por entidade, medido: **inimigo = 725 bytes** (42 campos), **jogador = 1.261 bytes**
(31 campos, incluindo `equipment`, `weapon`, `permStats`, `stats`, `levelChoices`).

Extrapolando com a fórmula real de `startNextWave` (`count = 4 + wave*3`, ×1,6 com o
mutador `swarm`): a wave 16 sem chefe tem **52 inimigos**, com `swarm` **83**. A 725 bytes
cada, isso é **38–60 KB de inimigos por snapshot**.

Duas consequências duras:

1. **Estoura o limite de mensagem do DataChannel.** O limite seguro entre navegadores é
   **16 KiB por mensagem** — o Firefox fragmenta em pedaços de 16 KiB e o Chromium não
   remonta. O snapshot medido **já passa disso hoje, na wave 1 com 4 jogadores**.
2. **Estoura o upload doméstico do host.** A 20 Hz para 3 pares:
   - 10 KB/snapshot → 600 KB/s → **4,8 Mbit/s de upload**
   - 20 KB/snapshot → **9,6 Mbit/s**
   - 45 KB/snapshot (wave tardia) → **21,6 Mbit/s**

   Nenhuma conexão doméstica assimétrica brasileira típica sustenta a terceira linha, e
   celular em 4G não sustenta nem a primeira com folga.

**Por que acontece.** `JSON.stringify(world)` funciona no primeiro teste local (localhost
tem banda infinita e RTT zero) e a conta só aparece quando quatro pessoas reais jogam a
wave 14.

**Prevenção.**
1. **Separar estático de dinâmico.** Dos 42 campos do inimigo, a maioria é constante
   durante a vida da entidade (`w`, `h`, `maxHp`, `speed`, `score`, `goldDrop`,
   `potionChance`, `dmg`, `boss`, `scale`, `summons`, `type`, `anim`, `elite*`, `shooter`,
   `exploder`, `abilities`). Mandar uma vez no spawn; por tick, só
   `(id, x, y, hp, flags de estado)` ≈ **12–16 bytes binários**. 83 inimigos × 16 B = 1,3 KB
   → 20 Hz × 3 pares = **~0,6 Mbit/s**. Redução de ~30×.
2. **Dois canais, não um.** Um canal `{ ordered: false, maxRetransmits: 0 }` (semântica
   UDP) para snapshots e inputs; um canal confiável e ordenado para lobby, escolha de
   classe, loja e fim de run. Mandar snapshot em canal confiável e ordenado causa
   *head-of-line blocking*: um pacote perdido trava todos os snapshots seguintes — é
   exatamente o sintoma "congela e depois teleporta". No canal não-ordenado, você precisa
   do seu próprio número de sequência e descartar snapshot atrasado.
3. **Backpressure de verdade.** `bufferedAmount` só cresce depois que os buffers do SCTP
   encheram, então ele é um indicador *tardio* — mas é o único que existe. Se
   `bufferedAmount` de qualquer par passar de um limiar por N ticks seguidos: degradar
   (baixar de 20 para 10 Hz, encolher o raio de interest management) e avisar na UI. O
   Chrome **fecha o DataChannel** quando o buffer passa de ~16 MiB; chegar lá é perder o
   jogador sem explicação.
4. **Quantizar input na captura, não no envio.** `move` em 2 bytes, `aim` em 1 uint16
   (1/65536 de volta), botões em 1 byte = **5 bytes/tick/jogador**. Regra crítica: a
   quantização acontece **antes** de o `sim/` ver o valor, para que o valor gravado no log
   de replay seja exatamente o valor que a simulação consumiu ao vivo. Quantizar só na
   serialização faz o replay divergir da run real — e a divergência aparece só no
   servidor, semanas depois.

**Sinais de alerta.**
- Existe `JSON.stringify(world)` ou `channel.send(JSON.stringify(...))` no caminho quente.
- O teste de rede foi feito só entre duas abas na mesma máquina.
- `bufferedAmount` nunca é lido em lugar nenhum do código.
- Todos os clientes engasgam ao mesmo tempo, e sempre na mesma wave, enquanto o FPS do
  host está ótimo. Esse é o sintoma exato de upload saturado.

**Fase:** o formato do protocolo se decide em **transporte e sala (Marco 1)**; a pressão
aparece em **partida sincronizada (Marco 2)**. Decidir na fase 1.

---

### 5. Save como blob único: perda silenciosa por um lado, duplicação pelo outro

**[JÁ ACEITO como tensão aberta no `PROJECT.md`: "Offline versus conta na nuvem".]**
Aqui está o custo concreto e a política que resolve.

**O que dá errado.** `src/app/save.ts` persiste **um objeto JSON só** em
`dungeonguys2_save_v1`. O caminho óbvio para a nuvem é `PUT /api/save` com esse blob. Isso
é last-write-wins de documento inteiro, e produz os dois defeitos clássicos ao mesmo tempo:

- **Perda silenciosa:** jogo no celular (destravo o ninja), depois no PC (que ainda tem o
  save antigo em cache) — o PUT do PC apaga o destrave. O jogador diz "meu progresso
  sumiu" e você não tem como saber o que havia.
- **Duplicação:** os exploits reais de Dragon's Dogma 2 / Elden Ring / Tiny Tina's são
  todos a mesma receita — jogar offline, sincronizar, restaurar o save local anterior,
  jogar offline de novo, sincronizar de novo. Se o merge for aditivo sem deduplicação, o
  ouro dobra. **(CONFIANÇA ALTA — exploits documentados e reproduzidos publicamente.)**
- **Clock skew:** confiar no `Date.now()` do cliente para desempatar significa que um
  aparelho com relógio adiantado sempre ganha; ignorar o relógio do cliente e usar só o do
  servidor significa que quem sincroniza por último sempre ganha. As duas opções perdem
  dados.

**Duplicação específica deste jogo:** comprar o mesmo upgrade de forge offline em dois
aparelhos. Um débito de soul gold em cada, dois níveis de upgrade, e o merge por `max()`
em `progress.forge[key]` mantém o nível mais alto enquanto o saldo só foi debitado uma vez
de forma efetiva. O `forge` precisa ser parte da **mesma transação** que debita o saldo.

**Prevenção — política de merge por campo do `SaveData` que já existe:**

| Campo | Regra de conciliação | Por quê |
|---|---|---|
| `settings.*` | LWW por campo | Perder uma preferência é aceitável; perder progresso não |
| `records[cls].score/wave/ewave/level` | `max()` | Monotônico por natureza; nunca perde |
| `records[cls].victories` | contador event-sourced | `max()` perderia vitórias ganhas em paralelo |
| `progress.runs/kills/goldEarned/bossKills/victories` | contador event-sourced | Idem |
| `progress.unlocked` | união de conjuntos | Destrave nunca deve regredir |
| `progress.soulGold` | **saldo derivado** = Σ(ganhos deduplicados) − Σ(gastos deduplicados) | Nunca LWW; nunca "o cliente diz que tem X" |
| `progress.forge[key]` | `max()`, **mas** na mesma transação que o gasto | Fecha a duplicação de upgrade offline |

Mecanismo que faz isso funcionar:

1. **Nunca enviar estado; enviar eventos com identidade.** `{ eventId: uuid, tipo: 'runFinished', runId, kills, gold, ... }`. O servidor mantém uma tabela de `eventId` já aplicados e ignora repetições. Isso é o que torna o "sincronizar de novo" inofensivo e mata o exploit de restaurar backup.
2. **Relógio híbrido (HLC) ou contador do servidor** para ordenar, nunca `Date.now()` cru. Um contador atômico do servidor resolve o skew imediatamente e é a opção mais simples: o relógio de ninguém importa, só a sequência.
3. **Teto por conta e por unidade de tempo** no servidor (ex.: X soul gold por minuto de jogo declarado). Barato, e captura tanto trapaça quanto bug de merge.
4. **Log de auditoria de toda concessão durável.** É a única coisa que torna um rollback possível. Sem ele, "o progresso do fulano bugou" não tem correção.
5. Guardar `simVersion` e `saveSchemaVersion` **em cada registro**, desde o primeiro dia.

**Sinais de alerta.**
- Existe um endpoint que aceita o `SaveData` inteiro.
- O `soulGold` do jogador chega na requisição como número absoluto.
- Não existe tabela de deduplicação de eventos.
- Primeiro relato de "meu progresso voltou" — nesse ponto o dado já se perdeu.

**Fase:** **modelagem de identidade e conta** (o `PROJECT.md` já diz que é o que é caro
mudar tarde — este é o motivo concreto). Implementação em **progressão na nuvem + offline**.

---

### 6. Host trapaceiro contaminando contas alheias

**[JÁ ACEITO no spec de origem §8: "trapaça é trivial... não será combatida". A premissa
mudou e o `PROJECT.md` já registra isso em "Tensões conhecidas".] Reavaliação e proposta.**

**O que mudou.** Antes, trapacear afetava um `localStorage` que morria. Agora, o host
decide o que aconteceu na sala, e o resultado vira soul gold, destraves e missões
concluídas em **quatro contas duráveis**. E é assimétrico: quem entra na sala não escolheu
confiar no código do host, escolheu confiar na *pessoa*.

**Mitigação padrão nesta escala — o que vale a pena:**

1. **Cada par envia o próprio log de inputs direto para a API**, não pelo host. O log é
   minúsculo (5 bytes/tick). O host envia o log canônico (os inputs que ele *aceitou* e
   simulou). O servidor compara: divergência pequena é normal (perda de pacote no
   caminho); divergência grossa marca a run como não-verificada. **Este é o item
   estrutural**: sem ele, o host fabrica os inputs dos outros e não há como saber.
2. **Separar recompensa de sessão de recompensa durável.** Ouro dentro da run, itens da
   run, nível da run: livres, morrem com a run. Soul gold, destraves, conclusão de missão e
   score de ranking: concedidos **pelo servidor**, depois da verificação.
3. **Teto de dano por run** (armadilha 5, item 3): mesmo que tudo falhe, o estrago é
   limitado e reversível.
4. **Log de auditoria + rollback por conta.** É o que transforma incidente em aborrecimento.
5. **Fronteira social:** entrada só por código de sala, código longo o bastante para não ser
   enumerável (ver armadilha 15). "Quem você deixa entrar" é uma decisão do jogador, e é a
   defesa mais eficaz nesta escala.

**O que honestamente não vale a pena** (custo alto, benefício quase nulo com amigos, e
inevitavelmente derrotado):
- Ofuscar ou cifrar o bundle do jogo. É JavaScript no navegador do jogador. Perda de tempo.
- Attestation de cliente / detecção de DevTools. Contornável em minutos.
- Detecção estatística/ML de anomalia. Precisa de volume que não existe.
- Re-simular a sessão de co-op no servidor **ao vivo**. É o servidor dedicado que o
  `PROJECT.md` colocou explicitamente fora de escopo — e a verificação assíncrona pós-run
  entrega quase o mesmo resultado por uma fração do custo.
- Sistema de banimento. Com amigos, "eu falo com ele" resolve; o que você precisa é do
  botão de rollback, não do de banir.

**Sinais de alerta.**
- O host é o único que envia log de replay.
- A concessão de soul gold acontece no cliente e é só "sincronizada".
- Não existe distinção no código entre recompensa de sessão e recompensa durável.

**Fase:** decisão na fase de **regras de co-op (Marco 3)**; execução junto com
**progressão na nuvem**.

---

### 7. `Object.keys(world.players)` — determinismo que passa em todos os testes e quebra em produção

**O que dá errado.** `src/sim/step.ts` faz:

```ts
for (const id of Object.keys(world.players)) { ... }
```

Chaves de string não-inteiras em JavaScript iteram em **ordem de inserção**. Hoje há um
jogador só e a ordem não existe. Em co-op, a ordem de inserção é a **ordem de entrada na
sala** — que difere entre host e cliente (quem entrou primeiro na visão de quem?) e
difere de novo no servidor de replay, que provavelmente vai recriar os jogadores em ordem
de `accountId` vinda do banco. Quando dois jogadores interagem com a mesma entidade no
mesmo tick (dois tiros que matam o mesmo inimigo, dois corpos disputando a mesma moeda), a
ordem decide o resultado.

Corolário venenoso: `hashWorld` serializa `world.players` como objeto, então **dois mundos
com conteúdo idêntico mas ordem de inserção diferente produzem hashes diferentes**. Você
vai caçar uma dessincronização que não existe.

**Por que acontece.** É invisível com um jogador. Nenhum teste atual pode pegá-lo: todos
criam os jogadores na mesma ordem.

**Prevenção.**
- Atribuir a cada jogador um **slot numérico estável** (0–3) no momento em que a sala
  fecha, e iterar por slot ordenado, nunca por `Object.keys`.
- O slot vai no protocolo e no log de replay; o servidor reconstrói a mesma ordem.
- `hashWorld` ordena as chaves antes de serializar.
- Teste novo: criar dois mundos com os mesmos 4 jogadores em ordens de inserção diferentes
  e exigir hashes iguais depois de N ticks. É barato e fecha a classe inteira.
- Varredura geral: qualquer `Object.keys`/`for...in`/`Object.entries` sobre estado em
  `sim/` é suspeito. Hoje é só este, e é o momento mais barato de fixar a regra.

**Sinais de alerta.** "Às vezes o cliente e o host discordam de quem matou"; hash diferente
em mundos que parecem iguais; a dessincronização só aparece com 3+ jogadores.

**Fase:** **transporte e sala (Marco 1)** — é onde o conceito de slot nasce.

---

### 8. O service worker de escopo raiz engolindo a API

**O que dá errado — verificado no código atual.** Hoje o SW é registrado em
`import.meta.env.BASE_URL + 'sw.js'`, com `base: '/DungeonGuys2/'`. Na VPS com domínio
único e o jogo na raiz, o escopo passa a ser `/` — e o `public/sw.js` atual faz:

```js
// network-first para tudo que não for png/woff
e.respondWith(
  fetch(e.request)
    .then(res => { const copy = res.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)); return res; })
    .catch(() => caches.match(e.request))
);
```

Com a API no mesmo origin, isso significa:

1. **Todo `GET /api/*` é gravado no Cache Storage.** Resposta autenticada, com dados do
   jogador, num armazenamento que não é limpo no logout e não respeita `Cache-Control`
   (o Cache Storage ignora headers de expiração por design — o que entra fica até o código
   remover).
2. **Offline, a API responde do cache** com dados velhos que o app não distingue de dados
   frescos. Para sincronização offline isso é veneno puro: o cliente lê um saldo antigo,
   calcula em cima dele e sincroniza.
3. **Respostas de erro são cacheadas.** Não há verificação de `res.ok`. Um 502 do nginx
   durante um deploy vira o `index.html` em cache — e os jogadores offline recebem a página
   de erro para sempre.
4. `CACHE = 'dungeonguys2-v1'` é **estático**: o `activate` apaga caches com outro nome,
   mas o nome nunca muda, então os itens do `PRECACHE` nunca são renovados.
5. O `PRECACHE` lista `assets/dungeon_tileset.png` e `assets/copRobo.png` por nome. A arte
   nova troca esses arquivos — e `cache.addAll` **rejeita a instalação inteira se uma única
   URL der 404**. O comentário no topo do próprio `sw.js` documenta que esse erro já
   aconteceu uma vez neste projeto.

**Prevenção.**
1. Primeira linha do `fetch` handler: `if (new URL(e.request.url).pathname.startsWith('/api/')) return;`
   Deixar a requisição passar direto para a rede, sem `respondWith`.
2. Nunca `cache.put` sem `if (res.ok)`.
3. Nome do cache derivado do hash do build, não literal.
4. Precache derivado do manifesto do build (ou reduzido a `index.html` + manifest), não
   lista de nomes de arquivo escritos à mão.
5. Limpar o Cache Storage e o IndexedDB no logout.
6. A migração de `base: '/DungeonGuys2/'` → `'/'` toca **dois lugares** (`vite.config.ts` e
   o registro em `src/main.ts`) e muda o escopo do SW. Fazer como uma tarefa própria, com
   teste manual de instalação limpa **e** de atualização a partir de uma instalação antiga.

**Sinais de alerta.** Requisição a `/api/` aparecendo na aba Application → Cache Storage;
jogador relatando saldo velho depois de reinstalar; página branca depois de um deploy que
teve 30 segundos de 502.

**Fase:** **infra / migração para a VPS**, antes de qualquer chamada de API existir.

---

### 9. Sete produtos num marco só

**O que dá errado.** Este marco propõe, simultaneamente: netcode P2P, contas com senha,
progressão na nuvem, sincronização offline, modo missão com cadeia de destrave, ranking
verificado por replay, eventos sazonais e **direção de arte nova**. Cada um desses é, em
outros projetos, o escopo inteiro de uma release. A literatura de postmortem é consistente:
"escopo grande demais" é o fator citado por mais de 70% dos desenvolvedores indie cujo
projeto atrasou ou morreu, e multiplayer é o item específico mais associado ao padrão.
**(CONFIANÇA MÉDIA — pesquisa de comunidade, não estudo controlado; mas o consenso é
uniforme.)**

**O padrão de falha específico aqui não é "não terminar".** É pior: **terminar sete coisas
pela metade que dependem umas das outras**, de modo que nenhuma pode ser testada de ponta a
ponta e nenhuma pode ser cortada. O sintoma é ter multiplayer que só funciona com conta,
conta que só funciona com o servidor novo, servidor novo que quebrou o PWA, e nenhum
caminho de volta.

**Prevenção — ordenação que reduz risco.** A regra: *primeiro o que é caro mudar depois,
depois o que é caro construir, por último o que é caro operar.*

1. **Decisões de formato, sem implementação** — identidade/conta, `SIM_VERSION`, esquema de
   temporada, política de merge, spec técnica de assets. Barato agora, caríssimo depois.
   O `PROJECT.md` já isolou "formato de identidade antes do multiplayer"; esta lista é a
   versão completa dessa mesma ideia.
2. **`sim/math.ts` + slot de jogador + corte da aresta `xp → run`** — dívida do Marco 0 que
   só fica mais cara com rede em cima.
3. **Migração para a VPS com o jogo single-player** — TLS, deploy, SW, backup, tudo
   exercitado enquanto o único risco é o jogo que já funciona. **Nunca migrar infra e
   estrear rede na mesma semana.**
4. **Transporte e sala** (Marco 1) — 4 navegadores, ping na tela.
5. **Partida sincronizada** (Marco 2) e **regras de co-op** (Marco 3).
6. **Contas + progressão na nuvem + offline.**
7. **Arte nova integrada** — antes do ranking, porque muda a simulação (armadilha 10).
8. **Missões**, depois **ranking** (que precisa do sim headless e do versionamento),
   depois **temporadas/eventos**.

**Corte defensável se o tempo apertar, em ordem:** eventos sazonais → missões → ranking →
offline. **O que não se corta:** o Core Value declarado ("quatro amigos numa sala pelo
código"). Se algo ameaça o item 4–5, tudo o mais espera.

**Sinais de alerta.** Três branches abertos há mais de duas semanas; o backlog cresce mais
rápido do que encolhe; "vou só deixar isso pronto pra depois" aparecendo em commit.

**Fase:** decisão de roadmap. É a armadilha que o roadmap existe para prevenir.

---

### 10. A arte nova é uma mudança de simulação, não uma troca de arquivo

**O que dá errado — verificado no código.** As hitboxes vivem em
`src/sim/defs/enemies.ts`, na camada pura, e os números derivam diretamente do tamanho dos
sprites atuais: `skeleton` tem sprite 16×16 e hitbox `w:26,h:26`; `big_demon` tem sprite
32×36 e hitbox `w:52,h:62`; os chefes carregam `scale: 3` / `2.4` / `2.3`. `TILE = 32` mora
em `src/sim/constants.ts` e define `world.play` — as bordas jogáveis do mundo.

Ou seja: mudar resolução de arte força uma escolha, e **as duas opções custam**:
- manter as hitboxes → a arte nova não bate com a colisão, e o jogo "parece errado";
- reescalar as hitboxes → muda alcance, muda quantos inimigos cabem numa passagem, muda o
  balanceamento inteiro, e **invalida todo replay e todo score já gravado**.

Some a isso: `render/sprites.ts` tem as coordenadas do atlas **escritas à mão** (`frames(128, 164, 16, 28, 4)`),
e o render inteiro assume **4 quadros** de idle e 4 de run para todo mundo. Cada iteração
de arte vira uma edição manual de código.

**Por que acontece.** "Arte é asset, engenharia é código, são repositórios separados"
soa como uma fronteira limpa — e é justamente o que faz os dois lados assumirem coisas
incompatíveis por meses.

**O que precisa estar **pinado** antes de o agente de arte produzir o primeiro asset
final** (o `PROJECT.md` já exige a spec antes da produção; esta é a lista mínima do que a
spec precisa conter):

| Item a pinar | Por que trava trabalho se ficar aberto |
|---|---|
| Resolução nativa do sprite (ex.: 16, 24, 32 px) | Cada dobra de resolução ~quadruplica o trabalho por asset |
| Fator de escala de px de sprite → unidade de mundo | É o que liga arte a hitbox |
| Se `TILE` muda, e para quanto | Muda `world.play`, o tilemap e o piso pré-renderizado |
| Se `WORLD` (2400×1600) muda | O piso pré-renderizado já é ~15 MB de bitmap; o spec de origem marca esse número como "o número a vigiar" |
| Pivô/âncora (pés? centro?) | Decide se o personagem "afunda" no chão |
| Contagem de quadros por animação | O render assume 4 hoje; mudar isso é mudança de código |
| Layout do atlas + **manifesto legível por máquina** (JSON) | Sem manifesto, cada entrega de arte é edição manual de coordenadas |
| Convenção de nome de arquivo e de animação | O `PRECACHE` do SW e `ANIMS` dependem de nomes |
| Paleta / regra de recolorização | O jogo já faz troca de paleta por classe (`COP_SHEET`) |
| Licença/proveniência | O tileset atual é 0x72 DungeonTilesetII CC0; o novo precisa ter procedência declarada |

**Prevenção adicional.**
1. **Contrato antes de conteúdo:** o repositório de arte entrega primeiro **um único
   personagem e um único tile** no formato final, e este projeto os integra de ponta a
   ponta antes de a produção em massa começar. Um asset errado é barato; duzentos, não.
2. **Trocar coordenadas escritas à mão por manifesto** *antes* da arte nova chegar.
3. **Integrar a arte antes do ranking ir ao ar**, ou aceitar que a integração fecha uma
   temporada (armadilha 3).
4. Congelar a decisão sobre hitbox: recomendado é **reescalar hitboxes junto com a arte, de
   uma vez**, enquanto ainda não existe board — e nunca depois.

**Sinais de alerta.** O agente de arte perguntando "que resolução?" depois de já ter
entregue coisas; um asset novo que exige `scale` fracionário no render para "encaixar";
qualquer PR que mude `TILE` sem tocar em `sim/defs/enemies.ts`.

**Fase:** a spec de assets é **pré-requisito de produção** (decidir agora); a integração é
fase própria, **antes do ranking**.

---

## Armadilhas moderadas

### 11. NAT: uma fração real dos amigos simplesmente não conecta

**Números.** Medições públicas de larga escala em WebRTC apontam **~22% das sessões
precisando de algum relay TURN**, e taxa de falha de estabelecimento na casa de **12%**,
com ~85% das falhas atribuídas a NAT/firewall. **(CONFIANÇA MÉDIA — dados agregados de
provedores, majoritariamente de conferência A/V; DataChannel tende a ser um pouco melhor,
mas a ordem de grandeza vale.)**

Traduzindo para este projeto: numa sala de 4, a chance de *pelo menos um* par precisar de
relay é alta. Sem TURN, a experiência dessa pessoa é "o jogo não funciona", sem mensagem.

**Prevenção.** Subir `coturn` na própria VPS junto com o signaling (o custo de CPU/memória
do TURN é baixo; o custo é **banda**). Credenciais **efêmeras por HMAC com prazo**
(mecanismo REST do TURN), nunca usuário/senha fixos — um TURN com credencial fixa vazada
vira proxy aberto e a fatura de banda é sua. Limitar taxa e duração de alocação por conta.
Diferenciar na UI "não consegui conectar" de "conectado mas com lag".

**Conflito de porta a antecipar:** TURN sobre TLS na 443 (o que atravessa firewall
corporativo restritivo) briga com o nginx na 443. Ou se abre mão da 443 para TURN, ou se
faz demux por SNI. Decidir no desenho da infra, não no dia.

**Sinais de alerta.** Um amigo específico nunca entra; `iceConnectionState` indo para
`failed` sem passar por `connected`; nenhum candidato `relay` nos logs de ICE.

**Fase:** **transporte e sala (Marco 1)** + **infra**.

---

### 12. iOS e Safari: a plataforma trabalha contra você

**O que dá errado.** No iOS, WebRTC e Web Audio são **suspensos quando a tela bloqueia ou o
navegador vai para segundo plano**, e conexões WebRTC caem quando o app é mandado para
trás — a menos que exista uma faixa de áudio ativa segurando a sessão. PWA no iOS tem cota
de armazenamento menor e Background Sync não é suportado (a sincronização acontece quando o
app é reaberto). **(CONFIANÇA MÉDIA-ALTA — reportado consistentemente por desenvolvedores e
reconhecido nos fóruns da Apple.)**

Consequência: um jogador de iPhone que recebe uma ligação, ou que trava a tela por cinco
segundos, cai da sala. Se ele era o **host**, a partida dos quatro acaba.

**Prevenção.**
- **Não deixar iPhone hospedar** quando houver alternativa; escolher host por plataforma e
  por banda medida, não por "quem criou a sala".
- Reconexão explícita: WebRTC não reconecta sozinho — precisa de ICE restart e de o
  signaling continuar disponível durante a partida (o spec de origem previa "casa duas
  pontas e esquece"; isso precisa mudar).
- `visibilitychange` → avisar os outros ("Fulano minimizou") em vez de deixar a conexão
  morrer em silêncio.
- Testar em iPhone real cedo. O `docs/PARIDADE.md` já lista PWA em aparelho real como
  caixa não conferida — ela deixa de ser cosmética aqui.

**Fase:** **resiliência (Marco 4)**, mas a escolha de host é decisão do **Marco 1**.

---

### 13. VPS de um só: TLS, backup e a ausência de plantão

**O que realmente dá errado, em ordem de probabilidade:**

1. **Renovação de TLS falhando em silêncio.** Causas comuns: porta 80 fechada, um redirect
   engolindo `/.well-known/acme-challenge/`, dois clientes ACME brigando, hook de reload do
   nginx que nunca roda (o certificado renova e o servidor continua servindo o antigo).
   **E o aviso desapareceu: o Let's Encrypt encerrou o serviço de e-mail de expiração em
   4 de junho de 2025.** **(CONFIANÇA ALTA — anúncio oficial.)** Ninguém vai te avisar.
2. **Backup que nunca foi restaurado.** Um dump que roda todo dia e nunca foi lido não é
   backup, é ritual.
3. **A caixa cai e você está dormindo.** Sem plantão, "fora do ar" é medido em horas ou
   dias.
4. **Um processo derruba os outros.** Jogo estático, API, signaling e TURN na mesma caixa:
   um vazamento de memória no signaling mata a API; o TURN saturando a banda deixa o jogo
   inacessível.

**Prevenção (proporcional ao tamanho — nada de SRE).**
- Monitoramento **externo** e gratuito: uma checagem de fora que fala o certificado e
  responde a `/health`, avisando no seu celular. Externa, porque monitoramento que roda na
  mesma caixa cai junto.
- Alarme de certificado com **30 dias** de antecedência, não 7.
- **Restauração testada** uma vez, num diretório de teste, com o resultado anotado. Uma
  vez. Se nunca foi feito, você não tem backup.
- Backup **fora da VPS** (a Hostinger cair leva o snapshot junto).
- Limites de memória por serviço (systemd `MemoryMax`) para que um processo não leve os
  outros.
- Página de manutenção estática servida quando a API está fora, para que o jogo
  single-player continue jogável — o PWA já é offline-first; use isso.
- **Deploy reversível.** Symlink de release + rollback num comando. Numa caixa só, sem
  ambiente de homologação, o rollback é a rede de segurança.

**Sinais de alerta.** `certbot renew --dry-run` que ninguém rodou depois da última mudança
de nginx; ausência de qualquer alerta configurado; `df -h` acima de 80% (log de TURN e
dump de banco enchem disco em silêncio e derrubam o Postgres).

**Fase:** **infra / migração para a VPS**, feita com o jogo single-player.

---

### 14. Contas feitas à mão: onde a doutrina do projeto engana

**A armadilha específica deste projeto.** A restrição declarada é `dependencies` vazio — e
ela é sobre **o jogo publicado**, que é canvas puro. Se essa doutrina vazar para a API, o
resultado previsível é criptografia artesanal: hash de senha caseiro, sessão caseira,
comparação de token não-constante no tempo. **Escreva no roadmap que a regra não se aplica
ao servidor.**

**A boa notícia, verificada nesta máquina.** O `node:crypto` **já tem Argon2 embutido**:
`crypto.argon2Sync('argon2id', { message, nonce, memory, passes, parallelism, tagLength })`.
Adicionado no Node **24.7.0** e marcado como estável no **24.19.0**. Rodando os parâmetros
recomendados pela OWASP (`m=19456 KiB, t=2, p=1`) nesta máquina: **52 ms**. Ou seja, dá para
ter hash de senha correto **sem dependência nativa** — desde que a VPS rode Node ≥ 24.19.
**(CONFIANÇA ALTA — medido localmente; versão confirmada em fonte pública.)**

**A barra mínima responsável, com público de amigos que pode abrir:**

| Item | Mínimo agora | O que muda ao abrir |
|---|---|---|
| Hash de senha | Argon2id `m=19456,t=2,p=1` (ou scrypt `N=2^17,r=8,p=1`) | Igual |
| Sessão | Cookie `HttpOnly; Secure; SameSite=Lax` — funciona porque **é um origin só**, que é justamente o retorno da decisão de domínio único | Idem + revogação por sessão |
| Token em `localStorage` | **Não.** O jogo manipula DOM; XSS exfiltra o token | — |
| Limite de tentativas de login | Obrigatório desde o dia um | + bloqueio progressivo |
| Recuperação de conta | E-mail coletado no cadastro **ou** código de recuperação mostrado uma vez | Fluxo de reset por e-mail verificado |
| Exclusão de conta | Um caminho manual documentado | Autoatendimento (LGPD) |
| E-mail verificado | Não necessário entre amigos | Necessário |
| Nome de exibição | Livre | Unicidade + moderação |

**Duas armadilhas de segundo nível.**
- **O Argon2 é um vetor de negação de serviço.** 19 MiB por verificação × N logins
  simultâneos. 100 logins concorrentes = ~1,9 GB. Limite de taxa no endpoint de login não é
  opcional numa VPS pequena, é o que impede alguém de derrubá-la com um laço de `curl`.
- **Se cair no scrypt:** o `node:crypto` tem `maxmem` padrão de 32 MiB, e
  `N=2^17, r=8` precisa de ~134 MiB. **Verificado nesta máquina:** sem `maxmem` explícito,
  `crypto.scryptSync` lança `Invalid scrypt params: memory limit exceeded`. Com
  `maxmem: 256*1024*1024`, roda em 264 ms. Quem não sabe disso "resolve" baixando o `N` —
  e silenciosamente enfraquece o hash.

**Sinais de alerta.** Qualquer função chamada `hashPassword` escrita à mão; `crypto.createHash('sha256')`
perto de senha; token de sessão em `localStorage`; endpoint de login sem contador.

**Fase:** **identidade e conta**.

---

### 15. Detalhes que custam pouco agora e muito depois

**Verificador de replay como amplificador de CPU.** Medido: `step()` custa ~1,4 µs/tick com
carga leve; uma run de 10 minutos são 36.000 ticks. Em wave cheia isso sobe para talvez
20–50 µs/tick — ou seja, **verificar uma run custa entre décimos de segundo e alguns
segundos de CPU**. Viável. Mas um log alegando 10 horas de endless são **2,16 milhões de
ticks**, e alguém pode enviar dez desses em paralelo. *Prevenção:* teto de ticks por
submissão, teto de bytes por log, verificação **assíncrona numa fila com um worker só**, e
limite de submissões por conta. Nunca verificar dentro do handler HTTP.

**Tamanho do log de inputs.** `InputState` em JSON são ~140 bytes. Uma campanha de 4
jogadores a 60 Hz são ~150–220 mil `InputState` → **20–30 MB por run**. Inviável para o
banco. Quantizado (armadilha 4, item 4) são 5 bytes/tick/jogador → ~1 MB, e com RLE sobre
ticks idênticos, centenas de KB. **O formato do log é imutável na prática** — mudá-lo
invalida tudo que já foi gravado. Decidir junto com o protocolo.

**Corridas de setup do WebRTC (glare).** Duas pontas gerando oferta ao mesmo tempo travam a
máquina de estados. A solução canônica é *perfect negotiation* (papéis "polido"/"impolido",
`makingOffer`, rollback). Numa topologia estrela com host, o papel é natural — o host é
sempre o impolido. *Sinal de alerta:* funciona com dois, falha intermitentemente com
quatro; erro de `setRemoteDescription` em estado `have-local-offer`.

**nginx e WebSocket.** O signaling por WebSocket atrás do nginx exige os headers de
`Upgrade`/`Connection` e um `proxy_read_timeout` maior — o padrão de 60 s derruba salas
ociosas no lobby. *Sinal:* "a sala cai sozinha depois de um minuto esperando os amigos".

**Código de sala enumerável.** Sem diretório público (decisão do spec), o código de sala é
a única credencial. Um código de 4 caracteres tem espaço pequeno o bastante para varredura.
*Prevenção:* 6+ caracteres de um alfabeto sem ambiguidade (sem `O/0`, `I/1`), limite de
taxa nas tentativas de entrada por IP e expiração da sala.

**Eventos sazonais com data no cliente.** Data e fuso decididos pelo relógio do cliente
significam que o evento começa 12 horas cedo para quem mexer no relógio — e é o mesmo
relógio que a armadilha 5 já ensinou a não confiar. *Prevenção:* janela de temporada
sempre vinda do servidor, em UTC, e o cliente só renderiza.

**Queda do host destruindo progresso durável. [JÁ ACEITO no spec §8 — reavaliar.]** Quando
o progresso morria no `localStorage`, perder a partida por queda do host era um
aborrecimento. Agora, 40 minutos de co-op perdidos são progressão durável perdida de
**quatro contas**. *Mitigação proporcional:* conceder progressão durável **por wave
concluída**, não só no fim da run — o servidor recebe um checkpoint pequeno a cada wave
limpa. Muda o risco de "perdi tudo" para "perdi a última wave".

---

## Padrões de dívida técnica

| Atalho | Benefício imediato | Custo a prazo | Quando é aceitável |
|---|---|---|---|
| `JSON.stringify(world)` como snapshot | Marco 2 andando em uma tarde | Estoura 16 KiB e o upload do host; reescrita depois que tudo depende do formato | Só num spike descartável, com prazo de descarte escrito |
| Cliente escolhe a seed | Modo offline trivial | Seed farming; ranking sem valor | Se e somente se a run offline for declarada não-pontuável |
| `PUT` do save inteiro | Sincronização em um dia | Perda silenciosa + duplicação; migração com dados já divergentes | Nunca, se houver moeda durável |
| `SIM_VERSION` escrito à mão | Zero build tooling | Alguém esquece de subir; replay antigo verifica errado em silêncio | Nunca — derivar de hash é quase de graça |
| Copiar `sim/` para o repo do servidor | Servidor independente | Divergência silenciosa entre a simulação que joga e a que verifica | Nunca. O servidor importa o mesmo fonte |
| Manter `Math.sin/cos/atan2` e exigir "mesmo motor" | Zero trabalho agora | Impossível com Node no servidor + Safari no cliente + o tempo passando | Só se o ranking verificado for cortado |
| TURN com credencial fixa | Configuração em 10 minutos | Proxy aberto; conta de banda | Só num teste privado com prazo |
| Coordenadas de atlas escritas à mão | Já funciona hoje | Cada iteração de arte é edição manual de código | Só até a arte nova entrar |
| Sem log de auditoria de progressão | Menos tabela | Nenhum rollback possível quando algo der errado | Nunca, uma vez que existe moeda durável |
| Escopo de SW na raiz sem excluir `/api/` | Nada a fazer | Dado autenticado em cache; resposta velha alimentando o sync | Nunca |

---

## Armadilhas de integração

| Integração | O erro comum | O correto |
|---|---|---|
| WebRTC DataChannel | Um canal só, confiável e ordenado, para tudo | Dois canais: `{ordered:false, maxRetransmits:0}` para snapshot/input; confiável para controle |
| WebRTC DataChannel | Mensagem acima de 16 KiB | Manter abaixo de 16 KiB (Firefox fragmenta, Chromium não remonta); ou fragmentar você mesmo |
| WebRTC ICE | Só STUN | STUN + TURN próprio com credencial efêmera |
| WebRTC | Signaling desligado depois do handshake | Manter vivo — reconexão precisa de ICE restart |
| Service worker | `respondWith` em tudo | Deixar `/api/` passar direto |
| Service worker | `cache.put` sem checar `res.ok` | Cachear só 2xx |
| Let's Encrypt | Confiar no aviso por e-mail | O serviço acabou em jun/2025 — monitorar de fora |
| nginx + WebSocket | Configuração padrão | Headers de Upgrade + `proxy_read_timeout` maior |
| coturn | Portas só 3478 | Faixa de relay UDP (49152–65535) liberada; conflito de 443 com o nginx resolvido |
| `node:crypto` scrypt | `N=2^17` sem `maxmem` | Passar `maxmem` explícito (medido: falha sem ele) |
| Banco | Timestamp do cliente para ordenar | Contador do servidor ou HLC |

---

## Armadilhas de desempenho

| Armadilha | Sintoma | Prevenção | Quando quebra |
|---|---|---|---|
| Snapshot JSON completo | Todos os clientes travam juntos, host normal | Delta binário; estático só no spawn | **Já hoje**: 13,8 KB com 4 jogadores na wave 1 |
| Upload do host | Rubber-band que piora com a wave | Orçamento de banda medido; degradação automática | ~10 Mbit/s de upload, ou wave ~10 com 4 jogadores |
| `bufferedAmount` ignorado | DataChannel fecha "sozinho" | Ler e degradar; nunca deixar passar de alguns MB | Chrome fecha em ~16 MiB |
| Piso pré-renderizado | Aba estoura memória em celular | Vigiar se `WORLD` crescer com a arte nova | ~15 MB a 2400×1600; cresce com o quadrado |
| Verificação de replay síncrona | API congela ao submeter score | Fila com um worker; teto de ticks | Uma run de 2h = ~430k ticks |
| Argon2 sem limite de taxa | VPS sem memória | Limite no login | ~100 logins concorrentes = ~1,9 GB |
| Log de TURN e dump de banco | Disco cheio → Postgres para | Rotação + alarme de disco | Semanas de operação sem olhar |

---

## Erros de segurança

| Erro | Risco | Prevenção |
|---|---|---|
| Aceitar `RunConfig` (forge, classe, seed) do cliente na submissão de score | Ranking sem valor; forja indetectável | Servidor emite seed e reconstrói o config a partir da conta |
| Host envia o log de inputs dos outros | Host fabrica progressão nas contas alheias | Cada par envia o próprio log; servidor cruza |
| Enviar saldo absoluto de soul gold | Duplicação por replay de sincronização | Eventos com `eventId` e deduplicação; saldo derivado |
| Token de sessão em `localStorage` | XSS exfiltra a conta | Cookie `HttpOnly; Secure; SameSite` (viável por ser origin único) |
| TURN com credencial estática | Proxy aberto; banda roubada | Credencial HMAC com prazo |
| Código de sala curto | Estranho entra na sala dos amigos | 6+ caracteres, alfabeto sem ambiguidade, limite de taxa, expiração |
| SW cacheando `/api/` | Dado autenticado persistido; não limpo no logout | Excluir `/api/`; limpar caches no logout |
| Hash de senha artesanal por causa da regra de zero dependências | Vazamento de senha | A regra é do jogo, não do servidor; `crypto.argon2` do Node 24.19+ |
| Login sem limite de tentativas | Força bruta e negação de serviço por custo de Argon2 | Limite por IP e por conta |
| Sem log de auditoria | Impossível reverter dano | Registrar toda concessão durável |

---

## Armadilhas de experiência

| Armadilha | Impacto no jogador | Melhor abordagem |
|---|---|---|
| "Falha ao conectar" sem distinguir causa | Amigo desiste achando que o jogo está quebrado | Separar "não achei a sala", "não consegui furar seu NAT" (sugerir TURN/rede), "o host caiu" |
| Host cai e a run some | 40 min de quatro pessoas perdidos | Checkpoint de progressão durável por wave |
| Conflito de sincronização mostrado como diálogo técnico | Jogador escolhe errado e perde progresso | Não perguntar: conciliar por regra (max/união/eventos) e só avisar |
| Login obrigatório para jogar | Barreira antes do valor | Continuar jogável sem conta; conta é para levar o progresso junto |
| Ranking sem dizer o que é verificado | Suspeita mútua entre amigos | Rótulo explícito: verificado / não verificado / offline |
| Score de co-op no mesmo board do solo | Comparação sem sentido; host tem vantagem de latência **[risco já aceito]** | Boards separados |
| Temporada acabando sem aviso | Sensação de perda | Contagem regressiva e arquivo do board anterior |
| PWA atualizando no meio da partida | Recarga inesperada | Adiar a ativação do SW novo enquanto `phase === 'playing'` |

---

## "Parece pronto, mas não está"

- [ ] **Sala P2P:** costuma faltar TURN — verificar com um par em rede móvel, atrás de CGNAT.
- [ ] **Partida sincronizada:** costuma faltar teste em latência e perda reais — verificar
      com traffic shaping (150 ms, 2% de perda), não em `localhost`.
- [ ] **Partida sincronizada:** costuma faltar orçamento de banda — verificar bytes/s reais
      do host na wave 12 com 4 jogadores.
- [ ] **Determinismo:** costuma faltar a comparação **entre motores** — verificar com
      replay de ouro rodando no CI em Node **e** em navegador headless.
- [ ] **Determinismo:** costuma faltar a ordem de `world.players` — verificar com dois
      mundos criados com ordens de inserção diferentes.
- [ ] **Ranking:** costuma faltar a verificação da *configuração* — verificar submetendo um
      replay honesto com `forge` alterado; tem que ser rejeitado.
- [ ] **Ranking:** costuma faltar o teto de ticks — verificar submetendo um log de 5 milhões
      de ticks; tem que ser recusado sem consumir CPU.
- [ ] **Sincronização:** costuma faltar o teste de duplicação — verificar jogando offline em
      dois aparelhos e sincronizando os dois; o saldo tem que fechar.
- [ ] **Sincronização:** costuma faltar idempotência — verificar reenviando o mesmo lote
      duas vezes.
- [ ] **Conta:** costuma faltar recuperação — verificar que existe caminho para quem esquece
      a senha, e que ele não é "me manda mensagem".
- [ ] **PWA na VPS:** costuma faltar o teste de atualização — verificar instalação limpa
      **e** atualização a partir de uma instalação anterior, offline depois de cada uma.
- [ ] **PWA na VPS:** costuma faltar o isolamento da API — verificar que `/api/` não aparece
      no Cache Storage.
- [ ] **TLS:** costuma faltar o ensaio — verificar com `certbot renew --dry-run` **depois**
      da configuração final do nginx, e com alarme externo configurado.
- [ ] **Backup:** costuma faltar a restauração — verificar restaurando num diretório de
      teste e anotando a data.
- [ ] **Arte:** costuma faltar o ciclo completo — verificar integrando **um** asset final de
      ponta a ponta antes da produção em massa.
- [ ] **Missões:** costuma faltar a validação do objetivo no servidor — verificar que
      "concluí a missão" não é afirmação do cliente.

---

## Estratégias de recuperação

| Armadilha | Custo de recuperar | Como recuperar |
|---|---|---|
| Divergência de trig descoberta com board no ar | ALTO | Implementar `sim/math.ts`, subir `SIM_VERSION`, arquivar a temporada, comunicar. Não há como preservar os replays |
| Ranking fraudado por config do cliente | ALTO | Invalidar o board, mudar o protocolo para seed emitida pelo servidor, reabrir temporada |
| Saves divergidos por LWW | ALTO | Só recuperável com log de auditoria. Sem ele, é perda definitiva — este é o argumento para criar o log antes de precisar |
| Snapshot grande demais | MÉDIO | Trocar por delta binário. Doloroso, mas contido no transporte se a fronteira `InputState`/snapshot estiver limpa |
| Ordem de `players` divergente | BAIXO | Slot numérico + ordenação; corrigível em uma tarde se pego cedo, semanas de caça se pego tarde |
| SW cacheando a API | MÉDIO | Publicar SW novo que limpa o cache no `activate` — mas só chega em quem abre o jogo online |
| TURN abusado | BAIXO | Trocar segredo, migrar para credencial efêmera, limitar taxa |
| VPS fora do ar | MÉDIO | Restaurar snapshot + backup externo; o jogo single-player continua funcionando pelo PWA se o SW estiver correto |
| Host trapaceiro | BAIXO **se** houver log de auditoria; alto sem | Reverter as concessões daquele `runId` |
| Arte no formato errado | ALTO | Refazer. É por isso que a spec precede a produção |

---

## Mapeamento armadilha → fase

| Armadilha | Fase que previne | Como verificar que a prevenção funcionou |
|---|---|---|
| 1. Config do cliente na verificação | Identidade/conta (decisão) → Ranking (execução) | Replay honesto com `forge` inflado é rejeitado |
| 2. Trigonometria | Antes da partida sincronizada (Marco 2) | Replay de ouro com hashes iguais em Node e navegador, no CI |
| 3. Versionamento e temporada | Modelagem de dados (decisão) → Ranking | Mudar uma constante de `sim/` faz o CI falhar exigindo bump |
| 4. Snapshot e banda | Transporte e sala (Marco 1) | Bytes/s medidos na wave 12 com 4 jogadores dentro do orçamento |
| 5. Merge de save | Identidade/conta (formato) → Progressão na nuvem | Dois aparelhos offline sincronizando: saldo fecha, nada some |
| 6. Host trapaceiro | Regras de co-op (Marco 3) → Progressão | Cada par tem log próprio no servidor; existe rollback por `runId` |
| 7. Ordem de `players` | Transporte e sala (Marco 1) | Teste de ordem de inserção passa |
| 8. Service worker e API | Infra / migração para a VPS | `/api/` ausente do Cache Storage; instalação limpa e atualização testadas |
| 9. Escopo | Roadmap | Cada fase termina com o jogo jogável; nunca 3 frentes abertas |
| 10. Arte como mudança de sim | Spec de assets (antes da produção) → Integração antes do ranking | Um asset final integrado ponta a ponta antes da produção em massa |
| 11. NAT/TURN | Transporte e sala + Infra | Par em rede móvel entra na sala |
| 12. iOS/Safari | Marco 1 (escolha de host) + Marco 4 (resiliência) | Partida sobrevive a 10 s de tela bloqueada num cliente iPhone |
| 13. Operação da VPS | Infra, com o jogo single-player | Alarme externo dispara em teste; restauração de backup registrada |
| 14. Contas | Identidade e conta | Argon2id com parâmetros OWASP; login com limite de taxa; sessão em cookie |
| 15. Detalhes (replay/DoS, log, glare, nginx, código de sala, data de evento, checkpoint) | Fases correspondentes | Ver cada item |

---

## Tensões do `PROJECT.md`: onde cada uma se resolve

| Tensão declarada | Onde este documento a resolve | Resumo da resolução |
|---|---|---|
| Offline versus conta na nuvem | Armadilha 5 | Tabela de merge por campo do `SaveData` + eventos idempotentes + contador do servidor. **Decidir antes do banco ter formato** |
| Offline versus ranking | Armadilha 1 | Seed emitida pelo servidor ⇒ run offline é não-pontuável **por construção**, não por decreto |
| Trapaça deixou de ser inofensiva | Armadilha 6 | Log de inputs por par + separação sessão/durável + teto por run + auditoria com rollback. E a lista explícita do que **não** fazer |

---

## Fontes

**Confiança ALTA — medido neste repositório (2026-08-28), arquivos de medição removidos:**
- Tamanho de snapshot, custo por entidade, contagem de campos: execução de `src/sim/` via vitest
- Custo de `step()` por tick: execução de `src/sim/`
- `crypto.argon2Sync` e `crypto.scryptSync` no Node v24.11.1: execução local
- Contagem de `Math.sin/cos/atan2` em `src/sim/`, comportamento do `public/sw.js`, acoplamento de hitbox em `src/sim/defs/enemies.ts`: leitura do código

**Confiança ALTA — fonte oficial:**
- OWASP Password Storage Cheat Sheet — https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html
- Let's Encrypt, fim das notificações de expiração — https://letsencrypt.org/2025/06/26/expiration-notification-service-has-ended
- MDN, `RTCDataChannel.bufferedAmount` / `bufferedAmountLowThreshold` — https://developer.mozilla.org/en-US/docs/Web/API/RTCDataChannel/bufferedAmount
- web.dev, Service workers e Cache Storage API — https://web.dev/articles/service-workers-cache-storage
- Lennart Grahl, limites de tamanho de mensagem do DataChannel — https://lgrahl.de/articles/demystifying-webrtc-dc-size-limit.html
- MDN / webrtcHacks, perfect negotiation — https://webrtchacks.com/min-duration-series-part-1-perfect-negotiation/

**Confiança MÉDIA-ALTA:**
- macwright, "Math keeps changing" (exemplos concretos de mudança entre versões de motor) — https://macwright.com/2020/02/14/math-keeps-changing
- scrapfly, matemática de navegador como impressão digital de SO (V8 estático vs. `Math.tanh` no Chrome 148; divergência de até 2 ULP entre glibc/Apple/UCRT) — https://scrapfly.dev/posts/browser-math-os-fingerprint/
- Mozilla dev-platform, intenção de usar fdlibm em `cos`/`sin`/`tan` — https://groups.google.com/a/mozilla.org/g/dev-platform/c/0dxAO-JsoXI
- webrtcHacks, guia de WebRTC no Safari — https://webrtchacks.com/guide-to-safari-webrtc/

**Confiança MÉDIA — dados agregados de terceiros ou consenso de comunidade:**
- webrtcHacks, "The Big Churn" (≈22% das conferências precisando de TURN; ~12% de falha) — https://webrtchacks.com/usage-stats/
- Fóruns oficiais do Factorio sobre replays travados por versão — https://forums.factorio.com/viewtopic.php?t=112932
- Gaffer On Games, determinismo de ponto flutuante — https://gafferongames.com/post/floating_point_determinism/
- coturn wiki, desempenho e balanceamento — https://github.com/coturn/coturn/wiki/TURN-Performance-and-Load-Balance
- Jared Forsyth, relógios lógicos híbridos — https://jaredforsyth.com/posts/hybrid-logical-clocks/
- Wayline, escopo em desenvolvimento indie solo — https://www.wayline.io/blog/scope-creep-solo-indie-game-development
- Relatos públicos de exploits de duplicação por save na nuvem (Dragon's Dogma 2, Elden Ring, Tiny Tina's)
- Bugnet, escolha de resolução em pixel art — https://bugnet.io/blog/choosing-a-pixel-art-resolution-for-your-game

**Documentos internos:**
- `docs/superpowers/specs/2026-08-27-coop-online-design.md` §8 (riscos aceitos)
- `.planning/PROJECT.md` (tensões conhecidas, dívida herdada)
- `docs/BACKLOG.md` (dívida técnica triada)

---
*Pesquisa de armadilhas para: co-op P2P + contas auto-hospedadas + ranking verificado por replay + offline + arte nova, feito por uma pessoa*
*Pesquisado: 2026-08-28*
