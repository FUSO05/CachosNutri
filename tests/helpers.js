// Helpers partilhados pelos testes e2e.
//
// Os testes que precisam de uma conta autenticada usam as credenciais das
// variáveis de ambiente TEST_NUTRI_EMAIL / TEST_NUTRI_PASSWORD (ver README).
// Sem elas, esses testes são saltados (skip) em vez de falhar — não há
// nenhuma conta de teste hardcoded no repositório.

const TEST_EMAIL    = process.env.TEST_NUTRI_EMAIL;
const TEST_PASSWORD = process.env.TEST_NUTRI_PASSWORD;

function hasTestAccount() {
  return Boolean(TEST_EMAIL && TEST_PASSWORD);
}

async function login(page) {
  await page.goto('/index.html');
  await page.waitForSelector('#pg-auth', { state: 'visible' });
  await page.fill('#auth-login-email', TEST_EMAIL);
  await page.fill('#auth-login-password', TEST_PASSWORD);
  await page.click('#auth-login-btn');
  await page.waitForSelector('#pg-welcome', { state: 'visible', timeout: 20000 });
}

async function enterApp(page) {
  await page.click('.btn-enter-new');
  await page.waitForSelector('#pg-clients', { state: 'visible' });
}

async function createClient(page, nome) {
  await page.locator('button[onclick="createClient()"]').first().click();
  await page.waitForTimeout(300);
  await page.fill('#pNome', nome);
  await page.click('.btn-save-info');
  await page.waitForTimeout(1200); // debounce + sync ao Supabase
}

async function deleteAllClients(page) {
  // Chama a função de navegação da app diretamente em vez de clicar num link da
  // sidebar: em mobile a sidebar está off-canvas (transform), e o Playwright
  // considera-a "visible" mesmo fora do ecrã, o que bloqueia o clique.
  await page.evaluate(() => { if (typeof goToClients === 'function') goToClients(); }).catch(() => {});
  await page.waitForTimeout(300);
  // eslint-disable-next-line no-constant-condition
  for (let i = 0; i < 20; i++) {
    const count = await page.locator('.client-card').count();
    if (!count) break;
    await page.locator('.client-card button[onclick*="deleteClient"]').first().click();
    await page.waitForSelector('#confirmModal', { state: 'visible' });
    await page.click('#confirm-ok-btn');
    await page.waitForTimeout(1000);
  }
}

module.exports = { TEST_EMAIL, TEST_PASSWORD, hasTestAccount, login, enterApp, createClient, deleteAllClients };
