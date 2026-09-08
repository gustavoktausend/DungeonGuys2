// signaling.ts — o lado do cliente da conversa com o servidor de sinalização.
//
// WHY THE SOCKET ARRIVES AS A DEPENDENCY. vitest.config.ts runs this repository
// in Node with no jsdom, so the browser's socket constructor does not exist in
// a test at all. `open(url)` is therefore a parameter: in the browser the
// caller hands over a one-line function that builds the platform socket, and in
// tests/net-signaling.test.ts it hands over a dumb double. That single
// injection is what lets the WHOLE protocol — the twelve verbs, the local
// refusal of a malformed code, the backoff after a drop — be proved in
// microseconds without a network. It is the same move apps/server/src/
// shutdown.ts makes with `startWatchdog`, for the same reason: a module that
// captured a platform capability could only be tested by a test willing to
// own that platform.
//
// RECONNECTING THE SOCKET IS NOT RECONNECTING THE ROOM. THIS IS THE MOST
// LIKELY THING TO BE MISREAD IN THIS FILE. What the loop below rebuilds is the
// WebSocket to the signalling server — the cold, out-of-band leg that carries
// SDP and ICE candidates. It does NOT rebuild the peer connection, does not
// restart ICE, does not reclaim the slot the player had, and does not put a
// half-finished run back together. That is TEMP-04, and it belongs to FASE 5.
// D3-11 keeps this socket alive during the match precisely so that phase has a
// hook to hang itself on; reading the presence of a retry loop as "session
// reconnection already works" would ship a room that silently forgets who its
// players were.
//
// THE CLIENT DOES NOT PARSE SDP, AND THAT IS A SECURITY PROPERTY (T-3-30).
// `offer`, `answer` and `candidate` are opaque strings handed straight to the
// callback and, from there, to the peer connection — which is the engine's
// hardened parser and the only thing in the system qualified to read them.
// A client that inspected SDP would be coupled to the far side's WebRTC
// version and would be a second, worse parser reachable from the internet.
// The signalling SERVER does not parse them either (plan 03-04): it counts the
// characters against a ceiling and copies them.
//
// WHAT IS VALIDATED HERE AND WHAT IS NOT. Every inbound message is checked
// against SIGNAL_KIND before anything is dispatched, and an unknown kind is
// ignored and logged rather than thrown — a throw inside a socket callback
// takes down every other listener that had not run yet. Beyond the kind, only
// the entry envelope (`created` / `joined`) is shape-checked, because its
// fields are read here; every other body travels through untouched. There is
// no zod on this side and there will not be: the published game keeps
// `dependencies: {}` (C-1), and the validation that matters is at the door of
// the server, where it is pinned to the wire types by a compile-time identity
// assertion.
import {
  SIGNAL_KIND,
  normalizeRoomCode,
} from '@dg2/protocol';
import type {
  IceConfig,
  PeerInfo,
  RejectReason,
  SignalMessage,
  TurnCredential,
  Versions,
} from '@dg2/protocol';
import type { Schedule, Unsubscribe } from './transport';

/**
 * A mensagem que o jogador vê quando o código digitado não pode ser um código.
 *
 * Literal da UI-SPEC. A recusa acontece ANTES de o código sair da máquina, e as
 * duas coisas que isso compra são concretas: uma ida ao servidor economizada, e
 * uma ficha a menos gasta no balde de rate limit que é o que torna seis
 * caracteres suficientes (T-3-01) — um erro de digitação não deve consumir a
 * mesma cota que uma tentativa de varredura.
 */
export const BAD_CODE_MESSAGE = 'Código de 6 caracteres, sem O, I, L nem U.';

/** Primeira espera antes de tentar reabrir o socket. */
export const RECONNECT_BASE_MS = 500;

/** Teto da espera. Dobra a cada tentativa até aqui e para de crescer. */
export const RECONNECT_MAX_MS = 15_000;

/**
 * Quanto tempo uma conexão precisa ter durado para que a próxima queda comece
 * de novo do começo do backoff.
 *
 * Sem isto, uma sessão de duas horas que cai uma vez esperaria quinze segundos
 * porque o contador nunca zerou. Com isto, "caiu depois de funcionar bem" e
 * "não consegue conectar" são tratadas como as duas coisas diferentes que são.
 */
export const RECONNECT_STABLE_MS = 10_000;

/**
 * O socket, no mínimo que este módulo usa.
 *
 * Os nomes e as formas são os do socket do navegador de propósito: assim o
 * chamador do navegador entrega uma função de uma linha que constrói o objeto
 * nativo, sem adaptador e sem conversão. O único campo que este módulo lê de um
 * evento é `data`.
 */
export interface SocketLike {
  send(data: string): void;
  close(): void;
  onopen: ((ev: Event) => void) | null;
  onmessage: ((ev: MessageEvent) => void) | null;
  onclose: ((ev: CloseEvent) => void) | null;
  onerror: ((ev: Event) => void) | null;
}

/** Quem está pedindo a sala, e com que versões. */
export interface Identity {
  accountId: string;
  name: string;
  versions: Versions;
}

/**
 * O que `create` e `join` devolvem — UMA forma para as duas.
 *
 * `created` não traz lista de ocupantes e `joined` traz; aqui a lista é sempre
 * um array, vazio no primeiro caso. Duas formas fariam todo chamador ter dois
 * caminhos para a mesma pergunta ("quem já está na sala"), e um deles seria o
 * que ninguém testou.
 */
export interface RoomEntry {
  code: string;
  peerId: string;
  authorityPeerId: string;
  slot: PeerInfo['slot'];
  ice: IceConfig;
  turn: TurnCredential;
  peers: readonly PeerInfo[];
}

/**
 * Uma recusa, com a razão da tabela congelada e o texto para a tela.
 *
 * `reason` é o que o chamador pode ramificar. `detail` é texto livre e NUNCA
 * condição (D-08) — quando a recusa é de versão, é dentro dele que os dois
 * números viajam, compostos pelo lado que tem os dois. `ours` está aqui porque
 * este lado o conhece com certeza: é exatamente o par que ele acabou de
 * enviar, então a tela consegue dizer "a sua" mesmo que o servidor não tenha
 * dito nada. Extrair `theirs` do `detail` seria ramificar em texto escrito
 * para um humano, que é o que D-08 proíbe.
 */
export interface SignalRefusal {
  reason: RejectReason;
  detail: string;
  ours: Versions;
}

/** A recusa como erro, para que uma promessa possa carregá-la. */
export class SignalRefused extends Error implements SignalRefusal {
  readonly reason: RejectReason;
  readonly detail: string;
  readonly ours: Versions;

  constructor(refusal: SignalRefusal) {
    super(`${refusal.reason}: ${refusal.detail}`);
    this.name = 'SignalRefused';
    this.reason = refusal.reason;
    this.detail = refusal.detail;
    this.ours = refusal.ours;
  }
}

export interface SignalingDeps {
  /** O endereço completo do socket, incluindo o caminho que o servidor atende. */
  url: string;
  /** Constrói o socket. Ver o cabeçalho: é isto que torna o módulo testável. */
  open: (url: string) => SocketLike;
  /** Uma linha no journal. Nunca lança. */
  log: (event: string, fields?: Record<string, unknown>) => void;
  now: () => number;
  schedule: Schedule;
}

export interface SignalingClient {
  /** Pede uma sala nova. Resolve quando `created` chega. */
  create(who: Identity): Promise<RoomEntry>;
  /** Entra por código. Recusa localmente um código que não pode ser um código. */
  join(code: string, who: Identity): Promise<RoomEntry>;
  /** Manda uma mensagem já montada — os três verbos de relay, `leave`, telemetria. */
  send(message: SignalMessage): void;
  onSignal(cb: (message: SignalMessage) => void): Unsubscribe;
  /** O socket caiu. NÃO significa que a sala caiu — ver o cabeçalho. */
  onDisconnected(cb: () => void): Unsubscribe;
  close(): void;
}

/** As doze entradas, como conjunto, para a checagem de um `kind` que chegou. */
const KINDS: ReadonlySet<string> = new Set<string>(SIGNAL_KIND);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isText(value: unknown): value is string {
  return typeof value === 'string';
}

/**
 * O envelope de entrada, conferido campo a campo.
 *
 * Estreito de propósito: só os campos que ESTE módulo lê. `ice` e `turn` são
 * repassados como vieram porque quem os consome é a `RTCPeerConnection`, que
 * os valida melhor do que qualquer guarda escrita aqui; o que se confere é que
 * existem, para que o chamador não receba `undefined` de uma resposta truncada.
 */
function readEntry(message: Record<string, unknown>): RoomEntry | null {
  const { code, peerId, authorityPeerId, slot, ice, turn } = message;
  if (!isText(code) || !isText(peerId) || !isText(authorityPeerId) || !isText(slot)) return null;
  if (!isRecord(ice) || !isRecord(turn)) return null;
  const peers = Array.isArray(message.peers) ? (message.peers as readonly PeerInfo[]) : [];
  return {
    code,
    peerId,
    // NUNCA derivado do slot (FORM-12, T-3-31). Quem manda é quem o servidor
    // nomeia neste campo, e o dia em que a autoridade virar um processo
    // dedicado ele se anuncia aqui sem que nenhuma mensagem mude de forma.
    authorityPeerId,
    slot: slot as PeerInfo['slot'],
    ice: ice as unknown as IceConfig,
    turn: turn as unknown as TurnCredential,
    peers,
  };
}

export function createSignalingClient(deps: SignalingDeps): SignalingClient {
  const signalCbs = new Set<(message: SignalMessage) => void>();
  const disconnectedCbs = new Set<() => void>();

  let socket: SocketLike | null = null;
  let opened = false;
  let shut = false;
  /** Mensagens escritas antes de o handshake terminar. Vão na ordem. */
  let outbox: SignalMessage[] = [];
  let attempt = 0;
  /** Quando o socket atual abriu, ou 0. Alimenta o reset do backoff. */
  let openedAt = 0;
  let cancelRetry: Unsubscribe | null = null;
  let pending: {
    resolve: (entry: RoomEntry) => void;
    reject: (error: SignalRefused) => void;
    ours: Versions;
  } | null = null;

  function settleRefusal(reason: RejectReason, detail: string): void {
    const waiting = pending;
    if (!waiting) return;
    pending = null;
    waiting.reject(new SignalRefused({ reason, detail, ours: waiting.ours }));
  }

  function receive(data: unknown): void {
    if (!isText(data)) {
      // Binário neste socket é sempre um engano: esta perna é JSON, e a
      // binária é a do DataChannel. Logado em vez de convertido, porque
      // adivinhar o que fazer com bytes inesperados é como um parser cresce.
      deps.log('signaling-nao-texto', { tipo: typeof data });
      return;
    }
    let value: unknown;
    try {
      value = JSON.parse(data);
    } catch {
      deps.log('signaling-json-invalido', { bytes: data.length });
      return;
    }
    if (!isRecord(value) || !isText(value.kind) || !KINDS.has(value.kind)) {
      // Ignorada e logada, nunca lançada. Uma exceção aqui roda DENTRO do
      // callback do socket e derruba todo ouvinte que ainda não rodou — o
      // cliente inteiro morreria por causa de uma mensagem que ele apenas não
      // reconhece.
      deps.log('signaling-kind-desconhecido', {
        kind: isRecord(value) && isText(value.kind) ? value.kind : null,
      });
      return;
    }

    const record = value;
    if (record.kind === 'created' || record.kind === 'joined') {
      const entry = readEntry(record);
      if (entry === null) {
        deps.log('signaling-entrada-malformada', { kind: record.kind });
        settleRefusal('badCode', 'a resposta de entrada veio incompleta');
      } else if (pending) {
        const waiting = pending;
        pending = null;
        waiting.resolve(entry);
      }
    } else if (record.kind === 'error') {
      settleRefusal(
        (isText(record.reason) ? record.reason : 'badCode') as RejectReason,
        isText(record.detail) ? record.detail : '',
      );
    }

    // Toda mensagem válida chega aos assinantes, inclusive as que a promessa
    // acima já consumiu: `rtc.ts` precisa dos três verbos de relay e o lobby
    // precisa de `peers` e `closed`, e um despacho que escolhesse quem vê o
    // quê seria uma segunda tabela de roteamento a manter em dia.
    const message = record as unknown as SignalMessage;
    for (const cb of [...signalCbs]) cb(message);
  }

  function armRetry(): void {
    if (shut || cancelRetry) return;
    const wait = Math.min(RECONNECT_BASE_MS * 2 ** attempt, RECONNECT_MAX_MS);
    attempt++;
    cancelRetry = deps.schedule(() => {
      cancelRetry = null;
      if (!shut) connect();
    }, wait);
  }

  function dropped(): void {
    socket = null;
    opened = false;
    // Uma conexão que durou o bastante zera o backoff: "caiu depois de
    // funcionar" e "não consegue conectar" são diagnósticos diferentes e
    // merecem esperas diferentes.
    if (openedAt > 0 && deps.now() - openedAt >= RECONNECT_STABLE_MS) attempt = 0;
    openedAt = 0;
    // A FILA MORRE COM O SOCKET, INTEIRA. Nada que foi enfileirado antes da
    // queda pode valer depois dela: o servidor dá um `peerId` NOVO a cada
    // conexão (ADR 0001), então um `offer` ou um `candidate` guardado
    // carregaria um remetente que a conexão seguinte não é — e seria recusado
    // na porta por isso. E um `create` ou `join` guardado seria pior do que
    // recusado: seria ACEITO, abrindo uma sala (ou ocupando um assento) para
    // uma tela que já mostrou erro e desistiu — uma sala-fantasma com esta
    // máquina como autoridade por trinta minutos, e um segundo clique em
    // "criar sala" abrindo uma segunda.
    outbox = [];
    // A promessa pendente é REJEITADA, e não deixada aberta. Uma tela de
    // "criando sala…" que espera para sempre é a forma de travamento mais cara
    // de diagnosticar, porque não há erro nenhum em lugar nenhum.
    settleRefusal('roomClosed', 'a conexão com o servidor caiu');
    for (const cb of [...disconnectedCbs]) cb();
    armRetry();
  }

  function connect(): void {
    if (shut || socket) return;
    const sock = deps.open(deps.url);
    socket = sock;
    opened = false;
    sock.onopen = () => {
      if (shut || socket !== sock) return;
      opened = true;
      openedAt = deps.now();
      const queued = outbox;
      outbox = [];
      for (const message of queued) sock.send(JSON.stringify(message));
    };
    sock.onmessage = (ev) => {
      if (shut || socket !== sock) return;
      receive(ev.data);
    };
    sock.onclose = () => {
      if (shut || socket !== sock) return;
      dropped();
    };
    sock.onerror = () => {
      // Um erro de socket não é acionável aqui e vem SEMPRE seguido de um
      // fechamento — quem trata a queda é `onclose`, num lugar só. Duas rotas
      // para a mesma queda contariam duas tentativas de backoff.
      deps.log('signaling-erro-de-socket');
    };
  }

  function send(message: SignalMessage): void {
    if (shut) return;
    if (!socket) connect();
    if (socket && opened) socket.send(JSON.stringify(message));
    else outbox.push(message);
  }

  function enter(message: SignalMessage, ours: Versions): Promise<RoomEntry> {
    if (shut) {
      return Promise.reject(
        new SignalRefused({ reason: 'roomClosed', detail: 'o cliente já foi encerrado', ours }),
      );
    }
    if (pending) {
      // Programação, não protocolo: uma máquina entra numa sala de cada vez, e
      // uma segunda tentativa concorrente deixaria duas promessas disputando a
      // mesma resposta. Erro comum e não `SignalRefused`, porque não é uma
      // recusa que veio do fio e não tem razão da tabela congelada.
      return Promise.reject(new Error('já há uma entrada de sala em curso'));
    }
    return new Promise<RoomEntry>((resolve, reject) => {
      pending = { resolve, reject, ours };
      send(message);
    });
  }

  return {
    create(who) {
      return enter(
        { kind: 'create', accountId: who.accountId, name: who.name, versions: who.versions },
        who.versions,
      );
    },

    join(code, who) {
      // normalizeRoomCode é indulgente com apresentação (caixa, hífen, espaço
      // colado do chat, as três letras ambíguas) e implacável com o resto. O
      // que viaja é a forma canônica, que é a única que o servidor aceita —
      // duas grafias de um código seriam duas salas num mapa indexado por
      // string.
      const canonical = normalizeRoomCode(code);
      if (canonical === null) {
        return Promise.reject(
          new SignalRefused({
            reason: 'badCode',
            detail: BAD_CODE_MESSAGE,
            ours: who.versions,
          }),
        );
      }
      return enter(
        {
          kind: 'join',
          code: canonical,
          accountId: who.accountId,
          name: who.name,
          versions: who.versions,
        },
        who.versions,
      );
    },

    send,

    onSignal(cb) {
      signalCbs.add(cb);
      return () => { signalCbs.delete(cb); };
    },

    onDisconnected(cb) {
      disconnectedCbs.add(cb);
      return () => { disconnectedCbs.delete(cb); };
    },

    close() {
      if (shut) return;
      shut = true;
      if (cancelRetry) { cancelRetry(); cancelRetry = null; }
      settleRefusal('roomClosed', 'o cliente foi encerrado');
      const sock = socket;
      socket = null;
      opened = false;
      outbox = [];
      // Fechar depois de soltar a referência: o `onclose` que o próprio
      // fechamento dispara passa pela guarda `socket !== sock` e não arma uma
      // reconexão para um cliente que acabou de desistir.
      if (sock) sock.close();
    },
  };
}
