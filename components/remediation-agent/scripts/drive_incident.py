#!/usr/bin/env python3
"""Drive one incident from alert to status draft, on this machine.

It plays every role in turn, with a token for that role from the test issuer,
and checks at each step that the right thing was allowed or refused:

    alert-automation    opens the incident and records the diagnosis   (MCP)
    developer           proposes the rollback                          (MCP)
    platform-engineer   tries to apply it: refused, not approved       (MCP and A2A)
    developer           tries to approve their own change: refused     (MCP)
    incident-manager    approves                                       (MCP)
    platform-engineer   applies through remediation-agent              (A2A, streamed)
    incident-manager    asks comms-agent for a status draft            (A2A)

delivery-mcp is called over MCP Streamable HTTP; the agents over A2A JSON-RPC.
The two agent calls make one model call each. Exits non-zero on the first
check that fails.

    python scripts/drive_incident.py
"""

from __future__ import annotations

import argparse
import asyncio
import json
import sys
import uuid
from typing import Any

import httpx
from mcp import ClientSession
from mcp.client.streamable_http import streamable_http_client

FOUR_KEYS = {"error", "layer", "rule", "message"}


class CheckFailed(Exception):  # noqa: N818
    pass


def check(condition: bool, what: str) -> None:
    if not condition:
        raise CheckFailed(what)
    print(f"      ok: {what}")


def step(number: int, who: str, what: str) -> None:
    print(f"\n[{number}] {who}: {what}")


class Driver:
    def __init__(self, args: argparse.Namespace) -> None:
        self.args = args
        self.http = httpx.AsyncClient(timeout=120)
        self._tokens: dict[str, str] = {}

    async def token(self, identity: str) -> str:
        if identity not in self._tokens:
            response = await self.http.get(f"{self.args.issuer}/token/{identity}")
            response.raise_for_status()
            self._tokens[identity] = response.text.strip()
        return self._tokens[identity]

    # -- delivery-mcp over MCP ---------------------------------------------

    async def tool(self, identity: str, name: str, **arguments: Any) -> tuple[bool, dict[str, Any]]:
        """Call one delivery-mcp tool as ``identity``. Returns (is_error, object)."""
        headers = {"Authorization": f"Bearer {await self.token(identity)}"}
        async with (
            httpx.AsyncClient(headers=headers, timeout=30) as client,
            streamable_http_client(self.args.delivery, http_client=client) as (read, write, _),
            ClientSession(read, write) as session,
        ):
            await session.initialize()
            result = await session.call_tool(name, arguments)
        data = result.structuredContent or json.loads(result.content[0].text)
        return bool(result.isError), data

    async def refused(self, identity: str, name: str, rule: str, **arguments: Any) -> None:
        is_error, data = await self.tool(identity, name, **arguments)
        print(f"      delivery-mcp: {json.dumps(data)}")
        check(is_error and set(data) == FOUR_KEYS, "a structured error with the four keys")
        check(
            (data["error"], data["layer"], data["rule"]) == ("forbidden", "service", rule),
            f"refused by the service, rule {rule}",
        )

    # -- agents over A2A ---------------------------------------------------

    async def card(self, base: str) -> dict[str, Any]:
        response = await self.http.get(f"{base}/.well-known/agent-card.json")
        response.raise_for_status()
        return response.json()

    async def a2a_stream(
        self, base: str, identity: str, request: dict[str, Any]
    ) -> list[dict[str, Any]]:
        """``message/stream``: send the request as JSON text, return every event."""
        body = {
            "jsonrpc": "2.0",
            "id": uuid.uuid4().hex,
            "method": "message/stream",
            "params": {
                "message": {
                    "kind": "message",
                    "role": "user",
                    "messageId": uuid.uuid4().hex,
                    "parts": [{"kind": "text", "text": json.dumps(request)}],
                }
            },
        }
        headers = {
            "Authorization": f"Bearer {await self.token(identity)}",
            "Accept": "text/event-stream",
        }
        events: list[dict[str, Any]] = []
        async with self.http.stream("POST", base, json=body, headers=headers) as response:
            if response.status_code != 200:
                raise CheckFailed(f"{base} answered {response.status_code}")
            async for line in response.aiter_lines():
                if not line.startswith("data:"):
                    continue
                payload = json.loads(line[5:])
                if "error" in payload:
                    raise CheckFailed(f"A2A error: {payload['error']}")
                event = payload["result"]
                events.append(event)
                self._show(event)
        return events

    @staticmethod
    def _show(event: dict[str, Any]) -> None:
        if event["kind"] == "task":
            print(f"      a2a task {event['id'][:8]} {event['status']['state']}")
        elif event["kind"] == "status-update":
            parts = (event["status"].get("message") or {}).get("parts", [])
            text = next((p["text"] for p in parts if p["kind"] == "text"), "")
            final = " (final)" if event.get("final") else ""
            print(f"      a2a status {event['status']['state']}{final}: {text}")
        elif event["kind"] == "artifact-update":
            print(f"      a2a artifact {event['artifact'].get('name')}")

    @staticmethod
    def result_of(events: list[dict[str, Any]]) -> tuple[str, dict[str, Any], str]:
        """(text, data, final state) of a finished stream."""
        (artifact,) = [e for e in events if e["kind"] == "artifact-update"]
        parts = artifact["artifact"]["parts"]
        text = next(p["text"] for p in parts if p["kind"] == "text")
        data = next(p["data"] for p in parts if p["kind"] == "data")
        return text, data, events[-1]["status"]["state"]

    # -- the incident ------------------------------------------------------

    async def run(self) -> None:
        a = self.args
        for name, base in (("remediation-agent", a.remediation), ("comms-agent", a.comms)):
            card = await self.card(base)
            print(
                f"{name}: A2A {card['protocolVersion']} {card['preferredTransport']} at"
                f" {card['url']}, skills {[s['id'] for s in card['skills']]}"
            )

        step(1, "alert-automation", "opens an incident on search-service, records the diagnosis")
        is_error, incident = await self.tool(
            "alert-automation",
            "open_incident",
            service="search-service",
            severity="sev2",
            summary="Every search on the Sample App returns an error",
            impact="Users cannot search the catalogue; registration is unaffected",
        )
        check(not is_error, f"incident opened: {incident.get('incident_id')}")
        incident_id = incident["incident_id"]
        is_error, incident = await self.tool(
            "alert-automation",
            "record_diagnosis",
            incident_id=incident_id,
            suspected_cause="search-service 2.1.0 fails on every query; 2.0.0 did not",
            evidence=["HTTP 500 on GET /search since the 2.1.0 rollout", "no errors before it"],
            recommended_version="2.0.0",
        )
        check(not is_error and incident["diagnosis"]["recommended_version"] == "2.0.0",
              "diagnosis recorded, recommending 2.0.0")  # fmt: skip

        step(2, "developer", "proposes returning search-service to 2.0.0")
        is_error, change = await self.tool(
            "developer", "propose_change", incident_id=incident_id, target_version="2.0.0"
        )
        check(
            not is_error and change["status"] == "proposed", f"proposed: {change.get('change_id')}"
        )
        change_id = change["change_id"]
        check(change["proposed_by"] == "developer", "proposed_by is the developer, from the token")

        step(3, "platform-engineer", "applies it before anyone approved it")
        await self.refused(
            "platform-engineer", "apply_change", "change_is_approved", change_id=change_id
        )
        print("    the same through remediation-agent:")
        events = await self.a2a_stream(
            a.remediation,
            "platform-engineer",
            {"action": "apply_and_verify", "change_id": change_id},
        )
        text, data, state = self.result_of(events)
        check(state == "failed" and data["outcome"] == "refused", "the agent reports a refusal")
        check(
            set(data["refusal"]) == FOUR_KEYS and data["refusal"]["rule"] == "change_is_approved",
            "the service's refusal came back intact",
        )
        check(text == data["refusal"]["message"], "in the service's words, not a model's")

        step(4, "developer", "approves their own change")
        await self.refused("developer", "approve_change", "role_required", change_id=change_id)
        print("    a person who holds both roles (test-two-roles, in no realm):")
        is_error, own = await self.tool(
            "test-two-roles", "propose_change", incident_id=incident_id, target_version="2.0.0"
        )
        check(not is_error, f"they propose {own.get('change_id')}")
        await self.refused(
            "test-two-roles",
            "approve_change",
            "approver_is_not_proposer",
            change_id=own["change_id"],
        )
        is_error, rejected = await self.tool(
            "incident-manager", "reject_change", change_id=own["change_id"], reason="duplicate"
        )
        check(not is_error and rejected["status"] == "rejected", "incident-manager rejects it")

        step(5, "incident-manager", "approves the developer's change")
        is_error, change = await self.tool(
            "incident-manager", "approve_change", change_id=change_id
        )
        check(not is_error and change["status"] == "approved", "approved")
        check(change["approved_by"] == "incident-manager", "approved_by is the incident manager")

        step(6, "platform-engineer", "applies it through remediation-agent")
        events = await self.a2a_stream(
            a.remediation,
            "platform-engineer",
            {"action": "apply_and_verify", "change_id": change_id},
        )
        text, data, state = self.result_of(events)
        stages = [
            p["data"]["status"]
            for e in events
            if e["kind"] == "status-update" and e["status"]["state"] == "working"
            for p in e["status"]["message"]["parts"]
            if p["kind"] == "data"
        ]
        check(stages == ["applying", "verifying", "applied"], f"streamed stages: {stages}")
        check(
            state == "completed" and data["outcome"] == "applied", "task completed, change applied"
        )
        applied = data["change"]
        check(
            (applied["proposed_by"], applied["approved_by"], applied["applied_by"])
            == ("developer", "incident-manager", "platform-engineer"),
            "three people: proposed, approved and applied by different callers",
        )
        check("status 200" in (applied["detail"] or ""), f"verified: {applied['detail']}")
        print(f'      result ({data["phrased_by"]}): "{text}"')
        check(data["phrased_by"] == "model", "worded by the fast model")
        check(text.count(". ") <= 1, "at most two sentences")

        is_error, again = await self.tool("platform-engineer", "apply_change", change_id=change_id)
        check(
            not is_error and again["replayed"] and again["operation_id"] == applied["operation_id"],
            "apply_change again is a replay of the same operation",
        )

        step(7, "incident-manager", "asks comms-agent for a status draft")
        events = await self.a2a_stream(
            a.comms,
            "incident-manager",
            {"action": "draft_status_update", "incident_id": incident_id},
        )
        text, data, state = self.result_of(events)
        print(f'      draft ({data["word_count"]} words): "{text}"')
        check(state == "completed" and data["outcome"] == "drafted", "task completed with a draft")
        check(0 < len(text.split()) <= 80, "at most 80 words")
        check(data["posted"] is False, "the agent says it did not post")

        is_error, incident = await self.tool("developer", "get_incident", incident_id=incident_id)
        check(incident["status"] == "resolved", "the incident is resolved")
        check(incident["status_updates"] == [], "and no status update was posted by anyone")
        print("\nAll checks passed.")


async def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.split("\n", 1)[0])
    parser.add_argument("--issuer", default="http://127.0.0.1:18199", help="the test issuer")
    parser.add_argument("--delivery", default="http://127.0.0.1:18190/mcp")
    parser.add_argument("--remediation", default="http://127.0.0.1:18191")
    parser.add_argument("--comms", default="http://127.0.0.1:18192")
    driver = Driver(parser.parse_args())
    try:
        await driver.run()
    except CheckFailed as exc:
        print(f"\nFAILED: {exc}", file=sys.stderr)
        return 1
    finally:
        await driver.http.aclose()
    return 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
