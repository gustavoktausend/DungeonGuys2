import { describe, it, expect } from 'vitest';
import { makeTestWorld } from './helpers';
import { createPlayer } from '../src/sim/player';
import {
  makeEnemy, makeElite, spawnEnemy, updateEnemies, updateEnemyBullets, killEnemy, nearestPlayer,
} from '../src/sim/enemies';
import { spawnBoss } from '../src/sim/boss';
import { DT_MS } from '../src/sim/constants';

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

  // Antes chamava-se "burn e poison drenam hp e expiram" mas só escrevia e
  // assertava `burnT`/`burnDps` — o nome prometia uma cobertura de poison que
  // não existia, e foi por isso que ninguém notou a lacuna. O poison tem
  // agora o seu próprio teste, logo abaixo.
  it('burn drena hp e expira', () => {
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

  // enemies.ts:245-249 — `e.poisonT -= dt; e.hp -= e.poisonDps * dt / 1000`.
  // 200ms a DT_MS (1000/60) = exatamente 12 ticks de dano => 100 dps * 0.2s.
  it('poison drena hp por segundo e expira', () => {
    const w = makeTestWorld();
    createPlayer(w, 'p1', 'mage', 'T');
    const e = makeEnemy(w, 'skeleton', 5000, 5000);
    e.poisonT = 200; e.poisonDps = 100;
    w.enemies.push(e);
    const hp0 = e.hp;
    for (let i = 0; i < 6; i++) updateEnemies(w);
    expect(hp0 - e.hp).toBeCloseTo(100 * 6 * DT_MS / 1000, 6); // meio caminho
    expect(e.poisonT).toBeCloseTo(200 - 6 * DT_MS, 6);
    for (let i = 0; i < 54; i++) updateEnemies(w);
    expect(e.poisonT).toBeLessThanOrEqual(0);
    // A guarda é `if (e.poisonT > 0)` ANTES do decremento, então o último
    // tick parcial ainda aplica um dt inteiro: o total fica entre a dose
    // nominal (100 dps * 0.2 s = 20) e ela mais um tick.
    const nominal = 100 * 200 / 1000;
    const drained = hp0 - e.hp;
    expect(drained).toBeGreaterThanOrEqual(nominal);
    expect(drained).toBeLessThanOrEqual(nominal + 100 * DT_MS / 1000);
    // e depois de expirar não drena mais nada
    for (let i = 0; i < 30; i++) updateEnemies(w);
    expect(hp0 - e.hp).toBe(drained);
  });

  it('poison mata e credita o kill quando o hp chega a zero', () => {
    const w = makeTestWorld();
    createPlayer(w, 'p1', 'mage', 'T');
    const e = makeEnemy(w, 'skeleton', 5000, 5000);
    e.poisonT = 5000; e.poisonDps = 400;
    w.enemies.push(e);
    for (let i = 0; i < 60; i++) updateEnemies(w);
    expect(e.dead).toBe(true);
    expect(w.runKills).toBe(1);
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
  it('marca morto, dá score, ouro e xp e conta o kill', () => {
    const w = makeTestWorld();
    const p = createPlayer(w, 'p1', 'mage', 'T');
    const e = makeEnemy(w, 'skeleton', 100, 100);
    w.enemies.push(e);
    killEnemy(w, e, p);
    expect(e.dead).toBe(true);
    expect(w.score).toBeGreaterThan(0);
    expect(w.runKills).toBe(1);
    expect(w.coins.length).toBeGreaterThan(0);
    expect(p.xp).toBeGreaterThan(0);
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

  it('emite bossKill ao matar um chefe, e só um chefe', () => {
    const w = makeTestWorld();
    const p = createPlayer(w, 'p1', 'mage', 'T');
    spawnBoss(w, 'zombie_king', 0, 1);
    const boss = w.enemies[0];
    killEnemy(w, boss, p);
    expect(w.events.filter(e => e.t === 'bossKill')).toHaveLength(1);
  });

  it('não emite bossKill ao matar um inimigo comum', () => {
    const w = makeTestWorld();
    const p = createPlayer(w, 'p1', 'mage', 'T');
    const e = makeEnemy(w, 'skeleton', 100, 100);
    w.enemies.push(e);
    killEnemy(w, e, p);
    expect(w.events.some(ev => ev.t === 'bossKill')).toBe(false);
  });
});

describe('updateEnemyBullets', () => {
  it('expira depois de percorrer mais de 600px', () => {
    const w = makeTestWorld();
    const cx = (w.play.left + w.play.right) / 2;
    const cy = (w.play.top + w.play.bottom) / 2;
    const b = { x: cx, y: cy, vx: 5, vy: 0, dmg: 10, dist: 0, dead: false };
    w.enemyBullets.push(b);
    for (let i = 0; i < 130; i++) updateEnemyBullets(w);
    expect(b.dist).toBeGreaterThan(600);
    expect(b.dead).toBe(true);
    expect(w.enemyBullets).not.toContain(b);
  });

  it('atinge o jogador vivo mais próximo, causa dano e morre', () => {
    const w = makeTestWorld();
    const p = createPlayer(w, 'p1', 'mage', 'T');
    const b = { x: p.x, y: p.y, vx: 0, vy: 0, dmg: 15, dist: 0, dead: false };
    w.enemyBullets.push(b);
    const hp0 = p.hp;
    updateEnemyBullets(w);
    expect(p.hp).toBeLessThan(hp0);
    expect(b.dead).toBe(true);
  });

  it('morre ao sair de world.play', () => {
    const w = makeTestWorld();
    const b = { x: w.play.left + 2, y: (w.play.top + w.play.bottom) / 2, vx: -50, vy: 0, dmg: 5, dist: 0, dead: false };
    w.enemyBullets.push(b);
    updateEnemyBullets(w);
    expect(b.dead).toBe(true);
  });

  it('morre ao tocar um obstáculo vivo, mas não um obstáculo morto', () => {
    const w = makeTestWorld();
    w.obstacles.push(
      { kind: 'column', x: 500, y: 500, r: 16, hp: Infinity, dead: false },
      { kind: 'column', x: 700, y: 500, r: 16, hp: Infinity, dead: true },
    );
    const hit = { x: 500, y: 500, vx: 0, vy: 0, dmg: 5, dist: 0, dead: false };
    const pass = { x: 700, y: 500, vx: 0, vy: 0, dmg: 5, dist: 0, dead: false };
    w.enemyBullets.push(hit, pass);
    updateEnemyBullets(w);
    expect(hit.dead).toBe(true);
    expect(pass.dead).toBe(false);
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
