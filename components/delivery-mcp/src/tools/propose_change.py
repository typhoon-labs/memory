"""propose_change: a developer proposes returning a service to an earlier version."""

from fastmcp.tools.tool import ToolResult
from mcp.types import ToolAnnotations

from core.server import mcp
from delivery.runtime import run_tool


@mcp.tool(
    annotations=ToolAnnotations(
        title="Propose change",
        readOnlyHint=False,
        destructiveHint=False,
        idempotentHint=False,
        openWorldHint=False,
    ),
)
async def propose_change(incident_id: str, target_version: str) -> ToolResult:
    """Propose returning the incident's service to an earlier version.

    Needs the role `developer`. The caller's team must own the service (rule
    `team_owns_service`), and the target must be a retained version earlier than the one
    running (rule `target_is_retained_earlier_version`). The change starts as `proposed`;
    nothing is applied.

    Args:
        incident_id: The incident, for example `INC-0001`.
        target_version: The version to return to, for example `2.0.0`.
    """
    return await run_tool(
        "propose_change",
        lambda s, caller: s.propose_change(caller, incident_id, target_version),
        target=incident_id,
    )
