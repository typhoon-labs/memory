#!/bin/sh
# Downloads the command line tools that the kagent install needs into
# .tools/bin at the repository root (git-ignored), never into the system.
#
#   tools.sh              kubectl-ate, the Agent Substrate plugin (required:
#                         it creates the identity material no chart creates)
#   tools.sh --with-cli   also the kagent CLI (optional; nothing here needs it)
#
# Versions must match the charts in ../helmfile.yaml: Substrate's is the one in
# kagent's go.mod at that tag. Each download is checked
# against the SHA-256 digest that the GitHub release publishes for that asset.
# Safe to re-run: a file that already has the right digest is kept.
set -o errexit
set -o nounset

here="$(cd "$(dirname "$0")" && pwd)"
bin="$(cd "${here}/../../../../../.." && pwd)/.tools/bin"

substrate_version="v1.0.0-rc1"
kagent_version="v1.0.0-rc1"

os="$(uname -s | tr '[:upper:]' '[:lower:]')"
arch="$(uname -m | sed 's/x86_64/amd64/; s/aarch64/arm64/')"

# Digest of release asset <tool>-<os>-<arch>, from the release's asset list.
digest_for() {
  case "$1" in
    kubectl-ate-linux-amd64)  echo d254c761d960f13cc3200b7e75a3a5eae9dc01fdfd73eac6a168a69b2d67e180 ;;
    kubectl-ate-linux-arm64)  echo 3cdf70971829002bca8e92edd7c83d090b6c476ea7eb085a2dfe8f5a6bffc1ea ;;
    kubectl-ate-darwin-amd64) echo 423011ab8509000c48628e9c5b4618406c4d1165a09270951a568ce2caa590a0 ;;
    kubectl-ate-darwin-arm64) echo 4e902b0390a9b60b13a35200900e22e831aaf39f2a3e3f3352775e2c445b686c ;;
    kagent-linux-amd64)       echo cf7b98936e6aca37c0c85c8103603e1a86ee24634a3d78dd73c902df73ea335e ;;
    kagent-linux-arm64)       echo 38025b797a7d29a2b3e34eea493c68dec9831659b66e24e6113b25a8ca0a4928 ;;
    kagent-darwin-amd64)      echo 5c578b5a83b811e67f1869fcd778d0bb0bace87cca462475da53a0ad7b6f5980 ;;
    kagent-darwin-arm64)      echo b51b1ea64aece6b8b0a5122cdb5783a7392e8fc273a3e8891c39f2d1764ce97d ;;
    *) echo "" ;;
  esac
}

sha256_of() {
  if command -v sha256sum >/dev/null 2>&1; then
    sha256sum "$1" | cut -d' ' -f1
  else
    shasum -a 256 "$1" | cut -d' ' -f1
  fi
}

# fetch <tool> <url>
fetch() {
  tool="$1"; url="$2"
  asset="${tool}-${os}-${arch}"
  want="$(digest_for "${asset}")"
  if [ -z "${want}" ]; then
    echo "tools.sh: no pinned digest for ${asset}" >&2
    exit 1
  fi
  target="${bin}/${tool}"
  if [ -x "${target}" ] && [ "$(sha256_of "${target}")" = "${want}" ]; then
    echo "${tool}: present (${asset})"
    return 0
  fi
  mkdir -p "${bin}"
  tmp="${target}.download"
  curl --fail --silent --show-error --location --max-time 300 --output "${tmp}" "${url}/${asset}"
  got="$(sha256_of "${tmp}")"
  if [ "${got}" != "${want}" ]; then
    rm -f "${tmp}"
    echo "tools.sh: ${asset} has digest ${got}, expected ${want}. Nothing installed." >&2
    exit 1
  fi
  chmod +x "${tmp}"
  mv "${tmp}" "${target}"
  echo "${tool}: installed ${asset} into ${bin}"
}

fetch kubectl-ate "https://github.com/kagent-dev/substrate/releases/download/${substrate_version}"
if [ "${1:-}" = "--with-cli" ]; then
  fetch kagent "https://github.com/kagent-dev/kagent/releases/download/${kagent_version}"
fi
