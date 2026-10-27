#!/usr/bin/env python3
"""Follow one request through every place that records it: Apply on the card.

A platform engineer, signed in to the Chat UI, presses Apply. The request goes
from the browser's token to chat-assistant, which exchanges it at chain-sts
and calls remediation-agent, which exchanges that token again and calls
delivery-mcp's apply_change, all through Agentgateway. The drill then shows
what each place wrote about that one request, side by side:

    chain-sts       its audit lines: the tokens it issued, each with its jti
                    and chain
    Agentgateway    its access log lines for the request's trace: user.id,
                    actor.chain on every hop
    delivery-mcp    its audit lines, and the change it keeps: applied_via
    a token         one chain-sts issued for the same user and chain, made by
                    this drill and decoded: its `act` (the agents' own tokens
                    are written down nowhere, by design)

The steps before it make the incident the Apply button needs, each through the
same card as the Chat UI uses it, with Chat UI sign-ins:

    1  release            ships search-service 2.1.0 (demo/scenarios/break.sh)
    2  Alertmanager       posts the alert; chat-assistant opens the incident,
                          diagnosis-agent fills it in
    3  developer          Propose on the card              chat-assistant -> delivery-mcp
    4  incident-manager   Approve on the card              chat-assistant -> delivery-mcp
    5  platform-engineer  Apply on the card                chat-assistant -> remediation-agent
                                                           -> delivery-mcp
    6                     the evidence for step 5

Start from `task demo:reset`. `task demo:chain` runs this and then
`task demo:reset`, which puts the demo back. No token is printed: a token's
payload is, never the token. Python 3.10+, kubectl and the repository's
token.sh; the helpers are demo/scenarios/drive.py's.
"""

from __future__ import annotations

import argparse
import base64
import datetime
import json
import pathlib
import re
import subprocess
import sys
import time
import uuid
from typing import Any

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
from drive import (
    A2UI_EXTENSION,
    CONTEXT,
    KUBECONFIG,
    REPO,
    CheckFailed,
    Driver,
    check,
    kubectl,
    post,
    run,
    step,
)

A2UI_MIME = "application/a2ui+json"
A2UI_VERSION = "v0.9.1"
STS_URL = "http://chain-sts.chain-sts.svc.cluster.local"
POD_PROBE = REPO / "agent-platform/tests/pod_probe.py"


def utc(text: str) -> datetime.datetime:
    """A time as chain-sts, the gateway or delivery-mcp writes it."""
    text = text.strip().replace(",", ".").replace(" ", "T")
    if not text.endswith("Z") and "+" not in text[10:]:
        text += "Z"
    return datetime.datetime.fromisoformat(text.replace("Z", "+00:00"))


def claims(token: str) -> dict[str, Any]:
    payload = token.split(".")[1]
    return json.loads(base64.urlsafe_b64decode(payload + "=" * (-len(payload) % 4)))


def chain_of(payload: dict[str, Any]) -> list[str]:
    names, act = [], payload.get("act")
    while isinstance(act, dict):
        names.append(act.get("client_id", "?"))
        act = act.get("act")
    return names


class ChainDrill(Driver):
    def ui_token(self, user: str) -> str:
        """A Chat UI sign-in, as the browser gets it (audience chat-assistant). Fresh every time."""
        return run(str(REPO / "local/identity/token.sh"), user, "--chat-ui", timeout=30).strip()

    def press(self, token: str, name: str, context: dict[str, str], headers: dict[str, str] | None = None) -> dict[str, Any]:
        """A button on the card: the A2UI action the Chat UI sends, as SendMessage; the finished task."""
        surface = "incident-" + re.sub(r"[^A-Za-z0-9_-]", "_", context["incident_id"])
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
                        "parts": [
                            {
                                "data": [{"version": A2UI_VERSION, "action": {
                                    "name": name, "surfaceId": surface, "sourceComponentId": f"{name}-button",
                                    "timestamp": datetime.datetime.now(datetime.timezone.utc).isoformat(), "context": context}}],
                                "mediaType": A2UI_MIME,
                            }
                        ],
                    },
                    "configuration": {"blocking": True},
                },
            },
            {"Authorization": f"Bearer {token}", "A2A-Version": "1.0", "A2A-Extensions": A2UI_EXTENSION, **(headers or {})},
            timeout=self.args.apply_limit,
        )
        if answer.status != 200 or "result" not in answer.json():
            raise CheckFailed(f"{name} on the card: {answer.describe()}")
        task = answer.json()["result"]["task"]
        text = "".join(p.get("text", "") for p in (task["status"].get("message") or {}).get("parts", []))
        print(f'      chat-assistant: {task["status"]["state"]}, "{text[:200]}"')
        return task

    def exchange(self, subject: str, agent: str) -> str:
        """The subject exchanged at chain-sts with ``agent``'s own token, from inside remediation-agent's pod."""
        actor = kubectl("--namespace", "agents", "create", "token", agent, "--audience", "chain-sts", "--duration", "10m").strip()
        fields = {
            "grant_type": "urn:ietf:params:oauth:grant-type:token-exchange",
            "subject_token": subject, "subject_token_type": "urn:ietf:params:oauth:token-type:jwt",
            "actor_token": actor, "actor_token_type": "urn:ietf:params:oauth:token-type:jwt",
            "audience": "agentgateway",
        }  # fmt: skip
        done = subprocess.run(
            ["kubectl", "--kubeconfig", str(KUBECONFIG), "--context", CONTEXT,
             "--namespace", "agents", "exec", "--stdin", "deployment/remediation-agent", "--",
             "python", "-c", POD_PROBE.read_text(), "form", f"{STS_URL}/token"],
            input=json.dumps(fields), capture_output=True, text=True, timeout=60, check=False,
        )  # fmt: skip
        answer = json.loads(done.stdout or "{}")
        token = (answer.get("body") or {}).get("access_token")
        if not token:
            body = answer.get("body") or {}
            raise CheckFailed(f"chain-sts did not issue for {agent}: {answer.get('status')} {body.get('error')} {body.get('error_description')}")
        return token

    # -- the records -----------------------------------------------------------

    def sts_audit(self, since: datetime.datetime) -> list[dict[str, Any]]:
        lines = kubectl(
            "--namespace", "chain-sts", "logs", "--selector",
            "app.kubernetes.io/name=chain-sts,app.kubernetes.io/instance=chain-sts", "--since=15m", "--tail=-1",
        ).splitlines()  # fmt: skip
        records = []
        for raw in lines:
            if '"chain_sts.audit"' not in raw:
                continue
            record = json.loads(raw)
            if utc(record["time"]) >= since:
                records.append(record)
        return sorted(records, key=lambda r: r["time"])

    def gateway_log(self, trace_id: str) -> list[dict[str, str]]:
        lines = kubectl("--namespace", "agentgateway-system", "logs", "deployment/agentgateway-proxy", "--since=15m").splitlines()
        records = []
        for raw in lines:
            if f"trace.id={trace_id}" not in raw:
                continue
            fields = dict(re.findall(r'([\w.]+)=("[^"]*"|\S+)', raw))
            fields = {key: value.strip('"') for key, value in fields.items()}
            fields["time"] = raw.split()[0]
            records.append(fields)
        return records

    def delivery_audit(self, since: datetime.datetime, until: datetime.datetime) -> list[tuple[str, dict[str, Any]]]:
        lines = kubectl("--namespace", "tools", "logs", "deployment/delivery-mcp", "--since=15m").splitlines()
        records = []
        for raw in lines:
            if " delivery.audit " not in raw:
                continue
            stamp = raw[:23]
            if since <= utc(stamp) <= until:
                records.append((stamp, json.loads(raw.split(" delivery.audit ", 1)[1])))
        return records

    # -- the drill -------------------------------------------------------------

    def drill(self) -> None:
        a = self.args
        print(f"Gateway {a.gateway}")

        step(0, "start", "a clean state")
        check(self.selected_version() == "2.0.0", "release sample-app selects search-service 2.0.0")
        _, listed = self.tool("developer", "list_incidents")
        check(not [i for i in listed["incidents"] if i["status"] != "resolved"], "no unresolved incident (else: task demo:reset)")

        step(1, "release", "ships search-service 2.1.0 (demo/scenarios/break.sh)")
        print("      " + run(str(REPO / "demo/scenarios/break.sh")).strip().replace("\n", "\n      "))

        if a.alert == "manual":
            step(2, "alert-automation", "posts the alert to the hook by hand (demo/scenarios/alert.sh)")
            print("      " + run(str(REPO / "demo/scenarios/alert.sh")).strip().replace("\n", "\n      "))
        else:
            step(2, "Alertmanager", "posts the alert; chat-assistant opens the incident; diagnosis-agent fills it in")
        incident = self.wait_for_incident(a.alert_limit)
        incident_id = incident["incident_id"]
        print(f"      {incident_id}, opened by {incident['opened_by']} via {incident.get('opened_via')}")
        deadline = time.monotonic() + a.diagnosis_limit
        while not incident.get("diagnosis") and time.monotonic() < deadline:
            time.sleep(1)
            incident = self.tool("developer", "get_incident", incident_id=incident_id)[1]
        check(bool(incident.get("diagnosis")), f"diagnosis recorded, via {incident.get('diagnosis', {}).get('recorded_via')}")

        step(3, "developer", "presses Propose on the card (Chat UI sign-in)")
        task = self.press(self.ui_token("developer"), "propose_rollback", {"incident_id": incident_id, "target_version": "2.0.0"})
        check(task["status"]["state"] == "TASK_STATE_COMPLETED", "proposed")
        change_id = self.tool("developer", "get_incident", incident_id=incident_id)[1]["changes"][0]["change_id"]

        step(4, "incident-manager", f"presses Approve on the card for {change_id}")
        task = self.press(self.ui_token("incident-manager"), "approve_change", {"incident_id": incident_id, "change_id": change_id})
        check(task["status"]["state"] == "TASK_STATE_COMPLETED", "approved")

        step(5, "platform-engineer", f"presses Apply on the card for {change_id}: the one request")
        trace_id = uuid.uuid4().hex
        token = self.ui_token("platform-engineer")
        print(f"      a Chat UI sign-in: aud {claims(token)['aud']}, no act; trace id {trace_id}")
        started = datetime.datetime.now(datetime.timezone.utc) - datetime.timedelta(seconds=1)
        task = self.press(token, "apply_change", {"incident_id": incident_id, "change_id": change_id},
                          {"traceparent": f"00-{trace_id}-{uuid.uuid4().hex[:16]}-01"})  # fmt: skip
        ended = datetime.datetime.now(datetime.timezone.utc) + datetime.timedelta(seconds=1)
        check(task["status"]["state"] == "TASK_STATE_COMPLETED", f"applied, in {(ended - started).total_seconds() - 2:.1f}s")

        step(6, "evidence", "what each place recorded of that one request")
        time.sleep(2)  # the last lines reach the logs
        audit = [r for r in self.sts_audit(started) if utc(r["time"]) <= ended and r.get("user") == "platform-engineer"]
        gateway = self.gateway_log(trace_id)
        delivery = self.delivery_audit(started, ended)
        rows: list[tuple[datetime.datetime, str, str]] = []
        for r in audit:
            rows.append((utc(r["time"]), "chain-sts", f'{r["outcome"]} jti {r.get("jti", "")[:8]}… chain {r.get("chain")} user {r.get("user")} aud {r.get("aud")}'))
        for g in gateway:
            what = g.get("gen_ai.tool.name") or g.get("mcp.method.name") or ""
            said = (f'{g.get("http.method")} {g.get("http.path")} {what} -> {g.get("http.status")}'
                    f'  user.id {g.get("user.id", "-")} actor.chain {g.get("actor.chain", "-")}')  # fmt: skip
            rows.append((utc(g["time"]), "gateway", said))
        for stamp, d in delivery:
            if d.get("user") == "platform-engineer":
                rows.append((utc(stamp), "delivery-mcp", f'{d["tool"]} {d.get("target", "")} {d["outcome"]} user {d["user"]} chain {d.get("chain")}'))
        # chat-assistant pushes the card every second while the apply runs, and
        # remediation-agent polls the incident: a line seen again is counted.
        seen: dict[tuple[str, str], list[Any]] = {}
        for at, source, text in sorted(rows):
            seen.setdefault((source, text), [at, at, 0])
            seen[(source, text)][1:] = [at, seen[(source, text)][2] + 1]
        print(f"      {'UTC':<12} {'source':<12} what it wrote (the gateway writes its line when the response ends)")
        for (source, text), (first, last, count) in sorted(seen.items(), key=lambda item: item[1][0]):
            again = f"  (x{count}, the last at {last.strftime('%H:%M:%S')})" if count > 1 else ""
            print(f"      {first.strftime('%H:%M:%S.%f')[:12]} {source:<12} {text}{again}")

        issued = [r for r in audit if r["outcome"] == "issued"]
        chains = [r.get("chain") for r in issued]
        check(["chat-assistant"] in chains and ["remediation-agent", "chat-assistant"] in chains,
              "chain-sts issued [chat-assistant] and then [remediation-agent, chat-assistant] for platform-engineer")  # fmt: skip
        hops = {(g.get("http.path", ""), g.get("gen_ai.tool.name", ""), g.get("actor.chain", "")) for g in gateway}
        check(any(p.startswith("/a2a/remediation-agent") and c == "chat-assistant" for p, _, c in hops),
              "the gateway saw /a2a/remediation-agent with actor.chain chat-assistant")  # fmt: skip
        check(("/mcp/delivery", "apply_change", "remediation-agent,chat-assistant") in hops,
              "the gateway saw apply_change with actor.chain remediation-agent,chat-assistant")  # fmt: skip
        check(any(d["tool"] == "apply_change" and d["chain"] == ["remediation-agent", "chat-assistant"] and d["outcome"] == "allowed"
                  for _, d in delivery), "delivery-mcp's audit line for apply_change names the same chain")  # fmt: skip

        change = self.tool("developer", "get_incident", incident_id=incident_id)[1]["changes"][0]
        print(f"      delivery-mcp's change {change_id}:")
        for who in ("proposed", "approved", "applied"):
            print(f"        {who}_by {change.get(f'{who}_by')!s:<18} {who}_via {change.get(f'{who}_via')}")
        check(change.get("applied_via") == ["remediation-agent", "chat-assistant"] and change.get("applied_by") == "platform-engineer",
              "applied by platform-engineer, applied_via [remediation-agent, chat-assistant]")  # fmt: skip

        made = self.exchange(self.exchange(self.ui_token("platform-engineer"), "chat-assistant"), "remediation-agent")
        payload = claims(made)
        print("      a token chain-sts issued for the same chain, made by this drill, its payload:")
        for line in json.dumps(payload, indent=2).splitlines():
            print(f"        {line}")
        check(chain_of(payload) == ["remediation-agent", "chat-assistant"], "its act: remediation-agent, inside it chat-assistant")
        time.sleep(1)
        own = [r for r in self.sts_audit(ended) if r.get("jti") == payload["jti"]]
        check(len(own) == 1, f"chain-sts's audit line for jti {payload['jti'][:8]}…: chain {own[0]['chain'] if own else None}")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.split("\n", 1)[0])
    parser.add_argument("--gateway", default="http://localhost:18080", help="Agentgateway, from this machine")
    parser.add_argument("--web", default="http://localhost:18082", help="the Sample App's web")
    parser.add_argument("--alert", choices=["real", "manual"], default="real",
                        help="who posts the alert: Alertmanager (real) or demo/scenarios/alert.sh (manual)")  # fmt: skip
    parser.add_argument("--alert-limit", type=float, default=90, help="seconds from the release until the incident must exist")
    parser.add_argument("--diagnosis-limit", type=float, default=90, help="seconds the diagnosis may take")
    parser.add_argument("--apply-limit", type=float, default=240, help="seconds the apply may take")
    drill = ChainDrill(parser.parse_args())
    try:
        drill.drill()
    except CheckFailed as failure:
        print(f"\nFAILED: {failure}", file=sys.stderr)
        return 1
    print("\nAll checks passed. `task demo:reset` puts the demo back (task demo:chain does).")
    return 0


if __name__ == "__main__":
    sys.exit(main())
