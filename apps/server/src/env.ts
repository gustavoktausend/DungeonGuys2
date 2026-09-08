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
  /**
   * The single origin the signalling upgrade accepts, compared byte for byte
   * against the request's `Origin` header before the handshake completes.
   *
   * ONE STRING, NOT A LIST. This deployment serves the game and the API from
   * one domain (C-9), so an allowlist would be a list of one with room for a
   * second nobody audited. The day a second origin is real, it arrives as a
   * deliberate change here rather than as a comma somebody added.
   */
  origin: string;
  /**
   * The string this process and coturn both know and neither sends, or null
   * when there is no relay configured.
   *
   * NULL IS A LEGITIMATE ANSWER HERE, and it is the only key in this interface
   * of which that is true. Everything else refuses a missing value because a
   * wrong default is worse than a crash; this one is absent on every machine
   * that has no coturn beside it — which is every developer's, and every wave
   * of phase 3 that precedes the box. The server starts, warns once, and serves
   * an ICE configuration with STUN alone.
   */
  turnSecret: string | null;
  /**
   * The realm coturn was configured with, which doubles as the domain the relay
   * and our own STUN are advertised under. Null exactly when turnSecret is.
   */
  turnRealm: string | null;
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
  /**
   * The Vite dev server's origin, and the ONE default in this table that is a
   * development value rather than a production path.
   *
   * That asymmetry is why readEnv refuses it outside development instead of
   * merely defaulting to it: see the paragraph on DG2_ORIGIN below.
   */
  DG2_ORIGIN: 'http://localhost:5173',
} as const;

/**
 * The release value that means "this is a developer's machine".
 *
 * Named rather than spelled twice, because the refusal below and the default
 * above have to agree about it, and two string literals that must agree are one
 * edit away from not agreeing.
 */
const DEV_RELEASE = DEFAULTS.DG2_RELEASE;

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
 * Reads one key that is allowed to be ABSENT but still not allowed to be blank.
 *
 * The sibling of `required()` above, and the two differ in exactly one place on
 * purpose. There is no fallback argument — not "the fallback is empty", but no
 * such parameter at all — because the keys that reach this function are secrets
 * and the domain a secret is scoped to, and A DEFAULT SECRET IS A
 * VULNERABILITY (T-3-10): it would be a value published in a public repository
 * and shared by every deployment that never overrode it. Absent means "this
 * deployment has no relay", which is a real and supported state.
 *
 * Blank is still an error, on the same reasoning `required()` gives: an
 * operator who wrote the line meant something by it. Treating a blank secret as
 * absent would turn one typo into a silently relay-less deployment, and the
 * symptom of that is one specific friend who never manages to join —
 * indistinguishable, from the outside, from ordinary bad luck with NAT.
 */
function optional(source: EnvSource, name: string): string | null {
  const raw = source[name];
  if (raw === undefined) return null;
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

  // DG2_ORIGIN is the allowlist the signalling upgrade checks before completing
  // a WebSocket handshake, and it is the one key here whose default is a
  // DEVELOPMENT value. Left alone in production it would mean the server accepts
  // `http://localhost:5173` and refuses the real site — but the failure that
  // matters is the other direction, and it is why this refusal exists rather
  // than a warning: an origin allowlist that assumes a value on its own is an
  // origin check that checks nothing, and the symptom is a CSWSH defence
  // silently switched off on the box while every test on the developer's
  // machine stays green (T-3-02). Nothing crashes, nothing logs, and the hole
  // is invisible until someone goes looking for it.
  //
  // Refusing at startup makes it impossible to run a non-dev release without an
  // operator having named the origin — the same doctrine as DG2_DB above, where
  // a wrong answer is worse than a crash because a crash is visible.
  const origin = required(source, 'DG2_ORIGIN', DEFAULTS.DG2_ORIGIN);
  if (release !== DEV_RELEASE && origin === DEFAULTS.DG2_ORIGIN) {
    throw new Error(
      `/env/DG2_ORIGIN: ainda é o padrão de desenvolvimento ("${DEFAULTS.DG2_ORIGIN}") ` +
        `com DG2_RELEASE="${release}" — ponha a origem real do site em /etc/dg2/env`,
    );
  }

  // The relay pair. Absent together is the supported state; present together is
  // the configured one; ONE WITHOUT THE OTHER IS REFUSED, and that refusal is
  // the point of reading them as a pair rather than as two keys.
  //
  // A secret with no realm mints a credential coturn will not accept, because
  // the realm is part of what the other side derives. A realm with no secret is
  // an operator who set up coturn and forgot the single line that lets this
  // process talk to it. Both produce the same symptom — the relay never works —
  // and neither produces a single line anywhere saying so. Half a configuration
  // is the one shape that is worse than none, because none is honest.
  const turnSecret = optional(source, 'DG2_TURN_SECRET');
  const turnRealm = optional(source, 'DG2_TURN_REALM');
  if ((turnSecret === null) !== (turnRealm === null)) {
    throw new Error(
      '/env/DG2_TURN_SECRET+DG2_TURN_REALM: as duas andam juntas — ' +
        'defina as duas em /etc/dg2/env ou nenhuma (sem elas o servidor sobe e ' +
        'emite ICE só com STUN)',
    );
  }

  return { dbPath, port, release, origin, turnSecret, turnRealm };
}
