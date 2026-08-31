// xp.ts — leveling and the roll of the level-up choices.
// Ported from ORIG/entities.js:68-86 (gainXp), :124-146 (maybeOpenLevelUp,
// rollLevelChoices). The pick itself — `pickBlessing` and `closeLevelUp`,
// ORIG/entities.js:148-172 — moved out to levelup.ts; see the CYCLE CUT note
// at the end of this header.
//
// Deliberate deviations from the original — see task-16-brief.md:
//  - `rollLevelChoices` drops the original's `innerHTML` block entirely: it
//    only fills `p.levelChoices` (three Blessing objects, no markup). `ui/`
//    draws the level-up screen from that array. One of the brief's own
//    tests ("não gera HTML") is the guard on this rule.
//  - The original shuffles with `[...pool].sort(() => Math.random() - 0.5)`
//    — a biased shuffle that favours the array's original order. This port
//    uses `world.rng.shuffled(pool)` (Fisher-Yates), which is a
//    *correction*, not a regression: blessings near the end of
//    `LEVELUP_POOL` (IGNITE, FROST) now show up as often as the ones near
//    the front. Flagging this explicitly per the brief so it never reads
//    as an accidental behavior change.
//  - `forgeLevel('wise')` is the earning player's own wise level, read
//    through `slotForge`; `tryUnlock('witch')` at level 8 is
//    `emit(world, { t: 'unlock', cls: 'witch' })`.
//
// CYCLE CUT (phase 01, plan 01-08). This file used to import `victory` from
// ./run and `openShop` from ./shop. Both were used by exactly one function —
// `closeLevelUp`'s tail, resolving `world.pendingAfterLevelUp` — and together
// they closed a single strongly connected component of eight modules:
// {boss, combat, enemies, player, run, shop, special, xp}. Cutting only one
// of the two changes nothing, because `xp -> shop -> run -> enemies -> xp`
// closes the cycle on its own, so both left together into levelup.ts. Nothing
// inside the component imports levelup.ts, which makes it a node with
// outgoing edges only: it takes the two edges out of the component with it.
// The result is 5 {boss, combat, enemies, player, special} plus a genuine,
// independent `run <-> shop` pair, left as recorded debt in docs/BACKLOG.md.
// tests/scc.test.ts recomputes this on every run rather than trusting a diff.
//
// Why the cycle is worth cutting at all: any module-eval-time `const` that
// crosses the cycle silently evaluates to `undefined` instead of failing
// loudly, and that is exactly the shape of the lookup tables the vendored
// trigonometry of this phase introduces.
//
// Why a file split and not deferring the resolution up to `step()`: deferring
// would change the value of `world.tick` at the moment `openShop` runs, and
// risks shifting a simulation tick between choosing the blessing and opening
// the shop. Moving the two functions verbatim is behaviourally identical by
// construction — same calls, same order, same tick, same `world.rng`
// consumption sequence — which is why the golden hash is the proof that this
// change was structural and nothing else.
import { emit, setPhase, slotForge } from './world';
import { LEVELUP_POOL, XP_GROWTH, LEVEL_HP } from './defs/blessings';
import { recalcStats, playerDmgKind } from './stats';
import type { Player, World } from './types';

/** ORIG/entities.js:68-86. */
export function gainXp(world: World, p: Player, amount: number): void {
  // The wise bonus belongs to whoever earned the xp, not to the run.
  const gained = Math.round(amount * (1 + slotForge(world, p.id).wise * 0.1));
  p.xp += gained;
  while (p.xp >= p.xpNext) {
    p.xp -= p.xpNext;
    p.xpNext = Math.round(p.xpNext * XP_GROWTH);
    p.level++;
    p.permMaxHp += LEVEL_HP;
    recalcStats(p);
    p.hp = Math.min(p.maxHp, p.hp + LEVEL_HP);
    p.pendingLevelUps++;
    if (p.level >= 8) emit(world, { t: 'unlock', cls: 'witch' });
    emit(world, { t: 'float', x: p.x, y: p.y - 34, text: 'LEVEL UP!', color: '#66ccff' });
    emit(world, { t: 'sfx', name: 'levelup' });
    emit(world, { t: 'particles', x: p.x, y: p.y, color: '#66ccff', count: 16 });
  }
  maybeOpenLevelUp(world, p);
}

/** ORIG/entities.js:124-129. */
export function maybeOpenLevelUp(world: World, p: Player): void {
  if (p.pendingLevelUps <= 0 || world.phase !== 'playing') return;
  setPhase(world, 'levelup');
  rollLevelChoices(world, p);
}

/**
 * ORIG/entities.js:131-146, minus the `innerHTML` block (see file header):
 * fills `p.levelChoices` with 3 Blessing objects; `ui/` draws them.
 */
export function rollLevelChoices(world: World, p: Player): void {
  const kind = playerDmgKind(p);
  const pool = LEVELUP_POOL.filter(b => !b.dmgKind || b.dmgKind === kind);
  p.levelChoices = world.rng.shuffled(pool).slice(0, 3);
}
