/**
 * RBAC E2E tests — verifies admin vs rep role-based access in the UI.
 *
 * Requires a live stack: bun run docker:up
 * Usage: bun run test:e2e
 */

import { type Browser, type BrowserContext, chromium, type Page } from 'playwright';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { ADMIN_URL, DESK_URL, injectTestSession } from '../helpers/e2e-utils';

describe('RBAC E2E', () => {
  let browser: Browser;

  beforeAll(async () => {
    browser = await chromium.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });
  }, 30_000);

  afterAll(async () => {
    await browser?.close();
  });

  // ── Admin Role ───────────────────────────────────────────────────────────

  describe('Admin user', () => {
    let context: BrowserContext;
    let page: Page;

    beforeAll(async () => {
      ({ context, page } = await injectTestSession(browser, 'admin@typhoon.local'));
    });

    afterAll(async () => {
      await context?.close();
    });

    it('can access admin dashboard', async () => {
      await page.goto(ADMIN_URL);
      await page.waitForSelector('nav, [role="navigation"]', { timeout: 10_000 });

      // Admin should see the full navigation
      const navText = await page.textContent('nav, [role="navigation"]');
      expect(navText).toBeTruthy();
    });

    it('can access sync sources page', async () => {
      await page.goto(`${ADMIN_URL}/sync-sources`);
      await page.waitForSelector('h1', { timeout: 10_000 });
      const heading = await page.textContent('h1');
      expect(heading).toContain('Sync Sources');
    });

    it('can access scorers page', async () => {
      await page.goto(`${ADMIN_URL}/scorers`);
      await page.waitForSelector('h1', { timeout: 10_000 });
      const heading = await page.textContent('h1');
      expect(heading).toContain('Scorers');
    });

    it('can access experiments page', async () => {
      await page.goto(`${ADMIN_URL}/experiments`);
      await page.waitForSelector('h1', { timeout: 10_000 });
      const heading = await page.textContent('h1');
      expect(heading).toContain('Experiments');
    });

    it('can access metadata page', async () => {
      await page.goto(`${ADMIN_URL}/metadata/field-groups`);
      await page.waitForSelector('h1', { timeout: 10_000 });
      const heading = await page.textContent('h1');
      expect(heading).toContain('Field Groups');
    });
  });

  // ── Rep Role ─────────────────────────────────────────────────────────────

  describe('Rep user', () => {
    let context: BrowserContext;
    let page: Page;

    beforeAll(async () => {
      ({ context, page } = await injectTestSession(browser, 'rep@typhoon.local'));
    });

    afterAll(async () => {
      await context?.close();
    });

    it('can access desk app', async () => {
      await page.goto(DESK_URL);
      // Rep should land on the desk app (chat or dashboard)
      await page.waitForSelector('nav, [role="navigation"], main', { timeout: 10_000 });
      const url = page.url();
      expect(url).toContain('localhost:5173');
    });

    it('desk has chat navigation', async () => {
      await page.goto(`${DESK_URL}/chat`);
      await page.waitForSelector('main, textarea, [role="navigation"]', { timeout: 10_000 });
      // Just verify the page loads without auth errors
      const url = page.url();
      expect(url).not.toContain('login');
    });
  });
});
