-- ORION-480 — Backfill de schema órfão para viabilizar staging isolado.
--
-- Contexto: uma varredura estática do histórico de migrations encontrou
-- objetos (tabelas, tipos ENUM) que são referenciados por ALTER/UPDATE/RLS
-- em migrations existentes mas nunca criados por nenhum CREATE TABLE/TYPE
-- versionado — foram criados manualmente em produção (SQL Editor) ao longo
-- do tempo. Esta migration reconstrói esses objetos via introspecção do
-- catálogo de produção (pg_catalog/information_schema, sem acesso a dados),
-- na posição cronológica mais antiga necessária (antes de 20260113, que é
-- a primeira migration subsequente a referenciar algum desses objetos),
-- para que o histórico completo possa ser reaplicado do zero em um banco
-- novo (staging).
--
-- Todos os CREATE são IF NOT EXISTS: em produção (onde os objetos já
-- existem) esta migration é um no-op.

-- === Tipos ENUM ===

DO $$ BEGIN
  CREATE TYPE public.financial_account_type AS ENUM ('platform_master', 'user_wallet', 'escrow_pool', 'reserve_account');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.financial_status AS ENUM ('active', 'inactive', 'blocked');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.pay_owner_type AS ENUM ('platform', 'merchant_store', 'motoboy_profile', 'customer', 'mototaxi_profile', 'driver_profile');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.pay_payment_order_status AS ENUM ('pending', 'waiting_payment', 'paid', 'failed', 'cancelled', 'refunded');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.pay_payout_request_status AS ENUM ('pending', 'approved', 'processing', 'paid', 'failed', 'cancelled');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.service_order_status AS ENUM ('awaiting_professional', 'accepted', 'in_progress', 'delivered', 'canceled', 'calculating', 'searching', 'assigned', 'waiting_acceptance');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- === Tabelas sem dependências externas pendentes ===

CREATE TABLE IF NOT EXISTS public.product_categories (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL,
  slug text UNIQUE,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.sc_cities_control (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  city_name text NOT NULL,
  state text DEFAULT 'SC'::text,
  downloads integer DEFAULT 0,
  waiting_users integer DEFAULT 0,
  city_status text DEFAULT 'em_espera'::text,
  motoboys_registered integer DEFAULT 0,
  merchants_registered integer DEFAULT 0,
  activated_at timestamp without time zone,
  created_at timestamp without time zone DEFAULT now(),
  min_motoboys_to_activate integer DEFAULT 10,
  min_merchants_to_activate integer DEFAULT 5,
  auto_activation_enabled boolean DEFAULT true,
  last_evaluated_at timestamp without time zone
);

CREATE TABLE IF NOT EXISTS public.merchant_credit_products (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  product_type text NOT NULL,
  name text NOT NULL,
  description text,
  billing_cycle text,
  credits_amount integer NOT NULL,
  bonus_credits integer NOT NULL DEFAULT 0,
  price_brl numeric NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  rollover_enabled boolean NOT NULL DEFAULT false,
  rollover_limit integer,
  display_order integer NOT NULL DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  slug text,
  credits_base integer DEFAULT 0,
  credits_bonus integer DEFAULT 0,
  price_cents integer DEFAULT 0,
  rollover_percent integer DEFAULT 0,
  is_recommended boolean DEFAULT false,
  sort_order integer DEFAULT 0,
  badge_text text,
  action_label text DEFAULT 'Comprar Créditos'::text,
  action_enabled boolean DEFAULT true,
  version integer DEFAULT 1,
  features_json jsonb DEFAULT '[]'::jsonb,
  is_featured boolean NOT NULL DEFAULT false
);

CREATE TABLE IF NOT EXISTS public.merchant_credit_usage_rules (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  feature_code text NOT NULL UNIQUE,
  feature_name text NOT NULL,
  credits_cost numeric NOT NULL,
  pricing_mode text NOT NULL DEFAULT 'fixed'::text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  module_name text,
  event_type text,
  description text
);

-- === Tabelas com FK para auth.users (sempre presente) ou entre si ===

CREATE TABLE IF NOT EXISTS public.advertiser_accounts (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name text,
  email text,
  whatsapp text,
  account_status text NOT NULL DEFAULT 'active'::text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  status text NOT NULL DEFAULT 'active'::text,
  onboarding_completed boolean NOT NULL DEFAULT false,
  package_id uuid,
  settings_json jsonb DEFAULT '{"receive_listing_alerts": true, "receive_credit_warnings": true, "receive_commercial_messages": false, "receive_email_notifications": true}'::jsonb
);
-- Nota: package_id referencia real_estate_credit_packages(id) em produção,
-- tabela criada por uma migration posterior neste histórico. FK omitida
-- aqui de propósito; será adicionada quando essa tabela existir, ou pode
-- ficar sem FK formal em staging sem impacto para o teste de carga.

CREATE TABLE IF NOT EXISTS public.advertiser_listings (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  advertiser_account_id uuid NOT NULL REFERENCES public.advertiser_accounts(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text,
  category text,
  listing_status text NOT NULL DEFAULT 'draft'::text,
  cover_image_url text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  price numeric DEFAULT 0,
  condition text DEFAULT 'new'::text,
  city text,
  has_invoice boolean DEFAULT false,
  warranty text,
  is_digital boolean NOT NULL DEFAULT false,
  download_url text,
  is_promoted boolean NOT NULL DEFAULT false,
  moderation_status text NOT NULL DEFAULT 'pending_ai_analysis'::text,
  ai_status text DEFAULT 'queued'::text,
  ai_verdict text,
  ai_confidence numeric,
  moderation_reason text,
  reviewed_at timestamp with time zone,
  reviewed_by uuid REFERENCES auth.users(id),
  ai_provider text DEFAULT 'anthropic/claude-haiku'::text
);

CREATE TABLE IF NOT EXISTS public.advertiser_contact_intentions (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  listing_module text NOT NULL,
  listing_id uuid NOT NULL,
  advertiser_user_id uuid NOT NULL REFERENCES auth.users(id),
  interest_type text NOT NULL,
  visitor_name text,
  visitor_phone text,
  visitor_message text,
  masked_preview text,
  city text,
  region text,
  status text NOT NULL DEFAULT 'pending_unlock'::text,
  credits_cost integer NOT NULL DEFAULT 3,
  unlock_paid_at timestamp with time zone,
  notified_at timestamp with time zone,
  opened_at timestamp with time zone,
  visitor_ip text,
  contact_user_id uuid
);

CREATE TABLE IF NOT EXISTS public.merchant_marketing_products (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  merchant_store_id uuid NOT NULL,
  created_by_user_id uuid NOT NULL,
  title text NOT NULL,
  short_description text,
  marketing_text text,
  image_url text,
  external_link text,
  price_label text,
  cta_label text DEFAULT 'Ver oferta'::text,
  campaign_type text NOT NULL DEFAULT 'product'::text,
  target_city text,
  target_region text,
  is_active boolean NOT NULL DEFAULT true,
  display_order integer NOT NULL DEFAULT 0,
  starts_at timestamp with time zone,
  ends_at timestamp with time zone,
  clicks_count integer NOT NULL DEFAULT 0,
  conversions_count integer NOT NULL DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  ad_type text,
  cta_text text,
  video_url text,
  category text,
  condition text DEFAULT 'novo'::text,
  tracking_slug text UNIQUE
);

CREATE TABLE IF NOT EXISTS public.campaign_queue (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  created_by_user_id uuid,
  operator_user_id uuid,
  whatsapp_group_id uuid REFERENCES public.whatsapp_groups(id) ON DELETE SET NULL,
  merchant_store_id uuid REFERENCES public.merchant_stores(id) ON DELETE SET NULL,
  product_id uuid,
  campaign_type text NOT NULL DEFAULT 'store_product'::text,
  title text NOT NULL,
  message_text text,
  media_url text,
  target_city text,
  target_region text,
  scheduled_for timestamp with time zone,
  available_from timestamp with time zone,
  available_until timestamp with time zone,
  status text NOT NULL DEFAULT 'pending'::text,
  priority integer NOT NULL DEFAULT 0,
  execution_notes text,
  reviewed_by_user_id uuid,
  reviewed_at timestamp with time zone,
  posted_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  source_type text NOT NULL,
  source_id uuid NOT NULL,
  target_bairro text,
  theme_color text DEFAULT 'green'::text,
  target_profile text NOT NULL DEFAULT 'motoboy'::text,
  origem text NOT NULL DEFAULT 'organica'::text
);
-- Nota: product_id referencia products(id) em produção, tabela criada por
-- migration posterior. FK omitida de propósito pelo mesmo motivo acima.

CREATE TABLE IF NOT EXISTS public.campaign_dispatches (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  campaign_queue_id uuid NOT NULL REFERENCES public.campaign_queue(id) ON DELETE CASCADE,
  source_type text,
  source_id uuid,
  assigned_to_user_id uuid NOT NULL,
  assigned_profile_type text NOT NULL,
  city text,
  region text,
  dispatch_status text NOT NULL DEFAULT 'queued'::text,
  notes text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  assigned_at timestamp with time zone,
  processed_at timestamp with time zone,
  completed_at timestamp with time zone,
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  bairro text,
  priority integer DEFAULT 2
);

-- === service_orders e dependentes (núcleo de logística/entregas) ===

CREATE TABLE IF NOT EXISTS public.service_orders (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  service_type text NOT NULL,
  status public.service_order_status NOT NULL DEFAULT 'awaiting_professional'::public.service_order_status,
  region_id text,
  city_id text,
  customer_uid uuid,
  professional_uid uuid,
  merchant_id uuid,
  pickup_lat double precision,
  pickup_lng double precision,
  destination_lat double precision,
  destination_lng double precision,
  distance_km numeric,
  estimated_duration_sec integer,
  route_polyline text,
  price_total_cents integer,
  currency text NOT NULL DEFAULT 'BRL'::text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  payer_uid uuid,
  wallet_hold_key text,
  wallet_hold_tx_id uuid,
  sandbox boolean DEFAULT true,
  customer_id text,
  customer_phone text,
  notes text,
  product_id uuid,
  estimated_value numeric,
  pickup_location text,
  destination text,
  total_price numeric,
  customer_name text,
  store_name text,
  store_address text,
  store_manager text,
  store_logo_url text,
  motoboy_id uuid REFERENCES auth.users(id),
  accepted_at timestamp with time zone,
  courier_id uuid REFERENCES auth.users(id),
  pickup_code text,
  completed_at timestamp with time zone,
  pickup_distance_km numeric,
  pickup_estimated_minutes integer,
  pickup_route_polyline jsonb,
  pickup_calculated_at timestamp with time zone,
  dispatch_round integer DEFAULT 0,
  dispatch_radius_km numeric DEFAULT 3,
  product_image_url text,
  order_description text,
  driver_status text,
  payment_status text,
  payment_deadline timestamp with time zone,
  payment_confirmed_at timestamp with time zone
);

CREATE TABLE IF NOT EXISTS public.delivery_offers (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  service_order_id uuid NOT NULL REFERENCES public.service_orders(id) ON DELETE CASCADE,
  region_id text,
  city_id text,
  professional_uid uuid,
  offer_status text NOT NULL DEFAULT 'open'::text,
  expires_at timestamp with time zone,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  order_id uuid REFERENCES public.delivery_orders(id),
  status text DEFAULT 'pending'::text,
  round_no integer DEFAULT 1,
  radius_km numeric,
  responded_at timestamp with time zone,
  delivery_order_id uuid,
  motoboy_id uuid,
  store_id uuid,
  sent_at timestamp with time zone DEFAULT now(),
  viewed_at timestamp with time zone,
  accepted_at timestamp with time zone,
  rejected_at timestamp with time zone,
  distance_km_snapshot numeric,
  estimated_price_snapshot numeric,
  pickup_address_snapshot text,
  dropoff_address_snapshot text,
  store_name_snapshot text,
  customer_name_snapshot text,
  notes_snapshot text,
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  commission_percent numeric,
  gross_value numeric,
  net_value numeric,
  pickup_distance_km numeric,
  pickup_duration_min integer,
  pickup_lat_snapshot double precision,
  pickup_lng_snapshot double precision,
  dropoff_lat_snapshot double precision,
  dropoff_lng_snapshot double precision,
  total_price numeric,
  requester_avatar_snapshot text
);

-- === Módulo financeiro (financial_accounts / ledger / splits / payouts) ===

CREATE TABLE IF NOT EXISTS public.financial_accounts (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  owner_user_id uuid UNIQUE,
  currency text DEFAULT 'BRL'::text,
  created_at timestamp with time zone DEFAULT now(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  account_type public.financial_account_type NOT NULL,
  status public.financial_status NOT NULL DEFAULT 'active'::public.financial_status,
  available_balance numeric NOT NULL DEFAULT 0,
  pending_balance numeric NOT NULL DEFAULT 0,
  reserved_balance numeric NOT NULL DEFAULT 0,
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  current_balance numeric,
  balance_cents bigint,
  profile_type text,
  region_id uuid
);

CREATE TABLE IF NOT EXISTS public.external_bank_accounts (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  financial_account_id uuid NOT NULL REFERENCES public.financial_accounts(id) ON DELETE CASCADE,
  provider_name text NOT NULL,
  provider_account_id text,
  provider_wallet_id text,
  provider_customer_id text,
  status text NOT NULL DEFAULT 'linked'::text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.ledger_entries (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  account_kind text,
  account_id uuid,
  direction text,
  amount_cents bigint,
  currency text DEFAULT 'BRL'::text,
  source_type text,
  source_id uuid,
  idempotency_key text UNIQUE,
  created_at timestamp with time zone DEFAULT now(),
  profile_type text
);

CREATE TABLE IF NOT EXISTS public.payment_splits (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  payment_intent_id uuid,
  recipient_account_id uuid,
  recipient_kind text,
  role text,
  amount_cents bigint,
  status text DEFAULT 'pending'::text,
  idempotency_key text UNIQUE,
  created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.profile_wallets (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  account_id uuid NOT NULL,
  profile_type text NOT NULL,
  balance numeric DEFAULT 0,
  created_at timestamp with time zone DEFAULT now(),
  UNIQUE (account_id, profile_type)
);

-- pay_payment_orders / pay_payout_requests referenciam pay_financial_accounts,
-- tabela criada por migration posterior neste histórico (módulo "pay_*").
-- FK omitida de propósito pelo mesmo motivo dos outros casos acima.

CREATE TABLE IF NOT EXISTS public.pay_payment_orders (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  payer_owner_type public.pay_owner_type NOT NULL,
  payer_owner_id uuid,
  target_account_id uuid NOT NULL,
  status public.pay_payment_order_status NOT NULL DEFAULT 'pending'::public.pay_payment_order_status,
  amount numeric NOT NULL,
  currency_code text NOT NULL DEFAULT 'BRL'::text,
  provider_name text,
  provider_payment_id text,
  provider_checkout_url text,
  product_type text,
  product_id uuid,
  product_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  idempotency_key text,
  paid_at timestamp with time zone,
  expires_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  created_by uuid
);

CREATE TABLE IF NOT EXISTS public.pay_payout_requests (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  source_account_id uuid NOT NULL,
  requester_owner_type public.pay_owner_type NOT NULL,
  requester_owner_id uuid,
  status public.pay_payout_request_status NOT NULL DEFAULT 'pending'::public.pay_payout_request_status,
  requested_amount numeric NOT NULL,
  fee_amount numeric NOT NULL DEFAULT 0,
  net_amount numeric,
  destination_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  provider_name text,
  provider_payout_id text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  failure_reason text,
  requested_at timestamp with time zone NOT NULL DEFAULT now(),
  approved_at timestamp with time zone,
  processed_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  created_by uuid
);

-- === ORION-480 Fase 100K: segundo lote de objetos órfãos (varredura ampliada 2026-08-11) ===
-- Padrões adicionais cobertos: ENABLE RLS, CREATE POLICY/TRIGGER/INDEX ON, INSERT/UPDATE/DELETE.
-- DDL extraído por introspecção read-only do catálogo de produção. IF NOT EXISTS: no-op em produção.

DO $$ BEGIN
  CREATE TYPE public.pay_payment_event_status AS ENUM ('received', 'processed', 'ignored', 'failed');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.real_estate_listing_status AS ENUM ('draft', 'pending_review', 'published', 'paused', 'rejected', 'archived', 'awaiting_payment', 'payment_confirmed', 'payment_failed', 'cancelled', 'plan_selected', 'payment_expired');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.transaction_status_pay AS ENUM ('initiated', 'awaiting_payment', 'authorized', 'captured', 'in_escrow', 'confirmed', 'released', 'failed', 'cancelled', 'refunded');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.wallet_tx_status AS ENUM ('reserved', 'confirmed', 'canceled');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.wallet_tx_type AS ENUM ('debit', 'credit');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.active_group_links (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "link_normalized" text NOT NULL,
  "source_table" text NOT NULL,
  "source_id" uuid NOT NULL,
  "owner_user_id" uuid NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
DO $$ BEGIN
  ALTER TABLE public.active_group_links ADD CONSTRAINT active_group_links_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.active_group_links ADD CONSTRAINT uq_active_group_links_link UNIQUE (link_normalized);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.active_group_links ADD CONSTRAINT uq_active_group_links_source UNIQUE (source_table, source_id);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.advertiser_credit_purchases (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "advertiser_account_id" uuid NOT NULL,
  "package_id" uuid NOT NULL,
  "credits_base" integer NOT NULL,
  "credits_bonus" integer DEFAULT 0 NOT NULL,
  "credits_total" integer NOT NULL,
  "amount_brl" numeric(12,2) NOT NULL,
  "payment_status" text DEFAULT 'pending'::text NOT NULL,
  "provider_name" text,
  "provider_payment_id" text,
  "provider_metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "awaiting_at" timestamp with time zone,
  "paid_at" timestamp with time zone,
  "failed_at" timestamp with time zone,
  "expires_at" timestamp with time zone DEFAULT (now() + '24:00:00'::interval)
);
DO $$ BEGIN
  ALTER TABLE public.advertiser_credit_purchases ADD CONSTRAINT advertiser_credit_purchases_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.advertiser_listing_media (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "listing_id" uuid NOT NULL,
  "media_url" text NOT NULL,
  "storage_path" text NOT NULL,
  "moderation_status" text DEFAULT 'pending_analysis'::text NOT NULL,
  "moderation_reason" text,
  "moderated_by" uuid,
  "moderated_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now(),
  "updated_at" timestamp with time zone DEFAULT now(),
  "moderation_code" text,
  "moderation_confidence" numeric(5,2),
  "analyzed_at" timestamp with time zone,
  "needs_manual_review" boolean DEFAULT false NOT NULL,
  "is_visible_public" boolean DEFAULT false NOT NULL,
  "moderation_source" text,
  "moderation_payload" jsonb
);
DO $$ BEGIN
  ALTER TABLE public.advertiser_listing_media ADD CONSTRAINT advertiser_listing_media_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.arremate_listings (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "store_id" uuid NOT NULL,
  "product_id" uuid NOT NULL,
  "title" text NOT NULL,
  "description" text,
  "product_image_url" text,
  "city" text,
  "state" text,
  "neighborhood" text,
  "regular_price" numeric(12,2) NOT NULL,
  "target_price" numeric(12,2),
  "minimum_offer" numeric(12,2),
  "stock_quantity" integer,
  "response_deadline_hours" integer DEFAULT 24,
  "allows_offers" boolean DEFAULT true NOT NULL,
  "status" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "image_storage_path" text,
  "image_original_name" text,
  "image_mime_type" text,
  "image_size_bytes" integer,
  "image_uploaded_at" timestamp with time zone
);
DO $$ BEGIN
  ALTER TABLE public.arremate_listings ADD CONSTRAINT arremate_listings_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.arremate_offers (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "arremate_listing_id" uuid NOT NULL,
  "customer_user_id" uuid,
  "customer_name" text,
  "customer_whatsapp" text,
  "offer_amount" numeric(12,2) NOT NULL,
  "quantity" integer DEFAULT 1 NOT NULL,
  "status" text NOT NULL,
  "note" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
DO $$ BEGIN
  ALTER TABLE public.arremate_offers ADD CONSTRAINT arremate_offers_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.auction_bids (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "listing_id" uuid NOT NULL,
  "user_id" uuid NOT NULL,
  "amount_cents" integer DEFAULT 0 NOT NULL,
  "is_winning" boolean DEFAULT false,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "is_auto" boolean DEFAULT false NOT NULL,
  "is_valid" boolean DEFAULT true NOT NULL,
  "source" text DEFAULT 'rpc'::text NOT NULL
);
DO $$ BEGIN
  ALTER TABLE public.auction_bids ADD CONSTRAINT auction_bids_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.auction_conversion_metrics (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "listing_type" text NOT NULL,
  "listing_id" uuid NOT NULL,
  "views_count" integer DEFAULT 0 NOT NULL,
  "watchers_count" integer DEFAULT 0 NOT NULL,
  "bids_count" integer DEFAULT 0 NOT NULL,
  "offers_count" integer DEFAULT 0 NOT NULL,
  "conversion_status" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
DO $$ BEGIN
  ALTER TABLE public.auction_conversion_metrics ADD CONSTRAINT auction_conversion_metrics_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.auction_events (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "auction_listing_id" uuid NOT NULL,
  "event_type" text NOT NULL,
  "event_payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "user_id" uuid,
  "ip_address" text,
  "origin" text
);
DO $$ BEGIN
  ALTER TABLE public.auction_events ADD CONSTRAINT auction_events_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.auction_listing_audit_log (
  "id" bigint NOT NULL,
  "listing_id" uuid NOT NULL,
  "actor_user_id" uuid,
  "field_name" text NOT NULL,
  "old_value" text,
  "new_value" text,
  "source" text DEFAULT 'rpc'::text NOT NULL,
  "ip_address" text,
  "user_agent" text,
  "transaction_id" bigint DEFAULT txid_current() NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
DO $$ BEGIN
  ALTER TABLE public.auction_listing_audit_log ADD CONSTRAINT auction_listing_audit_log_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.auction_listings (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "store_id" uuid,
  "product_id" uuid,
  "title" text NOT NULL,
  "description" text,
  "product_image_url" text,
  "city" text,
  "state" text,
  "neighborhood" text,
  "starting_bid" numeric(12,2) NOT NULL,
  "current_bid" numeric(12,2) NOT NULL,
  "minimum_increment" numeric(12,2) DEFAULT 1 NOT NULL,
  "buy_now_price" numeric(12,2),
  "reserve_price" numeric(12,2),
  "status" text NOT NULL,
  "starts_at" timestamp with time zone NOT NULL,
  "ends_at" timestamp with time zone NOT NULL,
  "winner_user_id" uuid,
  "total_bids" integer DEFAULT 0 NOT NULL,
  "watchers_count" integer DEFAULT 0 NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "image_storage_path" text,
  "image_original_name" text,
  "image_mime_type" text,
  "image_size_bytes" integer,
  "image_uploaded_at" timestamp with time zone,
  "listing_type" text DEFAULT 'auction'::text NOT NULL,
  "owner_user_id" uuid,
  "moderation_status" text DEFAULT 'pending_ai_analysis'::text NOT NULL,
  "ai_status" text DEFAULT 'queued'::text,
  "ai_verdict" text,
  "ai_confidence" numeric(5,4),
  "moderation_reason" text,
  "reviewed_at" timestamp with time zone,
  "reviewed_by" uuid,
  "ai_provider" text DEFAULT 'anthropic/claude-haiku'::text,
  "auction_duration_days" integer,
  "fulfillment_type" text DEFAULT 'pickup'::text NOT NULL,
  "category_id" uuid,
  "category_slug" text,
  "brand" text,
  "model" text,
  "item_condition" text,
  "video_url" text,
  "admin_note" text,
  "deleted_at" timestamp with time zone,
  "views_count" integer DEFAULT 0
);
DO $$ BEGIN
  ALTER TABLE public.auction_listings ADD CONSTRAINT auction_listings_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.auction_watchers (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "auction_listing_id" uuid NOT NULL,
  "user_id" uuid NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
DO $$ BEGIN
  ALTER TABLE public.auction_watchers ADD CONSTRAINT auction_watchers_auction_listing_id_user_id_key UNIQUE (auction_listing_id, user_id);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.auction_watchers ADD CONSTRAINT auction_watchers_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.financial_transactions (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "transaction_type" text NOT NULL,
  "status" transaction_status_pay DEFAULT 'initiated'::transaction_status_pay NOT NULL,
  "origin_account_id" uuid,
  "destination_account_id" uuid,
  "gross_amount" numeric(14,2) NOT NULL,
  "fee_amount" numeric(14,2) DEFAULT 0 NOT NULL,
  "net_amount" numeric(14,2) NOT NULL,
  "currency" text DEFAULT 'BRL'::text NOT NULL,
  "reference_type" text,
  "reference_id" uuid,
  "external_reference" text,
  "idempotency_key" text,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
DO $$ BEGIN
  ALTER TABLE public.financial_transactions ADD CONSTRAINT financial_transactions_idempotency_key_key UNIQUE (idempotency_key);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.financial_transactions ADD CONSTRAINT financial_transactions_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.footer_contents (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "content_type" text NOT NULL,
  "title" text NOT NULL,
  "content" text,
  "is_active" boolean DEFAULT true,
  "display_order" integer DEFAULT 99 NOT NULL,
  "created_at" timestamp with time zone DEFAULT now(),
  "updated_at" timestamp with time zone DEFAULT now()
);
DO $$ BEGIN
  ALTER TABLE public.footer_contents ADD CONSTRAINT footer_contents_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.freight_credit_balances (
  "owner_user_id" uuid NOT NULL,
  "available_credits" integer DEFAULT 0 NOT NULL,
  "reserved_credits" integer DEFAULT 0 NOT NULL,
  "consumed_credits" integer DEFAULT 0 NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
DO $$ BEGIN
  ALTER TABLE public.freight_credit_balances ADD CONSTRAINT freight_credit_balances_pkey PRIMARY KEY (owner_user_id);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.freight_credit_ledger (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "owner_user_id" uuid NOT NULL,
  "entry_type" text NOT NULL,
  "amount" integer NOT NULL,
  "balance_before" integer NOT NULL,
  "balance_after" integer NOT NULL,
  "listing_id" uuid,
  "unlock_id" uuid,
  "purchase_id" uuid,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
DO $$ BEGIN
  ALTER TABLE public.freight_credit_ledger ADD CONSTRAINT freight_credit_ledger_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.freight_listings (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "owner_user_id" uuid NOT NULL,
  "title" text NOT NULL,
  "slug" text,
  "description" text,
  "vehicle_type" text DEFAULT 'Van'::text NOT NULL,
  "price_label" text,
  "price_per_km" numeric(10,2),
  "coverage_routes" text,
  "city" text NOT NULL,
  "state" text NOT NULL,
  "neighborhood" text,
  "address_line" text,
  "address_number" text,
  "public_address_label" text,
  "visibility_status" real_estate_listing_status DEFAULT 'draft'::real_estate_listing_status NOT NULL,
  "contact_unlock_cost" integer DEFAULT 9 NOT NULL,
  "is_featured" boolean DEFAULT false NOT NULL,
  "featured_until" timestamp with time zone,
  "published_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "moderation_status" text DEFAULT 'pending_ai_analysis'::text NOT NULL,
  "ai_status" text DEFAULT 'queued'::text,
  "ai_verdict" text,
  "ai_confidence" numeric(5,4),
  "moderation_reason" text,
  "reviewed_at" timestamp with time zone,
  "reviewed_by" uuid,
  "ai_provider" text DEFAULT 'anthropic/claude-haiku'::text,
  "subcategoria" text DEFAULT 'Fretes'::text,
  "total_price" numeric,
  "vehicle_id" uuid,
  "carrier_profile_id" uuid
);
DO $$ BEGIN
  ALTER TABLE public.freight_listings ADD CONSTRAINT freight_listings_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.freight_listings ADD CONSTRAINT freight_listings_slug_key UNIQUE (slug);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.group_validation_audit_log (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "source_table" text NOT NULL,
  "source_id" uuid NOT NULL,
  "owner_user_id" uuid,
  "members_count_at_check" integer,
  "validation_result" text NOT NULL,
  "reason" text,
  "triggered_by" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
DO $$ BEGIN
  ALTER TABLE public.group_validation_audit_log ADD CONSTRAINT group_validation_audit_log_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.m1_billing_entries (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "merchant_store_id" uuid NOT NULL,
  "billing_event_id" uuid,
  "event_type" text NOT NULL,
  "charge_amount_cents" integer DEFAULT 0 NOT NULL,
  "sale_value_cents" integer DEFAULT 0,
  "status" text DEFAULT 'pending'::text NOT NULL,
  "description" text,
  "period_start" date,
  "period_end" date,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
DO $$ BEGIN
  ALTER TABLE public.m1_billing_entries ADD CONSTRAINT m1_billing_entries_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.m1_billing_events (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "merchant_store_id" uuid NOT NULL,
  "product_id" uuid,
  "event_type" text NOT NULL,
  "source_type" text DEFAULT 'direct'::text NOT NULL,
  "source_id" text,
  "campaign_id" text,
  "city" text,
  "region" text,
  "bairro" text,
  "session_id" text,
  "visitor_user_id" uuid,
  "sale_value_cents" integer DEFAULT 0,
  "metadata" jsonb DEFAULT '{}'::jsonb,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
DO $$ BEGIN
  ALTER TABLE public.m1_billing_events ADD CONSTRAINT m1_billing_events_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.marketplace_product_click_events (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "store_id" uuid NOT NULL,
  "product_id" uuid NOT NULL,
  "visitor_user_id" uuid,
  "anon_id" text,
  "city" text,
  "neighborhood" text,
  "source" text,
  "status" text NOT NULL,
  "credits_charged" integer DEFAULT 0 NOT NULL,
  "ledger_entry_id" uuid,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
DO $$ BEGIN
  ALTER TABLE public.marketplace_product_click_events ADD CONSTRAINT marketplace_product_click_events_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.merchant_credit_orders (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "store_id" uuid NOT NULL,
  "product_id" uuid NOT NULL,
  "payment_method" text NOT NULL,
  "status" text DEFAULT 'pending'::text NOT NULL,
  "amount_cents" integer DEFAULT 0 NOT NULL,
  "credits_to_add" integer DEFAULT 0 NOT NULL,
  "pix_code" text,
  "pix_qr_base64" text,
  "boleto_url" text,
  "boleto_line" text,
  "expires_at" timestamp with time zone,
  "paid_at" timestamp with time zone,
  "cancelled_at" timestamp with time zone,
  "metadata" jsonb DEFAULT '{}'::jsonb,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
DO $$ BEGIN
  ALTER TABLE public.merchant_credit_orders ADD CONSTRAINT merchant_credit_orders_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.merchant_credit_subscriptions (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "store_id" uuid NOT NULL,
  "credit_product_id" uuid NOT NULL,
  "status" text NOT NULL,
  "started_at" timestamp with time zone DEFAULT now() NOT NULL,
  "current_period_start" timestamp with time zone NOT NULL,
  "current_period_end" timestamp with time zone NOT NULL,
  "next_billing_at" timestamp with time zone,
  "auto_renew" boolean DEFAULT true NOT NULL,
  "credits_per_cycle" numeric(12,2) NOT NULL,
  "bonus_credits_per_cycle" numeric(12,2) DEFAULT 0 NOT NULL,
  "rollover_enabled" boolean DEFAULT false NOT NULL,
  "rollover_limit" numeric(12,2),
  "canceled_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "next_renewal_at" timestamp with time zone,
  "cancelled_at" timestamp with time zone,
  "paused_at" timestamp with time zone,
  "rollover_credits" integer DEFAULT 0
);
DO $$ BEGIN
  ALTER TABLE public.merchant_credit_subscriptions ADD CONSTRAINT merchant_credit_subscriptions_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.motoboy_presence (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "motoboy_id" uuid,
  "neighborhood_id" uuid,
  "city_id" uuid,
  "state_code" text,
  "is_online" boolean DEFAULT false,
  "last_seen" timestamp with time zone DEFAULT now(),
  "created_at" timestamp with time zone DEFAULT now(),
  "latitude" numeric,
  "longitude" numeric,
  "h3_index" bigint,
  "lat" double precision,
  "lng" double precision,
  "updated_at" timestamp with time zone DEFAULT now(),
  "h3_8" text
);
DO $$ BEGIN
  ALTER TABLE public.motoboy_presence ADD CONSTRAINT motoboy_presence_motoboy_id_key UNIQUE (motoboy_id);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.motoboy_presence ADD CONSTRAINT motoboy_presence_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.motor_publish_requests (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "origem" text NOT NULL,
  "pacote_id" uuid,
  "canal" text NOT NULL,
  "cidade" text,
  "conteudo" jsonb NOT NULL,
  "agendado_para" timestamp with time zone,
  "status" text DEFAULT 'fila'::text NOT NULL,
  "tentativas" integer DEFAULT 0 NOT NULL,
  "erro" text,
  "idem_key" text,
  "criado_por" uuid,
  "criado_em" timestamp with time zone DEFAULT now() NOT NULL,
  "atualizado_em" timestamp with time zone DEFAULT now() NOT NULL
);
DO $$ BEGIN
  ALTER TABLE public.motor_publish_requests ADD CONSTRAINT motor_publish_requests_idem_key_key UNIQUE (idem_key);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.motor_publish_requests ADD CONSTRAINT motor_publish_requests_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.motorista_corridas (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "passenger_id" uuid,
  "motorista_id" uuid,
  "status" text DEFAULT 'pendente'::text NOT NULL,
  "origem" text,
  "destino" text,
  "distancia_km" numeric,
  "tempo_estimado" text,
  "valor" numeric,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "accepted_at" timestamp with time zone,
  "completed_at" timestamp with time zone
);
DO $$ BEGIN
  ALTER TABLE public.motorista_corridas ADD CONSTRAINT motorista_corridas_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.notificacoes_admin (
  "id" uuid DEFAULT uuid_generate_v4() NOT NULL,
  "tipo" text NOT NULL,
  "mensagem" text NOT NULL,
  "dados" jsonb,
  "lida" boolean DEFAULT false,
  "criado_em" timestamp with time zone DEFAULT now()
);
DO $$ BEGIN
  ALTER TABLE public.notificacoes_admin ADD CONSTRAINT notificacoes_admin_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.notification_events (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "event_type" text NOT NULL,
  "entity_table" text,
  "entity_id" uuid,
  "region_id" text,
  "city_id" text,
  "payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "processed" boolean DEFAULT false NOT NULL
);
DO $$ BEGIN
  ALTER TABLE public.notification_events ADD CONSTRAINT notification_events_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.orion_auction_settlement_config (
  "id" integer DEFAULT 1 NOT NULL,
  "commission_pct" numeric DEFAULT 0.06 NOT NULL,
  "credits_per_real" numeric DEFAULT 1.00 NOT NULL,
  "auto_charge" boolean DEFAULT false NOT NULL,
  "contact_requires_payment" boolean DEFAULT true NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
DO $$ BEGIN
  ALTER TABLE public.orion_auction_settlement_config ADD CONSTRAINT orion_auction_settlement_config_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.orion_auction_settlements (
  "listing_id" uuid NOT NULL,
  "product_id" uuid,
  "seller_user_id" uuid,
  "winner_user_id" uuid,
  "titulo" text,
  "cidade" text,
  "valor_inicial" numeric,
  "valor_final" numeric,
  "total_lances" integer DEFAULT 0,
  "lances_validos" integer DEFAULT 0,
  "lances_invalidos" integer DEFAULT 0,
  "iniciado_em" timestamp with time zone,
  "encerrado_em" timestamp with time zone,
  "duracao_segundos" bigint,
  "comissao_pct" numeric,
  "comissao_bruta" numeric,
  "comissao_valor" numeric,
  "valor_liquido" numeric,
  "creditos_comissao" integer,
  "status" text DEFAULT 'no_winner'::text NOT NULL,
  "comissao_ok" boolean DEFAULT false NOT NULL,
  "creditos_ok" boolean DEFAULT false NOT NULL,
  "pagamento_ok" boolean DEFAULT false NOT NULL,
  "auditoria_ok" boolean DEFAULT false NOT NULL,
  "contato_liberado" boolean DEFAULT false NOT NULL,
  "certificado_hash" text,
  "certificado" jsonb,
  "fraude_score" integer DEFAULT 0,
  "fraude_flags" jsonb DEFAULT '[]'::jsonb,
  "evidencia" jsonb DEFAULT '{}'::jsonb,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "arremate_status" text,
  "arremate_status_at" timestamp with time zone,
  "arremate_expires_at" timestamp with time zone,
  "fulfillment" text,
  "delivery_order_id" uuid
);
DO $$ BEGIN
  ALTER TABLE public.orion_auction_settlements ADD CONSTRAINT orion_auction_settlements_pkey PRIMARY KEY (listing_id);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.orion_audio_radio_curated (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "station_uuid" text NOT NULL,
  "name" text NOT NULL,
  "stream_url" text NOT NULL,
  "homepage" text DEFAULT ''::text,
  "favicon" text DEFAULT ''::text,
  "city" text DEFAULT ''::text,
  "state" text DEFAULT ''::text,
  "country" text DEFAULT 'Brasil'::text,
  "countrycode" text DEFAULT 'BR'::text,
  "tags" text DEFAULT ''::text,
  "category" text DEFAULT ''::text,
  "frequency" text DEFAULT ''::text,
  "language" text DEFAULT 'portuguese'::text,
  "bitrate" integer DEFAULT 0,
  "geo_lat" double precision,
  "geo_long" double precision,
  "ativo" boolean DEFAULT true,
  "fonte" text DEFAULT 'curado'::text,
  "criado_por" uuid,
  "criado_em" timestamp with time zone DEFAULT now(),
  "atualizado_em" timestamp with time zone DEFAULT now(),
  "aliases" text,
  "descricao" text,
  "keywords" text,
  "social" jsonb DEFAULT '{}'::jsonb,
  "logo_url" text,
  "region" text,
  "uf" text,
  "confidence" numeric(5,2) DEFAULT 100,
  "needs_review" boolean DEFAULT false,
  "last_synced_at" timestamp with time zone,
  "search_text" text
);
DO $$ BEGIN
  ALTER TABLE public.orion_audio_radio_curated ADD CONSTRAINT orion_audio_radio_curated_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.orion_audio_radio_curated ADD CONSTRAINT orion_audio_radio_curated_station_uuid_key UNIQUE (station_uuid);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.orion_cyber_events (
  "event_id" bigint NOT NULL,
  "dedupe_key" text NOT NULL,
  "timestamp" timestamp with time zone DEFAULT now() NOT NULL,
  "origem" text NOT NULL,
  "tipo" text NOT NULL,
  "severidade" text DEFAULT 'baixa'::text NOT NULL,
  "ip" text,
  "user_id" uuid,
  "visitor_id" text,
  "endpoint" text,
  "metodo" text,
  "modulo" text,
  "descricao" text NOT NULL,
  "evidencias" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "confianca" integer DEFAULT 0 NOT NULL,
  "score" integer DEFAULT 0 NOT NULL,
  "status" text DEFAULT 'novo'::text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
DO $$ BEGIN
  ALTER TABLE public.orion_cyber_events ADD CONSTRAINT orion_cyber_events_dedupe_uq UNIQUE (dedupe_key);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.orion_cyber_events ADD CONSTRAINT orion_cyber_events_pkey PRIMARY KEY (event_id);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.orion_pacotes (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "evento_id" bigint,
  "tabela" text NOT NULL,
  "listing_id" uuid NOT NULL,
  "modulo" text,
  "cidade" text,
  "categoria" text,
  "titulo_original" text,
  "status" text DEFAULT 'montando'::text NOT NULL,
  "conteudo" jsonb,
  "recomendacao" jsonb,
  "qualidade" jsonb,
  "horario" jsonb,
  "versao" integer DEFAULT 1 NOT NULL,
  "tentativas" integer DEFAULT 0 NOT NULL,
  "erro" text,
  "motor_requests" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "criado_em" timestamp with time zone DEFAULT now() NOT NULL,
  "atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
  "expira_em" timestamp with time zone DEFAULT (now() + '30 days'::interval) NOT NULL
);
DO $$ BEGIN
  ALTER TABLE public.orion_pacotes ADD CONSTRAINT orion_pacotes_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.orion_pacotes ADD CONSTRAINT orion_pacotes_um_por_anuncio UNIQUE (tabela, listing_id);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.pay_escrow_holds (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "idempotency_key" text NOT NULL,
  "service_type" text NOT NULL,
  "service_id" uuid,
  "payer_user_id" uuid,
  "professional_user_id" uuid,
  "amount_cents" integer NOT NULL,
  "platform_fee_cents" integer DEFAULT 0 NOT NULL,
  "professional_amount_cents" integer DEFAULT 0 NOT NULL,
  "status" text DEFAULT 'held'::text NOT NULL,
  "held_at" timestamp with time zone DEFAULT now() NOT NULL,
  "released_at" timestamp with time zone,
  "refunded_at" timestamp with time zone,
  "expires_at" timestamp with time zone DEFAULT (now() + '72:00:00'::interval),
  "metadata" jsonb DEFAULT '{}'::jsonb,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
DO $$ BEGIN
  ALTER TABLE public.pay_escrow_holds ADD CONSTRAINT pay_escrow_holds_idempotency_key_key UNIQUE (idempotency_key);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.pay_escrow_holds ADD CONSTRAINT pay_escrow_holds_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.pay_payment_events (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "payment_order_id" uuid,
  "provider_name" text NOT NULL,
  "provider_event_type" text NOT NULL,
  "provider_event_id" text,
  "provider_payment_id" text,
  "status" pay_payment_event_status DEFAULT 'received'::pay_payment_event_status NOT NULL,
  "raw_payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "normalized_payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "processing_error" text,
  "processed" boolean DEFAULT false NOT NULL,
  "processed_at" timestamp with time zone,
  "retry_count" integer DEFAULT 0 NOT NULL,
  "idempotency_key" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
DO $$ BEGIN
  ALTER TABLE public.pay_payment_events ADD CONSTRAINT pay_payment_events_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.products (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "store_id" uuid NOT NULL,
  "name" text NOT NULL,
  "description" text,
  "price" numeric(10,2) NOT NULL,
  "image_url" text,
  "created_at" timestamp with time zone DEFAULT now(),
  "internal_code" text,
  "delivery_code" text,
  "enable_group_campaign" boolean DEFAULT false NOT NULL,
  "campaign_priority" integer DEFAULT 0 NOT NULL,
  "campaign_title" text,
  "campaign_description" text,
  "campaign_link_url" text
);
DO $$ BEGIN
  ALTER TABLE public.products ADD CONSTRAINT products_delivery_code_key UNIQUE (delivery_code);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.products ADD CONSTRAINT products_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.promotion_package_logs (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "package_id" uuid,
  "action" text NOT NULL,
  "old_data" jsonb,
  "new_data" jsonb,
  "performed_by" text DEFAULT 'admin'::text NOT NULL,
  "ai_command" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
DO $$ BEGIN
  ALTER TABLE public.promotion_package_logs ADD CONSTRAINT promotion_package_logs_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.publication_history (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "request_id" uuid NOT NULL,
  "pacote_id" uuid,
  "canal" text,
  "cidade" text,
  "status_final" text NOT NULL,
  "duracao_ms" integer,
  "criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
DO $$ BEGIN
  ALTER TABLE public.publication_history ADD CONSTRAINT publication_history_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.ridv_decisions_log (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "listing_id" uuid,
  "media_id" uuid,
  "category" text NOT NULL,
  "content_type" text NOT NULL,
  "status" text NOT NULL,
  "confidence" numeric(5,2),
  "reason" text,
  "verdict" text,
  "ai_provider" text DEFAULT 'anthropic/claude-haiku'::text,
  "user_id" uuid,
  "reviewed_by" uuid,
  "reviewed_at" timestamp with time zone,
  "metadata" jsonb DEFAULT '{}'::jsonb,
  "created_at" timestamp with time zone DEFAULT now()
);
DO $$ BEGIN
  ALTER TABLE public.ridv_decisions_log ADD CONSTRAINT ridv_decisions_log_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.service_listings (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "owner_user_id" uuid NOT NULL,
  "title" text NOT NULL,
  "slug" text,
  "description" text,
  "service_type" text DEFAULT 'Outros Serviços'::text NOT NULL,
  "price_label" text,
  "city" text NOT NULL,
  "state" text NOT NULL,
  "neighborhood" text,
  "address_line" text,
  "address_number" text,
  "public_address_label" text,
  "visibility_status" real_estate_listing_status DEFAULT 'draft'::real_estate_listing_status NOT NULL,
  "contact_unlock_cost" integer DEFAULT 9 NOT NULL,
  "published_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "moderation_status" text DEFAULT 'pending_ai_analysis'::text NOT NULL,
  "ai_status" text DEFAULT 'queued'::text,
  "ai_verdict" text,
  "ai_confidence" numeric(5,4),
  "moderation_reason" text,
  "reviewed_at" timestamp with time zone,
  "reviewed_by" uuid,
  "ai_provider" text DEFAULT 'anthropic/claude-haiku'::text,
  "total_price" numeric,
  "vehicle_id" uuid,
  "carrier_profile_id" uuid
);
DO $$ BEGIN
  ALTER TABLE public.service_listings ADD CONSTRAINT service_listings_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.service_listings ADD CONSTRAINT service_listings_slug_key UNIQUE (slug);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.store_followers (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "store_key" text NOT NULL,
  "user_id" uuid,
  "visitor_anon_id" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
DO $$ BEGIN
  ALTER TABLE public.store_followers ADD CONSTRAINT one_follower_per_store UNIQUE NULLS NOT DISTINCT (store_key, user_id, visitor_anon_id);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.store_followers ADD CONSTRAINT store_followers_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $$;

-- (removido) ticket_messages nasce por RENAME de ticket_mensagens em 20260306120000 — não pré-criar

CREATE TABLE IF NOT EXISTS public.travel_credit_balances (
  "owner_user_id" uuid NOT NULL,
  "available_credits" integer DEFAULT 0 NOT NULL,
  "reserved_credits" integer DEFAULT 0 NOT NULL,
  "consumed_credits" integer DEFAULT 0 NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
DO $$ BEGIN
  ALTER TABLE public.travel_credit_balances ADD CONSTRAINT travel_credit_balances_pkey PRIMARY KEY (owner_user_id);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.travel_credit_ledger (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "owner_user_id" uuid NOT NULL,
  "entry_type" text NOT NULL,
  "amount" integer NOT NULL,
  "balance_before" integer NOT NULL,
  "balance_after" integer NOT NULL,
  "listing_id" uuid,
  "unlock_id" uuid,
  "purchase_id" uuid,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
DO $$ BEGIN
  ALTER TABLE public.travel_credit_ledger ADD CONSTRAINT travel_credit_ledger_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.travel_listings (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "owner_user_id" uuid NOT NULL,
  "title" text NOT NULL,
  "slug" text,
  "description" text,
  "category" text DEFAULT 'Pacotes Turísticos'::text NOT NULL,
  "trip_type" text,
  "destination" text,
  "country" text DEFAULT 'Brasil'::text,
  "city" text,
  "state" text,
  "neighborhood" text,
  "departure_date" date,
  "return_date" date,
  "duration_days" integer,
  "available_spots" integer,
  "min_people" integer,
  "max_people" integer,
  "price_per_person" numeric(12,2),
  "total_price" numeric(12,2),
  "entry_price" text,
  "installments_available" boolean DEFAULT false NOT NULL,
  "includes_accommodation" boolean DEFAULT false NOT NULL,
  "includes_breakfast" boolean DEFAULT false NOT NULL,
  "includes_lunch" boolean DEFAULT false NOT NULL,
  "includes_dinner" boolean DEFAULT false NOT NULL,
  "includes_transport" boolean DEFAULT false NOT NULL,
  "includes_guide" boolean DEFAULT false NOT NULL,
  "includes_insurance" boolean DEFAULT false NOT NULL,
  "includes_tours" boolean DEFAULT false NOT NULL,
  "includes_airport_transfer" boolean DEFAULT false NOT NULL,
  "not_included" text,
  "video_url" text,
  "youtube_url" text,
  "visibility_status" real_estate_listing_status DEFAULT 'draft'::real_estate_listing_status NOT NULL,
  "contact_unlock_cost" integer DEFAULT 9 NOT NULL,
  "is_featured" boolean DEFAULT false NOT NULL,
  "featured_until" timestamp with time zone,
  "published_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "latitude" double precision,
  "longitude" double precision,
  "endereco_formatado" text,
  "is_promoted" boolean DEFAULT false NOT NULL,
  "moderation_status" text DEFAULT 'pending_ai_analysis'::text NOT NULL,
  "ai_status" text DEFAULT 'queued'::text,
  "ai_verdict" text,
  "ai_confidence" numeric(5,4),
  "moderation_reason" text,
  "reviewed_at" timestamp with time zone,
  "reviewed_by" uuid,
  "ai_provider" text DEFAULT 'anthropic/claude-haiku'::text,
  "subcategoria" text DEFAULT 'Viagens'::text,
  "promoted_until" timestamp with time zone,
  "deleted_at" timestamp with time zone,
  "vehicle_id" uuid,
  "carrier_profile_id" uuid
);
DO $$ BEGIN
  ALTER TABLE public.travel_listings ADD CONSTRAINT travel_listings_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.travel_listings ADD CONSTRAINT travel_listings_slug_key UNIQUE (slug);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.vehicle_credit_balances (
  "owner_user_id" uuid NOT NULL,
  "available_credits" integer DEFAULT 0 NOT NULL,
  "reserved_credits" integer DEFAULT 0 NOT NULL,
  "consumed_credits" integer DEFAULT 0 NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
DO $$ BEGIN
  ALTER TABLE public.vehicle_credit_balances ADD CONSTRAINT vehicle_credit_balances_pkey PRIMARY KEY (owner_user_id);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.vehicle_credit_ledger (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "owner_user_id" uuid NOT NULL,
  "entry_type" text NOT NULL,
  "amount" integer NOT NULL,
  "balance_before" integer NOT NULL,
  "balance_after" integer NOT NULL,
  "listing_id" uuid,
  "unlock_id" uuid,
  "purchase_id" uuid,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
DO $$ BEGIN
  ALTER TABLE public.vehicle_credit_ledger ADD CONSTRAINT vehicle_credit_ledger_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.vehicle_credit_purchases (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "owner_user_id" uuid NOT NULL,
  "package_id" uuid,
  "credits_base" integer DEFAULT 0 NOT NULL,
  "credits_bonus" integer DEFAULT 0 NOT NULL,
  "credits_total" integer DEFAULT 0 NOT NULL,
  "amount_brl" numeric(12,2) DEFAULT 0 NOT NULL,
  "payment_status" text DEFAULT 'pending'::text NOT NULL,
  "provider_name" text,
  "provider_reference" text,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "paid_at" timestamp with time zone
);
DO $$ BEGIN
  ALTER TABLE public.vehicle_credit_purchases ADD CONSTRAINT vehicle_credit_purchases_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.vehicle_listing_click_log (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "listing_id" uuid NOT NULL,
  "fingerprint" text,
  "charged" boolean DEFAULT false NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
DO $$ BEGIN
  ALTER TABLE public.vehicle_listing_click_log ADD CONSTRAINT vehicle_listing_click_log_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.wallet_transactions (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "wallet_id" uuid NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "status" wallet_tx_status DEFAULT 'reserved'::wallet_tx_status NOT NULL,
  "tx_type" wallet_tx_type NOT NULL,
  "amount_cents" bigint NOT NULL,
  "idempotency_key" text NOT NULL,
  "ref_table" text,
  "ref_id" uuid,
  "description" text,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL
);
DO $$ BEGIN
  ALTER TABLE public.wallet_transactions ADD CONSTRAINT wallet_transactions_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.wallet_transactions ADD CONSTRAINT wallet_transactions_wallet_idem_uk UNIQUE (wallet_id, idempotency_key);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.wallets (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "owner_uid" uuid NOT NULL,
  "currency" text DEFAULT 'BRL'::text NOT NULL,
  "balance_cents" bigint DEFAULT 0 NOT NULL,
  "reserved_cents" bigint DEFAULT 0 NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL
);
DO $$ BEGIN
  ALTER TABLE public.wallets ADD CONSTRAINT wallets_owner_currency_uk UNIQUE (owner_uid, currency);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.wallets ADD CONSTRAINT wallets_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $$;

-- === ORION-480: tabelas-fantasma (existiram em produção, referenciadas por migrations, dropadas depois) ===
-- Stubs mínimos para o replay histórico passar; colunas derivadas dos statements que as referenciam.
-- Paridade final com produção: cleanup posterior dropa o que produção não tem hoje.

CREATE TABLE IF NOT EXISTS public.corridas (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  service_type text,
  passenger_id uuid,
  origem text,
  destino text,
  valor numeric,
  status text DEFAULT 'pending',
  payment_status text DEFAULT 'pending',
  distancia_km numeric,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.merchant_wallets (
  merchant_id uuid NOT NULL PRIMARY KEY,
  saldo_atual numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.merchant_wallet_transactions (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid,
  tipo text,
  valor numeric,
  descricao text,
  referencia_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.expansion_settings (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  base_commission_percent numeric,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.message_library (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- === ORION-480: lote 3 — tabelas realtime órfãs (DDL de produção) + views-stub para GRANT/REVOKE do replay ===
-- Views-stub: GRANT/REVOKE exigem apenas que o objeto exista; definição real + ACLs restaurados na migration de paridade final.

CREATE TABLE IF NOT EXISTS public.public_rides (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "tracking_code" text DEFAULT ''::text NOT NULL,
  "status" text DEFAULT 'aguardando_motoboy'::text NOT NULL,
  "visitor_name" text NOT NULL,
  "visitor_phone" text NOT NULL,
  "origin_address" text NOT NULL,
  "origin_lat" double precision,
  "origin_lng" double precision,
  "destination_address" text NOT NULL,
  "destination_lat" double precision,
  "destination_lng" double precision,
  "package_description" text,
  "distance_km" numeric(10,2),
  "estimated_duration_min" integer,
  "estimated_price" numeric(10,2),
  "final_price" numeric(10,2),
  "platform_commission" numeric(10,2),
  "motoboy_earnings" numeric(10,2),
  "payment_method" text,
  "payment_status" text DEFAULT 'pending'::text NOT NULL,
  "payment_external_ref" text,
  "paid_at" timestamp with time zone,
  "motoboy_id" uuid,
  "motoboy_accepted_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "collected_at" timestamp with time zone,
  "delivered_at" timestamp with time zone,
  "cancelled_at" timestamp with time zone,
  "cancelled_reason" text,
  "expires_at" timestamp with time zone DEFAULT (now() + '00:15:00'::interval) NOT NULL
);
DO $$ BEGIN
  ALTER TABLE public.public_rides ADD CONSTRAINT public_rides_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.public_rides ADD CONSTRAINT public_rides_tracking_code_key UNIQUE (tracking_code);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.user_notifications (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL,
  "title" text NOT NULL,
  "message" text,
  "type" text DEFAULT 'system'::text,
  "is_read" boolean DEFAULT false,
  "created_at" timestamp with time zone DEFAULT now(),
  "source_module" text DEFAULT 'system'::text,
  "severity" text DEFAULT 'info'::text,
  "reference_type" text,
  "reference_id" uuid,
  "profile_type" text DEFAULT 'all'::text,
  "read_at" timestamp with time zone,
  "metadata" jsonb DEFAULT '{}'::jsonb
);
DO $$ BEGIN
  ALTER TABLE public.user_notifications ADD CONSTRAINT user_notifications_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $$;

DO $$ BEGIN
  IF to_regclass('public.admin_campaign_dispatch_panel_view') IS NULL THEN
    CREATE VIEW public.admin_campaign_dispatch_panel_view AS SELECT NULL::uuid AS orion_stub WHERE false;
  END IF;
END $$;
DO $$ BEGIN
  IF to_regclass('public.admin_campaign_queue_view') IS NULL THEN
    CREATE VIEW public.admin_campaign_queue_view AS SELECT NULL::uuid AS orion_stub WHERE false;
  END IF;
END $$;
DO $$ BEGIN
  IF to_regclass('public.admin_city_sales_ranking') IS NULL THEN
    CREATE VIEW public.admin_city_sales_ranking AS SELECT NULL::uuid AS orion_stub WHERE false;
  END IF;
END $$;
DO $$ BEGIN
  IF to_regclass('public.admin_district_sales_ranking') IS NULL THEN
    CREATE VIEW public.admin_district_sales_ranking AS SELECT NULL::uuid AS orion_stub WHERE false;
  END IF;
END $$;
DO $$ BEGIN
  IF to_regclass('public.admin_group_density') IS NULL THEN
    CREATE VIEW public.admin_group_density AS SELECT NULL::uuid AS orion_stub WHERE false;
  END IF;
END $$;
DO $$ BEGIN
  IF to_regclass('public.admin_pi2_motoboy_split_details') IS NULL THEN
    CREATE VIEW public.admin_pi2_motoboy_split_details AS SELECT NULL::uuid AS orion_stub WHERE false;
  END IF;
END $$;
DO $$ BEGIN
  IF to_regclass('public.admin_pi2_motoboy_wallet_overview') IS NULL THEN
    CREATE VIEW public.admin_pi2_motoboy_wallet_overview AS SELECT NULL::uuid AS orion_stub WHERE false;
  END IF;
END $$;
DO $$ BEGIN
  IF to_regclass('public.admin_pi2_motoboy_withdrawal_details') IS NULL THEN
    CREATE VIEW public.admin_pi2_motoboy_withdrawal_details AS SELECT NULL::uuid AS orion_stub WHERE false;
  END IF;
END $$;
DO $$ BEGIN
  IF to_regclass('public.admin_postador_ranking') IS NULL THEN
    CREATE VIEW public.admin_postador_ranking AS SELECT NULL::uuid AS orion_stub WHERE false;
  END IF;
END $$;
DO $$ BEGIN
  IF to_regclass('public.admin_referral_ranking') IS NULL THEN
    CREATE VIEW public.admin_referral_ranking AS SELECT NULL::uuid AS orion_stub WHERE false;
  END IF;
END $$;
DO $$ BEGIN
  IF to_regclass('public.admin_top_products') IS NULL THEN
    CREATE VIEW public.admin_top_products AS SELECT NULL::uuid AS orion_stub WHERE false;
  END IF;
END $$;
DO $$ BEGIN
  IF to_regclass('public.group_hunter_ranking') IS NULL THEN
    CREATE VIEW public.group_hunter_ranking AS SELECT NULL::uuid AS orion_stub WHERE false;
  END IF;
END $$;
DO $$ BEGIN
  IF to_regclass('public.group_posting_runtime_view') IS NULL THEN
    CREATE VIEW public.group_posting_runtime_view AS SELECT NULL::uuid AS orion_stub WHERE false;
  END IF;
END $$;
DO $$ BEGIN
  IF to_regclass('public.marketing_product_candidates_view') IS NULL THEN
    CREATE VIEW public.marketing_product_candidates_view AS SELECT NULL::uuid AS orion_stub WHERE false;
  END IF;
END $$;
DO $$ BEGIN
  IF to_regclass('public.merchant_conversion_events_view') IS NULL THEN
    CREATE VIEW public.merchant_conversion_events_view AS SELECT NULL::uuid AS orion_stub WHERE false;
  END IF;
END $$;
DO $$ BEGIN
  IF to_regclass('public.motoboy_delivery_offers_view') IS NULL THEN
    CREATE VIEW public.motoboy_delivery_offers_view AS SELECT NULL::uuid AS orion_stub WHERE false;
  END IF;
END $$;
DO $$ BEGIN
  IF to_regclass('public.motoboy_posting_candidates_view') IS NULL THEN
    CREATE VIEW public.motoboy_posting_candidates_view AS SELECT NULL::uuid AS orion_stub WHERE false;
  END IF;
END $$;
DO $$ BEGIN
  IF to_regclass('public.platform_financial_dashboard') IS NULL THEN
    CREATE VIEW public.platform_financial_dashboard AS SELECT NULL::uuid AS orion_stub WHERE false;
  END IF;
END $$;
DO $$ BEGIN
  IF to_regclass('public.platform_payout_alerts_view') IS NULL THEN
    CREATE VIEW public.platform_payout_alerts_view AS SELECT NULL::uuid AS orion_stub WHERE false;
  END IF;
END $$;
DO $$ BEGIN
  IF to_regclass('public.platform_payout_reconciliation_view') IS NULL THEN
    CREATE VIEW public.platform_payout_reconciliation_view AS SELECT NULL::uuid AS orion_stub WHERE false;
  END IF;
END $$;
DO $$ BEGIN
  IF to_regclass('public.platform_payouts_admin_view') IS NULL THEN
    CREATE VIEW public.platform_payouts_admin_view AS SELECT NULL::uuid AS orion_stub WHERE false;
  END IF;
END $$;
DO $$ BEGIN
  IF to_regclass('public.postador_batch_board') IS NULL THEN
    CREATE VIEW public.postador_batch_board AS SELECT NULL::uuid AS orion_stub WHERE false;
  END IF;
END $$;
DO $$ BEGIN
  IF to_regclass('public.postador_history_by_operator_view') IS NULL THEN
    CREATE VIEW public.postador_history_by_operator_view AS SELECT NULL::uuid AS orion_stub WHERE false;
  END IF;
END $$;
DO $$ BEGIN
  IF to_regclass('public.postador_history_view') IS NULL THEN
    CREATE VIEW public.postador_history_view AS SELECT NULL::uuid AS orion_stub WHERE false;
  END IF;
END $$;
DO $$ BEGIN
  IF to_regclass('public.postador_kpis_view') IS NULL THEN
    CREATE VIEW public.postador_kpis_view AS SELECT NULL::uuid AS orion_stub WHERE false;
  END IF;
END $$;
DO $$ BEGIN
  IF to_regclass('public.postador_operational_queue_view') IS NULL THEN
    CREATE VIEW public.postador_operational_queue_view AS SELECT NULL::uuid AS orion_stub WHERE false;
  END IF;
END $$;
DO $$ BEGIN
  IF to_regclass('public.postador_operator_kpis_view') IS NULL THEN
    CREATE VIEW public.postador_operator_kpis_view AS SELECT NULL::uuid AS orion_stub WHERE false;
  END IF;
END $$;
DO $$ BEGIN
  IF to_regclass('public.postador_queue_cards_view') IS NULL THEN
    CREATE VIEW public.postador_queue_cards_view AS SELECT NULL::uuid AS orion_stub WHERE false;
  END IF;
END $$;
DO $$ BEGIN
  IF to_regclass('public.postador_queue_pending_view') IS NULL THEN
    CREATE VIEW public.postador_queue_pending_view AS SELECT NULL::uuid AS orion_stub WHERE false;
  END IF;
END $$;
DO $$ BEGIN
  IF to_regclass('public.professional_wallet_balances') IS NULL THEN
    CREATE VIEW public.professional_wallet_balances AS SELECT NULL::uuid AS orion_stub WHERE false;
  END IF;
END $$;
DO $$ BEGIN
  IF to_regclass('public.territory_group_density') IS NULL THEN
    CREATE VIEW public.territory_group_density AS SELECT NULL::uuid AS orion_stub WHERE false;
  END IF;
END $$;
DO $$ BEGIN
  IF to_regclass('public.territory_sales_heatmap') IS NULL THEN
    CREATE VIEW public.territory_sales_heatmap AS SELECT NULL::uuid AS orion_stub WHERE false;
  END IF;
END $$;
DO $$ BEGIN
  IF to_regclass('public.tmp_audit_comissao') IS NULL THEN
    CREATE VIEW public.tmp_audit_comissao AS SELECT NULL::uuid AS orion_stub WHERE false;
  END IF;
END $$;
DO $$ BEGIN
  IF to_regclass('public.tmp_debug_dispatch') IS NULL THEN
    CREATE VIEW public.tmp_debug_dispatch AS SELECT NULL::uuid AS orion_stub WHERE false;
  END IF;
END $$;
DO $$ BEGIN
  IF to_regclass('public.v_account_balances') IS NULL THEN
    CREATE VIEW public.v_account_balances AS SELECT NULL::uuid AS orion_stub WHERE false;
  END IF;
END $$;
DO $$ BEGIN
  IF to_regclass('public.v_admin_dashboard_geral') IS NULL THEN
    CREATE VIEW public.v_admin_dashboard_geral AS SELECT NULL::uuid AS orion_stub WHERE false;
  END IF;
END $$;
DO $$ BEGIN
  IF to_regclass('public.v_admin_lojistas') IS NULL THEN
    CREATE VIEW public.v_admin_lojistas AS SELECT NULL::uuid AS orion_stub WHERE false;
  END IF;
END $$;
DO $$ BEGIN
  IF to_regclass('public.v_admin_lojistas_base') IS NULL THEN
    CREATE VIEW public.v_admin_lojistas_base AS SELECT NULL::uuid AS orion_stub WHERE false;
  END IF;
END $$;
DO $$ BEGIN
  IF to_regclass('public.v_admin_lojistas_metrics') IS NULL THEN
    CREATE VIEW public.v_admin_lojistas_metrics AS SELECT NULL::uuid AS orion_stub WHERE false;
  END IF;
END $$;
DO $$ BEGIN
  IF to_regclass('public.v_admin_sc_cities') IS NULL THEN
    CREATE VIEW public.v_admin_sc_cities AS SELECT NULL::uuid AS orion_stub WHERE false;
  END IF;
END $$;
DO $$ BEGIN
  IF to_regclass('public.v_campaign_queue_operational') IS NULL THEN
    CREATE VIEW public.v_campaign_queue_operational AS SELECT NULL::uuid AS orion_stub WHERE false;
  END IF;
END $$;
DO $$ BEGIN
  IF to_regclass('public.v_dashboard_postador') IS NULL THEN
    CREATE VIEW public.v_dashboard_postador AS SELECT NULL::uuid AS orion_stub WHERE false;
  END IF;
END $$;
DO $$ BEGIN
  IF to_regclass('public.v_delivery_offer_feed') IS NULL THEN
    CREATE VIEW public.v_delivery_offer_feed AS SELECT NULL::uuid AS orion_stub WHERE false;
  END IF;
END $$;
DO $$ BEGIN
  IF to_regclass('public.v_fila_hoje') IS NULL THEN
    CREATE VIEW public.v_fila_hoje AS SELECT NULL::uuid AS orion_stub WHERE false;
  END IF;
END $$;
DO $$ BEGIN
  IF to_regclass('public.v_grupos_elegiveis') IS NULL THEN
    CREATE VIEW public.v_grupos_elegiveis AS SELECT NULL::uuid AS orion_stub WHERE false;
  END IF;
END $$;
DO $$ BEGIN
  IF to_regclass('public.v_merchant_credit_ledger_detailed') IS NULL THEN
    CREATE VIEW public.v_merchant_credit_ledger_detailed AS SELECT NULL::uuid AS orion_stub WHERE false;
  END IF;
END $$;
DO $$ BEGIN
  IF to_regclass('public.v_merchant_credit_monthly_results') IS NULL THEN
    CREATE VIEW public.v_merchant_credit_monthly_results AS SELECT NULL::uuid AS orion_stub WHERE false;
  END IF;
END $$;
DO $$ BEGIN
  IF to_regclass('public.v_merchant_credit_overview') IS NULL THEN
    CREATE VIEW public.v_merchant_credit_overview AS SELECT NULL::uuid AS orion_stub WHERE false;
  END IF;
END $$;
DO $$ BEGIN
  IF to_regclass('public.v_merchant_credit_purchase_history') IS NULL THEN
    CREATE VIEW public.v_merchant_credit_purchase_history AS SELECT NULL::uuid AS orion_stub WHERE false;
  END IF;
END $$;
DO $$ BEGIN
  IF to_regclass('public.v_merchant_credit_statement') IS NULL THEN
    CREATE VIEW public.v_merchant_credit_statement AS SELECT NULL::uuid AS orion_stub WHERE false;
  END IF;
END $$;
DO $$ BEGIN
  IF to_regclass('public.v_merchant_credit_wallet_overview') IS NULL THEN
    CREATE VIEW public.v_merchant_credit_wallet_overview AS SELECT NULL::uuid AS orion_stub WHERE false;
  END IF;
END $$;
DO $$ BEGIN
  IF to_regclass('public.v_motoboy_pay_earnings_detailed') IS NULL THEN
    CREATE VIEW public.v_motoboy_pay_earnings_detailed AS SELECT NULL::uuid AS orion_stub WHERE false;
  END IF;
END $$;
DO $$ BEGIN
  IF to_regclass('public.v_motoboy_pay_payouts_detailed') IS NULL THEN
    CREATE VIEW public.v_motoboy_pay_payouts_detailed AS SELECT NULL::uuid AS orion_stub WHERE false;
  END IF;
END $$;
DO $$ BEGIN
  IF to_regclass('public.v_motoboy_pay_wallet_overview') IS NULL THEN
    CREATE VIEW public.v_motoboy_pay_wallet_overview AS SELECT NULL::uuid AS orion_stub WHERE false;
  END IF;
END $$;
DO $$ BEGIN
  IF to_regclass('public.v_my_balance') IS NULL THEN
    CREATE VIEW public.v_my_balance AS SELECT NULL::uuid AS orion_stub WHERE false;
  END IF;
END $$;
DO $$ BEGIN
  IF to_regclass('public.v_my_statement') IS NULL THEN
    CREATE VIEW public.v_my_statement AS SELECT NULL::uuid AS orion_stub WHERE false;
  END IF;
END $$;
DO $$ BEGIN
  IF to_regclass('public.v_my_wallet_overview') IS NULL THEN
    CREATE VIEW public.v_my_wallet_overview AS SELECT NULL::uuid AS orion_stub WHERE false;
  END IF;
END $$;
DO $$ BEGIN
  IF to_regclass('public.v_pay_admin_payout_summary') IS NULL THEN
    CREATE VIEW public.v_pay_admin_payout_summary AS SELECT NULL::uuid AS orion_stub WHERE false;
  END IF;
END $$;
DO $$ BEGIN
  IF to_regclass('public.v_pay_admin_platform_summary') IS NULL THEN
    CREATE VIEW public.v_pay_admin_platform_summary AS SELECT NULL::uuid AS orion_stub WHERE false;
  END IF;
END $$;
DO $$ BEGIN
  IF to_regclass('public.v_pay_admin_recent_ledger') IS NULL THEN
    CREATE VIEW public.v_pay_admin_recent_ledger AS SELECT NULL::uuid AS orion_stub WHERE false;
  END IF;
END $$;
DO $$ BEGIN
  IF to_regclass('public.v_pay_audit_motoboy_payouts_pending') IS NULL THEN
    CREATE VIEW public.v_pay_audit_motoboy_payouts_pending AS SELECT NULL::uuid AS orion_stub WHERE false;
  END IF;
END $$;
DO $$ BEGIN
  IF to_regclass('public.v_pay_motoboy_earnings') IS NULL THEN
    CREATE VIEW public.v_pay_motoboy_earnings AS SELECT NULL::uuid AS orion_stub WHERE false;
  END IF;
END $$;
DO $$ BEGIN
  IF to_regclass('public.v_pay_motoboy_payout_requests') IS NULL THEN
    CREATE VIEW public.v_pay_motoboy_payout_requests AS SELECT NULL::uuid AS orion_stub WHERE false;
  END IF;
END $$;
DO $$ BEGIN
  IF to_regclass('public.v_pay_platform_ledger_summary') IS NULL THEN
    CREATE VIEW public.v_pay_platform_ledger_summary AS SELECT NULL::uuid AS orion_stub WHERE false;
  END IF;
END $$;
DO $$ BEGIN
  IF to_regclass('public.v_produtos_urgencia') IS NULL THEN
    CREATE VIEW public.v_produtos_urgencia AS SELECT NULL::uuid AS orion_stub WHERE false;
  END IF;
END $$;
DO $$ BEGIN
  IF to_regclass('public.v_store_menu_notification_counts') IS NULL THEN
    CREATE VIEW public.v_store_menu_notification_counts AS SELECT NULL::uuid AS orion_stub WHERE false;
  END IF;
END $$;
DO $$ BEGIN
  IF to_regclass('public.v_support_tickets_admin') IS NULL THEN
    CREATE VIEW public.v_support_tickets_admin AS SELECT NULL::uuid AS orion_stub WHERE false;
  END IF;
END $$;
DO $$ BEGIN
  IF to_regclass('public.v_user_wallet_balance') IS NULL THEN
    CREATE VIEW public.v_user_wallet_balance AS SELECT NULL::uuid AS orion_stub WHERE false;
  END IF;
END $$;
DO $$ BEGIN
  IF to_regclass('public.v_user_wallet_payouts') IS NULL THEN
    CREATE VIEW public.v_user_wallet_payouts AS SELECT NULL::uuid AS orion_stub WHERE false;
  END IF;
END $$;
DO $$ BEGIN
  IF to_regclass('public.v_user_wallet_statement') IS NULL THEN
    CREATE VIEW public.v_user_wallet_statement AS SELECT NULL::uuid AS orion_stub WHERE false;
  END IF;
END $$;
DO $$ BEGIN
  IF to_regclass('public.v_wallet_balance') IS NULL THEN
    CREATE VIEW public.v_wallet_balance AS SELECT NULL::uuid AS orion_stub WHERE false;
  END IF;
END $$;
-- === ORION-480: lote 4 — stores (DDL produção) + fantasmas posting_numbers/number_activity_log (pipeline removido) ===

CREATE TABLE IF NOT EXISTS public.stores (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "owner_id" uuid NOT NULL,
  "name" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now(),
  "latitude" double precision,
  "longitude" double precision,
  "territory_id" uuid
);
DO $$ BEGIN
  ALTER TABLE public.stores ADD CONSTRAINT stores_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.posting_numbers (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  phone_number text,
  status text,
  risk_score numeric,
  health_score numeric,
  total_groups integer,
  cooldown_until timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.number_activity_log (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  number_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- === ORION-480: colunas órfãs de profiles (usadas em 20260217, criadas formalmente só em 20260705 com IF NOT EXISTS) ===
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS quantidade_grupos_ativos int DEFAULT 0;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS percentual_comissao_atual numeric DEFAULT 25;

-- === ORION-480: coluna órfã motoboy_whatsapp_groups.motoboy_id (usada por policies de 20260222182245; revertida depois em prod) ===
ALTER TABLE public.motoboy_whatsapp_groups ADD COLUMN IF NOT EXISTS motoboy_id uuid;

-- === ORION-480: coluna órfã profiles.role (transitória; usada por policy em 20260306130000, ausente em prod hoje) ===
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS role text;

-- === ORION-480: colunas órfãs transitórias de footer_contents (exigidas pelo seed 20260306140000; dropadas de prod depois) ===
ALTER TABLE public.footer_contents ADD COLUMN IF NOT EXISTS profile_type text;
ALTER TABLE public.footer_contents ADD COLUMN IF NOT EXISTS version integer;
ALTER TABLE public.footer_contents ADD COLUMN IF NOT EXISTS created_by uuid;

-- === ORION-480: group_posting_settings v1 (per-grupo, criada em 20260111111337) foi dropada manualmente em prod;
-- 20260306210000 recria com design global. Replay espelha o drop aqui (nenhuma migration entre 0113 e 0306 referencia a v1).
DROP TABLE IF EXISTS public.group_posting_settings CASCADE;

-- === ORION-480: coluna órfã whatsapp_groups.updated_at (usada em 20260308_enforce_group_validity; existe em prod) ===
ALTER TABLE public.whatsapp_groups ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

-- === ORION-480: bulk-diff de colunas órfãs (todas as tabelas comuns, colunas presentes em prod e ausentes no replay; exceto ADD COLUMN sem guard em migrations futuras) ===
DO $$ BEGIN
  ALTER TABLE public.delivery_orders ADD COLUMN IF NOT EXISTS "store_id" uuid DEFAULT get_store_id();
EXCEPTION WHEN undefined_object THEN NULL; WHEN undefined_function THEN NULL; WHEN undefined_table THEN NULL; WHEN datatype_mismatch THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.delivery_orders ADD COLUMN IF NOT EXISTS "total_price" numeric(10,2);
EXCEPTION WHEN undefined_object THEN NULL; WHEN undefined_function THEN NULL; WHEN undefined_table THEN NULL; WHEN datatype_mismatch THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.delivery_orders ADD COLUMN IF NOT EXISTS "delivered_at" timestamp with time zone;
EXCEPTION WHEN undefined_object THEN NULL; WHEN undefined_function THEN NULL; WHEN undefined_table THEN NULL; WHEN datatype_mismatch THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.delivery_orders ADD COLUMN IF NOT EXISTS "motoboy_id" uuid;
EXCEPTION WHEN undefined_object THEN NULL; WHEN undefined_function THEN NULL; WHEN undefined_table THEN NULL; WHEN datatype_mismatch THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.delivery_orders ADD COLUMN IF NOT EXISTS "neighborhood_id" uuid;
EXCEPTION WHEN undefined_object THEN NULL; WHEN undefined_function THEN NULL; WHEN undefined_table THEN NULL; WHEN datatype_mismatch THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.delivery_orders ADD COLUMN IF NOT EXISTS "distance_km" numeric;
EXCEPTION WHEN undefined_object THEN NULL; WHEN undefined_function THEN NULL; WHEN undefined_table THEN NULL; WHEN datatype_mismatch THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.delivery_orders ADD COLUMN IF NOT EXISTS "estimated_minutes" integer;
EXCEPTION WHEN undefined_object THEN NULL; WHEN undefined_function THEN NULL; WHEN undefined_table THEN NULL; WHEN datatype_mismatch THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.delivery_orders ADD COLUMN IF NOT EXISTS "route_geometry" jsonb;
EXCEPTION WHEN undefined_object THEN NULL; WHEN undefined_function THEN NULL; WHEN undefined_table THEN NULL; WHEN datatype_mismatch THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.delivery_orders ADD COLUMN IF NOT EXISTS "drop_address" text;
EXCEPTION WHEN undefined_object THEN NULL; WHEN undefined_function THEN NULL; WHEN undefined_table THEN NULL; WHEN datatype_mismatch THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.delivery_orders ADD COLUMN IF NOT EXISTS "route_polyline" text;
EXCEPTION WHEN undefined_object THEN NULL; WHEN undefined_function THEN NULL; WHEN undefined_table THEN NULL; WHEN datatype_mismatch THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.delivery_orders ADD COLUMN IF NOT EXISTS "delivery_price" numeric;
EXCEPTION WHEN undefined_object THEN NULL; WHEN undefined_function THEN NULL; WHEN undefined_table THEN NULL; WHEN datatype_mismatch THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.delivery_orders ADD COLUMN IF NOT EXISTS "started_at" timestamp with time zone;
EXCEPTION WHEN undefined_object THEN NULL; WHEN undefined_function THEN NULL; WHEN undefined_table THEN NULL; WHEN datatype_mismatch THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.delivery_orders ADD COLUMN IF NOT EXISTS "finished_at" timestamp with time zone;
EXCEPTION WHEN undefined_object THEN NULL; WHEN undefined_function THEN NULL; WHEN undefined_table THEN NULL; WHEN datatype_mismatch THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.delivery_orders ADD COLUMN IF NOT EXISTS "service_level" delivery_service_level DEFAULT 'standard'::delivery_service_level;
EXCEPTION WHEN undefined_object THEN NULL; WHEN undefined_function THEN NULL; WHEN undefined_table THEN NULL; WHEN datatype_mismatch THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.delivery_orders ADD COLUMN IF NOT EXISTS "base_fee" numeric(10,2);
EXCEPTION WHEN undefined_object THEN NULL; WHEN undefined_function THEN NULL; WHEN undefined_table THEN NULL; WHEN datatype_mismatch THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.delivery_orders ADD COLUMN IF NOT EXISTS "km_fee" numeric(10,2);
EXCEPTION WHEN undefined_object THEN NULL; WHEN undefined_function THEN NULL; WHEN undefined_table THEN NULL; WHEN datatype_mismatch THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.delivery_orders ADD COLUMN IF NOT EXISTS "priority_fee" numeric(10,2);
EXCEPTION WHEN undefined_object THEN NULL; WHEN undefined_function THEN NULL; WHEN undefined_table THEN NULL; WHEN datatype_mismatch THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.delivery_orders ADD COLUMN IF NOT EXISTS "created_by" uuid;
EXCEPTION WHEN undefined_object THEN NULL; WHEN undefined_function THEN NULL; WHEN undefined_table THEN NULL; WHEN datatype_mismatch THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.delivery_orders ADD COLUMN IF NOT EXISTS "estimated_price" numeric;
EXCEPTION WHEN undefined_object THEN NULL; WHEN undefined_function THEN NULL; WHEN undefined_table THEN NULL; WHEN datatype_mismatch THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.delivery_orders ADD COLUMN IF NOT EXISTS "pickup_address" text;
EXCEPTION WHEN undefined_object THEN NULL; WHEN undefined_function THEN NULL; WHEN undefined_table THEN NULL; WHEN datatype_mismatch THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.delivery_orders ADD COLUMN IF NOT EXISTS "dropoff_address" text;
EXCEPTION WHEN undefined_object THEN NULL; WHEN undefined_function THEN NULL; WHEN undefined_table THEN NULL; WHEN datatype_mismatch THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.delivery_orders ADD COLUMN IF NOT EXISTS "price" numeric;
EXCEPTION WHEN undefined_object THEN NULL; WHEN undefined_function THEN NULL; WHEN undefined_table THEN NULL; WHEN datatype_mismatch THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.delivery_orders ADD COLUMN IF NOT EXISTS "pickup_h3_8" text;
EXCEPTION WHEN undefined_object THEN NULL; WHEN undefined_function THEN NULL; WHEN undefined_table THEN NULL; WHEN datatype_mismatch THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.delivery_orders ADD COLUMN IF NOT EXISTS "drop_h3_8" text;
EXCEPTION WHEN undefined_object THEN NULL; WHEN undefined_function THEN NULL; WHEN undefined_table THEN NULL; WHEN datatype_mismatch THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.delivery_orders ADD COLUMN IF NOT EXISTS "pricing_code" text;
EXCEPTION WHEN undefined_object THEN NULL; WHEN undefined_function THEN NULL; WHEN undefined_table THEN NULL; WHEN datatype_mismatch THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.delivery_orders ADD COLUMN IF NOT EXISTS "currency_code" text DEFAULT 'BRL'::text;
EXCEPTION WHEN undefined_object THEN NULL; WHEN undefined_function THEN NULL; WHEN undefined_table THEN NULL; WHEN datatype_mismatch THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.delivery_orders ADD COLUMN IF NOT EXISTS "merchant_base_amount" numeric(12,2);
EXCEPTION WHEN undefined_object THEN NULL; WHEN undefined_function THEN NULL; WHEN undefined_table THEN NULL; WHEN datatype_mismatch THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.delivery_orders ADD COLUMN IF NOT EXISTS "courier_base_amount" numeric(12,2);
EXCEPTION WHEN undefined_object THEN NULL; WHEN undefined_function THEN NULL; WHEN undefined_table THEN NULL; WHEN datatype_mismatch THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.delivery_orders ADD COLUMN IF NOT EXISTS "per_km_amount" numeric(12,2);
EXCEPTION WHEN undefined_object THEN NULL; WHEN undefined_function THEN NULL; WHEN undefined_table THEN NULL; WHEN datatype_mismatch THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.delivery_orders ADD COLUMN IF NOT EXISTS "merchant_total_amount" numeric(12,2);
EXCEPTION WHEN undefined_object THEN NULL; WHEN undefined_function THEN NULL; WHEN undefined_table THEN NULL; WHEN datatype_mismatch THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.delivery_orders ADD COLUMN IF NOT EXISTS "courier_gross_amount" numeric(12,2);
EXCEPTION WHEN undefined_object THEN NULL; WHEN undefined_function THEN NULL; WHEN undefined_table THEN NULL; WHEN datatype_mismatch THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.delivery_orders ADD COLUMN IF NOT EXISTS "platform_gross_margin_amount" numeric(12,2);
EXCEPTION WHEN undefined_object THEN NULL; WHEN undefined_function THEN NULL; WHEN undefined_table THEN NULL; WHEN datatype_mismatch THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.delivery_orders ADD COLUMN IF NOT EXISTS "notes" text;
EXCEPTION WHEN undefined_object THEN NULL; WHEN undefined_function THEN NULL; WHEN undefined_table THEN NULL; WHEN datatype_mismatch THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.delivery_orders ADD COLUMN IF NOT EXISTS "product_name_snapshot" text;
EXCEPTION WHEN undefined_object THEN NULL; WHEN undefined_function THEN NULL; WHEN undefined_table THEN NULL; WHEN datatype_mismatch THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.delivery_orders ADD COLUMN IF NOT EXISTS "product_code_snapshot" text;
EXCEPTION WHEN undefined_object THEN NULL; WHEN undefined_function THEN NULL; WHEN undefined_table THEN NULL; WHEN datatype_mismatch THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.driver_whatsapp_groups ADD COLUMN IF NOT EXISTS "members_count" integer;
EXCEPTION WHEN undefined_object THEN NULL; WHEN undefined_function THEN NULL; WHEN undefined_table THEN NULL; WHEN datatype_mismatch THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.driver_whatsapp_groups ADD COLUMN IF NOT EXISTS "validation_status" text DEFAULT 'aguardando_qualificacao'::text;
EXCEPTION WHEN undefined_object THEN NULL; WHEN undefined_function THEN NULL; WHEN undefined_table THEN NULL; WHEN datatype_mismatch THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.driver_whatsapp_groups ADD COLUMN IF NOT EXISTS "is_active" boolean DEFAULT false;
EXCEPTION WHEN undefined_object THEN NULL; WHEN undefined_function THEN NULL; WHEN undefined_table THEN NULL; WHEN datatype_mismatch THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.driver_whatsapp_groups ADD COLUMN IF NOT EXISTS "valid_for_commission" boolean DEFAULT false;
EXCEPTION WHEN undefined_object THEN NULL; WHEN undefined_function THEN NULL; WHEN undefined_table THEN NULL; WHEN datatype_mismatch THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.driver_whatsapp_groups ADD COLUMN IF NOT EXISTS "invalid_reason" text;
EXCEPTION WHEN undefined_object THEN NULL; WHEN undefined_function THEN NULL; WHEN undefined_table THEN NULL; WHEN datatype_mismatch THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.driver_whatsapp_groups ADD COLUMN IF NOT EXISTS "last_checked_at" timestamp with time zone;
EXCEPTION WHEN undefined_object THEN NULL; WHEN undefined_function THEN NULL; WHEN undefined_table THEN NULL; WHEN datatype_mismatch THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.driver_whatsapp_groups ADD COLUMN IF NOT EXISTS "group_whatsapp_id" text;
EXCEPTION WHEN undefined_object THEN NULL; WHEN undefined_function THEN NULL; WHEN undefined_table THEN NULL; WHEN datatype_mismatch THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.driver_whatsapp_groups ADD COLUMN IF NOT EXISTS "group_hash" text;
EXCEPTION WHEN undefined_object THEN NULL; WHEN undefined_function THEN NULL; WHEN undefined_table THEN NULL; WHEN datatype_mismatch THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.driver_whatsapp_groups ADD COLUMN IF NOT EXISTS "admin_phone" text;
EXCEPTION WHEN undefined_object THEN NULL; WHEN undefined_function THEN NULL; WHEN undefined_table THEN NULL; WHEN datatype_mismatch THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.merchant_stores ADD COLUMN IF NOT EXISTS "cnpj" text;
EXCEPTION WHEN undefined_object THEN NULL; WHEN undefined_function THEN NULL; WHEN undefined_table THEN NULL; WHEN datatype_mismatch THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.merchant_stores ADD COLUMN IF NOT EXISTS "descricao" text;
EXCEPTION WHEN undefined_object THEN NULL; WHEN undefined_function THEN NULL; WHEN undefined_table THEN NULL; WHEN datatype_mismatch THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.merchant_stores ADD COLUMN IF NOT EXISTS "categoria_id" uuid;
EXCEPTION WHEN undefined_object THEN NULL; WHEN undefined_function THEN NULL; WHEN undefined_table THEN NULL; WHEN datatype_mismatch THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.merchant_stores ADD COLUMN IF NOT EXISTS "telefone" text;
EXCEPTION WHEN undefined_object THEN NULL; WHEN undefined_function THEN NULL; WHEN undefined_table THEN NULL; WHEN datatype_mismatch THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.merchant_stores ADD COLUMN IF NOT EXISTS "email" text;
EXCEPTION WHEN undefined_object THEN NULL; WHEN undefined_function THEN NULL; WHEN undefined_table THEN NULL; WHEN datatype_mismatch THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.merchant_stores ADD COLUMN IF NOT EXISTS "street" text;
EXCEPTION WHEN undefined_object THEN NULL; WHEN undefined_function THEN NULL; WHEN undefined_table THEN NULL; WHEN datatype_mismatch THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.merchant_stores ADD COLUMN IF NOT EXISTS "number" text;
EXCEPTION WHEN undefined_object THEN NULL; WHEN undefined_function THEN NULL; WHEN undefined_table THEN NULL; WHEN datatype_mismatch THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.merchant_stores ADD COLUMN IF NOT EXISTS "neighborhood" text;
EXCEPTION WHEN undefined_object THEN NULL; WHEN undefined_function THEN NULL; WHEN undefined_table THEN NULL; WHEN datatype_mismatch THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.merchant_stores ADD COLUMN IF NOT EXISTS "region" text;
EXCEPTION WHEN undefined_object THEN NULL; WHEN undefined_function THEN NULL; WHEN undefined_table THEN NULL; WHEN datatype_mismatch THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.merchant_stores ADD COLUMN IF NOT EXISTS "city" text;
EXCEPTION WHEN undefined_object THEN NULL; WHEN undefined_function THEN NULL; WHEN undefined_table THEN NULL; WHEN datatype_mismatch THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.merchant_stores ADD COLUMN IF NOT EXISTS "store_name" text;
EXCEPTION WHEN undefined_object THEN NULL; WHEN undefined_function THEN NULL; WHEN undefined_table THEN NULL; WHEN datatype_mismatch THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.merchant_stores ADD COLUMN IF NOT EXISTS "appearance" jsonb;
EXCEPTION WHEN undefined_object THEN NULL; WHEN undefined_function THEN NULL; WHEN undefined_table THEN NULL; WHEN datatype_mismatch THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.motoboy_profiles ADD COLUMN IF NOT EXISTS "state" text;
EXCEPTION WHEN undefined_object THEN NULL; WHEN undefined_function THEN NULL; WHEN undefined_table THEN NULL; WHEN datatype_mismatch THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.motoboy_profiles ADD COLUMN IF NOT EXISTS "city" text;
EXCEPTION WHEN undefined_object THEN NULL; WHEN undefined_function THEN NULL; WHEN undefined_table THEN NULL; WHEN datatype_mismatch THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.motoboy_profiles ADD COLUMN IF NOT EXISTS "vehicle_plate" text;
EXCEPTION WHEN undefined_object THEN NULL; WHEN undefined_function THEN NULL; WHEN undefined_table THEN NULL; WHEN datatype_mismatch THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.motoboy_profiles ADD COLUMN IF NOT EXISTS "vehicle_year" integer;
EXCEPTION WHEN undefined_object THEN NULL; WHEN undefined_function THEN NULL; WHEN undefined_table THEN NULL; WHEN datatype_mismatch THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.motoboy_profiles ADD COLUMN IF NOT EXISTS "vehicle_brand" text;
EXCEPTION WHEN undefined_object THEN NULL; WHEN undefined_function THEN NULL; WHEN undefined_table THEN NULL; WHEN datatype_mismatch THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.motoboy_profiles ADD COLUMN IF NOT EXISTS "vehicle_model" text;
EXCEPTION WHEN undefined_object THEN NULL; WHEN undefined_function THEN NULL; WHEN undefined_table THEN NULL; WHEN datatype_mismatch THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.motoboy_profiles ADD COLUMN IF NOT EXISTS "vehicle_color" text;
EXCEPTION WHEN undefined_object THEN NULL; WHEN undefined_function THEN NULL; WHEN undefined_table THEN NULL; WHEN datatype_mismatch THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.motoboy_profiles ADD COLUMN IF NOT EXISTS "bag_capacity" text;
EXCEPTION WHEN undefined_object THEN NULL; WHEN undefined_function THEN NULL; WHEN undefined_table THEN NULL; WHEN datatype_mismatch THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.motoboy_profiles ADD COLUMN IF NOT EXISTS "passenger_capacity" text;
EXCEPTION WHEN undefined_object THEN NULL; WHEN undefined_function THEN NULL; WHEN undefined_table THEN NULL; WHEN datatype_mismatch THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.motoboy_profiles ADD COLUMN IF NOT EXISTS "is_available" boolean DEFAULT true;
EXCEPTION WHEN undefined_object THEN NULL; WHEN undefined_function THEN NULL; WHEN undefined_table THEN NULL; WHEN datatype_mismatch THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.motoboy_profiles ADD COLUMN IF NOT EXISTS "current_lat" double precision;
EXCEPTION WHEN undefined_object THEN NULL; WHEN undefined_function THEN NULL; WHEN undefined_table THEN NULL; WHEN datatype_mismatch THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.motoboy_profiles ADD COLUMN IF NOT EXISTS "current_lng" double precision;
EXCEPTION WHEN undefined_object THEN NULL; WHEN undefined_function THEN NULL; WHEN undefined_table THEN NULL; WHEN datatype_mismatch THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.motoboy_profiles ADD COLUMN IF NOT EXISTS "estado_atuacao" text;
EXCEPTION WHEN undefined_object THEN NULL; WHEN undefined_function THEN NULL; WHEN undefined_table THEN NULL; WHEN datatype_mismatch THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.motoboy_profiles ADD COLUMN IF NOT EXISTS "cidade_atuacao" text;
EXCEPTION WHEN undefined_object THEN NULL; WHEN undefined_function THEN NULL; WHEN undefined_table THEN NULL; WHEN datatype_mismatch THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.motoboy_profiles ADD COLUMN IF NOT EXISTS "placa" text;
EXCEPTION WHEN undefined_object THEN NULL; WHEN undefined_function THEN NULL; WHEN undefined_table THEN NULL; WHEN datatype_mismatch THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.motoboy_profiles ADD COLUMN IF NOT EXISTS "ano" integer;
EXCEPTION WHEN undefined_object THEN NULL; WHEN undefined_function THEN NULL; WHEN undefined_table THEN NULL; WHEN datatype_mismatch THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.motoboy_profiles ADD COLUMN IF NOT EXISTS "marca" text;
EXCEPTION WHEN undefined_object THEN NULL; WHEN undefined_function THEN NULL; WHEN undefined_table THEN NULL; WHEN datatype_mismatch THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.motoboy_profiles ADD COLUMN IF NOT EXISTS "modelo" text;
EXCEPTION WHEN undefined_object THEN NULL; WHEN undefined_function THEN NULL; WHEN undefined_table THEN NULL; WHEN datatype_mismatch THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.motoboy_profiles ADD COLUMN IF NOT EXISTS "cor_moto" text;
EXCEPTION WHEN undefined_object THEN NULL; WHEN undefined_function THEN NULL; WHEN undefined_table THEN NULL; WHEN datatype_mismatch THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.motoboy_profiles ADD COLUMN IF NOT EXISTS "region_id" uuid;
EXCEPTION WHEN undefined_object THEN NULL; WHEN undefined_function THEN NULL; WHEN undefined_table THEN NULL; WHEN datatype_mismatch THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.motoboy_profiles ADD COLUMN IF NOT EXISTS "bairro" text;
EXCEPTION WHEN undefined_object THEN NULL; WHEN undefined_function THEN NULL; WHEN undefined_table THEN NULL; WHEN datatype_mismatch THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.motoboy_profiles ADD COLUMN IF NOT EXISTS "region" text;
EXCEPTION WHEN undefined_object THEN NULL; WHEN undefined_function THEN NULL; WHEN undefined_table THEN NULL; WHEN datatype_mismatch THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.motoboy_profiles ADD COLUMN IF NOT EXISTS "profile_photo_url" text;
EXCEPTION WHEN undefined_object THEN NULL; WHEN undefined_function THEN NULL; WHEN undefined_table THEN NULL; WHEN datatype_mismatch THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.motoboy_profiles ADD COLUMN IF NOT EXISTS "cpf" text;
EXCEPTION WHEN undefined_object THEN NULL; WHEN undefined_function THEN NULL; WHEN undefined_table THEN NULL; WHEN datatype_mismatch THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.motoboy_profiles ADD COLUMN IF NOT EXISTS "birth_date" date;
EXCEPTION WHEN undefined_object THEN NULL; WHEN undefined_function THEN NULL; WHEN undefined_table THEN NULL; WHEN datatype_mismatch THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.motoboy_profiles ADD COLUMN IF NOT EXISTS "latitude_residencia" double precision;
EXCEPTION WHEN undefined_object THEN NULL; WHEN undefined_function THEN NULL; WHEN undefined_table THEN NULL; WHEN datatype_mismatch THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.motoboy_profiles ADD COLUMN IF NOT EXISTS "longitude_residencia" double precision;
EXCEPTION WHEN undefined_object THEN NULL; WHEN undefined_function THEN NULL; WHEN undefined_table THEN NULL; WHEN datatype_mismatch THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.motoboy_profiles ADD COLUMN IF NOT EXISTS "endereco_residencia" text;
EXCEPTION WHEN undefined_object THEN NULL; WHEN undefined_function THEN NULL; WHEN undefined_table THEN NULL; WHEN datatype_mismatch THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.motoboy_profiles ADD COLUMN IF NOT EXISTS "aceite_cnh_epi_at" timestamp with time zone;
EXCEPTION WHEN undefined_object THEN NULL; WHEN undefined_function THEN NULL; WHEN undefined_table THEN NULL; WHEN datatype_mismatch THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.motoboy_profiles ADD COLUMN IF NOT EXISTS "aceite_prestador_at" timestamp with time zone;
EXCEPTION WHEN undefined_object THEN NULL; WHEN undefined_function THEN NULL; WHEN undefined_table THEN NULL; WHEN datatype_mismatch THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.posting_history ADD COLUMN IF NOT EXISTS "created_by_user_id" uuid;
EXCEPTION WHEN undefined_object THEN NULL; WHEN undefined_function THEN NULL; WHEN undefined_table THEN NULL; WHEN datatype_mismatch THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.posting_history ADD COLUMN IF NOT EXISTS "operator_user_id" uuid;
EXCEPTION WHEN undefined_object THEN NULL; WHEN undefined_function THEN NULL; WHEN undefined_table THEN NULL; WHEN datatype_mismatch THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.posting_history ADD COLUMN IF NOT EXISTS "reviewed_by_user_id" uuid;
EXCEPTION WHEN undefined_object THEN NULL; WHEN undefined_function THEN NULL; WHEN undefined_table THEN NULL; WHEN datatype_mismatch THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.posting_history ADD COLUMN IF NOT EXISTS "whatsapp_group_id" uuid;
EXCEPTION WHEN undefined_object THEN NULL; WHEN undefined_function THEN NULL; WHEN undefined_table THEN NULL; WHEN datatype_mismatch THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.posting_history ADD COLUMN IF NOT EXISTS "merchant_store_id" uuid;
EXCEPTION WHEN undefined_object THEN NULL; WHEN undefined_function THEN NULL; WHEN undefined_table THEN NULL; WHEN datatype_mismatch THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.posting_history ADD COLUMN IF NOT EXISTS "product_id" uuid;
EXCEPTION WHEN undefined_object THEN NULL; WHEN undefined_function THEN NULL; WHEN undefined_table THEN NULL; WHEN datatype_mismatch THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.posting_history ADD COLUMN IF NOT EXISTS "campaign_type" text;
EXCEPTION WHEN undefined_object THEN NULL; WHEN undefined_function THEN NULL; WHEN undefined_table THEN NULL; WHEN datatype_mismatch THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.posting_history ADD COLUMN IF NOT EXISTS "title" text;
EXCEPTION WHEN undefined_object THEN NULL; WHEN undefined_function THEN NULL; WHEN undefined_table THEN NULL; WHEN datatype_mismatch THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.posting_history ADD COLUMN IF NOT EXISTS "message_text" text;
EXCEPTION WHEN undefined_object THEN NULL; WHEN undefined_function THEN NULL; WHEN undefined_table THEN NULL; WHEN datatype_mismatch THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.posting_history ADD COLUMN IF NOT EXISTS "media_url" text;
EXCEPTION WHEN undefined_object THEN NULL; WHEN undefined_function THEN NULL; WHEN undefined_table THEN NULL; WHEN datatype_mismatch THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.posting_history ADD COLUMN IF NOT EXISTS "target_city" text;
EXCEPTION WHEN undefined_object THEN NULL; WHEN undefined_function THEN NULL; WHEN undefined_table THEN NULL; WHEN datatype_mismatch THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.posting_history ADD COLUMN IF NOT EXISTS "target_region" text;
EXCEPTION WHEN undefined_object THEN NULL; WHEN undefined_function THEN NULL; WHEN undefined_table THEN NULL; WHEN datatype_mismatch THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.posting_history ADD COLUMN IF NOT EXISTS "queue_status_before" text;
EXCEPTION WHEN undefined_object THEN NULL; WHEN undefined_function THEN NULL; WHEN undefined_table THEN NULL; WHEN datatype_mismatch THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.posting_history ADD COLUMN IF NOT EXISTS "final_status" text DEFAULT 'posted'::text;
EXCEPTION WHEN undefined_object THEN NULL; WHEN undefined_function THEN NULL; WHEN undefined_table THEN NULL; WHEN datatype_mismatch THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.posting_history ADD COLUMN IF NOT EXISTS "execution_notes" text;
EXCEPTION WHEN undefined_object THEN NULL; WHEN undefined_function THEN NULL; WHEN undefined_table THEN NULL; WHEN datatype_mismatch THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.posting_history ADD COLUMN IF NOT EXISTS "scheduled_for" timestamp with time zone;
EXCEPTION WHEN undefined_object THEN NULL; WHEN undefined_function THEN NULL; WHEN undefined_table THEN NULL; WHEN datatype_mismatch THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.posting_history ADD COLUMN IF NOT EXISTS "available_from" timestamp with time zone;
EXCEPTION WHEN undefined_object THEN NULL; WHEN undefined_function THEN NULL; WHEN undefined_table THEN NULL; WHEN datatype_mismatch THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.posting_history ADD COLUMN IF NOT EXISTS "available_until" timestamp with time zone;
EXCEPTION WHEN undefined_object THEN NULL; WHEN undefined_function THEN NULL; WHEN undefined_table THEN NULL; WHEN datatype_mismatch THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.posting_history ADD COLUMN IF NOT EXISTS "created_at" timestamp with time zone DEFAULT now();
EXCEPTION WHEN undefined_object THEN NULL; WHEN undefined_function THEN NULL; WHEN undefined_table THEN NULL; WHEN datatype_mismatch THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.posting_history ADD COLUMN IF NOT EXISTS "proof_url" text;
EXCEPTION WHEN undefined_object THEN NULL; WHEN undefined_function THEN NULL; WHEN undefined_table THEN NULL; WHEN datatype_mismatch THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.posting_history ADD COLUMN IF NOT EXISTS "proof_type" text DEFAULT 'none'::text;
EXCEPTION WHEN undefined_object THEN NULL; WHEN undefined_function THEN NULL; WHEN undefined_table THEN NULL; WHEN datatype_mismatch THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.posting_history ADD COLUMN IF NOT EXISTS "proof_uploaded_at" timestamp with time zone;
EXCEPTION WHEN undefined_object THEN NULL; WHEN undefined_function THEN NULL; WHEN undefined_table THEN NULL; WHEN datatype_mismatch THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.posting_history ADD COLUMN IF NOT EXISTS "proof_storage_path" text;
EXCEPTION WHEN undefined_object THEN NULL; WHEN undefined_function THEN NULL; WHEN undefined_table THEN NULL; WHEN datatype_mismatch THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS "legal_compliant" boolean DEFAULT false;
EXCEPTION WHEN undefined_object THEN NULL; WHEN undefined_function THEN NULL; WHEN undefined_table THEN NULL; WHEN datatype_mismatch THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS "whatsapp" text;
EXCEPTION WHEN undefined_object THEN NULL; WHEN undefined_function THEN NULL; WHEN undefined_table THEN NULL; WHEN datatype_mismatch THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS "store_latitude" double precision;
EXCEPTION WHEN undefined_object THEN NULL; WHEN undefined_function THEN NULL; WHEN undefined_table THEN NULL; WHEN datatype_mismatch THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS "store_longitude" double precision;
EXCEPTION WHEN undefined_object THEN NULL; WHEN undefined_function THEN NULL; WHEN undefined_table THEN NULL; WHEN datatype_mismatch THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS "store_address" text;
EXCEPTION WHEN undefined_object THEN NULL; WHEN undefined_function THEN NULL; WHEN undefined_table THEN NULL; WHEN datatype_mismatch THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS "bairro" text;
EXCEPTION WHEN undefined_object THEN NULL; WHEN undefined_function THEN NULL; WHEN undefined_table THEN NULL; WHEN datatype_mismatch THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS "categoria" text;
EXCEPTION WHEN undefined_object THEN NULL; WHEN undefined_function THEN NULL; WHEN undefined_table THEN NULL; WHEN datatype_mismatch THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS "cep" text;
EXCEPTION WHEN undefined_object THEN NULL; WHEN undefined_function THEN NULL; WHEN undefined_table THEN NULL; WHEN datatype_mismatch THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS "rua" text;
EXCEPTION WHEN undefined_object THEN NULL; WHEN undefined_function THEN NULL; WHEN undefined_table THEN NULL; WHEN datatype_mismatch THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS "numero" text;
EXCEPTION WHEN undefined_object THEN NULL; WHEN undefined_function THEN NULL; WHEN undefined_table THEN NULL; WHEN datatype_mismatch THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS "cpf_cnpj" text;
EXCEPTION WHEN undefined_object THEN NULL; WHEN undefined_function THEN NULL; WHEN undefined_table THEN NULL; WHEN datatype_mismatch THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS "nome_loja" text;
EXCEPTION WHEN undefined_object THEN NULL; WHEN undefined_function THEN NULL; WHEN undefined_table THEN NULL; WHEN datatype_mismatch THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS "logo_url" text;
EXCEPTION WHEN undefined_object THEN NULL; WHEN undefined_function THEN NULL; WHEN undefined_table THEN NULL; WHEN datatype_mismatch THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS "is_admin" boolean DEFAULT false;
EXCEPTION WHEN undefined_object THEN NULL; WHEN undefined_function THEN NULL; WHEN undefined_table THEN NULL; WHEN datatype_mismatch THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.support_tickets ADD COLUMN IF NOT EXISTS "category" text;
EXCEPTION WHEN undefined_object THEN NULL; WHEN undefined_function THEN NULL; WHEN undefined_table THEN NULL; WHEN datatype_mismatch THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.support_tickets ADD COLUMN IF NOT EXISTS "subject" text;
EXCEPTION WHEN undefined_object THEN NULL; WHEN undefined_function THEN NULL; WHEN undefined_table THEN NULL; WHEN datatype_mismatch THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.support_tickets ADD COLUMN IF NOT EXISTS "message" text;
EXCEPTION WHEN undefined_object THEN NULL; WHEN undefined_function THEN NULL; WHEN undefined_table THEN NULL; WHEN datatype_mismatch THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.support_tickets ADD COLUMN IF NOT EXISTS "last_message_at" timestamp with time zone DEFAULT now();
EXCEPTION WHEN undefined_object THEN NULL; WHEN undefined_function THEN NULL; WHEN undefined_table THEN NULL; WHEN datatype_mismatch THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.support_tickets ADD COLUMN IF NOT EXISTS "assigned_admin" uuid;
EXCEPTION WHEN undefined_object THEN NULL; WHEN undefined_function THEN NULL; WHEN undefined_table THEN NULL; WHEN datatype_mismatch THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.support_tickets ADD COLUMN IF NOT EXISTS "ai_last_response_at" timestamp with time zone;
EXCEPTION WHEN undefined_object THEN NULL; WHEN undefined_function THEN NULL; WHEN undefined_table THEN NULL; WHEN datatype_mismatch THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.support_tickets ADD COLUMN IF NOT EXISTS "ai_confidence" numeric(5,2);
EXCEPTION WHEN undefined_object THEN NULL; WHEN undefined_function THEN NULL; WHEN undefined_table THEN NULL; WHEN datatype_mismatch THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.ticket_messages ADD COLUMN IF NOT EXISTS "sender_id" uuid;
EXCEPTION WHEN undefined_object THEN NULL; WHEN undefined_function THEN NULL; WHEN undefined_table THEN NULL; WHEN datatype_mismatch THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.ticket_messages ADD COLUMN IF NOT EXISTS "sender_type" text;
EXCEPTION WHEN undefined_object THEN NULL; WHEN undefined_function THEN NULL; WHEN undefined_table THEN NULL; WHEN datatype_mismatch THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.ticket_messages ADD COLUMN IF NOT EXISTS "ai_model" text;
EXCEPTION WHEN undefined_object THEN NULL; WHEN undefined_function THEN NULL; WHEN undefined_table THEN NULL; WHEN datatype_mismatch THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.ticket_messages ADD COLUMN IF NOT EXISTS "ai_confidence" numeric(5,2);
EXCEPTION WHEN undefined_object THEN NULL; WHEN undefined_function THEN NULL; WHEN undefined_table THEN NULL; WHEN datatype_mismatch THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.user_roles ADD COLUMN IF NOT EXISTS "is_active" boolean DEFAULT true;
EXCEPTION WHEN undefined_object THEN NULL; WHEN undefined_function THEN NULL; WHEN undefined_table THEN NULL; WHEN datatype_mismatch THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.user_roles ADD COLUMN IF NOT EXISTS "updated_at" timestamp with time zone DEFAULT now();
EXCEPTION WHEN undefined_object THEN NULL; WHEN undefined_function THEN NULL; WHEN undefined_table THEN NULL; WHEN datatype_mismatch THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.whatsapp_groups ADD COLUMN IF NOT EXISTS "owner_user_id" uuid;
EXCEPTION WHEN undefined_object THEN NULL; WHEN undefined_function THEN NULL; WHEN undefined_table THEN NULL; WHEN datatype_mismatch THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.whatsapp_groups ADD COLUMN IF NOT EXISTS "motoboy_profile_id" uuid;
EXCEPTION WHEN undefined_object THEN NULL; WHEN undefined_function THEN NULL; WHEN undefined_table THEN NULL; WHEN datatype_mismatch THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.whatsapp_groups ADD COLUMN IF NOT EXISTS "region_id" uuid;
EXCEPTION WHEN undefined_object THEN NULL; WHEN undefined_function THEN NULL; WHEN undefined_table THEN NULL; WHEN datatype_mismatch THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.whatsapp_groups ADD COLUMN IF NOT EXISTS "city_id" uuid;
EXCEPTION WHEN undefined_object THEN NULL; WHEN undefined_function THEN NULL; WHEN undefined_table THEN NULL; WHEN datatype_mismatch THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.whatsapp_groups ADD COLUMN IF NOT EXISTS "group_name" text;
EXCEPTION WHEN undefined_object THEN NULL; WHEN undefined_function THEN NULL; WHEN undefined_table THEN NULL; WHEN datatype_mismatch THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.whatsapp_groups ADD COLUMN IF NOT EXISTS "group_link" text;
EXCEPTION WHEN undefined_object THEN NULL; WHEN undefined_function THEN NULL; WHEN undefined_table THEN NULL; WHEN datatype_mismatch THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.whatsapp_groups ADD COLUMN IF NOT EXISTS "group_code" text;
EXCEPTION WHEN undefined_object THEN NULL; WHEN undefined_function THEN NULL; WHEN undefined_table THEN NULL; WHEN datatype_mismatch THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.whatsapp_groups ADD COLUMN IF NOT EXISTS "neighborhood" text;
EXCEPTION WHEN undefined_object THEN NULL; WHEN undefined_function THEN NULL; WHEN undefined_table THEN NULL; WHEN datatype_mismatch THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.whatsapp_groups ADD COLUMN IF NOT EXISTS "city_name" text;
EXCEPTION WHEN undefined_object THEN NULL; WHEN undefined_function THEN NULL; WHEN undefined_table THEN NULL; WHEN datatype_mismatch THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.whatsapp_groups ADD COLUMN IF NOT EXISTS "state_code" text;
EXCEPTION WHEN undefined_object THEN NULL; WHEN undefined_function THEN NULL; WHEN undefined_table THEN NULL; WHEN datatype_mismatch THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.whatsapp_groups ADD COLUMN IF NOT EXISTS "members_count" integer DEFAULT 0;
EXCEPTION WHEN undefined_object THEN NULL; WHEN undefined_function THEN NULL; WHEN undefined_table THEN NULL; WHEN datatype_mismatch THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.whatsapp_groups ADD COLUMN IF NOT EXISTS "is_active" boolean DEFAULT true;
EXCEPTION WHEN undefined_object THEN NULL; WHEN undefined_function THEN NULL; WHEN undefined_table THEN NULL; WHEN datatype_mismatch THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.whatsapp_groups ADD COLUMN IF NOT EXISTS "is_valid" boolean DEFAULT false;
EXCEPTION WHEN undefined_object THEN NULL; WHEN undefined_function THEN NULL; WHEN undefined_table THEN NULL; WHEN datatype_mismatch THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.whatsapp_groups ADD COLUMN IF NOT EXISTS "validation_status" text DEFAULT 'pending'::text;
EXCEPTION WHEN undefined_object THEN NULL; WHEN undefined_function THEN NULL; WHEN undefined_table THEN NULL; WHEN datatype_mismatch THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.whatsapp_groups ADD COLUMN IF NOT EXISTS "invalid_reason" text;
EXCEPTION WHEN undefined_object THEN NULL; WHEN undefined_function THEN NULL; WHEN undefined_table THEN NULL; WHEN datatype_mismatch THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.whatsapp_groups ADD COLUMN IF NOT EXISTS "last_posted_at" timestamp with time zone;
EXCEPTION WHEN undefined_object THEN NULL; WHEN undefined_function THEN NULL; WHEN undefined_table THEN NULL; WHEN datatype_mismatch THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.whatsapp_groups ADD COLUMN IF NOT EXISTS "last_checked_at" timestamp with time zone;
EXCEPTION WHEN undefined_object THEN NULL; WHEN undefined_function THEN NULL; WHEN undefined_table THEN NULL; WHEN datatype_mismatch THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.whatsapp_groups ADD COLUMN IF NOT EXISTS "last_audited_at" timestamp with time zone;
EXCEPTION WHEN undefined_object THEN NULL; WHEN undefined_function THEN NULL; WHEN undefined_table THEN NULL; WHEN datatype_mismatch THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.whatsapp_groups ADD COLUMN IF NOT EXISTS "valid_for_commission" boolean DEFAULT false;
EXCEPTION WHEN undefined_object THEN NULL; WHEN undefined_function THEN NULL; WHEN undefined_table THEN NULL; WHEN datatype_mismatch THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.whatsapp_groups ADD COLUMN IF NOT EXISTS "notes" text;
EXCEPTION WHEN undefined_object THEN NULL; WHEN undefined_function THEN NULL; WHEN undefined_table THEN NULL; WHEN datatype_mismatch THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.whatsapp_groups ADD COLUMN IF NOT EXISTS "territory_id" uuid;
EXCEPTION WHEN undefined_object THEN NULL; WHEN undefined_function THEN NULL; WHEN undefined_table THEN NULL; WHEN datatype_mismatch THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.whatsapp_groups ADD COLUMN IF NOT EXISTS "latitude" double precision;
EXCEPTION WHEN undefined_object THEN NULL; WHEN undefined_function THEN NULL; WHEN undefined_table THEN NULL; WHEN datatype_mismatch THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.whatsapp_groups ADD COLUMN IF NOT EXISTS "longitude" double precision;
EXCEPTION WHEN undefined_object THEN NULL; WHEN undefined_function THEN NULL; WHEN undefined_table THEN NULL; WHEN datatype_mismatch THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.whatsapp_groups ADD COLUMN IF NOT EXISTS "link_status" text;
EXCEPTION WHEN undefined_object THEN NULL; WHEN undefined_function THEN NULL; WHEN undefined_table THEN NULL; WHEN datatype_mismatch THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.whatsapp_groups ADD COLUMN IF NOT EXISTS "link_verified_at" timestamp with time zone;
EXCEPTION WHEN undefined_object THEN NULL; WHEN undefined_function THEN NULL; WHEN undefined_table THEN NULL; WHEN datatype_mismatch THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.whatsapp_groups ADD COLUMN IF NOT EXISTS "real_name" text;
EXCEPTION WHEN undefined_object THEN NULL; WHEN undefined_function THEN NULL; WHEN undefined_table THEN NULL; WHEN datatype_mismatch THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.whatsapp_groups ADD COLUMN IF NOT EXISTS "photo_url" text;
EXCEPTION WHEN undefined_object THEN NULL; WHEN undefined_function THEN NULL; WHEN undefined_table THEN NULL; WHEN datatype_mismatch THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.whatsapp_groups ADD COLUMN IF NOT EXISTS "profile_kind" text DEFAULT 'motoboy'::text;
EXCEPTION WHEN undefined_object THEN NULL; WHEN undefined_function THEN NULL; WHEN undefined_table THEN NULL; WHEN datatype_mismatch THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.whatsapp_groups ADD COLUMN IF NOT EXISTS "group_whatsapp_id" text;
EXCEPTION WHEN undefined_object THEN NULL; WHEN undefined_function THEN NULL; WHEN undefined_table THEN NULL; WHEN datatype_mismatch THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.whatsapp_groups ADD COLUMN IF NOT EXISTS "group_hash" text;
EXCEPTION WHEN undefined_object THEN NULL; WHEN undefined_function THEN NULL; WHEN undefined_table THEN NULL; WHEN datatype_mismatch THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.whatsapp_groups ADD COLUMN IF NOT EXISTS "admin_phone" text;
EXCEPTION WHEN undefined_object THEN NULL; WHEN undefined_function THEN NULL; WHEN undefined_table THEN NULL; WHEN datatype_mismatch THEN NULL; END $$;
-- === ORION-480: colunas transitórias de whatsapp_groups usadas em 20260308 (re-adicionadas com guard só em 20260705) ===
ALTER TABLE public.whatsapp_groups ADD COLUMN IF NOT EXISTS valid_for_commission boolean NOT NULL DEFAULT false;
ALTER TABLE public.whatsapp_groups ADD COLUMN IF NOT EXISTS is_valid boolean DEFAULT true;

-- === ORION-480: campaign_queue.source_id era TEXT na época de 20260309 (view compara p.id::text = source_id);
-- prod converteu para uuid manualmente depois. Replay usa text; paridade final restaura uuid. ===
DO $$ BEGIN
  ALTER TABLE public.campaign_queue ALTER COLUMN source_id TYPE text USING source_id::text;
EXCEPTION WHEN undefined_table THEN NULL; WHEN undefined_column THEN NULL; END $$;

-- (nota ORION-480: motoboy_campaign_inbox_view é dropada/recriada manualmente ao longo da história;
-- replays podem precisar de DROP VIEW manual entre 20260309133000 e 20260310170000 — sem ação aqui, posição errada)

-- === ORION-480: coluna transitória m1_billing_events.charged_value (usada pela view admineng.store_360 em 20260318; prod evoluiu para sale_value_cents) ===
ALTER TABLE public.m1_billing_events ADD COLUMN IF NOT EXISTS charged_value numeric DEFAULT 0;

-- === ORION-480: fantasmas delivery_requests/user_profiles (usados por admineng.store_360 em 20260318; ausentes em prod hoje) ===
CREATE TABLE IF NOT EXISTS public.delivery_requests (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  merchant_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.user_profiles (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid,
  profile_type text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- === ORION-480: colunas transitórias merchant_stores.phone/whatsapp (usadas por admineng.store_360 em 20260318; prod usa telefone) ===
ALTER TABLE public.merchant_stores ADD COLUMN IF NOT EXISTS phone text;
ALTER TABLE public.merchant_stores ADD COLUMN IF NOT EXISTS whatsapp text;

-- === ORION-480: fantasma system_events_log (SELECT diagnóstico em 20260331_DEBUG_AND_FORCE_DISPATCH) ===
CREATE TABLE IF NOT EXISTS public.system_events_log (id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY, event_type text, payload jsonb, created_at timestamptz NOT NULL DEFAULT now());

-- (nota ORION-480: migrations de fixup de 20260331/0401 inserem dados da "chamada real" 794468ab-...;
-- replays precisam de linha-stub em service_orders com esse id antes desse ponto — inserida ad-hoc nesta execução)

-- === ORION-480: labels históricos do enum service_order_status usados por 20260403_cleanup (prod evoluiu os labels) ===
ALTER TYPE public.service_order_status ADD VALUE IF NOT EXISTS 'pending';
ALTER TYPE public.service_order_status ADD VALUE IF NOT EXISTS 'cancelled';
ALTER TYPE public.service_order_status ADD VALUE IF NOT EXISTS 'completed';
ALTER TYPE public.service_order_status ADD VALUE IF NOT EXISTS 'finalizada';
ALTER TYPE public.service_order_status ADD VALUE IF NOT EXISTS 'cancelada';

-- === ORION-480: merchant_credit_products.credits_amount NOT NULL relaxado (seed 20260421 usa shape antigo; prod tinha tabela manual) ===
DO $$ BEGIN
  ALTER TABLE public.merchant_credit_products ALTER COLUMN credits_amount DROP NOT NULL;
EXCEPTION WHEN undefined_table THEN NULL; WHEN undefined_column THEN NULL; END $$;
DO $$ DECLARE r record; BEGIN
  IF to_regclass('public.merchant_credit_products') IS NOT NULL THEN
    FOR r IN SELECT a.attname FROM pg_attribute a
      LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum
      WHERE a.attrelid='public.merchant_credit_products'::regclass
        AND a.attnum>0 AND NOT a.attisdropped AND a.attnotnull AND d.adbin IS NULL AND a.attname <> 'id'
    LOOP EXECUTE format('ALTER TABLE public.merchant_credit_products ALTER COLUMN %I DROP NOT NULL', r.attname); END LOOP;
  END IF;
END $$;

-- === ORION-480: fantasma public.users (views de credit analytics em 20260422; ausente em prod hoje) ===
CREATE TABLE IF NOT EXISTS public.users (id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY, name text, email text, city text, state text, created_at timestamptz NOT NULL DEFAULT now());
ALTER TABLE public.stores ADD COLUMN IF NOT EXISTS store_name text;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS bairro text;
ALTER TABLE public.stores ADD COLUMN IF NOT EXISTS city text;
ALTER TABLE public.stores ADD COLUMN IF NOT EXISTS state text;
ALTER TABLE public.merchant_credit_ledger ADD COLUMN IF NOT EXISTS amount numeric;
ALTER TABLE public.merchant_credit_ledger ADD COLUMN IF NOT EXISTS entry_type text;
ALTER TABLE public.merchant_credit_balances ADD COLUMN IF NOT EXISTS available_credits integer DEFAULT 0;
CREATE OR REPLACE FUNCTION public.is_admin_user(p_user_id uuid DEFAULT auth.uid())
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT p_user_id IS NOT NULL AND (
    COALESCE((auth.jwt() -> 'app_metadata' ->> 'role') IN ('admin', 'ceo'), false)
    OR EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = p_user_id AND ur.role::text IN ('admin', 'ceo'))
    OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = p_user_id AND p.is_admin = true)
  );
$function$;

CREATE OR REPLACE FUNCTION public.is_financial_admin(p_user_id uuid DEFAULT auth.uid())
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  select public.is_admin_user(p_user_id);
$function$;
-- === ORION-480: extensões presentes em produção, exigidas por migrations posteriores (cron.schedule etc.) ===
CREATE EXTENSION IF NOT EXISTS "pg_cron";
CREATE EXTENSION IF NOT EXISTS "pg_net";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";
CREATE EXTENSION IF NOT EXISTS "citext";
CREATE EXTENSION IF NOT EXISTS "postgis";
ALTER TABLE public.real_estate_credit_packages ADD COLUMN IF NOT EXISTS credits_bonus integer DEFAULT 0;
ALTER TABLE public.posting_history
  ADD COLUMN IF NOT EXISTS attempt_count integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS campaign_title text,
  ADD COLUMN IF NOT EXISTS elapsed_ms integer,
  ADD COLUMN IF NOT EXISTS error_code text,
  ADD COLUMN IF NOT EXISTS group_name text,
  ADD COLUMN IF NOT EXISTS platform text,
  ADD COLUMN IF NOT EXISTS profile_type text,
  ADD COLUMN IF NOT EXISTS started_at timestamptz;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS display_name text, ADD COLUMN IF NOT EXISTS full_name text;
ALTER TABLE public.rate_limit_config ADD COLUMN IF NOT EXISTS cooldown_seconds integer DEFAULT 0;
CREATE OR REPLACE FUNCTION public.radar_norm(t text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
AS $function$
  SELECT translate(lower(trim(COALESCE(t,''))),
    'áàâãäéèêëíìîïóòôõöúùûüçñÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇÑ',
    'aaaaaeeeeiiiiooooouuuucnaaaaaeeeeiiiiooooouuuucn')
$function$;CREATE OR REPLACE FUNCTION public.orion_ai_prompt_set(p_chave text, p_texto text, p_motivo text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_versao int;
BEGIN
  IF NOT mp_is_admin() AND session_user <> 'postgres' THEN
    RAISE EXCEPTION 'Apenas administradores';
  END IF;
  SELECT coalesce(max(versao),0) + 1 INTO v_versao FROM orion_ai_prompts WHERE chave = p_chave;
  UPDATE orion_ai_prompts SET ativo = false WHERE chave = p_chave AND ativo;
  INSERT INTO orion_ai_prompts (chave, versao, system_text, ativo, autor, motivo)
  VALUES (p_chave, v_versao, p_texto, true, auth.uid(), p_motivo);
  RETURN jsonb_build_object('ok', true, 'chave', p_chave, 'versao', v_versao);
END; $function$;CREATE TABLE IF NOT EXISTS public.orion_ai_prompts (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "chave" text NOT NULL,
  "versao" integer NOT NULL,
  "system_text" text NOT NULL,
  "ativo" boolean DEFAULT false NOT NULL,
  "autor" uuid,
  "motivo" text,
  "criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
DO $$ BEGIN
  ALTER TABLE public.orion_ai_prompts ADD CONSTRAINT orion_ai_prompts_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.orion_ai_prompts ADD CONSTRAINT orion_ai_prompts_versao UNIQUE (chave, versao);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $$;CREATE TABLE IF NOT EXISTS public.publication_metrics (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "request_id" uuid,
  "pacote_id" uuid,
  "canal" text,
  "cidade" text,
  "categoria" text,
  "views" integer DEFAULT 0,
  "cliques" integer DEFAULT 0,
  "contatos" integer DEFAULT 0,
  "conversoes" integer DEFAULT 0,
  "registrado_em" timestamp with time zone DEFAULT now() NOT NULL
);
DO $$ BEGIN
  ALTER TABLE public.publication_metrics ADD CONSTRAINT publication_metrics_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $$;CREATE TABLE IF NOT EXISTS public.orion_growth_scores (
  "cidade" text NOT NULL,
  "uf" text,
  "score" integer NOT NULL,
  "classificacao" text NOT NULL,
  "detalhe" jsonb NOT NULL,
  "calculado_em" timestamp with time zone DEFAULT now() NOT NULL
);
DO $$ BEGIN
  ALTER TABLE public.orion_growth_scores ADD CONSTRAINT orion_growth_scores_pkey PRIMARY KEY (cidade);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $$;CREATE OR REPLACE FUNCTION public.orion_norm(t text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
AS $function$
  SELECT trim(lower(translate(coalesce(t,''),
    'ÁÀÂÃÄáàâãäÉÈÊËéèêëÍÌÎÏíìîïÓÒÔÕÖóòôõöÚÙÛÜúùûüÇç',
    'AAAAAaaaaaEEEEeeeeIIIIiiiiOOOOOoooooUUUUuuuuCc')));
$function$;CREATE TABLE IF NOT EXISTS public.orion_fraud_events (
  "fraud_id" bigint NOT NULL,
  "detected_at" timestamp with time zone DEFAULT now() NOT NULL,
  "tipo" text NOT NULL,
  "categoria" text NOT NULL,
  "entidade_tipo" text NOT NULL,
  "entidade_id" text NOT NULL,
  "user_id" uuid,
  "merchant_id" uuid,
  "delivery_id" uuid,
  "order_id" uuid,
  "severity" text DEFAULT 'baixa'::text NOT NULL,
  "fraud_score" integer DEFAULT 0 NOT NULL,
  "financial_risk" integer DEFAULT 0 NOT NULL,
  "trust_impact" integer DEFAULT 0 NOT NULL,
  "confidence" integer DEFAULT 0 NOT NULL,
  "valor_envolvido" numeric DEFAULT 0 NOT NULL,
  "evidencias" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "status" text DEFAULT 'detectada'::text NOT NULL,
  "dedupe_key" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
DO $$ BEGIN
  ALTER TABLE public.orion_fraud_events ADD CONSTRAINT orion_fraud_events_dedupe_key_key UNIQUE (dedupe_key);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.orion_fraud_events ADD CONSTRAINT orion_fraud_events_pkey PRIMARY KEY (fraud_id);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $$;
CREATE TABLE IF NOT EXISTS public.orion_fraud_patterns (
  "pattern_key" text NOT NULL,
  "descricao" text NOT NULL,
  "frequencia" integer DEFAULT 0 NOT NULL,
  "risco" integer DEFAULT 0 NOT NULL,
  "ia_responsavel" text DEFAULT 'fraud_detection'::text NOT NULL,
  "ultima_ocorrencia" timestamp with time zone,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
DO $$ BEGIN
  ALTER TABLE public.orion_fraud_patterns ADD CONSTRAINT orion_fraud_patterns_pkey PRIMARY KEY (pattern_key);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $$;
CREATE TABLE IF NOT EXISTS public.orion_fraud_actions (
  "action_id" bigint NOT NULL,
  "fraud_id" bigint,
  "acao" text NOT NULL,
  "motivo" text NOT NULL,
  "politica" text DEFAULT 'fraud_politica_v1'::text NOT NULL,
  "resultado" text DEFAULT 'pendente'::text NOT NULL,
  "rollback_de" bigint,
  "operador" text DEFAULT 'fraud_detection'::text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
DO $$ BEGIN
  ALTER TABLE public.orion_fraud_actions ADD CONSTRAINT orion_fraud_actions_pkey PRIMARY KEY (action_id);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $$;
CREATE TABLE IF NOT EXISTS public.orion_secaudit_history (
  "id" bigint NOT NULL,
  "dia" date DEFAULT ((now() AT TIME ZONE 'America/Cuiaba'::text))::date NOT NULL,
  "auditoria" text NOT NULL,
  "mudancas" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "score_anterior" integer,
  "score_atual" integer NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
DO $$ BEGIN
  ALTER TABLE public.orion_secaudit_history ADD CONSTRAINT orion_secaudit_history_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $$;
CREATE TABLE IF NOT EXISTS public.orion_secaudit_audits (
  "audit_id" bigint NOT NULL,
  "dia" date DEFAULT ((now() AT TIME ZONE 'America/Cuiaba'::text))::date NOT NULL,
  "trace" text NOT NULL,
  "modulo" text DEFAULT 'plataforma'::text NOT NULL,
  "categoria" text NOT NULL,
  "score" integer DEFAULT 100 NOT NULL,
  "status" text DEFAULT 'ok'::text NOT NULL,
  "evidencias" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "auditoria" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
DO $$ BEGIN
  ALTER TABLE public.orion_secaudit_audits ADD CONSTRAINT orion_secaudit_audits_pkey PRIMARY KEY (audit_id);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.orion_secaudit_audits ADD CONSTRAINT orion_secaudit_audits_uq UNIQUE (dia, categoria);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $$;
CREATE TABLE IF NOT EXISTS public.orion_arremate_transitions (
  "estado_de" text NOT NULL,
  "estado_para" text NOT NULL
);
DO $$ BEGIN
  ALTER TABLE public.orion_arremate_transitions ADD CONSTRAINT orion_arremate_transitions_pkey PRIMARY KEY (estado_de, estado_para);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $$;
CREATE TABLE IF NOT EXISTS public.orion_geo_scores (
  "id" bigint NOT NULL,
  "entidade_tipo" text NOT NULL,
  "entidade_id" text NOT NULL,
  "titulo" text,
  "categoria" text,
  "cidade" text,
  "geo_score" integer DEFAULT 0 NOT NULL,
  "content_quality_score" integer DEFAULT 0 NOT NULL,
  "discovery_score" integer DEFAULT 0 NOT NULL,
  "semantic_score" integer DEFAULT 0 NOT NULL,
  "vgi" integer DEFAULT 0 NOT NULL,
  "classificacao" text,
  "fatores" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "structured_data" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "contexto" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "faq" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "plano" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "trace_id" text,
  "dia" date DEFAULT CURRENT_DATE NOT NULL,
  "criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
DO $$ BEGIN
  ALTER TABLE public.orion_geo_scores ADD CONSTRAINT orion_geo_scores_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.orion_geo_scores ADD CONSTRAINT orion_geo_scores_uq UNIQUE (entidade_tipo, entidade_id, dia);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $$;
CREATE TABLE IF NOT EXISTS public.orion_audio_sync_log (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "fonte" text NOT NULL,
  "termo" text,
  "encontradas" integer,
  "novas" integer,
  "duplicadas" integer,
  "para_revisao" integer,
  "auto_aprovadas" integer,
  "duracao_ms" integer,
  "criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
DO $$ BEGIN
  ALTER TABLE public.orion_audio_sync_log ADD CONSTRAINT orion_audio_sync_log_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $$;
CREATE TABLE IF NOT EXISTS public.orion_audio_radio_queue (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "station_uuid" text,
  "name" text NOT NULL,
  "stream_url" text NOT NULL,
  "homepage" text,
  "favicon" text,
  "logo_url" text,
  "city" text,
  "state" text,
  "uf" text,
  "region" text,
  "country" text,
  "countrycode" text,
  "language" text,
  "frequency" text,
  "tags" text,
  "descricao" text,
  "keywords" text,
  "social" jsonb DEFAULT '{}'::jsonb,
  "category" text,
  "confidence" numeric(5,2),
  "sinais" jsonb DEFAULT '[]'::jsonb,
  "geo_lat" double precision,
  "geo_long" double precision,
  "bitrate" integer,
  "fonte" text DEFAULT 'radio-browser'::text NOT NULL,
  "status" text DEFAULT 'pending'::text NOT NULL,
  "dedupe_key" text NOT NULL,
  "motivo" text,
  "criado_em" timestamp with time zone DEFAULT now() NOT NULL,
  "revisado_em" timestamp with time zone,
  "revisado_por" uuid,
  "sugerido_por" uuid,
  "origem" text DEFAULT 'admin'::text
);
DO $$ BEGIN
  ALTER TABLE public.orion_audio_radio_queue ADD CONSTRAINT orion_audio_radio_queue_dedupe_key_key UNIQUE (dedupe_key);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.orion_audio_radio_queue ADD CONSTRAINT orion_audio_radio_queue_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $$;
CREATE TABLE IF NOT EXISTS public.orion_iam_actions (
  "id" bigint DEFAULT nextval('orion_iam_actions_id_seq'::regclass) NOT NULL,
  "action_type" text NOT NULL,
  "alvo_tipo" text,
  "alvo_ref" text,
  "motivo" text,
  "risco" integer,
  "executado" boolean DEFAULT false NOT NULL,
  "resultado" text,
  "ator" uuid,
  "criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
DO $$ BEGIN
  ALTER TABLE public.orion_iam_actions ADD CONSTRAINT orion_iam_actions_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $$;
CREATE TABLE IF NOT EXISTS public.orion_iam_config (
  "id" integer DEFAULT 1 NOT NULL,
  "enforcement_enabled" boolean DEFAULT false NOT NULL,
  "auto_revoke_enabled" boolean DEFAULT false NOT NULL,
  "mfa_enforce_enabled" boolean DEFAULT false NOT NULL,
  "mfa_mode" text DEFAULT 'warn'::text NOT NULL,
  "device_quarantine_enabled" boolean DEFAULT false NOT NULL,
  "revoke_risk_threshold" integer DEFAULT 85 NOT NULL,
  "atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
  "atualizado_por" uuid
);
DO $$ BEGIN
  ALTER TABLE public.orion_iam_config ADD CONSTRAINT orion_iam_config_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $$;
CREATE TABLE IF NOT EXISTS public.orion_iam_policies (
  "policy_key" text NOT NULL,
  "descricao" text,
  "condicao" text,
  "acao" text,
  "params" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "ativa" boolean DEFAULT true NOT NULL,
  "criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
DO $$ BEGIN
  ALTER TABLE public.orion_iam_policies ADD CONSTRAINT orion_iam_policies_pkey PRIMARY KEY (policy_key);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $$;
CREATE TABLE IF NOT EXISTS public.orion_iam_revocations (
  "id" bigint DEFAULT nextval('orion_iam_revocations_id_seq'::regclass) NOT NULL,
  "session_id" uuid,
  "user_id" uuid,
  "motivo" text,
  "executado" boolean DEFAULT false NOT NULL,
  "ator" uuid,
  "criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
DO $$ BEGIN
  ALTER TABLE public.orion_iam_revocations ADD CONSTRAINT orion_iam_revocations_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $$;
CREATE TABLE IF NOT EXISTS public.orion_iam_mfa_status (
  "id" bigint DEFAULT nextval('orion_iam_mfa_status_id_seq'::regclass) NOT NULL,
  "dia" date DEFAULT ((now() AT TIME ZONE 'America/Cuiaba'::text))::date NOT NULL,
  "user_id" uuid NOT NULL,
  "is_admin" boolean,
  "has_mfa" boolean,
  "satisfied" boolean,
  "criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
DO $$ BEGIN
  ALTER TABLE public.orion_iam_mfa_status ADD CONSTRAINT orion_iam_mfa_status_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.orion_iam_mfa_status ADD CONSTRAINT orion_iam_mfa_unico UNIQUE (dia, user_id);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $$;
CREATE TABLE IF NOT EXISTS public.orion_iam_device_quarantine (
  "id" bigint DEFAULT nextval('orion_iam_device_quarantine_id_seq'::regclass) NOT NULL,
  "device_ref" text NOT NULL,
  "user_id" uuid,
  "motivo" text,
  "ativo" boolean DEFAULT true NOT NULL,
  "criado_em" timestamp with time zone DEFAULT now() NOT NULL,
  "liberado_em" timestamp with time zone,
  "ator" uuid
);
DO $$ BEGIN
  ALTER TABLE public.orion_iam_device_quarantine ADD CONSTRAINT orion_iam_device_quarantine_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.orion_iam_device_quarantine ADD CONSTRAINT orion_iam_quar_unico UNIQUE (device_ref);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $$;
CREATE TABLE IF NOT EXISTS public.orion_iam_statistics (
  "dia" date DEFAULT ((now() AT TIME ZONE 'America/Cuiaba'::text))::date NOT NULL,
  "admins" integer,
  "admins_sem_mfa" integer,
  "sessoes_ativas" integer,
  "sessoes_risco" integer,
  "revogacoes" integer,
  "quarentenas" integer,
  "acoes" integer,
  "componentes" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
DO $$ BEGIN
  ALTER TABLE public.orion_iam_statistics ADD CONSTRAINT orion_iam_statistics_pkey PRIMARY KEY (dia);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $$;
CREATE TABLE IF NOT EXISTS public.orion_threat_intelligence (
  "threat_id" bigint NOT NULL,
  "dedupe_key" text NOT NULL,
  "tipo" text NOT NULL,
  "valor" text NOT NULL,
  "categoria" text,
  "severidade" text DEFAULT 'baixa'::text NOT NULL,
  "tis" integer DEFAULT 0 NOT NULL,
  "confidence" integer DEFAULT 0 NOT NULL,
  "origem" text DEFAULT 'threat_intelligence'::text NOT NULL,
  "evidencias" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "status" text DEFAULT 'ativo'::text NOT NULL,
  "first_seen" timestamp with time zone DEFAULT now() NOT NULL,
  "last_seen" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
DO $$ BEGIN
  ALTER TABLE public.orion_threat_intelligence ADD CONSTRAINT orion_threat_intelligence_dedupe_key_key UNIQUE (dedupe_key);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.orion_threat_intelligence ADD CONSTRAINT orion_threat_intelligence_pkey PRIMARY KEY (threat_id);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $$;
CREATE TABLE IF NOT EXISTS public.orion_restore_tests (
  "test_id" bigint NOT NULL,
  "tipo" text DEFAULT 'validacao_nao_destrutiva'::text NOT NULL,
  "iniciado_em" timestamp with time zone DEFAULT now() NOT NULL,
  "itens_validados" integer DEFAULT 0 NOT NULL,
  "itens_ok" integer DEFAULT 0 NOT NULL,
  "falhas" integer DEFAULT 0 NOT NULL,
  "rto_estimado_min" integer,
  "status" text DEFAULT 'aprovado'::text NOT NULL,
  "relatorio" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "evidencias" jsonb DEFAULT '{}'::jsonb NOT NULL
);
DO $$ BEGIN
  ALTER TABLE public.orion_restore_tests ADD CONSTRAINT orion_restore_tests_pkey PRIMARY KEY (test_id);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $$;
CREATE TABLE IF NOT EXISTS public.orion_predict_user_scores (
  "user_id" uuid NOT NULL,
  "tipo" text NOT NULL,
  "classe" text NOT NULL,
  "probabilidade_pct" integer NOT NULL,
  "fatores" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "recomendacao" text,
  "atualizado_em" timestamp with time zone DEFAULT now() NOT NULL
);
DO $$ BEGIN
  ALTER TABLE public.orion_predict_user_scores ADD CONSTRAINT orion_predict_user_scores_pkey PRIMARY KEY (user_id, tipo);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $$;
CREATE TABLE IF NOT EXISTS public.orion_secaudit_findings (
  "finding_id" bigint NOT NULL,
  "dedupe_key" text NOT NULL,
  "criticidade" text DEFAULT 'media'::text NOT NULL,
  "categoria" text NOT NULL,
  "componente" text NOT NULL,
  "descricao" text NOT NULL,
  "recomendacao" text NOT NULL,
  "evidencias" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "corrigido" boolean DEFAULT false NOT NULL,
  "corrigido_em" timestamp with time zone,
  "resolvido_por" text,
  "detectado_em" timestamp with time zone DEFAULT now() NOT NULL,
  "atualizado_em" timestamp with time zone DEFAULT now() NOT NULL
);
DO $$ BEGIN
  ALTER TABLE public.orion_secaudit_findings ADD CONSTRAINT orion_secaudit_findings_pkey PRIMARY KEY (finding_id);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.orion_secaudit_findings ADD CONSTRAINT orion_secaudit_findings_uq UNIQUE (dedupe_key);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $$;
CREATE TABLE IF NOT EXISTS public.orion_secaudit_compliance (
  "requisito" text NOT NULL,
  "status" text DEFAULT 'declarado'::text NOT NULL,
  "evidencia" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "ultima_verificacao" timestamp with time zone DEFAULT now() NOT NULL
);
DO $$ BEGIN
  ALTER TABLE public.orion_secaudit_compliance ADD CONSTRAINT orion_secaudit_compliance_pkey PRIMARY KEY (requisito);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $$;
CREATE TABLE IF NOT EXISTS public.orion_ai_alerts (
  "id" bigint NOT NULL,
  "tipo" text NOT NULL,
  "severidade" text DEFAULT 'info'::text NOT NULL,
  "mensagem" text NOT NULL,
  "valor" numeric,
  "threshold" numeric,
  "dia" date DEFAULT CURRENT_DATE NOT NULL,
  "resolvido" boolean DEFAULT false NOT NULL,
  "criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
DO $$ BEGIN
  ALTER TABLE public.orion_ai_alerts ADD CONSTRAINT orion_ai_alerts_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.orion_ai_alerts ADD CONSTRAINT orion_ai_alerts_uq UNIQUE (tipo, dia);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $$;
CREATE TABLE IF NOT EXISTS public.orion_ai_audit (
  "id" bigint NOT NULL,
  "evento" text NOT NULL,
  "module" text,
  "entidade" text,
  "detalhes" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "ator" text,
  "criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
DO $$ BEGIN
  ALTER TABLE public.orion_ai_audit ADD CONSTRAINT orion_ai_audit_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $$;
CREATE TABLE IF NOT EXISTS public.orion_ai_budgets (
  "id" bigint NOT NULL,
  "module" text NOT NULL,
  "periodo" text DEFAULT 'dia'::text NOT NULL,
  "limite_usd" numeric DEFAULT 1.0 NOT NULL,
  "ativo" boolean DEFAULT true NOT NULL,
  "criado_em" timestamp with time zone DEFAULT now() NOT NULL,
  "atualizado_em" timestamp with time zone DEFAULT now() NOT NULL
);
DO $$ BEGIN
  ALTER TABLE public.orion_ai_budgets ADD CONSTRAINT orion_ai_budgets_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.orion_ai_budgets ADD CONSTRAINT orion_ai_budgets_uq UNIQUE (module, periodo);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $$;
CREATE TABLE IF NOT EXISTS public.orion_ai_costs (
  "id" bigint NOT NULL,
  "dia" date NOT NULL,
  "custo_total_usd" numeric DEFAULT 0 NOT NULL,
  "tokens_in" bigint DEFAULT 0 NOT NULL,
  "tokens_out" bigint DEFAULT 0 NOT NULL,
  "chamadas" integer DEFAULT 0 NOT NULL,
  "cache_hits" integer DEFAULT 0 NOT NULL,
  "cache_hit_rate" numeric DEFAULT 0 NOT NULL,
  "economia_cache_usd" numeric DEFAULT 0 NOT NULL,
  "acs" integer DEFAULT 0 NOT NULL,
  "aes" integer DEFAULT 0 NOT NULL,
  "ars" integer DEFAULT 0 NOT NULL,
  "ces" integer DEFAULT 0 NOT NULL,
  "tes" integer DEFAULT 0 NOT NULL,
  "atualizado_em" timestamp with time zone DEFAULT now() NOT NULL
);
DO $$ BEGIN
  ALTER TABLE public.orion_ai_costs ADD CONSTRAINT orion_ai_costs_dia_key UNIQUE (dia);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.orion_ai_costs ADD CONSTRAINT orion_ai_costs_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $$;
CREATE TABLE IF NOT EXISTS public.orion_ai_forecast (
  "id" bigint NOT NULL,
  "gerado_em" date DEFAULT CURRENT_DATE NOT NULL,
  "horizonte" text NOT NULL,
  "custo_previsto_usd" numeric DEFAULT 0 NOT NULL,
  "base" text,
  "criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
DO $$ BEGIN
  ALTER TABLE public.orion_ai_forecast ADD CONSTRAINT orion_ai_forecast_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.orion_ai_forecast ADD CONSTRAINT orion_ai_forecast_uq UNIQUE (gerado_em, horizonte);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $$;
CREATE TABLE IF NOT EXISTS public.orion_ai_mentions (
  "id" bigint NOT NULL,
  "mecanismo" text NOT NULL,
  "entidade" text NOT NULL,
  "tipo" text,
  "contexto" text,
  "data" timestamp with time zone DEFAULT now() NOT NULL,
  "evidencia" text NOT NULL,
  "confidence" numeric DEFAULT 0 NOT NULL
);
DO $$ BEGIN
  ALTER TABLE public.orion_ai_mentions ADD CONSTRAINT orion_ai_mentions_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $$;
CREATE TABLE IF NOT EXISTS public.orion_ai_governance_roles (
  "user_id" uuid NOT NULL,
  "role" text DEFAULT 'operacoes'::text NOT NULL,
  "criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
DO $$ BEGIN
  ALTER TABLE public.orion_ai_governance_roles ADD CONSTRAINT orion_ai_governance_roles_pkey PRIMARY KEY (user_id);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $$;
CREATE TABLE IF NOT EXISTS public.orion_ai_policies (
  "id" bigint NOT NULL,
  "chave" text NOT NULL,
  "descricao" text NOT NULL,
  "tipo" text NOT NULL,
  "operador" text DEFAULT '>'::text NOT NULL,
  "threshold" numeric NOT NULL,
  "severidade" text DEFAULT 'atencao'::text NOT NULL,
  "ativo" boolean DEFAULT true NOT NULL,
  "criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
DO $$ BEGIN
  ALTER TABLE public.orion_ai_policies ADD CONSTRAINT orion_ai_policies_chave_key UNIQUE (chave);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.orion_ai_policies ADD CONSTRAINT orion_ai_policies_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $$;
CREATE TABLE IF NOT EXISTS public.orion_ai_roi (
  "dia" date NOT NULL,
  "custo_ia_usd" numeric DEFAULT 0 NOT NULL,
  "custo_ia_brl" numeric DEFAULT 0 NOT NULL,
  "receita_brl" numeric DEFAULT 0 NOT NULL,
  "roi" numeric DEFAULT 0 NOT NULL,
  "margem_pct" numeric DEFAULT 0 NOT NULL,
  "atualizado_em" timestamp with time zone DEFAULT now() NOT NULL
);
DO $$ BEGIN
  ALTER TABLE public.orion_ai_roi ADD CONSTRAINT orion_ai_roi_pkey PRIMARY KEY (dia);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $$;
CREATE TABLE IF NOT EXISTS public.orion_ai_tokens (
  "dia" date NOT NULL,
  "tokens_in" bigint DEFAULT 0 NOT NULL,
  "tokens_out" bigint DEFAULT 0 NOT NULL,
  "tokens_total" bigint DEFAULT 0 NOT NULL,
  "tokens_cache_saved" bigint DEFAULT 0 NOT NULL,
  "atualizado_em" timestamp with time zone DEFAULT now() NOT NULL
);
DO $$ BEGIN
  ALTER TABLE public.orion_ai_tokens ADD CONSTRAINT orion_ai_tokens_pkey PRIMARY KEY (dia);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $$;
CREATE TABLE IF NOT EXISTS public.orion_ai_usage (
  "id" bigint NOT NULL,
  "dia" date NOT NULL,
  "module" text NOT NULL,
  "chamadas" integer DEFAULT 0 NOT NULL,
  "tokens_in" bigint DEFAULT 0 NOT NULL,
  "tokens_out" bigint DEFAULT 0 NOT NULL,
  "custo_usd" numeric DEFAULT 0 NOT NULL,
  "latencia_media_ms" integer DEFAULT 0 NOT NULL,
  "cache_hits" integer DEFAULT 0 NOT NULL,
  "erros" integer DEFAULT 0 NOT NULL,
  "disponibilidade" numeric DEFAULT 100 NOT NULL,
  "atualizado_em" timestamp with time zone DEFAULT now() NOT NULL
);
DO $$ BEGIN
  ALTER TABLE public.orion_ai_usage ADD CONSTRAINT orion_ai_usage_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.orion_ai_usage ADD CONSTRAINT orion_ai_usage_uq UNIQUE (dia, module);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $$;
CREATE TABLE IF NOT EXISTS public.orion_ai_visibility (
  "id" bigint NOT NULL,
  "entity_id" text NOT NULL,
  "entity_type" text NOT NULL,
  "visibility_score" integer DEFAULT 0 NOT NULL,
  "answer_score" integer DEFAULT 0 NOT NULL,
  "citation_score" integer DEFAULT 0 NOT NULL,
  "authority_score" integer DEFAULT 0 NOT NULL,
  "freshness_score" integer DEFAULT 0 NOT NULL,
  "structured_data_score" integer DEFAULT 0 NOT NULL,
  "semantic_score" integer DEFAULT 0 NOT NULL,
  "trust_score" integer DEFAULT 0 NOT NULL,
  "ai_readiness" integer DEFAULT 0 NOT NULL,
  "fatores" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "prioridades" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "evidencia" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "trace_id" text,
  "dia" date DEFAULT CURRENT_DATE NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
DO $$ BEGIN
  ALTER TABLE public.orion_ai_visibility ADD CONSTRAINT orion_ai_visibility_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.orion_ai_visibility ADD CONSTRAINT orion_aivis_uq UNIQUE (entity_id, entity_type, dia);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $$;
CREATE TABLE IF NOT EXISTS public.orion_answer_quality (
  "id" bigint NOT NULL,
  "entity_id" text NOT NULL,
  "entity_type" text NOT NULL,
  "completeness" integer DEFAULT 0 NOT NULL,
  "factual_consistency" integer DEFAULT 0 NOT NULL,
  "semantic_clarity" integer DEFAULT 0 NOT NULL,
  "geo_quality" integer DEFAULT 0 NOT NULL,
  "citation_quality" integer DEFAULT 0 NOT NULL,
  "readability" integer DEFAULT 0 NOT NULL,
  "ai_readiness" integer DEFAULT 0 NOT NULL,
  "aqs" integer DEFAULT 0 NOT NULL,
  "dia" date DEFAULT CURRENT_DATE NOT NULL,
  "criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
DO $$ BEGIN
  ALTER TABLE public.orion_answer_quality ADD CONSTRAINT orion_answer_quality_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.orion_answer_quality ADD CONSTRAINT orion_aq_uq UNIQUE (entity_id, entity_type, dia);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $$;
CREATE TABLE IF NOT EXISTS public.orion_lgpd_requests (
  "request_id" bigint NOT NULL,
  "user_id" uuid,
  "tipo" text NOT NULL,
  "status" text DEFAULT 'aberta'::text NOT NULL,
  "detalhes" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "prazo" date DEFAULT (((now() AT TIME ZONE 'America/Cuiaba'::text))::date + 15) NOT NULL,
  "responsavel" text,
  "aberto_em" timestamp with time zone DEFAULT now() NOT NULL,
  "concluido_em" timestamp with time zone,
  "atualizado_em" timestamp with time zone DEFAULT now() NOT NULL
);
DO $$ BEGIN
  ALTER TABLE public.orion_lgpd_requests ADD CONSTRAINT orion_lgpd_requests_pkey PRIMARY KEY (request_id);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $$;
CREATE TABLE IF NOT EXISTS public.orion_auction_audit (
  "id" bigint NOT NULL,
  "listing_id" uuid,
  "acao" text NOT NULL,
  "ator" text,
  "detalhes" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
DO $$ BEGIN
  ALTER TABLE public.orion_auction_audit ADD CONSTRAINT orion_auction_audit_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $$;
CREATE TABLE IF NOT EXISTS public.orion_auction_credit_consumption (
  "id" bigint NOT NULL,
  "listing_id" uuid NOT NULL,
  "advertiser_account_id" uuid,
  "tipo" text NOT NULL,
  "participantes_unicos" integer DEFAULT 0 NOT NULL,
  "creditos" integer DEFAULT 0 NOT NULL,
  "evidencia" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
DO $$ BEGIN
  ALTER TABLE public.orion_auction_credit_consumption ADD CONSTRAINT orion_auction_consumo_uq UNIQUE (listing_id, tipo);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.orion_auction_credit_consumption ADD CONSTRAINT orion_auction_credit_consumption_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $$;
CREATE TABLE IF NOT EXISTS public.orion_auction_packages (
  "id" text NOT NULL,
  "nome" text NOT NULL,
  "creditos_encerramento" integer DEFAULT 3 NOT NULL,
  "ativo" boolean DEFAULT true NOT NULL,
  "descricao" text,
  "criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
DO $$ BEGIN
  ALTER TABLE public.orion_auction_packages ADD CONSTRAINT orion_auction_packages_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $$;
CREATE TABLE IF NOT EXISTS public.orion_auction_promo_packages (
  "id" text NOT NULL,
  "nome" text NOT NULL,
  "posts_por_dia" integer NOT NULL,
  "preco_creditos" integer DEFAULT 0 NOT NULL,
  "ativo" boolean DEFAULT true NOT NULL,
  "criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
DO $$ BEGIN
  ALTER TABLE public.orion_auction_promo_packages ADD CONSTRAINT orion_auction_promo_packages_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $$;
CREATE TABLE IF NOT EXISTS public.orion_auction_reports (
  "listing_id" uuid NOT NULL,
  "participantes_unicos" integer DEFAULT 0 NOT NULL,
  "total_lances" integer DEFAULT 0 NOT NULL,
  "vencedor_user_id" uuid,
  "valor_final" numeric,
  "creditos_consumidos" integer DEFAULT 0 NOT NULL,
  "score_final" integer DEFAULT 0 NOT NULL,
  "roi_divulgacao" numeric,
  "evolucao_lances" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "gerado_em" timestamp with time zone DEFAULT now() NOT NULL
);
DO $$ BEGIN
  ALTER TABLE public.orion_auction_reports ADD CONSTRAINT orion_auction_reports_pkey PRIMARY KEY (listing_id);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $$;
CREATE TABLE IF NOT EXISTS public.orion_auction_suggestions (
  "listing_id" uuid NOT NULL,
  "melhor_horario" text,
  "duracao_horas" integer,
  "preco_inicial_ideal" numeric,
  "incremento_recomendado" numeric,
  "estimativa_participantes" integer,
  "estimativa_valor_final" numeric,
  "expectativa_sucesso" integer,
  "confianca" integer DEFAULT 0 NOT NULL,
  "evidencia" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
DO $$ BEGIN
  ALTER TABLE public.orion_auction_suggestions ADD CONSTRAINT orion_auction_suggestions_pkey PRIMARY KEY (listing_id);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $$;
CREATE TABLE IF NOT EXISTS public.orion_automation_policies (
  "acao" text NOT NULL,
  "categoria" text NOT NULL,
  "modo" text DEFAULT 'aprovacao'::text NOT NULL,
  "descricao" text,
  "ativo" boolean DEFAULT true NOT NULL,
  "config" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "atualizado_em" timestamp with time zone DEFAULT now() NOT NULL
);
DO $$ BEGIN
  ALTER TABLE public.orion_automation_policies ADD CONSTRAINT orion_automation_policies_pkey PRIMARY KEY (acao);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $$;
CREATE TABLE IF NOT EXISTS public.orion_automation_requests (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "acao" text NOT NULL,
  "origem_modulo" text DEFAULT 'admin'::text NOT NULL,
  "solicitante" uuid,
  "motivo" text,
  "payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "politica_aplicada" text,
  "modo" text,
  "status" text DEFAULT 'pronta'::text NOT NULL,
  "resultado" jsonb,
  "erro" text,
  "idempotency_key" text,
  "tentativas" integer DEFAULT 0 NOT NULL,
  "rollback_disponivel" boolean DEFAULT false NOT NULL,
  "iniciado_em" timestamp with time zone,
  "concluido_em" timestamp with time zone,
  "duracao_ms" integer,
  "criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
DO $$ BEGIN
  ALTER TABLE public.orion_automation_requests ADD CONSTRAINT orion_automation_requests_idempotency_key_key UNIQUE (idempotency_key);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.orion_automation_requests ADD CONSTRAINT orion_automation_requests_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $$;
CREATE TABLE IF NOT EXISTS public.orion_bi_kpis (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "dominio" text NOT NULL,
  "chave" text NOT NULL,
  "valor" numeric,
  "unidade" text,
  "origem" text,
  "modulos" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "metodologia" text,
  "confianca" integer DEFAULT 80 NOT NULL,
  "dia" date DEFAULT ((now() AT TIME ZONE 'America/Cuiaba'::text))::date NOT NULL,
  "criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
DO $$ BEGIN
  ALTER TABLE public.orion_bi_kpis ADD CONSTRAINT orion_bi_kpi_unico UNIQUE (dominio, chave, dia);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.orion_bi_kpis ADD CONSTRAINT orion_bi_kpis_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $$;
CREATE TABLE IF NOT EXISTS public.orion_conversion_funnel (
  "id" bigint NOT NULL,
  "visitor_id" text NOT NULL,
  "etapa" text NOT NULL,
  "timestamp" timestamp with time zone DEFAULT now() NOT NULL,
  "conversao" boolean DEFAULT false NOT NULL,
  "abandono" boolean DEFAULT false NOT NULL
);
DO $$ BEGIN
  ALTER TABLE public.orion_conversion_funnel ADD CONSTRAINT orion_conversion_funnel_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.orion_conversion_funnel ADD CONSTRAINT orion_funnel_uq UNIQUE (visitor_id, etapa);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $$;
CREATE TABLE IF NOT EXISTS public.orion_customer_health (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL,
  "health_score" integer DEFAULT 50 NOT NULL,
  "churn_risk" text DEFAULT 'medio'::text NOT NULL,
  "segmento" text,
  "fatores" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "ultima_atividade" timestamp with time zone,
  "sinais" integer DEFAULT 0 NOT NULL,
  "recomendacao" text,
  "modulos" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "dia" date DEFAULT ((now() AT TIME ZONE 'America/Cuiaba'::text))::date NOT NULL,
  "criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
DO $$ BEGIN
  ALTER TABLE public.orion_customer_health ADD CONSTRAINT orion_customer_health_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.orion_customer_health ADD CONSTRAINT orion_customer_health_unico UNIQUE (user_id, dia);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $$;
CREATE TABLE IF NOT EXISTS public.orion_cyber_actions (
  "id" bigint NOT NULL,
  "acao" text NOT NULL,
  "alvo" text,
  "motivo" text NOT NULL,
  "ia_responsavel" text DEFAULT 'cyber_defense'::text NOT NULL,
  "politica_aplicada" text DEFAULT 'alerta'::text NOT NULL,
  "resultado" text DEFAULT 'registrada'::text NOT NULL,
  "evidencias" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "rollback_disponivel" boolean DEFAULT true NOT NULL,
  "rolled_back" boolean DEFAULT false NOT NULL,
  "ref_event_id" bigint,
  "ref_block_id" bigint,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
DO $$ BEGIN
  ALTER TABLE public.orion_cyber_actions ADD CONSTRAINT orion_cyber_actions_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $$;
CREATE TABLE IF NOT EXISTS public.orion_cyber_alerts (
  "id" bigint NOT NULL,
  "alerta" text NOT NULL,
  "prioridade" text DEFAULT 'media'::text NOT NULL,
  "score" integer DEFAULT 0 NOT NULL,
  "categoria" text NOT NULL,
  "entidade" text DEFAULT 'plataforma'::text NOT NULL,
  "recomendacao" text NOT NULL,
  "evidencias" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "confianca" integer DEFAULT 0 NOT NULL,
  "responsavel" text,
  "resolvido" boolean DEFAULT false NOT NULL,
  "resolved_at" timestamp with time zone,
  "dia" date DEFAULT ((now() AT TIME ZONE 'America/Cuiaba'::text))::date NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
DO $$ BEGIN
  ALTER TABLE public.orion_cyber_alerts ADD CONSTRAINT orion_cyber_alerts_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.orion_cyber_alerts ADD CONSTRAINT orion_cyber_alerts_uq UNIQUE (categoria, entidade, dia);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $$;
CREATE TABLE IF NOT EXISTS public.orion_cyber_blocked_entities (
  "id" bigint NOT NULL,
  "tipo" text NOT NULL,
  "valor" text NOT NULL,
  "motivo" text NOT NULL,
  "evidencias" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "aplicado_por" text DEFAULT 'cyber_defense'::text NOT NULL,
  "ativo" boolean DEFAULT true NOT NULL,
  "expiracao" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "revoked_at" timestamp with time zone
);
DO $$ BEGIN
  ALTER TABLE public.orion_cyber_blocked_entities ADD CONSTRAINT orion_cyber_blocked_entities_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $$;
CREATE TABLE IF NOT EXISTS public.orion_cyber_policies (
  "categoria" text NOT NULL,
  "modo" text DEFAULT 'alerta'::text NOT NULL,
  "limiar" integer DEFAULT 5 NOT NULL,
  "monitorado" boolean DEFAULT true NOT NULL,
  "critico" boolean DEFAULT false NOT NULL,
  "descricao" text,
  "atualizado_em" timestamp with time zone DEFAULT now() NOT NULL
);
DO $$ BEGIN
  ALTER TABLE public.orion_cyber_policies ADD CONSTRAINT orion_cyber_policies_pkey PRIMARY KEY (categoria);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $$;
CREATE TABLE IF NOT EXISTS public.orion_soc_statistics (
  "dia" date NOT NULL,
  "oss" integer DEFAULT 0 NOT NULL,
  "ors" integer DEFAULT 0 NOT NULL,
  "ghs" integer DEFAULT 0 NOT NULL,
  "ecs" integer DEFAULT 0 NOT NULL,
  "mttd_min" integer DEFAULT 0 NOT NULL,
  "mttr_min" integer DEFAULT 0 NOT NULL,
  "mttc_min" integer DEFAULT 0 NOT NULL,
  "rpo_min" integer DEFAULT 0 NOT NULL,
  "rto_min" integer DEFAULT 0 NOT NULL,
  "incidentes_abertos" integer DEFAULT 0 NOT NULL,
  "alertas_soc" integer DEFAULT 0 NOT NULL,
  "disponibilidade_pct" integer DEFAULT 0 NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
DO $$ BEGIN
  ALTER TABLE public.orion_soc_statistics ADD CONSTRAINT orion_soc_statistics_pkey PRIMARY KEY (dia);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $$;
CREATE TABLE IF NOT EXISTS public.orion_cyber_state (
  "chave" text NOT NULL,
  "last_ts" timestamp with time zone DEFAULT (now() - '24:00:00'::interval) NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
DO $$ BEGIN
  ALTER TABLE public.orion_cyber_state ADD CONSTRAINT orion_cyber_state_pkey PRIMARY KEY (chave);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $$;
CREATE TABLE IF NOT EXISTS public.orion_cyber_statistics (
  "data" date NOT NULL,
  "ataques" integer DEFAULT 0 NOT NULL,
  "bloqueios" integer DEFAULT 0 NOT NULL,
  "falsos_positivos" integer DEFAULT 0 NOT NULL,
  "latencia_ms" integer DEFAULT 0 NOT NULL,
  "score_medio" integer DEFAULT 0 NOT NULL,
  "disponibilidade" numeric(5,2) DEFAULT 100 NOT NULL,
  "atualizado_em" timestamp with time zone DEFAULT now() NOT NULL
);
DO $$ BEGIN
  ALTER TABLE public.orion_cyber_statistics ADD CONSTRAINT orion_cyber_statistics_pkey PRIMARY KEY (data);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $$;
CREATE TABLE IF NOT EXISTS public.orion_diretrizes (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "chave" text NOT NULL,
  "versao" integer DEFAULT 1 NOT NULL,
  "tipo" text NOT NULL,
  "titulo" text NOT NULL,
  "conteudo" text NOT NULL,
  "comentario" text,
  "status" text DEFAULT 'rascunho'::text NOT NULL,
  "autor" uuid,
  "criado_em" timestamp with time zone DEFAULT now() NOT NULL,
  "aprovado_em" timestamp with time zone,
  "aprovado_por" uuid
);
DO $$ BEGIN
  ALTER TABLE public.orion_diretrizes ADD CONSTRAINT orion_diretrizes_chave_versao_key UNIQUE (chave, versao);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.orion_diretrizes ADD CONSTRAINT orion_diretrizes_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $$;
CREATE TABLE IF NOT EXISTS public.orion_ds_access_log (
  "id" bigint DEFAULT nextval('orion_ds_access_log_id_seq'::regclass) NOT NULL,
  "ator" uuid,
  "acao" text NOT NULL,
  "tabela" text,
  "coluna" text,
  "ref_id" text,
  "motivo" text,
  "ip" text,
  "criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
DO $$ BEGIN
  ALTER TABLE public.orion_ds_access_log ADD CONSTRAINT orion_ds_access_log_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $$;
CREATE TABLE IF NOT EXISTS public.orion_ds_dlp_findings (
  "id" bigint DEFAULT nextval('orion_ds_dlp_findings_id_seq'::regclass) NOT NULL,
  "tabela" text NOT NULL,
  "coluna" text NOT NULL,
  "ref_id" text,
  "tipo_vazamento" text NOT NULL,
  "amostra_mascarada" text,
  "severidade" text DEFAULT 'media'::text NOT NULL,
  "resolvido" boolean DEFAULT false NOT NULL,
  "criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
DO $$ BEGIN
  ALTER TABLE public.orion_ds_dlp_findings ADD CONSTRAINT orion_ds_dlp_findings_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.orion_ds_dlp_findings ADD CONSTRAINT orion_ds_dlp_findings_tabela_coluna_ref_id_tipo_vazamento_key UNIQUE (tabela, coluna, ref_id, tipo_vazamento);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $$;
CREATE TABLE IF NOT EXISTS public.orion_ds_keys (
  "id" bigint DEFAULT nextval('orion_ds_keys_id_seq'::regclass) NOT NULL,
  "chave_logica" text NOT NULL,
  "versao" integer NOT NULL,
  "status" text DEFAULT 'ativa'::text NOT NULL,
  "vault_ref" uuid,
  "rotacionada_em" timestamp with time zone,
  "criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
DO $$ BEGIN
  ALTER TABLE public.orion_ds_keys ADD CONSTRAINT orion_ds_keys_chave_logica_versao_key UNIQUE (chave_logica, versao);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.orion_ds_keys ADD CONSTRAINT orion_ds_keys_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $$;
CREATE TABLE IF NOT EXISTS public.orion_ds_registry (
  "id" bigint DEFAULT nextval('orion_ds_registry_id_seq'::regclass) NOT NULL,
  "tabela" text NOT NULL,
  "coluna" text NOT NULL,
  "classe" text DEFAULT 'PII'::text NOT NULL,
  "estrategia_mascara" text DEFAULT 'partial'::text NOT NULL,
  "criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
DO $$ BEGIN
  ALTER TABLE public.orion_ds_registry ADD CONSTRAINT orion_ds_registry_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.orion_ds_registry ADD CONSTRAINT orion_ds_registry_tabela_coluna_key UNIQUE (tabela, coluna);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $$;
CREATE TABLE IF NOT EXISTS public.orion_executive_decisions (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "titulo" text NOT NULL,
  "categoria" text NOT NULL,
  "impacto" integer,
  "urgencia" integer,
  "roi" integer,
  "complexidade" integer,
  "risco" integer,
  "prioridade" text,
  "classificacao" text,
  "fatores" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "modulos" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "motivo" text,
  "origem_modulo" text,
  "dia" date DEFAULT ((now() AT TIME ZONE 'America/Cuiaba'::text))::date NOT NULL,
  "criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
DO $$ BEGIN
  ALTER TABLE public.orion_executive_decisions ADD CONSTRAINT orion_executive_decision_unico UNIQUE (titulo, dia);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.orion_executive_decisions ADD CONSTRAINT orion_executive_decisions_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $$;
CREATE TABLE IF NOT EXISTS public.orion_executive_snapshots (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "executive_score" integer DEFAULT 50 NOT NULL,
  "cii" integer DEFAULT 50 NOT NULL,
  "componentes" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "cii_fatores" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "tendencia" text,
  "confianca" integer DEFAULT 70 NOT NULL,
  "prioridade_maxima" text,
  "prioridade_motivo" text,
  "modulos_consultados" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "brief" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "dia" date DEFAULT ((now() AT TIME ZONE 'America/Cuiaba'::text))::date NOT NULL,
  "criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
DO $$ BEGIN
  ALTER TABLE public.orion_executive_snapshots ADD CONSTRAINT orion_executive_snapshot_unico UNIQUE (dia);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.orion_executive_snapshots ADD CONSTRAINT orion_executive_snapshots_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $$;
CREATE TABLE IF NOT EXISTS public.orion_geo_recommendations (
  "id" bigint NOT NULL,
  "entidade_tipo" text NOT NULL,
  "entidade_id" text NOT NULL,
  "titulo" text,
  "categoria" text,
  "acao" text NOT NULL,
  "impacto" integer DEFAULT 0 NOT NULL,
  "motivo" text,
  "dia" date DEFAULT CURRENT_DATE NOT NULL,
  "criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
DO $$ BEGIN
  ALTER TABLE public.orion_geo_recommendations ADD CONSTRAINT orion_geo_recommendations_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.orion_geo_recommendations ADD CONSTRAINT orion_geo_recs_uq UNIQUE (entidade_tipo, entidade_id, acao, dia);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $$;
CREATE TABLE IF NOT EXISTS public.orion_predict_trends (
  "dedupe_key" text NOT NULL,
  "categoria" text NOT NULL,
  "direcao" text NOT NULL,
  "descricao" text NOT NULL,
  "evidencias" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "atualizado_em" timestamp with time zone DEFAULT now() NOT NULL
);
DO $$ BEGIN
  ALTER TABLE public.orion_predict_trends ADD CONSTRAINT orion_predict_trends_pkey PRIMARY KEY (dedupe_key);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $$;
CREATE TABLE IF NOT EXISTS public.orion_health_incidentes (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "tipo" text NOT NULL,
  "severidade" text NOT NULL,
  "titulo" text NOT NULL,
  "origem" text,
  "impacto" text,
  "dados" jsonb DEFAULT '{}'::jsonb,
  "status" text DEFAULT 'aberto'::text NOT NULL,
  "causa_raiz" text,
  "responsavel" uuid,
  "trace_id" uuid,
  "aberto_em" timestamp with time zone DEFAULT now() NOT NULL,
  "resolvido_em" timestamp with time zone
);
DO $$ BEGIN
  ALTER TABLE public.orion_health_incidentes ADD CONSTRAINT orion_health_incidentes_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $$;
CREATE TABLE IF NOT EXISTS public.orion_health_snapshots (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "score" integer NOT NULL,
  "componentes" jsonb NOT NULL,
  "criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
DO $$ BEGIN
  ALTER TABLE public.orion_health_snapshots ADD CONSTRAINT orion_health_snapshots_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $$;
CREATE TABLE IF NOT EXISTS public.orion_innovation_opportunities (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "chave" text NOT NULL,
  "titulo" text NOT NULL,
  "categoria" text NOT NULL,
  "descricao" text,
  "origem_modulo" text,
  "innovation_score" integer DEFAULT 50 NOT NULL,
  "fatores" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "iom" text DEFAULT 'futura'::text NOT NULL,
  "beneficio" text,
  "esforco" text,
  "prioridade" text,
  "dependencias" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "modulos" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "confianca" integer DEFAULT 65 NOT NULL,
  "dia" date DEFAULT ((now() AT TIME ZONE 'America/Cuiaba'::text))::date NOT NULL,
  "criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
DO $$ BEGIN
  ALTER TABLE public.orion_innovation_opportunities ADD CONSTRAINT orion_innovation_op_unico UNIQUE (chave, dia);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.orion_innovation_opportunities ADD CONSTRAINT orion_innovation_opportunities_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $$;
CREATE TABLE IF NOT EXISTS public.orion_kg_events (
  "event_id" bigint NOT NULL,
  "tipo" text NOT NULL,
  "ref_id" text,
  "dados" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
DO $$ BEGIN
  ALTER TABLE public.orion_kg_events ADD CONSTRAINT orion_kg_events_pkey PRIMARY KEY (event_id);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $$;
CREATE TABLE IF NOT EXISTS public.orion_innovation_scores (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "categoria" text NOT NULL,
  "score" integer DEFAULT 50 NOT NULL,
  "oportunidades" integer DEFAULT 0 NOT NULL,
  "dia" date DEFAULT ((now() AT TIME ZONE 'America/Cuiaba'::text))::date NOT NULL,
  "criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
DO $$ BEGIN
  ALTER TABLE public.orion_innovation_scores ADD CONSTRAINT orion_innovation_score_unico UNIQUE (categoria, dia);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.orion_innovation_scores ADD CONSTRAINT orion_innovation_scores_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $$;
CREATE TABLE IF NOT EXISTS public.orion_knowledge (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "chave" text NOT NULL,
  "tipo" text NOT NULL,
  "area" text,
  "titulo" text NOT NULL,
  "causa_raiz" text,
  "solucao" text,
  "resultado" text,
  "recorrencias" integer DEFAULT 1 NOT NULL,
  "relacionado" jsonb DEFAULT '[]'::jsonb,
  "dados" jsonb DEFAULT '{}'::jsonb,
  "criado_em" timestamp with time zone DEFAULT now() NOT NULL,
  "ultima_ocorrencia" timestamp with time zone DEFAULT now() NOT NULL
);
DO $$ BEGIN
  ALTER TABLE public.orion_knowledge ADD CONSTRAINT orion_knowledge_chave_key UNIQUE (chave);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.orion_knowledge ADD CONSTRAINT orion_knowledge_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $$;
CREATE TABLE IF NOT EXISTS public.orion_knowledge_entities (
  "id" bigint NOT NULL,
  "entity_key" text NOT NULL,
  "entity_type" text NOT NULL,
  "rotulo" text,
  "atributos" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "grau" integer DEFAULT 0 NOT NULL,
  "kg_score" integer DEFAULT 0 NOT NULL,
  "entity_quality_score" integer DEFAULT 0 NOT NULL,
  "discovery_score" integer DEFAULT 0 NOT NULL,
  "geo_score" integer DEFAULT 0 NOT NULL,
  "semantic_score" integer DEFAULT 0 NOT NULL,
  "vki" integer DEFAULT 0 NOT NULL,
  "classificacao" text,
  "trace_id" text,
  "dia" date DEFAULT CURRENT_DATE NOT NULL,
  "criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
DO $$ BEGIN
  ALTER TABLE public.orion_knowledge_entities ADD CONSTRAINT orion_kg_entities_uq UNIQUE (entity_key, dia);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.orion_knowledge_entities ADD CONSTRAINT orion_knowledge_entities_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $$;
CREATE TABLE IF NOT EXISTS public.orion_knowledge_relations (
  "id" bigint NOT NULL,
  "origem_key" text NOT NULL,
  "destino_key" text NOT NULL,
  "tipo" text NOT NULL,
  "confianca" numeric DEFAULT 1.0 NOT NULL,
  "evidencia" text NOT NULL,
  "dia" date DEFAULT CURRENT_DATE NOT NULL,
  "criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
DO $$ BEGIN
  ALTER TABLE public.orion_knowledge_relations ADD CONSTRAINT orion_kg_rel_uq UNIQUE (origem_key, destino_key, tipo, dia);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.orion_knowledge_relations ADD CONSTRAINT orion_knowledge_relations_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $$;
CREATE TABLE IF NOT EXISTS public.orion_logistics_recommendations (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "tipo" text NOT NULL,
  "escopo" text DEFAULT 'cidade'::text NOT NULL,
  "escopo_ref" text DEFAULT ''::text NOT NULL,
  "titulo" text NOT NULL,
  "score" integer DEFAULT 50 NOT NULL,
  "fatores" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "modulos" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "motivo" text,
  "confianca" integer DEFAULT 60 NOT NULL,
  "dia" date DEFAULT ((now() AT TIME ZONE 'America/Cuiaba'::text))::date NOT NULL,
  "criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
DO $$ BEGIN
  ALTER TABLE public.orion_logistics_recommendations ADD CONSTRAINT orion_logistics_rec_unico UNIQUE (tipo, escopo_ref, dia);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.orion_logistics_recommendations ADD CONSTRAINT orion_logistics_recommendations_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $$;
CREATE TABLE IF NOT EXISTS public.orion_logistics_scores (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "cidade" text NOT NULL,
  "uf" text,
  "logistics_score" integer DEFAULT 50 NOT NULL,
  "opportunity_score" integer DEFAULT 50 NOT NULL,
  "demanda" integer DEFAULT 0 NOT NULL,
  "oferta_motoboys" integer DEFAULT 0 NOT NULL,
  "motoboys_online" integer DEFAULT 0 NOT NULL,
  "crescimento" numeric,
  "fatores" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "sinal" text,
  "recomendacao" text,
  "confianca" integer DEFAULT 60 NOT NULL,
  "modulos" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "dia" date DEFAULT ((now() AT TIME ZONE 'America/Cuiaba'::text))::date NOT NULL,
  "criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
DO $$ BEGIN
  ALTER TABLE public.orion_logistics_scores ADD CONSTRAINT orion_logistics_score_unico UNIQUE (cidade, dia);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.orion_logistics_scores ADD CONSTRAINT orion_logistics_scores_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $$;
CREATE TABLE IF NOT EXISTS public.orion_market_insights (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "tipo" text NOT NULL,
  "escopo" text NOT NULL,
  "escopo_ref" text DEFAULT ''::text NOT NULL,
  "titulo" text NOT NULL,
  "descricao" text,
  "score_confianca" integer DEFAULT 50 NOT NULL,
  "modulos" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "metricas" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "justificativa" text,
  "trace_id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "dia" date DEFAULT ((now() AT TIME ZONE 'America/Cuiaba'::text))::date NOT NULL,
  "criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
DO $$ BEGIN
  ALTER TABLE public.orion_market_insights ADD CONSTRAINT orion_market_insight_unico UNIQUE (tipo, escopo, escopo_ref, dia);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.orion_market_insights ADD CONSTRAINT orion_market_insights_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $$;
CREATE TABLE IF NOT EXISTS public.orion_marketing_recommendations (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "tipo" text NOT NULL,
  "escopo_ref" text DEFAULT ''::text NOT NULL,
  "titulo" text NOT NULL,
  "publico_alvo" text,
  "canais" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "score" integer DEFAULT 50 NOT NULL,
  "roi_estimado" numeric,
  "fatores" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "modulos" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "motivo" text,
  "confianca" integer DEFAULT 70 NOT NULL,
  "dia" date DEFAULT ((now() AT TIME ZONE 'America/Cuiaba'::text))::date NOT NULL,
  "criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
DO $$ BEGIN
  ALTER TABLE public.orion_marketing_recommendations ADD CONSTRAINT orion_marketing_recommendations_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.orion_marketing_recommendations ADD CONSTRAINT orion_mkt_rec_unico UNIQUE (tipo, escopo_ref, dia);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $$;
CREATE TABLE IF NOT EXISTS public.orion_gov_registry (
  "module" text NOT NULL,
  "numero" text,
  "nome" text,
  "categoria" text DEFAULT 'operacional'::text NOT NULL,
  "status" text DEFAULT 'producao'::text NOT NULL,
  "versao" text DEFAULT 'v1'::text NOT NULL,
  "score" integer,
  "certificado_em" date,
  "cron_job" text,
  "cron_ativo" boolean,
  "ultima_execucao" timestamp with time zone,
  "prompts_ativos" integer DEFAULT 0 NOT NULL,
  "uso_7d" integer DEFAULT 0 NOT NULL,
  "erros_7d" integer DEFAULT 0 NOT NULL,
  "painel" text,
  "docs_status" text DEFAULT 'declarado'::text NOT NULL,
  "health" text DEFAULT 'desconhecido'::text NOT NULL,
  "criado_em" timestamp with time zone DEFAULT now() NOT NULL,
  "atualizado_em" timestamp with time zone DEFAULT now() NOT NULL
);
DO $$ BEGIN
  ALTER TABLE public.orion_gov_registry ADD CONSTRAINT orion_gov_registry_pkey PRIMARY KEY (module);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $$;
CREATE TABLE IF NOT EXISTS public.orion_marketing_segments (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "chave" text NOT NULL,
  "nome" text NOT NULL,
  "descricao" text,
  "criterio" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "tamanho" integer DEFAULT 0 NOT NULL,
  "modulos" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "dia" date DEFAULT ((now() AT TIME ZONE 'America/Cuiaba'::text))::date NOT NULL,
  "criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
DO $$ BEGIN
  ALTER TABLE public.orion_marketing_segments ADD CONSTRAINT orion_marketing_segments_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.orion_marketing_segments ADD CONSTRAINT orion_mkt_segment_unico UNIQUE (chave, dia);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $$;
CREATE TABLE IF NOT EXISTS public.orion_missoes (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "chave" text NOT NULL,
  "titulo" text NOT NULL,
  "descricao" text,
  "objetivo" text,
  "area" text NOT NULL,
  "cidade" text,
  "categoria" text,
  "classificacao" text NOT NULL,
  "prioridade" integer DEFAULT 50 NOT NULL,
  "impacto_esperado" text,
  "urgencia" text,
  "complexidade" text,
  "tempo_estimado" text,
  "confianca" numeric(3,2) DEFAULT 0.7,
  "justificativa" text NOT NULL,
  "dados" jsonb DEFAULT '{}'::jsonb,
  "status" text DEFAULT 'pendente'::text NOT NULL,
  "origem" text DEFAULT 'auto'::text NOT NULL,
  "responsavel" uuid,
  "resultado" text,
  "impacto_obtido" text,
  "roi_estimado" text,
  "roi_obtido" text,
  "criado_em" timestamp with time zone DEFAULT now() NOT NULL,
  "iniciado_em" timestamp with time zone,
  "concluido_em" timestamp with time zone
);
DO $$ BEGIN
  ALTER TABLE public.orion_missoes ADD CONSTRAINT orion_missoes_chave_key UNIQUE (chave);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.orion_missoes ADD CONSTRAINT orion_missoes_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $$;
CREATE TABLE IF NOT EXISTS public.orion_gov_lifecycle (
  "id" bigint NOT NULL,
  "module" text NOT NULL,
  "fase" text NOT NULL,
  "nota" text,
  "momento" timestamp with time zone DEFAULT now() NOT NULL
);
DO $$ BEGIN
  ALTER TABLE public.orion_gov_lifecycle ADD CONSTRAINT orion_gov_lifecycle_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $$;
CREATE TABLE IF NOT EXISTS public.orion_oce_checks (
  "chave" text NOT NULL,
  "categoria" text NOT NULL,
  "descricao" text,
  "tipo" text DEFAULT 'db'::text NOT NULL,
  "peso" integer DEFAULT 5 NOT NULL,
  "ativo" boolean DEFAULT true NOT NULL
);
DO $$ BEGIN
  ALTER TABLE public.orion_oce_checks ADD CONSTRAINT orion_oce_checks_pkey PRIMARY KEY (chave);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $$;
CREATE TABLE IF NOT EXISTS public.orion_oce_patches (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "run_id" uuid NOT NULL,
  "chave" text NOT NULL,
  "titulo" text,
  "problema" text,
  "patch_sugerido" text,
  "impacto" text,
  "risco" text,
  "rollback" text,
  "status" text DEFAULT 'sugerido'::text NOT NULL,
  "criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
DO $$ BEGIN
  ALTER TABLE public.orion_oce_patches ADD CONSTRAINT orion_oce_patches_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $$;
CREATE TABLE IF NOT EXISTS public.orion_oce_results (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "run_id" uuid NOT NULL,
  "chave" text NOT NULL,
  "categoria" text NOT NULL,
  "status" text NOT NULL,
  "valor" text,
  "esperado" text,
  "evidencia" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "peso" integer DEFAULT 5 NOT NULL,
  "criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
DO $$ BEGIN
  ALTER TABLE public.orion_oce_results ADD CONSTRAINT orion_oce_results_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $$;
CREATE TABLE IF NOT EXISTS public.orion_oce_runs (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "iniciado_em" timestamp with time zone DEFAULT now() NOT NULL,
  "concluido_em" timestamp with time zone,
  "score_geral" numeric,
  "scores" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "verificados" integer DEFAULT 0 NOT NULL,
  "passou" integer DEFAULT 0 NOT NULL,
  "falhou" integer DEFAULT 0 NOT NULL,
  "declarados" integer DEFAULT 0 NOT NULL,
  "veredito" text
);
DO $$ BEGIN
  ALTER TABLE public.orion_oce_runs ADD CONSTRAINT orion_oce_runs_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $$;
CREATE TABLE IF NOT EXISTS public.orion_cost_services (
  "servico" text NOT NULL,
  "categoria" text DEFAULT 'infraestrutura'::text NOT NULL,
  "unidade" text NOT NULL,
  "preco_unitario_usd" numeric(12,6) DEFAULT 0 NOT NULL,
  "fonte" text DEFAULT 'declarado'::text NOT NULL,
  "descricao" text,
  "ativo" boolean DEFAULT true NOT NULL,
  "atualizado_em" timestamp with time zone DEFAULT now() NOT NULL
);
DO $$ BEGIN
  ALTER TABLE public.orion_cost_services ADD CONSTRAINT orion_cost_services_pkey PRIMARY KEY (servico);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $$;
CREATE TABLE IF NOT EXISTS public.orion_cost_usage (
  "dia" date NOT NULL,
  "servico" text NOT NULL,
  "quantidade" numeric(18,4) DEFAULT 0 NOT NULL,
  "custo_estimado_usd" numeric(12,4) DEFAULT 0 NOT NULL,
  "evidencia" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "atualizado_em" timestamp with time zone DEFAULT now() NOT NULL
);
DO $$ BEGIN
  ALTER TABLE public.orion_cost_usage ADD CONSTRAINT orion_cost_usage_pkey PRIMARY KEY (dia, servico);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $$;
CREATE TABLE IF NOT EXISTS public.orion_pacotes_versoes (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "pacote_id" uuid NOT NULL,
  "versao" integer NOT NULL,
  "conteudo" jsonb,
  "recomendacao" jsonb,
  "motivo" text,
  "autor" uuid,
  "criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
DO $$ BEGIN
  ALTER TABLE public.orion_pacotes_versoes ADD CONSTRAINT orion_pacotes_versoes_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $$;
CREATE TABLE IF NOT EXISTS public.orion_perf_alertas (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "severidade" text NOT NULL,
  "titulo" text NOT NULL,
  "dados" jsonb DEFAULT '{}'::jsonb,
  "chave_dia" text NOT NULL,
  "status" text DEFAULT 'aberto'::text NOT NULL,
  "criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
DO $$ BEGIN
  ALTER TABLE public.orion_perf_alertas ADD CONSTRAINT orion_perf_alerta_unico UNIQUE (titulo, chave_dia);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.orion_perf_alertas ADD CONSTRAINT orion_perf_alertas_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $$;
CREATE TABLE IF NOT EXISTS public.orion_perf_analises (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "tipo" text NOT NULL,
  "titulo" text NOT NULL,
  "conteudo" jsonb NOT NULL,
  "criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
DO $$ BEGIN
  ALTER TABLE public.orion_perf_analises ADD CONSTRAINT orion_perf_analises_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $$;
CREATE TABLE IF NOT EXISTS public.orion_perf_snapshots (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "score" integer NOT NULL,
  "componentes" jsonb NOT NULL,
  "metricas" jsonb NOT NULL,
  "criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
DO $$ BEGIN
  ALTER TABLE public.orion_perf_snapshots ADD CONSTRAINT orion_perf_snapshots_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $$;
CREATE TABLE IF NOT EXISTS public.orion_perso_optout (
  "user_id" uuid NOT NULL,
  "criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
DO $$ BEGIN
  ALTER TABLE public.orion_perso_optout ADD CONSTRAINT orion_perso_optout_pkey PRIMARY KEY (user_id);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $$;
CREATE TABLE IF NOT EXISTS public.orion_perso_profiles (
  "user_id" uuid NOT NULL,
  "cidade" text,
  "afinidade_lojas" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "top_produtos" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "horarios" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "sinais" integer DEFAULT 0 NOT NULL,
  "atualizado_em" timestamp with time zone DEFAULT now() NOT NULL
);
DO $$ BEGIN
  ALTER TABLE public.orion_perso_profiles ADD CONSTRAINT orion_perso_profiles_pkey PRIMARY KEY (user_id);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $$;
CREATE TABLE IF NOT EXISTS public.orion_perso_recommendations (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL,
  "tipo" text NOT NULL,
  "ref" text DEFAULT ''::text NOT NULL,
  "titulo" text NOT NULL,
  "score" integer DEFAULT 50 NOT NULL,
  "fatores" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "modulos" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "motivo" text,
  "dia" date DEFAULT ((now() AT TIME ZONE 'America/Cuiaba'::text))::date NOT NULL,
  "criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
DO $$ BEGIN
  ALTER TABLE public.orion_perso_recommendations ADD CONSTRAINT orion_perso_rec_unica UNIQUE (user_id, tipo, ref, dia);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.orion_perso_recommendations ADD CONSTRAINT orion_perso_recommendations_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $$;
CREATE TABLE IF NOT EXISTS public.orion_pricing_history (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "alvo_tabela" text NOT NULL,
  "alvo_id" uuid NOT NULL,
  "campo" text NOT NULL,
  "valor_antigo" numeric(12,2),
  "valor_novo" numeric(12,2),
  "politica_id" uuid,
  "motivo" text,
  "trace_id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "autor" uuid,
  "revertido" boolean DEFAULT false NOT NULL,
  "criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
DO $$ BEGIN
  ALTER TABLE public.orion_pricing_history ADD CONSTRAINT orion_pricing_history_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $$;
CREATE TABLE IF NOT EXISTS public.orion_rep_scores (
  "user_id" uuid NOT NULL,
  "trust_score" numeric(5,2) NOT NULL,
  "nivel" text NOT NULL,
  "sub_scores" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "fatores" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "fatores_positivos" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "fatores_negativos" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "papeis" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "_auditoria" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "computed_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
DO $$ BEGIN
  ALTER TABLE public.orion_rep_scores ADD CONSTRAINT orion_rep_scores_pkey PRIMARY KEY (user_id);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $$;
CREATE TABLE IF NOT EXISTS public.orion_aiops_statistics (
  "dia" date NOT NULL,
  "anomalias" integer DEFAULT 0 NOT NULL,
  "anomalias_criticas" integer DEFAULT 0 NOT NULL,
  "predicoes" integer DEFAULT 0 NOT NULL,
  "acoes_automaticas" integer DEFAULT 0 NOT NULL,
  "acoes_bloqueadas" integer DEFAULT 0 NOT NULL,
  "mttr_min" integer DEFAULT 0 NOT NULL,
  "taxa_automacao" integer DEFAULT 0 NOT NULL,
  "disponibilidade" integer DEFAULT 0 NOT NULL,
  "aos" integer DEFAULT 0 NOT NULL,
  "aps" integer DEFAULT 0 NOT NULL,
  "oas" integer DEFAULT 0 NOT NULL,
  "frs" integer DEFAULT 0 NOT NULL,
  "rhs" integer DEFAULT 0 NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
DO $$ BEGIN
  ALTER TABLE public.orion_aiops_statistics ADD CONSTRAINT orion_aiops_statistics_pkey PRIMARY KEY (dia);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $$;
CREATE TABLE IF NOT EXISTS public.orion_pricing_policies (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "escopo" text DEFAULT 'global'::text NOT NULL,
  "escopo_valor" text,
  "preco_min" numeric(12,2),
  "preco_max" numeric(12,2),
  "margem_min_pct" numeric(5,2),
  "margem_alvo_pct" numeric(5,2),
  "comissao_min_pct" numeric(5,2),
  "comissao_max_pct" numeric(5,2),
  "desconto_max_pct" numeric(5,2) DEFAULT 30,
  "exige_aprovacao" boolean DEFAULT true NOT NULL,
  "versao" integer DEFAULT 1 NOT NULL,
  "ativo" boolean DEFAULT true NOT NULL,
  "autor" uuid,
  "criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
DO $$ BEGIN
  ALTER TABLE public.orion_pricing_policies ADD CONSTRAINT orion_pricing_policies_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $$;
CREATE TABLE IF NOT EXISTS public.orion_aiops_playbooks (
  "playbook_key" text NOT NULL,
  "nome" text NOT NULL,
  "gatilho" text NOT NULL,
  "diagnostico" text,
  "acoes" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "destrutivo" boolean DEFAULT false NOT NULL,
  "ativo" boolean DEFAULT true NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
DO $$ BEGIN
  ALTER TABLE public.orion_aiops_playbooks ADD CONSTRAINT orion_aiops_playbooks_pkey PRIMARY KEY (playbook_key);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $$;
CREATE TABLE IF NOT EXISTS public.orion_publisher_log (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "tabela" text NOT NULL,
  "listing_id" uuid NOT NULL,
  "modulo" text NOT NULL,
  "titulo" text,
  "cidade" text,
  "status" text NOT NULL,
  "problemas" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "similaridade" jsonb,
  "recebido_em" timestamp with time zone DEFAULT now() NOT NULL,
  "processado_em" timestamp with time zone
);
DO $$ BEGIN
  ALTER TABLE public.orion_publisher_log ADD CONSTRAINT orion_publisher_log_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.orion_publisher_log ADD CONSTRAINT orion_publisher_log_tabela_listing_id_key UNIQUE (tabela, listing_id);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $$;
CREATE TABLE IF NOT EXISTS public.orion_recommendation_events (
  "id" bigint NOT NULL,
  "user_id" uuid,
  "target_entity" text,
  "event_type" text NOT NULL,
  "contexto" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
DO $$ BEGIN
  ALTER TABLE public.orion_recommendation_events ADD CONSTRAINT orion_recommendation_events_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $$;
CREATE TABLE IF NOT EXISTS public.orion_recommendations (
  "id" bigint NOT NULL,
  "recommendation_type" text NOT NULL,
  "source_entity" text NOT NULL,
  "target_entity" text NOT NULL,
  "target_type" text NOT NULL,
  "recommendation_score" integer DEFAULT 0 NOT NULL,
  "semantic_score" integer DEFAULT 0 NOT NULL,
  "graph_score" integer DEFAULT 0 NOT NULL,
  "geo_score" integer DEFAULT 0 NOT NULL,
  "behavior_score" integer DEFAULT 0 NOT NULL,
  "quality_score" integer DEFAULT 0 NOT NULL,
  "confidence" integer DEFAULT 0 NOT NULL,
  "reason" text,
  "evidence" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "expires_at" timestamp with time zone DEFAULT (now() + '00:30:00'::interval) NOT NULL
);
DO $$ BEGIN
  ALTER TABLE public.orion_recommendations ADD CONSTRAINT orion_rec_uq UNIQUE (source_entity, target_entity, recommendation_type);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.orion_recommendations ADD CONSTRAINT orion_recommendations_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $$;
CREATE TABLE IF NOT EXISTS public.orion_sales_opportunities (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "tipo" text NOT NULL,
  "ref" text NOT NULL,
  "vertical" text,
  "cidade" text,
  "score" integer DEFAULT 50 NOT NULL,
  "fatores" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "estagio" text DEFAULT 'interesse'::text NOT NULL,
  "valor_estimado" numeric,
  "modulos" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "motivo" text,
  "dia" date DEFAULT ((now() AT TIME ZONE 'America/Cuiaba'::text))::date NOT NULL,
  "criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
DO $$ BEGIN
  ALTER TABLE public.orion_sales_opportunities ADD CONSTRAINT orion_sales_op_unico UNIQUE (tipo, ref, dia);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.orion_sales_opportunities ADD CONSTRAINT orion_sales_opportunities_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $$;
CREATE TABLE IF NOT EXISTS public.orion_search_queries (
  "id" bigint NOT NULL,
  "termo" text NOT NULL,
  "termo_norm" text NOT NULL,
  "cidade" text DEFAULT ''::text NOT NULL,
  "resultados" integer DEFAULT 0 NOT NULL,
  "origem" text DEFAULT 'probe'::text NOT NULL,
  "dia" date DEFAULT CURRENT_DATE NOT NULL,
  "criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
DO $$ BEGIN
  ALTER TABLE public.orion_search_queries ADD CONSTRAINT orion_search_queries_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.orion_search_queries ADD CONSTRAINT orion_search_queries_uq UNIQUE (termo_norm, cidade, dia);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $$;
CREATE TABLE IF NOT EXISTS public.orion_search_recommendations (
  "id" bigint NOT NULL,
  "entidade_tipo" text NOT NULL,
  "entidade_id" text NOT NULL,
  "titulo" text,
  "categoria" text,
  "acao" text NOT NULL,
  "impacto" integer DEFAULT 0 NOT NULL,
  "motivo" text,
  "dia" date DEFAULT CURRENT_DATE NOT NULL,
  "criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
DO $$ BEGIN
  ALTER TABLE public.orion_search_recommendations ADD CONSTRAINT orion_search_recommendations_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.orion_search_recommendations ADD CONSTRAINT orion_search_recs_uq UNIQUE (entidade_tipo, entidade_id, acao, dia);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $$;
CREATE TABLE IF NOT EXISTS public.orion_search_scores (
  "id" bigint NOT NULL,
  "entidade_tipo" text NOT NULL,
  "entidade_id" text NOT NULL,
  "titulo" text,
  "categoria" text,
  "cidade" text,
  "discovery_score" integer DEFAULT 0 NOT NULL,
  "ai_discovery_score" integer DEFAULT 0 NOT NULL,
  "search_score" integer DEFAULT 0 NOT NULL,
  "semantic_score" integer DEFAULT 0 NOT NULL,
  "vde_score" integer DEFAULT 0 NOT NULL,
  "visibilidade" text,
  "fatores" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "pontos_fortes" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "pontos_fracos" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "plano" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "trace_id" text,
  "dia" date DEFAULT CURRENT_DATE NOT NULL,
  "criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
DO $$ BEGIN
  ALTER TABLE public.orion_search_scores ADD CONSTRAINT orion_search_scores_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.orion_search_scores ADD CONSTRAINT orion_search_scores_uq UNIQUE (entidade_tipo, entidade_id, dia);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $$;
CREATE TABLE IF NOT EXISTS public.orion_security_alerts (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "tipo" text NOT NULL,
  "entidade" text DEFAULT 'plataforma'::text NOT NULL,
  "severidade" text DEFAULT 'media'::text NOT NULL,
  "score_risco" integer DEFAULT 50 NOT NULL,
  "fator_risco" text,
  "evidencias" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "modulos" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "confianca" integer DEFAULT 75 NOT NULL,
  "justificativa" text,
  "politica_aplicada" text,
  "dia" date DEFAULT ((now() AT TIME ZONE 'America/Cuiaba'::text))::date NOT NULL,
  "criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
DO $$ BEGIN
  ALTER TABLE public.orion_security_alerts ADD CONSTRAINT orion_security_alert_unico UNIQUE (tipo, entidade, dia);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.orion_security_alerts ADD CONSTRAINT orion_security_alerts_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $$;
CREATE TABLE IF NOT EXISTS public.orion_obs_logs (
  "log_id" bigint NOT NULL,
  "log_at" timestamp with time zone DEFAULT now() NOT NULL,
  "nivel" text DEFAULT 'INFO'::text NOT NULL,
  "origem" text NOT NULL,
  "servico" text,
  "mensagem" text NOT NULL,
  "contexto" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "dedupe_key" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
DO $$ BEGIN
  ALTER TABLE public.orion_obs_logs ADD CONSTRAINT orion_obs_logs_dedupe_key_key UNIQUE (dedupe_key);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.orion_obs_logs ADD CONSTRAINT orion_obs_logs_pkey PRIMARY KEY (log_id);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $$;
CREATE TABLE IF NOT EXISTS public.orion_obs_traces (
  "trace_id" text NOT NULL,
  "started_at" timestamp with time zone NOT NULL,
  "servico" text NOT NULL,
  "operacao" text NOT NULL,
  "status" text DEFAULT 'ok'::text NOT NULL,
  "duracao_ms" integer DEFAULT 0 NOT NULL,
  "spans" integer DEFAULT 1 NOT NULL,
  "origem" text DEFAULT 'cron'::text NOT NULL,
  "evidencias" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
DO $$ BEGIN
  ALTER TABLE public.orion_obs_traces ADD CONSTRAINT orion_obs_traces_pkey PRIMARY KEY (trace_id);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $$;
CREATE TABLE IF NOT EXISTS public.orion_security_config (
  "tipo" text NOT NULL,
  "monitorado" boolean DEFAULT true NOT NULL,
  "limiar" integer DEFAULT 5 NOT NULL,
  "modo" text DEFAULT 'alerta'::text NOT NULL,
  "descricao" text,
  "atualizado_em" timestamp with time zone DEFAULT now() NOT NULL
);
DO $$ BEGIN
  ALTER TABLE public.orion_security_config ADD CONSTRAINT orion_security_config_pkey PRIMARY KEY (tipo);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $$;
CREATE TABLE IF NOT EXISTS public.orion_simulacoes (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "pergunta" text NOT NULL,
  "parametros" jsonb NOT NULL,
  "cenario_atual" jsonb NOT NULL,
  "cenario_simulado" jsonb NOT NULL,
  "resultado" jsonb NOT NULL,
  "criado_por" uuid,
  "criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
DO $$ BEGIN
  ALTER TABLE public.orion_simulacoes ADD CONSTRAINT orion_simulacoes_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $$;
CREATE TABLE IF NOT EXISTS public.orion_support_analises (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "ticket_id" uuid NOT NULL,
  "urgencia" integer NOT NULL,
  "categoria_sugerida" text,
  "prioridade_sugerida" text,
  "tema" text,
  "resumo" text,
  "trace_id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
DO $$ BEGIN
  ALTER TABLE public.orion_support_analises ADD CONSTRAINT orion_support_analise_unica UNIQUE (ticket_id, criado_em);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.orion_support_analises ADD CONSTRAINT orion_support_analises_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $$;
CREATE TABLE IF NOT EXISTS public.orion_sustainability_indicators (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "pilar" text NOT NULL,
  "chave" text NOT NULL,
  "valor" numeric,
  "unidade" text,
  "origem" text,
  "status" text DEFAULT 'real'::text NOT NULL,
  "modulos" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "dia" date DEFAULT ((now() AT TIME ZONE 'America/Cuiaba'::text))::date NOT NULL,
  "criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
DO $$ BEGIN
  ALTER TABLE public.orion_sustainability_indicators ADD CONSTRAINT orion_sustain_ind_unico UNIQUE (pilar, chave, dia);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.orion_sustainability_indicators ADD CONSTRAINT orion_sustainability_indicators_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $$;
CREATE TABLE IF NOT EXISTS public.orion_sustainability_scores (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "escopo" text NOT NULL,
  "escopo_ref" text DEFAULT 'BR'::text NOT NULL,
  "sustainability_score" integer DEFAULT 50 NOT NULL,
  "ambiental" integer DEFAULT 50 NOT NULL,
  "economico" integer DEFAULT 50 NOT NULL,
  "social" integer DEFAULT 50 NOT NULL,
  "vii" integer,
  "opportunity_score" integer,
  "fatores" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "recomendacao" text,
  "confianca" integer DEFAULT 60 NOT NULL,
  "modulos" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "dia" date DEFAULT ((now() AT TIME ZONE 'America/Cuiaba'::text))::date NOT NULL,
  "criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
DO $$ BEGIN
  ALTER TABLE public.orion_sustainability_scores ADD CONSTRAINT orion_sustain_score_unico UNIQUE (escopo, escopo_ref, dia);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.orion_sustainability_scores ADD CONSTRAINT orion_sustainability_scores_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $$;
CREATE TABLE IF NOT EXISTS public.orion_obs_metrics (
  "metric_id" bigint NOT NULL,
  "measured_at" timestamp with time zone DEFAULT now() NOT NULL,
  "metric_key" text NOT NULL,
  "categoria" text NOT NULL,
  "valor" numeric NOT NULL,
  "unidade" text DEFAULT ''::text NOT NULL,
  "origem" text NOT NULL,
  "evidencias" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "dedupe_key" text NOT NULL
);
DO $$ BEGIN
  ALTER TABLE public.orion_obs_metrics ADD CONSTRAINT orion_obs_metrics_dedupe_key_key UNIQUE (dedupe_key);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.orion_obs_metrics ADD CONSTRAINT orion_obs_metrics_pkey PRIMARY KEY (metric_id);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $$;
CREATE TABLE IF NOT EXISTS public.orion_trace (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "trace_id" uuid NOT NULL,
  "request_id" text,
  "correlation_id" text,
  "user_id" uuid,
  "cidade" text,
  "origem" text NOT NULL,
  "destino" text,
  "modulo" text,
  "tempo_ms" integer,
  "resultado" text,
  "erro" text,
  "criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
DO $$ BEGIN
  ALTER TABLE public.orion_trace ADD CONSTRAINT orion_trace_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $$;
CREATE TABLE IF NOT EXISTS public.orion_trust_alerts (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "entidade_tipo" text NOT NULL,
  "entidade_id" text NOT NULL,
  "tipo_risco" text NOT NULL,
  "severidade" text DEFAULT 'media'::text NOT NULL,
  "score_risco" integer DEFAULT 50 NOT NULL,
  "evidencias" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "modulos" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "motivo" text,
  "dia" date DEFAULT ((now() AT TIME ZONE 'America/Cuiaba'::text))::date NOT NULL,
  "criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
DO $$ BEGIN
  ALTER TABLE public.orion_trust_alerts ADD CONSTRAINT orion_trust_alert_unico UNIQUE (entidade_tipo, entidade_id, tipo_risco, dia);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.orion_trust_alerts ADD CONSTRAINT orion_trust_alerts_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $$;
CREATE TABLE IF NOT EXISTS public.orion_trust_scores (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "entidade_tipo" text NOT NULL,
  "entidade_id" text NOT NULL,
  "score" integer DEFAULT 50 NOT NULL,
  "fatores" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "modulos" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "confianca" integer DEFAULT 50 NOT NULL,
  "justificativa" text,
  "dia" date DEFAULT ((now() AT TIME ZONE 'America/Cuiaba'::text))::date NOT NULL,
  "criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
DO $$ BEGIN
  ALTER TABLE public.orion_trust_scores ADD CONSTRAINT orion_trust_score_unico UNIQUE (entidade_tipo, entidade_id, dia);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.orion_trust_scores ADD CONSTRAINT orion_trust_scores_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $$;
CREATE TABLE IF NOT EXISTS public.orion_user_profile (
  "user_id" uuid NOT NULL,
  "preferences_json" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "interest_vector" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "last_categories" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "last_searches" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "last_clicks" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "last_orders" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "favorite_locations" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "behavior_score" integer DEFAULT 0 NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
DO $$ BEGIN
  ALTER TABLE public.orion_user_profile ADD CONSTRAINT orion_user_profile_pkey PRIMARY KEY (user_id);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $$;
CREATE TABLE IF NOT EXISTS public.orion_visitor_navigation (
  "id" bigint NOT NULL,
  "visitor_id" text NOT NULL,
  "page" text NOT NULL,
  "category" text,
  "entity_type" text,
  "entity_id" text,
  "timestamp" timestamp with time zone DEFAULT now() NOT NULL,
  "duration" integer,
  "scroll_percent" integer,
  "clicks" integer DEFAULT 0 NOT NULL,
  "interaction_score" integer DEFAULT 0 NOT NULL
);
DO $$ BEGIN
  ALTER TABLE public.orion_visitor_navigation ADD CONSTRAINT orion_visitor_navigation_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.orion_visitor_navigation ADD CONSTRAINT orion_visnav_uq UNIQUE (visitor_id, page);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $$;
CREATE TABLE IF NOT EXISTS public.orion_visitor_predictions (
  "visitor_id" text NOT NULL,
  "purchase_probability" integer DEFAULT 0 NOT NULL,
  "merchant_probability" integer DEFAULT 0 NOT NULL,
  "motoboy_probability" integer DEFAULT 0 NOT NULL,
  "moto_taxi_probability" integer DEFAULT 0 NOT NULL,
  "advertiser_probability" integer DEFAULT 0 NOT NULL,
  "abandonment_probability" integer DEFAULT 0 NOT NULL,
  "return_probability" integer DEFAULT 0 NOT NULL,
  "vs" integer DEFAULT 0 NOT NULL,
  "vis" integer DEFAULT 0 NOT NULL,
  "cp" integer DEFAULT 0 NOT NULL,
  "es" integer DEFAULT 0 NOT NULL,
  "nds" integer DEFAULT 0 NOT NULL,
  "rp" integer DEFAULT 0 NOT NULL,
  "confidence" integer DEFAULT 0 NOT NULL,
  "evidencia" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
DO $$ BEGIN
  ALTER TABLE public.orion_visitor_predictions ADD CONSTRAINT orion_visitor_predictions_pkey PRIMARY KEY (visitor_id);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $$;
CREATE TABLE IF NOT EXISTS public.orion_visitor_segments (
  "visitor_id" text NOT NULL,
  "segment" text NOT NULL,
  "evidence" text NOT NULL,
  "confidence" integer DEFAULT 0 NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
DO $$ BEGIN
  ALTER TABLE public.orion_visitor_segments ADD CONSTRAINT orion_visitor_segments_pkey PRIMARY KEY (visitor_id);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $$;
CREATE TABLE IF NOT EXISTS public.orion_visitors (
  "visitor_id" text NOT NULL,
  "session_id" text,
  "first_seen" timestamp with time zone,
  "last_seen" timestamp with time zone,
  "device_type" text,
  "browser" text,
  "operating_system" text,
  "country" text,
  "state" text,
  "city" text,
  "language" text,
  "timezone" text,
  "source" text,
  "medium" text,
  "campaign" text,
  "referrer" text,
  "is_logged" boolean DEFAULT false NOT NULL,
  "user_id" uuid,
  "dias_ativos" integer DEFAULT 0 NOT NULL,
  "eventos" integer DEFAULT 0 NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "atualizado_em" timestamp with time zone DEFAULT now() NOT NULL
);
DO $$ BEGIN
  ALTER TABLE public.orion_visitors ADD CONSTRAINT orion_visitors_pkey PRIMARY KEY (visitor_id);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $$;
CREATE TABLE IF NOT EXISTS public.orion_aoc_events (
  "event_id" bigint NOT NULL,
  "captado_em" timestamp with time zone DEFAULT now() NOT NULL,
  "tipo" text NOT NULL,
  "categoria" text NOT NULL,
  "origem" text NOT NULL,
  "alvo" text,
  "severidade" text DEFAULT 'media'::text NOT NULL,
  "status" text DEFAULT 'novo'::text NOT NULL,
  "evidencias" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "dedupe_key" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
DO $$ BEGIN
  ALTER TABLE public.orion_aoc_events ADD CONSTRAINT orion_aoc_events_dedupe_key_key UNIQUE (dedupe_key);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.orion_aoc_events ADD CONSTRAINT orion_aoc_events_pkey PRIMARY KEY (event_id);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $$;
CREATE TABLE IF NOT EXISTS public.orion_aoc_policies (
  "policy_key" text NOT NULL,
  "descricao" text NOT NULL,
  "condicao" text NOT NULL,
  "acao" text NOT NULL,
  "alvo_modulo" text,
  "prioridade" integer DEFAULT 50 NOT NULL,
  "autonomia" text DEFAULT 'semi'::text NOT NULL,
  "limite" integer,
  "janela_inicio" smallint,
  "janela_fim" smallint,
  "financeiro" boolean DEFAULT false NOT NULL,
  "ativa" boolean DEFAULT true NOT NULL,
  "rollback_hint" text,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
DO $$ BEGIN
  ALTER TABLE public.orion_aoc_policies ADD CONSTRAINT orion_aoc_policies_pkey PRIMARY KEY (policy_key);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $$;
CREATE TABLE IF NOT EXISTS public.orion_aoc_decisions (
  "decision_id" bigint NOT NULL,
  "decided_at" timestamp with time zone DEFAULT now() NOT NULL,
  "event_id" bigint,
  "policy_key" text,
  "classe" text NOT NULL,
  "acao" text NOT NULL,
  "motivo" text NOT NULL,
  "impacto" text DEFAULT 'baixo'::text NOT NULL,
  "confianca" integer DEFAULT 0 NOT NULL,
  "resultado" text DEFAULT 'pendente'::text NOT NULL,
  "evidencias" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "rollback_de" bigint,
  "operador" text DEFAULT 'aoc'::text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
DO $$ BEGIN
  ALTER TABLE public.orion_aoc_decisions ADD CONSTRAINT orion_aoc_decisions_pkey PRIMARY KEY (decision_id);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $$;
CREATE TABLE IF NOT EXISTS public.orion_aoc_dispatch (
  "dispatch_id" bigint NOT NULL,
  "decision_id" bigint,
  "modulo" text NOT NULL,
  "tarefa" text NOT NULL,
  "payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "status" text DEFAULT 'enfileirada'::text NOT NULL,
  "resultado" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "dedupe_key" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "executed_at" timestamp with time zone
);
DO $$ BEGIN
  ALTER TABLE public.orion_aoc_dispatch ADD CONSTRAINT orion_aoc_dispatch_dedupe_key_key UNIQUE (dedupe_key);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.orion_aoc_dispatch ADD CONSTRAINT orion_aoc_dispatch_pkey PRIMARY KEY (dispatch_id);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $$;
CREATE TABLE IF NOT EXISTS public.orion_rep_verifications (
  "user_id" uuid NOT NULL,
  "email" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "telefone" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "documento" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "facial" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "identidade" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "atualizado_em" timestamp with time zone DEFAULT now() NOT NULL
);
DO $$ BEGIN
  ALTER TABLE public.orion_rep_verifications ADD CONSTRAINT orion_rep_verifications_pkey PRIMARY KEY (user_id);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $$;
CREATE TABLE IF NOT EXISTS public.orion_audio_radio_stations (
  "station_uuid" text NOT NULL,
  "name" text NOT NULL,
  "countrycode" text,
  "country" text,
  "state" text,
  "tags" text,
  "favicon" text,
  "homepage" text,
  "play_count" bigint DEFAULT 0 NOT NULL,
  "last_played" timestamp with time zone,
  "criado_em" timestamp with time zone DEFAULT now() NOT NULL,
  "atualizado_em" timestamp with time zone DEFAULT now() NOT NULL
);
DO $$ BEGIN
  ALTER TABLE public.orion_audio_radio_stations ADD CONSTRAINT orion_audio_radio_stations_pkey PRIMARY KEY (station_uuid);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $$;
CREATE TABLE IF NOT EXISTS public.orion_exstrat_reports (
  "id" bigint DEFAULT nextval('orion_exstrat_reports_id_seq'::regclass) NOT NULL,
  "tipo" text NOT NULL,
  "periodo" text NOT NULL,
  "titulo" text,
  "conteudo" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "resumo" text,
  "versao" integer DEFAULT 1 NOT NULL,
  "gerado_em" timestamp with time zone DEFAULT now() NOT NULL
);
DO $$ BEGIN
  ALTER TABLE public.orion_exstrat_reports ADD CONSTRAINT orion_exstrat_report_unico UNIQUE (tipo, periodo);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.orion_exstrat_reports ADD CONSTRAINT orion_exstrat_reports_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $$;
CREATE TABLE IF NOT EXISTS public.orion_contact_reveal_log (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL,
  "intention_id" uuid NOT NULL,
  "listing_module" text NOT NULL,
  "listing_id" uuid,
  "buyer_key" text,
  "charged_cents" bigint DEFAULT 0 NOT NULL,
  "wallet_result" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "resultado" text NOT NULL,
  "ip" text,
  "user_agent" text,
  "latency_ms" integer,
  "criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
DO $$ BEGIN
  ALTER TABLE public.orion_contact_reveal_log ADD CONSTRAINT orion_contact_reveal_log_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $$;
CREATE TABLE IF NOT EXISTS public.orion_audio_radio_plays (
  "id" bigint DEFAULT nextval('orion_audio_radio_plays_id_seq'::regclass) NOT NULL,
  "station_uuid" text NOT NULL,
  "name" text,
  "countrycode" text,
  "user_id" uuid,
  "criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
DO $$ BEGIN
  ALTER TABLE public.orion_audio_radio_plays ADD CONSTRAINT orion_audio_radio_plays_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $$;
CREATE TABLE IF NOT EXISTS public.orion_biz_facts (
  "dia" date NOT NULL,
  "dominio" text NOT NULL,
  "chave" text NOT NULL,
  "valor" numeric(18,4) DEFAULT 0 NOT NULL,
  "unidade" text DEFAULT 'qtd'::text NOT NULL,
  "evidencia" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "atualizado_em" timestamp with time zone DEFAULT now() NOT NULL
);
DO $$ BEGIN
  ALTER TABLE public.orion_biz_facts ADD CONSTRAINT orion_biz_facts_pkey PRIMARY KEY (dia, dominio, chave);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $$;
CREATE TABLE IF NOT EXISTS public.orion_rep_history (
  "id" bigint NOT NULL,
  "user_id" uuid NOT NULL,
  "dia" date DEFAULT CURRENT_DATE NOT NULL,
  "trust_score" numeric(5,2) NOT NULL,
  "nivel" text NOT NULL,
  "sub_scores" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
DO $$ BEGIN
  ALTER TABLE public.orion_rep_history ADD CONSTRAINT orion_rep_history_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.orion_rep_history ADD CONSTRAINT orion_rep_history_user_id_dia_key UNIQUE (user_id, dia);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $$;
CREATE TABLE IF NOT EXISTS public.orion_rep_badges_catalog (
  "badge_key" text NOT NULL,
  "nome" text NOT NULL,
  "descricao" text NOT NULL,
  "icone" text DEFAULT '🏅'::text NOT NULL,
  "regra" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "ativo" boolean DEFAULT true NOT NULL,
  "criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
DO $$ BEGIN
  ALTER TABLE public.orion_rep_badges_catalog ADD CONSTRAINT orion_rep_badges_catalog_pkey PRIMARY KEY (badge_key);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $$;
CREATE TABLE IF NOT EXISTS public.orion_arremate_messages (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "listing_id" uuid NOT NULL,
  "deal_id" uuid,
  "sender_user_id" uuid NOT NULL,
  "sender_party" text NOT NULL,
  "body" text,
  "attachments" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
DO $$ BEGIN
  ALTER TABLE public.orion_arremate_messages ADD CONSTRAINT orion_arremate_messages_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $$;
CREATE TABLE IF NOT EXISTS public.orion_brand_profiles (
  "brand_id" bigint NOT NULL,
  "dedupe_key" text NOT NULL,
  "ref_tipo" text NOT NULL,
  "ref_id" text,
  "nome" text NOT NULL,
  "slogan" text,
  "missao" text,
  "visao" text,
  "valores" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "segmento" text,
  "categoria" text,
  "subcategoria" text,
  "logo_url" text,
  "icon_url" text,
  "estilo_visual" text,
  "cidade" text,
  "estado" text,
  "brand_score" integer DEFAULT 0 NOT NULL,
  "identity_score" integer DEFAULT 0 NOT NULL,
  "consistency" integer DEFAULT 0 NOT NULL,
  "status" text DEFAULT 'ativo'::text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
DO $$ BEGIN
  ALTER TABLE public.orion_brand_profiles ADD CONSTRAINT orion_brand_profiles_dedupe_key_key UNIQUE (dedupe_key);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.orion_brand_profiles ADD CONSTRAINT orion_brand_profiles_pkey PRIMARY KEY (brand_id);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $$;
CREATE TABLE IF NOT EXISTS public.orion_brand_versions (
  "id" bigint NOT NULL,
  "brand_id" bigint NOT NULL,
  "versao" integer NOT NULL,
  "snapshot" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "motivo" text,
  "criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
DO $$ BEGIN
  ALTER TABLE public.orion_brand_versions ADD CONSTRAINT orion_brand_versions_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $$;
CREATE TABLE IF NOT EXISTS public.orion_brand_history (
  "id" bigint NOT NULL,
  "brand_id" bigint,
  "evento" text NOT NULL,
  "dados" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
DO $$ BEGIN
  ALTER TABLE public.orion_brand_history ADD CONSTRAINT orion_brand_history_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $$;
CREATE TABLE IF NOT EXISTS public.orion_layout_templates (
  "id" bigint DEFAULT nextval('orion_layout_templates_id_seq'::regclass) NOT NULL,
  "template_key" text NOT NULL,
  "familia" text NOT NULL,
  "descricao" text,
  "slots" jsonb NOT NULL,
  "ativo" boolean DEFAULT true NOT NULL,
  "criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
DO $$ BEGIN
  ALTER TABLE public.orion_layout_templates ADD CONSTRAINT orion_layout_templates_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.orion_layout_templates ADD CONSTRAINT orion_layout_templates_template_key_key UNIQUE (template_key);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $$;
CREATE TABLE IF NOT EXISTS public.orion_layout_versions (
  "id" bigint DEFAULT nextval('orion_layout_versions_id_seq'::regclass) NOT NULL,
  "layout_id" bigint NOT NULL,
  "versao" integer NOT NULL,
  "composicao" jsonb NOT NULL,
  "layout_score" integer,
  "criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
DO $$ BEGIN
  ALTER TABLE public.orion_layout_versions ADD CONSTRAINT orion_layout_version_unico UNIQUE (layout_id, versao);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.orion_layout_versions ADD CONSTRAINT orion_layout_versions_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $$;
CREATE TABLE IF NOT EXISTS public.orion_marketplace_contact_charges (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "listing_module" text NOT NULL,
  "listing_id" uuid NOT NULL,
  "buyer_key" text NOT NULL,
  "advertiser_account_id" uuid,
  "credits_charged" integer DEFAULT 0 NOT NULL,
  "product_value_brl" numeric,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
DO $$ BEGIN
  ALTER TABLE public.orion_marketplace_contact_charges ADD CONSTRAINT orion_marketplace_contact_cha_listing_module_listing_id_buy_key UNIQUE (listing_module, listing_id, buyer_key);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.orion_marketplace_contact_charges ADD CONSTRAINT orion_marketplace_contact_charges_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $$;
CREATE TABLE IF NOT EXISTS public.orion_commission_policy (
  "context" text NOT NULL,
  "percent" numeric NOT NULL,
  "credits_per_real" numeric DEFAULT 1 NOT NULL,
  "min_credits" integer,
  "max_credits" integer,
  "active" boolean DEFAULT true NOT NULL,
  "note" text,
  "updated_by" uuid,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
DO $$ BEGIN
  ALTER TABLE public.orion_commission_policy ADD CONSTRAINT orion_commission_policy_pkey PRIMARY KEY (context);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $$;
CREATE TABLE IF NOT EXISTS public.orion_tpl_objectives (
  "objetivo" text NOT NULL,
  "sazonal" boolean DEFAULT false NOT NULL,
  "mes" integer,
  "descricao" text
);
DO $$ BEGIN
  ALTER TABLE public.orion_tpl_objectives ADD CONSTRAINT orion_tpl_objectives_pkey PRIMARY KEY (objetivo);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $$;
CREATE TABLE IF NOT EXISTS public.orion_tpl_formats (
  "formato" text NOT NULL,
  "rede" text NOT NULL,
  "largura" integer NOT NULL,
  "altura" integer NOT NULL,
  "aspecto" text NOT NULL
);
DO $$ BEGIN
  ALTER TABLE public.orion_tpl_formats ADD CONSTRAINT orion_tpl_formats_pkey PRIMARY KEY (formato);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $$;
CREATE TABLE IF NOT EXISTS public.orion_audio_settings (
  "user_id" uuid NOT NULL,
  "config" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
DO $$ BEGIN
  ALTER TABLE public.orion_audio_settings ADD CONSTRAINT orion_audio_settings_pkey PRIMARY KEY (user_id);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $$;
CREATE TABLE IF NOT EXISTS public.orion_tpl_versions (
  "id" bigint NOT NULL,
  "template_id" bigint NOT NULL,
  "versao" integer NOT NULL,
  "snapshot" jsonb NOT NULL,
  "autor" text,
  "criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
DO $$ BEGIN
  ALTER TABLE public.orion_tpl_versions ADD CONSTRAINT orion_tpl_ver_uq UNIQUE (template_id, versao);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.orion_tpl_versions ADD CONSTRAINT orion_tpl_versions_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $$;
CREATE TABLE IF NOT EXISTS public.orion_tpl_usage (
  "id" bigint NOT NULL,
  "template_id" bigint NOT NULL,
  "evento" text NOT NULL,
  "ref_tipo" text,
  "ref_id" text,
  "cidade" text,
  "rede" text,
  "criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
DO $$ BEGIN
  ALTER TABLE public.orion_tpl_usage ADD CONSTRAINT orion_tpl_usage_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $$;
CREATE TABLE IF NOT EXISTS public.orion_tpl_favorites (
  "ref_tipo" text NOT NULL,
  "ref_id" text NOT NULL,
  "template_id" bigint NOT NULL,
  "criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
DO $$ BEGIN
  ALTER TABLE public.orion_tpl_favorites ADD CONSTRAINT orion_tpl_favorites_pkey PRIMARY KEY (ref_tipo, ref_id, template_id);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $$;
CREATE TABLE IF NOT EXISTS public.orion_tpl_recommendations (
  "id" bigint NOT NULL,
  "contexto" jsonb NOT NULL,
  "template_id" bigint,
  "motivo" text,
  "confianca" integer,
  "criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
DO $$ BEGIN
  ALTER TABLE public.orion_tpl_recommendations ADD CONSTRAINT orion_tpl_recommendations_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $$;
CREATE TABLE IF NOT EXISTS public.orion_tpl_statistics (
  "data" date NOT NULL,
  "total" integer DEFAULT 0 NOT NULL,
  "ativos" integer DEFAULT 0 NOT NULL,
  "premium" integer DEFAULT 0 NOT NULL,
  "usos" integer DEFAULT 0 NOT NULL,
  "conversoes" integer DEFAULT 0 NOT NULL,
  "tps" integer DEFAULT 0 NOT NULL,
  "cvs" integer DEFAULT 0 NOT NULL,
  "atualizado_em" timestamp with time zone DEFAULT now() NOT NULL
);
DO $$ BEGIN
  ALTER TABLE public.orion_tpl_statistics ADD CONSTRAINT orion_tpl_statistics_pkey PRIMARY KEY (data);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $$;
CREATE TABLE IF NOT EXISTS public.orion_alc_ratings (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "deal_id" uuid NOT NULL,
  "rater_user_id" uuid NOT NULL,
  "ratee_user_id" uuid NOT NULL,
  "rater_party" text NOT NULL,
  "stars" integer NOT NULL,
  "pontualidade" integer,
  "comunicacao" integer,
  "qualidade" integer,
  "experiencia" integer,
  "comment" text,
  "at" timestamp with time zone DEFAULT now() NOT NULL
);
DO $$ BEGIN
  ALTER TABLE public.orion_alc_ratings ADD CONSTRAINT orion_alc_ratings_deal_id_rater_party_key UNIQUE (deal_id, rater_party);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.orion_alc_ratings ADD CONSTRAINT orion_alc_ratings_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $$;
CREATE TABLE IF NOT EXISTS public.orion_alc_disputes (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "deal_id" uuid NOT NULL,
  "opened_by_user_id" uuid,
  "opened_by_party" text,
  "motivo" text NOT NULL,
  "evidencias" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "status" text DEFAULT 'aberta'::text NOT NULL,
  "decisao" text,
  "decided_by" uuid,
  "decided_at" timestamp with time zone,
  "at" timestamp with time zone DEFAULT now() NOT NULL
);
DO $$ BEGIN
  ALTER TABLE public.orion_alc_disputes ADD CONSTRAINT orion_alc_disputes_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $$;
CREATE TABLE IF NOT EXISTS public.orion_alc_deals (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "listing_id" uuid NOT NULL,
  "seller_user_id" uuid,
  "buyer_user_id" uuid,
  "amount" numeric DEFAULT 0 NOT NULL,
  "listing_type" text,
  "category" text,
  "city" text,
  "status" text DEFAULT 'aguardando_contato'::text NOT NULL,
  "buyer_contato_at" timestamp with time zone,
  "seller_contato_at" timestamp with time zone,
  "buyer_recebido_at" timestamp with time zone,
  "seller_entregue_at" timestamp with time zone,
  "buyer_concluido_at" timestamp with time zone,
  "seller_concluido_at" timestamp with time zone,
  "first_contact_at" timestamp with time zone,
  "concluded_at" timestamp with time zone,
  "canceled_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
DO $$ BEGIN
  ALTER TABLE public.orion_alc_deals ADD CONSTRAINT orion_alc_deals_listing_id_key UNIQUE (listing_id);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.orion_alc_deals ADD CONSTRAINT orion_alc_deals_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $$;
CREATE TABLE IF NOT EXISTS public.orion_alc_events (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "deal_id" uuid NOT NULL,
  "event_type" text NOT NULL,
  "from_status" text,
  "to_status" text,
  "actor_user_id" uuid,
  "party" text,
  "detail" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "at" timestamp with time zone DEFAULT now() NOT NULL
);
DO $$ BEGIN
  ALTER TABLE public.orion_alc_events ADD CONSTRAINT orion_alc_events_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $$;
CREATE TABLE IF NOT EXISTS public.orion_audio_presets (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL,
  "nome" text NOT NULL,
  "bands" jsonb NOT NULL,
  "origem" text DEFAULT 'manual'::text NOT NULL,
  "criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
DO $$ BEGIN
  ALTER TABLE public.orion_audio_presets ADD CONSTRAINT orion_audio_presets_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.orion_audio_presets ADD CONSTRAINT orion_audio_presets_user_id_nome_key UNIQUE (user_id, nome);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $$;
CREATE TABLE IF NOT EXISTS public.orion_audio_events (
  "id" bigint NOT NULL,
  "user_id" uuid DEFAULT auth.uid() NOT NULL,
  "evento" text NOT NULL,
  "detalhes" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
DO $$ BEGIN
  ALTER TABLE public.orion_audio_events ADD CONSTRAINT orion_audio_events_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $$;
CREATE TABLE IF NOT EXISTS public.orion_auction_intel_refresh_log (
  "id" bigint NOT NULL,
  "refreshed_at" timestamp with time zone DEFAULT now() NOT NULL,
  "registros" integer DEFAULT 0 NOT NULL,
  "duracao_ms" integer
);
DO $$ BEGIN
  ALTER TABLE public.orion_auction_intel_refresh_log ADD CONSTRAINT orion_auction_intel_refresh_log_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $$;
CREATE TABLE IF NOT EXISTS public.orion_aeo_modules (
  "engine_key" text NOT NULL,
  "nome" text NOT NULL,
  "tipo" text NOT NULL,
  "tabela_principal" text,
  "dashboard_fn" text,
  "tick_fn" text,
  "selftest_fn" text,
  "status" text DEFAULT 'desconhecido'::text NOT NULL,
  "disponivel" boolean DEFAULT false NOT NULL,
  "ultima_checagem" timestamp with time zone
);
DO $$ BEGIN
  ALTER TABLE public.orion_aeo_modules ADD CONSTRAINT orion_aeo_modules_pkey PRIMARY KEY (engine_key);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $$;
CREATE TABLE IF NOT EXISTS public.orion_aeo_events (
  "id" bigint DEFAULT nextval('orion_aeo_events_id_seq'::regclass) NOT NULL,
  "origem" text NOT NULL,
  "origem_id" text,
  "event_type" text,
  "listing_id" text,
  "payload" jsonb,
  "trace_id" uuid,
  "criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
DO $$ BEGIN
  ALTER TABLE public.orion_aeo_events ADD CONSTRAINT orion_aeo_event_unico UNIQUE (origem, origem_id);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.orion_aeo_events ADD CONSTRAINT orion_aeo_events_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $$;
CREATE TABLE IF NOT EXISTS public.orion_aeo_health (
  "id" bigint DEFAULT nextval('orion_aeo_health_id_seq'::regclass) NOT NULL,
  "componente" text NOT NULL,
  "status" text NOT NULL,
  "detalhe" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "medido_em" timestamp with time zone DEFAULT now() NOT NULL
);
DO $$ BEGIN
  ALTER TABLE public.orion_aeo_health ADD CONSTRAINT orion_aeo_health_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.orion_aeo_health ADD CONSTRAINT orion_aeo_health_unico UNIQUE (componente);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $$;
CREATE TABLE IF NOT EXISTS public.orion_aeo_workflow (
  "stage_key" text NOT NULL,
  "ordem" integer NOT NULL,
  "descricao" text,
  "depende_de" text,
  "status" text DEFAULT 'monitorado'::text NOT NULL,
  "consistencia_pct" numeric,
  "evidencias" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "atualizado_em" timestamp with time zone DEFAULT now() NOT NULL
);
DO $$ BEGIN
  ALTER TABLE public.orion_aeo_workflow ADD CONSTRAINT orion_aeo_workflow_pkey PRIMARY KEY (stage_key);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $$;
CREATE TABLE IF NOT EXISTS public.orion_aeo_quality (
  "id" bigint DEFAULT nextval('orion_aeo_quality_id_seq'::regclass) NOT NULL,
  "check_key" text NOT NULL,
  "categoria" text NOT NULL,
  "ok" boolean NOT NULL,
  "achados" bigint DEFAULT 0 NOT NULL,
  "evidencias" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
DO $$ BEGIN
  ALTER TABLE public.orion_aeo_quality ADD CONSTRAINT orion_aeo_quality_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.orion_aeo_quality ADD CONSTRAINT orion_aeo_quality_unico UNIQUE (check_key);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $$;
CREATE TABLE IF NOT EXISTS public.orion_aeo_performance (
  "id" bigint DEFAULT nextval('orion_aeo_performance_id_seq'::regclass) NOT NULL,
  "metrica" text NOT NULL,
  "valor" numeric,
  "unidade" text,
  "threshold" numeric,
  "ok" boolean,
  "evidencias" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
DO $$ BEGIN
  ALTER TABLE public.orion_aeo_performance ADD CONSTRAINT orion_aeo_perf_unico UNIQUE (metrica);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.orion_aeo_performance ADD CONSTRAINT orion_aeo_performance_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $$;
CREATE TABLE IF NOT EXISTS public.orion_aeo_scores (
  "dia" date DEFAULT ((now() AT TIME ZONE 'America/Cuiaba'::text))::date NOT NULL,
  "orchestration_score" integer,
  "health_score" integer,
  "workflow_score" integer,
  "performance_score" integer,
  "reliability_score" integer,
  "security_score" integer,
  "integration_score" integer,
  "componentes" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
DO $$ BEGIN
  ALTER TABLE public.orion_aeo_scores ADD CONSTRAINT orion_aeo_scores_pkey PRIMARY KEY (dia);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $$;
CREATE TABLE IF NOT EXISTS public.orion_aeo_predictions (
  "id" bigint DEFAULT nextval('orion_aeo_predictions_id_seq'::regclass) NOT NULL,
  "tipo" text NOT NULL,
  "previsao" text,
  "base" text,
  "confianca" integer,
  "dados_analisados" bigint,
  "horizonte" text,
  "evidencias" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
DO $$ BEGIN
  ALTER TABLE public.orion_aeo_predictions ADD CONSTRAINT orion_aeo_pred_unico UNIQUE (tipo);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.orion_aeo_predictions ADD CONSTRAINT orion_aeo_predictions_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $$;
CREATE TABLE IF NOT EXISTS public.orion_aeo_bi (
  "dia" date DEFAULT ((now() AT TIME ZONE 'America/Cuiaba'::text))::date NOT NULL,
  "leiloes_total" bigint,
  "leiloes_ativos" bigint,
  "leiloes_encerrados" bigint,
  "arremates" bigint,
  "gmv" numeric,
  "receita_comissoes" numeric,
  "creditos_consumidos" numeric,
  "lances_total" bigint,
  "participantes" bigint,
  "backlog_encerramento" bigint,
  "componentes" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
DO $$ BEGIN
  ALTER TABLE public.orion_aeo_bi ADD CONSTRAINT orion_aeo_bi_pkey PRIMARY KEY (dia);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $$;
CREATE TABLE IF NOT EXISTS public.orion_agrowth_snapshots (
  "dia" date NOT NULL,
  "vendedores" bigint DEFAULT 0 NOT NULL,
  "compradores" bigint DEFAULT 0 NOT NULL,
  "leiloes_ativos" bigint DEFAULT 0 NOT NULL,
  "leiloes_total" bigint DEFAULT 0 NOT NULL,
  "lances" bigint DEFAULT 0 NOT NULL,
  "arremates" bigint DEFAULT 0 NOT NULL,
  "watchers" bigint DEFAULT 0 NOT NULL,
  "gmv" numeric DEFAULT 0 NOT NULL,
  "receita" numeric DEFAULT 0 NOT NULL,
  "ticket_medio" numeric DEFAULT 0 NOT NULL,
  "liquidez" numeric DEFAULT 0 NOT NULL,
  "conversao" numeric DEFAULT 0 NOT NULL,
  "novos_vendedores" bigint DEFAULT 0 NOT NULL,
  "novos_compradores" bigint DEFAULT 0 NOT NULL,
  "novos_leiloes" bigint DEFAULT 0 NOT NULL,
  "detalhe" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
DO $$ BEGIN
  ALTER TABLE public.orion_agrowth_snapshots ADD CONSTRAINT orion_agrowth_snapshots_pkey PRIMARY KEY (dia);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $$;
CREATE TABLE IF NOT EXISTS public.orion_agrowth_geo (
  "dia" date NOT NULL,
  "escopo" text NOT NULL,
  "chave" text NOT NULL,
  "uf" text,
  "populacao" bigint,
  "oferta" bigint DEFAULT 0 NOT NULL,
  "demanda" bigint DEFAULT 0 NOT NULL,
  "gmv" numeric DEFAULT 0 NOT NULL,
  "participacao" numeric DEFAULT 0 NOT NULL,
  "densidade" numeric DEFAULT 0 NOT NULL,
  "criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
DO $$ BEGIN
  ALTER TABLE public.orion_agrowth_geo ADD CONSTRAINT orion_agrowth_geo_pkey PRIMARY KEY (dia, escopo, chave);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $$;
CREATE TABLE IF NOT EXISTS public.orion_agrowth_scores (
  "dia" date NOT NULL,
  "growth" integer DEFAULT 0 NOT NULL,
  "expansion" integer DEFAULT 0 NOT NULL,
  "prediction" integer DEFAULT 0 NOT NULL,
  "analytics" integer DEFAULT 0 NOT NULL,
  "performance" integer DEFAULT 0 NOT NULL,
  "detalhe" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
DO $$ BEGIN
  ALTER TABLE public.orion_agrowth_scores ADD CONSTRAINT orion_agrowth_scores_pkey PRIMARY KEY (dia);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $$;
CREATE TABLE IF NOT EXISTS public.orion_agrowth_opportunities (
  "id" bigint DEFAULT nextval('orion_agrowth_opportunities_id_seq'::regclass) NOT NULL,
  "tipo" text NOT NULL,
  "escopo" text,
  "chave" text,
  "titulo" text NOT NULL,
  "evidencia" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "potencial" numeric DEFAULT 0 NOT NULL,
  "confianca" numeric DEFAULT 0 NOT NULL,
  "n_amostras" bigint DEFAULT 0 NOT NULL,
  "dedupe_key" text NOT NULL,
  "ativo" boolean DEFAULT true NOT NULL,
  "detectada_em" timestamp with time zone DEFAULT now() NOT NULL
);
DO $$ BEGIN
  ALTER TABLE public.orion_agrowth_opportunities ADD CONSTRAINT orion_agrowth_opportunities_dedupe_key_key UNIQUE (dedupe_key);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.orion_agrowth_opportunities ADD CONSTRAINT orion_agrowth_opportunities_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $$;
CREATE TABLE IF NOT EXISTS public.orion_agrowth_recommendations (
  "id" bigint DEFAULT nextval('orion_agrowth_recommendations_id_seq'::regclass) NOT NULL,
  "publico" text NOT NULL,
  "alvo" text,
  "tipo" text NOT NULL,
  "recomendacao" text NOT NULL,
  "evidencia" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "confianca" numeric DEFAULT 0 NOT NULL,
  "dedupe_key" text NOT NULL,
  "criada_em" timestamp with time zone DEFAULT now() NOT NULL
);
DO $$ BEGIN
  ALTER TABLE public.orion_agrowth_recommendations ADD CONSTRAINT orion_agrowth_recommendations_dedupe_key_key UNIQUE (dedupe_key);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.orion_agrowth_recommendations ADD CONSTRAINT orion_agrowth_recommendations_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $$;
CREATE TABLE IF NOT EXISTS public.orion_fn_backups (
  "id" bigint NOT NULL,
  "fn_name" text NOT NULL,
  "backup_key" text NOT NULL,
  "definition" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
DO $$ BEGIN
  ALTER TABLE public.orion_fn_backups ADD CONSTRAINT orion_fn_backups_backup_key_key UNIQUE (backup_key);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.orion_fn_backups ADD CONSTRAINT orion_fn_backups_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $$;
CREATE TABLE IF NOT EXISTS public.orion_brand_templates (
  "id" bigint NOT NULL,
  "brand_id" bigint,
  "canal" text NOT NULL,
  "template" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
DO $$ BEGIN
  ALTER TABLE public.orion_brand_templates ADD CONSTRAINT brand_tpl_uq UNIQUE (brand_id, canal);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.orion_brand_templates ADD CONSTRAINT orion_brand_templates_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $$;
CREATE TABLE IF NOT EXISTS public.orion_eventos_operacionais (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "tipo" text NOT NULL,
  "titulo" text NOT NULL,
  "cidade" text,
  "uf" text,
  "inicio" date NOT NULL,
  "fim" date NOT NULL,
  "descricao" text,
  "criado_por" uuid,
  "criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
DO $$ BEGIN
  ALTER TABLE public.orion_eventos_operacionais ADD CONSTRAINT orion_eventos_operacionais_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $$;
CREATE TABLE IF NOT EXISTS public.orion_learning_snapshots (
  "id" bigint NOT NULL,
  "dia" date NOT NULL,
  "eventos_total" bigint DEFAULT 0 NOT NULL,
  "tipos_ativos" integer DEFAULT 0 NOT NULL,
  "origens_ativas" integer DEFAULT 0 NOT NULL,
  "learning_score" integer DEFAULT 0 NOT NULL,
  "kpis" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
DO $$ BEGIN
  ALTER TABLE public.orion_learning_snapshots ADD CONSTRAINT orion_learning_snapshots_dia_key UNIQUE (dia);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.orion_learning_snapshots ADD CONSTRAINT orion_learning_snapshots_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $$;
CREATE TABLE IF NOT EXISTS public.orion_learning_lessons (
  "id" bigint NOT NULL,
  "chave" text NOT NULL,
  "categoria" text NOT NULL,
  "licao" text NOT NULL,
  "evidencia" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "origem" text,
  "confianca" integer DEFAULT 0 NOT NULL,
  "dia" date DEFAULT CURRENT_DATE NOT NULL,
  "criado_em" timestamp with time zone DEFAULT now() NOT NULL,
  "atualizado_em" timestamp with time zone DEFAULT now() NOT NULL
);
DO $$ BEGIN
  ALTER TABLE public.orion_learning_lessons ADD CONSTRAINT orion_learning_lessons_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.orion_learning_lessons ADD CONSTRAINT orion_learning_lessons_uq UNIQUE (chave, dia);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $$;
CREATE TABLE IF NOT EXISTS public.orion_learning_patterns (
  "id" bigint NOT NULL,
  "tipo" text NOT NULL,
  "origem" text,
  "freq_total" bigint DEFAULT 0 NOT NULL,
  "freq_7d" bigint DEFAULT 0 NOT NULL,
  "freq_7d_ant" bigint DEFAULT 0 NOT NULL,
  "tendencia" text DEFAULT 'estavel'::text NOT NULL,
  "variacao_pct" numeric DEFAULT 0 NOT NULL,
  "dia" date DEFAULT CURRENT_DATE NOT NULL
);
DO $$ BEGIN
  ALTER TABLE public.orion_learning_patterns ADD CONSTRAINT orion_learning_patterns_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.orion_learning_patterns ADD CONSTRAINT orion_learning_patterns_uq UNIQUE (tipo, dia);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $$;
CREATE TABLE IF NOT EXISTS public.orion_identity_profiles (
  "identity_id" bigint NOT NULL,
  "user_id" uuid NOT NULL,
  "tipo_usuario" text,
  "perfis_disponiveis" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "is_admin" boolean DEFAULT false NOT NULL,
  "roles" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "nivel_confianca" text DEFAULT 'medio'::text NOT NULL,
  "identity_score" integer DEFAULT 50 NOT NULL,
  "access_trust_score" integer DEFAULT 50 NOT NULL,
  "status" text DEFAULT 'ativo'::text NOT NULL,
  "evidencias" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
DO $$ BEGIN
  ALTER TABLE public.orion_identity_profiles ADD CONSTRAINT orion_identity_profiles_pkey PRIMARY KEY (identity_id);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.orion_identity_profiles ADD CONSTRAINT orion_identity_profiles_user_id_key UNIQUE (user_id);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $$;
CREATE TABLE IF NOT EXISTS public.orion_access_sessions (
  "session_id" uuid NOT NULL,
  "user_id" uuid NOT NULL,
  "device_id" text,
  "ip" text,
  "localizacao" text,
  "navegador" text,
  "sistema_operacional" text,
  "aal" text,
  "mfa" boolean DEFAULT false NOT NULL,
  "login_at" timestamp with time zone,
  "refreshed_at" timestamp with time zone,
  "not_after" timestamp with time zone,
  "logout_at" timestamp with time zone,
  "status" text DEFAULT 'ativa'::text NOT NULL,
  "session_score" integer DEFAULT 50 NOT NULL,
  "risk_score" integer DEFAULT 0 NOT NULL,
  "evidencias" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
DO $$ BEGIN
  ALTER TABLE public.orion_access_sessions ADD CONSTRAINT orion_access_sessions_pkey PRIMARY KEY (session_id);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $$;
CREATE TABLE IF NOT EXISTS public.orion_devices (
  "device_id" text NOT NULL,
  "user_id" uuid NOT NULL,
  "fingerprint" text NOT NULL,
  "user_agent" text,
  "navegador" text,
  "sistema_operacional" text,
  "first_seen" timestamp with time zone DEFAULT now() NOT NULL,
  "last_seen" timestamp with time zone DEFAULT now() NOT NULL,
  "sessoes" integer DEFAULT 0 NOT NULL,
  "confianca" integer DEFAULT 20 NOT NULL,
  "bloqueado" boolean DEFAULT false NOT NULL,
  "bloqueado_motivo" text,
  "evidencias" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
DO $$ BEGIN
  ALTER TABLE public.orion_devices ADD CONSTRAINT orion_devices_pkey PRIMARY KEY (device_id);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $$;
CREATE TABLE IF NOT EXISTS public.orion_access_events (
  "event_id" bigint NOT NULL,
  "event_at" timestamp with time zone DEFAULT now() NOT NULL,
  "tipo" text NOT NULL,
  "categoria" text NOT NULL,
  "user_id" uuid,
  "session_id" uuid,
  "device_id" text,
  "ip" text,
  "severity" text DEFAULT 'baixa'::text NOT NULL,
  "score" integer DEFAULT 0 NOT NULL,
  "evidencias" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "status" text DEFAULT 'registrada'::text NOT NULL,
  "origem" text DEFAULT 'engine'::text NOT NULL,
  "dedupe_key" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
DO $$ BEGIN
  ALTER TABLE public.orion_access_events ADD CONSTRAINT orion_access_events_dedupe_key_key UNIQUE (dedupe_key);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.orion_access_events ADD CONSTRAINT orion_access_events_pkey PRIMARY KEY (event_id);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $$;
CREATE TABLE IF NOT EXISTS public.orion_access_policies (
  "policy_key" text NOT NULL,
  "descricao" text NOT NULL,
  "perfil" text DEFAULT 'todos'::text NOT NULL,
  "acao" text NOT NULL,
  "min_score" integer DEFAULT 0 NOT NULL,
  "mfa_obrigatorio" boolean DEFAULT false NOT NULL,
  "aprovacao" text DEFAULT 'automatica'::text NOT NULL,
  "ativa" boolean DEFAULT true NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
DO $$ BEGIN
  ALTER TABLE public.orion_access_policies ADD CONSTRAINT orion_access_policies_pkey PRIMARY KEY (policy_key);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $$;
CREATE TABLE IF NOT EXISTS public.orion_identity_statistics (
  "dia" date NOT NULL,
  "logins" integer DEFAULT 0 NOT NULL,
  "logins_suspeitos" integer DEFAULT 0 NOT NULL,
  "sessoes_ativas" integer DEFAULT 0 NOT NULL,
  "sessoes_risco_alto" integer DEFAULT 0 NOT NULL,
  "mfa_executado" integer DEFAULT 0 NOT NULL,
  "dispositivos_novos" integer DEFAULT 0 NOT NULL,
  "dispositivos_confiaveis" integer DEFAULT 0 NOT NULL,
  "is_medio" integer DEFAULT 0 NOT NULL,
  "ats_medio" integer DEFAULT 0 NOT NULL,
  "srs_medio" integer DEFAULT 0 NOT NULL,
  "dcs_medio" integer DEFAULT 0 NOT NULL,
  "mar" numeric DEFAULT 0 NOT NULL,
  "iii" integer DEFAULT 0 NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
DO $$ BEGIN
  ALTER TABLE public.orion_identity_statistics ADD CONSTRAINT orion_identity_statistics_pkey PRIMARY KEY (dia);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $$;
CREATE TABLE IF NOT EXISTS public.orion_biz_insights (
  "id" bigint NOT NULL,
  "dedupe_key" text NOT NULL,
  "tipo" text NOT NULL,
  "titulo" text NOT NULL,
  "detalhe" text,
  "prioridade" integer DEFAULT 3 NOT NULL,
  "evidencias" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "status" text DEFAULT 'aberto'::text NOT NULL,
  "criado_em" timestamp with time zone DEFAULT now() NOT NULL,
  "atualizado_em" timestamp with time zone DEFAULT now() NOT NULL
);
DO $$ BEGIN
  ALTER TABLE public.orion_biz_insights ADD CONSTRAINT orion_biz_insights_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.orion_biz_insights ADD CONSTRAINT orion_biz_insights_uq UNIQUE (dedupe_key);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $$;
CREATE TABLE IF NOT EXISTS public.orion_incidents (
  "incident_id" bigint NOT NULL,
  "dedupe_key" text NOT NULL,
  "titulo" text NOT NULL,
  "categoria" text NOT NULL,
  "severidade" text DEFAULT 'informativo'::text NOT NULL,
  "status" text DEFAULT 'aberto'::text NOT NULL,
  "origem_modulo" text NOT NULL,
  "ref" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "user_id" uuid,
  "trace" text,
  "irs" integer DEFAULT 0 NOT NULL,
  "ics" integer DEFAULT 0 NOT NULL,
  "playbook" text,
  "reincidencia" integer DEFAULT 0 NOT NULL,
  "aberto_em" timestamp with time zone DEFAULT now() NOT NULL,
  "respondido_em" timestamp with time zone,
  "resolvido_em" timestamp with time zone,
  "fechado_em" timestamp with time zone,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
DO $$ BEGIN
  ALTER TABLE public.orion_incidents ADD CONSTRAINT orion_incidents_dedupe_uq UNIQUE (dedupe_key);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.orion_incidents ADD CONSTRAINT orion_incidents_pkey PRIMARY KEY (incident_id);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $$;
CREATE TABLE IF NOT EXISTS public.orion_ip_reputation (
  "ip" text NOT NULL,
  "asn" text,
  "pais" text,
  "reputacao" integer DEFAULT 50 NOT NULL,
  "categoria" text DEFAULT 'desconhecido'::text NOT NULL,
  "ocorrencias" integer DEFAULT 0 NOT NULL,
  "evidencias" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "first_seen" timestamp with time zone DEFAULT now() NOT NULL,
  "last_seen" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
DO $$ BEGIN
  ALTER TABLE public.orion_ip_reputation ADD CONSTRAINT orion_ip_reputation_pkey PRIMARY KEY (ip);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $$;
CREATE TABLE IF NOT EXISTS public.orion_incident_playbooks (
  "categoria" text NOT NULL,
  "nome" text NOT NULL,
  "passos" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "automatico" boolean DEFAULT true NOT NULL,
  "ativo" boolean DEFAULT true NOT NULL,
  "execucoes" integer DEFAULT 0 NOT NULL,
  "atualizado_em" timestamp with time zone DEFAULT now() NOT NULL
);
DO $$ BEGIN
  ALTER TABLE public.orion_incident_playbooks ADD CONSTRAINT orion_incident_playbooks_pkey PRIMARY KEY (categoria);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $$;
CREATE TABLE IF NOT EXISTS public.orion_incident_assignments (
  "id" bigint NOT NULL,
  "incident_id" bigint NOT NULL,
  "responsavel" text NOT NULL,
  "papel" text DEFAULT 'analista'::text NOT NULL,
  "atribuido_em" timestamp with time zone DEFAULT now() NOT NULL,
  "encerrado_em" timestamp with time zone
);
DO $$ BEGIN
  ALTER TABLE public.orion_incident_assignments ADD CONSTRAINT orion_incident_assignments_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $$;
CREATE TABLE IF NOT EXISTS public.orion_incident_statistics (
  "data" date NOT NULL,
  "abertos" integer DEFAULT 0 NOT NULL,
  "resolvidos" integer DEFAULT 0 NOT NULL,
  "criticos" integer DEFAULT 0 NOT NULL,
  "reincidencias" integer DEFAULT 0 NOT NULL,
  "mtta_min" integer DEFAULT 0 NOT NULL,
  "mttr_min" integer DEFAULT 0 NOT NULL,
  "playbooks_exec" integer DEFAULT 0 NOT NULL,
  "acoes_auto" integer DEFAULT 0 NOT NULL,
  "acoes_humanas" integer DEFAULT 0 NOT NULL,
  "por_modulo" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "por_usuario" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "severidade_media" numeric(4,1) DEFAULT 0 NOT NULL,
  "atualizado_em" timestamp with time zone DEFAULT now() NOT NULL
);
DO $$ BEGIN
  ALTER TABLE public.orion_incident_statistics ADD CONSTRAINT orion_incident_statistics_pkey PRIMARY KEY (data);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $$;
CREATE TABLE IF NOT EXISTS public.orion_incident_state (
  "chave" text NOT NULL,
  "last_id" bigint DEFAULT 0 NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
DO $$ BEGIN
  ALTER TABLE public.orion_incident_state ADD CONSTRAINT orion_incident_state_pkey PRIMARY KEY (chave);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $$;
CREATE TABLE IF NOT EXISTS public.orion_incident_events (
  "id" bigint NOT NULL,
  "incident_id" bigint NOT NULL,
  "tipo" text NOT NULL,
  "dados" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
DO $$ BEGIN
  ALTER TABLE public.orion_incident_events ADD CONSTRAINT orion_incident_events_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $$;
CREATE TABLE IF NOT EXISTS public.orion_incident_actions (
  "action_id" bigint NOT NULL,
  "incident_id" bigint NOT NULL,
  "acao" text NOT NULL,
  "alvo" text,
  "justificativa" text NOT NULL,
  "executor" text DEFAULT 'playbook'::text NOT NULL,
  "resultado" text DEFAULT 'executada'::text NOT NULL,
  "reversivel" boolean DEFAULT false NOT NULL,
  "rolled_back" boolean DEFAULT false NOT NULL,
  "ref" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
DO $$ BEGIN
  ALTER TABLE public.orion_incident_actions ADD CONSTRAINT orion_incident_actions_pkey PRIMARY KEY (action_id);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $$;
CREATE TABLE IF NOT EXISTS public.orion_incident_timeline (
  "id" bigint NOT NULL,
  "incident_id" bigint NOT NULL,
  "momento" timestamp with time zone DEFAULT now() NOT NULL,
  "origem" text NOT NULL,
  "descricao" text NOT NULL,
  "ator" text DEFAULT 'incident_response'::text NOT NULL,
  "evidencias" jsonb DEFAULT '{}'::jsonb NOT NULL
);
DO $$ BEGIN
  ALTER TABLE public.orion_incident_timeline ADD CONSTRAINT orion_incident_timeline_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $$;
CREATE TABLE IF NOT EXISTS public.orion_incident_evidence (
  "id" bigint NOT NULL,
  "incident_id" bigint NOT NULL,
  "tipo" text NOT NULL,
  "origem" text NOT NULL,
  "conteudo" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
DO $$ BEGIN
  ALTER TABLE public.orion_incident_evidence ADD CONSTRAINT orion_incident_evidence_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $$;
CREATE TABLE IF NOT EXISTS public.orion_backup_jobs (
  "job_id" bigint NOT NULL,
  "tipo" text NOT NULL,
  "origem" text NOT NULL,
  "destino" text,
  "inicio" timestamp with time zone DEFAULT now() NOT NULL,
  "fim" timestamp with time zone,
  "duracao_s" integer,
  "tamanho_bytes" bigint,
  "objetos" integer DEFAULT 0 NOT NULL,
  "checksum" text,
  "integridade" text DEFAULT 'desconhecida'::text NOT NULL,
  "status" text DEFAULT 'concluido'::text NOT NULL,
  "evidencias" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
DO $$ BEGIN
  ALTER TABLE public.orion_backup_jobs ADD CONSTRAINT orion_backup_jobs_pkey PRIMARY KEY (job_id);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $$;
CREATE TABLE IF NOT EXISTS public.orion_threat_correlations (
  "correlation_id" bigint NOT NULL,
  "dedupe_key" text NOT NULL,
  "origem" text NOT NULL,
  "destino" text NOT NULL,
  "relacao" text NOT NULL,
  "evidencias" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "peso" integer DEFAULT 0 NOT NULL,
  "confianca" integer DEFAULT 0 NOT NULL,
  "status" text DEFAULT 'ativa'::text NOT NULL,
  "trace" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
DO $$ BEGIN
  ALTER TABLE public.orion_threat_correlations ADD CONSTRAINT orion_threat_correlations_dedupe_key_key UNIQUE (dedupe_key);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.orion_threat_correlations ADD CONSTRAINT orion_threat_correlations_pkey PRIMARY KEY (correlation_id);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $$;
CREATE TABLE IF NOT EXISTS public.orion_recovery_plans (
  "plan_id" bigint NOT NULL,
  "dedupe_key" text NOT NULL,
  "nome" text NOT NULL,
  "escopo" text NOT NULL,
  "rpo_meta_min" integer DEFAULT 1440 NOT NULL,
  "rto_meta_min" integer DEFAULT 240 NOT NULL,
  "passos" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "prioridade" integer DEFAULT 1 NOT NULL,
  "ativo" boolean DEFAULT true NOT NULL,
  "atualizado_em" timestamp with time zone DEFAULT now() NOT NULL
);
DO $$ BEGIN
  ALTER TABLE public.orion_recovery_plans ADD CONSTRAINT orion_recovery_plans_dedupe_key_key UNIQUE (dedupe_key);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.orion_recovery_plans ADD CONSTRAINT orion_recovery_plans_pkey PRIMARY KEY (plan_id);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $$;
CREATE TABLE IF NOT EXISTS public.orion_backup_catalog (
  "catalog_id" bigint NOT NULL,
  "dedupe_key" text NOT NULL,
  "tipo" text NOT NULL,
  "referencia" text NOT NULL,
  "metodo" text NOT NULL,
  "criado_em" timestamp with time zone,
  "tamanho_bytes" bigint,
  "integro" boolean,
  "presente" boolean DEFAULT false NOT NULL,
  "evidencias" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "atualizado_em" timestamp with time zone DEFAULT now() NOT NULL
);
DO $$ BEGIN
  ALTER TABLE public.orion_backup_catalog ADD CONSTRAINT orion_backup_catalog_dedupe_key_key UNIQUE (dedupe_key);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.orion_backup_catalog ADD CONSTRAINT orion_backup_catalog_pkey PRIMARY KEY (catalog_id);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $$;
CREATE TABLE IF NOT EXISTS public.orion_biz_alerts (
  "id" bigint NOT NULL,
  "alerta" text NOT NULL,
  "severidade" text DEFAULT 'media'::text NOT NULL,
  "categoria" text NOT NULL,
  "chave" text DEFAULT 'geral'::text NOT NULL,
  "evidencias" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "resolvido" boolean DEFAULT false NOT NULL,
  "dia" date DEFAULT ((now() AT TIME ZONE 'America/Cuiaba'::text))::date NOT NULL,
  "criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
DO $$ BEGIN
  ALTER TABLE public.orion_biz_alerts ADD CONSTRAINT orion_biz_alerts_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.orion_biz_alerts ADD CONSTRAINT orion_biz_alerts_uq UNIQUE (categoria, chave, dia);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $$;
CREATE TABLE IF NOT EXISTS public.orion_recovery_events (
  "event_id" bigint NOT NULL,
  "plan_id" bigint,
  "tipo" text NOT NULL,
  "status" text DEFAULT 'registrado'::text NOT NULL,
  "motivo" text,
  "operador" text DEFAULT 'backup_recovery'::text NOT NULL,
  "evidencias" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
DO $$ BEGIN
  ALTER TABLE public.orion_recovery_events ADD CONSTRAINT orion_recovery_events_pkey PRIMARY KEY (event_id);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $$;
CREATE TABLE IF NOT EXISTS public.orion_backup_alerts (
  "alert_id" bigint NOT NULL,
  "dedupe_key" text NOT NULL,
  "tipo" text NOT NULL,
  "severidade" text DEFAULT 'media'::text NOT NULL,
  "mensagem" text NOT NULL,
  "evidencias" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "status" text DEFAULT 'aberto'::text NOT NULL,
  "dia" date DEFAULT CURRENT_DATE NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
DO $$ BEGIN
  ALTER TABLE public.orion_backup_alerts ADD CONSTRAINT orion_backup_alerts_pkey PRIMARY KEY (alert_id);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.orion_backup_alerts ADD CONSTRAINT orion_bkalert_uq UNIQUE (dedupe_key, dia);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $$;
CREATE TABLE IF NOT EXISTS public.orion_backup_statistics (
  "dia" date NOT NULL,
  "backups_validados" integer DEFAULT 0 NOT NULL,
  "integros" integer DEFAULT 0 NOT NULL,
  "drifts" integer DEFAULT 0 NOT NULL,
  "restore_tests" integer DEFAULT 0 NOT NULL,
  "restore_aprovados" integer DEFAULT 0 NOT NULL,
  "rpo_min" integer DEFAULT 0 NOT NULL,
  "rto_min" integer DEFAULT 0 NOT NULL,
  "brs" integer DEFAULT 0 NOT NULL,
  "rrs" integer DEFAULT 0 NOT NULL,
  "dis" integer DEFAULT 0 NOT NULL,
  "cri" integer DEFAULT 0 NOT NULL,
  "alertas_abertos" integer DEFAULT 0 NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
DO $$ BEGIN
  ALTER TABLE public.orion_backup_statistics ADD CONSTRAINT orion_backup_statistics_pkey PRIMARY KEY (dia);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $$;
CREATE TABLE IF NOT EXISTS public.orion_backup_evidence (
  "evidence_id" bigint NOT NULL,
  "job_id" bigint,
  "categoria" text NOT NULL,
  "objetos" integer DEFAULT 0 NOT NULL,
  "checksum" text NOT NULL,
  "criticidade" text DEFAULT 'media'::text NOT NULL,
  "capturado_em" timestamp with time zone DEFAULT now() NOT NULL
);
DO $$ BEGIN
  ALTER TABLE public.orion_backup_evidence ADD CONSTRAINT orion_backup_evidence_pkey PRIMARY KEY (evidence_id);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $$;
CREATE TABLE IF NOT EXISTS public.orion_predict_forecasts (
  "dominio" text NOT NULL,
  "alvo" text NOT NULL,
  "horizonte_dias" integer NOT NULL,
  "gerado_em" date NOT NULL,
  "valor_projetado" numeric(18,4) NOT NULL,
  "modelo" text NOT NULL,
  "confianca" integer DEFAULT 50 NOT NULL,
  "margem_erro_pct" numeric(6,2),
  "fatores" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "base" jsonb DEFAULT '{}'::jsonb NOT NULL
);
DO $$ BEGIN
  ALTER TABLE public.orion_predict_forecasts ADD CONSTRAINT orion_predict_forecasts_pkey PRIMARY KEY (dominio, alvo, horizonte_dias, gerado_em);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $$;
CREATE TABLE IF NOT EXISTS public.orion_predict_alerts (
  "id" bigint NOT NULL,
  "alerta" text NOT NULL,
  "severidade" text DEFAULT 'media'::text NOT NULL,
  "categoria" text NOT NULL,
  "chave" text DEFAULT 'geral'::text NOT NULL,
  "evidencias" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "dia" date DEFAULT ((now() AT TIME ZONE 'America/Cuiaba'::text))::date NOT NULL,
  "criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
DO $$ BEGIN
  ALTER TABLE public.orion_predict_alerts ADD CONSTRAINT orion_predict_alerts_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.orion_predict_alerts ADD CONSTRAINT orion_predict_alerts_uq UNIQUE (categoria, chave, dia);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $$;
CREATE TABLE IF NOT EXISTS public.orion_predict_accuracy (
  "dominio" text NOT NULL,
  "alvo" text NOT NULL,
  "alvo_data" date NOT NULL,
  "previsto" numeric(18,4) NOT NULL,
  "realizado" numeric(18,4),
  "erro_abs" numeric(18,4),
  "gerado_em" date NOT NULL
);
DO $$ BEGIN
  ALTER TABLE public.orion_predict_accuracy ADD CONSTRAINT orion_predict_accuracy_pkey PRIMARY KEY (dominio, alvo, alvo_data, gerado_em);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $$;
CREATE TABLE IF NOT EXISTS public.orion_fraud_statistics (
  "dia" date NOT NULL,
  "fraudes_detectadas" integer DEFAULT 0 NOT NULL,
  "fraudes_confirmadas" integer DEFAULT 0 NOT NULL,
  "falsos_positivos" integer DEFAULT 0 NOT NULL,
  "em_analise" integer DEFAULT 0 NOT NULL,
  "perdas_evitadas" numeric DEFAULT 0 NOT NULL,
  "tempo_medio_resposta_s" integer DEFAULT 0 NOT NULL,
  "fpr" numeric DEFAULT 0 NOT NULL,
  "fdr" numeric DEFAULT 0 NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
DO $$ BEGIN
  ALTER TABLE public.orion_fraud_statistics ADD CONSTRAINT orion_fraud_statistics_pkey PRIMARY KEY (dia);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $$;
CREATE TABLE IF NOT EXISTS public.orion_secaudit_baseline (
  "configuracao" text NOT NULL,
  "valor_esperado" text NOT NULL,
  "valor_encontrado" text,
  "divergente" boolean DEFAULT false NOT NULL,
  "atualizado_em" timestamp with time zone DEFAULT now() NOT NULL
);
DO $$ BEGIN
  ALTER TABLE public.orion_secaudit_baseline ADD CONSTRAINT orion_secaudit_baseline_pkey PRIMARY KEY (configuracao);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $$;
CREATE TABLE IF NOT EXISTS public.orion_aiops_actions (
  "action_id" bigint NOT NULL,
  "anomaly_id" bigint,
  "acao" text NOT NULL,
  "automatica" boolean DEFAULT true NOT NULL,
  "resultado" text DEFAULT 'executada'::text NOT NULL,
  "motivo" text,
  "duracao_ms" integer,
  "evidencias" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "operador" text DEFAULT 'aiops'::text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
DO $$ BEGIN
  ALTER TABLE public.orion_aiops_actions ADD CONSTRAINT orion_aiops_actions_pkey PRIMARY KEY (action_id);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $$;
CREATE TABLE IF NOT EXISTS public.orion_zero_trust_evidence (
  "evidence_id" bigint NOT NULL,
  "ref_tipo" text NOT NULL,
  "ref_id" text NOT NULL,
  "evidencias" jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
DO $$ BEGIN
  ALTER TABLE public.orion_zero_trust_evidence ADD CONSTRAINT orion_zero_trust_evidence_pkey PRIMARY KEY (evidence_id);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $$;
CREATE TABLE IF NOT EXISTS public.orion_zero_trust_policies (
  "policy_key" text NOT NULL,
  "descricao" text NOT NULL,
  "escopo" text DEFAULT 'global'::text NOT NULL,
  "escopo_ref" text,
  "limiar_permitir" integer DEFAULT 80 NOT NULL,
  "limiar_monitorar" integer DEFAULT 65 NOT NULL,
  "limiar_reautenticar" integer DEFAULT 50 NOT NULL,
  "limiar_mfa" integer DEFAULT 40 NOT NULL,
  "limiar_aprovacao" integer DEFAULT 25 NOT NULL,
  "limiar_bloqueio" integer DEFAULT 15 NOT NULL,
  "mfa_quando_disponivel" boolean DEFAULT true NOT NULL,
  "excecao_ate" timestamp with time zone,
  "excecao_motivo" text,
  "ativa" boolean DEFAULT true NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
DO $$ BEGIN
  ALTER TABLE public.orion_zero_trust_policies ADD CONSTRAINT orion_zero_trust_policies_pkey PRIMARY KEY (policy_key);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $$;
CREATE TABLE IF NOT EXISTS public.orion_zero_trust_decisions (
  "decision_id" bigint NOT NULL,
  "decided_at" timestamp with time zone DEFAULT now() NOT NULL,
  "user_id" uuid,
  "session_id" uuid,
  "device_id" text,
  "modulo" text DEFAULT 'geral'::text NOT NULL,
  "acao" text DEFAULT 'acesso'::text NOT NULL,
  "decisao" text NOT NULL,
  "justificativa" text NOT NULL,
  "zts" integer DEFAULT 0 NOT NULL,
  "cas" integer DEFAULT 0 NOT NULL,
  "das" integer DEFAULT 0 NOT NULL,
  "sas" integer DEFAULT 0 NOT NULL,
  "rcs" integer DEFAULT 0 NOT NULL,
  "politica" text DEFAULT 'zt_global'::text NOT NULL,
  "excecao" boolean DEFAULT false NOT NULL,
  "origem" text DEFAULT 'rpc'::text NOT NULL,
  "rollback_de" bigint,
  "evidencias" jsonb DEFAULT '{}'::jsonb NOT NULL
);
DO $$ BEGIN
  ALTER TABLE public.orion_zero_trust_decisions ADD CONSTRAINT orion_zero_trust_decisions_pkey PRIMARY KEY (decision_id);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $$;
CREATE TABLE IF NOT EXISTS public.orion_zero_trust_context (
  "user_id" uuid NOT NULL,
  "horas_habituais" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "logins_30d" integer DEFAULT 0 NOT NULL,
  "media_diaria" numeric DEFAULT 0 NOT NULL,
  "atividade_hoje" integer DEFAULT 0 NOT NULL,
  "mudanca_brusca" boolean DEFAULT false NOT NULL,
  "permissao_alterada_7d" boolean DEFAULT false NOT NULL,
  "modulos" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "evidencias" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
DO $$ BEGIN
  ALTER TABLE public.orion_zero_trust_context ADD CONSTRAINT orion_zero_trust_context_pkey PRIMARY KEY (user_id);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $$;
CREATE TABLE IF NOT EXISTS public.orion_zero_trust_devices (
  "device_id" text NOT NULL,
  "user_id" uuid NOT NULL,
  "das" integer DEFAULT 20 NOT NULL,
  "estado" text DEFAULT 'monitorado'::text NOT NULL,
  "motivos" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
DO $$ BEGIN
  ALTER TABLE public.orion_zero_trust_devices ADD CONSTRAINT orion_zero_trust_devices_pkey PRIMARY KEY (device_id);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $$;
CREATE TABLE IF NOT EXISTS public.orion_zero_trust_sessions (
  "session_id" uuid NOT NULL,
  "user_id" uuid NOT NULL,
  "sas" integer DEFAULT 50 NOT NULL,
  "estado" text DEFAULT 'monitorada'::text NOT NULL,
  "ultima_avaliacao" timestamp with time zone DEFAULT now() NOT NULL,
  "evidencias" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
DO $$ BEGIN
  ALTER TABLE public.orion_zero_trust_sessions ADD CONSTRAINT orion_zero_trust_sessions_pkey PRIMARY KEY (session_id);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $$;
CREATE TABLE IF NOT EXISTS public.orion_zero_trust_risk (
  "user_id" uuid NOT NULL,
  "risco_acumulado" integer DEFAULT 0 NOT NULL,
  "componentes" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "persistente_desde" timestamp with time zone,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
DO $$ BEGIN
  ALTER TABLE public.orion_zero_trust_risk ADD CONSTRAINT orion_zero_trust_risk_pkey PRIMARY KEY (user_id);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $$;
CREATE TABLE IF NOT EXISTS public.orion_zero_trust_statistics (
  "dia" date NOT NULL,
  "decisoes" integer DEFAULT 0 NOT NULL,
  "permitidas" integer DEFAULT 0 NOT NULL,
  "monitoradas" integer DEFAULT 0 NOT NULL,
  "reautenticacoes" integer DEFAULT 0 NOT NULL,
  "mfa_exigido" integer DEFAULT 0 NOT NULL,
  "aprovacoes_admin" integer DEFAULT 0 NOT NULL,
  "bloqueios" integer DEFAULT 0 NOT NULL,
  "negadas" integer DEFAULT 0 NOT NULL,
  "sessoes_monitoradas" integer DEFAULT 0 NOT NULL,
  "sessoes_bloqueio_recom" integer DEFAULT 0 NOT NULL,
  "dispositivos_confiaveis" integer DEFAULT 0 NOT NULL,
  "dispositivos_em_risco" integer DEFAULT 0 NOT NULL,
  "zts_medio" integer DEFAULT 0 NOT NULL,
  "rcs_medio" integer DEFAULT 0 NOT NULL,
  "ztg" integer DEFAULT 0 NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
DO $$ BEGIN
  ALTER TABLE public.orion_zero_trust_statistics ADD CONSTRAINT orion_zero_trust_statistics_pkey PRIMARY KEY (dia);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $$;
CREATE TABLE IF NOT EXISTS public.orion_compliance_controls (
  "controle" text NOT NULL,
  "nome" text NOT NULL,
  "categoria" text DEFAULT 'lgpd'::text NOT NULL,
  "status" text DEFAULT 'declarado'::text NOT NULL,
  "evidencia" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "ultima_verificacao" timestamp with time zone DEFAULT now() NOT NULL
);
DO $$ BEGIN
  ALTER TABLE public.orion_compliance_controls ADD CONSTRAINT orion_compliance_controls_pkey PRIMARY KEY (controle);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $$;
CREATE TABLE IF NOT EXISTS public.orion_data_processing_registry (
  "atividade" text NOT NULL,
  "categoria_dados" text NOT NULL,
  "finalidade" text NOT NULL,
  "base_legal" text,
  "origem" text NOT NULL,
  "destino" text DEFAULT 'interno'::text NOT NULL,
  "retencao" text NOT NULL,
  "responsavel" text DEFAULT 'plataforma'::text NOT NULL,
  "tabelas" text[] DEFAULT '{}'::text[] NOT NULL,
  "atualizado_em" timestamp with time zone DEFAULT now() NOT NULL
);
DO $$ BEGIN
  ALTER TABLE public.orion_data_processing_registry ADD CONSTRAINT orion_data_processing_registry_pkey PRIMARY KEY (atividade);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $$;
CREATE TABLE IF NOT EXISTS public.orion_data_retention (
  "item" text NOT NULL,
  "tabela" text NOT NULL,
  "politica_dias" integer NOT NULL,
  "atual_dias" integer,
  "vencido" boolean DEFAULT false NOT NULL,
  "excecao_legal" text,
  "verificado_em" timestamp with time zone DEFAULT now() NOT NULL
);
DO $$ BEGIN
  ALTER TABLE public.orion_data_retention ADD CONSTRAINT orion_data_retention_pkey PRIMARY KEY (item);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $$;
CREATE TABLE IF NOT EXISTS public.orion_privacy_incidents (
  "id" bigint NOT NULL,
  "dedupe_key" text NOT NULL,
  "tipo" text NOT NULL,
  "severidade" text DEFAULT 'media'::text NOT NULL,
  "descricao" text NOT NULL,
  "evidencias" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "origem" text NOT NULL,
  "status" text DEFAULT 'aberto'::text NOT NULL,
  "encaminhado_ai45" boolean DEFAULT false NOT NULL,
  "criado_em" timestamp with time zone DEFAULT now() NOT NULL,
  "atualizado_em" timestamp with time zone DEFAULT now() NOT NULL
);
DO $$ BEGIN
  ALTER TABLE public.orion_privacy_incidents ADD CONSTRAINT orion_privacy_incidents_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.orion_privacy_incidents ADD CONSTRAINT orion_privacy_incidents_uq UNIQUE (dedupe_key);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $$;
CREATE TABLE IF NOT EXISTS public.orion_compliance_statistics (
  "data" date NOT NULL,
  "controles_conformes" integer DEFAULT 0 NOT NULL,
  "controles_risco" integer DEFAULT 0 NOT NULL,
  "requests_abertas" integer DEFAULT 0 NOT NULL,
  "requests_concluidas" integer DEFAULT 0 NOT NULL,
  "requests_vencidas" integer DEFAULT 0 NOT NULL,
  "incidentes_abertos" integer DEFAULT 0 NOT NULL,
  "retencao_vencida" integer DEFAULT 0 NOT NULL,
  "cps" integer DEFAULT 0 NOT NULL,
  "lcs" integer DEFAULT 0 NOT NULL,
  "drs" integer DEFAULT 0 NOT NULL,
  "prs" integer DEFAULT 0 NOT NULL,
  "atualizado_em" timestamp with time zone DEFAULT now() NOT NULL
);
DO $$ BEGIN
  ALTER TABLE public.orion_compliance_statistics ADD CONSTRAINT orion_compliance_statistics_pkey PRIMARY KEY (data);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $$;
CREATE TABLE IF NOT EXISTS public.orion_compliance_alerts (
  "id" bigint NOT NULL,
  "alerta" text NOT NULL,
  "severidade" text DEFAULT 'media'::text NOT NULL,
  "categoria" text NOT NULL,
  "chave" text DEFAULT 'geral'::text NOT NULL,
  "evidencias" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "resolvido" boolean DEFAULT false NOT NULL,
  "dia" date DEFAULT ((now() AT TIME ZONE 'America/Cuiaba'::text))::date NOT NULL,
  "criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
DO $$ BEGIN
  ALTER TABLE public.orion_compliance_alerts ADD CONSTRAINT orion_compliance_alerts_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.orion_compliance_alerts ADD CONSTRAINT orion_compliance_alerts_uq UNIQUE (categoria, chave, dia);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $$;
CREATE TABLE IF NOT EXISTS public.orion_compliance_evidence (
  "id" bigint NOT NULL,
  "tipo" text NOT NULL,
  "origem" text NOT NULL,
  "conteudo" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
DO $$ BEGIN
  ALTER TABLE public.orion_compliance_evidence ADD CONSTRAINT orion_compliance_evidence_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $$;
CREATE TABLE IF NOT EXISTS public.orion_twin_entities (
  "entidade" text NOT NULL,
  "tipo" text NOT NULL,
  "origem" text DEFAULT 'auto'::text NOT NULL,
  "metadados" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "atualizado_em" timestamp with time zone DEFAULT now() NOT NULL
);
DO $$ BEGIN
  ALTER TABLE public.orion_twin_entities ADD CONSTRAINT orion_twin_entities_pkey PRIMARY KEY (tipo, entidade);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $$;
CREATE TABLE IF NOT EXISTS public.orion_twin_baselines (
  "metrica" text NOT NULL,
  "valor" numeric(18,4) NOT NULL,
  "unidade" text NOT NULL,
  "fonte" text NOT NULL,
  "medido_em" timestamp with time zone DEFAULT now() NOT NULL
);
DO $$ BEGIN
  ALTER TABLE public.orion_twin_baselines ADD CONSTRAINT orion_twin_baselines_pkey PRIMARY KEY (metrica);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $$;
CREATE TABLE IF NOT EXISTS public.orion_biz_kpis (
  "dia" date NOT NULL,
  "kpi" text NOT NULL,
  "valor" numeric(18,4),
  "unidade" text DEFAULT 'qtd'::text NOT NULL,
  "metodologia" text NOT NULL,
  "base" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "atualizado_em" timestamp with time zone DEFAULT now() NOT NULL
);
DO $$ BEGIN
  ALTER TABLE public.orion_biz_kpis ADD CONSTRAINT orion_biz_kpis_pkey PRIMARY KEY (dia, kpi);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $$;
CREATE TABLE IF NOT EXISTS public.orion_biz_forecasts (
  "kpi" text NOT NULL,
  "horizonte_dias" integer NOT NULL,
  "gerado_em" date NOT NULL,
  "valor_projetado" numeric(18,4) NOT NULL,
  "base" jsonb DEFAULT '{}'::jsonb NOT NULL
);
DO $$ BEGIN
  ALTER TABLE public.orion_biz_forecasts ADD CONSTRAINT orion_biz_forecasts_pkey PRIMARY KEY (kpi, horizonte_dias, gerado_em);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $$;
CREATE TABLE IF NOT EXISTS public.orion_biz_statistics (
  "data" date NOT NULL,
  "bis" integer DEFAULT 0 NOT NULL,
  "mgs" integer DEFAULT 0 NOT NULL,
  "fhs" integer DEFAULT 0 NOT NULL,
  "mps" integer DEFAULT 0 NOT NULL,
  "ues" integer DEFAULT 0 NOT NULL,
  "bps" integer DEFAULT 0 NOT NULL,
  "receita_dia_brl" numeric(14,2) DEFAULT 0 NOT NULL,
  "atualizado_em" timestamp with time zone DEFAULT now() NOT NULL
);
DO $$ BEGIN
  ALTER TABLE public.orion_biz_statistics ADD CONSTRAINT orion_biz_statistics_pkey PRIMARY KEY (data);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $$;
CREATE TABLE IF NOT EXISTS public.orion_biz_reports (
  "id" bigint NOT NULL,
  "trace" text NOT NULL,
  "tipo" text DEFAULT 'execucao'::text NOT NULL,
  "conteudo" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
DO $$ BEGIN
  ALTER TABLE public.orion_biz_reports ADD CONSTRAINT orion_biz_reports_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $$;
CREATE TABLE IF NOT EXISTS public.orion_soc_dashboard (
  "snapshot_id" bigint NOT NULL,
  "gerado_em" timestamp with time zone DEFAULT now() NOT NULL,
  "oss" integer DEFAULT 0 NOT NULL,
  "ors" integer DEFAULT 0 NOT NULL,
  "ghs" integer DEFAULT 0 NOT NULL,
  "ecs" integer DEFAULT 0 NOT NULL,
  "modulos_ok" integer DEFAULT 0 NOT NULL,
  "modulos_total" integer DEFAULT 0 NOT NULL,
  "incidentes_criticos" integer DEFAULT 0 NOT NULL,
  "alertas_ativos" integer DEFAULT 0 NOT NULL,
  "payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "trace" text
);
DO $$ BEGIN
  ALTER TABLE public.orion_soc_dashboard ADD CONSTRAINT orion_soc_dashboard_pkey PRIMARY KEY (snapshot_id);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $$;
CREATE TABLE IF NOT EXISTS public.orion_soc_alerts (
  "alert_id" bigint NOT NULL,
  "dedupe_key" text NOT NULL,
  "tipo" text NOT NULL,
  "severidade" text DEFAULT 'media'::text NOT NULL,
  "mensagem" text NOT NULL,
  "modulos" text[] DEFAULT '{}'::text[] NOT NULL,
  "evidencias" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "status" text DEFAULT 'aberto'::text NOT NULL,
  "dia" date DEFAULT CURRENT_DATE NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
DO $$ BEGIN
  ALTER TABLE public.orion_soc_alerts ADD CONSTRAINT orion_soc_alert_uq UNIQUE (dedupe_key, dia);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.orion_soc_alerts ADD CONSTRAINT orion_soc_alerts_pkey PRIMARY KEY (alert_id);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $$;
CREATE TABLE IF NOT EXISTS public.orion_soc_incidents (
  "soc_incident_id" bigint NOT NULL,
  "origem_modulo" text NOT NULL,
  "ref" text NOT NULL,
  "titulo" text NOT NULL,
  "categoria" text,
  "severidade" text DEFAULT 'media'::text NOT NULL,
  "status" text DEFAULT 'aberto'::text NOT NULL,
  "prioridade_soc" integer DEFAULT 0 NOT NULL,
  "evidencias" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "visto_em" timestamp with time zone DEFAULT now() NOT NULL
);
DO $$ BEGIN
  ALTER TABLE public.orion_soc_incidents ADD CONSTRAINT orion_soc_inc_uq UNIQUE (origem_modulo, ref);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.orion_soc_incidents ADD CONSTRAINT orion_soc_incidents_pkey PRIMARY KEY (soc_incident_id);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $$;
CREATE TABLE IF NOT EXISTS public.orion_soc_operations (
  "op_id" bigint NOT NULL,
  "tipo" text NOT NULL,
  "descricao" text NOT NULL,
  "operador" text DEFAULT 'soc_commander'::text NOT NULL,
  "evidencias" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
DO $$ BEGIN
  ALTER TABLE public.orion_soc_operations ADD CONSTRAINT orion_soc_operations_pkey PRIMARY KEY (op_id);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $$;
CREATE TABLE IF NOT EXISTS public.orion_soc_playbooks (
  "playbook_key" text NOT NULL,
  "nome" text NOT NULL,
  "gatilho" text NOT NULL,
  "passos" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "modulos" text[] DEFAULT '{}'::text[] NOT NULL,
  "ativo" boolean DEFAULT true NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
DO $$ BEGIN
  ALTER TABLE public.orion_soc_playbooks ADD CONSTRAINT orion_soc_playbooks_pkey PRIMARY KEY (playbook_key);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $$;
CREATE TABLE IF NOT EXISTS public.orion_soc_decisions (
  "decision_id" bigint NOT NULL,
  "titulo" text NOT NULL,
  "contexto" text,
  "decisao" text NOT NULL,
  "baseado_em" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "operador" text DEFAULT 'admin'::text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
DO $$ BEGIN
  ALTER TABLE public.orion_soc_decisions ADD CONSTRAINT orion_soc_decisions_pkey PRIMARY KEY (decision_id);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $$;
CREATE TABLE IF NOT EXISTS public.orion_security_graph (
  "node_id" text NOT NULL,
  "node_type" text NOT NULL,
  "label" text NOT NULL,
  "risk" integer DEFAULT 0 NOT NULL,
  "entity_ref" text,
  "eventos" integer DEFAULT 0 NOT NULL,
  "evidencias" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "source_arrival" timestamp with time zone,
  "first_seen" timestamp with time zone,
  "last_seen" timestamp with time zone,
  "trace" text,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
DO $$ BEGIN
  ALTER TABLE public.orion_security_graph ADD CONSTRAINT orion_security_graph_pkey PRIMARY KEY (node_id);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $$;
CREATE TABLE IF NOT EXISTS public.orion_soc_evidence (
  "evidence_id" bigint NOT NULL,
  "snapshot_id" bigint,
  "tipo" text NOT NULL,
  "conteudo" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "capturado_em" timestamp with time zone DEFAULT now() NOT NULL
);
DO $$ BEGIN
  ALTER TABLE public.orion_soc_evidence ADD CONSTRAINT orion_soc_evidence_pkey PRIMARY KEY (evidence_id);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $$;
CREATE TABLE IF NOT EXISTS public.orion_threat_campaigns (
  "campaign_id" bigint NOT NULL,
  "dedupe_key" text NOT NULL,
  "nome" text NOT NULL,
  "tipo" text NOT NULL,
  "severidade" text DEFAULT 'baixa'::text NOT NULL,
  "status" text DEFAULT 'ativa'::text NOT NULL,
  "confidence" integer DEFAULT 0 NOT NULL,
  "crs" integer DEFAULT 0 NOT NULL,
  "eventos" integer DEFAULT 0 NOT NULL,
  "entidades" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "evidencias" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "primeira_ocorrencia" timestamp with time zone,
  "ultima_ocorrencia" timestamp with time zone,
  "trace" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
DO $$ BEGIN
  ALTER TABLE public.orion_threat_campaigns ADD CONSTRAINT orion_threat_campaigns_dedupe_key_key UNIQUE (dedupe_key);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.orion_threat_campaigns ADD CONSTRAINT orion_threat_campaigns_pkey PRIMARY KEY (campaign_id);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $$;
CREATE TABLE IF NOT EXISTS public.orion_twin_deploy_checks (
  "id" bigint NOT NULL,
  "run_id" bigint NOT NULL,
  "verificacao" text NOT NULL,
  "resultado" text NOT NULL,
  "evidencia" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
DO $$ BEGIN
  ALTER TABLE public.orion_twin_deploy_checks ADD CONSTRAINT orion_twin_deploy_checks_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $$;
CREATE TABLE IF NOT EXISTS public.orion_vulnerability_events (
  "vuln_id" bigint NOT NULL,
  "dedupe_key" text NOT NULL,
  "componente" text NOT NULL,
  "vulnerabilidade" text NOT NULL,
  "criticidade" text DEFAULT 'baixa'::text NOT NULL,
  "vis" integer DEFAULT 0 NOT NULL,
  "origem" text NOT NULL,
  "impacto" text,
  "mitigacao" text,
  "status" text DEFAULT 'aberta'::text NOT NULL,
  "evidencias" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "ocorrencias" integer DEFAULT 1 NOT NULL,
  "primeira_ocorrencia" timestamp with time zone DEFAULT now() NOT NULL,
  "ultima_ocorrencia" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
DO $$ BEGIN
  ALTER TABLE public.orion_vulnerability_events ADD CONSTRAINT orion_vulnerability_events_dedupe_key_key UNIQUE (dedupe_key);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.orion_vulnerability_events ADD CONSTRAINT orion_vulnerability_events_pkey PRIMARY KEY (vuln_id);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $$;
CREATE TABLE IF NOT EXISTS public.orion_threat_statistics (
  "dia" date NOT NULL,
  "ameacas" integer DEFAULT 0 NOT NULL,
  "campanhas" integer DEFAULT 0 NOT NULL,
  "vulnerabilidades" integer DEFAULT 0 NOT NULL,
  "correlacoes" integer DEFAULT 0 NOT NULL,
  "tendencia" numeric DEFAULT 0 NOT NULL,
  "risco_medio" integer DEFAULT 0 NOT NULL,
  "mttc_segundos" integer DEFAULT 0 NOT NULL,
  "trr" numeric DEFAULT 0 NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
DO $$ BEGIN
  ALTER TABLE public.orion_threat_statistics ADD CONSTRAINT orion_threat_statistics_pkey PRIMARY KEY (dia);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $$;
CREATE TABLE IF NOT EXISTS public.orion_twin_scenarios (
  "scenario_id" bigint NOT NULL,
  "nome" text NOT NULL,
  "versao" integer DEFAULT 1 NOT NULL,
  "tipo" text NOT NULL,
  "params" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
DO $$ BEGIN
  ALTER TABLE public.orion_twin_scenarios ADD CONSTRAINT orion_twin_scen_uq UNIQUE (nome, versao);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.orion_twin_scenarios ADD CONSTRAINT orion_twin_scenarios_pkey PRIMARY KEY (scenario_id);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $$;
CREATE TABLE IF NOT EXISTS public.orion_twin_incidents (
  "id" bigint NOT NULL,
  "run_id" bigint NOT NULL,
  "tipo" text NOT NULL,
  "afetados" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "tempo_recuperacao_min" integer,
  "plano" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
DO $$ BEGIN
  ALTER TABLE public.orion_twin_incidents ADD CONSTRAINT orion_twin_incidents_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $$;
CREATE TABLE IF NOT EXISTS public.orion_twin_comparisons (
  "id" bigint NOT NULL,
  "alvo" text NOT NULL,
  "previsto" numeric(18,4) NOT NULL,
  "realizado" numeric(18,4),
  "erro_pct" numeric(8,2),
  "fonte" text NOT NULL,
  "dia" date DEFAULT ((now() AT TIME ZONE 'America/Cuiaba'::text))::date NOT NULL,
  "criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
DO $$ BEGIN
  ALTER TABLE public.orion_twin_comparisons ADD CONSTRAINT orion_twin_comp_uq UNIQUE (alvo, dia);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.orion_twin_comparisons ADD CONSTRAINT orion_twin_comparisons_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $$;
CREATE TABLE IF NOT EXISTS public.orion_twin_statistics (
  "data" date NOT NULL,
  "entidades" integer DEFAULT 0 NOT NULL,
  "baselines" integer DEFAULT 0 NOT NULL,
  "runs" integer DEFAULT 0 NOT NULL,
  "ths" integer DEFAULT 0 NOT NULL,
  "ss" integer DEFAULT 0 NOT NULL,
  "atualizado_em" timestamp with time zone DEFAULT now() NOT NULL
);
DO $$ BEGIN
  ALTER TABLE public.orion_twin_statistics ADD CONSTRAINT orion_twin_statistics_pkey PRIMARY KEY (data);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $$;
CREATE TABLE IF NOT EXISTS public.orion_twin_runs (
  "run_id" bigint NOT NULL,
  "scenario_id" bigint,
  "tipo" text NOT NULL,
  "params_snapshot" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "baselines_snapshot" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "resultado" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "veredito" text,
  "executado_em" timestamp with time zone DEFAULT now() NOT NULL
);
DO $$ BEGIN
  ALTER TABLE public.orion_twin_runs ADD CONSTRAINT orion_twin_runs_pkey PRIMARY KEY (run_id);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $$;
CREATE TABLE IF NOT EXISTS public.orion_kg_nodes (
  "node_id" text NOT NULL,
  "tipo" text NOT NULL,
  "label" text NOT NULL,
  "ref_tabela" text,
  "ref_id" text,
  "cidade" text,
  "estado" text,
  "grau" integer DEFAULT 0 NOT NULL,
  "score" integer DEFAULT 0 NOT NULL,
  "cluster" text,
  "propriedades" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "primeiro_em" timestamp with time zone DEFAULT now() NOT NULL,
  "ultimo_em" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
DO $$ BEGIN
  ALTER TABLE public.orion_kg_nodes ADD CONSTRAINT orion_kg_nodes_pkey PRIMARY KEY (node_id);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $$;
CREATE TABLE IF NOT EXISTS public.orion_kg_edges (
  "edge_id" bigint NOT NULL,
  "dedupe_key" text NOT NULL,
  "origem" text NOT NULL,
  "destino" text NOT NULL,
  "relacao" text NOT NULL,
  "peso" integer DEFAULT 1 NOT NULL,
  "ocorrencias" integer DEFAULT 1 NOT NULL,
  "evidencias" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "primeiro_em" timestamp with time zone DEFAULT now() NOT NULL,
  "ultimo_em" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
DO $$ BEGIN
  ALTER TABLE public.orion_kg_edges ADD CONSTRAINT orion_kg_edges_dedupe_key_key UNIQUE (dedupe_key);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.orion_kg_edges ADD CONSTRAINT orion_kg_edges_pkey PRIMARY KEY (edge_id);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $$;
CREATE TABLE IF NOT EXISTS public.orion_kg_properties (
  "id" bigint NOT NULL,
  "ref_tipo" text NOT NULL,
  "ref_id" text NOT NULL,
  "chave" text NOT NULL,
  "valor" text,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
DO $$ BEGIN
  ALTER TABLE public.orion_kg_properties ADD CONSTRAINT kg_prop_uq UNIQUE (ref_tipo, ref_id, chave);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.orion_kg_properties ADD CONSTRAINT orion_kg_properties_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $$;
CREATE TABLE IF NOT EXISTS public.orion_predict_statistics (
  "data" date NOT NULL,
  "previsoes" integer DEFAULT 0 NOT NULL,
  "usuarios_pontuados" integer DEFAULT 0 NOT NULL,
  "mae_1d" numeric(18,4),
  "pas" integer DEFAULT 0 NOT NULL,
  "pcs" integer DEFAULT 0 NOT NULL,
  "pis" integer DEFAULT 0 NOT NULL,
  "atualizado_em" timestamp with time zone DEFAULT now() NOT NULL
);
DO $$ BEGIN
  ALTER TABLE public.orion_predict_statistics ADD CONSTRAINT orion_predict_statistics_pkey PRIMARY KEY (data);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $$;
CREATE TABLE IF NOT EXISTS public.orion_predict_simulations (
  "id" bigint NOT NULL,
  "cenario" jsonb NOT NULL,
  "resultado" jsonb NOT NULL,
  "modelo" text NOT NULL,
  "criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
DO $$ BEGIN
  ALTER TABLE public.orion_predict_simulations ADD CONSTRAINT orion_predict_simulations_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $$;
CREATE TABLE IF NOT EXISTS public.orion_kg_clusters (
  "cluster_id" text NOT NULL,
  "tipo" text DEFAULT 'comunidade'::text NOT NULL,
  "descricao" text,
  "tamanho" integer DEFAULT 0 NOT NULL,
  "membros" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
DO $$ BEGIN
  ALTER TABLE public.orion_kg_clusters ADD CONSTRAINT orion_kg_clusters_pkey PRIMARY KEY (cluster_id);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $$;
CREATE TABLE IF NOT EXISTS public.orion_kg_similarity (
  "node_a" text NOT NULL,
  "node_b" text NOT NULL,
  "score" integer DEFAULT 0 NOT NULL,
  "base" text NOT NULL,
  "evidencias" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
DO $$ BEGIN
  ALTER TABLE public.orion_kg_similarity ADD CONSTRAINT kg_sim_uq UNIQUE (node_a, node_b);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $$;
CREATE TABLE IF NOT EXISTS public.orion_kg_statistics (
  "dia" date NOT NULL,
  "nos" integer DEFAULT 0 NOT NULL,
  "arestas" integer DEFAULT 0 NOT NULL,
  "clusters" integer DEFAULT 0 NOT NULL,
  "densidade" numeric DEFAULT 0 NOT NULL,
  "grau_medio" numeric DEFAULT 0 NOT NULL,
  "cobertura_pct" integer DEFAULT 0 NOT NULL,
  "ghs" integer DEFAULT 0 NOT NULL,
  "knowledge_score" integer DEFAULT 0 NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
DO $$ BEGIN
  ALTER TABLE public.orion_kg_statistics ADD CONSTRAINT orion_kg_statistics_pkey PRIMARY KEY (dia);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $$;
CREATE TABLE IF NOT EXISTS public.orion_kg_paths (
  "id" bigint NOT NULL,
  "origem" text NOT NULL,
  "destino" text NOT NULL,
  "caminho" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "saltos" integer DEFAULT 0 NOT NULL,
  "criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
DO $$ BEGIN
  ALTER TABLE public.orion_kg_paths ADD CONSTRAINT kg_path_uq UNIQUE (origem, destino);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.orion_kg_paths ADD CONSTRAINT orion_kg_paths_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $$;
CREATE TABLE IF NOT EXISTS public.orion_kg_context_cache (
  "node_id" text NOT NULL,
  "contexto" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "gerado_em" timestamp with time zone DEFAULT now() NOT NULL
);
DO $$ BEGIN
  ALTER TABLE public.orion_kg_context_cache ADD CONSTRAINT orion_kg_context_cache_pkey PRIMARY KEY (node_id);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $$;
CREATE TABLE IF NOT EXISTS public.orion_kg_search_cache (
  "termo" text NOT NULL,
  "resultado" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "gerado_em" timestamp with time zone DEFAULT now() NOT NULL
);
DO $$ BEGIN
  ALTER TABLE public.orion_kg_search_cache ADD CONSTRAINT orion_kg_search_cache_pkey PRIMARY KEY (termo);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $$;
CREATE TABLE IF NOT EXISTS public.orion_gov_certifications (
  "id" bigint NOT NULL,
  "module" text NOT NULL,
  "score" integer NOT NULL,
  "data" date NOT NULL,
  "auditor" text DEFAULT 'sessao Claude + homologacao no banco vivo'::text NOT NULL,
  "aprovado" boolean DEFAULT true NOT NULL,
  "evidencias" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
DO $$ BEGIN
  ALTER TABLE public.orion_gov_certifications ADD CONSTRAINT orion_gov_cert_uq UNIQUE (module, data);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.orion_gov_certifications ADD CONSTRAINT orion_gov_certifications_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $$;
CREATE TABLE IF NOT EXISTS public.orion_gov_dependencies (
  "id" bigint NOT NULL,
  "module" text NOT NULL,
  "depende_de" text NOT NULL,
  "tipo" text DEFAULT 'ia'::text NOT NULL,
  "quebrada" boolean DEFAULT false NOT NULL,
  "verificado_em" timestamp with time zone DEFAULT now() NOT NULL
);
DO $$ BEGIN
  ALTER TABLE public.orion_gov_dependencies ADD CONSTRAINT orion_gov_dep_uq UNIQUE (module, depende_de, tipo);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.orion_gov_dependencies ADD CONSTRAINT orion_gov_dependencies_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $$;
CREATE TABLE IF NOT EXISTS public.orion_gov_policies (
  "politica" text NOT NULL,
  "descricao" text NOT NULL,
  "ativa" boolean DEFAULT true NOT NULL,
  "atualizado_em" timestamp with time zone DEFAULT now() NOT NULL
);
DO $$ BEGIN
  ALTER TABLE public.orion_gov_policies ADD CONSTRAINT orion_gov_policies_pkey PRIMARY KEY (politica);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $$;
CREATE TABLE IF NOT EXISTS public.orion_gov_alerts (
  "id" bigint NOT NULL,
  "alerta" text NOT NULL,
  "severidade" text DEFAULT 'media'::text NOT NULL,
  "categoria" text NOT NULL,
  "chave" text DEFAULT 'geral'::text NOT NULL,
  "evidencias" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "resolvido" boolean DEFAULT false NOT NULL,
  "dia" date DEFAULT ((now() AT TIME ZONE 'America/Cuiaba'::text))::date NOT NULL,
  "criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
DO $$ BEGIN
  ALTER TABLE public.orion_gov_alerts ADD CONSTRAINT orion_gov_alerts_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.orion_gov_alerts ADD CONSTRAINT orion_gov_alerts_uq UNIQUE (categoria, chave, dia);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $$;
CREATE TABLE IF NOT EXISTS public.orion_gov_statistics (
  "data" date NOT NULL,
  "total" integer DEFAULT 0 NOT NULL,
  "certificadas" integer DEFAULT 0 NOT NULL,
  "producao" integer DEFAULT 0 NOT NULL,
  "saudaveis" integer DEFAULT 0 NOT NULL,
  "crons_ativos" integer DEFAULT 0 NOT NULL,
  "deps_quebradas" integer DEFAULT 0 NOT NULL,
  "gs" integer DEFAULT 0 NOT NULL,
  "ls" integer DEFAULT 0 NOT NULL,
  "cs" integer DEFAULT 0 NOT NULL,
  "deps" integer DEFAULT 0 NOT NULL,
  "ohs" integer DEFAULT 0 NOT NULL,
  "atualizado_em" timestamp with time zone DEFAULT now() NOT NULL
);
DO $$ BEGIN
  ALTER TABLE public.orion_gov_statistics ADD CONSTRAINT orion_gov_statistics_pkey PRIMARY KEY (data);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $$;
CREATE TABLE IF NOT EXISTS public.orion_gov_versions (
  "id" bigint NOT NULL,
  "module" text NOT NULL,
  "versao" text NOT NULL,
  "tipo" text DEFAULT 'versao'::text NOT NULL,
  "changelog" text,
  "commit_ref" text,
  "criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
DO $$ BEGIN
  ALTER TABLE public.orion_gov_versions ADD CONSTRAINT orion_gov_versions_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.orion_gov_versions ADD CONSTRAINT orion_gov_versions_uq UNIQUE (module, versao, tipo);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $$;
CREATE TABLE IF NOT EXISTS public.orion_cost_budgets (
  "escopo" text NOT NULL,
  "limite_usd" numeric(12,2) NOT NULL,
  "periodo" text DEFAULT 'mensal'::text NOT NULL,
  "realizado_usd" numeric(12,4) DEFAULT 0 NOT NULL,
  "estourado" boolean DEFAULT false NOT NULL,
  "atualizado_em" timestamp with time zone DEFAULT now() NOT NULL
);
DO $$ BEGIN
  ALTER TABLE public.orion_cost_budgets ADD CONSTRAINT orion_cost_budgets_pkey PRIMARY KEY (escopo);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $$;
CREATE TABLE IF NOT EXISTS public.orion_cost_forecasts (
  "horizonte_dias" integer NOT NULL,
  "gerado_em" date NOT NULL,
  "custo_projetado_usd" numeric(14,4) NOT NULL,
  "base" jsonb DEFAULT '{}'::jsonb NOT NULL
);
DO $$ BEGIN
  ALTER TABLE public.orion_cost_forecasts ADD CONSTRAINT orion_cost_forecasts_pkey PRIMARY KEY (horizonte_dias, gerado_em);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $$;
CREATE TABLE IF NOT EXISTS public.orion_cost_anomalies (
  "id" bigint NOT NULL,
  "dedupe_key" text NOT NULL,
  "tipo" text NOT NULL,
  "severidade" text DEFAULT 'media'::text NOT NULL,
  "descricao" text NOT NULL,
  "evidencias" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "status" text DEFAULT 'aberta'::text NOT NULL,
  "criado_em" timestamp with time zone DEFAULT now() NOT NULL,
  "atualizado_em" timestamp with time zone DEFAULT now() NOT NULL
);
DO $$ BEGIN
  ALTER TABLE public.orion_cost_anomalies ADD CONSTRAINT orion_cost_anom_uq UNIQUE (dedupe_key);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.orion_cost_anomalies ADD CONSTRAINT orion_cost_anomalies_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $$;
CREATE TABLE IF NOT EXISTS public.orion_cost_recommendations (
  "id" bigint NOT NULL,
  "dedupe_key" text NOT NULL,
  "titulo" text NOT NULL,
  "economia_estimada_usd" numeric(12,4) DEFAULT 0 NOT NULL,
  "impacto" text DEFAULT 'baixo'::text NOT NULL,
  "risco" text DEFAULT 'baixo'::text NOT NULL,
  "prioridade" integer DEFAULT 3 NOT NULL,
  "evidencias" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "aplicada" boolean DEFAULT false NOT NULL,
  "criado_em" timestamp with time zone DEFAULT now() NOT NULL,
  "atualizado_em" timestamp with time zone DEFAULT now() NOT NULL
);
DO $$ BEGIN
  ALTER TABLE public.orion_cost_recommendations ADD CONSTRAINT orion_cost_rec_uq UNIQUE (dedupe_key);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.orion_cost_recommendations ADD CONSTRAINT orion_cost_recommendations_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $$;
CREATE TABLE IF NOT EXISTS public.orion_cost_statistics (
  "data" date NOT NULL,
  "custo_dia_usd" numeric(12,4) DEFAULT 0 NOT NULL,
  "custo_mes_usd" numeric(12,4) DEFAULT 0 NOT NULL,
  "cos" integer DEFAULT 0 NOT NULL,
  "ces" integer DEFAULT 0 NOT NULL,
  "ris" integer DEFAULT 0 NOT NULL,
  "fas" integer DEFAULT 0 NOT NULL,
  "bcs" integer DEFAULT 0 NOT NULL,
  "atualizado_em" timestamp with time zone DEFAULT now() NOT NULL
);
DO $$ BEGIN
  ALTER TABLE public.orion_cost_statistics ADD CONSTRAINT orion_cost_statistics_pkey PRIMARY KEY (data);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $$;
CREATE TABLE IF NOT EXISTS public.orion_cost_history (
  "id" bigint NOT NULL,
  "trace" text NOT NULL,
  "resumo" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
DO $$ BEGIN
  ALTER TABLE public.orion_cost_history ADD CONSTRAINT orion_cost_history_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $$;
CREATE TABLE IF NOT EXISTS public.orion_aiops_events (
  "event_id" bigint NOT NULL,
  "captado_em" timestamp with time zone DEFAULT now() NOT NULL,
  "fonte" text NOT NULL,
  "alvo" text NOT NULL,
  "tipo" text NOT NULL,
  "severidade" text DEFAULT 'info'::text NOT NULL,
  "valor" numeric,
  "evidencias" jsonb DEFAULT '{}'::jsonb NOT NULL
);
DO $$ BEGIN
  ALTER TABLE public.orion_aiops_events ADD CONSTRAINT orion_aiops_events_pkey PRIMARY KEY (event_id);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $$;
CREATE TABLE IF NOT EXISTS public.orion_aiops_anomalies (
  "anomaly_id" bigint NOT NULL,
  "dedupe_key" text NOT NULL,
  "tipo" text NOT NULL,
  "categoria" text NOT NULL,
  "alvo" text NOT NULL,
  "severidade" text DEFAULT 'media'::text NOT NULL,
  "descricao" text NOT NULL,
  "evidencias" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "status" text DEFAULT 'aberta'::text NOT NULL,
  "detectada_em" timestamp with time zone DEFAULT now() NOT NULL,
  "resolvida_em" timestamp with time zone,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
DO $$ BEGIN
  ALTER TABLE public.orion_aiops_anomalies ADD CONSTRAINT aiops_anom_uq UNIQUE (dedupe_key);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.orion_aiops_anomalies ADD CONSTRAINT orion_aiops_anomalies_pkey PRIMARY KEY (anomaly_id);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $$;
CREATE TABLE IF NOT EXISTS public.orion_aiops_predictions (
  "prediction_id" bigint NOT NULL,
  "dedupe_key" text NOT NULL,
  "tipo" text NOT NULL,
  "alvo" text NOT NULL,
  "probabilidade" integer DEFAULT 0 NOT NULL,
  "impacto" text DEFAULT 'medio'::text NOT NULL,
  "confianca" integer DEFAULT 0 NOT NULL,
  "horizonte" text DEFAULT '2h'::text NOT NULL,
  "justificativa" text NOT NULL,
  "evidencias" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "realizado" boolean,
  "criada_em" timestamp with time zone DEFAULT now() NOT NULL
);
DO $$ BEGIN
  ALTER TABLE public.orion_aiops_predictions ADD CONSTRAINT aiops_pred_uq UNIQUE (dedupe_key);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.orion_aiops_predictions ADD CONSTRAINT orion_aiops_predictions_pkey PRIMARY KEY (prediction_id);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $$;
CREATE TABLE IF NOT EXISTS public.orion_aiops_health (
  "servico" text NOT NULL,
  "categoria" text NOT NULL,
  "estado" text DEFAULT 'operacional'::text NOT NULL,
  "rhs" integer DEFAULT 100 NOT NULL,
  "sucesso_pct" integer,
  "latencia_ms" integer,
  "erro_rate" numeric,
  "evidencias" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
DO $$ BEGIN
  ALTER TABLE public.orion_aiops_health ADD CONSTRAINT orion_aiops_health_pkey PRIMARY KEY (servico);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $$;
CREATE TABLE IF NOT EXISTS public.orion_aiops_automation_policies (
  "acao" text NOT NULL,
  "descricao" text NOT NULL,
  "auto_autorizada" boolean DEFAULT false NOT NULL,
  "requer_aprovacao" boolean DEFAULT true NOT NULL,
  "destrutiva" boolean DEFAULT false NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
DO $$ BEGIN
  ALTER TABLE public.orion_aiops_automation_policies ADD CONSTRAINT orion_aiops_automation_policies_pkey PRIMARY KEY (acao);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $$;
CREATE TABLE IF NOT EXISTS public.orion_aiops_evidence (
  "evidence_id" bigint NOT NULL,
  "ref_tipo" text NOT NULL,
  "ref_id" text NOT NULL,
  "conteudo" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "capturado_em" timestamp with time zone DEFAULT now() NOT NULL
);
DO $$ BEGIN
  ALTER TABLE public.orion_aiops_evidence ADD CONSTRAINT orion_aiops_evidence_pkey PRIMARY KEY (evidence_id);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $$;
CREATE TABLE IF NOT EXISTS public.orion_aiops_recommendations (
  "rec_id" bigint NOT NULL,
  "dedupe_key" text NOT NULL,
  "titulo" text NOT NULL,
  "categoria" text NOT NULL,
  "prioridade" integer DEFAULT 0 NOT NULL,
  "descricao" text NOT NULL,
  "acao_sugerida" text,
  "requer_aprovacao" boolean DEFAULT true NOT NULL,
  "status" text DEFAULT 'aberta'::text NOT NULL,
  "evidencias" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "criada_em" timestamp with time zone DEFAULT now() NOT NULL
);
DO $$ BEGIN
  ALTER TABLE public.orion_aiops_recommendations ADD CONSTRAINT aiops_rec_uq UNIQUE (dedupe_key);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.orion_aiops_recommendations ADD CONSTRAINT orion_aiops_recommendations_pkey PRIMARY KEY (rec_id);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $$;
CREATE TABLE IF NOT EXISTS public.orion_obs_spans (
  "span_id" text NOT NULL,
  "trace_id" text NOT NULL,
  "parent_id" text,
  "servico" text NOT NULL,
  "operacao" text NOT NULL,
  "duracao_ms" integer DEFAULT 0 NOT NULL,
  "status" text DEFAULT 'ok'::text NOT NULL,
  "started_at" timestamp with time zone NOT NULL,
  "evidencias" jsonb DEFAULT '{}'::jsonb NOT NULL
);
DO $$ BEGIN
  ALTER TABLE public.orion_obs_spans ADD CONSTRAINT orion_obs_spans_pkey PRIMARY KEY (span_id);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $$;
CREATE TABLE IF NOT EXISTS public.orion_obs_service_health (
  "servico" text NOT NULL,
  "categoria" text NOT NULL,
  "estado" text DEFAULT 'saudavel'::text NOT NULL,
  "disponibilidade" numeric DEFAULT 100 NOT NULL,
  "latencia_ms" numeric DEFAULT 0 NOT NULL,
  "erro_rate" numeric DEFAULT 0 NOT NULL,
  "ultima_atividade" timestamp with time zone,
  "evidencias" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
DO $$ BEGIN
  ALTER TABLE public.orion_obs_service_health ADD CONSTRAINT orion_obs_service_health_pkey PRIMARY KEY (servico);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $$;
CREATE TABLE IF NOT EXISTS public.orion_obs_sli (
  "sli_id" bigint NOT NULL,
  "measured_at" timestamp with time zone DEFAULT now() NOT NULL,
  "sli_key" text NOT NULL,
  "servico" text NOT NULL,
  "tipo" text NOT NULL,
  "valor" numeric NOT NULL,
  "unidade" text DEFAULT ''::text NOT NULL,
  "janela" text DEFAULT '1h'::text NOT NULL,
  "evidencias" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "dedupe_key" text NOT NULL
);
DO $$ BEGIN
  ALTER TABLE public.orion_obs_sli ADD CONSTRAINT orion_obs_sli_dedupe_key_key UNIQUE (dedupe_key);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.orion_obs_sli ADD CONSTRAINT orion_obs_sli_pkey PRIMARY KEY (sli_id);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $$;
CREATE TABLE IF NOT EXISTS public.orion_obs_slo (
  "slo_key" text NOT NULL,
  "servico" text NOT NULL,
  "tipo" text NOT NULL,
  "descricao" text NOT NULL,
  "alvo" numeric NOT NULL,
  "comparador" text DEFAULT '>='::text NOT NULL,
  "atual" numeric DEFAULT 0 NOT NULL,
  "compliance" numeric DEFAULT 100 NOT NULL,
  "em_risco" boolean DEFAULT false NOT NULL,
  "error_budget" numeric DEFAULT 100 NOT NULL,
  "escopo" text DEFAULT 'servico'::text NOT NULL,
  "ativa" boolean DEFAULT true NOT NULL,
  "evidencias" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
DO $$ BEGIN
  ALTER TABLE public.orion_obs_slo ADD CONSTRAINT orion_obs_slo_pkey PRIMARY KEY (slo_key);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $$;
CREATE TABLE IF NOT EXISTS public.orion_obs_alerts (
  "alert_id" bigint NOT NULL,
  "tipo" text NOT NULL,
  "severidade" text DEFAULT 'atencao'::text NOT NULL,
  "servico" text,
  "mensagem" text NOT NULL,
  "impacto" text DEFAULT 'baixo'::text NOT NULL,
  "prioridade" integer DEFAULT 0 NOT NULL,
  "evidencias" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "dia" date DEFAULT CURRENT_DATE NOT NULL,
  "resolvido" boolean DEFAULT false NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
DO $$ BEGIN
  ALTER TABLE public.orion_obs_alerts ADD CONSTRAINT orion_obs_alerts_pkey PRIMARY KEY (alert_id);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.orion_obs_alerts ADD CONSTRAINT orion_obs_alerts_tipo_servico_dia_key UNIQUE (tipo, servico, dia);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $$;
CREATE TABLE IF NOT EXISTS public.orion_obs_statistics (
  "dia" date NOT NULL,
  "ohs" integer DEFAULT 0 NOT NULL,
  "phs" integer DEFAULT 0 NOT NULL,
  "das" integer DEFAULT 0 NOT NULL,
  "lqs" integer DEFAULT 0 NOT NULL,
  "tps" integer DEFAULT 0 NOT NULL,
  "slo_compliance" integer DEFAULT 0 NOT NULL,
  "uptime_pct" numeric DEFAULT 0 NOT NULL,
  "logs_total" integer DEFAULT 0 NOT NULL,
  "logs_erro" integer DEFAULT 0 NOT NULL,
  "traces_total" integer DEFAULT 0 NOT NULL,
  "alertas" integer DEFAULT 0 NOT NULL,
  "servicos_degradados" integer DEFAULT 0 NOT NULL,
  "eventos_por_min" numeric DEFAULT 0 NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
DO $$ BEGIN
  ALTER TABLE public.orion_obs_statistics ADD CONSTRAINT orion_obs_statistics_pkey PRIMARY KEY (dia);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $$;
CREATE TABLE IF NOT EXISTS public.orion_rep_events (
  "id" bigint NOT NULL,
  "user_id" uuid NOT NULL,
  "tipo" text NOT NULL,
  "detalhes" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "dedupe_key" text NOT NULL,
  "criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
DO $$ BEGIN
  ALTER TABLE public.orion_rep_events ADD CONSTRAINT orion_rep_events_dedupe_key_key UNIQUE (dedupe_key);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.orion_rep_events ADD CONSTRAINT orion_rep_events_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $$;
CREATE TABLE IF NOT EXISTS public.orion_bg_scenes (
  "scene_id" bigint NOT NULL,
  "chave" text NOT NULL,
  "nome" text NOT NULL,
  "categoria" text NOT NULL,
  "segmento" text,
  "estilo" text,
  "ambiente" text,
  "palette_hint" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "thumb_url" text,
  "premium" boolean DEFAULT false NOT NULL,
  "ativo" boolean DEFAULT true NOT NULL,
  "usos" integer DEFAULT 0 NOT NULL,
  "score_medio" integer DEFAULT 0 NOT NULL,
  "criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
DO $$ BEGIN
  ALTER TABLE public.orion_bg_scenes ADD CONSTRAINT orion_bg_scenes_chave_key UNIQUE (chave);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.orion_bg_scenes ADD CONSTRAINT orion_bg_scenes_pkey PRIMARY KEY (scene_id);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $$;
CREATE TABLE IF NOT EXISTS public.orion_exstrat_metrics (
  "id" bigint DEFAULT nextval('orion_exstrat_metrics_id_seq'::regclass) NOT NULL,
  "dia" date DEFAULT ((now() AT TIME ZONE 'America/Cuiaba'::text))::date NOT NULL,
  "receita" numeric DEFAULT 0,
  "custo_ia_usd" numeric DEFAULT 0,
  "gmv" numeric DEFAULT 0,
  "pedidos_pagos" integer DEFAULT 0,
  "usuarios" integer DEFAULT 0,
  "conversao_pct" numeric,
  "taxa_pagamento_pct" numeric,
  "componentes" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "fonte" text DEFAULT 'executive_fusion (AI-30) + contagens seguras'::text,
  "criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
DO $$ BEGIN
  ALTER TABLE public.orion_exstrat_metrics ADD CONSTRAINT orion_exstrat_metrics_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.orion_exstrat_metrics ADD CONSTRAINT orion_exstrat_metrics_unico UNIQUE (dia);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $$;
CREATE TABLE IF NOT EXISTS public.orion_bg_projects (
  "project_id" bigint NOT NULL,
  "ref_tipo" text DEFAULT 'manual'::text NOT NULL,
  "ref_id" text,
  "imagem_original" text NOT NULL,
  "categoria" text,
  "objeto" text,
  "brand_id" bigint,
  "resultado_url" text,
  "score" integer DEFAULT 0 NOT NULL,
  "status" text DEFAULT 'novo'::text NOT NULL,
  "criado_em" timestamp with time zone DEFAULT now() NOT NULL,
  "atualizado_em" timestamp with time zone DEFAULT now() NOT NULL
);
DO $$ BEGIN
  ALTER TABLE public.orion_bg_projects ADD CONSTRAINT orion_bg_projects_pkey PRIMARY KEY (project_id);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $$;
CREATE TABLE IF NOT EXISTS public.orion_exstrat_scores (
  "id" bigint DEFAULT nextval('orion_exstrat_scores_id_seq'::regclass) NOT NULL,
  "dia" date DEFAULT ((now() AT TIME ZONE 'America/Cuiaba'::text))::date NOT NULL,
  "executive_strategy_score" integer DEFAULT 50 NOT NULL,
  "executive_score" integer,
  "health_score" integer,
  "growth_score" integer,
  "risk_score" integer,
  "opportunity_score" integer,
  "innovation_score" integer,
  "confianca" integer DEFAULT 50,
  "componentes" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
DO $$ BEGIN
  ALTER TABLE public.orion_exstrat_scores ADD CONSTRAINT orion_exstrat_scores_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.orion_exstrat_scores ADD CONSTRAINT orion_exstrat_scores_unico UNIQUE (dia);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $$;
CREATE TABLE IF NOT EXISTS public.orion_exstrat_forecasts (
  "id" bigint DEFAULT nextval('orion_exstrat_forecasts_id_seq'::regclass) NOT NULL,
  "dia" date DEFAULT ((now() AT TIME ZONE 'America/Cuiaba'::text))::date NOT NULL,
  "cenario" text NOT NULL,
  "horizonte" text NOT NULL,
  "metrica" text NOT NULL,
  "valor_base" numeric,
  "valor_proj" numeric,
  "variacao_pct" numeric,
  "confianca" integer DEFAULT 40,
  "metodo" text DEFAULT 'modelo analítico com fatores DECLARADos sobre base real (reusa AI-30/AI-55) — nunca inventa'::text,
  "fatores" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
DO $$ BEGIN
  ALTER TABLE public.orion_exstrat_forecasts ADD CONSTRAINT orion_exstrat_forecast_unico UNIQUE (dia, cenario, horizonte, metrica);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.orion_exstrat_forecasts ADD CONSTRAINT orion_exstrat_forecasts_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $$;
CREATE TABLE IF NOT EXISTS public.orion_aoc_incidents (
  "incident_id" bigint NOT NULL,
  "aberto_em" timestamp with time zone DEFAULT now() NOT NULL,
  "tipo" text NOT NULL,
  "servico" text,
  "severidade" text DEFAULT 'media'::text NOT NULL,
  "diagnostico" text,
  "status" text DEFAULT 'aberto'::text NOT NULL,
  "resolvido_em" timestamp with time zone,
  "mttr_seg" integer,
  "event_id" bigint,
  "evidencias" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "dedupe_key" text NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
DO $$ BEGIN
  ALTER TABLE public.orion_aoc_incidents ADD CONSTRAINT orion_aoc_incidents_dedupe_key_key UNIQUE (dedupe_key);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.orion_aoc_incidents ADD CONSTRAINT orion_aoc_incidents_pkey PRIMARY KEY (incident_id);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $$;
CREATE TABLE IF NOT EXISTS public.orion_aoc_recovery (
  "recovery_id" bigint NOT NULL,
  "incident_id" bigint,
  "tentativa" text NOT NULL,
  "alvo" text,
  "sucesso" boolean,
  "detalhe" text,
  "evidencias" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
DO $$ BEGIN
  ALTER TABLE public.orion_aoc_recovery ADD CONSTRAINT orion_aoc_recovery_pkey PRIMARY KEY (recovery_id);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $$;
CREATE TABLE IF NOT EXISTS public.orion_aoc_resources (
  "snapshot_id" bigint NOT NULL,
  "medido_em" timestamp with time zone DEFAULT now() NOT NULL,
  "recurso" text NOT NULL,
  "categoria" text NOT NULL,
  "valor" numeric NOT NULL,
  "unidade" text DEFAULT ''::text NOT NULL,
  "estado" text DEFAULT 'ok'::text NOT NULL,
  "evidencias" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "dedupe_key" text NOT NULL
);
DO $$ BEGIN
  ALTER TABLE public.orion_aoc_resources ADD CONSTRAINT orion_aoc_resources_dedupe_key_key UNIQUE (dedupe_key);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.orion_aoc_resources ADD CONSTRAINT orion_aoc_resources_pkey PRIMARY KEY (snapshot_id);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $$;
CREATE TABLE IF NOT EXISTS public.orion_aoc_workflows (
  "workflow_key" text NOT NULL,
  "nome" text NOT NULL,
  "descricao" text NOT NULL,
  "passos" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "seguro" boolean DEFAULT false NOT NULL,
  "ativa" boolean DEFAULT true NOT NULL,
  "ultima_exec" timestamp with time zone,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
DO $$ BEGIN
  ALTER TABLE public.orion_aoc_workflows ADD CONSTRAINT orion_aoc_workflows_pkey PRIMARY KEY (workflow_key);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $$;
CREATE TABLE IF NOT EXISTS public.orion_aoc_alerts (
  "alert_id" bigint NOT NULL,
  "tipo" text NOT NULL,
  "severidade" text DEFAULT 'atencao'::text NOT NULL,
  "servico" text,
  "mensagem" text NOT NULL,
  "prioridade" integer DEFAULT 0 NOT NULL,
  "evidencias" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "dia" date DEFAULT CURRENT_DATE NOT NULL,
  "resolvido" boolean DEFAULT false NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
DO $$ BEGIN
  ALTER TABLE public.orion_aoc_alerts ADD CONSTRAINT orion_aoc_alerts_pkey PRIMARY KEY (alert_id);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.orion_aoc_alerts ADD CONSTRAINT orion_aoc_alerts_tipo_servico_dia_key UNIQUE (tipo, servico, dia);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $$;
CREATE TABLE IF NOT EXISTS public.orion_aoc_statistics (
  "dia" date NOT NULL,
  "eventos" integer DEFAULT 0 NOT NULL,
  "decisoes" integer DEFAULT 0 NOT NULL,
  "decisoes_automaticas" integer DEFAULT 0 NOT NULL,
  "decisoes_semi" integer DEFAULT 0 NOT NULL,
  "decisoes_manuais" integer DEFAULT 0 NOT NULL,
  "dispatches" integer DEFAULT 0 NOT NULL,
  "incidentes" integer DEFAULT 0 NOT NULL,
  "incidentes_resolvidos" integer DEFAULT 0 NOT NULL,
  "recuperacoes_ok" integer DEFAULT 0 NOT NULL,
  "mttr_seg" integer DEFAULT 0 NOT NULL,
  "automation_score" integer DEFAULT 0 NOT NULL,
  "health_score" integer DEFAULT 0 NOT NULL,
  "reliability" integer DEFAULT 0 NOT NULL,
  "gargalos" integer DEFAULT 0 NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
DO $$ BEGIN
  ALTER TABLE public.orion_aoc_statistics ADD CONSTRAINT orion_aoc_statistics_pkey PRIMARY KEY (dia);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $$;
CREATE TABLE IF NOT EXISTS public.orion_bg_jobs (
  "job_id" bigint NOT NULL,
  "project_id" bigint NOT NULL,
  "tipo" text NOT NULL,
  "params" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "status" text DEFAULT 'pendente'::text NOT NULL,
  "prioridade" integer DEFAULT 5 NOT NULL,
  "tentativas" integer DEFAULT 0 NOT NULL,
  "claimed_by" text,
  "resultado_url" text,
  "erro" text,
  "enfileirado_em" timestamp with time zone DEFAULT now() NOT NULL,
  "iniciado_em" timestamp with time zone,
  "concluido_em" timestamp with time zone
);
DO $$ BEGIN
  ALTER TABLE public.orion_bg_jobs ADD CONSTRAINT orion_bg_jobs_pkey PRIMARY KEY (job_id);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $$;
CREATE TABLE IF NOT EXISTS public.orion_bg_versions (
  "id" bigint NOT NULL,
  "project_id" bigint NOT NULL,
  "versao" integer NOT NULL,
  "tipo" text NOT NULL,
  "url" text NOT NULL,
  "scene_id" bigint,
  "criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
DO $$ BEGIN
  ALTER TABLE public.orion_bg_versions ADD CONSTRAINT bg_ver_uq UNIQUE (project_id, versao);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.orion_bg_versions ADD CONSTRAINT orion_bg_versions_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $$;
CREATE TABLE IF NOT EXISTS public.orion_bg_metrics (
  "id" bigint NOT NULL,
  "project_id" bigint NOT NULL,
  "versao" integer,
  "naturalidade" integer,
  "realismo" integer,
  "qualidade" integer,
  "iluminacao" integer,
  "sombras" integer,
  "integracao" integer,
  "profundidade" integer,
  "consistencia" integer,
  "medido_em" timestamp with time zone DEFAULT now() NOT NULL
);
DO $$ BEGIN
  ALTER TABLE public.orion_bg_metrics ADD CONSTRAINT orion_bg_metrics_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $$;
CREATE TABLE IF NOT EXISTS public.orion_bg_scores (
  "project_id" bigint NOT NULL,
  "background_score" integer DEFAULT 0 NOT NULL,
  "naturalidade" integer,
  "realismo" integer,
  "iluminacao" integer,
  "sombras" integer,
  "integracao" integer,
  "profundidade" integer,
  "atualizado_em" timestamp with time zone DEFAULT now() NOT NULL
);
DO $$ BEGIN
  ALTER TABLE public.orion_bg_scores ADD CONSTRAINT orion_bg_scores_pkey PRIMARY KEY (project_id);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $$;
CREATE TABLE IF NOT EXISTS public.orion_exstrat_ai_summary (
  "id" bigint DEFAULT nextval('orion_exstrat_ai_summary_id_seq'::regclass) NOT NULL,
  "dia" date DEFAULT ((now() AT TIME ZONE 'America/Cuiaba'::text))::date NOT NULL,
  "modulo" text NOT NULL,
  "chave" text,
  "status" text,
  "score" integer,
  "valor_entregue" text,
  "contribuicao" text,
  "evidencias" jsonb DEFAULT '{}'::jsonb NOT NULL
);
DO $$ BEGIN
  ALTER TABLE public.orion_exstrat_ai_summary ADD CONSTRAINT orion_exstrat_ai_summary_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.orion_exstrat_ai_summary ADD CONSTRAINT orion_exstrat_ai_summary_unico UNIQUE (modulo, dia);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $$;
CREATE TABLE IF NOT EXISTS public.orion_rep_alerts (
  "id" bigint NOT NULL,
  "user_id" uuid,
  "tipo" text NOT NULL,
  "severidade" text DEFAULT 'media'::text NOT NULL,
  "titulo" text NOT NULL,
  "detalhes" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "dedupe_key" text NOT NULL,
  "status" text DEFAULT 'aberto'::text NOT NULL,
  "criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
DO $$ BEGIN
  ALTER TABLE public.orion_rep_alerts ADD CONSTRAINT orion_rep_alerts_dedupe_key_key UNIQUE (dedupe_key);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.orion_rep_alerts ADD CONSTRAINT orion_rep_alerts_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $$;
CREATE TABLE IF NOT EXISTS public.orion_exstrat_risks (
  "id" bigint DEFAULT nextval('orion_exstrat_risks_id_seq'::regclass) NOT NULL,
  "dia" date DEFAULT ((now() AT TIME ZONE 'America/Cuiaba'::text))::date NOT NULL,
  "risk_key" text NOT NULL,
  "categoria" text NOT NULL,
  "titulo" text NOT NULL,
  "descricao" text,
  "severidade" text DEFAULT 'medio'::text NOT NULL,
  "probabilidade" integer DEFAULT 50,
  "impacto" integer DEFAULT 50,
  "evidencias" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "mitigacao" text,
  "modulos" jsonb DEFAULT '[]'::jsonb,
  "status" text DEFAULT 'aberto'::text NOT NULL,
  "detectado_em" timestamp with time zone DEFAULT now() NOT NULL,
  "resolvido_em" timestamp with time zone
);
DO $$ BEGIN
  ALTER TABLE public.orion_exstrat_risks ADD CONSTRAINT orion_exstrat_risk_unico UNIQUE (risk_key, dia);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.orion_exstrat_risks ADD CONSTRAINT orion_exstrat_risks_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $$;
CREATE TABLE IF NOT EXISTS public.orion_bg_history (
  "id" bigint NOT NULL,
  "project_id" bigint,
  "evento" text NOT NULL,
  "dados" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
DO $$ BEGIN
  ALTER TABLE public.orion_bg_history ADD CONSTRAINT orion_bg_history_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $$;
CREATE TABLE IF NOT EXISTS public.orion_exstrat_opportunities (
  "id" bigint DEFAULT nextval('orion_exstrat_opportunities_id_seq'::regclass) NOT NULL,
  "dia" date DEFAULT ((now() AT TIME ZONE 'America/Cuiaba'::text))::date NOT NULL,
  "opp_key" text NOT NULL,
  "tipo" text NOT NULL,
  "titulo" text NOT NULL,
  "descricao" text,
  "potencial" text,
  "potencial_score" integer DEFAULT 50,
  "confianca" integer DEFAULT 50,
  "janela" text,
  "evidencias" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "modulos" jsonb DEFAULT '[]'::jsonb,
  "status" text DEFAULT 'aberta'::text NOT NULL,
  "detectado_em" timestamp with time zone DEFAULT now() NOT NULL
);
DO $$ BEGIN
  ALTER TABLE public.orion_exstrat_opportunities ADD CONSTRAINT orion_exstrat_opp_unico UNIQUE (opp_key, dia);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.orion_exstrat_opportunities ADD CONSTRAINT orion_exstrat_opportunities_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $$;
CREATE TABLE IF NOT EXISTS public.orion_exstrat_recommendations (
  "id" bigint DEFAULT nextval('orion_exstrat_recommendations_id_seq'::regclass) NOT NULL,
  "dia" date DEFAULT ((now() AT TIME ZONE 'America/Cuiaba'::text))::date NOT NULL,
  "rec_key" text NOT NULL,
  "area" text NOT NULL,
  "titulo" text NOT NULL,
  "descricao" text,
  "beneficios" text,
  "riscos" text,
  "impacto_financeiro" text,
  "impacto_operacional" text,
  "impacto_tecnologico" text,
  "impacto_comercial" text,
  "prazo" text,
  "complexidade" text,
  "roi_estimado" text,
  "prob_sucesso" integer DEFAULT 50,
  "confianca" integer DEFAULT 50,
  "prioridade" integer DEFAULT 50,
  "classificacao" text,
  "evidencias" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "modulos" jsonb DEFAULT '[]'::jsonb,
  "status" text DEFAULT 'proposta'::text NOT NULL,
  "criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
DO $$ BEGIN
  ALTER TABLE public.orion_exstrat_recommendations ADD CONSTRAINT orion_exstrat_rec_unico UNIQUE (rec_key, dia);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.orion_exstrat_recommendations ADD CONSTRAINT orion_exstrat_recommendations_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $$;
CREATE TABLE IF NOT EXISTS public.orion_exstrat_decisions (
  "id" bigint DEFAULT nextval('orion_exstrat_decisions_id_seq'::regclass) NOT NULL,
  "decision_key" text NOT NULL,
  "dia" date DEFAULT ((now() AT TIME ZONE 'America/Cuiaba'::text))::date NOT NULL,
  "titulo" text NOT NULL,
  "objetivo" text,
  "beneficios" text,
  "riscos" text,
  "impacto_financeiro" text,
  "impacto_operacional" text,
  "impacto_tecnologico" text,
  "impacto_comercial" text,
  "prazo" text,
  "complexidade" text,
  "roi_estimado" text,
  "prob_sucesso" integer DEFAULT 50,
  "confianca" integer DEFAULT 50,
  "prioridade" integer DEFAULT 50,
  "recomendacao" text,
  "evidencias" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "financeiro" boolean DEFAULT false NOT NULL,
  "status" text DEFAULT 'proposta'::text NOT NULL,
  "resultado" jsonb,
  "decidido_por" uuid,
  "decidido_em" timestamp with time zone,
  "criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
DO $$ BEGIN
  ALTER TABLE public.orion_exstrat_decisions ADD CONSTRAINT orion_exstrat_decision_unico UNIQUE (decision_key, dia);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.orion_exstrat_decisions ADD CONSTRAINT orion_exstrat_decisions_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $$;
CREATE TABLE IF NOT EXISTS public.orion_exstrat_history (
  "id" bigint DEFAULT nextval('orion_exstrat_history_id_seq'::regclass) NOT NULL,
  "ref_tipo" text NOT NULL,
  "ref_key" text NOT NULL,
  "previsto" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "decidido" jsonb,
  "resultado" jsonb,
  "precisao" numeric,
  "aprendizado" text,
  "criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
DO $$ BEGIN
  ALTER TABLE public.orion_exstrat_history ADD CONSTRAINT orion_exstrat_history_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $$;
CREATE TABLE IF NOT EXISTS public.orion_exstrat_audits (
  "id" bigint DEFAULT nextval('orion_exstrat_audits_id_seq'::regclass) NOT NULL,
  "acao" text NOT NULL,
  "entidade" text,
  "entidade_ref" text,
  "detalhes" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "ator" uuid,
  "origem" text DEFAULT 'exec_strategy'::text NOT NULL,
  "criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
DO $$ BEGIN
  ALTER TABLE public.orion_exstrat_audits ADD CONSTRAINT orion_exstrat_audits_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $$;
CREATE TABLE IF NOT EXISTS public.orion_exstrat_questions (
  "id" bigint DEFAULT nextval('orion_exstrat_questions_id_seq'::regclass) NOT NULL,
  "pergunta" text NOT NULL,
  "resposta" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "confianca" integer DEFAULT 50,
  "contexto" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "perguntado_por" uuid,
  "criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
DO $$ BEGIN
  ALTER TABLE public.orion_exstrat_questions ADD CONSTRAINT orion_exstrat_questions_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $$;
CREATE TABLE IF NOT EXISTS public.orion_bg_models (
  "chave" text NOT NULL,
  "nome" text NOT NULL,
  "tipo" text NOT NULL,
  "provedor" text,
  "status" text DEFAULT 'declarado'::text NOT NULL,
  "descricao" text
);
DO $$ BEGIN
  ALTER TABLE public.orion_bg_models ADD CONSTRAINT orion_bg_models_pkey PRIMARY KEY (chave);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $$;
CREATE TABLE IF NOT EXISTS public.orion_bg_exports (
  "id" bigint NOT NULL,
  "project_id" bigint NOT NULL,
  "formato" text NOT NULL,
  "status" text DEFAULT 'pendente'::text NOT NULL,
  "url" text,
  "solicitado_em" timestamp with time zone DEFAULT now() NOT NULL
);
DO $$ BEGIN
  ALTER TABLE public.orion_bg_exports ADD CONSTRAINT orion_bg_exports_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $$;
CREATE TABLE IF NOT EXISTS public.orion_bg_statistics (
  "dia" date NOT NULL,
  "projetos" integer DEFAULT 0 NOT NULL,
  "fundos_removidos" integer DEFAULT 0 NOT NULL,
  "fundos_criados" integer DEFAULT 0 NOT NULL,
  "jobs_concluidos" integer DEFAULT 0 NOT NULL,
  "jobs_pendentes" integer DEFAULT 0 NOT NULL,
  "jobs_falhos" integer DEFAULT 0 NOT NULL,
  "tempo_medio_s" integer DEFAULT 0 NOT NULL,
  "score_medio" integer DEFAULT 0 NOT NULL,
  "cenarios" integer DEFAULT 0 NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
DO $$ BEGIN
  ALTER TABLE public.orion_bg_statistics ADD CONSTRAINT orion_bg_statistics_pkey PRIMARY KEY (dia);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $$;
CREATE TABLE IF NOT EXISTS public.orion_rep_badges (
  "id" bigint NOT NULL,
  "user_id" uuid NOT NULL,
  "badge_key" text NOT NULL,
  "evidencia" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "concedido_em" timestamp with time zone DEFAULT now() NOT NULL,
  "revogado_em" timestamp with time zone
);
DO $$ BEGIN
  ALTER TABLE public.orion_rep_badges ADD CONSTRAINT orion_rep_badges_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.orion_rep_badges ADD CONSTRAINT orion_rep_badges_user_id_badge_key_key UNIQUE (user_id, badge_key);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $$;
CREATE TABLE IF NOT EXISTS public.orion_rep_recommendations (
  "id" bigint NOT NULL,
  "user_id" uuid NOT NULL,
  "tipo" text NOT NULL,
  "titulo" text NOT NULL,
  "motivo" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "prioridade" text DEFAULT 'media'::text NOT NULL,
  "status" text DEFAULT 'aberta'::text NOT NULL,
  "dedupe_key" text NOT NULL,
  "criado_em" timestamp with time zone DEFAULT now() NOT NULL,
  "resolvido_em" timestamp with time zone
);
DO $$ BEGIN
  ALTER TABLE public.orion_rep_recommendations ADD CONSTRAINT orion_rep_recommendations_dedupe_key_key UNIQUE (dedupe_key);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.orion_rep_recommendations ADD CONSTRAINT orion_rep_recommendations_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $$;
CREATE TABLE IF NOT EXISTS public.orion_brand_colors (
  "id" bigint NOT NULL,
  "brand_id" bigint NOT NULL,
  "papel" text NOT NULL,
  "hex" text NOT NULL,
  "hsl" text,
  "rgb" text,
  "contraste_branco" numeric,
  "contraste_preto" numeric,
  "wcag_aa" boolean,
  "ordem" integer DEFAULT 0 NOT NULL
);
DO $$ BEGIN
  ALTER TABLE public.orion_brand_colors ADD CONSTRAINT brand_color_uq UNIQUE (brand_id, papel);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.orion_brand_colors ADD CONSTRAINT orion_brand_colors_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $$;
CREATE TABLE IF NOT EXISTS public.orion_rep_audit_log (
  "id" bigint NOT NULL,
  "executado_em" timestamp with time zone DEFAULT now() NOT NULL,
  "origem" text DEFAULT 'tick'::text NOT NULL,
  "duracao_ms" integer,
  "usuarios" integer,
  "alertas" integer,
  "badges" integer,
  "recomendacoes" integer,
  "detalhes" jsonb DEFAULT '{}'::jsonb NOT NULL
);
DO $$ BEGIN
  ALTER TABLE public.orion_rep_audit_log ADD CONSTRAINT orion_rep_audit_log_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $$;
CREATE TABLE IF NOT EXISTS public.orion_brand_fonts (
  "id" bigint NOT NULL,
  "brand_id" bigint NOT NULL,
  "papel" text NOT NULL,
  "familia" text NOT NULL,
  "peso" text,
  "tamanho_base" integer,
  "uso" text
);
DO $$ BEGIN
  ALTER TABLE public.orion_brand_fonts ADD CONSTRAINT brand_font_uq UNIQUE (brand_id, papel);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.orion_brand_fonts ADD CONSTRAINT orion_brand_fonts_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $$;
CREATE TABLE IF NOT EXISTS public.orion_brand_guidelines (
  "brand_id" bigint NOT NULL,
  "guideline" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
DO $$ BEGIN
  ALTER TABLE public.orion_brand_guidelines ADD CONSTRAINT orion_brand_guidelines_pkey PRIMARY KEY (brand_id);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $$;
CREATE TABLE IF NOT EXISTS public.orion_brand_logos (
  "id" bigint NOT NULL,
  "brand_id" bigint NOT NULL,
  "versao" text NOT NULL,
  "url" text,
  "formato" text,
  "status" text DEFAULT 'declarado'::text NOT NULL,
  "evidencias" jsonb DEFAULT '{}'::jsonb NOT NULL
);
DO $$ BEGIN
  ALTER TABLE public.orion_brand_logos ADD CONSTRAINT brand_logo_uq UNIQUE (brand_id, versao);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.orion_brand_logos ADD CONSTRAINT orion_brand_logos_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $$;
CREATE TABLE IF NOT EXISTS public.orion_brand_assets (
  "id" bigint NOT NULL,
  "brand_id" bigint NOT NULL,
  "tipo" text NOT NULL,
  "url" text,
  "meta" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
DO $$ BEGIN
  ALTER TABLE public.orion_brand_assets ADD CONSTRAINT orion_brand_assets_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $$;
CREATE TABLE IF NOT EXISTS public.orion_layout_layouts (
  "id" bigint DEFAULT nextval('orion_layout_layouts_id_seq'::regclass) NOT NULL,
  "brief" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "formato" text NOT NULL,
  "rede" text,
  "largura" integer DEFAULT 1080 NOT NULL,
  "altura" integer DEFAULT 1080 NOT NULL,
  "familia" text DEFAULT 'boxy'::text NOT NULL,
  "objetivo" text,
  "segmento" text,
  "brand_id" bigint,
  "template_id" bigint,
  "campanha_ref" text,
  "status" text DEFAULT 'novo'::text NOT NULL,
  "layout_score" integer DEFAULT 0 NOT NULL,
  "versao_atual" integer DEFAULT 0 NOT NULL,
  "criado_em" timestamp with time zone DEFAULT now() NOT NULL,
  "atualizado_em" timestamp with time zone DEFAULT now() NOT NULL
);
DO $$ BEGIN
  ALTER TABLE public.orion_layout_layouts ADD CONSTRAINT orion_layout_layouts_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $$;
CREATE TABLE IF NOT EXISTS public.orion_layout_positions (
  "id" bigint DEFAULT nextval('orion_layout_positions_id_seq'::regclass) NOT NULL,
  "layout_id" bigint NOT NULL,
  "componente" text NOT NULL,
  "tipo" text DEFAULT 'texto'::text NOT NULL,
  "x" integer NOT NULL,
  "y" integer NOT NULL,
  "w" integer NOT NULL,
  "h" integer NOT NULL,
  "z" integer DEFAULT 1 NOT NULL,
  "texto" text,
  "cor" text,
  "tipografia" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "hierarquia" integer DEFAULT 1 NOT NULL,
  "criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
DO $$ BEGIN
  ALTER TABLE public.orion_layout_positions ADD CONSTRAINT orion_layout_positions_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $$;
CREATE TABLE IF NOT EXISTS public.orion_layout_components (
  "componente" text NOT NULL,
  "tipo" text NOT NULL,
  "hierarquia_peso" integer DEFAULT 1 NOT NULL,
  "tamanho_rel" numeric DEFAULT 0.03 NOT NULL,
  "descricao" text
);
DO $$ BEGIN
  ALTER TABLE public.orion_layout_components ADD CONSTRAINT orion_layout_components_pkey PRIMARY KEY (componente);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $$;
CREATE TABLE IF NOT EXISTS public.orion_brand_recommendations (
  "id" bigint NOT NULL,
  "brand_id" bigint NOT NULL,
  "dedupe_key" text NOT NULL,
  "titulo" text NOT NULL,
  "categoria" text NOT NULL,
  "prioridade" integer DEFAULT 0 NOT NULL,
  "descricao" text NOT NULL,
  "status" text DEFAULT 'aberta'::text NOT NULL,
  "criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
DO $$ BEGIN
  ALTER TABLE public.orion_brand_recommendations ADD CONSTRAINT brand_rec_uq UNIQUE (brand_id, dedupe_key);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.orion_brand_recommendations ADD CONSTRAINT orion_brand_recommendations_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $$;
CREATE TABLE IF NOT EXISTS public.orion_layout_validations (
  "id" bigint DEFAULT nextval('orion_layout_validations_id_seq'::regclass) NOT NULL,
  "layout_id" bigint NOT NULL,
  "aprovado" boolean DEFAULT false NOT NULL,
  "checagens" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
DO $$ BEGIN
  ALTER TABLE public.orion_layout_validations ADD CONSTRAINT orion_layout_validation_unico UNIQUE (layout_id);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.orion_layout_validations ADD CONSTRAINT orion_layout_validations_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $$;
CREATE TABLE IF NOT EXISTS public.orion_brand_exports (
  "id" bigint NOT NULL,
  "brand_id" bigint NOT NULL,
  "tipo" text DEFAULT 'brand_book_pdf'::text NOT NULL,
  "status" text DEFAULT 'pendente'::text NOT NULL,
  "url" text,
  "solicitado_em" timestamp with time zone DEFAULT now() NOT NULL
);
DO $$ BEGIN
  ALTER TABLE public.orion_brand_exports ADD CONSTRAINT orion_brand_exports_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $$;
CREATE TABLE IF NOT EXISTS public.orion_brand_statistics (
  "dia" date NOT NULL,
  "marcas" integer DEFAULT 0 NOT NULL,
  "com_logo" integer DEFAULT 0 NOT NULL,
  "com_paleta" integer DEFAULT 0 NOT NULL,
  "com_fontes" integer DEFAULT 0 NOT NULL,
  "com_manual" integer DEFAULT 0 NOT NULL,
  "brand_score_medio" integer DEFAULT 0 NOT NULL,
  "identity_medio" integer DEFAULT 0 NOT NULL,
  "consistency_media" integer DEFAULT 0 NOT NULL,
  "recomendacoes" integer DEFAULT 0 NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
DO $$ BEGIN
  ALTER TABLE public.orion_brand_statistics ADD CONSTRAINT orion_brand_statistics_pkey PRIMARY KEY (dia);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $$;
CREATE TABLE IF NOT EXISTS public.orion_tpl_segments (
  "segmento" text NOT NULL,
  "grupo" text NOT NULL,
  "icone" text,
  "ativo" boolean DEFAULT true NOT NULL
);
DO $$ BEGIN
  ALTER TABLE public.orion_tpl_segments ADD CONSTRAINT orion_tpl_segments_pkey PRIMARY KEY (segmento);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $$;
CREATE TABLE IF NOT EXISTS public.orion_layout_scores (
  "id" bigint DEFAULT nextval('orion_layout_scores_id_seq'::regclass) NOT NULL,
  "layout_id" bigint NOT NULL,
  "layout_score" integer DEFAULT 0 NOT NULL,
  "componentes" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
DO $$ BEGIN
  ALTER TABLE public.orion_layout_scores ADD CONSTRAINT orion_layout_score_unico UNIQUE (layout_id);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.orion_layout_scores ADD CONSTRAINT orion_layout_scores_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $$;
CREATE TABLE IF NOT EXISTS public.orion_layout_previews (
  "id" bigint DEFAULT nextval('orion_layout_previews_id_seq'::regclass) NOT NULL,
  "layout_id" bigint NOT NULL,
  "formato" text NOT NULL,
  "spec" jsonb NOT NULL,
  "criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
DO $$ BEGIN
  ALTER TABLE public.orion_layout_previews ADD CONSTRAINT orion_layout_preview_unico UNIQUE (layout_id, formato);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.orion_layout_previews ADD CONSTRAINT orion_layout_previews_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $$;
CREATE TABLE IF NOT EXISTS public.orion_layout_exports (
  "id" bigint DEFAULT nextval('orion_layout_exports_id_seq'::regclass) NOT NULL,
  "layout_id" bigint NOT NULL,
  "formato_saida" text NOT NULL,
  "spec" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "url" text,
  "nota" text,
  "criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
DO $$ BEGIN
  ALTER TABLE public.orion_layout_exports ADD CONSTRAINT orion_layout_exports_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $$;
CREATE TABLE IF NOT EXISTS public.orion_layout_metrics (
  "id" bigint DEFAULT nextval('orion_layout_metrics_id_seq'::regclass) NOT NULL,
  "dia" date DEFAULT ((now() AT TIME ZONE 'America/Cuiaba'::text))::date NOT NULL,
  "criados" integer DEFAULT 0 NOT NULL,
  "usados" integer DEFAULT 0 NOT NULL,
  "exportados" integer DEFAULT 0 NOT NULL,
  "score_medio" numeric,
  "aprovados_pct" numeric,
  "criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
DO $$ BEGIN
  ALTER TABLE public.orion_layout_metrics ADD CONSTRAINT orion_layout_metrics_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.orion_layout_metrics ADD CONSTRAINT orion_layout_metrics_unico UNIQUE (dia);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $$;
CREATE TABLE IF NOT EXISTS public.orion_layout_history (
  "id" bigint DEFAULT nextval('orion_layout_history_id_seq'::regclass) NOT NULL,
  "layout_id" bigint,
  "evento" text NOT NULL,
  "dados" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
DO $$ BEGIN
  ALTER TABLE public.orion_layout_history ADD CONSTRAINT orion_layout_history_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $$;
CREATE TABLE IF NOT EXISTS public.orion_tpl_templates (
  "template_id" bigint NOT NULL,
  "nome" text NOT NULL,
  "categoria" text NOT NULL,
  "subcategoria" text,
  "tipo" text NOT NULL,
  "segmento" text,
  "objetivo" text,
  "formato" text,
  "estilo" text DEFAULT 'moderno'::text NOT NULL,
  "nivel" text DEFAULT 'gratuito'::text NOT NULL,
  "cores" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "fontes" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "componentes" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "idioma" text DEFAULT 'pt-BR'::text NOT NULL,
  "base_score" integer DEFAULT 50 NOT NULL,
  "score" integer DEFAULT 50 NOT NULL,
  "versao" integer DEFAULT 1 NOT NULL,
  "autor" text DEFAULT 'orion'::text NOT NULL,
  "ativo" boolean DEFAULT true NOT NULL,
  "criado_em" timestamp with time zone DEFAULT now() NOT NULL,
  "atualizado_em" timestamp with time zone DEFAULT now() NOT NULL
);
DO $$ BEGIN
  ALTER TABLE public.orion_tpl_templates ADD CONSTRAINT orion_tpl_nome_uq UNIQUE (nome);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.orion_tpl_templates ADD CONSTRAINT orion_tpl_templates_pkey PRIMARY KEY (template_id);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $$;
CREATE TABLE IF NOT EXISTS public.orion_aeo_audits (
  "id" bigint DEFAULT nextval('orion_aeo_audits_id_seq'::regclass) NOT NULL,
  "acao" text NOT NULL,
  "entidade" text,
  "detalhes" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "ator" uuid,
  "criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
DO $$ BEGIN
  ALTER TABLE public.orion_aeo_audits ADD CONSTRAINT orion_aeo_audits_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $$;
CREATE TABLE IF NOT EXISTS public.orion_aeo_runs (
  "id" bigint DEFAULT nextval('orion_aeo_runs_id_seq'::regclass) NOT NULL,
  "iniciado_em" timestamp with time zone DEFAULT now() NOT NULL,
  "finalizado_em" timestamp with time zone,
  "ok" boolean,
  "health_score" integer,
  "resultado" jsonb DEFAULT '{}'::jsonb NOT NULL
);
DO $$ BEGIN
  ALTER TABLE public.orion_aeo_runs ADD CONSTRAINT orion_aeo_runs_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $$;
CREATE TABLE IF NOT EXISTS public.orion_agrowth_predictions (
  "id" bigint DEFAULT nextval('orion_agrowth_predictions_id_seq'::regclass) NOT NULL,
  "metrica" text NOT NULL,
  "horizonte_dias" integer NOT NULL,
  "valor_previsto" numeric,
  "base_estatistica" text NOT NULL,
  "metodo" text NOT NULL,
  "confianca" numeric DEFAULT 0 NOT NULL,
  "n_amostras" bigint DEFAULT 0 NOT NULL,
  "dedupe_key" text NOT NULL,
  "criada_em" timestamp with time zone DEFAULT now() NOT NULL
);
DO $$ BEGIN
  ALTER TABLE public.orion_agrowth_predictions ADD CONSTRAINT orion_agrowth_predictions_dedupe_key_key UNIQUE (dedupe_key);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.orion_agrowth_predictions ADD CONSTRAINT orion_agrowth_predictions_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $$;
CREATE TABLE IF NOT EXISTS public.orion_agrowth_kpis (
  "dia" date NOT NULL,
  "kpis" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
DO $$ BEGIN
  ALTER TABLE public.orion_agrowth_kpis ADD CONSTRAINT orion_agrowth_kpis_pkey PRIMARY KEY (dia);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $$;
CREATE TABLE IF NOT EXISTS public.orion_agrowth_alerts (
  "id" bigint DEFAULT nextval('orion_agrowth_alerts_id_seq'::regclass) NOT NULL,
  "severidade" text DEFAULT 'info'::text NOT NULL,
  "titulo" text NOT NULL,
  "evidencia" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "dedupe_key" text NOT NULL,
  "ativo" boolean DEFAULT true NOT NULL,
  "criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
DO $$ BEGIN
  ALTER TABLE public.orion_agrowth_alerts ADD CONSTRAINT orion_agrowth_alerts_dedupe_key_key UNIQUE (dedupe_key);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.orion_agrowth_alerts ADD CONSTRAINT orion_agrowth_alerts_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $$;
CREATE TABLE IF NOT EXISTS public.orion_aeo_alerts (
  "id" bigint DEFAULT nextval('orion_aeo_alerts_id_seq'::regclass) NOT NULL,
  "alert_key" text NOT NULL,
  "severidade" text NOT NULL,
  "categoria" text NOT NULL,
  "titulo" text NOT NULL,
  "evidencias" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "status" text DEFAULT 'aberto'::text NOT NULL,
  "criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
DO $$ BEGIN
  ALTER TABLE public.orion_aeo_alerts ADD CONSTRAINT orion_aeo_alert_unico UNIQUE (alert_key);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.orion_aeo_alerts ADD CONSTRAINT orion_aeo_alerts_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $$;
CREATE TABLE IF NOT EXISTS public.orion_auction_score_history (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "listing_id" uuid NOT NULL,
  "score" integer,
  "probabilidade" integer,
  "valor_previsto" numeric,
  "sinais" jsonb,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
DO $$ BEGIN
  ALTER TABLE public.orion_auction_score_history ADD CONSTRAINT orion_auction_score_history_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $$;
CREATE TABLE IF NOT EXISTS public.orion_auction_alerts (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "listing_id" uuid NOT NULL,
  "seller_user_id" uuid,
  "tipo" text NOT NULL,
  "severidade" text DEFAULT 'info'::text NOT NULL,
  "mensagem" text,
  "dados" jsonb DEFAULT '{}'::jsonb,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
DO $$ BEGIN
  ALTER TABLE public.orion_auction_alerts ADD CONSTRAINT orion_auction_alerts_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $$;
CREATE TABLE IF NOT EXISTS public.orion_dprice_history (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "listing_id" uuid NOT NULL,
  "campo" text NOT NULL,
  "valor_antigo" numeric,
  "valor_novo" numeric,
  "origem" text,
  "ator" uuid,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
DO $$ BEGIN
  ALTER TABLE public.orion_dprice_history ADD CONSTRAINT orion_dprice_history_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $$;
CREATE TABLE IF NOT EXISTS public.orion_score_calculations (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "carrier_id" uuid NOT NULL,
  "algorithm_version" text NOT NULL,
  "operational_score" numeric NOT NULL,
  "documental_score" numeric NOT NULL,
  "maintenance_score" numeric NOT NULL,
  "financial_score" numeric NOT NULL,
  "reliability_score" numeric NOT NULL,
  "overall_score" numeric NOT NULL,
  "factors" jsonb NOT NULL,
  "weights" jsonb NOT NULL,
  "calculated_at" timestamp with time zone DEFAULT now() NOT NULL
);
DO $$ BEGIN
  ALTER TABLE public.orion_score_calculations ADD CONSTRAINT orion_score_calculations_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $$;CREATE TABLE IF NOT EXISTS public.orion_score_calculations (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "carrier_id" uuid NOT NULL,
  "algorithm_version" text NOT NULL,
  "operational_score" numeric NOT NULL,
  "documental_score" numeric NOT NULL,
  "maintenance_score" numeric NOT NULL,
  "financial_score" numeric NOT NULL,
  "reliability_score" numeric NOT NULL,
  "overall_score" numeric NOT NULL,
  "factors" jsonb NOT NULL,
  "weights" jsonb NOT NULL,
  "calculated_at" timestamp with time zone DEFAULT now() NOT NULL
);
DO $$ BEGIN
  ALTER TABLE public.orion_score_calculations ADD CONSTRAINT orion_score_calculations_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $$;CREATE TABLE IF NOT EXISTS public.support_ai_knowledge (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "category" text,
  "question" text NOT NULL,
  "answer" text NOT NULL,
  "profile_type" text,
  "is_active" boolean DEFAULT true,
  "priority" integer DEFAULT 0,
  "created_at" timestamp with time zone DEFAULT now()
);
DO $$ BEGIN
  ALTER TABLE public.support_ai_knowledge ADD CONSTRAINT support_ai_knowledge_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $$;DO $$ DECLARE t text; BEGIN
  FOREACH t IN ARRAY ARRAY['real_estate_listings','vehicle_listings','travel_listings','freight_listings','service_listings','product_listings','advertiser_listings','marketplace_products','auction_listings'] LOOP
    IF to_regclass('public.'||t) IS NOT NULL THEN
      EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS moderation_status text', t);
      EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS ai_status text', t);
      EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS ai_verdict text', t);
    END IF;
  END LOOP;
END $$;
DO $$ DECLARE t text; BEGIN
  FOREACH t IN ARRAY ARRAY['real_estate_listings','vehicle_listings','travel_listings','freight_listings','service_listings','product_listings','advertiser_listings','marketplace_products','auction_listings'] LOOP
    IF to_regclass('public.'||t) IS NOT NULL THEN
      EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS moderation_reason text', t);
    END IF;
  END LOOP;
END $$;
CREATE TABLE IF NOT EXISTS public.motoboys (
  "id" uuid DEFAULT uuid_generate_v4() NOT NULL,
  "user_id" uuid,
  "nome" text NOT NULL,
  "telefone" text,
  "foto_url" text,
  "regiao_id" uuid,
  "status" text DEFAULT 'ativo'::text,
  "aprovado" boolean DEFAULT false,
  "total_postagens" integer DEFAULT 0,
  "criado_em" timestamp with time zone DEFAULT now(),
  "atualizado_em" timestamp with time zone DEFAULT now()
);
DO $$ BEGIN
  ALTER TABLE public.motoboys ADD CONSTRAINT motoboys_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN duplicate_table THEN NULL; END $$;ALTER TABLE public.store_carts ADD COLUMN IF NOT EXISTS converted_at timestamptz;
ALTER TABLE public.store_carts ADD COLUMN IF NOT EXISTS items_count integer DEFAULT 0, ADD COLUMN IF NOT EXISTS subtotal_amount numeric DEFAULT 0;
CREATE TABLE IF NOT EXISTS public.orion_auction_commissions (id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY, created_at timestamptz NOT NULL DEFAULT now());
ALTER TABLE public.auction_events ADD COLUMN IF NOT EXISTS listing_id uuid;
ALTER TABLE public.auction_listings ADD COLUMN IF NOT EXISTS seller_id uuid;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS profile_type text;
CREATE TABLE IF NOT EXISTS public.produtos (id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY, created_at timestamptz NOT NULL DEFAULT now());
ALTER TABLE public.store_carts ADD COLUMN IF NOT EXISTS consumer_user_id uuid, ADD COLUMN IF NOT EXISTS session_token text;
