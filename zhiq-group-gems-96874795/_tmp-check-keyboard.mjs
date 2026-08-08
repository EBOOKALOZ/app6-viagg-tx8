import { chromium } from "playwright";
const browser = await chromium.launch();
const page = await browser.newPage();
await page.goto("http://localhost:8081/_dev-preview-gestor-nav", { waitUntil: "domcontentloaded", timeout: 15000 });
await page.waitForTimeout(1500);

const credButton = page.locator("button", { hasText: "Credenciamento" });
console.log("Fechado inicialmente, Clínicas visível?", await page.getByText("Clínicas", { exact: true }).count());

await credButton.focus();
const tag = await page.evaluate(() => document.activeElement?.tagName);
console.log("Elemento focado é <" + tag + ">");

await page.keyboard.press("Enter");
await page.waitForTimeout(400);
console.log("Após Enter, Clínicas visível?", await page.getByText("Clínicas", { exact: true }).count());

await page.keyboard.press("Enter");
await page.waitForTimeout(400);
console.log("Após 2º Enter (deve fechar), Clínicas visível?", await page.getByText("Clínicas", { exact: true }).count());

// Tab navigation check: does focus move from button into the expanded links?
await page.keyboard.press("Enter"); // reabre
await page.waitForTimeout(300);
await page.keyboard.press("Tab");
const afterTab = await page.evaluate(() => document.activeElement?.textContent);
console.log("Após reabrir + Tab, foco em:", afterTab);

await browser.close();
