"""comms-agent over A2A, with stand-ins for delivery-mcp, the model and chain-sts."""

from __future__ import annotations

import json
import os
import subprocess
import sys
import time
from pathlib import Path

import httpx
import jwt
import pytest
from a2a.types import Task
from conftest import (
    AUDIENCE,
    DELEGATION_AUDIENCE,
    DRAFT,
    DRAFT_REQUEST,
    JWT_TYPE,
    MODEL,
    MODEL_TIMEOUT_SECONDS,
    NOT_FOUND,
    TOKEN_EXCHANGE,
    Issuer,
    artifact_parts,
    free_port,
    rpc,
    stream,
)

from comms_agent.auth import TokenVerifier, user_of
from comms_agent.config import ConfigError, TrustedIssuer, load_settings
from comms_agent.delegation import ExchangeFailed, TokenExchange, token_exchange
from comms_agent.delivery import ALLOWED_TOOLS, open_delivery
from comms_agent.model import incident_facts, limit_words, word_count


async def send(http: httpx.AsyncClient, url: str, token: str) -> httpx.Response:
    """``message/send`` with this bearer token."""
    return await http.post(
        url, json=rpc("message/send", DRAFT_REQUEST), headers={"Authorization": f"Bearer {token}"}
    )


# -- discovery and liveness need no token -----------------------------------


async def test_agent_card(http, agent_url):
    card = (await http.get(f"{agent_url}/.well-known/agent-card.json")).json()
    assert card["name"] == "comms-agent"
    assert card["protocolVersion"] == "0.3.0"
    assert card["preferredTransport"] == "JSONRPC"
    assert card["capabilities"]["streaming"] is True
    assert [s["id"] for s in card["skills"]] == ["draft_status_update"]
    assert card["security"] == [{"bearer": []}]


async def test_healthz(http, agent_url):
    response = await http.get(f"{agent_url}/healthz")
    assert response.status_code == 200 and response.json()["status"] == "ok"


# -- a request needs the caller's token -------------------------------------


async def test_no_token_is_401_and_nothing_is_called(http, agent_url, delivery, model):
    response = await http.post(agent_url, json=rpc("message/send", DRAFT_REQUEST))
    assert response.status_code == 401
    assert delivery.calls == [] and model.requests == []


async def test_a_token_that_does_not_verify_is_401(http, agent_url, issuer, delivery, model):
    for overrides in ({"aud": "someone-else"}, {"exp": 1}, {"iss": "http://other"}):
        response = await http.post(
            agent_url,
            json=rpc("message/send", DRAFT_REQUEST),
            headers={"Authorization": f"Bearer {issuer.mint(**overrides)}"},
        )
        assert response.status_code == 401
    assert delivery.calls == [] and model.requests == []


# -- chain-sts's tokens -------------------------------------------------------
#
# A second issuer, with its own keys. A token is verified against the keys of
# the issuer it names, and must pass the same checks as Keycloak's.


async def test_a_chain_token_is_accepted_and_forwarded_as_is(
    http, agent_url, chain, delivery, model
):
    token = chain.delegate("incident-manager")
    events = await stream(http, agent_url, token, rpc("message/stream", DRAFT_REQUEST))
    assert events[-1]["status"]["state"] == "completed"
    assert [auth for _, _, auth in delivery.calls] == [f"Bearer {token}"]
    assert [r["headers"]["authorization"] for r in model.requests] == [f"Bearer {token}"]


@pytest.mark.parametrize(
    "overrides",
    [
        pytest.param({"aud": "someone-else"}, id="wrong audience"),
        pytest.param({"aud": None}, id="no audience"),
        pytest.param({"exp": 1}, id="expired"),
        pytest.param({"exp": None}, id="no expiry"),
        pytest.param({"nbf": int(time.time()) + 3600}, id="not valid yet"),
        pytest.param({"iss": "http://chain-sts.elsewhere.svc.cluster.local"}, id="unknown issuer"),
        pytest.param({"iss": None}, id="no issuer"),
    ],
)
async def test_a_chain_token_that_does_not_verify_is_401(
    http, agent_url, chain, delivery, model, overrides
):
    response = await send(http, agent_url, chain.delegate(**overrides))
    assert response.status_code == 401
    assert delivery.calls == [] and model.requests == []


@pytest.mark.parametrize(
    "aud",
    [
        pytest.param(AUDIENCE, id="the gateway's, as every chain token had before"),
        pytest.param("http://agentgateway-proxy.test/mcp/delivery", id="delivery-mcp's"),
        pytest.param("http://agentgateway-proxy.test/v1", id="the model route's"),
    ],
)
async def test_a_chain_token_for_another_target_is_401(
    http, agent_url, chain, delivery, model, aud
):
    # chain-sts issues each token for one target. One meant for somewhere else,
    # replayed here by whoever received it, is refused.
    response = await send(http, agent_url, chain.delegate(aud=aud))
    assert response.status_code == 401
    assert delivery.calls == [] and model.requests == []


async def test_a_keycloak_token_for_this_agents_resource_is_401(
    http, agent_url, issuer, delivery, model
):
    # Keycloak's tokens are for the gateway; DELEGATION_AUDIENCE is chain-sts's alone.
    response = await send(http, agent_url, issuer.mint(aud=DELEGATION_AUDIENCE))
    assert response.status_code == 401
    assert delivery.calls == [] and model.requests == []


def test_during_a_rollout_two_chain_audiences_are_accepted(issuer, chain):
    # DELEGATION_AUDIENCE "<own resource>,agentgateway": the old shared audience
    # and the new one, until the old one is dropped. Keycloak's is unchanged.
    rollout = load_settings(
        {
            **ENV,
            "OIDC_ISSUER": issuer.issuer,
            "OIDC_JWKS_URL": issuer.jwks_url,
            "DELEGATION_ISSUER": chain.issuer,
            "DELEGATION_JWKS_URL": chain.jwks_url,
            "DELEGATION_AUDIENCE": f"{DELEGATION_AUDIENCE}, {AUDIENCE}",
        }
    )
    assert rollout.delegation_audiences == (DELEGATION_AUDIENCE, AUDIENCE)
    verifier = TokenVerifier(issuers=rollout.trusted_issuers())
    for aud in (DELEGATION_AUDIENCE, AUDIENCE, [AUDIENCE, "elsewhere"]):
        assert verifier.verify(chain.delegate(aud=aud))["aud"] == aud
    with pytest.raises(jwt.InvalidAudienceError):
        verifier.verify(chain.delegate(aud="http://agentgateway-proxy.test/mcp/delivery"))
    assert verifier.verify(issuer.mint())["aud"] == AUDIENCE
    with pytest.raises(jwt.InvalidAudienceError):
        verifier.verify(issuer.mint(aud=DELEGATION_AUDIENCE))


async def test_a_token_from_an_issuer_that_is_not_configured_is_401(
    http, agent_url, delivery, model
):
    stranger = Issuer(kid="stranger-key")
    for token in (stranger.delegate(), stranger.mint("incident-manager")):
        assert (await send(http, agent_url, token)).status_code == 401
    assert delivery.calls == [] and model.requests == []


@pytest.mark.parametrize("kid", ["signer's", "named issuer's"])
async def test_a_token_signed_by_the_other_issuers_key_is_401(
    http, agent_url, issuer, chain, delivery, model, kid
):
    # Keycloak's issuer signed with chain-sts's key, and the other way round,
    # with the signer's kid or with the kid of the issuer the token names.
    for named, signer in ((issuer, chain), (chain, issuer)):
        claims = chain.delegated_claims(iss=named.issuer)
        token = signer.sign(claims, kid=signer.kid if kid == "signer's" else named.kid)
        assert (await send(http, agent_url, token)).status_code == 401, named.issuer
    assert delivery.calls == [] and model.requests == []


@pytest.mark.parametrize(
    "token",
    [
        pytest.param("not-a-jwt", id="one part"),
        pytest.param("a.b.c", id="not base64url JSON"),
        pytest.param("eyJhbGciOiJSUzI1NiJ9.WyJpc3MiXQ.c2ln", id="claims not an object"),
    ],
)
async def test_a_bearer_that_is_not_a_jwt_is_401(http, agent_url, delivery, model, token):
    assert (await send(http, agent_url, token)).status_code == 401
    assert delivery.calls == [] and model.requests == []


def test_without_the_delegation_bindings_only_keycloak_is_trusted(issuer, chain):
    verifier = TokenVerifier(issuers={issuer.issuer: TrustedIssuer(issuer.jwks_url, (AUDIENCE,))})
    assert verifier.verify(issuer.mint("incident-manager"))["preferred_username"] == (
        "incident-manager"
    )
    with pytest.raises(jwt.InvalidIssuerError):
        verifier.verify(chain.delegate())


def test_chain_sts_out_of_reach_leaves_keycloak_tokens_alone(issuer, chain):
    closed = f"http://127.0.0.1:{free_port()}/jwks"
    verifier = TokenVerifier(
        issuers={
            issuer.issuer: TrustedIssuer(issuer.jwks_url, (AUDIENCE,)),
            chain.issuer: TrustedIssuer(closed, (DELEGATION_AUDIENCE,)),
        }
    )
    assert verifier.verify(issuer.mint("incident-manager"))["preferred_username"] == (
        "incident-manager"
    )
    with pytest.raises(jwt.PyJWKClientConnectionError):
        verifier.verify(chain.delegate())


def test_a_delegated_tokens_user_is_never_the_agent(chain):
    claims = chain.delegated_claims("incident-manager")
    assert user_of(claims) == "incident-manager"
    del claims["preferred_username"]
    assert user_of(claims) == "incident-manager-id"
    assert user_of({"client_id": "alert-automation", "sub": "s-1"}) == "alert-automation"


ENV = {
    "OIDC_ISSUER": "http://localhost:18081/realms/demo",
    "OIDC_JWKS_URL": "http://keycloak/certs",
    "OIDC_AUDIENCE": AUDIENCE,
    "DELIVERY_MCP_URL": "http://gateway/mcp/delivery",
    "MODEL_BASE_URL": "http://gateway",
    "MODEL_ID": MODEL,
}
DELEGATION = {
    "DELEGATION_ISSUER": "http://chain-sts.chain-sts.svc.cluster.local",
    "DELEGATION_JWKS_URL": "http://chain-sts.chain-sts.svc.cluster.local/jwks",
    "DELEGATION_AUDIENCE": "http://gateway/a2a/comms-agent",
}
KEYCLOAK = TrustedIssuer(ENV["OIDC_JWKS_URL"], (AUDIENCE,))


def test_chain_sts_is_trusted_only_with_all_three_of_its_bindings():
    assert load_settings(ENV).trusted_issuers() == {ENV["OIDC_ISSUER"]: KEYCLOAK}
    assert load_settings({**ENV, **DELEGATION}).trusted_issuers() == {
        ENV["OIDC_ISSUER"]: KEYCLOAK,
        DELEGATION["DELEGATION_ISSUER"]: TrustedIssuer(
            DELEGATION["DELEGATION_JWKS_URL"], (DELEGATION["DELEGATION_AUDIENCE"],)
        ),
    }
    for absent in DELEGATION:
        given = next(name for name in DELEGATION if name != absent)
        with pytest.raises(ConfigError, match=f"{given} is set and {absent} is not"):
            load_settings({**ENV, **{k: v for k, v in DELEGATION.items() if k != absent}})
    with pytest.raises(ConfigError, match="DELEGATION_AUDIENCE names no audience"):
        load_settings({**ENV, **DELEGATION, "DELEGATION_AUDIENCE": " , "})


def test_each_target_is_asked_for_by_its_address():
    settings = load_settings(
        {
            **ENV,
            "DELIVERY_MCP_URL": "http://gateway/mcp/delivery/",
            "MODEL_BASE_URL": "http://gateway/",
        }
    )
    assert settings.delivery_resource == "http://gateway/mcp/delivery"
    # The model route's paths all start /v1; never the gateway's bare address.
    assert settings.model_resource == "http://gateway/v1"


def test_chain_sts_is_not_keycloak():
    same = {**DELEGATION, "DELEGATION_ISSUER": ENV["OIDC_ISSUER"]}
    with pytest.raises(ConfigError, match="DELEGATION_ISSUER must differ from OIDC_ISSUER"):
        load_settings({**ENV, **same})


# -- chain-sts's token exchange -----------------------------------------------
#
# With DELEGATION_METADATA_URL and DELEGATION_ACTOR_TOKEN_FILE set, the caller's
# token is exchanged once for each target, before its first call, and each
# target gets only the token chain-sts issued for it. Without them, as the
# tests above: it goes out as is.

EXCHANGE = {
    "DELEGATION_METADATA_URL": "http://chain-sts.chain-sts.svc.cluster.local"
    "/.well-known/oauth-authorization-server",
    "DELEGATION_ACTOR_TOKEN_FILE": "/var/run/secrets/chain-sts/token",
}


def test_the_exchange_is_made_only_with_both_of_its_bindings():
    assert token_exchange(load_settings(ENV)) is None
    # Trusting chain-sts's tokens and exchanging at chain-sts are set apart.
    assert token_exchange(load_settings({**ENV, **DELEGATION})) is None
    exchanging = load_settings({**ENV, **EXCHANGE})
    assert isinstance(token_exchange(exchanging), TokenExchange)
    assert exchanging.trusted_issuers() == {ENV["OIDC_ISSUER"]: KEYCLOAK}
    metadata_url, token_file = EXCHANGE
    for given, absent in ((metadata_url, token_file), (token_file, metadata_url)):
        with pytest.raises(ConfigError, match=f"{given} is set and {absent} is not"):
            load_settings({**ENV, **DELEGATION, given: EXCHANGE[given]})


def test_one_exchange_binding_alone_stops_the_start():
    env = {**ENV, "DELEGATION_METADATA_URL": EXCHANGE["DELEGATION_METADATA_URL"]}
    src = Path(__file__).parents[1] / "src"
    started = subprocess.run(
        [sys.executable, "-m", "comms_agent"],
        env={"PATH": os.environ.get("PATH", ""), "PYTHONPATH": str(src), **env},
        capture_output=True,
        text=True,
        timeout=60,
    )
    assert started.returncode == 2
    assert "DELEGATION_METADATA_URL is set and DELEGATION_ACTOR_TOKEN_FILE is not" in (
        started.stderr
    )


async def test_the_exchange_names_the_caller_this_agent_and_each_target(
    http, exchanging_agent_url, chain, sts, actor_token_file, delivery, model
):
    caller = chain.delegate(agents=("chat-assistant",))
    events = await stream(http, exchanging_agent_url, caller, rpc("message/stream", DRAFT_REQUEST))
    assert events[-1]["status"]["state"] == "completed"

    # One exchange per target, each of the caller's token, each naming the
    # target by its address as `resource` (RFC 8707).
    def form(resource: str) -> dict[str, list[str]]:
        return {
            "grant_type": [TOKEN_EXCHANGE],
            "subject_token": [caller],
            "subject_token_type": [JWT_TYPE],
            "actor_token": [actor_token_file.token],
            "actor_token_type": [JWT_TYPE],
            "resource": [resource],
        }

    assert sts.requests == [form(delivery.url), form(f"{model.url}/v1")]


async def test_each_target_gets_only_the_token_issued_for_it(
    http, exchanging_agent_url, issuer, sts, actor_token_file, delivery, model
):
    caller = issuer.mint("incident-manager")
    events = await stream(http, exchanging_agent_url, caller, rpc("message/stream", DRAFT_REQUEST))
    assert events[-1]["status"]["state"] == "completed"

    for_delivery, for_model = sts.issued
    assert caller not in sts.issued
    assert jwt.decode(for_delivery, options={"verify_signature": False})["aud"] == delivery.url
    assert jwt.decode(for_model, options={"verify_signature": False})["aud"] == f"{model.url}/v1"
    assert [auth for _, _, auth in delivery.calls] == [f"Bearer {for_delivery}"]
    assert [r["headers"]["authorization"] for r in model.requests] == [f"Bearer {for_model}"]


async def test_a_refused_exchange_for_the_model_writes_no_draft(
    http, exchanging_agent_url, issuer, sts, actor_token_file, delivery, model, caplog
):
    sts.refusals[f"{model.url}/v1"] = (
        400,
        {"error": "invalid_target", "error_description": "not an audience"},
    )
    caller = issuer.mint("incident-manager")
    events = await stream(http, exchanging_agent_url, caller, rpc("message/stream", DRAFT_REQUEST))

    text, data = artifact_parts(events)
    assert data["outcome"] == "error" and data["draft"] is None and data["posted"] is False
    assert text == (
        "No draft was written for INC-0001: chain-sts did not exchange the caller's token"
        " for the model (invalid_target)."
    )
    assert events[-1]["status"]["state"] == "failed"
    # The incident was read with delivery-mcp's own token; the model was not called.
    (for_delivery,) = sts.issued
    assert [auth for _, _, auth in delivery.calls] == [f"Bearer {for_delivery}"]
    assert model.requests == []
    (line,) = [r.getMessage() for r in caplog.records if r.name == "comms_agent.delegation"]
    assert "invalid_target" in line and f"{model.url}/v1" in line
    for token in (caller, for_delivery, actor_token_file.token):
        assert token not in line and token not in json.dumps(events)


async def test_the_actor_token_is_read_again_for_each_exchange(
    http, exchanging_agent_url, issuer, sts, actor_token_file, delivery, model
):
    first = actor_token_file.token
    await stream(http, exchanging_agent_url, issuer.mint(), rpc("message/stream", DRAFT_REQUEST))
    second = actor_token_file.rotate()
    await stream(http, exchanging_agent_url, issuer.mint(), rpc("message/stream", DRAFT_REQUEST))
    assert first != second
    # Two exchanges a task: delivery-mcp, then the model.
    assert [r["actor_token"] for r in sts.requests] == [[first], [first], [second], [second]]


@pytest.mark.parametrize(
    "refusal",
    [(400, "unauthorized_client"), (400, "invalid_request"), (503, "temporarily_unavailable")],
)
async def test_a_refused_exchange_fails_the_task_and_calls_nothing(
    http, exchanging_agent_url, issuer, sts, actor_token_file, delivery, model, caplog, refusal
):
    status, error = refusal
    sts.refusal = (status, {"error": error, "error_description": "comms-agent may not"})
    caller = issuer.mint("incident-manager")
    events = await stream(http, exchanging_agent_url, caller, rpc("message/stream", DRAFT_REQUEST))

    text, data = artifact_parts(events)
    assert data["outcome"] == "error" and data["draft"] is None and data["posted"] is False
    assert f"({error})" in text and "INC-0001 was not read" in text
    assert events[-1]["status"]["state"] == "failed"
    assert delivery.calls == [] and model.requests == []
    assert [r["resource"] for r in sts.requests] == [[delivery.url]]

    (line,) = [r.getMessage() for r in caplog.records if r.name == "comms_agent.delegation"]
    assert error in line
    for token in (caller, actor_token_file.token):
        assert token not in line and token not in json.dumps(events)


@pytest.mark.parametrize("content", ["", None], ids=["empty", "missing"])
async def test_without_an_actor_token_nothing_is_called(
    http, exchanging_agent_url, issuer, sts, actor_token_file, delivery, model, content
):
    if content is None:
        actor_token_file.path.unlink()
    else:
        actor_token_file.path.write_text(content)
    events = await stream(
        http, exchanging_agent_url, issuer.mint(), rpc("message/stream", DRAFT_REQUEST)
    )

    text, data = artifact_parts(events)
    assert data["outcome"] == "error" and "(actor_token_unreadable)" in text
    assert events[-1]["status"]["state"] == "failed"
    assert sts.requests == [] and delivery.calls == [] and model.requests == []


async def test_chain_sts_out_of_reach_is_a_network_error(actor_token_file):
    closed = f"http://127.0.0.1:{free_port()}/.well-known/oauth-authorization-server"
    exchange = TokenExchange(closed, str(actor_token_file.path))
    with pytest.raises(ExchangeFailed) as failed:
        await exchange.exchange("the-callers-token", "http://gateway/mcp/delivery")
    assert failed.value.error == "network_error"


@pytest.mark.parametrize(
    "body",
    [
        pytest.param({"token_type": "Bearer", "expires_in": 300}, id="no access_token"),
        pytest.param(
            {"access_token": "", "issued_token_type": "urn:ietf:params:oauth:token-type:jwt"},
            id="empty access_token",
        ),
    ],
)
async def test_an_answer_that_is_not_a_token_is_an_invalid_response(sts, actor_token_file, body):
    sts.refusal = (200, body)
    exchange = TokenExchange(sts.metadata_url, str(actor_token_file.path))
    with pytest.raises(ExchangeFailed) as failed:
        await exchange.exchange("the-callers-token", "http://gateway/mcp/delivery")
    assert failed.value.error == "invalid_response"


# -- draft_status_update ----------------------------------------------------


async def test_draft_is_returned_and_never_posted(http, agent_url, issuer, delivery, model):
    token = issuer.mint("incident-manager")
    events = await stream(http, agent_url, token, rpc("message/stream", DRAFT_REQUEST))

    assert events[0]["kind"] == "task"
    assert events[-1]["status"]["state"] == "completed" and events[-1]["final"] is True

    text, data = artifact_parts(events)
    assert text == DRAFT and data["draft"] == DRAFT
    assert data["action"] == "draft_status_update" and data["incident_id"] == "INC-0001"
    assert data["outcome"] == "drafted" and data["posted"] is False
    assert data["word_count"] == word_count(DRAFT) <= 80 and data["shortened"] is False
    assert data["incident_status"] == "resolved"

    # It read the incident once, and called nothing else.
    assert [(tool, args) for tool, args, _ in delivery.calls] == [
        ("get_incident", {"incident_id": "INC-0001"})
    ]


async def test_the_callers_token_goes_out_on_every_call(http, agent_url, issuer, delivery, model):
    token = issuer.mint("incident-manager")
    await stream(http, agent_url, token, rpc("message/stream", DRAFT_REQUEST))

    assert [auth for _, _, auth in delivery.calls] == [f"Bearer {token}"]

    (request,) = model.requests  # one model call
    assert request["path"] == "/v1/messages"
    assert request["headers"]["authorization"] == f"Bearer {token}"
    assert request["headers"]["anthropic-version"] == "2023-06-01"
    assert "x-api-key" not in request["headers"]
    assert request["body"]["model"] == MODEL
    # The model has no tools: it can word a draft and do nothing else.
    assert not request["body"].get("tools")
    prompt = request["body"]["messages"][0]["content"][0]["text"]
    assert "Every search fails" in prompt and "2.0.0" in prompt
    # People's names are not given to the model.
    assert "platform-engineer" not in prompt and "incident-manager" not in prompt


async def test_a_long_answer_is_cut_to_80_words(http, agent_url, issuer, delivery, model):
    model.text = " ".join(["Search is working again."] * 40)  # 160 words
    events = await stream(http, agent_url, issuer.mint(), rpc("message/stream", DRAFT_REQUEST))
    text, data = artifact_parts(events)
    assert word_count(text) == 80 and data["word_count"] == 80
    assert data["shortened"] is True and text.endswith("again.")
    assert events[-1]["status"]["state"] == "completed"


async def test_an_error_from_the_service_is_passed_back_intact(
    http, agent_url, issuer, delivery, model
):
    delivery.error = dict(NOT_FOUND)
    body = rpc("message/stream", json.dumps({"action": ACTION, "incident_id": "INC-9999"}))
    events = await stream(http, agent_url, issuer.mint(), body)

    text, data = artifact_parts(events)
    assert data["refusal"] == NOT_FOUND
    assert data["outcome"] == "error" and data["draft"] is None and data["posted"] is False
    assert text == NOT_FOUND["message"]
    assert events[-1]["status"]["state"] == "failed"
    assert model.requests == []  # nothing is drafted about an incident that was not read


async def test_no_draft_when_the_model_is_down(http, agent_url, issuer, delivery, model):
    model.status = 500
    events = await stream(http, agent_url, issuer.mint(), rpc("message/stream", DRAFT_REQUEST))
    text, data = artifact_parts(events)
    assert data["outcome"] == "error" and data["draft"] is None
    assert "model call failed" in text
    assert events[-1]["status"]["state"] == "failed"


async def test_a_model_that_does_not_answer_fails_the_draft_at_the_deadline(
    http, agent_url, issuer, delivery, model
):
    model.delay_seconds = 4 * MODEL_TIMEOUT_SECONDS
    started = time.monotonic()
    events = await stream(http, agent_url, issuer.mint(), rpc("message/stream", DRAFT_REQUEST))
    elapsed = time.monotonic() - started

    text, data = artifact_parts(events)
    assert data["outcome"] == "error" and data["draft"] is None and data["posted"] is False
    assert "did not answer within 2 seconds" in text
    assert events[-1]["status"]["state"] == "failed"
    # One deadline for the whole model call: no second attempt after the first timed out.
    assert len(model.requests) == 1
    assert elapsed < 1.5 * MODEL_TIMEOUT_SECONDS


async def test_a_throttled_model_is_not_waited_for(http, agent_url, issuer, delivery, model):
    # Strands' default answers a 429 by backing off for 4, 8, 16, 32 and 64 seconds.
    model.status = 429
    started = time.monotonic()
    events = await stream(http, agent_url, issuer.mint(), rpc("message/stream", DRAFT_REQUEST))
    elapsed = time.monotonic() - started

    text, data = artifact_parts(events)
    assert data["outcome"] == "error" and data["draft"] is None
    assert "No draft was written" in text
    assert events[-1]["status"]["state"] == "failed"
    assert elapsed < 1.5 * MODEL_TIMEOUT_SECONDS


async def test_message_send_returns_the_finished_task(http, agent_url, issuer, delivery, model):
    response = await http.post(
        agent_url,
        json=rpc("message/send", data={"action": ACTION, "incident_id": "INC-0001"}),
        headers={"Authorization": f"Bearer {issuer.mint()}"},
    )
    task = Task.model_validate(response.json()["result"])
    assert task.status.state.value == "completed"
    (artifact,) = task.artifacts or []
    assert artifact.name == "status_update_draft"


@pytest.mark.parametrize(
    "text",
    [
        "write something nice",
        '{"action": "post_status_update", "incident_id": "INC-0001", "text": "hello"}',
        '{"action": "draft_status_update"}',
    ],
)
async def test_anything_else_is_an_invalid_request(http, agent_url, issuer, delivery, model, text):
    response = await http.post(
        agent_url,
        json=rpc("message/send", text),
        headers={"Authorization": f"Bearer {issuer.mint()}"},
    )
    assert response.json()["error"]["code"] == -32602
    assert delivery.calls == [] and model.requests == []


# -- the parts --------------------------------------------------------------

ACTION = "draft_status_update"


async def test_the_delivery_client_can_read_and_cannot_post(issuer, delivery):
    assert ALLOWED_TOOLS == {"get_incident"}
    async with open_delivery(delivery.url, issuer.mint()) as client:
        with pytest.raises(ValueError, match="not a tool this agent calls"):
            await client.call("post_status_update", {"incident_id": "INC-0001", "text": "x"})
    assert delivery.calls == []


def test_limit_words():
    assert limit_words("One two three.", 80) == ("One two three.", False)
    assert limit_words("  spread\nover   lines ", 80) == ("spread over lines", False)
    # Cut at the last whole sentence that fits.
    assert limit_words("One two. Three four five. Six seven.", 6) == (
        "One two. Three four five.",
        True,
    )
    # No sentence fits: cut at the limit.
    assert limit_words("one two three four five", 3) == ("one two three", True)
    text, cut = limit_words(" ".join(f"w{i}" for i in range(200)), 80)
    assert cut and word_count(text) == 80


def test_incident_facts_leave_out_names():
    from conftest import INCIDENT

    facts = incident_facts(INCIDENT)
    flat = json.dumps(facts)
    for name in ("developer", "incident-manager", "platform-engineer", "alert-automation"):
        assert name not in flat
    assert facts["latest_change"]["to_version"] == "2.0.0"
