import { test, expect } from '@playwright/test';

test('diagnostic Checkout authorization and submit', async ({ page }) => {
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

  await nameInput.fill('Cliente Teste Playwright');
  await whatsappInput.fill('11999999999');

  const emailInput = page.locator(
    'input[placeholder="seu@email.com"]'
  );

  if (await emailInput.count()) {
    await emailInput.fill('teste@playwright.local');
  }

  console.log('--- BOTÕES ANTES DA AUTORIZAÇÃO ---');

  console.log(
    await page.locator('button:visible').evaluateAll(btns =>
      btns.map((b, i) => ({
        index: i,
        text: (b.textContent || '').trim(),
        aria: b.getAttribute('aria-label'),
        title: b.getAttribute('title'),
        disabled: (b as HTMLButtonElement).disabled
      })).filter(x => x.text || x.aria || x.title)
    )
  );

  const authorization = page.getByRole('button', {
    name: /Autorizo a loja a entrar em contato comigo via WhatsApp/i
  });

  console.log(
    'Botão autorização:',
    await authorization.count()
  );

  await expect(authorization).toBeVisible();

  console.log(
    'Estado antes:',
    await authorization.getAttribute('aria-pressed')
  );

  await authorization.click();
  await page.waitForTimeout(300);

  console.log(
    'Estado depois:',
    await authorization.getAttribute('aria-pressed')
  );

  console.log('--- BOTÕES DE ENVIO ---');

  console.log(
    await page.locator('button:visible').evaluateAll(btns =>
      btns.map((b, i) => ({
        index: i,
        text: (b.textContent || '').trim(),
        aria: b.getAttribute('aria-label'),
        title: b.getAttribute('title'),
        disabled: (b as HTMLButtonElement).disabled
      })).filter(x =>
        /enviar|intenção|confirmar|pedido|finalizar|continuar/i.test(
          `${x.text} ${x.aria || ''} ${x.title || ''}`
        )
      )
    )
  );

  console.log('--- TEXTO FINAL DO CHECKOUT ---');
  console.log(
    (await page.locator('body').innerText()).slice(-5000)
  );

  expect(
    errors,
    `Erros de runtime: ${errors.join('; ')}`
  ).toEqual([]);
});
