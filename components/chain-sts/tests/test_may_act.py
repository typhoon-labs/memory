"""`may_act`: the user's token names the agent allowed to act first."""

from __future__ import annotations

from conftest import CHAT, PROBE, unverified


def test_named_by_service_account(chain_sts, user_token, sa_token):
    # kagent's convention: may_act.sub is the agent's service account.
    user = user_token(may_act={"sub": CHAT})
    response = chain_sts.exchange(user, sa_token("chat-assistant"))
    assert response.status_code == 200, response.text
    claims = chain_sts.verify_like_gateway(response.json()["access_token"])
    assert claims["act"] == {"sub": CHAT, "client_id": "chat-assistant"}
    assert claims["sub"] == unverified(user)["sub"]
    # may_act was the user's word about the first hop; it is not carried on.
    assert "may_act" not in claims


def test_named_by_client_id(chain_sts, user_token, sa_token):
    # Keycloak's delegation names the client.
    user = user_token(may_act={"client_id": "chat-assistant"})
    response = chain_sts.exchange(user, sa_token("chat-assistant"))
    assert response.status_code == 200, response.text


def test_agent_not_named_refused(chain_sts, user_token, sa_token):
    probe = sa_token("default")  # may-act-probe: may act for users
    # On a token without may_act the probe is accepted, so the refusal below
    # is may_act's doing.
    control = chain_sts.exchange(user_token(), probe)
    assert control.status_code == 200, control.text

    response = chain_sts.exchange(user_token(may_act={"sub": CHAT}), probe)
    assert response.status_code == 400, response.text
    body = response.json()
    assert body["error"] == "invalid_request"
    assert body["error_description"] == "may_act in subject_token does not name may-act-probe"


def test_may_act_that_is_not_an_object(chain_sts, user_token, sa_token):
    response = chain_sts.exchange(user_token(may_act=PROBE), sa_token("default"))
    assert response.status_code == 400, response.text
    assert "may_act" in response.json()["error_description"]


def test_required(start_sts, policy, actor_mode, user_token, sa_token):
    raw = policy(actor_mode)
    raw["require_may_act"] = True
    strict = start_sts(raw)
    response = strict.exchange(user_token(), sa_token("chat-assistant"))
    assert response.status_code == 400, response.text
    assert response.json() == {
        "error": "invalid_request",
        "error_description": "subject_token carries no may_act",
    }
    first = strict.exchange(user_token(may_act={"sub": CHAT}), sa_token("chat-assistant"))
    assert first.status_code == 200, first.text
    # may_act is about the user's own token: the next agent needs none.
    second = strict.exchange(first.json()["access_token"], sa_token("remediation-agent"))
    assert second.status_code == 200, second.text
