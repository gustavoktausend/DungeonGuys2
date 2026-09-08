// ping.test.ts — o número que vai aparecer no lobby, medido contra um relógio
// que o teste possui.
//
// No estilo de tests/stepper.test.ts: tempo injetado, nenhuma espera real. O
// `createPinger` recebe `now` e `schedule` como argumentos (transport.ts
// declara o tipo, apps/server/src/shutdown.ts abriu o precedente com
// `startWatchdog`), então três segundos de medição custam microssegundos e o
// que fica asserido é uma SEQUÊNCIA, não um relógio.
//
// O TRANSPORTE É O GRAVADOR, NÃO O CABO EM PROCESSO. Um pong precisa chegar num
// instante exato do relógio falso; um salto de microtask entre `advance()` e a
// resposta poria a amostra num instante que o teste não escolheu, e a mediana
// deixaria de ser verificável.
//
// O QUADRO É MONTADO E LIDO À MÃO, com `DataView`. Este arquivo não importa o
// codificador de src/net/ping.ts de propósito: o formato de 7 bytes é a coisa
// que está sendo especificada, e um teste que usasse o codificador do módulo
// para verificar o módulo passaria com qualquer formato desde que fosse
// consistente consigo mesmo.
import { describe, it, expect } from 'vitest';
import { MSG_KIND } from '@dg2/protocol';
import {
  createPinger, PING_FRAME_BYTES, PING_INTERVAL_MS, PING_TIMEOUT_MS,
} from '../src/net/ping';
import { fakeClock, recordingTransport } from './net/helpers';

const KIND_PING = MSG_KIND.indexOf('ping');
const KIND_PONG = MSG_KIND.indexOf('pong');
const PEER = 'peer-b';

function frame(kind: number, seq: number, tick: number): ArrayBuffer {
  const buf = new ArrayBuffer(PING_FRAME_BYTES);
  const view = new DataView(buf);
  view.setUint8(0, kind);
  view.setUint16(1, seq, true);
  view.setUint32(3, tick, true);
  return buf;
}

function read(payload: ArrayBuffer) {
  const view = new DataView(payload);
  return {
    bytes: payload.byteLength,
    kind: view.getUint8(0),
    seq: view.getUint16(1, true),
    tick: view.getUint32(3, true),
  };
}

function setup(tick = 0) {
  const clock = fakeClock();
  const rec = recordingTransport();
  const pinger = createPinger({
    transport: rec.transport, peer: PEER,
    now: clock.now, schedule: clock.schedule, tick: () => tick,
  });
  /** O instante do relógio falso, espelhado aqui para o `cycle` abaixo. */
  const at = { t: 0 };

  /**
   * Um ping e o pong dele, com o RTT que o teste escolher.
   *
   * Avança até o instante EXATO da próxima emissão (múltiplo do intervalo)
   * antes de contar o RTT — sem isso, um ciclo que começasse no meio de um
   * segundo mediria o tempo até a emissão junto com o tempo de ida e volta, e a
   * amostra não seria a que o teste pediu.
   */
  function cycle(rtt: number): void {
    const next = Math.ceil((at.t + 1) / PING_INTERVAL_MS) * PING_INTERVAL_MS;
    clock.advance(next - at.t);
    at.t = next;
    const sent = read(rec.sent[rec.sent.length - 1].payload);
    expect(sent.kind).toBe(KIND_PING);
    clock.advance(rtt);
    at.t += rtt;
    rec.deliver(PEER, frame(KIND_PONG, sent.seq, 0), 'unreliable');
  }

  function advance(ms: number): void {
    clock.advance(ms);
    at.t += ms;
  }

  return { clock, rec, pinger, cycle, advance };
}

describe('medição de RTT por ping/pong (SALA-05, D3-13)', () => {
  it('um ping é 7 bytes: kind, seq u16 LE e tick u32 LE', () => {
    const { rec, advance } = setup(1234);
    advance(PING_INTERVAL_MS);

    expect(rec.sent).toHaveLength(1);
    const sent = read(rec.sent[0].payload);
    expect(sent.bytes).toBe(7);
    expect(sent.kind).toBe(KIND_PING);
    expect(sent.seq).toBe(0);
    expect(sent.tick).toBe(1234);
  });

  it('o pong devolve o mesmo seq, no mesmo formato de 7 bytes', () => {
    const { rec } = setup(7);
    rec.deliver(PEER, frame(KIND_PING, 4242, 99), 'unreliable');

    expect(rec.sent).toHaveLength(1);
    const reply = read(rec.sent[0].payload);
    expect(reply.bytes).toBe(7);
    expect(reply.kind).toBe(KIND_PONG);
    expect(reply.seq).toBe(4242);
  });

  it('nenhum relógio atravessa o fio: o carimbo fica local', () => {
    // O relógio começa em zero e é avançado 1000; o campo u32 do quadro tem de
    // ser o TICK e nada mais. Um carimbo de tempo no fio precisaria dos dois
    // lados concordando sobre um relógio — e seria forjável pelo lado remoto.
    const { rec, advance } = setup(5);
    advance(PING_INTERVAL_MS);
    const sent = read(rec.sent[0].payload);

    expect(sent.tick).toBe(5);
    expect(sent.tick).not.toBe(PING_INTERVAL_MS);
    expect(sent.bytes).toBe(7);
  });

  it('cinco amostras 10, 200, 12, 11, 13 dão a mediana 12, e não a média', () => {
    const { pinger, cycle } = setup();
    for (const rtt of [10, 200, 12, 11, 13]) cycle(rtt);

    // A média seria 49,2 — arrastada pelo único pico. A mediana ignora o
    // outlier e ainda responde em três segundos a uma degradação real.
    expect(pinger.rtt()).toBe(12);
    expect(pinger.state()).toBe('ok');
  });

  it('um ping sem pong em 3000 ms conta como perdido e não entra na janela', () => {
    const { pinger, cycle, advance } = setup();
    cycle(10);
    expect(pinger.rtt()).toBe(10);

    // Silêncio até que exatamente um ping estoure o prazo.
    advance(PING_TIMEOUT_MS + PING_INTERVAL_MS);

    // O número continua sendo o que foi MEDIDO. Uma perda que entrasse na
    // janela como infinito (ou como zero) inventaria uma amostra que nenhum
    // pacote produziu, e o canal é `unreliable`: perder um ping é normal.
    expect(pinger.rtt()).toBe(10);
    expect(Number.isFinite(pinger.rtt())).toBe(true);
    expect(pinger.state()).toBe('ok');
  });

  it('três perdas seguidas viram sem resposta, e um pong depois zera o contador', () => {
    const { rec, pinger, cycle, advance } = setup();
    cycle(10);

    advance(PING_TIMEOUT_MS + 3 * PING_INTERVAL_MS);
    // Um ping congelado em "10 ms" durante uma queda é pior que nenhum número.
    expect(pinger.state()).toBe('sem-resposta');
    expect(pinger.rtt()).toBeNull();

    const pendente = read(rec.sent[rec.sent.length - 1].payload);
    rec.deliver(PEER, frame(KIND_PONG, pendente.seq, 0), 'unreliable');

    expect(pinger.state()).toBe('ok');
    expect(pinger.rtt()).not.toBeNull();
  });

  it('um pong com seq desconhecido é ignorado sem erro', () => {
    const { rec, pinger, cycle } = setup();
    cycle(10);
    const antes = rec.sent.length;

    expect(() => {
      rec.deliver(PEER, frame(KIND_PONG, 60000, 0), 'unreliable');
    }).not.toThrow();

    expect(pinger.rtt()).toBe(10);
    expect(rec.sent).toHaveLength(antes);
  });

  it('ping e pong saem no canal unreliable, nunca no reliable', () => {
    const { rec, advance } = setup();
    advance(3 * PING_INTERVAL_MS);
    rec.deliver(PEER, frame(KIND_PING, 1, 0), 'unreliable');

    expect(rec.sent.length).toBeGreaterThan(1);
    // Um snapshot obsoleto retransmitido chega tarde e caro; uma medição de RTT
    // retransmitida mede a retransmissão, que é pior que não medir.
    expect(rec.sent.every((s) => s.ch === 'unreliable')).toBe(true);
    expect(rec.sent.some((s) => s.ch === 'reliable')).toBe(false);
  });

  it('um quadro de outro peer não é respondido nem medido', () => {
    const { rec, pinger } = setup();
    rec.deliver('peer-estranho', frame(KIND_PING, 1, 0), 'unreliable');

    expect(rec.sent).toEqual([]);
    expect(pinger.state()).toBe('medindo');
  });

  it('close() para de pingar e não deixa deadline armado', () => {
    const { clock, rec, pinger, advance } = setup();
    advance(PING_INTERVAL_MS);
    expect(clock.pending()).toBeGreaterThan(0);

    pinger.close();
    const antes = rec.sent.length;
    advance(5 * PING_INTERVAL_MS);

    expect(clock.pending()).toBe(0);
    expect(rec.sent).toHaveLength(antes);
  });
});
