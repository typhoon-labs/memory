#!/usr/bin/env python3
"""Sign in to the Chat UI's Keycloak client as a browser does, and print the access token.

    chat_ui_login.py USER        reads the password from standard input

The authorization code flow with PKCE (S256) for the public client `chat-ui`,
with the redirect URI the Chat UI registers (http://localhost:18083/): the
sign-in page, its form, the redirect with the code, and the code exchanged
for tokens. The token is the one the Chat UI holds in the browser, whose
audience is `chat-assistant`. token.sh runs this for `token.sh <user> --chat-ui`.

Prints the access token and nothing else. Exits 1 with the step and the
page's text on standard error when a step does not go as expected. Standard
library only.
"""

from __future__ import annotations

import base64
import hashlib
import html
import json
import os
import re
import secrets
import sys
import urllib.error
import urllib.parse
import urllib.request

KEYCLOAK = os.environ.get("KEYCLOAK_URL", "http://localhost:18081")
CLIENT = "chat-ui"
REDIRECT = "http://localhost:18083/"
BASE = f"{KEYCLOAK}/realms/demo/protocol/openid-connect"


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *args, **kwargs):
        return None


# Keycloak marks its cookies Secure, and http.cookiejar does not send those
# over plain HTTP, even to localhost, as a browser would. So they are kept here.
cookies: dict[str, str] = {}
opener = urllib.request.build_opener(NoRedirect)


def send(url: str, form: dict[str, str] | None = None) -> tuple[int, str | None, str]:
    """(status, location, body) of one request, without following a redirect."""
    data = urllib.parse.urlencode(form).encode() if form is not None else None
    request = urllib.request.Request(url, data=data)
    if cookies:
        request.add_header("Cookie", "; ".join(f"{name}={value}" for name, value in cookies.items()))
    try:
        response = opener.open(request, timeout=15)
    except urllib.error.HTTPError as error:
        response = error
    with response:
        for header in response.headers.get_all("Set-Cookie") or []:
            name, _, value = header.split(";", 1)[0].partition("=")
            cookies[name.strip()] = value.strip()
        return response.status, response.headers.get("Location"), response.read().decode()


def fail(step: str, status: int, body: str) -> None:
    body = re.sub(r"<(script|style)[^>]*>.*?</\1>", " ", body or "", flags=re.DOTALL)
    text = re.sub(r"\s+", " ", re.sub(r"<[^>]+>", " ", body)).strip()
    print(f"chat-ui sign-in, {step}: HTTP {status}: {text[:300]}", file=sys.stderr)
    sys.exit(1)


def main() -> None:
    user = sys.argv[1]
    password = sys.stdin.readline().rstrip("\n")
    verifier = secrets.token_urlsafe(48)
    challenge = base64.urlsafe_b64encode(hashlib.sha256(verifier.encode()).digest()).rstrip(b"=").decode()
    query = urllib.parse.urlencode(
        {
            "client_id": CLIENT,
            "redirect_uri": REDIRECT,
            "response_type": "code",
            "scope": "openid profile",
            "code_challenge": challenge,
            "code_challenge_method": "S256",
            "state": secrets.token_hex(8),
        }
    )

    status, location, body = send(f"{BASE}/auth?{query}")
    action = re.search(r'<form[^>]*id="kc-form-login"[^>]*action="([^"]+)"', body) or re.search(
        r'<form[^>]*action="([^"]+)"', body
    )
    if status != 200 or not action:
        fail("sign-in page", status, body)
    status, location, body = send(
        urllib.parse.urljoin(KEYCLOAK, html.unescape(action.group(1))),
        {"username": user, "password": password, "credentialId": ""},
    )
    # Keycloak's own steps are redirects within Keycloak.
    while status in (302, 303) and location and location.startswith(KEYCLOAK):
        status, location, body = send(location)
    if status not in (302, 303) or not location or not location.startswith(REDIRECT):
        fail("sign-in form", status, body)
    params = urllib.parse.parse_qs(urllib.parse.urlparse(location).query)
    if "code" not in params:
        fail("redirect", status, json.dumps({k: v for k, v in params.items() if k != "code"}))

    status, _, body = send(
        f"{BASE}/token",
        {
            "grant_type": "authorization_code",
            "client_id": CLIENT,
            "code": params["code"][0],
            "redirect_uri": REDIRECT,
            "code_verifier": verifier,
        },
    )
    token = json.loads(body).get("access_token") if status == 200 else None
    if not token:
        fail("token", status, body)
    print(token)


if __name__ == "__main__":
    main()
