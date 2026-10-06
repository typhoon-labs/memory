"""approve_change: an incident manager approves a proposed change."""

from fastmcp.tools.tool import ToolResult
from mcp.types import ToolAnnotations

from core.server import mcp
from delivery.runtime import run_tool


@mcp.tool(
    annotations=ToolAnnotations(
        title="Approve change",
        readOnlyHint=False,
        destructiveHint=False,
        idempotentHint=False,
        openWorldHint=False,
    ),
)
async def approve_change(change_id: str) -> ToolResult:
    """Approve a proposed change.

    Needs the role `incident-manager`. The approver cannot be the person who proposed the
    change (rule `approver_is_not_proposer`).

    Args:
        change_id: The change, for example `CHG-0001`.
    """
    return await run_tool(
        "approve_change",
        lambda service, caller: service.approve_change(caller, change_id),
        target=change_id,
    )
