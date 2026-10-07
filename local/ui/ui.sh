#!/bin/sh
# `task ui`: the web UIs of the dev cluster, and a way in to the ones that have
# no host port.
#
#   ui.sh                          list every UI: its address, and whether it answers
#   ui.sh prometheus               forward one to this machine until Ctrl-C
#   ui.sh prometheus alertmanager  several at once
#   ui.sh all                      every one in the table below
#
# Seven UIs run in the cluster without a host port: the kind cluster maps ten
# (docs/cluster.md), fixed when it is created, and nine are taken. They are
# reached with `kubectl port-forward` instead, each on a host port of its own,
# for as long as this script runs. Nothing in the cluster changes.
#
# A forward is also the right door for them. None has a login worth the name,
# so a NodePort would hand each to every pod in the cluster. Agentgateway's
# admin UI could not get one anyway: the proxy binds its admin port to the
# pod's own localhost, and a forward is the only thing that reaches it.
set -o nounset

here="$(cd "$(dirname "$0")" && pwd)"
repo="$(cd "${here}/../.." && pwd)"
# The kubeconfig, the context and `k` come from scripts/lib/cluster.sh.
. "${repo}/scripts/lib/cluster.sh"

# name | namespace | what to forward to | its port | host port | path | what it shows
#
# The host ports are 18090 to 18096, next to the cluster's 18080 to 18089
# (docs/cluster.md), bound to 127.0.0.1 and held only while a forward runs.
forwarded='
agentgateway|agentgateway-system|deployment/agentgateway-proxy|15000|18090|/ui|Agentgateway admin: the listeners, routes, backends and policies the proxy holds
prometheus|telemetry|service/kube-prometheus-stack-prometheus|9090|18091|/|Prometheus: targets, rules and queries
alertmanager|telemetry|service/kube-prometheus-stack-alertmanager|9093|18092|/|Alertmanager: alerts and silences
rustfs|ate-system|service/rustfs|9001|18093|/rustfs/console/|RustFS console: Agent Substrate snapshots
seaweedfs|langfuse|service/langfuse-s3-all-in-one|9333|18094|/|SeaweedFS master: the object store of Langfuse
seaweedfs-filer|langfuse|service/langfuse-s3-all-in-one|8888|18095|/|SeaweedFS filer: the files Langfuse stored
clickhouse|langfuse|service/langfuse-clickhouse|8123|18096|/play|ClickHouse query page: the traces of Langfuse
'

# name | address | what is asked to see that it answers | login
#
# The UIs that do have a host port, listed so that `task ui` shows them all.
published='
Chat UI|http://localhost:18083|http://localhost:18083/|developer, incident-manager or platform-engineer, password demo
Sample App|http://localhost:18082|http://localhost:18082/|none
Grafana|http://localhost:18084|http://localhost:18084/api/health|task observability:login
Langfuse|http://localhost:18085|http://localhost:18085/api/public/health|task langfuse:login
Agentregistry|http://localhost:18086|http://localhost:18086/|none
kagent|http://localhost:18087|http://localhost:18087/ping|platform-engineer, password demo
Keycloak admin|http://localhost:18081/admin/|http://localhost:18081/realms/master|admin, password in Secret keycloak/keycloak-admin
'

names() { printf '%s\n' "${forwarded}" | awk -F '|' 'NF == 7 { printf "%s%s", sep, $1; sep = ", " }'; }
row() { printf '%s\n' "${forwarded}" | awk -F '|' -v name="$1" 'NF == 7 && $1 == name'; }
# The status after any redirect: Prometheus answers / with one.
status_of() { curl --silent --location --output /dev/null --max-time 3 --write-out '%{http_code}' "$1" 2>/dev/null; }

# What to sign in with, read from the cluster when it is asked for. The three
# with a login print it; these are the charts' own demo values.
login() {
  case "$1" in
    rustfs)
      printf 'access key %s, secret key %s' \
        "$(k -n ate-system get deployment rustfs --output 'jsonpath={.spec.template.spec.containers[0].env[?(@.name=="RUSTFS_ACCESS_KEY")].value}' 2>/dev/null)" \
        "$(k -n ate-system get deployment rustfs --output 'jsonpath={.spec.template.spec.containers[0].env[?(@.name=="RUSTFS_SECRET_KEY")].value}' 2>/dev/null)" ;;
    clickhouse)
      printf 'user langfuse, password %s' \
        "$(k -n langfuse get secret langfuse-clickhouse --output 'jsonpath={.data.password}' 2>/dev/null | base64 -d)" ;;
    *) printf 'none' ;;
  esac
}

list() {
  echo "== On a host port"
  printf '%s\n' "${published}" | while IFS='|' read -r name address probe how; do
    [ -n "${name}" ] || continue
    printf '  %-16s %-40s HTTP %s   login: %s\n' "${name}" "${address}" "$(status_of "${probe}")" "${how}"
  done
  echo "== Forwarded while \`task ui -- <name>\` runs (or \`task ui -- all\`)"
  printf '%s\n' "${forwarded}" | while IFS='|' read -r name _ _ _ port path what; do
    [ -n "${name}" ] || continue
    if [ "$(status_of "http://localhost:${port}${path}")" = "200" ]; then state="forwarded now"; else state="not forwarded"; fi
    printf '  %-16s %-40s %-14s %s\n' "${name}" "http://localhost:${port}${path}" "${state}" "${what}"
  done
}

if [ "$#" -eq 0 ]; then
  list
  exit 0
fi

if [ ! -f "${kubeconfig}" ]; then
  echo "ui: ${kubeconfig} does not exist. Run \`task up\` first." >&2
  exit 1
fi

if [ "$1" = "all" ]; then
  set -- $(printf '%s\n' "${forwarded}" | awk -F '|' 'NF == 7 { print $1 }')
fi
for name in "$@"; do
  if [ -z "$(row "${name}")" ]; then
    echo "ui: unknown UI '${name}'. One or more of: $(names), or all" >&2
    exit 2
  fi
done

logs="$(mktemp -d)"
pids=""
# A background job of a script ignores Ctrl-C, so the forwards are ended here.
cleanup() {
  trap - INT TERM EXIT
  # shellcheck disable=SC2086
  [ -z "${pids}" ] || kill ${pids} 2>/dev/null
  rm -rf "${logs}"
  exit "${1:-0}"
}
trap 'cleanup 0' INT TERM
trap 'cleanup $?' EXIT

for name in "$@"; do
  IFS='|' read -r _ namespace target remote port path _ <<EOF
$(row "${name}")
EOF
  url="http://localhost:${port}${path}"
  if [ "$(status_of "${url}")" != "000" ]; then
    printf '  %-16s %-42s already answers; another forward holds port %s\n' "${name}" "${url}" "${port}"
    continue
  fi
  # kubectl itself and not `k`: a function in the background runs in a
  # subshell, and ending that would leave its kubectl holding the port.
  kubectl --kubeconfig "${kubeconfig}" --context "${context}" -n "${namespace}" \
    port-forward --address 127.0.0.1 "${target}" "${port}:${remote}" >"${logs}/${name}.log" 2>&1 &
  pid=$!
  # Up to 15 seconds: kubectl needs a moment, and a forward that failed has exited by then.
  tries=0
  while [ "${tries}" -lt 15 ] && kill -0 "${pid}" 2>/dev/null && [ "$(status_of "${url}")" != "200" ]; do
    tries=$((tries + 1))
    sleep 1
  done
  if kill -0 "${pid}" 2>/dev/null && [ "$(status_of "${url}")" = "200" ]; then
    pids="${pids} ${pid}"
    printf '  %-16s %-42s login: %s\n' "${name}" "${url}" "$(login "${name}")"
  else
    kill "${pid}" 2>/dev/null
    printf '  %-16s not forwarded: %s\n' "${name}" "$(tail -n 1 "${logs}/${name}.log" 2>/dev/null | cut -c 1-160)"
  fi
done

if [ -z "${pids}" ]; then
  echo "ui: nothing to forward." >&2
  cleanup 1
fi
echo "Forwarding until Ctrl-C."
# Until the first forward ends (its pod was replaced) or Ctrl-C.
# shellcheck disable=SC2086
wait ${pids}
