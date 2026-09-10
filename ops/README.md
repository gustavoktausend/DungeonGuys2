# `ops/` — a caixa, escrita em diff

Configuração da VPS que serve o DungeonGuys2. Nada aqui roda na máquina de
desenvolvimento: é o que a caixa executa, versionado para poder ser revisado
antes de existir.

As decisões abaixo ficam registradas com o motivo, no mesmo espírito de
`tools/README.md`: escritas para quem um dia vai querer mudá-las, e não para quem
já concorda.

**Este runbook pressupõe que você nunca viu esta máquina.** Onde ele precisa de
um fato sobre a caixa — endereço, domínio, credencial, o que já foi executado —
ele aponta para `docs/OPERACAO.md`, que é o registro de operação. Este arquivo
diz **como**; aquele diz **o quê, quando e com que resultado**.

---

## 1. O que mora aqui e por quê

Oito arquivos, e nenhum deles é executável:

| Arquivo | O que é |
|---|---|
| `docker-compose.yml` | a composição que o Coolify lê do repositório: dois serviços, dois volumes, os limites |
| `Dockerfile.web` | o Caddy com a política HTTP e o `dist/` que passou pelo portão cross-engine |
| `Dockerfile.api` | o servidor, o Litestream que o envolve, e nada mais |
| `Caddyfile` | a política HTTP inteira: cabeçalhos, cache, `/api`, `/ws`, 503 legível por máquina |
| `litestream.yml` | a réplica contínua do banco |
| `turnserver.conf` | o relay da fase 3 |
| `coturn-dropin.conf` | o teto de memória do relay, como drop-in da unit do distribuidor |
| `README.md` | este arquivo |

**Quem executa agora é o Docker.** Até 2026-09-10 havia aqui cinco scripts de
shell e quatro units do systemd, que descreviam um layout de disco com releases
por sha, um symlink que um script trocava, dois usuários, uma chave de deploy e
um supervisor. D2-30 os aposentou: **nenhum deles jamais foi instalado em lugar
nenhum**, e é só por isso que a retirada foi barata. Um arquivo que ninguém
executa e continua no repositório é uma armadilha para quem ler o runbook daqui a
seis meses — e o git guarda a história sem precisar do arquivo vivo.

A consequência que interessa é a mesma de antes, com outra forma: **reconstruir a
caixa é criar um recurso no Coolify apontado para este repositório e preencher as
variáveis do app.** Não há árvore de releases para restaurar, não há arquivo de
ambiente para recuperar, não há unit para instalar.

O que **não** entra aqui: nome de domínio, endereço de host, credencial, chave.
Isso é asserido, não prometido — `tests/ops-config.test.ts` varre este diretório
inteiro, comentários incluídos, procurando IP, domínio e chave com valor literal
(D2-15). As três exceções nomeadas são listas de tokens exatos: o registro de
imagens, o host de onde o binário do Litestream é baixado, e dois caminhos
internos de contêiner. O domínio do jogo continua recusado, e essa recusa é a
prova de que as exceções não abriram buraco.

O nono executável do conjunto, `tools/ops/restore-verify.mjs`, é Node e mora fora
de `ops/` porque segue as convenções de `tools/README.md`. §11 diz como ele roda
agora, e a resposta mudou: num contêiner descartável.

---

## 2. O recurso do Coolify

O painel do Coolify **não é alcançável pela internet** (DM-7): ele escuta numa
porta que o firewall da caixa fecha, e o acesso é por túnel SSH. `docs/OPERACAO.md`
registra o alias e o comando do túnel. Tudo nesta seção acontece com o túnel
aberto.

**Criar o recurso, uma vez:**

1. Novo recurso do tipo **Application**, com source **Public Repository** e build
   pack **Docker Compose**.
2. **Docker Compose Location:** `ops/docker-compose.yml`. É o ponteiro inteiro —
   o Coolify clona o repositório e lê esse caminho. Se o campo apontar para um
   arquivo que não existe no clone, o painel lista **zero serviços**, e o sintoma
   é indistinguível de "o Coolify não suporta esta composição".
3. Confirmar que ele descobriu **dois** serviços, `web` e `api`.
4. Atribuir o domínio ao serviço **`web`** — é ele que declara a porta interna, e
   é de `expose` que o Coolify tira a porta para o label do Traefik. **O campo de
   domínio já põe o esquema**: digitar a URL completa produz `https://https://…`
   e um erro sobre FQDN. O valor que funciona é **só o hostname**.
5. Conferir que o Coolify gerou o **par de roteadores** do Traefik (o de HTTP e o
   de HTTPS com o resolvedor de certificado). Sem o par, o hostname responde 503
   com certificado autoassinado, e isso não é um problema de DNS.

**Nada disto declara rede, porta no host, passo de build ou label do Traefik à
mão**, e cada ausência tem o motivo escrito no cabeçalho de
`ops/docker-compose.yml`. Em particular: uma rede própria causa queda
intermitente de rota no Traefik — e a rota que cairia é compartilhada com a
produção de outro projeto na mesma caixa.

**Nada dispara deploy sozinho** (D2-32). O integrador constrói e publica as duas
imagens a cada push na `main` que passe nos portões; a promoção é um ato humano,
descrito em §5.

---

## 3. `sudo` em todo comando de Docker

O usuário de deploy **não está no grupo `docker`** (DM-17). Ele tem `sudo` sem
senha, então todo comando desta página começa com `sudo`:

```
sudo docker compose ps
sudo docker logs --tail 100 <contêiner>
sudo docker volume ls
```

Isso é decisão razoável do projeto vizinho — estar no grupo `docker` é
equivalente a ser root — e **não se mexe** (D-VPS-02). Está escrito aqui porque o
operador tropeça no primeiro comando se o runbook não disser, e o erro
("permission denied while trying to connect to the Docker API") aponta para o
lugar errado.

Os comandos de Docker que este runbook dá são **de leitura e de emergência**. O
caminho normal de publicar e reverter é o painel (§5, §6).

---

## 4. As variáveis do app no painel

`ops/docker-compose.yml` diz **quais** chaves existem; o painel do Coolify diz **o
que elas valem** (D2-29). Abaixo estão os **nomes**, sem valores — valor nenhum
entra neste repositório.

| Variável | O que é |
|---|---|
| `DG2_IMAGE_TAG` | a tag das duas imagens: sha de commit, nunca uma tag móvel (C-6). **Obrigatória.** Vazia, a composição recusa interpolar e o deploy morre com uma mensagem que nomeia a variável — nunca com `invalid reference format`, que não nomeia nada |
| `DG2_ORIGIN` | a origem que o servidor aceita no handshake de signaling |
| `DG2_TURN_SECRET` | a metade Node do par de segredo do relay (fase 3) |
| `DG2_TURN_REALM` | o realm do relay, que dobra como domínio anunciado (fase 3) |

E as que a composição declara com valor literal, em git, porque são **internas ao
contêiner** e porque um teste as compara com um segundo arquivo que tem de
concordar:

| Variável | O que é |
|---|---|
| `DG2_DB` | o arquivo do banco, dentro do primeiro volume persistente |
| `DG2_REPLICA_PATH` | o diretório da réplica, dentro do **segundo** volume persistente |
| `DG2_PORT` | a porta interna do servidor |
| `DG2_UPSTREAM` | o nome de serviço e a porta que o Caddy procura |
| `DG2_BIND` | o bind interno, `0.0.0.0` |
| `DG2_RELEASE` | o que a rota de saúde devolve como versão; alimentado pela tag |

**`DG2_BIND=0.0.0.0` não é um buraco, e a razão é estrutural.** `127.0.0.1` seria
o loopback do contêiner do `api`, e o Caddy vive em outro (DM-9). O que substitui
a defesa é que **nenhum serviço publica porta no host**: a porta do contêiner não
atravessa o UFW nem o NAT, e a única origem capaz de falar com ela é a rede que o
Coolify criou. Essa ausência é asserida, e o comentário sobre `serve()` em
`apps/server/src/index.ts` nomeia a asserção — apagar uma torna o outro uma
mentira.

**Não existe variável de bucket, e isso é decisão e não esquecimento** (D2-33). O
Litestream replica para um caminho desta caixa, não para um bucket; nenhuma
credencial de provedor existe. §11 escreve o que essa escolha custa.

### O segredo do relay mora em dois lugares de naturezas diferentes

`DG2_TURN_SECRET` no painel do Coolify e `static-auth-secret` em
`/etc/turnserver.conf`, um arquivo no host. **Trocar num só faz o relay recusar
toda credencial que a API emitir** — e o sintoma não se parece com erro de
configuração. Parece **"um amigo específico nunca entra"**: quem fecha conexão
direta continua jogando, e só quem precisava do relay fica de fora. É
indistinguível de NAT ruim a olho nu. As duas metades andam juntas, sempre, e §12
repete isso no passo onde o erro é cometido.

---

## 5. Publicar

O integrador já construiu e publicou as imagens; publicar é **promover** uma tag.

1. **Empurrar a `main` para o GitHub.** Não é higiene, é pré-requisito: o Coolify
   clona o repositório remoto, não esta máquina. Uma `main` local adiantada
   produz um clone sem os arquivos que você acabou de escrever, e o sintoma é
   "nenhum serviço descoberto".
2. Confirmar que o integrador publicou as duas imagens da tag desejada.
3. Abrir o túnel e, no recurso do jogo, ajustar `DG2_IMAGE_TAG` para o sha
   desejado. **Não há como omitir este passo**, e a tentativa de lhe dar um padrão
   derrubou a produção em 2026-09-10 — o cabeçalho da composição carrega a medição
   e o porquê. Uma tag vazia falha na interpolação, dizendo qual variável falta.
4. Disparar o deploy. O log tem de dizer **`pull`** e não `build`: a composição
   não declara passo de build, e um build injetado pela plataforma seria
   construção numa caixa de 2 vCPU compartilhada com produção (C-7).
5. Conferir que a rota de saúde devolve **byte a byte** aquele sha no campo de
   versão. É a diferença entre "o deploy foi disparado" e "a versão nova está no
   ar".

**Os dois serviços compartilham uma tag só, então todo deploy recria os dois
contêineres** — inclusive um deploy que só mexeu no cliente. Isso é escolha, não
acidente: a migração é idempotente, o drain é gracioso, e o custo hoje é alguns
segundos. O cabeçalho de `ops/docker-compose.yml` registra a alternativa (duas
variáveis de tag) e a condição que a traria de volta.

---

## 6. Reverter

**Reverter é apontar `DG2_IMAGE_TAG` para o sha anterior e redeployar.** O mesmo
procedimento de §5, com a tag antiga.

**E isso não usa rede**, que é o ponto inteiro: `pull_policy: missing` na
composição faz o Docker buscar no registro **só o que não estiver em disco**, e a
imagem anterior está em disco. No cenário em que a reversão é necessária, a rede
é justamente o que pode estar ruim — e uma reversão que depende da mesma
infraestrutura que acabou de falhar não é uma rede de segurança.

Se o painel estiver inalcançável e a reversão for urgente, o caminho manual é
editar o valor da tag onde o Coolify o guarda e recriar os contêineres com `sudo
docker compose up -d`. É um caminho de emergência: ele conserta a caixa e deixa o
painel dessincronizado, então reconcilie no painel depois.

---

## 7. Retenção de imagens, e a degradação honesta

**Retenção: 5 imagens por serviço.** Não é número novo — é a retenção que o script
de poda aposentado por D2-30 já havia decidido, transportada. Com o `npm ci`
antes do `COPY` do bundle em `ops/Dockerfile.api`, a camada de `node_modules` é
compartilhada entre builds e cada deploy custa alguns MB de camada nova, de modo
que cinco imagens por serviço cabem folgadas.

**A degradação, escrita aqui para não ser descoberta na noite em que importa.** O
symlink de release que o desenho anterior previa era uma garantia **estrutural**:
o diretório está lá ou não está. A imagem local é uma garantia
**probabilística**, dependente de uma rotina de limpeza automática que **este
projeto não controla** — ela é configuração **do servidor**, compartilhada com o
vizinho, que se lê e não se mexe. Uma imagem de release anterior é, por
definição, não usada por nenhum contêiner, que é exatamente o que uma limpeza de
imagens não usadas remove (C-3).

`docs/OPERACAO.md` registra que essa configuração **não foi lida**, com a data e
o motivo. Enquanto não for, "a imagem anterior já está no disco" é suposição e
não fato medido. Conferir é uma linha:

```
sudo docker images | grep dg2-
```

A melhoria conhecida, registrada para o dia em que valer o trabalho: fixar as
imagens base **por digest** em vez de por tag de patch. Uma tag de patch ainda é
um nome que o publicador pode mover.

---

## 8. O que esta fase deliberadamente não tem

**Sem staging** (D2-14). Uma caixa, um domínio. A confiança mora na reversão de §6
mais os portões do CI. Enquanto o público for o desenvolvedor e os amigos,
produção ainda é barata de quebrar — e é esse crédito que a fase existe para
gastar, antes de haver quatro amigos numa sala.

**Sem página HTML de manutenção.** O jogo é estático e continua no ar com o
processo Node fora; uma página de manutenção esconderia um jogo funcionando atrás
de um jogo quebrado. O que faltava não era uma página bonita, era um sinal legível
por máquina: o `handle_errors` do `Caddyfile` responde 503 com corpo JSON
genérico, e é isso que deixa o monitor externo distinguir "Caddy de pé, Node fora"
de "caixa fora".

**Sem stack trace na resposta.** O corpo de erro não carrega caminho, nem nome de
upstream, nem mensagem de exceção.

**Sem supervisor dentro da imagem.** Um contêiner, um processo — e o Litestream
envolvendo o Node com `-exec` em vez de um entrypoint de shell com `trap`, que é
a armadilha clássica de PID 1. §10 e §11 explicam por quê.

---

## 9. A porta 443 não é do Caddy

**A 443 é do Traefik do Coolify**, em TCP e UDP, e ele termina o TLS para o
vizinho também. O Caddy deste projeto escuta uma porta interna em HTTP puro, com
`auto_https off` — ligado, ele pediria certificado para um nome que não controla e
tomaria 80 e 443 do próprio namespace, e o resultado seria um redirect em laço na
primeira subida.

O relay fica em **3478 (UDP e TCP) e 5349 (TLS)**, como `ops/turnserver.conf` já
decidira. **TURN sobre TLS na 443 fica como dívida registrada e não construída** —
e ela ficou mais cara: a saída pelo app `layer4` do Caddy rotearia por ALPN/SNI,
mas não alcança uma porta que o contêiner dele não tem. Quando a dívida for
cobrada, a decisão é de operação e não de configuração.

O certificado é renovado pelo Traefik, sozinho, e vive no `acme.json` do Coolify —
que o usuário do `turnserver` não lê. §12 registra a consequência.

---

## 10. Supervisão — e a diferença que importa

`restart: unless-stopped` mais o backoff exponencial do Docker substituem o limite
de partidas que a unit do systemd aposentada carregava. **A diferença tem de estar
em voz alta: o systemd chegava a `failed` e parava; o Docker tenta para sempre.**

Não há equivalente a um limite de partidas na composição, e inventar um supervisor
contradiz a decisão de não pôr máquinas novas na caixa. Então a perda é real e
declarada: **uma migração quebrada agora é um laço de reinício invisível**, e
nenhum estado de unit fica vermelho para ninguém olhar.

**O que fecha a corrente de alarme passou a ser o `healthcheck` da composição mais
o monitor externo.** O healthcheck pede a rota de saúde pelo loopback do próprio
contêiner; um serviço sem contêiner saudável faz o roteador do Traefik responder
503. É isso que o monitor externo vê.

Ver de fora, em ordem:

```
sudo docker compose ps          # o status de saúde dos dois serviços
sudo docker logs --tail 200 <contêiner do api>
```

### Vigilância: a perna local morreu, e ninguém mais avisa de graça

O certificado passou a ser do Traefik, então o verificador local que rodava por
timer saiu com D2-30. E o Let's Encrypt **encerrou o aviso por e-mail** em
jun/2025. Sobra **uma** perna, a externa, e ela precisa fazer as **duas** coisas:

1. **Disponibilidade por keyword** na rota de saúde — não basta HTTP 200, porque
   um 200 com corpo de erro é o caso que importa.
2. **Alerta de expiração de certificado com limiar de 30 dias.**

O alarme de **30 dias** que D2-16 exigia **mudou de dono**: ele morava numa unit
desta caixa e agora mora no painel de um serviço de terceiro (UptimeRobot, Better
Stack ou equivalente — escolha um que faça monitor de SSL, porque há serviços
ótimos de cron que não fazem). Se esse serviço for trocado um dia, **o limiar de
30 dias vai junto**, e é por isso que ele está escrito aqui e não só configurado
lá.

`docs/OPERACAO.md` registra qual serviço foi escolhido e o que ele observa.

---

## 11. Backup contínuo e o ensaio de restauração

**O que roda sozinho:** o Litestream replica o WAL do banco continuamente (D2-17).
Ponto de recuperação em segundos, não em um dia — para um ledger de moeda, um dia
perdido é soul gold que sumiu. Ele lê o WAL, não o arquivo: copiar um `.db` sob
escrita com cron produz um arquivo corrompido, e é por isso que isto existe em vez
de um tarball noturno.

**Ele deixou de ser uma unit e virou PID 1 do contêiner** (D2-28). Medido no
código-fonte da v0.5: `replicate -exec` repassa o **sinal exato** ao filho e
**espera o filho sair** antes da sincronização final. Por isso o desligamento
gracioso do servidor sobrevive sem `tini` e sem `trap` de shell, e por isso
`stop_grace_period` é de 30s e não dos 10s padrão do Docker: o Node drena
primeiro, o Litestream sincroniza **depois**, e um prazo curto cortaria a segunda
etapa em silêncio.

**O destino é um caminho desta caixa, não um bucket** (D2-33). A réplica vive num
**segundo volume persistente** — não no do banco, e muito menos numa camada de
contêiner, onde o primeiro redeploy a apagaria **sem erro nenhum**: o backup
continuaria parecendo existir, que é o pior modo de falha que um backup tem.

**O que essa escolha custa, e é honesto dizer antes de alguém verificar: a
garantia off-site caiu.** A réplica protege contra corrupção do banco, migração
ruim e deploy errado. Ela **não** protege contra perder a caixa — mesmo disco, as
duas cópias. É escolha registrada, e a consequência é que backup off-site
continua sendo tarefa aberta do projeto vizinho, não desta fase.

### O ensaio, num contêiner descartável

D2-03 recusa o timer recorrente: numa VPS sem plantão, automação silenciosa é mais
uma coisa que quebra sem avisar, e um ensaio falhando em silêncio há quatro meses
é **pior** que nenhum ensaio, porque foi contado como um. O script existe, roda à
mão, e o resultado é anotado em `docs/OPERACAO.md` com a data.

**"Ambiente limpo" — o texto literal do critério — deixou de ser um diretório
temporário na mesma máquina e passou a ser um contêiner novo.** Com os dois
volumes montados em **somente-leitura**, o entrypoint sobrescrito e a imagem da
tag em produção:

```
sudo docker volume ls | grep dg2          # o Coolify prefixa os nomes; confira
sudo docker run --rm \
  -v <volume do banco>:/var/lib/dg2:ro \
  -v <volume da réplica>:/var/lib/dg2-replica:ro \
  --entrypoint node <imagem do api>:<sha> \
  /srv/tools/ops/restore-verify.mjs
```

O que cada parte compra:

- **`--rm` e um contêiner novo** — o arquivo restaurado é uma cópia completa do
  ledger, e deixá-lo em disco faria do verificador o vazamento. Ele morre com o
  contêiner.
- **Os dois volumes em `:ro`** — o banco vivo nunca é tocado, que é literalmente o
  requisito de D2-03, e a réplica é origem e não destino.
- **`--entrypoint node`** — a imagem normalmente sobe o Litestream como PID 1. Aqui
  o que se quer é o script, e a imagem já traz o binário do Litestream, o CLI
  `sqlite3` e a configuração, então nada precisa ser instalado.
- **`restore-verify.mjs`** compara **conteúdo, não bytes**: contagem de linhas e
  soma do valor no ledger, nos dois bancos. Diff binário daria vermelho sempre —
  dois SQLite semanticamente idênticos diferem em disco.
- Ele compara uma **janela fixa**, não o total: a replicação é assíncrona por
  construção, então o banco vivo se mexe enquanto o ensaio roda. Como o ledger é
  append-only, a restauração é um **prefixo** da tabela viva em ordem de `rowid`.
- Ele imprime **quanto tempo levou** e **quantas linhas de defasagem** havia. Os
  dois números são o que D2-03 manda anotar: o primeiro transforma um backup em um
  plano de recuperação, e o segundo é o ponto de recuperação — "idêntico" e
  "idêntico há três segundos" são fatos diferentes sobre um backup.

**Rode o ensaio com o serviço no ar.** O SQLite só abre um banco em WAL como
somente-leitura se o arquivo `-shm` já existir, o que é verdade enquanto o
contêiner do `api` estiver de pé; com ele parado, o script sai 1 dizendo isso. Não
é defeito — é também o único estado em que o número de defasagem significa
alguma coisa.

---

## 12. coturn — o relay da fase 3

Nativo no host, não em contêiner (D2-26), e só faz sentido depois que a caixa
existe. Os dois arquivos versionados são `ops/turnserver.conf` e
`ops/coturn-dropin.conf`, e nenhum dos dois carrega valor real: os placeholders
são substituídos aqui, na máquina.

**A versão instalada é a do distribuidor do Debian, e isso é escolha.** Ela não é
a última do projeto, e o que se compra em troca é o distribuidor mantendo as
correções de segurança e a unit. `no-cli` continua sendo a mitigação certa, porque
os CVEs históricos do coturn moraram na **interface de gestão**.

1. `apt-get install -y coturn`. O pacote **já traz** a unit e a habilita na
   instalação — não há nada para copiar de `ops/`.
2. `cp ops/turnserver.conf /etc/turnserver.conf`, depois
   `chown root:root /etc/turnserver.conf` e `chmod 0600 /etc/turnserver.conf`.
   **Substitua os dois placeholders**: `realm` (o domínio) e `static-auth-secret`
   (um segredo longo e aleatório, gerado aqui).
3. `mkdir -p /etc/systemd/system/coturn.service.d` e
   `cp ops/coturn-dropin.conf /etc/systemd/system/coturn.service.d/dg2.conf`,
   depois `systemctl daemon-reload`. É um **drop-in**, não uma cópia da unit: as
   linhas que ele sobrescreve são as únicas que este projeto quer, e o resto
   continua sendo mantido pelo pacote.
4. Ponha `DG2_TURN_SECRET` **com exatamente o mesmo valor do passo 2** e
   `DG2_TURN_REALM` nas variáveis do app no painel (§4). Depois **redeploy o
   recurso**: o contêiner só lê variável de ambiente quando é recriado, e uma
   chave nova que nenhum processo releu é uma chave que não existe.
5. Abra **quatro** regras no firewall — e esta é a metade que se esquece: as três
   de sinalização **e a faixa de relay**. `3478/udp`, `3478/tcp`, `5349/tcp`, e
   **`49200:49299/udp`**, que é a faixa declarada em `ops/turnserver.conf` por
   `min-port`/`max-port`. **Declarar a faixa sem abri-la e abri-la sem declará-la
   produzem o mesmo sintoma**, e é o mais caro de diagnosticar da fase 3: sem a
   declaração o coturn aloca em 49152-65535, o `deny incoming` bloqueia a faixa
   inteira, o relay autentica, entrega um endereço ao navegador e o tráfego nunca
   chega — outra vez **"um amigo específico nunca entra"**. As duas metades andam
   juntas. Se as regras já foram abertas, `docs/OPERACAO.md` registra quando e em
   quantas regras (v4 e v6); esta seção continua servindo para quem reconstruir a
   caixa do zero.
6. `systemctl enable --now coturn`, e confira `systemctl status coturn` **de
   verdade**. O `ProtectSystem=strict` do drop-in é a linha capaz de recusar o
   start se alguém acrescentar à config um diretório de log ou de banco fora do
   que o sandbox permite — e o erro se parece com permissão comum.

### O SEGREDO MORA EM DOIS LUGARES, E ESSA É A ARMADILHA

| Onde | Nome ali | Quem lê |
|---|---|---|
| `/etc/turnserver.conf` (host, root, 0600) | `static-auth-secret` | o coturn, para **verificar** a credencial |
| variáveis do app no painel | `DG2_TURN_SECRET` | o Node, para **emitir** a credencial |

Os dois lugares são de **naturezas diferentes** — um arquivo numa máquina e um
painel web — e é isso que torna a dessincronização fácil. **Trocar num só faz o
relay recusar toda credencial que a API emitir**, com o sintoma
**"um amigo específico nunca entra"**, indistinguível de NAT ruim.

Ao rotacionar: troque nos **dois**, depois `systemctl restart coturn` **e**
redeploy o recurso no painel. As credenciais já emitidas valem uma hora e vão
falhar até expirarem; isso é esperado.

### Orçamento

O teto do relay é o `MemoryHigh=96M`/`MemoryMax=128M` do drop-in — o que era
parágrafo de intenção é limite de cgroup. Duas ressalvas: os limites são
**ignorados em silêncio sob cgroup v1** (a caixa é v2), e o par de teto de heap
do V8 que o serviço `api` carrega **não** tem equivalente aqui, porque aquela
armadilha é do V8 e o coturn é C, que não dimensiona nada a partir da memória da
máquina.

O `total-quota=100` de `/etc/turnserver.conf` é dimensionamento tanto quanto
anti-abuso: é o teto de alocações simultâneas da máquina, casado com o tamanho da
faixa de relay do passo 5 — cem portas, cem alocações. Mudar a faixa e esquecer a
cota deixa um teste vermelho, de propósito. O `user-quota=6` é o teto por conta
autenticada.

**A caixa não é a VPS de 2 GB que o orçamento original supunha**: são ~8 GiB
partilhados com a produção de outro projeto. Os limites continuam obrigatórios
pelo motivo original, que não era escassez — é impedir que um vazamento no
signaling da fase 3 mate a API **e** o vizinho.

### TLS na 5349: declarada, não anunciada

`tls-listening-port=5349` está na config e a porta está no passo 5, mas o coturn
só completa um handshake TLS com `cert=` e `pkey=` apontando para um certificado
válido do domínio — e este runbook **ainda não tem o passo que os fornece**. O
certificado é do Traefik e vive dentro do `acme.json` do Coolify, que o usuário do
`turnserver` não lê. As saídas são uma cópia por gancho de renovação, com
permissão de leitura para o `turnserver` e um `systemctl reload coturn` depois, ou
um certificado próprio do relay; as duas exigem uma decisão de operação que ainda
não foi tomada, e uma cópia feita à mão uma vez é a pior das três — funciona até a
primeira renovação e depois falha sem uma linha de log do lado do jogo.

Por isso o servidor **não anuncia** `turns:` aos navegadores: anunciar uma URL que
o relay não consegue atender faria o navegador tentá-la e falhar exatamente na
população para a qual ela existiria — a rede que só deixa TLS passar. Quando o
passo do certificado entrar aqui, `cert=`/`pkey=` entram em
`ops/turnserver.conf`, `turns:` volta à configuração de ICE, e o teste cobra as
três URLs de novo, no mesmo commit.

---

## 13. Convivência com o vizinho

A caixa hospeda **produção viva de outro projeto**. A regra de ouro é de
`docs/OPERACAO.md` e vale aqui inteira: **toda alteração no host é aditiva e
confirmada antes.** Nada se remove, nada se reconfigura, nada se "arruma".

O que o jogo pede, e por que os tetos existem:

| Recurso | O que o jogo pede |
|---|---|
| Memória | os tetos dos dois serviços, algumas centenas de MiB de teto **rígido** |
| CPU | um teto por serviço, não uma reserva; o build não roda aqui |
| Disco | ~130 MB no primeiro par de imagens, poucos MB por deploy depois |
| Portas no host | **nenhuma** pelos contêineres; só as quatro do relay nativo |
| Volumes | dois volumes nomeados novos |

**O que acontece com o vizinho se o contêiner do jogo entrar em laço de
reinício:** nada, e é isso que os limites compram. O teto de memória é do
**cgroup**, então o OOM-killer age **dentro do cgroup do jogo**; o teto de CPU
limita a um núcleo, e um laço de reinício consome fração de núcleo; o roteador do
vizinho é outro; e sem rede própria declarada não há contato.

Os tetos **não existem por escassez** — existem para que um vazamento no
signaling da fase 3 não mate nem a API nem a produção do outro projeto. Esse era
o motivo original, e ele atravessou a containerização intacto.

---

## 14. Riscos herdados

Coisas que podem quebrar o deploy e **não são deste projeto**. Estão em
`docs/OPERACAO.md` com mais detalhe; ficam nomeadas aqui para que "o deploy parou
de funcionar" tenha onde começar:

- **A alcançabilidade do caminho de deploy depende de configuração de outro
  projeto.** O painel é alcançado por túnel; uma mudança de SSH, de firewall ou de
  porta do lado do vizinho derruba o caminho sem tocar em nada nosso.
- **A limpeza automática de imagens é configuração do servidor**, compartilhada, e
  não foi lida (§7). É o que pode apagar a imagem para a qual você ia reverter.
- **Dois achados de segurança do vizinho ficam registrados e não corrigidos**: uma
  porta do painel publicada em todas as interfaces e fora da lista de travamento,
  e a unit de travamento inativa — de modo que um reinício do Docker sem reboot
  apagaria as regras até o próximo boot. São dele, não do jogo.
