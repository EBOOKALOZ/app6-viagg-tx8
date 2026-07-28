-- ============================================================================
-- SHC v2.0 — MIGRAÇÃO DOS FLUXOS ANÔNIMOS CLIENT-SIDE PARA RPC (fase Nova Base)
--
-- Critério do motor shc_run_module_audit (endurecido em 2026-07-27): grant de
-- escrita de anon em tabela = P0, sem exceção. Arquitetura-alvo da plataforma:
-- escrita anônima SOMENTE via RPC SECURITY DEFINER com guarda (padrão
-- charge_*_click / submit_marketplace_order).
--
-- Fluxos migrados (eram INSERT/DELETE diretos de client em páginas públicas):
--   1. DiscountRequestModal  → submit_discount_request()
--   2. trackM1Event          → track_m1_event()
--   3. trackProductEvent     → track_product_interest()  (o INSERT antigo já
--      estava QUEBRADO: enviava colunas inexistentes store_id/user_id/
--      session_id/metadata e falhava silenciosamente)
--   4. StoreHeader follow    → toggle_store_follow()
--
-- Cesta e checkout NÃO precisam de migração: já usam RPCs (p_session_token).
-- Idempotente.
-- ============================================================================

-- 1) submit_discount_request ------------------------------------------------
CREATE OR REPLACE FUNCTION public.submit_discount_request(
  p_product_id uuid,
  p_store_id uuid,
  p_customer_name text,
  p_customer_phone text,
  p_requested_price numeric,
  p_customer_email text DEFAULT NULL,
  p_product_price text DEFAULT NULL,
  p_message text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_recent int;
BEGIN
  -- guard: payload obrigatório
  IF p_product_id IS NULL OR p_store_id IS NULL
     OR btrim(coalesce(p_customer_name,'')) = ''
     OR btrim(coalesce(p_customer_phone,'')) = ''
     OR p_requested_price IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'campos_obrigatorios');
  END IF;
  -- guard: rate-limit server-side (espelha o client: 10 min) p/ anônimo
  IF auth.uid() IS NULL THEN
    SELECT count(*) INTO v_recent FROM public.discount_requests
     WHERE customer_phone = btrim(p_customer_phone)
       AND created_at > now() - interval '10 minutes';
    IF v_recent >= 3 THEN
      RETURN jsonb_build_object('ok', false, 'error', 'rate_limited');
    END IF;
  END IF;
  INSERT INTO public.discount_requests
    (product_id, store_id, product_price, customer_name, customer_phone,
     customer_email, requested_price, message, status)
  VALUES
    (p_product_id, p_store_id,
     NULLIF(btrim(coalesce(p_product_price,'')), ''),
     btrim(p_customer_name), btrim(p_customer_phone),
     NULLIF(btrim(coalesce(p_customer_email,'')), ''),
     p_requested_price,
     coalesce(NULLIF(btrim(coalesce(p_message,'')), ''),
              'Tenho interesse neste produto. A loja aceita este valor?'),
     'pending');
  RETURN jsonb_build_object('ok', true);
END $$;
REVOKE ALL ON FUNCTION public.submit_discount_request(uuid,uuid,text,text,numeric,text,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.submit_discount_request(uuid,uuid,text,text,numeric,text,text,text) TO anon, authenticated, service_role;

-- 2) track_m1_event -----------------------------------------------------------
CREATE OR REPLACE FUNCTION public.track_m1_event(
  p_merchant_store_id uuid,
  p_event_type text,
  p_session_id text,
  p_product_id uuid DEFAULT NULL,
  p_source_type text DEFAULT NULL,
  p_source_id text DEFAULT NULL,
  p_campaign_id text DEFAULT NULL,
  p_city text DEFAULT NULL,
  p_region text DEFAULT NULL,
  p_bairro text DEFAULT NULL,
  p_sale_value_cents bigint DEFAULT 0,
  p_metadata jsonb DEFAULT '{}'::jsonb
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_uid uuid := auth.uid(); v_flood int;
BEGIN
  -- guard: payload obrigatório
  IF p_merchant_store_id IS NULL OR btrim(coalesce(p_event_type,'')) = ''
     OR btrim(coalesce(p_session_id,'')) = '' THEN
    RETURN;
  END IF;
  -- guard: anti-flood por sessão (60 eventos/min)
  SELECT count(*) INTO v_flood FROM public.m1_billing_events
   WHERE session_id = p_session_id AND created_at > now() - interval '1 minute';
  IF v_flood >= 60 THEN RETURN; END IF;
  BEGIN
    INSERT INTO public.m1_billing_events
      (merchant_store_id, product_id, event_type, source_type, source_id,
       campaign_id, city, region, bairro, session_id, visitor_user_id,
       sale_value_cents, metadata)
    VALUES
      (p_merchant_store_id, p_product_id, p_event_type, p_source_type,
       p_source_id, NULLIF(btrim(coalesce(p_campaign_id,'')),''),
       p_city, p_region, p_bairro, p_session_id, v_uid,
       coalesce(p_sale_value_cents,0), coalesce(p_metadata,'{}'::jsonb));
  EXCEPTION WHEN invalid_text_representation THEN
    -- campaign_id de URL pode não ser cast-avel p/ o tipo da coluna
    INSERT INTO public.m1_billing_events
      (merchant_store_id, product_id, event_type, source_type, source_id,
       city, region, bairro, session_id, visitor_user_id,
       sale_value_cents, metadata)
    VALUES
      (p_merchant_store_id, p_product_id, p_event_type, p_source_type,
       p_source_id, p_city, p_region, p_bairro, p_session_id, v_uid,
       coalesce(p_sale_value_cents,0), coalesce(p_metadata,'{}'::jsonb));
  END;
END $$;
REVOKE ALL ON FUNCTION public.track_m1_event(uuid,text,text,uuid,text,text,text,text,text,text,bigint,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.track_m1_event(uuid,text,text,uuid,text,text,text,text,text,text,bigint,jsonb) TO anon, authenticated, service_role;

-- 3) track_product_interest ---------------------------------------------------
CREATE OR REPLACE FUNCTION public.track_product_interest(
  p_product_id uuid,
  p_event_type text,
  p_city text DEFAULT NULL,
  p_neighborhood text DEFAULT NULL,
  p_source text DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_uid uuid := auth.uid(); v_flood int;
BEGIN
  -- guard: payload obrigatório
  IF p_product_id IS NULL OR btrim(coalesce(p_event_type,'')) = '' THEN
    RETURN;
  END IF;
  -- guard: anti-flood por produto (120 eventos/min)
  SELECT count(*) INTO v_flood FROM public.product_interest_events
   WHERE product_id = p_product_id AND created_at > now() - interval '1 minute';
  IF v_flood >= 120 THEN RETURN; END IF;
  INSERT INTO public.product_interest_events
    (product_id, city, neighborhood, event_type, source)
  VALUES
    (p_product_id,
     coalesce(NULLIF(btrim(coalesce(p_city,'')),''), 'desconhecida'),
     coalesce(NULLIF(btrim(coalesce(p_neighborhood,'')),''), 'desconhecido'),
     p_event_type, coalesce(NULLIF(btrim(coalesce(p_source,'')),''), 'landing'));
END $$;
REVOKE ALL ON FUNCTION public.track_product_interest(uuid,text,text,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.track_product_interest(uuid,text,text,text,text) TO anon, authenticated, service_role;

-- 4) toggle_store_follow -------------------------------------------------------
CREATE OR REPLACE FUNCTION public.toggle_store_follow(
  p_store_key text,
  p_visitor_anon_id text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_uid uuid := auth.uid(); v_deleted int; v_count int;
BEGIN
  -- guard: identidade obrigatória (usuário logado OU visitor_anon_id)
  IF btrim(coalesce(p_store_key,'')) = '' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'store_key_obrigatorio');
  END IF;
  IF v_uid IS NULL AND btrim(coalesce(p_visitor_anon_id,'')) = '' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'sem_identidade');
  END IF;

  IF v_uid IS NOT NULL THEN
    DELETE FROM public.store_followers
     WHERE store_key = p_store_key AND user_id = v_uid;
  ELSE
    DELETE FROM public.store_followers
     WHERE store_key = p_store_key AND visitor_anon_id = p_visitor_anon_id;
  END IF;
  GET DIAGNOSTICS v_deleted = ROW_COUNT;

  IF v_deleted = 0 THEN
    INSERT INTO public.store_followers (store_key, user_id, visitor_anon_id)
    VALUES (p_store_key,
            v_uid,
            CASE WHEN v_uid IS NULL THEN p_visitor_anon_id ELSE NULL END);
  END IF;

  SELECT count(*) INTO v_count FROM public.store_followers WHERE store_key = p_store_key;
  RETURN jsonb_build_object('ok', true, 'following', v_deleted = 0, 'followers', v_count);
END $$;
REVOKE ALL ON FUNCTION public.toggle_store_follow(text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.toggle_store_follow(text,text) TO anon, authenticated, service_role;

-- 5) Revogação final: com os fluxos em RPC, anon não precisa de NENHUM grant
--    de escrita nas tabelas guest (critério do motor: grants_escrita_anon=0)
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON public.store_carts, public.store_cart_items, public.store_followers,
     public.purchase_intentions, public.purchase_intention_items,
     public.product_interest_events, public.discount_requests,
     public.m1_billing_events
  FROM anon;
