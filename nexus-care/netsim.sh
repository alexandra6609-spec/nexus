#!/usr/bin/env bash

set -euo pipefail

usage() {
  cat <<'EOF'
Usage:
  sudo ./netsim.sh apply <interface> <delay-ms> [jitter-ms]
  sudo ./netsim.sh clear <interface>

Apply or clear outbound network delay using Linux tc netem.
EOF
}

fail() {
  printf 'netsim: %s\n' "$1" >&2
  exit 1
}

is_nonnegative_number() {
  [[ "$1" =~ ^([0-9]+([.][0-9]*)?|[.][0-9]+)$ ]]
}

if [[ $# -lt 1 ]]; then
  usage >&2
  exit 2
fi

action=$1

case "$action" in
  apply)
    if [[ $# -lt 3 || $# -gt 4 ]]; then
      usage >&2
      exit 2
    fi

    interface=$2
    delay_ms=$3
    jitter_ms=${4:-}

    is_nonnegative_number "$delay_ms" || fail "delay must be a non-negative number of milliseconds"
    if [[ -n "$jitter_ms" ]]; then
      is_nonnegative_number "$jitter_ms" || fail "jitter must be a non-negative number of milliseconds"
    fi

    command -v tc >/dev/null 2>&1 || fail "tc is required (install the iproute2 package)"
    (( EUID == 0 )) || fail "run this command with sudo to change network settings"

    if [[ -n "$jitter_ms" ]]; then
      tc qdisc replace dev "$interface" root netem delay "${delay_ms}ms" "${jitter_ms}ms"
    else
      tc qdisc replace dev "$interface" root netem delay "${delay_ms}ms"
    fi
    printf 'Applied %sms delay%s on %s.\n' \
      "$delay_ms" "${jitter_ms:+ with ${jitter_ms}ms jitter}" "$interface"
    ;;
  clear)
    if [[ $# -ne 2 ]]; then
      usage >&2
      exit 2
    fi

    interface=$2
    command -v tc >/dev/null 2>&1 || fail "tc is required (install the iproute2 package)"
    (( EUID == 0 )) || fail "run this command with sudo to change network settings"

    tc qdisc del dev "$interface" root
    printf 'Cleared network simulation on %s.\n' "$interface"
    ;;
  -h|--help|help)
    usage
    ;;
  *)
    usage >&2
    fail "unknown action: $action"
    ;;
esac
