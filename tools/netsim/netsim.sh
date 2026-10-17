#!/usr/bin/env bash
# netsim.sh - simulate a low-bandwidth / no-service region between two servers
#
# Usage (run as root on each server, pointing at the OTHER server):
#   sudo ./netsim.sh <interface> <peer_ip> [live|normal|low|nosignal|dead|flaky|status]
#
# Examples:
#   sudo ./netsim.sh eth0 10.0.0.2            # interactive demo mode (hotkeys)
#   sudo ./netsim.sh eth0 10.0.0.2 nosignal   # one-shot: 0-1 bars
#   sudo ./netsim.sh eth0 10.0.0.2 normal     # one-shot: restore everything
#
# Only traffic TO the peer is shaped, so SSH etc. keeps working.
# Run it on BOTH servers (each pointing at the other) to affect both directions.

set -u
IF="${1:?interface required, e.g. eth0}"
PEER="${2:?peer ip required}"
CMD="${3:-live}"

# ---- Profiles (tweak these to taste) ---------------------------------------
# ~1 bar: usable but painful. Pages crawl, some requests time out.
LOW="delay 1200ms 400ms loss 20% rate 16kbit"

# 0-1 bars "no service": basically dead, the odd packet squeezes through.
NOSIGNAL="delay 3000ms 1000ms loss 90% rate 4kbit"

# True hard outage, nothing gets through at all (hotkey 'x').
DEAD="loss 100%"

# Flaky mode extras:
CRAWL="delay 1500ms 600ms loss 30% rate 12kbit"    # barely hanging on
SPARK="delay 500ms 250ms loss 8% rate 48kbit"      # brief decent window, small loads finish
# ----------------------------------------------------------------------------

FLAKY_PID=""

setup() {
  tc qdisc del dev "$IF" root 2>/dev/null
  tc qdisc add dev "$IF" root handle 1: prio
  tc qdisc add dev "$IF" parent 1:3 handle 30: netem delay 0ms
  tc filter add dev "$IF" protocol ip parent 1:0 prio 3 u32 \
    match ip dst "$PEER"/32 flowid 1:3
}

apply() { tc qdisc change dev "$IF" parent 1:3 handle 30: netem $1; }

stop_flaky() {
  if [[ -n "$FLAKY_PID" ]]; then
    kill "$FLAKY_PID" 2>/dev/null
    wait "$FLAKY_PID" 2>/dev/null
    FLAKY_PID=""
  fi
}

flaky_loop() {
  # Very bad wifi: mostly dead or crawling, with random sparks where
  # something small can actually load before the signal drops again.
  while true; do
    roll=$((RANDOM % 10))
    if   (( roll < 5 )); then
      apply "$NOSIGNAL"; echo "[flaky] 0 bars"
      sleep $((RANDOM % 8 + 4))          # 4-11s
    elif (( roll < 8 )); then
      apply "$CRAWL";    echo "[flaky] 1 bar (crawling)"
      sleep $((RANDOM % 5 + 3))          # 3-7s
    else
      apply "$SPARK";    echo "[flaky] spark! (window to load)"
      sleep $((RANDOM % 4 + 2))          # 2-5s
    fi
  done
}

set_mode() {
  stop_flaky
  case "$1" in
    normal)   apply "delay 0ms";  echo "[mode] NORMAL" ;;
    low)      apply "$LOW";       echo "[mode] LOW BANDWIDTH (~1 bar)" ;;
    nosignal) apply "$NOSIGNAL";  echo "[mode] NO SERVICE (0-1 bars)" ;;
    dead)     apply "$DEAD";      echo "[mode] HARD OUTAGE (nothing gets through)" ;;
    flaky)    flaky_loop & FLAKY_PID=$!; echo "[mode] FLAKY (very bad wifi + sparks)" ;;
  esac
}

cleanup() {
  stop_flaky
  tc qdisc del dev "$IF" root 2>/dev/null
  echo -e "\nCleaned up. Network back to normal."
  exit 0
}

if [[ $EUID -ne 0 ]]; then echo "Run as root (sudo)."; exit 1; fi

case "$CMD" in
  status) tc qdisc show dev "$IF"; exit 0 ;;
  normal) tc qdisc del dev "$IF" root 2>/dev/null; echo "Restored."; exit 0 ;;
  low|nosignal|dead)
    setup; set_mode "$CMD"; exit 0 ;;   # stays applied until you run 'normal'
  live|flaky) ;;
  *) echo "Unknown command: $CMD"; exit 1 ;;
esac

trap cleanup INT TERM
setup
echo "Controlling $IF -> $PEER"
echo "Keys:  n = normal   l = ~1 bar   o = no service (0-1 bars)   f = flaky   x = hard dead   q = quit"
[[ "$CMD" == "flaky" ]] && set_mode flaky || set_mode normal

while true; do
  read -rsn1 key
  case "$key" in
    n) set_mode normal ;;
    l) set_mode low ;;
    o) set_mode nosignal ;;
    f) set_mode flaky ;;
    x) set_mode dead ;;
    q) cleanup ;;
  esac
done