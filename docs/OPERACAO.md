# Operação da caixa

Aberto em: 2026-09-09 · última execução registrada: **2026-09-10** · plano 02-04 (fase 2) ·
decisões `D-VPS-01/02/03` e `D2-22`..`D2-33`.

**Só entra aqui o que foi executado, com a saída colada.** Procedimento descrito e não rodado
não conta, e fica marcado como pendente até alguém rodá-lo. É a mesma regra de
`docs/PARIDADE.md`, e ela existe pelo mesmo motivo: o modo de falha de configuração de infra é
estar errada por meses sem ninguém descobrir, e um documento que aceita intenção como prova é
exatamente o instrumento que esconde isso.

**Este arquivo não diz onde a caixa mora** (D2-15). Nenhum endereço, nenhum domínio, nenhuma
credencial com valor. Quem precisa deles lê do painel do Coolify ou de `.vps.local`, que está
fora do git. O que entra aqui é o **fato** — o certificado é válido, o gatilho da limpeza é tal,
as quatro regras estão abertas — nunca o endereço. `tests/ops-config.test.ts` tem um bloco que
recusa literal de IP e credencial com valor neste arquivo, inclusive em saída colada.

## A caixa

**Ela não é nossa sozinha.** É o host do projeto **infraKring**, com **produção viva de outro
projeto** rodando nela agora. O jogo entra como inquilino, não como dono (`D-VPS-02`).

Estado medido em 2026-09-09, por `ssh dg2vps`:

| Item | Valor medido |
|---|---|
| Sistema | Debian 13 (trixie), cgroup **v2** |
| CPU | 2 vCPU |
| Memória | ~7,9 GiB, com ~5,8 GiB disponíveis |
| Disco | ~85 GB livres (ocupação em ~11%) |
| Docker | 29.6.0 |
| Docker Compose | v5.1.4 |
| Coolify | 4.3.18 |
| Traefik | v3.6 — **dono de 80 e 443**, TCP e UDP, em contêiner do infraKring |
| coturn disponível no apt | 4.6.1-2 (não 4.17; ver `ops/README.md`) |
| Ausentes na caixa | Node, `rsync`, `litestream`, `coturn` |

**Todo comando de Docker leva `sudo`** (`DM-17`). O usuário de deploy tem `sudo` sem senha mas
**não** está no grupo `docker` — uma decisão razoável do infraKring, porque estar naquele grupo
equivale a ser root, e que **não se mexe**. Na prática: `sudo docker ps`, `sudo docker images`,
`sudo docker logs`. Quem esquece tropeça no primeiro comando com "permission denied" e perde
tempo achando que é problema de Docker.

**O painel do Coolify não é alcançável da internet** (`DM-7`, medido: 8000 e 8080 dão timeout de
fora, por decisão do próprio infraKring). Chega-se a ele por túnel SSH. É esse fato, e só ele,
que torna o disparo do deploy manual nesta fase (`D2-32`).

## A regra de ouro

**Toda alteração no host é aditiva e confirmada antes** (`D-VPS-02`). Não há exceção, e a lista
do que esta fase e a fase 3 alteram na caixa é **fechada**:

1. `3478/udp` — STUN e TURN sobre UDP
2. `3478/tcp` — o mesmo sobre TCP
3. `5349/tcp` — TURN sobre TLS (declarado, ainda não servido)
4. `49200:49299/udp` — a faixa de relay de `D2-27`, declarada em `ops/turnserver.conf`

**Nada mais.** Nenhuma configuração do Coolify, do Traefik ou do Docker do vizinho é tocada;
nenhum token de API é criado; nenhuma regra existente é removida ou reordenada. As quatro são
inertes enquanto o coturn não estiver instalado, que é precisamente por que abri-las agora é
barato e esquecê-las é caro: o plano `03-11` depende delas e descobriria a falta em teste de
aceitação, com o sintoma "um amigo específico nunca entra".

## Riscos herdados, registrados e não corrigidos

Dois achados de segurança do infraKring, **do vizinho e não nossos**, que ficam como observação
por `D-VPS-02`. Estão aqui porque são **causa possível de incidente** — um leitor futuro precisa
poder nomeá-los em vez de redescobri-los numa noite ruim.

1. **A porta 8080 do Traefik está publicada em todas as interfaces e fora da lista do
   `coolify-lockdown.sh`** daquele projeto (a lista cobre 8000, 6001 e 6002). Hoje ela está
   protegida por acidente, não por projeto.
2. **O `coolify-lockdown.service` está `inactive (dead)`.** Consequência concreta: um reinício
   do Docker **sem** reboot apagaria as regras de `DOCKER-USER` até o próximo boot, porque é o
   boot que as reinstala.

Por que isto é nosso problema mesmo sendo deles: o caminho de publicação do jogo passa pelo
painel do Coolify. Se a alcançabilidade daquele painel mudar por configuração de outro projeto,
o sintoma chega aqui como **"o deploy parou de funcionar"**, e a causa não está em nada que este
repositório versiona (`C-8`).

## Variáveis do app no painel do Coolify

Os **nomes**, sem valores. O compose do repositório diz **quais** chaves existem; o painel diz
**o que elas valem** (`D2-29`).

| Variável | O que é |
|---|---|
| `DG2_IMAGE_TAG` | a tag da imagem — sha de commit de 40 hexadecimais, nunca uma tag móvel (`C-6`). **Obrigatória**: vazia, o deploy falha na interpolação nomeando a variável |
| `DG2_DB` | caminho do arquivo do banco dentro do volume persistente |
| `DG2_PORT` | a porta interna do servidor, dentro do contêiner |
| `DG2_BIND` | o bind interno. Vale `0.0.0.0` no compose e **não** é um buraco: porta de contêiner sem publicação não atravessa o UFW nem o NAT (`DM-9`) |
| `DG2_RELEASE` | o que `/api/health` devolve no campo `release`; alimentado a partir da tag da imagem |
| `DG2_ORIGIN` | a origem que o servidor aceita |
| `DG2_TURN_SECRET` | a metade Node do par de segredo do relay |
| `DG2_TURN_REALM` | o realm do relay |
| o caminho da réplica do Litestream | **o nome desta variável é fixado no plano 02-14**, junto com os dois volumes persistentes. Não o invente aqui |

**Não existe variável de bucket, e isso é decisão e não esquecimento (`D2-33`, 2026-09-10).** A
réplica contínua do Litestream sobrevive inteira — o `replicate -exec`, o repasse de sinal medido
em `DM-13` e o `stop_grace_period` de 30s continuam idênticos. O que mudou é só o **destino**: de
bucket S3-compatível para um **caminho da própria caixa**, que o Litestream 0.5 suporta como tipo
de réplica `file`. Em consequência, quatro variáveis que este documento listava **deixaram de
existir antes de nascerem**: `LITESTREAM_BUCKET`, `LITESTREAM_ENDPOINT`, `AWS_ACCESS_KEY_ID` e
`AWS_SECRET_ACCESS_KEY`. Nenhum bucket foi criado; nenhuma credencial de provedor existe.

**O que isso custa, escrito antes de alguém verificar: a garantia off-site caiu.** A réplica
protege contra corrupção do banco, migração ruim e deploy errado. Ela **não** protege contra
perder a caixa — se o disco morrer, a réplica morre com ele, a menos que alguém a tenha puxado
pelo túnel recentemente. É escolha registrada, não descuido, e tem uma consequência de projeto:
a tarefa **T9 do infraKring** (backup off-site) **deixa de ser fechada por esta fase**.

**A armadilha que anda junto com essa escolha.** O caminho da réplica **tem de viver num volume
persistente** do Coolify, como o do banco. Numa camada de contêiner, a réplica é apagada no
primeiro redeploy e o backup desaparece **sem avisar** — o pior modo de falha possível para um
backup, porque ele continua parecendo existir. O plano 02-14 declara os dois volumes e o 02-12
prova que a réplica sobreviveu a um redeploy.

**`D2-29` tirou de `/etc/dg2/env` a condição de lugar único dos segredos**, e isso tem um preço
que precisa estar escrito em voz alta: o `static-auth-secret` do relay passa a existir em **dois
lugares de naturezas diferentes** — um arquivo no host (`/etc/turnserver.conf`, root, 0600) e um
painel web. Trocar num só faz o relay recusar **toda** credencial que receber, e o sintoma é o
mesmo de sempre: **"um amigo específico nunca entra"**, indistinguível de NAT ruim. As duas
metades andam juntas, sempre.

## Publicar e reverter

A forma do disparo foi decidida na Task 1 do plano 02-04, opção **`clique-painel`**: o operador
abre o túnel SSH até o painel do Coolify e promove a versão à mão. A alternativa (um script local
que falasse com a API do Coolify pela porta encaminhada) foi **recusada** porque exigiria criar um
token de API, que é um registro novo na instância que o infraKring opera — e `D-VPS-02` ganha de
preservar a letra do roadmap. Consequência registrada:

> o critério 4 fecha nesta fase como um procedimento documentado e reversível, não como um
> comando, por decisão de D2-32

**O que continua automático, e é a metade que importa:** o integrador constrói a imagem e a
publica no registro a cada push na `main` que passe nos portões (`D2-23`). O que deixou de ser
automático é só o **disparo** da promoção (`D2-08` fica suspensa nesta fase). Nenhum segredo de
deploy existe: nem `DEPLOY_SSH_KEY`, nem `DEPLOY_HOST`, nem `DEPLOY_USER`, nem
`DEPLOY_KNOWN_HOSTS`, nem `DEPLOY_ENABLED` — `D2-32` os apagou antes de nascerem.

**Procedimento de publicação** (documentado aqui; a prova de execução é do plano 02-12):

1. **Empurrar a `main` para o GitHub.** Não é higiene, é pré-requisito: ver a pegadinha 1 abaixo.
2. Confirmar que o integrador publicou a imagem da tag desejada.
3. Abrir o túnel SSH até o painel do Coolify.
4. No recurso do jogo, ajustar `DG2_IMAGE_TAG` para o sha desejado e disparar o deploy. O passo
   não tem atalho: dar-lhe um padrão foi tentado em 2026-09-10 e derrubou a produção, porque
   referenciar `SOURCE_COMMIT` na composição faz o Coolify criar a variável vazia que suprime a
   injeção do commit de verdade.
5. Conferir que o campo `release` de `/api/health` passou a ser **byte a byte** aquele sha. É a
   diferença entre "o deploy foi disparado" e "a versão nova está no ar".

### Duas pegadinhas medidas no primeiro deploy, 2026-09-09

Ambas custaram uma tentativa perdida, e ambas têm sintoma que aponta para o lugar errado.

1. **O recurso do Coolify lê o GitHub, não esta máquina.** A primeira tentativa listou **zero
   serviços**, e a causa não era o Coolify: `origin/main` estava **113 commits atrás** do local, e
   `ops/probe/docker-compose.yml` só existia aqui. O clone que o Coolify fez não tinha o arquivo.
   O sintoma — "nenhum serviço descoberto" — é indistinguível de "o Coolify não suporta esta
   composição", que é exatamente a conclusão errada que faria o plano 02-14 mudar de forma sem
   motivo. **Publicar antes de mandar o Coolify reler** é passo obrigatório, não recomendação.
   Resolvido empurrando `3f25a68..0608fee`.
2. **O campo de domínio já põe o esquema.** Digitar a URL completa produziu `https://https://…` e
   o erro `Invalid URL … The hostname must be a fully qualified domain name`. **O valor que
   funciona é só o hostname**, sem `https://`. A localização exata do campo no painel **não está
   registrada** — quem executou não a informou, e inventá-la seria pior que deixá-la em branco.
   Lacuna a preencher no 02-12.

**Reverter é apontar para a imagem anterior, que já está no disco** (`D2-24`). O mesmo
procedimento com o sha anterior, e `pull_policy: missing` no compose garante que voltar **não
usa rede**: o Docker só busca no registro o que não estiver em disco, e no cenário em que a
reversão é necessária a rede é justamente o que pode estar ruim.

**Retenção: 5 imagens por serviço**, herdada do `prune-releases.sh` aposentado. É continuidade
de operação, não um número novo.

**A degradação honesta, e ela é real — e hoje ela está NÃO-VERIFICADA.** O symlink de release que
`D2-06` previa era uma garantia **estrutural**: o diretório está lá ou não está. A imagem local é
uma garantia **probabilística**, dependente de uma rotina de limpeza que **este projeto não
controla** — ela é configuração do servidor, compartilhada com o vizinho. E a leitura dessa
configuração **não foi feita** (ver a seção seguinte), então a afirmação de `D2-24` de que a
imagem anterior "já está no disco" é hoje uma **suposição, não um fato medido**. O plano 02-12
exercita a reversão de verdade; é lá que isso aparece, se aparecer.

## Limpeza automática de imagens do servidor

**DECLARADAMENTE VAZIA — não lida, por decisão, em 2026-09-10.**

O passo existia no plano 02-04 (ler, sem alterar, o gatilho e o agendamento da limpeza automática
de imagens em `Servers → o servidor → Configuration → Advanced`, mais a ocupação do disco) e
**não foi executado**: Gustavo decidiu não se preocupar com isso agora. A seção fica aqui vazia
com o motivo e a data em vez de ser apagada, porque apagá-la transformaria uma lacuna conhecida
numa lacuna invisível.

**A consequência, sem inventar tarefa para ela:** `D2-24` afirma que reverter é apontar para a
imagem anterior "que já está no disco". Com a configuração de limpeza não lida, isso está
**não-verificado** — se o gatilho do Coolify for agressivo, pode simplesmente não haver imagem
anterior no dia em que a reversão for necessária, que é o modo de falha que `C-3` descreve. O
plano 02-12 exercita a reversão contra a caixa e é ele quem transforma isso em fato, em qualquer
das duas direções.

## Primeiro certificado e prova de A1

**A1 PROVADA, e o primeiro certificado válido existe. 2026-09-09, 23:24:34 a 23:24:51.**

O que o log do primeiro deploy do Coolify mostra, e o que cada linha prova:

- `Docker 29.6.0 with BuildKit and Buildx detected on deployment server (localhost)` — a caixa
  medida, confirmada pelo próprio deploy.
- Importou `gustavoktausend/DungeonGuys2:main` no commit `0608fee` — **exatamente** o commit da
  Task 2 deste plano, que é o que traz `ops/probe/docker-compose.yml`.
- `Image caddy:2.11.4-alpine Pulling` → `Pulled`, **duas vezes, uma por serviço**. **Foi `pull`,
  não `build`** — `C-7` satisfeito: o Coolify **não** injeta construção sobre uma composição que
  não declara build. A linha `Adding build arguments to Docker Compose build command` é
  boilerplate do Coolify; nenhuma camada foi construída.
- **Os dois contêineres subiram**, `Created` → `Started`:
  `web-oagwo5ol1daqeyzcogxo84hs-232441691653` e `api-oagwo5ol1daqeyzcogxo84hs-232441692904`.

**Esta é a prova literal de A1:** o Coolify aceitou uma composição de **dois serviços** vinda do
repositório público, descobriu os dois, e permitiu atribuir o domínio ao serviço `web`. A
alternativa custeada pela pesquisa — "Docker Compose Empty", colar o YAML no painel ao custo de
`D2-15` para aquele arquivo — **não é necessária**. O plano 02-14 mantém a forma planejada.

**O certificado, medido de fora depois do redeploy:** resposta **200 por HTTPS**, com cadeia
válida emitida pelo **Let's Encrypt** (`C=US, O=Let's Encrypt, CN=YR2`), válida de **2026-09-09
22:40:52 GMT** até **2026-12-08 22:40:51 GMT**. O HTTP responde **302 para HTTPS**. Antes disso
a resposta era **503 com o `TRAEFIK DEFAULT CERT` autoassinado** do catchall, que é o estado que
`DM-18` mediu: **o catchall morreu**. É a metade não fechada de `INFRA-01`, agora fechada.

A saída do `openssl` **não** é colada aqui de propósito: o campo `subject=CN=` dela **é** o
domínio, e `D2-15` não abre exceção para prova de execução. O fato é o que conta, e o fato é que
o certificado é válido, é do Let's Encrypt e **expira em 2026-12-08**.

## Firewall do coturn

**AS QUATRO REGRAS ESTÃO ABERTAS, em IPv4 e IPv6. 2026-09-09.**

Confirmadas com o operador **antes** de serem abertas (`D-VPS-02`), e abertas por ele com `sudo`.
`sudo ufw status numbered` passou de 3 regras base (22, 80, 443) para **14 regras**. As quatro
novas existem em **ambas as famílias de endereço** — o que importa, porque o acesso residencial
brasileiro passou de metade em IPv6 e uma regra só-v4 deixaria a metade moderna do tráfego de
fora. Cada uma levou comentário:

| Regra | Comentário na caixa |
|---|---|
| `3478/udp` | `coturn STUN/TURN` |
| `3478/tcp` | `coturn STUN/TURN` |
| `5349/tcp` | `coturn TLS` |
| `49200:49299/udp` | `coturn relay range` |

**A faixa aberta é exatamente a faixa declarada em `ops/turnserver.conf`** — `49200` a `49299`,
cem portas — e `total-quota` desceu para 100 para casar com ela. Uma metade sem a outra não vale
nada (`C-5`): faixa declarada e não aberta fica bloqueada pelo `deny incoming`; faixa aberta e
não declarada não é onde o relay aloca. As duas metades estão feitas, e `tests/ops-config.test.ts`
calcula o limite da cota a partir da própria faixa, para que mudar uma e esquecer a outra fique
vermelho.

**Isto remove a dependência que o plano `03-11` da fase 3 havia ganhado.** É nesta seção que a
fase 3 deve olhar: o `03-11` **verifica** que as quatro regras continuam abertas, em vez de
reabrir às cegas só as três portas base — que é o que o `user_setup` dele ainda manda fazer, e o
ajuste continua pendente. As regras são inertes enquanto o coturn não estiver instalado, que é
precisamente por que abri-las agora foi barato.

## Primeira promoção real — 2026-09-10

**Executada.** O jogo passou a servir do domínio próprio às 19:34 UTC, commit
`9cba5c9b06e406c6ab04d5b46f290f0463d5b623`. Toda saída abaixo é colada; onde ela carregava o
domínio, ele está trocado por `<DOMINIO>` e a troca está anotada aqui em vez de a linha sumir.

### Quatro tentativas, três falhas, e as três causas

O registro só vale se disser o que deu errado. A composição de prova do 02-04 foi removida pelo
primeiro deploy e nada a substituiu, então o domínio ficou em **503 entre 18:36 e 19:34**.

| # | hora UTC | commit | erro | causa |
|---|---|---|---|---|
| 14 | 18:36 | `e9079df` | `invalid reference format` | `DG2_IMAGE_TAG` vazia no painel. A forma `${VAR}` simples rende `image: '...:'`, e o daemon responde sem nomear nada |
| 15 | 19:10 | `849c1d2` | `invalid reference format` | tentativa de dar um padrão à tag, com `${DG2_IMAGE_TAG:-${SOURCE_COMMIT}}` |
| 16 | 19:27 | `9c40f1c` | `no service selected` | `: ` na mensagem da variável obrigatória quebrou o YAML |
| 17 | 19:34 | `9cba5c9` | — | **finished** |

**A causa do 15 é a que vale registrar, porque a ideia parece boa e se anula sozinha.** Todo
`${VAR}` da composição vira campo no painel (`D2-29`). Referenciar `${SOURCE_COMMIT}` faz o
Coolify **criar** uma variável vazia com esse nome — e o job de deploy dele injeta o commit de
verdade **só quando a aplicação não tem variável assim**. A referência cria a linha; a linha
suprime a injeção; a injeção era o objetivo inteiro. Lido na fonte do Coolify na caixa e
confirmado no banco dele. **Não tente de novo:** a tag é digitada à mão, e a alavanca de `D2-24`
é justamente essa digitação.

A causa do 16 foi de método, e mais barata de contar do que de repetir: a forma `:?` foi medida
num arquivo isolado onde o valor estava **entre aspas**, e aplicada sem aspas no arquivo real.
Dois-pontos seguido de espaço, num escalar YAML sem aspas, é indicador de mapeamento:

```
yaml: line 96, column 83: mapping values are not allowed in this context
```

**E os 65 testes passaram.** Todo o bloco da composição a lia por regex, e regex aceita um arquivo
que nenhum parser de YAML aceita. Corrigido: `yaml` entrou como devDependency e o primeiro caso do
bloco parseia a composição e exige encontrar `api` e `web`.

### Os pacotes do registro, puxados da caixa sem credencial

Confirmado antes do deploy que **não existe** `~/.docker/config.json` do usuário de deploy nem
`/root/.docker/config.json`. Com isso, da caixa:

```
dg2-web  Digest: sha256:97e503dd92bed819e8a2f3b066aa2284b88670c4ef1ddf9cdfdea8a11395007e    2s
dg2-api  Digest: sha256:e103d809c416a6d13650314992f222d6d8baa3ddfa87f0a85a94c4996fa3669a   21s
```

A visibilidade pública também foi verificada de fora, com token anônimo do registro: manifesto
HTTP 200 para os dois pacotes, sem nenhuma credencial.

### O deploy: `pull` e nunca `build`

```
time="2026-09-10T19:35:04Z" level=warning msg="No services to build"
Image ghcr.io/gustavoktausend/dg2-web:9cba5c9b06e406c6ab04d5b46f290f0463d5b623 Pulling
Image ghcr.io/gustavoktausend/dg2-api:9cba5c9b06e406c6ab04d5b46f290f0463d5b623 Pulling
Volume oagwo5ol1daqeyzcogxo84hs_dg2-data     Created
Volume oagwo5ol1daqeyzcogxo84hs_dg2-replica  Created
Container api-… Created → Container web-… Created → api-… Started → web-… Started
```

`C-7` fecha: nenhum build foi injetado. Os **dois volumes persistentes** nasceram, que é a
asserção nova de `D2-33` — a réplica não caiu numa camada de contêiner. A ordem respeitou o
`depends_on`.

**Quais serviços o `up -d` recriou: os dois — mas esta medição NÃO confirma a previsão do plano
02-14.** Este deploy partiu do zero, com os contêineres da composição de prova já removidos, então
recriar ambos era inevitável. A previsão de que *todo* deploy recria os dois, inclusive um que só
mexeu no cliente, só se testa num deploy subsequente que mude apenas a tag — e esse deploy é o da
reversão, que está na lista de pendências abaixo. **Item de discrição ainda em aberto.**

### O deploy pegou (o passo que prova que os bytes certos estão servindo)

```
$ curl -sS https://<DOMINIO>/api/health
{"status":"ok","db":true,"release":"9cba5c9b06e406c6ab04d5b46f290f0463d5b623"}
```

Byte a byte o sha publicado. E `"db":true` é a prova da migração: a sonda de `apps/server/src/health.ts`
**conta linhas em `kysely_migration`**, então um `true` na primeira requisição externa diz que a
migração rodou antes de a primeira requisição ser aceita. É estrutural, não uma linha de log.

**O boot registrou o estado de relay ausente, que é suportado e não um erro:**

```
{"event":"turn-disabled","detail":"DG2_TURN_SECRET ausente — ICE será emitido só com STUN, sem relay"}
```

Esse estado só é alcançável porque a composição **não declara** o par de relay. Declarado com
interpolação, o Compose entrega a chave presente-e-vazia, e `optional()` recusa em branco de
propósito — o servidor não subiria em configuração nenhuma. A composição carrega a medição.

### O certificado

```
issuer=C=US, O=Let's Encrypt, CN=YR2
subject=CN=<DOMINIO>
notBefore=Sep  9 22:40:52 2026 GMT
notAfter =Dec  8 22:40:51 2026 GMT
```

Emitido pelo ACME do Traefik do vizinho; a raiz responde 200 por HTTPS e o redirecionamento de
HTTP devolve 302 para HTTPS. **É o mesmo certificado da composição de prova do 02-04** — a
promoção não arrancou um novo, e não precisava: o hostname não mudou.

### Os três `Cache-Control` contra o domínio real — a suposição A10, CONFIRMADA

O Traefik do vizinho **não reescreve** a política de cache. Medido de fora, contra o domínio:

| Recurso | `Cache-Control` observado |
|---|---|
| ativo com hash de conteúdo (`/assets/index-*.js` e `.css`) | `public, max-age=31536000, immutable` |
| nome estável (`/icons/icon-192.png`) | `public, max-age=0, must-revalidate` |
| índice (`/`) | `no-cache` |
| `/manifest.json` | `no-cache` |

**`A10` deixa de ser suposição.** Se o Traefik reescrevesse qualquer um dos três, `INFRA-02` e
`INFRA-03` passariam a depender de uma correção que ninguém planejou.

Os quatro cabeçalhos de segurança também atravessam intactos, e chegam **inclusive no 503** —
`Content-Security-Policy`, `Strict-Transport-Security`, `Referrer-Policy` e
`X-Content-Type-Options`, com `Via: 1.1 Caddy` provando que o nosso Caddy está na cadeia.

### 404 honesto

```
HTTP/1.1 404 Not Found
Content-Type: text/plain; charset=utf-8
Content-Length: 13

404 Not Found
```

O corpo **não** é o índice, que é o que `DM-5` exige: um 404 que devolvesse o índice com 200 faria
o service worker cachear uma página errada.

### 503 legível por máquina, com o servidor parado

Contêiner do `api` parado por ~40 s e subido de volta:

```
GET /                     -> 200      o estático continua no ar
GET /assets/index-*.js    -> 200
GET /api/health           -> 503      {"status":"unavailable"}   Content-Type: application/json
```

É o corpo que o monitor externo vai consumir por keyword. O `api` voltou em 8 s, `healthy`, com o
`release` correto.

### O vizinho, antes e depois

`D-VPS-02` exige conferir. Linha de base tirada antes da primeira tentativa, releitura após o
deploy 17 e após o teste de 503:

| Item | Antes | Depois |
|---|---|---|
| Apps do infraKring | `Up 2 months` | `Up 2 months` — uptime não quebrou |
| Stack do Coolify (6 contêineres) | todos `healthy` | todos `healthy` |
| Load average | 0,73 / 0,75 / 0,58 | 0,65 / 0,68 / 0,51 |
| RAM disponível | 5732 MB | 5683 MB (−49 MB) |
| Disco usado | 9,2 G de 99 G | 9,9 G de 99 G (+0,7 G, as duas imagens) |

Os limites da composição (96 MB no `web`, 320 MB no `api`) explicam a diferença de memória com
folga. Nada do vizinho foi tocado, parado ou reconfigurado.

### Imagens em disco, contra a retenção de 5

```
ghcr.io/gustavoktausend/dg2-api:9cba5c9…   532MB
ghcr.io/gustavoktausend/dg2-web:9cba5c9…   89.1MB
ghcr.io/gustavoktausend/dg2-api:e9079df…   532MB
ghcr.io/gustavoktausend/dg2-web:e9079df…   89.1MB
```

**Duas tags por serviço**, que é o mínimo que a reversão de `D2-24` exige. Contra a retenção de 5
fixada no runbook há folga, e a limpeza automática do servidor não removeu nada no intervalo
observado. A imagem anterior está em disco — o que ainda **não** foi provado é que ela sobe com o
registro inalcançável (ver pendências).

## CSP e PWA contra o domínio real

**Sessão de 2026-09-14**, contra o domínio de produção, num perfil de navegador que nunca o havia
visitado. Fecha as duas metades do critério 2 que não dependem de uma segunda imagem: o CSP deixa
de ser derivado-da-fonte e passa a ser **observado**, e a instalação limpa do PWA deixa de ser uma
suíte verde sobre `dist/` local e passa a ser um jogo que abre com a rede desligada, servido pela
VPS através do Traefik.

**Sha observado:** `9cba5c9b06e406c6ab04d5b46f290f0463d5b623` — o mesmo que o plano 02-12 promoveu.
Ninguém promoveu nada no intervalo.

### Esta seção distingue o que foi medido do que foi atestado, e a distinção é deliberada

A regra do topo desta página é que só entra o que foi executado, com a saída colada. Um navegador
não deixa saída colável do mesmo jeito que um `curl` deixa: o console, o painel de aplicação e o
teste com o cabo desligado são vistos por uma pessoa. Registrar a palavra dela **como se fosse**
saída de comando seria falsificar a forma da evidência, mesmo com o conteúdo certo. Então os dois
blocos abaixo são rotulados.

### Medido, com a saída colada

O `Content-Security-Policy` que o domínio serve, e a diretiva que `ops/Caddyfile` escreve,
comparados caractere a caractere:

```
$ curl -sS -D - -o /dev/null https://<DOMINIO>/ | grep -i '^content-security-policy'
Content-Security-Policy: default-src 'self'; img-src 'self'; font-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'

$ grep -n "Content-Security-Policy" ops/Caddyfile
206:        Content-Security-Policy "default-src 'self'; img-src 'self'; font-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'"
```

**Idênticos.** Nada entre o Caddy e o cliente reescreve a política — o mesmo resultado que os três
`Cache-Control` deram para o cache, agora para a segurança. Se os dois textos tivessem diferido em
um caractere, **isso** seria o achado, e a diferença estaria escrita aqui.

O nome do cache que o build produz, reproduzido localmente a partir do commit que está servindo:

```
$ npm run build
sw precache: 13 arquivos, cache dg2-917996e0ac455823
```

**E uma medição que vale mais do que parece:** entre o deploy e esta sessão houve **cinco commits**
— `docs/OPERACAO.md`, `ops/README.md`, `tests/ops-config.test.ts`, os três planos de lacuna e os
arquivos de rastreamento — e o nome do cache **não mudou**, porque nenhum deles chega ao `dist/`.
O digest é `sha256` sobre caminho + bytes de cada arquivo do `dist/` menos o `sw.js`
(`tools/sw/emit.mjs:142-156`). Consequência operacional, medida em vez de suposta: **um commit só
de documento não produz atualização de PWA nenhuma.** Publicá-lo como "segunda imagem" faria o
navegador não ver nada, e a conclusão errada — "o aviso de atualização está quebrado" — seria
indistinguível da certa. É por isso que o plano 02-16 carrega uma correção de cliente de verdade.

### Atestado pelo operador na sessão de navegador

Estes são os fatos que só a pessoa no navegador podia ver. O operador aprovou a tarefa declarando
todos os critérios satisfeitos.

| Passo | Atestado |
|---|---|
| CSP durante uma partida | nenhum bloqueio no console, do primeiro byte ao fim da primeira wave |
| O que carregou | os dois spritesheets, as duas fontes `.woff2`, a chamada a `/api/health`; o som tocou |
| Quatro cabeçalhos | `Content-Security-Policy`, `X-Content-Type-Options`, `Referrer-Policy` e `Strict-Transport-Security` chegaram ao navegador |
| Instalação | o PWA instalou a partir do perfil limpo e abriu em janela própria |
| Service worker | `activated and is running`, escopo `/` |
| Cache Storage | **um** cache só, na forma `dg2-` + 16 hexadecimais |
| Isolamento de `/api/` | **nenhuma** entrada do cache começa com `/api/`, nem `/api/health`, que a página havia acabado de pedir |
| Offline | com a rede **fisicamente** desligada, a tela inicial renderizou e uma partida começou |

O isolamento de `/api/` é a metade de `INFRA-03` que só o domínio real podia mostrar: no teste
local o servidor é outro processo na mesma máquina; aqui a resposta atravessou o Traefik e o Caddy
antes de chegar ao service worker.

### A segunda imagem, e por que a comparação de nomes de cache existe

O plano 02-17 precisa observar, no navegador que já tem o PWA instalado, que o aviso de atualização
aparece. Esse aviso nasce de `updatefound`, que nasce de `sw.js` mudar de bytes, que nasce do
digest mudar, que nasce do `dist/` mudar. **Publicar uma imagem sem mudar o `dist/` seria queimar
um deploy da caixa real para medir o nada** — e o resultado, um navegador que não avisa nada,
seria indistinguível de um aviso quebrado.

Por isso a comparação é feita **antes** de publicar, e num build local, onde ela custa segundos:

```
$ npm run build            # antes da correção
sw precache: 13 arquivos, cache dg2-917996e0ac455823

$ npm run build            # depois da correção
sw precache: 13 arquivos, cache dg2-c49dfed53d8d49a8
```

O primeiro é o nome que o operador observou no navegador na sessão acima; o segundo é o que a
segunda imagem vai servir. **São diferentes, então há atualização para o 02-17 observar.**

A correção que produziu a diferença é verdadeira e não enchimento: `public/manifest.json` afirmava
`6 classes` e `CLASS_KEYS` tem **sete** (`mage`, `archer`, `warrior`, `ninja`, `priestess`,
`witch`, `coprobo`). O número aparece no prompt de instalação do PWA, então estava errado no lugar
mais visível que existe. As `16 waves` da mesma frase foram conferidas e estão certas — os bosses
de ato ficam nas waves 8 e 16. O `start_url` e o `scope` não foram tocados: `tests/build-base.test.ts`
os assere, e por bom motivo.

### O que esta sessão NÃO prova

Escrito porque a regra desta página manda, e porque um verificador que não achar estes limites vai
supor que eles foram cobertos.

- **Não prova iOS nem Safari.** A caixa de PWA em aparelho físico continua **aberta** em
  `docs/PARIDADE.md` por `D2-11`. Decisão registrada, não lacuna.
- **Não prova Firefox nem WebKit.** O Playwright só suporta service worker em **Chromium**, então
  a suíte automatizada também não os cobre. A sessão foi num navegador só.
- **Não prova a atualização a partir de instalação antiga.** Essa é a outra metade do gap 1, e ela
  precisa de uma segunda imagem de verdade — é o plano 02-17, e o perfil instalado nesta sessão é
  a "instalação antiga" de que ele depende.
- **Não prova o CSP para sempre.** Ele foi observado contra o `dist/` deste commit. Um recurso novo
  de uma família que a diretiva não autoriza — um `<style>` em markup, um arquivo de mídia, uma
  chamada a terceiro — passaria a ser bloqueado, e o teste que guarda isso é a derivação arquivo a
  arquivo em `ops/Caddyfile`, não esta sessão.

## Ensaio de restauração (D2-03)

**Executado em 2026-09-10.** Contêiner descartável da imagem em produção, os **dois** volumes
montados em somente-leitura, entrypoint sobrescrito para o Node:

```
$ sudo docker run --rm \
    -e DG2_REPLICA_PATH=/var/lib/dg2-replica/dg2 \
    -v oagwo5ol1daqeyzcogxo84hs_dg2-data:/var/lib/dg2:ro \
    -v oagwo5ol1daqeyzcogxo84hs_dg2-replica:/var/lib/dg2-replica:ro \
    --entrypoint node ghcr.io/gustavoktausend/dg2-api:9cba5c9… \
    /srv/tools/ops/restore-verify.mjs

restauração ok: gold_entry 0|0 confere com o vivo até rowid 0, 0 linha(s) de defasagem, em 0.1s
```

**Duração:** 713 ms de parede, dos quais 0,1 s de restauração propriamente dita. **Código de
saída:** 0. **Resíduo:** nenhum — `docker ps -a` não lista o contêiner descartável depois.

### O que faltou, escrito porque a regra desta página manda

**A comparação é vácua hoje, e contá-la como prova de dados seria mentira.** O ledger tem **zero
linhas**, então a linha verde diz que 0 confere com 0. O que este ensaio provou foi o
**mecanismo** — que a réplica existe no volume certo, que o litestream restaura a partir dela,
que a imagem traz as três ferramentas de que o script precisa, e que o ambiente limpo é
alcançável. O que ele **não** provou é que dados reais sobrevivem à volta, porque não há dados
reais. Refazer o ensaio depois da primeira partida com escrita no ledger é o que converte isso em
prova, e fica na lista de pendências abaixo.

### O defeito que o ensaio encontrou, e que existia no runbook

A **primeira** execução falhou:

```
tools/ops/restore-verify.mjs:/: litestream restore falhou:
Error: file replica path required
```

O comando documentado em `ops/README.md` §11 **não passava `DG2_REPLICA_PATH`**. A composição
entrega essa variável ao serviço `api`, mas um `docker run` avulso não herda nada dela, e o
litestream resolvia o destino para vazio. A mensagem fala de **configuração** e não de backup, o
que manda o leitor investigar o lugar errado. Corrigido no runbook, com uma asserção que compara o
comando ao valor que a composição declara — provada por remoção.

É exatamente o tipo de coisa que `D2-03` existe para pegar: um procedimento de restauração que
ninguém rodou é um procedimento que não funciona, e ninguém descobre até a noite em que importa.

### Prova de recusa

Um ensaio que só sabe passar não prova nada. Com o caminho da réplica apontado para um diretório
inexistente:

```
tools/ops/restore-verify.mjs:/: litestream restore falhou:
Error: no matching backup files available
código de saída: 1
```

Duas linhas — a forma `arquivo:ponteiro: mensagem` do contrato de `tools/README.md` §3, mais a
causa do litestream — e **nenhum stack trace**. A falha nomeia o que faltou.

### O que `D2-33` mudou aqui, e o que ele não mudou

A réplica passou a ser um caminho da própria caixa em vez de um bucket, então o ensaio roda **na
caixa**, sobre a réplica `file`. O texto literal do critério 4 — "o backup do banco foi
**restaurado** num ambiente limpo e o resultado da restauração está anotado" — **fecha**: o
ambiente limpo é um contêiner novo com os volumes montados somente para leitura. O que **não**
fecha é a garantia off-site, e isso está escrito em § Variáveis do app no painel do Coolify, onde
a decisão mora.

**A réplica sobreviveu ao redeploy**, que é a asserção extra de `D2-33`: os volumes
`…_dg2-data` e `…_dg2-replica` aparecem como `Created` no log do deploy 17 e continuam listados
depois, e o ensaio leu a réplica de dentro do segundo. Se o caminho tivesse caído numa camada de
contêiner, o ensaio passaria hoje e o backup desapareceria no próximo deploy, sem avisar.

## Monitor externo (D2-16/D2-21)

_(pendente — plano 02-12)_

**Adiado por escolha do operador em 2026-09-10, e continua pendente de propósito.** A palavra
acima não é resíduo de esqueleto: o monitor **não existe**, e apagar o marcador para deixar o
documento bonito seria exatamente o que a regra do topo desta página proíbe. Dono, prazo e
consequência estão em § O que continua aberto ao fim do plano 02-12, item 2. **A fase 02 fecha
INCOMPLETA por causa deste item e de mais dois.**

A entrada precisa ter: o **serviço escolhido**, a **rota monitorada**, a **keyword configurada**,
o **alerta de expiração de certificado com 30 dias** e a **data e hora da primeira checagem
verde** — e a da primeira **vermelha**, porque um monitor que nunca acusou é um monitor que
ninguém sabe se funciona.

**A rota e a keyword já estão medidas e prontas para colar no painel do serviço escolhido**, o que
reduz esse item a um cadastro: a rota é `/api/health`, ela devolve `{"status":"ok",…}` com o
serviço no ar e `{"status":"unavailable"}` com ele parado, e as duas respostas foram observadas
contra o domínio real em 2026-09-10 (ver § Primeira promoção real). A keyword a casar é o par de
`status` igual a `ok`.

**O primeiro prazo real já existe: o certificado emitido em 2026-09-09 expira em 2026-12-08.** Com
o limiar de 30 dias, o alarme deve soar por volta de **2026-11-08**. Se o monitor externo não
estiver configurado até lá, ninguém será avisado — e a renovação é do Traefik do vizinho, que este
projeto não controla nem observa de dentro.

**A perna local de `D2-16` morreu com o `cert-check` (`D2-30`)**, porque o certificado passou a
ser do Traefik e um timer nosso não tem o arquivo para ler. Isso significa que **o alarme de 30
dias mudou de dono**: ele mora agora no painel de um terceiro. Consequência prática para quem
trocar de serviço de monitoramento um dia — **o limiar de 30 dias vai junto**, ou o alarme
desaparece sem fazer barulho. O Let's Encrypt encerrou o aviso de expiração por e-mail em
junho de 2025; ninguém mais avisa de graça.

## O que continua aberto ao fim do plano 02-12 — com dono e condição de volta

Esta seção existe para que o verificador da fase **não trate decisão registrada como pendência, e
não trate pendência como decisão**. Os itens abaixo são de naturezas diferentes, e a diferença
está dita em cada um.

### Adiados por escolha do operador em 2026-09-10, e a fase 02 fecha INCOMPLETA por causa deles

O jogo está no ar, jogável, com a política HTTP verificada contra o domínio real. O que ficou de
fora foi adiado deliberadamente, e **cada um destes é um critério de sucesso da fase 02** — nenhum
deve ser lido como feito.

| # | Item | Critério que não fecha | Dono e condição de volta |
|---|---|---|---|
| 1 | **Reversão com o registro inalcançável** | critério 4, metade "reversível" | O operador, quando quiser exercer `D2-24`. Custa ~10 min: uma linha temporária de resolução de nomes na caixa, duas trocas de tag no painel, e a remoção verificada. **A imagem anterior JÁ está em disco** (duas tags por serviço), então só falta o exercício |
| 2 | **Monitor externo** | critério 4, metade "alguém avisa" | O operador, e **o prazo é 2026-11-08** (30 dias antes de o certificado expirar). Precisa de cadastro num serviço de terceiro que faça as duas coisas: keyword na rota de saúde e alerta de expiração de certificado |
| 3 | **CSP observado no navegador, PWA limpo offline, PWA atualizado** | critério 2, e a advertência do `ops/Caddyfile` | O operador, num navegador. O CSP continua **derivado da fonte e não observado** — a advertência que o `ops/Caddyfile` carrega desde o plano 02-03 **permanece de pé** |
| 4 | **Ensaio de restauração sobre dados reais** | nenhum — o critério 4 já fecha | Quem rodar a primeira partida que escreva no ledger. O ensaio de hoje comparou 0 com 0; refazê-lo depois é o que o torna prova de dados |
| 5 | **"Todo deploy recria os dois serviços"** | nenhum — é item de discrição | Sai de graça no primeiro deploy que mude só a tag, que é o item 1 acima |

**O que a ausência do item 2 significa concretamente:** entre agora e o dia em que alguém
configurar o monitor, **nada avisa** se o jogo cair. Não é só o certificado — a corrente de alarme
contra o crash-loop também depende dele, porque o Docker tenta reiniciar para sempre onde o
systemd chegava a `failed` e parava (perda declarada de `P-9`, `T-2-LOOP`). O `healthcheck` da
composição detecta, mas não conta a ninguém.

### Decisões registradas — NÃO são pendências

Estas aparecem como lacunas para quem lê rápido, e não são. Cada uma foi decidida, com o motivo
escrito no lugar onde a decisão mora.

- **PWA em aparelho físico iOS/Safari** permanece **aberto** em `docs/PARIDADE.md` por `D2-11`. O
  Playwright só suporta service worker em **Chromium**, então Firefox e WebKit também ficam de
  fora — não é só o aparelho físico. Lacuna nomeada, não esquecida.
- **`D2-08` fica suspensa nesta fase** por `D2-32`: o disparo do deploy é manual, e o critério 4
  fecha como procedimento documentado e reversível, não como um comando. A condição de volta está
  nomeada — automatizar o disparo volta à mesa quando houver motivo, e o motivo hoje não existe.
- **Garantia off-site do backup** caiu com `D2-33`: a réplica vive no mesmo disco do banco. Escolha
  registrada, com o custo escrito, e a tarefa **T9 do infraKring** deixa de ser fechada por esta
  fase.
- **A tag da imagem é digitada à mão**, e dar-lhe um padrão é impossível nesta plataforma — a
  medição está em § Primeira promoção real e no cabeçalho de `ops/docker-compose.yml`. Não é
  ergonomia por fazer; é uma porta fechada.
- **Riscos herdados do vizinho** (a 8080 publicada, o serviço de lockdown inativo) continuam **não
  corrigidos por decisão** de `D-VPS-02`, e estão em § Riscos herdados como causa possível de
  incidente.
