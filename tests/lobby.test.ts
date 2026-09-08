// lobby.test.ts — as regras da sala, provadas em Node sobre um cabo em
// processo: sem browser, sem servidor de signaling e sem a VPS.
//
// Duas escolhas de instrumento carregam o valor deste arquivo.
//
// 1. AS REGRAS DE SALA RODAM SOBRE src/net/local.ts, NÃO SOBRE UM DUBLÊ DO
//    LOBBY. `makeStar` monta a topologia real — uma autoridade, N convidados,
//    nenhum link entre convidados — e as mensagens cruzam o mesmo
//    `queueMicrotask` que a entrega de rede vai cruzar. Um teste que chamasse
//    os métodos do lobby direto provaria que a máquina de estado funciona
//    quando alguém a opera na ordem certa; este prova que ela funciona quando o
//    fio entrega na ordem do fio.
//
// 2. AS MENSAGENS FORJADAS CHEGAM POR `recordingTransport`, NÃO PELA ESTRELA.
//    Os testes de T-3-07 precisam de um `from` arbitrário e de um corpo
//    arbitrário, e a estrela — corretamente — não deixa um convidado receber
//    de ninguém além da autoridade. O transporte gravador entrega
//    sincronamente o que o teste mandar, com o remetente que o teste escolher,
//    que é exatamente o poder que o atacante tem depois que a fase 4 abrir
//    mais pernas. De quebra, o quadro é montado aqui à mão a partir de
//    `MSG_KIND` e de JSON, então o ENQUADRAMENTO também fica pinado por um
//    segundo lugar: se lobby.ts trocar de formato, estes testes ficam vermelhos
//    em vez de continuarem passando contra o codec do próprio lobby.
import { describe, it, expect } from 'vitest';
import { CLASS_KEY, MSG_KIND } from '@dg2/protocol';
import type { ClassKey, ForgeLevels, PlayerSlot } from '@dg2/sim';
import {
  createLobby, MAX_OCCUPANTS, type Lobby, type LobbyView, type Rgb,
} from '../src/net/lobby';
import type { RejectReason } from '@dg2/protocol';
import type { Transport } from '../src/net/transport';
import { fakeClock, flush, makePair, makeStar, recordingTransport } from './net/helpers';

const FORGE: ForgeLevels = {
  vigor: 0, honed: 0, fleet: 0, startgold: 0, merchant: 0, wise: 0, golden: 0,
};

/**
 * A paleta de UMA máquina.
 *
 * Cada peer tem a sua, porque é isso que D3-06 diz: a cor sai de
 * `Save.data.settings.colors[cls]` no aparelho de quem escolheu, e VIAJA no
 * `lobbyState` como dado de apresentação. Uma paleta única no teste esconderia
 * exatamente o erro que importa — um lobby que derivasse a cor da classe
 * localmente, em vez de usar a que chegou, passaria por todos os testes e
 * pintaria dois magos iguais na tela.
 */
function paletteFor(peerId: string): (cls: ClassKey) => Rgb {
  const bump = peerId.charCodeAt(peerId.length - 1) % 7;
  return (cls) => {
    const i = CLASS_KEY.indexOf(cls);
    return [i * 10 + bump, 100 + i, 200 - i - bump];
  };
}

const AUTHORITY = 'peer-a';

interface Room {
  clock: ReturnType<typeof fakeClock>;
  net: ReturnType<typeof makeStar>['net'];
  authority: Lobby;
  authorityTransport: Transport;
  guests: Map<string, Lobby>;
  guestTransports: Map<string, Transport>;
  dead: Set<string>;
  rejected: Map<string, RejectReason[]>;
}

function attach(room: Room, id: string, lobby: Lobby): void {
  room.rejected.set(id, []);
  lobby.onRoomDead(() => { room.dead.add(id); });
  lobby.onRejected((reason) => { room.rejected.get(id)!.push(reason); });
}

/** Uma sala com só a autoridade dentro. Convidados entram por `join`. */
function openRoom(cls: ClassKey = 'mage'): Room {
  const clock = fakeClock();
  const star = makeStar(AUTHORITY, []);
  const room: Room = {
    clock, net: star.net,
    authority: createLobby({
      transport: star.authority,
      self: { peerId: AUTHORITY, accountId: 'conta-a', name: 'ANA', cls, forge: FORGE },
      isAuthority: true, authorityPeerId: AUTHORITY,
      colorFor: paletteFor(AUTHORITY), now: clock.now, schedule: clock.schedule,
    }),
    authorityTransport: star.authority,
    guests: new Map(), guestTransports: new Map(),
    dead: new Set(), rejected: new Map(),
  };
  attach(room, AUTHORITY, room.authority);
  return room;
}

/**
 * Um convidado entra e o `hello` dele chega antes de o próximo entrar.
 *
 * O `flush` entre as entradas é o que torna a ORDEM DE ENTRADA um fato do
 * teste e não um efeito colateral da ordem em que as microtasks saíram — e é a
 * ordem de entrada que vira `p0..p3` quando a sala fecha (ADR 0001).
 */
async function join(room: Room, id: string, name: string, cls: ClassKey): Promise<Lobby> {
  const transport = room.net.open(id);
  room.net.link(AUTHORITY, id);
  const lobby = createLobby({
    transport,
    self: { peerId: id, accountId: `conta-${id}`, name, cls, forge: FORGE },
    isAuthority: false, authorityPeerId: AUTHORITY,
    colorFor: paletteFor(id), now: room.clock.now, schedule: room.clock.schedule,
  });
  room.guests.set(id, lobby);
  room.guestTransports.set(id, transport);
  attach(room, id, lobby);
  await flush();
  return lobby;
}

/** Os nomes dos ocupantes, na ordem em que a autoridade os guarda. */
function names(view: LobbyView): string[] {
  return view.occupants.map((o) => o.name);
}

function slots(view: LobbyView): (PlayerSlot | null)[] {
  return view.occupants.map((o) => o.slot);
}

// ─── O quadro forjado, montado à mão. Ver nota 2 do cabeçalho. ───────────────

const KIND_LOBBY_STATE = MSG_KIND.indexOf('lobbyState');

function frame(kind: number, body: unknown): ArrayBuffer {
  const json = new TextEncoder().encode(JSON.stringify(body));
  const out = new Uint8Array(1 + json.length);
  out[0] = kind;
  out.set(json, 1);
  return out.buffer;
}

interface WireOccupant {
  peerId: string; accountId: string; name: string; cls: string;
  color: number[]; slot: string | null; connected: boolean;
  ping: number | null; route: string;
}

function occupant(over: Partial<WireOccupant> = {}): WireOccupant {
  return {
    peerId: 'peer-b', accountId: 'conta-b', name: 'BIA', cls: 'archer',
    color: [10, 20, 30], slot: null, connected: true, ping: 42, route: 'direct',
    ...over,
  };
}

function lobbyState(over: Partial<{ authorityPeerId: string; closed: boolean; occupants: WireOccupant[] }> = {}) {
  return {
    authorityPeerId: AUTHORITY,
    closed: false,
    occupants: [occupant({ peerId: AUTHORITY, accountId: 'conta-a', name: 'ANA', cls: 'mage' })],
    ...over,
  };
}

/** Um convidado isolado, alimentado à mão — o alvo dos testes de guarda. */
function lonelyGuest() {
  const clock = fakeClock();
  const rec = recordingTransport();
  const lobby = createLobby({
    transport: rec.transport,
    self: { peerId: 'peer-z', accountId: 'conta-z', name: 'ZED', cls: 'ninja', forge: FORGE },
    isAuthority: false, authorityPeerId: AUTHORITY,
    colorFor: paletteFor('peer-z'), now: clock.now, schedule: clock.schedule,
  });
  // Um estado válido primeiro: toda guarda abaixo é "o anterior PERMANECE",
  // e sem um anterior o teste passaria por vacuidade.
  rec.deliver(AUTHORITY, frame(KIND_LOBBY_STATE, lobbyState()), 'reliable');
  return { clock, rec, lobby };
}

describe('máquina de estado do lobby', () => {
  it('um convidado entra e os dois aparecem nos dois lados (SALA-02)', async () => {
    const room = openRoom();
    await join(room, 'peer-b', 'BIA', 'archer');

    expect(names(room.authority.state())).toEqual(['ANA', 'BIA']);
    // O lobbyState seguinte chega ao convidado com os dois.
    expect(names(room.guests.get('peer-b')!.state())).toEqual(['ANA', 'BIA']);
  });

  it('o quinto peer é recusado com roomFull e a sala continua com quatro (SALA-02)', async () => {
    const room = openRoom();
    await join(room, 'peer-b', 'BIA', 'archer');
    await join(room, 'peer-c', 'CID', 'warrior');
    await join(room, 'peer-d', 'DUL', 'witch');
    expect(room.authority.state().occupants).toHaveLength(MAX_OCCUPANTS);

    await join(room, 'peer-e', 'EVA', 'priestess');

    expect(room.rejected.get('peer-e')).toEqual(['roomFull']);
    expect(names(room.authority.state())).toEqual(['ANA', 'BIA', 'CID', 'DUL']);
  });

  it('um convidado sai, o lugar dele fica vazio e os outros continuam (D3-08)', async () => {
    const room = openRoom();
    await join(room, 'peer-b', 'BIA', 'archer');
    await join(room, 'peer-c', 'CID', 'warrior');
    await join(room, 'peer-d', 'DUL', 'witch');

    room.guestTransports.get('peer-c')!.close();
    await flush();

    expect(names(room.authority.state())).toEqual(['ANA', 'BIA', 'DUL']);
    // A sala não caiu por causa dele: ninguém mais viu sala morta.
    expect([...room.dead]).toEqual([]);
    expect(names(room.guests.get('peer-b')!.state())).toEqual(['ANA', 'BIA', 'DUL']);
  });

  it('a autoridade sai e todo convidado recebe sala morta (D3-02)', async () => {
    const room = openRoom();
    await join(room, 'peer-b', 'BIA', 'archer');
    await join(room, 'peer-c', 'CID', 'warrior');

    room.authorityTransport.close();
    await flush();

    expect([...room.dead].sort()).toEqual(['peer-b', 'peer-c']);
  });

  it('dois peers escolhem a mesma classe e nada é recusado nem marcado (D3-03)', async () => {
    const room = openRoom('mage');
    await join(room, 'peer-b', 'BIA', 'mage');

    const view = room.authority.state();
    expect(view.occupants.map((o) => o.cls)).toEqual(['mage', 'mage']);
    // Nenhuma recusa, e nenhum ocupante marcado de forma diferente do outro:
    // a distinção é a cor da roupa e o nome (D3-06), não um aviso.
    expect(room.rejected.get('peer-b')).toEqual([]);
    // E cada cor é a que a máquina DAQUELE jogador escolheu, não uma derivada
    // da classe aqui. Um lobby que derivasse localmente pintaria os dois magos
    // iguais e ainda assim passaria em tudo acima desta linha.
    expect(view.occupants[0]!.color).toEqual(paletteFor(AUTHORITY)('mage'));
    expect(view.occupants[1]!.color).toEqual(paletteFor('peer-b')('mage'));
    expect(view.occupants[0]!.color).not.toEqual(view.occupants[1]!.color);
  });

  it('a escolha de classe de um convidado chega ao lobbyState seguinte (SALA-03)', async () => {
    const room = openRoom();
    const guest = await join(room, 'peer-b', 'BIA', 'archer');

    guest.chooseClass('ninja');
    // Eco otimista: a tela local não espera a volta.
    expect(guest.state().occupants.find((o) => o.peerId === 'peer-b')!.cls).toBe('ninja');
    await flush();

    expect(room.authority.state().occupants[1]!.cls).toBe('ninja');
    const echoed = guest.state().occupants.find((o) => o.peerId === 'peer-b')!;
    expect(echoed.cls).toBe('ninja');
    expect(echoed.color).toEqual(paletteFor('peer-b')('ninja'));
  });

  it('startRoom com só a autoridade produz um RunConfig de um jogador (D3-04)', () => {
    const room = openRoom('witch');
    const config = room.authority.startRoom({ seed: 4242, mode: 'campaign' });

    expect(config.seed).toBe(4242);
    expect(config.mode).toBe('campaign');
    expect(config.players).toHaveLength(1);
    expect(config.players[0]!.id).toBe('p0');
    expect(config.players[0]!.cls).toBe('witch');
    expect(config.players[0]!.name).toBe('ANA');
  });

  it('os slots p0..p3 saem em ordem de entrada quando a sala fecha (SALA-03)', async () => {
    const room = openRoom();
    await join(room, 'peer-b', 'BIA', 'archer');
    await join(room, 'peer-c', 'CID', 'warrior');
    await join(room, 'peer-d', 'DUL', 'witch');

    const config = room.authority.startRoom({ seed: 7, mode: 'endless' });
    await flush();

    expect(config.players.map((p) => p.id)).toEqual(['p0', 'p1', 'p2', 'p3']);
    expect(config.players.map((p) => p.name)).toEqual(['ANA', 'BIA', 'CID', 'DUL']);
    expect(slots(room.authority.state())).toEqual(['p0', 'p1', 'p2', 'p3']);
    // E o convidado recebe o mesmo manifesto, na mesma ordem canônica.
    expect(slots(room.guests.get('peer-d')!.state())).toEqual(['p0', 'p1', 'p2', 'p3']);
  });

  it('depois de fechar, os slots atribuídos não mudam nem quando alguém sai (SALA-03)', async () => {
    const room = openRoom();
    await join(room, 'peer-b', 'BIA', 'archer');
    await join(room, 'peer-c', 'CID', 'warrior');
    room.authority.startRoom({ seed: 9, mode: 'campaign' });
    await flush();

    room.guestTransports.get('peer-b')!.close();
    await flush();

    const view = room.authority.state();
    expect(slots(view)).toEqual(['p0', 'p1', 'p2']);
    expect(view.occupants[1]!.connected).toBe(false);
    expect(view.occupants[2]!.slot).toBe('p2');
  });

  it('um lobbyState de quem não é a autoridade é descartado sem efeito (T-3-07)', () => {
    const { rec, lobby } = lonelyGuest();
    const before = lobby.state();

    rec.deliver('peer-impostor', frame(KIND_LOBBY_STATE, lobbyState({
      occupants: [occupant({ peerId: 'peer-impostor', name: 'MAL' })],
    })), 'reliable');

    expect(lobby.state().occupants).toEqual(before.occupants);
    expect(names(lobby.state())).toEqual(['ANA']);
  });

  it('um lobbyState cujo authorityPeerId não bate com o remetente é descartado (T-3-07b)', () => {
    const { rec, lobby } = lonelyGuest();

    // A autoridade NUNCA é derivada do slot: mesmo vindo do socket certo, um
    // corpo que se declara de outra autoridade é lixo.
    rec.deliver(AUTHORITY, frame(KIND_LOBBY_STATE, lobbyState({
      authorityPeerId: 'peer-impostor',
      occupants: [occupant({ name: 'MAL' })],
    })), 'reliable');

    expect(names(lobby.state())).toEqual(['ANA']);
  });

  it('um lobbyState com cls fora de CLASS_KEY é descartado e o anterior permanece', () => {
    const { rec, lobby } = lonelyGuest();

    rec.deliver(AUTHORITY, frame(KIND_LOBBY_STATE, lobbyState({
      occupants: [occupant({ name: 'ANA', peerId: AUTHORITY }), occupant({ cls: 'necromancer' })],
    })), 'reliable');

    expect(names(lobby.state())).toEqual(['ANA']);
  });

  it('um lobbyState com nome acima de 24 pontos de código é descartado', () => {
    const { rec, lobby } = lonelyGuest();
    // 25 pontos de código, contados por code point e não por unidade UTF-16:
    // um nome de 24 emojis tem 48 de `length` e é legítimo.
    const longo = 'A'.repeat(25);

    rec.deliver(AUTHORITY, frame(KIND_LOBBY_STATE, lobbyState({
      occupants: [occupant({ name: longo, peerId: AUTHORITY })],
    })), 'reliable');

    expect(names(lobby.state())).toEqual(['ANA']);
  });

  it('um lobbyState com componente de cor fora de 0..255 é descartado', () => {
    const { rec, lobby } = lonelyGuest();

    rec.deliver(AUTHORITY, frame(KIND_LOBBY_STATE, lobbyState({
      occupants: [occupant({ peerId: AUTHORITY, name: 'MAL', color: [0, 256, 0] })],
    })), 'reliable');

    expect(names(lobby.state())).toEqual(['ANA']);
  });

  it('uma mensagem inteira é descartada, nunca aplicada pela metade', async () => {
    const { rec, lobby } = lonelyGuest();

    // Dois ocupantes, e só o SEGUNDO é inválido. Um validador que aplicasse
    // enquanto valida deixaria o primeiro entrar — que é a forma que um
    // atacante usa para meter um nome numa tela contando com a metade boa.
    rec.deliver(AUTHORITY, frame(KIND_LOBBY_STATE, lobbyState({
      occupants: [
        occupant({ peerId: AUTHORITY, name: 'ANA', cls: 'mage' }),
        occupant({ peerId: 'peer-b', name: 'MAL', route: 'teleporte' }),
      ],
    })), 'reliable');

    expect(names(lobby.state())).toEqual(['ANA']);
    await flush();
  });

  it('close() cancela o agendamento e não deixa deadline armado', async () => {
    const room = openRoom();
    await join(room, 'peer-b', 'BIA', 'archer');
    expect(room.clock.pending()).toBeGreaterThan(0);

    room.authority.close();
    for (const guest of room.guests.values()) guest.close();

    expect(room.clock.pending()).toBe(0);
  });

  it('a autoridade reemite o lobbyState a cada segundo (D3-16)', async () => {
    const room = openRoom();
    const guest = await join(room, 'peer-b', 'BIA', 'archer');
    let recebidos = 0;
    guest.onState(() => { recebidos++; });

    room.clock.advance(3000);
    await flush();

    // Três segundos, três reemissões. É nesse ritmo que o resumo de ping e
    // rota por slot é relayado (D3-16); sem o timer, a tela do convidado
    // congelaria no último evento de ocupação e o ping ficaria velho na tela.
    expect(recebidos).toBe(3);
  });

  it('a sala funciona sobre um par de Transport, sem topologia especial', async () => {
    // `makePair` é o cabo mínimo: duas pontas ligadas e nada mais. Que o lobby
    // funcione sobre ele sem saber que existe uma estrela é a prova de que a
    // máquina de estado só fala com a INTERFACE — e é por isso que trocar
    // local.ts por rtc.ts é troca de construtor e não reescrita.
    const clock = fakeClock();
    const { a, b } = makePair(AUTHORITY, 'peer-b');
    const authority = createLobby({
      transport: a,
      self: { peerId: AUTHORITY, accountId: 'conta-a', name: 'ANA', cls: 'mage', forge: FORGE },
      isAuthority: true, authorityPeerId: AUTHORITY,
      colorFor: paletteFor(AUTHORITY), now: clock.now, schedule: clock.schedule,
    });
    const guest = createLobby({
      transport: b,
      self: { peerId: 'peer-b', accountId: 'conta-b', name: 'BIA', cls: 'archer', forge: FORGE },
      isAuthority: false, authorityPeerId: AUTHORITY,
      colorFor: paletteFor('peer-b'), now: clock.now, schedule: clock.schedule,
    });
    await flush();

    expect(names(authority.state())).toEqual(['ANA', 'BIA']);
    expect(names(guest.state())).toEqual(['ANA', 'BIA']);
    authority.close();
    guest.close();
  });
});
