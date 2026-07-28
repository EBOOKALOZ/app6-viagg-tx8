-- ============================================================
-- VIAGENS — SINCRONIZAÇÃO DE SCHEMA (elimina drift) · 2026-07-23
-- ------------------------------------------------------------
-- A auditoria de 2026-07-23 encontrou colunas usadas pelo código
-- (ViagemForm grava latitude/longitude/endereço/moderação; a
-- conta do viajante filtra contact_user_id) que não existiam em
-- NENHUMA migration. Esta migration versiona todas elas — nenhuma
-- coluna pode existir apenas no banco de produção.
--
-- Também versiona a RPC register_travel_contact_intention (chamada
-- pelo front em useContactIntentions.ts:508 e inexistente no repo)
-- como wrapper fino da RPC oficial register_contact_intention, e
-- passa a gravar contact_user_id = auth.uid() quando o visitante
-- está logado (habilita "Meus Interesses" do viajante e a RLS do
-- chat travel_negotiation_messages).
--
-- Idempotente (IF NOT EXISTS / CREATE OR REPLACE).
-- Aplicar via SQL Editor (broifhfqmnzqoongtokm).
-- ============================================================

-- ── 1. travel_listings: colunas gravadas pelo ViagemForm ─────
ALTER TABLE public.travel_listings
  ADD COLUMN IF NOT EXISTS latitude double precision,
  ADD COLUMN IF NOT EXISTS longitude double precision,
  ADD COLUMN IF NOT EXISTS endereco_formatado text,
  ADD COLUMN IF NOT EXISTS moderation_status text NOT NULL DEFAULT 'approved',
  ADD COLUMN IF NOT EXISTS ai_status text NOT NULL DEFAULT 'approved',
  ADD COLUMN IF NOT EXISTS moderation_reason text;

-- ── 2. advertiser_contact_intentions: identidade do LEAD ─────
-- Usada por TravelAccountPage ("Meus Interesses") e pela RLS do
-- chat de negociação. Não é PII de terceiro: é o uid do próprio
-- visitante logado — por isso entra no GRANT de coluna do P0.
ALTER TABLE public.advertiser_contact_intentions
  ADD COLUMN IF NOT EXISTS contact_user_id uuid;

CREATE INDEX IF NOT EXISTS idx_aci_contact_user
  ON public.advertiser_contact_intentions (contact_user_id, listing_module, created_at DESC);

-- O lockdown P0 (20260721) revogou SELECT de tabela e concedeu
-- colunas não-PII por lista — a coluna nova precisa entrar na lista.
GRANT SELECT (contact_user_id)
  ON public.advertiser_contact_intentions TO authenticated;

-- O LEAD logado pode ler as próprias intenções (colunas não-PII).
-- Policies permissivas somam-se às existentes do anunciante.
DROP POLICY IF EXISTS aci_select_lead_own ON public.advertiser_contact_intentions;
CREATE POLICY aci_select_lead_own ON public.advertiser_contact_intentions
  FOR SELECT TO authenticated
  USING (contact_user_id = auth.uid());

-- ── 3. Índices de acesso da vitrine e das mídias ─────────────
CREATE INDEX IF NOT EXISTS idx_travel_listings_vitrine
  ON public.travel_listings (visibility_status, is_featured DESC, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_travel_media_listing_sort
  ON public.travel_media (listing_id, sort_order);

CREATE INDEX IF NOT EXISTS idx_travel_listings_owner
  ON public.travel_listings (owner_user_id, created_at DESC);

-- ── 4. register_contact_intention: gravar contact_user_id ────
-- Mesma assinatura/comportamento da versão 20260624 (não muda a
-- regra de negócio homologada) + preenche contact_user_id.
-- Guard: o banco pode já ter esta função (drift). CREATE OR REPLACE
-- falha com 42P13 se a versão existente tiver defaults diferentes —
-- por isso dropamos TODAS as sobrecargas antes (idempotente).
DO $drop$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig FROM pg_proc p
    WHERE p.pronamespace='public'::regnamespace AND p.proname='register_contact_intention'
  LOOP EXECUTE format('DROP FUNCTION IF EXISTS %s', r.sig); END LOOP;
END $drop$;

CREATE OR REPLACE FUNCTION public.register_contact_intention(
  p_listing_module text,
  p_listing_id uuid,
  p_interest_type text,
  p_visitor_name text DEFAULT NULL,
  p_visitor_phone text DEFAULT NULL,
  p_visitor_message text DEFAULT NULL,
  p_city text DEFAULT NULL,
  p_region text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_advertiser_user_id uuid;
  v_intention_id uuid;
BEGIN
  IF p_visitor_name IS NULL OR length(trim(p_visitor_name)) = 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'nome_obrigatorio');
  END IF;

  IF p_listing_module = 'real_estate' THEN
    SELECT owner_user_id INTO v_advertiser_user_id FROM public.real_estate_listings WHERE id = p_listing_id;
  ELSIF p_listing_module = 'vehicles' THEN
    SELECT owner_user_id INTO v_advertiser_user_id FROM public.vehicle_listings WHERE id = p_listing_id;
  ELSIF p_listing_module = 'product' THEN
    SELECT created_by_user_id INTO v_advertiser_user_id FROM public.merchant_marketing_products WHERE id = p_listing_id;
    IF v_advertiser_user_id IS NULL THEN
      SELECT aa.user_id INTO v_advertiser_user_id
      FROM public.advertiser_listings al
      JOIN public.advertiser_accounts aa ON aa.id = al.advertiser_account_id
      WHERE al.id = p_listing_id;
    END IF;
  ELSIF p_listing_module = 'services' THEN
    SELECT owner_user_id INTO v_advertiser_user_id FROM public.service_listings WHERE id = p_listing_id;
  ELSIF p_listing_module = 'freight' THEN
    SELECT owner_user_id INTO v_advertiser_user_id FROM public.freight_listings WHERE id = p_listing_id;
  ELSIF p_listing_module = 'travel' THEN
    SELECT owner_user_id INTO v_advertiser_user_id FROM public.travel_listings WHERE id = p_listing_id;
  END IF;

  IF v_advertiser_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'listing_not_found');
  END IF;

  IF auth.uid() = v_advertiser_user_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'self_contact_not_allowed');
  END IF;

  INSERT INTO public.advertiser_contact_intentions (
    advertiser_user_id, listing_module, listing_id, interest_type,
    visitor_name, visitor_phone, visitor_message, city, region,
    status, contact_user_id, created_at
  )
  VALUES (
    v_advertiser_user_id, p_listing_module, p_listing_id, p_interest_type,
    trim(p_visitor_name), regexp_replace(p_visitor_phone, '\D', '', 'g'),
    p_visitor_message, p_city, p_region,
    'pending_unlock', auth.uid(), now()
  )
  RETURNING id INTO v_intention_id;

  RETURN jsonb_build_object('success', true, 'intention_id', v_intention_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.register_contact_intention(text, uuid, text, text, text, text, text, text) TO anon, authenticated;

-- ── 5. register_travel_contact_intention (wrapper oficial) ───
-- O front de viagens chama esta assinatura desde jun/2026; até
-- hoje ela só existia (se existia) fora do versionamento.
-- Guard idem ao anterior: dropa qualquer versão pré-existente (drift)
-- para evitar 42P13 ao redefinir com defaults.
DO $drop$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig FROM pg_proc p
    WHERE p.pronamespace='public'::regnamespace AND p.proname='register_travel_contact_intention'
  LOOP EXECUTE format('DROP FUNCTION IF EXISTS %s', r.sig); END LOOP;
END $drop$;

CREATE OR REPLACE FUNCTION public.register_travel_contact_intention(
  p_listing_id uuid,
  p_interest_type text,
  p_visitor_name text DEFAULT NULL,
  p_visitor_phone text DEFAULT NULL,
  p_visitor_message text DEFAULT NULL,
  p_city text DEFAULT NULL,
  p_region text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.register_contact_intention(
    'travel', p_listing_id, p_interest_type,
    p_visitor_name, p_visitor_phone, p_visitor_message,
    p_city, p_region
  );
$$;

GRANT EXECUTE ON FUNCTION public.register_travel_contact_intention(uuid, text, text, text, text, text, text) TO anon, authenticated;

SELECT pg_notify('pgrst', 'reload schema');

-- ── VERIFICAÇÃO (esperado: 6 colunas novas · 2 RPCs · policy) ──
SELECT
  (SELECT count(*)::int FROM information_schema.columns
    WHERE table_schema='public' AND table_name='travel_listings'
      AND column_name IN ('latitude','longitude','endereco_formatado','moderation_status','ai_status','moderation_reason')) AS colunas_form_ok,
  (SELECT count(*)::int FROM information_schema.columns
    WHERE table_schema='public' AND table_name='advertiser_contact_intentions'
      AND column_name='contact_user_id') AS contact_user_id_ok,
  (SELECT count(*)::int FROM pg_proc p
    WHERE p.pronamespace='public'::regnamespace
      AND p.proname IN ('register_contact_intention','register_travel_contact_intention')) AS rpcs_ok,
  (SELECT count(*)::int FROM pg_policies
    WHERE tablename='advertiser_contact_intentions' AND policyname='aci_select_lead_own') AS policy_lead_ok;
