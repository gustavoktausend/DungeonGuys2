// save.ts — unified persistent storage for DungeonGuys2.
// A near-literal port of ORIG/save.js: it was already an isolated module (an
// IIFE) touching only localStorage, so it becomes `export const Save = (()
// => { ... })()` with types.
//
// Key change (resolution, task-20-brief.md): the key becomes
// `dungeonguys2_save_v1`, not `dungeonguys_save_v1`. Both games are served
// from the same `github.io` origin and would otherwise share one
// `localStorage`, letting one game's progress overwrite the other's. The
// original's legacy `dg_*` key migration is dropped entirely — there is no
// legacy save under this key.
import type { GameMode } from '@dg2/sim';

export type ClassRecord = {
  score: number;
  wave: number;
  ewave?: number;
  level: number;
  victories: number;
};

export type SaveData = {
  settings: {
    mute: boolean;
    autoAim: boolean;
    name: string;
    colors: Record<string, [number, number, number]>;
    mode: GameMode;
    volume: number;
    shake: boolean;
  };
  records: Record<string, ClassRecord>;
  progress: {
    runs: number;
    kills: number;
    goldEarned: number;
    bossKills: number;
    victories: number;
    unlocked: string[];
    // Soul gold does not live here: it is an append-only ledger under its own
    // key, because last-write-wins on a currency loses or duplicates money.
    // See app/ledger.ts (D-26 dropped the counter this type used to declare).
    forge: Record<string, number>; // upgrade key -> level
  };
};

/** The shape `Save.recordRun` takes for a finished run. */
export type RunResult = {
  score: number;
  wave: number;
  level: number;
  won: boolean;
  kills: number;
  gold: number;
  mode: GameMode;
};

export const Save = (() => {
  const KEY = 'dungeonguys2_save_v1';

  const defaults = (): SaveData => ({
    settings: { mute: false, autoAim: false, name: '', colors: {}, mode: 'campaign', volume: 0.5, shake: true },
    records: {}, // per class: { score, wave, level, victories }
    progress: {
      runs: 0, kills: 0, goldEarned: 0, bossKills: 0, victories: 0,
      unlocked: ['mage', 'archer', 'warrior'],
      forge: {}, // upgrade key -> level
    },
  });

  let data: SaveData = defaults();

  function persist(): void {
    try { localStorage.setItem(KEY, JSON.stringify(data)); } catch { /* storage unavailable */ }
  }

  /**
   * Copies only the keys `defaults()` still declares. `Object.assign` would
   * carry over whatever else happens to sit in storage, so a field the schema
   * has dropped would be read back and written out again on every persist —
   * which is how a discarded currency counter comes back to life two phases
   * later, next to the ledger that now owns the same money.
   */
  function adopt(target: object, source: unknown): void {
    if (typeof source !== 'object' || source === null) return;
    const src = source as Record<string, unknown>;
    const dst = target as Record<string, unknown>;
    for (const key of Object.keys(dst)) {
      const incoming = src[key];
      if (incoming === undefined) continue;
      if (!sameShape(dst[key], incoming)) continue;
      dst[key] = incoming;
    }
  }

  /**
   * `localStorage` is a trust boundary, exactly as app/ledger.ts treats it:
   * anything with devtools can rewrite it, and so can a half-finished write
   * from a previous version. The failure this guards is not hypothetical —
   * a string where `progress.forge[key]` should hold a number reaches
   * app/forge.ts's `forgeCost`, becomes `NaN`, and `NaN < cost` is `false`,
   * which unlocks every buy button and then throws out of `Ledger.spend`'s
   * amount assertion inside a click handler.
   *
   * The rule is deliberately shallow-but-strict: the incoming value must have
   * the same runtime shape as the default it replaces. Defaults are the
   * schema, so nothing here needs updating when SaveData grows a field.
   */
  function sameShape(expected: unknown, incoming: unknown): boolean {
    if (typeof expected !== typeof incoming) return false;
    if (typeof expected === 'number') return Number.isFinite(incoming);
    if (Array.isArray(expected)) {
      if (!Array.isArray(incoming)) return false;
      // A non-empty default names the element type it wants (`unlocked` is
      // string[]). An empty one has nothing to say, so any storable leaf goes.
      const sample = expected[0];
      return sample === undefined
        ? incoming.every(isStorable)
        : incoming.every(v => typeof v === sample && isStorable(v));
    }
    if (expected !== null && typeof expected === 'object') {
      if (incoming === null || Array.isArray(incoming)) return false;
      // The string-keyed maps (`colors`, `forge`) start empty, so there is no
      // default entry to compare against — validate the values themselves.
      // Both hold numbers or numeric tuples; neither ever holds a string, and
      // a string is precisely what turns into NaN downstream.
      return Object.values(incoming as Record<string, unknown>).every(isNumericLeaf);
    }
    return true; // boolean and string match on typeof alone
  }

  /** Finite number, or a tuple of them — what `colors` and `forge` may hold. */
  function isNumericLeaf(v: unknown): boolean {
    if (typeof v === 'number') return Number.isFinite(v);
    return Array.isArray(v) && v.every(n => typeof n === 'number' && Number.isFinite(n));
  }

  /** A leaf an array-typed field may hold: finite number, string, or boolean. */
  function isStorable(v: unknown): boolean {
    if (typeof v === 'number') return Number.isFinite(v);
    return typeof v === 'string' || typeof v === 'boolean';
  }

  /** Drops entries that would make a score table render or compare as NaN. */
  function adoptRecords(source: unknown): Record<string, ClassRecord> {
    if (typeof source !== 'object' || source === null || Array.isArray(source)) return {};
    const out: Record<string, ClassRecord> = {};
    for (const [cls, rec] of Object.entries(source as Record<string, unknown>)) {
      if (typeof rec !== 'object' || rec === null || Array.isArray(rec)) continue;
      const r = rec as Record<string, unknown>;
      const num = (k: string): boolean => typeof r[k] === 'number' && Number.isFinite(r[k]);
      if (!num('score') || !num('wave') || !num('level') || !num('victories')) continue;
      if (r.ewave !== undefined && !num('ewave')) continue;
      out[cls] = rec as ClassRecord;
    }
    return out;
  }

  function load(): void {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<SaveData>;
        data = defaults();
        adopt(data.settings, parsed.settings);
        adopt(data.progress, parsed.progress);
        data.records = adoptRecords(parsed.records);
      }
    } catch { data = defaults(); }
  }

  function classRecord(cls: string): ClassRecord | null {
    return data.records[cls] || null;
  }

  // registers a finished run; returns true when it set a new class score record
  function recordRun(cls: string, run: RunResult): boolean {
    data.progress.runs++;
    data.progress.kills += run.kills;
    data.progress.goldEarned += run.gold;
    if (run.won) data.progress.victories++;

    const prev = data.records[cls];
    const newBest = run.score > 0 && (!prev || run.score > prev.score);
    const r: ClassRecord = prev || { score: 0, wave: 0, level: 0, victories: 0 };
    r.score = Math.max(r.score, run.score);
    r.level = Math.max(r.level, run.level);
    if (run.mode === 'endless') r.ewave = Math.max(r.ewave || 0, run.wave);
    else r.wave = Math.max(r.wave, run.wave);
    if (run.won) r.victories = (r.victories || 0) + 1;
    data.records[cls] = r;
    persist();
    return newBest;
  }

  function isUnlocked(cls: string): boolean {
    return data.progress.unlocked.includes(cls);
  }

  function unlock(cls: string): boolean {
    if (isUnlocked(cls)) return false;
    data.progress.unlocked.push(cls);
    persist();
    return true;
  }

  load();
  return {
    get data() { return data; },
    persist, recordRun, classRecord, isUnlocked, unlock,
  };
})();
