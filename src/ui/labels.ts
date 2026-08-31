// labels.ts — the HUD's vocabulary for stat keys.
//
// WHY THIS IS IN ui/ AND NOT IN packages/sim.
//
// These two tables used to live in `packages/sim/src/stats.ts`, which means
// they were compiled into the sim bundle, which means their bytes were part of
// the sha256 that IS the `SIM_VERSION` (D-07). From phase 9 on, `SIM_VERSION`
// is the ranking's season boundary (D-34) and the room handshake's admission
// test (D-08). So while they lived there, renaming 'ATK SPEED' to 'ATTACK
// SPEED' would have closed a ranking season and refused entry to every player
// who had not reloaded — for a change that no replay can even observe.
//
// D-06 says exactly the opposite: the content hash covers the SIMULATION, and
// a HUD, audio or sprite tweak must not close a season. Rebalancing an enemy
// must, because that changes the outcome of a replay. These strings change the
// outcome of nothing. They are presentation, they belong to the presentation
// layer, and moving them here is what makes D-06 true rather than intended.
//
// The keys are `Stats` keys plus 'maxHp' (a Mods key that is not a Stats key).
// They are typed as a loose Record on purpose: a lookup miss must render the
// raw key, which is how a stat added to the sim shows up as visibly unlabelled
// instead of as `undefined`.

export const STAT_LABELS: Record<string, string> = {
  hpRegen: 'HP REGEN', lifeSteal: 'LIFESTEAL', dmgPct: 'DAMAGE',
  meleeDmg: 'MELEE DMG', rangedDmg: 'RANGED DMG', elementalDmg: 'ELEM DMG',
  atkSpeedPct: 'ATK SPEED', crit: 'CRIT', armor: 'ARMOR',
  dodge: 'DODGE', range: 'RANGE', speedPct: 'SPEED', luck: 'LUCK',
  stamina: 'STAMINA', maxHp: 'MAX HP', burn: 'BURN', chill: 'CHILL', block: 'BLOCK',
};

/** Stats rendered with a trailing '%'. Also presentation, also not the sim's. */
export const PCT_STATS = new Set([
  'dmgPct', 'atkSpeedPct', 'speedPct', 'crit', 'dodge',
  'lifeSteal', 'luck', 'burn', 'chill', 'block',
]);
