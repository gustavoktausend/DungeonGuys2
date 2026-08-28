// screens.ts — which screen is on top, and what it shows.
// Ported from ORIG/engine.js:51-57 (`showScreen`, `hideAllScreens`),
// ORIG/entities.js:131-146 (the `innerHTML` half of `rollLevelChoices` — the
// roll itself stays in sim/xp.ts, T1/T3), ORIG/engine.js:230-248
// (`gameOver`'s screen assembly, world-backed part only) and
// ORIG/entities.js:570-588 (`victory`'s screen assembly, same restriction).
//
// `syncScreens(world, localId)` is the *only* place that decides which
// screen is visible — it polls `world.phase` once per frame (called from
// main.ts's render hook) instead of the original's scattered `showScreen()`
// calls sprinkled through game logic. No sim or game code calls into this
// file's screen-switching; it only ever reads `world`.
import { pickBlessing } from '../sim/xp';
import { STAT_LABELS, PCT_STATS } from '../sim/stats';
import { WAVES_TOTAL } from '../sim/constants';
import { dom } from './dom';
import { renderShop } from './shop';
import { mouseOnly, isTextInput } from './events';
import type { Blessing, Phase, Player, World } from '../sim/types';

const SCREEN_FOR_PHASE: Record<Phase, string | null> = {
  playing: null,
  levelup: 'levelup',
  shop: 'shop',
  gameover: 'gameover',
  victory: 'victory',
};

/** ORIG/engine.js:52-54. */
export function showScreen(name: string | null): void {
  for (const s of Object.values(dom.screens)) s.classList.remove('active');
  if (name && name in dom.screens) {
    dom.screens[name as keyof typeof dom.screens].classList.add('active');
  }
}

/** ORIG/engine.js:57. */
export function hideAllScreens(): void {
  showScreen(null);
}

/** ORIG/items.js:60-63 (`fmtMod`), needed here now that the level-up
 * card markup moved out of sim/xp.ts and into ui/ (T3). */
function fmtMod(k: string, v: number): string {
  const sign = v > 0 ? '+' : '';
  return `${sign}${v}${PCT_STATS.has(k) ? '%' : ''} ${STAT_LABELS[k]}`;
}

/** ORIG/entities.js:136-145 — the markup half of `rollLevelChoices`.
 * The roll itself (which three Blessing objects) is sim/xp.ts's job; this
 * only ever reads `p.levelChoices`, which the sim already filled in. */
function renderLevelupChoices(choices: Blessing[]): void {
  dom.levelupChoices.innerHTML = choices.map((b, i) => {
    const fx = Object.entries(b.mods)
      .map(([k, v]) => `<span class="fx-pos">${fmtMod(k, v as number)}</span>`)
      .join('');
    return `
      <button class="shop-item" data-i="${i}">
        <span class="shop-icon">${b.icon}</span>
        <span class="shop-name">${b.name}</span>
        <span class="shop-effects">${fx}</span>
      </button>`;
  }).join('');
}

/**
 * ORIG/engine.js:230-248 (`gameOver`), world-backed fields only.
 * Save-backed fields (final-best, final-forge, new-record) are left
 * untouched — see task-18-report.md for the persistence task.
 */
function paintGameOver(world: World, p: Player): void {
  dom.finalScore.textContent = String(world.score);
  dom.finalWave.textContent = String(world.wave);
  dom.finalGold.textContent = String(p.gold);
}

/**
 * ORIG/entities.js:570-588 (`victory`), world-backed fields only.
 * Save-backed fields (victory-forge, new-record-victory) are left
 * untouched — see task-18-report.md for the persistence task.
 */
function paintVictory(world: World, p: Player): void {
  dom.victoryScore.textContent = String(world.score);
  dom.victoryGold.textContent = String(p.gold);
}

// The world/localId currently on screen — updated every syncScreens() call,
// read by the click/keydown handlers below (which fire asynchronously,
// outside the render loop, and so can't take these as parameters).
let boundWorld: World | null = null;
let boundLocalId: string | null = null;
let lastPhase: Phase | null = null;
let paintedChoices: Blessing[] | null = null;

/**
 * The one place that decides which screen is on top, driven entirely by
 * `world.phase` (T1: no game code calls `showScreen` directly anymore).
 * Also keeps the level-up screen's three cards in sync with `p.levelChoices`
 * — which can change more than once while `world.phase` stays 'levelup'
 * (queued level-ups re-roll without leaving the phase), so that part is
 * checked independently of the phase-change gate below.
 */
export function syncScreens(world: World, localId: string): void {
  boundWorld = world;
  boundLocalId = localId;
  const p = world.players[localId];

  if (world.phase !== lastPhase) {
    lastPhase = world.phase;
    showScreen(SCREEN_FOR_PHASE[world.phase]);
    // ORIG/engine.js:214,234 + entities.js:576 — hud hides for gameover/
    // victory, stays up through playing/levelup/shop (and pause, which
    // isn't a phase at all — see createPauseControl below).
    dom.hud.classList.toggle('hidden', world.phase === 'gameover' || world.phase === 'victory');
    if (p && world.phase === 'gameover') paintGameOver(world, p);
    if (p && world.phase === 'victory') paintVictory(world, p);
    // ORIG/items.js:8-9 — openShop() painted the shop screen itself the
    // instant it opened; here that's this file's job (T1), the same way
    // paintGameOver/paintVictory are. Buy/heal/reroll clicks redraw
    // themselves after that (ui/shop.ts).
    if (p && world.phase === 'shop') renderShop(world, localId);
  }

  if (p && world.phase === 'levelup' && p.levelChoices !== paintedChoices) {
    paintedChoices = p.levelChoices;
    renderLevelupChoices(p.levelChoices);
  }
}

// ORIG/ui.js:179-183 — click delegation on the level-up choices container.
// Bound once at module load, same as the original's top-level listener.
dom.levelupChoices.addEventListener('click', e => {
  if ((e as MouseEvent).detail === 0) return; // keyboard-activated click, not a real click
  const btn = (e.target as HTMLElement).closest('.shop-item[data-i]') as HTMLElement | null;
  if (!btn || !boundWorld || !boundLocalId) return;
  const p = boundWorld.players[boundLocalId];
  if (p) pickBlessing(boundWorld, p, Number(btn.dataset.i));
});

// ORIG/engine.js:42-44 — the 1/2/3 level-up shortcuts. This lives in ui/,
// not app/input.ts, because it only means anything while this screen is
// open (task-18 boundary #3). `pickBlessing` is itself guarded on
// world.phase === 'levelup', but checking here too avoids querying
// world.players for every keystroke while some other screen is up.
addEventListener('keydown', e => {
  if (isTextInput(e.target)) return;
  if (!boundWorld || boundWorld.phase !== 'levelup') return;
  if (!/^(Digit|Numpad)[123]$/.test(e.code)) return;
  const p = boundWorld.players[boundLocalId ?? ''];
  if (p) pickBlessing(boundWorld, p, Number(e.code.slice(-1)) - 1);
});

let announceTimer: ReturnType<typeof setTimeout> | undefined;

/**
 * ORIG/engine.js:335-341 (`announceWave`). Cancels any previous hide timer
 * first — without that, a fast second announcement gets cut short by the
 * first one's timeout instead of getting its own full 2600ms.
 */
export function announce(text: string): void {
  dom.waveAnnounce.textContent = text;
  dom.waveAnnounce.classList.remove('hidden', 'show');
  void dom.waveAnnounce.offsetWidth; // restart the CSS animation
  dom.waveAnnounce.classList.add('show');
  clearTimeout(announceTimer);
  announceTimer = setTimeout(() => dom.waveAnnounce.classList.remove('show'), 2600);
}

/** ORIG/entities.js:285-288 — the hurt-flash retrigger, lifted out of
 * `damagePlayer` (which now just emits `{ t: 'hurtFlash' }`, T5). */
export function hurtFlash(): void {
  dom.hurtFlash.classList.remove('show');
  void dom.hurtFlash.offsetWidth; // restart the CSS animation
  dom.hurtFlash.classList.add('show');
}

// ─── Social share (ORIG/ui.js:189-224) ───────────────────────────────────────
// Fed by the same `boundWorld`/`boundLocalId` pair `syncScreens` keeps
// current — the share buttons only ever appear on the gameover/victory
// screens this file already paints.
const GAME_URL = 'https://gustavoktausend.github.io/DungeonGuys2/';

function shareMessage(won: boolean, world: World, p: Player): string {
  return won
    ? `🏆 ${p.name} conquistou a masmorra! Zerei o DungeonGuys2 no nível ${p.level} ` +
      `com ${world.score} pontos! Consegue igualar? ⚔️`
    : `⚔️ ${p.name} lutou até a wave ${world.config.mode === 'endless' ? world.wave + ' (ENDLESS)' : world.wave + '/' + WAVES_TOTAL}` +
      ` e caiu no nível ${p.level}, com ${world.score} pontos no DungeonGuys2! Consegue me superar?`;
}

function shareWhatsApp(won: boolean): void {
  if (!boundWorld || !boundLocalId) return;
  const p = boundWorld.players[boundLocalId];
  if (!p) return;
  window.open('https://wa.me/?text=' + encodeURIComponent(shareMessage(won, boundWorld, p) + ' ' + GAME_URL),
    '_blank', 'noopener');
}

function shareTelegram(won: boolean): void {
  if (!boundWorld || !boundLocalId) return;
  const p = boundWorld.players[boundLocalId];
  if (!p) return;
  window.open('https://t.me/share/url?url=' + encodeURIComponent(GAME_URL) +
    '&text=' + encodeURIComponent(shareMessage(won, boundWorld, p)),
    '_blank', 'noopener');
}

dom.btnShareWa.addEventListener('click', mouseOnly(() => shareWhatsApp(false)));
dom.btnShareTg.addEventListener('click', mouseOnly(() => shareTelegram(false)));
dom.btnShareWaVictory.addEventListener('click', mouseOnly(() => shareWhatsApp(true)));
dom.btnShareTgVictory.addEventListener('click', mouseOnly(() => shareTelegram(true)));

/**
 * Pause is an app-layer concern, not a sim phase — `Phase` deliberately has
 * no 'paused' (task-18 boundary #2). Ported from ORIG/engine.js:45-48 (the
 * Escape branch of `onKeyDown`) and :226-227 (`pauseGame`/`resumeGame`),
 * minus everything that touched `gameState` or the RAF loop directly: that
 * becomes `onChange`, which main.ts uses to stop/restart driving the sim
 * while still rendering every frame. This function never touches `World`
 * or the loop — it only flips a local flag and shows/hides the pause
 * screen, exactly the same as any other screen here.
 *
 * Task 20 also wires the pause screen's own buttons here (ORIG/ui.js:
 * 173-176 — Escape-only under task-18), since they all share this one
 * `paused` flag: `deps.onRestart`/`deps.onQuit` are main.ts's game-lifecycle
 * hooks (ORIG/engine.js:228's `quitGame`, :146's `startGame`) — this file
 * only resets `paused` and hands off, it never creates a World itself.
 */
export function createPauseControl(
  // `null` before the first run ever starts (no World exists yet) — Escape
  // must be a no-op on the start screen, same as ORIG's `gameState !==
  // 'playing'` guard defaulting safely when `gameState === 'start'`.
  getPhase: () => Phase | null,
  onChange: (paused: boolean) => void,
  deps: { onRestart(): void; onQuit(): void },
): { isPaused(): boolean } {
  let paused = false;

  function doPause(): void {
    if (getPhase() !== 'playing') return; // ORIG only pauses from 'playing'
    paused = true;
    showScreen('pause');
    onChange(true);
  }
  function doResume(): void {
    paused = false;
    showScreen(null);
    onChange(false);
  }

  addEventListener('keydown', e => {
    if (isTextInput(e.target)) return;
    if (e.code !== 'Escape') return;
    if (!paused) doPause(); else doResume();
  });

  dom.btnResume.addEventListener('click', mouseOnly(doResume));
  // Restart/quit don't route through doResume(): the original goes straight
  // from 'paused' to a fresh run (or the start screen) without an
  // intermediate resume of the *old* world (ORIG/engine.js:228). Only the
  // internal flag needs resetting so a later Escape reads correctly.
  dom.btnPauseRestart.addEventListener('click', mouseOnly(() => { paused = false; deps.onRestart(); }));
  dom.btnQuit.addEventListener('click', mouseOnly(() => { paused = false; deps.onQuit(); }));

  return { isPaused: () => paused };
}
