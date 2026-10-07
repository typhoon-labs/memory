#!/bin/sh
# `task doctor`: does this machine have what the tasks need? Read before the
# first `task up`, and when a task failed in a way that looks like a missing
# or an old tool.
#
#   doctor.sh           what `task up` and the demo's tasks need
#   doctor.sh --dev     also what a component's own tasks need (test,
#                       run-local): node, npm and uv
#   doctor.sh --quiet   print only what is wrong, and nothing when all is
#                       well. This is how `task up:trunk`, `task demo:drive`
#                       and the backup drills call it before they start.
#
# One line per check: GO or NO-GO and what was found. Under the NO-GO lines of
# a group it says what to do about them, once. A NOTE does not block anything.
# The exit status is the number of NO-GO lines.
#
# It changes nothing and installs nothing: `mise trust && mise install`
# installs the pinned tools (mise.toml) and `task setup` fetches the rest. It
# needs only a shell, so it also runs before `task` is there: ./scripts/doctor.sh
#
# A minimum version is checked only where an older one is known not to work;
# the reasons are next to the pins in mise.toml. Whether the cluster and its
# services are ready is another question: `task demo:preflight`.
set -o nounset

repo="$(cd "$(dirname "$0")/.." && pwd)"

dev=0
quiet=0
for arg in "$@"; do
  case "${arg}" in
    --dev) dev=1 ;;
    --quiet) quiet=1 ;;
    *) echo "usage: doctor.sh [--dev] [--quiet]" >&2; exit 2 ;;
  esac
done
# What is left to print in quiet mode is what stopped a task.
[ "${quiet}" = 0 ] || exec 1>&2

checks=0
failed=0
go() { checks=$((checks + 1)); [ "${quiet}" = 1 ] || printf '  GO     %-18s %s\n' "$1" "$2"; }
no_go() { checks=$((checks + 1)); failed=$((failed + 1)); printf '  NO-GO  %-18s %s\n' "$1" "$2"; }
# fix_since <number of NO-GO lines before the group> <what to do>...
fix_since() {
  [ "${failed}" -gt "$1" ] || return 0
  shift
  for fix in "$@"; do printf '         %-18s -> %s\n' "" "${fix}"; done
}
note() {
  [ "${quiet}" = 0 ] || return 0
  printf '  NOTE   %-18s %s\n' "$1" "$2"
  shift 2
  for more in "$@"; do printf '         %-18s    %s\n' "" "${more}"; done
}

# The first x.y or x.y.z in what a tool says its version is. Empty if it says none.
version_of() {
  case "$1" in
    kubectl) kubectl version --client 2>/dev/null ;;
    helm) helm version --short 2>/dev/null ;;
    kind) kind version 2>/dev/null ;;
    openssl) openssl version 2>/dev/null ;;
    base64) ;;
    *) "$1" --version 2>/dev/null ;;
  esac | sed -n 's/^[^0-9]*\([0-9][0-9]*\.[0-9][0-9]*\(\.[0-9][0-9]*\)\{0,1\}\).*/\1/p' | head -n 1
}

# at_least <version> <major.minor>
at_least() {
  have_major="${1%%.*}"; have_rest="${1#*.}"; have_minor="${have_rest%%.*}"
  [ "${have_major}" -gt "${2%%.*}" ] || { [ "${have_major}" -eq "${2%%.*}" ] && [ "${have_minor}" -ge "${2#*.}" ]; }
}

# need <tool> [<minimum as major.minor>]
# A tool whose version cannot be read passes: only a version known to be too old stops a task.
need() {
  tool="$1"; minimum="${2:-}"
  if ! path="$(command -v "${tool}" 2>/dev/null)"; then
    no_go "${tool}" "not on the PATH${minimum:+; ${minimum} or later is needed}"
    return 0
  fi
  found=""
  # In quiet mode a version is read only where it decides something.
  if [ -n "${minimum}" ] || [ "${quiet}" = 0 ]; then found="$(version_of "${tool}")"; fi
  if [ -n "${minimum}" ] && [ -n "${found}" ] && ! at_least "${found}" "${minimum}"; then
    no_go "${tool}" "${found} at ${path}; ${minimum} or later is needed"
    return 0
  fi
  go "${tool}" "$(printf '%-8s %s' "${found}" "${path}")"
}

[ "${quiet}" = 1 ] || { echo "What this machine has for the tasks, $(date '+%H:%M:%S'). Every line must say GO."; echo; }

# --- pinned in mise.toml -------------------------------------------------------
before="${failed}"
need task
need kubectl 1.37
need helm 3.12
need kind 0.32
need helmfile
need jq
need python3 3.10
# For a component's own tasks.
if [ "${dev}" = 1 ]; then
  need node 22.13
  need npm
  need uv
fi
if command -v mise >/dev/null 2>&1; then
  fix_since "${before}" "mise.toml pins them: mise trust && mise install   (in ${repo})" \
    "then use a shell with mise active, or: mise exec -- task <name>"
else
  fix_since "${before}" "mise.toml pins them. Install mise (https://mise.jdx.dev), then in ${repo}: mise trust && mise install" \
    "then use a shell with mise active, or: mise exec -- task <name>"
fi

# --- from the system -----------------------------------------------------------
before="${failed}"
need curl
need openssl
need base64
fix_since "${before}" "install it with this machine's package manager"
before="${failed}"
need docker
fix_since "${before}" "install Docker Desktop and start it"
docker_bytes=""
if command -v docker >/dev/null 2>&1; then
  before="${failed}"
  if docker_bytes="$(docker info --format '{{.MemTotal}}' 2>/dev/null)"; then
    case "${docker_bytes}" in '' | *[!0-9]*) docker_bytes=0 ;; esac
    go "Docker running" "$((docker_bytes / 1073741824)) GiB of memory"
  else
    docker_bytes=""
    no_go "Docker running" "the Docker daemon does not answer"
  fi
  fix_since "${before}" "start Docker, then run this again"
fi

# --- notes: nothing to fix, something to know ------------------------------------
if [ "${quiet}" = 0 ]; then
  echo
  if [ -n "${docker_bytes}" ] && [ "${docker_bytes}" -lt 15000000000 ]; then
    note "Docker memory" "Docker has $((docker_bytes / 1073741824)) GiB. The demo holds about 12 GiB when it is up and more while it installs:" \
      "give Docker 16 GiB or more."
  fi
  absent=""
  for tool in kubectl-ate arctl; do
    [ -x "${repo}/.tools/bin/${tool}" ] || absent="${absent}${absent:+, }${tool}"
  done
  if [ -z "${absent}" ]; then
    note "Downloaded tools" "kubectl-ate and arctl are in .tools/bin"
  else
    note "Downloaded tools" "not in .tools/bin yet: ${absent}" \
      "\`task up\` downloads them when it needs them. To have them now: task setup"
  fi
  if [ "${dev}" = 1 ]; then
    absent=""
    for packages in chat-assistant/node_modules sample-app/web/ui/node_modules delivery-mcp/.venv remediation-agent/.venv comms-agent/.venv; do
      [ -d "${repo}/components/${packages}" ] || absent="${absent}${absent:+, }${packages%%/*}"
    done
    if [ -z "${absent}" ]; then
      note "Component packages" "installed for chat-assistant, sample-app, delivery-mcp, remediation-agent and comms-agent"
    else
      note "Component packages" "not installed yet: ${absent}" \
        "A component's tasks install them when they need them. To have them now: task setup -- --dev"
    fi
  fi
  echo
fi

again="task doctor"
[ "${dev}" = 0 ] || again="task doctor -- --dev"
if [ "${failed}" -eq 0 ]; then
  [ "${quiet}" = 1 ] || echo "Result: GO. ${checks} of ${checks} checks passed."
elif [ "${quiet}" = 1 ]; then
  echo "This machine is not ready for the task. Nothing was started. The whole list: ${again}"
else
  echo "Result: NO-GO. ${failed} of ${checks} checks failed; under them it says what to do. Then run this again."
fi
exit "${failed}"
