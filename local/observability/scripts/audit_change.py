#!/usr/bin/env python3
"""Who changed what, for one change, from the audit records in Loki alone.

    audit_change.py CHG-0001        the latest change with that id
    audit_change.py op-<uuid>       one operation, exactly
    audit_change.py CHG-0001 --hours 24

Run by `task audit:change -- <id>`. Change ids start again at CHG-0001 after
`task demo:reset`, while Loki keeps every run (7 days), so a change id finds
every operation that used it; the report shows the latest and names the
others. An operation id is unique.

What it puts together, each joined to the one before by an id the records
share rather than by time where it can:

    delivery-mcp     each state the change and its incident reached: who,
                     through which agents (operation.id, change.id)
    the gateway      the requests in those records' traces (trace_id)
    chain-sts        the exchanges that issued the tokens those requests
                     carried (token.jti)
    Kubernetes       the writes in the release's namespace while the
                     incident was open, by anyone: the release before it as
                     well as the rollback (by time and namespace: the API
                     server's records carry no trace)
    Keycloak         the sign-ins behind the callers' sessions (session.id)

Reads Loki through Grafana's data source proxy at http://localhost:18084, as
user admin, whose password it reads from the cluster. Standard library only.
Exits 1 when nothing is found.
"""

from __future__ import annotations

import argparse
import base64
import json
import os
import pathlib
import subprocess
import sys
import time
import urllib.parse
import urllib.request
from datetime import UTC, datetime

REPO = pathlib.Path(__file__).resolve().parents[3]
KUBECONFIG = REPO / "local/kind/kubeconfig"
CONTEXT = "kind-agentgateway-demo"
GRAFANA = os.environ.get("GRAFANA_URL", "http://localhost:18084")
NS = 1_000_000_000
# Requests that only open or describe an MCP session.
PROTOCOL = {"initialize", "notifications/initialized", "tools/list", "server/discover"}


def admin_password() -> str:
    out = subprocess.run(
        [
            "kubectl",
            "--kubeconfig",
            str(KUBECONFIG),
            "--context",
            CONTEXT,
            "--namespace",
            "telemetry",
            "get",
            "secret",
            "kube-prometheus-stack-grafana",
            "--output",
            "jsonpath={.data.admin-password}",
        ],
        check=True,
        capture_output=True,
        text=True,
    ).stdout
    return base64.b64decode(out).decode()


class Loki:
    def __init__(self, password: str) -> None:
        self.auth = "Basic " + base64.b64encode(f"admin:{password}".encode()).decode()

    def query(self, logql: str, start: int, end: int) -> list[tuple[int, dict]]:
        """(timestamp in ns, the record's labels and metadata), oldest first."""
        url = (
            f"{GRAFANA}/api/datasources/proxy/uid/loki/loki/api/v1/query_range?"
            + urllib.parse.urlencode(
                {
                    "query": logql,
                    "start": start,
                    "end": end,
                    "limit": 5000,
                    "direction": "forward",
                }
            )
        )
        request = urllib.request.Request(url, headers={"Authorization": self.auth})
        with urllib.request.urlopen(request, timeout=30) as response:
            body = json.load(response)
        rows = [
            (int(v[0]), s["stream"])
            for s in body["data"]["result"]
            for v in s["values"]
        ]
        return sorted(rows, key=lambda r: r[0])


def at(ns: int) -> str:
    return datetime.fromtimestamp(ns / NS, tz=UTC).strftime("%Y-%m-%d %H:%M:%S")


def either(values: set[str]) -> str:
    """A LogQL regex that matches any of these exact values."""
    return "|".join(sorted(v.replace(".", "\\\\.") for v in values))


def main() -> int:
    parser = argparse.ArgumentParser(description=(__doc__ or "").splitlines()[0])
    parser.add_argument("id", help="a change id (CHG-0001) or an operation id (op-...)")
    parser.add_argument(
        "--hours",
        type=int,
        default=168,
        help="how far back to look (default 168, Loki's retention)",
    )
    parser.add_argument(
        "--all",
        action="store_true",
        help="also list the MCP protocol's own requests (initialize, tools/list, ...)",
    )
    args = parser.parse_args()

    loki = Loki(admin_password())
    now = time.time_ns()
    since = now - args.hours * 3600 * NS
    field = "operation_id" if args.id.startswith("op-") else "change_id"
    found = loki.query(
        f'{{service_name="delivery-mcp"}} | {field}="{args.id}"', since, now
    )
    operations: list[str] = [
        s["operation_id"] for _, s in found if s.get("operation_id")
    ]
    if not operations:
        print(f"No audit record of {args.id} in the last {args.hours} hours.")
        return 1
    operation = operations[-1]
    others = sorted(set(operations) - {operation})

    change = [(ts, s) for ts, s in found if s.get("operation_id") == operation]
    first, last = change[0][0], change[-1][0]
    head = change[-1][1]
    incident, change_id = head.get("incident_id", "-"), head.get("change_id", "-")
    namespace = next(
        (s.get("helm_namespace") for _, s in change if s.get("helm_namespace")), None
    )
    service = next(
        (s.get("delivery_service") for _, s in change if s.get("delivery_service")), "-"
    )
    before = next(
        (
            s.get("change_previous_version")
            for _, s in change
            if s.get("change_previous_version")
        ),
        "?",
    )
    after = next(
        (
            s.get("change_target_version")
            for _, s in change
            if s.get("change_target_version")
        ),
        "?",
    )

    # The incident's own records: the same incident id, from the last time it was
    # opened before the change was proposed. Incident ids start again after a
    # reset as well, so an earlier run's INC-0001 in the same hour is left out.
    incident_rows = [
        (ts, s)
        for ts, s in loki.query(
            f'{{service_name="delivery-mcp"}} | incident_id="{incident}"',
            first - 3600 * NS,
            last + 60 * NS,
        )
        if not s.get("operation_id") or s.get("operation_id") == operation
    ]
    opened = max(
        (
            ts
            for ts, s in incident_rows
            if s.get("audit_event") == "incident.opened" and ts <= first
        ),
        default=first,
    )
    incident_rows = [(ts, s) for ts, s in incident_rows if ts >= opened]
    # The requests and exchanges that led to the opening come just before it.
    window_start = opened - 60 * NS
    timeline = sorted(
        {(ts, json.dumps(s, sort_keys=True)) for ts, s in incident_rows + change}
    )

    print(f"{change_id}, operation {operation}")
    print(f"incident {incident}: {service} {before} -> {after}")
    if others:
        print(
            f"(the same change id was also used by {len(others)} earlier operation(s): {', '.join(others)})"
        )

    print("\nWhat delivery-mcp recorded")
    traces: set[str] = set()
    sessions: set[str] = set()
    for ts, raw in timeline:
        s = json.loads(raw)
        if s.get("trace_id"):
            traces.add(s["trace_id"])
        if s.get("session_id"):
            sessions.add(s["session_id"])
        extra = f"  revision {s['helm_revision']}" if s.get("helm_revision") else ""
        rule = f"  rule {s['audit_rule']}" if s.get("audit_rule") else ""
        print(
            f"  {at(ts)}  {s.get('audit_event', '-'):<29} {s.get('audit_outcome', '-'):<9} "
            f"{s.get('user_id', '-')} via {s.get('actor_chain', '-')}{extra}{rule}"
        )

    print(f"\nRequests through the gateway in the same {len(traces)} traces")
    gateway = (
        loki.query(
            f'{{service_name="agentgateway-proxy"}} | trace_id=~"{either(traces)}"',
            window_start,
            last + 300 * NS,
        )
        if traces
        else []
    )
    jtis: set[str] = set()
    summary: dict[tuple, list[int]] = {}
    for ts, s in gateway:
        if s.get("token_jti"):
            jtis.add(s["token_jti"])
        if s.get("session_id"):
            sessions.add(s["session_id"])
        key = (
            s.get("route", "-"),
            s.get("gen_ai_tool_name")
            or s.get("mcp_method_name")
            or s.get("a2a_method")
            or "-",
            s.get("http_response_status_code", "-"),
            s.get("user_id", "-"),
            s.get("actor_chain", "-"),
        )
        summary.setdefault(key, []).append(ts)
    hidden = 0
    for (route, what, status, user, chain), times in sorted(
        summary.items(), key=lambda kv: kv[1][0]
    ):
        # The MCP protocol's own steps before and after each call say nothing
        # about what was done.
        if not args.all and (what in PROTOCOL or status == "405"):
            hidden += len(times)
            continue
        count = f" (x{len(times)})" if len(times) > 1 else ""
        print(
            f"  {at(times[0])}  {route} {what} -> {status}  {user} via {chain}{count}"
        )
    if hidden:
        print(
            f"  and {hidden} requests of the MCP protocol itself (initialize, tools/list, ...): --all lists them"
        )

    print("\nToken exchanges behind those requests (chain-sts)")
    exchanges = (
        loki.query(
            f'{{service_name="chain-sts"}} | token_jti=~"{either(jtis)}"',
            window_start,
            last + 300 * NS,
        )
        if jtis
        else []
    )
    for ts, s in exchanges:
        print(
            f"  {at(ts)}  {s.get('audit_outcome', '-'):<8} {s.get('user_id', '-')} via {s.get('actor_chain', '-')}  jti {s.get('token_jti', '-')[:8]}"
        )
    if not exchanges:
        print("  none: the requests carried the callers' own tokens")

    print(
        f"\nKubernetes writes in namespace {namespace}, from 10 minutes before the incident"
        " opened to 2 minutes after the change"
    )
    writes = (
        loki.query(
            f'{{service_name="kube-apiserver-audit"}} | objectRef_namespace="{namespace}"',
            opened - 600 * NS,
            last + 120 * NS,
        )
        if namespace
        else []
    )
    for ts, s in writes:
        agent = (s.get("userAgent") or "-").split(" ")[0]
        sub = f"/{s['objectRef_subresource']}" if s.get("objectRef_subresource") else ""
        print(
            f"  {at(ts)}  {s.get('audit_event', '-'):<20} {s.get('objectRef_resource', '-')}/{s.get('objectRef_name', '-')}{sub}  "
            f"by {s.get('user_id', '-')} ({agent})  {s.get('audit_outcome', '-')}"
        )
    if not writes:
        print("  none recorded")

    print(f"\nSign-ins behind the callers' sessions ({len(sessions)})")
    signins = (
        loki.query(
            f'{{service_name="keycloak"}} | session_id=~"{either(sessions)}"',
            since,
            last + 300 * NS,
        )
        if sessions
        else []
    )
    seen: set[tuple] = set()
    for ts, s in signins:
        key = (s.get("session_id"), s.get("audit_event"))
        if key in seen:
            continue
        seen.add(key)
        # A code or token event names the user by sub only.
        user = s.get("user_id") or (f"sub {s['user_sub']}" if s.get("user_sub") else "-")
        print(
            f"  {at(ts)}  {s.get('audit_event', '-'):<20} {user}  client {s.get('user_client', '-')}  "
            f"from {s.get('client_address', '-')}  session {s.get('session_id', '-')[:8]}"
        )
    if not signins:
        print(
            "  none: the callers signed in before Loki's window, or used tokens without a session"
        )
    return 0


if __name__ == "__main__":
    sys.exit(main())
