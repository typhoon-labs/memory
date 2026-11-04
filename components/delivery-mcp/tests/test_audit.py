"""Audit records: one per state a change reaches, per write to an incident, and per
tool call that writes or is refused, each naming the caller as the token says."""

from __future__ import annotations

import json
import logging
from collections.abc import Iterator
from typing import Any

import jwt
import pytest
from conftest import assert_refused
from opentelemetry.sdk._logs import LoggerProvider
from opentelemetry.sdk._logs.export import InMemoryLogRecordExporter, SimpleLogRecordProcessor
from opentelemetry.sdk.trace import TracerProvider

from delivery import audit
from delivery.identity import Caller, caller_from_claims
from delivery.telemetry import attach_audit_handler

EVENTS = {
    "change.proposed",
    "change.approved",
    "change.rejected",
    "change.applying",
    "change.verifying",
    "change.applied",
    "change.failed",
    "incident.opened",
    "incident.diagnosis_recorded",
    "incident.status_update_posted",
    "incident.resolved",
    "tool.call",
}
OUTCOMES = {"allowed", "refused", "succeeded", "failed"}
# Every attribute an audit record may carry.
NAMES = {
    "audit.event",
    "audit.outcome",
    "audit.rule",
    "user.id",
    "user.sub",
    "user.roles",
    "user.team",
    "user.issuer",
    "user.client",
    "session.id",
    "token.jti",
    "actor.chain",
    "incident.id",
    "incident.severity",
    "change.id",
    "change.target_version",
    "change.previous_version",
    "change.detail",
    "operation.id",
    "delivery.service",
    "helm.release",
    "helm.namespace",
    "helm.revision",
    "gen_ai.tool.name",
    "error.type",
}
# What a log record holds before ``extra`` adds to it, and what a formatter adds.
PLAIN = set(vars(logging.makeLogRecord({}))) | {"message", "asctime"}


def jti(token: str) -> str:
    return jwt.decode(token, options={"verify_signature": False})["jti"]


@pytest.fixture
def records(caplog) -> Any:
    """The audit records written so far in this test, as their messages."""
    caplog.set_level(logging.INFO, logger=audit.LOGGER)

    def _records() -> list[dict[str, Any]]:
        return [json.loads(r.getMessage()) for r in caplog.records if r.name == audit.LOGGER]

    return _records


async def test_a_change_is_recorded_at_every_step_for_the_people_who_acted(
    call, approved_change, chain, follow, world, records
):
    incident_id, change_id = await approved_change()
    applied = await call(
        "apply_change",
        token=chain.delegate("platform-engineer", "chat-assistant", "remediation-agent"),
        change_id=change_id,
    )
    assert not applied.is_error, applied.data
    await follow(incident_id, change_id)
    await world.service.drain()

    lines = records()
    steps = [
        (r["audit.event"], r["user.id"])
        for r in lines
        if r.get("change.id") == change_id and r["audit.event"].startswith("change.")
    ]
    assert steps == [
        ("change.proposed", "developer"),
        ("change.approved", "incident-manager"),
        ("change.applying", "platform-engineer"),
        ("change.verifying", "platform-engineer"),
        ("change.applied", "platform-engineer"),
    ]
    # The steps taken after apply_change returned name the caller who asked
    # to apply, and the agents that acted for them.
    applying = next(r for r in lines if r["audit.event"] == "change.applying")
    assert applying["actor.chain"] == "remediation-agent,chat-assistant"
    later = [
        r
        for r in lines
        if r["audit.event"] in {"change.verifying", "change.applied", "incident.resolved"}
    ]
    assert [r["audit.event"] for r in later] == [
        "change.verifying",
        "change.applied",
        "incident.resolved",
    ]
    for record in later:
        for name in ("user.id", "user.sub", "user.issuer", "token.jti", "actor.chain"):
            assert record[name] == applying[name], (record["audit.event"], name)
    assert (later[-1]["incident.id"], later[-1]["change.id"]) == (incident_id, change_id)

    # One operation id on every record of the change: unlike CHG-0001, it is
    # not used again after a reset.
    operation_id = applied.data["operation_id"]
    assert operation_id.startswith("op-")
    assert {
        r["operation.id"]
        for r in lines
        if r.get("change.id") == change_id and r["audit.event"] != "tool.call"
    } == {operation_id}
    proposed = next(r for r in lines if r["audit.event"] == "change.proposed")
    assert (proposed["change.target_version"], proposed["change.previous_version"]) == (
        "2.0.0",
        "2.1.0",
    )


async def test_every_record_has_the_agreed_names_and_no_nulls(
    call, incident, follow, world, records, caplog
):
    """Every kind of event, once: each one's fields are the message and the attributes."""
    incident_id = await incident()
    await call(
        "record_diagnosis",
        "alert-automation",
        incident_id=incident_id,
        suspected_cause="2.1.0 broke search",
        evidence=["errors"],
        recommended_version="2.0.0",
    )

    async def change() -> str:
        proposed = await call(
            "propose_change", "developer", incident_id=incident_id, target_version="2.0.0"
        )
        return proposed.data["change_id"]

    rejected = await change()
    await call("reject_change", "incident-manager", change_id=rejected, reason="not yet")
    for fail_with in ("helm exited 1: UPGRADE FAILED", None):
        world.applier.fail_with = fail_with
        change_id = await change()
        await call("approve_change", "incident-manager", change_id=change_id)
        await call("apply_change", "platform-engineer", change_id=change_id)
        await follow(incident_id, change_id)
        await world.service.drain()
    await call("post_status_update", "incident-manager", incident_id=incident_id, text="Fixed.")
    await call("restart_workload", "platform-engineer", service="web")
    assert_refused(await call("approve_change", "developer", change_id=change_id), "role_required")

    seen = set()
    for record in caplog.records:
        if record.name != audit.LOGGER:
            continue
        message = json.loads(record.getMessage())
        attributes = {k: v for k, v in vars(record).items() if k not in PLAIN}
        # The same fields in the message as in the attributes the OTLP handler
        # sends; the trace, when there is one, is the OTLP record's own.
        assert attributes == {k: v for k, v in message.items() if k != "trace.id"}, message
        assert set(attributes) <= NAMES, set(attributes) - NAMES
        assert all(v is not None and v != "" and v != [] for v in attributes.values()), message
        assert attributes["audit.event"] in EVENTS
        assert attributes["audit.outcome"] in OUTCOMES
        assert ("audit.rule" in attributes) == (attributes["audit.outcome"] == "refused"), message
        seen.add(attributes["audit.event"])
    assert seen == EVENTS


async def test_a_refusal_is_recorded_with_its_rule_and_nothing_else(call, approved_change, records):
    _, change_id = await approved_change()
    refused = await call("apply_change", "developer", change_id=change_id)
    assert_refused(refused, "role_required")

    last = records()[-1]
    expected = {
        "audit.event": "tool.call",
        "audit.outcome": "refused",
        "audit.rule": "role_required",
        "error.type": "forbidden",
        "gen_ai.tool.name": "apply_change",
        "change.id": change_id,
        "user.id": "developer",
        "user.roles": ["developer"],
        "user.team": "search",
        "user.client": "chat-ui",
    }
    assert {k: last.get(k) for k in expected} == expected
    assert set(last) - set(expected) == {"user.sub", "user.issuer", "token.jti"}
    assert not [r for r in records() if r["audit.event"] == "change.applying"]


async def test_a_read_is_recorded_only_when_it_is_refused(call, incident, records, caplog):
    incident_id = await incident()
    caplog.clear()
    await call("get_incident", "developer", incident_id=incident_id)
    await call("list_incidents", "developer")
    assert records() == []

    await call("get_incident", "developer", incident_id="INC-9999")
    (line,) = records()
    assert (
        line["audit.event"],
        line["audit.outcome"],
        line["audit.rule"],
        line["error.type"],
        line["incident.id"],
    ) == ("tool.call", "refused", "incident_exists", "not_found", "INC-9999")


async def test_a_record_names_the_caller_as_the_token_says(
    call, incident, issuer, chain, records, caplog
):
    incident_id = await incident()
    caplog.clear()
    own = issuer.mint("incident-manager", sid="session-1")
    delegated = chain.delegate("incident-manager", "chat-assistant")
    for token in (own, delegated):
        posted = await call("post_status_update", token=token, incident_id=incident_id, text="x")
        assert not posted.is_error, posted.data
    person, agent = [r for r in records() if r["audit.event"] == "incident.status_update_posted"]

    claims = jwt.decode(own, options={"verify_signature": False})
    assert {k: v for k, v in person.items() if k.startswith(("user.", "session.", "token."))} == {
        "user.id": "incident-manager",
        "user.sub": claims["sub"],
        "user.roles": ["incident-manager"],
        "user.team": "incident",
        "user.issuer": issuer.issuer,
        "user.client": "chat-ui",
        "session.id": "session-1",
        "token.jti": jti(own),
    }
    assert "actor.chain" not in person
    # chain-sts's token: its own issuer and jti, the agents, no session, no azp.
    assert (agent["user.id"], agent["user.issuer"], agent["token.jti"], agent["actor.chain"]) == (
        "incident-manager",
        chain.issuer,
        jti(delegated),
        "chat-assistant",
    )
    assert "session.id" not in agent and "user.client" not in agent


async def test_a_failed_apply_is_recorded_for_the_caller_who_asked(
    call, approved_change, follow, world, records
):
    incident_id, change_id = await approved_change()
    world.applier.fail_with = "helm exited 1: UPGRADE FAILED"
    await call("apply_change", "platform-engineer", change_id=change_id)
    assert (await follow(incident_id, change_id))["status"] == "failed"
    await world.service.drain()

    (failed,) = [r for r in records() if r["audit.event"] == "change.failed"]
    assert (failed["audit.outcome"], failed["user.id"], failed["change.id"]) == (
        "failed",
        "platform-engineer",
        change_id,
    )
    assert "UPGRADE FAILED" in failed["change.detail"]
    assert "audit.rule" not in failed and "helm.revision" not in failed
    assert not [
        r
        for r in records()
        if r["audit.event"] in {"change.verifying", "change.applied", "incident.resolved"}
    ]


# -- what the OTLP handler sends ----------------------------------------------


@pytest.fixture
def exported() -> Iterator[InMemoryLogRecordExporter]:
    """The audit records as the OTLP handler hands them on, kept in memory."""
    exporter = InMemoryLogRecordExporter()
    provider = LoggerProvider()
    provider.add_log_record_processor(SimpleLogRecordProcessor(exporter))
    handler = attach_audit_handler(provider)
    yield exporter
    logging.getLogger(audit.LOGGER).removeHandler(handler)
    provider.shutdown()


def person(name: str, role: str, team: str, **claims: Any) -> Caller:
    caller = caller_from_claims(
        {
            "preferred_username": name,
            "roles": [role],
            "team": team,
            "sub": f"sub-{name}",
            "iss": "http://localhost:18081/realms/demo",
            "jti": f"jti-{name}",
            **claims,
        }
    )
    assert caller is not None
    return caller


async def test_the_steps_after_the_call_carry_the_callers_trace(world, exported):
    """Run as the cluster runs it: in a span, as FastMCP makes one for each tool call."""
    service = world.service
    incident = service.open_incident(
        person("alert", "alert-automation", "automation"), "search-service", "sev2", "s", "i"
    )
    change = await service.propose_change(
        person("developer", "developer", "search"), incident["incident_id"], "2.0.0"
    )
    service.approve_change(person("im", "incident-manager", "incident"), change["change_id"])
    world.applier.delay_seconds = 0.05

    tracer = TracerProvider().get_tracer("test")
    with tracer.start_as_current_span("tools/call apply_change") as span:
        caller = person("platform-engineer", "platform-engineer", "platform", sid="s-1")
        await service.apply_change(caller, change["change_id"])
    # Outside the span: the steps finish after the call has returned.
    await service.drain()

    sent = {
        r.log_record.attributes["audit.event"]: r.log_record for r in exported.get_finished_logs()
    }
    context = span.get_span_context()
    for event in ("change.applying", "change.verifying", "change.applied", "incident.resolved"):
        record = sent[event]
        assert (record.trace_id, record.span_id) == (context.trace_id, context.span_id), event
        assert record.attributes["user.id"] == "platform-engineer"
        assert record.attributes["session.id"] == "s-1"
        assert record.attributes["token.jti"] == "jti-platform-engineer"
        # The attributes are the record's own, not only text in its body.
        assert json.loads(record.body)["audit.event"] == event
        assert json.loads(record.body)["trace.id"] == format(context.trace_id, "032x")
    assert sent["change.applied"].attributes["operation.id"] == change["operation_id"]
    # No span was active when the change was proposed.
    assert sent["change.proposed"].trace_id == 0


def test_only_audit_records_reach_the_otlp_handler(exported):
    logging.getLogger("delivery.service").warning("not an audit record")
    logging.getLogger().warning("nor this")
    audit.emit("change.applied", None, {"change.id": "CHG-0001", "helm.revision": 7})
    (sent,) = exported.get_finished_logs()
    assert dict(sent.log_record.attributes) == {
        "audit.event": "change.applied",
        "audit.outcome": "succeeded",
        "change.id": "CHG-0001",
        "helm.revision": 7,
    }
    root = logging.getLogger()
    assert not [h for h in root.handlers if type(h).__name__ == "LoggingHandler"]
