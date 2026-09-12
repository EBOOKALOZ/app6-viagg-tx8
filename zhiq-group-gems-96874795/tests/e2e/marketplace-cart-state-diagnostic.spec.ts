import { test } from '@playwright/test';

test('diagnostic Marketplace cart state after purchase', async ({ page }) => {
  page.on('pageerror', e => console.log('PAGE ERROR:', e.message));
  page.on('console', msg => {
    if (
      msg.text().includes('[GlobalCart]') ||
      msg.text().includes('cart')
    ) {
      console.log('CONSOLE:', msg.text());
    }
  });

  await page.goto('/mercado');
  await page.waitForLoadState('networkidle');

  const buyButtons = page.getByRole('button', { name: 'Comprar Agora' });

  console.log('Comprar Agora:', await buyButtons.count());

  await buyButtons.first().click();

  await page.waitForTimeout(2000);

  console.log('URL:', page.url());

  console.log(
    'localStorage:',
    await page.evaluate(() => Object.keys(localStorage).map(k => ({
      key: k,
      value: localStorage.getItem(k)
    })))
  );

  console.log(
    'Botões cesta:',
    await page.locator('button').evaluateAll(btns =>
      btns.map(b => ({
        text: (b.textContent || '').trim(),
        aria: b.getAttribute('aria-label'),
        title: b.getAttribute('title')
      })).filter(x =>
        x.text.toLowerCase().includes('cesta') ||
        x.text.toLowerCase().includes('carrinho') ||
        (x.aria || '').toLowerCase().includes('cesta') ||
        (x.aria || '').toLowerCase().includes('carrinho') ||
        (x.title || '').toLowerCase().includes('cesta') ||
        (x.title || '').toLowerCase().includes('carrinho')
      )
    )
  );
});
