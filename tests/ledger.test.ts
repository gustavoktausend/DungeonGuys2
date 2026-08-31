import { describe, it, expect } from 'vitest';
import { balance, appendEvent, compact, Ledger, type LedgerEvent } from '../src/app/ledger';

const CANONICAL_ULID = /^[0-9A-HJKMNP-TV-Z]{26}$/;

/** Builds an event without repeating the six fields in every test. */
function ev(id: string, amount: number, extra: Partial<LedgerEvent> = {}): LedgerEvent {
  return { id, accountId: 'ACCT', amount, reason: 'run', at: 1469918176385, ...extra };
}

describe('ledger — núcleo puro', () => {
  it('o saldo de um ledger vazio é zero', () => {
    expect(balance([])).toBe(0);
  });

  it('o saldo é a soma aritmética dos eventos, positivos e negativos', () => {
    const events = [
      ev('A', 120),
      ev('B', -50, { reason: 'forge' }),
      ev('C', 30, { reason: 'mission' }),
      ev('D', -25, { reason: 'forge' }),
    ];
    expect(balance(events)).toBe(75);
  });

  it('aplicar o mesmo evento duas vezes não muda o saldo', () => {
    const once = appendEvent([], ev('A', 120));
    const twice = appendEvent(once, ev('A', 120));
    expect(balance(twice)).toBe(balance(once));
    expect(twice).toHaveLength(1);
  });

  it('ignora o id repetido mesmo quando o resto do evento difere', () => {
    // É o que a fase 6 dedupe com UNIQUE(id): o id manda, não o conteúdo.
    const once = appendEvent([], ev('A', 120));
    const twice = appendEvent(once, ev('A', 999, { reason: 'season' }));
    expect(balance(twice)).toBe(120);
    expect(twice).toHaveLength(1);
  });

  it('eventos com ids diferentes somam, e a ordem não muda o saldo', () => {
    const a = ev('A', 120);
    const b = ev('B', -50, { reason: 'forge' });
    const c = ev('C', 30, { reason: 'mission' });
    const ordem1 = appendEvent(appendEvent(appendEvent([], a), b), c);
    const ordem2 = appendEvent(appendEvent(appendEvent([], c), a), b);
    expect(balance(ordem1)).toBe(100);
    expect(balance(ordem2)).toBe(100);
  });

  it('não muta o array de entrada', () => {
    const original = [ev('A', 120)];
    appendEvent(original, ev('B', 10));
    compact(original);
    expect(original).toHaveLength(1);
  });
});

describe('ledger — compactação (D-29)', () => {
  const confirmados = [
    ev('A', 120, { confirmed: 10 }),
    ev('B', -50, { reason: 'forge', confirmed: 11 }),
    ev('C', 30, { reason: 'mission', confirmed: 12 }),
  ];
  const pendentes = [ev('D', 40, { reason: 'season' }), ev('E', -15, { reason: 'forge' })];

  it('colapsa os confirmados num único evento sem mudar o saldo', () => {
    const antes = [...confirmados, ...pendentes];
    const depois = compact(antes);
    expect(balance(depois)).toBe(balance(antes));
    expect(depois.filter(e => e.confirmed !== undefined)).toHaveLength(1);
  });

  it('o evento consolidado carrega a marca d’água mais alta e a soma dos confirmados', () => {
    const depois = compact([...confirmados, ...pendentes]);
    const consolidado = depois.find(e => e.confirmed !== undefined);
    expect(consolidado?.confirmed).toBe(12);
    expect(consolidado?.amount).toBe(100);
  });

  it('preserva os pendentes individualmente', () => {
    const depois = compact([...confirmados, ...pendentes]);
    const restantes = depois.filter(e => e.confirmed === undefined);
    expect(restantes).toEqual(pendentes);
  });

  it('é idempotente: compactar de novo não muda nada', () => {
    const uma = compact([...confirmados, ...pendentes]);
    const duas = compact(uma);
    expect(duas).toEqual(uma);
  });

  it('não colapsa quando há menos de dois confirmados', () => {
    const so_pendentes = [...pendentes];
    expect(compact(so_pendentes)).toEqual(so_pendentes);
  });
});

describe('ledger — metade persistente', () => {
  it('grant registra um evento positivo com ULID e accountId carimbado', () => {
    const antes = balance(Ledger.events);
    const e = Ledger.grant(120, 'run');
    expect(e.amount).toBe(120);
    expect(e.reason).toBe('run');
    expect(e.id).toMatch(CANONICAL_ULID);
    expect(e.accountId).toBe(Ledger.accountId);
    expect(balance(Ledger.events)).toBe(antes + 120);
  });

  it('um gasto é um evento negativo com id próprio, não uma subtração', () => {
    const antes = balance(Ledger.events);
    const gasto = Ledger.spend(50, 'forge');
    expect(gasto.amount).toBe(-50);
    expect(gasto.reason).toBe('forge');
    expect(gasto.id).toMatch(CANONICAL_ULID);
    expect(balance(Ledger.events)).toBe(antes - 50);
    // O id é próprio: nenhum outro evento do ledger o repete.
    expect(Ledger.events.filter(e => e.id === gasto.id)).toHaveLength(1);
  });

  it('cada evento recebe um id distinto', () => {
    const ids = new Set<string>();
    for (let i = 0; i < 50; i++) ids.add(Ledger.grant(1, 'mission').id);
    expect(ids.size).toBe(50);
  });

  it('a conta local nasce com um ULID de origem local (D-31)', () => {
    expect(Ledger.accountId).toMatch(CANONICAL_ULID);
    expect(Ledger.accountOrigin).toBe('local');
  });

  it('recusa valores que não são inteiros positivos', () => {
    expect(() => Ledger.grant(0, 'run')).toThrow();
    expect(() => Ledger.grant(-5, 'run')).toThrow();
    expect(() => Ledger.spend(0, 'forge')).toThrow();
    expect(() => Ledger.spend(-5, 'forge')).toThrow();
    expect(() => Ledger.spend(1.5, 'forge')).toThrow();
    expect(() => Ledger.grant(Number.NaN, 'run')).toThrow();
  });
});
