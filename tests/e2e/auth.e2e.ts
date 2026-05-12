/**
 * E2E auth test — verifies OIDC login flow via Playwright + Dex.
 *
 * Requires a live stack: bun run docker:up
 * Usage: bun run test:e2e
 */
import { type Browser, chromium, type Page } from 'playwright';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ADMIN_URL, oidcLogin } from '../helpers/e2e-utils';

describe('Auth E2E', () => {
  let browser: Browser;
  let page: Page;

  beforeAll(async () => {
    browser = await chromium.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });
    page = await browser.newPage();
  }, 30_000);

  afterAll(async () => {
    await browser?.close();
  });

  it('redirects to /login', async () => {
    await page.goto(ADMIN_URL);
    await page.waitForURL('**/login', { timeout: 5000 });
    expect(page.url()).toContain('/login');
  });

  it('renders login page with SSO button', async () => {
    const logo = await page.textContent('h1');
    const title = await page.textContent('h2');
    const ssoButton = page.locator('button:has-text("Sign in with SSO")');
    expect(logo).toBeTruthy();
    expect(title).toBeTruthy();
    expect(await ssoButton.count()).toBe(1);
  });

  it('signs in with admin credentials via SSO', async () => {
    await oidcLogin(page, 'admin@typhoon.local', 'password', ADMIN_URL);
    expect(page.url()).not.toContain('/login');
  });

  it('renders dashboard with user info', async () => {
    await page.waitForSelector('nav', { timeout: 15_000 });
    const navText = await page.locator('nav').textContent();
    expect(navText).toContain('admin@typhoon.local');
  });

  it('signs out and redirects to login', async () => {
    const userButton = page.getByRole('button', { name: /admin@typhoon\.local/ });
    await userButton.click();
    const signOut = page.getByRole('menuitem', { name: 'Sign out' });
    await signOut.click();
    await page.waitForURL('**/login', { timeout: 10_000 });
    expect(page.url()).toContain('/login');
  });

  it('signs in as rep via SSO and sees access denied', async () => {
    await oidcLogin(page, 'rep@typhoon.local', 'password', ADMIN_URL);
    // Rep users lack the admin role — they see the Access Denied page
    await page.waitForSelector('h1:has-text("Access Denied")', { timeout: 15_000 });
    const bodyText = await page.textContent('body');
    expect(bodyText).toContain('rep@typhoon.local');
  });
});
