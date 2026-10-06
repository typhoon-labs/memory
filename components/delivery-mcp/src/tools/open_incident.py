"""open_incident: the alert opens an incident for a service."""

from fastmcp.tools.tool import ToolResult
from mcp.types import ToolAnnotations

from core.server import mcp
from delivery.runtime import run_tool


@mcp.tool(
    annotations=ToolAnnotations(
        title="Open incident",
        readOnlyHint=False,
        destructiveHint=False,
        idempotentHint=False,
        openWorldHint=False,
    ),
)
async def open_incident(service: str, severity: str, summary: str, impact: str) -> ToolResult:
    """Open an incident for a service.

    Needs the role `alert-automation`. A service has one unresolved incident at a time; a
    second one is refused with the rule `one_open_incident_per_service`.

    Args:
        service: `search-service`, `registration-service` or `web`.
        severity: The alert's severity, for example `sev2`.
        summary: What is wrong, in a sentence.
        impact: Who is affected and how.
    """
    return await run_tool(
        "open_incident",
        lambda s, caller: s.open_incident(caller, service, severity, summary, impact),
        target=service,
    )
