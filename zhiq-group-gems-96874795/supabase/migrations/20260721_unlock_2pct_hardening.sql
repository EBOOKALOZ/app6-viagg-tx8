-- ============================================================
-- UNLOCK 2% — HARDENING PÓS-AUDITORIA (C2/C3/C6/C7) · 2026-07-21
-- ------------------------------------------------------------
-- Correções da auditoria do débito de 2% por interessado:
--  C2: remove orion_commission_policy.applies_to (config morta — nenhum
--      leitor no código; política é GLOBAL para todos os módulos).
--  C3: DESATIVA o Wallet Core legado (wallets/wallet_transactions):
--      REVOKE por catálogo + COMMENT deprecated. Zero chamadores no front
--      (auditado). Histórico intacto; fns SECURITY DEFINER internas seguem
--      funcionando (owner bypassa grants).
--  C6: rate limit anti-spam em advertiser_contact_intentions (INSERT
--      público): por telefone 5/h e 20/dia; por telefone+anúncio 3/dia;
--      por IP 30/h. Inserts internos (sem request.headers) ficam isentos.
--  C7: reconciliação Σ charges = Σ ledger(unlock) = Σ crédito plataforma +
--      alerta em notificacoes_admin + 1 job pg_cron diário (04:40).
-- NÃO altera: wallet_unlock_contact/wallet_reveal_contact/pay_* (regra do
-- prompt: arquitetura financeira preservada). Idempotente.
-- SQL Editor (broifhfqmnzqoongtokm).
-- ============================================================

-- ── C2. applies_to: configuração morta → remover ────────────
ALTER TABLE public.orion_commission_policy DROP COLUMN IF EXISTS applies_to;

-- ── C3. Wallet Core legado: REVOKE + deprecated ──────────────
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig, p.proname
    FROM pg_proc p
    WHERE p.pronamespace='public'::regnamespace
      AND p.proname IN ('wallet_credit','wallet_reserve','wallet_confirm',
                        'wallet_cancel','ensure_wallet','admin_wallet_credit',
                        'wallet_migrate_legacy_balances')
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated', r.sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', r.sig);
    EXECUTE format($c$COMMENT ON FUNCTION %s IS 'DEPRECATED (AI-75.3, 2026-07-21): Wallet Core desativado — carteira oficial = pay_financial_accounts/pay_ledger_entries. NÃO usar em fluxo novo.'$c$, r.sig);
  END LOOP;
END $$;

REVOKE ALL ON TABLE public.wallets             FROM anon, authenticated;
REVOKE ALL ON TABLE public.wallet_transactions FROM anon, authenticated;
COMMENT ON TABLE public.wallets             IS 'DEPRECATED (AI-75.3, 2026-07-21): Wallet Core desativado. 0 transações históricas. Carteira oficial = pay_financial_accounts.';
COMMENT ON TABLE public.wallet_transactions IS 'DEPRECATED (AI-75.3, 2026-07-21): Wallet Core desativado. Vazia desde a criação. Ledger oficial = pay_ledger_entries.';

-- ── C6. Rate limit anti-spam nas intenções de contato ────────
ALTER TABLE public.advertiser_contact_intentions
  ADD COLUMN IF NOT EXISTS visitor_ip text;

CREATE INDEX IF NOT EXISTS idx_aci_created ON public.advertiser_contact_intentions (created_at DESC);

CREATE OR REPLACE FUNCTION public.aci_rate_limit()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_headers jsonb; v_ip text; v_phone text;
  v_por_fone_hora int; v_por_fone_dia int; v_por_fone_anuncio int; v_por_ip_hora int;
BEGIN
  -- Requisição direta (PostgREST) tem request.headers; inserts internos ficam isentos
  BEGIN
    v_headers := current_setting('request.headers', true)::jsonb;
  EXCEPTION WHEN OTHERS THEN v_headers := NULL; END;
  IF v_headers IS NULL THEN RETURN NEW; END IF;

  v_ip := split_part(coalesce(v_headers->>'x-forwarded-for',''), ',', 1);
  NEW.visitor_ip := nullif(v_ip, '');
  v_phone := nullif(regexp_replace(coalesce(NEW.visitor_phone,''), '\D', '', 'g'), '');

  IF v_phone IS NOT NULL THEN
    SELECT count(*) INTO v_por_fone_hora FROM public.advertiser_contact_intentions
     WHERE regexp_replace(coalesce(visitor_phone,''), '\D', '', 'g') = v_phone
       AND created_at > now() - interval '1 hour';
    IF v_por_fone_hora >= 5 THEN
      RAISE EXCEPTION 'rate_limited: máximo de 5 interesses por hora para este telefone';
    END IF;

    SELECT count(*) INTO v_por_fone_dia FROM public.advertiser_contact_intentions
     WHERE regexp_replace(coalesce(visitor_phone,''), '\D', '', 'g') = v_phone
       AND created_at > now() - interval '24 hours';
    IF v_por_fone_dia >= 20 THEN
      RAISE EXCEPTION 'rate_limited: máximo de 20 interesses por dia para este telefone';
    END IF;

    SELECT count(*) INTO v_por_fone_anuncio FROM public.advertiser_contact_intentions
     WHERE regexp_replace(coalesce(visitor_phone,''), '\D', '', 'g') = v_phone
       AND listing_id IS NOT DISTINCT FROM NEW.listing_id
       AND created_at > now() - interval '24 hours';
    IF v_por_fone_anuncio >= 3 THEN
      RAISE EXCEPTION 'rate_limited: este telefone já registrou interesse neste anúncio hoje';
    END IF;
  END IF;

  IF NEW.visitor_ip IS NOT NULL THEN
    SELECT count(*) INTO v_por_ip_hora FROM public.advertiser_contact_intentions
     WHERE visitor_ip = NEW.visitor_ip AND created_at > now() - interval '1 hour';
    IF v_por_ip_hora >= 30 THEN
      RAISE EXCEPTION 'rate_limited: muitas solicitações deste endereço — tente mais tarde';
    END IF;
  END IF;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS tg_aci_rate_limit ON public.advertiser_contact_intentions;
CREATE TRIGGER tg_aci_rate_limit
  BEFORE INSERT ON public.advertiser_contact_intentions
  FOR EACH ROW EXECUTE FUNCTION public.aci_rate_limit();

-- visitor_ip é dado técnico — NÃO expor ao SELECT do authenticated
-- (o GRANT por coluna do P0 permanece como está; nenhuma coluna nova concedida)

-- ── C7. Reconciliação financeira diária ──────────────────────
CREATE OR REPLACE FUNCTION public.unlock_reconcile()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_charges_cents bigint; v_ledger_debit_cents bigint; v_ledger_credit_cents bigint;
  v_ok boolean; v_res jsonb;
BEGIN
  -- Σ cobranças registradas no dedup (fonte: valor REAL cobrado)
  SELECT COALESCE(sum(round(product_value_brl*100)),0)::bigint INTO v_charges_cents
    FROM public.orion_marketplace_contact_charges WHERE credits_charged IS NOT NULL;

  -- Σ ledger: débitos dos vendedores e créditos da plataforma no escopo unlock
  SELECT COALESCE(sum(round(amount*100)),0)::bigint INTO v_ledger_debit_cents
    FROM public.pay_ledger_entries
   WHERE idempotency_key LIKE 'unlock:%' AND direction='debit';
  SELECT COALESCE(sum(round(amount*100)),0)::bigint INTO v_ledger_credit_cents
    FROM public.pay_ledger_entries
   WHERE idempotency_key LIKE 'unlock:%' AND direction='credit';

  v_ok := (v_charges_cents = v_ledger_debit_cents AND v_ledger_debit_cents = v_ledger_credit_cents);
  v_res := jsonb_build_object(
    'ok', v_ok, 'charges_cents', v_charges_cents,
    'ledger_debit_cents', v_ledger_debit_cents, 'ledger_credit_cents', v_ledger_credit_cents,
    'checked_at', now());

  IF NOT v_ok THEN
    INSERT INTO public.notificacoes_admin (tipo, mensagem, dados)
    VALUES ('unlock_reconcile_divergencia',
            'DIVERGÊNCIA no débito de 2%: Σ cobranças ≠ Σ ledger — investigar imediatamente',
            v_res);
  END IF;
  RETURN v_res;
END $$;
REVOKE ALL ON FUNCTION public.unlock_reconcile() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.unlock_reconcile() TO service_role;

-- 1 job diário às 04:40 UTC (frota pausada permanece pausada — carga mínima)
DO $$
BEGIN
  PERFORM cron.unschedule('unlock-reconcile-daily');
EXCEPTION WHEN OTHERS THEN NULL; END $$;
SELECT cron.schedule('unlock-reconcile-daily', '40 4 * * *', 'SELECT public.unlock_reconcile();');

-- ── VERIFICAÇÃO (esperado: col_applies_to=0 · core_exec_auth=0 ·
--    trigger=1 · cron_job=1 · reconcile ok=true) ───────────────
SELECT
  (SELECT count(*) FROM information_schema.columns
    WHERE table_schema='public' AND table_name='orion_commission_policy'
      AND column_name='applies_to')                                            AS col_applies_to,
  (SELECT count(*) FROM pg_proc p
    WHERE p.pronamespace='public'::regnamespace
      AND p.proname IN ('wallet_credit','wallet_reserve','wallet_confirm',
                        'wallet_cancel','ensure_wallet','admin_wallet_credit',
                        'wallet_migrate_legacy_balances')
      AND has_function_privilege('authenticated', p.oid, 'EXECUTE'))           AS core_exec_auth,
  (SELECT count(*) FROM pg_trigger WHERE tgname='tg_aci_rate_limit')           AS trigger,
  (SELECT count(*) FROM cron.job WHERE jobname='unlock-reconcile-daily')       AS cron_job,
  (SELECT public.unlock_reconcile()->>'ok')                                    AS reconcile_ok;
