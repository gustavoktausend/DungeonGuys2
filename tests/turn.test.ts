// turn.test.ts — the ephemeral TURN credential, pinned to a vector computed
// OUTSIDE the code under test.
//
// This file sits in the Node-typed program of apps/server/tsconfig.json (and is
// excluded from the root one, in the same commit) because it imports
// node:crypto to recompute the vector by hand. That import is the whole reason
// the pair of tsconfig entries exists here: a test that recomputed the HMAC by
// calling turnCredential would be asserting that a function equals itself.
//
// The literal below was produced once, by two independent tools that agreed,
// and it is checked in so the assertion is auditable without running anything:
//
//   printf '%s' '1756003600:ABCDEF:p1' \
//     | openssl dgst -sha1 -hmac 'segredo-de-teste' -binary | openssl base64
//
// WHY A VECTOR AND NOT A ROUND TRIP. coturn is the other half of this
// computation and it is not in this repository. If the username layout, the
// digest or the encoding drifted, every test that compared our output to our
// own output would stay green while `use-auth-secret` on the box rejected every
// single credential — and the symptom is "one friend never gets in", which is
// indistinguishable from bad NAT. The vector is what makes that drift visible
// here instead of there.
import { describe, it, expect } from 'vitest';
import { createHmac } from 'node:crypto';
import {
  iceServers,
  NO_TURN,
  TTL_SECONDS,
  turnCredential,
} from '../apps/server/src/signaling/turn';

/** The secret of the vector. Never a real one — see env.ts for where those live. */
const SECRET = 'segredo-de-teste';
/** Chosen so the expiry is a round number: 1756000000 + 3600. */
const NOW_SECONDS = 1_756_000_000;
const EXPECTED_USERNAME = '1756003600:ABCDEF:p1';
const EXPECTED_CREDENTIAL = 'AuH1uQQpb2Nf9yhX3BCTz3dWt5w=';

const DOMAIN = 'dg2.example';

describe('turnCredential — TURN REST API (D3-10, SALA-04)', () => {
  it('o username é <expiry>:<code>:<slot>, com expiry uma hora à frente', () => {
    const cred = turnCredential(SECRET, 'ABCDEF', 'p1', NOW_SECONDS);

    expect(cred.username).toBe(EXPECTED_USERNAME);
    // coturn parses the part before the first colon as a unix expiry and
    // refuses the credential once it has passed. Everything after is opaque to
    // it and is ours: the room and the slot are there so a leaked pair cannot
    // outlive the session it was issued for, and so a journal line can be tied
    // back to a room without storing anything.
    expect(Number(cred.username.split(':')[0])).toBe(NOW_SECONDS + TTL_SECONDS);
    expect(TTL_SECONDS).toBe(3600);
  });

  it('a credencial bate com o vetor conhecido, calculado fora deste código', () => {
    const cred = turnCredential(SECRET, 'ABCDEF', 'p1', NOW_SECONDS);
    expect(cred.credential).toBe(EXPECTED_CREDENTIAL);
  });

  it('o vetor recomputado à mão com node:crypto confirma o literal', () => {
    // Anti-vacuity for the assertion above: if someone re-baselines the literal
    // from the implementation's own output, this line still holds it to
    // HMAC-SHA1/base64 over that exact username — which is what coturn does.
    const byHand = createHmac('sha1', SECRET).update(EXPECTED_USERNAME).digest('base64');
    expect(byHand).toBe(EXPECTED_CREDENTIAL);
  });

  it('dois segredos diferentes produzem credenciais diferentes', () => {
    const a = turnCredential(SECRET, 'ABCDEF', 'p1', NOW_SECONDS);
    const b = turnCredential('outro-segredo', 'ABCDEF', 'p1', NOW_SECONDS);

    // Same username, different key. If these matched, the credential would not
    // be a function of the secret at all and every relay on the internet would
    // accept it.
    expect(b.username).toBe(a.username);
    expect(b.credential).not.toBe(a.credential);
  });

  it('o segredo não aparece em nenhum campo do resultado (T-3-23)', () => {
    const cred = turnCredential(SECRET, 'ABCDEF', 'p1', NOW_SECONDS);

    // The client receives this object verbatim. A secret that leaked into it
    // would let any player mint credentials for any room, forever, and the
    // only repair would be rotating the secret in two files on the box.
    expect(JSON.stringify(cred)).not.toContain(SECRET);
    for (const value of Object.values(cred)) {
      expect(String(value)).not.toContain(SECRET);
    }
    // And the shape is exactly the three fields the wire declares — a fourth
    // one is how a secret would get out.
    expect(Object.keys(cred).sort()).toEqual(['credential', 'ttl', 'username']);
  });

  it('ttl é relativo em segundos, não um instante absoluto', () => {
    const cred = turnCredential(SECRET, 'ABCDEF', 'p1', NOW_SECONDS);
    // An absolute time would make the client depend on its own clock agreeing
    // with the server's, which is the one assumption a browser cannot make.
    expect(cred.ttl).toBe(3600);
    expect(cred.ttl).not.toBe(NOW_SECONDS + TTL_SECONDS);
  });

  it('não captura relógio nenhum: o mesmo nowSeconds devolve a mesma credencial', () => {
    // The clock is a PARAMETER. That is what lets the vector above be a fixed
    // literal, and it is the same rule rooms.ts and limiter.ts already follow.
    const a = turnCredential(SECRET, 'ABCDEF', 'p1', NOW_SECONDS);
    const b = turnCredential(SECRET, 'ABCDEF', 'p1', NOW_SECONDS);
    expect(b).toEqual(a);
  });

  it('a credencial é amarrada à sala e ao slot', () => {
    const a = turnCredential(SECRET, 'ABCDEF', 'p1', NOW_SECONDS);
    const outraSala = turnCredential(SECRET, 'GHJKMN', 'p1', NOW_SECONDS);
    const outroSlot = turnCredential(SECRET, 'ABCDEF', 'p2', NOW_SECONDS);

    expect(outraSala.credential).not.toBe(a.credential);
    expect(outroSlot.credential).not.toBe(a.credential);
  });

  it('NO_TURN é a ausência de credencial, e não uma credencial vazia válida', () => {
    // What the server sends when there is no secret. ttl 0 is the signal: a
    // client that treated this as usable would offer coturn an empty username
    // and read the refusal as a network failure.
    expect(NO_TURN.ttl).toBe(0);
    expect(NO_TURN.username).toBe('');
    expect(NO_TURN.credential).toBe('');
  });
});

describe('iceServers — o STUN público é adicional, nunca substituto (C-8)', () => {
  it('sem credencial devolve exatamente dois servidores, e nenhum de relay', () => {
    const servers = iceServers(DOMAIN, null);

    expect(servers).toHaveLength(2);
    const urls = servers.flatMap(s => s.urls);
    expect(urls).toContain(`stun:${DOMAIN}:3478`);
    expect(urls).toContain('stun:stun.l.google.com:19302');
    // This is the shape the server serves when DG2_TURN_SECRET is absent, and
    // it is enough to discover a reflexive candidate and therefore enough for
    // two peers on ordinary NATs. It is NOT enough for symmetric NAT or CGNAT,
    // which is the entire reason the relay exists.
    expect(urls.some(u => u.startsWith('turn:') || u.startsWith('turns:'))).toBe(false);
  });

  it('o nosso STUN e o público estão os dois lá, e nessa ordem', () => {
    const servers = iceServers(DOMAIN, null);
    // Ours first: a second opinion on the reflexive candidate costs nothing and
    // covers the minute our own STUN is restarting, but it is the second
    // opinion. Dropping ours in favour of the public one would put a dependency
    // on a third party in the path of every room.
    expect(servers[0]?.urls).toEqual([`stun:${DOMAIN}:3478`]);
    expect(servers[1]?.urls).toEqual(['stun:stun.l.google.com:19302']);
  });

  it('com credencial devolve três, e o terceiro tem as duas URLs do relay — e nenhuma turns:', () => {
    const cred = turnCredential(SECRET, 'ABCDEF', 'p1', NOW_SECONDS);
    const servers = iceServers(DOMAIN, cred);

    expect(servers).toHaveLength(3);
    // UDP first because it is the one that performs; TCP is there for the
    // networks that drop UDP outright, which is the case relay exists for.
    expect(servers[2]?.urls).toEqual([
      `turn:${DOMAIN}:3478?transport=udp`,
      `turn:${DOMAIN}:3478?transport=tcp`,
    ]);
    // NO turns: UNTIL THE CONFIG NAMES A CERTIFICATE (WR-09). A TLS listener
    // without cert/pkey never completes a handshake, so advertising the URL
    // would send every browser to try 5349 and fail — and fail precisely for
    // the network that lets nothing but TLS through, which is the population
    // the URL would exist for. The day ops/README.md §12 gets the certificate
    // step, this assertion flips back to three URLs in the same commit.
    expect(servers.flatMap((s) => s.urls).some((u) => u.startsWith('turns:'))).toBe(false);
  });

  it('a credencial viaja no terceiro servidor, e o segredo não viaja em nenhum', () => {
    const cred = turnCredential(SECRET, 'ABCDEF', 'p1', NOW_SECONDS);
    const servers = iceServers(DOMAIN, cred);

    expect(servers[2]?.username).toBe(EXPECTED_USERNAME);
    expect(servers[2]?.credential).toBe(EXPECTED_CREDENTIAL);
    // The whole object goes to the browser inside `created`/`joined`.
    expect(JSON.stringify(servers)).not.toContain(SECRET);
    // And the two STUN entries carry no credential at all: STUN does not
    // authenticate, so a username there would be a secret published for nothing.
    expect(servers[0]?.username).toBeUndefined();
    expect(servers[1]?.username).toBeUndefined();
  });
});
