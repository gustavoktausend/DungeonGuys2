// update.spec.ts — an update FROM a real old installation (INFRA-02 success
// criterion 2b, INFRA-03 / T-2-STALECACHE).
//
// This is the spec that closes the "a new deploy does not leave the old cache
// behind" half of criterion 3, and it can only close it because D2-10 made the
// cache name derive from the build: activate() only deletes caches whose name
// differs from the current one, so with the literal name the previous worker
// used ('dungeonguys2-v1') there was never anything for it to delete and the
// precache was never renewed (P-3). A name that changes every build is what
// finally gives activate() something to clean — and this file is where that
// claim stops being a claim.
//
// The other half of the experiment is the fixture. tests/pwa/fixtures/old-build
// is a real dist/ from the exact point where the scope was already '/' but the
// worker had not yet been rewritten, so the update measured here is in-place on
// one origin. tests/build-base.test.ts fails the suite if anybody regenerates
// it (T-2-VACUOUS): from a later build it would BE the new build, and this
// whole file would pass without testing anything.
import { expect, test, type Page } from '@playwright/test';
import {
  clearHttpCache, distPathnames, readCacheEntries, serveDir, waitForActivated,
  type StaticServer,
} from './helpers';

/** The literal name the pre-rewrite worker used. */
const LEGACY_CACHE = 'dungeonguys2-v1';

/**
 * What the page can say about who controls it, in one round trip.
 *
 * By IDENTITY (`controller === registration.active`) and never by scriptURL:
 * both workers live at /sw.js, so comparing URLs would compare two identical
 * strings and the assertion could not fail. Identity is the only thing that
 * distinguishes "the old worker still controls this page" from "the new one
 * took over", which is precisely the D2-09 property under test.
 */
function controlState(page: Page): Promise<{
  hasActive: boolean; hasWaiting: boolean;
  controlledByActive: boolean; controlledByWaiting: boolean;
}> {
  return page.evaluate(async () => {
    const registration = await navigator.serviceWorker.getRegistration();
    const controller = navigator.serviceWorker.controller;
    return {
      hasActive: !!registration?.active,
      hasWaiting: !!registration?.waiting,
      controlledByActive: !!controller && controller === registration?.active,
      controlledByWaiting: !!controller && controller === registration?.waiting,
    };
  });
}

let server: StaticServer;

test.afterEach(async () => {
  await server.close().catch(() => {});
});

test('atualização a partir da instalação antiga: um clique, e sobra um cache só', async ({ page }) => {
  // ── A instalação antiga ────────────────────────────────────────────────
  server = await serveDir('tests/pwa/fixtures/old-build');
  await page.goto(server.origin);
  await waitForActivated(page);

  // The old worker calls clients.claim(), so it controls the page that
  // installed it — poll rather than read once, because claim() resolves on its
  // own schedule after the worker reaches 'activated'.
  await expect
    .poll(async () => (await controlState(page)).controlledByActive,
      { message: 'o worker antigo chama clients.claim(), então tem de controlar esta página' })
    .toBe(true);

  expect(Object.keys(await readCacheEntries(page)), 'o ponto de partida é a instalação antiga')
    .toEqual([LEGACY_CACHE]);

  // ── O deploy: a mesma origem passa a servir o build novo ───────────────
  // setRoot and not a second server: a new port would be a new ORIGIN, the
  // registration under test would not be the one installed a moment ago, and
  // this would be a clean install wearing an update's clothes.
  server.setRoot('dist');

  // The same false green measured in plan 02-05, from the other side: the
  // fixture server sends `public, max-age=31536000` for hashed assets, so
  // without this the reload below could be answered entirely from Chromium's
  // HTTP cache and the "new" build would never reach the browser at all.
  // Cache Storage is untouched — the old worker's cache has to survive this
  // line, since its removal is what the end of the test measures.
  await clearHttpCache(page);

  await page.reload();

  // ── A oferta, e nada mais ──────────────────────────────────────────────
  await expect
    .poll(async () => (await controlState(page)).hasWaiting,
      { message: 'o build novo tem de instalar e FICAR esperando' })
    .toBe(true);

  const waiting = await controlState(page);
  // D2-09: the new worker calls neither skipWaiting() on install nor
  // clients.claim(), so nothing swapped by itself. A swap here would be a
  // deploy changing the sim under a running match.
  expect(waiting.controlledByActive, 'o worker ANTIGO continua controlando a página').toBe(true);
  expect(waiting.controlledByWaiting, 'o worker novo não pode ter tomado o controle sozinho')
    .toBe(false);

  // Two caches at this point, and that is the correct intermediate state: the
  // new worker's install() filled its own, and the old one's is still whole
  // because activate() has not run.
  const midway = Object.keys(await readCacheEntries(page)).sort();
  expect(midway, 'enquanto o novo espera, os dois caches coexistem').toHaveLength(2);
  expect(midway).toContain(LEGACY_CACHE);

  // The offer of plan 02-07, on the start screen, because `gameStarted` is
  // false. `hidden` is the only visibility mechanism #btn-update has.
  const update = page.locator('#btn-update');
  await expect(update, 'a oferta de atualização tem de aparecer fora de uma run').toBeVisible();
  await expect(update).toHaveText(/RECARREGAR AGORA/);

  // ── O clique ───────────────────────────────────────────────────────────
  // Through the UI, never by posting SKIP_WAITING from the test: the property
  // D2-09 buys is that the PLAYER decides when the swap is safe, and a test
  // that posted the message itself would be testing the worker while skipping
  // the decision.
  await page.evaluate(() => { (window as unknown as Record<string, unknown>).__beforeUpdate = true; });
  await update.click();

  // controllerchange -> location.reload() in src/main.ts. The marker is gone
  // only in the document that reload produced.
  await page.waitForFunction(() => !('__beforeUpdate' in window));
  await page.waitForLoadState('load');

  // ── O estado de chegada ────────────────────────────────────────────────
  await expect
    .poll(async () => {
      const state = await controlState(page);
      return state.controlledByActive && !state.hasWaiting;
    }, { message: 'depois do clique a página é controlada pelo worker novo, e ninguém mais espera' })
    .toBe(true);

  const entries = await readCacheEntries(page);
  const names = Object.keys(entries).sort();

  expect(names, 'a atualização tem de terminar com exatamente um cache').toHaveLength(1);
  expect(names[0], 'e o nome dele deriva do hash do build novo (D2-10)').toMatch(/^dg2-[0-9a-f]{16}$/);
  expect(names, `o cache da instalação antiga não pode sobreviver ao deploy`)
    .not.toContain(LEGACY_CACHE);

  // And it holds the NEW build, not the old one — the assertion that separates
  // "one cache" from "one cache with the right contents in it".
  const expected = (await distPathnames()).filter(pathname => pathname !== '/sw.js');
  expect(expected.length, 'o dist/ tem de existir e ter arquivos — rode npm run build')
    .toBeGreaterThan(5);
  expect(entries[names[0]], 'o cache que sobrou é o precache do build novo').toEqual(expected);

  // The game still runs after all of that: an update that leaves a dead page
  // behind is not an update that worked.
  const startScreen = page.locator('#start-screen');
  await expect(startScreen).toBeVisible();
  await page.locator('#btn-start').click();
  await expect(startScreen, 'clicar em START tem de tirar a tela do ar').not.toHaveClass(/\bactive\b/);
});
