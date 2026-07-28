import { test, expect } from '@playwright/test';

test.describe('Auction Navigation and UI', () => {
  test('should load the main auctions page', async ({ page }) => {
    await page.goto('/leiloes');
    await expect(page).toHaveTitle(/Viagg-TX8/i);
  });

  test('should load a public listing detail page without console errors', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));

    await page.goto('/mercado/leiloes');
    await page.waitForLoadState('networkidle');

    const firstCard = page.locator('a[href*="/mercado/leiloes/"]').first();
    const hasListing = await firstCard.count() > 0;
    if (hasListing) {
      await firstCard.click();
      await page.waitForLoadState('networkidle');
      // Regressão do P0-1 (2026-07-28): import de componente inexistente
      // quebrava a montagem desta página inteira.
      await expect(page.locator('body')).toBeVisible();
    }

    expect(errors, `Erros de runtime na página: ${errors.join('; ')}`).toEqual([]);
  });
});
