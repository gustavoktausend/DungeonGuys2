// tests/pwa/helpers.ts — the instruments the PWA specs measure with.
//
// Written in the shape of tests/helpers.ts: a .ts module with no `.test.` in
// the name, exporting fixtures plus the comment that explains WHY each fixture
// is what it is. Two of those "why"s are load-bearing here.
//
// 1. WHY serveDir() RETURNS A close().
//    context.setOffline() is CDP emulation, and there is an open report that it
//    does not reach requests made by a service worker
//    (microsoft/playwright#2311). A test that trusted it could go green with
//    the server still answering — the exact false green offline.spec.ts exists
//    to rule out. So the offline spec KILLS this server for real and calls
//    setOffline(true) on top, as redundancy. close() also destroys live
//    keep-alive sockets: without that, "closed" only means "stops accepting".
//
// 2. WHY AN UNKNOWN PATH IS A 404, NEVER index.html.
//    ops/Caddyfile deliberately does not use try_files (the game has no client
//    routing, and a 200 index.html at a wrong URL is exactly what a service
//    worker would then store). A test server that fell back to index.html
//    would prove a behaviour production does not have.
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import type { AddressInfo } from 'node:net';
import { extname, resolve, sep } from 'node:path';
import type { Page } from '@playwright/test';

/** A handler for a dynamically registered path, bypassing the filesystem. */
export type RouteHandler = (req: IncomingMessage, res: ServerResponse) => void | Promise<void>;

export interface StaticServer {
  /** `http://127.0.0.1:<ephemeral port>` — a secure context, so no TLS needed. */
  readonly origin: string;
  /**
   * Swaps the directory being served WITHOUT closing the server, which is what
   * lets a spec stage "old build -> new build" on the same origin and the same
   * port. A new port would be a new origin, and the service worker under test
   * would not be the one installed a moment earlier.
   */
  setRoot(dir: string): void;
  /**
   * Registers a dynamic path — for serving /api/health, or for forcing a 502
   * on a named path (both used by the api-isolation spec of plan 02-09).
   * Dynamic routes win over files.
   */
  route(pathname: string, handler: RouteHandler): void;
  /** Stops the listener AND destroys open sockets. Resolves when truly gone. */
  close(): Promise<void>;
}

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.md': 'text/markdown; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
};

/**
 * The shell: stable names whose bytes change build to build. A proxy or the
 * HTTP cache holding one of these is how a "new" precache ends up full of the
 * previous build.
 */
const NO_CACHE = new Set(['/', '/index.html', '/sw.js', '/manifest.json']);

function notFound(res: ServerResponse): void {
  res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end('404');
}

export async function serveDir(dir: string): Promise<StaticServer> {
  let root = resolve(dir);
  const routes = new Map<string, RouteHandler>();

  async function handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const { pathname } = new URL(req.url ?? '/', 'http://127.0.0.1');
    const decoded = decodeURIComponent(pathname);

    const dynamic = routes.get(decoded);
    if (dynamic) {
      await dynamic(req, res);
      return;
    }

    // '/' is the only rewrite there is. Everything else maps one to one, so a
    // typo in a precache list shows up as the 404 it really is.
    const file = resolve(root, decoded === '/' ? 'index.html' : decoded.slice(1));
    if (file !== root && !file.startsWith(root + sep)) {
      notFound(res); // path traversal out of the served root
      return;
    }

    let body: Buffer;
    try {
      const info = await stat(file);
      if (!info.isFile()) {
        notFound(res);
        return;
      }
      body = await readFile(file);
    } catch {
      notFound(res);
      return;
    }

    res.writeHead(200, {
      'Content-Type': MIME[extname(file).toLowerCase()] ?? 'application/octet-stream',
      'Content-Length': body.byteLength,
      'Cache-Control': NO_CACHE.has(decoded) ? 'no-cache' : 'public, max-age=31536000',
    });
    res.end(body);
  }

  const server = createServer((req, res) => {
    void handle(req, res).catch(() => {
      if (!res.headersSent) res.writeHead(500);
      res.end();
    });
  });

  await new Promise<void>(done => server.listen(0, '127.0.0.1', done));
  const { port } = server.address() as AddressInfo;

  return {
    origin: `http://127.0.0.1:${port}`,
    setRoot(next: string): void {
      root = resolve(next);
    },
    route(pathname: string, handler: RouteHandler): void {
      routes.set(pathname, handler);
    },
    close(): Promise<void> {
      return new Promise<void>((done, fail) => {
        server.close(err => (err ? fail(err) : done()));
        // Ordered after close() on purpose: stop accepting first, then drop
        // the keep-alive sockets Chromium is holding. Skipping this leaves the
        // callback pending forever and the "dead" server still answering.
        server.closeAllConnections();
      });
    },
  };
}

/**
 * Resolves once this origin has an ACTIVATED service worker.
 *
 * The explicit deadline is not decoration: navigator.serviceWorker.ready never
 * rejects, so an install() that throws — a single 404 in a precache list is
 * enough — would surface as a bare "Test timeout exceeded" with nothing to act
 * on. Failing here names the cause instead.
 */
export async function waitForActivated(page: Page, timeoutMs = 15_000): Promise<void> {
  await page.evaluate(async (ms: number) => {
    const deadline = new Promise<never>((_, reject) => {
      setTimeout(
        () => reject(new Error(`nenhum service worker ativou em ${ms} ms — o install() rejeitou?`)),
        ms,
      );
    });

    const activated = (async () => {
      const registration = await navigator.serviceWorker.ready;
      const worker = registration.active;
      if (!worker) throw new Error('a registration ficou pronta sem worker ativo');
      if (worker.state === 'activated') return;
      await new Promise<void>(done => {
        worker.addEventListener('statechange', () => {
          if (worker.state === 'activated') done();
        });
      });
    })();

    await Promise.race([activated, deadline]);
  }, timeoutMs);
}

/**
 * Every cache of this origin, by name, with the PATHNAMES it holds — sorted.
 *
 * Pathnames and not full URLs because the port is ephemeral: an expected list
 * written against `http://127.0.0.1:52341/...` would be a different string on
 * the next run.
 */
export async function readCacheEntries(page: Page): Promise<Record<string, string[]>> {
  return page.evaluate(async () => {
    const entries: Record<string, string[]> = {};
    for (const name of await caches.keys()) {
      const cache = await caches.open(name);
      const requests = await cache.keys();
      entries[name] = requests.map(request => new URL(request.url).pathname).sort();
    }
    return entries;
  });
}

/**
 * Accumulates `requestfailed` for THIS origin only, ignoring everything else.
 *
 * Since D2-20 brought the two font families home there is no third party left
 * on the loading path, so the filter is belt and braces rather than an excuse
 * list — which is precisely what lets offline.spec.ts assert zero failures
 * with no exceptions at all. Returns a live array: read it after the actions.
 */
export function collectSameOriginFailures(page: Page, origin: string): string[] {
  const failures: string[] = [];
  page.on('requestfailed', request => {
    if (!request.url().startsWith(origin)) return;
    const reason = request.failure()?.errorText ?? 'motivo desconhecido';
    failures.push(`${new URL(request.url()).pathname} — ${reason}`);
  });
  return failures;
}
