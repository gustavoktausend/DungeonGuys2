# Phase 2: Migração para a VPS — Research

**Researched:** 2026-08-31
**Domain:** deploy em VPS única (TLS, reverse proxy, supervisão de processo), PWA/service worker, SQLite com backup contínuo e restauração verificada
**Confidence:** ALTA para o que foi medido neste repositório e verificado em documentação oficial; MÉDIA para o teste de offline no Playwright e para o comportamento de `workflow` agendado

> Rótulos de estrutura ficam em inglês porque são lidos por ferramenta.
> O conteúdo é em português, como o resto dos documentos do projeto.

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Servidor, banco e layout do monorepo**

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

**Deploy e reversão**

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

**Service worker, PWA e o fim do espelho**

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

**Domínio, configuração e operação**

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

- **Hono ou Fastify** em `apps/server`, e a porta interna do processo.
- **O que `/health` responde** e com que forma — status do banco, `SIM_VERSION`, versão do
  release, ou só `200 OK`. Só há duas restrições: precisa ser consumível pela checagem
  externa de D2-16, e não pode vazar nada que não seja público.
- **`MemoryMax` e o resto do sandbox do systemd** (`NoNewPrivileges`, `ProtectSystem`,
  `ReadWritePaths`) por serviço.
- **rsync ou tar, e quantos releases ficam no disco** antes de serem podados.
- **Forma exata do passo de build que gera o precache** de D2-10: plugin do Vite,
  script `post-build`, ou `define()` com a lista. Inclui como o nome do cache passa a
  derivar do hash do build em vez de `'dungeonguys2-v1'` literal.
- **Onde o aviso de atualização de D2-09 aparece na UI** e com que texto.
- **Se a exclusão de `/api/` no service worker já nasce com `/ws` junto.**
- **Se o servidor reinicia em todo deploy** ou só quando `apps/server` muda.
- **Uma página de manutenção estática** servida quando o processo Node está fora.
- **Ordem interna da fase.** Restrição registrada: a mudança de `base: '/DungeonGuys2/'`
  para `'/'` toca `vite.config.ts` e o escopo do service worker ao mesmo tempo, e deve ser
  **tarefa própria**, com o teste de instalação limpa e de atualização feito em cima dela —
  não misturada com a reescrita do `sw.js`.

### Deferred Ideas (OUT OF SCOPE)

- **`apps/web`** — o cliente fica na raiz (D2-04). Reavaliar na fase 3.
- **Tabelas de perfil, run, replay, temporada e placar** — fora de D2-02. Nascem nas fases 6 e 9.
- **Subdomínio de staging** — recusado em D2-14. Volta entre as fases 5 e 6.
- **Timer recorrente de verificação de restauração** — recusado em D2-03. Vira timer na fase 6.
- **Página de manutenção estática** quando o processo Node está fora — deixada como discrição
  do planejador; só passa a importar quando alguma tela do jogo depender da API (fase 6).
- **Exclusão de `/ws` no service worker** — a rota de signaling da fase 3.
- **Disputa da porta 443 com o TURN sobre TLS** — questão da fase 3.
- **Cobertura de PWA em aparelho real (iOS/Safari)** — fora por D2-11. A caixa de
  `docs/PARIDADE.md` continua aberta.
- **Limpar Cache Storage e IndexedDB no logout** — não há logout até a fase 6.

**Fora do escopo desta fase, explicitamente (do `<domain>` da CONTEXT.md):** zero linha de
rede de jogo (sala, signaling, WebRTC, coturn — fase 3); nenhuma rota de negócio nem
autenticação (fase 6); nenhuma leitura ou escrita de progresso pela rede; nenhuma mudança em
`packages/sim` (`SIM_VERSION` não se move); nenhuma mudança de arte, HUD ou balanceamento.
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Descrição (literal de REQUIREMENTS.md) | Research Support |
|----|----------------------------------------|------------------|
| **INFRA-01** | O jogo single-player roda na VPS sob domínio único com TLS, e o GitHub Pages deixa de ser alvo de deploy — **[decidido]** o espelho morre | § Standard Stack (Caddy 2.11.4, TLS automático); § Architecture Patterns "Padrão 1: release por sha + symlink"; § Descobertas que Mudam o Plano DM-1/DM-2 (o Pages **nunca recebeu** deploy — INFRA-01 já está metade satisfeito por acidente); § Code Examples "Caddyfile" |
| **INFRA-02** | O PWA continua instalável e funcional offline servido da VPS | § Architecture Patterns "Padrão 3: precache derivado"; § Common Pitfalls P-4 (`cache.addAll` + `{cache:'reload'}`), P-7 (fontes do Google não são precacheadas); § Validation Architecture critério 2; medido: `dist/` = 350 KB em 11 arquivos |
| **INFRA-03** | O service worker deixa `/api/` passar sem cachear, só guarda respostas `ok`, e deriva o nome do cache do build | § Architecture Patterns "Padrão 2: allowlist em vez de denylist"; § Don't Hand-Roll; § Code Examples "sw.js"; § Common Pitfalls P-2, P-3; § Validation Architecture critério 3 |
| **INFRA-04** | O deploy é um comando, com o processo supervisionado e backup do banco restaurável — verificado restaurando, não só gerando | § Standard Stack (systemd, Litestream 0.5.16, Kysely 0.29.5, better-sqlite3 13.0.3); § Code Examples "dg2.service", "litestream.yml", "restore-verify"; § Common Pitfalls P-8 (`replica` singular no v0.5), P-9 (crash-loop de migração); § Validation Architecture critério 4 |
</phase_requirements>

---

## Summary

Esta fase é menos "escolher tecnologia" e mais "fechar um circuito que hoje não existe em
lugar nenhum". A pesquisa da `STACK.md` já decidiu as peças (Caddy, Node 24, Hono, SQLite,
Kysely, Litestream, systemd) e a verificação de hoje **confirma todas elas na versão
corrente**, com três correções de detalhe: o Litestream v0.5 usa `replica:` no singular e
não o array `replicas:` de todo blog post existente; o `better-sqlite3` v13 passou a
embarcar os binários pré-compilados no próprio pacote, o que apaga a preocupação de
"recompila a cada major do Node"; e o Caddy **ordena os blocos `handle` por especificidade
do matcher**, então "`handle /api/*` antes do estático" é uma regra de legibilidade, não de
corretude — o que muda é que quem escrever um `route` em vez de `handle` perde essa rede.

A descoberta que mais mexe no plano não é de biblioteca, é de fato: **este repositório não
tem remote nenhum, o repo `gustavoktausend/DungeonGuys2` não existe no GitHub, e
`https://gustavoktausend.github.io/DungeonGuys2/` responde 404.** O `ci.yml` — os oito
portões que a fase 1 inteira construiu — nunca rodou num runner. O `deploy.yml` nunca
publicou nada. E `https://gustavoktausend.github.io/DungeonGuys/` — o jogo **original**, que
o PROJECT.md diz que "segue vivo e independente" — está no ar, com um service worker cujo
`activate` apaga **todo cache da origem** que não se chame `dungeonguys-v3`. Isso inverte a
premissa de D2-12 (não há PWA velho do DungeonGuys2 para avisar, porque nunca houve URL) e
cria um perigo novo: um `sw.js` de despedida que faça `caches.keys()` e delete tudo levaria
junto o cache do jogo original, que continua sendo um produto vivo.

A recomendação técnica central para o `sw.js` é trocar a forma da regra, não só a lista:
**sair de um denylist (`/api/` não entra) para um allowlist (só o que está no precache
derivado, mais `/assets/` com nome hasheado, é servido do cache)**. Um denylist está sempre a
uma rota esquecida de cachear resposta autenticada — a fase 3 traz `/ws`, a 6 traz
`/api/auth/*`, a 9 traz `/api/leaderboard`. Um allisted derivado do build fecha isso por
construção e é exatamente o mesmo movimento que o `tools/sim-version/emit.mjs` já fez para o
`SIM_VERSION`: derivar do artefato em vez de manter à mão.

**Primary recommendation:** copiar a forma de `tools/sim-version/emit.mjs` para um
`tools/sw/emit.mjs` que reescreve `dist/sw.js` a partir de um template com sentinelas,
derivando nome de cache e precache do conteúdo real do `dist/`; publicar por `rsync
--link-dest` para `/srv/dg2/releases/<sha>/` com troca de symlink; e fundir o `deploy.yml`
dentro do `ci.yml` como um job com `needs:`, porque `needs:` não atravessa workflows e essa é
a única forma de garantir literalmente que "o que é publicado é o que passou no portão
cross-engine" (D2-05).

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Terminação TLS e renovação de certificado | CDN/Edge (Caddy) | — | ACME automático sem cron é o argumento que escolheu Caddy; nenhuma outra camada deve saber que TLS existe |
| Roteamento `/api/*` vs estático | CDN/Edge (Caddy) | — | Uma origem só; a fronteira entre jogo e API é uma decisão de roteamento, não de código |
| Servir `dist/` | CDN/Edge (Caddy `file_server`) | Browser (service worker) | O SW é *cache secundário* da mesma origem; a fonte da verdade é o `file_server` apontando para o symlink `current` |
| Cache offline e instalabilidade do PWA | Browser (service worker) | — | Só o browser tem Cache Storage; nada no servidor participa |
| Aviso e aplicação de atualização | Browser (`src/main.ts` + `src/ui/screens.ts`) | — | O gate "fora de partida" só existe no cliente (`gameStarted`); o servidor não tem como saber |
| `base` / resolução de caminhos | Build (Vite) | Browser | `import.meta.env.BASE_URL` já propaga; a decisão é de build |
| Derivação do precache e do nome do cache | Build (`tools/sw/emit.mjs`) | — | Mesma propriedade do `SIM_VERSION`: o hash de um artefato não pode viver dentro dele |
| Migração de esquema | API/Backend (`dg2.service` no start) | — | D2-07. Não é do deploy nem do Caddy: é do processo que fala com o banco |
| Persistência do ledger (tabela) | Database (SQLite `/var/lib/dg2/`) | — | Fora da árvore de releases, para o rollback de symlink não tocar em dado (D2-07) |
| Replicação contínua do banco | Ops (`litestream.service`) | — | Processo separado por desenho: se o Node morrer, o backup continua |
| Verificação de restauração | Ops (`tools/ops/restore-verify.mjs`) | — | Roda fora do serviço, contra um diretório descartável (D2-03) |
| Supervisão, limite de memória e sandbox | Ops (systemd) | — | Um processo não pode derrubar os outros numa caixa de 1–2 GB (armadilha 13) |
| Publicação e reversão | CI (GitHub Actions) + Ops (symlink) | — | D2-05 põe a publicação no CI; D2-06 põe a reversão na caixa, para funcionar com o GitHub fora do ar |
| Vigilância de certificado | Ops (systemd timer, local) + Externo (monitor) | — | D2-16: as duas pernas falham em cenários diferentes |
| Progresso do jogador (save, ledger) | Browser (`localStorage`) | — | **Não muda nesta fase.** D-29 (fase 1) e o `<domain>` da CONTEXT.md são explícitos |

---

## Descobertas que Mudam o Plano

> Fatos medidos nesta sessão que a CONTEXT.md não podia conhecer. Cada um é verificável em
> um comando. Nenhum deles reabre decisão travada — todos mudam **como** a decisão se
> executa, e dois deles precisam de confirmação humana antes de virar tarefa.

### DM-1 — O repositório nunca foi publicado. O `ci.yml` nunca rodou. `[VERIFIED: git + GitHub API]`

```
$ git remote -v                                   # (vazio)
$ git rev-parse --abbrev-ref --symbolic-full-name @{u}
fatal: no upstream configured for branch 'main'
$ git rev-list --count HEAD
161
$ curl -o /dev/null -w '%{http_code}' https://api.github.com/repos/gustavoktausend/DungeonGuys2
404
```

161 commits, nenhum remote, nenhum upstream, e o repositório não existe no GitHub. Isso é
coerente com `docs/DECISOES-MARCO0.md:86` ("o repositório não tem remote algum e o branch
nunca foi publicado"), escrito no Marco 0 e ainda verdadeiro.

**Consequências para o plano:**

1. **Criar o repositório e empurrar é pré-requisito de D2-05**, e ninguém o escreveu. O
   `gh` CLI está instalado nesta máquina (`gh version 2.83.2`), então é um comando.
2. **A primeira execução do `ci.yml` num runner é um evento não testado.** Os oito portões
   — incluindo `npm run test:browser` (Chromium+Firefox+WebKit por Vitest browser mode) e
   `sim:version:verify` (três builds completos) — foram validados só localmente, em Windows
   com Node 24.11.1. Num `ubuntu-latest` com Node 24.x mais recente, o `SIM_VERSION`
   **pode dar outro valor**: o hash é do bundle minificado pelo esbuild embutido no Vite, e
   esbuild emite binários por plataforma. Isso não quebra `sim:version:verify` (que só exige
   reprodutibilidade *dentro* de uma execução) mas significa que o valor visto localmente e o
   do CI podem diferir. **Não é bloqueador desta fase** — `SIM_VERSION` não se move aqui e
   ninguém compara os dois — mas é bom saber antes de a fase 3 usá-lo no handshake.
3. **O gate de deploy depende de um CI cuja saúde é hipótese.** A primeira tarefa útil da
   fase é "empurrar e ver o `ci.yml` verde", antes de qualquer trabalho de VPS.

### DM-2 — Não existe PWA do DungeonGuys2 para despedir. O do DungeonGuys **original** está vivo. `[VERIFIED: HTTP]`

```
$ curl -o /dev/null -w '%{http_code}' https://gustavoktausend.github.io/DungeonGuys2/
404
$ curl -o /dev/null -w '%{http_code}' https://gustavoktausend.github.io/DungeonGuys/
200
$ curl -o /dev/null -w '%{http_code}' https://gustavoktausend.github.io/DungeonGuys/sw.js
200
```

A listagem pública de repositórios de `gustavoktausend` (23 repos, todos públicos) contém
`DungeonGuys` (push em 2026-06-22) e **não** contém `DungeonGuys2`.

**A premissa literal de D2-12 é falsa para o DungeonGuys2:** não há jogador com o PWA
instalado, porque nunca houve URL de onde instalar. Publicar a página de despedida no Pages
significaria que o **primeiro** deploy do DungeonGuys2 no GitHub Pages seria também o
último, e que a página existiria para avisar zero pessoas.

Isso **não** reabre D2-12 — a decisão é do usuário. É informação nova que a discussão não
tinha, e o planejador deve tratá-la como `checkpoint:human-verify` antes de gastar uma
tarefa: *"medimos que o Pages do DungeonGuys2 nunca existiu; a despedida de D2-12 ainda faz
sentido, ou INFRA-01 já está satisfeito por não haver espelho para matar?"*

### DM-3 — Um `sw.js` de despedida escrito do jeito óbvio destrói o cache do jogo original `[VERIFIED: conteúdo servido]`

O service worker vivo em `https://gustavoktausend.github.io/DungeonGuys/sw.js`:

```js
const CACHE = 'dungeonguys-v3';
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});
```

**Cache Storage é por origem, não por escopo.** `caches.keys()` num service worker de
escopo `/DungeonGuys2/` enxerga e pode apagar `dungeonguys-v3`, que pertence ao jogo
original — um produto que o PROJECT.md declara vivo e independente. Duas consequências:

1. **Se D2-12 sobreviver**, o `sw.js` de despedida **não pode** fazer `caches.keys()` e
   deletar tudo. Tem de deletar por allowlist de prefixo próprio (`dungeonguys2-`, `dg2-`) e
   chamar `registration.unregister()`. Escrever `caches.keys().then(ks => ks.map(caches.delete))`
   ali é sabotar o jogo irmão.
2. **Retroativamente, isso valida INFRA-01 mais forte do que o requisito diz.** Os dois
   jogos compartilhando `gustavoktausend.github.io` nunca teriam funcionado offline ao mesmo
   tempo: o `activate` do original já apagava qualquer cache que não fosse o dele, então
   `dungeonguys2-v1` teria sido destruído toda vez que o original atualizasse. O
   `src/app/save.ts:6-11` viu metade do problema (colisão de `localStorage`) e resolveu com
   chave própria; a metade do Cache Storage não tem solução por nome — só por origem
   separada. **Domínio próprio não é conforto, é o que faz o PWA funcionar.**

### DM-4 — `needs:` não atravessa workflows `[CITED: docs.github.com/actions]`

`jobs.<job_id>.needs` referencia **ids de job do mesmo workflow**. Encadear `deploy.yml`
depois de `ci.yml` exige `on: workflow_run:` (outro gatilho, outro checkout, e o arquivo do
workflow lido é o da branch padrão), ou fundir os dois. Como D2-05 quer literalmente "o que
foi publicado é o que passou no portão", e como o `deploy.yml` atual **duplica**
`lint`/`test`/`build` com **Node 20** enquanto o `ci.yml` usa **Node 24**:

**Recomendação: apagar `deploy.yml` e acrescentar um job `deploy` ao `ci.yml`**, com
`needs: test`, `if: github.ref == 'refs/heads/main' && github.event_name == 'push'`, e o
`dist/` viajando entre os jobs por `actions/upload-artifact` / `download-artifact`. Assim o
artefato publicado é **byte a byte** o que o job `test` produziu depois do cross-engine — não
um rebuild que por acaso deu no mesmo. Isso resolve a duplicação e a divergência de Node de
uma vez.

### DM-5 — `index.html` tem caminhos relativos que o Vite não reescreve `[VERIFIED: build local]`

`npm run build` executado nesta sessão. O `dist/index.html` gerado:

```html
<link rel="manifest" href="manifest.json" />          <!-- relativo, NÃO reescrito -->
<link rel="icon" href="icons/icon-192.png" />          <!-- relativo, NÃO reescrito -->
<script type="module" crossorigin src="/DungeonGuys2/assets/index-DuyWLVhi.js"></script>
<link rel="stylesheet" crossorigin href="/DungeonGuys2/assets/index-BIs87PxM.css">
```

O Vite prefixa `base` só nas entradas que ele gera (`assets/*`). Os `href` escritos à mão
ficam relativos ao **documento**. Hoje funciona porque o documento é sempre
`/DungeonGuys2/`. Com `base: '/'` e `try_files {path} /index.html`, qualquer URL fundo
(`/qualquer/coisa`) serve o `index.html` e então `manifest.json` resolve para
`/qualquer/manifest.json` → 404, e o PWA deixa de ser instalável naquela navegação.

**Recomendação:** ao trocar `base`, tornar esses dois `href` **absolutos de raiz**
(`/manifest.json`, `/icons/icon-192.png`) — e considerar **não** usar `try_files ... /index.html`,
já que o jogo não tem roteamento de cliente nenhum: um 404 honesto é melhor que um
`index.html` servido com 200 numa URL errada, que o service worker então guardaria no cache.

### DM-6 — `public/manifest.json` usa `start_url` e `scope` com `"."` `[VERIFIED: arquivo]`

`"start_url": "."` e `"scope": "."` resolvem contra a URL do manifesto. Servido de
`/manifest.json`, ambos viram `/` — que é exatamente o que se quer com `base: '/'`. **Não
precisa mudar**, mas precisa ser conferido no teste de instalação limpa (o escopo do SW e o
escopo do manifesto têm de bater, ou o Chrome recusa a instalação como "fora do escopo").

---

## Standard Stack

Todas as versões abaixo foram consultadas no registro npm / releases oficiais **em
2026-08-31**.

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| **Caddy** | **2.11.4** (2026-06-03) | TLS automático + estático + reverse proxy | `[VERIFIED: github.com/caddyserver/caddy/releases]` ACME sem cron, HTTP/2+3 por padrão, binário único. Numa VPS sem plantão, a peça que não precisa de manutenção é a que não quebra num domingo |
| **Node.js** | **24.20.0 LTS** ("Krypton", 2026-08-26) | Runtime do `apps/server` | `[VERIFIED: nodejs.org/dist/index.json]` LTS ativo. O `ci.yml` já usa `node-version: '24'`; a máquina de dev está em 24.11.1 |
| **Hono** | **4.13.5** | Framework HTTP do `apps/server` | `[VERIFIED: npm registry]` `[CITED: STACK.md]` Web-standard `Request`/`Response`; o Better Auth da fase 6 monta direto |
| **`@hono/node-server`** | **2.1.1** | Cola Hono ↔ `node:http` | `[VERIFIED: npm registry]` O `serve()` devolve o `http.Server` real — **este é o motivo de escolher Hono agora**, porque a fase 3 precisa anexar o `ws` no evento `upgrade` |
| **`better-sqlite3`** | **13.0.3** | Driver SQLite síncrono | `[VERIFIED: npm registry]` 10,4M downloads/semana. **v13 embarca os prebuilds no próprio pacote** e removeu o `prebuild-install` — sem `install`/`postinstall` script nenhum |
| **Kysely** | **0.29.5** | Query builder tipado + migrator | `[VERIFIED: npm registry]` `[CITED: kysely.dev/docs/migrations]` `Migrator` + `MigrationProvider` embutidos; SQL portável para Postgres se a fase 9 exigir |
| **Litestream** | **0.5.16** (2026-08-05) | Replicação contínua do SQLite para bucket S3 | `[VERIFIED: github.com/benbjohnson/litestream/releases]` Binário único + unit systemd. Ponto de recuperação em segundos |
| **systemd** | (do SO) | Supervisão, sandbox e limites de memória | Já instalado, sobrevive a reboot, journald de graça, `MemoryMax` por unit |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| **`@playwright/test`** | **1.62.1** | O teste de PWA de D2-11 | **Novo devDependency.** Fixar em `1.62.1` exato, igual ao `playwright` que já está no lock, para reaproveitar o cache de binários do `ci.yml` |
| **`esbuild`** | **0.28.2** | Bundle do `apps/server` para produção | Só se o servidor virar TypeScript com imports de workspace. Ver § Don't Hand-Roll para a armadilha do `FileMigrationProvider` |
| **`tsx`** | **4.23.12** | Rodar `apps/server` em TypeScript em dev | Conveniência de dev; não vai para a VPS |
| **`pino`** | **10.3.1** | Log estruturado JSON no journald | `[VERIFIED: npm registry]` Recomendado pela STACK.md desde o dia 1. **Opcional nesta fase**: um servidor com uma rota e um migrator loga bem com `console.log` estruturado à mão. Adotar quando houver o que correlacionar (fase 3) |
| **`zod`** | 4.5.4 | Validação de payload de rede | **Não nesta fase.** `/api/health` não recebe entrada. `packages/protocol` hoje declara `dependencies: {}` — manter |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Hono 4.13.5 | Fastify 5.x + `@fastify/websocket` | Igualmente sólido. Perde o encaixe direto do Better Auth (fase 6 precisaria de adaptador) e esconde o `http.Server` atrás do plugin de WebSocket, que é justamente o que a fase 3 quer controlar. **Recusado por acoplamento futuro, não por qualidade** |
| Hono | `node:http` puro | Tentador: uma rota só. Mas `apps/server` cresce em toda fase daqui em diante, e trocar de framework com rotas já escritas é pior que escolher agora |
| `better-sqlite3` 13 | `node:sqlite` do Node 24 | Stability 1.2 (RC). Elimina o único módulo nativo. Reavaliar quando for Stable — a troca é pequena porque o `SqliteDialectConfig` do Kysely aceita qualquer driver com a mesma forma de interface |
| Litestream | `VACUUM INTO` noturno + rclone | Ponto de recuperação de um dia. Para um ledger de moeda, um dia é dinheiro que sumiu (D2-17) |
| Litestream | Snapshot da Hostinger | Cai junto com a caixa. Backup tem de sair da VPS por princípio (armadilha 13) |
| rsync | `tar \| ssh 'tar -x'` | Funciona e não precisa de rsync na VPS. Perde `--link-dest` (dedup por hardlink entre releases) e o `--delete`. **rsync recomendado**; tar é o plano B se a caixa não puder receber `apt install rsync` |
| `@playwright/test` | Vitest browser mode (já instalado) | **Recusado.** O Vitest browser roda o teste *dentro* da página, no dev server dele: não dá para servir um `dist/` construído numa origem controlada, nem encenar "build velho → build novo", nem derrubar o servidor para simular offline de verdade |
| Script post-build `.mjs` | Plugin do Vite | Ver § Architecture Patterns, Padrão 3. O `tools/` já é a convenção do projeto para isso |
| Script post-build `.mjs` | `define()` do Vite | **Impossível.** Medido: `public/sw.js` e `dist/sw.js` são **byte a byte idênticos** (2549 B) — o Vite copia `public/` verbatim, sem passar pelo pipeline de transform, então `define` não alcança o arquivo |

**Installation:**

```bash
# apps/server (workspace novo — D2-04 mantém isto FORA da raiz)
npm i -w apps/server hono @hono/node-server better-sqlite3 kysely
npm i -D -w apps/server @types/better-sqlite3 tsx esbuild

# raiz: só o runner do teste de PWA, na MESMA versão do playwright já travado
npm i -D @playwright/test@1.62.1

# VPS (Debian/Ubuntu)
sudo apt install caddy rsync
# litestream: binário do release do GitHub (0.5.16) + unit systemd
# node 24 LTS: NodeSource ou nvm
```

**Version verification:** todas as versões acima vieram de `npm view <pkg> version` e das
APIs de release do GitHub, executados nesta sessão (2026-08-31). Nenhuma veio de memória.

---

## Package Legitimacy Audit

Gate executado com `slopcheck 0.6.1` (`pip install slopcheck --break-system-packages`),
mais `npm view` no registro correto (npm, ecossistema Node) e checagem de `postinstall`.

| Package | Registry | Downloads | Source Repo | postinstall | slopcheck | Disposition |
|---------|----------|-----------|-------------|-------------|-----------|-------------|
| `hono` | npm 4.13.5 | 59,6M/sem | github.com/honojs/hono | nenhum | **[OK]** | Aprovado |
| `@hono/node-server` | npm 2.1.1 | 57,0M/sem | github.com/honojs/node-server | nenhum | **[OK]** | Aprovado |
| `better-sqlite3` | npm 13.0.3 | 10,4M/sem | github.com/WiseLibs/better-sqlite3 | nenhum (v13 removeu `prebuild-install`) | **[OK]** | Aprovado |
| `kysely` | npm 0.29.5 | 16,3M/sem | github.com/kysely-org/kysely | nenhum | **[OK]** | Aprovado |
| `@playwright/test` | npm 1.62.1 | 58,4M/sem | github.com/microsoft/playwright | nenhum | **[OK]** | Aprovado |
| `pino` | npm 10.3.1 | — | github.com/pinojs/pino | nenhum | **[OK]** | Aprovado (opcional nesta fase) |
| `zod` | npm 4.5.4 | — | github.com/colinhacks/zod | nenhum | **[OK]** | Aprovado, **não usado nesta fase** |

**Packages removed due to slopcheck [SLOP] verdict:** nenhum.
**Packages flagged as suspicious [SUS]:** nenhum.

Saída literal: `scanned 7 packages / 7 OK`. (O `slopcheck install` termina com um traceback
ao tentar encadear `npm install` no Windows; a varredura completa antes disso e **nada foi
instalado**.)

**Não-npm, verificados por release oficial:** Caddy 2.11.4, Litestream 0.5.16, Node 24.20.0.
Todos instalados por apt / binário de release, fora do grafo npm.

---

## Architecture Patterns

### System Architecture Diagram

```
   push na main
        │
┌───────▼─────────────────────────────────────────┐
│  GitHub Actions — ci.yml, job "test"            │
│  lint · typecheck:sim · typecheck:protocol      │
│  test · sim:version:verify · assets(3) ·        │
│  test:browser (cross-engine) · pwa (NOVO) ·     │
│  build ─────────────────────────► dist/ 350 KB  │
│                                    (artifact)   │
└───────┬─────────────────────────────────────────┘
        │  needs: test   +   if: main && push
┌───────▼──────────────────────┐
│  ci.yml, job "deploy"        │  download-artifact (o MESMO dist/)
│  ssh-keyscan → known_hosts   │
│  rsync --link-dest ──────────┼──── SSH ────┐
│  ssh 'ln -sfn … current.tmp' │             │
└──────────────────────────────┘             │
                                             │
════════════════════════════ VPS ════════════▼══════════════════════
                                             │
  /srv/dg2/releases/<sha-1>/  ◄── hardlinks ─┤
  /srv/dg2/releases/<sha>/    ◄──────────────┘
  /srv/dg2/current ──symlink──► releases/<sha>          poda: mantém 5
        ▲
        │ root *
┌───────┴────────────────────────────────────────────────────────┐
│  Caddy :80/:443   TLS automático (ACME)   {$DG2_DOMAIN}        │
│                                                                 │
│   handle /api/*  ─► reverse_proxy {$DG2_UPSTREAM} ─────────────┼──┐
│   handle /ws     ─► (reservado; fase 3)                        │  │
│   handle         ─► header Cache-Control por classe de arquivo │  │
│                     file_server root=/srv/dg2/current          │  │
│   handle_errors  ─► 503 JSON quando o upstream está fora       │  │
└───────┬─────────────────────────────────────────────────────────┘  │
        │ HTTPS                                                       │
        │                                        ┌────────────────────▼───────┐
        │                                        │  dg2.service (systemd)     │
        │                                        │  Node 24 · Hono            │
        │                                        │  ① migrator Kysely         │
        │                                        │  ② listen 127.0.0.1:8080   │
        │                                        │  GET /api/health           │
        │                                        │  StateDirectory=dg2        │
        │                                        │  MemoryMax=256M            │
        │                                        └────────────┬───────────────┘
        │                                                     │ better-sqlite3
        │                                                     │ WAL
        │                                        ┌────────────▼───────────────┐
        │                                        │ /var/lib/dg2/dg2.db        │
        │                                        │   gold_entry (só ela)      │
        │                                        │   kysely_migration         │
        │                                        └────────────┬───────────────┘
        │                                                     │ lê o WAL
        │                                        ┌────────────▼───────────────┐
        │                                        │ litestream.service         │
        │                                        │ replicate → bucket S3 ─────┼──► fora da VPS
        │                                        └────────────┬───────────────┘
        │                                                     │ litestream restore -o
        │                                        ┌────────────▼───────────────┐
        │                                        │ tools/ops/restore-verify   │
        │                                        │ dir descartável            │
        │                                        │ conta linhas + soma delta  │
        │                                        │ verde/vermelho + docs/     │
        │                                        └────────────────────────────┘
        ▼
┌──────────────────────────────────────────────┐      ┌──────────────────────┐
│  Navegador — escopo do SW passa a ser  /     │      │ cert-check.timer     │
│                                              │      │ openssl -checkend 30d│
│  ① fetch handler:                            │      │ (local, vê o arquivo)│
│     não-GET .............. passa direto      │      └──────────────────────┘
│     /api/*, /ws .......... passa direto      │      ┌──────────────────────┐
│     no allowlist ......... cache-first       │      │ monitor externo      │
│     resto ................ passa direto      │      │ GET /api/health      │
│  ② nunca cache.put sem res.ok                │◄─────┤ (sobrevive à queda)  │
│  ③ CACHE = 'dg2-' + hash do build            │      └──────────────────────┘
│  ④ install: addAll(precache) e ESPERA        │
│     (sem skipWaiting)                        │
│                                              │
│  registration.waiting ──► aviso na UI        │
│         └─ aplica só com gameStarted===false │
└──────────────────────────────────────────────┘
```

### Component Responsibilities

| Arquivo / unidade | Responsabilidade | Estado |
|---|---|---|
| `vite.config.ts` | `base: '/'` | edita (1 linha) |
| `index.html` | `href` de manifest/ícone viram absolutos de raiz (DM-5) | edita |
| `src/main.ts:37-42` | Registro do SW; acompanha `BASE_URL` sozinho. Ganha a detecção de `waiting`/`updatefound` e o guard de `controllerchange` | edita |
| `src/ui/screens.ts` | Aviso de atualização (`announce` + botão na tela inicial). `GAME_URL:180` aponta para o Pages — trocar pelo domínio novo | edita |
| `public/sw.js` | Vira **template com sentinelas**; reescrito na íntegra | reescreve |
| `tools/sw/emit.mjs` | Deriva nome de cache + precache do `dist/` e reescreve `dist/sw.js` | **cria** |
| `tools/sw/verify.mjs` | Falha se `dist/sw.js` ainda tiver sentinela ou se o precache não bater com o `dist/` | **cria** |
| `apps/server/src/index.ts` | Migrator no start, `GET /api/health`, listen em `127.0.0.1` | **cria** |
| `apps/server/src/db/migrations.ts` | Provider estático com a migração `001_gold_entry` | **cria** |
| `ops/Caddyfile` | Roteamento, cabeçalhos de cache, `handle_errors` | **cria** |
| `ops/dg2.service`, `ops/litestream.service`, `ops/cert-check.{service,timer}` | Units | **cria** |
| `ops/deploy.sh`, `ops/rollback.sh`, `ops/prune-releases.sh` | Rodam **na VPS**, chamados por ssh | **cria** |
| `tools/ops/restore-verify.mjs` | Ensaio de restauração de D2-03 | **cria** |
| `.github/workflows/ci.yml` | Ganha o job `pwa` e o job `deploy` | edita |
| `.github/workflows/deploy.yml` | **apagado** (fundido no `ci.yml` — DM-4) | remove |
| `tests/pwa/*.spec.ts` + `playwright.config.ts` | Os quatro testes de D2-11 | **cria** |

### Recommended Project Structure

```
package.json                  # workspaces: ["packages/*", "apps/*"]
vite.config.ts                # base: '/'
index.html · src/ · public/   # ficam na raiz (D2-04)
packages/sim · packages/protocol
apps/
  server/
    package.json              # hono, @hono/node-server, better-sqlite3, kysely
    src/
      index.ts                # migrate() → serve()
      health.ts
      db/
        open.ts               # pragmas WAL/NORMAL/foreign_keys/busy_timeout
        migrations.ts         # provider ESTÁTICO (bundle-safe)
ops/                          # versionado, sem segredo (D2-15)
  Caddyfile
  dg2.service · litestream.service
  cert-check.service · cert-check.timer
  litestream.yml
  deploy.sh · rollback.sh · prune-releases.sh
  README.md                   # o runbook de reconstruir a caixa
tools/
  sw/emit.mjs · sw/verify.mjs
  ops/restore-verify.mjs
tests/pwa/                    # specs do @playwright/test (.spec.ts, não .test.ts)
docs/OPERACAO.md              # onde o ensaio de restauração de D2-03 é anotado
```

### Padrão 1: Release por sha com symlink e hardlinks

**O quê:** cada deploy vira um diretório imutável; publicar é trocar um symlink.
**Quando usar:** sempre que reverter precisa funcionar sem rede (D2-06).

```bash
# no runner, depois de download-artifact
rsync -az --delete \
      -e "ssh -o StrictHostKeyChecking=yes" \
      --link-dest=/srv/dg2/current/ \
      dist/ "$USER@$HOST:/srv/dg2/releases/$GITHUB_SHA/"

# na VPS: troca ATÔMICA. `ln -sfn` sobre um symlink existente NÃO é atômico
# (remove e recria); `ln -sfn` num temporário + `mv -T` é.
ln -sfn "/srv/dg2/releases/$SHA" /srv/dg2/current.tmp
mv -T /srv/dg2/current.tmp /srv/dg2/current
```

- `--link-dest` faz os arquivos idênticos ao release anterior virarem **hardlink**, então 5
  releases de 350 KB custam ~350 KB mais os deltas. Caminho tem de ser **absoluto**.
- `mv -T` sobre symlink é `rename(2)`, atômico: nenhum request pega o diretório no meio.
- **Quantos releases:** **5**. O disco é irrelevante (350 KB); o número real é "até onde
  você reverteria". 5 cobre uma tarde ruim. A poda tem de resolver `current` e nunca apagar
  o alvo vivo.

### Padrão 2: Allowlist no service worker, não denylist

**O quê:** o SW só serve do cache o que está no precache derivado, mais `/assets/` com nome
hasheado. Tudo mais passa direto para a rede, sem `respondWith`.
**Quando usar:** sempre que o escopo do SW for `/` e a API estiver na mesma origem.

**Por que é o item mais importante da fase.** INFRA-03 pede que `/api/` não entre no cache.
Um `if (pathname.startsWith('/api/')) return;` satisfaz o requisito hoje e falha em silêncio
amanhã: a fase 3 traz `/ws`, a fase 6 traz o cookie de sessão em `/api/auth/*` (coberto por
acaso), a fase 9 traz `/api/leaderboard` (idem) — mas qualquer rota que não comece com
`/api/` está descoberta, e o custo do esquecimento é resposta autenticada persistida num
armazenamento que **não respeita `Cache-Control`** e **não é limpo no logout**
(`PITFALLS.md` § 8, itens 1 e 5).

Um allowlist derivado do `dist/` não pode esquecer nada, porque só conhece arquivos que o
build produziu. A regra passa de "lembre-se de excluir" para "só o que existe entra" — a
mesma inversão que `tools/sim-version/emit.mjs` fez para o `SIM_VERSION`.

Mantenha **também** o early-return explícito de `/api/` e `/ws`: custa duas linhas, documenta
a intenção para quem ler, e é o que um revisor procura. (Nota: pelo desenho do WebSocket, o
handshake provavelmente **não** dispara o evento `fetch` do SW — `[ASSUMED]`, ver § Open
Questions. A recomendação não depende disso.)

### Padrão 3: Passo de build que deriva o precache (a forma de `emit.mjs`)

**O quê:** um script `.mjs` pós-build que lê o `dist/`, calcula um digest do conteúdo e
reescreve `dist/sw.js` a partir de um template com sentinelas.
**Quando usar:** D2-10.

**A propriedade que `tools/sim-version/emit.mjs` já documenta e que se repete aqui, invertida:**
o cabeçalho daquele script diz *"THE HASH OF AN ARTIFACT CANNOT LIVE INSIDE THAT ARTIFACT"* e
por isso escreve num arquivo irmão. O `sw.js` **precisa** carregar o hash dentro de si —
então a saída é: o hash cobre **tudo em `dist/` exceto `dist/sw.js`**. Escrever isso como
regra explícita no cabeçalho do script novo é o que impede a próxima pessoa de "consertar"
incluindo o `sw.js` e criar um build irreprodutível.

Por que **não** plugin do Vite e **não** `define()`:

- **`define()` é impossível.** Medido nesta sessão: `cmp public/sw.js dist/sw.js` → idênticos,
  2549 bytes. O Vite copia `public/` verbatim; o arquivo nunca passa pelo transform.
- **Plugin do Vite é possível** (`closeBundle`), mas enterra a lógica no `vite.config.ts`,
  não roda por `npm run <script>` (contra `tools/README.md` § 2), fica fora do lint e do
  typecheck do mesmo jeito, e não ganha nada — o `emit.mjs` já provou a forma.

Ordem no `package.json`:

```json
"build": "npm run sim:build && npm run sim:version && tsc --noEmit && vite build && npm run sw:emit",
"sw:emit":   "node tools/sw/emit.mjs",
"sw:verify": "node tools/sw/verify.mjs"
```

`sw:verify` é o análogo de `sim:version:verify`: falha se `dist/sw.js` ainda contiver uma
sentinela (alguém rodou `vite build` cru) ou se a lista no `sw.js` divergir do `dist/` real.
Sem ele, esquecer o passo publica um SW que precacheia nada e o defeito só aparece offline.

### Padrão 4: Migration provider estático, não `FileMigrationProvider`

**O quê:** um objeto literal de migrações em vez de leitura de diretório.
**Quando usar:** sempre que o servidor for empacotado (esbuild) — ou seja, aqui.

`FileMigrationProvider` lê arquivos do disco em runtime com `fs` + `path` + `import()`
dinâmico. Num servidor bundlado num `server.mjs`, isso significa: as migrações **não** entram
no bundle, precisam ser copiadas à parte para a VPS, e o `migrationFolder` tem de ser um
caminho absoluto correto na caixa. Três coisas para errar num caminho que roda **antes de o
servidor aceitar request** (D2-07) — ou seja, errar significa não subir.

`MigrationProvider` é uma interface de um método só `[VERIFIED: kysely@0.29.5 dist/migration/migrator.d.ts:353]`,
e `Migration` é `{ up(db), down?(db) }` `[VERIFIED: mesmo arquivo, :7]`. Um provider estático
tem 6 linhas, entra no bundle, e não tem caminho para errar.

### Anti-Patterns to Avoid

- **`caches.keys()` seguido de delete-tudo em qualquer SW deste projeto.** Cache Storage é
  por origem. No Pages isso destrói o jogo original (DM-3); no domínio novo é inofensivo
  hoje e vira armadilha quando houver um segundo app na origem. Sempre filtrar por prefixo
  próprio.
- **`try_files {path} /index.html` num jogo sem roteamento de cliente.** Transforma 404 em
  200 com HTML, o SW guarda, e o jogador fica com uma página errada em cache (DM-5).
- **`ln -sfn` direto sobre o symlink `current`.** Não é atômico. Use temporário + `mv -T`.
- **Restart do `dg2.service` em todo deploy.** Ver § Recomendações de Discrição, item 8.
- **Migração com `DROP`/rename na mesma versão.** D2-07 já proíbe; a razão executável é que
  o rollback do symlink **não** reverte o banco.
- **Publicar `dist/` de máquina local.** O `.gitignore` já recusa commitar `dist/`; o CI ser
  o único caminho de publicação (DM-4) é o que fecha a porta de vez.
- **Depender do aviso por e-mail do Let's Encrypt.** Encerrado em 4 de junho de 2025.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---|---|---|---|
| TLS + renovação | certbot com cron + hook de reload | **Caddy ACME embutido** | O modo de falha clássico é o certificado renovar e o servidor continuar servindo o antigo porque o hook nunca rodou (`PITFALLS.md` § 13) |
| Backup contínuo do SQLite | Cópia do `.db` por cron | **Litestream** | Copiar um SQLite em WAL sob escrita produz arquivo corrompido. Litestream lê o WAL, não o arquivo |
| Restaurar | Renomear o backup por cima | **`litestream restore -o`** | O `-o` restaura num caminho novo, sem tocar no banco vivo — que é literalmente o requisito de D2-03 |
| Versionar esquema | `CREATE TABLE IF NOT EXISTS` no boot | **`Migrator` do Kysely** | `IF NOT EXISTS` não sabe dizer *qual* versão está no disco; a segunda migração já não tem como se aplicar |
| Supervisão e limite de memória | pm2, `nohup`, script de watchdog | **systemd** | Já está lá, sobrevive a reboot, `MemoryMax` por unit é o que impede o signaling da fase 3 de matar a API |
| Lista de precache | Escrever nomes de arquivo à mão | **Derivar do `dist/`** | Já quebrou uma vez neste projeto — o cabeçalho do `public/sw.js` documenta o incidente. `cache.addAll` rejeita a instalação **inteira** por um 404 |
| Nome do cache | `'dungeonguys2-v1'` bumpado à mão | **`'dg2-' + hash do build`** | Estático significa que o `activate` nunca limpa o precache velho (`PITFALLS.md` § 8, item 4) |
| Detectar update do SW | `setInterval` chamando `reg.update()` | **`updatefound` + `registration.waiting`** | O browser já reconsulta o script do SW a cada navegação (ignorando cabeçalhos de cache), com teto de 24 h `[CITED: web.dev/service-worker-lifecycle]` |
| Comparar bancos na verificação | Diff binário dos arquivos | **Consulta: `count(*)` + `sum(delta)`** | Dois SQLite semanticamente iguais têm bytes diferentes (páginas livres, WAL). O que prova a restauração é o conteúdo, não o arquivo |
| Descobrir a chave do host SSH | `StrictHostKeyChecking=no` | **`known_hosts` fixado em secret** | `ssh-keyscan` no próprio job confia no primeiro que responder — é TOFU dentro de um pipeline de deploy. Fixar a chave num secret custa uma linha |
| Encadear deploy depois do CI | Ação de terceiro que dispara workflow | **Um job com `needs:` no mesmo workflow** | DM-4. Menos superfície de supply chain no caminho que tem a chave SSH |

**Key insight:** todo item desta tabela tem o mesmo formato de falha — funciona no dia em que
foi escrito, e falha em silêncio meses depois, num domingo, sem ninguém de plantão. É a
razão pela qual esta fase existe agora, com o jogo single-player, em vez de junto com a rede.

---

## Runtime State Inventory

> Fase de migração: as cinco categorias são respondidas explicitamente.

| Category | Items Found | Action Required |
|---|---|---|
| **Stored data** | `localStorage` em `gustavoktausend.github.io`: chaves `dungeonguys2_save_v1` e `dungeonguys2_ledger_v1` — **nenhuma existe**, verificado por DM-2 (o jogo nunca foi servido dessa URL). O que existe na origem é o save do **DungeonGuys original**. O save de desenvolvimento vive em `http://localhost:5173`, **outra origem**, que não acompanha a migração. | **Nenhuma migração de dado.** Registrar em `docs/` que o progresso local de dev não vai para o domínio novo — coerente com o descarte já aceito no ADR 0010 |
| **Stored data (2)** | **Cache Storage** de `gustavoktausend.github.io`: `dungeonguys-v3`, do jogo original, **vivo**. O `activate` dele apaga todo cache da origem com outro nome (DM-3). | Se D2-12 sobreviver: apagar **só** por prefixo `dungeonguys2-`/`dg2-`. Nunca `caches.keys()` inteiro |
| **Live service config** | GitHub Pages do DungeonGuys2: **não existe** (404, repo inexistente). DNS do domínio novo: fora do repositório por D2-15, declarado pronto por D2-13 — **não verificável desta máquina**, e o nome do domínio nunca aparece no repo. Bucket S3/B2 do Litestream: a criar. Monitor externo: a criar. | Confirmar DNS/A record e a região da VPS **antes** da primeira tarefa de VPS (a região é escolha barata agora e cara na fase 3, quando o TURN entra) |
| **OS-registered state** | Hoje: **nada**. Não há `ops/`, `Dockerfile`, nem qualquer artefato de infra no repositório. A fase **cria** `dg2.service`, `litestream.service`, `cert-check.service`, `cert-check.timer`, um drop-in de `caddy.service` (para o `EnvironmentFile`), e o usuário de sistema `dg2` | Registrar cada unit em `ops/README.md` como runbook. É este inventário que uma futura renomeação ou reconstrução de caixa vai ter de caçar |
| **Secrets / env vars** | Hoje: **nenhum**. A fase cria `/etc/dg2/env` (`DG2_DOMAIN`, `DG2_UPSTREAM`, `DG2_DB`, credenciais S3 do Litestream) e os secrets do GitHub (`DEPLOY_SSH_KEY`, `DEPLOY_HOST`, `DEPLOY_USER`, `DEPLOY_KNOWN_HOSTS`) | Documentar a lista de chaves em `ops/README.md` **sem valores**. `/etc/dg2/env` com `chmod 600` e dono `root` — o `EnvironmentFile` é lido pelo systemd antes de baixar privilégio |
| **Build artifacts** | `dist/` e `packages/sim/dist/` são gitignored. Verificado: `dist/index.html` na árvore atual tem `/DungeonGuys2/assets/...` **cravado** — um `dist/` antigo numa máquina de dev fica errado assim que `base` mudar. `dist/assets/CREDITS.md` e `100_Anims_Order_List.txt` (4,8 KB) vêm de `public/assets/` e entrariam num precache "tudo" | Nenhuma ação de migração (o CI é a única fonte do `dist/` publicado). Decidir se o precache exclui os dois arquivos de texto — recomendação: **incluir**, porque "tudo menos `sw.js`" é uma regra que não se esquece |

**A pergunta canônica, respondida:** depois que todo arquivo do repositório estiver
atualizado, o que ainda carrega o estado antigo? **Praticamente nada** — porque
praticamente nada foi publicado. O único estado de runtime real fora deste repositório é o
do **jogo original** no GitHub Pages, e a ação sobre ele é **não tocar**.

---

## Common Pitfalls

### P-1: Trocar `base` e o escopo do SW na mesma tarefa que reescreve o `sw.js`

**O que dá errado:** o teste de atualização falha e não se sabe se a causa é o escopo novo,
o precache novo ou o fim do `skipWaiting`. Três mudanças, um sintoma.
**Por que acontece:** as três moram no mesmo arquivo mental.
**Como evitar:** a CONTEXT.md já ordena a separação. Concretamente: **tarefa A** troca `base`
para `'/'`, arruma os `href` relativos de DM-5, e faz os testes de instalação limpa e de
atualização passarem **com o `sw.js` atual**. **Tarefa B** reescreve o `sw.js` com os mesmos
testes já verdes servindo de rede.
**Bônus:** o `sw.js` atual (com `skipWaiting`, `CACHE='dungeonguys2-v1'`, precache à mão) é o
**fixture perfeito de "instalação antiga"** que o critério 2 exige atualizar. Guarde-o em
`tests/pwa/fixtures/old-build/` em vez de depender de histórico de deploy.
**Sinais de alerta:** teste de update vermelho logo depois de um commit que mexeu em duas coisas.

### P-2: `cache.put` sem checar `res.ok`

**O que dá errado:** 30 segundos de 502 durante um deploy viram um `index.html` de erro
cacheado para sempre (Cache Storage ignora `Cache-Control` por desenho).
**Por que acontece:** o handler atual (`public/sw.js:65-74`) clona e guarda a resposta antes
de olhar o status.
**Como evitar:** `if (res.ok) cache.put(...)` — e, com o allowlist do Padrão 2, o `handle_errors`
do Caddy devolvendo 503 para `/api/*` nem chega perto do cache.
**Sinais de alerta:** página branca depois de um deploy que teve erro.

### P-3: Nome de cache estático faz o `activate` nunca limpar o precache

**O que dá errado:** `activate` apaga caches com nome diferente do atual — mas o nome nunca
muda, então os itens do precache **nunca são renovados** (`PITFALLS.md` § 8, item 4).
**Como evitar:** `CACHE = 'dg2-' + <hash do build>`. O critério 3 ("um deploy novo não deixa o
cache velho para trás") é literalmente esta linha, e é testável: depois de atualizar,
`caches.keys()` tem de ter **comprimento 1**.

### P-4: `cache.addAll` usa o cache HTTP e pode precachear coisa velha

**O que dá errado:** `addAll` faz fetch normal, sujeito ao cache HTTP do browser. Como
`index.html`, `manifest.json` e `sw.js` **não** têm nome hasheado, um proxy ou um cache
intermediário pode entregar a versão anterior — e ela entra no precache "novo".
**Como evitar:** `cache.addAll(urls.map(u => new Request(u, { cache: 'reload' })))`, mais o
`header @shell Cache-Control "no-cache"` do Caddyfile. As duas metades, não uma.
**Sinais de alerta:** offline mostra uma build anterior à que está no ar.

### P-5: `handle` no Caddyfile é reordenado — `route` não é

**O que dá errado:** alguém troca `handle` por `route` "para ter controle" e o
`file_server` da raiz passa a engolir `/api/*`.
**Por quê:** `[CITED: caddyserver.com/docs/caddyfile/directives/handle]` *"The `handle`
directives are sorted according to the directive sorting algorithm by their matchers"* e
*"only the first matching `handle` block will be evaluated"*. Ou seja: com `handle`, a ordem
no arquivo **não importa** e `/api/*` ganha por ser mais específico. Com `route`, a ordem
escrita é a ordem executada.
**Como evitar:** usar `handle`, escrever na ordem lógica mesmo assim (legibilidade), e deixar
um comentário no `ops/Caddyfile` dizendo por que trocar para `route` exigiria reordenar.
**Correção à `STACK.md`:** o "must come BEFORE the static handler" está certo em intenção e
impreciso em mecanismo.

### P-6: Placeholder de ambiente errado no Caddyfile — e o reload que não relê o env

**O que dá errado:** `{env.DG2_DOMAIN}` no endereço do site não funciona.
**Por quê:** `[CITED: caddyserver.com/docs/caddyfile/concepts]` *"Placeholders cannot be used
in addresses, but you may use Caddyfile-style environment variables in them"*. `{$VAR}` é
substituído **antes do parse**; `{env.VAR}` é resolvido em runtime e só onde o módulo suporta.
**Como evitar:** `{$DG2_DOMAIN}` (com default opcional: `{$DG2_DOMAIN:localhost}`), mais um
drop-in `systemctl edit caddy` com `EnvironmentFile=/etc/dg2/env`.
**Segunda metade, mais traiçoeira:** `systemctl reload caddy` **não relê o `EnvironmentFile`** —
o reload roda no ambiente do processo existente. Mudar o domínio exige `systemctl restart caddy`.
A doc do Caddy insiste em reload para não ter downtime; as duas coisas são verdadeiras e
precisam estar escritas no `ops/README.md`.

### P-7: Offline "completo" que depende das fontes do Google

**O que dá errado:** `index.html:11-13` carrega `Press Start 2P` e `Pixelify Sans` de
`fonts.googleapis.com`/`fonts.gstatic.com`. São **cross-origin**: não entram num precache
derivado do `dist/`, e `cache.addAll` com URL cross-origin produz resposta opaca (ou falha).
Numa instalação limpa que vai para offline antes de a fonte ser buscada, o jogo renderiza com
`system-ui`/`monospace` — os fallbacks declarados em `src/style.css:21-22`.
**Como evitar:** três opções honestas, e a decisão é do planejador:
 (a) **auto-hospedar as duas fontes** em `public/fonts/` — elas passam a estar no `dist/`,
     entram no precache por construção, somem os dois `preconnect`, e o jogo fica
     verdadeiramente independente de terceiro. Custo: ~30–60 KB e uma checagem de licença
     (ambas são OFL);
 (b) manter a busca lazy e **aceitar** que offline-limpo usa fonte de fallback;
 (c) precachear as URLs do Google com `{ mode: 'no-cors' }` — **recusar**: resposta opaca
     ocupa cota inflada, não dá para verificar `res.ok`, e é dependência de terceiro no
     caminho offline.
**Recomendação:** (a) se couber na fase; (b) se não — mas então o teste de offline **não pode**
assertar "pixel-perfect", só "o jogo abre e a tela inicial responde".
**Sinais de alerta:** teste de offline vermelho por `requestfailed` em `fonts.gstatic.com` —
que é um falso negativo se a decisão foi (b). O teste tem de filtrar por origem própria.

### P-8: Litestream v0.5 usa `replica:` singular

**O que dá errado:** copiar `replicas:` (array) de qualquer tutorial e o Litestream recusar
ou ignorar a configuração.
**Por quê:** `[CITED: litestream.io/reference/config/]` *"v0.5.0 Each database now supports
only a single replica"*. Todo material anterior a v0.5 mostra o array.
**Como evitar:** `dbs: [{ path: ..., replica: { type: s3, ... } }]`, com `endpoint` explícito
para B2/MinIO (o `force-path-style` liga sozinho quando há `endpoint`). Credenciais por
`${AWS_ACCESS_KEY_ID}` vindas do `EnvironmentFile`, nunca literais no arquivo versionado.
**Segundo item:** desde v0.5.7 o `restore` detecta sozinho formato v0.3.x vs LTX.

### P-9: Migração que falha vira crash-loop invisível

**O que dá errado:** `Restart=always` + migração quebrada = o serviço reinicia para sempre,
o journald enche, e nada dispara alarme porque a unit nunca fica `failed`.
**Como evitar:** `StartLimitIntervalSec=60` + `StartLimitBurst=5` em `[Unit]`. Depois de 5
tentativas em 60 s o systemd desiste e a unit vai para `failed` — e aí o `/api/health` para
de responder, o `handle_errors` do Caddy devolve 503, e o monitor externo de D2-16 avisa.
**A cadeia inteira só fecha com esse limite.** Sem ele, o sintoma é "às vezes o health
falha", que é o pior tipo de alarme.
**Sinais de alerta:** `systemctl status dg2` com `Active: activating (auto-restart)` persistente.

### P-10: `MemoryMax` sem limitar o heap do V8 troca GC por OOM-kill

**O que dá errado:** o cgroup mata o processo em vez de o V8 coletar lixo, porque o V8
dimensiona o heap padrão pela memória **da máquina**, não pelo limite do cgroup.
**Como evitar:** parear sempre — `MemoryMax=256M` + `Environment=NODE_OPTIONS=--max-old-space-size=192`.
O V8 passa a fazer GC agressivo antes de o cgroup agir.
**Orçamento sugerido numa caixa de 2 GB, já reservando a fase 3:** Caddy ~64 M · `dg2` 256 M ·
Litestream ~64 M · coturn (fase 3) ~128 M + buffers de relay → sobra ~1,4 GB para SO e page
cache. **Numa caixa de 1 GB isso fica apertado com o coturn** — é a última hora barata de
subir o plano da VPS (ver § Open Questions).

### P-11: Cache Storage e `localStorage` não são particionados por escopo

Já descrito em DM-3. Repetido aqui porque é o defeito mais fácil de reintroduzir: escopo de
service worker é `/caminho/`; Cache Storage, `localStorage` e IndexedDB são **por origem**.
Qualquer SW da origem enxerga o armazenamento de todos os apps dela.

### P-12: `--link-dest` com caminho relativo silenciosamente não dedupa

`rsync` resolve `--link-dest` relativo ao **destino**. Um `--link-dest=../current` funciona
por acidente em alguns layouts e falha em outros, sem erro — só sem hardlink. Use caminho
absoluto e confira uma vez com `stat -c %h` num arquivo repetido (contagem de links > 1).

---

## Code Examples

> Padrões verificados. Comentários em inglês (convenção do projeto).

### `ops/Caddyfile`

```caddyfile
# {$VAR} is substituted BEFORE parsing, which is the only form that works in a
# site address. {env.VAR} would not. Source: caddyserver.com/docs/caddyfile/concepts
# The values live in /etc/dg2/env, read via a `systemctl edit caddy` drop-in.
# NOTE: `systemctl reload caddy` does NOT re-read EnvironmentFile — changing the
# domain needs `systemctl restart caddy`.
{$DG2_DOMAIN} {
    encode zstd gzip

    # `handle` blocks are MUTUALLY EXCLUSIVE and Caddy sorts them by matcher
    # specificity, so this order is for readers, not for correctness. Switching
    # any of these to `route` WOULD make file order load-bearing.
    handle /api/* {
        reverse_proxy {$DG2_UPSTREAM:127.0.0.1:8080}
    }

    # Reserved for phase 3 signalling. Present now so the shape is visible.
    handle /ws {
        reverse_proxy {$DG2_UPSTREAM:127.0.0.1:8080}
    }

    handle {
        root * /srv/dg2/current

        # Vite emits content-hashed names under /assets — safe to pin forever.
        @assets path /assets/index-*.js /assets/index-*.css
        header @assets Cache-Control "public, max-age=31536000, immutable"

        # The shell has stable names, so it must never be pinned: a stale
        # index.html or sw.js freezes the PWA on an old build.
        @shell path / /index.html /sw.js /manifest.json
        header @shell Cache-Control "no-cache"

        # NO `try_files {path} /index.html`: this game has no client-side
        # routing, and turning 404s into 200 HTML gives the service worker a
        # wrong page to cache (see DM-5).
        file_server
    }

    # When dg2.service is down, answer machine-readable 503 instead of "Bad
    # Gateway" plain text — the external monitor of D2-16 needs to tell
    # "Caddy up, Node down" from "box down".
    handle_errors {
        @api expression {err.status_code} == 502 || {err.status_code} == 503
        handle @api {
            header Content-Type application/json
            header Cache-Control no-store
            respond `{"status":"unavailable"}` 503
        }
        respond "{err.status_code} {err.status_text}" {err.status_code}
    }
}
```

### `ops/dg2.service`

```ini
[Unit]
Description=DungeonGuys2 API
After=network-online.target
Wants=network-online.target
# Without a start limit, a failing migration restarts forever and never
# surfaces as `failed` — the alarm chain of D2-16 would stay silent (P-9).
StartLimitIntervalSec=60
StartLimitBurst=5

[Service]
Type=simple
User=dg2
Group=dg2
WorkingDirectory=/srv/dg2/current-server
ExecStart=/usr/bin/node /srv/dg2/current-server/server.mjs
Environment=NODE_ENV=production
# Pair MemoryMax with a V8 heap cap, or the cgroup OOM-kills instead of the
# GC running (P-10).
Environment=NODE_OPTIONS=--max-old-space-size=192
EnvironmentFile=/etc/dg2/env
Restart=always
RestartSec=2

# StateDirectory creates and chowns /var/lib/dg2 AND implies ReadWritePaths for
# it — one directive instead of two, and it survives a wiped /var.
StateDirectory=dg2
StateDirectoryMode=0700

NoNewPrivileges=true
ProtectSystem=strict
ProtectHome=true
PrivateTmp=true
PrivateDevices=true
ProtectKernelTunables=true
ProtectKernelModules=true
ProtectControlGroups=true
RestrictSUIDSGID=true
RestrictNamespaces=true
LockPersonality=true
RestrictAddressFamilies=AF_INET AF_INET6 AF_UNIX
MemoryHigh=200M
MemoryMax=256M

[Install]
WantedBy=multi-user.target
```

### `apps/server/src/db/migrations.ts` — provider estático

```ts
// A static provider instead of FileMigrationProvider: this server is bundled to
// a single server.mjs, and FileMigrationProvider would read from disk at
// runtime — three ways to get a path wrong in the one step that runs BEFORE the
// server accepts a request (D2-07).
import type { Kysely, Migration, MigrationProvider } from 'kysely';
import { sql } from 'kysely';

// D2-07: migrations are ALWAYS additive. No DROP, no rename inside one version —
// rolling the `current` symlink back does not roll the database back.
const migrations: Record<string, Migration> = {
  // docs/adr/0010-soul-gold-ledger-append-only.md
  '001_gold_entry': {
    async up(db: Kysely<any>): Promise<void> {
      await db.schema
        .createTable('gold_entry')
        .addColumn('id', 'text', c => c.primaryKey())     // client-minted ULID
        .addColumn('account_id', 'text', c => c.notNull())
        .addColumn('delta', 'integer', c => c.notNull())  // +earn / -spend
        .addColumn('reason', 'text', c => c.notNull())
        .addColumn('device_id', 'text', c => c.notNull())
        .addColumn('created_at', 'integer', c => c.notNull()) // epoch ms, portable
        .execute();

      // Idempotency of D2-02: syncing the same event twice is a no-op.
      await db.schema
        .createIndex('gold_entry_account')
        .on('gold_entry')
        .columns(['account_id', 'created_at'])
        .execute();
    },
    // `down` exists for local development only. Production never runs it: see
    // the additive rule above.
    async down(db: Kysely<any>): Promise<void> {
      await db.schema.dropTable('gold_entry').execute();
    },
  },
};

export const provider: MigrationProvider = {
  async getMigrations() {
    return migrations;
  },
};
```

### `apps/server/src/index.ts` — start, migração, `/api/health`

```ts
import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import Database from 'better-sqlite3';
import { Kysely, SqliteDialect, Migrator } from 'kysely';
import { provider } from './db/migrations.js';

const DB_PATH = process.env.DG2_DB ?? '/var/lib/dg2/dg2.db';
const PORT = Number(process.env.DG2_PORT ?? 8080);
const RELEASE = process.env.DG2_RELEASE ?? 'dev';

const sqlite = new Database(DB_PATH);
sqlite.pragma('journal_mode = WAL');        // required by Litestream
sqlite.pragma('synchronous = NORMAL');
sqlite.pragma('foreign_keys = ON');
sqlite.pragma('busy_timeout = 5000');

const db = new Kysely<any>({ dialect: new SqliteDialect({ database: sqlite }) });

// D2-07: migrate BEFORE accepting a request. Exiting non-zero here is correct —
// systemd's StartLimitBurst turns a broken migration into a `failed` unit
// instead of an invisible restart loop.
const { error } = await new Migrator({ db, provider }).migrateToLatest();
if (error) {
  console.error(`apps/server:/migrate: ${String(error)}`);
  process.exit(1);
}

const app = new Hono();

// Lives under /api/ ON PURPOSE: one Caddy route and one service-worker rule
// then cover it. A bare /health would need a third `handle` block and its own
// service-worker exception — one more thing to forget.
app.get('/api/health', c => {
  let dbOk = true;
  try {
    // Cheap AND meaningful: proves the file opens and the schema is applied.
    sqlite.prepare('select count(*) as n from kysely_migration').get();
  } catch {
    dbOk = false;
  }
  c.header('Cache-Control', 'no-store');
  // Nothing here is non-public: `release` is a git sha, `db` is a boolean.
  // No paths, no hostnames, no library versions, no error strings.
  return c.json({ status: dbOk ? 'ok' : 'degraded', db: dbOk, release: RELEASE },
                dbOk ? 200 : 503);
});

// serve() returns the real http.Server. Phase 3 attaches `ws` to its `upgrade`
// event — that is the entire reason Hono was chosen over Fastify.
// Bind to loopback: the process is reachable only through Caddy.
serve({ fetch: app.fetch, port: PORT, hostname: '127.0.0.1' });
```

### `public/sw.js` — template com sentinelas (o que `tools/sw/emit.mjs` reescreve)

```js
// sw.js — DungeonGuys2 service worker (TEMPLATE).
//
// The two sentinels below are replaced by tools/sw/emit.mjs after `vite build`.
// Running `vite build` without that step leaves them in place, and
// tools/sw/verify.mjs fails the build — a service worker that precaches
// nothing only shows its defect offline, weeks later.
//
// THE HASH COVERS EVERY FILE IN dist/ EXCEPT THIS ONE. It cannot cover itself:
// writing the digest in changes the bytes that produced it. Same property
// tools/sim-version/emit.mjs documents, solved the other way round — there the
// value goes to a sibling file, here it must live inside, so the boundary moves.
const CACHE = 'dg2-__BUILD_HASH__';
const PRECACHE = __PRECACHE__;
const PRECACHE_SET = new Set(PRECACHE);

self.addEventListener('install', e => {
  e.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    // `{cache:'reload'}` bypasses the HTTP cache: index.html, manifest.json and
    // sw.js have stable names, so a proxy could otherwise feed the previous
    // build straight into the "new" precache (P-4).
    await cache.addAll(PRECACHE.map(u => new Request(u, { cache: 'reload' })));
    // NO skipWaiting() — D2-09. The page decides when to swap, and only with
    // no run in progress.
  })());
});

self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    // Filter by OUR prefix, never `keys()` wholesale: Cache Storage is
    // per-ORIGIN, not per-scope, so a blind delete-all would take out any other
    // app on the same origin (DM-3).
    const keys = await caches.keys();
    await Promise.all(
      keys.filter(k => k.startsWith('dg2-') && k !== CACHE).map(k => caches.delete(k)),
    );
    // NO clients.claim() — D2-09. Existing pages keep the old worker until they
    // reload on their own terms.
  })());
});

// Let the page ask for the swap once it is safe (outside a run; from phase 3,
// outside a room too).
self.addEventListener('message', e => {
  if (e.data && e.data.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;

  const url = new URL(e.request.url);
  if (url.origin !== location.origin) return;          // fonts, CDNs: never ours

  // Belt and braces. The allowlist below already excludes these, but writing
  // them makes the intent reviewable — and /ws costs nothing today (D2-12 note).
  if (url.pathname.startsWith('/api/') || url.pathname === '/ws') return;

  // ALLOWLIST, not denylist (INFRA-03). Only paths this build actually produced
  // are served from the cache. A denylist is one forgotten route away from
  // caching an authenticated response; this cannot forget, because it only
  // knows files the build emitted.
  const path = url.pathname;
  const key = PRECACHE_SET.has(path) ? path
            : (path === '/' && PRECACHE_SET.has('/index.html')) ? '/index.html'
            : null;
  if (!key) return;                                     // straight to the network

  e.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const hit = await cache.match(key);
    if (hit) return hit;
    const res = await fetch(e.request);
    // Never store a non-ok response: 30 seconds of 502 during a deploy would
    // otherwise become the cached index.html forever (P-2).
    if (res.ok) cache.put(key, res.clone());
    return res;
  })());
});
```

### `src/main.ts` — detecção do update e aplicação fora de partida

```ts
// PWA update flow (D2-09). The old code called register() and forgot; the new
// worker installs and WAITS, so something has to notice and something has to
// decide when it is safe to swap.
let swWaiting: ServiceWorker | null = null;
let swReloading = false;

if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  navigator.serviceWorker.register(import.meta.env.BASE_URL + 'sw.js').then(reg => {
    const offer = (w: ServiceWorker | null) => {
      if (!w) return;
      swWaiting = w;
      // `gameStarted` is the flag beginRun/quitGame already maintain — it is
      // exactly "outside a run". Phase 3 adds `&& !inRoom` right here.
      if (!gameStarted) showUpdateOffer();
      else announce('NOVA VERSÃO PRONTA — VOLTE AO MENU PARA ATUALIZAR');
    };

    offer(reg.waiting);                                  // already waiting on load
    reg.addEventListener('updatefound', () => {
      const installing = reg.installing;
      installing?.addEventListener('statechange', () => {
        // `controller` present means this is an UPDATE, not a first install.
        if (installing.state === 'installed' && navigator.serviceWorker.controller) {
          offer(reg.waiting);
        }
      });
    });
  }).catch(() => {});

  navigator.serviceWorker.addEventListener('controllerchange', () => {
    // Guard: without it, a controllerchange fired for any other reason turns
    // into a reload loop.
    if (swReloading) return;
    swReloading = true;
    location.reload();
  });
}

/** Called by the update button. Only reachable with gameStarted === false. */
export function applyUpdate(): void {
  swWaiting?.postMessage({ type: 'SKIP_WAITING' });
}
```

### `tools/ops/restore-verify.mjs` — o ensaio de D2-03

```js
// restore-verify.mjs — INFRA-04: "verificado restaurando, não só gerando".
//
// Follows tools/README.md §3: failure is `file:pointer: message` on stderr with
// exit 1; success is ONE line on stdout with exit 0.
//
// What proves a restore is CONTENT, not bytes: two semantically identical SQLite
// files differ on disk (free pages, WAL state). So the check is a query.
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const LIVE = process.env.DG2_DB ?? '/var/lib/dg2/dg2.db';
const CONFIG = '/etc/litestream.yml';

function fail(file, pointer, message) {
  console.error(`${file}:${pointer}: ${message}`);
  process.exit(1);
}

const dir = mkdtempSync(join(tmpdir(), 'dg2-restore-'));
const restored = join(dir, 'dg2.db');
const started = Date.now();

try {
  // `-o` writes elsewhere; the live database is never touched. litestream
  // refuses to overwrite an existing file, which is why `dir` is fresh.
  execFileSync('litestream', ['restore', '-config', CONFIG, '-o', restored, LIVE],
               { stdio: ['ignore', 'pipe', 'pipe'] });

  const q = (db, sql) =>
    execFileSync('sqlite3', [db, sql], { encoding: 'utf8' }).trim();

  // coalesce(): an empty ledger must compare 0 against 0, not '' against ''.
  const probe = 'select count(*) || \'|\' || coalesce(sum(delta),0) from gold_entry;';
  const live = q(LIVE, probe);
  const back = q(restored, probe);

  if (live !== back) {
    fail('restore', '/gold_entry', `vivo=${live} restaurado=${back} — NÃO CONFERE`);
  }
  const secs = ((Date.now() - started) / 1000).toFixed(1);
  console.log(`restauração ok: gold_entry ${live} idêntico em ${secs}s (${restored})`);
} catch (error) {
  fail('tools/ops/restore-verify.mjs', '/', error.message);
} finally {
  rmSync(dir, { recursive: true, force: true });
}
```

### `ops/cert-check.sh` + timer — a perna local de D2-16

```bash
#!/bin/sh
# Alarm at 30 days, not 7 (PITFALLS.md §13). Let's Encrypt stopped sending
# expiry email on 2025-06-04 — nothing warns for free any more.
# `-checkend N` exits 1 if the cert expires within N seconds. That exit code is
# the whole mechanism: systemd marks the unit failed, journald records it.
set -eu
: "${DG2_DOMAIN:?}"
DAYS=30
echo | openssl s_client -servername "$DG2_DOMAIN" -connect "$DG2_DOMAIN:443" 2>/dev/null \
  | openssl x509 -noout -checkend $((DAYS * 86400)) \
  || { echo "cert-check: $DG2_DOMAIN expira em menos de $DAYS dias" >&2; exit 1; }
echo "cert-check: $DG2_DOMAIN válido por mais de $DAYS dias"
```

```ini
# ops/cert-check.timer
[Timer]
OnCalendar=daily
RandomizedDelaySec=1h
Persistent=true          # runs after a reboot that spanned the schedule

[Install]
WantedBy=timers.target
```

### `.github/workflows/ci.yml` — o job de deploy (substitui `deploy.yml`)

```yaml
  # `needs:` only works between jobs of the SAME workflow, which is why
  # deploy.yml is deleted rather than chained (DM-4). The artifact makes the
  # published bytes IDENTICAL to what passed the cross-engine gate (D2-05).
  deploy:
    needs: test
    if: github.ref == 'refs/heads/main' && github.event_name == 'push'
    runs-on: ubuntu-latest
    concurrency:
      group: deploy-vps        # two deploys must never race on the symlink
      cancel-in-progress: false
    steps:
      - uses: actions/download-artifact@v4
        with: { name: dist, path: dist }

      - name: SSH key
        run: |
          mkdir -p ~/.ssh && chmod 700 ~/.ssh
          printf '%s\n' "${{ secrets.DEPLOY_SSH_KEY }}" > ~/.ssh/id_ed25519
          chmod 600 ~/.ssh/id_ed25519
          # Pinned, NOT ssh-keyscan: scanning inside the job is trust-on-first-use
          # in the one pipeline that holds the deploy key.
          printf '%s\n' "${{ secrets.DEPLOY_KNOWN_HOSTS }}" > ~/.ssh/known_hosts
          chmod 600 ~/.ssh/known_hosts

      - name: rsync release
        run: |
          rsync -az --delete \
            -e "ssh -o StrictHostKeyChecking=yes -i ~/.ssh/id_ed25519" \
            --link-dest=/srv/dg2/current/ \
            dist/ "${{ secrets.DEPLOY_USER }}@${{ secrets.DEPLOY_HOST }}:/srv/dg2/releases/${{ github.sha }}/"

      - name: activate
        run: |
          ssh -o StrictHostKeyChecking=yes -i ~/.ssh/id_ed25519 \
            "${{ secrets.DEPLOY_USER }}@${{ secrets.DEPLOY_HOST }}" \
            "/srv/dg2/bin/deploy.sh ${{ github.sha }}"
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|---|---|---|---|
| `replicas:` (array) no Litestream | **`replica:` (singular)** | v0.5.0 | Copiar tutorial antigo quebra a configuração (P-8) |
| Backup Litestream em formato v0.3.x | **LTX**, com `restore` detectando os dois | v0.5.7 | Restauração transparente entre formatos |
| `better-sqlite3` com `prebuild-install` | **Prebuilds publicados dentro do próprio pacote** | v13.0.0 | Sem `install`/`postinstall`; binários N-API atravessam majors do Node. **Corrige a nota da `STACK.md`** de "recompila a cada major" |
| Aviso de expiração de certificado por e-mail (Let's Encrypt) | **Não existe mais** | 2025-06-04 | Monitoramento é obrigação de quem opera (D2-16) |
| `skipWaiting()` como padrão de PWA | **Prompt de atualização**, aplicado em ponto seguro | prática corrente | D2-09; obrigatório com multiplayer e com D-08 |
| Lista de precache escrita à mão | **Derivada do manifesto de build** | prática corrente | D2-10; elimina o 404 que rejeita a instalação inteira |
| `handle` do Caddy dependendo da ordem no arquivo | **Ordenação automática por especificidade** | Caddy 2.x | P-5 |

**Deprecado / a não usar:**
- `actions/upload-pages-artifact` + `actions/deploy-pages` — saem junto com o `deploy.yml`.
- `node-version: 20` no `deploy.yml` — divergia do `ci.yml` e sai com ele.
- `try_files {path} /index.html` — não há roteamento de cliente neste jogo (DM-5).
- `GAME_URL = 'https://gustavoktausend.github.io/DungeonGuys2/'` (`src/ui/screens.ts:180`) —
  aponta para uma URL que **retorna 404 hoje**. Os botões de compartilhar já estão quebrados;
  esta fase os conserta de graça ao trocar pelo domínio novo.

---

## Project Constraints (from CLAUDE.md)

| Diretiva | Como esta fase a respeita |
|---|---|
| `dependencies: {}` no jogo publicado | Hono/Kysely/better-sqlite3 vão **só** para `apps/server/package.json` (D2-04). A raiz continua `dependencies: {}`. `@playwright/test` é `devDependencies` da raiz |
| `packages/sim` puro, sem DOM/`Date`/`Math.random` | **Nenhum arquivo de `packages/sim` é tocado nesta fase** |
| `DT_MS`, `TICK_FACTOR`, `WORLD`, `TILE` | Intocados |
| Netcode P2P host-autoritativo, fronteira preparada | Hono escolhido **porque** `@hono/node-server` expõe o `http.Server` que a fase 3 precisa |
| Assets vêm prontos de outro repositório | Nenhuma mudança de arte. O precache "tudo" fica ~350 KB e a fase 7 revisita o orçamento |
| Comentários em inglês; docs e commits em português | Todos os exemplos deste documento seguem isso |
| Não usar `simple-peer`, `socket.io`, SaaS de auth/backend | Nenhum aparece aqui |
| `node:sqlite` ainda não (Stability 1.2) | `better-sqlite3` 13.0.3 |
| `skipWaiting()` no SW com multiplayer é proibido | D2-09 é exatamente isso; o template acima não o chama no `install` |
| Vite 7.3.6, não 8.x; TypeScript 6.0.3, não 7 | Nada nesta fase mexe na toolchain |
| Fluxo GSD antes de editar arquivos | Este documento é pesquisa; nenhuma edição de código foi feita |

---

## Environment Availability

Sondado na máquina de desenvolvimento (Windows 11, Git Bash) em 2026-08-31.

| Dependency | Required By | Available | Version | Fallback |
|---|---|---|---|---|
| Node.js | build, tools, apps/server | ✓ | 24.11.1 | — |
| npm | workspaces | ✓ | 11.6.2 | — |
| `gh` CLI | criar o repo do GitHub (DM-1) | ✓ | 2.83.2 | web UI |
| ssh / ssh-keygen | gerar a chave de deploy, rodar `rollback.sh` | ✓ | OpenSSH do Windows | — |
| openssl | validar o script de `cert-check` localmente | ✓ | 3.2.4 | rodar só na VPS |
| curl, tar | diagnóstico | ✓ | 8.14.1 / 1.35 | — |
| **rsync** | deploy | ✗ | — | O deploy roda no `ubuntu-latest`, que **tem** rsync. Ausência local só impede deploy manual da máquina — que D2-05 proíbe de qualquer forma |
| **sqlite3 (CLI)** | `restore-verify.mjs` compara com ele | ✗ | — | O script roda **na VPS** (`apt install sqlite3`). Alternativa sem CLI: fazer as duas consultas por `better-sqlite3` dentro do próprio script |
| **caddy / litestream / systemctl** | toda a operação | ✗ | — | São da VPS. **Nada disso é verificável desta máquina** |
| **A VPS em si** | tudo de INFRA-04 | ? | — | Não sondada: o endereço não está no repositório por D2-15 |
| **DNS do domínio** | INFRA-01 | ? | — | D2-13 declara pronto; não verificável daqui (o nome não está no repo) |
| **Bucket S3-compatível** | D2-17 | ✗ | — | A criar (Backblaze B2 ou equivalente) |

**Missing dependencies with no fallback (bloqueiam execução):**
- **Acesso SSH à VPS provisionada.** Nenhuma tarefa de `ops/` fecha sem isso.
- **Bucket S3-compatível com credenciais.** Sem ele, D2-17 e D2-03 não existem.
- **Repositório no GitHub.** Sem ele, D2-05 não existe (DM-1).

**Missing dependencies with fallback:** rsync local (o CI tem), `sqlite3` CLI local (roda na
VPS, ou substituir por `better-sqlite3`).

---

## Validation Architecture

### Test Framework

| Property | Value |
|---|---|
| Framework (unidade, Node) | Vitest 4.1.11 — `vitest.config.ts`, `include: ['tests/**/*.test.ts']` |
| Framework (cross-engine) | Vitest browser mode + `@vitest/browser-playwright` 4.1.11 — `vitest.browser.config.ts` |
| Framework (PWA/e2e) — **novo** | `@playwright/test` **1.62.1** (fixar exato, igual ao `playwright` já travado) — `playwright.config.ts` |
| Config file | `vitest.config.ts`, `vitest.browser.config.ts` existem; `playwright.config.ts` → **Wave 0** |
| Quick run command | `npm test` (Vitest Node, segundos) |
| Full suite command | `npm run lint && npm run typecheck:sim && npm run typecheck:protocol && npm test && npm run sim:version:verify && npm run assets:selftest && npm run assets:refusal && npm run assets:validate && npm run test:browser && npm run build && npm run sw:verify && npm run test:pwa` |
| Naming | Specs do Playwright em `tests/pwa/*.spec.ts`. O `include` do Vitest é `*.test.ts`, então **não há colisão** e nenhuma exclusão é necessária |

### Phase Requirements → Test Map

| Req | Comportamento | Tipo | Comando automatizado | Existe? |
|---|---|---|---|---|
| INFRA-01 | `base` é `'/'` e nenhum caminho emitido carrega `/DungeonGuys2/` | unit | `npx vitest run tests/build-base.test.ts` | ❌ Wave 0 |
| INFRA-01 | Não há workflow publicando no GitHub Pages | unit | `npx vitest run tests/workflows.test.ts` (grep por `deploy-pages`/`upload-pages-artifact` em `.github/workflows/`) | ❌ Wave 0 |
| INFRA-01 | O domínio serve HTTPS com certificado válido | shell (VPS/manual) | `ops/cert-check.sh` | ❌ Wave 0 |
| INFRA-01 | Certificado com >30 dias, continuamente | timer + monitor externo | `systemctl start cert-check.service` · monitor externo em `/api/health` | ❌ Wave 0 |
| INFRA-02 | Instalação limpa: SW ativa e o precache tem todos os arquivos do `dist/` | e2e | `npx playwright test tests/pwa/install.spec.ts` | ❌ Wave 0 |
| INFRA-02 | Offline depois da instalação, **sem nunca ter jogado** | e2e | `npx playwright test tests/pwa/offline.spec.ts` | ❌ Wave 0 |
| INFRA-02 | Manifesto instalável: `scope`/`start_url` batem com o escopo do SW | e2e | mesma spec de `install` | ❌ Wave 0 |
| INFRA-03 | `/api/*` nunca entra no Cache Storage | e2e | `npx playwright test tests/pwa/api-isolation.spec.ts` | ❌ Wave 0 |
| INFRA-03 | Resposta não-`ok` nunca é gravada | e2e | mesma spec (rota mockada devolvendo 502) | ❌ Wave 0 |
| INFRA-03 | Nome do cache deriva do build; update deixa **um** cache | e2e | `npx playwright test tests/pwa/update.spec.ts` | ❌ Wave 0 |
| INFRA-03 | O passo de build realmente rodou (sem sentinela sobrando) | build gate | `npm run sw:verify` | ❌ Wave 0 |
| INFRA-04 | Deploy é um comando e é reversível | shell (VPS) | `ops/deploy.sh <sha>` · `ops/rollback.sh` | ❌ Wave 0 |
| INFRA-04 | Migração roda e é idempotente (dois starts seguidos) | integração (Node) | `npx vitest run tests/server-migrate.test.ts` (banco em `:memory:` ou tmp) | ❌ Wave 0 |
| INFRA-04 | `/api/health` responde 200 e não vaza | integração | `npx vitest run tests/server-health.test.ts` | ❌ Wave 0 |
| INFRA-04 | Backup **restaurado** e conferido | shell (VPS) | `node tools/ops/restore-verify.mjs` | ❌ Wave 0 |

### Success Criteria → Sinal Observável → Onde É Medido

| # | Critério | Sinal observável que prova | Onde é medido |
|---|---|---|---|
| **1** | Jogo no domínio próprio sob HTTPS, e **um** alvo de deploy | (a) `curl -sI https://$DG2_DOMAIN/` → `200` e cadeia TLS válida; (b) `grep -r 'deploy-pages\|upload-pages-artifact' .github/` → **vazio**; (c) `openssl x509 -checkend 2592000` → exit 0; (d) o monitor externo registrou pelo menos uma checagem verde | (a) shell na VPS + navegador; (b) `tests/workflows.test.ts` **no CI**; (c) `cert-check.timer` na VPS; (d) painel do monitor externo, print anexado em `docs/OPERACAO.md` |
| **2** | Instalação limpa **e** atualização a partir de instalação antiga funcionam; abre sem rede | (a) `install.spec.ts`: `navigator.serviceWorker.controller !== null` e `caches.keys()` = 1 cache, cujo conteúdo é **exatamente** a lista de `dist/` menos `sw.js`; (b) `update.spec.ts`: partindo do fixture do SW velho, `registration.waiting` aparece, o botão de update dispara `controllerchange`, e depois sobra **1** cache; (c) `offline.spec.ts`: com o servidor derrubado, `page.reload()` renderiza a tela inicial e o botão START responde | Playwright no CI, projeto **chromium** |
| **3** | `/api/` nunca servido do cache; não-`ok` nunca gravado; deploy novo não deixa cache velho | (a) `api-isolation.spec.ts`: depois de N chamadas a `/api/health`, `caches.keys()` → para cada cache, `cache.keys()` não contém nenhuma URL com `/api/`; (b) rota mockada devolvendo 502 para um asset precacheado → aquele asset **não** muda no cache; (c) `update.spec.ts` assere `caches.keys().length === 1` e que o nome mudou | Playwright no CI, projeto **chromium** |
| **4** | Deploy é um comando e é reversível; backup **restaurado** e o resultado anotado | (a) `ops/deploy.sh <sha>` termina 0 e `readlink /srv/dg2/current` aponta para o sha; (b) `ops/rollback.sh` volta o symlink, `curl` do `index.html` bate o hash do release anterior, **com a rede do GitHub irrelevante**; (c) `node tools/ops/restore-verify.mjs` imprime uma linha verde e sai 0; (d) existe um arquivo em `docs/` com data, duração e o que faltou | (a)(b)(c) shell na VPS; (d) revisão de artefato — o verificador da fase abre o arquivo |

### Sampling Rate

- **Por commit de tarefa:** `npm test` (Vitest Node — segundos).
- **Por merge de wave:** `npm run lint && npm test && npm run build && npm run sw:verify && npm run test:pwa`.
- **Portão de fase:** suíte completa verde no CI (incluindo `test:browser` e o job `pwa`)
  **mais** os quatro comandos de shell da VPS executados uma vez com a saída colada em
  `docs/OPERACAO.md`.

### Wave 0 Gaps

- [ ] `playwright.config.ts` — `testDir: 'tests/pwa'`, `projects: [{ name: 'chromium' }]`,
      `webServer` servindo `dist/` (ver a nota de derrubar o servidor, abaixo)
- [ ] `npm i -D @playwright/test@1.62.1` — versão exata, casando com `playwright` 1.62.1 do lock
- [ ] `tests/pwa/fixtures/old-build/` — o `dist/` de **antes** da reescrita do `sw.js`, com o
      `public/sw.js` atual, para servir de "instalação antiga" do critério 2
- [ ] `tests/pwa/helpers.ts` — servidor estático controlável (fixture), `waitForActivated()`,
      `readCacheEntries()`
- [ ] `tests/pwa/install.spec.ts`, `update.spec.ts`, `offline.spec.ts`, `api-isolation.spec.ts`
- [ ] `tests/build-base.test.ts` — assere que nada em `dist/` contém `/DungeonGuys2/`
- [ ] `tests/workflows.test.ts` — assere ausência de deploy para Pages (INFRA-01 executável)
- [ ] `tests/server-migrate.test.ts` e `tests/server-health.test.ts` — precisam que o Vitest
      da raiz enxergue `apps/server`; conferir se o `include` `tests/**` mais os `paths` do
      `tsconfig.json` bastam, ou se `apps/server` precisa de config própria
- [ ] `ops/cert-check.sh`, `ops/deploy.sh`, `ops/rollback.sh`, `tools/ops/restore-verify.mjs`
- [ ] Job `pwa` no `ci.yml` (reaproveita o cache de browser já existente) e job `deploy`

### Notas de projeto do teste de PWA (leia antes de escrever a spec)

1. **Service worker no Playwright é Chromium-only.**
   `[CITED: playwright.dev/docs/service-workers]` — *"Service workers are only supported on
   Chromium-based browsers."* Portanto o projeto Playwright desta fase tem **um** browser.
   Isso amplia a lacuna já aceita em D2-11: além de iOS/Safari físico, **Firefox e WebKit
   também ficam sem cobertura de service worker**. Registre isso junto da caixa de
   `docs/PARIDADE.md` — é a mesma decisão, com o alcance real medido.
2. **Não confie só em `context.setOffline()`.** É emulação por CDP
   (`Network.emulateNetworkConditions`) e há relato antigo e ainda aberto de que não alcança
   as requisições feitas pelo service worker (`microsoft/playwright#2311`).
   **Recomendação:** o teste de offline **derruba o servidor estático de verdade** (fechar o
   `http.Server` da fixture) e, por cima, chama `setOffline(true)`. Assim o teste prova
   offline mesmo se a emulação falhar — e não vira falso verde.
3. **Colete `requestfailed` filtrando por origem própria.** As fontes do Google vão falhar
   offline e isso é esperado (P-7). Assertar `failed.length === 0` sem filtro produz um
   vermelho que não é defeito.
4. **Contexto seguro:** service worker exige contexto seguro; `http://localhost` e
   `http://127.0.0.1` contam. O teste **não** precisa de TLS.
5. **Não use `serviceWorkers: 'block'`** no contexto (é o conselho padrão do Playwright para
   interceptação de rede — e aqui inutilizaria o teste inteiro).
6. **Cuidado com o typecheck:** o `tsconfig.json` da raiz inclui `tests` e fixa
   `types: ["vite/client"]`. Se `@playwright/test` reclamar de tipos de Node, a saída barata
   é um `tests/pwa/tsconfig.json` próprio — **não** acrescentar `"node"` ao `types` da raiz,
   que afrouxaria a disciplina DOM-only do cliente.

### Lacuna aceita, registrada por escolha (D2-11)

> **PWA em iOS/Safari físico permanece sem cobertura, por decisão, e a caixa correspondente
> em `docs/PARIDADE.md` ("PWA instalável e funcional offline — *aguardando o humano*",
> § Plataforma) permanece ABERTA ao fim desta fase.** A medição desta pesquisa amplia o
> alcance da lacuna: o Playwright só suporta service worker em Chromium, então Firefox e
> WebKit — mesmo em desktop, mesmo no CI — também ficam de fora. O verificador da fase deve
> ler o critério 2 com essa ressalva e **não** tratar a caixa aberta como pendência da fase.

---

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Aplica | Controle padrão |
|---|---|---|
| V2 Authentication | **não** | Fase 6. Nenhuma credencial de usuário existe nesta fase |
| V3 Session Management | **não** | Fase 6 |
| V4 Access Control | **parcial** | O único endpoint é `/api/health`, público por desenho. O controle real é de **infra**: `dg2` sem shell, `ProtectSystem=strict`, bind em `127.0.0.1` |
| V5 Input Validation | **não aplicável a payload** | `/api/health` não recebe entrada. Não introduzir `zod` sem consumidor |
| V6 Cryptography | **indireto** | TLS é do Caddy (ACME). Nada de cripto artesanal. Segredos em `/etc/dg2/env` `chmod 600` |
| V7 Error Handling & Logging | **sim** | `handle_errors` devolve corpo genérico; nada de stack trace na resposta. Log estruturado no journald |
| V8 Data Protection | **sim** | Cache Storage é o vetor: INFRA-03 existe para que resposta de API nunca seja persistida no cliente |
| V12 Files & Resources | **sim** | `file_server` sobre `root` fixo; sem `try_files` que transforme 404 em 200 |
| V14 Configuration | **sim** | Segredos fora do repositório (D2-15); chave SSH em secret; `known_hosts` fixado |

### Known Threat Patterns

| Padrão | STRIDE | Mitigação padrão |
|---|---|---|
| SW cacheando resposta autenticada da mesma origem | Information Disclosure | **Allowlist** derivado do build (Padrão 2). Cache Storage não respeita `Cache-Control` e não é limpo no logout |
| SW da origem apagando o armazenamento de outro app da origem | Denial of Service | Deletar só por prefixo próprio (DM-3) |
| `StrictHostKeyChecking=no` no job que carrega a chave de deploy | Spoofing / Tampering | `known_hosts` fixado num secret, não `ssh-keyscan` no job |
| Chave de deploy com poder demais na VPS | Elevation of Privilege | Usuário `dg2-deploy` sem shell (`/usr/sbin/nologin` com `command=` forçado na `authorized_keys`), escrita restrita a `/srv/dg2/releases/`, e `deploy.sh` como comando forçado — a chave só sabe trocar symlink |
| Processo Node exposto direto na internet | Spoofing | `hostname: '127.0.0.1'` no `serve()`. Sem firewall, bind em `0.0.0.0:8080` publica a API fora do TLS |
| Segredo do Litestream num arquivo versionado | Information Disclosure | `${AWS_ACCESS_KEY_ID}` no `litestream.yml`, valor em `/etc/dg2/env` |
| `/api/health` vazando topologia | Information Disclosure | Corpo com `status`/`db`/`release` e nada mais. Sem caminho, sem hostname, sem versão de biblioteca, sem string de erro |
| Vazamento de memória derrubando serviços vizinhos | Denial of Service | `MemoryMax` + `MemoryHigh` por unit, pareados com `--max-old-space-size` (P-10) |
| Um deploy ruim sem caminho de volta | Denial of Service | Symlink de release + `rollback.sh` que funciona com o GitHub fora do ar (D2-06) |
| Ação de terceiro no pipeline que tem a chave SSH | Tampering / supply chain | Só `actions/checkout`, `setup-node`, `upload/download-artifact` — todas da própria GitHub. rsync e ssh por `run:` |

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|---|---|---|
| A1 | O handshake de WebSocket **não** dispara o evento `fetch` do service worker, o que torna a exclusão de `/ws` redundante para WebSockets (mas gratuita e útil para HTTP futuro sob esse caminho) | Padrão 2 | Baixo. A recomendação de allowlist não depende disso; se a suposição for falsa, o allowlist já cobre |
| A2 | Prebuilds do `better-sqlite3` 13.0.3 cobrem `linux-x64` e `linux-arm64` da VPS sem toolchain de compilação | Standard Stack | Médio. Se falhar, a VPS precisa de `build-essential` + `python3`. Verificar rodando `npm i` na caixa antes de escrever o `deploy.sh` |
| A3 | A VPS é Debian/Ubuntu com cgroup v2 (necessário para `MemoryMax`) | dg2.service | Baixo. Debian 11+/Ubuntu 22.04+ já vêm com cgroup v2 por padrão |
| A4 | O `apt` da distro tem Caddy 2.11.x (repositório oficial do Caddy adicionado) | Standard Stack | Baixo. O repositório oficial é a instalação documentada; o pacote da distro pode estar atrás |
| A5 | O bucket será Backblaze B2 (endpoint estilo S3), não S3 da AWS | litestream.yml | Baixo. Só muda `endpoint`/`region` |
| A6 | Workflows agendados são desabilitados após 60 dias de inatividade **em repositórios públicos**; a aplicação a repositórios privados é menos clara nas fontes | D2-16 / Open Questions | Médio. Se a segunda perna de D2-16 for uma GitHub Action agendada, ela pode morrer em silêncio numa pausa do projeto — o que anula o monitor exatamente quando ele importa |
| A7 | O `SIM_VERSION` calculado no `ubuntu-latest` pode diferir do calculado localmente (esbuild por plataforma) | DM-1 | Baixo **nesta fase** (`SIM_VERSION` não se move e ninguém compara). Médio na fase 3, quando entra no handshake |
| A8 | As fontes Press Start 2P e Pixelify Sans são OFL e podem ser auto-hospedadas | P-7 | Baixo. Ambas são do Google Fonts, tipicamente OFL — conferir a licença antes de copiar |
| A9 | 5 releases é a retenção certa | Padrão 1 | Nenhum. 350 KB por release; ajustar é uma constante |
| A10 | `MemoryMax=256M` é folgado para um Node com Hono + um SQLite pequeno | dg2.service | Baixo nesta fase. Reavaliar na fase 3, quando `ws` e salas em memória entrarem na mesma unit |

---

## Open Questions (RESOLVED)

> Todas as seis foram respondidas em 2026-08-31, depois desta pesquisa e antes do
> planejamento. Cada item abaixo carrega o marcador `RESOLVED:` com a referência que a
> respondeu. Nada aqui é pergunta aberta ao entrar na execução.
>
> - **1** → `RESOLVED: D2-18` (02-CONTEXT.md) — despedida cortada, D2-12 revogada
> - **2** → `RESOLVED: D2-19` (02-CONTEXT.md) + checkpoint no plano `02-04` Task 1 — KVM 2 (2 GB)
> - **3** → `RESOLVED: D2-20` (02-CONTEXT.md) — fontes auto-hospedadas, entram no precache
> - **4** → `RESOLVED: D2-21` (02-CONTEXT.md) — serviço externo de terceiro, não GitHub Action
> - **5** → `RESOLVED: plano 02-08` — `SIM_VERSION` fica **fora** do `/api/health` nesta fase
> - **6** → `RESOLVED: plano 02-08 Task 1` — `apps/server/tsconfig.json` próprio + script
>   `typecheck:server`; `apps` **não** entra no `ignores` do ESLint

1. **D2-12 ainda faz sentido, dado que o Pages do DungeonGuys2 nunca existiu?** `RESOLVED: D2-18`
   - O que sabemos: verificado — 404 na URL, repo inexistente, nenhum PWA instalado possível.
   - O que não está claro: se o usuário quer a página de despedida mesmo assim (por exemplo,
     porque planeja publicar no Pages antes de migrar), ou se INFRA-01 já está satisfeito.
   - Recomendação: **`checkpoint:human-verify` antes da tarefa**. Se seguir, o `sw.js` de
     despedida **tem** de deletar por prefixo próprio (DM-3).

2. **Qual é o tamanho real da VPS (1 GB ou 2 GB) e em que região?** `RESOLVED: D2-19 + plano 02-04 Task 1`
   - O que sabemos: a `CONTEXT.md` diz "1–2 GB" e que a região importa para a fase 3 (TURN
     fora do Brasil = +200 ms).
   - O que não está claro: o plano contratado e a região atual.
   - Recomendação: confirmar **antes** da primeira tarefa de `ops/`. É a última hora barata
     de mover a caixa, e o orçamento de `MemoryMax` (P-10) depende do número.

3. **As fontes do Google entram no precache (auto-hospedadas) ou o offline aceita fallback?** `RESOLVED: D2-20`
   - O que sabemos: são cross-origin, com fallback `system-ui`/`monospace` declarado.
   - Recomendação: decidir **antes** de escrever `offline.spec.ts` — a asserção do teste muda.

4. **A segunda perna de D2-16 é serviço externo ou GitHub Action agendada?** `RESOLVED: D2-21`
   - O que sabemos: A6 acima; um workflow agendado pode ser desabilitado por inatividade.
   - Recomendação: **serviço externo gratuito** como perna principal (UptimeRobot,
     Healthchecks.io, Better Stack — todos com keyword matching, que casa com
     `"status":"ok"`). Se for GitHub Action, documentar o risco dos 60 dias em `ops/README.md`.

5. **`SIM_VERSION` deve entrar no corpo do `/api/health`?** `RESOLVED: plano 02-08 — fica de fora`
   - O que sabemos: é derivado de um artefato público, então não é segredo. Seria útil para
     depurar o handshake da fase 3.
   - O que não está claro: hoje ele vive só em `packages/sim/dist/sim-version.json` e **não**
     é enviado ao cliente — expô-lo em `/api/health` seria sua primeira publicação.
   - Recomendação: **deixar de fora nesta fase.** `status`/`db`/`release` bastam para o
     monitor; a fase 3 acrescenta quando tiver consumidor.

6. **`apps/server` entra no `tsconfig.json` e no ESLint da raiz, ou tem os próprios?** `RESOLVED: plano 02-08 Task 1`
   - O que sabemos: o `tsconfig.json` da raiz fixa `types: ["vite/client"]` e `lib` com `DOM` —
     ambos errados para código de servidor. `tools/` resolveu isso ficando **fora** de tudo
     (`tools/README.md` §§ 4 e 5).
   - Recomendação: `apps/server/tsconfig.json` próprio (`lib: ["ES2023"]`, `types: ["node"]`),
     mais um `typecheck:server` no `package.json` e no `ci.yml` — simétrico aos
     `typecheck:sim` e `typecheck:protocol` que já existem. Manter no ESLint da raiz (é
     código de produto, ao contrário de `tools/`).

---

## Recomendações para os Itens de Discrição

Resumo executável — cada linha responde um item da seção "Claude's Discretion" da CONTEXT.md.

| # | Item | Recomendação | Razão em uma linha |
|---|---|---|---|
| 1 | Hono vs Fastify; porta | **Hono 4.13.5 + `@hono/node-server` 2.1.1**, `serve({ hostname: '127.0.0.1', port: 8080 })`, porta em `DG2_PORT`/`DG2_UPSTREAM` no `/etc/dg2/env` | O `serve()` devolve o `http.Server` real que a fase 3 precisa; bind em loopback tira a API da internet sem depender de firewall |
| 2 | Forma do `/health` | **`GET /api/health`** (sob `/api/`, não na raiz) → `200 {"status":"ok","db":true,"release":"<sha>"}` / `503 {"status":"degraded",...}`, `Cache-Control: no-store` | Sob `/api/`, **uma** regra do Caddy e **uma** do service worker já cobrem. `"status":"ok"` casa com keyword matching de monitor gratuito |
| 3 | Sandbox do systemd | `StateDirectory=dg2` (em vez de `ReadWritePaths` manual) + `ProtectSystem=strict` + `ProtectHome` + `PrivateTmp` + `NoNewPrivileges` + `RestrictAddressFamilies` + **`MemoryHigh=200M` / `MemoryMax=256M` pareado com `--max-old-space-size=192`** + `StartLimitBurst=5` | `StateDirectory` cria e dá dono ao diretório sozinho; o par MemoryMax/heap troca OOM-kill por GC (P-10); o start limit é o que faz uma migração quebrada virar alarme (P-9) |
| 4 | rsync vs tar; retenção | **rsync `-az --delete --link-dest=<absoluto>`**, **5 releases**, poda que resolve `current` antes de apagar | `--link-dest` dedupa por hardlink; tar perde isso. 5 cobre uma tarde ruim a custo de disco desprezível |
| 5 | Forma do passo de precache | **Script `.mjs` pós-build** (`tools/sw/emit.mjs`) reescrevendo `dist/sw.js` a partir de sentinelas em `public/sw.js`, mais `tools/sw/verify.mjs` no CI | `define()` é **impossível** (medido: o Vite copia `public/` verbatim); plugin do Vite enterra a lógica; `emit.mjs` já é o precedente do projeto |
| 6 | Onde e como aparece o aviso | **Duas metades:** durante a partida, `announce('NOVA VERSÃO PRONTA — VOLTE AO MENU PARA ATUALIZAR')`; na tela inicial, um botão persistente `RECARREGAR AGORA`. Gate = `gameStarted === false` | `announce()` é um toast de 2,6 s sem interação — bom para avisar, ruim para pedir ação. `quitGame()` já leva a `showScreen('start')` com `gameStarted = false`: essa é a costura exata |
| 7 | `/ws` junto com `/api/`? | **Sim**, mas o que resolve de verdade é o **allowlist** (Padrão 2) — o `/ws` explícito é documentação | Um denylist está sempre a uma rota esquecida de cachear dado autenticado; um allowlist derivado do build não pode esquecer |
| 8 | Restart em todo deploy? | **Não.** `deploy.sh` compara o hash do bundle do servidor entre o release novo e o `current`; reinicia só se diferir **ou** se a unit não estiver `active` | Restart re-executa a migração, que é a única operação do deploy capaz de falhar. Não vale correr esse risco por uma mudança de CSS. O `rollback.sh` precisa da mesma lógica: reverter símbolo estático é instantâneo, reverter servidor precisa do restart |
| 9 | Página de manutenção | **Não fazer HTML de manutenção nesta fase.** Fazer `handle_errors` devolvendo `503 {"status":"unavailable"}` para o upstream fora | O jogo é estático e servido pelo `file_server`: ele **já** continua no ar com o Node fora. O que falta é um sinal legível por máquina para distinguir "Caddy de pé, Node fora" de "caixa fora" — que é o que o monitor de D2-16 precisa. O HTML só passa a importar na fase 6 (e o deferido já diz isso) |
| 10 | Ordem interna | Ver § Ordem Interna Sugerida, abaixo | — |

### Ordem Interna Sugerida (MVP_MODE: fatias verticais do caminho de deploy)

**Wave 0 — pré-requisito (DM-1).** Criar o repo no GitHub (`gh repo create`), empurrar,
**ver o `ci.yml` verde num runner**. Nada mais desta fase pode depender de um portão que
nunca rodou. Provisionar/confirmar a VPS (tamanho e região) e criar o bucket S3.

**Fatia A — "o jogo está no domínio, publicado por um comando, e reversível."** (critérios 1 e 4a)
1. `base: '/'` + `href` absolutos de DM-5 + `GAME_URL` novo — **tarefa própria**, como a
   CONTEXT.md exige, com `tests/build-base.test.ts`.
2. `ops/Caddyfile` + drop-in de env + `ops/deploy.sh`/`rollback.sh`/`prune-releases.sh`.
3. `ci.yml` ganha o job `deploy`; `deploy.yml` é apagado; `tests/workflows.test.ts` fecha
   INFRA-01 de forma executável.
   - **Propriedade útil:** esta fatia sobe o `sw.js` **atual** em escopo `/`. É exatamente o
     fixture de "instalação antiga" que o critério 2 precisa atualizar — e como não há API
     ainda, o defeito de cachear `/api/` não tem como se manifestar no intervalo.

**Fatia B — "o PWA está correto e provado."** (critérios 2 e 3)
4. `tools/sw/emit.mjs` + `tools/sw/verify.mjs` + reescrita do `public/sw.js` como template.
5. Aviso de atualização em `src/main.ts` + `src/ui/screens.ts` (D2-09).
6. `playwright.config.ts` + as quatro specs + job `pwa` no `ci.yml`.

**Fatia C — "existe banco, ele é supervisionado, e o backup foi restaurado."** (critério 4b)
7. `apps/server` (workspace, D2-04) + migração estática + `/api/health` + `dg2.service`.
8. `litestream.yml` + `litestream.service` + `tools/ops/restore-verify.mjs`.
9. **Rodar o ensaio** e anotar em `docs/OPERACAO.md` (data, duração, o que faltou).

**Fatia D — "alguém avisa quando quebrar."** (fecha o critério 1)
10. `cert-check.{sh,service,timer}` + monitor externo apontado para `/api/health`.
11. `checkpoint:human-verify` sobre D2-12 (DM-2), e a despedida do Pages **se** confirmada —
    com o `caches.delete` por prefixo próprio (DM-3).

---

## Sources

### Primary (HIGH confidence)

- **Medição neste repositório (2026-08-31):** `npm run build` executado; `dist/` = 350 KB em
  11 arquivos; `cmp public/sw.js dist/sw.js` → idênticos (2549 B); `dist/index.html` com
  `/DungeonGuys2/assets/...` e `href` relativos não reescritos; `git remote -v` vazio;
  `git rev-list --count HEAD` = 161.
- **Medição por HTTP (2026-08-31):** `gustavoktausend.github.io/DungeonGuys2/` → 404;
  `/DungeonGuys/` → 200; `/DungeonGuys/sw.js` → 200 com `CACHE='dungeonguys-v3'` e
  `caches.keys()` delete-all no `activate`; `api.github.com/repos/gustavoktausend/DungeonGuys2` → 404;
  listagem pública de 23 repos sem `DungeonGuys2`.
- **Registro npm consultado diretamente (2026-08-31):** hono 4.13.5, @hono/node-server 2.1.1,
  better-sqlite3 13.0.3, kysely 0.29.5, @playwright/test 1.62.1, pino 10.3.1, zod 4.5.4 —
  versões, downloads/semana, repositório e ausência de `postinstall`.
- **`slopcheck` 0.6.1** — 7 pacotes varridos, 7 `[OK]`.
- **`kysely@0.29.5` `dist/migration/migrator.d.ts`** (jsDelivr) — `MigrationProvider` (:353),
  `Migration { up, down? }` (:7), `migrateToLatest`/`migrateTo`/`migrateUp`/`migrateDown`.
- **Context7 `/kysely-org/kysely`** — `Migrator` + `FileMigrationProvider`, migração SQLite
  com `db.schema`, `SqliteDialectConfig`.
- **Context7 `/websites/playwright_dev`** — `browserContext.serviceWorkers` ("Supported only
  on Chromium-based browsers"), `setOffline`, espera de ativação por `controllerchange`.
- `https://playwright.dev/docs/service-workers` — *"Service workers are only supported on
  Chromium-based browsers."*
- `https://caddyserver.com/docs/caddyfile/concepts` — `{$VAR}` substituído antes do parse e
  único que funciona em endereço de site; `{env.VAR}` é runtime.
- `https://caddyserver.com/docs/caddyfile/directives/handle` — `handle` é mutuamente
  exclusivo e **ordenado por especificidade**, não pela ordem no arquivo.
- `https://caddyserver.com/docs/running` — `systemctl edit caddy` para drop-in,
  `EnvironmentFile`, `reload` vs `restart`, usuário `caddy`.
- `https://litestream.io/reference/config/` — v0.5: `replica` **singular**; `endpoint` para
  S3-compatível; `${AWS_*}`.
- `https://litestream.io/reference/restore/` — `-o PATH`, `-if-db-not-exists`,
  `-if-replica-exists`, `-timestamp`, `-txid`.
- `https://github.com/benbjohnson/litestream/releases` — 0.5.16 (2026-08-05).
- `https://github.com/caddyserver/caddy/releases` — 2.11.4 (2026-06-03).
- `https://nodejs.org/dist/index.json` — Node 24.20.0 LTS "Krypton" (2026-08-26).
- **Arquivos do projeto lidos na íntegra:** `CLAUDE.md`, `.planning/phases/02-.../02-CONTEXT.md`,
  `.planning/REQUIREMENTS.md` § INFRA, `.planning/ROADMAP.md` § Phase 2, `.planning/STATE.md`,
  `.planning/research/STACK.md` §§ Deploy/Banco/Monorepo/Stack, `.planning/research/PITFALLS.md`
  §§ 8, 12, 13 e checklists, `.planning/phases/01-.../01-CONTEXT.md` (D-08, D-15, D-16, D-29),
  `docs/adr/0010-...md`, `docs/PARIDADE.md`, `tools/README.md`, `tools/sim-version/{emit,verify}.mjs`,
  `vite.config.ts`, `index.html`, `src/main.ts`, `src/style.css`, `src/ui/screens.ts`,
  `src/app/save.ts`, `public/sw.js`, `public/manifest.json`, `package.json`, `eslint.config.js`,
  `tsconfig.json`, `vitest.config.ts`, `vitest.browser.config.ts`, `.gitignore`,
  `.github/workflows/{ci,deploy}.yml`, `packages/*/package.json`, `tests/purity.test.ts`.

### Secondary (MEDIUM confidence)

- `https://web.dev/articles/service-worker-lifecycle` — `controllerchange`; o browser ignora
  cabeçalhos de cache ao checar update do script do SW; teto de 24 h entre checagens. (O
  padrão completo de prompt+`postMessage` **não** aparece literalmente na página; a forma
  usada aqui é a prática corrente, não uma citação.)
- `https://github.com/WiseLibs/better-sqlite3/releases/tag/v13.0.0` (via busca) — prebuilds
  publicados dentro do pacote, `prebuild-install` removido, fallback compilando.
- `https://github.com/microsoft/playwright/issues/2311` — `context.setOffline` não alcança
  requisições de service worker; motiva derrubar o servidor de verdade no teste.
- `https://dt.in.th/PlaywrightOfflineFirstTest` — encenação de teste offline com coleta de
  `requestfailed`.
- Documentação e discussões de `systemd` (`StateDirectory` implica `ReadWritePaths`;
  `ProtectSystem=strict` + allowlist) — múltiplas fontes concordando, sem citação única
  canônica coletada.
- `openssl x509 -checkend N` — exit 1 se expirar dentro de N segundos; múltiplas fontes.
- Prática corrente de rsync + SSH em GitHub Actions (chave em secret, `known_hosts`).

### Tertiary (LOW confidence — validar antes de depender)

- Workflows agendados desabilitados após 60 dias de inatividade: fontes concordam para
  repositórios **públicos**; comportamento em privados não confirmado (A6).
- "O handshake de WebSocket não dispara o `fetch` do service worker" — não foi obtida citação
  direta de spec nesta sessão (A1).
- Licenciamento OFL de Press Start 2P / Pixelify Sans — presumido, não conferido (A8).
- Cobertura de prebuilds `linux-arm64` do `better-sqlite3` 13.0.3 — não conferida na
  arquitetura real da VPS (A2).

---

## Metadata

**Confidence breakdown:**

- **Standard stack:** ALTA — todas as versões vieram do registro npm e das APIs de release,
  consultadas nesta sessão; nenhuma de memória.
- **Estado do repositório e do GitHub Pages (DM-1, DM-2, DM-3):** ALTA — medido por `git`,
  API do GitHub e HTTP, com os comandos transcritos.
- **Architecture (Caddy, systemd, Litestream, Kysely):** ALTA — cada afirmação estrutural tem
  citação de documentação oficial; três correções à `STACK.md` foram levantadas por ela.
- **Service worker (padrões, allowlist, precache derivado):** ALTA para o mecanismo, MÉDIA
  para o padrão exato de prompt de atualização (prática corrente, não citação literal).
- **Teste de PWA no Playwright:** MÉDIA — o suporte Chromium-only é citação oficial; a
  fragilidade do `setOffline` vem de issue aberta e de relato de terceiro, o que motiva a
  recomendação defensiva de derrubar o servidor.
- **Pitfalls:** ALTA para os que foram medidos neste repositório (P-1, P-3, P-5, P-6, P-8,
  P-11); MÉDIA para os operacionais (P-9, P-10, P-12), derivados de documentação e prática.
- **Orçamento de memória e tamanho da VPS:** BAIXA — depende de um número que a pesquisa não
  tem (Open Question 2).

**Research date:** 2026-08-31
**Valid until:** ~2026-09-30 para as versões de biblioteca (Litestream e Caddy se movem
devagar; `@playwright/test` publica semanalmente). **DM-1 a DM-3 expiram no instante em que
alguém criar o repositório no GitHub** — revalidar com os mesmos três comandos se o
planejamento demorar.
