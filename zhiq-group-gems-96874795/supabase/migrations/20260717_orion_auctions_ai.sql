-- ============================================================================
-- ORION LEILÕES AI v1.0 — FASE 1 (motor DB)  · 2026-07-17
-- ============================================================================
-- Transforma o leilão existente em módulo ORION. ESTENDE a base já presente
--   (auction_listings/auction_bids/auction_watchers/auction_events) — NÃO
--   recria nem toca os RPCs legados create_auction_listing*/place_auction_bid.
--
-- Adiciona a camada ORION (namespace orion_auction_*):
--   * ANTI-SNIPER: lance nos últimos 30s empurra o fim +30s (trigger, vale p/
--     qualquer caminho de lance, sem alterar os RPCs existentes).
--   * SCORE DE ENGAJAMENTO por PARTICIPANTES ÚNICOS (0-9=0,10-19=1,20-39=2,
--     40-79=3,80+=5 créditos) — nunca conta quantidade de lances.
--   * ENCERRAMENTO: vencedor (maior lance ≥ reserva), consumo de crédito
--     (pacote leilão fixo + engajamento), relatório e auditoria; idempotente.
--   * SUGESTÕES ORION (setup pré-publicação) a partir de sinais reais; lacunas
--     DECLARADAS, nunca inventadas.
--   * Pacotes: leilão (operação) e divulgação (5/10/30/dia via Publisher) —
--     SEPARADOS (monetização independente). Criar leilão e dar lance = grátis.
--
-- Crédito do lojista: advertiser_credit_balances (available/consumed) +
--   advertiser_credit_ledger — mesmo mecanismo do debitSellerCredits (server-
--   authoritative aqui, via SECURITY DEFINER).
--
-- Idempotente / auditável. SECURITY DEFINER + guarda. SQL Editor (broifhfqmnzqoongtokm).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1) TABELAS (camada ORION)
-- ----------------------------------------------------------------------------

-- 1.1 Pacote LEILÃO (operação) — créditos fixos consumidos no encerramento c/ vencedor
CREATE TABLE IF NOT EXISTS public.orion_auction_packages (
  id           text        PRIMARY KEY,           -- ex.: 'basico'
  nome         text        NOT NULL,
  creditos_encerramento integer NOT NULL DEFAULT 3, -- consumo fixo ao fechar c/ vencedor
  ativo        boolean     NOT NULL DEFAULT true,
  descricao    text,
  criado_em    timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.orion_auction_packages IS 'ORION Leilões: pacote de OPERAÇÃO. creditos_encerramento = consumo fixo ao encerrar com vencedor (separado da divulgação).';

-- 1.2 Pacote DIVULGAÇÃO (usa ORION Publisher) — 5/10/30 posts/dia
CREATE TABLE IF NOT EXISTS public.orion_auction_promo_packages (
  id           text        PRIMARY KEY,           -- '5','10','30'
  nome         text        NOT NULL,
  posts_por_dia integer    NOT NULL,
  preco_creditos integer   NOT NULL DEFAULT 0,
  ativo        boolean     NOT NULL DEFAULT true,
  criado_em    timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.orion_auction_promo_packages IS 'ORION Leilões: pacotes de DIVULGAÇÃO (5/10/30 posts/dia via Publisher). Independente do pacote de operação.';

-- 1.3 Consumo de crédito do leilão (auditoria de cobrança)
CREATE TABLE IF NOT EXISTS public.orion_auction_credit_consumption (
  id           bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  listing_id   uuid        NOT NULL,
  advertiser_account_id uuid,
  tipo         text        NOT NULL,              -- 'encerramento' | 'engajamento'
  participantes_unicos integer NOT NULL DEFAULT 0,
  creditos     integer     NOT NULL DEFAULT 0,
  evidencia    jsonb       NOT NULL DEFAULT '{}'::jsonb,
  created_at   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT orion_auction_consumo_uq UNIQUE (listing_id, tipo)   -- idempotência por leilão/tipo
);
COMMENT ON TABLE public.orion_auction_credit_consumption IS 'ORION Leilões: registro imutável do consumo de crédito (encerramento fixo + engajamento por participantes únicos). 1 por listing/tipo (idempotente).';

-- 1.4 Sugestões ORION (setup pré-publicação) — cache com evidência
CREATE TABLE IF NOT EXISTS public.orion_auction_suggestions (
  listing_id   uuid        PRIMARY KEY,
  melhor_horario text,
  duracao_horas integer,
  preco_inicial_ideal numeric,
  incremento_recomendado numeric,
  estimativa_participantes integer,
  estimativa_valor_final numeric,
  expectativa_sucesso integer,                     -- 0-100
  confianca    integer     NOT NULL DEFAULT 0,     -- 0-100
  evidencia    jsonb       NOT NULL DEFAULT '{}'::jsonb,
  updated_at   timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.orion_auction_suggestions IS 'ORION Leilões AI: sugestões de setup por leilão, a partir de sinais reais. Lacunas declaradas (evidencia), nunca inventadas.';

-- 1.5 Relatório final (após encerrar)
CREATE TABLE IF NOT EXISTS public.orion_auction_reports (
  listing_id   uuid        PRIMARY KEY,
  participantes_unicos integer NOT NULL DEFAULT 0,
  total_lances integer     NOT NULL DEFAULT 0,
  vencedor_user_id uuid,
  valor_final  numeric,
  creditos_consumidos integer NOT NULL DEFAULT 0,
  score_final  integer     NOT NULL DEFAULT 0,     -- Score Final do Leilão (0-100)
  roi_divulgacao numeric,                          -- receita_estimada / custo_divulgacao (declarado se sem custo)
  evolucao_lances jsonb    NOT NULL DEFAULT '[]'::jsonb,
  gerado_em    timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.orion_auction_reports IS 'ORION Leilões: relatório final por leilão encerrado (participantes/vencedor/valor/créditos/score/ROI/evolução).';

-- 1.6 Auditoria imutável do módulo
CREATE TABLE IF NOT EXISTS public.orion_auction_audit (
  id           bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  listing_id   uuid,
  acao         text        NOT NULL,
  ator         text,
  detalhes     jsonb       NOT NULL DEFAULT '{}'::jsonb,
  created_at   timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.orion_auction_audit IS 'ORION Leilões: auditoria imutável (criação/publicação/encerramento/consumo). Sem UPDATE/DELETE direto.';
CREATE INDEX IF NOT EXISTS ix_orion_auction_audit_listing ON public.orion_auction_audit (listing_id, created_at DESC);

-- ----------------------------------------------------------------------------
-- 2) RLS + imutabilidade
-- ----------------------------------------------------------------------------
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['orion_auction_packages','orion_auction_promo_packages',
    'orion_auction_credit_consumption','orion_auction_suggestions','orion_auction_reports','orion_auction_audit'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
  END LOOP;

  -- catálogos: leitura autenticada
  FOREACH t IN ARRAY ARRAY['orion_auction_packages','orion_auction_promo_packages'] LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename=t AND policyname=t||'_read') THEN
      EXECUTE format('CREATE POLICY %I ON public.%I FOR SELECT USING (auth.role() IN (''authenticated'',''service_role'') OR public.mp_is_admin())', t||'_read', t);
    END IF;
  END LOOP;

  -- por-leilão: dono do leilão OU admin
  FOREACH t IN ARRAY ARRAY['orion_auction_credit_consumption','orion_auction_suggestions','orion_auction_reports','orion_auction_audit'] LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename=t AND policyname=t||'_owner_read') THEN
      EXECUTE format($f$CREATE POLICY %I ON public.%I FOR SELECT USING (
        public.mp_is_admin() OR EXISTS (
          SELECT 1 FROM public.auction_listings al
          WHERE al.id = %I.listing_id AND al.owner_user_id = auth.uid()))$f$, t||'_owner_read', t, t);
    END IF;
  END LOOP;
END$$;

REVOKE UPDATE, DELETE ON public.orion_auction_credit_consumption FROM authenticated, anon;
REVOKE UPDATE, DELETE ON public.orion_auction_audit             FROM authenticated, anon;

-- ----------------------------------------------------------------------------
-- 3) ANTI-SNIPER — lance nos últimos 30s empurra o fim +30s
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.orion_auction_antisniper()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_ends timestamptz; v_status text;
BEGIN
  SELECT ends_at, status INTO v_ends, v_status FROM public.auction_listings WHERE id = NEW.listing_id;
  IF v_ends IS NOT NULL
     AND coalesce(v_status,'active') IN ('active','ativo','published','publicado','live')
     AND v_ends > now()
     AND v_ends <= now() + interval '30 seconds' THEN
    UPDATE public.auction_listings SET ends_at = v_ends + interval '30 seconds', updated_at = now()
     WHERE id = NEW.listing_id;
    INSERT INTO public.orion_auction_audit (listing_id, acao, ator, detalhes)
    VALUES (NEW.listing_id, 'antisniper_extend', 'system',
      jsonb_build_object('de', v_ends, 'para', v_ends + interval '30 seconds', 'bid_id', NEW.id));
  END IF;
  RETURN NEW;
END$$;

DROP TRIGGER IF EXISTS trg_orion_auction_antisniper ON public.auction_bids;
CREATE TRIGGER trg_orion_auction_antisniper
  AFTER INSERT ON public.auction_bids
  FOR EACH ROW EXECUTE FUNCTION public.orion_auction_antisniper();

-- ----------------------------------------------------------------------------
-- 4) PARTICIPANTES ÚNICOS + SCORE DE ENGAJAMENTO
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.orion_auction_unique_participants(p_listing_id uuid)
RETURNS integer LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT count(DISTINCT user_id)::int FROM public.auction_bids WHERE listing_id = p_listing_id;
$$;

CREATE OR REPLACE FUNCTION public.orion_auction_engagement_credits(p_unique int)
RETURNS integer LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE
    WHEN p_unique >= 80 THEN 5
    WHEN p_unique >= 40 THEN 3
    WHEN p_unique >= 20 THEN 2
    WHEN p_unique >= 10 THEN 1
    ELSE 0 END;
$$;

CREATE OR REPLACE FUNCTION public.orion_auction_engagement(p_listing_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_object(
    'participantes_unicos', u,
    'creditos_engajamento', public.orion_auction_engagement_credits(u),
    'faixa', CASE WHEN u>=80 THEN '80+' WHEN u>=40 THEN '40-79' WHEN u>=20 THEN '20-39' WHEN u>=10 THEN '10-19' ELSE '0-9' END,
    'nota', 'Score por PARTICIPANTES ÚNICOS (nunca quantidade de lances).')
  FROM (SELECT public.orion_auction_unique_participants(p_listing_id) u) x;
$$;

-- ----------------------------------------------------------------------------
-- 5) CONSUMO DE CRÉDITO (server-authoritative) — advertiser_credit_balances + ledger
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.orion_auction_charge(p_acc uuid, p_amount int, p_reason text, p_listing uuid, p_desc text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_av numeric; v_co numeric;
BEGIN
  IF p_acc IS NULL OR coalesce(p_amount,0) <= 0 THEN RETURN false; END IF;
  SELECT available_credits, consumed_credits INTO v_av, v_co
    FROM public.advertiser_credit_balances WHERE advertiser_account_id = p_acc FOR UPDATE;
  IF v_av IS NULL OR v_av < p_amount THEN RETURN false; END IF;
  UPDATE public.advertiser_credit_balances
     SET available_credits = v_av - p_amount, consumed_credits = coalesce(v_co,0) + p_amount, updated_at = now()
   WHERE advertiser_account_id = p_acc;
  INSERT INTO public.advertiser_credit_ledger (advertiser_account_id, entry_type, amount, balance_before, balance_after, reason_code, description, metadata)
  VALUES (p_acc, 'debit', -p_amount, v_av, v_av - p_amount, p_reason, p_desc,
          jsonb_build_object('ref_type','auction','ref_id',p_listing));
  RETURN true;
END$$;

-- ----------------------------------------------------------------------------
-- 6) ENCERRAMENTO — vencedor + consumo (fixo + engajamento) + relatório + auditoria
--    Idempotente (não fecha 2x; não cobra 2x).
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.orion_auction_close(p_listing_id uuid, p_package text DEFAULT 'basico')
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  al          public.auction_listings%ROWTYPE;
  v_acc       uuid;
  v_winner    uuid;
  v_valor     numeric;
  v_uniq      int;
  v_eng       int;
  v_fixo      int;
  v_total     int := 0;
  v_reserve   numeric;
  v_charged_fixo boolean := false;
  v_charged_eng  boolean := false;
BEGIN
  IF session_user <> 'postgres' AND coalesce(auth.role(),'') <> 'service_role'
     AND NOT public.mp_is_admin()
     AND NOT EXISTS (SELECT 1 FROM public.auction_listings a WHERE a.id=p_listing_id AND a.owner_user_id=auth.uid()) THEN
    RAISE EXCEPTION 'orion_auction_close: acesso negado';
  END IF;

  SELECT * INTO al FROM public.auction_listings WHERE id = p_listing_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'leilão inexistente'; END IF;

  -- idempotência: se já há relatório, retorna o existente
  IF EXISTS (SELECT 1 FROM public.orion_auction_reports WHERE listing_id = p_listing_id) THEN
    RETURN (SELECT to_jsonb(r) FROM public.orion_auction_reports r WHERE listing_id = p_listing_id);
  END IF;

  -- maior lance (amount_cents → reais) e possível vencedor
  SELECT user_id, max_amount/100.0 INTO v_winner, v_valor FROM (
    SELECT user_id, amount_cents max_amount FROM public.auction_bids
     WHERE listing_id = p_listing_id ORDER BY amount_cents DESC, created_at ASC LIMIT 1) b;

  v_reserve := coalesce(al.reserve_price, 0);
  -- reserva não atingida → sem vencedor
  IF v_valor IS NULL OR v_valor < v_reserve THEN
    v_winner := NULL;
  END IF;

  v_uniq  := public.orion_auction_unique_participants(p_listing_id);
  v_eng   := public.orion_auction_engagement_credits(v_uniq);
  SELECT creditos_encerramento INTO v_fixo FROM public.orion_auction_packages WHERE id = coalesce(p_package,'basico') AND ativo;
  v_fixo := coalesce(v_fixo, 0);

  -- conta de crédito do dono
  SELECT id INTO v_acc FROM public.advertiser_accounts WHERE user_id = al.owner_user_id LIMIT 1;

  -- consumo só quando HÁ vencedor (encerramento fixo) — engajamento sempre que aplicável
  IF v_winner IS NOT NULL AND v_fixo > 0 THEN
    v_charged_fixo := public.orion_auction_charge(v_acc, v_fixo, 'auction_close', p_listing_id, 'Encerramento de leilão (pacote '||coalesce(p_package,'basico')||')');
    IF v_charged_fixo THEN
      INSERT INTO public.orion_auction_credit_consumption (listing_id, advertiser_account_id, tipo, participantes_unicos, creditos, evidencia)
      VALUES (p_listing_id, v_acc, 'encerramento', v_uniq, v_fixo, jsonb_build_object('pacote',coalesce(p_package,'basico')))
      ON CONFLICT (listing_id, tipo) DO NOTHING;
      v_total := v_total + v_fixo;
    END IF;
  END IF;

  IF v_eng > 0 THEN
    v_charged_eng := public.orion_auction_charge(v_acc, v_eng, 'auction_engagement', p_listing_id, 'Engajamento do leilão ('||v_uniq||' participantes únicos)');
    IF v_charged_eng THEN
      INSERT INTO public.orion_auction_credit_consumption (listing_id, advertiser_account_id, tipo, participantes_unicos, creditos, evidencia)
      VALUES (p_listing_id, v_acc, 'engajamento', v_uniq, v_eng, jsonb_build_object('faixa',
        CASE WHEN v_uniq>=80 THEN '80+' WHEN v_uniq>=40 THEN '40-79' WHEN v_uniq>=20 THEN '20-39' WHEN v_uniq>=10 THEN '10-19' ELSE '0-9' END))
      ON CONFLICT (listing_id, tipo) DO NOTHING;
      v_total := v_total + v_eng;
    END IF;
  END IF;

  -- fecha o leilão
  UPDATE public.auction_listings
     SET status = 'ended', winner_user_id = v_winner, current_bid = coalesce(v_valor, current_bid), updated_at = now()
   WHERE id = p_listing_id;

  -- relatório final
  INSERT INTO public.orion_auction_reports (listing_id, participantes_unicos, total_lances, vencedor_user_id, valor_final,
    creditos_consumidos, score_final, roi_divulgacao, evolucao_lances, gerado_em)
  SELECT p_listing_id, v_uniq,
    (SELECT count(*) FROM public.auction_bids WHERE listing_id = p_listing_id),
    v_winner, v_valor, v_total,
    least(100, v_uniq*3 + (SELECT count(*) FROM public.auction_bids WHERE listing_id=p_listing_id)*2)::int,
    NULL,
    coalesce((SELECT jsonb_agg(jsonb_build_object('t',created_at,'v',amount_cents/100.0) ORDER BY created_at)
              FROM public.auction_bids WHERE listing_id = p_listing_id), '[]'::jsonb),
    now()
  ON CONFLICT (listing_id) DO NOTHING;

  INSERT INTO public.orion_auction_audit (listing_id, acao, ator, detalhes)
  VALUES (p_listing_id, 'close', coalesce(auth.uid()::text,'system'),
    jsonb_build_object('vencedor',v_winner,'valor_final',v_valor,'participantes',v_uniq,'creditos',v_total));

  RETURN (SELECT to_jsonb(r) FROM public.orion_auction_reports r WHERE listing_id = p_listing_id);
END$$;
GRANT EXECUTE ON FUNCTION public.orion_auction_close(uuid, text) TO authenticated, service_role;

-- ----------------------------------------------------------------------------
-- 7) SUGESTÕES ORION (setup pré-publicação) — sinais reais + lacunas declaradas
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.orion_auction_suggest(
  p_owner_user_id uuid, p_starting_bid numeric DEFAULT NULL, p_category text DEFAULT NULL, p_listing_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_hist        int;
  v_avg_final   numeric;
  v_avg_uniq    numeric;
  v_best_hour   int;
  v_preco       numeric;
  v_incremento  numeric;
  v_dur         int;
  v_est_part    int;
  v_est_final   numeric;
  v_sucesso     int;
  v_conf        int;
  v_out         jsonb;
BEGIN
  -- histórico do próprio lojista (leilões já encerrados com relatório)
  SELECT count(*), avg(r.valor_final), avg(r.participantes_unicos)
    INTO v_hist, v_avg_final, v_avg_uniq
  FROM public.orion_auction_reports r
  JOIN public.auction_listings al ON al.id = r.listing_id
  WHERE al.owner_user_id = p_owner_user_id;

  -- melhor horário: hora com mais lances no histórico (fallback 20h)
  SELECT hr INTO v_best_hour FROM (
    SELECT extract(hour FROM ab.created_at)::int hr, count(*) n
    FROM public.auction_bids ab JOIN public.auction_listings al ON al.id = ab.listing_id
    WHERE al.owner_user_id = p_owner_user_id GROUP BY 1 ORDER BY n DESC LIMIT 1) h;
  v_best_hour := coalesce(v_best_hour, 20);

  v_preco      := coalesce(p_starting_bid, round(coalesce(v_avg_final,100) * 0.4, 2));
  v_incremento := greatest(1, round(v_preco * 0.05, 2));
  v_dur        := 24;  -- padrão; ajustável pelo usuário
  v_est_part   := coalesce(round(v_avg_uniq)::int, 8);
  v_est_final  := coalesce(round(v_avg_final, 2), round(v_preco * 2.2, 2));
  v_sucesso    := least(100, coalesce(v_hist,0)*8 + v_est_part*3);
  v_conf       := least(100, 30 + coalesce(v_hist,0)*12);

  v_out := jsonb_build_object(
    'melhor_horario', lpad(v_best_hour::text,2,'0')||':00',
    'duracao_horas', v_dur,
    'preco_inicial_ideal', v_preco,
    'incremento_recomendado', v_incremento,
    'estimativa_participantes', v_est_part,
    'estimativa_valor_final', v_est_final,
    'expectativa_sucesso', v_sucesso,
    'confianca', v_conf,
    'evidencia', jsonb_build_object(
      'leiloes_anteriores', coalesce(v_hist,0),
      'media_valor_final', v_avg_final,
      'media_participantes', v_avg_uniq,
      'nota', CASE WHEN coalesce(v_hist,0)=0
        THEN 'Sem histórico do lojista — sugestões baseadas em heurística declarada, não em dados passados.'
        ELSE 'Baseado no histórico real de leilões deste lojista.' END));

  IF p_listing_id IS NOT NULL THEN
    INSERT INTO public.orion_auction_suggestions (listing_id, melhor_horario, duracao_horas, preco_inicial_ideal,
      incremento_recomendado, estimativa_participantes, estimativa_valor_final, expectativa_sucesso, confianca, evidencia, updated_at)
    VALUES (p_listing_id, lpad(v_best_hour::text,2,'0')||':00', v_dur, v_preco, v_incremento, v_est_part, v_est_final, v_sucesso, v_conf, v_out->'evidencia', now())
    ON CONFLICT (listing_id) DO UPDATE SET melhor_horario=excluded.melhor_horario, duracao_horas=excluded.duracao_horas,
      preco_inicial_ideal=excluded.preco_inicial_ideal, incremento_recomendado=excluded.incremento_recomendado,
      estimativa_participantes=excluded.estimativa_participantes, estimativa_valor_final=excluded.estimativa_valor_final,
      expectativa_sucesso=excluded.expectativa_sucesso, confianca=excluded.confianca, evidencia=excluded.evidencia, updated_at=now();
  END IF;

  RETURN v_out;
END$$;
GRANT EXECUTE ON FUNCTION public.orion_auction_suggest(uuid, numeric, text, uuid) TO authenticated, service_role;

-- ----------------------------------------------------------------------------
-- 8) LEITURAS — painel lojista + relatório
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.orion_auction_panel(p_owner_user_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_owner uuid;
BEGIN
  v_owner := coalesce(p_owner_user_id, auth.uid());
  IF v_owner IS NULL THEN RAISE EXCEPTION 'requer usuário'; END IF;
  IF v_owner <> auth.uid() AND NOT public.mp_is_admin()
     AND coalesce(auth.role(),'') <> 'service_role' AND session_user <> 'postgres' THEN
    RAISE EXCEPTION 'acesso negado';
  END IF;
  RETURN jsonb_build_object(
    'ativos', (SELECT count(*) FROM public.auction_listings WHERE owner_user_id=v_owner AND coalesce(status,'active') IN ('active','ativo','published','live')),
    'agendados', (SELECT count(*) FROM public.auction_listings WHERE owner_user_id=v_owner AND (starts_at > now() OR status IN ('scheduled','agendado'))),
    'encerrados', (SELECT count(*) FROM public.auction_listings WHERE owner_user_id=v_owner AND status IN ('ended','encerrado','closed')),
    'leiloes', (SELECT coalesce(jsonb_agg(jsonb_build_object(
        'id',al.id,'titulo',al.title,'status',al.status,'valor_atual',al.current_bid,'fim',al.ends_at,
        'participantes_unicos',public.orion_auction_unique_participants(al.id),
        'total_lances',al.total_bids,
        'engajamento',public.orion_auction_engagement(al.id),
        'creditos_consumidos',(SELECT coalesce(sum(creditos),0) FROM public.orion_auction_credit_consumption WHERE listing_id=al.id)
      ) ORDER BY al.created_at DESC),'[]'::jsonb)
      FROM public.auction_listings al WHERE al.owner_user_id=v_owner),
    'gerado_em', now());
END$$;
GRANT EXECUTE ON FUNCTION public.orion_auction_panel(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.orion_auction_report_get(p_listing_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT to_jsonb(r) FROM public.orion_auction_reports r WHERE listing_id = p_listing_id;
$$;
GRANT EXECUTE ON FUNCTION public.orion_auction_report_get(uuid) TO authenticated, service_role;

-- ----------------------------------------------------------------------------
-- 9) SEEDS (idempotentes)
-- ----------------------------------------------------------------------------
INSERT INTO public.orion_auction_packages (id, nome, creditos_encerramento, descricao) VALUES
  ('basico','Leilão Básico',3,'Consome 3 créditos ao encerrar com vencedor')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.orion_auction_promo_packages (id, nome, posts_por_dia, preco_creditos) VALUES
  ('5','Divulgação 5/dia',5,0), ('10','Divulgação 10/dia',10,0), ('30','Divulgação 30/dia',30,0)
ON CONFLICT (id) DO NOTHING;

-- ----------------------------------------------------------------------------
-- 10) PROMPT REGISTRY (5 prompts) + MODEL PREF (chave 'auctions')
-- ----------------------------------------------------------------------------
SELECT public.orion_ai_prompt_set('auction.suggest_setup',
 'Voce e o ORION Leiloes AI. Sugira o setup de um leilao (melhor horario, duracao, preco inicial, incremento, estimativa de participantes e valor final, expectativa de sucesso) a partir das evidencias reais fornecidas. Se nao houver historico, declare que a sugestao e heuristica — nunca invente dados.',
 'ORION Leiloes seed');
SELECT public.orion_ai_prompt_set('auction.during',
 'Voce e o ORION Leiloes AI. Durante o leilao, com base nas evidencias (participantes, lances, tempo restante), sugira acoes: aumentar divulgacao, melhor horario, prolongar campanha, novos pacotes, tendencia de encerramento e probabilidade de sucesso. Recomende, nunca execute sozinho.',
 'ORION Leiloes seed');
SELECT public.orion_ai_prompt_set('auction.report',
 'Voce e o ORION Leiloes AI. Gere um relatorio executivo do leilao encerrado (participantes, vencedor, valor final, evolucao dos lances, creditos consumidos, ROI da divulgacao, Score Final) so com base nas evidencias.',
 'ORION Leiloes seed');
SELECT public.orion_ai_prompt_set('auction.explain_engagement',
 'Voce e o ORION Leiloes AI. Explique o Score de Engajamento por PARTICIPANTES UNICOS (nunca quantidade de lances) e como ele define o consumo de creditos, com base nas faixas 0-9/10-19/20-39/40-79/80+.',
 'ORION Leiloes seed');
SELECT public.orion_ai_prompt_set('auction.forecast',
 'Voce e o ORION Leiloes AI. Estime a tendencia de encerramento e a probabilidade de sucesso do leilao a partir do ritmo de lances e participantes reais. Declare a incerteza.',
 'ORION Leiloes seed');

INSERT INTO public.orion_ai_module_prefs (module, model_code) VALUES ('auctions','gpt-5-mini') ON CONFLICT (module) DO NOTHING;

-- ----------------------------------------------------------------------------
-- 11) VERIFICAÇÃO (esperado: tabelas=6, funcoes>=9, packages=1, promo=3, prompts=5)
-- ----------------------------------------------------------------------------
SELECT
  (SELECT count(*) FROM information_schema.tables WHERE table_schema='public' AND table_name LIKE 'orion_auction_%') AS tabelas,
  (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname LIKE 'orion_auction_%') AS funcoes,
  (SELECT count(*) FROM public.orion_auction_packages) AS packages,
  (SELECT count(*) FROM public.orion_auction_promo_packages) AS promo,
  (SELECT count(*) FROM public.orion_ai_prompts WHERE chave LIKE 'auction.%') AS prompts;

-- ============================================================================
-- ROLLBACK (manual):
--   DROP TRIGGER IF EXISTS trg_orion_auction_antisniper ON public.auction_bids;
--   DROP FUNCTION IF EXISTS public.orion_auction_antisniper, public.orion_auction_unique_participants(uuid),
--     public.orion_auction_engagement_credits(int), public.orion_auction_engagement(uuid),
--     public.orion_auction_charge(uuid,int,text,uuid,text), public.orion_auction_close(uuid,text),
--     public.orion_auction_suggest(uuid,numeric,text,uuid), public.orion_auction_panel(uuid),
--     public.orion_auction_report_get(uuid) CASCADE;
--   DROP TABLE IF EXISTS public.orion_auction_audit, public.orion_auction_reports, public.orion_auction_suggestions,
--     public.orion_auction_credit_consumption, public.orion_auction_promo_packages, public.orion_auction_packages CASCADE;
--   DELETE FROM public.orion_ai_module_prefs WHERE module='auctions';
-- ============================================================================
