// index.ts — the signalling server: the upgrade handler, the three guards that
// run before the handshake completes, and the opaque routing of the twelve
// messages.
//
// THE SERVER IS A POST OFFICE THAT NEVER OPENS AN ENVELOPE. It matches two
// machines that cannot find each other behind NAT, hands each the other's
// address, and forgets. It holds no rule about how a room is played, it never
// reads an SDP, and nothing about a room reaches the database (C-12).
//
// Written as a factory in the shape of createApp: dependencies by argument,
// zero side effects on import. That is what lets tests/server-signaling.test.ts
// drive a real http.Server on an ephemeral port with a clock and a heartbeat it
// controls, instead of waiting thirty seconds to find out whether a socket dies.
import { WebSocketServer, type WebSocket } from 'ws';
import type { IncomingMessage } from 'node:http';
import type { Duplex } from 'node:stream';
import { randomUUID } from 'node:crypto';
import { PROTOCOL_VERSION } from '@dg2/protocol';
import type {
  Answer,
  Candidate,
  IceConfig,
  IceOutcome,
  Offer,
  PeerInfo,
  RejectReason,
  SignalMessage,
  TurnCredential,
} from '@dg2/protocol';

import { parseSignal } from './schema';
import { clientIp, type Limiter, type RemoteSocket } from './limiter';
import type { OutcomeSource } from './outcome';
import type { Rooms } from './rooms';

/**
 * A seat identifier.
 *
 * Spelled as `PeerInfo['slot']` and NOT as the `PlayerSlot` that @dg2/protocol
 * exports, because those are two different types wearing one name: the exported
 * one comes from runEnvelope and is a `{ id, cls, name }` record, while this is
 * the `'p0' | 'p1' | 'p2' | 'p3'` the wire carries. The collision is recorded in
 * the protocol package's own comments; deriving the name from the message type
 * that uses it is how this file stays on the right side of it.
 */
type Slot = PeerInfo['slot'];

/** The path the handshake must ask for. Anything else is not answered at all. */
const SIGNALLING_PATH = '/ws';

/**
 * How often the heartbeat sweeps: THIRTY SECONDS.
 *
 * The ws README's own number, and it sets the detection window for a socket
 * that vanished without a close frame — between 30 and 60 seconds, since a peer
 * dies somewhere inside one interval and is collected on the next. Exported so
 * index.ts arms the timer with this value rather than a second copy of it.
 */
export const HEARTBEAT_MS = 30 * 1000;

/**
 * The HTTP server, in the only aspect this module needs: it emits `upgrade`.
 *
 * A narrow structural interface, in the shape shutdown.ts established with
 * `DrainableServer` — and here it is load-bearing rather than stylistic.
 * `serve()` from @hono/node-server is typed as a UNION of `http.Server`,
 * `Http2Server` and `Http2SecureServer`, so naming `http.Server` outright does
 * not compile against the very object index.ts exports. Declaring the one
 * method that is actually used accepts all three, says exactly what the
 * coupling is, and lets a test hand over a plain `http.Server` of its own.
 */
export interface UpgradableServer {
  on(
    event: 'upgrade',
    listener: (req: IncomingMessage, socket: Duplex, head: Buffer) => void,
  ): unknown;
}

/** What the caller must supply. Everything time-like or stateful is injected. */
export interface SignallingDeps {
  /** The single allowed `Origin`, from DG2_ORIGIN. Compared byte for byte. */
  origin: string;
  rooms: Rooms;
  /** Handshakes per address. Consulted BEFORE the handshake completes. */
  upgradeLimiter: Limiter;
  /** Room-code attempts per address. This is what makes the code unsweepable. */
  joinLimiter: Limiter;
  log: (event: string, fields?: Record<string, unknown>) => void;
  now: () => number;
  /**
   * Writes one ICE telemetry row.
   *
   * TWO ARGUMENTS, AND THE SECOND ONE IS THE SECURITY PROPERTY. The message
   * names a room and a slot; this handler does not pass them on. It resolves
   * both from the socket, along with the reporter's account, and hands them
   * over separately — so a peer cannot file reports against a room it never
   * entered and tilt a measurement it has no part in (T-3-24).
   */
  recordOutcome: (row: IceOutcome, from: OutcomeSource) => void;
  /**
   * Releases a reporter's telemetry quota when its socket closes.
   *
   * Paired with `recordOutcome` because the quota it releases is the one that
   * function spends. The two are separate arguments rather than one object so
   * that a caller with nothing to release — a test, or a deployment that does
   * not store telemetry — can pass a no-op for this alone.
   */
  forgetOutcomes: (peerId: string) => void;
  /** Mints the ephemeral TURN credential and describes the ICE servers. */
  iceConfig: (code: string, slot: Slot) => { ice: IceConfig; turn: TurnCredential };
  /**
   * Arms the heartbeat, in the shape shutdown.ts established with
   * `startWatchdog`. Injected rather than calling setInterval here so a test
   * can advance thirty seconds by calling a function.
   */
  startHeartbeat: (tick: () => void) => void;
}

/** What the server tracks per open socket. */
interface Session {
  peerId: string;
  /** The room this socket is in, or null before `create`/`join`. */
  code: string | null;
  /** The ws README's liveness flag: set by a pong, cleared by a ping. */
  isAlive: boolean;
  /**
   * The rate-limit key, captured at handshake time.
   *
   * Read from the upgrade request and kept, rather than dug out of the socket
   * later: the address that matters is the one `X-Forwarded-For` carried, and
   * that header only exists on the request. Reaching into the WebSocket's
   * underlying socket afterwards would find Caddy's loopback address and put
   * every player in one bucket — the exact defect clientIp exists to avoid.
   */
  address: string;
}

export function attachSignalling(server: UpgradableServer, deps: SignallingDeps): void {
  // `noServer: true` is what makes the three guards possible at all: with
  // `{ server }` the library would attach its own upgrade listener and complete
  // the handshake before this file ever saw the request, leaving refusal to a
  // close frame sent to a connection that already exists.
  //
  // `maxPayload` IS NOT A DETAIL. The library's default is ONE HUNDRED MiB, and
  // this unit runs under `MemoryMax=256M` — so ten sockets each allocating the
  // permitted maximum kill the process before any rate limit has a chance to
  // act, on traffic that looks like ten connections and trips no counter. A
  // real SDP offer with a generous candidate list is 4-8 KiB; 64 KiB is eight
  // times the worst legitimate case and four times the schema's own SDP cap, so
  // a message refused for size is refused BY THE SCHEMA, with a reason, rather
  // than by the transport tearing the connection down without one.
  //
  // `perMessageDeflate` stays OFF, which is the server default and is being
  // recorded rather than changed: the ws README warns that increased
  // concurrency, especially on Linux, leads to catastrophic memory
  // fragmentation and slow performance. The traffic here is small JSON and SDP
  // text on a cold channel, so compression would trade a defect for nothing.
  const wss = new WebSocketServer({ noServer: true, maxPayload: 64 * 1024 });

  const sessions = new Map<WebSocket, Session>();
  /** Reverse index, so a relay can find the socket a peerId belongs to. */
  const byPeerId = new Map<string, WebSocket>();

  const onSocketError = (error: Error): void => {
    deps.log('upgrade-socket', { error: error.message });
  };

  server.on('upgrade', (req: IncomingMessage, socket: Duplex, head: Buffer) => {
    // Attached FIRST and removed just before handleUpgrade: between those two
    // points an unhandled 'error' on a raw socket is an uncaught exception, and
    // a client that resets mid-handshake is an ordinary event, not a bug.
    socket.on('error', onSocketError);

    if (req.url !== SIGNALLING_PATH) {
      // No status line. An endpoint that answered 404 would confirm to a
      // scanner that something is listening and worth probing further.
      socket.destroy();
      return;
    }

    // ORIGIN IS ANTI-CSWSH, NOT AUTHENTICATION. A browser sends this header
    // honestly and cannot be made to lie about it, which is precisely what
    // stops a third-party page from opening a socket to this server with the
    // user's cookies attached. Any non-browser client forges it in one line.
    // What protects a room is its CODE (D3-09). Writing this here is what stops
    // phase 6 from reading this line as a guarantee it never was.
    if (req.headers.origin !== deps.origin) {
      socket.write('HTTP/1.1 403 Forbidden\r\n\r\n');
      socket.destroy();
      return;
    }

    // WHY THIS COUNTER IS HAND-ROLLED AND NOT `hono-rate-limiter`, or any other
    // middleware: Node's http.Server emits 'upgrade' INSTEAD OF 'request' when
    // the Upgrade header is present, so Hono's fetch handler is never called on
    // this path. A rate limiter mounted on the app would pass a smoke test —
    // which makes an ordinary GET — and limit nothing whatsoever in production,
    // with the limiter's own counter as the only evidence, sitting at zero.
    // Node types the upgrade socket as a bare Duplex, but the documented event
    // always hands over a net.Socket — which is where `remoteAddress` lives.
    // The intersection states that fact at the one place it is needed instead
    // of widening clientIp to accept something without an address at all.
    if (!deps.upgradeLimiter.take(clientIp(req, socket as Duplex & RemoteSocket))) {
      socket.write('HTTP/1.1 429 Too Many Requests\r\n\r\n');
      socket.destroy();
      return;
    }

    // ─────────────────────────────────────────────────────────────────────
    // PHASE 6 PLUGS THE SESSION CHECK IN HERE, AND NOWHERE ELSE (D3-09).
    //
    // The Better Auth cookie arrives on THIS request: a WebSocket handshake is
    // an ordinary GET, so a same-origin cookie is attached automatically and
    // can be validated before `handleUpgrade` — which is the entire reason
    // `noServer: true` is above and the reason Hono was chosen over a framework
    // that hides the http.Server.
    //
    // Everything above STAYS. The session becomes a FOURTH guard, not a
    // replacement for the first three: origin still blocks CSWSH, the limiter
    // still bounds a flood from an authenticated account, and the path check
    // still refuses to describe the surface.
    // ─────────────────────────────────────────────────────────────────────

    socket.removeListener('error', onSocketError);
    wss.handleUpgrade(req, socket, head, (ws) => {
      wss.emit('connection', ws, req);
    });
  });

  const sendTo = (ws: WebSocket, message: SignalMessage): void => {
    if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(message));
  };

  const refuse = (ws: WebSocket, reason: RejectReason, detail: string): void => {
    sendTo(ws, { kind: 'error', reason, detail });
  };

  /** The roster of a room, in arrival order, as the wire spells it. */
  const rosterOf = (code: string): readonly PeerInfo[] => {
    const room = deps.rooms.get(code);
    return room ? [...room.occupants.values()] : [];
  };

  /** Tells everyone in a room who is in it, except the peer that just learned. */
  const announce = (code: string, exceptPeerId: string | null): void => {
    const peers = rosterOf(code);
    for (const peer of peers) {
      if (peer.peerId === exceptPeerId) continue;
      const target = byPeerId.get(peer.peerId);
      if (target) sendTo(target, { kind: 'peers', peers });
    }
  };

  /**
   * Relays one of the three opaque verbs.
   *
   * TWO CHECKS, AND BOTH ARE ACCESS CONTROL. THE ADDRESSEE MUST BE IN THE
   * SENDER'S ROOM: SDP carries network addresses, so relaying across the
   * boundary would hand a stranger's endpoints to anyone who guessed an
   * identifier (ASVS V4). And THE SENDER IS THE SOCKET, NEVER THE BODY — the
   * same doctrine `iceOutcome` follows (T-3-24). `from` is compared against
   * the session's own peerId and refused on mismatch; without that, any
   * occupant could answer an offer in the authority's name, feed a neighbour
   * forged candidates, or open a fresh peer connection on the victim for every
   * `from` it cared to invent. The rest of the message is copied verbatim — a
   * length was checked in the schema, and a length is not a parse.
   */
  const relay = (ws: WebSocket, session: Session, message: Offer | Answer | Candidate): void => {
    const room = session.code === null ? undefined : deps.rooms.get(session.code);
    if (!room || !room.occupants.has(message.to)) {
      refuse(ws, 'badCode', 'destinatário não está nesta sala');
      return;
    }
    if (message.from !== session.peerId) {
      refuse(ws, 'badCode', 'remetente não corresponde a esta conexão');
      return;
    }
    const target = byPeerId.get(message.to);
    if (!target) {
      refuse(ws, 'badCode', 'destinatário não está conectado');
      return;
    }
    // Restated from the session even though it just compared equal: the field
    // the addressee reads is the one the server vouches for, not the body's.
    sendTo(target, { ...message, from: session.peerId });
  };

  wss.on('connection', (ws: WebSocket, req: IncomingMessage) => {
    // A connection handle, not an identity: `peerId` dies with the socket and a
    // reconnection produces a new one for the same player (ADR 0001). It is
    // drawn from the platform CSPRNG because it is used to address relay
    // traffic, and a guessable one inside a shared room would let an occupant
    // impersonate the addressee of a negotiation.
    const session: Session = {
      peerId: randomUUID(),
      code: null,
      isAlive: true,
      address: clientIp(req, req.socket),
    };
    sessions.set(ws, session);
    byPeerId.set(session.peerId, ws);

    ws.on('pong', () => {
      session.isAlive = true;
    });

    ws.on('error', (error: Error) => {
      deps.log('socket', { peerId: session.peerId, error: error.message });
    });

    ws.on('message', (data: Buffer) => {
      const parsed = parseSignal(data.toString('utf8'));
      if (!parsed.ok) {
        sendTo(ws, parsed.error);
        return;
      }
      handle(ws, session, parsed.message);
    });

    ws.on('close', () => {
      sessions.delete(ws);
      byPeerId.delete(session.peerId);
      // Third map keyed by this peerId, released beside the other two. The
      // telemetry quota outlives nothing: a peerId dies with its socket, so a
      // counter that survived it would be an entry per connection ever
      // accepted, growing for as long as the process runs.
      deps.forgetOutcomes(session.peerId);
      if (session.code === null) return;

      const room = deps.rooms.get(session.code);
      if (!room) return;

      if (room.authorityPeerId === session.peerId) {
        // NOT a deletion. rooms.ts owns the sixty-second grace, and the reason
        // it exists is written above the constant there: a Caddy reload closes
        // every live WebSocket while the P2P DataChannels keep running.
        deps.rooms.authorityLeft(session.code);
        return;
      }

      deps.rooms.leave(session.code, session.peerId);
      announce(session.code, null);
    });
  });

  /**
   * ONE ROOM PER CONNECTION, and the rule is enforced at both doors.
   *
   * A socket already seated that asked for another room would do two things,
   * both bad. Its old seat would never be freed — `close` only releases the
   * room the session names at the time — so every hop leaves a ghost occupant
   * holding a slot until the room dies. And `create` runs through no limiter
   * at all (the join bucket covers guesses, the upgrade bucket covers
   * handshakes), so one connection looping on it would mint a room per message
   * until `MAX_ROOMS` — or, before that ceiling existed, until the kernel
   * killed the unit. Leaving first is what a peer that wants another room does.
   */
  const seatedAlready = (ws: WebSocket, session: Session): boolean => {
    if (session.code === null) return false;
    refuse(ws, 'badCode', 'esta conexão já está numa sala — saia antes de entrar em outra');
    return true;
  };

  function handle(ws: WebSocket, session: Session, message: SignalMessage): void {
    switch (message.kind) {
      case 'create': {
        if (seatedAlready(ws, session)) return;
        // THE HALF OF D-08 THE SERVER CAN JUDGE ON ITS OWN. It has no `sim`
        // version — that is a build artifact of the client — but it does
        // speak a protocol version, and a room opened by a build it cannot
        // read would be a room nobody on the current build could enter. The
        // `sim` axis is judged at `join`, against the authority's pair.
        if (message.versions.protocol !== PROTOCOL_VERSION) {
          refuse(ws, 'protocolVersion', `A do servidor é ${PROTOCOL_VERSION}.`);
          return;
        }
        const room = deps.rooms.create({
          peerId: session.peerId,
          accountId: message.accountId,
          name: message.name,
          versions: message.versions,
        });
        if (room === null) {
          // The ceiling of rooms.ts, answered with the nearest true reason in
          // the frozen table: there is no seat to be had anywhere on the box.
          refuse(ws, 'roomFull', 'o servidor está no limite de salas — tente de novo em instantes');
          return;
        }
        session.code = room.code;
        const { ice, turn } = deps.iceConfig(room.code, 'p0');
        sendTo(ws, {
          kind: 'created',
          code: room.code,
          peerId: session.peerId,
          // Explicit, never derived from the slot. The day authority moves to a
          // dedicated server, that server announces itself in this same field
          // and no message changes shape (FORM-12).
          authorityPeerId: room.authorityPeerId,
          slot: 'p0',
          ice,
          turn,
        });
        return;
      }

      case 'join': {
        // Before the bucket: a peer refused for being seated already has not
        // guessed anything, and the refusal names its real cause.
        if (seatedAlready(ws, session)) return;
        // THE BUCKET THAT MAKES SIX CHARACTERS ENOUGH (T-3-01). Ten guesses a
        // minute turns sweeping 32^6 into centuries; without it the same code
        // is sweepable in an afternoon.
        if (!deps.joinLimiter.take(session.address)) {
          // Deliberately the SAME refusal a wrong code gets. Telling the two
          // apart would confirm to a sweeping script that it had been throttled
          // rather than mistaken — which is exactly the bit that would let it
          // distinguish a real code from a fake one by timing its attempts.
          refuse(ws, 'badCode', 'código de sala inválido');
          return;
        }

        const result = deps.rooms.join(message.code, {
          peerId: session.peerId,
          accountId: message.accountId,
          name: message.name,
          versions: message.versions,
        });
        if (!result.ok) {
          // A version refusal carries the ROOM's value in the free text: the
          // player already knows their own, and the screen composes the pair
          // (D-08). `detail` is never branched on, so the sentence is safe to
          // reword; `reason` is what the client dispatches on.
          refuse(
            ws,
            result.reason,
            result.mismatch ? `A da sala é ${result.mismatch.ours}.` : 'não foi possível entrar na sala',
          );
          return;
        }

        session.code = result.room.code;
        const { ice, turn } = deps.iceConfig(result.room.code, result.occupant.slot);
        sendTo(ws, {
          kind: 'joined',
          code: result.room.code,
          peerId: session.peerId,
          authorityPeerId: result.room.authorityPeerId,
          slot: result.occupant.slot,
          ice,
          turn,
          peers: rosterOf(result.room.code),
        });
        // Everyone already inside learns the roster changed. The newcomer is
        // skipped because it just received the whole list in `joined`.
        announce(result.room.code, session.peerId);
        return;
      }

      case 'offer':
      case 'answer':
      case 'candidate': {
        if (session.code !== null) deps.rooms.touch(session.code);
        relay(ws, session, message);
        return;
      }

      case 'leave': {
        if (session.code === null) return;
        const room = deps.rooms.get(session.code);
        if (room && room.authorityPeerId === session.peerId) {
          deps.rooms.authorityLeft(session.code);
          return;
        }
        deps.rooms.leave(session.code, session.peerId);
        announce(session.code, session.peerId);
        session.code = null;
        return;
      }

      case 'iceOutcome': {
        // THE REPORTER IS RESOLVED, NOT ASKED. `message.code` and
        // `message.slot` are on the wire and are deliberately not read: the
        // room comes from this socket's session and the slot and account from
        // that room's own occupant record. A peer with no room has nothing to
        // attribute a report to, so there is nothing to write (T-3-24).
        const room = session.code === null ? undefined : deps.rooms.get(session.code);
        const occupant = room?.occupants.get(session.peerId);
        if (!room || !occupant) return;

        try {
          deps.recordOutcome(message, {
            peerId: session.peerId,
            code: room.code,
            slot: occupant.slot,
            accountId: occupant.accountId,
          });
        } catch (error) {
          // Swallowed on purpose, in the shape health.ts established: a write
          // that fails is worth a line in the journal and must never be worth a
          // dropped room. Telemetry about how connections went cannot be
          // allowed to end one.
          deps.log('ice-outcome', {
            // The resolved room and not the one the message named, so a log
            // line cannot be steered anywhere either.
            code: room.code,
            error: error instanceof Error ? error.message : String(error),
          });
        }
        return;
      }

      // The five below are things the SERVER says, and a client that sends one
      // is either confused or probing. They are refused rather than ignored,
      // and the switch names them one by one rather than falling through a
      // `default`, so that a thirteenth entry in SIGNAL_KIND turns this file red
      // instead of being silently dropped.
      case 'created':
      case 'joined':
      case 'peers':
      case 'closed':
      case 'error': {
        refuse(ws, 'badCode', 'esta mensagem só pode vir do servidor');
        return;
      }
    }
  }

  // ONE TIMER FOR TWO JOBS, and the pairing is deliberate rather than thrifty:
  // both are periodic housekeeping over the same two maps, and a second
  // interval would be a second thing to arm, unref and stop.
  //
  // The liveness half is the ws README's isAlive/terminate pattern. THESE ARE
  // RFC 6455 CONTROL FRAMES AND NOT THE `ping`/`pong` OF D3-13: those are game
  // messages, they travel on the `unreliable` DataChannel between peers, they
  // measure the round trip of the path the simulation actually uses, and they
  // never reach this file. Two mechanisms, two transports, two purposes, one
  // name — a fact of the stack rather than a naming mistake.
  //
  // The socket is kept alive for the WHOLE match (D3-11), not closed once
  // negotiation succeeds, because it is the channel phase 5 reconnects and
  // restarts ICE over.
  deps.startHeartbeat(() => {
    for (const [ws, session] of sessions) {
      if (!session.isAlive) {
        ws.terminate();
        continue;
      }
      session.isAlive = false;
      ws.ping();
    }

    for (const code of deps.rooms.sweep()) {
      deps.log('room-swept', { code });
    }
  });
}
