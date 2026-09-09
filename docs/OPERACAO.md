# Operação da caixa

Aberto em: 2026-09-09 · plano 02-04 (fase 2) · decisões `D-VPS-01/02/03` e `D2-22`..`D2-32`.

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
| `DG2_IMAGE_TAG` | a tag da imagem — sha de commit de 40 hexadecimais, nunca uma tag móvel (`C-6`) |
| `DG2_DB` | caminho do arquivo do banco dentro do volume persistente |
| `DG2_PORT` | a porta interna do servidor, dentro do contêiner |
| `DG2_BIND` | o bind interno. Vale `0.0.0.0` no compose e **não** é um buraco: porta de contêiner sem publicação não atravessa o UFW nem o NAT (`DM-9`) |
| `DG2_RELEASE` | o que `/api/health` devolve no campo `release`; alimentado a partir da tag da imagem |
| `DG2_ORIGIN` | a origem que o servidor aceita |
| `DG2_TURN_SECRET` | a metade Node do par de segredo do relay |
| `DG2_TURN_REALM` | o realm do relay |
| `LITESTREAM_BUCKET` | o bucket da réplica |
| `LITESTREAM_ENDPOINT` | o endpoint S3 da região do bucket |
| `AWS_ACCESS_KEY_ID` | a chave de aplicação, limitada ao bucket — nunca uma chave de conta |
| `AWS_SECRET_ACCESS_KEY` | o segredo da chave acima, mostrado uma única vez pelo provedor |

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

1. Confirmar que o integrador publicou a imagem da tag desejada.
2. Abrir o túnel SSH até o painel do Coolify.
3. No recurso do jogo, ajustar `DG2_IMAGE_TAG` para o sha desejado e disparar o deploy.
4. Conferir que o campo `release` de `/api/health` passou a ser **byte a byte** aquele sha. É a
   diferença entre "o deploy foi disparado" e "a versão nova está no ar".

**Reverter é apontar para a imagem anterior, que já está no disco** (`D2-24`). O mesmo
procedimento com o sha anterior, e `pull_policy: missing` no compose garante que voltar **não
usa rede**: o Docker só busca no registro o que não estiver em disco, e no cenário em que a
reversão é necessária a rede é justamente o que pode estar ruim.

**Retenção: 5 imagens por serviço**, herdada do `prune-releases.sh` aposentado. É continuidade
de operação, não um número novo.

**A degradação honesta, e ela é real.** O symlink de release que `D2-06` previa era uma garantia
**estrutural**: o diretório está lá ou não está. A imagem local é uma garantia
**probabilística**, dependente de uma rotina de limpeza que **este projeto não controla** — ela é
configuração do servidor, compartilhada com o vizinho. A perda é de verdade e está escrita aqui
em vez de ser descoberta na noite em que importa.

## Limpeza automática de imagens do servidor

_(preenchido na Task 3 — leitura, sem alteração)_

A entrada precisa ter: o gatilho e o agendamento da limpeza automática de imagens lidos em
`Servers → o servidor → Configuration → Advanced`, a ocupação do disco no momento da leitura, e
a confirmação explícita de que a configuração **não** foi alterada — ela é do servidor e
compartilhada com o vizinho (`DM-16`, `C-3`). É o número que decide se a reversão de `D2-24` é
garantia ou aposta.

## Primeiro certificado e prova de A1

_(preenchido na Task 3)_

A entrada precisa ter: a confirmação de que o Coolify descobriu os **dois** serviços da
composição vinda do repositório e de que o domínio está atribuído ao serviço `web` (a prova
literal da suposição **A1**), a confirmação de que os logs do primeiro deploy mostram **`pull`**
e **não `build`** (`C-7`), e os cabeçalhos da resposta mais a cadeia do certificado mostrando
**200 com cadeia válida do Let's Encrypt** — em lugar do 503 com certificado autoassinado do
catchall que `DM-18` mediu. Qualquer atrito em um dos três passos vai anotado: se A1 falhar, o
plano 02-14 muda de forma e a alternativa custeada é colar o YAML no painel, ao custo de `D2-15`
para aquele arquivo.

## Firewall do coturn

_(preenchido na Task 3)_

A entrada precisa ter: a saída de `sudo ufw status` mostrando as **quatro** regras
(`3478/udp`, `3478/tcp`, `5349/tcp` e `49200:49299/udp`), a confirmação de que foram
**confirmadas antes de abertas** (`D-VPS-02`), e a anotação de que a faixa aberta é
**exatamente** a faixa declarada em `ops/turnserver.conf` — `49200` a `49299`.

Uma metade sem a outra não vale nada (`C-5`): faixa declarada e não aberta fica bloqueada pelo
`deny incoming`; faixa aberta e não declarada não é onde o relay aloca. O plano `03-11` **verifica**
esta seção em vez de reabrir as portas às cegas.

## Ensaio de restauração (D2-03)

_(pendente — plano 02-12)_

A entrada precisa ter: a **data** do ensaio, a **duração até restaurar**, e **o que faltou**.
"Ambiente limpo", que é o texto literal do critério 4 do roadmap, deixou de ser um diretório
descartável na mesma máquina e passou a ser um contêiner novo, com o volume montado somente para
leitura — mais honesto, e sem trabalho extra. Backup que nunca foi restaurado não é backup, e é
por isso que esta seção existe antes de ter conteúdo.

## Monitor externo (D2-16/D2-21)

_(pendente — plano 02-12)_

A entrada precisa ter: o **serviço escolhido**, a **rota monitorada**, a **keyword configurada**,
o **alerta de expiração de certificado com 30 dias** e a **data e hora da primeira checagem
verde**.

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
