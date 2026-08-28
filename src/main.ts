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
// sfx/announce/HUD wiring are later tasks; these are no-ops until then.
const sink = createEventSink({
  fx,
  playSfx: () => {},
  announce: () => {},
  hurtFlash: () => {},
  unlock: () => {},
  bossMusic: () => {},
  onPhase: () => {},
});

startLoop(world, {
  collectInputs: tick => input.collect(tick),
  afterStep: w => { sink(drainEvents(w)); },
  render: (w, alpha) => {
    updateCamera(cam, player, canvas.width, canvas.height);
    fx.update(DT_MS);
    render(w, cam, alpha, ctx, fx);
  },
});
