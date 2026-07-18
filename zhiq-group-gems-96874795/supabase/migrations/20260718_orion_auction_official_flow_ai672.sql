-- ============================================================================
-- ORION-AI-67.2 — Fluxo Oficial de Arremate (decisão de arquitetura) · 2026-07-18
-- ============================================================================
-- DECISÃO OFICIAL: no LEILÃO, a comissão de 6% SUBSTITUI a cobrança fixa de 3cr.
-- SEM dupla cobrança. Fluxo: criar=grátis; sem vencedor=sem cobrança;
-- com vencedor = cobrar SÓ 6% sobre o valor final (via auction_financial_rules)
-- → debitar créditos → liberar contato.
--
-- 1) orion_auction_close: REMOVE toda cobrança (fixo + engajamento) do leilão;
--    mantém vencedor/relatório/auditoria. (Marketplace/outros módulos intactos.)
-- 2) config: auto_charge=true, contact_requires_payment=false (contato libera
--    após o débito da comissão do vendedor).
-- 3) orion_auction_settle: com vencedor + auto_charge → apply_commission (6%) +
--    release_contact automáticos.
-- 4) end_auction_listing: encerramento MANUAL (dono/admin) → close+settle.
-- 5) Realtime publicado para lances ao vivo (auction_bids/auction_listings).
-- 6) Cron mantido só como BACKUP (idempotente).
-- Idempotente. SQL Editor (broifhfqmnzqoongtokm).
-- ============================================================================

-- ── 1) close SEM cobrança (só vencedor + relatório + auditoria) ─────────────
CREATE OR REPLACE FUNCTION public.orion_auction_close(p_listing_id uuid, p_package text DEFAULT 'basico'::text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE
  al public.auction_listings%ROWTYPE;
  v_winner uuid; v_valor numeric; v_uniq int; v_reserve numeric;
BEGIN
  IF session_user <> 'postgres' AND coalesce(auth.role(),'') <> 'service_role'
     AND NOT public.mp_is_admin()
     AND NOT EXISTS (SELECT 1 FROM public.auction_listings a WHERE a.id=p_listing_id AND a.owner_user_id=auth.uid()) THEN
    RAISE EXCEPTION 'orion_auction_close: acesso negado';
  END IF;

  SELECT * INTO al FROM public.auction_listings WHERE id = p_listing_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'leilão inexistente'; END IF;

  -- idempotência: relatório já existe → retorna
  IF EXISTS (SELECT 1 FROM public.orion_auction_reports WHERE listing_id = p_listing_id) THEN
    RETURN (SELECT to_jsonb(r) FROM public.orion_auction_reports r WHERE listing_id = p_listing_id);
  END IF;

  SELECT user_id, max_amount/100.0 INTO v_winner, v_valor FROM (
    SELECT user_id, amount_cents max_amount FROM public.auction_bids
     WHERE listing_id = p_listing_id ORDER BY amount_cents DESC, created_at ASC LIMIT 1) b;

  v_reserve := coalesce(al.reserve_price, 0);
  IF v_valor IS NULL OR v_valor < v_reserve THEN v_winner := NULL; END IF;

  v_uniq := public.orion_auction_unique_participants(p_listing_id);

  -- *** SEM COBRANÇA no leilão *** — monetização é a comissão 6% via orion_auction_settle.
  UPDATE public.auction_listings
     SET status = 'ended', winner_user_id = v_winner, current_bid = coalesce(v_valor, current_bid), updated_at = now()
   WHERE id = p_listing_id;

  INSERT INTO public.orion_auction_reports (listing_id, participantes_unicos, total_lances, vencedor_user_id, valor_final,
    creditos_consumidos, score_final, roi_divulgacao, evolucao_lances, gerado_em)
  SELECT p_listing_id, v_uniq,
    (SELECT count(*) FROM public.auction_bids WHERE listing_id = p_listing_id),
    v_winner, v_valor, 0,   -- créditos: 0 aqui; a comissão 6% consta no settlement
    least(100, v_uniq*3 + (SELECT count(*) FROM public.auction_bids WHERE listing_id=p_listing_id)*2)::int, NULL,
    coalesce((SELECT jsonb_agg(jsonb_build_object('t',created_at,'v',amount_cents/100.0) ORDER BY created_at)
              FROM public.auction_bids WHERE listing_id = p_listing_id), '[]'::jsonb), now()
  ON CONFLICT (listing_id) DO NOTHING;

  INSERT INTO public.orion_auction_audit (listing_id, acao, ator, detalhes)
  VALUES (p_listing_id, 'close', coalesce(auth.uid()::text,'system'),
    jsonb_build_object('vencedor',v_winner,'valor_final',v_valor,'participantes',v_uniq,
      'cobranca','nenhuma — comissão 6% via settlement (decisão oficial)'));

  RETURN (SELECT to_jsonb(r) FROM public.orion_auction_reports r WHERE listing_id = p_listing_id);
END$function$;

-- ── 2) Config oficial: liga débito automático do 6% + contato pós-comissão ──
UPDATE public.orion_auction_settlement_config
   SET auto_charge = true, contact_requires_payment = false, updated_at = now()
 WHERE id = 1;

-- ── 3) settle: com vencedor + auto_charge → cobra 6% + libera contato ───────
CREATE OR REPLACE FUNCTION public.orion_auction_settle(p_listing uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_l record; v_cfg record; v_rule jsonb; v_val jsonb; v_fraud jsonb;
  v_win_user uuid; v_valor_final numeric; v_pct numeric; v_cpr numeric;
  v_com numeric; v_liq numeric; v_cred int; v_total int;
  v_cert jsonb; v_hash text; v_status text; v_existing record;
  v_min_com numeric; v_max_com numeric; v_min_cr int; v_max_cr int; v_fin record;
BEGIN
  SELECT * INTO v_existing FROM public.orion_auction_settlements WHERE listing_id = p_listing;
  IF v_existing IS NOT NULL THEN
    RETURN jsonb_build_object('ok', true, 'idempotente', true, 'status', v_existing.status,
                              'contato_liberado', v_existing.contato_liberado, 'settlement', to_jsonb(v_existing));
  END IF;

  SELECT * INTO v_l FROM public.auction_listings WHERE id = p_listing FOR UPDATE;
  IF v_l IS NULL THEN RETURN jsonb_build_object('ok', false, 'erro', 'leilão inexistente'); END IF;
  IF v_l.ends_at IS NULL OR v_l.ends_at > now() THEN
    RETURN jsonb_build_object('ok', false, 'erro', 'leilão ainda não encerrado', 'ends_at', v_l.ends_at);
  END IF;

  SELECT * INTO v_cfg FROM public.orion_auction_settlement_config WHERE id = 1;
  v_rule := public.auction_financial_rule_get('auction', v_l.listing_type);
  IF v_rule IS NULL THEN
    v_pct := coalesce(v_cfg.commission_pct,0.06)*100; v_cpr := coalesce(v_cfg.credits_per_real,1.0);
    v_min_com := NULL; v_max_com := NULL; v_min_cr := NULL; v_max_cr := NULL;
  ELSE
    v_pct := (v_rule->>'commission_percent')::numeric;
    v_cpr := (v_rule->>'credits_per_real')::numeric;
    v_min_com := (v_rule->>'minimum_commission')::numeric; v_max_com := (v_rule->>'maximum_commission')::numeric;
    v_min_cr  := (v_rule->>'minimum_credits')::int;        v_max_cr  := (v_rule->>'maximum_credits')::int;
  END IF;

  v_val   := public.orion_auction_validate_bids(p_listing);
  v_fraud := public.orion_auction_fraud_scan(p_listing);
  SELECT count(*) INTO v_total FROM public.auction_bids WHERE listing_id = p_listing;

  IF (v_val->'maior_valido') IS NULL OR v_val->'maior_valido' = 'null'::jsonb THEN
    v_win_user := NULL; v_valor_final := coalesce(v_l.current_bid, v_l.starting_bid, 0); v_status := 'no_winner';
  ELSE
    v_win_user := (v_val->'maior_valido'->>'user_id')::uuid;
    v_valor_final := (v_val->'maior_valido'->>'valor')::numeric;
    v_status := 'awaiting_credits';
  END IF;

  v_com := round(coalesce(v_valor_final,0) * v_pct/100.0, 2);
  IF v_min_com IS NOT NULL THEN v_com := GREATEST(v_com, v_min_com); END IF;
  IF v_max_com IS NOT NULL THEN v_com := LEAST(v_com, v_max_com); END IF;
  v_liq  := round(coalesce(v_valor_final,0) - v_com, 2);
  v_cred := ceil(v_com * coalesce(v_cpr, 1.0))::int;
  IF v_min_cr IS NOT NULL THEN v_cred := GREATEST(v_cred, v_min_cr); END IF;
  IF v_max_cr IS NOT NULL THEN v_cred := LEAST(v_cred, v_max_cr); END IF;

  v_cert := jsonb_build_object('leilao', p_listing, 'produto', v_l.product_id, 'titulo', v_l.title,
    'vendedor', v_l.owner_user_id, 'comprador', v_win_user, 'valor_inicial', v_l.starting_bid,
    'valor_final', v_valor_final, 'total_lances', v_total, 'validos', (v_val->>'validos')::int,
    'encerrado_em', v_l.ends_at, 'comissao_pct', v_pct, 'comissao_valor', v_com,
    'regra', coalesce(v_rule->>'id','fallback-config'), 'emitido_em', now());
  v_hash := md5(coalesce(p_listing::text,'') || '|' || coalesce(v_win_user::text,'') || '|'
              || coalesce(v_valor_final::text,'0') || '|' || coalesce(v_total::text,'0') || '|'
              || coalesce(v_l.ends_at::text,''));

  INSERT INTO public.orion_auction_settlements (
    listing_id, product_id, seller_user_id, winner_user_id, titulo, cidade,
    valor_inicial, valor_final, total_lances, lances_validos, lances_invalidos,
    iniciado_em, encerrado_em, duracao_segundos, comissao_pct, comissao_bruta,
    comissao_valor, valor_liquido, creditos_comissao, status,
    comissao_ok, creditos_ok, pagamento_ok, auditoria_ok, contato_liberado,
    certificado_hash, certificado, fraude_score, fraude_flags, evidencia
  ) VALUES (
    p_listing, v_l.product_id, v_l.owner_user_id, v_win_user, v_l.title, v_l.city,
    v_l.starting_bid, v_valor_final, v_total, (v_val->>'validos')::int, (v_val->>'invalidos')::int,
    v_l.starts_at, v_l.ends_at,
    CASE WHEN v_l.starts_at IS NOT NULL THEN EXTRACT(epoch FROM (v_l.ends_at - v_l.starts_at))::bigint END,
    round(v_pct/100.0, 4), v_valor_final, v_com, v_liq, v_cred, v_status,
    (v_win_user IS NOT NULL), false, false, true, false,
    v_hash, v_cert, (v_fraud->>'score')::int, coalesce(v_fraud->'flags','[]'::jsonb),
    jsonb_build_object('validacao', v_val, 'fraude', v_fraud, 'regra_financeira', v_rule)
  ) ON CONFLICT (listing_id) DO NOTHING;

  IF v_win_user IS NOT NULL AND v_l.winner_user_id IS NULL THEN
    UPDATE public.auction_listings SET winner_user_id = v_win_user, updated_at = now() WHERE id = p_listing;
  END IF;

  INSERT INTO public.orion_auction_audit (listing_id, acao, ator, detalhes)
  VALUES (p_listing, 'settle', 'orion-ai-65',
          jsonb_build_object('status', v_status, 'vencedor', v_win_user, 'comissao', v_com,
            'creditos', v_cred, 'regra', coalesce(v_rule->>'id','fallback'), 'fraude_score', (v_fraud->>'score')::int));

  -- FLUXO OFICIAL: com vencedor + auto_charge → cobra 6% e libera contato
  IF v_cfg.auto_charge AND v_win_user IS NOT NULL THEN
    PERFORM public.orion_auction_apply_commission(p_listing, NULL);
    PERFORM public.orion_auction_release_contact(p_listing, NULL);
  END IF;

  SELECT * INTO v_fin FROM public.orion_auction_settlements WHERE listing_id = p_listing;
  RETURN jsonb_build_object('ok', true, 'status', v_fin.status, 'vencedor', v_fin.winner_user_id,
    'valor_final', v_fin.valor_final, 'comissao_pct', v_pct, 'comissao_valor', v_fin.comissao_valor,
    'valor_liquido', v_fin.valor_liquido, 'creditos_comissao', v_fin.creditos_comissao,
    'creditos_ok', v_fin.creditos_ok, 'contato_liberado', v_fin.contato_liberado,
    'certificado_hash', v_fin.certificado_hash, 'regra', coalesce(v_rule->>'id','fallback-config'),
    'fraude_score', v_fin.fraude_score, 'auto_charge', v_cfg.auto_charge);
END$$;
REVOKE ALL ON FUNCTION public.orion_auction_settle(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.orion_auction_settle(uuid) TO service_role;

-- ── 4) end_auction_listing: encerramento MANUAL (dono/admin) → close+settle ─
CREATE OR REPLACE FUNCTION public.end_auction_listing(p_listing_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_l record; v_settle jsonb;
BEGIN
  SELECT * INTO v_l FROM public.auction_listings WHERE id = p_listing_id;
  IF v_l IS NULL THEN RETURN jsonb_build_object('success', false, 'error', 'Leilão não encontrado'); END IF;
  IF session_user <> 'postgres' AND coalesce(auth.role(),'') <> 'service_role'
     AND NOT public.mp_is_admin() AND v_l.owner_user_id <> auth.uid() THEN
    RETURN jsonb_build_object('success', false, 'error', 'Acesso negado — apenas o dono encerra');
  END IF;

  -- antecipa o fim para agora (idempotente se já encerrado)
  UPDATE public.auction_listings
     SET ends_at = LEAST(coalesce(ends_at, now()), now()), status = 'ended', updated_at = now()
   WHERE id = p_listing_id;

  PERFORM public.orion_auction_close(p_listing_id, 'basico');   -- relatório (sem cobrança)
  v_settle := public.orion_auction_settle(p_listing_id);        -- comissão 6% + contato

  RETURN jsonb_build_object('success', true, 'listing_id', p_listing_id, 'settlement', v_settle);
END$$;
REVOKE ALL ON FUNCTION public.end_auction_listing(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.end_auction_listing(uuid) TO authenticated, service_role;

-- ── 5) Realtime: lances ao vivo (idempotente) ──────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication_rel pr JOIN pg_class c ON c.oid=pr.prrelid
                 JOIN pg_publication p ON p.oid=pr.prpubid
                 WHERE p.pubname='supabase_realtime' AND c.relname='auction_bids') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.auction_bids;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_rel pr JOIN pg_class c ON c.oid=pr.prrelid
                 JOIN pg_publication p ON p.oid=pr.prpubid
                 WHERE p.pubname='supabase_realtime' AND c.relname='auction_listings') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.auction_listings;
  END IF;
EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'realtime: %', SQLERRM;
END$$;

-- ── 6) Verificação ─────────────────────────────────────────────────────────
SELECT jsonb_build_object(
  'auto_charge_on', (SELECT auto_charge FROM public.orion_auction_settlement_config WHERE id=1),
  'contact_req_payment_off', (SELECT contact_requires_payment FROM public.orion_auction_settlement_config WHERE id=1),
  'close_sem_cobranca', (SELECT position('SEM COBRANÇA' in pg_get_functiondef((SELECT oid FROM pg_proc WHERE proname='orion_auction_close' LIMIT 1)))>0),
  'end_auction_listing_ok', (SELECT count(*) FROM pg_proc WHERE proname='end_auction_listing'),
  'realtime_bids', (SELECT count(*) FROM pg_publication_rel pr JOIN pg_class c ON c.oid=pr.prrelid JOIN pg_publication p ON p.oid=pr.prpubid WHERE p.pubname='supabase_realtime' AND c.relname='auction_bids'),
  'realtime_listings', (SELECT count(*) FROM pg_publication_rel pr JOIN pg_class c ON c.oid=pr.prrelid JOIN pg_publication p ON p.oid=pr.prpubid WHERE p.pubname='supabase_realtime' AND c.relname='auction_listings')
) AS verificacao;
