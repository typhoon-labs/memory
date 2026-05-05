/**
 * Datasets E2E tests — verifies dataset CRUD lifecycle in the Admin app.
 *
 * Requires a live stack: bun run docker:up
 * Usage: bun run test:e2e
 */

import { type Browser, chromium, type Page } from 'playwright';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ADMIN_URL, oidcLogin } from '../helpers/e2e-utils';

describe('Datasets E2E', () => {
  let browser: Browser;
  let page: Page;
  const datasetName = `E2E Dataset ${Date.now()}`;
  let createdDatasetId: string | undefined;

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
    if (createdDatasetId && page) {
      await page
        .evaluate(async (id) => {
          await fetch(`/api/v1/admin/datasets/${id}`, { method: 'DELETE', credentials: 'include' });
        }, createdDatasetId)
        .catch(() => {});
    }
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

  it('opens the "Create Dataset" dialog', async () => {
    await page.click('button:has-text("Create Dataset")');
    await page.waitForSelector('[role="dialog"]', { timeout: 5_000 });
    const dialogText = await page.textContent('[role="dialog"]');
    expect(dialogText).toContain('Create Dataset');
  });

  it('fills the form and creates a dataset', async () => {
    await page.fill('#dataset-name', datasetName);
    await page.fill('#dataset-description', 'E2E test dataset');

    const createBtn = page.locator('[role="dialog"] button:has-text("Create")');
    await createBtn.click();
    await page.waitForSelector('[role="dialog"]', { state: 'hidden', timeout: 10_000 });
  });

  it('new dataset appears in the table', async () => {
    await page.waitForFunction((name) => document.body.textContent?.includes(name), datasetName, { timeout: 10_000 });
    const bodyText = await page.textContent('body');
    expect(bodyText).toContain(datasetName);
  });

  it('can navigate to dataset detail', async () => {
    const row = page.locator(`tr:has-text("${datasetName}")`).first();
    await row.click();
    await page.waitForURL('**/datasets/**', { timeout: 10_000 });
    expect(page.url()).toMatch(/\/datasets\/.+/);

    createdDatasetId = page.url().split('/datasets/')[1]?.split('?')[0];
  });

  it('detail page shows dataset name', async () => {
    await page.waitForSelector('h1', { timeout: 5_000 });
    const headingText = await page.textContent('h1');
    expect(headingText).toContain(datasetName);
  });
});
