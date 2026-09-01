// app.ts — the Hono application, and nothing else.
//
// Split from index.ts deliberately. index.ts opens a real database file, runs
// migrations and binds a port; none of that is something a test should have to
// do to ask what /api/health returns. Importing THIS module has no side effects
// at all, which is why tests/server-health.test.ts can drive the route through
// Hono's built-in app.request() without a socket ever existing.
//
// createApp takes its dependencies as arguments rather than reading them from
// module scope, for the same reason: a module-level singleton holding an open
// database would put the side effect back, one import away.
import { Hono } from 'hono';
import type { Database as SqliteHandle } from 'better-sqlite3';
import { healthBody } from './health';

export interface AppDeps {
  /** An already-open, already-migrated handle. Opening is index.ts's job. */
  sqlite: SqliteHandle;
  /** The git sha of the running release, from DG2_RELEASE. */
  release: string;
}

export function createApp({ sqlite, release }: AppDeps) {
  const app = new Hono();

  // Under /api/, NOT at the root, and that is a deployment decision rather than
  // a stylistic one. ops/Caddyfile already has exactly one `handle /api/*`
  // block reverse-proxying to this process, and the service worker already has
  // exactly one rule excluding /api/ from the cache. A bare /health would need
  // a third `handle` block in Caddy AND its own service-worker exception —
  // two more places to forget, and forgetting the second one means the monitor
  // eventually reads a cached "ok" from a server that is down.
  app.get('/api/health', c => {
    const body = healthBody(sqlite, release);
    // no-store, not no-cache: nothing between the monitor and this process has
    // any business keeping a copy of a liveness answer, not even for
    // revalidation.
    c.header('Cache-Control', 'no-store');
    // 503 and not 200-with-degraded: the monitor's first signal is the status
    // code, and Caddy's `handle_errors` treats upstream failure the same way,
    // so the two halves of the alerting chain agree.
    return c.json(body, body.db ? 200 : 503);
  });

  return app;
}
