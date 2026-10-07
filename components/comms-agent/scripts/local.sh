#!/bin/sh
# Run comms-agent on this machine, on port 18192.
#
#   local.sh up       start it (needs delivery-mcp's local stack: its scripts/local.sh up)
#   local.sh down     stop it
#   local.sh status   is it running
#
# It binds to 127.0.0.1. The process ID and the log go to .run/ (git-ignored).
# Defaults are the local-development bindings in docs/contracts.md;
# any of them can be set in the environment first, for example
#   MODEL_ID=claude-haiku-4-5-20251001 scripts/local.sh up
set -o errexit
set -o nounset

cd "$(dirname "$0")/.."
RUN_DIR=.run
NAME=comms-agent
PORT="${PORT:-18192}"
ISSUER="${OIDC_ISSUER:-http://127.0.0.1:18199}"

alive() { [ -f "$RUN_DIR/$NAME.pid" ] && kill -0 "$(cat "$RUN_DIR/$NAME.pid")" 2>/dev/null; }

case "${1:-}" in
  up)
    [ -x .venv/bin/python ] || uv sync --frozen
    mkdir -p "$RUN_DIR"
    if alive; then echo "$NAME already running"; exit 0; fi
    OIDC_ISSUER="$ISSUER" \
    OIDC_JWKS_URL="${OIDC_JWKS_URL:-$ISSUER/jwks}" \
    OIDC_AUDIENCE="${OIDC_AUDIENCE:-agentgateway}" \
    DELIVERY_MCP_URL="${DELIVERY_MCP_URL:-http://127.0.0.1:18190/mcp}" \
    MODEL_BASE_URL="${MODEL_BASE_URL:-http://localhost:7070}" \
    MODEL_ID="${MODEL_ID:-claude-sonnet-5-5}" \
    MODEL_ID_FAST="${MODEL_ID_FAST:-claude-haiku-4-5-20251001}" \
    HOST=127.0.0.1 PORT="$PORT" PYTHONPATH=src \
      nohup .venv/bin/python -m comms_agent > "$RUN_DIR/$NAME.log" 2>&1 &
    echo $! > "$RUN_DIR/$NAME.pid"
    i=0
    until curl -fsS -o /dev/null "http://127.0.0.1:$PORT/healthz" 2>/dev/null; do
      i=$((i + 1))
      if [ "$i" -gt 150 ] || ! alive; then
        echo "$NAME did not start; see $RUN_DIR/$NAME.log" >&2
        tail -n 20 "$RUN_DIR/$NAME.log" >&2 || true
        exit 1
      fi
      sleep 0.1
    done
    echo "$NAME http://127.0.0.1:$PORT   card http://127.0.0.1:$PORT/.well-known/agent-card.json"
    ;;
  down)
    if alive; then kill "$(cat "$RUN_DIR/$NAME.pid")"; echo "$NAME stopped"; fi
    rm -f "$RUN_DIR/$NAME.pid"
    ;;
  status)
    if alive; then echo "$NAME running (pid $(cat "$RUN_DIR/$NAME.pid"))"; else echo "$NAME not running"; fi
    ;;
  *)
    echo "usage: $0 up|down|status" >&2
    exit 2
    ;;
esac
