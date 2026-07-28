-- ============================================================================
-- FRETES - FASE 6: DEBITO REAL DA COMISSAO NA CARTEIRA OFICIAL  ::  2026-07-23
-- ----------------------------------------------------------------------------
-- CERTIFICACAO ORION - motor financeiro oficial (Wallet + Ledger).
--
-- Problema: a base (20260722_freight_quotes.sql, V2.1) ao "Aceitar Servico e
-- Abrir Contato" apenas REGISTRA a comissao em freight_service_commissions
-- (status 'pendente') via register_freight_commission - NAO move dinheiro. A
-- spec exige cobranca REAL na carteira pay_* (partida dobrada + Ledger) no
-- momento do aceite.
--
-- Esta migration SUBSTITUI (CREATE OR REPLACE) a funcao canonica
-- public.accept_freight_opportunity_unlock(uuid, numeric) - MESMO nome, MESMA
-- tabela de dedup (freight_quote_unlocks), MESMO contrato de retorno que o
-- front ja consome - adicionando o debito real:
--   * pay_get_or_create_account('customer', transportador, 'customer_wallet')
--   * pay_post_transaction(scope 'freight_commission', partida dobrada:
--       debito na carteira do transportador  ->  credito platform_main)
--   * idempotencia via chave 'freight_unlock:<request>:<uid>'
--   * sem saldo -> retorna insufficient_credits com CTA (nada e reservado)
--   * comissao > 0 marca freight_service_commissions como 'cobrada'
--
-- Assinaturas pay_* validadas contra:
--   pay_get_or_create_account  -> 20260707_pay_account_allow_customer_wallet.sql
--   pay_post_transaction       -> 20260514_pay_phase1_07_harden_rpcs.sql
--
-- Idempotente. Depende de: 20260722_freight_quotes.sql (V2.1),
-- serie pay_phase1_* e 20260707_pay_account_allow_customer_wallet.sql.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.accept_freight_opportunity_unlock(p_request_id uuid, p_price numeric)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_req public.freight_quote_requests;
  v_prop public.freight_quote_proposals;
  v_prop_id uuid;
  v_price numeric;
  v_comm numeric;
  v_pct numeric;
  v_acct uuid; v_platform uuid; v_avail numeric; v_idem text;
BEGIN
  IF v_uid IS NULL THEN RETURN jsonb_build_object('success', false, 'error', 'not_authenticated'); END IF;
  SELECT * INTO v_req FROM public.freight_quote_requests WHERE id = p_request_id;
  IF v_req.id IS NULL THEN RETURN jsonb_build_object('success', false, 'error', 'request_not_found'); END IF;
  IF v_req.client_user_id = v_uid THEN RETURN jsonb_build_object('success', false, 'error', 'own_request'); END IF;

  -- Ja desbloqueado? Devolve sem nova cobranca (idempotente).
  IF EXISTS (SELECT 1 FROM public.freight_quote_unlocks
             WHERE request_id = p_request_id AND transporter_user_id = v_uid) THEN
    RETURN jsonb_build_object('success', true, 'already_unlocked', true,
      'contact', public.build_freight_quote_contact(p_request_id));
  END IF;

  -- Solicitacao fechada: so libera se a proposta aceita for do proprio
  -- transportador (comissao ja foi tratada no aceite do cliente). Sem nova cobranca.
  IF v_req.status NOT IN ('aguardando','recebendo','negociacao') THEN
    SELECT * INTO v_prop FROM public.freight_quote_proposals
    WHERE request_id = p_request_id AND transporter_user_id = v_uid AND status = 'aceita';
    IF v_prop.id IS NULL THEN
      RETURN jsonb_build_object('success', false, 'error', 'request_closed');
    END IF;
    INSERT INTO public.freight_quote_unlocks (request_id, transporter_user_id, commission_brl)
    VALUES (p_request_id, v_uid, 0) ON CONFLICT DO NOTHING;
    RETURN jsonb_build_object('success', true, 'already_unlocked', true,
      'contact', public.build_freight_quote_contact(p_request_id));
  END IF;

  -- Preco do aceite definitivo
  v_price := coalesce(p_price, v_req.suggested_price_brl);
  IF v_price IS NULL OR v_price <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid_price');
  END IF;

  -- COMISSAO OFICIAL (parametrizavel; 3% por padrao)
  v_comm := public.compute_freight_commission(v_price, v_req.cargo_type);
  SELECT coalesce(nullif(per_category->>coalesce(v_req.cargo_type,''), '')::numeric, percent, 0)
    INTO v_pct FROM public.freight_commission_settings WHERE id = 1;

  -- ── DEBITO REAL NA CARTEIRA (Wallet + Ledger) ──────────────────────────────
  -- Cobra ANTES de fechar o aceite: sem saldo, nada e reservado e o servico
  -- permanece aberto para outros transportadores.
  IF v_comm > 0 THEN
    v_acct := (public.pay_get_or_create_account('customer', v_uid, 'customer_wallet', '{}'::jsonb)).id;
    SELECT id INTO v_platform FROM public.pay_financial_accounts
     WHERE owner_type = 'platform' AND account_type = 'platform_main' LIMIT 1;
    IF v_platform IS NULL THEN
      RETURN jsonb_build_object('success', false, 'error', 'platform_account_missing');
    END IF;

    SELECT available_balance INTO v_avail FROM public.pay_financial_accounts WHERE id = v_acct;
    IF coalesce(v_avail, 0) < v_comm THEN
      RETURN jsonb_build_object('success', false, 'error', 'insufficient_credits', 'buy_credits_cta', true,
        'required_cents', round(v_comm * 100)::bigint,
        'available_cents', round(coalesce(v_avail, 0) * 100)::bigint);
    END IF;

    v_idem := 'freight_unlock:' || p_request_id::text || ':' || v_uid::text;
    BEGIN
      PERFORM public.pay_post_transaction(
        'freight_commission', v_idem,
        jsonb_build_array(
          jsonb_build_object('account_id', v_acct, 'direction', 'debit', 'entry_type', 'payment_out',
                             'amount', v_comm, 'description', 'Comissao frete - abrir contato (' || coalesce(v_req.cargo_type,'carga') || ')'),
          jsonb_build_object('account_id', v_platform, 'direction', 'credit', 'entry_type', 'payment_in',
                             'amount', v_comm, 'description', 'Comissao frete ' || coalesce(v_pct,0)::text || '% (abrir contato)')
        ),
        'freight_quote_requests', p_request_id,
        jsonb_build_object('transporter', v_uid, 'price_brl', v_price, 'pct', v_pct)
      );
    EXCEPTION WHEN OTHERS THEN
      SELECT available_balance INTO v_avail FROM public.pay_financial_accounts WHERE id = v_acct;
      RETURN jsonb_build_object('success', false, 'error', 'insufficient_credits', 'buy_credits_cta', true,
        'required_cents', round(v_comm * 100)::bigint,
        'available_cents', round(coalesce(v_avail, 0) * 100)::bigint,
        'detail', SQLERRM);
    END;
  END IF;

  -- Aceite definitivo (apos cobranca bem-sucedida)
  INSERT INTO public.freight_quote_proposals (request_id, transporter_user_id, price_brl, status, notes)
  VALUES (p_request_id, v_uid, v_price, 'aceita', 'Aceite direto da oportunidade (contato aberto).')
  ON CONFLICT (request_id, transporter_user_id) DO UPDATE
    SET price_brl = EXCLUDED.price_brl, status = 'aceita', updated_at = now()
  RETURNING id INTO v_prop_id;

  UPDATE public.freight_quote_proposals SET status = 'recusada', updated_at = now()
  WHERE request_id = p_request_id AND id <> v_prop_id AND status = 'enviada';
  UPDATE public.freight_quote_requests
  SET status = 'aceita', accepted_proposal_id = v_prop_id, updated_at = now() WHERE id = p_request_id;

  -- Ledger de comissao (freight_service_commissions): registra COBRADA/isenta
  PERFORM public.register_freight_commission(p_request_id, v_prop_id, v_uid, v_price, v_req.cargo_type);
  UPDATE public.freight_service_commissions
     SET status = CASE WHEN v_comm > 0 THEN 'cobrada' ELSE 'isenta' END
   WHERE request_id = p_request_id AND transporter_user_id = v_uid AND status = 'pendente';

  INSERT INTO public.freight_quote_unlocks (request_id, transporter_user_id, commission_brl)
  VALUES (p_request_id, v_uid, coalesce(v_comm, 0)) ON CONFLICT DO NOTHING;

  RETURN jsonb_build_object('success', true, 'already_unlocked', false,
    'proposal_id', v_prop_id, 'price', v_price, 'commission_brl', coalesce(v_comm, 0),
    'pct_applied', coalesce(v_pct, 0),
    'contact', public.build_freight_quote_contact(p_request_id));
END; $$;

-- Permissoes (inalteradas — mantem o contrato da base)
REVOKE ALL ON FUNCTION public.accept_freight_opportunity_unlock(uuid, numeric) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.accept_freight_opportunity_unlock(uuid, numeric) TO authenticated, service_role;

SELECT pg_notify('pgrst', 'reload schema');

-- ----------------------------------------------------------------------------
-- VERIFICACAO (esperado: debita_carteira=true)
-- ----------------------------------------------------------------------------
SELECT
  (SELECT pg_get_functiondef(p.oid) LIKE '%pay_post_transaction%'
     FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname='public' AND p.proname='accept_freight_opportunity_unlock' LIMIT 1) AS debita_carteira;
