// outcome.ts — the one INSERT behind the `iceOutcome` message, and the only
// place in the signalling leg that touches the database at all.
//
// WHAT THIS BUYS. The relay rate of this group of friends is, today, a number
// borrowed from published surveys: 10-20% of links cannot go direct, which
// composes to 27-49% for a room of four. Every decision about coturn — whether
// it is needed, how much bandwidth it costs, whether the box is big enough —
// is sized against that borrowed number until this table has rows in it
// (D3-14, SALA-05).
//
// Written as a factory with closed-over state, in the shape rooms.ts and
// limiter.ts established: dependencies by argument, no side effect on import,
// and a clock that a test can hold still.
//
// RAW STATEMENTS AND NOT THE QUERY BUILDER, deliberately. Kysely's insert is a
// promise, and the caller is a `try` inside a socket handler — an async
// rejection escapes a synchronous try/catch entirely, so the swallow that
// signalling/index.ts performs would stop swallowing and one failed write would
// become an unhandled rejection. `sqlite.prepare` is synchronous, which is what
// makes `record` able to return a boolean, and it is the same handle and the
// same shape health.ts already uses.
import type { Database as SqliteHandle } from 'better-sqlite3';
import { ICE_ROUTE, type IceOutcome, type PeerInfo } from '@dg2/protocol';

/**
 * How many reports one connection may file before the rest are dropped.
 *
 * An honest peer files ONE per connection: it negotiates, it settles or it
 * fails, it says so. Twenty is a full order of magnitude of slack — enough for
 * a match with several restarts of the negotiation — and it is still small
 * enough that one socket cannot fill the table (T-3-25). Above it `record`
 * returns false and raises nothing: a peer that is over its quota is a peer
 * whose telemetry stops, never a peer whose room ends.
 */
export const MAX_OUTCOMES_PER_PEER = 20;

/** The two values `result` may hold, named once so the check and the DDL agree. */
const RESULTS: readonly string[] = ['connected', 'failed'];

/**
 * Everything about the reporter that the SERVER knows and the message does not
 * get a vote on (T-3-24).
 *
 * `IceOutcome` carries a `code` and a `slot` of its own, and they are IGNORED.
 * A peer that could name the room its report is filed against could pour rows
 * into the telemetry of a room it never entered — and the resulting relay rate
 * would be somebody's opinion rather than a measurement, which is the one thing
 * this table exists to stop being.
 *
 * `accountId` is the unclaimed local ULID of ADR 0002, read from the room's
 * occupant record. It is the only personal identifier D3-14 permits here.
 */
export interface OutcomeSource {
  peerId: string;
  code: string;
  slot: PeerInfo['slot'];
  accountId: string;
}

/** What the caller supplies. Clock and log injected, as everywhere else here. */
export interface OutcomeRecorderDeps {
  sqlite: SqliteHandle;
  log: (event: string, fields?: Record<string, unknown>) => void;
  now: () => number;
  /** Overridable for tests; production uses MAX_OUTCOMES_PER_PEER. */
  maxPerPeer?: number;
}

export interface OutcomeRecorder {
  /**
   * Files one report. Returns whether a write was attempted and survived —
   * NEVER throws, on any input, in any database state.
   */
  record: (row: IceOutcome, from: OutcomeSource) => boolean;
  /**
   * Releases one reporter's quota, called when its socket closes.
   *
   * The quota above is keyed by `peerId`, and a `peerId` lives exactly as long
   * as one connection (ADR 0001). Without this call the map grows by an entry
   * for every socket the process ever accepted and never shrinks — which is the
   * unbounded, remotely-keyed map that limiter.ts refuses to be, wearing a
   * different name. Tying the release to the socket is exact and needs no
   * heuristic: there is no sweep, no eviction and no cap to tune.
   */
  forget: (peerId: string) => void;
}

/**
 * INSERT OR IGNORE, and the OR IGNORE is the whole idempotency story.
 *
 * The id is a client-minted ULID, so reporting the same connection twice — a
 * retry after a dropped socket, a doubled event handler, a reconnect that
 * replays — has to leave one row. This is the same mechanism D-27 gives the
 * gold ledger, for the same reason: the id IS the deduplication, not a label
 * attached to one. The first row wins; a later report of the same connection
 * does not overwrite it.
 */
const INSERT =
  'insert or ignore into ice_outcome ' +
  '(id, room_code, slot, account_id, route, local_candidate, remote_candidate, ' +
  ' protocol, relay_protocol, rtt_ms, result, at) ' +
  'values (@id, @room_code, @slot, @account_id, @route, @local_candidate, ' +
  ' @remote_candidate, @protocol, @relay_protocol, @rtt_ms, @result, @at)';

export function createOutcomeRecorder({
  sqlite,
  log,
  now,
  maxPerPeer = MAX_OUTCOMES_PER_PEER,
}: OutcomeRecorderDeps): OutcomeRecorder {
  /** Reports filed so far, per reporter. Released by `forget` on close. */
  const filed = new Map<string, number>();

  function record(row: IceOutcome, from: OutcomeSource): boolean {
    // Validated HERE and not left to the column, because `route` and `result`
    // are read as enumerations by every query this table exists for. SQLite
    // stores whatever text it is handed, so a thirteenth value would not fail —
    // it would make the relay rate quietly stop adding up to one, which is a
    // wrong answer rather than an error.
    if (!ICE_ROUTE.includes(row.route)) return false;
    if (!RESULTS.includes(row.result)) return false;

    const filedSoFar = filed.get(from.peerId) ?? 0;
    if (filedSoFar >= maxPerPeer) return false;

    try {
      sqlite.prepare(INSERT).run({
        id: row.id,
        // The three the server owns. `row.code` and `row.slot` are on the wire
        // and are not consulted; see OutcomeSource.
        room_code: from.code,
        slot: from.slot,
        account_id: from.accountId,
        route: row.route,
        local_candidate: row.localCandidate,
        remote_candidate: row.remoteCandidate,
        protocol: row.protocol,
        relay_protocol: row.relayProtocol,
        rtt_ms: row.rttMs,
        result: row.result,
        // Stamped by the server. The message carries no timestamp on purpose:
        // one chosen by the reporter would decide where its rows land in the
        // index every other row is read through.
        at: now(),
      });
    } catch (error) {
      // Swallowed, logged, carried on — the shape health.ts established, and
      // the reason is stronger here than there (T-3-26). This runs inside a
      // socket handler in the middle of a match. A write that fails is worth a
      // line in the journal; it must never be worth a dropped room, and
      // telemetry about how a connection went cannot be allowed to end one.
      log('ice-outcome-write', {
        code: from.code,
        error: error instanceof Error ? error.message : String(error),
      });
      return false;
    }

    // Counted only on a write that survived, so a database that is refusing
    // everything does not also spend the peer's quota on nothing.
    filed.set(from.peerId, filedSoFar + 1);
    return true;
  }

  function forget(peerId: string): void {
    filed.delete(peerId);
  }

  return { record, forget };
}
