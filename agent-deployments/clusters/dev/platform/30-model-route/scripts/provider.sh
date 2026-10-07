#!/bin/sh
# `task model`: which model provider the gateway uses, and switching it.
#
#   provider.sh             what the gateway uses now
#   provider.sh bedrock     switch to Amazon Bedrock, with the AWS credentials
#                           exported in the shell this is started from
#   provider.sh local       back to the provider model-provider.yaml names:
#                           the model endpoint on this machine
#
# Nothing reads AWS credentials unless `bedrock` is asked for. A new cluster
# starts with the provider in model-provider.yaml (next to this directory),
# whatever is exported.
#
# `bedrock` takes from the environment:
#
#   AWS_ACCESS_KEY_ID        The credentials. Needed the first time; later,
#   AWS_SECRET_ACCESS_KEY    without them, the ones in the cluster are kept.
#   AWS_SESSION_TOKEN        With temporary credentials (key ID `ASIA...`).
#   AWS_REGION               Or AWS_DEFAULT_REGION. One region.
#   BEDROCK_MODEL_ID         Bedrock's IDs for the default and the fast model
#   BEDROCK_MODEL_ID_FAST    (MODEL_ID and MODEL_ID_FAST in docs/contracts.md).
#   BEDROCK_ENDPOINT         RuntimeOnly, RuntimePreferred, MantlePreferred or
#                            MantleOnly.
#
# What is not exported keeps its value from the last switch, and before that
# the one in model-provider.yaml, which explains each. Then, in order:
#
#   1. Secret `bedrock-credentials` in agentgateway-system gets the
#      credentials. kind has no workload identity, so the gateway cannot find
#      credentials by itself as it would with IRSA on EKS. They go from the
#      environment to the cluster without passing through a file or a
#      command line.
#   2. ConfigMap `model-provider-selection`, next to it, gets the choice.
#      selection.yaml.gotmpl reads it on every apply of the release, so
#      `task up` and `task deploy` keep the provider that was chosen.
#   3. The release `model-route` is applied.
#   4. The model route's checks run (`task smoke`: one small model call).
#
# Temporary credentials expire. The model route then answers with Bedrock's
# refusal and `task demo:preflight` says NO-GO: export new ones and run
# `bedrock` again.
#
#   --check-env   with `bedrock`: say whether the credentials are there and
#                 change nothing. `task up` asks before it creates anything.
#   --warn-only   a failing check of the model route is reported and is not
#                 an error. `task up:trunk` passes it: the install does not
#                 need the model, the show does.
set -o errexit
set -o nounset

here="$(cd "$(dirname "$0")" && pwd)"
repo="$(cd "${here}/../../../../../.." && pwd)"
# The kubeconfig, the context, `k` and `model_provider` come from scripts/lib/cluster.sh.
. "${repo}/scripts/lib/cluster.sh"

namespace="agentgateway-system"
backend="model-provider"
# `modelProvider.bedrock.credentialSecret` in model-provider.yaml.
secret="bedrock-credentials"
selection="model-provider-selection"
# The IDs clients send; `modelProvider.models` in model-provider.yaml.
model_default="${MODEL_ID:-claude-sonnet-5-5}"
model_fast="${MODEL_ID_FAST:-claude-haiku-4-5-20251001}"

usage() { echo "usage: provider.sh [bedrock [--check-env] | local] [--warn-only]" >&2; exit 2; }
fail() { echo "model: $1" >&2; shift; for more in "$@"; do echo "       ${more}" >&2; done; exit 1; }

provider=""
check_env=0
warn_only=0
for arg in "$@"; do
  case "${arg}" in
    bedrock|local) [ -z "${provider}" ] || usage; provider="${arg}" ;;
    --check-env) check_env=1 ;;
    --warn-only) warn_only=1 ;;
    *) usage ;;
  esac
done

cluster_there() { [ -f "${kubeconfig}" ] && k get namespace "${namespace}" >/dev/null 2>&1; }
need_cluster() {
  cluster_there || fail "the cluster does not answer, or has no namespace ${namespace}." \
    "Create it: task up:trunk" \
    "Or start on Bedrock in one go: MODEL_PROVIDER=bedrock task up"
}
in_cluster() { k --namespace "${namespace}" "$@"; }
has_credentials() { in_cluster get secret "${secret}" >/dev/null 2>&1; }

# --- what the gateway uses now -------------------------------------------------
show() {
  applied="$(in_cluster get agentgatewaybackend "${backend}" --output json 2>/dev/null || echo '{}')"
  case "$(printf '%s' "${applied}" | jq -r '.metadata.labels["model-provider"] // ""')" in
    bedrock)
      printf '%s' "${applied}" | jq -r '
        "Model provider   bedrock, region \(.spec.ai.provider.bedrock.region), endpoint \(.spec.ai.provider.bedrock.endpointPreference // "chosen by the gateway per model")",
        (.spec.policies.ai.modelAliases // {} | to_entries[] | "                 \(.key) -> \(.value)")' ;;
    local)
      printf '%s' "${applied}" | jq -r '"Model provider   local: http://\(.spec.ai.provider.host):\(.spec.ai.provider.port)\(.spec.ai.provider.pathPrefix // "") as the gateway reaches it"' ;;
    *)
      echo "Model provider   none: the release model-route is not applied. Run: task up:trunk" ;;
  esac
  if has_credentials; then
    # The key ID names the credentials and is not a secret; four characters of it are enough.
    in_cluster get secret "${secret}" --output json | jq -r --arg name "${secret}" '
      "AWS credentials  Secret \($name): key ID ...\(.data.accessKey | @base64d | .[-4:]), "
      + (if .data.sessionToken then "with a session token (they expire)" else "no session token" end)
      + ", written \(.metadata.annotations["agentgateway-demo/written-at"] // "at an unknown time")"'
  else
    echo "AWS credentials  none in the cluster"
  fi
}

# --- the parts of a switch -----------------------------------------------------
apply_release() {
  # The same command as `task deploy -- -l name=model-route`, on this
  # directory's helmfile alone. Its output is shown only when it fails.
  if ! output="$(KUBECONFIG="${kubeconfig}" helmfile --kubeconfig "${kubeconfig}" --kube-context "${context}" \
      --file "${here}/../helmfile.yaml" --selector name=model-route sync 2>&1)"; then
    printf '%s\n' "${output}" >&2
    return 1
  fi
}

# Until the gateway's controller has accepted the backend as it is now.
wait_accepted() {
  waited=0
  until [ "$(in_cluster get agentgatewaybackend "${backend}" --output json 2>/dev/null | jq -r '
      (.status.conditions // [] | map(select(.type == "Accepted")) | first) as $accepted
      | $accepted.status == "True" and $accepted.observedGeneration == .metadata.generation')" = "true" ]; do
    waited=$((waited + 1))
    if [ "${waited}" -gt 30 ]; then
      fail "the gateway has not accepted AgentgatewayBackend ${backend} after 30s:" \
        "$(in_cluster get agentgatewaybackend "${backend}" --output json | jq -r '[.status.conditions[]? | "\(.type)=\(.status) \(.message)"] | join("; ")')"
    fi
    sleep 1
  done
  # Accepted by the controller is not yet loaded by the proxy.
  sleep 2
}

# check <what to do when the model does not answer>...
check() {
  echo
  if "${repo}/agent-platform/tests/model-route.sh"; then
    return 0
  fi
  echo
  echo "The switch is applied, and the model route does not pass its checks. The first check is the one that reaches the model."
  for hint in "$@"; do echo "  -> ${hint}"; done
  [ "${warn_only}" = 1 ] || exit 1
}

# --- bedrock -------------------------------------------------------------------
use_bedrock() {
  from_env=0
  if [ -n "${AWS_ACCESS_KEY_ID:-}" ] && [ -n "${AWS_SECRET_ACCESS_KEY:-}" ]; then
    case "${AWS_ACCESS_KEY_ID}" in
      ASIA*) [ -n "${AWS_SESSION_TOKEN:-}" ] || fail "AWS_ACCESS_KEY_ID is a temporary key (ASIA...) and AWS_SESSION_TOKEN is not exported." "Export all three, then run this again." ;;
    esac
    from_env=1
  elif [ -n "${AWS_ACCESS_KEY_ID:-}${AWS_SECRET_ACCESS_KEY:-}" ]; then
    fail "only one of AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY is exported. Bedrock needs both."
  elif ! { cluster_there && has_credentials; }; then
    fail "no AWS credentials: none exported in this shell, none in the cluster." \
      "export AWS_ACCESS_KEY_ID=... AWS_SECRET_ACCESS_KEY=... AWS_SESSION_TOKEN=...   (the last with temporary credentials)" \
      "From a profile or a single sign-on session: eval \"\$(aws configure export-credentials --format env)\"" \
      "Then run this again in the same shell."
  fi
  region="${AWS_REGION:-${AWS_DEFAULT_REGION:-}}"
  case "${region}" in *[!a-z0-9-]*) fail "the region \"${region}\" (AWS_REGION or AWS_DEFAULT_REGION) is not a region name such as us-east-1." ;; esac
  case "${BEDROCK_ENDPOINT:-}" in
    ""|RuntimeOnly|RuntimePreferred|MantlePreferred|MantleOnly) ;;
    *) fail "BEDROCK_ENDPOINT is \"${BEDROCK_ENDPOINT}\"; it is one of RuntimeOnly, RuntimePreferred, MantlePreferred, MantleOnly." ;;
  esac
  if [ "${check_env}" = 1 ]; then
    if [ "${from_env}" = 1 ]; then echo "AWS credentials are exported in this shell."; else echo "AWS credentials are in the cluster (Secret ${secret})."; fi
    return 0
  fi
  need_cluster

  if [ "${from_env}" = 1 ]; then
    # jq reads the three values from the environment and writes them as the
    # Secret's `data`. Server-side apply keeps no copy of them in an
    # annotation, and removes a session token that is no longer exported.
    jq -n --arg name "${secret}" --arg namespace "${namespace}" --arg now "$(date -u '+%Y-%m-%dT%H:%M:%SZ')" '
      {apiVersion: "v1", kind: "Secret", type: "Opaque",
       metadata: {name: $name, namespace: $namespace, annotations: {"agentgateway-demo/written-at": $now}},
       data: ({accessKey: env.AWS_ACCESS_KEY_ID, secretKey: env.AWS_SECRET_ACCESS_KEY}
              + (if (env.AWS_SESSION_TOKEN // "") != "" then {sessionToken: env.AWS_SESSION_TOKEN} else {} end)
              | map_values(@base64))}' |
      k apply --server-side --force-conflicts --field-manager model-provider --filename - >/dev/null
  else
    echo "No AWS credentials exported in this shell: the ones in the cluster are kept."
  fi

  # The last switch's values, with what is exported now on top. JSON is YAML,
  # so selection.yaml.gotmpl hands it to Helm as it is.
  previous="$(in_cluster get configmap "${selection}" --ignore-not-found --output 'jsonpath={.data.values}')"
  values="$(printf '%s' "${previous:-null}" | REGION="${region}" jq -c --arg default "${model_default}" --arg fast "${model_fast}" '
    .modelProvider.active = "bedrock"
    | if env.REGION != "" then .modelProvider.bedrock.region = env.REGION else . end
    | if (env.BEDROCK_ENDPOINT // "") != "" then .modelProvider.bedrock.endpointPreference = env.BEDROCK_ENDPOINT else . end
    | if (env.BEDROCK_MODEL_ID // "") != "" then .modelProvider.bedrock.modelIds[$default] = env.BEDROCK_MODEL_ID else . end
    | if (env.BEDROCK_MODEL_ID_FAST // "") != "" then .modelProvider.bedrock.modelIds[$fast] = env.BEDROCK_MODEL_ID_FAST else . end')"
  write_selection "${values}"
  if ! apply_release; then
    # Not applied: the choice must not stay behind and break the next `task up`.
    if [ -n "${previous}" ]; then write_selection "${previous}"; else in_cluster delete configmap "${selection}" --ignore-not-found >/dev/null; fi
    fail "the release model-route was not applied (helmfile's output is above). The provider is as it was."
  fi
  wait_accepted
  show
  check \
    "\"security token\", \"expired\", \"signature\": the credentials. Export new ones in this shell, then: task model -- bedrock" \
    "\"not authorized\", \"access denied\": the IAM identity may not invoke the model, or the account has no access to it in this region. A policy scoped by service name must allow both bedrock and bedrock-mantle" \
    "\"model identifier\", \"not found\", \"not supported\": the model IDs or the endpoint. model-provider.yaml, next to this script's directory, says what they are; BEDROCK_MODEL_ID, BEDROCK_MODEL_ID_FAST and BEDROCK_ENDPOINT replace them: BEDROCK_ENDPOINT=RuntimeOnly BEDROCK_MODEL_ID=... BEDROCK_MODEL_ID_FAST=... task model -- bedrock" \
    "another region: AWS_REGION=... task model -- bedrock" \
    "back to the model endpoint on this machine: task model -- local"
}

write_selection() {
  jq -n --arg name "${selection}" --arg namespace "${namespace}" --arg values "$1" '
    {apiVersion: "v1", kind: "ConfigMap", metadata: {name: $name, namespace: $namespace}, data: {values: $values}}' |
    k apply --server-side --force-conflicts --field-manager model-provider --filename - >/dev/null
}

# --- local ---------------------------------------------------------------------
use_local() {
  need_cluster
  in_cluster delete configmap "${selection}" --ignore-not-found >/dev/null
  apply_release || fail "the release model-route was not applied (helmfile's output is above)."
  wait_accepted
  show
  if [ "$(model_provider)" != "local" ]; then
    echo "model-provider.yaml names $(model_provider), not local: that is what a cluster without a switch uses."
  fi
  if has_credentials; then
    echo "The AWS credentials stay in the cluster for the next \`task model -- bedrock\`. To remove them:"
    echo "  kubectl --kubeconfig \"${kubeconfig}\" --context ${context} --namespace ${namespace} delete secret ${secret}"
  fi
  check \
    "the model endpoint on this machine must answer at http://localhost:7070: task status" \
    "which part of the model route fails: task smoke"
}

case "${provider}" in
  bedrock) use_bedrock ;;
  local) [ "${check_env}" = 0 ] || usage; use_local ;;
  "")
    [ "${check_env}" = 0 ] || usage
    need_cluster
    show
    echo "Switch           task model -- bedrock   (AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY and AWS_SESSION_TOKEN from this shell)"
    echo "                 task model -- local"
    ;;
esac
