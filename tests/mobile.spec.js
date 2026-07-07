const { test, expect } = require('@playwright/test');
const { hasTestAccount, login, enterApp, createClient, deleteAllClients } = require('./helpers');

test.describe('Responsividade mobile', () => {
  test.use({ viewport: { width: 375, height: 812 } });

  test('ecrã de login não tem overflow horizontal', async ({ page }) => {
    await page.goto('/index.html');
    await page.waitForSelector('#pg-auth', { state: 'visible' });
    const hasOverflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);
    expect(hasOverflow).toBe(false);
  });

  test.describe('com conta autenticada', () => {
    test.skip(!hasTestAccount(), 'Requer TEST_NUTRI_EMAIL/TEST_NUTRI_PASSWORD — ver README.');

    test.afterEach(async ({ page }) => {
      await deleteAllClients(page).catch(() => {});
    });

    test('sidebar abre em drawer e fecha pelo backdrop, sem overflow horizontal', async ({ page }) => {
      await login(page);
      await enterApp(page);

      const noOverflow = async () =>
        !(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1));
      expect(await noOverflow()).toBe(true);

      await page.click('.mobile-menu-btn');
      await expect(page.locator('.sidebar-nav')).toHaveClass(/mobile-open/);

      await page.click('#sidebar-backdrop', { position: { x: 340, y: 400 } });
      await expect(page.locator('.sidebar-nav')).not.toHaveClass(/mobile-open/);
    });

    test('ficha do paciente é utilizável sem overflow horizontal', async ({ page }) => {
      await login(page);
      await enterApp(page);
      await createClient(page, `Paciente Mobile ${Date.now()}`);

      const hasOverflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);
      expect(hasOverflow).toBe(false);
    });
  });
});
