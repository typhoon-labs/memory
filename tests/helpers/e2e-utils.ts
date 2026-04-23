/**
 * Shared E2E test utilities.
 *
 * Usage:
 *   import { DESK_URL, ADMIN_URL, oidcLogin } from '../helpers/e2e-utils';
 */
import type { Page } from 'playwright';

/** Desk app base URL — override via DESK_URL env var. */
export const DESK_URL = process.env.DESK_URL ?? 'http://localhost:5173';

/** Admin app base URL — override via ADMIN_URL env var. */
export const ADMIN_URL = process.env.ADMIN_URL ?? 'http://localhost:5174';

/**
 * Perform OIDC login via Dex.
 *
 * Clicks "Sign in with SSO", fills the Dex login form, and waits
 * for redirect back to the app at `returnUrl`.
 */
export async function oidcLogin(page: Page, email: string, password: string, returnUrl: string): Promise<void> {
  await page.click('button:has-text("Sign in with SSO")');
  await page.waitForURL('**/dex/**', { timeout: 10_000 });
  await page.fill('input[id="login"]', email);
  await page.fill('input[id="password"]', password);
  await page.click('button[type="submit"]:has-text("Login")');
  await page.waitForURL(`${returnUrl}/**`, { timeout: 15_000 });
}
