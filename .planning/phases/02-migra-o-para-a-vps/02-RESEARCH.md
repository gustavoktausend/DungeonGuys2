# Phase 2: Migração para a VPS — Research (replanejamento sob containerização)

**Researched:** 2026-09-09
**Domain:** deploy containerizado sob Coolify + Traefik numa caixa que já é produção de
outro projeto; política HTTP em Caddy sem TLS; SQLite + Litestream em volume; coturn nativo
**Confidence:** HIGH na camada medida (a caixa foi inspecionada); MEDIUM na camada de
integração com o Coolify (documentada, não executada); um bloqueador de arquitetura aberto

> **Este documento SUBSTITUI a pesquisa de 2026-08-31.** Aquela supunha uma caixa vazia onde
> o Caddy seria dono da 443, o deploy seria `rsync` sobre SSH, os releases seriam diretórios
> por sha com symlink atômico, e o `systemd` supervisionaria o Node. A caixa real é o host do
> **infraKring**: Coolify 4.3.18 sobre Docker 29.6.0, **Traefik v3.6 dono de 80 e 443**,
> produção viva de outro projeto. As emendas **D2-22 a D2-31** trocaram a arquitetura de
> deploy inteira. A camada de PWA, service worker, testes de Playwright e verificação de
> restauração sobreviveu quase intacta e foi **recarregada aqui** — o planejador não precisa
> abrir o arquivo antigo.
>
> Rótulos de estrutura em inglês porque são lidos por ferramenta. Conteúdo em português.

---

## O que da pesquisa anterior continua valendo, e o que foi revogado

Mapa explícito, para que o planejador não precise abrir a versão de 2026-08-31.

| Item da pesquisa de 2026-08-31 | Estado hoje | Onde está neste documento |
|---|---|---|
| **DM-1** — o repositório nunca foi publicado, `ci.yml` nunca rodou | **Consumido.** Feito no 02-01; o repo é público, o CI roda | histórico |
| **DM-2/DM-3** — não há PWA do DG2 para despedir; o do DungeonGuys original está vivo | **VALE.** D2-18 revogou D2-12 por causa disso | § O que NÃO muda |
| **DM-4** — `needs:` não atravessa workflows | **VALE.** É por isso que o job `deploy` mora no `ci.yml` | § Delta do `ci.yml` |
| **DM-5** — `index.html` tem caminhos relativos que o Vite não reescreve → nada de `try_files` | **VALE, e mais forte.** É o 404 honesto do Caddyfile, que sobrevive dentro do contêiner | § Caddyfile de contêiner |
| **DM-6** — `manifest.json` com `start_url`/`scope` em `"."` | **VALE.** Intocado de propósito | § O que NÃO muda |
| **P-1** — trocar `base` e o escopo do SW junto com a reescrita do `sw.js` | **Consumido** (02-02 antes de 02-05 antes de 02-06) | histórico |
| **P-2** — `cache.put` sem checar `res.ok` | **VALE, resolvido e testado** (`api-isolation.spec.ts`) | § O que NÃO muda |
| **P-3** — nome de cache estático nunca limpa | **VALE, resolvido** (`dg2-<16 hex>` derivado do build) | § O que NÃO muda |
| **P-4** — `cache.addAll` usa o cache HTTP | **VALE, resolvido** (`{cache:'reload'}` + `no-cache` no shell) | § Caddyfile de contêiner |
| **P-5** — `handle` é reordenado, `route` não | **VALE integralmente** | § Caddyfile de contêiner |
| **P-6** — `{$VAR}` vs `{env.VAR}` no endereço do site, e o reload que não relê o env | **REVOGADO EM PARTE.** Não há mais endereço de domínio no Caddyfile nem `EnvironmentFile` do systemd; sobra a regra para `{$DG2_UPSTREAM}` | § Delta do teste de ops |
| **P-7** — offline que depende das fontes do Google | **VALE, resolvido** (D2-20, fontes auto-hospedadas) | § O que NÃO muda |
| **P-8** — Litestream v0.5 usa `replica:` singular | **VALE.** `ops/litestream.yml` já está certo | § Litestream |
| **P-9** — migração que falha vira crash-loop invisível | **VALE, com dono novo.** Quem limita o laço deixa de ser `StartLimitBurst` e passa a ser a política de restart do Docker | § Convivência com o vizinho |
| **P-10** — `MemoryMax` sem limitar o heap do V8 troca GC por OOM-kill | **VALE integralmente**, agora como `mem_limit` + `NODE_OPTIONS` | § Compose |
| **P-11** — Cache Storage e `localStorage` não são particionados por escopo | **VALE.** É o argumento de DM-2/D2-18 | § O que NÃO muda |
| **P-12** — `--link-dest` relativo não dedupa | **REVOGADO.** Não há `rsync` no caminho | — |
| Padrão "release por sha com symlink e hardlinks" | **REVOGADO por D2-24** | § Deploy e reversão |
| Padrão "allowlist no service worker" | **VALE, construído** (02-06) | § O que NÃO muda |
| Padrão "passo de build que deriva o precache" | **VALE, construído** (`tools/sw/emit.mjs` + `verify.mjs`) | § O que NÃO muda |
| Padrão "migration provider estático" | **VALE, construído** (02-08) | § O que NÃO muda |
| `ops/Caddyfile` como exemplo de código | **VALE ~80%.** Muda o cabeçalho, o endereço do site, o `root` e o bloco global | § Code Examples |
| `ops/dg2.service` como exemplo de código | **REVOGADO.** Substituído por `mem_limit`/`cpus`/`stop_grace_period` no compose | § Compose |
| `.github/workflows/ci.yml` job de deploy por rsync | **REVOGADO por D2-23/D2-31** | § Delta do `ci.yml` |
| `tools/ops/restore-verify.mjs` | **VALE integralmente**, com o ambiente de execução mudado (contêiner descartável) | § Backup e restauração |
| `ops/cert-check.sh` + timer | **REVOGADO por D2-30.** O certificado é do Traefik. **A capacidade que ele comprava (alarme com 30 dias) precisa de substituto** | § Vigilância |
| Notas de projeto do teste de PWA (Playwright é Chromium-only etc.) | **VALEM integralmente** | § Validation Architecture |
| Lacuna aceita de iOS/Safari (D2-11, `docs/PARIDADE.md`) | **VALE** | § Validation Architecture |

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

Copiadas de `02-CONTEXT.md`. As de 2026-09-09 (D2-22..D2-31) prevalecem sobre as anteriores
onde houver conflito.

**Servidor, banco e monorepo**

- **D2-01:** `apps/server` nasce nesta fase, com banco real. Um processo Node com `/health` e
  um SQLite criado por migração. *(Construído no 02-08.)*
- **D2-02:** O esquema nasce mínimo: só o migrator do Kysely e a tabela do ledger. *(Feito.)*
- **D2-03:** A restauração é um script repetível mais um ensaio anotado, em `tools/ops/`, com
  o resultado registrado em `docs/`. **Não vira timer recorrente.** *(Script feito; ensaio
  pendente.)*
- **D2-04:** O monorepo ganha `apps/*`, mas só o servidor se muda. *(Feito.)*

**Deploy e reversão**

- **D2-05:** O CI constrói e o CI empurra. **Emendada por D2-23** — o argumento sobrevive
  inteiro: *o que é publicado é sempre o que passou no portão cross-engine*.
- **D2-06:** ~~Releases por sha com symlink atômico.~~ **REVOGADA por D2-24.**
- **D2-07:** A migração roda no start do serviço e é sempre aditiva; o banco mora fora da
  árvore de releases; **nenhuma migração faz `DROP` ou rename na mesma versão**.
- **D2-08:** Todo push na `main` que passar no CI publica.

**Service worker, PWA e o fim do espelho**

- **D2-09:** Fim do `skipWaiting()` + `clients.claim()`; a troca só acontece fora de partida.
  *(Feito nos 02-06/02-07.)*
- **D2-10:** O precache é derivado do manifesto do build e cobre tudo. *(Feito no 02-06.)*
- **D2-11:** A verificação de instalação, atualização e offline é só Playwright no CI. A
  lacuna de iOS/Safari físico fica registrada e a caixa de `docs/PARIDADE.md` permanece
  aberta. *(Feito nos 02-05/02-09.)*
- **D2-12:** ~~Último deploy de despedida no Pages.~~ **REVOGADA por D2-18.**

**Domínio, configuração e operação**

- **D2-13:** O domínio está comprado e o DNS já aponta. **Confirmada e especificada:** é
  `dg2.kring.tech`; o wildcard já resolve e o DNS não se toca.
- **D2-14:** Sem staging. Uma caixa, um domínio.
- **D2-15:** Configuração versionada em `ops/`; segredos e domínio fora do repositório.
  **Emendada por D2-29** — `/etc/dg2/env` deixa de ser o lugar único.
- **D2-16:** Vigilância em duas pernas, alarme de certificado com **30 dias**. **Vale com o
  dono trocado:** o certificado é do Traefik, o timer local sai (D2-30), sobra a perna
  externa.
- **D2-17:** Backup por Litestream para bucket S3-compatível, réplica contínua do WAL.
- **D2-18:** A despedida do Pages é cortada; o SW do DungeonGuys **original** apaga todo cache
  que não seja dele, e Cache Storage é por origem — domínio próprio é o que faz o PWA
  funcionar.
- **D2-19:** ~~A VPS é KVM 2 (2 GB).~~ **Desatualizada:** são 8 GB. Os limites de memória
  continuam obrigatórios pelo motivo original, agora como limites de contêiner.
- **D2-20:** As fontes do Google passam a ser auto-hospedadas. *(Feito no 02-02.)*
- **D2-21:** A segunda perna de D2-16 é serviço externo de terceiro, não Action agendada,
  apontando para `/api/health` com keyword matching em `"status":"ok"`.

**Emendas de containerização (2026-09-09) — prevalecem**

- **D2-22:** O jogo vira um app do Coolify, containerizado, publicado por push. O servidor
  escuta 8080 **dentro do contêiner**, nada é publicado no host.
- **D2-23:** O integrador contínuo constrói a imagem e a publica no registro; o Coolify só
  puxa. Deixar o Coolify construir a partir do git contornaria o portão cross-engine.
- **D2-24:** Reverter é apontar para a imagem anterior, **que já está no disco**.
  Consequência a planejar: **quantas imagens ficam antes da poda.**
- **D2-25:** Caddy e Node como **dois serviços de uma composição**. O Caddy do contêiner
  **não termina TLS**: quem termina é o Traefik, em `dg2.kring.tech`.
- **D2-26:** O coturn roda **nativo no host, com systemd** — exceção consciente a D2-22.
  `ops/turnserver.conf` e `ops/coturn-dropin.conf` continuam versionados e testados.
- **D2-27:** A faixa de portas de relay é **declarada e pequena**; `total-quota` desce junto
  para casar com a faixa. Cerca de cem portas ≈ vinte e cinco salas inteiramente por relay.
- **D2-28:** O Litestream **envolve o processo do servidor** (`litestream replicate -exec`).
- **D2-29:** Segredos: painel do Coolify para o app, arquivo no host para o coturn. **O
  `static-auth-secret` passa a existir em dois lugares de naturezas diferentes** e isso tem
  de estar escrito no runbook em voz alta.
- **D2-30:** `ops/` perde `deploy.sh`, `rollback.sh`, `deploy-forced.sh`, `prune-releases.sh`,
  `dg2.service` e os três de `cert-check`. As asserções correspondentes de
  `tests/ops-config.test.ts` são reescritas **no mesmo commit**.
- **D2-31:** A publicação é um gancho do Coolify chamado pelo integrador; **um** segredo no
  lugar dos quatro de SSH.

**Restrições novas que a caixa impõe**

- **D-VPS-01** O jogo vive em `dg2.kring.tech`. O wildcard A já resolve; não se mexe no DNS.
- **D-VPS-02** **Não mexer no infraKring.** Alterações no host são **só aditivas e
  confirmadas antes**. Os dois achados de segurança daquele projeto ficam como observação.
- **D-VPS-03** O jogo vira um app do Coolify, containerizado.
- `rsync` não existe na caixa.

### Claude's Discretion

- **Hono ou Fastify** em `apps/server` e a porta interna. *(Resolvido: Hono, feito no 02-08.)*
- **O que `/health` responde.** *(Resolvido: três chaves, `no-store`.)*
- **`MemoryMax` e o resto do sandbox por serviço.** *(Reabre como limites de contêiner.)*
- **rsync ou tar, e quantos releases ficam no disco.** *(Reabre como: quantas **imagens**
  ficam no disco.)*
- **Forma exata do passo de build que gera o precache.** *(Resolvido: template com sentinelas
  + `tools/sw/emit.mjs`.)*
- **Onde o aviso de atualização aparece na UI.** *(Resolvido no 02-07.)*
- **Se a exclusão de `/api/` no SW já nasce com `/ws` junto.** *(Resolvido: nasce junto.)*
- **Se o servidor reinicia em todo deploy.** *(Reabre: sob contêiner, o `up -d` recria só o
  serviço cuja imagem mudou.)*
- **Uma página de manutenção estática** — sugerida, não decidida.
- **Ordem interna da fase.**

### Deferred Ideas (OUT OF SCOPE)

`apps/web`; tabelas de perfil/run/replay/temporada/placar; subdomínio de staging; timer
recorrente de verificação de restauração; página de manutenção estática; exclusão de `/ws` no
SW (já entrou); disputa da 443 com TURN sobre TLS; cobertura de PWA em aparelho real; limpar
Cache Storage e IndexedDB no logout. Acrescentados em 2026-09-09: os dois achados de
segurança do infraKring; a tarefa T9 (backup off-site) do infraKring; remover
`hello.kring.tech`; TLS na 5349 do coturn.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Descrição | Como esta pesquisa sustenta a implementação |
|---|---|---|
| **INFRA-01** | O jogo single-player roda na VPS sob domínio único com TLS, e o GitHub Pages deixa de ser alvo de deploy | Metade já provada e travada: `tests/workflows.test.ts` (02-01) assere que nenhum workflow publica no Pages. A outra metade é o app do Coolify em `dg2.kring.tech` com certificado do Traefik — **e depende do bloqueador DM-7**. Ver § Deploy e reversão, § Vigilância |
| **INFRA-02** | O PWA continua instalável e funcional offline servido da VPS | Já construído e testado (02-02, 02-05, 02-06, 02-07, 02-09). A containerização **não o toca**; a única verificação nova é que o Caddy atrás do Traefik continua mandando os cabeçalhos de cache. Ver § O que NÃO muda |
| **INFRA-03** | O SW deixa `/api/` passar sem cachear, só guarda respostas `ok`, e deriva o nome do cache do build | Já construído e testado (`api-isolation.spec.ts`, `update.spec.ts`, `sw:verify`). Intocado pela containerização |
| **INFRA-04** | O deploy é um comando, com o processo supervisionado e backup do banco restaurável — verificado restaurando | Reescrito inteiro: supervisão passa a ser do Docker/Coolify; o deploy é o gancho de D2-31; o backup é Litestream em `-exec`; o ensaio de restauração roda em contêiner descartável. Ver § Deploy e reversão, § Backup e restauração |
</phase_requirements>

---

## Summary

A fase 2 está **11/12 executada** e boa parte do que foi construído continua válida sem uma
linha de mudança: o `base: '/'`, as fontes auto-hospedadas, o service worker derivado do build
com allowlist e nome por hash, o aviso de atualização, as quatro specs de Playwright, o
`apps/server` com migração e `/api/health`, e o `tools/ops/restore-verify.mjs`. O que morreu
foi **a camada de entrega**: releases por sha com symlink, `rsync` sobre SSH, `systemd`
supervisionando o Node, o Caddy dono da 443 e o `cert-check` local. Nove dos catorze arquivos
de `ops/` saem, e **34 dos 74 testes de `tests/ops-config.test.ts` morrem com eles**.

A caixa foi inspecionada nesta sessão e a arquitetura nova é implementável quase inteira: o
Coolify aceita uma composição de dois serviços vinda do próprio repositório, referenciando
imagens já construídas no registro; o Traefik já resolve `dg2.kring.tech` e emite certificado
por ACME quando um roteador existir; o Docker guarda a imagem anterior por sha e o Coolify tem
reversão para imagem local; o Litestream, medido no código-fonte, **encaminha o SIGTERM exato
ao filho de `-exec` e espera ele sair**, o que preserva o desligamento gracioso que o 02-08
construiu. Mas há **um bloqueador de arquitetura**: a API do Coolify **não é alcançável da
internet** (medido: 8000 e 8080 dão timeout de fora), e D2-31 pressupõe que o integrador
chame um gancho. Sem resolver isso, não existe "todo push na main publica".

Existem também **três defeitos de código que a containerização torna fatais e que nenhum
teste hoje pega**: o `apps/server` faz bind em `127.0.0.1`, o que o torna inalcançável a
partir do contêiner do Caddy; o `tests/workflows.test.ts` recusa **toda** ação que não seja
`actions/*` e **todo** `: write`, o que reprova qualquer caminho de publicação em registro; e
o Caddy, por padrão, **descarta** o `X-Forwarded-For` de origem não confiável, o que colapsa
o limitador da fase 3 em um balde só.

**Primary recommendation:** planeje **cinco planos** — (1) resolver o bloqueador de
alcançabilidade do Coolify com o usuário e criar a caixa/bucket/segredos; (2) o delta de
código do servidor e do Caddyfile (bind, upstream, trusted_proxies, `auto_https off`);
(3) `ops/` containerizado: Dockerfiles, compose, README reescrito e os 34 testes reescritos;
(4) o `ci.yml` de imagem-e-gancho mais o delta de `tests/workflows.test.ts`; (5) a caixa de
verdade. A ordem 1→2→3→4→5 não pode ser trocada: o 1 decide a forma do 4, e o 5 não existe
sem os quatro.

---

## Architectural Responsibility Map

| Capacidade | Tier primário | Tier secundário | Por quê |
|---|---|---|---|
| Terminação TLS e emissão de certificado | **Traefik (host, contêiner do Coolify)** | — | É quem tem 80 e 443; o ACME dele já roda para o vizinho. O Caddy do jogo perde essa responsabilidade inteira (D2-25) |
| Roteamento por domínio para o app | **Traefik** | Coolify (gera os labels) | Medido: os labels `traefik.http.routers.https-0-*` são gerados pelo Coolify a partir do FQDN do recurso |
| Redirecionamento HTTP→HTTPS | **Traefik** | — | Medido no vizinho: middleware `redirect-to-https` no roteador `http` |
| Política HTTP (CSP, HSTS, três classes de cache, 404 honesto, 503 em JSON) | **Caddy (dentro do contêiner)** | — | **Medido: o Traefik do Coolify não manda nenhum cabeçalho de segurança.** Se o Caddy não mandar, ninguém manda |
| Servir os estáticos do jogo | **Caddy (contêiner `web`)** | — | D2-25. Reescrever a política em Node seria o item mais caro da migração |
| API `/api/*` e signaling `/ws` | **Node (contêiner `api`)** | Caddy repassa | Inalterado de 02-08 |
| Persistência do ledger | **SQLite em volume do Coolify** | — | D2-28 |
| Réplica contínua fora da caixa | **Litestream, como PID 1 do contêiner `api`** | — | D2-28; envolve o Node por `-exec` |
| Supervisão e reinício do processo | **Docker (`restart:`) + Coolify** | — | D2-22; o `systemd` sai do caminho do app |
| Limites de memória e CPU | **Compose (`mem_limit`, `cpus`) + `NODE_OPTIONS`** | — | D2-19 reinterpretada; o par de P-10 continua obrigatório |
| Relay TURN (fase 3) | **coturn nativo, systemd, no host** | UFW | D2-26; faixa larga de UDP não convive com NAT de contêiner |
| Publicação (build da imagem) | **GitHub Actions** | GHCR | D2-23; é o que preserva o portão cross-engine |
| Disparo do deploy | **Coolify (gancho/API)** | GitHub Actions chama | D2-31 — **bloqueado por DM-7** |
| Vigilância de disponibilidade e de certificado | **Monitor externo de terceiro** | — | D2-16/D2-21; a perna local morreu com `cert-check` |

---

## Descobertas que Mudam o Plano

Continuando a numeração da pesquisa de 2026-08-31 (DM-1..DM-6, todas consumidas ou
preservadas no mapa acima).

### DM-7 — A API do Coolify **não é alcançável da internet**. D2-31 não é implementável como está. `[VERIFIED: curl externo + iptables na caixa]`

Medido em 2026-09-09:

| Alvo | Resultado |
|---|---|
| `http://dg2.kring.tech:8000/` (painel/API do Coolify) | **timeout após 12 s** |
| `http://dg2.kring.tech:8080/` (porta publicada do Traefik) | **timeout após 12 s** |
| `https://dg2.kring.tech/` | **503**, com certificado autoassinado |
| `APP_URL` em `/data/coolify/source/.env` | **ausente** — a instância não tem FQDN |
| `iptables -L DOCKER-USER` | `DROP tcp dpt:6002`, `dpt:6001`, `dpt:8000` |
| Roteadores em `/data/coolify/proxy/dynamic/` | só o `catchall` → serviço `noop` → 503 |

O 503 com certificado autoassinado é exatamente o `catchall` de prioridade `-1000` que o
Coolify instala: nenhum roteador casa `dg2.kring.tech`, então o Traefik responde com o
certificado padrão e um serviço sem servidores. É o comportamento esperado de um domínio
ainda não configurado — o DNS está certo, o app é que não existe.

**A consequência é a que decide o plano:** D2-31 diz "a publicação é um gancho do Coolify,
chamado pelo integrador", e **não há endereço para o integrador chamar**. Toda forma de deploy
por push — gancho do CI, GitHub App do Coolify, webhook do GitHub — exige que a instância do
Coolify seja alcançável de fora. Hoje não é, por decisão do infraKring (o
`21-coolify-lockdown.sh` daquele projeto), e mexer nisso é mexer no vizinho (D-VPS-02).

As quatro saídas, custeadas:

| # | Saída | O que muda no host | Superfície nova | D2-08 preservada? |
|---|---|---|---|---|
| **A** | **Dar FQDN ao Coolify** (Settings → Instance Domain), o que faz o Coolify pôr labels do Traefik no próprio contêiner | Aditivo: um roteador novo no Traefik do vizinho | O **login do painel** passa a ser público. Mitigável com token de permissão `Deploy`, expiração e IP allowlist | **Sim** |
| **B** | **Expor só `/api/v1/deploy`** por um arquivo de configuração dinâmica do Traefik com `Host(...) && PathPrefix('/api/v1/deploy')` | Aditivo: um arquivo em `/data/coolify/proxy/dynamic/`, diretório do vizinho, que o Coolify gerencia | Só o endpoint de deploy. Mais cirúrgico que A | **Sim** |
| **C** | **Puxar em vez de empurrar:** um timer no host que compara a tag publicada no GHCR e chama a API do Coolify em `localhost` | Aditivo: uma unit + um timer + um script no host | **Nenhuma.** Nada entra | Sim, com atraso de até N minutos |
| **D** | **Chave SSH com `command=` fixo** que só executa o `curl` para `localhost:8000/api/v1/deploy` | Aditivo: uma linha em `authorized_keys` | Uma chave em serviço de terceiro — mas com **zero** poder de escrita, ao contrário da de `deploy-forced.sh` | **Sim** |

**Recomendação: A, com token de permissão `Deploy` e expiração, tratada como portão humano.**
Motivo: é a única que mantém o modelo operacional do Coolify inteiro (D2-22), fecha a tarefa
T8 do infraKring que D2-22 cita como ganho colateral, e o painel do Coolify precisa de um
domínio de qualquer jeito para deixar de ser acessível só por túnel. **Se Gustavo recusar
expor o painel**, a segunda escolha é **D**: uma chave com `command=` fixo tem superfície
menor que o `deploy-forced.sh` que D2-31 celebrou aposentar, porque não aceita argumento
nenhum — o comando é literal, sem `$SSH_ORIGINAL_COMMAND`. **C** é a única com zero exposição,
mas reintroduz host-as-code que D2-22 estava eliminando.

**Isto precisa virar pergunta ao usuário antes do planejamento fechar.** É a única decisão da
fase que não é técnica: é sobre o vizinho.

`[VERIFIED: medição própria de 2026-09-09]`

### DM-8 — `tests/workflows.test.ts` reprova, hoje, todo caminho de publicação em registro `[VERIFIED: leitura do teste]`

Duas asserções escritas de propósito no 02-11 barram D2-23:

```
describe('nenhuma ação de terceiro roda no CI (T-2-SC)')
  it('todo `uses:` é uma ação da própria GitHub')
    const bad = found.filter((a) => !/^actions\/[A-Za-z0-9._-]+@\S+$/.test(a));
    expect(bad).toEqual([]);

  it('nenhum escopo de permissão é concedido para escrita')
    const raised = src.split('\n').filter((l) => /^\s+[a-z-]+:\s*write\s*\r?$/.test(l));
    expect(raised).toEqual([]);
```

Ou seja: `docker/login-action` e `docker/build-push-action` **reprovam**, e `packages: write`
— necessário para empurrar no GHCR com o `GITHUB_TOKEN` — **reprova**.

**Resolução recomendada, e ela é barata:**

1. **Não use ação de terceiro nenhuma.** O runner hospedado do GitHub já traz `docker` e
   `buildx`. `docker login ghcr.io --password-stdin`, `docker build`, `docker push` em passos
   `run:` fazem o trabalho inteiro e **deixam o portão T-2-SC intacto** — que é um ganho, não
   um contorno: o pipeline que publica continua sem uma linha de código de estranho.
2. **`packages: write` precisa de exceção explícita.** A asserção passa a admitir exatamente
   um `packages: write`, e exatamente no job que empurra a imagem — a mesma forma da asserção
   `deployJob()` que já existe. A alternativa (um PAT clássico com `write:packages` num
   secret) é pior: credencial longeva contra token efêmero de job.

Para referência, se a opção de ação de terceiro voltar à mesa, as quatro relevantes foram
medidas e **todas** já são `node24` — `docker/login-action@v4.6.0`,
`docker/build-push-action@v7.3.0`, `docker/metadata-action@v6.2.0`,
`docker/setup-buildx-action@v4.3.0` — então não brigariam com o portão de runtime.
`[VERIFIED: action.yml de cada tag]`

### DM-9 — `apps/server` faz bind em `127.0.0.1`; num contêiner isso o torna inalcançável pelo Caddy `[VERIFIED: apps/server/src/index.ts:88]`

```ts
export const server = serve({ fetch: app.fetch, port: env.port, hostname: '127.0.0.1' });
```

O comentário acima dessa linha diz, corretamente para a arquitetura antiga: *"o bind é
controle de acesso, não configuração: em loopback, o processo é alcançável só através do
Caddy"*. Em dois contêineres, `127.0.0.1` é o loopback **do contêiner do Node**, e o contêiner
do Caddy não tem como chegar lá. O sintoma seria 503 em `/api/*` desde o primeiro deploy, com
tudo o mais verde.

**Resolução recomendada:** um `DG2_BIND` novo em `env.ts`, com padrão `127.0.0.1` — o padrão
preserva a defesa original em desenvolvimento e em qualquer execução nativa — e valor
`0.0.0.0` posto **no compose**, onde é uma escolha revisável em diff. A defesa não se perde:
sob D2-22 nada é publicado no host, então `0.0.0.0` dentro do contêiner significa "alcançável
pela rede isolada que o Coolify criou", e mais nada. O teste que morreu junto com o
`dg2.service` (`não publica a API fora do loopback`) renasce como **"o serviço `api` do
compose não declara `ports:`"** — que é a asserção certa para esta arquitetura.

### DM-10 — O Caddy descarta o `X-Forwarded-For` de origem não confiável; sem `trusted_proxies`, o limitador da fase 3 vira um balde só `[VERIFIED: docs do Caddy + código do limiter]`

A documentação do `reverse_proxy` é literal: o proxy *"ignora os valores vindos da requisição,
para prevenir spoofing"*, a menos que a origem esteja em `trusted_proxies`. E
`apps/server/src/signaling/limiter.ts` faz exatamente o que o comentário dele descreve:

```ts
export function clientIp(req, socket) {
  const forwarded = req.headers['x-forwarded-for'];
  ...
  if (first.length > 0) return first;
  return socket.remoteAddress ?? 'desconhecido';
}
```

A cadeia nova é **cliente → Traefik → Caddy → Node**. O Traefik, por padrão, **não** confia
em `X-Forwarded-For` de cliente não listado em `trustedIPs` e o substitui pelo endereço real
do peer TCP `[CITED: doc.traefik.io/traefik/reference/install-configuration/entrypoints]` — ou
seja, o que chega ao Caddy está certo. Mas o Caddy, sem `trusted_proxies`, **sobrescreve**
esse valor com o IP do contêiner do Traefik. O Node então vê um único endereço para a internet
inteira, e o limitador de upgrade de WebSocket entra no cenário que o próprio comentário dele
nomeia: *"os dois desfechos são 'ninguém é limitado' ou 'todo mundo é'"*.

**Resolução:** bloco global no Caddyfile do contêiner:

```
{
    servers {
        trusted_proxies static private_ranges
    }
}
```

`private_ranges` cobre a rede bridge do Coolify (172.16/12), que é a única origem capaz de
alcançar o contêiner, porque nada é publicado no host. Isso não afrouxa nada: um cliente da
internet não fala com o Caddy diretamente.

**Impacto declarado:** este é um defeito da **fase 3** que só aparece contra a caixa. O plano
da fase 2 deve corrigi-lo aqui, porque aqui é onde o Caddyfile é reescrito, e o `03-11` vai
medir o desfecho ICE contra este mesmo caminho.

### DM-11 — O Traefik do Coolify não manda **nenhum** cabeçalho de segurança `[VERIFIED: curl no vizinho]`

Resposta medida de `https://militias3dstore.kring.tech/`:

```
HTTP/2 200
alt-svc: h3=":443"; ma=2592000
cache-control: private, no-cache, no-store, max-age=0, must-revalidate
content-type: text/html; charset=utf-8
vary: rsc, next-router-state-tree, ...
x-powered-by: Next.js
```

Sem `strict-transport-security`, sem `x-content-type-options`, sem `referrer-policy`, sem
`content-security-policy`. Os labels do vizinho confirmam: os únicos middlewares que o Coolify
gera são `gzip.compress=true` e `redirect-to-https.redirectscheme.scheme=https`.

**Consequência:** o dono do HSTS, do CSP, do `nosniff` e do `Referrer-Policy` continua sendo o
Caddy do contêiner, exatamente como o `ops/Caddyfile` já faz — e o bloco `header` de nível de
site sobrevive **sem uma linha de mudança**. O HSTS funciona porque o navegador só o honra em
conexão HTTPS, e a conexão do navegador é com o Traefik, que é HTTPS; o salto interno em texto
plano não interfere.

O `alt-svc: h3=":443"` é o Traefik anunciando HTTP/3 (medido: `--entrypoints.https.http3` na
linha de comando dele). Nada a fazer.

### DM-12 — `better-sqlite3@13.0.3` traz os binários pré-compilados **dentro do tarball do npm**, inclusive para musl `[VERIFIED: node_modules local + GitHub Releases]`

`node_modules/better-sqlite3/prebuilds/` contém oito arquivos:

```
darwin-arm64  darwin-x64  linux-arm64  linux-x64
linuxmusl-arm64  linuxmusl-x64  win32-arm64  win32-x64
```

E a release `v13.0.3` no GitHub tem **zero** assets — ou seja, o pacote **não** depende de
`prebuild-install` baixando de lá. Isso derruba duas suposições:

- **Não é preciso compilador na imagem.** Nem `python3`, nem `make`, nem `g++`. Um
  `npm ci --omit=dev` dentro do build resolve, e a imagem pode ser `slim` sem penalidade.
- **Alpine também serve** (`linuxmusl-x64` está lá), embora `node:24-trixie-slim` seja a
  escolha mais conservadora e case com o Debian 13 da caixa.

Isso **elimina de vez** o passo manual de `/srv/dg2/node_modules` que o `ops/README.md` §3
documenta — que era, junto com a chave de deploy, o passo mais frágil do modelo antigo.
Custo: 27 MB instalados, dos quais ~16 MB são os oito prebuilds. Podados ou não, cabem.

> Nota de discrepância: `CLAUDE.md` § Version Compatibility diz *"Módulo nativo: recompila a
> cada major do Node. Prebuilds cobrem Linux x64/arm64"*. A primeira metade continua
> verdadeira em espírito; a segunda estava certa mas subestimava — os prebuilds vêm no npm,
> não no GitHub, e cobrem musl também.

### DM-13 — O Litestream **encaminha o sinal exato** ao filho de `-exec` e espera ele sair antes de terminar `[VERIFIED: código-fonte v0.5, cmd/litestream]`

Medido em `cmd/litestream/main.go` e `main_notwindows.go`:

```go
func signalChan() <-chan os.Signal {
    ch := make(chan os.Signal, 2)
    signal.Notify(ch, syscall.SIGINT, syscall.SIGTERM)
    return ch
}
...
case sig := <-signalCh:
    slog.Info("signal received, litestream shutting down", "signal", sig)
    if err := c.cmd.Process.Signal(sig); err != nil { ... }
    if err := <-c.execCh; err != nil && !strings.HasPrefix(err.Error(), "signal:") { ... }
```

Isso é a resposta direta à pergunta 3 do `STATE.md`. Com `litestream replicate -exec "node
/srv/server.mjs"` como PID 1:

1. O Docker manda `SIGTERM` ao PID 1 (litestream).
2. O litestream repassa **o mesmo sinal** ao Node.
3. O Node roda `apps/server/src/shutdown.ts` — para de aceitar, drena, fecha o SQLite, com
   watchdog de `SHUTDOWN_GRACE_MS = 5_000`.
4. O litestream **espera** o filho sair (`<-c.execCh`) e só então faz a sincronização final.

Nenhum `tini`, nenhum script de entrypoint com `trap`, nenhum `s6-overlay`. O desligamento
gracioso que o 02-08 construiu e o `02-REVIEW` WR-07 exigiu **sobrevive intacto**.

**Consequência de dimensionamento:** o Docker mata com SIGKILL após o `stop_grace_period`, que
por padrão é **10 s**. O `dg2.service` usava `TimeoutStopSec=10` para os 5 s de watchdog do
Node — mas agora há uma etapa a mais depois: a sincronização final do litestream para o
bucket. **Recomende `stop_grace_period: 30s`** no serviço `api`, e mantenha a asserção de
ordenação que `tests/ops-config.test.ts` já faz importando `SHUTDOWN_GRACE_MS` — só que agora
comparando com o valor do compose.

Versão medida: **Litestream v0.5.17, publicada em 2026-08-31.** Imagem
`litestream/litestream:0.5.17` existe no Docker Hub (com variante `-scratch`).

### DM-14 — Debian 13 traz **coturn 4.6.1-2**, não 4.17/4.18 `[VERIFIED: apt-cache policy na caixa]`

```
coturn:
  Installed: (none)
  Candidate: 4.6.1-2
```

`CLAUDE.md` § Recommended Stack recomenda coturn 4.17.2 e a última release upstream é
**4.18.0** (2026-09-08). O `ops/coturn-dropin.conf` foi escrito de propósito como **drop-in
sobre a unit do distribuidor**, o que continua sendo a decisão certa (o Debian mantém os
patches de segurança). Todas as diretivas que `ops/turnserver.conf` usa —
`use-auth-secret`, `denied-peer-ip`, `no-multicast-peers`, `user-quota`, `total-quota`,
`no-cli`, `fingerprint`, `min-port`/`max-port` — existem desde muito antes do 4.6.

**O que o plano deve escrever:** que a versão instalada é 4.6.1-2 do Debian, que isso é uma
escolha (manutenção pelo distribuidor) e não um acidente, e que o `no-cli` continua sendo a
mitigação certa porque os CVEs históricos do coturn moraram na interface de gestão.

### DM-15 — O UFW **não governa** porta publicada por contêiner, mas **governa** processo nativo. Por isso o bug de D2-27 é real e o coturn nativo precisa de regra `[VERIFIED: iptables na caixa]`

Medido:

```
Chain FORWARD (policy DROP)
1  DOCKER-USER
2  DOCKER-FORWARD
3  ufw-before-logging-forward
...
```

`DOCKER-USER` e `DOCKER-FORWARD` vêm **antes** das cadeias do UFW na `FORWARD`. Uma porta
publicada por `docker run -p` é DNAT'ada e atravessa a `FORWARD`, então o UFW nunca a vê — é a
interação documentada Docker/UFW, e é por isso que o infraKring precisou do
`21-coolify-lockdown.sh` com regras em `DOCKER-USER` para trancar 6001, 6002 e 8000.

Um processo **nativo**, ao contrário, é destino do próprio host: a `INPUT` decide, e a `INPUT`
tem `policy DROP` com o UFW governando. O estado medido do UFW:

```
Default: deny (incoming), allow (outgoing), deny (routed)
22/tcp ALLOW IN Anywhere   # SSH
80/tcp ALLOW IN Anywhere   # HTTP
443/tcp ALLOW IN Anywhere  # HTTPS
```

**Consequências, todas com ação:**

1. **O bug de D2-27 é confirmado e é de dois lados.** `ops/turnserver.conf` não declara
   `min-port`/`max-port`, então o coturn aloca relay em 49152–65535/udp — faixa que o UFW
   bloqueia inteira. E `ops/README.md` §581 manda abrir só `3478/udp`, `3478/tcp` e
   `5349/tcp`. O plano precisa de **duas** correções: a faixa declarada no `.conf` **e** a
   faixa aberta no UFW no runbook. Uma sem a outra continua produzindo "um amigo específico
   nunca entra".
2. **O coturn nativo precisa de três regras novas no UFW** que hoje não existem: `3478/udp`,
   `3478/tcp`, `5349/tcp`. Nenhuma delas existe na caixa. São alterações **aditivas**, o único
   tipo que D-VPS-02 admite, e a única exigência desta fase e da fase 3 sobre o host.
3. **Contêiner com `network_mode: host` não ajudaria** — também cai na `INPUT`. E publicar
   ~100 portas UDP por `-p` criaria uma centena de regras e de processos `docker-proxy`. **A
   decisão D2-26 (nativo) está certa pelo motivo certo**, e agora com medição por trás.
4. `443/udp` **não** está aberto no UFW, mas o Traefik responde HTTP/3 mesmo assim — porque a
   publicação por Docker o contorna. Observação, não ação (é do vizinho).

**Dimensionamento recomendado para D2-27:** `min-port=49200`, `max-port=49299` (100 portas).
Cada alocação TURN consome uma porta de relay, então **`total-quota` tem de descer para no
máximo 100** — hoje está em 1200, que promete doze vezes o que a faixa entrega. `user-quota=12`
pode ficar, mas fica desproporcional; considere baixar para 6.

### DM-16 — O Coolify guarda a imagem anterior por sha, e tem reversão **só para imagem local** — mas a limpeza automática pode apagá-la `[VERIFIED: docker images na caixa + docs do Coolify]`

Medido no disco da caixa:

```
nkdw9iz9wjsz0scw8qc25gr0:da708dee973a44d874eb8389b4fd166782fcba39  441MB  2 months ago
nkdw9iz9wjsz0scw8qc25gr0:39d7982fd2735568a0c61dbffaa45e1b26c4bc63  441MB  2 months ago
```

Duas tags, por sha de commit, da mesma aplicação — a atual e a anterior, ambas ainda em disco
**dois meses depois**. E a documentação do Coolify diz, sobre reversão: *"At the moment, only
local images are supported, so you can only rollback to a locally available docker image."*
`[CITED: coolify.io/docs/applications]` Ou seja, **o requisito de D2-24 é exatamente a
capacidade que o Coolify oferece**, e o `docker system df` da caixa mostra 5,78 GB de imagens
com 2,87 GB recuperáveis, contra **85 GB livres**.

**O risco, e ele é real:** a "Automated Docker Cleanup" do Coolify remove *"unused Docker
images"*, e uma imagem de release anterior é, por definição, não usada por nenhum contêiner. O
gatilho padrão é **percentual de disco** (o exemplo da doc é 80 %); há também agendamento por
cron opcional. **Essa configuração é do SERVIDOR, compartilhada com o vizinho** — lê-se, não
se mexe (D-VPS-02).

**O que o plano deve fazer:**

1. **Ler e registrar** a configuração de limpeza do servidor no `docs/OPERACAO.md`
   (`Servers > … > Configuration > Advanced`). Com o disco em 11 %, um gatilho de 80 % está
   longe.
2. **Fixar o número de D2-24 em 5 imagens por serviço**, herdando a retenção que o
   `prune-releases.sh` já tinha decidido — continuidade de operação, não um número novo.
   Custo real: com o `COPY package*.json` → `npm ci` → `COPY dist-server` na ordem certa, a
   camada de `node_modules` é compartilhada entre builds e cada deploy custa alguns MB de
   camada nova, não 130 MB.
3. **Provar a reversão sem rede no 02-12**, e o método honesto é: `pull_policy: missing` no
   compose (o Docker só busca no registro o que não estiver em disco) mais um teste com o
   `ghcr.io` inalcançável — uma linha temporária em `/etc/hosts` da caixa, removida em
   seguida. Sem esse teste, "reverte sem rede" continua sendo uma promessa.
4. **Registrar honestamente a degradação:** o symlink de D2-06 era uma garantia estrutural
   (o diretório está lá ou não está). A imagem local é uma garantia **probabilística**,
   dependente de uma rotina de limpeza que este projeto não controla. É uma perda real, e
   deve estar escrita no runbook em vez de descoberta na noite em que importa.

### DM-17 — O usuário `deploy` **não está no grupo docker**, mas tem `sudo` sem senha `[VERIFIED: id + sudo -n na caixa]`

```
uid=1001(deploy) gid=1001(deploy) groups=1001(deploy),27(sudo),100(users)
docker: permission denied while trying to connect to the docker API
sudo -n true → ok
```

Todo comando de Docker do runbook precisa de `sudo`. Isso é uma decisão razoável do infraKring
(estar no grupo `docker` é equivalente a root) e **não deve ser mexida** — mas o runbook novo
tem de escrever `sudo docker …` em todo lugar, ou o operador tropeça no primeiro comando.
Consequência secundária: qualquer script de operação que este projeto ponha no host precisa
ou de `sudo` ou de rodar como root por systemd.

### DM-18 — `dg2.kring.tech` resolve e já responde; falta só o roteador `[VERIFIED: getent + curl]`

```
187.x.x.x  dg2.kring.tech          (o mesmo A do wildcard, idêntico ao do vizinho)
https://dg2.kring.tech/ → 503, certificado autoassinado
```

D2-13/D-VPS-01 confirmadas: **o DNS não está no caminho crítico e não se toca.** O certificado
válido nasce quando o Coolify criar o roteador com `tls.certresolver=letsencrypt` — que é o
label medido no vizinho. O desafio é HTTP-01 pela entrypoint `http`
(`--certificatesresolvers.letsencrypt.acme.httpchallenge`), e a 80 está aberta, então não há
passo de DNS-01 nem de wildcard a configurar.

### DM-19 — A caixa não tem Node, nem rsync, nem litestream, nem coturn `[VERIFIED: which/apt na caixa]`

| Binário | Estado |
|---|---|
| `node` | **ausente** |
| `rsync` | **ausente** |
| `litestream` | **ausente** |
| `turnserver` | **ausente** (candidato 4.6.1-2) |
| `docker` | 29.6.0 (via `sudo`) |
| `docker compose` | v5.1.4 |

Isso **confirma a pergunta 5 do `STATE.md` pela negativa**: não é que o build "cabe" na caixa —
é que **não há como buildar lá**, porque não há Node. Sob D2-23 o build é do CI, e o custo na
caixa é `git clone` do repositório (pequeno, público) + `docker pull` das camadas novas + `up
-d`. Os dois vCPU do vizinho não são disputados por `tsc` nem por `vite build`.
Consequência secundária: `litestream` e `coturn` são instalações **novas** no host — a segunda
é nativa (D2-26), a primeira vai **dentro da imagem**, não no host.

### DM-20 — `tests/ops-config.test.ts` tem 74 testes; **34 morrem** com D2-30, e o piso anti-vacuidade quebra `[VERIFIED: contagem no arquivo]`

Contagem por bloco:

| `describe` | Testes | Destino |
|---|---:|---|
| `ops/Caddyfile` | 9 | **6 sobrevivem, 3 mudam**, +2 nascem |
| `scripts de ops/` | 18 | **todos morrem** |
| `ops/dg2.service` | 7 | **todos morrem**; 4 renascem como asserções sobre o compose |
| `ops/turnserver.conf` | 4 | sobrevivem, **+2 nascem** (faixa de relay, cota casada) |
| `ops/coturn-dropin.conf` | 2 | sobrevivem intactos |
| `ops/litestream.yml` | 3 | sobrevivem, **1 muda** (caminho do banco) |
| `ops/litestream.service` | 3 | **todos morrem**; 2 renascem sobre o `-exec` do compose |
| `cert-check` | 6 | **todos morrem** |
| `ops/README.md` | 11 | **9 mudam**, 2 sobrevivem |
| `tools/ops/restore-verify.mjs` | 5 | sobrevivem intactos |
| D2-15 (endereço/segredo) | 5 | sobrevivem, **mas o piso quebra** |
| LF/CRLF | 1 | sobrevive |
| **Total** | **74** | **34 removidos, ~15 reescritos, ~10 nascem** |

O piso que quebra em silêncio:

```ts
expect(entries.length, 'os globs de ops/ e tools/ops/ vieram vazios')
  .toBeGreaterThanOrEqual(13);
```

`ops/` tem hoje **14** arquivos e `tools/ops/` tem 1, dando 15 entradas. Depois de D2-30 saem
9 e entram ~3, dando **~9 entradas** — abaixo do piso, e o bloco inteiro da D2-15 fica
vermelho por um motivo que não é o dele. O número tem de descer no mesmo commit.

Também: `const SCRIPTS = ['deploy-forced.sh', 'deploy.sh', 'rollback.sh',
'prune-releases.sh', 'cert-check.sh']` — a lista fica **vazia**, e a asserção "o glob
encontrou exatamente os scripts esperados" passa a exigir que `ops/*.sh` seja vazio. Vale
manter a asserção invertida: **nenhum `.sh` em `ops/`** é uma propriedade que D2-30 quer
preservar (o Docker é quem executa agora), e ela impede alguém de reintroduzir um script de
deploy por hábito.

---

## Standard Stack

### Core

| Tecnologia | Versão | Papel | Por que esta |
|---|---|---|---|
| **Docker Engine** | **29.6.0** (na caixa) | Runtime dos dois contêineres | Medido. API 1.55 |
| **Docker Compose** | **v5.1.4** (na caixa) | Orquestração dos dois serviços | Medido. Suporta `pull_policy`, `mem_limit`, `cpus`, `stop_grace_period` |
| **Coolify** | **4.3.18** (na caixa, atualizado há 19 h) | Plataforma: recurso, domínio, variáveis, deploy, reversão | Medido. É a decisão D-VPS-03; a última release upstream é a mesma 4.3.18 (2026-09-08) |
| **Traefik** | **v3.6** (na caixa) | TLS/ACME, roteamento por Host, redirect HTTP→HTTPS | Medido. Última upstream é 3.7.12, mas a versão é do vizinho e **não se mexe** (D-VPS-02) |
| **Caddy** | **2.11.4-alpine** (imagem, 23,9 MB) | Política HTTP e estáticos dentro do contêiner | D2-25. Mesma versão do `CLAUDE.md`; a imagem oficial existe e foi verificada |
| **Node** | **24-trixie-slim** (imagem, 85,3 MB; 24.20.0) | Runtime do `apps/server` | Node 24 é o LTS ativo; `trixie-slim` casa o Debian 13 da caixa. Node 26 é *Current*, fora por doutrina |
| **Litestream** | **0.5.17** (2026-08-31) | Réplica contínua do WAL, e PID 1 do contêiner `api` | D2-17/D2-28. `-exec` encaminha sinal (DM-13) |
| **coturn** | **4.6.1-2** (Debian trixie) | Relay TURN, **nativo no host** | D2-26 + DM-14. Instalado pelo distribuidor, configurado por drop-in |
| **GHCR** (`ghcr.io`) | — | Registro das duas imagens | Tokenização efêmera pelo `GITHUB_TOKEN`; repositório já é público, então o pacote pode ser público e o Coolify puxa sem credencial |

### Supporting

| Item | Versão | Papel | Quando |
|---|---|---|---|
| `sqlite3` (CLI) | do Debian trixie | `tools/ops/restore-verify.mjs` o invoca em `-readonly` | Dentro da imagem `api`, ou num contêiner descartável para o ensaio |
| Monitor externo | UptimeRobot / Healthchecks.io / Better Stack | Perna única de D2-16 depois que `cert-check` morreu | **Escolha um que tenha alerta de expiração de certificado** — ver § Vigilância |
| `wget`/`curl` na imagem `api` | do base | `healthcheck:` do compose | Opcional, mas o Coolify usa healthcheck para decidir se o deploy pegou |

### Alternatives Considered

| Recomendado | Alternativa | Quando a alternativa é melhor |
|---|---|---|
| Dois serviços (Caddy + Node) | **Um contêiner só, com s6-overlay** | Se a rede do Coolify der problema entre serviços. Custo: um init novo no projeto, e a doc do Litestream é explícita que `-exec` supervisiona **um** processo. Não vale antes de um problema medido |
| Dois serviços | **Só o Node servindo estático** | Se a política do Caddyfile fosse barata de portar — não é: CSP derivado arquivo a arquivo, três classes de cache, 404 honesto (DM-5), 503 em JSON. D2-25 decidiu contra, com razão |
| Compose vindo do git | **"Docker Compose Empty"** (colar o YAML no painel) | Se o Coolify recusar a composição do repositório. Custo: o compose sai do git e D2-15 ("config revisável em diff") deixa de valer para ele |
| `docker build/push` em `run:` | `docker/build-push-action@v7.3.0` | Se precisar de cache de camada entre execuções ou multi-plataforma. Custo: reprova em `tests/workflows.test.ts` (DM-8) |
| GHCR | **Docker Hub** ou o registro do próprio Coolify | Docker Hub exige credencial longeva num secret. O registro do Coolify não existe nesta instalação e criaria mais superfície na caixa. GHCR é o único que usa token efêmero |
| `node:24-trixie-slim` | `node:24-alpine` | Se o tamanho importar (~50 MB a menos). `linuxmusl-x64.node` existe (DM-12), então funciona — mas glibc é o caminho menos surpreendente e a caixa é Debian |
| `litestream replicate -exec` | Litestream como serviço irmão no compose | Um serviço irmão reintroduz a janela em que o banco recebe escrita e ninguém replica, que é exatamente o que D2-28 fecha. E dois contêineres montando o mesmo volume para escrever é pior, não melhor |

**Instalação:** esta fase **não acrescenta nenhuma dependência npm**. Ver § Package
Legitimacy Audit.

---

## Package Legitimacy Audit

**Nenhum pacote npm ou PyPI novo é instalado nesta fase.** O `package.json` da raiz continua
com `dependencies: {}` e o de `apps/server` não ganha entrada. O portão de legitimidade de
pacotes, na forma npm/PyPI, **não se aplica**. `slopcheck` foi procurado na máquina e está
ausente; como não há pacote para auditar, isso não degrada nada.

O que **entra** são imagens base e nenhuma ação de terceiro. Auditoria equivalente:

| Artefato | Origem | Verificação | Disposição |
|---|---|---|---|
| `caddy:2.11.4-alpine` | Docker Official Image (`library/caddy`) | Tag existe, 23,9 MB, versão idêntica à recomendada em `CLAUDE.md` | **Aprovada.** Fixar a tag exata, nunca `:latest` |
| `node:24-trixie-slim` | Docker Official Image (`library/node`) | Tag existe, 85,3 MB; 24.20.0 é o LTS ativo | **Aprovada.** Fixar `24.20.0-trixie-slim` para reprodutibilidade |
| `litestream` v0.5.17 | Release oficial no GitHub (`benbjohnson/litestream`) | Publicada 2026-08-31; imagem `litestream/litestream:0.5.17` também existe | **Aprovada.** Preferir o **tarball da release com sha256 fixado** no `Dockerfile`, seguindo a doutrina que `ops/litestream.service` já escreve ("binário do release oficial, fora do grafo npm") |
| `coturn` 4.6.1-2 | Debian trixie `main` | `apt-cache policy` na caixa | **Aprovada.** Pacote do distribuidor, com drop-in — não copiar a unit |
| Ações do CI | só `actions/*` | `tests/workflows.test.ts` já é o portão | **Aprovada por construção**, e a recomendação de DM-8 é **não** acrescentar nenhuma |

**Removidos por veredito `[SLOP]`:** nenhum.
**Sinalizados `[SUS]`:** nenhum.

---

## Architecture Patterns

### Diagrama de fluxo

```
                    Internet
                       │
              ┌────────┴────────┐
              │ 80/tcp  443/tcp │  (UFW ALLOW; 443/udp entra por bypass do Docker)
              └────────┬────────┘
                       ▼
        ┌──────────────────────────────┐
        │  coolify-proxy (Traefik v3.6)│  ← contêiner do infraKring, NÃO se mexe
        │  · ACME HTTP-01 → acme.json  │
        │  · redirect http→https       │
        │  · Host(dg2.kring.tech) ─────┼──┐
        │  · Host(militias3d...) ──────┼──┼──► vizinho (produção viva)
        │  · catchall → 503            │  │
        └──────────────────────────────┘  │
                                          │  rede bridge `coolify`, sem porta no host
                        ┌─────────────────┘
                        ▼
        ┌───────────────────────────────────────────────────┐
        │  serviço `web`  —  caddy:2.11.4-alpine            │
        │  http://:8080   auto_https off                     │
        │  trusted_proxies static private_ranges  (DM-10)    │
        │  header: CSP · HSTS · nosniff · Referrer-Policy    │
        │  ┌──────────────┬──────────────┬────────────────┐  │
        │  │ handle /api/*│ handle /ws   │ handle (root)  │  │
        │  └──────┬───────┴──────┬───────┴────────┬───────┘  │
        │         │              │        /srv/www (dist/)   │
        │         │              │    3 classes de cache     │
        │         │              │    404 honesto (DM-5)     │
        │  handle_errors → 503 {"status":"unavailable"}       │
        └─────────┼──────────────┼───────────────────────────┘
                  ▼              ▼
        ┌───────────────────────────────────────────────────┐
        │  serviço `api`  —  node:24-trixie-slim            │
        │                                                    │
        │  PID 1: litestream replicate -exec "node server"  │
        │           │ SIGTERM repassado, espera o filho     │
        │           ▼                                        │
        │        node /srv/server.mjs                        │
        │        bind 0.0.0.0:8080  (DG2_BIND, DM-9)         │
        │        · migrateToLatest() antes de servir         │
        │        · GET /api/health → {"status":"ok",...}     │
        │        · upgrade /ws → signaling (fase 3)          │
        │           │                                        │
        │           ▼   volume `dg2-data`                    │
        │        /var/lib/dg2/dg2.db (+ -wal, -shm)          │
        └───────────┬───────────────────────────────────────┘
                    │ WAL, contínuo
                    ▼
            bucket S3-compatível (fora da caixa)

        ─────────── fora do Docker, no host ───────────
        ┌───────────────────────────────────────────────────┐
        │  coturn 4.6.1-2, systemd + drop-in  (fase 3)      │
        │  3478/udp · 3478/tcp · 5349/tcp                   │
        │  relay: min-port..max-port (~100)  ← UFW precisa  │
        │  use-auth-secret ↔ DG2_TURN_SECRET no painel      │
        └───────────────────────────────────────────────────┘

        ─────────── caminho de publicação ───────────
        push na main → ci.yml [test | pwa] → job `image`
           docker build web+api ← baixa os MESMOS artefatos (D2-05/D2-23)
           docker push ghcr.io/…:<sha>
           → gancho do Coolify  ← BLOQUEADO por DM-7
              Coolify: git clone, substitui env, docker compose up -d
```

### Estrutura de arquivos depois desta fase

```
ops/
├── Caddyfile               # ALTERADO: sem ACME, sem domínio, trusted_proxies, root novo
├── Dockerfile.web          # NOVO: caddy + dist/ + Caddyfile
├── Dockerfile.api          # NOVO: node + server.mjs + node_modules + litestream + sqlite3
├── docker-compose.yml      # NOVO: dois serviços, volume, limites, sem `networks:`
├── litestream.yml          # ALTERADO: caminho do banco dentro do contêiner
├── turnserver.conf         # ALTERADO: min-port/max-port, total-quota casada
├── coturn-dropin.conf      # INTOCADO
└── README.md               # REESCRITO
tools/ops/
└── restore-verify.mjs      # INTOCADO
```

### Padrão 1: a imagem carrega o artefato que passou no portão, nunca reconstrói

O `ci.yml` já sobe `dist/` e `dist-server/` como artefatos no job `test` e o job de publicação
os **baixa**. Esse é o coração de D2-05, preservado literalmente por D2-23: o `docker build`
copia bytes baixados, não roda `npm run build`.

```dockerfile
# ops/Dockerfile.web — nada aqui constrói nada.
FROM caddy:2.11.4-alpine
COPY ops/Caddyfile /etc/caddy/Caddyfile
COPY dist/ /srv/www/
```

A alternativa — um `Dockerfile` multi-stage que roda `npm ci && npm run build` — seria mais
curta de escrever e **anularia a fase 1 inteira**: o que fosse publicado passaria a ser um
segundo build que por acaso deu no mesmo, e no dia em que não desse, ninguém saberia. O
comentário que já está no `ci.yml` diz isso com outras palavras; ele continua valendo.

### Padrão 2: `pull_policy: missing` é o que faz a reversão não usar rede

```yaml
services:
  api:
    image: ghcr.io/gustavoktausend/dg2-api:${DG2_IMAGE_TAG}
    pull_policy: missing
```

Semântica do Compose: busca no registro **só** se a tag não estiver em disco. Uma tag nova
sempre está ausente → é puxada. Uma tag de release anterior está presente → **nada de rede**.
É a tradução exata do requisito que D2-06 justificava e D2-24 preservou: *a reversão não pode
depender da infraestrutura que acabou de falhar*.

### Padrão 3: o domínio nunca entra no repositório, mas a configuração continua em diff

O Coolify expõe como variável editável no painel toda referência `${VAR}` encontrada no
compose. Isso resolve D2-29 sem quebrar D2-15:

```yaml
environment:
  - DG2_ORIGIN=${DG2_ORIGIN}          # valor mora no painel do Coolify
  - DG2_TURN_SECRET=${DG2_TURN_SECRET}
  - LITESTREAM_BUCKET=${LITESTREAM_BUCKET}
```

O arquivo em git diz **quais** chaves existem; o painel diz **o que** elas valem. É a mesma
disciplina de `/etc/dg2/env`, com outro guardião. O `tests/ops-config.test.ts` já tem o
mecanismo para asserir isso ("toda linha que nomeia uma credencial traz o `${...}` junto") e
ele passa a cobrir o compose de graça, porque o glob é `../ops/*`.

### Padrão 4: o roteador é do Coolify, os cabeçalhos são do Caddy

Não escreva labels do Traefik à mão no compose. Medido no vizinho: o Coolify gera os oito
labels do par de roteadores a partir do FQDN atribuído ao serviço na interface. Escrever
labels próprios brigaria com o gerador na primeira mudança de domínio. O que o compose
declara é apenas `expose: ["8080"]` no serviço `web`, para o Coolify saber a porta.

### Anti-padrões a evitar

- **Declarar `networks:` no compose.** A documentação do Coolify é explícita: ele cria uma
  rede bridge isolada e uma rede própria declarada *"causa queda intermitente por problema de
  rota no Traefik"*. `[CITED: coolify.io/docs/applications/build-packs/docker-compose]`
- **Publicar porta no host (`ports:`).** Além de anular o ganho de D2-22 (a colisão com a 8080
  do Traefik desaparece "por construção"), a doc do Coolify avisa que mapear porta no host faz
  perder funcionalidade de atualização em rolagem. E o UFW não protegeria (DM-15).
- **Deixar o Coolify construir a partir do git.** É o que D2-23 recusa, e o motivo é o portão
  cross-engine.
- **`image: …:latest` ou `:main`.** Uma tag móvel destrói a reversão de D2-24: não há "imagem
  anterior" quando o nome anterior aponta para o novo conteúdo.
- **`auto_https` ligado no Caddy do contêiner.** Ele tentaria ACME num domínio que não
  controla e tomaria a 80/443 do próprio namespace; o resultado seria um redirect em laço.

---

## Don't Hand-Roll

| Problema | Não construa | Use | Por quê |
|---|---|---|---|
| Repassar SIGTERM ao processo filho no contêiner | entrypoint em shell com `trap` + `wait` | `litestream replicate -exec` | Medido no código-fonte: ele já encaminha o sinal exato e espera o filho (DM-13). Um `trap` de shell é a armadilha clássica de PID 1 |
| Emitir e renovar certificado | qualquer coisa com ACME | Traefik do Coolify | Já roda para o vizinho, já tem `acme.json`, já resolve o desafio HTTP-01 na 80 |
| Reverter para a versão anterior | script que guarda tarball, symlink, ou `docker save` | Reversão do Coolify + `pull_policy: missing` | A capacidade existe e é documentada; o que falta é **fixar o número de retenção** (DM-16) |
| Descobrir o IP real do cliente atrás de dois proxies | parser próprio de `X-Forwarded-For` | `trusted_proxies static private_ranges` no Caddy + o `clientIp()` que já existe | O parser já existe e está testado; o que falta é o Caddy parar de descartar o cabeçalho (DM-10) |
| Compilar o `better-sqlite3` na imagem | `apt-get install python3 make g++` + `node-gyp` | `npm ci --omit=dev` e pronto | Os prebuilds vêm no tarball do npm (DM-12) |
| Restaurar o banco para conferir | `cp` do `.db` e comparação binária | `litestream restore` + as duas consultas de `restore-verify.mjs` | O script já existe, já abre em `-readonly`, já compara uma janela fixa em vez do total de um banco que se mexe |
| Limitar memória do processo Node | só `mem_limit` | `mem_limit` **e** `NODE_OPTIONS=--max-old-space-size` | P-10 vale igual no cgroup do contêiner: o V8 dimensiona o old space pela memória da **máquina**, não pelo limite |

**Key insight:** quase tudo o que a arquitetura nova precisa já existe pronto — no Coolify, no
Traefik, no Litestream ou no próprio repositório. O trabalho desta fase é **remover** o que
foi construído para uma caixa vazia, não construir o equivalente containerizado.

---

## Runtime State Inventory

Esta fase é, em boa parte, uma **migração de arquitetura sobre trabalho já executado**. O
inventário abaixo é obrigatório e cada categoria foi respondida.

| Categoria | O que foi encontrado | Ação |
|---|---|---|
| **Dados armazenados** | **Nenhum.** Não existe banco em produção: `apps/server` nunca rodou na caixa, o volume não existe, a tabela `gold_entry` só existe em `:memory:` nos testes. O ledger do jogador vive em `localStorage` (`dungeonguys2_ledger_v1`), no navegador, e nada nesta fase o toca | **Nenhuma migração de dados.** O primeiro `up -d` cria o banco vazio pela migração |
| **Config de serviço vivo** | **Nenhuma do jogo.** Não há recurso do jogo no Coolify, nem roteador no Traefik para `dg2.kring.tech` (medido: só o `catchall`). **Há config viva do vizinho** — dois contêineres, um roteador, um volume — que não se toca | **Criar** o recurso do Coolify (é trabalho novo, não migração). **Registrar** que a configuração do app passa a viver no banco do Coolify, fora do git (D2-29) |
| **Estado registrado no SO** | **Nenhum do jogo.** Não há `dg2.service`, `litestream.service`, `cert-check.timer` nem `coturn.service` instalados: `node`, `rsync`, `litestream` e `turnserver` estão todos ausentes (DM-19). As units de `ops/` nunca foram instaladas em lugar nenhum | **Nenhuma desinstalação.** Os arquivos morrem no git sem deixar resíduo na caixa — que é a única razão pela qual D2-30 é barata |
| **Segredos e variáveis de ambiente** | **Nenhum do jogo existe na caixa.** Não há `/etc/dg2/env`. Os quatro secrets de SSH (`DEPLOY_SSH_KEY`, `DEPLOY_HOST`, `DEPLOY_USER`, `DEPLOY_KNOWN_HOSTS`) e a variável `DEPLOY_ENABLED` **nunca foram criados** no GitHub — o 02-04 está adiado, e o job `deploy` é pulado por isso. **`.vps.local` e `.vps-inventario.local` existem fora do git** e carregam endereço, usuário e credenciais do bucket | **Nada a revogar.** Criar, no lugar: **um** segredo de deploy (DM-7 decide a forma) e as variáveis do app no painel do Coolify. **Escrever no runbook, em voz alta**, que o `static-auth-secret` passa a existir em dois lugares de naturezas diferentes (D2-29) |
| **Artefatos de build e pacotes instalados** | **Nenhum na caixa.** Não há `/srv/dg2/`, não há `node_modules` de produção, não há release. Localmente há `dist/` e `dist-server/` ignorados pelo git, e `node_modules/better-sqlite3` com os oito prebuilds | **Nenhuma reinstalação.** DM-12 elimina o passo manual de `/srv/dg2/node_modules` que o `ops/README.md` §3 documenta — esse parágrafo inteiro sai do runbook |

**A resposta canônica:** depois de todo arquivo do repositório ser atualizado, **nenhum
sistema em execução guarda a string antiga**, porque nenhum sistema do jogo está em execução.
Esta migração acontece no papel antes de acontecer na caixa, e essa é exatamente a folga que
torna o replanejamento barato. O que existe vivo na caixa é do vizinho, e D-VPS-02 o protege.

---

## Common Pitfalls

Os que sobreviveram da pesquisa anterior estão listados no mapa do topo. Os novos:

### C-1: O bind em loopback torna a API inalcançável entre contêineres
**O que dá errado:** `/api/health` responde 503 desde o primeiro deploy; o jogo estático abre
normalmente, o que faz parecer problema de Node e não de rede.
**Por que acontece:** `127.0.0.1` dentro de um contêiner é o loopback daquele contêiner.
**Como evitar:** `DG2_BIND` com padrão `127.0.0.1`, valor `0.0.0.0` no compose (DM-9).
**Sinal precoce:** `docker compose exec web wget -qO- http://api:8080/api/health` falha
enquanto `docker compose exec api wget -qO- http://127.0.0.1:8080/api/health` funciona.

### C-2: `X-Forwarded-For` descartado colapsa o limitador
**O que dá errado:** na fase 3, ou ninguém é limitado ou todo mundo é — e o segundo caso é
indistinguível, de fora, de o servidor estar fora do ar.
**Por que acontece:** o Caddy ignora valores de entrada por padrão, para prevenir spoofing.
**Como evitar:** `trusted_proxies static private_ranges` no bloco global (DM-10).
**Sinal precoce:** logar `clientIp()` uma vez por upgrade e ver o mesmo `172.x.x.x` sempre.

### C-3: A imagem de reversão é apagada pela limpeza automática do servidor
**O que dá errado:** o dia em que a reversão é necessária é o dia em que ela não está lá.
**Por que acontece:** uma imagem sem contêiner é "unused"; a limpeza do Coolify remove
"unused images" por gatilho de percentual de disco ou por cron.
**Como evitar:** ler e registrar a configuração do servidor; fixar retenção de 5; provar a
reversão sem rede no 02-12 (DM-16).
**Sinal precoce:** `sudo docker images | grep dg2` mostrando menos tags do que a retenção.

### C-4: `stop_grace_period` padrão de 10 s corta a sincronização final do Litestream
**O que dá errado:** as últimas escritas antes de um deploy não chegam ao bucket. Para um
ledger de moeda, é soul gold que sumiu — exatamente o que D2-17 existe para impedir.
**Por que acontece:** o Docker manda SIGKILL após o prazo; o litestream ainda precisa de tempo
**depois** de o Node sair.
**Como evitar:** `stop_grace_period: 30s`, e a asserção de ordenação contra
`SHUTDOWN_GRACE_MS` que o teste já sabe fazer (DM-13).
**Sinal precoce:** `docker logs` mostrando o SIGKILL antes da linha de sincronização final.

### C-5: `min-port`/`max-port` ausente + UFW = "um amigo específico nunca entra"
**O que dá errado:** o relay autentica, entrega um endereço ao navegador, e o tráfego nunca
chega. Indistinguível de NAT ruim.
**Por que acontece:** sem a faixa declarada, o coturn aloca em 49152–65535/udp, e o UFW
`deny incoming` bloqueia; e o runbook manda abrir só 3478 e 5349 (DM-15).
**Como evitar:** declarar a faixa **e** abri-la, no mesmo commit e no mesmo parágrafo do
runbook. Baixar `total-quota` para casar.
**Sinal precoce:** `ss -ulnp | grep turnserver` mostrando portas fora da faixa aberta.

### C-6: Uma tag móvel destrói a reversão
**O que dá errado:** "voltar para a imagem anterior" não existe, porque o nome anterior aponta
para o conteúdo novo.
**Como evitar:** tag por sha de commit, sempre; `:latest` nunca. É a mesma disciplina que o
`deploy.sh` tinha com `$GITHUB_SHA` de 40 hexadecimais.

### C-7: `docker compose build` implícito sobre um compose sem `build:`
**O que dá errado:** nada, provavelmente — mas se o Coolify injetar um passo de build, um
serviço sem `build:` é no-op e um com `build:` viraria construção na caixa, que D2-23 recusa.
**Como evitar:** nenhum serviço declara `build:`. Confirmar no primeiro deploy real que os
logs mostram `pull` e não `build`.

### C-8: Segurança "por acidente" nas portas 8000/8080
**O que dá errado:** o `coolify-lockdown.service` está `inactive (dead)`, então um reinício do
Docker sem reboot apagaria as regras de `DOCKER-USER`. Se o deploy passar a depender da API do
Coolify (DM-7, saídas C ou D), essa fragilidade vira dependência do jogo.
**Como evitar:** **não corrigir** — é do vizinho (D-VPS-02) — mas **registrar** no
`docs/OPERACAO.md` que a alcançabilidade do caminho de deploy depende de configuração de outro
projeto, e que uma queda dele é uma causa possível de "o deploy parou de funcionar".

---

## Code Examples

### `ops/Caddyfile` — o delta contra o arquivo atual

O bloco `header` inteiro, os três matchers de cache, a ausência deliberada de `try_files` e o
`handle_errors` **não mudam uma linha**. O que muda:

```caddyfile
# ------------------------- BLOCO GLOBAL, NOVO -------------------------
{
    # O certificado é do Traefik (D2-25). Sem isto o Caddy tentaria ACME
    # para um nome que não controla, e tomaria 80/443 do próprio namespace.
    auto_https off

    # A API de admin do Caddy escuta em localhost:2019 por padrão. Nada aqui
    # a usa; desligá-la é uma superfície a menos dentro do contêiner.
    admin off

    # DM-10 — SEM ISTO O LIMITADOR DA FASE 3 VIRA UM BALDE SÓ. O Caddy ignora
    # X-Forwarded-For de origem não confiável, por padrão e de propósito. A
    # cadeia real é cliente → Traefik → Caddy → Node: o Traefik já põe o
    # endereço verdadeiro (ele também não confia em quem não está em
    # trustedIPs), e sem a linha abaixo o Caddy o substitui pelo IP do
    # contêiner do Traefik. `private_ranges` é seguro aqui porque NADA é
    # publicado no host: a única origem capaz de falar com esta porta é a
    # rede bridge que o Coolify criou.
    servers {
        trusted_proxies static private_ranges
    }
}

# --------------------- ENDEREÇO DO SITE, MUDOU ------------------------
# Era {$DG2_DOMAIN}. O esquema `http://` explícito é o que garante HTTP puro:
# um endereço só-porta ainda deixaria o Caddy escolher HTTPS por padrão.
# O nome do domínio deixa de aparecer aqui, o que reforça D2-15 em vez de
# afrouxá-la — e P-6 (o {env.VAR} que resolve tarde) deixa de ter alvo.
http://:8080 {
    encode zstd gzip

    header {
        # INALTERADO, E AGORA MAIS IMPORTANTE: medido em 2026-09-09, o Traefik
        # do Coolify não manda NENHUM destes (DM-11). Se este bloco sair,
        # ninguém os manda. O HSTS funciona atrás do proxy porque o navegador
        # o honra pela conexão dele, que é HTTPS com o Traefik.
        X-Content-Type-Options nosniff
        Referrer-Policy strict-origin-when-cross-origin
        Strict-Transport-Security "max-age=31536000; includeSubDomains"
        Content-Security-Policy "default-src 'self'; img-src 'self'; font-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'"
    }

    # INALTERADO na forma; muda só o destino: o serviço do compose.
    handle /api/* { reverse_proxy {$DG2_UPSTREAM} }
    handle /ws    { reverse_proxy {$DG2_UPSTREAM} }

    handle {
        # Era /srv/dg2/current, o symlink que deploy.sh trocava (D2-06,
        # revogada). Agora os bytes estão DENTRO da imagem: trocar de versão
        # é trocar de contêiner, e a atomicidade que o rename(2) comprava
        # passa a ser a do `docker compose up -d`.
        root * /srv/www

        # As três classes de cache, INALTERADAS — inclusive o `not` que torna
        # @stable e @assets mutuamente exclusivos por construção.
        @assets path /assets/index-*.js /assets/index-*.css
        header @assets Cache-Control "public, max-age=31536000, immutable"
        @stable {
            path /assets/* /fonts/* /icons/*
            not path /assets/index-*.js /assets/index-*.css
        }
        header @stable Cache-Control "public, max-age=0, must-revalidate"
        @shell path / /index.html /sw.js /manifest.json
        header @shell Cache-Control "no-cache"

        # DM-5 continua: nada de try_files. Um 404 é a resposta honesta.
        file_server
    }

    handle_errors { … INALTERADO … }
}
```

O cabeçalho em prosa do arquivo precisa de reescrita de fundo: os parágrafos sobre
`{$DG2_DOMAIN}`, sobre `systemctl reload caddy` não reler o `EnvironmentFile`, sobre a 443
ser do Caddy e sobre o symlink de release **descrevem uma máquina que não existe mais**. O
parágrafo sobre "reload fecha WebSockets ativos" continua verdadeiro em espírito — só que
agora quem derruba as conexões é a recriação do contêiner, e a mitigação (os 60 s de carência
na deleção de sala, do plano 03-04) continua sendo a metade que paga por ela.

### `ops/docker-compose.yml` — novo

```yaml
# ops/docker-compose.yml — a composição que o Coolify lê do repositório.
#
# SEM `networks:`, DE PROPÓSITO. O Coolify cria uma bridge isolada e a
# documentação dele avisa que declarar uma própria causa queda intermitente
# de rota no Traefik.
#
# SEM `ports:`, DE PROPÓSITO. Nada é publicado no host: é o que faz a colisão
# com a 8080 do Traefik desaparecer por construção (D2-22), e o que faz o
# `0.0.0.0` do serviço `api` continuar sendo controle de acesso e não um
# buraco — porta de contêiner sem publicação não atravessa o UFW nem o NAT.
#
# TODA REFERÊNCIA ${VAR} VIRA CAMPO EDITÁVEL NO PAINEL DO COOLIFY (D2-29).
# Este arquivo diz QUAIS chaves existem; o painel diz o que elas valem. O
# domínio e os segredos continuam fora do repositório (D2-15).
services:
  web:
    image: ghcr.io/gustavoktausend/dg2-web:${DG2_IMAGE_TAG}
    # A linha que faz a reversão de D2-24 não usar rede: o Docker só busca no
    # registro o que não estiver em disco. Tag nova → puxa. Tag anterior →
    # nada de rede, que é o cenário em que se precisa dela.
    pull_policy: missing
    restart: unless-stopped
    depends_on: [api]
    # É daqui que o Coolify tira a porta para o label do Traefik.
    expose: ["8080"]
    environment:
      # Nome de serviço do compose, resolvido pelo DNS interno do Docker.
      - DG2_UPSTREAM=api:8080
    # O Caddy serve arquivo estático e repassa; 96 MiB é folga larga.
    mem_limit: 96m
    cpus: 0.5

  api:
    image: ghcr.io/gustavoktausend/dg2-api:${DG2_IMAGE_TAG}
    pull_policy: missing
    restart: unless-stopped
    # DM-13/C-4: o Node drena em até 5s (SHUTDOWN_GRACE_MS) e SÓ DEPOIS o
    # litestream faz a sincronização final para o bucket. O padrão de 10s do
    # Docker corta a segunda etapa, e o que se perde são as últimas escritas
    # de um ledger de moeda. 30s é folga para as duas.
    stop_grace_period: 30s
    volumes:
      - dg2-data:/var/lib/dg2
    environment:
      - DG2_DB=/var/lib/dg2/dg2.db
      - DG2_PORT=8080
      # DM-9: `127.0.0.1` seria o loopback DESTE contêiner, e o Caddy vive em
      # outro. O padrão do código continua sendo o loopback; esta linha é a
      # exceção declarada em diff, exatamente onde ela é revisável.
      - DG2_BIND=0.0.0.0
      - DG2_RELEASE=${DG2_IMAGE_TAG}
      - DG2_ORIGIN=${DG2_ORIGIN}
      - DG2_TURN_SECRET=${DG2_TURN_SECRET}
      - DG2_TURN_REALM=${DG2_TURN_REALM}
      - LITESTREAM_BUCKET=${LITESTREAM_BUCKET}
      - LITESTREAM_ENDPOINT=${LITESTREAM_ENDPOINT}
      - AWS_ACCESS_KEY_ID=${AWS_ACCESS_KEY_ID}
      - AWS_SECRET_ACCESS_KEY=${AWS_SECRET_ACCESS_KEY}
      # P-10 VALE IGUAL NO CGROUP DO CONTÊINER: o V8 dimensiona o old space
      # pela memória da MÁQUINA (7,8 GiB aqui), não pelo mem_limit, e cresce
      # direto para o OOM-kill. Os dois números andam juntos, sempre.
      - NODE_OPTIONS=--max-old-space-size=192
    # 256M para o Node (o teto de dg2.service) + folga para o litestream, que
    # deixou de ter unit própria e passou a morar neste cgroup (D2-28).
    mem_limit: 320m
    cpus: 1.0
    healthcheck:
      test: ["CMD", "wget", "-qO-", "http://127.0.0.1:8080/api/health"]
      interval: 30s
      timeout: 5s
      retries: 3
      start_period: 20s

volumes:
  dg2-data:
```

### `ops/Dockerfile.api` — novo

```dockerfile
# ops/Dockerfile.api — o servidor, o Litestream que o envolve, e nada mais.
#
# NÃO CONSTRÓI O SERVIDOR. `dist-server/server.mjs` é baixado do artefato que
# o job `test` do CI subiu, então o que entra na imagem é byte a byte o que
# passou pelo portão cross-engine (D2-05, preservada por D2-23).
FROM node:24.20.0-trixie-slim

# sqlite3: tools/ops/restore-verify.mjs o invoca em -readonly. ca-certificates:
# o litestream fala HTTPS com o bucket. wget já vem no base, e é o healthcheck.
RUN apt-get update \
 && apt-get install -y --no-install-recommends sqlite3 ca-certificates \
 && rm -rf /var/lib/apt/lists/*

# Litestream do release oficial, com sha256 fixado — mesma doutrina que
# ops/litestream.service já escrevia: binário fora do grafo npm (T-2-SC).
ARG LITESTREAM_VERSION=0.5.17
ARG LITESTREAM_SHA256=<preencher-no-plano>
ADD https://github.com/benbjohnson/litestream/releases/download/v${LITESTREAM_VERSION}/litestream-v${LITESTREAM_VERSION}-linux-amd64.tar.gz /tmp/ls.tgz
RUN echo "${LITESTREAM_SHA256}  /tmp/ls.tgz" | sha256sum -c - \
 && tar -C /usr/local/bin -xzf /tmp/ls.tgz litestream \
 && rm /tmp/ls.tgz

WORKDIR /srv

# CAMADA PRÓPRIA, E A ORDEM É O PONTO: com os manifestos copiados antes do
# bundle, o `npm ci` só reexecuta quando o lock muda, e cada deploy custa
# alguns MB de camada nova em vez de 30 (DM-16, retenção de 5 imagens).
#
# Sem compilador: better-sqlite3 13.0.3 traz os prebuilds dentro do tarball
# do npm, inclusive linux-x64 (DM-12). O passo manual de /srv/dg2/node_modules
# que ops/README.md §3 documentava deixa de existir.
COPY package.json package-lock.json ./
COPY apps/server/package.json apps/server/
RUN npm ci --omit=dev --workspace @dg2/server

COPY dist-server/server.mjs /srv/server.mjs
COPY ops/litestream.yml /etc/litestream.yml
COPY tools/ops/restore-verify.mjs /srv/tools/ops/restore-verify.mjs

# Nunca root: o base já traz o usuário `node`, uid 1000.
USER node

# DM-13: o litestream é PID 1, repassa o SIGTERM exato ao Node e ESPERA ele
# sair antes da sincronização final. Nenhum tini, nenhum trap de shell.
ENTRYPOINT ["litestream", "replicate", "-config", "/etc/litestream.yml", \
            "-exec", "node /srv/server.mjs"]
```

### O job de publicação do `ci.yml` — a forma recomendada

```yaml
  # Substitui o job `deploy` de rsync. NENHUMA AÇÃO DE TERCEIRO: o runner já
  # traz docker e buildx, e usar `run:` mantém o portão T-2-SC de
  # tests/workflows.test.ts intacto em vez de precisar afrouxá-lo (DM-8).
  image:
    needs: [test, pwa]
    if: github.ref == 'refs/heads/main' && github.event_name == 'push'
    runs-on: ubuntu-latest
    timeout-minutes: 15
    concurrency:
      group: deploy-vps
      cancel-in-progress: false
    permissions:
      contents: read
      # A ÚNICA escrita do workflow, e o único `: write` que a asserção de
      # tests/workflows.test.ts passa a admitir — nomeadamente, e só aqui.
      packages: write
    steps:
      - uses: actions/checkout@v7          # precisa dos Dockerfiles e do Caddyfile
      - uses: actions/download-artifact@v8
        with: { name: dist, path: dist }
      - uses: actions/download-artifact@v8
        with: { name: server, path: dist-server }

      - name: Login no GHCR
        run: echo "${{ secrets.GITHUB_TOKEN }}" | docker login ghcr.io -u "${{ github.actor }}" --password-stdin

      - name: Construir e empurrar as duas imagens
        run: |
          set -eu
          REPO=ghcr.io/${{ github.repository_owner }}
          docker build -f ops/Dockerfile.web -t "$REPO/dg2-web:$GITHUB_SHA" .
          docker build -f ops/Dockerfile.api -t "$REPO/dg2-api:$GITHUB_SHA" .
          docker push "$REPO/dg2-web:$GITHUB_SHA"
          docker push "$REPO/dg2-api:$GITHUB_SHA"

      # A FORMA DESTE PASSO DEPENDE DE DM-7 E NÃO PODE SER ESCRITA ANTES DELE.
      # Se o painel ganhar FQDN (saída A):
      #   curl -fsS -X GET "$COOLIFY_DEPLOY_URL" -H "Authorization: Bearer $TOKEN"
      # Se for chave SSH com command= fixo (saída D):
      #   ssh -o IdentitiesOnly=yes -i "$KEY" "$USER@$HOST" (o command= é literal)
      # Em ambos, o passo seguinte confere que o deploy PEGOU, e não só que a
      # chamada retornou 200: `curl https://dg2.kring.tech/api/health` até o
      # campo de release bater com $GITHUB_SHA, com prazo.
```

O último parágrafo é a diferença entre "chamei o gancho" e "publiquei". O
`/api/health` já devolve `release` (o `DG2_RELEASE` do 02-08), e sob esta arquitetura
`DG2_RELEASE=${DG2_IMAGE_TAG}` é o sha — então **a verificação de que o deploy pegou é uma
comparação de string, sem infraestrutura nova**. Vale escrevê-la.

---

## O delta exato em `ops/`

| Arquivo | Destino | O que muda |
|---|---|---|
| `Caddyfile` | **ALTERADO** | Bloco global novo (`auto_https off`, `admin off`, `trusted_proxies`); endereço vira `http://:8080`; `root` vira `/srv/www`; cabeçalho em prosa reescrito (sai o domínio, sai o reload/EnvironmentFile, sai a 443, sai o symlink). Os `header`, os três matchers de cache, a ausência de `try_files` e o `handle_errors` ficam intocados |
| `README.md` | **REESCRITO** | §2 (layout de disco), §3 (`/srv/dg2/node_modules` — some por DM-12), §4 (usuários e chave de deploy), §5 (`/etc/dg2/env`), §6 (drop-in do Caddy), §7 (publicar e reverter), §9 (a 443), §10 (units) e §11 (backup) descrevem uma máquina que não existe. §12 (coturn) fica, com a faixa de relay e o UFW corrigidos. Nasce: o recurso do Coolify, as variáveis do painel, o gancho de deploy, a reversão por imagem, a retenção, `sudo docker` em todo lugar (DM-17) |
| `turnserver.conf` | **ALTERADO** | Acrescenta `min-port`/`max-port`; baixa `total-quota` para casar com a faixa; reescreve o parágrafo "por que 443 não está aqui" (a 443 é do Traefik, não do Caddy) |
| `coturn-dropin.conf` | **INTOCADO** | Salvo o parágrafo do orçamento, que cita "a KVM 2 de 2 GB de D2-19" e agora fala de uma caixa de 8 GB partilhada |
| `litestream.yml` | **ALTERADO** | Só o caminho do banco, se mudar; o `replica:` singular e as referências `${...}` continuam certas. O comentário sobre `/etc/dg2/env` passa a falar do painel do Coolify |
| `deploy.sh` | **MORRE** | D2-30 |
| `rollback.sh` | **MORRE** | D2-30 |
| `deploy-forced.sh` | **MORRE** | D2-30 / D2-31 |
| `prune-releases.sh` | **MORRE** | D2-30 |
| `dg2.service` | **MORRE** | D2-30; capacidades migram para o compose |
| `cert-check.sh` / `.service` / `.timer` | **MORREM** | D2-30; **a capacidade precisa de substituto** (ver § Vigilância) |
| `litestream.service` | **MORRE** | **Não está na lista literal de D2-30, mas D2-28 a mata:** o litestream deixa de ser unit e vira PID 1 do contêiner. O planejador deve registrar essa extensão explicitamente, para que não pareça um arquivo esquecido |
| `Dockerfile.web` | **NASCE** | |
| `Dockerfile.api` | **NASCE** | |
| `docker-compose.yml` | **NASCE** | |

Saldo: 14 arquivos → **5 sobreviventes + 3 novos = 8**.

## O delta exato em `tests/ops-config.test.ts`

Contagem medida em § DM-20. Trabalho concreto:

**Removidos (34 testes):** os 18 de `scripts de ops/`, os 7 de `ops/dg2.service`, os 3 de
`ops/litestream.service`, os 6 de `cert-check`.

**Renascem em forma nova (sobre `ops/docker-compose.yml`):**

| Propriedade que morreu com o `dg2.service` | Asserção nova |
|---|---|
| "limita a memória do cgroup **E** o heap do V8, nunca só um" (P-10) | o serviço `api` tem `mem_limit` **e** `NODE_OPTIONS=--max-old-space-size`, e o segundo é menor que o primeiro |
| "roda como `dg2` num sandbox, nunca como root" | o `Dockerfile.api` declara `USER` e não é `root` |
| "não publica a API fora do loopback" | **nenhum serviço declara `ports:`** (DM-9) |
| "dá ao desligamento gracioso mais tempo que o watchdog (WR-07)" | `stop_grace_period` do serviço `api` > `SHUTDOWN_GRACE_MS` importado de `apps/server/src/shutdown.ts` — **a forma de importar em vez de copiar continua sendo a certa** |
| "arranca pelo symlink que o rollback move" | a imagem é referenciada por `${DG2_IMAGE_TAG}`, nunca `:latest` nem `:main` (C-6) |
| (do `litestream.service`) "é irmã e não filha" | o `ENTRYPOINT` é `litestream replicate -exec`, e o Node não é PID 1 |
| (novo, D2-24) | todo serviço declara `pull_policy: missing` |
| (novo, Coolify) | o compose **não** declara `networks:` |

**Alterados:** os 3 do `Caddyfile` que falam de `{$DG2_DOMAIN}`, do symlink de release e da
443; os 9 do `README.md`; 1 do `litestream.yml`; o piso `>= 13` do bloco D2-15.

**Nascem no `Caddyfile`:** `auto_https off` presente; `trusted_proxies` presente (o teste que
impede DM-10 de voltar).

**Nascem no `turnserver.conf`:** `min-port`/`max-port` declarados; `total-quota` ≤ tamanho da
faixa (a asserção que impede C-5 de voltar por metade).

**Cuidado com a vacuidade:** o `read()` exige `> 200` bytes e o `code()` exige `> 50` depois de
tirar comentários. Um `docker-compose.yml` enxuto pode ficar perto do primeiro piso; o
`Dockerfile.web` de 3 linhas **fica abaixo dele**. O planejador precisa decidir: ou o
`Dockerfile.web` ganha o cabeçalho em prosa que todo arquivo de `ops/` tem (coerente com o
projeto, e resolve), ou os pisos ganham exceção por arquivo — e a segunda opção é pior,
porque foi exatamente por essa porta que WR-14 entrou.

## O delta exato em `.github/workflows/ci.yml` e `tests/workflows.test.ts`

**Sai do `ci.yml`:** o job `deploy` inteiro — o `env:` com `DEPLOY_USER`/`DEPLOY_HOST`, o passo
de chave e `known_hosts`, os dois `rsync --link-dest`, o `ssh … deploy.sh $GITHUB_SHA`, o
`rm -f` da chave, e o `if:` com `vars.DEPLOY_ENABLED`.

**Deixam de existir:** os quatro secrets `DEPLOY_SSH_KEY`, `DEPLOY_HOST`, `DEPLOY_USER`,
`DEPLOY_KNOWN_HOSTS` **e** a variável de repositório `DEPLOY_ENABLED` — nenhum deles foi criado
ainda (o 02-04 está adiado), então isto é remoção de texto, não revogação de credencial.

**Entra:** o job `image` da § Code Examples, com `packages: write` e o passo de gancho cuja
forma DM-7 decide.

**Delta em `tests/workflows.test.ts`:**

| Asserção | Destino |
|---|---|
| `encontrou exatamente um workflow, e é o ci.yml` | intocada |
| `nenhum workflow publica no GitHub Pages` | intocada — **é ela que prova INFRA-01** |
| `o CI emite os dois artefatos publicáveis` | intocada — os artefatos continuam sendo a fronteira |
| `todo uses: é uma ação da própria GitHub` | **intocada, e essa é a recomendação**: não acrescente ação de terceiro (DM-8) |
| `o teto do GITHUB_TOKEN é do WORKFLOW` | intocada |
| `nenhum escopo de permissão é concedido para escrita` | **ALTERADA**: passa a admitir exatamente um `packages: write`, e só no job que empurra a imagem — mesma forma da fatia `deployJob()` que já existe |
| `nenhuma ação roda no runtime depreciado (Node 20)` | intocada; se ações de Docker entrarem um dia, as quatro medidas já são `node24` |
| Os 6 do bloco "o caminho que carrega a chave de deploy" | **5 MORREM** (chave de host fixada, permissão da chave privada, apagar a chave, `--link-dest` absoluto, os quatro segredos vazios). **1 SOBREVIVE alterado**: "dois deploys nunca correm ao mesmo tempo" (`concurrency`), agora sobre o `up -d` em vez do symlink. **1 SOBREVIVE alterado**: "o deploy só sai depois dos dois portões e só de push na main" (D2-08) |
| `o deploy é pulado enquanto o alvo não existir` | **decisão a tomar**: com um segredo só, `vars.DEPLOY_ENABLED` pode sair — mas o raciocínio do comentário (um job vermelho por semanas ensina a não ler CI vermelho) continua válido enquanto o Coolify não existir. Recomendação: manter a variável até o 02-12, e o plano decide se ela morre depois |

Nascem: o job `image` tem prazo próprio; a imagem é tagueada por sha e nunca por tag móvel; o
passo de verificação pós-gancho compara `/api/health` com `$GITHUB_SHA`.

---

## As seis perguntas abertas de `STATE.md`, respondidas

### 1. Dentro do contêiner, quem serve os estáticos: Caddy ou Node?

**Caddy, e D2-25 é implementável no Coolify como uma composição de dois serviços vinda do
próprio repositório.**

Como, concretamente: recurso do tipo **Application**, source **Public Repository** (o repo é
público, medido — nenhuma chave de deploy necessária), Build Pack **Docker Compose**, com
"Docker Compose Location" apontando para `ops/docker-compose.yml`. O Coolify clona o repo, lê
o compose, descobre os serviços `web` e `api`, e a interface permite **atribuir o domínio ao
serviço `web`** (`docker_compose_domains` na API). Ele então gera os labels do Traefik — os
mesmos oito medidos no vizinho — apontando para a porta em `expose:`.

**Atritos honestos, todos verificáveis no 02-12:**

- A doc do Coolify diz que o compose é *"the single source of truth"* e que a rede é criada
  por ele; **não declare `networks:`**, sob pena de queda intermitente de rota.
- Não está documentado se o Coolify roda `docker compose build` antes do `up`. Com nenhum
  serviço declarando `build:`, seria no-op — mas confirme nos logs do primeiro deploy que
  aparece `pull`, não `build` (C-7).
- Alternativa se a composição do repositório atritar: **"Docker Compose Empty"** (colar o YAML
  no painel). Funciona, e custa D2-15 para aquele arquivo — o compose sairia do git.

**Por que não o Node servindo estático:** o `ops/Caddyfile` não é sobre TLS. Ele carrega o CSP
derivado arquivo a arquivo, as três classes de cache (incluindo o `not` que torna `@assets` e
`@stable` mutuamente exclusivos), a recusa deliberada de servir o índice em rota inexistente
(DM-5) e o 503 em JSON que o monitor de D2-21 consome. Portar isso para Hono seria o item mais
caro da migração, e reintroduziria em código bugs que hoje têm teste.

### 2. coturn nativo ou contêiner com rede do host?

**Nativo, e agora com medição por trás — mas com uma correção de firewall que o plano
anterior não previa.**

DM-15 mostra que `network_mode: host` cairia na mesma `INPUT` governada pelo UFW, então não
compraria nada; e publicar ~100 portas UDP por `-p` criaria uma centena de regras e de
processos `docker-proxy`. Nativo + drop-in do distribuidor (que já é o que
`ops/coturn-dropin.conf` faz) é a forma certa.

O que muda no plano: **três regras novas de UFW** (`3478/udp`, `3478/tcp`, `5349/tcp`) **mais
a faixa de relay** de D2-27. Nenhuma delas existe hoje. São as únicas alterações no host que
esta fase e a fase 3 exigem, e são aditivas — o único tipo que D-VPS-02 admite.

Dimensionamento recomendado: `min-port=49200`, `max-port=49299`, `total-quota` para **100**
(hoje 1200 — doze vezes o que a faixa entrega), `user-quota` de 12 para 6.

### 3. SQLite em volume do Coolify — e o Litestream, onde e com qual ciclo de vida?

**Volume nomeado do Compose (`dg2-data`), montado só no serviço `api`. O Litestream é o PID 1
desse contêiner e envolve o Node por `-exec`.**

O ciclo de vida está medido em DM-13 e é melhor do que o desenho de systemd que ele substitui:
o SIGTERM do Docker chega ao litestream, que **repassa o mesmo sinal** ao Node, que roda o
`shutdown.ts` do 02-08 inteiro (para de aceitar, drena, fecha o SQLite), e o litestream espera
o filho sair antes da sincronização final. `stop_grace_period: 30s` é o que dá espaço às duas
etapas (C-4).

**Restart do Coolify:** um `docker compose up -d` recria só os serviços cuja definição ou
imagem mudou. Um deploy que muda apenas o cliente troca o contêiner `web` e **não reinicia o
`api`** — o que responde, de graça, o item de discrição "se o servidor reinicia em todo
deploy". Confirme isso nos logs do 02-12; é a mesma economia que o `sha256sum` condicional do
`deploy.sh` comprava com mais trabalho.

**A restauração verificada de INFRA-04 (D2-03)** fica **melhor** do que era. O
`restore-verify.mjs` continua exatamente como está — mesma consulta, mesmo `-readonly`, mesma
janela fixa — e passa a rodar num contêiner descartável:

```bash
sudo docker run --rm \
  -v dg2-data:/var/lib/dg2:ro \
  -e LITESTREAM_BUCKET -e LITESTREAM_ENDPOINT \
  -e AWS_ACCESS_KEY_ID -e AWS_SECRET_ACCESS_KEY \
  ghcr.io/gustavoktausend/dg2-api:<sha> \
  node /srv/tools/ops/restore-verify.mjs
```

"Ambiente limpo", que é o texto literal do critério 4, deixa de ser um `mkdtemp` na mesma
máquina e passa a ser um contêiner novo — mais honesto, e sem trabalho extra. O script precisa
de `litestream`, `sqlite3` e `node`, e os três estão na imagem `api` por construção. O
`ENTRYPOINT` é sobrescrito pelo `node …` na linha de comando.

### 4. Deploy pelo GitHub App do Coolify ou webhook a partir do CI?

**Webhook a partir do CI — é o que D2-23/D2-31 decidem, e o GitHub App levaria o Coolify a
construir a partir do git, que é justamente o que D2-23 recusa.** O mecanismo documentado:

```
GET (ou POST) https://<coolify>/api/v1/deploy?uuid=<resource-uuid>
Authorization: Bearer <token>
```

`[CITED: coolify.io — openapi.json, operationId deploy-by-tag-or-uuid]` O token é criado em
*Keys & Tokens* com permissão **`Deploy`** (a doc do próprio Coolify manda escolher essa, e não
`root`), suporta expiração e allowlist de IP, e é guardado como hash SHA-256 — não é
recuperável depois de criado.

Segredos no GitHub, sob esta forma: **um** (`COOLIFY_TOKEN`), mais a URL do gancho — que também
deve ser secret, porque carrega o domínio da instância e o UUID do recurso, e D2-15 mantém o
endereço fora do repositório.

**Como o CI espera e verifica:** a resposta do `/deploy` traz `deployment_uuid`, e há
`GET /api/v1/deployments/{uuid}` para acompanhar. Mas a verificação **que importa** é mais
simples e não depende do Coolify: comparar `release` de `https://dg2.kring.tech/api/health`
com `$GITHUB_SHA`, em laço com prazo. É a única checagem que prova que os bytes certos estão
servindo, e ela usa uma rota que já existe.

**Como a tag chega ao compose.** Duas formas, com preferências diferentes:

- **(preferida) `PATCH /api/v1/applications/{uuid}/envs` para setar `DG2_IMAGE_TAG=<sha>`,
  depois `GET /api/v1/deploy`.** Duas chamadas, ambas explícitas, ambas verificáveis, e a
  reversão vira "setar a variável para o sha anterior e redeployar" — exatamente D2-24, com o
  `pull_policy: missing` garantindo que não há rede no caminho.
- **(alternativa) `image: …:${SOURCE_COMMIT}`.** O Coolify injeta `SOURCE_COMMIT` como variável
  predefinida da aplicação. Se ela chegar à interpolação do compose, a tag se resolve sozinha.
  **Não está documentado que chegue** — é MEDIUM confidence e deve ser testado no 02-12 antes
  de ser adotado. E a reversão fica pior: dependeria do botão de rollback do Coolify, cujo
  suporte a recursos de compose **não está documentado**.

**E o bloqueador:** nada disso funciona enquanto DM-7 não for resolvido.

### 5. O build passa a rodar na caixa? Meça.

**Não, e não poderia: não há Node na caixa** (DM-19). Sob D2-23 o build inteiro —
`sim:build`, `sim:version`, `tsc --noEmit`, `vite build`, `sw:emit`, `server:build` — é do CI,
como já é hoje.

O que sobra de custo na caixa, por deploy:

| Etapa | Custo | Risco para o vizinho |
|---|---|---|
| `git clone` do repositório (público, raso) | segundos, alguns MB | desprezível |
| `docker pull` das camadas novas | com o `COPY package*.json` antes do bundle, poucos MB por deploy; num deploy só de cliente, ~1 MB | rede, não CPU |
| `docker compose up -d` | recria 1 ou 2 contêineres | segundos de CPU; o `mem_limit` impede que o novo processo dispute memória |
| **`npm ci`, `tsc`, `vite build`** | **zero** | — |

Os dois vCPU do vizinho **não** são disputados por compilação. É um dos ganhos que D2-23 cita
("o build não disputa os dois núcleos com a produção do outro projeto") e ele se confirma
medido.

### 6. Sem `deploy-forced.sh`, o modelo de acesso do Coolify substitui a defesa que aquele wrapper comprava?

**Substitui, e melhora — mas só na saída A ou B de DM-7. Nas saídas C e D a resposta é
diferente e precisa ser dita.**

Comparação de superfície:

| | **Antes (02-11)** | **Depois (saída A/B)** | **Depois (saída D)** |
|---|---|---|---|
| Credencial em serviço de terceiro | Chave SSH privada Ed25519, longeva | Token do Coolify, revogável, com expiração e escopo `Deploy` | Chave SSH longeva |
| O que ela pode fazer | `rsync --server` para duas árvores + `deploy.sh <sha40>`, filtrado por `deploy-forced.sh` — **um wrapper de 7,6 KB que o `02-REVIEW` CR-01 já achou uma fuga** | Disparar deploy de **um** recurso. Nenhuma escrita de arquivo, nenhum shell | Executar **um** comando literal, sem argumento. Menos que o `deploy-forced.sh`, que aceitava argv |
| Se vazar | Escrita arbitrária de arquivo na caixa, com escalada por `authorized_keys` se o dono/modo estiver errado | Deploy de uma versão já publicada no GHCR do repositório — e nada mais | Deploy da versão corrente |
| Superfície nova que ninguém tinha | — | **O painel do Coolify passa a ser público** (login, e-mail, 2FA). É o custo real da saída A | Nenhuma |
| Superfície nova compartilhada | — | GHCR: um pacote público com as duas imagens do jogo. Conteúdo já público | Idem |

**Resposta direta:** sim, o modelo do Coolify substitui e supera a defesa do wrapper — **em
tudo, menos numa coisa**: o wrapper protegia uma caixa que ninguém mais usava, e o token do
Coolify vive numa plataforma que também opera a produção do vizinho. Um token com escopo
`Deploy` não alcança o vizinho (o Coolify tem isolamento por time e por recurso), mas o
**painel exposto** alcança. Por isso a recomendação da saída A vem com três condições, e as
três devem virar tarefa: **permissão `Deploy` e não `root`; expiração no token; e 2FA na conta
do painel.** Sem elas, a troca não é claramente melhor.

---

## O que NÃO muda

Verificado item a item contra o repositório.

| Construído em | O quê | Por que sobrevive |
|---|---|---|
| **02-01** | `tests/workflows.test.ts` — nenhum workflow publica no Pages | É a prova executável de INFRA-01, e é sobre o `.github/`, não sobre a caixa. **Intocada** |
| **02-02** | `base: '/'` (medido: `vite.config.ts:49`), `href` absolutos de raiz, as duas fontes em `public/fonts/`, `tests/build-base.test.ts` | Propriedades do artefato. O Traefik roteia por Host e serve a raiz do domínio; nada reintroduz subcaminho |
| **02-05** | `playwright.config.ts`, `tests/pwa/helpers.ts`, **`tests/pwa/fixtures/old-build/`** | **A fixture continua válida.** Ela é servida por um `http.Server` local que os helpers sobem em porta efêmera — não passa nem perto do Caddy, do Traefik ou do Docker. A janela que a congelou (depois de 02-02, antes de 02-06) já fechou e é história |
| **02-06** | `public/sw.js` como template com sentinelas, `tools/sw/emit.mjs`, `tools/sw/verify.mjs`, `sw:emit` no fim do `build` | O `sw.js` publicado é gerado no CI, entra no `dist/`, e o `dist/` entra na imagem `web` por `COPY`. O Caddy o serve com `Cache-Control: no-cache` (matcher `@shell`), o Traefik repassa sem tocar. **As três classes de cache continuam funcionando atrás do Traefik** — medido: o Traefik não reescreve `Cache-Control` (a resposta do vizinho carrega o dele intacto) |
| **02-07** | `#btn-update`, `showUpdateOffer`, o ciclo `SKIP_WAITING`/`controllerchange`, `tests/dom-ids.test.ts` | Puro cliente |
| **02-08** | `apps/server` inteiro: workspace confinado, `openDb` com os quatro pragmas, provider estático, `gold_entry`, `/api/health` de três chaves, `export const server`, `shutdown.ts` | **Uma linha muda** (DM-9, o bind). Tudo o mais fica, inclusive o desligamento gracioso, que DM-13 mostra sobreviver ao `-exec` |
| **02-09** | `update.spec.ts`, `api-isolation.spec.ts`, job `pwa` no CI, `docs/PARIDADE.md` | Rodam contra o `dist/` local, não contra a caixa |
| **02-10** | `tools/ops/restore-verify.mjs`, `ops/litestream.yml` | O script fica idêntico; o `.yml` muda no máximo um caminho |
| **02-11** | Os dois `upload-artifact` no job `test`, `sw:verify` e `server:build` antes deles, `hasLine()` | São a fronteira que D2-23 preserva: a imagem copia esses artefatos |
| **D2-18 / DM-2 / P-11** | O SW do DungeonGuys **original** apaga todo cache que não seja dele, e Cache Storage é por origem | Continua sendo o argumento de por que domínio próprio não é conforto. Nada nesta fase toca o jogo original |

**Uma verificação nova, barata, que vale a pena no 02-12:** conferir no navegador, contra
`https://dg2.kring.tech/`, que os três `Cache-Control` chegam ao cliente como o Caddy os
escreveu, e que o `alt-svc` de HTTP/3 do Traefik não interfere na instalação do service worker.
É um `curl -I` de três URLs e um DevTools aberto — mas é a diferença entre "o Traefik não
mexe nos cabeçalhos" ser medição ou suposição.

---

## Convivência com o vizinho (infraKring)

Orçamento medido da caixa: **7,9 GiB de RAM (5,8 disponíveis), 2 vCPU, 85 GB livres, cgroup
v2, swap de 2 GiB configurado.**

| Recurso | O que o jogo pede | Sobra |
|---|---|---|
| Memória | `web` 96 MiB + `api` 320 MiB = **416 MiB** de teto rígido | ~5,4 GiB continuam livres. O teto não existe por escassez: existe para que um vazamento no signaling da fase 3 não mate nem a API nem o vizinho — é o motivo original de D2-19, transportado |
| CPU | `cpus: 0.5` + `cpus: 1.0` de **teto**, num total de 2 vCPU | Um teto, não uma reserva. Em repouso o jogo consome quase nada; sob carga, o `cpus` impede que ele monopolize os dois núcleos. O build não roda aqui (DM-19) |
| Disco | ~130 MB por par de imagens no primeiro deploy; poucos MB por deploy depois; volume do SQLite na casa dos KB por meses | Retenção de 5 imagens cabe folgada em 85 GB (DM-16) |
| Portas no host | **Nenhuma** pelo contêiner. `3478/udp`, `3478/tcp`, `5349/tcp` e a faixa de relay pelo coturn nativo, na fase 3 | Nenhuma colisão: nada do vizinho usa essas portas (medido em `ss -tulnp`) |
| Volumes | Um volume nomeado novo (`dg2-data`) | Os três existentes são do Coolify e do vizinho, intocados |

**O que acontece com o vizinho se o contêiner do jogo entrar em crash-loop:**

- **Memória:** nada. O `mem_limit` é do cgroup; o OOM-killer mata dentro do cgroup do jogo.
  Esta é a substituição direta do `MemoryMax` do `dg2.service`, e o par com `NODE_OPTIONS`
  continua obrigatório (P-10).
- **CPU:** o `cpus: 1.0` limita a um núcleo. Um laço de reinício rápido consome fração de
  núcleo, não os dois.
- **Reinício:** `restart: unless-stopped` mais o backoff exponencial do Docker (que dobra até
  ~1 min) é o substituto de `StartLimitIntervalSec=60`/`StartLimitBurst=5`. A diferença
  importa e deve estar no runbook: **o systemd chegava a `failed` e parava; o Docker tenta
  para sempre.** P-9 (migração que falha vira crash-loop invisível) volta com outra roupa — o
  que fecha a corrente de alarme agora é o **healthcheck do compose** mais o monitor externo
  de D2-21, não o estado da unit.
- **Traefik:** um serviço sem contêiner saudável faz o roteador responder 503. O roteador do
  vizinho é outro; nada se cruza.
- **Rede:** o Coolify cria uma bridge por recurso. Não declare `networks:` e não haverá
  contato.

**A regra de ouro do plano:** toda alteração no host é **aditiva e confirmada antes** — as três
regras de UFW do coturn, a faixa de relay, e (se DM-7 for pela saída A ou B) o FQDN do painel.
Nada mais. Os dois achados de segurança do infraKring ficam **registrados e não corrigidos**.

---

## Vigilância — a perna que morreu e o que a substitui

D2-30 mata `cert-check.sh`/`.service`/`.timer`, e D2-16 é explícita sobre por que as duas
pernas existiam: *"o timer local vê o certificado real mas cala junto com a caixa; o monitor
externo sobrevive à queda mas só infere o certificado"*. Com o timer morto, **fica uma perna
só**, e o alarme de 30 dias que D2-16 exigia perde o dono.

**O certificado passa a ser do Traefik**, que renova sozinho, e o Let's Encrypt encerrou o
aviso por e-mail em jun/2025 — ninguém mais avisa de graça.

**Recomendação concreta:** ao escolher o serviço externo de D2-21, escolha um que faça **as
duas coisas** — disponibilidade por keyword em `/api/health` e **alerta de expiração de
certificado**. UptimeRobot e Better Stack oferecem monitor de SSL com limiar configurável;
Healthchecks.io é ótimo para cron e não faz isso. Isso recupera a capacidade sem reintroduzir
um timer na caixa, e sem contrariar D2-30.

**O que precisa estar escrito no runbook:** que a segunda perna deixou de existir por decisão,
que o alarme de 30 dias mora agora no painel do monitor de terceiro, e que se aquele serviço
for trocado um dia, o limiar de certificado vai junto.

---

## State of the Art

| Abordagem antiga (2026-08-31) | Abordagem atual | Quando mudou | Impacto |
|---|---|---|---|
| Caddy nativo dono da 443, ACME próprio | Traefik do Coolify termina TLS; Caddy vira política HTTP em porta interna | 2026-09-09, D2-25 | O Caddyfile perde o endereço e o ACME; ganha `trusted_proxies` e `auto_https off` |
| `systemd` supervisiona Node e Litestream em units irmãs | Docker supervisiona; Litestream vira PID 1 e envolve o Node | D2-22/D2-28 | 4 arquivos de unit saem; o desligamento gracioso sobrevive (DM-13) |
| Releases por sha em disco, symlink atômico, `prune-releases.sh` retendo 5 | Imagens por sha no GHCR e em disco; reversão para imagem local; retenção a definir | D2-24 | Garantia estrutural vira probabilística (DM-16) — registre a perda |
| `rsync` sobre SSH com chave restrita e wrapper `command=` | `docker push` com token efêmero + gancho HTTP | D2-23/D2-31 | Superfície menor, mas depende de DM-7 |
| `/etc/dg2/env` como lugar único dos segredos | Painel do Coolify para o app; arquivo no host só para o coturn | D2-29 | "Reconstruir a caixa é clonar o repo + restaurar um env" deixa de valer pela metade |
| `cert-check` local + monitor externo | Só monitor externo | D2-30 + D2-16 emendada | Escolha um monitor com alerta de SSL |
| better-sqlite3 exigindo `node_modules` instalado à mão na caixa | prebuilds no tarball do npm; `npm ci` dentro do build | DM-12 | O passo manual mais frágil do runbook desaparece |

**Descontinuado nesta fase:** `deploy.sh`, `rollback.sh`, `deploy-forced.sh`,
`prune-releases.sh`, `dg2.service`, `litestream.service`, `cert-check.{sh,service,timer}`, os
quatro secrets de SSH, `DEPLOY_ENABLED`, o passo manual de `/srv/dg2/node_modules`, o layout
`/srv/dg2/{releases,server-releases,current,current-server}`.

---

## Project Constraints (from CLAUDE.md)

| Diretiva | Como esta fase a respeita |
|---|---|
| **TypeScript + Vite, sem dependências de runtime no jogo publicado (`dependencies: {}`)** | A raiz continua com `{}`; nada de npm entra. As imagens são infraestrutura, não dependência do bundle. `tests/workspaces.test.ts` (02-08) já é o portão |
| **Pureza de `src/sim/`** | Nada nesta fase toca `packages/sim`. `SIM_VERSION` não se move — se mover, alguém mexeu onde não devia (D2-01 § fora do escopo) |
| **Passo fixo `DT_MS`, `TICK_FACTOR`** | Intocados |
| **`WORLD`, `TILE`** | Intocados |
| **Infra: VPS própria, jogo/API/signaling no mesmo servidor, domínio único; operação é do usuário** | Mantido — com a correção de que o servidor é compartilhado com o infraKring e o domínio é `dg2.kring.tech`. TLS deixa de ser operação do usuário e passa a ser do Traefik, o que **reduz** carga operacional |
| **Netcode P2P host-autoritativo, fronteira desenhada para trocar transporte** | Fora do escopo desta fase; a única antecipação é o `handle /ws` do Caddyfile, que já existe |
| **Assets em repositório separado** | Fora do escopo |
| **Público fechado primeiro** | Mantido |
| **Comentários de código em inglês; documentos e commits em português** | Os exemplos de código acima seguem a regra: comentários em inglês nos arquivos que vão para o repositório, prosa deste documento em português |
| **Node 24 LTS na VPS, nunca Current** | `node:24.20.0-trixie-slim`. Node 26 é *Current* e fica fora |
| **`better-sqlite3` 13.0.3, não `node:sqlite`** | Mantido; DM-12 melhora o caminho de instalação |
| **coturn com `use-auth-secret` e `denied-peer-ip`** | Mantido; DM-14 registra que a versão é 4.6.1-2 do Debian, e DM-15/C-5 corrigem a faixa de relay |
| **Nada de `skipWaiting()` no SW com multiplayer** | Já resolvido nos 02-06/02-07 |
| **Evitar SaaS que contradiga auto-hospedagem** | GHCR é registro de artefato, não hospedagem do jogo; o monitor externo é o único terceiro, e D2-21 já o decidiu |

---

## Environment Availability

Medido na caixa em 2026-09-09 por `ssh dg2vps`.

| Dependência | Exigida por | Disponível | Versão | Alternativa |
|---|---|---|---|---|
| Docker Engine | D2-22, tudo | ✓ (via `sudo`) | 29.6.0, API 1.55 | — |
| Docker Compose | D2-25 | ✓ | v5.1.4 | — |
| Coolify | D-VPS-03 | ✓ | 4.3.18 | — |
| Traefik | D2-25, TLS | ✓ | v3.6 | — |
| DNS `dg2.kring.tech` | D-VPS-01 | ✓ | resolve; 503 + cert autoassinado | — |
| Porta 80/443 abertas | ACME e o jogo | ✓ | UFW ALLOW | — |
| Alcançabilidade da API do Coolify de fora | **D2-31** | **✗** | 8000 e 8080 dão timeout | **Nenhuma sem mudança no host — ver DM-7** |
| `node` no host | (nada, sob D2-23) | ✗ | — | Não é necessário |
| `rsync` | (nada, sob D2-23) | ✗ | — | Não é necessário |
| `litestream` no host | D2-28 | ✗ | — | Vai **dentro da imagem** |
| `coturn` | D2-26, fase 3 | ✗ | candidato 4.6.1-2 | `apt install coturn` (aditivo) |
| Regras UFW 3478/5349 + faixa de relay | D2-27, fase 3 | ✗ | só 22/80/443 tcp | `ufw allow` (aditivo, confirmar antes) |
| Grupo `docker` para o usuário `deploy` | conveniência | ✗ | tem `sudo` NOPASSWD | `sudo docker` — **e assim deve ficar** |
| Bucket S3-compatível | D2-17 | **desconhecido** | credenciais em `.vps.local`, fora do git | Criar no 02-04 se não existir |
| Conta no monitor externo | D2-21 | **desconhecido** | — | Criar no 02-04/02-12 |

**Faltantes sem alternativa (bloqueiam a execução):**
- Alcançabilidade da API do Coolify — **DM-7, decisão humana**.

**Faltantes com caminho conhecido (trabalho da fase):**
- coturn e as regras de UFW (aditivos, confirmados antes, e são fase 3 na prática).
- Bucket S3-compatível e monitor externo (portões humanos, herdados do 02-04 original).

---

## Validation Architecture

### Test Framework

| Propriedade | Valor |
|---|---|
| Unidade (Node) | Vitest 4.1.11 — `vitest.config.ts`, `include: ['tests/**/*.test.ts']` |
| Cross-engine | Vitest browser mode + `@vitest/browser-playwright` — `vitest.browser.config.ts` |
| PWA/e2e | `@playwright/test` **1.62.1** (exato) — `playwright.config.ts`, projetos `pwa` e `net` |
| Comando rápido | `npm test` |
| Suíte completa | `npm run lint && npm run typecheck:{sim,protocol,server,net} && npm test && npm run bench:snapshot && npm run sim:version:verify && npm run assets:{selftest,refusal,validate} && npm run test:browser && npm run build && npm run sw:verify && npm run server:build && npm run test:e2e` |

### Phase Requirements → Test Map

| Req | Comportamento | Tipo | Comando | Existe? |
|---|---|---|---|---|
| INFRA-01 | `base` é `'/'` e nada emitido carrega o subcaminho | unit | `npx vitest run tests/build-base.test.ts` | ✅ |
| INFRA-01 | Nenhum workflow publica no Pages | unit | `npx vitest run tests/workflows.test.ts` | ✅ |
| INFRA-01 | O domínio serve HTTPS com certificado válido | manual/VPS | `curl -sI https://dg2.kring.tech/` | ❌ 02-12 |
| INFRA-01 | Certificado com >30 dias, continuamente | monitor externo | painel do monitor com alerta de SSL | ❌ 02-12 |
| INFRA-02 | Instalação limpa: SW ativa e o precache cobre o `dist/` | e2e | `npx playwright test --project=pwa tests/pwa/install.spec.ts` | ✅ |
| INFRA-02 | Offline depois da instalação, sem nunca ter jogado | e2e | `…/offline.spec.ts` | ✅ |
| INFRA-03 | `/api/` e `/ws` nunca entram no Cache Storage; não-`ok` nunca é gravado | e2e | `…/api-isolation.spec.ts` | ✅ |
| INFRA-03 | Atualização in-place deixa exatamente **um** cache | e2e | `…/update.spec.ts` | ✅ |
| INFRA-03 | O passo de build rodou (sem sentinela sobrando) | build gate | `npm run sw:verify` | ✅ |
| INFRA-04 | Migração roda e é idempotente | integração | `npx vitest run tests/server-migrate.test.ts` | ✅ |
| INFRA-04 | `/api/health` responde 200 e não vaza | integração | `npx vitest run tests/server-health.test.ts` | ✅ |
| **INFRA-04** | **A composição declara os limites, o `-exec`, o `pull_policy` e nenhuma porta publicada** | **unit** | **`npx vitest run tests/ops-config.test.ts`** | **❌ reescrever** |
| **INFRA-04** | **O `ci.yml` publica imagem por sha, com uma única escrita de escopo** | **unit** | **`npx vitest run tests/workflows.test.ts`** | **❌ alterar** |
| INFRA-04 | Deploy é um comando | manual/VPS | push na `main` → `/api/health` responde com o sha novo | ❌ 02-12 |
| INFRA-04 | Reversão funciona **sem rede** | manual/VPS | tag anterior + `up -d` com `ghcr.io` inalcançável | ❌ 02-12 |
| INFRA-04 | Backup **restaurado** e conferido | manual/VPS | `sudo docker run --rm … node /srv/tools/ops/restore-verify.mjs` | ❌ 02-12 |

### Success Criteria → Sinal Observável → Onde É Medido

| # | Critério | O que prova, sob a arquitetura nova | Onde |
|---|---|---|---|
| **1** | Jogo no domínio próprio sob HTTPS, e **um** alvo de deploy | (a) `curl -sI https://dg2.kring.tech/` → 200 com cadeia válida do Let's Encrypt emitida pelo **Traefik**; (b) `tests/workflows.test.ts` verde — nenhum workflow toca o Pages; (c) o monitor externo registrou uma checagem verde **e** tem alerta de expiração de certificado configurado | (a) shell + navegador no 02-12; (b) CI; (c) painel do monitor, colado em `docs/OPERACAO.md` |
| **2** | Instalação limpa **e** atualização a partir de instalação antiga; abre sem rede | As quatro specs de Playwright, **inalteradas**, no job `pwa`. **Mais** uma conferência no 02-12 contra o domínio real: instalar o PWA, desligar a rede, abrir | CI (Chromium) + navegador no 02-12. Lacuna de iOS/Safari e de Firefox/WebKit continua registrada em `docs/PARIDADE.md` (D2-11) |
| **3** | `/api/` nunca do cache; não-`ok` nunca gravado; deploy novo não deixa cache velho | `api-isolation.spec.ts` e `update.spec.ts`, **inalteradas**. **Mais**, no 02-12: `curl -I` das três classes contra o domínio real, provando que o Traefik não reescreve `Cache-Control` | CI + `curl` no 02-12 |
| **4** | Deploy é um comando e é reversível; backup restaurado e anotado | (a) um push na `main` faz `/api/health` devolver o sha novo, sem intervenção; (b) apontar para o sha anterior e redeployar devolve o jogo anterior **com o `ghcr.io` inalcançável**; (c) o contêiner descartável imprime a linha verde do `restore-verify.mjs` e sai 0; (d) `docs/OPERACAO.md` tem data, duração e o que faltou | (a)(b)(c) shell no 02-12; (d) artefato — o verificador da fase abre o arquivo |

### Sampling Rate

- **Por commit de tarefa:** `npm test`.
- **Por merge de onda:** `npm run lint && npm test && npm run build && npm run sw:verify && npm run test:e2e`.
- **Portão de fase:** suíte completa verde no CI **mais** as quatro execuções contra a caixa
  real, com a saída colada em `docs/OPERACAO.md`.

### Wave 0 Gaps

- [ ] Nenhum arquivo de teste **novo** é necessário. `tests/ops-config.test.ts` e
      `tests/workflows.test.ts` existem e são o instrumento — o trabalho é **reescrevê-los**,
      e a reescrita entra no mesmo commit que remove os arquivos (D2-30).
- [ ] Decidir se o `Dockerfile.web` ganha cabeçalho em prosa ou se os pisos anti-vacuidade
      ganham exceção (§ delta do teste de ops). **Prefira o cabeçalho.**
- [ ] `docs/OPERACAO.md` não existe ainda — nasce no 02-12, como o plano original previa.

### Notas de projeto do teste de PWA (continuam valendo, sem alteração)

1. **Service worker no Playwright é Chromium-only.** `[CITED: playwright.dev/docs/service-workers]`
2. **Não confie só em `context.setOffline()`** — derrube o servidor da fixture de verdade.
3. **Colete `requestfailed` filtrando por origem própria** (com D2-20 aplicada, a asserção
   pode ser zero falhas sem exceção).
4. **Contexto seguro:** `http://localhost` conta; o teste não precisa de TLS.
5. **Não use `serviceWorkers: 'block'`.**
6. **`tests/pwa/tsconfig.json` próprio**, em vez de afrouxar o `types` da raiz.

### Lacuna aceita, registrada por escolha (D2-11)

> PWA em iOS/Safari físico permanece sem cobertura, por decisão, e a caixa correspondente em
> `docs/PARIDADE.md` permanece **aberta** ao fim desta fase. O Playwright só suporta service
> worker em Chromium, então Firefox e WebKit também ficam de fora. O verificador da fase deve
> ler o critério 2 com essa ressalva e **não** tratar a caixa aberta como pendência.

---

## Security Domain

### Applicable ASVS Categories

| Categoria | Aplica | Controle padrão nesta fase |
|---|---|---|
| **V2 Authentication** | não | Better Auth é fase 6. O único segredo de autenticação aqui é o token de deploy |
| **V3 Session Management** | não | Idem |
| **V4 Access Control** | **sim** | Token do Coolify com escopo `Deploy` (nunca `root`), com expiração; `GITHUB_TOKEN` efêmero com `packages: write` num job só; UFW `deny incoming` com três regras aditivas; nada publicado no host pelo contêiner |
| **V5 Input Validation** | **sim** | `zod` no protocolo (fase 3); `readEnv()` recusa valor definido-e-vazio; `restore-verify.mjs` valida o `probe` como inteiro antes de usá-lo |
| **V6 Cryptography** | **sim** | TLS pelo Traefik/ACME; HMAC-SHA1 do TURN REST (fase 3); **nada hand-rolled**. O `static-auth-secret` é placeholder no repositório e existe de verdade em dois lugares (D2-29) |
| **V8 Data Protection** | **sim** | Segredos no painel do Coolify e em `/etc/turnserver.conf` 0600; `tests/ops-config.test.ts` recusa segredo, domínio e IP no repositório; `.vps.local` e `.vps-inventario.local` fora do git por `*.local` |
| **V12 Files & Resources** | **sim** | `file_server` sem `try_files`; `nosniff`; nenhum caminho vindo do cliente vira caminho de arquivo |
| **V14 Configuration** | **sim** | CSP/HSTS/Referrer-Policy pelo Caddy (DM-11); `auto_https off`; `admin off`; `USER` não-root no `Dockerfile.api`; `mem_limit`/`cpus` |

### Known Threat Patterns

| Padrão | STRIDE | Mitigação, e onde ela vive |
|---|---|---|
| Token de deploy vazado publica versão arbitrária | Tampering / EoP | Escopo `Deploy` + expiração; o token só dispara deploy de **um** recurso, cujo conteúdo vem do GHCR do próprio repositório |
| Painel do Coolify exposto à internet (saída A de DM-7) | Spoofing / EoP | **É a superfície nova mais séria desta fase.** 2FA na conta, allowlist de IP se viável, e registro explícito no runbook |
| Imagem substituída no registro entre build e pull | Tampering | Tag por sha de commit; o commit vem do push que passou nos portões. Melhoria futura: fixar por digest, não por tag |
| `X-Forwarded-For` forjado inflando ou esvaziando o limitador | Spoofing / DoS | Traefik não confia em XFF de não-`trustedIPs`; Caddy com `trusted_proxies static private_ranges` (DM-10). **Sem a segunda metade, a defesa não existe** |
| Relay TURN aberto virando spam relay e SSRF para a rede da própria caixa | Tampering / Info Disclosure | As onze faixas de `denied-peer-ip` (já testadas, contagem exata), `no-multicast-peers`, `no-cli`, `user-quota`/`total-quota` casadas com a faixa |
| Contêiner do jogo escapando para o host ou para o vizinho | EoP | `USER` não-root; nenhuma porta publicada; rede bridge própria; `mem_limit`/`cpus`; sem `privileged`, sem montagem do socket do Docker |
| Crash-loop do jogo degradando o vizinho | DoS | `mem_limit`, `cpus`, backoff do Docker. **Registrar que o Docker tenta para sempre onde o systemd chegava a `failed`** (P-9 com roupa nova) |
| Vazamento de endereço ou segredo pelo repositório público | Info Disclosure | O bloco D2-15 de `tests/ops-config.test.ts`, que passa a cobrir o compose e os Dockerfiles de graça (glob `../ops/*`). **Nota honesta: `dg2.kring.tech` já está em git**, nos documentos de `.planning/`; o IP não está, e é o IP que diz onde a máquina mora |
| Regras de `DOCKER-USER` do vizinho sumindo num restart do Docker | EoP | **Não corrigir** (D-VPS-02); registrar como causa possível de incidente no `docs/OPERACAO.md` |

---

## Assumptions Log

| # | Afirmação | Seção | Risco se estiver errada |
|---|---|---|---|
| A1 | O Coolify aceita uma composição de dois serviços vinda do repositório e permite atribuir o domínio ao serviço `web` | § Pergunta 1 | Alta: cairia para "Docker Compose Empty" (compose fora do git, D2-15 arranhada) ou para um contêiner só com s6-overlay. **Verificar no 02-04, antes de o resto do plano depender disso** |
| A2 | O Coolify não roda `docker compose build` quando nenhum serviço declara `build:` | § C-7 | Baixa: seria no-op de qualquer forma; o risco é só de log confuso |
| A3 | `SOURCE_COMMIT` chega à interpolação do compose | § Pergunta 4 | Nenhuma, porque a recomendação **não depende disso**: a via preferida é `PATCH` de env + deploy |
| A4 | O botão de reversão do Coolify funciona para recursos de compose | § Pergunta 4 / DM-16 | Média: se não funcionar, a reversão é "setar `DG2_IMAGE_TAG` para o sha anterior + redeployar", que funciona igual e é o que o runbook deve documentar de qualquer jeito |
| A5 | O binário do Litestream fica em `/usr/local/bin/litestream` no tarball da release | § Dockerfile.api | Baixa: `tar -tzf` no plano resolve; o sha256 precisa ser preenchido de qualquer forma |
| A6 | O `stop_grace_period` de 30 s é folga suficiente para o drain do Node mais a sincronização final | § C-4 | Baixa: mede-se no 02-12 pelos logs; ajustável |
| A7 | 100 portas de relay atendem o público desta fase (D2-27 diz ~25 salas totalmente por relay) | § Pergunta 2 | Baixa nesta fase (não há rede de jogo); revisar na fase 3 com medição real de desfecho ICE |
| A8 | O bucket S3-compatível de D2-17 já existe ou é trivial de criar | § Environment Availability | Média: é portão humano herdado do 02-04 |
| A9 | A limpeza automática do Coolify está por limiar de disco e não por cron agressivo | § DM-16 | Média: **é leitura de uma tela, e o plano deve fazê-la** |
| A10 | O Traefik não reescreve `Cache-Control` nem interfere no registro do service worker | § O que NÃO muda | Baixa: medido indiretamente no vizinho (o `cache-control` dele chega intacto); confirmar com `curl -I` no 02-12 |
| A11 | `caddy:2.11.4-alpine` traz `wget` para o healthcheck | § compose | Baixa: alpine traz `wget` do busybox; se não, `curl` ou o healthcheck do Coolify |

---

## Open Questions

1. **Como o integrador alcança o Coolify? (DM-7)**
   - **O que sabemos:** 8000 e 8080 dão timeout de fora; não há FQDN para a instância; o
     lockdown é do infraKring.
   - **O que não está claro:** se Gustavo aceita expor o painel do vizinho.
   - **Recomendação:** **pergunta ao usuário antes do plano fechar.** Quatro saídas custeadas
     em DM-7; a recomendada é A (FQDN + token `Deploy` + expiração + 2FA), com D (chave SSH de
     `command=` literal) como segunda escolha se A for recusada.

2. **Quantas imagens ficam no disco, e quem poda?**
   - **O que sabemos:** o Coolify guarda a tag anterior (medido: duas tags de dois meses no
     vizinho); a limpeza automática é configuração **do servidor**, compartilhada.
   - **O que não está claro:** o gatilho configurado nesta instalação.
   - **Recomendação:** fixar retenção de **5** (herdando o `prune-releases.sh`); **ler e
     registrar** a configuração de limpeza sem alterá-la; provar a reversão sem rede no 02-12.

3. **`ops/litestream.service` está fora da lista literal de D2-30 mas morre por D2-28.**
   - **Recomendação:** o plano registra a extensão explicitamente, com a frase de D2-30 como
     justificativa ("um arquivo que ninguém executa é uma armadilha para quem ler o runbook
     daqui a seis meses"). Não é reabrir decisão; é fechar uma omissão.

4. **`DEPLOY_ENABLED` morre agora ou no 02-12?**
   - **O que sabemos:** o raciocínio do comentário no `ci.yml` (um job vermelho por semanas
     ensina a não ler CI vermelho) continua valendo enquanto o recurso do Coolify não existir.
   - **Recomendação:** manter a variável até o 02-12 e decidir lá. O plano deve dizer isso
     explicitamente, para que ninguém a remova por limpeza.

5. **A porta interna do Caddy e a do Node podem ser a mesma 8080?**
   - **O que sabemos:** são namespaces de rede diferentes; não colidem.
   - **Recomendação:** manter as duas em 8080 e explicar em comentário por que isso não é um
     conflito — porque é a primeira coisa que um leitor vai achar que é.

---

## Sources

### Primary (HIGH confidence)

- **Medição direta na caixa, 2026-09-09, via `ssh dg2vps`** — `docker version` (29.6.0),
  `docker compose version` (v5.1.4), `docker ps` (Coolify 4.3.18, Traefik v3.6, dois apps do
  vizinho), `docker inspect coolify-proxy` (linha de comando do Traefik completa),
  `docker inspect` do app do vizinho (os 8 labels do Traefik e os labels `coolify.*`),
  `docker images` / `docker system df`, `ufw status verbose`, `iptables -L FORWARD/DOCKER-USER`,
  `ss -tulnp`, `apt-cache policy coturn`, `id`, `sudo -n`, `stat -fc %T /sys/fs/cgroup`,
  `getent hosts`, `/data/coolify/proxy/dynamic/*`, `/data/coolify/source/.env`
- **Medição externa, 2026-09-09** — `curl` para `dg2.kring.tech` nas portas 443, 8000 e 8080;
  `curl -I https://militias3dstore.kring.tech/` (cabeçalhos que o Traefik entrega)
- **Código-fonte do Litestream, branch `main`** — `cmd/litestream/replicate.go` (o bloco de
  `-exec`), `cmd/litestream/main.go` (o `case sig := <-signalCh`),
  `cmd/litestream/main_notwindows.go` (`signal.Notify(ch, SIGINT, SIGTERM)`)
- **Repositório deste projeto** — `ops/*` (14 arquivos), `tests/ops-config.test.ts` (74 testes,
  contados), `tests/workflows.test.ts`, `.github/workflows/ci.yml`, `apps/server/src/*`,
  `package.json` da raiz e de `apps/server`, `vite.config.ts`, `node_modules/better-sqlite3/prebuilds/`
- **`.planning/phases/02-migra-o-para-a-vps/`** — `02-CONTEXT.md` (D2-01..D2-31),
  `02-REVIEW.md`, os dez `*-SUMMARY.md`, `02-04-PLAN.md`, `02-12-PLAN.md`, `02-PATTERNS.md`
- **`.planning/STATE.md`** — D-VPS-01/02/03, tabela de destino por artefato, as cinco perguntas
- **API do GitHub** — releases de `benbjohnson/litestream` (v0.5.17, 2026-08-31),
  `coturn/coturn` (4.18.0, 2026-09-08), `caddyserver/caddy` (v2.11.4, 2026-06-03),
  `coollabsio/coolify` (v4.3.18, 2026-09-08), `traefik/traefik` (v3.7.12, 2026-08-26),
  `WiseLibs/better-sqlite3` (v13.0.3, zero assets); `action.yml` das quatro ações de Docker
- **Docker Hub** — tags e tamanhos de `library/caddy` (2.11.4-alpine, 23,9 MB),
  `library/node` (24.20.0-trixie-slim, 85,3 MB), `litestream/litestream` (0.5.17)
- **Context7 `/coollabsio/coolify-docs` e `/websites/coolify_io`** — `openapi.json`
  (`/deploy` por uuid/tag com `bearerAuth`; `create-dockerimage-application`;
  `docker_compose_domains`), magic env vars do compose, variáveis predefinidas
  (`SOURCE_COMMIT`, `COOLIFY_FQDN`), limpeza automática, permissões de token
- **`caddyserver.com/docs`** — `reverse_proxy` (*"the proxy will ignore their values from
  incoming requests, to prevent spoofing"*), opções globais (`auto_https off`,
  `trusted_proxies static private_ranges`, endereço com `http://`)
- **`doc.traefik.io/traefik/reference/install-configuration/entrypoints`** — `forwardedHeaders`,
  `trustedIPs`, `insecure`, e o comportamento padrão contra cliente não confiável
- **`coolify.io/docs`** — build pack de Docker Compose (rede própria proibida, compose como
  fonte da verdade), rollback (*"only local images are supported"*), limpeza automática,
  autorização da API

### Secondary (MEDIUM confidence)

- `litestream.io/guides/docker/` — o padrão `-exec` e a recomendação de s6 para múltiplos
  processos (confirmado no código-fonte, o que o promoveu na prática)
- `litestream.io/reference/config/` — `replica` no singular a partir da v0.5, opções de S3

### Tertiary (LOW confidence — validar no 02-12)

- Comportamento exato do Coolify ao processar um compose sem `build:` (A2)
- Se `SOURCE_COMMIT` chega à interpolação do compose (A3)
- Se o botão de reversão do Coolify cobre recursos de compose (A4)
- Caminho do binário dentro do tarball do Litestream (A5)

---

## Recomendações de Planejamento

### Cinco planos, e a ordem não pode ser trocada

| # | Plano | Tipo | Cobre | Por que nesta posição |
|---|---|---|---|---|
| **02-04′** | **A decisão do gancho, a caixa, o bucket e os segredos** | trabalho novo, `autonomous: false` | Resolver **DM-7** com o usuário (as quatro saídas, com recomendação); criar o recurso no Coolify e **provar A1** (composição de dois serviços com domínio no `web`); ler e registrar a configuração de limpeza (**DM-16**); confirmar o bucket S3; criar o token com escopo `Deploy` e o segredo do gancho; abrir `docs/OPERACAO.md` | **Primeiro porque decide a forma do 02-11′.** Escrever o job de publicação antes de saber como o gancho é chamado é escrever duas vezes. E A1 é a suposição de que todo o resto depende |
| **02-13** | **O delta de código que a containerização exige** | correção do já executado | `DG2_BIND` em `env.ts` com padrão loopback (**DM-9**) + os testes de `server-env`; `ops/Caddyfile` com bloco global, `auto_https off`, `admin off`, `trusted_proxies` (**DM-10**), endereço `http://:8080`, `root */srv/www`, cabeçalho em prosa reescrito; as asserções novas do Caddyfile em `tests/ops-config.test.ts` | **Antes do 02-14** porque o `Dockerfile.web` copia o Caddyfile e o `Dockerfile.api` roda o servidor. Os dois defeitos aqui são invisíveis em teste local e fatais na caixa |
| **02-14** | **`ops/` containerizado, e os 34 testes reescritos no mesmo commit** | correção + trabalho novo | Nascem `Dockerfile.web`, `Dockerfile.api`, `docker-compose.yml`; morrem os 9 arquivos (**D2-30 + `litestream.service`**); `turnserver.conf` ganha `min-port`/`max-port` e `total-quota` casada (**D2-27/C-5**); `litestream.yml` ajusta o caminho; `ops/README.md` reescrito com `sudo docker`, a retenção de 5, o gancho, a reversão, o UFW do coturn e o parágrafo em voz alta do segredo em dois lugares (**D2-29**); `tests/ops-config.test.ts` perde 34, ganha ~10 e conserta o piso `>= 13` (**DM-20**) | **Depois do 02-13** (precisa do Caddyfile final) e **antes do 02-11′** (o CI constrói a partir destes Dockerfiles). D2-30 é explícita: as asserções são reescritas **no mesmo commit** que remove os arquivos |
| **02-11′** | **O `ci.yml` de imagem-e-gancho, e o delta de `tests/workflows.test.ts`** | correção do já executado | Job `deploy` sai inteiro; job `image` entra com `docker build`/`push` em `run:` — **sem ação de terceiro** (**DM-8**) — `packages: write` num job só, tag por sha, e o passo de gancho na forma que o 02-04′ decidiu; verificação pós-gancho comparando `/api/health` com `$GITHUB_SHA`; a asserção de escopo de escrita ganha a exceção nomeada; as 5 asserções de chave SSH morrem, as 2 de concorrência e de D2-08 sobrevivem alteradas | **Depende do 02-04′** (forma do gancho) e do **02-14** (os Dockerfiles existem). É o último plano que roda sem a caixa |
| **02-12′** | **A caixa de verdade** | trabalho novo, `autonomous: false` | Primeiro deploy real e o **primeiro certificado do Traefik** para `dg2.kring.tech`; conferência dos três `Cache-Control` e do CSP no navegador (**A10** e a nota de "não verificado contra navegador" que o Caddyfile carrega desde o 02-03); instalação e atualização do PWA contra o domínio real; **reversão com `ghcr.io` inalcançável** (**DM-16**); ensaio de restauração no contêiner descartável, com data e duração; monitor externo com keyword **e alerta de SSL** (**§ Vigilância**); `docs/OPERACAO.md` preenchido | Nada disso existe sem os quatro anteriores. É o plano que troca "está escrito" por "foi feito" |

### O que é correção do já executado e o que é trabalho novo

| Plano | Correção | Novo |
|---|---|---|
| 02-04′ | — | tudo |
| 02-13 | `apps/server/src/env.ts`, `apps/server/src/index.ts`, `ops/Caddyfile`, parte de `tests/ops-config.test.ts` | — |
| 02-14 | remoção de 9 arquivos de `ops/`, reescrita de `ops/README.md`, `ops/turnserver.conf`, `ops/litestream.yml`, 34+15 testes | 3 arquivos de contêiner |
| 02-11′ | `.github/workflows/ci.yml`, `tests/workflows.test.ts` | job `image` |
| 02-12′ | — | tudo, mais `docs/OPERACAO.md` |

### Restrições de ordem que não podem ser trocadas

1. **02-04′ antes de 02-11′.** A forma do passo de gancho depende de DM-7. Escrever antes é
   escrever duas vezes.
2. **02-04′ antes de 02-14**, ao menos na parte de A1: se o Coolify recusar a composição de
   dois serviços vinda do repositório, o `docker-compose.yml` muda de lugar (painel) ou de
   forma (um contêiner com s6). Descobrir isso depois de escrever os testes custa o dobro.
3. **02-13 antes de 02-14.** O `Dockerfile.web` copia o Caddyfile final.
4. **02-14 antes de 02-11′.** O CI constrói a partir dos Dockerfiles.
5. **Tudo antes de 02-12′.**
6. **Dentro do 02-14: remover arquivo e reescrever asserção no MESMO commit.** É texto literal
   de D2-30, e é o que impede uma janela em que a suíte está vermelha por um motivo que não é
   defeito.
7. **A fase 3 continua bloqueada no `03-11`** até o 02-12′ passar — e o `03-11` ganha uma
   dependência nova que não tinha: as **três regras de UFW** e a **faixa de relay** (DM-15).
   Sem elas, o relay autentica e o tráfego não chega, com o sintoma "um amigo específico nunca
   entra". Registre isso no plano da fase 3, não só neste.

### Uma nota sobre a numeração

Os planos pendentes são `02-04` e `02-12`, e ambos são **reescritos**. Os três planos de
correção (`02-13`, `02-14`, e a reescrita do `02-11`) tocam arquivos de planos já marcados
como feitos. O planejador deve decidir se renumera ou se acrescenta ao fim; a recomendação é
**acrescentar ao fim (`02-13`, `02-14`, `02-15`) e deixar `02-04` e `02-12` com os números
que têm**, porque `ROADMAP.md`, `STATE.md` e `03-11` já os citam pelo número, e renumerar
quebraria três referências para arrumar uma tabela.

---

## Metadata

**Confidence breakdown:**

- **A caixa e o que há nela:** HIGH — inspecionada nesta sessão, comando por comando.
- **Os três defeitos de código (DM-8, DM-9, DM-10):** HIGH — lidos nos arquivos, com o
  comportamento do Caddy e do Traefik confirmado em documentação oficial.
- **Litestream `-exec` e sinais (DM-13):** HIGH — lido no código-fonte, não em tutorial.
- **`better-sqlite3` prebuilds (DM-12):** HIGH — arquivos listados em disco.
- **Integração com o Coolify (recurso de compose, domínio por serviço, gancho, reversão):**
  MEDIUM — documentada e coerente com o que o vizinho mostra, **não executada**. É o que o
  02-04′ existe para converter em HIGH.
- **DM-7 (alcançabilidade):** HIGH na medição, **aberto na decisão**.
- **O delta de `ops/` e dos testes:** HIGH — contado arquivo por arquivo e teste por teste.

**Research date:** 2026-09-09
**Valid until:** ~2026-10-09 para a camada de plataforma (o Coolify publica release quase
semanalmente; a instância já pulou de 4.3.17 para 4.3.18 em cinco dias). A camada medida da
caixa vale até alguém mexer na caixa — e o vizinho é operado por outro projeto.
</content>
</invoke>
