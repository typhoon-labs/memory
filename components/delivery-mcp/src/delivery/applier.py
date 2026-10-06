"""Changing which version of a service runs.

Two implementations of one interface. The fake keeps the selection in memory
for tests and local runs. The Helm one upgrades the Sample App release, so the
release stays the only writer of the Deployment: this service never patches a
workload itself.
"""

from __future__ import annotations

import asyncio
import json
import logging
import os
from dataclasses import dataclass, field
from typing import Protocol

from .config import VERSION_PATTERN, VERSION_VALUE_KEYS, Settings

logger = logging.getLogger(__name__)


class ApplyError(Exception):
    """The selection could not be changed."""


@dataclass(frozen=True)
class ApplyResult:
    detail: str


class Applier(Protocol):
    async def current_version(self, service: str) -> str | None:
        """The version selected now, or None when it cannot be read."""

    async def apply(self, service: str, version: str, operation_id: str) -> ApplyResult:
        """Select ``version`` for ``service``. Raises ApplyError on failure."""


@dataclass
class FakeApplier:
    """Keeps the selection in memory. For tests and local runs."""

    versions: dict[str, str] = field(default_factory=dict)
    delay_seconds: float = 0.0
    fail_with: str | None = None
    calls: list[tuple[str, str, str]] = field(default_factory=list)

    async def current_version(self, service: str) -> str | None:
        return self.versions.get(service)

    async def apply(self, service: str, version: str, operation_id: str) -> ApplyResult:
        self.calls.append((service, version, operation_id))
        if self.delay_seconds:
            await asyncio.sleep(self.delay_seconds)
        if self.fail_with:
            raise ApplyError(self.fail_with)
        self.versions[service] = version
        return ApplyResult(detail=f"fake applier selected {service} {version}")


class HelmApplier:
    """Runs ``helm upgrade --reuse-values`` on the Sample App release."""

    def __init__(self, settings: Settings) -> None:
        self._bin = settings.helm_bin
        self._release = settings.helm_release
        self._namespace = settings.helm_namespace
        self._chart_ref = settings.helm_chart_ref
        self._chart_version = settings.helm_chart_version
        self._plain_http = settings.helm_plain_http
        self._timeout = settings.helm_timeout_seconds

    @staticmethod
    def _value_key(service: str) -> str:
        key = VERSION_VALUE_KEYS.get(service)
        if key is None:
            raise ApplyError(f"{service} has no version selection this service can change")
        return key

    def upgrade_command(self, service: str, version: str, operation_id: str) -> list[str]:
        """The exact command line. No shell is involved; every item is one argument."""
        if not VERSION_PATTERN.match(version):
            raise ApplyError(f"{version!r} is not a version")
        command = [
            self._bin,
            "upgrade",
            self._release,
            self._chart_ref,
            "--namespace",
            self._namespace,
            "--reuse-values",
            # --set-string, so a tag such as 2.10 is never read as the number 2.1.
            "--set-string",
            f"{self._value_key(service)}={version}",
            "--description",
            f"delivery-mcp operation {operation_id}: {service} to {version}",
            "--timeout",
            f"{self._timeout}s",
        ]
        if self._chart_version:
            command += ["--version", self._chart_version]
        if self._plain_http:
            # An OCI registry served over HTTP, as the local one is.
            command.append("--plain-http")
        return command

    async def _run(self, command: list[str]) -> str:
        try:
            process = await asyncio.create_subprocess_exec(
                *command,
                stdin=asyncio.subprocess.DEVNULL,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
                env=os.environ.copy(),
            )
        except OSError as exc:
            raise ApplyError(f"could not run {command[0]}: {exc}") from exc
        try:
            stdout, stderr = await asyncio.wait_for(
                process.communicate(), timeout=self._timeout + 30
            )
        except TimeoutError as exc:
            process.kill()
            await process.wait()
            raise ApplyError(f"helm did not finish within {self._timeout + 30}s") from exc
        if process.returncode != 0:
            message = stderr.decode(errors="replace").strip().splitlines()
            raise ApplyError(
                f"helm exited {process.returncode}: " + (message[-1] if message else "no output")
            )
        return stdout.decode(errors="replace")

    async def current_version(self, service: str) -> str | None:
        key = VERSION_VALUE_KEYS.get(service)
        if key is None:
            return None
        try:
            out = await self._run(
                [
                    self._bin,
                    "get",
                    "values",
                    self._release,
                    "--namespace",
                    self._namespace,
                    "--all",
                    "--output",
                    "json",
                ]
            )
            value: object = json.loads(out)
            for part in key.split("."):
                value = value[part]  # type: ignore[index]
        except (ApplyError, ValueError, KeyError, TypeError) as exc:
            logger.warning("could not read the current version of %s: %s", service, exc)
            return None
        return str(value) if value is not None else None

    async def apply(self, service: str, version: str, operation_id: str) -> ApplyResult:
        await self._run(self.upgrade_command(service, version, operation_id))
        return ApplyResult(
            detail=f"helm release {self._release} in {self._namespace}: {service} set to {version}"
        )
