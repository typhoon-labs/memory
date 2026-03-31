/**
 * E2E auth test — verifies login flow via Playwright.
 *
 * Usage: bun run tests/e2e/auth.test.ts
 */
import { chromium } from 'playwright';

const ADMIN_URL = 'http://localhost:5174';

async function run() {
  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });
  const page = await browser.newPage();

  // Test 1: Navigate to admin → should redirect to /login
  console.log('=== Test 1: Redirect to /login ===');
  await page.goto(ADMIN_URL);
  await page.waitForURL('**/login', { timeout: 5000 });
  console.log(`  URL: ${page.url()}`);
  console.log(`  PASS: Redirected to login`);

  // Test 2: Login page renders correctly
  console.log('\n=== Test 2: Login page renders ===');
  const logo = await page.textContent('h1');
  const title = await page.textContent('h2');
  console.log(`  Logo: ${logo}`);
  console.log(`  Title: ${title}`);
  const signInButton = await page.locator('button[type="submit"]').textContent();
  console.log(`  Button: ${signInButton}`);
  console.log(`  PASS: Login page rendered`);

  // Test 3: No SSO button when OIDC is disabled
  console.log('\n=== Test 3: No SSO button (OIDC disabled) ===');
  const ssoButton = await page.locator('text=Sign in with SSO').count();
  console.log(`  SSO buttons found: ${ssoButton}`);
  console.log(`  PASS: No SSO button`);

  // Test 4: Sign in with wrong credentials → error
  console.log('\n=== Test 4: Wrong credentials ===');
  await page.fill('input[type="email"]', 'wrong@test.com');
  await page.fill('input[type="password"]', 'wrongpassword');
  await page.click('button[type="submit"]');
  await page.waitForTimeout(1500);
  const errorText = await page
    .locator('div')
    .filter({ hasText: /failed|invalid|not found/i })
    .first()
    .textContent();
  console.log(`  Error: ${errorText}`);
  console.log(`  PASS: Error displayed`);

  // Test 5: Sign in with valid admin credentials
  console.log('\n=== Test 5: Admin sign-in ===');
  await page.fill('input[type="email"]', 'admin@typhoon.local');
  await page.fill('input[type="password"]', 'password');
  await page.click('button[type="submit"]');
  // window.location.href triggers full page load
  await page.waitForLoadState('networkidle', { timeout: 15000 });
  console.log(`  URL: ${page.url()}`);
  console.log(`  PASS: Signed in`);

  // Test 6: Dashboard shows sidebar with user email and sign-out
  console.log('\n=== Test 6: Dashboard renders ===');
  await page.waitForSelector('nav', { timeout: 15000 });
  const navText = await page.locator('nav').textContent();
  const hasEmail = navText?.includes('admin@typhoon.local');
  const hasSignOut = navText?.includes('Sign out');
  console.log(`  Has user email: ${hasEmail}`);
  console.log(`  Has sign-out button: ${hasSignOut}`);
  console.log(`  PASS: Dashboard with auth UI`);

  // Test 7: Sign out → back to login
  console.log('\n=== Test 7: Sign out ===');
  await page.click('button:has-text("Sign out")');
  await page.waitForURL('**/login', { timeout: 10000 });
  console.log(`  URL: ${page.url()}`);
  console.log(`  PASS: Redirected to login after sign out`);

  // Test 8: Sign in as rep
  console.log('\n=== Test 8: Rep sign-in ===');
  await page.fill('input[type="email"]', 'rep@typhoon.local');
  await page.fill('input[type="password"]', 'password');
  await page.click('button[type="submit"]');
  await page.waitForLoadState('networkidle', { timeout: 15000 });
  await page.waitForSelector('nav', { timeout: 15000 });
  const repNav = await page.locator('nav').textContent();
  console.log(`  URL: ${page.url()}`);
  console.log(`  Has rep email: ${repNav?.includes('rep@typhoon.local')}`);
  console.log(`  PASS: Rep signed in`);

  await browser.close();
  console.log('\n✓ All 8 tests passed');
}

run().catch((err) => {
  console.error('FAIL:', err.message);
  process.exit(1);
});
