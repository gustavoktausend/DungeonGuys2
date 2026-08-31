// inputCodec.ts — quantisation, the 6-byte tick packet, delta + RLE, and the
// hole-filling policy (FORM-06; ADR 0011: D-02, D-03, D-04, D-12).
//
// The point of this module is that the input log is DATA, not the output of a
// computation. Both quantisers turn a float into a small integer at capture
// time, and every decode is one multiplication or one division — both
// correctly rounded by IEEE-754 per the ECMAScript spec, so the value comes
// back bit-identical on any engine. What `Math.hypot` or `Math.atan2` returned
// on the machine that captured the input never reaches the recording: it dies
// in `quantize`, which is what lets the aiming code in `app/` keep using
// implementation-defined functions without putting determinism at risk (D-05).
//
// `InputState` is imported as a type only, so nothing from the simulation ends
// up in the emitted graph and this package keeps its empty dependency list.
import type { InputState } from '@dg2/sim';
import { MAX_RUN_TICKS, type PlayerSlot } from './runEnvelope';

/** 2*pi/65536 — one turn split into 65536 steps (0.005493 degrees). */
export const AIM_STEP = (Math.PI * 2) / 65536;

/**
 * One player's input on one tick, on the wire.
 *
 * int8 move.x, int8 move.y, uint16 LE aim, uint8 flags, uint8 player index.
 * Six bytes at 60 Hz is 360 B/s per player before delta encoding, and the
 * delta takes it to a twentieth of that in practice.
 */
export const TICK_PACKET_BYTES = 6;

/** u32 LE record count, u32 LE tick span. */
const HEADER_BYTES = 8;

/** A tick delta up to 2^32-1 needs five 7-bit groups. */
const MAX_VARINT_BYTES = 5;

const ATTACK = 1;
const SPECIAL = 2;
const SPRINT = 4;

/** The readable, integer form of a log entry — what a fixture stores. */
export type InputRecord = {
  /** Tick this input takes effect on. */
  t: number;
  /** Index into the canonical player order. */
  idx: number;
  /** int8, [-127, 127] — decodes to move.x as mx/127. */
  mx: number;
  /** int8, [-127, 127] — decodes to move.y. */
  my: number;
  /** uint16 on the wire, read back as int16 — decodes as aim * AIM_STEP. */
  aim: number;
  /** uint8: bit0 attack, bit1 special, bit2 sprint, bits 3-7 zero. */
  flags: number;
};

/**
 * The authority-resolved input table: `table[tick][playerIndex]`.
 *
 * This is deliberately the table the simulation CONSUMED and not the traffic
 * that arrived (D-12). The difference is the whole reason a replay works: a
 * tick whose input was late was still stepped with something, and that
 * something is what has to be recorded.
 */
export type InputTable = InputState[][];

/**
 * Quantises one move component to int8 in [-127, 127].
 *
 * The trailing `| 0` is not redundant and must not be "simplified" away.
 * `Math.round(-0.4)` returns -0, and -0/127 is -0 as well, so a barely
 * negative analog stick would inject -0 into the World. JSON serialisation
 * drops that sign silently, and `hashWorld` travels the same lossy path, so a
 * round-trip test verified by hash would PASS on data that had already been
 * corrupted. ADR 0011 therefore canonises -0 to +0 at capture rather than
 * trying to preserve a value the format cannot represent.
 */
function quantizeMove(value: number): number {
  return Math.max(-127, Math.min(127, Math.round(value * 127))) | 0;
}

/**
 * Quantises an angle in radians to the 16 bits that travel on the wire.
 *
 * `& 0xffff` also normalises -0 to 0, for the same reason as above.
 */
function quantizeAim(radians: number): number {
  return Math.round(radians / AIM_STEP) & 0xffff;
}

/**
 * Reads the 16 aim bits back as int16, NOT as uint16.
 *
 * `Math.round(pi/AIM_STEP)` is 32768 and `Math.round(-pi/AIM_STEP)` is -32768:
 * 65537 distinct values for 16 bits, so one of the two ends has to wrap. The
 * wire keeps carrying 16 bits either way — only the interpretation changes.
 *
 * int16 puts the angle back in [-pi, pi), which is exactly the domain
 * `Math.atan2` produces today. Reading the same bits as uint16 would be
 * mathematically fine and would move the domain to [0, 2pi), changing how many
 * times the `while (diff > Math.PI) diff -= Math.PI * 2` loops at
 * packages/sim/src/combat.ts:97-98,111-112 go round — and with the iteration
 * count, the bits at the edge of the melee arc. The choice is a compatibility
 * decision, not a numeric preference.
 */
function decodeAim(bits: number): number {
  return ((bits << 16) >> 16) * AIM_STEP;
}

function toRecord(t: number, idx: number, state: InputState): InputRecord {
  return {
    t,
    idx,
    mx: quantizeMove(state.move.x),
    my: quantizeMove(state.move.y),
    aim: quantizeAim(state.aim),
    flags:
      (state.attack ? ATTACK : 0) | (state.special ? SPECIAL : 0) | (state.sprint ? SPRINT : 0),
  };
}

function recordToState(record: InputRecord, tick: number): InputState {
  return {
    tick,
    move: { x: (record.mx | 0) / 127, y: (record.my | 0) / 127 },
    aim: decodeAim(record.aim),
    attack: (record.flags & ATTACK) !== 0,
    special: (record.flags & SPECIAL) !== 0,
    sprint: (record.flags & SPRINT) !== 0,
  };
}

/**
 * The captured input, rounded to the grid the format can store.
 *
 * Idempotent: `quantize(quantize(x))` equals `quantize(x)` field for field,
 * including the sign of zero. That property is what makes the log a
 * recording rather than a lossy summary — re-encoding what was decoded gives
 * back the same bytes, so a replay of a replay is still the same run.
 */
export function quantize(raw: InputState): InputState {
  return recordToState(toRecord(0, 0, raw), raw.tick);
}

function writeRecord(view: DataView, offset: number, record: InputRecord): void {
  view.setInt8(offset, record.mx);
  view.setInt8(offset + 1, record.my);
  view.setUint16(offset + 2, record.aim, true);
  view.setUint8(offset + 4, record.flags);
  view.setUint8(offset + 5, record.idx);
}

function readRecord(view: DataView, offset: number, t: number): InputRecord {
  return {
    t,
    idx: view.getUint8(offset + 5),
    mx: view.getInt8(offset),
    my: view.getInt8(offset + 1),
    aim: view.getUint16(offset + 2, true),
    flags: view.getUint8(offset + 4),
  };
}

/** Writes one player's tick into `view` at `offset`, quantising on the way. */
export function packTick(
  idx: number,
  state: InputState,
  view: DataView,
  offset: number,
): void {
  writeRecord(view, offset, toRecord(0, idx, state));
}

/**
 * Reads back what `packTick` wrote. `tick` comes from the caller because the
 * packet carries no tick number of its own — the log stores it once, as a
 * delta, in front of the packet.
 */
export function unpackTick(
  view: DataView,
  offset: number,
  tick: number,
): { idx: number; state: InputState } {
  const record = readRecord(view, offset, tick);
  return { idx: record.idx, state: recordToState(record, tick) };
}

/** Before a player's first record, the last known input is "nothing held". */
function neutral(tick: number): InputState {
  return { tick, move: { x: 0, y: 0 }, aim: 0, attack: false, special: false, sprint: false };
}

function check(ok: boolean, field: string, record: InputRecord): void {
  if (!ok) {
    throw new Error(
      `input log inválido em t=${record.t} idx=${record.idx}: ${field}=${String(
        record[field as keyof InputRecord],
      )}`,
    );
  }
}

/**
 * Builds the per-tick input view a stepper consumes, from the readable
 * integer form.
 *
 * Hole-filling policy (D-04) is part of the FORMAT, not of the networking
 * code: when a tick carries no record for a player, that player REPEATS its
 * last known input. A log therefore stores changes only, which is what makes a
 * 3000-tick run a few hundred records instead of 3000 — and, more
 * importantly, it is what the authority actually fed the simulation when an
 * input arrived late, so recording it is recording the truth.
 */
export function decodeInputRecords(
  records: InputRecord[],
  players: PlayerSlot[],
): (tick: number) => Record<string, InputState> {
  // One ascending timeline per player. Sorting a copy keeps the decoder
  // independent of the writer's emission order; Array#sort is stable and the
  // comparator is pure integer arithmetic, so this is engine-independent.
  const timelines = players.map((): InputRecord[] => []);
  for (const record of records) {
    check(Number.isInteger(record.t) && record.t >= 0, 't', record);
    check(
      Number.isInteger(record.idx) && record.idx >= 0 && record.idx < players.length,
      'idx',
      record,
    );
    check(Number.isInteger(record.mx) && record.mx >= -127 && record.mx <= 127, 'mx', record);
    check(Number.isInteger(record.my) && record.my >= -127 && record.my <= 127, 'my', record);
    // Both spellings of the same 16 bits are accepted: a fixture writes the
    // signed value it read, the wire carries the unsigned one, and `decodeAim`
    // maps either onto the same angle. Rejecting one of the two would make the
    // readable form and the binary form disagree about a valid log.
    check(Number.isInteger(record.aim) && record.aim >= -32768 && record.aim <= 65535, 'aim', record);
    check(Number.isInteger(record.flags) && record.flags >= 0 && record.flags <= 7, 'flags', record);
    timelines[record.idx].push(record);
  }
  for (const timeline of timelines) timeline.sort((a, b) => a.t - b.t);

  /** Last record with `t <= tick`, or -1 when the player has none yet. */
  function lastAt(timeline: InputRecord[], tick: number): number {
    let lo = 0, hi = timeline.length - 1, found = -1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (timeline[mid].t <= tick) { found = mid; lo = mid + 1; } else { hi = mid - 1; }
    }
    return found;
  }

  return (tick: number): Record<string, InputState> => {
    const out: Record<string, InputState> = {};
    for (let i = 0; i < players.length; i++) {
      const at = lastAt(timelines[i], tick);
      out[players[i].id] = at < 0 ? neutral(tick) : recordToState(timelines[i][at], tick);
    }
    return out;
  };
}

/**
 * Expands readable records into the dense table `encodeLog` consumes.
 *
 * There is exactly ONE table shape in this module, and this function produces
 * that one — a second shape would drift from the first the first time either
 * gained a field.
 */
export function recordsToTable(records: InputRecord[], players: PlayerSlot[]): InputTable {
  const at = decodeInputRecords(records, players);
  let span = 0;
  for (const record of records) if (record.t + 1 > span) span = record.t + 1;
  const table: InputTable = [];
  for (let t = 0; t < span; t++) {
    const view = at(t);
    table.push(players.map(player => view[player.id]));
  }
  return table;
}

function sameInput(a: InputRecord, b: InputRecord): boolean {
  return a.mx === b.mx && a.my === b.my && a.aim === b.aim && a.flags === b.flags;
}

function writeVarint(bytes: Uint8Array, offset: number, value: number): number {
  let rest = value >>> 0;
  let at = offset;
  while (rest >= 0x80) {
    bytes[at++] = (rest & 0x7f) | 0x80;
    rest = rest >>> 7;
  }
  bytes[at++] = rest;
  return at;
}

function readVarint(bytes: Uint8Array, offset: number): { value: number; next: number } {
  let value = 0;
  let shift = 0;
  let at = offset;
  for (let i = 0; i < MAX_VARINT_BYTES; i++) {
    if (at >= bytes.length) throw new Error('log de input truncado no meio de um delta de tick');
    const byte = bytes[at++];
    value += (byte & 0x7f) * Math.pow(2, shift);
    if ((byte & 0x80) === 0) return { value, next: at };
    shift += 7;
  }
  throw new Error('log de input com delta de tick fora da faixa de 32 bits');
}

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

// Base64 by hand rather than through a platform helper: the two obvious ones
// live in different places (a page global and a Node buffer), and this package
// has to compile and run in both without a dependency and without an ambient
// declaration. Sixty lines of table lookup buys that.
const B64_REVERSE: number[] = (() => {
  const table = new Array<number>(128).fill(-1);
  for (let i = 0; i < B64.length; i++) table[B64.charCodeAt(i)] = i;
  return table;
})();

function toBase64(bytes: Uint8Array): string {
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i];
    const b = i + 1 < bytes.length ? bytes[i + 1] : 0;
    const c = i + 2 < bytes.length ? bytes[i + 2] : 0;
    out += B64[a >> 2];
    out += B64[((a & 3) << 4) | (b >> 4)];
    out += i + 1 < bytes.length ? B64[((b & 15) << 2) | (c >> 6)] : '=';
    out += i + 2 < bytes.length ? B64[c & 63] : '=';
  }
  return out;
}

function fromBase64(text: string): Uint8Array {
  let end = text.length;
  while (end > 0 && text.charCodeAt(end - 1) === 61) end--; // trailing '='
  const out = new Uint8Array(Math.floor((end * 3) / 4));
  let acc = 0;
  let bits = 0;
  let at = 0;
  for (let i = 0; i < end; i++) {
    const code = text.charCodeAt(i);
    const digit = code < 128 ? B64_REVERSE[code] : -1;
    if (digit < 0) throw new Error(`log de input não é base64 válido na posição ${i}`);
    acc = ((acc << 6) | digit) & 0xffffff;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      out[at++] = (acc >> bits) & 0xff;
    }
  }
  return out;
}

/**
 * Serialises the authority-resolved table into the base64 blob the envelope
 * carries.
 *
 * Delta and RLE are the same mechanism seen from two sides: a player is
 * emitted only on the tick its packet CHANGES (the delta), and the run of
 * unchanged ticks in between is stored once, as the varint gap to the next
 * record (the RLE). Inside a tick, players are emitted in canonical order.
 */
export function encodeLog(table: InputTable): string {
  const ticks = table.length;
  if (ticks > MAX_RUN_TICKS) {
    throw new Error(`log de input com ${ticks} ticks, acima do teto de ${MAX_RUN_TICKS}`);
  }
  const changed: InputRecord[] = [];
  const previous = new Map<number, InputRecord>();
  for (let t = 0; t < ticks; t++) {
    const row = table[t];
    for (let idx = 0; idx < row.length; idx++) {
      const state = row[idx];
      if (!state) continue;
      const record = toRecord(t, idx, state);
      const before = previous.get(idx);
      if (before && sameInput(before, record)) continue;
      previous.set(idx, record);
      changed.push(record);
    }
  }

  const buffer = new ArrayBuffer(
    HEADER_BYTES + changed.length * (MAX_VARINT_BYTES + TICK_PACKET_BYTES),
  );
  const bytes = new Uint8Array(buffer);
  const view = new DataView(buffer);
  view.setUint32(0, changed.length, true);
  view.setUint32(4, ticks, true);
  let offset = HEADER_BYTES;
  let previousTick = 0;
  for (const record of changed) {
    offset = writeVarint(bytes, offset, record.t - previousTick);
    previousTick = record.t;
    writeRecord(view, offset, record);
    offset += TICK_PACKET_BYTES;
  }
  return toBase64(bytes.subarray(0, offset));
}

/**
 * Reads the blob back into the same per-tick view `decodeInputRecords`
 * produces, refusing before it allocates anything a submitted header should
 * not have been able to ask for (T-1-03).
 */
export function decodeLog(
  blob: string,
  players: PlayerSlot[],
): (tick: number) => Record<string, InputState> {
  const bytes = fromBase64(blob);
  if (bytes.length < HEADER_BYTES) throw new Error('log de input truncado: falta o cabeçalho');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const count = view.getUint32(0, true);
  const ticks = view.getUint32(4, true);
  if (ticks > MAX_RUN_TICKS) {
    throw new Error(`log de input declara ${ticks} ticks, acima do teto de ${MAX_RUN_TICKS}`);
  }
  // Smallest a record can be is one varint byte plus the packet, so this is
  // the most records the received bytes could possibly hold. Checking it
  // before the loop turns "allocate for whatever the header claims" into
  // "allocate for what was actually sent".
  const room = Math.floor((bytes.length - HEADER_BYTES) / (1 + TICK_PACKET_BYTES));
  if (count > room) {
    throw new Error(
      `log de input declara ${count} registros, mais do que os ${room} que cabem nos bytes recebidos`,
    );
  }

  const records: InputRecord[] = [];
  let offset = HEADER_BYTES;
  let tick = 0;
  for (let i = 0; i < count; i++) {
    const delta = readVarint(bytes, offset);
    tick += delta.value;
    offset = delta.next;
    if (offset + TICK_PACKET_BYTES > bytes.length) {
      throw new Error('log de input truncado no meio de um pacote de tick');
    }
    records.push(readRecord(view, offset, tick));
    offset += TICK_PACKET_BYTES;
  }
  return decodeInputRecords(records, players);
}
