INSERT INTO public.shc_modules (name, slug) VALUES ('Leilões', 'leiloes') ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name;
INSERT INTO public.shc_modules (name, slug) VALUES ('Marketplace', 'marketplace') ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name;
INSERT INTO public.shc_modules (name, slug) VALUES ('Imóveis', 'imoveis') ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name;
INSERT INTO public.shc_modules (name, slug) VALUES ('Veículos', 'veiculos') ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name;
INSERT INTO public.shc_modules (name, slug) VALUES ('Fretes', 'fretes') ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name;
INSERT INTO public.shc_modules (name, slug) VALUES ('Viagens', 'viagens') ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name;
INSERT INTO public.shc_modules (name, slug) VALUES ('Turismo', 'turismo') ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name;
INSERT INTO public.shc_modules (name, slug) VALUES ('Serviços', 'servicos') ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name;
INSERT INTO public.shc_modules (name, slug) VALUES ('Financeiro', 'financeiro') ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name;
INSERT INTO public.shc_modules (name, slug) VALUES ('Administração', 'admin') ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name;

SELECT id, slug, name FROM public.shc_modules;
