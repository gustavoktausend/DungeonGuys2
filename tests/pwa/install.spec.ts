// install.spec.ts — clean installation (INFRA-02, success criterion 2a).
//
// Written against the TARGET behaviour, not the current one. Until plan 02-06
// rewrites public/sw.js this file is RED, and that is the whole point: the
// red-to-green transition is the evidence that the rewrite did what it was
// asked to do. Asserting today's behaviour here would produce a test that
// passes forever and proves nothing.
import { expect, test, type Page } from '@playwright/test';
// distPathnames comes from helpers.ts and no longer has a copy here. The copy
// was written before update.spec.ts became a second caller, and the two had
// already stopped being interchangeable: the shared one turns each filename
// into a URL path segment, which is what the entries read out of Cache Storage
// actually are, and the private one concatenated the raw name. Both agree for
// every filename dist/ carries today and disagree the moment one has a space
// in it — see the comment on segment() in helpers.ts.
import {
  distPathnames, readCacheEntries, serveDir, waitForActivated, type StaticServer,
} from './helpers';

function controllerScript(page: Page): Promise<string | null> {
  return page.evaluate(() => navigator.serviceWorker.controller?.scriptURL ?? null);
}

let server: StaticServer;

test.afterEach(async () => {
  // Tolerant on purpose: a spec may already have killed it mid-test.
  await server.close().catch(() => {});
});

test('instalação limpa: o worker espera, e o precache cobre o dist inteiro', async ({ page }) => {
  server = await serveDir('dist');
  await page.goto(server.origin);
  await waitForActivated(page);

  // Soft, all four of them, so ONE run names every behaviour that is still
  // missing instead of stopping at the first. While this file is red that
  // report is the specification handed to plan 02-06.
  //
  // D2-09: the target worker calls neither skipWaiting() nor clients.claim(),
  // so the page that installed it is NOT controlled by it. The swap happens
  // when the player accepts it, outside a run — never under their feet.
  expect
    .soft(await controllerScript(page), 'sem clients.claim(), a página que instalou não é controlada')
    .toBeNull();

  await page.reload();
  expect
    .soft(await controllerScript(page), 'a navegação seguinte já nasce sob o worker ativo')
    .not.toBeNull();

  const entries = await readCacheEntries(page);
  const names = Object.keys(entries).sort();

  // One cache, and its name derived from the build hash (D2-10). A literal
  // name is what makes activate() never clean the precache: it only deletes
  // caches whose name differs from the current one, and the name never
  // changed, so precached items were never renewed.
  expect
    .soft(names, 'a origem tem de terminar com exatamente um cache')
    .toHaveLength(1);
  expect
    .soft(names[0], 'o nome do cache deriva do hash do build (D2-10)')
    .toMatch(/^dg2-[0-9a-f]{16}$/);

  // The whole of dist/, minus the worker itself: it cannot precache the file
  // whose bytes the precache list is written into.
  const expected = (await distPathnames()).filter(pathname => pathname !== '/sw.js');
  expect(expected.length, 'o dist/ tem de existir e ter arquivos — rode npm run build')
    .toBeGreaterThan(5);
  expect
    .soft(entries[names[0]], 'o precache cobre o dist inteiro, menos o próprio sw.js')
    .toEqual(expected);
});

// WR-11. `cache.addAll` rejects the ENTIRE install if ONE url fails, and
// nothing retries. The exclusion rule is deliberately total — everything under
// dist/ — and the art from the assets repository is measured in tens of
// megabytes, so an install that must complete atomically over a mobile
// connection is a coin flip. Every loss leaves the player with NO offline
// capability at all, and no diagnostic.
//
// The two cases below pin the split from both sides, and only the pair does.
// The first alone would pass against a worker with no split at all whenever the
// broken asset happened to be optional; the second alone would pass against a
// worker that still fails on everything.
const SHELL_SAMPLE = '/manifest.json';
const OPTIONAL_SAMPLE = '/assets/CREDITS.md';

function serve404(server: StaticServer, pathname: string): void {
  server.route(pathname, (_req, res) => {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('404');
  });
}

test('um asset opcional com 404 não custa a instalação inteira', async ({ page }) => {
  server = await serveDir('dist');
  serve404(server, OPTIONAL_SAMPLE);

  await page.goto(server.origin);
  // Red before the split: addAll rejects, install() never resolves, and this
  // fails naming the cause rather than as a bare test timeout.
  await waitForActivated(page);

  const entries = await readCacheEntries(page);
  const names = Object.keys(entries).filter(name => /^dg2-[0-9a-f]{16}$/.test(name));
  expect(names, 'a origem tem de ter exatamente um cache do build corrente').toHaveLength(1);
  const cached = entries[names[0]];

  // Anti-vacuity: an empty cache would satisfy "the 404 is not in it".
  expect(cached.length, 'o precache tem de ter sobrado quase inteiro').toBeGreaterThan(5);

  // The mandatory half landed whole.
  expect(cached, 'o documento é o mínimo para o jogo abrir offline').toContain('/index.html');
  expect(cached, 'e o manifesto junto com ele').toContain(SHELL_SAMPLE);
  expect(
    cached.filter(pathname => pathname.startsWith('/assets/index-')),
    'os dois bundles com nome hasheado são o resto do shell',
  ).toHaveLength(2);

  // And the one thing missing is the one thing that 404ed.
  expect(cached, 'o asset que falhou é o único ausente').not.toContain(OPTIONAL_SAMPLE);
});

test('um asset do shell com 404 reprova a instalação inteira', async ({ page }) => {
  server = await serveDir('dist');
  serve404(server, SHELL_SAMPLE);

  await page.goto(server.origin);

  // The other direction, and the reason the bulk being best-effort is not the
  // same as the install being best-effort: without the document, the manifest
  // and the bundles there is no game to open offline, so refusing to install is
  // the honest outcome — a worker that "succeeded" here would leave a cache
  // that cannot boot and would report nothing.
  await expect(
    waitForActivated(page, 5_000),
    'faltando um arquivo do shell, a instalação tem de reprovar',
  ).rejects.toThrow(/nenhum service worker ativou/);
});

test('o manifesto é instalável: escopo do registro e do manifesto coincidem', async ({ page }) => {
  server = await serveDir('dist');
  await page.goto(server.origin);
  await waitForActivated(page);

  const resolved = await page.evaluate(async () => {
    const manifest = await (await fetch('/manifest.json')).json() as {
      scope?: string; start_url?: string;
    };
    // Both fields are "." (DM-6), which is relative to the manifest's own URL.
    const manifestUrl = new URL('/manifest.json', location.origin).href;
    return {
      scope: new URL(manifest.scope ?? '.', manifestUrl).href,
      startUrl: new URL(manifest.start_url ?? '.', manifestUrl).href,
      registration: (await navigator.serviceWorker.ready).scope,
    };
  });

  const root = `${server.origin}/`;
  expect(resolved.scope, 'servido de /manifest.json, "." resolve para a raiz').toBe(root);
  expect(resolved.startUrl).toBe(root);
  // If the manifest scope and the registration scope disagree, Chrome refuses
  // the installation as "out of scope" — with the app otherwise working, which
  // is why this is worth an assertion instead of a glance.
  expect(resolved.registration, 'o escopo do worker tem de cobrir o do manifesto')
    .toBe(resolved.scope);
});
