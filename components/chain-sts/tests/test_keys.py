"""A key read from a PEM file, the `kid` the key decides, and the JWKS."""

from __future__ import annotations

import base64

import jwt
import pytest
from conftest import rsa_key, write_pem
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import ec, rsa

from chain_sts.config import ConfigError
from chain_sts.keys import FileSigner, KeySet, jwk_thumbprint

# RFC 7638, section 3.1: an RSA key and its JWK SHA-256 thumbprint.
RFC7638_N = (
    "0vx7agoebGcQSuuPiLJXZptN9nndrQmbXEps2aiAFbWhM78LhWx4cbbfAAtVT86zwu1RK7aPFFxuhDR1L6tSoc_BJECP"
    "ebWKRXjBZCiFV4n3oknjhMstn64tZ_2W-5JsGY4Hc5n9yBXArwl93lqt7_RN5w6Cf0h4QyQ5v-65YGjQR0_FDW2QvzqY"
    "368QQMicAtaSqzs8KJZgnYb9c7d0zgdAZHzu6qMQvRL5hajrn1n91CbOpbISD08qNLyrdkt-bFTWhAI4vMQFh6WeZu0f"
    "M4lFd2NcRwr3XPksINHaQ-G_xBniIqbw0Ls1jF44-csFCur-kEgU8awapJzKnqDKgw"
)
RFC7638_THUMBPRINT = "NzbLsXh8uDCcd-6MNwXF4W_7noWXFZAfHkxZsRGC9Xs"


def from_b64url(value: str) -> int:
    return int.from_bytes(base64.urlsafe_b64decode(value + "=" * (-len(value) % 4)), "big")


def test_thumbprint_of_the_rfc_example():
    public_key = rsa.RSAPublicNumbers(e=65537, n=from_b64url(RFC7638_N)).public_key()
    assert jwk_thumbprint(public_key) == RFC7638_THUMBPRINT


def test_kid_is_stable_for_the_same_key(tmp_path):
    path = write_pem(rsa_key(), tmp_path / "key.pem")
    first, second = FileSigner.from_pem_file(path), FileSigner.from_pem_file(path)
    assert first.kid == second.kid == jwk_thumbprint(first.public_key)
    assert FileSigner.from_pem_file(write_pem(rsa_key(), tmp_path / "other.pem")).kid != first.kid


def test_pkcs1_pem_accepted(tmp_path):
    key = rsa_key()
    path = tmp_path / "key.pem"
    path.write_bytes(
        key.private_bytes(
            serialization.Encoding.PEM,
            serialization.PrivateFormat.TraditionalOpenSSL,
            serialization.NoEncryption(),
        )
    )
    assert FileSigner.from_pem_file(path).kid == jwk_thumbprint(key.public_key())


def test_jwks_publishes_the_public_key_only(tmp_path):
    key = FileSigner.from_pem_file(write_pem(rsa_key(), tmp_path / "key.pem"))
    [jwk] = KeySet(key).jwks()["keys"]
    assert jwk.keys() == {"kty", "use", "alg", "kid", "n", "e"}
    assert (jwk["kty"], jwk["use"], jwk["alg"], jwk["kid"]) == ("RSA", "sig", "RS256", key.kid)
    # A token it signs verifies with the published key alone.
    token = KeySet(key).sign({"sub": "someone"})
    assert jwt.get_unverified_header(token)["kid"] == key.kid
    public = jwt.PyJWK.from_dict(jwk).key
    assert jwt.decode(token, public, algorithms=["RS256"])["sub"] == "someone"


def test_missing_file(tmp_path):
    with pytest.raises(ConfigError, match="cannot read the signing key"):
        FileSigner.from_pem_file(tmp_path / "missing.pem")


def test_not_a_key(tmp_path):
    path = tmp_path / "key.pem"
    path.write_text("-----BEGIN PRIVATE KEY-----\nnot a key\n-----END PRIVATE KEY-----\n")
    with pytest.raises(ConfigError, match="not an unencrypted PEM private key"):
        FileSigner.from_pem_file(path)


def test_encrypted_key(tmp_path):
    path = tmp_path / "key.pem"
    path.write_bytes(
        rsa_key().private_bytes(
            serialization.Encoding.PEM,
            serialization.PrivateFormat.PKCS8,
            serialization.BestAvailableEncryption(b"test-only"),
        )
    )
    with pytest.raises(ConfigError, match="not an unencrypted PEM private key"):
        FileSigner.from_pem_file(path)


def test_not_rsa(tmp_path):
    path = write_pem(ec.generate_private_key(ec.SECP256R1()), tmp_path / "key.pem")
    with pytest.raises(ConfigError, match="needs an RSA key"):
        FileSigner.from_pem_file(path)


def test_too_short(tmp_path):
    short = rsa.generate_private_key(public_exponent=65537, key_size=1024)
    with pytest.raises(ConfigError, match="at least 2048"):
        FileSigner.from_pem_file(write_pem(short, tmp_path / "key.pem"))
