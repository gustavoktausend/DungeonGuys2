import { describe, it, expect } from 'vitest';
import { makeTestWorld } from './helpers';
import { createPlayer } from '../src/sim/player';
import { updateCoins, updatePotions, updateChests, lootChest } from '../src/sim/loot';
import { COIN_MAGNET } from '../src/sim/constants';

describe('moedas', () => {
  it('são atraídas quando entram no raio do ímã', () => {
    const w = makeTestWorld();
    const p = createPlayer(w, 'p1', 'mage', 'T');
    const coin = { x: p.x + COIN_MAGNET - 10, y: p.y, vx: 0, vy: 0, bob: 0, dead: false };
    w.coins.push(coin);
    const d0 = Math.hypot(coin.x - p.x, coin.y - p.y);
    updateCoins(w);
    expect(Math.hypot(coin.x - p.x, coin.y - p.y)).toBeLessThan(d0);
  });

  it('coletar dá ouro e conta no total da run', () => {
    const w = makeTestWorld();
    const p = createPlayer(w, 'p1', 'mage', 'T');
    w.coins.push({ x: p.x, y: p.y, vx: 0, vy: 0, bob: 0, dead: false });
    const gold0 = p.gold;
    updateCoins(w);
    expect(p.gold).toBeGreaterThan(gold0);
    expect(w.runGoldEarned).toBeGreaterThan(0);
    expect(w.coins).toHaveLength(0);
  });

  it('moedas longe ficam paradas', () => {
    const w = makeTestWorld();
    const p = createPlayer(w, 'p1', 'mage', 'T');
    const coin = { x: p.x + 800, y: p.y, vx: 0, vy: 0, bob: 0, dead: false };
    w.coins.push(coin);
    const x0 = coin.x;
    updateCoins(w);
    expect(Math.abs(coin.x - x0)).toBeLessThan(1);
  });
});

describe('poções', () => {
  it('curam ao encostar e não passam do máximo', () => {
    const w = makeTestWorld();
    const p = createPlayer(w, 'p1', 'mage', 'T');
    p.hp = 10;
    w.potions.push({ x: p.x, y: p.y, bob: 0, dead: false });
    updatePotions(w);
    expect(p.hp).toBeGreaterThan(10);
    expect(p.hp).toBeLessThanOrEqual(p.maxHp);
    expect(w.potions).toHaveLength(0);
  });

  it('não são consumidas com hp cheio', () => {
    const w = makeTestWorld();
    const p = createPlayer(w, 'p1', 'mage', 'T');
    w.potions.push({ x: p.x, y: p.y, bob: 0, dead: false });
    updatePotions(w);
    expect(w.potions).toHaveLength(1);
  });
});

describe('baús', () => {
  it('abrem ao encostar e saem do estado fechado', () => {
    const w = makeTestWorld();
    const p = createPlayer(w, 'p1', 'mage', 'T');
    w.chests.push({ x: p.x, y: p.y, state: 'closed', timer: 0, fade: 0 });
    // 30 ticks is well past the ~22 needed to open (26px) then loot (350ms),
    // but comfortably short of the ~112 needed to fully fade out (1500ms) --
    // see task-16-report.md's Ruling B accounting.
    for (let i = 0; i < 30; i++) updateChests(w);
    expect(w.chests[0].state).not.toBe('closed');
  });

  it('some do chao depois de saqueado e de desbotar (Ruling B)', () => {
    const w = makeTestWorld();
    const p = createPlayer(w, 'p1', 'mage', 'T');
    w.chests.push({ x: p.x, y: p.y, state: 'closed', timer: 0, fade: 0 });
    // opens ~tick 22, loots, then fades over 1500ms (~90 more ticks) -- gone
    // by tick ~112, well inside 120.
    for (let i = 0; i < 120; i++) updateChests(w);
    expect(w.chests).toHaveLength(0);
  });

  it('lootChest entrega recompensa e é determinístico', () => {
    const run = () => {
      const w = makeTestWorld();
      const p = createPlayer(w, 'p1', 'mage', 'T');
      const chest = { x: p.x, y: p.y, state: 'opening' as const, timer: 0, fade: 0 };
      lootChest(w, p, chest);
      return { coins: w.coins.length, potions: w.potions.length, enemies: w.enemies.length, gold: p.gold };
    };
    expect(run()).toEqual(run());
  });

  it('a sorte do jogador influencia o loot', () => {
    const withLuck = (luck: number) => {
      let total = 0;
      for (let seed = 0; seed < 40; seed++) {
        const w = makeTestWorld({ seed });
        const p = createPlayer(w, 'p1', 'mage', 'T');
        p.stats.luck = luck;
        lootChest(w, p, { x: p.x, y: p.y, state: 'opening', timer: 0, fade: 0 });
        total += w.coins.length + w.potions.length;
      }
      return total;
    };
    expect(withLuck(200)).toBeGreaterThanOrEqual(withLuck(0));
  });
});
