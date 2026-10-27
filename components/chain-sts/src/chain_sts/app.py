"""The HTTP service: metadata, keys, the token endpoint and the health probe."""

from __future__ import annotations

import json
import logging
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from typing import Any
from urllib.parse import parse_qs

from starlette.applications import Starlette
from starlette.exceptions import HTTPException
from starlette.requests import Request
from starlette.responses import JSONResponse
from starlette.routing import Route

from .actors import actor_verifier
from .config import SERVICE_NAME, Config
from .keys import KeySet
from .oauth import Refusal
from .service import Parameters, TokenService
from .telemetry import instrument_app, setup_telemetry

WELL_KNOWN = ("/.well-known/oauth-authorization-server", "/.well-known/openid-configuration")
# A token exchange request is two tokens and a few names.
MAX_BODY_BYTES = 64 * 1024
MAX_FIELDS = 64
NO_STORE = {"Cache-Control": "no-store", "Pragma": "no-cache"}

log = logging.getLogger("chain_sts")


async def read_parameters(request: Request) -> Parameters:
    """The request's parameters, from a form or a JSON object. Refusal if neither."""
    unreadable = Refusal("invalid_request", "the request body could not be read")
    body = bytearray()
    async for chunk in request.stream():
        body += chunk
        if len(body) > MAX_BODY_BYTES:
            raise Refusal("invalid_request", "the request body is too large")
    if "application/json" not in request.headers.get("content-type", ""):
        try:
            return parse_qs(body.decode("utf-8", "replace"), max_num_fields=MAX_FIELDS)
        except ValueError:
            raise unreadable from None
    # kagent's own mock STS takes JSON as well as a form.
    try:
        raw = json.loads(bytes(body) or b"{}")
    except ValueError:
        raise unreadable from None
    if not isinstance(raw, dict):
        raise Refusal("invalid_request", "the request body is not a JSON object")
    params = {k: v if isinstance(v, list) else [v] for k, v in raw.items() if v is not None}
    return {k: [str(x) for x in v] for k, v in params.items()}


def refusal_response(refusal: Refusal) -> JSONResponse:
    return JSONResponse(refusal.body(), status_code=refusal.status, headers=NO_STORE)


def create_app(
    config: Config, *, app_version: str = "0.1.0", environment: str = "dev"
) -> Starlette:
    """The service for one configuration. Reads the keys and the actor's settings now."""
    setup_telemetry(SERVICE_NAME, app_version, environment)
    keys = KeySet.load(config.signing_keys)
    # Which key signs, and which are only published: the kids, as /jwks lists them.
    log.info("signing with kid %s", keys.kid, extra={"fields": {"keys": keys.kids()}})
    service = TokenService(config, keys, actor_verifier(config.actor))

    async def metadata(_request: Request) -> JSONResponse:
        return JSONResponse(service.metadata())

    async def jwks(_request: Request) -> JSONResponse:
        return JSONResponse(service.jwks())

    async def token(request: Request) -> JSONResponse:
        try:
            params = await read_parameters(request)
        except Refusal as refusal:
            service.refused(refusal)
            return refusal_response(refusal)
        try:
            return JSONResponse(await service.exchange(params), headers=NO_STORE)
        except Refusal as refusal:
            return refusal_response(refusal)

    async def healthz(_request: Request) -> JSONResponse:
        return JSONResponse(
            {"status": "ok", "service": SERVICE_NAME, "version": app_version, "keys": keys.kids()}
        )

    async def http_error(_request: Request, exc: HTTPException) -> JSONResponse:
        error = {404: "not_found", 405: "method_not_allowed"}.get(
            exc.status_code, "invalid_request"
        )
        return JSONResponse({"error": error}, status_code=exc.status_code, headers=exc.headers)

    @asynccontextmanager
    async def lifespan(_app: Starlette) -> AsyncIterator[None]:
        yield
        await service.aclose()

    routes: list[Any] = [Route(path, metadata, methods=["GET"]) for path in WELL_KNOWN]
    routes += [
        Route("/jwks", jwks, methods=["GET"]),
        Route("/token", token, methods=["POST"]),
        Route("/healthz", healthz, methods=["GET"]),
    ]
    app = Starlette(
        routes=routes, exception_handlers={HTTPException: http_error}, lifespan=lifespan
    )
    app.state.service = service
    instrument_app(app)
    return app
