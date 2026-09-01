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

test('numa página sem controller a oferta não aparece (WR-12)', async ({ context }) => {
  // A hard reload (Ctrl+Shift+R) loads the document BYPASSING the worker, so
  // the page comes up uncontrolled while the registration keeps its waiting
  // worker. Offering the swap there is offering something that cannot happen:
  // the click posts the message, the worker activates, and the event that
  // drives the reload never fires because there is no controller to swap. The
  // button stays on screen absorbing clicks with no effect.
  server = await serveDir('tests/pwa/fixtures/old-build');

  // A tab that stays controlled, and it is not scenery: with no controlled
  // client left, the browser activates the waiting worker at once and the state
  // under test stops existing. Measured — without this tab the hard reload
  // below lands on `waiting: false`, and the case would pass by vacuity.
  const keeper = await context.newPage();
  await keeper.goto(server.origin);
  await waitForActivated(keeper);

  server.setRoot('dist');
  await clearHttpCache(keeper);
  await keeper.reload();
  await expect
    .poll(async () => (await controlState(keeper)).hasWaiting,
      { message: 'o build novo tem de instalar e FICAR esperando' })
    .toBe(true);

  // ── A aba do hard reload ───────────────────────────────────────────────
  const hard = await context.newPage();
  await hard.goto(server.origin);

  const session = await hard.context().newCDPSession(hard);
  await session.send('Page.enable');
  // ignoreCache is Chrome's hard reload, and bypassing the worker for the
  // document is exactly the part that matters here.
  await Promise.all([
    hard.waitForEvent('load'),
    session.send('Page.reload', { ignoreCache: true }),
  ]);
  await session.detach();

  // The two halves of the premise, asserted before the conclusion: without both
  // of them this case would be measuring some other situation entirely.
  const uncontrolled = await hard.evaluate(() => !navigator.serviceWorker.controller);
  expect(uncontrolled, 'o hard reload tem de deixar esta aba SEM controller').toBe(true);
  expect((await controlState(hard)).hasWaiting, 'e o worker novo tem de continuar esperando')
    .toBe(true);

  await expect(hard.locator('#btn-update'),
    'sem controller não há troca a oferecer, e um botão inerte é pior que nenhum')
    .toBeHidden();

  // And the offer is still correct where it IS honest — the controlled tab.
  // Without this the case would also pass against a build that simply never
  // offered the update to anybody.
  await expect(keeper.locator('#btn-update'),
    'a aba controlada continua recebendo a oferta')
    .toBeVisible();
});

test('aceitar a atualização numa aba não recarrega a run de outra aba (CR-03)', async ({ context }) => {
  // The blind spot of the test above, by construction: it drives a single
  // `page`, so the second client never exists — and the second client is the
  // whole problem. `skipWaiting()` does not swap the controller of the tab
  // that asked; per the Service Worker Activate algorithm the activating
  // worker becomes the active worker for EVERY client of the registration and
  // Notify Controller Change fires on all of them. `clients.claim()` is only
  // needed for clients that were never controlled, which is why D2-09's
  // refusal to call it does not cover this.
  //
  // Two tabs of a browser game is not exotic, and phase 3 makes it worse: a
  // peer whose page reloads out from under them drops the room.
  server = await serveDir('tests/pwa/fixtures/old-build');

  // ── A aba do menu instala o worker antigo ──────────────────────────────
  const menu = await context.newPage();
  await menu.goto(server.origin);
  await waitForActivated(menu);

  // ── O deploy, visto pela aba do menu ───────────────────────────────────
  server.setRoot('dist');
  await clearHttpCache(menu);
  await menu.reload();

  await expect
    .poll(async () => (await controlState(menu)).hasWaiting,
      { message: 'o build novo tem de instalar e FICAR esperando' })
    .toBe(true);

  // ── A segunda aba, e a run dentro dela ─────────────────────────────────
  // Same context and same origin, so it is the same registration and the same
  // controller — a second BrowserContext would have its own storage and its
  // own worker, and would prove nothing.
  const run = await context.newPage();
  await run.goto(server.origin);
  await expect(run.locator('#start-screen')).toBeVisible();

  await run.locator('#btn-start').click();
  await expect(run.locator('#start-screen'), 'a run tem de começar de verdade')
    .not.toHaveClass(/\bactive\b/);

  // A marker on the window object: it survives anything EXCEPT the document
  // being replaced. That is exactly the event under test, and it is why the
  // assertion is a marker and not a screenshot or a timer.
  await run.evaluate(() => { (window as unknown as Record<string, unknown>).__runAlive = true; });

  // ── O clique acontece na OUTRA aba ─────────────────────────────────────
  await menu.evaluate(() => { (window as unknown as Record<string, unknown>).__beforeUpdate = true; });
  await menu.locator('#btn-update').click();

  // The menu tab reloads, which is correct AND is the synchronisation point:
  // it can only happen after the new worker activated, and the new worker
  // activating is what fires controllerchange in the tab with the run.
  await menu.waitForFunction(() => !('__beforeUpdate' in window));
  await menu.waitForLoadState('load');

  // ── A aba com a run ────────────────────────────────────────────────────
  // A positive wait and not a sleep. The notice is written by the SAME handler
  // that would otherwise have called location.reload(), so its appearance is
  // proof the deferred branch ran — and a fixed sleep followed by one read
  // could not tell "did not reload" from "reloaded 50 ms later".
  await expect(run.locator('#wave-announce'),
    'a aba em jogo tem de ser avisada, não recarregada')
    .toHaveText(/NOVA VERSÃO ATIVA/);

  expect(await run.evaluate(() => '__runAlive' in window),
    'a aba em jogo não pode ter trocado de documento — a run seria destruída')
    .toBe(true);

  // And the run is still the thing on screen: the start screen coming back
  // would be the reload wearing a different name.
  await expect(run.locator('#start-screen'), 'a tela inicial não pode ter voltado')
    .not.toHaveClass(/\bactive\b/);

  // ── E a outra metade: adiado não é cancelado ───────────────────────────
  // Without this, a "fix" that simply deleted the reload would pass everything
  // above while leaving the tab running old code against a new worker's cache
  // forever. Pause -> QUIT is the seam where the run is over and the reload
  // costs nothing.
  await run.keyboard.press('Escape');
  await expect(run.locator('#pause-screen')).toHaveClass(/\bactive\b/);
  await run.locator('#btn-quit').click();

  await run.waitForFunction(() => !('__runAlive' in window));
  await run.waitForLoadState('load');
  await expect(run.locator('#start-screen'), 'depois do QUIT a aba recarrega e volta ao menu')
    .toBeVisible();
});
