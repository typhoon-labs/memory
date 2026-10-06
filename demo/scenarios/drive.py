#!/usr/bin/env python3
"""Drive the incident end to end on the cluster, as each role, with real tokens.

Everything goes through Agentgateway at http://localhost:18080: delivery-mcp
over MCP (Streamable HTTP) and the agents over A2A (JSON-RPC). Nothing here
talks to a component directly. Tokens come from Keycloak through
local/identity/token.sh, which is what `task token -- <user>` runs.

    1  release               ships search-service 2.1.0; the search starts failing
    2  Alertmanager          posts the alert to the hook; chat-assistant opens
                             the incident, and its card is there for everyone   A2A
    3  diagnosis-agent       fills in the cause, the evidence and a version
    4  developer             proposes returning to 2.0.0                       MCP
    5  developer             calls apply_change: refused by the gateway        MCP
    6  platform-engineer     calls apply_change before approval: refused by
                             the service, rule change_is_approved              MCP
    7  developer-other-team  proposes: refused by the service, rule
                             team_owns_service                                 MCP
    8  incident-manager      approves                                          MCP
    9  platform-engineer     applies through remediation-agent                 A2A
   10                        the Helm release is back at 2.0.0, search
                             recovers, the incident and the alert resolve
   11  incident-manager      asks comms-agent for a status draft               A2A

Steps 2 and 3 do nothing but wait and look: the alert rule, Alertmanager, the
hook and diagnosis-agent do the work. Two other ways to get an incident:

    --alert manual   post the alert to the hook by hand (demo/scenarios/alert.sh),
                     for when Alertmanager is not installed or does not call
    --alert direct   open the incident and record a diagnosis with delivery-mcp's
                     own tools, as alert-automation, with no chat-assistant

Start from a clean state (`task demo:reset`). The script stops at the first
check that fails and exits non-zero. It needs Python 3.10+ and nothing else;
it makes the HTTP requests itself so that what a client sees of a refusal
(status, headers, body) is printed exactly.

A model that is down or slow must not stop the incident: step 9 passes with
the result worded by the model or by the agent's template, and step 11 passes
with a draft or with a clear, prompt report that none was written. Use
--expect-model up or down to insist on one of the two. (Step 3 does need the
model: with it down, use --alert manual, which records a diagnosis by hand.)
"""

from __future__ import annotations

import argparse
import datetime
import json
import pathlib
import subprocess
import sys
import threading
import time
import urllib.error
import urllib.request
import uuid
from typing import Any

REPO = pathlib.Path(__file__).resolve().parents[2]
KUBECONFIG = REPO / "local" / "kind" / "kubeconfig"
CONTEXT = "kind-agentgateway-demo"
SELECTION = REPO / "agent-deployments/clusters/dev/workloads/sample-app/values.yaml"
FOUR_KEYS = {"error", "layer", "rule", "message"}
MCP_PROTOCOL = "2025-06-18"
A2UI_EXTENSION = "https://a2ui.org/a2a-extension/a2ui/v0.9.1"
A2UI_MIME = "application/a2ui+json"
SYNC_MIME = "application/vnd.chat-assistant.sync+json"
ALERT_NAME = "SearchErrorRatioHigh"
ALERTMANAGER_POD = "alertmanager-kube-prometheus-stack-alertmanager-0"


class CheckFailed(Exception):
    pass


def check(condition: bool, what: str) -> None:
    if not condition:
        raise CheckFailed(what)
    print(f"      ok: {what}")


def step(number: int, who: str, what: str) -> None:
    print(f"\n[{number}] {who}: {what}")


def run(*command: str, timeout: float = 180) -> str:
    done = subprocess.run(command, capture_output=True, text=True, timeout=timeout, check=False)
    if done.returncode != 0:
        raise CheckFailed(f"{' '.join(command[:3])} ... exited {done.returncode}: {done.stderr.strip()}")
    return done.stdout


def helm(*args: str) -> str:
    return run("helm", "--kubeconfig", str(KUBECONFIG), "--kube-context", CONTEXT, *args)


def kubectl(*args: str) -> str:
    return run("kubectl", "--kubeconfig", str(KUBECONFIG), "--context", CONTEXT, *args)


class Http:
    """One HTTP exchange, kept whole: status, content type and body."""

    def __init__(self, status: int, headers: Any, body: str) -> None:
        self.status = status
        self.headers = headers
        self.content_type = headers.get("Content-Type", "")
        self.body = body

    def json(self) -> Any:
        """The JSON body, or the first JSON message of an event stream."""
        if self.content_type.startswith("text/event-stream"):
            for line in self.body.splitlines():
                if line.startswith("data:"):
                    return json.loads(line[5:])
            raise CheckFailed(f"an event stream with no data: {self.body[:200]!r}")
        return json.loads(self.body)

    def describe(self) -> str:
        return f"HTTP {self.status}, {self.content_type or 'no content type'}: {self.body.strip()[:300]}"


def post(url: str, body: dict[str, Any], headers: dict[str, str], timeout: float = 60) -> Http:
    request = urllib.request.Request(
        url, data=json.dumps(body).encode(), headers={"Content-Type": "application/json", **headers}
    )
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            return Http(response.status, response.headers, response.read().decode())
    except urllib.error.HTTPError as error:
        return Http(error.code, error.headers, error.read().decode())


class SearchWatch:
    """Asks the Sample App's search several times a second and keeps every answer.

    The answers give the two timings: how long after the break the search
    fails, and how long after the apply it works again.
    """

    def __init__(self, url: str, interval: float = 0.2) -> None:
        self.url = url
        self.interval = interval
        self.samples: list[tuple[float, int]] = []
        self._stop = threading.Event()
        self._thread = threading.Thread(target=self._loop, daemon=True)

    def once(self) -> int:
        try:
            with urllib.request.urlopen(self.url, timeout=3) as response:
                return int(response.status)
        except urllib.error.HTTPError as error:
            return int(error.code)
        except OSError:
            return 0

    def _loop(self) -> None:
        while not self._stop.is_set():
            self.samples.append((time.monotonic(), self.once()))
            self._stop.wait(self.interval)

    def start(self) -> None:
        self._thread.start()

    def stop(self) -> None:
        self._stop.set()
        if self._thread.is_alive():
            self._thread.join(timeout=5)

    def first(self, status: int, after: float) -> float | None:
        """When ``status`` was first seen after ``after``."""
        return next((t for t, s in self.samples if t >= after and s == status), None)

    def last_other(self, status: int, after: float) -> float | None:
        """When an answer other than ``status`` was last seen after ``after``."""
        others = [t for t, s in self.samples if t >= after and s != status]
        return others[-1] if others else None

    def wait_for(self, status: int, after: float, limit: float) -> float:
        deadline = time.monotonic() + limit
        while time.monotonic() < deadline:
            seen = self.first(status, after)
            if seen is not None:
                return seen
            time.sleep(0.1)
        raise CheckFailed(f"{self.url} did not answer {status} within {limit:g}s")

    def wait_until_steady(self, status: int, after: float, quiet: float, limit: float) -> float:
        """Wait until every answer has been ``status`` for ``quiet`` seconds.

        Returns when an answer last differed from it (``after`` if none did).
        """
        deadline = time.monotonic() + limit
        while time.monotonic() < deadline:
            last = self.last_other(status, after) or after
            if self.samples and self.samples[-1][0] - last >= quiet:
                return last
            time.sleep(0.1)
        raise CheckFailed(f"{self.url} did not settle on {status} within {limit:g}s")


class Driver:
    def __init__(self, args: argparse.Namespace) -> None:
        self.args = args
        self.mcp_url = f"{args.gateway}/mcp/delivery"
        self.remediation_url = f"{args.gateway}/a2a/remediation-agent"
        self.comms_url = f"{args.gateway}/a2a/comms-agent"
        self.chat_url = f"{args.gateway}/a2a/chat-assistant"
        self.search_url = f"{args.web}/api/search?q=red"
        self.watch = SearchWatch(self.search_url)
        self._tokens: dict[str, str] = {}
        self._sessions: dict[str, dict[str, str]] = {}
        self.timings: dict[str, float] = {}

    # -- identity ----------------------------------------------------------

    def token(self, identity: str) -> str:
        if identity not in self._tokens:
            self._tokens[identity] = run(
                str(REPO / "local/identity/token.sh"), identity, timeout=30
            ).strip()
        return self._tokens[identity]

    # -- delivery-mcp over MCP, through the gateway --------------------------

    def _mcp_headers(self, identity: str) -> dict[str, str]:
        """Headers for ``identity``'s MCP requests; initializes once per identity."""
        if identity not in self._sessions:
            base = {
                "Authorization": f"Bearer {self.token(identity)}",
                "Accept": "application/json, text/event-stream",
            }
            opened = post(
                self.mcp_url,
                {
                    "jsonrpc": "2.0",
                    "id": 0,
                    "method": "initialize",
                    "params": {
                        "protocolVersion": MCP_PROTOCOL,
                        "capabilities": {},
                        "clientInfo": {"name": "demo-drive", "version": "1"},
                    },
                },
                base,
            )
            if opened.status != 200:
                raise CheckFailed(f"MCP initialize as {identity}: {opened.describe()}")
            headers = {**base, "MCP-Protocol-Version": MCP_PROTOCOL}
            # The route is stateless and gives no session id; a stateful one would.
            session_id = opened.headers.get("Mcp-Session-Id")
            if session_id:
                headers["Mcp-Session-Id"] = session_id
            self._sessions[identity] = headers
            post(self.mcp_url, {"jsonrpc": "2.0", "method": "notifications/initialized"}, headers)
        return self._sessions[identity]

    def tools(self, identity: str) -> list[str]:
        answer = post(
            self.mcp_url, {"jsonrpc": "2.0", "id": 1, "method": "tools/list"}, self._mcp_headers(identity)
        )
        if answer.status != 200:
            raise CheckFailed(f"tools/list as {identity}: {answer.describe()}")
        return sorted(tool["name"] for tool in answer.json()["result"]["tools"])

    def call(self, identity: str, tool: str, **arguments: Any) -> Http:
        """tools/call as ``identity``; the whole HTTP answer."""
        return post(
            self.mcp_url,
            {
                "jsonrpc": "2.0",
                "id": uuid.uuid4().hex,
                "method": "tools/call",
                "params": {"name": tool, "arguments": arguments},
            },
            self._mcp_headers(identity),
        )

    def tool(self, identity: str, tool: str, **arguments: Any) -> tuple[bool, dict[str, Any]]:
        """Call a tool that must reach the service. Returns (isError, the service's object)."""
        answer = self.call(identity, tool, **arguments)
        if answer.status != 200 or "result" not in answer.json():
            raise CheckFailed(f"{tool} as {identity} did not reach delivery-mcp: {answer.describe()}")
        result = answer.json()["result"]
        return bool(result.get("isError")), result["structuredContent"]

    def refused_by_service(self, identity: str, tool: str, rule: str, **arguments: Any) -> None:
        answer = self.call(identity, tool, **arguments)
        print(f"      client sees: {answer.describe()}")
        check(answer.status == 200, "HTTP 200: the call reached delivery-mcp")
        result = answer.json().get("result") or {}
        data = result.get("structuredContent") or {}
        check(result.get("isError") is True and set(data) == FOUR_KEYS,
              "a tool result with isError and the four keys")  # fmt: skip
        check(
            (data["error"], data["layer"], data["rule"]) == ("forbidden", "service", rule),
            f"refused by the service, rule {rule}",
        )

    # -- agents over A2A, through the gateway --------------------------------

    def a2a_body(self, method: str, request: dict[str, Any]) -> dict[str, Any]:
        return {
            "jsonrpc": "2.0",
            "id": uuid.uuid4().hex,
            "method": method,
            "params": {
                "message": {
                    "kind": "message",
                    "role": "user",
                    "messageId": uuid.uuid4().hex,
                    "parts": [{"kind": "data", "data": request}],
                }
            },
        }

    def a2a_stream(
        self, url: str, identity: str, request: dict[str, Any], limit: float
    ) -> list[tuple[float, dict[str, Any]]]:
        """``message/stream``: every event with the moment it arrived."""
        http_request = urllib.request.Request(
            url,
            data=json.dumps(self.a2a_body("message/stream", request)).encode(),
            headers={
                "Content-Type": "application/json",
                "Accept": "text/event-stream",
                "Authorization": f"Bearer {self.token(identity)}",
            },
        )
        events: list[tuple[float, dict[str, Any]]] = []
        started = time.monotonic()
        try:
            with urllib.request.urlopen(http_request, timeout=limit) as response:
                for raw in response:
                    line = raw.decode().rstrip("\r\n")
                    if not line.startswith("data:"):
                        continue
                    payload = json.loads(line[5:])
                    if "error" in payload:
                        raise CheckFailed(f"A2A error from {url}: {payload['error']}")
                    event = payload["result"]
                    events.append((time.monotonic(), event))
                    self._show(event, events[-1][0] - started)
        except urllib.error.HTTPError as error:
            raise CheckFailed(
                f"{url} answered HTTP {error.code}: {error.read().decode().strip()[:200]}"
            ) from error
        except TimeoutError as error:
            raise CheckFailed(f"{url} sent nothing for {limit:g}s; the stream hung") from error
        return events

    @staticmethod
    def _show(event: dict[str, Any], at: float) -> None:
        if event["kind"] == "task":
            print(f"      +{at:5.1f}s  task {event['id'][:8]} {event['status']['state']}")
        elif event["kind"] == "status-update":
            parts = (event["status"].get("message") or {}).get("parts", [])
            text = next((p["text"] for p in parts if p["kind"] == "text"), "")
            final = " (final)" if event.get("final") else ""
            print(f"      +{at:5.1f}s  status {event['status']['state']}{final}: {text[:160]}")
        elif event["kind"] == "artifact-update":
            print(f"      +{at:5.1f}s  artifact {event['artifact'].get('name')}")

    @staticmethod
    def result_of(events: list[tuple[float, dict[str, Any]]]) -> tuple[str, dict[str, Any], str]:
        """(text, data, final state) of a finished stream."""
        artifacts = [e for _, e in events if e["kind"] == "artifact-update"]
        if len(artifacts) != 1:
            raise CheckFailed(f"expected one result artifact, got {len(artifacts)}")
        parts = artifacts[0]["artifact"]["parts"]
        text = next(p["text"] for p in parts if p["kind"] == "text")
        data = next(p["data"] for p in parts if p["kind"] == "data")
        return text, data, events[-1][1]["status"]["state"]

    # -- chat-assistant's incident card, through the gateway ----------------

    def card(self, identity: str) -> dict[str, str]:
        """The card as chat-assistant shows it to ``identity``: component id -> its text.

        This is the request the Chat UI repeats every two seconds. Empty when
        there is no incident to show.
        """
        answer = post(
            self.chat_url,
            {
                "jsonrpc": "2.0",
                "id": uuid.uuid4().hex,
                "method": "SendMessage",
                "params": {
                    "message": {
                        "messageId": uuid.uuid4().hex,
                        "role": "ROLE_USER",
                        "parts": [{"data": {"request": "sync"}, "mediaType": SYNC_MIME}],
                    }
                },
            },
            {
                "Authorization": f"Bearer {self.token(identity)}",
                "A2A-Version": "1.0",
                "A2A-Extensions": A2UI_EXTENSION,
            },
        )
        if answer.status != 200 or "result" not in answer.json():
            raise CheckFailed(f"chat-assistant's card for {identity}: {answer.describe()}")
        texts: dict[str, str] = {}
        for part in answer.json()["result"]["message"]["parts"]:
            if part.get("mediaType") != A2UI_MIME:
                continue
            for message in part["data"]:
                for component in (message.get("updateComponents") or {}).get("components", []):
                    if isinstance(component.get("text"), str):
                        texts[component["id"]] = component["text"]
        return texts

    # -- the alert ---------------------------------------------------------

    def firing_alerts(self) -> list[dict[str, Any]]:
        """The search alerts Alertmanager holds as firing now."""
        alerts = json.loads(
            kubectl(
                "--namespace", "telemetry", "exec", ALERTMANAGER_POD, "--container", "alertmanager",
                "--", "wget", "-qO-", "http://localhost:9093/api/v2/alerts?active=true",
            )
        )  # fmt: skip
        return [alert for alert in alerts if alert["labels"].get("alertname") == ALERT_NAME]

    def wait_for_incident(self, limit: float) -> dict[str, Any]:
        """The unresolved incident on search-service, once someone has opened it."""
        deadline = time.monotonic() + limit
        while time.monotonic() < deadline:
            _, listed = self.tool("developer", "list_incidents")
            for incident in listed["incidents"]:
                if incident["service"] == "search-service" and incident["status"] != "resolved":
                    return self.tool("developer", "get_incident", incident_id=incident["incident_id"])[1]
            # Once a second: each look is a traced request through the gateway.
            time.sleep(1)
        raise CheckFailed(
            f"no incident was opened within {limit:g}s of the release. Is the alert reaching the"
            " hook (task observability:status)? `task demo:alert` delivers it by hand."
        )

    # -- the cluster -------------------------------------------------------

    def selected_version(self) -> str:
        values = json.loads(
            helm("get", "values", "sample-app", "--namespace", "sample-app", "--all", "--output", "json")
        )
        return str(values["searchService"]["image"]["tag"])

    def last_revision(self) -> dict[str, Any]:
        history = json.loads(
            helm("history", "sample-app", "--namespace", "sample-app", "--max", "1", "--output", "json")
        )
        return history[-1]

    def running_image(self) -> str:
        return kubectl(
            "--namespace", "sample-app", "get", "deployment", "search-service",
            "--output", "jsonpath={.spec.template.spec.containers[0].image}",
        ).strip()  # fmt: skip

    def selection_file_tag(self) -> str:
        lines = SELECTION.read_text().splitlines()
        return next(line.split(":", 1)[1].strip() for line in lines if line.strip().startswith("tag:"))

    # -- the incident ------------------------------------------------------

    def drive(self) -> None:
        a = self.args
        print(f"Gateway {a.gateway}   Sample App {a.web}")

        step(0, "start", "a clean state")
        check(self.selected_version() == "2.0.0", "release sample-app selects search-service 2.0.0")
        check(self.watch.once() == 200, f"{self.search_url} answers 200")
        is_error, listed = self.tool("developer", "list_incidents")
        unresolved = [i["incident_id"] for i in listed["incidents"] if i["status"] != "resolved"]
        check(not is_error and not unresolved, "no unresolved incident (else: task demo:reset)")
        if a.alert == "real":
            check(not self.firing_alerts(), f"no {ALERT_NAME} alert is firing (else: task demo:reset)")
        self.watch.start()

        step(1, "release", "ships search-service 2.1.0 (demo/scenarios/break.sh)")
        broke_at = time.monotonic()
        broke_wall = time.time()
        print("      " + run(str(REPO / "demo/scenarios/break.sh")).strip().replace("\n", "\n      "))
        first_failure = self.watch.wait_for(500, broke_at, 60)
        last_success = self.watch.wait_until_steady(500, broke_at, quiet=3, limit=60)
        self.timings["break_to_first_failure"] = first_failure - broke_at
        self.timings["break_to_last_success"] = last_success - broke_at
        check(self.watch.once() == 500, f"{self.search_url} answers 500")
        check(self.selected_version() == "2.1.0", "the release selects 2.1.0")
        check(self.selection_file_tag() == "2.0.0", "the selection file still says 2.0.0")
        print(
            f"      after the release started, the first search failed at"
            f" {self.timings['break_to_first_failure']:.1f}s and the last one succeeded at"
            f" {self.timings['break_to_last_success']:.1f}s"
        )

        if a.alert == "direct":
            step(2, "alert-automation", "opens an incident on search-service (delivery-mcp, directly)")
            print(f"      sees tools: {self.tools('alert-automation')}")
            is_error, incident = self.tool(
                "alert-automation",
                "open_incident",
                service="search-service",
                severity="sev2",
                summary="Every search on the Sample App returns an error",
                impact="Users cannot search the catalogue; registration is unaffected",
            )
            check(not is_error, f"incident opened: {incident.get('incident_id')}")
            incident_id = incident["incident_id"]
            step(3, "alert-automation", "records a diagnosis (delivery-mcp, directly)")
            is_error, incident = self.tool(
                "alert-automation",
                "record_diagnosis",
                incident_id=incident_id,
                suspected_cause="search-service 2.1.0 fails on every query; 2.0.0 did not",
                evidence=["HTTP 500 on GET /search since the 2.1.0 rollout", "no errors before it"],
                recommended_version="2.0.0",
            )
            check(
                not is_error and incident["diagnosis"]["recommended_version"] == "2.0.0",
                "diagnosis recorded, recommending 2.0.0",
            )
        else:
            if a.alert == "manual":
                step(2, "alert-automation", "posts the alert to the hook by hand (demo/scenarios/alert.sh)")
                print("      " + run(str(REPO / "demo/scenarios/alert.sh")).strip().replace("\n", "\n      "))
            else:
                step(2, "Alertmanager", "posts the firing alert to the hook; chat-assistant opens the incident")
            incident = self.wait_for_incident(a.alert_limit)
            incident_id = incident["incident_id"]
            opened_at = datetime.datetime.fromisoformat(incident["opened_at"].replace("Z", "+00:00"))
            self.timings["break_to_hook"] = opened_at.timestamp() - broke_wall
            print(f"      {incident_id}: {incident['summary']}")
            check(
                incident["opened_by"] == "service-account-alert-automation",
                f"opened by the alert's own identity: {incident['opened_by']}",
            )
            card = self.card("developer")
            while not card.get("title") and time.monotonic() - broke_at < a.alert_limit:
                time.sleep(0.5)
                card = self.card("developer")
            self.timings["break_to_card"] = time.monotonic() - broke_at
            check(card.get("fact-incident-value") == incident_id, "its card is there for a developer")
            print(
                f"      the hook opened it {self.timings['break_to_hook']:.1f}s after the release started;"
                f" the card was there at {self.timings['break_to_card']:.1f}s"
            )
            print(f'      the card says: "{card.get("cause", "")}"')

            step(3, "diagnosis-agent", "investigates; the card fills in")
            deadline = time.monotonic() + a.diagnosis_limit
            while time.monotonic() < deadline:
                # The card, as the Chat UI polls it; the record only once the card shows a cause.
                card = self.card("developer")
                cause = card.get("cause", "")
                if cause.startswith("Diagnosis failed"):
                    raise CheckFailed(f'the card says: "{cause}"')
                if cause and not cause.startswith(("Diagnosing", "No diagnosis")):
                    _, incident = self.tool("developer", "get_incident", incident_id=incident_id)
                    diagnosis = incident.get("diagnosis")
                    if diagnosis and cause == diagnosis["suspected_cause"]:
                        break
                time.sleep(1)
            else:
                raise CheckFailed(
                    f"no diagnosis was on the card within {a.diagnosis_limit:g}s; it says:"
                    f' "{card.get("cause", "")}". `task demo:alert` records one by hand.'
                )
            self.timings["break_to_diagnosis"] = time.monotonic() - broke_at
            recorded_at = datetime.datetime.fromisoformat(diagnosis["recorded_at"].replace("Z", "+00:00"))
            self.timings["diagnosis"] = (recorded_at - opened_at).total_seconds()
            print(f'      cause: "{diagnosis["suspected_cause"]}"')
            for line in diagnosis["evidence"]:
                print(f"      evidence: {line[:220]}")
            check(diagnosis["recommended_version"] == "2.0.0", "it recommends 2.0.0")
            check(len(diagnosis["evidence"]) >= 2, f"with {len(diagnosis['evidence'])} pieces of evidence")
            check(
                card.get("change", "").endswith("roll back search-service to 2.0.0."),
                f'the card shows the recommendation: "{card.get("change")}"',
            )
            print(
                f"      the diagnosis was on the card {self.timings['break_to_diagnosis']:.1f}s after the"
                f" release started; it took {self.timings['diagnosis']:.1f}s from the alert"
            )

        step(4, "developer", "proposes returning search-service to 2.0.0")
        developer_tools = self.tools("developer")
        print(f"      sees tools: {developer_tools}")
        is_error, change = self.tool(
            "developer", "propose_change", incident_id=incident_id, target_version="2.0.0"
        )
        check(not is_error and change.get("status") == "proposed", f"proposed: {change.get('change_id')}")
        change_id = change["change_id"]
        check(
            (change["proposed_by"], change["previous_version"]) == ("developer", "2.1.0"),
            "proposed_by is the developer, from the token; the change is from 2.1.0",
        )

        step(5, "developer", "calls apply_change: the gateway must refuse")
        check("apply_change" not in developer_tools, "apply_change is not in the developer's tools/list")
        refusal = self.call("developer", "apply_change", change_id=change_id)
        print(f"      client sees: {refusal.describe()}")
        error = refusal.json().get("error") if refusal.body.strip().startswith("{") else None
        check(refusal.status == 400, "HTTP 400 from the gateway")
        check(
            isinstance(error, dict) and error.get("code") == -32602,
            "a JSON-RPC error, code -32602, not a tool result",
        )
        check(error["message"] == "Unknown tool: apply_change", f"message: {error['message']}")
        _, incident = self.tool("developer", "get_incident", incident_id=incident_id)
        check(incident["changes"][0]["status"] == "proposed", "the change is untouched: proposed")

        step(6, "platform-engineer", "calls apply_change before anyone approved it")
        print(f"      sees tools: {self.tools('platform-engineer')}")
        self.refused_by_service(
            "platform-engineer", "apply_change", "change_is_approved", change_id=change_id
        )

        step(7, "developer-other-team", "proposes a change to a service their team does not own")
        self.refused_by_service(
            "developer-other-team",
            "propose_change",
            "team_owns_service",
            incident_id=incident_id,
            target_version="2.0.0",
        )

        step(8, "incident-manager", "approves the developer's change")
        print(f"      sees tools: {self.tools('incident-manager')}")
        is_error, change = self.tool("incident-manager", "approve_change", change_id=change_id)
        check(not is_error and change.get("status") == "approved", "approved")
        check(change["approved_by"] == "incident-manager", "approved_by is the incident manager")

        step(9, "platform-engineer", "applies it through remediation-agent (A2A, streamed)")
        denied = post(
            self.remediation_url,
            self.a2a_body("message/send", {"action": "apply_and_verify", "change_id": change_id}),
            {"Authorization": f"Bearer {self.token('developer')}"},
        )
        print(f"      a developer calling the agent sees: {denied.describe()}")
        check(denied.status == 403, "the gateway refuses the developer on the agent's route: HTTP 403")

        applied_at = time.monotonic()
        events = self.a2a_stream(
            self.remediation_url,
            "platform-engineer",
            {"action": "apply_and_verify", "change_id": change_id},
            limit=a.apply_limit,
        )
        finished_at = events[-1][0]
        text, data, state = self.result_of(events)
        stages = [
            (at, part["data"]["status"])
            for at, event in events
            if event["kind"] == "status-update" and event["status"]["state"] == "working"
            for part in event["status"]["message"]["parts"]
            if part["kind"] == "data"
        ]
        check(
            [name for _, name in stages] == ["applying", "verifying", "applied"],
            f"streamed stages: {[name for _, name in stages]}",
        )
        check(
            stages[-1][0] - stages[0][0] > 0.5,
            "the stages arrived one at a time, not in one piece at the end",
        )
        check(state == "completed" and data["outcome"] == "applied", "task completed, change applied")
        applied = data["change"]
        check(
            (applied["proposed_by"], applied["approved_by"], applied["applied_by"])
            == ("developer", "incident-manager", "platform-engineer"),
            "three people: proposed, approved and applied by different callers",
        )
        check("status 200" in (applied["detail"] or ""), f"verified by the service: {applied['detail']}")
        wording = finished_at - stages[-1][0]
        # delivery-mcp resolves the incident in the same step that marks the change applied.
        self.timings["apply_to_resolved"] = stages[-1][0] - applied_at
        self.timings["apply_request_to_agent_result"] = finished_at - applied_at
        self.timings["result_wording"] = wording
        print(f'      result, worded by the {data["phrased_by"]} in {wording:.1f}s: "{text}"')
        check(data["phrased_by"] in self.allowed({"up": "model", "down": "template"}),
              f"worded by: {data['phrased_by']}")  # fmt: skip
        check(wording < a.wording_limit, f"the wording took under {a.wording_limit:g}s")

        step(10, "cluster", "the Helm release is back at 2.0.0 and the search has recovered")
        recovered = self.watch.wait_for(200, applied_at, 120)
        last_failure = self.watch.wait_until_steady(200, applied_at, quiet=3, limit=120)
        self.timings["apply_to_first_success"] = recovered - applied_at
        self.timings["apply_to_last_failure"] = last_failure - applied_at
        check(self.watch.once() == 200, f"{self.search_url} answers 200")
        check(self.selected_version() == "2.0.0", "the release selects 2.0.0")
        revision = self.last_revision()
        print(f"      revision {revision['revision']}: {revision['description']}")
        check(
            applied["operation_id"] in revision["description"],
            "the latest revision of the release carries the change's operation id",
        )
        check(self.running_image().endswith("/search-service:2.0.0"), f"image: {self.running_image()}")
        is_error, again = self.tool("platform-engineer", "apply_change", change_id=change_id)
        check(
            not is_error and again["replayed"] and again["operation_id"] == applied["operation_id"],
            "apply_change again is a replay of the same operation",
        )
        print(
            f"      after the apply was requested, the first search succeeded at"
            f" {self.timings['apply_to_first_success']:.1f}s and the last one failed at"
            f" {self.timings['apply_to_last_failure']:.1f}s"
        )

        _, incident = self.tool("developer", "get_incident", incident_id=incident_id)
        check(incident["status"] == "resolved", "the incident is resolved")
        if a.alert != "direct":
            card = self.card("incident-manager")
            check(
                (card.get("fact-status-value"), card.get("fact-version-value")) == ("resolved", "2.0.0"),
                "an incident-manager's card says resolved, running 2.0.0",
            )
        if a.alert == "real":
            while self.firing_alerts() and time.monotonic() - applied_at < 120:
                time.sleep(1)
            self.timings["apply_to_alert_resolved"] = time.monotonic() - applied_at
            check(not self.firing_alerts(), f"the {ALERT_NAME} alert is no longer firing")
        print(
            f"      the incident was resolved {self.timings['apply_to_resolved']:.1f}s after the apply was requested"
            + (
                f", the alert by {self.timings['apply_to_alert_resolved']:.1f}s"
                if "apply_to_alert_resolved" in self.timings
                else ""
            )
        )

        step(11, "incident-manager", "asks comms-agent for a status draft (A2A)")
        asked_at = time.monotonic()
        answer = post(
            self.comms_url,
            self.a2a_body("message/send", {"action": "draft_status_update", "incident_id": incident_id}),
            {"Authorization": f"Bearer {self.token('incident-manager')}"},
            timeout=a.draft_limit,
        )
        took = time.monotonic() - asked_at
        self.timings["draft"] = took
        if answer.status != 200 or "result" not in answer.json():
            raise CheckFailed(f"comms-agent: {answer.describe()}")
        task = answer.json()["result"]
        parts = task["artifacts"][0]["parts"]
        text = next(p["text"] for p in parts if p["kind"] == "text")
        data = next(p["data"] for p in parts if p["kind"] == "data")
        check(took < a.draft_limit, f"answered in {took:.1f}s, under {a.draft_limit:g}s")
        check(data["outcome"] in self.allowed({"up": "drafted", "down": "error"}),
              f"outcome: {data['outcome']}")  # fmt: skip
        if data["outcome"] == "drafted":
            print(f'      draft ({data["word_count"]} words, {took:.1f}s): "{text}"')
            check(task["status"]["state"] == "completed", "task completed with a draft")
            check(0 < len(text.split()) <= 80, "at most 80 words")
        else:
            print(f'      no draft, said in {took:.1f}s: "{text}"')
            check(task["status"]["state"] == "failed", "task failed, and says so")
            check("No draft was written" in text and data["draft"] is None, "it says no draft was written, and why")
        check(data["posted"] is False, "the agent says it did not post")

        is_error, incident = self.tool("developer", "get_incident", incident_id=incident_id)
        check(not is_error and incident["status"] == "resolved", "the incident is resolved")
        check(incident["status_updates"] == [], "and no status update was posted by anyone")

    def allowed(self, by_state: dict[str, str]) -> set[str]:
        expected = self.args.expect_model
        return set(by_state.values()) if expected == "either" else {by_state[expected]}

    def summary(self) -> None:
        t = self.timings
        print("\nTimings")
        rows = (
            ("break_to_first_failure", "release started -> first failed search"),
            ("break_to_last_success", "release started -> last successful search"),
            ("break_to_hook", "release started -> alert at the hook"),
            ("break_to_card", "release started -> incident card visible"),
            ("break_to_diagnosis", "release started -> diagnosis on the card"),
            ("diagnosis", "of which the diagnosis itself"),
            ("apply_to_resolved", "apply requested -> incident resolved"),
            ("apply_to_alert_resolved", "apply requested -> alert no longer firing"),
            ("apply_to_first_success", "apply requested -> first successful search"),
            ("apply_to_last_failure", "apply requested -> last failed search"),
            ("apply_request_to_agent_result", "apply requested -> remediation-agent's result"),
            ("result_wording", "of which wording the result"),
            ("draft", "comms-agent's answer"),
        )
        for key, label in rows:
            if key in t:
                print(f"  {label:<48} {t[key]:6.1f}s")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.split("\n", 1)[0])
    parser.add_argument("--gateway", default="http://localhost:18080", help="Agentgateway, from this machine")
    parser.add_argument("--web", default="http://localhost:18082", help="the Sample App's web")
    parser.add_argument(
        "--expect-model",
        choices=["either", "up", "down"],
        default="either",
        help="insist that the model answered (up) or that the agents coped without it (down)",
    )
    parser.add_argument(
        "--alert",
        choices=["real", "manual", "direct"],
        default="real",
        help="who opens the incident: Alertmanager (real), demo/scenarios/alert.sh (manual),"
        " or this script with delivery-mcp's tools and no chat-assistant (direct)",
    )
    parser.add_argument("--alert-limit", type=float, default=90,
                        help="seconds from the release until the incident must exist")  # fmt: skip
    parser.add_argument("--diagnosis-limit", type=float, default=75,
                        help="seconds the diagnosis may take to reach the card")  # fmt: skip
    parser.add_argument("--apply-limit", type=float, default=240, help="seconds the apply may take")
    parser.add_argument("--wording-limit", type=float, default=15,
                        help="seconds remediation-agent may spend wording a verified result")  # fmt: skip
    parser.add_argument("--draft-limit", type=float, default=30,
                        help="seconds comms-agent may take to draft, or to say it cannot")  # fmt: skip
    driver = Driver(parser.parse_args())
    try:
        driver.drive()
    except CheckFailed as failure:
        print(f"\nFAILED: {failure}", file=sys.stderr)
        return 1
    finally:
        driver.watch.stop()
        driver.summary()
    print("\nAll checks passed.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
