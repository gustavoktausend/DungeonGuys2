// server-shutdown.test.ts — what the process does when systemd tells it to stop.
//
// This is not a crash path. ops/deploy.sh restarts the unit through
// `sudo -n systemctl` on every deploy whose bundle changed, and systemd's
// default stop is SIGTERM — whose default action in Node is to terminate at
// once. So the untended case is not the rare power cut that open.ts already
// accepts with `synchronous = NORMAL`; it is the routine, deliberate stop that
// happens EVERY time the operator ships, severing whatever was mid-response
// (Caddy reports those as 502s) and never calling sqlite.close(), so no clean
// checkpoint is written on the way out.
//
// The file is deliberately free of Node globals, exactly like
// tests/server-env.test.ts: apps/server/src/shutdown.ts takes its collaborators
// as arguments, so the shutdown sequence is assertable at all — a module that
// reached for `process.exit` itself could only be tested by a test willing to
// be killed by it — and so this file needs no entry in any tsconfig, unlike
// server-migrate and server-health, which have to be named by hand in two.
import { describe, it, expect } from 'vitest';
import { scan } from './scan';
import { createShutdown, SHUTDOWN_GRACE_MS } from '../apps/server/src/shutdown';

// Vite's raw glob, not node:fs — the root tsconfig's `types` is ["vite/client"]
// only, and `?raw` yields the source as a string without executing it. Which
// matters more than usual here: importing index.ts for real opens a database
// and binds a port.
const INDEX = import.meta.glob<string>('../apps/server/src/index.ts', {
  query: '?raw', import: 'default', eager: true,
});

/** index.ts as CODE: comments stripped, string literals kept. */
function indexCode(): string {
  const raw = INDEX['../apps/server/src/index.ts'];
  // Anti-vacuity by LENGTH and never by type: '' is a string, so a glob that
  // silently stopped matching would satisfy every `toContain` below by
  // returning nothing to search.
  expect(raw, 'o glob de index.ts não casou nada').toBeDefined();
  expect(raw?.length ?? 0).toBeGreaterThan(500);
  // Comments stripped, because this very file's prose says SIGTERM repeatedly
  // and index.ts's own comments will too. An audit that cannot tell code from
  // commentary passes on a file that only TALKS about handling the signal.
  return scan(raw as string, true);
}

describe('index.ts liga o desligamento aos sinais', () => {
  it('registra SIGTERM — o sinal que todo deploy manda', () => {
    // systemctl restart sends SIGTERM and waits. Without a handler, Node's
    // default action terminates immediately and every deploy drops whatever
    // was in flight.
    expect(indexCode()).toContain("process.on('SIGTERM'");
  });

  it('registra SIGINT — o mesmo caminho, no Ctrl+C do desenvolvimento', () => {
    // Not for symmetry: it is what makes the sequence exercised by hand in dev
    // the same one systemd exercises in production, instead of the production
    // path being the only one nobody ever runs until it matters.
    expect(indexCode()).toContain("process.on('SIGINT'");
  });

  it('o relógio de guarda não segura o event loop aberto', () => {
    // .unref() on the watchdog timer: a pending timer that is not unref'd is a
    // reason for the process to stay alive, which is the opposite of what a
    // shutdown deadline is for.
    expect(indexCode()).toContain('unref()');
  });
});

/**
 * The collaborators createShutdown() is given, each recording what was asked of
 * it. Plain objects and not mocks: the assertions below are about ORDER and
 * about how many times, which a counter states more plainly than a matcher.
 */
function harness() {
  const calls: string[] = [];
  /** The server's close callback, captured so the test decides when draining ends. */
  let drain: (() => void) | undefined;
  /** The watchdog's payload, captured so the test decides whether it ever fires. */
  let watchdog: (() => void) | undefined;
  let sqliteThrows = false;

  const handler = createShutdown({
    server: {
      close(onClosed) {
        calls.push('server.close');
        drain = () => onClosed();
      },
    },
    sqlite: {
      close() {
        calls.push('sqlite.close');
        if (sqliteThrows) throw new Error('banco ocupado');
      },
    },
    exit: code => {
      calls.push(`exit(${code})`);
    },
    startWatchdog: fire => {
      calls.push('watchdog.start');
      watchdog = fire;
    },
  });

  return {
    calls,
    handler,
    signal: () => handler(),
    finishRequests: () => drain?.(),
    fireWatchdog: () => watchdog?.(),
    breakSqlite: () => { sqliteThrows = true; },
    /** True while the server is still draining — i.e. nothing was closed yet. */
    drainPending: () => drain !== undefined,
  };
}

describe('createShutdown deixa a requisição em curso terminar', () => {
  it('ao receber o sinal fecha o servidor e NÃO fecha o banco ainda', () => {
    const h = harness();
    h.signal();

    // The load-bearing negative. Closing the database here — or exiting — is
    // precisely the "drops in-flight requests" behaviour being removed: a
    // response still being written needs the handle it is reading from.
    expect(h.calls).toEqual(['watchdog.start', 'server.close']);
    expect(h.calls).not.toContain('sqlite.close');
    expect(h.drainPending()).toBe(true);
  });

  it('só fecha o banco e sai depois que a última resposta terminou', () => {
    const h = harness();
    h.signal();
    h.finishRequests();

    // Order, not just membership: the checkpoint has to happen before the exit,
    // or `synchronous = NORMAL` gives back the very transactions open.ts was
    // willing to risk on a power cut but not on a deploy.
    expect(h.calls).toEqual(['watchdog.start', 'server.close', 'sqlite.close', 'exit(0)']);
  });

  it('o relógio de guarda começa ANTES do close, não depois', () => {
    // If server.close() threw synchronously, a watchdog armed afterwards would
    // never be armed at all and the process would hang until systemd's SIGKILL.
    const h = harness();
    h.signal();
    expect(h.calls.indexOf('watchdog.start')).toBeLessThan(h.calls.indexOf('server.close'));
  });
});

describe('createShutdown não deixa um cliente adiar o restart', () => {
  it('o relógio de guarda fecha o banco e sai sozinho', () => {
    // A keep-alive socket that sends nothing keeps server.close() pending
    // forever. Without the deadline the unit sits in `deactivating` until
    // systemd loses patience and SIGKILLs it — which is the un-checkpointed
    // stop all over again, just later.
    const h = harness();
    h.signal();
    h.fireWatchdog();

    expect(h.calls).toEqual(['watchdog.start', 'server.close', 'sqlite.close', 'exit(0)']);
  });

  it('o relógio de guarda que dispara depois de uma saída limpa não faz nada', () => {
    const h = harness();
    h.signal();
    h.finishRequests();
    h.fireWatchdog();

    // Exactly one close and one exit. A second sqlite.close() on a handle that
    // already went would throw inside a timer callback, turning a clean stop
    // into an unhandled exception in the logs of every single deploy.
    expect(h.calls.filter(c => c === 'sqlite.close')).toHaveLength(1);
    expect(h.calls.filter(c => c === 'exit(0)')).toHaveLength(1);
  });

  it('dois sinais seguidos fecham o servidor uma vez só', () => {
    // systemd sends SIGTERM and an impatient operator adds a Ctrl+C. Calling
    // server.close() twice makes the second callback fire with
    // ERR_SERVER_NOT_RUNNING, which would run the exit path against a database
    // the first callback is still using.
    const h = harness();
    h.signal();
    h.signal();
    h.finishRequests();

    expect(h.calls.filter(c => c === 'server.close')).toHaveLength(1);
    expect(h.calls.filter(c => c === 'exit(0)')).toHaveLength(1);
  });
});

describe('createShutdown sai mesmo se o fechamento do banco falhar', () => {
  it('exit(0) acontece mesmo com sqlite.close() lançando', () => {
    const h = harness();
    h.breakSqlite();
    h.signal();

    // The exit is inside a `finally`, so a database that refuses to close
    // cannot leave the unit running. The error is not swallowed either — a
    // failed close is worth a line in the journal — and on the box the two do
    // not compete: `exit` there is process.exit, which terminates DURING the
    // finally, so the throw never gets to propagate. Here `exit` returns, and
    // that is the only reason the throw is observable at all.
    expect(() => h.finishRequests()).toThrow(/banco ocupado/);
    expect(h.calls).toEqual(['watchdog.start', 'server.close', 'sqlite.close', 'exit(0)']);
  });
});

describe('o prazo do relógio de guarda', () => {
  it('cabe folgado dentro da paciência do systemd', () => {
    // ops/dg2.service sets no TimeoutStopSec, so systemd uses
    // DefaultTimeoutStopSec (90s on a stock Debian/Ubuntu). The deadline has to
    // be well under whatever that is, or the watchdog is decoration and the
    // real stop is always a SIGKILL. The floor matters too: a deadline under a
    // second would cut off the very requests the drain exists to protect.
    expect(SHUTDOWN_GRACE_MS).toBeGreaterThanOrEqual(1_000);
    expect(SHUTDOWN_GRACE_MS).toBeLessThanOrEqual(10_000);
  });
});
