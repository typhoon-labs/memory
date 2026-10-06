#!/bin/sh
# Downloads the arctl CLI into .bin/ next to this file (git-ignored). Nothing
# is installed on the system. The version matches the server in helmfile.yaml,
# and the download is checked against the SHA-256 the release publishes for it.
# Safe to re-run: a binary with the right checksum is kept.
set -o errexit
set -o nounset

version="v0.4.0"

here="$(cd "$(dirname "$0")" && pwd)"
target="${here}/.bin/arctl"

os="$(uname -s | tr '[:upper:]' '[:lower:]')"
case "$(uname -m)" in
  x86_64 | amd64) arch="amd64" ;;
  aarch64 | arm64) arch="arm64" ;;
  *) echo "get-arctl: unsupported architecture $(uname -m)" >&2; exit 1 ;;
esac

# From the .sha256 files of the v0.4.0 release.
case "${os}-${arch}" in
  linux-amd64) sum="e564334357731c59faa3482f2978c21a205a60ad3bcc63a44465607cc74fa343" ;;
  linux-arm64) sum="4294d505a1187e554f82b7264881d728c37783dabb1d3e3598535a8168f594f8" ;;
  darwin-amd64) sum="d4101e6d7b2658e9af6184ad87299919dfed4ac26a6fb676cc438eaa7c3d53c5" ;;
  darwin-arm64) sum="369dc8db4ade7fd1afb1ccb93fee4ddf16384cdee57f214014ae54369c057b3e" ;;
  *) echo "get-arctl: no arctl build for ${os}-${arch}" >&2; exit 1 ;;
esac

sha256() {
  if command -v sha256sum >/dev/null; then sha256sum "$1"; else shasum -a 256 "$1"; fi | cut -d ' ' -f 1
}

if [ -x "${target}" ] && [ "$(sha256 "${target}")" = "${sum}" ]; then
  echo "get-arctl: ${target} is arctl ${version}"
  exit 0
fi

mkdir -p "${here}/.bin"
url="https://github.com/agentregistry-dev/agentregistry/releases/download/${version}/arctl-${os}-${arch}"
curl --fail --silent --show-error --location --max-time 300 --output "${target}.download" "${url}"
if [ "$(sha256 "${target}.download")" != "${sum}" ]; then
  rm -f "${target}.download"
  echo "get-arctl: checksum mismatch for ${url}; nothing installed" >&2
  exit 1
fi
chmod +x "${target}.download"
mv "${target}.download" "${target}"
echo "get-arctl: installed arctl ${version} at ${target}"
