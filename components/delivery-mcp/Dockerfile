# delivery-mcp: FastMCP server plus the helm binary its Helm applier runs.
#
# Laid out as `kmcp init python` scaffolds it (src/main.py, kmcp.yaml), so
# `kmcp build` builds this same file.

# -- helm, checked against the published checksum ----------------------------
FROM python:3.13-slim AS helm
# Same Helm 3 as mise.toml, so the release is written by one Helm major.
ARG HELM_VERSION=3.19.0
ARG TARGETARCH
RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates curl \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /tmp/helm
RUN curl -fsSLO "https://get.helm.sh/helm-v${HELM_VERSION}-linux-${TARGETARCH}.tar.gz" \
    && curl -fsSL "https://get.helm.sh/helm-v${HELM_VERSION}-linux-${TARGETARCH}.tar.gz.sha256sum" \
       | sha256sum --check - \
    && tar -xzf "helm-v${HELM_VERSION}-linux-${TARGETARCH}.tar.gz" --strip-components=1 "linux-${TARGETARCH}/helm"

# -- dependencies, from the lockfile -----------------------------------------
FROM python:3.13-slim AS builder
COPY --from=ghcr.io/astral-sh/uv:0.9.5 /uv /usr/local/bin/uv
ENV UV_COMPILE_BYTECODE=1 UV_LINK_MODE=copy UV_PYTHON_DOWNLOADS=never
WORKDIR /app
COPY pyproject.toml uv.lock .python-version ./
RUN uv sync --frozen --no-dev --no-cache

# -- runtime -----------------------------------------------------------------
FROM python:3.13-slim
ARG VERSION=0.1.0

RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates \
    && rm -rf /var/lib/apt/lists/* \
    && groupadd --gid 10001 app \
    && useradd --uid 10001 --gid 10001 --no-create-home --home-dir /tmp --shell /usr/sbin/nologin app

COPY --from=helm /tmp/helm/helm /usr/local/bin/helm
WORKDIR /app
COPY --from=builder /app/.venv /app/.venv
COPY src/ ./src/
COPY kmcp.yaml pyproject.toml ./

ENV PATH="/app/.venv/bin:$PATH" \
    PYTHONPATH=/app/src \
    PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    APP_VERSION=${VERSION} \
    # helm keeps its cache and config under HOME; /tmp is the one writable place.
    HOME=/tmp \
    HELM_CACHE_HOME=/tmp/helm/cache \
    HELM_CONFIG_HOME=/tmp/helm/config \
    HELM_DATA_HOME=/tmp/helm/data

# Numeric, so Kubernetes can check runAsNonRoot.
USER 10001:10001
EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD ["python", "-c", "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8080/healthz', timeout=2)"]

CMD ["python", "src/main.py", "--transport", "http", "--host", "0.0.0.0", "--port", "8080"]
