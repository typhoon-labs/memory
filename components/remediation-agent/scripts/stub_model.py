#!/usr/bin/env python3
"""A stand-in for the model endpoint, for local runs when no model is reachable.

It speaks just enough of the Anthropic Messages API (POST /v1/messages, with
"stream": true) for the agents to complete a request, and answers with fixed
text. It is not a model: use it to exercise the path, not to judge the wording.

For each request it logs the model asked for and which credentials arrived.
The bearer token is shown as the user it names, never in full.

    python scripts/stub_model.py --port 18197
    MODEL_BASE_URL=http://127.0.0.1:18197 scripts/local.sh up
"""

from __future__ import annotations

import argparse
import base64
import json
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from typing import Any

RESULT = "The change was applied as requested. The search check passed after the change."
DRAFT = (
    "Search on the Sample App was returning errors for all users. The search service has been"
    " returned to its previous version and searches are working again. We continue to monitor."
)


def token_user(authorization: str) -> str:
    """Who a bearer token names, read without verifying it. For the log only."""
    try:
        payload = authorization.split(" ", 1)[1].split(".")[1]
        claims = json.loads(base64.urlsafe_b64decode(payload + "=" * (-len(payload) % 4)))
        return str(claims.get("preferred_username") or claims.get("sub") or "unknown")
    except (IndexError, ValueError):
        return "unreadable"


def events(model: str, text: str) -> list[tuple[str, dict[str, Any]]]:
    message = {
        "id": "msg_stub", "type": "message", "role": "assistant", "model": model, "content": [],
        "stop_reason": None, "stop_sequence": None,
        "usage": {"input_tokens": 0, "output_tokens": 0},
    }  # fmt: skip
    return [
        ("message_start", {"type": "message_start", "message": message}),
        ("content_block_start", {"type": "content_block_start", "index": 0,
                                 "content_block": {"type": "text", "text": ""}}),
        ("content_block_delta", {"type": "content_block_delta", "index": 0,
                                 "delta": {"type": "text_delta", "text": text}}),
        ("content_block_stop", {"type": "content_block_stop", "index": 0}),
        ("message_delta", {"type": "message_delta",
                           "delta": {"stop_reason": "end_turn", "stop_sequence": None},
                           "usage": {"output_tokens": len(text.split())}}),
        ("message_stop", {"type": "message_stop"}),
    ]  # fmt: skip


class Handler(BaseHTTPRequestHandler):
    def do_POST(self) -> None:  # noqa: N802 - http.server's name
        body = json.loads(self.rfile.read(int(self.headers.get("Content-Length", "0"))) or b"{}")
        authorization = self.headers.get("Authorization", "")
        bearer = f"Bearer for {token_user(authorization)}" if authorization else "absent"
        print(
            f"POST {self.path} model={body.get('model')} authorization={bearer}"
            f" x-api-key={'PRESENT' if self.headers.get('x-api-key') else 'absent'}"
            f" anthropic-version={self.headers.get('anthropic-version')}",
            flush=True,
        )
        if self.path.split("?")[0] != "/v1/messages" or not authorization:
            self._send(401 if not authorization else 404, "application/json", b'{"type":"error"}')
            return
        system = json.dumps(body.get("system", ""))
        text = DRAFT if "status update" in system else RESULT
        stream = "".join(
            f"event: {name}\ndata: {json.dumps(payload)}\n\n"
            for name, payload in events(str(body.get("model")), text)
        )
        self._send(200, "text/event-stream", stream.encode())

    def _send(self, status: int, content_type: str, data: bytes) -> None:
        self.send_response(status)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def log_message(self, format: str, *args: Any) -> None:  # noqa: A002
        pass


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.split("\n", 1)[0])
    parser.add_argument("--port", type=int, default=18197)
    args = parser.parse_args()
    server = ThreadingHTTPServer(("127.0.0.1", args.port), Handler)
    print(f"stub model on http://127.0.0.1:{args.port} (not a model)", flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
