#!/bin/sh
# Run the chat assistant and its UI on this machine.
#
#   local.sh up       server :18193, UI :18194
#   local.sh down     stop what `up` started, and nothing else
#   local.sh status   which of the two are running
#   local.sh walk     walk the incident over A2A as every role (stub mode)
#
# With nothing set, `up` needs nothing else: downstreams are in-memory stubs
# (STUB_DOWNSTREAMS=1) and sign-in uses a test issuer whose key is generated
# when the server starts (DEV_TEST_ISSUER=1). Set variables first to use the
# real things, for example:
#
#   Keycloak:          OIDC_ISSUER=http://localhost:18081/realms/demo \
#                      OIDC_JWKS_URL=http://localhost:18081/realms/demo/protocol/openid-connect/certs
#   real components:   DELIVERY_MCP_URL=http://127.0.0.1:18190 REMEDIATION_AGENT_URL=http://127.0.0.1:18191 \
#                      COMMS_AGENT_URL=http://127.0.0.1:18192   (plus the issuer they trust)
#   model:             MODEL_BASE_URL (default http://localhost:7070), MODEL_ID (default: the fast model)
#
# Everything binds to 127.0.0.1. Process IDs and logs go to .run/ (git-ignored).
set -o errexit
set -o nounset

cd "$(dirname "$0")/.."
RUN_DIR="$PWD/.run"
SERVER_PORT=18193
UI_PORT=18194

alive() { [ -f "$RUN_DIR/$1.pid" ] && kill -0 "$(cat "$RUN_DIR/$1.pid")" 2>/dev/null; }

wait_for() {
  i=0
  until curl -fsS -o /dev/null "$2" 2>/dev/null; do
    i=$((i + 1))
    if [ "$i" -gt 150 ] || ! alive "$1"; then
      echo "$1 did not start; see $RUN_DIR/$1.log" >&2
      tail -n 20 "$RUN_DIR/$1.log" >&2 || true
      exit 1
    fi
    sleep 0.2
  done
}

stop() {
  if alive "$1"; then
    # Each was started in its own session, so the whole group goes.
    kill -- "-$(cat "$RUN_DIR/$1.pid")" 2>/dev/null || kill "$(cat "$RUN_DIR/$1.pid")" 2>/dev/null || true
    echo "$1 stopped"
  fi
  rm -f "$RUN_DIR/$1.pid"
}

case "${1:-}" in
  up)
    [ -d node_modules ] || npm ci --no-audit --no-fund
    mkdir -p "$RUN_DIR"
    if ! alive server; then
      if [ -z "${OIDC_ISSUER:-}" ]; then export DEV_TEST_ISSUER=1; fi
      if [ -z "${DELIVERY_MCP_URL:-}" ]; then export STUB_DOWNSTREAMS=1; fi
      (
        cd packages/server
        PORT="$SERVER_PORT" HOST=127.0.0.1 \
        MODEL_BASE_URL="${MODEL_BASE_URL:-http://localhost:7070}" \
        MODEL_ID="${MODEL_ID:-${MODEL_ID_FAST:-claude-haiku-4-5-20251001}}" \
        UI_A2A_URL="http://localhost:$SERVER_PORT" \
        CORS_ALLOWED_ORIGINS="http://localhost:$UI_PORT" \
        MASTRA_TELEMETRY_DISABLED=1 \
          setsid nohup node --import tsx --import ./src/telemetry.ts src/main.ts > "$RUN_DIR/server.log" 2>&1 &
        echo $! > "$RUN_DIR/server.pid"
      )
      wait_for server "http://127.0.0.1:$SERVER_PORT/healthz"
    fi
    if ! alive ui; then
      npm run build --workspace @chat-assistant/ui > "$RUN_DIR/ui-build.log" 2>&1
      (
        cd packages/ui
        CHAT_ASSISTANT_URL="http://127.0.0.1:$SERVER_PORT" setsid nohup npx vite preview > "$RUN_DIR/ui.log" 2>&1 &
        echo $! > "$RUN_DIR/ui.pid"
      )
      wait_for ui "http://127.0.0.1:$UI_PORT/"
    fi
    echo "chat-assistant http://localhost:$SERVER_PORT (A2A: POST /, card: /.well-known/agent-card.json)   UI http://localhost:$UI_PORT"
    ;;
  down)
    stop ui
    stop server
    ;;
  status)
    for name in server ui; do
      if alive "$name"; then echo "$name running (pid $(cat "$RUN_DIR/$name.pid"))"; else echo "$name not running"; fi
    done
    ;;
  walk)
    shift
    npm run a2a-client --workspace @chat-assistant/server -- --url "http://localhost:$SERVER_PORT" "$@"
    ;;
  *)
    echo "usage: $0 up|down|status|walk" >&2
    exit 2
    ;;
esac
