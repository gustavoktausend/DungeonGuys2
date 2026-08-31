import { describe, it, expect } from 'vitest';
import { createUlidFactory, ulid } from '../src/app/ulid';

// The alphabet is spelled out again here on purpose: if ulid.ts ever grows a
// typo in its own table, a test that imported that table would inherit the
// typo instead of catching it.
const CROCKFORD = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
const CANONICAL = /^[0-9A-HJKMNP-TV-Z]{26}$/;

/** Decodes the 10-character time component back to epoch milliseconds. */
function decodeTime(id: string): number {
  let t = 0;
  for (const ch of id.slice(0, 10)) t = t * 32 + CROCKFORD.indexOf(ch);
  return t;
}

/** Decodes the 16-character random component to its full 80-bit value. */
function decodeRandom(id: string): bigint {
  let r = 0n;
  for (const ch of id.slice(10)) r = r * 32n + BigInt(CROCKFORD.indexOf(ch));
  return r;
}

/** A byte source that never repeats a block, and never needs a real CSPRNG. */
function countingBytes(start = 0): (n: number) => Uint8Array {
  let block = start;
  return (n: number) => {
    const out = new Uint8Array(n);
    for (let i = 0; i < n; i++) out[i] = (block + i) & 0xff;
    block++;
    return out;
  };
}

/** A byte source that always hands back the same fixed block. */
function fixedBytes(...bytes: number[]): (n: number) => Uint8Array {
  return (n: number) => {
    const out = new Uint8Array(n);
    for (let i = 0; i < n; i++) out[i] = bytes[i] ?? 0;
    return out;
  };
}

describe('ulid', () => {
  it('gera um id de exatamente 26 caracteres', () => {
    const gen = createUlidFactory({ now: () => 1469918176385, randomBytes: countingBytes() });
    for (let i = 0; i < 50; i++) expect(gen()).toHaveLength(26);
    expect(ulid()).toHaveLength(26);
  });

  it('usa apenas o alfabeto Crockford Base32, sem I, L, O nem U', () => {
    for (let i = 0; i < 1000; i++) {
      const id = ulid();
      expect(id).toMatch(CANONICAL);
      for (const ch of id) expect(CROCKFORD).toContain(ch);
    }
    expect(CROCKFORD).not.toContain('I');
    expect(CROCKFORD).not.toContain('L');
    expect(CROCKFORD).not.toContain('O');
    expect(CROCKFORD).not.toContain('U');
  });

  it('codifica o timestamp em ms nos dez primeiros caracteres', () => {
    // Vetor da própria spec do ULID: 1469918176385 -> 01ARYZ6S41.
    const gen = createUlidFactory({ now: () => 1469918176385, randomBytes: countingBytes() });
    expect(gen().slice(0, 10)).toBe('01ARYZ6S41');

    for (const t of [0, 1, 1469918176385, 281474976710655]) {
      const g = createUlidFactory({ now: () => t, randomBytes: countingBytes() });
      expect(decodeTime(g())).toBe(t);
    }
  });

  it('usa os dezesseis caracteres restantes para os 80 bits de aleatoriedade', () => {
    const gen = createUlidFactory({ now: () => 1469918176385, randomBytes: fixedBytes(0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff) });
    const id = gen();
    expect(id.slice(10)).toHaveLength(16);
    expect(decodeRandom(id)).toBe((1n << 80n) - 1n);
  });

  it('cresce estritamente na ordem lexicográfica dentro do mesmo milissegundo', () => {
    const gen = createUlidFactory({ now: () => 1469918176385, randomBytes: countingBytes() });
    const ids = Array.from({ length: 200 }, () => gen());
    for (let i = 1; i < ids.length; i++) expect(ids[i] > ids[i - 1]).toBe(true);
    expect([...ids].sort()).toEqual(ids);
  });

  it('incrementa o bit menos significativo com carry dentro do mesmo milissegundo', () => {
    const gen = createUlidFactory({
      now: () => 1469918176385,
      randomBytes: fixedBytes(0, 0, 0, 0, 0, 0, 0, 0, 0, 0xff),
    });
    const a = gen();
    const b = gen();
    expect(decodeRandom(a)).toBe(255n);
    // 255 -> 256 só acontece se o carry atravessar para o byte anterior.
    expect(decodeRandom(b)).toBe(256n);
    expect(decodeTime(a)).toBe(decodeTime(b));
  });

  it('ordena lexicograficamente na mesma ordem dos timestamps', () => {
    let clock = 1469918176385;
    const gen = createUlidFactory({ now: () => clock, randomBytes: countingBytes(200) });
    const ids: string[] = [];
    const times: number[] = [];
    for (let i = 0; i < 100; i++) {
      times.push(clock);
      ids.push(gen());
      clock += 1 + (i % 7);
    }
    expect([...ids].sort()).toEqual(ids);
    expect(ids.map(decodeTime)).toEqual(times);
  });

  it('não regride quando o relógio anda para trás', () => {
    let clock = 1469918176385;
    const gen = createUlidFactory({ now: () => clock, randomBytes: countingBytes() });
    const a = gen();
    clock -= 60000; // ajuste de relógio, NTP ou fuso do sistema
    const b = gen();
    const c = gen();
    expect(b > a).toBe(true);
    expect(c > b).toBe(true);
  });

  it('é reproduzível com o mesmo relógio e a mesma fonte de bytes', () => {
    const make = () => createUlidFactory({ now: () => 1469918176385, randomBytes: countingBytes(7) });
    const a = Array.from({ length: 30 }, make());
    const b = Array.from({ length: 30 }, make());
    expect(a).toEqual(b);
  });

  it('recusa esgotar os 80 bits de aleatoriedade em vez de repetir um id', () => {
    const gen = createUlidFactory({
      now: () => 1469918176385,
      randomBytes: fixedBytes(...new Array(10).fill(0xff)),
    });
    expect(gen()).toHaveLength(26);
    expect(() => gen()).toThrow();
  });

  it('recusa um timestamp fora dos 48 bits', () => {
    const tooBig = createUlidFactory({ now: () => 281474976710656, randomBytes: countingBytes() });
    expect(() => tooBig()).toThrow();
    const negative = createUlidFactory({ now: () => -1, randomBytes: countingBytes() });
    expect(() => negative()).toThrow();
  });
});
