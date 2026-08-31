import { describe, it, expect } from 'vitest';
import { makeTestWorld } from './helpers';
import {
  createPlayer, applyPoison, attack, dealDamage, fireProjectile, meleeAttack,
  updateBullets, makeEnemy,
} from '@dg2/sim';
import type { Enemy, Player, World } from '@dg2/sim';

function setup(cls: Player['cls'] = 'mage'): { w: World; p: Player } {
  const w = makeTestWorld();
  const p = createPlayer(w, 'p1', cls, 'T');
  return { w, p };
}

function enemyAt(w: World, x: number, y: number): Enemy {
  const e = makeEnemy(w, 'skeleton', x, y);
  w.enemies.push(e);
  return e;
}

describe('attack', () => {
  it('respeita o cooldown da arma', () => {
    const { w, p } = setup();
    attack(w, p);
    expect(w.bullets).toHaveLength(1);
    attack(w, p);
    expect(w.bullets).toHaveLength(1); // still cooling down
    p.attackTimer = 0;
    attack(w, p);
    expect(w.bullets).toHaveLength(2);
  });

  it('atkSpeedPct encurta o cooldown', () => {
    const { w, p } = setup();
    attack(w, p);
    const slow = p.attackTimer;
    p.attackTimer = 0;
    p.stats.atkSpeedPct = 100;
    attack(w, p);
    expect(p.attackTimer).toBeCloseTo(slow / 2, 5);
  });

  it('armas com count > 1 abrem um leque', () => {
    const w = makeTestWorld();
    const p = createPlayer(w, 'p1', 'archer', 'T');
    p.weapon = { ...p.weapon, count: 3 };
    attack(w, p);
    expect(w.bullets).toHaveLength(3);
    const angles = w.bullets.map(b => b.angle);
    expect(new Set(angles).size).toBe(3);
  });

  it('arma melee não cria projétil', () => {
    const w = makeTestWorld();
    const p = createPlayer(w, 'p1', 'warrior', 'T');
    attack(w, p);
    expect(w.bullets).toHaveLength(0);
    expect(w.events.some(e => e.t === 'swing')).toBe(true);
  });
});

describe('fireProjectile', () => {
  it('marca o dono e herda o alcance da arma mais a stat range', () => {
    const { w, p } = setup();
    p.stats.range = 50;
    fireProjectile(w, p, 0, 'bolt', p.weapon);
    expect(w.bullets[0].owner).toBe('p1');
    expect(w.bullets[0].range).toBe(p.weapon.range + 50);
  });
});

describe('meleeAttack', () => {
  it('acerta quem está dentro do arco e do alcance', () => {
    const w = makeTestWorld();
    const p = createPlayer(w, 'p1', 'warrior', 'T');
    const e = enemyAt(w, p.x + 30, p.y);
    const hp0 = e.hp;
    meleeAttack(w, p, 0, p.weapon);
    expect(e.hp).toBeLessThan(hp0);
  });

  it('não acerta quem está atrás', () => {
    const w = makeTestWorld();
    const p = createPlayer(w, 'p1', 'warrior', 'T');
    const e = enemyAt(w, p.x - 30, p.y);
    const hp0 = e.hp;
    meleeAttack(w, p, 0, p.weapon);
    expect(e.hp).toBe(hp0);
  });

  it('não acerta quem está fora do alcance', () => {
    const w = makeTestWorld();
    const p = createPlayer(w, 'p1', 'warrior', 'T');
    const e = enemyAt(w, p.x + 500, p.y);
    const hp0 = e.hp;
    meleeAttack(w, p, 0, p.weapon);
    expect(e.hp).toBe(hp0);
  });

  it('empurra o alvo para longe', () => {
    const w = makeTestWorld();
    const p = createPlayer(w, 'p1', 'warrior', 'T');
    const e = enemyAt(w, p.x + 30, p.y);
    meleeAttack(w, p, 0, p.weapon);
    expect(e.x).toBeGreaterThan(p.x + 30);
  });

  it('quebra caixas dentro do arco', () => {
    const w = makeTestWorld();
    const p = createPlayer(w, 'p1', 'warrior', 'T');
    const crate = { kind: 'crate' as const, x: p.x + 30, y: p.y, r: 14, hp: 40, dead: false };
    w.obstacles = [crate];
    meleeAttack(w, p, 0, p.weapon);
    expect(crate.hp).toBeLessThan(40);
  });
});

describe('dealDamage', () => {
  it('soma dano plano por tipo de arma e a % de dano', () => {
    const { w, p } = setup();
    p.stats.elementalDmg = 10;
    p.stats.dmgPct = 100;
    p.stats.crit = 0;
    const e = enemyAt(w, 100, 100);
    const hp0 = e.hp;
    dealDamage(w, p, e, [10, 10], 'bolt');
    // (10 + 10) * 2 = 40
    expect(hp0 - e.hp).toBe(40);
  });

  it('crítico a 100% dobra e anuncia', () => {
    const { w, p } = setup();
    p.stats.crit = 100;
    const e = enemyAt(w, 100, 100);
    const hp0 = e.hp;
    dealDamage(w, p, e, [10, 10], 'bolt');
    expect(hp0 - e.hp).toBe(20);
    expect(w.events.some(ev => ev.t === 'float' && ev.text.endsWith('!'))).toBe(true);
  });

  it('nunca causa menos de 1', () => {
    const { w, p } = setup();
    p.stats.dmgPct = -1000;
    p.stats.crit = 0;
    const e = enemyAt(w, 100, 100);
    const hp0 = e.hp;
    dealDamage(w, p, e, [1, 1], 'bolt');
    expect(hp0 - e.hp).toBe(1);
  });

  it('lifesteal a 100% cura 1 quando ferido', () => {
    const { w, p } = setup();
    p.stats.lifeSteal = 100;
    p.hp = p.maxHp - 5;
    const e = enemyAt(w, 100, 100);
    dealDamage(w, p, e, [1, 1], 'bolt');
    expect(p.hp).toBe(p.maxHp - 4);
  });

  it('burn e chill aplicam seus efeitos quando procam', () => {
    const { w, p } = setup();
    p.stats.burn = 100;
    p.stats.chill = 100;
    const e = enemyAt(w, 100, 100);
    dealDamage(w, p, e, [1, 1], 'bolt');
    expect(e.burnT).toBeGreaterThan(0);
    expect(e.slowT).toBe(1500);
  });

  it('é determinístico com a mesma seed', () => {
    const run = () => {
      const { w, p } = setup();
      p.stats.crit = 40;
      const e = enemyAt(w, 100, 100);
      for (let i = 0; i < 20; i++) dealDamage(w, p, e, [10, 30], 'bolt');
      return e.hp;
    };
    expect(run()).toBe(run());
  });
});

describe('updateBullets', () => {
  it('move o projétil e acumula distância', () => {
    const { w, p } = setup();
    fireProjectile(w, p, 0, 'bolt', p.weapon);
    const x0 = w.bullets[0].x;
    updateBullets(w);
    expect(w.bullets[0].x).toBeGreaterThan(x0);
    expect(w.bullets[0].dist).toBeGreaterThan(0);
  });

  it('some ao passar do alcance', () => {
    const { w, p } = setup();
    fireProjectile(w, p, 0, 'bolt', { ...p.weapon, range: 10 });
    for (let i = 0; i < 20; i++) updateBullets(w);
    expect(w.bullets).toHaveLength(0);
  });

  it('atinge um inimigo uma única vez com pierce 0', () => {
    const { w, p } = setup();
    const e = enemyAt(w, p.x + 20, p.y);
    fireProjectile(w, p, 0, 'bolt', { ...p.weapon, pierce: 0 });
    const hp0 = e.hp;
    for (let i = 0; i < 10; i++) updateBullets(w);
    expect(e.hp).toBeLessThan(hp0);
    expect(w.bullets).toHaveLength(0);
  });

  it('pierce atravessa e não rebate no mesmo alvo', () => {
    const { w, p } = setup();
    const a = enemyAt(w, p.x + 20, p.y);
    const b = enemyAt(w, p.x + 60, p.y);
    fireProjectile(w, p, 0, 'bolt', { ...p.weapon, pierce: 2, damage: [5, 5] as [number, number] });
    for (let i = 0; i < 20; i++) updateBullets(w);
    expect(a.hp).toBeLessThan(a.maxHp);
    expect(b.hp).toBeLessThan(b.maxHp);
  });

  it('some ao sair dos limites do mundo', () => {
    const { w, p } = setup();
    p.x = w.play.right - 5;
    fireProjectile(w, p, 0, 'bolt', p.weapon);
    for (let i = 0; i < 30; i++) updateBullets(w);
    expect(w.bullets).toHaveLength(0);
  });
});

// combat.ts:183 — `Math.max` nos dois campos: refresca para o mais forte /
// mais longo, nunca soma. Cada campo tira o seu próprio máximo, de forma
// independente.
describe('applyPoison', () => {
  it('refresca para o mais forte em vez de empilhar', () => {
    const { w } = setup();
    const e = enemyAt(w, 0, 0);
    applyPoison(e, 10, 1000);
    expect(e.poisonDps).toBe(10);
    expect(e.poisonT).toBe(1000);

    applyPoison(e, 4, 500); // mais fraco e mais curto: não mexe em nada
    expect(e.poisonDps).toBe(10);
    expect(e.poisonT).toBe(1000);

    applyPoison(e, 18, 4000); // mais forte e mais longo: sobe, não soma
    expect(e.poisonDps).toBe(18);
    expect(e.poisonT).toBe(4000);

    applyPoison(e, 25, 100); // dps sobe, duração fica na maior
    expect(e.poisonDps).toBe(25);
    expect(e.poisonT).toBe(4000);
  });
});

// Caller 1 de applyPoison: bullets.ts:86, o bolt da bruxa.
describe('poison via projétil (bullets.ts)', () => {
  it('o bolt da bruxa envenena o alvo que acerta', () => {
    const { w, p } = setup('witch');
    const po = p.weapon.poison;
    expect(po).toBeTruthy();
    const e = enemyAt(w, p.x + 20, p.y);
    expect(e.poisonT).toBe(0);
    fireProjectile(w, p, 0, 'bolt', p.weapon);
    for (let i = 0; i < 10; i++) updateBullets(w);
    expect(e.poisonDps).toBe(po?.dps);
    expect(e.poisonT).toBe(po?.dur);
  });

  it('uma arma sem poison não envenena', () => {
    const { w, p } = setup('mage');
    expect(p.weapon.poison ?? null).toBe(null);
    const e = enemyAt(w, p.x + 20, p.y);
    fireProjectile(w, p, 0, 'bolt', p.weapon);
    for (let i = 0; i < 10; i++) updateBullets(w);
    expect(e.hp).toBeLessThan(e.maxHp); // acertou...
    expect(e.poisonT).toBe(0);          // ...mas sem veneno
  });
});
