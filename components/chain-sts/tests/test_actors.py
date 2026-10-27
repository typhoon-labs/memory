"""The two ways to check the actor: a TokenReview to the API server, and the cluster's keys.

The API server is the HTTPS stand-in of conftest.py; no cluster is called.
"""

from __future__ import annotations

import json
import ssl

import pytest
from conftest import (
    ACTOR_AUDIENCE,
    API_SERVER_AUDIENCE,
    CHAT,
    CLUSTER_ISSUER,
    JWKS_PATH,
    make_tls,
    serve_json,
    unused_port_url,
)

from chain_sts.actors import (
    TOKEN_REVIEW_PATH,
    BearerJWKClient,
    JwksActorVerifier,
    TokenReviewActorVerifier,
    actor_verifier,
)
from chain_sts.config import ActorSettings, ConfigError, JwksSettings, TokenReviewSettings
from chain_sts.oauth import Refusal


def review_settings(fake, **changes) -> TokenReviewSettings:
    values = {
        "api_server": fake.url,
        "token_file": fake.reviewer_token_file,
        "ca_file": fake.ca_file,
        "timeout_seconds": 5.0,
    }
    return TokenReviewSettings(**(values | changes))


@pytest.fixture
async def reviewer(api_server):
    verifier = TokenReviewActorVerifier(review_settings(api_server), (ACTOR_AUDIENCE,))
    yield verifier
    await verifier.aclose()


async def refusal_of(verifier, token: str) -> Refusal:
    with pytest.raises(Refusal) as raised:
        await verifier.verify(token)
    return raised.value


# -- TokenReview --------------------------------------------------------------


async def test_review_names_the_service_account(reviewer, api_server, sa_token):
    actor = sa_token("chat-assistant")
    assert await reviewer.verify(actor) == CHAT
    [request] = api_server.requests
    # This service's own token is the bearer; the actor's is reviewed.
    assert request["authorization"] == f"Bearer {api_server.reviewer_token}"
    assert request["body"] == {
        "apiVersion": "authentication.k8s.io/v1",
        "kind": "TokenReview",
        "spec": {"token": actor, "audiences": [ACTOR_AUDIENCE]},
    }


async def test_review_asks_for_every_accepted_audience(api_server, sa_token):
    verifier = TokenReviewActorVerifier(
        review_settings(api_server), (ACTOR_AUDIENCE, API_SERVER_AUDIENCE)
    )
    try:
        assert await verifier.verify(sa_token("chat-assistant", audience=None)) == CHAT
        assert await verifier.verify(sa_token("chat-assistant")) == CHAT
    finally:
        await verifier.aclose()
    assert api_server.requests[0]["body"]["spec"]["audiences"] == [
        ACTOR_AUDIENCE,
        API_SERVER_AUDIENCE,
    ]


async def test_own_token_read_again_for_each_review(reviewer, api_server, cluster, sa_token):
    assert await reviewer.verify(sa_token("chat-assistant")) == CHAT
    # The kubelet replaced the projected token.
    api_server.reviewer_token = cluster.mint("chain-sts", "agentgateway-system", None)
    api_server.reviewer_token_file.write_text(api_server.reviewer_token)
    assert await reviewer.verify(sa_token("chat-assistant")) == CHAT
    assert api_server.requests[1]["authorization"] == f"Bearer {api_server.reviewer_token}"


async def test_not_authenticated(reviewer, sa_token):
    refusal = await refusal_of(reviewer, sa_token("chat-assistant", audience="other"))
    assert (refusal.error, refusal.status) == ("invalid_request", 400)
    assert refusal.description.startswith("actor_token did not verify: [invalid bearer token")


async def test_token_whose_pod_is_gone(reviewer, cluster, sa_token):
    # What only the API server knows: the bound token's pod was deleted.
    token = sa_token("chat-assistant", pod="chat-assistant-gone")
    cluster.gone_pods.add("chat-assistant-gone")
    try:
        refusal = await refusal_of(reviewer, token)
    finally:
        cluster.gone_pods.discard("chat-assistant-gone")
    assert refusal.error == "invalid_request"
    assert "not found" in refusal.description


async def test_answer_without_a_confirmed_audience(reviewer, api_server, monkeypatch):
    # An API server that authenticates but does not say which audience matched.
    def unaware(authorization, body):
        api_server.requests.append(body)
        status = {"authenticated": True, "user": {"username": CHAT}}
        return 201, {**body, "status": status}

    monkeypatch.setattr(api_server, "answer", unaware)
    refusal = await refusal_of(reviewer, "any-token")
    assert refusal.error == "invalid_request"
    assert "confirmed no audience" in refusal.description


async def test_user_that_is_not_a_service_account(reviewer, api_server, monkeypatch):
    def admin(authorization, body):
        status = {
            "authenticated": True,
            "user": {"username": "kubernetes-admin"},
            "audiences": [ACTOR_AUDIENCE],
        }
        return 201, {**body, "status": status}

    monkeypatch.setattr(api_server, "answer", admin)
    refusal = await refusal_of(reviewer, "any-token")
    assert refusal.description == "actor_token does not name a service account"


@pytest.mark.parametrize("code", [401, 403, 429, 500])
async def test_api_server_refuses_or_fails(reviewer, api_server, sa_token, code):
    # 403: this service may not create TokenReviews (no RBAC). Not the actor's fault.
    api_server.fail_with = code
    refusal = await refusal_of(reviewer, sa_token("chat-assistant"))
    assert (refusal.error, refusal.status) == ("temporarily_unavailable", 503)
    assert "actor_token could not be checked" in refusal.description


async def test_own_token_rejected_by_the_api_server(reviewer, api_server, sa_token):
    api_server.reviewer_token_file.write_text("a-token-the-api-server-does-not-know")
    refusal = await refusal_of(reviewer, sa_token("chat-assistant"))
    assert refusal.status == 503


async def test_own_token_missing(reviewer, api_server, sa_token):
    api_server.reviewer_token_file.unlink()
    refusal = await refusal_of(reviewer, sa_token("chat-assistant"))
    assert refusal.status == 503


async def test_api_server_unreachable(api_server, sa_token):
    url = unused_port_url().rstrip("/").replace("http:", "https:")
    verifier = TokenReviewActorVerifier(review_settings(api_server, api_server=url), ("chain-sts",))
    try:
        refusal = await refusal_of(verifier, sa_token("chat-assistant"))
    finally:
        await verifier.aclose()
    assert refusal.status == 503


async def test_api_server_not_trusted_by_the_ca(api_server, sa_token, tmp_path):
    # The CA file decides whom the service talks to: another CA, no answer.
    other = make_tls(tmp_path, "other")
    settings = review_settings(api_server, ca_file=other.ca_file)
    verifier = TokenReviewActorVerifier(settings, ("chain-sts",))
    try:
        refusal = await refusal_of(verifier, sa_token("chat-assistant"))
    finally:
        await verifier.aclose()
    assert refusal.status == 503
    assert api_server.requests == []


def test_review_needs_its_own_token_and_the_ca(api_server, tmp_path):
    with pytest.raises(ConfigError, match="own token"):
        TokenReviewActorVerifier(
            review_settings(api_server, token_file=tmp_path / "missing"), ("chain-sts",)
        )
    with pytest.raises(ConfigError, match="CA"):
        TokenReviewActorVerifier(
            review_settings(api_server, ca_file=tmp_path / "missing.crt"), ("chain-sts",)
        )


def test_review_path():
    assert TOKEN_REVIEW_PATH == "/apis/authentication.k8s.io/v1/tokenreviews"


# -- the cluster's keys -------------------------------------------------------


def jwks_from_file(cluster) -> JwksActorVerifier:
    settings = JwksSettings(issuer=CLUSTER_ISSUER, jwks_file=cluster.jwks_file, jwks_url=None)
    return JwksActorVerifier(settings, (ACTOR_AUDIENCE,))


async def test_keys_from_a_file(cluster, sa_token):
    assert await jwks_from_file(cluster).verify(sa_token("chat-assistant")) == CHAT


async def test_keys_from_a_url(cluster, sa_token):
    server = serve_json(lambda: json.loads(cluster.jwks_file.read_text()))
    url = f"http://127.0.0.1:{server.server_address[1]}/openid/v1/jwks"
    try:
        settings = JwksSettings(issuer=CLUSTER_ISSUER, jwks_file=None, jwks_url=url)
        verifier = JwksActorVerifier(settings, (ACTOR_AUDIENCE,))
        assert await verifier.verify(sa_token("chat-assistant")) == CHAT
    finally:
        server.shutdown()
        server.server_close()


@pytest.mark.parametrize(
    ("change", "error"),
    [
        ({"audience": None}, "InvalidAudienceError"),
        ({"lifetime": -120}, "ExpiredSignatureError"),
    ],
)
async def test_keys_refuse(cluster, sa_token, change, error):
    refusal = await refusal_of(jwks_from_file(cluster), sa_token("chat-assistant", **change))
    assert refusal.description == f"actor_token did not verify: {error}"


async def test_keys_refuse_another_issuer(cluster, sa_token, monkeypatch):
    monkeypatch.setattr(cluster, "issuer", "https://another-cluster.invalid")
    refusal = await refusal_of(jwks_from_file(cluster), sa_token("chat-assistant"))
    assert refusal.description == "actor_token did not verify: InvalidIssuerError"


async def test_keys_refuse_an_unknown_key(cluster, sa_token, monkeypatch):
    monkeypatch.setattr(cluster, "kid", "another-key")
    refusal = await refusal_of(jwks_from_file(cluster), sa_token("chat-assistant"))
    assert refusal.description == "actor_token did not verify: InvalidKeyError"


async def test_keys_unreachable(sa_token):
    settings = JwksSettings(issuer=CLUSTER_ISSUER, jwks_file=None, jwks_url=unused_port_url())
    refusal = await refusal_of(
        JwksActorVerifier(settings, ("chain-sts",)), sa_token("chat-assistant")
    )
    assert (refusal.error, refusal.status) == ("temporarily_unavailable", 503)


# -- the cluster's keys from the API server -----------------------------------


def keys_from_api_server(fake, **changes) -> JwksActorVerifier:
    values = {
        "issuer": CLUSTER_ISSUER,
        "jwks_file": None,
        "jwks_url": f"{fake.url}{JWKS_PATH}",
        "token_file": fake.reviewer_token_file,
        "ca_file": fake.ca_file,
    }
    return JwksActorVerifier(JwksSettings(**(values | changes)), (ACTOR_AUDIENCE,))


async def test_keys_from_the_api_server(api_server, sa_token):
    # The dev cluster's setup: the pod's own token as the bearer, its CA for TLS.
    verifier = keys_from_api_server(api_server)
    assert await verifier.verify(sa_token("chat-assistant")) == CHAT
    assert api_server.key_fetches == [f"Bearer {api_server.reviewer_token}"]
    # Cached: a second actor costs no fetch.
    assert await verifier.verify(sa_token("chat-assistant")) == CHAT
    assert len(api_server.key_fetches) == 1


async def test_keys_from_the_api_server_without_a_token(api_server, sa_token):
    # Anonymous callers may not read the keys.
    refusal = await refusal_of(keys_from_api_server(api_server, token_file=None), sa_token("x"))
    assert (refusal.error, refusal.status) == ("temporarily_unavailable", 503)
    assert api_server.key_fetches == [None]


async def test_keys_bearer_rejected_by_the_api_server(api_server, sa_token):
    api_server.reviewer_token_file.write_text("a-token-the-api-server-does-not-know")
    refusal = await refusal_of(keys_from_api_server(api_server), sa_token("chat-assistant"))
    assert refusal.status == 503


async def test_keys_bearer_gone_after_start(api_server, sa_token):
    verifier = keys_from_api_server(api_server)
    api_server.reviewer_token_file.unlink()
    refusal = await refusal_of(verifier, sa_token("chat-assistant"))
    assert refusal.status == 503
    assert api_server.key_fetches == []


async def test_keys_api_server_not_trusted_by_the_ca(api_server, sa_token, tmp_path):
    other = make_tls(tmp_path, "other")
    verifier = keys_from_api_server(api_server, ca_file=other.ca_file)
    refusal = await refusal_of(verifier, sa_token("chat-assistant"))
    assert refusal.status == 503
    # The token never left: the handshake failed first.
    assert api_server.key_fetches == []


def test_keys_bearer_read_again_for_each_fetch(api_server, cluster):
    client = BearerJWKClient(
        f"{api_server.url}{JWKS_PATH}",
        api_server.reviewer_token_file,
        ssl_context=ssl.create_default_context(cafile=str(api_server.ca_file)),
    )
    client.fetch_data()
    # The kubelet replaced the projected token.
    api_server.reviewer_token = cluster.mint("chain-sts", "agentgateway-system", None)
    api_server.reviewer_token_file.write_text(api_server.reviewer_token)
    client.fetch_data()
    assert api_server.key_fetches[1] == f"Bearer {api_server.reviewer_token}"
    assert api_server.key_fetches[0] != api_server.key_fetches[1]


def test_keys_need_their_token_and_ca(api_server, tmp_path):
    with pytest.raises(ConfigError, match="bearer token"):
        keys_from_api_server(api_server, token_file=tmp_path / "missing")
    with pytest.raises(ConfigError, match="CA"):
        keys_from_api_server(api_server, ca_file=tmp_path / "missing.crt")


def test_keys_file_unreadable(tmp_path):
    bad = tmp_path / "jwks.json"
    bad.write_text("not json")
    with pytest.raises(ConfigError, match="cluster's keys"):
        JwksActorVerifier(JwksSettings(CLUSTER_ISSUER, bad, None), ("chain-sts",))


# -- the choice ---------------------------------------------------------------


async def test_configuration_chooses(api_server, cluster):
    review = review_settings(api_server)
    keys = JwksSettings(CLUSTER_ISSUER, cluster.jwks_file, None)
    chosen = actor_verifier(ActorSettings("token_review", ("chain-sts",), review, keys))
    assert isinstance(chosen, TokenReviewActorVerifier)
    await chosen.aclose()
    chosen = actor_verifier(ActorSettings("jwks", ("chain-sts",), review, keys))
    assert isinstance(chosen, JwksActorVerifier)
