#!/bin/sh
# A fallback for the alert, by hand. Normally nothing has to be done: about 25
# seconds after `task demo:break`, Alertmanager posts the firing alert to the
# chat assistant's hook, the incident card appears, and diagnosis-agent fills
# it in. Use this when the observability stack is not installed, when the
# alert does not come, or when no diagnosis arrives.
#
#   1. Posts a firing alert, in Alertmanager's webhook format, to the hook
#      (/hooks/alert) through the gateway, as the machine identity
#      `alert-automation`. The assistant opens the incident, if none is open,
#      and asks diagnosis-agent, if the incident has no diagnosis.
#   2. Waits for the diagnosis, ALERT_DIAGNOSIS_WAIT seconds (default 45). If
#      none arrives, records one itself with delivery-mcp's record_diagnosis,
#      so that the card has a version to propose. It says so when it does.
set -o errexit
set -o nounset
. "$(dirname "$0")/lib.sh"

token="$("${repo}/local/identity/token.sh" alert-automation)"

answer="$(curl --silent --show-error --max-time 60 -X POST "${gateway_url}/hooks/alert" \
  -H "authorization: Bearer ${token}" -H 'content-type: application/json' \
  -d '{
    "version": "4",
    "status": "firing",
    "alerts": [{
      "status": "firing",
      "labels": {"alertname": "SearchErrorRatioHigh", "service": "search-service", "severity": "critical"},
      "annotations": {
        "summary": "Search is failing: requests to search-service return a server error.",
        "impact": "Visitors of the Sample App cannot search the catalogue."
      }
    }]
  }')"
incident="$(printf '%s' "${answer}" | jq -r '.results[0].incident_id // empty' 2>/dev/null || true)"
if [ -z "${incident}" ]; then
  echo "the alert hook at ${gateway_url}/hooks/alert did not open an incident: ${answer}" >&2
  exit 1
fi
echo "Alert delivered by hand: $(printf '%s' "${answer}" | jq -c '.results[0]')"

recommended() {
  mcp_call "${token}" get_incident "$(jq -n --arg id "${incident}" '{incident_id: $id}')" | jq -r '.diagnosis.recommended_version // empty'
}

limit="${ALERT_DIAGNOSIS_WAIT:-45}"
waited=0
while [ -z "$(recommended)" ] && [ "${waited}" -lt "${limit}" ]; do
  sleep 2
  waited=$((waited + 2))
done
if [ -n "$(recommended)" ]; then
  echo "Diagnosis recorded for ${incident} after ${waited}s: roll back to $(recommended)"
  exit 0
fi

recorded="$(mcp_call "${token}" record_diagnosis "$(jq -n --arg id "${incident}" '{
  incident_id: $id,
  suspected_cause: "search-service 2.1.0 fails on every query; 2.0.0 did not",
  evidence: ["HTTP 500 on GET /search since the 2.1.0 rollout", "No errors before it; registration-service and web are healthy"],
  recommended_version: "2.0.0"
}')" | jq -r '.diagnosis.recommended_version // empty')"
if [ "${recorded}" != "2.0.0" ]; then
  echo "no diagnosis arrived in ${limit}s, and record_diagnosis for ${incident} did not succeed through ${gateway_url}/mcp/delivery" >&2
  exit 1
fi
echo "No diagnosis arrived in ${limit}s. Recorded one by hand for ${incident}, as alert-automation: roll back to 2.0.0"
