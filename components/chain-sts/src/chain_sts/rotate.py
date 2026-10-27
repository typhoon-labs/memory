"""The signing key's rotation, from a workstation: a new key, a key's kid, and the steps.

    python -m chain_sts.rotate new-key > key.pem
    python -m chain_sts.rotate kid key.pem [...]
    python -m chain_sts.rotate steps [--token-ttl 300] [--jwks-refresh 300] [--leeway 60]

`new-key` writes a key in the form the service reads (an unencrypted PKCS #8
PEM, RSA, 2048 bits) to standard output, never to a terminal, and its kid to
standard error. `kid` gives the kid the service publishes for a key file
(`/dev/stdin` for a pipe). `steps` prints the rotation with the waits worked
out from the tokens' lifetime and the verifiers' refresh. Nothing here talks
to a cluster.
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import rsa

from .config import ConfigError
from .keys import MIN_RSA_BITS, FileSigner

# The gateway's controller fetches /jwks every `cacheDuration` (5m in the
# route policies here, also Agentgateway's default and least).
JWKS_REFRESH_SECONDS = 300
# The largest clock-skew allowance among the verifiers: Agentgateway's (the
# jsonwebtoken crate's default leeway). delivery-mcp and the agents allow 30.
LEEWAY_SECONDS = 60
# For the gateway's controller to store and push what it fetched, a fetch
# retried after a failure, and a stopped pod's grace period.
MARGIN_SECONDS = 60


def new_key() -> tuple[bytes, str]:
    """A new key as the service reads it, and its kid."""
    key = rsa.generate_private_key(public_exponent=65537, key_size=MIN_RSA_BITS)
    pem = key.private_bytes(
        serialization.Encoding.PEM,
        serialization.PrivateFormat.PKCS8,
        serialization.NoEncryption(),
    )
    return pem, FileSigner(key).kid


def waits(token_ttl: int, jwks_refresh: int, leeway: int) -> tuple[int, int]:
    """Seconds to wait after the rollout that publishes the next key, and after the one that
    makes it sign."""
    return jwks_refresh + MARGIN_SECONDS, token_ttl + leeway + MARGIN_SECONDS


def minutes(seconds: int) -> str:
    whole, rest = divmod(seconds, 60)
    return f"{whole} min" + (f" {rest} s" if rest else "") + f" ({seconds} s)"


def steps(token_ttl: int, jwks_refresh: int, leeway: int) -> str:
    publish, retire = waits(token_ttl, jwks_refresh, leeway)
    return f"""\
Rotating chain-sts's signing key, from <old> to <new> (Secret names): tokens
live {token_ttl} s, verifiers accept one {leeway} s past its exp, and the gateway's
controller fetches /jwks every {jwks_refresh} s.

1. Publish the next key. Create its Secret, beside the old one:
     python -m chain_sts.rotate new-key | kubectl -n chain-sts create secret \\
       generic <new> --from-file=key.pem=/dev/stdin
   Chart values: signingKey.next: <new>. Sync, and wait for the rollout.
   /jwks lists the new kid after the one that signs.

2. Wait at least {minutes(publish)} after that rollout, until every verifier
   has the new key: the gateway's controller refetches /jwks every
   {jwks_refresh} s and never on an unknown kid; delivery-mcp and the agents
   refetch on an unknown kid. Before going on, check that the gateway's copy
   (ConfigMaps labeled app.kubernetes.io/component=jwks-store in
   agentgateway-system) holds the new kid.

3. Promote it. Chart values: signingKey.secretName: <new>,
   signingKey.previous: <old>, signingKey.next: "". Sync, and wait for the
   rollout. Every pod's /healthz says keys.signing is the new kid.

4. Wait at least {minutes(retire)} after that rollout, until the last token
   the old key signed has expired everywhere: {token_ttl} s, and {leeway} s of
   clock skew.

5. Drop the old key. Chart values: signingKey.previous: "". Sync, wait for
   the rollout, then delete Secret <old>.
"""


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        prog="python -m chain_sts.rotate", description="chain-sts's signing-key rotation"
    )
    commands = parser.add_subparsers(dest="command", required=True)
    commands.add_parser("new-key", help="a new key, as PEM, on standard output")
    kids = commands.add_parser("kid", help="the kid the service publishes for each key file")
    kids.add_argument("files", nargs="+", type=Path, help="PEM files; /dev/stdin for a pipe")
    plan = commands.add_parser("steps", help="the rotation, with its waits")
    plan.add_argument(
        "--token-ttl", type=int, default=300, help="the policy's token_ttl_seconds (300)"
    )
    plan.add_argument(
        "--jwks-refresh",
        type=int,
        default=JWKS_REFRESH_SECONDS,
        help=f"the gateway's cacheDuration, in seconds ({JWKS_REFRESH_SECONDS})",
    )
    plan.add_argument(
        "--leeway",
        type=int,
        default=LEEWAY_SECONDS,
        help=f"the largest clock skew a verifier allows, in seconds ({LEEWAY_SECONDS})",
    )
    args = parser.parse_args(argv)

    if args.command == "new-key":
        if sys.stdout.isatty():
            print(
                "new-key: not writing a private key to a terminal;"
                " pipe it to kubectl or redirect it to a file",
                file=sys.stderr,
            )
            return 2
        pem, kid = new_key()
        sys.stdout.write(pem.decode("ascii"))
        sys.stdout.flush()
        print(f"kid {kid}", file=sys.stderr)
        return 0
    if args.command == "kid":
        try:
            for path in args.files:
                print(f"{FileSigner.from_pem_file(path).kid}  {path}")
        except ConfigError as exc:
            print(f"kid: {exc}", file=sys.stderr)
            return 2
        return 0
    print(steps(args.token_ttl, args.jwks_refresh, args.leeway), end="")
    return 0


if __name__ == "__main__":
    sys.exit(main())
