const modules = [
  { name: 'Leilões', slug: 'leiloes' },
  { name: 'Marketplace', slug: 'marketplace' },
  { name: 'Imóveis', slug: 'imoveis' },
  { name: 'Veículos', slug: 'veiculos' },
  { name: 'Fretes', slug: 'fretes' },
  { name: 'Viagens', slug: 'viagens' },
  { name: 'Turismo', slug: 'turismo' },
  { name: 'Serviços', slug: 'servicos' },
  { name: 'Financeiro', slug: 'financeiro' },
  { name: 'Administração', slug: 'admin' },
];

let sql = '';
for (const mod of modules) {
  sql += `INSERT INTO public.shc_modules (name, slug, status, current_version) VALUES ('${mod.name}', '${mod.slug}', 'active', '1.0.0') ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name;\n`;
}
sql += 'SELECT id, slug, name FROM public.shc_modules;';
console.log(sql);
