-- ORION-480 FASE 4 — P1 (A-4)
-- accept_arremate_offer_advertiser lia arremate_offers SEM FOR UPDATE:
-- duplo-clique / duas abas / retry de rede concorrentes liam status='pending'
-- antes que qualquer uma marcasse a oferta como 'accepted', debitando créditos
-- do anunciante mais de uma vez pela MESMA oferta. O lock em
-- advertiser_credit_balances (já existente) só serializava a ORDEM dos dois
-- débitos, não os impedia.
--
-- Fix: (1) FOR UPDATE na leitura da oferta, trava a linha e faz a segunda
-- transação concorrente esperar a primeira commitar; (2) UPDATE final com
-- WHERE status='pending' torna a transição atômica e condicional — se a
-- primeira transação já mudou o status, a segunda não teria mais o que
-- fazer (redundante com o lock, mas defesa em profundidade). Resto da
-- função idêntico à versão vigente em
-- 20260723_auction_enterprise_security_bidengine_oficial.sql.

CREATE OR REPLACE FUNCTION public.accept_arremate_offer_advertiser(
  p_offer_id UUID, p_advertiser_account_id UUID)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_offer RECORD; v_balance RECORD;
  v_contact_cost INTEGER; v_intention_cost INTEGER; v_total_cost INTEGER; v_new_balance INTEGER;
  v_updated INTEGER;
BEGIN
  IF v_uid IS NULL THEN RETURN jsonb_build_object('success', false, 'error', 'not_authenticated'); END IF;
  -- [P0-5] a conta debitada precisa ser do chamador
  IF NOT EXISTS (SELECT 1 FROM public.advertiser_accounts
                 WHERE id = p_advertiser_account_id AND (user_id = v_uid OR id = v_uid)) THEN
    RETURN jsonb_build_object('success', false, 'error', 'account_not_owned'); END IF;

  -- P1 (A-4): FOR UPDATE trava a oferta — chamadas concorrentes para a mesma
  -- p_offer_id serializam aqui, a segunda só lê depois da primeira commitar.
  SELECT * INTO v_offer FROM public.arremate_offers WHERE id = p_offer_id FOR UPDATE;
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

  -- P1 (A-4): transição atômica e condicional (defesa em profundidade além do lock acima)
  UPDATE public.arremate_offers SET status = 'accepted', updated_at = now()
    WHERE id = p_offer_id AND status = 'pending';
  GET DIAGNOSTICS v_updated = ROW_COUNT;
  IF v_updated = 0 THEN
    RAISE EXCEPTION 'oferta % não estava mais pendente no momento da transição', p_offer_id
      USING ERRCODE = '40001';
  END IF;

  RETURN jsonb_build_object('success', true, 'credits_charged', v_total_cost, 'balance_after', v_new_balance);
END $$;
