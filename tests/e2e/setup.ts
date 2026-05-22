/**
 * E2E global setup — runs before all E2E test suites.
 *
 * Checks that the Docker stack services are reachable. Fails fast with
 * actionable messages instead of letting every test time out individually.
 */

const SERVICES = [
  { name: 'API', url: process.env.API_URL ?? 'http://localhost:5172' },
  { name: 'Desk', url: process.env.DESK_URL ?? 'http://localhost:5173' },
  { name: 'Admin', url: process.env.ADMIN_URL ?? 'http://localhost:5174' },
];

export async function setup() {
  const results = await Promise.all(
    SERVICES.map(async (svc) => {
      try {
        const res = await fetch(svc.url, { signal: AbortSignal.timeout(3_000) });
        if (!res.ok && res.status >= 500) {
          return `${svc.name} (${svc.url}): HTTP ${String(res.status)}`;
        }
        return null;
      } catch {
        return `${svc.name} (${svc.url}): unreachable`;
      }
    }),
  );
  const failures = results.filter((r): r is string => r !== null);

  if (failures.length > 0) {
    throw new Error(
      `E2E setup failed — required services are not running:\n${failures.map((f) => `  - ${f}`).join('\n')}\n\nStart the full stack with: bun run docker:up`,
    );
  }
}

export async function teardown() {
  const { teardownTestAuth } = await import('../helpers/test-auth');
  await teardownTestAuth();
}
