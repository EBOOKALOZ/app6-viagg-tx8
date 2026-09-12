import { test } from '@playwright/test';

test('diagnostic Checkout form fields', async ({ page }) => {
  await page.goto('/mercado');
  await page.waitForLoadState('networkidle');

  const buyButton = page.getByRole('button', { name: 'Comprar Agora' }).first();
  await buyButton.click();
  await page.waitForTimeout(1200);

  const closeCart = page.locator(
    'button[aria-label="Fechar Cesta"]:visible'
  );

  const openCart = page.locator(
    'button[aria-label="Abrir Cesta / Carrinho"]:visible'
  );

  if (await closeCart.count() === 0) {
    await openCart.first().click();
  }

  await page.waitForTimeout(500);

  const checkoutButton = page.getByRole('button', {
    name: 'Finalizar Pedido',
  });

  await checkoutButton.click();
  await page.waitForTimeout(800);

  console.log('--- INPUTS VISÍVEIS ---');

  console.log(
    await page.locator('input:visible').evaluateAll(inputs =>
      inputs.map((el: HTMLInputElement) => ({
        type: el.type,
        name: el.name,
        id: el.id,
        placeholder: el.placeholder,
        value: el.value,
        ariaLabel: el.getAttribute('aria-label'),
        ariaLabelledBy: el.getAttribute('aria-labelledby'),
        required: el.required,
        autocomplete: el.autocomplete
      }))
    )
  );

  console.log('--- TEXTAREAS VISÍVEIS ---');

  console.log(
    await page.locator('textarea:visible').evaluateAll(textareas =>
      textareas.map((el: HTMLTextAreaElement) => ({
        name: el.name,
        id: el.id,
        placeholder: el.placeholder,
        value: el.value,
        ariaLabel: el.getAttribute('aria-label'),
        ariaLabelledBy: el.getAttribute('aria-labelledby')
      }))
    )
  );

  console.log('--- LABELS ---');

  console.log(
    await page.locator('label:visible').evaluateAll(labels =>
      labels.map(el => ({
        text: (el.textContent || '').trim(),
        htmlFor: el.htmlFor
      }))
    )
  );
});
