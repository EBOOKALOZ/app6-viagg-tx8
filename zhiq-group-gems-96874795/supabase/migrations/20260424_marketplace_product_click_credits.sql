-- ═══════════════════════════════════════════════════════════════
-- MARKETPLACE PRODUCT CLICK — Cobrança de 3 créditos do lojista
-- Fase 1 da regra oficial:
--   Navegação na plataforma = grátis.
--   Clique num card de produto na grade do /mercado que leva
--   o visitante para dentro da loja onde está o produto = 3 créditos
--   debitados do lojista dono do produto.
--
-- Backend-driven, atômico, com:
--   - skip se o próprio dono clica
--   - skip+log se saldo insuficiente (visitante segue navegando)
--   - dedup configurável por (store, visitor) via metadata.dedup_minutes
--     (em modo teste = 0 → toda chance debita; em prod ajustar p/ 30)
-- ═══════════════════════════════════════════════════════════════

-- ─── 1. Regra de uso ────────────────────────────────────────────
-- metadata para dedup (se a coluna não existir, cria)
ALTER TABLE public.merchant_credit_usage_rules
  ADD COLUMN IF NOT EXISTS metadata jsonb NOT NULL DEFAULT '{}'::jsonb;

-- credits_cost = 3, dedup_minutes = 0 (teste). Trocar para 30 em produção.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.merchant_credit_usage_rules WHERE feature_code = 'marketplace_product_click') THEN
    UPDATE public.merchant_credit_usage_rules
       SET feature_name = 'Entrada na loja a partir de anúncio',
           module_name  = 'MARKETPLACE',
           event_type   = 'marketplace_product_click',
           credits_cost = 3,
           description  = 'Clique num produto na grade do /mercado que leva o visitante para dentro da loja',
           is_active    = true,
           metadata     = jsonb_set(
                            jsonb_set(COALESCE(metadata, '{}'::jsonb), '{dedup_minutes}', '0'::jsonb, true),
                            '{dry_run}', 'false'::jsonb, true
                          )
     WHERE feature_code = 'marketplace_product_click';
  ELSE
    INSERT INTO public.merchant_credit_usage_rules
      (feature_code, feature_name, module_name, event_type, credits_cost, description, is_active, metadata)
    VALUES
      ('marketplace_product_click',
       'Entrada na loja a partir de anúncio',
       'MARKETPLACE',
       'marketplace_product_click',
       3,
       'Clique num produto na grade do /mercado que leva o visitante para dentro da loja',
       true,
       jsonb_build_object('dedup_minutes', 0, 'dry_run', false));
  END IF;
END $$;

-- ─── 2. Tabela de eventos de clique ─────────────────────────────
CREATE TABLE IF NOT EXISTS public.marketplace_product_click_events (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id        uuid NOT NULL,
  product_id      uuid NOT NULL,
  visitor_user_id uuid,            -- auth.uid() quando logado
  anon_id         text,            -- id anônimo persistido no client (localStorage)
  city            text,
  neighborhood    text,
  source          text,            -- 'card' | 'store_name' | etc.
  status          text NOT NULL,   -- 'charged' | 'dry_run' | 'owner_skip' | 'insufficient_balance' | 'deduped'
  credits_charged integer NOT NULL DEFAULT 0,
  ledger_entry_id uuid,
  metadata        jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_mpce_store        ON public.marketplace_product_click_events(store_id);
CREATE INDEX IF NOT EXISTS idx_mpce_product      ON public.marketplace_product_click_events(product_id);
CREATE INDEX IF NOT EXISTS idx_mpce_created_at   ON public.marketplace_product_click_events(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_mpce_dedup_user   ON public.marketplace_product_click_events(store_id, visitor_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_mpce_dedup_anon   ON public.marketplace_product_click_events(store_id, anon_id, created_at DESC);

ALTER TABLE public.marketplace_product_click_events ENABLE ROW LEVEL SECURITY;

-- Lojistas leem só os eventos da própria loja
DO $$ BEGIN
  CREATE POLICY "mpce_select_own_store"
    ON public.marketplace_product_click_events
    FOR SELECT
    USING (
      store_id IN (SELECT id FROM public.merchant_stores WHERE user_id = auth.uid())
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Admin lê tudo
DO $$ BEGIN
  CREATE POLICY "mpce_select_admin"
    ON public.marketplace_product_click_events
    FOR SELECT
    USING (
      EXISTS (
        SELECT 1 FROM public.profiles p
         WHERE p.id = auth.uid() AND COALESCE(p.is_admin, false) = true
      )
    );
EXCEPTION WHEN duplicate_object THEN NULL; WHEN undefined_table THEN NULL;
END $$;

-- Inserts vêm exclusivamente da RPC (SECURITY DEFINER), então nada de policy de INSERT pública.

-- ─── 3. RPC: consume_marketplace_product_click ──────────────────
CREATE OR REPLACE FUNCTION public.consume_marketplace_product_click(
  p_product_id   uuid,
  p_store_id     uuid,
  p_anon_id      text DEFAULT NULL,
  p_city         text DEFAULT NULL,
  p_neighborhood text DEFAULT NULL,
  p_source       text DEFAULT 'card'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_visitor_id     uuid := auth.uid();
  v_owner_id       uuid;
  v_cost           integer;
  v_dedup_minutes  integer;
  v_dry_run        boolean;
  v_balance        integer;
  v_consumed       integer;
  v_new_balance    integer;
  v_ledger_id      uuid;
  v_event_id       uuid;
  v_existing_count integer;
BEGIN
  -- 1. Lê a regra (custo + janela dedup + dry_run)
  SELECT credits_cost::integer,
         COALESCE((metadata->>'dedup_minutes')::integer, 0),
         COALESCE((metadata->>'dry_run')::boolean, false)
    INTO v_cost, v_dedup_minutes, v_dry_run
    FROM public.merchant_credit_usage_rules
   WHERE feature_code = 'marketplace_product_click'
     AND is_active = true
   LIMIT 1;

  IF v_cost IS NULL THEN
    RETURN jsonb_build_object('charged', false, 'reason', 'rule_not_found');
  END IF;

  -- 2. Resolve o dono da loja (skip se for o próprio dono clicando)
  SELECT user_id INTO v_owner_id
    FROM public.merchant_stores
   WHERE id = p_store_id;

  IF v_owner_id IS NULL THEN
    RETURN jsonb_build_object('charged', false, 'reason', 'store_not_found');
  END IF;

  IF v_visitor_id IS NOT NULL AND v_visitor_id = v_owner_id THEN
    INSERT INTO public.marketplace_product_click_events
      (store_id, product_id, visitor_user_id, anon_id, city, neighborhood, source, status, credits_charged)
    VALUES
      (p_store_id, p_product_id, v_visitor_id, p_anon_id, p_city, p_neighborhood, p_source, 'owner_skip', 0);
    RETURN jsonb_build_object('charged', false, 'reason', 'owner_self_view');
  END IF;

  -- 3. Dedup por janela (se > 0)
  IF v_dedup_minutes > 0 THEN
    SELECT COUNT(*) INTO v_existing_count
      FROM public.marketplace_product_click_events
     WHERE store_id = p_store_id
       AND status = 'charged'
       AND created_at > now() - make_interval(mins => v_dedup_minutes)
       AND (
            (v_visitor_id IS NOT NULL AND visitor_user_id = v_visitor_id)
         OR (v_visitor_id IS NULL AND p_anon_id IS NOT NULL AND anon_id = p_anon_id)
       );

    IF v_existing_count > 0 THEN
      INSERT INTO public.marketplace_product_click_events
        (store_id, product_id, visitor_user_id, anon_id, city, neighborhood, source, status, credits_charged)
      VALUES
        (p_store_id, p_product_id, v_visitor_id, p_anon_id, p_city, p_neighborhood, p_source, 'deduped', 0);
      RETURN jsonb_build_object('charged', false, 'reason', 'deduped');
    END IF;
  END IF;

  -- 3.5. Modo dry-run (desenvolvimento): registra evento sem tocar em saldo/ledger
  IF v_dry_run THEN
    INSERT INTO public.marketplace_product_click_events
      (store_id, product_id, visitor_user_id, anon_id, city, neighborhood, source, status, credits_charged, metadata)
    VALUES
      (p_store_id, p_product_id, v_visitor_id, p_anon_id, p_city, p_neighborhood, p_source, 'dry_run', 0,
       jsonb_build_object('would_charge', v_cost))
    RETURNING id INTO v_event_id;

    RETURN jsonb_build_object(
      'charged', false,
      'reason', 'dry_run',
      'would_charge', v_cost,
      'event_id', v_event_id
    );
  END IF;

  -- 4. Lê saldo com lock pessimista
  SELECT available_credits, COALESCE(consumed_credits, 0)
    INTO v_balance, v_consumed
    FROM public.merchant_credit_balances
   WHERE store_id = p_store_id
   FOR UPDATE;

  IF v_balance IS NULL OR v_balance < v_cost THEN
    INSERT INTO public.marketplace_product_click_events
      (store_id, product_id, visitor_user_id, anon_id, city, neighborhood, source, status, credits_charged, metadata)
    VALUES
      (p_store_id, p_product_id, v_visitor_id, p_anon_id, p_city, p_neighborhood, p_source, 'insufficient_balance', 0,
       jsonb_build_object('available', COALESCE(v_balance, 0), 'required', v_cost));
    RETURN jsonb_build_object('charged', false, 'reason', 'insufficient_balance', 'available', COALESCE(v_balance, 0), 'required', v_cost);
  END IF;

  -- 5. Débito atômico
  v_new_balance := v_balance - v_cost;

  UPDATE public.merchant_credit_balances
     SET available_credits = v_new_balance,
         consumed_credits  = v_consumed + v_cost,
         updated_at        = now()
   WHERE store_id = p_store_id;

  INSERT INTO public.merchant_credit_ledger
    (store_id, entry_type, amount, balance_before, balance_after, reason_code, description, metadata)
  VALUES
    (p_store_id, 'debit', v_cost, v_balance, v_new_balance,
     'marketplace_product_click',
     'Entrada na loja a partir de anúncio — ' || v_cost || ' créditos',
     jsonb_build_object(
       'product_id', p_product_id,
       'visitor_user_id', v_visitor_id,
       'anon_id', p_anon_id,
       'city', p_city,
       'neighborhood', p_neighborhood,
       'source', p_source
     ))
  RETURNING id INTO v_ledger_id;

  INSERT INTO public.marketplace_product_click_events
    (store_id, product_id, visitor_user_id, anon_id, city, neighborhood, source, status, credits_charged, ledger_entry_id)
  VALUES
    (p_store_id, p_product_id, v_visitor_id, p_anon_id, p_city, p_neighborhood, p_source, 'charged', v_cost, v_ledger_id)
  RETURNING id INTO v_event_id;

  RETURN jsonb_build_object(
    'charged', true,
    'credits_charged', v_cost,
    'balance_after', v_new_balance,
    'event_id', v_event_id,
    'ledger_entry_id', v_ledger_id
  );
END;
$$;

-- A RPC pode ser chamada por qualquer um (visitante anônimo inclusive) — a segurança fica
-- na própria função, que valida o dono e debita só o lojista certo.
GRANT EXECUTE ON FUNCTION public.consume_marketplace_product_click(uuid, uuid, text, text, text, text)
  TO anon, authenticated;

-- ═══════════════════════════════════════════════════════════════
-- CHAVES DE OPERAÇÃO (rodar manualmente no Supabase quando quiser)
-- ═══════════════════════════════════════════════════════════════
-- Default: débito real ATIVO (dry_run = false, dedup_minutes = 0).
--
-- Ativar janela de dedup de 30 min por visitante+loja (produção):
--   UPDATE public.merchant_credit_usage_rules
--      SET metadata = jsonb_set(metadata, '{dedup_minutes}', '30'::jsonb)
--    WHERE feature_code = 'marketplace_product_click';
--
-- (Raro) Pausar débito temporariamente sem mexer em código:
--   UPDATE public.merchant_credit_usage_rules
--      SET metadata = jsonb_set(metadata, '{dry_run}', 'true'::jsonb)
--    WHERE feature_code = 'marketplace_product_click';
-- ═══════════════════════════════════════════════════════════════
