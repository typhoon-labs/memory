# Prerequisites

Everything you need before running `bun run setup`.

## Required Software

### Bun 1.3.14+

Bun is the JavaScript runtime and package manager for the entire project.

```bash
# Install (macOS, Linux, WSL)
curl -fsSL https://bun.sh/install | bash

# Verify
bun --version   # Should print 1.3.14 or higher
```

Visit [bun.sh](https://bun.sh) for alternative installation methods (Homebrew, npm, etc.).

### Docker 24+ and Docker Compose v2

Docker runs all infrastructure services (PostgreSQL, Redis, MinIO, Dex, Bifrost, Grafana LGTM, and the migration container).

```bash
# Verify Docker
docker --version       # Should print 24.x or higher

# Verify Docker Compose v2
docker compose version # Should print v2.20 or higher
```

**Installation:**

- **macOS / Windows:** Install [Docker Desktop](https://docs.docker.com/get-docker/). Docker Compose v2 is bundled.
- **Linux:** Install [Docker Engine](https://docs.docker.com/engine/install/) and the [Compose plugin](https://docs.docker.com/compose/install/linux/).

## OS-Specific Notes

### macOS (Docker Desktop)

Docker Desktop defaults to limited resources. For a smooth experience, allocate at least:

| Resource | Recommended |
| -------- | ----------- |
| CPUs     | 4+          |
| Memory   | 8 GB+       |
| Disk     | 40 GB+      |

Open Docker Desktop > Settings > Resources to adjust.

### Linux

Ensure the Docker daemon is running:

```bash
sudo systemctl start docker
sudo systemctl enable docker
```

If you are not in the `docker` group, commands require `sudo`:

```bash
sudo usermod -aG docker $USER
# Log out and back in for the group change to take effect
```

### Windows (WSL2)

Typhoon is developed and tested on macOS and Linux. On Windows, use WSL2 with Docker Desktop's WSL2 backend. Clone the repository inside the WSL2 filesystem (not `/mnt/c/`) for acceptable file I/O performance.

## Port Requirements

The following ports must be available on `localhost`:

| Port | Service         | Notes                           |
| ---- | --------------- | ------------------------------- |
| 5172 | API server      | Hono/Mastra backend             |
| 5173 | Rep desk        | Vite dev server                 |
| 5174 | Admin dashboard | Vite dev server                 |
| 5175 | Customer widget | Vite dev server                 |
| 5432 | PostgreSQL      | With pgvector extension         |
| 5556 | Dex (OIDC)      | Local identity provider         |
| 6379 | Redis           | BullMQ job queue                |
| 8787 | Bifrost         | LLM gateway (OpenAI-compatible) |
| 9000 | MinIO (S3 API)  | Object storage                  |
| 9001 | MinIO (Console) | Web UI for bucket management    |
| 3000 | Grafana         | Observability dashboards        |

Check for port conflicts before starting:

```bash
# Check if a specific port is in use
lsof -i :5172

# Check all Typhoon ports at once
for port in 5172 5173 5174 5175 5432 5556 6379 8787 9000 9001 3000; do
  lsof -i :$port 2>/dev/null && echo "Port $port is in use"
done
```

If ports conflict, stop the existing process or change the port in `.env` and the corresponding Docker Compose file.

## Disk Space

Expect approximately **5 GB** of disk usage for Docker images:

| Image                  | Size (approx.) |
| ---------------------- | -------------- |
| PostgreSQL + pgvector  | ~400 MB        |
| Redis                  | ~150 MB        |
| MinIO                  | ~200 MB        |
| Dex                    | ~50 MB         |
| Bifrost                | ~100 MB        |
| Grafana LGTM           | ~1.5 GB        |
| App images (API, etc.) | ~2 GB          |

Docker volumes (database data, MinIO objects) grow with usage. For a fresh dev environment, budget at least **10 GB** total for images + volumes.

## Optional: AWS Credentials for Bedrock

The default `.env` configures Bifrost to route LLM and embedding calls to **AWS Bedrock**. If you want to use this default setup, you need AWS credentials with Bedrock access:

```bash
# Set in your shell or .env
AWS_ACCESS_KEY_ID=your-access-key
AWS_SECRET_ACCESS_KEY=your-secret-key
AWS_REGION=us-east-1
```

If you do not have AWS credentials, you can use any OpenAI-compatible endpoint instead. For example, to use a local Ollama instance:

```bash
# LLM
LLM_BASE_URL=http://host.docker.internal:11434/v1
LLM_API_KEY=ollama
LLM_CHAT_MODEL=llama3.1

# Embeddings
EMBEDDING_BASE_URL=http://host.docker.internal:11434/v1
EMBEDDING_API_KEY=ollama
EMBEDDING_MODEL=ollama/nomic-embed-text
EMBEDDING_DIMENSION=768
```

## Verification

After installing everything, verify your setup:

```bash
# All three should succeed
bun --version           # 1.3.14+
docker --version        # 24.x+
docker compose version  # v2.20+
docker info             # Docker daemon is running
```

Once verified, proceed to the [main setup guide](README.md).
