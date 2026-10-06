"""list_incidents: every incident, newest first. Any signed-in caller."""

from fastmcp.tools.tool import ToolResult
from mcp.types import ToolAnnotations

from core.server import mcp
from delivery.runtime import run_tool


@mcp.tool(
    annotations=ToolAnnotations(
        title="List incidents",
        readOnlyHint=True,
        idempotentHint=True,
        openWorldHint=False,
    ),
)
async def list_incidents() -> ToolResult:
    """List every incident, newest first, each with its diagnosis, changes and status updates.

    Any signed-in caller may call this. Returns `{"incidents": [...]}`.
    """
    return await run_tool(
        "list_incidents",
        lambda service, caller: service.list_incidents(caller),
        target="",
    )
