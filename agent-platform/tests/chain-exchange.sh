#!/bin/sh
# Denied path: an exchange at chain-sts that its rules refuse, each next to
# the exchange the same rule allows.
#
#   actor      no actor token (impersonation); an agent's token for the API
#              server's audience, not chain-sts's; the token of a service
#              account the policy does not name (sample-app's and kagent's
#              `default`); a token bound to a pod that has been deleted
#   order      comms-agent, chat-assistant or remediation-agent after
#              remediation-agent: with the dev policy no third agent may follow
#   max_chain  a fifth agent, on a test instance of the same image with the
#              release's policy and max_chain, and two more agents so that a
#              chain can reach the limit
#   subject    remediation-agent or comms-agent with a Chat UI sign-in, whose
#              audience only chat-assistant may exchange; a forged chain-sts
#              token
#
# Every refusal is checked for its status, its `error` and the words of its
# `error_description`. Exchanges are sent from inside remediation-agent's pod,
# which may reach chain-sts, with actor tokens from `kubectl create token`
# (`--audience chain-sts`, 10 minutes). Each exchange is answered by the
# deployed chain-sts, except the max_chain ones.
#
# Two pods are made and deleted again, also when the check is cut off: an idle
# pod in `agents` running as chat-assistant's account, which the bound token
# names, and the test instance in `chain-sts`, which runs as that namespace's
# `default` account, makes its own key, checks actor tokens against the
# cluster's keys (no TokenReview, so it needs no permission), listens on
# 127.0.0.1 only and is asked with `kubectl exec`.
#
# The deleted pod: the API server refuses its token once the pod is gone,
# but keeps accepting a token it has just accepted for about 10 seconds (it
# caches a successful authentication); the check asks again every couple of
# seconds for up to 30 and says when the refusal came. The whole check takes
# about a minute.
set -o nounset
. "$(dirname "$0")/lib.sh"

run_id="$(date +%s)-$$"
idle_pod="chain-check-${run_id}"
instance_pod="chain-sts-check-${run_id}"
cleanup() {
  k --namespace agents delete pod "${idle_pod}" --ignore-not-found --wait=false >/dev/null 2>&1
  k --namespace chain-sts delete pod "${instance_pod}" --ignore-not-found --wait=false >/dev/null 2>&1
}
trap cleanup EXIT
trap 'exit 130' INT TERM

# expect_refusal <label> <what was tried> <answer> <status> <error> <words in the reason>
expect_refusal() {
  if refused_with "$3" "$4" "$5" && reason "$3" | grep -qF -- "$6"; then
    line "$1" "$2" "$4 $5: $(reason "$3")"
  else
    unexpected "$2: $(shown "$3"), not $4 $5 with \"$6\""
  fi
}
# expect_issued <label> <what was tried> <answer>: prints the issued token's chain.
expect_issued() {
  issued_token="$(issued "$3")"
  if [ -n "${issued_token}" ]; then
    line "$1" "$2" "issued, chain [$(chain "${issued_token}")]"
  else
    unexpected "$2 was not issued: $(shown "$3")"
  fi
}
# sts_actor <agent> [kubectl create token flags]: the agent's token for chain-sts.
sts_actor() { sts_account="$1"; shift; actor_token agents "${sts_account}" --audience chain-sts "$@"; }

showing "exchanges at chain-sts by an actor it must refuse, in an order its policy does not allow, past max_chain, and with a subject token it must not take; each next to one it allows."

pe="$(token platform-engineer)" || { unexpected "no token for platform-engineer from ${PLATFORM_TOKEN_CMD}"; result ""; }
pe_ui="$(token platform-engineer --chat-ui)" || { unexpected "no Chat UI sign-in for platform-engineer from ${PLATFORM_TOKEN_CMD}"; result ""; }

# --- actor --------------------------------------------------------------------

answer="$(exchange "${pe}" "$(sts_actor chat-assistant)")"
expect_issued allowed "chat-assistant, its token for audience chain-sts, platform-engineer's token" "${answer}"
pe_chat="$(issued "${answer}")"
expect_refusal refused "no actor token, platform-engineer's token" \
  "$(exchange "${pe}" "")" 400 invalid_request "actor_token is required"
expect_refusal refused "chat-assistant, its token for the API server's audience" \
  "$(exchange "${pe}" "$(actor_token agents chat-assistant)")" 400 invalid_request "is invalid for the target audiences [\"chain-sts\"]"
for account in sample-app:default kagent:default; do
  expect_refusal refused "${account}, for audience chain-sts" \
    "$(exchange "${pe}" "$(actor_token "${account%%:*}" "${account#*:}" --audience chain-sts)")" \
    400 unauthorized_client "system:serviceaccount:${account} is not an agent this service knows"
done

# A pod of chat-assistant's account that does nothing, for a token bound to it.
image="$(k --namespace agents get deployment chat-assistant --output jsonpath='{.spec.template.spec.containers[0].image}')"
k apply --filename - >/dev/null <<YAML
apiVersion: v1
kind: Pod
metadata:
  name: ${idle_pod}
  namespace: agents
  labels:
    app.kubernetes.io/name: chain-check
spec:
  serviceAccountName: chat-assistant
  automountServiceAccountToken: false
  restartPolicy: Never
  terminationGracePeriodSeconds: 0
  activeDeadlineSeconds: 300
  securityContext: {runAsNonRoot: true, runAsUser: 10001, seccompProfile: {type: RuntimeDefault}}
  containers:
    - name: idle
      image: ${image}
      command: [sleep, "300"]
      securityContext: {allowPrivilegeEscalation: false, capabilities: {drop: [ALL]}, readOnlyRootFilesystem: true}
      resources: {requests: {cpu: 1m, memory: 8Mi}, limits: {cpu: 50m, memory: 32Mi}}
YAML
if k --namespace agents wait --for=condition=Ready "pod/${idle_pod}" --timeout=60s >/dev/null 2>&1; then
  uid="$(k --namespace agents get pod "${idle_pod}" --output jsonpath='{.metadata.uid}')"
  bound="$(sts_actor chat-assistant --bound-object-kind Pod --bound-object-name "${idle_pod}" --bound-object-uid "${uid}")"
  if [ "$(claims "${bound}" | jq -r '.["kubernetes.io"].pod.uid')" != "${uid}" ]; then
    unexpected "the token for chat-assistant does not name pod ${idle_pod}: $(claims "${bound}" | jq -c '.["kubernetes.io"]')"
  fi
  expect_issued allowed "chat-assistant, a token bound to pod ${idle_pod}" "$(exchange "${pe}" "${bound}")"
  k --namespace agents delete pod "${idle_pod}" --wait=true >/dev/null
  gone="$(date +%s)"
  while :; do
    answer="$(exchange "${pe}" "${bound}")"
    waited=$(($(date +%s) - gone))
    if [ -z "$(issued "${answer}")" ] || [ "${waited}" -ge 30 ]; then break; fi
    sleep 2
  done
  expect_refusal refused "the same token, ${waited} s after the pod was deleted" \
    "${answer}" 400 invalid_request "service account token has been invalidated"
else
  unexpected "pod ${idle_pod} did not start: $(k --namespace agents get pod "${idle_pod}" --no-headers 2>&1)"
fi

# --- order ----------------------------------------------------------------------

answer="$(exchange "${pe_chat}" "$(sts_actor remediation-agent)")"
expect_issued allowed "remediation-agent after chat-assistant" "${answer}"
pe_rem="$(issued "${answer}")"
answer="$(exchange "${pe_chat}" "$(sts_actor comms-agent)")"
expect_issued allowed "comms-agent after chat-assistant" "${answer}"
for agent in comms-agent chat-assistant remediation-agent; do
  expect_refusal refused "${agent} after remediation-agent" \
    "$(exchange "${pe_rem}" "$(sts_actor "${agent}")")" 400 unauthorized_client "${agent} may not act after remediation-agent"
done

# --- subject --------------------------------------------------------------------

expect_issued allowed "chat-assistant, platform-engineer's Chat UI sign-in (aud $(claims "${pe_ui}" | jq -r '.aud'))" \
  "$(exchange "${pe_ui}" "$(sts_actor chat-assistant)")"
for agent in remediation-agent comms-agent; do
  expect_refusal refused "${agent}, the same Chat UI sign-in" \
    "$(exchange "${pe_ui}" "$(sts_actor "${agent}")")" 400 invalid_request "InvalidAudienceError"
done
forged="$(forge "${pe_chat}" "$(header "${pe_chat}" | jq -r '.kid')")"
expect_refusal refused "comms-agent, [chat-assistant] forged with a key chain-sts does not publish" \
  "$(exchange "${forged}" "$(sts_actor comms-agent)")" 400 invalid_request "InvalidSignatureError"

# --- max_chain, on a test instance ----------------------------------------------

image="$(k --namespace chain-sts get deployment chain-sts --output jsonpath='{.spec.template.spec.containers[0].image}')"
k apply --filename - >/dev/null <<YAML
apiVersion: v1
kind: Pod
metadata:
  name: ${instance_pod}
  namespace: chain-sts
  labels:
    app.kubernetes.io/name: chain-sts-check
spec:
  serviceAccountName: default
  restartPolicy: Never
  terminationGracePeriodSeconds: 0
  activeDeadlineSeconds: 300
  securityContext: {runAsNonRoot: true, runAsUser: 10001, runAsGroup: 10001, seccompProfile: {type: RuntimeDefault}}
  volumes:
    - name: release-config
      configMap: {name: chain-sts}
  containers:
    - name: chain-sts
      image: ${image}
      env:
        - {name: HOST, value: 127.0.0.1}
        - {name: CHAIN_STS_CONFIG, value: /tmp/config.yaml}
        - {name: LOG_LEVEL, value: WARNING}
      volumeMounts:
        - {name: release-config, mountPath: /etc/chain-sts-release, readOnly: true}
      # The release's configuration, with a key of its own, an issuer nothing
      # trusts, the cluster's keys for the actor, and the agents in one line,
      # each after the one before, with more agents until the line is one
      # longer than max_chain.
      command:
        - python
        - -c
        - |
          import os, subprocess, yaml
          config = yaml.safe_load(open("/etc/chain-sts-release/config.yaml"))
          with open("/tmp/key.pem", "wb") as key:
              subprocess.run(["python", "-m", "chain_sts.rotate", "new-key"], stdout=key, stderr=subprocess.DEVNULL, check=True)
          config.pop("signing_keys", None)
          config["signing_key_file"] = "/tmp/key.pem"
          config["issuer"] = config["public_url"] = "http://chain-sts-check.invalid"
          config["actor"] = {"verify_with": "jwks", "audiences": config["actor"]["audiences"], "jwks": {
              "issuer": "https://kubernetes.default.svc.cluster.local",
              "jwks_url": "https://kubernetes.default.svc/openid/v1/jwks",
              "token_file": "/var/run/secrets/kubernetes.io/serviceaccount/token",
              "ca_file": "/var/run/secrets/kubernetes.io/serviceaccount/ca.crt"}}
          line = ["chat-assistant", "remediation-agent", "comms-agent"]
          spare = ["system:serviceaccount:agents:default", "system:serviceaccount:sample-app:default", "system:serviceaccount:kagent:default"]
          while len(line) <= config["max_chain"]:
              config["agents"][f"extra-agent-{len(line) - 2}"] = {"service_account": spare.pop(0)}
              line.append(f"extra-agent-{len(line) - 2}")
          for before, agent in zip(line, line[1:]):
              config["agents"][agent]["after"] = [before]
          yaml.safe_dump(config, open("/tmp/config.yaml", "w"))
          print(config["max_chain"], " ".join(config["agents"][agent]["service_account"].split(":", 2)[2] for agent in line), flush=True)
          os.execvp("python", ["python", "-m", "chain_sts"])
      readinessProbe:
        exec: {command: [python, -c, "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8080/healthz', timeout=2)"]}
        periodSeconds: 1
      securityContext: {allowPrivilegeEscalation: false, capabilities: {drop: [ALL]}}
      resources: {requests: {cpu: 20m, memory: 64Mi}, limits: {cpu: 500m, memory: 192Mi}}
YAML
if k --namespace chain-sts wait --for=condition=Ready "pod/${instance_pod}" --timeout=90s >/dev/null 2>&1; then
  set -- $(k --namespace chain-sts logs "${instance_pod}" | head -n 1)
  max_chain="$1"; shift
  line instance "pod ${instance_pod}: the release's policy, max_chain ${max_chain}" "agents in line: $*"
  # The exchanges go to the instance, from inside its own pod.
  probe_namespace=chain-sts probe_workload="pod/${instance_pod}" sts_url=http://127.0.0.1:8080
  held="${pe}"; length=0
  for account in "$@"; do
    answer="$(exchange "${held}" "$(actor_token "${account%%:*}" "${account#*:}" --audience chain-sts)")"
    length=$((length + 1))
    if [ "${length}" -le "${max_chain}" ]; then
      expect_issued allowed "agent ${length} of ${max_chain}, ${account}" "${answer}"
      held="$(issued "${answer}")"
      [ -n "${held}" ] || break
    else
      expect_refusal refused "agent ${length}, ${account}" "${answer}" 400 unauthorized_client "the chain would exceed ${max_chain} agents"
    fi
  done
else
  unexpected "the test instance ${instance_pod} did not start: $(k --namespace chain-sts logs "${instance_pod}" 2>&1 | tail -n 3)"
fi

result "chain-sts refused each actor, order, length and subject its rules forbid, with the error its README names, and issued each allowed twin."
