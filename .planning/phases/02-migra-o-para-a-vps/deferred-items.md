# Itens adiados — fase 02

Achados fora do escopo do plano em que foram descobertos. Cada um diz quem
precisa ser o dono e por que não pôde ser resolvido ali.

---

## DEF-02-01 — As quatro mensagens de erro de `env.ts` ainda apontam para o arquivo de env

**Descoberto em:** execução do 02-13 (Task 1).
**Reavaliado em:** execução do 02-14 (Task 3). **Continua adiado, agora com dono
nomeado e com o texto substituto decidido** — o que faltava no 02-13 era o
runbook, e ele existe desde o commit da Task 3.

**O que é.** D2-29 aposentou `/etc/dg2/env` como lugar dos segredos do app: as
variáveis vivem no painel do Coolify. O 02-14 fechou o lado de `ops/` inteiro — o
gate `grep -n 'etc/dg2/env' -- ops/` imprime zero — e fechou, por Rule 1, as
**dez** referências a arquivo apagado que a remoção de D2-30 deixou penduradas em
`apps/` e `tests/` (ver o SUMMARY do 02-14). **Sobram cinco ocorrências em quatro
arquivos, e elas são de outra natureza:**

| Arquivo | Linhas | O que diz |
|---|---|---|
| `apps/server/src/env.ts` | 1, 140, 169, 226, 245 | o cabeçalho e **as quatro mensagens de erro** (`ponha um valor em /etc/dg2/env ou apague a linha`, a de `DG2_ORIGIN` e a do par TURN) |
| `tests/server-env.test.ts` | 1, 127 | o cabeçalho e **a asserção que persegue a mensagem** |

**Por que não foi fechado no 02-14.** A mensagem é **contrato de operação**, não
comentário: ela é o `file:pointer: message` de `tools/README.md` §3, e
`tests/server-env.test.ts:127` a persegue com `/\/etc\/dg2\/env|porta/` **num laço
sobre as chaves**, de modo que trocar o texto sem trocar a asserção deixa quatro
das cinco chaves vermelhas. Fechar de verdade são **dois** arquivos a mais num
plano que já cruzou o limiar de 15 arquivos e que já absorveu dez consertos de
Rule 1. Meio conserto de contrato é pior que um item adiado com dono.

**O texto substituto, agora decidido** (era isto que dependia do runbook, e o
runbook novo diz que a configuração do app vive no painel — `ops/README.md` §4):

```
`/env/${name}: definida e vazia — dê um valor a esta variável no painel do app, ou remova-a`
```

E a asserção passa a perseguir `/painel|porta/` em vez de `/\/etc\/dg2\/env|porta/`.
As outras duas mensagens (`DG2_ORIGIN` e o par TURN) trocam `em /etc/dg2/env` por
`nas variáveis do app no painel`, sem mexer na estrutura.

**Dono nomeado: a primeira wave da fase 3 que tocar `apps/server/src/env.ts`.**
Ela vai abrir o arquivo de qualquer jeito — `DG2_TURN_SECRET` e `DG2_TURN_REALM`
são chaves da fase 3 e a validação em par mora ali. Os dois arquivos mudam na
mesma janela, com a asserção ajustada no mesmo commit.

**Por que não é urgente.** A mensagem continua acionável: ela nomeia a chave, que
é a parte que o operador precisa. O custo é um leitor futuro procurando
configuração do app num arquivo que não existe — e `ops/README.md` §4 agora diz,
em primeiro lugar, onde ela mora.

---

## DEF-02-02 — `git grep 'DG2_DOMAIN' -- ops/ apps/` — **RESOLVIDO**

**Resolvido em:** execução do 02-14, commits `86cb82a` (Task 1) e o da Task 3.

A chave saiu de `ops/README.md` (reescrito) e com os três arquivos de
`cert-check` (apagados por D2-30). `git grep -n 'DG2_DOMAIN' -- ops/ apps/` não
imprime nada. O domínio passou a viver **só** no painel do Coolify, como FQDN do
recurso, e `DG2_DOMAIN` saiu também da lista `ENV_KEYS` de
`tests/ops-config.test.ts` — não existe mais como chave de configuração do app.

---

## DEF-02-03 — O orçamento de memória de `ops/coturn-dropin.conf` aponta para §12, e ninguém assere isso

**Descoberto em:** execução do 02-14 (Task 3), ao corrigir os ponteiros de seção
do drop-in depois da reescrita do runbook.

**O que é.** `ops/coturn-dropin.conf` cita `ops/README.md §12` para o motivo do
cgroup v2, e o par `MemoryHigh=96M`/`MemoryMax=128M` existe nos **dois** arquivos
— no drop-in como diretiva e no runbook como prosa. O runbook tem asserção que
compara a cota (`total-quota`) com o arquivo que manda, mas **o par de memória é
comparado com literais escritos no teste**, não entre os dois arquivos.

**O custo de não fazer.** Baixo e conhecido: mudar o teto no drop-in e esquecer o
runbook deixa duas afirmações, uma falsa, e nenhum teste vermelho. É o mesmo
defeito que a cota tinha antes do 02-14 (o runbook carregava `total-quota=1200`
quando o arquivo já dizia `100`), e foi exatamente assim que ele apareceu.

**Dono sugerido:** o plano da fase 3 que instalar o coturn de verdade (03-11). Ele
vai ler os dois arquivos lado a lado, que é o momento em que a comparação é
barata de escrever.

---

## DEF-02-04 — Os ponteiros de seção entre arquivos de `ops/` não são asseridos

**Descoberto em:** execução do 02-14 (Task 3).

**O que é.** Vários arquivos de `ops/` citam seções numeradas do runbook
(`ops/README.md §4`, `§11`, `§12`), e `tools/ops/restore-verify.mjs` também. A
reescrita do runbook **renumerou tudo**, e os ponteiros foram corrigidos à mão,
um a um, por grep. Nada impede o próximo renumerador de deixá-los apontando para
a seção errada — um ponteiro errado é pior que nenhum, porque manda o leitor para
um texto que parece ser a resposta.

**Dono sugerido:** qualquer plano que mexa na numeração de `ops/README.md`. A
forma barata é uma asserção que extraia os `§N` citados pelos arquivos de `ops/`
e de `tools/ops/` e confirme que cada `## N.` existe no runbook — uma asserção,
não um processo.
