#!/bin/sh
# Run delivery-mcp on this machine with a test issuer and a stub search service.
#
#   local.sh up       test issuer :18199, stub search :18198, delivery-mcp :18190
#   local.sh down     stop what `up` started, and nothing else
#   local.sh status   which of the three are running
#   local.sh token <identity>   print a token from the test issuer
#
# Everything binds to 127.0.0.1. Process IDs and logs go to .run/ (git-ignored).
set -o errexit
set -o nounset

cd "$(dirname "$0")/.."
RUN_DIR=.run
ISSUER_PORT="${ISSUER_PORT:-18199}"
SEARCH_PORT="${SEARCH_PORT:-18198}"
PORT="${PORT:-18190}"
PY=.venv/bin/python

alive() { [ -f "$RUN_DIR/$1.pid" ] && kill -0 "$(cat "$RUN_DIR/$1.pid")" 2>/dev/null; }

start() {
  name="$1"; shift
  if alive "$name"; then echo "$name already running"; return; fi
  nohup "$@" > "$RUN_DIR/$name.log" 2>&1 &
  echo $! > "$RUN_DIR/$name.pid"
}

wait_for() {
  i=0
  until curl -fsS -o /dev/null "$2" 2>/dev/null; do
    i=$((i + 1))
    if [ "$i" -gt 100 ] || ! alive "$1"; then
      echo "$1 did not start; see $RUN_DIR/$1.log" >&2
      tail -n 20 "$RUN_DIR/$1.log" >&2 || true
      exit 1
    fi
    sleep 0.1
  done
}

case "${1:-}" in
  up)
    [ -x "$PY" ] || uv sync
    mkdir -p "$RUN_DIR"
    start issuer "$PY" scripts/test_issuer.py --port "$ISSUER_PORT"
    wait_for issuer "http://127.0.0.1:$ISSUER_PORT/healthz"
    start search "$PY" scripts/stub_search.py --port "$SEARCH_PORT"
    wait_for search "http://127.0.0.1:$SEARCH_PORT/search?q=red"
    OIDC_ISSUER="http://127.0.0.1:$ISSUER_PORT" \
    OIDC_JWKS_URL="http://127.0.0.1:$ISSUER_PORT/jwks" \
    OIDC_AUDIENCE=agentgateway \
    APPLIER=fake \
    RETAINED_VERSIONS="${RETAINED_VERSIONS:-2.0.0}" \
    VERIFY_SEARCH_URL="http://127.0.0.1:$SEARCH_PORT/search?q=red" \
    VERIFY_TIMEOUT_SECONDS="${VERIFY_TIMEOUT_SECONDS:-20}" \
    FAKE_APPLY_SECONDS="${FAKE_APPLY_SECONDS:-2}" \
      start delivery-mcp "$PY" src/main.py --host 127.0.0.1 --port "$PORT"
    wait_for delivery-mcp "http://127.0.0.1:$PORT/healthz"
    echo "delivery-mcp http://127.0.0.1:$PORT/mcp   issuer http://127.0.0.1:$ISSUER_PORT   stub search http://127.0.0.1:$SEARCH_PORT"
    ;;
  down)
    for name in delivery-mcp search issuer; do
      if alive "$name"; then
        kill "$(cat "$RUN_DIR/$name.pid")"
        echo "$name stopped"
      fi
      rm -f "$RUN_DIR/$name.pid"
    done
    ;;
  status)
    for name in issuer search delivery-mcp; do
      if alive "$name"; then echo "$name running (pid $(cat "$RUN_DIR/$name.pid"))"; else echo "$name not running"; fi
    done
    ;;
  token)
    curl -fsS "http://127.0.0.1:$ISSUER_PORT/token/${2:-developer}"
    echo
    ;;
  *)
    echo "usage: $0 up|down|status|token <identity>" >&2
    exit 2
    ;;
esac
