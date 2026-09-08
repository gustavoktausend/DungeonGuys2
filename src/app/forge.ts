// forge.ts — meta progression lives outside the sim. It builds the RunConfig
// a run starts from, owns the forge screen (permanent upgrades bought with
// soul gold, ORIG/ui.js:463-528), and settles a finished run's economy
// (ORIG/engine.js:255-274 / entities.js:570-588, persistence half only —
// the sim never touches Save, see task-20-brief.md's four debts).
import { Save } from './save';
import { balance, Ledger } from './ledger';
import { Sfx } from './audio';
import { dom } from '../ui/dom';
import { showScreen } from '../ui/screens';
import { mouseOnly } from '../ui/events';
import { PLAYER_SLOT } from '@dg2/protocol';
import { FORGE_RATE } from '@dg2/sim';
import type { ClassKey, ForgeLevels, GameMode, RunConfig, World } from '@dg2/sim';

export function forgeLevel(key: string): number {
  return Save.data.progress.forge[key] ?? 0;
}

/**
 * THIS machine's seven permanent upgrades, read from Save.
 *
 * Exported because it is also what travels in the room's `hello` (net/lobby.ts
 * validates it on arrival): the forge is PER PLAYER, so four people in one
 * room bring four different sets to the same world, and a run-wide value would
 * silently give everyone the same one.
 *
 * Debt #4 (task-20-brief.md): a seat's forge has SEVEN perks — the brief's own
 * buildRunConfig snippet dropped `golden` (the "double coins" perk,
 * ORIG/ui.js:468). A missing key here would silently zero it out for every run
 * regardless of what the player forged.
 */
export function localForge(): ForgeLevels {
  return {
    vigor: forgeLevel('vigor'),
    honed: forgeLevel('honed'),
    fleet: forgeLevel('fleet'),
    startgold: forgeLevel('startgold'),
    merchant: forgeLevel('merchant'),
    wise: forgeLevel('wise'),
    golden: forgeLevel('golden'),
  };
}

/** One person a run is being assembled for, before seats are handed out. */
export interface RunOccupant {
  name: string;
  cls: ClassKey;
  /**
   * Absent means THIS machine's player — the only occupant whose permanent
   * upgrades live in this machine's Save. Everyone else's arrived over the
   * wire in `hello` and is passed in here already validated.
   */
  forge?: ForgeLevels;
}

/**
 * The run manifest, assembled from the people in the room.
 *
 * THE ARRAY IS THE CANONICAL ORDER (FORM-02/D-13) — `step()` iterates it, not
 * `Object.keys(players)`, so who gets which draw from `world.rng` is decided
 * by the manifest instead of by the order in which people happened to join.
 * Seats come from `PLAYER_SLOT`, the frozen table whose INDEX is the seat, and
 * never from a loose string.
 *
 * SOLO IS A ROOM OF ONE (D3-04). It is not a second code path with a second
 * shape: single player passes one occupant and gets a one-seat manifest, which
 * is exactly what makes single player and co-op share `beginRun` in main.ts.
 *
 * THE SEED IS AN ARGUMENT AND NOT A DRAW MADE HERE. It is the one place a run
 * is allowed to be non-deterministic, and the authority is what emits it and
 * sends it to every peer in `startRun` — every machine of a room builds the
 * same world from the same number, and the tick-0 fingerprint proves it did.
 * A machine that decided its own would diverge from the first frame, silently.
 */
export function buildRunConfig(
  seed: number, mode: GameMode, occupants: readonly RunOccupant[],
): RunConfig {
  if (occupants.length < 1 || occupants.length > PLAYER_SLOT.length) {
    throw new Error(`uma run tem de 1 a ${PLAYER_SLOT.length} jogadores, não ${occupants.length}`);
  }
  return {
    seed,
    mode,
    players: occupants.map((who, i) => ({
      id: PLAYER_SLOT[i],
      name: who.name,
      cls: who.cls,
      forge: who.forge ?? localForge(),
    })),
  };
}

// ─── Forge screen (permanent upgrades bought with soul gold) ────────────────
// ORIG/ui.js:464-472.
const FORGE_UPGRADES: { key: string; icon: string; name: string; max: number; base: number; fmt: (l: number) => string }[] = [
  { key: 'vigor', icon: '❤', name: 'STARTING VIGOR', max: 5, base: 50, fmt: l => `+${l * 10} STARTING MAX HP` },
  { key: 'honed', icon: '⚔', name: 'HONED WEAPONS', max: 5, base: 60, fmt: l => `+${l * 2}% DAMAGE` },
  { key: 'fleet', icon: '👢', name: 'FLEET FOOT', max: 3, base: 55, fmt: l => `+${l * 2}% SPEED` },
  { key: 'golden', icon: '🪙', name: 'GOLDEN TOUCH', max: 3, base: 70, fmt: l => `${l * 10}% CHANCE OF DOUBLE COINS` },
  { key: 'wise', icon: '📜', name: 'WISE SOUL', max: 3, base: 70, fmt: l => `+${l * 10}% XP` },
  { key: 'merchant', icon: '🛒', name: 'MERCHANT FRIEND', max: 3, base: 80, fmt: l => `-${l * 5}% SHOP PRICES` },
  { key: 'startgold', icon: '💰', name: 'INHERITANCE', max: 3, base: 45, fmt: l => `START WITH +${l * 15} GOLD` },
];

function forgeCost(key: string, base: number): number {
  return Math.round(base * Math.pow(1.7, forgeLevel(key)));
}

/** ORIG/ui.js:478-480 — kept in sync with the start screen's small counter. */
function refreshForgeButton(): void {
  dom.forgeGold.textContent = String(balance(Ledger.events));
}

/** ORIG/ui.js:482-503. */
function renderForge(): void {
  // Read once: the balance is a sum over the ledger, not a field.
  const soulGold = balance(Ledger.events);
  dom.soulGold.textContent = String(soulGold);
  dom.forgeList.innerHTML = FORGE_UPGRADES.map(u => {
    const lvl = forgeLevel(u.key);
    const maxed = lvl >= u.max;
    const cost = forgeCost(u.key, u.base);
    const pips = '◆'.repeat(lvl) + '◇'.repeat(u.max - lvl);
    const buy = maxed
      ? `<button class="f-buy maxed" disabled>MAX</button>`
      : `<button class="f-buy" data-key="${u.key}" ${soulGold < cost ? 'disabled' : ''}>${cost} ⚒</button>`;
    return `
      <div class="forge-row">
        <span class="f-icon">${u.icon}</span>
        <span class="f-info">
          <span class="f-name">${u.name}</span>
          <span class="f-desc">${u.fmt(Math.max(1, lvl + (maxed ? 0 : 1)))}</span>
          <span class="f-pips">${pips}</span>
        </span>
        ${buy}
      </div>`;
  }).join('');
}

/** ORIG/ui.js:505-516. */
function buyForge(key: string): void {
  const u = FORGE_UPGRADES.find(x => x.key === key);
  if (!u || forgeLevel(key) >= u.max) return;
  const cost = forgeCost(key, u.base);
  if (balance(Ledger.events) < cost) return;
  // D-28: the spend is an entry of its own in the same ledger, negative and
  // with its own id — never a subtraction on a field. The forge level is
  // derived state, written in the same sequence as the spend, so a level can
  // never exist without the entry that paid for it.
  Ledger.spend(cost, 'forge');
  Save.data.progress.forge[key] = forgeLevel(key) + 1;
  Save.persist();
  Sfx.play('buy');
  renderForge();
  refreshForgeButton();
}

dom.btnForge.addEventListener('click', mouseOnly(() => {
  renderForge();
  showScreen('forge');
}));
dom.btnForgeClose.addEventListener('click', mouseOnly(() => showScreen('start')));
dom.forgeList.addEventListener('click', e => {
  if ((e as MouseEvent).detail === 0) return;
  const btn = (e.target as HTMLElement).closest('.f-buy[data-key]') as HTMLElement | null;
  if (btn?.dataset.key) buyForge(btn.dataset.key);
});
refreshForgeButton();

// ─── Run settlement (Step 4 — ORIG/engine.js:230-248, entities.js:570-588) ──
/**
 * Called by main.ts's event sink when it observes `world.phase` become
 * 'gameover' or 'victory' (the sim itself never calls this — it only ever
 * does `setPhase(world, 'gameover' | 'victory')`, see sim/run.ts and
 * sim/player.ts). Converts this run's gold into soul gold at `FORGE_RATE`,
 * records the run against the player's class, and paints the Save-backed
 * fields task-18 left empty on whichever final screen applies.
 */
export function finishRun(world: World, localId: string, won: boolean): void {
  const p = world.players[localId];
  if (!p) return;

  const forged = Math.round(world.runGoldEarned * FORGE_RATE);
  // A run that forged nothing writes no entry: the ledger only accepts
  // positive amounts, and a zero-value entry is noise in the audit trail.
  if (forged > 0) Ledger.grant(forged, 'run');
  const newBest = Save.recordRun(p.cls, {
    score: world.score,
    wave: world.wave,
    level: p.level,
    won,
    kills: world.runKills,
    gold: world.runGoldEarned,
    mode: world.config.mode,
  });
  refreshForgeButton();

  if (won) {
    dom.victoryForge.textContent = '+' + forged + ' ⚒';
    dom.newRecordVictory.classList.toggle('hidden', !newBest);
  } else {
    dom.finalForge.textContent = '+' + forged + ' ⚒';
    dom.finalBest.textContent = String(Save.classRecord(p.cls)?.score ?? 0);
    dom.newRecord.classList.toggle('hidden', !newBest);
  }
}
