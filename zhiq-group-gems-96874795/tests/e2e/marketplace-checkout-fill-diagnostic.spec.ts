import { test, expect } from '@playwright/test';

test('Marketplace → Cesta → Checkout → preencher intenção', async ({ page }) => {
  const errors: string[] = [];

  page.on('pageerror', e => errors.push(e.message));

  await page.goto('/mercado');
  await page.waitForLoadState('networkidle');

  await page.getByRole('button', { name: 'Comprar Agora' }).first().click();
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

  await page.getByRole('button', {
    name: 'Finalizar Pedido'
  }).click();

  await page.waitForTimeout(800);

  const nameInput = page.locator(
    'input[placeholder="Como o vendedor deve te chamar?"]'
  );

  const whatsappInput = page.locator(
    'input[placeholder="(00) 00000-0000"]'
  );

  const emailInput = page.locator(
    'input[placeholder="seu@email.com"]'
  );

  const bairroInput = page.locator(
    'input[placeholder="Seu bairro"]'
  );

  const cidadeInput = page.locator(
    'input[placeholder="Sua cidade"]'
  );

  console.log('Nome:', await nameInput.count());
  console.log('WhatsApp:', await whatsappInput.count());
  console.log('Email:', await emailInput.count());
  console.log('Bairro:', await bairroInput.count());
  console.log('Cidade:', await cidadeInput.count());

  await expect(nameInput).toBeVisible();
  await expect(whatsappInput).toBeVisible();

  await nameInput.fill('Cliente Teste Playwright');
  await whatsappInput.fill('11999999999');

  if (await emailInput.count()) {
    await emailInput.fill('teste@playwright.local');
  }

  if (await bairroInput.count()) {
    await bairroInput.fill('Centro');
  }

  if (await cidadeInput.count()) {
    await cidadeInput.fill('São Paulo');
  }

  console.log('Dados preenchidos.');

  console.log(
    'Checkboxes:',
    await page.locator('input[type="checkbox"]:visible').count()
  );

  console.log(
    'Botões disponíveis:',
    await page.locator('button:visible').evaluateAll(btns =>
      btns.map(b => ({
        text: (b.textContent || '').trim(),
        aria: b.getAttribute('aria-label'),
        title: b.getAttribute('title')
      })).filter(x =>
        /pedido|intenção|enviar|confirmar|continuar/i.test(
          `${x.text} ${x.aria || ''} ${x.title || ''}`
        )
      )
    )
  );

  expect(
    errors,
    `Erros de runtime: ${errors.join('; ')}`
  ).toEqual([]);
});
