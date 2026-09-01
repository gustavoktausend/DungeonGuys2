# `ops/` — a caixa, escrita em diff

Configuração e scripts da VPS que serve o DungeonGuys2. Nada aqui roda na máquina
de desenvolvimento: é o que a caixa executa, versionado para poder ser revisado
antes de existir.

Este diretório nasce sem precedente no repositório. As nove decisões abaixo ficam
registradas com o motivo, no mesmo espírito de `tools/README.md`: escritas para
quem um dia vai querer mudá-las, e não para quem já concorda.

---

## 1. O que mora aqui e por quê

`Caddyfile`, as units do systemd, os scripts de release e o de restauração ficam
**dentro do repositório** (D2-15). O ganho é duplo: mudança de infra vira diff
revisável, e reverter a configuração é a mesma operação que reverter o código.

O que **não** entra: nome de domínio, endereço de host, credencial, chave. Isso
vive em `/etc/dg2/env` na máquina e nos secrets do GitHub. A consequência
prática é a que interessa — **reconstruir a caixa é clonar este repositório mais
restaurar um arquivo de env** — e a consequência de segurança é que o
repositório nunca diz onde a máquina mora.

Os quatro scripts são POSIX `sh`, abrem com `set -eu`, e seguem o contrato de
falha de `tools/README.md` §3 traduzido para shell: erro vai para o stderr no
formato `script:ponteiro: mensagem` com saída 1, sucesso é **uma** linha no
stdout. Script que falha em silêncio não conta.

Eles estão no índice do git com o bit de execução (modo `100755`). Se algum dia
um deles aparecer como `100644` numa cópia de trabalho, `chmod +x` na instalação
resolve — mas o lugar certo de arrumar é o índice, porque um `command=` de
`authorized_keys` apontando para arquivo não executável falha com
"Permission denied" exatamente no primeiro deploy.

## 2. Layout de disco

| Caminho | O que é |
|---|---|
| `/srv/dg2/releases/<sha>/` | o `dist/` do cliente, um diretório imutável por commit |
| `/srv/dg2/server-releases/<sha>/` | o `server.mjs` empacotado do mesmo commit |
| `/srv/dg2/current` | symlink para o release vivo do cliente; é o `root` do `file_server` |
| `/srv/dg2/current-server` | symlink para o release vivo do servidor; é o `WorkingDirectory` de `dg2.service` |
| `/var/lib/dg2/` | o banco SQLite |
| `/srv/dg2/bin/` | onde os quatro scripts vivem na caixa |

O banco fica **fora da árvore de releases** de propósito (D2-07). É essa
assimetria que torna a reversão segura: mover os dois symlinks de volta move
código de volta e mais nada. A metade complementar — migração sempre aditiva,
nenhum `DROP` nem rename dentro da mesma versão — mora onde as migrações moram,
e sem ela esta metade não basta.

## 3. Pacotes e binários

- **`caddy`** do repositório oficial do Caddy, não o da distribuição — o pacote
  da distro costuma estar atrás, e é o TLS automático que está em jogo.
- **`rsync`** — o transporte do deploy.
- **`sqlite3`** — o script de verificação da restauração compara com ele.
- **Node 24 LTS** — a mesma linha que o CI usa. Publicar com um Node diferente do
  que passou no portão é o defeito que D2-05 existe para não ter.
- **Litestream 0.5.16**, binário do release do GitHub, mais uma unit própria.
- **`sudo`** — ver §4.

A caixa é Debian/Ubuntu com **cgroup v2**, que é o que faz `MemoryMax` e
`MemoryHigh` das units terem efeito. Debian 11+ e Ubuntu 22.04+ já vêm assim. Em
cgroup v1 os limites são aceitos e ignorados, que é a pior combinação possível.
A caixa é uma **KVM 2 (2 GB)** (D2-19).

## 4. Usuários

**`dg2`** — usuário de sistema, sem shell, dono do diretório de estado. É quem
`dg2.service` roda como. Não tem acesso SSH.

**`dg2-deploy`** — shell `/usr/sbin/nologin`, dono da árvore de releases e de
nada mais. A `authorized_keys` dele carrega **uma** linha:

```
command="/srv/dg2/bin/deploy-forced.sh",no-port-forwarding,no-agent-forwarding,no-pty,no-user-rc ssh-ed25519 AAAA... deploy@ci
```

O wrapper existe porque a **mesma** chave carrega o `rsync` e chama o
`deploy.sh`. Um `command="/srv/dg2/bin/deploy.sh"` ingênuo rodaria o deploy no
lugar do `rsync --server`, a transferência penduraria, e a tarde seria gasta
culpando a rede. `deploy-forced.sh` aceita exatamente dois formatos de
`SSH_ORIGINAL_COMMAND` e recusa o resto com saída 1.

Sem isso, uma chave privada guardada num CI de terceiro **é um shell nesta
caixa** — e de um shell até `/etc/dg2/env` são dois comandos.

`deploy.sh` precisa reiniciar a unit, e `dg2-deploy` não é root. O drop-in de
sudoers dá exatamente dois verbos, numa unit só, sem senha:

```
dg2-deploy ALL=(root) NOPASSWD: /usr/bin/systemctl restart dg2, /usr/bin/systemctl is-active --quiet dg2
```

Os scripts chamam `sudo -n`, que nunca abre prompt: uma regra faltando falha na
hora em vez de pendurar num terminal que não existe.

## 5. `/etc/dg2/env`

Dono `root`, `chmod 600`. Lido pelo systemd via `EnvironmentFile`, portanto
**antes** de o processo baixar privilégio — o usuário `dg2` nunca precisa poder
ler o arquivo.

Chaves, **sem nenhum valor** (e nenhum valor entra neste arquivo do
repositório, nunca):

| Chave | Para quê |
|---|---|
| `DG2_DOMAIN` | o endereço do site no `Caddyfile` |
| `DG2_UPSTREAM` | host:porta do processo Node, em loopback |
| `DG2_DB` | caminho do arquivo SQLite |
| `DG2_RELEASE` | o sha que está no ar, ecoado pelo `/api/health` |
| `LITESTREAM_BUCKET` | o bucket da réplica |
| `LITESTREAM_ENDPOINT` | o endpoint S3-compatível do bucket |
| `AWS_ACCESS_KEY_ID` | credencial da réplica, lida como `${AWS_ACCESS_KEY_ID}` |
| `AWS_SECRET_ACCESS_KEY` | credencial da réplica, lida como `${AWS_SECRET_ACCESS_KEY}` |

O `litestream.yml` versionado referencia as duas últimas por interpolação
(`${...}`), nunca por valor — e é por isso que as duas linhas acima escrevem a
forma interpolada em vez de só nomear a chave: **toda** ocorrência do nome de
uma credencial dentro de `ops/` traz o `${...}` junto, o que torna
`grep -rn 'AWS_SECRET_ACCESS_KEY' ops/ | grep -v '\${'` um detector de vazamento
que não depende de ninguém lembrar de rodá-lo com cuidado.

Do outro lado, nos **secrets do GitHub**: `DEPLOY_SSH_KEY`, `DEPLOY_HOST`,
`DEPLOY_USER` e `DEPLOY_KNOWN_HOSTS`. O último é o que permite manter a
verificação de host do SSH **ligada** no job — fixar o `known_hosts` num secret,
em vez de aceitar qualquer chave apresentada, é o que impede que um
man-in-the-middle vire um deploy.

## 6. Caddy e o drop-in de ambiente

O `Caddyfile` usa `{$DG2_DOMAIN}` no endereço do site. Essa forma é substituída
**antes do parse**, e é a única que funciona ali: a forma de runtime
(`{env....}`) é resolvida tarde demais e o site sobe amarrado a uma string
literal (P-6). Os valores chegam por um drop-in:

```
systemctl edit caddy
# [Service]
# EnvironmentFile=/etc/dg2/env
```

**A regra que morde:** `systemctl reload caddy` **não** relê o `EnvironmentFile`.
O reload roda dentro do ambiente do processo que já está de pé, relê a
configuração e mantém os valores antigos das variáveis. Trocar o domínio exige
`systemctl restart caddy`. A documentação do Caddy insiste em reload para não ter
downtime; as duas coisas são verdadeiras ao mesmo tempo, e é por isso que esta
linha está escrita em dois lugares — aqui e no cabeçalho do `Caddyfile`.

Não há valor padrão para a variável. Sem ela, o endereço do site fica vazio e o
Caddy recusa no parse: uma falha barulhenta no boot é melhor que uma caixa
servindo o jogo em silêncio sob o nome errado.

## 7. Publicar e reverter

O job de deploy do CI faz duas coisas, com a mesma chave:

1. `rsync -az --delete --link-dest=<absoluto> dist/ <user>@<host>:/srv/dg2/releases/<sha>/`
2. `ssh <user>@<host> /srv/dg2/bin/deploy.sh <sha>`

**`--link-dest` tem de ser caminho absoluto.** O `rsync` resolve um caminho
relativo contra o **destino**, então um `--link-dest=../current` funciona por
acidente em alguns layouts e, nos outros, deixa de deduplicar **sem erro
nenhum** (P-12). Confira uma vez, com `stat -c %h` num arquivo que não mudou
entre dois releases: contagem de links maior que 1 significa que o hardlink
aconteceu.

**Publicar é trocar um symlink, e a troca tem de ser atômica.** `ln -sfn` sobre
um symlink que já existe **não** é atômico: ele desfaz e recria, e dentro dessa
janela o caminho simplesmente não existe. Os scripts fazem `ln -sfn` num nome
temporário seguido de `mv -T`, que é `rename(2)`.

**O restart é condicional.** `deploy.sh` compara o `sha256` do `server.mjs` novo
com o do que está no ar e só reinicia a unit se eles diferirem, ou se a unit
estiver fora. O motivo é que o restart re-executa a migração, que é a única
operação do deploy capaz de falhar — não vale correr esse risco por uma mudança
de CSS.

**Reverter é `rollback.sh`**, sem argumento para o release anterior ou com um sha
para um específico. Ele não faz **nenhuma** chamada de rede, e isso é requisito
literal (D2-06): numa caixa só, sem homologação, a reversão é a única rede de
segurança, e a hora em que ela é chamada é exatamente a hora em que a
infraestrutura que serviria um artefato novo é o que acabou de falhar.

**Retenção: 5 releases** em cada raiz, podados por `prune-releases.sh`. O número
não é sobre disco (um release custa ~350 KB, e o `--link-dest` faz cinco
custarem quase um) — é "até onde eu reverteria", e 5 cobre uma tarde ruim. A
poda resolve os dois symlinks vivos antes de apagar qualquer coisa e nunca
remove o alvo que está no ar, mesmo quando ele cai fora dos 5 mais recentes —
que é precisamente o estado que uma reversão deixa para trás.

## 8. O que esta fase deliberadamente não tem

**Sem staging** (D2-14). Uma caixa, um domínio. A confiança mora na reversão de
§7 mais os portões do CI. Enquanto o jogo for single-player e o público for o
desenvolvedor, produção ainda é barata de quebrar — e é esse crédito que a fase
existe para gastar, antes de haver quatro amigos numa sala.

**Sem página HTML de manutenção.** O jogo é estático e continua no ar com o
processo Node fora; uma página de manutenção esconderia um jogo funcionando
atrás de um jogo quebrado. O que faltava não era uma página bonita, era um sinal
legível por máquina: o `handle_errors` do `Caddyfile` responde `503` com corpo
JSON genérico, e é isso que deixa o monitor externo distinguir "Caddy de pé,
Node fora" de "caixa fora".

**Sem stack trace na resposta.** O corpo de erro não carrega caminho, nem nome de
upstream, nem mensagem de exceção.

## 9. Agendado para a fase 3

A **porta 443 vai ser disputada**: o TURN sobre TLS quer 443/tcp para atravessar
firewall corporativo, e este servidor também. O `Caddyfile` desta fase não
resolve isso; a questão está no calendário, não esquecida.

O bloco `handle /ws` já existe no `Caddyfile`, sem consumidor, para que a forma
esteja visível em revisão desde agora. O Caddy faz upgrade de WebSocket através
do `reverse_proxy` sem módulo extra, então o bloco não precisa mudar quando o
signaling chegar.
