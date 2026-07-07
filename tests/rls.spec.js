const { test, expect } = require('@playwright/test');
const { login, createClient, deleteAllClients } = require('./helpers');

// Teste opcional: confirma que duas contas de nutricionista diferentes não
// partilham dados entre si (isolamento por RLS no Supabase). Requer uma
// SEGUNDA conta de teste — ver README.
const EMAIL_A = process.env.TEST_NUTRI_EMAIL;
const PASS_A  = process.env.TEST_NUTRI_PASSWORD;
const EMAIL_B = process.env.TEST_NUTRI2_EMAIL;
const PASS_B  = process.env.TEST_NUTRI2_PASSWORD;

test.describe('Isolamento entre contas (RLS)', () => {
  test.skip(!(EMAIL_A && PASS_A && EMAIL_B && PASS_B),
    'Requer TEST_NUTRI_EMAIL/PASSWORD e TEST_NUTRI2_EMAIL/PASSWORD — ver README.');

  test('nutricionista B não vê pacientes do nutricionista A', async ({ browser }) => {
    const nome = `Paciente Isolado ${Date.now()}`;

    const pageA = await (await browser.newContext()).newPage();
    await login(pageA);
    await createClient(pageA, nome);

    const pageB = await (await browser.newContext()).newPage();
    await pageB.goto('/login.html');
    await pageB.waitForSelector('#pg-auth', { state: 'visible' });
    await pageB.fill('#auth-login-email', EMAIL_B);
    await pageB.fill('#auth-login-password', PASS_B);
    await pageB.click('#auth-login-btn');
    await pageB.waitForURL('**/app.html', { timeout: 20000 });
    await pageB.waitForSelector('#pg-clients', { state: 'visible' });

    await expect(pageB.locator('#dashboard-content')).not.toContainText(nome);

    await deleteAllClients(pageA);
    await pageA.context().close();
    await pageB.context().close();
  });
});
