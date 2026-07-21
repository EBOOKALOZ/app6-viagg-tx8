-- ============================================================
-- ORION-ARREMATES FASE D v1.0 — Logística / Entrega · 2026-07-19
-- Modelo P2P preservado: a plataforma NÃO intermedia o pagamento do PRODUTO.
-- A ENTREGA tem 2 modos:
--   • 'retirada'  → sem logística (comprador retira; fluxo FASE C basta).
--   • 'delivery'  → o COMPRADOR solicita um frete (corrida) e PAGA à parte,
--                   reusando o fluxo pré-pago PROVADO (create_customer_delivery_order:
--                   debita customer_wallet do comprador → escrow da corrida → motoboy).
--                   O frete é serviço da plataforma (rides), separado do produto.
-- A FASE A/C é preservada: usa arremate_transition() (estados já existentes:
--   pagamento_confirmado_vendedor→preparando_entrega→entregue→recebido). Nada novo
--   na máquina de estados; apenas vínculo com a corrida + trigger de conclusão.
-- Idempotente. SQL Editor / Management API (broifhfqmnzqoongtokm).
-- ============================================================

-- ─────────────────────────────────────────────────────────────
-- SEÇÃO 1 · Vínculo do arremate com a entrega (aditivo)
-- ─────────────────────────────────────────────────────────────
ALTER TABLE public.orion_auction_settlements
  ADD COLUMN IF NOT EXISTS fulfillment text
    CHECK (fulfillment IS NULL OR fulfillment IN ('retirada','delivery')),
  ADD COLUMN IF NOT EXISTS delivery_order_id uuid;
CREATE INDEX IF NOT EXISTS idx_settle_delivery_order ON public.orion_auction_settlements(delivery_order_id);

-- ─────────────────────────────────────────────────────────────
-- SEÇÃO 2 · Definir o modo de entrega (comprador ou vendedor)
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.arremate_definir_fulfillment(p_listing_id uuid, p_modo text)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE v_party text;
BEGIN
  IF p_modo NOT IN ('retirada','delivery') THEN RAISE EXCEPTION 'ARREMATE: modo inválido (retirada|delivery)'; END IF;
  v_party := public._arremate_party(p_listing_id);
  IF v_party NOT IN ('buyer','seller','admin') THEN RAISE EXCEPTION 'ARREMATE: acesso negado'; END IF;
  UPDATE orion_auction_settlements SET fulfillment = p_modo, updated_at = now() WHERE listing_id = p_listing_id;
  PERFORM public._arremate_audit(p_listing_id, 'arremate.fulfillment_definido', v_party, jsonb_build_object('modo', p_modo));
  RETURN jsonb_build_object('ok', true, 'fulfillment', p_modo);
END $$;

-- ─────────────────────────────────────────────────────────────
-- SEÇÃO 3 · Comprador solicita a ENTREGA (frete pago pelo comprador via fluxo provado)
-- ─────────────────────────────────────────────────────────────
-- Cria a corrida de entrega (create_customer_delivery_order roda como o comprador —
-- auth.uid preservado → debita a customer_wallet DELE), vincula ao arremate, carimba
-- o vínculo na corrida (metadata) e transita o arremate → preparando_entrega.
CREATE OR REPLACE FUNCTION public.arremate_solicitar_entrega(
  p_listing_id uuid,
  p_pickup_lat double precision, p_pickup_lng double precision, p_pickup_addr text,
  p_drop_lat double precision,  p_drop_lng double precision,  p_drop_addr text,
  p_distance_km numeric, p_frete_value numeric, p_notes text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE v_party text; v_est text; v_order uuid; v_seller uuid; v_buyer uuid;
BEGIN
  v_party := public._arremate_party(p_listing_id);
  IF v_party NOT IN ('buyer','admin') THEN RAISE EXCEPTION 'ARREMATE: só o comprador solicita a entrega'; END IF;
  SELECT arremate_status, seller_user_id, winner_user_id INTO v_est, v_seller, v_buyer
    FROM orion_auction_settlements WHERE listing_id = p_listing_id;
  IF v_est <> 'pagamento_confirmado_vendedor' THEN
    RAISE EXCEPTION 'ARREMATE: entrega só após o vendedor confirmar o pagamento (estado atual: %)', v_est;
  END IF;

  -- Frete: reusa o fluxo PROVADO (pré-pago; debita o comprador). NÃO toca no produto.
  v_order := public.create_customer_delivery_order(
    p_pickup_lat, p_pickup_lng, p_drop_lat, p_drop_lng,
    NULL, NULL, coalesce(p_notes,'Entrega de arremate'),
    coalesce(p_frete_value,0), p_distance_km, p_pickup_addr, p_drop_addr, 'delivery');

  -- Vincula a corrida ao arremate (dos dois lados) + carimba o vínculo na corrida.
  UPDATE orion_auction_settlements
     SET fulfillment = 'delivery', delivery_order_id = v_order, updated_at = now()
   WHERE listing_id = p_listing_id;
  UPDATE service_orders
     SET metadata = coalesce(metadata,'{}'::jsonb) || jsonb_build_object('arremate_listing_id', p_listing_id::text)
   WHERE id = v_order;

  PERFORM public.arremate_transition(p_listing_id, 'preparando_entrega', 'comprador solicitou a entrega (frete)', v_party);
  PERFORM public._arremate_audit(p_listing_id, 'arremate.entrega_solicitada', v_party,
          jsonb_build_object('delivery_order_id', v_order, 'frete', p_frete_value));
  INSERT INTO orion_eventos (tipo, origem, dados)
    VALUES ('entrega.solicitada','arremate_fase_d', jsonb_build_object('listing_id',p_listing_id,'delivery_order_id',v_order));
  PERFORM public._arremate_notify(p_listing_id, v_seller, 'arremate.entrega_solicitada', '{}'::jsonb);
  RETURN jsonb_build_object('ok', true, 'estado', 'preparando_entrega', 'delivery_order_id', v_order);
END $$;

-- ─────────────────────────────────────────────────────────────
-- SEÇÃO 4 · Trigger: corrida vinculada ENTREGUE → arremate avança p/ 'entregue'
-- ─────────────────────────────────────────────────────────────
-- Aditivo: NÃO altera o despacho existente. Só reage quando a corrida do arremate
-- chega a 'delivered'. O comprador ainda confirma 'recebido' (FASE C) para concluir.
CREATE OR REPLACE FUNCTION public.tg_arremate_on_delivery_delivered()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE v_listing uuid; v_buyer uuid;
BEGIN
  IF NEW.status::text = 'delivered' AND OLD.status::text IS DISTINCT FROM NEW.status::text THEN
    SELECT listing_id, winner_user_id INTO v_listing, v_buyer
      FROM orion_auction_settlements
     WHERE delivery_order_id = NEW.id AND arremate_status = 'preparando_entrega';
    IF v_listing IS NOT NULL THEN
      PERFORM public.arremate_transition(v_listing, 'entregue', 'entrega concluída pelo entregador', 'entregador');
      INSERT INTO orion_eventos (tipo, origem, dados)
        VALUES ('entrega.iniciada','arremate_fase_d', jsonb_build_object('listing_id',v_listing,'delivery_order_id',NEW.id));
      PERFORM public._arremate_notify(v_listing, v_buyer, 'arremate.produto_a_caminho_entregue', '{}'::jsonb);
    END IF;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS tg_arremate_on_delivery_delivered ON public.service_orders;
CREATE TRIGGER tg_arremate_on_delivery_delivered
  AFTER UPDATE OF status ON public.service_orders
  FOR EACH ROW EXECUTE FUNCTION public.tg_arremate_on_delivery_delivered();

-- ─────────────────────────────────────────────────────────────
-- SEÇÃO 5 · Menor privilégio
-- ─────────────────────────────────────────────────────────────
DO $$
DECLARE s text; v_fns text[] := ARRAY[
  'arremate_definir_fulfillment(uuid,text)',
  'arremate_solicitar_entrega(uuid,double precision,double precision,text,double precision,double precision,text,numeric,numeric,text)'];
BEGIN
  FOREACH s IN ARRAY v_fns LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION public.%s FROM PUBLIC, anon', s);
    EXECUTE format('GRANT EXECUTE ON FUNCTION public.%s TO authenticated, service_role', s);
  END LOOP;
  -- trigger-fn: só o trigger a invoca (sem grant a cliente)
  EXECUTE 'REVOKE EXECUTE ON FUNCTION public.tg_arremate_on_delivery_delivered() FROM PUBLIC, anon, authenticated';
  EXECUTE 'GRANT EXECUTE ON FUNCTION public.tg_arremate_on_delivery_delivered() TO service_role';
END $$;

-- ─────────────────────────────────────────────────────────────
-- VERIFICAÇÃO
-- ─────────────────────────────────────────────────────────────
SELECT
  (SELECT count(*) FROM information_schema.columns WHERE table_schema='public' AND table_name='orion_auction_settlements' AND column_name IN ('fulfillment','delivery_order_id')) AS colunas_ok,
  (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname IN ('arremate_definir_fulfillment','arremate_solicitar_entrega')) AS rpcs_ok,
  (SELECT count(*) FROM pg_trigger WHERE tgname='tg_arremate_on_delivery_delivered' AND NOT tgisinternal) AS trigger_ok,
  (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname IN ('arremate_definir_fulfillment','arremate_solicitar_entrega') AND has_function_privilege('anon',p.oid,'EXECUTE')) AS rpcs_anon_exec;
