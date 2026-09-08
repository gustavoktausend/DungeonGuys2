// protocol-enums.test.ts — the append-only gate on the wire tables (FORM-11),
// plus the two cases of the version refusal (D-08).
//
// The tables in packages/protocol/src/enums.ts are ordered arrays whose INDEX
// is the wire value. That makes exactly one edit safe and every other edit a
// silent reinterpretation of messages already recorded or already in flight:
//
//   append at the END      safe — old readers ignore the new value, and every
//                          value they already knew kept its number.
//   insert in the MIDDLE   BREAK — every value after the insertion point
//                          shifts by one, so an old 'input' arrives as a
//                          'snapshot'. Nothing throws. It just misbehaves.
//   rename an entry        BREAK — same thing wearing a different name.
//
// None of those failures announce themselves at runtime, which is why they are
// caught here instead: tests/snapshots/protocol-enums.json is the frozen
// record, and the assertions below are written to name the TABLE and the INDEX
// they disagree on, because whoever reads the failure is about to break the
// wire for everyone.
//
// The golden lives in tests/snapshots/ and NOT in tests/golden/. That
// directory is reserved for simulation hashes so that `git log -- tests/golden/`
// stays the complete history of simulation change and nothing else.
import { describe, it, expect } from 'vitest';
import {
  MSG_KIND, REJECT_REASON, CHANNEL_CLASS, OBJECTIVE_KIND,
  SNAPSHOT_PART, SIGNAL_KIND, ICE_ROUTE, ICE_CANDIDATE_TYPE,
  PROTOCOL_VERSION, checkVersions, type Versions,
} from '@dg2/protocol';
import GOLD from './snapshots/protocol-enums.json';

/**
 * Every frozen table, by name. Registering a new table here AND in the golden
 * is deliberate friction: a new table is a new wire concept, and the two-file
 * edit is the moment to ask whether it really belongs on the wire.
 */
const TABLES: Record<string, readonly string[]> = {
  MSG_KIND, REJECT_REASON, CHANNEL_CLASS, OBJECTIVE_KIND,
  SNAPSHOT_PART, SIGNAL_KIND, ICE_ROUTE, ICE_CANDIDATE_TYPE,
};

const GOLDEN: Record<string, readonly string[]> = GOLD;

/** How to repair a failure, appended to the messages that need it. */
const HOWTO =
  'Se a mudança foi um APPEND no fim, atualize tests/snapshots/protocol-enums.json ' +
  'no mesmo commit. Se foi inserção no meio ou renomeação, desfaça: isso reinterpreta ' +
  'silenciosamente toda mensagem já gravada.';

describe('tabelas de enum do protocolo (FORM-11)', () => {
  it('o módulo e o ouro declaram o mesmo conjunto de tabelas', () => {
    expect(Object.keys(TABLES).sort()).toEqual(Object.keys(GOLDEN).sort());
  });

  it('cada tabela bate com o ouro valor a valor, na ordem', () => {
    for (const [name, live] of Object.entries(TABLES)) {
      const gold = GOLDEN[name] ?? [];
      // Walk to the longer of the two so an append shows up as a divergence at
      // its own index (`gold[i]` undefined) instead of as a bare length
      // mismatch. The index is the actionable half of the message.
      const n = Math.max(gold.length, live.length);
      for (let i = 0; i < n; i++) {
        expect(live[i], `${name}[${i}] divergiu do ouro. ${HOWTO}`).toBe(gold[i]);
      }
      expect(live.length, `${name} mudou de cardinalidade. ${HOWTO}`).toBe(gold.length);
    }
  });

  it('o índice de cada nome de MSG_KIND é o seu valor de fio', () => {
    // Pins the ENCODING RULE, which the comparison above does not state: the
    // position is the number that travels. A repeated name would make the
    // mapping ambiguous in the decode direction, and indexOf catches it.
    MSG_KIND.forEach((name, wire) => {
      expect(MSG_KIND.indexOf(name), `'${name}' aparece mais de uma vez em MSG_KIND`).toBe(wire);
    });
  });

  it('nenhuma tabela tem valor duplicado', () => {
    const dupes: string[] = [];
    for (const [name, table] of Object.entries(TABLES)) {
      const seen = new Set<string>();
      for (const value of table) {
        if (seen.has(value)) dupes.push(`${name}: '${value}'`);
        seen.add(value);
      }
    }
    expect(dupes).toEqual([]);
  });

  it('REJECT_REASON cobre as duas razões de versão que D-08 exige na tela', () => {
    expect(REJECT_REASON).toContain('simVersion');
    expect(REJECT_REASON).toContain('protocolVersion');
  });

  it('CHANNEL_CLASS tem as duas classes que a fase 3 vai abrir', () => {
    expect(CHANNEL_CLASS).toEqual(['reliable', 'unreliable']);
  });

  it('OBJECTIVE_KIND começa em none', () => {
    // 'none' at index 0 so that a zeroed/absent objective field decodes to
    // "no objective" rather than to a real one.
    expect(OBJECTIVE_KIND[0]).toBe('none');
  });

  it('ping e pong são os índices 8 e 9 de MSG_KIND (D3-13)', () => {
    // Pinned by INDEX and not merely by presence. The append is only safe
    // because 0..7 kept their numbers, and this assertion is what says so:
    // 'ping' anywhere else would mean something recorded as 'ack' now reads
    // as a latency probe.
    expect(MSG_KIND[8]).toBe('ping');
    expect(MSG_KIND[9]).toBe('pong');
    expect(MSG_KIND.length).toBe(10);
  });

  it('SNAPSHOT_PART tem as três partes de D3-19, começando em actors', () => {
    expect(SNAPSHOT_PART[0]).toBe('actors');
    expect(SNAPSHOT_PART).toEqual(['actors', 'projectiles', 'pickups']);
  });

  it('SIGNAL_KIND tem doze verbos e é uma tabela separada de MSG_KIND', () => {
    expect(SIGNAL_KIND.length).toBe(12);
    // Two wires, two vocabularies. An overlap would not break anything today,
    // but it is the first step towards one handler serving both legs — and the
    // day that happens, a peer can address the signalling server.
    const overlap = SIGNAL_KIND.filter((k) => (MSG_KIND as readonly string[]).includes(k));
    expect(overlap, 'um verbo do signaling também é um MSG_KIND').toEqual([]);
  });

  it('ICE_ROUTE começa em unknown, nunca em direct', () => {
    // A zeroed route field has to decode to "I do not know". Decoding it as
    // 'direct' would bias the relay-need measurement downward, which is the
    // direction nobody investigates.
    expect(ICE_ROUTE[0]).toBe('unknown');
    expect(ICE_ROUTE).toEqual(['unknown', 'direct', 'relay']);
  });

  it('ICE_CANDIDATE_TYPE usa os nomes do W3C / RFC 8445', () => {
    // Read straight off getStats() and stored: renaming any of them here would
    // mean translating at every call site and mistranslating at one of them.
    expect(ICE_CANDIDATE_TYPE).toEqual(['host', 'srflx', 'prflx', 'relay']);
  });
});

describe('recusa de versão (D-08)', () => {
  const SIM = 'a1b2c3d4';
  const ours: Versions = { sim: SIM, protocol: PROTOCOL_VERSION };

  it('PROTOCOL_VERSION é uma string não vazia', () => {
    expect(typeof PROTOCOL_VERSION).toBe('string');
    expect(PROTOCOL_VERSION.length).toBeGreaterThan(0);
  });

  it('versões iguais devolvem null', () => {
    expect(checkVersions(ours, { sim: SIM, protocol: PROTOCOL_VERSION })).toBeNull();
  });

  it('sim diferente devolve kind, ours e theirs', () => {
    const m = checkVersions(ours, { sim: 'deadbeef', protocol: PROTOCOL_VERSION });
    expect(m).toEqual({ kind: 'sim', ours: SIM, theirs: 'deadbeef' });
  });

  it('protocol diferente devolve kind, ours e theirs', () => {
    const m = checkVersions(ours, { sim: SIM, protocol: '999' });
    expect(m).toEqual({ kind: 'protocol', ours: PROTOCOL_VERSION, theirs: '999' });
  });

  it('quando as duas diferem, protocol é reportada primeiro', () => {
    // The protocol version governs how the message was framed, so a sim
    // mismatch reported under a protocol mismatch would be reporting a field
    // that was possibly misread in the first place.
    const m = checkVersions(ours, { sim: 'deadbeef', protocol: '999' });
    expect(m?.kind).toBe('protocol');
  });

  it('o kind do descasamento nomeia uma REJECT_REASON existente', () => {
    // The naming convention is load-bearing: the caller turns `kind` into the
    // reason it puts on screen. If the two vocabularies drift apart, the
    // refusal reaches the player as a reason the wire cannot express.
    const m = checkVersions(ours, { sim: 'deadbeef', protocol: '999' });
    expect(REJECT_REASON).toContain(`${m?.kind}Version`);
  });

  it('é simétrica: trocar os lados troca ours e theirs', () => {
    // T-1-01: whoever holds authority passes ITS OWN values as `ours`. A
    // forged version can only get itself refused, never widen what is
    // accepted — and that only holds if the function has no preferred side.
    const theirs: Versions = { sim: 'deadbeef', protocol: PROTOCOL_VERSION };
    expect(checkVersions(ours, theirs)).toEqual({ kind: 'sim', ours: SIM, theirs: 'deadbeef' });
    expect(checkVersions(theirs, ours)).toEqual({ kind: 'sim', ours: 'deadbeef', theirs: SIM });
  });
});
