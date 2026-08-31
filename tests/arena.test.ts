import { describe, it, expect } from 'vitest';
import { makeTestWorld } from './helpers';
import {
  generateArena, resolveObstacles, trapDangerous, trapFrameAt, damageCrate, rectCircle,
  INDESTRUCTIBLE_HP, WORLD,
} from '@dg2/sim';

describe('generateArena', () => {
  it('é determinística para a mesma seed', () => {
    const a = makeTestWorld(); generateArena(a);
    const b = makeTestWorld(); generateArena(b);
    expect(a.obstacles).toEqual(b.obstacles);
    expect(a.traps).toEqual(b.traps);
  });

  it('difere entre seeds', () => {
    const a = makeTestWorld({ seed: 1 }); generateArena(a);
    const b = makeTestWorld({ seed: 2 }); generateArena(b);
    expect(a.obstacles).not.toEqual(b.obstacles);
  });

  it('mantém tudo dentro dos limites de jogo', () => {
    const w = makeTestWorld(); generateArena(w);
    for (const o of [...w.obstacles, ...w.traps]) {
      expect(o.x).toBeGreaterThan(w.play.left);
      expect(o.x).toBeLessThan(w.play.right);
      expect(o.y).toBeGreaterThan(w.play.top);
      expect(o.y).toBeLessThan(w.play.bottom);
    }
  });

  it('deixa o centro do mundo livre para o spawn', () => {
    const w = makeTestWorld(); generateArena(w);
    const cx = WORLD.w / 2, cy = WORLD.h / 2;
    for (const o of w.obstacles) expect(Math.hypot(o.x - cx, o.y - cy)).toBeGreaterThanOrEqual(150);
    for (const t of w.traps)     expect(Math.hypot(t.x - cx, t.y - cy)).toBeGreaterThanOrEqual(140);
  });

  it('escala a quantidade com a área do mundo', () => {
    const w = makeTestWorld(); generateArena(w);
    expect(w.obstacles.length).toBeGreaterThanOrEqual(16);
    expect(w.traps.length).toBeGreaterThanOrEqual(8);
  });

  it('sobrevive a um round-trip JSON (colunas sem Infinity)', () => {
    const w = makeTestWorld();
    generateArena(w);
    expect(w.obstacles.some(o => o.kind === 'column')).toBe(true);
    for (const o of w.obstacles) expect(Number.isFinite(o.hp)).toBe(true);
    const back = JSON.parse(JSON.stringify(w.obstacles)) as typeof w.obstacles;
    expect(back).toEqual(w.obstacles);
  });

  it('regenerar zera o que havia antes', () => {
    const w = makeTestWorld();
    generateArena(w);
    const n = w.obstacles.length;
    generateArena(w);
    expect(w.obstacles.length).toBeLessThanOrEqual(n * 1.5);
  });
});

describe('resolveObstacles', () => {
  it('empurra a entidade para fora de um obstáculo sólido', () => {
    const w = makeTestWorld();
    w.obstacles = [{ kind: 'column', x: 100, y: 100, r: 16, hp: INDESTRUCTIBLE_HP, dead: false }];
    const ent = { x: 105, y: 100 };
    resolveObstacles(ent, 10, w);
    expect(Math.hypot(ent.x - 100, ent.y - 100)).toBeCloseTo(26, 5);
  });

  it('ignora obstáculos destruídos', () => {
    const w = makeTestWorld();
    w.obstacles = [{ kind: 'crate', x: 100, y: 100, r: 14, hp: 0, dead: true }];
    const ent = { x: 101, y: 100 };
    resolveObstacles(ent, 10, w);
    expect(ent).toEqual({ x: 101, y: 100 });
  });

  it('não mexe em quem já está fora', () => {
    const w = makeTestWorld();
    w.obstacles = [{ kind: 'column', x: 100, y: 100, r: 16, hp: INDESTRUCTIBLE_HP, dead: false }];
    const ent = { x: 200, y: 200 };
    resolveObstacles(ent, 10, w);
    expect(ent).toEqual({ x: 200, y: 200 });
  });
});

describe('armadilhas', () => {
  it('o ciclo de espinhos vem do tick, não do relógio', () => {
    const w = makeTestWorld();
    const trap = { x: 0, y: 0, offset: 0 };
    w.tick = 0;
    expect(trapFrameAt(w, trap)).toBe(0);
    expect(trapDangerous(w, trap)).toBe(false);
    w.tick = 27 * 2; // two 450ms steps in
    expect(trapFrameAt(w, trap)).toBe(2);
    expect(trapDangerous(w, trap)).toBe(true);
  });
});

describe('damageCrate', () => {
  it('quebra a caixa e derruba 1 ou 2 moedas', () => {
    const w = makeTestWorld();
    const crate = { kind: 'crate' as const, x: 50, y: 50, r: 14, hp: 40, dead: false };
    w.obstacles = [crate];
    damageCrate(w, crate, 100);
    expect(crate.dead).toBe(true);
    expect(w.coins.length).toBeGreaterThanOrEqual(1);
    expect(w.coins.length).toBeLessThanOrEqual(2);
    expect(w.events.some(e => e.t === 'sfx' && e.name === 'chest')).toBe(true);
  });

  it('uma coluna continua indestrutível mesmo depois de um round-trip JSON', () => {
    const w = makeTestWorld();
    const col = { kind: 'column' as const, x: 50, y: 50, r: 16, hp: INDESTRUCTIBLE_HP, dead: false };
    const back = JSON.parse(JSON.stringify(col)) as typeof col;
    w.obstacles = [back];
    damageCrate(w, back, 99999);
    expect(back.dead).toBe(false);
    expect(Number.isFinite(back.hp)).toBe(true);
    expect(back.hp).toBeGreaterThan(0);
  });

  it('dano insuficiente não quebra', () => {
    const w = makeTestWorld();
    const crate = { kind: 'crate' as const, x: 50, y: 50, r: 14, hp: 40, dead: false };
    damageCrate(w, crate, 10);
    expect(crate.dead).toBe(false);
    expect(crate.hp).toBe(30);
  });
});

describe('rectCircle', () => {
  it('trata (rx, ry) como o centro do retângulo', () => {
    // every caller in the original passes an enemy's centre (e.x, e.y)
    expect(rectCircle(0, 0, 10, 10, 5, 5, 2)).toBe(true);    // circle sitting on the corner
    expect(rectCircle(0, 0, 10, 10, 50, 50, 2)).toBe(false); // far outside
    expect(rectCircle(0, 0, 10, 10, 7, 0, 3)).toBe(true);    // 2px past the right edge, r=3
    expect(rectCircle(0, 0, 10, 10, 9, 0, 3)).toBe(false);   // 4px past the right edge, r=3
  });
});
