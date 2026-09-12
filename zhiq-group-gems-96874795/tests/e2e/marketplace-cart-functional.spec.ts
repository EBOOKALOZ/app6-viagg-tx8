import { test, expect } from '@playwright/test';

test('Marketplace → Cesta → validar item, total e remoção', async ({ page }) => {
  const errors: string[] = [];

  page.on('pageerror', (e) => errors.push(e.message));

  await page.goto('/mercado');
  await page.waitForLoadState('networkidle');

  const buyButtons = page.getByRole('button', { name: 'Comprar Agora' });

  await expect(buyButtons.first()).toBeVisible();

  await buyButtons.first().click();
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

  // Produto dentro da cesta
  const cartProduct = page.getByRole('heading', {
    name: 'Pizza Marguerita',
    level: 4,
  });

  await expect(cartProduct).toBeVisible();

  // Quantidade
  await expect(
    page.getByText('1', { exact: true }).last()
  ).toBeVisible();

  // Preço do item
  await expect(
    page.getByText('R$ 49,00', { exact: true }).first()
  ).toBeVisible();

  // Resumo da cesta
  await expect(
    page.getByText(/Subtotal desta loja/i)
  ).toBeVisible();

  await expect(
    page.getByText(/Total \(1 item de 1 loja\)/i)
  ).toBeVisible();

  await expect(
    page.getByRole('button', { name: 'Finalizar Pedido' })
  ).toBeVisible();

  console.log('Item, quantidade, subtotal e total: OK');

  // Remover item
  const removeButton = page.locator(
    'button[title="Remover item da cesta"]'
  ).first();

  await expect(removeButton).toBeVisible();
  await removeButton.click();

  await page.waitForTimeout(700);

  // Produto não deve mais existir dentro da cesta
  await expect(cartProduct).toHaveCount(0);

  console.log('Remoção do item: OK');

  expect(
    errors,
    `Erros de runtime no fluxo Marketplace → Cesta: ${errors.join('; ')}`
  ).toEqual([]);
});
