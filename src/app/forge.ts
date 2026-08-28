// forge.ts — meta progression lives outside the sim. It builds the RunConfig
// a run starts from, owns the forge screen (permanent upgrades bought with
// soul gold, ORIG/ui.js:463-528), and settles a finished run's economy
// (ORIG/engine.js:255-274 / entities.js:570-588, persistence half only —
// the sim never touches Save, see task-20-brief.md's four debts).
import { Save } from './save';
import { Sfx } from './audio';
import { dom } from '../ui/dom';
import { showScreen } from '../ui/screens';
import { FORGE_RATE } from '../sim/constants';
import type { ClassKey, GameMode, RunConfig, World } from '../sim/types';

export function forgeLevel(key: string): number {
  return Save.data.progress.forge[key] ?? 0;
}

export function buildRunConfig(classKey: ClassKey, mode: GameMode, playerName: string): RunConfig {
  return {
    // The seed is the one place a run is allowed to be non-deterministic.
    // In Marco 1 the host picks it and sends it to every client.
    seed: (Math.random() * 0xffffffff) >>> 0,
    mode,
    classKey,
    playerName,
    forge: {
      vigor: forgeLevel('vigor'),
      honed: forgeLevel('honed'),
      fleet: forgeLevel('fleet'),
      startgold: forgeLevel('startgold'),
      merchant: forgeLevel('merchant'),
      wise: forgeLevel('wise'),
      // Debt #4 (task-20-brief.md): RunConfig.forge has seven perks — the
      // brief's own buildRunConfig snippet dropped `golden` (the "double
      // coins" perk, ORIG/ui.js:468). A missing key here would silently
      // zero it out for every run regardless of what the player forged.
      golden: forgeLevel('golden'),
    },
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
  dom.forgeGold.textContent = String(Save.data.progress.soulGold);
}

/** ORIG/ui.js:482-503. */
function renderForge(): void {
  dom.soulGold.textContent = String(Save.data.progress.soulGold);
  dom.forgeList.innerHTML = FORGE_UPGRADES.map(u => {
    const lvl = forgeLevel(u.key);
    const maxed = lvl >= u.max;
    const cost = forgeCost(u.key, u.base);
    const pips = '◆'.repeat(lvl) + '◇'.repeat(u.max - lvl);
    const buy = maxed
      ? `<button class="f-buy maxed" disabled>MAX</button>`
      : `<button class="f-buy" data-key="${u.key}" ${Save.data.progress.soulGold < cost ? 'disabled' : ''}>${cost} ⚒</button>`;
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
  if (Save.data.progress.soulGold < cost) return;
  Save.data.progress.soulGold -= cost;
  Save.data.progress.forge[key] = forgeLevel(key) + 1;
  Save.persist();
  Sfx.play('buy');
  renderForge();
  refreshForgeButton();
}

/** ORIG/ui.js:169-171 — keyboard-activated clicks (Space/Enter on a focused
 * button) carry `detail === 0`; game-flow buttons only respond to real
 * mouse clicks, since Space also doubles as the attack key. */
function mouseOnly(fn: () => void): (e: MouseEvent) => void {
  return e => { if (e.detail !== 0) fn(); };
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
  Save.data.progress.soulGold += forged;
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
