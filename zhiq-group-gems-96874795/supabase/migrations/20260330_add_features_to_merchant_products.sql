-- =========================================================
-- EXPANSÃO DE PACOTES DE CRÉDITOS - FEATURES/BENEFÍCIOS
-- =========================================================

-- 1. Adicionar coluna features_json para os pacotes de mercadorias (Produtos/Marketplace)
do $$
begin
  if not exists (select 1 from information_schema.columns where table_name = 'merchant_credit_products' and column_name = 'features_json') then
    alter table public.merchant_credit_products add column features_json jsonb default '[]'::jsonb;
  end if;
end
$$;

-- 2. Atualizar registros existentes com benefícios padrão para evitar cards vazios
update public.merchant_credit_products 
set features_json = '["Exposição Premium", "Destaque no Marketplace", "Suporte Prioritário", "Painel de Leads"]'::jsonb
where features_json = '[]'::jsonb or features_json is null;

-- Notificar o PostgREST para recarregar o schema
notify pgrst, 'reload schema';
