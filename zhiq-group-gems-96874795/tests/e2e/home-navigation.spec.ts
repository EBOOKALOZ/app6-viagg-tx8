import { test, expect } from '@playwright/test';

test.describe('Home Navigation and UI', () => {
  test('should load the home page without runtime errors', async ({ page }) => {
    const errors: string[] = [];

    page.on('pageerror', (e) => errors.push(e.message));

    await page.goto('/');
    await page.waitForLoadState('networkidle');

    await expect(page).toHaveTitle(/Viagg-TX8/i);
    await expect(page.locator('body')).toBeVisible();

    expect(
      errors,
      `Erros de runtime na Home: ${errors.join('; ')}`
    ).toEqual([]);
  });
});
