import { chromium } from "playwright";
const browser = await chromium.launch();
const page = await browser.newPage();
await page.goto("http://localhost:8081/_dev-preview-gestor-nav", { waitUntil: "domcontentloaded", timeout: 15000 });
await page.waitForTimeout(1500);
const texts = await page.locator("nav p").allTextContents();
console.log(JSON.stringify(texts, null, 2));
await browser.close();
