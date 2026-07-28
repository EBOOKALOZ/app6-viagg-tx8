-- ============================================================================
-- ORION CERTIFICATION — LEILÕES ENTERPRISE · PARTE 3/3 · PÓS-VENDA + ADMIN + COMISSÃO
-- 2026-07-23 · SQL Editor · aplicar APÓS Partes 1 e 2.
-- ----------------------------------------------------------------------------
-- CORRIGE:
--   [P0-4] Pós-arrematação quebrado: arremate_init NUNCA era chamado no
--          encerramento → arremate_status ficava NULL → todas as ações do
--          painel de arremates falhavam. Aqui um TRIGGER em
--          orion_auction_settlements chama arremate_init ao gravar vencedor.
--   [P1]   Comissão dessincronizada (6% × 9%): consolida numa fonte única.
--   [P1]   State machine oficial (draft→...→ended) e transições seguras.
--   ADMIN: RPCs de gestão transacional (encerrar/cancelar/bloquear/aprovar/
--          restaurar/soft-delete leilão; cancelar/invalidar lance; métricas).
--   BUY-NOW real: compra imediata que encerra e define o vencedor.
--
-- Idempotente. ROLLBACK ao final.
-- ============================================================================

-- ── 1) [P0-4] Trigger: ao definir vencedor no settlement, inicia o pós-venda ─
-- arremate_init exige settlement com winner_user_id não-nulo (fase_c:64). Este
-- trigger fecha o elo: sempre que um settlement passa a ter vencedor e ainda
-- não tem arremate_status, inicia o fluxo de arremate automaticamente.
CREATE OR REPLACE FUNCTION public.tg_auction_settlement_start_arremate()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.winner_user_id IS NOT NULL
     AND COALESCE(NEW.status,'') <> 'no_winner'
     AND NEW.arremate_status IS NULL THEN
    BEGIN
      PERFORM public.arremate_init(NEW.listing_id);
    EXCEPTION WHEN others THEN
      -- não bloqueia o settlement se o init falhar; registra para diagnóstico
      PERFORM public.auction_log(NEW.listing_id, 'arremate_init_error', 'trigger', jsonb_build_object('erro', SQLERRM));
    END;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_settlement_start_arremate ON public.orion_auction_settlements;
CREATE TRIGGER trg_settlement_start_arremate
  AFTER INSERT OR UPDATE OF winner_user_id ON public.orion_auction_settlements
  FOR EACH ROW EXECUTE FUNCTION public.tg_auction_settlement_start_arremate();

-- Backfill: settlements já encerrados COM vencedor mas SEM arremate_status.
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT listing_id FROM public.orion_auction_settlements
           WHERE winner_user_id IS NOT NULL AND COALESCE(status,'') <> 'no_winner'
             AND arremate_status IS NULL LOOP
    BEGIN PERFORM public.arremate_init(r.listing_id);
    EXCEPTION WHEN others THEN NULL; END;
  END LOOP;
END $$;

-- ── 2) [P1] COMISSÃO — fonte única oficial ──────────────────────────────────
-- Consolida em orion_auction_settlement_config (lido pelo settle) a taxa
-- canônica de orion_commission_policy quando existir. Evita divergência 6%/9%.
DO $$
DECLARE v_pct numeric; v_raw numeric;
BEGIN
  -- orion_commission_policy (fonte declarada) usa colunas (context, percent).
  -- percent pode estar como fração (0.09) ou como % (9) — normaliza para fração.
  IF EXISTS (SELECT 1 FROM information_schema.tables
             WHERE table_schema='public' AND table_name='orion_commission_policy') THEN
    SELECT percent INTO v_raw FROM public.orion_commission_policy
      WHERE context = 'auction' AND active = true
      ORDER BY updated_at DESC NULLS LAST LIMIT 1;
    IF v_raw IS NOT NULL THEN
      v_pct := CASE WHEN v_raw > 1 THEN v_raw / 100.0 ELSE v_raw END;
    END IF;
  END IF;
  IF v_pct IS NULL THEN v_pct := 0.09; END IF;  -- padrão consolidado 9%
  UPDATE public.orion_auction_settlement_config SET commission_pct = v_pct, updated_at = now() WHERE id = 1;
  IF EXISTS (SELECT 1 FROM information_schema.tables
             WHERE table_schema='public' AND table_name='auction_financial_rules') THEN
    UPDATE public.auction_financial_rules SET commission_percent = v_pct * 100
      WHERE scope = 'auction';
  END IF;
END $$;

-- View de leitura da comissão canônica (para admin/UI — 1 fonte)
CREATE OR REPLACE VIEW public.auction_commission_effective AS
  SELECT 1 AS id,
    (SELECT commission_pct FROM public.orion_auction_settlement_config WHERE id = 1) AS commission_pct,
    (SELECT auto_charge     FROM public.orion_auction_settlement_config WHERE id = 1) AS auto_charge;
GRANT SELECT ON public.auction_commission_effective TO authenticated, service_role;

-- ── 3) STATE MACHINE oficial + BUY-NOW real ─────────────────────────────────
-- Transições válidas: draft→active (publicar), active→paused (pausa real),
-- paused→active (republicar), active→ended (encerrar/buy-now), *→cancelled.
CREATE OR REPLACE FUNCTION public.auction_set_status(p_listing_id uuid, p_new_status text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_l public.auction_listings%ROWTYPE; v_uid uuid := auth.uid(); v_ok boolean := false;
BEGIN
  SELECT * INTO v_l FROM public.auction_listings WHERE id = p_listing_id FOR UPDATE;
  IF v_l.id IS NULL THEN RETURN jsonb_build_object('success', false, 'error', 'not_found'); END IF;
  IF v_l.owner_user_id <> v_uid AND NOT public.mp_is_admin() THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_owner'); END IF;

  v_ok := CASE
    WHEN p_new_status = 'active'    AND v_l.status IN ('draft','paused') THEN true
    WHEN p_new_status = 'paused'    AND v_l.status = 'active' THEN true
    WHEN p_new_status = 'cancelled' AND v_l.status IN ('draft','active','paused') THEN true
    WHEN p_new_status = 'draft'     AND v_l.status = 'draft' THEN true
    ELSE false END;
  IF NOT v_ok THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid_transition',
      'from', v_l.status, 'to', p_new_status); END IF;

  UPDATE public.auction_listings SET status = p_new_status, updated_at = now() WHERE id = p_listing_id;
  PERFORM public.auction_log(p_listing_id, 'status_change', coalesce(v_uid::text,'system'),
    jsonb_build_object('from', v_l.status, 'to', p_new_status));
  RETURN jsonb_build_object('success', true, 'status', p_new_status);
END $$;

-- BUY-NOW: encerra na hora, registra o comprador como vencedor e liquida.
CREATE OR REPLACE FUNCTION public.auction_buy_now(p_listing_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_l public.auction_listings%ROWTYPE; v_uid uuid := auth.uid(); v_settle jsonb;
BEGIN
  IF v_uid IS NULL THEN RETURN jsonb_build_object('success', false, 'error', 'not_authenticated'); END IF;
  SELECT * INTO v_l FROM public.auction_listings WHERE id = p_listing_id FOR UPDATE;
  IF v_l.id IS NULL THEN RETURN jsonb_build_object('success', false, 'error', 'not_found'); END IF;
  IF v_l.buy_now_price IS NULL OR v_l.buy_now_price <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'buy_now_indisponivel'); END IF;
  IF v_l.status <> 'active' THEN RETURN jsonb_build_object('success', false, 'error', 'nao_ativo'); END IF;
  IF v_uid = v_l.owner_user_id THEN RETURN jsonb_build_object('success', false, 'error', 'self_purchase'); END IF;

  -- registra o lance de compra imediata (vencedor)
  UPDATE public.auction_bids SET is_winning = false WHERE listing_id = p_listing_id AND is_winning = true;
  INSERT INTO public.auction_bids (listing_id, user_id, amount_cents, is_winning, source)
  VALUES (p_listing_id, v_uid, (v_l.buy_now_price*100)::int, true, 'rpc');
  -- encerra imediatamente com vencedor definido
  UPDATE public.auction_listings
    SET status = 'ended', winner_user_id = v_uid, current_bid = v_l.buy_now_price,
        ends_at = now(), updated_at = now()
  WHERE id = p_listing_id;
  PERFORM public.auction_log(p_listing_id, 'buy_now', v_uid::text, jsonb_build_object('price', v_l.buy_now_price));

  -- liquida (settle cria o settlement → trigger inicia o arremate/pós-venda)
  BEGIN v_settle := public.orion_auction_settle(p_listing_id);
  EXCEPTION WHEN others THEN v_settle := jsonb_build_object('settle_deferred', true); END;

  RETURN jsonb_build_object('success', true, 'winner', v_uid, 'price', v_l.buy_now_price, 'settle', v_settle);
END $$;

-- ── 4) ADMIN — gestão transacional (has_role admin) ─────────────────────────
-- Encerrar / cancelar / bloquear / aprovar / reprovar / arquivar / restaurar.
CREATE OR REPLACE FUNCTION public.admin_auction_action(p_listing_id uuid, p_action text, p_note text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_uid uuid := auth.uid(); v_l public.auction_listings%ROWTYPE; v_r jsonb;
BEGIN
  IF v_uid IS NULL OR NOT public.mp_is_admin() THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_admin'); END IF;
  SELECT * INTO v_l FROM public.auction_listings WHERE id = p_listing_id FOR UPDATE;
  IF v_l.id IS NULL THEN RETURN jsonb_build_object('success', false, 'error', 'not_found'); END IF;

  CASE p_action
    WHEN 'end'      THEN v_r := public.end_auction_listing(p_listing_id);
    WHEN 'cancel'   THEN UPDATE public.auction_listings SET status='cancelled', admin_note=p_note, updated_at=now() WHERE id=p_listing_id;
    WHEN 'block'    THEN UPDATE public.auction_listings SET moderation_status='blocked', admin_note=p_note, updated_at=now() WHERE id=p_listing_id;
    WHEN 'approve'  THEN UPDATE public.auction_listings SET moderation_status='approved', admin_note=p_note, updated_at=now() WHERE id=p_listing_id;
    WHEN 'reject'   THEN UPDATE public.auction_listings SET moderation_status='rejected', status='cancelled', admin_note=p_note, updated_at=now() WHERE id=p_listing_id;
    WHEN 'archive'  THEN UPDATE public.auction_listings SET deleted_at=now(), admin_note=p_note, updated_at=now() WHERE id=p_listing_id;
    WHEN 'restore'  THEN UPDATE public.auction_listings SET deleted_at=NULL, admin_note=p_note, updated_at=now() WHERE id=p_listing_id;
    ELSE RETURN jsonb_build_object('success', false, 'error', 'invalid_action');
  END CASE;

  PERFORM public.auction_log(p_listing_id, 'admin_'||p_action, v_uid::text, jsonb_build_object('note', p_note));
  RETURN jsonb_build_object('success', true, 'action', p_action, 'result', v_r);
END $$;

-- Admin: invalidar/cancelar um lance específico (fraude/erro).
CREATE OR REPLACE FUNCTION public.admin_invalidate_bid(p_bid_id uuid, p_note text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_uid uuid := auth.uid(); v_bid record; v_top record;
BEGIN
  IF v_uid IS NULL OR NOT public.mp_is_admin() THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_admin'); END IF;
  SELECT * INTO v_bid FROM public.auction_bids WHERE id = p_bid_id;
  IF v_bid.id IS NULL THEN RETURN jsonb_build_object('success', false, 'error', 'not_found'); END IF;

  UPDATE public.auction_bids SET is_valid = false, is_winning = false WHERE id = p_bid_id;
  -- recomputa o líder atual entre os lances válidos
  SELECT * INTO v_top FROM public.auction_bids
    WHERE listing_id = v_bid.listing_id AND is_valid = true
    ORDER BY amount_cents DESC, created_at ASC LIMIT 1;
  IF v_top.id IS NOT NULL THEN
    UPDATE public.auction_bids SET is_winning = (id = v_top.id) WHERE listing_id = v_bid.listing_id;
    UPDATE public.auction_listings SET current_bid = v_top.amount_cents/100.0, updated_at = now()
      WHERE id = v_bid.listing_id;
  END IF;
  PERFORM public.auction_log(v_bid.listing_id, 'admin_invalidate_bid', v_uid::text, jsonb_build_object('bid_id', p_bid_id, 'note', p_note));
  RETURN jsonb_build_object('success', true);
END $$;

-- Admin: métricas de gestão (contadores + fila de moderação/fraude).
CREATE OR REPLACE FUNCTION public.admin_auction_overview()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.mp_is_admin() AND session_user <> 'postgres'
     AND coalesce(auth.role(),'') <> 'service_role' THEN
    RAISE EXCEPTION 'Apenas administradores'; END IF;
  RETURN jsonb_build_object(
    'ativos',     (SELECT count(*) FROM auction_listings WHERE status='active' AND deleted_at IS NULL),
    'pausados',   (SELECT count(*) FROM auction_listings WHERE status='paused'),
    'encerrados', (SELECT count(*) FROM auction_listings WHERE status='ended'),
    'cancelados', (SELECT count(*) FROM auction_listings WHERE status='cancelled'),
    'bloqueados', (SELECT count(*) FROM auction_listings WHERE moderation_status='blocked'),
    'arquivados', (SELECT count(*) FROM auction_listings WHERE deleted_at IS NOT NULL),
    'total_lances', (SELECT count(*) FROM auction_bids),
    'lances_invalidos', (SELECT count(*) FROM auction_bids WHERE is_valid = false),
    'comissao_pct', (SELECT commission_pct FROM orion_auction_settlement_config WHERE id=1),
    'recentes', coalesce((SELECT jsonb_agg(x) FROM (
        SELECT id, title, status, moderation_status, current_bid, total_bids, ends_at, owner_user_id
        FROM auction_listings WHERE deleted_at IS NULL ORDER BY created_at DESC LIMIT 50) x), '[]'::jsonb)
  );
END $$;

-- ── 5) Permissões ───────────────────────────────────────────────────────────
REVOKE ALL ON FUNCTION public.auction_set_status(uuid, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.auction_set_status(uuid, text) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.auction_buy_now(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.auction_buy_now(uuid) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.admin_auction_action(uuid, text, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.admin_auction_action(uuid, text, text) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.admin_invalidate_bid(uuid, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.admin_invalidate_bid(uuid, text) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.admin_auction_overview() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.admin_auction_overview() TO authenticated, service_role;

-- ── 6) VERIFICAÇÃO ──────────────────────────────────────────────────────────
SELECT
  (SELECT count(*) FROM pg_trigger WHERE tgname = 'trg_settlement_start_arremate') AS trigger_pos_venda_deve_ser_1,
  (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
     WHERE n.nspname='public' AND p.proname IN
       ('auction_set_status','auction_buy_now','admin_auction_action',
        'admin_invalidate_bid','admin_auction_overview')) AS rpcs_novas,
  (SELECT commission_pct FROM orion_auction_settlement_config WHERE id=1) AS comissao_unica;

-- ============================================================================
-- ROLLBACK (teste):
--   DROP TRIGGER IF EXISTS trg_settlement_start_arremate ON public.orion_auction_settlements;
--   DROP FUNCTION IF EXISTS public.tg_auction_settlement_start_arremate();
--   DROP FUNCTION IF EXISTS public.auction_set_status(uuid,text), public.auction_buy_now(uuid),
--     public.admin_auction_action(uuid,text,text), public.admin_invalidate_bid(uuid,text),
--     public.admin_auction_overview();
--   DROP VIEW IF EXISTS public.auction_commission_effective;
-- ============================================================================
