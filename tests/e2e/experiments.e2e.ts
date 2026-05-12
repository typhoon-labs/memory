/**
 * Experiments E2E tests — verifies experiment listing and creation flows in the Admin app.
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

  it('shows the "Run Experiment" link', async () => {
    const link = page.locator('a:has-text("Run Experiment")');
    expect(await link.count()).toBe(1);
  });

  it('navigates to the create experiment page', async () => {
    await page.click('a:has-text("Run Experiment")');
    await page.waitForURL('**/experiments/create', { timeout: 5_000 });
    const headingText = await page.textContent('h1');
    expect(headingText).toContain('Run Experiment');
  });

  it('create page has name field and dataset selector', async () => {
    const nameInput = page.locator('#experiment-name');
    expect(await nameInput.count()).toBe(1);

    const combobox = page.locator('[role="combobox"]');
    expect(await combobox.count()).toBeGreaterThan(0);
  });

  it('cancel returns to experiments list', async () => {
    await page.click('button:has-text("Cancel")');
    await page.waitForURL('**/experiments**', { timeout: 5_000 });
    const headingText = await page.textContent('h1');
    expect(headingText).toContain('Experiments');
  });

  it('has a status filter dropdown when experiments exist', async () => {
    // The toolbar (with combobox) only renders when there are experiments — skip in empty state
    const emptyState = await page.locator(':text("No experiments")').count();
    if (emptyState > 0) return;

    await page.waitForSelector('[role="combobox"]', { timeout: 5_000 });
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
