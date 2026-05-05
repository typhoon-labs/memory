# Contributing to Typhoon

## Getting Started

```bash
bun run setup    # Install deps, start Docker, run migrations
bun run dev      # Start all services in dev mode
```

See [Getting Started](docs/getting-started.md) for detailed setup instructions.

## Development Workflow

1. Create a feature branch from `main`
2. Make your changes
3. **Pre-commit hooks run automatically** — lefthook runs Biome lint + TypeScript type check on every commit. If either fails, the commit is blocked. Fix the issue and retry.
4. Run tests before pushing:

```bash
bun run test               # Unit tests (one-shot)
bun run test:watch         # Unit tests in watch mode (re-runs on save)
```

5. If your changes touch `packages/db`, also run integration tests:

```bash
bun run test:integration
```

6. Commit and push your branch, then open an MR

## Code Style

- **Formatter/linter:** Biome v2 — run `bun run format` to auto-fix
- **File naming:** kebab-case for files, PascalCase for React components
- **Imports:** Extensionless (`from './foo'`, not `from './foo.js'`)
- **Types:** Use strong typing — avoid `any` when possible
- **Docs:** JSDoc on all public functions
- **Env vars:** Always access via Zod schemas in `@typhoon/config`, never `process.env` directly

## Project Structure

```
apps/           Deployable applications (api, worker, scheduler, desk, admin, widget)
packages/       Shared libraries (3-layer dependency model)
infra/docker/   Docker Compose + service configs
scripts/        Dev automation (setup, reset, docker, seed, postinstall, clean)
docs/           Project documentation
```

See [Architecture](docs/architecture.md) for the full dependency model and system design.

## Testing

- Co-locate unit tests with source files as `*.test.ts`
- New or modified source files should have tests with >= 80% line coverage
- Use `vi.mock()` with `vi.hoisted()` when mock variables are referenced in factory functions
- For Mastra classes in mocks, use real `class` syntax — `vi.fn().mockImplementation()` won't work as a constructor

| Command | What it runs |
|---------|-------------|
| `bun run test` | Unit tests |
| `bun run test:watch` | Unit tests in watch mode |
| `bun run test:coverage` | Unit tests with coverage |
| `bun run test:integration` | PostgreSQL integration tests |
| `bun run test:e2e` | End-to-end tests (requires full stack) |

## Useful Commands

| Command | Description |
|---------|-------------|
| `bun run dev:api` | Start only the API server |
| `bun run dev:desk` | Start only the rep desk |
| `bun run dev:backend` | Start API + worker + scheduler |
| `bun run doctor` | Check health of all services |
| `bun run docker:restart` | Restart Docker services |
| `bun run docker:status` | Show running containers |
| `bun run docker:logs` | Tail logs from all services |
| `bun run seed` | Seed database + upload sample documents to MinIO |
| `bun run reset` | Nuclear reset — tear down and re-setup |

## Documentation

When adding or changing functionality:
- Add JSDoc comments on public functions
- Update relevant docs in `docs/` if the change affects architecture, APIs, or infrastructure
- Update package `README.md` if the change affects a package's public API
