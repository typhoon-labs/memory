"""get_incident: one incident with its diagnosis, changes and status updates."""

from fastmcp.tools.tool import ToolResult
from mcp.types import ToolAnnotations

from core.server import mcp
from delivery.runtime import run_tool


@mcp.tool(
    annotations=ToolAnnotations(
        title="Get incident",
        readOnlyHint=True,
        idempotentHint=True,
        openWorldHint=False,
    ),
)
async def get_incident(incident_id: str) -> ToolResult:
    """Get one incident with its diagnosis, its changes (each with status and history) and
    its status updates.

    Any signed-in caller may call this. Use it to follow a change after `apply_change`.

    Args:
        incident_id: The incident, for example `INC-0001`.
    """
    return await run_tool(
        "get_incident",
        lambda service, caller: service.get_incident(caller, incident_id),
        target=incident_id,
    )
