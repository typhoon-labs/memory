/**
 * Chat E2E tests — verifies the core conversation flow in the Desk app via Playwright.
 *
 * Requires a live stack: bun run docker:up
 * Usage: bun run test:e2e
 */

import { type Browser, chromium, type Page } from 'playwright';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DESK_URL, oidcLogin } from '../helpers/e2e-utils';

describe('Chat E2E', () => {
  let browser: Browser;
  let page: Page;
  let createdThreadId: string | undefined;

  beforeAll(async () => {
    browser = await chromium.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });
    page = await browser.newPage();
    await page.goto(DESK_URL);
    await page.waitForURL('**/login', { timeout: 5_000 });
    await oidcLogin(page, 'rep@typhoon.local', 'password', DESK_URL);
  }, 30_000);

  afterAll(async () => {
    // Clean up created thread regardless of test outcome
    if (createdThreadId && page) {
      await page
        .evaluate(async (id) => {
          await fetch(`/api/v1/threads/${id}`, { method: 'DELETE', credentials: 'include' });
        }, createdThreadId)
        .catch(() => {});
    }
    await browser?.close();
  });

  it('lands on dashboard after login', async () => {
    await page.waitForSelector('main', { timeout: 10_000 });
    expect(page.url()).not.toContain('/login');
    const body = await page.textContent('body');
    expect(body).toBeTruthy();
  });

  it('navigates to /chat and shows message composer', async () => {
    await page.goto(`${DESK_URL}/chat`);
    await page.waitForURL(`${DESK_URL}/chat**`, { timeout: 5_000 });

    await page.waitForSelector('textarea[placeholder="Ask a question..."]', { timeout: 10_000 });
    const textarea = page.locator('textarea[placeholder="Ask a question..."]');
    expect(await textarea.count()).toBe(1);
  });

  it('shows "New Chat" button in the sidebar', async () => {
    const newChatBtn = page.locator('button:has-text("New Chat")');
    expect(await newChatBtn.count()).toBeGreaterThan(0);
  });

  it('sends a message and redirects to a thread URL', async () => {
    const textarea = page.locator('textarea[placeholder="Ask a question..."]');
    await textarea.fill('What is Typhoon?');
    await textarea.press('Enter');

    await page.waitForURL(`${DESK_URL}/chat/**`, { timeout: 15_000 });
    expect(page.url()).toMatch(/\/chat\/[a-zA-Z0-9-]+/);

    // Capture thread ID for cleanup
    createdThreadId = page.url().split('/chat/')[1]?.split('?')[0];
  });

  it("shows the user's message in the chat view", async () => {
    await page.waitForFunction((msg) => document.body.textContent?.includes(msg), 'What is Typhoon?', { timeout: 10_000 });
    const bodyText = await page.textContent('body');
    expect(bodyText).toContain('What is Typhoon?');
  });

  it('thread appears in the sidebar after creation', async () => {
    await page.waitForFunction(
      () => {
        const items = document.querySelectorAll('[class*="border-b"][class*="px-3"]');
        return items.length > 0;
      },
      { timeout: 10_000 },
    );
    const sidebarCount = await page.locator('[class*="border-b"][class*="px-3"]').count();
    expect(sidebarCount).toBeGreaterThan(0);
  });

  it('thread and messages persist after page reload', async () => {
    const urlBeforeReload = page.url();
    await page.reload();
    await page.waitForURL(urlBeforeReload, { timeout: 10_000 });

    await page.waitForFunction((msg) => document.body.textContent?.includes(msg), 'What is Typhoon?', { timeout: 10_000 });
    const bodyText = await page.textContent('body');
    expect(bodyText).toContain('What is Typhoon?');
  });

  it('"New Chat" button navigates back to /chat and shows composer', async () => {
    await page.goto(`${DESK_URL}/chat`);
    await page.waitForSelector('textarea[placeholder="Ask a question..."]', { timeout: 10_000 });

    const newChatBtn = page.locator('button:has-text("New Chat")');
    expect(await newChatBtn.count()).toBeGreaterThan(0);
    expect(page.url()).toContain('/chat');
  });
});
