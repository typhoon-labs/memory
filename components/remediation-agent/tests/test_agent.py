"""remediation-agent over A2A, with stand-ins for delivery-mcp, the model and chain-sts."""

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
from a2a.types import Task, TaskArtifactUpdateEvent, TaskStatusUpdateEvent
from conftest import (
    APPLY,
    AUDIENCE,
    FAST_MODEL,
    JWT_TYPE,
    MODEL_TIMEOUT_SECONDS,
    REFUSAL,
    TOKEN_EXCHANGE,
    Issuer,
    artifact_parts,
    free_port,
    rpc,
    stream,
)

from remediation_agent.auth import TokenVerifier, user_of
from remediation_agent.config import ConfigError, load_settings
from remediation_agent.delegation import ExchangeFailed, TokenExchange, token_exchange
from remediation_agent.delivery import open_delivery
from remediation_agent.model import template_result, two_sentences


async def send(http: httpx.AsyncClient, url: str, token: str) -> httpx.Response:
    """``message/send`` with this bearer token."""
    return await http.post(
        url, json=rpc("message/send", APPLY), headers={"Authorization": f"Bearer {token}"}
    )


# -- discovery and liveness need no token -----------------------------------


async def test_agent_card(http, agent_url):
    card = (await http.get(f"{agent_url}/.well-known/agent-card.json")).json()
    assert card["name"] == "remediation-agent"
    assert card["protocolVersion"] == "0.3.0"
    assert card["preferredTransport"] == "JSONRPC"
    assert card["capabilities"]["streaming"] is True
    assert card["url"].startswith("http://localhost:")
    assert [s["id"] for s in card["skills"]] == ["apply_and_verify"]
    assert card["securitySchemes"]["bearer"]["scheme"] == "bearer"
    assert card["security"] == [{"bearer": []}]


async def test_healthz(http, agent_url):
    response = await http.get(f"{agent_url}/healthz")
    assert response.status_code == 200
    assert response.json()["status"] == "ok"


# -- a request needs the caller's token -------------------------------------


async def test_no_token_is_401_and_nothing_is_called(http, agent_url, delivery, model):
    response = await http.post(agent_url, json=rpc("message/send", APPLY))
    assert response.status_code == 401
    assert response.headers["www-authenticate"].startswith("Bearer")
    assert delivery.calls == [] and model.requests == []


@pytest.mark.parametrize(
    "overrides",
    [
        pytest.param({"aud": "someone-else"}, id="wrong audience"),
        pytest.param({"iss": "http://localhost:18081/realms/other"}, id="wrong issuer"),
        pytest.param({"exp": 1}, id="expired"),
        pytest.param({"exp": None}, id="no expiry"),
    ],
)
async def test_a_token_that_does_not_verify_is_401(
    http, agent_url, issuer, delivery, model, overrides
):
    response = await http.post(
        agent_url,
        json=rpc("message/send", APPLY),
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
    token = chain.delegate("platform-engineer")
    events = await stream(http, agent_url, token, rpc("message/stream", APPLY))
    assert events[-1]["status"]["state"] == "completed"
    assert delivery.calls and all(auth == f"Bearer {token}" for _, _, auth in delivery.calls)
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


async def test_a_token_from_an_issuer_that_is_not_configured_is_401(
    http, agent_url, delivery, model
):
    stranger = Issuer(kid="stranger-key")
    for token in (stranger.delegate(), stranger.mint()):
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
    verifier = TokenVerifier(issuers={issuer.issuer: issuer.jwks_url}, audience=AUDIENCE)
    assert verifier.verify(issuer.mint())["preferred_username"] == "platform-engineer"
    with pytest.raises(jwt.InvalidIssuerError):
        verifier.verify(chain.delegate())


def test_chain_sts_out_of_reach_leaves_keycloak_tokens_alone(issuer, chain):
    closed = f"http://127.0.0.1:{free_port()}/jwks"
    verifier = TokenVerifier(
        issuers={issuer.issuer: issuer.jwks_url, chain.issuer: closed}, audience=AUDIENCE
    )
    assert verifier.verify(issuer.mint())["preferred_username"] == "platform-engineer"
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
    "MODEL_ID_FAST": FAST_MODEL,
}
DELEGATION = {
    "DELEGATION_ISSUER": "http://chain-sts.chain-sts.svc.cluster.local",
    "DELEGATION_JWKS_URL": "http://chain-sts.chain-sts.svc.cluster.local/jwks",
}


def test_chain_sts_is_trusted_only_with_both_of_its_bindings():
    assert load_settings(ENV).trusted_issuers() == {ENV["OIDC_ISSUER"]: ENV["OIDC_JWKS_URL"]}
    assert load_settings({**ENV, **DELEGATION}).trusted_issuers() == {
        ENV["OIDC_ISSUER"]: ENV["OIDC_JWKS_URL"],
        DELEGATION["DELEGATION_ISSUER"]: DELEGATION["DELEGATION_JWKS_URL"],
    }
    issuer, jwks_url = DELEGATION
    for given, absent in ((issuer, jwks_url), (jwks_url, issuer)):
        with pytest.raises(ConfigError, match=f"{given} is set and {absent} is not"):
            load_settings({**ENV, given: DELEGATION[given]})


def test_chain_sts_is_not_keycloak():
    same = {**DELEGATION, "DELEGATION_ISSUER": ENV["OIDC_ISSUER"]}
    with pytest.raises(ConfigError, match="DELEGATION_ISSUER must differ from OIDC_ISSUER"):
        load_settings({**ENV, **same})


# -- chain-sts's token exchange -----------------------------------------------
#
# With DELEGATION_METADATA_URL and DELEGATION_ACTOR_TOKEN_FILE set, the caller's
# token is exchanged once per task, before the first call, and only the token
# chain-sts issued goes out. Without them, as the tests above: it goes out as is.

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
    assert exchanging.trusted_issuers() == {ENV["OIDC_ISSUER"]: ENV["OIDC_JWKS_URL"]}
    metadata_url, token_file = EXCHANGE
    for given, absent in ((metadata_url, token_file), (token_file, metadata_url)):
        with pytest.raises(ConfigError, match=f"{given} is set and {absent} is not"):
            load_settings({**ENV, **DELEGATION, given: EXCHANGE[given]})


def test_one_exchange_binding_alone_stops_the_start():
    env = {**ENV, "DELEGATION_METADATA_URL": EXCHANGE["DELEGATION_METADATA_URL"]}
    src = Path(__file__).parents[1] / "src"
    started = subprocess.run(
        [sys.executable, "-m", "remediation_agent"],
        env={"PATH": os.environ.get("PATH", ""), "PYTHONPATH": str(src), **env},
        capture_output=True,
        text=True,
        timeout=60,
    )
    assert started.returncode == 2
    assert "DELEGATION_METADATA_URL is set and DELEGATION_ACTOR_TOKEN_FILE is not" in (
        started.stderr
    )


async def test_the_exchange_names_the_caller_this_agent_and_the_audience(
    http, exchanging_agent_url, chain, sts, actor_token_file, delivery, model
):
    caller = chain.delegate(agents=("chat-assistant",))
    events = await stream(http, exchanging_agent_url, caller, rpc("message/stream", APPLY))
    assert events[-1]["status"]["state"] == "completed"

    (request,) = sts.requests  # one exchange for the whole task
    assert request == {
        "grant_type": [TOKEN_EXCHANGE],
        "subject_token": [caller],
        "subject_token_type": [JWT_TYPE],
        "actor_token": [actor_token_file.token],
        "actor_token_type": [JWT_TYPE],
        "audience": [AUDIENCE],
    }


async def test_only_the_issued_token_goes_out(
    http, exchanging_agent_url, issuer, sts, actor_token_file, delivery, model
):
    caller = issuer.mint("platform-engineer")
    events = await stream(http, exchanging_agent_url, caller, rpc("message/stream", APPLY))
    assert events[-1]["status"]["state"] == "completed"

    (issued,) = sts.issued
    assert issued != caller
    assert [auth for _, _, auth in delivery.calls] == [f"Bearer {issued}"] * 3
    assert [r["headers"]["authorization"] for r in model.requests] == [f"Bearer {issued}"]


async def test_the_actor_token_is_read_again_for_each_exchange(
    http, exchanging_agent_url, issuer, sts, actor_token_file, delivery, model
):
    first = actor_token_file.token
    await stream(http, exchanging_agent_url, issuer.mint(), rpc("message/stream", APPLY))
    second = actor_token_file.rotate()
    await stream(http, exchanging_agent_url, issuer.mint(), rpc("message/stream", APPLY))
    assert first != second
    assert [r["actor_token"] for r in sts.requests] == [[first], [second]]


@pytest.mark.parametrize(
    "refusal",
    [(400, "unauthorized_client"), (400, "invalid_request"), (503, "temporarily_unavailable")],
)
async def test_a_refused_exchange_fails_the_task_and_calls_nothing(
    http, exchanging_agent_url, issuer, sts, actor_token_file, delivery, model, caplog, refusal
):
    status, error = refusal
    sts.refusal = (status, {"error": error, "error_description": "remediation-agent may not"})
    caller = issuer.mint()
    events = await stream(http, exchanging_agent_url, caller, rpc("message/stream", APPLY))

    text, data = artifact_parts(events)
    assert data["outcome"] == "error" and data["change"] is None
    assert f"({error})" in text and "apply_change was not called" in text
    assert events[-1]["status"]["state"] == "failed"
    assert delivery.calls == [] and model.requests == []

    (line,) = [r.getMessage() for r in caplog.records if r.name == "remediation_agent.delegation"]
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
    events = await stream(http, exchanging_agent_url, issuer.mint(), rpc("message/stream", APPLY))

    text, data = artifact_parts(events)
    assert data["outcome"] == "error" and "(actor_token_unreadable)" in text
    assert events[-1]["status"]["state"] == "failed"
    assert sts.requests == [] and delivery.calls == [] and model.requests == []


async def test_chain_sts_out_of_reach_is_a_network_error(actor_token_file):
    closed = f"http://127.0.0.1:{free_port()}/.well-known/oauth-authorization-server"
    exchange = TokenExchange(closed, str(actor_token_file.path), audience=AUDIENCE)
    with pytest.raises(ExchangeFailed) as failed:
        await exchange.exchange("the-callers-token")
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
    exchange = TokenExchange(sts.metadata_url, str(actor_token_file.path), audience=AUDIENCE)
    with pytest.raises(ExchangeFailed) as failed:
        await exchange.exchange("the-callers-token")
    assert failed.value.error == "invalid_response"


# -- apply_and_verify -------------------------------------------------------


async def test_apply_and_verify_streams_each_stage_and_reports_the_result(
    http, agent_url, issuer, delivery, model
):
    token = issuer.mint("platform-engineer")
    events = await stream(http, agent_url, token, rpc("message/stream", APPLY))

    # Every event is a valid A2A 0.3 object.
    kinds = [e["kind"] for e in events]
    assert kinds[0] == "task" and Task.model_validate(events[0])
    for event in events[1:]:
        model_type = (
            TaskArtifactUpdateEvent if event["kind"] == "artifact-update" else TaskStatusUpdateEvent
        )
        model_type.model_validate(event)

    # The stages, in order, each as its own status update while the task is working.
    stages = [
        part["data"]["status"]
        for e in events
        if e["kind"] == "status-update" and e["status"]["state"] == "working"
        for part in e["status"]["message"]["parts"]
        if part["kind"] == "data"
    ]
    assert stages == ["applying", "verifying", "applied"]

    final = events[-1]
    assert final["kind"] == "status-update" and final["final"] is True
    assert final["status"]["state"] == "completed"

    text, data = artifact_parts(events)
    assert text == model.text
    assert data["action"] == "apply_and_verify" and data["change_id"] == "CHG-0001"
    assert data["outcome"] == "applied" and data["status"] == "applied"
    assert data["refusal"] is None and data["phrased_by"] == "model"
    assert data["change"]["applied_by"] == "platform-engineer"

    # Code called apply_change once, then only read the incident.
    assert [call[0] for call in delivery.calls] == ["apply_change", "get_incident", "get_incident"]
    assert delivery.calls[0][1] == {"change_id": "CHG-0001"}


async def test_the_callers_token_goes_out_on_every_call(http, agent_url, issuer, delivery, model):
    token = issuer.mint("platform-engineer")
    await stream(http, agent_url, token, rpc("message/stream", APPLY))

    assert delivery.calls and all(auth == f"Bearer {token}" for _, _, auth in delivery.calls)

    (request,) = model.requests  # one model call, to word the result
    assert request["path"] == "/v1/messages"
    assert request["headers"]["authorization"] == f"Bearer {token}"
    assert request["headers"]["anthropic-version"] == "2023-06-01"
    assert "x-api-key" not in request["headers"]
    assert request["body"]["model"] == FAST_MODEL
    assert "tools" not in request["body"] or request["body"]["tools"] == []
    # The model is given the facts code established, and nothing to decide.
    assert "CHG-0001" in request["body"]["messages"][0]["content"][0]["text"]


async def test_a_provider_key_in_the_environment_is_not_sent(
    http, agent_url, issuer, delivery, model, monkeypatch
):
    monkeypatch.setenv("ANTHROPIC_API_KEY", "sk-should-never-leave")
    monkeypatch.setenv("ANTHROPIC_AUTH_TOKEN", "should-never-leave")
    token = issuer.mint("platform-engineer")
    await stream(http, agent_url, token, rpc("message/stream", APPLY))
    (request,) = model.requests
    assert "x-api-key" not in request["headers"]
    assert request["headers"]["authorization"] == f"Bearer {token}"


async def test_two_callers_at_once_keep_their_own_tokens(http, agent_url, issuer, delivery, model):
    import asyncio

    first, second = issuer.mint("platform-engineer"), issuer.mint("second-engineer")
    await asyncio.gather(
        stream(http, agent_url, first, rpc("message/stream", APPLY)),
        stream(http, agent_url, second, rpc("message/stream", APPLY)),
    )
    sent_to_model = sorted(r["headers"]["authorization"] for r in model.requests)
    assert sent_to_model == sorted([f"Bearer {first}", f"Bearer {second}"])
    assert {auth for _, _, auth in delivery.calls} == {f"Bearer {first}", f"Bearer {second}"}


async def test_a_refusal_is_passed_back_intact(http, agent_url, issuer, delivery, model):
    delivery.refusal = dict(REFUSAL)
    events = await stream(http, agent_url, issuer.mint(), rpc("message/stream", APPLY))

    text, data = artifact_parts(events)
    assert data["refusal"] == REFUSAL  # the service's object, key for key
    assert data["outcome"] == "refused" and data["change"] is None
    assert text == REFUSAL["message"]  # its words, not a model's
    assert events[-1]["status"]["state"] == "failed" and events[-1]["final"] is True

    assert model.requests == []  # no model call for a refusal
    assert [call[0] for call in delivery.calls] == ["apply_change"]  # and no retry


async def test_a_tool_hidden_by_the_gateway_is_reported_as_rejected(
    http, agent_url, issuer, delivery, model
):
    """A gateway answers tools/call for a tool the caller's role may not use with a
    JSON-RPC error. That is an answer about the caller, not an outage."""
    delivery.hidden_by_gateway = True
    events = await stream(http, agent_url, issuer.mint("developer"), rpc("message/stream", APPLY))

    text, data = artifact_parts(events)
    assert data["outcome"] == "rejected" and data["refusal"] is None and data["change"] is None
    assert "Unknown tool: apply_change" in text and "-32602" in text
    assert "could not be reached" not in text
    assert events[-1]["status"]["state"] == "failed"
    assert model.requests == []


async def test_a_failed_change_is_reported_as_failed(http, agent_url, issuer, delivery, model):
    delivery.script = ["applying", "verifying", "failed"]
    model.text = "Change CHG-0001 was not verified. The search check kept returning 500."
    events = await stream(http, agent_url, issuer.mint(), rpc("message/stream", APPLY))

    text, data = artifact_parts(events)
    assert data["outcome"] == "failed" and data["status"] == "failed"
    assert "status 500" in data["change"]["detail"]
    assert text == model.text
    assert events[-1]["status"]["state"] == "failed"
    assert len(model.requests) == 1


async def test_the_result_stands_when_the_model_is_down(http, agent_url, issuer, delivery, model):
    model.status = 500
    events = await stream(http, agent_url, issuer.mint(), rpc("message/stream", APPLY))

    text, data = artifact_parts(events)
    assert data["outcome"] == "applied" and data["phrased_by"] == "template"
    assert "CHG-0001" in text and "2.0.0" in text and "status 200" in text
    assert events[-1]["status"]["state"] == "completed"


async def test_a_model_that_does_not_answer_holds_the_result_for_one_deadline_only(
    http, agent_url, issuer, delivery, model
):
    model.delay_seconds = 4 * MODEL_TIMEOUT_SECONDS
    started = time.monotonic()
    events = await stream(http, agent_url, issuer.mint(), rpc("message/stream", APPLY))
    elapsed = time.monotonic() - started

    text, data = artifact_parts(events)
    assert data["outcome"] == "applied" and data["phrased_by"] == "template"
    assert "CHG-0001" in text and "status 200" in text
    assert events[-1]["status"]["state"] == "completed"
    # One deadline for the whole model call: no second attempt after the first timed out.
    assert len(model.requests) == 1
    assert elapsed < 1.5 * MODEL_TIMEOUT_SECONDS


async def test_a_throttled_model_is_not_waited_for(http, agent_url, issuer, delivery, model):
    # Strands' default answers a 429 by backing off for 4, 8, 16, 32 and 64 seconds.
    model.status = 429
    started = time.monotonic()
    events = await stream(http, agent_url, issuer.mint(), rpc("message/stream", APPLY))
    elapsed = time.monotonic() - started

    _, data = artifact_parts(events)
    assert data["outcome"] == "applied" and data["phrased_by"] == "template"
    assert elapsed < 1.5 * MODEL_TIMEOUT_SECONDS


async def test_a_change_that_does_not_finish_in_time_is_not_called_applied(
    http, agent_url, issuer, delivery, model
):
    delivery.script = ["applying", "verifying"]  # never finishes
    events = await stream(http, agent_url, issuer.mint(), rpc("message/stream", APPLY))

    text, data = artifact_parts(events)
    assert data["outcome"] == "timeout" and data["status"] == "verifying"
    assert "not been verified" in text
    assert events[-1]["status"]["state"] == "failed"
    assert model.requests == []


async def test_delivery_mcp_unreachable(http, issuer, delivery, model):
    """A separate agent pointed at a closed port reports the failure plainly."""
    from conftest import AUDIENCE, free_port, serve_in_thread

    from remediation_agent.app import create_app
    from remediation_agent.config import load_settings

    port = free_port()
    settings = load_settings(
        {
            "OIDC_ISSUER": issuer.issuer,
            "OIDC_JWKS_URL": issuer.jwks_url,
            "OIDC_AUDIENCE": AUDIENCE,
            "DELIVERY_MCP_URL": f"http://127.0.0.1:{free_port()}/mcp",
            "MODEL_BASE_URL": model.url,
            "MODEL_ID_FAST": FAST_MODEL,
            "PORT": str(port),
        }
    )
    server = serve_in_thread(create_app(settings), port)
    try:
        events = await stream(
            http, f"http://127.0.0.1:{port}", issuer.mint(), rpc("message/stream", APPLY)
        )
    finally:
        server.should_exit = True
    text, data = artifact_parts(events)
    assert data["outcome"] == "error" and data["change"] is None
    assert "could not be reached" in text
    assert events[-1]["status"]["state"] == "failed"
    assert model.requests == []


# -- message/send, and the request's shape ----------------------------------


async def test_message_send_returns_the_finished_task(http, agent_url, issuer, delivery, model):
    response = await http.post(
        agent_url,
        json=rpc("message/send", APPLY),
        headers={"Authorization": f"Bearer {issuer.mint()}"},
    )
    assert response.status_code == 200
    task = Task.model_validate(response.json()["result"])
    assert task.status.state.value == "completed"
    (artifact,) = task.artifacts or []
    assert artifact.name == "apply_and_verify_result"
    data = next(p.root.data for p in artifact.parts if p.root.kind == "data")
    assert data["outcome"] == "applied"


async def test_the_request_may_be_a_data_part(http, agent_url, issuer, delivery, model):
    body = rpc("message/stream", data={"action": "apply_and_verify", "change_id": "CHG-0001"})
    events = await stream(http, agent_url, issuer.mint(), body)
    assert artifact_parts(events)[1]["outcome"] == "applied"


@pytest.mark.parametrize(
    "text",
    [
        "please roll back search",
        '{"action": "delete_everything", "change_id": "CHG-0001"}',
        '{"action": "apply_and_verify"}',
        '{"action": "apply_and_verify", "change_id": ""}',
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


async def test_the_delivery_client_calls_only_its_two_tools(issuer, delivery):
    async with open_delivery(delivery.url, issuer.mint()) as client:
        with pytest.raises(ValueError, match="not a tool this agent calls"):
            await client.call("post_status_update", {"incident_id": "INC-0001", "text": "x"})
    assert delivery.calls == []


def test_two_sentences():
    assert two_sentences("One. Two. Three.") == "One. Two."
    assert two_sentences("  Only\none.  ") == "Only one."
    text = "CHG-0001 returned search-service to 2.0.0. The check got 200 with 3 result(s). More."
    assert two_sentences(text) == (
        "CHG-0001 returned search-service to 2.0.0. The check got 200 with 3 result(s)."
    )


def test_template_result():
    facts = {
        "change_id": "CHG-0001", "service": "search-service", "target_version": "2.0.0",
        "status": "applied", "applied_by": "platform-engineer", "detail": "status 200",
    }  # fmt: skip
    assert template_result(facts).count(". ") == 1
    assert "failed" in template_result({**facts, "status": "failed"})
