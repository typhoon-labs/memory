"""The configuration file and the environment: what is read, the defaults, and what is refused."""

from __future__ import annotations

import copy
from pathlib import Path

import pytest
import yaml
from conftest import EXAMPLE_CONFIG

from chain_sts.config import (
    IN_CLUSTER_CA_FILE,
    IN_CLUSTER_TOKEN_FILE,
    ConfigError,
    load_config,
    load_settings,
)

EXAMPLE = yaml.safe_load(EXAMPLE_CONFIG.read_text())


def load(tmp_path: Path, raw: dict, env: dict | None = None):
    path = tmp_path / "config.yaml"
    path.write_text(yaml.safe_dump(raw))
    return load_config(path, env=env or {})


def changed(change) -> dict:
    raw = copy.deepcopy(EXAMPLE)
    change(raw)
    return raw


def test_example_loads():
    config = load_config(EXAMPLE_CONFIG, env={})
    assert config.issuer == config.public_url
    assert config.audiences == ("agentgateway",)
    assert config.actor.verify_with == "token_review"
    # The API server's audience is off by default.
    assert config.actor.audiences == ("chain-sts",)
    assert config.actor.token_review.api_server == "https://kubernetes.default.svc"
    assert config.by_service_account["system:serviceaccount:agents:chat-assistant"].act_for_users
    assert config.agents["remediation-agent"].after == {"chat-assistant"}
    # Only chat-assistant may exchange a user's token for the Chat UI's audience.
    assert config.agents["chat-assistant"].subject_audiences == ("agentgateway", "chat-assistant")
    assert config.agents["remediation-agent"].subject_audiences == ()


def test_defaults(tmp_path):
    raw = {
        "issuer": "https://sts.example/",
        "signing_key_file": "key.pem",
        "audiences": ["agentgateway"],
        "subject_issuers": [
            {
                "issuer": "https://idp.example",
                "jwks_url": "https://idp.example/keys",
                "audience": "a",
            }
        ],
        "actor": {},
        "agents": {"one": {"service_account": "system:serviceaccount:agents:one"}},
    }
    env = {"KUBERNETES_SERVICE_HOST": "10.96.0.1", "KUBERNETES_SERVICE_PORT": "443"}
    config = load(tmp_path, raw, env)
    assert config.public_url == "https://sts.example"
    assert (config.token_ttl_seconds, config.max_chain) == (300, 4)
    assert config.carry_claims == ("preferred_username", "roles", "team", "email", "name")
    assert config.require_may_act is False
    # A relative path is relative to the file.
    assert config.signing_keys.files == {"signing_key_file": tmp_path / "key.pem"}
    review = config.actor.token_review
    assert review.api_server == "https://10.96.0.1:443"
    assert (str(review.token_file), str(review.ca_file)) == (
        IN_CLUSTER_TOKEN_FILE,
        IN_CLUSTER_CA_FILE,
    )
    assert config.actor.jwks is None
    agent = config.agents["one"]
    assert (agent.act_for_users, agent.after) == (False, frozenset())
    assert agent.subject_audiences == ()


def test_api_server_on_ipv6(tmp_path):
    env = {"KUBERNETES_SERVICE_HOST": "fd00::1", "KUBERNETES_SERVICE_PORT": "6443"}
    raw = changed(lambda r: r["actor"].pop("token_review"))
    assert load(tmp_path, raw, env).actor.token_review.api_server == "https://[fd00::1]:6443"


def test_jwks_chosen(tmp_path):
    def jwks(raw):
        raw["actor"]["verify_with"] = "jwks"
        raw["actor"]["jwks"] = {"issuer": "https://k8s", "jwks_url": "https://k8s/openid/v1/jwks"}

    config = load(tmp_path, changed(jwks))
    assert config.actor.jwks.jwks_url == "https://k8s/openid/v1/jwks"
    assert config.actor.jwks.jwks_file is None


def test_jwks_from_the_api_server(tmp_path):
    def jwks(raw):
        raw["actor"]["verify_with"] = "jwks"
        raw["actor"]["jwks"] = {
            "issuer": "https://kubernetes.default.svc.cluster.local",
            "jwks_url": "https://kubernetes.default.svc/openid/v1/jwks",
            "token_file": IN_CLUSTER_TOKEN_FILE,
            "ca_file": "ca.crt",
        }

    keys = load(tmp_path, changed(jwks)).actor.jwks
    assert str(keys.token_file) == IN_CLUSTER_TOKEN_FILE
    # A relative path is relative to the file.
    assert keys.ca_file == tmp_path / "ca.crt"


def test_jwks_bearer_and_ca_are_optional(tmp_path):
    def jwks(raw):
        raw["actor"]["jwks"] = {"issuer": "https://k8s", "jwks_url": "https://k8s/openid/v1/jwks"}

    keys = load(tmp_path, changed(jwks)).actor.jwks
    assert (keys.token_file, keys.ca_file) == (None, None)


def drop(*keys):
    def change(raw):
        section = raw
        for key in keys[:-1]:
            section = section[key]
        del section[keys[-1]]

    return change


def put(value, *keys):
    def change(raw):
        section = raw
        for key in keys[:-1]:
            section = section[key]
        section[keys[-1]] = value

    return change


@pytest.mark.parametrize(
    ("change", "message"),
    [
        (drop("issuer"), "issuer is required"),
        (put("chain-sts", "issuer"), "issuer must be an http or https URL"),
        (drop("signing_key_file"), "signing_key_file is required"),
        (put([], "audiences"), "audiences must name at least one"),
        (put(["a", "a"], "audiences"), "audiences names a value twice"),
        (put(0, "token_ttl_seconds"), "token_ttl_seconds must be a whole number of at least 1"),
        (put("4", "max_chain"), "max_chain must be a whole number"),
        (put("no", "require_may_act"), "require_may_act must be true or false"),
        (put(["roles", "act"], "carry_claims"), "may not name claims the service sets: ['act']"),
        (put(True, "require_mayact"), "unknown keys ['require_mayact']"),
        (put([], "subject_issuers"), "subject_issuers must name at least one"),
        (put({"x": 1}, "subject_issuers", 0, "extra"), "subject_issuers[0]: unknown keys"),
        (drop("actor"), "actor is required"),
        (put("both", "actor", "verify_with"), "actor.verify_with must be one of"),
        (put([], "actor", "audiences"), "actor.audiences must name at least one"),
        (put(1, "actor", "token_review", "port"), "actor.token_review: unknown keys ['port']"),
        (
            put("https://k8s/jwks", "actor", "jwks", "jwks_url"),
            "exactly one of jwks_file and jwks_url",
        ),
        # A bearer token is never sent to a file or in clear.
        (put("token", "actor", "jwks", "token_file"), "need an https jwks_url"),
        (put("ca.crt", "actor", "jwks", "ca_file"), "need an https jwks_url"),
        (
            lambda raw: raw["actor"].update(
                jwks={"issuer": "i", "jwks_url": "http://k8s/jwks", "token_file": "token"}
            ),
            "need an https jwks_url",
        ),
        (put({}, "agents"), "agents must name at least one agent"),
        (
            put("agents:chat-assistant", "agents", "chat-assistant", "service_account"),
            "must read system:serviceaccount:<namespace>:<name>",
        ),
        (put(["nobody"], "agents", "comms-agent", "after"), "names unknown agents ['nobody']"),
        (
            put(
                "system:serviceaccount:agents:chat-assistant",
                "agents",
                "comms-agent",
                "service_account",
            ),
            "name the same service account",
        ),
        (put("yes", "agents", "chat-assistant", "act_for_users"), "must be true or false"),
        (
            put([], "agents", "chat-assistant", "subject_audiences"),
            "agents.chat-assistant.subject_audiences must name at least one audience",
        ),
        (
            put("chat-assistant", "agents", "chat-assistant", "subject_audiences"),
            "must be a list of non-empty strings",
        ),
        # Only a user's own token is checked against them.
        (
            put(["chat-assistant"], "agents", "comms-agent", "subject_audiences"),
            "agents.comms-agent.subject_audiences needs act_for_users",
        ),
    ],
)
def test_refused(tmp_path, change, message):
    with pytest.raises(ConfigError, match=None) as raised:
        load(tmp_path, changed(change))
    assert message in str(raised.value)


def test_own_issuer_is_not_a_subject_issuer(tmp_path):
    def same(raw):
        raw["subject_issuers"][0]["issuer"] = raw["issuer"]

    with pytest.raises(ConfigError, match="own issuer"):
        load(tmp_path, changed(same))


def test_jwks_chosen_without_its_settings(tmp_path):
    def jwks(raw):
        raw["actor"]["verify_with"] = "jwks"
        del raw["actor"]["jwks"]

    with pytest.raises(ConfigError, match="actor.jwks is required"):
        load(tmp_path, changed(jwks))


def test_unreadable_files(tmp_path):
    with pytest.raises(ConfigError, match="cannot read"):
        load_config(tmp_path / "missing.yaml", env={})
    bad = tmp_path / "bad.yaml"
    bad.write_text("issuer: [unclosed")
    with pytest.raises(ConfigError, match="not valid YAML"):
        load_config(bad, env={})
    bad.write_text("- a list")
    with pytest.raises(ConfigError, match="must be a mapping"):
        load_config(bad, env={})


# -- the environment ----------------------------------------------------------


def test_settings():
    settings = load_settings({"CHAIN_STS_CONFIG": "/etc/chain-sts/config.yaml", "PORT": "18190"})
    assert settings.config_file == Path("/etc/chain-sts/config.yaml")
    assert (settings.host, settings.port) == ("127.0.0.1", 18190)
    assert (settings.app_version, settings.environment, settings.log_level) == (
        "0.1.0",
        "dev",
        "INFO",
    )


@pytest.mark.parametrize(
    ("env", "message"),
    [
        ({}, "CHAIN_STS_CONFIG"),
        ({"CHAIN_STS_CONFIG": "c.yaml", "PORT": "http"}, "PORT"),
        ({"CHAIN_STS_CONFIG": "c.yaml", "LOG_LEVEL": "loud"}, "LOG_LEVEL"),
    ],
)
def test_settings_refused(env, message):
    with pytest.raises(ConfigError, match=message):
        load_settings(env)
