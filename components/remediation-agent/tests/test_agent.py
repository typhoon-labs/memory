"""remediation-agent over A2A, with stand-ins for delivery-mcp and the model."""

from __future__ import annotations

import time

import pytest
from a2a.types import Task, TaskArtifactUpdateEvent, TaskStatusUpdateEvent
from conftest import (
    APPLY,
    FAST_MODEL,
    MODEL_TIMEOUT_SECONDS,
    REFUSAL,
    artifact_parts,
    rpc,
    stream,
)

from remediation_agent.delivery import open_delivery
from remediation_agent.model import template_result, two_sentences

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
