"""Configuration: the process's settings from the environment, the service's from one YAML file.

As in every component here, where to listen and which version runs come from
the environment. What the service decides with (its issuer, the issuers it
trusts, the agents and who may act after whom) is one YAML file, named by
CHAIN_STS_CONFIG and kept in Git. config.example.yaml describes every key.
A relative path in the file is relative to the file.

A key the service does not know is an error, so that a misspelled rule cannot
be silently ignored.
"""

from __future__ import annotations

import os
import re
from collections.abc import Callable, Mapping
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import yaml

SERVICE_NAME = "chain-sts"

# The audience of a service-account token minted for this service alone.
DEFAULT_ACTOR_AUDIENCE = "chain-sts"
# Where every pod finds its own service-account token and the cluster's CA.
IN_CLUSTER_TOKEN_FILE = "/var/run/secrets/kubernetes.io/serviceaccount/token"
IN_CLUSTER_CA_FILE = "/var/run/secrets/kubernetes.io/serviceaccount/ca.crt"
DEFAULT_CARRY_CLAIMS = ("preferred_username", "roles", "team", "email", "name")
# Claims the service sets itself; copying them from the subject would replace its own.
ISSUED_CLAIMS = frozenset(
    {"iss", "sub", "aud", "iat", "nbf", "exp", "jti", "client_id", "act", "may_act"}
)
VERIFY_WITH = ("token_review", "jwks")
LOG_LEVELS = ("DEBUG", "INFO", "WARNING", "ERROR", "CRITICAL")

SERVICE_ACCOUNT = re.compile(
    r"^system:serviceaccount:[a-z0-9]([-a-z0-9]*[a-z0-9])?:[a-z0-9]([-.a-z0-9]*[a-z0-9])?$"
)

_REQUIRED: Any = object()


class ConfigError(RuntimeError):
    """The configuration does not describe a service that can run."""


@dataclass(frozen=True)
class Agent:
    name: str
    service_account: str
    # May be the first agent on a user's own token.
    act_for_users: bool
    # The agents whose token this agent may exchange, by name.
    after: frozenset[str]
    # The audiences a user's own token may carry for this agent to exchange
    # it. Empty: the audience of the identity provider that issued it.
    subject_audiences: tuple[str, ...] = ()


@dataclass(frozen=True)
class SubjectIssuer:
    issuer: str
    jwks_url: str
    audience: str


@dataclass(frozen=True)
class TokenReviewSettings:
    api_server: str
    token_file: Path
    ca_file: Path
    timeout_seconds: float


@dataclass(frozen=True)
class JwksSettings:
    issuer: str
    jwks_file: Path | None
    jwks_url: str | None
    # With jwks_url only: a file whose token is sent as the bearer of each
    # fetch, and the CA the URL's certificate must chain to. The API server
    # serves its keys only to an authenticated caller, over its own CA.
    token_file: Path | None = None
    ca_file: Path | None = None


@dataclass(frozen=True)
class ActorSettings:
    verify_with: str
    audiences: tuple[str, ...]
    token_review: TokenReviewSettings | None
    jwks: JwksSettings | None


@dataclass(frozen=True)
class SigningKeys:
    """The service's own keys, by name, and what each does. Every key is published in /jwks."""

    files: Mapping[str, Path]
    # The key that signs every token.
    sign: str
    # Published before it signs, so that verifiers learn it first.
    next: str | None = None
    # Published after it stopped signing, until every token it signed has expired.
    previous: str | None = None


@dataclass(frozen=True)
class Config:
    issuer: str
    public_url: str
    signing_keys: SigningKeys
    token_ttl_seconds: int
    max_chain: int
    audiences: tuple[str, ...]
    carry_claims: tuple[str, ...]
    require_may_act: bool
    subject_issuers: Mapping[str, SubjectIssuer]
    actor: ActorSettings
    agents: Mapping[str, Agent]
    by_service_account: Mapping[str, Agent]


@dataclass(frozen=True)
class Settings:
    """The process's settings, from the environment."""

    config_file: Path
    host: str
    port: int
    app_version: str
    environment: str
    log_level: str


def load_settings(env: Mapping[str, str] | None = None) -> Settings:
    env = os.environ if env is None else env

    def get(name: str, default: str = "") -> str:
        return (env.get(name) or default).strip()

    config_file = get("CHAIN_STS_CONFIG")
    if not config_file:
        raise ConfigError("CHAIN_STS_CONFIG must name the configuration file")
    try:
        port = int(get("PORT", "8080"))
    except ValueError:
        raise ConfigError("PORT must be a number") from None
    log_level = get("LOG_LEVEL", "INFO").upper()
    if log_level not in LOG_LEVELS:
        raise ConfigError(f"LOG_LEVEL must be one of {list(LOG_LEVELS)}")
    return Settings(
        config_file=Path(config_file),
        host=get("HOST", "127.0.0.1"),
        port=port,
        app_version=get("APP_VERSION", "0.1.0"),
        environment=get("DEPLOYMENT_ENVIRONMENT", "dev"),
        log_level=log_level,
    )


class _Section:
    """One mapping of the YAML file: typed reads, and a check for keys nobody read."""

    def __init__(self, raw: Any, where: str) -> None:
        if not isinstance(raw, dict):
            raise ConfigError(f"{where or 'the configuration'} must be a mapping")
        self._raw = raw
        self._where = where
        self._read: set[str] = set()

    def _path(self, key: str) -> str:
        return f"{self._where}.{key}" if self._where else key

    def _get(self, key: str, default: Any) -> Any:
        self._read.add(key)
        value = self._raw.get(key)
        if value is None and default is _REQUIRED:
            raise ConfigError(f"{self._path(key)} is required")
        return value

    def text(self, key: str, default: Any = _REQUIRED) -> Any:
        value = self._get(key, default)
        if value is None:
            return default
        if not isinstance(value, str) or not value.strip():
            raise ConfigError(f"{self._path(key)} must be a non-empty string")
        return value.strip()

    def url(self, key: str, default: Any = _REQUIRED) -> Any:
        value = self.text(key, default)
        if isinstance(value, str) and not value.startswith(("http://", "https://")):
            raise ConfigError(f"{self._path(key)} must be an http or https URL")
        return value

    def integer(self, key: str, default: int, minimum: int) -> int:
        value = self._get(key, default)
        if value is None:
            return default
        if isinstance(value, bool) or not isinstance(value, int) or value < minimum:
            raise ConfigError(f"{self._path(key)} must be a whole number of at least {minimum}")
        return value

    def number(self, key: str, default: float) -> float:
        value = self._get(key, default)
        if value is None:
            return default
        if isinstance(value, bool) or not isinstance(value, int | float) or value <= 0:
            raise ConfigError(f"{self._path(key)} must be a positive number")
        return float(value)

    def flag(self, key: str, default: bool) -> bool:
        value = self._get(key, default)
        if value is None:
            return default
        if not isinstance(value, bool):
            raise ConfigError(f"{self._path(key)} must be true or false")
        return value

    def texts(self, key: str, default: Any = _REQUIRED) -> tuple[str, ...]:
        value = self._get(key, default)
        if value is None:
            return tuple(default)
        if not isinstance(value, list) or not all(isinstance(v, str) and v.strip() for v in value):
            raise ConfigError(f"{self._path(key)} must be a list of non-empty strings")
        values = tuple(v.strip() for v in value)
        if len(set(values)) != len(values):
            raise ConfigError(f"{self._path(key)} names a value twice")
        return values

    def section(self, key: str, default: Any = _REQUIRED) -> _Section | None:
        value = self._get(key, default)
        return None if value is None else _Section(value, self._path(key))

    def sections(self, key: str) -> list[_Section]:
        value = self._get(key, _REQUIRED)
        if not isinstance(value, list):
            raise ConfigError(f"{self._path(key)} must be a list")
        return [_Section(item, f"{self._path(key)}[{i}]") for i, item in enumerate(value)]

    def named_sections(self, key: str) -> dict[str, _Section]:
        value = self._get(key, _REQUIRED)
        if not isinstance(value, dict):
            raise ConfigError(f"{self._path(key)} must be a mapping of names")
        return {
            str(name): _Section(item, f"{self._path(key)}.{name}") for name, item in value.items()
        }

    def named_texts(self, key: str) -> dict[str, str]:
        value = self._get(key, _REQUIRED)
        if not isinstance(value, dict) or not all(
            isinstance(v, str) and v.strip() for v in value.values()
        ):
            raise ConfigError(f"{self._path(key)} must map names to non-empty strings")
        return {str(name): item.strip() for name, item in value.items()}

    def finish(self) -> None:
        unknown = sorted(str(k) for k in self._raw if k not in self._read)
        if unknown:
            raise ConfigError(f"{self._where or 'the configuration'}: unknown keys {unknown}")


def default_api_server(env: Mapping[str, str]) -> str:
    """The API server's address inside a pod, from the variables Kubernetes sets."""
    host = (env.get("KUBERNETES_SERVICE_HOST") or "").strip()
    port = (env.get("KUBERNETES_SERVICE_PORT") or "443").strip()
    if not host:
        return "https://kubernetes.default.svc"
    return f"https://[{host}]:{port}" if ":" in host else f"https://{host}:{port}"


def load_config(path: str | Path, env: Mapping[str, str] | None = None) -> Config:
    """Read and check the configuration. No other file is read here."""
    env = os.environ if env is None else env
    path = Path(path)
    try:
        raw = yaml.safe_load(path.read_text(encoding="utf-8"))
    except OSError as exc:
        raise ConfigError(f"cannot read {path}: {exc.strerror or exc}") from exc
    except yaml.YAMLError as exc:
        raise ConfigError(f"{path} is not valid YAML: {exc}") from exc
    base = path.resolve().parent

    def file(value: str) -> Path:
        candidate = Path(value)
        return candidate if candidate.is_absolute() else base / candidate

    root = _Section(raw, "")
    issuer = root.url("issuer")
    public_url = root.url("public_url", issuer).rstrip("/")
    signing_keys = _signing_keys(root, file)
    token_ttl_seconds = root.integer("token_ttl_seconds", 300, minimum=1)
    max_chain = root.integer("max_chain", 4, minimum=1)
    audiences = root.texts("audiences")
    if not audiences:
        raise ConfigError("audiences must name at least one audience")
    carry_claims = root.texts("carry_claims", DEFAULT_CARRY_CLAIMS)
    reserved = sorted(set(carry_claims) & ISSUED_CLAIMS)
    if reserved:
        raise ConfigError(f"carry_claims may not name claims the service sets: {reserved}")
    require_may_act = root.flag("require_may_act", False)

    subject_issuers: dict[str, SubjectIssuer] = {}
    for section in root.sections("subject_issuers"):
        subject = SubjectIssuer(
            issuer=section.text("issuer"),
            jwks_url=section.url("jwks_url"),
            audience=section.text("audience"),
        )
        section.finish()
        if subject.issuer in subject_issuers:
            raise ConfigError(f"subject_issuers names {subject.issuer} twice")
        if subject.issuer == issuer:
            raise ConfigError("subject_issuers may not name this service's own issuer")
        subject_issuers[subject.issuer] = subject
    if not subject_issuers:
        raise ConfigError("subject_issuers must name at least one identity provider")

    actor = _actor(root.section("actor"), env, file)
    agents = _agents(root.named_sections("agents"))
    root.finish()

    return Config(
        issuer=issuer,
        public_url=public_url,
        signing_keys=signing_keys,
        token_ttl_seconds=token_ttl_seconds,
        max_chain=max_chain,
        audiences=audiences,
        carry_claims=carry_claims,
        require_may_act=require_may_act,
        subject_issuers=subject_issuers,
        actor=actor,
        agents=agents,
        by_service_account={a.service_account: a for a in agents.values()},
    )


def _actor(
    section: _Section | None, env: Mapping[str, str], file: Callable[[str], Path]
) -> ActorSettings:
    if section is None:
        raise ConfigError("actor is required")
    verify_with = section.text("verify_with", "token_review")
    if verify_with not in VERIFY_WITH:
        raise ConfigError(f"actor.verify_with must be one of {list(VERIFY_WITH)}")
    audiences = section.texts("audiences", (DEFAULT_ACTOR_AUDIENCE,))
    if not audiences:
        raise ConfigError("actor.audiences must name at least one audience")

    token_review = None
    review = section.section("token_review", None)
    if review is None and verify_with == "token_review":
        review = _Section({}, "actor.token_review")
    if review is not None:
        token_review = TokenReviewSettings(
            api_server=review.url("api_server", default_api_server(env)).rstrip("/"),
            token_file=file(review.text("token_file", IN_CLUSTER_TOKEN_FILE)),
            ca_file=file(review.text("ca_file", IN_CLUSTER_CA_FILE)),
            timeout_seconds=review.number("timeout_seconds", 5.0),
        )
        review.finish()

    jwks = None
    keys = section.section("jwks", None)
    if keys is None and verify_with == "jwks":
        raise ConfigError("actor.jwks is required when actor.verify_with is jwks")
    if keys is not None:
        jwks_file = keys.text("jwks_file", None)
        jwks_url = keys.url("jwks_url", None)
        if (jwks_file is None) == (jwks_url is None):
            raise ConfigError("actor.jwks needs exactly one of jwks_file and jwks_url")
        token_file = keys.text("token_file", None)
        ca_file = keys.text("ca_file", None)
        if (token_file or ca_file) and not (jwks_url or "").startswith("https://"):
            # A bearer token is never sent in clear, and a file needs no CA.
            raise ConfigError("actor.jwks.token_file and ca_file need an https jwks_url")
        jwks = JwksSettings(
            issuer=keys.text("issuer"),
            jwks_file=file(jwks_file) if jwks_file else None,
            jwks_url=jwks_url,
            token_file=file(token_file) if token_file else None,
            ca_file=file(ca_file) if ca_file else None,
        )
        keys.finish()

    section.finish()
    return ActorSettings(
        verify_with=verify_with, audiences=audiences, token_review=token_review, jwks=jwks
    )


def _agents(sections: dict[str, _Section]) -> dict[str, Agent]:
    if not sections:
        raise ConfigError("agents must name at least one agent")
    agents: dict[str, Agent] = {}
    for name, section in sections.items():
        service_account = section.text("service_account")
        if not SERVICE_ACCOUNT.match(service_account):
            raise ConfigError(
                f"agents.{name}.service_account must read system:serviceaccount:<namespace>:<name>"
            )
        act_for_users = section.flag("act_for_users", False)
        subject_audiences = section.texts("subject_audiences", ())
        if "subject_audiences" in section._raw:
            if not subject_audiences:
                raise ConfigError(
                    f"agents.{name}.subject_audiences must name at least one audience"
                )
            if not act_for_users:
                # Only a user's own token is checked against them.
                raise ConfigError(f"agents.{name}.subject_audiences needs act_for_users")
        agents[name] = Agent(
            name=name,
            service_account=service_account,
            act_for_users=act_for_users,
            after=frozenset(section.texts("after", ())),
            subject_audiences=subject_audiences,
        )
        section.finish()
    seen: dict[str, str] = {}
    for agent in agents.values():
        unknown = agent.after - agents.keys()
        if unknown:
            raise ConfigError(f"agents.{agent.name}.after names unknown agents {sorted(unknown)}")
        if agent.service_account in seen:
            raise ConfigError(
                f"agents {seen[agent.service_account]} and {agent.name}"
                " name the same service account"
            )
        seen[agent.service_account] = agent.name
    return agents


def _signing_keys(root: _Section, file: Callable[[str], Path]) -> SigningKeys:
    """`signing_key_file`, one key that signs; or `signing_keys`, several, for a rotation."""
    single = root.text("signing_key_file", None)
    section = root.section("signing_keys", None)
    if single is not None and section is not None:
        raise ConfigError("signing_key_file and signing_keys exclude each other: name one")
    if section is None:
        if single is None:
            raise ConfigError("signing_key_file is required, or signing_keys for a rotation")
        return SigningKeys(files={"signing_key_file": file(single)}, sign="signing_key_file")

    files = {name: file(path) for name, path in section.named_texts("files").items()}
    roles = {
        "sign": section.text("sign"),
        "next": section.text("next", None),
        "previous": section.text("previous", None),
    }
    section.finish()
    if not files:
        raise ConfigError("signing_keys.files must name at least one key")
    named: dict[str, str] = {}
    for role, name in roles.items():
        if name is None:
            continue
        if name not in files:
            raise ConfigError(f"signing_keys.{role} names {name}, which signing_keys.files lacks")
        if name in named:
            raise ConfigError(f"signing_keys.{named[name]} and .{role} both name {name}")
        named[name] = role
    unused = sorted(files.keys() - named.keys())
    if unused:
        raise ConfigError(
            f"signing_keys.files: {unused} have no role; name each as sign, next or previous,"
            " or remove it"
        )
    return SigningKeys(files=files, **roles)
