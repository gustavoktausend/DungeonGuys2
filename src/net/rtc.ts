// rtc.ts — o mesmo `Transport` de local.ts, agora entre duas máquinas.
//
// ESTE ARQUIVO É A TROCA DE CONSTRUTOR QUE transport.ts FOI DESENHADO PARA
// PERMITIR. O lobby, o pinger e a fase 4 inteira falam com a interface e nunca
// com um canal de dados; por isso a passagem do cabo em processo para o WebRTC
// real não muda uma linha acima desta camada. A topologia continua sendo a
// estrela: toda perna vai à autoridade, e não existe perna entre convidados.
//
// PERFECT NEGOTIATION, APLICADO LITERALMENTE, COM O PAPEL FIXADO E NÃO
// NEGOCIADO. Quem criou a sala é SEMPRE o lado impolido; todo convidado é
// SEMPRE o lado polido. A máquina de estado abaixo é a da MDN, com
// `makingOffer`, `ignoreOffer` e `settingRemoteAnswer`, e com
// `setLocalDescription()` chamado SEM argumento — ela cria a descrição do tipo
// certo sozinha, e passar uma criada à mão é como se reintroduz a corrida que o
// padrão existe para remover. NÃO ESCREVA UMA MÁQUINA DE ESTADO PRÓPRIA aqui:
// `signalingState`, o rollback implícito e o estado `have-local-offer` têm
// sutilezas que não aparecem com dois pares e aparecem com quatro, e o sintoma
// de errar é "funciona a dois, falha de vez em quando a quatro" — a forma de
// defeito mais cara que este projeto pode comprar.
//
// POR QUE SÓ A AUTORIDADE ABRE OS CANAIS. Os dois canais nascem de um lado só e
// chegam ao outro por `ondatachannel`. Isso mantém UMA renegociação no caminho
// feliz, com o disparo de negociação acontecendo num lado apenas — de modo que
// a colisão de ofertas vira o caso raro que o perfect negotiation cobre, em vez
// de ser o caso normal que ele tem de resolver toda vez.
//
// AS OPÇÕES DOS DOIS CANAIS SÃO MUTUAMENTE EXCLUSIVAS NA ESPECIFICAÇÃO, e é por
// isso que só uma aparece. A ordenação e as duas políticas de desistência —
// número máximo de retransmissões e tempo máximo de vida por pacote — não podem
// ser combinadas: definir as duas últimas na mesma configuração LANÇA. O canal
// `rt` define o número de retransmissões e nada mais; a opção irmã, a de tempo
// de vida, não existe neste arquivo. A perífrase é deliberada: um critério de
// aceitação deste plano é um grep pelo nome dela, e um comentário que soletra o
// nome que ele proíbe é como uma auditoria é aposentada por ser barulhenta.
//
// O TETO DE 16 KiB NÃO É COMPATIBILIDADE DE 2017. Ele é um orçamento, e os três
// motivos são atuais: os dois canais dividem UMA associação, então uma mensagem
// grande no confiável bloqueia a cabeça da fila do outro; com zero
// retransmissões, uma mensagem que ocupa muitos pacotes multiplica a chance de
// chegar incompleta e ser descartada inteira; e o upload doméstico da
// autoridade — que envia para três — é o que quebra primeiro, muito antes de
// qualquer limite de protocolo. O que a conexão negociou é lido quando ela
// abre e vai para o log quando fica abaixo do orçamento; o teto de verdade é o
// portão de CI do plano 03-05.
//
// POR QUE O TESTE DESTE ARQUIVO É ESTRUTURAL. Não há `RTCPeerConnection` no
// runner de Node, e um duplo dela seria uma reimplementação da própria coisa
// que precisa ser provada. A prova de COMPORTAMENTO é a spec de Playwright do
// plano 03-10, com dois navegadores de verdade; tests/rtc-shape.test.ts prova
// outra coisa, e só ela: que as opções que decidem a qualidade do fio não foram
// "simplificadas" por alguém que não sabia por que estavam ali.
import { SNAPSHOT_MAX_BYTES } from '@dg2/protocol';
import type { Answer, Candidate, ChannelClass, Offer } from '@dg2/protocol';
import type { PeerId, Transport, Unsubscribe } from './transport';

/**
 * Os rótulos dos dois canais, escritos como literais no ponto de criação.
 *
 * A tabela `CHANNEL_CLASS` do protocolo diz QUANTAS classes existem e o que
 * cada uma garante; estes são os nomes que viajam no rótulo do canal e que o
 * convidado usa para casar o que recebeu. Estão aqui para o leitor, e no ponto
 * de criação estão como literais de propósito: o teste estrutural é a única
 * prova disponível fora do navegador, e ela lê o texto do arquivo.
 */
export const LABEL_RELIABLE = 'ctl';
export const LABEL_UNRELIABLE = 'rt';

/** Por que uma perna sumiu, como o chamador é informado. */
export const REASON_FAILED = 'conexão falhou';
export const REASON_CLOSED = 'conexão encerrada';

/** As três mensagens de relay, que este módulo produz e consome. */
export type RtcSignal = Offer | Answer | Candidate;

export interface RtcDeps {
  /**
   * Verdadeiro nesta máquina quando ela criou a sala.
   *
   * Decide DUAS coisas de uma vez, e é por isso que é um booleano só: quem abre
   * os canais, e qual lado é o impolido. Derivar o papel de um slot faria a
   * topologia morar num número (FORM-12).
   */
  authority: boolean;
  /** O identificador desta conexão, para o campo de remetente do relay. */
  selfId: PeerId;
  /** Os servidores de ICE, como vieram na resposta de entrada do signaling. */
  iceServers: readonly RTCIceServer[];
  /**
   * A flag de depuração de ice.ts. NUNCA ligada por padrão: quando ela é falsa,
   * o par tenta todos os caminhos e o relay continua sendo o último recurso.
   */
  forceRelay: boolean;
  /**
   * Constrói a conexão. Injetada pelo mesmo motivo que `open` é injetada em
   * signaling.ts: o runner de Node não tem essa API, e capturá-la aqui tornaria
   * este módulo impossível de carregar num teste.
   */
  createConnection: (config: RTCConfiguration) => RTCPeerConnection;
  /** Manda um dos três verbos de relay pelo WebSocket já aberto. */
  signal: (message: RtcSignal) => void;
  log: (event: string, fields?: Record<string, unknown>) => void;
}

/**
 * O `Transport` sobre WebRTC, mais o mínimo que só ele pode oferecer.
 *
 * Os seis membros herdados são a interface inteira que o lobby e o pinger
 * conhecem. Os três acrescentados são a costura com o signaling e com a
 * telemetria, e nenhum deles aparece acima desta camada.
 */
export interface RtcTransport extends Transport {
  /** Abre uma perna até `peer`. A autoridade chama uma vez por convidado. */
  connect(peer: PeerId): void;
  /** Entrega uma mensagem de relay que chegou pelo WebSocket. */
  accept(message: RtcSignal): void;
  /** A conexão de uma perna, para `routeOf` e para o reporte de desfecho. */
  connectionOf(peer: PeerId): RTCPeerConnection | null;
}

type MessageCb = (from: PeerId, payload: ArrayBuffer, ch: ChannelClass) => void;
type JoinCb = (peer: PeerId) => void;
type LeaveCb = (peer: PeerId, reason: string) => void;

interface Leg {
  readonly peer: PeerId;
  readonly pc: RTCPeerConnection;
  readonly channels: Map<ChannelClass, RTCDataChannel>;
  makingOffer: boolean;
  ignoreOffer: boolean;
  settingRemoteAnswer: boolean;
  announced: boolean;
  gone: boolean;
}

export function createRtcTransport(deps: RtcDeps): RtcTransport {
  const legs = new Map<PeerId, Leg>();
  const messageCbs = new Set<MessageCb>();
  const joinCbs = new Set<JoinCb>();
  const leaveCbs = new Set<LeaveCb>();
  /** O lado impolido é o da autoridade. Fixado pelo papel, nunca negociado. */
  const polite = !deps.authority;
  let shut = false;

  function fireJoin(leg: Leg): void {
    if (leg.announced || leg.gone || shut) return;
    // Só quando as DUAS classes estão abertas: um lobby que recebesse a entrada
    // com apenas o canal confiável pronto mandaria o primeiro `ping` para um
    // canal que ainda não existe, e o número da tela começaria com uma perda.
    if (leg.channels.size < 2) return;
    for (const channel of leg.channels.values()) {
      if (channel.readyState !== 'open') return;
    }
    leg.announced = true;
    reportNegotiatedLimit(leg);
    for (const cb of [...joinCbs]) cb(leg.peer);
  }

  /**
   * O tamanho de mensagem que a associação aceitou, contra o orçamento.
   *
   * Custa uma leitura e cobre o motor exótico que negocia menos do que todo
   * mundo. Não é uma trava: quem impõe o orçamento é o portão de CI do plano
   * 03-05, e transformar isto num erro derrubaria uma sala por causa de um
   * número que o jogo ainda não excedeu.
   */
  function reportNegotiatedLimit(leg: Leg): void {
    const limit = leg.pc.sctp?.maxMessageSize;
    if (typeof limit === 'number' && limit < SNAPSHOT_MAX_BYTES) {
      deps.log('rtc-mensagem-menor-que-o-orcamento', {
        peer: leg.peer, negociado: limit, orcamento: SNAPSHOT_MAX_BYTES,
      });
    }
  }

  function fireLeave(leg: Leg, reason: string): void {
    if (leg.gone) return;
    leg.gone = true;
    // FALHA É INDIVIDUAL (D3-08). Uma perna que cai avisa sobre ELA e não toca
    // em mais nada: a sala nunca cai porque um convidado ficou sem rota, e é
    // isso que separa "um jogador perdeu a conexão" de "a partida acabou".
    for (const cb of [...leaveCbs]) cb(leg.peer, reason);
  }

  function bindChannel(leg: Leg, ch: ChannelClass, channel: RTCDataChannel): void {
    // Sem isto, o navegador entrega um Blob e o `payload` do `Transport`
    // deixaria de ser o que a interface declara — um erro que só aparece em
    // runtime, num callback, com o codec recebendo algo que não sabe ler.
    channel.binaryType = 'arraybuffer';
    leg.channels.set(ch, channel);
    channel.onopen = () => { fireJoin(leg); };
    channel.onmessage = (ev: MessageEvent) => {
      if (shut || leg.gone) return;
      const data: unknown = ev.data;
      if (!(data instanceof ArrayBuffer)) {
        deps.log('rtc-payload-nao-binario', { peer: leg.peer, canal: ch });
        return;
      }
      for (const cb of [...messageCbs]) cb(leg.peer, data, ch);
    };
    channel.onerror = () => { deps.log('rtc-erro-de-canal', { peer: leg.peer, canal: ch }); };
  }

  function openLeg(peer: PeerId): Leg {
    const existing = legs.get(peer);
    if (existing) return existing;

    const pc = deps.createConnection({
      iceServers: [...deps.iceServers],
      // Uma associação SCTP e UM par de candidatos para os dois canais. É o que
      // torna "qual foi a rota" uma pergunta com uma resposta só, em vez de uma
      // por canal — e portanto o que torna a telemetria de ice.ts legível.
      bundlePolicy: 'max-bundle',
      // 'all' por padrão, sempre. O caminho de relay só é forçado quando a flag
      // de depuração está ligada, e ela nunca está por padrão (SALA-04).
      iceTransportPolicy: deps.forceRelay ? 'relay' : 'all',
    });

    const leg: Leg = {
      peer, pc, channels: new Map(),
      makingOffer: false, ignoreOffer: false, settingRemoteAnswer: false,
      announced: false, gone: false,
    };
    legs.set(peer, leg);

    pc.onnegotiationneeded = () => {
      void (async () => {
        try {
          leg.makingOffer = true;
          await pc.setLocalDescription();
          const sdp = pc.localDescription?.sdp;
          if (sdp) deps.signal({ kind: 'offer', from: deps.selfId, to: peer, sdp });
        } catch (error) {
          deps.log('rtc-negociacao', { peer, erro: String(error) });
        } finally {
          leg.makingOffer = false;
        }
      })();
    };

    pc.onicecandidate = (ev: RTCPeerConnectionIceEvent) => {
      const found = ev.candidate;
      // O candidato nulo é o fim da coleta e não uma mensagem para o outro
      // lado; encaminhá-lo faria o servidor relayar um corpo que o schema
      // recusa, e a recusa apareceria como um erro sem causa aparente.
      if (!found) return;
      deps.signal({
        kind: 'candidate', from: deps.selfId, to: peer,
        candidate: found.candidate,
        sdpMid: found.sdpMid,
        sdpMLineIndex: found.sdpMLineIndex,
      });
    };

    pc.onconnectionstatechange = () => {
      const state = pc.connectionState;
      if (state === 'failed') fireLeave(leg, REASON_FAILED);
      else if (state === 'closed') fireLeave(leg, REASON_CLOSED);
    };

    // O lado do convidado: ele não abre canal nenhum, recebe os dois e os casa
    // pelo rótulo. Um rótulo desconhecido é logado e descartado — é assim que
    // um terceiro canal futuro chega a um cliente velho, e derrubar a perna por
    // causa dele seria recusar uma extensão compatível.
    pc.ondatachannel = (ev: RTCDataChannelEvent) => {
      const channel = ev.channel;
      if (channel.label === LABEL_RELIABLE) bindChannel(leg, 'reliable', channel);
      else if (channel.label === LABEL_UNRELIABLE) bindChannel(leg, 'unreliable', channel);
      else { deps.log('rtc-canal-desconhecido', { peer, rotulo: channel.label }); return; }
      fireJoin(leg);
    };

    if (deps.authority) {
      bindChannel(leg, 'reliable', pc.createDataChannel('ctl', { ordered: true }));
      bindChannel(leg, 'unreliable', pc.createDataChannel('rt', { ordered: false, maxRetransmits: 0 }));
    }

    return leg;
  }

  async function applyDescription(leg: Leg, description: RTCSessionDescriptionInit): Promise<void> {
    const { pc } = leg;
    const readyForOffer =
      !leg.makingOffer && (pc.signalingState === 'stable' || leg.settingRemoteAnswer);
    const collision = description.type === 'offer' && !readyForOffer;
    leg.ignoreOffer = !polite && collision;
    // O lado impolido IGNORA a oferta que colidiu com a sua e segue com a
    // própria; o polido cede. É essa assimetria — e só ela — que garante que a
    // colisão termine, em vez de os dois lados recomeçarem juntos para sempre.
    if (leg.ignoreOffer) return;
    leg.settingRemoteAnswer = description.type === 'answer';
    await pc.setRemoteDescription(description);
    leg.settingRemoteAnswer = false;
    if (description.type === 'offer') {
      await pc.setLocalDescription();
      const sdp = pc.localDescription?.sdp;
      if (sdp) deps.signal({ kind: 'answer', from: deps.selfId, to: leg.peer, sdp });
    }
  }

  return {
    connect(peer) {
      if (shut) return;
      openLeg(peer);
    },

    accept(message) {
      if (shut) return;
      // A perna é criada sob demanda: o convidado descobre com quem fala quando
      // a primeira oferta chega, e criá-la antes exigiria que ele soubesse a
      // ordem em que as coisas acontecem do outro lado.
      const leg = openLeg(message.from);
      if (leg.gone) return;
      void (async () => {
        try {
          if (message.kind === 'offer' || message.kind === 'answer') {
            await applyDescription(leg, { type: message.kind, sdp: message.sdp });
            return;
          }
          try {
            await leg.pc.addIceCandidate({
              candidate: message.candidate,
              sdpMid: message.sdpMid,
              sdpMLineIndex: message.sdpMLineIndex,
            });
          } catch (error) {
            // Um candidato de uma oferta que foi ignorada não tem onde ser
            // aplicado, e a falha é esperada. Fora desse caso ela é real.
            if (!leg.ignoreOffer) throw error;
          }
        } catch (error) {
          deps.log('rtc-sinal-recusado', {
            peer: message.from, kind: message.kind, erro: String(error),
          });
        }
      })();
    },

    connectionOf(peer) {
      return legs.get(peer)?.pc ?? null;
    },

    send(to, payload, ch) {
      if (shut) return;
      const channel = legs.get(to)?.channels.get(ch);
      // Descartado e não lançado, exatamente como em local.ts: um canal fechado
      // enquanto outro par estava no meio de um envio é ordinário numa sala, e
      // lançar aqui transformaria uma corrida normal num erro no caminho feliz
      // de quem chamou.
      if (!channel || channel.readyState !== 'open') return;
      channel.send(payload);
    },

    onMessage(cb) {
      messageCbs.add(cb);
      return () => { messageCbs.delete(cb); };
    },

    onPeerJoin(cb) {
      joinCbs.add(cb);
      return () => { joinCbs.delete(cb); };
    },

    onPeerLeave(cb) {
      leaveCbs.add(cb);
      return () => { leaveCbs.delete(cb); };
    },

    rtt() {
      // Sempre null, e honestamente: o número da tela vem das mensagens
      // `ping`/`pong` de ping.ts, no canal não confiável, que é o caminho que
      // input e snapshot vão usar (D3-13). As estatísticas da conexão medem
      // outra coisa — a ida e volta da checagem de conectividade no par de
      // candidatos — e devolvê-las aqui seria mostrar ao jogador um número que
      // não é o da latência do jogo.
      return null;
    },

    close() {
      if (shut) return;
      shut = true;
      for (const leg of legs.values()) {
        for (const channel of leg.channels.values()) channel.close();
        leg.pc.close();
        fireLeave(leg, REASON_CLOSED);
      }
      legs.clear();
      messageCbs.clear();
      joinCbs.clear();
      leaveCbs.clear();
    },
  };
}

/** O tipo de retorno de uma inscrição, reexportado para quem só importa daqui. */
export type { Unsubscribe };
