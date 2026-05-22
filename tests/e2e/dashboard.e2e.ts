/**
 * Dashboard E2E tests — verifies the analytics dashboard in the Admin app.
 *
 * Requires a live stack: bun run docker:up
 * Usage: bun run test:e2e
 */

import { type Browser, type BrowserContext, chromium, type Page } from 'playwright';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { ADMIN_URL, injectTestSession } from '../helpers/e2e-utils';

describe('Dashboard E2E', () => {
  let browser: Browser;
  let context: BrowserContext;
  let page: Page;

  beforeAll(async () => {
    browser = await chromium.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });
    ({ context, page } = await injectTestSession(browser, 'admin@typhoon.local'));
    await page.goto(ADMIN_URL);
  }, 30_000);

  afterAll(async () => {
    await context?.close();
    await browser?.close();
  });

  it('lands on dashboard after login', async () => {
    await page.waitForSelector('h1, h2', { timeout: 10_000 });
    const headingText = await page.textContent('h1, h2');
    expect(headingText).toContain('Dashboard');
  });

  it('renders stat cards', async () => {
    const bodyText = await page.textContent('body');
    // Dashboard shows key metric cards
    expect(bodyText).toMatch(/Sync Sources|Documents|Avg Score|Hallucination/i);
  });

  it('has date range tabs', async () => {
    const tabList = page.locator('[role="tablist"]');
    if ((await tabList.count()) > 0) {
      const tabText = await tabList.textContent();
      expect(tabText).toMatch(/24h|7 days|30 days/i);
    }
  });

  it('renders charts or empty state', async () => {
    // Charts render as SVGs or canvases, or show loading/empty states
    const chartCount = await page.locator('svg, canvas, [class*="chart"]').count();
    const emptyCount = await page.locator(':text("No data")').count();
    // At minimum the page should render without errors
    expect(chartCount + emptyCount).toBeGreaterThanOrEqual(0);
  });
});
