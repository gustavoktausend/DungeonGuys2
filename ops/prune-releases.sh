#!/bin/sh
# prune-releases.sh — keep the last KEEP releases in each of the two release
# roots. Same disk layout as deploy.sh, whose header documents it.
#
# KEEP is 5 because 5 is "as far back as I would ever revert", NOT because of
# disk. A release is about 350 KB, and the rsync that writes it uses
# --link-dest, so the files that did not change are hardlinks and five releases
# cost roughly one. Disk was never the constraint; the number is a judgement
# about how bad one afternoon can get.
#
# Failure contract: stderr as `script:pointer: message`, exit 1. Success is ONE
# line on stdout.
set -eu

SELF=prune-releases.sh
KEEP=5
RELEASES=/srv/dg2/releases
SERVER_RELEASES=/srv/dg2/server-releases
CURRENT=/srv/dg2/current
CURRENT_SERVER=/srv/dg2/current-server

REMOVED=0

fail() {
    echo "$SELF:$1: $2" >&2
    exit 1
}

# Resolves the live symlink BEFORE deleting anything, and never deletes what it
# points at. The live release can legitimately fall outside the newest KEEP —
# that is exactly the state a rollback leaves behind — and deleting it would
# leave Caddy with a root that does not exist and the unit with a
# WorkingDirectory that does not exist, from a script whose whole job is
# housekeeping.
prune_root() {
    root=$1
    live_link=$2

    [ -d "$root" ] || return 0

    live=''
    if [ -e "$live_link" ]; then
        live=$(readlink -f "$live_link")
    fi

    n=0
    for dir in $(ls -1dt "$root"/*/ 2>/dev/null || true); do
        path=$(readlink -f "$dir")
        n=$((n + 1))
        # `[ ... ] && continue` would be a bug under `set -e`: a false test
        # makes the AND-list return non-zero and kills the script. Hence `if`.
        if [ "$n" -le "$KEEP" ]; then
            continue
        fi
        if [ "$path" = "$live" ]; then
            continue
        fi
        rm -rf "$path" || fail "$path" 'não consegui remover o release antigo'
        REMOVED=$((REMOVED + 1))
    done
}

prune_root "$RELEASES" "$CURRENT"
prune_root "$SERVER_RELEASES" "$CURRENT_SERVER"

echo "prune ok: $REMOVED removido(s), $KEEP mantidos por raiz"
