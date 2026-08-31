import { test } from '@playwright/test';

test('diagnostic marketplace product elements', async ({ page }) => {
  await page.goto('/mercado');
  await page.waitForLoadState('networkidle');

  const links = await page.locator('a').evaluateAll(elements =>
    elements.map(el => ({
      text: (el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 120),
      href: (el as HTMLAnchorElement).href
    })).filter(x => x.href)
  );

  const buttons = await page.locator('button').evaluateAll(elements =>
    elements.map(el => ({
      text: (el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 120)
    })).filter(x => x.text)
  );

  console.log('=== LINKS ===');
  console.log(JSON.stringify(links, null, 2));

  console.log('=== BUTTONS ===');
  console.log(JSON.stringify(buttons, null, 2));
});
