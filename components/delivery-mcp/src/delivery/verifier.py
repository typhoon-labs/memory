"""Checking that a change did what it was for.

A change is marked ``applied`` only after a search request, made the way a user
would make it, comes back 200 with at least one result. The check retries for a
bounded time, because a rollout takes a moment to reach the new pods.
"""

from __future__ import annotations

import asyncio
import logging
import time
from dataclasses import dataclass
from typing import Any, Protocol

import httpx

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class VerifyResult:
    ok: bool
    detail: str
    attempts: int = 0


class Verifier(Protocol):
    async def verify(self, service: str) -> VerifyResult: ...


class NoVerifier:
    """For the fake applier when no search URL is configured: nothing to ask."""

    async def verify(self, service: str) -> VerifyResult:
        return VerifyResult(
            ok=True,
            detail="not verified against a live service: fake applier, no VERIFY_SEARCH_URL",
        )


def count_results(body: Any, field: str) -> int | None:
    """Number of results in a search response, or None if it has no result list."""
    if isinstance(body, list):
        return len(body)
    if isinstance(body, dict) and isinstance(body.get(field), list):
        return len(body[field])
    return None


class SearchVerifier:
    """Makes a real search request and expects 200 with at least one result."""

    def __init__(
        self,
        url: str,
        *,
        results_field: str = "results",
        timeout_seconds: float = 90.0,
        interval_seconds: float = 2.0,
        transport: httpx.AsyncBaseTransport | None = None,
    ) -> None:
        self._url = url
        self._field = results_field
        self._timeout = timeout_seconds
        self._interval = interval_seconds
        self._transport = transport

    async def _once(self, client: httpx.AsyncClient) -> tuple[bool, str]:
        try:
            response = await client.get(self._url)
        except httpx.HTTPError as exc:
            return False, f"request failed: {type(exc).__name__}: {exc}"
        if response.status_code != 200:
            return False, f"status {response.status_code}"
        try:
            body = response.json()
        except ValueError:
            return False, "status 200 but the body is not JSON"
        count = count_results(body, self._field)
        if count is None:
            return False, f"status 200 but no result list (looked for a list or '{self._field}')"
        if count < 1:
            return False, "status 200 with zero results"
        # Reported for the record only; the check is the status and the results.
        version = body.get("version") if isinstance(body, dict) else None
        reports = f"; the service reports version {version}" if isinstance(version, str) else ""
        return True, f"status 200 with {count} result(s){reports}"

    async def verify(self, service: str) -> VerifyResult:
        deadline = time.monotonic() + self._timeout
        attempts = 0
        last = "no attempt made"
        async with httpx.AsyncClient(
            timeout=httpx.Timeout(5.0), transport=self._transport
        ) as client:
            while True:
                attempts += 1
                ok, last = await self._once(client)
                if ok:
                    return VerifyResult(
                        ok=True,
                        detail=f"search check passed on attempt {attempts}: {last}",
                        attempts=attempts,
                    )
                logger.info("search check attempt %d for %s: %s", attempts, service, last)
                if time.monotonic() + self._interval > deadline:
                    break
                await asyncio.sleep(self._interval)
        return VerifyResult(
            ok=False,
            detail=(
                f"search check failed after {attempts} attempt(s) in"
                f" {self._timeout:g}s; last: {last}"
            ),
            attempts=attempts,
        )
