"""Logs as JSON: one object per line, on standard error.

Every line has `time`, `level`, `logger` and `message`. A record that carries
`extra={"fields": {...}}` adds those fields at the top level, which is how the
audit lines (logger `chain_sts.audit`) carry their decision.
"""

from __future__ import annotations

import json
import logging
import sys
from collections.abc import Mapping
from datetime import UTC, datetime


class JsonFormatter(logging.Formatter):
    def format(self, record: logging.LogRecord) -> str:
        line = {
            "time": datetime.fromtimestamp(record.created, UTC)
            .isoformat(timespec="milliseconds")
            .replace("+00:00", "Z"),
            "level": record.levelname,
            "logger": record.name,
            "message": record.getMessage(),
        }
        fields = getattr(record, "fields", None)
        if isinstance(fields, Mapping):
            line.update(fields)
        if record.exc_info:
            line["exception"] = self.formatException(record.exc_info)
        return json.dumps(line, default=str)


def setup_logging(level: str) -> None:
    """Send every logger's records, uvicorn's included, through one JSON handler."""
    handler = logging.StreamHandler(sys.stderr)
    handler.setFormatter(JsonFormatter())
    root = logging.getLogger()
    root.handlers[:] = [handler]
    root.setLevel(level)
