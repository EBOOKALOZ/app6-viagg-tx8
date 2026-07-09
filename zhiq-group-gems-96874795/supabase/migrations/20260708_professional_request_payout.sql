-- ============================================================
-- SAQUE DOS PROFISSIONAIS — RPC ÚNICA (motoboy, moto-táxi, motorista)
-- 2026-07-08
--
-- Substitui o fluxo LEGADO do "Sacar agora" (INSERT direto do navegador em
-- payout_requests — bloqueado por RLS e fora do motor financeiro) pela
-- arquitetura padrão do Wallet Engine:
--
--   RPC SECURITY DEFINER professional_request_payout()
--     → valida autenticação (auth.uid)
--     → identifica o perfil/carteira AUTOMATICAMENTE no servidor
--       (motoboy_wallet | mototaxi_wallet | driver_wallet, owner = auth.uid;
--        cliente NUNCA envia wallet_id/user_id/profile_id)
--     → trava a carteira (FOR UPDATE) e valida saldo disponível
--     → cria a solicitação em pay_payout_requests (status 'pending')
--     → registra a RESERVA no ledger: pay_ledger_entries entry_type
--       'payout_reserve' com trilha completa (saldo antes/depois em
--       current/available/reserved — colunas nativas do motor)
--     → aplica os deltas oficiais (pay_apply_balance_impact):
--       available −valor · reserved +valor · current INALTERADO
--       ⇒ disponível cai na hora; contábil permanece conciliado
--     → devolve jsonb auditável (request_id, perfil, saldos, ambiente)
--
-- SANDBOX vs PRODUÇÃO: NENHUMA chamada externa aqui (nem em sandbox nem em
-- produção). O ambiente é gravado em destination_snapshot.environment para
-- histórico/exibição. O envio real do dinheiro (produção) é etapa FUTURA do
-- processPayout() — TODO no service — usando a máquina de estados existente
-- (pending→approved→processing→paid, migration 20260514 fase1 08).
-- O status permanece no vocabulário canônico do motor ('pending'); o rótulo
-- "Sandbox Simulado" é derivado do environment na UI — não forkamos o enum
-- auditado da máquina de estados por um conceito de exibição.
--
-- Idempotente. SQL Editor (broifhfqmnzqoongtokm).
-- ============================================================

-- ─── Gate defensivo: avisa se pay_payout_requests tiver colunas NOT NULL
--     sem default além das preenchidas pela RPC (drift entre cópias). ───────
DO $$
DECLARE
  v_cols text;
BEGIN
  SELECT string_agg(column_name, ', ')
    INTO v_cols
    FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = 'pay_payout_requests'
     AND is_nullable = 'NO' AND column_default IS NULL
     AND column_name NOT IN
       ('requester_owner_type','requester_owner_id','requested_amount','status',
        'destination_snapshot','id','created_at','updated_at');
  IF v_cols IS NOT NULL THEN
    RAISE WARNING 'pay_payout_requests tem NOT NULL sem default fora do INSERT da RPC: % — me avise antes de usar o saque.', v_cols;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.professional_request_payout(
  p_amount        numeric,
  p_environment   text  DEFAULT 'sandbox',
  p_profile_hint  text  DEFAULT NULL,   -- 'motoboy'|'mototaxi'|'driver' (opcional; TIPO, nunca id)
  p_metadata      jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid          uuid := auth.uid();
  v_env          text;
  v_acct         public.pay_financial_accounts;
  v_hint_type    public.pay_account_type;
  v_profile      text;
  v_req          public.pay_payout_requests;
  v_impact       record;
  v_avail_after  numeric;
  v_resv_after   numeric;
  v_ip           text;
BEGIN
  -- 1. Autenticação (o cliente nunca envia ids — tudo resolvido aqui).
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'auth.uid() null — RPC requer autenticação' USING ERRCODE = '42501';
  END IF;

  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'Valor de saque inválido: %', p_amount USING ERRCODE = '23514';
  END IF;

  v_env := CASE WHEN p_environment = 'production' THEN 'production' ELSE 'sandbox' END;

  -- 2. Identifica a carteira profissional do PRÓPRIO usuário.
  --    Hint (opcional) restringe ao tipo; com várias carteiras e sem hint,
  --    usa a de MAIOR saldo disponível (determinístico e documentado).
  v_hint_type := CASE p_profile_hint
    WHEN 'motoboy'  THEN 'motoboy_wallet'::public.pay_account_type
    WHEN 'mototaxi' THEN 'mototaxi_wallet'::public.pay_account_type
    WHEN 'driver'   THEN 'driver_wallet'::public.pay_account_type
    ELSE NULL
  END;

  SELECT * INTO v_acct
    FROM public.pay_financial_accounts
   WHERE owner_id = v_uid
     AND account_type IN ('motoboy_wallet','mototaxi_wallet','driver_wallet')
     AND (v_hint_type IS NULL OR account_type = v_hint_type)
   ORDER BY available_balance DESC, created_at ASC
   LIMIT 1
   FOR UPDATE;

  IF v_acct.id IS NULL THEN
    RAISE EXCEPTION 'Nenhuma carteira profissional encontrada para este usuário'
      USING ERRCODE = '23503';
  END IF;

  v_profile := CASE v_acct.account_type::text
    WHEN 'mototaxi_wallet' THEN 'mototaxi'
    WHEN 'driver_wallet'   THEN 'driver'
    ELSE 'motoboy'
  END;

  -- 3. Valida saldo DISPONÍVEL (a trava FOR UPDATE evita corrida).
  IF p_amount > COALESCE(v_acct.available_balance, 0) THEN
    RAISE EXCEPTION 'Valor (%) maior que o saldo disponível (%)',
      p_amount, COALESCE(v_acct.available_balance, 0) USING ERRCODE = '23514';
  END IF;

  -- IP best-effort p/ auditoria (headers do PostgREST).
  BEGIN
    v_ip := split_part(
      COALESCE(current_setting('request.headers', true)::jsonb->>'x-forwarded-for', ''), ',', 1);
    IF v_ip = '' THEN v_ip := NULL; END IF;
  EXCEPTION WHEN OTHERS THEN v_ip := NULL; END;

  -- 4. Solicitação no padrão do motor (status canônico 'pending';
  --    ambiente/perfil/auditoria no destination_snapshot).
  INSERT INTO public.pay_payout_requests (
    requester_owner_type, requester_owner_id, requested_amount, status,
    destination_snapshot
  ) VALUES (
    v_acct.owner_type, v_uid, p_amount, 'pending',
    jsonb_build_object(
      'environment', v_env,
      'profile_type', v_profile,
      'account_type', v_acct.account_type,
      'balance_before_available', v_acct.available_balance,
      'balance_after_available',  v_acct.available_balance - p_amount,
      'requested_by', v_uid,
      'ip', v_ip,
      'destination', 'mercadopago'
    ) || COALESCE(p_metadata, '{}'::jsonb)
  )
  RETURNING * INTO v_req;

  -- 5. RESERVA no ledger — deltas oficiais do motor (payout_reserve:
  --    available −, reserved +, current 0 → contábil conciliado).
  v_impact := public.pay_apply_balance_impact(
    'payout_reserve'::public.pay_ledger_entry_type,
    'debit'::public.pay_ledger_direction,
    p_amount);

  v_avail_after := v_acct.available_balance + v_impact.delta_available;
  v_resv_after  := COALESCE(v_acct.reserved_balance, 0) + v_impact.delta_reserved;

  INSERT INTO public.pay_ledger_entries (
    account_id, direction, entry_type, amount,
    balance_before, balance_after,
    available_balance_before, available_balance_after,
    reserved_balance_before, reserved_balance_after,
    reference_type, reference_id, reason_code, description, metadata,
    idempotency_key, created_by
  ) VALUES (
    v_acct.id, 'debit', 'payout_reserve', p_amount,
    v_acct.current_balance, v_acct.current_balance + v_impact.delta_current,
    v_acct.available_balance, v_avail_after,
    COALESCE(v_acct.reserved_balance, 0), v_resv_after,
    'payout_request', v_req.id, 'payout:reserve',
    'Reserva de saque (' || v_profile || ' / ' || v_env || ')',
    jsonb_build_object('environment', v_env, 'profile_type', v_profile,
                       'request_id', v_req.id, 'ip', v_ip),
    'payout_reserve:' || v_req.id::text, v_uid
  );

  UPDATE public.pay_financial_accounts
     SET current_balance   = current_balance   + v_impact.delta_current,
         available_balance = available_balance + v_impact.delta_available,
         reserved_balance  = COALESCE(reserved_balance, 0) + v_impact.delta_reserved,
         updated_at        = now()
   WHERE id = v_acct.id;

  -- 6. Resposta auditável (o front exibe; nada de chamada externa aqui).
  RETURN jsonb_build_object(
    'request_id', v_req.id,
    'status', v_req.status,
    'environment', v_env,
    'profile_type', v_profile,
    'amount', p_amount,
    'available_before', v_acct.available_balance,
    'available_after',  v_avail_after,
    'reserved_after',   v_resv_after,
    'current_balance',  v_acct.current_balance,
    'created_at', v_req.created_at
  );
END $$;

REVOKE ALL ON FUNCTION public.professional_request_payout(numeric, text, text, jsonb) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.professional_request_payout(numeric, text, text, jsonb) TO authenticated, service_role;
