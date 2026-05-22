/**
 * Validates that quality gate infrastructure is correctly wired.
 * These tests catch silent misconfigurations — like a typecheck hook
 * that does nothing, or a health check that uses a missing binary.
 */
import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

const rootDir = new URL('..', import.meta.url).pathname;
const read = (path: string) => readFileSync(`${rootDir}${path}`, 'utf-8');

// ── Lefthook ──────────────────────────────────────────────────────

describe('lefthook.yml', () => {
  const config = read('lefthook.yml');

  it('pre-commit runs format and lint only (fast, file-scoped)', () => {
    // Split at top-level keys and grab the pre-commit section
    const sections = config.split(/^(?=\S)/m);
    const preCommit = sections.find((s) => s.startsWith('pre-commit:')) ?? '';
    expect(preCommit).toContain('format-check');
    expect(preCommit).toContain('lint');
    expect(preCommit).not.toContain('typecheck');
  });

  it('pre-push runs the full turbo typecheck', () => {
    const sections = config.split(/^(?=\S)/m);
    const prePush = sections.find((s) => s.startsWith('pre-push:')) ?? '';
    expect(prePush).toContain('typecheck');
    expect(prePush).toContain('bun run typecheck');
  });

  it('does not use bare tsc --noEmit (no-op with root tsconfig)', () => {
    expect(config).not.toContain('tsc --noEmit');
  });
});

// ── package.json scripts ──────────────────────────────────────────

describe('package.json scripts', () => {
  const pkg = JSON.parse(read('package.json'));

  it('check script includes typecheck', () => {
    expect(pkg.scripts.check).toContain('turbo run typecheck');
  });

  it('check script includes format and lint', () => {
    expect(pkg.scripts.check).toContain('oxfmt');
    expect(pkg.scripts.check).toContain('oxlint');
  });

  it('typecheck script uses turbo', () => {
    expect(pkg.scripts.typecheck).toBe('turbo run typecheck');
  });
});

// ── Docker health checks ─────────────────────────────────────────

describe('Docker health checks', () => {
  const compose = read('infra/docker/docker-compose.yml');
  const dockerfile = read('infra/docker/Dockerfile');

  it('docker-compose does not use wget (not in slim images)', () => {
    expect(compose).not.toContain('wget');
  });

  it('Dockerfile does not use wget (not in slim images)', () => {
    expect(dockerfile).not.toContain('wget');
  });

  it('all HEALTHCHECK directives use curl', () => {
    const healthchecks = dockerfile.match(/HEALTHCHECK[\s\S]*?CMD .*/g) ?? [];
    expect(healthchecks.length).toBeGreaterThan(0);
    for (const hc of healthchecks) {
      expect(hc).toContain('curl');
    }
  });
});
