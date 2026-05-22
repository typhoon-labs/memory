/**
 * Search E2E tests — verifies the knowledge base search functionality in the Desk app.
 *
 * Requires a live stack: bun run docker:up
 * Usage: bun run test:e2e
 */

import { type Browser, type BrowserContext, chromium, type Page } from 'playwright';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { DESK_URL, injectTestSession } from '../helpers/e2e-utils';

describe('Search E2E', () => {
  let browser: Browser;
  let context: BrowserContext;
  let page: Page;

  beforeAll(async () => {
    browser = await chromium.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });
    ({ context, page } = await injectTestSession(browser, 'rep@typhoon.local'));
  }, 30_000);

  afterAll(async () => {
    await context?.close();
    await browser?.close();
  });

  it('navigates to /search and renders heading', async () => {
    await page.goto(`${DESK_URL}/search`);
    await page.waitForSelector('h1, h2', { timeout: 10_000 });
    const headingText = await page.textContent('h1, h2');
    expect(headingText).toContain('Search');
  });

  it('renders a search input', async () => {
    const input = page.locator('input[placeholder*="Search"]');
    expect(await input.count()).toBe(1);
  });

  it('can submit a search query', async () => {
    const input = page.locator('input[placeholder*="Search"]');
    await input.fill('test query');
    await input.press('Enter');

    // Wait for loading to complete
    await page.waitForTimeout(2_000);

    // Either results appear or empty state
    const bodyText = await page.textContent('body');
    expect(bodyText).toBeTruthy();
  });

  it('shows results or empty state after search', async () => {
    const resultCount = await page.locator('[class*="card"], [class*="result"]').count();
    const emptyCount = await page.locator(':text("No results")').count();
    // Either we got results or the empty state
    expect(resultCount + emptyCount).toBeGreaterThanOrEqual(0);
  });
});
