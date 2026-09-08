// ice-route.test.ts — a rota lida das estatísticas da conexão, o desfecho que
// vai para a tabela, e a flag de depuração que força o caminho de relay.
//
// Os relatórios abaixo são SINTÉTICOS, montados à mão no formato do W3C. Isso
// não é uma limitação do runner: é o único jeito de exercitar os casos que
// importam. Um par vencedor marcado só por `nominated`, um par `srflx`↔`srflx`,
// um relatório que traz endereço e porta — nenhum deles se reproduz sob demanda
// numa conexão real, e todos os três são exatamente onde a classificação erra.
//
// A tabela de casos segue o molde de tests/input-codec.test.ts: um caso por
// linha, com o nome dizendo o que ele prova, para que a falha aponte a linha e
// não o arquivo.
import { describe, it, expect } from 'vitest';
import {
  RELAY_FLAG_KEY,
  buildOutcome,
  clearRelayFlag,
  isSameNetwork,
  readRelayFlag,
  routeOf,
} from '../src/net/ice';
import type { StatsSource, StorageLike } from '../src/net/ice';

type Report = Record<string, unknown>;

/** Uma fonte de estatísticas com os relatórios que o teste montou. */
function source(entries: Record<string, Report>): StatsSource {
  const map = new Map<string, Report>(Object.entries(entries));
  return { getStats: () => Promise.resolve(map) };
}

/**
 * Um par de candidatos completo, com os campos que a implementação NÃO deve
 * ler já presentes.
 *
 * Endereço e porta entram de propósito: se eles não estivessem aqui, o teste
 * que prova a ausência deles no resultado passaria por vacuidade — ninguém
 * pode vazar um campo que nunca chegou.
 */
function pairOf(local: string, remote: string, extra: Report = {}): Record<string, Report> {
  return {
    'pair-1': {
      type: 'candidate-pair',
      state: 'succeeded',
      localCandidateId: 'local-1',
      remoteCandidateId: 'remote-1',
      currentRoundTripTime: 0.042,
      ...extra,
    },
    'local-1': {
      type: 'local-candidate',
      candidateType: local,
      protocol: 'udp',
      address: '192.168.0.10',
      port: 54321,
      ...(local === 'relay' ? { relayProtocol: 'udp' } : {}),
    },
    'remote-1': {
      type: 'remote-candidate',
      candidateType: remote,
      protocol: 'udp',
      address: '203.0.113.7',
      port: 3478,
      ...(remote === 'relay' ? { relayProtocol: 'tls' } : {}),
    },
  };
}

/** Um armazenamento falso: o runner é Node e não tem o do navegador. */
function fakeStorage(seed: Record<string, string> = {}): StorageLike & { data: Map<string, string> } {
  const data = new Map<string, string>(Object.entries(seed));
  return {
    data,
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => { data.set(key, value); },
    removeItem: (key) => { data.delete(key); },
  };
}

describe('rota a partir das estatísticas da conexão', () => {
  it('um par com state succeeded é o par escolhido', async () => {
    const report = await routeOf(source(pairOf('srflx', 'srflx')));
    expect(report.route).toBe('direct');
    expect(report.local).toBe('srflx');
    expect(report.remote).toBe('srflx');
    expect(report.protocol).toBe('udp');
  });

  it('sem succeeded, um par com nominated true é o par escolhido', async () => {
    // A enumeração do W3C não lista 'succeeded' e os motores o reportam mesmo
    // assim; depender de UMA das duas grafias é o modo de falha em que toda
    // linha da tabela vira 'unknown' e a medição inteira some.
    const reports = pairOf('srflx', 'relay', { state: 'in-progress', nominated: true });
    const report = await routeOf(source(reports));
    expect(report.route).toBe('relay');
    expect(report.remote).toBe('relay');
  });

  it('sem par vencedor, a rota é unknown com as duas pontas nulas', async () => {
    const reports = pairOf('srflx', 'srflx', { state: 'in-progress', nominated: false });
    const report = await routeOf(source(reports));
    // 'unknown' é o índice 0 da tabela congelada exatamente para isto: dado
    // ausente jamais pode decodificar como 'direct' e enviesar a medição para
    // baixo, que é a direção que ninguém investiga.
    expect(report.route).toBe('unknown');
    expect(report.local).toBeNull();
    expect(report.remote).toBeNull();
  });

  it('srflx ↔ srflx é direto: atravessou o NAT', async () => {
    const report = await routeOf(source(pairOf('srflx', 'srflx')));
    expect(report.route).toBe('direct');
  });

  it('relay em qualquer uma das duas pontas classifica como relay', async () => {
    const local = await routeOf(source(pairOf('relay', 'srflx')));
    expect(local.route).toBe('relay');
    const remote = await routeOf(source(pairOf('srflx', 'relay')));
    expect(remote.route).toBe('relay');
    // Uma ponta relayada já paga a latência e a banda; classificar isso como
    // 'direct' contaria como sucesso justamente a sessão que precisou do TURN.
    expect(remote.relayProtocol).toBe('tls');
  });

  it('o par escolhido pelo relatório de transporte tem precedência', async () => {
    const reports: Record<string, Report> = {
      ...pairOf('srflx', 'relay'),
      transport: { type: 'transport', selectedCandidatePairId: 'pair-2' },
      'pair-2': {
        type: 'candidate-pair', state: 'succeeded',
        localCandidateId: 'local-2', remoteCandidateId: 'remote-2',
      },
      'local-2': { type: 'local-candidate', candidateType: 'prflx', protocol: 'tcp' },
      'remote-2': { type: 'remote-candidate', candidateType: 'prflx', protocol: 'tcp' },
    };
    const report = await routeOf(source(reports));
    expect(report.local).toBe('prflx');
    expect(report.protocol).toBe('tcp');
  });

  it('o resultado não tem as chaves de endereço nem de porta', async () => {
    const report = await routeOf(source(pairOf('relay', 'relay')));
    const keys = Object.keys(report);
    // T-3-09: são IPs de jogadores, e D3-14 limita o dado pessoal ao ULID
    // local. A ausência é a mitigação, e o tipo do fio nem declara os campos —
    // um chamador que tentasse enviá-los não compilaria.
    expect(keys).not.toContain('address');
    expect(keys).not.toContain('port');
    expect(keys.sort()).toEqual(['local', 'protocol', 'relayProtocol', 'remote', 'route']);
  });

  it('as duas pontas na interface local são a mesma rede, e continuam diretas', async () => {
    const report = await routeOf(source(pairOf('host', 'host')));
    expect(report.route).toBe('direct');
    // Dois jogadores na mesma casa nunca exercitaram o NAT. A distinção existe
    // para que uma bateria de testes feita numa LAN não leia como "o caminho
    // direto funciona para todo mundo".
    expect(isSameNetwork(report)).toBe(true);
    expect(isSameNetwork(await routeOf(source(pairOf('srflx', 'srflx'))))).toBe(false);
  });
});

describe('desfecho ICE', () => {
  it('buildOutcome carrega um ULID novo e nenhuma chave de endereço', async () => {
    let n = 0;
    const ulid = () => `01ULID${n++}`;
    const report = await routeOf(source(pairOf('srflx', 'relay')));
    const outcome = buildOutcome(ulid, {
      code: 'ABC123', slot: 'p1', report, rttMs: 42, result: 'connected',
    });

    expect(outcome.kind).toBe('iceOutcome');
    expect(outcome.id).toBe('01ULID0');
    expect(outcome.route).toBe('relay');
    expect(outcome.localCandidate).toBe('srflx');
    expect(outcome.result).toBe('connected');
    const keys = Object.keys(outcome);
    expect(keys).not.toContain('address');
    expect(keys).not.toContain('port');
    // Ids diferentes a cada chamada: é a chave de idempotência da tabela
    // append-only, e dois reportes com o mesmo id seriam um só (ADR 0002).
    const second = buildOutcome(ulid, {
      code: 'ABC123', slot: 'p1', report, rttMs: 42, result: 'connected',
    });
    expect(second.id).not.toBe(outcome.id);
  });

  it('a linha de falha também é gerada, com rota unknown e o último par tentado', async () => {
    const report = await routeOf(source(pairOf('srflx', 'relay')));
    const outcome = buildOutcome(() => '01ULIDX', {
      code: 'ABC123', slot: 'p2', report, rttMs: null, result: 'failed',
    });
    // Sem esta metade a tabela mede só os sucessos e a taxa de necessidade de
    // relay fica errada para cima (D3-14).
    expect(outcome.result).toBe('failed');
    expect(outcome.route).toBe('unknown');
    // O par tentado sobrevive: é a única pista de POR QUE falhou.
    expect(outcome.localCandidate).toBe('srflx');
    expect(outcome.remoteCandidate).toBe('relay');
    expect(outcome.rttMs).toBeNull();
  });
});

describe('flag de relay forçado', () => {
  const URL_BASE = 'https://exemplo.test/jogo';

  it('a query ice=relay liga, persiste e some da URL', () => {
    const storage = fakeStorage();
    const replaced: string[] = [];
    const on = readRelayFlag({
      url: `${URL_BASE}?sala=ABC123&ice=relay`,
      storage,
      replaceUrl: (url) => { replaced.push(url); },
    });

    expect(on).toBe(true);
    expect(storage.data.get(RELAY_FLAG_KEY)).toBeTruthy();
    // A query some para que colar a URL do navegador num chat não ligue a flag
    // de quem receber (T-3-29) — e `?sala=` sobrevive, porque é ela que faz o
    // link de convite funcionar (D3-07).
    expect(replaced).toHaveLength(1);
    expect(replaced[0]).not.toContain('ice=relay');
    expect(replaced[0]).toContain('sala=ABC123');
  });

  it('sem query e sem a chave gravada, a flag está desligada', () => {
    const storage = fakeStorage();
    const replaced: string[] = [];
    const on = readRelayFlag({
      url: URL_BASE, storage, replaceUrl: (url) => { replaced.push(url); },
    });
    // NUNCA ligada por padrão. Este é o critério 3 de SALA-04.
    expect(on).toBe(false);
    expect(replaced).toEqual([]);
  });

  it('sem query mas com a chave gravada, a flag continua ligada entre recargas', () => {
    const storage = fakeStorage({ [RELAY_FLAG_KEY]: 'relay' });
    const on = readRelayFlag({ url: URL_BASE, storage, replaceUrl: () => {} });
    // É esta metade que faz a flag sobreviver a um teste de reconexão — uma
    // query pura sumiria na primeira recarga.
    expect(on).toBe(true);
  });

  it('clearRelayFlag apaga a chave', () => {
    const storage = fakeStorage({ [RELAY_FLAG_KEY]: 'relay' });
    clearRelayFlag(storage);
    expect(storage.data.has(RELAY_FLAG_KEY)).toBe(false);
    expect(readRelayFlag({ url: URL_BASE, storage, replaceUrl: () => {} })).toBe(false);
  });

  it('um valor estranho na query não liga nada', () => {
    const storage = fakeStorage();
    const on = readRelayFlag({
      url: `${URL_BASE}?ice=sim`, storage, replaceUrl: () => {},
    });
    // Só o valor nomeado liga. Um `?ice=` qualquer ligando o relay faria a flag
    // ser acionável por acidente, que é o oposto do que ela precisa ser.
    expect(on).toBe(false);
    expect(storage.data.size).toBe(0);
  });
});
