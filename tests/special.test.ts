import { describe, it, expect } from 'vitest';
import { makeTestWorld } from './helpers';
import { createPlayer, castSpecial, makeEnemy, updateEnemies, DT_MS, CLASS_DEFS } from '@dg2/sim';
import type { ClassKey } from '@dg2/sim';

const ALL: ClassKey[] = ['mage', 'archer', 'warrior', 'ninja', 'priestess', 'witch', 'coprobo'];

describe('castSpecial', () => {
  it('põe o especial em cooldown pelo valor da classe', () => {
    const w = makeTestWorld();
    const p = createPlayer(w, 'p1', 'mage', 'T');
    castSpecial(w, p);
    expect(p.specialTimer).toBe(CLASS_DEFS.mage.specialCd);
  });

  it('não dispara enquanto está em cooldown', () => {
    const w = makeTestWorld();
    const p = createPlayer(w, 'p1', 'mage', 'T');
    castSpecial(w, p);
    const bullets = w.bullets.length;
    castSpecial(w, p);
    expect(w.bullets).toHaveLength(bullets);
  });

  it('as 7 classes lançam sem erro e todas gastam o cooldown', () => {
    for (const cls of ALL) {
      const w = makeTestWorld();
      const p = createPlayer(w, 'p1', cls, 'T');
      w.enemies.push(makeEnemy(w, 'skeleton', p.x + 40, p.y));
      expect(() => castSpecial(w, p)).not.toThrow();
      expect(p.specialTimer, cls).toBe(CLASS_DEFS[cls].specialCd);
      expect(w.events.some(e => e.t === 'sfx' && e.name === 'special'), cls).toBe(true);
    }
  });

  it('fireball do mago cria um projétil com área', () => {
    const w = makeTestWorld();
    const p = createPlayer(w, 'p1', 'mage', 'T');
    castSpecial(w, p);
    expect(w.bullets).toHaveLength(1);
    expect(w.bullets[0].aoe).toBeGreaterThan(0);
    expect(w.bullets[0].type).toBe('fireball');
  });

  it('volley do arqueiro cria vários projéteis', () => {
    const w = makeTestWorld();
    const p = createPlayer(w, 'p1', 'archer', 'T');
    castSpecial(w, p);
    expect(w.bullets.length).toBeGreaterThan(1);
  });

  it('whirlwind do guerreiro fere quem está em volta', () => {
    const w = makeTestWorld();
    const p = createPlayer(w, 'p1', 'warrior', 'T');
    const e = makeEnemy(w, 'skeleton', p.x + 30, p.y);
    w.enemies.push(e);
    const hp0 = e.hp;
    castSpecial(w, p);
    expect(e.hp).toBeLessThan(hp0);
  });

  it('dash do ninja move o jogador', () => {
    const w = makeTestWorld();
    const p = createPlayer(w, 'p1', 'ninja', 'T');
    p.facing = 0;
    const x0 = p.x;
    castSpecial(w, p);
    expect(p.x).toBeGreaterThan(x0);
  });

  it('é determinístico', () => {
    const run = () => {
      const w = makeTestWorld();
      const p = createPlayer(w, 'p1', 'archer', 'T');
      castSpecial(w, p);
      return w.bullets.map(b => Math.round(b.angle * 1e6));
    };
    expect(run()).toEqual(run());
  });
});

// Caller 2 de applyPoison: special.ts:131. O hex atinge TODO inimigo vivo —
// uma superfície maior do que a que docs/PARIDADE.md descrevia.
describe('hex da bruxa (special.ts)', () => {
  it('envenena e lentifica todo inimigo vivo, e o dano corre no updateEnemies', () => {
    const w = makeTestWorld();
    const p = createPlayer(w, 'p1', 'witch', 'T');
    const alive = makeEnemy(w, 'skeleton', 5000, 5000);
    const corpse = makeEnemy(w, 'skeleton', 5100, 5100);
    corpse.dead = true;
    w.enemies.push(alive, corpse);

    castSpecial(w, p);
    expect(alive.poisonDps).toBe(15);
    expect(alive.poisonT).toBe(4000);
    expect(alive.slowT).toBe(4000);
    expect(corpse.poisonT).toBe(0); // mortos são ignorados

    const hp0 = alive.hp;
    for (let i = 0; i < 6; i++) updateEnemies(w);
    expect(hp0 - alive.hp).toBeCloseTo(15 * 6 * DT_MS / 1000, 6);
    expect(alive.poisonT).toBeCloseTo(4000 - 6 * DT_MS, 6);
  });
});
