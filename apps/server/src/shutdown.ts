// shutdown.ts — what happens between SIGTERM and the process actually going.
//
// This module exists for the same reason env.ts does, and the reason is not
// tidiness. index.ts is a chain of side effects, so importing it opens a
// database and binds a port; and a shutdown sequence written inline there
// could only be tested by a test willing to be terminated by the very
// process.exit it is trying to assert. So the collaborators arrive as
// ARGUMENTS — the server, the database handle, the way to exit, the way to arm
// a deadline — and this file touches neither `process` nor `setTimeout`.
//
// The measurable consequence is that tests/server-shutdown.test.ts needed no
// tsconfig surgery: server-migrate and server-health each have to be named by
// hand TWICE, excluded in the root tsconfig.json and included in
// apps/server/tsconfig.json, because they drag in Node types. A module with no
// Node globals costs its test neither entry. (Note for anyone tightening this:
// the root program does resolve `process`, since @types/node arrives
// transitively — measured with `tsc --listFiles`. So the discipline here is a
// design rule the compiler happens not to enforce, not one it does.)
//
// The stake is a deploy, not a crash. ops/deploy.sh restarts the unit through
// `sudo -n systemctl` whenever the server bundle changed, and systemd stops a
// unit with SIGTERM — whose default action in Node is to terminate at once.
// Without the sequence below, EVERY deploy severs whatever was mid-response
// (Caddy publishes those as 502s) and never calls sqlite.close(), so no
// checkpoint is written. open.ts sets `synchronous = NORMAL` and accepts losing
// the last transactions to a POWER CUT; a scheduled restart the operator typed
// on purpose is not that, and should not cost the same.

/** The database handle, in the only aspect this module needs: it can be shut. */
export interface ClosableDb {
  close(): unknown;
}

/**
 * The HTTP server, in the only aspect this module needs: it can stop accepting
 * connections and say when the last in-flight one has finished.
 *
 * Structurally satisfied by the `http.Server` that @hono/node-server's serve()
 * returns, which is the object index.ts already exports for phase 3 to attach
 * the `ws` upgrade handler to.
 */
export interface DrainableServer {
  close(onClosed: (error?: Error) => void): unknown;
}

export interface ShutdownDeps {
  server: DrainableServer;
  sqlite: ClosableDb;
  /** Ends the process. `process.exit` on the box; a spy in the test. */
  exit: (code: number) => void;
  /**
   * Arms the deadline that stops a client from postponing the restart, and
   * calls `fire` when it expires. Injected rather than called here because
   * `setTimeout` is a Node global and this module refuses to hold one — and
   * because a test that had to WAIT for a real timer would be a slow test
   * asserting a clock instead of a sequence.
   */
  startWatchdog: (fire: () => void) => void;
}

/**
 * How long a request gets to finish after the signal arrives.
 *
 * Exported so index.ts and the test read the same number instead of two copies
 * of it. The value is bounded on both sides: long enough that an ordinary
 * response is not cut off, and far enough inside systemd's stop timeout
 * (ops/dg2.service names none, so DefaultTimeoutStopSec applies — 90s on a
 * stock Debian/Ubuntu) that the process always stops itself rather than being
 * SIGKILLed, which would be the un-checkpointed stop all over again.
 */
export const SHUTDOWN_GRACE_MS = 5_000;

/**
 * Builds the signal handler. Calling it starts the shutdown; calling it again
 * does nothing.
 *
 * The sequence is: stop accepting, let the in-flight work finish, close the
 * database, exit 0. Idempotency is not decoration — systemd sends SIGTERM and
 * an impatient operator adds a Ctrl+C, and a second `server.close()` invokes
 * its callback with ERR_SERVER_NOT_RUNNING, which would run the exit path a
 * second time against a handle the first one already closed.
 */
export function createShutdown({ server, sqlite, exit, startWatchdog }: ShutdownDeps): () => void {
  let started = false;
  let finished = false;

  const finish = (): void => {
    if (finished) return;
    finished = true;
    // try/finally and not try/catch: a database that refuses to close is worth
    // an error in the journal, but it must not be a reason for the unit to
    // stay up. On the box `exit` is process.exit, which terminates DURING the
    // finally, so the two never actually compete.
    try {
      sqlite.close();
    } finally {
      exit(0);
    }
  };

  return () => {
    if (started) return;
    started = true;
    // Armed BEFORE close() and not after. If close() threw synchronously, a
    // deadline armed afterwards would never be armed at all, and the unit would
    // sit in `deactivating` until systemd's SIGKILL.
    startWatchdog(finish);
    server.close(() => finish());
  };
}
