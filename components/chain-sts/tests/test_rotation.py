"""Key rotation: the configuration, the key set, the signer interface, and a rotation over HTTP.

A rotation is: publish the next key, wait until every verifier has it,
promote it to sign and keep the old key as the previous one, wait until every
token the old key signed has expired, drop it. The tests over HTTP start one
instance per step, all with the same issuer, as the replicas of one release
have during a rollout.
"""

from __future__ import annotations

import copy
from pathlib import Path
from typing import Any

import httpx
import jwt
import pytest
import yaml
from conftest import AUDIENCE, EXAMPLE_CONFIG, rsa_key, write_pem
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import padding

from chain_sts.config import ConfigError, SigningKeys, load_config
from chain_sts.keys import ALGORITHM, FileSigner, KeySet, b64url, jwk_thumbprint

EXAMPLE = yaml.safe_load(EXAMPLE_CONFIG.read_text())


def load(tmp_path: Path, change) -> Any:
    raw = copy.deepcopy(EXAMPLE)
    change(raw)
    path = tmp_path / "config.yaml"
    path.write_text(yaml.safe_dump(raw))
    return load_config(path, env={})


def rotating(**signing_keys: Any):
    """A change to the example: `signing_keys` instead of `signing_key_file`."""

    def change(raw: dict[str, Any]) -> None:
        del raw["signing_key_file"]
        raw["signing_keys"] = signing_keys

    return change


FILES = {"key-a": "keys/a.pem", "key-b": "keys/b.pem"}


# -- the configuration --------------------------------------------------------


def test_one_key_as_before():
    keys = load_config(EXAMPLE_CONFIG, env={}).signing_keys
    assert keys == SigningKeys(
        files={"signing_key_file": Path("/etc/chain-sts/signing-key/key.pem")},
        sign="signing_key_file",
    )
    assert (keys.next, keys.previous) == (None, None)


def test_several_keys(tmp_path):
    keys = load(tmp_path, rotating(files=FILES, sign="key-a", next="key-b")).signing_keys
    # A relative path is relative to the file.
    assert keys.files == {"key-a": tmp_path / "keys/a.pem", "key-b": tmp_path / "keys/b.pem"}
    assert (keys.sign, keys.next, keys.previous) == ("key-a", "key-b", None)
    keys = load(tmp_path, rotating(files=FILES, sign="key-b", previous="key-a")).signing_keys
    assert (keys.sign, keys.next, keys.previous) == ("key-b", None, "key-a")


@pytest.mark.parametrize(
    ("change", "message"),
    [
        (lambda raw: raw.pop("signing_key_file"), "signing_key_file is required"),
        (
            lambda raw: raw.update(signing_keys={"files": FILES, "sign": "key-a"}),
            "signing_key_file and signing_keys exclude each other",
        ),
        # No key that signs.
        (rotating(files=FILES, next="key-b"), "signing_keys.sign is required"),
        # A reference to a key that is not there.
        (rotating(files=FILES, sign="key-c"), "signing_keys.sign names key-c, which"),
        (rotating(files=FILES, sign="key-a", next="key-c"), "signing_keys.next names key-c"),
        (
            rotating(files=FILES, sign="key-a", previous="key-c"),
            "signing_keys.previous names key-c",
        ),
        (rotating(files=FILES, sign="key-a", next="key-a"), ".sign and .next both name key-a"),
        # A key with no role is a leftover or a mistake.
        (rotating(files=FILES, sign="key-a"), "['key-b'] have no role"),
        (rotating(files={}, sign="key-a"), "signing_keys.files must name at least one key"),
        (rotating(files={"key-a": 1}, sign="key-a"), "must map names to non-empty strings"),
        (
            rotating(files=FILES, sign="key-a", current="key-b"),
            "signing_keys: unknown keys ['current']",
        ),
    ],
)
def test_refused(tmp_path, change, message):
    with pytest.raises(ConfigError) as raised:
        load(tmp_path, change)
    assert message in str(raised.value)


# -- the key set --------------------------------------------------------------


@pytest.fixture(scope="module")
def key_files(tmp_path_factory) -> dict[str, Path]:
    directory = tmp_path_factory.mktemp("rotation")
    return {name: write_pem(rsa_key(), directory / f"{name}.pem") for name in ("a", "b", "c")}


@pytest.fixture(scope="module")
def a(key_files) -> FileSigner:
    return FileSigner.from_pem_file(key_files["a"])


@pytest.fixture(scope="module")
def b(key_files) -> FileSigner:
    return FileSigner.from_pem_file(key_files["b"])


def private_key(path: Path) -> Any:
    return serialization.load_pem_private_key(path.read_bytes(), password=None)


def verify_with(keys: KeySet, token: str) -> dict[str, Any]:
    """As the service checks its own tokens: the key the token's kid names."""
    return jwt.decode(token, keys.verification_key(token), algorithms=["RS256"])


def kid_of(token: str) -> str:
    return jwt.get_unverified_header(token)["kid"]


def test_next_is_published_and_does_not_sign(a, b):
    keys = KeySet(a, next=b)
    assert [k["kid"] for k in keys.jwks()["keys"]] == [a.kid, b.kid]
    assert keys.kids() == {"signing": a.kid, "next": b.kid}
    assert keys.kid == a.kid
    assert kid_of(keys.sign({"sub": "u"})) == a.kid


def test_previous_is_published_and_does_not_sign(a, b):
    keys = KeySet(b, previous=a)
    assert [k["kid"] for k in keys.jwks()["keys"]] == [b.kid, a.kid]
    assert keys.kids() == {"signing": b.kid, "previous": a.kid}
    assert kid_of(keys.sign({"sub": "u"})) == b.kid


def test_promotion_changes_the_signing_key_and_both_verify(a, b):
    before, after = KeySet(a, next=b), KeySet(b, previous=a)
    old, new = before.sign({"sub": "old"}), after.sign({"sub": "new"})
    assert (kid_of(old), kid_of(new)) == (a.kid, b.kid)
    # During the rollout, either replica checks the other's tokens.
    assert verify_with(before, new)["sub"] == "new"
    assert verify_with(after, old)["sub"] == "old"
    # Once the previous key is dropped, its tokens no longer verify.
    with pytest.raises(jwt.InvalidSignatureError):
        verify_with(KeySet(b), old)


def test_a_token_without_a_known_kid_is_checked_against_the_signing_key(a, key_files):
    keys = KeySet(a)
    no_kid = jwt.encode({"sub": "u"}, private_key(key_files["a"]), algorithm="RS256")
    assert verify_with(keys, no_kid)["sub"] == "u"
    foreign = jwt.encode(
        {"sub": "u"}, private_key(key_files["b"]), algorithm="RS256", headers={"kid": "not-ours"}
    )
    with pytest.raises(jwt.InvalidSignatureError):
        verify_with(keys, foreign)


def test_the_same_key_twice_is_refused(a, key_files, tmp_path):
    copy_of_a = tmp_path / "copy.pem"
    copy_of_a.write_bytes(key_files["a"].read_bytes())
    with pytest.raises(
        ConfigError, match=f"the next key and the signing key are the same key .*{a.kid}"
    ):
        KeySet(a, next=FileSigner.from_pem_file(copy_of_a))
    settings = SigningKeys(
        files={"one": key_files["a"], "two": copy_of_a}, sign="one", previous="two"
    )
    with pytest.raises(ConfigError, match="the previous key and the signing key are the same"):
        KeySet.load(settings)


def test_load_reads_every_role(a, b, key_files):
    c = FileSigner.from_pem_file(key_files["c"])
    files = {"a": key_files["a"], "b": key_files["b"], "c": key_files["c"]}
    keys = KeySet.load(SigningKeys(files=files, sign="b", next="c", previous="a"))
    assert keys.kids() == {"signing": b.kid, "next": c.kid, "previous": a.kid}


def test_load_refuses_a_key_it_cannot_read(key_files, tmp_path):
    files = {"a": key_files["a"], "gone": tmp_path / "gone.pem"}
    with pytest.raises(ConfigError, match="cannot read the signing key"):
        KeySet.load(SigningKeys(files=files, sign="a", next="gone"))


# -- the signer interface -----------------------------------------------------


class RemoteSigner:
    """A stand-in for a key in a KMS: it signs bytes, and only its public key leaves it."""

    def __init__(self, alg: str = ALGORITHM, kid: str | None = None) -> None:
        self.__key = rsa_key()
        public = self.__key.public_key()
        self.kid = kid or jwk_thumbprint(public)
        self.alg = alg
        self.messages: list[bytes] = []
        self._jwk = {
            **jwt.algorithms.RSAAlgorithm.to_jwk(public, as_dict=True),
            "kid": self.kid,
            "alg": alg,
            "use": "sig",
        }

    def public_jwk(self) -> dict[str, Any]:
        return dict(self._jwk)

    def sign(self, message: bytes) -> bytes:
        self.messages.append(message)
        return self.__key.sign(message, padding.PKCS1v15(), hashes.SHA256())


def test_a_signer_from_elsewhere_signs_and_is_published():
    signer = RemoteSigner()
    keys = KeySet(signer)
    token = keys.sign({"sub": "u", "aud": AUDIENCE})
    # One call, over the JWS signing input: the header and the claims.
    assert signer.messages == [token.rsplit(".", 1)[0].encode("ascii")]
    assert jwt.get_unverified_header(token) == {"alg": "RS256", "typ": "JWT", "kid": signer.kid}
    [jwk] = keys.jwks()["keys"]
    public = jwt.PyJWK.from_dict(jwk).key
    assert jwt.decode(token, public, algorithms=["RS256"], audience=AUDIENCE)["sub"] == "u"


def test_a_file_signer_signs_rs256(a):
    message = b"header.claims"
    signature = a.sign(message)
    # Raises unless it is RSASSA-PKCS1-v1_5 with SHA-256.
    a.public_key.verify(signature, message, padding.PKCS1v15(), hashes.SHA256())
    assert a.alg == "RS256"


def test_a_signer_with_another_algorithm_is_refused():
    with pytest.raises(ConfigError, match="the next key signs ES256"):
        KeySet(RemoteSigner(), next=RemoteSigner(alg="ES256"))


def test_a_kid_that_is_not_the_thumbprint_is_refused():
    with pytest.raises(ConfigError, match="kid is not its JWK thumbprint"):
        KeySet(RemoteSigner(kid="key-1"))


def test_jws_encoding_matches_pyjwt(a, key_files):
    claims = {"sub": "u", "name": "Zoë", "roles": ["developer"], "exp": 2000000000}
    ours = KeySet(a).sign(claims)
    theirs = jwt.encode(claims, private_key(key_files["a"]), algorithm="RS256")
    # The same claims and signature scheme; PKCS #1 v1.5 is deterministic.
    assert jwt.decode(ours, a.public_key, algorithms=["RS256"]) == claims
    header, payload, signature = ours.split(".")
    assert payload == theirs.split(".")[1]
    assert signature == b64url(a.sign(f"{header}.{payload}".encode()))


# -- a rotation over HTTP -----------------------------------------------------


ISSUER = "http://chain-sts.rotation.test"


class Verifier(jwt.PyJWKClient):
    """A service that checks chain-sts's tokens as remediation-agent and comms-agent do."""

    def __init__(self, uri: str) -> None:
        super().__init__(uri, cache_keys=True, lifespan=3600, timeout=10)
        self.fetches = 0

    def fetch_data(self) -> Any:
        self.fetches += 1
        return super().fetch_data()

    def verify(self, token: str) -> dict[str, Any]:
        key = self.get_signing_key_from_jwt(token).key
        return jwt.decode(token, key, algorithms=["RS256"], audience=AUDIENCE, issuer=ISSUER)


@pytest.fixture(scope="module")
def step(start_sts, policy, key_files):
    """The service at one step of a rotation of key a to key b, with the shared issuer."""

    def start(**signing_keys: str):
        raw = policy("jwks")
        if signing_keys.keys() == {"sign"}:
            # One key, written as before, as the chart writes it outside a rotation.
            raw["signing_key_file"] = str(key_files[signing_keys["sign"]])
        else:
            del raw["signing_key_file"]
            raw["signing_keys"] = {
                "files": {name: str(key_files[name]) for name in set(signing_keys.values())},
                **signing_keys,
            }
        return start_sts(raw, issuer=ISSUER)

    return start


def exchanged(sts, subject: str, actor: str) -> str:
    response = sts.exchange(subject, actor, audience=AUDIENCE)
    assert response.status_code == 200, response.text
    return response.json()["access_token"]


def test_a_rotation_without_a_failed_verification(step, a, b, user_token, sa_token):
    user, chat, remediation = (
        user_token("platform-engineer"),
        sa_token("chat-assistant"),
        sa_token("remediation-agent"),
    )
    publish, promote, drop = step(sign="a", next="b"), step(sign="b", previous="a"), step(sign="b")

    # Next published: key a still signs; a verifier that fetches the keys now learns b too.
    verifier = Verifier(publish.metadata["jwks_uri"])
    old = exchanged(publish, user, chat)
    assert kid_of(old) == a.kid
    assert verifier.verify(old)["preferred_username"] == "platform-engineer"
    assert verifier.fetches == 1

    # Promoted, during the rollout: the Service sends some requests to the new
    # replicas and some to the old ones.
    verifier.uri = promote.metadata["jwks_uri"]
    new = exchanged(promote, user, chat)
    assert kid_of(new) == b.kid
    assert verifier.verify(new)["sub"] == verifier.verify(old)["sub"]
    assert verifier.fetches == 1, "the verifier knew key b before it signed"
    # A verifier that first fetches now still finds key a, as the previous key.
    assert Verifier(promote.metadata["jwks_uri"]).verify(old)
    # Each replica takes a token the other signed, and the chain goes on.
    assert verifier.verify(exchanged(publish, new, remediation))
    assert verifier.verify(exchanged(promote, old, remediation))

    # Dropped, once every token key a signed has expired: key a is gone.
    assert [k["kid"] for k in httpx.get(drop.metadata["jwks_uri"]).json()["keys"]] == [b.kid]
    response = drop.exchange(old, remediation, audience=AUDIENCE)
    assert response.status_code == 400
    assert response.json()["error_description"] == (
        "subject_token did not verify: InvalidSignatureError"
    )
    with pytest.raises(jwt.PyJWKClientError, match="Unable to find a signing key"):
        Verifier(drop.metadata["jwks_uri"]).verify(old)
    assert exchanged(drop, new, remediation)


def test_a_key_that_signs_unannounced_fails_where_next_would_not(step, b, user_token, sa_token):
    """Why the next key goes first: a verifier refetches for an unknown kid only so often."""
    user, chat = user_token("developer"), sa_token("chat-assistant")
    before, after = step(sign="a"), step(sign="b", previous="a")
    verifier = Verifier(before.metadata["jwks_uri"])
    verifier.verify(exchanged(before, user, chat))

    verifier.uri = after.metadata["jwks_uri"]
    new = exchanged(after, user, chat)
    assert kid_of(new) == b.kid
    # PyJWKClient refetches for an unknown kid only 30 s after its last fetch.
    with pytest.raises(jwt.PyJWKClientError, match="Unable to find a signing key"):
        verifier.verify(new)
    assert verifier.fetches == 1
