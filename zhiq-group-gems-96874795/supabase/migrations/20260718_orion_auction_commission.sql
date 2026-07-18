-- ============================================================================
-- COMANDO LEILÃO — MOTOR DE COMISSÃO 6% v1.0  (comissão do arremate → contato)
-- ============================================================================
-- Núcleo financeiro que FALTAVA no ecossistema de leilão: quando há VENCEDOR,
--   cobra 6% sobre o valor do arremate (auction_listings.current_bid, em REAIS)
--   CONVERTIDO EM CRÉDITOS (ref R$0,30/crédito) e, se o VENDEDOR (lojista) tem
--   saldo, DEBITA e LIBERA o contato do comprador. Sem saldo → fica
--   'aguardando_pagamento' e abre o fluxo "Novo Pacote"; após o pagamento
--   creditar o saldo, uma re-checagem libera o contato.
--
-- DECISÕES DO USUÁRIO (2026-07-18, travadas): (1) quem paga = VENDEDOR/lojista
--   (trilho advertiser_credit_balances, mesmo modelo clique/WhatsApp);
--   (2) conversão = R$0,30/crédito (credit_pricing_settings.credit_reference_brl).
--
-- REGRAS FINANCEIRAS (skill regras-financeiras): comissão = fonte única;
--   movimentação SÓ via RPC SECURITY DEFINER idempotente (nunca INSERT direto
--   de saldo); DEBITA reusando `orion_auction_charge` (já existe, partida em
--   advertiser_credit_balances + advertiser_credit_ledger). A comissão é
--   registrada no valor OFICIAL do arremate e NUNCA muda em renegociação
--   posterior (art. da spec). GRÁTIS criar leilão/dar lance — cobra só no
--   vencedor. Divulgação é INDEPENDENTE da comissão (orion_auction_close
--   cuida da divulgação; NÃO tocado aqui).
--
-- ANTI-COLISÃO: reusa `orion_auction_charge` e resolve a conta como o
--   `orion_auction_close` (advertiser_accounts WHERE user_id=owner_user_id).
--   Namespace novo: `orion_auction_commissions` + `orion_auction_commission_*`.
--   NÃO altera auction_listings nem os RPCs legados. Módulo Gateway = `auctions`
--   (já existe; sem pref nova). Contato do vencedor = profiles.whatsapp/telefone
--   (LGPD: revelado SÓ ao dono quando liberado; nunca abre RLS de profiles).
--
-- Idempotente (uq listing_id + guarda status). Ledger imutável (REVOKE UPD/DEL;
--   status muda só via DEFINER). Cron `orion_auction_commission_tick` */5 varre
--   encerrados. Suite `orion_auction_commission_selftest` = COMANDO TESTE.
-- SQL Editor (broifhfqmnzqoongtokm).
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.orion_auction_commission_config (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  pct numeric(5,2) NOT NULL DEFAULT 6.0,
  credit_ref_brl numeric(8,2),         -- NULL => usa credit_pricing_settings
  min_credits int NOT NULL DEFAULT 0,
  arredondamento text NOT NULL DEFAULT 'ceil',  -- ceil|round (a favor da plataforma = ceil)
  atualizado_em timestamptz NOT NULL DEFAULT now()
);
INSERT INTO public.orion_auction_commission_config (id) VALUES (true) ON CONFLICT (id) DO NOTHING;
COMMENT ON TABLE public.orion_auction_commission_config IS 'COMANDO LEILÃO: configuração da comissão de arremate (6% padrão, R$0,30/crédito). Admin-settable.';

CREATE TABLE IF NOT EXISTS public.orion_auction_commissions (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  listing_id uuid NOT NULL,
  owner_user_id uuid NOT NULL,
  advertiser_account_id uuid,
  winner_user_id uuid,
  arremate_brl numeric(12,2) NOT NULL,
  pct numeric(5,2) NOT NULL,
  comissao_brl numeric(12,2) NOT NULL,
  creditos_devidos int NOT NULL,
  creditos_debitados int NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'aguardando_pagamento',  -- aguardando_pagamento|paga
  contato_liberado boolean NOT NULL DEFAULT false,
  contato_liberado_em timestamptz,
  evidencias jsonb NOT NULL DEFAULT '{}'::jsonb,
  criado_em timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT orion_auction_commissions_listing_uq UNIQUE (listing_id)
);
COMMENT ON TABLE public.orion_auction_commissions IS 'COMANDO LEILÃO: comissão 6% por leilão vencido (1/listing, idempotente). Ledger imutável; status muda só via RPC. Valor congelado no arremate oficial.';
CREATE INDEX IF NOT EXISTS ix_auction_comm_status ON public.orion_auction_commissions (status);
CREATE INDEX IF NOT EXISTS ix_auction_comm_owner ON public.orion_auction_commissions (owner_user_id);

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['orion_auction_commission_config','orion_auction_commissions'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('REVOKE ALL ON public.%I FROM anon, authenticated', t);
    EXECUTE format('GRANT SELECT ON public.%I TO authenticated', t);
  END LOOP;
  -- admin vê tudo; lojista vê as próprias comissões
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='orion_auction_commissions' AND policyname='auction_comm_read') THEN
    CREATE POLICY auction_comm_read ON public.orion_auction_commissions FOR SELECT
      USING (public.mp_is_admin() OR owner_user_id = auth.uid());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='orion_auction_commission_config' AND policyname='auction_comm_cfg_read') THEN
    CREATE POLICY auction_comm_cfg_read ON public.orion_auction_commission_config FOR SELECT USING (public.mp_is_admin());
  END IF;
END$$;
REVOKE UPDATE, DELETE ON public.orion_auction_commissions FROM authenticated, anon;

CREATE OR REPLACE FUNCTION public.auction_comm_guard()
RETURNS void LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF session_user <> 'postgres' AND coalesce(auth.role(),'') <> 'service_role' AND NOT public.mp_is_admin() THEN
    RAISE EXCEPTION 'auction_commission: acesso negado (somente admin/service)';
  END IF;
END$$;

CREATE OR REPLACE FUNCTION public.auction_comm_emit(p_tipo text, p_dados jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.orion_eventos (tipo, origem, dados) VALUES (p_tipo, 'auction_commission', coalesce(p_dados,'{}'::jsonb));
EXCEPTION WHEN OTHERS THEN NULL;
END$$;
REVOKE ALL ON FUNCTION public.auction_comm_emit(text,jsonb) FROM public, anon, authenticated;

-- ===== COMPUTE (puro, testável): 6% do arremate → créditos ==================
CREATE OR REPLACE FUNCTION public.orion_auction_commission_compute(p_arremate_brl numeric)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_pct numeric; v_ref numeric; v_min int; v_arred text; v_brl numeric; v_cred int;
BEGIN
  SELECT pct, credit_ref_brl, min_credits, arredondamento INTO v_pct, v_ref, v_min, v_arred
    FROM public.orion_auction_commission_config WHERE id;
  v_ref := coalesce(v_ref, (SELECT credit_reference_brl FROM public.credit_pricing_settings WHERE is_active LIMIT 1), 0.30);
  v_brl := round(coalesce(p_arremate_brl,0) * v_pct/100.0, 2);
  v_cred := CASE WHEN v_arred='round' THEN round(v_brl / v_ref) ELSE ceil(v_brl / v_ref) END::int;
  v_cred := greatest(v_cred, v_min);
  RETURN jsonb_build_object('arremate_brl', coalesce(p_arremate_brl,0), 'pct', v_pct,
    'comissao_brl', v_brl, 'credit_ref_brl', v_ref, 'creditos', v_cred);
END$$;
GRANT EXECUTE ON FUNCTION public.orion_auction_commission_compute(numeric) TO authenticated, service_role;

-- ===== NÚCLEO interno: aplica a comissão (compute + upsert + débito) =========
CREATE OR REPLACE FUNCTION public._orion_auction_commission_apply(
  p_listing uuid, p_owner uuid, p_winner uuid, p_acc uuid, p_arremate_brl numeric)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_c jsonb; v_cred int; v_ok boolean; v_status text; v_row public.orion_auction_commissions;
BEGIN
  -- idempotência: já paga => no-op
  SELECT * INTO v_row FROM public.orion_auction_commissions WHERE listing_id = p_listing;
  IF v_row.status = 'paga' THEN
    RETURN jsonb_build_object('ok',true,'status','paga','contato_liberado',true,'idempotente',true,'creditos',v_row.creditos_debitados);
  END IF;

  v_c := public.orion_auction_commission_compute(p_arremate_brl);
  v_cred := (v_c->>'creditos')::int;

  -- upsert do registro (congela o valor do arremate oficial)
  INSERT INTO public.orion_auction_commissions
    (listing_id, owner_user_id, advertiser_account_id, winner_user_id, arremate_brl, pct, comissao_brl, creditos_devidos, evidencias)
  VALUES (p_listing, p_owner, p_acc, p_winner, coalesce(p_arremate_brl,0), (v_c->>'pct')::numeric,
    (v_c->>'comissao_brl')::numeric, v_cred, v_c)
  ON CONFLICT (listing_id) DO UPDATE SET advertiser_account_id=coalesce(excluded.advertiser_account_id, orion_auction_commissions.advertiser_account_id), atualizado_em=now();

  -- tenta debitar créditos do LOJISTA (reusa orion_auction_charge; false = sem saldo)
  IF p_acc IS NOT NULL AND v_cred > 0 THEN
    v_ok := public.orion_auction_charge(p_acc, v_cred, 'auction_commission', p_listing,
      'Comissão 6% do arremate (leilão '||p_listing||') — liberação de contato');
  ELSE
    v_ok := false;
  END IF;

  IF v_ok THEN
    UPDATE public.orion_auction_commissions
       SET status='paga', creditos_debitados=v_cred, contato_liberado=true, contato_liberado_em=now(), atualizado_em=now()
     WHERE listing_id=p_listing;
    v_status := 'paga';
    PERFORM public.auction_comm_emit('auction.comissao_paga', jsonb_build_object('listing',p_listing,'creditos',v_cred));
    INSERT INTO public.notificacoes_admin (tipo, mensagem, dados)
    VALUES ('leilao_comissao_paga','Comissão de leilão paga — contato liberado ('||v_cred||' créditos)',
      jsonb_build_object('chave','comm:'||p_listing,'listing',p_listing,'owner',p_owner));
  ELSE
    UPDATE public.orion_auction_commissions
       SET status='aguardando_pagamento', contato_liberado=false, atualizado_em=now()
     WHERE listing_id=p_listing;
    v_status := 'aguardando_pagamento';
    PERFORM public.auction_comm_emit('auction.comissao_aguardando',
      jsonb_build_object('listing',p_listing,'creditos_devidos',v_cred,'acao','abrir_novo_pacote'));
    INSERT INTO public.notificacoes_admin (tipo, mensagem, dados)
    VALUES ('leilao_comissao_pendente','Comissão de leilão pendente ('||v_cred||' créditos) — abrir Novo Pacote p/ liberar contato',
      jsonb_build_object('chave','comm:'||p_listing,'listing',p_listing,'owner',p_owner))
    ON CONFLICT DO NOTHING;
  END IF;

  RETURN jsonb_build_object('ok',true,'status',v_status,'contato_liberado',(v_status='paga'),
    'creditos', v_cred, 'comissao_brl', (v_c->>'comissao_brl')::numeric);
END$$;
REVOKE ALL ON FUNCTION public._orion_auction_commission_apply(uuid,uuid,uuid,uuid,numeric) FROM public, anon, authenticated;

-- ===== ENTRADA oficial: cobra a comissão de um leilão encerrado =============
CREATE OR REPLACE FUNCTION public.orion_auction_charge_commission(p_listing uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE al record; v_acc uuid;
BEGIN
  PERFORM public.auction_comm_guard();
  SELECT id, owner_user_id, winner_user_id, current_bid, ends_at, status
    INTO al FROM public.auction_listings WHERE id = p_listing;
  IF al.id IS NULL THEN RAISE EXCEPTION 'leilão inexistente'; END IF;
  IF al.winner_user_id IS NULL THEN
    RETURN jsonb_build_object('ok',true,'status','sem_vencedor','nota','sem vencedor — nada a cobrar (grátis sem arremate)');
  END IF;
  SELECT id INTO v_acc FROM public.advertiser_accounts WHERE user_id = al.owner_user_id LIMIT 1;
  RETURN public._orion_auction_commission_apply(al.id, al.owner_user_id, al.winner_user_id, v_acc, al.current_bid);
END$$;
REVOKE ALL ON FUNCTION public.orion_auction_charge_commission(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.orion_auction_charge_commission(uuid) TO authenticated, service_role;

-- ===== Re-checagem pós-pagamento (após creditar saldo) =====================
CREATE OR REPLACE FUNCTION public.orion_auction_release_after_payment(p_listing uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE c record;
BEGIN
  PERFORM public.auction_comm_guard();
  SELECT * INTO c FROM public.orion_auction_commissions WHERE listing_id = p_listing;
  IF c.listing_id IS NULL THEN RAISE EXCEPTION 'comissão inexistente p/ este leilão'; END IF;
  IF c.status = 'paga' THEN RETURN jsonb_build_object('ok',true,'status','paga','contato_liberado',true,'idempotente',true); END IF;
  RETURN public._orion_auction_commission_apply(c.listing_id, c.owner_user_id, c.winner_user_id, c.advertiser_account_id, c.arremate_brl);
END$$;
REVOKE ALL ON FUNCTION public.orion_auction_release_after_payment(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.orion_auction_release_after_payment(uuid) TO authenticated, service_role;

-- ===== Leitura p/ front: estado + contato do vencedor (só se liberado, LGPD)
CREATE OR REPLACE FUNCTION public.orion_auction_commission_get(p_listing uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE c record; v_contato jsonb := NULL;
BEGIN
  SELECT * INTO c FROM public.orion_auction_commissions WHERE listing_id = p_listing;
  IF c.listing_id IS NULL THEN RETURN jsonb_build_object('existe', false); END IF;
  -- só o dono (lojista) ou admin lê; contato revelado só se liberado
  IF NOT (public.mp_is_admin() OR c.owner_user_id = auth.uid()) THEN
    RAISE EXCEPTION 'sem permissão';
  END IF;
  IF c.contato_liberado THEN
    SELECT jsonb_build_object('nome', p.name, 'whatsapp', coalesce(p.whatsapp, p.telefone))
      INTO v_contato FROM public.profiles p WHERE p.id = c.winner_user_id;
  END IF;
  RETURN jsonb_build_object('existe', true, 'status', c.status, 'contato_liberado', c.contato_liberado,
    'arremate_brl', c.arremate_brl, 'comissao_brl', c.comissao_brl, 'creditos_devidos', c.creditos_devidos,
    'creditos_debitados', c.creditos_debitados, 'contato', v_contato,
    'acao', CASE WHEN c.status='aguardando_pagamento' THEN 'novo_pacote' ELSE NULL END);
END$$;
REVOKE ALL ON FUNCTION public.orion_auction_commission_get(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.orion_auction_commission_get(uuid) TO authenticated, service_role;

-- ===== Dashboard admin ======================================================
CREATE OR REPLACE FUNCTION public.orion_auction_commission_dashboard()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.auction_comm_guard();
  RETURN jsonb_build_object(
    'config', (SELECT to_jsonb(c) FROM public.orion_auction_commission_config c WHERE id),
    'totais', jsonb_build_object(
      'comissoes', (SELECT count(*) FROM public.orion_auction_commissions),
      'pagas', (SELECT count(*) FROM public.orion_auction_commissions WHERE status='paga'),
      'aguardando', (SELECT count(*) FROM public.orion_auction_commissions WHERE status='aguardando_pagamento'),
      'contatos_liberados', (SELECT count(*) FROM public.orion_auction_commissions WHERE contato_liberado),
      'creditos_arrecadados', (SELECT coalesce(sum(creditos_debitados),0) FROM public.orion_auction_commissions),
      'comissao_brl_total', (SELECT coalesce(sum(comissao_brl) FILTER (WHERE status='paga'),0) FROM public.orion_auction_commissions),
      'comissao_brl_pendente', (SELECT coalesce(sum(comissao_brl) FILTER (WHERE status='aguardando_pagamento'),0) FROM public.orion_auction_commissions)),
    'recentes', (SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY x.criado_em DESC),'[]'::jsonb)
       FROM (SELECT listing_id, owner_user_id, arremate_brl, comissao_brl, creditos_devidos, creditos_debitados, status, contato_liberado, criado_em
             FROM public.orion_auction_commissions ORDER BY criado_em DESC LIMIT 30) x),
    'atualizado_em', to_char(now() AT TIME ZONE 'America/Cuiaba','YYYY-MM-DD HH24:MI'));
END$$;
REVOKE ALL ON FUNCTION public.orion_auction_commission_dashboard() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.orion_auction_commission_dashboard() TO authenticated, service_role;

-- ===== TICK: varre leilões encerrados com vencedor e cobra (idempotente) ====
CREATE OR REPLACE FUNCTION public.orion_auction_commission_tick()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT al.id FROM public.auction_listings al
    WHERE al.winner_user_id IS NOT NULL AND al.ends_at < now()
      AND NOT EXISTS (SELECT 1 FROM public.orion_auction_commissions c WHERE c.listing_id = al.id AND c.status='paga')
    LIMIT 200
  LOOP
    BEGIN
      PERFORM public.orion_auction_charge_commission(r.id);
    EXCEPTION WHEN OTHERS THEN NULL;  -- um leilão problemático não trava o lote
    END;
  END LOOP;
END$$;
REVOKE ALL ON FUNCTION public.orion_auction_commission_tick() FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.orion_auction_commission_tick() TO service_role;

-- ===== SELFTEST (COMANDO TESTE) — não toca produção; usa listing sintético ==
CREATE OR REPLACE FUNCTION public.orion_auction_commission_selftest()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_checks jsonb := '[]'::jsonb; v_fail int; v_c jsonb; v_r jsonb;
  v_listing uuid := gen_random_uuid(); v_owner uuid := gen_random_uuid(); v_winner uuid := gen_random_uuid();
BEGIN
  PERFORM public.auction_comm_guard();

  -- 1) COMPUTE: R$650 * 6% = R$39 → 130 créditos (ref 0,30)
  v_c := public.orion_auction_commission_compute(650.00);
  v_checks := v_checks || jsonb_build_object('check','compute_650','ok',
    (v_c->>'comissao_brl')::numeric = 39.00 AND (v_c->>'creditos')::int = 130);
  v_c := public.orion_auction_commission_compute(1000.00);
  v_checks := v_checks || jsonb_build_object('check','compute_1000','ok',
    (v_c->>'comissao_brl')::numeric = 60.00 AND (v_c->>'creditos')::int = 200);

  -- 2) SEM SALDO (conta sintética sem balance) → aguardando + contato NÃO liberado
  v_r := public._orion_auction_commission_apply(v_listing, v_owner, v_winner, NULL, 650.00);
  v_checks := v_checks || jsonb_build_object('check','sem_saldo_aguardando','ok',
    (v_r->>'status')='aguardando_pagamento' AND (v_r->>'contato_liberado')::boolean = false);
  v_checks := v_checks || jsonb_build_object('check','registro_congelou_valor','ok',
    (SELECT arremate_brl FROM public.orion_auction_commissions WHERE listing_id=v_listing)=650.00
    AND (SELECT creditos_devidos FROM public.orion_auction_commissions WHERE listing_id=v_listing)=130);

  -- 3) IDEMPOTÊNCIA: re-aplicar não duplica registro
  v_r := public._orion_auction_commission_apply(v_listing, v_owner, v_winner, NULL, 650.00);
  v_checks := v_checks || jsonb_build_object('check','idempotente_sem_duplicar','ok',
    (SELECT count(*) FROM public.orion_auction_commissions WHERE listing_id=v_listing)=1);

  -- 4) LGPD: contato não vem enquanto não liberado
  v_checks := v_checks || jsonb_build_object('check','contato_oculto_sem_pagar','ok',
    NOT (SELECT contato_liberado FROM public.orion_auction_commissions WHERE listing_id=v_listing));

  -- 5) config + imutabilidade + guarda
  v_checks := v_checks || jsonb_build_object('check','config_6pct','ok',
    (SELECT pct FROM public.orion_auction_commission_config WHERE id)=6.0);
  v_checks := v_checks || jsonb_build_object('check','ledger_imutavel','ok',
    NOT has_table_privilege('authenticated','public.orion_auction_commissions','UPDATE')
    AND NOT has_table_privilege('authenticated','public.orion_auction_commissions','DELETE'));
  v_checks := v_checks || jsonb_build_object('check','anon_sem_select','ok',
    NOT has_table_privilege('anon','public.orion_auction_commissions','SELECT'));
  v_checks := v_checks || jsonb_build_object('check','cron_agendado','ok',
    EXISTS (SELECT 1 FROM cron.job WHERE jobname='orion_auction_commission_tick'));

  -- limpeza do artefato sintético (DEFINER = owner, ignora REVOKE)
  DELETE FROM public.advertiser_credit_ledger WHERE metadata->>'ref_id' = v_listing::text;
  DELETE FROM public.orion_auction_commissions WHERE listing_id = v_listing;

  v_fail := (SELECT count(*)::int FROM jsonb_array_elements(v_checks) e WHERE (e->>'ok')='false');
  RETURN jsonb_build_object('ok', v_fail=0, 'checks', jsonb_array_length(v_checks), 'falhas', v_fail, 'detalhe', v_checks,
    'nota','suite oficial do motor de comissão de leilão — COMANDO TESTE. Path pago (com saldo) é homologado à parte com conta de teste real.');
END$$;
REVOKE ALL ON FUNCTION public.orion_auction_commission_selftest() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.orion_auction_commission_selftest() TO authenticated, service_role;

-- ===== PROMPT + CRON ========================================================
SELECT public.orion_ai_prompt_set('auction.commission_explain',
 'Voce e o ORION Leilao. Explique a comissao do arremate: 6% sobre o valor final, convertido em creditos (ref R$0,30), debitado do lojista para liberar o contato do comprador. Sem saldo => abrir Novo Pacote; apos pagar, contato liberado. A comissao e congelada no valor oficial e nao muda em renegociacao.',
 'COMANDO LEILAO comissao seed');

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname='pg_cron') THEN
    PERFORM cron.unschedule('orion_auction_commission_tick') WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname='orion_auction_commission_tick');
    PERFORM cron.schedule('orion_auction_commission_tick','*/5 * * * *','SELECT public.orion_auction_commission_tick();');
  END IF;
EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'cron indisponivel: %', SQLERRM;
END$$;

SELECT
  (SELECT count(*) FROM information_schema.tables WHERE table_schema='public' AND table_name LIKE 'orion_auction_commission%') AS tabelas,
  (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
     WHERE n.nspname='public' AND p.proname LIKE '%auction_commission%' OR p.proname IN ('orion_auction_charge_commission','orion_auction_release_after_payment','auction_comm_guard','auction_comm_emit')) AS funcoes,
  (SELECT pct FROM public.orion_auction_commission_config WHERE id) AS pct,
  (SELECT count(*) FROM cron.job WHERE jobname='orion_auction_commission_tick') AS cron_job;

-- ROLLBACK (manual):
--   SELECT cron.unschedule('orion_auction_commission_tick');
--   DROP FUNCTION IF EXISTS public.orion_auction_commission_tick, public.orion_auction_commission_selftest,
--     public.orion_auction_commission_dashboard, public.orion_auction_commission_get(uuid),
--     public.orion_auction_release_after_payment(uuid), public.orion_auction_charge_commission(uuid),
--     public._orion_auction_commission_apply(uuid,uuid,uuid,uuid,numeric),
--     public.orion_auction_commission_compute(numeric), public.auction_comm_emit(text,jsonb), public.auction_comm_guard CASCADE;
--   DROP TABLE IF EXISTS public.orion_auction_commissions, public.orion_auction_commission_config CASCADE;
