// serialize.ts — the World's serialised forms. There are TWO CONTRACTS here,
// they share one file, and confusing them is the specific mistake this header
// exists to prevent, because the confused version compiles, round-trips, and
// loses the run in silence.
//
//   hashWorld              A FINGERPRINT, and lossy on purpose.
//                          It drops `config` (the run's constant input — seed,
//                          mode, the player manifest — which by definition
//                          cannot diverge, so including it could only mask or
//                          fake a divergence) and `events` (presentation,
//                          drained every tick by app/). Its whole output is
//                          eight hex characters: nothing is reconstructable
//                          from it, and nothing is meant to be.
//
//   saveWorld / loadWorld  LOSSLESS, and `config` IS INCLUDED.
//                          A snapshot that cannot say which seed, which mode
//                          and which players produced it is not a snapshot; it
//                          is a fingerprint carrying extra bytes. Reusing
//                          hashWorld's replacer here is the error: it type-
//                          checks, the round-trip still passes a hash
//                          comparison, and the run manifest quietly vanishes.
//
// THE SIGN OF ZERO IS THE ONE VALUE JSON LOSES HERE, AND THE HASH CANNOT SEE
// THE LOSS. `JSON.stringify(-0)` already emits "0", so the fingerprint is
// immune to the bug as it is usually written down — and that immunity is
// precisely the problem: `JSON.parse(JSON.stringify(-0))` gives back +0, and
// hashWorld travels the same lossy path, so a round-trip "verified by hash"
// passes on data that is already corrupt. Two consequences, both deliberate:
//
//   - saveWorld does NOT preserve -0, and does not pretend to. ADR 0011 puts
//     the canonicalisation at CAPTURE (`| 0` after the input quantisation), so
//     no field of a real run ever holds -0 to begin with. Normalising it here
//     as well would be a no-op on this path (JSON already collapses it) while
//     making the format look like it can carry a value it cannot; the day the
//     snapshot becomes a binary codec — where +0 and -0 are different bit
//     patterns — the normalisation belongs in that codec, next to the bits.
//   - tests/serialize.test.ts asserts the invariant STRUCTURALLY, with
//     Object.is, and never by hash alone. The hash cannot be the only witness
//     of its own serialisation path.
//
// Everything else JSON carries exactly: doubles round-trip bit-for-bit across
// the whole exponent range this simulation uses, and Number.MAX_SAFE_INTEGER
// (the INDESTRUCTIBLE_HP of arena.ts) survives untouched. Measured, not
// assumed — see 01-RESEARCH.md.
import { Rng } from './rng';
import { orderedPlayers } from './world';
import type { Player, World } from './types';

/**
 * The World as data the format can actually carry: every field of `World`,
 * with the single class instance replaced by its cursor.
 *
 * `events` is here too. It is not simulation state and the fingerprint drops
 * it, but "lossless" is a contract about bytes, not about importance: a
 * snapshot taken mid-tick, before app/ drained them, has to come back the same
 * shape it went in.
 */
export type SerializedWorld = Omit<World, 'rng'> & { rng: number };

/**
 * The World, written to JSON-safe data with nothing left out.
 *
 * The round-trip through text inside this function is not a detour — it is
 * what makes the return type's promise true. Anything the format cannot carry
 * is already gone by the time this returns, so a caller can never be handed a
 * live value that works in memory and disappears on disk. It also means
 * `saveWorld(w)` and `JSON.parse(JSON.stringify(saveWorld(w)))` are the same
 * thing, which is the property a verifier needs: there is one path, so there
 * is nothing for a second path to diverge from.
 *
 * `players` is NOT re-keyed here, and hashWorld's re-keying is not a
 * precedent: key order inside a Record is not simulation state, JSON preserves
 * whatever order it was given, and the fingerprint canonicalises at hash time
 * anyway. One definition of canonical order (`orderedPlayers`), used where it
 * changes an answer.
 */
export function saveWorld(world: World): SerializedWorld {
  return JSON.parse(JSON.stringify(world, (key, value) => {
    // The only transform, and the whole difference from the fingerprint above:
    // nothing is excluded. The run manifest stays, because this is the form a
    // replay verifier reconstructs a world from.
    if (key === 'rng') return (value as { save(): number }).save();
    return value;
  })) as SerializedWorld;
}

/**
 * The inverse of `saveWorld`.
 *
 * `world.rng` is THE ONLY class instance in the World, which is why it is the
 * only revive. That is an assertion about types.ts, not a convenience: every
 * class instance added to `World` becomes another special case in three
 * places — here, in `hashWorld` above, and in the phase-3 snapshot codec — so
 * if one is ever added, this comment is the reason someone has to come back
 * and edit this function instead of finding out from a desynchronised room.
 *
 * The cursor is restored rather than passed to the constructor because
 * `new Rng(seed)` means "start of the run" while `restore(s)` means "resume
 * exactly here". Seeding with `data.rng` would look identical for one call and
 * be wrong for every one after it.
 *
 * `data` is consumed, not copied: the caller hands over ownership.
 */
export function loadWorld(data: SerializedWorld): World {
  const rng = new Rng(0);
  rng.restore(data.rng);
  return { ...data, rng };
}

/**
 * A stable fingerprint of everything the simulation owns. Excludes `events`
 * (drained every tick by app/) and `config` (the run's constant input — seed,
 * mode and the player manifest with each slot's class, name and forge levels
 * — never changes across ticks, so including it can only mask or fake a
 * divergence, never reveal one). Includes the rng
 * cursor, so a divergence in random draws shows up even when no entity moved
 * yet.
 *
 * `players` is re-keyed into canonical order before it is serialised.
 * `JSON.stringify` emits object keys in INSERTION order, so without this two
 * rooms holding bit-identical simulations would fingerprint differently for
 * the sole reason that the four people joined in a different sequence — a
 * false desync, reported by the very thing whose job is to detect real ones
 * (FORM-02/D-13). Key ORDER inside the Record is not simulation state; who is
 * in it, and what they are, is, and that is still compared exactly.
 *
 * This does not move any recorded hash: a world whose insertion order already
 * matches the manifest — every solo run, including tests/golden — serialises
 * to the same bytes as before.
 */
export function hashWorld(world: World): string {
  const snapshot = JSON.stringify(world, (key, value) => {
    if (key === 'events') return undefined;
    if (key === 'config') return undefined;
    if (key === 'players') {
      const canonical: Record<string, Player> = {};
      for (const p of orderedPlayers(world)) canonical[p.id] = p;
      return canonical;
    }
    if (key === 'rng') return (value as { save(): number }).save();
    // JSON.stringify collapses NaN, Infinity and -Infinity all to `null`, so
    // an unfiltered replacer gives the same fingerprint to a healthy world
    // and to one that has diverged into NaN — the exact opposite of what a
    // determinism guard is for. Tag them apart instead.
    if (typeof value === 'number' && !Number.isFinite(value)) {
      return Number.isNaN(value) ? 'NaN' : value > 0 ? 'Inf' : '-Inf';
    }
    return value;
  });
  // FNV-1a, 32-bit
  let h = 0x811c9dc5;
  for (let i = 0; i < snapshot.length; i++) {
    h ^= snapshot.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16);
}
