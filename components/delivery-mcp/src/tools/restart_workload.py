"""restart_workload: a platform engineer restarts a service's pods."""

from fastmcp.tools.tool import ToolResult
from mcp.types import ToolAnnotations

from core.server import mcp
from delivery.runtime import run_tool


@mcp.tool(
    annotations=ToolAnnotations(
        title="Restart workload",
        readOnlyHint=False,
        destructiveHint=True,
        idempotentHint=False,
        openWorldHint=False,
    ),
)
async def restart_workload(service: str) -> ToolResult:
    """Restart a service by deleting its pods; its Deployment replaces them.

    Needs the role `platform-engineer`. No approval is needed. The version that runs does
    not change.

    Args:
        service: `search-service`, `registration-service` or `web`.
    """
    return await run_tool(
        "restart_workload",
        lambda s, caller: s.restart_workload(caller, service),
        target=service,
    )
