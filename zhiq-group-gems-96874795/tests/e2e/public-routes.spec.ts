import { test, expect } from '@playwright/test';

const routes = [
  '/mercado',
  '/leiloes',
  '/mercado/leiloes',
  '/servicos',
  '/fretes',
];

for (const route of routes) {
  test(`should load ${route} without runtime errors`, async ({ page }) => {
    const errors: string[] = [];

    page.on('pageerror', (e) => errors.push(e.message));

    await page.goto(route);
    await page.waitForLoadState('networkidle');

    await expect(page).toHaveTitle(/Viagg-TX8/i);
    await expect(page.locator('body')).toBeVisible();

    expect(
      errors,
      `Erros de runtime em ${route}: ${errors.join('; ')}`
    ).toEqual([]);
  });
}
