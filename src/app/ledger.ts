// ledger.ts — soul gold as an append-only ledger, never as a mutable counter.
//
// The reason is blunt: last-write-wins on a currency loses or duplicates money.
// Two devices that each played offline would each write their own total and one
// would overwrite the other. As a ledger, the balance is a sum, every entry
// carries a client-generated ULID, and applying the same entry twice is a
// no-op — so syncing twice is free and two offline devices simply add up. The
// phase 6 server deduplicates on that same id with UNIQUE(id) (D-27).
//
// A spend is an entry too: negative, with its own id, in the same ledger
// (D-28). That is what makes "restoring an old save does not resurrect gold
// already spent" true without a special case, and it is the audit trail a
// rollback would otherwise not have.
//
// The file has two halves on purpose:
//   - a pure core — balance / appendEvent / compact — over plain arrays, which
//     runs in Node and is where the tests live;
//   - a persistent half, `Ledger`, over its own storage key, kept separate from
//     `dungeonguys2_save_v1` (D-29).
//
// The ledger starts empty on every device: the counter the save used to carry
// is simply dropped, with no code to carry it over and no special entry type
// standing in for it (D-26).
//
// This is account state, not world state — sim/ never sees it.
import { ulid } from './ulid';

/**
 * Why a soul gold entry exists. `compaction` is the one value a client never
 * mints directly: `compact` synthesizes it when it collapses confirmed
 * entries, and calling the sum a `run` would lie to the audit trail.
 */
export type LedgerReason = 'run' | 'mission' | 'season' | 'forge' | 'compaction';

/** The reasons a caller may record. */
export type RecordedReason = Exclude<LedgerReason, 'compaction'>;

/** Where the `accountId` came from — D-31's origin marker, not a fourth id. */
export type AccountOrigin = 'local' | 'server';

export type LedgerEvent = {
  /** Client-generated ULID; the server's UNIQUE(id) dedupe key (D-27). */
  id: string;
  /** Stamped at creation, even while the account is local and unclaimed (D-31). */
  accountId: string;
  /** Positive grants, negative spends. The balance is their sum (D-28). */
  amount: number;
  reason: LedgerReason;
  /** Epoch ms, for display only — the ordering is carried by the ULID. */
  at: number;
  /** Server watermark. Absent means the entry has not been confirmed yet. */
  confirmed?: number;
};

// ─── Pure core (arrays in, arrays out — no storage, no clock) ───────────────

/** The balance is the sum of everything, and nothing else. */
export function balance(events: readonly LedgerEvent[]): number {
  let total = 0;
  for (const e of events) total += e.amount;
  return total;
}

/**
 * Appends an entry unless its id is already present, in which case the ledger
 * is returned unchanged. This local idempotency mirrors the UNIQUE(id) the
 * server applies in phase 6: the id decides, not the contents (T-1-02).
 */
export function appendEvent(events: readonly LedgerEvent[], event: LedgerEvent): LedgerEvent[] {
  if (events.some(e => e.id === event.id)) return events.slice();
  return [...events, event];
}

/**
 * Collapses every server-confirmed entry into one consolidated entry carrying
 * the highest watermark, and keeps the pending ones individually (D-29). The
 * balance is unchanged by construction, since the consolidated amount is the
 * sum of exactly what it replaced.
 *
 * The consolidated entry inherits the identity of the newest confirmed one:
 * this function is pure, so it cannot mint a fresh ULID, and reusing an id the
 * server has already accepted keeps UNIQUE(id) satisfied. That also makes
 * compaction idempotent — a second pass finds one confirmed entry and stops.
 */
export function compact(events: readonly LedgerEvent[]): LedgerEvent[] {
  const confirmed = events.filter(e => e.confirmed !== undefined);
  const pending = events.filter(e => e.confirmed === undefined);
  if (confirmed.length < 2) return events.slice();

  let newest = confirmed[0];
  let watermark = newest.confirmed ?? 0;
  for (const e of confirmed) {
    const w = e.confirmed ?? 0;
    // Ties break on the ULID, which is a temporal ordering already.
    if (w > watermark || (w === watermark && e.id > newest.id)) {
      newest = e;
      watermark = w;
    }
  }

  const consolidated: LedgerEvent = {
    id: newest.id,
    accountId: newest.accountId,
    amount: balance(confirmed),
    reason: 'compaction',
    at: newest.at,
    confirmed: watermark,
  };
  return [consolidated, ...pending];
}

// ─── Persistent half ────────────────────────────────────────────────────────

const REASONS: readonly string[] = ['run', 'mission', 'season', 'forge', 'compaction'];

/** Rejects anything that is not a positive whole amount of soul gold. */
function assertAmount(amount: number): void {
  if (!Number.isInteger(amount) || amount <= 0) {
    throw new RangeError(`ledger: amount must be a positive integer, got ${amount}`);
  }
}

/**
 * Stored entries cross a trust boundary: the browser's storage is editable by
 * hand and restorable from a backup. One malformed amount would turn the whole
 * balance into NaN, and a NaN balance silently unlocks every forge button, so
 * anything that does not parse as an entry is dropped on the way in.
 */
function isLedgerEvent(value: unknown): value is LedgerEvent {
  if (typeof value !== 'object' || value === null) return false;
  const e = value as Record<string, unknown>;
  return typeof e.id === 'string' && e.id.length > 0
    && typeof e.accountId === 'string'
    && typeof e.amount === 'number' && Number.isInteger(e.amount)
    && typeof e.reason === 'string' && REASONS.includes(e.reason)
    && typeof e.at === 'number' && Number.isFinite(e.at)
    && (e.confirmed === undefined
      || (typeof e.confirmed === 'number' && Number.isFinite(e.confirmed)));
}

type StoredLedger = {
  v: 1;
  accountId: string;
  accountOrigin: AccountOrigin;
  events: LedgerEvent[];
};

export const Ledger = (() => {
  // Its own key: the ledger is not part of the save, so restoring one does not
  // rewrite the other (D-29).
  const KEY = 'dungeonguys2_ledger_v1';

  let accountId = '';
  let accountOrigin: AccountOrigin = 'local';
  let events: LedgerEvent[] = [];

  function persist(): void {
    try {
      const payload: StoredLedger = { v: 1, accountId, accountOrigin, events };
      localStorage.setItem(KEY, JSON.stringify(payload));
    } catch { /* storage unavailable */ }
  }

  function load(): void {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as Partial<StoredLedger>;
      if (typeof parsed.accountId === 'string' && parsed.accountId.length > 0) {
        accountId = parsed.accountId;
        accountOrigin = parsed.accountOrigin === 'server' ? 'server' : 'local';
      }
      let restored: LedgerEvent[] = [];
      if (Array.isArray(parsed.events)) {
        // Same append path as the runtime, so a stored file holding the same id
        // twice collapses to one entry instead of paying out twice.
        for (const item of parsed.events) {
          if (isLedgerEvent(item)) restored = appendEvent(restored, item);
        }
      }
      events = restored;
    } catch { /* storage unavailable or unreadable */ }
  }

  function record(amount: number, reason: RecordedReason): LedgerEvent {
    const event: LedgerEvent = { id: ulid(), accountId, amount, reason, at: Date.now() };
    events = appendEvent(events, event);
    persist();
    return event;
  }

  /** Credits soul gold: end of run, mission reward, season seal. */
  function grant(amount: number, reason: RecordedReason): LedgerEvent {
    assertAmount(amount);
    return record(amount, reason);
  }

  /** Debits soul gold. `amount` is the positive cost; the entry is negative. */
  function spend(amount: number, reason: RecordedReason): LedgerEvent {
    assertAmount(amount);
    return record(-amount, reason);
  }

  load();
  if (!accountId) {
    // First boot on this device: the account is minted here and marked as
    // local, so the phase 6 login can swap it for a server one and record
    // where it came from (D-31).
    accountId = ulid();
    accountOrigin = 'local';
    persist();
  }

  return {
    get accountId() { return accountId; },
    get accountOrigin() { return accountOrigin; },
    get events(): readonly LedgerEvent[] { return events; },
    grant, spend, persist,
  };
})();
