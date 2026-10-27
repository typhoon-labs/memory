"""The exchange: RFC 8693 delegation, and nothing else.

The subject is a user's token from a trusted identity provider, or a token this
service issued. The actor is the calling agent, proven by its Kubernetes
service-account token. The issued token keeps the user as `sub`, carries the
user's claims on, and names every agent in a nested `act`, the newest
outermost. Every decision writes one audit line.
"""

from __future__ import annotations

import asyncio
import logging
import time
import uuid
from typing import Any

import jwt

from .actors import ActorVerifier
from .config import Agent, Config
from .keys import ALGORITHM, KeySet
from .oauth import (
    ACCEPTED_TOKEN_TYPES,
    ACCESS_TOKEN_TYPE,
    CLOCK_SKEW_SECONDS,
    JWT_TYPE,
    TOKEN_EXCHANGE,
    Refusal,
    keys_unavailable,
)

log = logging.getLogger("chain_sts")
audit = logging.getLogger("chain_sts.audit")

Parameters = dict[str, list[str]]


def chain_of(act: Any) -> list[str]:
    """The `sub` of every actor in a nested `act`, newest first."""
    chain: list[str] = []
    while isinstance(act, dict):
        if isinstance(act.get("sub"), str):
            chain.append(act["sub"])
        act = act.get("act")
    return chain


class TokenService:
    def __init__(self, config: Config, keys: KeySet, actors: ActorVerifier) -> None:
        self.config = config
        self.keys = keys
        self._actors = actors
        self._subject_keys = {
            issuer: jwt.PyJWKClient(s.jwks_url, cache_keys=True, lifespan=300, timeout=10)
            for issuer, s in config.subject_issuers.items()
        }

    def metadata(self) -> dict[str, Any]:
        """Authorization server metadata (RFC 8414), as kagent's clients read it."""
        return {
            "issuer": self.config.issuer,
            # From the configuration, not from the request: kagent's Go client
            # uses this address as it is.
            "token_endpoint": f"{self.config.public_url}/token",
            "jwks_uri": f"{self.config.public_url}/jwks",
            "grant_types_supported": [TOKEN_EXCHANGE],
            "token_endpoint_auth_methods_supported": ["none"],
        }

    def jwks(self) -> dict[str, Any]:
        return self.keys.jwks()

    async def aclose(self) -> None:
        await self._actors.aclose()

    # -- the exchange ---------------------------------------------------------

    async def exchange(self, params: Parameters) -> dict[str, Any]:
        """Issue a token or refuse; either way, write one audit line."""
        # Who asked, as far as their tokens have verified.
        asked: dict[str, str] = {}
        try:
            return await self._exchange(params, asked)
        except Refusal as refusal:
            self.refused(refusal, asked)
            raise
        except Exception as exc:
            log.exception("token exchange failed")
            refusal = Refusal("server_error", "the exchange failed", status=500)
            self.refused(refusal, asked)
            raise refusal from exc

    def refused(self, refusal: Refusal, asked: dict[str, str] | None = None) -> None:
        audit.info(
            "token exchange refused",
            extra={
                "fields": {
                    "event": "token_exchange",
                    "outcome": "refused",
                    **(asked or {}),
                    "error": refusal.error,
                    "reason": refusal.description,
                }
            },
        )

    async def _exchange(self, params: Parameters, asked: dict[str, str]) -> dict[str, Any]:
        def one(name: str) -> str | None:
            values = params.get(name) or []
            if len(values) > 1:
                raise Refusal("invalid_request", f"{name} was given more than once")
            return values[0] if values else None

        if one("grant_type") != TOKEN_EXCHANGE:
            raise Refusal("unsupported_grant_type", "only token exchange is supported")
        subject_token, actor_token = one("subject_token"), one("actor_token")
        if not subject_token:
            raise Refusal("invalid_request", "subject_token is required")
        if one("subject_token_type") not in ACCEPTED_TOKEN_TYPES:
            raise Refusal("invalid_request", "subject_token_type must be a JWT or an access token")
        if not actor_token:
            # kagent sends no actor_token when the pod has no service-account
            # token. Without one nothing names the agent, so nothing is issued.
            raise Refusal("invalid_request", "actor_token is required: this service only delegates")
        if one("actor_token_type") not in ACCEPTED_TOKEN_TYPES:
            raise Refusal("invalid_request", "actor_token_type must be a JWT or an access token")
        if one("requested_token_type") not in (None, ACCESS_TOKEN_TYPE, JWT_TYPE):
            raise Refusal("invalid_request", "only an access token can be issued")

        # kagent sends KAGENT_STS_AUDIENCE as `audience` and KAGENT_STS_RESOURCE
        # as `resource`; both name where the token will be used.
        requested = [*(params.get("audience") or []), *(params.get("resource") or [])]
        not_allowed = [a for a in requested if a not in self.config.audiences]
        if not_allowed:
            raise Refusal(
                "invalid_target", f"not an audience this service issues for: {not_allowed}"
            )
        audience = list(dict.fromkeys(requested)) or [self.config.audiences[0]]

        service_account = await self._actors.verify(actor_token)
        asked["service_account"] = service_account
        agent = self.config.by_service_account.get(service_account)
        if agent is None:
            raise Refusal(
                "unauthorized_client", f"{service_account} is not an agent this service knows"
            )
        asked["agent"] = agent.name
        subject, ours = await self._verify_subject(subject_token, agent)
        asked["user"] = subject.get("preferred_username") or subject["sub"]

        previous_act = subject.get("act")
        if ours:
            chain = chain_of(previous_act)
            current = self.config.by_service_account.get(chain[0]) if chain else None
            if current is None:
                raise Refusal("invalid_request", "subject_token names no agent this service knows")
            if current.name not in agent.after:
                raise Refusal(
                    "unauthorized_client", f"{agent.name} may not act after {current.name}"
                )
            if agent.service_account in chain:
                raise Refusal("unauthorized_client", f"{agent.name} is already in the chain")
            if len(chain) + 1 > self.config.max_chain:
                raise Refusal(
                    "unauthorized_client", f"the chain would exceed {self.config.max_chain} agents"
                )
        else:
            if previous_act is not None:
                raise Refusal(
                    "invalid_request",
                    "subject_token already names an actor this service did not record",
                )
            if not agent.act_for_users:
                raise Refusal(
                    "unauthorized_client", f"{agent.name} may not act on a user's own token"
                )
            may_act = subject.get("may_act")
            if may_act is not None:
                # kagent's convention names the service account in `sub`,
                # Keycloak's delegation names the client in `client_id`.
                names_agent = isinstance(may_act, dict) and (
                    may_act.get("sub") == agent.service_account
                    or may_act.get("client_id") == agent.name
                )
                if not names_agent:
                    raise Refusal(
                        "invalid_request", f"may_act in subject_token does not name {agent.name}"
                    )
            elif self.config.require_may_act:
                raise Refusal("invalid_request", "subject_token carries no may_act")

        now = int(time.time())
        expires = min(int(subject["exp"]), now + self.config.token_ttl_seconds)
        if expires <= now:
            # The clock-skew allowance let an expired subject through; a token
            # issued from it would be born expired.
            raise Refusal("invalid_request", "subject_token has expired")
        act: dict[str, Any] = {"sub": agent.service_account, "client_id": agent.name}
        if previous_act is not None:
            act["act"] = previous_act
        claims: dict[str, Any] = {
            "iss": self.config.issuer,
            "sub": subject["sub"],
            "aud": audience[0] if len(audience) == 1 else audience,
            "iat": now,
            "nbf": now,
            "exp": expires,
            "jti": str(uuid.uuid4()),
            "client_id": agent.name,
            "act": act,
        }
        for name in self.config.carry_claims:
            if name in subject:
                claims[name] = subject[name]
        token = self.keys.sign(claims)
        audit.info(
            "token exchange issued",
            extra={
                "fields": {
                    "event": "token_exchange",
                    "outcome": "issued",
                    "jti": claims["jti"],
                    "user": asked["user"],
                    "chain": [self._name(sa) for sa in chain_of(act)],
                    "aud": claims["aud"],
                    "exp": expires,
                }
            },
        )
        return {
            "access_token": token,
            "issued_token_type": ACCESS_TOKEN_TYPE,
            "token_type": "Bearer",
            "expires_in": expires - now,
        }

    async def _verify_subject(self, token: str, agent: Agent) -> tuple[dict[str, Any], bool]:
        """The subject's claims, and whether this service issued the token.

        A user's own token must carry an audience the agent may exchange: its
        `subject_audiences`, else the identity provider's audience.
        """
        try:
            issuer = jwt.decode(token, options={"verify_signature": False}).get("iss")
        except jwt.PyJWTError as exc:
            raise Refusal(
                "invalid_request", f"subject_token is not a JWT: {type(exc).__name__}"
            ) from None
        if issuer == self.config.issuer:
            key: Any = self.keys.verification_key(token)
            audience: str | list[str] = list(self.config.audiences)
            ours = True
        elif issuer in self._subject_keys:
            client = self._subject_keys[issuer]
            try:
                # The key lookup may fetch the JWKS; keep it off the event loop.
                key = (await asyncio.to_thread(client.get_signing_key_from_jwt, token)).key
            except jwt.PyJWKClientConnectionError:
                raise keys_unavailable("subject_token") from None
            except jwt.PyJWTError as exc:
                raise Refusal(
                    "invalid_request", f"subject_token did not verify: {type(exc).__name__}"
                ) from None
            audience = list(agent.subject_audiences) or self.config.subject_issuers[issuer].audience
            ours = False
        else:
            raise Refusal(
                "invalid_request", "subject_token is from an issuer this service does not trust"
            )
        try:
            claims = jwt.decode(
                token,
                key,
                algorithms=[ALGORITHM],
                audience=audience,
                issuer=issuer,
                leeway=CLOCK_SKEW_SECONDS,
                options={"require": ["exp", "iss", "sub", "aud"]},
            )
        except jwt.InvalidAudienceError:
            allowed = [audience] if isinstance(audience, str) else audience
            whose = "this service's tokens" if ours else f"a user's token {agent.name} may exchange"
            raise Refusal(
                "invalid_request",
                f"subject_token did not verify: InvalidAudienceError,"
                f" its audience is not one of {whose}: {allowed}",
            ) from None
        except jwt.PyJWTError as exc:
            raise Refusal(
                "invalid_request", f"subject_token did not verify: {type(exc).__name__}"
            ) from None
        return claims, ours

    def _name(self, service_account: str) -> str:
        agent = self.config.by_service_account.get(service_account)
        return agent.name if agent else service_account
