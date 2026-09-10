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

## Ensaio de restauração (D2-03)

_(pendente — plano 02-12)_

A entrada precisa ter: a **data** do ensaio, a **duração até restaurar**, e **o que faltou**.
Backup que nunca foi restaurado não é backup, e é por isso que esta seção existe antes de ter
conteúdo.

**O que `D2-33` mudou aqui, e o que ele não mudou.** A réplica passou a ser um caminho da própria
caixa em vez de um bucket, então o ensaio roda **na caixa**, em diretório descartável, sobre a
réplica `file`. O texto literal do critério 4 — "o backup do banco foi **restaurado** num ambiente
limpo e o resultado da restauração está anotado" — **continua fechando**: o ambiente limpo é um
contêiner novo com o volume montado somente para leitura, e `tools/ops/restore-verify.mjs` não
muda uma linha (mesma consulta, mesmo `-readonly`, mesma janela). O que **não** fecha é a garantia
off-site, e isso está escrito em § Variáveis do app no painel do Coolify, onde a decisão mora.

O 02-12 tem uma asserção a mais por causa de `D2-33`: **provar que a réplica sobreviveu a um
redeploy**. Se o caminho da réplica cair numa camada de contêiner em vez de num volume
persistente, o ensaio passa hoje e o backup desaparece no próximo deploy, sem avisar.

## Monitor externo (D2-16/D2-21)

_(pendente — plano 02-12)_

A entrada precisa ter: o **serviço escolhido**, a **rota monitorada**, a **keyword configurada**,
o **alerta de expiração de certificado com 30 dias** e a **data e hora da primeira checagem
verde**.

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

## O que esta fase deliberadamente não cobre

_(aberta ao fim da fase — D2-11)_

**PWA em aparelho físico iOS/Safari continua sem cobertura.** A verificação de instalação,
atualização e offline é só Playwright no CI (`D2-11`), e o Playwright **só suporta service worker
em Chromium** — então Firefox e WebKit também ficam de fora, não apenas o aparelho físico.

Consequência para quem verifica a fase: a caixa correspondente em `docs/PARIDADE.md` permanece
**aberta** ao fim desta fase, e o **critério 2** do roadmap deve ser lido com essa ressalva. Não é
um item esquecido — é uma lacuna nomeada, com o motivo escrito, que nenhum trabalho desta fase
fecha.
