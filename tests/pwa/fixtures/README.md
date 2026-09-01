# `old-build/` — a instalação antiga do critério 2

É o `dist/` construído num ponto exato da fase 2: **depois** de o plano 02-02 mudar o `base`
para `'/'` (então o escopo do service worker já é `/`, e a atualização testada é in-place) e
**antes** de o plano 02-06 reescrever o `public/sw.js` (então o worker aqui ainda é o antigo,
com `skipWaiting()`, `clients.claim()` e `CACHE = 'dungeonguys2-v1'`).

Nenhuma outra combinação serve. Construída antes do 02-02, o escopo seria `/DungeonGuys2/` e o
teste provaria outra coisa. Construída depois do 02-06, ela **seria** o build novo e o teste de
atualização passaria por vacuidade — é a ameaça T-2-VACUOUS.

**Este diretório nunca é regenerado por um build posterior.** `tests/build-base.test.ts` reprova
quem o regenerar. Se um dia precisar mudar, é commit próprio com justificativa.
