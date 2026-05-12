/**
 * Queues E2E tests — verifies queue monitoring UI in the Admin app.
 *
 * Requires a live stack: bun run docker:up
 * Usage: bun run test:e2e
 */

import { type Browser, chromium, type Page } from 'playwright';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ADMIN_URL, oidcLogin } from '../helpers/e2e-utils';

describe('Queues E2E', () => {
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

  it('navigates to /queues and renders the "Queues" heading', async () => {
    await page.goto(`${ADMIN_URL}/queues`);
    await page.waitForSelector('h1, h2', { timeout: 10_000 });
    const headingText = await page.textContent('h1, h2');
    expect(headingText).toContain('Queues');
  });

  it('renders a table or empty state on the queues page', async () => {
    const tableCount = await page.locator('table, [role="table"]').count();
    const emptyCount = await page.locator(':text("No queues")').count();
    expect(tableCount + emptyCount).toBeGreaterThan(0);
  });

  it('shows the sync queue row when the worker has connected', async () => {
    const tableCount = await page.locator('table, [role="table"]').count();
    if (tableCount === 0) return;
    const tableText = await page.textContent('table, [role="table"]');
    expect(tableText).toMatch(/sync/i);
  });

  it('can navigate to the queue detail page', async () => {
    const rows = page.locator('tbody tr');
    if ((await rows.count()) === 0) return;

    await rows.first().click();
    await page.waitForURL('**/queues/**', { timeout: 10_000 });
    expect(page.url()).toMatch(/\/queues\/.+/);
  });

  it('queue detail page shows Overview and Jobs tabs', async () => {
    if (!page.url().includes('/queues/')) return;

    const tabList = page.locator('[role="tablist"]');
    if ((await tabList.count()) === 0) return;

    const tabText = await tabList.textContent();
    expect(tabText).toMatch(/Overview/i);
    expect(tabText).toMatch(/Jobs/i);
  });
});
