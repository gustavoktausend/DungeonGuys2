# Phase 2: Migração para a VPS - Context

**Gathered:** 2026-08-31
**Amended:** 2026-09-10 (containerizacao D2-22..D2-31; D2-32 o deploy volta a ser manual; D2-33 Litestream replica para a caixa, nao para bucket)
**Status:** Ready for replanning

> Rótulos de estrutura ficam em inglês porque são lidos por ferramenta.
> O conteúdo é em português, como o resto dos documentos do projeto.
>
> **Convenção de numeração:** as decisões desta fase são `D2-01` a `D2-33`. `D2-33` é emenda de execução de 2026-09-10, tomada no portão humano do 02-04. `D2-18` a `D2-21`
> são emendas pós-pesquisa de 2026-08-31; **`D2-22` a `D2-31` são as emendas de containerização
> de 2026-09-09**, tomadas depois de a caixa existir; **`D2-32` é a emenda pós-pesquisa de
> containerização**, tomada depois de a pesquisa medir a caixa. `D2-12` foi revogada por
> `D2-18`, `D2-06` por `D2-24` e `D2-31` por `D2-32`. As decisões da fase 1 são citadas como
> `D-nn (fase 1)` para que nunca se confundam.

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
- **D2-12:** ~~**O GitHub Pages recebe um último deploy de despedida.**~~ **[REVOGADA em
  2026-08-31 por D2-18 — nenhum plano deve cobrir esta decisão.]** O texto original previa
  uma página estática apontando para o domínio novo e um `sw.js` que se desregistra e limpa
  o próprio Cache Storage, porque um PWA instalado é offline-first e desligar o Pages em
  silêncio deixaria o jogo velho abrindo do cache. A premissa era falsa: ver D2-18.

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

### Emendas pós-pesquisa (2026-08-31)

Quatro decisões tomadas **depois** da discussão, a partir de fatos que a pesquisa mediu e que
a discussão não podia conhecer. Valem como decisões travadas, iguais às de cima.

- **D2-18:** **A despedida do GitHub Pages é cortada — D2-12 está revogada.** Medido:
  `gustavoktausend.github.io/DungeonGuys2/` retorna **404**, a API do GitHub retorna 404 para
  o repositório, e a listagem pública de `gustavoktausend` não contém `DungeonGuys2`. Nunca
  houve URL de onde instalar o PWA, logo não existe jogador para avisar, e publicar a
  despedida faria o **primeiro** deploy do projeto no Pages ser também o último. INFRA-01
  ("existe **um** alvo de deploy") passa a ser satisfeito por não haver espelho para matar —
  e continua sendo provado de forma executável por `tests/workflows.test.ts`, que assere que
  nenhum workflow publica no Pages. **Consequência que fica registrada:** o service worker
  do **DungeonGuys original** (`/DungeonGuys/sw.js`, HTTP 200, `CACHE = 'dungeonguys-v3'`)
  faz `caches.keys()` e apaga todo cache que não seja o dele. Como Cache Storage é **por
  origem, não por escopo**, os dois jogos nunca poderiam ter funcionado offline ao mesmo
  tempo em `gustavoktausend.github.io`. Domínio próprio não é conforto: é o que faz o PWA
  funcionar. Nada nesta fase toca o jogo original.
- **D2-19:** **A VPS é KVM 2 (2 GB).** Fecha o orçamento de memória que D2-01 e o sandbox do
  systemd dependiam: `MemoryHigh`/`MemoryMax` por unit continuam obrigatórios mesmo com
  folga, porque o ponto não é higiene — é impedir que um vazamento no signaling da fase 3
  mate a API. O par `MemoryMax` + `--max-old-space-size` do Node é o que troca OOM-kill por
  GC.
- **D2-20:** **As fontes do Google passam a ser auto-hospedadas.** Os `.woff2` vêm para a
  própria origem e entram no precache derivado de D2-10. Motivo: sem isso, "abre sem rede"
  do critério 2 significa "abre com tipografia diferente", e `offline.spec.ts` teria de
  filtrar `requestfailed` por origem para não dar vermelho falso. Com auto-hospedagem, o
  offline é idêntico ao online e o teste assere **zero** falhas de rede, sem exceção — a
  asserção mais forte custa alguns KB num bundle de 350 KB.
- **D2-21:** **A segunda perna de D2-16 é serviço externo de terceiro**, não GitHub Action
  agendada. Um workflow agendado é desabilitado automaticamente após 60 dias sem atividade no
  repositório — exatamente quando o projeto está parado é que o alarme calaria. O serviço
  (UptimeRobot, Healthchecks.io, Better Stack ou equivalente) aponta para `/api/health` com
  keyword matching em `"status":"ok"`. Configuração manual, com a primeira checagem verde
  registrada em `docs/OPERACAO.md`.

### Emendas de containerização (2026-09-09)

Dez decisões tomadas **depois** de a caixa existir e ser inventariada. A discussão original
de 2026-08-31 supunha uma VPS vazia de 2 GB onde o Caddy seria dono da porta 443. A caixa
real é o host do projeto **infraKring**: Coolify sobre Docker, **Traefik ocupando 80 e 443**
(TCP e UDP), produção viva de outro projeto (`militias3dstore.kring.tech`), 8 GB de RAM e
85 GB de disco livres. Inventário completo em `.vps-inventario.local` (fora do git).

Estas emendas valem como decisões travadas, iguais às de cima.

- **D2-22:** **O jogo vira um app do Coolify**, containerizado, publicado por push. Escolhido
  contra as duas alternativas medidas (Caddy nativo atrás do Traefik; só o Node atrás do
  Traefik) por dar **um único modelo operacional na caixa** — e de quebra fecha a tarefa T8
  do infraKring, pendente desde junho. Efeito colateral que resolve um conflito de graça: o
  servidor escuta 8080 **dentro do contêiner**, nada é publicado no host, e a colisão com o
  painel do Traefik (que ocupa `0.0.0.0:8080`) desaparece por construção.

- **D2-23:** **O integrador contínuo constrói a imagem e a publica no registro; o Coolify só
  puxa.** Emenda D2-05 preservando o argumento dela inteiro: *o que é publicado é sempre o
  que passou no portão cross-engine*. Deixar o Coolify construir a partir do git contornaria
  esse portão — um push que quebrasse o determinismo entre motores publicaria assim mesmo,
  anulando o que custou a fase 1. Segundo motivo, específico desta caixa: o build não disputa
  os dois núcleos com a produção do outro projeto (D-VPS-02).

- **D2-24:** **Reverter é apontar para a imagem anterior, que já está no disco.**
  Substitui D2-06 (releases por sha com symlink), que morreu com D2-22, **preservando o
  requisito que a justificava**: a reversão é a única rede de segurança numa caixa só, e não
  pode depender da infraestrutura que acabou de falhar. O Docker guarda o que puxou, então
  voltar não usa rede. Consequência a planejar: **quantas imagens ficam antes da poda** — sem
  esse número, a reversão sem rede é acidente e não garantia.

- **D2-25:** **Caddy e Node como dois serviços de uma composição.** O Caddy serve o jogo e
  repassa `/api` e `/ws` ao Node. Motivo: `ops/Caddyfile` **não é sobre TLS** — carrega a
  política de conteúdo derivada arquivo por arquivo, as três classes de cache, a recusa
  deliberada de servir o índice em rota inexistente (DM-5) e o 503 em JSON que o monitor
  externo de D2-21 consome. Reescrever isso em código seria o item mais caro da migração, e
  desnecessário. **O Caddy do contêiner não termina TLS**: quem termina é o Traefik, em
  `dg2.kring.tech`.

- **D2-26:** **O coturn roda nativo no host, com systemd — exceção consciente a D2-22.** Não é
  aplicação web: precisa de uma faixa larga de portas UDP sem tradução de endereço, e é
  infraestrutura, não produto. Encaixa no modelo de host-as-code que o infraKring já usa.
  `ops/turnserver.conf` e `ops/coturn-dropin.conf` continuam versionados e cobertos por teste.

- **D2-27:** **A faixa de portas de relay é declarada e pequena, e a cota desce junto.**
  Corrige um defeito real medido contra a caixa: `ops/turnserver.conf` **não declara**
  `min-port`/`max-port`, e `ops/README.md` §12 manda abrir só 3478 e 5349. Sem a faixa, o
  coturn aloca relay entre 49152 e 65535, que o UFW `deny incoming` bloqueia — o relay
  autenticaria, entregaria um endereço ao navegador e o tráfego nunca chegaria. O sintoma é
  **"um amigo específico nunca entra"**, indistinguível de NAT ruim, que é a mesma armadilha
  que o runbook descreve para o segredo duplicado. Cerca de cem portas dão vinte e cinco
  salas inteiramente por relay ao mesmo tempo; `total-quota=1200` desce para casar com a
  faixa, porque o próprio runbook diz que aquele número é dimensionamento e não só
  anti-abuso.

- **D2-28:** **O Litestream envolve o processo do servidor** (`litestream replicate -exec`),
  no padrão documentado pelo próprio projeto para contêiner. Mantém D2-17 intacta — réplica
  contínua do WAL para bucket S3-compatível, fora da caixa — e elimina a janela em que o
  banco recebe escrita e ninguém replica. Para um ledger de moeda, essa janela é soul gold
  que some.

- **D2-29:** **Segredos: painel do Coolify para o app, arquivo no host para o coturn.**
  Emenda D2-15, que dizia que reconstruir a caixa é clonar o repo mais restaurar um arquivo
  de env. Metade disso deixa de valer: as variáveis do app passam a viver no banco do
  Coolify. **A consequência tem de estar escrita no runbook, em voz alta:** o
  `static-auth-secret` do relay agora existe em dois lugares de **naturezas diferentes** — um
  arquivo (`/etc/turnserver.conf`) e um painel web. Trocar num só faz o relay recusar toda
  credencial, com o mesmo sintoma de D2-27.

- **D2-30:** **`ops/` perde o que a containerização aposenta.** Saem `deploy.sh`,
  `rollback.sh`, `deploy-forced.sh`, `prune-releases.sh`, `dg2.service` e os três arquivos de
  `cert-check`. Ficam `turnserver.conf`, `coturn-dropin.conf` e o `README.md`, reescrito. As
  asserções de `tests/ops-config.test.ts` sobre os arquivos removidos são reescritas no mesmo
  commit. Motivo: um arquivo que ninguém executa e continua no repositório é uma armadilha
  para quem ler o runbook daqui a seis meses — o git guarda a história sem precisar do
  arquivo vivo.

- **D2-31:** **A publicação é um gancho do Coolify, chamado pelo integrador.** Substitui os
  quatro secrets de SSH que o plano 02-04 pedia (`DEPLOY_SSH_KEY`, `DEPLOY_HOST`,
  `DEPLOY_USER`, `DEPLOY_KNOWN_HOSTS`) por **um** segredo. Ganho de segurança direto: deixa de
  existir uma chave com escrita na caixa guardada em serviço de terceiro, que era exatamente
  o risco que o `deploy-forced.sh` existia para conter. A relação de D2-08 se mantém — todo
  push na `main` que passar no CI publica.

  > **REVOGADA por D2-32** em 2026-09-09, depois de a pesquisa medir que não existe endereço
  > para o integrador chamar.

#### Emenda pós-pesquisa de 2026-09-09

- **D2-32:** **Nada no Coolify se altera; nesta fase o deploy é disparado à mão pelo túnel.**
  Revoga D2-31. Motivo medido (`02-RESEARCH.md` §DM-7): a API do Coolify **não é alcançável
  da internet** — 8000 e 8080 dão timeout de fora, por decisão do próprio infraKring
  (`21-coolify-lockdown.sh`). As quatro saídas que a pesquisa custeou — dar FQDN ao painel,
  expor só `/api/v1/deploy` pelo Traefik, um timer no host que puxa do GHCR, ou uma chave SSH
  com `command=` fixo — **todas** exigem alterar a configuração do vizinho ou reintroduzir o
  host-as-code que D2-22 estava eliminando. **Nenhuma se faz.** O integrador continua
  construindo a imagem e publicando no registro (D2-23 intacta, e é ela que mantém o build
  fora da caixa de 2 vCPU); o que deixa de existir é só o **disparo automático**: o operador
  abre o túnel para o Coolify e sobe a versão nova à mão. É a aplicação mais estrita de
  D-VPS-02 — a caixa é produção viva de outro projeto, e "não mexer" ganha de "automatizar"
  enquanto o jogo não tem um único jogador. Automatizar volta à mesa quando houver motivo:
  isto é adiamento escrito, não dívida acidental.

  Consequências que o plano precisa absorver:

  - **D2-08 fica suspensa nesta fase.** "Todo push na `main` que passar no CI publica" passa a
    valer para a **imagem**, não para o **deploy**. O CI publica no registro; quem promove é
    uma pessoa.
  - **Nenhum segredo de deploy nasce.** Nem os quatro de SSH que o 02-04 original pedia
    (`DEPLOY_SSH_KEY`, `DEPLOY_HOST`, `DEPLOY_USER`, `DEPLOY_KNOWN_HOSTS`), nem o segredo único
    do gancho que D2-31 previa, nem `DEPLOY_ENABLED`. O `ci.yml` precisa apenas do
    `GITHUB_TOKEN` com `packages: write` — a exceção nomeada de `02-RESEARCH.md` §DM-8.
  - **O critério 4 do roadmap muda de forma e precisa ser reconciliado no plano.** Ele exige
    que "o deploy é um comando e é reversível". A reversão sobrevive intacta (D2-24: apontar
    para a imagem anterior, que já está no disco). "Um comando" é o que fica em aberto: um
    clique no painel não é um comando. **A forma do disparo manual é decisão do 02-04′** —
    clique no painel pelo túnel, ou um script local que faz o `curl` para a porta encaminhada
    por SSH. Os dois alteram exatamente nada na caixa; o segundo preserva a letra do critério
    e é o que o plano deve tentar primeiro.

#### Emenda de execução — 2026-09-10 (tomada durante o 02-04)

- **D2-33:** **O Litestream replica para um caminho da própria caixa (`file`), não para bucket.**
  Emenda D2-17 e D2-28. Gustavo decidiu, durante o portão humano do 02-04, não criar bucket:
  *"não vamos deixar as imagens em bucket isso vai ficar tudo manual vindo da minha maquina local
  pelo tunel com a vps"*. (A frase confundia imagem com banco — o bucket era do Litestream, não
  das imagens; a correção foi apresentada e a decisão mantida para o banco.) O Litestream 0.5
  suporta oito tipos de réplica, e `file` é um deles, então a réplica contínua **sobrevive**:
  o que muda é o destino.

  O que isso preserva e o que isso custa, escrito antes de alguém verificar:

  - **Preserva** o `litestream replicate -exec` de D2-28 — o processo, o repasse de sinal medido
    em DM-13 e o `stop_grace_period: 30s` continuam iguais. Só a seção de destino do
    `ops/litestream.yml` muda de `s3` para `file`.
  - **Preserva o critério 4**: o ensaio de restauração de D2-03 roda na caixa, em diretório
    descartável, sobre a réplica `file`, e o resultado vai para `docs/OPERACAO.md`. "Restaurado
    num ambiente limpo e o resultado anotado" continua literalmente verdadeiro.
  - **Custa a garantia off-site.** A réplica protege contra corrupção do banco, migração ruim e
    deploy errado — **não** contra perder a caixa. Se o disco morrer, a réplica morre com ele, a
    menos que Gustavo tenha puxado pelo túnel recentemente. **Isto não é descuido, é escolha
    registrada**, e a tarefa T9 do infraKring (backup off-site) deixa de ser fechada por esta
    fase.
  - **Apaga quatro variáveis** do painel: `LITESTREAM_BUCKET`, `LITESTREAM_ENDPOINT`,
    `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`. Nasce no lugar um caminho de réplica.
  - **Exige volume persistente para a réplica.** O caminho do `file` tem de viver num volume
    persistente do Coolify, como o do banco. Numa camada de contêiner, a réplica é apagada no
    primeiro redeploy e o backup desaparece sem avisar — é a armadilha que esta linha existe para
    impedir. O `02-14` declara os dois volumes e o `02-12` prova que a réplica sobreviveu a um
    redeploy.

- **D2-23 reafirmada no mesmo portão.** Gustavo confirmou manter o integrador construindo e
  publicando a imagem no GHCR, com a caixa fazendo `pull` — o que o deploy de prova de hoje já
  exercitou (`Image caddy:2.11.4-alpine Pulling → Pulled`, sem etapa de build). O `02-15`
  segue como planejado. O que é manual é só o **disparo** (D2-32), nunca a **construção**.

#### Decisões anteriores afetadas

| Decisão | Estado |
|---|---|
| **D2-05** | **Emendada por D2-23.** O argumento sobrevive; muda o mecanismo — imagem no registro em vez de rsync sobre SSH |
| **D2-06** | **REVOGADA por D2-24.** Releases por sha com symlink não existem sob contêiner; o requisito de reverter sem rede foi preservado |
| **D2-15** | **Emendada por D2-29.** Config versionada em `ops/` continua; o `/etc/dg2/env` deixa de ser o lugar único dos segredos |
| **D2-19** | **Desatualizada.** A caixa não é KVM 2 de 2 GB: são 8 GB, com 5,7 livres. Os limites de memória continuam obrigatórios pelo motivo original (impedir que um vazamento no signaling mate a API), agora como limites de contêiner |
| **D2-13** | **Confirmada e especificada.** O domínio é `dg2.kring.tech`; o wildcard `*` já resolve, e o DNS não se toca |
| **D2-16** | **Vale, com o dono trocado.** O certificado passa a ser do Traefik, então o timer local de `cert-check` sai (D2-30); a perna externa de D2-21 continua e é a que resta |
| **D2-31** | **REVOGADA por D2-32.** Não há endereço para o integrador chamar (`02-RESEARCH.md` §DM-7); o disparo do deploy volta a ser humano nesta fase |
| **D2-08** | **SUSPENSA por D2-32.** O push na `main` publica a imagem no registro, não o deploy. A promoção é manual até haver motivo para automatizar |
| **D2-17** | **Emendada por D2-33.** A réplica contínua continua; o destino deixa de ser bucket e passa a ser caminho na própria caixa, em volume persistente. A garantia off-site cai, por escolha registrada |
| **D2-28** | **Emendada por D2-33.** O `litestream replicate -exec`, o repasse de sinal e o `stop_grace_period` sobrevivem intactos; só a seção de destino do `ops/litestream.yml` muda de `s3` para `file` |

#### Restrições novas que a caixa impõe

- **Não mexer no infraKring** (D-VPS-02). Há produção viva. Alterações no host são **só
  aditivas** e confirmadas antes. A única exigida por esta fase e pela fase 3 é abrir
  3478/udp, 3478/tcp, 5349/tcp e a faixa de D2-27 no UFW.
- **Dois achados de segurança do infraKring ficam como observação, sem ação:** a porta 8080 do
  Traefik está publicada em todas as interfaces e fora da lista do `coolify-lockdown.sh`
  (`PORTS="8000 6001 6002"`), protegida hoje por acidente e não por projeto; e
  `coolify-lockdown.service` está `inactive (dead)`, então um reinício do Docker sem reboot
  apagaria as regras até o próximo boot.
- **`rsync` não existe na caixa.** Deixa de importar sob D2-22, mas fica registrado: qualquer
  caminho que volte a precisar dele precisa instalá-lo.

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

### A caixa real (levantada em 2026-09-09 — LER ANTES de planejar)

- `.planning/STATE.md` § "Decisão de infraestrutura — 2026-09-09" — D-VPS-01/02/03, o impacto
  por artefato de `ops/`, as perguntas abertas e os três defeitos achados contra a caixa
- `.vps-inventario.local` (raiz, fora do git por `*.local`) — inventário completo: portas em
  escuta, containers, firewall, memória, disco, e a lista do que o jogo precisa e não existe
- `.vps.local` (raiz, fora do git) — endereço, usuário, chave, domínio, credenciais do bucket.
  Acesso pelo alias `ssh dg2vps`; **root não loga pela internet**, é reservado ao Coolify
- Repositório **infraKring** (fora deste repo, em `Documents/Projetos/infraKring`) —
  `docs/STATUS.md` (estado da caixa, T1–T7 feitas, T8 e T9 pendentes), `docs/runbook.md` (acesso,
  túnel do painel, o bloco `Match Address` que reserva o root ao Coolify) e
  `scripts/21-coolify-lockdown.sh` (a lista de portas trancadas, que **não** inclui a 8080)

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
- ~~**VPS de 1-2 GB rodando tudo**~~ — **corrigido em 2026-09-09**: a caixa tem **8 GB**, com
  5,7 livres, e 85 GB de disco. O teto de memória continua obrigatório pelo motivo original
  (impedir que um vazamento no signaling mate a API), agora como limite de contêiner. O que
  divide a caixa não é o jogo: é o Coolify mais a produção de outro projeto.
- **Operação é do usuário**, incluindo TLS e uptime, sem plantão. Toda peça que exige
  manutenção manual é uma peça que vai quebrar num domingo — é o argumento que escolheu
  Caddy (renovação sem cron) e que recusou o timer de restauração recorrente em D2-03.
- **A região da VPS importa para a fase 3**, não para esta: o mesmo servidor vai hospedar o
  TURN, e um relay fora do Brasil vira +200 ms. Se a caixa ainda não estiver provisionada na
  região certa, este é o último momento barato para mover.
- ~~**A porta 443 vai ser disputada na fase 3**~~ — **resolvido de outro jeito em 2026-09-09**:
  a 443 nunca foi do Caddy nesta caixa. É do Traefik, em TCP e UDP. O relay fica em 3478 e
  5349, como `ops/turnserver.conf` já decidira, e TURN sobre TLS na 443 segue como dívida
  registrada e não construída.

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
- ~~**O Pages morre com aviso, não com 404** (D2-12).~~ **Revogado por D2-18:** medimos que
  o Pages do DungeonGuys2 nunca existiu, então não há PWA instalado para avisar. O argumento
  original — um PWA instalado é offline-first e continuaria gravando progresso num domínio
  morto — permanece verdadeiro em geral, e é exatamente por isso que ele vale a partir de
  **agora**: quem instalar do domínio próprio passa a estar nessa situação se o domínio um dia
  mudar.
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

Acrescentados em 2026-09-09, com a caixa na mesa:

- **Os dois achados de segurança do infraKring** — a 8080 do Traefik fora da lista do lockdown,
  e `coolify-lockdown.service` inativo. **Registrados e não corrigidos**, por D-VPS-02: há
  produção viva ali e o infraKring não é escopo desta fase. São dele, não do jogo.
- **A tarefa T9 do infraKring (backup off-site)** — o Litestream que D2-17/D2-28 põem de pé
  serviria os dois projetos com pouco trabalho extra. Fora do escopo pelo mesmo motivo acima;
  vale a conversa depois que o jogo estiver no ar.
- **Remover `hello.kring.tech`** — o app de teste de junho segue no ar, e o `STATUS.md` do
  infraKring já pedia sua remoção. Não é nosso.
- **TLS na 5349 do coturn** — continua adiado (é o mesmo débito de WR-09 na fase 3). Piora de
  forma interessante: o certificado agora é do Traefik e vive dentro do `acme.json` do Coolify,
  que o usuário do coturn não lê. O caminho continua sendo um gancho de renovação, e continua
  não valendo o peso antes de alguém ficar de fora por um firewall que se possa nomear.

Nenhum item de escopo criativo apareceu na discussão — ela ficou dentro da fronteira da
fase.

</deferred>

---

*Phase: 2-Migração para a VPS*
*Context gathered: 2026-08-31 · amended 2026-09-09 (containerização)*
