"""Every tool: one permitted and one refused case per rule.

Each call goes over HTTP with a signed token, so what is tested is the rule as
the service applies it to the identity in the token.
"""

from __future__ import annotations

from conftest import assert_error, assert_refused
from fastmcp import Client
from fastmcp.client.transports import StreamableHttpTransport

from delivery.service import TOOL_ROLES

# -- the tool set ----------------------------------------------------------


async def test_serves_exactly_the_contract_tools(server_url, issuer, world):
    transport = StreamableHttpTransport(f"{server_url}/mcp", auth=issuer.mint("developer"))
    async with Client(transport) as client:
        names = {tool.name for tool in await client.list_tools()}
    assert names == set(TOOL_ROLES)
    assert len(names) == 10


# -- list_incidents, get_incident: any signed-in caller --------------------


async def test_list_and_get_incident_permitted_for_any_role(call, incident):
    incident_id = await incident()
    for identity in ("developer", "incident-manager", "platform-engineer", "alert-automation"):
        listed = await call("list_incidents", identity)
        assert not listed.is_error
        assert [i["incident_id"] for i in listed.data["incidents"]] == [incident_id]
        got = await call("get_incident", identity, incident_id=incident_id)
        assert not got.is_error
        assert got.data["service"] == "search-service"
        assert got.data["status"] == "open"


async def test_get_incident_unknown_is_not_found(call):
    result = await call("get_incident", "developer", incident_id="INC-9999")
    assert_error(result, "not_found", "incident_exists")


# -- open_incident: alert-automation; one open incident per service --------


async def test_open_incident_permitted_for_alert_automation(call):
    result = await call(
        "open_incident",
        "alert-automation",
        service="search-service",
        severity="sev2",
        summary="Every search fails",
        impact="Users cannot search",
    )
    assert not result.is_error
    assert result.data["incident_id"] == "INC-0001"
    assert result.data["status"] == "open"
    assert result.data["opened_by"] == "service-account-alert-automation"


async def test_open_incident_refused_without_the_role(call):
    for identity in ("developer", "incident-manager", "platform-engineer"):
        result = await call(
            "open_incident",
            identity,
            service="search-service",
            severity="sev2",
            summary="s",
            impact="i",
        )
        assert_refused(result, "role_required")
    assert (await call("list_incidents", "developer")).data["incidents"] == []


async def test_one_open_incident_per_service(call, incident):
    first = await incident("search-service")
    # Refused: the service already has an unresolved incident.
    second = await call(
        "open_incident",
        "alert-automation",
        service="search-service",
        severity="sev1",
        summary="again",
        impact="again",
    )
    assert_refused(second, "one_open_incident_per_service")
    assert first in second.data["message"]
    # Permitted: a different service has none.
    other = await call(
        "open_incident",
        "alert-automation",
        service="registration-service",
        severity="sev3",
        summary="slow",
        impact="some",
    )
    assert not other.is_error
    assert other.data["incident_id"] != first


async def test_a_resolved_incident_does_not_block_a_new_one(call, approved_change, follow):
    incident_id, change_id = await approved_change()
    await call("apply_change", "platform-engineer", change_id=change_id)
    assert (await follow(incident_id, change_id))["status"] == "applied"
    again = await call(
        "open_incident",
        "alert-automation",
        service="search-service",
        severity="sev2",
        summary="back",
        impact="again",
    )
    assert not again.is_error


async def test_open_incident_unknown_service(call):
    result = await call(
        "open_incident",
        "alert-automation",
        service="billing",
        severity="sev2",
        summary="s",
        impact="i",
    )
    assert_error(result, "invalid_argument", "service_is_known")


# -- record_diagnosis: alert-automation ------------------------------------


async def test_record_diagnosis_permitted_for_alert_automation(call, incident):
    incident_id = await incident()
    result = await call(
        "record_diagnosis",
        "alert-automation",
        incident_id=incident_id,
        suspected_cause="2.1.0 queries a column that does not exist",
        evidence=["500 on every /search since the 2.1.0 rollout", "error: no such column"],
        recommended_version="2.0.0",
    )
    assert not result.is_error
    diagnosis = result.data["diagnosis"]
    assert diagnosis["recommended_version"] == "2.0.0"
    assert len(diagnosis["evidence"]) == 2
    assert diagnosis["recorded_by"] == "service-account-alert-automation"


async def test_record_diagnosis_refused_without_the_role(call, incident):
    incident_id = await incident()
    result = await call(
        "record_diagnosis",
        "incident-manager",
        incident_id=incident_id,
        suspected_cause="c",
        evidence=["e"],
        recommended_version="2.0.0",
    )
    assert_refused(result, "role_required")
    assert (await call("get_incident", "developer", incident_id=incident_id)).data[
        "diagnosis"
    ] is None


# -- propose_change: developer; team owns the service; retained earlier version


async def test_propose_change_permitted_for_owning_team_developer(call, incident):
    incident_id = await incident()
    result = await call(
        "propose_change", "developer", incident_id=incident_id, target_version="2.0.0"
    )
    assert not result.is_error
    change = result.data
    assert change["status"] == "proposed"
    assert change["proposed_by"] == "developer"
    assert change["approved_by"] is None and change["applied_by"] is None
    assert change["target_version"] == "2.0.0" and change["previous_version"] == "2.1.0"
    assert change["operation_id"].startswith("op-")
    incident_now = (await call("get_incident", "developer", incident_id=incident_id)).data
    assert incident_now["status"] == "mitigating"


async def test_propose_change_refused_without_the_role(call, incident):
    incident_id = await incident()
    for identity in ("incident-manager", "platform-engineer", "alert-automation"):
        result = await call(
            "propose_change", identity, incident_id=incident_id, target_version="2.0.0"
        )
        assert_refused(result, "role_required")


async def test_propose_change_refused_when_team_does_not_own_the_service(call, incident):
    incident_id = await incident("search-service")
    # A developer, but on team registration: search-service is not theirs.
    result = await call(
        "propose_change", "developer-other-team", incident_id=incident_id, target_version="2.0.0"
    )
    assert_refused(result, "team_owns_service")
    assert (await call("get_incident", "developer", incident_id=incident_id)).data["changes"] == []


async def test_propose_change_refused_for_a_version_that_is_not_retained(call, incident):
    incident_id = await incident()
    result = await call(
        "propose_change", "developer", incident_id=incident_id, target_version="1.9.0"
    )
    assert_refused(result, "target_is_retained_earlier_version")


async def test_propose_change_refused_for_a_retained_version_that_is_not_earlier(call, incident):
    incident_id = await incident()
    # 2.1.0 is retained in this test, and it is what is running.
    result = await call(
        "propose_change", "developer", incident_id=incident_id, target_version="2.1.0"
    )
    assert_refused(result, "target_is_retained_earlier_version")


async def test_propose_change_refuses_text_that_is_not_a_version(call, incident):
    incident_id = await incident()
    result = await call(
        "propose_change",
        "developer",
        incident_id=incident_id,
        target_version="2.0.0,web.image.tag=evil",
    )
    assert_refused(result, "target_is_retained_earlier_version")


async def test_owning_team_of_the_other_service(call, incident):
    # registration-service belongs to team registration; it has no version this
    # service can select, so the owner passes the team rule and stops at the next.
    incident_id = await incident("registration-service")
    not_owner = await call(
        "propose_change", "developer", incident_id=incident_id, target_version="2.0.0"
    )
    assert_refused(not_owner, "team_owns_service")
    owner = await call(
        "propose_change", "developer-other-team", incident_id=incident_id, target_version="2.0.0"
    )
    assert_refused(owner, "target_is_retained_earlier_version")


async def test_web_belongs_to_team_web(call, incident, world):
    incident_id = await incident("web")
    refused = await call(
        "propose_change", "developer", incident_id=incident_id, target_version="2.0.0"
    )
    assert_refused(refused, "team_owns_service")
    assert "team 'web'" in refused.data["message"]
    restarted = await call("restart_workload", "platform-engineer", service="web")
    assert not restarted.is_error
    assert world.restarter.calls == ["app.kubernetes.io/name=web"]


# -- approve_change: incident-manager; approver is not the proposer --------


async def test_approve_change_permitted_for_incident_manager(call, incident):
    incident_id = await incident()
    change_id = (
        await call("propose_change", "developer", incident_id=incident_id, target_version="2.0.0")
    ).data["change_id"]
    result = await call("approve_change", "incident-manager", change_id=change_id)
    assert not result.is_error
    assert result.data["status"] == "approved"
    assert result.data["approved_by"] == "incident-manager"
    assert result.data["proposed_by"] == "developer"


async def test_approve_change_refused_without_the_role(call, incident):
    incident_id = await incident()
    change_id = (
        await call("propose_change", "developer", incident_id=incident_id, target_version="2.0.0")
    ).data["change_id"]
    # The proposer, who holds only the developer role, and a platform engineer.
    for identity in ("developer", "platform-engineer"):
        assert_refused(await call("approve_change", identity, change_id=change_id), "role_required")
    change = (await call("get_incident", "developer", incident_id=incident_id)).data["changes"][0]
    assert change["status"] == "proposed" and change["approved_by"] is None


async def test_approver_is_not_the_proposer(call, incident):
    incident_id = await incident()
    # One person holding both roles proposes, then tries to approve their own change.
    change_id = (
        await call(
            "propose_change", "test-two-roles", incident_id=incident_id, target_version="2.0.0"
        )
    ).data["change_id"]
    own = await call("approve_change", "test-two-roles", change_id=change_id)
    assert_refused(own, "approver_is_not_proposer")
    change = (await call("get_incident", "developer", incident_id=incident_id)).data["changes"][0]
    assert change["status"] == "proposed" and change["approved_by"] is None
    # Permitted: someone else with the role approves it.
    other = await call("approve_change", "incident-manager", change_id=change_id)
    assert not other.is_error and other.data["approved_by"] == "incident-manager"


async def test_approve_change_twice_is_an_invalid_state(call, approved_change):
    _, change_id = await approved_change()
    again = await call("approve_change", "incident-manager", change_id=change_id)
    assert_error(again, "invalid_state", "change_is_pending")


# -- reject_change: incident-manager ---------------------------------------


async def test_reject_change_permitted_for_incident_manager(call, incident):
    incident_id = await incident()
    change_id = (
        await call("propose_change", "developer", incident_id=incident_id, target_version="2.0.0")
    ).data["change_id"]
    result = await call(
        "reject_change", "incident-manager", change_id=change_id, reason="wrong service"
    )
    assert not result.is_error
    assert result.data["status"] == "rejected"
    assert result.data["rejected_by"] == "incident-manager"
    assert result.data["reject_reason"] == "wrong service"
    # A rejected change can be neither approved nor applied.
    assert_error(
        await call("approve_change", "incident-manager", change_id=change_id),
        "invalid_state",
        "change_is_pending",
    )
    assert_refused(
        await call("apply_change", "platform-engineer", change_id=change_id), "change_is_approved"
    )


async def test_reject_change_refused_without_the_role(call, incident):
    incident_id = await incident()
    change_id = (
        await call("propose_change", "developer", incident_id=incident_id, target_version="2.0.0")
    ).data["change_id"]
    result = await call("reject_change", "developer", change_id=change_id, reason="no")
    assert_refused(result, "role_required")


# -- apply_change: platform-engineer; change is approved -------------------


async def test_apply_change_permitted_for_platform_engineer_on_an_approved_change(
    call, approved_change, follow, world
):
    incident_id, change_id = await approved_change()
    result = await call("apply_change", "platform-engineer", change_id=change_id)
    assert not result.is_error
    assert result.data["status"] in {"applying", "verifying", "applied"}
    assert result.data["applied_by"] == "platform-engineer"
    assert result.data["replayed"] is False

    change = await follow(incident_id, change_id)
    assert change["status"] == "applied"
    assert (change["proposed_by"], change["approved_by"], change["applied_by"]) == (
        "developer",
        "incident-manager",
        "platform-engineer",
    )
    assert [h["status"] for h in change["history"]] == [
        "proposed",
        "approved",
        "applying",
        "verifying",
        "applied",
    ]
    assert world.applier.versions["search-service"] == "2.0.0"
    assert world.verifier.calls == ["search-service"]
    incident_now = (await call("get_incident", "developer", incident_id=incident_id)).data
    assert incident_now["status"] == "resolved" and incident_now["resolved_at"]


async def test_apply_change_refused_without_the_role(call, approved_change, world):
    _, change_id = await approved_change()
    for identity in ("developer", "incident-manager", "alert-automation"):
        assert_refused(await call("apply_change", identity, change_id=change_id), "role_required")
    assert world.applier.calls == []


async def test_apply_change_refused_when_the_change_is_not_approved(call, incident, world):
    incident_id = await incident()
    change_id = (
        await call("propose_change", "developer", incident_id=incident_id, target_version="2.0.0")
    ).data["change_id"]
    result = await call("apply_change", "platform-engineer", change_id=change_id)
    assert_refused(result, "change_is_approved")
    assert world.applier.calls == []
    change = (await call("get_incident", "developer", incident_id=incident_id)).data["changes"][0]
    assert change["status"] == "proposed" and change["applied_by"] is None


async def test_apply_change_unknown_change(call):
    result = await call("apply_change", "platform-engineer", change_id="CHG-9999")
    assert_error(result, "not_found", "change_exists")


# -- restart_workload: platform-engineer; no approval needed ---------------


async def test_restart_workload_permitted_for_platform_engineer_without_approval(call, world):
    # No incident and no change exist: a restart needs neither.
    result = await call("restart_workload", "platform-engineer", service="search-service")
    assert not result.is_error
    assert result.data["restarted_by"] == "platform-engineer"
    assert result.data["label_selector"] == "app.kubernetes.io/name=search-service"
    assert result.data["namespace"] == "sample-app"
    assert world.restarter.calls == ["app.kubernetes.io/name=search-service"]


async def test_restart_workload_refused_without_the_role(call, world):
    for identity in ("developer", "incident-manager", "alert-automation"):
        result = await call("restart_workload", identity, service="search-service")
        assert_refused(result, "role_required")
    assert world.restarter.calls == []


async def test_restart_workload_unknown_service(call, world):
    result = await call("restart_workload", "platform-engineer", service="kube-system")
    assert_error(result, "invalid_argument", "service_is_known")
    assert world.restarter.calls == []


# -- post_status_update: incident-manager ----------------------------------


async def test_post_status_update_permitted_for_incident_manager(call, incident):
    incident_id = await incident()
    result = await call(
        "post_status_update",
        "incident-manager",
        incident_id=incident_id,
        text="We are rolling search back to 2.0.0.",
    )
    assert not result.is_error
    assert result.data["status_updates"] == [
        {
            "text": "We are rolling search back to 2.0.0.",
            "posted_by": "incident-manager",
            "posted_at": result.data["status_updates"][0]["posted_at"],
        }
    ]


async def test_post_status_update_refused_without_the_role(call, incident):
    incident_id = await incident()
    for identity in ("developer", "platform-engineer", "alert-automation"):
        result = await call("post_status_update", identity, incident_id=incident_id, text="hi")
        assert_refused(result, "role_required")
    assert (await call("get_incident", "developer", incident_id=incident_id)).data[
        "status_updates"
    ] == []
