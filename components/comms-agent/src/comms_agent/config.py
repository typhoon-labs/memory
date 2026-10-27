"""Bindings read from the environment. The agent holds no credential of its own."""

from __future__ import annotations

import os
from collections.abc import Mapping
from dataclasses import dataclass

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
    # chain-sts, whose tokens name the agents acting for a user. Both or neither.
    delegation_issuer: str | None
    delegation_jwks_url: str | None
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

    def trusted_issuers(self) -> dict[str, str]:
        """Each issuer whose tokens are accepted, with the URL of its keys."""
        issuers = {self.oidc_issuer: self.oidc_jwks_url}
        if self.delegation_issuer and self.delegation_jwks_url:
            issuers[self.delegation_issuer] = self.delegation_jwks_url
        return issuers


def load_settings(env: Mapping[str, str] | None = None) -> Settings:
    env = os.environ if env is None else env

    def get(name: str, default: str = "") -> str:
        return (env.get(name) or default).strip()

    missing = [name for name in REQUIRED if not get(name)]
    if missing:
        raise ConfigError("missing required environment variables: " + ", ".join(missing))

    def both_or_neither(*names: str) -> dict[str, str]:
        values = {n: get(n) for n in names}
        if any(values.values()) and not all(values.values()):
            given = next(n for n, v in values.items() if v)
            absent = next(n for n, v in values.items() if not v)
            raise ConfigError(f"{given} is set and {absent} is not: set both, or neither")
        return values

    delegation = both_or_neither("DELEGATION_ISSUER", "DELEGATION_JWKS_URL")
    exchange = both_or_neither("DELEGATION_METADATA_URL", "DELEGATION_ACTOR_TOKEN_FILE")
    if delegation["DELEGATION_ISSUER"] and delegation["DELEGATION_ISSUER"] == get("OIDC_ISSUER"):
        raise ConfigError("DELEGATION_ISSUER must differ from OIDC_ISSUER")

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
