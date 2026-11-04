#!/usr/bin/env python3
"""The reconciliation job, a prototype: act on leavers and movers at the IdP before Keycloak's sessions end.

    reconcile.py              act                                   (task identity:reconcile)
    reconcile.py --dry-run    say what it would do, and change nothing

docs/production-design.md, section 2.2, item 6. Keycloak learns about a change
at the IdP only when the user next signs in there; this job closes the gap
from the other side. Realm `corp` stands in for the IdP. For every user of
realm `demo` linked to identity provider `corp`, it reads the corp account by
the linked ID (corp's immutable `sub`):

    leaver  the corp account is disabled, deleted, or in no app-agentplatform- group:
            disable the demo user and end every session it has
    mover   still in a platform group, but holding a platform role in demo that
            its corp groups no longer give: end every session, so that the next
            sign-in through corp maps the roles again (the mappers' sync mode is
            force)
    other   nothing

It never enables a user or grants a role: a person enabled again at the IdP
stays disabled in the platform until someone enables them there.

Each realm's client holds only what its side needs (realm-management roles):
corp's `directory-reader` view-users (read-only, as the IdP's directory API
would be), and demo's `reconciler` view-users and manage-users. Their secrets
are demo-only values in the realm files. Which group gives which role is read
from the demo realm file's identity provider mappers, the realm as code.
Prints one line per linked user with the time, and exits 1 if a call fails.
Standard library only.
"""

from __future__ import annotations

import datetime
import json
import os
import pathlib
import sys
import urllib.error
import urllib.parse
import urllib.request
from typing import Any

HERE = pathlib.Path(__file__).resolve().parent
KEYCLOAK = os.environ.get("KEYCLOAK_URL", "http://localhost:18081")
DEMO_FILE = HERE / "keycloak" / "files" / "demo-realm.json"
CORP_FILE = HERE / "keycloak" / "files" / "corp-realm.json"
IDP_ALIAS = "corp"
GROUP_PREFIX = "app-agentplatform-"


class AdminError(Exception):
    pass


class Admin:
    """Keycloak's admin REST API for one realm, as one confidential client's service account."""

    def __init__(self, realm: str, client: str, secret: str) -> None:
        self.realm = realm
        self.client = client
        self.secret = secret
        self._token: str | None = None

    def _get_token(self) -> str:
        if self._token is None:
            data = urllib.parse.urlencode(
                {"grant_type": "client_credentials", "client_id": self.client, "client_secret": self.secret}
            ).encode()
            url = f"{KEYCLOAK}/realms/{self.realm}/protocol/openid-connect/token"
            try:
                with urllib.request.urlopen(urllib.request.Request(url, data=data), timeout=15) as response:
                    self._token = json.loads(response.read())["access_token"]
            except urllib.error.HTTPError as error:
                raise AdminError(f"{self.client}@{self.realm}: no token: HTTP {error.code} {error.read()[:200]!r}")
        return self._token

    def call(self, method: str, path: str, body: Any = None, **query: str) -> tuple[int, Any]:
        """(status, JSON body or None) of one admin call; 4xx and 5xx are returned, not raised."""
        url = f"{KEYCLOAK}/admin/realms/{self.realm}{path}"
        if query:
            url += "?" + urllib.parse.urlencode(query)
        request = urllib.request.Request(
            url,
            data=json.dumps(body).encode() if body is not None else (b"" if method == "POST" else None),
            method=method,
            headers={"Authorization": f"Bearer {self._get_token()}", "Content-Type": "application/json"},
        )
        try:
            with urllib.request.urlopen(request, timeout=15) as response:
                raw = response.read()
                return response.status, json.loads(raw) if raw else None
        except urllib.error.HTTPError as error:
            return error.code, error.read().decode()[:200]

    def get(self, path: str, **query: str) -> Any:
        status, body = self.call("GET", path, **query)
        if status != 200:
            raise AdminError(f"GET {self.realm}{path}: HTTP {status} {body}")
        return body

    def must(self, method: str, path: str, body: Any = None) -> None:
        status, answer = self.call(method, path, body)
        if status not in (200, 204):
            raise AdminError(f"{method} {self.realm}{path}: HTTP {status} {answer}")


def client_secret(realm_file: pathlib.Path, client: str) -> str:
    realm = json.loads(realm_file.read_text())
    return next(c["secret"] for c in realm["clients"] if c["clientId"] == client)


def demo_admin() -> Admin:
    return Admin("demo", "reconciler", client_secret(DEMO_FILE, "reconciler"))


def corp_reader() -> Admin:
    return Admin("corp", "directory-reader", client_secret(CORP_FILE, "directory-reader"))


def group_roles() -> dict[str, str]:
    """corp group -> demo realm role, from the identity provider's claim-to-role mappers."""
    realm = json.loads(DEMO_FILE.read_text())
    return {
        m["config"]["claim.value"]: m["config"]["role"]
        for m in realm.get("identityProviderMappers", [])
        if m["identityProviderAlias"] == IDP_ALIAS and m["identityProviderMapper"] == "oidc-role-idp-mapper"
    }


def now() -> str:
    return datetime.datetime.now().astimezone().strftime("%H:%M:%S.%f")[:-3]


def linked_users(demo: Admin) -> list[dict[str, Any]]:
    users, first = [], 0
    while True:
        page = demo.get("/users", idpAlias=IDP_ALIAS, first=str(first), max="100", briefRepresentation="true")
        users += page
        if len(page) < 100:
            return users
        first += 100


def run(dry_run: bool = False) -> list[dict[str, Any]]:
    """One pass. Returns what it found and did for each linked user."""
    demo, corp = demo_admin(), corp_reader()
    mapping = group_roles()
    platform_roles = set(mapping.values())
    results = []
    for user in linked_users(demo):
        link = next(i for i in demo.get(f"/users/{user['id']}/federated-identity") if i["identityProvider"] == IDP_ALIAS)
        corp_id = link["userId"]
        status, account = corp.call("GET", f"/users/{corp_id}")
        if status == 404:
            groups: list[str] = []
            state = "deleted at corp"
        elif status == 200:
            groups = [g["name"] for g in corp.get(f"/users/{corp_id}/groups")]
            state = "enabled at corp" if account["enabled"] else "disabled at corp"
        else:
            raise AdminError(f"GET corp/users/{corp_id}: HTTP {status} {account}")
        platform_groups = sorted(g for g in groups if g.startswith(GROUP_PREFIX))
        held = {r["name"] for r in demo.get(f"/users/{user['id']}/role-mappings/realm")} & platform_roles
        given = {mapping[g] for g in platform_groups if g in mapping}

        if status == 404 or not account["enabled"] or not platform_groups:
            kind = "leaver"
            reason = state if state != "enabled at corp" else "in no app-agentplatform- group"
        elif held - given:
            kind = "mover"
            reason = f"holds {sorted(held - given)}, which its corp groups no longer give"
        else:
            kind, reason = "current", "nothing to do"

        sessions = demo.get(f"/users/{user['id']}/sessions")
        done = []
        if kind == "leaver" and not dry_run:
            if user.get("enabled", True):
                demo.must("PUT", f"/users/{user['id']}", {"enabled": False})
                done.append("disabled")
            else:
                done.append("already disabled")
        if kind in ("leaver", "mover") and not dry_run:
            if sessions:
                demo.must("POST", f"/users/{user['id']}/logout")
            done.append(f"{len(sessions)} session(s) ended")
        result = {
            "time": now(),
            "username": user["username"],
            "corp_id": corp_id,
            "kind": kind,
            "reason": reason,
            "platform_groups": platform_groups,
            "sessions": len(sessions),
            "done": done if not dry_run else ["dry run: nothing changed"],
        }
        results.append(result)
    return results


def main() -> None:
    dry_run = "--dry-run" in sys.argv[1:]
    started = datetime.datetime.now().astimezone()
    print(f"Reconcile realm demo with corp, {started:%Y-%m-%d %H:%M:%S %Z}{' (dry run)' if dry_run else ''}")
    try:
        results = run(dry_run)
    except AdminError as error:
        print(f"  FAILED    {error}")
        sys.exit(1)
    for r in results:
        what = ", ".join(r["done"]) if r["kind"] != "current" else "-"
        print(f"  {r['time']}  {r['kind']:<8} {r['username']:<22} {r['reason']}; {what}")
    took = (datetime.datetime.now().astimezone() - started).total_seconds()
    print(f"{len(results)} linked user(s), {took:.2f}s")


if __name__ == "__main__":
    main()
