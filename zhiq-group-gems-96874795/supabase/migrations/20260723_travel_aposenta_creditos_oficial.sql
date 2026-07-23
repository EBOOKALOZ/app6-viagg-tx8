-- ============================================================
-- VIAGENS — MODELO OFICIAL (% EM REAIS) + FIM DO CRÉDITO LEGADO
-- 2026-07-23 · Espelho de 20260723_freight_unlock_percentual_
-- aposenta_creditos.sql para o módulo Viagens.
-- ------------------------------------------------------------
-- O desbloqueio de leads de viagem já usa a rota ÚNICA
-- wallet_reveal_contact → wallet_unlock_contact (percentual do
-- valor anunciado em R$, orion_commission_policy, carteira pay_*).
--
-- Esta migration aposenta TODA a superfície legada de créditos:
--  1) Desativa as regras de custo fixo travel_unlock_whatsapp,
--     travel_listing_click e travel_interest_click.
--  2) REVOKE + COMMENT deprecated nas RPCs legadas:
--       • unlock_travel_intention   (12 cr — substituída pelo 2%)
--       • feature_travel_listing    (15 cr — destaque agora é via
--         pacotes de divulgação/Mercado Pago, is_promoted)
--       • charge_travel_listing_click / charge_travel_interest_click
--         (CRÍTICO da auditoria: executáveis por ANON, debitavam a
--         carteira do DONO sem checagem de saldo e sem dedup —
--         vetor de drenagem de créditos. Nenhum anônimo pode
--         executar operação financeira.)
--  3) Substitui a telemetria dos cliques por travel_track_event
--     (SEM efeito financeiro), preservando as métricas de
--     visualizações/interesses do painel do anunciante.
--
-- Nada é dropado: travel_credit_balances/ledger/purchases ficam
-- intactos como histórico. Não altera wallet_unlock_contact/pay_*.
-- Idempotente. Aplicar via SQL Editor (broifhfqmnzqoongtokm).
-- ============================================================

-- ── 1. Regras de custo fixo em créditos: DESATIVAR ───────────
UPDATE public.merchant_credit_usage_rules
   SET is_active = false
 WHERE feature_code IN ('travel_unlock_whatsapp', 'travel_listing_click', 'travel_interest_click');

-- ── 2. RPCs legadas: REVOKE + deprecated (padrão AI-75.3) ────
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig, p.proname AS nome
    FROM pg_proc p
    WHERE p.pronamespace = 'public'::regnamespace
      AND p.proname IN (
        'unlock_travel_intention',
        'feature_travel_listing',
        'charge_travel_listing_click',
        'charge_travel_interest_click'
      )
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated', r.sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', r.sig);
    EXECUTE format($c$COMMENT ON FUNCTION %s IS 'DEPRECATED (2026-07-23): módulo Viagens migrado para o motor financeiro oficial (wallet_reveal_contact/wallet_unlock_contact, %% do valor anunciado em R$, carteira pay_*). Cliques agora são telemetria sem débito via travel_track_event. NÃO usar em fluxo novo.'$c$, r.sig);
  END LOOP;
END $$;

-- ── 3. Telemetria sem débito: travel_track_event ─────────────
-- travel_listing_click_log ganha o tipo do evento (a tabela era
-- só de dedup de clique cobrado; agora é o log oficial de
-- visualizações e interesses, sem dinheiro envolvido).
ALTER TABLE public.travel_listing_click_log
  ADD COLUMN IF NOT EXISTS event_type text NOT NULL DEFAULT 'listing_click';

CREATE INDEX IF NOT EXISTS idx_travel_click_log_listing_event
  ON public.travel_listing_click_log (listing_id, event_type, created_at DESC);

CREATE OR REPLACE FUNCTION public.travel_track_event(
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
    SELECT 1 FROM public.travel_listings
    WHERE id = p_listing_id AND visibility_status = 'published'
  ) INTO v_exists;
  IF NOT v_exists THEN
    RETURN jsonb_build_object('success', false, 'error', 'listing_not_found');
  END IF;

  -- O dono não conta a própria visita/interesse.
  IF auth.uid() IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.travel_listings
    WHERE id = p_listing_id AND owner_user_id = auth.uid()
  ) THEN
    RETURN jsonb_build_object('success', true, 'counted', false, 'reason', 'owner_view');
  END IF;

  -- Dedup: 1 evento por (anúncio, tipo, fingerprint) a cada 60 min.
  IF EXISTS (
    SELECT 1 FROM public.travel_listing_click_log
    WHERE listing_id = p_listing_id
      AND event_type = p_event
      AND fingerprint = p_fingerprint
      AND created_at > now() - interval '60 minutes'
  ) THEN
    RETURN jsonb_build_object('success', true, 'counted', false, 'reason', 'dedup');
  END IF;

  INSERT INTO public.travel_listing_click_log (listing_id, fingerprint, charged, event_type)
  VALUES (p_listing_id, p_fingerprint, false, p_event);

  RETURN jsonb_build_object('success', true, 'counted', true);
END;
$$;

-- Telemetria pura (sem débito) — pode ser chamada por visitantes.
GRANT EXECUTE ON FUNCTION public.travel_track_event(uuid, text, text) TO anon, authenticated;

-- ── 4. Dono lê as métricas dos próprios anúncios ─────────────
-- (a tabela tinha RLS ligada sem NENHUMA policy — só o definer
--  escrevia; o painel calculava métricas pelo ledger de créditos,
--  que deixa de crescer com a aposentadoria.)
DROP POLICY IF EXISTS travel_click_log_owner_read ON public.travel_listing_click_log;
CREATE POLICY travel_click_log_owner_read ON public.travel_listing_click_log
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.travel_listings tl
      WHERE tl.id = listing_id AND tl.owner_user_id = auth.uid()
    )
    OR public.is_admin()
  );

SELECT pg_notify('pgrst', 'reload schema');

-- ── VERIFICAÇÃO ──────────────────────────────────────────────
-- Esperado: regras_ativas=0 · rpcs_legadas_exec_auth=0 ·
--           track_event_ok=1 · policy_log_ok=1
SELECT
  (SELECT count(*)::int FROM public.merchant_credit_usage_rules
    WHERE feature_code IN ('travel_unlock_whatsapp','travel_listing_click','travel_interest_click')
      AND is_active) AS regras_ativas,
  (SELECT count(*)::int FROM pg_proc p
    WHERE p.pronamespace='public'::regnamespace
      AND p.proname IN ('unlock_travel_intention','feature_travel_listing',
                        'charge_travel_listing_click','charge_travel_interest_click')
      AND (has_function_privilege('authenticated', p.oid, 'EXECUTE')
        OR has_function_privilege('anon', p.oid, 'EXECUTE'))) AS rpcs_legadas_exec_auth,
  (SELECT count(*)::int FROM pg_proc p
    WHERE p.pronamespace='public'::regnamespace
      AND p.proname='travel_track_event') AS track_event_ok,
  (SELECT count(*)::int FROM pg_policies
    WHERE tablename='travel_listing_click_log'
      AND policyname='travel_click_log_owner_read') AS policy_log_ok;
