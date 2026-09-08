// run-config-lobby.test.ts — o manifesto da run, do lobby até o hash do tick 0.
//
// O ASSUNTO. Uma sala termina produzindo UM objeto: o `RunConfig`. Dele cada
// máquina constrói o mundo por conta própria, e o `hashWorld` do tick 0 é a
// prova barata de que as duas construíram o mesmo. Este arquivo mede as duas
// metades: que o manifesto que a sala monta é o que a sala prometeu, e que o
// manifesto determina o mundo — inclusive nas partes que parecem estilo e são
// carga, como a ORDEM DO ARRAY de `players` (FORM-02/D-13).
//
// O MOLDE É `tests/cross-engine.test.ts:49-55`. A sequência canônica de início
// de run — `createWorld`, `createPlayer` por assento, `startRun` (que é quem
// chama `generateArena`, sim/run.ts:128) — está escrita aqui uma vez, na mesma
// forma, porque é a MESMA sequência que o replay refaz (D-11). Um segundo jeito
// de construir o mundo inicial seria um segundo jeito de o replay discordar.
//
// POR QUE `src/app/forge.ts` E `src/main.ts` SÃO LIDOS COMO TEXTO E NÃO
// IMPORTADOS. Os dois tocam a plataforma no instante em que são carregados:
// forge.ts importa `ui/dom.ts`, que resolve mais de cem elementos com
// `document.getElementById` no corpo do módulo, e main.ts é o ponto de entrada
// inteiro do jogo. Sob Node, sem jsdom, importar qualquer um dos dois lança
// antes da primeira asserção. É o mesmo motivo pelo qual `src/ui/room.ts` não
// importa `ui/dom.ts` (ver o cabeçalho daquele arquivo), e a resposta é a que o
// repositório já usa em `tests/rtc-shape.test.ts`: quando a API não existe no
// runner, a auditoria é ESTRUTURAL, sobre o texto do arquivo, com guarda
// anti-vacuidade. A prova de COMPORTAMENTO desses dois arquivos é a spec de
// Playwright de `tests/net/room.spec.ts`, que roda num navegador de verdade.
//
// ANTI-VACUIDADE. Toda leitura de texto passa por `raw()`, que exige que o glob
// tenha encontrado o arquivo e que ele tenha um tamanho plausível — sem isso um
// glob quebrado devolveria string vazia e todos os `not.toContain` passariam
// sobre nada, que é a forma mais silenciosa de um portão morrer.
import { describe, it, expect } from 'vitest';
import { CLASS_KEY, PLAYER_SLOT } from '@dg2/protocol';
import {
  createPlayer, createWorld, hashWorld, startRun,
} from '@dg2/sim';
import type {
  ClassKey, ForgeLevels, GameMode, PlayerSlot, RunConfig, RunPlayer, World,
} from '@dg2/sim';
import { createLobby, type Lobby, type LobbyView, type Rgb } from '../src/net/lobby';
import type { PeerId, Transport } from '../src/net/transport';
import { scan } from './scan';
import { fakeClock, flush, makeStar } from './net/helpers';

// ─── A sequência canônica de início de run ───────────────────────────────────

/** Exatamente `tests/cross-engine.test.ts:49-55`, e por isso mesmo copiada. */
function buildWorld(config: RunConfig): World {
  const world = createWorld(config);
  for (const slot of config.players) createPlayer(world, slot.id, slot.cls, slot.name);
  startRun(world);
  return world;
}

/** O número que as duas máquinas trocam antes de qualquer outra coisa. */
function tickZero(config: RunConfig): string {
  return hashWorld(buildWorld(config));
}

// ─── Manifestos escritos à mão ───────────────────────────────────────────────

function forge(over: Partial<ForgeLevels> = {}): ForgeLevels {
  return {
    vigor: 0, honed: 0, fleet: 0, startgold: 0, merchant: 0, wise: 0, golden: 0,
    ...over,
  };
}

function player(id: PlayerSlot, name: string, cls: ClassKey, levels = forge()): RunPlayer {
  return { id, name, cls, forge: levels };
}

function manifest(players: RunPlayer[], seed = 12345, mode: GameMode = 'endless'): RunConfig {
  return { seed, mode, players };
}

// ─── A sala, sobre o cabo em processo de tests/net/helpers.ts ────────────────

const AUTHORITY = 'peer-a';

/**
 * A paleta de UMA máquina — o mesmo motivo escrito em `tests/lobby.test.ts`:
 * uma paleta única esconderia um lobby que derivasse a cor localmente em vez de
 * usar a que chegou.
 */
function paletteFor(peerId: string): (cls: ClassKey) => Rgb {
  const bump = peerId.charCodeAt(peerId.length - 1) % 7;
  return (cls) => {
    const i = CLASS_KEY.indexOf(cls);
    return [i * 10 + bump, 100 + i, 200 - i - bump];
  };
}

interface Room {
  clock: ReturnType<typeof fakeClock>;
  net: ReturnType<typeof makeStar>['net'];
  authority: Lobby;
  guests: Map<PeerId, Lobby>;
  transports: Map<PeerId, Transport>;
}

function openRoom(name: string, cls: ClassKey, levels = forge()): Room {
  const clock = fakeClock();
  const star = makeStar(AUTHORITY, []);
  const authority = createLobby({
    transport: star.authority,
    self: { peerId: AUTHORITY, accountId: 'conta-a', name, cls, forge: levels },
    isAuthority: true,
    authorityPeerId: AUTHORITY,
    colorFor: paletteFor(AUTHORITY),
    now: clock.now,
    schedule: clock.schedule,
  });
  return {
    clock, net: star.net, authority,
    guests: new Map(), transports: new Map([[AUTHORITY, star.authority]]),
  };
}

/** Um convidado entra, e o `hello` dele chega antes de o próximo entrar. */
async function join(
  room: Room, id: PeerId, name: string, cls: ClassKey, levels = forge(),
): Promise<Lobby> {
  const transport = room.net.open(id);
  room.net.link(AUTHORITY, id);
  const lobby = createLobby({
    transport,
    self: { peerId: id, accountId: `conta-${id}`, name, cls, forge: levels },
    isAuthority: false,
    authorityPeerId: AUTHORITY,
    colorFor: paletteFor(id),
    now: room.clock.now,
    schedule: room.clock.schedule,
  });
  room.guests.set(id, lobby);
  room.transports.set(id, transport);
  await flush();
  return lobby;
}

function closeRoom(room: Room): void {
  room.authority.close();
  for (const lobby of room.guests.values()) lobby.close();
}

function slotsOf(view: LobbyView): (PlayerSlot | null)[] {
  return view.occupants.map((o) => o.slot);
}

// ─── O texto dos dois arquivos que não carregam sob Node ─────────────────────

const SOURCES = import.meta.glob<string>(
  ['../src/app/forge.ts', '../src/main.ts'],
  { query: '?raw', import: 'default', eager: true },
);

/** O texto cru, com a guarda anti-vacuidade descrita no cabeçalho. */
function raw(path: string): string {
  const src = SOURCES[path];
  expect(src, `o glob não encontrou ${path}`).toBeTypeOf('string');
  expect(src.length, `${path} veio curto demais para ser o arquivo`).toBeGreaterThan(1000);
  return src;
}

/** O mesmo texto sem comentários: a auditoria lê CÓDIGO, não prosa. */
function code(path: string): string {
  return scan(raw(path), true);
}

const FORGE_PATH = '../src/app/forge.ts';
const MAIN_PATH = '../src/main.ts';

/**
 * O substantivo que FORM-12 proíbe, montado em pedaços.
 *
 * Escrito assim porque o critério de aceitação deste plano é um grep sobre o
 * texto do arquivo de teste também não vale nada se a própria palavra proibida
 * aparecer aqui como literal: `tests/net-vocabulary.test.ts` audita `src/`, não
 * `tests/`, mas a perífrase é o padrão que os planos 03-08 e 03-09 registraram
 * para exatamente este caso e mantê-lo é mais barato que explicar a exceção.
 */
const FORBIDDEN_NOUN = 'h' + 'ost';

describe('o manifesto decide o mundo (SALA-03, D3-05)', () => {
  it('dois RunConfig idênticos produzem o mesmo hashWorld no tick 0', () => {
    const a = manifest([player('p0', 'ANA', 'mage'), player('p1', 'BIA', 'archer')]);
    const b = manifest([player('p0', 'ANA', 'mage'), player('p1', 'BIA', 'archer')]);
    expect(tickZero(a)).toBe(tickZero(b));
  });

  it('dois RunConfig que diferem só na seed divergem no tick 0', () => {
    const players = () => [player('p0', 'ANA', 'mage'), player('p1', 'BIA', 'archer')];
    expect(tickZero(manifest(players(), 1))).not.toBe(tickZero(manifest(players(), 2)));
  });

  it('dois RunConfig que diferem só na ORDEM de players divergem — a ordem é carga', () => {
    // FORM-02/D-13: `step()` itera ESTE array, e é ele que decide quem tira
    // qual número de `world.rng`. Se trocar a ordem não mudasse nada, a ordem
    // seria estilo — e o replay poderia reconstruir o mundo de outro jeito sem
    // que nada ficasse vermelho.
    const ana = player('p0', 'ANA', 'mage');
    const bia = player('p1', 'BIA', 'archer');
    expect(tickZero(manifest([ana, bia]))).not.toBe(tickZero(manifest([bia, ana])));
  });

  it('o forge de cada jogador entra no mundo dele, e não no do vizinho', () => {
    // `RunPlayer.forge` é POR JOGADOR (sim/types.ts): um manifesto que desse a
    // todos o forge de um só passaria em qualquer teste de igualdade de hash e
    // erraria exatamente a coisa que o co-op existe para permitir.
    const plain = manifest([player('p0', 'ANA', 'mage'), player('p1', 'BIA', 'archer')]);
    const vigorous = manifest([
      player('p0', 'ANA', 'mage'),
      player('p1', 'BIA', 'archer', forge({ vigor: 5 })),
    ]);
    expect(tickZero(plain)).not.toBe(tickZero(vigorous));
  });

  it('o mundo do tick 0 já tem a arena — startRun é quem chama generateArena', () => {
    // Anti-vacuidade da sequência canônica acima: se `buildWorld` parasse antes
    // de `startRun`, todos os testes de divergência ainda passariam (a seed já
    // difere no `rng`) e a comparação estaria medindo metade do mundo.
    const world = buildWorld(manifest([player('p0', 'ANA', 'mage')]));
    expect(world.obstacles.length, 'a arena do tick 0 não pode estar vazia').toBeGreaterThan(0);
    expect(world.tick).toBe(0);
  });
});

describe('o RunConfig que a sala monta (SALA-02, ADR 0001)', () => {
  it('a ordem de entrada vira p0..p3 e o array sai na ordem dos assentos', async () => {
    const room = openRoom('ANA', 'mage');
    await join(room, 'peer-b', 'BIA', 'archer');
    await join(room, 'peer-c', 'CID', 'warrior');
    const config = room.authority.startRoom({ seed: 7, mode: 'endless' });
    await flush();

    expect(config.players.map((p) => p.id)).toEqual(['p0', 'p1', 'p2']);
    expect(config.players.map((p) => p.name)).toEqual(['ANA', 'BIA', 'CID']);
    expect(slotsOf(room.authority.state())).toEqual(['p0', 'p1', 'p2']);
    // A tabela congelada é a única fonte dos assentos — nunca uma string solta.
    expect(config.players.map((p) => p.id)).toEqual([...PLAYER_SLOT].slice(0, 3));
    closeRoom(room);
  });

  it('o forge de cada ocupante viaja e chega diferente no manifesto', async () => {
    const room = openRoom('ANA', 'mage', forge({ vigor: 3 }));
    await join(room, 'peer-b', 'BIA', 'archer', forge({ honed: 4 }));
    const config = room.authority.startRoom({ seed: 7, mode: 'endless' });
    await flush();

    expect(config.players[0].forge.vigor).toBe(3);
    expect(config.players[1].forge.honed).toBe(4);
    expect(config.players[1].forge.vigor).toBe(0);
    closeRoom(room);
  });

  it('a seed do manifesto é a que a autoridade emitiu, e chega igual no convidado', async () => {
    const room = openRoom('ANA', 'mage');
    const guest = await join(room, 'peer-b', 'BIA', 'archer');
    const received: RunConfig[] = [];
    guest.onStart((config) => { received.push(config); });

    room.authority.startRoom({ seed: 0xc0ffee, mode: 'endless' });
    await flush();

    expect(received).toHaveLength(1);
    expect(received[0].seed).toBe(0xc0ffee);
    // A prova que interessa: os dois lados constroem o MESMO mundo do tick 0.
    expect(tickZero(received[0])).toBe(tickZero(room.authority.startRoom({ seed: 0xc0ffee, mode: 'endless' })));
    closeRoom(room);
  });

  it('solo é uma sala de um jogador — um ocupante, um RunPlayer, assento p0', async () => {
    // D3-04: quem criou a sala inicia, sozinho se quiser. É o que faz o
    // single-player e o co-op compartilharem o mesmo `beginRun`.
    const room = openRoom('ANA', 'mage');
    const config = room.authority.startRoom({ seed: 7, mode: 'endless' });
    await flush();

    expect(config.players).toHaveLength(1);
    expect(config.players[0].id).toBe('p0');
    closeRoom(room);
  });
});

describe('buildRunConfig e o assento local, auditados no texto', () => {
  it('buildRunConfig não sorteia mais a seed — ela vem de quem manda', () => {
    // A seed é o único ponto em que uma run pode ser não determinística, e
    // decidi-la localmente é o que faria duas máquinas da mesma sala
    // construírem dois mundos diferentes sem que nada reclamasse.
    expect(code(FORGE_PATH)).not.toContain('Math.random');
  });

  it('buildRunConfig recebe a seed como parâmetro', () => {
    const src = code(FORGE_PATH);
    expect(src).toContain('export function buildRunConfig');
    expect(src).toContain('seed: number');
  });

  it('nenhuma linha de código de forge.ts usa o substantivo que FORM-12 proíbe', () => {
    // A linha que dizia "in Marco 1 the ??? picks it and sends it to every
    // client" estava certa sobre o mecanismo e errada sobre o nome: quem emite
    // a seed é a AUTORIDADE, e o dia em que ela sair para um servidor dedicado
    // o nome tem de continuar descrevendo a realidade.
    expect(raw(FORGE_PATH).toLowerCase()).not.toContain(FORBIDDEN_NOUN);
  });

  it('o assento local de main.ts deixou de ser constante', () => {
    const src = code(MAIN_PATH);
    expect(src).not.toContain('const LOCAL_SLOT');
    // Anti-vacuidade: o arquivo continua tendo um assento local, e ele continua
    // nascendo em p0 para o caminho solo.
    expect(src).toContain('PlayerSlot');
  });

  it('beginRun lê o jogador local do manifesto pelo assento, não do argumento', () => {
    // Uma run que começa de uma classe diferente da que grava é uma divergência
    // que ninguém veria até o replay. `players[0]` era a resposta certa quando
    // só existia um jogador; num manifesto de quatro assentos ela é o vizinho.
    const src = code(MAIN_PATH);
    expect(src).not.toContain('config.players[0]');
    expect(src).toContain('config.players.find');
  });
});
