// math.ts — vendored fdlibm port of sin, cos and atan2. The property it buys:
// the same bits on every ES2015+ engine, which is the whole reason the
// simulation can be replayed, verified and shared between four peers.
//
// ─── Why this file exists ────────────────────────────────────────────────────
// ECMA-262 leaves the built-in sine, cosine and two-argument arctangent
// IMPLEMENTATION-APPROXIMATED: an engine only has to be close, not identical.
// Measured on this repository's own simulation — 3000 ticks, one seed, one
// input script — Node, Chromium and Firefox/WebKit produced three different
// world hashes, the first divergence landing six seconds into a match.
// Replacing those three calls with the code below made all four engines
// agree. This is not a theoretical debt; it is a measured defect.
//
// ─── The rule this file obeys ────────────────────────────────────────────────
// Everything here is built out of `+ - * /` and comparisons, which ECMA-262
// pins to IEEE-754 with correct rounding, plus bit access through a shared
// ArrayBuffer viewed as Float64Array/Uint32Array. Two built-ins are used and
// no more: `Math.abs` and `Math.round`. Both are fully specified by ECMA-262
// (`Math.round` down to the tie-breaking direction), so neither is a source of
// engine drift. The built-in transcendentals — sine, cosine, tangent, both
// arctangents, power, exponential, logarithm and hypotenuse — must never
// appear in this file: they are the problem, not the tool.
//
// ─── Leaf module ─────────────────────────────────────────────────────────────
// This file has no import line at all, on purpose. packages/sim still contains
// a strongly connected component, and inside a cycle a module-level `const`
// that crosses it evaluates to `undefined` in silence. A table of constants is
// exactly the shape of that accident, so nothing here is computed from another
// module: only numeric literals, arithmetic on those literals, and the two
// views over an eight-byte buffer.
//
// ─── Restricted domain, asserted rather than commented ───────────────────────
// fdlibm's argument reduction has a second half for huge arguments. That path
// is not shipped here (see REMPIO2_MAX). Every angle this game produces comes
// from atan2 (bounded by pi), from (i/n)*2pi in the boss ring, from
// rng.next()*2pi in the spawn rings, or from angle+spread — the largest
// magnitude possible is around 4pi. Outside the supported domain, sin and cos
// throw a RangeError naming the function and the value. Being loud is the
// point: a silent NaN propagates through the whole World and makes the replay
// verifier grade garbage.
//
// ─── Source of record, function by function ──────────────────────────────────
//   kernelSin              FreeBSD msun k_sin.c
//   kernelCos, polyvalC*   FreeBSD msun k_cos.c
//   rempio2, rempio2Medium FreeBSD msun e_rem_pio2.c (large-argument half omitted)
//   sin                    FreeBSD msun s_sin.c
//   cos                    FreeBSD msun s_cos.c
//   atan, polyvalP/Q       Go math/atan.go (Cephes lineage)
//   atan2                  Go math/atan2.go
//   copysign, signbit      FreeBSD msun helpers
// Transcribed from the reference JavaScript ports of those same files, which
// serve as the oracle in tests/math-oracle.test.ts. That oracle is a
// devDependency of the repository root and never enters this bundle: it is
// named in the test and nowhere else, because packages/sim keeps
// `dependencies: {}`.

// ─────────────────────────────────────────────────────────────────────────────
// Float64 bit access
// ─────────────────────────────────────────────────────────────────────────────

const BITS = new ArrayBuffer(8);
const F64 = new Float64Array(BITS);
const U32 = new Uint32Array(BITS);

// Which half of the pair holds the more significant word depends on byte
// order. The probe below is the only computation at module load beyond
// literal arithmetic, and it touches nothing outside this file: it stores the
// double 2 (0x40000000_00000000) and asks which lane came out zero.
F64[0] = 2;
const HIGH = U32[0] === 0 ? 1 : 0;
const LOW = HIGH === 1 ? 0 : 1;

/** Unsigned 32-bit word holding the sign, exponent and top mantissa bits. */
function getHighWord(x: number): number {
  F64[0] = x;
  return U32[HIGH];
}

/** Unsigned 32-bit word holding the low mantissa bits. */
function getLowWord(x: number): number {
  F64[0] = x;
  return U32[LOW];
}

/** Rebuilds a double from its two 32-bit halves. */
function fromWords(high: number, low: number): number {
  U32[HIGH] = high;
  U32[LOW] = low;
  return F64[0];
}

// ─────────────────────────────────────────────────────────────────────────────
// High-word masks and float64 constants
// ─────────────────────────────────────────────────────────────────────────────

/** High word with the sign bit cleared. */
const HIGH_WORD_ABS_MASK = 0x7fffffff | 0;

/** High word with only the sign bit set. */
const HIGH_WORD_SIGN_MASK = 0x80000000 >>> 0;

/** High word with only the top 20 mantissa bits set. */
const HIGH_WORD_SIGNIFICAND_MASK = 0x000fffff | 0;

/** Eleven exponent bits, once the high word has been shifted down by 20. */
const EXPONENT_BITS = 0x7ff | 0;

const PI = 3.141592653589793;
const PIO2 = 1.5707963267948966;
const PIO4 = 0.7853981633974483;
const PINF = Infinity;
const NINF = -Infinity;

// High word of pi/4.
const PIO4_HIGH_WORD = 0x3fe921fb | 0;

// High word of 3pi/4, 5pi/4, 6pi/4, 7pi/4, 8pi/4 and 9pi/4. The reduction
// branches on these instead of on the values themselves so that a single
// integer comparison replaces a float comparison plus a subtraction.
const THREE_PIO4_HIGH_WORD = 0x4002d97c | 0;
const FIVE_PIO4_HIGH_WORD = 0x400f6a7a | 0;
const THREE_PIO2_HIGH_WORD = 0x4012d97c | 0;
const SEVEN_PIO4_HIGH_WORD = 0x4015fdbc | 0;
const TWO_PI_HIGH_WORD = 0x401921fb | 0;
const NINE_PIO4_HIGH_WORD = 0x401c463b | 0;

// Top 20 mantissa bits shared by pi and pi/2. When they match, the naive
// subtraction cancels and the medium-size reduction has to be used even for a
// small argument.
const PI_HIGH_WORD_SIGNIFICAND = 0x921fb | 0;

// High word of 2^20 * pi/2, where fdlibm hands over to the large-argument
// reduction this port does not ship.
const MEDIUM = 0x413921fb | 0;

/**
 * Largest magnitude sin and cos accept: fromWords(MEDIUM, 0), which happens to
 * be the whole number 1647099 and sits just below 2^20 * pi/2. Any |x| at or
 * above it has a high word of at least MEDIUM, so the comparison below is
 * exactly the branch condition of e_rem_pio2.c, not an approximation of it.
 */
const REMPIO2_MAX = 1647099;

// Below 2^-26 sin(x) is x to the last bit; below 2^-27 cos(x) is 1.
const TWO_NEG_26_HIGH_WORD = 0x3e500000 | 0;
const TWO_NEG_27_HIGH_WORD = 0x3e400000 | 0;

// 53 bits of 2/pi.
const INVPIO2 = 6.36619772367581382433e-1;

// First 33 bits of pi/2, and the tail pi/2 - PIO2_1.
const PIO2_1 = 1.57079632673412561417;
const PIO2_1T = 6.07710050650619224932e-11;
const TWO_PIO2_1T = 2.0 * PIO2_1T;
const THREE_PIO2_1T = 3.0 * PIO2_1T;
const FOUR_PIO2_1T = 4.0 * PIO2_1T;

// Another 33 bits of pi/2, and its tail.
const PIO2_2 = 6.0771005063039659766e-11;
const PIO2_2T = 2.02226624879595063154e-21;

// And another 33 bits, with its tail. Three rounds accumulate 151 bits, which
// is what an exactly cancelling argument needs.
const PIO2_3 = 2.0222662487111664558e-21;
const PIO2_3T = 8.47842766036889956997e-32;

// Coefficients of the degree-13 odd polynomial for sin on [-pi/4, pi/4].
const S1 = -1.66666666666666324348e-1;
const S2 = 8.33333333332248946124e-3;
const S3 = -1.98412698298579493134e-4;
const S4 = 2.75573137070700676789e-6;
const S5 = -2.50507602534068634195e-8;
const S6 = 1.58969099521155010221e-10;

// atan: pi/2 = PIO2 + MOREBITS, and the tangent of 3pi/8 that splits the
// range reduction.
const MOREBITS = 6.123233995736765886130e-17;
const T3P8 = 2.4142135623730950488;

// ─────────────────────────────────────────────────────────────────────────────
// Sign helpers
// ─────────────────────────────────────────────────────────────────────────────

/** True when the sign bit of `x` is set, which -0 has and +0 has not. */
function signbit(x: number): boolean {
  return getHighWord(x) >>> 31 === 1;
}

/** Magnitude of `x` carrying the sign of `y`, zeros and infinities included. */
function copysign(x: number, y: number): number {
  const hx = getHighWord(x) & HIGH_WORD_ABS_MASK;
  const lx = getLowWord(x);
  const hy = getHighWord(y) & HIGH_WORD_SIGN_MASK;
  return fromWords(hx | hy, lx);
}

// ─────────────────────────────────────────────────────────────────────────────
// Polynomial kernels
// ─────────────────────────────────────────────────────────────────────────────

/**
 * sin on approximately [-pi/4, pi/4], where `y` is the tail of `x`. The
 * caller must return sin(-0) = -0 without coming here: the odd polynomial is
 * not evaluated in a way that preserves a signed zero.
 */
function kernelSin(x: number, y: number): number {
  const z = x * x;
  const w = z * z;
  const r = S2 + (z * (S3 + (z * S4))) + (z * w * (S5 + (z * S6)));
  const v = z * x;
  if (y === 0.0) {
    return x + (v * (S1 + (z * r)));
  }
  return x - (((z * ((0.5 * y) - (v * r))) - y) - (v * S1));
}

/** Degree 1-3 half of the cos polynomial. */
function polyvalC13(x: number): number {
  if (x === 0.0) {
    return 0.0416666666666666;
  }
  return 0.0416666666666666 + (x * (-0.001388888888887411 + (x * 0.00002480158728947673)));
}

/** Degree 4-6 half of the cos polynomial. */
function polyvalC46(x: number): number {
  if (x === 0.0) {
    return -2.7557314351390663e-7;
  }
  return -2.7557314351390663e-7 + (x * (2.087572321298175e-9 + (x * -1.1359647557788195e-11)));
}

/**
 * cos on [-pi/4, pi/4], where `y` is the tail of `x`. The result is
 * rearranged as w + (t + r) so that the leading 1 - x*x/2 stays exact.
 */
function kernelCos(x: number, y: number): number {
  const z = x * x;
  let w = z * z;
  let r = z * polyvalC13(z);
  r += w * w * polyvalC46(z);
  const hz = 0.5 * z;
  w = 1.0 - hz;
  return w + (((1.0 - w) - hz) + ((z * r) - (x * y)));
}

/** Numerator of the degree 4/5 rational approximation of atan. */
function polyvalP(x: number): number {
  if (x === 0.0) {
    return -64.85021904942025;
  }
  return -64.85021904942025 + (x * (-122.88666844901361 + (x * (-75.00855792314705 + (x * (-16.157537187333652 + (x * -0.8750608600031904)))))));
}

/** Denominator of the degree 4/5 rational approximation of atan. */
function polyvalQ(x: number): number {
  if (x === 0.0) {
    return 194.5506571482614;
  }
  return 194.5506571482614 + (x * (485.3903996359137 + (x * (432.88106049129027 + (x * (165.02700983169885 + (x * (24.858464901423062 + (x * 1.0)))))))));
}

// ─────────────────────────────────────────────────────────────────────────────
// Argument reduction
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Computes x - n*pi/2 for medium-sized arguments, iterating up to three times
 * when the subtraction cancels. Writes the remainder as y[0] + y[1] and
 * returns n.
 */
function rempio2Medium(x: number, ix: number, y: number[]): number {
  // Math.round is fully specified by ECMA-262, ties going toward +Infinity,
  // so it is not a source of engine drift.
  const n = Math.round(x * INVPIO2);
  let r = x - (n * PIO2_1);
  let w = n * PIO2_1T;

  // First rounding, good to 85 bits.
  const j = (ix >> 20) | 0;
  y[0] = r - w;
  let high = getHighWord(y[0]);
  let i = j - ((high >> 20) & EXPONENT_BITS);

  // Second iteration, good to 118 bits.
  if (i > 16) {
    const t1 = r;
    w = n * PIO2_2;
    r = t1 - w;
    w = (n * PIO2_2T) - ((t1 - r) - w);
    y[0] = r - w;
    high = getHighWord(y[0]);
    i = j - ((high >> 20) & EXPONENT_BITS);

    // Third iteration, 151 bits accumulated.
    if (i > 49) {
      const t2 = r;
      w = n * PIO2_3;
      r = t2 - w;
      w = (n * PIO2_3T) - ((t2 - r) - w);
      y[0] = r - w;
    }
  }
  y[1] = (r - y[0]) - w;
  return n;
}

/**
 * Computes x - n*pi/2, writing the remainder as y[0] + y[1] and returning n.
 * The first four multiples of pi/2 are peeled off with a plain subtraction;
 * anything larger, or anything that cancels exactly, goes through the
 * medium-size path.
 */
function rempio2(x: number, y: number[]): number {
  const hx = getHighWord(x) | 0;
  const ix = (hx & HIGH_WORD_ABS_MASK) | 0;
  let z: number;

  // Case: |x| ~<= pi/4 — nothing to reduce.
  if (ix <= PIO4_HIGH_WORD) {
    y[0] = x;
    y[1] = 0.0;
    return 0;
  }
  // Case: |x| ~<= 5pi/4.
  if (ix <= FIVE_PIO4_HIGH_WORD) {
    // Case: |x| ~= pi/2 or pi — cancellation, use the medium path.
    if ((ix & HIGH_WORD_SIGNIFICAND_MASK) === PI_HIGH_WORD_SIGNIFICAND) {
      return rempio2Medium(x, ix, y);
    }
    // Case: |x| ~<= 3pi/4.
    if (ix <= THREE_PIO4_HIGH_WORD) {
      if (hx > 0) {
        z = x - PIO2_1;
        y[0] = z - PIO2_1T;
        y[1] = (z - y[0]) - PIO2_1T;
        return 1;
      }
      z = x + PIO2_1;
      y[0] = z + PIO2_1T;
      y[1] = (z - y[0]) + PIO2_1T;
      return -1;
    }
    if (hx > 0) {
      z = x - (2.0 * PIO2_1);
      y[0] = z - TWO_PIO2_1T;
      y[1] = (z - y[0]) - TWO_PIO2_1T;
      return 2;
    }
    z = x + (2.0 * PIO2_1);
    y[0] = z + TWO_PIO2_1T;
    y[1] = (z - y[0]) + TWO_PIO2_1T;
    return -2;
  }
  // Case: |x| ~<= 9pi/4.
  if (ix <= NINE_PIO4_HIGH_WORD) {
    // Case: |x| ~<= 7pi/4.
    if (ix <= SEVEN_PIO4_HIGH_WORD) {
      // Case: |x| ~= 3pi/2 — cancellation again.
      if (ix === THREE_PIO2_HIGH_WORD) {
        return rempio2Medium(x, ix, y);
      }
      if (hx > 0) {
        z = x - (3.0 * PIO2_1);
        y[0] = z - THREE_PIO2_1T;
        y[1] = (z - y[0]) - THREE_PIO2_1T;
        return 3;
      }
      z = x + (3.0 * PIO2_1);
      y[0] = z + THREE_PIO2_1T;
      y[1] = (z - y[0]) + THREE_PIO2_1T;
      return -3;
    }
    // Case: |x| ~= 2pi — cancellation.
    if (ix === TWO_PI_HIGH_WORD) {
      return rempio2Medium(x, ix, y);
    }
    if (hx > 0) {
      z = x - (4.0 * PIO2_1);
      y[0] = z - FOUR_PIO2_1T;
      y[1] = (z - y[0]) - FOUR_PIO2_1T;
      return 4;
    }
    z = x + (4.0 * PIO2_1);
    y[0] = z + FOUR_PIO2_1T;
    y[1] = (z - y[0]) + FOUR_PIO2_1T;
    return -4;
  }
  // Case: |x| ~< 2^20 * pi/2 — medium size.
  if (ix < MEDIUM) {
    return rempio2Medium(x, ix, y);
  }
  // Everything past this point, including infinity and NaN, would need the
  // large-argument half of e_rem_pio2.c: 207 lines of multiprecision work that
  // this port deliberately omits because the game cannot reach them. sin and
  // cos guard the domain before calling, so this is a structural assertion
  // that the omission stayed unreachable, not a path a caller can trip.
  throw new RangeError(`sim/math.rempio2: |x| out of supported domain: ${x}`);
}

// ─────────────────────────────────────────────────────────────────────────────
// Public surface
// ─────────────────────────────────────────────────────────────────────────────

// Remainder scratch, one array per entry point so the two can never interleave.
// Module-scope arrays are safe in a single-threaded simulation, and they are
// array literals rather than the result of any call, which is what keeps this
// module a leaf.
const SIN_REMAINDER: number[] = [0.0, 0.0];
const COS_REMAINDER: number[] = [0.0, 0.0];

/**
 * Sine of an angle in radians, bit-identical on every engine.
 *
 * @throws RangeError when |x| is at or above 2^20 * pi/2, or is NaN.
 */
export function sin(x: number): number {
  // Written negated on purpose: it rejects NaN as well, which the positive
  // form would let through and turn into a silent NaN downstream.
  if (!(Math.abs(x) < REMPIO2_MAX)) {
    throw new RangeError(`sim/math.sin: |x| out of supported domain: ${x}`);
  }
  const ix = getHighWord(x) & HIGH_WORD_ABS_MASK;

  // Case: |x| ~< pi/4.
  if (ix <= PIO4_HIGH_WORD) {
    // Case: |x| ~< 2^-26, where sin(x) is x — and this is also what carries
    // sin(-0) = -0 out of the function.
    if (ix < TWO_NEG_26_HIGH_WORD) {
      return x;
    }
    return kernelSin(x, 0.0);
  }
  const n = rempio2(x, SIN_REMAINDER);
  switch (n & 3) {
    case 0:
      return kernelSin(SIN_REMAINDER[0], SIN_REMAINDER[1]);
    case 1:
      return kernelCos(SIN_REMAINDER[0], SIN_REMAINDER[1]);
    case 2:
      return -kernelSin(SIN_REMAINDER[0], SIN_REMAINDER[1]);
    default:
      return -kernelCos(SIN_REMAINDER[0], SIN_REMAINDER[1]);
  }
}

/**
 * Cosine of an angle in radians, bit-identical on every engine.
 *
 * @throws RangeError when |x| is at or above 2^20 * pi/2, or is NaN.
 */
export function cos(x: number): number {
  if (!(Math.abs(x) < REMPIO2_MAX)) {
    throw new RangeError(`sim/math.cos: |x| out of supported domain: ${x}`);
  }
  const ix = getHighWord(x) & HIGH_WORD_ABS_MASK;

  // Case: |x| ~< pi/4.
  if (ix <= PIO4_HIGH_WORD) {
    // Case: |x| ~< 2^-27, where cos(x) is 1.
    if (ix < TWO_NEG_27_HIGH_WORD) {
      return 1.0;
    }
    return kernelCos(x, 0.0);
  }
  const n = rempio2(x, COS_REMAINDER);
  switch (n & 3) {
    case 0:
      return kernelCos(COS_REMAINDER[0], COS_REMAINDER[1]);
    case 1:
      return -kernelSin(COS_REMAINDER[0], COS_REMAINDER[1]);
    case 2:
      return -kernelCos(COS_REMAINDER[0], COS_REMAINDER[1]);
    default:
      return kernelSin(COS_REMAINDER[0], COS_REMAINDER[1]);
  }
}

/**
 * Arctangent of a ratio, reduced from three intervals onto [0, 0.66].
 *
 * Deliberately carries NO domain guard. Unlike sin and cos it never performs
 * argument reduction, so it is exact for every finite input and for both
 * infinities — and atan2 feeds it y/x, a quotient that overflows to infinity
 * whenever two entities are nearly aligned on one axis. A guard here would
 * reject atan2(1, 1e-7), which is an ordinary frame of this game.
 */
function atan(x: number): number {
  if (Number.isNaN(x) || x === 0.0) {
    return x;
  }
  if (x === PINF) {
    return PIO2;
  }
  if (x === NINF) {
    return -PIO2;
  }
  let a = x;
  let sgn = false;
  if (a < 0.0) {
    sgn = true;
    a = -a;
  }
  // Range reduction onto [0, 0.66].
  let flg = 0;
  let y: number;
  if (a > T3P8) {
    y = PIO2;
    flg = 1;
    a = -(1.0 / a);
  } else if (a <= 0.66) {
    y = 0.0;
  } else {
    y = PIO4;
    flg = 2;
    a = (a - 1.0) / (a + 1.0);
  }
  let z = a * a;
  z = (z * polyvalP(z)) / polyvalQ(z);
  z = (a * z) + a;
  if (flg === 2) {
    z += 0.5 * MOREBITS;
  } else if (flg === 1) {
    z += MOREBITS;
  }
  y += z;
  return sgn ? -y : y;
}

/**
 * Angle in radians between the positive x axis and the ray to (x, y),
 * bit-identical on every engine.
 *
 * Total by construction: every special case of IEEE-754 atan2 is handled
 * explicitly — both signed zeros, both infinities in every combination, and
 * NaN, which propagates as NaN exactly as the reference port does. There is
 * no restricted domain here to assert.
 */
export function atan2(y: number, x: number): number {
  if (Number.isNaN(x) || Number.isNaN(y)) {
    return NaN;
  }
  if (x === PINF || x === NINF) {
    if (x === PINF) {
      if (y === PINF || y === NINF) {
        return copysign(PI / 4.0, y);
      }
      return copysign(0.0, y);
    }
    // Case: x is -Infinity.
    if (y === PINF || y === NINF) {
      return copysign((3.0 * PI) / 4.0, y);
    }
    return copysign(PI, y);
  }
  if (y === PINF || y === NINF) {
    return copysign(PI / 2.0, y);
  }
  if (y === 0.0) {
    // `x >= 0` alone is not enough: -0 satisfies it and must still answer pi.
    if (x >= 0.0 && !signbit(x)) {
      return copysign(0.0, y);
    }
    return copysign(PI, y);
  }
  if (x === 0.0) {
    return copysign(PI / 2.0, y);
  }
  const q = atan(y / x);
  if (x < 0.0) {
    if (q <= 0.0) {
      return q + PI;
    }
    return q - PI;
  }
  return q;
}
