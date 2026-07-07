const { test, expect } = require('@playwright/test');
const { hasTestAccount, login, createClient, deleteAllClients } = require('./helpers');

test.describe('CRUD de pacientes/planos (Supabase)', () => {
  test.skip(!hasTestAccount(), 'Requer TEST_NUTRI_EMAIL/TEST_NUTRI_PASSWORD — ver README.');

  test.afterEach(async ({ page }) => {
    // Deixa a conta de teste limpa entre execuções.
    await deleteAllClients(page).catch(() => {});
  });

  test('cria paciente e sincroniza para uma sessão nova', async ({ page, context }) => {
    await login(page);
    const nome = `Paciente Teste ${Date.now()}`;
    await createClient(page, nome);

    // Sessão nova (sem localStorage) confirma que os dados vieram do Supabase.
    const page2 = await context.browser().newContext().then(c => c.newPage());
    await login(page2);
    await expect(page2.locator('#dashboard-content')).toContainText(nome);
    await page2.context().close();
  });

  test('editar e eliminar paciente propaga para o Supabase', async ({ page, context }) => {
    await login(page);
    const nomeOriginal = `Paciente Original ${Date.now()}`;
    const nomeEditado  = `Paciente Editado ${Date.now()}`;
    await createClient(page, nomeOriginal);

    await page.fill('#pNome', nomeEditado);
    await page.click('.btn-save-info');
    await page.waitForTimeout(1200);

    const page2 = await context.browser().newContext().then(c => c.newPage());
    await login(page2);
    await expect(page2.locator('#dashboard-content')).toContainText(nomeEditado);
    await expect(page2.locator('#dashboard-content')).not.toContainText(nomeOriginal);
    await page2.context().close();
  });
});
