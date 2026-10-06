"""draft_status_update: code reads the incident as the caller; the model words a draft.

The agent returns the draft to its caller. Posting is a separate, deliberate
act by an incident manager through delivery-mcp, and nothing here can do it.
"""

from __future__ import annotations

import asyncio
import json
import logging
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
from .delivery import DeliveryRejected, DeliveryUnavailable, open_delivery
from .model import draft_status_update, word_count

logger = logging.getLogger(__name__)

ACTION = "draft_status_update"
ARTIFACT_NAME = "status_update_draft"


def parse_request(message: Message | None) -> str:
    """The incident_id of a ``draft_status_update`` request.

    The request is ``{"action": "draft_status_update", "incident_id": "..."}``,
    sent either as a data part or as JSON in a text part.
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
                message='expected {"action": "draft_status_update", "incident_id": "..."}'
            )
        )
    incident_id = request.get("incident_id")
    if not isinstance(incident_id, str) or not incident_id.strip():
        raise ServerError(
            error=InvalidParamsError(message="incident_id must be a non-empty string")
        )
    return incident_id.strip()


class CommsExecutor(AgentExecutor):
    def __init__(self, settings: Settings) -> None:
        self._settings = settings

    async def execute(self, context: RequestContext, event_queue: EventQueue) -> None:
        incident_id = parse_request(context.message)
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
            await self._draft(updater, token, incident_id)
        except asyncio.CancelledError:
            try:
                await updater.cancel()
            except RuntimeError:
                pass
            raise
        except Exception as exc:
            logger.exception("draft_status_update for %s stopped unexpectedly", incident_id)
            try:
                await self._finish(
                    updater,
                    incident_id,
                    outcome="error",
                    text=f"The agent stopped unexpectedly while drafting for {incident_id}:"
                    f" {type(exc).__name__}.",
                )
            except RuntimeError:  # the task had already reached its final state
                pass

    async def cancel(self, context: RequestContext, event_queue: EventQueue) -> None:
        raise ServerError(error=UnsupportedOperationError())

    async def _draft(self, updater: TaskUpdater, token: str, incident_id: str) -> None:
        await self._working(updater, f"Reading {incident_id} as the caller.")
        try:
            async with open_delivery(self._settings.delivery_mcp_url, token) as delivery:
                answer = await delivery.call("get_incident", {"incident_id": incident_id})
        except DeliveryRejected as exc:
            await self._finish(
                updater,
                incident_id,
                outcome="rejected",
                text=f"The call to read {incident_id} was rejected before it reached"
                f" delivery-mcp: {exc.message} (JSON-RPC error {exc.code}).",
            )
            return
        except DeliveryUnavailable as exc:
            await self._finish(
                updater,
                incident_id,
                outcome="error",
                text=f"delivery-mcp could not be reached to read {incident_id}: {exc}",
            )
            return

        if answer.is_error:
            # The service's answer, as it came. No draft is written without the incident.
            await self._finish(
                updater,
                incident_id,
                outcome="refused" if answer.is_refusal else "error",
                refusal=answer.data,
                text=str(
                    answer.data.get("message") or f"delivery-mcp did not return {incident_id}."
                ),
            )
            return

        await self._working(updater, f"Drafting a status update for {incident_id}.")
        try:
            draft, cut = await draft_status_update(self._settings, token, answer.data)
        except TimeoutError:
            logger.warning(
                "the model did not answer within %gs", self._settings.model_timeout_seconds
            )
            await self._finish(
                updater,
                incident_id,
                outcome="error",
                text=f"No draft was written for {incident_id}: the model did not answer within"
                f" {self._settings.model_timeout_seconds:g} seconds.",
            )
            return
        except Exception as exc:
            logger.warning("model call failed: %s", type(exc).__name__)
            await self._finish(
                updater,
                incident_id,
                outcome="error",
                text=f"No draft was written for {incident_id}: the model call failed"
                f" ({type(exc).__name__}).",
            )
            return

        await self._finish(
            updater,
            incident_id,
            outcome="drafted",
            text=draft,
            draft=draft,
            cut=cut,
            incident_status=answer.data.get("status"),
        )

    @staticmethod
    async def _working(updater: TaskUpdater, text: str) -> None:
        await updater.update_status(
            TaskState.working,
            message=updater.new_agent_message(parts=[Part(root=TextPart(text=text))]),
        )

    async def _finish(
        self,
        updater: TaskUpdater,
        incident_id: str,
        *,
        outcome: str,
        text: str,
        draft: str | None = None,
        cut: bool = False,
        incident_status: str | None = None,
        refusal: dict[str, Any] | None = None,
    ) -> None:
        """One artifact with the draft in words and as data, then the final state."""
        result = {
            "action": ACTION,
            "incident_id": incident_id,
            "outcome": outcome,
            "draft": draft,
            "word_count": word_count(draft) if draft else 0,
            "max_words": self._settings.max_words,
            "shortened": cut,
            "incident_status": incident_status,
            # Always false: this agent drafts. Posting is post_status_update, by an
            # incident manager.
            "posted": False,
            "refusal": refusal,
        }
        parts = [Part(root=TextPart(text=text)), Part(root=DataPart(data=result))]
        await updater.add_artifact(parts, name=ARTIFACT_NAME)
        message = updater.new_agent_message(parts=parts)
        if outcome == "drafted":
            await updater.complete(message=message)
        else:
            await updater.failed(message=message)
