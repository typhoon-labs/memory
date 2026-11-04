"""Audit records: one log record on the logger ``delivery.audit`` per event.

An event is a state a change reaches, a write to an incident, or a tool call
that writes or that is refused. A read that succeeds is not one: the gateway
records every request.

Each record carries its fields twice. The message is a JSON object of them, for
the pod's log. The same fields are the record's attributes (``extra``), which
the OTLP handler (``delivery.telemetry``) sends to the collector, and Loki keeps
as structured metadata, with ``_`` for ``.`` (``user.id`` is ``user_id``).
The names of who acted are the gateway's access log's, so that records from
both join on them:

    audit.event     change.proposed, change.approved, change.rejected,
                    change.applying, change.verifying, change.applied,
                    change.failed, incident.opened,
                    incident.diagnosis_recorded,
                    incident.status_update_posted, incident.resolved,
                    tool.call
    audit.outcome   allowed, refused or failed, for a tool call; succeeded or
                    failed, for a step
    audit.rule      the rule that refused a call; absent otherwise
    user.id         the user, as every record here names them:
                    preferred_username (Caller.user)
    user.*          user.sub, user.roles, user.team, user.issuer (iss),
                    user.client (azp)
    session.id      sid
    token.jti       jti
    actor.chain     the agents acting for the user, newest first,
                    comma-separated

A field that is absent or empty is left out, never written as null.
"""

from __future__ import annotations

import json
import logging
from collections.abc import Mapping
from typing import Any

from opentelemetry import trace

from .identity import Caller

LOGGER = "delivery.audit"

ALLOWED = "allowed"
REFUSED = "refused"
SUCCEEDED = "succeeded"
FAILED = "failed"

_logger = logging.getLogger(LOGGER)
# An audit record is written whatever LOG_LEVEL says.
_logger.setLevel(logging.INFO)


def caller_fields(caller: Caller | None) -> dict[str, Any]:
    """Who acted, as the verified token says. Empty without a caller."""
    if caller is None:
        return {}
    return {
        "user.id": caller.user,
        "user.sub": caller.sub,
        "user.roles": sorted(caller.roles),
        "user.team": caller.team,
        "user.issuer": caller.issuer,
        "user.client": caller.client,
        "session.id": caller.sid,
        "token.jti": caller.jti,
        # As the gateway writes it: newest first, comma-separated.
        "actor.chain": ",".join(caller.chain),
    }


def emit(
    event: str,
    caller: Caller | None,
    fields: Mapping[str, Any] | None = None,
    *,
    outcome: str = SUCCEEDED,
    rule: str | None = None,
) -> dict[str, Any]:
    """Write one audit record, and return its attributes.

    ``fields`` say what the event concerns, such as ``change.id``. The record's
    trace and span ids are the active span's: the OTLP handler reads them from
    the context, and the message names the trace as ``trace.id``.
    """
    candidates = {
        "audit.event": event,
        "audit.outcome": outcome,
        "audit.rule": rule,
        **(fields or {}),
        **caller_fields(caller),
    }
    attributes = {k: v for k, v in candidates.items() if v is not None and v != "" and v != []}
    message = dict(attributes)
    context = trace.get_current_span().get_span_context()
    if context.is_valid:
        message["trace.id"] = format(context.trace_id, "032x")
    _logger.info(json.dumps(message), extra=attributes)
    return attributes
