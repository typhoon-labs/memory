#!/usr/bin/env python3
"""delivery-mcp MCP server with dynamic tool loading.

This server discovers and loads its tools from the src/tools/ directory.
Each tool file contains one function decorated with @mcp.tool().

It serves MCP over Streamable HTTP at /mcp and GET /healthz. Every request to
/mcp needs a bearer token; see README.md for the environment it reads.

Usage:
  python src/main.py --transport http --host 0.0.0.0 --port 8080
  PORT=18190 python src/main.py            # local: binds 127.0.0.1
"""

import argparse
import logging
import os
import sqlite3
import sys
from pathlib import Path

# Add src to Python path
sys.path.insert(0, str(Path(__file__).parent))

from core.server import DynamicMCPServer  # noqa: E402
from delivery.config import ConfigError  # noqa: E402


def main() -> None:
    """Main entry point for the MCP server."""
    parser = argparse.ArgumentParser(description="delivery-mcp MCP Server")
    parser.add_argument(
        "--transport",
        choices=["http"],
        default=os.getenv("MCP_TRANSPORT_MODE", "http"),
        help="Transport mode. Only http: the caller is identified by a bearer token.",
    )
    parser.add_argument(
        "--host",
        default=os.getenv("HOST", "127.0.0.1"),
        help="Host to bind to (default: 127.0.0.1)",
    )
    parser.add_argument(
        "--port",
        type=int,
        default=int(os.getenv("PORT", "8080")),
        help="Port to bind to (default: 8080)",
    )

    args = parser.parse_args()

    logging.basicConfig(
        level=os.getenv("LOG_LEVEL", "INFO").upper(),
        format="%(asctime)s %(levelname)s %(name)s %(message)s",
        handlers=[logging.StreamHandler(sys.stderr)],
    )

    try:
        server = DynamicMCPServer(name="delivery-mcp", tools_dir="src/tools")
        server.load_tools()
        server.run(transport_mode=args.transport, host=args.host, port=args.port)
    except ConfigError as e:
        print(f"Configuration error: {e}", file=sys.stderr)
        sys.exit(2)
    except sqlite3.Error as e:
        print(
            f"Configuration error: cannot open the state at DELIVERY_DB_PATH: {e}", file=sys.stderr
        )
        sys.exit(2)
    except KeyboardInterrupt:
        print("\nShutting down server...")


if __name__ == "__main__":
    main()
