"""Exchanging the caller's token at chain-sts before calling out.

With DELEGATION_METADATA_URL and DELEGATION_ACTOR_TOKEN_FILE set, the caller's
token is not sent on. Once per task, before the first call out, it is exchanged
at chain-sts (RFC 8693) with this agent's projected service-account token as
the actor, and delivery-mcp and the model endpoint get only the token chain-sts
issued: one for the same user, whose ``act`` names this agent and every agent
before it. Without the two bindings the caller's token goes out as it came.

The client is kagent's, agentsts-core. It reads chain-sts's metadata at the
first exchange and keeps it. The actor token is read from its file at every
exchange, because the kubelet replaces it before it expires; agentsts's own
integration reads it once.
"""

from __future__ import annotations

import logging
from pathlib import Path

from agentsts.core.client import (
    ConfigurationError,
    NetworkError,
    STSClient,
    STSConfig,
    TokenExchangeError,
    TokenType,
)

from .config import Settings

logger = logging.getLogger(__name__)


class ExchangeFailed(Exception):  # noqa: N818 - named for what happened
    """chain-sts did not issue a token, so nothing may be called.

    ``error`` is chain-sts's RFC 6749 error code, such as ``unauthorized_client``,
    or the kind of failure: ``actor_token_unreadable``, ``network_error``,
    ``invalid_metadata`` or ``invalid_response``. It never contains a token.
    """

    def __init__(self, error: str) -> None:
        super().__init__(error)
        self.error = error


class TokenExchange:
    """chain-sts's token exchange, with this agent's own token as the actor."""

    def __init__(self, metadata_url: str, actor_token_file: str, audience: str) -> None:
        self._client = STSClient(STSConfig(well_known_uri=metadata_url))
        self._actor_token_file = Path(actor_token_file)
        self._audience = audience

    async def exchange(self, subject_token: str) -> str:
        """The token chain-sts issues for ``subject_token``. Raises :class:`ExchangeFailed`."""
        actor_token = self._actor_token()
        try:
            issued = await self._client.exchange_token(
                subject_token=subject_token,
                subject_token_type=TokenType.JWT,
                actor_token=actor_token,
                actor_token_type=TokenType.JWT,
                audience=self._audience,
            )
        except TokenExchangeError as exc:
            # chain-sts's refusal, or agentsts's name for an answer it could not read.
            # The description is not repeated: only the code is known to hold no token.
            raise _failed(exc.error, f"HTTP {exc.status_code}") from None
        except NetworkError as exc:  # chain-sts, or its metadata, did not answer
            raise _failed("network_error", str(exc)) from None
        except ConfigurationError:
            raise _failed("invalid_metadata") from None
        except ValueError:  # a 200 that is not a token response; it may hold a token
            raise _failed("invalid_response") from None
        if not issued.access_token:
            raise _failed("invalid_response")
        return issued.access_token

    def _actor_token(self) -> str:
        try:
            token = self._actor_token_file.read_text().strip()
        except OSError as exc:
            raise _failed("actor_token_unreadable", f"{exc.strerror}: {exc.filename}") from None
        if not token:
            raise _failed("actor_token_unreadable", f"empty: {self._actor_token_file}")
        return token


def _failed(error: str, detail: str | None = None) -> ExchangeFailed:
    logger.warning(
        "token exchange at chain-sts failed: %s%s", error, f" ({detail})" if detail else ""
    )
    return ExchangeFailed(error)


def token_exchange(settings: Settings) -> TokenExchange | None:
    """chain-sts's exchange when both of its bindings are set, else None."""
    if not (settings.delegation_metadata_url and settings.delegation_actor_token_file):
        return None
    return TokenExchange(
        settings.delegation_metadata_url,
        settings.delegation_actor_token_file,
        audience=settings.oidc_audience,
    )
