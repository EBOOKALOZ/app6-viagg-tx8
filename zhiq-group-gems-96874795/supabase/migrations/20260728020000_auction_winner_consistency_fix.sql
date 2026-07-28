-- ============================================================================
-- Correção P0-3 (auditoria 2026-07-28): divergência entre o vencedor gravado
-- em auction_listings.winner_user_id e o vencedor gravado em
-- orion_auction_settlements.winner_user_id.
--
-- Causa raiz confirmada com caso real em produção (listing 75a21968, "Pneu
-- traseiro de moto--TESTE DE APP--"):
--   - orion_auction_close (versão vigente) elege o vencedor por
--     `ORDER BY amount_cents DESC, created_at ASC LIMIT 1` BRUTO — não
--     exclui lances do próprio dono do leilão (self-bid).
--   - Neste caso o dono deu 5 dos 6 lances no próprio leilão; o maior lance
--     bruto era do próprio dono, então orion_auction_close gravou
--     auction_listings.winner_user_id = dono.
--   - orion_auction_settle roda em seguida e recalcula corretamente via
--     orion_auction_validate_bids (que CORRETAMENTE exclui self-bids),
--     elegendo o único licitante legítimo como vencedor real — mas só
--     atualiza auction_listings.winner_user_id se este ainda for NULL
--     (`AND v_l.winner_user_id IS NULL`), o que não é o caso aqui.
--   - Resultado: auction_listings mostra o dono como vencedor (dado exibido
--     ao público/frontend), enquanto orion_auction_settlements (fonte usada
--     pelo trigger de pós-venda/arremate) tem o vencedor correto — dois
--     "vencedores" diferentes em produção.
--
-- auction_buy_now tem uma janela de risco análoga (mesma causa raiz
-- estrutural): grava winner_user_id incondicionalmente com o comprador do
-- buy-now, sem validar que o valor supera o maior lance válido existente,
-- e mascara qualquer falha do settle subsequente.
--
-- Correção (3 funções, mesma transação):
--   1. orion_auction_close passa a eleger o vencedor via
--      orion_auction_validate_bids (mesma fonte de verdade usada por
--      settle), em vez de MAX(amount_cents) bruto.
--   2. orion_auction_settle deixa de exigir winner_user_id IS NULL para
--      corrigir auction_listings — o settlement (validado) sempre pode
--      reconciliar o listing quando diverge.
--   3. auction_buy_now passa a validar que buy_now_price supera o maior
--      lance válido atual antes de gravar vencedor, e deixa de mascarar
--      falha do settle como sucesso.
-- ============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.orion_auction_close(p_listing_id uuid, p_package text DEFAULT 'basico'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  al public.auction_listings%ROWTYPE;
  v_winner uuid; v_valor numeric; v_uniq int; v_reserve numeric; v_val jsonb;
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

  -- Vencedor = maior lance VÁLIDO (exclui self-bid/pós-prazo/abaixo do
  -- incremento) — mesma fonte usada por orion_auction_settle, em vez de
  -- MAX(amount_cents) bruto (causa raiz do P0-3: dono podia "vencer" o
  -- próprio leilão dando o maior lance nele mesmo).
  v_val := public.orion_auction_validate_bids(p_listing_id);
  IF (v_val->'maior_valido') IS NULL OR v_val->'maior_valido' = 'null'::jsonb THEN
    v_winner := NULL; v_valor := NULL;
  ELSE
    v_winner := (v_val->'maior_valido'->>'user_id')::uuid;
    v_valor  := (v_val->'maior_valido'->>'valor')::numeric;
  END IF;

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
      'cobranca','nenhuma — comissão 6% via settlement (decisão oficial)',
      'metodo_vencedor','orion_auction_validate_bids (corrigido P0-3 2026-07-28)'));

  RETURN (SELECT to_jsonb(r) FROM public.orion_auction_reports r WHERE listing_id = p_listing_id);
END$function$;

CREATE OR REPLACE FUNCTION public.orion_auction_settle(p_listing uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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

  -- Correção P0-3: o settlement (vencedor validado por
  -- orion_auction_validate_bids) é a fonte de verdade — reconciliar
  -- auction_listings sempre que divergir, não só quando estiver NULL.
  -- Isso corrige o caso em que orion_auction_close (ou auction_buy_now)
  -- já tinha gravado um vencedor diferente do vencedor validado.
  IF v_win_user IS DISTINCT FROM v_l.winner_user_id THEN
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
END$function$;

CREATE OR REPLACE FUNCTION public.auction_buy_now(p_listing_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_l public.auction_listings%ROWTYPE; v_uid uuid := auth.uid(); v_settle jsonb;
  v_val jsonb; v_highest_cents int; v_buy_now_cents int;
BEGIN
  IF v_uid IS NULL THEN RETURN jsonb_build_object('success', false, 'error', 'not_authenticated'); END IF;
  SELECT * INTO v_l FROM public.auction_listings WHERE id = p_listing_id FOR UPDATE;
  IF v_l.id IS NULL THEN RETURN jsonb_build_object('success', false, 'error', 'not_found'); END IF;
  IF v_l.buy_now_price IS NULL OR v_l.buy_now_price <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'buy_now_indisponivel'); END IF;
  IF v_l.status <> 'active' THEN RETURN jsonb_build_object('success', false, 'error', 'nao_ativo'); END IF;
  IF v_uid = v_l.owner_user_id THEN RETURN jsonb_build_object('success', false, 'error', 'self_purchase'); END IF;

  -- Correção P0-3: recusar buy-now se já existe lance válido igual/maior
  -- ao valor de compra imediata — evita que o buy-now vire "vencedor" do
  -- listing enquanto o settle recalculado elege outro usuário.
  v_val := public.orion_auction_validate_bids(p_listing_id);
  v_buy_now_cents := (v_l.buy_now_price * 100)::int;
  IF (v_val->'maior_valido') IS NOT NULL AND v_val->'maior_valido' <> 'null'::jsonb THEN
    v_highest_cents := (v_val->'maior_valido'->>'amount_cents')::int;
    IF v_buy_now_cents <= v_highest_cents THEN
      RETURN jsonb_build_object('success', false, 'error', 'buy_now_abaixo_lance_atual',
        'buy_now_cents', v_buy_now_cents, 'maior_lance_valido_cents', v_highest_cents);
    END IF;
  END IF;

  UPDATE public.auction_bids SET is_winning = false WHERE listing_id = p_listing_id AND is_winning = true;
  INSERT INTO public.auction_bids (listing_id, user_id, amount_cents, is_winning, source)
  VALUES (p_listing_id, v_uid, v_buy_now_cents, true, 'rpc');

  UPDATE public.auction_listings
     SET status = 'ended', winner_user_id = v_uid, current_bid = v_l.buy_now_price,
         ends_at = now(), updated_at = now()
   WHERE id = p_listing_id;
  PERFORM public.auction_log(p_listing_id, 'buy_now', v_uid::text, jsonb_build_object('price', v_l.buy_now_price));

  -- Correção P0-3: não mascarar falha do settle como sucesso — se o
  -- settle falhar, a compra fica em estado inconsistente e o chamador
  -- precisa saber (erro real, não 'settle_deferred' silencioso).
  v_settle := public.orion_auction_settle(p_listing_id);

  RETURN jsonb_build_object('success', true, 'winner', v_uid, 'price', v_l.buy_now_price, 'settle', v_settle);
END $function$;

COMMIT;

-- ROLLBACK (documentado, não executado): recriar as 3 funções acima com o
-- corpo anterior a esta migration (ver git log de
-- 20260727012000_auction_frontend_rpcs_oficial.sql e
-- 20260718_orion_auction_official_flow_ai672.sql para os corpos originais).
