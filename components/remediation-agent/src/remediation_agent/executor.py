"""apply_and_verify: code applies the change and follows it; the model only words the result.

Whether the change is applied is decided by delivery-mcp, from the caller's
token. Nothing here asks a model whether to act, and nothing here acts under an
identity other than the caller's.
"""

from __future__ import annotations

import asyncio
import json
import logging
import time
from collections.abc import AsyncIterator
from typing import Any

from a2a.server.agent_execution import AgentExecutor, RequestContext
from a2a.server.events import EventQueue
from a2a.server.tasks import TaskUpdater
from a2a.types import (
    DataPart,
    InvalidParamsError,
    Message,
    Part,
    TaskState,
    TextPart,
    UnsupportedOperationError,
)
from a2a.utils import new_task
from a2a.utils.errors import ServerError

from .auth import caller_token
from .config import Settings
from .delivery import (
    DeliveryClient,
    DeliveryRejected,
    DeliveryUnavailable,
    ToolOutcome,
    open_delivery,
)
from .model import phrase_result, template_result

logger = logging.getLogger(__name__)

ACTION = "apply_and_verify"
ARTIFACT_NAME = "apply_and_verify_result"
FINISHED = ("applied", "failed")
# The stages a caller is told about, in the order the service passes through them.
REPORTED = ("applying", "verifying", "applied", "failed")


def parse_request(message: Message | None) -> str:
    """The change_id of an ``apply_and_verify`` request.

    The request is ``{"action": "apply_and_verify", "change_id": "..."}``, sent
    either as a data part or as JSON in a text part.
    """
    request: Any = None
    texts: list[str] = []
    for part in message.parts if message else []:
        root = part.root
        if isinstance(root, DataPart) and isinstance(root.data, dict) and "action" in root.data:
            request = root.data
            break
        if isinstance(root, TextPart):
            texts.append(root.text)
    if request is None:
        try:
            request = json.loads("".join(texts))
        except ValueError:
            request = None
    if not isinstance(request, dict) or request.get("action") != ACTION:
        raise ServerError(
            error=InvalidParamsError(
                message='expected {"action": "apply_and_verify", "change_id": "..."}'
            )
        )
    change_id = request.get("change_id")
    if not isinstance(change_id, str) or not change_id.strip():
        raise ServerError(error=InvalidParamsError(message="change_id must be a non-empty string"))
    return change_id.strip()


def _parts(text: str, data: dict[str, Any]) -> list[Part]:
    return [Part(root=TextPart(text=text)), Part(root=DataPart(data=data))]


def _find_change(incident: dict[str, Any], change_id: str) -> dict[str, Any] | None:
    return next((c for c in incident.get("changes", []) if c.get("change_id") == change_id), None)


class RemediationExecutor(AgentExecutor):
    def __init__(self, settings: Settings) -> None:
        self._settings = settings

    async def execute(self, context: RequestContext, event_queue: EventQueue) -> None:
        change_id = parse_request(context.message)
        token = caller_token(context)
        if token is None:
            # The HTTP layer has already refused a request without a token; this
            # guards the executor itself against being wired up without it.
            raise ServerError(
                error=InvalidParamsError(message="the request carries no bearer token")
            )

        task = context.current_task
        if task is None:
            task = new_task(context.message)  # type: ignore[arg-type]
            await event_queue.enqueue_event(task)
        updater = TaskUpdater(event_queue, task.id, task.context_id)

        try:
            await self._apply_and_verify(updater, token, change_id)
        except asyncio.CancelledError:
            # The caller went away. The change itself continues in delivery-mcp.
            try:
                await updater.cancel()
            except RuntimeError:
                pass
            raise
        except Exception as exc:
            logger.exception("apply_and_verify for %s stopped unexpectedly", change_id)
            try:
                await self._finish(
                    updater,
                    change_id,
                    outcome="error",
                    text=f"The agent stopped unexpectedly while handling {change_id}: "
                    f"{type(exc).__name__}. The state of the change is in delivery-mcp.",
                )
            except RuntimeError:  # the task had already reached its final state
                pass

    async def cancel(self, context: RequestContext, event_queue: EventQueue) -> None:
        # An apply in flight belongs to delivery-mcp and cannot be recalled from here.
        raise ServerError(error=UnsupportedOperationError())

    # -- the work ----------------------------------------------------------

    async def _apply_and_verify(self, updater: TaskUpdater, token: str, change_id: str) -> None:
        await self._working(updater, f"Calling apply_change for {change_id} as the caller.", {})
        change: dict[str, Any] | None = None
        try:
            async with open_delivery(self._settings.delivery_mcp_url, token) as delivery:
                applied = await delivery.call("apply_change", {"change_id": change_id})
                if applied.is_error:
                    await self._service_said_no(updater, change_id, applied)
                    return
                change = applied.data
                async for change in self._follow(updater, delivery, change):
                    pass
        except DeliveryRejected as exc:
            await self._finish(
                updater,
                change_id,
                outcome="rejected",
                change=change,
                text=f"The call for {change_id} was rejected before it reached delivery-mcp:"
                f" {exc.message} (JSON-RPC error {exc.code}).",
            )
            return
        except DeliveryUnavailable as exc:
            if change is None:
                text = f"delivery-mcp could not be reached to apply {change_id}: {exc}"
            else:
                text = (
                    f"Change {change_id} was {change['status']} when delivery-mcp stopped"
                    f" answering ({exc}). It has not been verified from here; get_incident"
                    " shows where it is."
                )
            await self._finish(updater, change_id, outcome="error", change=change, text=text)
            return

        if change["status"] not in FINISHED:
            await self._finish(
                updater,
                change_id,
                outcome="timeout",
                change=change,
                text=(
                    f"Change {change_id} was still {change['status']} after"
                    f" {self._settings.follow_timeout_seconds:g} seconds."
                    " It has not been verified; get_incident shows where it is."
                ),
            )
            return

        facts = {
            "change_id": change["change_id"],
            "incident_id": change["incident_id"],
            "service": change["service"],
            "target_version": change["target_version"],
            "previous_version": change.get("previous_version"),
            "status": change["status"],
            "applied_by": change.get("applied_by"),
            "detail": change.get("detail"),
        }
        try:
            text = await phrase_result(self._settings, token, facts)
            phrased_by = "model"
        except Exception as exc:  # the result stands whether or not it can be worded
            logger.warning("model call failed, using the template: %s", type(exc).__name__)
            text = template_result(facts)
            phrased_by = "template"
        await self._finish(
            updater,
            change_id,
            outcome=change["status"],
            change=change,
            text=text,
            phrased_by=phrased_by,
        )

    async def _follow(
        self, updater: TaskUpdater, delivery: DeliveryClient, change: dict[str, Any]
    ) -> AsyncIterator[dict[str, Any]]:
        """Report each stage the change passes through, until it finishes or time runs out.

        Yields the change each time it is read, so the caller always holds the
        last state seen, even if the next read fails.
        """
        deadline = time.monotonic() + self._settings.follow_timeout_seconds
        reported = 0
        while True:
            yield change
            stages = [h for h in change.get("history", []) if h.get("status") in REPORTED]
            for stage in stages[reported:]:
                detail = f": {stage['detail']}" if stage.get("detail") else ""
                await self._working(
                    updater,
                    f"{change['change_id']} is {stage['status']}{detail}",
                    {
                        "change_id": change["change_id"],
                        "status": stage["status"],
                        "at": stage.get("at"),
                        "detail": stage.get("detail"),
                    },
                )
            reported = len(stages)
            if change["status"] in FINISHED or time.monotonic() >= deadline:
                return

            await asyncio.sleep(self._settings.follow_interval_seconds)
            incident = await delivery.call("get_incident", {"incident_id": change["incident_id"]})
            if incident.is_error:
                raise DeliveryUnavailable(
                    f"get_incident answered {incident.data.get('error')}:"
                    f" {incident.data.get('message')}"
                )
            change = _find_change(incident.data, change["change_id"]) or change

    async def _service_said_no(
        self, updater: TaskUpdater, change_id: str, answer: ToolOutcome
    ) -> None:
        """Hand the service's answer back as it came. No model is involved."""
        refusal = answer.data
        await self._finish(
            updater,
            change_id,
            outcome="refused" if answer.is_refusal else "error",
            refusal=refusal,
            text=str(refusal.get("message") or f"delivery-mcp did not apply {change_id}."),
        )

    # -- events ------------------------------------------------------------

    @staticmethod
    async def _working(updater: TaskUpdater, text: str, data: dict[str, Any]) -> None:
        parts = _parts(text, data) if data else [Part(root=TextPart(text=text))]
        await updater.update_status(
            TaskState.working, message=updater.new_agent_message(parts=parts)
        )

    @staticmethod
    async def _finish(
        updater: TaskUpdater,
        change_id: str,
        *,
        outcome: str,
        text: str,
        change: dict[str, Any] | None = None,
        refusal: dict[str, Any] | None = None,
        phrased_by: str | None = None,
    ) -> None:
        """One artifact with the result in words and as data, then the final state."""
        result = {
            "action": ACTION,
            "change_id": change_id,
            "outcome": outcome,
            "status": change["status"] if change else None,
            "change": change,
            "refusal": refusal,
            "phrased_by": phrased_by,
        }
        parts = _parts(text, result)
        await updater.add_artifact(parts, name=ARTIFACT_NAME)
        message = updater.new_agent_message(parts=parts)
        if outcome == "applied":
            await updater.complete(message=message)
        else:
            await updater.failed(message=message)
