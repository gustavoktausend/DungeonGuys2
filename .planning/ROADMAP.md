# Roadmap: DungeonGuys2

> Rótulos de estrutura (`Goal`, `Requirements`, `Success Criteria`) ficam em inglês porque
> são lidos por ferramenta. O conteúdo é em português, como o resto dos documentos.

## Overview

O Marco 0 entregou um jogo single-player completo sobre uma simulação pura e determinística.
O que falta não é jogo — é costura. As duas primeiras fases não entregam nada que o jogador
veja, e é exatamente por isso que existem: a fase 1 congela os formatos que entram no banco,
no fio e no replay enquanto mudá-los ainda custa horas em vez de migração de dados, e a fase 2
exercita TLS, deploy, service worker e backup com o único software que já funciona. Depois
disso o projeto vai atrás do Core Value em três passos — sala, partida sincronizada e regras
de co-op — e só então acrescenta o que se apoia nele: conta na nuvem, arte nova, missões e um
placar em que estar no topo significa ter jogado.

## Phases

**Phase Numbering:**

- Integer phases (1, 2, 3): trabalho planejado do marco
- Decimal phases (2.1, 2.2): inserções urgentes (marcadas com INSERTED)

- [x] **Phase 1: Formato e costuras** - Congela identidade, `RunConfig`, `SIM_VERSION`, log de inputs, serialização e trigonometria — zero linha de rede (completed 2026-08-31)
- [ ] **Phase 2: Migração para a VPS** - Domínio único com TLS, PWA e backup exercitados com o jogo single-player
- [ ] **Phase 3: Sala, transporte e protocolo** - Quatro amigos se encontram pelo código; o formato do fio e o codec do snapshot ficam decididos aqui
- [ ] **Phase 4: Partida sincronizada** - Dois a quatro jogadores lutam a mesma run no mesmo mundo, com resposta imediata para cada um
- [ ] **Phase 5: Regras de co-op e resiliência de sessão** - Achar o aliado, levantá-lo, voltar depois de morrer e voltar depois de cair a conexão
- [ ] **Phase 6: Contas, progressão na nuvem e offline** - O progresso segue o jogador entre aparelhos sem perder nem duplicar nada
- [ ] **Phase 7: Arte nova integrada** - Arte e hitboxes trocadas de uma vez só, enquanto ainda não existe placar para invalidar
- [ ] **Phase 8: Modo missão** - Objetivos que mudam de onde vem o perigo, numa cadeia que destrava
- [ ] **Phase 9: Ranking verificado e temporadas** - O servidor emite a seed, reconstrói a configuração e re-roda a run antes de aceitar o score

## Phase Details

### Phase 1: Formato e costuras

**Goal**: Congelar os formatos que entram no banco, no fio e em todo replay guardado — os três espaços de identidade, o `RunConfig` por jogador, o `SIM_VERSION` por hash de conteúdo, o log de inputs quantizado na captura, o `World` serializável e a trigonometria própria — enquanto mudá-los ainda custa horas. Esta fase não entrega nada de novo para jogar: ela existe para que essas decisões não virem migração de dados depois, e é o que protege as oito fases seguintes.
**Mode:** mvp
**Depends on**: Nada (primeira fase; o Marco 0 já está em `main`)
**Requirements**: FORM-01, FORM-02, FORM-03, FORM-04, FORM-05, FORM-06, FORM-07, FORM-08, FORM-09, FORM-10, FORM-11, FORM-12
**Success Criteria** (what must be TRUE):

  1. A mesma seed produz `hashWorld` bit-idêntico em Chromium, Firefox, WebKit **e** Node, comparado contra um hash-ouro versionado no CI — e o teste falha, com o motor divergente nomeado, se qualquer um sair da linha.
  2. Uma run gravada hoje (seed + `RunConfig` + log de inputs) é recarregada depois de um build novo e re-executada até o mesmo `hashWorld`; quando o `SIM_VERSION` muda, a recusa é explícita e diz por quê, em vez de produzir um resultado errado em silêncio.
  3. `saveWorld`/`loadWorld` fazem round-trip do `World` inteiro — RNG e objetivos de missão incluídos — sem perda, verificado por hash antes e depois.
  4. Embaralhar a ordem de entrada dos jogadores não muda o resultado: `step()` itera pela ordem canônica do `RunConfig` e o hash é o mesmo.
  5. A spec técnica de assets está publicada com as unidades lógicas congeladas, e o validador de manifesto no CI recusa um manifesto de exemplo fora do formato.

**Plans**: 14 plans

Plans:
**Wave 1**

- [x] 01-01-PLAN.md — Toolchain alvo, configs de teste e o primeiro CI de teste do repositório
- [x] 01-02-PLAN.md — Os 12 ADRs de `docs/adr/`: identidade, merge, temporada, placar e replay
- [x] 01-03-PLAN.md — Ledger append-only de soul gold e o ULID escrito à mão

**Wave 2** *(blocked on Wave 1 completion)*

- [x] 01-04-PLAN.md — Passo fixo (`app/stepper.ts`), o ouro versionado e o portão cross-engine que falha

**Wave 3** *(blocked on Wave 2 completion)*

- [x] 01-05-PLAN.md — Extração de `packages/sim` com npm workspaces e as três guardas de pureza

**Wave 4** *(blocked on Wave 3 completion)*

- [x] 01-06-PLAN.md — `packages/protocol`: `PROTOCOL_VERSION`, enums congelados e vocabulário sem "host"
- [x] 01-07-PLAN.md — `SIM_VERSION` por hash de bundle, em build de duas etapas
- [x] 01-08-PLAN.md — Corte do ciclo de `sim/` (SCC 8 → 5+2) e cobertura direta de `updateBossPattern`

**Wave 5** *(blocked on Wave 4 completion)*

- [x] 01-09-PLAN.md — `sim/math.ts`: port fdlibm com domínio restrito, contra o oráculo `@stdlib`
- [x] 01-10-PLAN.md — Codec do log de inputs, quantização na captura e o envelope de run
- [x] 01-11-PLAN.md — Spec técnica de assets e o validador de manifesto no CI

**Wave 6** *(blocked on Wave 5 completion)*

- [x] 01-12-PLAN.md — Troca dos 27 call sites, limpeza de `sim/` e o re-baseline único

**Wave 7** *(blocked on Wave 6 completion)*

- [x] 01-13-PLAN.md — `RunConfig.players[]`, ordem canônica em `step()` e os três espaços de identidade

**Wave 8** *(blocked on Wave 7 completion)*

- [x] 01-14-PLAN.md — `serialize.ts`, `world.objectives` e o round-trip sem perda

**Sequência interna que não pode ser trocada**: o corte do ciclo de `sim/` vem **antes** do
`sim/math.ts`, porque uma `const` avaliada em tempo de módulo cruzando o ciclo vira `undefined`
em silêncio — que é exatamente a forma de um `math.ts` com tabela de lookup. A cobertura de
`updateBossPattern` (hoje sem teste nenhum, a maior superfície descoberta de `sim/`) acontece
**junto** com o `math.ts`, não depois.

**Correção de 2026-08-31 (`01-RESEARCH.md`, Tarjan sobre o grafo real):** o corte não é de uma
aresta e o resultado não é 6. Cortar só `xp → run` deixa o componente com os mesmos 8 módulos,
porque `xp → shop → run → enemies → xp` fecha sozinho: é preciso remover as **duas** saídas de
`closeLevelUp`, e o resultado é **5 + 2**. `run ↔ shop` é ciclo genuíno e independente, **não**
cai junto (ao contrário do que `docs/BACKLOG.md` afirmava), e fica registrado como dívida. A
contagem de call sites de trigonometria é **27** (12 `sin`, 12 `cos`, 3 `atan2`) em 7 arquivos.

**Escritos aqui, implementados depois** (decisão barata agora, migração cara depois): o esquema
de identidade em três espaços, a política de merge por campo do save, o esquema
`(temporada, SIM_VERSION)` e as categorias do placar. Nenhum deles vira código nesta fase.

**FORM-09 fica aqui de propósito** mesmo com a integração de arte só na fase 7: a spec destrava
outro agente, em outro repositório, e é o item de maior lead time do marco.

### Phase 2: Migração para a VPS

**Goal**: Exercitar TLS, deploy, service worker e backup enquanto a única coisa em risco é um jogo single-player que já funciona — a regra é nunca migrar infra e estrear rede na mesma semana.
**Mode:** mvp
**Depends on**: Phase 1
**Requirements**: INFRA-01, INFRA-02, INFRA-03, INFRA-04
**Success Criteria** (what must be TRUE):

  1. O jogo abre no domínio próprio sob HTTPS e existe **um** alvo de deploy: o espelho no GitHub Pages deixou de receber build.
  2. Uma instalação limpa do PWA **e** uma atualização a partir de uma instalação antiga funcionam, e o jogo abre sem rede depois de instalado da VPS.
  3. Uma requisição a `/api/` nunca é servida do cache, uma resposta não-`ok` nunca é gravada nele, e um deploy novo não deixa o cache velho para trás.
  4. O deploy é um comando e é reversível; o backup do banco foi **restaurado** num ambiente limpo e o resultado da restauração está anotado.

**Plans**: 12 plans

Plans:
**Wave 1**

- [ ] 02-01-PLAN.md — Repositório publicado sem levar o Pages junto: `deploy.yml` apagado, INFRA-01 virando teste, e o `ci.yml` verde num runner pela primeira vez
- [x] 02-02-PLAN.md — `base: '/'`, caminhos absolutos de raiz e as duas fontes trazidas para a própria origem
- [x] 02-03-PLAN.md — `ops/`: Caddyfile, release por sha com symlink atômico, reversão sem rede, e o runbook

**Wave 2** *(blocked on Wave 1 completion)*

- [ ] 02-04-PLAN.md — A caixa e o bucket confirmados, a chave de deploy criada, e `docs/OPERACAO.md` aberto
- [x] 02-05-PLAN.md — Playwright, a fixture do build antigo congelada, e as specs de instalação e offline em vermelho

**Wave 3** *(blocked on Wave 2 completion)*

- [ ] 02-06-PLAN.md — O service worker derivado do build: template com sentinelas, `sw:emit` e `sw:verify`

**Wave 4** *(blocked on Wave 3 completion)*

- [ ] 02-07-PLAN.md — O aviso de atualização que só troca de versão fora de partida
- [ ] 02-08-PLAN.md — `apps/server`: workspace confinado, migração da tabela do ledger e `/api/health` em loopback

**Wave 5** *(blocked on Wave 4 completion)*

- [ ] 02-09-PLAN.md — As duas specs que provam INFRA-03 e o job `pwa` no CI
- [ ] 02-10-PLAN.md — `dg2.service`, Litestream, `cert-check` e o ensaio de restauração em código

**Wave 6** *(blocked on Wave 5 completion)*

- [ ] 02-11-PLAN.md — O job `deploy` no `ci.yml` e o empacotamento do servidor

**Wave 7** *(blocked on Wave 6 completion)*

- [ ] 02-12-PLAN.md — A caixa de verdade: primeiro certificado, deploy, reversão, restauração e o vigia

**Sequência interna que não pode ser trocada**: `tests/pwa/fixtures/old-build/` é congelada no
plano 02-05 — **depois** da mudança de `base` (02-02, para que o escopo do service worker
antigo já seja `/`) e **antes** da reescrita do `sw.js` (02-06). Fora dessa janela a fixture
nasce sendo o build novo, e o teste de atualização do critério 2 passa por vacuidade. O
`depends_on` de 02-05 e de 02-06 é o que amarra isso.

**Escopo novo, medido pela pesquisa e não previsto na discussão** (`02-RESEARCH.md` DM-1): o
repositório nunca foi publicado — `git remote -v` vazio, 161 commits, e a API do GitHub
respondendo 404. **O `ci.yml` nunca rodou num runner.** O plano 02-01 existe por isso, e apaga
o `deploy.yml` antes do primeiro push, para que o primeiro deploy do projeto no GitHub Pages
não aconteça por acidente (D2-18).

**Nota de operação**: o Let's Encrypt encerrou o aviso de expiração por e-mail em jun/2025 —
o monitoramento externo do certificado é parte do critério 1, não item separado.

### Phase 3: Sala, transporte e protocolo

**Goal**: Quatro amigos se encontram numa sala pelo código e se veem no lobby — e o formato do fio (duas classes de canal, tabelas de enum congeladas e o codec binário quantizado do snapshot) fica decidido aqui, antes de existir uma partida para consumi-lo.
**Mode:** mvp
**Depends on**: Phase 2
**Requirements**: SALA-01, SALA-02, SALA-03, SALA-04, SALA-05, SYNC-04
**Success Criteria** (what must be TRUE):

  1. Um jogador cria uma sala, recebe um código de 6+ caracteres sem caractere ambíguo, e até três amigos entram por ele e se veem no lobby com nome e classe.
  2. Cada jogador escolhe a classe no lobby e quem criou inicia a run; os slots `p0..p3` são atribuídos quando a sala fecha e não mudam depois.
  3. A sala fecha entre jogadores atrás de NAT residencial brasileiro, incluindo pelo caminho de relay — exercitado sob flag de debug, sem depender de achar um amigo atrás de CGNAT.
  4. A tela mostra ping e tipo de rota, e o desfecho ICE de cada conexão fica registrado: a taxa real de necessidade de relay passa a ser medida em vez de estimada.
  5. Um bench no CI codifica um `World` de wave 16 com 4 jogadores e o resultado cabe abaixo de 16 KiB por mensagem.

**Plans**: 4 (estimativa)
**UI hint**: yes

**Por que o codec vem aqui e não na fase 4**: é uma restrição medida, não uma otimização. O
`World` serializado já ocupa 13,8 KB com 4 jogadores na **wave 1** contra 16 KiB de limite de
DataChannel, e a wave 16 extrapola para 38–60 KB. `JSON.stringify(world)` está morto antes de
ser escrito, e o formato do snapshot é decisão de protocolo — o encoder só é exercido de
verdade na fase 4, mas quem o define é esta.

**O protocolo não contém a palavra "host"** (FORM-12, decidido na fase 1): topologia estrela,
uma perna por mensagem, e o input da autoridade passando pela mesma tabela dos remotos. É o
que faz trocar P2P por servidor dedicado ser troca de construtor em vez de reescrita.

### Phase 4: Partida sincronizada

**Goal**: Dois a quatro jogadores lutam a mesma run no mesmo mundo, cada um com sua câmera, com o jogo respondendo na hora para cada um — o Core Value do projeto.
**Mode:** mvp
**Depends on**: Phase 3
**Requirements**: SYNC-01, SYNC-02, SYNC-03
**Success Criteria** (what must be TRUE):

  1. De 2 a 4 jogadores atravessam juntos uma campanha de 16 waves no mesmo mundo, cada um com sua câmera, sem dessincronizar.
  2. Com 150 ms de RTT e 2% de perda aplicados por traffic shaping — **nunca em `localhost`** — o personagem do próprio jogador responde ao controle no quadro seguinte e converge sem solavanco visível.
  3. Nas mesmas condições, os outros jogadores e os inimigos se movem interpolados: nenhum teletransporte, nenhum "congela e depois pula".
  4. O HUD de debug mostra bytes/s, RTT e magnitude do erro de reconciliação; sob pressão de banda a taxa cai de 20 para 10 Hz com aviso na UI, em vez de o canal fechar.

**Plans**: 4 (estimativa)
**Research**: `/gsd:plan-phase --research-phase` — os números de banda são extrapolados e não
medidos no fio; `Bullet`, `Coin` e `Potion` não têm `id`, e a identidade de entidade nos deltas
precisa de desenho; a política de backpressure também.

**Anti-padrão explicitamente proibido nesta fase**: interest management. O viewport de desktop
já cobre 54% da arena e as quatro câmeras se sobrepõem justamente quando há mais entidades —
relevância ganha 20–40% no melhor caso contra os 5–10× de quantizar e binarizar. Medir com o
HUD antes de otimizar qualquer outra coisa.

### Phase 5: Regras de co-op e resiliência de sessão

**Goal**: Transformar quatro câmeras num mundo de três telas em um jogo de co-op de verdade — achar o aliado, levantá-lo, voltar depois de morrer e voltar depois de a conexão cair.
**Mode:** mvp
**Depends on**: Phase 4
**Requirements**: COOP-01, COOP-02, COOP-03, COOP-04, COOP-05, COOP-06, COOP-07, TEMP-04
**Success Criteria** (what must be TRUE):

  1. Ninguém passa uma wave inteira olhando: um jogador derrubado fica caído e é levantado por um aliado, e um jogador morto definitivamente espectra e volta jogando no início da wave seguinte.
  2. O jogador acha um aliado fora da tela pelo minimapa e pelo indicador de borda, e lê nome e HP sobre a cabeça de quem está na tela — sem abrir menu e sem sair do combate.
  3. Cada jogador pega o próprio loot, o level-up de cada um resolve no intervalo junto com a loja sem congelar os outros, e o fim de run é coletivo e credita os quatro.
  4. Passar de 1 para 4 jogadores muda a **quantidade** de inimigos (e a vida só de chefe), nunca o dano nem a vida de trash mob: o multiplicador de combo continua significando a mesma coisa nas duas contagens.
  5. Um jogador que perde a conexão volta para a mesma sala e para a run em andamento, ou lê na tela a razão pela qual não dá.

**Plans**: 4 (estimativa)
**UI hint**: yes

**COOP-04 e COOP-05 são table stakes, não acabamento.** O spec de origem os agendava para o
último marco; a pesquisa de features mostra que sem eles um mundo de 2400×1600 com câmera por
jogador entrega quatro jogos solo no mesmo servidor. COOP-05 (espectar + respawn) é um buraco
que o spec nunca cobriu: hoje o jogo só tem "game over".

**TEMP-04 mora aqui, não na fase final**, porque "indicador de conexão, reconexão e tratamento
da saída do host" está no bloco de table stakes da pesquisa de features. Deixá-lo na última
fase o tornaria cortável, e ele não é.

**Bump de protocolo consciente**: caído, `spectating` e `Coin.owner` acrescentam campo a
entidade em rede. O bump de `PROTOCOL_VERSION` desta fase é planejado, não acidente.

**Pergunta aberta que precisa de resposta antes desta fase**: política de queda do host —
(a) creditar a run parcial submetendo o log até a queda, (b) checkpoint de progressão durável
por wave concluída, (c) migração de host. Todos concordam que (c) é caro e que amigos toleram a
limitação se ela for declarada. O critério 5 depende de qual for a escolha. Compartilhada com a
fase 6.

### Phase 6: Contas, progressão na nuvem e offline

**Goal**: O progresso do jogador para de morrer no `localStorage` do aparelho e passa a segui-lo, sem que jogar offline perca nem duplique nada — e sem que uma run de co-op possa escrever na conta de outro jogador fora da verificação.
**Mode:** mvp
**Depends on**: Phase 5
**Requirements**: CONTA-01, CONTA-02, CONTA-03, CONTA-04, CONTA-05, CONTA-06, TEMP-03
**Success Criteria** (what must be TRUE):

  1. O jogador cria conta com email e senha, faz login, recupera o acesso quando esquece a senha, e a sessão sobrevive ao recarregamento **e** autentica a conexão de signaling.
  2. Progresso feito num navegador aparece no outro depois do login, e o nome e a aparência chegam aos amigos na sala sem redigitar nada.
  3. Jogar offline funciona e, ao reconectar, o soul gold ganho entra exatamente uma vez: repetir a sincronização não duplica, e restaurar um save antigo não ressuscita saldo já gasto.
  4. A conta local criada no primeiro boot é reivindicada por um login; reivindicar com uma conta que já tem progresso é recusado com explicação — duas contas reais nunca se fundem.
  5. Se o host cai no meio da run, a progressão durável das waves já concluídas continua creditada na conta de cada participante.

**Plans**: 4 (estimativa)
**UI hint**: yes

**Por que a conta vem depois da sala**: o `PROJECT.md` exige que o **formato** de identidade
seja decidido antes do multiplayer — e ele foi, na fase 1. A implementação vem depois de a sala
valer a pena, que é a prioridade declarada pelo usuário ("4 jogadores numa sala primeiro").

**Nota que não pode se perder**: a regra `dependencies: {}` é do **jogo publicado**, não da API.
Se ela vazar para o servidor, o resultado previsível é criptografia artesanal. Argon2id precisa
de limite de taxa obrigatório — 19 MiB por verificação × 100 logins concorrentes ≈ 1,9 GB é
vetor de negação de serviço numa VPS pequena.

**Pergunta aberta compartilhada com a fase 5**: política de queda do host. Aqui ela decide o
formato do checkpoint de progressão durável, que é dado gravado — decidir depois é migração.

**Corte defensável**: a parte offline (CONTA-04) é o último item da ordem de corte. Login,
progresso na nuvem e claim da conta local não são cortáveis.

### Phase 7: Arte nova integrada

**Goal**: Trocar a arte e reescalar as hitboxes numa única mudança de `sim/`, enquanto ainda não existe placar nem replay guardado para invalidar.
**Mode:** mvp
**Depends on**: Phase 6
**Requirements**: ARTE-01, ARTE-02
**Success Criteria** (what must be TRUE):

  1. O CI **deste** repositório recusa um manifesto ou um sprite fora da spec de FORM-09, e o agente de assets recebe o erro sem humano no meio.
  2. Um personagem e um tile atravessam o pipeline inteiro — manifesto, validador, `render/sprites.ts`, jogo — antes de a produção em massa começar.
  3. O jogo roda inteiro com a arte nova e `render/sprites.ts` deixa de ter coordenada escrita à mão.
  4. As hitboxes foram reescaladas junto com a arte de uma vez só: o `SIM_VERSION` muda uma vez, não uma vez por lote de sprite.
  5. A instalação do PWA continua funcionando com o orçamento de bytes novo — nenhuma URL do precache dá 404 (`cache.addAll` rejeita a instalação inteira se uma falhar).

**Plans**: 3 (estimativa)
**UI hint**: yes
**Research**: `/gsd:plan-phase --research-phase` — depende de um artefato que ainda não existe
(o manifesto do outro agente) e de um reescalonamento de hitbox sem precedente no repositório.

**Por que antes do ranking**: as hitboxes vivem em `src/sim/defs/enemies.ts` e derivam do
tamanho dos sprites atuais. Manter as hitboxes faz o jogo parecer errado; reescalá-las muda o
balanceamento **e** invalida todo replay e todo score gravado. Se a arte entrasse depois do
ranking, a integração fecharia uma temporada.

### Phase 8: Modo missão

**Goal**: Dar ao co-op uma razão para voltar que não seja "sobreviver mais uma wave" — objetivos que mudam de onde vem o perigo, numa cadeia que destrava.
**Mode:** mvp
**Depends on**: Phase 7
**Requirements**: MISS-01, MISS-02, MISS-03
**Success Criteria** (what must be TRUE):

  1. O jogador entra numa missão com condição de vitória própria além de sobreviver — defender ponto, matar alvo marcado, limpeza cronometrada, coleta-e-entrega ou sobreviver-e-extrair — e a vence ou a perde por causa do objetivo, não porque a wave acabou.
  2. Os quatro jogadores leem o estado do objetivo no HUD com a câmera onde estiver, e recebem o briefing antes de entrar.
  3. Concluir uma missão destrava a seguinte; a cadeia mantém sempre pelo menos dois nós abertos, e uma missão trancada não é entrável.
  4. Numa sala, a cadeia de quem criou define o que dá para jogar, e todos os presentes na conclusão recebem crédito na própria conta.
  5. A conclusão da missão é verificável por replay: re-rodar a seed e o log chega ao mesmo desfecho de objetivo, porque `world.objectives` é campo do `World` e não evento drenável.

**Plans**: 3 (estimativa)
**UI hint**: yes

**Critério de aceitação de qualquer objetivo novo**: muda **de onde vem o perigo** em vez de
acrescentar tarefa; é avaliável dentro de `sim/`, puro; tem leitura no HUD dos quatro; e a
falha nunca vem do erro isolado de um jogador. Fora, por veredito da pesquisa: escolta de NPC e
objetivos com 4 pontos simultâneos (obrigam separação num mundo de três telas).

**Pergunta aberta que esta fase consome**: quem pode entrar numa missão destravada. A proposta é
que a cadeia de quem criou a sala defina o que dá para jogar, que quem não destravou entre como
convidado, e que todos os presentes na conclusão recebam crédito — o que permite explicitamente
"carregar" um amigo. Em co-op privado, carregar é feature; precisa ser aceito ou rejeitado por
escrito antes da primeira cadeia, porque corrigir depois é migração de progressão.

**Corte defensável**: esta é a segunda fase a cair se o tempo apertar.

### Phase 9: Ranking verificado e temporadas

**Goal**: Um placar em que estar no topo significa ter jogado — o servidor emite a seed, reconstrói a configuração da run a partir da conta e re-roda a run inteira antes de aceitar o score — com o versionamento de temporada que impede o primeiro patch de matar o placar.
**Mode:** mvp
**Depends on**: Phase 8
**Requirements**: RANK-01, RANK-02, RANK-03, RANK-04, TEMP-01, TEMP-02
**Success Criteria** (what must be TRUE):

  1. Um score solo só aparece no placar depois de o servidor re-rodar a run a partir da seed e do log de inputs e chegar ao mesmo resultado; um log adulterado é recusado, e não existe caminho de entrada para um score enviado sem log.
  2. A seed e o `runId` vêm do servidor e o `RunConfig` é reconstruído a partir da conta: uma run jogada offline não tem como pontuar, por construção, e não por decreto.
  3. A verificação roda em fila, fora da requisição, com teto de ticks, de bytes e de tempo de parede: dez submissões simultâneas de runs longas não derrubam a VPS nem seguram a API, e o placar separa modo × tamanho de grupo × perfil sem nunca misturá-los.
  4. Quando o `SIM_VERSION` muda, a temporada fecha e uma nova abre com o placar anterior preservado e rotulado; um replay da versão antiga é recusado com a razão na tela — evento planejado, não incidente.
  5. Existe uma seed da semana igual para todos, com a janela vinda do relógio do servidor em UTC, e quem participa fica com um selo datado no perfil — registro, nunca poder nem cosmético.

**Plans**: 4 (estimativa)
**UI hint**: yes
**Research**: `/gsd:plan-phase --research-phase` — o custo de CPU da verificação diverge em uma
ordem de grandeza entre os relatórios (orçar pelo pessimista, medir antes de dimensionar a
fila), e o teto de endless precisa de desenho.

**O que esta fase precisa que já exista**: `sim/math.ts`, `simVersion` e `loadWorld` (fase 1),
captura do log na autoridade (fase 4), conta (fase 6) e arte já integrada (fase 7).

**Rótulo honesto obrigatório na UI**: a verificação por replay derrota score forjado e stat
editing; **não** derrota aimbot, porque input superhumano é input válido. O placar precisa dizer
o que verifica.

**Perguntas abertas que esta fase consome:**

- **Teto do forge em runs rankeadas e de evento.** Perfil normalizado (forge desligado) torna o board comparável, deixa o jogador novo competir no dia 1 e reduz drasticamente a superfície da verificação — mas apaga uma meta-progressão que já existe e que o jogador pode valorizar. Alternativa: teto no forge em vez de desligamento.
- **Teto de duração para endless no ranking.** Endless é ilimitado por construção: ou há teto explícito comunicado na UI, ou a verificação é amostrada por checkpoint. Um log alegando 10 h são 2,16 milhões de ticks, e alguém pode mandar dez em paralelo.

**Corte defensável**: TEMP-02 (a seed semanal como evento sazonal) é o **primeiro** item a cair
de todo o roadmap; o resto desta fase é o terceiro. TEMP-01 não cai junto com TEMP-02 — sem o
esquema `(temporada, SIM_VERSION)` o placar morre no primeiro patch.

## Linha de corte

O risco nº 1 apontado pela pesquisa de armadilhas para um projeto desta forma (uma pessoa mais
agentes, VPS pequena) é escopo — e o padrão de falha não é "não terminar", é terminar sete
coisas pela metade que dependem umas das outras, de modo que nenhuma pode ser testada de ponta
a ponta e nenhuma pode ser cortada.

**Carga estrutural — não se corta:** fases 1 a 5. São o Core Value ("quatro amigos entram numa
sala pelo código e lutam as mesmas waves no mesmo mundo") mais os formatos e a operação que o
sustentam.

**Ordem de corte, se o tempo apertar:**

1. **TEMP-02** — a seed semanal como evento sazonal (dentro da fase 9)
2. **Fase 8** — modo missão inteiro
3. **O resto da fase 9** — ranking verificado (mantendo TEMP-01, que é barato e evita o placar morrer no primeiro patch)
4. **CONTA-04** — a parte offline da fase 6

As fases 6 (login e nuvem) e 7 (arte) não estão na ordem de corte: a primeira é o que faz o
progresso seguir o jogador, e a segunda é a direção de arte nova que o projeto escolheu de
propósito.

## Desvios em relação à proposta da pesquisa

`.planning/research/SUMMARY.md` propôs 10 fases, reconciliando três ordens de construção
concorrentes. Mantive a espinha dorsal inteira e fiz três ajustes:

1. **Temporadas foram fundidas ao ranking (fases 9 e 10 viraram uma).** A própria pesquisa
   argumenta que temporadas não são feature de fim de projeto — são a **estratégia de
   versionamento do ranking**, e o esquema `(temporada, SIM_VERSION)` precisa existir antes do
   primeiro board público. Separá-las convidava a construir um placar sem plano de versão.
   A granularidade do corte foi preservada marcando TEMP-02 como primeiro item a cair.

2. **TEMP-04 (reconexão) subiu da última fase para a fase 5.** A pesquisa de features lista
   "indicador de conexão, reconexão e tratamento da saída do host" no bloco de table stakes.
   Na última fase ele seria cortado junto com os eventos; na fase 5 ele é carga estrutural.

3. **TEMP-03 (progressão durável na queda do host) foi para a fase 6.** É o "checkpoint de
   progressão durável por wave concluída" que a própria pesquisa já listava como entrega da
   fase de contas — progressão durável só existe depois que a conta existe.

O que **não** mudou, porque é o que a pesquisa comprou: infra como fase própria antes de
qualquer rede; o codec de snapshot decidido na fase de transporte e não na de sincronização; a
arte integrada antes do ranking; a spec de assets na fase 1; e a conta depois da sala.

**Nove fases contra as 5–8 da granularidade "standard".** Cheguei a nove por subtração, não por
adição: as duas fusões acima já tiraram uma fase. As candidatas restantes a fusão têm perfis de
risco genuinamente diferentes — juntar transporte (conectividade, NAT, TURN) com sincronização
(predição, reconciliação, banda) produziria uma fase de 9 requisitos e o dobro dos planos, o que
é exatamente a armadilha das "três frentes abertas"; e juntar arte (2 requisitos, mas dependente
de um artefato externo e de uma mudança de `sim/` sem precedente) com missões produziria uma
fase incoerente. Preferi ficar um acima do guia a fundir riscos que não se parecem.

## Progress

**Execution Order:** as fases executam em ordem numérica: 1 → 2 → 3 → 4 → 5 → 6 → 7 → 8 → 9

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Formato e costuras | 14/14 | Complete   | 2026-08-31 |
| 2. Migração para a VPS | 3/12 | In Progress|  |
| 3. Sala, transporte e protocolo | 0/4 | Not started | - |
| 4. Partida sincronizada | 0/4 | Not started | - |
| 5. Regras de co-op e resiliência | 0/4 | Not started | - |
| 6. Contas, nuvem e offline | 0/4 | Not started | - |
| 7. Arte nova integrada | 0/3 | Not started | - |
| 8. Modo missão | 0/3 | Not started | - |
| 9. Ranking verificado e temporadas | 0/4 | Not started | - |

---
*Roadmap criado: 2026-08-29*
