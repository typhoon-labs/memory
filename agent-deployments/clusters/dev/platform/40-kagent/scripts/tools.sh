#!/bin/sh
# Downloads the command line tools that the kagent install needs into
# ../.bin (git-ignored), never into the system.
#
#   tools.sh              kubectl-ate, the Agent Substrate plugin (required:
#                         it creates the identity material no chart creates)
#   tools.sh --with-cli   also the kagent CLI (optional; nothing here needs it)
#
# Versions are the ones https://kagent.dev/docs/kagent/1.x/setup/installation/
# names, and must match the charts in ../helmfile.yaml. Each download is checked
# against the SHA-256 digest that the GitHub release publishes for that asset.
# Safe to re-run: a file that already has the right digest is kept.
set -o errexit
set -o nounset

here="$(cd "$(dirname "$0")" && pwd)"
bin="${here}/../.bin"

substrate_version="v0.3.0-alpha3"
kagent_version="v1.0.0-alpha7"

os="$(uname -s | tr '[:upper:]' '[:lower:]')"
arch="$(uname -m | sed 's/x86_64/amd64/; s/aarch64/arm64/')"

# Digest of release asset <tool>-<os>-<arch>, from the release's asset list.
digest_for() {
  case "$1" in
    kubectl-ate-linux-amd64)  echo 240181f17d38ed9453770fbe17dc9362833ab0d557c6cd5f0f96e2d45a37f059 ;;
    kubectl-ate-linux-arm64)  echo b07e184814a8c36a750bbbc73a441396e5b1f37f51e7fa14b267313ee9bf314a ;;
    kubectl-ate-darwin-amd64) echo bdb798a57441231eb2b2a91b1857acaa3c68a4ee332c9c32002c18c7fb2e9513 ;;
    kubectl-ate-darwin-arm64) echo 018601f6b0b3f03c26e611dbde79099bd7a1d30af97b4665c9e0fd2368affd5a ;;
    kagent-linux-amd64)       echo 3ac78d74abeb45c5bc0045aa74be7fbcc05fb75f73a3c8769bb4c9064c247dfc ;;
    kagent-linux-arm64)       echo 9566365c3d5bceaffa5900a83da5eba86550d5ddf31bea03c7a2764434201a4a ;;
    kagent-darwin-amd64)      echo 4b218d85590a54870e1d7b22337297f82b010559e7ec2bff1573959e45ad70e9 ;;
    kagent-darwin-arm64)      echo 246b8f5d78bfd3f811ef667bfd0cbcc7e3ed95f6bd887899ce3e64c89b418ac2 ;;
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
