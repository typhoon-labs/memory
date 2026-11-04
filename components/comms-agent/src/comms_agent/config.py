"""Bindings read from the environment. The agent holds no credential of its own."""

from __future__ import annotations

import os
from collections.abc import Mapping
from dataclasses import dataclass
from typing import NamedTuple

SERVICE_NAME = "comms-agent"

REQUIRED = (
    "OIDC_ISSUER",
    "OIDC_JWKS_URL",
    "OIDC_AUDIENCE",
    "DELIVERY_MCP_URL",
    "MODEL_BASE_URL",
    "MODEL_ID",
)


class ConfigError(RuntimeError):
    """The environment does not describe a runnable agent."""


class TrustedIssuer(NamedTuple):
    """Where an issuer's keys are, and the audiences its tokens must carry one of."""

    jwks_url: str
    audiences: tuple[str, ...]


@dataclass(frozen=True)
class Settings:
    app_version: str
    environment: str
    host: str
    port: int
    public_url: str

    oidc_issuer: str
    oidc_jwks_url: str
    oidc_audience: str
    # chain-sts, whose tokens name the agents acting for a user. All three or
    # none. Its tokens must carry one of `delegation_audiences`: this agent's
    # own resource, the gateway route that reaches it, and never OIDC_AUDIENCE
    # unless it is listed.
    delegation_issuer: str | None
    delegation_jwks_url: str | None
    delegation_audiences: tuple[str, ...]
    # chain-sts's token exchange, which the caller's token goes through before
    # any call out (delegation.py). Both or neither, whatever the two above are.
    delegation_metadata_url: str | None
    delegation_actor_token_file: str | None

    delivery_mcp_url: str

    model_base_url: str
    model_id: str
    model_id_fast: str
    model_timeout_seconds: float

    max_words: int

    def trusted_issuers(self) -> dict[str, TrustedIssuer]:
        """Each issuer whose tokens are accepted, with the URL of its keys and its audiences.

        Keycloak's tokens carry OIDC_AUDIENCE. chain-sts issues each token for
        one target, so its tokens must carry one of DELEGATION_AUDIENCE.
        """
        issuers = {self.oidc_issuer: TrustedIssuer(self.oidc_jwks_url, (self.oidc_audience,))}
        if self.delegation_issuer and self.delegation_jwks_url:
            issuers[self.delegation_issuer] = TrustedIssuer(
                self.delegation_jwks_url, self.delegation_audiences
            )
        return issuers

    @property
    def delivery_resource(self) -> str:
        """The resource (RFC 8707) asked for at chain-sts for delivery-mcp: its URL."""
        return self.delivery_mcp_url.rstrip("/")

    @property
    def model_resource(self) -> str:
        """The resource asked for at chain-sts for the model route.

        Its paths are /v1/messages, /v1/chat/completions and /v1/models, so its
        resource is MODEL_BASE_URL with /v1, not the gateway's bare address.
        """
        return f"{self.model_base_url}/v1"


def load_settings(env: Mapping[str, str] | None = None) -> Settings:
    env = os.environ if env is None else env

    def get(name: str, default: str = "") -> str:
        return (env.get(name) or default).strip()

    missing = [name for name in REQUIRED if not get(name)]
    if missing:
        raise ConfigError("missing required environment variables: " + ", ".join(missing))

    def all_or_none(*names: str) -> dict[str, str]:
        values = {n: get(n) for n in names}
        if any(values.values()) and not all(values.values()):
            given = next(n for n, v in values.items() if v)
            absent = next(n for n, v in values.items() if not v)
            together = "both, or neither" if len(names) == 2 else "all of them, or none"
            raise ConfigError(f"{given} is set and {absent} is not: set {together}")
        return values

    delegation = all_or_none("DELEGATION_ISSUER", "DELEGATION_JWKS_URL", "DELEGATION_AUDIENCE")
    exchange = all_or_none("DELEGATION_METADATA_URL", "DELEGATION_ACTOR_TOKEN_FILE")
    if delegation["DELEGATION_ISSUER"] and delegation["DELEGATION_ISSUER"] == get("OIDC_ISSUER"):
        raise ConfigError("DELEGATION_ISSUER must differ from OIDC_ISSUER")
    delegation_audiences = tuple(
        a.strip() for a in delegation["DELEGATION_AUDIENCE"].split(",") if a.strip()
    )
    if delegation["DELEGATION_AUDIENCE"] and not delegation_audiences:
        raise ConfigError("DELEGATION_AUDIENCE names no audience")

    port = int(get("PORT", "8080"))
    return Settings(
        app_version=get("APP_VERSION", "0.1.0"),
        environment=get("DEPLOYMENT_ENVIRONMENT", "dev"),
        host=get("HOST", "127.0.0.1"),
        port=port,
        # The address callers use, as it should appear in the agent card. In the
        # cluster this is the gateway's route to this agent.
        public_url=get("A2A_PUBLIC_URL", f"http://localhost:{port}/"),
        oidc_issuer=get("OIDC_ISSUER"),
        oidc_jwks_url=get("OIDC_JWKS_URL"),
        oidc_audience=get("OIDC_AUDIENCE"),
        delegation_issuer=delegation["DELEGATION_ISSUER"] or None,
        delegation_jwks_url=delegation["DELEGATION_JWKS_URL"] or None,
        # Comma-separated; one is enough. Two during a rollout that changes it.
        delegation_audiences=delegation_audiences,
        delegation_metadata_url=exchange["DELEGATION_METADATA_URL"] or None,
        delegation_actor_token_file=exchange["DELEGATION_ACTOR_TOKEN_FILE"] or None,
        delivery_mcp_url=get("DELIVERY_MCP_URL"),
        model_base_url=get("MODEL_BASE_URL").rstrip("/"),
        # The draft is written with MODEL_ID. MODEL_ID_FAST is read so that the
        # three model bindings are the same everywhere; this agent does not use it.
        model_id=get("MODEL_ID"),
        model_id_fast=get("MODEL_ID_FAST", get("MODEL_ID")),
        model_timeout_seconds=float(get("MODEL_TIMEOUT_SECONDS", "45")),
        # The limit on a draft. It is a ceiling: the environment can lower it, not raise it.
        max_words=min(int(get("DRAFT_MAX_WORDS", "80")), 80),
    )
