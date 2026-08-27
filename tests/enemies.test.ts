import { describe, it, expect } from 'vitest';
import { makeTestWorld } from './helpers';
import { createPlayer } from '../src/sim/player';
import { makeEnemy, makeElite, spawnEnemy, updateEnemies, killEnemy, nearestPlayer } from '../src/sim/enemies';

describe('makeEnemy', () => {
  it('escala hp e velocidade com a wave', () => {
    const w = makeTestWorld();
    w.wave = 1;
    const early = makeEnemy(w, 'skeleton', 0, 0);
    w.wave = 10;
    const late = makeEnemy(w, 'skeleton', 0, 0);
    expect(late.hp).toBeGreaterThan(early.hp);
    expect(late.speed).toBeGreaterThan(early.speed);
  });

  it('a velocidade para de escalar na wave 30', () => {
    const w = makeTestWorld();
    w.wave = 30;
    const a = makeEnemy(w, 'skeleton', 0, 0);
    w.wave = 60;
    const b = makeEnemy(w, 'skeleton', 0, 0);
    expect(b.speed).toBe(a.speed);
  });

  it('recebe um id único', () => {
    const w = makeTestWorld();
    const a = makeEnemy(w, 'skeleton', 0, 0);
    const b = makeEnemy(w, 'skeleton', 0, 0);
    expect(b.id).not.toBe(a.id);
  });

  it('o mutador swarm enfraquece os comuns mas não os chefes', () => {
    const w = makeTestWorld();
    w.wave = 5;
    const normal = makeEnemy(w, 'skeleton', 0, 0);
    const boss = makeEnemy(w, 'zombie_king', 0, 0);
    w.waveMutator = 'swarm';
    expect(makeEnemy(w, 'skeleton', 0, 0).hp).toBeLessThan(normal.hp);
    expect(makeEnemy(w, 'zombie_king', 0, 0).hp).toBe(boss.hp);
  });

  it('frenzy acelera e bounty dobra o ouro', () => {
    const w = makeTestWorld();
    w.wave = 3;
    const base = makeEnemy(w, 'goblin', 0, 0);
    w.waveMutator = 'frenzy';
    expect(makeEnemy(w, 'goblin', 0, 0).speed).toBeCloseTo(base.speed * 1.35, 5);
    w.waveMutator = 'bounty';
    expect(makeEnemy(w, 'goblin', 0, 0).goldDrop).toBe(base.goldDrop * 2);
  });
});

describe('makeElite', () => {
  it('multiplica hp e marca o tipo', () => {
    const w = makeTestWorld();
    const e = makeEnemy(w, 'skeleton', 0, 0);
    const hp0 = e.hp;
    makeElite(w, e);
    expect(e.elite).toBeTruthy();
    expect(e.hp).toBeGreaterThan(hp0);
    expect(e.hp).toBe(e.maxHp);
    expect(e.eliteTint).toMatch(/^#/);
  });
});

describe('spawnEnemy', () => {
  it('nasce num anel ao redor do jogador, não em cima dele', () => {
    const w = makeTestWorld();
    const p = createPlayer(w, 'p1', 'mage', 'T');
    for (let i = 0; i < 50; i++) spawnEnemy(w, 'skeleton');
    for (const e of w.enemies) {
      const d = Math.hypot(e.x - p.x, e.y - p.y);
      expect(d).toBeGreaterThanOrEqual(300);
      expect(e.x).toBeGreaterThanOrEqual(w.play.left);
      expect(e.x).toBeLessThanOrEqual(w.play.right);
      expect(e.y).toBeGreaterThanOrEqual(w.play.top);
      expect(e.y).toBeLessThanOrEqual(w.play.bottom);
    }
  });

  it('é determinístico', () => {
    const run = () => {
      const w = makeTestWorld();
      createPlayer(w, 'p1', 'mage', 'T');
      for (let i = 0; i < 10; i++) spawnEnemy(w, 'goblin');
      return w.enemies.map(e => [Math.round(e.x), Math.round(e.y)]);
    };
    expect(run()).toEqual(run());
  });
});

describe('updateEnemies', () => {
  it('persegue o jogador', () => {
    const w = makeTestWorld();
    const p = createPlayer(w, 'p1', 'mage', 'T');
    const e = makeEnemy(w, 'skeleton', p.x + 400, p.y);
    w.enemies.push(e);
    const d0 = Math.hypot(e.x - p.x, e.y - p.y);
    for (let i = 0; i < 30; i++) updateEnemies(w);
    expect(Math.hypot(e.x - p.x, e.y - p.y)).toBeLessThan(d0);
  });

  it('chill reduz a velocidade enquanto dura', () => {
    const w = makeTestWorld();
    const p = createPlayer(w, 'p1', 'mage', 'T');
    const fast = makeEnemy(w, 'skeleton', p.x + 400, p.y);
    const slow = makeEnemy(w, 'skeleton', p.x + 400, p.y + 200);
    slow.slowT = 5000;
    w.enemies.push(fast, slow);
    const d0 = Math.hypot(slow.x - p.x, slow.y - p.y);
    const f0 = Math.hypot(fast.x - p.x, fast.y - p.y);
    for (let i = 0; i < 30; i++) updateEnemies(w);
    const df = f0 - Math.hypot(fast.x - p.x, fast.y - p.y);
    const ds = d0 - Math.hypot(slow.x - p.x, slow.y - p.y);
    expect(ds).toBeLessThan(df);
  });

  it('burn e poison drenam hp e expiram', () => {
    const w = makeTestWorld();
    createPlayer(w, 'p1', 'mage', 'T');
    const e = makeEnemy(w, 'skeleton', 5000, 5000);
    e.burnT = 200; e.burnDps = 100;
    w.enemies.push(e);
    const hp0 = e.hp;
    for (let i = 0; i < 60; i++) updateEnemies(w);
    expect(e.hp).toBeLessThan(hp0);
    expect(e.burnT).toBeLessThanOrEqual(0);
  });

  it('encosta no jogador e causa dano', () => {
    const w = makeTestWorld();
    const p = createPlayer(w, 'p1', 'mage', 'T');
    w.enemies.push(makeEnemy(w, 'skeleton', p.x + 5, p.y));
    updateEnemies(w);
    expect(p.hp).toBeLessThan(p.maxHp);
  });
});

describe('killEnemy', () => {
  it('marca morto, dá score e ouro e conta o kill', () => {
    const w = makeTestWorld();
    const p = createPlayer(w, 'p1', 'mage', 'T');
    const e = makeEnemy(w, 'skeleton', 100, 100);
    w.enemies.push(e);
    killEnemy(w, e, p);
    expect(e.dead).toBe(true);
    expect(w.score).toBeGreaterThan(0);
    expect(w.runKills).toBe(1);
    expect(w.coins.length).toBeGreaterThan(0);
  });

  it('não credita duas vezes', () => {
    const w = makeTestWorld();
    const p = createPlayer(w, 'p1', 'mage', 'T');
    const e = makeEnemy(w, 'skeleton', 100, 100);
    w.enemies.push(e);
    killEnemy(w, e, p);
    const score = w.score;
    killEnemy(w, e, p);
    expect(w.score).toBe(score);
  });
});

describe('nearestPlayer', () => {
  it('devolve o mais próximo e ignora os mortos', () => {
    const w = makeTestWorld();
    const a = createPlayer(w, 'a', 'mage', 'A');
    const b = createPlayer(w, 'b', 'mage', 'B');
    a.x = 0; a.y = 0;
    b.x = 1000; b.y = 0;
    expect(nearestPlayer(w, 100, 0)).toBe(a);
    a.hp = 0;
    expect(nearestPlayer(w, 100, 0)).toBe(b);
  });
});
