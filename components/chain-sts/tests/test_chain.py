"""The chain itself, and every refusal, over HTTP. Each test runs with both actor checks."""

from __future__ import annotations

import json
import logging
import time

import httpx
import jwt
import pytest
from conftest import (
    AUDIENCE,
    CHAT,
    COMMS,
    REMEDIATION,
    b64url,
    unused_port_url,
    unverified,
)

from chain_sts.logs import JsonFormatter
from chain_sts.oauth import ACCESS_TOKEN_TYPE, TOKEN_EXCHANGE
from chain_sts.service import chain_of

CARRIED = ("preferred_username", "roles", "team", "email", "name")


@pytest.fixture(scope="module")
def user(user_token) -> str:
    return user_token("platform-engineer")


@pytest.fixture(scope="module")
def chat_token(chain_sts, user, sa_token) -> str:
    """The user's token, exchanged by chat-assistant."""
    response = chain_sts.exchange(user, sa_token("chat-assistant"), audience=AUDIENCE)
    assert response.status_code == 200, response.text
    return response.json()["access_token"]


@pytest.fixture(scope="module")
def remediation_token(chain_sts, chat_token, sa_token) -> str:
    """chat-assistant's token, exchanged by remediation-agent."""
    response = chain_sts.exchange(chat_token, sa_token("remediation-agent"), audience=AUDIENCE)
    assert response.status_code == 200, response.text
    return response.json()["access_token"]


def refused(response: httpx.Response, status: int = 400) -> dict:
    assert response.status_code == status, response.text
    assert response.headers["content-type"] == "application/json"
    assert response.headers["cache-control"] == "no-store"
    body = response.json()
    assert set(body) == {"error", "error_description"}
    return body


def own_token(chain_sts, exp: int, user: str, act: dict | None = None) -> str:
    """A token signed with the service's own key, as if chat-assistant had got it."""
    now = int(time.time())
    claims = {
        "iss": chain_sts.metadata["issuer"],
        "sub": unverified(user)["sub"],
        "aud": AUDIENCE,
        "iat": now - 600,
        "nbf": now - 600,
        "exp": exp,
        "jti": "test",
        "client_id": "chat-assistant",
        "act": act or {"sub": CHAT, "client_id": "chat-assistant"},
    }
    return chain_sts.service.keys.sign(claims)


# -- metadata -----------------------------------------------------------------


def test_metadata_names_the_bound_address(chain_sts):
    assert chain_sts.metadata["issuer"] == chain_sts.url
    assert chain_sts.metadata["token_endpoint"] == f"{chain_sts.url}/token"
    assert chain_sts.metadata["jwks_uri"] == f"{chain_sts.url}/jwks"
    assert TOKEN_EXCHANGE in chain_sts.metadata["grant_types_supported"]
    assert chain_sts.metadata["token_endpoint_auth_methods_supported"] == ["none"]


# -- the chain ----------------------------------------------------------------


def test_first_hop_names_only_chat_assistant(chain_sts, chat_token, user):
    claims = chain_sts.verify_like_gateway(chat_token)
    assert claims["sub"] == unverified(user)["sub"]
    assert claims["act"] == {"sub": CHAT, "client_id": "chat-assistant"}
    assert claims["client_id"] == "chat-assistant"


def test_two_agent_chain(chain_sts, user, chat_token, remediation_token):
    user_claims = unverified(user)
    # Verified the way the gateway would: keys from the published JWKS.
    claims = chain_sts.verify_like_gateway(remediation_token)

    assert claims["iss"] == chain_sts.metadata["issuer"]
    assert claims["sub"] == user_claims["sub"]
    for name in CARRIED:
        assert claims[name] == user_claims[name], name
    assert claims["aud"] == AUDIENCE
    # Newest agent outermost, and nothing deeper than the two.
    assert claims["act"] == {
        "sub": REMEDIATION,
        "client_id": "remediation-agent",
        "act": {"sub": CHAT, "client_id": "chat-assistant"},
    }
    assert chain_of(claims["act"]) == [REMEDIATION, CHAT]
    assert claims["client_id"] == "remediation-agent"
    assert claims["exp"] <= user_claims["exp"]
    assert claims["exp"] <= unverified(chat_token)["exp"]
    assert claims["nbf"] == claims["iat"]
    assert claims["jti"] != unverified(chat_token)["jti"]
    # Claims the user's token had and that are not carried stay behind.
    assert "azp" not in claims
    assert jwt.get_unverified_header(remediation_token)["kid"] == chain_sts.service.keys.kid


def test_answer_shape(chain_sts, chat_token, sa_token):
    response = chain_sts.exchange(chat_token, sa_token("comms-agent"))
    assert response.status_code == 200, response.text
    body = response.json()
    assert set(body) == {"access_token", "issued_token_type", "token_type", "expires_in"}
    assert body["issued_token_type"] == ACCESS_TOKEN_TYPE
    assert body["token_type"] == "Bearer"
    assert 0 < body["expires_in"] <= chain_sts.service.config.token_ttl_seconds
    assert response.headers["cache-control"] == "no-store"
    # No audience asked for: the first allowed one.
    assert chain_sts.verify_like_gateway(body["access_token"])["act"]["sub"] == COMMS


def test_access_token_types_accepted(chain_sts, user, sa_token):
    # Keycloak and most clients other than kagent's name both tokens this way.
    response = chain_sts.exchange(
        user,
        sa_token("chat-assistant"),
        subject_token_type=ACCESS_TOKEN_TYPE,
        actor_token_type=ACCESS_TOKEN_TYPE,
    )
    assert response.status_code == 200, response.text


def test_json_body_accepted(chain_sts, user, sa_token):
    # kagent's own mock STS takes JSON as well as a form.
    response = chain_sts.exchange(
        user, sa_token("chat-assistant"), as_json=True, audience=[AUDIENCE]
    )
    assert response.status_code == 200, response.text
    assert chain_sts.verify_like_gateway(response.json()["access_token"])["act"]["sub"] == CHAT


def test_json_body_that_is_not_an_object(chain_sts):
    response = httpx.post(
        chain_sts.metadata["token_endpoint"],
        content=b"[1, 2]",
        headers={"Content-Type": "application/json"},
    )
    assert refused(response)["error"] == "invalid_request"


def test_same_audience_as_audience_and_resource(chain_sts, user, sa_token):
    # kagent sends KAGENT_STS_AUDIENCE and KAGENT_STS_RESOURCE side by side.
    response = chain_sts.exchange(
        user, sa_token("chat-assistant"), audience=AUDIENCE, resource=AUDIENCE
    )
    assert response.status_code == 200, response.text
    assert unverified(response.json()["access_token"])["aud"] == AUDIENCE


# -- the actor's audience -----------------------------------------------------


def test_actor_with_the_api_servers_audience_refused_by_default(chain_sts, user, sa_token):
    # A pod's mounted token: the audience stock kagent sends.
    body = refused(chain_sts.exchange(user, sa_token("chat-assistant", audience=None)))
    assert body["error"] == "invalid_request"
    assert body["error_description"].startswith("actor_token did not verify")


def test_actor_with_the_api_servers_audience_when_accepted(
    start_sts, policy, actor_mode, user, sa_token
):
    raw = policy(actor_mode)
    raw["actor"]["audiences"] = ["chain-sts", "https://kubernetes.default.svc.cluster.local"]
    kagent_sts = start_sts(raw)
    response = kagent_sts.exchange(user, sa_token("chat-assistant", audience=None))
    assert response.status_code == 200, response.text
    assert kagent_sts.verify_like_gateway(response.json()["access_token"])["act"]["sub"] == CHAT
    # The dedicated audience still works beside it.
    assert kagent_sts.exchange(user, sa_token("chat-assistant")).status_code == 200


def test_actor_token_with_wrong_audience(chain_sts, actor_mode, user, sa_token):
    body = refused(chain_sts.exchange(user, sa_token("chat-assistant", audience="other")))
    assert body["error"] == "invalid_request"
    if actor_mode.startswith("jwks"):
        assert "InvalidAudienceError" in body["error_description"]
    else:
        # The API server's own words.
        assert "is invalid for the target audiences" in body["error_description"]


def test_expired_actor_token(chain_sts, user, sa_token):
    body = refused(chain_sts.exchange(user, sa_token("chat-assistant", lifetime=-120)))
    assert body["error"] == "invalid_request"
    assert body["error_description"].startswith("actor_token did not verify")


# -- refusals -----------------------------------------------------------------


def test_follower_on_users_own_token(chain_sts, user, sa_token):
    body = refused(chain_sts.exchange(user, sa_token("remediation-agent")))
    assert body["error"] == "unauthorized_client"
    assert "user's own token" in body["error_description"]


def test_follower_after_an_agent_it_may_not_follow(chain_sts, remediation_token, sa_token):
    # comms-agent may act only after chat-assistant.
    body = refused(chain_sts.exchange(remediation_token, sa_token("comms-agent")))
    assert body["error"] == "unauthorized_client"
    assert "after remediation-agent" in body["error_description"]


def test_max_chain_exceeded(start_sts, policy, actor_mode, user, sa_token):
    raw = policy(actor_mode)
    raw["max_chain"] = 1
    short = start_sts(raw)
    first = short.exchange(user, sa_token("chat-assistant"))
    assert first.status_code == 200, first.text
    body = refused(short.exchange(first.json()["access_token"], sa_token("remediation-agent")))
    assert body["error"] == "unauthorized_client"
    assert "exceed 1" in body["error_description"]


def test_an_agent_twice_in_the_chain(start_sts, policy, actor_mode, user, sa_token):
    # A policy that would allow a loop: chat-assistant may also follow remediation-agent.
    raw = policy(actor_mode)
    raw["agents"]["chat-assistant"]["after"] = ["remediation-agent"]
    looped = start_sts(raw)
    first = looped.exchange(user, sa_token("chat-assistant"))
    assert first.status_code == 200, first.text
    second = looped.exchange(first.json()["access_token"], sa_token("remediation-agent"))
    assert second.status_code == 200, second.text
    body = refused(looped.exchange(second.json()["access_token"], sa_token("chat-assistant")))
    assert body["error"] == "unauthorized_client"
    assert "already in the chain" in body["error_description"]


def test_no_actor_token(chain_sts, user):
    body = refused(chain_sts.exchange(user))
    assert body["error"] == "invalid_request"
    assert "only delegates" in body["error_description"]


def test_no_subject_token(chain_sts, sa_token):
    body = refused(chain_sts.exchange(None, sa_token("chat-assistant")))
    assert body == {"error": "invalid_request", "error_description": "subject_token is required"}


def test_unknown_service_account(chain_sts, user, sa_token):
    body = refused(chain_sts.exchange(user, sa_token("default", namespace="sample-app")))
    assert body["error"] == "unauthorized_client"


def test_tampered_subject_token(chain_sts, user, sa_token):
    header, _payload, signature = user.split(".")
    claims = unverified(user)
    claims["preferred_username"] = "incident-manager"
    forged = ".".join([header, b64url(json.dumps(claims).encode()), signature])
    body = refused(chain_sts.exchange(forged, sa_token("chat-assistant")))
    assert body["error"] == "invalid_request"
    assert "InvalidSignatureError" in body["error_description"]


def test_subject_from_an_issuer_not_trusted(chain_sts, user_token, sa_token):
    stranger = user_token(iss="https://idp.invalid/realms/demo")
    body = refused(chain_sts.exchange(stranger, sa_token("chat-assistant")))
    assert body["error"] == "invalid_request"
    assert "does not trust" in body["error_description"]


def test_subject_for_another_audience(chain_sts, user_token, sa_token):
    body = refused(chain_sts.exchange(user_token(aud="account"), sa_token("chat-assistant")))
    assert body["error"] == "invalid_request"
    assert "InvalidAudienceError" in body["error_description"]


def test_subject_for_chat_assistant_alone(chain_sts, user_token, sa_token):
    # A Chat UI sign-in: Keycloak's token for the audience chat-assistant.
    chat_ui = user_token("developer", aud="chat-assistant", azp="chat-ui")
    response = chain_sts.exchange(chat_ui, sa_token("chat-assistant"), audience=AUDIENCE)
    assert response.status_code == 200, response.text
    # Issued for the gateway, like any other first hop.
    claims = chain_sts.verify_like_gateway(response.json()["access_token"])
    assert claims["aud"] == AUDIENCE
    assert claims["act"] == {"sub": CHAT, "client_id": "chat-assistant"}


@pytest.mark.parametrize(
    ("account", "agent"),
    [
        ("remediation-agent", "remediation-agent"),
        ("comms-agent", "comms-agent"),
        ("default", "may-act-probe"),
    ],
)
def test_subject_for_chat_assistant_by_another_agent(
    chain_sts, user_token, sa_token, account, agent
):
    # The same token is refused to every agent whose subject_audiences do not
    # name chat-assistant, the probe too, which may act for users.
    chat_ui = user_token("platform-engineer", aud="chat-assistant", azp="chat-ui")
    body = refused(chain_sts.exchange(chat_ui, sa_token(account), audience=AUDIENCE))
    assert body["error"] == "invalid_request"
    assert body["error_description"] == (
        "subject_token did not verify: InvalidAudienceError, its audience is not one of"
        f" a user's token {agent} may exchange: ['{AUDIENCE}']"
    )


def test_subject_with_both_audiences(chain_sts, user_token, sa_token):
    # One audience the agent may exchange is enough.
    both = user_token(aud=["chat-assistant", AUDIENCE])
    assert chain_sts.exchange(both, sa_token("chat-assistant")).status_code == 200


def test_own_token_for_chat_assistant(chain_sts, user, sa_token):
    # subject_audiences are for a user's own token: this service's tokens keep
    # its own audiences, so a chain token for chat-assistant is not one.
    now = int(time.time())
    claims = {
        "iss": chain_sts.metadata["issuer"],
        "sub": unverified(user)["sub"],
        "aud": "chat-assistant",
        "iat": now,
        "nbf": now,
        "exp": now + 60,
        "jti": "test",
        "client_id": "chat-assistant",
        "act": {"sub": CHAT, "client_id": "chat-assistant"},
    }
    token = chain_sts.service.keys.sign(claims)
    body = refused(chain_sts.exchange(token, sa_token("remediation-agent")))
    assert body["error"] == "invalid_request"
    assert "its audience is not one of this service's tokens" in body["error_description"]


def test_subject_that_is_not_a_jwt(chain_sts, sa_token):
    body = refused(chain_sts.exchange("not-a-token", sa_token("chat-assistant")))
    assert body["error"] == "invalid_request"
    assert "not a JWT" in body["error_description"]


def test_identity_providers_token_that_already_names_an_actor(chain_sts, user_token, sa_token):
    # Keycloak's own one-agent delegation: not a link this service recorded.
    delegated = user_token(act={"client_id": "chat-assistant"})
    body = refused(chain_sts.exchange(delegated, sa_token("chat-assistant")))
    assert body["error"] == "invalid_request"
    assert "did not record" in body["error_description"]


def test_own_token_naming_no_agent_it_knows(chain_sts, user, sa_token):
    stranger = {"sub": "system:serviceaccount:elsewhere:someone", "client_id": "someone"}
    token = own_token(chain_sts, int(time.time()) + 60, user, act=stranger)
    body = refused(chain_sts.exchange(token, sa_token("remediation-agent")))
    assert body["error"] == "invalid_request"
    assert "names no agent" in body["error_description"]


def test_audience_not_allowed(chain_sts, user, sa_token):
    body = refused(chain_sts.exchange(user, sa_token("chat-assistant"), audience="somewhere-else"))
    assert body["error"] == "invalid_target"
    body = refused(
        chain_sts.exchange(
            user, sa_token("chat-assistant"), resource="https://somewhere.invalid/mcp"
        )
    )
    assert body["error"] == "invalid_target"


def test_wrong_grant_type(chain_sts, user, sa_token):
    response = chain_sts.exchange(user, sa_token("chat-assistant"), grant_type="client_credentials")
    assert refused(response)["error"] == "unsupported_grant_type"


def test_wrong_token_types(chain_sts, user, sa_token):
    saml = "urn:ietf:params:oauth:token-type:saml2"
    body = refused(chain_sts.exchange(user, sa_token("chat-assistant"), subject_token_type=saml))
    assert "subject_token_type" in body["error_description"]
    body = refused(chain_sts.exchange(user, sa_token("chat-assistant"), actor_token_type=saml))
    assert "actor_token_type" in body["error_description"]
    id_token = "urn:ietf:params:oauth:token-type:id_token"
    body = refused(
        chain_sts.exchange(user, sa_token("chat-assistant"), requested_token_type=id_token)
    )
    assert body["error_description"] == "only an access token can be issued"


def test_parameter_given_twice(chain_sts, user, sa_token):
    body = {
        "grant_type": TOKEN_EXCHANGE,
        "subject_token": [user, user],
        "subject_token_type": "urn:ietf:params:oauth:token-type:jwt",
        "actor_token": sa_token("chat-assistant"),
        "actor_token_type": "urn:ietf:params:oauth:token-type:jwt",
    }
    response = httpx.post(chain_sts.metadata["token_endpoint"], data=body)
    assert refused(response)["error_description"] == "subject_token was given more than once"


def test_body_too_large(chain_sts):
    response = httpx.post(
        chain_sts.metadata["token_endpoint"],
        content=b"subject_token=" + b"a" * (65 * 1024),
        headers={"Content-Type": "application/x-www-form-urlencoded"},
    )
    assert refused(response)["error_description"] == "the request body is too large"


def test_subject_expired_within_clock_skew(chain_sts, user, sa_token):
    # Within the 30 s skew allowance the subject still verifies, but a token
    # issued from it would be born expired.
    expired = own_token(chain_sts, int(time.time()) - 5, user)
    body = refused(chain_sts.exchange(expired, sa_token("remediation-agent")))
    assert body == {"error": "invalid_request", "error_description": "subject_token has expired"}
    # The same token, not yet expired, is exchanged: only the expiry refused it.
    fresh = own_token(chain_sts, int(time.time()) + 60, user)
    response = chain_sts.exchange(fresh, sa_token("remediation-agent"))
    assert response.status_code == 200, response.text
    assert response.json()["expires_in"] <= 60


def test_subject_expired_beyond_clock_skew(chain_sts, user_token, sa_token):
    expired = user_token(exp=int(time.time()) - 120)
    body = refused(chain_sts.exchange(expired, sa_token("chat-assistant")))
    assert body["error_description"] == "subject_token did not verify: ExpiredSignatureError"


@pytest.mark.parametrize("whose", ["subject", "actor"])
def test_keys_unavailable(start_sts, policy, actor_mode, user, sa_token, whose):
    raw = policy(actor_mode)
    if whose == "subject":
        raw["subject_issuers"][0]["jwks_url"] = unused_port_url("/certs")
    elif actor_mode.startswith("jwks"):
        raw["actor"]["jwks"] = {
            "issuer": raw["actor"]["jwks"]["issuer"],
            "jwks_url": unused_port_url(),
        }
    else:
        raw["actor"]["token_review"]["api_server"] = (
            unused_port_url().rstrip("/").replace("http:", "https:")
        )
    blind = start_sts(raw)
    body = refused(blind.exchange(user, sa_token("chat-assistant")), status=503)
    assert body["error"] == "temporarily_unavailable"
    assert f"{whose}_token" in body["error_description"]


# -- the endpoints around the exchange ----------------------------------------


@pytest.mark.parametrize(
    "path", ["/.well-known/oauth-authorization-server", "/.well-known/openid-configuration"]
)
def test_both_metadata_paths(chain_sts, path):
    response = httpx.get(f"{chain_sts.url}{path}")
    assert response.status_code == 200
    assert response.json() == chain_sts.metadata


def test_jwks_publishes_the_signing_key(chain_sts):
    keys = httpx.get(chain_sts.metadata["jwks_uri"]).json()["keys"]
    assert [k["kid"] for k in keys] == [chain_sts.service.keys.kid]
    assert {"kty", "use", "alg", "kid", "n", "e"} == set(keys[0])


def test_healthz(chain_sts):
    response = httpx.get(f"{chain_sts.url}/healthz")
    assert response.status_code == 200
    assert response.json() == {
        "status": "ok",
        "service": "chain-sts",
        "version": "0.1.0",
        # Which key signs, by its kid alone.
        "keys": {"signing": chain_sts.service.keys.kid},
    }


def test_other_paths_and_methods(chain_sts):
    response = httpx.get(f"{chain_sts.url}/nothing-here")
    assert (response.status_code, response.json()) == (404, {"error": "not_found"})
    response = httpx.get(chain_sts.metadata["token_endpoint"])
    assert (response.status_code, response.json()) == (405, {"error": "method_not_allowed"})
    assert response.headers["allow"] == "POST"


# -- audit --------------------------------------------------------------------


@pytest.fixture
def audit_lines(caplog):
    """The audit lines written since the last call, as the JSON log handler writes them."""
    caplog.set_level(logging.INFO, logger="chain_sts.audit")
    formatter = JsonFormatter()

    def lines() -> list[dict]:
        records = [r for r in caplog.records if r.name == "chain_sts.audit"]
        caplog.clear()
        found = []
        for record in records:
            line = formatter.format(record)
            assert "\n" not in line
            found.append(json.loads(line))
        return found

    return lines


def test_audit_line_for_issued(chain_sts, user, sa_token, audit_lines):
    audit_lines()
    response = chain_sts.exchange(user, sa_token("chat-assistant"))
    assert response.status_code == 200
    [line] = audit_lines()
    jti = unverified(response.json()["access_token"])["jti"]
    assert line["logger"] == "chain_sts.audit"
    assert line["event"] == "token_exchange"
    assert line["outcome"] == "issued"
    assert line["jti"] == jti
    assert line["user"] == "platform-engineer"
    assert line["chain"] == ["chat-assistant"]
    assert line["aud"] == AUDIENCE
    assert line["exp"] == unverified(response.json()["access_token"])["exp"]


def test_audit_line_for_issued_chain(chain_sts, chat_token, sa_token, audit_lines):
    audit_lines()
    assert chain_sts.exchange(chat_token, sa_token("remediation-agent")).status_code == 200
    [line] = audit_lines()
    assert line["chain"] == ["remediation-agent", "chat-assistant"]


def test_audit_lines_for_refusals_name_who_asked(chain_sts, user, sa_token, audit_lines):
    audit_lines()
    tampered = user[:-4] + ("AAAA" if not user.endswith("AAAA") else "BBBB")
    cases = [
        # (request, the fields the line must have, the fields it must not)
        (
            lambda: chain_sts.exchange(user),
            {"error": "invalid_request"},
            {"agent", "service_account", "user"},
        ),
        (
            lambda: chain_sts.exchange(user, sa_token("default", namespace="sample-app")),
            {
                "error": "unauthorized_client",
                "service_account": "system:serviceaccount:sample-app:default",
            },
            {"agent", "user"},
        ),
        (
            lambda: chain_sts.exchange(tampered, sa_token("chat-assistant")),
            {"error": "invalid_request", "agent": "chat-assistant", "service_account": CHAT},
            {"user"},
        ),
        (
            lambda: chain_sts.exchange(user, sa_token("remediation-agent")),
            {
                "error": "unauthorized_client",
                "agent": "remediation-agent",
                "service_account": REMEDIATION,
                "user": "platform-engineer",
            },
            set(),
        ),
        (
            lambda: httpx.post(
                chain_sts.metadata["token_endpoint"],
                content=b"{",
                headers={"Content-Type": "application/json"},
            ),
            {"error": "invalid_request"},
            {"agent", "user"},
        ),
    ]
    for request, present, absent in cases:
        response = request()
        assert response.status_code == 400, response.text
        lines = audit_lines()
        assert len(lines) == 1, lines
        [line] = lines
        assert line["event"] == "token_exchange"
        assert line["outcome"] == "refused"
        assert line["reason"] == response.json()["error_description"]
        assert present.items() <= line.items(), line
        assert not absent & line.keys(), line


def test_audit_line_for_an_unexpected_failure(
    start_sts, policy, actor_mode, user, sa_token, audit_lines, monkeypatch
):
    broken = start_sts(policy(actor_mode))

    async def fail(token):
        raise RuntimeError("boom")

    monkeypatch.setattr(broken.service, "_verify_subject", fail)
    audit_lines()
    body = refused(broken.exchange(user, sa_token("chat-assistant")), status=500)
    assert body == {"error": "server_error", "error_description": "the exchange failed"}
    [line] = audit_lines()
    assert line["outcome"] == "refused"
    assert line["error"] == "server_error"
    assert line["agent"] == "chat-assistant"
