// rtc-shape.test.ts — ESTE É UM TESTE ESTRUTURAL, NÃO UM TESTE DE
// COMPORTAMENTO. Ele lê o TEXTO de src/net/rtc.ts e não executa uma linha dele.
//
// A distinção não é acadêmica, e confundir as duas é a forma de este arquivo
// dar confiança falsa. Não existe `RTCPeerConnection` no runner de Node
// (vitest.config.ts, sem jsdom), e um duplo dela seria uma reimplementação da
// própria coisa que precisa ser provada: um teste que passasse contra um duplo
// escrito por quem escreveu o módulo provaria que os dois concordam, e nada
// sobre o que um navegador faz. A PROVA DE COMPORTAMENTO É A SPEC DE PLAYWRIGHT
// DO PLANO 03-10, com dois navegadores de verdade trocando SDP através do
// servidor de signaling.
//
// O que ESTE arquivo prova é outra coisa, e vale por si: que as opções que
// decidem a qualidade do fio continuam escritas como foram decididas. Elas são
// invisíveis em revisão — `{ ordered: false, maxRetransmits: 0 }` parece um
// detalhe de configuração — e cada uma tem um motivo escrito no cabeçalho do
// módulo. O modo de falha que este teste existe para impedir é alguém
// "simplificar" as duas configurações até virarem uma, e o sintoma disso
// aparecer semanas depois como "o jogo congela e depois teleporta".
//
// Molde copiado de tests/ops-config.test.ts: glob `?raw`, guarda anti-vacuidade
// POR COMPRIMENTO (o tipo não é a guarda — `''` é uma string e satisfaz todo
// `not.toContain` abaixo dele), e um filtro que tira comentários ANTES de
// assertar. O filtro não é opcional: o cabeçalho do módulo explica, em prosa,
// justamente as opções que este arquivo proíbe ou exige, e sem separar prosa de
// código a documentação invalidaria o código que ela documenta.
import { describe, it, expect } from 'vitest';
import { scan } from './scan';

const FILES = import.meta.glob<string>('../src/net/rtc.ts', {
  query: '?raw', import: 'default', eager: true,
});

const PATH = '../src/net/rtc.ts';

/** O texto cru, com a guarda anti-vacuidade por comprimento. */
function raw(): string {
  const src = FILES[PATH];
  expect(src, `o glob não encontrou ${PATH}`).toBeTypeOf('string');
  // O piso fica muito abaixo do arquivo real de propósito: ele existe para
  // pegar vazio, nunca para policiar tamanho.
  expect((src as string).length, 'src/net/rtc.ts veio vazio').toBeGreaterThan(1000);
  return src as string;
}

/**
 * O mesmo texto sem comentários, com strings preservadas.
 *
 * `keepStrings: true` porque metade das asserções abaixo é sobre literais —
 * `'ctl'`, `'rt'`, `'max-bundle'`, `'relay'` — e apagar os corpos das strings
 * deixaria todas elas passando sobre nada.
 */
function code(): string {
  const stripped = scan(raw(), true);
  // Segundo piso, e não é redundante com o primeiro: este módulo é maioria
  // comentário por desenho, então é atrás DESTE número que a vacuidade se
  // esconderia.
  expect(stripped.length, 'src/net/rtc.ts é só prosa').toBeGreaterThan(500);
  return stripped;
}

/** Quantas vezes um trecho literal aparece. */
function count(haystack: string, needle: string): number {
  return haystack.split(needle).length - 1;
}

/** As linhas do código (sem comentários) que contêm um trecho. */
function linesWith(haystack: string, needle: string): string[] {
  return haystack.split('\n').filter((line) => line.includes(needle));
}

describe('forma do transporte WebRTC (teste estrutural)', () => {
  it('o glob encontrou src/net/rtc.ts e ele não está vazio', () => {
    expect(raw().length).toBeGreaterThan(1000);
    expect(code().length).toBeGreaterThan(500);
  });

  it('os dois canais são criados exatamente uma vez cada', () => {
    const src = code();
    // Duas criações, nem mais nem menos. Uma terceira seria um canal que
    // ninguém decidiu; uma segunda do mesmo rótulo seria um par de canais
    // homônimos que o convidado não conseguiria casar por rótulo.
    expect(count(src, "createDataChannel('ctl'")).toBe(1);
    expect(count(src, "createDataChannel('rt'")).toBe(1);
    expect(count(src, 'createDataChannel')).toBe(2);
  });

  it('o canal de controle é ordenado, na mesma expressão em que nasce', () => {
    const [line, ...extra] = linesWith(code(), "createDataChannel('ctl'");
    expect(extra).toEqual([]);
    // Junto e não em outro lugar: uma opção aplicada depois, num `if` distante,
    // é uma opção que alguém remove sem perceber o que removeu.
    expect(line).toContain('ordered: true');
  });

  it('o canal de tempo real desiste na primeira tentativa, na mesma expressão', () => {
    const [line, ...extra] = linesWith(code(), "createDataChannel('rt'");
    expect(extra).toEqual([]);
    expect(line).toContain('ordered: false');
    // Zero retransmissões: o sucessor de um snapshot torna o snapshot perdido
    // obsoleto, então retransmitir entregaria verdade velha, tarde, e custaria
    // mais do que a perda custou.
    expect(line).toContain('maxRetransmits: 0');
  });

  it('a opção irmã de tempo de vida por pacote não existe no arquivo', () => {
    // Ordenação, número máximo de retransmissões e tempo máximo de vida são
    // MUTUAMENTE EXCLUSIVOS na especificação: definir as duas últimas juntas
    // LANÇA. A asserção é sobre o texto CRU, comentários incluídos, porque o
    // objetivo é que o nome não esteja nem à mão de um copiar-e-colar.
    expect(raw()).not.toContain('maxPacketLifeTime');
  });

  it('a conexão usa bundle máximo, para haver UMA associação e UM par de candidatos', () => {
    // É isto que faz "qual foi a rota" ter uma resposta só em vez de uma por
    // canal — e portanto é o que torna a telemetria de ice.ts legível.
    expect(count(code(), "bundlePolicy: 'max-bundle'")).toBe(1);
  });

  it('o lado do convidado existe: os canais também chegam de fora', () => {
    // Sem este manipulador, só a autoridade teria canais e a conexão abriria
    // sem que o convidado pudesse falar — a falha aparece como uma sala em que
    // ninguém do outro lado responde.
    expect(code()).toContain('ondatachannel');
  });

  it("'relay' só aparece como valor CONDICIONAL da política de transporte", () => {
    const src = code();
    const lines = linesWith(src, "'relay'");
    expect(lines.length, "nenhuma menção a 'relay' — a flag sumiu?").toBe(1);
    // A forma exata importa. Um valor incondicional forçaria TODO jogador pelo
    // relay: mais latência, mais banda paga na VPS, e o caminho direto nunca
    // sendo exercitado — com nada na tela dizendo que foi de propósito.
    expect(lines[0]).toMatch(/iceTransportPolicy:\s*\S+\s*\?\s*'relay'\s*:\s*'all'/);
    expect(src).not.toContain("iceTransportPolicy: 'relay'");
  });

  it('a interface satisfeita é a de transport.ts, sem um sétimo membro', () => {
    const src = code();
    // Os seis membros do `Transport`. Se um sumir, o módulo deixou de ser
    // trocável pelo cabo em processo — que é a única razão de ele existir.
    for (const member of ['send(', 'onMessage(', 'onPeerJoin(', 'onPeerLeave(', 'rtt(', 'close(']) {
      expect(src, `faltou ${member}`).toContain(member);
    }
    // E o que a interface deliberadamente não tem (FORM-12): uma perna por
    // mensagem, sempre.
    expect(src.toLowerCase()).not.toContain('broadcast');
  });
});
