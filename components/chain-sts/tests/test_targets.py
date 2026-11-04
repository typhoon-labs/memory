"""A token per target: `audiences` lists several, and each token is for the one asked for.

As the dev cluster runs it: each gateway route that takes this service's
tokens is a target, named by its URL, and during a rollout the one audience
every token used to carry is listed too. Each test runs with every actor check.
"""

from __future__ import annotations

import httpx
import jwt
import pytest
from conftest import AUDIENCE, CHAT, REMEDIATION, unverified

GATEWAY = "http://agentgateway-proxy.agentgateway-system.svc.cluster.local"
DELIVERY = f"{GATEWAY}/mcp/delivery"
REMEDIATION_ROUTE = f"{GATEWAY}/a2a/remediation-agent"
MODEL = f"{GATEWAY}/v1"
TARGETS = [DELIVERY, REMEDIATION_ROUTE, f"{GATEWAY}/a2a/comms-agent", MODEL]
# The two policies below are one service before and after the drop: one
# issuer, and the same key (the tests' one signing key file).
ISSUER = "http://chain-sts.targets.test"


def refused(response: httpx.Response) -> dict:
    assert response.status_code == 400, response.text
    return response.json()


@pytest.fixture(scope="module")
def per_target(start_sts, policy, actor_mode):
    """Only the targets: the policy once the shared audience is dropped."""
    raw = policy(actor_mode)
    raw["audiences"] = TARGETS
    return start_sts(raw, issuer=ISSUER)


@pytest.fixture(scope="module")
def rollout(start_sts, policy, actor_mode):
    """The shared audience first, then the targets: the policy during the rollout."""
    raw = policy(actor_mode)
    raw["audiences"] = [AUDIENCE, *TARGETS]
    return start_sts(raw, issuer=ISSUER)


@pytest.fixture(scope="module")
def user(user_token) -> str:
    return user_token("platform-engineer")


def issued(response: httpx.Response) -> str:
    assert response.status_code == 200, response.text
    return response.json()["access_token"]


def test_the_token_is_for_the_target_named(per_target, user, sa_token):
    token = issued(
        per_target.exchange(user, sa_token("chat-assistant"), resource=REMEDIATION_ROUTE)
    )
    assert per_target.verify_like_gateway(token, audience=REMEDIATION_ROUTE)["aud"] == (
        REMEDIATION_ROUTE
    )
    # Checked as the gateway checks it on another route: not for that one.
    for elsewhere in (DELIVERY, MODEL, AUDIENCE):
        with pytest.raises(jwt.InvalidAudienceError):
            per_target.verify_like_gateway(token, audience=elsewhere)


def test_audience_names_a_target_as_resource_does(per_target, user, sa_token):
    token = issued(per_target.exchange(user, sa_token("chat-assistant"), audience=DELIVERY))
    assert unverified(token)["aud"] == DELIVERY
    both = issued(
        per_target.exchange(user, sa_token("chat-assistant"), audience=DELIVERY, resource=DELIVERY)
    )
    assert unverified(both)["aud"] == DELIVERY


def test_an_agent_exchanges_the_token_for_its_own_route(per_target, user, sa_token):
    # What remediation-agent is called with, exchanged for what it calls next.
    received = issued(
        per_target.exchange(user, sa_token("chat-assistant"), resource=REMEDIATION_ROUTE)
    )
    token = issued(per_target.exchange(received, sa_token("remediation-agent"), resource=DELIVERY))
    claims = per_target.verify_like_gateway(token, audience=DELIVERY)
    assert claims["act"]["sub"] == REMEDIATION and claims["act"]["act"]["sub"] == CHAT


@pytest.mark.parametrize(
    "params",
    [
        pytest.param({}, id="none"),
        pytest.param({"resource": [DELIVERY, MODEL]}, id="two resources"),
        pytest.param({"audience": DELIVERY, "resource": MODEL}, id="one of each"),
    ],
)
def test_a_request_must_name_one_target(per_target, user, sa_token, params):
    body = refused(per_target.exchange(user, sa_token("chat-assistant"), **params))
    assert body["error"] == "invalid_target"
    assert "name one target" in body["error_description"]


def test_a_target_not_listed_is_refused(per_target, user, sa_token):
    body = refused(per_target.exchange(user, sa_token("chat-assistant"), resource=f"{GATEWAY}/x"))
    assert body["error"] == "invalid_target"


def test_after_the_drop_the_shared_audience_is_neither_issued_nor_taken(
    per_target, rollout, user, sa_token
):
    body = refused(per_target.exchange(user, sa_token("chat-assistant"), audience=AUDIENCE))
    assert body["error"] == "invalid_target"
    # A token for the shared audience from before the drop, as a subject.
    old = issued(rollout.exchange(user, sa_token("chat-assistant"), audience=AUDIENCE))
    body = refused(per_target.exchange(old, sa_token("remediation-agent"), resource=DELIVERY))
    assert body["error"] == "invalid_request"
    assert "InvalidAudienceError" in body["error_description"]


def test_during_the_rollout_old_and_new_tokens_pass_each_other(rollout, user, sa_token):
    # An agent not yet updated asks for the shared audience; one that is asks
    # for a target. Each may exchange the other's token.
    old = issued(rollout.exchange(user, sa_token("chat-assistant"), audience=AUDIENCE))
    new = issued(rollout.exchange(old, sa_token("remediation-agent"), resource=DELIVERY))
    assert unverified(new)["aud"] == DELIVERY
    received = issued(
        rollout.exchange(user, sa_token("chat-assistant"), resource=REMEDIATION_ROUTE)
    )
    again = issued(rollout.exchange(received, sa_token("remediation-agent"), audience=AUDIENCE))
    assert unverified(again)["aud"] == AUDIENCE
    # Naming no target is refused here too: the policy lists several.
    assert refused(rollout.exchange(user, sa_token("chat-assistant")))["error"] == (
        "invalid_target"
    )
