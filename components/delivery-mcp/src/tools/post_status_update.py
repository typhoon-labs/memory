"""post_status_update: an incident manager posts a status update on an incident."""

from fastmcp.tools.tool import ToolResult
from mcp.types import ToolAnnotations

from core.server import mcp
from delivery.runtime import run_tool


@mcp.tool(
    annotations=ToolAnnotations(
        title="Post status update",
        readOnlyHint=False,
        destructiveHint=False,
        idempotentHint=False,
        openWorldHint=False,
    ),
)
async def post_status_update(incident_id: str, text: str) -> ToolResult:
    """Post a status update on an incident.

    Needs the role `incident-manager`.

    Args:
        incident_id: The incident, for example `INC-0001`.
        text: The update, as it should be read by the people affected.
    """
    return await run_tool(
        "post_status_update",
        lambda service, caller: service.post_status_update(caller, incident_id, text),
        target=incident_id,
    )
