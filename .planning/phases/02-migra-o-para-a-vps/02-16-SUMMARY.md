---
phase: 02-migra-o-para-a-vps
plan: 16
status: complete
completed: 2026-09-14
tasks_done: 3
tasks_total: 3
gap_closure: true
requirements: [INFRA-02, INFRA-03]
---

# 02-16 — CSP observado, PWA limpo contra o domínio real, e a segunda imagem

Fecha o **gap 2** do `02-VERIFICATION.md` (CSP observado num navegador) e a metade "instalação
limpa e offline" do **gap 1**. Publica a segunda imagem de que o plano 02-17 depende, com a
diferença **provada antes** de publicar.

## Task 1 — a sessão de navegador (portão humano)

O operador executou os nove passos contra o domínio de produção, num perfil limpo, e aprovou
declarando todos os critérios satisfeitos.

**O registro separa medido de atestado, e a separação é deliberada.** Um navegador não deixa saída
colável como um `curl` deixa: o console, o painel de aplicação e o teste com o cabo desligado são
vistos por uma pessoa. Registrar a palavra dela **como se fosse** saída de comando falsificaria a
forma da evidência, mesmo com o conteúdo certo. `docs/OPERACAO.md` § "CSP e PWA contra o domínio
real" tem os dois blocos rotulados.

**Medido por esta sessão, com saída colada:**

- o `Content-Security-Policy` que o domínio serve é **idêntico, caractere a caractere**, à diretiva
  de `ops/Caddyfile:206`. Nada entre o Caddy e o cliente reescreve a política
- o nome do cache que o commit em produção gera, reproduzido por build local:
  `dg2-917996e0ac455823`

**Atestado pelo operador:** console sem bloqueio durante uma partida até o fim da primeira wave;
os dois spritesheets, as duas fontes e a chamada a `/api/health` carregaram e o som tocou; os
quatro cabeçalhos chegaram; o PWA instalou e abriu em janela própria; service worker `activated`,
escopo `/`; **um** cache; **nenhuma** entrada `/api/`; e o jogo abriu com a rede **fisicamente**
desligada.

## Task 2 — a advertência vira observação

A frase que `ops/Caddyfile` carregava desde o plano 02-03 — `UNVERIFIED AGAINST A RUNNING BROWSER:
the directive list is derived from source, not observed` — **não existe mais no repositório**. No
lugar entrou a observação datada, com o que carregou sem bloqueio, a nota de que o áudio não
aparece por ser sintetizado, e um ponteiro literal para onde a saída está colada.

**A derivação arquivo a arquivo ficou intacta.** Ela é o motivo de cada diretiva existir, e a
observação prova a derivação em vez de substituí-la — uma lista de diretivas que ninguém sabe
explicar é uma lista que ninguém pode mudar com segurança. A linha `Content-Security-Policy` não
teve um caractere alterado.

### Uma asserção quase nasceu vácua

As três condições do caso novo do Caddyfile são **prosa**, e o helper `code()` filtra linhas de
comentário — por bom motivo: sem o filtro, toda asserção de ausência falharia contra o próprio
arquivo que a satisfaz. Mas contra `code()` a checagem de ausência da advertência passaria com a
advertência **intacta no arquivo**. Trocada para `read()`, com o porquê escrito no caso, para que a
próxima pessoa não a "conserte" de volta.

## Task 3 — a segunda imagem, e a prova antes de publicar

O aviso de atualização nasce de `updatefound`, que nasce de `sw.js` mudar de bytes, que nasce do
digest mudar, que nasce do `dist/` mudar. **Publicar sem mudar o `dist/` seria queimar um deploy da
caixa real para medir o nada**, e um navegador que não avisa nada seria indistinguível de um aviso
quebrado.

Medição que fundamenta isso, tirada antes de qualquer edição: entre o deploy do 02-12 e esta
sessão houve **cinco commits** — documentos, testes, planos, rastreamento — e o nome do cache
**não mudou**, porque nenhum deles chega ao `dist/`.

**A correção é verdadeira, não enchimento.** `public/manifest.json` afirmava `6 classes`;
`CLASS_KEYS` tem **sete**. O número aparece no prompt de instalação do PWA. As `16 waves` da mesma
frase foram conferidas e estão certas (bosses de ato nas waves 8 e 16). `start_url` e `scope` não
foram tocados.

```
antes:  sw precache: 13 arquivos, cache dg2-917996e0ac455823
depois: sw precache: 13 arquivos, cache dg2-c49dfed53d8d49a8
```

**Sha da segunda imagem, que o plano 02-17 consome:**

```
f0b5fa059fa430d442617e916e93241402ff4eb1
```

CI verde; os dois pacotes puxáveis anonimamente nessa tag (HTTP 200).

**Nada foi promovido**, e foi conferido: a rota de saúde continua devolvendo
`9cba5c9b06e406c6ab04d5b46f290f0463d5b623`. A instalação antiga do operador está intacta, que é a
condição de que o 02-17 depende.

## O que este plano NÃO fecha

- **Atualização a partir de instalação antiga** — a outra metade do gap 1, e é o plano 02-17
- **iOS/Safari em aparelho físico** — `D2-11`, aberto em `docs/PARIDADE.md`. Decisão, não lacuna
- **Firefox e WebKit** — o Playwright só suporta service worker em Chromium, e a sessão foi num
  navegador só
- **O CSP para sempre** — foi observado contra o `dist/` deste commit; um recurso novo de família
  não autorizada passaria a ser bloqueado, e quem guarda isso é a derivação, não a sessão

## Arquivos

**Modificados:** `ops/Caddyfile`, `docs/OPERACAO.md`, `tests/ops-config.test.ts`,
`public/manifest.json`

**Commits:** `68b3f97`, `f0b5fa0`

**Suíte:** 921 verdes (três rodadas seguidas), lint limpo. Três asserções novas, cada uma provada
por remoção.
