-- ============================================================================
-- ORION CERTIFICATION — LEILÕES ENTERPRISE · PARTE 2/3 · SEGURANÇA + MOTOR DE LANCES
-- 2026-07-23 · SQL Editor (broifhfqmnzqoongtokm) · aplicar APÓS a Parte 1.
-- ----------------------------------------------------------------------------
-- CORRIGE os P0 de segurança da auditoria:
--   [P0-1] Bypass da RPC: INSERT direto em auction_bids por authenticated.
--   [P0-2] INSERT anônimo em arremate_offers com WITH CHECK(true).
--   [P0-3] Self-bidding permitido no place_auction_bid de produção.
--   [P0-5] accept_arremate_offer_advertiser sem validação de dono da conta.
--   [P1]   create_auction_listing_v2 aceita p_owner_user_id forjado.
--   [P1]   RPCs núcleo sem SET search_path.
--   [P1]   orion_auction_close elege vencedor por lance BRUTO (ignora validação).
-- E entrega o MOTOR DE LANCES v3 (server-side, auditável): incremento por grade,
-- incremento por categoria, anti self-bid, rate-limit anti-bot, proxy/auto-bid,
-- outbid notification, idempotência e auditoria em auction_events.
--
-- Idempotente. ROLLBACK ao final.
-- ============================================================================

-- ── 0) RLS ENDURECIDA: lances e ofertas SÓ via RPC (revoga escrita direta) ──
-- auction_bids: remove QUALQUER policy de INSERT/UPDATE/DELETE. SELECT público
-- permanece (histórico). A escrita passa a ser exclusiva das RPCs (definer).
DO $$
DECLARE p record;
BEGIN
  FOR p IN SELECT policyname FROM pg_policies
           WHERE schemaname='public' AND tablename='auction_bids' LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.auction_bids', p.policyname);
  END LOOP;
END $$;
CREATE POLICY auction_bids_select_public ON public.auction_bids FOR SELECT USING (true);
-- (sem policy de INSERT/UPDATE/DELETE → bloqueado para todos os papéis
--  não-definer; as RPCs SECURITY DEFINER continuam funcionando)
REVOKE INSERT, UPDATE, DELETE ON public.auction_bids FROM anon, authenticated;

-- arremate_offers: fecha o INSERT anônimo WITH CHECK(true). A oferta continua
-- possível (inclusive anônima) SOMENTE via RPC submit_arremate_offer.
DO $$
DECLARE p record;
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables
             WHERE table_schema='public' AND table_name='arremate_offers') THEN
    FOR p IN SELECT policyname FROM pg_policies
             WHERE schemaname='public' AND tablename='arremate_offers'
               AND cmd IN ('INSERT','ALL') LOOP
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.arremate_offers', p.policyname);
    END LOOP;
    REVOKE INSERT, UPDATE, DELETE ON public.arremate_offers FROM anon, authenticated;
  END IF;
END $$;

-- auction_listings: escrita direta só do dono (mantém compat) + leitura pública
DROP POLICY IF EXISTS auction_listings_read ON public.auction_listings;
CREATE POLICY auction_listings_read ON public.auction_listings
  FOR SELECT USING (deleted_at IS NULL OR owner_user_id = auth.uid() OR public.mp_is_admin());
DROP POLICY IF EXISTS auction_listings_owner_write ON public.auction_listings;
CREATE POLICY auction_listings_owner_write ON public.auction_listings
  FOR ALL USING (owner_user_id = auth.uid() OR public.mp_is_admin())
  WITH CHECK (owner_user_id = auth.uid() OR public.mp_is_admin());
REVOKE INSERT, UPDATE, DELETE ON public.auction_listings FROM anon;

-- proxy_bids / watchers: dono lê/gerencia o próprio
DROP POLICY IF EXISTS auction_proxy_own ON public.auction_proxy_bids;
CREATE POLICY auction_proxy_own ON public.auction_proxy_bids
  FOR SELECT USING (user_id = auth.uid() OR public.mp_is_admin());
DROP POLICY IF EXISTS auction_watchers_own ON public.auction_watchers;
CREATE POLICY auction_watchers_own ON public.auction_watchers
  FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
DROP POLICY IF EXISTS auction_images_read ON public.auction_images;
CREATE POLICY auction_images_read ON public.auction_images FOR SELECT USING (true);
DROP POLICY IF EXISTS auction_events_admin ON public.auction_events;
CREATE POLICY auction_events_admin ON public.auction_events
  FOR SELECT USING (public.mp_is_admin()
    OR EXISTS (SELECT 1 FROM public.auction_listings a
               WHERE a.id = auction_events.listing_id AND a.owner_user_id = auth.uid()));
DROP POLICY IF EXISTS auction_bid_rate_own ON public.auction_bid_rate;
CREATE POLICY auction_bid_rate_own ON public.auction_bid_rate
  FOR SELECT USING (user_id = auth.uid() OR public.mp_is_admin());

-- ── 1) Incremento inteligente por CATEGORIA (config auditável) ──────────────
CREATE TABLE IF NOT EXISTS public.auction_increment_rules (
  category_slug text PRIMARY KEY,
  min_increment numeric NOT NULL,
  updated_at    timestamptz NOT NULL DEFAULT now()
);
INSERT INTO public.auction_increment_rules (category_slug, min_increment) VALUES
  ('veiculos', 500), ('imoveis', 1000), ('maquinas', 250), ('agro', 100),
  ('eletronicos', 25), ('eletrodomesticos', 20), ('moveis', 20),
  ('joias', 50), ('colecionaveis', 25), ('outros', 10)
ON CONFLICT (category_slug) DO NOTHING;
ALTER TABLE public.auction_increment_rules ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS air_read ON public.auction_increment_rules;
CREATE POLICY air_read ON public.auction_increment_rules FOR SELECT USING (true);

-- Incremento efetivo do leilão = o da listing, senão o da categoria, senão 1.
CREATE OR REPLACE FUNCTION public.auction_effective_increment_cents(p_listing public.auction_listings)
RETURNS integer LANGUAGE sql STABLE SET search_path = public AS $$
  SELECT GREATEST(1, COALESCE(
    NULLIF((p_listing.minimum_increment * 100)::integer, 0),
    (SELECT (min_increment * 100)::integer FROM public.auction_increment_rules
      WHERE category_slug = p_listing.category_slug),
    100));
$$;

-- ── 2) MOTOR DE LANCES v3 — place_auction_bid seguro e auditável ────────────
-- Substitui as versões anteriores. Fecha self-bid, adiciona rate-limit e
-- aciona o auto-bid (proxy). SECURITY DEFINER + SET search_path.
CREATE OR REPLACE FUNCTION public.place_auction_bid(p_listing_id uuid, p_amount_cents integer)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $function$
DECLARE
  v_listing public.auction_listings%ROWTYPE;
  v_user uuid := auth.uid();
  v_bid_id uuid;
  v_cur_cents integer; v_start_cents integer; v_inc integer; v_next_min integer;
  v_store_user uuid; v_store_nome text; v_store_email text; v_bidder_email text;
  v_prev_leader uuid; v_prev_email text;
  v_rate record; v_window interval := interval '10 seconds'; v_max_hits int := 5;
BEGIN
  IF v_user IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Faça login para dar lances.');
  END IF;

  SELECT * INTO v_listing FROM public.auction_listings WHERE id = p_listing_id FOR UPDATE;
  IF v_listing.id IS NULL THEN RETURN jsonb_build_object('success', false, 'error', 'Leilão não encontrado'); END IF;
  IF v_listing.status <> 'active' THEN RETURN jsonb_build_object('success', false, 'error', 'Leilão não está ativo'); END IF;
  IF v_listing.ends_at IS NOT NULL AND v_listing.ends_at < now() THEN
    RETURN jsonb_build_object('success', false, 'error', 'Leilão encerrado'); END IF;

  -- [P0-3] ANTI SELF-BID: dono não dá lance no próprio leilão
  IF v_user = v_listing.owner_user_id THEN
    RETURN jsonb_build_object('success', false, 'code', 'self_bid',
      'error', 'O anunciante não pode dar lances no próprio leilão.'); END IF;

  -- RATE LIMIT anti-bot: máx v_max_hits lances por janela de 10s
  SELECT * INTO v_rate FROM public.auction_bid_rate
    WHERE listing_id = p_listing_id AND user_id = v_user FOR UPDATE;
  IF v_rate.user_id IS NULL THEN
    INSERT INTO public.auction_bid_rate (listing_id, user_id, window_start, hits)
    VALUES (p_listing_id, v_user, now(), 1);
  ELSIF v_rate.window_start > now() - v_window THEN
    IF v_rate.hits >= v_max_hits THEN
      PERFORM public.auction_log(p_listing_id, 'rate_limited', v_user::text, jsonb_build_object('hits', v_rate.hits));
      RETURN jsonb_build_object('success', false, 'code', 'rate_limited',
        'error', 'Muitos lances em pouco tempo. Aguarde alguns segundos.');
    END IF;
    UPDATE public.auction_bid_rate SET hits = hits + 1
      WHERE listing_id = p_listing_id AND user_id = v_user;
  ELSE
    UPDATE public.auction_bid_rate SET window_start = now(), hits = 1
      WHERE listing_id = p_listing_id AND user_id = v_user;
  END IF;

  v_cur_cents   := COALESCE((v_listing.current_bid  * 100)::integer, 0);
  v_start_cents := COALESCE((v_listing.starting_bid * 100)::integer, 0);
  v_inc         := public.auction_effective_increment_cents(v_listing);
  v_next_min := v_start_cents + CEIL(
    GREATEST(v_cur_cents + v_inc - v_start_cents, v_inc)::numeric / v_inc)::integer * v_inc;

  IF p_amount_cents < v_next_min THEN
    RETURN jsonb_build_object('success', false, 'code', 'below_min',
      'error', 'Lance abaixo do mínimo permitido.',
      'next_min_cents', v_next_min, 'increment_cents', v_inc); END IF;
  IF ((p_amount_cents - v_start_cents) % v_inc) <> 0 THEN
    RETURN jsonb_build_object('success', false, 'code', 'off_grid',
      'error', 'O lance deve respeitar o incremento configurado.',
      'next_min_cents', v_next_min, 'increment_cents', v_inc); END IF;

  -- líder anterior (para notificação de outbid)
  SELECT user_id INTO v_prev_leader FROM public.auction_bids
    WHERE listing_id = p_listing_id AND is_winning = true AND is_valid = true LIMIT 1;

  UPDATE public.auction_bids SET is_winning = false WHERE listing_id = p_listing_id AND is_winning = true;
  INSERT INTO public.auction_bids (listing_id, user_id, amount_cents, is_winning, source)
  VALUES (p_listing_id, v_user, p_amount_cents, true, 'rpc') RETURNING id INTO v_bid_id;
  UPDATE public.auction_listings
    SET current_bid = (p_amount_cents::numeric / 100), total_bids = COALESCE(total_bids,0) + 1, updated_at = now()
  WHERE id = p_listing_id;

  PERFORM public.auction_log(p_listing_id, 'bid', v_user::text, jsonb_build_object('amount_cents', p_amount_cents, 'bid_id', v_bid_id));

  -- ── Notificações: 2 lados + OUTBID ao líder anterior ──
  BEGIN
    SELECT ms.user_id, ms.nome_loja INTO v_store_user, v_store_nome
      FROM merchant_stores ms WHERE ms.id = v_listing.store_id;
    SELECT email INTO v_store_email FROM auth.users WHERE id = coalesce(v_store_user, v_listing.owner_user_id);
    SELECT email INTO v_bidder_email FROM auth.users WHERE id = v_user;
    PERFORM enqueue_notification_event('auction_bid', 'auction_bids', v_bid_id, NULL, v_listing.city,
      jsonb_build_object('source','auction_bid','listing_id',p_listing_id,'listing_title',v_listing.title,
        'amount',(p_amount_cents::numeric/100),'city',v_listing.city,
        'store_user_id',coalesce(v_store_user,v_listing.owner_user_id),'store_name',v_store_nome,
        'store_email',v_store_email,'bidder_user_id',v_user,'bidder_email',v_bidder_email));
    IF v_prev_leader IS NOT NULL AND v_prev_leader <> v_user THEN
      SELECT email INTO v_prev_email FROM auth.users WHERE id = v_prev_leader;
      PERFORM enqueue_notification_event('auction_outbid', 'auction_bids', v_bid_id, NULL, v_listing.city,
        jsonb_build_object('source','auction_outbid','listing_id',p_listing_id,'listing_title',v_listing.title,
          'new_amount',(p_amount_cents::numeric/100),'outbid_user_id',v_prev_leader,'outbid_email',v_prev_email));
    END IF;
  EXCEPTION WHEN others THEN NULL; END;

  -- ── AUTO-BID / PROXY: se houver proxy ativo de outro usuário acima do lance,
  --    ele responde automaticamente até o mínimo necessário (1 passo). ──
  PERFORM public.auction_run_proxy(p_listing_id, v_bid_id);

  RETURN jsonb_build_object('success', true, 'bid_id', v_bid_id, 'amount_cents', p_amount_cents,
    'next_min_cents', p_amount_cents + v_inc, 'increment_cents', v_inc);
END $function$;

-- ── 3) AUTO-BID engine — responde por quem tem proxy configurado ────────────
CREATE OR REPLACE FUNCTION public.auction_run_proxy(p_listing_id uuid, p_trigger_bid uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_listing public.auction_listings%ROWTYPE;
  v_cur_cents int; v_start_cents int; v_inc int; v_next_min int;
  v_proxy record; v_bid_id uuid; v_leader uuid;
BEGIN
  SELECT * INTO v_listing FROM public.auction_listings WHERE id = p_listing_id FOR UPDATE;
  IF v_listing.status <> 'active' THEN RETURN; END IF;

  SELECT user_id INTO v_leader FROM public.auction_bids
    WHERE listing_id = p_listing_id AND is_winning = true LIMIT 1;

  -- maior proxy ativo que NÃO seja o líder atual e cujo teto cubra o próximo mínimo
  v_inc := public.auction_effective_increment_cents(v_listing);
  v_cur_cents := COALESCE((v_listing.current_bid * 100)::integer, 0);
  v_start_cents := COALESCE((v_listing.starting_bid * 100)::integer, 0);
  v_next_min := v_start_cents + CEIL(
    GREATEST(v_cur_cents + v_inc - v_start_cents, v_inc)::numeric / v_inc)::integer * v_inc;

  SELECT * INTO v_proxy FROM public.auction_proxy_bids
    WHERE listing_id = p_listing_id AND is_active = true
      AND user_id <> COALESCE(v_leader, '00000000-0000-0000-0000-000000000000'::uuid)
      AND user_id <> v_listing.owner_user_id
      AND max_cents >= v_next_min
    ORDER BY max_cents DESC LIMIT 1;

  IF v_proxy.user_id IS NULL THEN RETURN; END IF;

  UPDATE public.auction_bids SET is_winning = false WHERE listing_id = p_listing_id AND is_winning = true;
  INSERT INTO public.auction_bids (listing_id, user_id, amount_cents, is_winning, is_auto, source)
  VALUES (p_listing_id, v_proxy.user_id, v_next_min, true, true, 'proxy') RETURNING id INTO v_bid_id;
  UPDATE public.auction_listings
    SET current_bid = (v_next_min::numeric/100), total_bids = COALESCE(total_bids,0)+1, updated_at = now()
  WHERE id = p_listing_id;
  PERFORM public.auction_log(p_listing_id, 'auto_bid', v_proxy.user_id::text,
    jsonb_build_object('amount_cents', v_next_min, 'via', 'proxy', 'trigger', p_trigger_bid));
END $$;

-- ── 4) Configurar auto-bid (proxy) — validado, sem self-bid ─────────────────
CREATE OR REPLACE FUNCTION public.set_auction_proxy_bid(p_listing_id uuid, p_max_cents integer)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_user uuid := auth.uid(); v_listing public.auction_listings%ROWTYPE;
BEGIN
  IF v_user IS NULL THEN RETURN jsonb_build_object('success', false, 'error', 'not_authenticated'); END IF;
  SELECT * INTO v_listing FROM public.auction_listings WHERE id = p_listing_id;
  IF v_listing.id IS NULL THEN RETURN jsonb_build_object('success', false, 'error', 'not_found'); END IF;
  IF v_user = v_listing.owner_user_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'O anunciante não pode configurar auto-bid no próprio leilão.'); END IF;
  IF p_max_cents <= COALESCE((v_listing.current_bid*100)::int,0) THEN
    RETURN jsonb_build_object('success', false, 'error', 'O teto deve ser maior que o lance atual.'); END IF;

  INSERT INTO public.auction_proxy_bids (listing_id, user_id, max_cents, is_active, updated_at)
  VALUES (p_listing_id, v_user, p_max_cents, true, now())
  ON CONFLICT (listing_id, user_id) DO UPDATE
    SET max_cents = EXCLUDED.max_cents, is_active = true, updated_at = now();

  -- dispara imediatamente se já for vantajoso
  PERFORM public.auction_run_proxy(p_listing_id, NULL);
  RETURN jsonb_build_object('success', true);
END $$;

-- ── 5) [P1] orion_auction_close: vencedor pelo maior lance VÁLIDO ───────────
-- Reusa orion_auction_validate_bids (que já exclui self-bid/pós-prazo/inválidos)
-- em vez do maior amount_cents bruto, alinhando close ↔ settle.
CREATE OR REPLACE FUNCTION public.orion_auction_close(p_listing_id uuid, p_package text DEFAULT 'basico'::text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $function$
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
  IF EXISTS (SELECT 1 FROM public.orion_auction_reports WHERE listing_id = p_listing_id) THEN
    RETURN (SELECT to_jsonb(r) FROM public.orion_auction_reports r WHERE listing_id = p_listing_id);
  END IF;

  -- vencedor = maior lance VÁLIDO (não o bruto). Fallback defensivo ao bruto.
  BEGIN
    v_val := public.orion_auction_validate_bids(p_listing_id);
    IF v_val ? 'maior_valido' AND v_val->'maior_valido' <> 'null'::jsonb THEN
      v_winner := (v_val->'maior_valido'->>'user_id')::uuid;
      v_valor  := (v_val->'maior_valido'->>'amount_cents')::numeric / 100.0;
    END IF;
  EXCEPTION WHEN others THEN v_winner := NULL; END;

  IF v_winner IS NULL THEN
    SELECT user_id, amount_cents/100.0 INTO v_winner, v_valor FROM public.auction_bids
      WHERE listing_id = p_listing_id AND is_valid = true
        AND user_id <> COALESCE(al.owner_user_id,'00000000-0000-0000-0000-000000000000'::uuid)
      ORDER BY amount_cents DESC, created_at ASC LIMIT 1;
  END IF;

  v_reserve := coalesce(al.reserve_price, 0);
  IF v_valor IS NULL OR v_valor < v_reserve THEN v_winner := NULL; END IF;
  v_uniq := public.orion_auction_unique_participants(p_listing_id);

  UPDATE public.auction_listings
     SET status = 'ended', winner_user_id = v_winner, current_bid = coalesce(v_valor, current_bid), updated_at = now()
   WHERE id = p_listing_id;

  INSERT INTO public.orion_auction_reports (listing_id, participantes_unicos, total_lances, vencedor_user_id, valor_final,
    creditos_consumidos, score_final, roi_divulgacao, evolucao_lances, gerado_em)
  SELECT p_listing_id, v_uniq,
    (SELECT count(*) FROM public.auction_bids WHERE listing_id = p_listing_id),
    v_winner, v_valor, 0,
    least(100, v_uniq*3 + (SELECT count(*) FROM public.auction_bids WHERE listing_id=p_listing_id)*2)::int, NULL,
    coalesce((SELECT jsonb_agg(jsonb_build_object('t',created_at,'v',amount_cents/100.0) ORDER BY created_at)
              FROM public.auction_bids WHERE listing_id = p_listing_id), '[]'::jsonb), now()
  ON CONFLICT (listing_id) DO NOTHING;

  INSERT INTO public.orion_auction_audit (listing_id, acao, ator, detalhes)
  VALUES (p_listing_id, 'close', coalesce(auth.uid()::text,'system'),
    jsonb_build_object('vencedor',v_winner,'valor_final',v_valor,'participantes',v_uniq,'fonte','maior_lance_valido'));

  RETURN (SELECT to_jsonb(r) FROM public.orion_auction_reports r WHERE listing_id = p_listing_id);
END $function$;

-- ── 6) [P1] create_auction_listing_v2: ignora p_owner_user_id forjado ───────
-- Reescreve para SEMPRE usar auth.uid() como dono no caminho de anunciante.
CREATE OR REPLACE FUNCTION public.create_auction_listing_v2(
  p_title TEXT, p_starting_bid NUMERIC, p_listing_type TEXT DEFAULT 'auction',
  p_description TEXT DEFAULT NULL, p_product_image_url TEXT DEFAULT NULL,
  p_buy_now_price NUMERIC DEFAULT NULL, p_duration_hours INTEGER DEFAULT 24,
  p_starts_at TIMESTAMPTZ DEFAULT NULL, p_ends_at TIMESTAMPTZ DEFAULT NULL,
  p_fulfillment_type TEXT DEFAULT 'pickup', p_store_id UUID DEFAULT NULL,
  p_owner_user_id UUID DEFAULT NULL, p_city TEXT DEFAULT NULL, p_neighborhood TEXT DEFAULT NULL)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_listing_id UUID; v_starts TIMESTAMPTZ; v_ends TIMESTAMPTZ; v_owner UUID := auth.uid();
BEGIN
  IF v_owner IS NULL THEN RETURN jsonb_build_object('success', false, 'error', 'not_authenticated'); END IF;
  -- Se store_id for informado, precisa pertencer ao chamador.
  IF p_store_id IS NOT NULL AND NOT EXISTS (
     SELECT 1 FROM public.merchant_stores WHERE id = p_store_id AND user_id = v_owner) THEN
    RETURN jsonb_build_object('success', false, 'error', 'store_not_owned'); END IF;
  v_starts := COALESCE(p_starts_at, now());
  v_ends   := COALESCE(p_ends_at, v_starts + (p_duration_hours || ' hours')::INTERVAL);

  INSERT INTO public.auction_listings (
    store_id, owner_user_id, title, description, product_image_url, listing_type,
    starting_bid, current_bid, buy_now_price, starts_at, ends_at, status,
    city, neighborhood, minimum_increment, total_bids, watchers_count, fulfillment_type)
  VALUES (p_store_id, v_owner, p_title, p_description, p_product_image_url, p_listing_type,
    p_starting_bid, p_starting_bid, p_buy_now_price, v_starts, v_ends, 'active',
    p_city, p_neighborhood, 1, 0, 0, p_fulfillment_type)
  RETURNING id INTO v_listing_id;

  PERFORM public.auction_log(v_listing_id, 'created', v_owner::text, jsonb_build_object('type', p_listing_type));
  RETURN jsonb_build_object('success', true, 'listing_id', v_listing_id, 'ends_at', v_ends);
END $$;

-- ── 7) [P0-5] accept_arremate_offer_advertiser: valida dono da conta ────────
CREATE OR REPLACE FUNCTION public.accept_arremate_offer_advertiser(
  p_offer_id UUID, p_advertiser_account_id UUID)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_offer RECORD; v_balance RECORD;
  v_contact_cost INTEGER; v_intention_cost INTEGER; v_total_cost INTEGER; v_new_balance INTEGER;
BEGIN
  IF v_uid IS NULL THEN RETURN jsonb_build_object('success', false, 'error', 'not_authenticated'); END IF;
  -- [P0-5] a conta debitada precisa ser do chamador
  IF NOT EXISTS (SELECT 1 FROM public.advertiser_accounts
                 WHERE id = p_advertiser_account_id AND (user_id = v_uid OR id = v_uid)) THEN
    RETURN jsonb_build_object('success', false, 'error', 'account_not_owned'); END IF;

  SELECT * INTO v_offer FROM public.arremate_offers WHERE id = p_offer_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('success', false, 'error', 'offer_not_found'); END IF;
  IF v_offer.status = 'accepted' THEN RETURN jsonb_build_object('success', true, 'already_accepted', true, 'credits_charged', 0); END IF;
  IF v_offer.status <> 'pending' THEN RETURN jsonb_build_object('success', false, 'error', 'offer_not_pending'); END IF;

  SELECT COALESCE((SELECT credits_cost::INTEGER FROM public.merchant_credit_usage_rules
    WHERE feature_code = 'offer_accept_contact_unlock' AND is_active = true LIMIT 1), 2) INTO v_contact_cost;
  SELECT COALESCE((SELECT credits_cost::INTEGER FROM public.merchant_credit_usage_rules
    WHERE feature_code = 'purchase_intention_received' AND is_active = true LIMIT 1), 5) INTO v_intention_cost;
  v_total_cost := v_contact_cost + v_intention_cost;

  SELECT * INTO v_balance FROM public.advertiser_credit_balances
    WHERE advertiser_account_id = p_advertiser_account_id FOR UPDATE;
  IF NOT FOUND THEN
    INSERT INTO public.advertiser_credit_balances (advertiser_account_id, available_credits, consumed_credits)
    VALUES (p_advertiser_account_id, 0, 0) RETURNING * INTO v_balance;
  END IF;
  IF v_balance.available_credits < v_total_cost THEN
    RETURN jsonb_build_object('success', false, 'error', 'insufficient_credits',
      'required', v_total_cost, 'available', v_balance.available_credits); END IF;

  v_new_balance := v_balance.available_credits - v_total_cost;
  UPDATE public.advertiser_credit_balances
    SET available_credits = v_new_balance, consumed_credits = consumed_credits + v_total_cost, updated_at = now()
  WHERE advertiser_account_id = p_advertiser_account_id;
  INSERT INTO public.advertiser_credit_ledger (advertiser_account_id, entry_type, amount,
    balance_before, balance_after, reason_code, description)
  VALUES (p_advertiser_account_id, 'debit', v_total_cost, v_balance.available_credits, v_new_balance,
    'offer_accept', 'Aceite de oferta de arremate (comunicação + intenção)');
  UPDATE public.arremate_offers SET status = 'accepted', updated_at = now() WHERE id = p_offer_id;

  RETURN jsonb_build_object('success', true, 'credits_charged', v_total_cost, 'balance_after', v_new_balance);
END $$;

-- ── 8) [P1] Incrementar views via RPC (o front fazia UPDATE direto → falhava) ─
CREATE OR REPLACE FUNCTION public.increment_auction_view(p_listing_id uuid)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  UPDATE public.auction_listings SET views_count = COALESCE(views_count,0) + 1 WHERE id = p_listing_id;
$$;

-- ── 9) Permissões ───────────────────────────────────────────────────────────
REVOKE ALL ON FUNCTION public.place_auction_bid(uuid, integer) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.place_auction_bid(uuid, integer) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.set_auction_proxy_bid(uuid, integer) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.set_auction_proxy_bid(uuid, integer) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.auction_run_proxy(uuid, uuid) FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public.increment_auction_view(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.increment_auction_view(uuid) TO anon, authenticated, service_role;

-- ── 10) VERIFICAÇÃO ─────────────────────────────────────────────────────────
SELECT
  (SELECT count(*) FROM pg_policies WHERE schemaname='public' AND tablename='auction_bids' AND cmd IN ('INSERT','ALL')) AS bids_write_policies_deve_ser_0,
  (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
     WHERE n.nspname='public' AND p.proname IN
       ('place_auction_bid','set_auction_proxy_bid','auction_run_proxy',
        'create_auction_listing_v2','accept_arremate_offer_advertiser','increment_auction_view')) AS rpcs,
  (SELECT count(*) FROM pg_proc WHERE proname='place_auction_bid'
     AND prosrc LIKE '%self_bid%') AS place_bid_tem_antiselfbid_deve_ser_1;

-- ============================================================================
-- ROLLBACK (teste): restaura a versão anterior de place_auction_bid a partir
-- de 20260722_place_auction_bid_increment_grid.sql; DROP das novas funções:
--   DROP FUNCTION IF EXISTS public.set_auction_proxy_bid(uuid,integer);
--   DROP FUNCTION IF EXISTS public.auction_run_proxy(uuid,uuid);
--   DROP FUNCTION IF EXISTS public.increment_auction_view(uuid);
--   DROP TABLE IF EXISTS public.auction_increment_rules;
--   -- e reaplicar as policies antigas de auction_bids/arremate_offers.
-- ============================================================================
