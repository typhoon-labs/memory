#!/bin/sh
# Prints the digest of one tag in the local registry, such as
# sha256:0123...: what a reference pinned by digest needs. Read-only.
#
#   digest.sh <repository>:<tag>        digest.sh diagnosis-agent-skills:0.1.0
#
# The digest is the registry's own (header Docker-Content-Digest), for the
# manifest or index the tag points at, asked for with every manifest type a
# push from Docker can produce, so that the registry does not convert it.
# Fails, saying what to do, when the registry does not answer or does not have
# the tag: a helmfile template that calls this stops there.
set -o errexit
set -o nounset

registry="${REGISTRY_URL:-http://localhost:5002}"
ref="${1:?usage: digest.sh <repository>:<tag>}"
repository="${ref%:*}"
tag="${ref##*:}"
if [ "${repository}" = "${ref}" ] || [ -z "${tag}" ]; then
  echo "usage: digest.sh <repository>:<tag>, not ${ref}" >&2
  exit 2
fi

accept='application/vnd.oci.image.index.v1+json, application/vnd.oci.image.manifest.v1+json, application/vnd.docker.distribution.manifest.list.v2+json, application/vnd.docker.distribution.manifest.v2+json'
headers="$(curl --silent --show-error --head --max-time 10 --header "Accept: ${accept}" \
  --write-out 'status: %{http_code}\n' "${registry}/v2/${repository}/manifests/${tag}" 2>&1)" || {
  echo "The registry at ${registry} does not answer ($(printf '%s\n' "${headers}" | head -1)). Run \`task up:trunk\`." >&2
  exit 1
}
status="$(printf '%s\n' "${headers}" | sed -n 's/^status: //p')"
if [ "${status}" != "200" ]; then
  echo "The registry at ${registry} has no ${repository}:${tag} (HTTP ${status}). Run \`task publish\`." >&2
  exit 1
fi
digest="$(printf '%s\n' "${headers}" | tr -d '\r' | sed -n 's/^[Dd]ocker-[Cc]ontent-[Dd]igest: *//p')"
case "${digest}" in
  sha256:????????????????????????????????????????????????????????????????) printf '%s\n' "${digest}" ;;
  *) echo "The registry at ${registry} gave no sha256 digest for ${repository}:${tag} (\"${digest}\")." >&2; exit 1 ;;
esac
