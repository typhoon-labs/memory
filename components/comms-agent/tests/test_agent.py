"""comms-agent over A2A, with stand-ins for delivery-mcp and the model."""

from __future__ import annotations

import json
import time

import pytest
from a2a.types import Task
from conftest import (
    DRAFT,
    DRAFT_REQUEST,
    MODEL,
    MODEL_TIMEOUT_SECONDS,
    NOT_FOUND,
    artifact_parts,
    rpc,
    stream,
)

from comms_agent.delivery import ALLOWED_TOOLS, open_delivery
from comms_agent.model import incident_facts, limit_words, word_count

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
