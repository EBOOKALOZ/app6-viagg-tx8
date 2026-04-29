-- =========================================================
-- SEED: PACOTES DE PRODUTOS (MARKETPLACE)
-- =========================================================
-- Insere pacotes padrão para merchant_credit_products
-- Executar apenas se a tabela existir e estiver vazia

-- Habilitar RLS temporariamente se necessário
-- set role authenticated;

do $$
begin
  -- Verifica se a tabela existe
  if exists (select 1 from information_schema.tables where table_name = 'merchant_credit_products' and table_schema = 'public') then

    -- Limpa dados existentes (opcional, para idempotência)
    -- delete from public.merchant_credit_products;

    -- Insere pacotes apenas se não houver nenhum
    if not exists (select 1 from public.merchant_credit_products limit 1) then

      insert into public.merchant_credit_products (
        id,
        name,
        slug,
        product_type,
        credits_base,
        credits_bonus,
        price_cents,
        description,
        badge_text,
        action_label,
        features_json,
        is_featured,
        is_recommended,
        is_active,
        sort_order,
        created_at,
        updated_at
      ) values
        -- Pacote 1: Básico
        (
          gen_random_uuid(),
          'Pacote Básico - 100 Créditos',
          'pacote-basico-100',
          'product',
          100,
          0,
          9900,
          'Ideal para pequenos lojistas que querem testar a plataforma. Inclui 100 créditos para impulsionar anúncios.',
          'Mais Vendido',
          'ADQUIRIR AGORA',
          '["100 créditos", "Suporte por email", "Análises básicas"]'::jsonb,
          false,
          true,
          true,
          1,
          now(),
          now()
        ),
        -- Pacote 2: Standard
        (
          gen_random_uuid(),
          'Pacote Standard - 500 Créditos',
          'pacote-standard-500',
          'product',
          500,
          50,
          44900,
          'Perfeito para lojas em crescimento. 500 créditos + 50 bônus para maximizar sua visibilidade.',
          'Destaque',
          'ADQUIRIR AGORA',
          '["500 créditos", "50 créditos bônus", "Suporte prioritário", "Destaque no marketplace"]'::jsonb,
          true,
          true,
          true,
          2,
          now(),
          now()
        ),
        -- Pacote 3: Premium
        (
          gen_random_uuid(),
          'Pacote Premium - 2000 Créditos',
          'pacote-premium-2000',
          'product',
          2000,
          300,
          149900,
          'Para grandes varejistas e anunciantes sérios. Máximo de créditos com bônus generoso.',
          'Premium',
          'ADQUIRIR AGORA',
          '["2000 créditos", "300 créditos bônus", "Suporte VIP 24h", "Destaque ilimitado", "Relatórios avançados"]'::jsonb,
          true,
          true,
          true,
          3,
          now(),
          now()
        ),
        -- Pacote 4: Enterprise
        (
          gen_random_uuid(),
          'Pacote Enterprise - 10000 Créditos',
          'pacote-enterprise-10000',
          'product',
          10000,
          2000,
          599900,
          'Solução completa para grandes redes e franquias.Volume máximo com melhor custo-benefício.',
          null,
          'FALAR COM CONSULTOR',
          '["10000 créditos", "2000 créditos bônus", "Contato direto com consultor", "Solução personalizada", "SLA garantido"]'::jsonb,
          false,
          false,
          true,
          4,
          now(),
          now()
        );

      raise notice '✅ Seed de merchant_credit_products executado com sucesso';

    else
      raise notice 'ℹ️ merchant_credit_products já possui dados - seed ignorado';
    end if;

  else
    raise warning '⚠️ Tabela merchant_credit_products não existe. Execute a migration de criação primeiro.';
  end if;

end
$$;

notify pgrst, 'reload schema';
