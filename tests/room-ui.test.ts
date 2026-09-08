// room-ui.test.ts — the half of the lobby screen that can be proved in Node.
//
// THE RUNNER IS NODE, WITHOUT JSDOM (vitest.config.ts). There is no `document`
// here, so this file cannot click a card or read a rendered slot, and it does
// not pretend to: the behaviour proof with a real DOM — two browser contexts,
// one room, the same tick-0 hash — is the Playwright spec of plan 03-10. What
// IS provable here is everything that does not need an element, and this file
// covers it in two halves that are deliberately different in kind:
//
//   1. PURE FUNCTIONS, imported and called. The name cut, the avatar cache key,
//      the ping band, the seat line and the invite link. Each of them is a rule
//      that a screenshot would only ever check by eye.
//   2. STRUCTURAL ASSERTIONS over the TEXT of src/ui/room.ts, for the rules that
//      are about what the module must never do — build markup from a string,
//      animate on a timer, refuse a keyboard-activated click. A rule of the
//      form "this never appears" has no runtime witness to assert on; the file
//      itself is the witness.
//
// WHY ui/room.ts IS IMPORTABLE FROM NODE AT ALL, since ui/dom.ts resolves every
// element the instant it is loaded and render/sprites.ts constructs an `Image`:
// room.ts imports NEITHER. It takes its elements and its two drawing
// capabilities as arguments to `initRoom`, in the same shape as `open(url)` in
// net/signaling.ts and `startWatchdog` in apps/server/src/shutdown.ts. That is
// what keeps the pure half of this screen testable without a browser, and it is
// why nobody should "tidy" those parameters into a top-level import.
import { describe, it, expect } from 'vitest';
import type { IceOutcome } from '@dg2/protocol';
import {
  armOutcomeReports, avatarKey, badgeLine, clipName, inviteLink, modeLabel,
  NAME_MAX_CODE_POINTS, pingBand, relayAllowed, slotLine,
} from '../src/ui/room';
import type { LobbyView } from '../src/net/lobby';
import { REASON_CLOSED, REASON_FAILED } from '../src/net/rtc';

// Vite's raw glob, not node:fs — tsconfig's `types` is ["vite/client"] only.
const ROOM = import.meta.glob<string>('../src/ui/room.ts', {
  query: '?raw', import: 'default', eager: true,
});
const SPRITES = import.meta.glob<string>('../src/render/sprites.ts', {
  query: '?raw', import: 'default', eager: true,
});

/** The record has exactly one entry, or the glob missed — '' makes the length
 *  guard below fire instead of every assertion passing on `undefined`. */
function only(files: Record<string, string>): string {
  const values = Object.values(files);
  return values.length === 1 ? values[0] : '';
}

const roomSrc = only(ROOM);
const spritesSrc = only(SPRITES);

/** A seat, in the shape `slotLine` and `badgeLine` read it. */
function seat(over: Partial<LobbyView['occupants'][number]> = {}): LobbyView['occupants'][number] {
  return {
    peerId: 'peer-a', accountId: 'acct-a', name: 'GUSTAVO', cls: 'mage',
    color: [86, 152, 204], slot: null, connected: true, ping: 42, route: 'direct',
    ...over,
  };
}

function view(over: Partial<LobbyView> = {}): LobbyView {
  return {
    authorityPeerId: 'peer-a', selfPeerId: 'peer-a', isAuthority: true,
    closed: false, mode: 'campaign', occupants: [seat()],
    ...over,
  };
}

describe('o texto da tela de sala', () => {
  it('leu os dois fontes', () => {
    // Anti-vacuity by LENGTH and never by type: `css: true` aside, a glob that
    // misses yields '' — and '' is a string, so a toBeTypeOf('string') guard
    // passes on exactly the input it exists to reject.
    expect(roomSrc.length).toBeGreaterThan(4000);
    expect(spritesSrc.length).toBeGreaterThan(1000);
  });

  it('corta um nome em 12 pontos de código, contando por ponto e não por unidade', () => {
    expect(NAME_MAX_CODE_POINTS).toBe(12);
    expect(clipName('GUSTAVO')).toBe('GUSTAVO');
    expect(clipName('ABCDEFGHIJKLMNOP')).toBe('ABCDEFGHIJKL');
    // Twelve astral code points are twelve characters on screen and twenty-four
    // UTF-16 units. A cut by `.slice(0, 12)` would take six of them and split
    // the seventh into half a surrogate pair, which renders as a replacement
    // glyph — the kind of defect that only shows up on somebody else's name.
    const astral = '🙂'.repeat(16);
    expect([...clipName(astral)].length).toBe(12);
    expect(clipName(astral)).toBe('🙂'.repeat(12));
  });

  it('devolve markup vindo de um peer como texto literal, sem escapar e sem interpretar', () => {
    // The value passes through untouched — no entity encoding, no tag stripping.
    // That is correct precisely BECAUSE it lands through textContent: escaping
    // here would double-encode on screen, and the structural assertion below
    // ("nenhum innerHTML") is what makes the landing safe. The two go together.
    const attack = '<img src=x onerror=alert(1)>';
    const painted = clipName(attack);
    expect(painted).toBe(attack.slice(0, 12));
    expect(painted.startsWith('<img')).toBe(true);
  });

  it('chaveia o cache de avatar por classe e cor, e só por isso', () => {
    expect(avatarKey('mage', [86, 152, 204])).toBe('mage|86,152,204');
    // Four seats in four colours must be four keys, or the last one to paint
    // wins and everybody wears the same clothes.
    const keys = new Set([
      avatarKey('mage', [86, 152, 204]),
      avatarKey('mage', [204, 86, 152]),
      avatarKey('archer', [86, 152, 204]),
      avatarKey('archer', [204, 86, 152]),
    ]);
    expect(keys.size).toBe(4);
    // Same class, same colour, same key: this is what stops the repaint.
    expect(avatarKey('ninja', [1, 2, 3])).toBe(avatarKey('ninja', [1, 2, 3]));
  });

  it('escolhe a faixa de cor do ping nos limites de 80 e 150', () => {
    expect(pingBand(0)).toBe('fx-pos');
    expect(pingBand(80)).toBe('fx-pos');
    expect(pingBand(81)).toBe('');
    expect(pingBand(150)).toBe('');
    expect(pingBand(151)).toBe('fx-neg');
    // No number at all reads as bad, never as good: the reassuring direction is
    // the one nobody investigates.
    expect(pingBand(null)).toBe('fx-neg');
  });

  it('a cor nunca é o único sinal: a linha do slot sempre diz o número ou diz o porquê', () => {
    expect(slotLine(seat({ ping: 42, route: 'direct' }))).toBe('42 ms · direto');
    expect(slotLine(seat({ ping: 42, route: 'relay' }))).toBe('42 ms · relay');
    // 'unknown' is what the lobby carries until plan 03-10 wires the route in.
    // Showing "direto" for it would be a claim this machine cannot make.
    expect(slotLine(seat({ ping: 42, route: 'unknown' }))).toBe('42 ms');
    // Above the band, the NUMBER is still there — the red is an addition to the
    // text, never a replacement for it.
    expect(slotLine(seat({ ping: 220, route: 'relay' }))).toBe('220 ms · relay');
    expect(slotLine(seat({ ping: null }))).toBe('sem resposta');
    expect(slotLine(seat({ connected: false, ping: null }))).toBe('conectando');
  });

  it('o badge mostra o pior entre os slots para quem criou a sala, e nada quando está sozinha', () => {
    // Alone: three empty seats and no link to describe.
    expect(badgeLine(view())).toBe('—');
    const withGuests = view({
      occupants: [
        seat({ peerId: 'peer-a', ping: null }), // a authority does not ping itself
        seat({ peerId: 'peer-b', ping: 40, route: 'direct' }),
        seat({ peerId: 'peer-c', ping: 190, route: 'relay' }),
      ],
    });
    expect(badgeLine(withGuests)).toBe('pior 190 ms · relay');
    // A guest sees its own link, with no superlative in front of it: it has
    // exactly one leg, and calling it "the worst" would be a lie by grammar.
    const asGuest = view({
      isAuthority: false, selfPeerId: 'peer-b',
      occupants: [seat({ peerId: 'peer-a', ping: null }), seat({ peerId: 'peer-b', ping: 40 })],
    });
    expect(badgeLine(asGuest)).toBe('40 ms · direto');
    // And `—` until the first pong, which is the state the badge is born in.
    const beforeFirstPong = view({
      isAuthority: false, selfPeerId: 'peer-b',
      occupants: [seat({ peerId: 'peer-a', ping: null }), seat({ peerId: 'peer-b', ping: null })],
    });
    expect(badgeLine(beforeFirstPong)).toBe('—');
  });

  it('a linha do modo vem do roster, e fica vazia até o convidado ser informado (WR-06)', () => {
    expect(modeLabel('campaign')).toBe('MODO · CAMPANHA');
    expect(modeLabel('endless')).toBe('MODO · SEM FIM');
    // Not the local selection and not a default: before the first roster a
    // guest has been told nothing, and the honest line says nothing.
    expect(modeLabel(null)).toBe('');
    // And the screen reads it from the view, never from `identity()`.
    expect(roomSrc).toContain('modeLabel(view.mode)');
    expect(roomSrc).not.toContain("identity().mode === 'endless'");
  });

  it('o link de convite é montado do código da sala, nunca do endereço atual', () => {
    expect(inviteLink('http://localhost:5173/', 'ABC123')).toBe('http://localhost:5173/?sala=ABC123');
    // T-3-29: the debug flag must not travel in a link somebody shares. Building
    // from the code and not from the address bar is what makes that structural
    // instead of a promise.
    expect(inviteLink('http://localhost:5173/?ice=relay#x', 'ABC123'))
      .toBe('http://localhost:5173/?sala=ABC123');
  });

  it('um relay só é aceito de quem esta máquina negocia com (CR-01)', () => {
    // The second lock on the door the server already guards: a guest listens
    // to the authority named by `joined` and to nobody else; the authority
    // listens to the peers the server seated and to nobody else. Without it,
    // a forged `answer` in the authority's name would close a guest's
    // negotiation with the forger, and every invented `from` would cost the
    // victim a fresh peer connection.
    const seated = new Set(['peer-b', 'peer-c']);
    expect(relayAllowed('peer-a', false, 'peer-a', seated)).toBe(true);
    expect(relayAllowed('peer-b', false, 'peer-a', seated)).toBe(false);
    expect(relayAllowed('peer-b', true, 'peer-a', seated)).toBe(true);
    expect(relayAllowed('peer-z', true, 'peer-a', seated)).toBe(false);
    // An empty roster admits nobody — the state the authority is in before
    // the first `peers`, when there is nobody to negotiate with yet.
    expect(relayAllowed('peer-b', true, 'peer-a', new Set())).toBe(false);
  });

  it('cada perna reporta o desfecho de ICE uma vez, e a falha também (SALA-05, WR-01)', async () => {
    // A transport double in the shape armOutcomeReports reads: it hands back
    // the callbacks so the test can fire a join and a leave, and a connection
    // whose statistics name a srflx pair, so 'direct' proves the route was
    // READ and not assumed.
    const joins: ((peer: string) => void)[] = [];
    const leaves: ((peer: string, reason: string) => void)[] = [];
    const stats = new Map<string, Record<string, unknown>>([
      ['pair-1', { type: 'candidate-pair', state: 'succeeded', localCandidateId: 'l', remoteCandidateId: 'r' }],
      ['l', { type: 'local-candidate', candidateType: 'srflx', protocol: 'udp' }],
      ['r', { type: 'remote-candidate', candidateType: 'srflx', protocol: 'udp' }],
    ]);
    const pc = { getStats: () => Promise.resolve(stats) } as unknown as RTCPeerConnection;
    const rtc = {
      onPeerJoin: (cb: (peer: string) => void) => { joins.push(cb); return () => {}; },
      onPeerLeave: (cb: (peer: string, reason: string) => void) => { leaves.push(cb); return () => {}; },
      connectionOf: () => pc,
    };
    const sent: IceOutcome[] = [];
    let n = 0;
    armOutcomeReports(rtc, (m) => { sent.push(m); }, () => `01ULID${n++}`, 'ABC123', 'p1');
    const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

    for (const cb of joins) cb('peer-a');
    await settle();
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({
      kind: 'iceOutcome', id: '01ULID0', code: 'ABC123', slot: 'p1',
      route: 'direct', localCandidate: 'srflx', result: 'connected', rttMs: null,
    });

    // Once per leg: a second announcement of the same peer files nothing.
    for (const cb of joins) cb('peer-a');
    await settle();
    expect(sent).toHaveLength(1);

    // A leg that never connected and failed is the other half of the table
    // (D3-14): route unknown by construction, the last pair tried kept.
    for (const cb of leaves) cb('peer-b', REASON_FAILED);
    await settle();
    expect(sent).toHaveLength(2);
    expect(sent[1]).toMatchObject({ id: '01ULID1', route: 'unknown', localCandidate: 'srflx', result: 'failed' });

    // A closed leg is not a failure; and peer-a already counted.
    for (const cb of leaves) { cb('peer-c', REASON_CLOSED); cb('peer-a', REASON_FAILED); }
    await settle();
    expect(sent).toHaveLength(2);
  });

  it('não constrói markup a partir de texto (T-3-14)', () => {
    // Name and class arrive from a remote machine, and from phase 6 this origin
    // holds a session cookie with no CSP in front of it. screens.ts:56-71
    // already names THIS phase as the reason the rule exists.
    expect(roomSrc).not.toContain('innerHTML');
  });

  it('não anima com temporizador, ao contrário de #color-preview', () => {
    // settings.ts:136-141 repaints the colour preview four times a second.
    // Four canvases doing that is GC litter and a visible flicker, and the lobby
    // communicates nothing by moving.
    expect(roomSrc).not.toContain('setInterval');
  });

  it('não recusa o clique ativado por teclado', () => {
    // The `detail === 0` guard of screens.ts:158 exists because Space is the
    // attack key DURING A RUN. There is no run behind these screens, and the
    // accessibility contract requires Enter and Space to work.
    expect(roomSrc).not.toContain('detail === 0');
  });

  it('recoloca o foco ao abrir cada tela', () => {
    // Mandatory, not courtesy: settings.ts:32-35 blurs every button that is
    // clicked, so a keyboard player loses their place on every action unless the
    // screen puts the focus back.
    const focusCalls = roomSrc.split('.focus()').length - 1;
    expect(focusCalls).toBeGreaterThanOrEqual(2);
  });

  it('carrega a copy da UI-SPEC que o teste de DOM não alcança', () => {
    for (const copy of ['VAZIO', 'CRIOU A SALA', 'VOCÊ', 'conectando', 'sem resposta']) {
      expect(roomSrc, `copy ausente: ${copy}`).toContain(copy);
    }
  });

  it('as três frases de erro são alcançáveis pelo caminho certo (WR-05)', () => {
    // `serverDown` pela queda do socket, `rtcFailed` pela perna da autoridade
    // que nunca abriu, `roomDead` pelo resto. Antes, a primeira era
    // inalcançável e a segunda só saía por um erro de programação.
    expect(roomSrc).toContain("error.source === 'socket'");
    expect(roomSrc).toContain('COPY.serverDown');
    expect(roomSrc).toContain('reason === REASON_FAILED');
    expect(roomSrc).toContain('function rtcFailed');
  });

  it('sair da sala é DITO ao servidor, não só feito (WR-02)', () => {
    // Closing the socket alone leaves the server to tell "left on purpose"
    // from "vanished" by a silence, and the two are answered differently: a
    // `leave` from whoever created the room ends it for everyone now (D3-02),
    // a socket that merely closed starts the grace written for a Caddy reload.
    expect(roomSrc).toContain("kind: 'leave'");
  });

  it('▶ INICIAR é ausência e não `disabled` para o convidado (D3-04)', () => {
    // A disabled button invites a click and a question, and the asymmetry is
    // permanent: there is no authority migration (D3-02).
    expect(roomSrc).toContain('btnStartRun.remove()');
    expect(roomSrc).not.toContain('btnStartRun.disabled');
  });

  it('o recolor puro devolve a folha em vez de escrever na global', () => {
    // The trap that costs an afternoon: four seats in four colours calling the
    // old function would overwrite one another, and the run would start wearing
    // the colour of whichever painted last.
    expect(spritesSrc).toContain('export function recolorSheet');
    const assignments = spritesSrc.split('playerSheet =').length - 1;
    expect(assignments).toBeLessThanOrEqual(3);
    // The pure helper must not be where any of them happens. Sliced between its
    // own signature and the next top-level `export`, which is the declaration
    // that follows it.
    const start = spritesSrc.indexOf('export function recolorSheet');
    const after = spritesSrc.indexOf('export function recolorPlayerSheet');
    expect(start).toBeGreaterThan(0);
    expect(after).toBeGreaterThan(start);
    expect(spritesSrc.slice(start, after)).not.toContain('playerSheet =');
  });
});
