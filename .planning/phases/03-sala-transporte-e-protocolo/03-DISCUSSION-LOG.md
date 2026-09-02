# Phase 3: Sala, transporte e protocolo - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-09-02 (discussão iniciada em 2026-09-01)
**Phase:** 3-Sala, transporte e protocolo
**Areas discussed:** Sala e lobby, Signaling e TURN sem conta, Ping, rota e telemetria ICE, Codec do snapshot

Todas as quatro áreas propostas foram selecionadas. Em toda pergunta a opção marcada como
recomendada foi a escolhida; nenhuma resposta foi "Você decide" e nenhuma foi texto livre.
Um "1" solto chegou no meio da segunda rodada de Sala e lobby e foi lido como confirmação
da primeira opção da pergunta então em curso, que já estava registrada.

---

## Sala e lobby

### Onde vive o estado do lobby e quando o WebRTC abre?

| Option | Description | Selected |
|--------|-------------|----------|
| WebRTC desde o join | Autoridade = máquina de quem criou; lobbyState no canal reliable; servidor só casa as pontas. Falha de NAT e ping aparecem no lobby | ✓ |
| Servidor guarda o lobby via WebSocket | WebRTC só no start; falha de conexão só aparece ao iniciar; servidor ganha regras de sala | |
| Você decide | | |

**User's choice:** WebRTC desde o join (D3-01)

### Quem criou fecha a aba antes de iniciar?

| Option | Description | Selected |
|--------|-------------|----------|
| A sala morre | Todos voltam ao menu com aviso; sem migração de autoridade; servidor apaga a sala quando o WS da autoridade fecha | ✓ |
| A autoridade migra no lobby | Próximo na ordem vira autoridade; segundo caminho de "quem manda" que a fase 5 herda | |
| A sala espera o criador voltar | Servidor segura o código; antecipa reconexão (fase 5) | |

**User's choice:** A sala morre (D3-02)

### Dois jogadores podem escolher a mesma classe?

| Option | Description | Selected |
|--------|-------------|----------|
| Sim, classes repetidas | Cor por jogador e nome distinguem; classes são provisórias | ✓ |
| Não, uma classe por jogador | Exclusividade com regra de conflito e UI de "indisponível" | |
| Você decide | | |

**User's choice:** Sim, classes repetidas (D3-03)

### Regra para quem criou apertar "iniciar"?

| Option | Description | Selected |
|--------|-------------|----------|
| Inicia quando quiser, inclusive sozinho | Sem "pronto"; solo é um caso de multiplayer | ✓ |
| Todos marcam "pronto" antes | Botão só habilita com todos prontos; trava em quem saiu | |
| Pronto com timer de segurança | Quem não responder em N s conta como pronto; mais UI | |

**User's choice:** Inicia quando quiser, inclusive sozinho (D3-04)

### O que acontece na tela ao iniciar, nesta fase sem partida sincronizada?

| Option | Description | Selected |
|--------|-------------|----------|
| Cada máquina cria o World e compara o hash do tick 0 | startRun entrega RunConfig; createWorld + generateArena local; hashWorld do tick 0 à autoridade; run começa local sem sincronia | ✓ |
| Só fecha a sala e mostra um aviso | Slots atribuídos, aviso "fase 4", volta ao lobby; prova só por teste | |
| Você decide | | |

**User's choice:** Cada máquina cria o World e compara o hash do tick 0 (D3-05)

### A cor da roupa viaja no lobby nesta fase?

| Option | Description | Selected |
|--------|-------------|----------|
| Sim, como dado de apresentação no lobbyState | Fora do RunConfig e do sim; remotos já aparecem na cor certa na fase 4 | ✓ |
| Não, só nome e classe | Cor fica para CONTA-06 (fase 6) | |
| Você decide | | |

**User's choice:** Sim, como dado de apresentação no lobbyState (D3-06)

### Existe entrada por link além do código?

| Option | Description | Selected |
|--------|-------------|----------|
| Código e link | `?sala=CODIGO`; só o código na URL; "copiar link" no lobby; cuidado com precache/start_url | ✓ |
| Só código nesta fase | Link depois; menos superfície no service worker | |
| Você decide | | |

**User's choice:** Código e link (D3-07)

### Convidado não conecta com a autoridade nem pelo relay?

| Option | Description | Selected |
|--------|-------------|----------|
| Só ele falha, com mensagem e "tentar de novo" | Mensagem distinta de lag; a sala nunca cai por causa de um convidado | ✓ |
| A sala inteira avisa e espera | Todos veem que fulano não conseguiu; mais estado no lobbyState | |
| Você decide | | |

**User's choice:** Só ele falha, com mensagem e "tentar de novo" (D3-08)

**Notes:** Na checagem "mais ou próxima", o usuário pediu uma segunda rodada (perguntas 5 a 8)
e depois seguiu, deixando alfabeto/tamanho do código, TTL da sala ociosa e texto das telas a
critério do planejador.

---

## Signaling e TURN sem conta

### O que identifica um peer no upgrade do WebSocket sem login?

| Option | Description | Selected |
|--------|-------------|----------|
| Só origem e rate limit; o código protege a sala | Origin + limite por IP; peer se apresenta com ULID local e nome como dado auto-declarado; ponto único para a fase 6 plugar sessão | ✓ |
| Ticket de uso único já nesta fase | `/api/rt/ticket` sem auth; formato pronto para origem dividida | |
| Você decide | | |

**User's choice:** Só origem e rate limit; o código protege a sala (D3-09)

### Como o cliente recebe a credencial efêmera de TURN sem conta?

| Option | Description | Selected |
|--------|-------------|----------|
| Pelo próprio signaling, ao criar ou entrar na sala | username/credential com TTL de 1 h amarrados à sala; sem endpoint HTTP aberto; quotas no coturn | ✓ |
| Endpoint GET /api/rt/ice com rate limit por IP | Como a pesquisa esboça, sem requireSession até a fase 6 | |
| Você decide | | |

**User's choice:** Pelo próprio signaling (D3-10)

### O WebSocket de signaling continua aberto durante a partida?

| Option | Description | Selected |
|--------|-------------|----------|
| Continua vivo durante a partida | Canal de ICE restart/reconexão (fase 5) e de telemetria ICE; keepalive | ✓ |
| Fecha depois que o WebRTC conecta | "Casa e esquece" literal; a fase 5 teria que reencontrar uma sala morta | |
| Você decide | | |

**User's choice:** Continua vivo durante a partida (D3-11)

### apps/web sai da raiz agora?

| Option | Description | Selected |
|--------|-------------|----------|
| Fica na raiz; reavaliar depois do primeiro deploy real | 02-04/02-12 pendentes; src/net/ nasce na raiz | ✓ |
| Move agora para apps/web | Uma mudança estrutural só, antes de o código de rede crescer | |
| Você decide | | |

**User's choice:** Fica na raiz (D3-12)

**Notes:** As duas últimas perguntas foram feitas juntas por serem independentes. Ao seguir
para a próxima área, o usuário aceitou os padrões da pesquisa para o que sobrou: coturn em
3478/5349 sem disputar a 443, STUN público como candidato adicional, perfect negotiation com
a autoridade impolida, e a forma da flag de debug do relay a critério do planejador.

---

## Ping, rota e telemetria ICE

### O "ping" da tela é medido como?

| Option | Description | Selected |
|--------|-------------|----------|
| Mensagem ping/pong própria no canal unreliable | Mede o caminho que input e snapshot usam; ping e pong entram no fim da MSG_KIND com o golden no mesmo commit | ✓ |
| getStats() do RTCPeerConnection | Nada entra no protocolo; campo irregular entre navegadores | |
| Os dois | Ping próprio na tela, getStats() só na telemetria | |

**User's choice:** Mensagem ping/pong própria no canal unreliable (D3-13)

### Onde o desfecho ICE fica registrado?

| Option | Description | Selected |
|--------|-------------|----------|
| Tabela no SQLite, reportada pelo signaling | Linha append-only por conexão; sem PII além do ULID local; segunda tabela via migrator | ✓ |
| Só log estruturado no journald | pino + journalctl; retenção limitada | |
| Você decide | | |

**User's choice:** Tabela no SQLite, reportada pelo signaling (D3-14)

### Onde a tela mostra ping e rota nesta fase?

| Option | Description | Selected |
|--------|-------------|----------|
| No lobby por jogador, e um indicador discreto na run | Lobby por slot; indicador num canto que a fase 4 herda e a fase 5 estende | ✓ |
| Só no lobby nesta fase | Indicador na run fica para a fase 4 | |
| Você decide | | |

**User's choice:** No lobby por jogador, e um indicador discreto na run (D3-15)

### O que um convidado vê sobre os outros?

| Option | Description | Selected |
|--------|-------------|----------|
| A autoridade relaya o resumo no lobbyState | Ping e rota de cada slot, a cada segundo | ✓ |
| Cada um só vê o próprio | Menos tráfego; problema reportado por voz | |
| Você decide | | |

**User's choice:** A autoridade relaya o resumo no lobbyState (D3-16)

**Notes:** As três últimas perguntas foram feitas juntas por serem independentes. Ao seguir,
o usuário aceitou os padrões oferecidos: falha de conexão também gera linha na tabela, a tela
mostra só direto/relay e a tabela guarda o par de candidatos completo.

---

## Codec do snapshot

### A camada estática viaja no fio ou é derivada da seed?

| Option | Description | Selected |
|--------|-------------|----------|
| Derivada da seed em cada cliente | startRun leva só o RunConfig; mesmo caminho do replay (D-11); hash do tick 0 é a prova | ✓ |
| Enviada uma vez no join, pelo canal reliable | Dois caminhos para o mesmo mundo inicial | |
| Você decide | | |

**User's choice:** Derivada da seed em cada cliente (D3-17)

### Delta contra baseline nesta fase ou na fase 4?

| Option | Description | Selected |
|--------|-------------|----------|
| Formato com baseline e ack decididos aqui; só o snapshot completo implementado | Cabeçalho com tick e tick da baseline (0 = completo); encoder de delta na fase 4 | ✓ |
| Completo e delta nesta fase | Codec pronto sem partida para exercitá-lo | |
| Você decide | | |

**User's choice:** Formato com baseline e ack decididos aqui; só o snapshot completo implementado (D3-18)

### O que acontece quando um snapshot não cabe em 16 KiB?

| Option | Description | Selected |
|--------|-------------|----------|
| Particionar por classe de entidade em mensagens independentes | Partes auto-contidas com tick e índice, sem remontagem; bench por parte e teto de endless declarado | ✓ |
| Priorizar e adiar | Manda o que cabe; o resto no próximo tick | |
| Fragmentar e remontar por conta própria | Perder um pedaço perde o snapshot inteiro | |

**User's choice:** Particionar por classe de entidade em mensagens independentes (D3-19)

### Como o bench do CI constrói o World de wave 16?

| Option | Description | Selected |
|--------|-------------|----------|
| Mundo sintético de pior caso pelas fórmulas do próprio sim | startNextWave (4 + wave*3, ×1,6 swarm, mais chefe); teste secundário com run real abaixo do sintético | ✓ |
| Run real dirigida até a wave 16 | Fixture jogado; minutos de ticks; pior caso depende da seed | |
| Você decide | | |

**User's choice:** Mundo sintético de pior caso pelas fórmulas do próprio sim (D3-20)

**Notes:** As quatro perguntas foram feitas juntas por serem independentes. Na checagem
final o usuário escolheu "Pronto para o contexto", deixando a posição do jogador local em
float32, o lugar do codec e a normalização de -0 a critério do planejador com o padrão da
pesquisa.

---

## Claude's Discretion

Nenhuma pergunta recebeu "Você decide". Os itens abaixo ficaram a critério do planejador
por aceitação implícita ao seguir de área (ver Notes acima) ou por não terem sido levantados:

- Alfabeto e tamanho exato do código de sala; geração e colisão
- TTL de sala ociosa e intervalo de keepalive
- Vocabulário e validação do signaling (zod só no servidor, se usado)
- `Transport` + `local.ts` + `lossy.ts`
- Perfect negotiation; `bundlePolicy`; flag de debug do relay
- Coturn em 3478/5349, sem 443; STUN público adicional; unit com `MemoryMax`
- Implementação do rate limit
- Layout binário exato do snapshot; jogador local em float32; normalização de -0 no codec
- Tabelas de enum de entidade a congelar em `packages/protocol`
- Onde o codec mora
- Frequência do ping e janela de média
- Texto e layout das telas (`/gsd:ui-phase 3` como opção)
- Ordem interna da fase (VPS por último; append de ping/pong com golden no mesmo commit)

## Deferred Ideas

- Migração de autoridade (recusada)
- "Pronto" e timer de segurança no lobby (recusados; o timer aparece em COOP-06)
- Ticket de uso único para o WebSocket (fase 6 ou origem dividida)
- Endpoint `GET /api/rt/ice` (não construído)
- TURN sobre TLS na porta 443 (dívida)
- Encoder de delta, anel de baselines, ack e backpressure (fase 4)
- `apps/web` (quarta vez; depois do primeiro deploy real)
- Reconexão e ICE restart (fase 5)
- Cor da roupa vinda da conta (fase 6)
- `getStats()` na telemetria (campo futuro na tabela, se a fase 4 quiser)
- Interest management (fora do marco)

Nenhum item de escopo criativo apareceu na discussão.
