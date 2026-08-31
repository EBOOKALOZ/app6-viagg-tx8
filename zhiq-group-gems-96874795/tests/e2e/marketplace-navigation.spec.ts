import { test, expect } from '@playwright/test';

test.describe('Marketplace Navigation and UI', () => {
  test('should load the public marketplace without runtime errors', async ({ page }) => {
    const errors: string[] = [];

    page.on('pageerror', (e) => errors.push(e.message));

    await page.goto('/mercado');
    await page.waitForLoadState('networkidle');

    await expect(page).toHaveTitle(/Viagg-TX8/i);
    await expect(page.locator('body')).toBeVisible();

    expect(
      errors,
      `Erros de runtime no Marketplace: ${errors.join('; ')}`
    ).toEqual([]);
  });
});
