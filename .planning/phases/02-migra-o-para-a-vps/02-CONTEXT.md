# Phase 2: Migração para a VPS - Context

**Gathered:** 2026-08-31
**Status:** Ready for planning

> Rótulos de estrutura ficam em inglês porque são lidos por ferramenta.
> O conteúdo é em português, como o resto dos documentos do projeto.
>
> **Convenção de numeração:** as decisões desta fase são `D2-01` a `D2-17`. As decisões
> da fase 1 são citadas como `D-nn (fase 1)` para que nunca se confundam.

<domain>
## Phase Boundary

Esta fase tira o jogo do GitHub Pages e o põe na VPS própria, sob domínio único com TLS,
exercitando deploy, service worker, supervisão de processo e backup **enquanto a única
coisa em risco é um single-player que já funciona**. É a aplicação literal da regra do
roadmap: nunca migrar infra e estrear rede na mesma semana.

**Requisitos cobertos:** INFRA-01, INFRA-02, INFRA-03, INFRA-04 (4 requisitos).

**Fora do escopo desta fase, explicitamente:**

- **Zero linha de rede de jogo.** Sala, código de sala, signaling WebSocket, WebRTC,
  coturn/TURN e qualquer protocolo de fio são a **fase 3**. O `apps/server` que nasce aqui
  serve `/health` e nada mais.
- **Nenhuma rota de negócio nem autenticação.** Better Auth, login, sessão, cookie e as
  tabelas `user`/`session`/`account`/`verification` são a **fase 6**.
- **Nenhuma leitura ou escrita de progresso pela rede.** O ledger que ganha tabela aqui
  continua vivendo no `localStorage` do cliente (`dungeonguys2_ledger_v1`, D-29 da fase 1);
  a tabela existe para ter o que fazer backup e o que restaurar, não para ser usada.
- **Nenhuma mudança em `packages/sim`.** O `SIM_VERSION` não se move nesta fase — se
  mover, alguém mexeu onde não devia.
- **Nenhuma mudança de arte, HUD ou balanceamento.** A única UI nova é o aviso de
  atualização de D2-09.

</domain>

<decisions>
## Implementation Decisions

### Servidor, banco e layout do monorepo

- **D2-01:** **`apps/server` nasce nesta fase, com banco real.** Um processo Node com
  `/health` e um SQLite criado por migração, supervisionado por systemd e alcançado pelo
  Caddy por reverse proxy. Motivo: INFRA-04 exige backup "verificado restaurando, não só
  gerando" — sem arquivo de banco não há o que restaurar, e adiar isso faria o primeiro
  processo Node subir no mesmo dia em que a rede estreia, que é exatamente o que esta fase
  existe para impedir.
- **D2-02:** **O esquema nasce mínimo: só o migrator do Kysely e a tabela do ledger**
  (`docs/adr/0010-soul-gold-ledger-append-only.md`) — `UNIQUE` no ULID, gasto como evento
  negativo, marca d'água de confirmação. **Não** se criam tabelas de perfil, run, replay,
  temporada nem placar: seriam especulativas por meses, e a chave estrangeira para a tabela
  `user` do Better Auth não pode ser desenhada antes de o Better Auth existir (fase 6).
- **D2-03:** **A restauração é um script repetível mais um ensaio anotado.** Um script em
  `tools/ops/` restaura o backup mais recente num diretório descartável e confere contagem
  de linhas e soma do ledger contra o banco vivo, imprimindo verde ou vermelho. Rodado uma
  vez nesta fase, com o resultado registrado em `docs/` (data, tempo até restaurar, o que
  faltou). Não vira timer recorrente: numa VPS sem plantão, automação silenciosa é mais uma
  coisa que quebra sem avisar.
- **D2-04:** **O monorepo ganha `apps/*`, mas só o servidor se muda.** `workspaces` passa a
  `["packages/*", "apps/*"]` e `apps/server` nasce com `package.json` próprio, confinando
  Hono, `better-sqlite3` e Kysely longe da raiz — onde `dependencies: {}` é a doutrina do
  jogo publicado. `src/`, `index.html` e `vite.config.ts` **ficam na raiz**: esta fase já
  move `base`, service worker e alvo de deploy, e mover o cliente junto é o que D-15 (fase
  1) recusou. Virar `apps/web` depois é `git mv` mais dois caminhos.

### Deploy e reversão

- **D2-05:** **O CI constrói e o CI empurra.** `deploy.yml` para de falar com o GitHub
  Pages e passa a fazer rsync sobre SSH para a VPS, depois de os portões do `ci.yml`
  passarem. Chave de deploy nos secrets do GitHub, usuário sem shell, diretório restrito.
  Consequência que decide a escolha: **o que é publicado é sempre o que passou no portão
  cross-engine** — não existe caminho para publicar um `dist/` da máquina de alguém.
- **D2-06:** **Releases por sha com symlink atômico.** `/srv/dg2/releases/<sha>/` recebe o
  rsync; `current` é um symlink e o Caddy serve por ele. Publicar é trocar o symlink;
  reverter é trocar de volta — um comando, sem rede, sem rebuild, funcionando com o GitHub
  fora do ar. Elimina também a janela de `index.html` novo com `assets/` velho.
- **D2-07:** **A migração roda no start do serviço, e é sempre aditiva.** `dg2.service`
  executa o migrator do Kysely antes de aceitar requisição. O banco mora em
  `/var/lib/dg2/`, **fora da árvore de releases**, então reverter o symlink não toca no
  dado. Regra escrita que torna o rollback seguro: **nenhuma migração faz `DROP` ou rename
  na mesma versão** — a versão anterior tem de continuar funcionando contra o esquema novo.
- **D2-08:** **Todo push na `main` que passar no CI publica.** `main` é sempre o que está no
  ar, o que faz a reversão ser compreensível: o symlink anterior corresponde ao commit
  anterior. Publicar durante uma partida é risco nulo enquanto o jogo for single-player, e
  a partir da fase 3 quem cobre isso é D2-09, não o gatilho do deploy.

### Service worker, PWA e o fim do espelho

- **D2-09:** **Fim do `skipWaiting()` + `clients.claim()`.** O service worker novo instala e
  **espera**; o jogo mostra um aviso ("versão nova pronta — recarregar") e a troca só
  acontece **fora de partida** — e, da fase 3 em diante, também fora de sala. É a
  contrapartida direta de D-08 (fase 1): mandamos recusar versões diferentes sem bypass, e
  um deploy que troca a `sim/` sob os pés dos peers produziria essa recusa no meio do jogo.
- **D2-10:** **O precache é derivado do manifesto do build, e cobre tudo.** Um passo de
  build lê o `dist/` e injeta a lista real de arquivos no `sw.js`, incluindo
  `assets/index-<hash>.js` e `.css`, que hoje ninguém consegue precachear porque o nome muda
  a cada build. Instalação limpa deixa o jogo **100% jogável offline sem nunca ter sido
  jogado**, por 350 KB. Mata também o defeito que o próprio cabeçalho do `sw.js` documenta:
  lista escrita à mão que dá 404 e faz `cache.addAll` rejeitar a instalação inteira.
- **D2-11:** **A verificação de instalação, atualização e offline é só Playwright no CI** —
  instalação limpa, service worker antigo cedendo lugar ao novo, jogo abrindo com a rede
  desligada, e `/api/` nunca aparecendo no Cache Storage (INFRA-03 vira teste, não
  promessa). **Sem checklist manual em aparelho real.** Consequência aceita e registrada:
  PWA em iOS/Safari físico continua sem cobertura, e a caixa correspondente em
  `docs/PARIDADE.md` **permanece aberta** — o verificador da fase deve ler o critério 2 com
  essa ressalva, que é escolha deliberada e não lacuna.
- **D2-12:** **O GitHub Pages recebe um último deploy de despedida.** Uma página estática
  apontando para o domínio novo, e um `sw.js` que **se desregistra e limpa o próprio Cache
  Storage**. Motivo: um PWA instalado é offline-first — simplesmente desligar o Pages
  deixaria o jogo velho abrindo do cache, jogando e gravando progresso num domínio que não
  existe mais, sem nunca dizer isso ao jogador. Depois disso o Pages não recebe mais build
  (INFRA-01).

### Domínio, configuração e operação

- **D2-13:** **O domínio está comprado e o DNS já aponta para a VPS.** O plano pode assumir
  que o ACME do Caddy emite certificado no primeiro boot; passo de DNS e espera de
  propagação **não** estão no caminho crítico.
- **D2-14:** **Sem staging.** Uma caixa, um domínio. A confiança mora na reversão de D2-06
  mais os portões do CI. Enquanto o jogo for single-player e o público for o desenvolvedor,
  produção ainda é barata de quebrar — e é precisamente esse crédito que esta fase existe
  para gastar, antes de haver amigos numa sala.
- **D2-15:** **Configuração versionada, segredos e domínio na máquina.** `Caddyfile`,
  `dg2.service`, os scripts de deploy e o de restauração moram em `ops/` **dentro do
  repositório** — revisáveis em diff e reversíveis junto com o código. O nome do domínio e
  os segredos vivem em `/etc/dg2/env`, lidos pelo `EnvironmentFile` do systemd e por
  variável no `Caddyfile`. Consequências: reconstruir a caixa é clonar o repo mais
  restaurar um arquivo de env, e o repositório público nunca diz onde a máquina mora.
- **D2-16:** **Vigilância em duas pernas.** Um timer do systemd na própria VPS confere a
  validade real do certificado servido (coisa que um monitor externo só infere), **mais**
  uma checagem externa mínima de `/health` — serviço gratuito ou GitHub Action agendada.
  Alarme de certificado com **30 dias**, não 7. As duas pernas existem porque falham em
  cenários diferentes: o timer local cala junto com a caixa; o monitor externo não vê o
  arquivo. O Let's Encrypt encerrou o aviso de expiração por e-mail em jun/2025 — ninguém
  mais avisa de graça.
- **D2-17:** **Backup por Litestream para bucket S3-compatível** (Backblaze B2 ou
  equivalente), replicando o WAL do SQLite continuamente, com unit própria do systemd.
  Ponto de recuperação em segundos em vez de um dia — para um ledger de moeda, um dia
  perdido é soul gold que sumiu. Fora da VPS por princípio: a Hostinger cair leva o snapshot
  junto. É exatamente esse caminho que o script de D2-03 exercita.

### Claude's Discretion

Decisões técnicas deixadas para o pesquisador e o planejador resolverem a partir do código
e da pesquisa já feita:

- **Hono ou Fastify** em `apps/server`, e a porta interna do processo. A pesquisa recomenda
  Hono (`@hono/node-server` expõe o `http.Server` real, que a fase 3 vai precisar para
  anexar o `ws` no evento `upgrade`), mas a escolha não é irreversível nesta fase.
- **O que `/health` responde** e com que forma — status do banco, `SIM_VERSION`, versão do
  release, ou só `200 OK`. Só há duas restrições: precisa ser consumível pela checagem
  externa de D2-16, e não pode vazar nada que não seja público.
- **`MemoryMax` e o resto do sandbox do systemd** (`NoNewPrivileges`, `ProtectSystem`,
  `ReadWritePaths`) por serviço — a pesquisa dá um ponto de partida em `STACK.md`.
- **rsync ou tar, e quantos releases ficam no disco** antes de serem podados.
- **Forma exata do passo de build que gera o precache** de D2-10: plugin do Vite,
  script `post-build`, ou `define()` com a lista. Inclui como o nome do cache passa a
  derivar do hash do build em vez de `'dungeonguys2-v1'` literal.
- **Onde o aviso de atualização de D2-09 aparece na UI** e com que texto — o projeto já tem
  `src/ui/screens.ts` com `announce()` e `showScreen()`.
- **Se a exclusão de `/api/` no service worker já nasce com `/ws` junto**, antecipando a
  fase 3. Barato agora, e o custo de esquecer é alto.
- **Se o servidor reinicia em todo deploy** ou só quando `apps/server` muda.
- **Uma página de manutenção estática** servida quando o processo Node está fora, para que o
  single-player continue jogável — sugerida pela pesquisa (armadilha 13), não decidida aqui.
- **Ordem interna da fase.** Uma restrição vale a pena registrar: a mudança de
  `base: '/DungeonGuys2/'` para `'/'` toca `vite.config.ts` e o escopo do service worker ao
  mesmo tempo, e a pesquisa recomenda que isso seja **tarefa própria**, com o teste de
  instalação limpa e de atualização feito em cima dela — não misturada com a reescrita do
  `sw.js`.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Escopo e requisitos desta fase
- `.planning/ROADMAP.md` § "Phase 2: Migração para a VPS" — Goal, os 4 Success Criteria e a
  nota de operação sobre o monitoramento externo do certificado fazer parte do critério 1
- `.planning/REQUIREMENTS.md` § "Hospedagem (INFRA)" — texto literal de INFRA-01 a INFRA-04,
  incluindo o `[decidido]` de que o espelho do Pages morre
- `.planning/PROJECT.md` — Constraints (VPS Hostinger, domínio único, operação é do
  usuário), e § Context item 5: o deploy assume GitHub Pages em **dois** lugares
- `.planning/STATE.md` — a decisão de 2026-08-29 de que o espelho no Pages morre

### Pesquisa que sustenta estas decisões
- `.planning/research/STACK.md` § "Deploy e supervisão numa VPS" — Caddyfile completo (com a
  ordem obrigatória: `handle /api/*` **antes** do handler estático), a unit do systemd, e
  as quatro correções obrigatórias do `sw.js`
- `.planning/research/STACK.md` § "Recommended Stack" — Caddy 2.11.4, Node 24 LTS, Hono
  4.13.5, `@hono/node-server` 2.1.1, `better-sqlite3` 13.0.3, Kysely 0.29.5, Litestream
- `.planning/research/PITFALLS.md` § 8 "O service worker de escopo raiz engolindo a API" —
  os **cinco** defeitos verificados no `public/sw.js` atual e a prevenção item a item
- `.planning/research/PITFALLS.md` § 13 "VPS de um só: TLS, backup e a ausência de plantão" —
  renovação de TLS falhando em silêncio, backup nunca restaurado, deploy reversível
- `.planning/research/PITFALLS.md` § checklist final — as duas caixas de PWA na VPS: teste
  de atualização e isolamento da API

### Decisões travadas antes desta fase (não reabrir)
- `.planning/phases/01-formato-e-costuras/01-CONTEXT.md` — em especial **D-08** (versões
  diferentes recusam sempre, sem bypass — é o que torna D2-09 obrigatório), **D-15**
  (`apps/web`/`apps/server` adiados para "a fase 2 ou 3", resolvido aqui por D2-04) e
  **D-29** (o ledger vive em `dungeonguys2_ledger_v1` no cliente)
- `docs/adr/0010-soul-gold-ledger-append-only.md` — o formato da única tabela que D2-02 cria
- `docs/adr/0005-temporada-por-sim-version.md` — por que a coluna de temporada **não** nasce
  aqui: ela depende do placar, que é a fase 9
- `docs/DECISOES-MARCO0.md` — as 39 decisões do Marco 0; ler antes de contradizer qualquer
  escolha de build ou de PWA

### Código que esta fase reescreve
- `vite.config.ts:5` — `base: '/DungeonGuys2/'`, o primeiro dos dois lugares
- `src/main.ts:37-42` — o registro do service worker via `import.meta.env.BASE_URL`; o
  segundo lugar, que **acompanha sozinho** quando `base` muda
- `public/sw.js` — inteiro. `CACHE = 'dungeonguys2-v1'` literal (linha 20), `PRECACHE` com
  nomes escritos à mão (22-30), `skipWaiting()` no install (36), `clients.claim()` no
  activate (44), network-first para todo GET **sem checar `res.ok`** (65-74)
- `public/manifest.json` — `start_url` e `scope` em `"."`; conferir contra o escopo novo
- `.github/workflows/deploy.yml` — o job inteiro, hoje `upload-pages-artifact` +
  `deploy-pages`, vira rsync sobre SSH. Note que ele **duplica** `lint`/`test`/`build` que o
  `ci.yml` já roda, e ainda usa Node 20 enquanto o `ci.yml` usa 24
- `.github/workflows/ci.yml` — os oito portões existentes; o teste de PWA de D2-11 entra
  aqui, e o Playwright já está instalado e cacheado por versão
- `package.json:6-8` — `workspaces: ["packages/*"]`, que D2-04 estende

### A criar nesta fase
- `apps/server/` — o processo Node de D2-01, com a migração de D2-02
- `ops/` — `Caddyfile`, `dg2.service`, e os scripts de deploy e de restauração (D2-15)
- `tools/ops/` — o script de verificação de restauração de D2-03
- O registro do ensaio de restauração em `docs/` (D2-03), com data e resultado

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **`ci.yml` já é o portão completo**: lint, dois typechecks, testes, `sim:version:verify`,
  os três passos de assets, o cross-engine em Chromium/Firefox/WebKit e o build. O teste de
  PWA de D2-11 entra num CI que já tem Playwright instalado, cacheado **pela versão exata**
  do `package-lock.json` — o cuidado já está lá e não precisa ser inventado.
- **`src/ui/screens.ts`** já tem `announce()`, `showScreen()` e `createPauseControl()` — o
  aviso de atualização de D2-09 tem onde morar sem componente novo.
- **`tools/sim-version/emit.mjs`** é o precedente exato do passo de build de D2-10: um
  script Node que roda depois do build, lê o artefato e emite metadado derivado. Copiar a
  forma, não inventar outra.
- **`dist/` inteiro tem 350 KB** (medido) e `public/assets/` tem 129 KB. O piso de ~15 MB é
  pré-renderizado em runtime e **não** é enviado. É o que torna o precache total de D2-10
  barato de um jeito que raramente é — e o que muda na fase 7, quando a arte nova entrar.

### Established Patterns
- **`dependencies: {}` é doutrina do jogo publicado, não do servidor.** A raiz declara
  `dependencies: {}` e `tests/purity.test.ts:85-91` assere o mesmo para `packages/sim`. O
  teste **não** cobre a raiz nem `apps/*` — mas deixar Hono cair na raiz seria o vazamento
  de doutrina que a nota da fase 6 avisa para não deixar acontecer. Daí D2-04.
- **Configuração de infra ainda não existe no repositório.** Não há `ops/`, `Dockerfile`,
  nem nada além dos dois workflows. `ops/` de D2-15 é diretório novo, sem padrão anterior
  para seguir — mas `tools/` já estabelece a convenção de scripts `.mjs` em Node puro.
- **`.gitignore` ignora `dist/` e `packages/sim/dist`** com um comentário explícito: o
  artefato é derivado e commitá-lo deixaria um hash velho sobreviver ao código. O deploy de
  D2-05 respeita isso — o `dist/` publicado nasce no CI, nunca no git.

### Integration Points
- **`vite.config.ts:5` + `src/main.ts:41`** — os dois lugares do `base`. O segundo já lê
  `import.meta.env.BASE_URL`, então a mudança é literalmente uma linha; o que **não** é uma
  linha é o efeito colateral: o escopo do service worker passa de `/DungeonGuys2/` para `/`.
- **`public/sw.js` → `dist/sw.js`** — o arquivo é copiado verbatim pelo Vite (está em
  `public/`), então **nenhum passo atual o reescreve**. O precache derivado de D2-10 precisa
  criar esse passo, ou mover o `sw.js` para fora de `public/`.
- **`.github/workflows/deploy.yml` → VPS** — a fronteira nova. Hoje o job termina em
  `upload-pages-artifact`; passa a terminar em rsync mais troca de symlink mais, quando
  `apps/server` mudar, `systemctl restart`.
- **`apps/server` → `/health` → Caddy → monitor externo** — a corrente de D2-16, que precisa
  existir inteira para o critério 1 fechar.

### Constraints que limitam as opções
- **VPS de 1-2 GB rodando tudo**: Caddy, Node, SQLite e, na fase 3, coturn. `MemoryMax` por
  unit não é higiene, é o que impede um vazamento no signaling de matar a API.
- **Operação é do usuário**, incluindo TLS e uptime, sem plantão. Toda peça que exige
  manutenção manual é uma peça que vai quebrar num domingo — é o argumento que escolheu
  Caddy (renovação sem cron) e que recusou o timer de restauração recorrente em D2-03.
- **A região da VPS importa para a fase 3**, não para esta: o mesmo servidor vai hospedar o
  TURN, e um relay fora do Brasil vira +200 ms. Se a caixa ainda não estiver provisionada na
  região certa, este é o último momento barato para mover.
- **A porta 443 vai ser disputada na fase 3** (TURN sobre TLS quer 443 para atravessar
  firewall corporativo). O Caddyfile desta fase não precisa resolver isso, mas quem o
  escrever deve saber que a disputa está agendada.

</code_context>

<specifics>
## Specific Ideas

- **"O que é publicado é sempre o que passou no portão cross-engine"** (D2-05). O CI
  empurrar por SSH foi escolhido contra o conforto de um `npm run deploy` local justamente
  por isso: o portão de determinismo entre motores custou a fase 1 inteira, e um caminho de
  publicação que o contorne o anula.
- **O rollback tem de funcionar com o GitHub fora do ar** (D2-06). É o cenário em que se
  precisa dele: numa caixa só, sem homologação, a reversão é a única rede de segurança — e
  ela não pode depender da mesma infraestrutura que acabou de falhar.
- **Precachear tudo porque hoje é barato** (D2-10). 350 KB compram "instalou, joga offline"
  por construção em vez de por hábito do jogador. A janela é agora: depois da fase 7 a arte
  nova muda o orçamento, e o critério 5 daquela fase já avisa que `cache.addAll` rejeita a
  instalação inteira se uma URL falhar.
- **Verificação só por Playwright, aceita com a lacuna nomeada** (D2-11). A cobertura de
  iOS/Safari em aparelho real fica de fora **por escolha**, não por esquecimento; a caixa
  de `docs/PARIDADE.md` continua aberta e deve ser lida como decisão registrada.
- **O Pages morre com aviso, não com 404** (D2-12). Um PWA instalado é offline-first: sem o
  service worker suicida, o jogo velho continuaria abrindo e gravando progresso num domínio
  morto. O jogador precisa ser avisado enquanto ainda dá para migrar.
- **Vigilância em duas pernas porque as falhas são diferentes** (D2-16). O timer local vê o
  certificado real mas cala junto com a caixa; o monitor externo sobrevive à queda mas só
  infere o certificado. A escolha inicial foi só o timer local; a segunda perna entrou
  depois de a nota do roadmap ("monitoramento externo é parte do critério 1") ser posta na
  mesa — decisão informada, não imposta.

</specifics>

<deferred>
## Deferred Ideas

Consequências registradas e portas que estas decisões deixaram encostadas:

- **`apps/web`** — o cliente fica na raiz (D2-04). Renomear é `git mv` mais dois caminhos;
  reavaliar na fase 3, quando o servidor tiver conteúdo de verdade e o deploy já tiver
  estabilizado. É a segunda vez que este item é adiado (D-15 da fase 1 foi a primeira).
- **Tabelas de perfil, run, replay, temporada e placar** — fora de D2-02. Nascem nas fases
  que as consomem (6 e 9), com a FK para a tabela `user` do Better Auth desenhada quando ela
  existir. O migrator criado aqui é o que torna isso acréscimo em vez de reescrita.
- **Subdomínio de staging** — recusado em D2-14. Volta a fazer sentido quando houver
  jogadores de verdade e quebrar produção deixar de ser barato — provavelmente entre as
  fases 5 e 6. Lembrar que um service worker instalado do staging é outro origin, ou seja,
  mais um jogo zumbi para matar depois.
- **Timer recorrente de verificação de restauração** — recusado em D2-03. O script fica
  pronto para virar timer no dia em que o banco tiver dado de jogador de verdade (fase 6).
- **Página de manutenção estática** quando o processo Node está fora — sugerida pela
  pesquisa, deixada como discrição do planejador. Só passa a importar quando alguma tela do
  jogo depender da API, ou seja, na fase 6.
- **Exclusão de `/ws` no service worker** — a rota de signaling da fase 3. Se não entrar
  junto com a de `/api/` aqui, entra lá; o custo de esquecer é dado autenticado no Cache
  Storage, então vale registrar mesmo sendo trivial.
- **Disputa da porta 443 com o TURN sobre TLS** — questão da fase 3, antecipada em
  `PITFALLS.md`. O Caddyfile desta fase não a resolve, mas quem o escrever deve deixá-lo
  legível para quando ela chegar.
- **Cobertura de PWA em aparelho real (iOS/Safari)** — fora por D2-11. A caixa de
  `docs/PARIDADE.md` continua aberta; se algum dia virar prioridade, o caminho é uma sessão
  manual documentada, não automação.
- **Limpar Cache Storage e IndexedDB no logout** — item 5 da prevenção da armadilha 8. Não
  há logout até a fase 6; anotado aqui para que a fase 6 não o redescubra do zero.

Nenhum item de escopo criativo apareceu na discussão — ela ficou dentro da fronteira da
fase.

</deferred>

---

*Phase: 2-Migração para a VPS*
*Context gathered: 2026-08-31*
