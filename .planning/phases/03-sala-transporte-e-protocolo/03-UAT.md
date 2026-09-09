---
status: partial
phase: 03-sala-transporte-e-protocolo
source: 03-01-SUMMARY.md, 03-02-SUMMARY.md, 03-03-SUMMARY.md, 03-04-SUMMARY.md, 03-05-SUMMARY.md, 03-06-SUMMARY.md, 03-07-SUMMARY.md, 03-08-SUMMARY.md, 03-09-SUMMARY.md, 03-10-SUMMARY.md, 03-REVIEW-FIX.md
started: 2026-09-09T00:30:00Z
updated: 2026-09-09T00:30:00Z
mode: mvp
note: |
  Reverificação depois da correção da revisão de código (13/13, `349cb7d`). A `03-VERIFICATION.md`
  de 2026-09-08 é anterior aos fixes. Modo MVP: o goal da fase é prosa em português e não passa no
  validador de user story (molde inglês); a UAT segue a ORDEM do modo MVP (fluxo do usuário → checagens
  técnicas → cobertura) sem reescrever o goal de uma fase já executada.
  Receita local (Windows/PowerShell), abrir SEMPRE em http://localhost:5173 (DG2_ORIGIN padrão):
    Terminal 1:  $env:DG2_DB='./dev-signaling.db'; npx tsx apps/server/src/index.ts
    Terminal 2:  npm run dev
    Segundo jogador: janela anônima (localStorage próprio → nome/cor próprios).
---

## Current Test
<!-- OVERWRITE each test - shows where we are -->

[testing paused — 16 items outstanding; retomar pelo teste 1, cujo reporte está aberto]

## Tests

### 1. Cold Start Smoke Test
expected: Mate qualquer servidor antigo e apague ./dev-signaling.db (e -wal/-shm). No Terminal 1, rode `$env:DG2_DB='./dev-signaling.db'; npx tsx apps/server/src/index.ts`: o servidor sobe sem erro, roda as migrações, avisa UMA vez que DG2_TURN_SECRET está ausente (ICE só com STUN) e escuta em 8080. http://localhost:8080/api/health responde {"status":"ok"}. No Terminal 2, `npm run dev` serve o jogo em http://localhost:5173 e a tela inicial abre normalmente.
result: [pending]
reported: "ERR_CONNECTION_REFUSED" (2026-09-09; URL e saída dos terminais não informadas — sessão pausada antes da resposta)
diagnosis: |
  Reproduzido na máquina do Claude com a mesma receita: servidor sobe em ~2 s, loga só
  `turn-disabled`, `/api/health` responde `{"status":"ok","db":true,"release":"dev"}` por
  127.0.0.1 e por localhost. Assimetria encontrada: o signaling escuta SÓ em `127.0.0.1:8080`
  (apps/server/src/index.ts:88, `hostname: '127.0.0.1'`) e o Vite 7 escuta SÓ em `[::1]:5173`.
  `localhost` funciona nos dois (o navegador cai para a outra família), mas `127.0.0.1:5173`
  recusa e `[::1]:8080` recusa. Hipóteses abertas: URL com 127.0.0.1, ou abertura antes de o
  processo terminar de subir. Não é gap de código confirmado; retomar pedindo a URL exata e a
  saída dos dois terminais.

### 2. Entrada no fluxo — JOGAR COM AMIGOS
expected: Na tela inicial, logo abaixo do botão de começar, existe `◆ JOGAR COM AMIGOS`. Clicar abre a tela `SALA` com `▶ CRIAR SALA`, um separador "ou", o campo `— CÓDIGO DA SALA —` (placeholder ABC123, converte para maiúsculas ao digitar), `▶ ENTRAR` e `✕ VOLTAR`. `✕ VOLTAR` devolve à tela inicial.
result: [pending]

### 3. Criar sala — lobby sozinho
expected: Clicar `▶ CRIAR SALA` mostra "Conectando…" com os botões desabilitados por um instante e abre o `LOBBY`. Aparece um código de exatamente 6 caracteres, sem O, I, L nem U. Abaixo, o link `http://localhost:5173/?sala=CODIGO` com `COPIAR LINK`. Seu card mostra o boneco na sua cor, seu nome, sua classe e os chips `VOCÊ` e `CRIOU A SALA`; os outros 3 cards dizem `VAZIO`. Aparece a frase "Você está sozinho na sala. Pode iniciar assim mesmo." e `▶ INICIAR` está HABILITADO. Rótulo `MODO · CAMPANHA` (ou SEM FIM, conforme o modo escolhido na tela inicial). Não há botão/estado "pronto" nem contagem regressiva.
result: [pending]

### 4. Copiar link
expected: Clicar `COPIAR LINK` mostra "Link copiado." na linha de status do lobby. Colar em qualquer lugar dá exatamente `http://localhost:5173/?sala=CODIGO` — sem nenhuma outra query (mesmo que a página tenha sido aberta com `?ice=relay`, o link não a carrega).
result: [pending]

### 5. Código inválido e sala inexistente
expected: Numa janela anônima em http://localhost:5173, `◆ JOGAR COM AMIGOS`. Digitar um código com U/O/I/L ou com 5 caracteres e clicar `▶ ENTRAR` mostra "Código de 6 caracteres, sem O, I, L nem U." na hora, sem "Conectando…" (recusa local, sem ida ao servidor). Digitar um código válido na forma mas inexistente (ex.: `ZZZZZZ`) mostra "Não existe sala com esse código. Confira as letras e tente de novo.", os botões voltam a funcionar e o foco volta para o campo.
result: [pending]

### 6. Entrar pelo código — segunda janela
expected: Na janela anônima, digitar o código da sala em minúsculas e com hífen (ex.: `abc-123`) o campo normaliza para `ABC123`. `▶ ENTRAR` abre o LOBBY com o mesmo código. Nas DUAS janelas aparecem dois cards ocupados: na janela de quem criou, a linha de status diz "{NOME} entrou."; o card do outro mostra "conectando" e em poucos segundos `N ms · direto`, atualizando a cada 1 s. Na janela do convidado, o card de quem criou tem o chip `CRIOU A SALA` e o seu tem `VOCÊ`; o botão `▶ INICIAR` NÃO EXISTE na tela do convidado (não é cinza: está ausente), só `✕ SAIR DA SALA`.
result: [pending]

### 7. Deep link ?sala=
expected: Abrir numa terceira janela (outra anônima ou outro navegador) o link copiado `http://localhost:5173/?sala=CODIGO`: a tela `SALA` abre já com o código preenchido e o foco em `▶ ENTRAR`, mas NÃO entra sozinha (você confirma). A barra de endereço perde o `?sala=` logo depois de carregar. Clicar `▶ ENTRAR` põe o terceiro jogador no lobby, visível nas três janelas.
result: [pending]

### 8. Escolher classe no lobby
expected: Na janela do convidado, clicar outra classe em `— SUA CLASSE —` repinta o seu card na hora (boneco e nome da classe), sem spinner. Em até um segundo, a janela de quem criou mostra a nova classe no card daquele jogador. Escolher a MESMA classe que outro jogador é aceito sem aviso, marca ou cor diferente — só a cor da roupa e o nome distinguem os dois.
result: [pending]

### 9. Iniciar a run pelo lobby
expected: Quem criou clica `▶ INICIAR`. TODAS as janelas saem do lobby e entram na run ao mesmo tempo, com o HUD visível e a MESMA arena (mesmo layout de paredes/tiles) em todas. A tela `MUNDOS DIFERENTES` NÃO aparece em nenhuma. No canto inferior esquerdo há um badge de rede: no convidado `N ms · direto`; em quem criou `pior N ms · direto`. Cada um controla o próprio personagem; os personagens dos outros existem no mundo, mas o movimento deles ainda NÃO sincroniza (isso é a fase 4).
result: [pending]

### 10. Convidado sai da sala
expected: Voltem ao fluxo e montem uma sala nova com 2 jogadores. Na janela do convidado, `✕ SAIR DA SALA` volta para a tela `SALA` (o "menu" deste fluxo, não a tela inicial). Na janela de quem criou, a linha de status diz "{NOME} saiu.", o card volta a `VAZIO` e a sala CONTINUA de pé (a frase "Você está sozinho na sala…" reaparece e `▶ INICIAR` segue habilitado).
result: [pending]

### 11. Autoridade sai — confirmação dupla e sala encerrada
expected: Com um convidado na sala, quem criou clica `✕ SAIR DA SALA`: o rótulo vira `✕ SAIR MESMO? A SALA ACABA` e, se você não clicar de novo, volta ao rótulo original sozinho em ~3 s. Clicar a segunda vez encerra a sala: na janela do convidado abre a tela `SALA` por cima, com "Quem criou a sala saiu. A sala acabou.". Se o convidado tentar entrar de novo com o mesmo código logo em seguida, recebe "Essa sala não existe mais." (a sala fica em graça, mas não aceita mais entrada).
result: [pending]

### 12. Sala cheia (opcional — precisa de 5 janelas)
expected: Com 4 jogadores na sala (janela normal + 3 anônimas/perfis distintos), uma quinta janela que tenta entrar pelo código recebe "Essa sala já está com quatro jogadores." e fica na tela `SALA`. Pode pular se não tiver como abrir 5 contextos.
result: [pending]

### 13. Flag de relay forçado (debug) e falha de WebRTC
expected: Abrir http://localhost:5173/?ice=relay : a query some da barra, e um badge `RELAY FORÇADO (DEBUG) ✕` aparece fixo (inclusive com o lobby aberto). Recarregar a página SEM a query mantém o badge (a flag persiste). Criar uma sala nessa janela e entrar nela por uma anônima sem a flag: como não há servidor TURN em dev, a perna do convidado não fecha e ele vê "Não consegui conectar com quem criou a sala." com o botão `↺ TENTAR DE NOVO` (e `▶ ENTRAR` escondido enquanto o retry está na tela). Clicar o `✕` do badge recarrega a página e o badge não volta.
result: [pending]

### 14. Servidor de signaling fora do ar
expected: Encerre o servidor do Terminal 1 (Ctrl+C). Na tela `SALA`, clicar `▶ CRIAR SALA` mostra "Não consegui falar com o servidor. Tente de novo em instantes." e os botões voltam a funcionar. Subir o servidor de novo e clicar outra vez cria a sala normalmente, sem recarregar a página.
result: [pending]

### 15. Portões automatizados (executados pelo Claude nesta sessão)
expected: A partir de `main` limpo: `npm run build` sai 0 com `VERSIONS.sim` real (sem `unwired`); `npm test` verde (baseline 919 testes / 60 arquivos); `npm run lint` 0; `npm run bench:snapshot` com as seis partes abaixo de 16384 (wave16 1492/798/644); `npm run sim:version:verify` reprodutível e sensível; `npx playwright test --project=net` 1 passed (três contextos Chromium fechando uma sala real por loopback, com asserções de iceOutcome e da saída da autoridade).
result: pass
evidence: |
  Rodado em 2026-09-09 a partir de `main` (`e7d00ac`), árvore limpa. build 0 (`sw precache: 13 arquivos`);
  lint 0; bench `wave16 1492/798/644 | wave40 3316/1228/986 | teto=16384`; sim:version:verify ok
  (`sha256:cf4cf671d9d1e56c`, reprodutível em 3 builds e sensível); e2e net `1 passed (39,0 s)`.
  `npm test`: 918/919 — o único vermelho foi `tests/lint-coverage.test.ts` (WR-22) estourando o timeout
  de 5 s (9,67 s) na rodada completa; isolado, passa em 1,17 s (2/2). É a condição de ambiente já
  documentada em 03-REVIEW-FIX.md (ESLint `isPathIgnored` disputando CPU com a transformação paralela),
  não uma regressão de código. Dívida: subir o timeout desse caso ou serializá-lo.

### 16. Telemetria ICE gravada no banco de dev (executada pelo Claude após a sua sessão)
expected: Depois dos testes 6–13, `./dev-signaling.db` tem linhas em `ice_outcome`: uma por perna, com `route` (`direct`/`relay`/`unknown`) e `result` (`connected`/`failed`) — inclusive a perna que FALHOU no teste 13 (`route: unknown`, `result: failed`) — sala e assento resolvidos pelo socket, e NENHUMA coluna com IP ou porta de jogador.
result: [pending]

### 17. Regressões da revisão de código presentes na suíte
expected: A suíte contém e passa os testes de regressão dos três críticos e dos avisos: relay recusa `from` que não é o socket remetente (CR-01), uma sala por conexão + MAX_ROOMS (CR-02), portão de versão D-08 comparado no join com `hello` carregando versões (CR-03), cliente enviando `iceOutcome` (WR-01), `closed` na saída da autoridade e `roomClosed` na graça (WR-02), `try/catch` em handle() (WR-03), fila de saída morrendo com o socket (WR-04), mapeamento de falhas (WR-05), modo no lobbyState (WR-06), accountId por getRandomValues (WR-07), perna falha removida (WR-08), `turns:` fora da lista e deny-list com 11 faixas (WR-09), username TURN com tag HMAC (WR-10).
result: pass
evidence: |
  Conferido em 2026-09-09 por grep + suíte verde: `tests/server-signaling.test.ts:434` ("recusa um offer
  cujo from não é o remetente… (CR-01)"), `:334` e `:352` (join/create recusados com simVersion e
  protocolVersion, D-08/CR-03); `tests/net/room.spec.ts:100-150` espera `server.outcomes` chegar a 2
  (WR-01, cliente envia iceOutcome); WR-02..WR-10 citados em tests/room-ui, rtc-shape, server-rooms,
  server-signaling, net-signaling, lobby, run-config-lobby, ops-config, turn. Todos dentro dos 918
  verdes da rodada (ver teste 15).

### 18. Cobertura — critério 3 (SALA-04): relay real contra NAT residencial
expected: A sala fecha entre jogadores atrás de NAT residencial brasileiro, incluindo pelo caminho de relay (coturn real na VPS, exercitado sob a flag de debug). Só pode ser verificado com a VPS (02-04 → 02-12 → 03-11).
result: [pending]

## Summary

total: 18
passed: 2
issues: 0
pending: 16
skipped: 0
blocked: 0

## Gaps

[none yet]
