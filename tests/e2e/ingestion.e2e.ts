/**
 * Ingestion E2E tests — verifies document management pages and status flows.
 *
 * Requires a live stack: bun run docker:up
 * Usage: bun run test:e2e
 *
 * Note: Tests that inspect actual document content require sync sources to be
 * configured and synced. The tests here are designed to be resilient: they
 * verify UI structure even when no documents or sources exist yet.
 */

import { type Browser, type BrowserContext, chromium, type Page } from 'playwright';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { ADMIN_URL, injectTestSession } from '../helpers/e2e-utils';

describe('Ingestion E2E', () => {
  let browser: Browser;
  let context: BrowserContext;
  let page: Page;

  beforeAll(async () => {
    browser = await chromium.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });
    ({ context, page } = await injectTestSession(browser, 'admin@typhoon.local'));
  }, 30_000);

  afterAll(async () => {
    await context?.close();
    await browser?.close();
  });

  // ---------------------------------------------------------------------------
  // Documents list page
  // ---------------------------------------------------------------------------

  describe('Documents list page', () => {
    it('navigates to /documents and renders a heading', async () => {
      await page.goto(`${ADMIN_URL}/documents`);
      await page.waitForSelector('h1, h2', { timeout: 10_000 });
      const headingText = await page.textContent('h1, h2');
      expect(headingText).toBeTruthy();
    });

    it('shows a table or empty state', async () => {
      const tableCount = await page.locator('table, [role="table"]').count();
      const emptyCount = await page.locator(':text("No documents"), :text("No results")').count();
      expect(tableCount + emptyCount).toBeGreaterThan(0);
    });

    it('renders status badge column when documents exist', async () => {
      const tableCount = await page.locator('table, [role="table"]').count();
      if (tableCount === 0) return; // No documents yet

      const tableText = await page.textContent('table, [role="table"]');
      // Status column header should be present
      expect(tableText).toMatch(/Status|Title|Source/i);
    });
  });

  // ---------------------------------------------------------------------------
  // Sync source detail — Documents tab
  // ---------------------------------------------------------------------------

  describe('Sync source detail — Documents tab', () => {
    it('can view the Documents tab on an existing sync source', async () => {
      await page.goto(`${ADMIN_URL}/sources`);
      await page.waitForSelector('h1, h2', { timeout: 10_000 });

      const rows = page.locator('tbody tr');
      if ((await rows.count()) === 0) {
        // No sync sources configured — skip
        return;
      }

      await rows.first().click();
      await page.waitForURL('**/sources/**', { timeout: 10_000 });

      const docsTab = page.locator('[role="tab"]:has-text("Documents")');
      await page.waitForSelector('[role="tab"]:has-text("Documents")', { timeout: 5_000 });
      await docsTab.click();

      const tabPanel = page.locator('[role="tabpanel"][data-state="active"]');
      await tabPanel.waitFor({ state: 'visible', timeout: 5_000 });
      const panelText = await tabPanel.textContent();
      expect(panelText).toBeTruthy();
    });

    it('can view the Sync Log tab on an existing sync source', async () => {
      // Stay on the same source detail page (or navigate there if not already)
      if (!page.url().includes('/sources/')) {
        await page.goto(`${ADMIN_URL}/sources`);
        await page.waitForSelector('h1, h2', { timeout: 10_000 });
        const rows = page.locator('tbody tr');
        if ((await rows.count()) === 0) return;
        await rows.first().click();
        await page.waitForURL('**/sources/**', { timeout: 10_000 });
      }

      await page.waitForSelector('[role="tab"]:has-text("Sync Log")', { timeout: 5_000 });
      await page.click('[role="tab"]:has-text("Sync Log")');

      const tabPanel = page.locator('[role="tabpanel"][data-state="active"]');
      await tabPanel.waitFor({ state: 'visible', timeout: 5_000 });
      const panelText = await tabPanel.textContent();
      expect(panelText).toBeTruthy();
    });

    it('shows "Sync Now" button on an active sync source', async () => {
      if (!page.url().includes('/sources/')) return;

      // Navigate to Overview tab to find the Sync Now button
      const overviewTab = page.locator('[role="tab"]:has-text("Overview")');
      if ((await overviewTab.count()) > 0) {
        await overviewTab.click();
      }

      const syncBtn = page.locator('button:has-text("Sync Now"), button:has-text("Syncing")');
      const syncBtnCount = await syncBtn.count();
      // Sync Now button only shows for active sources
      if (syncBtnCount > 0) {
        const btnText = await syncBtn.first().textContent();
        expect(btnText).toMatch(/Sync Now|Syncing/i);
      }
    });
  });

  // ---------------------------------------------------------------------------
  // Failed document retry
  // ---------------------------------------------------------------------------

  describe('Failed document retry', () => {
    it('shows retry option for documents in an error state (skips if none)', async () => {
      await page.goto(`${ADMIN_URL}/documents`);
      await page.waitForSelector('h1, h2', { timeout: 10_000 });

      const tableCount = await page.locator('table, [role="table"]').count();
      if (tableCount === 0) return;

      // Look for a row that contains an error status badge
      const errorBadge = page
        .locator('[class*="badge"]:has-text("Error"), [class*="badge"]:has-text("error"), td:has-text("error")')
        .first();

      if ((await errorBadge.count()) === 0) {
        // No failed documents — nothing to test
        return;
      }

      // Click the row to open the detail view (sheet/drawer)
      const errorRow = page.locator('tr').filter({ has: errorBadge }).first();
      await errorRow.click();

      // Look for a Retry button in the detail panel
      await page.waitForSelector('button:has-text("Retry")', { timeout: 5_000 });
      const retryBtnCount = await page.locator('button:has-text("Retry")').count();
      expect(retryBtnCount).toBeGreaterThan(0);
    });
  });
});
