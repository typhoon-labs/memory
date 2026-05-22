/**
 * Dataset Items E2E tests — verifies item create/edit/delete within a dataset.
 *
 * Requires a live stack: bun run docker:up
 * Usage: bun run test:e2e
 */

import { type Browser, type BrowserContext, chromium, type Page } from 'playwright';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { ADMIN_URL, injectTestSession } from '../helpers/e2e-utils';

describe('Dataset Items E2E', () => {
  let browser: Browser;
  let context: BrowserContext;
  let page: Page;
  let datasetId: string | undefined;
  const datasetName = `E2E Items Dataset ${Date.now()}`;
  const itemQuestion = `E2E item question ${Date.now()}`;
  const itemAnswer = 'E2E expected answer';

  beforeAll(async () => {
    browser = await chromium.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });
    ({ context, page } = await injectTestSession(browser, 'admin@typhoon.local'));
    await page.goto(ADMIN_URL);

    // Create a dataset to hold test items
    const result = await page.evaluate(async (name) => {
      const res = await fetch('/api/v1/admin/datasets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ name, description: 'E2E test' }),
      });
      return res.json();
    }, datasetName);
    datasetId = (result as { id: string }).id;
  }, 30_000);

  afterAll(async () => {
    if (datasetId && page) {
      await page
        .evaluate(async (id) => {
          await fetch(`/api/v1/admin/datasets/${id}`, { method: 'DELETE', credentials: 'include' });
        }, datasetId)
        .catch(() => {});
    }
    await context?.close();
    await browser?.close();
  });

  it('navigates to the dataset detail page', async () => {
    await page.goto(`${ADMIN_URL}/datasets/${datasetId}`);
    await page.waitForSelector('h1', { timeout: 10_000 });
    const headingText = await page.textContent('h1');
    expect(headingText).toContain(datasetName);
  });

  it('navigates to the add item page', async () => {
    await page.click('a:has-text("Add Item")');
    await page.waitForURL('**/items/create', { timeout: 5_000 });
    const headingText = await page.textContent('h1');
    expect(headingText).toContain('Add Item');
  });

  it('fills the form and creates an item', async () => {
    await page.fill('#item-input', itemQuestion);
    await page.fill('#item-output', itemAnswer);

    await page.click('button:has-text("Add Item")');
    await page.waitForURL(`**/datasets/${datasetId}`, { timeout: 10_000 });
    // Should NOT be on /items/create anymore
    expect(page.url()).not.toContain('items/create');
  });

  it('new item appears in the table', async () => {
    await page.waitForFunction((q) => document.body.textContent?.includes(q), itemQuestion, { timeout: 10_000 });
    const bodyText = await page.textContent('body');
    expect(bodyText).toContain(itemQuestion);
  });

  it('can click row to navigate to item detail', async () => {
    const row = page.locator(`tr:has-text("${itemQuestion}")`).first();
    await row.click();
    await page.waitForURL('**/items/**', { timeout: 10_000 });
    expect(page.url()).toMatch(/\/items\/.+/);
    expect(page.url()).not.toContain('create');
  });

  it('item detail page shows pre-populated form', async () => {
    await page.waitForSelector('#item-input', { timeout: 5_000 });
    const inputValue = await page.inputValue('#item-input');
    const outputValue = await page.inputValue('#item-output');
    expect(inputValue).toBe(itemQuestion);
    expect(outputValue).toBe(itemAnswer);
  });

  it('can edit and save the item', async () => {
    await page.fill('#item-input', `${itemQuestion} updated`);
    await page.click('button:has-text("Save")');
    await page.waitForURL(`**/datasets/${datasetId}`, { timeout: 10_000 });

    await page.waitForFunction((q) => document.body.textContent?.includes(q), `${itemQuestion} updated`, {
      timeout: 10_000,
    });
    const bodyText = await page.textContent('body');
    expect(bodyText).toContain(`${itemQuestion} updated`);
  });

  it('can delete the item from the edit page', async () => {
    const row = page.locator(`tr:has-text("${itemQuestion} updated")`).first();
    await row.click();
    await page.waitForURL('**/items/**', { timeout: 10_000 });

    await page.click('button:has-text("Delete")');
    await page.waitForSelector('[role="alertdialog"]', { timeout: 5_000 });
    await page.locator('[role="alertdialog"] button:has-text("Delete")').click();
    await page.waitForURL(`**/datasets/${datasetId}`, { timeout: 10_000 });

    // Wait for item to disappear from the list after re-fetch
    await page.waitForFunction((q) => !document.body.textContent?.includes(q), `${itemQuestion} updated`, {
      timeout: 10_000,
    });
  });
});
