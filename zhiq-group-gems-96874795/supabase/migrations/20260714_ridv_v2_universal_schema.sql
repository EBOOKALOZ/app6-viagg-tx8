-- ==============================================================================
-- RIDV V2.0 — Moderação Obrigatória Universal (Texto e Imagem)
-- Data: 2026-07-14
-- Blindagem de todas as tabelas de anúncios com colunas de IA, Triggers e RLS
-- ==============================================================================

-- 1. Criação da Tabela de Histórico e Aprendizado da IA (Etapa 9)
CREATE TABLE IF NOT EXISTS public.ridv_decisions_log (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  listing_id uuid,
  media_id uuid,
  category text NOT NULL, -- 'real_estate', 'vehicle', 'travel', 'freight', 'service', 'product', 'auction'
  content_type text NOT NULL, -- 'text' ou 'image'
  status text NOT NULL, -- 'approved', 'manual_review', 'blocked'
  confidence numeric(5,4),
  reason text,
  verdict text,
  ai_provider text DEFAULT 'anthropic/claude-haiku',
  user_id uuid REFERENCES auth.users(id),
  reviewed_by uuid REFERENCES auth.users(id),
  reviewed_at timestamptz,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now()
);

-- Índices para busca no Painel Administrativo da RIDV e métricas de IA
CREATE INDEX IF NOT EXISTS idx_ridv_log_category ON public.ridv_decisions_log(category);
CREATE INDEX IF NOT EXISTS idx_ridv_log_status ON public.ridv_decisions_log(status);
CREATE INDEX IF NOT EXISTS idx_ridv_log_created_at ON public.ridv_decisions_log(created_at DESC);

ALTER TABLE public.ridv_decisions_log ENABLE ROW LEVEL SECURITY;

DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'ridv_decisions_log' AND policyname = 'ridv_decisions_log_select_admin'
  ) THEN
    CREATE POLICY ridv_decisions_log_select_admin ON public.ridv_decisions_log
      FOR SELECT TO authenticated
      USING (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'ridv_decisions_log' AND policyname = 'ridv_decisions_log_insert_all'
  ) THEN
    CREATE POLICY ridv_decisions_log_insert_all ON public.ridv_decisions_log
      FOR INSERT TO authenticated, service_role
      WITH CHECK (true);
  END IF;
END $$;

-- ==============================================================================
-- 2. Adição das colunas universais de moderação em todas as tabelas de anúncios (Etapa 4)
-- ==============================================================================

DO $$
DECLARE
  t text;
  tables text[] := ARRAY[
    'real_estate_listings',
    'vehicle_listings',
    'travel_listings',
    'freight_listings',
    'service_listings',
    'product_listings',
    'advertiser_listings',
    'marketplace_products',
    'auction_listings'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = t) THEN
      EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS moderation_status text NOT NULL DEFAULT ''pending_ai_analysis''', t);
      EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS ai_status text DEFAULT ''queued''', t);
      EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS ai_verdict text', t);
      EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS ai_confidence numeric(5,4)', t);
      EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS moderation_reason text', t);
      EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS reviewed_at timestamptz', t);
      EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS reviewed_by uuid REFERENCES auth.users(id)', t);
      EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS ai_provider text DEFAULT ''anthropic/claude-haiku''', t);
    END IF;
  END LOOP;
END $$;

-- ==============================================================================
-- 3. Função Universal de Interceptação de Fila / Trigger (Etapas 4 e 5)
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.handle_ridv_v2_universal_queue()
RETURNS trigger AS $$
BEGIN
  -- Se a inserção ou atualização for feita por service_role (Edge Functions / IA), respeita o que foi enviado
  IF current_setting('role', true) = 'service_role' THEN
    RETURN NEW;
  END IF;

  -- Para qualquer inserção feita por usuário ou front-end comum:
  IF TG_OP = 'INSERT' THEN
    NEW.moderation_status := 'pending_ai_analysis';
    NEW.ai_status := 'queued';
  ELSIF TG_OP = 'UPDATE' THEN
    IF NEW.moderation_status IS DISTINCT FROM OLD.moderation_status AND OLD.moderation_status IS NOT NULL THEN
      NEW.moderation_status := OLD.moderation_status;
    END IF;
    IF NEW.ai_status IS DISTINCT FROM OLD.ai_status AND OLD.ai_status IS NOT NULL THEN
      NEW.ai_status := OLD.ai_status;
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Acoplar Triggers nas 9 tabelas
DO $$
DECLARE
  t text;
  tables text[] := ARRAY[
    'real_estate_listings',
    'vehicle_listings',
    'travel_listings',
    'freight_listings',
    'service_listings',
    'product_listings',
    'advertiser_listings',
    'marketplace_products',
    'auction_listings'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = t) THEN
      EXECUTE format('DROP TRIGGER IF EXISTS trg_ridv_v2_universal_queue ON public.%I', t);
      EXECUTE format('CREATE TRIGGER trg_ridv_v2_universal_queue BEFORE INSERT OR UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.handle_ridv_v2_universal_queue()', t);
    END IF;
  END LOOP;
END $$;

-- ==============================================================================
-- 4. Criação/Revisão de Views Públicas Protegidas (Etapa 7)
-- ==============================================================================

CREATE OR REPLACE VIEW public.public_real_estate_listings AS
SELECT * FROM public.real_estate_listings
WHERE visibility_status = 'published'
  AND moderation_status IN ('approved', 'approved_clean', 'approved_masked', 'manual_approved');

CREATE OR REPLACE VIEW public.public_vehicle_listings AS
SELECT * FROM public.vehicle_listings
WHERE visibility_status = 'published'
  AND moderation_status IN ('approved', 'approved_clean', 'approved_masked', 'manual_approved');

CREATE OR REPLACE VIEW public.public_travel_listings AS
SELECT * FROM public.travel_listings
WHERE visibility_status = 'published'
  AND moderation_status IN ('approved', 'approved_clean', 'approved_masked', 'manual_approved');

CREATE OR REPLACE VIEW public.public_freight_listings AS
SELECT * FROM public.freight_listings
WHERE visibility_status = 'published'
  AND moderation_status IN ('approved', 'approved_clean', 'approved_masked', 'manual_approved');

CREATE OR REPLACE VIEW public.public_service_listings AS
SELECT * FROM public.service_listings
WHERE visibility_status = 'published'
  AND moderation_status IN ('approved', 'approved_clean', 'approved_masked', 'manual_approved');

CREATE OR REPLACE VIEW public.public_product_listings AS
SELECT * FROM public.product_listings
WHERE status = 'active'
  AND moderation_status IN ('approved', 'approved_clean', 'approved_masked', 'manual_approved');

GRANT SELECT ON public.public_real_estate_listings TO anon, authenticated;
GRANT SELECT ON public.public_vehicle_listings TO anon, authenticated;
GRANT SELECT ON public.public_travel_listings TO anon, authenticated;
GRANT SELECT ON public.public_freight_listings TO anon, authenticated;
GRANT SELECT ON public.public_service_listings TO anon, authenticated;
GRANT SELECT ON public.public_product_listings TO anon, authenticated;
