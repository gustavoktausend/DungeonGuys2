import { describe, it, expect } from 'vitest';
import { Rng } from '@dg2/sim';

describe('Rng', () => {
  it('produz a mesma sequência para a mesma seed', () => {
    const a = new Rng(12345);
    const b = new Rng(12345);
    const seqA = Array.from({ length: 100 }, () => a.next());
    const seqB = Array.from({ length: 100 }, () => b.next());
    expect(seqA).toEqual(seqB);
  });

  it('produz sequências diferentes para seeds diferentes', () => {
    const a = new Rng(1);
    const b = new Rng(2);
    expect(a.next()).not.toBe(b.next());
  });

  it('gera valores em [0, 1)', () => {
    const r = new Rng(7);
    for (let i = 0; i < 1000; i++) {
      const v = r.next();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it('int(n) fica em [0, n)', () => {
    const r = new Rng(99);
    for (let i = 0; i < 1000; i++) {
      const v = r.int(6);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(6);
      expect(Number.isInteger(v)).toBe(true);
    }
  });

  it('intRange é inclusivo nos dois extremos', () => {
    const r = new Rng(5);
    const seen = new Set<number>();
    for (let i = 0; i < 2000; i++) seen.add(r.intRange(3, 5));
    expect([...seen].sort()).toEqual([3, 4, 5]);
  });

  it('chance(0) nunca acontece e chance(1) sempre acontece', () => {
    const r = new Rng(42);
    for (let i = 0; i < 200; i++) {
      expect(r.chance(0)).toBe(false);
      expect(r.chance(1)).toBe(true);
    }
  });

  it('pick devolve um elemento do array', () => {
    const r = new Rng(3);
    const arr = ['a', 'b', 'c'] as const;
    for (let i = 0; i < 100; i++) expect(arr).toContain(r.pick(arr));
  });

  it('shuffled preserva os elementos e não muta a entrada', () => {
    const r = new Rng(11);
    const src = [1, 2, 3, 4, 5];
    const out = r.shuffled(src);
    expect(src).toEqual([1, 2, 3, 4, 5]);
    expect([...out].sort((x, y) => x - y)).toEqual([1, 2, 3, 4, 5]);
  });

  it('save/restore retoma exatamente a mesma sequência', () => {
    const r = new Rng(2024);
    for (let i = 0; i < 50; i++) r.next();
    const snapshot = r.save();
    const expected = Array.from({ length: 20 }, () => r.next());
    r.restore(snapshot);
    const actual = Array.from({ length: 20 }, () => r.next());
    expect(actual).toEqual(expected);
  });
});
