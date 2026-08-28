# Project Research Summary

**Project:** DungeonGuys2
**Domain:** survival roguelite co-op online (P2P host-autoritativo) + contas auto-hospedadas + ranking verificado por replay, sobre um jogo de canvas determinístico já publicado
**Researched:** 2026-08-28
**Confidence:** ALTA para as decisões; MÉDIA para os números que dependem da rede real dos jogadores

> **Convenção deste documento.** Toda afirmação numérica vem marcada com a sua procedência,
> porque as quatro pesquisas foram cuidadosas nisso e a distinção precisa sobreviver:
>
> - **[MEDIDO]** — obtido rodando o código *deste repositório* em 2026-08-28.
> - **[LIDO]** — contado ou verificado por leitura direta do código deste repositório.
> - **[EXTRAPOLADO]** — derivado de um número medido por uma fórmula do próprio código.
> - **[ESTIMADO]** — estimativa de engenharia, não medida.
> - **[TERCEIROS]** — número de fonte externa, com a confiança da fonte anotada.

---

## Executive Summary

**As quatro pesquisas convergem numa tese só: o Marco 0 já comprou a propriedade cara
(simulação pura, passo fixo, `step(world, inputs)` plural, `World` serializável por
construção), e o que resta é costura — mas três das costuras precisam ser decididas antes
de qualquer linha de rede, porque são formatos que entram no banco e no fio.** São elas:
o formato de identidade em três espaços (`accountId` / `playerId` / `peerId`), o
`RunConfig` por jogador como manifesto completo da run, e o `SIM_VERSION` derivado por
hash de conteúdo. Nenhuma delas custa mais que algumas horas hoje; todas custam migração
de dados armazenados depois.

**O achado mais consequente corrige os documentos do próprio projeto.** O
`docs/BACKLOG.md` classifica a divergência de `Math.sin/cos/atan2` como *"Bloqueia o
Marco 2"*. Architecture e Pitfalls, independentemente, argumentam que a classificação está
errada: netcode host-autoritativo com snapshot **corrige deriva de float a cada pacote**,
e um erro de predição de 1e-7 px é invisível. Determinismo bit-exato é requisito de
lockstep (que não estamos fazendo) e de **verificação por replay** (que estamos). Ou seja:
`sim/math.ts` **bloqueia o ranking, não o co-op** — o que muda a ordem dos marcos e libera
a sala para ser construída antes. Pitfalls ainda corrige o *modelo de ameaça*: o inimigo
não é V8 contra SpiderMonkey (o V8 hoje linka a própria matemática estaticamente, e na
prática Chrome × Firefox raramente divergem em `sin`/`cos`); o inimigo é o
**JavaScriptCore usando a libm da plataforma** — inevitável para um PWA no iPhone — e é o
**mesmo motor mudando entre versões** (`Math.tanh` mudou entre Node 4 e 6; `Math.pow(1/3,3)`
entre Node 10 e 12; o Chrome 148 passou `tanh` de fdlibm para a `std::tanh` do sistema).
A consequência prática: a saída "todos usam o mesmo motor", que o BACKLOG listava como
alternativa, **deixa de existir** quando um lado é Node numa VPS e o outro é Safari num
iPhone, e a verificação precisa continuar valendo depois de um `apt upgrade nodejs`.

**Um segundo achado foi medido, não estimado, e é uma restrição dura sobre a fase de
partida sincronizada.** Pitfalls rodou o `src/sim/` deste repositório: o `World`
serializado como o `hashWorld` dos testes já faz **13,8 KB com 4 jogadores na wave 1** e
**21,1 KB numa wave de chefe** [MEDIDO] — contra o limite seguro de **16 KiB por mensagem
de DataChannel** [TERCEIROS, ALTA]. A wave 16 extrapola para **38–60 KB por snapshot**, o
que a 20 Hz para 3 pares é **21,6 Mbit/s de upload no host** [EXTRAPOLADO da fórmula real
`count = 4 + wave*3` de `startNextWave`]. Nenhuma conexão doméstica assimétrica brasileira
sustenta isso. Isto não é uma nota de desempenho: **o formato do snapshot é uma decisão de
protocolo do Marco 1**, não uma otimização do Marco 2, e o caminho ingênuo
(`JSON.stringify(world)`) está morto antes de ser escrito.

**O terceiro achado dissolve uma tensão que o `PROJECT.md` lista como aberta.** Pitfalls
mostra que a verificação por replay **não prova o que o projeto assume**: o `RunConfig`
vem do cliente e carrega os multiplicadores de `forge`; um replay com `forge: {vigor: 99}`
é perfeitamente autoconsistente e o servidor o confirma, porque a matemática fecha. Pior:
como a simulação faz **10 minutos de jogo em ~50 ms** [MEDIDO], o jogador pode rodar 500
seeds em segundo plano, escolher a melhor arena e só então jogar "de verdade" — e o
replay continua honesto. A correção é que **o servidor emite a seed e reconstrói o
`RunConfig` a partir do estado da conta**. E essa correção resolve de graça a tensão
"Offline versus ranking": sem `runId` emitido pelo servidor, a run é não-pontuável **por
construção**, não por decreto. Uma decisão, duas tensões fechadas.

---

## O que as pesquisas corrigiram nos documentos existentes

| Documento | O que ele diz | Correção | Quem corrige |
|---|---|---|---|
| `docs/BACKLOG.md` | `Math.sin/cos/atan2` **"Bloqueia o Marco 2"** | Bloqueia o **ranking**, não o co-op. Snapshot corrige deriva de float todo pacote | Architecture §0, Pitfalls #2 |
| `docs/BACKLOG.md` | Alternativa: "decisão escrita de que os pares compartilham o mesmo motor" | Essa saída **não existe** com verificação no servidor: Node × Safari, e o mesmo motor muda entre versões | Pitfalls #2 |
| `PROJECT.md` dívida #1 | Modelo de ameaça: "host no Chrome, cliente no Firefox" | Desatualizado. A ameaça é JSC/iOS (libm da plataforma) e o calendário | Pitfalls #2 |
| `docs/BACKLOG.md` | SCC de 8 módulos torna a extração headless "tudo-ou-nada" | Verdade, e **benigno**: a unidade certa de extração é o `src/sim/` inteiro; o servidor precisa dos 15 de qualquer jeito | Stack, Architecture §4.1 |
| Spec de origem (Marco 4) | Minimapa, indicador de aliado e nome/HP sobre a cabeça são **acabamento** | São **table stakes** num mundo 2400×1600 com câmera por jogador — sem eles "co-op" é quatro jogos solo no mesmo servidor | Features (corroborado por Architecture §5.4, cujo desenho de interest management já depende disso) |
| Spec de origem | — (nunca cobriu) | **Buraco: morte definitiva.** O jogo hoje só tem "game over". Sem espectar + respawn na wave seguinte, o morto olha tela preta por 10 minutos e sai da sala. Exige estado `spectating` no `World` | Features |
| Spec de origem §8 | "Trapaça é trivial e não será combatida" | Aceitável quando o progresso morria no `localStorage`; **deixou de ser** quando o host concede progressão durável a 4 contas | Pitfalls #6, Architecture §6.3 |
| Spec de origem | Signaling "casa duas pontas e esquece" | Precisa continuar vivo durante a partida: WebRTC não reconecta sozinho, precisa de ICE restart | Pitfalls #12 |
| `PROJECT.md` constraints | "o `TILE` provavelmente muda quando a arte nova entrar" | `TILE` pode mudar como tamanho de tile **de desenho**; `world.play` precisa **deixar de derivar dele**. Unidades lógicas congeladas, ou todo replay guardado vira inverificável | Architecture §8.3, Pitfalls #10 |

---

## Key Findings

### Recommended Stack

Um processo Node, uma porta, um domínio. **Caddy 2.11.4** na 443 servindo o `dist/`
estático e fazendo proxy de `/api` e `/ws`; **Hono 4.13.5** + **`ws` 8.21.3** no mesmo
`http.Server` (o `ws` em modo `noServer: true`, autenticando no evento `upgrade` **antes**
de completar o handshake); **Better Auth 1.7.2** com sessão em cookie same-origin — que
resolve auth do HTTP **e** do WebSocket, porque o browser não permite definir cabeçalhos
num `new WebSocket(...)`, e isso sozinho elimina metade do apelo do JWT. **coturn 4.17.2**
na mesma VPS com credenciais efêmeras por HMAC. **systemd**, não PM2, não Docker.
Toolchain do cliente sobe para **Vite 7.3.6 / Vitest 4.1.11 / TS 6.0.3** (TS 7 está
bloqueado pelo peer do `typescript-eslint`).

**Core technologies:**
- **Node 24 LTS + Hono + `ws`** — API, signaling e worker de replay num processo só; o
  `@hono/node-server` expõe o `http.Server` real, que é o que permite anexar o `ws`.
- **coturn próprio** — não é "recomendado", é obrigatório. NAT simétrico e CGNAT quebram
  STUN por construção, e na topologia estrela de 4 jogadores basta um dos 3 links falhar
  para a sala não fechar. Habilitar IPv6 na VPS é a mitigação mais barata que existe.
- **Banco: SQLite via `better-sqlite3` 13.0.3 + Kysely** (recomendação do Stack) — **e aqui
  há divergência**: Architecture esboça o esquema em Postgres. Ver "Divergências".
- **`packages/sim` como workspace npm com `dependencies: {}` e `tsconfig` sem `"DOM"`** —
  transforma "o sim não toca o DOM" de regra de lint em **erro de tipo**. É o upgrade mais
  barato disponível para a propriedade em que o marco inteiro se apoia.
- **Playwright 1.62.1 com versão fixada** — para o teste que a suíte não tem e não pode
  ter: rodar N ticks e comparar `hashWorld` em Chromium, Firefox, WebKit **e** Node contra
  um hash-ouro versionado. O `determinism.test.ts` não pega essa classe por construção,
  porque compara dois mundos no mesmo processo.
- **`@stdlib/math-base-special-{sin,cos,atan2}` como devDependency e oráculo** — são ports
  em JS puro do FreeBSD msun e do Go; comparar o `sim/math.ts` vendorizado contra eles em
  10⁷ entradas prova o port. Nunca em runtime: quebraria o `dependencies: {}`.

**O que não usar:** `simple-peer` (sem manutenção desde jan/2023), socket.io (adiciona
runtime de cliente a um jogo com zero dependências), Lucia (descontinuado em mar/2025),
JWT em `localStorage` (não resolve o WebSocket e não tem revogação), `skipWaiting()` no
service worker (um deploy no meio da partida entrega versões diferentes da sim a dois
pares) e qualquer SaaS (contradiz a auto-hospedagem declarada).

### Expected Features

**Must have (table stakes) — a falta faz o jogo parecer quebrado:**
- Sala por código com lobby legível (quem entrou, classe, host, pronto)
- **Minimapa + indicador de aliado fora de tela + nome/HP sobre a cabeça** — *o spec de
  origem chamava isso de Marco 4; a pesquisa diz que é table stakes deste desenho de mundo*
- Caído + revive por aliado (já decidido)
- **Espectar + respawn no início da wave seguinte** — *buraco que o spec nunca cobriu*
- Loot instanciado (já decidido); intervalo compartilhado com "pronto" + timer de segurança
- Escala de dificuldade por número de jogadores — **quantidade, não vida**: inflar HP de
  trash mob quebra o combo de score, que é a base do ranking
- Indicador de conexão, reconexão e tratamento da saída do host
- HUD de objetivo de missão visível para os 4 (com câmera por jogador, o HUD é o único
  canal comum) + briefing antes de entrar
- Conta com login **e recuperação de acesso**; jogar offline e sincronizar sem perder nada

**Should have (diferenciadores):**
- **Ranking verificado por replay** — quase nenhum jogo pequeno faz; é a razão de a
  simulação ser pura
- **Modo missão com objetivos que mudam de onde vem o perigo** (defender ponto, matar
  elites marcados, limpeza cronometrada, coleta-e-entrega, sobreviver-e-extrair)
- **Seed semanal compartilhada** — a melhor razão valor/custo do projeto inteiro: é o
  quadro competitivo justo **e** o veículo do evento sazonal, num sistema só
- Identidade persistente dentro da sala privada; continuidade entre aparelhos

**Defer (v2+):** ranking co-op verificado (exige o log dos 4 com o tick de aplicação),
eventos nível 2–3, skins/arte nova (depende de repo externo), personagem por peças e
UI caprichada (polir telas que a arte nova vai mudar é trabalho jogado fora).

**Anti-features com veredito forte:** PvP e matchmaking (já fora de escopo), **chat de
texto ou voz** (um dev indie relata >200 mil denúncias/ano; usar ping contextual +
Discord), fogo amigo, troca de itens entre jogadores, battle pass / login diário,
**escolta de NPC** (os três jogos que tentaram têm o modo mais odiado do próprio jogo),
**objetivos com 4 pontos simultâneos** (obrigam separação num mundo de 3 telas com câmera
por jogador), objetivos-recado e **placar único misturando solo/dupla/quarteto com e sem
forge**.

### Architecture Approach

Topologia **estrela, sempre** — toda mensagem cruza exatamente um salto, e a outra ponta
desse salto é a autoridade. `Authority` e `Replica` são objetos separados ligados por um
`Transport` abstrato, e o `authority.ts` **não pode saber** três coisas: qual transporte,
que ele é "o host" (a palavra não existe no protocolo) e qual jogador é local — o input do
host passa pelo mesmo `InputTable` dos remotos, com atraso zero. É isso que torna a troca
por servidor dedicado uma **troca de construtor**, não uma reescrita. Single-player passa a
ser um caso de multiplayer sobre `transport/local.ts` (loopback), e `transport/lossy.ts`
(120 ms de RTT, 25 ms de jitter, 3% de perda) transforma qualquer sessão solo em teste de
reconciliação reprodutível sem segundo browser — **a ferramenta de teste de maior valor do
marco inteiro**.

**Major components:**
1. **`packages/sim`** — o `src/sim/` movido inteiro, `dependencies: {}`, sem `DOM` no
   `lib`, buildado como artefato ESM único cujo **hash de conteúdo é o `simVersion`**.
2. **`packages/protocol`** — tipos de fio, `PROTOCOL_VERSION` e **tabelas de enum
   congeladas, append-only para sempre** (elas também estão congeladas em cada replay
   guardado; inserir um inimigo no meio da lista invalida todo replay).
3. **`net/{authority,replica,inputTable,snapshot,transport}`** — a costura; `ui/` e
   `render/` **nunca** falam com `net/`, continuam lendo `World`.
4. **`sim/serialize.ts`** — o `hashWorld` de `tests/helpers.ts` promovido a `saveWorld` /
   `loadWorld` / `hashWorld`. Quatro consumidores forçam que viva em `sim/`: baseline do
   replica, entrada tardia, reconexão e checkpoint do verificador.
5. **`apps/server/{signaling,api,replay-worker}`** — signaling sem estado e sem banco;
   worker de replay em fila, **nunca no event loop principal**, com teto duro de ticks.
6. **`tools/assets/`** — validador do manifesto do repo de arte **neste** repositório,
   porque quem valida o contrato é o consumidor.

**A regra que resolve a fronteira conta × run, em uma frase:**
> `World` é tudo que uma seed mais um log de inputs reproduz. A conta é tudo que não.

E a política que fecha a tensão de trapaça: **uma run de co-op nunca escreve na conta de
outro jogador exceto através da verificação por replay.** O servidor credita os quatro a
partir da **sua própria** re-simulação, não da palavra do host.

### Critical Pitfalls

1. **O replay prova a run, mas não prova a *configuração* da run.** O `RunConfig` traz
   `forge` do cliente; um replay inflado é autoconsistente. **Prevenção:** o servidor emite
   `{runId, seed, simVersion, expiresAt}` e reconstrói o `RunConfig` a partir da conta.
   Efeito colateral que resolve outra tensão: run offline vira não-pontuável por
   construção. **Deixar explícito o que o replay não cobre:** ele derrota score forjado e
   stat editing; não derrota aimbot, porque inputs superhumanos são inputs válidos.

2. **O snapshot ingênuo não cabe na mensagem nem no upload do host.** 13,8 KB com 4
   jogadores na wave 1 [MEDIDO] contra 16 KiB de limite; 21,6 Mbit/s na wave 16
   [EXTRAPOLADO]. **Prevenção:** separar estático de dinâmico (dos 42 campos do inimigo, a
   maioria é constante durante a vida da entidade → mandar no spawn; por tick só
   `id,x,y,hp,flags` ≈ 12–16 bytes binários, redução de ~30×), **dois canais** (`fast`
   não-ordenado para snapshot/input, `reliable` para lobby/loja/fim de run — canal único
   ordenado causa head-of-line blocking, que é o sintoma "congela e depois teleporta") e
   **ler `bufferedAmount`** (o Chrome fecha o DataChannel em ~16 MiB).

3. **`Object.keys(world.players)` — determinismo que passa em todos os testes e quebra em
   produção.** `src/sim/step.ts` itera por ordem de inserção, que é a ordem de entrada na
   sala, que difere entre host, cliente e servidor de replay. Corolário venenoso: o
   `hashWorld` serializa `players` como objeto, então **dois mundos idênticos com ordens de
   inserção diferentes hasheiam diferente** — você caça uma dessincronização que não
   existe. **Três relatórios apontam isso**, com três remédios que são o mesmo remédio:
   slot numérico estável 0–3 atribuído quando a sala fecha, carregado na ordem de
   `RunConfig.players[]`, iterado por array, com o `hashWorld` ordenando chaves.

4. **Sem `SIM_VERSION` derivado + esquema de temporada, o ranking morre no primeiro
   patch.** O redesenho de classes já está agendado no BACKLOG e *vai* invalidar tudo.
   **Temporadas não são feature de fim de projeto — são a estratégia de versionamento do
   ranking**, e o esquema `(temporada, SIM_VERSION)` precisa existir antes do primeiro
   board público, mesmo que a primeira temporada dure para sempre.

5. **Save como blob único → last-write-wins → perda silenciosa de um lado e duplicação do
   outro.** `src/app/save.ts` é um JSON só, e `PUT /api/save` é o caminho óbvio e errado.
   Os exploits reais de Dragon's Dogma 2 / Elden Ring / Tiny Tina's são todos a mesma
   receita: jogar offline, sincronizar, restaurar o save anterior, repetir. **Prevenção:**
   nunca enviar estado, enviar **eventos com `eventId` deduplicados**; saldo de soul gold
   **derivado**, nunca absoluto; ordenar por contador do servidor, nunca por `Date.now()`;
   e `forge[key]` na **mesma transação** que debita o saldo.

6. **A arte nova é uma mudança de simulação, não uma troca de arquivo.** As hitboxes vivem
   em `src/sim/defs/enemies.ts` e derivam do tamanho dos sprites atuais (`skeleton` sprite
   16×16 → hitbox 26×26; `big_demon` 32×36 → 52×62; chefes com `scale: 3`) [LIDO]. Manter
   as hitboxes faz o jogo "parecer errado"; reescalá-las muda o balanceamento **e invalida
   todo replay e todo score gravado**. **Reescalar junto com a arte, de uma vez, enquanto
   ainda não existe board — e nunca depois.**

7. **Sete produtos num marco só.** O padrão de falha não é "não terminar"; é **terminar
   sete coisas pela metade que dependem umas das outras**, de modo que nenhuma pode ser
   testada de ponta a ponta e nenhuma pode ser cortada. **Nunca migrar infra e estrear
   rede na mesma semana.** Corte defensável se o tempo apertar, nesta ordem: eventos →
   missões → ranking → offline. **O que não se corta:** quatro amigos numa sala pelo código.

---

## Decidir cedo — a lista consolidada

**Este é o artefato mais útil desta síntese.** Os quatro relatórios produziram listas de
"barato agora, caro depois"; aqui elas estão fundidas e ordenadas por custo de reverter.

| # | Decisão | Custo agora | Custo se adiada | Origem |
|---|---|---|---|---|
| 1 | **Três espaços de identidade:** `accountId` (ULID durável do servidor, nunca entra no `World`) / `playerId` (`p0..p3`, slot atribuído pela autoridade, é o que o replay conhece) / `peerId` (handle do transporte, morre com a conexão) | Uma decisão escrita | Reescrita: o replay passa a precisar do banco de contas; a sala inventa um jogador que o login depois contradiz | Stack, Features, Architecture |
| 2 | **A seed é emitida pelo servidor** e o `RunConfig` é reconstruído a partir da conta, nunca aceito do cliente | Um endpoint | Board inteiro apagado; muda o formato de submissão **e** o esquema | Pitfalls #1 |
| 3 | **`RunConfig` por jogador** (`players[]` com `id`, `name`, `cls`, `forge`) + `contentVersion` + iteração por essa ordem canônica em `step.ts` | ~1 h + 3 linhas | Migração de JSON armazenado; dessincronização não reproduzível que parece bug de rede | Architecture §3.4 ("a mudança de maior alavancagem"), Pitfalls #7, Stack |
| 4 | **`SIM_VERSION` = hash de conteúdo do artefato buildado**, carimbado em toda run, no handshake da sala e na resposta do board. Nunca semver manual | Um script de build | Runs verificadas sob a física errada, ou rejeitadas sem motivo aparente. Você descobre quando 100% das verificações falham | Stack, Architecture (AP6), Pitfalls #3 |
| 5 | **Esquema `(temporada, SIM_VERSION)`** no banco antes do primeiro board público | Duas colunas | "Quebrei todos os replays" vira incidente em vez de evento planejado | Pitfalls #3 |
| 6 | **`sim/math.ts` antes do primeiro replay gravado e antes de congelar balanceamento** | 2–4 dias, ~550 LOC, ~26–30 call sites | Irreversível: trocar depois muda todos os resultados no último bit → muda desfechos → invalida replays. A alternativa (nunca trocar) mata o ranking | Stack (opção A), Architecture (A7), Pitfalls #2 |
| 7 | **Progressão como eventos idempotentes** (`eventId`, dedup no servidor); soul gold como **saldo derivado**; ordenação por contador do servidor; `forge` na mesma transação do gasto; **log de auditoria de toda concessão durável** | ~200 linhas | Migração com dados já divergentes em produção; sem log de auditoria não existe rollback — perda definitiva | Stack, Features §F, Architecture §7, Pitfalls #5 |
| 8 | **Formato do log de inputs:** quantizado **na captura** (antes de o `sim/` ver o valor) e gravado como a **tabela resolvida pela autoridade**, incluindo a política de preenchimento de buracos — não o tráfego bruto | Onde você chama `record()` | Quantizar só na serialização faz o replay divergir da run real, e a divergência aparece só no servidor, semanas depois. Log = tráfego bruto faz o ranking rejeitar runs legítimas de quem tem rede ruim | Pitfalls #4, Architecture §6.6 ("o detalhe mais importante de todo o desenho do ranking") |
| 9 | **Duas classes de canal** (`fast` não-confiável/não-ordenado; `reliable` ordenado) e o **codec binário quantizado** com camadas estático/lento/rápido | Decidido no Marco 1 | Remapear mensagens entre canais depois é refatoração ampla; e o formato de fio vira o layout de memória | Stack, Architecture §5, Pitfalls #4 |
| 10 | **Tabelas de enum congeladas, append-only para sempre** (`Enemy.type`, `anim`, `bossState`, `Obstacle.kind`, `AttackKind`…) | Um teste de snapshot | Todo replay guardado passa a decodificar entidades erradas | Architecture §5.3 |
| 11 | **`world.objectives` como campo do `World`, não `SimEvent`** | Um campo | Eventos são drenados e perdidos; conclusão de missão deixa de ser verificável por replay | Architecture §6.4 |
| 12 | **Protocolo sem a palavra "host"; topologia estrela; uma perna por mensagem** | Convenção de nomes | A troca de transporte vira reescrita — exatamente o que o projeto contratou não acontecer | Architecture §3.3 |
| 13 | **Unidades lógicas congeladas na spec de assets**; `world.play` deixa de derivar de `TILE`; hitboxes reescaladas junto com a arte, uma vez | Uma frase no spec | Retuning de toda constante, `PARIDADE.md` reaberto, **todo replay guardado inverificável** | Architecture §8.3, Pitfalls #10 |
| 14 | **Recusar merge de duas contas reais.** A conta local `kind:'local'` cunhada no primeiro boot é **reivindicada** por um login | Uma frase na UI | O caso que não tem resposta correta, resolvido tarde e caro | Architecture §7, Features §F |
| 15 | **Domínio único, `base: '/'`, e o SW deixando `/api/` passar direto** (+ `cache.put` só com `res.ok`, nome de cache derivado do build, precache derivado do manifesto) | Poucas linhas | Dado autenticado no Cache Storage, não limpo no logout; sync lendo saldo velho; página de erro cacheada para sempre | Stack, Pitfalls #8 |
| 16 | **`app/stepper.ts` separado do rAF** e **`transport/local.ts` + `lossy.ts`** | ~20 linhas + meio dia | Dois acumuladores que derivam diferente sob rede; netcode só testável com dois browsers e sorte | Architecture A1/C2 |
| 17 | **Regra de crédito de missão em co-op** (todos os presentes recebem) e **categorias do placar** (modo × tamanho de grupo × perfil) decididas antes da primeira cadeia e do primeiro board | Uma frase cada | A progressão dos amigos diverge e a correção é migração de dados; e a primeira pessoa a notar que o board mistura solo com quarteto deslegitima o board inteiro | Features §B e §D |
| 18 | **Validador de manifesto de assets no CI + código de sala de 6+ caracteres** com alfabeto sem ambiguidade | Meio dia + trivial | Produção de arte no formato errado descoberta na integração; estranho entrando na sala dos amigos | Architecture §8.3, Pitfalls #15 |

---

## Divergências entre as pesquisas, e o que seguir

| Assunto | Divergência | O que seguir e por quê |
|---|---|---|
| **Taxa de falha de NAT / necessidade de TURN** | Stack calcula **27–49% das salas de 4** a partir de `p=10–20%` por par [TERCEIROS/MÉDIA + derivação própria]; Pitfalls cita **~22% de sessões precisando de relay e ~12% de falha** [TERCEIROS/MÉDIA] e nota que os dados são majoritariamente de conferência A/V; Architecture registra que **"nenhuma fonte deu percentual confiável"** | **A decisão é unânime — TURN é obrigatório — mas o número não é conhecível hoje.** Não colocar percentual no roadmap. Instrumentar tipo de candidato ICE e desfecho de conexão desde a primeira sala real, e usar `iceTransportPolicy: 'relay'` atrás de flag de debug para exercitar o caminho relayed sem procurar um amigo atrás de CGNAT |
| **Banco de dados** | Stack: **SQLite/`better-sqlite3`** basta e vai bastar; Architecture esboça o esquema em **Postgres** | **Seguir Stack.** O volume é ínfimo e a API síncrona elimina pool. Mas isso força uma consequência: o worker de replay deve ser **`worker_threads` no mesmo processo**, não processo separado — porque a própria regra do Stack ("migre quando houver mais de um processo escrevendo") seria acionada pelo desenho do Architecture. Escrever o esquema portável (timestamps `INTEGER` epoch-ms, SQL puro no migrator do Kysely) mantém a porta aberta |
| **Versionamento do ranking** | Pitfalls apresenta **Factorio** (recusa replay de outra versão; fecha temporada) × **StarCraft** (mantém as regras antigas para reproduzir replays da era) e recomenda **Factorio para dev solo**; Architecture projeta o mecanismo **StarCraft** (`apps/server/sim-versions/<hash>.mjs` carregado por `await import()`) | **Decisão humana de produto (ver lista abaixo).** Tecnicamente o mecanismo do Architecture é barato e mantém as duas opções abertas; a recomendação de produto do Pitfalls é mais honesta e mais barata de operar. Construir o mecanismo, decidir a política antes do primeiro board |
| **Custo de CPU da verificação de replay** | Architecture: **10–30 s por run** de 15 min [ESTIMADO, "algumas centenas de µs por tick"]; Pitfalls: **décimos de segundo a alguns segundos** [MEDIDO: 1,4 µs/tick com carga leve; 20–50 µs/tick estimados em wave cheia] — **uma ordem de grandeza de diferença** | Orçar pelo pessimista (Architecture), medir na fase de ranking. Ambos concordam no que importa: **fila com worker separado, nunca inline no request HTTP**, com teto duro de ticks e de bytes — um log alegando 10 h de endless são 2,16 milhões de ticks, e alguém pode mandar dez em paralelo |
| **Armazenamento local da fila de runs** | Stack: `localStorage` basta (payloads de dezenas de KB); Architecture: **IndexedDB**, porque um log de 150 KB–1,3 MB não cabe com folga nos 5 MB síncronos | **Seguir Architecture.** A divergência vem de premissas de compressão diferentes; o caso co-op decide. O `localStorage` continua com o blob de configurações |
| **Contagem de call sites de trigonometria** | Stack e Pitfalls: **30** (13 `sin`, 13 `cos`, 4 `atan2`); Architecture: **26 em 6 arquivos** | Irrelevante para a decisão; recontar na execução. A ordem de grandeza é a mesma e é o que importa: a superfície é minúscula |
| **Ranking co-op** | Stack sugere board de co-op como "score do host com os demais creditados"; Features recomenda **v1 rankeia só solo**; Pitfalls exige que **cada par envie o próprio log** para o host não fabricar | **Seguir Features para o escopo (v1 solo) e Pitfalls para o mecanismo** quando o co-op entrar. São compatíveis: adiar o board de co-op não custa nada, e o desenho do log por par já nasce com o protocolo |

---

## Implications for Roadmap

**Como reconciliei as três ordens propostas.** Architecture propôs 8 fases (A–H) ancoradas
em dependências de código. Pitfalls propôs uma ordem pela regra *"primeiro o que é caro
mudar depois, depois o que é caro construir, por último o que é caro operar"*, com o aviso
explícito de **nunca migrar infra e estrear rede na mesma semana**. Features propôs uma
ordem enraizada no grafo de dependências de feature. **As três concordam mais do que
parece**, e os quatro pontos de conflito real estão resolvidos assim:

1. **Infra vira fase própria** (Pitfalls > Architecture). Architecture punha a migração
   para a VPS como item A8 dentro da fase de costuras. Pitfalls é explícito: exercitar
   TLS, deploy, service worker e backup **com o jogo single-player**, enquanto o único
   risco é um jogo que já funciona. Segui Pitfalls.
2. **O backend de contas vem depois da sala** (Features/Pitfalls > Architecture).
   Architecture punha a fase B (identidade e progressão) antes da C (transporte e sala) —
   mas o próprio Architecture concede em B4 que *"login pode vir depois da sala, e
   provavelmente deve"*. O `PROJECT.md` exige que o **formato** seja decidido antes do
   multiplayer, não a implementação, e a prioridade declarada pelo usuário é "sala
   primeiro". Segui Features/Pitfalls: o formato na fase 1, o backend na fase 6.
3. **A arte é integrada antes do ranking** (Pitfalls > Architecture). Architecture punha a
   integração de assets na fase H (última), como acabamento. Pitfalls demonstra que a arte
   muda hitboxes, que são `sim/`, que muda replays. Segui Pitfalls. **A spec de assets
   continua na fase 1**, onde os dois concordam, porque destrava outro agente em outra
   sessão e tem o maior lead time do marco.
4. **O codec de snapshot é decidido no Marco 1, não no 2** (Pitfalls > Architecture). O
   número medido (13,8 KB já hoje, contra 16 KiB de limite) transforma o formato de
   protocolo — que Architecture agendava para D2 — em restrição da fase de transporte.

### Fase 1: Decisões de formato e costuras (zero linha de rede)

**Rationale:** É a regra nº 1 do Pitfalls e a fase A do Architecture, e é onde 12 dos 18
itens da lista "decidir cedo" moram. Tudo aqui é barato hoje e é migração de dados depois.
O `sim/math.ts` entra aqui porque muda todos os hashes-ouro dos 244 testes e precisa ser
feito num branch quieto, longe da rede.
**Delivers:** spec técnica de assets publicada; `app/stepper.ts` extraído do rAF;
`localPlayerId` no lugar dos cinco `'p1'` de `main.ts` [LIDO]; `RunConfig` por jogador com
`contentVersion` e ordem canônica; workspaces `packages/sim` (sem `DOM`, `dependencies: {}`)
e `packages/protocol`, com `simVersion` por hash de conteúdo; `sim/serialize.ts` promovido
de `tests/helpers.ts`; corte da aresta `xp → run` (SCC 8 → 6); `sim/math.ts` folha +
quantização de `aim`/`move` na captura; replay de ouro cross-engine no CI; e — **escritos,
não implementados** — o esquema de identidade, a política de merge por campo e o esquema
`(temporada, SIM_VERSION)`.
**Addresses:** "Formato de identidade decidido antes do multiplayer" (Active do PROJECT.md).
**Avoids:** Pitfalls #1, #2, #3, #5, #7, #9.
**Nota de sequência dentro da fase:** o `sim/math.ts` vem **depois** do corte do SCC, porque
o risco real do ciclo de 8 módulos é que **qualquer `const` avaliada em tempo de módulo que
cruze o ciclo vira `undefined` em silêncio** — que é exatamente a forma de um `math.ts` com
tabela de lookup. E cobrir `updateBossPattern` (hoje sem teste nenhum, a maior superfície
descoberta de `sim/`) tem que acontecer **junto** com o `math.ts`, não depois, porque é uma
das áreas que a troca vai perturbar.

### Fase 2: Migração para a VPS com o jogo single-player

**Rationale:** *"Nunca migrar infra e estrear rede na mesma semana."* Todo o risco de
operação é exercitado enquanto o único software em jogo é o que já funciona.
**Delivers:** `base: '/'` no Vite e no registro do SW (dois lugares, com teste de
instalação limpa **e** de atualização a partir de instalação antiga); as correções do
`sw.js` (`/api/` passa direto; `cache.put` só com `res.ok`; nome de cache derivado do
build; precache derivado do manifesto; nada de `skipWaiting()` com partida aberta); Caddy
+ TLS com **monitoramento externo** (o Let's Encrypt encerrou o e-mail de expiração em
jun/2025 — ninguém vai avisar); systemd com `MemoryMax` por serviço; backup **fora da VPS**
com uma restauração testada e anotada; deploy reversível por symlink.
**Uses:** Caddy 2.11.4, systemd, Litestream.
**Avoids:** Pitfalls #8, #13.
**Decisão que cai aqui:** o espelho no GitHub Pages morre — é o que paga o cookie
same-origin.

### Fase 3: Transporte, sala e protocolo

**Rationale:** É o Core Value e a prioridade declarada. E é onde o **formato** do snapshot
e do log tem que ser decidido, mesmo que o encoder só seja exercido na fase 4.
**Delivers:** `packages/protocol` com `PROTOCOL_VERSION`, tabelas de enum congeladas e as
duas classes de canal; `Transport` + `local.ts` + `lossy.ts`; signaling WebSocket
(`noServer: true`, sessão validada no `upgrade`) que **continua vivo durante a partida**;
`transport/rtc.ts` com perfect negotiation (o host é sempre o impolido); lobby; coturn com
credenciais efêmeras por HMAC e `denied-peer-ip`; slot numérico estável atribuído quando a
sala fecha; código de sala de 6+ caracteres; **instrumentação de ICE** que substitui os
números chutados de TURN por medição.
**Implements:** `net/transport.ts`, `net/protocol.ts`, `apps/server/signaling`.
**Avoids:** Pitfalls #4 (formato), #7, #11, #16.

### Fase 4: Partida sincronizada

**Rationale:** Depende de tudo acima. É a fase onde a restrição medida morde.
**Delivers:** `authority.ts` + `replica.ts` + `inputTable.ts`; codec binário quantizado com
as três camadas (estático derivado da seed — e **`generateArena` não usa trigonometria
nenhuma** [LIDO], logo obstáculos e armadilhas já são reproduzíveis entre motores hoje /
lento dirigido por evento no canal confiável / rápido em delta contra baseline confirmada);
predição, reconciliação e supressão de eventos re-simulados; **HUD de debug com bytes/s,
RTT e magnitude do erro de reconciliação**; backpressure por `bufferedAmount` com degradação
automática (20 → 10 Hz) e aviso na UI.
**Restrição dura, não negociável:** ≤ 16 KiB por mensagem; alvo de ~1,5 Mbit/s de upload no
host na wave 12 com 4 jogadores. Testar com traffic shaping (150 ms, 2% de perda), **nunca
em `localhost`**.
**Avoids:** Pitfalls #4; anti-padrões AP3 (snapshot = `JSON.stringify`) e AP4 (interest
management antes de medir — neste mundo o viewport desktop já é **54% da arena** e as
quatro câmeras se sobrepõem justamente quando o tráfego é maior; quantizar ganha 5–10×,
relevância ganha 20–40% no melhor caso).

### Fase 5: Regras de co-op

**Rationale:** Vários itens aqui **acrescentam campo a entidade em rede**, o que é bump de
versão de protocolo — vale agrupar com a fase 4 ou aceitar o bump conscientemente.
**Delivers:** caído/revive com sangramento que escala ao contrário (menos aliados vivos →
timer maior); **espectar + respawn na wave seguinte** (estado `spectating` no `World` — o
buraco do spec); loot instanciado (`Coin.owner`, que de quebra divide o payload de moedas
por 4); escala por `config.players.length` — **quantidade `×(1 + 0,75·(N−1))`, HP só de
chefe `×(1 + 0,6·(N−1))`, dano nunca** [TERCEIROS/MÉDIA — ponto de partida para tuning, não
medido], reescalando **só na fronteira de wave**; intervalo compartilhado com timer de
segurança; **minimapa + nome/HP sobre a cabeça + indicador de aliado fora de tela**; fim de
run coletivo com resultado por jogador; indicador de conexão; ping contextual no lugar de
chat.
**Addresses:** o bloco inteiro de table stakes do FEATURES.md, incluindo os dois itens que
contradizem o spec de origem.

### Fase 6: Contas, progressão na nuvem e offline

**Rationale:** O **formato** foi decidido na fase 1; a implementação vem depois de a sala
valer a pena. É a ordem que Features e Pitfalls defendem e que o próprio Architecture
concede em B4.
**Delivers:** Better Auth + SQLite + Kysely; sessão em cookie same-origin (viável porque é
um origin só); Argon2id com **limite de taxa obrigatório** (19 MiB por verificação × 100
logins concorrentes ≈ 1,9 GB — é vetor de negação de serviço numa VPS pequena); recuperação
de acesso que não seja "me manda mensagem"; `summarizeRun` puro extraído de
`app/forge.ts:finishRun` (que hoje faz três coisas de uma vez [LIDO]); outbox IndexedDB com
`UNIQUE(account, device, seq)`; saldo derivado; **checkpoint de progressão durável por wave
concluída** (muda o risco de "perdi 40 minutos" para "perdi a última wave"); log de
auditoria; claim da conta local.
**Nota que precisa estar escrita no roadmap:** a regra `dependencies: {}` é do **jogo
publicado**, não da API. Se ela vazar para o servidor, o resultado previsível é
criptografia artesanal. O `node:crypto` do Node ≥24.19 já tem `argon2Sync` embutido — 52 ms
com os parâmetros OWASP nesta máquina [MEDIDO].

### Fase 7: Integração da arte nova

**Rationale:** Antes do ranking, porque muda a simulação. Se ficar depois, a integração
fecha uma temporada.
**Delivers:** `render/sprites.ts` deixa de ter coordenadas escritas à mão e passa a ser
gerado a partir do (ou validado contra o) manifesto; validador de manifesto no CI **deste**
repo; **um** personagem e **um** tile integrados de ponta a ponta antes da produção em
massa; hitboxes reescaladas de uma vez; orçamento de bytes vigiado (o piso pré-renderizado
já é ~15 MB de bitmap a 2400×1600, e `cache.addAll` rejeita a instalação inteira se **uma**
URL der 404).

### Fase 8: Modo missão

**Rationale:** Não depende de conta nem de co-op — pode ser construído e validado em solo.
Mas a regra de crédito co-op tem que estar decidida (fase 1).
**Delivers:** `sim/objectives.ts` com `world.objectives` como **campo**; 4–5 tipos de
objetivo (defender ponto — o melhor de todos, porque puxa os 4 para o mesmo lugar e resolve
o problema da câmera por jogador de graça; matar elites marcados; limpeza cronometrada;
coleta-e-entrega; sobreviver-e-extrair como *encerramento*); HUD compartilhado; briefing;
cadeia em DAG com pré-requisitos em "OU" e ≥2 nós sempre abertos.
**Critério de aceitação de qualquer objetivo:** muda **de onde vem o perigo**, não
acrescenta tarefa; é avaliável dentro de `sim/`, puro; tem leitura no HUD dos 4; e a falha
nunca vem do erro isolado de um jogador.

### Fase 9: Ranking verificado (solo)

**Rationale:** Precisa de tudo: `sim/math.ts` (fase 1), `simVersion` (fase 1), `loadWorld`
(fase 1), captura do log na autoridade (fase 4), conta (fase 6) e arte integrada (fase 7).
**Delivers:** seed e `runId` emitidos pelo servidor; `RunConfig` reconstruído a partir da
conta; **perfil normalizado** (forge desligado) nas runs pontuáveis — o que também reduz
drasticamente a superfície da verificação, porque o servidor não precisa conhecer o estado
da conta para re-rodar; `RunSubmission` idempotente por `runId`; worker de replay em fila
com teto de ticks, de bytes e de tempo de parede; cross-check de relógio de parede; teto
explícito para endless; categorias modo × tamanho de grupo × perfil; e **rótulo honesto do
que é e do que não é verificado**.

### Fase 10: Temporadas, eventos e resiliência

**Rationale:** A seed semanal **é** o quadro justo **e** é o evento — duas features Active
do PROJECT.md por um sistema só. A resiliência fecha o que a fase 3 deixou declarado.
**Delivers:** seed semanal com janela vinda do servidor em UTC (nunca do relógio do
cliente); selo/título permanente no perfil (recompensa é registro, não poder — cosmético
compromete o pipeline de arte com um calendário); eventos como **configuração**, não código;
reconexão via baseline `loadWorld`; política de queda do host; tratamento de iOS/Safari (não
deixar iPhone hospedar quando houver alternativa; `visibilitychange` avisando os outros;
ICE restart); UI caprichada por último, depois da arte.

### Phase Ordering Rationale

- **A ordem é ditada por formato, não por feature.** As fases 1 e 2 não entregam nada que o
  jogador veja, e é exatamente por isso que existem: 12 dos 18 itens de "decidir cedo"
  moram na fase 1, e a fase 2 exercita a operação com risco zero.
- **A sala vem antes da conta** porque o `PROJECT.md` exige o *formato* antes do
  multiplayer, não a *implementação* — e a prioridade declarada é "sala primeiro".
- **A arte vem antes do ranking** porque ela é uma mudança de `sim/`, e ranking mais
  mudança de `sim/` é board apagado.
- **Cada fase termina com o jogo jogável.** É a prevenção estrutural contra a armadilha #9:
  o padrão de falha não é não terminar, é terminar sete coisas pela metade que dependem
  umas das outras. Nunca 3 frentes abertas.
- **Corte defensável se o tempo apertar:** fase 10 → fase 8 → fase 9 → a parte offline da
  fase 6. O que não se corta: fases 3–5.

### Research Flags

**Precisam de `/gsd:plan-phase --research-phase` durante o planejamento:**
- **Fase 4 (partida sincronizada)** — os números de banda são [ESTIMADO]/[EXTRAPOLADO], não
  medidos no fio; a identidade de entidade nos deltas (`Bullet`, `Coin` e `Potion` **não têm
  `id`** [LIDO]) e a política de backpressure precisam de desenho; e a escolha entre
  polinômio e tabela de lookup em `sim/math.ts` merece uma medição rápida antes.
- **Fase 7 (arte)** — depende de um artefato que ainda não existe (o manifesto do outro
  agente) e de um reescalonamento de hitbox sem precedente no repositório.
- **Fase 9 (ranking)** — a divergência de uma ordem de grandeza no custo de CPU da
  verificação, o teto de endless, o cross-check do log por par em co-op e a escolha
  Factorio × StarCraft precisam ser resolvidos com desenho, não com leitura.

**Padrões estabelecidos, pesquisa dispensável:**
- **Fase 2 (infra)** — o STACK.md já entrega o Caddyfile e a unit systemd prontos.
- **Fase 3 (transporte)** — perfect negotiation, coturn com `use-auth-secret` e signaling
  com `noServer: true` estão documentados, e o STACK.md tem o código.
- **Fase 5 (regras de co-op)** — o FEATURES.md já entrega os números de partida para tuning
  e a análise comparativa de cinco jogos do gênero.
- **Fase 6 (contas)** — Better Auth + SQLite tem código pronto no STACK.md.
- **Fase 8 (missões)** — o FEATURES.md já entrega o catálogo de objetivos com veredito para
  4 jogadores e os casos de fracasso documentados a evitar.

---

## Decisões humanas de produto ainda em aberto

**Nenhuma destas é técnica.** As quatro pesquisas as levantaram e nenhuma pode ser
resolvida por mais pesquisa — precisam de uma escolha do dono do produto, e todas devem ser
respondidas **antes** da fase que as consome.

| # | Pergunta | Opções levantadas | Fase que a consome |
|---|---|---|---|
| 1 | **Ranking solo × co-op** | (a) v1 rankeia só solo, co-op depois [Features]; (b) board de co-op como score do host com os demais creditados [Stack]; (c) boards separados por tamanho de grupo desde o dia 1 [Pitfalls]. Todos concordam que **misturar é o que deslegitima o board** | Fase 9 (categorias decididas na 1) |
| 2 | **Teto do forge em runs de evento e rankeadas** | Perfil normalizado (forge desligado) torna o board comparável, permite o jogador novo competir no dia 1 e reduz a superfície de verificação — mas apaga a meta-progressão que já existe e que o jogador pode valorizar. Alternativa: teto no forge em vez de desligamento | Fase 9 (decidir na 1) |
| 3 | **Quem pode entrar numa missão destravada** | A cadeia do **host** define o que a sala pode entrar; quem não destravou entra como convidado; **todos os presentes na conclusão recebem crédito**. Isso permite explicitamente "carregar" um amigo — e em co-op privado, carregar é feature. Precisa ser aceito ou rejeitado por escrito | Fase 8 (decidir na 1) |
| 4 | **Estratégia de versionamento do ranking** | **Factorio:** mudança de `SIM_VERSION` fecha o board e abre temporada nova — honesto e muito mais barato para dev solo [Pitfalls]. **StarCraft:** guardar bundles históricos do sim e re-rodar cada run sob a versão dela [Architecture]. Não há terceira | Fase 9 (esquema na 1) |
| 5 | **`TILE` e `WORLD` mudam com a arte nova?** | O `PROJECT.md` diz que `TILE` "provavelmente muda". A resposta recomendada: `TILE` muda como tamanho de tile **de desenho**, `world.play` passa a usar uma `PLAY_MARGIN` própria, e `WORLD` **não** muda (o piso pré-renderizado já é ~15 MB e cresce com o quadrado). Precisa estar pinado na spec **antes** da produção | Fase 1 (spec de assets) |
| 6 | **Teto de duração para endless no ranking** | Endless é ilimitado por construção; ou há teto explícito comunicado na UI, ou a verificação é amostrada por checkpoint | Fase 9 |
| 7 | **Queda do host** | (a) creditar a run parcial submetendo o log até o ponto da queda [Architecture, recomendação provisória]; (b) checkpoint de progressão durável por wave concluída [Pitfalls]; (c) migração de host — todos concordam que é caro e que amigos toleram a limitação se ela for declarada | Fases 6 e 10 |
| 8 | **O espelho no GitHub Pages morre?** | Uma linha de código, mas decide se existem um ou dois alvos de deploy pelo resto do projeto. Recomendação unânime: morre | Fase 2 |

---

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | **ALTA** para versões e infra (registro npm consultado diretamente, releases oficiais) e para o veredito de determinismo (texto literal do ECMA-262); **MÉDIA** para os números de TURN | O único ponto fraco é o que o próprio documento marca: as faixas de falha de NAT vêm de fontes de conferência A/V |
| Features | **MÉDIA-ALTA** | Núcleo sustentado por wikis oficiais e por **um relato técnico primário** (Open Hexagon, ranking verificado por replay implementado e publicado). A parte de balanceamento vem majoritariamente de discussão de comunidade e está marcada MÉDIA/BAIXA no lugar em que aparece |
| Architecture | **ALTA** onde ancorada no código deste repositório e em precedentes documentados; **MÉDIA** para estimativas de banda e CPU | As estimativas de banda foram parcialmente **superadas** pelas medições do Pitfalls; a estimativa de CPU de verificação diverge do Pitfalls em uma ordem de grandeza |
| Pitfalls | **ALTA** para o que foi medido neste repositório e verificado em fonte oficial; **MÉDIA** para itens de prática de mercado | É o único documento com números medidos. Os itens MÉDIA estão marcados individualmente (≈22% de TURN, >70% de escopo em indies) |

**Overall confidence:** **ALTA para as decisões, MÉDIA para os números que dependem da rede
real dos jogadores.** As quatro pesquisas convergem em todas as decisões estruturais e
divergem apenas em magnitudes que só a instrumentação resolve.

### Gaps to Address

- **Taxa real de falha de NAT/TURN.** Stack calcula 27–49% de salas de 4 afetadas, Pitfalls
  cita ~22%, Architecture registra que nenhuma fonte deu percentual confiável. → **Não
  colocar número no roadmap.** Instrumentar tipo de candidato ICE e desfecho na fase 3.
- **Banda real no fio depois de quantizar e delta.** Todas as estimativas pós-otimização
  são [ESTIMADO]. → O HUD de debug da fase 4 é o item que converte chute em número; toda
  decisão de otimização anterior a ele é chute.
- **Custo de CPU da verificação de replay.** Divergência de ~10× entre os relatórios. →
  Orçar pelo pessimista, medir com bench antes de dimensionar a fila.
- **SQLite × Postgres.** Resolvido em favor do SQLite, mas com a consequência de que o
  worker de replay precisa ser `worker_threads`, não processo separado. → Reavaliar se o
  ranking abrir ao público.
- **Números de tuning da escala co-op** (`0,75` e `0,6`). [TERCEIROS/MÉDIA], ponto de
  partida, não verdade medida. → Validar jogando na fase 5, com o `0,75` como o botão a
  girar (nunca o preço da loja).
- **`updateBossPattern` sem teste nenhum** — a maior superfície descoberta de `sim/`, e uma
  das que o `sim/math.ts` vai perturbar. → Cobrir **junto** com a fase 1, não depois.
- **Polinômio × tabela de lookup em `sim/math.ts`.** As duas satisfazem a propriedade; a
  escolha é de auditabilidade e custo por chamada, com alguns call sites em laços quentes de
  `enemies.ts`. → Medição rápida na fase 1. **Se for tabela, ela precisa ser literal no
  fonte ou construída com aritmética exata, e o módulo precisa continuar folha** — uma
  `const SIN_TABLE = buildTable()` cruzando o SCC vira `undefined` em silêncio.
- **Contagem de call sites de trigonometria: 26 ou 30.** Recontar na execução.

---

## Sources

Detalhamento completo em cada documento (`STACK.md`, `FEATURES.md`, `ARCHITECTURE.md`,
`PITFALLS.md`). Agregado por confiança:

### Primary (ALTA)

- **Código deste repositório** (fonte primária) — `src/sim/**` (2.974 LOC, 15 módulos, SCC
  de 8, 88 imports sem extensão, contagem de `Math.*`), `src/sim/defs/enemies.ts`
  (acoplamento hitbox↔sprite), `src/sim/step.ts` (`Object.keys(world.players)`),
  `src/app/{loop,input,forge,save}.ts`, `src/main.ts` (cinco `'p1'`), `tests/helpers.ts`
  (o `hashWorld` já é o codec de snapshot), `public/sw.js`, `vite.config.ts`,
  `eslint.config.js`
- **Medições executadas neste repositório em 2026-08-28** (Pitfalls) — tamanho de snapshot
  (13,8 KB / 21,1 KB), custo por entidade (725 B por inimigo, 1.261 B por jogador), custo de
  `step()` (~1,4 µs/tick), 10 min de jogo em ~50 ms, `crypto.argon2Sync` (52 ms) e
  `crypto.scryptSync` (falha sem `maxmem` explícito)
- **ECMA-262** (tc39.es) — texto literal sobre o objeto `Math` ("recommended but not
  specified") e a garantia IEEE-754 exata para `+ − × ÷ sqrt`
- **Vittorio Romeo, "Implementing secure leaderboards"** (Open Hexagon) — precedente
  técnico primário de ranking verificado por replay: o que se envia, PRNG portável, passo
  fixo, desync por `-ffast-math`, cross-check de relógio de parede
- **Registro npm consultado diretamente**, releases de coturn/Caddy, docs do Better Auth
  (Context7), MDN (`bufferedAmount`, `createDataChannel`), Lennart Grahl (limite de 16 KiB
  do DataChannel), OWASP Password Storage, anúncio do fim das notificações do Let's Encrypt
- **Gabriel Gambetta** (predição e reconciliação) e **SnapNet** (snapshot + delta contra
  baseline) — referências canônicas do padrão
- **Wikis oficiais** — Warframe (catálogo de objetivos), Risk of Rain 2 (Prismatic Trials,
  escala por jogador), Brotato (modelo de personagem como lente sobre pool comum)

### Secondary (MÉDIA)

- **Motores JavaScript** — Mozilla dev-platform (fdlibm atrás de pref), Scrapfly (V8
  estático × `Math.tanh` no Chrome 148, divergência de até 2 ULP), macwright ("Math keeps
  changing")
- **Números de TURN** — bloggeek.me, levantamentos Kranky Geek, webrtcHacks "The Big Churn".
  **A composição `1−(1−p)³` é derivação própria do STACK.md, não dado de terceiro**
- **Contexto brasileiro** — CGNAT residencial (Tecnoblog, NIC.br), adoção IPv6 acima de 50%
  desde jun/2024 (Internet Society Pulse / APNIC), planos Hostinger VPS
- **Fóruns oficiais do Factorio** (replays travados por versão), Slay the Spire (fórmula de
  score num inteiro; relato de trapaça no topo do Daily Climb), Cogmind (categorias de board)
- **Gunfire Reborn** (300/500/700% e a reclamação de bullet sponge), **Killing Floor 2
  Objective Mode**, **Warframe Defection**, **DRG Escort Duty** — os casos de fracasso
- **Políticas de conflito de save em nuvem** (PlayFab, Google Play Games)
- **Ônus de moderação de chat para times pequenos** (>200 mil denúncias/ano)

### Tertiary (BAIXA — precisa validação)

- Consenso de comunidade sobre escopo em indies (">70% dos projetos atrasados") — o número
  é anedótico; o padrão é uniforme
- Alien Swarm / GTFO como extremos de escala co-op
- Relatos públicos de exploits de duplicação por save na nuvem (Dragon's Dogma 2, Elden
  Ring, Tiny Tina's) — a receita é consistente entre os três, os detalhes não
- Modelos de cadência de conteúdo para times pequenos (liveops)

### Documentos internos consultados

`docs/superpowers/specs/2026-08-27-coop-online-design.md` (spec de origem, §8 riscos
aceitos), `docs/BACKLOG.md` (dívida triada — **corrigido em dois pontos por esta pesquisa**),
`docs/PARIDADE.md`, `docs/DECISOES-MARCO0.md`, `.planning/PROJECT.md` (tensões conhecidas —
**duas das três resolvidas por esta pesquisa**).

---
*Research completed: 2026-08-28*
*Ready for roadmap: yes*
