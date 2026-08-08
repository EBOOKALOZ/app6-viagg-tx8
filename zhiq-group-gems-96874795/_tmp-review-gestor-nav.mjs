import { chromium } from "playwright";

const results = {};
const errors = [];
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
page.on("console", (msg) => { if (msg.type() === "error") errors.push(msg.text()); });
page.on("pageerror", (err) => errors.push(String(err)));

await page.goto("http://localhost:8081/_dev-preview-gestor-nav", { waitUntil: "domcontentloaded", timeout: 15000 });
await page.waitForTimeout(1500);

// 1. Confirmar as 5 seções
const sectionLabels = ["VISÃO GERAL", "CAPTAÇÃO", "CREDENCIAMENTO", "DOAÇÕES & CAMPANHAS", "OPERAÇÃO"];
for (const label of sectionLabels) {
  results[`secao:${label}`] = await page.getByText(label, { exact: true }).count();
}

// 2. Confirmar itens de topo visíveis antes de expandir
const topLevelLabels = ["Dashboard", "Convênios", "Leads de Parceiros", "Indicações", "Credenciamento", "Campanhas", "Doações", "Prestação de Contas", "Relatórios", "Auditoria", "Mensagens", "Gestão de Acesso", "Configurações"];
for (const label of topLevelLabels) {
  results[`item:${label}`] = await page.getByText(label, { exact: true }).count();
}

await page.screenshot({ path: "_tmp-review-1-collapsed.png", fullPage: true });

// 3. Abrir Credenciamento
const credButton = page.locator("button", { hasText: "Credenciamento" });
await credButton.click();
await page.waitForTimeout(400);

const categorias = ["Clínicas", "Laboratórios", "Farmácias", "Hospitais", "Instituições", "Parceiros"];
for (const cat of categorias) {
  results[`categoria-aberta:${cat}`] = await page.getByText(cat, { exact: true }).count();
}
results["visao-geral-submenu"] = await page.getByText("VISÃO GERAL", { exact: false }).count();
await page.screenshot({ path: "_tmp-review-2-expanded.png", fullPage: true });

// 4. Testar clique no link "Visão geral" do submenu (não deve navegar para 404, deve manter layout)
const submenuVisaoGeral = page.locator("a", { hasText: "VISÃO GERAL" }).first();
results["submenu-visao-geral-href"] = await submenuVisaoGeral.getAttribute("href");

// 5. Fechar
await credButton.click();
await page.waitForTimeout(400);
results["categoria-apos-fechar:Clínicas"] = await page.getByText("Clínicas", { exact: true }).count();
await page.screenshot({ path: "_tmp-review-3-closed.png", fullPage: true });

// 6. Reabrir e verificar consistência
await credButton.click();
await page.waitForTimeout(400);
results["categoria-reaberto:Clínicas"] = await page.getByText("Clínicas", { exact: true }).count();
await page.screenshot({ path: "_tmp-review-4-reopened.png", fullPage: true });

// 7. Teclado: foco e Enter no botão Credenciamento
await credButton.click(); // fecha de novo
await page.waitForTimeout(300);
await credButton.focus();
const focused = await page.evaluate(() => document.activeElement?.textContent);
results["foco-teclado-credenciamento"] = focused;
await page.keyboard.press("Enter");
await page.waitForTimeout(400);
results["categoria-apos-enter:Clínicas"] = await page.getByText("Clínicas", { exact: true }).count();

// 8. Viewport mobile
await page.setViewportSize({ width: 375, height: 812 });
await page.waitForTimeout(500);
await page.screenshot({ path: "_tmp-review-5-mobile.png", fullPage: true });
const desktopAsideVisible = await page.locator("aside.hidden.lg\\:fixed").isVisible().catch(() => false);
results["mobile-desktop-aside-hidden"] = !desktopAsideVisible;
const mobileMenuButton = await page.locator("header button").count();
results["mobile-menu-button-count"] = mobileMenuButton;

console.log("RESULTADOS:", JSON.stringify(results, null, 2));
console.log("ERROS:", JSON.stringify(errors, null, 2));

await browser.close();
