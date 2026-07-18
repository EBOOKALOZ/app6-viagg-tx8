-- ============================================================================
-- ORION-AI-67.1 — Security Hardening & Monetization Engine v1.0 · 2026-07-18
-- ============================================================================
-- FASE 1 (RLS): fecha o buraco crítico da auditoria — anon NÃO edita/exclui/
--   trunca leilões. Habilita RLS em todas as tabelas do módulo, REVOGA DML de
--   anon/public, MANTÉM SELECT público (feed não quebra) e escrita por dono.
-- FASE 2-4 (Monetization): tabela `auction_financial_rules` (paramétrica) —
--   nenhum percentual fixo no código; regra default (auction, 6%, 1cr=R$1).
-- FASE 3: AI-65 (orion_auction_settle) passa a LER a regra ativa (sem constante).
-- FASE 5-6 (Admin/Auditoria): RPCs de upsert/deactivate/list + trilha imutável
--   (quem/quando/antes/depois/IP/origem).
-- FASE 7 (Testes): auction_security_selftest().
--
-- Escrita real via RPC SECURITY DEFINER (bypassa RLS) — inalterada.
-- Idempotente. SQL Editor (broifhfqmnzqoongtokm).
-- ============================================================================

-- ════════════════════════════════════════════════════════════════════════
-- FASE 1 — RLS SECURITY (fecha anon DML; mantém leitura pública)
-- ════════════════════════════════════════════════════════════════════════

-- helper: revoga DML perigoso do anon/public em uma tabela (mantém SELECT)
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'auction_listings','auction_bids','auction_watchers','auction_events',
    'auction_conversion_metrics','arremate_listings','arremate_offers',
    'orion_auction_settlements'
  ] LOOP
    IF to_regclass('public.'||t) IS NOT NULL THEN
      EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
      EXECUTE format('REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.%I FROM anon', t);
      EXECUTE format('REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.%I FROM public', t);
      EXECUTE format('GRANT SELECT ON public.%I TO anon, authenticated', t);
    END IF;
  END LOOP;
END$$;

-- auction_listings: leitura pública + escrita só do dono (policy ALL já existe)
DO $$ BEGIN
  CREATE POLICY auction_listings_public_read ON public.auction_listings FOR SELECT USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- auction_watchers: leitura pública + escrita própria
DO $$ BEGIN
  CREATE POLICY auction_watchers_public_read ON public.auction_watchers FOR SELECT USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY auction_watchers_own_write ON public.auction_watchers FOR ALL TO authenticated
    USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- auction_events / auction_conversion_metrics: leitura pública, escrita só via DEFINER
DO $$ BEGIN
  CREATE POLICY auction_events_public_read ON public.auction_events FOR SELECT USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY auction_metrics_public_read ON public.auction_conversion_metrics FOR SELECT USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- arremate_listings: leitura pública + escrita do dono da loja
DO $$ BEGIN
  CREATE POLICY arremate_listings_public_read ON public.arremate_listings FOR SELECT USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY arremate_listings_owner_write ON public.arremate_listings FOR ALL TO authenticated
    USING (store_id IN (SELECT id FROM public.merchant_stores WHERE user_id = auth.uid()))
    WITH CHECK (store_id IN (SELECT id FROM public.merchant_stores WHERE user_id = auth.uid()));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- arremate_offers: SENSÍVEL (lead c/ WhatsApp) — só cliente, dono da loja ou admin
DO $$ BEGIN
  CREATE POLICY arremate_offers_read ON public.arremate_offers FOR SELECT TO authenticated
    USING (customer_user_id = auth.uid()
        OR arremate_listing_id IN (SELECT al.id FROM public.arremate_listings al
             JOIN public.merchant_stores ms ON ms.id = al.store_id WHERE ms.user_id = auth.uid())
        OR public.mp_is_admin());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ════════════════════════════════════════════════════════════════════════
-- FASE 2 — MONETIZATION CONFIG ENGINE (auction_financial_rules)
-- ════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.auction_financial_rules (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  module             text NOT NULL DEFAULT 'auction',
  category           text,                          -- NULL = regra geral do módulo
  commission_percent numeric NOT NULL DEFAULT 6.0,  -- em PERCENTUAL (6.0 = 6%)
  credits_per_real   numeric NOT NULL DEFAULT 1.00, -- R$1 de comissão -> N créditos
  minimum_credits    int,
  maximum_credits    int,
  minimum_commission numeric,
  maximum_commission numeric,
  currency           text NOT NULL DEFAULT 'BRL',
  active             boolean NOT NULL DEFAULT true,
  effective_from     timestamptz NOT NULL DEFAULT now(),
  effective_until    timestamptz,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  created_by         uuid
);
CREATE INDEX IF NOT EXISTS ix_auction_fin_rules_lookup
  ON public.auction_financial_rules (module, category, active, effective_from DESC);

-- Trilha de auditoria imutável das regras
CREATE TABLE IF NOT EXISTS public.auction_financial_rules_audit (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_id         uuid,
  acao            text NOT NULL,           -- create|update|deactivate
  alterado_por    uuid,
  valor_anterior  jsonb,
  valor_novo      jsonb,
  ip              text,
  origem          text,
  created_at      timestamptz NOT NULL DEFAULT now()
);

-- FASE 4 — regra default (auction, 6%, 1cr=R$1, ativa) — só se não existir
INSERT INTO public.auction_financial_rules (module, category, commission_percent, credits_per_real, active)
SELECT 'auction', NULL, 6.0, 1.00, true
WHERE NOT EXISTS (SELECT 1 FROM public.auction_financial_rules WHERE module='auction' AND category IS NULL AND active);

-- Resolver: regra ativa vigente (categoria exata > geral); usada pelo AI-65
CREATE OR REPLACE FUNCTION public.auction_financial_rule_get(p_module text DEFAULT 'auction', p_category text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE r record;
BEGIN
  SELECT * INTO r FROM public.auction_financial_rules
   WHERE active AND module = p_module
     AND (category IS NULL OR category = p_category)
     AND effective_from <= now()
     AND (effective_until IS NULL OR effective_until > now())
   ORDER BY CASE WHEN category = p_category THEN 0 WHEN category IS NULL THEN 1 ELSE 2 END,
            effective_from DESC
   LIMIT 1;
  IF r IS NULL THEN RETURN NULL; END IF;
  RETURN to_jsonb(r);
END$$;

-- ════════════════════════════════════════════════════════════════════════
-- FASE 3 — AI-65 lê a regra (sem constante no código)
-- ════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.orion_auction_settle(p_listing uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_l record; v_cfg record; v_rule jsonb; v_val jsonb; v_fraud jsonb;
  v_win_user uuid; v_valor_final numeric; v_pct numeric; v_cpr numeric;
  v_com numeric; v_liq numeric; v_cred int; v_total int;
  v_cert jsonb; v_hash text; v_status text; v_existing record;
  v_min_com numeric; v_max_com numeric; v_min_cr int; v_max_cr int;
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
  -- REGRA FINANCEIRA PARAMÉTRICA (nunca hardcoded); fallback = config legada
  v_rule := public.auction_financial_rule_get('auction', v_l.listing_type);
  IF v_rule IS NULL THEN
    v_pct := coalesce(v_cfg.commission_pct,0.06)*100; v_cpr := coalesce(v_cfg.credits_per_real,1.0);
    v_min_com := NULL; v_max_com := NULL; v_min_cr := NULL; v_max_cr := NULL;
  ELSE
    v_pct := (v_rule->>'commission_percent')::numeric;   -- 6.0
    v_cpr := (v_rule->>'credits_per_real')::numeric;
    v_min_com := (v_rule->>'minimum_commission')::numeric; v_max_com := (v_rule->>'maximum_commission')::numeric;
    v_min_cr  := (v_rule->>'minimum_credits')::int;        v_max_cr  := (v_rule->>'maximum_credits')::int;
  END IF;

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

  v_com := round(coalesce(v_valor_final,0) * v_pct/100.0, 2);
  IF v_min_com IS NOT NULL THEN v_com := GREATEST(v_com, v_min_com); END IF;
  IF v_max_com IS NOT NULL THEN v_com := LEAST(v_com, v_max_com); END IF;
  v_liq  := round(coalesce(v_valor_final,0) - v_com, 2);
  v_cred := ceil(v_com * coalesce(v_cpr, 1.0))::int;
  IF v_min_cr IS NOT NULL THEN v_cred := GREATEST(v_cred, v_min_cr); END IF;
  IF v_max_cr IS NOT NULL THEN v_cred := LEAST(v_cred, v_max_cr); END IF;

  v_cert := jsonb_build_object(
    'leilao', p_listing, 'produto', v_l.product_id, 'titulo', v_l.title,
    'vendedor', v_l.owner_user_id, 'comprador', v_win_user,
    'valor_inicial', v_l.starting_bid, 'valor_final', v_valor_final,
    'total_lances', v_total, 'validos', (v_val->>'validos')::int,
    'encerrado_em', v_l.ends_at, 'comissao_pct', v_pct, 'comissao_valor', v_com,
    'regra', coalesce(v_rule->>'id','fallback-config'), 'emitido_em', now());
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
    round(v_pct/100.0, 4), v_valor_final, v_com, v_liq, v_cred, v_status,
    (v_win_user IS NOT NULL), false, false, true, false,
    v_hash, v_cert, (v_fraud->>'score')::int, coalesce(v_fraud->'flags','[]'::jsonb),
    jsonb_build_object('validacao', v_val, 'fraude', v_fraud, 'regra_financeira', v_rule)
  ) ON CONFLICT (listing_id) DO NOTHING;

  IF v_win_user IS NOT NULL AND v_l.winner_user_id IS NULL THEN
    UPDATE public.auction_listings SET winner_user_id = v_win_user, updated_at = now() WHERE id = p_listing;
  END IF;

  INSERT INTO public.orion_auction_audit (listing_id, acao, ator, detalhes)
  VALUES (p_listing, 'settle', 'orion-ai-65',
          jsonb_build_object('status', v_status, 'vencedor', v_win_user, 'comissao', v_com,
            'creditos', v_cred, 'regra', coalesce(v_rule->>'id','fallback'), 'fraude_score', (v_fraud->>'score')::int));

  RETURN jsonb_build_object('ok', true, 'status', v_status, 'vencedor', v_win_user,
    'valor_final', v_valor_final, 'comissao_pct', v_pct, 'comissao_valor', v_com, 'valor_liquido', v_liq,
    'creditos_comissao', v_cred, 'certificado_hash', v_hash, 'regra', coalesce(v_rule->>'id','fallback-config'),
    'fraude_score', (v_fraud->>'score')::int, 'auto_charge', v_cfg.auto_charge);
END$$;

-- ════════════════════════════════════════════════════════════════════════
-- FASE 5-6 — ADMIN (upsert/deactivate/list) + AUDITORIA
-- ════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.auction_financial_rule_upsert(
  p_module text, p_category text, p_commission_percent numeric, p_credits_per_real numeric,
  p_minimum_credits int DEFAULT NULL, p_maximum_credits int DEFAULT NULL,
  p_minimum_commission numeric DEFAULT NULL, p_maximum_commission numeric DEFAULT NULL,
  p_effective_from timestamptz DEFAULT NULL, p_effective_until timestamptz DEFAULT NULL,
  p_ip text DEFAULT NULL, p_origem text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_old jsonb; v_id uuid;
BEGIN
  IF NOT public.mp_is_admin() AND session_user <> 'postgres' THEN RAISE EXCEPTION 'Apenas administradores'; END IF;

  -- desativa a regra vigente do mesmo módulo+categoria (histórico preservado)
  SELECT to_jsonb(r) INTO v_old FROM public.auction_financial_rules r
   WHERE active AND module = p_module AND category IS NOT DISTINCT FROM p_category
   ORDER BY effective_from DESC LIMIT 1;
  UPDATE public.auction_financial_rules SET active = false, updated_at = now()
   WHERE active AND module = p_module AND category IS NOT DISTINCT FROM p_category;

  INSERT INTO public.auction_financial_rules (module, category, commission_percent, credits_per_real,
     minimum_credits, maximum_credits, minimum_commission, maximum_commission,
     effective_from, effective_until, created_by)
  VALUES (p_module, p_category, p_commission_percent, p_credits_per_real,
     p_minimum_credits, p_maximum_credits, p_minimum_commission, p_maximum_commission,
     coalesce(p_effective_from, now()), p_effective_until, auth.uid())
  RETURNING id INTO v_id;

  INSERT INTO public.auction_financial_rules_audit (rule_id, acao, alterado_por, valor_anterior, valor_novo, ip, origem)
  VALUES (v_id, CASE WHEN v_old IS NULL THEN 'create' ELSE 'update' END, auth.uid(), v_old,
     (SELECT to_jsonb(r) FROM public.auction_financial_rules r WHERE id = v_id), p_ip, p_origem);

  RETURN jsonb_build_object('ok', true, 'id', v_id, 'acao', CASE WHEN v_old IS NULL THEN 'create' ELSE 'update' END);
END$$;

CREATE OR REPLACE FUNCTION public.auction_financial_rule_deactivate(p_id uuid, p_ip text DEFAULT NULL, p_origem text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_old jsonb;
BEGIN
  IF NOT public.mp_is_admin() AND session_user <> 'postgres' THEN RAISE EXCEPTION 'Apenas administradores'; END IF;
  SELECT to_jsonb(r) INTO v_old FROM public.auction_financial_rules r WHERE id = p_id;
  IF v_old IS NULL THEN RETURN jsonb_build_object('ok', false, 'erro', 'regra inexistente'); END IF;
  UPDATE public.auction_financial_rules SET active = false, updated_at = now() WHERE id = p_id;
  INSERT INTO public.auction_financial_rules_audit (rule_id, acao, alterado_por, valor_anterior, valor_novo, ip, origem)
  VALUES (p_id, 'deactivate', auth.uid(), v_old,
     (SELECT to_jsonb(r) FROM public.auction_financial_rules r WHERE id = p_id), p_ip, p_origem);
  RETURN jsonb_build_object('ok', true, 'id', p_id);
END$$;

CREATE OR REPLACE FUNCTION public.auction_financial_rules_list()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.mp_is_admin() AND session_user <> 'postgres' AND coalesce(auth.role(),'') <> 'service_role' THEN
    RAISE EXCEPTION 'Apenas administradores'; END IF;
  RETURN jsonb_build_object(
    'regras', (SELECT coalesce(jsonb_agg(to_jsonb(r) ORDER BY r.active DESC, r.effective_from DESC),'[]'::jsonb)
               FROM public.auction_financial_rules r),
    'auditoria', (SELECT coalesce(jsonb_agg(to_jsonb(a) ORDER BY a.created_at DESC),'[]'::jsonb)
               FROM (SELECT * FROM public.auction_financial_rules_audit ORDER BY created_at DESC LIMIT 50) a),
    'gerado_em', now());
END$$;

-- RLS/permissões das novas tabelas
ALTER TABLE public.auction_financial_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.auction_financial_rules_audit ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY afr_admin_read ON public.auction_financial_rules FOR SELECT TO authenticated USING (public.mp_is_admin());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY afr_audit_admin_read ON public.auction_financial_rules_audit FOR SELECT TO authenticated USING (public.mp_is_admin());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
REVOKE ALL ON TABLE public.auction_financial_rules FROM anon, public;
REVOKE ALL ON TABLE public.auction_financial_rules_audit FROM anon, public;
GRANT SELECT ON TABLE public.auction_financial_rules TO authenticated;
GRANT SELECT ON TABLE public.auction_financial_rules_audit TO authenticated;

REVOKE ALL ON FUNCTION public.auction_financial_rule_get(text, text) FROM public, anon;
REVOKE ALL ON FUNCTION public.auction_financial_rule_upsert(text,text,numeric,numeric,int,int,numeric,numeric,timestamptz,timestamptz,text,text) FROM public, anon;
REVOKE ALL ON FUNCTION public.auction_financial_rule_deactivate(uuid,text,text) FROM public, anon;
REVOKE ALL ON FUNCTION public.auction_financial_rules_list() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.auction_financial_rule_get(text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.auction_financial_rule_upsert(text,text,numeric,numeric,int,int,numeric,numeric,timestamptz,timestamptz,text,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.auction_financial_rule_deactivate(uuid,text,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.auction_financial_rules_list() TO authenticated, service_role;

-- ════════════════════════════════════════════════════════════════════════
-- FASE 7 — TESTES (selftest de segurança + monetização)
-- ════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.auction_security_selftest()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_tabs text[] := ARRAY['auction_listings','auction_bids','auction_watchers','auction_events',
    'auction_conversion_metrics','arremate_listings','arremate_offers','orion_auction_settlements'];
  v_rls int; v_anon_dml int; v_pol int; v_rule int;
BEGIN
  SELECT count(*) INTO v_rls FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
   WHERE n.nspname='public' AND c.relname = ANY(v_tabs) AND c.relrowsecurity;
  SELECT count(*) INTO v_anon_dml FROM information_schema.role_table_grants
   WHERE table_schema='public' AND table_name = ANY(v_tabs) AND grantee='anon'
     AND privilege_type IN ('INSERT','UPDATE','DELETE','TRUNCATE');
  SELECT count(*) INTO v_pol FROM pg_policies WHERE schemaname='public' AND tablename = ANY(v_tabs);
  SELECT count(*) INTO v_rule FROM public.auction_financial_rules WHERE module='auction' AND active;

  RETURN jsonb_build_object(
    'rls_habilitado', jsonb_build_object('esperado', array_length(v_tabs,1), 'obtido', v_rls, 'pass', v_rls = array_length(v_tabs,1)),
    'anon_sem_dml',   jsonb_build_object('grants_dml_anon', v_anon_dml, 'pass', v_anon_dml = 0),
    'policies_total', v_pol,
    'regra_ativa',    jsonb_build_object('obtido', v_rule, 'pass', v_rule >= 1),
    'regra_resolvida', public.auction_financial_rule_get('auction', 'auction'),
    'pass_geral', (v_rls = array_length(v_tabs,1) AND v_anon_dml = 0 AND v_rule >= 1),
    'gerado_em', now());
END$$;
REVOKE ALL ON FUNCTION public.auction_security_selftest() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.auction_security_selftest() TO authenticated, service_role;

-- ── Verificação inline ──────────────────────────────────────────────────
SELECT public.auction_security_selftest() AS selftest;
