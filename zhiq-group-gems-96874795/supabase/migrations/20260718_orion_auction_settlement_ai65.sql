-- ============================================================================
-- ORION-AI-65 — Auction Settlement & Arremate AI v1.0 · 2026-07-18
-- ============================================================================
-- Camada de LIQUIDAÇÃO do leilão (o fim do funil que a auditoria apontou como
-- faltante). ESTENDE orion_auction_* (FASE 1) — não recria o motor de close.
--
-- TRAVA FINANCEIRA (regras-financeiras): o motor COMPUTA/REGISTRA/RECOMENDA
-- (vencedor por lances VÁLIDOS, comissão 6%, certificado, fraude, auditoria,
-- gate de liberação de contato), mas o DÉBITO REAL de créditos fica numa RPC
-- explícita (orion_auction_apply_commission), idempotente, e o auto-débito vem
-- DESLIGADO por default (config.auto_charge=false). Nada de dinheiro se move até
-- confirmação do modelo. Comissão nasce no DB (nunca no front).
--
-- Idempotente. SQL Editor (broifhfqmnzqoongtokm).
-- ============================================================================

-- ── 1) Config única (comissão/conversão/travas) ────────────────────────────
CREATE TABLE IF NOT EXISTS public.orion_auction_settlement_config (
  id                       int PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  commission_pct           numeric NOT NULL DEFAULT 0.06,   -- 6% do valor final
  credits_per_real         numeric NOT NULL DEFAULT 1.00,   -- R$1 comissão -> N créditos
  auto_charge              boolean NOT NULL DEFAULT false,  -- débito automático (OFF até confirmar)
  contact_requires_payment boolean NOT NULL DEFAULT true,   -- gate de contato exige pagamento confirmado
  updated_at               timestamptz NOT NULL DEFAULT now()
);
INSERT INTO public.orion_auction_settlement_config (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

-- ── 2) Registro do arremate / liquidação (1 por leilão = idempotência) ─────
CREATE TABLE IF NOT EXISTS public.orion_auction_settlements (
  listing_id        uuid PRIMARY KEY,
  product_id        uuid,
  seller_user_id    uuid,
  winner_user_id    uuid,
  titulo            text,
  cidade            text,
  valor_inicial     numeric,
  valor_final       numeric,
  total_lances      int    DEFAULT 0,
  lances_validos    int    DEFAULT 0,
  lances_invalidos  int    DEFAULT 0,
  iniciado_em       timestamptz,
  encerrado_em      timestamptz,
  duracao_segundos  bigint,
  comissao_pct      numeric,
  comissao_bruta    numeric,   -- = valor_final
  comissao_valor    numeric,   -- = valor_final * pct
  valor_liquido     numeric,   -- = valor_final - comissao_valor
  creditos_comissao int,       -- comissão convertida em créditos
  status            text NOT NULL DEFAULT 'no_winner', -- no_winner|awaiting_credits|settled|released
  comissao_ok       boolean NOT NULL DEFAULT false,
  creditos_ok       boolean NOT NULL DEFAULT false,
  pagamento_ok      boolean NOT NULL DEFAULT false,
  auditoria_ok      boolean NOT NULL DEFAULT false,
  contato_liberado  boolean NOT NULL DEFAULT false,
  certificado_hash  text,
  certificado       jsonb,
  fraude_score      int DEFAULT 0,
  fraude_flags      jsonb DEFAULT '[]'::jsonb,
  evidencia         jsonb DEFAULT '{}'::jsonb,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ix_orion_settle_seller ON public.orion_auction_settlements (seller_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS ix_orion_settle_winner ON public.orion_auction_settlements (winner_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS ix_orion_settle_status ON public.orion_auction_settlements (status, created_at DESC);

-- ── 3) Validação de lances (invalida irregulares; escolhe maior VÁLIDO) ────
CREATE OR REPLACE FUNCTION public.orion_auction_validate_bids(p_listing uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_l record; r record;
  v_high_cents int := 0; v_first boolean := true;
  v_min_cents int; v_start_cents int;
  v_val int := 0; v_inv int := 0;
  v_win_user uuid; v_win_cents int := 0;
  v_bad jsonb := '[]'::jsonb; v_motivo text;
BEGIN
  SELECT * INTO v_l FROM public.auction_listings WHERE id = p_listing;
  IF v_l IS NULL THEN RETURN jsonb_build_object('erro','leilão inexistente'); END IF;
  v_min_cents   := GREATEST(1, coalesce((v_l.minimum_increment*100)::int, 100));
  v_start_cents := coalesce((v_l.starting_bid*100)::int, 0);

  FOR r IN
    SELECT id, user_id, amount_cents, created_at
    FROM public.auction_bids WHERE listing_id = p_listing
    ORDER BY created_at ASC
  LOOP
    v_motivo := NULL;
    IF r.user_id IS NULL THEN
      v_motivo := 'sem_usuario';
    ELSIF v_l.owner_user_id IS NOT NULL AND r.user_id = v_l.owner_user_id THEN
      v_motivo := 'auto_lance';                       -- lance do próprio dono
    ELSIF v_l.ends_at IS NOT NULL AND r.created_at > v_l.ends_at THEN
      v_motivo := 'apos_encerramento';
    ELSIF v_first AND r.amount_cents < v_start_cents THEN
      v_motivo := 'abaixo_inicial';
    ELSIF (NOT v_first) AND r.amount_cents < (v_high_cents + v_min_cents) THEN
      v_motivo := 'incremento_insuficiente';
    END IF;

    IF v_motivo IS NULL THEN
      v_val := v_val + 1; v_first := false; v_high_cents := r.amount_cents;
      v_win_user := r.user_id; v_win_cents := r.amount_cents;
    ELSE
      v_inv := v_inv + 1;
      v_bad := v_bad || jsonb_build_object('bid_id', r.id, 'user_id', r.user_id,
                 'amount_cents', r.amount_cents, 'motivo', v_motivo);
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'listing_id', p_listing,
    'validos', v_val, 'invalidos', v_inv,
    'maior_valido', CASE WHEN v_win_user IS NULL THEN NULL
       ELSE jsonb_build_object('user_id', v_win_user, 'amount_cents', v_win_cents,
                               'valor', round(v_win_cents/100.0, 2)) END,
    'invalidos_detalhe', v_bad
  );
END$$;

-- ── 4) Varredura de fraude (RECOMENDA, nunca bloqueia sozinha) ─────────────
CREATE OR REPLACE FUNCTION public.orion_auction_fraud_scan(p_listing uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_l record; v_total int; v_self int; v_max_user int; v_rapid int; v_distinct int;
  v_score int := 0; v_flags jsonb := '[]'::jsonb;
BEGIN
  SELECT * INTO v_l FROM public.auction_listings WHERE id = p_listing;
  IF v_l IS NULL THEN RETURN jsonb_build_object('erro','leilão inexistente'); END IF;

  SELECT count(*) INTO v_total FROM public.auction_bids WHERE listing_id = p_listing;
  SELECT count(*) INTO v_self  FROM public.auction_bids
     WHERE listing_id = p_listing AND user_id = v_l.owner_user_id;
  SELECT count(DISTINCT user_id) INTO v_distinct FROM public.auction_bids WHERE listing_id = p_listing;
  SELECT coalesce(max(c),0) INTO v_max_user FROM (
     SELECT count(*) c FROM public.auction_bids WHERE listing_id = p_listing GROUP BY user_id) x;
  SELECT count(*) INTO v_rapid FROM (
     SELECT user_id, created_at,
            lag(created_at) OVER (PARTITION BY user_id ORDER BY created_at) prev
     FROM public.auction_bids WHERE listing_id = p_listing) y
   WHERE prev IS NOT NULL AND EXTRACT(epoch FROM (created_at - prev)) < 2;

  IF v_self > 0 THEN v_score := v_score + 40; v_flags := v_flags || jsonb_build_array('auto_lance'); END IF;
  IF v_total > 0 AND v_max_user::numeric/v_total > 0.8 AND v_total >= 5 THEN
     v_score := v_score + 25; v_flags := v_flags || jsonb_build_array('dominancia_um_usuario'); END IF;
  IF v_rapid > 0 THEN v_score := v_score + 20; v_flags := v_flags || jsonb_build_array('lances_sequenciais_rapidos'); END IF;
  IF v_total >= 3 AND v_distinct = 1 THEN
     v_score := v_score + 15; v_flags := v_flags || jsonb_build_array('unico_participante'); END IF;

  RETURN jsonb_build_object('listing_id', p_listing, 'score', LEAST(v_score,100),
    'flags', v_flags, 'total_lances', v_total, 'participantes', v_distinct,
    'nota', 'Recomendação — nunca bloqueia sozinha; espelhar em AI-41/AI-24.');
END$$;

-- ── 5) LIQUIDAÇÃO (compute/registra/certifica/audita — SEM mover dinheiro) ──
CREATE OR REPLACE FUNCTION public.orion_auction_settle(p_listing uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_l record; v_cfg record; v_val jsonb; v_fraud jsonb;
  v_win_user uuid; v_valor_final numeric; v_pct numeric;
  v_com numeric; v_liq numeric; v_cred int; v_total int;
  v_cert jsonb; v_hash text; v_status text; v_existing record;
BEGIN
  SELECT * INTO v_existing FROM public.orion_auction_settlements WHERE listing_id = p_listing;
  IF v_existing IS NOT NULL THEN
    RETURN jsonb_build_object('ok', true, 'idempotente', true, 'status', v_existing.status,
                              'settlement', to_jsonb(v_existing));
  END IF;

  SELECT * INTO v_l FROM public.auction_listings WHERE id = p_listing FOR UPDATE;
  IF v_l IS NULL THEN RETURN jsonb_build_object('ok', false, 'erro', 'leilão inexistente'); END IF;
  IF v_l.ends_at IS NULL OR v_l.ends_at > now() THEN
    RETURN jsonb_build_object('ok', false, 'erro', 'leilão ainda não encerrado', 'ends_at', v_l.ends_at);
  END IF;

  SELECT * INTO v_cfg FROM public.orion_auction_settlement_config WHERE id = 1;
  v_val   := public.orion_auction_validate_bids(p_listing);
  v_fraud := public.orion_auction_fraud_scan(p_listing);
  SELECT count(*) INTO v_total FROM public.auction_bids WHERE listing_id = p_listing;

  IF (v_val->'maior_valido') IS NULL OR v_val->'maior_valido' = 'null'::jsonb THEN
    v_win_user := NULL; v_valor_final := coalesce(v_l.current_bid, v_l.starting_bid, 0);
    v_status := 'no_winner';
  ELSE
    v_win_user := (v_val->'maior_valido'->>'user_id')::uuid;
    v_valor_final := (v_val->'maior_valido'->>'valor')::numeric;
    v_status := CASE WHEN v_cfg.auto_charge THEN 'settled' ELSE 'awaiting_credits' END;
  END IF;

  v_pct  := coalesce(v_cfg.commission_pct, 0.06);
  v_com  := round(coalesce(v_valor_final,0) * v_pct, 2);
  v_liq  := round(coalesce(v_valor_final,0) - v_com, 2);
  v_cred := ceil(v_com * coalesce(v_cfg.credits_per_real, 1.0))::int;

  v_cert := jsonb_build_object(
    'leilao', p_listing, 'produto', v_l.product_id, 'titulo', v_l.title,
    'vendedor', v_l.owner_user_id, 'comprador', v_win_user,
    'valor_inicial', v_l.starting_bid, 'valor_final', v_valor_final,
    'total_lances', v_total, 'validos', (v_val->>'validos')::int,
    'encerrado_em', v_l.ends_at, 'comissao_pct', v_pct, 'comissao_valor', v_com,
    'emitido_em', now());
  v_hash := md5(coalesce(p_listing::text,'') || '|' || coalesce(v_win_user::text,'') || '|'
              || coalesce(v_valor_final::text,'0') || '|' || coalesce(v_total::text,'0') || '|'
              || coalesce(v_l.ends_at::text,''));

  INSERT INTO public.orion_auction_settlements (
    listing_id, product_id, seller_user_id, winner_user_id, titulo, cidade,
    valor_inicial, valor_final, total_lances, lances_validos, lances_invalidos,
    iniciado_em, encerrado_em, duracao_segundos, comissao_pct, comissao_bruta,
    comissao_valor, valor_liquido, creditos_comissao, status,
    comissao_ok, creditos_ok, pagamento_ok, auditoria_ok, contato_liberado,
    certificado_hash, certificado, fraude_score, fraude_flags, evidencia
  ) VALUES (
    p_listing, v_l.product_id, v_l.owner_user_id, v_win_user, v_l.title, v_l.city,
    v_l.starting_bid, v_valor_final, v_total, (v_val->>'validos')::int, (v_val->>'invalidos')::int,
    v_l.starts_at, v_l.ends_at,
    CASE WHEN v_l.starts_at IS NOT NULL THEN EXTRACT(epoch FROM (v_l.ends_at - v_l.starts_at))::bigint END,
    v_pct, v_valor_final, v_com, v_liq, v_cred, v_status,
    (v_win_user IS NOT NULL), false, false, true, false,
    v_hash, v_cert, (v_fraud->>'score')::int, coalesce(v_fraud->'flags','[]'::jsonb),
    jsonb_build_object('validacao', v_val, 'fraude', v_fraud)
  ) ON CONFLICT (listing_id) DO NOTHING;

  -- registra vencedor no leilão (não sobrescreve se já houver)
  IF v_win_user IS NOT NULL AND v_l.winner_user_id IS NULL THEN
    UPDATE public.auction_listings SET winner_user_id = v_win_user, updated_at = now()
     WHERE id = p_listing;
  END IF;

  -- auditoria imutável
  INSERT INTO public.orion_auction_audit (listing_id, acao, ator, detalhes)
  VALUES (p_listing, 'settle', 'orion-ai-65',
          jsonb_build_object('status', v_status, 'vencedor', v_win_user,
            'comissao', v_com, 'creditos', v_cred, 'fraude_score', (v_fraud->>'score')::int));

  RETURN jsonb_build_object('ok', true, 'status', v_status, 'vencedor', v_win_user,
    'valor_final', v_valor_final, 'comissao_valor', v_com, 'valor_liquido', v_liq,
    'creditos_comissao', v_cred, 'certificado_hash', v_hash,
    'fraude_score', (v_fraud->>'score')::int, 'auto_charge', v_cfg.auto_charge);
END$$;

-- ── 6) APLICAR COMISSÃO (débito REAL de créditos — passo explícito) ─────────
-- Idempotente por chave 'arremate_commission:<listing>' via orion_auction_charge.
CREATE OR REPLACE FUNCTION public.orion_auction_apply_commission(
  p_listing uuid, p_advertiser_account uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_s record; v_acc uuid; v_ok boolean;
BEGIN
  SELECT * INTO v_s FROM public.orion_auction_settlements WHERE listing_id = p_listing;
  IF v_s IS NULL THEN RETURN jsonb_build_object('ok', false, 'erro', 'liquidação inexistente — rode settle antes'); END IF;
  IF v_s.creditos_ok THEN RETURN jsonb_build_object('ok', true, 'idempotente', true, 'status', v_s.status); END IF;
  IF v_s.winner_user_id IS NULL THEN RETURN jsonb_build_object('ok', false, 'erro', 'sem vencedor — nada a cobrar'); END IF;

  v_acc := p_advertiser_account;
  IF v_acc IS NULL THEN
    SELECT id INTO v_acc FROM public.advertiser_accounts WHERE user_id = v_s.seller_user_id LIMIT 1;
  END IF;
  IF v_acc IS NULL THEN RETURN jsonb_build_object('ok', false, 'erro', 'conta de anunciante do vendedor não encontrada'); END IF;

  -- débito idempotente (orion_auction_charge grava consumo + ledger de créditos)
  v_ok := public.orion_auction_charge(v_acc, v_s.creditos_comissao,
            'arremate_commission:' || p_listing::text, p_listing,
            'Comissão de arremate ' || round(v_s.comissao_pct*100)::text || '% = ' || v_s.comissao_valor::text);

  IF NOT v_ok THEN
    UPDATE public.orion_auction_settlements
       SET status='awaiting_credits', updated_at=now() WHERE listing_id=p_listing;
    INSERT INTO public.orion_auction_audit (listing_id, acao, ator, detalhes)
    VALUES (p_listing, 'commission_insufficient', 'orion-ai-65',
            jsonb_build_object('creditos', v_s.creditos_comissao, 'conta', v_acc));
    RETURN jsonb_build_object('ok', false, 'novo_pacote', true, 'creditos_necessarios', v_s.creditos_comissao);
  END IF;

  UPDATE public.orion_auction_settlements
     SET creditos_ok = true,
         status = CASE WHEN status='awaiting_credits' THEN 'settled' ELSE status END,
         updated_at = now()
   WHERE listing_id = p_listing;
  INSERT INTO public.orion_auction_audit (listing_id, acao, ator, detalhes)
  VALUES (p_listing, 'commission_applied', 'orion-ai-65',
          jsonb_build_object('creditos', v_s.creditos_comissao, 'conta', v_acc));

  RETURN jsonb_build_object('ok', true, 'creditos_debitados', v_s.creditos_comissao, 'conta', v_acc);
END$$;

-- ── 7) LIBERAÇÃO DE CONTATO (só com todos os gates aprovados) ───────────────
CREATE OR REPLACE FUNCTION public.orion_auction_release_contact(
  p_listing uuid, p_pagamento_ok boolean DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_s record; v_cfg record; v_pay boolean; v_gate boolean;
BEGIN
  SELECT * INTO v_s FROM public.orion_auction_settlements WHERE listing_id = p_listing;
  IF v_s IS NULL THEN RETURN jsonb_build_object('ok', false, 'erro', 'liquidação inexistente'); END IF;
  SELECT * INTO v_cfg FROM public.orion_auction_settlement_config WHERE id = 1;

  v_pay := coalesce(p_pagamento_ok, v_s.pagamento_ok);
  IF p_pagamento_ok IS NOT NULL THEN
    UPDATE public.orion_auction_settlements SET pagamento_ok = p_pagamento_ok, updated_at = now()
     WHERE listing_id = p_listing;
  END IF;

  v_gate := v_s.comissao_ok AND v_s.creditos_ok AND v_s.auditoria_ok
            AND (v_pay OR NOT coalesce(v_cfg.contact_requires_payment, true));

  IF NOT v_gate THEN
    RETURN jsonb_build_object('ok', false, 'liberado', false, 'gates',
      jsonb_build_object('comissao', v_s.comissao_ok, 'creditos', v_s.creditos_ok,
        'pagamento', v_pay, 'auditoria', v_s.auditoria_ok,
        'exige_pagamento', coalesce(v_cfg.contact_requires_payment, true)));
  END IF;

  UPDATE public.orion_auction_settlements
     SET contato_liberado = true, status = 'released', updated_at = now()
   WHERE listing_id = p_listing;
  INSERT INTO public.orion_auction_audit (listing_id, acao, ator, detalhes)
  VALUES (p_listing, 'contact_released', 'orion-ai-65', jsonb_build_object('pagamento_ok', v_pay));

  RETURN jsonb_build_object('ok', true, 'liberado', true,
    'vendedor', v_s.seller_user_id, 'comprador', v_s.winner_user_id);
END$$;

-- ── 8) Dashboard/KPIs de liquidação (admin) ────────────────────────────────
CREATE OR REPLACE FUNCTION public.orion_auction_settlement_dashboard()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.mp_is_admin() AND session_user <> 'postgres' AND coalesce(auth.role(),'') <> 'service_role' THEN
    RAISE EXCEPTION 'Apenas administradores';
  END IF;
  RETURN jsonb_build_object(
    'total_liquidacoes', (SELECT count(*) FROM public.orion_auction_settlements),
    'arremates',        (SELECT count(*) FROM public.orion_auction_settlements WHERE winner_user_id IS NOT NULL),
    'valor_movimentado',(SELECT coalesce(sum(valor_final),0) FROM public.orion_auction_settlements WHERE winner_user_id IS NOT NULL),
    'comissao_arrecadada',(SELECT coalesce(sum(comissao_valor),0) FROM public.orion_auction_settlements WHERE creditos_ok),
    'comissao_pendente',(SELECT coalesce(sum(comissao_valor),0) FROM public.orion_auction_settlements WHERE winner_user_id IS NOT NULL AND NOT creditos_ok),
    'ticket_medio',     (SELECT coalesce(round(avg(valor_final),2),0) FROM public.orion_auction_settlements WHERE winner_user_id IS NOT NULL),
    'taxa_conversao',   (SELECT CASE WHEN count(*)>0 THEN round(count(*) FILTER (WHERE winner_user_id IS NOT NULL)*100.0/count(*)) ELSE 0 END FROM public.orion_auction_settlements),
    'tempo_medio_horas',(SELECT coalesce(round(avg(duracao_segundos)/3600.0,1),0) FROM public.orion_auction_settlements),
    'por_status',       (SELECT coalesce(jsonb_object_agg(status, n),'{}'::jsonb) FROM (SELECT status, count(*) n FROM public.orion_auction_settlements GROUP BY status) x),
    'por_cidade',       (SELECT coalesce(jsonb_agg(jsonb_build_object('cidade',coalesce(cidade,'(sem)'),'arremates',n,'valor',v) ORDER BY v DESC),'[]'::jsonb)
                          FROM (SELECT cidade, count(*) n, coalesce(sum(valor_final),0) v FROM public.orion_auction_settlements WHERE winner_user_id IS NOT NULL GROUP BY cidade ORDER BY v DESC LIMIT 10) x),
    'ranking_vendedores',(SELECT coalesce(jsonb_agg(jsonb_build_object('vendedor',seller_user_id,'arremates',n,'valor',v) ORDER BY v DESC),'[]'::jsonb)
                          FROM (SELECT seller_user_id, count(*) n, coalesce(sum(valor_final),0) v FROM public.orion_auction_settlements WHERE winner_user_id IS NOT NULL GROUP BY seller_user_id ORDER BY v DESC LIMIT 10) x),
    'ranking_compradores',(SELECT coalesce(jsonb_agg(jsonb_build_object('comprador',winner_user_id,'arremates',n,'valor',v) ORDER BY v DESC),'[]'::jsonb)
                          FROM (SELECT winner_user_id, count(*) n, coalesce(sum(valor_final),0) v FROM public.orion_auction_settlements WHERE winner_user_id IS NOT NULL GROUP BY winner_user_id ORDER BY v DESC LIMIT 10) x),
    'fraude_suspeitas', (SELECT count(*) FROM public.orion_auction_settlements WHERE fraude_score >= 40),
    'gerado_em', to_char(now() AT TIME ZONE 'America/Cuiaba','YYYY-MM-DD HH24:MI'));
END$$;

-- ── 9) Integra a liquidação ao encerramento automático (cron, idempotente) ─
CREATE OR REPLACE FUNCTION public.orion_auction_autoclose_tick()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r record; v_n int := 0; v_s int := 0;
BEGIN
  FOR r IN
    SELECT id FROM public.auction_listings
     WHERE coalesce(status,'active') IN ('active','ativo','published','live')
       AND ends_at IS NOT NULL AND ends_at <= now()
     LIMIT 200
  LOOP
    BEGIN PERFORM public.orion_auction_close(r.id, 'basico'); v_n := v_n + 1;
    EXCEPTION WHEN OTHERS THEN NULL; END;
    BEGIN PERFORM public.orion_auction_settle(r.id); v_s := v_s + 1;   -- AI-65 (não move dinheiro)
    EXCEPTION WHEN OTHERS THEN NULL; END;
  END LOOP;
  RETURN jsonb_build_object('ok', true, 'encerrados', v_n, 'liquidados', v_s, 'em', now());
END$$;

-- ── 10) RLS + permissões (ORION: REVOKE público/anon; leitura por dono/admin)
ALTER TABLE public.orion_auction_settlements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orion_auction_settlement_config ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY orion_settle_read ON public.orion_auction_settlements FOR SELECT TO authenticated
    USING (seller_user_id = auth.uid() OR winner_user_id = auth.uid() OR public.mp_is_admin());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY orion_settle_cfg_read ON public.orion_auction_settlement_config FOR SELECT TO authenticated
    USING (public.mp_is_admin());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

REVOKE ALL ON TABLE public.orion_auction_settlements FROM anon;
REVOKE ALL ON TABLE public.orion_auction_settlement_config FROM anon;
GRANT SELECT ON TABLE public.orion_auction_settlements TO authenticated;
GRANT SELECT ON TABLE public.orion_auction_settlement_config TO authenticated;

REVOKE ALL ON FUNCTION public.orion_auction_validate_bids(uuid) FROM public, anon;
REVOKE ALL ON FUNCTION public.orion_auction_fraud_scan(uuid) FROM public, anon;
REVOKE ALL ON FUNCTION public.orion_auction_settle(uuid) FROM public, anon;
REVOKE ALL ON FUNCTION public.orion_auction_apply_commission(uuid, uuid) FROM public, anon;
REVOKE ALL ON FUNCTION public.orion_auction_release_contact(uuid, boolean) FROM public, anon;
REVOKE ALL ON FUNCTION public.orion_auction_settlement_dashboard() FROM public, anon;

GRANT EXECUTE ON FUNCTION public.orion_auction_validate_bids(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.orion_auction_fraud_scan(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.orion_auction_settlement_dashboard() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.orion_auction_settle(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.orion_auction_apply_commission(uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.orion_auction_release_contact(uuid, boolean) TO service_role;

-- ── 11) Verificação ────────────────────────────────────────────────────────
SELECT
  (SELECT count(*) FROM information_schema.tables WHERE table_schema='public'
     AND table_name IN ('orion_auction_settlements','orion_auction_settlement_config')) AS tabelas_ok,   -- espera 2
  (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public'
     AND p.proname IN ('orion_auction_validate_bids','orion_auction_fraud_scan','orion_auction_settle',
        'orion_auction_apply_commission','orion_auction_release_contact','orion_auction_settlement_dashboard')) AS funcoes_ok, -- espera 6
  (SELECT auto_charge FROM public.orion_auction_settlement_config WHERE id=1) AS auto_charge_off,          -- espera false
  (SELECT position('orion_auction_settle' in pg_get_functiondef(
     (SELECT oid FROM pg_proc WHERE proname='orion_auction_autoclose_tick' LIMIT 1)))>0) AS cron_integrado; -- espera true
