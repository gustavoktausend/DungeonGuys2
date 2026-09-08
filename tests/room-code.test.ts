// room-code.test.ts — the room code is the ONLY credential a room has in this
// phase (D3-09), and it is also the one string in the whole product a player
// reads out loud to a friend. Both facts land on the same two functions:
//
//   normalizeRoomCode   forgiving on the way IN. Lowercase, a hyphen, a space,
//                       and the three characters Crockford Base32 exists to
//                       disambiguate (I, L, O) all resolve to the canonical
//                       form. U does NOT: it is refused, never mapped.
//   isRoomCode          strict on the way OUT. Exact length, exact alphabet,
//                       no normalisation — this is what "already canonical"
//                       means, and it is what the server compares against.
//
// The tests below are written as a case table for the same reason
// tests/input-codec.test.ts is: the interesting content here is the LIST of
// inputs a player can produce, and a table makes adding one a one-line edit
// instead of a copy of an assertion.
import { describe, it, expect } from 'vitest';
import {
  ROOM_CODE_ALPHABET, ROOM_CODE_LENGTH, normalizeRoomCode, isRoomCode,
} from '@dg2/protocol';

// Spelled out again on purpose, exactly as tests/ulid.test.ts does with the
// same alphabet: a test that imported the table it is checking would inherit a
// typo in that table instead of catching it. The two constants are independent
// copies BY DESIGN (the module header says why), so the duplication here is
// the second half of that decision, not an oversight.
const CROCKFORD = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

/** [entrada, saída esperada, por que este caso existe] */
const CASES: ReadonlyArray<readonly [string, string | null, string]> = [
  ['ABC123', 'ABC123', 'a forma canônica atravessa intacta'],
  ['abc-123', 'ABC123', 'minúscula sobe, e o hífen que o jogador digita some'],
  ['abc 123', 'ABC123', 'o espaço colado de um chat some igual ao hífen'],
  [' ABC123 ', 'ABC123', 'espaço nas pontas não é caractere do código'],
  ['a-b-c-1-2-3', 'ABC123', 'o separador pode estar em qualquer posição'],
  ['OIL123', '011123', 'o mapa Crockford: O vira 0, I e L viram 1'],
  ['oil123', '011123', 'o mapa vale depois de subir a caixa, não antes'],
  ['ABCDEU', null, 'U é recusado, nunca mapeado — é a letra que o alfabeto não tem'],
  ['abcdeu', null, 'U minúsculo é a mesma recusa'],
  ['ABC12', null, 'curto demais'],
  ['ABC1234', null, 'longo demais'],
  ['', null, 'vazio'],
  ['------', null, 'só separadores sobra uma string vazia, que não tem 6'],
  ['ABC12!', null, 'pontuação não é separador nem caractere do alfabeto'],
  ['ABC12Ç', null, 'letra acentuada não pertence ao alfabeto'],
];

describe('código de sala (SALA-01)', () => {
  it('o alfabeto tem 32 caracteres e não tem I, L, O nem U', () => {
    // 32^6 = 1.073.741.824 códigos. O número está no cabeçalho do módulo junto
    // com o que o torna suficiente: o rate limit do plano 03-04 (T-3-01).
    expect(ROOM_CODE_ALPHABET).toBe(CROCKFORD);
    expect(ROOM_CODE_ALPHABET.length).toBe(32);
    for (const ch of ['I', 'L', 'O', 'U']) {
      expect(ROOM_CODE_ALPHABET, `o alfabeto não pode conter '${ch}'`).not.toContain(ch);
    }
  });

  it('o comprimento canônico é 6', () => {
    expect(ROOM_CODE_LENGTH).toBe(6);
  });

  // The third column of the table is the test's NAME, not an argument: `%s`
  // consumes it into the title, and the callback takes only the two values it
  // asserts on. A third parameter would be an unused binding, which the lint
  // gate refuses — correctly, since the reason belongs in the report and not
  // in the body.
  it.each(CASES)('normalizeRoomCode(%j) === %j — %s', (entrada, esperado) => {
    expect(normalizeRoomCode(entrada)).toBe(esperado);
  });

  it('todo caractere do alfabeto sobrevive a uma volta pela normalização', () => {
    // The forgiving path must not eat a legitimate character. Six copies of
    // each, so the length check cannot mask a substitution.
    for (const ch of ROOM_CODE_ALPHABET) {
      const code = ch.repeat(ROOM_CODE_LENGTH);
      expect(normalizeRoomCode(code), `'${ch}' não sobreviveu à normalização`).toBe(code);
    }
  });

  it('normalizar é idempotente: a saída canônica normaliza para ela mesma', () => {
    for (const entrada of CASES.map(([raw]) => raw)) {
      const uma = normalizeRoomCode(entrada);
      if (uma === null) continue;
      expect(normalizeRoomCode(uma), `'${entrada}' não é estável na segunda volta`).toBe(uma);
    }
  });

  it('isRoomCode aceita só a forma canônica', () => {
    expect(isRoomCode('ABC123')).toBe(true);
    expect(isRoomCode('000000')).toBe(true);
    expect(isRoomCode('ZZZZZZ')).toBe(true);
  });

  it('isRoomCode recusa o que normalizeRoomCode aceitaria mas ainda não normalizou', () => {
    // This is the whole difference between the two functions, and it is the
    // one a caller gets wrong: `isRoomCode` is not "would this be valid", it
    // is "is this ALREADY the string the server stores".
    expect(isRoomCode('abc123')).toBe(false);
    expect(isRoomCode('abc-123')).toBe(false);
    expect(isRoomCode('OIL123')).toBe(false);
  });

  it('isRoomCode recusa comprimento errado e caractere fora do alfabeto', () => {
    expect(isRoomCode('')).toBe(false);
    expect(isRoomCode('ABC12')).toBe(false);
    expect(isRoomCode('ABC1234')).toBe(false);
    expect(isRoomCode('ABCDEU')).toBe(false);
    expect(isRoomCode('ABC-12')).toBe(false);
  });

  it('toda saída não nula de normalizeRoomCode passa por isRoomCode', () => {
    // The contract that links the two: the forgiving function cannot emit
    // anything the strict one would then refuse, or the client would send the
    // server a code it had itself just declared invalid.
    for (const [entrada] of CASES) {
      const out = normalizeRoomCode(entrada);
      if (out === null) continue;
      expect(isRoomCode(out), `'${entrada}' normalizou para '${out}', que isRoomCode recusa`).toBe(true);
    }
  });

  it('nenhum código de sala é gerado aqui — o módulo só normaliza e valida', () => {
    // T-3-01 and C-1 in one assertion: generation needs a CSPRNG, a CSPRNG
    // needs a runtime capability, and @dg2/protocol has `types: []` and
    // `dependencies: {}`. The module exports exactly four names, and none of
    // them makes a code.
    const surface = { ROOM_CODE_ALPHABET, ROOM_CODE_LENGTH, normalizeRoomCode, isRoomCode };
    expect(Object.keys(surface)).toHaveLength(4);
    expect(typeof normalizeRoomCode).toBe('function');
    expect(typeof isRoomCode).toBe('function');
  });
});
