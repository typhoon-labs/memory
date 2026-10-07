"""The parts behind the rules: Helm applier, search check, pod restart, bindings."""

from __future__ import annotations

import json
import stat
from pathlib import Path

import httpx
import pytest

from delivery.applier import ApplyError, HelmApplier
from delivery.config import ConfigError, load_settings
from delivery.restarter import KubernetesRestarter, RestartError
from delivery.service import DeliveryService
from delivery.store import Store
from delivery.verifier import SearchVerifier

IDENTITY = {
    "OIDC_ISSUER": "http://localhost:18081/realms/demo",
    "OIDC_JWKS_URL": "http://keycloak/certs",
    "OIDC_AUDIENCE": "agentgateway",
}
HELM = {
    **IDENTITY,
    "APPLIER": "helm",
    "HELM_CHART_REF": "oci://registry/charts/sample-app",
    "HELM_CHART_VERSION": "0.1.0",
    "VERIFY_SEARCH_URL": "http://search-service.sample-app:8080/search?q=a",
}


# -- bindings ---------------------------------------------------------------


def test_the_service_does_not_start_without_identity_bindings():
    for missing in IDENTITY:
        env = {k: v for k, v in IDENTITY.items() if k != missing}
        with pytest.raises(ConfigError, match=missing):
            load_settings(env)


def test_helm_applier_needs_a_chart_and_a_search_url():
    with pytest.raises(ConfigError, match="HELM_CHART_REF"):
        load_settings({**IDENTITY, "APPLIER": "helm"})
    with pytest.raises(ConfigError, match="VERIFY_SEARCH_URL"):
        load_settings({**IDENTITY, "APPLIER": "helm", "HELM_CHART_REF": "oci://x/y"})
    assert load_settings(HELM).applier == "helm"


def test_defaults_are_the_fake_applier_and_memory():
    settings = load_settings(IDENTITY)
    assert settings.applier == "fake"
    assert settings.db_path == ":memory:"
    assert settings.retained_versions == ("2.0.0",)


def test_retained_versions_must_be_versions():
    with pytest.raises(ConfigError, match="RETAINED_VERSIONS"):
        load_settings({**IDENTITY, "RETAINED_VERSIONS": "2.0.0,--set evil=1"})


# -- Helm applier -----------------------------------------------------------


def fake_helm(tmp_path: Path, *, exit_code: int = 0, stdout: str = "", stderr: str = "") -> Path:
    """A stand-in helm binary that records its arguments, one per line."""
    script = tmp_path / "helm"
    script.write_text(
        "#!/bin/sh\n"
        f'for a in "$@"; do printf \'%s\\n\' "$a"; done >> "{tmp_path}/args"\n'
        f'printf \'%s\\n\' "---" >> "{tmp_path}/args"\n'
        f"printf '%s' '{stdout}'\n"
        f"printf '%s' '{stderr}' >&2\n"
        f"exit {exit_code}\n"
    )
    script.chmod(script.stat().st_mode | stat.S_IEXEC)
    return script


def recorded(tmp_path: Path) -> list[list[str]]:
    lines = (tmp_path / "args").read_text().splitlines()
    runs, current = [], []
    for line in lines:
        if line == "---":
            runs.append(current)
            current = []
        else:
            current.append(line)
    return runs


async def test_helm_applier_runs_the_upgrade_on_the_release(tmp_path):
    settings = load_settings({**HELM, "HELM_BIN": str(fake_helm(tmp_path))})
    result = await HelmApplier(settings).apply("search-service", "2.0.0", "op-123")

    (args,) = recorded(tmp_path)
    assert args[:3] == ["upgrade", "sample-app", "oci://registry/charts/sample-app"]
    assert args[args.index("--namespace") + 1] == "sample-app"
    assert "--reuse-values" in args
    assert args[args.index("--set-string") + 1] == "searchService.image.tag=2.0.0"
    assert args[args.index("--version") + 1] == "0.1.0"
    assert "op-123" in args[args.index("--description") + 1]
    # It changes one value on the release, and nothing else.
    assert "--install" not in args and "--force" not in args and "--set" not in args
    assert "sample-app" in result.detail


async def test_helm_applier_plain_http_registry(tmp_path):
    env = {**HELM, "HELM_BIN": str(fake_helm(tmp_path)), "HELM_PLAIN_HTTP": "true"}
    command = HelmApplier(load_settings(env)).upgrade_command("search-service", "2.0.0", "op-1")
    assert "--plain-http" in command
    plain = HelmApplier(load_settings(HELM)).upgrade_command("search-service", "2.0.0", "op-1")
    assert "--plain-http" not in plain


async def test_helm_applier_reports_a_failed_upgrade(tmp_path):
    helm = fake_helm(tmp_path, exit_code=1, stderr="Error: UPGRADE FAILED: forbidden")
    settings = load_settings({**HELM, "HELM_BIN": str(helm)})
    with pytest.raises(ApplyError, match="UPGRADE FAILED"):
        await HelmApplier(settings).apply("search-service", "2.0.0", "op-1")


async def test_helm_applier_refuses_what_is_not_a_version_or_a_selectable_service(tmp_path):
    settings = load_settings({**HELM, "HELM_BIN": str(fake_helm(tmp_path))})
    applier = HelmApplier(settings)
    with pytest.raises(ApplyError):
        await applier.apply("search-service", "2.0.0,web.image.tag=evil", "op-1")
    with pytest.raises(ApplyError):
        await applier.apply("registration-service", "2.0.0", "op-1")
    assert not (tmp_path / "args").exists()


async def test_helm_applier_reads_the_current_version(tmp_path):
    values = json.dumps({"searchService": {"image": {"tag": "2.1.0"}}})
    settings = load_settings({**HELM, "HELM_BIN": str(fake_helm(tmp_path, stdout=values))})
    applier = HelmApplier(settings)
    assert await applier.current_version("search-service") == "2.1.0"
    assert await applier.current_version("registration-service") is None
    (args,) = recorded(tmp_path)
    assert args[:3] == ["get", "values", "sample-app"]


async def test_helm_applier_without_a_binary_is_an_apply_error(tmp_path):
    settings = load_settings({**HELM, "HELM_BIN": str(tmp_path / "no-such-helm")})
    with pytest.raises(ApplyError, match="could not run"):
        await HelmApplier(settings).apply("search-service", "2.0.0", "op-1")


# -- search check -----------------------------------------------------------


def search(responses: list[httpx.Response], seen: list[httpx.Request]) -> httpx.MockTransport:
    def handler(request: httpx.Request) -> httpx.Response:
        seen.append(request)
        return responses[min(len(seen) - 1, len(responses) - 1)]

    return httpx.MockTransport(handler)


def verifier(transport: httpx.MockTransport, timeout: float = 0.2) -> SearchVerifier:
    return SearchVerifier(
        "http://search/search?q=kubernetes",
        timeout_seconds=timeout,
        interval_seconds=0.01,
        transport=transport,
    )


async def test_search_check_passes_on_200_with_a_result():
    seen: list[httpx.Request] = []
    ok = httpx.Response(200, json={"results": [{"id": 1}]})
    outcome = await verifier(search([ok], seen)).verify("search-service")
    assert outcome.ok and outcome.attempts == 1
    assert str(seen[0].url) == "http://search/search?q=kubernetes" and seen[0].method == "GET"


async def test_search_check_accepts_a_bare_list():
    outcome = await verifier(search([httpx.Response(200, json=[{"id": 1}])], [])).verify("s")
    assert outcome.ok


async def test_search_check_retries_until_the_rollout_reaches_the_new_pods():
    seen: list[httpx.Request] = []
    responses = [
        httpx.Response(500, json={"error": "search failed"}),
        httpx.Response(500, json={"error": "search failed"}),
        httpx.Response(200, json={"results": [{"id": 1}, {"id": 2}]}),
    ]
    outcome = await verifier(search(responses, seen), timeout=2).verify("search-service")
    assert outcome.ok and outcome.attempts == 3
    assert "2 result" in outcome.detail


async def test_search_check_reads_the_search_service_response_shape():
    # The shape components/sample-app/search-service answers with.
    body = {
        "query": "red",
        "count": 1,
        "indexed": 500,
        "results": [{"id": "R-1"}],
        "title": "Catalog",
        "version": "2.0.0",
    }
    outcome = await verifier(search([httpx.Response(200, json=body)], [])).verify("s")
    assert outcome.ok and "reports version 2.0.0" in outcome.detail


@pytest.mark.parametrize(
    ("response", "reason"),
    [
        (httpx.Response(500, json={"error": "x"}), "status 500"),
        (httpx.Response(200, json={"results": []}), "zero results"),
        (httpx.Response(200, json={"ok": True}), "no result list"),
        (httpx.Response(200, text="<html>"), "not JSON"),
    ],
)
async def test_search_check_fails_after_a_bounded_time(response, reason):
    seen: list[httpx.Request] = []
    outcome = await verifier(search([response], seen)).verify("search-service")
    assert not outcome.ok
    assert reason in outcome.detail
    assert 1 < outcome.attempts == len(seen) < 100


async def test_search_check_fails_when_the_service_is_unreachable():
    def refuse(request: httpx.Request) -> httpx.Response:
        raise httpx.ConnectError("connection refused")

    outcome = await verifier(httpx.MockTransport(refuse)).verify("search-service")
    assert not outcome.ok and "ConnectError" in outcome.detail


# -- pod restart ------------------------------------------------------------


def service_account(tmp_path: Path) -> Path:
    (tmp_path / "token").write_text("sa-token\n")
    return tmp_path


async def test_restart_deletes_pods_by_label_in_one_namespace(tmp_path):
    seen: list[httpx.Request] = []

    def handler(request: httpx.Request) -> httpx.Response:
        seen.append(request)
        return httpx.Response(200, json={"kind": "PodList", "items": [{}, {}]})

    restarter = KubernetesRestarter(
        "sample-app",
        api_url="https://kubernetes.default.svc",
        service_account_dir=service_account(tmp_path),
        transport=httpx.MockTransport(handler),
    )
    result = await restarter.restart("app.kubernetes.io/name=search-service")

    (request,) = seen
    assert request.method == "DELETE"
    assert request.url.path == "/api/v1/namespaces/sample-app/pods"
    assert request.url.params["labelSelector"] == "app.kubernetes.io/name=search-service"
    assert request.headers["authorization"] == "Bearer sa-token"
    assert result.pods_deleted == 2 and result.namespace == "sample-app"


async def test_restart_reports_a_refusal_from_the_api(tmp_path):
    restarter = KubernetesRestarter(
        "sample-app",
        api_url="https://kubernetes.default.svc",
        service_account_dir=service_account(tmp_path),
        transport=httpx.MockTransport(lambda r: httpx.Response(403, json={"reason": "Forbidden"})),
    )
    with pytest.raises(RestartError, match="403"):
        await restarter.restart("app.kubernetes.io/name=search-service")


async def test_restart_without_a_service_account_token(tmp_path):
    restarter = KubernetesRestarter(
        "sample-app", api_url="https://k", service_account_dir=tmp_path / "missing"
    )
    with pytest.raises(RestartError, match="token"):
        await restarter.restart("app.kubernetes.io/name=search-service")


# -- state ------------------------------------------------------------------


def test_state_survives_a_restart_and_in_flight_changes_are_not_called_applied(tmp_path):
    path = str(tmp_path / "delivery.db")
    store = Store(path)
    incident = store.create_incident(
        service="search-service", severity="sev2", summary="s", impact="i", opened_by="alert"
    )
    change = store.create_change(
        incident_id=incident["incident_id"],
        service="search-service",
        target_version="2.0.0",
        previous_version="2.1.0",
        operation_id="op-1",
        proposed_by="developer",
    )
    store.transition_change(change["change_id"], "approved", only_from=("proposed",))
    store.transition_change(change["change_id"], "applying", only_from=("approved",))
    store.close()

    # A new process opens the same file.
    reopened = Store(path)
    service = DeliveryService(
        store=reopened,
        applier=None,
        verifier=None,
        restarter=None,  # type: ignore[arg-type]
        retained_versions=("2.0.0",),
    )
    assert service.fail_interrupted() == 1
    after = reopened.get_change(change["change_id"])
    assert after is not None
    assert after["status"] == "failed" and "restarted" in after["detail"]
    assert reopened.get_incident(incident["incident_id"])["status"] == "open"  # type: ignore[index]


def test_a_status_change_names_the_status_it_leaves():
    store = Store()
    incident = store.create_incident(
        service="search-service", severity="sev2", summary="s", impact="i", opened_by="alert"
    )
    change = store.create_change(
        incident_id=incident["incident_id"],
        service="search-service",
        target_version="2.0.0",
        previous_version=None,
        operation_id="op-1",
        proposed_by="developer",
    )
    # Not approved, so it cannot be taken into applying.
    assert not store.transition_change(change["change_id"], "applying", only_from=("approved",))
    assert store.get_change(change["change_id"])["status"] == "proposed"  # type: ignore[index]
