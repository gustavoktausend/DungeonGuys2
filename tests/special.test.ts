import { describe, it, expect } from 'vitest';
import { makeTestWorld } from './helpers';
import { createPlayer } from '../src/sim/player';
import { castSpecial } from '../src/sim/special';
import { makeEnemy } from '../src/sim/enemies';
import { CLASS_DEFS } from '../src/sim/defs/classes';
import type { ClassKey } from '../src/sim/types';

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
