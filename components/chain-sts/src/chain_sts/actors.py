"""Who the actor is: the calling agent's Kubernetes service account, proven by its token.

`actor.verify_with` chooses how the actor's token is checked:

- `token_review`: the Kubernetes API server checks it (a TokenReview), with
  this service's own service-account token and the cluster's CA from the
  standard paths in the pod. The API server checks the signature, the expiry
  and the audiences, and also refuses a bound token whose pod is gone. The
  service needs the right to create TokenReviews (the ClusterRole
  `system:auth-delegator`).
- `jwks`: the token is checked here, against the cluster's service-account
  issuer and its keys, from a file or a URL. For development: a token stays
  valid until it expires, even when its pod is gone. The API server serves
  its keys (`/openid/v1/jwks`) only to an authenticated caller, over TLS from
  the cluster's CA, so a URL may name a token file to send as the bearer and
  the CA to check the server against: the pod's own, from the standard paths.
  Every service account may read the keys (the ClusterRoleBinding
  `system:service-account-issuer-discovery`), so this needs no RBAC.

Either way the actor is accepted only for an audience in `actor.audiences`.
"""

from __future__ import annotations

import asyncio
import json
import logging
import ssl
from pathlib import Path
from typing import Any, Protocol

import httpx
import jwt

from .config import SERVICE_ACCOUNT, ActorSettings, ConfigError, JwksSettings, TokenReviewSettings
from .oauth import CLOCK_SKEW_SECONDS, Refusal, keys_unavailable, unavailable

log = logging.getLogger(__name__)

TOKEN_REVIEW_PATH = "/apis/authentication.k8s.io/v1/tokenreviews"
# The most of the API server's own words that a refusal passes on.
MAX_REASON = 300


class ActorVerifier(Protocol):
    async def verify(self, token: str) -> str:
        """The service account the token proves: `system:serviceaccount:<namespace>:<name>`.

        Raises Refusal when the token proves none, and a 503 Refusal when it
        cannot be checked now.
        """
        ...

    async def aclose(self) -> None: ...


def actor_verifier(settings: ActorSettings) -> ActorVerifier:
    if settings.verify_with == "token_review" and settings.token_review is not None:
        return TokenReviewActorVerifier(settings.token_review, settings.audiences)
    if settings.verify_with == "jwks" and settings.jwks is not None:
        return JwksActorVerifier(settings.jwks, settings.audiences)
    raise ConfigError(f"actor.verify_with is {settings.verify_with} and its settings are missing")


def _service_account(name: Any) -> str:
    if not isinstance(name, str) or not SERVICE_ACCOUNT.match(name):
        raise Refusal("invalid_request", "actor_token does not name a service account")
    return name


class BearerJWKClient(jwt.PyJWKClient):
    """A PyJWKClient that sends the token in a file as its bearer, read again for every fetch.

    The kubelet replaces a pod's projected token before it expires.
    """

    def __init__(self, uri: str, token_file: Path, **options: Any) -> None:
        super().__init__(uri, **options)
        self._token_file = token_file

    def fetch_data(self) -> Any:
        try:
            token = self._token_file.read_text(encoding="utf-8").strip()
        except OSError as exc:
            raise jwt.PyJWKClientConnectionError(
                f"cannot read the bearer token {self._token_file}: {exc.strerror or exc}"
            ) from None
        self.headers = {**self.headers, "Authorization": f"Bearer {token}"}
        return super().fetch_data()


class JwksActorVerifier:
    """Checks the token here, against the service-account issuer's keys."""

    def __init__(self, settings: JwksSettings, audiences: tuple[str, ...]) -> None:
        self._issuer = settings.issuer
        self._audiences = list(audiences)
        self._keys: jwt.PyJWKSet | None = None
        self._client: jwt.PyJWKClient | None = None
        if settings.jwks_file is not None:
            # Read once, at start: refresh the file and restart when the
            # cluster's key changes.
            try:
                data = json.loads(settings.jwks_file.read_text(encoding="utf-8"))
                self._keys = jwt.PyJWKSet.from_dict(data)
            except (OSError, ValueError, jwt.PyJWTError) as exc:
                raise ConfigError(
                    f"cannot read the cluster's keys from {settings.jwks_file}: {exc}"
                ) from exc
        elif settings.jwks_url is not None:
            context = None
            if settings.ca_file is not None:
                try:
                    context = ssl.create_default_context(cafile=str(settings.ca_file))
                except (OSError, ssl.SSLError) as exc:
                    raise ConfigError(f"cannot read the CA {settings.ca_file}: {exc}") from exc
            options: dict[str, Any] = {
                "cache_keys": True,
                "lifespan": 300,
                "timeout": 10,
                "ssl_context": context,
            }
            if settings.token_file is None:
                self._client = jwt.PyJWKClient(settings.jwks_url, **options)
            elif settings.token_file.is_file():
                self._client = BearerJWKClient(settings.jwks_url, settings.token_file, **options)
            else:
                raise ConfigError(f"the bearer token for the keys is not at {settings.token_file}")
        else:
            raise ConfigError("actor.jwks needs jwks_file or jwks_url")

    async def verify(self, token: str) -> str:
        if self._client is not None:
            # The key lookup may fetch the JWKS; keep it off the event loop.
            return await asyncio.to_thread(self._verify, token)
        return self._verify(token)

    def _key(self, token: str) -> Any:
        if self._client is not None:
            return self._client.get_signing_key_from_jwt(token).key
        kid = jwt.get_unverified_header(token).get("kid")
        for key in self._keys.keys if self._keys is not None else []:
            if key.key_id == kid:
                return key.key
        raise jwt.InvalidKeyError("no key with this kid")

    def _verify(self, token: str) -> str:
        try:
            claims = jwt.decode(
                token,
                self._key(token),
                algorithms=["RS256"],
                audience=self._audiences,
                issuer=self._issuer,
                leeway=CLOCK_SKEW_SECONDS,
                options={"require": ["exp", "iss", "sub", "aud"]},
            )
        except jwt.PyJWKClientConnectionError as exc:
            log.error("cannot fetch the cluster's keys: %s", exc)
            raise keys_unavailable("actor_token") from None
        except jwt.PyJWTError as exc:
            raise Refusal(
                "invalid_request", f"actor_token did not verify: {type(exc).__name__}"
            ) from None
        return _service_account(claims["sub"])

    async def aclose(self) -> None:
        return None


class TokenReviewActorVerifier:
    """Asks the Kubernetes API server, with a TokenReview, whose token it is."""

    def __init__(self, settings: TokenReviewSettings, audiences: tuple[str, ...]) -> None:
        self._token_file = settings.token_file
        self._audiences = list(audiences)
        if not settings.token_file.is_file():
            raise ConfigError(f"this service's own token is not at {settings.token_file}")
        try:
            context = ssl.create_default_context(cafile=str(settings.ca_file))
        except (OSError, ssl.SSLError) as exc:
            raise ConfigError(f"cannot read the cluster's CA {settings.ca_file}: {exc}") from exc
        self._client = httpx.AsyncClient(
            base_url=settings.api_server, verify=context, timeout=settings.timeout_seconds
        )

    async def verify(self, token: str) -> str:
        cannot_check = unavailable("the actor_token could not be checked now")
        try:
            # Read at every request: the kubelet replaces a projected token
            # before it expires.
            own_token = self._token_file.read_text(encoding="utf-8").strip()
        except OSError as exc:
            log.error("cannot read this service's own token %s: %s", self._token_file, exc)
            raise cannot_check from None
        review = {
            "apiVersion": "authentication.k8s.io/v1",
            "kind": "TokenReview",
            "spec": {"token": token, "audiences": self._audiences},
        }
        try:
            response = await self._client.post(
                TOKEN_REVIEW_PATH, json=review, headers={"Authorization": f"Bearer {own_token}"}
            )
        except httpx.HTTPError as exc:
            log.error("TokenReview failed: %s: %s", type(exc).__name__, exc)
            raise cannot_check from None
        if not response.is_success:
            log.error(
                "TokenReview answered HTTP %s: %s", response.status_code, response.text[:MAX_REASON]
            )
            raise cannot_check
        try:
            status = response.json()["status"]
            if not isinstance(status, dict):
                raise TypeError("status is not an object")
        except (ValueError, KeyError, TypeError) as exc:
            log.error("TokenReview answered without a status: %s", exc)
            raise cannot_check from None

        if status.get("authenticated") is not True:
            reason = str(status.get("error") or "the API server did not authenticate it")
            raise Refusal("invalid_request", f"actor_token did not verify: {reason[:MAX_REASON]}")
        # The API server answers with the audiences it found in both the token
        # and the request. None means it did not check them.
        granted = status.get("audiences")
        if not isinstance(granted, list) or not set(granted) & set(self._audiences):
            raise Refusal(
                "invalid_request",
                "actor_token did not verify: the API server confirmed no audience this service"
                " accepts",
            )
        user = status.get("user")
        return _service_account(user.get("username") if isinstance(user, dict) else None)

    async def aclose(self) -> None:
        await self._client.aclose()
