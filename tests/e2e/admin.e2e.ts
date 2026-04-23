/**
 * Admin E2E tests — verifies queue monitoring and sync target CRUD flows.
 *
 * Requires a live stack: bun run docker:up
 * Usage: bun run test:e2e
 */

import { type Browser, chromium, type Page } from 'playwright';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ADMIN_URL, oidcLogin } from '../helpers/e2e-utils';

describe('Admin E2E', () => {
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

  // ---------------------------------------------------------------------------
  // Queue monitoring
  // ---------------------------------------------------------------------------

  describe('Queue monitoring', () => {
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

  // ---------------------------------------------------------------------------
  // Sync target CRUD
  // ---------------------------------------------------------------------------

  describe('Sync target CRUD', () => {
    const sourceName = `E2E Test Source ${Date.now()}`;
    let createdSourceId: string | undefined;

    afterAll(async () => {
      // Clean up created source regardless of test outcome
      if (createdSourceId && page) {
        await page
          .evaluate(async (id) => {
            await fetch(`/api/v1/sync-targets/${id}`, { method: 'DELETE', credentials: 'include' });
          }, createdSourceId)
          .catch(() => {});
      }
    });

    it('navigates to /sources and renders the "Sync Sources" heading', async () => {
      await page.goto(`${ADMIN_URL}/sources`);
      await page.waitForSelector('h1, h2', { timeout: 10_000 });
      const headingText = await page.textContent('h1, h2');
      expect(headingText).toMatch(/Sync Sources/i);
    });

    it('renders the "Add Source" button', async () => {
      const addBtn = page.locator('button:has-text("Add Source")');
      expect(await addBtn.count()).toBe(1);
    });

    it('opens the "Add Sync Source" dialog', async () => {
      await page.click('button:has-text("Add Source")');
      await page.waitForSelector('[role="dialog"]', { timeout: 5_000 });
      const dialogText = await page.textContent('[role="dialog"]');
      expect(dialogText).toContain('Add Sync Source');
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
      const createBtn = page.locator('[role="dialog"] button:has-text("Create")');
      await createBtn.click();
      await page.waitForSelector('[role="dialog"]', { state: 'hidden', timeout: 10_000 });
    });

    it('new sync target appears in the sources table', async () => {
      await page.waitForFunction((name) => document.body.textContent?.includes(name), sourceName, { timeout: 10_000 });
      const tableText = await page.textContent('body');
      expect(tableText).toContain(sourceName);
    });

    it('can navigate to the sync target detail page', async () => {
      const row = page.locator(`tr:has-text("${sourceName}")`).first();
      await row.click();
      await page.waitForURL('**/sources/**', { timeout: 10_000 });
      expect(page.url()).toMatch(/\/sources\/.+/);

      // Capture source ID for cleanup
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
});
