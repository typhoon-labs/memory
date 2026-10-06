"""Incident and change state in SQLite.

One connection, one lock. The service runs as a single replica, and every
write that a rule depends on is a single statement or a single transaction, so
two concurrent calls cannot both win: the unique index allows one unresolved
incident per service, and a status change names the status it expects to leave.
"""

from __future__ import annotations

import json
import sqlite3
import threading
from collections.abc import Iterable
from datetime import UTC, datetime
from typing import Any

SCHEMA = """
CREATE TABLE IF NOT EXISTS incidents (
    seq          INTEGER PRIMARY KEY AUTOINCREMENT,
    id           TEXT UNIQUE,
    service      TEXT NOT NULL,
    severity     TEXT NOT NULL,
    summary      TEXT NOT NULL,
    impact       TEXT NOT NULL,
    status       TEXT NOT NULL,
    opened_by    TEXT NOT NULL,
    opened_at    TEXT NOT NULL,
    resolved_at  TEXT,
    diagnosis    TEXT
);
CREATE UNIQUE INDEX IF NOT EXISTS one_unresolved_incident_per_service
    ON incidents(service) WHERE status != 'resolved';

CREATE TABLE IF NOT EXISTS changes (
    seq              INTEGER PRIMARY KEY AUTOINCREMENT,
    id               TEXT UNIQUE,
    incident_id      TEXT NOT NULL,
    service          TEXT NOT NULL,
    target_version   TEXT NOT NULL,
    previous_version TEXT,
    status           TEXT NOT NULL,
    operation_id     TEXT NOT NULL UNIQUE,
    proposed_by      TEXT NOT NULL,
    proposed_at      TEXT NOT NULL,
    approved_by      TEXT,
    approved_at      TEXT,
    rejected_by      TEXT,
    rejected_at      TEXT,
    reject_reason    TEXT,
    applied_by       TEXT,
    applied_at       TEXT,
    detail           TEXT,
    history          TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS status_updates (
    seq         INTEGER PRIMARY KEY AUTOINCREMENT,
    incident_id TEXT NOT NULL,
    text        TEXT NOT NULL,
    posted_by   TEXT NOT NULL,
    posted_at   TEXT NOT NULL
);
"""

CHANGE_FIELDS = (
    "id",
    "incident_id",
    "service",
    "target_version",
    "previous_version",
    "status",
    "operation_id",
    "proposed_by",
    "proposed_at",
    "approved_by",
    "approved_at",
    "rejected_by",
    "rejected_at",
    "reject_reason",
    "applied_by",
    "applied_at",
    "detail",
    "history",
)

# Columns a status change may set alongside the status itself.
_SETTABLE = frozenset(
    {
        "approved_by",
        "approved_at",
        "rejected_by",
        "rejected_at",
        "reject_reason",
        "applied_by",
        "applied_at",
    }
)


def now_iso() -> str:
    return datetime.now(UTC).isoformat(timespec="milliseconds").replace("+00:00", "Z")


class DuplicateOpenIncidentError(Exception):
    """The service already has an unresolved incident."""


class Store:
    def __init__(self, path: str = ":memory:") -> None:
        self._lock = threading.RLock()
        self._db = sqlite3.connect(path, check_same_thread=False, isolation_level=None)
        self._db.row_factory = sqlite3.Row
        with self._lock:
            self._db.executescript(SCHEMA)

    def close(self) -> None:
        with self._lock:
            self._db.close()

    # -- incidents ---------------------------------------------------------

    def create_incident(
        self, *, service: str, severity: str, summary: str, impact: str, opened_by: str
    ) -> dict[str, Any]:
        with self._lock:
            self._db.execute("BEGIN IMMEDIATE")
            try:
                cur = self._db.execute(
                    "INSERT INTO incidents (service, severity, summary, impact, status,"
                    " opened_by, opened_at) VALUES (?, ?, ?, ?, 'open', ?, ?)",
                    (service, severity, summary, impact, opened_by, now_iso()),
                )
                incident_id = f"INC-{cur.lastrowid:04d}"
                self._db.execute(
                    "UPDATE incidents SET id = ? WHERE seq = ?", (incident_id, cur.lastrowid)
                )
                self._db.execute("COMMIT")
            except sqlite3.IntegrityError as exc:
                self._db.execute("ROLLBACK")
                raise DuplicateOpenIncidentError(service) from exc
            except BaseException:
                self._db.execute("ROLLBACK")
                raise
            return self.get_incident(incident_id)  # type: ignore[return-value]

    def unresolved_incident_for(self, service: str) -> dict[str, Any] | None:
        with self._lock:
            row = self._db.execute(
                "SELECT id FROM incidents WHERE service = ? AND status != 'resolved'", (service,)
            ).fetchone()
            return self.get_incident(row["id"]) if row else None

    def get_incident(self, incident_id: str) -> dict[str, Any] | None:
        with self._lock:
            row = self._db.execute(
                "SELECT * FROM incidents WHERE id = ?", (incident_id,)
            ).fetchone()
            if row is None:
                return None
            changes = self._db.execute(
                "SELECT * FROM changes WHERE incident_id = ? ORDER BY seq", (incident_id,)
            ).fetchall()
            updates = self._db.execute(
                "SELECT text, posted_by, posted_at FROM status_updates"
                " WHERE incident_id = ? ORDER BY seq",
                (incident_id,),
            ).fetchall()
            return {
                "incident_id": row["id"],
                "service": row["service"],
                "severity": row["severity"],
                "summary": row["summary"],
                "impact": row["impact"],
                "status": row["status"],
                "opened_by": row["opened_by"],
                "opened_at": row["opened_at"],
                "resolved_at": row["resolved_at"],
                "diagnosis": json.loads(row["diagnosis"]) if row["diagnosis"] else None,
                "changes": [self._change(c) for c in changes],
                "status_updates": [dict(u) for u in updates],
            }

    def list_incidents(self) -> list[dict[str, Any]]:
        with self._lock:
            ids = [
                r["id"]
                for r in self._db.execute("SELECT id FROM incidents ORDER BY seq DESC").fetchall()
            ]
            return [i for i in (self.get_incident(i) for i in ids) if i is not None]

    def set_diagnosis(self, incident_id: str, diagnosis: dict[str, Any]) -> None:
        with self._lock:
            self._db.execute(
                "UPDATE incidents SET diagnosis = ? WHERE id = ?",
                (json.dumps(diagnosis), incident_id),
            )

    def set_incident_status(
        self, incident_id: str, status: str, *, only_from: Iterable[str]
    ) -> bool:
        """Move an incident to ``status`` if it is in one of ``only_from``."""
        allowed = tuple(only_from)
        marks = ",".join("?" for _ in allowed)
        resolved_at = now_iso() if status == "resolved" else None
        with self._lock:
            cur = self._db.execute(
                f"UPDATE incidents SET status = ?, resolved_at = ? WHERE id = ?"
                f" AND status IN ({marks})",
                (status, resolved_at, incident_id, *allowed),
            )
            return cur.rowcount == 1

    def add_status_update(self, incident_id: str, text: str, posted_by: str) -> None:
        with self._lock:
            self._db.execute(
                "INSERT INTO status_updates (incident_id, text, posted_by, posted_at)"
                " VALUES (?, ?, ?, ?)",
                (incident_id, text, posted_by, now_iso()),
            )

    # -- changes -----------------------------------------------------------

    @staticmethod
    def _change(row: sqlite3.Row) -> dict[str, Any]:
        change = {name: row[name] for name in CHANGE_FIELDS if name != "id"}
        change["history"] = json.loads(change["history"])
        return {"change_id": row["id"], **change}

    def create_change(
        self,
        *,
        incident_id: str,
        service: str,
        target_version: str,
        previous_version: str | None,
        operation_id: str,
        proposed_by: str,
    ) -> dict[str, Any]:
        at = now_iso()
        history = [{"status": "proposed", "at": at, "by": proposed_by, "detail": None}]
        with self._lock:
            self._db.execute("BEGIN IMMEDIATE")
            try:
                cur = self._db.execute(
                    "INSERT INTO changes (incident_id, service, target_version,"
                    " previous_version, status, operation_id, proposed_by, proposed_at, history)"
                    " VALUES (?, ?, ?, ?, 'proposed', ?, ?, ?, ?)",
                    (
                        incident_id,
                        service,
                        target_version,
                        previous_version,
                        operation_id,
                        proposed_by,
                        at,
                        json.dumps(history),
                    ),
                )
                change_id = f"CHG-{cur.lastrowid:04d}"
                self._db.execute(
                    "UPDATE changes SET id = ? WHERE seq = ?", (change_id, cur.lastrowid)
                )
                self._db.execute("COMMIT")
            except BaseException:
                self._db.execute("ROLLBACK")
                raise
            return self.get_change(change_id)  # type: ignore[return-value]

    def get_change(self, change_id: str) -> dict[str, Any] | None:
        with self._lock:
            row = self._db.execute("SELECT * FROM changes WHERE id = ?", (change_id,)).fetchone()
            return self._change(row) if row else None

    def transition_change(
        self,
        change_id: str,
        to_status: str,
        *,
        only_from: Iterable[str],
        by: str | None = None,
        detail: str | None = None,
        **fields: str | None,
    ) -> bool:
        """Move a change to ``to_status`` if it is in one of ``only_from``.

        Returns False, and changes nothing, when the change is in any other
        status. That is what makes ``apply_change`` safe to call twice: only one
        call can take a change out of ``approved``.
        """
        unknown = set(fields) - _SETTABLE
        if unknown:
            raise ValueError(f"not settable: {sorted(unknown)}")
        allowed = tuple(only_from)
        marks = ",".join("?" for _ in allowed)
        at = now_iso()
        with self._lock:
            self._db.execute("BEGIN IMMEDIATE")
            try:
                row = self._db.execute(
                    f"SELECT history FROM changes WHERE id = ? AND status IN ({marks})",
                    (change_id, *allowed),
                ).fetchone()
                if row is None:
                    self._db.execute("ROLLBACK")
                    return False
                history = json.loads(row["history"])
                history.append({"status": to_status, "at": at, "by": by, "detail": detail})
                assignments = ["status = ?", "detail = ?", "history = ?"]
                values: list[Any] = [to_status, detail, json.dumps(history)]
                for name, value in fields.items():
                    assignments.append(f"{name} = ?")
                    values.append(value)
                self._db.execute(
                    f"UPDATE changes SET {', '.join(assignments)} WHERE id = ?",
                    (*values, change_id),
                )
                self._db.execute("COMMIT")
                return True
            except BaseException:
                self._db.execute("ROLLBACK")
                raise

    def changes_in(self, statuses: Iterable[str]) -> list[dict[str, Any]]:
        wanted = tuple(statuses)
        marks = ",".join("?" for _ in wanted)
        with self._lock:
            rows = self._db.execute(
                f"SELECT * FROM changes WHERE status IN ({marks}) ORDER BY seq", wanted
            ).fetchall()
            return [self._change(r) for r in rows]
