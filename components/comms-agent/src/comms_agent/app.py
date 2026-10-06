"""The A2A server.

Strands' ``A2AServer`` provides the agent card and the JSON-RPC application.
Its request handler is given this agent's own executor: the incident is read by
code, as the caller, and only the wording is left to the model.
"""

from __future__ import annotations

from a2a.server.request_handlers import DefaultRequestHandler
from a2a.server.tasks import InMemoryTaskStore
from a2a.types import AgentCard, AgentSkill, HTTPAuthSecurityScheme, SecurityScheme
from starlette.applications import Starlette
from starlette.middleware import Middleware
from starlette.requests import Request
from starlette.responses import JSONResponse
from starlette.routing import Route
from strands.multiagent.a2a import A2AServer

from .auth import BearerAuthMiddleware, TokenVerifier
from .config import SERVICE_NAME, Settings
from .executor import ACTION, CommsExecutor
from .model import build_agent
from .telemetry import instrument_app, setup_telemetry

SKILL = AgentSkill(
    id=ACTION,
    name="Draft a status update",
    description=(
        "Reads the incident from delivery-mcp as the caller and returns a status update"
        " draft of at most 80 words. It does not post the draft."
    ),
    tags=["incident", "communication", "draft"],
    examples=['{"action": "draft_status_update", "incident_id": "INC-0001"}'],
    input_modes=["application/json", "text/plain"],
    output_modes=["text/plain", "application/json"],
)


class CommsA2AServer(A2AServer):
    """Strands' server, with a card that says how to call this agent."""

    @property
    def public_agent_card(self) -> AgentCard:
        card = super().public_agent_card
        return card.model_copy(
            update={
                "default_input_modes": ["application/json", "text/plain"],
                "default_output_modes": ["text/plain", "application/json"],
                "security_schemes": {
                    "bearer": SecurityScheme(
                        root=HTTPAuthSecurityScheme(
                            scheme="bearer",
                            bearer_format="JWT",
                            description="The signed-in caller's access token. It is forwarded"
                            " to delivery-mcp and to the model endpoint.",
                        )
                    )
                },
                "security": [{"bearer": []}],
            }
        )


def create_app(settings: Settings) -> Starlette:
    setup_telemetry(SERVICE_NAME, settings.app_version, settings.environment)

    server = CommsA2AServer(
        # Strands builds one agent from this factory to read the card's name and
        # description. Requests never use it: each request builds its own agent
        # around the caller's token (model.build_agent).
        agent_factory=lambda _context_id: build_agent(settings, token="agent-card-only"),
        host=settings.host,
        port=settings.port,
        http_url=settings.public_url,
        # Serve at "/" whatever path the public URL has; the gateway owns the prefix.
        serve_at_root=True,
        version=settings.app_version,
        skills=[SKILL],
    )
    server.request_handler = DefaultRequestHandler(
        agent_executor=CommsExecutor(settings),
        task_store=InMemoryTaskStore(),
    )

    async def healthz(_request: Request) -> JSONResponse:
        return JSONResponse(
            {"status": "ok", "service": SERVICE_NAME, "version": settings.app_version}
        )

    verifier = TokenVerifier(
        jwks_url=settings.oidc_jwks_url,
        issuer=settings.oidc_issuer,
        audience=settings.oidc_audience,
    )
    app = server.to_starlette_app(
        app_kwargs={
            "routes": [Route("/healthz", healthz, methods=["GET"])],
            "middleware": [Middleware(BearerAuthMiddleware, verifier=verifier)],
        }
    )
    instrument_app(app)
    return app
