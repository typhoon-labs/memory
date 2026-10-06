"""Structured errors returned by the service.

Every error has the same four keys. A refusal is the case ``error == "forbidden"``:
the caller is who the token says, and a rule says no.
"""

from __future__ import annotations

LAYER = "service"

# Rule names. They are part of the contract: callers show and test on them.
RULE_ROLE_REQUIRED = "role_required"
RULE_ONE_OPEN_INCIDENT = "one_open_incident_per_service"
RULE_TEAM_OWNS_SERVICE = "team_owns_service"
RULE_RETAINED_EARLIER_VERSION = "target_is_retained_earlier_version"
RULE_APPROVER_NOT_PROPOSER = "approver_is_not_proposer"
RULE_CHANGE_IS_APPROVED = "change_is_approved"

# Not refusals: the request cannot be carried out as asked.
RULE_AUTHENTICATED_CALLER = "authenticated_caller"
RULE_INCIDENT_EXISTS = "incident_exists"
RULE_CHANGE_EXISTS = "change_exists"
RULE_SERVICE_IS_KNOWN = "service_is_known"
RULE_INCIDENT_IS_OPEN = "incident_is_open"
RULE_CHANGE_IS_PENDING = "change_is_pending"
RULE_ARGUMENT_IS_VALID = "argument_is_valid"
RULE_OPERATION_COMPLETED = "operation_completed"


class ServiceError(Exception):
    """An error with the contract's shape."""

    error = "error"

    def __init__(self, rule: str, message: str) -> None:
        super().__init__(message)
        self.rule = rule
        self.message = message

    def to_dict(self) -> dict[str, str]:
        return {
            "error": self.error,
            "layer": LAYER,
            "rule": self.rule,
            "message": self.message,
        }


class Refusal(ServiceError):
    """A rule refused the caller."""

    error = "forbidden"


class NotFound(ServiceError):
    error = "not_found"


class InvalidState(ServiceError):
    error = "invalid_state"


class InvalidArgument(ServiceError):
    error = "invalid_argument"


class OperationFailed(ServiceError):
    """The caller was allowed, and the operation itself did not succeed."""

    error = "operation_failed"
