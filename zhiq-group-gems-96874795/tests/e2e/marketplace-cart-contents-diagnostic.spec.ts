import { test, expect } from '@playwright/test';

test('diagnostic Marketplace cart contents', async ({ page }) => {
  page.on('pageerror', e => console.log('PAGE ERROR:', e.message));

  await page.goto('/mercado');
  await page.waitForLoadState('networkidle');

  const buyButtons = page.getByRole('button', { name: 'Comprar Agora' });

  console.log('Comprar Agora:', await buyButtons.count());

  await buyButtons.first().click();
  await page.waitForTimeout(1500);

  const closeCart = page.locator(
    'button[aria-label="Fechar Cesta"]:visible'
  );

  const openCart = page.locator(
    'button[aria-label="Abrir Cesta / Carrinho"]:visible'
  );

  console.log('Cesta aberta:', await closeCart.count());
  console.log('Botão abrir cesta:', await openCart.count());

  if (await closeCart.count() === 0) {
    await expect(openCart.first()).toBeVisible();
    await openCart.first().click();
  }

  await page.waitForTimeout(500);

  console.log('--- TEXTO DA CESTA ---');
  console.log(await page.locator('body').innerText());

  console.log('--- BOTÕES ---');
  console.log(
    await page.locator('button').evaluateAll(btns =>
      btns.map(b => ({
        text: (b.textContent || '').trim(),
        aria: b.getAttribute('aria-label'),
        title: b.getAttribute('title')
      })).filter(x => x.text || x.aria || x.title)
    )
  );
});
