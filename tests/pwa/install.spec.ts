// install.spec.ts — clean installation (INFRA-02, success criterion 2a).
//
// Written against the TARGET behaviour, not the current one. Until plan 02-06
// rewrites public/sw.js this file is RED, and that is the whole point: the
// red-to-green transition is the evidence that the rewrite did what it was
// asked to do. Asserting today's behaviour here would produce a test that
// passes forever and proves nothing.
import { readdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { readCacheEntries, serveDir, waitForActivated, type StaticServer } from './helpers';

const DIST = resolve('dist');

/**
 * Every file under dist/, as root-absolute pathnames, sorted.
 *
 * A real recursive scan and never a hand-written list: the hand-written list
 * IS the defect, documented in the first person by the header of the current
 * public/sw.js, where names that no longer existed made cache.addAll reject
 * the whole install. A test that repeated the mistake could not detect it.
 */
async function distPathnames(dir = DIST, prefix = ''): Promise<string[]> {
  const found: string[] = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const pathname = `${prefix}/${entry.name}`;
    if (entry.isDirectory()) found.push(...await distPathnames(join(dir, entry.name), pathname));
    else found.push(pathname);
  }
  return found.sort();
}

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
