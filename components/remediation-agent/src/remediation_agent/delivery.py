"""Calling delivery-mcp as the caller.

One MCP session over Streamable HTTP, opened with the caller's bearer token and
with nothing else: the agent has no identity of its own at delivery-mcp. What
the service answers, including a refusal, is returned as the service gave it.
"""

from __future__ import annotations

import json
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from dataclasses import dataclass
from typing import Any

import httpx
from mcp import ClientSession
from mcp.client.streamable_http import streamable_http_client
from mcp.shared.exceptions import McpError

# The only tools this agent ever calls. Anything else is a programming error.
ALLOWED_TOOLS = frozenset({"apply_change", "get_incident"})


class DeliveryUnavailable(Exception):  # noqa: N818 - named for what happened
    """delivery-mcp could not be reached, or did not accept the session."""


class DeliveryRejected(Exception):  # noqa: N818 - named for what happened
    """The MCP endpoint answered the call with a protocol error instead of a result.

    This is what a gateway in front of delivery-mcp does for a tool the caller's
    role may not use: the call never reaches the service, so there is no
    structured refusal to pass back, only this error.
    """

    def __init__(self, code: int, message: str) -> None:
        super().__init__(message)
        self.code = code
        self.message = message


@dataclass(frozen=True)
class ToolOutcome:
    """What a tool returned. ``data`` is the service's object, unchanged."""

    is_error: bool
    data: dict[str, Any]

    @property
    def is_refusal(self) -> bool:
        return self.is_error and self.data.get("error") == "forbidden"


def _flatten(exc: BaseException) -> str:
    """The first concrete cause inside an exception group, as text."""
    while isinstance(exc, BaseExceptionGroup) and exc.exceptions:
        exc = exc.exceptions[0]
    return f"{type(exc).__name__}: {exc}"


def _contains(exc: BaseException, target: BaseException) -> bool:
    """Whether ``target`` is ``exc`` or sits somewhere inside it."""
    if exc is target:
        return True
    return isinstance(exc, BaseExceptionGroup) and any(
        _contains(inner, target) for inner in exc.exceptions
    )


class DeliveryClient:
    def __init__(self, session: ClientSession) -> None:
        self._session = session

    async def call(self, tool: str, arguments: dict[str, Any]) -> ToolOutcome:
        if tool not in ALLOWED_TOOLS:
            raise ValueError(f"{tool} is not a tool this agent calls")
        try:
            result = await self._session.call_tool(tool, arguments)
        except McpError as exc:
            raise DeliveryRejected(exc.error.code, exc.error.message) from exc
        except (Exception, BaseExceptionGroup) as exc:
            raise DeliveryUnavailable(_flatten(exc)) from exc

        data = result.structuredContent
        if not isinstance(data, dict):
            text = next((c.text for c in result.content if getattr(c, "text", None)), "")
            try:
                parsed = json.loads(text)
            except ValueError:
                parsed = None
            data = parsed if isinstance(parsed, dict) else {"message": text}
        return ToolOutcome(is_error=bool(result.isError), data=data)


@asynccontextmanager
async def open_delivery(
    url: str, token: str, *, timeout_seconds: float = 30.0
) -> AsyncIterator[DeliveryClient]:
    """An MCP session with delivery-mcp that carries ``token`` on every request.

    A failure to connect, or a connection lost part-way, is raised as
    :class:`DeliveryUnavailable`. An exception from the caller's own block
    passes through untouched.
    """
    body_error: BaseException | None = None
    try:
        async with (
            httpx.AsyncClient(
                headers={"Authorization": f"Bearer {token}"},
                timeout=httpx.Timeout(timeout_seconds, read=300.0),
            ) as http,
            streamable_http_client(url, http_client=http) as (read, write, _),
            ClientSession(read, write) as session,
        ):
            await session.initialize()
            try:
                yield DeliveryClient(session)
            except BaseException as exc:
                body_error = exc
                raise
    except BaseException as exc:
        if exc is body_error:
            raise
        if body_error is not None and _contains(exc, body_error):
            # The transport's task group hands the block's own exception back
            # inside a group. Give the caller the exception they raised.
            raise body_error from None
        # The transport reports a broken connection by cancelling the work in
        # progress and raising the cause as a group when the session closes.
        if isinstance(exc, Exception | BaseExceptionGroup):
            raise DeliveryUnavailable(_flatten(exc)) from exc
        raise
