-- ============================================================================
-- ORION CERTIFICATION — LEILÕES ENTERPRISE · PARTE 1/3 · BASELINE REPRODUZÍVEL
-- 2026-07-23 · SQL Editor (broifhfqmnzqoongtokm)
-- ----------------------------------------------------------------------------
-- OBJETIVO (Fase 1 do plano): eliminar o DRIFT. Todas as tabelas do núcleo
-- transacional de leilões passam a ter CREATE TABLE IF NOT EXISTS versionado,
-- com o SCHEMA REAL de produção (owner_user_id/current_bid/minimum_increment,
-- não o legado merchant_id/current_price_cents). Um ambiente novo sobe apenas
-- com as migrations — sem depender de auction_module.sql (legado divergente)
-- nem de place_auction_bid.sql (script com DROP TABLE CASCADE destrutivo).
--
-- SEGURO EM PRODUÇÃO: só cria o que falta (IF NOT EXISTS / ADD COLUMN IF NOT
-- EXISTS). Onde a tabela já existe com dados, nada é dropado nem recriado.
-- Nenhum DROP TABLE. Idempotente: reexecutável.
--
-- ROLLBACK: como só adiciona objetos ausentes (nunca remove dados), o rollback
-- seguro é não aplicar em produção já povoada — em produção estas tabelas já
-- existem e os IF NOT EXISTS são no-ops. Para reverter as COLUNAS novas de
-- categoria/imagens num ambiente de teste, ver bloco ROLLBACK ao final.
-- ============================================================================

-- ── 1) auction_categories (NOVA) — categorização oficial dos leilões ────────
CREATE TABLE IF NOT EXISTS public.auction_categories (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug        text NOT NULL UNIQUE,
  name        text NOT NULL,
  icon        text,
  sort_order  integer NOT NULL DEFAULT 100,
  is_active   boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.auction_categories (slug, name, icon, sort_order) VALUES
  ('veiculos',      'Veículos',              'car',        10),
  ('imoveis',       'Imóveis',               'home',       20),
  ('eletronicos',   'Eletrônicos',           'smartphone', 30),
  ('eletrodomesticos','Eletrodomésticos',    'plug',       40),
  ('maquinas',      'Máquinas e Equipamentos','wrench',    50),
  ('agro',          'Agro e Rural',          'wheat',      60),
  ('moveis',        'Móveis e Decoração',    'sofa',       70),
  ('colecionaveis', 'Colecionáveis e Arte',  'palette',    80),
  ('joias',         'Joias e Relógios',      'gem',        90),
  ('outros',        'Outros',                'package',    100)
ON CONFLICT (slug) DO NOTHING;

-- ── 2) auction_listings — garante existência + colunas reais ────────────────
-- Em produção a tabela já existe (criada no dashboard/legado). Aqui apenas
-- asseguramos o baseline reproduzível e as colunas que o código usa.
CREATE TABLE IF NOT EXISTS public.auction_listings (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id      uuid,
  store_id           uuid,
  listing_type       text NOT NULL DEFAULT 'auction',
  title              text NOT NULL,
  description        text,
  product_id         uuid,
  product_image_url  text,
  starting_bid       numeric NOT NULL DEFAULT 0,
  current_bid        numeric NOT NULL DEFAULT 0,
  buy_now_price      numeric,
  reserve_price      numeric,
  minimum_increment  numeric NOT NULL DEFAULT 1,
  status             text NOT NULL DEFAULT 'active',
  starts_at          timestamptz NOT NULL DEFAULT now(),
  ends_at            timestamptz,
  winner_user_id     uuid,
  total_bids         integer NOT NULL DEFAULT 0,
  watchers_count     integer NOT NULL DEFAULT 0,
  views_count        integer NOT NULL DEFAULT 0,
  city               text,
  neighborhood       text,
  fulfillment_type   text DEFAULT 'pickup',
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);

-- Colunas que podem faltar em instâncias antigas (todas idempotentes)
ALTER TABLE public.auction_listings
  ADD COLUMN IF NOT EXISTS owner_user_id      uuid,
  ADD COLUMN IF NOT EXISTS store_id           uuid,
  ADD COLUMN IF NOT EXISTS listing_type       text DEFAULT 'auction',
  ADD COLUMN IF NOT EXISTS product_id         uuid,
  ADD COLUMN IF NOT EXISTS product_image_url  text,
  ADD COLUMN IF NOT EXISTS starting_bid       numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS current_bid        numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS buy_now_price      numeric,
  ADD COLUMN IF NOT EXISTS reserve_price      numeric,
  ADD COLUMN IF NOT EXISTS minimum_increment  numeric DEFAULT 1,
  ADD COLUMN IF NOT EXISTS status             text DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS starts_at          timestamptz DEFAULT now(),
  ADD COLUMN IF NOT EXISTS ends_at            timestamptz,
  ADD COLUMN IF NOT EXISTS winner_user_id     uuid,
  ADD COLUMN IF NOT EXISTS total_bids         integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS watchers_count     integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS views_count        integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS city               text,
  ADD COLUMN IF NOT EXISTS neighborhood       text,
  ADD COLUMN IF NOT EXISTS fulfillment_type   text DEFAULT 'pickup',
  -- NOVOS (enterprise): categoria + soft-delete + rascunho/moderação
  ADD COLUMN IF NOT EXISTS category_id        uuid,
  ADD COLUMN IF NOT EXISTS category_slug      text,
  ADD COLUMN IF NOT EXISTS brand              text,
  ADD COLUMN IF NOT EXISTS model              text,
  ADD COLUMN IF NOT EXISTS item_condition     text,
  ADD COLUMN IF NOT EXISTS video_url          text,
  ADD COLUMN IF NOT EXISTS moderation_status  text DEFAULT 'approved',
  ADD COLUMN IF NOT EXISTS admin_note         text,
  ADD COLUMN IF NOT EXISTS deleted_at         timestamptz,
  ADD COLUMN IF NOT EXISTS created_at         timestamptz DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at         timestamptz DEFAULT now();

-- FK opcional para categoria (não bloqueia se a coluna já tiver lixo)
DO $$ BEGIN
  ALTER TABLE public.auction_listings
    ADD CONSTRAINT auction_listings_category_fk
    FOREIGN KEY (category_id) REFERENCES public.auction_categories(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object OR others THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS idx_auction_listings_owner  ON public.auction_listings(owner_user_id);
CREATE INDEX IF NOT EXISTS idx_auction_listings_store  ON public.auction_listings(store_id);
CREATE INDEX IF NOT EXISTS idx_auction_listings_status ON public.auction_listings(status, ends_at);
CREATE INDEX IF NOT EXISTS idx_auction_listings_type   ON public.auction_listings(listing_type);
CREATE INDEX IF NOT EXISTS idx_auction_listings_cat    ON public.auction_listings(category_slug);
CREATE INDEX IF NOT EXISTS idx_auction_listings_live   ON public.auction_listings(status, ends_at)
  WHERE deleted_at IS NULL;

-- ── 3) auction_bids — baseline com FKs (o script legado criava SEM FK) ──────
CREATE TABLE IF NOT EXISTS public.auction_bids (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id   uuid NOT NULL,
  user_id      uuid NOT NULL,
  amount_cents integer NOT NULL DEFAULT 0,
  is_winning   boolean NOT NULL DEFAULT false,
  is_auto      boolean NOT NULL DEFAULT false,   -- lance gerado por proxy/auto-bid
  is_valid     boolean NOT NULL DEFAULT true,    -- invalidado por fraude/validação
  source       text NOT NULL DEFAULT 'rpc',      -- rpc | proxy | admin
  created_at   timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.auction_bids
  ADD COLUMN IF NOT EXISTS is_auto  boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_valid boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS source   text NOT NULL DEFAULT 'rpc';

-- FK só é adicionada se a coluna referida existir e não houver órfãos.
DO $$ BEGIN
  ALTER TABLE public.auction_bids
    ADD CONSTRAINT auction_bids_listing_fk
    FOREIGN KEY (listing_id) REFERENCES public.auction_listings(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object OR others THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS idx_auction_bids_listing ON public.auction_bids(listing_id);
CREATE INDEX IF NOT EXISTS idx_auction_bids_user    ON public.auction_bids(user_id);
CREATE INDEX IF NOT EXISTS idx_auction_bids_amount  ON public.auction_bids(listing_id, amount_cents DESC);

-- ── 4) auction_proxy_bids (NOVA) — auto-bid / proxy bidding ─────────────────
CREATE TABLE IF NOT EXISTS public.auction_proxy_bids (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id  uuid NOT NULL REFERENCES public.auction_listings(id) ON DELETE CASCADE,
  user_id     uuid NOT NULL,
  max_cents   integer NOT NULL CHECK (max_cents > 0),
  is_active   boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT auction_proxy_uk UNIQUE (listing_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_auction_proxy_active ON public.auction_proxy_bids(listing_id) WHERE is_active;

-- ── 5) auction_watchers — baseline (schema real: auction_listing_id) ────────
CREATE TABLE IF NOT EXISTS public.auction_watchers (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  auction_listing_id uuid NOT NULL,
  user_id            uuid NOT NULL,
  created_at         timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT auction_watchers_uk UNIQUE (auction_listing_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_auction_watchers_user ON public.auction_watchers(user_id);

-- ── 6) auction_events — trilha de auditoria versionada ──────────────────────
-- Em produção a tabela JÁ existe com colunas (auction_listing_id, event_payload).
-- O baseline apenas garante existência (schema real) para ambiente novo.
CREATE TABLE IF NOT EXISTS public.auction_events (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  auction_listing_id uuid,
  event_type         text NOT NULL,
  event_payload      jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at         timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_auction_events_listing ON public.auction_events(auction_listing_id, created_at DESC);

-- Helper de auditoria: fonte ÚNICA de escrita em auction_events (isola o schema
-- real; o ator vai dentro do payload). Todas as RPCs de leilão logam por aqui.
CREATE OR REPLACE FUNCTION public.auction_log(p_listing_id uuid, p_event text, p_actor text, p_detail jsonb DEFAULT '{}'::jsonb)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  INSERT INTO public.auction_events (auction_listing_id, event_type, event_payload)
  VALUES (p_listing_id, p_event, coalesce(p_detail,'{}'::jsonb) || jsonb_build_object('actor', p_actor));
$$;
REVOKE ALL ON FUNCTION public.auction_log(uuid, text, text, jsonb) FROM public, anon, authenticated;

-- ── 7) auction_images (NOVA) — galeria oficial (fotos/vídeos) ───────────────
CREATE TABLE IF NOT EXISTS public.auction_images (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id  uuid NOT NULL REFERENCES public.auction_listings(id) ON DELETE CASCADE,
  url         text NOT NULL,
  kind        text NOT NULL DEFAULT 'image',    -- image | video
  sort_order  integer NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_auction_images_listing ON public.auction_images(listing_id, sort_order);

-- ── 8) auction_bid_rate (NOVA) — rate limit anti-bot por usuário×leilão ─────
CREATE TABLE IF NOT EXISTS public.auction_bid_rate (
  listing_id   uuid NOT NULL,
  user_id      uuid NOT NULL,
  window_start timestamptz NOT NULL DEFAULT now(),
  hits         integer NOT NULL DEFAULT 0,
  PRIMARY KEY (listing_id, user_id)
);

-- ── 9) Trigger updated_at compartilhado ─────────────────────────────────────
CREATE OR REPLACE FUNCTION public.tg_auction_touch_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at := now(); RETURN NEW; END $$;

DO $$ BEGIN
  CREATE TRIGGER trg_auction_listings_touch BEFORE UPDATE ON public.auction_listings
    FOR EACH ROW EXECUTE FUNCTION public.tg_auction_touch_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── 10) RLS baseline (segurança endurecida na Parte 2) ──────────────────────
ALTER TABLE public.auction_categories  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.auction_listings    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.auction_bids        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.auction_proxy_bids  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.auction_watchers    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.auction_events      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.auction_images      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.auction_bid_rate    ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS auction_categories_read ON public.auction_categories;
CREATE POLICY auction_categories_read ON public.auction_categories FOR SELECT USING (true);

-- ── 11) VERIFICAÇÃO ─────────────────────────────────────────────────────────
SELECT
  (SELECT count(*) FROM information_schema.tables WHERE table_schema='public'
     AND table_name IN ('auction_categories','auction_listings','auction_bids',
       'auction_proxy_bids','auction_watchers','auction_events','auction_images','auction_bid_rate')) AS tabelas_baseline,
  (SELECT count(*) FROM public.auction_categories) AS categorias_seed;

-- ============================================================================
-- ROLLBACK (somente ambiente de teste — NUNCA em produção com dados):
--   DROP TABLE IF EXISTS public.auction_images, public.auction_proxy_bids,
--     public.auction_bid_rate CASCADE;
--   ALTER TABLE public.auction_listings
--     DROP COLUMN IF EXISTS category_id, DROP COLUMN IF EXISTS category_slug,
--     DROP COLUMN IF EXISTS brand, DROP COLUMN IF EXISTS model,
--     DROP COLUMN IF EXISTS item_condition, DROP COLUMN IF EXISTS video_url,
--     DROP COLUMN IF EXISTS moderation_status, DROP COLUMN IF EXISTS admin_note,
--     DROP COLUMN IF EXISTS deleted_at;
--   DROP TABLE IF EXISTS public.auction_categories CASCADE;
-- ============================================================================
