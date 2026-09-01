#!/bin/sh
# deploy.sh — publish one release. Runs on the box, invoked over SSH by the CI
# through deploy-forced.sh, or by hand by an operator.
#
# DISK LAYOUT ASSUMED BY ALL FOUR SCRIPTS IN THIS DIRECTORY. It is written down
# once, here, because it is the decision the rest of the phase inherits:
#
#   /srv/dg2/releases/<sha>/         the client dist/, one immutable directory
#                                    per commit, rsync'd here by the CI
#   /srv/dg2/server-releases/<sha>/  the bundled server.mjs of the same commit
#   /srv/dg2/current                 symlink to the live client release; this is
#                                    the `root` of the Caddy file_server
#   /srv/dg2/current-server          symlink to the live server release; this is
#                                    the WorkingDirectory of dg2.service
#   /var/lib/dg2/                    the SQLite database, OUTSIDE the release
#                                    tree on purpose, so that moving a symlink
#                                    back never moves data back with it (D2-07)
#   /srv/dg2/bin/                    where these scripts live on the box
#
# FAILURE CONTRACT, inherited from tools/README.md §3 and translated to shell:
# an error goes to stderr as `script:pointer: message` and exits 1; success is
# ONE line on stdout. A script that fails quietly does not count.
set -eu

SELF=deploy.sh
RELEASES=/srv/dg2/releases
SERVER_RELEASES=/srv/dg2/server-releases
CURRENT=/srv/dg2/current
CURRENT_SERVER=/srv/dg2/current-server
BIN=/srv/dg2/bin

# systemctl needs a privilege the deploy key does not have. `sudo -n` never
# prompts, so a missing sudoers rule fails immediately instead of hanging on a
# tty that is not there, and it is a no-op when an operator already runs this as
# root. The drop-in in ops/README.md §4 grants dg2-deploy exactly two systemctl
# verbs on exactly one unit.
SYSTEMCTL="sudo -n systemctl"

fail() {
    echo "$SELF:$1: $2" >&2
    exit 1
}

# `ln -sfn` onto an EXISTING symlink is NOT atomic: it unlinks and recreates,
# and inside that window the path simply does not exist — a request landing
# there gets a 404 from a root that is gone. `ln -sfn` into a temporary name
# followed by `mv -T` is rename(2), which is atomic: no request ever sees the
# gap. `mv -T` is the GNU spelling and the box is Debian/Ubuntu.
swap_symlink() {
    ln -sfn "$2" "$1.tmp"
    mv -T "$1.tmp" "$1"
}

[ $# -eq 1 ] || fail 'argv' 'uso: deploy.sh <sha>'
SHA=$1

# The argument becomes a path, so it is validated before it is concatenated:
# anything carrying `..`, a slash or a shell metacharacter is refused at the
# door instead of sanitised. deploy-forced.sh already checks this; the check is
# repeated here because this script is also reachable by hand.
printf '%s' "$SHA" | grep -Eq '^[0-9a-f]{40}$' \
    || fail 'argv' 'esperado um sha de 40 hexadecimais minúsculos'

REL="$RELEASES/$SHA"
SERVER_REL="$SERVER_RELEASES/$SHA"

[ -d "$REL" ] || fail "$REL" 'release do cliente não existe — o rsync falhou ou o sha está errado'
[ -f "$SERVER_REL/server.mjs" ] || fail "$SERVER_REL/server.mjs" 'bundle do servidor não existe'

# Restart is CONDITIONAL, and that is the point: a restart re-runs the migration,
# which is the only operation of a deploy capable of failing. Paying that risk
# for a CSS change would be trading the safe half of the deploy for nothing.
NEW_HASH=$(sha256sum "$SERVER_REL/server.mjs" | cut -d' ' -f1)
OLD_HASH=''
if [ -f "$CURRENT_SERVER/server.mjs" ]; then
    OLD_HASH=$(sha256sum "$CURRENT_SERVER/server.mjs" | cut -d' ' -f1)
fi

swap_symlink "$CURRENT" "$REL"
swap_symlink "$CURRENT_SERVER" "$SERVER_REL"

RESTART_NOTE='dg2 mantido de pé'
if [ "$NEW_HASH" != "$OLD_HASH" ] || ! $SYSTEMCTL is-active --quiet dg2; then
    $SYSTEMCTL restart dg2
    RESTART_NOTE='dg2 reiniciado'
fi

# Pruning is last and deliberately non-fatal: the swap above already happened,
# so exiting 1 here would tell the CI that a deploy which IS live did not
# happen. A prune that fails still shouts on stderr — it is never silent, it
# just does not get to rewrite the outcome of the deploy.
if ! "$BIN/prune-releases.sh" >/dev/null; then
    echo "$SELF:$BIN/prune-releases.sh: poda falhou; o release $SHA está no ar mesmo assim" >&2
fi

echo "deploy ok: $SHA ativo, $RESTART_NOTE"
