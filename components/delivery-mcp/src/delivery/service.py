"""The rules, and the state they guard.

Every public method takes the caller first. The role a tool needs is checked
before anything else, then the rule that depends on state. A rule that says no
raises :class:`Refusal`; nothing is written when one is raised.
"""

from __future__ import annotations

import asyncio
import logging
import uuid
from typing import Any

from . import errors as e
from .applier import Applier, ApplyError
from .config import SERVICE_OWNERS, VERSION_PATTERN, VERSION_VALUE_KEYS
from .errors import InvalidArgument, InvalidState, NotFound, OperationFailed, Refusal
from .identity import Caller
from .restarter import Restarter, RestartError
from .store import DuplicateOpenIncidentError, Store, now_iso
from .verifier import Verifier

logger = logging.getLogger(__name__)

ROLE_ALERT_AUTOMATION = "alert-automation"
ROLE_DEVELOPER = "developer"
ROLE_INCIDENT_MANAGER = "incident-manager"
ROLE_PLATFORM_ENGINEER = "platform-engineer"

# The role each tool needs. None means any signed-in caller.
TOOL_ROLES: dict[str, str | None] = {
    "list_incidents": None,
    "get_incident": None,
    "open_incident": ROLE_ALERT_AUTOMATION,
    "record_diagnosis": ROLE_ALERT_AUTOMATION,
    "propose_change": ROLE_DEVELOPER,
    "approve_change": ROLE_INCIDENT_MANAGER,
    "reject_change": ROLE_INCIDENT_MANAGER,
    "apply_change": ROLE_PLATFORM_ENGINEER,
    "restart_workload": ROLE_PLATFORM_ENGINEER,
    "post_status_update": ROLE_INCIDENT_MANAGER,
}

IN_FLIGHT = ("applying", "verifying")
FINISHED = ("applied", "failed")


def _text(name: str, value: Any, *, limit: int) -> str:
    if not isinstance(value, str) or not value.strip():
        raise InvalidArgument(e.RULE_ARGUMENT_IS_VALID, f"{name} must be a non-empty string")
    value = value.strip()
    if len(value) > limit:
        raise InvalidArgument(
            e.RULE_ARGUMENT_IS_VALID, f"{name} must be at most {limit} characters"
        )
    return value


def _version_key(version: str) -> tuple[int, ...] | None:
    """A dotted numeric version as a tuple, or None when it is not one."""
    parts = version.split(".")
    if not all(p.isdigit() for p in parts):
        return None
    return tuple(int(p) for p in parts)


class DeliveryService:
    def __init__(
        self,
        *,
        store: Store,
        applier: Applier,
        verifier: Verifier,
        restarter: Restarter,
        retained_versions: tuple[str, ...],
        restart_label_selector: str = "app.kubernetes.io/name={service}",
    ) -> None:
        self._store = store
        self._applier = applier
        self._verifier = verifier
        self._restarter = restarter
        self._retained = retained_versions
        self._selector = restart_label_selector
        # Helm allows one operation on a release at a time.
        self._apply_lock = asyncio.Lock()
        self._tasks: set[asyncio.Task[None]] = set()

    # -- shared checks -----------------------------------------------------

    @staticmethod
    def _require_role(caller: Caller, tool: str) -> None:
        role = TOOL_ROLES[tool]
        if role is not None and not caller.has_role(role):
            raise Refusal(
                e.RULE_ROLE_REQUIRED,
                f"{tool} needs the role '{role}'. The caller is {caller.describe()}.",
            )

    def _incident(self, incident_id: Any) -> dict[str, Any]:
        incident_id = _text("incident_id", incident_id, limit=64)
        incident = self._store.get_incident(incident_id)
        if incident is None:
            raise NotFound(e.RULE_INCIDENT_EXISTS, f"there is no incident {incident_id}")
        return incident

    def _change(self, change_id: Any) -> dict[str, Any]:
        change_id = _text("change_id", change_id, limit=64)
        change = self._store.get_change(change_id)
        if change is None:
            raise NotFound(e.RULE_CHANGE_EXISTS, f"there is no change {change_id}")
        return change

    @staticmethod
    def _known_service(service: Any) -> str:
        service = _text("service", service, limit=64)
        if service not in SERVICE_OWNERS:
            known = ", ".join(sorted(SERVICE_OWNERS))
            raise InvalidArgument(
                e.RULE_SERVICE_IS_KNOWN, f"'{service}' is not a known service ({known})"
            )
        return service

    # -- reading -----------------------------------------------------------

    def list_incidents(self, caller: Caller) -> dict[str, Any]:
        self._require_role(caller, "list_incidents")
        return {"incidents": self._store.list_incidents()}

    def get_incident(self, caller: Caller, incident_id: str) -> dict[str, Any]:
        self._require_role(caller, "get_incident")
        return self._incident(incident_id)

    # -- the alert ---------------------------------------------------------

    def open_incident(
        self, caller: Caller, service: str, severity: str, summary: str, impact: str
    ) -> dict[str, Any]:
        self._require_role(caller, "open_incident")
        service = self._known_service(service)
        severity = _text("severity", severity, limit=32)
        summary = _text("summary", summary, limit=500)
        impact = _text("impact", impact, limit=500)
        try:
            return self._store.create_incident(
                service=service,
                severity=severity,
                summary=summary,
                impact=impact,
                opened_by=caller.user,
            )
        except DuplicateOpenIncidentError:
            existing = self._store.unresolved_incident_for(service)
            which = f" ({existing['incident_id']})" if existing else ""
            raise Refusal(
                e.RULE_ONE_OPEN_INCIDENT,
                f"{service} already has an unresolved incident{which};"
                f" a service has one at a time.",
            ) from None

    def record_diagnosis(
        self,
        caller: Caller,
        incident_id: str,
        suspected_cause: str,
        evidence: list[str],
        recommended_version: str,
    ) -> dict[str, Any]:
        self._require_role(caller, "record_diagnosis")
        incident = self._incident(incident_id)
        if incident["status"] == "resolved":
            raise InvalidState(
                e.RULE_INCIDENT_IS_OPEN, f"incident {incident['incident_id']} is resolved"
            )
        suspected_cause = _text("suspected_cause", suspected_cause, limit=1000)
        recommended_version = _text("recommended_version", recommended_version, limit=63)
        if not isinstance(evidence, list) or len(evidence) > 20:
            raise InvalidArgument(
                e.RULE_ARGUMENT_IS_VALID, "evidence must be a list of at most 20 strings"
            )
        evidence = [_text("evidence item", item, limit=1000) for item in evidence]
        self._store.set_diagnosis(
            incident["incident_id"],
            {
                "suspected_cause": suspected_cause,
                "evidence": evidence,
                "recommended_version": recommended_version,
                "recorded_by": caller.user,
                "recorded_at": now_iso(),
            },
        )
        return self._incident(incident["incident_id"])

    # -- propose, approve, reject ------------------------------------------

    async def propose_change(
        self, caller: Caller, incident_id: str, target_version: str
    ) -> dict[str, Any]:
        self._require_role(caller, "propose_change")
        incident = self._incident(incident_id)
        service = incident["service"]

        owner = SERVICE_OWNERS[service]
        if caller.team != owner:
            raise Refusal(
                e.RULE_TEAM_OWNS_SERVICE,
                f"{service} belongs to team '{owner}'. The caller's team is"
                f" '{caller.team or 'none'}', so they cannot propose a change to it.",
            )

        if incident["status"] == "resolved":
            raise InvalidState(
                e.RULE_INCIDENT_IS_OPEN, f"incident {incident['incident_id']} is resolved"
            )

        target_version = _text("target_version", target_version, limit=63)
        if service not in VERSION_VALUE_KEYS:
            raise Refusal(
                e.RULE_RETAINED_EARLIER_VERSION,
                f"{service} has no retained version this service can select.",
            )
        if not VERSION_PATTERN.match(target_version) or target_version not in self._retained:
            retained = ", ".join(self._retained) or "none"
            raise Refusal(
                e.RULE_RETAINED_EARLIER_VERSION,
                f"'{target_version}' is not a retained version of {service}. Retained: {retained}.",
            )
        current = await self._applier.current_version(service)
        if current is not None:
            target_key, current_key = _version_key(target_version), _version_key(current)
            later = target_key is not None and current_key is not None and target_key >= current_key
            if target_version == current or later:
                raise Refusal(
                    e.RULE_RETAINED_EARLIER_VERSION,
                    f"{service} is running {current}; '{target_version}' is not an"
                    f" earlier version.",
                )

        change = self._store.create_change(
            incident_id=incident["incident_id"],
            service=service,
            target_version=target_version,
            previous_version=current,
            operation_id=f"op-{uuid.uuid4()}",
            proposed_by=caller.user,
        )
        self._store.set_incident_status(incident["incident_id"], "mitigating", only_from=("open",))
        return change

    def approve_change(self, caller: Caller, change_id: str) -> dict[str, Any]:
        self._require_role(caller, "approve_change")
        change = self._change(change_id)
        if change["proposed_by"] == caller.user:
            raise Refusal(
                e.RULE_APPROVER_NOT_PROPOSER,
                f"{caller.user} proposed change {change['change_id']} and cannot also approve it.",
            )
        moved = self._store.transition_change(
            change["change_id"],
            "approved",
            only_from=("proposed",),
            by=caller.user,
            approved_by=caller.user,
            approved_at=now_iso(),
        )
        if not moved:
            current = self._change(change["change_id"])
            raise InvalidState(
                e.RULE_CHANGE_IS_PENDING,
                f"change {current['change_id']} is {current['status']}; only a proposed"
                f" change can be approved",
            )
        return self._change(change["change_id"])

    def reject_change(self, caller: Caller, change_id: str, reason: str) -> dict[str, Any]:
        self._require_role(caller, "reject_change")
        change = self._change(change_id)
        reason = _text("reason", reason, limit=500)
        moved = self._store.transition_change(
            change["change_id"],
            "rejected",
            only_from=("proposed", "approved"),
            by=caller.user,
            detail=reason,
            rejected_by=caller.user,
            rejected_at=now_iso(),
            reject_reason=reason,
        )
        if not moved:
            current = self._change(change["change_id"])
            raise InvalidState(
                e.RULE_CHANGE_IS_PENDING,
                f"change {current['change_id']} is {current['status']}; only a proposed"
                f" or approved change can be rejected",
            )
        return self._change(change["change_id"])

    # -- apply -------------------------------------------------------------

    async def apply_change(self, caller: Caller, change_id: str) -> dict[str, Any]:
        """Start applying an approved change and return at once.

        The change is left ``applying``; it moves to ``verifying`` and then to
        ``applied`` or ``failed`` on its own, and ``get_incident`` shows where it
        is. Calling again with the same ``change_id`` starts nothing: it returns
        the change as it stands, with ``replayed`` set.
        """
        self._require_role(caller, "apply_change")
        change = self._change(change_id)
        change_id = change["change_id"]

        claimed = self._store.transition_change(
            change_id,
            "applying",
            only_from=("approved",),
            by=caller.user,
            applied_by=caller.user,
            applied_at=now_iso(),
        )
        if claimed:
            task = asyncio.get_running_loop().create_task(
                self._run_apply(change_id), name=f"apply-{change_id}"
            )
            self._tasks.add(task)
            task.add_done_callback(self._tasks.discard)
            return {**self._change(change_id), "replayed": False}

        change = self._change(change_id)
        if change["status"] in IN_FLIGHT + FINISHED:
            return {**change, "replayed": True}
        raise Refusal(
            e.RULE_CHANGE_IS_APPROVED,
            f"change {change_id} is {change['status']}, not approved. A change is applied"
            f" only after an incident manager has approved it.",
        )

    async def _run_apply(self, change_id: str) -> None:
        change = self._change(change_id)
        service, version = change["service"], change["target_version"]
        try:
            async with self._apply_lock:
                result = await self._applier.apply(service, version, change["operation_id"])
                self._store.transition_change(
                    change_id, "verifying", only_from=("applying",), detail=result.detail
                )
                outcome = await self._verifier.verify(service)
        except ApplyError as exc:
            self._fail(change_id, f"apply failed: {exc}")
            return
        except Exception as exc:  # the change must not be left in flight
            logger.exception("apply of %s stopped unexpectedly", change_id)
            self._fail(change_id, f"apply stopped unexpectedly: {type(exc).__name__}: {exc}")
            return

        if not outcome.ok:
            self._fail(change_id, outcome.detail)
            return
        self._store.transition_change(
            change_id, "applied", only_from=("verifying",), detail=outcome.detail
        )
        self._store.set_incident_status(
            change["incident_id"], "resolved", only_from=("open", "mitigating")
        )
        logger.info("change %s applied: %s", change_id, outcome.detail)

    def _fail(self, change_id: str, detail: str) -> None:
        self._store.transition_change(change_id, "failed", only_from=IN_FLIGHT, detail=detail)
        logger.warning("change %s failed: %s", change_id, detail)

    def fail_interrupted(self) -> int:
        """Mark changes left in flight by a previous process as failed.

        Called once at start-up. Whether such a change took effect is unknown, so
        it is not reported as applied.
        """
        stranded = self._store.changes_in(IN_FLIGHT)
        for change in stranded:
            self._fail(
                change["change_id"],
                "the service restarted while this change was in flight; its effect is unknown",
            )
        return len(stranded)

    async def drain(self) -> None:
        """Wait for applies in flight. For tests and shutdown."""
        while self._tasks:
            await asyncio.gather(*list(self._tasks), return_exceptions=True)

    # -- other platform and incident actions -------------------------------

    async def restart_workload(self, caller: Caller, service: str) -> dict[str, Any]:
        self._require_role(caller, "restart_workload")
        service = self._known_service(service)
        selector = self._selector.format(service=service)
        try:
            result = await self._restarter.restart(selector)
        except RestartError as exc:
            raise OperationFailed(
                e.RULE_OPERATION_COMPLETED, f"restart of {service} failed: {exc}"
            ) from exc
        return {
            "service": service,
            "namespace": result.namespace,
            "label_selector": result.label_selector,
            "pods_deleted": result.pods_deleted,
            "restarted_by": caller.user,
            "restarted_at": now_iso(),
        }

    def post_status_update(self, caller: Caller, incident_id: str, text: str) -> dict[str, Any]:
        self._require_role(caller, "post_status_update")
        incident = self._incident(incident_id)
        text = _text("text", text, limit=2000)
        self._store.add_status_update(incident["incident_id"], text, caller.user)
        return self._incident(incident["incident_id"])
