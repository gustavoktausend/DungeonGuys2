#!/bin/sh
# cert-check.sh — the LOCAL leg of the two-legged watch of D2-16.
#
# WHY IT EXISTS AT ALL: Let's Encrypt shut down its expiry warning service on
# 2025-06-04. Nothing warns for free any more. Caddy renews on its own and
# almost always succeeds — "almost always" being the whole problem, because the
# way it fails is silence.
#
# WHAT IT CHECKS, WHICH IS THE INTERESTING PART: it opens a TLS connection to
# port 443 and inspects the certificate the server ACTUALLY SERVES, not the file
# on disk. Those are different things, and the classic failure of automatic
# renewal lives exactly in the gap between them — the renewal ran, the file on
# disk is fresh, and the process is still handing out the old certificate
# because it never reloaded (T-2-TLS). A script that read the file would report
# green straight through that failure.
#
# WHY 30 DAYS AND NOT 7: on a box with nobody on call, seven days of warning can
# fall entirely inside one trip. Thirty survives a holiday.
#
# THE EXIT CODE IS THE WHOLE MECHANISM. Do NOT "improve" this script by having
# it notify anyone. openssl exits 1 when the certificate expires inside the
# window; cert-check.service is a oneshot, so that 1 marks the unit `failed` and
# journald keeps the reason. Raising the alarm is the OTHER leg of D2-16 — an
# external third-party monitor (D2-21) — and it is deliberately not here: this
# leg goes quiet along with the box, which is precisely why it is not allowed to
# be the only one.
#
# FAILURE CONTRACT, the same one the four deploy scripts follow: an error goes
# to stderr as `script:pointer: message` and exits 1; success is ONE line on
# stdout.
set -eu

SELF=cert-check.sh

# Comes from /etc/dg2/env through the EnvironmentFile of cert-check.service.
# The `:?` is not decoration: unset, openssl would try to connect to `:443`,
# fail in a way that reads like a network problem, and send whoever opens the
# journal looking at the wrong thing entirely.
: "${DG2_DOMAIN:?não veio do EnvironmentFile}"

DAYS=30

# THE INNER BOUND ON THE HANDSHAKE, and it is load-bearing rather than tidy.
# `openssl s_client` has no timeout of its own, and against a host that
# completes the TCP connection and then never finishes the TLS handshake — a
# blackholing middlebox, a wedged Caddy, a half-open connection — it blocks
# indefinitely.
#
# That is not a slow check, it is a SILENT one, and silence is the one failure
# this file exists to prevent. cert-check.service is Type=oneshot, and systemd
# disables the start timeout for oneshot by default, so the unit would sit in
# `activating` forever: it never reaches `failed`, `systemctl list-units
# --failed` shows nothing, and systemd will not start a second instance while
# the first is still running — so the daily timer quietly stops firing. The leg
# of the watch would go off the air with the box still up, which is exactly the
# case the header claims this leg covers.
#
# It is the same shape P-9 closes for dg2.service with StartLimitIntervalSec and
# StartLimitBurst: bound it, or the failure never becomes a state anyone can
# see. TimeoutStartSec= in the unit is the outer bound; this is the inner one,
# and it is the one that produces a MESSAGE rather than a killed process.
TIMEOUT=20

fail() {
    echo "$SELF:$1: $2" >&2
    exit 1
}

# `echo |` closes stdin so s_client returns instead of waiting for input. Its
# stderr is dropped because it narrates the handshake even on success; a real
# connection failure still surfaces, either as a non-zero status or as empty
# output, and both are handled below.
#
# `timeout` exits 124 when it had to kill, and that gets its own message: "the
# connection opened and then hung" and "the connection never opened" send
# whoever reads the journal to two different places entirely.
STATUS=0
CERT=$(echo | timeout "$TIMEOUT" openssl s_client -servername "$DG2_DOMAIN" \
    -connect "$DG2_DOMAIN:443" 2>/dev/null) || STATUS=$?

if [ "$STATUS" -eq 124 ]; then
    fail "$DG2_DOMAIN:443" "o handshake TLS não terminou em ${TIMEOUT}s — a conexão abriu e ficou pendurada"
elif [ "$STATUS" -ne 0 ]; then
    fail "$DG2_DOMAIN:443" 'não consegui completar o handshake TLS'
fi

[ -n "$CERT" ] || fail "$DG2_DOMAIN:443" 'o servidor não apresentou certificado'

# THE PARSE IS PROVED BEFORE THE EXPIRY IS CHECKED, because `openssl x509
# -checkend` exits 1 for BOTH "expires inside the window" and "I could not read
# this input". Collapsed into one branch, anything that came back on port 443
# and was not a certificate got reported as a certificate about to expire —
# sending the reader to renew something that is not the problem, during the one
# window where the remaining time is the whole point.
printf '%s\n' "$CERT" | openssl x509 -noout >/dev/null 2>&1 \
    || fail "$DG2_DOMAIN:443" 'o que voltou na 443 não é um certificado que o openssl saiba ler'

printf '%s\n' "$CERT" | openssl x509 -noout -checkend $((DAYS * 86400)) >/dev/null \
    || fail "$DG2_DOMAIN:443" "o certificado servido expira em menos de $DAYS dias"

echo "cert-check ok: o certificado servido em $DG2_DOMAIN vale mais de $DAYS dias"
