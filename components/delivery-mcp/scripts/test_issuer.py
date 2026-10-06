#!/usr/bin/env python3
"""A token issuer for tests and local runs. Never for a cluster.

It stands in for Keycloak on a developer machine. The signing key is generated
when the process starts and lives only in its memory: nothing is written to
disk, and tokens from one run are worthless in the next.

    python scripts/test_issuer.py --port 18199

    GET /jwks                 the public key set (use as OIDC_JWKS_URL)
    GET /token/<identity>     a signed access token for one of the demo identities
    GET /identities           the identities it will mint

The issuer value is http://127.0.0.1:<port>; the audience is "agentgateway".
It binds to 127.0.0.1 only.
"""

from __future__ import annotations

import argparse
import base64
import json
import threading
import time
import uuid
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from typing import Any

import jwt
from cryptography.hazmat.primitives.asymmetric import rsa

AUDIENCE = "agentgateway"

# The identities in agent-platform/docs/conventions.md. The last one exists in
# no realm: it holds two roles so that the rule "the approver is not the
# proposer" can be reached, which no demo user can do.
IDENTITIES: dict[str, dict[str, Any]] = {
    "developer": {"roles": ["developer"], "team": "search"},
    "developer-other-team": {"roles": ["developer"], "team": "registration"},
    "incident-manager": {"roles": ["incident-manager"], "team": "incident"},
    "platform-engineer": {"roles": ["platform-engineer"], "team": "platform"},
    "alert-automation": {
        "roles": ["alert-automation"],
        "team": "automation",
        "username": "service-account-alert-automation",
        "client_id": "alert-automation",
    },
    "test-two-roles": {"roles": ["developer", "incident-manager"], "team": "search"},
}


def _b64(number: int) -> str:
    raw = number.to_bytes((number.bit_length() + 7) // 8, "big")
    return base64.urlsafe_b64encode(raw).rstrip(b"=").decode()


class TestIssuer:
    """An RSA key held in memory, its JWKS, and tokens signed with it."""

    __test__ = False  # not a pytest class

    def __init__(self, issuer: str = "http://127.0.0.1:18199", audience: str = AUDIENCE) -> None:
        self.issuer = issuer
        self.audience = audience
        self.kid = f"test-{uuid.uuid4().hex[:8]}"
        self._key = rsa.generate_private_key(public_exponent=65537, key_size=2048)

    def jwks(self) -> dict[str, Any]:
        numbers = self._key.public_key().public_numbers()
        return {
            "keys": [
                {
                    "kty": "RSA",
                    "use": "sig",
                    "alg": "RS256",
                    "kid": self.kid,
                    "n": _b64(numbers.n),
                    "e": _b64(numbers.e),
                }
            ]
        }

    def sign(self, claims: dict[str, Any], *, kid: str | None = None) -> str:
        """Sign exactly these claims. Tests use it to build tokens that should fail."""
        return jwt.encode(claims, self._key, algorithm="RS256", headers={"kid": kid or self.kid})

    def mint(self, identity: str, *, ttl_seconds: int = 900, **overrides: Any) -> str:
        """A token for a named identity, shaped like the realm's access tokens."""
        spec = IDENTITIES[identity]
        now = int(time.time())
        claims: dict[str, Any] = {
            "iss": self.issuer,
            "aud": self.audience,
            "sub": str(uuid.uuid5(uuid.NAMESPACE_URL, f"{self.issuer}/{identity}")),
            "iat": now,
            "nbf": now,
            "exp": now + ttl_seconds,
            "jti": uuid.uuid4().hex,
            "typ": "Bearer",
            "azp": spec.get("client_id", "chat-ui"),
            "preferred_username": spec.get("username", identity),
            "roles": list(spec["roles"]),
        }
        if "team" in spec:
            claims["team"] = spec["team"]
        if "client_id" in spec:
            claims["client_id"] = spec["client_id"]
        claims.update(overrides)
        claims = {k: v for k, v in claims.items() if v is not None}
        return self.sign(claims)


def _handler(issuer: TestIssuer) -> type[BaseHTTPRequestHandler]:
    class Handler(BaseHTTPRequestHandler):
        def _send(self, status: int, body: str, content_type: str = "application/json") -> None:
            data = body.encode()
            self.send_response(status)
            self.send_header("Content-Type", content_type)
            self.send_header("Content-Length", str(len(data)))
            self.send_header("Cache-Control", "no-store")
            self.end_headers()
            self.wfile.write(data)

        def do_GET(self) -> None:  # noqa: N802 - http.server's name
            path = self.path.split("?", 1)[0].rstrip("/")
            if path == "/jwks":
                self._send(200, json.dumps(issuer.jwks()))
            elif path == "/identities":
                self._send(200, json.dumps(IDENTITIES))
            elif path.startswith("/token/"):
                name = path.removeprefix("/token/")
                if name not in IDENTITIES:
                    self._send(404, json.dumps({"error": f"no identity {name!r}"}))
                else:
                    self._send(200, issuer.mint(name), "text/plain")
            elif path == "/healthz":
                self._send(200, json.dumps({"status": "ok"}))
            else:
                self._send(404, json.dumps({"error": "not found"}))

        def log_message(self, format: str, *args: Any) -> None:  # noqa: A002
            pass

    return Handler


def serve(issuer: TestIssuer, port: int) -> ThreadingHTTPServer:
    """Serve the issuer on 127.0.0.1 in a background thread."""
    server = ThreadingHTTPServer(("127.0.0.1", port), _handler(issuer))
    threading.Thread(target=server.serve_forever, daemon=True, name="test-issuer").start()
    return server


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.split("\n", 1)[0])
    parser.add_argument("--port", type=int, default=18199)
    args = parser.parse_args()
    issuer = TestIssuer(issuer=f"http://127.0.0.1:{args.port}")
    server = serve(issuer, args.port)
    print(f"test issuer: iss={issuer.issuer} aud={issuer.audience} kid={issuer.kid}", flush=True)
    print(f"  OIDC_JWKS_URL=http://127.0.0.1:{args.port}/jwks", flush=True)
    print(f"  identities: {', '.join(IDENTITIES)}", flush=True)
    try:
        threading.Event().wait()
    except KeyboardInterrupt:
        pass
    finally:
        server.shutdown()


if __name__ == "__main__":
    main()
