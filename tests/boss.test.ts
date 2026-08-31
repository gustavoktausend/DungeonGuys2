import { describe, it, expect } from 'vitest';
import { makeTestWorld } from './helpers';
import {
  createPlayer, spawnBoss, bossPlanForWave, updateEnemies, WAVES_TOTAL,
  makeEnemy, updateBossPattern, TICK_FACTOR,
} from '@dg2/sim';
import type { Enemy, World } from '@dg2/sim';

describe('bossPlanForWave', () => {
  it('waves comuns não têm chefe', () => {
    const w = makeTestWorld();
    expect(bossPlanForWave(w, 1)).toEqual([]);
    expect(bossPlanForWave(w, 3)).toEqual([]);
  });

  it('as waves de mini-boss trazem o mini-boss certo', () => {
    const w = makeTestWorld();
    expect(bossPlanForWave(w, 4)).toEqual(['goblin_chief']);
    expect(bossPlanForWave(w, 12)).toEqual(['necro_lord']);
  });

  it('a wave final da campanha traz o chefe final', () => {
    const w = makeTestWorld();
    expect(bossPlanForWave(w, WAVES_TOTAL)).toContain('ogre_warlord');
  });
});

describe('spawnBoss', () => {
  it('cria um inimigo marcado como chefe, dentro dos limites', () => {
    const w = makeTestWorld();
    createPlayer(w, 'p1', 'mage', 'T');
    spawnBoss(w, 'zombie_king', 0, 1);
    expect(w.enemies).toHaveLength(1);
    const b = w.enemies[0];
    expect(b.boss).toBe('ZOMBIE KING');
    expect(b.x).toBeGreaterThanOrEqual(w.play.left);
    expect(b.x).toBeLessThanOrEqual(w.play.right);
  });

  it('vários chefes nascem em posições diferentes', () => {
    const w = makeTestWorld();
    createPlayer(w, 'p1', 'mage', 'T');
    spawnBoss(w, 'zombie_king', 0, 2);
    spawnBoss(w, 'ogre_warlord', 1, 2);
    expect(w.enemies[0].x).not.toBe(w.enemies[1].x);
  });
});

describe('padrão de chefe', () => {
  it('o chefe invoca lacaios ao longo do tempo', () => {
    const w = makeTestWorld();
    createPlayer(w, 'p1', 'mage', 'T');
    spawnBoss(w, 'zombie_king', 0, 1);
    for (let i = 0; i < 600; i++) updateEnemies(w);
    expect(w.enemies.length).toBeGreaterThan(1);
  });

  it('é determinístico', () => {
    const run = () => {
      const w = makeTestWorld();
      createPlayer(w, 'p1', 'mage', 'T');
      spawnBoss(w, 'zombie_king', 0, 1);
      for (let i = 0; i < 300; i++) updateEnemies(w);
      return w.enemies.length;
    };
    expect(run()).toBe(run());
  });
});

// ─── updateBossPattern, chamado direto ────────────────────────────────────────
// Os dois testes acima exercitam a função por dentro de `updateEnemies` e asseram
// só `enemies.length`, o que prova que o chefe invoca lacaios e nada sobre a
// máquina de estados. Até este bloco existir, `updateBossPattern` nunca era
// chamado diretamente por teste nenhum, e o ramo `ring` — 15 linhas que empurram
// 12 ou 16 projéteis com trigonometria — não executava em teste algum.
//
// Isso importa agora porque `ring` é uma das superfícies que a troca de
// `Math.sin`/`Math.cos` vai perturbar. Sem esta cobertura, uma mudança no
// hash-ouro seria indistinguível entre "a trigonometria mudou, como esperado" e
// "houve uma regressão". Por isso as asserções de `ring` são sobre a CONTAGEM de
// projéteis (12 e 16), que não muda quando a trigonometria mudar, e nunca sobre
// `vx`/`vy`, que mudam de propósito.
//
// Nenhuma asserção aproximada aqui, por regra da fase: um epsilon esconde
// exatamente a divergência de 1 ULP que esta fase existe para enxergar. Onde há
// aritmética, o valor esperado é montado com a mesma expressão do código e
// comparado com `toBe`.

/** Monta o chefe à mão e o coloca no mundo, sem rodar wave nenhuma. */
function bossAt(w: World, type: string, x: number, y: number): Enemy {
  const e = makeEnemy(w, type, x, y);
  w.enemies.push(e);
  return e;
}

/** Centro da arena — longe de qualquer parede, para o clamp não interferir. */
function center(w: World): { x: number; y: number } {
  return { x: (w.play.left + w.play.right) / 2, y: (w.play.top + w.play.bottom) / 2 };
}

describe('updateBossPattern', () => {
  it('sem abilities devolve false e não toca no mundo', () => {
    const w = makeTestWorld();
    const c = center(w);
    const e = bossAt(w, 'skeleton', c.x, c.y);
    expect(e.abilities).toBe(null);

    expect(updateBossPattern(w, e, 100, 0, 100)).toBe(false);

    expect(w.enemyBullets).toHaveLength(0);
    expect(w.events).toHaveLength(0);
    expect(e.bossState).toBe('chase');
    expect(e.enraged).toBe(false);
    expect(e.cd).toEqual({}); // nem os cooldowns chegaram a correr
  });

  it('abaixo de 30% de HP o chefe enraivece, e só uma vez', () => {
    const w = makeTestWorld();
    const c = center(w);
    const e = bossAt(w, 'zombie_king', c.x, c.y);
    e.hp = e.maxHp * 0.29;
    const speed0 = e.speed;

    updateBossPattern(w, e, 300, 0, 300);

    expect(e.enraged).toBe(true);
    expect(e.speed).toBe(speed0 * 1.35);
    const enraged = w.events.filter(ev => ev.t === 'float' && ev.text === 'ENRAGED!');
    expect(enraged).toHaveLength(1);

    // segunda passagem: continua enraged, sem multiplicar a velocidade de novo
    const speed1 = e.speed;
    updateBossPattern(w, e, 300, 0, 300);
    expect(e.speed).toBe(speed1);
    expect(w.events.filter(ev => ev.t === 'float' && ev.text === 'ENRAGED!')).toHaveLength(1);
  });

  it('enraged encurta o cooldown efetivo para 0,6x', () => {
    // O mesmo cooldown acumulado (4200 ms = 7000 x 0,6) dispara o `ring` do
    // chefe enraivecido e não dispara o do inteiro. É o cdMult, isolado.
    const ready = 7000 * 0.6;

    const wEnraged = makeTestWorld();
    const cE = center(wEnraged);
    const enraged = bossAt(wEnraged, 'ogre_warlord', cE.x, cE.y);
    enraged.enraged = true;
    enraged.cd.ring = ready;

    const wCalm = makeTestWorld();
    const cC = center(wCalm);
    const calm = bossAt(wCalm, 'ogre_warlord', cC.x, cC.y);
    calm.cd.ring = ready;

    updateBossPattern(wEnraged, enraged, 300, 0, 300);
    updateBossPattern(wCalm, calm, 300, 0, 300);

    expect(wEnraged.enemyBullets.length).toBeGreaterThan(0);
    expect(wCalm.enemyBullets).toHaveLength(0);
  });

  it('telegraph vencido vira charging com stateT em 520', () => {
    const w = makeTestWorld();
    const c = center(w);
    const e = bossAt(w, 'zombie_king', c.x, c.y);
    e.bossState = 'telegraph';
    e.stateT = 1;

    expect(updateBossPattern(w, e, 300, 0, 300)).toBe(true);

    expect(e.bossState).toBe('charging');
    expect(e.stateT).toBe(520);
    expect(w.events.some(ev => ev.t === 'sfx' && ev.name === 'special')).toBe(true);
  });

  it('charging avança a posição em speed * 7 * TICK_FACTOR', () => {
    const w = makeTestWorld();
    const c = center(w);
    const e = bossAt(w, 'zombie_king', c.x, c.y);
    e.bossState = 'charging';
    e.stateT = 520;
    e.chargeDir = { x: 1, y: 0 };
    const x0 = e.x, y0 = e.y;
    const sp = e.speed * 7;

    expect(updateBossPattern(w, e, 300, 0, 300)).toBe(true);

    expect(e.x).toBe(x0 + 1 * sp * TICK_FACTOR);
    expect(e.y).toBe(y0);
    expect(e.bossState).toBe('charging'); // ainda dentro dos 520 ms
  });

  it('charging contra a parede aplica o clamp e encerra a investida', () => {
    const w = makeTestWorld();
    const c = center(w);
    // speed fixado à mão para o deslocamento (7 * TICK_FACTOR) ser previsível:
    // 3px antes do limite do clamp, logo esta investida bate.
    const e = bossAt(w, 'zombie_king', w.play.right - 24 - 3, c.y);
    e.speed = 1;
    e.bossState = 'charging';
    e.stateT = 520;
    e.chargeDir = { x: 1, y: 0 };

    expect(updateBossPattern(w, e, 300, 0, 300)).toBe(true);

    expect(e.x).toBe(w.play.right - 24); // clamp aplicado
    expect(w.events.some(ev => ev.t === 'shake')).toBe(true);
    expect(w.events.some(ev => ev.t === 'sfx' && ev.name === 'explosion')).toBe(true);
    // a batida zera stateT, e o mesmo tick já converte isso em `recover`:
    // stateT volta de 0 para 450 antes de a função retornar.
    expect(e.bossState).toBe('recover');
    expect(e.stateT).toBe(450);
  });

  it('recover vencido devolve o chefe para chase', () => {
    const w = makeTestWorld();
    const c = center(w);
    const e = bossAt(w, 'zombie_king', c.x, c.y);
    e.bossState = 'recover';
    e.stateT = 1;

    expect(updateBossPattern(w, e, 300, 0, 300)).toBe(true);

    expect(e.bossState).toBe('chase');
  });

  it('ring solta 12 projéteis e devolve false', () => {
    const w = makeTestWorld();
    const c = center(w);
    const e = bossAt(w, 'ogre_warlord', c.x, c.y);
    e.cd.ring = 7000; // maduro assim que a função somar o tick

    expect(updateBossPattern(w, e, 300, 0, 300)).toBe(false);

    expect(w.enemyBullets).toHaveLength(12);
    expect(e.cd.ring).toBe(0);
    expect(w.events.some(ev => ev.t === 'sfx' && ev.name === 'eshoot')).toBe(true);
  });

  it('ring enraivecido solta 16 projéteis', () => {
    const w = makeTestWorld();
    const c = center(w);
    const e = bossAt(w, 'ogre_warlord', c.x, c.y);
    e.enraged = true;
    e.cd.ring = 7000 * 0.6;

    expect(updateBossPattern(w, e, 300, 0, 300)).toBe(false);

    expect(w.enemyBullets).toHaveLength(16);
    expect(e.cd.ring).toBe(0);
  });

  it('charge trava a direção no momento do telegraph', () => {
    const w = makeTestWorld();
    const c = center(w);
    const e = bossAt(w, 'zombie_king', c.x, c.y);
    e.cd.charge = 6500;
    const dx = 180, dy = 240, dist = 300; // 180-240-300: dist exata, sem raiz

    expect(updateBossPattern(w, e, dx, dy, dist)).toBe(true);

    expect(e.bossState).toBe('telegraph');
    expect(e.stateT).toBe(650);
    expect(e.chargeDir).toEqual({ x: dx / dist, y: dy / dist });
    expect(e.cd.charge).toBe(0);
  });

  it('fora de alcance nenhuma habilidade dispara', () => {
    const w = makeTestWorld();
    const c = center(w);
    const e = bossAt(w, 'ogre_warlord', c.x, c.y);
    // os dois cooldowns maduros: só a distância impede o disparo
    e.cd.ring = 7000;
    e.cd.charge = 8000;

    expect(updateBossPattern(w, e, 600, 0, 600)).toBe(false);

    expect(w.enemyBullets).toHaveLength(0);
    expect(e.bossState).toBe('chase');
    expect(e.stateT).toBe(0);
  });
});
