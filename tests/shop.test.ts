import { describe, it, expect } from 'vitest';
import { makeTestWorld } from './helpers';
import { createPlayer } from '../src/sim/player';
import { startRun, checkWaveComplete } from '../src/sim/run';
import { maybeOpenLevelUp, pickBlessing } from '../src/sim/xp';
import {
  rollOffers, itemPrice, buyOffer, buyEquipOffer, shopHeal, shopReroll, equipItem, closeShop,
} from '../src/sim/shop';
import { EQUIPMENT } from '../src/sim/equipment-catalog';
import { HEAL_PRICE } from '../src/sim/defs/items';

describe('rollOffers', () => {
  it('oferece 4 consumíveis e 4 equipamentos', () => {
    const w = makeTestWorld();
    const p = createPlayer(w, 'p1', 'mage', 'T');
    rollOffers(w, p);
    expect(w.shopOffers).toHaveLength(4);
    expect(w.shopEquipOffers).toHaveLength(4);
  });

  it('só oferece equipamento elegível para a classe', () => {
    const w = makeTestWorld();
    const p = createPlayer(w, 'p1', 'mage', 'T');
    for (let i = 0; i < 40; i++) {
      rollOffers(w, p);
      for (const o of w.shopEquipOffers) {
        if (o.item.slot === 'weapon') expect(o.item.archetype).toBe('elemental');
        if (o.item.classReq) expect(o.item.classReq).toContain('mage');
      }
    }
  });

  it('é determinística', () => {
    const run = () => {
      const w = makeTestWorld();
      const p = createPlayer(w, 'p1', 'mage', 'T');
      rollOffers(w, p);
      return w.shopOffers.map(o => o.item.name);
    };
    expect(run()).toEqual(run());
  });
});

describe('itemPrice', () => {
  it('encarece conforme a wave', () => {
    const w = makeTestWorld();
    const p = createPlayer(w, 'p1', 'mage', 'T');
    const item = { name: 'X', icon: '', price: 100, mods: {} };
    w.wave = 1;
    const early = itemPrice(w, p, item);
    w.wave = 10;
    expect(itemPrice(w, p, item)).toBeGreaterThan(early);
  });

  it('o perk merchant desconta', () => {
    const w = makeTestWorld();
    const p = createPlayer(w, 'p1', 'mage', 'T');
    const item = { name: 'X', icon: '', price: 100, mods: {} };
    w.wave = 1;
    const full = itemPrice(w, p, item);
    w.config.forge.merchant = 5;
    expect(itemPrice(w, p, item)).toBeLessThan(full);
  });

  it('nunca custa menos de 1', () => {
    const w = makeTestWorld();
    const p = createPlayer(w, 'p1', 'mage', 'T');
    w.config.forge.merchant = 100;
    expect(itemPrice(w, p, { name: 'X', icon: '', price: 1, mods: {} })).toBeGreaterThanOrEqual(1);
  });
});

describe('compras', () => {
  it('sem ouro não compra', () => {
    const w = makeTestWorld();
    const p = createPlayer(w, 'p1', 'mage', 'T');
    rollOffers(w, p);
    p.gold = 0;
    buyOffer(w, p, 0);
    expect(w.shopOffers[0].sold).toBe(false);
  });

  it('comprar debita, marca vendido e aplica os mods', () => {
    const w = makeTestWorld();
    const p = createPlayer(w, 'p1', 'mage', 'T');
    rollOffers(w, p);
    p.gold = 9999;
    const before = { ...p.permStats };
    buyOffer(w, p, 0);
    expect(w.shopOffers[0].sold).toBe(true);
    expect(p.gold).toBeLessThan(9999);
    expect(p.permStats).not.toEqual(before);
  });

  it('não compra duas vezes a mesma oferta', () => {
    const w = makeTestWorld();
    const p = createPlayer(w, 'p1', 'mage', 'T');
    rollOffers(w, p);
    p.gold = 9999;
    buyOffer(w, p, 0);
    const gold = p.gold;
    buyOffer(w, p, 0);
    expect(p.gold).toBe(gold);
  });

  it('escudo não é comprável com arma de duas mãos', () => {
    const w = makeTestWorld();
    const p = createPlayer(w, 'p1', 'mage', 'T');
    p.gold = 9999;
    const twoH = EQUIPMENT.find(i => i.slot === 'weapon' && i.twoHanded)!;
    const shield = EQUIPMENT.find(i => i.slot === 'offhand')!;
    equipItem(w, p, twoH);
    w.shopEquipOffers = [{ item: shield, sold: false }];
    buyEquipOffer(w, p, 0);
    expect(w.shopEquipOffers[0].sold).toBe(false);
  });
});

describe('equipItem', () => {
  it('arma de catálogo vira player.weapon achatada, com o nome do item', () => {
    const w = makeTestWorld();
    const p = createPlayer(w, 'p1', 'mage', 'T');
    const staff = EQUIPMENT.find(i => i.id === 'w_runed')!;
    equipItem(w, p, staff);
    expect(p.weapon.name).toBe(staff.name);
    expect(p.weapon.attack).toBe('bolt');
    expect(p.weapon.fireRate).toBe(185);
  });

  it('arma de duas mãos limpa o offhand', () => {
    const w = makeTestWorld();
    const p = createPlayer(w, 'p1', 'mage', 'T');
    equipItem(w, p, EQUIPMENT.find(i => i.slot === 'offhand')!);
    expect(p.equipment.offhand).not.toBeNull();
    equipItem(w, p, EQUIPMENT.find(i => i.slot === 'weapon' && i.twoHanded)!);
    expect(p.equipment.offhand).toBeNull();
  });
});

describe('cura e reroll', () => {
  it('curar custa e cura 30, e não roda com hp cheio', () => {
    const w = makeTestWorld();
    const p = createPlayer(w, 'p1', 'mage', 'T');
    p.gold = 100; p.hp = 10;
    shopHeal(w, p);
    expect(p.hp).toBe(40);
    expect(p.gold).toBe(100 - HEAL_PRICE);
    p.hp = p.maxHp;
    const gold = p.gold;
    shopHeal(w, p);
    expect(p.gold).toBe(gold);
  });

  it('reroll troca as ofertas e fica mais caro a cada vez', () => {
    const w = makeTestWorld();
    const p = createPlayer(w, 'p1', 'mage', 'T');
    rollOffers(w, p);
    p.gold = 100;
    const first = w.rerollCost;
    shopReroll(w, p);
    expect(w.rerollCost).toBeGreaterThan(first);
  });
});

// Task 19's mandatory fix: the game used to stall forever after wave 1
// because checkWaveComplete had nowhere to go once a non-final wave
// cleared (openShop didn't exist yet). This proves the whole loop:
// wave clears -> shop opens with fresh offers -> leaving it starts the
// next wave.
describe('wave clear -> shop -> next wave (the stall fix)', () => {
  it('clearing a non-final wave opens the shop; closing it starts the next wave', () => {
    const w = makeTestWorld();
    createPlayer(w, 'p1', 'mage', 'T');
    startRun(w);
    expect(w.wave).toBe(1);
    expect(w.phase).toBe('playing');

    // simulate the wave being fully cleared
    w.spawnQueue = [];
    w.enemies = [];
    checkWaveComplete(w);

    expect(w.phase).toBe('shop');
    expect(w.waveActive).toBe(false);
    expect(w.shopOffers).toHaveLength(4);
    expect(w.shopEquipOffers).toHaveLength(4);

    closeShop(w);

    expect(w.phase).toBe('playing');
    expect(w.wave).toBe(2);
    expect(w.waveActive).toBe(true);
  });
});

// A level-up that resolves exactly when a wave clears used to leave the
// shop open with no offers rolled: closeLevelUp used to flip world.phase
// to 'shop' directly instead of calling openShop, so the deferred-open
// path (world.pendingAfterLevelUp) skipped rollOffers entirely. Fixed by
// routing both the wave-clear and post-levelup paths through the same
// openShop entry point (ORIG/entities.js:161-173).
describe('a level-up that races a wave clear still gets a rolled shop', () => {
  it('opens the shop with fresh offers once the pending blessing is picked', () => {
    const w = makeTestWorld();
    const p = createPlayer(w, 'p1', 'mage', 'T');
    startRun(w);

    // a level-up becomes pending mid-wave (as gainXp would leave it)
    p.pendingLevelUps = 1;
    maybeOpenLevelUp(w, p);
    expect(w.phase).toBe('levelup');

    // the wave clears while the level-up screen is still open
    w.spawnQueue = [];
    w.enemies = [];
    checkWaveComplete(w);

    // openShop saw phase !== 'playing' and only deferred — no offers yet
    expect(w.phase).toBe('levelup');
    expect(w.pendingAfterLevelUp).toBe('shop');
    expect(w.shopOffers).toHaveLength(0);
    expect(w.shopEquipOffers).toHaveLength(0);

    // resolving the blessing must now open the shop for real
    pickBlessing(w, p, 0);

    expect(w.phase).toBe('shop');
    expect(w.shopOffers).toHaveLength(4);
    expect(w.shopEquipOffers).toHaveLength(4);
  });
});
