/**
 * Experiments E2E tests — verifies experiment listing and UI flows in the Admin app.
 *
 * Requires a live stack: bun run docker:up
 * Usage: bun run test:e2e
 */

import { type Browser, chromium, type Page } from 'playwright';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ADMIN_URL, oidcLogin } from '../helpers/e2e-utils';

describe('Experiments E2E', () => {
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

  it('navigates to /experiments and renders heading', async () => {
    await page.goto(`${ADMIN_URL}/experiments`);
    await page.waitForSelector('h1, h2', { timeout: 10_000 });
    const headingText = await page.textContent('h1, h2');
    expect(headingText).toContain('Experiments');
  });

  it('renders a table or empty state', async () => {
    const tableCount = await page.locator('table, [role="table"]').count();
    const emptyCount = await page.locator(':text("No experiments")').count();
    expect(tableCount + emptyCount).toBeGreaterThan(0);
  });

  it('shows the "Run Experiment" button', async () => {
    const btn = page.locator('button:has-text("Run Experiment")');
    expect(await btn.count()).toBe(1);
  });

  it('has a status filter dropdown', async () => {
    const select = page.locator('[role="combobox"]').first();
    expect(await select.count()).toBeGreaterThan(0);
  });

  it('can navigate to experiment detail when experiments exist', async () => {
    const rows = page.locator('tbody tr');
    if ((await rows.count()) === 0) return;

    await rows.first().click();
    await page.waitForURL('**/experiments/**', { timeout: 10_000 });
    expect(page.url()).toMatch(/\/experiments\/.+/);
  });
});
