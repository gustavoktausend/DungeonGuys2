import './style.css';
import { createWorld } from './sim/world';
import { drainEvents } from './sim/step';
import { DT_MS } from './sim/constants';
import { createPlayer } from './sim/player';
import { startRun } from './sim/run';
import { startLoop } from './app/loop';
import { createInput } from './app/input';
import { createEventSink } from './app/events';
import { createCamera, updateCamera } from './render/camera';
import { loadSprites } from './render/sprites';
import { buildTilemap } from './render/tilemap';
import { createFx } from './render/fx';
import { render } from './render/index';
import { updateHud } from './ui/hud';
import { syncScreens, announce, hurtFlash, createPauseControl } from './ui/screens';
import type { World } from './sim/types';

const canvas = document.getElementById('game-canvas') as HTMLCanvasElement;
const ctx = canvas.getContext('2d')!;

function resize() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  ctx.imageSmoothingEnabled = false;
}
resize();
addEventListener('resize', resize);

await loadSprites();

const world = createWorld({
  seed: 20260827, mode: 'campaign', classKey: 'mage', playerName: 'DEV',
  forge: { vigor: 0, honed: 0, fleet: 0, startgold: 0, merchant: 0, wise: 0, golden: 0 },
});
buildTilemap();
const player = createPlayer(world, 'p1', 'mage', 'DEV');
startRun(world);

const cam = createCamera();
const input = createInput(canvas, world, 'p1', cam);

const fx = createFx();
// sfx/unlock/bossMusic wiring are later tasks; those stay no-ops until then.
// announce/hurtFlash are this task's — ui/screens.ts owns both.
const sink = createEventSink({
  fx,
  playSfx: () => {},
  announce,
  hurtFlash,
  unlock: () => {},
  bossMusic: () => {},
  onPhase: () => {},
});

/**
 * The frame drawn every requestAnimationFrame while the sim is advancing.
 * `updateHud`/`syncScreens` are called once per frame here, reading `world`
 * — no game or sim code pushes to the DOM (T1, task-18-brief.md).
 */
function frame(w: World, alpha: number): void {
  updateHud(w, 'p1');
  syncScreens(w, 'p1');
  updateCamera(cam, player, canvas.width, canvas.height);
  fx.update(DT_MS);
  render(w, cam, alpha, ctx, fx);
}

/** Redraws the frozen world while paused — no HUD/screen sync (the pause
 * screen was already shown once, on the Escape keypress) and no fx tick
 * (screen shake/particles/float texts hold still, matching "paused"). */
function drawFrozenFrame(): void {
  updateCamera(cam, player, canvas.width, canvas.height);
  render(world, cam, 1, ctx, fx);
}

let stopSimLoop: (() => void) | null = null;
let pauseRaf = 0;

function startSimLoop(): void {
  stopSimLoop = startLoop(world, {
    collectInputs: tick => input.collect(tick),
    afterStep: w => { sink(drainEvents(w)); },
    render: frame,
  });
}

/**
 * Pause is a property of app/, not of the world (task-18 boundary #2):
 * `Phase` has no 'paused' value and step() never runs while paused. Rather
 * than teach app/loop.ts a pause flag, pausing here stops the sim-driving
 * loop outright and swaps in a render-only requestAnimationFrame loop that
 * keeps redrawing the same frozen `world` — so the canvas (and a resize)
 * still update, but the simulation never advances and never learns a pause
 * exists. Resuming tears that down and starts a fresh sim loop, the same
 * way ORIG/engine.js:227 (`resumeGame`) reset `lastTime` to avoid a catch-up
 * jump.
 */
createPauseControl(
  () => world.phase,
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
);

startSimLoop();
