# Quality Gates

Before marking any work as complete, ensure all seven gates pass. These are enforced by Lefthook hooks (pre-commit: format + lint; pre-push: typecheck) and CI.

## The 7-Step Checklist

### 1. Zero TypeScript Errors

```bash
bun run typecheck
```

This runs `turbo run typecheck`, which type-checks each package independently. The project uses TypeScript 6.0+ in strict mode with `verbatimModuleSyntax`. All packages and apps must compile cleanly with zero errors.

### 2. Zero Lint and Format Errors

```bash
bun run check
# Equivalent to: bunx oxfmt --check . && bunx oxlint . && turbo run typecheck
```

This runs both the formatter check and the linter in sequence. If formatting is off, fix it first:

```bash
bun run format       # Auto-fix formatting
bun run lint         # Then check lint rules
```

See [Linting and Formatting](linting-formatting.md) for configuration details.

### 3. All Unit Tests Passing

```bash
bun run test
```

Runs the full Vitest workspace across all packages and apps. Coverage thresholds must also be met:

| Metric    | Threshold |
| --------- | --------- |
| Lines     | 85%       |
| Branches  | 75%       |
| Functions | 80%       |

To verify coverage explicitly:

```bash
bun run test:coverage
```

### 4. Co-Located Tests with Sufficient Coverage

Every new or modified source file must have a co-located test file:

```
src/
  my-feature.ts           # Source
  my-feature.test.ts      # Test (required)
```

The test file must achieve at least **80% line coverage** of the source file.

**Verification:**

```bash
# List changed files
git diff --name-only

# For each .ts/.tsx source file in the output, verify a corresponding .test.ts/.test.tsx exists
# Then run coverage to confirm >= 80% per file
bun run test:coverage
```

### 5. Integration Tests (if `packages/db` Changed)

```bash
bun run test:integration
```

If your changes touch anything under `packages/db/` (schemas, repos, drivers, migrations), run the integration test suite. This requires a running PostgreSQL instance:

```bash
# Ensure Docker services are up
bun run docker:up

# Run integration tests
bun run test:integration
```

The integration tests live in `packages/db/src/drivers/pg/*.integration.test.ts` and run with a 30-second timeout.

### 6. Migration File (if Drizzle Schemas Changed)

If you modified any Drizzle schema file under `packages/db/src/schema/`, generate and include the migration:

```bash
# Generate migration from schema diff
bun run db:generate

# Apply migration to local database
bun run db:migrate
```

The generated migration file (in `packages/db/drizzle/`) must be committed with your changes. The `typhoon-migrate` Docker container runs these migrations automatically on startup.

### 7. Documentation

Document new or changed functionality:

- **Inline:** JSDoc comments on all public functions (not just package entry points)
- **Docs:** Update files in `docs/` if the change affects setup, architecture, or workflows
- **Package READMEs:** Update `README.md` in affected packages if their API or behavior changes

## Running All Gates at Once

A quick script to run all applicable gates:

```bash
# Format check + lint + typecheck + unit tests
bun run check && bun run test
```

If you also changed `packages/db`:

```bash
bun run check && bun run test && bun run test:integration
```

## Git Hook Enforcement

Lefthook enforces gates 1 and 2 automatically via git hooks:

**Pre-commit** (fast, file-scoped -- runs on every commit):

| Hook         | Gate                |
| ------------ | ------------------- |
| format-check | Gate 2 (formatting) |
| lint         | Gate 2 (linting)    |

**Pre-push** (full project -- runs before every push):

| Hook      | Gate                |
| --------- | ------------------- |
| typecheck | Gate 1 (TypeScript) |

Gates 3-7 are your responsibility before opening a pull request.

## What to Do When Tests Fail

1. Read the error message carefully
2. Attempt a fix
3. Re-run the failing test
4. If it still fails after two attempts, **stop and ask** rather than spiraling into deeper changes

This prevents cascading fixes that introduce new problems.
