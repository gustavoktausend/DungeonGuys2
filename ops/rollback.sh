#!/bin/sh
# rollback.sh — go back to a previous release. Same disk layout as deploy.sh,
# whose header documents it.
#
# THERE IS NO NETWORK CALL ANYWHERE IN THIS FILE, and that is a requirement, not
# an accident (D2-06). No version-control client, no HTTP fetcher, no package
# manager, nothing that has to resolve a name. On a one-box deployment with no
# staging, this script is the ONLY safety net — and the moment it is needed is
# precisely the moment the infrastructure that would hand over a fresh artifact
# is the thing that just failed. A revert that has to download something is not
# a revert; it is a second deploy wearing its clothes.
#
# It also never names the state directory: the database lives outside the
# release tree (D2-07), so moving these two symlinks back moves code back and
# nothing else. That asymmetry is the whole reason a rollback is safe, and the
# complementary half — migrations are always additive, never a DROP or a rename
# inside the same version — is enforced where the migrations live.
#
# Failure contract: stderr as `script:pointer: message`, exit 1. Success is ONE
# line on stdout.
set -eu

SELF=rollback.sh
RELEASES=/srv/dg2/releases
SERVER_RELEASES=/srv/dg2/server-releases
CURRENT=/srv/dg2/current
CURRENT_SERVER=/srv/dg2/current-server

# See the note in deploy.sh: `sudo -n` never prompts, and is a no-op for root.
SYSTEMCTL="sudo -n systemctl"

fail() {
    echo "$SELF:$1: $2" >&2
    exit 1
}

# Atomic swap, for the same reason as in deploy.sh: `ln -sfn` over an existing
# symlink unlinks and recreates, leaving a window with no target; `mv -T` is
# rename(2). Duplicated rather than sourced from a shared file on purpose — a
# rollback that depends on a second file is a rollback with a second way to
# break, and ten lines are cheaper than that.
swap_symlink() {
    ln -sfn "$2" "$1.tmp"
    mv -T "$1.tmp" "$1"
}

[ $# -le 1 ] || fail 'argv' 'uso: rollback.sh [sha]'

LIVE=''
if [ -e "$CURRENT" ]; then
    LIVE=$(readlink -f "$CURRENT")
fi

if [ $# -eq 1 ]; then
    SHA=$1
else
    # No argument: the newest release that is NOT the live one, by directory
    # mtime. Release names are 40 hex characters by construction, so parsing
    # `ls -1dt` carries none of its usual risk — there is no whitespace and no
    # metacharacter to split on.
    SHA=''
    for dir in $(ls -1dt "$RELEASES"/*/ 2>/dev/null || true); do
        candidate=$(readlink -f "$dir")
        if [ "$candidate" = "$LIVE" ]; then
            continue
        fi
        SHA=$(basename "$candidate")
        break
    done
    [ -n "$SHA" ] || fail "$RELEASES" 'não há release anterior para voltar'
fi

printf '%s' "$SHA" | grep -Eq '^[0-9a-f]{40}$' \
    || fail 'argv' 'esperado um sha de 40 hexadecimais minúsculos'

REL="$RELEASES/$SHA"
SERVER_REL="$SERVER_RELEASES/$SHA"

[ -d "$REL" ] || fail "$REL" 'release do cliente não existe — a poda já levou esse sha?'
[ -f "$SERVER_REL/server.mjs" ] || fail "$SERVER_REL/server.mjs" 'bundle do servidor não existe para esse sha'

NEW_HASH=$(sha256sum "$SERVER_REL/server.mjs" | cut -d' ' -f1)
OLD_HASH=''
if [ -f "$CURRENT_SERVER/server.mjs" ]; then
    OLD_HASH=$(sha256sum "$CURRENT_SERVER/server.mjs" | cut -d' ' -f1)
fi

swap_symlink "$CURRENT" "$REL"
swap_symlink "$CURRENT_SERVER" "$SERVER_REL"

# Same conditional restart as the deploy, for the same reason: a restart re-runs
# the migration. Reverting only the client bytes must not pay that price.
RESTART_NOTE='dg2 mantido de pé'
if [ "$NEW_HASH" != "$OLD_HASH" ] || ! $SYSTEMCTL is-active --quiet dg2; then
    $SYSTEMCTL restart dg2
    RESTART_NOTE='dg2 reiniciado'
fi

# No pruning here, ever: a rollback must not delete a release, least of all the
# one it just walked away from.
echo "rollback ok: $SHA ativo, $RESTART_NOTE"
