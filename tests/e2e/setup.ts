/**
 * E2E global setup — runs before all E2E test suites.
 *
 * Checks that the Docker stack services are reachable. If they aren't,
 * fails fast with an actionable message instead of letting every test
 * time out individually.
 */

const SERVICES = [
  { name: 'API', url: process.env.API_URL ?? 'http://localhost:5172' },
  { name: 'Desk', url: process.env.DESK_URL ?? 'http://localhost:5173' },
  { name: 'Admin', url: process.env.ADMIN_URL ?? 'http://localhost:5174' },
];

export async function setup() {
  const failures: string[] = [];

  for (const svc of SERVICES) {
    try {
      const res = await fetch(svc.url, { signal: AbortSignal.timeout(3_000) });
      if (!res.ok && res.status >= 500) {
        failures.push(`${svc.name} (${svc.url}): HTTP ${String(res.status)}`);
      }
    } catch {
      failures.push(`${svc.name} (${svc.url}): unreachable`);
    }
  }

  if (failures.length > 0) {
    throw new Error(
      `E2E setup failed — required services are not running:\n${failures.map((f) => `  - ${f}`).join('\n')}\n\nStart the full stack with: bun run docker:up`,
    );
  }
}
