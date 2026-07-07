const { test, expect } = require('@playwright/test');
const { hasTestAccount, TEST_EMAIL, TEST_PASSWORD, login, enterApp, deleteAllClients } = require('./helpers');

test.describe('Importação de dados locais pré-existentes', () => {
  test.skip(!hasTestAccount(), 'Requer TEST_NUTRI_EMAIL/TEST_NUTRI_PASSWORD — ver README.');

  test('oferece importar dados do localStorage quando a conta remota está vazia', async ({ page, browser }) => {
    // Garante que a conta começa sem pacientes (a notificação só aparece se o remoto estiver vazio).
    await login(page);
    await enterApp(page);
    await deleteAllClients(page);
    await page.close();

    const fakeLocalData = {
      version: 1,
      clients: [{
        id: 'f1e2d3c4-b5a6-4978-8123-456789abcdef',
        nome: 'Paciente Importado Teste',
        createdAt: Date.now(),
        info: { pNome: 'Paciente Importado Teste' },
        consultations: [],
        plans: [],
      }],
    };

    // Contexto novo e isolado (localStorage/cookies próprios) — simula um browser diferente.
    const page2 = await (await browser.newContext()).newPage();
    await page2.addInitScript((data) => {
      window.localStorage.setItem('cachos_data', JSON.stringify(data));
    }, fakeLocalData);
    await page2.goto('/index.html');
    await page2.waitForSelector('#pg-auth', { state: 'visible' });
    await page2.fill('#auth-login-email', TEST_EMAIL);
    await page2.fill('#auth-login-password', TEST_PASSWORD);
    await page2.click('#auth-login-btn');

    await expect(page2.locator('#auth-import-notice')).toBeVisible({ timeout: 20000 });
    await page2.click('button[onclick="importLocalData()"]');
    await page2.waitForSelector('#pg-welcome', { state: 'visible', timeout: 20000 });

    await enterApp(page2);
    await expect(page2.locator('#dashboard-content')).toContainText('Paciente Importado Teste');

    await deleteAllClients(page2);
  });
});
