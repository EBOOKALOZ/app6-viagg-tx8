-- ============================================================================
-- LEILÕES — PÓS-VENDA AUTOMÁTICO + COMISSÃO CANÔNICA + RPCs ADMIN (v2)
-- Reedição aplicável de 20260723_auction_enterprise_postsale_admin_oficial.sql,
-- adaptada ao schema VIVO de produção (2026-07-27):
--   • auction_financial_rules usa coluna `module` (valor 'auction') — o
--     original referenciava `scope`, que não existe (causa do erro 42703).
--   • Demais dependências verificadas: orion_auction_settlements(arremate_status,
--     listing_id, winner_user_id, status), arremate_init(uuid), auction_log(4),
--     mp_is_admin(), end_auction_listing(uuid), orion_auction_settlement_config.
-- Idempotente. Sem statements destrutivos.
-- ============================================================================

-- ── 1) [P0] Trigger: settlement com vencedor → inicia pós-venda (arremate) ──
CREATE OR REPLACE FUNCTION public.tg_auction_settlement_start_arremate()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.winner_user_id IS NOT NULL
     AND COALESCE(NEW.status,'') <> 'no_winner'
     AND NEW.arremate_status IS NULL THEN
    BEGIN
      PERFORM public.arremate_init(NEW.listing_id);
    EXCEPTION WHEN others THEN
      PERFORM public.auction_log(NEW.listing_id, 'arremate_init_error', 'trigger', jsonb_build_object('erro', SQLERRM));
    END;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_settlement_start_arremate ON public.orion_auction_settlements;
CREATE TRIGGER trg_settlement_start_arremate
  AFTER INSERT OR UPDATE OF winner_user_id ON public.orion_auction_settlements
  FOR EACH ROW EXECUTE FUNCTION public.tg_auction_settlement_start_arremate();

-- Backfill: settlements com vencedor e sem pós-venda iniciado.
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
DO $$
DECLARE v_pct numeric; v_raw numeric;
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables
             WHERE table_schema='public' AND table_name='orion_commission_policy') THEN
    SELECT percent INTO v_raw FROM public.orion_commission_policy
      WHERE context = 'auction' AND active = true
      ORDER BY updated_at DESC NULLS LAST LIMIT 1;
    IF v_raw IS NOT NULL THEN
      v_pct := CASE WHEN v_raw > 1 THEN v_raw / 100.0 ELSE v_raw END;
    END IF;
  END IF;
  IF v_pct IS NULL THEN v_pct := 0.09; END IF;
  UPDATE public.orion_auction_settlement_config SET commission_pct = v_pct, updated_at = now() WHERE id = 1;
  -- schema vivo: auction_financial_rules usa `module` ('auction'), não `scope`
  UPDATE public.auction_financial_rules SET commission_percent = v_pct * 100
    WHERE module = 'auction' AND active = true;
END $$;

CREATE OR REPLACE VIEW public.auction_commission_effective AS
  SELECT 1 AS id,
    (SELECT commission_pct FROM public.orion_auction_settlement_config WHERE id = 1) AS commission_pct,
    (SELECT auto_charge     FROM public.orion_auction_settlement_config WHERE id = 1) AS auto_charge;
GRANT SELECT ON public.auction_commission_effective TO authenticated, service_role;

-- ── 3) ADMIN — gestão transacional ──────────────────────────────────────────
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

CREATE OR REPLACE FUNCTION public.admin_invalidate_bid(p_bid_id uuid, p_note text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_uid uuid := auth.uid(); v_bid record; v_top record;
BEGIN
  IF v_uid IS NULL OR NOT public.mp_is_admin() THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_admin'); END IF;
  SELECT * INTO v_bid FROM public.auction_bids WHERE id = p_bid_id;
  IF v_bid.id IS NULL THEN RETURN jsonb_build_object('success', false, 'error', 'not_found'); END IF;

  UPDATE public.auction_bids SET is_valid = false, is_winning = false WHERE id = p_bid_id;
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

-- ── 4) Permissões ────────────────────────────────────────────────────────────
REVOKE ALL ON FUNCTION public.admin_auction_action(uuid, text, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.admin_auction_action(uuid, text, text) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.admin_invalidate_bid(uuid, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.admin_invalidate_bid(uuid, text) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.admin_auction_overview() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.admin_auction_overview() TO authenticated, service_role;
