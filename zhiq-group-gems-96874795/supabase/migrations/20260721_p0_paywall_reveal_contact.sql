-- ============================================================
-- P0 — PAYWALL INVIOLÁVEL + LGPD · wallet_reveal_contact · 2026-07-21
--
-- Auditoria 07-20: advertiser_contact_intentions.visitor_phone em TEXTO PURO
-- com RLS por posse → anunciante lia o telefone via REST sem pagar (23 linhas,
-- 0 cobranças). Correção "Backend First":
--   1) lockdown de COLUNA: authenticated só enxerga colunas não-PII (SELECT
--      por lista de colunas; select("*") passa a falhar por design);
--   2) masked_preview backfill + trigger (máscara nasce no SERVIDOR);
--   3) porta única wallet_reveal_contact(p_intention_id): valida dono →
--      REUSA wallet_unlock_contact (não duplica cobrança/lógica) → loga →
--      só então devolve o telefone. Falhou a cobrança → NUNCA devolve PII.
--   4) log completo orion_contact_reveal_log (ip/ua/latência/resultado).
-- NÃO altera: wallet_unlock_contact, percentuais, commission_policy, ledger,
-- wallets, pay_*. Idempotente. SQL Editor (broifhfqmnzqoongtokm).
-- ============================================================

-- Gate defensivo
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
                 WHERE n.nspname='public' AND p.proname='wallet_unlock_contact') THEN
    RAISE EXCEPTION 'wallet_unlock_contact não existe — abortando (reveal depende dele)';
  END IF;
END $$;

-- ── 1) Máscara server-side: backfill + trigger ─────────────────────────────
UPDATE public.advertiser_contact_intentions
   SET masked_preview = CASE
     WHEN length(regexp_replace(coalesce(visitor_phone,''), '\D', '', 'g')) >= 4
       THEN '•••• ' || right(regexp_replace(visitor_phone, '\D', '', 'g'), 4)
     ELSE '••••'
   END
 WHERE masked_preview IS NULL OR masked_preview = '';

CREATE OR REPLACE FUNCTION public.aci_fill_masked_preview()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.masked_preview := CASE
    WHEN length(regexp_replace(coalesce(NEW.visitor_phone,''), '\D', '', 'g')) >= 4
      THEN '•••• ' || right(regexp_replace(NEW.visitor_phone, '\D', '', 'g'), 4)
    ELSE '••••'
  END;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS tg_aci_masked_preview ON public.advertiser_contact_intentions;
CREATE TRIGGER tg_aci_masked_preview
  BEFORE INSERT OR UPDATE OF visitor_phone ON public.advertiser_contact_intentions
  FOR EACH ROW EXECUTE FUNCTION public.aci_fill_masked_preview();

-- ── 2) LOCKDOWN DE COLUNA (o coração do fix) ───────────────────────────────
-- Revoga o SELECT de tabela e concede APENAS colunas não-PII. A partir daqui,
-- select("*") e select('visitor_phone') falham para o cliente — mesmo dono.
-- INSERT/UPDATE/DELETE ficam como estão (fluxos de captura não mudam).
REVOKE SELECT ON public.advertiser_contact_intentions FROM anon, authenticated;
GRANT SELECT (id, created_at, listing_module, listing_id, advertiser_user_id,
              interest_type, masked_preview, city, region, status, credits_cost,
              unlock_paid_at, notified_at, opened_at)
  ON public.advertiser_contact_intentions TO authenticated;

-- ── 3) Log de revelação ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.orion_contact_reveal_log (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        uuid NOT NULL,
  intention_id   uuid NOT NULL,
  listing_module text NOT NULL,
  listing_id     uuid,
  buyer_key      text,
  charged_cents  bigint NOT NULL DEFAULT 0,
  wallet_result  jsonb NOT NULL DEFAULT '{}'::jsonb,
  resultado      text NOT NULL,              -- revealed | already_unlocked | charge_failed | denied
  ip             text,
  user_agent     text,
  latency_ms     integer,
  criado_em      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_ocrl_user ON public.orion_contact_reveal_log (user_id, criado_em DESC);
ALTER TABLE public.orion_contact_reveal_log ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.orion_contact_reveal_log FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.orion_contact_reveal_log TO authenticated;
GRANT ALL ON public.orion_contact_reveal_log TO service_role;
DROP POLICY IF EXISTS ocrl_select_own ON public.orion_contact_reveal_log;
CREATE POLICY ocrl_select_own ON public.orion_contact_reveal_log
  FOR SELECT TO authenticated USING (user_id = auth.uid());

-- ── 4) PORTA ÚNICA: wallet_reveal_contact ──────────────────────────────────
CREATE OR REPLACE FUNCTION public.wallet_reveal_contact(
  p_intention_id uuid,
  p_value_hint_cents bigint DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid       uuid := auth.uid();
  v_t0        timestamptz := clock_timestamp();
  v_i         public.advertiser_contact_intentions%ROWTYPE;
  v_buyer_key text;
  v_unlock    jsonb := '{}'::jsonb;
  v_charged   bigint := 0;
  v_already   boolean := false;
  v_ip        text;
  v_ua        text;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '42501';
  END IF;

  BEGIN
    v_ip := current_setting('request.headers', true)::jsonb->>'x-forwarded-for';
    v_ua := current_setting('request.headers', true)::jsonb->>'user-agent';
  EXCEPTION WHEN OTHERS THEN v_ip := NULL; v_ua := NULL; END;

  SELECT * INTO v_i FROM public.advertiser_contact_intentions WHERE id = p_intention_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'intention_not_found');
  END IF;
  IF v_i.advertiser_user_id IS DISTINCT FROM v_uid THEN
    INSERT INTO public.orion_contact_reveal_log (user_id, intention_id, listing_module, listing_id, resultado, ip, user_agent, latency_ms)
    VALUES (v_uid, p_intention_id, coalesce(v_i.listing_module,'?'), v_i.listing_id, 'denied', v_ip, v_ua,
            (extract(epoch FROM clock_timestamp() - v_t0) * 1000)::int);
    RETURN jsonb_build_object('success', false, 'error', 'not_owner');
  END IF;

  -- buyer_key derivado NO SERVIDOR (o cliente não vê mais o telefone)
  v_buyer_key := nullif(regexp_replace(coalesce(v_i.visitor_phone,''), '\D', '', 'g'), '');
  IF v_buyer_key IS NULL THEN v_buyer_key := v_i.id::text; END IF;

  -- já pago? fonte de verdade = dedup permanente do próprio unlock
  SELECT true INTO v_already FROM public.orion_marketplace_contact_charges
   WHERE listing_module = v_i.listing_module AND listing_id = v_i.listing_id AND buyer_key = v_buyer_key
   LIMIT 1;
  v_already := coalesce(v_already, false);

  IF NOT v_already THEN
    -- REUSA o ponto único de cobrança (sem duplicar lógica)
    v_unlock := public.wallet_unlock_contact(v_i.listing_module, v_i.listing_id, v_buyer_key, p_value_hint_cents);
    IF coalesce((v_unlock->>'success')::boolean, false) IS NOT TRUE
       AND coalesce((v_unlock->>'already_unlocked')::boolean, false) IS NOT TRUE THEN
      INSERT INTO public.orion_contact_reveal_log
        (user_id, intention_id, listing_module, listing_id, buyer_key, charged_cents, wallet_result, resultado, ip, user_agent, latency_ms)
      VALUES (v_uid, v_i.id, v_i.listing_module, v_i.listing_id, v_buyer_key, 0, v_unlock, 'charge_failed', v_ip, v_ua,
              (extract(epoch FROM clock_timestamp() - v_t0) * 1000)::int);
      -- cobrança falhou → devolve o erro do motor, SEM nenhum dado pessoal
      RETURN v_unlock;
    END IF;
    v_charged := coalesce((v_unlock->>'charged_cents')::bigint, 0);
  END IF;

  UPDATE public.advertiser_contact_intentions
     SET status = 'unlocked', unlock_paid_at = coalesce(unlock_paid_at, now())
   WHERE id = v_i.id;

  INSERT INTO public.orion_contact_reveal_log
    (user_id, intention_id, listing_module, listing_id, buyer_key, charged_cents, wallet_result, resultado, ip, user_agent, latency_ms)
  VALUES (v_uid, v_i.id, v_i.listing_module, v_i.listing_id, v_buyer_key, v_charged, v_unlock,
          CASE WHEN v_already THEN 'already_unlocked' ELSE 'revealed' END, v_ip, v_ua,
          (extract(epoch FROM clock_timestamp() - v_t0) * 1000)::int);

  -- ÚNICO ponto do sistema que devolve a PII — e só depois da autorização financeira
  RETURN jsonb_build_object(
    'success', true,
    'already_unlocked', v_already,
    'permanent', true,
    'charged_cents', v_charged,
    'visitor_name', v_i.visitor_name,
    'visitor_phone', v_i.visitor_phone,
    'visitor_message', v_i.visitor_message,
    'whatsapp_url', CASE
      WHEN nullif(regexp_replace(coalesce(v_i.visitor_phone,''), '\D', '', 'g'), '') IS NOT NULL
      THEN 'https://wa.me/55' || regexp_replace(v_i.visitor_phone, '\D', '', 'g')
    END
  );
END $$;

REVOKE ALL ON FUNCTION public.wallet_reveal_contact(uuid, bigint) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.wallet_reveal_contact(uuid, bigint) TO authenticated, service_role;

-- ── 5) Verificação ─────────────────────────────────────────────────────────
-- Esperado: fn=1 · col_pii_grants=0 (nenhum grant de SELECT em visitor_phone/name/message
-- p/ anon|authenticated) · masked_sem_valor=0 · trigger=1
SELECT
  (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND p.proname='wallet_reveal_contact')                        AS fn,
  (SELECT count(*) FROM information_schema.column_privileges
    WHERE table_schema='public' AND table_name='advertiser_contact_intentions'
      AND column_name IN ('visitor_phone','visitor_name','visitor_message')
      AND grantee IN ('anon','authenticated') AND privilege_type='SELECT')                 AS col_pii_grants,
  (SELECT count(*) FROM public.advertiser_contact_intentions
    WHERE masked_preview IS NULL OR masked_preview='')                                     AS masked_sem_valor,
  (SELECT count(*) FROM pg_trigger WHERE tgname='tg_aci_masked_preview')                   AS trigger;
