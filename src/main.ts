import './style.css';
import { createWorld } from './sim/world';
import { drainEvents } from './sim/step';
import { startLoop } from './app/loop';
import { noInputFor } from './app/input-stub';

const canvas = document.getElementById('game-canvas') as HTMLCanvasElement;
const ctx = canvas.getContext('2d')!;
canvas.width = window.innerWidth;
canvas.height = window.innerHeight;

const world = createWorld({
  seed: 20260827,
  mode: 'campaign',
  classKey: 'mage',
  playerName: 'DEV',
  forge: { vigor: 0, honed: 0, fleet: 0, startgold: 0, merchant: 0, wise: 0 },
});

// Proof-of-life for the fixed timestep; replaced by the real render in Task 10.
startLoop(world, {
  collectInputs: tick => ({ p1: noInputFor(tick) }),
  afterStep: w => { drainEvents(w); },
  render: (w, alpha) => {
    ctx.fillStyle = '#1a1a2e';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#e8dcc8';
    ctx.font = '16px monospace';
    ctx.fillText(`tick ${w.tick}  alpha ${alpha.toFixed(2)}`, 20, 40);
  },
});
