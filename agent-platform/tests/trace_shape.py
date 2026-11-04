#!/usr/bin/env python3
"""What traced turns left in Tempo, judged. The check's verdict, for agent-trace.sh.

    trace_shape.py TURN-DIRECTORY...

A directory holds `response.json`, the agent's answer, and `trace.json`, what
Tempo's /api/traces/<id> returned for that turn's trace id. agent-trace.sh
writes them; a pair saved earlier is judged the same way, which is how a run
can be checked against a trace of a version that no longer runs.

Prints one entry per turn, with every span whose parent was never exported,
and one for the whole run. Exit status is the number of lines marked WRONG.

On EVERY turn: the turn completed, and its trace holds the gateway, the
controller, the agent in its sandbox and Substrate's router, egress proxy and
API server, a tools/call that succeeded, a model call that was answered, and
the wake-up (ResumeActor). These held on all 29 turns measured on kagent
1.0.0-alpha17 on 2026-10-30, the broken ones too, and on all 18 measured on
1.0.0-rc1 on 2026-11-02, so a turn without one of them is a fault.

On AT LEAST ONE turn: one connected piece. A piece is a span whose parent is
not in the trace, plus everything under it, so one means an unbroken tree. Not
on every turn, because an Actor can suspend before its last spans are exported,
and those spans never arrive: on alpha17, 26 of the 29 turns came to one piece
and the others to 2, 2 and 12. Requiring all three turns would fail about one
run in four on a healthy cluster. With one of three, that chance is about one
in a thousand if turns are independent. On rc1, after the collector dropped
Substrate's database spans of an authorization check, 17 of 18 turns came to
one piece and one to 2. What this limit is for is still caught every time: when
Substrate's proxies do not export their spans, as on kagent alpha7, every turn
breaks up (13 to 17 pieces on all four turns measured), so no turn is whole.
Another break was caught the same way on rc1 before that filter: three turns
in 336 to 418 pieces each. Standard library only.
"""
import base64
import json
import pathlib
import sys

# Service name in the spans, and what it is.
REQUIRED = {
    "agentgateway-proxy": "the gateway",
    "kagent-controller": "the controller",
    "diagnosis-agent": "the agent",
    "agentgateway": "Substrate's router",
    "atenet-egress": "Substrate's egress proxy",
    "ateapi": "Substrate's API server",
}
TURNS_IN_ONE_PIECE = 1

wrong_lines = 0


def line(label, what, happened):
    print(f"  {label:<9} {what}\n            {happened}")


def more(text):
    print(f"            {text}")


def wrong(text):
    global wrong_lines
    wrong_lines += 1
    print(f"  {'WRONG':<9} {text}")


def load(path):
    try:
        return json.loads(path.read_text())
    except (OSError, ValueError):
        return {}


def spans_of(trace):
    trace = trace.get("trace", trace)
    spans = {}
    for batch in trace.get("batches", trace.get("resourceSpans", [])):
        resource = {a["key"]: next(iter(a["value"].values())) for a in batch.get("resource", {}).get("attributes", [])}
        for scope in batch.get("scopeSpans", batch.get("instrumentationLibrarySpans", [])):
            for span in scope.get("spans", []):
                spans[span["spanId"]] = {
                    "service": str(resource.get("service.name")),
                    "name": span.get("name", ""),
                    "parent": span.get("parentSpanId", ""),
                    "failed": "ERROR" in str(span.get("status", {}).get("code", "")),
                    "start": int(span.get("startTimeUnixNano", 0)),
                }
    return spans


def is_model_call(span):
    name = span["name"]
    return "chat/completions" in name or "/v1/messages" in name or name.startswith("generate_content")


def judge(directory):
    """Prints one turn's entry and says whether it came to one piece."""
    name = directory.name
    answer = load(directory / "response.json")
    spans = spans_of(load(directory / "trace.json"))
    task = (answer.get("result") or {}).get("task") or answer.get("result") or {}
    state = (task.get("status") or {}).get("state", "no answer")
    trace_file = directory / "trace-id"
    trace_id = trace_file.read_text().strip() if trace_file.exists() else "?"

    # The earliest piece is the top of the trace: its parent is the span id the
    # caller made up for its traceparent, which nothing can export.
    tops = sorted((i for i, s in spans.items() if not s["parent"] or s["parent"] not in spans), key=lambda i: spans[i]["start"])
    calls = [s for s in spans.values() if s["name"].startswith("tools/call") and not s["failed"]]
    answered = [s for s in spans.values() if is_model_call(s) and not s["failed"]]
    wakes = [s for s in spans.values() if "ResumeActor" in s["name"]]
    services = {s["service"] for s in spans.values()}

    pieces = "1 piece" if len(tops) == 1 else f"{len(tops)} pieces"
    line(name, f"{state}, {len(spans)} spans in {pieces}, trace {trace_id}",
         f"tools/call {len(calls)}, model calls answered {len(answered)}, ResumeActor {len(wakes)}")
    for top in tops[1:]:
        span = spans[top]
        parent = base64.b64decode(span["parent"]).hex() if span["parent"] else "none"
        more(f"never exported: the parent ({parent}) of {span['service']} {span['name'][:60]}")

    if state != "TASK_STATE_COMPLETED":
        reason = json.dumps(answer["error"]) if "error" in answer else str((task.get("status") or {}).get("message", ""))
        wrong(f"{name}: the turn did not complete: {reason[:200]}")
    for service, what in REQUIRED.items():
        if service not in services:
            wrong(f"{name}: nothing in the trace from {what} (service {service})")
    if not calls:
        wrong(f"{name}: no tools/call that succeeded in the trace")
    if not answered:
        wrong(f"{name}: no answered model call in the trace")
    if not wakes:
        wrong(f"{name}: no ResumeActor in the trace")
    return len(tops) == 1


def main():
    directories = [pathlib.Path(a) for a in sys.argv[1:]]
    if not directories:
        sys.exit(__doc__)
    whole = sum(judge(d) for d in directories)
    if whole >= TURNS_IN_ONE_PIECE:
        line("pieces", f"{whole} of {len(directories)} turns in one piece", f"at least {TURNS_IN_ONE_PIECE} must be")
    else:
        wrong(f"no turn of {len(directories)} came to one piece, and at least {TURNS_IN_ONE_PIECE} must")
    sys.exit(wrong_lines)


if __name__ == "__main__":
    main()
