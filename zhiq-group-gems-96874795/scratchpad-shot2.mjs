import { chromium } from 'playwright';
const browser = await chromium.launch();

const desktop = await browser.newPage({ viewport: { width: 1400, height: 900 } });
await desktop.goto('http://localhost:8080/mercado', { waitUntil: 'networkidle', timeout: 30000 });
await desktop.waitForTimeout(2500);
const card = desktop.getByRole('button', { name: /Viagg-TX8 MedPrev/i });
await card.scrollIntoViewIfNeeded();
await desktop.waitForTimeout(500);
await card.screenshot({ path: 'C:/Users/angel/AppData/Local/Temp/claude/f--APP6-VIAGG-TX8--tx8-viagg-analise-programador-zhiq-group-gems-96874795/6a610e98-efaa-4ada-9a81-76c888dd3050/scratchpad/card-live2.png' });
await desktop.close();

const mobile = await browser.newPage({ viewport: { width: 390, height: 844 } });
await mobile.goto('http://localhost:8080/mercado', { waitUntil: 'networkidle', timeout: 30000 });
await mobile.waitForTimeout(2500);
const cardM = mobile.getByRole('button', { name: /Viagg-TX8 MedPrev/i });
await cardM.scrollIntoViewIfNeeded();
await mobile.waitForTimeout(500);
await cardM.screenshot({ path: 'C:/Users/angel/AppData/Local/Temp/claude/f--APP6-VIAGG-TX8--tx8-viagg-analise-programador-zhiq-group-gems-96874795/6a610e98-efaa-4ada-9a81-76c888dd3050/scratchpad/card-mobile2.png' });
await mobile.close();

await browser.close();
