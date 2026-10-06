"""apply_change: idempotent on change_id, and honest about failure."""

from __future__ import annotations

import asyncio

from conftest import assert_refused


async def test_apply_change_is_idempotent(call, approved_change, follow, world):
    incident_id, change_id = await approved_change()

    first = await call("apply_change", "platform-engineer", change_id=change_id)
    assert not first.is_error and first.data["replayed"] is False
    applied = await follow(incident_id, change_id)
    assert applied["status"] == "applied"

    # The same call again: nothing is applied a second time, and the answer is
    # the change as it stands.
    second = await call("apply_change", "platform-engineer", change_id=change_id)
    assert not second.is_error
    assert second.data["replayed"] is True
    assert second.data["status"] == "applied"
    assert second.data["operation_id"] == first.data["operation_id"]
    assert second.data["applied_by"] == "platform-engineer"

    assert len(world.applier.calls) == 1
    assert world.applier.calls[0] == ("search-service", "2.0.0", first.data["operation_id"])
    assert len(world.verifier.calls) == 1
    statuses = [h["status"] for h in second.data["history"]]
    assert statuses.count("applying") == 1 and statuses.count("applied") == 1


async def test_apply_change_called_while_in_flight_starts_nothing(
    call, approved_change, follow, world
):
    incident_id, change_id = await approved_change()
    world.applier.delay_seconds = 0.3

    first = await call("apply_change", "platform-engineer", change_id=change_id)
    assert first.data["status"] == "applying" and first.data["replayed"] is False
    again = await call("apply_change", "platform-engineer", change_id=change_id)
    assert not again.is_error
    assert again.data["replayed"] is True
    assert again.data["status"] in {"applying", "verifying"}

    assert (await follow(incident_id, change_id))["status"] == "applied"
    assert len(world.applier.calls) == 1


async def test_concurrent_apply_change_calls_apply_once(call, approved_change, follow, world):
    incident_id, change_id = await approved_change()
    world.applier.delay_seconds = 0.1

    results = await asyncio.gather(
        *(call("apply_change", "platform-engineer", change_id=change_id) for _ in range(5))
    )
    assert all(not r.is_error for r in results)
    assert sorted(r.data["replayed"] for r in results) == [False, True, True, True, True]
    assert len({r.data["operation_id"] for r in results}) == 1

    assert (await follow(incident_id, change_id))["status"] == "applied"
    assert len(world.applier.calls) == 1


async def test_apply_passes_through_applying_and_verifying(call, approved_change, follow, world):
    incident_id, change_id = await approved_change()
    world.applier.delay_seconds = 0.2
    world.verifier.delay_seconds = 0.2

    await call("apply_change", "platform-engineer", change_id=change_id)
    seen = set()
    for _ in range(100):
        incident = (await call("get_incident", "developer", incident_id=incident_id)).data
        status = incident["changes"][0]["status"]
        seen.add(status)
        if status == "applied":
            break
        # Not resolved until the change is verified.
        assert incident["status"] == "mitigating"
        await asyncio.sleep(0.02)
    assert {"applying", "verifying", "applied"} <= seen


async def test_a_failed_apply_marks_the_change_failed(call, approved_change, follow, world):
    incident_id, change_id = await approved_change()
    world.applier.fail_with = "helm exited 1: UPGRADE FAILED"

    await call("apply_change", "platform-engineer", change_id=change_id)
    change = await follow(incident_id, change_id)
    assert change["status"] == "failed"
    assert "UPGRADE FAILED" in change["detail"]
    assert world.verifier.calls == []
    incident = (await call("get_incident", "developer", incident_id=incident_id)).data
    assert incident["status"] == "mitigating"

    # Idempotent here too: the failed change is reported, not retried.
    again = await call("apply_change", "platform-engineer", change_id=change_id)
    assert again.data["status"] == "failed" and again.data["replayed"] is True
    assert len(world.applier.calls) == 1


async def test_a_failed_verification_marks_the_change_failed(call, approved_change, follow, world):
    incident_id, change_id = await approved_change()
    world.verifier.ok = False
    world.verifier.detail = "search check failed after 3 attempt(s) in 5s; last: status 500"

    await call("apply_change", "platform-engineer", change_id=change_id)
    change = await follow(incident_id, change_id)
    assert change["status"] == "failed"
    assert "status 500" in change["detail"]
    assert [h["status"] for h in change["history"]][-3:] == ["applying", "verifying", "failed"]
    incident = (await call("get_incident", "developer", incident_id=incident_id)).data
    assert incident["status"] == "mitigating" and incident["resolved_at"] is None


async def test_a_second_change_can_follow_a_failed_one(call, approved_change, follow, world):
    incident_id, change_id = await approved_change()
    world.applier.fail_with = "boom"
    await call("apply_change", "platform-engineer", change_id=change_id)
    assert (await follow(incident_id, change_id))["status"] == "failed"

    world.applier.fail_with = None
    retry_id = (
        await call("propose_change", "developer", incident_id=incident_id, target_version="2.0.0")
    ).data["change_id"]
    # The new change needs its own approval.
    assert_refused(
        await call("apply_change", "platform-engineer", change_id=retry_id), "change_is_approved"
    )
    await call("approve_change", "incident-manager", change_id=retry_id)
    await call("apply_change", "platform-engineer", change_id=retry_id)
    assert (await follow(incident_id, retry_id))["status"] == "applied"
