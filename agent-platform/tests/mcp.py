#!/usr/bin/env python3
"""One MCP exchange with a server behind the gateway, from this machine.

    mcp.py URL IDENTITY list                    the tool names the caller is offered
    mcp.py URL IDENTITY call TOOL JSON-ARGS     one tools/call

IDENTITY is a user or `alert-automation`, as for local/identity/token.sh, or
`-` to send no token. The session is opened first (`initialize`), and a
session id is carried when the route gives one: /mcp/observability does,
/mcp/delivery is stateless.

Prints one JSON object and exits 0 whatever the server answered; what was
refused, and by whom, is in the object:

    {"http": 200, "tools": [...]}                      list
    {"http": 200, "isError": false, "result": {...}}   call that reached the server
    {"http": 400, "error": {"code": ..., "message": ...}}   refusal by the gateway
    {"http": 401, "error": {"message": "<body>"}}      no session at all

Standard library only.
"""

from __future__ import annotations

import json
import pathlib
import subprocess
import sys
import urllib.error
import urllib.request

REPO = pathlib.Path(__file__).resolve().parents[2]
PROTOCOL = "2025-06-18"


def post(url: str, body: dict, headers: dict[str, str]) -> tuple[int, dict[str, str], str]:
    request = urllib.request.Request(
        url, data=json.dumps(body).encode(), headers={"Content-Type": "application/json", **headers}
    )
    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            return response.status, dict(response.headers), response.read().decode()
    except urllib.error.HTTPError as error:
        return error.code, dict(error.headers), error.read().decode()


def message(body: str) -> dict | None:
    """The JSON-RPC message in a JSON body or in the first event of a stream."""
    for line in body.splitlines():
        line = line[5:].strip() if line.startswith("data:") else line.strip()
        if line.startswith("{"):
            return json.loads(line)
    return None


def refusal(status: int, body: str) -> dict:
    answer = message(body)
    error = answer.get("error") if answer else None
    return {"http": status, "error": error or {"message": body.strip()[:300]}}


def main() -> int:
    url, identity, action, *rest = sys.argv[1:]
    headers = {"Accept": "application/json, text/event-stream"}
    if identity != "-":
        token = subprocess.run(
            [str(REPO / "local/identity/token.sh"), identity], capture_output=True, text=True, check=True
        ).stdout.strip()
        headers["Authorization"] = f"Bearer {token}"

    status, answer_headers, body = post(
        url,
        {
            "jsonrpc": "2.0",
            "id": 0,
            "method": "initialize",
            "params": {
                "protocolVersion": PROTOCOL,
                "capabilities": {},
                "clientInfo": {"name": "agent-platform-tests", "version": "1"},
            },
        },
        headers,
    )
    if status != 200:
        print(json.dumps(refusal(status, body)))
        return 0
    headers["MCP-Protocol-Version"] = PROTOCOL
    session = {name.lower(): value for name, value in answer_headers.items()}.get("mcp-session-id")
    if session:
        headers["Mcp-Session-Id"] = session
    post(url, {"jsonrpc": "2.0", "method": "notifications/initialized"}, headers)

    if action == "list":
        status, _, body = post(url, {"jsonrpc": "2.0", "id": 1, "method": "tools/list"}, headers)
        answer = message(body)
        if status != 200 or not answer or "result" not in answer:
            print(json.dumps(refusal(status, body)))
        else:
            print(json.dumps({"http": status, "tools": sorted(tool["name"] for tool in answer["result"]["tools"])}))
        return 0

    tool, arguments = rest[0], json.loads(rest[1]) if len(rest) > 1 else {}
    status, _, body = post(
        url,
        {"jsonrpc": "2.0", "id": 2, "method": "tools/call", "params": {"name": tool, "arguments": arguments}},
        headers,
    )
    answer = message(body)
    if status != 200 or not answer or "result" not in answer:
        print(json.dumps(refusal(status, body)))
        return 0
    result = answer["result"]
    content = result.get("structuredContent")
    if content is None:
        text = "".join(part.get("text", "") for part in result.get("content", []))
        try:
            content = json.loads(text)
        except ValueError:
            content = text
    print(json.dumps({"http": status, "isError": bool(result.get("isError")), "result": content}))
    return 0


if __name__ == "__main__":
    sys.exit(main())
