/**
 * Reviews E2E tests — verifies the human review workflow in the Admin app.
 *
 * Requires a live stack: bun run docker:up
 * Usage: bun run test:e2e
 */

import { type Browser, chromium, type Page } from 'playwright';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ADMIN_URL, oidcLogin } from '../helpers/e2e-utils';

describe('Reviews E2E', () => {
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

  it('navigates to /reviews and renders heading', async () => {
    await page.goto(`${ADMIN_URL}/reviews`);
    await page.waitForSelector('h1, h2', { timeout: 10_000 });
    const headingText = await page.textContent('h1, h2');
    expect(headingText).toContain('Reviews');
  });

  it('renders a table or empty state', async () => {
    const tableCount = await page.locator('table, [role="table"]').count();
    const emptyCount = await page.locator(':text("No reviews"), :text("No threads")').count();
    expect(tableCount + emptyCount).toBeGreaterThan(0);
  });

  it('has sort and filter controls', async () => {
    await page.waitForSelector('[role="combobox"]', { timeout: 5_000 });
    const selectCount = await page.locator('[role="combobox"]').count();
    expect(selectCount).toBeGreaterThan(0);
  });

  it('has a search input', async () => {
    await page.waitForSelector('input[placeholder*="Search"]', { timeout: 5_000 });
    const search = page.locator('input[placeholder*="Search"]');
    expect(await search.count()).toBeGreaterThan(0);
  });

  it('can navigate to review detail when threads exist', async () => {
    // Exclude the "No results found." row — only count real data rows
    const rows = page.locator('tbody tr:not(:has-text("No results"))');
    if ((await rows.count()) === 0) return;

    await rows.first().click();
    await page.waitForURL('**/reviews/**', { timeout: 10_000 });
    expect(page.url()).toMatch(/\/reviews\/.+/);

    // Verify messages render
    await page.waitForSelector('main', { timeout: 5_000 });
    const mainText = await page.textContent('main');
    expect(mainText).toBeTruthy();
  });
});
