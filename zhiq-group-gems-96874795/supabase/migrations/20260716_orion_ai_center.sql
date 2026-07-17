-- ============================================================================
-- ORION-AI-37 — AI COST & INTELLIGENCE CENTER v1.0  (o "CFO das IAs")
-- ============================================================================
-- Centro financeiro/operacional das IAs: monitora, audita e otimiza custos,
--   consumo, desempenho e ROI. Fonte de verdade REAL = orion_ai_log (Gateway
--   AI-00 registra module/model/tokens_in/tokens_out/custo_estimado/duracao_ms/
--   cache_hit/erro/retries/user_id por chamada) + orion_ai_cache + orion_ai_models.
--
-- Nenhuma chamada de IA ocorre sem registro (o Gateway ja garante isso). Este
--   modulo AGREGA (read-only sobre o log; nunca reescreve historico) em snapshots
--   diarios imutaveis por upsert idempotente + KPIs + forecast + simulador.
--
-- Anti-colisao: orion_ai_cache/orion_ai_log/orion_ai_models JA EXISTEM (Gateway)
--   -> REUTILIZADAS, nunca recriadas. Tabelas novas: orion_ai_usage/costs/tokens/
--   roi/forecast/alerts. Funcoes ai_center_*. Chave de modulo ai_center.
--
-- KPIs oficiais: ACS (Cost) · AES (Efficiency) · ARS (ROI) · CES (Cache) ·
--   TES (Token) · CPR/CPS/CPC/CPO (custo por recomendacao/busca/conversa/pedido).
--
-- Premissas DECLARADAS: USD->BRL = 6.0 (fixo); custo de infraestrutura por
--   usuario/mes no simulador = estimativa declarada. Nunca inventa consumo.
--
-- Idempotente / auditavel / SECURITY DEFINER + guarda. ROLLBACK ao fim.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1) TABELAS (novas — as 6 do spec; orion_ai_cache reaproveitada do Gateway)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.orion_ai_usage (
  id                bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  dia               date        NOT NULL,
  module            text        NOT NULL,
  chamadas          integer     NOT NULL DEFAULT 0,
  tokens_in         bigint      NOT NULL DEFAULT 0,
  tokens_out        bigint      NOT NULL DEFAULT 0,
  custo_usd         numeric     NOT NULL DEFAULT 0,
  latencia_media_ms integer     NOT NULL DEFAULT 0,
  cache_hits        integer     NOT NULL DEFAULT 0,
  erros             integer     NOT NULL DEFAULT 0,
  disponibilidade   numeric     NOT NULL DEFAULT 100,
  atualizado_em     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT orion_ai_usage_uq UNIQUE (dia, module)
);
COMMENT ON TABLE public.orion_ai_usage IS 'ORION-AI-37: consumo diario de IA por modulo (agregado real de orion_ai_log).';
CREATE INDEX IF NOT EXISTS ix_orion_ai_usage_dia ON public.orion_ai_usage (dia DESC);

CREATE TABLE IF NOT EXISTS public.orion_ai_costs (
  id               bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  dia              date        NOT NULL UNIQUE,
  custo_total_usd  numeric     NOT NULL DEFAULT 0,
  tokens_in        bigint      NOT NULL DEFAULT 0,
  tokens_out       bigint      NOT NULL DEFAULT 0,
  chamadas         integer     NOT NULL DEFAULT 0,
  cache_hits       integer     NOT NULL DEFAULT 0,
  cache_hit_rate   numeric     NOT NULL DEFAULT 0,
  economia_cache_usd numeric   NOT NULL DEFAULT 0,
  acs              integer     NOT NULL DEFAULT 0,   -- AI Cost Score
  aes              integer     NOT NULL DEFAULT 0,   -- AI Efficiency Score
  ars              integer     NOT NULL DEFAULT 0,   -- AI ROI Score
  ces              integer     NOT NULL DEFAULT 0,   -- Cache Efficiency
  tes              integer     NOT NULL DEFAULT 0,   -- Token Efficiency
  atualizado_em    timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.orion_ai_costs IS 'ORION-AI-37: custo diario total + KPIs (ACS/AES/ARS/CES/TES). Imutavel por upsert.';

CREATE TABLE IF NOT EXISTS public.orion_ai_tokens (
  dia               date    PRIMARY KEY,
  tokens_in         bigint  NOT NULL DEFAULT 0,
  tokens_out        bigint  NOT NULL DEFAULT 0,
  tokens_total      bigint  NOT NULL DEFAULT 0,
  tokens_cache_saved bigint NOT NULL DEFAULT 0,
  atualizado_em     timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.orion_ai_tokens IS 'ORION-AI-37: tokens diarios (entrada/saida/economia por cache).';

CREATE TABLE IF NOT EXISTS public.orion_ai_roi (
  dia              date    PRIMARY KEY,
  custo_ia_usd     numeric NOT NULL DEFAULT 0,
  custo_ia_brl     numeric NOT NULL DEFAULT 0,
  receita_brl      numeric NOT NULL DEFAULT 0,
  roi              numeric NOT NULL DEFAULT 0,
  margem_pct       numeric NOT NULL DEFAULT 0,
  atualizado_em    timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.orion_ai_roi IS 'ORION-AI-37: ROI diario (custo IA x receita real). USD->BRL=6.0 declarado.';

CREATE TABLE IF NOT EXISTS public.orion_ai_forecast (
  id             bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  gerado_em      date        NOT NULL DEFAULT current_date,
  horizonte      text        NOT NULL,     -- amanha|semana|mes|ano
  custo_previsto_usd numeric NOT NULL DEFAULT 0,
  base           text,
  criado_em      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT orion_ai_forecast_uq UNIQUE (gerado_em, horizonte)
);
COMMENT ON TABLE public.orion_ai_forecast IS 'ORION-AI-37: previsao de custo (metodo/base declarados).';

CREATE TABLE IF NOT EXISTS public.orion_ai_alerts (
  id           bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tipo         text        NOT NULL,     -- custo|latencia|tokens|cache|roi
  severidade   text        NOT NULL DEFAULT 'info',  -- info|atencao|critico
  mensagem     text        NOT NULL,
  valor        numeric,
  threshold    numeric,
  dia          date        NOT NULL DEFAULT current_date,
  resolvido    boolean     NOT NULL DEFAULT false,
  criado_em    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT orion_ai_alerts_uq UNIQUE (tipo, dia)
);
COMMENT ON TABLE public.orion_ai_alerts IS 'ORION-AI-37: alertas inteligentes (custo/latencia/tokens/cache/roi).';

-- ----------------------------------------------------------------------------
-- 2) RLS — leitura admin (dados financeiros)
-- ----------------------------------------------------------------------------
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['orion_ai_usage','orion_ai_costs','orion_ai_tokens','orion_ai_roi','orion_ai_forecast','orion_ai_alerts'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename=t AND policyname=t||'_admin_read') THEN
      EXECUTE format('CREATE POLICY %I ON public.%I FOR SELECT USING (public.mp_is_admin())', t||'_admin_read', t);
    END IF;
  END LOOP;
END$$;

-- ----------------------------------------------------------------------------
-- 3) EVENT BUS
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.ai_center_emit(p_tipo text, p_dados jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.orion_eventos (tipo, origem, dados) VALUES (p_tipo, 'ai_center', coalesce(p_dados,'{}'::jsonb));
EXCEPTION WHEN OTHERS THEN NULL;
END$$;

-- ----------------------------------------------------------------------------
-- 4) MOTOR — ai_center_build: agrega orion_ai_log (janela recente, incremental)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.ai_center_build(p_trace text DEFAULT NULL, p_dias int DEFAULT 7)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_trace text := coalesce(p_trace,'aic_'||to_char(now(),'YYYYMMDDHH24MISS'));
  v_usd_brl numeric := 6.0;   -- DECLARADO
  v_u int := 0; v_c int := 0; v_al int := 0;
  v_hoje numeric; v_ontem numeric;
BEGIN
  IF session_user <> 'postgres' AND coalesce(auth.role(),'') <> 'service_role' AND NOT public.mp_is_admin() THEN
    RAISE EXCEPTION 'ai_center_build: acesso negado (somente admin/service)';
  END IF;

  -- 4.1 USAGE por (dia, module)
  INSERT INTO public.orion_ai_usage (dia, module, chamadas, tokens_in, tokens_out, custo_usd, latencia_media_ms, cache_hits, erros, disponibilidade, atualizado_em)
  SELECT criado_em::date, coalesce(module,'(sem modulo)'), count(*),
    coalesce(sum(tokens_in),0), coalesce(sum(tokens_out),0), coalesce(sum(custo_estimado),0),
    coalesce(round(avg(duracao_ms))::int,0), count(*) FILTER (WHERE cache_hit),
    count(*) FILTER (WHERE coalesce(erro,'')<>'' OR lower(coalesce(status,'')) IN ('error','failed')),
    round(100.0 * count(*) FILTER (WHERE coalesce(erro,'')='' AND lower(coalesce(status,'')) NOT IN ('error','failed')) / greatest(count(*),1), 1),
    now()
  FROM public.orion_ai_log WHERE criado_em::date >= current_date - p_dias
  GROUP BY 1,2
  ON CONFLICT (dia, module) DO UPDATE SET
    chamadas=excluded.chamadas, tokens_in=excluded.tokens_in, tokens_out=excluded.tokens_out, custo_usd=excluded.custo_usd,
    latencia_media_ms=excluded.latencia_media_ms, cache_hits=excluded.cache_hits, erros=excluded.erros,
    disponibilidade=excluded.disponibilidade, atualizado_em=now();
  GET DIAGNOSTICS v_u = ROW_COUNT;

  -- 4.2 COSTS por dia + KPIs (ACS/AES/ARS/CES/TES)
  WITH agg AS (
    SELECT criado_em::date dia, count(*) ch, coalesce(sum(tokens_in),0) tin, coalesce(sum(tokens_out),0) tout,
      coalesce(sum(custo_estimado),0) custo, count(*) FILTER (WHERE cache_hit) chits,
      coalesce(avg(duracao_ms),0) lat,
      round(100.0*count(*) FILTER (WHERE coalesce(erro,'')='' AND lower(coalesce(status,'')) NOT IN ('error','failed'))/greatest(count(*),1),1) disp
    FROM public.orion_ai_log WHERE criado_em::date >= current_date - p_dias GROUP BY criado_em::date
  ),
  rev AS (
    SELECT created_at::date dia, coalesce(sum(amount),0) receita FROM public.pay_payment_orders
    WHERE lower(status::text) IN ('paid','approved','completed','pago') AND created_at::date >= current_date - p_dias
    GROUP BY created_at::date
  )
  INSERT INTO public.orion_ai_costs (dia, custo_total_usd, tokens_in, tokens_out, chamadas, cache_hits, cache_hit_rate,
     economia_cache_usd, acs, aes, ars, ces, tes, atualizado_em)
  SELECT a.dia, a.custo, a.tin, a.tout, a.ch, a.chits,
     round(100.0*a.chits/greatest(a.ch,1),1),
     round(a.chits * (a.custo/greatest(a.ch,1)), 6),
     round(0.5*(100.0*a.chits/greatest(a.ch,1)) + 0.5*(100 - least(a.custo/greatest(a.ch,1)*100000, 100)))::int,   -- ACS
     round(0.5*(100 - least(a.lat/50.0,100)) + 0.5*a.disp)::int,                                                    -- AES
     least(round(coalesce(r.receita,0) / greatest(a.custo*6.0, 0.01)), 100)::int,                                   -- ARS (ROI normalizado)
     round(100.0*a.chits/greatest(a.ch,1))::int,                                                                    -- CES
     round(100*(1 - least((a.tin+a.tout)/greatest(a.ch,1)/2000.0, 1)))::int,                                        -- TES
     now()
  FROM agg a LEFT JOIN rev r ON r.dia = a.dia
  ON CONFLICT (dia) DO UPDATE SET
    custo_total_usd=excluded.custo_total_usd, tokens_in=excluded.tokens_in, tokens_out=excluded.tokens_out,
    chamadas=excluded.chamadas, cache_hits=excluded.cache_hits, cache_hit_rate=excluded.cache_hit_rate,
    economia_cache_usd=excluded.economia_cache_usd, acs=excluded.acs, aes=excluded.aes, ars=excluded.ars,
    ces=excluded.ces, tes=excluded.tes, atualizado_em=now();
  GET DIAGNOSTICS v_c = ROW_COUNT;

  -- 4.3 TOKENS por dia
  INSERT INTO public.orion_ai_tokens (dia, tokens_in, tokens_out, tokens_total, tokens_cache_saved, atualizado_em)
  SELECT criado_em::date, coalesce(sum(tokens_in),0), coalesce(sum(tokens_out),0),
    coalesce(sum(tokens_in),0)+coalesce(sum(tokens_out),0),
    coalesce(sum(tokens_in+tokens_out) FILTER (WHERE cache_hit),0), now()
  FROM public.orion_ai_log WHERE criado_em::date >= current_date - p_dias GROUP BY criado_em::date
  ON CONFLICT (dia) DO UPDATE SET tokens_in=excluded.tokens_in, tokens_out=excluded.tokens_out,
    tokens_total=excluded.tokens_total, tokens_cache_saved=excluded.tokens_cache_saved, atualizado_em=now();

  -- 4.4 ROI por dia
  INSERT INTO public.orion_ai_roi (dia, custo_ia_usd, custo_ia_brl, receita_brl, roi, margem_pct, atualizado_em)
  SELECT c.dia, c.custo_total_usd, round(c.custo_total_usd*v_usd_brl,4),
    r.receita, round(r.receita/greatest(c.custo_total_usd*v_usd_brl,0.01),1),
    round(100.0*(r.receita - c.custo_total_usd*v_usd_brl)/greatest(r.receita,0.01),2),
    now()
  FROM public.orion_ai_costs c
  CROSS JOIN LATERAL (
    SELECT coalesce((SELECT sum(amount) FROM public.pay_payment_orders po
                     WHERE lower(po.status::text) IN ('paid','approved','completed','pago') AND po.created_at::date=c.dia),0) receita
  ) r
  WHERE c.dia >= current_date - p_dias
  ON CONFLICT (dia) DO UPDATE SET custo_ia_usd=excluded.custo_ia_usd, custo_ia_brl=excluded.custo_ia_brl,
    receita_brl=excluded.receita_brl, roi=excluded.roi, margem_pct=excluded.margem_pct, atualizado_em=now();

  -- 4.5 ALERTAS (hoje x ontem)
  SELECT custo_total_usd INTO v_hoje FROM public.orion_ai_costs WHERE dia=current_date;
  SELECT custo_total_usd INTO v_ontem FROM public.orion_ai_costs WHERE dia=current_date-1;
  IF v_hoje IS NOT NULL AND v_ontem IS NOT NULL AND v_ontem > 0 AND v_hoje > v_ontem*1.5 THEN
    INSERT INTO public.orion_ai_alerts (tipo, severidade, mensagem, valor, threshold, dia)
    VALUES ('custo','atencao','Custo de IA subiu mais de 50% vs ontem', v_hoje, v_ontem*1.5, current_date)
    ON CONFLICT (tipo, dia) DO UPDATE SET valor=excluded.valor, mensagem=excluded.mensagem;
    v_al := 1;
  END IF;

  PERFORM public.ai_center_emit('ai_cost.updated', jsonb_build_object('usage',v_u,'costs',v_c,'alertas',v_al,'trace',v_trace));
  RETURN jsonb_build_object('ok',true,'usage_linhas',v_u,'dias',v_c,'alertas',v_al,'trace',v_trace);
END$$;

-- ----------------------------------------------------------------------------
-- 5) KPIs (custo por X) + SCORE
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.ai_center_kpis()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH tot AS (SELECT coalesce(sum(custo_estimado),0) custo FROM public.orion_ai_log),
  cnt AS (
    SELECT (SELECT count(*) FROM public.orion_recommendations) recs,
           (SELECT count(*) FROM public.orion_search_queries) buscas,
           (SELECT count(*) FROM public.orion_ai_log WHERE lower(coalesce(task,'')) LIKE '%chat%' OR lower(coalesce(module,'')) LIKE '%chat%') conversas,
           (SELECT count(*) FROM public.pay_payment_orders WHERE lower(status::text) IN ('paid','approved','completed','pago')) pedidos
  )
  SELECT jsonb_build_object(
    'cpr_usd', round((SELECT custo FROM tot)/greatest((SELECT recs FROM cnt),1), 6),
    'cps_usd', round((SELECT custo FROM tot)/greatest((SELECT buscas FROM cnt),1), 6),
    'cpc_usd', round((SELECT custo FROM tot)/greatest((SELECT conversas FROM cnt),1), 6),
    'cpo_usd', round((SELECT custo FROM tot)/greatest((SELECT pedidos FROM cnt),1), 6),
    'base', jsonb_build_object('custo_total_usd',(SELECT custo FROM tot),'recomendacoes',(SELECT recs FROM cnt),
      'buscas',(SELECT buscas FROM cnt),'conversas',(SELECT conversas FROM cnt),'pedidos',(SELECT pedidos FROM cnt)),
    'nota','CPR/CPC baixos pois muitos modulos sao deterministicos (0 token). CPO = custo IA total / pedidos pagos.');
$$;

CREATE OR REPLACE FUNCTION public.ai_center_score()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  -- headline consolidado (TOTAIS de todo o historico do log), nao apenas o dia
  WITH g AS (
    SELECT coalesce(sum(custo_estimado),0) custo, coalesce(sum(tokens_in+tokens_out),0) tok, count(*) ch,
      count(*) FILTER (WHERE cache_hit) chits, coalesce(avg(duracao_ms),0) lat,
      round(100.0*count(*) FILTER (WHERE coalesce(erro,'')='' AND lower(coalesce(status,'')) NOT IN ('error','failed'))/greatest(count(*),1),1) disp
    FROM public.orion_ai_log
  ),
  rev AS (SELECT coalesce(sum(amount),0) receita FROM public.pay_payment_orders WHERE lower(status::text) IN ('paid','approved','completed','pago'))
  SELECT jsonb_build_object(
    'ces', round(100.0*g.chits/greatest(g.ch,1))::int,
    'tes', round(100*(1 - least(g.tok::numeric/greatest(g.ch,1)/2000.0, 1)))::int,
    'acs', round(0.5*(100.0*g.chits/greatest(g.ch,1)) + 0.5*(100 - least(g.custo/greatest(g.ch,1)*100000, 100)))::int,
    'aes', round(0.5*(100 - least(g.lat/50.0,100)) + 0.5*g.disp)::int,
    'ars', least(round(rev.receita/greatest(g.custo*6.0,0.01)), 100)::int,
    'custo_total_usd', g.custo, 'tokens_total', g.tok, 'chamadas_total', g.ch,
    'cache_hit_rate', round(100.0*g.chits/greatest(g.ch,1),1),
    'roi', round(rev.receita/greatest(g.custo*6.0,0.01),1),
    'receita_brl', rev.receita,
    'margem_pct', round(100.0*(rev.receita - g.custo*6.0)/greatest(rev.receita,0.01),2),
    'gerado_em', now())
  FROM g, rev;
$$;

-- ----------------------------------------------------------------------------
-- 6) BREAKDOWNS (por modulo/modelo/usuario) + ranking + timeline
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.ai_center_by_module()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT coalesce(jsonb_agg(jsonb_build_object('module',module,'chamadas',ch,'tokens',tok,'custo_usd',round(custo,6),
    'custo_medio_usd',round(custo/greatest(ch,1),6),'latencia_ms',lat,'cache',chits,'erros',err,'disponibilidade',disp) ORDER BY custo DESC),'[]'::jsonb)
  FROM (SELECT coalesce(module,'(sem)') module, count(*) ch, coalesce(sum(tokens_in+tokens_out),0) tok,
    coalesce(sum(custo_estimado),0) custo, coalesce(round(avg(duracao_ms))::int,0) lat, count(*) FILTER (WHERE cache_hit) chits,
    count(*) FILTER (WHERE coalesce(erro,'')<>'') err,
    round(100.0*count(*) FILTER (WHERE coalesce(erro,'')='')/greatest(count(*),1),1) disp
    FROM public.orion_ai_log GROUP BY 1) x;
$$;

CREATE OR REPLACE FUNCTION public.ai_center_by_model()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT coalesce(jsonb_agg(jsonb_build_object('model',model,'chamadas',ch,'tokens',tok,'custo_usd',round(custo,6),
    'preco_in_mtok',m.custo_input_mtok,'preco_out_mtok',m.custo_output_mtok) ORDER BY custo DESC),'[]'::jsonb)
  FROM (SELECT coalesce(model,'(sem)') model, count(*) ch, coalesce(sum(tokens_in+tokens_out),0) tok, coalesce(sum(custo_estimado),0) custo
        FROM public.orion_ai_log GROUP BY 1) x
  LEFT JOIN public.orion_ai_models m ON m.model_code = x.model;
$$;

CREATE OR REPLACE FUNCTION public.ai_center_by_user()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT coalesce(jsonb_agg(jsonb_build_object('user_id',user_id,'chamadas',ch,'tokens',tok,'custo_usd',round(custo,6)) ORDER BY custo DESC),'[]'::jsonb)
  FROM (SELECT user_id, count(*) ch, coalesce(sum(tokens_in+tokens_out),0) tok, coalesce(sum(custo_estimado),0) custo
        FROM public.orion_ai_log WHERE user_id IS NOT NULL GROUP BY user_id ORDER BY custo DESC LIMIT 20) x;
$$;

CREATE OR REPLACE FUNCTION public.ai_center_ranking()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH m AS (SELECT coalesce(module,'(sem)') module, count(*) ch, coalesce(sum(custo_estimado),0) custo,
    count(*) FILTER (WHERE cache_hit) chits FROM public.orion_ai_log GROUP BY 1)
  SELECT jsonb_build_object(
    'mais_usada', (SELECT jsonb_build_object('module',module,'chamadas',ch) FROM m ORDER BY ch DESC LIMIT 1),
    'mais_cara', (SELECT jsonb_build_object('module',module,'custo_usd',round(custo,6)) FROM m ORDER BY custo DESC LIMIT 1),
    'mais_barata', (SELECT jsonb_build_object('module',module,'custo_usd',round(custo,6)) FROM m WHERE ch>0 ORDER BY custo ASC LIMIT 1),
    'maior_cache', (SELECT jsonb_build_object('module',module,'cache',chits) FROM m ORDER BY chits DESC LIMIT 1));
$$;

CREATE OR REPLACE FUNCTION public.ai_center_timeline()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT coalesce(jsonb_agg(jsonb_build_object('dia',dia,'custo_usd',round(custo_total_usd,6),'chamadas',chamadas,
    'tokens',tokens_in+tokens_out,'cache_hit_rate',cache_hit_rate) ORDER BY dia),'[]'::jsonb)
  FROM public.orion_ai_costs;
$$;

CREATE OR REPLACE FUNCTION public.ai_center_comparator()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT coalesce(jsonb_agg(jsonb_build_object('model',model_code,'label',label,'ativo',ativo,
    'preco_in_mtok',custo_input_mtok,'preco_out_mtok',custo_output_mtok,
    'chamadas_reais',coalesce(u.ch,0),'custo_real_usd',round(coalesce(u.custo,0),6)) ORDER BY custo_output_mtok),'[]'::jsonb)
  FROM public.orion_ai_models m
  LEFT JOIN (SELECT model, count(*) ch, sum(custo_estimado) custo FROM public.orion_ai_log GROUP BY model) u ON u.model=m.model_code;
$$;

-- ----------------------------------------------------------------------------
-- 7) FORECAST + SIMULADOR
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.ai_center_forecast()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_avg numeric; v_dias int;
BEGIN
  SELECT coalesce(avg(custo_total_usd),0), count(*) INTO v_avg, v_dias FROM public.orion_ai_costs;
  IF public.mp_is_admin() OR coalesce(auth.role(),'')='service_role' OR session_user='postgres' THEN
    INSERT INTO public.orion_ai_forecast (gerado_em, horizonte, custo_previsto_usd, base) VALUES
      (current_date,'amanha', round(v_avg,6), 'media diaria de '||v_dias||' dias'),
      (current_date,'semana', round(v_avg*7,6), 'media diaria x7'),
      (current_date,'mes',    round(v_avg*30,6),'media diaria x30'),
      (current_date,'ano',    round(v_avg*365,6),'media diaria x365')
    ON CONFLICT (gerado_em, horizonte) DO UPDATE SET custo_previsto_usd=excluded.custo_previsto_usd, base=excluded.base;
  END IF;
  RETURN jsonb_build_object('media_diaria_usd',round(v_avg,6),'dias_base',v_dias,
    'amanha_usd',round(v_avg,6),'semana_usd',round(v_avg*7,6),'mes_usd',round(v_avg*30,6),'ano_usd',round(v_avg*365,6),
    'metodo','projecao linear da media diaria historica (declarado)');
END$$;

CREATE OR REPLACE FUNCTION public.ai_center_simulator(p_users int DEFAULT 1000)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  -- base por PEDIDO PAGO (proxy de usuario pagante) para custo e receita — mesmo denominador
  WITH b AS (
    SELECT coalesce(sum(custo_estimado),0) custo, coalesce(sum(tokens_in+tokens_out),0) tok FROM public.orion_ai_log
  ),
  p AS (SELECT greatest(count(*),1) pagantes, coalesce(sum(amount),0) receita
        FROM public.pay_payment_orders WHERE lower(status::text) IN ('paid','approved','completed','pago')),
  u AS (SELECT (SELECT custo FROM b)/(SELECT pagantes FROM p) custo_user, (SELECT tok::numeric FROM b)/(SELECT pagantes FROM p) tok_user,
               (SELECT receita FROM p)/(SELECT pagantes FROM p) rec_user)
  SELECT jsonb_build_object(
    'usuarios_simulados', p_users,
    'base_pagantes_reais', (SELECT pagantes FROM p),
    'custo_por_usuario_usd', round((SELECT custo_user FROM u),6),
    'consumo_tokens_estimado', round((SELECT tok_user FROM u) * p_users),
    'custo_openai_usd', round((SELECT custo_user FROM u) * p_users, 2),
    'custo_infra_usd_est', round(p_users * 0.02, 2),          -- premissa DECLARADA: US$0.02/usuario
    'receita_estimada_brl', round((SELECT rec_user FROM u) * p_users, 2),
    'lucro_liquido_brl_est', round((SELECT rec_user FROM u)*p_users - ((SELECT custo_user FROM u)*p_users + p_users*0.02)*6.0, 2),
    'margem_pct_est', round(100.0*(1 - (((SELECT custo_user FROM u)*p_users + p_users*0.02)*6.0) / greatest((SELECT rec_user FROM u)*p_users,0.01)),1),
    'premissas','USD->BRL=6.0; infra=US$0.02/usuario; base = pedidos pagos como proxy de pagante; extrapolacao linear ILUSTRATIVA (base pequena, DECLARADO)');
$$;

-- ----------------------------------------------------------------------------
-- 8) SUMMARY / DASHBOARD / METRICS
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.ai_center_metrics()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_object(
    'usage_linhas',(SELECT count(*) FROM public.orion_ai_usage),
    'dias_custo',(SELECT count(*) FROM public.orion_ai_costs),
    'alertas_abertos',(SELECT count(*) FROM public.orion_ai_alerts WHERE NOT resolvido),
    'log_total',(SELECT count(*) FROM public.orion_ai_log),
    'cache_entradas',(SELECT count(*) FROM public.orion_ai_cache),
    'ultimo_dia',(SELECT max(dia) FROM public.orion_ai_costs));
$$;

CREATE OR REPLACE FUNCTION public.ai_center_summary()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_object('score',public.ai_center_score(),'kpis',public.ai_center_kpis(),
    'por_modulo',public.ai_center_by_module(),'por_modelo',public.ai_center_by_model(),
    'ranking',public.ai_center_ranking(),'timeline',public.ai_center_timeline(),
    'forecast',(SELECT jsonb_build_object('amanha_usd',round(avg(custo_total_usd),6),'mes_usd',round(avg(custo_total_usd)*30,6)) FROM public.orion_ai_costs),
    'alertas',(SELECT coalesce(jsonb_agg(jsonb_build_object('tipo',tipo,'severidade',severidade,'mensagem',mensagem) ORDER BY criado_em DESC),'[]'::jsonb) FROM public.orion_ai_alerts WHERE NOT resolvido),
    'metrics',public.ai_center_metrics());
$$;

CREATE OR REPLACE FUNCTION public.ai_center_dashboard()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v jsonb;
BEGIN
  v := public.ai_center_summary();
  PERFORM public.ai_center_emit('ai_cost.score', jsonb_build_object('custo_total', v->'score'->'custo_total_usd'));
  RETURN v;
END$$;

-- ----------------------------------------------------------------------------
-- 9) TICK incremental */5 (agrega janela recente; nunca reescreve historico)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.orion_ai_center_tick()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.ai_center_build('cron_'||to_char(now(),'YYYYMMDDHH24MI'), 2);  -- so hoje+ontem
  PERFORM public.ai_center_forecast();
END$$;

-- ----------------------------------------------------------------------------
-- 10) GRANTS
-- ----------------------------------------------------------------------------
GRANT EXECUTE ON FUNCTION public.ai_center_build(text,int)      TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.ai_center_kpis()               TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.ai_center_score()              TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.ai_center_by_module()          TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.ai_center_by_model()           TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.ai_center_by_user()            TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.ai_center_ranking()            TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.ai_center_timeline()           TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.ai_center_comparator()         TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.ai_center_forecast()           TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.ai_center_simulator(int)       TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.ai_center_metrics()            TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.ai_center_summary()            TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.ai_center_dashboard()          TO authenticated, service_role;

-- ----------------------------------------------------------------------------
-- 11) MODEL PREF + CRON */5
-- ----------------------------------------------------------------------------
INSERT INTO public.orion_ai_module_prefs (module, model_code) VALUES ('ai_center','gpt-5-mini') ON CONFLICT (module) DO NOTHING;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname='pg_cron') THEN
    PERFORM cron.unschedule('orion_ai_center_tick') WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname='orion_ai_center_tick');
    PERFORM cron.schedule('orion_ai_center_tick','*/5 * * * *','SELECT public.orion_ai_center_tick();');
  END IF;
EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'cron indisponivel: %', SQLERRM;
END$$;

-- ============================================================================
-- ROLLBACK (manual):
--   SELECT cron.unschedule('orion_ai_center_tick');
--   DROP FUNCTION IF EXISTS public.orion_ai_center_tick, public.ai_center_dashboard, public.ai_center_summary,
--     public.ai_center_metrics, public.ai_center_simulator(int), public.ai_center_forecast, public.ai_center_comparator,
--     public.ai_center_timeline, public.ai_center_ranking, public.ai_center_by_user, public.ai_center_by_model,
--     public.ai_center_by_module, public.ai_center_score, public.ai_center_kpis, public.ai_center_build(text,int),
--     public.ai_center_emit(text,jsonb);
--   DROP TABLE IF EXISTS public.orion_ai_alerts, public.orion_ai_forecast, public.orion_ai_roi,
--     public.orion_ai_tokens, public.orion_ai_costs, public.orion_ai_usage;
--   DELETE FROM public.orion_ai_module_prefs WHERE module='ai_center';
--   -- NAO tocar orion_ai_log / orion_ai_cache / orion_ai_models (sao do Gateway AI-00).
-- ============================================================================
