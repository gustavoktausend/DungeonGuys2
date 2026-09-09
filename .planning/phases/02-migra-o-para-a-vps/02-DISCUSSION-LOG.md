# Fase 2 — Log da discussão de 2026-09-09 (containerização)

**Para leitura humana.** Não é consumido por agente nenhum: quem planeja lê o `02-CONTEXT.md`.
Esta é a segunda discussão da fase 2. A primeira, de 2026-08-31, produziu `D2-01` a `D2-21` e
supunha uma VPS vazia. Esta produziu `D2-22` a `D2-31`, depois de a caixa existir.

## O que mudou entre as duas discussões

A caixa foi encontrada, acessada e inventariada em leitura. Ela **não estava vazia**: é o host
do projeto `infraKring`, com Coolify sobre Docker, Traefik ocupando 80 e 443 em TCP e UDP, e
produção viva de outro projeto em `militias3dstore.kring.tech`. Também é maior do que o
planejamento supunha — 8 GB de RAM contra os 2 GB de `D2-19`.

Três decisões foram tomadas fora desta discussão, no turno que a antecedeu, e estão em
`.planning/STATE.md`: o jogo vive em `dg2.kring.tech` (D-VPS-01), não se mexe no infraKring
(D-VPS-02), e o jogo vira um app do Coolify (D-VPS-03).

## Áreas discutidas

Quatro áreas foram oferecidas e o usuário escolheu **todas**.

### Área 1 — Onde o build acontece

**Pergunta:** quem constrói o artefato que vai para o ar?

| Opção | Escolhida |
|---|---|
| O integrador contínuo constrói a imagem e publica no registro; o Coolify puxa | **sim** |
| O Coolify constrói na caixa | não |
| O Coolify constrói, disparado pelo portão | não |

O que decidiu: `D2-05` diz que *o que é publicado é sempre o que passou no portão
cross-engine*, e deixar o Coolify construir a partir do git contornaria esse portão. Um segundo
argumento apareceu com o inventário: o build competiria por processador com a produção do outro
projeto na mesma caixa. Virou `D2-23`.

**Pergunta:** como reverter, já que `D2-06` exigia rollback com o GitHub fora do ar?

| Opção | Escolhida |
|---|---|
| Imagem anterior já no disco | **sim** |
| Rollback nativo do Coolify | não |
| As duas, com a segunda no runbook | não |

`D2-06` morreu com a containerização, mas o requisito que a justificava sobreviveu. Virou
`D2-24`, com uma pendência explícita para o planejador: quantas imagens ficam antes da poda.

### Área 2 — Quem serve os estáticos

**Pergunta:** dentro do contêiner, quem serve os arquivos do jogo?

| Opção | Escolhida |
|---|---|
| Caddy e Node como dois serviços de uma composição | **sim** |
| Caddy e Node no mesmo contêiner | não |
| Só o Node | não |

O que decidiu: o `Caddyfile` não é sobre TLS. Ele carrega a política de conteúdo derivada
arquivo por arquivo, as três classes de cache, a recusa de servir o índice em rota inexistente
e o 503 em JSON que o monitor externo consome. Reescrever isso seria o item mais caro da
migração. Virou `D2-25`.

### Área 3 — Onde o coturn roda

**Pergunta:** nativo, contêiner com rede do host, ou contêiner com portas mapeadas?

| Opção | Escolhida |
|---|---|
| Nativo no host, com systemd | **sim** |
| Contêiner com rede do host | não |
| Contêiner com portas mapeadas | não |

Aceita como exceção consciente ao modelo único de `D2-22`: o coturn é infraestrutura, não
produto, e precisa de uma faixa larga de portas sem tradução de endereço. Virou `D2-26`.

**Pergunta:** que tamanho tem a faixa de portas de relay?

| Opção | Escolhida |
|---|---|
| Faixa pequena, baixando a cota junto | **sim** |
| Mil e duzentas portas | não |
| A faixa padrão inteira | não |

Esta pergunta só existe porque o inventário achou um defeito: a configuração do coturn **não
declara faixa nenhuma**, e o runbook manda abrir só duas portas. Virou `D2-27`.

### Área 4 — Persistência, backup e segredos

**Pergunta:** onde o Litestream roda?

| Opção | Escolhida |
|---|---|
| Envolvendo o processo do servidor | **sim** |
| Contêiner separado no mesmo volume | não |
| Nativo no host, sobre o volume | não |

Virou `D2-28`. O argumento que pesou foi a janela em que o banco recebe escrita e ninguém
replica — para um ledger de moeda, é soul gold que some.

**Pergunta:** onde ficam os segredos?

| Opção | Escolhida |
|---|---|
| Painel do Coolify para o app, arquivo no host para o coturn | **sim** |
| Tudo em arquivo no host, montado | não |
| Tudo no painel do Coolify | não |

Virou `D2-29`, emendando `D2-15`. A consequência aceita: o segredo do relay passa a viver em
dois lugares de naturezas diferentes, um arquivo e um painel web, e o runbook tem de dizer isso
em voz alta.

## Decisões de fechamento

**Pergunta:** o que fazer com os arquivos de `ops/` que a containerização aposenta?
Escolhido: **apagar, mantendo só o que o coturn usa**. Virou `D2-30`. O argumento aceito foi que
um arquivo que ninguém executa e segue no repositório é uma armadilha para quem ler o runbook
daqui a seis meses, e que o histórico do git guarda tudo sem precisar do arquivo vivo.

**Pergunta:** o que substitui os quatro segredos de SSH que o plano 02-04 pedia?
Escolhido: **um gancho do Coolify, chamado pelo integrador**. Virou `D2-31`. Ganho registrado:
deixa de existir uma chave com escrita na caixa guardada em serviço de terceiro.

## Ideias adiadas nesta sessão

Todas registradas em `02-CONTEXT.md` § Deferred Ideas: os dois achados de segurança do
infraKring, a tarefa T9 daquele projeto, a remoção do app de teste `hello.kring.tech`, e o TLS
na porta 5349 do coturn.

## Discrição do Claude

Nada novo foi delegado nesta sessão. A lista de `02-CONTEXT.md` § Claude's Discretion continua
valendo no que não foi contradito; em particular, **quantas imagens ficam antes da poda**
(`D2-24`) e o **tamanho exato da faixa de relay** (`D2-27`) são números que o planejador escolhe
dentro das faixas discutidas aqui.
