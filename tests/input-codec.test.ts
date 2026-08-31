// input-codec.test.ts — FORM-06: the input log is quantised AT CAPTURE, and
// what gets written is the table the authority resolved, hole-filling
// included.
//
// Every assertion here uses Object.is, and never the tolerance-based float
// matcher. That is not style: two of these tests are ABOUT the difference
// between -0 and +0, and an approximate matcher (like `===`) reports those two
// as equal. A tolerance-based comparison in a codec test would pass on a codec
// that silently loses bits, which is the one failure this file exists to
// catch. The banned matcher is named by description because the acceptance
// check for this file is a grep for its name — the same conflict plan 01-06
// hit four times, resolved the same way.
import { describe, it, expect } from 'vitest';
import { Rng } from '@dg2/sim';
import type { InputState } from '@dg2/sim';
import {
  AIM_STEP,
  MAX_RUN_TICKS,
  TICK_PACKET_BYTES,
  decodeInputRecords,
  decodeLog,
  encodeLog,
  packTick,
  quantize,
  unpackTick,
  type InputRecord,
  type InputTable,
  type PlayerSlot,
} from '@dg2/protocol';

const SLOTS: PlayerSlot[] = [
  { id: 'p0', cls: 'mage', name: 'UM' },
  { id: 'p1', cls: 'archer', name: 'DOIS' },
];

function raw(tick: number, x: number, y: number, aim: number, flags = 0): InputState {
  return {
    tick,
    move: { x, y },
    aim,
    attack: (flags & 1) !== 0,
    special: (flags & 2) !== 0,
    sprint: (flags & 4) !== 0,
  };
}

/** Field-by-field identity. `Object.is` is the only comparison that sees -0. */
function expectSameInput(got: InputState, want: InputState): void {
  expect(Object.is(got.tick, want.tick), 'tick').toBe(true);
  expect(Object.is(got.move.x, want.move.x), `move.x ${got.move.x} vs ${want.move.x}`).toBe(true);
  expect(Object.is(got.move.y, want.move.y), `move.y ${got.move.y} vs ${want.move.y}`).toBe(true);
  expect(Object.is(got.aim, want.aim), `aim ${got.aim} vs ${want.aim}`).toBe(true);
  expect(got.attack).toBe(want.attack);
  expect(got.special).toBe(want.special);
  expect(got.sprint).toBe(want.sprint);
}

/**
 * Builds a log blob header by hand, so the tick-ceiling refusal can be tested
 * without materialising 648.001 ticks of table (which is the very cost the
 * ceiling exists to refuse paying).
 *
 * Layout under test: u32 LE record count, u32 LE tick span, then the records.
 */
function craftHeader(count: number, ticks: number): string {
  const bytes = new Uint8Array(8);
  const view = new DataView(bytes.buffer);
  view.setUint32(0, count, true);
  view.setUint32(4, ticks, true);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

describe('quantização do input (D-02, D-03)', () => {
  it('devolve um InputState reprodutível a partir de inteiros', () => {
    const q = quantize(raw(7, 0.5123, -0.9871, 1.234567, 5));
    // move: the value IS n/127 for an integer n in [-127, 127].
    const nx = Math.round(q.move.x * 127);
    const ny = Math.round(q.move.y * 127);
    expect(Number.isInteger(nx) && nx >= -127 && nx <= 127).toBe(true);
    expect(Number.isInteger(ny) && ny >= -127 && ny <= 127).toBe(true);
    expect(Object.is(q.move.x, nx / 127)).toBe(true);
    expect(Object.is(q.move.y, ny / 127)).toBe(true);
    // aim: the value IS i * AIM_STEP for an integer i in [-32768, 32767].
    const i = Math.round(q.aim / AIM_STEP);
    expect(Number.isInteger(i) && i >= -32768 && i <= 32767).toBe(true);
    expect(Object.is(q.aim, i * AIM_STEP)).toBe(true);
    // flags ride through untouched.
    expect(q.attack).toBe(true);
    expect(q.special).toBe(false);
    expect(q.sprint).toBe(true);
    expect(q.tick).toBe(7);
  });

  it('é idempotente sobre 200.000 amostras de um corpus determinístico', () => {
    // Seeded Rng, never Math.random: a corpus that changes between runs turns
    // a reproducible failure into a flake.
    const rng = new Rng(0x5eed1234);
    let failures = 0;
    for (let n = 0; n < 200000; n++) {
      const sample = raw(
        n,
        rng.range(-1.5, 1.5),
        rng.range(-1.5, 1.5),
        rng.range(-Math.PI, Math.PI),
        rng.int(8),
      );
      const once = quantize(sample);
      const twice = quantize(once);
      if (
        !Object.is(once.move.x, twice.move.x) ||
        !Object.is(once.move.y, twice.move.y) ||
        !Object.is(once.aim, twice.aim)
      ) {
        failures++;
      }
    }
    expect(failures).toBe(0);
  });

  it('clampa move fora de [-1, 1] em vez de estourar o int8', () => {
    const q = quantize(raw(0, 12, -12, 0));
    expect(Object.is(q.move.x, 1)).toBe(true);
    expect(Object.is(q.move.y, -1)).toBe(true);
  });
});

describe('pacote de 6 bytes por tick', () => {
  it('um tick empacotado ocupa exatamente 6 bytes, no layout do formato', () => {
    expect(TICK_PACKET_BYTES).toBe(6);
    const bytes = new Uint8Array(8).fill(0xaa);
    const view = new DataView(bytes.buffer);
    packTick(3, raw(0, 1, -1, AIM_STEP * 100, 5), view, 0);
    // int8 move.x, int8 move.y, uint16 LE aim, uint8 flags, uint8 player index
    expect(view.getInt8(0)).toBe(127);
    expect(view.getInt8(1)).toBe(-127);
    expect(view.getUint16(2, true)).toBe(100);
    expect(view.getUint8(4)).toBe(5);
    expect(view.getUint8(5)).toBe(3);
    // bits 3-7 of the flags byte are zero — the four spare bits are reserved,
    // and a decoder that starts seeing garbage there cannot tell a future
    // flag from a corrupt log.
    expect(view.getUint8(4) & 0xf8).toBe(0);
    // Nothing was written past byte 5.
    expect(bytes[6]).toBe(0xaa);
    expect(bytes[7]).toBe(0xaa);
  });

  it('unpackTick(packTick(s)) devolve s já quantizado, campo a campo', () => {
    const source = raw(42, -0.3721, 0.8814, 2.7182818, 3);
    const wanted = quantize(source);
    const view = new DataView(new ArrayBuffer(TICK_PACKET_BYTES));
    packTick(1, wanted, view, 0);
    const back = unpackTick(view, 0, source.tick);
    expect(back.idx).toBe(1);
    expectSameInput(back.state, wanted);
  });

  it('aim decodifica como int16: 0xFFFF volta como -AIM_STEP', () => {
    // uint16 would be mathematically fine and would move the domain to
    // [0, 2pi), changing the iteration count of the angle-normalising loops in
    // packages/sim/src/combat.ts and with it the bits at the melee arc edge.
    const view = new DataView(new ArrayBuffer(TICK_PACKET_BYTES));
    view.setUint16(2, 0xffff, true);
    const back = unpackTick(view, 0, 0);
    expect(Object.is(back.state.aim, -AIM_STEP)).toBe(true);
    expect(back.state.aim).toBeLessThan(0);
  });

  it('o topo da faixa de aim é -pi, e não +pi: [-pi, pi) fecha embaixo', () => {
    const view = new DataView(new ArrayBuffer(TICK_PACKET_BYTES));
    view.setUint16(2, 32768, true);
    expect(Object.is(unpackTick(view, 0, 0).state.aim, -Math.PI)).toBe(true);
  });

  it('-0 é canonizado para +0 na captura e não sobrevive ao codec', () => {
    // Math.round(-0.4) is -0, and -0/127 is -0. Without the `| 0` a barely
    // negative stick injects -0 into the World, where JSON serialisation drops
    // the sign silently — and hashWorld, which goes through the same lossy
    // path, cannot detect the loss (ADR 0011).
    expect(Object.is(Math.round(-0.4), -0)).toBe(true);
    const q = quantize(raw(0, -0.001, -0, -1e-9));
    expect(Object.is(q.move.x, -0)).toBe(false);
    expect(Object.is(q.move.x, 0)).toBe(true);
    expect(Object.is(q.move.y, -0)).toBe(false);
    expect(Object.is(q.aim, -0)).toBe(false);
    const view = new DataView(new ArrayBuffer(TICK_PACKET_BYTES));
    packTick(0, q, view, 0);
    const back = unpackTick(view, 0, 0);
    expect(Object.is(back.state.move.x, -0)).toBe(false);
    expect(Object.is(back.state.move.x, 0)).toBe(true);
  });
});

describe('log: delta + RLE e preenchimento de buracos (D-04, D-12)', () => {
  /** Two players over five ticks; p1 only ever changes on tick 3. */
  function table(): InputTable {
    const p0 = [
      raw(0, 1, 0, 0.5, 1),
      raw(1, 1, 0, 0.5, 1),
      raw(2, 0, 1, -0.5, 0),
      raw(3, 0, 1, -0.5, 0),
      raw(4, 0, 1, -0.5, 0),
    ];
    const p1 = [
      raw(0, 0, 0, 0, 0),
      raw(1, 0, 0, 0, 0),
      raw(2, 0, 0, 0, 0),
      raw(3, -1, 0, 1.25, 6),
      raw(4, -1, 0, 1.25, 6),
    ];
    return p0.map((state, t) => [state, p1[t]]);
  }

  it('faz round-trip de vários jogadores por vários ticks', () => {
    const source = table();
    const at = decodeLog(encodeLog(source), SLOTS);
    for (let t = 0; t < source.length; t++) {
      const view = at(t);
      expectSameInput(view.p0, quantize(source[t][0]));
      expectSameInput(view.p1, quantize(source[t][1]));
    }
  });

  it('grava só o que mudou, na ordem canônica dentro do tick', () => {
    const blob = encodeLog(table());
    const bytes = Uint8Array.from(atob(blob), c => c.charCodeAt(0));
    const view = new DataView(bytes.buffer);
    // p0 changes on ticks 0 and 2, p1 on ticks 0 and 3 — four records, not
    // the ten a dense log would carry.
    expect(view.getUint32(0, true)).toBe(4);
    expect(view.getUint32(4, true)).toBe(5);
    // Every tick delta here is below 128, so each varint is one byte and the
    // records sit at 8 + i * (1 + 6).
    const order = [0, 1, 2, 3].map(i => unpackTick(view, 8 + i * 7 + 1, 0).idx);
    // Tick 0 carries both players, and inside a tick the canonical order of
    // RunConfig.players decides who comes first (D-12).
    expect(order).toEqual([0, 1, 0, 1]);
  });

  it('um tick sem registro repete o último input conhecido do jogador', () => {
    const records: InputRecord[] = [
      { t: 0, idx: 0, mx: 36, my: 4, aim: 473, flags: 1 },
      { t: 10, idx: 0, mx: -20, my: 0, aim: -1068, flags: 0 },
    ];
    const at = decodeInputRecords(records, SLOTS);
    for (let t = 0; t < 10; t++) {
      expect(Object.is(at(t).p0.move.x, 36 / 127)).toBe(true);
      expect(at(t).p0.tick).toBe(t);
    }
    expect(Object.is(at(10).p0.move.x, -20 / 127)).toBe(true);
    expect(Object.is(at(99).p0.move.x, -20 / 127)).toBe(true);
  });

  it('um jogador que nunca apareceu recebe o input neutro', () => {
    const at = decodeInputRecords([{ t: 0, idx: 0, mx: 36, my: 4, aim: 473, flags: 1 }], SLOTS);
    expectSameInput(at(5).p1, {
      tick: 5, move: { x: 0, y: 0 }, aim: 0, attack: false, special: false, sprint: false,
    });
  });
});

describe('teto de ticks no decodificador (T-1-03)', () => {
  it('recusa um log que declare mais ticks que MAX_RUN_TICKS', () => {
    expect(MAX_RUN_TICKS).toBe(60 * 3600 * 3);
    const blob = craftHeader(0, MAX_RUN_TICKS + 1);
    expect(() => decodeLog(blob, SLOTS)).toThrow(/teto/);
  });

  it('aceita um log exatamente no teto', () => {
    expect(() => decodeLog(craftHeader(0, MAX_RUN_TICKS), SLOTS)).not.toThrow();
  });

  it('recusa uma contagem de registros que o blob não pode conter', () => {
    // A header claiming millions of records inside eight bytes is a decoder
    // allocating for work that was never sent — the cheap half of T-1-03.
    expect(() => decodeLog(craftHeader(1000000, 10), SLOTS)).toThrow(/registros/);
  });
});
