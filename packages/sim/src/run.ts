// run.ts — the wave/run lifecycle: starting a run, rolling each wave's
// enemies/mutator/boss/chest, trickling the spawn queue in, and deciding
// when a wave — and the campaign — is done.
// Ported from ORIG/engine.js:146-224 (`startGame`, run-state part only — the
// player object itself is Task 9's `createPlayer`), :251-316 (`startNextWave`),
// :318-332 (`pickEnemyType`), :335-342 (`announceWave`); ORIG/entities.js:
// 534-544 (`updateSpawnQueue`), :545-569 (`checkWaveComplete`), :570-588
// (`victory`).
//
// Deliberate deviations from the original — see task-15-brief.md:
//  - `announceWave`, `Sfx.play`, `Sfx.setBossMode` and `tryUnlock` are all
//    DOM/audio/save-adjacent side effects in the original; here they become
//    `emit(world, { t: ... })` (T5). The original's 2600ms `setTimeout` that
//    hid the announcement banner again is a UI concern and has no sim
//    equivalent at all.
//  - `gameOver()` does not live here: the sim only ever does
//    `setPhase(world, 'gameover')` (already wired in `damagePlayer`, Task 9).
//    `victory()` mirrors that — it sets the phase and emits, and never
//    touches a save file, forges soul gold or writes DOM text.
//  - The original's `checkWaveComplete` reaches a cleared, non-final wave by
//    calling `setTimeout(openShop, 1500)`. That 1500ms only lets the
//    "WAVE X CLEAR!" banner sit alone on screen for a beat before the shop
//    covers it — the same category of cosmetic delay as this very
//    function's adjacent `setTimeout(victory, 1200)`, which this port
//    already collapsed to a direct, synchronous `victory(world)` call (see
//    below). `openShop` is called synchronously here too, for the same
//    reason. It is not entirely free, though, and Task 21 measured the
//    difference: in the original the loop keeps running through those
//    1500ms, so the player gets 1.5s more to hoover up coins after the last
//    kill. That accounts for part of the gap between the original's 142-154
//    gold at the end of wave 5 and this port's 130 (docs/PARIDADE.md). The
//    effect is small and collapsing the delay is still the right call, but
//    it is not "no gameplay outcome" — it is "a small one, in the player's
//    favour, that this port drops". `ui/screens.ts`'s `announce()` already
//    runs its own independent 2600ms display timer for the banner
//    regardless of what the phase underneath does. (Task 19, measured in
//    Task 21.)
//  - `checkWaveComplete` -> shop.ts's `openShop` -> (eventually) `closeShop`
//    -> this file's `startNextWave` is a two-file import cycle. Same shape,
//    and same safety argument, as the already-documented enemies.ts<->boss.ts
//    and enemies.ts->xp.ts->run.ts->enemies.ts cycles: every cross-reference
//    is used inside a function body, never at module-eval time.
//  - `SpawnEntry` (Task 1) is `{ delay, type }` — no `spawned` flag. Where
//    the original mutates `s.spawned = true` in place and rescans the whole
//    array every tick, `updateSpawnQueue` here partitions `world.spawnQueue`
//    into due/not-due and keeps only the not-due half. Same externally
//    observable behavior (each entry fires exactly once, in delay order,
//    and the queue is "empty" once everything has fired); the type just
//    doesn't leave room for a boolean flag.
//  - The original's `player` global — read directly by `startNextWave` for
//    the mutator float-text position and the chest's luck roll — becomes
//    `nearestPlayer(world, WORLD.w / 2, WORLD.h / 2)` here (same "closest
//    player, or none" shape `enemies.ts`/`boss.ts` already use for a
//    reference point that isn't tied to one specific player's action). It
//    draws no rng, so it can't perturb the draw sequence. With nobody alive
//    it simply skips the float text and treats luck as 0 — in practice
//    unreachable, since a wave can only "complete" while `world.phase` is
//    still 'playing', which requires somebody alive.
//  - The chest is placed inside a `CHEST_RADIUS`-px disc around the
//    reference player instead of anywhere in `world.play` (Task 21). The
//    original's rectangle WAS the screen, so any chest it rolled was on
//    screen and reachable; in a 2400x1600 world the same formula puts the
//    chest a measured 958px away on average (p95 = 1843px), almost always
//    off camera and never found. The disc restores the original's actual
//    distribution: measured over the original's own formula, an ORIG chest
//    sits a mean 369px from the player (max 968px); the disc gives a mean
//    399px (max 703px). Same two rng draws as the original (it drew x then
//    y; this draws an angle then a radius), so the draw sequence keeps its
//    length — only the resulting point moves.
//  - Every `Math.random()` becomes `world.rng.next()`, not `world.rng.chance()`
//    — `chance()` skips the draw entirely when `p <= 0` or `p >= 1`, and a
//    draw that sometimes doesn't happen desyncs two machines running the
//    same seed. This matters most for the mutator roll (`< 0.4`) and the
//    chest roll (`< Math.min(0.95, 0.6 * (1 + luck / 100))`, which can
//    legitimately hit the 0.95 cap) — both keep their original guard
//    (`&&`) structure exactly, so the draw still only happens when the
//    original would have made it.
import { emit, setPhase } from './world';
import { generateArena } from './arena';
import { spawnEnemy, nearestPlayer } from './enemies';
import { spawnBoss, bossPlanForWave } from './boss';
import { openShop } from './shop';
import { MUTATORS } from './defs/mutators';
import { ENEMY_DEFS, WAVE_DURATION } from './defs/enemies';
import { DT_MS, WAVES_TOTAL, WORLD } from './constants';
import { cos, sin } from './math';
import type { MutatorKey, World } from './types';

/**
 * How far from a player a wave chest may land (Task 21). The original's
 * chest rectangle was the whole screen; this disc keeps the chest inside
 * the same walking distance the original's ever was.
 */
const CHEST_RADIUS = 700;

/**
 * The nearest living player to the world's centre, or null if nobody is
 * alive — used only as "a" reference point for wave-level flavor (float
 * text, chest luck) that the original read off its single global `player`.
 * See file header.
 */
function refPlayer(world: World) {
  return nearestPlayer(world, WORLD.w / 2, WORLD.h / 2);
}

/** ORIG/engine.js:146-224, run-state part only (see file header). */
export function startRun(world: World): void {
  setPhase(world, 'playing');

  world.score = 0;
  world.wave = 0;
  world.waveActive = false;
  world.waveTimer = 0;
  world.spawnQueue = [];
  world.bullets = [];
  world.enemyBullets = [];
  world.enemies = [];
  world.coins = [];
  world.potions = [];
  world.chests = [];
  world.pendingAfterLevelUp = null;
  world.runKills = 0;
  world.runGoldEarned = 0;
  world.combo = 0;
  world.comboTimer = 0;
  world.waveMutator = null;

  generateArena(world);
  startNextWave(world);
}

/** ORIG/entities.js:318-332. */
export function pickEnemyType(world: World, wave: number): string {
  // weighted table; stronger/special enemies unlock as waves go
  const table: [string, number][] = [
    ['skeleton', 40],
    ['goblin', wave >= 2 ? 28 : 12],
  ];
  if (wave >= 3) table.push(['demon', 16], ['swampy', 12]);
  if (wave >= 4) table.push(['necromancer', 13]);
  if (wave >= 5) table.push(['brute', 11]);

  let total = 0;
  for (const [, p] of table) total += p;
  let r = world.rng.next() * total;
  for (const [type, p] of table) {
    if ((r -= p) <= 0) return type;
  }
  return 'skeleton';
}

/** ORIG/engine.js:251-316 (see file header for the deviations). */
export function startNextWave(world: World): void {
  world.wave++;
  world.waveActive = true;
  world.waveTimer = 0;
  world.combo = 0; // streak doesn't carry across the shop break
  world.comboTimer = 0;

  // leftover floor loot from the last wave is swept away
  world.coins = [];
  world.potions = [];
  world.chests = [];
  world.enemyBullets = [];

  const bossPlan = bossPlanForWave(world, world.wave);
  world.waveHasBoss = bossPlan.length > 0;
  emit(world, { t: 'bossMusic', on: world.waveHasBoss }); // swell the music for boss waves

  // roll a wave mutator on ordinary waves (boss waves are spectacle enough)
  world.waveMutator = null;
  if (!world.waveHasBoss && world.wave >= 3 && world.rng.next() < 0.4) {
    const keys = Object.keys(MUTATORS) as MutatorKey[];
    world.waveMutator = world.rng.pick(keys);
  }

  // boss waves have a smaller escort so the boss is the show
  let count = world.waveHasBoss
    ? 8 + Math.max(0, Math.floor((world.wave - WAVES_TOTAL) / 2))
    : 4 + world.wave * 3;
  if (world.waveMutator === 'swarm') count = Math.round(count * 1.6);
  world.spawnQueue = [];
  const spawnStep = Math.max(200, 900 - world.wave * 40);
  for (let i = 0; i < count; i++) {
    world.spawnQueue.push({ delay: i * spawnStep, type: pickEnemyType(world, world.wave) });
  }

  if (world.wave >= 6) emit(world, { t: 'unlock', cls: 'ninja' });
  if (world.wave >= 10) emit(world, { t: 'unlock', cls: 'coprobo' });
  // waveDisplay.textContent in the original is a pure function of
  // world.wave/world.config.mode — ui/ reads it straight off the world,
  // no event needed.

  // Both the mutator float text and the chest's luck roll read the
  // original's single global `player` — resolved once here so they agree
  // on which player that is (see file header).
  const ref = refPlayer(world);

  if (world.waveHasBoss) {
    emit(world, { t: 'sfx', name: 'bosshorn' });
    bossPlan.forEach((type, i) => spawnBoss(world, type, i, bossPlan.length));
    if (bossPlan.length > 1) {
      emit(world, { t: 'announce', text: `☠ ${bossPlan.length} BOSSES! ☠` });
    } else {
      const name = ENEMY_DEFS[bossPlan[0]].boss ?? bossPlan[0];
      const text = world.config.mode === 'campaign' && world.wave === WAVES_TOTAL
        ? `☠ FINAL BOSS: ${name} ☠` : `☠ BOSS: ${name} ☠`;
      emit(world, { t: 'announce', text });
    }
  } else if (world.waveMutator) {
    emit(world, { t: 'announce', text: `WAVE ${world.wave} · ${MUTATORS[world.waveMutator].name}` });
    if (ref) {
      emit(world, {
        t: 'float', x: ref.x, y: ref.y - 44,
        text: MUTATORS[world.waveMutator].desc, color: '#66ccff',
      });
    }
  } else {
    emit(world, { t: 'announce', text: `— WAVE ${world.wave} —` });
  }

  // a chest may appear near a player (might be a mimic...)
  const luck = ref?.stats.luck ?? 0;
  if (world.wave >= 2 && world.rng.next() < Math.min(0.95, 0.6 * (1 + luck / 100))) {
    const m = 90;
    const ax = ref?.x ?? WORLD.w / 2;
    const ay = ref?.y ?? WORLD.h / 2;
    const angle = world.rng.next() * Math.PI * 2;
    // sqrt() makes the draw uniform over the disc's area, not over its
    // radius — without it the chest would crowd the player's feet.
    const r = Math.sqrt(world.rng.next()) * CHEST_RADIUS;
    // The clamp keeps the original's `m = 90` margin, and it is the reason a
    // player hugging a wall (they clamp to play.left + 10) sees chests pile
    // up on the x = play.left + m line: roughly half the disc folds onto it.
    // Harmless — the chest stays inside the play rect and no more than
    // ~705px away — and it makes a chest land on top of the player LESS
    // often than in the original, not more (P(r < 26) = 0.14% here against
    // ~0.56% for the original's rectangle roll).
    world.chests.push({
      x: Math.max(world.play.left + m, Math.min(world.play.right - m, ax + cos(angle) * r)),
      y: Math.max(world.play.top + m, Math.min(world.play.bottom - m, ay + sin(angle) * r)),
      state: 'closed', // closed → opening → looted
      timer: 0,
      fade: 0, // meaningful only once looted (Ruling B on task-16-report.md)
    });
  }
}

/** ORIG/entities.js:534-544 (see file header for the `spawned`-flag deviation). */
export function updateSpawnQueue(world: World): void {
  if (!world.waveActive) return;
  world.waveTimer += DT_MS;

  const due: string[] = [];
  const pending = world.spawnQueue.filter(s => {
    if (world.waveTimer >= s.delay) { due.push(s.type); return false; }
    return true;
  });
  world.spawnQueue = pending;
  for (const type of due) spawnEnemy(world, type);
}

/** ORIG/entities.js:545-569 (see file header for the `setTimeout` deviation). */
export function checkWaveComplete(world: World): void {
  if (!world.waveActive) return;

  // survival timer: normal waves auto-complete after 30s (bosses must die)
  if (!world.waveHasBoss && world.waveTimer >= WAVE_DURATION) {
    for (const e of world.enemies) {
      if (!e.dead) emit(world, { t: 'particles', x: e.x, y: e.y, color: '#9b59b6', count: 6 }); // vanish, no loot
    }
    world.enemies = [];
    world.spawnQueue = [];
  }

  if (world.spawnQueue.length === 0 && world.enemies.length === 0) {
    world.waveActive = false;
    if (world.config.mode === 'campaign' && world.wave >= WAVES_TOTAL) {
      victory(world);
      return;
    }
    emit(world, { t: 'sfx', name: 'waveclear' });
    emit(world, { t: 'announce', text: `WAVE ${world.wave} CLEAR!` });
    // ORIG/entities.js:568's setTimeout(openShop, 1500) — called directly,
    // see file header. `ref` is the same "nearest player, or none" resolved
    // for the mutator/chest flavor above; in practice always non-null here
    // (a wave only completes while someone is alive to have kept it going).
    const ref = refPlayer(world);
    if (ref) openShop(world, ref);
  }
}

/** ORIG/entities.js:570-588. */
export function victory(world: World): void {
  if (world.phase === 'levelup') { world.pendingAfterLevelUp = 'victory'; return; }
  if (world.phase !== 'playing') return;
  setPhase(world, 'victory');
  emit(world, { t: 'sfx', name: 'victory' });
  // Sfx.stopMusic(), Save.recordRun/soulGold forging, and the victory
  // screen's DOM text are app-layer — dropped, same as gameOver (see file
  // header). audio/ can stop the music itself off the 'phase' event.
}
