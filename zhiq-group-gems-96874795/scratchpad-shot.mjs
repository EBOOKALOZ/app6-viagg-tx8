import { chromium } from 'playwright';
const browser = await chromium.launch();

// Mobile view of /mercado
const mobile = await browser.newPage({ viewport: { width: 390, height: 844 } });
await mobile.goto('http://localhost:8080/mercado', { waitUntil: 'networkidle', timeout: 30000 });
await mobile.waitForTimeout(2500);
await mobile.screenshot({ path: 'C:/Users/angel/AppData/Local/Temp/claude/f--APP6-VIAGG-TX8--tx8-viagg-analise-programador-zhiq-group-gems-96874795/6a610e98-efaa-4ada-9a81-76c888dd3050/scratchpad/mobile-mercado.png' });
await mobile.close();

// Desktop /medprev page
const desktop = await browser.newPage({ viewport: { width: 1400, height: 1400 } });
await desktop.goto('http://localhost:8080/medprev', { waitUntil: 'networkidle', timeout: 30000 });
await desktop.waitForTimeout(2000);
await desktop.screenshot({ path: 'C:/Users/angel/AppData/Local/Temp/claude/f--APP6-VIAGG-TX8--tx8-viagg-analise-programador-zhiq-group-gems-96874795/6a610e98-efaa-4ada-9a81-76c888dd3050/scratchpad/medprev-desktop.png' });
await desktop.close();

// Mobile /medprev
const mobile2 = await browser.newPage({ viewport: { width: 390, height: 844 } });
await mobile2.goto('http://localhost:8080/medprev', { waitUntil: 'networkidle', timeout: 30000 });
await mobile2.waitForTimeout(2000);
await mobile2.screenshot({ path: 'C:/Users/angel/AppData/Local/Temp/claude/f--APP6-VIAGG-TX8--tx8-viagg-analise-programador-zhiq-group-gems-96874795/6a610e98-efaa-4ada-9a81-76c888dd3050/scratchpad/medprev-mobile.png' });
await mobile2.close();

await browser.close();
