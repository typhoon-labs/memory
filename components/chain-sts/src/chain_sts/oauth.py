"""The protocol's names (RFC 8693) and its error answer (RFC 6749, section 5.2)."""

from __future__ import annotations

TOKEN_EXCHANGE = "urn:ietf:params:oauth:grant-type:token-exchange"
JWT_TYPE = "urn:ietf:params:oauth:token-type:jwt"
ACCESS_TOKEN_TYPE = "urn:ietf:params:oauth:token-type:access_token"
# kagent's clients send `jwt` for both tokens; Keycloak and most others send
# `access_token`. Both name a JWT here.
ACCEPTED_TOKEN_TYPES = frozenset({JWT_TYPE, ACCESS_TOKEN_TYPE})

# The clock difference allowed when checking `exp`, `nbf` and `iat`.
CLOCK_SKEW_SECONDS = 30


class Refusal(Exception):
    """A refusal, answered as an OAuth 2.0 error response."""

    def __init__(self, error: str, description: str, status: int = 400) -> None:
        super().__init__(description)
        self.error = error
        self.description = description
        self.status = status

    def body(self) -> dict[str, str]:
        return {"error": self.error, "error_description": self.description}


def unavailable(description: str) -> Refusal:
    """A token that cannot be checked now. It may well be valid, so the client may retry."""
    return Refusal("temporarily_unavailable", description, status=503)


def keys_unavailable(whose: str) -> Refusal:
    return unavailable(f"the signing keys for the {whose} could not be fetched")
