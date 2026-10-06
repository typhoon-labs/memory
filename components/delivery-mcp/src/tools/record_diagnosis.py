"""record_diagnosis: attach the diagnosis to an incident."""

from fastmcp.tools.tool import ToolResult
from mcp.types import ToolAnnotations

from core.server import mcp
from delivery.runtime import run_tool


@mcp.tool(
    annotations=ToolAnnotations(
        title="Record diagnosis",
        readOnlyHint=False,
        destructiveHint=False,
        idempotentHint=True,
        openWorldHint=False,
    ),
)
async def record_diagnosis(
    incident_id: str, suspected_cause: str, evidence: list[str], recommended_version: str
) -> ToolResult:
    """Record the diagnosis on an incident, replacing any earlier one.

    Needs the role `alert-automation`.

    Args:
        incident_id: The incident, for example `INC-0001`.
        suspected_cause: What the investigation found.
        evidence: The observations that support it.
        recommended_version: The version the diagnosis recommends returning to.
    """
    return await run_tool(
        "record_diagnosis",
        lambda s, caller: s.record_diagnosis(
            caller, incident_id, suspected_cause, evidence, recommended_version
        ),
        target=incident_id,
    )
