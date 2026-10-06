"""Restarting a workload by deleting its pods.

The Deployment is not touched: its controller replaces the pods, and the Helm
release stays the only writer of the Deployment. The pods are found by label,
and the label selector comes from configuration.
"""

from __future__ import annotations

import os
from dataclasses import dataclass, field
from pathlib import Path
from typing import Protocol

import httpx

SERVICE_ACCOUNT_DIR = Path("/var/run/secrets/kubernetes.io/serviceaccount")


class RestartError(Exception):
    """The pods could not be deleted."""


@dataclass(frozen=True)
class RestartResult:
    namespace: str
    label_selector: str
    pods_deleted: int | None


class Restarter(Protocol):
    async def restart(self, label_selector: str) -> RestartResult: ...


@dataclass
class FakeRestarter:
    namespace: str = "sample-app"
    pods_per_selector: int = 1
    calls: list[str] = field(default_factory=list)

    async def restart(self, label_selector: str) -> RestartResult:
        self.calls.append(label_selector)
        return RestartResult(self.namespace, label_selector, self.pods_per_selector)


class KubernetesRestarter:
    """One ``deletecollection`` on pods, with a label selector, in one namespace.

    It needs no other permission: it does not list or read pods first.
    """

    def __init__(
        self,
        namespace: str,
        *,
        api_url: str | None = None,
        service_account_dir: Path = SERVICE_ACCOUNT_DIR,
        transport: httpx.AsyncBaseTransport | None = None,
    ) -> None:
        self._namespace = namespace
        self._dir = service_account_dir
        self._transport = transport
        if api_url is None:
            host = os.environ.get("KUBERNETES_SERVICE_HOST", "kubernetes.default.svc")
            port = os.environ.get("KUBERNETES_SERVICE_PORT", "443")
            host = f"[{host}]" if ":" in host else host
            api_url = f"https://{host}:{port}"
        self._api_url = api_url.rstrip("/")

    async def restart(self, label_selector: str) -> RestartResult:
        try:
            # Read on every call: the kubelet rotates this token.
            token = (self._dir / "token").read_text().strip()
        except OSError as exc:
            raise RestartError(f"no service account token: {exc}") from exc
        ca = self._dir / "ca.crt"
        verify: str | bool = str(ca) if ca.exists() else True
        try:
            async with httpx.AsyncClient(
                base_url=self._api_url,
                verify=verify,
                timeout=httpx.Timeout(15.0),
                transport=self._transport,
            ) as client:
                response = await client.delete(
                    f"/api/v1/namespaces/{self._namespace}/pods",
                    params={"labelSelector": label_selector},
                    headers={"Authorization": f"Bearer {token}"},
                )
        except httpx.HTTPError as exc:
            raise RestartError(f"Kubernetes API request failed: {exc}") from exc
        if response.status_code != 200:
            raise RestartError(
                f"Kubernetes API returned {response.status_code} deleting pods"
                f" with selector {label_selector!r}"
            )
        deleted: int | None = None
        try:
            items = response.json().get("items")
            if isinstance(items, list):
                deleted = len(items)
        except (ValueError, AttributeError):
            pass
        return RestartResult(self._namespace, label_selector, deleted)
