/**
 * generate-seo.mjs — GERADOR DA CAMADA GEO/LLMO/AISO da Viagg-TX8.
 *
 * FONTE ÚNICA: src/lib/seo/modules.json. Um módulo novo cadastrado lá e o
 * próximo build regenera AUTOMATICAMENTE: sitemap, robots, llms.txt,
 * feed de IA, API de metadados, Knowledge Graph e a página institucional
 * pública em HTML PURO (rastreável sem JavaScript — o que crawlers de IA
 * de fato leem numa SPA).
 *
 * Roda no `npm run build` (script "prebuild"-like encadeado) ou manual:
 *   node scripts/generate-seo.mjs
 *
 * SEGURANÇA: só entra aqui o que está no registro público (modules.json).
 * Nenhum dado de usuário, token ou rota privada é exposto.
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const PUB = join(ROOT, "public");
const REG = JSON.parse(readFileSync(join(ROOT, "src/lib/seo/modules.json"), "utf8"));

const SITE = REG.site;
const MODS = REG.modulos.filter((m) => m.publico);
const BASE = SITE.url.replace(/\/$/, "");
const NOW = new Date().toISOString().slice(0, 10);

const esc = (s = "") =>
  String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

mkdirSync(join(PUB, "institucional"), { recursive: true });
mkdirSync(join(PUB, "api"), { recursive: true });

/* ── 1. robots.txt — indexa o público, bloqueia o privado ── */
writeFileSync(join(PUB, "robots.txt"), `# Viagg-TX8 — robots
User-agent: *
Allow: /
Allow: /institucional/
Disallow: /admin
Disallow: /merchant
Disallow: /motoboy
Disallow: /driver
Disallow: /select-profile
Disallow: /auth
Disallow: /teste-brick
Disallow: /mp-brick-teste.html
Disallow: /debug
Disallow: /sandbox

Sitemap: ${BASE}/sitemap.xml
`);

/* ── 2. sitemap.xml (público + institucionais) ── */
const publicRoutes = [
  { loc: "/", pri: "1.0" },
  { loc: "/institucional/", pri: "0.9" },
  ...MODS.map((m) => ({ loc: `/institucional/${m.slug}.html`, pri: "0.8" })),
  { loc: "/mercado", pri: "0.9" },
  { loc: "/corridas", pri: "0.9" },
  { loc: "/solicitar-corrida", pri: "0.8" },
  { loc: "/servicos", pri: "0.7" },
  { loc: "/fretes", pri: "0.7" },
  { loc: "/viagens", pri: "0.7" },
  { loc: "/automoveis", pri: "0.7" },
];
writeFileSync(join(PUB, "sitemap.xml"),
`<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${publicRoutes.map((r) => `  <url><loc>${BASE}${r.loc}</loc><lastmod>${NOW}</lastmod><changefreq>weekly</changefreq><priority>${r.pri}</priority></url>`).join("\n")}
</urlset>
`);

/* ── 3. llms.txt — padrão emergente de descoberta por LLMs ── */
writeFileSync(join(PUB, "llms.txt"), `# ${SITE.name}

> ${SITE.descricao}

Idioma: ${SITE.idioma} · País: ${SITE.pais}
Categorias: ${SITE.categorias.join(", ")}

## Módulos da plataforma

${MODS.map((m) => `- [${m.nome}](${BASE}/institucional/${m.slug}.html): ${m.oQueE}`).join("\n")}

## Recursos para máquinas

- Feed de IA (JSON): ${BASE}/ai-feed.json
- API de metadados dos módulos: ${BASE}/api/modules.json
- Knowledge Graph: ${BASE}/knowledge-graph.json
- Sitemap: ${BASE}/sitemap.xml
`);

/* ── 4. Feed para IA + API de metadados + Knowledge Graph ── */
const feed = {
  plataforma: SITE.name,
  url: BASE,
  descricao: SITE.descricao,
  idioma: SITE.idioma,
  atualizado_em: NOW,
  versao: "1.0",
  modulos: MODS.map((m) => ({
    slug: m.slug,
    nome: m.nome,
    categoria: m.categoria,
    url_publica: `${BASE}/institucional/${m.slug}.html`,
    rota_app: m.rota,
    resumo: m.oQueE,
    como_funciona: m.comoFunciona,
    beneficios: m.beneficios,
    casos_de_uso: m.casosDeUso,
    palavras_chave: m.tags,
    faq: m.faq,
  })),
};
writeFileSync(join(PUB, "ai-feed.json"), JSON.stringify(feed, null, 2));
writeFileSync(join(PUB, "api", "modules.json"), JSON.stringify({
  plataforma: SITE.name, versao: "1.0", atualizado_em: NOW,
  modulos: MODS.map((m) => ({
    slug: m.slug, nome: m.nome, categoria: m.categoria, tags: m.tags,
    descricao: m.oQueE, url: `${BASE}/institucional/${m.slug}.html`,
  })),
}, null, 2));

const kg = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Organization",
      "@id": `${BASE}/#org`,
      name: SITE.name,
      url: BASE,
      slogan: SITE.slogan,
      description: SITE.descricao,
      areaServed: "BR",
      knowsLanguage: "pt-BR",
    },
    {
      "@type": "WebApplication",
      "@id": `${BASE}/#app`,
      name: SITE.name,
      url: BASE,
      applicationCategory: "BusinessApplication",
      operatingSystem: "Web",
      inLanguage: "pt-BR",
      publisher: { "@id": `${BASE}/#org` },
      offers: { "@type": "Offer", price: "0", priceCurrency: "BRL", description: "Uso gratuito; serviços pagos por corrida/entrega." },
      featureList: MODS.map((m) => m.nome),
    },
    ...MODS.map((m) => ({
      "@type": "Service",
      "@id": `${BASE}/institucional/${m.slug}.html#service`,
      name: m.nome,
      serviceType: m.categoria,
      description: m.oQueE,
      url: `${BASE}/institucional/${m.slug}.html`,
      provider: { "@id": `${BASE}/#org` },
      areaServed: "BR",
      keywords: m.tags.join(", "),
    })),
  ],
};
writeFileSync(join(PUB, "knowledge-graph.json"), JSON.stringify(kg, null, 2));

/* ── 5. Páginas institucionais em HTML PURO (rastreáveis sem JS) ── */
const CSS = `
:root{--laranja:#FF6A00;--escuro:#0f1729;--cinza:#5b6472}
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;color:#1c2333;line-height:1.65;background:#fafbfc}
.wrap{max-width:860px;margin:0 auto;padding:24px 20px 60px}
header.site{background:var(--escuro);color:#fff;padding:14px 0}
header.site .wrap{padding:0 20px;display:flex;justify-content:space-between;align-items:center}
header.site a{color:#fff;text-decoration:none;font-weight:800}
header.site a.cta{background:var(--laranja);padding:8px 16px;border-radius:10px;font-size:14px}
h1{font-size:clamp(26px,4vw,38px);line-height:1.2;margin:26px 0 8px}
h2{font-size:20px;margin:34px 0 10px;color:var(--escuro)}
p.lead{font-size:18px;color:var(--cinza)}
.badge{display:inline-block;background:#fff3ea;color:var(--laranja);font-weight:700;font-size:12px;padding:4px 12px;border-radius:99px;border:1px solid #ffd9bd}
ul.beneficios{list-style:none;margin:10px 0}
ul.beneficios li{padding:8px 0 8px 30px;position:relative}
ul.beneficios li:before{content:"✓";position:absolute;left:4px;color:var(--laranja);font-weight:900}
.faq details{background:#fff;border:1px solid #e8ebf0;border-radius:12px;padding:14px 18px;margin:10px 0}
.faq summary{font-weight:700;cursor:pointer}
.faq p{margin-top:8px;color:var(--cinza)}
nav.bc{font-size:13px;color:var(--cinza);margin-top:18px}
nav.bc a{color:var(--laranja);text-decoration:none}
a.voltar{display:inline-block;margin-top:34px;background:var(--laranja);color:#fff;padding:12px 26px;border-radius:12px;text-decoration:none;font-weight:800}
footer{margin-top:50px;padding-top:20px;border-top:1px solid #e8ebf0;font-size:13px;color:var(--cinza)}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(250px,1fr));gap:14px;margin-top:22px}
.card{background:#fff;border:1px solid #e8ebf0;border-radius:14px;padding:18px;text-decoration:none;color:inherit;display:block}
.card:hover{border-color:var(--laranja)}
.card h3{font-size:16px;margin-bottom:6px}
.card p{font-size:13px;color:var(--cinza)}
input.busca{width:100%;padding:12px 16px;border:1px solid #dfe4ea;border-radius:12px;font-size:15px;margin-top:18px}
`;

const pageShell = (title, desc, canonical, jsonld, body) => `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}"/>
<link rel="canonical" href="${canonical}"/>
<meta name="robots" content="index,follow"/>
<meta name="language" content="pt-BR"/>
<meta name="author" content="${esc(SITE.name)}"/>
<meta name="application-name" content="${esc(SITE.name)}"/>
<meta property="og:site_name" content="${esc(SITE.name)}"/>
<meta property="og:title" content="${esc(title)}"/>
<meta property="og:description" content="${esc(desc)}"/>
<meta property="og:type" content="website"/>
<meta property="og:url" content="${canonical}"/>
<meta property="og:locale" content="pt_BR"/>
<meta name="twitter:card" content="summary"/>
<meta name="twitter:title" content="${esc(title)}"/>
<meta name="twitter:description" content="${esc(desc)}"/>
<link rel="icon" href="/favicon.png" type="image/png"/>
<style>${CSS}</style>
${jsonld.map((j) => `<script type="application/ld+json">${JSON.stringify(j)}</script>`).join("\n")}
</head>
<body>
<header class="site"><div class="wrap"><a href="/institucional/">Viagg-TX8 · Central de Módulos</a><a class="cta" href="/">Abrir o app</a></div></header>
<div class="wrap">
${body}
<footer>© ${new Date().getFullYear()} ${esc(SITE.name)} — ${esc(SITE.slogan)}. <a href="/institucional/" style="color:var(--laranja)">Todos os módulos</a> · <a href="/" style="color:var(--laranja)">Acessar a plataforma</a></footer>
</div>
</body>
</html>`;

for (const m of MODS) {
  const canonical = `${BASE}/institucional/${m.slug}.html`;
  const jsonld = [
    {
      "@context": "https://schema.org",
      "@type": "Service",
      name: m.nome,
      serviceType: m.categoria,
      description: m.oQueE,
      url: canonical,
      provider: { "@type": "Organization", name: SITE.name, url: BASE },
      areaServed: "BR",
      keywords: m.tags.join(", "),
    },
    {
      "@context": "https://schema.org",
      "@type": "FAQPage",
      mainEntity: m.faq.map((f) => ({
        "@type": "Question",
        name: f.p,
        acceptedAnswer: { "@type": "Answer", text: f.r },
      })),
    },
    {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Viagg-TX8", item: BASE },
        { "@type": "ListItem", position: 2, name: "Módulos", item: `${BASE}/institucional/` },
        { "@type": "ListItem", position: 3, name: m.nome, item: canonical },
      ],
    },
  ];
  const body = `
<nav class="bc"><a href="/">Viagg-TX8</a> › <a href="/institucional/">Módulos</a> › ${esc(m.nome)}</nav>
<span class="badge">${esc(m.categoria)}</span>
<h1>${esc(m.nome)}</h1>
<p class="lead">${esc(m.oQueE)}</p>
<h2>Como funciona</h2>
<p>${esc(m.comoFunciona)}</p>
<h2>Benefícios</h2>
<ul class="beneficios">${m.beneficios.map((b) => `<li>${esc(b)}</li>`).join("")}</ul>
<h2>Casos de uso</h2>
<ul class="beneficios">${m.casosDeUso.map((c) => `<li>${esc(c)}</li>`).join("")}</ul>
<h2>Perguntas frequentes</h2>
<div class="faq">${m.faq.map((f) => `<details><summary>${esc(f.p)}</summary><p>${esc(f.r)}</p></details>`).join("")}</div>
<a class="voltar" href="/">Usar ${esc(m.nome)} na plataforma →</a>`;
  writeFileSync(join(PUB, "institucional", `${m.slug}.html`),
    pageShell(`${m.nome} | ${SITE.name}`, m.oQueE, canonical, jsonld, body));
}

/* ── 6. Índice institucional com busca interna (client-side leve) ── */
const idxJsonld = [
  {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: `Módulos da ${SITE.name}`,
    description: SITE.descricao,
    url: `${BASE}/institucional/`,
    isPartOf: { "@type": "WebSite", name: SITE.name, url: BASE },
  },
  {
    "@context": "https://schema.org",
    "@type": "ItemList",
    itemListElement: MODS.map((m, i) => ({
      "@type": "ListItem", position: i + 1, name: m.nome,
      url: `${BASE}/institucional/${m.slug}.html`,
    })),
  },
];
const idxBody = `
<h1>Módulos da Viagg-TX8</h1>
<p class="lead">${esc(SITE.descricao)}</p>
<input class="busca" id="q" type="search" placeholder="Buscar módulo, função ou palavra-chave…" aria-label="Buscar módulos"/>
<div class="grid" id="grid">
${MODS.map((m) => `<a class="card" href="/institucional/${m.slug}.html" data-k="${esc((m.nome + " " + m.categoria + " " + m.tags.join(" ")).toLowerCase())}"><h3>${esc(m.nome)}</h3><p>${esc(m.oQueE.slice(0, 120))}…</p></a>`).join("\n")}
</div>
<script>
document.getElementById('q').addEventListener('input',function(){var q=this.value.toLowerCase();
document.querySelectorAll('#grid .card').forEach(function(c){c.style.display=c.dataset.k.indexOf(q)>-1?'':'none'})});
</script>`;
writeFileSync(join(PUB, "institucional", "index.html"),
  pageShell(`Módulos e Funcionalidades | ${SITE.name}`, SITE.descricao, `${BASE}/institucional/`, idxJsonld, idxBody));

console.log(`[seo] gerado: robots.txt, sitemap.xml, llms.txt, ai-feed.json, api/modules.json, knowledge-graph.json, institucional/ (${MODS.length + 1} páginas)`);
