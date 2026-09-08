// transport.ts — the one interface every message of this game crosses.
//
// FORM-12 — EVERY MESSAGE CROSSES EXACTLY ONE HOP, AND THE FAR END OF THAT HOP
// IS THE AUTHORITY. There is deliberately no `broadcast` on this interface, and
// the absence is the design, not an omission: a broadcast is what lets calling
// code stop thinking about legs, and the day the authority moves from a
// player's machine onto a dedicated server the legs are the ONLY thing that
// does not change. Sending to three peers is a loop over three sends, written
// in the place where the loop means something.
//
// tests/net-vocabulary.test.ts asserts that absence against the compiled text
// of this file, so the rule survives the reviewer who is tired.
//
// WHY AN INTERFACE AT ALL. Everything above this line — the lobby, the pinger,
// and from phase 4 the input and snapshot pumps — talks to this type and never
// to an `RTCDataChannel`. That is what makes `local.ts` (in-process),
// `lossy.ts` (seeded fault injection) and, later, `rtc.ts` and a server leg
// interchangeable by CONSTRUCTOR, and it is what lets the room's rules be
// proved in Node with no browser, no signalling server and no box.
//
// WHERE THIS DIRECTORY LIVES (D3-12). `src/net/` is at the repository root,
// next to `src/app/` and `src/ui/`, because `apps/web` still does not exist:
// the first real deploy has not run, and moving `dist/` plus the rsync,
// Playwright and CI paths before it does would retarget a test that has not
// happened yet. This directory moves together with the rest of the client when
// that day comes — reassess after plan 02-12.
import type { ChannelClass } from '@dg2/protocol';

/**
 * A transport handle: the name of one CONNECTION.
 *
 * It dies with that connection, and a reconnect produces a new one for the
 * same player. It therefore NEVER enters the `World` and never reaches the
 * simulation or a replay (ADR 0001, the three identity spaces): the seat a
 * player occupies is `p0..p3`, owned by the authority, and the durable
 * identity is the account id, owned by the account server. Burning those three
 * into one field is what would make a reconnect look like a change of identity
 * in the middle of a run.
 */
export type PeerId = string;

/**
 * Every subscribe returns its own unsubscribe.
 *
 * No `removeListener(cb)` by identity: an unsubscribe keyed on the function
 * object breaks the moment a caller subscribes a bound method or an arrow it
 * did not keep, and it fails SILENTLY — the listener stays and keeps firing
 * against state its owner has already torn down.
 */
export type Unsubscribe = () => void;

/**
 * Arms a ONE-SHOT deadline and returns the way to cancel it.
 *
 * Every module in this directory that needs "later" takes one of these as an
 * argument instead of reaching for a platform timer, for the reason
 * apps/server/src/shutdown.ts wrote down when it made `startWatchdog` a
 * parameter: a test that had to WAIT for a real deadline would be a slow test
 * asserting a clock instead of asserting a sequence. The lobby's one-second
 * emission and the pinger's one-second interval both re-arm this after each
 * firing rather than asking for a repeating timer — a repeating timer whose
 * callback throws keeps firing, and one that overruns stacks up.
 *
 * It lives HERE, next to `Unsubscribe`, because it returns one and because the
 * alternative — declaring it in lobby.ts or ping.ts — would make those two
 * import each other for the sake of a type alias.
 */
export type Schedule = (fn: () => void, ms: number) => Unsubscribe;

/**
 * The whole surface. Six members, and each one is here because something above
 * cannot be written without it.
 *
 * `payload` is an `ArrayBuffer` and not a typed message on purpose. The codec
 * in @dg2/protocol already owns the framing, and a structured type here would
 * make the transport know the protocol — which is exactly the knowledge that
 * has to stay out if swapping the transport is to remain a swap.
 */
export interface Transport {
  /** Sends to exactly one peer, on one delivery class. Never fans out. */
  send(to: PeerId, payload: ArrayBuffer, ch: ChannelClass): void;
  onMessage(cb: (from: PeerId, payload: ArrayBuffer, ch: ChannelClass) => void): Unsubscribe;
  onPeerJoin(cb: (peer: PeerId) => void): Unsubscribe;
  onPeerLeave(cb: (peer: PeerId, reason: string) => void): Unsubscribe;
  /**
   * The latest application-level round trip to `peer` in ms, or null while it
   * is unmeasured.
   *
   * APPLICATION-LEVEL, which means the `ping`/`pong` of `MSG_KIND` on the
   * unreliable channel (D3-13) and not `getStats()`. See ping.ts for why those
   * are two different numbers and why the screen shows this one.
   */
  rtt(peer: PeerId): number | null;
  /** Stops delivery and lets the far ends know. Calling it twice is a no-op. */
  close(): void;
}
