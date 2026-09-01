// offline.spec.ts — opens with no network, having never been played
// (INFRA-02, success criterion 2c).
//
// Like install.spec.ts, this is written against the TARGET behaviour and is
// RED until plan 02-06. The criterion is "100% playable offline WITHOUT ever
// having been played", so nothing here clicks START while the server is still
// up: warming the cache by browsing first would prove the opposite of what is
// claimed, namely that the game works offline only for someone who already
// played it online.
import { expect, test } from '@playwright/test';
import {
  clearHttpCache, collectSameOriginFailures, serveDir, waitForActivated, type StaticServer,
} from './helpers';

let server: StaticServer;

test.afterEach(async () => {
  // The test kills it mid-run; this is only the safety net.
  await server.close().catch(() => {});
});

test('o jogo abre e responde com o servidor derrubado', async ({ page, context }) => {
  server = await serveDir('dist');
  await page.goto(server.origin);
  await waitForActivated(page);

  const failures = collectSameOriginFailures(page, server.origin);

  // Take the HTTP cache out of the picture BEFORE going offline, or it — not
  // the precache — is what answers. See clearHttpCache() for the measurement.
  await clearHttpCache(page);

  // KILL THE SERVER FOR REAL, then emulate offline on top of it. The
  // redundancy is deliberate: context.setOffline() is CDP emulation and there
  // is an open report that it does not reach requests made by a service worker
  // (microsoft/playwright#2311) — on its own it could leave this test green
  // with the server still quietly answering, which is the exact false green
  // this file exists to rule out. With the listener gone, the port refuses
  // connections no matter what the emulation does.
  await server.close();
  await context.setOffline(true);

  // The single reload does both jobs: it is what puts the page under the
  // worker's control (the target worker does not call clients.claim(), D2-09)
  // AND it is the offline load. Reloading once online first would let a
  // network-first worker warm its cache with the very files it failed to
  // precache, and this test would pass for the wrong reason.
  await page.reload();

  const startScreen = page.locator('#start-screen');
  await expect(startScreen).toBeVisible();
  await expect(startScreen).toHaveClass(/\bactive\b/);
  await expect(page.locator('.title-main')).toHaveText('GUYS');

  const start = page.locator('#btn-start');
  await expect(start).toBeVisible();

  // The assertion that separates "the game started" from "the HTML painted".
  // #start-screen carries class="active" in the static markup, so it is
  // visible even with no JavaScript at all; only a running bundle can take
  // that class off in response to a click.
  await start.click();
  // Soft, together with the network assertion below, so one run reports both
  // "the game did not start" and the list of requests that died getting there
  // — while this file is red, that pairing is the brief for plan 02-06.
  await expect.soft(startScreen, 'clicar em START tem de tirar a tela do ar')
    .not.toHaveClass(/\bactive\b/);

  // ZERO, with no exception for a third-party origin — there is none left on
  // the loading path since D2-20 brought both font families home. That is what
  // buys the strongest form of this assertion: before D2-20 it would have had
  // to tolerate fonts.gstatic.com failing, and a tolerated failure is a hole.
  expect.soft(failures, 'nenhuma requisição da própria origem pode falhar offline')
    .toEqual([]);
});
