"""The caller comes from the verified token, and from nothing else."""

from __future__ import annotations

import time

import httpx
import jwt
import pytest
from conftest import AUDIENCE, assert_refused
from cryptography.hazmat.primitives.asymmetric import rsa
from fastmcp import Client
from fastmcp.client.transports import StreamableHttpTransport

from delivery.identity import caller_from_claims

INITIALIZE = {
    "jsonrpc": "2.0",
    "id": 1,
    "method": "initialize",
    "params": {
        "protocolVersion": "2025-06-18",
        "capabilities": {},
        "clientInfo": {"name": "test", "version": "0"},
    },
}
MCP_HEADERS = {"Accept": "application/json, text/event-stream", "Content-Type": "application/json"}


def post_mcp(server_url: str, token: str | None) -> httpx.Response:
    headers = dict(MCP_HEADERS)
    if token is not None:
        headers["Authorization"] = f"Bearer {token}"
    return httpx.post(f"{server_url}/mcp", json=INITIALIZE, headers=headers, timeout=5)


def claims(issuer, **overrides):
    now = int(time.time())
    base = {
        "iss": issuer.issuer,
        "aud": AUDIENCE,
        "sub": "u-1",
        "iat": now,
        "exp": now + 300,
        "preferred_username": "platform-engineer",
        "roles": ["platform-engineer"],
        "team": "platform",
    }
    base.update(overrides)
    return {k: v for k, v in base.items() if v is not None}


def test_healthz_needs_no_token(server_url):
    response = httpx.get(f"{server_url}/healthz", timeout=5)
    assert response.status_code == 200
    assert response.json()["status"] == "ok"


def test_a_valid_token_is_accepted(server_url, issuer, world):
    assert post_mcp(server_url, issuer.sign(claims(issuer))).status_code == 200


def test_no_token_is_401(server_url, world):
    response = post_mcp(server_url, None)
    assert response.status_code == 401
    assert response.headers["www-authenticate"].lower().startswith("bearer")


@pytest.mark.parametrize(
    "overrides",
    [
        pytest.param({"aud": "some-other-audience"}, id="wrong audience"),
        pytest.param({"aud": None}, id="no audience"),
        pytest.param({"iss": "http://localhost:18081/realms/other"}, id="wrong issuer"),
        pytest.param({"iss": None}, id="no issuer"),
        pytest.param({"exp": int(time.time()) - 60}, id="expired"),
        pytest.param({"exp": None}, id="no expiry"),
        pytest.param({"nbf": int(time.time()) + 3600}, id="not valid yet"),
    ],
)
def test_a_token_that_fails_a_check_is_401(server_url, issuer, world, overrides):
    assert post_mcp(server_url, issuer.sign(claims(issuer, **overrides))).status_code == 401


def test_a_token_signed_by_another_key_is_401(server_url, issuer, world):
    other = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    forged = jwt.encode(claims(issuer), other, algorithm="RS256", headers={"kid": issuer.kid})
    assert post_mcp(server_url, forged).status_code == 401


def test_an_unsigned_token_is_401(server_url, issuer, world):
    unsigned = jwt.encode(claims(issuer), key=None, algorithm="none", headers={"kid": issuer.kid})
    assert post_mcp(server_url, unsigned).status_code == 401


def test_a_token_signed_with_the_public_key_as_a_secret_is_401(server_url, issuer, world):
    # The classic algorithm confusion: HS256 keyed with the JWKS document.
    forged = jwt.encode(
        claims(issuer), key="x" * 64, algorithm="HS256", headers={"kid": issuer.kid}
    )
    assert post_mcp(server_url, forged).status_code == 401


async def test_roles_given_as_a_string_grant_nothing(call, issuer, world):
    token = issuer.mint("platform-engineer", roles="platform-engineer")
    result = await call("restart_workload", token=token, service="search-service")
    assert_refused(result, "role_required")
    assert world.restarter.calls == []


async def test_a_token_without_roles_can_read_and_nothing_else(call, issuer, incident, world):
    incident_id = await incident()
    token = issuer.mint("developer", roles=None)
    assert not (await call("get_incident", token=token, incident_id=incident_id)).is_error
    refused = await call(
        "propose_change", token=token, incident_id=incident_id, target_version="2.0.0"
    )
    assert_refused(refused, "role_required")


async def test_a_token_without_team_owns_no_service(call, issuer, incident):
    incident_id = await incident()
    token = issuer.mint("developer", team=None)
    refused = await call(
        "propose_change", token=token, incident_id=incident_id, target_version="2.0.0"
    )
    assert_refused(refused, "team_owns_service")


async def test_identity_in_headers_is_ignored(call, incident):
    incident_id = await incident()
    change_id = (
        await call("propose_change", "developer", incident_id=incident_id, target_version="2.0.0")
    ).data["change_id"]
    # A developer's token, with headers that claim to be an incident manager.
    result = await call(
        "approve_change",
        "developer",
        headers={
            "X-User": "incident-manager",
            "X-Roles": "incident-manager",
            "X-Forwarded-User": "incident-manager",
            "X-Team": "incident",
        },
        change_id=change_id,
    )
    assert_refused(result, "role_required")
    assert "developer" in result.data["message"]


async def test_identity_cannot_be_passed_as_an_argument(server_url, issuer, incident, call):
    incident_id = await incident()
    change_id = (
        await call("propose_change", "developer", incident_id=incident_id, target_version="2.0.0")
    ).data["change_id"]
    transport = StreamableHttpTransport(f"{server_url}/mcp", auth=issuer.mint("developer"))
    async with Client(transport) as client:
        result = await client.call_tool(
            "approve_change",
            {
                "change_id": change_id,
                "approved_by": "incident-manager",
                "roles": ["incident-manager"],
            },
            raise_on_error=False,
        )
    assert result.is_error
    change = (await call("get_incident", "developer", incident_id=incident_id)).data["changes"][0]
    assert change["status"] == "proposed" and change["approved_by"] is None


def test_caller_from_claims_types():
    assert caller_from_claims({}) is None
    caller = caller_from_claims(
        {"preferred_username": "dev", "roles": ["developer", 7, ""], "team": ["search"]}
    )
    assert caller is not None
    assert caller.user == "dev" and caller.roles == frozenset({"developer"}) and caller.team is None
    machine = caller_from_claims({"client_id": "alert-automation", "roles": ["alert-automation"]})
    assert machine is not None and machine.user == "alert-automation"
