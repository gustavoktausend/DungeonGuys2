// worlds.test.ts — the three synthetic worlds are what they claim to be.
//
// A fixture nobody checks is a fixture that quietly stops describing the game:
// the enemy formula moves in `startNextWave`, the world here keeps its old
// count, and the codec gate goes on passing against a world that no longer
// exists. Every assertion below is therefore a claim tests/worlds.ts makes in
// prose, turned into something that can go red.
//
// The JSON baseline is the reason this file matters most. § Measured Baseline
// of 03-RESEARCH.md measured 82,0 KiB on wave 16, and that measurement is the
// entire argument for writing a binary codec at all. Until now it lived in a
// document; here it is an assertion of the repository.
import { describe, expect, it } from 'vitest';
import { hashWorld, saveWorld } from '@dg2/sim';
import { expectedEnemies, wave1FourPlayers, wave16SwarmElite, wave40Endless } from './worlds';
import type { World } from '@dg2/sim';

/**
 * The measured size of a world in JSON.
 *
 * `saveWorld` returns the JSON-SAFE DATA, not text — the round trip through a
 * string happens inside it and the result is an object. Measuring "the JSON" is
 * therefore one `JSON.stringify` away, and doing it here rather than trusting
 * `.length` on the record is the difference between counting characters and
 * counting the object's keys (which is `undefined`, and would make every range
 * below pass by vacuity).
 */
function jsonSize(world: World): number {
  return JSON.stringify(saveWorld(world)).length;
}

describe('mundos sintéticos de pior caso (D3-20)', () => {
  it('a wave 1 tem os 7 inimigos da fórmula, sem mutador e sem chefe', () => {
    const world = wave1FourPlayers();
    expect(world.wave).toBe(1);
    expect(world.waveMutator).toBe(null);
    expect(world.waveHasBoss).toBe(false);
    expect(world.enemies.length).toBe(7);
    expect(world.enemies.length).toBe(expectedEnemies(1, null));
  });

  it('a wave 16 tem os 83 inimigos de swarm mais o chefe do ato', () => {
    const world = wave16SwarmElite();
    expect(world.wave).toBe(16);
    expect(world.waveMutator).toBe('swarm');
    expect(world.waveHasBoss).toBe(true);
    // round((4 + 16*3) * 1.6) = 83, e BOSS_WAVES[16] acrescenta o ogre_warlord.
    expect(world.enemies.length).toBe(84);
    expect(world.enemies.length).toBe(expectedEnemies(16, 'swarm'));
    expect(world.enemies.some(e => e.type === 'ogre_warlord')).toBe(true);
  });

  it('a wave 40 endless tem os 198 inimigos de swarm e nenhum chefe', () => {
    const world = wave40Endless();
    expect(world.wave).toBe(40);
    expect(world.config.mode).toBe('endless');
    expect(world.waveMutator).toBe('swarm');
    expect(world.waveHasBoss).toBe(false);
    // round((4 + 40*3) * 1.6) = 198.
    expect(world.enemies.length).toBe(198);
    expect(world.enemies.length).toBe(expectedEnemies(40, 'swarm'));
  });

  it('todo inimigo é elite nos três mundos — o pior caso do mutador elite', () => {
    for (const world of [wave1FourPlayers(), wave16SwarmElite(), wave40Endless()]) {
      const plain = world.enemies.filter(e => e.elite === null);
      expect(`${plain.length} inimigos sem elite`).toBe('0 inimigos sem elite');
    }
  });

  it('os quatro jogadores estão em p0..p3, com quatro classes diferentes', () => {
    for (const world of [wave1FourPlayers(), wave16SwarmElite(), wave40Endless()]) {
      expect(Object.keys(world.players).sort()).toEqual(['p0', 'p1', 'p2', 'p3']);
      const classes = world.config.players.map(p => p.cls);
      expect(new Set(classes).size).toBe(4);
      // Equipped, not naked: a player with an empty weapon slot is a smaller
      // record than the 1338 B the baseline measured.
      for (const id of Object.keys(world.players)) {
        expect(world.players[id].equipment.weapon).not.toBe(null);
      }
    }
  });

  it('projéteis e loot ficam nos tetos declarados na wave 16', () => {
    const world = wave16SwarmElite();
    expect(world.bullets.length).toBe(80);
    expect(world.enemyBullets.length).toBe(24);
    expect(world.coins.length).toBe(140);
    expect(world.potions.length).toBe(12);
    expect(world.chests.length).toBe(4);
  });

  it('os tetos escalam com a raiz do número de inimigos nas outras waves', () => {
    const one = wave1FourPlayers();
    const forty = wave40Endless();
    // sqrt(7/83) ≈ 0,290 e sqrt(198/83) ≈ 1,544 — os fatores que reproduzem a
    // tabela medida. Os números estão escritos aqui, e não derivados de novo,
    // para que mudar a regra em worlds.ts exija mudar este teste.
    expect(one.bullets.length).toBe(23);
    expect(one.coins.length).toBe(41);
    expect(forty.bullets.length).toBe(124);
    expect(forty.coins.length).toBe(216);
  });

  // A faixa é LARGA de propósito. O que este teste protege é a ordem de
  // grandeza que justifica o codec — dezenas de KiB contra 16 KiB de limite de
  // mensagem —, não um número exato. Um número exato quebraria em todo commit
  // que acrescentasse um campo a `Enemy`, e a quebra não diria nada: o que
  // importa é que o JSON continua vários múltiplos acima do teto do transporte.
  //
  // CADA FAIXA CONTÉM DOIS NÚMEROS, e é por isso que ela é assimétrica. O
  // primeiro é a medição de § Measured Baseline (21,0 / 82,0 / 158,0 KiB, ou
  // 21.504 / 83.968 / 161.792 caracteres); o segundo é o que ESTE fixture mede
  // (24.047 / 99.069 / 188.407). A diferença de ~18% é real e está explicada no
  // cabeçalho de worlds.ts: os projéteis e o loot sintéticos carregam
  // coordenadas de precisão cheia no teto declarado, e um registro assim é o
  // mais caro que o formato JSON pode produzir. Errar para cima é o lado certo
  // num pior caso — e manter os dois números dentro da faixa é o que impede
  // este teste de ficar vermelho no dia em que alguém reaproximar o fixture da
  // medição original.
  it.each([
    ['wave 1', wave1FourPlayers, 15_000, 35_000],
    ['wave 16', wave16SwarmElite, 70_000, 115_000],
    ['wave 40', wave40Endless, 130_000, 225_000],
  ])('a linha de base de JSON da %s fica na faixa medida', (_nome, make, min, max) => {
    const size = jsonSize(make());
    expect(`${size >= min && size <= max} (${size})`).toBe(`true (${size})`);
  });

  it('a wave 1 com quatro jogadores JÁ passa dos 16 KiB de uma mensagem', () => {
    // O número que transforma o codec de otimização em requisito: nem a wave
    // mais barata de uma sala de quatro cabe numa mensagem de DataChannel.
    expect(jsonSize(wave1FourPlayers())).toBeGreaterThan(16 * 1024);
  });

  it('os construtores são determinísticos — dois mundos iguais têm o mesmo hashWorld', () => {
    // Sem esta propriedade o bench mede um mundo diferente a cada execução, e
    // uma regressão de tamanho fica indistinguível de ruído do próprio fixture.
    expect(hashWorld(wave16SwarmElite())).toBe(hashWorld(wave16SwarmElite()));
    expect(hashWorld(wave1FourPlayers())).toBe(hashWorld(wave1FourPlayers()));
    expect(hashWorld(wave40Endless())).toBe(hashWorld(wave40Endless()));
    // E os três são mundos DIFERENTES, para que o hash acima não passe por
    // acaso sobre três objetos idênticos.
    const hashes = new Set([
      hashWorld(wave1FourPlayers()),
      hashWorld(wave16SwarmElite()),
      hashWorld(wave40Endless()),
    ]);
    expect(hashes.size).toBe(3);
  });
});
