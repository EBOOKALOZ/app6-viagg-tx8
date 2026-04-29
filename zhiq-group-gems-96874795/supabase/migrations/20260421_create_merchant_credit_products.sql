-- =========================================================
-- CRIAR TABELA merchant_credit_products (PACOTES DE PRODUTOS)
-- =========================================================
-- Tabela para pacotes de créditos do marketplace/produtos
-- Usada pelo componente ProductPackagesManager e hooks

do $$
begin
  -- 1. Criar tabela se não existir
  if not exists (select 1 from information_schema.tables where table_name = 'merchant_credit_products' and table_schema = 'public') then

    create table public.merchant_credit_products (
      id uuid primary key default gen_random_uuid(),
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),

      -- Identificação
      name text not null,
      slug text unique,
      product_type text not null default 'product',

      -- Créditos
      credits_base integer not null default 0,
      credits_bonus integer not null default 0,
      credits_amount integer generated always as (credits_base + credits_bonus) stored,

      -- Preço
      price_cents integer not null default 0,
      price_brl numeric(14,2) generated always as (price_cents / 100.0) stored,

      -- Conteúdo
      description text,
      badge_text text,
      action_label text default 'ADQUIRIR AGORA',

      -- Benefícios (JSON array)
      features_json jsonb default '[]'::jsonb,

      -- Flags
      is_active boolean not null default true,
      is_featured boolean not null default false,
      is_recommended boolean not null default false,
      sort_order integer not null default 0
    );

    -- Índices
    create index if not exists idx_merchant_credit_products_active on public.merchant_credit_products(is_active);
    create index if not exists idx_merchant_credit_products_sort on public.merchant_credit_products(sort_order);
    create index if not exists idx_merchant_credit_products_slug on public.merchant_credit_products(slug);

    -- Trigger updated_at
    drop trigger if exists trg_merchant_credit_products_updated_at on public.merchant_credit_products;
    create trigger trg_merchant_credit_products_updated_at
    before update on public.merchant_credit_products
    for each row
    execute function public.set_updated_at();

    -- RLS
    alter table public.merchant_credit_products enable row level security;

    -- Policies: Admin pode gerenciar tudo
    create policy "Admins can manage merchant credit products"
    on public.merchant_credit_products
    for all
    to authenticated
    using (public.has_role(auth.uid(), 'admin'))
    with check (public.has_role(auth.uid(), 'admin'));

    -- Policies: Public pode ler ativos
    create policy "Public can view active merchant credit products"
    on public.merchant_credit_products
    for select
    to anon, authenticated
    using (is_active = true);

    raise notice '✅ Tabela merchant_credit_products criada com sucesso';

  else
    raise notice 'ℹ️ Tabela merchant_credit_products já existe';
  end if;
end
$$;

notify pgrst, 'reload schema';
