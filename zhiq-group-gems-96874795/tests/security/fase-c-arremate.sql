-- ============================================================
-- ORION-ARREMATES FASE C — Invariantes de segurança/integridade (permanente)
-- Rodar após qualquer migration do domínio arremate. RAISE se violado.
-- ============================================================
DO $$
DECLARE v_n int;
BEGIN
  -- 1) Chat do arremate com RLS habilitado
  IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid='public.orion_arremate_messages'::regclass) THEN
    RAISE EXCEPTION 'FASE-C INV1: orion_arremate_messages sem RLS';
  END IF;

  -- 2) anon NÃO executa nenhuma RPC do arremate
  SELECT count(*) INTO v_n FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname='public' AND p.proname LIKE 'arremate_%' AND p.prorettype<>'trigger'::regtype
    AND has_function_privilege('anon', p.oid, 'EXECUTE');
  IF v_n > 0 THEN RAISE EXCEPTION 'FASE-C INV2: % RPC(s) arremate executáveis por anon', v_n; END IF;

  -- 3) anon NÃO lê o chat (sem grant de SELECT direto a anon)
  IF has_table_privilege('anon','public.orion_arremate_messages','SELECT') THEN
    RAISE EXCEPTION 'FASE-C INV3: anon tem SELECT no chat do arremate';
  END IF;

  -- 4) Máquina de estados P2P carregada (10 estados operacionais, sem estados financeiros)
  IF EXISTS (SELECT 1 FROM public.orion_arremate_transitions
             WHERE estado_de IN ('pagamento_em_processamento','pago','escrow_ativo','financeiro_liquidado','reembolsado')
                OR estado_para IN ('pagamento_em_processamento','pago','escrow_ativo','financeiro_liquidado','reembolsado')) THEN
    RAISE EXCEPTION 'FASE-C INV4: transições financeiras (intermediação) ainda presentes — modelo P2P violado';
  END IF;
  SELECT count(DISTINCT estado_de) INTO v_n FROM public.orion_arremate_transitions;
  IF v_n < 6 THEN RAISE EXCEPTION 'FASE-C INV5: máquina de estados incompleta (% origens)', v_n; END IF;

  -- 5) Imutabilidade winner/valor preservada (trigger FASE A vivo)
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid='public.orion_auction_settlements'::regclass
                   AND tgname='tg_arremate_settlement_protect' AND NOT tgisinternal) THEN
    RAISE EXCEPTION 'FASE-C INV6: trigger de imutabilidade winner/valor ausente';
  END IF;

  -- ── FASE D (Logística) ──
  -- 7) coluna de vínculo de entrega existe (fulfillment retirada|delivery + delivery_order_id)
  SELECT count(*) INTO v_n FROM information_schema.columns
   WHERE table_schema='public' AND table_name='orion_auction_settlements'
     AND column_name IN ('fulfillment','delivery_order_id');
  IF v_n < 2 THEN RAISE EXCEPTION 'FASE-D INV7: colunas de entrega ausentes (% de 2)', v_n; END IF;

  -- 8) RPCs de logística existem e NÃO são executáveis por anon
  SELECT count(*) INTO v_n FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
   WHERE n.nspname='public' AND p.proname IN ('arremate_definir_fulfillment','arremate_solicitar_entrega')
     AND has_function_privilege('anon', p.oid, 'EXECUTE');
  IF v_n > 0 THEN RAISE EXCEPTION 'FASE-D INV8: % RPC(s) de logística executáveis por anon', v_n; END IF;

  -- 9) trigger que avança o arremate quando a corrida vinculada é entregue
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='tg_arremate_on_delivery_delivered' AND NOT tgisinternal) THEN
    RAISE EXCEPTION 'FASE-D INV9: trigger de conclusão de entrega ausente';
  END IF;

  -- 10) SEGURANÇA (regressão do bypass do não-parte, cert OCE 07-19): nenhuma RPC de
  --     arremate pode usar a guarda vulnerável 'IF v_party NOT IN (...)' — quando v_party
  --     é NULL (não-parte), NULL NOT IN(...) = NULL e o IF NÃO dispara. O padrão correto
  --     é 'IF v_party IS NULL OR v_party NOT IN (...)'.
  SELECT count(*) INTO v_n FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
   WHERE n.nspname='public' AND p.proname LIKE 'arremate_%' AND p.prosrc ~ 'IF v_party NOT IN';
  IF v_n > 0 THEN RAISE EXCEPTION 'FASE-C/D INV10: % RPC(s) com guarda de papel VULNERÁVEL (não-parte bypassa)', v_n; END IF;

  RAISE NOTICE 'FASE C+D — invariantes OK (chat RLS, anon=0, estados P2P, imutabilidade, logística vinculada)';
END $$;
