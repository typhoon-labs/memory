"""The audit records as the Collector gets them: OTLP log records, from the audit logger alone.

The service runs in this process and its audit records go to an exporter that
keeps them in memory. test_main.py sends them over OTLP/HTTP from
`python -m chain_sts` as a process.
"""

from __future__ import annotations

import json
import logging
from collections.abc import Iterator

import httpx
import pytest
from conftest import AUDIENCE, unverified
from opentelemetry.instrumentation.logging.handler import LoggingHandler
from opentelemetry.sdk._logs import LoggerProvider
from opentelemetry.sdk._logs.export import InMemoryLogRecordExporter, SimpleLogRecordProcessor
from opentelemetry.sdk.trace import TracerProvider

from chain_sts.logs import JsonFormatter
from chain_sts.telemetry import AUDIT_LOGGER, export_audit, setup_telemetry

# The keys of the line on standard error, as other scripts read them.
ISSUED_LINE = {"time", "level", "logger", "message", "event", "outcome"}
ISSUED_LINE |= {"jti", "user", "chain", "aud", "exp"}


@pytest.fixture
def exported(caplog) -> Iterator[InMemoryLogRecordExporter]:
    """What the Collector gets while the test runs."""
    caplog.set_level(logging.INFO, logger=AUDIT_LOGGER)
    exporter = InMemoryLogRecordExporter()
    provider = LoggerProvider(shutdown_on_exit=False)
    provider.add_log_record_processor(SimpleLogRecordProcessor(exporter))
    handler = export_audit(provider)
    yield exporter
    logging.getLogger(AUDIT_LOGGER).removeHandler(handler)
    provider.shutdown()


def attributes_of(exporter: InMemoryLogRecordExporter) -> list[dict]:
    """The attributes of each record exported since the last call. None is null or empty."""
    records = exporter.get_finished_logs()
    exporter.clear()
    found = []
    for record in records:
        attributes = dict(record.log_record.attributes or {})
        assert all(v is not None and v != "" for v in attributes.values()), attributes
        found.append(attributes)
    return found


def otel_handlers(name: str) -> list[logging.Handler]:
    return [h for h in logging.getLogger(name).handlers if isinstance(h, LoggingHandler)]


def test_without_an_endpoint_nothing_is_exported(monkeypatch):
    for endpoint in (None, " "):
        if endpoint is None:
            monkeypatch.delenv("OTEL_EXPORTER_OTLP_ENDPOINT", raising=False)
        else:
            monkeypatch.setenv("OTEL_EXPORTER_OTLP_ENDPOINT", endpoint)
        assert setup_telemetry("chain-sts", "0.0.0", "test") is False
        assert not otel_handlers(AUDIT_LOGGER) and not otel_handlers("")


def test_the_handler_is_on_the_audit_logger_alone(exported):
    assert len(otel_handlers(AUDIT_LOGGER)) == 1
    for name in ("", "chain_sts", "chain_sts.telemetry", "uvicorn.error"):
        assert not otel_handlers(name), name
    logging.getLogger("chain_sts").warning("not an audit record")
    logging.getLogger("uvicorn.error").warning("not an audit record either")
    assert attributes_of(exported) == []
    logging.getLogger(AUDIT_LOGGER).info(
        "token exchange refused",
        extra={"fields": {"outcome": "refused"}, "attributes": {"audit.outcome": "refused"}},
    )
    [record] = exported.get_finished_logs()
    assert record.instrumentation_scope.name == AUDIT_LOGGER
    assert record.log_record.body == "token exchange refused"
    assert record.log_record.severity_text == "INFO"
    # The line's fields stay on the line.
    assert dict(record.log_record.attributes) == {"audit.outcome": "refused"}


def test_the_record_carries_the_active_span(exported):
    tracer = TracerProvider().get_tracer("test")
    audit = logging.getLogger(AUDIT_LOGGER)
    with tracer.start_as_current_span("POST /token") as span:
        audit.info("token exchange issued", extra={"attributes": {"audit.outcome": "issued"}})
    audit.info("token exchange refused", extra={"attributes": {"audit.outcome": "refused"}})
    inside, outside = (r.log_record for r in exported.get_finished_logs())
    context = span.get_span_context()
    assert (inside.trace_id, inside.span_id) == (context.trace_id, context.span_id)
    assert not outside.trace_id and not outside.span_id


def test_issued(chain_sts, idp, user_token, sa_token, exported, caplog):
    user = user_token("incident-manager")
    first = chain_sts.exchange(user, sa_token("chat-assistant"), audience=AUDIENCE)
    assert first.status_code == 200, first.text
    issued = unverified(first.json()["access_token"])
    [attributes] = attributes_of(exported)
    assert attributes == {
        "audit.event": "token_exchange",
        "audit.outcome": "issued",
        "user.id": "incident-manager",
        "user.sub": issued["sub"],
        "user.issuer": idp.issuer,
        "token.jti": issued["jti"],
        "actor.chain": "chat-assistant",
        "token.aud": AUDIENCE,
    }
    # The line on standard error keeps its keys, and only those.
    [record] = [r for r in caplog.records if r.name == AUDIT_LOGGER]
    assert json.loads(JsonFormatter().format(record)).keys() == ISSUED_LINE

    # The next hop: the subject is a token this service issued.
    second = chain_sts.exchange(
        first.json()["access_token"], sa_token("remediation-agent"), audience=AUDIENCE
    )
    assert second.status_code == 200, second.text
    [attributes] = attributes_of(exported)
    assert attributes["actor.chain"] == "remediation-agent,chat-assistant"
    assert attributes["user.issuer"] == chain_sts.metadata["issuer"]
    assert attributes["user.id"] == "incident-manager"
    assert attributes["token.jti"] == unverified(second.json()["access_token"])["jti"]


def test_refused(chain_sts, idp, user_token, sa_token, exported):
    user = user_token("platform-engineer")
    decision = {"audit.event": "token_exchange", "audit.outcome": "refused"}

    # The user's token verified: the user is on the record.
    response = chain_sts.exchange(user, sa_token("remediation-agent"), audience=AUDIENCE)
    assert response.status_code == 400, response.text
    [attributes] = attributes_of(exported)
    assert attributes == decision | {
        "audit.rule": response.json()["error_description"],
        "user.id": "platform-engineer",
        "user.sub": unverified(user)["sub"],
        "user.issuer": idp.issuer,
    }

    # Refused before any token verified, in the exchange and in reading the request.
    for request in (
        lambda: chain_sts.exchange(user, audience=AUDIENCE),
        lambda: httpx.post(
            chain_sts.metadata["token_endpoint"],
            content=b"{",
            headers={"Content-Type": "application/json"},
        ),
    ):
        response = request()
        assert response.status_code == 400, response.text
        [attributes] = attributes_of(exported)
        assert attributes == decision | {"audit.rule": response.json()["error_description"]}


def test_an_attribute_without_a_value_is_left_out(chain_sts, user_token, sa_token, exported):
    # A token with no preferred_username: the line names the user by `sub`,
    # the record has no user.id.
    user = user_token("developer", preferred_username=None)
    response = chain_sts.exchange(user, sa_token("chat-assistant"), audience=AUDIENCE)
    assert response.status_code == 200, response.text
    [attributes] = attributes_of(exported)
    assert "user.id" not in attributes
    assert attributes["user.sub"] == unverified(user)["sub"]
