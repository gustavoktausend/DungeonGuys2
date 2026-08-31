import './style.css';
import { createWorld, drainEvents, DT_MS, createPlayer, startRun } from '@dg2/sim';
import { startLoop } from './app/loop';
import { createInput } from './app/input';
import { createEventSink } from './app/events';
import { Sfx } from './app/audio';
import { Save } from './app/save';
import { buildRunConfig, finishRun } from './app/forge';
import { createCamera, updateCamera, type Camera } from './render/camera';
import { loadSprites } from './render/sprites';
import { buildTilemap } from './render/tilemap';
import { createFx } from './render/fx';
import { render } from './render/index';
import { updateHud } from './ui/hud';
import { syncScreens, announce, hurtFlash, showScreen, createPauseControl } from './ui/screens';
import { dom } from './ui/dom';
import { setupTouch } from './ui/touch';
import { getSelection, initStartScreen, refreshClassRecord, tryUnlock } from './ui/settings';
import { mouseOnly } from './ui/events';
import type { ClassKey, GameMode, Player, World } from '@dg2/sim';

const canvas = document.getElementById('game-canvas') as HTMLCanvasElement;
const ctx = canvas.getContext('2d')!;

function resize() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  ctx.imageSmoothingEnabled = false;
}
resize();
addEventListener('resize', resize);

// ─── PWA (Step 6, task-20-brief.md) ───────────────────────────────────────
// `import.meta.env.BASE_URL` is Vite's `base` (vite.config.ts: '/DungeonGuys2/'
// in production, '/' in dev) — registering a relative 'sw.js' would resolve
// against the current page instead and 404 once the app is nested under a
// repo subpath. ORIG/ui.js:282-284.
if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  navigator.serviceWorker.register(import.meta.env.BASE_URL + 'sw.js').catch(() => {});
}

const touch = setupTouch(canvas);

await loadSprites();
initStartScreen(); // paints the class-select color preview now that SHEET/COP_SHEET are decoded
// No buildTilemap() here: nothing renders until beginRun(), which builds a
// fresh tilemap itself (line ~112). Painting a 2400x1600 offscreen canvas at
// module load only to discard it on the first run was pure waste.

// ─── Game lifecycle ───────────────────────────────────────────────────────
// Nothing below creates a World until "START GAME" (or a restart button) is
// clicked — task-18's report noted the start/forge/stats screens have no
// `Phase` of their own, since the sim never had a menu state. This is the
// piece that actually gates world-creation behind that screen, replacing
// the hardcoded dev world earlier tasks booted straight into.
let world: World;
let player: Player;
let cam: Camera;
let input: ReturnType<typeof createInput>;
let fx: ReturnType<typeof createFx>;
let sink: ReturnType<typeof createEventSink>;
let stopSimLoop: (() => void) | null = null;
let pauseRaf = 0;
let gameStarted = false; // false until the first beginRun() — guards `world.phase` reads

/**
 * The slot this machine plays. FORM-01/D-30 numbers the slots p0..p3, and this
 * app has always occupied the first one — it just used to spell that slot with
 * a one-based name, repeated as a literal in six places.
 *
 * The name matters more than the number. `playerId` is the slot the AUTHORITY
 * assigns and the replay knows; it is not `accountId` (the durable server ULID,
 * which never enters the World) and it is not `peerId` (a transport handle that
 * dies with the connection). When phase 4 makes this value arrive from a lobby
 * instead of being a constant, this is the single line that stops being one.
 */
const LOCAL_SLOT = 'p0';

/**
 * The frame drawn every requestAnimationFrame while the sim is advancing.
 * `updateHud`/`syncScreens` are called once per frame here, reading `world`
 * — no game or sim code pushes to the DOM (T1, task-18-brief.md).
 */
function frame(w: World, alpha: number): void {
  updateHud(w, LOCAL_SLOT);
  syncScreens(w, LOCAL_SLOT);
  updateCamera(cam, player, canvas.width, canvas.height);
  render(w, cam, alpha, ctx, fx);
}

/** Redraws the frozen world while paused — no HUD/screen sync (the pause
 * screen was already shown once, on the Escape keypress) and no fx tick
 * (screen shake/particles/float texts hold still, matching "paused"). */
function drawFrozenFrame(): void {
  updateCamera(cam, player, canvas.width, canvas.height);
  render(world, cam, 1, ctx, fx);
}

/**
 * `afterStep` runs once per FIXED tick (app/loop.ts:29-33 — inside the
 * `while (acc >= DT_MS)` catch-up loop), while `render` runs once per
 * rendered frame (app/loop.ts:35). `fx.update` takes a dtMs, so it belongs
 * on the tick side: driving it from `frame()` aged the presentation fx at
 * refreshRate/60 x real time (2.4x on a 144Hz display, 3x on 180Hz), which
 * cut melee swing arcs, particles, damage numbers and screen shake short.
 * `drawFrozenFrame` deliberately omits it — paused fx must hold still.
 */
function startSimLoop(): void {
  stopSimLoop = startLoop(world, {
    collectInputs: tick => input.collect(tick),
    afterStep: w => { sink(drainEvents(w)); fx.update(DT_MS); },
    render: frame,
  });
}

/**
 * ORIG/engine.js:146-224 (`startGame`), run-state + lifecycle part — the
 * player object itself is sim/player.ts's `createPlayer` (Task 9), the wave
 * system is sim/run.ts's `startRun` (Task 15). This is also what every
 * restart button (start/restart/victory-restart/pause-restart) calls.
 */
function beginRun(classKey: ClassKey, mode: GameMode, playerName: string): void {
  // tear down whatever was running before — a no-op the very first time.
  stopSimLoop?.();
  stopSimLoop = null;
  cancelAnimationFrame(pauseRaf);
  input?.destroy();

  const config = buildRunConfig(classKey, mode, playerName);
  world = createWorld(config);
  buildTilemap(); // fresh floor-tile variants each run, ORIG/engine.js:171,219
  player = createPlayer(world, LOCAL_SLOT, classKey, playerName);
  startRun(world);

  cam = createCamera();
  input = createInput(canvas, world, LOCAL_SLOT, cam, touch);
  fx = createFx();
  fx.setShakeEnabled(Save.data.settings.shake !== false);

  sink = createEventSink({
    fx,
    playSfx: Sfx.play,
    announce,
    hurtFlash,
    unlock: tryUnlock,
    bossMusic: Sfx.setBossMode,
    // ORIG/entities.js:437-438 — the boss branch of killEnemy persisted this
    // right there; the sim only emits `{ t: 'bossKill' }` (sim/enemies.ts),
    // app/ does the actual Save write.
    bossKill: () => { Save.data.progress.bossKills++; Save.persist(); },
    // The sim only ever does `setPhase(world, 'gameover' | 'victory')`
    // (sim/player.ts, sim/run.ts) — it never touches Save. This is the one
    // place app/ notices and settles the run (Step 4, ORIG/engine.js:
    // 230-248 / entities.js:570-588).
    onPhase: (_from, to) => {
      if (to === 'gameover') {
        Sfx.stopMusic();
        Sfx.play('gameover');
        finishRun(world, LOCAL_SLOT, false);
        refreshClassRecord();
      } else if (to === 'victory') {
        Sfx.stopMusic(); // sim already emitted { t: 'sfx', name: 'victory' }
        finishRun(world, LOCAL_SLOT, true);
        refreshClassRecord();
      }
    },
  });

  showScreen(null);
  dom.hud.classList.remove('hidden');
  Sfx.init();
  Sfx.startMusic();

  gameStarted = true;
  startSimLoop();
}

function startFromSelection(): void {
  const { classKey, mode, playerName } = getSelection();
  beginRun(classKey, mode, playerName);
}

/** ORIG/engine.js:228 (`quitGame`). */
function quitGame(): void {
  stopSimLoop?.();
  stopSimLoop = null;
  cancelAnimationFrame(pauseRaf); // Quit is only reachable from the pause screen — that RAF loop must not outlive it
  // The dead run's keydown listener would otherwise keep preventDefault()ing
  // Space and the arrow keys over the start screen (app/input.ts).
  input?.destroy();
  gameStarted = false; // Escape must be a no-op again until the next run starts
  dom.hud.classList.add('hidden');
  showScreen('start');
  Sfx.stopMusic();
}

dom.btnStart.addEventListener('click', mouseOnly(startFromSelection));
dom.btnRestart.addEventListener('click', mouseOnly(startFromSelection));
dom.btnVictoryRestart.addEventListener('click', mouseOnly(startFromSelection));

/**
 * Pause is a property of app/, not of the world (task-18 boundary #2):
 * `Phase` has no 'paused' value and step() never runs while paused. Rather
 * than teach app/loop.ts a pause flag, pausing here stops the sim-driving
 * loop outright and swaps in a render-only requestAnimationFrame loop that
 * keeps redrawing the same frozen `world` — so the canvas (and a resize)
 * still update, but the simulation never advances and never learns a pause
 * exists. Resuming tears that down and starts a fresh sim loop, the same
 * way ORIG/engine.js:227 (`resumeGame`) reset `lastTime` to avoid a catch-up
 * jump. Restart/quit (also wired by createPauseControl, Task 20) go through
 * `beginRun`/`quitGame` above instead of resuming the old world.
 */
createPauseControl(
  () => (gameStarted ? world.phase : null),
  paused => {
    if (paused) {
      stopSimLoop?.();
      stopSimLoop = null;
      const tick = () => { drawFrozenFrame(); pauseRaf = requestAnimationFrame(tick); };
      pauseRaf = requestAnimationFrame(tick);
    } else {
      cancelAnimationFrame(pauseRaf);
      startSimLoop();
    }
  },
  { onRestart: startFromSelection, onQuit: quitGame },
);
