// net-signaling.test.ts — o cliente do WebSocket de signaling, provado em Node
// sem abrir um socket.
//
// O runner deste repositório é Node sem jsdom (vitest.config.ts), então
// `WebSocket` simplesmente não existe aqui. Isso não é um obstáculo que o teste
// contorna: é a razão da forma do módulo. `createSignalingClient` recebe
// `open(url)` como dependência, exatamente como `createShutdown` recebe
// `startWatchdog` em apps/server/src/shutdown.ts, e o duplo abaixo é o que
// permite exercitar as doze mensagens do protocolo — inclusive a reconexão com
// backoff — em microssegundos e sem rede.
//
// O DUPLO É DELIBERADAMENTE BURRO. Ele não valida nada, não responde sozinho e
// não conhece o protocolo: guarda o que foi enviado como TEXTO e expõe os
// quatro callbacks para o teste disparar. Um duplo que soubesse responder um
// `created` a um `create` estaria testando a si mesmo, e um que validasse a
// mensagem enviada duplicaria o schema do servidor — que é onde a validação
// mora (plano 03-04), e onde ela é asserida contra o tipo do fio.
import { describe, it, expect, vi } from 'vitest';
import type { Versions } from '@dg2/protocol';
import {
  BAD_CODE_MESSAGE,
  RECONNECT_BASE_MS,
  createSignalingClient,
} from '../src/net/signaling';
import type { Identity, SocketLike } from '../src/net/signaling';
import { fakeClock } from './net/helpers';

/**
 * Eventos do DOM que o duplo dispara.
 *
 * `{} as Event` e não um `new Event(...)`: `CloseEvent` não é global em todo
 * runtime de Node, e o módulo não lê um único campo desses objetos — o único
 * que ele lê é `data`, do `MessageEvent`. Fabricar o evento inteiro custaria
 * uma dependência de plataforma para carregar zero informação.
 */
const EVENT = {} as Event;
const CLOSE = {} as CloseEvent;

const VERSIONS: Versions = { sim: 'abc123', protocol: '2' };
const WHO: Identity = { accountId: '01ABC', name: 'ANA', versions: VERSIONS };

interface FakeSocket extends SocketLike {
  readonly sent: string[];
  closed: boolean;
}

function fakeSocket(): FakeSocket {
  const sent: string[] = [];
  return {
    sent,
    closed: false,
    send(data: string) { sent.push(data); },
    close() { this.closed = true; },
    onopen: null,
    onmessage: null,
    onclose: null,
    onerror: null,
  };
}

/** O que o teste precisa: o cliente, o relógio falso e os sockets abertos. */
function harness() {
  const sockets: FakeSocket[] = [];
  const urls: string[] = [];
  const clock = fakeClock();
  const log = vi.fn();
  const open = (url: string): SocketLike => {
    urls.push(url);
    const socket = fakeSocket();
    sockets.push(socket);
    return socket;
  };
  const client = createSignalingClient({
    url: 'wss://exemplo.test/ws',
    open,
    log,
    now: clock.now,
    schedule: clock.schedule,
  });
  /** O socket mais recente — o duplo é criado uma vez por tentativa. */
  const last = (): FakeSocket => {
    const socket = sockets[sockets.length - 1];
    expect(socket, 'nenhum socket foi aberto').toBeTruthy();
    return socket;
  };
  /** Completa o handshake do socket mais recente. */
  const openIt = (): void => { last().onopen?.(EVENT); };
  /** Entrega um objeto ao cliente já serializado, como o fio faria. */
  const deliver = (value: unknown): void => {
    last().onmessage?.({ data: JSON.stringify(value) } as MessageEvent);
  };
  /** Entrega texto cru, para o caso que não é JSON. */
  const deliverRaw = (text: string): void => {
    last().onmessage?.({ data: text } as MessageEvent);
  };
  /** As mensagens que saíram, já decodificadas. */
  const outbox = (): Record<string, unknown>[] =>
    last().sent.map((text) => JSON.parse(text) as Record<string, unknown>);

  return { client, clock, log, sockets, urls, last, openIt, deliver, deliverRaw, outbox };
}

describe('cliente do signaling', () => {
  it('create manda kind create com as versões e resolve com código, autoridade e ICE', async () => {
    const h = harness();
    const promise = h.client.create(WHO);
    h.openIt();

    expect(h.outbox()).toEqual([
      { kind: 'create', accountId: '01ABC', name: 'ANA', versions: VERSIONS },
    ]);

    h.deliver({
      kind: 'created',
      code: 'ABC123',
      peerId: 'peer-1',
      authorityPeerId: 'peer-1',
      slot: 'p0',
      ice: { iceServers: [{ urls: ['stun:exemplo.test:3478'] }] },
      turn: { username: 'u', credential: 'c', ttl: 600 },
    });

    const entry = await promise;
    expect(entry.code).toBe('ABC123');
    expect(entry.authorityPeerId).toBe('peer-1');
    expect(entry.ice.iceServers[0].urls).toEqual(['stun:exemplo.test:3478']);
    // `created` não traz lista de ocupantes; a forma única devolve uma vazia em
    // vez de `undefined`, para que o chamador não tenha dois caminhos.
    expect(entry.peers).toEqual([]);
  });

  it('join normaliza o código antes de enviar', async () => {
    const h = harness();
    const promise = h.client.join('abc-1o3', WHO);
    h.openIt();

    // 'o' vira '0' pela tabela de Crockford, o hífen some, e o que viaja é a
    // forma canônica — que é a única que o servidor aceita (isRoomCode).
    expect(h.outbox()[0]).toMatchObject({ kind: 'join', code: 'ABC103' });

    h.deliver({
      kind: 'joined',
      code: 'ABC103',
      peerId: 'peer-2',
      authorityPeerId: 'peer-1',
      slot: 'p1',
      ice: { iceServers: [] },
      turn: { username: 'u', credential: 'c', ttl: 600 },
      peers: [{ peerId: 'peer-1', accountId: '01A', name: 'BIA', slot: 'p0' }],
    });

    const entry = await promise;
    expect(entry.slot).toBe('p1');
    expect(entry.peers).toHaveLength(1);
  });

  it('join recusa um código inválido localmente, sem abrir a conexão', async () => {
    const h = harness();
    // 'U' não está no alfabeto e nunca é mapeado — ver roomCode.ts.
    await expect(h.client.join('UUUUUU', WHO)).rejects.toMatchObject({
      reason: 'badCode',
      detail: BAD_CODE_MESSAGE,
    });
    // A economia que a recusa local compra: uma ida ao servidor e uma ficha do
    // balde de rate limit que protege os seis caracteres (T-3-01).
    expect(h.sockets).toHaveLength(0);
  });

  it('um error com badCode rejeita com a razão nomeada, não com uma string', async () => {
    const h = harness();
    const promise = h.client.join('ABC123', WHO);
    h.openIt();
    h.deliver({ kind: 'error', reason: 'badCode', detail: 'código de sala inválido' });

    await expect(promise).rejects.toMatchObject({ reason: 'badCode' });
    // A razão vem da tabela congelada e é o que o chamador pode ramificar;
    // `detail` é texto para a tela e nunca condição (D-08).
    await promise.catch((error: { reason: string }) => {
      expect(['simVersion', 'protocolVersion', 'roomFull', 'roomClosed', 'badCode'])
        .toContain(error.reason);
    });
  });

  it('uma recusa por protocolVersion carrega ours e o detail com os dois valores', async () => {
    const h = harness();
    const promise = h.client.create(WHO);
    h.openIt();
    h.deliver({
      kind: 'error',
      reason: 'protocolVersion',
      detail: 'sua versão 2, a da sala 3',
    });

    // `ours` é estrutural porque este lado o conhece com certeza — é o que ele
    // acabou de enviar. `theirs` chega dentro de `detail`, o campo que D-08
    // reserva para a tela, e o cliente o repassa VERBATIM: parseá-lo seria
    // ramificar em texto livre, que é exatamente o que D-08 proíbe.
    await expect(promise).rejects.toMatchObject({
      reason: 'protocolVersion',
      ours: VERSIONS,
      detail: 'sua versão 2, a da sala 3',
    });
  });

  it('offer, answer e candidate são entregues ao callback sem serem interpretados', async () => {
    const h = harness();
    const seen: unknown[] = [];
    h.client.onSignal((message) => { seen.push(message); });
    void h.client.create(WHO).catch(() => {});
    h.openIt();

    // Um SDP que nenhum parser aceitaria. O cliente não é parser de SDP: ele é
    // destinatário de bytes opacos, e a `RTCPeerConnection` é o parser
    // endurecido do motor (T-3-30).
    h.deliver({ kind: 'offer', from: 'peer-1', to: 'peer-2', sdp: 'isto não é SDP' });
    h.deliver({
      kind: 'candidate', from: 'peer-1', to: 'peer-2',
      candidate: 'candidate:qualquer coisa', sdpMid: '0', sdpMLineIndex: 0,
    });

    expect(seen).toEqual([
      { kind: 'offer', from: 'peer-1', to: 'peer-2', sdp: 'isto não é SDP' },
      {
        kind: 'candidate', from: 'peer-1', to: 'peer-2',
        candidate: 'candidate:qualquer coisa', sdpMid: '0', sdpMLineIndex: 0,
      },
    ]);
  });

  it('uma mensagem com kind fora de SIGNAL_KIND é ignorada e logada', () => {
    const h = harness();
    const seen: unknown[] = [];
    h.client.onSignal((message) => { seen.push(message); });
    void h.client.create(WHO).catch(() => {});
    h.openIt();

    h.deliver({ kind: 'startRun', payload: 42 });
    h.deliver(['nem sequer um objeto']);

    expect(seen).toEqual([]);
    expect(h.log).toHaveBeenCalled();
    // Ignorada, não fatal: o cliente segue vivo e a próxima mensagem válida é
    // entregue normalmente.
    h.deliver({ kind: 'peers', peers: [] });
    expect(seen).toEqual([{ kind: 'peers', peers: [] }]);
  });

  it('texto que não é JSON é ignorado e logado, sem derrubar o cliente', () => {
    const h = harness();
    void h.client.create(WHO).catch(() => {});
    h.openIt();
    expect(() => h.deliverRaw('{ isto não fecha')).not.toThrow();
    expect(h.log).toHaveBeenCalled();
  });

  it('o socket que fecha dispara onDisconnected e o cliente reabre o WebSocket', () => {
    const h = harness();
    const drops: number[] = [];
    h.client.onDisconnected(() => { drops.push(1); });
    void h.client.create(WHO).catch(() => {});
    h.openIt();
    expect(h.sockets).toHaveLength(1);

    h.last().onclose?.(CLOSE);
    expect(drops).toHaveLength(1);
    // Nada acontece antes do backoff: um cliente que reabrisse na hora
    // martelaria um servidor que acabou de reiniciar.
    expect(h.sockets).toHaveLength(1);
    h.clock.advance(RECONNECT_BASE_MS);
    expect(h.sockets).toHaveLength(2);
    expect(h.urls[1]).toBe('wss://exemplo.test/ws');
  });

  it('a promessa pendente é rejeitada quando o socket cai', async () => {
    const h = harness();
    const promise = h.client.create(WHO);
    h.openIt();
    h.last().onclose?.(CLOSE);
    // Sem isto a promessa ficaria pendente para sempre e a tela de "criando
    // sala…" nunca sairia — a forma de travamento mais cara de diagnosticar,
    // porque não há erro nenhum em lugar nenhum.
    await expect(promise).rejects.toMatchObject({ reason: 'roomClosed' });
  });

  it('close() encerra o socket e não reabre nada', () => {
    const h = harness();
    void h.client.create(WHO).catch(() => {});
    h.openIt();
    const socket = h.last();
    h.client.close();
    expect(socket.closed).toBe(true);
    socket.onclose?.(CLOSE);
    h.clock.advance(RECONNECT_BASE_MS * 100);
    expect(h.sockets).toHaveLength(1);
    expect(h.clock.pending()).toBe(0);
  });
});
