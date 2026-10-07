#!/bin/sh
# Waits until Kyverno's admission controller answers its policy webhook.
# Changes nothing. The presync hook of release `gateway-rules`.
#
# Why: `helm --wait` on release `kyverno` returns when the pod is Ready.
# Kyverno registers its webhooks some seconds after that, and for a moment the
# registration exists while nothing accepts connections behind it. A policy
# applied in that moment is refused with "failed calling webhook
# validate-policy.kyverno.svc ... connection refused". Seen on 2026-10-06 on a
# new cluster, where `gateway-rules` follows `kyverno` within a second; on a
# cluster where Kyverno is already running there is nothing to wait for.
#
# The probe is a server-side dry run of a small ValidatingPolicy: it goes
# through the same webhook as the real policies and stores nothing.
set -o errexit
set -o nounset

here="$(cd "$(dirname "$0")" && pwd)"
repo="$(cd "${here}/../../../../../.." && pwd)"
# The kubeconfig, the context and `k` come from scripts/lib/cluster.sh.
. "${repo}/scripts/lib/cluster.sh"

limit="${KYVERNO_WAIT_SECONDS:-180}"

k --namespace kyverno rollout status deployment/kyverno-admission-controller --timeout="${limit}s" | sed 's/^/kyverno: /'

probe() {
  # The registration first: without it a dry run passes because nothing was asked.
  [ "$(k get validatingwebhookconfiguration kyverno-policy-validating-webhook-cfg --output 'jsonpath={.webhooks[0].name}' 2>/dev/null)" != "" ] || return 1
  k apply --dry-run=server --filename - >/dev/null 2>&1 <<'YAML'
apiVersion: policies.kyverno.io/v1
kind: ValidatingPolicy
metadata:
  name: wait-kyverno-probe
spec:
  validationActions:
    - Audit
  evaluation:
    background:
      enabled: false
  matchConstraints:
    resourceRules:
      - apiGroups: [""]
        apiVersions: ["v1"]
        operations: ["CREATE"]
        resources: ["configmaps"]
  validations:
    - expression: "true"
      message: "never refuses"
YAML
}

# Three answers in a row, a second apart: one answer can be the last of an
# old instance, or the first of one that is not steady yet.
waited=0
steady=0
while [ "${steady}" -lt 3 ]; do
  if probe; then steady=$((steady + 1)); else steady=0; fi
  if [ "${waited}" -ge "${limit}" ]; then
    echo "kyverno: its policy webhook did not answer within ${limit}s. Look at: kubectl -n kyverno logs deployment/kyverno-admission-controller" >&2
    exit 1
  fi
  sleep 1
  waited=$((waited + 1))
done
echo "kyverno: the policy webhook answers (after ${waited}s)"
