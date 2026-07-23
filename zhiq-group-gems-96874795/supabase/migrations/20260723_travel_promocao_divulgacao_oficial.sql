-- ============================================================
-- VIAGENS — PROMOÇÃO PAGA OFICIAL (Mercado Pago) · 2026-07-23
-- Espelho da seção 9 de 20260722_freight_monetizacao_oficial.sql.
-- ------------------------------------------------------------
-- CRÍTICO da auditoria: o webhook promotion-payment-webhook fazia
-- UPDATE travel_listings SET is_promoted = true — mas a coluna
-- NÃO EXISTIA em travel_listings (só is_featured/featured_until).
-- Resultado: cliente pagava a promoção no Mercado Pago e o update
-- falhava — receita de promoção de viagens quebrada de ponta a
-- ponta. Esta migration:
--  1) Cria is_promoted/promoted_until (mesmo padrão de fretes).
--  2) Recria a view public_travel_listings expondo as colunas
--     novas + entry_price/subcategoria (a view congelou as
--     colunas na criação em 20260624).
--  3) Semeia os pacotes de divulgação de VIAGENS em banco
--     (promotion_packages, profile_type='viagens') — criar/alterar
--     pacotes futuramente NÃO exige alteração de código.
--
-- A expiração é aplicada na leitura (is_promoted AND
-- promoted_until > now()), como em fretes — sem cron.
-- Idempotente. Aplicar via SQL Editor (broifhfqmnzqoongtokm).
-- ============================================================

-- ── 1. Colunas de destaque pago ──────────────────────────────
ALTER TABLE public.travel_listings
  ADD COLUMN IF NOT EXISTS is_promoted boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS promoted_until timestamptz;

CREATE INDEX IF NOT EXISTS idx_travel_listings_promoted
  ON public.travel_listings (is_promoted, promoted_until)
  WHERE is_promoted;

-- ── 2. View pública atualizada (colunas novas ao final) ──────
CREATE OR REPLACE VIEW public.public_travel_listings AS
SELECT
  t.id,
  t.title,
  t.slug,
  t.category,
  t.trip_type,
  t.destination,
  t.country,
  t.city,
  t.state,
  t.neighborhood,
  t.departure_date,
  t.return_date,
  t.duration_days,
  t.price_per_person,
  t.total_price,
  t.available_spots,
  t.is_featured,
  t.published_at,
  t.entry_price,
  t.subcategoria,
  t.is_promoted,
  t.promoted_until,
  t.created_at
FROM public.travel_listings t
WHERE t.visibility_status = 'published';

GRANT SELECT ON public.public_travel_listings TO anon, authenticated;

-- ── 3. Pacotes de divulgação de VIAGENS (em banco) ───────────
INSERT INTO public.promotion_packages
  (name, slug, description, color, color_secondary, icon, daily_boosts, price_monthly, period_options, benefits, is_active, is_popular, sort_order, profile_type)
SELECT * FROM (VALUES
  ('Bronze Viagens','viagens-bronze','Comece a divulgar seus pacotes e passeios','#CD7F32','#B87333','🥉',5, 14.90::numeric, ARRAY[7,15,30],
    ARRAY['5 divulgações por dia','Destaque na categoria Viagens & Turismo','Distribuição ao longo do dia'], true, false, 1, 'viagens'),
  ('Prata Viagens','viagens-prata','Mais alcance para sua agência','#9E9E9E','#757575','🥈',10, 29.90::numeric, ARRAY[7,15,30],
    ARRAY['10 divulgações por dia','Prioridade nas pesquisas','Destaque regional (cidade/estado)','Relatório de desempenho'], true, true, 2, 'viagens'),
  ('Ouro Viagens','viagens-ouro','Máxima exposição para pacotes e excursões','#FFD700','#FFA500','🥇',30, 59.90::numeric, ARRAY[7,15,30],
    ARRAY['30 divulgações por dia','Selo Premium na vitrine','Pacotes patrocinados aparecem primeiro','Posição privilegiada na busca'], true, false, 3, 'viagens'),
  ('Diamante Viagens','viagens-diamante','Agência Premium — o topo da plataforma','#B9F2FF','#7DE3F4','💎',60, 99.90::numeric, ARRAY[7,15,30],
    ARRAY['60 divulgações por dia','Agência Premium (selo + banner)','Pacotes Premium em destaque','Prioridade máxima em buscas','Maior alcance em todas as regiões'], true, false, 4, 'viagens')
) v(name, slug, description, color, color_secondary, icon, daily_boosts, price_monthly, period_options, benefits, is_active, is_popular, sort_order, profile_type)
WHERE NOT EXISTS (SELECT 1 FROM public.promotion_packages WHERE profile_type = 'viagens');

SELECT pg_notify('pgrst', 'reload schema');

-- ── VERIFICAÇÃO ──────────────────────────────────────────────
-- Esperado: colunas_promo=2 · pacotes_viagens>=4 · view_ok=1
SELECT
  (SELECT count(*)::int FROM information_schema.columns
    WHERE table_schema='public' AND table_name='travel_listings'
      AND column_name IN ('is_promoted','promoted_until')) AS colunas_promo,
  (SELECT count(*)::int FROM public.promotion_packages WHERE profile_type='viagens') AS pacotes_viagens,
  (SELECT count(*)::int FROM information_schema.views
    WHERE table_schema='public' AND table_name='public_travel_listings') AS view_ok;
