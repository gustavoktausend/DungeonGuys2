# Phase 1: Formato e costuras - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisões estão em `01-CONTEXT.md` — este log preserva as alternativas consideradas.

**Date:** 2026-08-31
**Phase:** 1-Formato e costuras
**Areas discussed:** Trigonometria e quantização, Fronteira do `SIM_VERSION`, Formato do
artefato de run, Monorepo agora ou depois, Spec técnica de assets, Ledger de soul gold,
Decisões escritas não implementadas

**Modo:** discuss (interativo, sem flags). Sete áreas apresentadas em duas perguntas de
múltipla escolha; o usuário selecionou **todas as sete**.

---

## Trigonometria e quantização

### Implementação de `sin`, `cos` e `atan2`

| Option | Description | Selected |
|--------|-------------|----------|
| Polinômio portado (fdlibm) | Port em JS puro do FreeBSD msun / Go. ~550 LOC, bit-exato em qualquer motor ES2015+, aceita qualquer ângulo em radianos; 30 call sites viram troca de import, sem retuning. Custo 2-4 dias | ✓ |
| Tabela de lookup + ângulo uint16 | Ângulo vira uint16 (0,0055°), tabela literal commitada. Mais rápido e encolhe o log, mas exige retuning de mira e `atan2` fica em aberto | |
| Medir primeiro, decidir depois | Bench dos laços quentes com as duas implementações antes de escolher | |

**Notas:** a escolha cobre também os ângulos internos do sim (spread, anéis de spawn, tiro
de inimigo, padrão de chefe) que não vêm de input nenhum — que a tabela indexada por input
quantizado não cobriria sozinha.

### Mecanismo de quantização do `aim`

| Option | Description | Selected |
|--------|-------------|----------|
| Radianos arredondados ao passo | `aim` continua `number`; `app/input.ts` arredonda ao passo de 2π/65536 antes de entregar; o log grava o uint16 e a volta é bit-idêntica por IEEE-754 | ✓ |
| `aim` vira uint16 no tipo | Tipo mais honesto, log trivial; custo é duas unidades circulando por `player.facing` e `combat.ts` | |
| Passo mais grosso (1/1024) | Log menor; 0,35° a 400px é ~2,4px de desvio, perceptível em tiro longo | |

### Quantização do `move`

| Option | Description | Selected |
|--------|-------------|----------|
| int8 por componente | `[-127,127]`, valor `n/127`. Fecha o pacote de 6 bytes e tira `Math.hypot` do caminho do dado gravado | ✓ |
| Ângulo + magnitude | Direção exata na diagonal; custo é `move` virar polar e reconstruir no laço quente | |
| Só quantizar o `aim` | Menos mudança, mas contradiz "quantizado na captura" e engorda o log | |

### Preenchimento de buracos no log

| Option | Description | Selected |
|--------|-------------|----------|
| Repetir o último input | O jogador continua fazendo o que fazia; é o que a predição já assume | ✓ |
| Input neutro | Mais seguro contra peer sumido; engasga visivelmente com jitter normal | |
| Repetir por N ticks, depois neutro | Cobre jitter sem deixar peer morto andando; custo é mais um número de tuning dentro do formato gravado | |

### `InputState` transmitido vs recalculado

| Option | Description | Selected |
|--------|-------------|----------|
| Sim — regra escrita do protocolo | O `InputState` quantizado é o que trafega e o que entra no log; nenhum peer recalcula mira ou movimento | ✓ |
| Sim, e mover a mira para dentro do sim | Auto-aim determinístico, mas puxa lista de inimigos e configuração para dentro de `sim/` — escopo novo | |
| Deixar para a fase 3 | Risco de a decisão ser retomada no calor do transporte | |

---

## Fronteira do `SIM_VERSION`

### Escopo do hash

| Option | Description | Selected |
|--------|-------------|----------|
| Só a simulação (`sim/` + `defs/`) | Cobre o que decide o resultado do replay; HUD, áudio e sprite não fecham temporada; rebalancear inimigo fecha, e isso é correto | ✓ |
| Simulação + protocolo | Uma versão só; custo é enum append-only fechar temporada sem razão física | |
| O bundle do jogo inteiro | Máxima segurança; typo na tela de opções encerra a temporada | |

### O que exatamente é hasheado

| Option | Description | Selected |
|--------|-------------|----------|
| Bundle emitido, build reproduzível | Hash do bundle de `packages/sim` com build determinístico e toolchain pinada. Literal ao FORM-03; subir Vite/TS fecha temporada como evento agendado | ✓ |
| Fonte normalizado | Imune a upgrade de toolchain; não pega mudança de compilador que altere semântica, e contradiz a letra de FORM-03 | |
| Bundle + toolchain no hash | Mais explícito; mais um lugar para divergir entre dev e CI | |

### Comportamento no mismatch

| Option | Description | Selected |
|--------|-------------|----------|
| Recusa sempre, com a razão na tela | Uma regra só, sem modo especial; testar co-op local exige o mesmo build nas duas abas, que é o que faz o teste valer | ✓ |
| Recusa, com bypass de dev | Conveniente para testar builds lado a lado; um bypass que existe vaza para produção | |
| Avisa mas deixa entrar | Menos atrito; a dessincronização volta e aparece 40 s depois como "o jogo bugou" | |

### `PROTOCOL_VERSION`

| Option | Description | Selected |
|--------|-------------|----------|
| Separado, definido agora | Ciclos de vida distintos; nasce em `packages/protocol` com os enums de FORM-11 | ✓ |
| Separado, mas só na fase 3 | Evita commitar número que não versiona nada; FORM-11 ficaria sem casa | |
| Uma versão só | Menos conceito; prende mudança de física a queda de conexão sem necessidade | |

---

## Formato do artefato de run

### Encoding

| Option | Description | Selected |
|--------|-------------|----------|
| Envelope JSON + log em base64 | Metadados legíveis a olho, log compacto (20-40 KB gzipado por run de 20 min) | ✓ |
| Tudo JSON | Máxima inspecionabilidade; 432 KB crus por jogador não fecham no orçamento de 100 KB | |
| Tudo binário | Menor e mais rápido; nada inspecionável sem escrever um decodificador antes | |

### Ponto de partida do replay

| Option | Description | Selected |
|--------|-------------|----------|
| Da seed | `createWorld` + `generateArena` reconstruídos; prova o determinismo do setup junto | ✓ |
| Snapshot inicial embutido | Imune a mudança na geração de arena; abre mão de verificar o setup | |
| Seed + checkpoints periódicos | Permitiria verificação amostrada na fase 9; campo a mais para um uso talvez inexistente | |

**Consequência registrada:** ao recusar os checkpoints, a verificação amostrada deixa de ser
opção para a fase 9 — o teto de endless terá que ser explícito.

### Codificação do log

| Option | Description | Selected |
|--------|-------------|----------|
| Por tick, só o que mudou | Delta + RLE; o input muda 5-10x/s, não 60. Ordem canônica do `RunConfig` dentro do tick | ✓ |
| Um stream por jogador | Mais fácil de gerar em tempo real; erro de alinhamento entre streams é invisível até o hash divergir | |
| 6 bytes fixos por tick por jogador | Posição no arquivo é função do tick; 432 KB por jogador | |

### `world.players`

| Option | Description | Selected |
|--------|-------------|----------|
| Record fica; `step()` itera o `RunConfig` | Serializa por JSON sem caso especial; mudança de duas linhas em `step.ts` | ✓ |
| Vira `Map` | Ordem garantida pelo tipo; `Map` não sobrevive a `JSON.stringify` | |
| Vira array indexado por slot | Ordem é a estrutura; acesso por id vira busca e muda call sites em `combat.ts`, `loot.ts`, `xp.ts` | |

---

## Monorepo agora ou depois

### Extrair workspaces nesta fase?

| Option | Description | Selected |
|--------|-------------|----------|
| Sim, extrair agora | Puxado pela decisão do `SIM_VERSION`: sem pacote separado, "o artefato buildado da sim" não existe | ✓ |
| Só provar headless, extrair depois | Menos churn agora; o SCC de 8 módulos só cresce, e o `SIM_VERSION` precisaria de outra definição | |
| Meio-termo: `src/protocol/` só | Entrega os requisitos dependentes com menos churn; o layout ainda acontece um dia, com mais código | |

### Escopo do rearranjo

| Option | Description | Selected |
|--------|-------------|----------|
| Só os packages; app fica na raiz | A fase 2 mexe em `base`, SW e deploy — mover o app agora seria migrar duas coisas na mesma semana | ✓ |
| Layout completo (`apps/web`) | Layout final desde o começo; toca tudo o que a fase 2 também vai tocar | |
| Packages + `apps/server` vazio | Ganho pequeno; um diretório vazio não impede ninguém de criar outro | |

### Imposição da pureza

| Option | Description | Selected |
|--------|-------------|----------|
| tsconfig sem `DOM` + lint + teste | Três guardas independentes; o compilador recusa `window`/`document`, o lint cobre o que `lib` não pega | ✓ |
| Só as guardas atuais | Menos configuração; abre mão da guarda impossível de contornar bem quando ela sai de graça | |
| tsconfig sem DOM, aposentando o lint | Menos duplicação; perderia `Math.random`, `Date.now` e os imports proibidos | |

### Ordem interna

| Option | Description | Selected |
|--------|-------------|----------|
| Primeiro de tudo | `math.ts` nasce no lugar definitivo; hashes-ouro refeitos uma vez só; é a mudança mais mecânica | ✓ |
| Depois do corte do SCC | Diagnostica o ciclo nos imports atuais; atrasa a parte com prazo real | |
| Por último, depois do `math.ts` | Trabalho difícil na estrutura conhecida; a extração encosta na fase 2, que mexe no build | |

---

## Spec técnica de assets

### Unidade lógica

| Option | Description | Selected |
|--------|-------------|----------|
| 1 unidade = 1 pixel | Piso continua 2400x1600 px (~15 MB); nenhuma constante de `sim/` muda de significado | ✓ |
| 1 unidade = 2 pixels | Dobro da densidade; ~61 MB de canvas — o navegador mata sem avisar em móvel | |
| Piso em chunks sob demanda | Libera a densidade da memória; é trabalho de `render/` que a fase 1 não toca | |

### Resolução base do personagem

| Option | Description | Selected |
|--------|-------------|----------|
| 32x48, escala 1 | Mesmo espaço na tela que hoje, 4x o detalhe; `SPRITE_SCALE` sai do código | ✓ |
| 16x28, escala 2 (como hoje) | Zero risco; abre mão do detalhe que motivou trocar a arte | |
| 48x72, escala 1 | Muito mais presença; encolhe o campo de visão, piorando o que COOP-04 existe para consertar | |

### Tile de desenho

| Option | Description | Selected |
|--------|-------------|----------|
| 32 (75x50 tiles) | Tiles 32x32 nativos; divide exato; sem mexer em `render/tilemap.ts` nem no orçamento do piso | ✓ |
| 40 (60x40 tiles) | Menos repetição; não é potência de dois, desconfortável para grade de sheet | |
| 80 (30x20 tiles) | Leitura de chão muito diferente; muito mais trabalho de arte por unidade | |

**Nota:** 48 e 64 foram descartados por não dividirem 1600 exato.

### Animações exigidas

| Option | Description | Selected |
|--------|-------------|----------|
| Só idle + run | Exatamente o que `render/entities.ts` desenha; menor lead time; contagem de quadros no manifesto | ✓ |
| idle + run + hit + death | Muito mais expressivo; dobra o volume de arte e empurra render novo para a fase 7 | |
| idle + run + attack | Meio-termo; casar animação com `fireRate` variável é trabalho de render real | |

### Paleta

| Option | Description | Selected |
|--------|-------------|----------|
| Rampa de recolor obrigatória | Paleta livre, rampa de roupa declarada no manifesto e validada; preserva a cor por jogador que CONTA-06 precisa | ✓ |
| Paleta fixa commitada | Coesão garantida; amarra o artista antes de a direção existir | |
| Paleta livre, sem recolor | Máxima liberdade; mata a forma como quatro amigos se distinguem na tela | |

### Forma do manifesto

| Option | Description | Selected |
|--------|-------------|----------|
| JSON por sheet, schema versionado | Validador em `tools/assets/` no CI daqui; sheets independentes não bloqueiam uns aos outros | ✓ |
| Um manifesto único | Impossível dessincronizar; dois lotes paralelos colidem no mesmo arquivo entre sessões | |
| Convenção de nomes, sem manifesto | Validador é uma regex; pivô, rampa e hitbox não cabem num nome de arquivo | |

### Hitbox

| Option | Description | Selected |
|--------|-------------|----------|
| `sim/defs` manda; CI confere | Hitbox continua sendo código versionado pelo `SIM_VERSION`; validador recusa sprite que não a cubra | ✓ |
| Manifesto manda | Nunca desalinha; o agente de arte passaria a controlar balanceamento e o `SIM_VERSION` dependeria de arte | |
| Hitbox = caixa do sprite | Nada a sincronizar; aura ou chapéu viram hitbox de graça | |

### Entrega dos arquivos

| Option | Description | Selected |
|--------|-------------|----------|
| Cópia commitada, atualizada por PR | Build offline e reproduzível; validador roda no PR; custo é binário no histórico | ✓ |
| Submódulo git | Histórico limpo; fonte confiável de build quebrado em CI | |
| Pacote versionado | Versão explícita; exige processo novo num repositório que nem começou | |

---

## Ledger de soul gold

### Saldo existente

| Option | Description | Selected |
|--------|-------------|----------|
| Vira evento de saldo herdado | Migração idempotente, exercita o caminho antes de valer dinheiro; ~20 linhas para sempre | |
| Descartar e começar do zero | O jogo nunca foi publicado sob domínio próprio; zero código de migração | ✓ |
| Manter os dois em paralelo | Rede de segurança; duas fontes de verdade para a mesma moeda é o próprio bug | |

**Notas:** escolhido sabendo que abre mão de exercitar o caminho de migração antecipadamente.

### Origem do `eventId`

| Option | Description | Selected |
|--------|-------------|----------|
| ULID gerado no cliente | Funciona offline, uma regra para qualquer origem, carrega ordem temporal | ✓ |
| Derivado de (runId, tick, tipo) | Verificável por replay; exige `runId` também offline e não cobre concessões fora de run | |
| Id emitido pelo servidor | Impossível forjar; mata o offline como fonte de progresso, contra CONTA-04 | |

### O gasto

| Option | Description | Selected |
|--------|-------------|----------|
| Sim, evento negativo no mesmo ledger | Saldo = soma; faz o critério 3 da fase 6 funcionar sem caso especial; dá o log de auditoria | ✓ |
| Não — os níveis do forge são o gasto | Fundem por máximo, nunca conflitam; mudar a tabela de preços reescreveria o passado | |
| Dois ledgers separados | Separa auditorias; duas listas para manter, sincronizar e compactar | |

### Armazenamento

| Option | Description | Selected |
|--------|-------------|----------|
| Chave própria, com marca d'água | `dungeonguys2_ledger_v1`; confirmados colapsam num evento consolidado, pendentes ficam individuais | ✓ |
| Chave própria, sem compactação | Auditoria completa; regra de compactação é formato, e formato adiado é migração | |
| Dentro do save existente | Uma chave só; array append-only no meio de campos que fundem por máximo e união | |

---

## Decisões escritas, não implementadas

### Onde moram

| Option | Description | Selected |
|--------|-------------|----------|
| ADRs numerados em `docs/adr/` | Um arquivo por decisão; citável nominalmente pelas fases 5, 6, 8 e 9 | ✓ |
| Um `docs/FORMATOS-V1.md` | Segue a convenção de `DECISOES-MARCO0.md`; revisar uma decisão mexe no arquivo de todas | |
| Dentro do `.planning/` | Ao lado do contexto dos agentes; `.planning/` é arquivado no fim do marco | |

### Quais perguntas abertas esta fase fecha (múltipla escolha)

| Option | Description | Selected |
|--------|-------------|----------|
| Categorias do placar | Modo x tamanho x perfil e o esquema `(temporada, SIM_VERSION)`; já alocado aqui pelo roadmap | ✓ |
| Teto do forge em runs rankeadas | Decide se o `RunConfig` carrega marcador de perfil e se o placar tem coluna | ✓ |
| Política de queda do host | A mais urgente do STATE.md; o formato do checkpoint é dado gravado | ✓ |
| Quem entra numa missão destravada | Formato de progressão; corrigir depois é migração | ✓ |

**Notas:** o usuário fechou **todas as quatro**. A quinta pergunta aberta (teto de duração
para endless no ranking) permanece aberta, agora restrita a teto explícito por causa de D-11.

### Merge das `settings`

| Option | Description | Selected |
|--------|-------------|----------|
| Identidade sincroniza, preferências não | `name`/`colors` por última escrita; `volume`, `mute`, `autoAim`, `shake`, `mode` por aparelho | ✓ |
| Tudo sincroniza | Uma regra só; abrir no celular estragaria a configuração do desktop | |
| Nada de settings sincroniza | Zero conflito; jogador redigita nome e cores em cada aparelho, contra CONTA-06 | |

### `accountId` da conta local

| Option | Description | Selected |
|--------|-------------|----------|
| ULID local marcado como local | Login troca por `accountId` do servidor e registra a origem; claim duplo é detectável | ✓ |
| Sem `accountId` até haver servidor | Nenhum id órfão; eventos do ledger pré-login ficam sem dono | |
| Espaço de id separado para local | Impossível confundir; seria um quarto espaço num requisito que existe para congelar três | |

### Substância das perguntas fechadas

**Teto do forge em runs rankeadas**

| Option | Description | Selected |
|--------|-------------|----------|
| Perfil normalizado — forge desligado | Board comparável, jogador novo compete no dia 1, superfície de verificação mínima; apaga a meta-progressão da competição | ✓ |
| Teto no forge | Preserva a meta-progressão; servidor precisa validar forge e o novato ainda começa atrás | |
| Dois perfis rankeados | Ninguém perde nada; num jogo fechado entre amigos, dois boards significam metade das entradas em cada | |

**Política de queda do host**

| Option | Description | Selected |
|--------|-------------|----------|
| Checkpoint por wave concluída | Perde só a wave em andamento; é o que o critério 5 da fase 6 já promete literalmente | ✓ |
| Creditar a run parcial | Mais generoso; exige o log da autoridade em cada cliente e reconciliar quatro submissões | |
| Migração de host | Sem perda alguma; caro, e o caminho só é exercitado quando algo já deu errado | |

**Quem entra numa missão destravada**

| Option | Description | Selected |
|--------|-------------|----------|
| Cadeia do criador define; todos creditados | Convidado entra e é creditado; "carregar" um amigo é feature aceita por escrito | ✓ |
| Só entra quem já destravou | Progressão significa exatamente o que cada um jogou; amigo novo não joga nada com o grupo | |
| Convidado entra, mas sem crédito | Ninguém é bloqueado; o convidado joga a missão inteira e teria que repeti-la | |

---

## Claude's Discretion

Registrado em `01-CONTEXT.md` sob `### Claude's Discretion`. Em resumo: CI de teste e
versionamento dos hashes-ouro cross-engine; como o corte da aresta `xp -> run` é feito;
como `updateBossPattern` ganha cobertura; a extração de `app/stepper.ts`; a forma de
`world.objectives`; a promoção de `hashWorld` para `serialize.ts` com a normalização de
`-0`; o JSON Schema do manifesto e a estrutura de `tools/assets/`; e a numeração dos ADRs.

Ao final, foi oferecida uma oitava área ("CI e hashes-ouro") e o usuário optou por deixá-la
com o pesquisador e o planejador.

## Deferred Ideas

Nenhum item de escopo criativo apareceu — a discussão ficou dentro da fronteira da fase.
O que está na seção `<deferred>` do `01-CONTEXT.md` são consequências das decisões tomadas
(portas fechadas), não ideias adiadas.
