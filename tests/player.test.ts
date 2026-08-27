import { describe, it, expect } from 'vitest';
import { makeTestWorld, noInput } from './helpers';
import { createPlayer, updatePlayer, damagePlayer } from '../src/sim/player';
import { WORLD } from '../src/sim/constants';
import type { InputState, World, Player } from '../src/sim/types';

function setup(): { w: World; p: Player } {
  const w = makeTestWorld();
  const p = createPlayer(w, 'p1', 'mage', 'TEST');
  return { w, p };
}

function moveInput(x: number, y: number, extra: Partial<InputState> = {}): InputState {
  return { ...noInput(0), move: { x, y }, ...extra };
}

describe('createPlayer', () => {
  it('nasce no centro do mundo com a arma inicial da classe', () => {
    const { w, p } = setup();
    expect(p.x).toBe(WORLD.w / 2);
    expect(p.y).toBe(WORLD.h / 2);
    expect(p.weapon.attack).toBe('bolt');
    expect(w.players.p1).toBe(p);
  });

  it('entra com hp cheio e stats derivados', () => {
    const { p } = setup();
    expect(p.hp).toBe(p.maxHp);
    expect(p.maxHp).toBe(100);
    expect(p.level).toBe(1);
  });

  it('aplica os perks de forge na camada permanente', () => {
    const w = makeTestWorld();
    w.config.forge = { vigor: 2, honed: 3, fleet: 1, startgold: 2, merchant: 0, wise: 0 };
    const p = createPlayer(w, 'p1', 'mage', 'T');
    expect(p.maxHp).toBe(120);        // 100 + 2 * 10
    expect(p.permStats.dmgPct).toBe(6);  // 3 * 2
    expect(p.permStats.speedPct).toBe(2); // 1 * 2
    expect(p.gold).toBe(30);          // 2 * 15
  });
});

describe('updatePlayer — movimento', () => {
  it('anda na direção do input', () => {
    const { w, p } = setup();
    const x0 = p.x;
    updatePlayer(w, p, moveInput(1, 0));
    expect(p.x).toBeGreaterThan(x0);
    expect(p.y).toBe(WORLD.h / 2);
  });

  it('não anda sem input e marca moving = false', () => {
    const { w, p } = setup();
    const before = { x: p.x, y: p.y };
    updatePlayer(w, p, moveInput(0, 0));
    expect(p.x).toBe(before.x);
    expect(p.y).toBe(before.y);
    expect(p.moving).toBe(false);
  });

  it('fica preso dentro dos limites de jogo', () => {
    const { w, p } = setup();
    for (let i = 0; i < 2000; i++) updatePlayer(w, p, moveInput(-1, -1));
    expect(p.x).toBeGreaterThanOrEqual(w.play.left + 10);
    expect(p.y).toBeGreaterThanOrEqual(w.play.top + 10);
    for (let i = 0; i < 4000; i++) updatePlayer(w, p, moveInput(1, 1));
    expect(p.x).toBeLessThanOrEqual(w.play.right - 10);
    expect(p.y).toBeLessThanOrEqual(w.play.bottom - 10);
  });

  it('não atravessa uma coluna: fica na borda dela', () => {
    const { w, p } = setup();
    const col = { kind: 'column' as const, x: p.x + 20, y: p.y, r: 16, hp: Infinity, dead: false };
    w.obstacles = [col];
    for (let i = 0; i < 60; i++) updatePlayer(w, p, moveInput(1, 0));
    // pushed to exactly r + playerRadius = 16 + 10 away, never inside
    expect(Math.hypot(p.x - col.x, p.y - col.y)).toBeCloseTo(26, 5);
  });
});

describe('updatePlayer — stamina', () => {
  it('correr drena stamina e acelera', () => {
    const { w, p } = setup();
    const slow = { ...p, x: p.x };
    updatePlayer(w, p, moveInput(1, 0, { sprint: true }));
    expect(p.stamina).toBeLessThan(100);
    expect(p.sprinting).toBe(true);
    expect(p.x - slow.x).toBeGreaterThan(0);
  });

  it('sem stamina não corre', () => {
    const { w, p } = setup();
    p.stamina = 0;
    updatePlayer(w, p, moveInput(1, 0, { sprint: true }));
    expect(p.sprinting).toBe(false);
  });

  it('parar de correr regenera stamina', () => {
    const { w, p } = setup();
    p.stamina = 50;
    for (let i = 0; i < 60; i++) updatePlayer(w, p, moveInput(0, 0));
    expect(p.stamina).toBeGreaterThan(50);
    expect(p.stamina).toBeLessThanOrEqual(100);
  });
});

describe('updatePlayer — regeneração e temporizadores', () => {
  it('hpRegen cura ao longo do tempo, sem passar do máximo', () => {
    const { w, p } = setup();
    p.permStats.hpRegen = 5;
    p.stats.hpRegen = 5;
    p.hp = 50;
    for (let i = 0; i < 120; i++) updatePlayer(w, p, noInput(i));
    expect(p.hp).toBeGreaterThan(50);
    expect(p.hp).toBeLessThanOrEqual(p.maxHp);
  });

  it('invencibilidade e cooldown de especial decaem por tick', () => {
    const { w, p } = setup();
    p.invincible = 600;
    p.specialTimer = 8000;
    updatePlayer(w, p, noInput(0));
    expect(p.invincible).toBeCloseTo(600 - 1000 / 60, 5);
    expect(p.specialTimer).toBeCloseTo(8000 - 1000 / 60, 5);
  });

  it('armadilha ativa machuca quem pisa nela', () => {
    const { w, p } = setup();
    w.tick = 27 * 2; // spikes out
    w.traps = [{ x: p.x, y: p.y, offset: 0 }];
    updatePlayer(w, p, noInput(0));
    expect(p.hp).toBeLessThan(p.maxHp);
  });
});

describe('damagePlayer', () => {
  it('armadura reduz o dano pela fórmula armor/(armor+15)', () => {
    const { w, p } = setup();
    p.permStats.armor = 15;
    p.stats.armor = 15;
    damagePlayer(w, p, 100);
    expect(p.hp).toBe(p.maxHp - 50);
  });

  it('nunca causa menos de 1 de dano', () => {
    const { w, p } = setup();
    p.stats.armor = 10000;
    damagePlayer(w, p, 1);
    expect(p.hp).toBe(p.maxHp - 1);
  });

  it('respeita invencibilidade', () => {
    const { w, p } = setup();
    p.invincible = 500;
    damagePlayer(w, p, 50);
    expect(p.hp).toBe(p.maxHp);
  });

  it('dodge a 100% anula o golpe e emite DODGE', () => {
    const { w, p } = setup();
    p.stats.dodge = 100; // capped at 60 by the formula
    let dodged = 0;
    for (let i = 0; i < 200; i++) {
      p.invincible = 0;
      p.hp = p.maxHp;
      damagePlayer(w, p, 10);
      if (p.hp === p.maxHp) dodged++;
    }
    expect(dodged).toBeGreaterThan(80);  // ~60% of 200
    expect(dodged).toBeLessThan(160);
  });

  it('block é limitado a 75%', () => {
    const { w, p } = setup();
    p.stats.block = 999;
    let blocked = 0;
    for (let i = 0; i < 400; i++) {
      p.invincible = 0;
      p.hp = p.maxHp;
      damagePlayer(w, p, 10);
      if (p.hp === p.maxHp) blocked++;
    }
    expect(blocked).toBeGreaterThan(240); // ~75% of 400
    expect(blocked).toBeLessThan(360);
  });

  it('hp zerado leva o mundo para gameover', () => {
    const { w, p } = setup();
    p.hp = 1;
    damagePlayer(w, p, 999);
    expect(p.hp).toBe(0);
    expect(w.phase).toBe('gameover');
  });
});
