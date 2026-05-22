/**
 * Scorers E2E tests — verifies scorer CRUD lifecycle in the Admin app.
 *
 * Requires a live stack: bun run docker:up
 * Usage: bun run test:e2e
 */

import { type Browser, type BrowserContext, chromium, type Page } from 'playwright';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { ADMIN_URL, injectTestSession } from '../helpers/e2e-utils';

describe('Scorers E2E', () => {
  let browser: Browser;
  let context: BrowserContext;
  let page: Page;
  const scorerName = `E2E Scorer ${Date.now()}`;
  let createdScorerId: string | undefined;

  beforeAll(async () => {
    browser = await chromium.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });
    ({ context, page } = await injectTestSession(browser, 'admin@typhoon.local'));
  }, 30_000);

  afterAll(async () => {
    if (createdScorerId && page) {
      await page
        .evaluate(async (id) => {
          await fetch(`/api/v1/admin/scorers/${id}`, { method: 'DELETE', credentials: 'include' });
        }, createdScorerId)
        .catch(() => {});
    }
    await context?.close();
    await browser?.close();
  });

  it('navigates to /scorers and renders heading', async () => {
    await page.goto(`${ADMIN_URL}/scorers`);
    await page.waitForSelector('h1', { timeout: 10_000 });
    const headingText = await page.textContent('h1');
    expect(headingText).toContain('Scorers');
  });

  it('renders a table or empty state', async () => {
    const tableCount = await page.locator('table, [role="table"]').count();
    const emptyCount = await page.locator(':text("No scorers")').count();
    expect(tableCount + emptyCount).toBeGreaterThan(0);
  });

  it('navigates to the create scorer page', async () => {
    await page.click('a:has-text("Create Scorer")');
    await page.waitForURL('**/scorers/create', { timeout: 5_000 });
    const headingText = await page.textContent('h1');
    expect(headingText).toContain('Create');
  });

  it('fills the form and creates a scorer', async () => {
    await page.fill('#scorer-name', scorerName);
    // Type defaults to "faithfulness" — leave as is

    const createBtn = page.locator('button:has-text("Create")');
    await createBtn.click();
    await page.waitForURL('**/scorers/**', { timeout: 10_000 });
    expect(page.url()).toMatch(/\/scorers\/.+/);

    createdScorerId = page.url().split('/scorers/')[1]?.split('?')[0];
  });

  it('detail page shows scorer name', async () => {
    await page.waitForSelector('h1', { timeout: 5_000 });
    const headingText = await page.textContent('h1');
    expect(headingText).toContain(scorerName);
  });

  it('scorer appears in the list', async () => {
    await page.goto(`${ADMIN_URL}/scorers`);
    await page.waitForFunction((name) => document.body.textContent?.includes(name), scorerName, { timeout: 10_000 });
    const bodyText = await page.textContent('body');
    expect(bodyText).toContain(scorerName);
  });
});
