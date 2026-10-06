"""The caller, as the verified token describes them.

Signature, issuer, audience and expiry are checked here, in this service,
whatever stands in front of it. The user, roles and team come from the token's
claims and from nowhere else.
"""

from __future__ import annotations

import time
from collections.abc import Mapping
from dataclasses import dataclass
from typing import Any

from fastmcp.server.auth import AccessToken
from fastmcp.server.auth.providers.jwt import JWTVerifier

from .config import Settings

# Seconds of clock difference tolerated between this service and the issuer.
CLOCK_SKEW_SECONDS = 30


@dataclass(frozen=True)
class Caller:
    user: str
    roles: frozenset[str]
    team: str | None

    def has_role(self, role: str) -> bool:
        return role in self.roles

    def describe(self) -> str:
        roles = ", ".join(sorted(self.roles)) or "none"
        return f"{self.user} (roles: {roles}; team: {self.team or 'none'})"


def caller_from_claims(claims: Mapping[str, Any]) -> Caller | None:
    """Build the caller from verified claims.

    A claim of the wrong type is treated as absent: ``roles`` given as a string
    grants no role, and a ``team`` that is not a string is no team. Returns None
    when the token names nobody.
    """
    user = None
    for name in ("preferred_username", "client_id", "azp", "sub"):
        value = claims.get(name)
        if isinstance(value, str) and value.strip():
            user = value.strip()
            break
    if user is None:
        return None

    raw_roles = claims.get("roles")
    roles = (
        frozenset(r for r in raw_roles if isinstance(r, str) and r)
        if isinstance(raw_roles, list)
        else frozenset()
    )

    raw_team = claims.get("team")
    team = raw_team.strip() if isinstance(raw_team, str) and raw_team.strip() else None

    return Caller(user=user, roles=roles, team=team)


class StrictJWTVerifier(JWTVerifier):
    """FastMCP's JWT verifier, minus its tolerance for tokens with no expiry.

    The base class checks the signature against the JWKS, the issuer and the
    audience, and rejects a token whose ``exp`` has passed. It accepts a token
    that carries no ``exp`` at all, and it does not look at ``nbf``. Both are
    closed here.
    """

    async def load_access_token(self, token: str) -> AccessToken | None:
        access = await super().load_access_token(token)
        if access is None:
            return None
        claims = access.claims
        now = time.time()

        exp = claims.get("exp")
        if isinstance(exp, bool) or not isinstance(exp, (int, float)):
            self.logger.warning("Bearer token rejected: no usable exp claim")
            return None
        if exp < now:
            return None

        nbf = claims.get("nbf")
        if nbf is not None:
            if isinstance(nbf, bool) or not isinstance(nbf, (int, float)):
                self.logger.warning("Bearer token rejected: nbf is not a number")
                return None
            if nbf > now + CLOCK_SKEW_SECONDS:
                self.logger.warning("Bearer token rejected: not valid yet")
                return None

        if not claims.get("iss") or not claims.get("aud"):
            self.logger.warning("Bearer token rejected: iss or aud missing")
            return None
        return access


def build_verifier(settings: Settings) -> StrictJWTVerifier:
    return StrictJWTVerifier(
        jwks_uri=settings.oidc_jwks_url,
        issuer=settings.oidc_issuer,
        audience=settings.oidc_audience,
        algorithm="RS256",
    )
