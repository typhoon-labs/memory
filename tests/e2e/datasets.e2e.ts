/**
 * Datasets E2E tests — verifies dataset CRUD lifecycle in the Admin app.
 *
 * Requires a live stack: bun run docker:up
 * Usage: bun run test:e2e
 */

import { type Browser, type BrowserContext, chromium, type Page } from 'playwright';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { ADMIN_URL, injectTestSession } from '../helpers/e2e-utils';

describe('Datasets E2E', () => {
  let browser: Browser;
  let context: BrowserContext;
  let page: Page;
  const datasetName = `E2E Dataset ${Date.now()}`;
  let createdDatasetId: string | undefined;

  beforeAll(async () => {
    browser = await chromium.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });
    ({ context, page } = await injectTestSession(browser, 'admin@typhoon.local'));
  }, 30_000);

  afterAll(async () => {
    if (createdDatasetId && page) {
      await page
        .evaluate(async (id) => {
          await fetch(`/api/v1/admin/datasets/${id}`, { method: 'DELETE', credentials: 'include' });
        }, createdDatasetId)
        .catch(() => {});
    }
    await context?.close();
    await browser?.close();
  });

  it('navigates to /datasets and renders heading', async () => {
    await page.goto(`${ADMIN_URL}/datasets`);
    await page.waitForSelector('h1, h2', { timeout: 10_000 });
    const headingText = await page.textContent('h1, h2');
    expect(headingText).toContain('Datasets');
  });

  it('renders a table or empty state', async () => {
    const tableCount = await page.locator('table, [role="table"]').count();
    const emptyCount = await page.locator(':text("No datasets")').count();
    expect(tableCount + emptyCount).toBeGreaterThan(0);
  });

  it('navigates to the create dataset page', async () => {
    await page.click('a:has-text("Create Dataset")');
    await page.waitForURL('**/datasets/create', { timeout: 5_000 });
    const headingText = await page.textContent('h1');
    expect(headingText).toContain('Create');
  });

  it('fills the form and creates a dataset', async () => {
    await page.fill('#dataset-name', datasetName);
    await page.fill('#dataset-description', 'E2E test dataset');

    const createBtn = page.locator('button:has-text("Create"):not([disabled])');
    await createBtn.waitFor({ state: 'visible', timeout: 5_000 });
    await createBtn.click();
    await page.waitForFunction(() => !window.location.pathname.includes('create'), { timeout: 10_000 });
  });

  it('new dataset appears in the table', async () => {
    // Navigate to the datasets list so the table is visible
    await page.goto(`${ADMIN_URL}/datasets`);
    await page.waitForFunction((name) => document.body.textContent?.includes(name), datasetName, { timeout: 10_000 });
    const bodyText = await page.textContent('body');
    expect(bodyText).toContain(datasetName);
  });

  it('can navigate to dataset detail', async () => {
    const row = page.locator(`tr:has-text("${datasetName}")`).first();
    await row.click();
    await page.waitForFunction(() => !window.location.pathname.endsWith('/datasets'), { timeout: 10_000 });
    expect(page.url()).toMatch(/\/datasets\/.+/);

    createdDatasetId = page.url().split('/datasets/')[1]?.split('?')[0];
  });

  it('detail page shows dataset name', async () => {
    await page.waitForSelector('h1', { timeout: 5_000 });
    const headingText = await page.textContent('h1');
    expect(headingText).toContain(datasetName);
  });
});
