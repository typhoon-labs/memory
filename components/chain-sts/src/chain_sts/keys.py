"""The service's keys: one signs, the others are only published, and the JWKS lists them all.

A key is behind a small interface, `Signer`: its `kid`, its algorithm, its
public JWK, and `sign`, which signs bytes, as a KMS's asymmetric sign call
does. `FileSigner`, an RSA key read from a PEM file, is the one
implementation. Every key's `kid` is its JWK thumbprint (RFC 7638), so the
same key always has the same `kid`, on every replica and after every restart,
and a new key has a new one.

`KeySet` holds the keys of one configuration: the key that signs, and up to
two that are only published, the next key (published before it signs, so that
verifiers learn it first) and the previous one (published after it stopped
signing, until every token it signed has expired). A token this service
issued is checked against the key its `kid` names, so a token from a replica
that already signs with the next key, or one signed before the previous key
stopped, verifies here too.
"""

from __future__ import annotations

import base64
import hashlib
import json
from pathlib import Path
from typing import Any, Protocol

import jwt
from cryptography.exceptions import UnsupportedAlgorithm
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import padding, rsa

from .config import ConfigError, SigningKeys

# The one algorithm: the service checks its own tokens with it, and every
# verifier here (the gateway's providers, delivery-mcp, the agents) accepts it.
ALGORITHM = "RS256"
MIN_RSA_BITS = 2048


def b64url(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode("ascii")


def b64url_uint(value: int) -> str:
    return b64url(value.to_bytes((value.bit_length() + 7) // 8 or 1, "big"))


def jwk_thumbprint(public_key: rsa.RSAPublicKey) -> str:
    """The key's JWK SHA-256 thumbprint (RFC 7638), base64url-encoded."""
    numbers = public_key.public_numbers()
    # The required members only, in lexicographic order, without whitespace.
    members = {"e": b64url_uint(numbers.e), "kty": "RSA", "n": b64url_uint(numbers.n)}
    canonical = json.dumps(members, separators=(",", ":"), sort_keys=True).encode("utf-8")
    return b64url(hashlib.sha256(canonical).digest())


class Signer(Protocol):
    """A key that signs. The private key may live here or in a KMS; nothing else sees it."""

    # The JWK thumbprint (RFC 7638) of the public key.
    kid: str
    # The JWS `alg` its signatures are for.
    alg: str

    def public_jwk(self) -> dict[str, Any]:
        """The public key as a JWK, with `kid`, `alg` and `use`, as /jwks publishes it."""
        ...

    def sign(self, message: bytes) -> bytes:
        """The signature over `message`, as JWS carries it for `alg` (RFC 7518)."""
        ...


class FileSigner:
    """An RSA private key, from an unencrypted PEM file, that signs RS256 in this process."""

    alg = ALGORITHM

    def __init__(self, private_key: rsa.RSAPrivateKey) -> None:
        if not isinstance(private_key, rsa.RSAPrivateKey):
            raise ConfigError(
                f"the signing key is a {type(private_key).__name__}; RS256 needs an RSA key"
            )
        if private_key.key_size < MIN_RSA_BITS:
            raise ConfigError(
                f"the signing key has {private_key.key_size} bits;"
                f" at least {MIN_RSA_BITS} are needed"
            )
        self._private_key = private_key
        self.public_key = private_key.public_key()
        self.kid = jwk_thumbprint(self.public_key)

    @classmethod
    def from_pem_file(cls, path: Path) -> FileSigner:
        try:
            data = path.read_bytes()
        except OSError as exc:
            raise ConfigError(f"cannot read the signing key {path}: {exc.strerror or exc}") from exc
        try:
            key = serialization.load_pem_private_key(data, password=None)
        except (ValueError, TypeError, UnsupportedAlgorithm) as exc:
            # TypeError: the key is encrypted. The message never holds the key.
            raise ConfigError(
                f"{path} is not an unencrypted PEM private key: {type(exc).__name__}"
            ) from exc
        if not isinstance(key, rsa.RSAPrivateKey):
            raise ConfigError(f"{path} holds a {type(key).__name__}; RS256 needs an RSA key")
        return cls(key)

    def public_jwk(self) -> dict[str, Any]:
        numbers = self.public_key.public_numbers()
        return {
            "kty": "RSA",
            "use": "sig",
            "alg": self.alg,
            "kid": self.kid,
            "n": b64url_uint(numbers.n),
            "e": b64url_uint(numbers.e),
        }

    def sign(self, message: bytes) -> bytes:
        # RS256: RSASSA-PKCS1-v1_5 with SHA-256 (RFC 7518, section 3.3).
        return self._private_key.sign(message, padding.PKCS1v15(), hashes.SHA256())


def _json_b64url(value: dict[str, Any]) -> str:
    return b64url(json.dumps(value, separators=(",", ":")).encode("utf-8"))


class KeySet:
    """The key that signs, and the next and previous keys, which are only published."""

    def __init__(
        self, signing: Signer, *, next: Signer | None = None, previous: Signer | None = None
    ) -> None:
        roles = {"signing": signing, "next": next, "previous": previous}
        self._roles: dict[str, Signer] = {r: s for r, s in roles.items() if s is not None}
        # Asked once: a signer in a KMS fetches its public key over the network.
        self._jwks: list[dict[str, Any]] = []
        self._public_keys: dict[str, Any] = {}
        role_of: dict[str, str] = {}
        for role, signer in self._roles.items():
            if signer.alg != ALGORITHM:
                raise ConfigError(
                    f"the {role} key signs {signer.alg}; this service and its verifiers"
                    f" take {ALGORITHM} only"
                )
            jwk = signer.public_jwk()
            public_key = jwt.PyJWK.from_dict(jwk, algorithm=ALGORITHM).key
            if not (signer.kid == jwk.get("kid") == jwk_thumbprint(public_key)):
                raise ConfigError(f"the {role} key's kid is not its JWK thumbprint (RFC 7638)")
            if signer.kid in role_of:
                raise ConfigError(
                    f"the {role} key and the {role_of[signer.kid]} key are the same key"
                    f" (kid {signer.kid})"
                )
            role_of[signer.kid] = role
            self._jwks.append(jwk)
            self._public_keys[signer.kid] = public_key
        self.signer = signing

    @classmethod
    def load(cls, settings: SigningKeys) -> KeySet:
        """Read every key the configuration names; refuse if one cannot be used."""

        def read(name: str | None) -> Signer | None:
            return None if name is None else FileSigner.from_pem_file(settings.files[name])

        return cls(read(settings.sign), next=read(settings.next), previous=read(settings.previous))

    @property
    def kid(self) -> str:
        """The `kid` of the key that signs."""
        return self.signer.kid

    def kids(self) -> dict[str, str]:
        """Each key's `kid` by its role: `signing`, and `next` and `previous` when present."""
        return {role: signer.kid for role, signer in self._roles.items()}

    def jwks(self) -> dict[str, Any]:
        """Every key, the signing key first. Public parts only."""
        return {"keys": [dict(jwk) for jwk in self._jwks]}

    def sign(self, claims: dict[str, Any]) -> str:
        """A JWT: the claims as a compact JWS (RFC 7515), signed by the signing key."""
        header = {"alg": self.signer.alg, "typ": "JWT", "kid": self.signer.kid}
        signing_input = f"{_json_b64url(header)}.{_json_b64url(claims)}"
        return f"{signing_input}.{b64url(self.signer.sign(signing_input.encode('ascii')))}"

    def verification_key(self, token: str) -> Any:
        """The public key one of this service's tokens must verify with: the one its `kid` names.

        A token without a `kid`, or with one that names none of these keys, gets
        the signing key's, so it verifies only if that key signed it.
        """
        try:
            kid = jwt.get_unverified_header(token).get("kid")
        except jwt.PyJWTError:
            kid = None
        return self._public_keys.get(kid) or self._public_keys[self.signer.kid]
