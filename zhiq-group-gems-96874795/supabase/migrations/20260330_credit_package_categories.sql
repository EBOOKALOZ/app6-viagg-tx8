-- =========================================================
-- EXPANSÃO DE PACOTES DE CRÉDITOS - CATEGORIAS
-- =========================================================

-- 1. Adicionar coluna de categoria
do $$
begin
  if not exists (select 1 from information_schema.columns where table_name = 'real_estate_credit_packages' and column_name = 'category') then
    alter table public.real_estate_credit_packages add column category text not null default 'real_estate';
  end if;
end
$$;

-- 2. Atualizar pacotes existentes para 'real_estate' (redundante pelo default, mas boa prática)
update public.real_estate_credit_packages set category = 'real_estate' where category is null;

-- 3. Seed de pacotes para VEÍCULOS
-- Criando alguns planos iniciais para o segmento automotivo
insert into public.real_estate_credit_packages 
(name, slug, category, package_type, credits_amount, bonus_credits, price_brl, is_featured, is_recommended, description, sort_order, badge_text, features_json)
values
('Venda Rápida Auto', 'venda-rapida-veiculos', 'vehicles', 'avulso', 5, 0, 49.90, false, false, 'Ideal para vender um carro rapidamente com visibilidade local.', 10, 'STARTER', '["5 Créditos de Contato", "Visibilidade no Mapa", "Fotos Ilimitadas", "Suporte via WhatsApp"]'),
('Turbo Veículos', 'turbo-veiculos', 'vehicles', 'mensal', 25, 5, 129.90, true, true, 'Melhor custo-benefício para lojistas ou vendedores frequentes.', 20, 'POPULAR', '["30 Créditos de Contato (25+5)", "Destaque nas Buscas", "Painel de Leads Exclusivo", "Suporte Prioritário", "Relatórios Mensais"]'),
('Revenda Pro', 'revenda-pro-veiculos', 'vehicles', 'mensal', 100, 30, 399.00, false, false, 'Plano empresarial para concessionárias e revendas de veículos.', 30, 'BUSINESS', '["130 Créditos de Contato (100+30)", "Destaque Premium em todos Anúncios", "Gestor de Conta Exclusivo", "API de Integração", "Selo de Vendedor Verificado"]')
on conflict (slug) do nothing;

-- Notificar o PostgREST para recarregar o schema
notify pgrst, 'reload schema';
