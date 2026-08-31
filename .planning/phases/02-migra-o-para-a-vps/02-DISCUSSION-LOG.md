# Phase 2: Migração para a VPS - Discussion Log

> **Trilha de auditoria apenas.** Não usar como entrada para agentes de planejamento,
> pesquisa ou execução. As decisões estão em `02-CONTEXT.md` — este log preserva as
> alternativas que foram consideradas e recusadas.

**Date:** 2026-08-31
**Phase:** 2-Migração para a VPS
**Areas discussed:** Servidor e banco nesta fase; Caminho do deploy e reversão; PWA,
atualização e offline; Domínio, staging e vigilância

---

## Servidor e banco nesta fase

### O que sobe na VPS além do jogo estático?

| Opção | Descrição | Selecionada |
|--------|-------------|----------|
| Servidor mínimo com banco real | `apps/server` (Node + Hono, `/health`) e SQLite com o esquema já decidido pelos ADRs; INFRA-04 se cumpre literalmente | ✓ |
| Servidor mínimo, sem banco | Só `/health`; INFRA-04 vira backup do release e a restauração escorrega para a fase 6 | |
| Só estático atrás do Caddy | Nenhum processo Node; o primeiro subiria no mesmo dia da estreia da rede | |

**Notas:** o argumento decisivo foi a regra do roadmap — nunca migrar infra e estrear rede
na mesma semana. Sem banco, o critério "verificado restaurando" não teria objeto.

### Quanto do esquema dos ADRs é criado agora?

| Opção | Descrição | Selecionada |
|--------|-------------|----------|
| Só o ledger + o migrator | Migração 0001 cria a infraestrutura do Kysely e a tabela do ADR-0010; não colide com as tabelas que o Better Auth cria sozinho na fase 6 | ✓ |
| Ledger + perfil de jogador | Acrescenta `accountId`, `name` e `colors`, exigindo desenhar a FK para uma tabela `user` que ainda não existe | |
| Esquema inteiro dos ADRs | Perfil, ledger, runs, replay, temporada e placar de uma vez; tabelas especulativas por meses | |

**Notas:** o fato de o Better Auth trazer o próprio esquema (`user`, `session`, `account`,
`verification`) foi levantado durante a pergunta e mudou o peso das opções.

### Como a restauração do backup é verificada?

| Opção | Descrição | Selecionada |
|--------|-------------|----------|
| Script repetível + ensaio anotado | Script em `tools/ops/` restaura num diretório descartável e confere linhas e soma; rodado uma vez, com resultado registrado | ✓ |
| Runbook manual, uma vez | Documento com os comandos e o resultado; toda repetição é datilografia | |
| Timer recorrente com alerta | Systemd timer mensal; mais garantia no papel, mais uma coisa para quebrar em silêncio | |

### Como o servidor entra no monorepo?

| Opção | Descrição | Selecionada |
|--------|-------------|----------|
| `apps/server` nasce; o cliente fica na raiz | `workspaces` ganha `apps/*`; `src/`, `index.html` e `vite.config.ts` não se movem | ✓ |
| Simetria agora: `apps/web` + `apps/server` | Layout definitivo, mas concentra a mudança de `base` com a mudança de caminho no mesmo PR | |
| `server/` na raiz, sem workspace | Faria Hono e `better-sqlite3` caírem no `package.json` que declara `dependencies: {}` | |

**Notas:** resolve pela metade, de propósito, o adiamento de D-15 da fase 1.

---

## Caminho do deploy e reversão

### Quem constrói e quem empurra?

| Opção | Descrição | Selecionada |
|--------|-------------|----------|
| CI constrói, CI empurra por SSH | `deploy.yml` troca o Pages pela VPS; o publicado é sempre o que passou no portão cross-engine | ✓ |
| Script local `npm run deploy` | Nenhuma chave no GitHub, mas permite publicar código que nunca viu o CI | |
| A VPS puxa e constrói | Zero credencial cruzando fronteira, mas o `SIM_VERSION` por hash de bundle passaria a depender do ambiente da caixa | |

### Como o release fica disposto e como é revertido?

| Opção | Descrição | Selecionada |
|--------|-------------|----------|
| Releases datados + symlink `current` | Troca atômica; reverter é trocar de volta, sem rede e sem rebuild | ✓ |
| rsync sobre o mesmo diretório | Menos partes móveis, janela de arquivos meio-atualizados, reversão exige reconstruir | |
| Snapshot da Hostinger | Reverteria o banco junto — apagaria soul gold escrito depois do snapshot | |

### Onde a migração do SQLite roda?

| Opção | Descrição | Selecionada |
|--------|-------------|----------|
| No start do serviço, com regra de aditividade | Banco em `/var/lib/dg2`, fora da árvore de releases; nenhuma migração faz `DROP` na mesma versão | ✓ |
| Passo explícito do deploy | Falha de migração barra a publicação, mas um restart fora do deploy sobe código novo contra esquema velho | |
| Manual, quando houver migração | Modo de falha conhecido: esquecer, e quebrar num domingo | |

### O que dispara uma publicação?

| Opção | Descrição | Selecionada |
|--------|-------------|----------|
| Todo push na `main` que passar no CI | `main` é sempre o que está no ar; o symlink anterior é o commit anterior | ✓ |
| Só por tag de versão | Separa integrado de publicado, ao custo de cerimônia e de divergência acumulada | |
| Sempre manual (`workflow_dispatch`) | Controle total, mas um caminho pouco percorrido apodrece justamente para o dia do rollback | |

---

## PWA, atualização e offline

### Como uma versão nova chega ao jogador instalado?

| Opção | Descrição | Selecionada |
|--------|-------------|----------|
| Aviso na tela, aplicado só fora de partida | SW novo instala e espera; troca fora de run e, da fase 3 em diante, fora de sala | ✓ |
| Aplica sozinho no próximo boot | Sem UI nova, mas o jogador pode ficar dias atrás sem saber e sem poder forçar | |
| Continuar com `skipWaiting()` | O comportamento atual; está em "What NOT to Use" da pesquisa para jogo com multiplayer | |

**Notas:** é a contrapartida direta de D-08 da fase 1 (recusa de versão sem bypass).

### O que entra no precache?

| Opção | Descrição | Selecionada |
|--------|-------------|----------|
| Tudo, derivado do manifesto do build | Inclui `assets/index-<hash>.js/.css`; 350 KB compram offline completo na primeira instalação | ✓ |
| Mínimo, com cache preguiçoso | Instalação leve, mas "abre sem rede" passa a depender do hábito do jogador | |
| Precache do casco, assets preguiçosos | Meio-termo que só faz sentido depois da fase 7, quando a arte pesar | |

### Como instalação, atualização e offline são verificados?

| Opção | Descrição | Selecionada |
|--------|-------------|----------|
| Playwright no CI + checklist em aparelho real | Cobre lógica no CI e deixa iOS/Safari como caixa pendente em `docs/PARIDADE.md` | |
| Só checklist manual | Zero código novo; regressão de SW é silenciosa e já está no aparelho quando aparece | |
| Só Playwright no CI | Cobre a lógica em três motores; não cobre instalação de PWA em iOS/Safari real | ✓ |

**Notas:** escolha deliberada de deixar a cobertura em aparelho físico de fora. A
consequência foi apontada na hora e registrada em D2-11 e nos deferred: a caixa de PWA real
em `docs/PARIDADE.md` permanece aberta, e o verificador da fase deve ler o critério 2 com
essa ressalva em vez de reprovar por um item recusado de propósito.

### O que o GitHub Pages passa a servir?

| Opção | Descrição | Selecionada |
|--------|-------------|----------|
| Último deploy: página de mudança + SW suicida | O SW se desregistra e limpa o próprio cache; quem instalou de lá recebe a mensagem | ✓ |
| Desligar o Pages e pronto | Um PWA instalado continuaria abrindo do cache e gravando progresso num domínio morto | |
| Deixar o jogo velho no ar | Dois DungeonGuys2 no mundo, com progresso separado e link errado circulando | |

---

## Domínio, staging e vigilância

### Situação do domínio e da VPS

| Opção | Descrição | Selecionada |
|--------|-------------|----------|
| Domínio comprado e DNS já apontando | ACME funciona no primeiro boot; DNS fora do caminho crítico | ✓ |
| Domínio comprado, DNS não configurado | Exigiria passo de DNS e espera de propagação no plano | |
| Nada comprado ainda | Exigiria compra e provisionamento, com a região da VPS importando por causa do TURN da fase 3 | |

### Existe staging?

| Opção | Descrição | Selecionada |
|--------|-------------|----------|
| Sem staging; a reversão é a rede de segurança | Uma caixa, um domínio; produção ainda é barata de quebrar | ✓ |
| Subdomínio de staging no mesmo Caddy | Dobra a superfície numa VPS pequena e cria mais um origin com SW instalado | |
| Staging local com Caddy no laptop | Não exercita ACME, DNS, systemd nem permissão — confiança maior que o risco coberto | |

### O que fica versionado?

| Opção | Descrição | Selecionada |
|--------|-------------|----------|
| Configuração versionada, segredos e domínio na VPS | `ops/` no repo; domínio e segredos em `/etc/dg2/env` | ✓ |
| Tudo versionado, domínio incluso | Mais legível, mas escreve o endereço da máquina num repositório público | |
| Configuração só na VPS | Sem diff, sem histórico; reconstruir a caixa vira arqueologia | |

### Vigilância do certificado e do `/health`

| Opção | Descrição | Selecionada |
|--------|-------------|----------|
| Serviço externo gratuito, alerta no celular | Sobrevive à queda da caixa; alarme de certificado com 30 dias | |
| Cron externo próprio (GitHub Action agendada) | Zero conta nova, tudo no repositório | |
| Systemd timer na própria VPS | Vê o certificado real, mas cala junto com a caixa | ✓ (primeira escolha) |

**Follow-up.** Apontada uma vez a tensão com a nota do roadmap ("o monitoramento externo do
certificado é parte do critério 1, não item separado"), a decisão foi ajustada:

| Opção | Descrição | Selecionada |
|--------|-------------|----------|
| Timer local + uma checagem externa mínima | Cobre os dois modos de falha sem virar projeto de observabilidade | ✓ |
| Só o timer local, como decidido antes | Consequência aceita e anotada para o verificador | |
| Trocar por monitoramento externo | Uma coisa a menos rodando na VPS | |

### Destino do backup

| Opção | Descrição | Selecionada |
|--------|-------------|----------|
| Litestream para bucket S3-compatível | Replica o WAL continuamente; recuperação em segundos; centavos por mês em B2 | ✓ |
| Dump periódico enviado para fora | Janela de perda de até um dia — num ledger de moeda, soul gold que sumiu | |
| Backup para repositório privado | Colocaria dado de jogador (e, na fase 6, hash de senha) no git | |

---

## Claude's Discretion

Deixados explicitamente para pesquisador e planejador: escolha entre Hono e Fastify e a
porta interna; o conteúdo de `/health`; `MemoryMax` e o sandbox do systemd; rsync ou tar e
quantos releases ficam no disco; a forma do passo de build que gera o precache e o nome do
cache derivado do hash; onde e como o aviso de atualização aparece na UI; se a exclusão de
`/ws` no service worker já entra junto com a de `/api/`; se o servidor reinicia em todo
deploy; a página de manutenção estática; e a ordem interna da fase — com a restrição
registrada de que a mudança de `base` seja tarefa própria, separada da reescrita do `sw.js`.

## Deferred Ideas

`apps/web` (adiado pela segunda vez); as tabelas de perfil, run, replay, temporada e placar;
subdomínio de staging; timer recorrente de verificação de restauração; página de manutenção
estática; exclusão de `/ws` no service worker; a disputa da porta 443 com o TURN sobre TLS;
cobertura de PWA em aparelho real (iOS/Safari); e a limpeza de Cache Storage e IndexedDB no
logout, que só existe a partir da fase 6.

Nenhuma proposta de escopo novo apareceu — a discussão ficou dentro da fronteira da fase.
