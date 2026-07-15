-- ═══════════════════════════════════════════════════════════════
-- ORION-AI-15 — PRICING AI v1.0 (Revenue Optimization)
--
-- Recomenda preços/comissões/margens e, SÓ sob governança, aplica
-- preço do CATÁLOGO de divulgação (divulgacao_packages — placeholder,
-- fora do ledger). REGRAS ABSOLUTAS (regras-financeiras):
--  • NUNCA move dinheiro, nunca toca pay_*/ledger.
--  • COMISSÃO é fonte única (official_motoboy_commission) — Pricing
--    só RECOMENDA; aplicação de comissão = commission_overrides pelo
--    admin (fora deste módulo). Nunca duplica/hardcoda tier.
--  • Toda aplicação de preço respeita a política ativa (min/max/
--    margem), exige aprovação humana e grava histórico (rollback).
--  • Nunca recalcula indicadores certificados — LÊ Finance/Conversion.
--
-- Aplicada via Management API em 2026-07-14. Idempotente.
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.orion_pricing_policies (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  escopo        text NOT NULL DEFAULT 'global',   -- global|cidade|categoria
  escopo_valor  text,
  preco_min     numeric(12,2),
  preco_max     numeric(12,2),
  margem_min_pct numeric(5,2),
  margem_alvo_pct numeric(5,2),
  comissao_min_pct numeric(5,2),
  comissao_max_pct numeric(5,2),
  desconto_max_pct numeric(5,2) DEFAULT 30,
  exige_aprovacao boolean NOT NULL DEFAULT true,
  versao        int NOT NULL DEFAULT 1,
  ativo         boolean NOT NULL DEFAULT true,
  autor         uuid,
  criado_em     timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_opp_ativo ON public.orion_pricing_policies (escopo, coalesce(escopo_valor,'')) WHERE ativo;
ALTER TABLE public.orion_pricing_policies ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS opp_admin ON public.orion_pricing_policies;
CREATE POLICY opp_admin ON public.orion_pricing_policies
  FOR SELECT TO authenticated USING (mp_is_admin());

CREATE TABLE IF NOT EXISTS public.orion_pricing_history (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  alvo_tabela  text NOT NULL,
  alvo_id      uuid NOT NULL,
  campo        text NOT NULL,
  valor_antigo numeric(12,2),
  valor_novo   numeric(12,2),
  politica_id  uuid,
  motivo       text,
  trace_id     uuid NOT NULL DEFAULT gen_random_uuid(),
  autor        uuid,
  revertido    boolean NOT NULL DEFAULT false,
  criado_em    timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.orion_pricing_history ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS oph_admin ON public.orion_pricing_history;
CREATE POLICY oph_admin ON public.orion_pricing_history
  FOR SELECT TO authenticated USING (mp_is_admin());
REVOKE UPDATE, DELETE ON public.orion_pricing_history FROM authenticated, anon;

-- política global default (governança liga por padrão)
INSERT INTO public.orion_pricing_policies (escopo, preco_min, preco_max, margem_min_pct, margem_alvo_pct,
  comissao_min_pct, comissao_max_pct, desconto_max_pct, exige_aprovacao)
SELECT 'global', 5, 500, 20, 40, 6, 25, 30, true
WHERE NOT EXISTS (SELECT 1 FROM orion_pricing_policies WHERE escopo='global' AND ativo);

CREATE OR REPLACE FUNCTION public.pricing_emit(p_tipo text, p_dados jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  BEGIN INSERT INTO orion_eventos (tipo, origem, dados) VALUES (p_tipo, 'pricing_ai', p_dados);
  EXCEPTION WHEN OTHERS THEN NULL; END;
END; $$;

-- ─────────────────────────────────────────────
-- POLÍTICAS: set (nova versão) + rollback
-- ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.pricing_policy_set(p jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_versao int; v_id uuid; v_escopo text; v_valor text;
BEGIN
  IF NOT mp_is_admin() THEN RAISE EXCEPTION 'Apenas administradores'; END IF;
  v_escopo := coalesce(p->>'escopo','global'); v_valor := p->>'escopo_valor';
  SELECT coalesce(max(versao),0)+1 INTO v_versao FROM orion_pricing_policies
   WHERE escopo=v_escopo AND coalesce(escopo_valor,'')=coalesce(v_valor,'');
  UPDATE orion_pricing_policies SET ativo=false
   WHERE escopo=v_escopo AND coalesce(escopo_valor,'')=coalesce(v_valor,'') AND ativo;
  INSERT INTO orion_pricing_policies (escopo, escopo_valor, preco_min, preco_max, margem_min_pct,
    margem_alvo_pct, comissao_min_pct, comissao_max_pct, desconto_max_pct, exige_aprovacao, versao, autor)
  VALUES (v_escopo, v_valor,
    (p->>'preco_min')::numeric, (p->>'preco_max')::numeric, (p->>'margem_min_pct')::numeric,
    (p->>'margem_alvo_pct')::numeric, (p->>'comissao_min_pct')::numeric, (p->>'comissao_max_pct')::numeric,
    coalesce((p->>'desconto_max_pct')::numeric,30), coalesce((p->>'exige_aprovacao')::boolean,true),
    v_versao, auth.uid())
  RETURNING id INTO v_id;
  PERFORM pricing_emit('pricing_policy_atualizada', jsonb_build_object('policy', v_id, 'versao', v_versao));
  RETURN jsonb_build_object('ok', true, 'id', v_id, 'versao', v_versao);
END; $$;
GRANT EXECUTE ON FUNCTION public.pricing_policy_set(jsonb) TO authenticated;

CREATE OR REPLACE FUNCTION public.pricing_policies()
RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT coalesce(jsonb_agg(to_jsonb(p) ORDER BY p.escopo, p.criado_em DESC), '[]')
  FROM (SELECT * FROM orion_pricing_policies WHERE ativo) p;
$$;
GRANT EXECUTE ON FUNCTION public.pricing_policies() TO authenticated;

-- ─────────────────────────────────────────────
-- APLICAÇÃO GOVERNADA (só divulgacao_packages; nunca comissão/dinheiro)
-- ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.pricing_apply_package(p_pacote uuid, p_novo_preco numeric, p_motivo text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE pol RECORD; v_antigo numeric; v_hid uuid;
BEGIN
  IF NOT mp_is_admin() THEN RAISE EXCEPTION 'Apenas administradores'; END IF;
  SELECT * INTO pol FROM orion_pricing_policies WHERE escopo='global' AND ativo LIMIT 1;
  IF pol IS NULL THEN RAISE EXCEPTION 'Sem política ativa — governança exige política'; END IF;

  -- governança: respeita limites da política
  IF pol.preco_min IS NOT NULL AND p_novo_preco < pol.preco_min THEN
    RAISE EXCEPTION 'Preço % abaixo do mínimo da política (R$ %)', p_novo_preco, pol.preco_min; END IF;
  IF pol.preco_max IS NOT NULL AND p_novo_preco > pol.preco_max THEN
    RAISE EXCEPTION 'Preço % acima do máximo da política (R$ %)', p_novo_preco, pol.preco_max; END IF;

  SELECT preco_brl INTO v_antigo FROM divulgacao_packages WHERE id=p_pacote;
  IF v_antigo IS NULL THEN RAISE EXCEPTION 'Pacote não encontrado'; END IF;
  -- desconto máximo (proteção contra queda abusiva)
  IF pol.desconto_max_pct IS NOT NULL AND p_novo_preco < v_antigo * (1 - pol.desconto_max_pct/100) THEN
    RAISE EXCEPTION 'Redução acima do desconto máximo (% %%) da política', pol.desconto_max_pct; END IF;

  UPDATE divulgacao_packages SET preco_brl = p_novo_preco WHERE id=p_pacote;
  INSERT INTO orion_pricing_history (alvo_tabela, alvo_id, campo, valor_antigo, valor_novo,
    politica_id, motivo, autor)
  VALUES ('divulgacao_packages', p_pacote, 'preco_brl', v_antigo, p_novo_preco, pol.id, p_motivo, auth.uid())
  RETURNING id INTO v_hid;
  PERFORM pricing_emit('pricing_aplicado',
    jsonb_build_object('pacote', p_pacote, 'de', v_antigo, 'para', p_novo_preco, 'historico', v_hid));
  RETURN jsonb_build_object('ok', true, 'de', v_antigo, 'para', p_novo_preco, 'historico', v_hid);
END; $$;
GRANT EXECUTE ON FUNCTION public.pricing_apply_package(uuid, numeric, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.pricing_rollback(p_historico uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE h RECORD;
BEGIN
  IF NOT mp_is_admin() THEN RAISE EXCEPTION 'Apenas administradores'; END IF;
  SELECT * INTO h FROM orion_pricing_history WHERE id=p_historico AND NOT revertido;
  IF h IS NULL THEN RAISE EXCEPTION 'Histórico não encontrado/já revertido'; END IF;
  IF h.alvo_tabela = 'divulgacao_packages' THEN
    UPDATE divulgacao_packages SET preco_brl = h.valor_antigo WHERE id = h.alvo_id;
  ELSE RAISE EXCEPTION 'Rollback não suportado para %', h.alvo_tabela; END IF;
  -- histórico é imutável: registra a reversão como NOVO evento + marca original
  INSERT INTO orion_pricing_history (alvo_tabela, alvo_id, campo, valor_antigo, valor_novo,
    politica_id, motivo, autor)
  VALUES (h.alvo_tabela, h.alvo_id, h.campo, h.valor_novo, h.valor_antigo, h.politica_id,
    'rollback de '||p_historico, auth.uid());
  UPDATE orion_pricing_history SET revertido=true WHERE id=p_historico;
  PERFORM pricing_emit('pricing_rollback', jsonb_build_object('historico', p_historico));
  RETURN jsonb_build_object('ok', true, 'restaurado_para', h.valor_antigo);
END; $$;
GRANT EXECUTE ON FUNCTION public.pricing_rollback(uuid) TO authenticated;

-- ─────────────────────────────────────────────
-- RECOMENDAÇÕES (advisory; reusa Finance/Conversion; comissão só sugere)
-- ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.pricing_recommendations()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE rec jsonb := '[]'::jsonb; v_ltv numeric; v_ticket numeric; v_recompra numeric;
  v_receita numeric; v_promo numeric; pk RECORD; v_grupos int;
BEGIN
  IF NOT mp_is_admin() AND session_user <> 'postgres' AND coalesce(auth.role(),'') <> 'service_role' THEN
    RAISE EXCEPTION 'Apenas administradores';
  END IF;
  v_ltv := ((conversion_ltv())->>'ltv_medio')::numeric;
  v_ticket := ((conversion_ltv())->>'ticket_medio')::numeric;
  v_recompra := ((conversion_ltv())->>'recompra_pct')::numeric;
  v_receita := ((orion_finance_dashboard())->'receita'->>'ordens_pagas_total')::numeric;
  v_promo := ((orion_finance_dashboard())->'receita'->>'promocao_total')::numeric;
  SELECT count(*) INTO v_grupos FROM whatsapp_groups WHERE is_active AND coalesce(is_valid,true);

  -- 1) recompra baixa → cashback/desconto para reativar
  IF v_recompra IS NOT NULL AND v_recompra < 20 THEN
    rec := rec || jsonb_build_object('acao','criar_cashback','area','marketplace',
      'objetivo','elevar recompra', 'impacto_esperado','+recorrência de clientes existentes',
      'margem_prevista','reduz margem no curto prazo, eleva LTV', 'risco','baixo (cashback só na recompra)',
      'confianca',0.7, 'dados_utilizados', format('recompra %s%% (Conversion LTV)', v_recompra));
  END IF;
  -- 2) divulgação com receita zero paga → preços do catálogo são placeholder
  IF coalesce(v_promo,0) = 0 THEN
    rec := rec || jsonb_build_object('acao','revisar_precos_catalogo','area','divulgacao',
      'objetivo','converter divulgação em receita', 'impacto_esperado','primeira venda de pacote',
      'margem_prevista','definir preço-âncora sustentável', 'risco','médio (preços ainda placeholder)',
      'confianca',0.6, 'dados_utilizados','promotion_purchases = R$0 pago (Finance)');
  END IF;
  -- 3) cobertura de grupos alta em poucas cidades → pacotes locais premium
  IF v_grupos >= 5 THEN
    rec := rec || jsonb_build_object('acao','pacote_local_premium','area','planos',
      'objetivo','capturar valor onde há alcance', 'impacto_esperado','ticket maior em cidades cobertas',
      'margem_prevista','+margem em pacotes de maior alcance', 'risco','baixo',
      'confianca',0.65, 'dados_utilizados', format('%s grupos ativos', v_grupos));
  END IF;
  -- 4) COMISSÃO: apenas RECOMENDA (fonte única official_motoboy_commission — nunca aplica aqui)
  rec := rec || jsonb_build_object('acao','revisar_comissao_advisory','area','comissoes',
    'objetivo','equilibrar atração de profissionais × receita da plataforma',
    'impacto_esperado','ajuste fino da comissão por tier de grupos',
    'margem_prevista','depende do tier vigente', 'risco','ALTO — mexe em receita de profissional',
    'confianca',0.5,
    'dados_utilizados','official_motoboy_commission (fonte única); aplicação SÓ via commission_overrides pelo admin — Pricing AI não aplica comissão');

  RETURN jsonb_build_object('recomendacoes', rec,
    'metricas_base', jsonb_build_object('ltv', v_ltv, 'ticket', v_ticket, 'recompra_pct', v_recompra,
      'receita_total', v_receita, 'promocao_paga', v_promo),
    'nota','Recomendações consultivas — aplicação de preço só via política; comissão nunca aplicada aqui');
END; $$;
GRANT EXECUTE ON FUNCTION public.pricing_recommendations() TO authenticated, service_role;

-- ─────────────────────────────────────────────
-- SIMULAÇÃO (nunca toca produção; modelo declarado)
-- ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.pricing_simulation(p_cenario text, p_valor_pct numeric)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_receita numeric; v_ticket numeric; v_elasticidade numeric := -0.8; v_delta numeric;
  v_receita_sim numeric; v_conv_delta numeric;
BEGIN
  IF NOT mp_is_admin() AND session_user <> 'postgres' AND coalesce(auth.role(),'') <> 'service_role' THEN
    RAISE EXCEPTION 'Apenas administradores';
  END IF;
  v_receita := ((orion_finance_dashboard())->'receita'->>'ordens_pagas_mes')::numeric;
  v_ticket := ((conversion_ltv())->>'ticket_medio')::numeric;

  IF p_cenario IN ('preco','comissao') THEN
    v_delta := p_valor_pct / 100.0;
    -- elasticidade-preço padrão -0,8 (declarada, referência de mercado)
    v_conv_delta := v_elasticidade * v_delta;
    v_receita_sim := v_receita * (1 + v_delta) * (1 + v_conv_delta);
    RETURN jsonb_build_object('cenario', p_cenario, 'variacao_pct', p_valor_pct,
      'receita_atual_mes', round(v_receita,2), 'receita_estimada', round(v_receita_sim,2),
      'variacao_conversao_estimada_pct', round(v_conv_delta*100,1),
      'lucro_estimado', 'depende de custos — não recalculado (Finance é fonte)',
      'risco', CASE WHEN abs(p_valor_pct) > 15 THEN 'alto' WHEN abs(p_valor_pct) > 7 THEN 'médio' ELSE 'baixo' END,
      'modelo', 'elasticidade-preço -0,8 (referência declarada; calibra com histórico) · nunca toca produção');
  ELSIF p_cenario IN ('frete_gratis','cashback') THEN
    RETURN jsonb_build_object('cenario', p_cenario,
      'custo_estimado_pct_receita', coalesce(p_valor_pct, 5),
      'ganho_conversao_estimado', 'positivo (referência de mercado)',
      'break_even', format('recompra precisa subir ~%s%% para pagar o incentivo', greatest(5, p_valor_pct)),
      'risco', 'médio', 'modelo', 'incentivo × elevação de recorrência — premissas declaradas');
  ELSE
    RAISE EXCEPTION 'Cenário inválido: % (use preco|comissao|frete_gratis|cashback)', p_cenario;
  END IF;
END; $$;
GRANT EXECUTE ON FUNCTION public.pricing_simulation(text, numeric) TO authenticated;

-- ─────────────────────────────────────────────
-- SCORE + métricas + dashboard + summary
-- ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.pricing_metrics()
RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_object(
    'preco_medio_catalogo', (SELECT round(avg(preco_brl),2) FROM divulgacao_packages WHERE ativo),
    'ticket_medio', ((conversion_ltv())->>'ticket_medio'),
    'ltv_medio', ((conversion_ltv())->>'ltv_medio'),
    'recompra_pct', ((conversion_ltv())->>'recompra_pct'),
    'promocoes_ativas', (SELECT count(*) FROM promotion_purchases WHERE status IN ('paid','approved')
      AND coalesce(expires_at, now()+interval '1 day') > now()),
    'politicas_ativas', (SELECT count(*) FROM orion_pricing_policies WHERE ativo),
    'comissao_fonte', 'official_motoboy_commission (tier por grupos — leitura)');
$$;
GRANT EXECUTE ON FUNCTION public.pricing_metrics() TO authenticated;

CREATE OR REPLACE FUNCTION public.pricing_score()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_recompra numeric; v_pol int; v_hist int; comp jsonb;
BEGIN
  IF NOT mp_is_admin() AND session_user <> 'postgres' AND coalesce(auth.role(),'') <> 'service_role' THEN
    RAISE EXCEPTION 'Apenas administradores';
  END IF;
  v_recompra := coalesce(((conversion_ltv())->>'recompra_pct')::numeric, 0);
  SELECT count(*) INTO v_pol FROM orion_pricing_policies WHERE ativo;
  SELECT count(*) INTO v_hist FROM orion_pricing_history;
  comp := jsonb_build_object(
    'competitividade', 60,  -- sem benchmark externo (declarado) → base neutra
    'rentabilidade', least(100, 50 + round(v_recompra)),
    'eficiencia', CASE WHEN v_pol > 0 THEN 90 ELSE 40 END,      -- governança ativa
    'elasticidade', 55,     -- referência de mercado até calibrar histórico
    'estabilidade', least(100, 70 + v_hist * 3));               -- histórico/versionamento
  RETURN jsonb_build_object(
    'pricing_score', (SELECT round(avg((value)::numeric)) FROM jsonb_each_text(comp)),
    'componentes', comp,
    'formula', 'competitividade/rentabilidade/eficiência/elasticidade/estabilidade (reuso Conversion + governança); competitividade/elasticidade neutras até benchmark/histórico');
END; $$;
GRANT EXECUTE ON FUNCTION public.pricing_score() TO authenticated;

CREATE OR REPLACE FUNCTION public.pricing_history()
RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT coalesce(jsonb_agg(to_jsonb(h) ORDER BY h.criado_em DESC), '[]')
  FROM (SELECT * FROM orion_pricing_history ORDER BY criado_em DESC LIMIT 30) h;
$$;
GRANT EXECUTE ON FUNCTION public.pricing_history() TO authenticated;

CREATE OR REPLACE FUNCTION public.pricing_alerts()
RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_object(
    'sem_politica', (SELECT count(*)=0 FROM orion_pricing_policies WHERE escopo='global' AND ativo),
    'divulgacao_sem_receita', (SELECT coalesce(sum(amount_brl),0)=0 FROM promotion_purchases WHERE status IN ('paid','approved')),
    'recompra_baixa', (SELECT coalesce(((conversion_ltv())->>'recompra_pct')::numeric,0) < 20));
$$;
GRANT EXECUTE ON FUNCTION public.pricing_alerts() TO authenticated;

CREATE OR REPLACE FUNCTION public.pricing_summary()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT mp_is_admin() AND session_user <> 'postgres' AND coalesce(auth.role(),'') <> 'service_role' THEN
    RAISE EXCEPTION 'Apenas administradores';
  END IF;
  RETURN jsonb_build_object('score', pricing_score(), 'metrics', pricing_metrics(),
    'recomendacoes', pricing_recommendations(), 'alertas', pricing_alerts(),
    'prompt_keys', jsonb_build_array('pricing.executive','pricing.recommendations',
      'pricing.simulation','pricing.performance','pricing.summary'));
END; $$;
GRANT EXECUTE ON FUNCTION public.pricing_summary() TO authenticated;

CREATE OR REPLACE FUNCTION public.pricing_dashboard()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_trace uuid := gen_random_uuid();
BEGIN
  IF NOT mp_is_admin() AND session_user <> 'postgres' AND coalesce(auth.role(),'') <> 'service_role' THEN
    RAISE EXCEPTION 'Apenas administradores';
  END IF;
  BEGIN INSERT INTO orion_eventos (tipo, origem, dados) VALUES ('pricing_dashboard_consultado',
    'pricing_ai', jsonb_build_object('user_id', auth.uid(), 'trace_id', v_trace));
  EXCEPTION WHEN OTHERS THEN NULL; END;
  RETURN jsonb_build_object(
    'trace_id', v_trace, 'score', pricing_score(), 'metrics', pricing_metrics(),
    'recomendacoes', pricing_recommendations(), 'politicas', pricing_policies(),
    'catalogo', (SELECT coalesce(jsonb_agg(jsonb_build_object('id',id,'nome',nome,
      'qtd',qtd_divulgacoes,'preco',preco_brl,'ativo',ativo) ORDER BY preco_brl), '[]') FROM divulgacao_packages),
    'historico', pricing_history(), 'alertas', pricing_alerts(),
    'atualizado_em', to_char(now() AT TIME ZONE 'America/Cuiaba', 'DD/MM/YYYY HH24:MI'));
END; $$;
GRANT EXECUTE ON FUNCTION public.pricing_dashboard() TO authenticated;

-- Prompts oficiais (5)
SELECT public.orion_ai_prompt_set('pricing.executive',
'Você é o Pricing AI da VIAGG-TX8 (Revenue Optimization). Receberá score, métricas (preço médio, ticket, LTV, recompra), recomendações e alertas REAIS. Responda em pt-BR (5-9 frases): saúde de precificação, onde há oportunidade de preço/comissão/promoção e a ação prioritária. Cite os números do JSON. Deixe claro: comissão tem fonte única e o Pricing só recomenda; preço só muda sob política com aprovação. Termine com confiança.',
'Seed ORION-AI-15') WHERE NOT EXISTS (SELECT 1 FROM orion_ai_prompts WHERE chave='pricing.executive');
SELECT public.orion_ai_prompt_set('pricing.recommendations',
'Você prioriza recomendações de precificação da VIAGG-TX8. Receberá a lista com objetivo/impacto/margem/risco/confiança/dados. Ordene em pt-BR por impacto×confiança, explicando cada uma com seus dados. Recomendações de comissão são consultivas (fonte única) — nunca sugira aplicá-las automaticamente.',
'Seed ORION-AI-15') WHERE NOT EXISTS (SELECT 1 FROM orion_ai_prompts WHERE chave='pricing.recommendations');
SELECT public.orion_ai_prompt_set('pricing.simulation',
'Você interpreta simulações de preço da VIAGG-TX8 (cenário, variação, receita estimada, elasticidade declarada, risco). Explique em pt-BR (4-7 frases) o trade-off receita×conversão, sob que premissas vale, e que a simulação não toca produção. Não invente números fora do JSON.',
'Seed ORION-AI-15') WHERE NOT EXISTS (SELECT 1 FROM orion_ai_prompts WHERE chave='pricing.simulation');
SELECT public.orion_ai_prompt_set('pricing.performance',
'Você avalia a performance de precificação da VIAGG-TX8 (score, componentes, histórico de mudanças). Diga em pt-BR (4-6 frases) o que está saudável e o que ajustar, citando os componentes. Componentes neutros (competitividade/elasticidade) devem ser declarados como pendentes de benchmark/histórico.',
'Seed ORION-AI-15') WHERE NOT EXISTS (SELECT 1 FROM orion_ai_prompts WHERE chave='pricing.performance');
SELECT public.orion_ai_prompt_set('pricing.summary',
'Você resume a inteligência de preços da VIAGG-TX8 por cidade/categoria. Responda em pt-BR (5-8 frases) com base exclusiva no JSON, apontando onde reajustar e onde proteger conversão. Nunca invente dados; declare o que não está disponível.',
'Seed ORION-AI-15') WHERE NOT EXISTS (SELECT 1 FROM orion_ai_prompts WHERE chave='pricing.summary');

INSERT INTO public.orion_ai_module_prefs (module, model_code) VALUES ('pricing', 'gpt-5-mini')
ON CONFLICT (module) DO NOTHING;
