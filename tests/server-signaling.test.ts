// server-signaling.test.ts — the upgrade handler and the opaque relay, driven
// against a real http.Server on an ephemeral loopback port.
//
// A REAL SERVER AND NOT A DOUBLE, for the reason tests/pwa/helpers.ts gives
// about its own: the three guards this file exists to pin all run BEFORE the
// WebSocket handshake completes, so a double that started at "a connection
// exists" would be testing the half of the code that was never in doubt. The
// 403 and the 429 are raw bytes written to a socket, and the only way to know
// they are on the wire is to read them off one.
//
// The first three tests therefore speak HTTP by hand instead of using a
// WebSocket client. A client library reports "connection failed" for all three
// refusals identically, which would let a server that answered 403 to
// everything — including valid traffic — pass every one of them.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createServer, type Server } from 'node:http';
import { connect as netConnect } from 'node:net';
import type { AddressInfo } from 'node:net';
import { WebSocket } from 'ws';
import { isRoomCode } from '@dg2/protocol';
import type { IceOutcome, SignalMessage } from '@dg2/protocol';
import { attachSignalling, type SignallingDeps } from '../apps/server/src/signaling';
import type { OutcomeSource } from '../apps/server/src/signaling/outcome';
import { createRooms } from '../apps/server/src/signaling/rooms';
import { createLimiter, JOIN_LIMIT, LIMIT_WINDOW_MS, UPGRADE_LIMIT } from '../apps/server/src/signaling/limiter';

const ORIGIN = 'http://localhost:5173';

let server: Server;
let port: number;
let heartbeat: () => void;
let recorded: IceOutcome[];
/** What the SERVER said about each report, beside what the peer sent. */
let sources: OutcomeSource[];
/** Every peerId whose telemetry quota was released. */
let forgotten: string[];
let recordThrows: boolean;
let open: WebSocket[];

beforeEach(async () => {
  recorded = [];
  sources = [];
  forgotten = [];
  recordThrows = false;
  open = [];
  server = createServer();

  const deps: SignallingDeps = {
    origin: ORIGIN,
    rooms: createRooms({ randomBytes: (n) => randomish(n), now: () => Date.now() }),
    upgradeLimiter: createLimiter({
      now: () => Date.now(),
      limit: UPGRADE_LIMIT,
      windowMs: LIMIT_WINDOW_MS,
    }),
    joinLimiter: createLimiter({
      now: () => Date.now(),
      limit: JOIN_LIMIT,
      windowMs: LIMIT_WINDOW_MS,
    }),
    log: () => {},
    now: () => Date.now(),
    recordOutcome: (row, from) => {
      // The failing INSERT, simulated. A room must not die because telemetry
      // did — outcome.ts swallows for real, and this proves the handler around
      // it survives even a dependency that does not.
      if (recordThrows) throw new Error('banco indisponível');
      recorded.push(row);
      sources.push(from);
    },
    forgetOutcomes: (peerId) => {
      forgotten.push(peerId);
    },
    iceConfig: () => ({
      ice: { iceServers: [{ urls: ['stun:stun.l.google.com:19302'] }] },
      turn: { username: 'u', credential: 'c', ttl: 3600 },
    }),
    startHeartbeat: (tick) => {
      heartbeat = tick;
    },
  };

  attachSignalling(server, deps);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  port = (server.address() as AddressInfo).port;
});

afterEach(async () => {
  for (const ws of open) ws.terminate();
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

/** Deterministic bytes, so a failing test names one code instead of a new one. */
let seed = 0;
function randomish(n: number): Uint8Array {
  const out = new Uint8Array(n);
  seed += 1;
  let value = seed;
  for (let i = n - 1; i >= 0; i -= 1) {
    out[i] = value & 31;
    value >>>= 5;
  }
  return out;
}

/**
 * Speaks a WebSocket handshake by hand and returns whatever bytes came back.
 *
 * Returns the empty string when the server destroyed the socket without
 * answering, which is a distinct outcome from any status line and is asserted
 * as such below.
 */
function rawUpgrade(path: string, headers: Record<string, string>): Promise<string> {
  return new Promise((resolve) => {
    const socket = netConnect(port, '127.0.0.1', () => {
      const lines = [
        `GET ${path} HTTP/1.1`,
        `Host: 127.0.0.1:${port}`,
        'Connection: Upgrade',
        'Upgrade: websocket',
        'Sec-WebSocket-Version: 13',
        'Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==',
        ...Object.entries(headers).map(([k, v]) => `${k}: ${v}`),
      ];
      socket.write(`${lines.join('\r\n')}\r\n\r\n`);
    });

    let data = '';
    socket.on('data', (chunk: Buffer) => {
      data += chunk.toString('latin1');
      // The status line is all this helper promises; reading further would
      // wait for a frame that a refused connection never sends.
      socket.destroy();
    });
    socket.on('close', () => resolve(data));
    socket.on('error', () => resolve(data));
  });
}

/** Opens a client with a well-formed Origin and waits for the handshake. */
function connect(): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`, { origin: ORIGIN });
    open.push(ws);
    ws.once('open', () => resolve(ws));
    ws.once('error', reject);
  });
}

/** The next message off a socket, already parsed. */
function nextMessage(ws: WebSocket): Promise<SignalMessage> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('nenhuma mensagem chegou')), 2000);
    ws.once('message', (data: Buffer) => {
      clearTimeout(timer);
      resolve(JSON.parse(data.toString('utf8')) as SignalMessage);
    });
  });
}

function send(ws: WebSocket, message: unknown): void {
  ws.send(JSON.stringify(message));
}

const VERSIONS = { sim: 'abcdef0123456789', protocol: '2' };

/** Opens a room and returns the authority's socket plus the `created` body. */
async function openRoom(): Promise<{ ws: WebSocket; created: Extract<SignalMessage, { kind: 'created' }> }> {
  const ws = await connect();
  send(ws, { kind: 'create', accountId: 'conta-a', name: 'autoridade', versions: VERSIONS });
  const created = await nextMessage(ws);
  if (created.kind !== 'created') throw new Error(`esperava created, veio ${created.kind}`);
  return { ws, created };
}

describe('os três guardas antes do handshake', () => {
  it('destrói o socket sem responder nada quando a URL não é /ws', async () => {
    // No status line at all, deliberately: an endpoint that answers 404 tells a
    // scanner that something is listening and worth probing further.
    expect(await rawUpgrade('/nao-existe', { Origin: ORIGIN })).toBe('');
  });

  it('responde 403 a um Origin estranho, antes de completar o handshake', async () => {
    const answer = await rawUpgrade('/ws', { Origin: 'https://evil.example' });
    expect(answer).toContain('403');
    // And NOT 101: the point is that the handshake never completed, so no
    // WebSocket ever existed to be closed afterwards.
    expect(answer).not.toContain('101');
  });

  it('responde 403 quando não há Origin nenhum', async () => {
    const answer = await rawUpgrade('/ws', {});
    expect(answer).toContain('403');
  });

  it('responde 429 quando o mesmo endereço insiste', async () => {
    // Every request in this test comes from 127.0.0.1, which is one bucket.
    for (let i = 0; i < UPGRADE_LIMIT; i += 1) await rawUpgrade('/ws', { Origin: ORIGIN });
    const answer = await rawUpgrade('/ws', { Origin: ORIGIN });
    expect(answer).toContain('429');
  });

  it('completa o handshake com 101 quando os três guardas passam', async () => {
    // The acceptance half. A handler that refused everything would satisfy
    // every assertion above while making the server useless.
    const answer = await rawUpgrade('/ws', { Origin: ORIGIN });
    expect(answer).toContain('101');
  });
});

describe('abrir e entrar numa sala', () => {
  it('create devolve created com código válido e o authorityPeerId do remetente', async () => {
    const { created } = await openRoom();

    expect(isRoomCode(created.code)).toBe(true);
    // Named, not derived from the slot: FORM-12 keeps the topology out of the
    // protocol, and a derivation rule IS the topology.
    expect(created.authorityPeerId).toBe(created.peerId);
    expect(created.slot).toBe('p0');
    expect(created.ice.iceServers.length).toBeGreaterThan(0);
  });

  it('join com código válido devolve joined ao convidado', async () => {
    const { created } = await openRoom();

    const guest = await connect();
    send(guest, { kind: 'join', code: created.code, accountId: 'conta-b', name: 'convidado', versions: VERSIONS });
    const joined = await nextMessage(guest);

    expect(joined.kind).toBe('joined');
    if (joined.kind !== 'joined') return;
    expect(joined.code).toBe(created.code);
    expect(joined.slot).toBe('p1');
    expect(joined.authorityPeerId).toBe(created.authorityPeerId);
    // The whole roster, not a delta: a room holds four people and an
    // out-of-order delta is how two machines end up with different lists.
    expect(joined.peers.map((p) => p.slot).sort()).toEqual(['p0', 'p1']);
  });

  it('join com código válido devolve peers à autoridade', async () => {
    const { ws: authority, created } = await openRoom();

    const waiting = nextMessage(authority);
    const guest = await connect();
    send(guest, { kind: 'join', code: created.code, accountId: 'conta-b', name: 'convidado', versions: VERSIONS });

    const peers = await waiting;
    expect(peers.kind).toBe('peers');
    if (peers.kind !== 'peers') return;
    expect(peers.peers).toHaveLength(2);
    expect(peers.peers.map((p) => p.name).sort()).toEqual(['autoridade', 'convidado']);
  });

  it('join com código inexistente devolve error com badCode', async () => {
    const guest = await connect();
    send(guest, { kind: 'join', code: 'ZZZZZZ', accountId: 'c', name: 'n', versions: VERSIONS });

    const answer = await nextMessage(guest);
    expect(answer.kind).toBe('error');
    if (answer.kind !== 'error') return;
    expect(answer.reason).toBe('badCode');
    // The connection survives a refusal: a guest who mistypes a code should be
    // able to try again without reconnecting.
    expect(guest.readyState).toBe(WebSocket.OPEN);
  });

  it('join acima do balde devolve badCode sem revelar que houve limite', async () => {
    const guest = await connect();
    for (let i = 0; i <= JOIN_LIMIT; i += 1) {
      send(guest, { kind: 'join', code: 'ZZZZZZ', accountId: 'c', name: 'n', versions: VERSIONS });
      const answer = await nextMessage(guest);
      expect(answer.kind).toBe('error');
      if (answer.kind === 'error') expect(answer.reason).toBe('badCode');
    }
  });
});

describe('o relay opaco', () => {
  it('entrega um offer byte a byte igual a um peer da mesma sala', async () => {
    const { ws: authority, created } = await openRoom();
    const guest = await connect();
    const peersWaiting = nextMessage(authority);
    send(guest, { kind: 'join', code: created.code, accountId: 'conta-b', name: 'convidado', versions: VERSIONS });
    const joined = await nextMessage(guest);
    await peersWaiting;
    if (joined.kind !== 'joined') return;

    // Deliberately awkward: CRLF, a UTF-8 name, and an `a=` line the server
    // would have to parse to understand. It must arrive unchanged.
    const sdp = 'v=0\r\no=- 4611731400430051336 2 IN IP4 127.0.0.1\r\ns=sessão\r\na=ice-ufrag:N/Ãt\r\n';
    const waiting = nextMessage(guest);
    send(authority, { kind: 'offer', from: created.peerId, to: joined.peerId, sdp });

    const relayed = await waiting;
    expect(relayed.kind).toBe('offer');
    if (relayed.kind !== 'offer') return;
    expect(relayed.sdp).toBe(sdp);
    expect(relayed.from).toBe(created.peerId);
  });

  it('recusa um offer endereçado a um peer de outra sala', async () => {
    // Two rooms, one stranger. Relaying across the boundary would be a broken
    // access control (ASVS V4) that leaks SDP — which carries addresses — to
    // whoever asks for it by peerId.
    const first = await openRoom();
    const second = await openRoom();

    const waiting = nextMessage(first.ws);
    send(first.ws, {
      kind: 'offer',
      from: first.created.peerId,
      to: second.created.peerId,
      sdp: 'v=0\r\n',
    });

    const answer = await waiting;
    expect(answer.kind).toBe('error');
    expect(first.ws.readyState).toBe(WebSocket.OPEN);
  });

  it('recusa um candidate endereçado a um peer que não existe', async () => {
    const { ws, created } = await openRoom();

    const waiting = nextMessage(ws);
    send(ws, {
      kind: 'candidate',
      from: created.peerId,
      to: 'peer-inventado',
      candidate: 'candidate:1 1 udp 2113937151 192.0.2.1 50000 typ srflx',
      sdpMid: '0',
      sdpMLineIndex: 0,
    });

    expect((await waiting).kind).toBe('error');
  });
});

describe('mensagens que o servidor não entende', () => {
  it('um kind fora de SIGNAL_KIND devolve error e mantém a conexão', async () => {
    const ws = await connect();
    send(ws, { kind: 'deleteEverything', code: 'ZZZZZZ' });

    expect((await nextMessage(ws)).kind).toBe('error');
    expect(ws.readyState).toBe(WebSocket.OPEN);
  });

  it('texto que não é JSON devolve error e mantém a conexão', async () => {
    const ws = await connect();
    ws.send('isto não é json {{{');

    expect((await nextMessage(ws)).kind).toBe('error');
    expect(ws.readyState).toBe(WebSocket.OPEN);
  });

  it('um create com nome grande demais é recusado pelo teto do schema', async () => {
    const ws = await connect();
    send(ws, { kind: 'create', accountId: 'c', name: 'n'.repeat(500), versions: VERSIONS });

    expect((await nextMessage(ws)).kind).toBe('error');
  });
});

describe('a telemetria de ICE não pode derrubar a sala', () => {
  it('um iceOutcome válido chega ao recordOutcome', async () => {
    const { ws, created } = await openRoom();
    send(ws, outcomeFor(created.code));

    await waitFor(() => recorded.length === 1);
    expect(recorded[0]?.code).toBe(created.code);
  });

  it('um recordOutcome que lança é engolido e a conexão segue viva', async () => {
    // health.ts already establishes the pattern: swallow, log, carry on. An
    // INSERT that fails is worth a line in the journal and must not be worth a
    // dropped room.
    const { ws, created } = await openRoom();
    recordThrows = true;
    send(ws, outcomeFor(created.code));

    // Still answering afterwards is the assertion; a thrown handler would take
    // the socket, or the process, with it.
    const waiting = nextMessage(ws);
    send(ws, { kind: 'join', code: 'ZZZZZZ', accountId: 'c', name: 'n', versions: VERSIONS });
    expect((await waiting).kind).toBe('error');
    expect(ws.readyState).toBe(WebSocket.OPEN);
  });

  it('a sala e o slot do reporte vêm do socket, não do corpo (T-3-24)', async () => {
    const { ws, created } = await openRoom();
    // The peer names a room it is not in and a slot it does not hold. If either
    // reached the recorder, a peer could pour rows into the telemetry of a room
    // it never entered — and the relay rate this table exists to MEASURE would
    // become something anyone could tilt.
    send(ws, { ...outcomeFor('ZZZZZZ'), slot: 'p3' });

    await waitFor(() => sources.length === 1);
    expect(sources[0]?.code).toBe(created.code);
    expect(sources[0]?.slot).toBe('p0');
    expect(sources[0]?.peerId).toBe(created.peerId);
    // The account comes from the room's own occupant record, which is what
    // `create` put there — not from anything this message carried.
    expect(sources[0]?.accountId).toBe('conta-a');
    // And the body still arrives intact: the server resolves the ATTRIBUTION,
    // it does not rewrite the measurement.
    expect(recorded[0]?.route).toBe('direct');
  });

  it('um iceOutcome de quem não está em sala nenhuma não vira linha', async () => {
    // Nothing to attribute the report to, so there is nothing to write. Not an
    // error either: a peer that reports after leaving is ordinary, and refusing
    // it would spend a message saying so.
    const ws = await connect();
    send(ws, outcomeFor('ABCDEF'));

    const waiting = nextMessage(ws);
    send(ws, { kind: 'join', code: 'ZZZZZZ', accountId: 'c', name: 'n', versions: VERSIONS });
    expect((await waiting).kind).toBe('error');
    expect(recorded).toHaveLength(0);
  });

  it('a cota de telemetria é devolvida quando o socket fecha', async () => {
    const { ws, created } = await openRoom();
    ws.close();

    // Keyed by peerId, and a peerId dies with its socket. Without this the map
    // in outcome.ts grows by one entry per connection the process ever
    // accepted, which is the unbounded remotely-keyed map limiter.ts refuses.
    await waitFor(() => forgotten.includes(created.peerId));
    expect(forgotten).toContain(created.peerId);
  });
});

describe('o heartbeat e a saída da autoridade', () => {
  it('termina um socket que não devolveu o pong do ciclo anterior', async () => {
    const ws = await connect();
    const closed = new Promise<void>((resolve) => ws.once('close', () => resolve()));

    // Two ticks with no gap: the first arms the check and sends the ping, the
    // second finds no pong because none could have arrived in between. This is
    // the ws README's isAlive/terminate pattern, driven by hand.
    heartbeat();
    heartbeat();

    await closed;
    expect(ws.readyState).toBe(WebSocket.CLOSED);
  });

  it('um socket que responde ao ping sobrevive ao ciclo seguinte', async () => {
    const ws = await connect();
    heartbeat();
    // Let the pong make the round trip before the next sweep.
    await new Promise((resolve) => setTimeout(resolve, 50));
    heartbeat();
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(ws.readyState).toBe(WebSocket.OPEN);
  });

  it('fechar o socket da autoridade inicia a graça em vez de apagar a sala', async () => {
    const { ws, created } = await openRoom();
    ws.close();

    // The room is still there right after the socket goes: rooms.ts owns the
    // 60-second grace, and this handler must not pre-empt it by deleting.
    await waitFor(async () => {
      const guest = await connect();
      send(guest, { kind: 'join', code: created.code, accountId: 'c', name: 'n', versions: VERSIONS });
      return (await nextMessage(guest)).kind === 'joined';
    });
  });
});

function outcomeFor(code: string): IceOutcome {
  return {
    kind: 'iceOutcome',
    id: '01ARZ3NDEKTSV4RRFFQ69G5FAV',
    code,
    slot: 'p0',
    route: 'direct',
    localCandidate: 'srflx',
    remoteCandidate: 'srflx',
    protocol: 'udp',
    relayProtocol: null,
    rttMs: 21,
    result: 'connected',
  };
}

/** Polls a condition instead of sleeping a guessed amount. */
async function waitFor(condition: () => boolean | Promise<boolean>): Promise<void> {
  for (let i = 0; i < 100; i += 1) {
    if (await condition()) return;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error('a condição não se cumpriu a tempo');
}
