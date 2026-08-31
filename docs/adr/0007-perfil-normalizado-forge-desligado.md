# 0007 — Perfil normalizado: forge desligado em run rankeada

- **Origem:** D-36 (`.planning/phases/01-formato-e-costuras/01-CONTEXT.md`)
- **Requisito:** RANK-02, RANK-04
- **Consumido por:** fase 9 (ranking verificado e temporadas), critérios 2 e 3
- **Estado:** aceito em 2026-08-31

## Contexto

O forge é meta-progressão permanente: `progress.forge` em `src/app/save.ts` guarda nível por
chave de melhoria, e esses níveis entram na run pelo `RunConfig`, que é o único canal de entrada
do mundo externo para o sim.

Num placar, isso cria dois problemas ao mesmo tempo. O primeiro é de produto: dois scores com
níveis de forge diferentes não se comparam, e um jogador novo entra num board onde o topo já foi
comprado com tempo, não com jogo. O segundo é de segurança: RANK-02 exige que o servidor
**reconstrua** o `RunConfig` a partir da conta antes de re-rodar a run. Se o forge entrar nessa
reconstrução, o servidor passa a depender de um nível de forge que a conta declara — e cada
caminho que pode inflar esse nível vira superfície de trapaça.

`.planning/STATE.md` listava isto como uma das quatro perguntas de produto abertas: *"teto do
forge em runs rankeadas e de evento — perfil normalizado ou teto?"*. Este ADR a fecha.

## Opções

| Opção | Custo | Por que foi recusada / aceita |
|---|---|---|
| **Forge livre** — a run rankeada usa o forge da conta | Zero | Recusada. O board deixa de ser comparável e o jogador novo não compete; e o servidor passa a confiar no nível de forge da conta para reconstruir o `RunConfig` |
| **Teto no forge** — a run rankeada limita cada melhoria a um nível máximo | Baixo em código, contínuo em manutenção | Recusada. Continua com o mesmo problema em escala menor: quem está no teto compara com quem não está, e o teto vira mais um número a rebalancear a cada temporada. A superfície de verificação encolhe, mas não some |
| **Categoria de perfil separada por faixa de forge** | Médio | Recusada. Fragmenta um board que já é dividido por modo e por tamanho de grupo (ADR 0006); em v1, com ranking só solo, sobrariam listagens quase vazias |
| **Perfil normalizado — forge desligado** | Uma tela que avisa, e a perda de uma vantagem existente | **Aceita.** É a única que faz a superfície de verificação sumir em vez de encolher |

## Decisão

**Runs rankeadas rodam com forge zerado.** O servidor reconstrói o `RunConfig` com todos os
níveis de forge em zero, e é essa configuração que o cliente recebe e que o verificador re-roda.

São **três** motivos, e os três valem por si:

1. **O board fica comparável.** Duas entradas do placar passam a diferir por como a run foi
   jogada, não por quanto forge o jogador já tinha acumulado.
2. **Um jogador novo compete no dia 1.** Não existe tempo de acumulação a pagar antes de o placar
   fazer sentido para ele.
3. **A superfície de verificação encolhe.** O servidor reconstrói o `RunConfig` **sem precisar
   confiar em nível de forge nenhum** — o valor é zero por definição, não um número vindo da
   conta. Todo caminho de trapaça que passaria por inflar forge deixa de existir, em vez de
   passar a ser conferido.

É **esse** o valor que a coluna "perfil" do ADR 0006 carrega em v1: `normalizado`.

### A alternativa recusada, com o custo

A alternativa séria era **teto no forge** em vez de desligamento. Ela foi recusada porque só
reduz o problema: com teto, quem está no teto continua comparando com quem ainda não chegou lá, o
número do teto vira mais uma constante a rebalancear a cada temporada, e o servidor continua
tendo de confiar — e conferir — o nível declarado pela conta.

**O custo da decisão aceita, registrado sem maquiagem:** ela **apaga da run rankeada uma
meta-progressão que já existe** e que o jogador pode valorizar. Quem investiu no forge não vê
esse investimento no placar. A mitigação é de produto, não de formato: o forge continua valendo
integralmente na campanha e no endless não rankeados, que é onde a maior parte do tempo de jogo
acontece, e a UI precisa dizer com todas as letras que a run rankeada é normalizada — antes de
começar, não no fim.

## Consequência

- **RANK-02 fica implementável sem confiança no cliente.** *"O `RunConfig` é reconstruído a partir
  da conta"* passa a significar classe, nome e seed — nenhum número de poder.
- **A coluna `perfil` do ADR 0006 tem um valor em v1** (`normalizado`) e um lugar pronto para um
  segundo valor, se um dia existir um board de forge livre. Abrir esse segundo valor não é
  migração.
- **Custo aceito:** meta-progressão existente fica fora do placar, e a UI carrega a
  responsabilidade de avisar antes.
- **O que passa a ser caro mudar:** a decisão em si é reversível (abrir um perfil novo é
  acrescentar valor a uma coluna), mas **fundir** entradas normalizadas com entradas de forge
  livre no mesmo board nunca será — elas medem coisas diferentes.
