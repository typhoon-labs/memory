"""reject_change: an incident manager rejects a change that has not been applied."""

from fastmcp.tools.tool import ToolResult
from mcp.types import ToolAnnotations

from core.server import mcp
from delivery.runtime import run_tool


@mcp.tool(
    annotations=ToolAnnotations(
        title="Reject change",
        readOnlyHint=False,
        destructiveHint=False,
        idempotentHint=False,
        openWorldHint=False,
    ),
)
async def reject_change(change_id: str, reason: str) -> ToolResult:
    """Reject a change that is proposed or approved and not yet applied.

    Needs the role `incident-manager`.

    Args:
        change_id: The change, for example `CHG-0001`.
        reason: Why it is rejected.
    """
    return await run_tool(
        "reject_change",
        lambda service, caller: service.reject_change(caller, change_id, reason),
        target=change_id,
    )
