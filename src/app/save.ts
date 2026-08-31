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
import type { GameMode } from '../sim/types';

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
      if (src[key] !== undefined) dst[key] = src[key];
    }
  }

  function load(): void {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<SaveData>;
        data = defaults();
        adopt(data.settings, parsed.settings);
        adopt(data.progress, parsed.progress);
        data.records = parsed.records || {};
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
