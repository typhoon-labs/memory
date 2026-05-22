# Troubleshooting

Common issues and their solutions when running Typhoon locally.

## Quick Diagnosis

Before diving into specific issues, run the health check:

```bash
bun run doctor
```

This checks the Docker daemon, all containers, PostgreSQL (including pgvector), Redis, MinIO, HTTP endpoints, and Grafana. It reports which checks pass and which fail.

## Port Already in Use

**Symptom:** Docker containers fail to start, or `bun run dev` reports address already in use.

**Fix:**

```bash
# Stop any running Typhoon containers
bun run docker:down

# Find what is using a specific port
lsof -i :5172

# Kill the process (replace PID with the actual process ID)
kill <PID>

# Check all Typhoon ports
for port in 5172 5173 5174 5175 5432 5556 6379 8787 9000 9001 3000; do
  PID=$(lsof -ti :$port 2>/dev/null)
  [ -n "$PID" ] && echo "Port $port: PID $PID ($(ps -p $PID -o comm= 2>/dev/null))"
done
```

## Docker Not Running

**Symptom:** `Cannot connect to the Docker daemon` or `docker: command not found`.

**Fix:**

```bash
# macOS / Windows
# Open Docker Desktop and wait for it to fully start

# Linux
sudo systemctl start docker
sudo systemctl enable docker  # Start on boot
```

Verify:

```bash
docker info
```

## Migration Failed

**Symptom:** `bun run setup` reports "migrations failed" or the API cannot connect to the database.

**Diagnosis:**

```bash
# Check PostgreSQL container health
bun run docker:status

# View migration container logs
docker logs typhoon-migrate

# Check if PostgreSQL is accepting connections
docker exec typhoon-postgres pg_isready -U typhoon
```

**Fixes:**

1. **PostgreSQL not ready:** Wait a few seconds and retry. The `typhoon-migrate` container depends on PostgreSQL health, but it may take time on first start.

2. **Schema conflict:** If you changed Drizzle schemas without generating migrations:

   ```bash
   bun run db:generate   # Generate migration from schema diff
   bun run db:migrate    # Apply it
   ```

3. **Corrupt state:** Reset everything:
   ```bash
   bun run reset
   ```

## SSO Redirect Fails (Cannot Log In)

**Symptom:** Clicking "Sign in with SSO" results in an error page, redirect loop, or the Dex login form never appears.

**Diagnosis:**

```bash
# Check if Dex is running
bun run docker:status | grep dex

# View Dex logs
docker logs typhoon-dex

# Verify OIDC_ISSUER_URL resolves
curl -s http://localhost:5556/dex/.well-known/openid-configuration | head -5
```

**Fixes:**

1. **Dex not running:** Start it:

   ```bash
   ./scripts/docker.sh up dex -d
   ```

2. **Wrong OIDC_ISSUER_URL:** Ensure `.env` contains:

   ```
   OIDC_ISSUER_URL=http://localhost:5556/dex
   ```

3. **Trusted origins misconfigured:** Ensure `.env` contains:

   ```
   TRUSTED_ORIGINS=http://localhost:5173,http://localhost:5174
   ```

4. **Cookies blocked:** SSO requires cookies. Ensure you are using `http://localhost:5174` (not `127.0.0.1` or a different hostname) so cookies match the configured origins.

## Services Not Responding

**Symptom:** HTTP requests to `localhost:5172` (or other services) time out or return connection refused.

**Diagnosis:**

```bash
# Check container status
bun run docker:status

# Tail all container logs
bun run docker:logs

# Check a specific service
docker logs typhoon-api --tail 50
docker logs typhoon-worker --tail 50
```

**Fixes:**

1. **Container crashed:** Check logs for the error, fix it, then restart:

   ```bash
   bun run docker:restart
   ```

2. **Dev server not started:** Docker only runs infrastructure. You also need the dev server:

   ```bash
   bun run dev
   ```

3. **Build error:** If a package has a TypeScript error preventing startup:
   ```bash
   bun run typecheck   # Find the error
   # Fix it, then retry
   bun run dev
   ```

## Embedding Failures

**Symptom:** Document sync completes but search returns no results, or ingestion logs show embedding errors.

**Diagnosis:**

```bash
# Check worker logs for embedding errors
docker logs typhoon-worker --tail 100 | grep -i embed

# Verify the embedding endpoint is reachable
curl -s http://localhost:8787/v1/models | jq
```

**Fixes:**

1. **Bifrost not running:** Start it:

   ```bash
   ./scripts/docker.sh up bifrost -d
   ```

2. **Wrong embedding config:** Check `.env`:

   ```
   EMBEDDING_BASE_URL=http://bifrost:8787/v1
   EMBEDDING_MODEL=bedrock/amazon.titan-embed-text-v2:0
   EMBEDDING_DIMENSION=1024
   ```

3. **AWS credentials missing:** If using Bedrock, ensure `AWS_ACCESS_KEY_ID` and `AWS_SECRET_ACCESS_KEY` are set in `.env`.

4. **Local Ollama not running:** If using Ollama for embeddings, ensure it is running and the model is pulled:
   ```bash
   ollama pull nomic-embed-text
   ```

## Redis Connection Refused

**Symptom:** API or worker logs show `ECONNREFUSED` for Redis, or BullMQ jobs are not processing.

**Diagnosis:**

```bash
# Check Redis container
bun run docker:status | grep redis

# Test Redis connectivity
docker exec typhoon-redis redis-cli ping   # Should print PONG
```

**Fixes:**

1. **Redis not running:**

   ```bash
   ./scripts/docker.sh up redis -d
   ```

2. **Wrong REDIS_URL:** The Docker containers use `redis://redis:6379` (Docker network hostname). Host-side tools should use `redis://localhost:6379`. Check `.env` and ensure the URL matches your context.

## Playwright Browser Lock (E2E Tests)

**Symptom:** `bun run test:e2e` fails with a Chromium lock error: `Failed to launch browser` or references `SingletonLock`.

**Fix:**

If you are using the Playwright MCP browser, it holds a lock on the Chromium profile. Close the MCP browser before running E2E tests:

```bash
# Kill any lingering Chromium processes
pkill -f chromium || true

# Remove the lock file if it persists
rm -f /tmp/playwright-*/SingletonLock

# Then run tests
bun run test:e2e
```

E2E tests also require the full stack to be running:

```bash
bun run docker:up
bun run dev
bun run test:e2e
```

## LLM / Chat Not Working

**Symptom:** Chat messages hang, return empty responses, or show "streaming" indefinitely.

**Diagnosis:**

```bash
# Check API logs for LLM errors
docker logs typhoon-api --tail 100 | grep -iE "error|llm|bifrost"

# Test the LLM endpoint directly
curl -s http://localhost:8787/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer changeme" \
  -d '{"model":"bedrock/us.anthropic.claude-sonnet-4-6","messages":[{"role":"user","content":"hello"}]}' | jq
```

**Fixes:**

1. **Bifrost not running:** `./scripts/docker.sh up bifrost -d`
2. **AWS credentials invalid:** Update `AWS_ACCESS_KEY_ID` and `AWS_SECRET_ACCESS_KEY` in `.env`
3. **Model not available:** Ensure you have access to the configured models in your AWS account/region

## Database Connection Issues

**Symptom:** API errors mentioning "connection refused" or "ECONNREFUSED" for PostgreSQL.

**Fix:**

```bash
# Check PostgreSQL
docker exec typhoon-postgres pg_isready -U typhoon

# If not ready, restart
./scripts/docker.sh restart postgres

# Verify pgvector extension
docker exec typhoon-postgres psql -U typhoon -d typhoon -c "SELECT 1 FROM pg_extension WHERE extname = 'vector'"
```

## Nuclear Option: Full Reset

When all else fails, reset everything from scratch:

```bash
bun run reset
```

This command:

1. Stops all Docker containers and **removes volumes** (all data is lost)
2. Removes `node_modules`, `.turbo`, and build artifacts
3. Re-runs the full setup script

After reset, you will need to re-seed data (`bun run seed`) and log in again.

## Getting Help

If an issue persists after trying the fixes above:

1. Run `bun run doctor` and note which checks fail
2. Run `bun run docker:logs` and look for error messages
3. Check the specific service's container logs: `docker logs typhoon-<service> --tail 200`
4. Verify your `.env` matches `.env.example` for any recently added variables
