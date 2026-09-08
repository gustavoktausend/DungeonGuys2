// room.ts — the room, lobby and divergence screens, plus the network badge.
//
// THESE ARE THE FIRST SCREENS IN THE GAME DRIVEN BY NETWORK STATE INSTEAD OF BY
// THE `World`, AND THAT INVERSION IS THE MOST IMPORTANT LINE IN THIS FILE.
// Everything in ui/screens.ts reads the simulation once per frame —
// `syncScreens(w, id)` polls `w.phase` and paints from it — because until now
// the simulation was the only source of truth there was. Here there is no
// simulation at all: none exists until `startRun` hands out the run manifest,
// and by then this module's job is over. Anyone arriving here looking for the
// object screens.ts reads will not find one, and will conclude something is
// missing. Nothing is missing. The truth of these screens is the last
// `lobbyState` the authority sent, which net/lobby.ts keeps and this file
// paints. The same paragraph is at the top of net/lobby.ts, from the other
// side.
//
// WHY THIS MODULE IMPORTS NEITHER ui/dom.ts NOR render/sprites.ts. Both touch
// the platform the instant they are loaded — dom.ts resolves a hundred elements
// and sprites.ts constructs an `Image` — and importing either would make this
// file unloadable outside a browser. Its elements and its two drawing
// capabilities arrive as arguments to `initRoom` instead, in the same shape as
// `open(url)` in net/signaling.ts, `createConnection(config)` in net/rtc.ts and
// `startWatchdog` in apps/server/src/shutdown.ts. That is what lets
// tests/room-ui.test.ts call the pure half of this screen under Node, with no
// jsdom and no browser, and it is why those parameters must not be "tidied"
// into top-level imports.
//
// THE RULES THIS VIEW ENCODES, each with the decision behind it:
//
//   D3-02  THE ROOM DIES WITH WHOEVER CREATED IT, so `▶ INICIAR` is ABSENT from
//          the DOM for a guest rather than disabled. A disabled button invites a
//          click and a question about an asymmetry that is permanent. Leaving as
//          the authority is a two-click confirmation with no `confirm()`.
//   D3-03  REPEATED CLASSES ARE NORMAL. Two mages get no warning, no mark and no
//          different colour — the clothing colour and the name tell them apart.
//   D3-04  No ready state and no timer. Solo starts.
//   D3-07  "COPIAR LINK" builds the link FROM THE ROOM CODE, never from the
//          address bar, so the relay debug flag cannot ride along in a link
//          somebody shares (T-3-29).
//   D3-15  One badge, alive from the moment a room session exists.
//
// TEXT ONLY THROUGH textContent, NEVER THROUGH MARKUP. The name and the class of
// every other seat arrive from a remote machine over WebRTC, which makes them
// exactly the "remotely authored content" the comment in ui/screens.ts:56-71
// already names THIS phase as the reason for; and from phase 6 this origin
// holds a session cookie with no CSP in front of it. Assigning a concatenated
// string to the markup property of any node here would be a stored-XSS sink
// (T-3-14) — which is why the property is not named anywhere in this file, and
// why tests/room-ui.test.ts greps for it rather than trusting the habit.
//
// THE CARDS ARE BUILT ONCE AND PATCHED IN PLACE. Four canvases recreated once a
// second is GC litter and a visible flicker; the template is the phase gate of
// screens.ts:149-152. And unlike #color-preview (settings.ts:136-141) there is
// no timer here at all: four idle-frame-0 avatars communicate everything the
// lobby has to say, and animating them would communicate nothing more.
import { normalizeRoomCode } from '@dg2/protocol';
import type { IceRoute, RejectReason, SignalMessage, Versions } from '@dg2/protocol';
import { CLASS_KEY } from '@dg2/protocol';
import type { ClassKey, ForgeLevels, GameMode, PlayerSlot, RunConfig } from '@dg2/sim';
import {
  createLobby, LOBBY_EMIT_MS,
  type Lobby, type LobbyView, type OccupantView, type Rgb,
} from '../net/lobby';
import {
  BAD_CODE_MESSAGE, createSignalingClient, SignalRefused,
  type RoomEntry, type SignalingClient, type SocketLike,
} from '../net/signaling';
import { createRtcTransport, type RtcSignal, type RtcTransport } from '../net/rtc';
import { clearRelayFlag, routeOf, type StorageLike } from '../net/ice';
import type { Schedule } from '../net/transport';
// Namespace import on purpose, and it must stay one: the acceptance criterion of
// plan 03-09 allows the name of the keyboard-click guard to appear exactly once
// in this file, and a named import would spend that single occurrence on the
// import line instead of on the one button that needs it. The perífrase is the
// same device net/rtc.ts uses for the option it may not spell.
import * as domGuards from './events';

// ─── Copy (03-UI-SPEC § Copywriting Contract, verbatim) ──────────────────────
// Every string a player reads lives here, once. The contract is the single
// source of screen text for this phase, and a literal buried in a branch is how
// two spellings of one sentence get shipped.

const COPY = {
  connecting: 'Conectando…',
  badCode: 'Não existe sala com esse código. Confira as letras e tente de novo.',
  roomFull: 'Essa sala já está com quatro jogadores.',
  roomClosed: 'Essa sala não existe mais.',
  serverDown: 'Não consegui falar com o servidor. Tente de novo em instantes.',
  rtcFailed: 'Não consegui conectar com quem criou a sala.',
  roomDead: 'Quem criou a sala saiu. A sala acabou.',
  linkCopied: 'Link copiado.',
  copyFailed: 'Não consegui copiar. Selecione o link e copie à mão.',
  empty: 'VAZIO',
  connectingSeat: 'conectando',
  silent: 'sem resposta',
  chipSelf: 'VOCÊ',
  chipAuthority: 'CRIOU A SALA',
  leave: '✕ SAIR DA SALA',
  leaveConfirm: '✕ SAIR MESMO? A SALA ACABA',
  modeCampaign: 'MODO · CAMPANHA',
  modeEndless: 'MODO · SEM FIM',
  joined: (name: string) => `${name} entrou.`,
  left: (name: string) => `${name} saiu.`,
  /** The one and only toast this phase raises — see `deps.announce` below. */
  roomOver: 'SALA ENCERRADA',
} as const;

/** The refusal table of REJECT_REASON, in the words of the contract. */
const REFUSAL_COPY: Record<RejectReason, string> = {
  badCode: COPY.badCode,
  roomFull: COPY.roomFull,
  roomClosed: COPY.roomClosed,
  protocolVersion: '',
  simVersion: '',
};

/** A version refusal carries BOTH numbers, because "incompatible" alone costs an
 *  hour every time it is read (D-08). `ours` is structural; `theirs` travels in
 *  the server's free text, which is never branched on. */
function versionRefusal(reason: RejectReason, detail: string, ours: Versions): string {
  const mine = reason === 'simVersion' ? ours.sim : ours.protocol;
  const what = reason === 'simVersion' ? 'Versões do jogo diferentes' : 'Versões diferentes';
  return `${what}: a sua é ${mine}. ${detail} Recarregue a página e tente de novo.`;
}

// ─── The pure half ───────────────────────────────────────────────────────────
// Everything below this line is a function of its arguments, exported so that
// tests/room-ui.test.ts can call it under Node. None of it touches an element.

/** The display cut, in CODE POINTS. */
export const NAME_MAX_CODE_POINTS = 12;

/**
 * A remote name, cut to fit.
 *
 * By code point and not by `String.slice`, which counts UTF-16 units: twelve
 * emoji are twenty-four units, and a cut at unit twelve splits a surrogate pair
 * into half a character that renders as a replacement glyph. `heroName()`
 * (settings.ts:200-203) already bounds the LOCAL name; nothing bounds the one
 * that arrived from a peer, and the CSS ellipsis alone would not stop a long
 * name from costing layout work every second (T-3-34).
 */
export function clipName(name: string): string {
  const points = [...name];
  return points.length <= NAME_MAX_CODE_POINTS
    ? name
    : points.slice(0, NAME_MAX_CODE_POINTS).join('');
}

/**
 * The avatar cache key: class and colour, and nothing else.
 *
 * Two seats wearing the same class in different colours are two different
 * canvases (D3-06), and a repaint happens only when this string changes.
 */
export function avatarKey(cls: string, rgb: readonly [number, number, number]): string {
  return `${cls}|${rgb[0]},${rgb[1]},${rgb[2]}`;
}

/**
 * The status class for a round-trip time.
 *
 * Reuses `.fx-pos` / `.fx-neg`, already declared (style.css:1344-1345). THE
 * COLOUR IS NEVER THE ONLY SIGNAL — the red band is below AA for small text on
 * this panel, and 03-UI-SPEC keeps it with that written mitigation: the line
 * always also says the number, or says why there is none. No measurement reads
 * as bad rather than as good, because the reassuring direction is the one
 * nobody investigates.
 */
export function pingBand(ping: number | null): string {
  if (ping === null) return 'fx-neg';
  if (ping <= 80) return 'fx-pos';
  return ping <= 150 ? '' : 'fx-neg';
}

/** "direto" / "relay" in full words. Relay is not an error — it is the path
 *  working — so neither gets an icon or a colour of its own. */
function routeWord(route: IceRoute): string {
  return route === 'relay' ? 'relay' : 'direto';
}

/**
 * The ping line of one seat.
 *
 * `unknown` prints the number ALONE, and that case is still real now that the
 * route IS wired in: it is what a seat reads while the first `getStats()` has
 * not come back, and what it keeps if the statistics never become legible.
 * Saying "direto" for a route this machine has not measured would be a claim it
 * cannot make, and the wrong half of that claim is the reassuring one.
 */
export function slotLine(o: Pick<OccupantView, 'connected' | 'ping' | 'route'>): string {
  if (!o.connected) return COPY.connectingSeat;
  if (o.ping === null) return COPY.silent;
  return o.route === 'unknown' ? `${o.ping} ms` : `${o.ping} ms · ${routeWord(o.route)}`;
}

/**
 * What the network badge says (D3-15).
 *
 * A guest reports its own link. The authority reports the WORST of the links it
 * holds, because one number for a star of three legs can only honestly be the
 * worst one — and nothing at all when it is alone, which prints as `—`.
 *
 * `—` also covers the window before the first `pong`. It deliberately does not
 * say "sem resposta" there: the badge has one line and no room to distinguish
 * "not measured yet" from "measured and silent". The seat card, which has the
 * room, makes that distinction.
 */
export function badgeLine(view: LobbyView): string {
  const others = view.occupants.filter((o) => o.peerId !== view.selfPeerId);
  if (!view.isAuthority) {
    const mine = view.occupants.find((o) => o.peerId === view.selfPeerId);
    return mine && mine.ping !== null ? slotLine(mine) : '—';
  }
  const measured = others.filter((o) => o.connected && o.ping !== null);
  if (measured.length === 0) return '—';
  let worst = measured[0];
  for (const o of measured) if ((o.ping ?? 0) > (worst.ping ?? 0)) worst = o;
  return `pior ${slotLine(worst)}`;
}

/**
 * The invite link, built FROM THE ROOM CODE (D3-07).
 *
 * Never from the address bar: a link copied out of `location` would carry
 * `?ice=relay` to everyone the player shares it with, and each of them would
 * route through the TURN server without ever being told (T-3-29). Anything
 * already after `?` or `#` in the base is dropped for the same reason.
 */
export function inviteLink(base: string, code: string): string {
  const clean = base.split('?')[0].split('#')[0];
  return `${clean}?sala=${code}`;
}

// ─── The wiring ──────────────────────────────────────────────────────────────

/** The elements this module paints. `ui/dom.ts` satisfies it structurally. */
export interface RoomElements {
  btnCreateRoom: HTMLButtonElement;
  joinCode: HTMLInputElement;
  btnJoinRoom: HTMLButtonElement;
  btnRetryJoin: HTMLButtonElement;
  roomStatus: HTMLElement;
  roomError: HTMLElement;
  btnRoomBack: HTMLElement;
  lobbyCode: HTMLElement;
  lobbyLink: HTMLInputElement;
  btnCopyLink: HTMLElement;
  lobbySlots: HTMLElement;
  lobbyEmptyHint: HTMLElement;
  lobbyClass: HTMLElement;
  lobbyMode: HTMLElement;
  lobbyStatus: HTMLElement;
  btnStartRun: HTMLElement;
  btnLeaveRoom: HTMLElement;
  desyncOurs: HTMLElement;
  desyncTheirs: HTMLElement;
  btnDesyncClose: HTMLElement;
  netBadge: HTMLElement;
  netRoute: HTMLElement;
  btnRelayFlag: HTMLElement;
}

/** Who this machine plays as, read once when a room is created or joined. */
export interface RoomIdentity {
  accountId: string;
  name: string;
  cls: ClassKey;
  forge: ForgeLevels;
  mode: GameMode;
}

export interface RoomDeps {
  el: RoomElements;
  /** render/sprites.ts's PURE recolor. Never `recolorPlayerSheet`: that one
   *  writes the sheet the whole run draws from. */
  recolorSheet: (cls: ClassKey, rgb: Rgb) => CanvasImageSource;
  /** The idle-0 frame of a class on its own atlas: [sx, sy, sw, sh]. */
  idleFrame: (cls: ClassKey) => readonly [number, number, number, number];
  showScreen: (name: string | null) => void;
  /** RESERVED FOR ONE CASE, and it is not decoration that it is a dependency:
   *  `announce` is a 2600 ms toast at 44px in the exact centre of the screen
   *  (style.css:1065-1079), so using it for lobby chatter would cover the seats.
   *  Room state changes go to #lobby-status instead. This is for the room dying
   *  under the player, when the screen changes beneath them (D3-02). */
  announce: (text: string) => void;
  identity: () => RoomIdentity;
  colorFor: (cls: ClassKey) => Rgb;
  versions: Versions;
  signalingUrl: string;
  openSocket: (url: string) => SocketLike;
  createConnection: (config: RTCConfiguration) => RTCPeerConnection;
  storage: StorageLike;
  /** The debug flag, already read once at boot by net/ice.ts. */
  forceRelay: boolean;
  /** `location.origin + BASE_URL`, passed in so no line here reads the bar. */
  inviteBase: string;
  now: () => number;
  schedule: Schedule;
  /**
   * A fresh run seed, as a uint32.
   *
   * A dependency and not a `Math.random()` here, for the same reason `now` and
   * `schedule` are: this module has to stay callable under Node without the
   * platform, and the seed is the ONE value of a run that is allowed to be
   * non-deterministic — so where it comes from is a decision the caller makes
   * out loud (main.ts draws it from `crypto.getRandomValues`).
   */
  newSeed: () => number;
  log: (event: string, fields?: Record<string, unknown>) => void;
  /**
   * The run manifest AND the seat this machine was given, once the room starts.
   *
   * Two arguments because the manifest cannot name us: `RunConfig` describes
   * `p0..p3` and nothing in it says which one is this machine — `peerId` never
   * enters the simulation (ADR 0001). net/lobby.ts is what knows both.
   */
  onStart: (config: RunConfig, slot: PlayerSlot) => void;
  /**
   * The way out of a run this module ended.
   *
   * The SAME exit the pause screen uses, and that is the whole point: a run
   * whose world disagrees with the room's has to be torn down, not covered by
   * a modal. A second teardown path would be a second one to get wrong.
   */
  onQuit: () => void;
  /** The badge's ✕ turns the flag off and reloads, because the ICE policy is
   *  fixed when the connection is constructed. */
  reload: () => void;
}

export interface RoomFlow {
  /** Opens the room screen. `prefill` comes from a `?sala=` deep link. */
  open(prefill?: string | null): void;
  /** Once per rendered frame, from main.ts's `frame()`. Touches no `World`. */
  paintBadge(): void;
  /** The two hashes of a tick-0 divergence (D3-05). Plan 03-10 calls it. */
  showDesync(ours: string, theirs: string): void;
  /** Tears the session down. Safe to call when there is none. */
  leave(): void;
}

interface SlotCard {
  root: HTMLElement;
  canvas: HTMLCanvasElement;
  name: HTMLElement;
  cls: HTMLElement;
  ping: HTMLElement;
  chipSelf: HTMLElement;
  chipAuthority: HTMLElement;
}

/** Seats in a room. Four, because the width of a room is a decision. */
const SEATS = 4;

/** The scale #color-preview uses (settings.ts:113-124), on a canvas of the same
 *  48x56 — reused rather than recalibrated. */
const AVATAR_SCALE = 1.7;

/** How long a transient line stays in #lobby-status before it is cleared. */
const STATUS_CLEAR_MS = 3000;

export function initRoom(deps: RoomDeps): RoomFlow {
  const el = deps.el;

  /** One canvas per class+colour, painted only when the key changes. */
  const sheets = new Map<string, CanvasImageSource>();
  const slotCards: SlotCard[] = [];
  const classCards = new Map<ClassKey, HTMLElement>();

  let client: SignalingClient | null = null;
  let transport: RtcTransport | null = null;
  let lobby: Lobby | null = null;
  let lastView: LobbyView | null = null;
  /** Names by peer, so "{NOME} saiu." can be said about someone already gone. */
  const knownNames = new Map<string, string>();
  let cancelStatus: (() => void) | null = null;
  let cancelLeaveReset: (() => void) | null = null;
  let cancelRouteProbe: (() => void) | null = null;
  let leaveArmed = false;
  let busy = false;

  // ── The room screen ────────────────────────────────────────────────────────

  function setBusy(on: boolean): void {
    busy = on;
    el.btnCreateRoom.disabled = on;
    el.btnJoinRoom.disabled = on;
    el.joinCode.readOnly = on;
  }

  function say(status: string, error: string): void {
    el.roomStatus.textContent = status;
    el.roomError.textContent = error;
  }

  function offerRetry(on: boolean): void {
    // While the retry is on screen the ordinary join button steps aside, so the
    // player is not offered two spellings of the same action (03-UI-SPEC #1).
    el.btnRetryJoin.classList.toggle('hidden', !on);
    el.btnJoinRoom.classList.toggle('hidden', on);
  }

  function open(prefill?: string | null): void {
    leave();
    setBusy(false);
    offerRetry(false);
    if (prefill) {
      el.joinCode.value = prefill;
      say('', '');
      deps.showScreen('room');
      // Coming from a link, the action the player wants is the one the link is
      // for — and the join is NOT fired for them; they confirm it (D3-07).
      el.btnJoinRoom.focus();
      return;
    }
    say('', '');
    deps.showScreen('room');
    // Mandatory, not courtesy: settings.ts:32-35 blurs every clicked button, so
    // a keyboard player loses their place on every action unless each screen
    // puts the focus back when it opens.
    el.btnCreateRoom.focus();
  }

  function fail(error: unknown, retryable: boolean): void {
    setBusy(false);
    if (error instanceof SignalRefused) {
      const text = error.reason === 'protocolVersion' || error.reason === 'simVersion'
        ? versionRefusal(error.reason, error.detail, error.ours)
        : REFUSAL_COPY[error.reason] || error.detail;
      say('', text);
      // A refusal sends the player back to the field they can fix.
      el.joinCode.focus();
      return;
    }
    say('', retryable ? COPY.rtcFailed : COPY.serverDown);
    offerRetry(retryable);
    if (retryable) el.btnRetryJoin.focus();
    deps.log('sala-falhou', { erro: String(error) });
  }

  function openSignaling(): SignalingClient {
    if (client) return client;
    client = createSignalingClient({
      url: deps.signalingUrl,
      open: deps.openSocket,
      log: deps.log,
      now: deps.now,
      schedule: deps.schedule,
    });
    return client;
  }

  async function createRoom(): Promise<void> {
    if (busy) return;
    const who = deps.identity();
    setBusy(true);
    say(COPY.connecting, '');
    try {
      const c = openSignaling();
      enter(await c.create({ accountId: who.accountId, name: who.name, versions: deps.versions }), true, who);
    } catch (error) {
      fail(error, false);
    }
  }

  async function joinRoom(): Promise<void> {
    if (busy) return;
    // Refused here, before it leaves the machine: a typo should cost neither a
    // round trip nor a token of the join rate limit that makes six characters
    // enough (T-3-01). net/signaling.ts refuses it again on its own — this is
    // the copy, not the check.
    const code = normalizeRoomCode(el.joinCode.value);
    if (code === null) { say('', BAD_CODE_MESSAGE); el.joinCode.focus(); return; }
    const who = deps.identity();
    setBusy(true);
    offerRetry(false);
    say(COPY.connecting, '');
    try {
      const c = openSignaling();
      enter(await c.join(code, { accountId: who.accountId, name: who.name, versions: deps.versions }), false, who);
    } catch (error) {
      fail(error, error instanceof SignalRefused ? false : true);
    }
  }

  // ── The session ────────────────────────────────────────────────────────────

  function enter(joined: RoomEntry, authority: boolean, who: RoomIdentity): void {
    const c = client;
    if (!c) return;
    setBusy(false);

    const rtc = createRtcTransport({
      authority,
      selfId: joined.peerId,
      // Structurally compatible by construction (protocol/signaling.ts:44-46);
      // the cast is only over `readonly`, which the DOM type does not spell.
      iceServers: joined.ice.iceServers as unknown as readonly RTCIceServer[],
      forceRelay: deps.forceRelay,
      createConnection: deps.createConnection,
      signal: (message: RtcSignal) => { c.send(message); },
      log: deps.log,
    });
    transport = rtc;

    lobby = createLobby({
      transport: rtc,
      self: {
        peerId: joined.peerId, accountId: who.accountId,
        name: who.name, cls: who.cls, forge: who.forge,
      },
      isAuthority: authority,
      authorityPeerId: joined.authorityPeerId,
      colorFor: deps.colorFor,
      now: deps.now,
      schedule: deps.schedule,
    });

    lobby.onState(paintLobby);
    lobby.onRoomDead(roomDead);
    lobby.onRejected((reason) => {
      teardown();
      say('', REFUSAL_COPY[reason] || COPY.roomClosed);
      deps.showScreen('room');
      el.joinCode.focus();
    });
    lobby.onStart(deps.onStart);
    // Whoever notices shows it, and both ends can be the one that notices.
    lobby.onDesync(showDesync);
    armRouteProbe(rtc, lobby);

    c.onSignal((message: SignalMessage) => {
      if (message.kind === 'offer' || message.kind === 'answer' || message.kind === 'candidate') {
        rtc.accept(message);
        return;
      }
      if (message.kind === 'peers') {
        // The authority is the impolite side and the one that opens the leg
        // (net/rtc.ts): a guest waits for the offer instead of racing it.
        if (!authority) return;
        for (const peer of message.peers) {
          if (peer.peerId !== joined.peerId) rtc.connect(peer.peerId);
        }
        return;
      }
      if (message.kind === 'closed') roomDead();
    });

    knownNames.clear();
    openLobbyScreen(joined);
  }

  function openLobbyScreen(joined: RoomEntry): void {
    el.lobbyCode.textContent = joined.code;
    el.lobbyLink.value = inviteLink(deps.inviteBase, joined.code);
    el.lobbyMode.textContent = deps.identity().mode === 'endless' ? COPY.modeEndless : COPY.modeCampaign;
    el.lobbyStatus.textContent = '';
    buildSlots();
    buildClassCards();
    el.netBadge.classList.remove('hidden');
    el.netRoute.textContent = '—';
    deps.showScreen('lobby');
    // Same reason as the room screen: the focus has to be placed, or the first
    // Tab starts from wherever the last blur left it.
    el.btnCopyLink.focus();
  }

  /**
   * Reads the route of every leg once a second and feeds it back to the lobby.
   *
   * IT LIVES HERE AND NOT IN net/lobby.ts because the route comes off
   * `RTCPeerConnection.getStats()` — asynchronous, and belonging to a transport
   * the lobby deliberately does not know the type of (`local.ts` satisfies the
   * same `Transport` and has no statistics at all). This module holds the real
   * connection, so this is where the question can be asked.
   *
   * ASKED REPEATEDLY AND NOT ONCE. ICE can renominate a pair mid-session — a
   * direct path that fails over to the relay is exactly the event the badge
   * exists to make visible — so a single reading taken at connect time would go
   * stale in the one case that matters. Once a second is the roster's own
   * cadence (D3-16), so the answer is never older than the row it rides in.
   *
   * A guest measures its own leg too, and the lobby drops it: only the
   * authority's roster is relayed. That call is cheap and the alternative is a
   * branch here on a topology this module should not be reasoning about.
   */
  function armRouteProbe(rtc: RtcTransport, active: Lobby): void {
    cancelRouteProbe = deps.schedule(() => {
      cancelRouteProbe = null;
      // The session may have gone while the previous probe was in flight.
      if (lobby !== active) return;
      for (const o of active.state().occupants) {
        if (o.peerId === active.state().selfPeerId || !o.connected) continue;
        const pc = rtc.connectionOf(o.peerId);
        if (!pc) continue;
        void routeOf(pc).then(
          (report) => { if (lobby === active) active.setRoute(o.peerId, report.route); },
          // A failed `getStats()` is a reading that did not happen, not an
          // error the player can act on: the row keeps `'unknown'`, which is
          // exactly what "nobody measured this" is supposed to look like.
          () => {},
        );
      }
      armRouteProbe(rtc, active);
    }, LOBBY_EMIT_MS);
  }

  function roomDead(): void {
    teardown();
    // The single use of the toast in this phase, and the one it was reserved
    // for: the screen changes beneath the player, so something has to say why.
    deps.announce(COPY.roomOver);
    say('', COPY.roomDead);
    deps.showScreen('room');
    el.btnCreateRoom.focus();
  }

  function teardown(): void {
    lobby?.close();
    transport?.close();
    client?.close();
    lobby = null;
    transport = null;
    client = null;
    lastView = null;
    // The badge goes with the session — EXCEPT while the debug flag is on, when
    // it is the only thing telling the player that every connection they make is
    // being forced through the relay. Hiding it with the room is what would turn
    // "the game feels laggy" into an hour of nobody knowing why (RESEARCH #6).
    if (!deps.forceRelay) el.netBadge.classList.add('hidden');
    el.netRoute.textContent = '—';
    cancelStatus?.();
    cancelStatus = null;
    cancelRouteProbe?.();
    cancelRouteProbe = null;
  }

  function leave(): void {
    teardown();
    leaveArmed = false;
    cancelLeaveReset?.();
    cancelLeaveReset = null;
    el.btnLeaveRoom.textContent = COPY.leave;
  }

  // ── The lobby ──────────────────────────────────────────────────────────────

  function element(tag: string, className: string): HTMLElement {
    const node = document.createElement(tag);
    node.className = className;
    return node;
  }

  function buildSlots(): void {
    if (slotCards.length > 0) return; // built once, then patched in place
    for (let i = 0; i < SEATS; i++) {
      const root = element('div', 'lobby-slot');
      const canvas = document.createElement('canvas');
      canvas.className = 'lobby-avatar';
      canvas.width = 48;
      canvas.height = 56;
      const name = element('div', 'lobby-name');
      const cls = element('div', 'lobby-class-name');
      const ping = element('div', 'lobby-ping');
      const chips = element('div', 'lobby-chips');
      const chipSelf = element('span', 'lobby-chip');
      chipSelf.textContent = COPY.chipSelf;
      const chipAuthority = element('span', 'lobby-chip');
      chipAuthority.textContent = COPY.chipAuthority;
      chips.append(chipSelf, chipAuthority);
      root.append(canvas, name, cls, ping, chips);
      slotCards.push({ root, canvas, name, cls, ping, chipSelf, chipAuthority });
    }
    el.lobbySlots.replaceChildren(...slotCards.map((c) => c.root));
  }

  function buildClassCards(): void {
    if (classCards.size > 0) return;
    const cards: HTMLElement[] = [];
    for (const key of CLASS_KEY) {
      const card = element('button', 'lobby-class-card');
      card.textContent = key.toUpperCase();
      card.dataset.class = key;
      cards.push(card);
      classCards.set(key, card);
    }
    el.lobbyClass.replaceChildren(...cards);
  }

  function sheetFor(cls: ClassKey, rgb: Rgb): CanvasImageSource {
    const key = avatarKey(cls, rgb);
    let sheet = sheets.get(key);
    if (!sheet) {
      sheet = deps.recolorSheet(cls, rgb);
      sheets.set(key, sheet);
    }
    return sheet;
  }

  function paintAvatar(card: SlotCard, cls: ClassKey, rgb: Rgb): void {
    const key = avatarKey(cls, rgb);
    if (card.canvas.dataset.key === key) return; // repaint only when it changed
    card.canvas.dataset.key = key;
    const ctx = card.canvas.getContext('2d');
    if (!ctx) return;
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, card.canvas.width, card.canvas.height);
    const [sx, sy, sw, sh] = deps.idleFrame(cls);
    ctx.drawImage(
      sheetFor(cls, rgb), sx, sy, sw, sh,
      (card.canvas.width - sw * AVATAR_SCALE) / 2,
      (card.canvas.height - sh * AVATAR_SCALE) / 2,
      sw * AVATAR_SCALE, sh * AVATAR_SCALE,
    );
  }

  function clearAvatar(card: SlotCard): void {
    if (card.canvas.dataset.key === '') return;
    card.canvas.dataset.key = '';
    card.canvas.getContext('2d')?.clearRect(0, 0, card.canvas.width, card.canvas.height);
  }

  function paintSeat(card: SlotCard, o: OccupantView, view: LobbyView): void {
    card.root.classList.remove('empty');
    card.root.classList.toggle('connecting', !o.connected);
    paintAvatar(card, o.cls, o.color);
    card.name.textContent = clipName(o.name);
    card.cls.textContent = o.cls.toUpperCase();
    card.ping.textContent = slotLine(o);
    card.ping.className = `lobby-ping ${pingBand(o.connected ? o.ping : 0)}`.trim();
    card.chipSelf.style.display = o.peerId === view.selfPeerId ? '' : 'none';
    card.chipAuthority.style.display = o.peerId === view.authorityPeerId ? '' : 'none';
  }

  function paintEmpty(card: SlotCard): void {
    card.root.classList.add('empty');
    card.root.classList.remove('connecting');
    clearAvatar(card);
    card.name.textContent = COPY.empty;
    card.cls.textContent = '';
    card.ping.textContent = '';
    card.ping.className = 'lobby-ping';
    card.chipSelf.style.display = 'none';
    card.chipAuthority.style.display = 'none';
  }

  function announceArrivals(view: LobbyView): void {
    const now = new Map<string, string>();
    for (const o of view.occupants) now.set(o.peerId, clipName(o.name));
    let line = '';
    for (const [peerId, name] of now) {
      if (peerId !== view.selfPeerId && !knownNames.has(peerId)) line = COPY.joined(name);
    }
    for (const [peerId, name] of knownNames) {
      if (!now.has(peerId)) line = COPY.left(name);
    }
    knownNames.clear();
    for (const [peerId, name] of now) knownNames.set(peerId, name);
    if (line) status(line);
  }

  /** #lobby-status is `role="status" aria-live="polite"`, so writing here is
   *  what a screen reader hears. The line clears itself so the last arrival
   *  does not sit on screen for the rest of the lobby. */
  function status(line: string): void {
    el.lobbyStatus.textContent = line;
    cancelStatus?.();
    cancelStatus = deps.schedule(() => {
      el.lobbyStatus.textContent = '';
      cancelStatus = null;
    }, STATUS_CLEAR_MS);
  }

  function paintLobby(view: LobbyView): void {
    lastView = view;
    announceArrivals(view);
    buildSlots();
    for (let i = 0; i < SEATS; i++) {
      const o = view.occupants[i];
      if (o) paintSeat(slotCards[i], o, view); else paintEmpty(slotCards[i]);
    }
    el.lobbyEmptyHint.classList.toggle('hidden', view.occupants.length > 1);
    const mine = view.occupants.find((o) => o.peerId === view.selfPeerId);
    for (const [key, card] of classCards) {
      card.classList.toggle('selected', mine ? mine.cls === key : false);
    }
    // ABSENCE, not `disabled` (D3-04). The node is kept by ui/dom.ts, so it can
    // go back in if this machine ever creates a room later in the session.
    if (view.isAuthority) {
      if (!el.btnStartRun.isConnected) el.btnLeaveRoom.before(el.btnStartRun);
    } else {
      el.btnStartRun.remove();
    }
    paintBadge();
  }

  function paintBadge(): void {
    if (!lastView) return;
    el.netRoute.textContent = badgeLine(lastView);
  }

  function showDesync(ours: string, theirs: string): void {
    el.desyncOurs.textContent = ours;
    el.desyncTheirs.textContent = theirs;
    deps.showScreen('desync');
    el.btnDesyncClose.focus();
  }

  // ── Wiring ─────────────────────────────────────────────────────────────────
  // The keyboard-click guard of events.ts:12-14 is NOT wrapped around any of
  // these: it exists because Space is the attack key DURING A RUN, and there is
  // no run behind these screens.
  // Enter and Space have to activate them. The badge button below is the single
  // exception, and it is the only control here that is visible during a run.

  el.btnCreateRoom.addEventListener('click', () => { void createRoom(); });
  el.btnJoinRoom.addEventListener('click', () => { void joinRoom(); });
  el.btnRetryJoin.addEventListener('click', () => { void joinRoom(); });
  el.btnRoomBack.addEventListener('click', () => { leave(); deps.showScreen('start'); });
  el.btnDesyncClose.addEventListener('click', () => {
    // `deps.onQuit` and NOT a local `showScreen('start')`: by the time this
    // screen is up a run is already advancing behind it (the run starts on
    // `startRun` and the fingerprints are compared alongside it, D3-18), so
    // closing the modal without tearing the run down would leave a world that
    // is known to disagree with the room's still stepping under the menu. It is
    // the same exit the pause screen's QUIT takes.
    leave();
    deps.onQuit();
  });

  el.btnCopyLink.addEventListener('click', () => {
    // The value was built from the ROOM CODE when the lobby opened, never from
    // the address bar — which is what keeps the debug flag out of a shared link.
    const link = el.lobbyLink.value;
    // `clipboard` refuses in an insecure context and, in some browsers, without
    // a user gesture — so the failure path is a real path, not a formality, and
    // the copy for it tells the player what to do instead.
    const wrote = navigator.clipboard?.writeText(link);
    if (!wrote) { status(COPY.copyFailed); return; }
    void wrote.then(() => { status(COPY.linkCopied); }, () => { status(COPY.copyFailed); });
  });

  // Class delegation, in the shape of screens.ts:157-163 but WITHOUT its
  // keyboard-click guard: the accessibility contract of this phase requires
  // Enter and Space to pick a class.
  el.lobbyClass.addEventListener('click', (event) => {
    const card = (event.target as HTMLElement).closest('.lobby-class-card') as HTMLElement | null;
    const key = card?.dataset.class as ClassKey | undefined;
    if (!key || !lobby) return;
    // The optimistic echo: paint now, and let the next lobbyState be the truth.
    for (const [other, node] of classCards) node.classList.toggle('selected', other === key);
    lobby.chooseClass(key);
  });

  el.btnLeaveRoom.addEventListener('click', () => {
    // Two clicks and no `confirm()` (D3-02): leaving as the authority ends the
    // room for everyone, and a native dialog is both unstyleable and easy to
    // dismiss by reflex. Reverts on its own so the scary label does not linger.
    const authority = lastView?.isAuthority ?? false;
    if (authority && !leaveArmed) {
      leaveArmed = true;
      el.btnLeaveRoom.textContent = COPY.leaveConfirm;
      cancelLeaveReset?.();
      cancelLeaveReset = deps.schedule(() => {
        leaveArmed = false;
        el.btnLeaveRoom.textContent = COPY.leave;
      }, STATUS_CLEAR_MS);
      return;
    }
    leave();
    deps.showScreen('start');
  });

  el.btnRelayFlag.addEventListener('click', domGuards.mouseOnly(() => {
    // The ICE policy is fixed when the connection is CONSTRUCTED, so turning
    // the flag off has to reload to take effect.
    clearRelayFlag(deps.storage);
    deps.reload();
  }));

  // Visible from boot when the flag is on, room or no room: the badge is the
  // non-negotiable half of the debug flag, and it has to be on screen wherever
  // the flag can still bite — including during a run.
  if (deps.forceRelay) {
    el.btnRelayFlag.classList.remove('hidden');
    el.netBadge.classList.remove('hidden');
  }

  el.btnStartRun.addEventListener('click', () => {
    // Reachable only by the authority: the node is REMOVED from the document
    // for a guest (D3-04, see paintLobby). The guard is here anyway because
    // "the button is not in the DOM" is a property of another function, and
    // net/lobby.ts throws rather than quietly starting someone else's room.
    if (!lobby || !lastView?.isAuthority) return;
    // A closed room has already started. `startRoom` is idempotent on its own —
    // a second call returns the manifest it handed out rather than reassigning
    // seats, which would renumber a run already in flight — but reading the
    // state the room already publishes is cheaper than a flag that says the
    // same thing in a second place.
    if (lastView.closed) return;
    // THE SEED IS DRAWN HERE, AT THE MOMENT THE ROOM CLOSES, and it is the only
    // machine in the room that draws one: it travels in `startRun` and every
    // peer builds its world from it. The mode comes from the same selection
    // screen the lobby has been showing all along.
    lobby.startRoom({ seed: deps.newSeed(), mode: deps.identity().mode });
  });

  return { open, paintBadge, showDesync, leave };
}
