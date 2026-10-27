"""Stand-ins for everything the service talks to, and the service on a port the OS picks.

- `IdentityProvider` stands in for Keycloak: a key, its JWKS over HTTP, and
  user tokens with the claims of the contracts.
- `Cluster` stands in for the cluster's service-account issuer: a key, its
  JWKS as a file, and service-account tokens. It also answers TokenReviews the
  way the API server does.
- `ApiServer` serves those TokenReviews, and the cluster's keys at
  `/openid/v1/jwks`, over HTTPS with a CA made for the test session, and only
  to a caller that presents the reviewer's own token.

Every key and certificate is made when the session starts and lives in a
temporary directory. Nothing outside this machine is called.
"""

from __future__ import annotations

import base64
import copy
import ipaddress
import json
import socket
import ssl
import threading
import time
import uuid
from collections.abc import Callable, Iterator
from dataclasses import dataclass, field
from datetime import UTC, datetime, timedelta
from functools import cached_property
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any

import httpx
import jwt
import pytest
import uvicorn
import yaml
from cryptography import x509
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import ec, rsa
from cryptography.x509.oid import ExtendedKeyUsageOID, NameOID

from chain_sts.app import create_app
from chain_sts.config import load_config
from chain_sts.oauth import JWT_TYPE, TOKEN_EXCHANGE
from chain_sts.service import TokenService

COMPONENT = Path(__file__).resolve().parent.parent
EXAMPLE_CONFIG = COMPONENT / "config.example.yaml"

AUDIENCE = "agentgateway"
ACTOR_AUDIENCE = "chain-sts"
# Where the API server serves the service-account issuer's keys.
JWKS_PATH = "/openid/v1/jwks"
CLUSTER_ISSUER = "https://kubernetes.default.svc.cluster.local"
# On kind the API server's audience is its issuer.
API_SERVER_AUDIENCE = CLUSTER_ISSUER


def service_account(name: str, namespace: str = "agents") -> str:
    return f"system:serviceaccount:{namespace}:{name}"


CHAT = service_account("chat-assistant")
REMEDIATION = service_account("remediation-agent")
COMMS = service_account("comms-agent")
# A test-only agent: may act for users, and is named in no may_act.
PROBE = service_account("default")
# This service's own account: the bearer of its TokenReviews.
REVIEWER = service_account("chain-sts", namespace="agentgateway-system")

# The users of docs/contracts.md.
USERS = {
    "developer": (["developer"], "search"),
    "incident-manager": (["incident-manager"], "incident"),
    "platform-engineer": (["platform-engineer"], "platform"),
}


def b64url(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode()


def unverified(token: str) -> dict[str, Any]:
    return jwt.decode(token, options={"verify_signature": False})


def unused_port_url(path: str = "/") -> str:
    """A URL nothing listens on: a port the OS handed out and that is closed again."""
    with socket.socket() as s:
        s.bind(("127.0.0.1", 0))
        port = s.getsockname()[1]
    return f"http://127.0.0.1:{port}{path}"


def rsa_key() -> rsa.RSAPrivateKey:
    return rsa.generate_private_key(public_exponent=65537, key_size=2048)


def write_pem(key: Any, path: Path) -> Path:
    path.write_bytes(
        key.private_bytes(
            serialization.Encoding.PEM,
            serialization.PrivateFormat.PKCS8,
            serialization.NoEncryption(),
        )
    )
    return path


def public_jwks(key: rsa.RSAPrivateKey, kid: str) -> dict[str, Any]:
    jwk = jwt.algorithms.RSAAlgorithm.to_jwk(key.public_key(), as_dict=True)
    return {"keys": [{**jwk, "kid": kid, "use": "sig", "alg": "RS256"}]}


def serve_json(payload: Callable[[], dict[str, Any]]) -> ThreadingHTTPServer:
    """An HTTP server on a free port that answers every GET with one JSON document."""

    class Handler(BaseHTTPRequestHandler):
        def do_GET(self) -> None:  # noqa: N802
            body = json.dumps(payload()).encode()
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)

        def log_message(self, *args: Any) -> None:
            pass

    server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    return server


# -- the identity provider ----------------------------------------------------


class IdentityProvider:
    """Keycloak's part: user tokens for realm `demo`, and the keys to check them."""

    def __init__(self) -> None:
        self._key = rsa_key()
        self.kid = "idp-key"
        self._server = serve_json(lambda: public_jwks(self._key, self.kid))
        port = self._server.server_address[1]
        # As in the cluster, the issuer differs from where the keys are fetched.
        self.issuer = "http://localhost:18081/realms/demo"
        self.jwks_url = f"http://127.0.0.1:{port}/realms/demo/protocol/openid-connect/certs"
        self._subjects: dict[str, str] = {}

    def mint(self, username: str = "platform-engineer", **overrides: Any) -> str:
        roles, team = USERS.get(username, ([], None))
        now = int(time.time())
        claims: dict[str, Any] = {
            "iss": self.issuer,
            "sub": self._subjects.setdefault(username, str(uuid.uuid4())),
            "aud": AUDIENCE,
            "azp": "demo-cli",
            "iat": now,
            "exp": now + 300,
            "jti": str(uuid.uuid4()),
            "preferred_username": username,
            "roles": roles,
            "team": team,
            "email": f"{username}@example.com",
            "name": username.replace("-", " ").title(),
        }
        claims.update(overrides)
        claims = {k: v for k, v in claims.items() if v is not None}
        return jwt.encode(claims, self._key, algorithm="RS256", headers={"kid": self.kid})

    def close(self) -> None:
        self._server.shutdown()
        self._server.server_close()


@pytest.fixture(scope="session")
def idp() -> Iterator[IdentityProvider]:
    provider = IdentityProvider()
    yield provider
    provider.close()


@pytest.fixture(scope="session")
def user_token(idp: IdentityProvider) -> Callable[..., str]:
    return idp.mint


# -- the cluster --------------------------------------------------------------


class Cluster:
    """The cluster's service-account issuer, and the API server's answer to a TokenReview."""

    issuer = CLUSTER_ISSUER

    def __init__(self, directory: Path) -> None:
        self._key = rsa_key()
        self.kid = "cluster-key"
        self.jwks_file = directory / "cluster-jwks.json"
        self.jwks_file.write_text(json.dumps(public_jwks(self._key, self.kid)))
        # Pods deleted since their tokens were minted.
        self.gone_pods: set[str] = set()

    def mint(
        self,
        name: str,
        namespace: str = "agents",
        audience: str | None = ACTOR_AUDIENCE,
        *,
        lifetime: int = 600,
        pod: str | None = None,
    ) -> str:
        """A service-account token. `audience=None`: the API server's, as a mounted token has."""
        now = int(time.time())
        claims = {
            "iss": self.issuer,
            "sub": service_account(name, namespace),
            "aud": [audience or API_SERVER_AUDIENCE],
            "iat": now,
            "nbf": now,
            "exp": now + lifetime,
            "jti": str(uuid.uuid4()),
            "kubernetes.io": {
                "namespace": namespace,
                "serviceaccount": {"name": name, "uid": str(uuid.uuid5(uuid.NAMESPACE_DNS, name))},
                "pod": {"name": pod or f"{name}-0", "uid": str(uuid.uuid4())},
            },
        }
        return jwt.encode(claims, self._key, algorithm="RS256", headers={"kid": self.kid})

    def review(self, token: str, audiences: list[str]) -> dict[str, Any]:
        """The status the API server writes into a TokenReview."""
        audiences = audiences or [API_SERVER_AUDIENCE]
        try:
            claims = jwt.decode(
                token,
                self._key.public_key(),
                algorithms=["RS256"],
                issuer=self.issuer,
                options={"verify_aud": False, "require": ["exp", "iss", "sub", "aud"]},
            )
        except jwt.PyJWTError as exc:
            return {"user": {}, "error": f"[invalid bearer token, {exc}]"}
        token_audiences = claims["aud"] if isinstance(claims["aud"], list) else [claims["aud"]]
        granted = [a for a in audiences if a in token_audiences]
        if not granted:
            return {
                "user": {},
                "error": f"[invalid bearer token, token audiences {json.dumps(token_audiences)}"
                f" is invalid for the target audiences {json.dumps(audiences)}]",
            }
        k8s = claims["kubernetes.io"]
        if k8s["pod"]["name"] in self.gone_pods:
            return {
                "user": {},
                "error": f'[invalid bearer token, pods "{k8s["pod"]["name"]}" not found]',
            }
        namespace = k8s["namespace"]
        return {
            "authenticated": True,
            "user": {
                "username": claims["sub"],
                "uid": k8s["serviceaccount"]["uid"],
                "groups": [
                    "system:serviceaccounts",
                    f"system:serviceaccounts:{namespace}",
                    "system:authenticated",
                ],
                "extra": {"authentication.kubernetes.io/pod-name": [k8s["pod"]["name"]]},
            },
            "audiences": granted,
        }


@pytest.fixture(scope="session")
def cluster(tmp_path_factory: pytest.TempPathFactory) -> Cluster:
    return Cluster(tmp_path_factory.mktemp("cluster"))


@pytest.fixture(scope="session")
def sa_token(cluster: Cluster) -> Callable[..., str]:
    """A service-account token, by default with this service's own audience."""
    return cluster.mint


# -- the API server -----------------------------------------------------------


@dataclass
class Tls:
    ca_file: Path
    cert_file: Path
    key_file: Path


def make_tls(directory: Path, name: str) -> Tls:
    """A CA, and a certificate it signed for 127.0.0.1."""
    now = datetime.now(UTC)
    ca_key = ec.generate_private_key(ec.SECP256R1())
    ca_name = x509.Name([x509.NameAttribute(NameOID.COMMON_NAME, f"{name} CA")])
    ca = (
        x509.CertificateBuilder()
        .subject_name(ca_name)
        .issuer_name(ca_name)
        .public_key(ca_key.public_key())
        .serial_number(x509.random_serial_number())
        .not_valid_before(now - timedelta(minutes=5))
        .not_valid_after(now + timedelta(days=1))
        .add_extension(x509.BasicConstraints(ca=True, path_length=None), critical=True)
        .add_extension(
            x509.KeyUsage(
                digital_signature=True,
                content_commitment=False,
                key_encipherment=False,
                data_encipherment=False,
                key_agreement=False,
                key_cert_sign=True,
                crl_sign=True,
                encipher_only=False,
                decipher_only=False,
            ),
            critical=True,
        )
        .add_extension(x509.SubjectKeyIdentifier.from_public_key(ca_key.public_key()), False)
        .sign(ca_key, hashes.SHA256())
    )
    key = ec.generate_private_key(ec.SECP256R1())
    cert = (
        x509.CertificateBuilder()
        .subject_name(x509.Name([x509.NameAttribute(NameOID.COMMON_NAME, "kube-apiserver")]))
        .issuer_name(ca_name)
        .public_key(key.public_key())
        .serial_number(x509.random_serial_number())
        .not_valid_before(now - timedelta(minutes=5))
        .not_valid_after(now + timedelta(days=1))
        .add_extension(
            x509.SubjectAlternativeName([x509.IPAddress(ipaddress.ip_address("127.0.0.1"))]),
            critical=False,
        )
        .add_extension(x509.BasicConstraints(ca=False, path_length=None), critical=True)
        .add_extension(x509.ExtendedKeyUsage([ExtendedKeyUsageOID.SERVER_AUTH]), critical=False)
        .add_extension(
            x509.AuthorityKeyIdentifier.from_issuer_public_key(ca_key.public_key()), False
        )
        .sign(ca_key, hashes.SHA256())
    )
    tls = Tls(directory / f"{name}-ca.crt", directory / f"{name}.crt", directory / f"{name}.key")
    tls.ca_file.write_bytes(ca.public_bytes(serialization.Encoding.PEM))
    tls.cert_file.write_bytes(cert.public_bytes(serialization.Encoding.PEM))
    write_pem(key, tls.key_file)
    return tls


@dataclass
class ApiServer:
    """The API server's TokenReview endpoint and its service-account keys, over HTTPS."""

    cluster: Cluster
    url: str = ""
    ca_file: Path = Path()
    # The file this service reads its own token from, and the token in it.
    reviewer_token_file: Path = Path()
    reviewer_token: str = ""
    # When set, every request gets this HTTP status and a Kubernetes Status body.
    fail_with: int | None = None
    requests: list[dict[str, Any]] = field(default_factory=list)
    # The Authorization header of every GET of the keys.
    key_fetches: list[str | None] = field(default_factory=list)

    def reset(self) -> None:
        self.fail_with = None
        self.requests.clear()
        self.key_fetches.clear()
        self.reviewer_token_file.write_text(self.reviewer_token + "\n")

    def keys(self, authorization: str | None) -> tuple[int, dict]:
        """GET /openid/v1/jwks: for any authenticated caller, as the RBAC default allows."""
        self.key_fetches.append(authorization)
        if authorization is None:
            # Anonymous: the default ClusterRoleBinding names service accounts only.
            return 403, status_object(403, 'User "system:anonymous" cannot get path')
        if authorization != f"Bearer {self.reviewer_token}":
            return 401, status_object(401, "Unauthorized")
        return 200, json.loads(self.cluster.jwks_file.read_text())

    def answer(self, authorization: str | None, body: dict[str, Any]) -> tuple[int, dict]:
        self.requests.append({"authorization": authorization, "body": body})
        if self.fail_with is not None:
            return self.fail_with, status_object(self.fail_with, "the test says so")
        if authorization != f"Bearer {self.reviewer_token}":
            return 401, status_object(401, "Unauthorized")
        if (
            body.get("apiVersion") != "authentication.k8s.io/v1"
            or body.get("kind") != "TokenReview"
        ):
            return 400, status_object(400, "not a TokenReview")
        spec = body.get("spec") or {}
        status = self.cluster.review(spec.get("token", ""), spec.get("audiences") or [])
        return 201, {**body, "metadata": {"creationTimestamp": None}, "status": status}


def status_object(code: int, message: str) -> dict[str, Any]:
    return {
        "kind": "Status",
        "apiVersion": "v1",
        "status": "Failure",
        "message": message,
        "code": code,
    }


@pytest.fixture(scope="session")
def _api_server(cluster: Cluster, tmp_path_factory: pytest.TempPathFactory) -> Iterator[ApiServer]:
    directory = tmp_path_factory.mktemp("apiserver")
    tls = make_tls(directory, "cluster")
    fake = ApiServer(
        cluster,
        ca_file=tls.ca_file,
        reviewer_token_file=directory / "token",
        reviewer_token=cluster.mint("chain-sts", "agentgateway-system", API_SERVER_AUDIENCE),
    )
    fake.reset()

    class Handler(BaseHTTPRequestHandler):
        def do_POST(self) -> None:  # noqa: N802
            raw = self.rfile.read(int(self.headers.get("Content-Length") or 0))
            if self.path != "/apis/authentication.k8s.io/v1/tokenreviews":
                status, body = 404, status_object(404, "the server could not find the resource")
            else:
                status, body = fake.answer(self.headers.get("Authorization"), json.loads(raw))
            self.reply(status, body)

        def do_GET(self) -> None:  # noqa: N802
            if self.path != JWKS_PATH:
                self.reply(404, status_object(404, "the server could not find the resource"))
            else:
                self.reply(*fake.keys(self.headers.get("Authorization")))

        def reply(self, status: int, body: dict[str, Any]) -> None:
            data = json.dumps(body).encode()
            self.send_response(status)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(data)))
            self.end_headers()
            self.wfile.write(data)

        def log_message(self, *args: Any) -> None:
            pass

    server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
    context = ssl.create_default_context(ssl.Purpose.CLIENT_AUTH)
    context.load_cert_chain(tls.cert_file, tls.key_file)
    server.socket = context.wrap_socket(server.socket, server_side=True)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    fake.url = f"https://127.0.0.1:{server.server_address[1]}"
    yield fake
    server.shutdown()
    server.server_close()


@pytest.fixture
def api_server(_api_server: ApiServer) -> Iterator[ApiServer]:
    _api_server.reset()
    yield _api_server
    _api_server.reset()


# -- the service under test ---------------------------------------------------


@dataclass
class Sts:
    url: str
    service: TokenService

    @property
    def well_known(self) -> str:
        return f"{self.url}/.well-known/oauth-authorization-server"

    @cached_property
    def metadata(self) -> dict[str, Any]:
        response = httpx.get(self.well_known)
        response.raise_for_status()
        return response.json()

    def exchange(
        self,
        subject_token: str | None,
        actor_token: str | None = None,
        *,
        as_json: bool = False,
        **params: Any,
    ) -> httpx.Response:
        """POST a delegation request the way kagent's clients do: no client authentication."""
        body: dict[str, Any] = {"grant_type": TOKEN_EXCHANGE, "subject_token_type": JWT_TYPE}
        if subject_token is not None:
            body["subject_token"] = subject_token
        if actor_token is not None:
            body |= {"actor_token": actor_token, "actor_token_type": JWT_TYPE}
        body |= params
        endpoint = self.metadata["token_endpoint"]
        return httpx.post(endpoint, json=body) if as_json else httpx.post(endpoint, data=body)

    def verify_like_gateway(self, token: str, audience: str = AUDIENCE) -> dict[str, Any]:
        """Verify a token as a gateway would: keys from the JWKS, issuer from the metadata."""
        key = jwt.PyJWKClient(self.metadata["jwks_uri"]).get_signing_key_from_jwt(token).key
        return jwt.decode(
            token, key, algorithms=["RS256"], audience=audience, issuer=self.metadata["issuer"]
        )


@pytest.fixture(scope="session")
def signing_key_file(tmp_path_factory: pytest.TempPathFactory) -> Path:
    return write_pem(rsa_key(), tmp_path_factory.mktemp("signing") / "key.pem")


@pytest.fixture(scope="session")
def policy(
    idp: IdentityProvider, cluster: Cluster, _api_server: ApiServer, signing_key_file: Path
) -> Callable[[str], dict[str, Any]]:
    """The example configuration with the stand-ins' values, plus one test-only agent."""
    example = yaml.safe_load(EXAMPLE_CONFIG.read_text())

    def build(mode: str = "token_review") -> dict[str, Any]:
        raw = copy.deepcopy(example)
        raw["signing_key_file"] = str(signing_key_file)
        raw["subject_issuers"] = [
            {"issuer": idp.issuer, "jwks_url": idp.jwks_url, "audience": AUDIENCE}
        ]
        raw["actor"]["verify_with"] = "token_review" if mode == "token_review" else "jwks"
        raw["actor"]["token_review"] = {
            "api_server": _api_server.url,
            "token_file": str(_api_server.reviewer_token_file),
            "ca_file": str(_api_server.ca_file),
        }
        if mode == "jwks_from_api_server":
            # As the dev cluster runs it: the keys from the API server, with
            # this service's own token and the cluster's CA.
            raw["actor"]["jwks"] = {
                "issuer": cluster.issuer,
                "jwks_url": f"{_api_server.url}{JWKS_PATH}",
                "token_file": str(_api_server.reviewer_token_file),
                "ca_file": str(_api_server.ca_file),
            }
        else:
            raw["actor"]["jwks"] = {"issuer": cluster.issuer, "jwks_file": str(cluster.jwks_file)}
        # Test-only: an agent that may act for users but that no may_act names.
        raw["agents"]["may-act-probe"] = {"service_account": PROBE, "act_for_users": True}
        return raw

    return build


@pytest.fixture(scope="session")
def start_sts(tmp_path_factory: pytest.TempPathFactory) -> Iterator[Callable[..., Sts]]:
    """Start the service for a configuration on 127.0.0.1, port 0; all are stopped at the end.

    The issuer is the bound address unless `issuer` names one, which several
    instances can share, as the replicas of one release do.
    """
    started: list[tuple[uvicorn.Server, threading.Thread]] = []
    directory = tmp_path_factory.mktemp("sts")

    def start(raw: dict[str, Any], issuer: str | None = None) -> Sts:
        # Bind first: the port the OS picks is part of the configuration
        # (`issuer` and `public_url`), which the app reads when it is made.
        sock = socket.socket()
        sock.bind(("127.0.0.1", 0))
        port = sock.getsockname()[1]
        url = f"http://127.0.0.1:{port}"
        path = directory / f"config-{port}.yaml"
        path.write_text(yaml.safe_dump({**raw, "issuer": issuer or url, "public_url": url}))
        app = create_app(load_config(path, env={}))
        server = uvicorn.Server(uvicorn.Config(app, log_config=None, access_log=False))
        thread = threading.Thread(target=server.run, kwargs={"sockets": [sock]}, daemon=True)
        thread.start()
        deadline = time.monotonic() + 10
        while not server.started:
            if time.monotonic() > deadline or not thread.is_alive():
                raise RuntimeError("the service did not start")
            time.sleep(0.01)
        started.append((server, thread))
        return Sts(url, app.state.service)

    yield start
    for server, thread in started:
        server.should_exit = True
        thread.join(timeout=5)


@pytest.fixture(scope="session", params=["token_review", "jwks", "jwks_from_api_server"])
def actor_mode(request: pytest.FixtureRequest) -> str:
    """How the actor is checked. Every test that uses the service runs once with each.

    `jwks` reads the cluster's keys from a file; `jwks_from_api_server` fetches
    them from the API server with this service's own token and CA.
    """
    return request.param


@pytest.fixture(scope="session")
def chain_sts(start_sts, policy, actor_mode) -> Sts:
    return start_sts(policy(actor_mode))
