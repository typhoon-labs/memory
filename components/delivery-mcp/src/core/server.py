"""Dynamic MCP server implementation with automatic tool discovery.

Scaffolded by ``kmcp init python`` (kmcp 0.4.0) and kept in its shape, so that
``kmcp build`` and ``kmcp deploy`` still apply. Each file in ``src/tools/``
holds one function decorated with ``@mcp.tool()``.

Changed from the scaffold:

- The server is built with a token verifier. There is no unauthenticated mode.
- The loaded tools must be exactly the contract's set, or the server stops.
- ``GET /healthz`` is served next to ``/mcp``.
- ``.env`` is read from the project directory only, and never overrides the
  environment. The scaffold searched every parent directory and let the file
  win, which would let a stray file replace the identity bindings.
"""

import asyncio
import importlib.util
import logging
import sys
from pathlib import Path
from typing import Any

from dotenv import load_dotenv
from fastmcp import FastMCP
from starlette.requests import Request
from starlette.responses import JSONResponse, Response

from delivery import runtime
from delivery.config import SERVICE_NAME, Settings, load_settings
from delivery.identity import build_verifier
from delivery.service import TOOL_ROLES
from delivery.telemetry import instrument_app, setup_telemetry

from .utils import load_config

PROJECT_DIR = Path(__file__).resolve().parents[2]

INSTRUCTIONS = (
    "Incident and change state for the Sample App. Every tool acts as the signed-in caller:"
    " identity, roles and team come from the bearer token, never from arguments. A refusal is"
    ' returned as {"error": "forbidden", "layer": "service", "rule": "...", "message": "..."}.'
)

# Global FastMCP instance for tools to import. Replaced by DynamicMCPServer;
# this placeholder is never served.
mcp: FastMCP = FastMCP(name="Dynamic Server")


class DynamicMCPServer:
    """MCP server with dynamic tool loading capabilities."""

    def __init__(
        self,
        name: str,
        tools_dir: str = "src/tools",
        settings: Settings | None = None,
    ):
        """Initialize the dynamic MCP server.

        Args:
            name: Server name
            tools_dir: Directory containing tool files
            settings: Bindings; read from the environment when not given
        """
        global mcp
        self.name = name
        self.tools_dir = Path(tools_dir)
        if not self.tools_dir.is_absolute() and not self.tools_dir.exists():
            self.tools_dir = PROJECT_DIR / tools_dir
        self.config = self._load_config()

        # Load local environment variables if configured
        self._load_local_env()

        self.settings = settings or load_settings()
        setup_telemetry(SERVICE_NAME, self.settings.app_version, self.settings.environment)

        # Update global FastMCP instance. The verifier checks signature, issuer,
        # audience and expiry on every request to /mcp.
        mcp = FastMCP(
            name=self.name,
            instructions=INSTRUCTIONS,
            version=self.settings.app_version,
            auth=build_verifier(self.settings),
        )
        self.mcp = mcp
        self._register_health()

        # Track loaded tools
        self.loaded_tools: list[str] = []

    def _load_config(self) -> dict[str, Any]:
        """Load configuration from kmcp.yaml."""
        return load_config(str(PROJECT_DIR / "kmcp.yaml"))

    def _load_local_env(self) -> None:
        """Load ``.env`` from the project directory, without overriding the environment."""
        env_file = PROJECT_DIR / ".env"
        if env_file.is_file() and load_dotenv(env_file, override=False):
            logging.info("Loaded environment variables from %s", env_file)

    def _register_health(self) -> None:
        version = self.settings.app_version

        @self.mcp.custom_route("/healthz", methods=["GET"], include_in_schema=False)
        async def healthz(request: Request) -> Response:
            return JSONResponse({"status": "ok", "service": SERVICE_NAME, "version": version})

    def load_tools(self) -> None:
        """Discover and load all tools from the tools directory."""
        if not self.tools_dir.exists():
            print(f"Tools directory {self.tools_dir} does not exist")
            return

        # Find all Python files in tools directory
        tool_files = sorted(self.tools_dir.glob("*.py"))
        tool_files = [f for f in tool_files if f.name != "__init__.py"]

        if not tool_files:
            logging.warning(f"No tool files found in {self.tools_dir}")
            return

        loaded_count = 0
        has_errors = False

        for tool_file in tool_files:
            try:
                # Get the number of tools before importing
                tools_before = len(asyncio.run(self.mcp.list_tools()))

                # Simply import the module - tools auto-register via @mcp.tool()
                # decorator
                tool_name = tool_file.stem
                if self._import_tool_module(tool_file, tool_name):
                    # Check if any tools were actually registered
                    tools_after = len(asyncio.run(self.mcp.list_tools()))
                    if tools_after > tools_before:
                        self.loaded_tools.append(tool_name)
                        loaded_count += 1
                        logging.info(f"Loaded tool module: {tool_name}")
                    else:
                        logging.error(f"Tool file {tool_name} did not register any tools")
                        has_errors = True
                else:
                    logging.error(f"Failed to load tool module: {tool_name}")
                    has_errors = True

            except Exception as e:
                logging.error(f"Error loading tool {tool_file.name}: {e}")
                has_errors = True

        # The tool set is a contract. Serving more or fewer tools than it names
        # is an error, not a warning.
        served = {t.name for t in asyncio.run(self.mcp.list_tools())}
        expected = set(TOOL_ROLES)
        if served != expected:
            logging.error(
                "Tool set differs from the contract: missing %s, unexpected %s",
                sorted(expected - served),
                sorted(served - expected),
            )
            has_errors = True

        # Fail fast - if any tool fails to load, stop the server
        if has_errors:
            sys.exit(1)

        logging.info(f"Successfully loaded {loaded_count} tools")

    def _import_tool_module(self, tool_file: Path, tool_name: str) -> bool:
        """Import a tool module, which auto-registers tools via decorators.

        Args:
            tool_file: Path to the tool file
            tool_name: Name of the tool (same as filename)

        Returns:
            True if module was imported successfully
        """
        try:
            # Load the module
            spec = importlib.util.spec_from_file_location(tool_name, tool_file)
            if spec is None or spec.loader is None:
                return False

            module = importlib.util.module_from_spec(spec)

            # Add to sys.modules so it can be imported by other modules
            sys.modules[f"tools.{tool_name}"] = module

            # Execute the module - this will trigger @mcp.tool() decorators
            spec.loader.exec_module(module)

            return True

        except Exception as e:
            print(f"Error importing {tool_file}: {e}")
            return False

    def get_tools_sync(self) -> dict[str, Any]:
        """Get tools synchronously for testing purposes."""
        tools_list = asyncio.run(self.mcp.list_tools())
        return {t.name: t for t in tools_list}

    def http_app(self) -> Any:
        """The ASGI app: ``/mcp`` (Streamable HTTP, bearer token required) and ``/healthz``."""
        app = self.mcp.http_app(path="/mcp", stateless_http=self.settings.stateless_http)
        instrument_app(app)
        return app

    def run(self, transport_mode: str = "http", host: str = "localhost", port: int = 8080) -> None:
        """Run the FastMCP server.

        Args:
            transport_mode: Only "http". The caller is identified by a bearer
                token, which stdio cannot carry, so stdio is refused.
            host: Host to bind to
            port: Port to bind to
        """
        if transport_mode != "http":
            raise ValueError(
                "delivery-mcp serves Streamable HTTP only: the caller is identified by a"
                " bearer token, and stdio carries none"
            )
        import uvicorn

        # Open the state and build the applier now, so a bad path or binding stops
        # the start instead of the first call.
        runtime.configure(runtime.build_service(self.settings))
        uvicorn.run(self.http_app(), host=host, port=port, log_level="info", access_log=False)
