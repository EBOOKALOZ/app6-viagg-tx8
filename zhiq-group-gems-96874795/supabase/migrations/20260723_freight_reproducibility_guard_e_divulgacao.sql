-- ============================================================================
-- FRETES V2 - GUARD DE REPRODUTIBILIDADE + DIVULGACAO OFICIAL  ::  2026-07-23
-- ----------------------------------------------------------------------------
-- CERTIFICACAO ORION - correcao de reprodutibilidade (auditoria 2026-07-23).
--
-- Contexto: a auditoria encontrou 3 tabelas usadas por migrations e pelo front
-- que NAO possuiam CREATE TABLE versionado (existiam so em producao):
--     public.pay_financial_accounts   (nucleo do motor financeiro pay_*)
--     public.promotion_packages       (pacotes de divulgacao)
--     public.promotion_purchases      (compras de divulgacao)
--
-- >>> RESOLVIDO na Certificacao Enterprise (2026-07-23): essas tabelas agora
-- >>> SAO criadas por migrations versionadas, posicionadas antes dos seus
-- >>> consumidores:
--     20260514_pay_phase1_00_financial_core_base.sql  (pay_financial_accounts +
--                                    pay_ledger_entries + pay_idempotency_registry + enums)
--     20260703_049b_promotion_core_base.sql           (promotion_packages + promotion_purchases)
--
-- Esta migration mantem o GUARD como CHECAGEM DEFENSIVA (boa pratica enterprise):
--   1) VALIDA que as tabelas-nucleo existem e ABORTA com mensagem diagnostica
--      caso alguma falte (ex.: migration de base pulada). Com as bases acima
--      versionadas, um banco novo passa aqui normalmente.
--   2) So depois do guard, aplica os complementos SEGUROS e idempotentes de
--      fretes (colunas is_promoted, seed dos pacotes de divulgacao).
--
-- Idempotente. Aplicar via SQL Editor. Depende de: 20260722_freight_quotes.sql
-- (base V2) + 20260622_freight_listings_base.sql.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1) GUARD: as tabelas-nucleo precisam existir (falha explicita e diagnostica)
-- ----------------------------------------------------------------------------
DO $$
DECLARE
  v_missing text[] := ARRAY[]::text[];
  v_needed  text[] := ARRAY['pay_financial_accounts','promotion_packages','promotion_purchases','freight_listings','freight_commission_settings'];
  v_t text;
BEGIN
  FOREACH v_t IN ARRAY v_needed LOOP
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = v_t
    ) THEN
      v_missing := array_append(v_missing, v_t);
    END IF;
  END LOOP;

  IF array_length(v_missing, 1) IS NOT NULL THEN
    RAISE EXCEPTION
      'REPRODUTIBILIDADE P0: tabela(s) ausente(s): %. Aplique primeiro a(s) migration(s)/dump que as criam. pay_financial_accounts = motor pay_* (serie 20260514_pay_phase1_*). promotion_packages/promotion_purchases = infra de divulgacao. freight_* = 20260722_freight_quotes.sql / 20260622_freight_listings_base.sql.',
      array_to_string(v_missing, ', ');
  END IF;
END $$;

-- ----------------------------------------------------------------------------
-- 2) DIVULGACAO: colunas de destaque em anuncios, rotas e frota
--    (Rota Premium / Veiculo Premium / Empresa Premium)
-- ----------------------------------------------------------------------------
ALTER TABLE public.freight_listings
  ADD COLUMN IF NOT EXISTS is_promoted boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS promoted_until timestamptz;
ALTER TABLE public.freight_routes
  ADD COLUMN IF NOT EXISTS is_promoted boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS promoted_until timestamptz;
ALTER TABLE public.freight_fleet_vehicles
  ADD COLUMN IF NOT EXISTS is_promoted boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS promoted_until timestamptz;

-- Recria a view publica para expor as novas colunas (views SELECT * congelam
-- as colunas na criacao; sem isso is_promoted nao chega ao front).
CREATE OR REPLACE VIEW public.public_freight_listings AS
SELECT * FROM public.freight_listings
WHERE visibility_status = 'published'
  AND moderation_status IN ('approved', 'approved_clean', 'approved_masked', 'manual_approved');
GRANT SELECT ON public.public_freight_listings TO anon, authenticated;

-- ----------------------------------------------------------------------------
-- 3) PACOTES DE DIVULGACAO DE FRETES (Bronze/Prata/Ouro/Diamante) em BANCO
--    (criar/alterar pacotes futuramente NAO exige codigo)
-- ----------------------------------------------------------------------------
INSERT INTO public.promotion_packages
  (name, slug, description, color, color_secondary, icon, daily_boosts, price_monthly, period_options, benefits, is_active, is_popular, sort_order, profile_type)
SELECT * FROM (VALUES
  ('Bronze Fretes','fretes-bronze','Comece a divulgar seus fretes e rotas','#CD7F32','#B87333','🥉',5, 14.90::numeric, ARRAY[7,15,30],
    ARRAY['5 divulgações por dia','Destaque na categoria Fretes','Distribuição ao longo do dia'], true, false, 1, 'fretes'),
  ('Prata Fretes','fretes-prata','Mais alcance para sua transportadora','#9E9E9E','#757575','🥈',10, 29.90::numeric, ARRAY[7,15,30],
    ARRAY['10 divulgações por dia','Prioridade nas pesquisas','Destaque regional (cidade/estado)','Relatório de desempenho'], true, true, 2, 'fretes'),
  ('Ouro Fretes','fretes-ouro','Máxima exposição para fretes e rotas','#FFD700','#FFA500','🥇',30, 59.90::numeric, ARRAY[7,15,30],
    ARRAY['30 divulgações por dia','Selo Premium na vitrine','Rotas patrocinadas aparecem primeiro','Posição privilegiada na busca'], true, false, 3, 'fretes'),
  ('Diamante Fretes','fretes-diamante','Empresa Premium - o topo da plataforma','#B9F2FF','#7DE3F4','💎',60, 99.90::numeric, ARRAY[7,15,30],
    ARRAY['60 divulgações por dia','Empresa Premium (selo + banner)','Veículos Premium em destaque','Prioridade máxima em buscas e rotas','Maior alcance em todas as regiões'], true, false, 4, 'fretes')
) v(name, slug, description, color, color_secondary, icon, daily_boosts, price_monthly, period_options, benefits, is_active, is_popular, sort_order, profile_type)
WHERE NOT EXISTS (SELECT 1 FROM public.promotion_packages WHERE profile_type = 'fretes');

-- ----------------------------------------------------------------------------
-- VERIFICACAO (esperado: tabelas_ok=true, colunas_ok=3, pacotes_fretes=4)
-- ----------------------------------------------------------------------------
SELECT
  true AS tabelas_ok,  -- se chegou aqui, o guard passou
  (SELECT count(*)::int FROM information_schema.columns
    WHERE table_schema='public' AND column_name='is_promoted'
      AND table_name IN ('freight_listings','freight_routes','freight_fleet_vehicles')) AS colunas_is_promoted,
  (SELECT count(*)::int FROM public.promotion_packages WHERE profile_type='fretes') AS pacotes_fretes;
