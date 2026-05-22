/**
 * Sync Sources E2E tests — verifies sync target CRUD lifecycle in the Admin app.
 *
 * Requires a live stack: bun run docker:up
 * Usage: bun run test:e2e
 */

import { type Browser, type BrowserContext, chromium, type Page } from 'playwright';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { ADMIN_URL, injectTestSession } from '../helpers/e2e-utils';

describe('Sync Sources E2E', () => {
  let browser: Browser;
  let context: BrowserContext;
  let page: Page;
  const sourceName = `E2E Test Source ${Date.now()}`;
  let createdSourceId: string | undefined;

  beforeAll(async () => {
    browser = await chromium.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });
    ({ context, page } = await injectTestSession(browser, 'admin@typhoon.local'));
  }, 30_000);

  afterAll(async () => {
    if (createdSourceId && page) {
      await page
        .evaluate(async (id) => {
          await fetch(`/api/v1/sync-targets/${id}`, { method: 'DELETE', credentials: 'include' });
        }, createdSourceId)
        .catch(() => {});
    }
    await context?.close();
    await browser?.close();
  });

  it('navigates to /sources and renders the "Sync Sources" heading', async () => {
    await page.goto(`${ADMIN_URL}/sources`);
    await page.waitForSelector('h1, h2', { timeout: 10_000 });
    const headingText = await page.textContent('h1, h2');
    expect(headingText).toMatch(/Sync Sources/i);
  });

  it('renders the "Add Source" link', async () => {
    const addLink = page.locator('a:has-text("Add Source")');
    expect(await addLink.count()).toBe(1);
  });

  it('navigates to the add source page', async () => {
    await page.click('a:has-text("Add Source")');
    await page.waitForURL('**/sources/create', { timeout: 5_000 });
    const headingText = await page.textContent('h1');
    expect(headingText).toContain('Add Source');
  });

  it('fills the name field and selects a source type', async () => {
    await page.fill('input[id="source-name"]', sourceName);

    const combobox = page.locator('[role="combobox"]').first();
    await combobox.click();
    await page.waitForSelector('[role="option"]', { timeout: 5_000 });
    await page.locator('[role="option"]').first().click();

    const bucketInput = page.locator('input[id="source-bucket"]');
    if (await bucketInput.isVisible()) {
      await bucketInput.fill('e2e-test-bucket');
    }
  });

  it('submits the form and creates the sync target', async () => {
    const createBtn = page.locator('button:has-text("Create"):not([disabled])');
    await createBtn.waitFor({ state: 'visible', timeout: 5_000 });
    await createBtn.click();
    await page.waitForFunction(() => !window.location.pathname.includes('create'), { timeout: 10_000 });
  });

  it('new sync target appears in the sources table', async () => {
    await page.goto(`${ADMIN_URL}/sources`);
    await page.waitForFunction((name) => document.body.textContent?.includes(name), sourceName, { timeout: 10_000 });
    const tableText = await page.textContent('body');
    expect(tableText).toContain(sourceName);
  });

  it('can navigate to the sync target detail page', async () => {
    const row = page.locator(`tr:has-text("${sourceName}")`).first();
    await row.click();
    await page.waitForFunction(() => !window.location.pathname.endsWith('/sources'), { timeout: 10_000 });
    expect(page.url()).toMatch(/\/sources\/.+/);

    createdSourceId = page.url().split('/sources/')[1]?.split('?')[0];
  });

  it('detail page shows sync target name in the heading', async () => {
    await page.waitForSelector('h1', { timeout: 5_000 });
    const headingText = await page.textContent('h1');
    expect(headingText).toContain(sourceName);
  });

  it('detail page has Overview, Documents, and Sync Log tabs', async () => {
    const tabList = page.locator('[role="tablist"]');
    await page.waitForSelector('[role="tablist"]', { timeout: 5_000 });
    const tabText = await tabList.textContent();
    expect(tabText).toMatch(/Overview/i);
    expect(tabText).toMatch(/Documents/i);
    expect(tabText).toMatch(/Sync Log/i);
  });
});
