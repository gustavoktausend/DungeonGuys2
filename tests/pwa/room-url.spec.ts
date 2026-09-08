// room-url.spec.ts — um PWA instalado a partir de `/?sala=X` não guarda a sala.
//
// A PERGUNTA QUE ESTA SPEC FECHA. `public/manifest.json` declara `start_url:
// "."`, que é uma URL RELATIVA: o navegador a resolve contra o endereço do
// documento que declarou o manifesto. Um jogador que recebe um convite, abre
// `/?sala=ABC123` e instala o jogo dali estaria, se `.` arrastasse a consulta,
// com um atalho que abre para sempre numa sala que morreu no mesmo dia — e o
// sintoma seria "o jogo abre numa tela de erro", semanas depois, sem nada para
// correlacionar (D3-07, T-3-32).
//
// A DEFESA É NO BOOT, NÃO NO MANIFESTO. `src/main.ts` lê `?sala=` uma vez e o
// remove com `history.replaceState` antes de qualquer outra coisa, então o
// endereço do documento já não tem a consulta quando o navegador resolve `.`.
// É por isso que esta spec mede a URL RESOLVIDA e não o texto do manifesto:
// o texto é `"."` nos dois mundos, e só a resolução distingue os dois.
//
// E A SEGUNDA METADE, que é a que ninguém lembra de medir: a consulta também
// não pode virar uma ENTRADA DE CACHE separada da raiz. O worker responde por
// uma allowlist de caminhos que o build emitiu (public/sw.js), então `/?sala=X`
// tem de ser servido pela mesma entrada que `/` — e Cache Storage guarda por
// URL inteira, não por caminho, então uma implementação que armazenasse a
// resposta sob a URL com consulta encheria o cache com uma entrada por convite.
import { expect, test } from '@playwright/test';
import { readCacheEntries, serveDir, waitForActivated, type StaticServer } from './helpers';

/** O código de uma sala que não existe — nada aqui tenta entrar nela. */
const CODE = 'ABC123';

let server: StaticServer;

test.afterEach(async () => {
  await server.close().catch(() => {});
});

test('instalar a partir de /?sala=X não fixa a sala no start_url nem no cache', async ({ page }) => {
  server = await serveDir('dist');
  await page.goto(`${server.origin}/?sala=${CODE}`);
  await waitForActivated(page);

  // A consulta some da barra ANTES de o manifesto ser resolvido, e some por
  // replaceState — o que também garante que recarregar não tenta reentrar numa
  // sala possivelmente morta (D3-07).
  expect
    .soft(new URL(page.url()).search, 'a consulta é consumida no boot e sai da barra')
    .toBe('');

  // O start_url RESOLVIDO, que é o que o navegador guardaria na instalação.
  // Resolvido no documento, contra o href do manifesto, exatamente como a
  // especificação de Web App Manifest manda — e não lido como texto, porque o
  // texto é `"."` tanto no caso certo quanto no errado.
  const resolved = await page.evaluate(async () => {
    const link = document.querySelector('link[rel="manifest"]') as HTMLLinkElement | null;
    if (!link) throw new Error('a página não declara um manifesto');
    const manifest = await (await fetch(link.href)).json();
    return {
      start: new URL(manifest.start_url, link.href).toString(),
      scope: new URL(manifest.scope, link.href).toString(),
      here: location.href,
    };
  });

  expect.soft(resolved.start, 'o start_url resolvido não carrega a sala').not.toContain('sala=');
  expect.soft(resolved.scope, 'nem o scope').not.toContain('sala=');
  // Anti-vacuidade das duas linhas acima: elas passariam se o manifesto tivesse
  // sumido, ou se a resolução tivesse dado algo de outra origem.
  expect.soft(resolved.start, 'e continua sendo esta origem').toBe(`${server.origin}/`);

  const entries = await readCacheEntries(page);
  const names = Object.keys(entries);
  expect(names, 'a origem tem exatamente um cache').toHaveLength(1);
  const paths = entries[names[0]];
  expect
    .soft(paths.filter(p => p.includes('sala')), 'nenhuma entrada de cache carrega a sala')
    .toEqual([]);
  // A visita com consulta é servida pela entrada da raiz, e não por uma sua:
  // o precache tem `/index.html` e o worker mapeia `/` para ele.
  expect
    .soft(paths, 'o precache continua sendo o do build, sem uma entrada por convite')
    .toContain('/index.html');
});
