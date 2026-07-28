import { chromium } from 'playwright';
import { writeFileSync, existsSync } from 'fs';

const OUTDIR = 'f:/APP6 VIAGG-TX8/-tx8-viagg-analise-programador/zhiq-group-gems-96874795';
const BASE = 'http://localhost:8081';

// Known test store IDs from the codebase - we'll try a few common patterns
// The app uses merchant_stores.id as storeId in the URL
// Let's navigate to mercado, scroll, wait for JS to load, then scrape links

(async () => {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  
  page.on('console', m => {
    if (m.type() === 'error') console.error('[BROWSER ERROR]', m.text());
  });

  // ── Navigate to mercado and wait for React to fully render ──────────
  console.log('Navigating to mercado...');
  await page.goto(BASE + '/mercado', { waitUntil: 'domcontentloaded' });
  
  // Wait for React to render by waiting for the product grid
  try {
    await page.waitForSelector('img', { timeout: 15000 });
  } catch (e) {
    console.log('Timed out waiting for img');
  }
  
  // Wait a bit more for all async data
  await page.waitForTimeout(5000);
  
  // Scroll to load more
  for (let i = 0; i < 5; i++) {
    await page.evaluate(() => window.scrollBy(0, 400));
    await page.waitForTimeout(500);
  }
  
  // Get all clickable links now that React has rendered
  const links = await page.evaluate(() => {
    return Array.from(document.querySelectorAll('a'))
      .map(a => ({ href: a.getAttribute('href'), text: a.textContent?.trim().slice(0, 30) }))
      .filter(l => l.href)
      .slice(0, 50);
  });
  
  console.log('Links found after wait:', links.length);
  writeFileSync(OUTDIR + '/all_links.json', JSON.stringify(links, null, 2));
  
  // Find store links
  const storeLinks = links.filter(l => /\/(loja|imobiliaria|revenda|prestador|freteiro|agencia|anunciante)\//.test(l.href || ''));
  console.log('Store links:', JSON.stringify(storeLinks.slice(0, 5)));

  // ── Find any product card and click it ─────────────────────────────
  // Look for product cards using multiple strategies
  let storeUrl = null;
  
  if (storeLinks.length > 0) {
    storeUrl = storeLinks[0].href;
  }
  
  // Strategy: look for "Ver Loja" or similar buttons
  if (!storeUrl) {
    const verLojaLinks = await page.evaluate(() => {
      return Array.from(document.querySelectorAll('a, button'))
        .filter(el => /ver\s*loja|acessar|loja/i.test(el.textContent || ''))
        .map(el => ({
          tag: el.tagName,
          text: el.textContent?.trim().slice(0, 40),
          href: el.getAttribute('href'),
          onclick: el.getAttribute('onclick')?.slice(0, 60)
        }))
        .slice(0, 10);
    });
    console.log('Ver Loja elements:', JSON.stringify(verLojaLinks));
  }

  // Take screenshot of scrolled state
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: OUTDIR + '/01_mercado_loaded.png', fullPage: false });

  // ── If no store links found, try clicking product and checking URL ──
  // Product cards in this app use Link components that render as <a> with href
  // But if they use onClick handlers instead, we need to click and observe navigation
  
  console.log('\nLooking for product cards with any clickable element...');
  const productCards = await page.evaluate(() => {
    // Look for card-like elements
    const cards = Array.from(document.querySelectorAll('[class*="card"], [class*="Card"], [class*="product"], [class*="Product"]'));
    return cards.map(c => ({
      class: c.className?.toString().slice(0, 60),
      tag: c.tagName,
      hasHref: c.getAttribute('href'),
      parentHref: c.closest('a')?.getAttribute('href')
    })).slice(0, 10);
  });
  console.log('Product cards:', JSON.stringify(productCards.slice(0, 5)));

  // ── Strategy: Navigate directly to a known store URL ─────────────────
  // The screenshot shows real products - let's try to build a store URL
  // by clicking on any "loja" element
  const lojaElements = await page.locator('text=Ver Loja, text=Acessar Loja, a[href*="loja"]').count();
  console.log('Loja link count:', lojaElements);
  
  // Try navigating to first anchor that resolves 
  // Let's use a known product from the data we can see in the screenshot
  // The pizza image shows a product - scroll down to find its card
  
  // Look for any clickable links at all - also non-anchor but with data-href
  const allClickables = await page.evaluate(() => {
    return Array.from(document.querySelectorAll('[data-href], a[href]'))
      .map(el => el.getAttribute('href') || el.getAttribute('data-href'))
      .filter(Boolean)
      .slice(0, 20);
  });
  console.log('All clickables:', allClickables);

  // ── Try the Supabase API to get a real store ID ───────────────────────
  // We know the Supabase URL from the .env
  
  await browser.close();
  console.log('\nDone - check all_links.json for the full link list');
})();
