// server-env.test.ts — /etc/dg2/env read as data, so it can be read wrong in
// a test instead of on the box.
//
// The defect this file exists for was measured, not imagined. With the old
// `process.env.DG2_DB ?? '/var/lib/dg2/dg2.db'`, an environment carrying
// `DG2_DB=` produced:
//
//   DB_PATH = ""   ->  new SQLite('') opens an anonymous temporary database.
//                      A table created in it is GONE on the next connection
//                      (verified: `select name from sqlite_master` came back
//                      empty after close/reopen). migrateToLatest() succeeds,
//                      /api/health answers {"status":"ok","db":true}, and
//                      Litestream replicates a file nobody ever writes.
//   PORT    = 0    ->  Number('') === 0, which listen(2) reads as "pick any
//                      free port". The unit is `active`, nothing answers on
//                      8080, and the 503 makes it look like Caddy's fault.
//   RELEASE = ""   ->  the alert cannot say which release started failing,
//                      which is the field's only stated purpose.
//
// None of the three is reachable through index.ts from a test — importing it
// opens a database and binds a port — which is why readEnv() is a module.
import { describe, it, expect } from 'vitest';
import { DEFAULTS, readEnv, type EnvSource } from '../apps/server/src/env';

/**
 * A complete, valid environment. Each test perturbs exactly one key.
 *
 * DG2_ORIGIN carries a REAL-LOOKING origin rather than the default, because
 * DG2_RELEASE here is a git sha — that is, not a development release — and
 * readEnv refuses that combination on purpose. See the DG2_ORIGIN block below.
 *
 * DG2_BIND carries the CONTAINER value for the same kind of reason: a complete
 * environment is the deployed one, and the deployed one binds every interface
 * because Caddy lives in a different container (DM-9). The loopback default is
 * asserted separately, over an EMPTY environment, which is the case that
 * default exists for.
 */
const GOOD: EnvSource = {
  DG2_DB: '/var/lib/dg2/dg2.db',
  DG2_PORT: '8080',
  DG2_BIND: '0.0.0.0',
  DG2_RELEASE: 'a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0',
  DG2_ORIGIN: 'https://dg2.example',
};

describe('readEnv com o ambiente completo', () => {
  it('devolve exatamente as sete chaves, com os valores do arquivo', () => {
    const env = readEnv(GOOD);
    // Set equality and length: an eighth field would be an eighth thing the
    // operator has to get right, and it must not appear unnoticed.
    expect(Object.keys(env).sort()).toEqual([
      'bind',
      'dbPath',
      'origin',
      'port',
      'release',
      'turnRealm',
      'turnSecret',
    ]);
    expect(env).toEqual({
      dbPath: '/var/lib/dg2/dg2.db',
      port: 8080,
      // Returned INTACT, which is the whole contract of this key: the value
      // goes straight to listen(2), so anything added or normalised here would
      // be a bind address nobody wrote.
      bind: '0.0.0.0',
      release: GOOD.DG2_RELEASE,
      origin: 'https://dg2.example',
      // Absent from GOOD on purpose: the pair is OPTIONAL, and the environment
      // that is complete without it is the one the local waves of this phase
      // run against.
      turnSecret: null,
      turnRealm: null,
    });
  });

  it('apara espaços em volta do valor', () => {
    // An EnvironmentFile line with a trailing space is invisible in an editor.
    const env = readEnv({
      ...GOOD,
      DG2_DB: '  /var/lib/dg2/dg2.db  ',
      DG2_PORT: ' 8080 ',
      DG2_BIND: '  0.0.0.0  ',
    });
    expect(env.dbPath).toBe('/var/lib/dg2/dg2.db');
    expect(env.port).toBe(8080);
    // A bind address with a trailing space is not an address: listen(2) would
    // be handed a string no resolver accepts, and the process would die at the
    // one step that happens AFTER the migration succeeded.
    expect(env.bind).toBe('0.0.0.0');
  });
});

describe('chave ausente — o único caso em que o padrão vale', () => {
  it('um ambiente vazio devolve os cinco padrões', () => {
    // An empty environment is a DEVELOPER's machine: DG2_RELEASE falls back to
    // 'dev', which is exactly the case in which the DG2_ORIGIN default is
    // legitimate. That is why this test does not trip the refusal below, and
    // saying so here keeps the next reader from "fixing" one of the two.
    const env = readEnv({});
    expect(env.dbPath).toBe(DEFAULTS.DG2_DB);
    expect(env.port).toBe(Number(DEFAULTS.DG2_PORT));
    expect(env.bind).toBe(DEFAULTS.DG2_BIND);
    expect(env.release).toBe(DEFAULTS.DG2_RELEASE);
    expect(env.origin).toBe(DEFAULTS.DG2_ORIGIN);
    // Anti-vacuity: '' is a string and would satisfy a type check. The floor
    // is on LENGTH, which is the trap this repository has already fallen into
    // twice.
    expect(env.dbPath.length).toBeGreaterThan(10);
    expect(env.release.length).toBeGreaterThan(0);
    expect(env.port).toBeGreaterThan(0);
  });
});

describe('chave definida e VAZIA — o caso que o ?? deixava passar', () => {
  // The five keys, each with the four blank shapes an EnvironmentFile can
  // produce. Every one of these used to become a silent, wrong default.
  const BLANK = ['', ' ', '\t', '   \t  '];

  for (const key of ['DG2_DB', 'DG2_PORT', 'DG2_BIND', 'DG2_RELEASE', 'DG2_ORIGIN'] as const) {
    for (const blank of BLANK) {
      it(`recusa ${key}=${JSON.stringify(blank)} nomeando a chave`, () => {
        // The message has to NAME the key: the operator is reading journalctl
        // during an outage, and "invalid configuration" costs the same trip
        // to the box that no message at all would.
        expect(() => readEnv({ ...GOOD, [key]: blank })).toThrow(new RegExp(key));
        expect(() => readEnv({ ...GOOD, [key]: blank })).toThrow(/\/etc\/dg2\/env|porta/);
      });
    }
  }

  it('não cai no padrão de produção quando a chave está vazia', () => {
    // The refusal half of the "missing key" test above: absent takes the
    // default, blank does NOT. Returning the default here would make the file
    // say one thing and the process do another.
    let returned: unknown = 'não lançou';
    try {
      returned = readEnv({ ...GOOD, DG2_DB: '' });
    } catch {
      returned = 'lançou';
    }
    expect(returned).toBe('lançou');
  });
});

describe('DG2_PORT — 0 é válido para listen(2) e por isso é recusado à mão', () => {
  // '0' is the one that matters: it is a well-formed integer, so a digits-only
  // check would let it through, and listen(0) binds an EPHEMERAL port. The
  // unit reports active while nothing answers on 8080.
  const REFUSED = ['0', '-1', '65536', '99999', '8080.5', '0x1f', '8e3', 'oito mil', '80 80', '+80'];

  for (const value of REFUSED) {
    it(`recusa DG2_PORT=${JSON.stringify(value)}`, () => {
      expect(() => readEnv({ ...GOOD, DG2_PORT: value })).toThrow(/DG2_PORT/);
    });
  }

  const ACCEPTED = ['1', '80', '8080', '65535'];

  for (const value of ACCEPTED) {
    it(`aceita DG2_PORT=${JSON.stringify(value)}`, () => {
      // The acceptance half is not decoration: a regex tightened until it
      // refused everything would pass every test above.
      expect(readEnv({ ...GOOD, DG2_PORT: value }).port).toBe(Number(value));
    });
  }
});

// DG2_BIND — the key that exists because the same literal meant two different
// things before and after containerisation (DM-9).
//
// `hostname: '127.0.0.1'` in index.ts was correct while Caddy and Node shared
// one host's loopback. In two containers it is the loopback OF THE NODE
// CONTAINER, which the Caddy container cannot reach, and the symptom is 503 on
// /api/* from the first deploy with every other check green. The default stays
// the loopback so that nothing native and no developer's machine loses the
// defence; the container value is declared in the compose, in diff.
describe('DG2_BIND — o bind virou configuração, e o padrão continua o loopback', () => {
  it('um ambiente vazio faz bind no loopback', () => {
    // Two assertions and not one. Comparing only against DEFAULTS.DG2_BIND
    // would stay green if that table said '0.0.0.0' — which is precisely the
    // mistake this key makes possible, so the LITERAL is pinned too.
    expect(readEnv({}).bind).toBe(DEFAULTS.DG2_BIND);
    expect(DEFAULTS.DG2_BIND).toBe('127.0.0.1');
  });

  it('aceita 0.0.0.0 e o devolve intacto', () => {
    // The value the compose of plan 02-14 sets. Accepting it is the point of
    // the key existing; returning it unchanged is the point of reading it with
    // required() rather than parsing it.
    expect(readEnv({ ...GOOD, DG2_BIND: '0.0.0.0' }).bind).toBe('0.0.0.0');
  });

  it('não valida formato: o que listen(2) aceita, esta chave aceita', () => {
    // DELIBERATELY NO ADDRESS VALIDATION. listen(2) takes a v4 address, a v6
    // address and a hostname, and a validator guessing at that would refuse a
    // legitimate value the day the topology changed — a refusal at boot for a
    // configuration that was right. The absence is the decision, so it is
    // asserted rather than assumed.
    expect(readEnv({ ...GOOD, DG2_BIND: '::1' }).bind).toBe('::1');
    expect(readEnv({ ...GOOD, DG2_BIND: '::' }).bind).toBe('::');
    expect(readEnv({ ...GOOD, DG2_BIND: 'api' }).bind).toBe('api');
  });
});

// The measurement this block stands in for is not a crash: it is a SILENCE. An
// origin allowlist left at its development default in production accepts
// `http://localhost:5173` and nothing else, so the anti-CSWSH check is running
// against a string no real browser will ever send — present in the code, absent
// in effect (T-3-02). Nothing throws, nothing logs, and the only way to find it
// is to go looking. Hence a refusal at startup rather than a warning.
describe('DG2_ORIGIN — o padrão de desenvolvimento é recusado em produção', () => {
  it('recusa o padrão quando DG2_RELEASE é uma release de verdade', () => {
    expect(() => readEnv({ ...GOOD, DG2_ORIGIN: DEFAULTS.DG2_ORIGIN })).toThrow(/DG2_ORIGIN/);
    // The message has to carry BOTH halves of the condition, because the
    // operator reading journalctl has to know which of the two keys to edit.
    expect(() => readEnv({ ...GOOD, DG2_ORIGIN: DEFAULTS.DG2_ORIGIN })).toThrow(/DG2_RELEASE/);
    expect(() => readEnv({ ...GOOD, DG2_ORIGIN: DEFAULTS.DG2_ORIGIN })).toThrow(
      /\/etc\/dg2\/env/,
    );
  });

  it('recusa o padrão quando a chave está simplesmente AUSENTE em produção', () => {
    // The likelier shape of the same mistake: nobody wrote the key at all, so
    // `required()` hands back the default without complaint. Testing only the
    // explicitly-written default would leave the common case uncovered.
    const withoutOrigin: EnvSource = { ...GOOD };
    delete withoutOrigin.DG2_ORIGIN;
    expect(() => readEnv(withoutOrigin)).toThrow(/DG2_ORIGIN/);
  });

  it('aceita o padrão quando DG2_RELEASE é "dev"', () => {
    // The acceptance half. Without it a refusal that fired unconditionally
    // would pass every assertion above while making `npm run dev` impossible.
    const env = readEnv({ ...GOOD, DG2_RELEASE: 'dev', DG2_ORIGIN: DEFAULTS.DG2_ORIGIN });
    expect(env.origin).toBe(DEFAULTS.DG2_ORIGIN);
    expect(env.release).toBe('dev');
  });

  it('aceita uma origem real em produção e a devolve intacta', () => {
    // Byte for byte: the value is compared against the Origin header with ===,
    // so a trailing slash or a lowercased scheme silently added here would make
    // every real browser fail the check. Only surrounding whitespace is trimmed.
    const env = readEnv({ ...GOOD, DG2_ORIGIN: '  https://dg2.example  ' });
    expect(env.origin).toBe('https://dg2.example');
  });
});

// The one pair in this file whose ABSENCE is tolerated, and the tolerance is
// what lets the local waves of phase 3 run before the box with coturn exists
// (SALA-04). Everything else here refuses a missing answer; these two refuse a
// HALF answer, which is a different and worse thing.
describe('DG2_TURN_SECRET / DG2_TURN_REALM — o par que pode faltar inteiro', () => {
  const WITH_TURN: EnvSource = {
    ...GOOD,
    DG2_TURN_SECRET: 'um-segredo-compartilhado-com-o-coturn',
    DG2_TURN_REALM: 'dg2.example',
  };

  it('a ausência do segredo é tolerada: o servidor sobe e emite ICE só com STUN', () => {
    // The load-bearing test of this block. Refusing here would make the server
    // unstartable on any machine without a relay — which is every developer's
    // machine and every wave of this phase that precedes the VPS.
    const env = readEnv(GOOD);
    expect(env.turnSecret).toBeNull();
    expect(env.turnRealm).toBeNull();
  });

  it('lê o par quando as duas estão presentes', () => {
    const env = readEnv(WITH_TURN);
    expect(env.turnSecret).toBe('um-segredo-compartilhado-com-o-coturn');
    expect(env.turnRealm).toBe('dg2.example');
  });

  for (const blank of ['', ' ', '\t']) {
    it(`recusa DG2_TURN_SECRET=${JSON.stringify(blank)} — definida e vazia continua erro`, () => {
      // Same doctrine as every other key: absent means "I have no relay", blank
      // means "I wrote this line and meant something by it". Treating blank as
      // absent would turn a typo into a silently relay-less deployment, and the
      // symptom is one friend who never gets in.
      expect(() => readEnv({ ...WITH_TURN, DG2_TURN_SECRET: blank })).toThrow(
        /\/env\/DG2_TURN_SECRET/,
      );
    });

    it(`recusa DG2_TURN_REALM=${JSON.stringify(blank)}`, () => {
      expect(() => readEnv({ ...WITH_TURN, DG2_TURN_REALM: blank })).toThrow(
        /\/env\/DG2_TURN_REALM/,
      );
    });
  }

  it('recusa o segredo sem o realm, dizendo que as duas andam juntas', () => {
    // A secret with no realm produces a credential coturn will not accept, and
    // the symptom is "the relay never works" with nothing in any log to say so.
    const half: EnvSource = { ...WITH_TURN };
    delete half.DG2_TURN_REALM;
    expect(() => readEnv(half)).toThrow(/DG2_TURN_REALM/);
    expect(() => readEnv(half)).toThrow(/DG2_TURN_SECRET/);
  });

  it('recusa o realm sem o segredo, pelo mesmo motivo', () => {
    // The other half, and it is not symmetry for its own sake: a realm alone is
    // an operator who configured coturn and forgot the one line that makes this
    // process able to talk to it.
    const half: EnvSource = { ...WITH_TURN };
    delete half.DG2_TURN_SECRET;
    expect(() => readEnv(half)).toThrow(/DG2_TURN_SECRET/);
  });

  it('nenhuma das duas tem valor padrão: um segredo padrão é uma vulnerabilidade', () => {
    // DEFAULTS is the table the process reads. A default secret would be a
    // secret published in a public repository and shared by every deployment
    // that never overrode it (T-3-10).
    expect(Object.keys(DEFAULTS)).not.toContain('DG2_TURN_SECRET');
    expect(Object.keys(DEFAULTS)).not.toContain('DG2_TURN_REALM');
    expect(JSON.stringify(DEFAULTS)).not.toContain('TURN');
  });

  it('apara espaços em volta do par, como em toda outra chave', () => {
    const env = readEnv({
      ...WITH_TURN,
      DG2_TURN_SECRET: '  um-segredo  ',
      DG2_TURN_REALM: '  dg2.example  ',
    });
    expect(env.turnSecret).toBe('um-segredo');
    expect(env.turnRealm).toBe('dg2.example');
  });
});
