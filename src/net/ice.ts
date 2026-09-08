// ice.ts — a rota, o desfecho e a flag de depuração.
//
// DUAS COISAS SÃO SEPARADAS AQUI COM ÊNFASE, PORQUE JUNTÁ-LAS É O ERRO NATURAL.
//
//   AS ESTATÍSTICAS DA CONEXÃO NÃO SÃO A FONTE DO PING (D3-13). O número que o
//   jogador vê sai das mensagens `ping`/`pong` de src/net/ping.ts, no canal não
//   confiável, porque é esse o caminho que `input` e `snapshot` vão percorrer na
//   fase 4 — é a ida e volta do JOGO. O que as estatísticas medem é a ida e
//   volta da checagem de conectividade no par de candidatos, que é outra
//   quantidade, e que nem existe antes de o ICE assentar. Mostrar uma no lugar
//   da outra seria exibir ao jogador um número que não corresponde ao que ele
//   está sentindo.
//
//   AS ESTATÍSTICAS SÃO A ÚNICA FONTE DA ROTA. Só a conexão sabe qual par de
//   candidatos venceu, e portanto só ela sabe se a sessão atravessou o NAT ou
//   se está pagando um relay. Não há como derivar isso de fora.
//
// O QUE NÃO É LIDO, E POR QUÊ. Os relatórios de candidato trazem o endereço e a
// porta de cada ponta. São IPs de jogadores. D3-14 limita esta telemetria ao
// ULID local, e o tipo do fio (`IceOutcome`, em packages/protocol) nem declara
// os campos — então um chamador que tentasse enviá-los não compilaria. A
// ausência é a mitigação de T-3-09, não um esquecimento, e um critério de
// aceitação deste plano é o grep que a prova. O tipo de candidato mais o
// transporte respondem a pergunta inteira que a tabela existe para responder:
// com que frequência o relay é necessário.
//
// AS DUAS GRAFIAS DE "ESTE PAR VENCEU". A enumeração do W3C para o estado de um
// par lista `new`, `checking`, `connected`, `completed`, `failed`,
// `disconnected` e `closed` — e os motores reportam `succeeded` na prática. Por
// isso a busca aceita `succeeded` OU a marca de par nomeado, e ainda dá
// precedência ao par que o relatório de transporte apontou. Depender de um
// valor só é o modo de falha em que toda linha da tabela vira `unknown`: nada
// quebra, nada lança, e a medição inteira simplesmente deixa de existir.
//
// A FLAG DE RELAY: QUERY LIDA UMA VEZ, PERSISTIDA, E REMOVIDA DA URL. As três
// alternativas foram consideradas e cada uma falha num ponto concreto. Query
// pura some ao recarregar, então nunca sobrevive a um teste de reconexão —
// justamente o teste para o qual a flag existe. Armazenamento puro exige abrir
// as ferramentas de desenvolvedor, e ninguém faz isso num celular, que é onde o
// NAT residencial brasileiro realmente aparece. Um interruptor escondido nas
// configurações custaria uma tela a mais nesta fase. A combinação escolhida é
// ligável por um link colado num celular, persiste, e não vaza.
//
// ELA NUNCA ESTÁ LIGADA POR PADRÃO, e o badge é a parte NÃO NEGOCIÁVEL. Sem um
// sinal visível permanente, alguém liga a flag, esquece, e reporta "o jogo está
// com lag" — e o diagnóstico custa mais horas do que a flag economizou. O badge
// em si é DOM e pertence ao plano 03-09; o que este módulo faz é expor o estado
// que ele lê, e dizer aqui por que ele não é opcional.
//
// "COPIAR LINK" MONTA O LINK A PARTIR DO CÓDIGO DA SALA, NUNCA DA URL ATUAL DO
// NAVEGADOR. É isso que impede a flag de depuração de viajar junto quando
// alguém compartilha a sala (T-3-29); a remoção da query é a segunda camada,
// para o caso de a pessoa copiar da barra de endereços do navegador.
import { ICE_CANDIDATE_TYPE } from '@dg2/protocol';
import type { IceCandidateType, IceOutcome, IceRoute } from '@dg2/protocol';

/** A chave sob a qual a flag persiste no armazenamento do navegador. */
export const RELAY_FLAG_KEY = 'dg2.ice';

/** O parâmetro de URL que liga a flag, e o único valor que a liga. */
export const RELAY_FLAG_PARAM = 'ice';
export const RELAY_FLAG_VALUE = 'relay';

/**
 * A conexão, no único aspecto que este módulo usa.
 *
 * Interface estreita e não `RTCPeerConnection`, pelo mesmo motivo que
 * `DrainableServer` existe em apps/server/src/shutdown.ts: declarar o que o
 * chamador precisa é o que permite ao teste passar relatórios sintéticos, que
 * é o único jeito de exercitar um par vencedor marcado só por nomeação.
 */
export interface StatsSource {
  getStats(): Promise<ReadonlyMap<string, Record<string, unknown>>>;
}

/**
 * A rota, como este módulo a reporta.
 *
 * Cinco campos e nem um a mais — ver o cabeçalho sobre o que não está aqui.
 */
export interface IceRouteReport {
  route: IceRoute;
  local: IceCandidateType | null;
  remote: IceCandidateType | null;
  protocol: 'udp' | 'tcp' | null;
  relayProtocol: 'udp' | 'tcp' | 'tls' | null;
}

/** O armazenamento do navegador, no mínimo que a flag usa. Injetado. */
export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export interface RelayFlagDeps {
  /**
   * A URL completa como ela chegou.
   *
   * A URL inteira e não só a parte de consulta: é ela que precisa ser
   * reconstruída sem o parâmetro, e reconstruir a partir de um pedaço faria a
   * remoção arrastar junto o `?sala=` que o link de convite usa (D3-07).
   */
  url: string;
  storage: StorageLike;
  /** Troca o endereço exibido sem navegar. No navegador, uma linha só. */
  replaceUrl: (url: string) => void;
}

/** O que `buildOutcome` precisa saber além do que já está no relatório. */
export interface OutcomeInput {
  code: string;
  slot: IceOutcome['slot'];
  report: IceRouteReport;
  rttMs: number | null;
  result: 'connected' | 'failed';
}

/** Os quatro tipos de candidato, como conjunto, vindos da tabela congelada. */
const CANDIDATE_TYPES: ReadonlySet<string> = new Set<string>(ICE_CANDIDATE_TYPE);
const PAIR_TRANSPORTS: ReadonlySet<string> = new Set(['udp', 'tcp']);
const RELAY_TRANSPORTS: ReadonlySet<string> = new Set(['udp', 'tcp', 'tls']);

/**
 * O relatório de quando não deu para saber: nenhum par vencedor, estatísticas
 * ilegíveis, ou uma conexão que já não existe para ser perguntada.
 *
 * Exportado porque é também o que o reporte de desfecho envia quando a leitura
 * falha — uma linha com rota `unknown` ainda conta a sessão, e uma sessão que
 * não fosse contada por não ter estatística enviesaria a taxa que a tabela
 * existe para medir.
 */
export const UNKNOWN_ROUTE: IceRouteReport = {
  // 'unknown' é o índice 0 da tabela congelada, escolhido para que dado ausente
  // jamais decodifique como 'direct'. O viés de um erro aqui iria para baixo —
  // a direção tranquilizadora, que é a que ninguém investiga.
  route: 'unknown',
  local: null,
  remote: null,
  protocol: null,
  relayProtocol: null,
};

type Stats = ReadonlyMap<string, Record<string, unknown>>;

function text(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

function candidateTypeOf(report: Record<string, unknown> | undefined): IceCandidateType | null {
  const value = report ? text(report.candidateType) : null;
  return value !== null && CANDIDATE_TYPES.has(value) ? (value as IceCandidateType) : null;
}

/**
 * O par que venceu, nas três formas em que um motor pode dizer isso.
 *
 * A ordem é de autoridade decrescente: o par que o relatório de transporte
 * aponta é a resposta do próprio motor à pergunta, e as duas buscas seguintes
 * são o que sobra quando ele não a responde.
 */
function winnerOf(stats: Stats): Record<string, unknown> | null {
  let selectedId: string | null = null;
  for (const report of stats.values()) {
    if (text(report.type) === 'transport') {
      const id = text(report.selectedCandidatePairId);
      if (id !== null) selectedId = id;
    }
  }
  if (selectedId !== null) {
    const chosen = stats.get(selectedId);
    if (chosen) return chosen;
  }

  let succeeded: Record<string, unknown> | null = null;
  let nominated: Record<string, unknown> | null = null;
  for (const report of stats.values()) {
    if (text(report.type) !== 'candidate-pair') continue;
    if (text(report.state) === 'succeeded') succeeded ??= report;
    else if (report.nominated === true) nominated ??= report;
  }
  return succeeded ?? nominated;
}

/**
 * Classifica a rota do par vencedor.
 *
 * `relay` quando QUALQUER uma das duas pontas é uma alocação de relay: uma
 * ponta relayada já paga a latência e a banda, e classificá-la como direta
 * contaria como sucesso justamente a sessão que precisou do TURN. Um par
 * `srflx` ↔ `srflx` é DIRETO — ele atravessou o NAT por conta própria, e essa
 * distinção é exatamente o que a taxa real de necessidade de relay mede.
 */
export async function routeOf(pc: StatsSource): Promise<IceRouteReport> {
  const stats = await pc.getStats();
  const pair = winnerOf(stats);
  if (!pair) return { ...UNKNOWN_ROUTE };

  const localId = text(pair.localCandidateId);
  const remoteId = text(pair.remoteCandidateId);
  const localReport = localId !== null ? stats.get(localId) : undefined;
  const remoteReport = remoteId !== null ? stats.get(remoteId) : undefined;
  const local = candidateTypeOf(localReport);
  const remote = candidateTypeOf(remoteReport);

  let route: IceRoute = 'unknown';
  if (local === 'relay' || remote === 'relay') route = 'relay';
  // Só quando as DUAS pontas são conhecidas. Um par com um lado ilegível não é
  // evidência de conexão direta; é evidência de que não deu para saber.
  else if (local !== null && remote !== null) route = 'direct';

  const transport = localReport ? text(localReport.protocol) : null;
  const relayFrom = local === 'relay' ? localReport : remoteReport;
  const relayTransport = relayFrom ? text(relayFrom.relayProtocol) : null;

  return {
    route,
    local,
    remote,
    protocol: transport !== null && PAIR_TRANSPORTS.has(transport)
      ? (transport as 'udp' | 'tcp')
      : null,
    relayProtocol: route === 'relay' && relayTransport !== null && RELAY_TRANSPORTS.has(relayTransport)
      ? (relayTransport as 'udp' | 'tcp' | 'tls')
      : null,
  };
}

/**
 * As duas pontas são a interface local: os dois jogadores estão na MESMA rede.
 *
 * A rota continua sendo `direct` e isso é verdade — mas é uma verdade que não
 * exercitou NAT nenhum. Uma bateria de testes feita entre duas máquinas da
 * mesma casa produziria uma taxa de conexão direta perfeita e sem valor
 * preditivo, e quem ler a tabela precisa poder separar esses casos. É a única
 * razão pela qual o nome do tipo de candidato do RFC aparece neste arquivo.
 */
export function isSameNetwork(report: IceRouteReport): boolean {
  return report.local === 'host' && report.remote === 'host'; // FORM-12-EXEMPT: RFC 8445 candidate type (network interface), not this project's topology
}

/**
 * Monta a linha de telemetria a ser enviada pelo WebSocket já aberto.
 *
 * `id` vem do gerador de ULID de src/app/ulid.ts, injetado. Ele é a chave de
 * idempotência da tabela append-only: o servidor grava com o equivalente a um
 * insere-ou-ignora, então um par que reenvia depois de uma queda produz uma
 * linha e não duas — a mesma propriedade que o ledger de ouro compra do mesmo
 * jeito, pelo mesmo motivo (ADR 0002).
 *
 * A LINHA DE FALHA TAMBÉM É GERADA (D3-14), e quando ela é, a rota é `unknown`
 * por construção: uma conexão que falhou não teve par vencedor, e reportar o
 * último par tentado COMO rota transformaria uma tentativa em um sucesso. Os
 * tipos de candidato do último par sobrevivem, porque são a única pista de por
 * que falhou. Sem essa metade a tabela mede só os sucessos e a taxa fica errada
 * para cima.
 */
export function buildOutcome(ulid: () => string, input: OutcomeInput): IceOutcome {
  const { report } = input;
  return {
    kind: 'iceOutcome',
    id: ulid(),
    code: input.code,
    slot: input.slot,
    route: input.result === 'failed' ? 'unknown' : report.route,
    localCandidate: report.local,
    remoteCandidate: report.remote,
    protocol: report.protocol,
    relayProtocol: report.relayProtocol,
    rttMs: input.rttMs,
    result: input.result,
  };
}

/**
 * Lê a flag UMA VEZ no boot: liga pela query, persiste, e limpa a URL.
 *
 * Tudo injetado porque o runner é Node e nenhuma das três capacidades existe
 * lá. O retorno é o estado da flag; a limpeza da URL é o efeito, e ele só
 * acontece quando havia o que limpar.
 */
export function readRelayFlag(deps: RelayFlagDeps): boolean {
  let asked = false;
  let stripped: string | null = null;

  try {
    const parsed = new URL(deps.url);
    if (parsed.searchParams.get(RELAY_FLAG_PARAM) === RELAY_FLAG_VALUE) {
      asked = true;
      parsed.searchParams.delete(RELAY_FLAG_PARAM);
      stripped = parsed.toString();
    }
  } catch {
    // Uma URL que não parseia não liga nada, e não é erro: este módulo pode ser
    // chamado com o que quer que a plataforma tenha entregado, e a resposta
    // segura para uma entrada ilegível é a mesma de sempre — desligada.
    asked = false;
  }

  if (asked) {
    deps.storage.setItem(RELAY_FLAG_KEY, RELAY_FLAG_VALUE);
    if (stripped !== null) deps.replaceUrl(stripped);
    return true;
  }

  // Sem query, vale o que ficou gravado — e SÓ o valor nomeado. Qualquer outro
  // conteúdo na chave conta como desligado, de modo que nem lixo no
  // armazenamento nem um valor de outra era ligam o caminho de relay.
  return deps.storage.getItem(RELAY_FLAG_KEY) === RELAY_FLAG_VALUE;
}

/** Desliga a flag. É o que o botão do badge do plano 03-09 chama. */
export function clearRelayFlag(storage: StorageLike): void {
  storage.removeItem(RELAY_FLAG_KEY);
}
