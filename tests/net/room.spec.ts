// room.spec.ts — três navegadores, uma sala, o mesmo mundo (SALA-02, SALA-03).
//
// A PROVA QUE FALTAVA. Tudo que veio antes desta spec mede uma metade: a
// máquina de estado da sala roda em Node sobre um cabo em processo, as opções
// dos dois DataChannels são asseridas contra o TEXTO de rtc.ts porque a API não
// existe no runner, e a view do lobby é chamada sem DOM. Nenhuma dessas provas
// toca um `RTCPeerConnection` de verdade. Esta toca: contextos de navegador
// abrem uma sala por loopback, se veem, escolhem classe, começam a run com o
// mesmo hash do tick 0, e sobrevivem à saída um do outro.
//
// DOIS CONTEXTOS, UM CHROMIUM. Contextos compartilham o processo do navegador e
// NÃO compartilham estado de sessão — cookies, storage, service workers — que é
// exatamente a fronteira entre dois jogadores. Dois navegadores separados
// custariam segundos por spec e não provariam nada a mais.
//
// POR QUE TRÊS E NÃO DOIS. As duas últimas afirmações são sobre SAÍDA: um
// convidado que sai não derruba a sala (D3-08), e quem criou a sala saindo a
// encerra para os demais (D3-02). A segunda precisa de alguém ainda dentro para
// ser vista, e esse alguém não pode ser o convidado que acabou de sair.
//
// SEM `--use-fake-device-for-media-stream`. A flag existe para `getUserMedia`, e
// um DataChannel não toca mídia: a associação SCTP é negociada sem uma única
// track. Ligá-la aqui seria carga de culto.
//
// SEM STUN E SEM TURN. Ver o cabeçalho de e2e-helpers.ts: os dois lados estão
// nesta máquina, então cada um junta um candidato de loopback e o par fecha
// sozinho. É por isso que a rota que a tela mostra aqui é `direto` — e essa é a
// terceira afirmação, que só vale alguma coisa porque a rota agora sai de
// `getStats()` (net/ice.ts) e não de um valor fixo.
//
// `expect.soft` NAS SETE AFIRMAÇÕES. Uma execução nomeia TODAS as que falharam
// em vez de parar na primeira, que é o que transforma um vermelho desta spec num
// relatório em vez de numa pista. As poucas asserções duras são as que, se
// falharem, tornam as seguintes sem sentido — sem código de sala não há como
// entrar, e sem entrar não há o que medir.
import { expect, test, type Browser, type BrowserContext, type Page } from '@playwright/test';
import { serveGame, type GameServer } from './e2e-helpers';

let server: GameServer;
const open: BrowserContext[] = [];

test.afterEach(async () => {
  for (const context of open.splice(0)) await context.close().catch(() => {});
  // Tolerante de propósito: a spec fecha contextos e o servidor no meio.
  await server?.close().catch(() => {});
});

/** Um contexto novo, rastreado para que o `afterEach` sempre o feche. */
async function newTracked(browser: Browser): Promise<BrowserContext> {
  const context = await browser.newContext();
  open.push(context);
  return context;
}

async function forget(context: BrowserContext): Promise<void> {
  const i = open.indexOf(context);
  if (i >= 0) open.splice(i, 1);
  await context.close();
}

/** Uma aba nova na origem do jogo, já com a tela da sala aberta. */
async function openRoomScreen(context: BrowserContext): Promise<Page> {
  const page = await context.newPage();
  await page.goto(server.origin);
  // O botão da tela inicial. O clique espera sozinho pelo boot: main.ts tem um
  // `await loadSprites()` no topo, então antes dele não há ouvinte nenhum.
  await page.locator('#btn-coop').click();
  await expect(page.locator('#room-screen')).toHaveClass(ACTIVE);
  return page;
}

/** Entra na sala `code` e espera o lobby aparecer. */
async function joinRoom(page: Page, code: string): Promise<void> {
  await page.locator('#join-code').fill(code);
  await page.locator('#btn-join-room').click();
  await expect(page.locator('#lobby-screen')).toHaveClass(ACTIVE, { timeout: 20_000 });
}

/**
 * A tela que está na frente.
 *
 * `.screen` esconde por `opacity: 0` + `pointer-events: none` e NÃO por
 * `display: none` (style.css:91-106), então `toBeVisible()` é verdadeiro para
 * todas as telas ao mesmo tempo — a caixa delimitadora existe em todas.
 * Medido: a primeira versão desta spec passou pelo `toBeVisible` do lobby com
 * a tela da sala ainda na frente, e só o texto do código denunciou. A classe
 * que `showScreen` liga é o único sinal que distingue as duas.
 */
const ACTIVE = /(^|\s)active(\s|$)/;

/** As cadeiras que têm alguém — a vazia carrega a classe `empty`. */
const FILLED = '#lobby-slots .lobby-slot:not(.empty)';

/**
 * Quantos desfechos de ICE o servidor recebeu, esperando até `count` ou até
 * o prazo. Devolve a contagem em vez de lançar, para que a asserção que a lê
 * possa ser `soft` como as demais — uma execução vermelha desta spec é um
 * relatório, não uma pista.
 */
async function outcomesReported(count: number, ms = 10_000): Promise<number> {
  const deadline = Date.now() + ms;
  while (server.outcomes.length < count && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  return server.outcomes.length;
}

test('uma sala por loopback: código, entrada, ping, classe, run com o mesmo tick 0, e as duas saídas', async ({ browser }) => {
  server = await serveGame();

  // ── 1. Quem cria recebe um código de seis caracteres ──────────────────────
  const first = await newTracked(browser);
  const a = await openRoomScreen(first);
  await a.locator('#btn-create-room').click();
  await expect(a.locator('#lobby-screen')).toHaveClass(ACTIVE, { timeout: 20_000 });
  const code = ((await a.locator('#lobby-code').textContent()) ?? '').trim();
  // Dura: sem código não existe segundo passo. O alfabeto sem caractere
  // ambíguo é asserido pelo teste do servidor; aqui, só o que a tela mostra.
  expect(code, 'o código de seis caracteres aparece em #lobby-code').toMatch(/^[A-Z0-9]{6}$/);

  // ── 2. Outro entra por esse código, e os dois veem duas cadeiras ──────────
  const second = await newTracked(browser);
  const b = await openRoomScreen(second);
  await joinRoom(b, code);

  await expect(a.locator(FILLED), 'quem criou a sala vê duas cadeiras ocupadas')
    .toHaveCount(2, { timeout: 25_000 });
  await expect(b.locator(FILLED), 'quem entrou vê as mesmas duas')
    .toHaveCount(2, { timeout: 25_000 });

  // ── 3. Um ping numérico e a palavra `direto` ──────────────────────────────
  //
  // NEM TODA CADEIRA MOSTRA UM NÚMERO, e isso é por desenho: a linha de quem
  // criou a sala não tem ping na tela dele, porque uma máquina não tem ida e
  // volta até si mesma e um zero ali leria como a melhor conexão da sala
  // (net/lobby.ts). O que precisa estar medido é a PERNA, e ela aparece dos
  // dois lados: quem mede é a autoridade, e o resumo é relatado (D3-16).
  const measured = /\d+ ms · direto/;
  await expect(a.locator('#lobby-slots'), 'a perna medida aparece com número e rota em A')
    .toHaveText(measured, { timeout: 30_000 });
  await expect(b.locator('#lobby-slots'), 'a mesma perna, relatada, aparece em B')
    .toHaveText(measured, { timeout: 30_000 });

  // ── 3b. Cada ponta da perna reportou o desfecho de ICE (SALA-05) ─────────
  //
  // A tabela existe para trocar uma estimativa por uma medição (D3-14), e até
  // esta asserção nenhum cliente a alimentava: o servidor tinha o handler, a
  // migração e a cota, e recebia zero linhas. Uma perna, duas pontas, dois
  // reportes — cada um atribuído pelo servidor ao socket que o mandou.
  const filed = await outcomesReported(2);
  expect.soft(filed, 'as duas pontas da perna A–B reportaram o desfecho de ICE').toBeGreaterThanOrEqual(2);
  for (const outcome of server.outcomes) {
    expect.soft(outcome.result, 'a perna fechou, então o desfecho é connected').toBe('connected');
    expect.soft(outcome.route, 'por loopback, a rota reportada é direct').toBe('direct');
  }

  // ── 4. A classe escolhida por B muda o card NOS DOIS lados ────────────────
  const chosen = b.locator('#lobby-class .lobby-class-card').nth(3);
  const key = ((await chosen.getAttribute('data-class')) ?? '').toUpperCase();
  expect(key, 'os cards de classe têm o data-class que a view lê').not.toBe('');
  await chosen.click();
  await expect
    .soft(b.locator('#lobby-slots'), 'a classe nova aparece na tela de quem escolheu')
    .toContainText(key, { timeout: 20_000 });
  await expect
    .soft(a.locator('#lobby-slots'), 'e viaja até a tela de quem criou a sala')
    .toContainText(key, { timeout: 20_000 });

  // Um terceiro entra ANTES de a sala fechar, para ter quem testemunhe a saída
  // de quem a criou. Ver o cabeçalho.
  const third = await newTracked(browser);
  const c = await openRoomScreen(third);
  await joinRoom(c, code);
  await expect(a.locator(FILLED), 'três cadeiras ocupadas antes de iniciar')
    .toHaveCount(3, { timeout: 25_000 });

  // ── 5. INICIAR começa a run nos três, e ninguém vê a tela de divergência ──
  await a.locator('#btn-start-run').click();
  // A run começou quando o HUD aparece: main.ts só o revela dentro de beginRun.
  await expect.soft(a.locator('#hud'), 'a run começou em quem criou a sala')
    .toBeVisible({ timeout: 20_000 });
  await expect.soft(b.locator('#hud'), 'e no convidado, do mesmo manifesto')
    .toBeVisible({ timeout: 20_000 });
  // O ponto inteiro do plano: as três máquinas construíram o MESMO mundo do
  // tick 0, então a tela de divergência não aparece em nenhuma delas (D3-05).
  await expect.soft(a.locator('#desync-screen'), 'nenhuma divergência em A (D3-05)').not.toHaveClass(ACTIVE);
  await expect.soft(b.locator('#desync-screen'), 'nenhuma divergência em B (D3-05)').not.toHaveClass(ACTIVE);
  await expect.soft(c.locator('#desync-screen'), 'nenhuma divergência em C (D3-05)').not.toHaveClass(ACTIVE);

  // ── 6. Um convidado sai, e a sala continua (D3-08) ────────────────────────
  await forget(second);
  // O assento é CONGELADO depois que a sala fecha (ADR 0001), então a cadeira
  // não some da lista — um jogador que cai volta para a mesma. O que muda é a
  // linha, que passa a dizer que ela não está conectada.
  await expect
    .soft(a.locator('#lobby-slots'), 'a cadeira de quem saiu deixa de estar conectada')
    .toContainText('conectando', { timeout: 25_000 });
  await expect
    .soft(a.locator('#room-screen'), 'e a sala continua: A não voltou para a tela da sala')
    .not.toHaveClass(ACTIVE);

  // ── 7. Quem criou a sala sai, e ela acaba para quem ficou (D3-02) ─────────
  await forget(first);
  await expect
    .soft(c.locator('#room-error'), 'quem ficou é avisado, com a frase do contrato de copy')
    .toHaveText('Quem criou a sala saiu. A sala acabou.', { timeout: 25_000 });
});
