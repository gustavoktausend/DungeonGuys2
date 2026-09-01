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

# Lists the release directories of $1, newest first, one 40-hex name per line
# and nothing else. Two properties are load-bearing, and neither was true of
# the `$(ls -1dt ...)` this replaces:
#
#   1. It does not parse `ls`. The comment that used to sit here justified
#      parsing it with "release names are 40 hex characters by construction" —
#      and nothing on the box enforces the construction. Both release roots are
#      writable by dg2-deploy, and a manual mkdir or a half-finished rsync is
#      enough to put a name with a space there.
#   2. The basename is validated BEFORE it is used as a path, and the path is
#      rebuilt from the root instead of from the split token. The only paths
#      this function can ever name are "$1/<40 hexadecimais>".
#
# `read -r` with two variables puts the entire rest of the line — spaces and
# all — into the second one, so a directory whose name has a space arrives
# intact and is then refused, rather than arriving as two words that happen to
# parse. The pipeline's exit status is the loop's, so no release at all is an
# empty answer and not a failure; the caller decides what that means.
release_names() {
    stat -c '%Y %n' "$1"/*/ 2>/dev/null | sort -rn | while read -r _mtime path; do
        base=${path%/}
        base=${base##*/}
        case "$base" in
            *[!0-9a-f]* | '') continue ;;
        esac
        [ ${#base} -eq 40 ] || continue
        printf '%s\n' "$base"
    done
}

[ $# -le 1 ] || fail 'argv' 'uso: rollback.sh [sha]'

LIVE=''
if [ -e "$CURRENT" ]; then
    LIVE=$(readlink -f "$CURRENT")
fi

if [ $# -eq 1 ]; then
    SHA=$1
else
    # No argument: the release immediately BEFORE the live one, in mtime order.
    #
    # It used to be "the newest release that is NOT the live one", which is
    # right exactly once. Roll back from N and it correctly lands on N-1. Roll
    # back AGAIN — which is what an operator does when N-1 turns out to be bad
    # too — and the newest non-live release is N, the one just abandoned. The
    # script oscillated between two releases and could never reach N-2.
    # Measured under dash against five releases: E, D, E, D, forever. The first
    # moment it matters is the second rollback of a bad night, which is the
    # worst possible moment to find out.
    #
    # So: walk the mtime-ordered list, remember when the live entry goes past,
    # and take the first entry AFTER it. The word splitting below is safe by
    # construction rather than by assumption — release_names emits nothing but
    # 40 hex characters per line.
    SHA=''
    NEWEST_OTHER=''
    PASSED_LIVE=''
    for base in $(release_names "$RELEASES"); do
        if [ "$(readlink -f "$RELEASES/$base")" = "$LIVE" ]; then
            PASSED_LIVE=yes
            continue
        fi
        if [ -n "$PASSED_LIVE" ]; then
            SHA=$base
            break
        fi
        if [ -z "$NEWEST_OTHER" ]; then
            NEWEST_OTHER=$base
        fi
    done

    # The fallback covers ONE case: the live symlink resolves to something that
    # is not in the list — a hand-made symlink, or a release the prune already
    # took. There is then no position to walk back from, and the newest release
    # that is not live is the only defensible answer.
    #
    # It deliberately does NOT cover "the live release is the oldest one". That
    # case genuinely has no predecessor, and saying so is the honest answer;
    # falling back there would reintroduce the oscillation this replaces.
    if [ -z "$SHA" ] && [ -z "$PASSED_LIVE" ]; then
        SHA=$NEWEST_OTHER
    fi
    [ -n "$SHA" ] || fail "$RELEASES" 'não há release anterior para voltar'
fi

printf '%s' "$SHA" | grep -Eq '^[0-9a-f]{40}$' \
    || fail 'argv' 'esperado um sha de 40 hexadecimais minúsculos'

REL="$RELEASES/$SHA"
SERVER_REL="$SERVER_RELEASES/$SHA"

[ -d "$REL" ] || fail "$REL" 'release do cliente não existe — a poda já levou esse sha?'
[ -f "$SERVER_REL/server.mjs" ] || fail "$SERVER_REL/server.mjs" 'bundle do servidor não existe para esse sha'

# No pipeline, for the reason deploy.sh's twin spells out: `set -eu` carries no
# pipefail, so `sha256sum X | cut` reports cut's status and hands back '' when
# sha256sum fails — and '' equals the empty OLD_HASH, so the conditional below
# silently takes the "do not restart" branch. `set -o pipefail` is not the
# answer either: on a dash older than 0.5.12 it does not degrade, it kills the
# shell at that line.
NEW_HASH=$(sha256sum "$SERVER_REL/server.mjs") \
    || fail "$SERVER_REL/server.mjs" 'sha256sum falhou no bundle de destino'
NEW_HASH=${NEW_HASH%% *}
OLD_HASH=''
if [ -f "$CURRENT_SERVER/server.mjs" ]; then
    OLD_HASH=$(sha256sum "$CURRENT_SERVER/server.mjs") \
        || fail "$CURRENT_SERVER/server.mjs" 'sha256sum falhou no bundle no ar'
    OLD_HASH=${OLD_HASH%% *}
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
