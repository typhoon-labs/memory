#!/usr/bin/env python3
"""Check that one sign-in to Keycloak covers Grafana, Langfuse and the gateway UI, and who gets in.

    sso_check.py        run by `task sso:check`

Goes through the real pages as a browser does, one set of cookies per person:

    platform-engineer   types the password once, at Grafana, and is Admin there.
                        Langfuse and the Agentgateway admin UI then let them in
                        without asking. The UI's sign-in proxy forwards the UI
                        and what it reads, not the rest of the admin port, and
                        the gateway refuses a write.
    the other roles     are Viewer in Grafana, and are refused by Langfuse, which
                        keeps prompts and completions, and by the admin UI, whose
                        Logs page does too.

Passwords are read from the realm file, the only place they are written down.
Prints one line per attempt, and exits 1 if any is not as expected. Standard
library only. It changes nothing but the users' sessions: the one write it tries
is sent only after the gateway has said it is read-only.
"""

from __future__ import annotations

import html
import json
import os
import pathlib
import re
import urllib.error
import urllib.parse
import urllib.request

from chat_ui_login import KEYCLOAK, cookies, opener, send

GRAFANA = os.environ.get("GRAFANA_URL", "http://localhost:18084")
LANGFUSE = os.environ.get("LANGFUSE_URL", "http://localhost:18085")
GATEWAY_UI = os.environ.get("GATEWAY_UI_URL", "http://localhost:18088")
# On the admin port and not forwarded. Asked with GET, which each of the first
# three would answer 405 if the sign-in proxy let it through, and nothing else.
NOT_FORWARDED = ("/quitquitquit", "/logging", "/debug/trace", "/memory", "/debug/pprof/heap")
PROJECT = "agentgateway-demo"
REALM_FILE = pathlib.Path(__file__).parent / "keycloak" / "files" / "demo-realm.json"

realm = json.loads(REALM_FILE.read_text())
passwords = {user["username"]: user["credentials"][0]["value"] for user in realm["users"] if user.get("credentials")}
wrong = 0


def check(ok: bool, what: str, seen: str) -> None:
    global wrong
    wrong += not ok
    print(f"  {'ok' if ok else 'WRONG':<9} {what}\n            {seen}")


def follow(url: str, form: dict[str, str] | None = None) -> tuple[str, str]:
    """The last address and page after every redirect, as a browser ends up."""
    status, location, body = send(url, form)
    while status in (301, 302, 303, 307, 308) and location:
        url = urllib.parse.urljoin(url, location)
        status, location, body = send(url)
    return url, body


def sign_in(user: str, url: str, form: dict[str, str] | None = None) -> tuple[str, bool]:
    """Start at an application's sign-in: where it ends, and whether Keycloak asked for the password."""
    landed, body = follow(url, form)
    action = re.search(r'<form[^>]*id="kc-form-login"[^>]*action="([^"]+)"', body)
    if not action:
        return landed, False
    landed, _ = follow(
        urllib.parse.urljoin(KEYCLOAK, html.unescape(action.group(1))),
        {"username": user, "password": passwords[user], "credentialId": ""},
    )
    return landed, True


def grafana(user: str) -> tuple[str | None, str | None, bool]:
    """The login and role Grafana gives this browser, and whether a password was asked for."""
    _, asked = sign_in(user, f"{GRAFANA}/login/generic_oauth")
    status, _, body = send(f"{GRAFANA}/api/user")
    if status != 200:
        return None, None, asked
    login = json.loads(body).get("login")
    _, _, body = send(f"{GRAFANA}/api/user/orgs")
    orgs = json.loads(body)
    return login, orgs[0]["role"] if orgs else None, asked


def langfuse(user: str) -> tuple[dict, str, bool]:
    """Langfuse's user for this browser (empty if none), where it ended, and whether a password was asked for."""
    _, _, body = send(f"{LANGFUSE}/api/auth/csrf")
    form = {"csrfToken": json.loads(body)["csrfToken"], "callbackUrl": f"{LANGFUSE}/"}
    landed, asked = sign_in(user, f"{LANGFUSE}/api/auth/signin/keycloak", form)
    _, _, body = send(f"{LANGFUSE}/api/auth/session")
    return json.loads(body).get("user") or {}, landed, asked


def gateway_ui(user: str) -> tuple[dict, bool]:
    """What the gateway says about itself through the sign-in proxy (empty if refused), and whether a password was asked for."""
    _, asked = sign_in(user, f"{GATEWAY_UI}/ui/")
    status, _, body = send(f"{GATEWAY_UI}/api/runtime")
    return (json.loads(body) if status == 200 else {}), asked


def post(path: str, body: bytes, content_type: str) -> tuple[int, str]:
    """POST to the gateway UI as the UI does. The handlers turn away any other content type."""
    request = urllib.request.Request(
        f"{GATEWAY_UI}{path}",
        data=body,
        headers={"Content-Type": content_type, "Cookie": "; ".join(f"{k}={v}" for k, v in cookies.items())},
    )
    try:
        response = opener.open(request, timeout=15)
    except urllib.error.HTTPError as error:
        response = error
    with response:
        return response.status, response.read().decode()


def main() -> int:
    print("Showing: one password covers Grafana, Langfuse and the gateway UI, and each lets in only whom it should")

    user = "platform-engineer"
    email = next(u["email"] for u in realm["users"] if u["username"] == user)
    cookies.clear()
    login, role, asked = grafana(user)
    check(login == user and role == "Admin" and asked, f"{user} at Grafana, with the password", f"login {login}, role {role}")
    seen, landed, asked = langfuse(user)
    projects = [p["id"] for org in seen.get("organizations", []) for p in org.get("projects", [])]
    check(seen.get("email") == email and PROJECT in projects, f"{user} at Langfuse", f"user {seen.get('email')}, projects {projects}, ended at {landed}")
    check(not asked, "Langfuse did not ask for the password", "Keycloak's form was shown" if asked else "no form, the Keycloak session was enough")
    runtime, asked = gateway_ui(user)
    mode = runtime.get("ui", {}).get("configStoreMode")
    check(mode == "readOnly" and not asked, f"{user} at the gateway UI, with no password", f"config store {mode}, password asked: {asked}")
    status, _, _ = send(f"{GATEWAY_UI}/config_dump")
    check(status == 200, "the UI reads the configuration", f"/config_dump answers {status}")
    for path in NOT_FORWARDED:
        status, _, _ = send(f"{GATEWAY_UI}{path}")
        check(status == 404, f"{path} is not forwarded", f"the sign-in proxy answers {status}")
    # Sent only once the gateway has said it is read-only, so it cannot write.
    if mode == "readOnly":
        status, body = post("/api/config/raw", b"{}\n", "application/yaml")
        check(status == 403, "a write through the UI is refused", f"POST /api/config/raw answers {status}: {body[:60]}")
    status, body = post("/api/logs/analytics/summary", b"{}", "application/json")
    check(status == 200, "the UI's Analytics page has its database", f"answers {status}")
    status, body = post("/api/logs/search", b"{}", "application/json")
    check(status == 200, "the UI's Logs page has its database", f"answers {status}")

    for user in ("developer", "incident-manager"):
        cookies.clear()
        login, role, _ = grafana(user)
        check(login == user and role == "Viewer", f"{user} at Grafana", f"login {login}, role {role}")
        seen, landed, _ = langfuse(user)
        # The refusal of a user that does not exist, and not any other failure.
        refused = not seen and "error=OAuthCreateAccount" in landed
        check(refused, f"{user} is refused by Langfuse", f"user {seen.get('email')}, ended at {landed}")
        runtime, _ = gateway_ui(user)
        check(not runtime, f"{user} is refused by the gateway UI", f"sees {runtime or 'nothing'}")

    if wrong:
        print(f"Result: NOT as expected: {wrong} line(s) above are marked WRONG.")
        return 1
    print("Result: one sign-in reaches all three, and the roles get what they should.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
