"""Logs are JSON, one object per line; an audit record's fields sit at the top level."""

from __future__ import annotations

import json
import logging
import sys

from chain_sts.logs import JsonFormatter


def record(**kwargs) -> logging.LogRecord:
    defaults = {
        "name": "chain_sts.audit",
        "level": logging.INFO,
        "pathname": __file__,
        "lineno": 1,
        "msg": "token exchange %s",
        "args": ("issued",),
        "exc_info": None,
    }
    return logging.LogRecord(**(defaults | kwargs))


def test_one_json_object_per_line():
    entry = record()
    entry.fields = {"event": "token_exchange", "outcome": "issued", "chain": ["a", "b"]}
    line = JsonFormatter().format(entry)
    assert "\n" not in line
    parsed = json.loads(line)
    assert parsed["level"] == "INFO"
    assert parsed["logger"] == "chain_sts.audit"
    assert parsed["message"] == "token exchange issued"
    assert parsed["time"].endswith("Z")
    assert parsed["chain"] == ["a", "b"]
    assert parsed["outcome"] == "issued"


def test_exception_stays_on_the_line():
    try:
        raise RuntimeError("boom")
    except RuntimeError:
        entry = record(
            name="chain_sts", level=logging.ERROR, msg="failed", args=(), exc_info=sys.exc_info()
        )
    line = JsonFormatter().format(entry)
    assert "\n" not in line
    assert "RuntimeError: boom" in json.loads(line)["exception"]
