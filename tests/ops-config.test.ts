// ops-config.test.ts — the executable half of ops/.
//
// Nothing in ops/ runs on this machine: it is configuration and shell that a
// VPS will execute later (plan 02-12). That is exactly why it needs a test —
// the failure mode of infra config is that it is wrong for months and nobody
// finds out until the night it matters. Every assertion here is one of the
// traps the phase research measured, turned into a command:
//
//   P-5   `handle` is reordered by Caddy, `route` is not — so `route` is banned
//   P-6   {$VAR} works in a site address, {env.VAR} does not
//   P-12  a relative --link-dest silently stops deduplicating
//   DM-5  no try_files: a 404 must stay a 404, or the SW caches a wrong page
//   D2-06 rollback touches no network, or it fails in the one case it exists for
//   D2-07 rollback touches no database, or reverting code reverts data
//   D2-15 no secret and no address ever enters the repository
import { describe, it, expect } from 'vitest';

// Vite's raw glob, not node:fs — tsconfig's `types` is ["vite/client"] only.
// The pattern globs the directory rather than a suffix because the Caddyfile
// has no extension.
const OPS = import.meta.glob<string>('../ops/*', {
  query: '?raw', import: 'default', eager: true,
});

// tools/ops/ is the Node half of the same subsystem: restore-verify.mjs is the
// only executable of this phase that does NOT live in ops/, because it follows
// tools/README.md rather than the shell conventions of §1. It is asserted here,
// next to the units it exercises, instead of in a file of its own.
const TOOLS_OPS = import.meta.glob<string>('../tools/ops/*', {
  query: '?raw', import: 'default', eager: true,
});

/**
 * Reads one file of ops/ with the anti-vacuity guard attached. Every assertion
 * below goes through here, so a renamed or deleted file fails loudly instead of
 * turning the whole suite into a green no-op over an empty glob.
 */
function read(name: string): string {
  const src = OPS[`../ops/${name}`];
  expect(src, `o glob não encontrou ops/${name}`).toBeTypeOf('string');
  // TYPE IS NOT THE GUARD; LENGTH IS. `''` is a string, so a glob that resolves
  // and reads nothing passes toBeTypeOf and then SATISFIES every not.toContain
  // and not.toMatch below it. Measured on this file before the floor existed,
  // with ops/rollback.sh stubbed to '': 44 of 46 tests stayed green, and the
  // two that survived included both assertions that carry the requirement —
  // D2-06 (nenhuma chamada de rede) and D2-07 (nunca toca no banco). They
  // passed over an empty haystack.
  //
  // tests/dom-ids.test.ts:50-54 records the same trap from plan 02-02, where a
  // `?raw` CSS import stubbed to '' shipped a green test that had read nothing.
  // This file — the one guarding infrastructure that has never executed — was
  // the one that skipped the lesson.
  //
  // The floor is far below the smallest real file (ops/cert-check.timer, 962
  // bytes) on purpose: it must catch emptiness and never police size.
  expect((src as string).length, `ops/${name} veio vazio`).toBeGreaterThan(200);
  return src as string;
}

/** The same guard, for the Node half. */
function readTool(name: string): string {
  const src = TOOLS_OPS[`../tools/ops/${name}`];
  expect(src, `o glob não encontrou tools/ops/${name}`).toBeTypeOf('string');
  expect((src as string).length, `tools/ops/${name} veio vazio`).toBeGreaterThan(200);
  return src as string;
}

/**
 * Drops whole-line comments: every line whose first non-blank character is `#`.
 *
 * THIS FILTER IS NOT OPTIONAL. ops/Caddyfile explains, in its own comments, why
 * it does NOT use `try_files` and why it does NOT use `route`; the shell scripts
 * name `curl` and `git` in the headers that forbid them. Without the filter each
 * absence assertion below would fail against the very file that satisfies it —
 * the documentation would invalidate the code it documents, and the obvious
 * "fix" would be to delete the explanation. Strip first, then assert.
 */
function code(name: string): string {
  const stripped = read(name)
    .split('\n')
    .filter((line) => !/^\s*#/.test(line))
    .join('\n');
  // The second floor, and it is not redundant with the first: most assertions
  // in this file read code(), not read(), so a file that passed the length
  // guard while being nothing but prose would still hand them an empty
  // haystack. Every ops/ file here is majority comment by design, so this is
  // the number the vacuity would actually hide behind. Smallest real value is
  // ops/cert-check.timer, at 167 bytes once stripped.
  expect(stripped.trim().length, `ops/${name} é só comentário`).toBeGreaterThan(50);
  return stripped;
}

describe('ops/Caddyfile', () => {
  it('roteia /api, /ws e o estático a partir do symlink de release', () => {
    const cfg = code('Caddyfile');
    expect(cfg).toContain('handle /api/*');
    expect(cfg).toContain('reverse_proxy');
    expect(cfg).toContain('handle /ws');
    // The same path ops/deploy.sh swaps: if the two ever disagree, the box
    // serves an empty directory and every request is a 404.
    expect(cfg).toContain('root * /srv/dg2/current');
  });

  it('usa {$VAR} no endereço do site, nunca {env.VAR} (P-6)', () => {
    const cfg = code('Caddyfile');
    expect(cfg).toContain('{$DG2_DOMAIN}');
    expect(cfg).not.toContain('{env.DG2_DOMAIN}');
  });

  it('não usa a diretiva route, cuja ordem seria carga funcional (P-5)', () => {
    // A directive opens a line, so anchoring to the start of a line is precise
    // enough to tell the directive from any word that merely contains it.
    expect(code('Caddyfile')).not.toMatch(/^\s*route\b/m);
  });

  it('não transforma 404 em index.html servido com 200 (DM-5)', () => {
    expect(code('Caddyfile')).not.toContain('try_files');
  });

  it('responde 503 legível por máquina quando o upstream cai', () => {
    const cfg = code('Caddyfile');
    expect(cfg).toContain('handle_errors');
    expect(cfg).toContain('{"status":"unavailable"}');
  });
});

/**
 * Every shell script of ops/: the four a deploy touches, in the order it
 * touches them, plus the one the certificate timer runs. The list is exact and
 * the test below compares it to the glob, so adding a script without deciding
 * where it belongs in this file is a red test rather than an omission.
 */
const SCRIPTS = [
  'deploy-forced.sh', 'deploy.sh', 'rollback.sh', 'prune-releases.sh',
  'cert-check.sh',
];

describe('scripts de ops/', () => {
  it('o glob encontrou exatamente os scripts esperados', () => {
    const found = Object.keys(OPS).filter((p) => p.endsWith('.sh')).sort();
    expect(found).toEqual(SCRIPTS.map((n) => `../ops/${n}`).sort());
  });

  it('todo script abre com set -eu', () => {
    const bad: string[] = [];
    for (const name of SCRIPTS) {
      // The shebang is a `#` line, so it is gone with the comments; the first
      // line that survives has to be the one that makes an unset variable or a
      // failed command stop the script instead of continuing into a half-done
      // deploy.
      const first = code(name).split('\n').find((line) => line.trim() !== '');
      if (first?.trim() !== 'set -eu') bad.push(`${name}: ${first ?? '<vazio>'}`);
    }
    expect(bad).toEqual([]);
  });

  it('a troca de symlink é atômica: mv -T, nunca ln -sfn direto no alvo vivo', () => {
    const bad: string[] = [];
    for (const name of ['deploy.sh', 'rollback.sh']) {
      const src = code(name);
      if (!src.includes('mv -T')) bad.push(`${name}: sem mv -T`);
      // `ln -sfn` over an existing symlink unlinks and recreates it, so every
      // line that creates one must be writing to a temporary name — the `mv -T`
      // that follows is what makes the publish atomic.
      for (const line of src.split('\n')) {
        if (line.includes('ln -sfn') && !line.includes('.tmp')) bad.push(`${name}: ${line.trim()}`);
      }
    }
    expect(bad).toEqual([]);
  });

  it('rollback.sh não faz nenhuma chamada de rede (D2-06)', () => {
    // Not comment-stripped on purpose: the requirement is that these words do
    // not appear in the file AT ALL. A revert is needed exactly when the
    // infrastructure that would serve a download is what failed.
    const bad: string[] = [];
    for (const word of ['curl', 'wget', 'git ', 'npm ']) {
      if (read('rollback.sh').includes(word)) bad.push(word);
    }
    expect(bad).toEqual([]);
  });

  it('rollback.sh nunca toca no banco (D2-07)', () => {
    expect(read('rollback.sh')).not.toContain('var/lib/dg2');
  });

  it('prune-releases.sh resolve o symlink vivo e retém 5', () => {
    const src = code('prune-releases.sh');
    expect(src).toContain('readlink');
    expect(src).toMatch(/^KEEP=5$/m);
  });

  it('deploy-forced.sh só aceita rsync --server e um sha de 40 hexadecimais', () => {
    const src = code('deploy-forced.sh');
    expect(src).toContain('SSH_ORIGINAL_COMMAND');
    expect(src).toContain('rsync --server ');
    expect(src).toContain('^[0-9a-f]{40}$');
  });

  // ── CR-01: a chave de deploy confinada à árvore de releases ────────────
  // The branch that carries the transfer used to be a PREFIX match followed by
  // `exec $CMD`, and the client generates the whole argv. Measured against the
  // real script under dash, that accepted a destination of
  // `/home/dg2-deploy/.ssh/` (which removes the command= and turns the key
  // into a shell), accepted `--sender` (arbitrary reads), accepted
  // `--partial-dir` pointing outside the tree, and expanded `*` against the
  // deploy user's home. Each assertion below pins one of those four shut.
  it('deploy-forced.sh desliga o globbing ANTES de dividir o argv', () => {
    // Order is the assertion, not presence. `set -f` after the split would be
    // decoration: splitting and globbing are one expansion step, and the
    // damage is already done by then. Measured: with the `set -f` line
    // deleted, `rsync --server -x . *` reached the validator as `CCC`, the
    // last entry of the working directory; with it, as the literal `*`.
    const lines = code('deploy-forced.sh').split('\n').map((l) => l.trim());
    const guard = lines.indexOf('set -f');
    const split = lines.indexOf('set -- $CMD');
    expect(guard, 'deploy-forced.sh não desliga o globbing').toBeGreaterThan(-1);
    expect(split, 'deploy-forced.sh não divide o argv com set --').toBeGreaterThan(-1);
    expect(guard, 'set -f tem de vir antes de set -- $CMD').toBeLessThan(split);
  });

  it('deploy-forced.sh recusa os modos de leitura, de daemon e de shell do rsync', () => {
    const src = code('deploy-forced.sh');
    // --sender is rsync's read direction; --daemon opens a service; -e/--rsh
    // chain another connection out of this one. None appears in a deploy.
    for (const flag of ['--sender', '--daemon', '--rsh', '-e']) {
      expect(src, `deploy-forced.sh não recusa ${flag}`).toContain(flag);
    }
    // And each refusal has to be a `fail`, not a mention: the words above also
    // appear in a comment explaining them, which is exactly the vacuity this
    // file's `code()` filter exists for.
    expect(src.split('\n').filter((l) => l.includes('fail ')).length).toBeGreaterThanOrEqual(6);
  });

  it('deploy-forced.sh valida o destino contra as duas árvores de release', () => {
    const src = code('deploy-forced.sh');
    // The same 40-hex rule deploy.sh and rollback.sh apply to their own
    // argument, applied to the one string this script did not check at all.
    expect(src).toContain('^/srv/dg2/(releases|server-releases)/[0-9a-f]{40}/?$');
  });

  it('nenhum script de ops/ faz exec de uma variável sem aspas', () => {
    // `exec $CMD` IS the shape of CR-01: word splitting AND pathname expansion
    // over a string the other end wrote. `exec "$@"` and `exec "$DEPLOY"` are
    // the forms that survive.
    const bad: string[] = [];
    for (const name of SCRIPTS) {
      for (const line of code(name).split('\n')) {
        if (/\bexec\s+\$[A-Za-z_{]/.test(line)) bad.push(`${name}: ${line.trim()}`);
      }
    }
    expect(bad).toEqual([]);
  });

  it('nenhum script desliga a verificação de host do SSH', () => {
    const bad: string[] = [];
    for (const [path, src] of Object.entries(OPS)) {
      if (/StrictHostKeyChecking\s*=\s*no\b/.test(src)) bad.push(path);
    }
    expect(bad).toEqual([]);
  });
});

describe('ops/dg2.service', () => {
  it('desiste depois de 5 partidas em 60s, para a unit chegar a failed (P-9)', () => {
    // The single most load-bearing pair of lines in the phase. Without it a
    // broken migration restarts forever, the unit never reaches `failed`, and
    // every downstream link of the D2-16 alarm chain — no listener, Caddy 503,
    // external monitor — is never reached. This assertion is here so that
    // deleting the limit is a red test and not a silent regression six months
    // from now.
    const unit = code('dg2.service');
    expect(unit).toContain('StartLimitIntervalSec=60');
    expect(unit).toContain('StartLimitBurst=5');
    expect(unit).toContain('Restart=always');
  });

  it('limita a memória do cgroup E o heap do V8, nunca só um dos dois (P-10)', () => {
    // The pair is the assertion. V8 sizes its default old space from the
    // machine's memory, so a cgroup cap with no heap cap converts a slow leak
    // into an OOM-kill instead of into garbage collection — and the heap cap
    // has to stay BELOW the cgroup ceiling for that to work, which is why the
    // two numbers are compared rather than merely present.
    const unit = code('dg2.service');
    const heap = /--max-old-space-size=(\d+)/.exec(unit);
    const hard = /^MemoryMax=(\d+)M$/m.exec(unit);
    const soft = /^MemoryHigh=(\d+)M$/m.exec(unit);
    expect(heap, 'sem --max-old-space-size').not.toBeNull();
    expect(hard, 'sem MemoryMax').not.toBeNull();
    expect(soft, 'sem MemoryHigh').not.toBeNull();
    const [heapMib, hardMib, softMib] =
      [heap![1], hard![1], soft![1]].map(Number);
    expect(heapMib).toBeLessThan(softMib);
    expect(softMib).toBeLessThan(hardMib);
  });

  it('roda como dg2 num sandbox, nunca como root', () => {
    const unit = code('dg2.service');
    expect(unit).toContain('User=dg2');
    expect(unit).not.toContain('User=root');
    for (const directive of [
      'NoNewPrivileges=true', 'ProtectSystem=strict', 'ProtectHome=true',
      'PrivateTmp=true', 'PrivateDevices=true', 'ProtectKernelTunables=true',
      'ProtectKernelModules=true', 'ProtectControlGroups=true',
      'RestrictSUIDSGID=true', 'RestrictNamespaces=true', 'LockPersonality=true',
      'RestrictAddressFamilies=AF_INET AF_INET6 AF_UNIX',
    ]) {
      expect(unit, `faltou ${directive}`).toContain(directive);
    }
  });

  it('usa StateDirectory em vez de uma exceção de escrita escrita à mão', () => {
    // One directive that creates, chowns and grants write, and survives a wiped
    // /var — instead of a mkdir in a deploy script plus a manual exception that
    // can disagree with it.
    const unit = code('dg2.service');
    expect(unit).toContain('StateDirectory=dg2');
    expect(unit).toContain('StateDirectoryMode=0700');
    expect(unit).not.toContain('ReadWritePaths');
  });

  it('arranca pelo symlink que o rollback move, não por um release fixo', () => {
    // If ExecStart pointed at /srv/dg2/server-releases/<sha>/, rolling the
    // symlink back would revert the client and keep serving the old server.
    const unit = code('dg2.service');
    expect(unit).toContain('ExecStart=/usr/bin/node /srv/dg2/current-server/server.mjs');
    expect(unit).toContain('WorkingDirectory=/srv/dg2/current-server');
    expect(unit).not.toMatch(/ExecStart=.*server-releases/);
  });

  it('não publica a API fora do loopback', () => {
    // The bind address lives in apps/server/src/index.ts, but a stray
    // DG2_UPSTREAM or NODE_OPTIONS here could still widen it. Cheap to assert.
    expect(read('dg2.service')).not.toContain('0.0.0.0');
  });
});

describe('ops/litestream.yml', () => {
  it('usa a chave replica no SINGULAR, como o v0.5 exige (P-8)', () => {
    // Every pre-v0.5 tutorial shows a plural list. Pasting one makes litestream
    // reject or ignore the configuration, and the way that is discovered is by
    // needing the backup. The comment stripping matters here: the file EXPLAINS
    // the plural form in prose, and without the filter the explanation would
    // fail the assertion it exists to justify.
    const yml = code('litestream.yml');
    const lines = yml.split('\n');
    expect(lines.filter((l) => l.includes('replica:'))).toHaveLength(1);
    expect(lines.filter((l) => l.includes('replicas:'))).toHaveLength(0);
  });

  it('replica o banco que dg2.service escreve, para bucket S3-compatível', () => {
    const yml = code('litestream.yml');
    // The same path StateDirectory creates. If the two ever disagree,
    // litestream replicates a file nobody writes and reports success.
    expect(yml).toContain('/var/lib/dg2/dg2.db');
    expect(yml).toContain('type: s3');
    // Explicit endpoint: the target is B2 or equivalent, not AWS, and the
    // endpoint is what turns on path-style addressing.
    expect(yml).toContain('endpoint:');
  });

  it('não carrega nenhum valor de credencial, só referências de ambiente', () => {
    const yml = code('litestream.yml');
    for (const key of ['AWS_ACCESS_KEY_ID', 'AWS_SECRET_ACCESS_KEY',
                       'LITESTREAM_BUCKET', 'LITESTREAM_ENDPOINT']) {
      expect(yml, `${key} deveria aparecer interpolado`).toContain(`\${${key}}`);
    }
  });
});

describe('ops/litestream.service', () => {
  it('é irmã de dg2.service e não filha — o backup sobrevive ao Node cair', () => {
    const unit = code('litestream.service');
    expect(unit).toContain('After=dg2.service');
    expect(unit).toContain('Wants=dg2.service');
    // Requires= would stop the backup whenever the API stops, which is the
    // opposite of what a backup is for.
    expect(unit).not.toContain('Requires=dg2.service');
    // BindsTo= would do the same thing by another name.
    expect(unit).not.toContain('BindsTo=');
  });

  it('tem teto de memória e o mesmo sandbox, com a escrita declarada à mão', () => {
    const unit = code('litestream.service');
    expect(unit.split('\n').filter((l) => l.includes('MemoryMax'))).toHaveLength(1);
    expect(unit).toContain('User=dg2');
    expect(unit).not.toContain('User=root');
    expect(unit).toContain('NoNewPrivileges=true');
    expect(unit).toContain('ProtectSystem=strict');
    // No StateDirectory here — dg2.service owns the directory — so litestream
    // needs the write exception spelled out. It keeps its own shadow WAL next
    // to the database, so read-only is not enough.
    expect(unit).toContain('ReadWritePaths=/var/lib/dg2');
  });

  it('lê a configuração instalada e o env, sem valor embutido', () => {
    const unit = code('litestream.service');
    expect(unit).toContain('EnvironmentFile=/etc/dg2/env');
    expect(unit).toContain('-config /etc/litestream.yml');
  });
});

describe('cert-check — a perna local de D2-16', () => {
  it('confere o certificado servido na 443, não o arquivo em disco', () => {
    // The distinction IS the feature. The classic failure of automatic renewal
    // is a fresh file on disk and a stale certificate on the wire, and a check
    // that opened the file would report green through all of it (T-2-TLS).
    const src = code('cert-check.sh');
    expect(src).toContain('openssl s_client');
    expect(src).toContain(':443');
    expect(src).toContain('checkend');
    expect(src).toContain('DAYS=30');
    // The domain never appears in the repository; it arrives from the
    // EnvironmentFile, and the script refuses to run without it.
    expect(src).toContain('DG2_DOMAIN');
    expect(src).toMatch(/:\s*"\$\{DG2_DOMAIN:\?/);
  });

  it('não tenta notificar ninguém por conta própria — o alarme é o exit code', () => {
    // NOT comment-stripped, and that is the point: the whole file, prose
    // included, must be free of these. This assertion exists because "improving"
    // the script by making it notify is the obvious next thought for anyone
    // reading it, and doing that would duplicate — badly, from inside the box
    // that may be the thing that is down — the external monitor of D2-21.
    const src = read('cert-check.sh');
    for (const word of ['mail', 'curl', 'wget', 'webhook', 'slack']) {
      expect(src.toLowerCase(), `cert-check.sh menciona ${word}`).not.toContain(word);
    }
  });

  it('o serviço é oneshot sem Restart, para a unit poder FICAR failed', () => {
    // Restart= would retry a certificate that is not going to renew itself in
    // two seconds and, worse, would clear the failed state that is the signal.
    const unit = code('cert-check.service');
    expect(unit).toContain('Type=oneshot');
    expect(unit).toContain('ExecStart=/srv/dg2/bin/cert-check.sh');
    expect(unit).toContain('EnvironmentFile=/etc/dg2/env');
    expect(unit).not.toMatch(/^Restart=/m);
  });

  it('o timer roda todo dia e recupera o dia perdido num reboot', () => {
    const unit = code('cert-check.timer');
    expect(unit).toContain('OnCalendar=daily');
    expect(unit).toContain('RandomizedDelaySec=1h');
    // Without Persistent, a box that happens to be down at the scheduled hour
    // silently skips the day — and unattended weeks are what this covers.
    expect(unit).toContain('Persistent=true');
    // The TIMER is what gets enabled; the service is pulled by it.
    expect(unit).toContain('WantedBy=timers.target');
    expect(code('cert-check.service')).not.toContain('WantedBy=');
  });
});

/** Every key of /etc/dg2/env. The runbook is the only inventory of them. */
const ENV_KEYS = [
  'DG2_DOMAIN', 'DG2_UPSTREAM', 'DG2_DB', 'DG2_RELEASE',
  'LITESTREAM_BUCKET', 'LITESTREAM_ENDPOINT',
  'AWS_ACCESS_KEY_ID', 'AWS_SECRET_ACCESS_KEY',
];

describe('ops/README.md', () => {
  it('o runbook nomeia todas as chaves de /etc/dg2/env', () => {
    // A key that exists on the box and is named nowhere is the one a rebuild
    // discovers by the service failing to start.
    const readme = read('README.md');
    expect(ENV_KEYS.filter((k) => !readme.includes(k))).toEqual([]);
  });

  it('o runbook registra que reload não relê o EnvironmentFile (P-6)', () => {
    expect(read('README.md')).toContain('restart caddy');
  });

  it('o runbook registra o node_modules de produção e o CLI que a restauração usa', () => {
    // The gap 02-08 found and could not close: `server:build` leaves
    // better-sqlite3 as a BARE SPECIFIER on purpose, because esbuild cannot
    // bundle a native .node. Undocumented, the first `systemctl start dg2` dies
    // with ERR_MODULE_NOT_FOUND — before the migration, before the first
    // request, with nothing in the runbook to explain it.
    const readme = read('README.md');
    expect(readme).toContain('better-sqlite3');
    expect(readme).toContain('/srv/dg2/node_modules');
    expect(readme).toContain('ERR_MODULE_NOT_FOUND');
    // The restore drill shells out to the sqlite3 CLI, which is not the same
    // thing as the library above and is not installed by it.
    expect(readme.split('\n').filter((l) => l.includes('sqlite3')).length)
      .toBeGreaterThanOrEqual(2);
  });

  it('o runbook diz como instalar as units, e em que ordem', () => {
    const readme = read('README.md');
    for (const unit of ['dg2.service', 'litestream.service',
                        'cert-check.service', 'cert-check.timer']) {
      expect(readme, `o runbook não menciona ${unit}`).toContain(unit);
    }
    // litestream replicates the database dg2.service creates, so it is enabled
    // after it; the ordered list in §10 is the only place that is written down.
    expect(readme).toContain('systemctl enable --now dg2');
    expect(readme).toContain('daemon-reload');
  });

  it('o runbook manda tornar root dono do que a chave de deploy não pode reescrever', () => {
    // CR-01, segunda metade. §4 afirma que dg2-deploy é "dono da árvore de
    // releases e de nada mais", e o runbook nunca mandava fazer isso ser
    // verdade. O wrapper valida o argv; sem estes passos a validação é a única
    // camada, e a authorized_keys da própria chave fica gravável por ela.
    const readme = read('README.md');
    for (const step of [
      'chown root:root ~dg2-deploy/.ssh',
      'chown -R root:root /srv/dg2/bin',
      'chown -R root:root /srv/dg2/node_modules',
      'chmod 1775 /srv/dg2',
    ]) {
      expect(readme, `o runbook não manda: ${step}`).toContain(step);
    }
    // O sticky bit não é enfeite: sem ele, escrita em /srv/dg2 (que a troca
    // atômica de symlink exige) permite RENOMEAR /srv/dg2/bin e desfazer o
    // passo dos scripts de dono root.
    expect(readme).toContain('StrictModes');
  });

  it('o runbook registra o rrsync como a opção mais forte, com o motivo de não usá-lo', () => {
    // Não é "veja também": é a alternativa que este repositório recusou por um
    // motivo datado (o caminho depende da distribuição e a caixa não existe),
    // e registrar o motivo é o que permite reconsiderar quando ele deixar de
    // valer, em vez de a decisão virar hábito.
    const readme = read('README.md');
    expect(readme).toContain('rrsync');
    expect(readme).toContain('/usr/share/doc/rsync/scripts/rrsync');
  });

  it('o runbook registra que o ensaio de restauração NÃO vira timer (D2-03)', () => {
    const readme = read('README.md');
    expect(readme).toContain('node tools/ops/restore-verify.mjs');
    expect(readme).toContain('D2-03');
  });
});

describe('tools/ops/restore-verify.mjs', () => {
  it('consulta a coluna que a tabela realmente tem', () => {
    // 02-RESEARCH.md:1243 says `delta`. The canonical name is `amount`, from
    // LedgerEvent in src/app/ledger.ts by way of docs/adr/0010, and that is what
    // apps/server/src/db/migrations.ts creates. A probe naming a column that
    // does not exist fails with "no such column" — during the outage, which is
    // the one moment nobody has to spend reading SQL.
    const src = readTool('restore-verify.mjs');
    expect(src).toContain('sum(amount)');
    expect(src).not.toContain('sum(delta)');
    expect(src).toContain('gold_entry');
    // count(*) alone survives a restore that lost every value; the sum alone
    // survives one that merged two rows. The probe is both.
    expect(src).toContain('count(*)');
    // An empty ledger has to compare 0 against 0. Without coalesce the sum is
    // NULL, the concatenation collapses, and the check passes by comparing
    // nothing to nothing.
    expect(src).toContain('coalesce');
  });

  it('restaura para fora do vivo e limpa atrás de si', () => {
    const src = readTool('restore-verify.mjs');
    // `-o` writes elsewhere; the live database is never touched, which is the
    // literal requirement of D2-03 and not a nicety.
    expect(src).toMatch(/'restore'.*'-o'|'-o'.*restored/s);
    expect(src).toContain('mkdtempSync');
    expect(src).toContain('finally');
    expect(src).toContain('rmSync');
  });

  it('segue o contrato de falha e não deixa exceção escapar', () => {
    const src = readTool('restore-verify.mjs');
    // tools/README.md §3: `file:pointer: message` on stderr, exit 1, and no
    // bare throw — a stack trace is exit 1 with no actionable message.
    expect(src).toContain('console.error');
    expect(src).toContain('process.exit(1)');
    expect(src).toMatch(/catch\s*\(\s*error\s*\)\s*\{\s*\n?\s*fail\(/);
  });
});

describe('nenhum arquivo de ops/ carrega endereço ou segredo (D2-15)', () => {
  // NOT comment-stripped: a domain leaked in a comment is leaked all the same.
  it('o único literal IPv4 permitido é o loopback', () => {
    const bad: string[] = [];
    for (const [path, src] of Object.entries(OPS)) {
      for (const m of src.matchAll(/\b(?:\d{1,3}\.){3}\d{1,3}\b/g)) {
        if (m[0] !== '127.0.0.1') bad.push(`${path}: ${m[0]}`);
      }
    }
    expect(bad).toEqual([]);
  });

  it('nenhuma credencial aparece com valor', () => {
    // A key may be NAMED anywhere; what it may never be is assigned. An empty
    // right-hand side or an interpolation is fine — a literal is the leak.
    const bad: string[] = [];
    for (const [path, src] of Object.entries(OPS)) {
      for (const line of src.split('\n')) {
        const m = /AWS_SECRET_ACCESS_KEY=(.*)$/.exec(line);
        if (!m) continue;
        const value = m[1].trim();
        if (value !== '' && !/^\$\{[^}]*\}$/.test(value)) bad.push(`${path}: ${line.trim()}`);
      }
    }
    expect(bad).toEqual([]);
  });

  it('toda linha que nomeia uma credencial traz o ${...} junto', () => {
    // The stricter, syntax-blind form of the assertion above, and the reason
    // ops/README.md §5 spells the interpolated form inside the table instead of
    // merely naming the key. It makes
    //
    //   grep -rn 'AWS_SECRET_ACCESS_KEY' ops/ | grep -v '\${'
    //
    // a leak detector that needs no judgement to read: ANY output is a finding.
    // The `=` regex above cannot see a YAML mapping, a JSON value or a here-doc,
    // and a credential does not care which syntax leaked it.
    const bad: string[] = [];
    for (const [path, src] of Object.entries(OPS)) {
      for (const line of src.split('\n')) {
        for (const key of ['AWS_SECRET_ACCESS_KEY', 'AWS_ACCESS_KEY_ID']) {
          if (line.includes(key) && !line.includes('${')) bad.push(`${path}: ${line.trim()}`);
        }
      }
    }
    expect(bad).toEqual([]);
  });
});
