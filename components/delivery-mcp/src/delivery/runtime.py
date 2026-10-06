"""What the tool files share: the service, and the one way a tool is run.

A tool hands :func:`run_tool` a function of ``(service, caller)``. The caller is
built here from the access token FastMCP verified for this request. A tool
cannot be run for a caller it did not get this way.
"""

from __future__ import annotations

import inspect
import json
import logging
from collections.abc import Awaitable, Callable
from typing import Any

from fastmcp.server.dependencies import get_access_token
from fastmcp.tools.tool import ToolResult
from opentelemetry import trace

from . import errors as e
from .applier import Applier, FakeApplier, HelmApplier
from .config import Settings, load_settings
from .errors import Refusal, ServiceError
from .identity import Caller, caller_from_claims
from .restarter import FakeRestarter, KubernetesRestarter, Restarter
from .service import DeliveryService
from .store import Store
from .verifier import NoVerifier, SearchVerifier, Verifier

logger = logging.getLogger(__name__)
audit = logging.getLogger("delivery.audit")

_service: DeliveryService | None = None


def build_service(settings: Settings) -> DeliveryService:
    applier: Applier
    restarter: Restarter
    verifier: Verifier
    if settings.applier == "helm":
        applier = HelmApplier(settings)
        restarter = KubernetesRestarter(settings.helm_namespace)
    else:
        applier = FakeApplier(
            versions={"search-service": settings.fake_current_version},
            delay_seconds=settings.fake_apply_seconds,
        )
        restarter = FakeRestarter(namespace=settings.helm_namespace)
    if settings.verify_search_url:
        verifier = SearchVerifier(
            settings.verify_search_url,
            results_field=settings.verify_results_field,
            timeout_seconds=settings.verify_timeout_seconds,
            interval_seconds=settings.verify_interval_seconds,
        )
    else:
        verifier = NoVerifier()
    service = DeliveryService(
        store=Store(settings.db_path),
        applier=applier,
        verifier=verifier,
        restarter=restarter,
        retained_versions=settings.retained_versions,
        restart_label_selector=settings.restart_label_selector,
    )
    stranded = service.fail_interrupted()
    if stranded:
        logger.warning("%d change(s) were in flight at the last stop; marked failed", stranded)
    return service


def configure(service: DeliveryService | None) -> None:
    """Install the service the tools use. Tests pass their own."""
    global _service
    _service = service


def get_service() -> DeliveryService:
    global _service
    if _service is None:
        _service = build_service(load_settings())
    return _service


def current_caller() -> Caller:
    token = get_access_token()
    caller = caller_from_claims(token.claims) if token is not None else None
    if caller is None:
        raise Refusal(
            e.RULE_AUTHENTICATED_CALLER, "the request carries no verified caller identity"
        )
    return caller


def _result(payload: dict[str, Any], *, is_error: bool = False) -> ToolResult:
    return ToolResult(
        content=json.dumps(payload, separators=(",", ":")),
        structured_content=payload,
        is_error=is_error,
    )


async def run_tool(
    tool: str,
    action: Callable[[DeliveryService, Caller], dict[str, Any] | Awaitable[dict[str, Any]]],
    *,
    target: str = "",
) -> ToolResult:
    """Run one tool call for the verified caller and shape its result.

    A success is the tool's object. A refusal, or any other service error, is the
    contract's error object, with ``isError`` set on the MCP result.
    """
    span = trace.get_current_span()
    span.set_attribute("delivery.tool", tool)
    caller: Caller | None = None
    try:
        caller = current_caller()
        span.set_attribute("enduser.id", caller.user)
        outcome = action(get_service(), caller)
        payload = await outcome if inspect.isawaitable(outcome) else outcome
    except ServiceError as exc:
        error = exc.to_dict()
        span.set_attribute("delivery.outcome", error["error"])
        span.set_attribute("delivery.rule", error["rule"])
        audit.info(
            json.dumps(
                {
                    "tool": tool,
                    "target": target,
                    "user": caller.user if caller else None,
                    "roles": sorted(caller.roles) if caller else [],
                    "team": caller.team if caller else None,
                    "outcome": error["error"],
                    "rule": error["rule"],
                }
            )
        )
        return _result(error, is_error=True)
    span.set_attribute("delivery.outcome", "allowed")
    audit.info(
        json.dumps(
            {
                "tool": tool,
                "target": target,
                "user": caller.user,
                "roles": sorted(caller.roles),
                "team": caller.team,
                "outcome": "allowed",
                "rule": None,
            }
        )
    )
    return _result(payload)
