-- ============================================================================
-- PROMOTION CORE - BASE DE DIVULGACAO (promotion_packages + promotion_purchases)
-- ----------------------------------------------------------------------------
-- CERTIFICACAO ORION ENTERPRISE - versionamento de infra compartilhada.
--
-- CONTEXTO: a auditoria encontrou que promotion_packages e promotion_purchases
-- NUNCA tiveram CREATE versionado - existiam so em producao. Sao consumidas por
-- 20260703_050_advertiser_daily_usage.sql (JOIN/SELECT), pelas edge functions
-- promotion-checkout / promotion-payment-webhook e pelos seeds de pacotes
-- (leiloes/viagens/fretes). Num banco novo, o primeiro consumidor quebra com
-- "relation does not exist".
--
-- Posicionada "_049b" para rodar ANTES de "_050_advertiser_daily_usage"
-- (ordem lexicografica no prefixo 20260703). Em bancos ja implantados, tudo e
-- IF NOT EXISTS: NO-OP seguro.
--
-- >>> RESSALVA DE FIDELIDADE (best-effort) <<<
-- Estas 2 tabelas NAO estao no types.ts gerado. O schema foi reconstruido dos
-- INSERTs (seeds de pacotes) e das edge functions (checkout/webhook). Nomes de
-- coluna CONFIRMADOS; tipos/defaults/NOT NULL INFERIDOS. Reconferir contra:
--     pg_dump --schema-only -t 'public.promotion_packages' -t 'public.promotion_purchases'
-- Divergencias nao afetam producao (IF NOT EXISTS pula); afetam so banco novo.
--
-- ROLLBACK (banco novo):
--   DROP TABLE IF EXISTS public.promotion_purchases CASCADE;
--   DROP TABLE IF EXISTS public.promotion_packages CASCADE;
--
-- Idempotente. Requer pgcrypto.
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ----------------------------------------------------------------------------
-- 1) promotion_packages (planos de divulgacao Bronze/Prata/Ouro/Diamante)
--    Colunas confirmadas pelos INSERTs em:
--      20260717_auction_owner_and_promo_packages.sql (leiloes)
--      20260723_travel_promocao_divulgacao_oficial.sql (viagens)
--      20260723_freight_reproducibility_guard_e_divulgacao.sql (fretes)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.promotion_packages (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name             text NOT NULL,
  slug             text NOT NULL,
  description      text,
  color            text,
  color_secondary  text,
  icon             text,
  daily_boosts     integer,
  price_monthly    numeric NOT NULL DEFAULT 0,
  period_options   integer[] NOT NULL DEFAULT ARRAY[30],
  benefits         text[]  NOT NULL DEFAULT ARRAY[]::text[],
  is_active        boolean NOT NULL DEFAULT true,
  is_popular       boolean NOT NULL DEFAULT false,
  sort_order       integer NOT NULL DEFAULT 0,
  profile_type     text    NOT NULL DEFAULT 'general',
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT promotion_packages_slug_uk UNIQUE (slug)
);
CREATE INDEX IF NOT EXISTS idx_promo_packages_profile
  ON public.promotion_packages (profile_type, is_active, sort_order);

-- Leitura publica dos pacotes ativos (vitrine de planos no painel do anunciante).
ALTER TABLE public.promotion_packages ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS promotion_packages_public_read ON public.promotion_packages;
CREATE POLICY promotion_packages_public_read
  ON public.promotion_packages FOR SELECT TO anon, authenticated
  USING (is_active = true);

-- ----------------------------------------------------------------------------
-- 2) promotion_purchases (compras de divulgacao via Mercado Pago)
--    Colunas confirmadas por:
--      supabase/functions/promotion-checkout/index.ts (INSERT)
--      supabase/functions/promotion-payment-webhook/index.ts (UPDATE)
--      20260703_050_advertiser_daily_usage.sql (filtros)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.promotion_purchases (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  advertiser_user_id  uuid NOT NULL,
  listing_module      text,
  package_id          uuid REFERENCES public.promotion_packages(id),
  package_name        text,
  period_days         integer,
  amount_brl          numeric NOT NULL DEFAULT 0,
  status              text NOT NULL DEFAULT 'pending'
                        CHECK (status IN ('pending','paid','approved','cancelled','expired','refunded')),
  mp_preference_id    text,
  mp_payment_id       text,
  starts_at           timestamptz,
  expires_at          timestamptz,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);
-- Indice ja versionado em outro arquivo (idx_pp_advertiser_status_expires) -
-- reafirmado aqui com IF NOT EXISTS para o caso de banco novo executar este 1o.
CREATE INDEX IF NOT EXISTS idx_pp_advertiser_status_expires
  ON public.promotion_purchases (advertiser_user_id, status, expires_at);

-- O anunciante le as proprias compras; o webhook (service_role) escreve.
ALTER TABLE public.promotion_purchases ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS promotion_purchases_self_read ON public.promotion_purchases;
CREATE POLICY promotion_purchases_self_read
  ON public.promotion_purchases FOR SELECT TO authenticated
  USING (advertiser_user_id = auth.uid());

-- ----------------------------------------------------------------------------
-- VERIFICACAO (esperado: tabelas=2, policies=2)
-- ----------------------------------------------------------------------------
SELECT
  (SELECT count(*)::int FROM information_schema.tables WHERE table_schema='public'
     AND table_name IN ('promotion_packages','promotion_purchases')) AS tabelas,
  (SELECT count(*)::int FROM pg_policies
     WHERE tablename IN ('promotion_packages','promotion_purchases')
       AND policyname IN ('promotion_packages_public_read','promotion_purchases_self_read')) AS policies;
