-- =========================================================
-- PACOTES DE CRÉDITOS PARA PRODUTOS - SEED
-- =========================================================

-- 1. Inserção de pacotes específicos para o segmento PRODUCTS
insert into public.real_estate_credit_packages 
(name, slug, category, package_type, credits_amount, bonus_credits, price_brl, is_featured, is_recommended, description, sort_order, badge_text, features_json)
values
('Vitrine Bronze', 'vitrine-bronze-produtos', 'products', 'avulso', 3, 0, 29.90, false, false, 'Ideal para vender produtos casuais com visibilidade local.', 10, 'STARTER', '["3 Créditos de Anúncio", "Visibilidade no Marketplace", "Mapa de Produtos", "Suporte via SAC"]'),
('Turbo Prata', 'turbo-prata-produtos', 'products', 'mensal', 15, 5, 89.90, true, true, 'Perfeito para vendedores frequentes que buscam escala mensal.', 20, 'POPULAR', '["20 Créditos (15+5 Bônus)", "Destaque na Vitrine", "Renovação Automática", "Suporte Prioritário", "Análise de Cliques"]'),
('Diamante Vendas', 'diamante-vendas-produtos', 'products', 'mensal', 50, 15, 249.00, false, false, 'Plano de alta performance para lojistas e revendedores profissionais.', 30, 'PREMIUM', '["65 Créditos (50+15 Bônus)", "Destaque Máximo em todos itens", "Gestor de Anúncios", "Selo de Loja Verificada", "API de Estoque (Beta)"]')
on conflict (slug) do nothing;

-- Notificar o PostgREST para recarregar o schema
notify pgrst, 'reload schema';
