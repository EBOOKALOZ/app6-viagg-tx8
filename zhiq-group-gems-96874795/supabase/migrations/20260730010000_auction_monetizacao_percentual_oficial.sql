-- ORION-480 — Correção da Monetização de Leilões/Arremates
-- Remove cobrança fixa por créditos (fallback "7 créditos") e substitui por:
--   Publicação:  taxa = 3% do valor do anúncio (starting_bid), debitada da
--                Carteira Financeira (pay_financial_accounts / merchant_wallet),
--                atômica com a criação do leilão.
--   Encerramento: comissão = 1,5% do valor final, debitada da mesma Carteira
--                Financeira do vendedor, apenas quando há vencedor confirmado.
-- Bloqueia cancelar/pausar/encerrar/editar campos sensíveis após o 1º lance
-- válido, com log de auditoria de tentativas bloqueadas.
--
-- Rollback: ver bloco ROLLBACK ao final deste arquivo (comentado) — restaura
-- as definições anteriores das funções alteradas.

-- ═══════════════════════════════════════════════════════════════
-- 1. create_auction_listing — cobrança de 3% atômica com a criação
-- ═══════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.create_auction_listing(
  p_store_id uuid,
  p_title text,
  p_description text DEFAULT NULL::text,
  p_product_image_url text DEFAULT NULL::text,
  p_starting_bid numeric DEFAULT 0,
  p_buy_now_price numeric DEFAULT NULL::numeric,
  p_reserve_price numeric DEFAULT NULL::numeric,
  p_minimum_increment numeric DEFAULT 1,
  p_city text DEFAULT NULL::text,
  p_neighborhood text DEFAULT NULL::text,
  p_state text DEFAULT 'TX'::text,
  p_duration_hours integer DEFAULT 24,
  p_product_id uuid DEFAULT NULL::uuid,
  p_listing_type text DEFAULT 'auction'::text,
  p_starts_at timestamp with time zone DEFAULT NULL::timestamp with time zone,
  p_ends_at timestamp with time zone DEFAULT NULL::timestamp with time zone,
  p_fulfillment_type text DEFAULT 'pickup'::text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_id uuid;
  v_starts_at timestamptz;
  v_ends_at   timestamptz;
  v_type text;
  v_fulfillment text;
  v_uid uuid := auth.uid();
  v_account public.pay_financial_accounts;
  v_fee numeric;
  v_ledger public.pay_ledger_entries;
  v_idem_key text;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_authenticated');
  END IF;

  IF p_store_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'store_required',
      'message', 'Loja não informada — publique a partir do painel da sua loja.');
  END IF;

  IF p_starting_bid IS NULL OR p_starting_bid <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid_value',
      'message', 'Valor do anúncio deve ser maior que zero.');
  END IF;

  v_type := CASE WHEN p_listing_type IN ('auction', 'arremate') THEN p_listing_type ELSE 'auction' END;
  v_fulfillment := CASE WHEN p_fulfillment_type IN ('pickup', 'delivery', 'both') THEN p_fulfillment_type ELSE 'pickup' END;
  v_starts_at := COALESCE(p_starts_at, now());
  v_ends_at   := COALESCE(p_ends_at, v_starts_at + (p_duration_hours || ' hours')::interval);

  -- REGRA OFICIAL: taxa de publicação = 3% do valor do anúncio (starting_bid).
  v_fee := round(p_starting_bid * 0.03, 2);

  -- Resolve (ou cria) a carteira financeira da loja. pay_get_or_create_account
  -- já valida que auth.uid() é o dono de merchant_stores.id = p_store_id —
  -- isto fecha o bypass de "store_id não verificado" que existia antes.
  v_account := public.pay_get_or_create_account('merchant_store', p_store_id, 'merchant_wallet');

  IF v_account.available_balance < v_fee THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'insufficient_balance',
      'message', format('Saldo insuficiente na Carteira Financeira. Necessário: R$ %s. Saldo: R$ %s.',
                         to_char(v_fee, 'FM999999990.00'), to_char(v_account.available_balance, 'FM999999990.00')),
      'required_amount', v_fee,
      'available_balance', v_account.available_balance
    );
  END IF;

  -- Débito atômico: mesma transação do INSERT do leilão (nenhum commit
  -- intermediário existe dentro de uma função PL/pgSQL). Se qualquer etapa
  -- abaixo falhar, o débito é revertido junto com a criação do leilão.
  INSERT INTO public.auction_listings (
    store_id, owner_user_id, product_id, title, description, product_image_url,
    starting_bid, current_bid, buy_now_price, reserve_price,
    minimum_increment, city, neighborhood, state,
    starts_at, ends_at, status, listing_type, fulfillment_type
  ) VALUES (
    p_store_id, auth.uid(), p_product_id, p_title, p_description, p_product_image_url,
    p_starting_bid, p_starting_bid, p_buy_now_price, p_reserve_price,
    p_minimum_increment, p_city, p_neighborhood, p_state,
    v_starts_at, v_ends_at, 'active', v_type, v_fulfillment
  )
  RETURNING id INTO v_id;

  v_idem_key := 'auction_publish_fee:' || v_id::text;

  v_ledger := public.pay_create_ledger_entry(
    p_account_id     => v_account.id,
    p_direction      => 'debit',
    p_entry_type     => 'payment_out',
    p_amount         => v_fee,
    p_reference_type => 'auction_listing',
    p_reference_id   => v_id,
    p_reason_code    => 'auction_listing_publish_fee',
    p_description    => format('Taxa de publicação (3%%) — %s', p_title),
    p_metadata       => jsonb_build_object('starting_bid', p_starting_bid, 'fee_pct', 3, 'listing_type', v_type),
    p_idempotency_key => v_idem_key,
    p_created_by     => v_uid
  );

  INSERT INTO public.auction_listing_audit_log
    (listing_id, actor_user_id, field_name, old_value, new_value, source)
  VALUES
    (v_id, v_uid, 'publish_fee_charged', NULL,
     jsonb_build_object('fee', v_fee, 'ledger_entry_id', v_ledger.id, 'account_id', v_account.id)::text,
     'create_auction_listing');

  RETURN jsonb_build_object(
    'success', true,
    'listing_id', v_id,
    'starts_at', v_starts_at,
    'ends_at', v_ends_at,
    'listing_type', v_type,
    'fulfillment_type', v_fulfillment,
    'publish_fee_charged', v_fee,
    'wallet_balance_after', v_account.available_balance - v_fee
  );
END;
$function$;

-- ═══════════════════════════════════════════════════════════════
-- 2. orion_auction_apply_commission — 1,5% da Carteira Financeira
--    (substitui a cobrança em créditos do vendedor)
-- ═══════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.orion_auction_apply_commission(p_listing uuid, p_advertiser_account uuid DEFAULT NULL::uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_s record;
  v_listing record;
  v_store_id uuid;
  v_account public.pay_financial_accounts;
  v_fee numeric;
  v_ledger public.pay_ledger_entries;
  v_idem_key text;
BEGIN
  SELECT * INTO v_s FROM public.orion_auction_settlements WHERE listing_id = p_listing;
  IF v_s IS NULL THEN RETURN jsonb_build_object('ok', false, 'erro', 'liquidação inexistente — rode settle antes'); END IF;
  IF v_s.creditos_ok THEN RETURN jsonb_build_object('ok', true, 'idempotente', true, 'status', v_s.status); END IF;
  IF v_s.winner_user_id IS NULL THEN RETURN jsonb_build_object('ok', false, 'erro', 'sem vencedor — nada a cobrar'); END IF;

  SELECT store_id INTO v_store_id FROM public.auction_listings WHERE id = p_listing;
  IF v_store_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'erro', 'leilão sem loja vinculada — não é possível cobrar comissão');
  END IF;

  -- REGRA OFICIAL: comissão de encerramento = 1,5% do valor final,
  -- debitada da MESMA Carteira Financeira usada na publicação (única
  -- fonte de saldo para autorização e exibição).
  v_fee := round(coalesce(v_s.valor_final, 0) * 0.015, 2);

  SELECT * INTO v_account
    FROM public.pay_financial_accounts
   WHERE owner_id = v_store_id AND owner_type = 'merchant_store' AND account_type = 'merchant_wallet'
   FOR UPDATE;

  IF v_account IS NULL THEN
    UPDATE public.orion_auction_settlements
       SET status='awaiting_credits', updated_at=now() WHERE listing_id=p_listing;
    INSERT INTO public.orion_auction_audit (listing_id, acao, ator, detalhes)
    VALUES (p_listing, 'commission_no_wallet', 'orion-ai-65',
            jsonb_build_object('store_id', v_store_id));
    RETURN jsonb_build_object('ok', false, 'erro', 'carteira financeira do vendedor não encontrada');
  END IF;

  IF v_fee > 0 AND v_account.available_balance < v_fee THEN
    UPDATE public.orion_auction_settlements
       SET status='awaiting_credits', updated_at=now() WHERE listing_id=p_listing;
    INSERT INTO public.orion_auction_audit (listing_id, acao, ator, detalhes)
    VALUES (p_listing, 'commission_insufficient', 'orion-ai-65',
            jsonb_build_object('fee', v_fee, 'available_balance', v_account.available_balance, 'account', v_account.id));
    RETURN jsonb_build_object('ok', false, 'erro', 'saldo insuficiente na carteira financeira do vendedor',
      'fee_required', v_fee, 'available_balance', v_account.available_balance);
  END IF;

  IF v_fee > 0 THEN
    v_idem_key := 'auction_settlement_commission:' || p_listing::text;
    v_ledger := public.pay_create_ledger_entry(
      p_account_id     => v_account.id,
      p_direction      => 'debit',
      p_entry_type     => 'commission_income',
      p_amount         => v_fee,
      p_reference_type => 'auction_listing',
      p_reference_id   => p_listing,
      p_reason_code    => 'auction_listing_settlement_commission',
      p_description    => format('Comissão de encerramento (1,5%%) — %s', v_s.titulo),
      p_metadata       => jsonb_build_object('valor_final', v_s.valor_final, 'fee_pct', 1.5),
      p_idempotency_key => v_idem_key,
      p_created_by     => NULL
    );
  END IF;

  UPDATE public.orion_auction_settlements
     SET creditos_ok = true,
         comissao_ok = true,
         comissao_valor = v_fee,
         status = CASE WHEN status='awaiting_credits' THEN 'settled' ELSE status END,
         updated_at = now()
   WHERE listing_id = p_listing;

  INSERT INTO public.orion_auction_audit (listing_id, acao, ator, detalhes)
  VALUES (p_listing, 'commission_applied', 'orion-ai-65',
          jsonb_build_object('fee', v_fee, 'conta', v_account.id, 'ledger_entry_id', v_ledger.id));

  RETURN jsonb_build_object('ok', true, 'fee_debitado', v_fee, 'conta', v_account.id);
END$function$;

-- ═══════════════════════════════════════════════════════════════
-- 3. Guarda de integridade pós-primeiro-lance
--    Helper reutilizado por auction_set_status / end_auction_listing /
--    update_auction_listing e pelo trigger em auction_bids.
-- ═══════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public._auction_has_valid_bids(p_listing_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.auction_bids
     WHERE listing_id = p_listing_id AND is_valid = true
  );
$function$;

-- 3.1 auction_set_status — bloqueia cancelar/pausar incondicionalmente com lances
CREATE OR REPLACE FUNCTION public.auction_set_status(p_listing_id uuid, p_new_status text, p_confirm_with_bids boolean DEFAULT false)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_l public.auction_listings%ROWTYPE; v_uid uuid := auth.uid(); v_ok boolean := false;
  v_total_bids int; v_unique_bidders int; v_has_bids boolean;
BEGIN
  SELECT * INTO v_l FROM public.auction_listings WHERE id = p_listing_id FOR UPDATE;
  IF v_l.id IS NULL THEN RETURN jsonb_build_object('success', false, 'error', 'not_found'); END IF;
  IF v_l.owner_user_id <> v_uid AND NOT public.mp_is_admin() THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_owner'); END IF;

  v_ok := CASE
    WHEN p_new_status = 'active'    AND v_l.status IN ('draft','paused') THEN true
    WHEN p_new_status = 'paused'    AND v_l.status = 'active' THEN true
    WHEN p_new_status = 'cancelled' AND v_l.status IN ('draft','active','paused') THEN true
    WHEN p_new_status = 'draft'     AND v_l.status = 'draft' THEN true
    ELSE false END;
  IF NOT v_ok THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid_transition',
      'from', v_l.status, 'to', p_new_status); END IF;

  SELECT count(*), count(DISTINCT user_id) INTO v_total_bids, v_unique_bidders
    FROM public.auction_bids WHERE listing_id = p_listing_id AND is_valid = true;
  v_has_bids := v_total_bids > 0;

  -- REGRA DE INTEGRIDADE: após o 1º lance válido, cancelar/pausar é
  -- bloqueado de forma incondicional para o dono. p_confirm_with_bids
  -- deixou de ter efeito para não-admin — só admin contorna, e apenas
  -- via admin_auction_action (auditado, motivo obrigatório).
  IF v_has_bids AND p_new_status IN ('cancelled', 'paused') AND NOT public.mp_is_admin() THEN
    INSERT INTO public.auction_listing_audit_log
      (listing_id, actor_user_id, field_name, old_value, new_value, source)
    VALUES (p_listing_id, v_uid, 'blocked_status_change', v_l.status, p_new_status, 'auction_set_status');

    RETURN jsonb_build_object(
      'success', false,
      'error', 'has_bids_locked',
      'total_bids', v_total_bids,
      'unique_bidders', v_unique_bidders,
      'message', 'Este leilão já possui lances registrados. Para garantir transparência e igualdade entre todos os participantes, não é mais permitido cancelar, encerrar ou alterar esta publicação.'
    );
  END IF;

  UPDATE public.auction_listings SET status = p_new_status, updated_at = now() WHERE id = p_listing_id;
  PERFORM public.auction_log(p_listing_id, 'status_change', coalesce(v_uid::text,'system'),
    jsonb_build_object('from', v_l.status, 'to', p_new_status,
      'total_bids_at_change', v_total_bids, 'unique_bidders_at_change', v_unique_bidders,
      'admin_override', public.mp_is_admin() AND v_has_bids));

  RETURN jsonb_build_object('success', true, 'status', p_new_status, 'total_bids_affected', v_total_bids);
END $function$;

-- Overload legado (2 args) — mantém compatibilidade, delega ao 3-arg.
CREATE OR REPLACE FUNCTION public.auction_set_status(p_listing_id uuid, p_new_status text)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT public.auction_set_status(p_listing_id, p_new_status, false);
$function$;

-- 3.2 end_auction_listing — bloqueia encerramento antecipado incondicional com lances
CREATE OR REPLACE FUNCTION public.end_auction_listing(p_listing_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE v_l record; v_settle jsonb; v_has_bids boolean; v_is_owner_early_end boolean;
BEGIN
  SELECT * INTO v_l FROM public.auction_listings WHERE id = p_listing_id;
  IF v_l IS NULL THEN RETURN jsonb_build_object('success', false, 'error', 'Leilão não encontrado'); END IF;
  IF session_user <> 'postgres' AND coalesce(auth.role(),'') <> 'service_role'
     AND NOT public.mp_is_admin() AND v_l.owner_user_id <> auth.uid() THEN
    RETURN jsonb_build_object('success', false, 'error', 'Acesso negado — apenas o dono encerra');
  END IF;

  v_has_bids := public._auction_has_valid_bids(p_listing_id);
  -- Encerramento ANTECIPADO (antes do prazo natural) pelo próprio dono com
  -- lances existentes é bloqueado — preserva a expectativa dos participantes.
  -- Admin/service_role/encerramento após o prazo natural (ends_at já vencido)
  -- não é considerado "antecipado" e segue liberado.
  v_is_owner_early_end := (v_l.ends_at IS NULL OR v_l.ends_at > now())
                          AND NOT public.mp_is_admin()
                          AND coalesce(auth.role(),'') <> 'service_role';

  IF v_has_bids AND v_is_owner_early_end THEN
    INSERT INTO public.auction_listing_audit_log
      (listing_id, actor_user_id, field_name, old_value, new_value, source)
    VALUES (p_listing_id, auth.uid(), 'blocked_early_end', v_l.status, 'ended', 'end_auction_listing');

    RETURN jsonb_build_object(
      'success', false,
      'error', 'has_bids_locked',
      'message', 'Este leilão já possui lances registrados. Para garantir transparência e igualdade entre todos os participantes, não é mais permitido cancelar, encerrar ou alterar esta publicação.'
    );
  END IF;

  UPDATE public.auction_listings
     SET ends_at = LEAST(coalesce(ends_at, now()), now()), status = 'ended', updated_at = now()
   WHERE id = p_listing_id;

  PERFORM public.orion_auction_close(p_listing_id, 'basico');
  v_settle := public.orion_auction_settle(p_listing_id);

  RETURN jsonb_build_object('success', true, 'listing_id', p_listing_id, 'settlement', v_settle);
END$function$;

-- 3.3 delete_auction_listing — já bloqueava por total_bids>0; passa a logar a tentativa
CREATE OR REPLACE FUNCTION public.delete_auction_listing(p_listing_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_listing record;
  v_user_id uuid := auth.uid();
BEGIN
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Não autenticado');
  END IF;

  SELECT * INTO v_listing FROM public.auction_listings WHERE id = p_listing_id;
  IF v_listing IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Leilão não encontrado');
  END IF;

  IF v_listing.owner_user_id != v_user_id AND NOT public.mp_is_admin() THEN
    RETURN jsonb_build_object('success', false, 'error', 'Permissão negada');
  END IF;

  IF v_listing.status = 'active' THEN
    RETURN jsonb_build_object('success', false, 'error', 'O leilão ainda está em andamento e não pode ser excluído.');
  END IF;

  IF v_listing.total_bids > 0 OR public._auction_has_valid_bids(p_listing_id) THEN
    INSERT INTO public.auction_listing_audit_log
      (listing_id, actor_user_id, field_name, old_value, new_value, source)
    VALUES (p_listing_id, v_user_id, 'blocked_delete', v_listing.status, 'deleted', 'delete_auction_listing');

    RETURN jsonb_build_object(
      'success', false,
      'error', 'has_bids_locked',
      'message', 'Este leilão já possui lances registrados. Para garantir transparência e igualdade entre todos os participantes, não é mais permitido cancelar, encerrar ou alterar esta publicação.'
    );
  END IF;

  DELETE FROM public.auction_listings WHERE id = p_listing_id;

  RETURN jsonb_build_object('success', true);
END;
$function$;

-- 3.4 update_auction_listing — bloqueia edição de campos sensíveis com lances
CREATE OR REPLACE FUNCTION public.update_auction_listing(p_listing_id uuid, p_updates jsonb, p_expected_updated_at timestamp with time zone DEFAULT NULL::timestamp with time zone)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_l public.auction_listings%ROWTYPE;
  v_uid uuid := auth.uid();
  v_started timestamptz := clock_timestamp();
  v_headers jsonb;
  v_ip text;
  v_ua text;
  v_new_starting_bid numeric;
  v_new_reserve_price numeric;
  v_new_min_increment numeric;
  v_new_starts_at timestamptz;
  v_new_ends_at timestamptz;
  v_new_status text;
  v_warnings jsonb := '[]'::jsonb;
  v_changed jsonb := '[]'::jsonb;
  v_has_bids boolean;
  v_sensitive_fields text[] := ARRAY['starting_bid','reserve_price','minimum_increment','ends_at','starts_at','buy_now_price','buy_now_price_cents'];
  v_touches_sensitive boolean;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Não autenticado'); END IF;

  BEGIN v_headers := current_setting('request.headers', true)::jsonb;
  EXCEPTION WHEN OTHERS THEN v_headers := NULL; END;
  v_ip := split_part(coalesce(v_headers->>'x-forwarded-for',''), ',', 1); v_ip := nullif(v_ip, '');
  v_ua := nullif(v_headers->>'user-agent', '');

  SELECT * INTO v_l FROM public.auction_listings WHERE id = p_listing_id FOR UPDATE;
  IF v_l.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Leilão não encontrado'); END IF;

  IF v_l.owner_user_id <> v_uid AND NOT public.mp_is_admin() THEN
    RETURN jsonb_build_object('success', false, 'error', 'Permissão negada'); END IF;

  IF p_expected_updated_at IS NOT NULL AND p_expected_updated_at IS DISTINCT FROM v_l.updated_at THEN
    RETURN jsonb_build_object(
      'success', false, 'error', 'conflict',
      'message', 'Este leilão foi alterado por outro usuário/aba desde que você abriu o formulário. Recarregue e tente novamente.',
      'current_updated_at', v_l.updated_at
    ); END IF;

  IF v_l.status = 'cancelled' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Leilão cancelado não pode ser alterado'); END IF;
  IF v_l.status = 'ended' AND NOT public.mp_is_admin() THEN
    RETURN jsonb_build_object('success', false, 'error', 'Leilão finalizado não pode ser alterado'); END IF;
  IF v_l.ends_at IS NOT NULL AND v_l.ends_at <= now() AND v_l.status = 'active' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Leilão já encerrado (prazo vencido) não pode ser alterado'); END IF;
  IF v_l.moderation_status IN ('manual_review', 'rejected') AND NOT public.mp_is_admin() THEN
    RETURN jsonb_build_object('success', false, 'error', 'Leilão sob bloqueio administrativo — alteração permitida apenas por administrador'); END IF;

  -- REGRA DE INTEGRIDADE: após o 1º lance válido, o dono não pode mais
  -- alterar preço inicial, reserva, incremento mínimo, buy-now ou prazos.
  -- Campos não-sensíveis (título, descrição, imagem, localização) seguem
  -- editáveis. Admin pode alterar mesmo com lances (uso excepcional).
  v_has_bids := public._auction_has_valid_bids(p_listing_id);
  v_touches_sensitive := (
    SELECT bool_or(p_updates ? f) FROM unnest(v_sensitive_fields) AS f
  );
  IF v_has_bids AND v_touches_sensitive AND NOT public.mp_is_admin() THEN
    INSERT INTO public.auction_listing_audit_log
      (listing_id, actor_user_id, field_name, old_value, new_value, ip_address, user_agent, source)
    VALUES (p_listing_id, v_uid, 'blocked_sensitive_edit', NULL, p_updates::text, v_ip, v_ua, 'update_auction_listing');

    RETURN jsonb_build_object(
      'success', false,
      'error', 'has_bids_locked',
      'message', 'Este leilão já possui lances registrados. Para garantir transparência e igualdade entre todos os participantes, não é mais permitido cancelar, encerrar ou alterar esta publicação.'
    );
  END IF;

  v_new_starting_bid  := COALESCE((p_updates->>'starting_bid')::numeric, v_l.starting_bid);
  v_new_reserve_price := COALESCE((p_updates->>'reserve_price')::numeric, v_l.reserve_price);
  v_new_min_increment := COALESCE((p_updates->>'minimum_increment')::numeric, v_l.minimum_increment);
  v_new_starts_at      := COALESCE((p_updates->>'starts_at')::timestamptz, v_l.starts_at);
  v_new_ends_at         := COALESCE((p_updates->>'ends_at')::timestamptz, v_l.ends_at);
  v_new_status          := COALESCE((p_updates->>'status')::text, v_l.status);

  IF v_new_min_increment <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Incremento mínimo deve ser maior que zero'); END IF;
  IF v_new_starting_bid < 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Lance inicial não pode ser negativo'); END IF;
  IF v_new_reserve_price IS NOT NULL AND v_new_reserve_price < v_new_starting_bid THEN
    RETURN jsonb_build_object('success', false, 'error', 'Preço de reserva não pode ser menor que o lance inicial'); END IF;
  IF v_new_ends_at IS NOT NULL AND v_new_starts_at IS NOT NULL AND v_new_ends_at <= v_new_starts_at THEN
    RETURN jsonb_build_object('success', false, 'error', 'Data de término deve ser posterior à data de início'); END IF;
  IF (p_updates ? 'ends_at') AND v_new_ends_at IS NOT NULL AND v_new_ends_at <= now() THEN
    RETURN jsonb_build_object('success', false, 'error', 'Data de término não pode estar no passado'); END IF;
  IF (p_updates ? 'starts_at') AND NOT (p_updates ? 'ends_at')
     AND v_l.status = 'draft' AND v_new_starts_at < now() - interval '5 minutes' THEN
    v_warnings := v_warnings || jsonb_build_object('field', 'starts_at', 'message', 'Data de início está no passado');
  END IF;
  IF v_new_status NOT IN ('draft','active','paused','cancelled','ended') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Status inválido: ' || v_new_status); END IF;

  IF (p_updates ? 'title') AND public._auction_audit_field(p_listing_id, v_uid, 'title', v_l.title, (p_updates->>'title'), v_ip, v_ua) THEN
    v_changed := v_changed || to_jsonb('title'::text); END IF;
  IF (p_updates ? 'description') AND public._auction_audit_field(p_listing_id, v_uid, 'description', v_l.description, (p_updates->>'description'), v_ip, v_ua) THEN
    v_changed := v_changed || to_jsonb('description'::text); END IF;
  IF (p_updates ? 'product_image_url') AND public._auction_audit_field(p_listing_id, v_uid, 'product_image_url', v_l.product_image_url, (p_updates->>'product_image_url'), v_ip, v_ua) THEN
    v_changed := v_changed || to_jsonb('product_image_url'::text); END IF;
  IF (p_updates ? 'fulfillment_type') AND public._auction_audit_field(p_listing_id, v_uid, 'fulfillment_type', v_l.fulfillment_type, (p_updates->>'fulfillment_type'), v_ip, v_ua) THEN
    v_changed := v_changed || to_jsonb('fulfillment_type'::text); END IF;
  IF (p_updates ? 'starting_bid') AND public._auction_audit_field(p_listing_id, v_uid, 'starting_bid', v_l.starting_bid::text, v_new_starting_bid::text, v_ip, v_ua) THEN
    v_changed := v_changed || to_jsonb('starting_bid'::text); END IF;
  IF (p_updates ? 'reserve_price') AND public._auction_audit_field(p_listing_id, v_uid, 'reserve_price', v_l.reserve_price::text, v_new_reserve_price::text, v_ip, v_ua) THEN
    v_changed := v_changed || to_jsonb('reserve_price'::text); END IF;
  IF (p_updates ? 'minimum_increment') AND public._auction_audit_field(p_listing_id, v_uid, 'minimum_increment', v_l.minimum_increment::text, v_new_min_increment::text, v_ip, v_ua) THEN
    v_changed := v_changed || to_jsonb('minimum_increment'::text); END IF;
  IF (p_updates ? 'status') AND public._auction_audit_field(p_listing_id, v_uid, 'status', v_l.status, v_new_status, v_ip, v_ua) THEN
    v_changed := v_changed || to_jsonb('status'::text); END IF;
  IF (p_updates ? 'starts_at') AND public._auction_audit_field(p_listing_id, v_uid, 'starts_at', v_l.starts_at::text, v_new_starts_at::text, v_ip, v_ua) THEN
    v_changed := v_changed || to_jsonb('starts_at'::text); END IF;
  IF (p_updates ? 'ends_at') AND public._auction_audit_field(p_listing_id, v_uid, 'ends_at', v_l.ends_at::text, v_new_ends_at::text, v_ip, v_ua) THEN
    v_changed := v_changed || to_jsonb('ends_at'::text); END IF;
  IF (p_updates ? 'city') AND public._auction_audit_field(p_listing_id, v_uid, 'city', v_l.city, (p_updates->>'city'), v_ip, v_ua) THEN
    v_changed := v_changed || to_jsonb('city'::text); END IF;
  IF (p_updates ? 'neighborhood') AND public._auction_audit_field(p_listing_id, v_uid, 'neighborhood', v_l.neighborhood, (p_updates->>'neighborhood'), v_ip, v_ua) THEN
    v_changed := v_changed || to_jsonb('neighborhood'::text); END IF;
  IF ((p_updates ? 'buy_now_price') OR (p_updates ? 'buy_now_price_cents'))
     AND public._auction_audit_field(p_listing_id, v_uid, 'buy_now_price', v_l.buy_now_price::text,
           COALESCE((p_updates->>'buy_now_price')::numeric, ((p_updates->>'buy_now_price_cents')::numeric / 100.0))::text,
           v_ip, v_ua)
  THEN v_changed := v_changed || to_jsonb('buy_now_price'::text); END IF;

  UPDATE public.auction_listings
     SET title             = COALESCE((p_updates->>'title')::text, title),
         description       = COALESCE((p_updates->>'description')::text, description),
         product_image_url = COALESCE((p_updates->>'product_image_url')::text, product_image_url),
         fulfillment_type  = COALESCE((p_updates->>'fulfillment_type')::text, fulfillment_type),
         buy_now_price     = COALESCE((p_updates->>'buy_now_price')::numeric,
                                      ((p_updates->>'buy_now_price_cents')::numeric / 100.0),
                                      buy_now_price),
         starting_bid      = v_new_starting_bid,
         reserve_price     = v_new_reserve_price,
         minimum_increment = v_new_min_increment,
         status             = v_new_status,
         starts_at         = v_new_starts_at,
         ends_at           = v_new_ends_at,
         city              = COALESCE((p_updates->>'city')::text, city),
         neighborhood      = COALESCE((p_updates->>'neighborhood')::text, neighborhood),
         updated_at        = now()
   WHERE id = p_listing_id
  RETURNING * INTO v_l;

  PERFORM public.auction_log(p_listing_id, 'listing_updated', v_uid::text,
    jsonb_build_object('fields', v_changed));

  BEGIN
    INSERT INTO public.system_events_log (event_type, entity_type, entity_table, entity_id, actor_user_id, payload)
    VALUES ('auction.updated', 'auction_listing', 'auction_listings', p_listing_id, v_uid,
      jsonb_build_object('changed_fields', v_changed, 'transaction_id', txid_current()));
  EXCEPTION WHEN undefined_column OR undefined_table THEN NULL; END;

  RETURN jsonb_build_object(
    'success', true,
    'listing', to_jsonb(v_l),
    'updated_at', v_l.updated_at,
    'version', v_l.updated_at,
    'changed_fields', v_changed,
    'warnings', v_warnings,
    'processing_time_ms', round(extract(epoch FROM (clock_timestamp() - v_started)) * 1000),
    'transaction_id', txid_current()
  );
END $function$;

-- ═══════════════════════════════════════════════════════════════
-- 4. Trigger de banco: reforço incondicional em auction_listings.
--    Mesmo se alguém chamar UPDATE direto na tabela (bypass total das
--    RPCs), o banco recusa alterar campos sensíveis ou status para
--    'cancelled' quando já existem lances válidos — exceto quando
--    executado por service_role/postgres (usado pelos próprios RPCs
--    administrativos e pela liquidação automática).
-- ═══════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.tg_auction_listings_lock_after_bids()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_has_bids boolean;
  v_role text := current_setting('request.jwt.claim.role', true);
BEGIN
  IF current_user = 'service_role' OR v_role = 'service_role' OR public.mp_is_admin() THEN
    RETURN NEW;
  END IF;

  v_has_bids := public._auction_has_valid_bids(OLD.id);
  IF NOT v_has_bids THEN
    RETURN NEW;
  END IF;

  IF NEW.status = 'cancelled' AND OLD.status <> 'cancelled' THEN
    RAISE EXCEPTION 'has_bids_locked: leilão com lances não pode ser cancelado diretamente'
      USING ERRCODE = 'check_violation';
  END IF;

  IF NEW.starting_bid IS DISTINCT FROM OLD.starting_bid
     OR NEW.reserve_price IS DISTINCT FROM OLD.reserve_price
     OR NEW.minimum_increment IS DISTINCT FROM OLD.minimum_increment
     OR NEW.buy_now_price IS DISTINCT FROM OLD.buy_now_price
     OR NEW.ends_at IS DISTINCT FROM OLD.ends_at
     OR NEW.starts_at IS DISTINCT FROM OLD.starts_at THEN
    RAISE EXCEPTION 'has_bids_locked: condições do leilão não podem ser alteradas após o primeiro lance'
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_auction_listings_lock_after_bids ON public.auction_listings;
CREATE TRIGGER trg_auction_listings_lock_after_bids
  BEFORE UPDATE ON public.auction_listings
  FOR EACH ROW
  EXECUTE FUNCTION public.tg_auction_listings_lock_after_bids();

DROP TRIGGER IF EXISTS trg_auction_listings_block_delete_with_bids ON public.auction_listings;
CREATE OR REPLACE FUNCTION public.tg_auction_listings_block_delete_with_bids()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF current_user = 'service_role' OR coalesce(current_setting('request.jwt.claim.role', true),'') = 'service_role' THEN
    RETURN OLD;
  END IF;
  IF public._auction_has_valid_bids(OLD.id) OR OLD.total_bids > 0 THEN
    RAISE EXCEPTION 'has_bids_locked: leilão com lances não pode ser excluído'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN OLD;
END;
$function$;

CREATE TRIGGER trg_auction_listings_block_delete_with_bids
  BEFORE DELETE ON public.auction_listings
  FOR EACH ROW
  EXECUTE FUNCTION public.tg_auction_listings_block_delete_with_bids();

-- ═══════════════════════════════════════════════════════════════
-- ROLLBACK (referência — não executado por este arquivo)
-- ═══════════════════════════════════════════════════════════════
-- Para reverter esta migration:
--   1. DROP TRIGGER trg_auction_listings_lock_after_bids ON public.auction_listings;
--   2. DROP TRIGGER trg_auction_listings_block_delete_with_bids ON public.auction_listings;
--   3. DROP FUNCTION public.tg_auction_listings_lock_after_bids();
--   4. DROP FUNCTION public.tg_auction_listings_block_delete_with_bids();
--   5. DROP FUNCTION public._auction_has_valid_bids(uuid);
--   6. Restaurar as versões anteriores de create_auction_listing,
--      orion_auction_apply_commission, auction_set_status (2 e 3 args),
--      end_auction_listing, delete_auction_listing, update_auction_listing
--      a partir das migrations originais:
--        20260722_auction_fulfillment_type.sql       (create_auction_listing)
--        <definição original de orion_auction_apply_commission em produção>
--        20260728030000_auction_cancel_with_bids_guard.sql (auction_set_status)
--        20260718_orion_auction_official_flow_ai672.sql    (end_auction_listing)
--        20260726_auction_update_delete_rpcs.sql            (delete_auction_listing)
--        20260729020000_auction_update_hardening_enterprise.sql (update_auction_listing)
--   Nenhum dado é apagado por este rollback — apenas o comportamento das
--   funções volta ao estado anterior. Lançamentos já gravados em
--   pay_ledger_entries são append-only e NÃO são revertidos automaticamente;
--   estornos, se necessários, devem ser lançamentos de 'adjustment' novos.
