-- ============================================================================
-- Correção P1 (auditoria 2026-07-28): auction_set_status permite cancelar
-- um leilão ativo com lances existentes sem qualquer checagem, aviso ou
-- confirmação explícita — dono podia cancelar um leilão só porque o preço
-- não agradou, sem consequência nem notificação aos licitantes.
--
-- Correção: cancelamento de leilão com total_bids > 0 exige o parâmetro
-- p_confirm_with_bids = true (a UI deve pedir confirmação explícita antes
-- de reenviar com esse parâmetro); e passa a registrar em auction_log/
-- auction_events quantos lances/licitantes foram afetados, para
-- notificação e auditoria.
-- ============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.auction_set_status(
  p_listing_id uuid,
  p_new_status text,
  p_confirm_with_bids boolean DEFAULT false
)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_l public.auction_listings%ROWTYPE; v_uid uuid := auth.uid(); v_ok boolean := false;
  v_total_bids int; v_unique_bidders int;
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

  IF p_new_status = 'cancelled' THEN
    SELECT count(*), count(DISTINCT user_id) INTO v_total_bids, v_unique_bidders
    FROM public.auction_bids WHERE listing_id = p_listing_id;

    IF v_total_bids > 0 AND NOT p_confirm_with_bids THEN
      RETURN jsonb_build_object('success', false, 'error', 'has_bids_requires_confirmation',
        'total_bids', v_total_bids, 'unique_bidders', v_unique_bidders);
    END IF;
  END IF;

  UPDATE public.auction_listings SET status = p_new_status, updated_at = now() WHERE id = p_listing_id;
  PERFORM public.auction_log(p_listing_id, 'status_change', coalesce(v_uid::text,'system'),
    jsonb_build_object('from', v_l.status, 'to', p_new_status,
      'total_bids_at_cancel', CASE WHEN p_new_status = 'cancelled' THEN v_total_bids ELSE NULL END,
      'unique_bidders_at_cancel', CASE WHEN p_new_status = 'cancelled' THEN v_unique_bidders ELSE NULL END));

  RETURN jsonb_build_object('success', true, 'status', p_new_status,
    'total_bids_affected', CASE WHEN p_new_status = 'cancelled' THEN v_total_bids ELSE NULL END);
END $function$;

COMMIT;

-- ROLLBACK (documentado, não executado): recriar auction_set_status com o
-- corpo anterior (sem p_confirm_with_bids), ver
-- 20260727012000_auction_frontend_rpcs_oficial.sql.
