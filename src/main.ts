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
import { syncScreens, announce, hurtFlash, showScreen, createPauseControl, showUpdateOffer } from './ui/screens';
import { dom } from './ui/dom';
import { setupTouch } from './ui/touch';
import { getSelection, initStartScreen, refreshClassRecord, tryUnlock } from './ui/settings';
import { mouseOnly } from './ui/events';
import type { ClassKey, GameMode, Player, PlayerSlot, World } from '@dg2/sim';

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
// `import.meta.env.BASE_URL` is Vite's `base`, now '/' everywhere since the
// game is served from the root of its own domain. Kept instead of a literal
// '/sw.js' because it tracks `base` on its own: registering a relative
// 'sw.js' would resolve against the current page and land the worker on the
// wrong scope at any deep URL. ORIG/ui.js:282-284.
//
// The update cycle below (D2-09) is the other half of public/sw.js: that
// worker deliberately never swaps version by itself on install and never
// claims pages it did not load, so a new build installs and then WAITS
// forever. Something has to notice it, and something has to decide when the
// swap is safe. This is both.

// Declared HERE, above the block that reads it, rather than with its siblings
// in the game-lifecycle section below: module evaluation suspends at the
// top-level `await loadSprites()`, so a registration promise that settles
// first would run `offer` while a `let` declared after that await is still in
// its temporal dead zone. That throws in exactly the case this feature exists
// for -- a returning player with a worker already waiting.
let gameStarted = false; // false until the first beginRun() -- guards `world.phase` reads
let swWaiting: ServiceWorker | null = null;
let swReloading = false;
// Set when ANOTHER tab accepted the swap while this one was mid-run. It is a
// second flag and not a reuse of `swWaiting` because the two say different
// things: `swWaiting` is "a version is ready and this page may ask for it",
// while this is "the version already changed under us and the reload is owed".
let swSwapped = false;

/** Asks the waiting worker to take over. The page asks, the worker decides --
 *  nothing here forces a swap. Only reachable with `gameStarted === false`. */
function applyUpdate(): void {
  const waiting = swWaiting;
  // A stored worker that has since gone 'redundant' -- two deploys while this
  // tab stayed open -- accepts the message and does nothing with it. The button
  // is then inert, and the player has no way to tell that from a slow reload;
  // they just click it again. There is nothing left to swap TO in that state,
  // so take the reload directly rather than offer a swap that cannot happen:
  // it adopts whatever worker is actually active now, which is the honest
  // answer to the click (WR-12).
  //
  // Guarded by the same flag the controller-swap handler below uses, so the two
  // paths can never reload twice over each other.
  if (!waiting || waiting.state !== 'installed') {
    if (!swReloading) {
      swReloading = true;
      location.reload();
    }
    return;
  }
  waiting.postMessage({ type: 'SKIP_WAITING' });
}

/** Offers the swap when it is safe to take, and merely says so when it is not. */
function offer(w: ServiceWorker | null): void {
  if (!w) return;
  swWaiting = w;
  // `gameStarted` is the flag beginRun/quitGame already maintain, and it means
  // exactly "outside a run" -- a second flag would only give one question two
  // answers. Phase 3 adds `&& !inRoom` RIGHT HERE and nowhere else: D-08 of
  // phase 1 makes peers on mismatched versions refuse each other with no
  // bypass, so swapping mid-room produces that refusal at the worst possible
  // moment. Mid-run the player is told, and nothing else changes.
  if (!gameStarted) showUpdateOffer(applyUpdate);
  else announce('NOVA VERSÃO PRONTA — VOLTE AO MENU PARA ATUALIZAR');
}

if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  navigator.serviceWorker.register(import.meta.env.BASE_URL + 'sw.js').then(reg => {
    // One was already waiting when this page loaded -- but only offer it if
    // this page HAS a controller. A hard reload (Ctrl+Shift+R) loads the
    // document bypassing the worker, so the page comes up uncontrolled while
    // the registration keeps its waiting worker. The offer would be a lie
    // there: the click posts the message, the worker activates, and the event
    // that drives the reload never fires because this page has no controller
    // to swap -- so the reload never runs and the button just absorbs clicks.
    // The updatefound path below already makes this exact check; this is the
    // other way in, and it was missing it (WR-12).
    if (navigator.serviceWorker.controller) offer(reg.waiting);
    reg.addEventListener('updatefound', () => {
      const installing = reg.installing;
      if (!installing) return;
      installing.addEventListener('statechange', () => {
        // A controller already present is what separates an UPDATE from a
        // first install. Without the check, the very first visit would offer
        // to reload a page that has only just been precached.
        if (installing.state === 'installed' && navigator.serviceWorker.controller) {
          offer(reg.waiting);
        }
      });
    });
  }).catch(() => {}); // a failed registration must never take the boot down with it

  navigator.serviceWorker.addEventListener('controllerchange', () => {
    // Not decoration. Without the guard, an event fired for any other reason
    // reloads the page, which re-registers, which fires it again -- and an
    // endless reload is indistinguishable, from the player's seat, from a
    // frozen game.
    if (swReloading) return;
    // This event is NOT private to the tab whose button was clicked. Per the
    // Service Worker Activate algorithm, the activating worker becomes the
    // active worker of every client of the registration and Notify Controller
    // Change fires on all of them -- `clients.claim()` is only needed for
    // clients that were never controlled, so D2-09's refusal to call it buys
    // nothing here. Accepting the update on the start screen of one tab
    // therefore lands in a second tab that may be in the middle of wave 12,
    // and an unconditional reload would destroy that run: the exact property
    // D2-09 exists to protect, defeated one layer above the worker.
    if (gameStarted) {
      // The swap already happened -- the new worker is active for this client
      // too, and there is no undoing that. What CAN be preserved is the run,
      // so the reload that adopts the new code is deferred to the next safe
      // point instead of being cancelled.
      swSwapped = true;
      announce('NOVA VERSÃO ATIVA — VOLTE AO MENU PARA RECARREGAR');
      return;
    }
    swReloading = true;
    location.reload();
  });
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
const LOCAL_SLOT: PlayerSlot = 'p0';

/**
 * The frame drawn every requestAnimationFrame while the sim is advancing.
 * `updateHud`/`syncScreens` are called once per frame here, reading `world`
 * — no game or sim code pushes to the DOM (T1, task-18-brief.md).
 */
function frame(w: World, alpha: number): void {
  updateHud(w, LOCAL_SLOT);
  syncScreens(w, LOCAL_SLOT);
  updateCamera(cam, player, canvas.width, canvas.height);
  render(w, cam, alpha, ctx, fx, LOCAL_SLOT);
}

/** Redraws the frozen world while paused — no HUD/screen sync (the pause
 * screen was already shown once, on the Escape keypress) and no fx tick
 * (screen shake/particles/float texts hold still, matching "paused"). */
function drawFrozenFrame(): void {
  updateCamera(cam, player, canvas.width, canvas.height);
  render(world, cam, 1, ctx, fx, LOCAL_SLOT);
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

  const config = buildRunConfig(LOCAL_SLOT, classKey, mode, playerName);
  world = createWorld(config);
  buildTilemap(); // fresh floor-tile variants each run, ORIG/engine.js:171,219
  // Read back from the manifest rather than from the arguments: the manifest
  // is what a replay is rebuilt from, so a run that starts from a different
  // class than it records is a divergence nobody would see until the replay.
  const local = config.players[0];
  player = createPlayer(world, local.id, local.cls, local.name);
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
  // `quitGame` is literally "back at the menu, outside a run, with the start
  // screen up" -- the exact seam where an offer withheld mid-run becomes safe
  // to make. This is the reason no new flag was invented for the gate: the
  // one that already tracks "outside a run" is the one that gates it.
  //
  // The deferred reload is settled FIRST and returns, because it is not an
  // offer: another tab already swapped the worker, so this page is running
  // code from one build against a cache from another. There is nothing left to
  // ask -- only a reload to take, at the first moment it costs nothing. Note
  // that pause->quit is the only path here, so a run that ends in gameover or
  // victory keeps the notice on screen until the player comes back to the
  // menu; deferred is late, never wrong.
  if (swSwapped) {
    if (!swReloading) { swReloading = true; location.reload(); }
    return;
  }
  offer(swWaiting);
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
