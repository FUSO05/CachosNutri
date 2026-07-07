const { test, expect } = require('@playwright/test');

test.describe('Autenticação', () => {
  test('mostra o ecrã de login por omissão, sem sessão', async ({ page }) => {
    await page.goto('/index.html');
    await expect(page.locator('#pg-auth')).toBeVisible();
    await expect(page.locator('#pg-welcome')).toBeHidden();
  });

  test('alterna entre os separadores Entrar / Criar conta', async ({ page }) => {
    await page.goto('/index.html');
    await expect(page.locator('#auth-form-login')).toBeVisible();
    await expect(page.locator('#auth-form-signup')).toBeHidden();

    await page.click('#auth-tab-signup');
    await expect(page.locator('#auth-form-signup')).toBeVisible();
    await expect(page.locator('#auth-form-login')).toBeHidden();
  });

  test('login com credenciais inválidas mostra mensagem de erro', async ({ page }) => {
    await page.goto('/index.html');
    await page.fill('#auth-login-email', 'nao-existe-de-todo@exemplo.com');
    await page.fill('#auth-login-password', 'password-errada-123');
    await page.click('#auth-login-btn');
    await expect(page.locator('#auth-login-error')).toBeVisible({ timeout: 20000 });
    await expect(page.locator('#pg-welcome')).toBeHidden();
  });
});
