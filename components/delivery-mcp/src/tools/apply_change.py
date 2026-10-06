"""apply_change: a platform engineer applies an approved change."""

from fastmcp.tools.tool import ToolResult
from mcp.types import ToolAnnotations

from core.server import mcp
from delivery.runtime import run_tool


@mcp.tool(
    annotations=ToolAnnotations(
        title="Apply change",
        readOnlyHint=False,
        destructiveHint=False,
        idempotentHint=True,
        openWorldHint=False,
    ),
)
async def apply_change(change_id: str) -> ToolResult:
    """Apply an approved change, then verify it with a real search request.

    Needs the role `platform-engineer`. The change must be approved (rule
    `change_is_approved`). Returns at once with the change `applying`; it then moves to
    `verifying` and to `applied` or `failed`. Follow it with `get_incident`.

    Idempotent on `change_id`: a second call starts nothing and returns the change as it
    stands, with `replayed` true.

    Args:
        change_id: The change, for example `CHG-0001`.
    """
    return await run_tool(
        "apply_change",
        lambda service, caller: service.apply_change(caller, change_id),
        target=change_id,
    )
