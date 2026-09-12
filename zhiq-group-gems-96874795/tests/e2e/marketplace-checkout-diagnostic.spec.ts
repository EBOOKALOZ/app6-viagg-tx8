import { test, expect } from '@playwright/test';

test('Marketplace → Cesta → Finalizar Pedido', async ({ page }) => {
  const errors: string[] = [];

  page.on('pageerror', (e) => errors.push(e.message));

  await page.goto('/mercado');
  await page.waitForLoadState('networkidle');

  const buyButton = page.getByRole('button', { name: 'Comprar Agora' }).first();
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

  await page.waitForTimeout(500);

  const checkoutButton = page.getByRole('button', {
    name: 'Finalizar Pedido',
  });

  console.log('Finalizar Pedido:', await checkoutButton.count());

  await expect(checkoutButton).toBeVisible();

  await checkoutButton.click();
  await page.waitForTimeout(1500);

  console.log('URL após Finalizar Pedido:', page.url());
  console.log('Título:', await page.title());

  console.log(
    'Botões visíveis após checkout:',
    await page.locator('button:visible').evaluateAll(btns =>
      btns.map(b => ({
        text: (b.textContent || '').trim(),
        aria: b.getAttribute('aria-label'),
        title: b.getAttribute('title'),
      })).filter(x => x.text || x.aria || x.title)
    )
  );

  console.log(
    'Texto principal após checkout:',
    (await page.locator('body').innerText()).slice(0, 5000)
  );

  expect(
    errors,
    `Erros de runtime no checkout: ${errors.join('; ')}`
  ).toEqual([]);
});
