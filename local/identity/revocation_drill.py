#!/usr/bin/env python3
"""Time how long a person disabled at the IdP keeps working at the gateway, with the reconciliation job.

    revocation_drill.py [USER]          the drill, about 35 minutes   (task identity:revocation-drill)
    revocation_drill.py [USER] --quick  stop after step e, without waiting for the token's exp
    revocation_drill.py [USER] --restore  only put the user back: enabled at corp and in realm demo

USER is a corp user, alex.rivera by default. docs/production-design.md,
section 2.2, item 6 asks for the time from deactivation at the IdP to refusal
at the gateway. The steps, each with its time and its distance from step b:

    a. sign in through corp (broker_check.py): an access token and a refresh token
    b. disable the user at corp, as its administrators would (corp client
       `idp-admin-test`, a test-harness client); a new sign-in at corp fails
    c. before the job: the access token at the gateway, a refresh, and a
       new sign-in on the demo realm's own session (single sign-on, which
       never asks corp)
    d. reconcile.py, once
    e. after the job: the refresh, the session, and the access tokens at the
       gateway, which verifies a token from Keycloak's keys and never asks
       Keycloak about the session; then, unless --quick, the gateway asked
       every 2 seconds from shortly before each token's `exp` until it
       refuses it

At the end the user is enabled again at corp and in realm demo, so the drill
can run again at once. Prints no token. Standard library only.
"""

from __future__ import annotations

import datetime
import sys
import time
from typing import Any

import reconcile
from broker_check import CLIENT, Browser, Failed, broker_sign_in, claims, corp_id_token, corp_user, gateway_tools, refresh
from reconcile import CORP_FILE, Admin, client_secret

t0: float | None = None  # step b, the disable at corp


def stamp() -> str:
    at = datetime.datetime.now().astimezone()
    since = f"b{time.time() - t0:+9.1f}s" if t0 is not None else " " * 12
    return f"{at:%H:%M:%S}.{at.microsecond // 1000:03d}  {since}"


def say(step: str, what: str, seen: str = "") -> None:
    print(f"  {stamp()}  {step:<2} {what}" + (f"\n{'':>32}{seen}" if seen else ""), flush=True)


def corp_admin() -> Admin:
    return Admin("corp", "idp-admin-test", client_secret(CORP_FILE, "idp-admin-test"))


def set_enabled(admin: Admin, user_id: str, enabled: bool) -> None:
    admin.must("PUT", f"/users/{user_id}", {"enabled": enabled})


def restore(user: str) -> None:
    corp_id = corp_user(user)["id"]
    set_enabled(corp_admin(), corp_id, True)
    demo = reconcile.demo_admin()
    for found in demo.get("/users", idpAlias="corp", idpUserId=corp_id):
        set_enabled(demo, found["id"], True)
    say("", f"put back: {user} enabled at corp, corp.{user} enabled in realm demo")


def gateway(token: str) -> str:
    status, tools = gateway_tools(token)
    return f"HTTP {status}, {len(tools)} tools" if status == 200 else f"HTTP {status} {tools}"


def until_refused(name: str, token: str) -> None:
    exp = claims(token)["exp"]
    wait = exp - 15 - time.time()
    if wait > 0:
        say("e", f"waiting {wait / 60:.1f} min, until 15 s before {name}'s exp ({datetime.datetime.fromtimestamp(exp):%H:%M:%S})")
        time.sleep(wait)
    last_ok = None
    while time.time() < exp + 300:
        status, _ = gateway_tools(token)
        if status != 200:
            say(
                "e",
                f"{name} refused at the gateway, {time.time() - exp:+.1f} s from its exp",
                f"HTTP {status}; last accepted {last_ok - exp:+.1f} s from exp" if last_ok else f"HTTP {status}",
            )
            return
        last_ok = time.time()
        time.sleep(2)
    say("e", f"{name} still accepted 300 s after its exp")


def main() -> None:
    global t0
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    user = args[0] if args else "alex.rivera"
    if "--restore" in sys.argv:
        restore(user)
        return
    quick = "--quick" in sys.argv
    corp_id = corp_user(user)["id"]
    print(f"Revocation drill for corp user {user}, {datetime.datetime.now().astimezone():%Y-%m-%d %Z}")
    print(f"  {'time':<12}  {'since b':<12}  step")

    tokens: dict[str, str] = {}
    try:
        browser = Browser()
        got = broker_sign_in(browser, user)
        tokens["token a"] = got["access_token"]
        current_refresh = got["refresh_token"]
        c = claims(got["access_token"])
        say("a", f"signed in through corp, client {CLIENT}: token a, exp {datetime.datetime.fromtimestamp(c['exp']):%H:%M:%S}",
            f"sub {c['sub']}, idp_sub {c.get('idp_sub')}, roles {sorted(c.get('roles', []))}; refresh token, {got.get('refresh_expires_in')} s")
        say("a", "token a at the gateway", gateway(tokens["token a"]))

        set_enabled(corp_admin(), corp_id, False)
        t0 = time.time()
        say("b", f"{user} disabled at corp")
        try:
            corp_id_token(user)
            say("b", "a new sign-in at corp", "let in (unexpected)")
        except Failed as error:
            say("b", "a new sign-in at corp is refused", f"HTTP {error.status}: {error.text[-90:]}")

        say("c", "token a at the gateway, before the job", gateway(tokens["token a"]))
        status, body = refresh(current_refresh)
        if status == 200:
            tokens["token c (refresh)"] = body["access_token"]
            current_refresh = body.get("refresh_token", current_refresh)
            say("c", "refresh before the job", f"HTTP 200: a new access token, exp {datetime.datetime.fromtimestamp(claims(body['access_token'])['exp']):%H:%M:%S}")
        else:
            say("c", "refresh before the job", f"HTTP {status} {body.get('error')}: {body.get('error_description')}")
        try:
            sso = broker_sign_in(browser, user)
            tokens["token c (sign-in)"] = sso["access_token"]
            say("c", "a new sign-in on the demo realm's session, before the job",
                f"let in without corp: exp {datetime.datetime.fromtimestamp(claims(sso['access_token'])['exp']):%H:%M:%S}")
        except Failed as error:
            say("c", "a new sign-in on the demo realm's session, before the job", f"refused: {error}")

        say("d", "reconcile.py starts")
        for r in reconcile.run():
            if r["corp_id"] == corp_id:
                say("d", f"reconcile.py: {r['kind']} {r['username']}", f"{r['reason']}; {', '.join(r['done'])}")
        say("d", "reconcile.py done")

        status, body = refresh(current_refresh)
        say("e", "refresh after the job", f"HTTP {status}" + ("" if status == 200 else f" {body.get('error')}: {body.get('error_description')}"))
        try:
            broker_sign_in(browser, user)
            say("e", "a new sign-in on the demo realm's session, after the job", "let in (unexpected)")
        except Failed as error:
            say("e", "a new sign-in on the demo realm's session, after the job", f"refused: {error.step}: HTTP {error.status} {error.text[-90:]}")
        for name, token in tokens.items():
            say("e", f"{name} at the gateway, after the job", gateway(token))
        if not quick:
            for name, token in sorted(tokens.items(), key=lambda item: claims(item[1])["exp"]):
                until_refused(name, token)
    finally:
        restore(user)


if __name__ == "__main__":
    main()
