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

# Lists the release directories of $1, newest first, one 40-hex name per line
# and nothing else. Duplicated from ops/rollback.sh rather than sourced from a
# shared file, for the reason its swap_symlink() twin already records: a
# housekeeping script that depends on a second file being present and correct
# is a script with a second way to break.
#
# THE POINT OF IT IS THE VALIDATION, because the loop below ends in `rm -rf`.
# The previous form was `for dir in $(ls -1dt "$root"/*/)`, justified by
# "release names are 40 hex characters by construction" — and nothing on the box
# enforces that construction. Both release roots are writable by dg2-deploy, a
# manual mkdir or a half-finished `rsync --partial` is enough, and a directory
# named `a b` split into two words: `readlink -f b` then canonicalised against
# the PROCESS's working directory — under an SSH forced command that is the
# deploy user's home, not /srv/dg2 — and `rm -rf` was aimed at whatever came
# back.
#
# Now the basename is validated before it is used at all, and the caller rebuilds
# the path from the root instead of trusting the split token, so the only paths
# this script can ever delete are "$root/<40 hexadecimais>".
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
    # The word splitting here is safe BY CONSTRUCTION and not by assumption:
    # release_names emits nothing but 40 hex characters per line.
    for base in $(release_names "$root"); do
        path=$(readlink -f "$root/$base")
        n=$((n + 1))
        # `[ ... ] && continue` would be a bug under `set -e`: a false test
        # makes the AND-list return non-zero and kills the script. Hence `if`.
        if [ "$n" -le "$KEEP" ]; then
            continue
        fi
        if [ "$path" = "$live" ]; then
            continue
        fi
        # Deleted by the path this script BUILT, never by the canonicalised one
        # it read. The two differ exactly when the entry is a symlink, and there
        # `rm -rf "$path"` would delete the target — outside the release tree,
        # which is the one place this script is allowed to touch. `readlink -f`
        # stays, because comparing against the live symlink needs it.
        rm -rf "$root/$base" || fail "$root/$base" 'não consegui remover o release antigo'
        REMOVED=$((REMOVED + 1))
    done
}

prune_root "$RELEASES" "$CURRENT"
prune_root "$SERVER_RELEASES" "$CURRENT_SERVER"

echo "prune ok: $REMOVED removido(s), $KEEP mantidos por raiz"
