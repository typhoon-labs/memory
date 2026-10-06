#!/usr/bin/env python3
"""A stand-in for search-service on a developer machine.

It lets a local run exercise the real verification request with the fake
applier. It answers GET /search?q= with one result, or with 500 when started
with --broken, which is what version 2.1.0 of the real service does.

    python scripts/stub_search.py --port 18198
"""

from __future__ import annotations

import argparse
import json
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from typing import Any
from urllib.parse import parse_qs, urlsplit


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.split("\n", 1)[0])
    parser.add_argument("--port", type=int, default=18198)
    parser.add_argument("--broken", action="store_true", help="answer every search with 500")
    args = parser.parse_args()

    class Handler(BaseHTTPRequestHandler):
        def do_GET(self) -> None:  # noqa: N802 - http.server's name
            url = urlsplit(self.path)
            if url.path != "/search":
                status, body = 404, {"error": "not found"}
            elif args.broken:
                status, body = 500, {"error": "search failed"}
            else:
                query = parse_qs(url.query).get("q", [""])[0]
                status = 200
                body = {"query": query, "results": [{"id": "stub-1", "title": f"Stub for {query}"}]}
            data = json.dumps(body).encode()
            self.send_response(status)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(data)))
            self.end_headers()
            self.wfile.write(data)

        def log_message(self, format: str, *a: Any) -> None:  # noqa: A002
            pass

    server = ThreadingHTTPServer(("127.0.0.1", args.port), Handler)
    print(f"stub search on http://127.0.0.1:{args.port}/search?q=", flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
