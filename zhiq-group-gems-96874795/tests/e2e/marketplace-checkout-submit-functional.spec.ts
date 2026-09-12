import { test, expect } from '@playwright/test';

test('Marketplace → Checkout → enviar intenção real', async ({ page }) => {
  const errors: string[] = [];

  page.on('pageerror', e => errors.push(e.message));

  await page.goto('/mercado');
  await page.waitForLoadState('networkidle');

  const buyButton = page.getByRole('button', {
    name: 'Comprar Agora',
  }).first();

  await expect(buyButton).toBeVisible();
  await buyButton.click();

  await page.waitForTimeout(1500);

  const closeCart = page.locator(
    'button[aria-label="Fechar Cesta"]:visible'
  );

  const openCart = page.locator(
    'button[aria-label="Abrir Cesta / Carrinho"]:visible'
  );

  if (await closeCart.count() === 0) {
    await expect(openCart.first()).toBeVisible();
    await openCart.first().click();
  }

  const checkoutButton = page.getByRole('button', {
    name: 'Finalizar Pedido',
  });

  await expect(checkoutButton).toBeVisible();
  await checkoutButton.click();

  await page.waitForTimeout(500);

  const inputs = page.locator('input:visible');

  await inputs.nth(0).fill('Cliente Teste Playwright');
  await inputs.nth(1).fill('(11) 99999-9999');

  const acceptButtons = page.locator(
    'button[aria-label="Marcar aceite"], button[aria-label="Desmarcar aceite"]'
  );

  await expect(acceptButtons).toHaveCount(4);

  console.log('Autorizações encontradas:', await acceptButtons.count());

  for (let i = 0; i < 4; i++) {
    const checkbox = acceptButtons.nth(i);

    const aria = await checkbox.getAttribute('aria-label');

    if (aria === 'Marcar aceite') {
      await checkbox.click();
    }
  }

  console.log('4 autorizações processadas');

  const submitButton = page.getByRole('button', {
    name: 'Eu Quero esses Produtos',
  });

  await expect(submitButton).toBeVisible();
  await expect(submitButton).toBeEnabled();

  console.log('Botão de envio habilitado');

  await submitButton.click();

  await page.waitForTimeout(2000);

  console.log('URL após envio:', page.url());

  console.log('--- RESULTADO ---');
  console.log(
    (await page.locator('body').innerText()).slice(-4000)
  );

  console.log('Erros de runtime:', errors);

  expect(
    errors,
    `Erros de runtime: ${errors.join('; ')}`
  ).toEqual([]);
});
