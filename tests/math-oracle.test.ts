// math-oracle.test.ts — FORM-04. Proves that the sin/cos/atan2 of
// packages/sim are bit-identical to the fdlibm port they were transcribed
// from, and that an angle outside the supported domain is refused loudly.
//
// @stdlib is a devDependency ONLY. It pulls 153 transitive packages, and the
// published game keeps `dependencies: {}` (CLAUDE.md invariant), so the oracle
// may never be reached from packages/sim/src. It lives here, in tests/, and
// nowhere else — packages/sim/src/math.ts has no import line at all.
//
// The trap this file exists to avoid: using the engine's own trigonometry as
// the reference. Asserting our sin equals the engine's built-in sine fails by
// construction — measured over 202.000 samples, @stdlib and the V8 built-ins
// disagree on 0,92% of sin, 0,92% of cos and 24,9% of atan2, always by one
// unit in the last place. V8 is *adapted from* fdlibm; it is not fdlibm. The
// engine's built-in trigonometry is the thing being replaced, not the
// reference. The oracle is the same port.
//
// Every comparison here is exact. Approximate matchers, tolerances and
// decimal truncation are banned in this file: a one-unit-in-the-last-place
// drift is exactly what desynchronises a peer forty seconds into a match, and
// exactly what a tolerance hides. `Object.is` is the chosen predicate because
// it also separates -0 from +0, which is a difference callers must see
// (sin(-0) is -0, and atan2 carries the sign of a zero into the quadrant).
import { describe, it, expect } from 'vitest';
import stdlibSin from '@stdlib/math-base-special-sin';
import stdlibCos from '@stdlib/math-base-special-cos';
import stdlibAtan2 from '@stdlib/math-base-special-atan2';
import { Rng, sin, cos, atan2 } from '@dg2/sim';

const PI = Math.PI;

/**
 * Largest magnitude this port accepts. It is fromWords(0x413921fb, 0) — the
 * exact double at which fdlibm switches to the Payne-Hanek reduction that the
 * port deliberately does not ship. Below it, the medium-size reduction covers
 * everything; at or above it, sin/cos throw.
 */
const DOMAIN_MAX = 1647099;

/**
 * Deterministic sample band, drawn from the project's own seeded generator and
 * never from an unseeded source. A flaky corpus turns a one-ULP regression
 * into a test that fails once a week and then gets muted. Each sample is
 * pushed with both signs, because the reduction branches on the sign of the
 * high word.
 */
function band(rng: Rng, lo: number, hi: number, n: number): number[] {
  const out: number[] = [];
  for (let i = 0; i < n; i++) {
    const x = lo + rng.next() * (hi - lo);
    out.push(x, -x);
  }
  return out;
}

/**
 * Angles that land on fdlibm's exact-cancellation branches: |x| near a
 * multiple of pi/2, where the naive subtraction loses every significant bit
 * and the medium-size reduction has to be used even though the argument is
 * small. Missing these is the classic way a transcription looks correct and
 * is off by one ULP exactly where a spawn ring puts an enemy.
 */
const CANCELLATION: number[] = [
  PI / 2, PI, (3 * PI) / 2, 2 * PI, (5 * PI) / 2, 3 * PI, 4 * PI,
].flatMap((v) => [v, -v]);

/**
 * Tiny magnitudes, straddling the 2^-26 shortcut of sin and the 2^-27
 * shortcut of cos, plus the two signed zeros.
 */
const TINY: number[] = [
  0, -0, 2 ** -30, -(2 ** -30), 2 ** -27, -(2 ** -27), 2 ** -26, -(2 ** -26),
  1e-12, -1e-12,
];

/** One seeded band per reduction branch, named the way fdlibm names them. */
function branches(): Record<string, number[]> {
  const rng = new Rng(0x00c0ffee);
  return {
    'ramo |x| <= pi/4 — sem redução': [...TINY, ...band(rng, 0, PI / 4, 200)],
    'ramo |x| <= 3pi/4': band(rng, PI / 4, (3 * PI) / 4, 200),
    'ramo |x| <= 5pi/4': band(rng, (3 * PI) / 4, (5 * PI) / 4, 200),
    'ramo |x| <= 3pi': [...CANCELLATION, ...band(rng, (5 * PI) / 4, 3 * PI, 200)],
    'ramo |x| < 2^20 — redução de tamanho médio': [
      ...band(rng, 3 * PI, 1_000_000, 200),
      ...band(rng, 1_000_000, DOMAIN_MAX - 1, 100),
    ],
  };
}

/** Every branch flattened into one corpus. */
function angleCorpus(): number[] {
  return Object.values(branches()).flat();
}

/**
 * Pairs for atan2. Beyond the four quadrants, this covers the signed zeros
 * (all four pairs), the infinities, NaN, and steep ratios whose quotient
 * overflows to infinity — the last group is why atan carries no domain guard:
 * two entities almost vertically aligned produce exactly that quotient.
 */
function atan2Corpus(): Array<[number, number]> {
  const rng = new Rng(0x0badf00d);
  const pairs: Array<[number, number]> = [];
  const specials = [
    0, -0, 1, -1, Infinity, -Infinity, NaN,
    1e-300, -1e-300, 1e300, -1e300, Number.MIN_VALUE, Number.MAX_VALUE,
  ];
  for (const y of specials) {
    for (const x of specials) pairs.push([y, x]);
  }
  for (let i = 0; i < 400; i++) {
    const y = rng.next() * 2000;
    const x = rng.next() * 2000;
    pairs.push([y, x], [y, -x], [-y, x], [-y, -x]);
  }
  for (let i = 0; i < 200; i++) {
    const y = rng.next() * 1e6;
    const x = rng.next() * 1e-6;
    pairs.push([y, x], [y, -x], [-y, x], [-y, -x]);
  }
  return pairs;
}

describe('sim/math contra o oráculo fdlibm do @stdlib', () => {
  it('sin é bit-exato contra @stdlib em todo o corpus', () => {
    for (const x of angleCorpus()) {
      expect(Object.is(sin(x), stdlibSin(x)), `sin(${x})`).toBe(true);
    }
  });

  it('cos é bit-exato contra @stdlib em todo o corpus', () => {
    for (const x of angleCorpus()) {
      expect(Object.is(cos(x), stdlibCos(x)), `cos(${x})`).toBe(true);
    }
  });

  it('atan2 é bit-exato contra @stdlib em todo o corpus', () => {
    for (const [y, x] of atan2Corpus()) {
      expect(Object.is(atan2(y, x), stdlibAtan2(y, x)), `atan2(${y}, ${x})`).toBe(true);
    }
  });

  it('sin(-0) devolve -0, e não +0 — o sinal do zero atravessa o port', () => {
    expect(Object.is(sin(-0), -0)).toBe(true);
    expect(Object.is(sin(-0), stdlibSin(-0))).toBe(true);
  });
});

describe('os cinco ramos da redução de argumento', () => {
  for (const [name, xs] of Object.entries(branches())) {
    it(`${name}: sin e cos bit-exatos`, () => {
      expect(xs.length).toBeGreaterThan(0);
      for (const x of xs) {
        expect(Object.is(sin(x), stdlibSin(x)), `sin(${x})`).toBe(true);
        expect(Object.is(cos(x), stdlibCos(x)), `cos(${x})`).toBe(true);
      }
    });
  }
});

describe('casos especiais de atan2', () => {
  it('os quatro pares de zeros com sinal', () => {
    const zeros: Array<[number, number]> = [
      [0, 0], [-0, 0], [0, -0], [-0, -0],
    ];
    for (const [y, x] of zeros) {
      expect(Object.is(atan2(y, x), stdlibAtan2(y, x)), `atan2(${y}, ${x})`).toBe(true);
    }
  });

  it('infinitos em qualquer combinação', () => {
    const vals = [Infinity, -Infinity, 1, -1, 0, -0];
    for (const y of vals) {
      for (const x of vals) {
        if (Number.isFinite(y) && Number.isFinite(x)) continue;
        expect(Object.is(atan2(y, x), stdlibAtan2(y, x)), `atan2(${y}, ${x})`).toBe(true);
      }
    }
  });

  it('NaN em qualquer posição propaga NaN, como no oráculo', () => {
    expect(Number.isNaN(atan2(NaN, 1))).toBe(true);
    expect(Number.isNaN(atan2(1, NaN))).toBe(true);
    expect(Number.isNaN(atan2(NaN, NaN))).toBe(true);
  });

  it('os quatro quadrantes', () => {
    const quads: Array<[number, number]> = [
      [1, 1], [1, -1], [-1, -1], [-1, 1],
      [3, 4], [3, -4], [-3, -4], [-3, 4],
    ];
    for (const [y, x] of quads) {
      expect(Object.is(atan2(y, x), stdlibAtan2(y, x)), `atan2(${y}, ${x})`).toBe(true);
    }
  });

  it('razão íngreme cujo quociente estoura para infinito não é recusada', () => {
    expect(Object.is(atan2(1e300, 1e-300), stdlibAtan2(1e300, 1e-300))).toBe(true);
    expect(Object.is(atan2(1, 1e-7), stdlibAtan2(1, 1e-7))).toBe(true);
  });
});

describe('domínio suportado', () => {
  it('sin e cos recusam alto acima de 2^20 · pi/2', () => {
    expect(() => sin(2 ** 21)).toThrow(RangeError);
    expect(() => cos(2 ** 21)).toThrow(RangeError);
    expect(() => sin(-(2 ** 21))).toThrow(RangeError);
    expect(() => cos(-(2 ** 21))).toThrow(RangeError);
  });

  it('a borda é exatamente onde o Payne-Hanek começaria', () => {
    expect(() => sin(DOMAIN_MAX)).toThrow(RangeError);
    expect(() => cos(DOMAIN_MAX)).toThrow(RangeError);
    expect(() => sin(-DOMAIN_MAX)).toThrow(RangeError);
    expect(() => sin(DOMAIN_MAX - 1)).not.toThrow();
    expect(() => cos(DOMAIN_MAX - 1)).not.toThrow();
  });

  it('a guarda negada também pega NaN e infinitos, em vez de devolver NaN em silêncio', () => {
    for (const bad of [NaN, Infinity, -Infinity]) {
      expect(() => sin(bad), `sin(${bad})`).toThrow(RangeError);
      expect(() => cos(bad), `cos(${bad})`).toThrow(RangeError);
    }
  });

  it('a mensagem do erro nomeia a função e o valor recusado', () => {
    expect(() => sin(2 ** 21)).toThrow(/sin/);
    expect(() => cos(2 ** 21)).toThrow(/cos/);
  });
});
