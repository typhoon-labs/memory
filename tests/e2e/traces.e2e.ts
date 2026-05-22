/**
 * Traces E2E tests — verifies the observability trace viewer in the Admin app.
 *
 * Requires a live stack: bun run docker:up
 * Usage: bun run test:e2e
 */

import { type Browser, type BrowserContext, chromium, type Page } from 'playwright';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { ADMIN_URL, injectTestSession } from '../helpers/e2e-utils';

describe('Traces E2E', () => {
  let browser: Browser;
  let context: BrowserContext;
  let page: Page;

  beforeAll(async () => {
    browser = await chromium.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });
    ({ context, page } = await injectTestSession(browser, 'admin@typhoon.local'));
  }, 30_000);

  afterAll(async () => {
    await context?.close();
    await browser?.close();
  });

  it('navigates to /traces and renders heading', async () => {
    await page.goto(`${ADMIN_URL}/traces`);
    await page.waitForSelector('h1, h2', { timeout: 10_000 });
    const headingText = await page.textContent('h1, h2');
    expect(headingText).toContain('Traces');
  });

  it('renders a table or empty state', async () => {
    const tableCount = await page.locator('table, [role="table"]').count();
    const emptyCount = await page.locator(':text("No traces")').count();
    expect(tableCount + emptyCount).toBeGreaterThan(0);
  });

  it('has a status filter', async () => {
    await page.waitForSelector('[role="combobox"]', { timeout: 5_000 });
    const selectCount = await page.locator('[role="combobox"]').count();
    expect(selectCount).toBeGreaterThan(0);
  });

  it('has a search input', async () => {
    await page.waitForSelector('input[placeholder*="Search"]', { timeout: 5_000 });
    const search = page.locator('input[placeholder*="Search"]');
    expect(await search.count()).toBeGreaterThan(0);
  });

  it('can navigate to trace detail when traces exist', async () => {
    // Exclude the "No results" row
    const rows = page.locator('tbody tr:not(:has-text("No results"))');
    if ((await rows.count()) === 0) return;

    await rows.first().click();
    await page.waitForURL('**/traces/**', { timeout: 10_000 });
    expect(page.url()).toMatch(/\/traces\/.+/);

    // Wait for trace detail content to load
    await page.waitForSelector('h1, h2', { timeout: 10_000 });
  });
});
