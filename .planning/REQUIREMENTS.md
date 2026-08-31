# Requirements: DungeonGuys2

**Defined:** 2026-08-29
**Core Value:** Quatro amigos entram numa sala pelo código e lutam as mesmas waves no mesmo
mundo, com o jogo respondendo na hora para cada um.

> Escopo: produto inteiro, conforme pedido. As fases distantes carregam menos detalhe de
> propósito — serão revisadas quando chegar a vez delas.
>
> Base: `.planning/research/SUMMARY.md`, que consolida quatro pesquisas e corrige o
> `docs/BACKLOG.md` em dois pontos. Decisões humanas tomadas em 2026-08-29 estão marcadas
> **[decidido]** onde moldam um requisito.

## v1 Requirements

### Formato e costuras (FORM)

Nada aqui tem rede. É a lista "barato agora, migração de dados depois" — 12 dos 18 itens
que a síntese classificou assim moram nesta categoria.

- [ ] **FORM-01**: Uma run distingue três espaços de identidade — `accountId` durável do
      servidor, `playerId` de slot (`p0..p3`) atribuído pela autoridade, e `peerId` que
      morre com a conexão — e o replay depende apenas do `playerId`
- [ ] **FORM-02**: `RunConfig` descreve todos os jogadores da run (`players[]` com id, nome,
      classe e forge), e `step()` itera nessa ordem canônica em vez da ordem de inserção de
      `Object.keys(world.players)`
- [ ] **FORM-03**: Todo artefato de run carrega um `SIM_VERSION` derivado de hash de conteúdo
      do artefato buildado, nunca de semver escrito à mão
- [ ] **FORM-04**: A mesma run produz resultado bit-idêntico no navegador e no Node, com
      trigonometria própria em `sim/math.ts` construída só sobre operações exatas por spec
- [x] **FORM-05**: O jogador ganha soul gold por eventos idempotentes com id próprio, e o
      saldo é derivado desses eventos em vez de ser um contador mutável
- [ ] **FORM-06**: O log de inputs é quantizado na captura, antes de o `sim/` ver o valor, e
      gravado como a tabela resolvida pela autoridade — incluindo a política de preenchimento
      de buracos — e não como o tráfego que chegou
- [ ] **FORM-07**: O `World` serializa e desserializa sem perda, incluindo o estado do RNG
- [ ] **FORM-08**: Objetivos de missão vivem como campo do `World`, não como evento drenável,
      para que a conclusão seja verificável por replay
- [ ] **FORM-09**: A especificação técnica de assets está publicada, com unidades lógicas
      congeladas, e um validador de manifesto no CI recusa arte fora do formato — **[decidido]**
      `TILE` muda como tamanho de tile de desenho, `world.play` ganha margem própria, e
      `WORLD` continua 2400×1600
- [ ] **FORM-10**: O passo fixo roda separado de `requestAnimationFrame`, de modo que a
      simulação seja dirigível por teste e por servidor sem um relógio de tela
- [ ] **FORM-11**: As tabelas de enum do protocolo são congeladas e append-only, verificado
      por teste de snapshot
- [ ] **FORM-12**: O protocolo não contém a palavra "host": topologia estrela, uma perna por
      mensagem, e o input da autoridade passa pela mesma tabela dos remotos

### Hospedagem (INFRA)

- [ ] **INFRA-01**: O jogo single-player roda na VPS sob domínio único com TLS, e o
      GitHub Pages deixa de ser alvo de deploy — **[decidido]** o espelho morre
- [ ] **INFRA-02**: O PWA continua instalável e funcional offline servido da VPS
- [ ] **INFRA-03**: O service worker deixa `/api/` passar sem cachear, só guarda respostas
      `ok`, e deriva o nome do cache do build
- [ ] **INFRA-04**: O deploy é um comando, com o processo supervisionado e backup do banco
      restaurável — verificado restaurando, não só gerando

### Sala e transporte (SALA)

- [ ] **SALA-01**: Um jogador cria uma sala e recebe um código curto, sem ambiguidade de
      caracteres
- [ ] **SALA-02**: Até três jogadores entram pelo código e se veem no lobby
- [ ] **SALA-03**: Cada jogador escolhe sua classe no lobby e quem criou a sala inicia a run
- [ ] **SALA-04**: A sala fecha entre jogadores atrás de NAT residencial brasileiro,
      usando relay quando a conexão direta falha
- [ ] **SALA-05**: A tela mostra ping e tipo de rota da conexão, e o cliente registra o
      desfecho ICE para que a taxa real de necessidade de relay seja medida em vez de estimada

### Partida sincronizada (SYNC)

- [ ] **SYNC-01**: Dois a quatro jogadores lutam a mesma run no mesmo mundo, cada um com sua
      câmera
- [ ] **SYNC-02**: O personagem do jogador responde ao controle imediatamente, mesmo com
      150 ms de ping, e converge sem solavanco visível
- [ ] **SYNC-03**: Os outros jogadores e os inimigos aparecem interpolados, sem teletransporte
- [ ] **SYNC-04**: O snapshot cabe no limite de mensagem do DataChannel numa wave 16 com
      quatro jogadores — hoje o `World` serializado já ocupa 13,8 KB na wave 1 contra 16 KiB
      de limite, então o codec binário quantizado é requisito, não otimização

### Regras de co-op (COOP)

- [ ] **COOP-01**: Um jogador derrubado fica caído e pode ser revivido por um aliado
- [ ] **COOP-02**: Cada jogador recebe o próprio loot, sem corrida por moeda
- [ ] **COOP-03**: A dificuldade escala por quantidade de inimigos, não por vida inflada, de
      modo que o combo de score continue significando a mesma coisa
- [ ] **COOP-04**: O jogador encontra os aliados fora da tela por minimapa e indicador de
      borda — sem isso, quatro câmeras num mundo de três telas viram quatro jogos solo
- [ ] **COOP-05**: Um jogador morto definitivamente espectra e volta na wave seguinte
- [ ] **COOP-06**: Level-up acumula e resolve no intervalo junto com a loja, sem congelar
      os outros jogadores
- [ ] **COOP-07**: O fim de run é coletivo e credita todos os participantes

### Conta e progressão (CONTA)

- [ ] **CONTA-01**: O jogador cria conta com email e senha e faz login
- [ ] **CONTA-02**: A sessão persiste entre recarregamentos e autentica também a conexão de
      signaling
- [ ] **CONTA-03**: O progresso do jogador o segue entre aparelhos e navegadores
- [ ] **CONTA-04**: Jogar offline funciona, e ao reconectar o progresso sincroniza sem perder
      nem duplicar nada
- [ ] **CONTA-05**: A conta local criada no primeiro boot é reivindicada por um login; duas
      contas reais nunca se fundem
- [ ] **CONTA-06**: O nome e a aparência do jogador aparecem para os amigos na sala, sem
      redigitar

### Arte (ARTE)

- [ ] **ARTE-01**: O agente de assets, em repositório separado, produz contra a spec de
      FORM-09 e o CI recusa o que estiver fora do formato
- [ ] **ARTE-02**: O jogo roda com a arte nova, com as hitboxes reescaladas uma única vez
      junto com ela

### Modo missão (MISS)

- [ ] **MISS-01**: Uma missão tem condição de vitória própria além de sobreviver — defender
      ponto, matar alvo marcado, limpeza cronometrada, coleta-e-entrega ou sobreviver-e-extrair
- [ ] **MISS-02**: As missões destravam em cadeia, com pré-requisito para entrar
- [ ] **MISS-03**: Numa sala, a cadeia de quem criou define o que pode ser jogado, e todos os
      presentes na conclusão recebem crédito

### Ranking (RANK)

- [ ] **RANK-01**: O score solo entra no placar apenas depois de o servidor re-rodar a run a
      partir da seed e do log de inputs e chegar ao mesmo resultado — **[decidido]** v1
      rankeia só solo
- [ ] **RANK-02**: A seed é emitida pelo servidor e o `RunConfig` é reconstruído a partir da
      conta, nunca aceito do cliente
- [ ] **RANK-03**: Uma run jogada offline não pontua, por construção — sem `runId` do
      servidor não há submissão possível
- [ ] **RANK-04**: O placar separa as categorias que não se comparam (modo, tamanho de grupo,
      perfil), e a verificação roda em fila com teto de ticks e de bytes, nunca dentro da
      requisição

### Temporadas e resiliência (TEMP)

- [ ] **TEMP-01**: Quando o `SIM_VERSION` muda, o placar da temporada fecha e uma nova abre —
      **[decidido]** modelo Factorio; replays de outra versão são recusados, e isso é evento
      planejado em vez de incidente
- [ ] **TEMP-02**: Existe uma seed semanal compartilhada, que serve ao mesmo tempo de placar
      justo e de evento sazonal
- [ ] **TEMP-03**: A queda do host não apaga a progressão durável já conquistada, que é
      creditada por wave concluída
- [ ] **TEMP-04**: O jogador reconecta a uma sala que caiu, ou recebe explicação clara de por
      que não dá

## v2 Requirements

Reconhecidos e adiados. Não entram no roadmap atual.

### Personagem modular (PECA)

- **PECA-01**: O jogador monta o personagem por peças antes da run, em vez de escolher uma
  classe fixa — conceito ainda a estabelecer, inspirado no modelo do Brotato
- **PECA-02**: As 7 classes atuais viram presets do sistema novo

### Ranking co-op (RCOP)

- **RCOP-01**: Placar de co-op separado por tamanho de grupo, com cada jogador enviando o
  próprio log para o host não poder fabricar o dos outros

### Interface (UI)

- **UI-01**: Interface caprichada, revista como sistema em vez de tela a tela

### Skins (SKIN)

- **SKIN-01**: Várias aparências por personagem, escolhidas ou desbloqueadas no perfil

## Out of Scope

| Feature | Reason |
|---------|--------|
| PvP | Decisão do spec de origem: o reaproveitamento do jogo depende de ser co-op contra as waves, e PvP não tolera a latência que este netcode aceita |
| Matchmaking público e diretório de salas | Entrada por código ou link privado; diretório exigiria estado e moderação que o projeto não quer agora |
| Servidor de jogo dedicado | P2P agora, com a fronteira desenhada para mover autoridade depois sem reescrever. Reavaliar se o público abrir |
| Redesenho de classes e itens | Declarados provisórios em 2026-08-28; até o conceito novo existir, a meta é máxima semelhança com o original |
| Ajuste de balanceamento de classe ou item | Mesma razão — seria trabalho jogado fora |
| Espelho no GitHub Pages | **[decidido]** morre com a migração; dois alvos de deploy divergem sem ninguém notar |
| Ofuscação, attestation, detecção por ML, banimento automático | A pesquisa de armadilhas listou explicitamente como não valendo o custo em P2P entre amigos |
| Recompensa cosmética ou de poder em evento sazonal | Cosmético compromete o pipeline de arte; poder contamina o placar. Recompensa é selo e data |
| Interest management no primeiro marco de rede | O viewport cobre 54% do mundo e as câmeras se sobrepõem justamente quando há mais entidades: ganho de 20-40% contra 5-10× de quantizar e binarizar |

## Traceability

Preenchido na criação do roadmap (2026-08-29). Ver `.planning/ROADMAP.md`.

| Requirement | Phase | Status |
|-------------|-------|--------|
| FORM-01 | Phase 1 | Pending |
| FORM-02 | Phase 1 | Pending |
| FORM-03 | Phase 1 | Pending |
| FORM-04 | Phase 1 | Pending |
| FORM-05 | Phase 1 | Complete |
| FORM-06 | Phase 1 | Pending |
| FORM-07 | Phase 1 | Pending |
| FORM-08 | Phase 1 | Pending |
| FORM-09 | Phase 1 | Pending |
| FORM-10 | Phase 1 | Pending |
| FORM-11 | Phase 1 | Pending |
| FORM-12 | Phase 1 | Pending |
| INFRA-01 | Phase 2 | Pending |
| INFRA-02 | Phase 2 | Pending |
| INFRA-03 | Phase 2 | Pending |
| INFRA-04 | Phase 2 | Pending |
| SALA-01 | Phase 3 | Pending |
| SALA-02 | Phase 3 | Pending |
| SALA-03 | Phase 3 | Pending |
| SALA-04 | Phase 3 | Pending |
| SALA-05 | Phase 3 | Pending |
| SYNC-04 | Phase 3 | Pending |
| SYNC-01 | Phase 4 | Pending |
| SYNC-02 | Phase 4 | Pending |
| SYNC-03 | Phase 4 | Pending |
| COOP-01 | Phase 5 | Pending |
| COOP-02 | Phase 5 | Pending |
| COOP-03 | Phase 5 | Pending |
| COOP-04 | Phase 5 | Pending |
| COOP-05 | Phase 5 | Pending |
| COOP-06 | Phase 5 | Pending |
| COOP-07 | Phase 5 | Pending |
| TEMP-04 | Phase 5 | Pending |
| CONTA-01 | Phase 6 | Pending |
| CONTA-02 | Phase 6 | Pending |
| CONTA-03 | Phase 6 | Pending |
| CONTA-04 | Phase 6 | Pending |
| CONTA-05 | Phase 6 | Pending |
| CONTA-06 | Phase 6 | Pending |
| TEMP-03 | Phase 6 | Pending |
| ARTE-01 | Phase 7 | Pending |
| ARTE-02 | Phase 7 | Pending |
| MISS-01 | Phase 8 | Pending |
| MISS-02 | Phase 8 | Pending |
| MISS-03 | Phase 8 | Pending |
| RANK-01 | Phase 9 | Pending |
| RANK-02 | Phase 9 | Pending |
| RANK-03 | Phase 9 | Pending |
| RANK-04 | Phase 9 | Pending |
| TEMP-01 | Phase 9 | Pending |
| TEMP-02 | Phase 9 | Pending |

**Coverage:**
- v1 requirements: 51 total
- Mapped to phases: 51 ✓
- Unmapped: 0

**Notas de mapeamento** (onde o roadmap não seguiu a categoria):

- **SYNC-04 → Phase 3**, não Phase 4. O codec binário quantizado é decisão de protocolo, não
  otimização de sincronização: o `World` serializado já ocupa 13,8 KB com 4 jogadores na wave 1
  contra 16 KiB de limite de DataChannel. O formato é definido na fase que define o fio; o
  encoder é exercido na fase 4.
- **TEMP-04 → Phase 5**, não a fase final. Reconexão está no bloco de table stakes da pesquisa
  de features, junto com o indicador de conexão. Na fase final seria cortável; não é.
- **TEMP-03 → Phase 6**. Progressão durável só existe depois que a conta existe; é o checkpoint
  por wave concluída que a pesquisa já listava como entrega da fase de contas.
- **TEMP-01 e TEMP-02 → Phase 9**, junto com o ranking. Temporadas são a estratégia de
  versionamento do placar, não uma feature de fim de projeto: o esquema `(temporada,
  SIM_VERSION)` precisa existir antes do primeiro board público.
- **FORM-09 → Phase 1** apesar de a integração de arte (ARTE-01/02) só acontecer na Phase 7:
  a spec destrava outro agente em outro repositório e tem o maior lead time do marco.

---
*Requirements defined: 2026-08-29*
*Last updated: 2026-08-29 — rastreabilidade preenchida na criação do roadmap*
