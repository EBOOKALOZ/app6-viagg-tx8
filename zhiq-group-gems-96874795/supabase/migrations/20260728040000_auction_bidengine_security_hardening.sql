-- ============================================================================
-- Correção P0-4 (auditoria 2026-07-28): bypass do motor de lances de leilão.
--
-- Estado confirmado ao vivo antes desta migration:
--   - place_auction_bid vigente é a versão SIMPLES: sem SET search_path,
--     sem anti-self-bid, sem rate-limit, sem proxy/auto-bid, sem
--     notificação de outbid. A versão "v3 enterprise" descrita em
--     20260723_auction_enterprise_security_bidengine_oficial.sql nunca
--     substituiu essa — a própria migration 20260727012000 documenta que
--     a aplicação de 23/07 falhou por bug de nome de coluna
--     (auction_events.auction_listing_id, não listing_id — confirmado
--     agora; e auction_financial_rules.module, não scope).
--   - authenticated tem GRANT de INSERT/UPDATE/DELETE direto em
--     auction_bids, auction_listings, auction_events, auction_fraud_alerts
--     e arremate_offers.
--   - A policy `bids_insert_own` (WITH CHECK auth.uid()=user_id) está ativa
--     em auction_bids: qualquer usuário autenticado pode inserir um lance
--     direto na tabela, sem passar por place_auction_bid — bypassando
--     grade de incremento, self-bid, rate-limit.
--   - auction_fraud_alerts: SELECT USING(true) (qualquer um lê
--     suspect_user_id/IP de todos os alertas) e INSERT WITH CHECK(true)
--     (qualquer um insere alerta falso).
--   - log_auction_fraud é SECURITY DEFINER sem SET search_path e sem
--     nenhuma checagem de autorização no corpo.
--   - 8 funções SECURITY DEFINER do módulo sem search_path fixado:
--     place_auction_bid, create_auction_listing, delete_auction_listing,
--     respond_arremate_offer, create_auction_listing_v2,
--     accept_arremate_offer_advertiser, submit_arremate_offer,
--     log_auction_fraud.
--   - arremate_offers NÃO tem policy de INSERT ativa hoje (só SELECT) —
--     escrita direta já depende só do GRANT (revogado abaixo).
--
-- Correção:
--   1. place_auction_bid recebe anti-self-bid + rate-limit (usando as
--      colunas reais de auction_bid_rate: listing_id, user_id,
--      window_start, hits) + SET search_path, preservando a grade de
--      incremento e o lock (FOR UPDATE) já corretos na versão vigente.
--   2. REVOKE de INSERT/UPDATE/DELETE de authenticated nas 5 tabelas —
--      escrita passa a ser exclusivamente via RPC SECURITY DEFINER.
--   3. DROP da policy bids_insert_own (escrita direta eliminada).
--   4. auction_fraud_alerts: RLS restrita a admin (is_admin()); INSERT
--      direto bloqueado (só via RPC/service_role).
--   5. log_auction_fraud recebe SET search_path + checagem de autorização
--      (chamador deve ser admin ou service_role — evita forja de alertas
--      contra terceiros por qualquer autenticado).
--   6. SET search_path nas demais 7 funções SECURITY DEFINER sem esse
--      fixador.
-- ============================================================================

BEGIN;

-- 1) place_auction_bid com anti-self-bid + rate-limit + search_path,
--    preservando grade de incremento e lock já corretos.
CREATE OR REPLACE FUNCTION public.place_auction_bid(p_listing_id uuid, p_amount_cents integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_listing record;
  v_bid_id uuid;
  v_user_id uuid := auth.uid();
  v_current_bid_cents integer;
  v_min_increment_cents integer;
  v_starting_cents integer;
  v_next_min_cents integer;
  v_store_user uuid; v_store_nome text; v_store_email text;
  v_bidder_email text;
  v_rate_hits int;
BEGIN
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'code', 'not_authenticated', 'error', 'Não autenticado');
  END IF;

  SELECT * INTO v_listing FROM public.auction_listings WHERE id = p_listing_id FOR UPDATE;
  IF v_listing IS NULL THEN RETURN jsonb_build_object('success', false, 'error', 'Leilão não encontrado'); END IF;
  IF v_listing.status != 'active' THEN RETURN jsonb_build_object('success', false, 'error', 'Leilão não está ativo'); END IF;
  IF v_listing.ends_at < now() THEN RETURN jsonb_build_object('success', false, 'error', 'Leilão encerrado'); END IF;

  -- Anti-self-bid: dono do leilão não pode dar lance no próprio leilão
  -- (causa raiz do P0-3 corrigido em 20260728020000 dependia disto para
  -- nunca acontecer via RPC — mas o INSERT direto, agora revogado abaixo,
  -- ainda permitia. Esta checagem fecha o caminho pela própria RPC).
  IF v_listing.owner_user_id IS NOT NULL AND v_user_id = v_listing.owner_user_id THEN
    RETURN jsonb_build_object('success', false, 'code', 'self_bid', 'error', 'Você não pode dar lance no seu próprio leilão');
  END IF;

  -- Rate-limit: máx. 5 lances por usuário/listing a cada janela de 10s.
  INSERT INTO public.auction_bid_rate (listing_id, user_id, window_start, hits)
  VALUES (p_listing_id, v_user_id, date_trunc('second', now()) - (extract(second from now())::int % 10) * interval '1 second', 1)
  ON CONFLICT (listing_id, user_id, window_start) DO UPDATE SET hits = public.auction_bid_rate.hits + 1
  RETURNING hits INTO v_rate_hits;
  IF v_rate_hits > 5 THEN
    RETURN jsonb_build_object('success', false, 'code', 'rate_limited', 'error', 'Muitos lances em pouco tempo — aguarde alguns segundos');
  END IF;

  v_current_bid_cents   := COALESCE((v_listing.current_bid       * 100)::integer, 0);
  v_starting_cents      := COALESCE((v_listing.starting_bid      * 100)::integer, 0);
  v_min_increment_cents := COALESCE((v_listing.minimum_increment * 100)::integer, 100);
  IF v_min_increment_cents <= 0 THEN v_min_increment_cents := 100; END IF;

  -- Próximo lance mínimo VÁLIDO = primeiro ponto da grade (lance_inicial + k*incremento)
  -- que seja >= (lance atual + incremento). Robusto mesmo se o atual estiver fora da grade
  -- (leilões antigos anteriores a esta regra).
  v_next_min_cents := v_starting_cents
    + CEIL(
        GREATEST(v_current_bid_cents + v_min_increment_cents - v_starting_cents, v_min_increment_cents)::numeric
        / v_min_increment_cents
      )::integer * v_min_increment_cents;

  -- 1) não pode ser inferior ao mínimo permitido
  IF p_amount_cents < v_next_min_cents THEN
    RETURN jsonb_build_object(
      'success', false, 'code', 'below_min',
      'error', 'Lance abaixo do mínimo permitido.',
      'next_min_cents', v_next_min_cents, 'increment_cents', v_min_increment_cents);
  END IF;

  -- 2) deve respeitar o incremento (múltiplo exato a partir do lance inicial)
  IF ((p_amount_cents - v_starting_cents) % v_min_increment_cents) <> 0 THEN
    RETURN jsonb_build_object(
      'success', false, 'code', 'off_grid',
      'error', 'O lance deve respeitar o incremento configurado.',
      'next_min_cents', v_next_min_cents, 'increment_cents', v_min_increment_cents);
  END IF;

  UPDATE public.auction_bids SET is_winning = false WHERE listing_id = p_listing_id AND is_winning = true;
  INSERT INTO public.auction_bids (listing_id, user_id, amount_cents, is_winning)
  VALUES (p_listing_id, v_user_id, p_amount_cents, true) RETURNING id INTO v_bid_id;
  UPDATE public.auction_listings SET
    current_bid = (p_amount_cents::numeric / 100), total_bids = COALESCE(total_bids, 0) + 1, updated_at = now()
  WHERE id = p_listing_id;

  -- ── NOTIFICAÇÃO AOS 2 LADOS (enfileira; a edge envia os e-mails) ──
  BEGIN
    SELECT ms.user_id, ms.nome_loja INTO v_store_user, v_store_nome
      FROM merchant_stores ms WHERE ms.id = v_listing.store_id;
    SELECT email INTO v_store_email FROM auth.users WHERE id = coalesce(v_store_user, v_listing.owner_user_id);
    SELECT email INTO v_bidder_email FROM auth.users WHERE id = v_user_id;

    PERFORM enqueue_notification_event(
      'auction_bid', 'auction_bids', v_bid_id, NULL, v_listing.city,
      jsonb_build_object(
        'source', 'auction_bid',
        'listing_id', p_listing_id,
        'listing_title', v_listing.title,
        'amount', (p_amount_cents::numeric / 100),
        'city', v_listing.city,
        'store_user_id', coalesce(v_store_user, v_listing.owner_user_id),
        'store_name', v_store_nome,
        'store_email', v_store_email,
        'bidder_user_id', v_user_id,
        'bidder_email', v_bidder_email
      ));
  EXCEPTION WHEN others THEN
    NULL;
  END;

  -- next_min_cents no sucesso = próximo ponto da grade acima deste lance
  RETURN jsonb_build_object('success', true, 'bid_id', v_bid_id, 'amount_cents', p_amount_cents,
    'next_min_cents', p_amount_cents + v_min_increment_cents, 'increment_cents', v_min_increment_cents);
END;
$function$;

-- auction_bid_rate precisa de UNIQUE (listing_id, user_id, window_start)
-- para o ON CONFLICT acima funcionar — cria se ainda não existir.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'auction_bid_rate_uk'
  ) THEN
    ALTER TABLE public.auction_bid_rate
      ADD CONSTRAINT auction_bid_rate_uk UNIQUE (listing_id, user_id, window_start);
  END IF;
END $$;

-- 2) Revoga escrita direta de authenticated — escrita só via RPC SECURITY DEFINER.
REVOKE INSERT, UPDATE, DELETE ON public.auction_bids FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.auction_listings FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.auction_events FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.auction_fraud_alerts FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.arremate_offers FROM authenticated;

-- 3) Remove a policy que permitia INSERT direto em auction_bids.
DROP POLICY IF EXISTS bids_insert_own ON public.auction_bids;

-- 4) auction_fraud_alerts: restringe a admin; nenhum INSERT direto.
DROP POLICY IF EXISTS "Apenas admin visualiza alertas de fraude" ON public.auction_fraud_alerts;
DROP POLICY IF EXISTS "Apenas service_role ou auth pode inserir alertas" ON public.auction_fraud_alerts;

CREATE POLICY auction_fraud_alerts_admin_read ON public.auction_fraud_alerts
  FOR SELECT USING (public.is_admin());
-- Sem policy de INSERT/UPDATE/DELETE para authenticated/anon — escrita
-- só via service_role (grant já concedido) ou via log_auction_fraud
-- (SECURITY DEFINER, corrigida abaixo).

-- 5) log_auction_fraud: search_path + checagem de autorização.
CREATE OR REPLACE FUNCTION public.log_auction_fraud(
  p_auction_listing_id uuid,
  p_suspect_user_id uuid,
  p_alert_type text,
  p_severity text,
  p_details jsonb,
  p_ip_address text DEFAULT NULL::text
)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_alert_id UUID;
BEGIN
    IF coalesce(auth.role(), '') <> 'service_role' AND NOT public.is_admin() THEN
        RAISE EXCEPTION 'log_auction_fraud: acesso negado';
    END IF;

    INSERT INTO public.auction_fraud_alerts (
        auction_listing_id, suspect_user_id, alert_type, severity, details, ip_address
    ) VALUES (
        p_auction_listing_id, p_suspect_user_id, p_alert_type, p_severity, p_details, p_ip_address
    ) RETURNING id INTO v_alert_id;

    INSERT INTO public.auction_events (
        auction_listing_id, event_type, event_payload, user_id, ip_address, origin
    ) VALUES (
        p_auction_listing_id,
        'FRAUD_ALERT_GENERATED',
        jsonb_build_object(
            'alert_id', v_alert_id,
            'alert_type', p_alert_type,
            'severity', p_severity
        ) || p_details,
        p_suspect_user_id,
        p_ip_address,
        'SYSTEM_IA'
    );

    RETURN v_alert_id;
END;
$function$;

-- 6) SET search_path nas demais funções SECURITY DEFINER do módulo que
--    estavam sem esse fixador (hardening contra search_path hijacking).
ALTER FUNCTION public.create_auction_listing(
  uuid, text, text, text, numeric, numeric, numeric, numeric, text, text, text, integer, uuid, text,
  timestamp with time zone, timestamp with time zone, text
) SET search_path TO 'public';

ALTER FUNCTION public.delete_auction_listing(uuid) SET search_path TO 'public';

ALTER FUNCTION public.respond_arremate_offer(uuid, boolean, text) SET search_path TO 'public';

ALTER FUNCTION public.create_auction_listing_v2(
  text, numeric, text, text, text, numeric, integer, timestamp with time zone,
  timestamp with time zone, text, uuid, uuid, text, text
) SET search_path TO 'public';

ALTER FUNCTION public.accept_arremate_offer_advertiser(uuid, uuid) SET search_path TO 'public';

ALTER FUNCTION public.submit_arremate_offer(uuid, integer, text) SET search_path TO 'public';

COMMIT;

-- ROLLBACK (documentado, não executado):
-- BEGIN;
-- GRANT INSERT, UPDATE, DELETE ON public.auction_bids, public.auction_listings,
--   public.auction_events, public.auction_fraud_alerts, public.arremate_offers TO authenticated;
-- CREATE POLICY bids_insert_own ON public.auction_bids FOR INSERT WITH CHECK (auth.uid() = user_id);
-- DROP POLICY IF EXISTS auction_fraud_alerts_admin_read ON public.auction_fraud_alerts;
-- CREATE POLICY "Apenas admin visualiza alertas de fraude" ON public.auction_fraud_alerts FOR SELECT USING (true);
-- CREATE POLICY "Apenas service_role ou auth pode inserir alertas" ON public.auction_fraud_alerts FOR INSERT WITH CHECK (true);
-- -- (recriar place_auction_bid e log_auction_fraud com os corpos anteriores)
-- COMMIT;
