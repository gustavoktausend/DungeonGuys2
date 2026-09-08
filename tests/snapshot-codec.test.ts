// snapshot-codec.test.ts — SYNC-04: the World a room has to send fits in the
// messages a DataChannel will carry, and nothing is lost on the way.
//
// Every assertion here uses Object.is, and never the tolerance-based float
// matcher. That is not style: this codec quantises, and quantisation is exactly
// where -0 is born — `Math.round(-0.04 * 8)` is -0, and an approximate
// comparison reports -0 and +0 as equal. A tolerance-based comparison in a
// codec test would therefore pass on a codec that had already lost the one bit
// this file exists to protect. The banned matcher is named by description
// rather than spelled out because the acceptance check for this file is a grep
// for its name — the same conflict tests/input-codec.test.ts hit, resolved the
// same way.
//
// The hash is banned for the same reason and it is worth saying out loud, since
// hashWorld is right there and comparing two hashes is one line: hashWorld
// travels through JSON, JSON already collapses -0 to 0, so a round trip
// "verified by hash" passes on data that is already corrupt. The header of
// packages/sim/src/serialize.ts wrote that trap down before this codec existed.
// Field by field, with Object.is, is the only comparison that sees it.
import { describe, expect, it } from 'vitest';
import { Rng } from '@dg2/sim';
import {
  ATTACK_KIND,
  CHEST_STATE,
  CLASS_KEY,
  ELITE_TYPE,
  ENEMY_TYPE,
  MSG_KIND,
  MUTATOR_KEY,
  PHASE,
  PLAYER_SLOT,
  SNAPSHOT_HEADER_BYTES,
  SNAPSHOT_MAX_BYTES,
  SNAPSHOT_PART,
  decodeSnapshot,
  decodeSnapshotPart,
  encodeSnapshot,
  extractSnapshot,
  quantizeAngle,
  quantizePos,
  type SnapshotRecord,
} from '@dg2/protocol';
import { wave16SwarmElite, wave40Endless, wave1FourPlayers } from './worlds';

/** The wire index of the `snapshot` message — 6, and asserted, not assumed. */
const SNAPSHOT_KIND = MSG_KIND.indexOf('snapshot');

/**
 * Field-by-field identity over a whole snapshot record.
 *
 * Written as a walk rather than as `toEqual` because `toEqual` compares 0 and
 * -0 as equal, which is the failure this file is built around. Every leaf goes
 * through Object.is, and the path is in the message so a failure says WHICH
 * field, not merely that two large objects differ.
 */
function expectDeepIs(got: unknown, want: unknown, path = 'record'): void {
  if (Array.isArray(want)) {
    expect(Array.isArray(got), `${path} deveria ser um array`).toBe(true);
    const gotArray = got as unknown[];
    expect(gotArray.length, `${path}.length`).toBe(want.length);
    for (let i = 0; i < want.length; i++) expectDeepIs(gotArray[i], want[i], `${path}[${i}]`);
    return;
  }
  if (want !== null && typeof want === 'object') {
    const wantObject = want as Record<string, unknown>;
    const gotObject = got as Record<string, unknown>;
    expect(Object.keys(gotObject).sort(), `${path} chaves`).toEqual(Object.keys(wantObject).sort());
    for (const key of Object.keys(wantObject)) {
      expectDeepIs(gotObject[key], wantObject[key], `${path}.${key}`);
    }
    return;
  }
  expect(Object.is(got, want), `${path}: ${String(got)} vs ${String(want)}`).toBe(true);
}

/** The same bytes, compared as bytes. */
function expectSameBytes(got: ArrayBuffer[], want: ArrayBuffer[]): void {
  expect(got.length).toBe(want.length);
  for (let i = 0; i < want.length; i++) {
    expect(Array.from(new Uint8Array(got[i])), `parte ${i}`)
      .toEqual(Array.from(new Uint8Array(want[i])));
  }
}

/** An empty, valid record — the base every crafted case starts from. */
function emptyRecord(tick = 0): SnapshotRecord {
  return {
    tick,
    baselineTick: 0,
    rng: 0,
    nextId: 1,
    phase: 0,
    wave: 0,
    waveFlags: 0,
    waveMutator: 0,
    score: 0,
    combo: 0,
    players: [],
    enemies: [],
    bullets: [],
    enemyBullets: [],
    coins: [],
    potions: [],
    chests: [],
  };
}

/** A player record with every field distinct, so a swapped pair shows up. */
function somePlayer(slot: number): SnapshotRecord['players'][number] {
  return {
    slot,
    cls: slot % CLASS_KEY.length,
    x: 1200.5 + slot,
    y: 800.25 - slot,
    facing: 1000 * (slot + 1),
    hp: 90 + slot,
    maxHp: 120 + slot,
    stamina: 4200 + slot,
    level: 7 + slot,
    gold: 12345 + slot,
    xp: 67890 + slot,
    flags: slot & 0b111,
  };
}

/** An enemy record with every field distinct, for the same reason. */
function someEnemy(id: number): SnapshotRecord['enemies'][number] {
  return {
    id,
    x: (id * 7) % 60000,
    y: (id * 13) % 60000,
    hp: (id * 3) % 65535,
    maxHp: (id * 5) % 65535,
    type: id % ENEMY_TYPE.length,
    elite: id % ELITE_TYPE.length,
    bossState: id % BOSS_STATE_LENGTH,
    flags: id % 256,
  };
}

/** `BOSS_STATE.length`, read once so someEnemy stays a one-liner. */
const BOSS_STATE_LENGTH = 4;

/**
 * Builds the header of a part by hand, so a refusal can be tested without
 * materialising the payload the refusal exists to avoid allocating.
 *
 * Layout under test: u8 kind, u8 part, u32 LE tick, u32 LE baselineTick.
 */
function craftHeader(
  kind: number,
  part: number,
  tick: number,
  baselineTick: number,
  extra: number[] = [],
): ArrayBuffer {
  const bytes = new Uint8Array(SNAPSHOT_HEADER_BYTES + extra.length);
  const view = new DataView(bytes.buffer);
  view.setUint8(0, kind);
  view.setUint8(1, part);
  view.setUint32(2, tick, true);
  view.setUint32(6, baselineTick, true);
  bytes.set(extra, SNAPSHOT_HEADER_BYTES);
  return bytes.buffer;
}

describe('quantização do snapshot (D3-18)', () => {
  it('quantizar duas vezes é igual a quantizar uma vez', () => {
    // 200.000 amostras de um Rng semeado: idempotência é a propriedade que
    // separa uma GRAVAÇÃO de um resumo com perda. Se recodificar o que foi
    // decodificado mudasse um bit, o snapshot da fase 4 derivaria a cada salto.
    const rng = new Rng(20260902);
    let divergences = 0;
    for (let i = 0; i < 100_000; i++) {
      const pos = rng.range(-100, 8300);
      const once = quantizePos(pos);
      if (!Object.is(quantizePos(once / 8), once)) divergences++;

      const angle = rng.range(-Math.PI * 3, Math.PI * 3);
      const spun = quantizeAngle(angle);
      if (!Object.is(quantizeAngle(((spun << 16) >> 16) * ((Math.PI * 2) / 65536)), spun)) {
        divergences++;
      }
    }
    expect(`${divergences} divergências em 200.000 amostras`)
      .toBe('0 divergências em 200.000 amostras');
  });

  it('uma posição levemente negativa quantiza para +0, nunca para -0', () => {
    const q = quantizePos(-0.04);
    // Math.round(-0.04 * 8) é -0, e -0 sobrevive a um Uint16 como 0 — mas
    // sobrevive a uma comparação `===` como se fosse +0, que é o que faria um
    // teste frouxo passar sobre um codec quebrado.
    expect(Object.is(q, 0)).toBe(true);
    expect(Object.is(q, -0)).toBe(false);
    expect(Object.is(quantizePos(-0), 0)).toBe(true);
    expect(Object.is(quantizeAngle(-0), 0)).toBe(true);
  });

  it('a posição satura na faixa do uint16 em vez de dar a volta', () => {
    expect(quantizePos(-500)).toBe(0);
    expect(quantizePos(1e9)).toBe(0xffff);
  });
});

describe('round-trip do snapshot (D3-18)', () => {
  it('decodificar o que foi codificado devolve o mesmo registro, campo a campo', () => {
    const record = extractSnapshot(wave16SwarmElite());
    expectDeepIs(decodeSnapshot(encodeSnapshot(record)), record);
  });

  it('codificar o que foi decodificado devolve os mesmos bytes', () => {
    const parts = encodeSnapshot(extractSnapshot(wave16SwarmElite()));
    expectSameBytes(encodeSnapshot(decodeSnapshot(parts)), parts);
  });

  it('o round-trip duplo vale também para a wave 1 e para a wave 40', () => {
    for (const world of [wave1FourPlayers(), wave40Endless()]) {
      const record = extractSnapshot(world);
      const parts = encodeSnapshot(record);
      expectDeepIs(decodeSnapshot(parts), record);
      expectSameBytes(encodeSnapshot(decodeSnapshot(parts)), parts);
    }
  });

  it('extrair é idempotente sobre um registro já quantizado', () => {
    // extract(decode(encode(extract(w)))) === extract(w): sem isso o formato é
    // um resumo, não uma gravação, e um replay de um replay derivaria.
    const record = extractSnapshot(wave16SwarmElite());
    expectDeepIs(decodeSnapshot(encodeSnapshot(decodeSnapshot(encodeSnapshot(record)))), record);
  });
});

describe('o que o snapshot NÃO carrega (D3-17)', () => {
  it('o registro extraído não tem campo algum de obstacles, traps, play ou config', () => {
    const record = extractSnapshot(wave16SwarmElite());
    expect(Object.keys(record).sort()).toEqual([
      'baselineTick', 'bullets', 'chests', 'coins', 'combo', 'enemies', 'enemyBullets',
      'nextId', 'phase', 'players', 'potions', 'rng', 'score', 'tick', 'wave',
      'waveFlags', 'waveMutator',
    ]);
    // A camada estática (3,3 KiB constantes) é derivada da seed em cada
    // cliente, pelo mesmo caminho do replay. Não existe no fio.
    const text = JSON.stringify(record);
    for (const forbidden of ['obstacle', 'trap', 'play', 'config', 'seed', 'name']) {
      expect(`${forbidden}: ${text.includes(`"${forbidden}`)}`).toBe(`${forbidden}: false`);
    }
  });
});

describe('as três partes (D3-19)', () => {
  it('encodeSnapshot devolve sempre três partes, uma por entrada de SNAPSHOT_PART', () => {
    const parts = encodeSnapshot(extractSnapshot(wave16SwarmElite()));
    expect(parts.length).toBe(SNAPSHOT_PART.length);
    expect(parts.length).toBe(3);
    parts.forEach((part, index) => {
      const view = new DataView(part);
      expect(view.getUint8(0), `kind da parte ${index}`).toBe(SNAPSHOT_KIND);
      expect(view.getUint8(1), `índice da parte ${index}`).toBe(index);
    });
  });

  it('cada parte carrega o mesmo tick e o seu próprio índice', () => {
    const record = extractSnapshot(wave16SwarmElite());
    for (const part of encodeSnapshot(record)) {
      const decoded = decodeSnapshotPart(part);
      expect(decoded.tick).toBe(record.tick);
      expect(decoded.baselineTick).toBe(0);
    }
  });

  it('cada parte decodifica sozinha — perder a parte 0 não invalida as outras', () => {
    const record = extractSnapshot(wave16SwarmElite());
    const parts = encodeSnapshot(record);

    // Descartar a parte 0 e decodificar SÓ as partes 1 e 2. Esta é a
    // propriedade "sem remontagem" de D3-19: o canal é unreliable, uma parte
    // vai se perder, e o que chegou tem de continuar significando algo.
    const projectiles = decodeSnapshotPart(parts[1]);
    const pickups = decodeSnapshotPart(parts[2]);
    if (projectiles.part !== 1 || pickups.part !== 2) throw new Error('parte inesperada');
    expectDeepIs(projectiles.bullets, record.bullets, 'bullets');
    expectDeepIs(projectiles.enemyBullets, record.enemyBullets, 'enemyBullets');
    expectDeepIs(pickups.coins, record.coins, 'coins');
    expectDeepIs(pickups.potions, record.potions, 'potions');
    expectDeepIs(pickups.chests, record.chests, 'chests');
  });

  it('a partição forçada: a parte 0 cruza o teto perto de 1014 inimigos', () => {
    // O bench nunca exercita este caminho — pela fórmula do sim, 1014 inimigos
    // é a wave ~210. Este teste é o que impede alguém de olhar para o código de
    // partição, concluir que é código morto e apagá-lo.
    let crossing = -1;
    for (let n = 900; n <= 1100; n++) {
      const record = emptyRecord(4242);
      record.players = [0, 1, 2, 3].map(somePlayer);
      for (let i = 0; i < n; i++) record.enemies.push(someEnemy(i + 1));
      if (encodeSnapshot(record)[0].byteLength > SNAPSHOT_MAX_BYTES) { crossing = n; break; }
    }
    // A faixa tem folga porque o ponto exato depende do número de jogadores:
    // cada jogador a menos são 29 bytes, quase dois inimegos de margem.
    expect(`${crossing >= 900 && crossing <= 1100} (${crossing})`).toBe(`true (${crossing})`);
  });

  it('a partição forçada mantém as três partes decodificáveis isoladamente', () => {
    const record = emptyRecord(99);
    record.players = [0, 1].map(somePlayer);
    for (let i = 0; i < 300; i++) record.enemies.push(someEnemy(i + 1));
    record.bullets = [{ x: 10, y: 20, angle: 30, type: 1, ownerSlot: 1 }];
    record.enemyBullets = [{ x: 40, y: 50, vx: -3, vy: 4 }];
    record.coins = [{ x: 60, y: 70 }];
    record.potions = [{ x: 80, y: 90 }];
    record.chests = [{ x: 100, y: 110, state: 2 }];

    const parts = encodeSnapshot(record);
    for (let i = 0; i < parts.length; i++) {
      expect(decodeSnapshotPart(parts[i]).part).toBe(i);
      expect(decodeSnapshotPart(parts[i]).tick).toBe(99);
    }
    expectDeepIs(decodeSnapshot(parts), record);
  });
});

describe('o teto de 16 KiB por mensagem (SYNC-04)', () => {
  it('na wave 16 com quatro jogadores, cada parte fica abaixo de 16384 bytes', () => {
    const parts = encodeSnapshot(extractSnapshot(wave16SwarmElite()));
    const sizes = parts.map(p => p.byteLength);
    expect(`${sizes.every(s => s < SNAPSHOT_MAX_BYTES)} (${sizes.join(', ')})`)
      .toBe(`true (${sizes.join(', ')})`);
  });

  it('na wave 40 endless, cada parte fica abaixo de 16384 bytes', () => {
    const parts = encodeSnapshot(extractSnapshot(wave40Endless()));
    const sizes = parts.map(p => p.byteLength);
    expect(`${sizes.every(s => s < SNAPSHOT_MAX_BYTES)} (${sizes.join(', ')})`)
      .toBe(`true (${sizes.join(', ')})`);
  });

  it('o mundo de 82 KiB em JSON cabe em poucos KiB somados', () => {
    const parts = encodeSnapshot(extractSnapshot(wave16SwarmElite()));
    const total = parts.reduce((sum, p) => sum + p.byteLength, 0);
    expect(`${total < 8 * 1024} (${total} bytes)`).toBe(`true (${total} bytes)`);
  });
});

describe('o decodificador recusa antes de alocar (T-3-08)', () => {
  it('recusa bytes menores que o cabeçalho', () => {
    expect(() => decodeSnapshotPart(new Uint8Array(4).buffer)).toThrow(/cabeçalho/);
  });

  it('recusa um kind que não é o de snapshot', () => {
    expect(() => decodeSnapshotPart(craftHeader(0, 0, 1, 0))).toThrow(/kind/);
  });

  it('recusa um índice de parte fora de SNAPSHOT_PART', () => {
    expect(() => decodeSnapshotPart(craftHeader(SNAPSHOT_KIND, 9, 1, 0))).toThrow(/parte/);
  });

  it('recusa um baselineTick diferente de 0, citando D3-18', () => {
    expect(() => decodeSnapshotPart(craftHeader(SNAPSHOT_KIND, 0, 1, 7)))
      .toThrow(/baselineTick/);
    expect(() => decodeSnapshotPart(craftHeader(SNAPSHOT_KIND, 0, 1, 7)))
      .toThrow(/D3-18/);
  });

  it('recusa uma contagem de inimigos maior que os bytes recebidos', () => {
    // 19 bytes de escalares, 0 jogadores, e então uma contagem de 60000
    // inimigos sobre zero bytes de payload. Sem a checagem de `room` isso
    // alocaria 60000 registros a partir de dez bytes de cabeçalho.
    const scalars = new Array<number>(19).fill(0);
    const bytes = [...scalars, 0 /* playerCount */, 0x60, 0xea /* enemyCount = 60000 LE */];
    expect(() => decodeSnapshotPart(craftHeader(SNAPSHOT_KIND, 0, 1, 0, bytes)))
      .toThrow(/contagem|inimigos/);
  });

  it('recusa uma contagem de projéteis maior que os bytes recebidos', () => {
    const bytes = [0xff, 0xff]; // bulletCount = 65535, e nada depois
    expect(() => decodeSnapshotPart(craftHeader(SNAPSHOT_KIND, 1, 1, 0, bytes)))
      .toThrow(/contagem|projéteis|bullets/);
  });

  it('recusa uma contagem de moedas maior que os bytes recebidos', () => {
    const bytes = [0xff, 0xff]; // coinCount = 65535, e nada depois
    expect(() => decodeSnapshotPart(craftHeader(SNAPSHOT_KIND, 2, 1, 0, bytes)))
      .toThrow(/contagem|moedas|coins/);
  });

  it('recusa um índice de enum fora da tabela congelada (T-3-13)', () => {
    const record = emptyRecord(1);
    record.players = [somePlayer(0)];
    const parts = encodeSnapshot(record);
    // phase é o byte 18 da parte 0: 10 de cabeçalho + 4 (rng) + 4 (nextId).
    const broken = new Uint8Array(parts[0].slice(0));
    broken[18] = PHASE.length + 5;
    expect(() => decodeSnapshotPart(broken.buffer)).toThrow(/phase|fase/);
  });

  it('decodeSnapshot exige as três partes e o mesmo tick', () => {
    const parts = encodeSnapshot(extractSnapshot(wave1FourPlayers()));
    expect(() => decodeSnapshot([parts[0], parts[1]])).toThrow(/três|partes/);
    const otherTick = encodeSnapshot(extractSnapshot(wave16SwarmElite()));
    expect(() => decodeSnapshot([parts[0], parts[1], otherTick[2]])).toThrow(/tick/);
  });
});

describe('as tabelas congeladas viajam por índice, nunca por nome (FORM-11)', () => {
  it('todo índice do registro extraído está dentro da sua tabela', () => {
    const record = extractSnapshot(wave16SwarmElite());
    expect(record.phase).toBeLessThan(PHASE.length);
    expect(record.waveMutator).toBeLessThan(MUTATOR_KEY.length);
    for (const p of record.players) {
      expect(p.slot).toBeLessThan(PLAYER_SLOT.length);
      expect(p.cls).toBeLessThan(CLASS_KEY.length);
    }
    for (const e of record.enemies) {
      expect(e.type).toBeLessThan(ENEMY_TYPE.length);
      expect(e.elite).toBeLessThan(ELITE_TYPE.length);
    }
    for (const b of record.bullets) {
      expect(b.type).toBeLessThan(ATTACK_KIND.length);
      expect(b.ownerSlot).toBeLessThan(PLAYER_SLOT.length);
    }
    for (const c of record.chests) expect(c.state).toBeLessThan(CHEST_STATE.length);
  });

  it('o mutador swarm chega como índice, e é o índice certo', () => {
    const record = extractSnapshot(wave16SwarmElite());
    expect(record.waveMutator).toBe(MUTATOR_KEY.indexOf('swarm'));
    // waveActive é o bit 0 e waveHasBoss o bit 1 — a wave 16 tem chefe.
    expect(record.waveFlags & 1).toBe(1);
    expect(record.waveFlags & 2).toBe(2);
  });

  it('um mutador nulo vira o índice de none, não uma ausência', () => {
    const record = extractSnapshot(wave1FourPlayers());
    expect(record.waveMutator).toBe(MUTATOR_KEY.indexOf('none'));
    expect(record.waveFlags & 2).toBe(0);
  });
});
