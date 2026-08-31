import { test, expect } from '@playwright/test';

test.describe('Marketplace Functional Flow', () => {
  test('should open marketplace and interact with a product', async ({ page }) => {
    const errors: string[] = [];

    page.on('pageerror', (e) => errors.push(e.message));

    await page.goto('/mercado');
    await page.waitForLoadState('networkidle');

    await expect(page).toHaveTitle(/Viagg-TX8/i);
    await expect(page.locator('body')).toBeVisible();

    const productLinks = page.locator('a[href*="/produto/"]');
    const productCount = await productLinks.count();

    expect(
      productCount,
      'Nenhum link de produto encontrado no Marketplace.'
    ).toBeGreaterThan(0);

    await productLinks.first().click();

    await page.waitForLoadState('networkidle');

    await expect(page.locator('body')).toBeVisible();

    expect(
      errors,
      `Erros de runtime no fluxo Marketplace → Produto: ${errors.join('; ')}`
    ).toEqual([]);
  });
});
