#!/usr/bin/env python3
"""Sign in as a corp user through the demo realm's `corp` button, and use the token at the gateway.

    broker_check.py             alex.rivera, then the takeover check   (task identity:broker-check)
    broker_check.py USER        one corp user: alex.rivera, sam.okafor or jo.chen

Realm `corp` stands in for the enterprise identity provider, and realm `demo`
brokers it (docs/production-design.md, section 2). As a browser does, one set
of cookies per person:

    1. What corp sends: a sign-in at corp alone, for the client realm demo
       uses, and corp's ID token: its `iss` (which must be the issuer the demo
       realm's identity provider expects), `sub`, `groups` and `primary_team`.
    2. The brokered sign-in: client `mcp-client`, authorization code with PKCE
       (S256), the demo realm's page, its `corp` button, corp's page, back to
       the demo realm, the code exchanged. Prints the access token's claims,
       never the token, and checks `roles`, `team`, `idp_sub`, `iss` and `aud`
       against the realm files.
    3. tools/list at /mcp/delivery through the gateway with that token: the
       tools the route gives the token's roles, from the route's tool table.
       Then the same sign-in for client `chat-ui` (audience chat-assistant),
       whose token must carry the same `idp_sub`, `team` and roles.
    4. Takeover (whole run only): corp user `mallory` carries the email of the
       demo user `developer`. The first sign-in must stop at Keycloak's error
       page, offer no link, and leave `developer` with no corp link.

Passwords and client secrets are demo-only values read from the realm files,
the only place they are written down. Exits 1 if any check is not as
expected. Standard library only.
"""

from __future__ import annotations

import base64
import hashlib
import html
import http.cookiejar
import json
import os
import pathlib
import re
import secrets
import sys
import urllib.error
import urllib.parse
import urllib.request
from typing import Any

HERE = pathlib.Path(__file__).resolve().parent
REPO = HERE.parent.parent
KEYCLOAK = os.environ.get("KEYCLOAK_URL", "http://localhost:18081")
GATEWAY = os.environ.get("GATEWAY_URL", "http://localhost:18080")
MCP_URL = f"{GATEWAY}/mcp/delivery"
MCP_PROTOCOL = "2025-06-18"
CLIENT = "mcp-client"
# mcp-client registers http://localhost:* as a redirect; nothing listens here,
# the code is read from the redirect itself.
REDIRECT = "http://localhost:33418/callback"
DEMO_FILE = HERE / "keycloak" / "files" / "demo-realm.json"
CORP_FILE = HERE / "keycloak" / "files" / "corp-realm.json"
ROUTE_FILE = REPO / "agent-deployments" / "clusters" / "dev" / "domains" / "operations" / "delivery-mcp.yaml"
CHAT_UI = "chat-ui"
CHAT_UI_REDIRECT = "http://localhost:18083/"
TAKEOVER_USER = "mallory"
# What a first broker login shows when it offers to link to an existing
# account: the confirm-link page's buttons, or a sign-in form to re-authenticate.
LINK_OFFERS = ('id="linkAccount"', 'id="updateProfile"', 'id="kc-form-login"', "login-actions/first-broker-login")

demo_realm = json.loads(DEMO_FILE.read_text())
corp_realm = json.loads(CORP_FILE.read_text())
IDP = next(idp for idp in demo_realm["identityProviders"] if idp["alias"] == "corp")
PLATFORM_ROLES = {m["config"]["role"] for m in demo_realm["identityProviderMappers"] if m["identityProviderMapper"] == "oidc-role-idp-mapper"}
# The realm files write the browser's address of Keycloak as ${KC_HOSTNAME},
# which the pod fills in at import; it is this address.
DEMO_ISSUER = f"{KEYCLOAK}/realms/demo"
CORP_ISSUER_EXPECTED = IDP["config"]["issuer"].replace("${KC_HOSTNAME}", KEYCLOAK)
CORP_BROKER_CLIENT = IDP["config"]["clientId"]


class Failed(Exception):
    """A step that did not go as expected: the step, the HTTP status and the page's text."""

    def __init__(self, step: str, status: int, body: str) -> None:
        super().__init__(f"{step}: HTTP {status}: {page_text(body)[:300]}")
        self.step = step
        self.status = status
        self.body = body or ""
        self.text = page_text(body)


def page_text(body: str) -> str:
    body = re.sub(r"<(script|style)[^>]*>.*?</\1>", " ", body or "", flags=re.DOTALL)
    return re.sub(r"\s+", " ", html.unescape(re.sub(r"<[^>]+>", " ", body))).strip()


class _Policy(http.cookiejar.DefaultCookiePolicy):
    # Keycloak marks its cookies Secure, and http.cookiejar keeps those from
    # plain HTTP, even to localhost, where a browser sends them.
    def return_ok_secure(self, cookie, request):  # noqa: ANN001
        return True


class _NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *args, **kwargs):  # noqa: ANN002, ANN003
        return None


class Browser:
    """One person's browser: its cookies, by realm path, and no automatic redirects."""

    def __init__(self) -> None:
        self.jar = http.cookiejar.CookieJar(policy=_Policy())
        self.opener = urllib.request.build_opener(_NoRedirect, urllib.request.HTTPCookieProcessor(self.jar))

    def send(self, url: str, form: dict[str, str] | None = None) -> tuple[int, str | None, str]:
        """(status, absolute location, body) of one request."""
        data = urllib.parse.urlencode(form).encode() if form is not None else None
        try:
            response = self.opener.open(urllib.request.Request(url, data=data), timeout=20)
        except urllib.error.HTTPError as error:
            response = error
        with response:
            location = response.headers.get("Location")
            return response.status, urllib.parse.urljoin(url, location) if location else None, response.read().decode()


def form_action(body: str) -> str | None:
    match = re.search(r'<form[^>]*id="kc-form-login"[^>]*action="([^"]+)"', body)
    return html.unescape(match.group(1)) if match else None


def corp_password(user: str) -> str:
    for entry in corp_realm["users"]:
        if entry["username"] == user and entry.get("credentials"):
            return entry["credentials"][0]["value"]
    known = ", ".join(u["username"] for u in corp_realm["users"] if u.get("credentials"))
    raise SystemExit(f"unknown corp user '{user}'. Corp users: {known}")


def corp_user(user: str) -> dict[str, Any]:
    return next(entry for entry in corp_realm["users"] if entry["username"] == user)


def pkce() -> tuple[str, str]:
    verifier = secrets.token_urlsafe(48)
    challenge = base64.urlsafe_b64encode(hashlib.sha256(verifier.encode()).digest()).rstrip(b"=").decode()
    return verifier, challenge


def claims(jwt: str) -> dict[str, Any]:
    payload = jwt.split(".")[1]
    return json.loads(base64.urlsafe_b64decode(payload + "=" * (-len(payload) % 4)))


def broker_sign_in(browser: Browser, user: str, client: str = CLIENT, redirect: str = REDIRECT) -> dict[str, Any]:
    """The demo realm's page, its corp button, corp's page, and back; returns the token response."""
    verifier, challenge = pkce()
    query = urllib.parse.urlencode(
        {
            "client_id": client,
            "redirect_uri": redirect,
            "response_type": "code",
            "scope": "openid",
            "code_challenge": challenge,
            "code_challenge_method": "S256",
            "state": secrets.token_hex(8),
        }
    )
    base = f"{KEYCLOAK}/realms/demo/protocol/openid-connect"
    status, location, body = browser.send(f"{base}/auth?{query}")
    if status in (302, 303) and location and location.startswith(redirect):
        pass  # an existing demo session: no page at all
    else:
        button = re.search(r'<a\b[^>]*\bid="social-corp"[^>]*\bhref="([^"]+)"', body, flags=re.DOTALL)
        if status != 200 or not button:
            raise Failed("demo sign-in page, corp button", status, body)
        status, location, body = browser.send(urllib.parse.urljoin(KEYCLOAK, html.unescape(button.group(1))))
        # Through Keycloak's redirects to corp's page, or straight back when corp
        # still has a session.
        while status in (302, 303) and location and not location.startswith(redirect):
            if location.startswith(f"{KEYCLOAK}/realms/corp/protocol/openid-connect/auth"):
                status, location, body = browser.send(location)
                if status == 200:
                    action = form_action(body)
                    if not action:
                        raise Failed("corp sign-in page", status, body)
                    status, location, body = browser.send(
                        urllib.parse.urljoin(KEYCLOAK, action),
                        {"username": user, "password": corp_password(user), "credentialId": ""},
                    )
                continue
            if not location.startswith(KEYCLOAK):
                raise Failed(f"unexpected redirect to {location.split('?')[0]}", status, body)
            status, location, body = browser.send(location)
    if status not in (302, 303) or not location or not location.startswith(redirect):
        raise Failed("brokered sign-in", status, body)
    params = urllib.parse.parse_qs(urllib.parse.urlparse(location).query)
    if "code" not in params:
        raise Failed("redirect to the client", status, json.dumps({k: v for k, v in params.items() if k != "code"}))
    status, _, body = browser.send(
        f"{base}/token",
        {
            "grant_type": "authorization_code",
            "client_id": client,
            "code": params["code"][0],
            "redirect_uri": redirect,
            "code_verifier": verifier,
        },
    )
    if status != 200:
        raise Failed("code exchange", status, body)
    return json.loads(body)


def corp_id_token(user: str) -> dict[str, Any]:
    """Claims of the ID token corp issues to the client realm demo uses, for a sign-in at corp alone.

    The code is taken from corp's redirect to the demo realm's broker endpoint
    and exchanged here, so the demo realm never sees it.
    """
    browser = Browser()
    verifier, challenge = pkce()
    redirect = f"{KEYCLOAK}/realms/demo/broker/corp/endpoint"
    secret = next(c["secret"] for c in corp_realm["clients"] if c["clientId"] == CORP_BROKER_CLIENT)
    base = f"{KEYCLOAK}/realms/corp/protocol/openid-connect"
    query = urllib.parse.urlencode(
        {
            "client_id": CORP_BROKER_CLIENT,
            "redirect_uri": redirect,
            "response_type": "code",
            "scope": IDP["config"]["defaultScope"],
            "code_challenge": challenge,
            "code_challenge_method": "S256",
            "state": secrets.token_hex(8),
        }
    )
    status, location, body = browser.send(f"{base}/auth?{query}")
    action = form_action(body)
    if status != 200 or not action:
        raise Failed("corp sign-in page", status, body)
    status, location, body = browser.send(
        urllib.parse.urljoin(KEYCLOAK, action), {"username": user, "password": corp_password(user), "credentialId": ""}
    )
    if status not in (302, 303) or not location or not location.startswith(redirect):
        raise Failed("corp sign-in", status, body)
    code = urllib.parse.parse_qs(urllib.parse.urlparse(location).query)["code"][0]
    status, _, body = browser.send(
        f"{base}/token",
        {
            "grant_type": "authorization_code",
            "client_id": CORP_BROKER_CLIENT,
            "client_secret": secret,
            "code": code,
            "redirect_uri": redirect,
            "code_verifier": verifier,
        },
    )
    if status != 200:
        raise Failed("corp code exchange", status, body)
    return claims(json.loads(body)["id_token"])


def refresh(refresh_token: str, client: str = CLIENT) -> tuple[int, dict[str, Any]]:
    """(status, body) of a refresh at the demo realm, as the public client does it."""
    status, _, body = Browser().send(
        f"{KEYCLOAK}/realms/demo/protocol/openid-connect/token",
        {"grant_type": "refresh_token", "client_id": client, "refresh_token": refresh_token},
    )
    try:
        return status, json.loads(body)
    except json.JSONDecodeError:
        return status, {"error": page_text(body)[:200]}


def _post(url: str, body: dict[str, Any], headers: dict[str, str]) -> tuple[int, Any, str]:
    request = urllib.request.Request(
        url, data=json.dumps(body).encode(), headers={"Content-Type": "application/json", **headers}
    )
    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            return response.status, response.headers, response.read().decode()
    except urllib.error.HTTPError as error:
        return error.code, error.headers, error.read().decode()


def _json_or_event(headers: Any, body: str) -> Any:
    if (headers.get("Content-Type") or "").startswith("text/event-stream"):
        for line in body.splitlines():
            if line.startswith("data:"):
                return json.loads(line[5:])
    return json.loads(body)


def gateway_tools(access_token: str) -> tuple[int, list[str] | str]:
    """(status, tool names) of tools/list at /mcp/delivery, or (status, the refusal) when refused."""
    base = {"Authorization": f"Bearer {access_token}", "Accept": "application/json, text/event-stream"}
    status, headers, body = _post(
        MCP_URL,
        {
            "jsonrpc": "2.0",
            "id": 0,
            "method": "initialize",
            "params": {
                "protocolVersion": MCP_PROTOCOL,
                "capabilities": {},
                "clientInfo": {"name": "broker-check", "version": "1"},
            },
        },
        base,
    )
    if status != 200:
        return status, body.strip()[:200]
    session = {**base, "MCP-Protocol-Version": MCP_PROTOCOL}
    if headers.get("Mcp-Session-Id"):
        session["Mcp-Session-Id"] = headers["Mcp-Session-Id"]
    _post(MCP_URL, {"jsonrpc": "2.0", "method": "notifications/initialized"}, session)
    status, headers, body = _post(MCP_URL, {"jsonrpc": "2.0", "id": 1, "method": "tools/list"}, session)
    if status != 200:
        return status, body.strip()[:200]
    return status, sorted(tool["name"] for tool in _json_or_event(headers, body)["result"]["tools"])


def route_tools() -> dict[str, list[str]]:
    """The route's tool table (`tools:` in delivery-mcp.yaml): tool -> roles, "*" for any caller."""
    table: dict[str, list[str]] = {}
    inside = False
    for line in ROUTE_FILE.read_text().splitlines():
        if re.match(r"^tools:\s*$", line):
            inside = True
            continue
        if inside:
            match = re.match(r"^\s+([a-z_]+):\s*\[(.*)\]", line)
            if match:
                table[match.group(1)] = [r.strip().strip('"') for r in match.group(2).split(",") if r.strip()]
            elif line and not line.startswith(" ") and not line.startswith("#"):
                break
    return table


def expected_roles(user: str) -> list[str]:
    """The platform roles the demo realm's mappers give the user's corp groups."""
    groups = {g.strip("/") for g in corp_user(user).get("groups", [])}
    roles = []
    for mapper in demo_realm["identityProviderMappers"]:
        if mapper["identityProviderMapper"] == "oidc-role-idp-mapper" and mapper["config"]["claim.value"] in groups:
            roles.append(mapper["config"]["role"])
    return sorted(roles)


def expected_tools(roles: list[str]) -> list[str]:
    return sorted(t for t, allowed in route_tools().items() if "*" in allowed or set(allowed) & set(roles))


wrong = 0


def check(ok: bool, what: str, seen: str) -> None:
    global wrong
    wrong += not ok
    print(f"  {'ok' if ok else 'WRONG':<9} {what}\n            {seen}")


def show(token_claims: dict[str, Any]) -> str:
    keys = ("sub", "idp_sub", "preferred_username", "roles", "team", "iss", "aud", "azp", "exp")
    return json.dumps({k: token_claims.get(k) for k in keys})


def run_user(user: str) -> None:
    entry = corp_user(user)
    team = entry.get("attributes", {}).get("primary_team", [None])[0]

    print(f"\n{user} at corp alone: what the IdP sends")
    try:
        sent = corp_id_token(user)
    except Failed as error:
        check(False, "corp signs the user in", str(error))
        return
    print(f"            {json.dumps({k: sent.get(k) for k in ('iss', 'sub', 'preferred_username', 'email', 'groups', 'primary_team')})}")
    check(
        sent.get("iss") == CORP_ISSUER_EXPECTED,
        "corp's ID token names the issuer the demo realm's identity provider expects",
        f"iss {sent.get('iss')}, expected {CORP_ISSUER_EXPECTED}",
    )

    print(f"\n{user} through the demo realm's corp button, client {CLIENT}")
    try:
        tokens = broker_sign_in(Browser(), user)
    except Failed as error:
        check(False, "brokered sign-in", str(error))
        return
    got = claims(tokens["access_token"])
    print(f"            {show(got)}")
    roles = sorted(got.get("roles") or [])
    want = expected_roles(user)
    platform = sorted(set(roles) & PLATFORM_ROLES)
    check(
        platform == want,
        "roles: the platform roles of the user's app-agentplatform- groups, and no other",
        f"platform roles {platform} from corp groups {sorted(g.strip('/') for g in entry.get('groups', []))};"
        f" also Keycloak's defaults {sorted(set(roles) - PLATFORM_ROLES)}",
    )
    check(isinstance(got.get("team"), str) and got.get("team") == team, "team: one string, corp's primary_team", f"team {got.get('team')!r}")
    check(
        got.get("idp_sub") == sent.get("sub") == entry["id"],
        "idp_sub: corp's immutable user ID",
        f"idp_sub {got.get('idp_sub')}, corp sub {sent.get('sub')}",
    )
    check(got.get("sub") != got.get("idp_sub"), "sub: the demo realm's own user ID, not corp's", f"sub {got.get('sub')}")
    aud = got.get("aud") if isinstance(got.get("aud"), list) else [got.get("aud")]
    check(got.get("iss") == DEMO_ISSUER and "agentgateway" in aud, "iss is the demo realm, aud has agentgateway", f"iss {got.get('iss')}, aud {got.get('aud')}")
    check(got.get("preferred_username") == f"corp.{user}", "username namespaced by the IdP's alias", f"preferred_username {got.get('preferred_username')}")
    check("refresh_token" in tokens, "a refresh token came with it", f"refresh_expires_in {tokens.get('refresh_expires_in')}")

    status, tools = gateway_tools(tokens["access_token"])
    want_tools = expected_tools(roles)
    check(
        status == 200 and tools == want_tools,
        f"tools/list at {MCP_URL} shows the role's tools",
        f"HTTP {status}: {tools}",
    )

    print(f"\n{user} through the demo realm's corp button, client {CHAT_UI}")
    try:
        chat = claims(broker_sign_in(Browser(), user, CHAT_UI, CHAT_UI_REDIRECT)["access_token"])
    except Failed as error:
        check(False, "brokered sign-in to the Chat UI", str(error))
        return
    print(f"            {show(chat)}")
    chat_aud = chat.get("aud") if isinstance(chat.get("aud"), list) else [chat.get("aud")]
    check(
        "chat-assistant" in chat_aud
        and chat.get("idp_sub") == entry["id"]
        and chat.get("team") == team
        and sorted(set(chat.get("roles") or []) & PLATFORM_ROLES) == want,
        "the Chat UI's token: aud chat-assistant, and the same idp_sub, team and platform roles",
        f"aud {chat.get('aud')}, idp_sub {chat.get('idp_sub')}, team {chat.get('team')!r}, roles {sorted(chat.get('roles') or [])}",
    )


def run_takeover() -> None:
    from reconcile import Admin, demo_admin  # the job's client reads federated identities

    victim_email = corp_user(TAKEOVER_USER)["email"]
    victim = next(u["username"] for u in demo_realm["users"] if u.get("email") == victim_email)
    print(f"\n{TAKEOVER_USER} at corp carries {victim_email}, the email of demo user {victim}")
    try:
        broker_sign_in(Browser(), TAKEOVER_USER)
        check(False, "first sign-in is refused", "it was let in")
    except Failed as error:
        offers = [marker for marker in LINK_OFFERS if marker in error.body]
        message = re.search(r"User with \S+ \S+ already exists\.[^<]*", html.unescape(error.body))
        check(
            error.status == 409 and message is not None and not offers,
            "first sign-in stops at Keycloak's error page: no link offered, no form to re-authenticate",
            f"HTTP {error.status}: {message.group(0).strip() if message else error.text[:160]}; link offers on the page: {offers or 'none'}",
        )
    admin: Admin = demo_admin()
    found = admin.get("/users", username=victim, exact="true")
    links = admin.get(f"/users/{found[0]['id']}/federated-identity") if found else None
    check(found and links == [], f"{victim} has no corp link", f"federated identities {links}")
    created = admin.get("/users", idpAlias="corp", username=f"corp.{TAKEOVER_USER}", exact="true")
    check(created == [], f"no corp.{TAKEOVER_USER} was created", f"users {[u['username'] for u in created]}")


def main() -> None:
    users = sys.argv[1:] or ["alex.rivera"]
    print(f"Brokered sign-in: realm corp behind realm demo, at {KEYCLOAK}")
    for user in users:
        run_user(user)
    if not sys.argv[1:]:
        run_takeover()
    print(f"\n{'All as expected.' if not wrong else f'{wrong} not as expected.'}")
    sys.exit(1 if wrong else 0)


if __name__ == "__main__":
    main()
