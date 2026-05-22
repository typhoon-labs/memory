# Testing

Typhoon uses Vitest for all testing: unit, integration, and E2E. Tests run via a root vitest workspace -- there are no per-package test scripts.

## Test Commands

| Command                    | What it runs                      | Requires                                 |
| -------------------------- | --------------------------------- | ---------------------------------------- |
| `bun run test`             | All unit tests (vitest workspace) | Nothing                                  |
| `bun run test:watch`       | Unit tests in watch mode          | Nothing                                  |
| `bun run test:coverage`    | Unit tests with coverage report   | Nothing                                  |
| `bun run test:integration` | PostgreSQL integration tests      | `DATABASE_URL` + running PostgreSQL      |
| `bun run test:e2e`         | E2E tests via Playwright          | Full stack running (`bun run docker:up`) |

## Unit Tests

### Location and Naming

Unit tests are **co-located** with source files:

```
packages/services/src/
  sync-target-service.ts
  sync-target-service.test.ts      # Unit test
apps/admin/src/components/pages/
  scorers.tsx
  scorers.test.tsx                  # Component test
```

The naming convention:

- `.test.ts` for TypeScript modules
- `.test.tsx` for React components

### Vitest Workspace

The root `vitest.config.ts` defines a workspace with projects for every package and app:

```typescript
projects: [
  'packages/config/vitest.config.ts',
  'packages/types/vitest.config.ts',
  'packages/db/vitest.config.ts',
  'packages/blob-store/vitest.config.ts',
  'packages/agents/vitest.config.ts',
  'packages/evals/vitest.config.ts',
  'packages/queue/vitest.config.ts',
  'packages/ingestion/vitest.config.ts',
  'packages/chat/vitest.config.ts',
  'packages/ai/vitest.config.ts',
  'packages/logger/vitest.config.ts',
  'packages/telemetry/vitest.config.ts',
  'packages/services/vitest.config.ts',
  'packages/ui/vitest.config.ts',
  'packages/api-client/vitest.config.ts',
  'apps/api/vitest.config.ts',
  'apps/desk/vitest.config.ts',
  'apps/admin/vitest.config.ts',
  'apps/worker/vitest.config.ts',
  'apps/scheduler/vitest.config.ts',
];
```

Each project can define its own environment (e.g., `happy-dom` for React components) and setup files.

### Running Specific Tests

```bash
# Run all tests
bun run test

# Run tests matching a pattern
bunx vitest run --filter "sync-target"

# Run tests in a specific package
bunx vitest run --project @typhoon/services

# Watch mode (re-runs on file change)
bun run test:watch
```

## Coverage

### Thresholds

Coverage thresholds are configured in the root `vitest.config.ts`:

| Metric    | Threshold | Current (approx.) |
| --------- | --------- | ----------------- |
| Lines     | 85%       | ~90%              |
| Branches  | 75%       | ~80%              |
| Functions | 80%       | ~86%              |

### Excluded from Coverage

The following paths are excluded because they are tested via integration tests, are declarative/vendor-like, or are test infrastructure:

- `packages/db/src/drivers/**` -- Driver storage (covered by integration tests)
- `packages/db/src/schema/**` -- Declarative Drizzle schemas
- `packages/db/src/repos/**` -- Thin query wrappers
- `packages/db/src/client.ts`, `packages/db/src/connection.ts` -- DB client setup
- `tests/**` -- Test infrastructure itself
- `packages/ui/src/components/ui/**` -- shadcn/ui vendor-like primitives

### Running Coverage

```bash
bun run test:coverage
```

This generates a coverage report and fails if any threshold is not met.

### Coverage Requirement for New Code

Every new or modified source file must have a co-located `*.test.ts` (or `*.test.tsx`) with at least **80% line coverage**. Verify by checking `git diff --name-only` that every changed source file has a corresponding test file.

## Frontend Component Testing

### Environment

Both `apps/admin` and `apps/desk` vitest configs set up:

- **Environment:** `happy-dom` for `.test.tsx` files
- **Setup files:** Logger mock (`tests/setup/logger-mock.ts`) and DOM cleanup (`tests/setup/dom-cleanup.ts`)

### Test Utilities

Each app provides a `renderWithQueryClient()` wrapper that creates an isolated TanStack Query client with retries disabled and garbage collection time set to zero:

```typescript
// apps/admin/src/test-utils.ts or apps/desk/src/test-utils.ts
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render } from '@testing-library/react';

export function renderWithQueryClient(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
    },
  });
  return render(
    <QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>
  );
}
```

### Standard Mocking Pattern (Page Tests)

Most page tests follow this pattern for mocking TanStack Router and shared modules:

```tsx
const navigateMock = vi.fn();

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, to }: Record<string, unknown>) => <a href={to as string}>{children as React.ReactNode}</a>,
  useNavigate: () => navigateMock,
  useParams: () => ({}),
  useSearch: () => ({}),
}));

vi.mock('../../hooks/use-page-title', () => ({
  usePageTitle: vi.fn(),
  detailTitle: vi.fn(),
}));

vi.mock('@typhoon/ui', async () => {
  const actual = await vi.importActual<typeof import('@typhoon/ui')>('@typhoon/ui');
  return { ...actual, apiFetch: vi.fn() };
});
```

### Common Test Patterns

**Column cell renderers (DataTable):**
Render the DataTable component with sample data rows. Each column's `cell:` function executes automatically during render, giving you coverage without explicitly invoking it.

**Mutation handlers:**
Mock `apiFetch`, trigger the mutation with `userEvent.click()`, and verify with `await waitFor()`:

```tsx
const mockApiFetch = vi.mocked(apiFetch);
mockApiFetch.mockResolvedValueOnce({ id: '1', name: 'Test' });

await userEvent.click(screen.getByText('Save'));
await waitFor(() => {
  expect(mockApiFetch).toHaveBeenCalledWith(
    '/api/v1/targets',
    expect.objectContaining({
      method: 'POST',
    }),
  );
});
```

**AlertDialog flows:**
Click the trigger button, assert the dialog content appears, click confirm, verify the mutation:

```tsx
await userEvent.click(screen.getByText('Delete'));
expect(screen.getByText('Are you sure?')).toBeInTheDocument();
await userEvent.click(screen.getByText('Confirm'));
await waitFor(() => {
  expect(mockApiFetch).toHaveBeenCalledWith(expect.stringContaining('/delete'), expect.any(Object));
});
```

**Radix Select components:**
In `happy-dom`, Radix pointer event checks can fail. Disable them:

```tsx
const user = userEvent.setup({ pointerEventsCheck: 0 });
await user.click(screen.getByRole('combobox'));
await user.click(screen.getByText('Option A'));
```

**File upload:**

```tsx
const file = new File(['content'], 'data.csv', { type: 'text/csv' });
const input = screen.getByLabelText('Upload');
fireEvent.change(input, { target: { files: [file] } });
```

**Keyboard shortcuts:**

```tsx
fireEvent.keyDown(document, { key: 'F3' });
expect(screen.getByRole('searchbox')).toHaveFocus();
```

## Integration Tests

Integration tests verify the PostgreSQL driver layer with a real database.

### Location

```
packages/db/src/drivers/pg/*.integration.test.ts
```

### Configuration

Defined in `vitest.integration.config.ts` at the project root:

```typescript
export default defineConfig({
  test: {
    include: ['packages/db/src/drivers/pg/*.integration.test.ts'],
    testTimeout: 30_000,
  },
});
```

### Requirements

- PostgreSQL running (via `bun run docker:up`)
- `DATABASE_URL` set (default: `postgresql://typhoon:typhoon@localhost:5432/typhoon`)

### Running

```bash
bun run test:integration
```

## E2E Tests

End-to-end tests use Playwright (via Vitest) to automate browser interactions.

### Location

```
tests/e2e/**/*.e2e.ts
```

### Configuration

Defined in `vitest.e2e.config.ts` at the project root:

```typescript
export default defineConfig({
  test: {
    include: ['tests/e2e/**/*.e2e.ts'],
    globalSetup: ['tests/e2e/setup.ts'],
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});
```

### Requirements

- Full stack running: `bun run docker:up` + `bun run dev`
- No Playwright MCP browser open (it holds a `SingletonLock` on Chromium)
- Headless mode (the default)

### Running

```bash
# Ensure no browser lock
pkill -f chromium || true

bun run test:e2e
```

### Authentication in E2E Tests

E2E tests use **programmatic session injection** instead of the OIDC browser flow. This eliminates Dex as a dependency and is much faster/more reliable.

**Key files:**

- `tests/helpers/test-auth.ts` -- Better Auth instance with `testUtils()` plugin. Creates real sessions directly in PostgreSQL (shared DB with the running API server)
- `tests/helpers/e2e-utils.ts` -- Playwright helpers that inject sessions into browser contexts

**How it works:**

```typescript
import { injectTestSession, ADMIN_URL } from '../helpers/e2e-utils';

// Creates a real session in the DB, injects the signed cookie into a new Playwright context
const { context, page } = await injectTestSession(browser, 'admin@typhoon.local');
await page.goto(ADMIN_URL);
// Page is now authenticated -- no OIDC flow needed
```

**Available helpers:**

| Function             | Description                                                                  |
| -------------------- | ---------------------------------------------------------------------------- |
| `injectTestSession`  | Creates authenticated Playwright context + page for a given user email       |
| `getTestCookies`     | Returns signed session cookies (lower-level, used by `injectTestSession`)    |
| `resolveUserByEmail` | Looks up a user ID by email. Throws if not found (database must be seeded)   |
| `teardownTestAuth`   | Closes the test DB connection pool. Called in global teardown                 |
| `oidcLogin`          | Browser-based OIDC login via Dex. **Only used in `auth.e2e.ts`** to test the OIDC flow itself |

**When to use which:**

- `injectTestSession` -- all E2E tests except auth tests (fast, no Dex dependency)
- `oidcLogin` -- only `auth.e2e.ts` which specifically validates the OIDC redirect flow

**Environment variables:**

| Variable    | Default                  | Description        |
| ----------- | ------------------------ | ------------------ |
| `DESK_URL`  | `http://localhost:5173`  | Desk app base URL  |
| `ADMIN_URL` | `http://localhost:5174`  | Admin app base URL |

## Mocking Conventions

### `vi.mock()` with `vi.hoisted()`

When mock variables need to be referenced inside the `vi.mock()` factory function, use `vi.hoisted()` to hoist them above the mock:

```typescript
const { mockQueue } = vi.hoisted(() => ({
  mockQueue: { add: vi.fn(), close: vi.fn() },
}));

vi.mock('bullmq', () => ({
  Queue: class MockQueue {
    add = mockQueue.add;
    close = mockQueue.close;
  },
}));
```

### Mastra and BullMQ Class Mocks

For classes that are instantiated with `new`, use real `class` syntax in the mock. Arrow functions and `vi.fn().mockImplementation()` fail as constructors:

```typescript
// Correct
vi.mock('@mastra/core', () => ({
  Agent: class MockAgent {
    generate = vi.fn();
  },
}));

// Incorrect -- will throw "not a constructor"
vi.mock('@mastra/core', () => ({
  Agent: vi.fn().mockImplementation(() => ({ generate: vi.fn() })),
}));
```

### BullMQ Queue Mocks

Same pattern -- use `class` syntax:

```typescript
vi.mock('bullmq', () => ({
  Queue: class MockQueue {
    add = vi.fn();
    close = vi.fn();
  },
}));
```

### RedisProvider Worker Mocks

Workers call `redis.createWorker()`, not `new Worker()` directly. Mock `RedisProvider` accordingly:

```typescript
const { mockCtor, mockInstance } = vi.hoisted(() => ({
  mockCtor: vi.fn(),
  mockInstance: { on: vi.fn(), close: vi.fn(), run: vi.fn() },
}));

vi.mock('@typhoon/queue', () => ({
  RedisProvider: class {
    createWorker(...args: unknown[]) {
      mockCtor(...args);
      return mockInstance;
    }
  },
}));
```

## Tips

- **Fail fast:** If tests fail, attempt a fix at most twice. If still failing, stop and ask -- do not spiral.
- **Watch mode:** Use `bun run test:watch` during active development for instant feedback.
- **Single test file:** Pass the file path to vitest: `bunx vitest run path/to/file.test.ts`.
- **Debug output:** Tests suppress console output by default (logger mock). To see logs, temporarily remove the logger mock from the vitest config's `setupFiles`.
