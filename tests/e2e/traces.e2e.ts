/**
 * Traces E2E tests — verifies the observability trace viewer in the Admin app.
 *
 * Requires a live stack: bun run docker:up
 * Usage: bun run test:e2e
 */

import { type Browser, chromium, type Page } from 'playwright';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ADMIN_URL, oidcLogin } from '../helpers/e2e-utils';

describe('Traces E2E', () => {
  let browser: Browser;
  let page: Page;

  beforeAll(async () => {
    browser = await chromium.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });
    page = await browser.newPage();
    await page.goto(ADMIN_URL);
    await page.waitForURL('**/login', { timeout: 5_000 });
    await oidcLogin(page, 'admin@typhoon.local', 'password', ADMIN_URL);
  }, 30_000);

  afterAll(async () => {
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
    const selectCount = await page.locator('[role="combobox"]').count();
    expect(selectCount).toBeGreaterThan(0);
  });

  it('has a search input', async () => {
    const search = page.locator('input[placeholder*="Search"]');
    expect(await search.count()).toBeGreaterThan(0);
  });

  it('can navigate to trace detail when traces exist', async () => {
    const rows = page.locator('tbody tr');
    if ((await rows.count()) === 0) return;

    await rows.first().click();
    await page.waitForURL('**/traces/**', { timeout: 10_000 });
    expect(page.url()).toMatch(/\/traces\/.+/);

    // Verify span tree renders
    await page.waitForSelector('main', { timeout: 5_000 });
    const mainText = await page.textContent('main');
    expect(mainText).toBeTruthy();
  });
});
