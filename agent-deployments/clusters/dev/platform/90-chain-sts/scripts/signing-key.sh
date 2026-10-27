#!/bin/sh
# chain-sts's signing keys in the dev cluster, and their rotation.
#
#   signing-key.sh            the first key, if there is none (the release's
#                             presync hook, and `task sts:signing-key`)
#   signing-key.sh values     the chart's signingKey values, read from the
#                             Secrets (keys.yaml.gotmpl, at every render)
#   signing-key.sh new [NAME] rotation step 1: a new key's Secret, as `next`
#   signing-key.sh check      each key's role, each pod's /healthz, the
#                             gateway's copy, and whether the next step may run;
#                             exit 0 only if it may run now
#   signing-key.sh promote    rotation step 3: `next` signs, `sign` is `previous`
#   signing-key.sh drop       rotation step 5: `previous` is retired
#   signing-key.sh cleanup    after the drop's rollout: delete retired keys
#
# The Taskfile runs these in order with `task sts:install` between them:
# `task sts:rotate:new`, `sts:rotate:check`, `sts:rotate:promote`,
# `sts:rotate:drop`. Demo only.
#
# WHERE THE ROTATION STATE LIVES: on the keys' own Secrets in namespace
# chain-sts. Each key is one Secret (data key `key.pem`), labeled
# app.kubernetes.io/name=chain-sts, app.kubernetes.io/component=signing-key and
# `signing-key-role`: sign, next, previous, or retired (published no more,
# deleted by `cleanup`). Keys made by `new` carry their kid in the annotation
# `signing-key-kid`. No tracked file names a key: `values` turns the labels
# into the chart's signingKey.secretName, .next and .previous each time the
# release is rendered, by `task sts:install`, `task deploy` or `task up`, so
#   - a fresh cluster gets one key, `chain-sts-signing-key`, labeled sign;
#   - a re-run after a rotation renders the roles the labels say, never a
#     Secret that was deleted (its role went with it) and never a key swapped
#     without the overlap: only promote and drop change a role, and each first
#     checks the running pods and the waits below;
#   - Git and the cluster cannot disagree, because Git holds no key name.
# A Secret with no role and no other key, as this script made before roles,
# is the signing key. Two keys with one role, keys without a role beside
# others, or no key while chain-sts runs, stop `values` and with it the sync.
#
# THE WAITS (components/chain-sts/README.md, "Rotating the key"; the same as
# `python -m chain_sts.rotate steps` prints), counted from the end of the
# Deployment's last rollout, which is when every serving pod had the roles:
#   promote   360 s: the gateway's controller fetches /jwks every 300 s
#             (cacheDuration) and never on an unknown kid, plus 60 s; and the
#             gateway's jwks-store ConfigMap must hold the next kid
#   drop      token_ttl_seconds (policy.yaml) + 60 s of the gateway's leeway
#             + 60 s: 420 s for 300
# A later rollout only moves the start later. There is no way around them
# here: a key that leaked is replaced by hand (the README says how).
#
# A key goes from its generator to the cluster through a shell variable and a
# pipe, never a file. The first key comes from openssl, so that `task up`
# needs nothing but the tools `task doctor` checks; `new` uses
# `python -m chain_sts.rotate new-key` from the component's .venv
# (`task chain-sts:sync`), which also gives the kid.
set -o errexit
set -o nounset

here="$(cd "$(dirname "$0")" && pwd)"
repo="$(cd "${here}/../../../../../.." && pwd)"
# The kubeconfig, the context and `k` come from scripts/lib/cluster.sh.
. "${repo}/scripts/lib/cluster.sh"

namespace="chain-sts"
release="chain-sts"
first="chain-sts-signing-key"
selector="app.kubernetes.io/name=chain-sts,app.kubernetes.io/component=signing-key"
pod_selector="app.kubernetes.io/name=${release},app.kubernetes.io/instance=${release}"
jwks_url="http://${release}.${namespace}.svc.cluster.local/jwks"
component="${repo}/components/chain-sts"

publish_wait=360
ttl="$(awk '$1 == "token_ttl_seconds:" { print $2 }' "${here}/../policy.yaml")"
case "${ttl}" in ''|*[!0-9]*) echo "signing-key: no token_ttl_seconds in policy.yaml" >&2; exit 1 ;; esac
retire_wait=$((ttl + 60 + 60))

say() { echo "signing-key: $*"; }
fail() { echo "signing-key: $*" >&2; exit 1; }

command -v jq >/dev/null || fail "jq is required"

# The names with one role, one per line.
with_role() { printf '%s\n' "${keys}" | jq -r --arg r "$1" 'select(.role == $r) | .name'; }
count() { printf '%s' "$1" | grep -c . || true; }

# Whether chain-sts runs. An API server that does not answer stops the script.
deployment_exists() {
  found="$(k -n "${namespace}" get deployment "${release}" --ignore-not-found -o name)" ||
    fail "cannot read deployment/${release}; nothing was changed"
  [ -n "${found}" ]
}

# Reads the Secrets into: keys, sign, next, previous, retired. Fails on a
# state no step leaves behind.
read_keys() {
  # Not in a pipeline, so that an API server that does not answer stops the
  # script here instead of reading as "no keys".
  raw="$(k -n "${namespace}" get secret -l "${selector}" -o json)" ||
    fail "cannot list the key Secrets in ${namespace}; nothing was changed"
  keys="$(printf '%s' "${raw}" |
    jq -c '.items[] | {name: .metadata.name, role: (.metadata.labels["signing-key-role"] // ""), kid: (.metadata.annotations["signing-key-kid"] // "")}')"
  sign="$(with_role sign)"
  next="$(with_role next)"
  previous="$(with_role previous)"
  retired="$(with_role retired)"
  unlabeled="$(with_role "")"
  total="$(count "${keys}")"
  if [ -n "${unlabeled}" ]; then
    if [ "${total}" -eq 1 ]; then
      sign="${unlabeled}"   # the one key, from before roles
    else
      fail "Secrets without signing-key-role beside other keys: ${unlabeled}. Label each (sign, next, previous or retired)."
    fi
  fi
  for role in sign next previous; do
    eval "names=\${${role}}"
    if [ "$(count "${names}")" -gt 1 ]; then
      fail "more than one Secret has signing-key-role=${role}: $(echo ${names})"
    fi
  done
  # A next and a previous key together only without a signing key: a promote
  # that stopped between its two labels, which promote finishes.
  if [ -n "${sign}" ] && [ -n "${next}" ] && [ -n "${previous}" ]; then
    fail "a next key (${next}) and a previous key (${previous}) at once; no step leaves that"
  fi
}

# --- the first key, and the values -----------------------------------------

# A new PEM, checked, into the variable pem.
check_pem() {
  case "${pem}" in
    "-----BEGIN PRIVATE KEY-----"*) ;;
    *) fail "the key generator gave no PKCS #8 PEM; nothing was created" ;;
  esac
}

# Creates Secret $1 from ${pem} with role $2 and kid $3 (may be empty), labels
# and all in one request. `create` and not `apply`: a Secret of that name
# that exists is never replaced.
create_secret() {
  [ -n "$1" ] || fail "no name for the new Secret; nothing was created"
  printf '%s\n' "${pem}" |
    k -n "${namespace}" create secret generic "$1" --from-file=key.pem=/dev/stdin --dry-run=client -o json |
    jq -c --arg role "$2" --arg kid "$3" '
      .metadata.labels = {"app.kubernetes.io/name": "chain-sts", "app.kubernetes.io/component": "signing-key", "signing-key-role": $role}
      | if $kid != "" then .metadata.annotations = {"signing-key-kid": $kid} else . end' |
    k -n "${namespace}" create -f - >/dev/null
  pem=""
}

ensure() {
  command -v openssl >/dev/null || fail "openssl is required"
  # Whoever comes first creates the namespace; helm would too, after this hook.
  k get namespace "${namespace}" >/dev/null 2>&1 || k create namespace "${namespace}" >/dev/null
  read_keys
  if [ "${total}" -eq 0 ]; then
    if deployment_exists; then
      fail "chain-sts runs but no key Secret exists in ${namespace}: a new key now would sign tokens no verifier knows. See components/chain-sts/README.md, \"A key that leaked\"."
    fi
    pem="$(openssl genpkey -algorithm RSA -pkeyopt rsa_keygen_bits:2048 2>/dev/null)"
    check_pem
    create_secret "${first}" sign ""
    say "${namespace}/${first} created, signing-key-role=sign"
    return
  fi
  if [ -n "${unlabeled}" ]; then
    k -n "${namespace}" label secret "${sign}" signing-key-role=sign >/dev/null
    say "${namespace}/${sign} labeled signing-key-role=sign"
  fi
  say "kept: $(printf '%s\n' "${keys}" | jq -r '"\(.name) (\(if .role == "" then "sign" else .role end))"' | paste -sd ' ' -)"
}

values() {
  read_keys
  if [ "${total}" -eq 0 ]; then
    deployment_exists && fail "chain-sts runs but no key Secret exists in ${namespace}; nothing was rendered"
    sign="${first}"   # the presync hook creates it
  fi
  [ -n "${sign}" ] || fail "no Secret has signing-key-role=sign (${namespace}). If \`task sts:rotate:promote\` stopped halfway, run it again."
  printf 'signingKey:\n  secretName: %s\n  next: "%s"\n  previous: "%s"\n' "${sign}" "${next}" "${previous}"
}

# --- what runs ---------------------------------------------------------------

# Reads the Deployment into: rollout_done (yes/no), rollout_age (seconds since
# its last rollout finished), rollout_at.
read_rollout() {
  raw="$(k -n "${namespace}" get deployment "${release}" -o json)" || fail "cannot read deployment/${release}"
  rollout="$(printf '%s' "${raw}" | jq -r '
    (.status.conditions // [] | map(select(.type == "Progressing" and .reason == "NewReplicaSetAvailable")) | first) as $p
    | [ (if (.status.observedGeneration == .metadata.generation
             and .status.updatedReplicas == .spec.replicas
             and .status.availableReplicas == .spec.replicas
             and .status.replicas == .spec.replicas
             and $p != null) then "yes" else "no" end),
        (if $p != null then (now - ($p.lastUpdateTime | fromdateiso8601) | floor) else -1 end),
        ($p.lastUpdateTime // "-") ] | @tsv')"
  rollout_done="$(printf '%s' "${rollout}" | cut -f1)"
  rollout_age="$(printf '%s' "${rollout}" | cut -f2)"
  rollout_at="$(printf '%s' "${rollout}" | cut -f3)"
}

# Every running pod's /healthz keys, one line each: "<pod> <keys JSON>".
# Read inside the pod, so the service's NetworkPolicy is not involved.
read_pods() {
  raw="$(k -n "${namespace}" get pod -l "${pod_selector}" -o json)" || fail "cannot list the pods"
  pods=""
  for pod in $(printf '%s' "${raw}" |
      jq -r '.items[] | select(.metadata.deletionTimestamp == null and .status.phase == "Running") | .metadata.name'); do
    health="$(k -n "${namespace}" exec "${pod}" -c "${release}" -- python -c \
      'import urllib.request; print(urllib.request.urlopen("http://127.0.0.1:8080/healthz", timeout=5).read().decode())' 2>/dev/null)" ||
      fail "no /healthz from ${pod}"
    pods="${pods}${pod} $(printf '%s' "${health}" | jq -c '.keys')
"
  done
  pods="${pods%
}"
  [ -n "${pods}" ] || fail "no running chain-sts pod"
  # The keys every pod reports, if they all report the same; else empty.
  if [ "$(printf '%s\n' "${pods}" | cut -d' ' -f2 | sort -u | grep -c .)" -eq 1 ]; then
    served="$(printf '%s\n' "${pods}" | head -n 1 | cut -d' ' -f2)"
  else
    served=""
  fi
}

served_kid() { printf '%s' "${served}" | jq -r --arg r "$1" '.[$r] // ""'; }

# The kids in the gateway's copy of chain-sts's /jwks, space-separated, and when
# its controller fetched them.
read_gateway() {
  raw="$(k -n agentgateway-system get configmap -l app.kubernetes.io/component=jwks-store -o json)" ||
    fail "cannot read the gateway's jwks-store ConfigMaps"
  gateway="$(printf '%s' "${raw}" |
    jq -r --arg url "${jwks_url}" '
      [.items[].data["jwks-store"] | fromjson | select(.url == $url)] | first
      | if . == null then "-\t" else "\(.fetchedAt)\t\(.jwks | fromjson | [.keys[].kid] | join(" "))" end')"
  gateway_at="$(printf '%s' "${gateway}" | cut -f1)"
  gateway_kids="$(printf '%s' "${gateway}" | cut -f2)"
}

# Whether the pods serve the roles the labels give: the same set of roles, and
# the kid each key made by `new` was created with. Shell variables are global:
# these names are its own.
roles_match() {
  want="$( { [ -n "${sign}" ] && echo signing; [ -n "${next}" ] && echo next; [ -n "${previous}" ] && echo previous; } | sort | paste -sd ' ' -)"
  have="$(printf '%s' "${served}" | jq -r 'keys | join(" ")')"
  [ "${want}" = "${have}" ] || return 1
  for pair in "sign signing" "next next" "previous previous"; do
    set -- ${pair}
    eval "role_secret=\${$1}"
    [ -n "${role_secret}" ] || continue
    role_kid="$(printf '%s\n' "${keys}" | jq -r --arg n "${role_secret}" 'select(.name == $n) | .kid')"
    [ -z "${role_kid}" ] || [ "${role_kid}" = "$(served_kid "$2")" ] || return 1
  done
}

# Prints the state and sets: step (new, promote, drop, cleanup or install),
# ready (yes/no) and why.
assess() {
  read_keys
  read_rollout
  read_pods
  read_gateway
  echo "Keys (Secrets in ${namespace}, by signing-key-role):"
  printf '%s\n' "${keys}" | jq -r '"  \(if .role == "" then "sign" else .role end)\t\(.name)\t\(if .kid == "" then "" else "kid \(.kid)" end)"'
  echo "Pods (/healthz keys):"
  printf '%s\n' "${pods}" | sed 's/^/  /'
  echo "Rollout: $( [ "${rollout_done}" = yes ] && echo "done at ${rollout_at}, ${rollout_age} s ago" || echo "in progress")"
  echo "Gateway's copy (jwks-store, fetched ${gateway_at}): ${gateway_kids:-none}"

  ready=no
  if [ "${rollout_done}" != yes ]; then
    step=install; why="the rollout is not done: wait for it, or run task sts:install"; return
  fi
  if [ -z "${served}" ]; then
    step=install; why="the pods do not all serve the same keys: wait for the rollout, or run task sts:install"; return
  fi
  if [ -z "${sign}" ] && [ -n "${previous}" ] && [ -n "${next}" ]; then
    step=promote   # a promote that stopped between its two labels
  elif ! roles_match; then
    step=install; why="the pods do not serve the roles the labels say: run task sts:install"; return
  elif [ -n "${retired}" ]; then
    step=cleanup; ready=yes; why="delete the retired key's Secret: $(echo ${retired})"; return
  elif [ -n "${next}" ]; then
    step=promote
  elif [ -n "${previous}" ]; then
    step=drop
  else
    step=new; ready=yes; why="one key signs; a rotation may start"; return
  fi

  if [ "${step}" = promote ]; then
    want_kid="$(served_kid next)"
    left=$((publish_wait - rollout_age))
    case " ${gateway_kids} " in *" ${want_kid} "*) in_gateway=yes ;; *) in_gateway=no ;; esac
    if [ "${left}" -gt 0 ]; then
      why="the next key ${want_kid} has been published ${rollout_age} s; promote in ${left} s (${publish_wait} s after the rollout)"
    elif [ "${in_gateway}" != yes ]; then
      why="the gateway's copy does not hold the next kid ${want_kid} yet; wait for its next fetch"
    else
      ready=yes; why="every pod publishes ${want_kid}, for ${rollout_age} s, and the gateway has it"
    fi
  else
    left=$((retire_wait - rollout_age))
    if [ "${left}" -gt 0 ]; then
      why="the previous key's last tokens may still be in use; drop in ${left} s (${retire_wait} s after the rollout)"
    else
      ready=yes; why="every pod has signed with $(served_kid signing) for ${rollout_age} s"
    fi
  fi
}

check() {
  assess
  case "${step}" in
    install) task_name="sts:install" ;;
    cleanup) task_name="sts:rotate:drop" ;;   # its last part deletes it
    *) task_name="sts:rotate:${step}" ;;
  esac
  echo "Next: task ${task_name} -- $( [ "${ready}" = yes ] && echo "may run now" || echo "not yet")"
  echo "      ${why}"
  [ "${ready}" = yes ]
}

gate() {
  assess >/dev/null
  [ "${step}" = "$1" ] || fail "the next step is ${step}, not $1: ${why}"
  [ "${ready}" = yes ] || fail "not yet: ${why}"
}

new() {
  new_name="${1:-${first}-$(date -u +%Y%m%d%H%M)}"
  printf '%s' "${new_name}" | grep -Eq '^[a-z0-9]([-a-z0-9]*[a-z0-9])?$' || fail "\"${new_name}\" is not a Secret name"
  gate new
  py="${component}/.venv/bin/python"
  [ -x "${py}" ] || fail "no ${py}: run task chain-sts:sync"
  pem="$(PYTHONPATH="${component}/src" "${py}" -m chain_sts.rotate new-key 2>/dev/null)"
  check_pem
  kid="$(printf '%s\n' "${pem}" | PYTHONPATH="${component}/src" "${py}" -m chain_sts.rotate kid /dev/stdin | cut -d' ' -f1)"
  [ -n "${kid}" ] || fail "no kid for the new key; nothing was created"
  create_secret "${new_name}" next "${kid}"
  say "${namespace}/${new_name} created, signing-key-role=next"
  echo "kid ${kid}"
}

promote() {
  gate promote
  if [ -n "${sign}" ]; then
    k -n "${namespace}" label secret "${sign}" signing-key-role=previous --overwrite >/dev/null
    previous="${sign}"
  fi
  k -n "${namespace}" label secret "${next}" signing-key-role=sign --overwrite >/dev/null
  say "${next} signs, ${previous} is previous"
}

drop() {
  assess >/dev/null
  if [ "${step}" = cleanup ]; then
    say "already retired: $(echo ${retired})"
    return
  fi
  [ "${step}" = drop ] || fail "the next step is ${step}, not drop: ${why}"
  [ "${ready}" = yes ] || fail "not yet: ${why}"
  k -n "${namespace}" label secret "${previous}" signing-key-role=retired --overwrite >/dev/null
  say "${previous} is retired: no longer published after the sync"
}

cleanup() {
  assess >/dev/null
  [ -n "${retired}" ] || { say "no retired key"; return; }
  [ "${step}" = cleanup ] || fail "not deleting ${retired}: ${why}"
  for retired_name in ${retired}; do
    k -n "${namespace}" delete secret "${retired_name}" >/dev/null
    say "${namespace}/${retired_name} deleted"
  done
}

case "${1:-ensure}" in
  ensure) ensure ;;
  values) values ;;
  new) shift; new "${1:-}" ;;
  check) check ;;
  promote) promote ;;
  drop) drop ;;
  cleanup) cleanup ;;
  *) echo "usage: signing-key.sh [ensure | values | new [NAME] | check | promote | drop | cleanup]" >&2; exit 2 ;;
esac
