"""The caller's bearer token: checked on the way in, read once, forwarded as is.

The agent decides nothing from the token. It verifies it (signature, issuer,
audience, expiry), so that nothing is done for a caller who is not signed in,
and then hands the same token to delivery-mcp and to the model endpoint, which
make their own decisions about it.
"""

from __future__ import annotations

import asyncio
import json
import logging
from collections.abc import Mapping
from typing import Any

import jwt
from a2a.server.agent_execution import RequestContext
from opentelemetry import trace
from starlette.types import ASGIApp, Receive, Scope, Send

logger = logging.getLogger(__name__)

# Served without a token: liveness, and the public description of the agent.
OPEN_PATHS = frozenset({"/healthz", "/.well-known/agent-card.json", "/.well-known/agent.json"})
CLOCK_SKEW_SECONDS = 30


def bearer_token(headers: Mapping[str, str]) -> str | None:
    """The token from an Authorization header, or None."""
    value = headers.get("authorization") or headers.get("Authorization") or ""
    scheme, _, token = value.partition(" ")
    token = token.strip()
    if scheme.lower() != "bearer" or not token:
        return None
    return token


def caller_token(context: RequestContext) -> str | None:
    """The bearer token of the A2A request being executed.

    The A2A server keeps the HTTP headers of the request in the call context;
    this is the only place the agent takes a token from.
    """
    call_context = context.call_context
    if call_context is None:
        return None
    headers = call_context.state.get("headers") or {}
    return bearer_token(headers)


class TokenVerifier:
    """Verifies a JWT against the issuer's published keys."""

    def __init__(self, *, jwks_url: str, issuer: str, audience: str) -> None:
        self._issuer = issuer
        self._audience = audience
        self._keys = jwt.PyJWKClient(jwks_url, cache_keys=True, lifespan=3600, timeout=10)

    def verify(self, token: str) -> dict[str, Any]:
        """The token's claims. Raises ``jwt.PyJWTError`` when it does not verify."""
        key = self._keys.get_signing_key_from_jwt(token)
        return jwt.decode(
            token,
            key.key,
            algorithms=["RS256"],
            audience=self._audience,
            issuer=self._issuer,
            leeway=CLOCK_SKEW_SECONDS,
            options={"require": ["exp", "iss", "aud"]},
        )


class BearerAuthMiddleware:
    """Answers 401 unless the request carries a token that verifies."""

    def __init__(self, app: ASGIApp, *, verifier: TokenVerifier) -> None:
        self._app = app
        self._verifier = verifier

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http" or scope["path"] in OPEN_PATHS:
            await self._app(scope, receive, send)
            return

        headers = {k.decode("latin-1"): v.decode("latin-1") for k, v in scope["headers"]}
        token = bearer_token(headers)
        if token is None:
            await self._unauthorized(send, "a bearer token is required")
            return
        try:
            # The key lookup may fetch the JWKS; keep it off the event loop.
            claims = await asyncio.to_thread(self._verifier.verify, token)
        except jwt.PyJWKClientConnectionError as exc:
            # Not the caller's fault: the issuer's keys could not be fetched.
            logger.error("could not fetch the issuer's keys: %s", exc)
            await self._respond(send, 503, "unavailable", "the issuer's keys are unavailable")
            return
        except jwt.PyJWTError as exc:
            logger.info("bearer token rejected: %s", type(exc).__name__)
            await self._unauthorized(send, "the bearer token did not verify")
            return

        user = claims.get("preferred_username") or claims.get("client_id") or claims.get("sub")
        if isinstance(user, str):
            trace.get_current_span().set_attribute("enduser.id", user)
        await self._app(scope, receive, send)

    async def _unauthorized(self, send: Send, message: str) -> None:
        await self._respond(
            send,
            401,
            "unauthorized",
            message,
            [(b"www-authenticate", b'Bearer error="invalid_token"')],
        )

    @staticmethod
    async def _respond(
        send: Send,
        status: int,
        error: str,
        message: str,
        extra_headers: list[tuple[bytes, bytes]] | None = None,
    ) -> None:
        body = json.dumps({"error": error, "message": message}).encode()
        await send(
            {
                "type": "http.response.start",
                "status": status,
                "headers": [
                    (b"content-type", b"application/json"),
                    (b"content-length", str(len(body)).encode()),
                    *(extra_headers or []),
                ],
            }
        )
        await send({"type": "http.response.body", "body": body})
