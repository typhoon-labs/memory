/**
 * Metadata E2E tests — verifies field group and template CRUD in the Admin app.
 *
 * Requires a live stack: bun run docker:up
 * Usage: bun run test:e2e
 */

import { type Browser, chromium, type Page } from 'playwright';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ADMIN_URL, oidcLogin } from '../helpers/e2e-utils';

describe('Metadata E2E', () => {
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
  // Field Groups
  // ---------------------------------------------------------------------------

  describe('Field Groups', () => {
    const groupName = `E2E Group ${Date.now()}`;
    let createdGroupId: string | undefined;

    afterAll(async () => {
      if (createdGroupId && page) {
        await page
          .evaluate(async (id) => {
            await fetch(`/api/v1/metadata-field-groups/${id}`, { method: 'DELETE', credentials: 'include' });
          }, createdGroupId)
          .catch(() => {});
      }
    });

    it('navigates to /metadata/field-groups and renders heading', async () => {
      await page.goto(`${ADMIN_URL}/metadata/field-groups`);
      await page.waitForSelector('h1', { timeout: 10_000 });
      const headingText = await page.textContent('h1');
      expect(headingText).toContain('Field Groups');
    });

    it('navigates to the create page', async () => {
      await page.click('a:has-text("Create Group")');
      await page.waitForURL('**/metadata/field-groups/create', { timeout: 5_000 });
      const headingText = await page.textContent('h1');
      expect(headingText).toContain('Create');
    });

    it('fills the form and creates a field group', async () => {
      await page.fill('#group-name', groupName);
      await page.fill('#group-description', 'E2E test group');

      const createBtn = page.locator('button:has-text("Create"):not([disabled])');
      await createBtn.waitFor({ state: 'visible', timeout: 5_000 });
      await createBtn.click();
      await page.waitForFunction(() => !window.location.pathname.includes('create'), { timeout: 10_000 });
      expect(page.url()).toMatch(/\/metadata\/field-groups\/.+/);
      expect(page.url()).not.toContain('create');

      createdGroupId = page.url().split('/metadata/field-groups/')[1]?.split('?')[0];
    });

    it('detail page shows group name', async () => {
      await page.waitForSelector('h1', { timeout: 5_000 });
      const headingText = await page.textContent('h1');
      expect(headingText).toContain(groupName);
    });

    it('can edit the group name and save', async () => {
      await page.fill('#group-name', `${groupName} Updated`);
      await page.click('button:has-text("Save")');
      // Should stay on the same page after save
      await page.waitForTimeout(1_000);
      expect(page.url()).toContain(createdGroupId);
    });

    it('group appears in the list', async () => {
      await page.goto(`${ADMIN_URL}/metadata/field-groups`);
      await page.waitForFunction((name) => document.body.textContent?.includes(name), `${groupName} Updated`, {
        timeout: 10_000,
      });
      const bodyText = await page.textContent('body');
      expect(bodyText).toContain(`${groupName} Updated`);
    });

    it('can click row to navigate to detail', async () => {
      const row = page.locator(`tr:has-text("${groupName} Updated")`).first();
      await row.click();
      await page.waitForURL('**/metadata/field-groups/**', { timeout: 10_000 });
      expect(page.url()).toContain(createdGroupId);
    });
  });

  // ---------------------------------------------------------------------------
  // Templates
  // ---------------------------------------------------------------------------

  describe('Templates', () => {
    const templateName = `E2E Template ${Date.now()}`;
    let createdTemplateId: string | undefined;

    afterAll(async () => {
      if (createdTemplateId && page) {
        await page
          .evaluate(async (id) => {
            await fetch(`/api/v1/metadata-templates/${id}`, { method: 'DELETE', credentials: 'include' });
          }, createdTemplateId)
          .catch(() => {});
      }
    });

    it('navigates to /metadata/templates and renders heading', async () => {
      await page.goto(`${ADMIN_URL}/metadata/templates`);
      await page.waitForSelector('h1', { timeout: 10_000 });
      const headingText = await page.textContent('h1');
      expect(headingText).toContain('Templates');
    });

    it('navigates to the create page', async () => {
      await page.click('a:has-text("Create Template")');
      await page.waitForURL('**/metadata/templates/create', { timeout: 5_000 });
      const headingText = await page.textContent('h1');
      expect(headingText).toContain('Create');
    });

    it('fills the form and creates a template', async () => {
      await page.fill('#template-name', templateName);
      await page.fill('#template-description', 'E2E test template');

      const createBtn = page.locator('button:has-text("Create"):not([disabled])');
      await createBtn.waitFor({ state: 'visible', timeout: 5_000 });
      await createBtn.click();
      await page.waitForFunction(() => !window.location.pathname.includes('create'), { timeout: 10_000 });
      expect(page.url()).toMatch(/\/metadata\/templates\/.+/);
      expect(page.url()).not.toContain('create');

      createdTemplateId = page.url().split('/metadata/templates/')[1]?.split('?')[0];
    });

    it('detail page shows template name', async () => {
      await page.waitForSelector('h1', { timeout: 5_000 });
      const headingText = await page.textContent('h1');
      expect(headingText).toContain(templateName);
    });

    it('template appears in the list', async () => {
      await page.goto(`${ADMIN_URL}/metadata/templates`);
      await page.waitForSelector('table', { timeout: 10_000 });
      // Use the search filter in case the template is on a later page
      const search = page.locator('input[placeholder*="Search"]');
      await search.fill(templateName);
      await page.waitForFunction((name) => document.body.textContent?.includes(name), templateName, {
        timeout: 15_000,
      });
      const bodyText = await page.textContent('body');
      expect(bodyText).toContain(templateName);
    });

    it('can click row to navigate to detail', async () => {
      const row = page.locator(`tr:has-text("${templateName}")`).first();
      await row.waitFor({ state: 'visible', timeout: 10_000 });
      await row.click();
      await page.waitForFunction((id) => window.location.pathname.includes(id), createdTemplateId, { timeout: 10_000 });
      expect(page.url()).toContain(createdTemplateId);
    });
  });
});
