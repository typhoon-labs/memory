"""`python -m chain_sts` as a process: it starts, answers, and every log line is JSON."""

from __future__ import annotations

import json
import os
import queue
import re
import subprocess
import sys
import threading
from pathlib import Path

import httpx
import yaml
from conftest import COMPONENT


def run(env: dict[str, str]) -> subprocess.Popen:
    clean = {k: v for k, v in os.environ.items() if not k.startswith(("OTEL_", "KUBERNETES_"))}
    return subprocess.Popen(
        [sys.executable, "-m", "chain_sts"],
        env=clean | {"PYTHONPATH": str(COMPONENT / "src"), "HOST": "127.0.0.1"} | env,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.PIPE,
        text=True,
    )


def lines_of(process: subprocess.Popen) -> queue.Queue:
    found: queue.Queue = queue.Queue()

    def read() -> None:
        for line in process.stderr:
            found.put(line)
        found.put(None)

    threading.Thread(target=read, daemon=True).start()
    return found


def test_starts_answers_and_logs_json(policy, tmp_path: Path):
    config = tmp_path / "config.yaml"
    config.write_text(yaml.safe_dump(policy("jwks")))
    process = run({"CHAIN_STS_CONFIG": str(config), "PORT": "0", "APP_VERSION": "9.9.9"})
    try:
        lines = lines_of(process)
        started: dict = {}
        while True:
            line = lines.get(timeout=15)
            assert line is not None, "the service stopped before it listened"
            entry = json.loads(line)
            assert {"time", "level", "logger", "message"} <= entry.keys()
            if entry["message"].startswith("Uvicorn running on"):
                break
            if entry["message"].startswith("signing with kid"):
                started = entry
        url = re.search(r"http://[\d.]+:\d+", entry["message"]).group(0)
        health = httpx.get(f"{url}/healthz").json()
        kid = httpx.get(f"{url}/jwks").json()["keys"][0]["kid"]
        assert health == {
            "status": "ok",
            "service": "chain-sts",
            "version": "9.9.9",
            "keys": {"signing": kid},
        }
        # The start line names the key that signs, by its kid alone.
        assert started["message"] == f"signing with kid {kid}"
        assert started["keys"] == {"signing": kid}
    finally:
        process.terminate()
        process.wait(timeout=10)


def test_configuration_error_exits_2(tmp_path: Path):
    process = run({"CHAIN_STS_CONFIG": str(tmp_path / "missing.yaml")})
    _, err = process.communicate(timeout=15)
    assert process.returncode == 2
    [line] = [json.loads(line) for line in err.splitlines() if line.strip()]
    assert line["level"] == "ERROR"
    assert "cannot read" in line["message"]


def test_no_configuration_named_exits_2():
    process = run({"CHAIN_STS_CONFIG": ""})
    _, err = process.communicate(timeout=15)
    assert process.returncode == 2
    assert "CHAIN_STS_CONFIG" in err
