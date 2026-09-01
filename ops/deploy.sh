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
#
# NO PIPELINE HERE, and that is the point rather than a style preference.
# `set -eu` does not include pipefail, so `sha256sum X | cut -d' ' -f1` reports
# the exit status of `cut`: sha256sum can fail, cut succeeds over empty input,
# the command substitution succeeds, and the hash comes out ''. The decision
# below is then taken on an empty string — and measured under dash it takes the
# WRONG branch, because '' equals the empty OLD_HASH: the script decides not to
# restart and reports a successful deploy.
#
# `set -o pipefail` is deliberately NOT the answer. It reached dash only in
# 0.5.12, and on a dash without it the line does not degrade gracefully — it
# kills the shell on the spot, which would make every script in this directory
# die at line one on an older box. `${VAR%% *}` is plain POSIX parameter
# expansion, needs no `cut`, and inherits `set -e` correctly.
NEW_HASH=$(sha256sum "$SERVER_REL/server.mjs") \
    || fail "$SERVER_REL/server.mjs" 'sha256sum falhou no bundle novo'
NEW_HASH=${NEW_HASH%% *}
OLD_HASH=''
if [ -f "$CURRENT_SERVER/server.mjs" ]; then
    OLD_HASH=$(sha256sum "$CURRENT_SERVER/server.mjs") \
        || fail "$CURRENT_SERVER/server.mjs" 'sha256sum falhou no bundle no ar'
    OLD_HASH=${OLD_HASH%% *}
fi

# Captured BEFORE the swap, because a revert needs somewhere to go. Empty on a
# first deploy, where there is no previous server release to fall back to.
OLD_SERVER_REL=''
if [ -e "$CURRENT_SERVER" ]; then
    OLD_SERVER_REL=$(readlink -f "$CURRENT_SERVER")
fi

swap_symlink "$CURRENT" "$REL"
swap_symlink "$CURRENT_SERVER" "$SERVER_REL"

RESTART_NOTE='dg2 mantido de pé'
if [ "$NEW_HASH" != "$OLD_HASH" ] || ! $SYSTEMCTL is-active --quiet dg2; then
    # Under `set -e` a failing restart used to abort the script right here: the
    # prune never ran, the success line was never printed, and — the part that
    # matters — nothing came out in the `script:pointer: message` format this
    # file's header promises. A deploy that fails quietly does not count.
    #
    # The state left behind was worse than the missing message. `current` on the
    # new client, `current-server` on the new server bundle, and the process
    # serving neither, because a failed `restart` leaves the unit down. The next
    # boot, or the next `systemctl start`, would bring the BROKEN bundle back
    # up, and keep doing it.
    #
    # So the server symlink goes back to what it pointed at. The client half is
    # left forward deliberately: it is static, it is not what failed, and a
    # `rollback.sh` with no argument walks both symlinks back together from
    # here. Bringing the unit up again is deliberately NOT attempted — this
    # script cannot know why the start failed, and a second start on a guess
    # would bury the journal entry that says.
    if ! $SYSTEMCTL restart dg2; then
        if [ -n "$OLD_SERVER_REL" ]; then
            swap_symlink "$CURRENT_SERVER" "$OLD_SERVER_REL"
            fail 'systemctl restart dg2' \
                "a unit não subiu com $SHA; current-server revertido e a unit está parada — veja journalctl -u dg2 e rode rollback.sh"
        fi
        fail 'systemctl restart dg2' \
            "a unit não subiu com $SHA e não havia release anterior para onde reverter — veja journalctl -u dg2"
    fi
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
