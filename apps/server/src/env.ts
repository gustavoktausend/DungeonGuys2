// env.ts — /etc/dg2/env turned into typed configuration, in one place.
//
// This lives apart from index.ts for a reason that is about testability and
// not about tidiness: index.ts is a chain of side effects, so importing it
// opens a database, runs migrations and binds a port. Reading the environment
// is the one link of that chain whose WRONG answer looks exactly like a right
// one, so it is the one link that has to be callable on its own.
//
// The module takes the environment as an argument and never touches `process`
// itself, so tests/server-env.test.ts sits in the repository-wide tests/
// program alongside the client tests instead of in the Node-typed program of
// apps/server/tsconfig.json.
//
// That is a DESIGN RULE, not something the compiler holds up, and the earlier
// wording here claimed the second. Measured: planting `process.env.HOME` in
// this file leaves the root `tsc --noEmit` green, because @types/node reaches
// the root program transitively despite `types: ["vite/client"]` —
// `tsc --listFiles` shows node/globals.d.ts in it. So nothing would refuse a
// Node global here; what the rule buys is that this file stays callable from
// any program, which is why its test needed neither of the two hand-written
// tsconfig entries that server-migrate and server-health each need twice.
// apps/server/src/shutdown.ts carries the same rule and the same note.

/** Everything index.ts needs from the environment, already validated. */
export interface ServerEnv {
  /** The SQLite file openDb() opens. Never empty. */
  dbPath: string;
  /** A TCP port in [1, 65535]. Never 0 — see readEnv. */
  port: number;
  /** The git sha /api/health publishes. Never empty. */
  release: string;
}

/** The shape of `process.env`, spelled without needing Node's types. */
export type EnvSource = Record<string, string | undefined>;

/**
 * The production defaults, exported so a test asserts the same strings the
 * process uses rather than a copy of them.
 */
export const DEFAULTS = {
  DG2_DB: '/var/lib/dg2/dg2.db',
  DG2_PORT: '8080',
  DG2_RELEASE: 'dev',
} as const;

/**
 * Reads one key, treating "defined and blank" as an ERROR rather than as
 * absent.
 *
 * `??` — which is what this replaces — falls back only on null/undefined, and
 * a systemd `EnvironmentFile` does not produce undefined. `DG2_DB=` with
 * nothing after it, a value commented out by deleting the right-hand side, a
 * trailing key: every one of those arrives as the empty string, and every one
 * of them is an ordinary edit to the single file ops/README.md §5 asks the
 * operator to hand-write.
 *
 * Blank is not defaulted back to the production value either, and that is the
 * deliberate half. An operator who wrote the key meant something by it; taking
 * the default would mean the file says one thing and the process does another,
 * which is the same silence with a different shape.
 */
function required(source: EnvSource, name: string, fallback: string): string {
  const raw = source[name];
  if (raw === undefined) return fallback;
  const value = raw.trim();
  if (value === '') {
    throw new Error(
      `/env/${name}: definida e vazia — ponha um valor em /etc/dg2/env ou apague a linha`,
    );
  }
  return value;
}

/**
 * Validates the environment or throws. The caller decides what a failure
 * means; on the box it means exit 1 before anything is opened or bound.
 *
 * The port is the case worth spelling out. `Number('')` is 0, and 0 is a
 * PERFECTLY VALID argument to listen(2) meaning "pick any free port" — so the
 * unit would report `active`, nothing would answer on 8080, Caddy would return
 * 503, and every symptom would point at Caddy. It is refused explicitly for
 * that reason, alongside the digits-only test that also rejects '0x1f', '8e3'
 * and ' 80 80'.
 */
export function readEnv(source: EnvSource): ServerEnv {
  const dbPath = required(source, 'DG2_DB', DEFAULTS.DG2_DB);
  const release = required(source, 'DG2_RELEASE', DEFAULTS.DG2_RELEASE);

  const rawPort = required(source, 'DG2_PORT', DEFAULTS.DG2_PORT);
  const port = Number(rawPort);
  if (!/^[0-9]+$/.test(rawPort) || !Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`/env/DG2_PORT: "${rawPort}" não é uma porta entre 1 e 65535`);
  }

  return { dbPath, port, release };
}
