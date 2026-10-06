"""Bindings read from the environment. Nothing here has a secret."""

from __future__ import annotations

import os
import re
from collections.abc import Mapping
from dataclasses import dataclass

SERVICE_NAME = "delivery-mcp"

# Which team owns which service. Ownership is a fact about the Sample App, not
# something a caller can supply.
SERVICE_OWNERS: dict[str, str] = {
    "search-service": "search",
    "registration-service": "registration",
    "web": "web",
}

# The Helm value that selects each service's version. A service without an entry
# has no selection this service can change.
VERSION_VALUE_KEYS: dict[str, str] = {
    "search-service": "searchService.image.tag",
}

# A version is an image tag. Anything else never reaches a command line.
VERSION_PATTERN = re.compile(r"^[0-9A-Za-z][0-9A-Za-z._-]{0,62}$")


class ConfigError(RuntimeError):
    """The environment does not describe a runnable service."""


@dataclass(frozen=True)
class Settings:
    app_version: str
    environment: str

    oidc_issuer: str
    oidc_jwks_url: str
    oidc_audience: str

    db_path: str

    applier: str  # "fake" or "helm"
    retained_versions: tuple[str, ...]
    fake_current_version: str
    fake_apply_seconds: float

    helm_bin: str
    helm_release: str
    helm_namespace: str
    helm_chart_ref: str
    helm_chart_version: str
    helm_plain_http: bool
    helm_timeout_seconds: int

    verify_search_url: str
    verify_results_field: str
    verify_timeout_seconds: float
    verify_interval_seconds: float

    restart_label_selector: str

    stateless_http: bool


def _flag(value: str) -> bool:
    return value.strip().lower() in {"1", "true", "yes", "on"}


def load_settings(env: Mapping[str, str] | None = None) -> Settings:
    """Read and check the environment.

    The service refuses to start without the three identity bindings: there is no
    mode in which it accepts a call it cannot attribute to a verified caller.
    """
    env = os.environ if env is None else env

    def get(name: str, default: str = "") -> str:
        return (env.get(name) or default).strip()

    missing = [n for n in ("OIDC_ISSUER", "OIDC_JWKS_URL", "OIDC_AUDIENCE") if not get(n)]
    if missing:
        raise ConfigError("missing required environment variables: " + ", ".join(missing))

    applier = get("APPLIER", "fake").lower()
    if applier not in {"fake", "helm"}:
        raise ConfigError(f"APPLIER must be 'fake' or 'helm', got {applier!r}")

    retained = tuple(v.strip() for v in get("RETAINED_VERSIONS", "2.0.0").split(",") if v.strip())
    bad = [v for v in retained if not VERSION_PATTERN.match(v)]
    if bad:
        raise ConfigError(f"RETAINED_VERSIONS has entries that are not versions: {bad}")

    settings = Settings(
        app_version=get("APP_VERSION", "0.1.0"),
        environment=get("DEPLOYMENT_ENVIRONMENT", "dev"),
        oidc_issuer=get("OIDC_ISSUER"),
        oidc_jwks_url=get("OIDC_JWKS_URL"),
        oidc_audience=get("OIDC_AUDIENCE"),
        db_path=get("DELIVERY_DB_PATH", ":memory:"),
        applier=applier,
        retained_versions=retained,
        fake_current_version=get("FAKE_CURRENT_VERSION", "2.1.0"),
        fake_apply_seconds=float(get("FAKE_APPLY_SECONDS", "0")),
        helm_bin=get("HELM_BIN", "helm"),
        helm_release=get("HELM_RELEASE", "sample-app"),
        helm_namespace=get("HELM_NAMESPACE", "sample-app"),
        helm_chart_ref=get("HELM_CHART_REF"),
        helm_chart_version=get("HELM_CHART_VERSION"),
        helm_plain_http=_flag(get("HELM_PLAIN_HTTP", "false")),
        helm_timeout_seconds=int(get("HELM_TIMEOUT_SECONDS", "120")),
        verify_search_url=get("VERIFY_SEARCH_URL"),
        verify_results_field=get("VERIFY_RESULTS_FIELD", "results"),
        verify_timeout_seconds=float(get("VERIFY_TIMEOUT_SECONDS", "90")),
        verify_interval_seconds=float(get("VERIFY_INTERVAL_SECONDS", "2")),
        restart_label_selector=get("RESTART_LABEL_SELECTOR", "app.kubernetes.io/name={service}"),
        stateless_http=_flag(get("MCP_STATELESS_HTTP", "true")),
    )

    if settings.applier == "helm":
        # A real change is only ever marked applied after a real search request.
        needed = [
            n
            for n, v in (
                ("HELM_CHART_REF", settings.helm_chart_ref),
                ("VERIFY_SEARCH_URL", settings.verify_search_url),
            )
            if not v
        ]
        if needed:
            raise ConfigError("APPLIER=helm also needs: " + ", ".join(needed))
    if "{service}" not in settings.restart_label_selector:
        raise ConfigError("RESTART_LABEL_SELECTOR must contain the placeholder {service}")
    return settings
