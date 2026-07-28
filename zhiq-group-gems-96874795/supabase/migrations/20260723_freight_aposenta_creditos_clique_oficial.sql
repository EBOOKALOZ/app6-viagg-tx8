-- ============================================================================
-- FRETES - FIM DA COBRANCA POR CLIQUE (CPC) + TELEMETRIA OFICIAL  ::  2026-07-23
-- ----------------------------------------------------------------------------
-- CERTIFICACAO ORION - Fase 7 (motor financeiro oficial unico).
-- Espelho de 20260723_travel_aposenta_creditos_oficial.sql para Fretes.
--
-- A auditoria encontrou 2 RPCs legadas AINDA CHAMADAS pelo front
-- (FreightDetailPage): charge_freight_listing_click (visita) e
-- charge_freight_interest_click (interesse). Ambas debitavam creditos do DONO
-- por clique - modelo conflitante com o oficial (comissao % SO ao abrir
-- contato) e, sendo executaveis por anon, um vetor de drenagem de creditos.
--
-- Esta migration:
--  1) Desativa as regras de custo fixo (freight_listing_click / _interest_click).
--  2) REVOKE + COMMENT deprecated nas RPCs charge_freight_*_click.
--  3) Cria freight_track_event: telemetria SEM debito (visita/interesse),
--     preservando as metricas do painel do anunciante.
--  4) Policy de leitura das metricas para o dono do anuncio.
--
-- O front (FreightDetailPage) deixa de chamar as RPCs de cobranca e passa a
-- chamar freight_track_event (mudanca de codigo nesta mesma entrega).
-- Nada e dropado (historico preservado). Nao altera wallet_unlock_contact/pay_*.
-- Idempotente. Depende de 20260622_freight_credit_wallet.sql (click_log) e
-- 20260622_freight_listings_base.sql.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1) Regras de custo fixo em creditos: DESATIVAR
-- ----------------------------------------------------------------------------
UPDATE public.merchant_credit_usage_rules
   SET is_active = false
 WHERE feature_code IN ('freight_listing_click', 'freight_interest_click');

-- ----------------------------------------------------------------------------
-- 2) RPCs legadas de clique: REVOKE + deprecated (padrao AI-75.3)
-- ----------------------------------------------------------------------------
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p
    WHERE p.pronamespace = 'public'::regnamespace
      AND p.proname IN ('charge_freight_listing_click', 'charge_freight_interest_click')
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated', r.sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', r.sig);
    EXECUTE format($c$COMMENT ON FUNCTION %s IS 'DEPRECATED (2026-07-23): modulo Fretes migrado para o motor oficial (comissao %% em R$ SO ao Aceitar Servico e Abrir Contato, carteira pay_*). Cliques agora sao telemetria sem debito via freight_track_event. NAO usar em fluxo novo.'$c$, r.sig);
  END LOOP;
END $$;

-- ----------------------------------------------------------------------------
-- 3) Telemetria sem debito: freight_track_event
--    freight_listing_click_log era so de dedup de clique cobrado; passa a ser
--    o log oficial de visualizacoes e interesses, sem dinheiro envolvido.
-- ----------------------------------------------------------------------------
ALTER TABLE public.freight_listing_click_log
  ADD COLUMN IF NOT EXISTS event_type text NOT NULL DEFAULT 'listing_click';

CREATE INDEX IF NOT EXISTS idx_freight_click_log_listing_event
  ON public.freight_listing_click_log (listing_id, event_type, created_at DESC);

CREATE OR REPLACE FUNCTION public.freight_track_event(
  p_listing_id uuid,
  p_event text,
  p_fingerprint text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_exists boolean;
BEGIN
  IF p_event NOT IN ('listing_click', 'interest_click') THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid_event');
  END IF;
  IF p_fingerprint IS NULL OR length(trim(p_fingerprint)) < 6 THEN
    RETURN jsonb_build_object('success', false, 'error', 'fingerprint_required');
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.freight_listings
    WHERE id = p_listing_id AND visibility_status = 'published'
  ) INTO v_exists;
  IF NOT v_exists THEN
    RETURN jsonb_build_object('success', false, 'error', 'listing_not_found');
  END IF;

  -- O dono nao conta a propria visita/interesse.
  IF auth.uid() IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.freight_listings
    WHERE id = p_listing_id AND owner_user_id = auth.uid()
  ) THEN
    RETURN jsonb_build_object('success', true, 'counted', false, 'reason', 'owner_view');
  END IF;

  -- Dedup: 1 evento por (anuncio, tipo, fingerprint) a cada 60 min.
  IF EXISTS (
    SELECT 1 FROM public.freight_listing_click_log
    WHERE listing_id = p_listing_id
      AND event_type = p_event
      AND fingerprint = p_fingerprint
      AND created_at > now() - interval '60 minutes'
  ) THEN
    RETURN jsonb_build_object('success', true, 'counted', false, 'reason', 'dedup');
  END IF;

  INSERT INTO public.freight_listing_click_log (listing_id, fingerprint, charged, event_type)
  VALUES (p_listing_id, p_fingerprint, false, p_event);

  RETURN jsonb_build_object('success', true, 'counted', true);
END;
$$;

-- Telemetria pura (sem debito) - pode ser chamada por visitantes.
GRANT EXECUTE ON FUNCTION public.freight_track_event(uuid, text, text) TO anon, authenticated;

-- ----------------------------------------------------------------------------
-- 4) Dono le as metricas dos proprios anuncios
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS freight_click_log_owner_read ON public.freight_listing_click_log;
CREATE POLICY freight_click_log_owner_read ON public.freight_listing_click_log
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.freight_listings fl
      WHERE fl.id = listing_id AND fl.owner_user_id = auth.uid()
    )
    OR public.is_admin()
  );

SELECT pg_notify('pgrst', 'reload schema');

-- ----------------------------------------------------------------------------
-- VERIFICACAO (esperado: regras_ativas=0, rpcs_legadas_exec_auth=0,
--             track_event_ok=1, policy_log_ok=1)
-- ----------------------------------------------------------------------------
SELECT
  (SELECT count(*)::int FROM public.merchant_credit_usage_rules
    WHERE feature_code IN ('freight_listing_click','freight_interest_click') AND is_active) AS regras_ativas,
  (SELECT count(*)::int FROM pg_proc p
    WHERE p.pronamespace='public'::regnamespace
      AND p.proname IN ('charge_freight_listing_click','charge_freight_interest_click')
      AND (has_function_privilege('authenticated', p.oid, 'EXECUTE')
        OR has_function_privilege('anon', p.oid, 'EXECUTE'))) AS rpcs_legadas_exec_auth,
  (SELECT count(*)::int FROM pg_proc p
    WHERE p.pronamespace='public'::regnamespace AND p.proname='freight_track_event') AS track_event_ok,
  (SELECT count(*)::int FROM pg_policies
    WHERE tablename='freight_listing_click_log' AND policyname='freight_click_log_owner_read') AS policy_log_ok;
