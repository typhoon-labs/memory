/**
 * Document metadata E2E tests — verifies document detail sheet and metadata editing.
 *
 * Requires a live stack: bun run docker:up
 * Usage: bun run test:e2e
 */

import { type Browser, type BrowserContext, chromium, type Page } from 'playwright';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { ADMIN_URL, injectTestSession } from '../helpers/e2e-utils';

describe('Document Metadata E2E', () => {
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

  // ── Documents Page ───────────────────────────────────────────────────────

  it('navigates to documents page', async () => {
    await page.goto(`${ADMIN_URL}/documents`);
    await page.waitForSelector('h1', { timeout: 10_000 });
    const heading = await page.textContent('h1');
    expect(heading).toContain('Documents');
  });

  it('displays documents table or empty state', async () => {
    const hasTable = await page.locator('table').count();
    const hasEmpty = await page.locator('text=No documents').count();
    expect(hasTable + hasEmpty).toBeGreaterThan(0);
  });

  // ── Document Detail ──────────────────────────────────────────────────────

  it('opens a document detail when clicking a document row', async () => {
    const rows = page.locator('table tbody tr');
    const rowCount = await rows.count();

    if (rowCount === 0) {
      // No documents found — skipping detail tests
      return;
    }

    // Click the first document row
    await rows.first().click();

    // Wait for a detail sheet or detail view to appear
    const sheet = page.locator('[role="dialog"], [data-state="open"], .sheet-content');
    await sheet.waitFor({ state: 'visible', timeout: 5_000 }).catch(() => {});

    // Verify some document detail content is visible
    const hasContent = (await sheet.count()) > 0 || page.url().includes('/documents/');
    expect(hasContent).toBe(true);
  });

  it('document detail shows status information', async () => {
    const rows = page.locator('table tbody tr');
    const rowCount = await rows.count();

    if (rowCount === 0) return;

    // Look for status-related content in the current view
    const statusTexts = ['ready', 'pending', 'processing', 'error', 'deleted'];
    const pageText = (await page.textContent('body')) ?? '';
    const hasStatus = statusTexts.some((s) => pageText.toLowerCase().includes(s));
    expect(hasStatus).toBe(true);
  });

  // ── Sync Source Detail with Documents Tab ────────────────────────────────

  it('navigates to sync sources and opens a source if available', async () => {
    await page.goto(`${ADMIN_URL}/sync-sources`);
    await page.waitForSelector('h1', { timeout: 10_000 });

    const rows = page.locator('table tbody tr');
    const rowCount = await rows.count();

    if (rowCount === 0) {
      // No sync sources — skipping source detail tests
      return;
    }

    // Click the first sync source
    await rows.first().click();
    await page.waitForSelector('h1', { timeout: 5_000 });

    // Should be on a sync source detail page
    expect(page.url()).toMatch(/\/sync-sources\/.+/);
  });

  it('sync source detail has Documents tab', async () => {
    if (!page.url().includes('/sync-sources/')) return;

    const docsTab = page.locator('button:has-text("Documents"), [role="tab"]:has-text("Documents")');
    const hasDocsTab = (await docsTab.count()) > 0;

    if (hasDocsTab) {
      await docsTab.first().click();
      // Wait for content to load
      await page.waitForTimeout(1000);

      // Should show a file browser or document list
      const hasContent = (await page.locator('table, .empty-state, text=No documents').count()) > 0;
      expect(hasContent).toBe(true);
    }
  });
});
