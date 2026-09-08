// turn.ts — the ephemeral relay credential, and the list of ICE servers built
// around it.
//
// THE CLIENT NEVER SEES THE SECRET. coturn's `use-auth-secret` mode
// (draft-uberti-behave-turn-rest-00) works by both sides knowing one shared
// string and neither side sending it: this process derives a username/password
// pair from it, coturn re-derives the same pair to check, and the string itself
// stays in /etc/dg2/env and /etc/turnserver.conf. What travels to the browser
// expires, and expires soon.
//
// THE CREDENTIAL IS TIED TO THE ROOM, and that is a second property on top of
// the expiry (D3-10): the room code and the slot are inside the signed
// username, so a pair captured from one session names the session it came from.
// It cannot be quietly reused as a general-purpose relay account, and a journal
// line can be tied back to a room without this process storing anything.
//
// NO HAND-ROLLED CRYPTOGRAPHY (ASVS V6). `node:crypto` computes the digest;
// this file only decides what gets signed. There is no fallback path, no
// alternative digest and no place where a comparison could be made non-constant
// — coturn does the verifying, and it is not in this repository.
import { createHmac } from 'node:crypto';
import type { IceServer, PeerInfo, TurnCredential } from '@dg2/protocol';

/**
 * How long a minted credential stays valid: ONE HOUR.
 *
 * Long enough that nobody is renegotiating mid-match — a session that outran it
 * would lose relay exactly when it was already going badly — and short enough
 * that a leaked pair is worthless by the evening. It is also the value coturn
 * reads out of the username itself, so nothing has to be configured twice.
 */
export const TTL_SECONDS = 3600;

/**
 * What the server sends when there is no relay to offer.
 *
 * `ttl: 0` is the signal, and it is a value rather than an absent field because
 * `TurnCredential` is not optional on the wire (FORM-12: the shape of a message
 * does not change with the state of the deployment). A client that treated this
 * as usable would hand coturn an empty username and read the refusal as a
 * network fault, so the zero is what says "there is nothing here".
 */
export const NO_TURN: TurnCredential = { username: '', credential: '', ttl: 0 };

/**
 * The domain to advertise our own STUN under when no realm is configured.
 *
 * Development only, and it resolves to this machine, where nothing is
 * listening on 3478. That is deliberate and harmless: the candidate gathering
 * simply finds nothing there and the public STUN entry beside it answers. The
 * alternative — naming a domain this deployment does not own — would send every
 * developer's browser to a stranger.
 */
export const DEV_STUN_DOMAIN = 'localhost';

/**
 * Mints one relay credential for one seat in one room.
 *
 * `nowSeconds` is a PARAMETER and not a clock read inside — the same rule
 * rooms.ts and limiter.ts follow — and here it buys something specific: it is
 * what lets the test pin the output to a fixed vector computed by openssl,
 * which is the only assertion in the repository capable of catching a drift
 * between what this mints and what coturn accepts.
 */
export function turnCredential(
  secret: string,
  roomCode: string,
  slot: PeerInfo['slot'],
  nowSeconds: number,
): TurnCredential {
  const expiry = Math.floor(nowSeconds) + TTL_SECONDS;
  // The layout coturn parses: everything up to the first colon is the unix
  // expiry it enforces, and the rest is opaque to it and ours to use.
  const username = `${expiry}:${roomCode}:${slot}`;
  const credential = createHmac('sha1', secret).update(username).digest('base64');
  // Three fields and no more. A fourth is how the secret would get out.
  return { username, credential, ttl: TTL_SECONDS };
}

/**
 * The ICE servers a peer builds its connection from.
 *
 * OUR STUN FIRST, THE PUBLIC ONE SECOND, AND BOTH ALWAYS (C-8). The public
 * entry is an ADDITIONAL source of a reflexive candidate and never a
 * replacement: a second opinion on our own public endpoint costs nothing, and
 * it covers the minute our STUN is restarting. Dropping ours in favour of it
 * would put a third party in the path of every room this game ever opens.
 *
 * The relay URLs only appear when there is a credential to go with them. UDP
 * first because it is the one that performs; TCP exists for the networks that
 * drop UDP outright, which is the population relay was bought for.
 *
 * NO `turns:` URL, AND THE ABSENCE IS A DECISION, NOT AN OVERSIGHT. TURN over
 * TLS on 5349 is declared in ops/turnserver.conf, but a TLS listener only
 * completes a handshake with a certificate that config does not yet name: the
 * box's certificate is renewed by Caddy inside a directory the coturn user
 * cannot read, and the step that copies it out on every renewal is not in the
 * runbook (§12) — it is an operational decision that has not been taken. A
 * `turns:` URL advertised without it would make every browser try the port
 * and fail, and fail precisely for the population it exists for: the network
 * that lets nothing but TLS through. When the certificate step lands, the URL
 * comes back here as one line, and tests/turn.test.ts asks for three again.
 * 5349 and not 443 either way, because ops/turnserver.conf records that 443
 * belongs to Caddy and names the two ways out if that ever has to change.
 */
export function iceServers(domain: string, cred: TurnCredential | null): IceServer[] {
  const servers: IceServer[] = [
    { urls: [`stun:${domain}:3478`] },
    { urls: ['stun:stun.l.google.com:19302'] },
  ];

  if (cred !== null) {
    servers.push({
      urls: [
        `turn:${domain}:3478?transport=udp`,
        `turn:${domain}:3478?transport=tcp`,
      ],
      username: cred.username,
      credential: cred.credential,
    });
  }

  return servers;
}
