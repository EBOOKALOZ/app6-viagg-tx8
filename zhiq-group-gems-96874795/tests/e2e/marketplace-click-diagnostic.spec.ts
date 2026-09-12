import { test } from '@playwright/test';

test('diagnostic marketplace purchase navigation', async ({ page }) => {
  await page.goto('/mercado');
  await page.waitForLoadState('networkidle');

  const buyButtons = page.getByRole('button', { name: 'Comprar Agora' });

  console.log('Quantidade de Comprar Agora:', await buyButtons.count());

  await buyButtons.first().click();

  await page.waitForLoadState('networkidle');

  console.log('URL após clicar:', page.url());
  console.log('Título:', await page.title());
});
