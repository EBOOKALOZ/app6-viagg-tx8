import { test, expect } from '@playwright/test';

test('diagnostic Checkout — estado das confirmações', async ({ page }) => {
  await page.goto('/mercado');
  await page.waitForLoadState('networkidle');

  await page.getByRole('button', {
    name: 'Comprar Agora'
  }).first().click();

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

  await page.locator(
    'input[placeholder="Como o vendedor deve te chamar?"]'
  ).fill('Cliente Teste Playwright');

  await page.locator(
    'input[placeholder="(00) 00000-0000"]'
  ).fill('11999999999');

  const email = page.locator(
    'input[placeholder="seu@email.com"]'
  );

  if (await email.count()) {
    await email.fill('teste@playwright.local');
  }

  console.log('--- CONTROLES ANTES ---');

  const confirmationButtons = page.locator(
    'button:visible'
  ).filter({
    hasText: /Li e aceito|Entendo que esta plataforma|Autorizo a loja/i
  });

  console.log(
    await confirmationButtons.evaluateAll(btns =>
      btns.map((b, i) => ({
        index: i,
        text: (b.textContent || '').trim(),
        disabled: (b as HTMLButtonElement).disabled,
        ariaPressed: b.getAttribute('aria-pressed'),
        ariaChecked: b.getAttribute('aria-checked'),
        dataState: b.getAttribute('data-state'),
        className: b.className
      }))
    )
  );

  console.log('--- CLICANDO ---');

  for (let i = 0; i < await confirmationButtons.count(); i++) {
    const button = confirmationButtons.nth(i);

    console.log(
      'Antes:',
      i,
      await button.textContent(),
      await button.getAttribute('aria-pressed'),
      await button.getAttribute('data-state')
    );

    await button.click();

    await page.waitForTimeout(200);

    console.log(
      'Depois:',
      i,
      await button.textContent(),
      await button.getAttribute('aria-pressed'),
      await button.getAttribute('aria-checked'),
      await button.getAttribute('data-state'),
      await button.getAttribute('class')
    );
  }

  console.log('--- BOTÃO FINAL ---');

  const submit = page.getByRole('button', {
    name: 'Eu Quero esses Produtos'
  });

  console.log(
    await submit.evaluate(button => ({
      disabled: (button as HTMLButtonElement).disabled,
      ariaDisabled: button.getAttribute('aria-disabled'),
      dataState: button.getAttribute('data-state'),
      className: button.className
    }))
  );

  console.log('--- CAMPOS ---');

  console.log(
    await page.locator('input:visible').evaluateAll(inputs =>
      inputs.map(i => ({
        type: i.type,
        placeholder: i.placeholder,
        value: i.value,
        required: i.required,
        checked: (i as HTMLInputElement).checked,
        disabled: i.disabled
      }))
    )
  );

  console.log('--- TEXTO DE VALIDAÇÃO ---');

  console.log(
    (await page.locator('body').innerText()).slice(-3500)
  );
});
