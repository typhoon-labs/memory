"""The caller comes from the verified token, and from nothing else."""

from __future__ import annotations

import json
import logging
import time

import httpx
import jwt
import pytest
from conftest import AUDIENCE, assert_refused
from cryptography.hazmat.primitives.asymmetric import rsa
from fastmcp import Client
from fastmcp.client.transports import StreamableHttpTransport
from test_issuer import TestIssuer

from delivery.config import load_settings
from delivery.identity import MAX_CHAIN, build_verifier, caller_from_claims, chain_from_act

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


def test_the_chain_is_read_from_act_newest_first():
    act = {
        "sub": "system:serviceaccount:agents:remediation-agent",
        "client_id": "remediation-agent",
        "act": {
            "sub": "system:serviceaccount:agents:chat-assistant",
            "client_id": "chat-assistant",
        },
    }
    caller = caller_from_claims({"preferred_username": "platform-engineer", "act": act})
    assert caller is not None and caller.chain == ("remediation-agent", "chat-assistant")
    assert caller.describe().endswith("; through remediation-agent, chat-assistant)")
    # The user's own token: no chain.
    own = caller_from_claims({"preferred_username": "platform-engineer"})
    assert own is not None and own.chain == ()
    assert own.describe() == "platform-engineer (roles: none; team: none)"


def test_chain_from_act_names_each_agent_by_client_id_else_sub():
    assert chain_from_act(None) == ()
    assert chain_from_act("chat-assistant") == ()
    assert chain_from_act({"sub": "sa:one", "act": {"client_id": "two", "sub": "sa:two"}}) == (
        "sa:one",
        "two",
    )
    # A level that names nobody ends the chain.
    assert chain_from_act({"client_id": "one", "act": {"act": {"client_id": "three"}}}) == ("one",)
    deep: dict = {"client_id": "a"}
    for _ in range(40):
        deep = {"client_id": "a", "act": deep}
    assert len(chain_from_act(deep)) == MAX_CHAIN


def test_a_delegated_tokens_user_is_never_the_agent():
    act = {"sub": "system:serviceaccount:agents:remediation-agent", "client_id": "remediation"}
    delegated = {"sub": "u-1", "client_id": "remediation", "azp": "remediation", "act": act}
    caller = caller_from_claims({**delegated, "preferred_username": "platform-engineer"})
    assert caller is not None and caller.user == "platform-engineer"
    caller = caller_from_claims(delegated)
    assert caller is not None and caller.user == "u-1"
    assert caller_from_claims({"client_id": "remediation", "act": act}) is None


# -- chain-sts's tokens -------------------------------------------------------
#
# A second issuer, with its own keys. A token is verified against the keys of
# the issuer it names, and must pass the same checks as Keycloak's.


def test_a_chain_token_is_accepted(server_url, chain, world):
    assert post_mcp(server_url, chain.delegate("platform-engineer")).status_code == 200


async def test_every_record_names_the_chain_next_to_the_user(call, chain, world):
    """Who acted, and through which agents, newest first: [] for the user's own token."""
    via_chat = ["chat-assistant"]
    opened = await call(
        "open_incident",
        token=chain.delegate("alert-automation", "chat-assistant"),
        service="search-service",
        severity="sev2",
        summary="Every search fails",
        impact="Users cannot search",
    )
    assert not opened.is_error, opened.data
    incident_id = opened.data["incident_id"]
    assert opened.data["opened_via"] == via_chat
    diagnosed = await call(
        "record_diagnosis",
        token=chain.delegate("alert-automation", "chat-assistant"),
        incident_id=incident_id,
        suspected_cause="2.1.0",
        evidence=["errors"],
        recommended_version="2.0.0",
    )
    assert diagnosed.data["diagnosis"]["recorded_via"] == via_chat
    # Proposed with the developer's own token: an empty chain.
    proposed = await call(
        "propose_change", "developer", incident_id=incident_id, target_version="2.0.0"
    )
    change_id = proposed.data["change_id"]
    assert proposed.data["proposed_by"] == "developer" and proposed.data["proposed_via"] == []
    approved = await call(
        "approve_change",
        token=chain.delegate("incident-manager", "chat-assistant"),
        change_id=change_id,
    )
    assert (approved.data["approved_by"], approved.data["approved_via"]) == (
        "incident-manager",
        via_chat,
    )
    applied = await call(
        "apply_change",
        token=chain.delegate("platform-engineer", "chat-assistant", "remediation-agent"),
        change_id=change_id,
    )
    assert applied.data["applied_via"] == ["remediation-agent", "chat-assistant"]
    assert [(h["status"], h["by"], h["via"]) for h in applied.data["history"]] == [
        ("proposed", "developer", []),
        ("approved", "incident-manager", via_chat),
        ("applying", "platform-engineer", ["remediation-agent", "chat-assistant"]),
    ]
    await world.service.drain()
    incident = (await call("get_incident", "developer", incident_id=incident_id)).data
    # The service's own moves name nobody.
    assert [(h["status"], h["by"], h["via"]) for h in incident["changes"][0]["history"][3:]] == [
        ("verifying", None, None),
        ("applied", None, None),
    ]
    posted = await call(
        "post_status_update",
        token=chain.delegate("incident-manager", "chat-assistant"),
        incident_id=incident_id,
        text="Rolled back.",
    )
    assert [(u["posted_by"], u["posted_via"]) for u in posted.data["status_updates"]] == [
        ("incident-manager", via_chat)
    ]
    restarted = await call(
        "restart_workload",
        token=chain.delegate("platform-engineer", "chat-assistant"),
        service="web",
    )
    assert (restarted.data["restarted_by"], restarted.data["restarted_via"]) == (
        "platform-engineer",
        via_chat,
    )


async def test_the_audit_line_names_the_chain(call, chain, incident, caplog):
    incident_id = await incident()
    caplog.set_level(logging.INFO, logger="delivery.audit")
    await call(
        "get_incident",
        token=chain.delegate("platform-engineer", "chat-assistant", "remediation-agent"),
        incident_id=incident_id,
    )
    await call(
        "apply_change",
        token=chain.delegate("platform-engineer", "chat-assistant"),
        change_id="CHG-9999",
    )
    await call("get_incident", "developer", incident_id=incident_id)
    lines = [json.loads(r.getMessage()) for r in caplog.records if r.name == "delivery.audit"]
    assert [(line["tool"], line["user"], line["chain"], line["outcome"]) for line in lines] == [
        ("get_incident", "platform-engineer", ["remediation-agent", "chat-assistant"], "allowed"),
        ("apply_change", "platform-engineer", ["chat-assistant"], "not_found"),
        ("get_incident", "developer", [], "allowed"),
    ]


async def test_a_chain_token_acts_as_its_user_not_as_the_agent(call, chain, incident):
    incident_id = await incident()
    change_id = (
        await call("propose_change", "developer", incident_id=incident_id, target_version="2.0.0")
    ).data["change_id"]
    token = chain.delegate("incident-manager", "chat-assistant", "comms-agent")
    result = await call("approve_change", token=token, change_id=change_id)
    assert not result.is_error, result.data
    assert result.data["approved_by"] == "incident-manager"
    # The user's roles count, not the agent's: a developer's chain token cannot approve.
    refused = await call(
        "reject_change", token=chain.delegate("developer"), change_id=change_id, reason="no"
    )
    assert_refused(refused, "role_required")


@pytest.mark.parametrize(
    "overrides",
    [
        pytest.param({"aud": "some-other-audience"}, id="wrong audience"),
        pytest.param({"aud": None}, id="no audience"),
        pytest.param({"exp": int(time.time()) - 60}, id="expired"),
        pytest.param({"exp": None}, id="no expiry"),
        pytest.param({"nbf": int(time.time()) + 3600}, id="not valid yet"),
        pytest.param({"iss": "http://chain-sts.elsewhere.svc.cluster.local"}, id="unknown issuer"),
        pytest.param({"iss": None}, id="no issuer"),
    ],
)
def test_a_chain_token_that_fails_a_check_is_401(server_url, chain, world, overrides):
    token = chain.delegate("platform-engineer", **overrides)
    assert post_mcp(server_url, token).status_code == 401


def test_a_token_from_an_issuer_that_is_not_configured_is_401(server_url, world):
    stranger = TestIssuer(issuer="http://127.0.0.1:1", audience=AUDIENCE)
    assert post_mcp(server_url, stranger.delegate("platform-engineer")).status_code == 401
    assert post_mcp(server_url, stranger.mint("platform-engineer")).status_code == 401


@pytest.mark.parametrize("kid", ["signer's", "named issuer's"])
def test_a_token_signed_by_the_other_issuers_key_is_401(server_url, issuer, chain, world, kid):
    # Each issuer's claims, signed with the other one's key, with the signer's
    # kid or with the kid of the issuer the token names.
    for named, signer in ((issuer, chain), (chain, issuer)):
        body = claims(named) if named is issuer else named.delegated_claims("platform-engineer")
        token = signer.sign(body, kid=signer.kid if kid == "signer's" else named.kid)
        assert post_mcp(server_url, token).status_code == 401, named.issuer


@pytest.mark.parametrize(
    "token",
    [
        pytest.param("not-a-jwt", id="one part"),
        pytest.param("a.b.c", id="not base64url JSON"),
        pytest.param("eyJhbGciOiJSUzI1NiJ9.WyJpc3MiXQ.c2ln", id="claims not an object"),
    ],
)
def test_a_bearer_that_is_not_a_jwt_is_401(server_url, world, token):
    assert post_mcp(server_url, token).status_code == 401


async def test_without_the_delegation_bindings_only_keycloak_is_trusted(issuer, chain):
    verifier = build_verifier(
        load_settings(
            {
                "OIDC_ISSUER": issuer.issuer,
                "OIDC_JWKS_URL": issuer.jwks_url,
                "OIDC_AUDIENCE": AUDIENCE,
            }
        )
    )
    assert await verifier.verify_token(issuer.mint("platform-engineer")) is not None
    assert await verifier.verify_token(chain.delegate("platform-engineer")) is None
