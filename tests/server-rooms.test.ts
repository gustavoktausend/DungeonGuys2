// server-rooms.test.ts — the room map and the rate limiter, driven with a fake
// clock and a fake CSPRNG so that nothing here waits and nothing here is lucky.
//
// Both modules take `now` and `randomBytes` as arguments for exactly this
// reason. A 30-minute TTL and a 60-second grace tested against the wall clock
// would be two tests nobody can run, and a collision in a 32^6 space tested
// against a real generator would be a test that passes because it never
// happened rather than because the code handles it. Injecting both turns "wait
// half an hour" into "advance a number" and "hope for a collision" into "force
// one".
//
// WHAT THIS FILE IS GUARDING, in one sentence: the room code is the ONLY
// credential a room has in this phase (D3-09), so its unpredictability, its
// uniqueness among live rooms, and the bucket that makes guessing it expensive
// are one mechanism with three parts, and a test suite that covered two of them
// would describe a room anyone can walk into.
import { describe, it, expect } from 'vitest';
import { randomBytes as realRandomBytes } from 'node:crypto';
import { ROOM_CODE_ALPHABET, ROOM_CODE_LENGTH, isRoomCode } from '@dg2/protocol';
import {
  AUTHORITY_GRACE_MS,
  MAX_CODE_ATTEMPTS,
  MAX_OCCUPANTS,
  MAX_ROOMS,
  ROOM_IDLE_TTL_MS,
  createRooms,
  type Room,
  type Rooms,
} from '../apps/server/src/signaling/rooms';
import {
  JOIN_LIMIT,
  LIMIT_WINDOW_MS,
  MAX_TRACKED_KEYS,
  UPGRADE_LIMIT,
  clientIp,
  createLimiter,
} from '../apps/server/src/signaling/limiter';

/** A clock that only moves when a test says so. */
function fakeClock(start = 1_700_000_000_000) {
  let t = start;
  return {
    now: () => t,
    advance: (ms: number) => {
      t += ms;
    },
  };
}

/**
 * A generator that counts in base 32, so every draw differs from the last.
 *
 * Deterministic on purpose: a test that asserts "these two rooms got different
 * codes" must be describing the code under test, not the entropy of the
 * platform.
 */
function countingBytes(): (n: number) => Uint8Array {
  let counter = 0;
  return (n: number) => {
    const out = new Uint8Array(n);
    let value = counter++;
    for (let i = n - 1; i >= 0; i -= 1) {
      out[i] = value & 31;
      value >>>= 5;
    }
    return out;
  };
}

/** A generator with no entropy at all: every draw is the same code. */
function constantBytes(): (n: number) => Uint8Array {
  return (n: number) => new Uint8Array(n);
}

/** The pair every peer of these rooms announces, unless a test says otherwise. */
const VERSIONS = { sim: 'sha256:0123456789abcdef', protocol: '2' };

let nextPeer = 0;
/** A fresh occupant. `peerId` is a connection handle and dies with it (ADR 0001). */
function peer(name = 'jogador', versions = VERSIONS) {
  nextPeer += 1;
  return { peerId: `peer-${nextPeer}`, accountId: `conta-${nextPeer}`, name, versions };
}

/**
 * `create` with the ceiling ruled out, for every test that is not about it.
 *
 * `create` answers `MAX_ROOMS` with null, and a test that is about codes or
 * seats has no business handling that: a null here is a failure of the test's
 * own premise, so it throws with a message that names it.
 */
function open(rooms: Rooms, arriving = peer()): Room {
  const room = rooms.create(arriving);
  if (room === null) throw new Error('create devolveu null abaixo de MAX_ROOMS');
  return room;
}

describe('geração do código de sala', () => {
  it('devolve seis caracteres, todos do alfabeto do protocolo', () => {
    const rooms = createRooms({ randomBytes: realRandomBytes, now: fakeClock().now });

    for (let i = 0; i < 200; i += 1) {
      const code = rooms.createCode();
      expect(code).toHaveLength(ROOM_CODE_LENGTH);
      for (const ch of code) expect(ROOM_CODE_ALPHABET).toContain(ch);
      // The strict check from the protocol, not a second opinion assembled
      // here: the server keys its map by this string, so "valid" has to mean
      // the same thing on both sides of the wire.
      expect(isRoomCode(code)).toBe(true);
    }
  });

  it('mil salas vivas não repetem um código', () => {
    const rooms = createRooms({ randomBytes: realRandomBytes, now: fakeClock().now });

    const seen = new Set<string>();
    for (let i = 0; i < 1000; i += 1) seen.add(open(rooms, peer()).code);

    // Set size, not a pairwise scan: a duplicate anywhere collapses the count,
    // and the number it collapses to is the number of distinct rooms that
    // actually exist — which is the property being asserted.
    expect(seen.size).toBe(1000);
    expect(rooms.size()).toBe(1000);
  });

  it('redesenha quando o primeiro sorteio bate numa sala viva', () => {
    // Two draws, the first of which collides. If the loop were absent the
    // second room would silently take over the first room's entry in the map,
    // and the first room's occupants would start receiving a stranger's SDP.
    const draws = [new Uint8Array(ROOM_CODE_LENGTH), new Uint8Array(ROOM_CODE_LENGTH)];
    draws[1]![ROOM_CODE_LENGTH - 1] = 1;
    let i = 0;
    const randomBytes = (): Uint8Array => draws[Math.min(i++, draws.length - 1)]!;

    const rooms = createRooms({ randomBytes, now: fakeClock().now });
    const first = open(rooms, peer());
    // Rewind so the second create() draws the colliding value first.
    i = 0;
    const second = open(rooms, peer());

    expect(second.code).not.toBe(first.code);
    expect(rooms.size()).toBe(2);
  });

  it(`recusa a sala ${MAX_ROOMS + 1} com null em vez de crescer sem teto (CR-02)`, () => {
    // The same defect limiter.ts refuses with MAX_TRACKED_KEYS: a Map keyed by
    // remote input with no ceiling is a memory budget handed to whoever sends
    // `create` fastest, and under MemoryMax=256M it ends with the kernel
    // killing every legitimate room along with the flood.
    const clock = fakeClock();
    const rooms = createRooms({ randomBytes: countingBytes(), now: clock.now });
    const first = open(rooms, peer());
    for (let i = 1; i < MAX_ROOMS; i += 1) open(rooms, peer());
    expect(rooms.size()).toBe(MAX_ROOMS);

    expect(rooms.create(peer())).toBeNull();
    expect(rooms.size()).toBe(MAX_ROOMS);
    // Not a throw, deliberately: the ceiling is an ordinary refusal the handler
    // answers with `roomFull`, while a throw is what a broken generator gets.
    // And it is a ceiling, not a lock: a room that dies frees its place.
    rooms.authorityLeft(first.code);
    clock.advance(AUTHORITY_GRACE_MS + 1);
    expect(rooms.sweep()).toEqual([first.code]);
    expect(rooms.create(peer())).not.toBeNull();
    expect(rooms.size()).toBe(MAX_ROOMS);
  });

  it(`desiste depois de ${MAX_CODE_ATTEMPTS} tentativas em vez de girar para sempre`, () => {
    // A generator with no entropy is the pathological case, and the point is
    // that it terminates. Without a ceiling this is an infinite loop inside a
    // socket handler — the process stops answering and systemd sees a healthy
    // unit, which is the worst shape a failure can take.
    const rooms = createRooms({ randomBytes: constantBytes(), now: fakeClock().now });

    expect(open(rooms, peer()).code).toHaveLength(ROOM_CODE_LENGTH);
    expect(() => open(rooms, peer())).toThrow(/c[oó]digo/i);
    expect(rooms.size()).toBe(1);
  });
});

describe('entrar numa sala', () => {
  it('join de uma sala inexistente devolve badCode', () => {
    const rooms = createRooms({ randomBytes: countingBytes(), now: fakeClock().now });

    const result = rooms.join('ZZZZZZ', peer());
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('badCode');
  });

  it('atribui p0..p3 em ordem de entrada', () => {
    const rooms = createRooms({ randomBytes: countingBytes(), now: fakeClock().now });
    const room = open(rooms, peer('autoridade'));

    // The authority takes p0 by arriving first, NOT by being the authority:
    // FORM-12 keeps the slot free of any claim about who is in charge, and
    // `authorityPeerId` is what carries that, explicitly.
    expect(room.occupants.get(room.authorityPeerId)?.slot).toBe('p0');

    const slots = ['p1', 'p2', 'p3'];
    for (const expected of slots) {
      const result = rooms.join(room.code, peer());
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.occupant.slot).toBe(expected);
    }
  });

  it(`join numa sala com ${MAX_OCCUPANTS} ocupantes devolve roomFull`, () => {
    const rooms = createRooms({ randomBytes: countingBytes(), now: fakeClock().now });
    const room = open(rooms, peer());
    for (let i = 1; i < MAX_OCCUPANTS; i += 1) rooms.join(room.code, peer());

    const result = rooms.join(room.code, peer());
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('roomFull');
    expect(room.occupants.size).toBe(MAX_OCCUPANTS);
  });

  it('join com sim diferente da sala é recusado com simVersion e os dois valores (D-08)', () => {
    // The gate at the door, measured. Before it, `versions` arrived in every
    // `join` and was read by nothing: two builds with different simulations
    // paired, and the divergence surfaced forty seconds in, somewhere else.
    const rooms = createRooms({ randomBytes: countingBytes(), now: fakeClock().now });
    const room = open(rooms, peer());

    const result = rooms.join(room.code, peer('outra-build', { sim: 'sha256:fedcba9876543210', protocol: '2' }));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe('simVersion');
    // Both values, because "incompatible" alone costs an hour every time it
    // is read: the room's is `ours`, the arrival's is `theirs`.
    expect(result.mismatch).toEqual({
      kind: 'sim', ours: 'sha256:0123456789abcdef', theirs: 'sha256:fedcba9876543210',
    });
    // And no seat was taken by the refused build.
    expect(room.occupants.size).toBe(1);
  });

  it('join com protocol diferente é recusado com protocolVersion, antes do sim (D-08)', () => {
    // Protocol first, in the axis order checkVersions fixes: if the framing
    // disagrees, the `sim` field may not even mean what this side thinks.
    const rooms = createRooms({ randomBytes: countingBytes(), now: fakeClock().now });
    const room = open(rooms, peer());

    const result = rooms.join(room.code, peer('outra-build', { sim: 'sha256:fedcba9876543210', protocol: '3' }));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('protocolVersion');
  });

  it('a versão da sala é a da autoridade que a abriu, copiada e não compartilhada', () => {
    const rooms = createRooms({ randomBytes: countingBytes(), now: fakeClock().now });
    const announced = { sim: 'sha256:0123456789abcdef', protocol: '2' };
    const room = open(rooms, peer('autoridade', announced));
    // Mutating what the caller handed over must not move the room's reference:
    // a whole room is judged by it.
    announced.sim = 'sha256:alterado';
    expect(room.versions).toEqual({ sim: 'sha256:0123456789abcdef', protocol: '2' });
    // And the pair is not on the seat: PeerInfo is what the wire carries.
    expect(Object.keys(room.occupants.get(room.authorityPeerId)!).sort())
      .toEqual(['accountId', 'name', 'peerId', 'slot']);
  });

  it('um join repetido do mesmo peer devolve o mesmo assento, sem mudar de slot (CR-02)', () => {
    // Before this guard a repeated join found its own seat among the taken
    // ones, was handed the next free slot, and moved mid-lobby — freeing the
    // old seat to whoever came next. A seat is stable for the run (ADR 0001).
    const rooms = createRooms({ randomBytes: countingBytes(), now: fakeClock().now });
    const room = open(rooms, peer());
    const guest = peer();
    const first = rooms.join(room.code, guest);
    const again = rooms.join(room.code, guest);
    expect(first.ok && again.ok).toBe(true);
    if (!first.ok || !again.ok) return;
    expect(again.occupant.slot).toBe(first.occupant.slot);
    expect(again.occupant).toBe(first.occupant);
    expect(room.occupants.size).toBe(2);
  });

  it('um slot vago é reaproveitado quando alguém sai', () => {
    const rooms = createRooms({ randomBytes: countingBytes(), now: fakeClock().now });
    const room = open(rooms, peer());
    const guest = rooms.join(room.code, peer());
    expect(guest.ok).toBe(true);
    if (!guest.ok) return;

    rooms.leave(room.code, guest.occupant.peerId);
    const replacement = rooms.join(room.code, peer());
    expect(replacement.ok).toBe(true);
    // p1 again, because the seat is empty. Handing out p4 would put a number
    // outside PLAYER_SLOT on the wire.
    if (replacement.ok) expect(replacement.occupant.slot).toBe('p1');
  });
});

describe('quando uma sala morre', () => {
  it(`é varrida depois de ${ROOM_IDLE_TTL_MS / 60_000} minutos sem mensagem da autoridade`, () => {
    const clock = fakeClock();
    const rooms = createRooms({ randomBytes: countingBytes(), now: clock.now });
    const room = open(rooms, peer());

    clock.advance(ROOM_IDLE_TTL_MS - 1);
    expect(rooms.sweep()).toEqual([]);
    expect(rooms.get(room.code)).toBeDefined();

    clock.advance(2);
    expect(rooms.sweep()).toEqual([room.code]);
    expect(rooms.get(room.code)).toBeUndefined();
  });

  it('uma mensagem da autoridade adia o TTL', () => {
    // The acceptance half. A sweep that fired unconditionally would satisfy the
    // test above while deleting rooms out from under a lobby waiting for
    // friends — which is 15 legitimate minutes of doing nothing visible.
    const clock = fakeClock();
    const rooms = createRooms({ randomBytes: countingBytes(), now: clock.now });
    const room = open(rooms, peer());

    clock.advance(ROOM_IDLE_TTL_MS - 1_000);
    rooms.touch(room.code);
    clock.advance(ROOM_IDLE_TTL_MS - 1_000);

    expect(rooms.sweep()).toEqual([]);
    expect(rooms.get(room.code)).toBeDefined();
  });

  it('fechar o socket da autoridade NÃO apaga a sala na hora', () => {
    // D3-02 read as (a): the room dies when the authority LEAVES, and the
    // socket is the detector, not the event. `systemctl reload caddy` closes
    // every live WebSocket while the P2P DataChannels, which never touch Caddy,
    // keep running — under the literal reading that reload deletes every room
    // on the box at once, mid-game.
    const clock = fakeClock();
    const rooms = createRooms({ randomBytes: countingBytes(), now: clock.now });
    const room = open(rooms, peer());
    rooms.join(room.code, peer());

    rooms.authorityLeft(room.code);
    expect(rooms.sweep()).toEqual([]);
    expect(rooms.get(room.code)).toBeDefined();
    expect(room.occupants.size).toBe(2);

    clock.advance(AUTHORITY_GRACE_MS - 1);
    expect(rooms.sweep()).toEqual([]);
    expect(rooms.get(room.code)).toBeDefined();
  });

  it('durante a graça, join é recusado com roomClosed (WR-02)', () => {
    // A seat handed out now would name an authority whose socket is gone, and
    // nothing in this phase brings it back: a lobby that never fills, with no
    // message saying why. The refusal is the one the room earns a minute later.
    const clock = fakeClock();
    const rooms = createRooms({ randomBytes: countingBytes(), now: clock.now });
    const room = open(rooms, peer());
    rooms.authorityLeft(room.code);

    const result = rooms.join(room.code, peer());
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('roomClosed');
    expect(room.occupants.size).toBe(1);
  });

  it('sweep entrega cada sala removida ao callback, com os ocupantes, antes de apagar', () => {
    // What lets the server tell whoever is still inside that the room is
    // gone. The codes it returns stay the plain list they always were.
    const clock = fakeClock();
    const rooms = createRooms({ randomBytes: countingBytes(), now: clock.now });
    const dying = open(rooms, peer('autoridade'));
    rooms.join(dying.code, peer('convidado'));
    const living = open(rooms, peer());

    rooms.authorityLeft(dying.code);
    clock.advance(AUTHORITY_GRACE_MS + 1);
    const seen: string[] = [];
    const removed = rooms.sweep((room) => {
      seen.push(`${room.code}:${room.occupants.size}`);
      // Already out of the map when the callback runs, so nothing the
      // callback does can put it back by accident.
      expect(rooms.get(room.code)).toBeUndefined();
    });

    expect(removed).toEqual([dying.code]);
    expect(seen).toEqual([`${dying.code}:2`]);
    expect(rooms.get(living.code)).toBeDefined();
  });

  it(`é apagada ${AUTHORITY_GRACE_MS / 1000} s depois se a autoridade não volta`, () => {
    const clock = fakeClock();
    const rooms = createRooms({ randomBytes: countingBytes(), now: clock.now });
    const room = open(rooms, peer());

    rooms.authorityLeft(room.code);
    clock.advance(AUTHORITY_GRACE_MS + 1);

    expect(rooms.sweep()).toEqual([room.code]);
    expect(rooms.get(room.code)).toBeUndefined();
  });

  it('a autoridade que reconecta dentro da graça mantém sala, ocupantes e slot', () => {
    const clock = fakeClock();
    const rooms = createRooms({ randomBytes: countingBytes(), now: clock.now });
    const room = open(rooms, peer('autoridade'));
    const guest = rooms.join(room.code, peer());
    expect(guest.ok).toBe(true);

    rooms.authorityLeft(room.code);
    clock.advance(AUTHORITY_GRACE_MS - 1_000);

    // A NEW peerId, because peerId dies with the connection (ADR 0001). The
    // slot does not move: that is the whole reason the two are different
    // identifiers, and it is what lets reconnection stay a transport event.
    const returned = rooms.authorityReturned(room.code, 'peer-reconectado');
    expect(returned).toBe(true);

    clock.advance(AUTHORITY_GRACE_MS + 1);
    expect(rooms.sweep()).toEqual([]);

    const alive = rooms.get(room.code);
    expect(alive).toBeDefined();
    expect(alive?.authorityPeerId).toBe('peer-reconectado');
    expect(alive?.occupants.get('peer-reconectado')?.slot).toBe('p0');
    expect(alive?.occupants.size).toBe(2);
  });

  it('remove apaga a sala na hora e devolve o que apagou, com os ocupantes', () => {
    // The exit that is not a timeout: the authority leaving on purpose, or an
    // entry that failed halfway. The caller gets the room back so it can tell
    // whoever was still inside — a deletion that returned nothing would leave
    // every guest to find out from a silence.
    const rooms = createRooms({ randomBytes: countingBytes(), now: fakeClock().now });
    const room = open(rooms, peer('autoridade'));
    rooms.join(room.code, peer('convidado'));

    const removed = rooms.remove(room.code);
    expect(removed).toBe(room);
    expect(removed?.occupants.size).toBe(2);
    expect(rooms.get(room.code)).toBeUndefined();
    expect(rooms.size()).toBe(0);
    // Idempotent: a second removal has nothing to hand back.
    expect(rooms.remove(room.code)).toBeUndefined();
  });

  it('a autoridade não consegue voltar para uma sala já varrida', () => {
    const clock = fakeClock();
    const rooms = createRooms({ randomBytes: countingBytes(), now: clock.now });
    const room = open(rooms, peer());

    rooms.authorityLeft(room.code);
    clock.advance(AUTHORITY_GRACE_MS + 1);
    rooms.sweep();

    expect(rooms.authorityReturned(room.code, 'peer-tarde-demais')).toBe(false);
  });
});

describe('rate limit por endereço', () => {
  it(`deixa passar ${UPGRADE_LIMIT} tentativas de upgrade por minuto e recusa a seguinte`, () => {
    const clock = fakeClock();
    const limiter = createLimiter({
      now: clock.now,
      limit: UPGRADE_LIMIT,
      windowMs: LIMIT_WINDOW_MS,
    });

    for (let i = 0; i < UPGRADE_LIMIT; i += 1) {
      expect(limiter.take('203.0.113.7'), `tentativa ${i + 1}`).toBe(true);
    }
    expect(limiter.take('203.0.113.7')).toBe(false);
  });

  it('a janela reabre depois de um minuto', () => {
    const clock = fakeClock();
    const limiter = createLimiter({
      now: clock.now,
      limit: UPGRADE_LIMIT,
      windowMs: LIMIT_WINDOW_MS,
    });

    for (let i = 0; i < UPGRADE_LIMIT; i += 1) limiter.take('203.0.113.7');
    expect(limiter.take('203.0.113.7')).toBe(false);

    clock.advance(LIMIT_WINDOW_MS);
    expect(limiter.take('203.0.113.7')).toBe(true);
  });

  it('um endereço esgotado não afeta outro', () => {
    const clock = fakeClock();
    const limiter = createLimiter({
      now: clock.now,
      limit: UPGRADE_LIMIT,
      windowMs: LIMIT_WINDOW_MS,
    });

    for (let i = 0; i < UPGRADE_LIMIT; i += 1) limiter.take('203.0.113.7');
    expect(limiter.take('203.0.113.7')).toBe(false);
    expect(limiter.take('198.51.100.4')).toBe(true);
  });

  it(`o balde de join é separado do de upgrade e permite ${JOIN_LIMIT} por minuto`, () => {
    // Two limiters, not one shared counter. A guest who opens a socket and then
    // tries three codes must not be spending the same budget, or the cheap
    // action would starve the expensive one — and it is the join bucket that
    // makes the six-character code unsweepable (T-3-01).
    const clock = fakeClock();
    const upgrade = createLimiter({
      now: clock.now,
      limit: UPGRADE_LIMIT,
      windowMs: LIMIT_WINDOW_MS,
    });
    const join = createLimiter({ now: clock.now, limit: JOIN_LIMIT, windowMs: LIMIT_WINDOW_MS });

    for (let i = 0; i < JOIN_LIMIT; i += 1) {
      expect(join.take('203.0.113.7'), `join ${i + 1}`).toBe(true);
    }
    expect(join.take('203.0.113.7')).toBe(false);
    // The upgrade bucket is untouched by all of that.
    expect(upgrade.take('203.0.113.7')).toBe(true);
  });

  it(`o Map para de crescer em ${MAX_TRACKED_KEYS} chaves`, () => {
    // An unbounded Map keyed by remote input IS the denial of service it was
    // written to prevent: 200 bytes per entry times a spoofed X-Forwarded-For
    // per request reaches MemoryMax=256M long before any bucket fills.
    const clock = fakeClock();
    const limiter = createLimiter({
      now: clock.now,
      limit: UPGRADE_LIMIT,
      windowMs: LIMIT_WINDOW_MS,
    });

    for (let i = 0; i < MAX_TRACKED_KEYS + 500; i += 1) limiter.take(`10.0.${i >> 8}.${i & 255}`);

    expect(limiter.size()).toBeLessThanOrEqual(MAX_TRACKED_KEYS);
    // Anti-vacuity: a limiter that cleared the map on every insert would also
    // satisfy the line above while limiting nothing at all.
    expect(limiter.size()).toBeGreaterThan(MAX_TRACKED_KEYS / 2);
  });

  it('varre as entradas expiradas antes de despejar as vivas', () => {
    const clock = fakeClock();
    const limiter = createLimiter({
      now: clock.now,
      limit: UPGRADE_LIMIT,
      windowMs: LIMIT_WINDOW_MS,
    });

    for (let i = 0; i < MAX_TRACKED_KEYS; i += 1) limiter.take(`10.0.${i >> 8}.${i & 255}`);
    clock.advance(LIMIT_WINDOW_MS + 1);
    limiter.take('203.0.113.7');

    // Everything before the jump is expired, so the sweep should have reclaimed
    // it rather than evicting a live bucket to make room.
    expect(limiter.size()).toBeLessThan(MAX_TRACKED_KEYS);
  });
});

describe('de qual endereço a requisição veio', () => {
  it('usa o primeiro elemento de x-forwarded-for quando o cabeçalho existe', () => {
    // Behind Caddy every socket is loopback, so remoteAddress would put the
    // whole internet in one bucket (P-2). Caddy REPLACES this header for
    // untrusted sources, so the first element is the real client.
    expect(
      clientIp({ headers: { 'x-forwarded-for': '203.0.113.7, 70.41.3.18' } }, { remoteAddress: '127.0.0.1' }),
    ).toBe('203.0.113.7');
  });

  it('apara espaço em volta do endereço encaminhado', () => {
    expect(
      clientIp({ headers: { 'x-forwarded-for': '  203.0.113.7  ' } }, { remoteAddress: '127.0.0.1' }),
    ).toBe('203.0.113.7');
  });

  it('cai para remoteAddress quando não há proxy na frente', () => {
    // The development case, and it must not be an afterthought: without a proxy
    // the header is absent and the socket address is the correct answer.
    expect(clientIp({ headers: {} }, { remoteAddress: '198.51.100.4' })).toBe('198.51.100.4');
  });

  it('ignora um x-forwarded-for vazio em vez de devolver string vazia', () => {
    // An empty bucket key would collapse every request that carries a blank
    // header into one counter — the same failure as remoteAddress behind a
    // proxy, arrived at from the other direction.
    expect(clientIp({ headers: { 'x-forwarded-for': '' } }, { remoteAddress: '198.51.100.4' })).toBe(
      '198.51.100.4',
    );
  });

  it('devolve um marcador quando não há endereço nenhum', () => {
    expect(clientIp({ headers: {} }, {})).toBe('desconhecido');
  });
});
