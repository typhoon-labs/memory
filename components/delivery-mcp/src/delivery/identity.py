"""The caller, as the verified token describes them.

Signature, issuer, audience and expiry are checked here, in this service,
whatever stands in front of it. The user, roles and team come from the token's
claims and from nowhere else.

Two issuers may be trusted: Keycloak, for a user's own token, and chain-sts,
for a token it issued to an agent acting for a user. Each has its own keys, and
a token is verified against the keys of the issuer it names, and only those.
"""

from __future__ import annotations

import time
from collections.abc import Mapping
from dataclasses import dataclass
from typing import Any

from fastmcp.server.auth import AccessToken, TokenVerifier
from fastmcp.server.auth.providers.jwt import JWTVerifier
from fastmcp.utilities.auth import decode_jwt_payload
from fastmcp.utilities.logging import get_logger

from .config import Settings

# Seconds of clock difference tolerated between this service and the issuer.
CLOCK_SKEW_SECONDS = 30


# The most agents read from a token's nested `act`. chain-sts names at most
# its max_chain (4 in the dev cluster); anything deeper is not a chain it made.
MAX_CHAIN = 16


@dataclass(frozen=True)
class Caller:
    user: str
    roles: frozenset[str]
    team: str | None
    # The agents acting for the user, newest first, from the token's `act`:
    # each one's `client_id`, else its `sub`. Empty for the user's own token.
    chain: tuple[str, ...] = ()

    def has_role(self, role: str) -> bool:
        return role in self.roles

    def describe(self) -> str:
        roles = ", ".join(sorted(self.roles)) or "none"
        via = f"; through {', '.join(self.chain)}" if self.chain else ""
        return f"{self.user} (roles: {roles}; team: {self.team or 'none'}{via})"


def chain_from_act(act: Any) -> tuple[str, ...]:
    """The agents in a nested `act` claim, newest (outermost) first.

    Each is named by its `client_id`, chain-sts's agent name, else its `sub`.
    A level that names neither ends the chain, as does a value that is not a
    mapping.
    """
    names: list[str] = []
    while isinstance(act, Mapping) and len(names) < MAX_CHAIN:
        name = next(
            (
                value.strip()
                for value in (act.get("client_id"), act.get("sub"))
                if isinstance(value, str) and value.strip()
            ),
            None,
        )
        if name is None:
            break
        names.append(name)
        act = act.get("act")
    return tuple(names)


def caller_from_claims(claims: Mapping[str, Any]) -> Caller | None:
    """Build the caller from verified claims.

    A claim of the wrong type is treated as absent: ``roles`` given as a string
    grants no role, and a ``team`` that is not a string is no team. Returns None
    when the token names nobody.

    In a delegated token (one with ``act``) ``client_id`` and ``azp`` name the
    agent acting, not the user, so the user is ``preferred_username`` or ``sub``,
    and ``act`` gives the chain of agents.
    """
    names = ("preferred_username", "client_id", "azp", "sub")
    if "act" in claims:
        names = ("preferred_username", "sub")
    user = None
    for name in names:
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

    return Caller(user=user, roles=roles, team=team, chain=chain_from_act(claims.get("act")))


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


class IssuerVerifier(TokenVerifier):
    """Hands each token to the verifier of the issuer it names, or refuses it.

    The ``iss`` read here is not verified: it only chooses which issuer's keys
    the token must verify against. That verifier then checks everything again,
    the issuer included, so a token that names one issuer and is signed with
    another's key is refused. An issuer that is not configured is refused.
    """

    def __init__(self, verifiers: Mapping[str, StrictJWTVerifier]) -> None:
        super().__init__()
        self._verifiers = dict(verifiers)
        self.logger = get_logger(__name__)

    async def verify_token(self, token: str) -> AccessToken | None:
        try:
            payload = decode_jwt_payload(token)
        except ValueError:  # not three parts, not base64url, not JSON
            self.logger.debug("Bearer token rejected: not a JWT")
            return None
        issuer = payload.get("iss") if isinstance(payload, dict) else None
        verifier = self._verifiers.get(issuer) if isinstance(issuer, str) else None
        if verifier is None:
            self.logger.warning("Bearer token rejected: issuer %r is not trusted", issuer)
            return None
        return await verifier.verify_token(token)


def build_verifier(settings: Settings) -> IssuerVerifier:
    """Keycloak's verifier, and chain-sts's when it is configured, both RS256."""
    issuers = {settings.oidc_issuer: settings.oidc_jwks_url}
    if settings.delegation_issuer and settings.delegation_jwks_url:
        issuers[settings.delegation_issuer] = settings.delegation_jwks_url
    return IssuerVerifier(
        {
            issuer: StrictJWTVerifier(
                jwks_uri=jwks_url,
                issuer=issuer,
                audience=settings.oidc_audience,
                algorithm="RS256",
            )
            for issuer, jwks_url in issuers.items()
        }
    )
