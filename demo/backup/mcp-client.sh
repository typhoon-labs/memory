#!/bin/sh
# Backup drill: access without hosting. A developer's own MCP client, on this
# machine, uses the platform's tool servers through the gateway. Nothing of
# the developer's runs in the cluster.
#
# As `developer`: the tools the gateway offers at /mcp/delivery and at
# /mcp/observability, and one read call. The token comes from Keycloak with
# the demo's command-line client (`task token -- developer`).
#
# Why a script and not a real MCP client signing in by itself: that does not
# work against this gateway yet. `task demo:backup:mcp-oauth-check` shows where
# it stops and what is missing; the short version is in mcp-oauth-check.sh.
#
# Reads only.
set -o nounset
. "$(dirname "$0")/lib.sh"

showing "developer, from this machine, lists the tools at /mcp/delivery and /mcp/observability through the gateway and makes one read call."

answer="$(mcp "${gateway_url}/mcp/delivery" developer list)"
tools="$(printf '%s' "${answer}" | jq -r '(.tools // []) | join(", ")')"
if [ -n "${tools}" ]; then
  line offered "${gateway_url}/mcp/delivery" "$(printf '%s' "${answer}" | jq -r '.tools | length') tools for a developer: ${tools}"
else
  unexpected "tools/list at /mcp/delivery failed: ${answer}"
fi

answer="$(mcp "${gateway_url}/mcp/observability" developer list)"
count="$(printf '%s' "${answer}" | jq -r '(.tools // []) | length')"
if [ "${count:-0}" -gt 0 ]; then
  line offered "${gateway_url}/mcp/observability" "${count} read-only tools, among them: $(printf '%s' "${answer}" | jq -r '[.tools[] | select(test("^(query|search)_"))] | join(", ")')"
else
  unexpected "tools/list at /mcp/observability failed: ${answer}"
fi

answer="$(mcp "${gateway_url}/mcp/observability" developer call list_datasources '{}')"
sources="$(printf '%s' "${answer}" | jq -r '[.result.datasources[]?.name] | join(", ")' 2>/dev/null)"
if [ "$(printf '%s' "${answer}" | jq -r '.isError')" = "false" ] && [ -n "${sources}" ]; then
  line read "tools/call list_datasources at /mcp/observability" "Grafana's data sources: ${sources}"
else
  unexpected "the read call list_datasources failed: $(printf '%s' "${answer}" | head -c 300)"
fi

answer="$(mcp "${gateway_url}/mcp/delivery" - list)"
if [ "$(printf '%s' "${answer}" | jq -r '.http')" = "401" ]; then
  line refused "the same address without a token" "HTTP 401: $(printf '%s' "${answer}" | jq -r '.error.message')"
else
  unexpected "/mcp/delivery without a token answered: ${answer}"
fi

result "a signed-in developer uses both tool servers from outside the cluster, through the gateway and nothing else."
