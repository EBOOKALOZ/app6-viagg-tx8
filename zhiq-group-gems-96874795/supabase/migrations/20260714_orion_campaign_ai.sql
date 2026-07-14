-- ═══════════════════════════════════════════════════════════════
-- ORION-AI-05 — CAMPAIGN AI v1.0
--
-- Planeja, acompanha, otimiza e aprende com campanhas de divulgação.
-- NUNCA publica direto: toda publicação sai por motor_publish_request
-- (porta única). NUNCA altera campanha publicada/concluída. NUNCA
-- seleciona grupos fora da cidade do anúncio. Planejamento é SQL
-- determinístico (explicável por construção) e usa o aprendizado
-- (orion_aprendizado) quando houver histórico. Campanha nasce
-- AUTOMATICAMENTE do evento pacote_montado (claim idempotente por
-- UNIQUE pacote_id — evento duplicado nunca duplica campanha).
--
-- Aplicada via Management API em 2026-07-14. Idempotente.
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.orion_campanhas (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pacote_id    uuid NOT NULL UNIQUE,          -- idempotência: 1 campanha por pacote
  listing_id   uuid,
  tabela       text,
  nome         text NOT NULL,
  objetivo     text,
  cidade       text,
  categoria    text,
  status       text NOT NULL DEFAULT 'planejada', -- planejada|ativa|pausada|concluida|cancelada|erro|dlq
  prioridade   text NOT NULL DEFAULT 'normal',    -- alta|normal|baixa
  duracao_dias int NOT NULL DEFAULT 7,
  inicio       timestamptz,
  fim          timestamptz,
  plano        jsonb,
  recomendacao jsonb,
  metricas     jsonb,
  versao       int NOT NULL DEFAULT 1,
  tentativas   int NOT NULL DEFAULT 0,
  erro         text,
  motor_requests jsonb NOT NULL DEFAULT '[]'::jsonb,
  criado_em    timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_orion_campanhas_status ON public.orion_campanhas (status);
ALTER TABLE public.orion_campanhas ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS oc_select_admin ON public.orion_campanhas;
CREATE POLICY oc_select_admin ON public.orion_campanhas
  FOR SELECT TO authenticated USING (mp_is_admin());
-- sem policies de escrita: mudanças SÓ via RPCs SECURITY DEFINER

CREATE TABLE IF NOT EXISTS public.orion_campanhas_versoes (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campanha_id uuid NOT NULL,
  versao      int NOT NULL,
  plano       jsonb,
  recomendacao jsonb,
  motivo      text,
  autor       uuid,
  criado_em   timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.orion_campanhas_versoes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS ocv_select_admin ON public.orion_campanhas_versoes;
CREATE POLICY ocv_select_admin ON public.orion_campanhas_versoes
  FOR SELECT TO authenticated USING (mp_is_admin());

-- Campanha concluída/cancelada é imutável para humanos
CREATE OR REPLACE FUNCTION public.orion_campanhas_guard()
RETURNS trigger AS $$
BEGIN
  IF OLD.status IN ('concluida','cancelada')
     AND coalesce(current_setting('role', true),'') <> 'service_role'
     AND coalesce(current_setting('orion.campaign_admin', true),'') <> 'on' THEN
    RAISE EXCEPTION 'Campanha % é imutável', OLD.status;
  END IF;
  NEW.atualizado_em := now();
  RETURN NEW;
END; $$ LANGUAGE plpgsql SECURITY DEFINER;
DROP TRIGGER IF EXISTS trg_orion_campanhas_guard ON public.orion_campanhas;
CREATE TRIGGER trg_orion_campanhas_guard BEFORE UPDATE ON public.orion_campanhas
  FOR EACH ROW EXECUTE FUNCTION public.orion_campanhas_guard();

CREATE OR REPLACE FUNCTION public.orion_campaign_emit(p_tipo text, p_dados jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  BEGIN
    INSERT INTO orion_eventos (tipo, origem, dados) VALUES (p_tipo, 'campaign_ai', p_dados);
  EXCEPTION WHEN OTHERS THEN NULL;
  END;
END; $$;

-- ─────────────────────────────────────────────
-- PLANEJAMENTO (determinístico + aprendizado quando existir)
-- ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.orion_campaign_planejar(p_campanha uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  c RECORD; p RECORD;
  v_grupos jsonb; v_n_grupos int; v_membros int;
  v_janela text; v_melhor_hora_hist int; v_plano jsonb; v_rec jsonb; v_conf numeric;
BEGIN
  IF session_user <> 'postgres' AND coalesce(auth.role(),'') <> 'service_role' AND NOT mp_is_admin() THEN
    RAISE EXCEPTION 'acesso negado';
  END IF;
  SELECT * INTO c FROM orion_campanhas WHERE id = p_campanha;
  IF c IS NULL THEN RAISE EXCEPTION 'Campanha inexistente'; END IF;
  SELECT * INTO p FROM orion_pacotes WHERE id = c.pacote_id;

  -- grupos SEMPRE da cidade do anúncio (regra inegociável)
  SELECT coalesce(jsonb_agg(jsonb_build_object('id', id, 'nome', coalesce(real_name, group_name),
           'membros', members_count) ORDER BY members_count DESC NULLS LAST), '[]'),
         count(*), coalesce(sum(members_count),0)
    INTO v_grupos, v_n_grupos, v_membros
  FROM whatsapp_groups
  WHERE is_active AND coalesce(is_valid,true)
    AND c.cidade IS NOT NULL
    AND public.orion_norm(coalesce(city_name,'')) = public.orion_norm(c.cidade);

  -- aprendizado: melhor hora observada em publicações anteriores (se houver)
  BEGIN
    SELECT (dados->>'hora')::int INTO v_melhor_hora_hist FROM orion_aprendizado
    WHERE contexto = 'publicacao_resultado' AND dados->>'ctr' IS NOT NULL
    ORDER BY (dados->>'ctr')::numeric DESC LIMIT 1;
  EXCEPTION WHEN OTHERS THEN v_melhor_hora_hist := NULL;
  END;

  v_janela := CASE
    WHEN c.categoria LIKE '%service%'     THEN '09:00-11:00'
    WHEN c.categoria LIKE '%real_estate%' THEN '19:00-21:00'
    WHEN c.categoria LIKE '%vehicle%'     THEN '12:00-14:00'
    WHEN c.categoria LIKE '%travel%'      THEN '20:00-22:00'
    ELSE '18:00-20:00' END;

  v_plano := jsonb_build_object(
    'canais', jsonb_build_array('feed','whatsapp'),
    'frequencia', jsonb_build_object('diaria', 1, 'semanal', 5, 'mensal', 20,
      'intervalo_min_horas', 6, 'intervalo_max_horas', 48,
      'nota_cooldown', 'respeita o intervalo mínimo entre publicações do mesmo anúncio'),
    'janela_horario', coalesce(v_melhor_hora_hist::text || ':00 (aprendizado histórico)', v_janela || ' (heurística por categoria)'),
    'melhor_dia', 'sexta e sábado (heurística; refina com histórico)',
    'grupos_recomendados', v_grupos,
    'grupos_na_cidade', v_n_grupos,
    'alcance_potencial', v_membros,
    'orcamento_previsto', p.recomendacao->'melhor',
    'estrategia', CASE WHEN v_n_grupos > 0
      THEN format('Distribuir em %s grupo(s) de %s dentro da janela ideal, 1x/dia, priorizando maiores grupos', v_n_grupos, c.cidade)
      ELSE 'Sem grupos na cidade: manter feed/marketplace e recomendar captação de grupos (expansão)' END);

  v_conf := least(0.9, 0.4 + 0.2*(v_n_grupos > 0)::int + 0.1*(v_membros > 100)::int
                      + 0.2*(v_melhor_hora_hist IS NOT NULL)::int);
  v_rec := jsonb_build_object(
    'motivo', format('Plano baseado em %s grupo(s) ativos em %s (~%s membros), janela %s e catálogo oficial',
      v_n_grupos, coalesce(c.cidade,'—'), v_membros, v_janela),
    'indicadores', jsonb_build_object('grupos', v_n_grupos, 'membros', v_membros,
      'historico_aprendizado', v_melhor_hora_hist IS NOT NULL,
      'fonte', 'whatsapp_groups + orion_pacotes + orion_aprendizado'),
    'confianca', v_conf,
    'probabilidade_sucesso', CASE WHEN v_n_grupos >= 3 THEN 'alta' WHEN v_n_grupos >= 1 THEN 'média' ELSE 'baixa' END,
    'riscos', jsonb_build_array(
      CASE WHEN v_n_grupos = 0 THEN 'Nenhum grupo ativo na cidade — alcance limitado ao feed' ELSE 'Cobertura de grupos ainda em expansão' END,
      'Métricas reais dependem do Dispatcher M54/GLM'),
    'alternativas', jsonb_build_array('Aumentar frequência após 3 dias de CTR bom', 'Adicionar canal push quando disponível'),
    'impacto_estimado', jsonb_build_object('alcance', v_membros, 'cliques_estimados', round(v_membros * 0.02)),
    'decisao', 'Iniciar campanha é ação do administrador — a ORION planeja e recomenda.');

  UPDATE orion_campanhas SET plano = v_plano, recomendacao = v_rec,
    prioridade = CASE WHEN v_n_grupos >= 3 THEN 'alta' WHEN v_n_grupos >= 1 THEN 'normal' ELSE 'baixa' END,
    status = 'planejada', erro = NULL
  WHERE id = p_campanha;

  PERFORM orion_campaign_emit('campaign_created',
    jsonb_build_object('campanha_id', p_campanha, 'pacote_id', c.pacote_id,
      'cidade', c.cidade, 'grupos', v_n_grupos, 'confianca', v_conf));
  RETURN jsonb_build_object('ok', true, 'plano', v_plano);
END; $$;
GRANT EXECUTE ON FUNCTION public.orion_campaign_planejar(uuid) TO authenticated, service_role;

-- ─────────────────────────────────────────────
-- NASCIMENTO AUTOMÁTICO: pacote_montado → campanha (claim idempotente)
-- ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.orion_campaign_processar_novos(p_limite int DEFAULT 10)
RETURNS int LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE p RECORD; v_id uuid; v_n int := 0;
BEGIN
  IF session_user <> 'postgres' AND coalesce(auth.role(),'') <> 'service_role' AND NOT mp_is_admin() THEN
    RAISE EXCEPTION 'acesso negado';
  END IF;
  FOR p IN
    SELECT * FROM orion_pacotes pac
    WHERE pac.status IN ('montado','enviado_motor','publicado')
      AND NOT EXISTS (SELECT 1 FROM orion_campanhas oc WHERE oc.pacote_id = pac.id)
    ORDER BY pac.criado_em LIMIT p_limite
  LOOP
    INSERT INTO orion_campanhas (pacote_id, listing_id, tabela, cidade, categoria, nome, objetivo)
    VALUES (p.id, p.listing_id, p.tabela, p.cidade, p.categoria,
            format('Campanha — %s', coalesce(p.conteudo->>'titulo', p.titulo_original, 'anúncio')),
            'Maximizar alcance e contatos do anúncio dentro da cidade')
    ON CONFLICT (pacote_id) DO NOTHING
    RETURNING id INTO v_id;
    IF v_id IS NOT NULL THEN
      PERFORM orion_campaign_planejar(v_id);
      v_n := v_n + 1;
    END IF;
  END LOOP;
  RETURN v_n;
END; $$;
GRANT EXECUTE ON FUNCTION public.orion_campaign_processar_novos(int) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.orion_campaign_tg_evento()
RETURNS trigger AS $$
BEGIN
  IF NEW.tipo = 'pacote_montado' THEN
    BEGIN PERFORM public.orion_campaign_processar_novos(5);
    EXCEPTION WHEN OTHERS THEN NULL; END;
  END IF;
  RETURN NEW;
END; $$ LANGUAGE plpgsql SECURITY DEFINER;
DROP TRIGGER IF EXISTS trg_orion_campaign_evento ON public.orion_eventos;
CREATE TRIGGER trg_orion_campaign_evento AFTER INSERT ON public.orion_eventos
  FOR EACH ROW EXECUTE FUNCTION public.orion_campaign_tg_evento();

-- ─────────────────────────────────────────────
-- CICLO DE VIDA (admin) — publicação SÓ via motor_publish_request
-- ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.orion_campaign_iniciar(p_campanha uuid, p_canais text[] DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE c RECORD; p RECORD; v_canal text; v_res jsonb; v_reqs jsonb := '[]'::jsonb; v_canais text[];
BEGIN
  IF NOT mp_is_admin() THEN RAISE EXCEPTION 'Apenas administradores'; END IF;
  SELECT * INTO c FROM orion_campanhas WHERE id = p_campanha AND status IN ('planejada','pausada');
  IF c IS NULL THEN RAISE EXCEPTION 'Campanha não está planejada/pausada'; END IF;
  SELECT * INTO p FROM orion_pacotes WHERE id = c.pacote_id;
  IF p.conteudo IS NULL THEN RAISE EXCEPTION 'Pacote sem conteúdo montado'; END IF;

  v_canais := coalesce(p_canais,
    (SELECT array_agg(x) FROM jsonb_array_elements_text(c.plano->'canais') x));

  FOREACH v_canal IN ARRAY v_canais LOOP
    v_res := motor_publish_request('campaign_ai', v_canal,
      coalesce(p.conteudo->v_canal, p.conteudo->'feed', p.conteudo),
      c.cidade, c.pacote_id, NULL,
      'camp:' || p_campanha::text || ':' || v_canal || ':v' || c.versao);
    v_reqs := v_reqs || jsonb_build_object('canal', v_canal,
      'request_id', v_res->>'request_id', 'status', v_res->>'status');
  END LOOP;

  UPDATE orion_campanhas SET status = 'ativa',
    inicio = coalesce(inicio, now()), fim = coalesce(fim, now() + (duracao_dias || ' days')::interval),
    motor_requests = motor_requests || v_reqs
  WHERE id = p_campanha;

  PERFORM orion_campaign_emit('campaign_started',
    jsonb_build_object('campanha_id', p_campanha, 'canais', v_canais, 'requests', v_reqs));
  RETURN jsonb_build_object('ok', true, 'requests', v_reqs);
END; $$;
GRANT EXECUTE ON FUNCTION public.orion_campaign_iniciar(uuid, text[]) TO authenticated;

CREATE OR REPLACE FUNCTION public.orion_campaign_estado(p_campanha uuid, p_acao text, p_motivo text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_novo text; v_evento text;
BEGIN
  IF NOT mp_is_admin() THEN RAISE EXCEPTION 'Apenas administradores'; END IF;
  v_novo := CASE p_acao WHEN 'pausar' THEN 'pausada' WHEN 'retomar' THEN 'ativa'
                        WHEN 'cancelar' THEN 'cancelada' WHEN 'concluir' THEN 'concluida'
            ELSE NULL END;
  IF v_novo IS NULL THEN RAISE EXCEPTION 'Ação inválida: %', p_acao; END IF;
  v_evento := CASE p_acao WHEN 'pausar' THEN 'campaign_paused' WHEN 'retomar' THEN 'campaign_resumed'
                          WHEN 'cancelar' THEN 'campaign_finished' ELSE 'campaign_finished' END;
  UPDATE orion_campanhas SET status = v_novo, erro = coalesce(p_motivo, erro)
  WHERE id = p_campanha AND status NOT IN ('concluida','cancelada');
  IF NOT FOUND THEN RAISE EXCEPTION 'Campanha não encontrada ou já encerrada (imutável)'; END IF;
  PERFORM orion_campaign_emit(v_evento,
    jsonb_build_object('campanha_id', p_campanha, 'acao', p_acao, 'motivo', p_motivo));
  RETURN jsonb_build_object('ok', true, 'status', v_novo);
END; $$;
GRANT EXECUTE ON FUNCTION public.orion_campaign_estado(uuid, text, text) TO authenticated;

-- ─────────────────────────────────────────────
-- MÉTRICAS + ROI (de publication_metrics; honesto quando não há dados)
-- ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.orion_campaign_metricas(p_campanha uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  c RECORD; v_views int; v_cliques int; v_conv int; v_contatos int;
  v_custo numeric; v_receita numeric; v_m jsonb;
BEGIN
  IF session_user <> 'postgres' AND coalesce(auth.role(),'') <> 'service_role' AND NOT mp_is_admin() THEN
    RAISE EXCEPTION 'acesso negado';
  END IF;
  SELECT * INTO c FROM orion_campanhas WHERE id = p_campanha;
  IF c IS NULL THEN RAISE EXCEPTION 'Campanha inexistente'; END IF;

  SELECT coalesce(sum(views),0), coalesce(sum(cliques),0), coalesce(sum(conversoes),0), coalesce(sum(contatos),0)
    INTO v_views, v_cliques, v_conv, v_contatos
  FROM publication_metrics WHERE pacote_id = c.pacote_id;

  v_custo := coalesce((c.plano->'orcamento_previsto'->>'preco_brl')::numeric, 0);
  v_receita := 0;  -- receita realizada: será ligada quando houver rastreio de conversão→pedido

  v_m := jsonb_build_object(
    'views', v_views, 'cliques', v_cliques, 'contatos', v_contatos, 'conversoes', v_conv,
    'ctr_pct', CASE WHEN v_views > 0 THEN round(v_cliques::numeric * 100 / v_views, 2) ELSE NULL END,
    'custo_previsto_brl', v_custo,
    'receita_realizada_brl', v_receita,
    'cpm', CASE WHEN v_views >= 1000 THEN round(v_custo * 1000 / v_views, 2) ELSE NULL END,
    'cpc', CASE WHEN v_cliques > 0 THEN round(v_custo / v_cliques, 2) ELSE NULL END,
    'cpa', CASE WHEN v_conv > 0 THEN round(v_custo / v_conv, 2) ELSE NULL END,
    'roi', CASE WHEN v_custo > 0 THEN round((v_receita - v_custo) * 100 / v_custo, 1) ELSE NULL END,
    'roas', CASE WHEN v_custo > 0 THEN round(v_receita / v_custo, 2) ELSE NULL END,
    'nota', CASE WHEN v_views = 0 THEN 'Sem métricas ainda — chegam via GLM/Dispatcher (motor_publish_metrics_registrar)' ELSE NULL END,
    'atualizado_em', now());

  UPDATE orion_campanhas SET metricas = v_m WHERE id = p_campanha;

  IF v_views > 0 THEN
    BEGIN
      INSERT INTO orion_aprendizado (contexto, dados)
      VALUES ('campaign_learning', v_m || jsonb_build_object('campanha_id', p_campanha,
        'cidade', c.cidade, 'categoria', c.categoria));
    EXCEPTION WHEN OTHERS THEN NULL; END;
    PERFORM orion_campaign_emit('campaign_learning',
      jsonb_build_object('campanha_id', p_campanha, 'ctr', v_m->>'ctr_pct'));
  END IF;
  RETURN v_m;
END; $$;
GRANT EXECUTE ON FUNCTION public.orion_campaign_metricas(uuid) TO authenticated, service_role;

-- ─────────────────────────────────────────────
-- OTIMIZAÇÃO (sugere, NUNCA aplica sem admin)
-- ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.orion_campaign_otimizar(p_campanha uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE c RECORD; v_m jsonb; v_sug jsonb := '[]'::jsonb;
BEGIN
  IF session_user <> 'postgres' AND coalesce(auth.role(),'') <> 'service_role' AND NOT mp_is_admin() THEN
    RAISE EXCEPTION 'acesso negado';
  END IF;
  SELECT * INTO c FROM orion_campanhas WHERE id = p_campanha;
  v_m := orion_campaign_metricas(p_campanha);

  IF (v_m->>'views')::int = 0 THEN
    v_sug := v_sug || jsonb_build_object('sugestao','Aguardar entrega do Dispatcher/GLM ou reforçar canal feed',
      'motivo','Nenhuma visualização registrada ainda');
  ELSIF coalesce((v_m->>'ctr_pct')::numeric, 0) < 1 THEN
    v_sug := v_sug
      || jsonb_build_object('sugestao','Trocar janela de horário para a noite (19:00-21:00)','motivo','CTR abaixo de 1%')
      || jsonb_build_object('sugestao','Reprocessar pacote com novo texto (Package AI)','motivo','Criativo pode estar fraco')
      || jsonb_build_object('sugestao','Reduzir frequência para evitar fadiga','motivo','CTR baixo com volume alto');
  ELSE
    v_sug := v_sug || jsonb_build_object('sugestao','Manter estratégia; considerar aumentar frequência',
      'motivo', format('CTR saudável (%s%%)', v_m->>'ctr_pct'));
  END IF;

  PERFORM orion_campaign_emit('campaign_optimized',
    jsonb_build_object('campanha_id', p_campanha, 'sugestoes', v_sug,
      'aplicacao', 'manual — requer autorização administrativa'));
  RETURN jsonb_build_object('ok', true, 'metricas', v_m, 'sugestoes', v_sug);
END; $$;
GRANT EXECUTE ON FUNCTION public.orion_campaign_otimizar(uuid) TO authenticated, service_role;

-- ─────────────────────────────────────────────
-- EXPANSÃO (cidades com anúncio e sem cobertura de grupos)
-- ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.orion_campaign_expansao()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF session_user <> 'postgres' AND coalesce(auth.role(),'') <> 'service_role' AND NOT mp_is_admin() THEN
    RAISE EXCEPTION 'acesso negado';
  END IF;
  RETURN jsonb_build_object(
    'cidades_sem_grupos', (
      SELECT coalesce(jsonb_agg(jsonb_build_object('cidade', cidade, 'anuncios', n)), '[]')
      FROM (SELECT p.cidade, count(*) n FROM orion_pacotes p
            WHERE p.cidade IS NOT NULL
              AND NOT EXISTS (SELECT 1 FROM whatsapp_groups g
                              WHERE g.is_active
                                AND public.orion_norm(coalesce(g.city_name,'')) = public.orion_norm(p.cidade))
            GROUP BY 1 ORDER BY n DESC LIMIT 10) x),
    'recomendacao', 'Captar grupos WhatsApp nas cidades listadas antes de investir em campanhas pagas locais',
    'fonte', 'orion_pacotes × whatsapp_groups');
END; $$;
GRANT EXECUTE ON FUNCTION public.orion_campaign_expansao() TO authenticated, service_role;

-- ─────────────────────────────────────────────
-- DASHBOARD (admin)
-- ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.orion_campaign_dashboard()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT mp_is_admin() AND session_user <> 'postgres' AND coalesce(auth.role(),'') <> 'service_role' THEN
    RAISE EXCEPTION 'Apenas administradores';
  END IF;
  RETURN jsonb_build_object(
    'por_status', (SELECT coalesce(jsonb_object_agg(status, n), '{}') FROM
      (SELECT status, count(*) n FROM orion_campanhas GROUP BY 1) s),
    'campanhas', (SELECT coalesce(jsonb_agg(to_jsonb(c) ORDER BY c.criado_em DESC), '[]') FROM
      (SELECT * FROM orion_campanhas ORDER BY criado_em DESC LIMIT 30) c),
    'ranking_ctr', (SELECT coalesce(jsonb_agg(jsonb_build_object('nome', nome, 'ctr', metricas->>'ctr_pct')
        ORDER BY (metricas->>'ctr_pct')::numeric DESC NULLS LAST), '[]') FROM
      (SELECT nome, metricas FROM orion_campanhas WHERE metricas->>'ctr_pct' IS NOT NULL LIMIT 10) r),
    'em_risco', (SELECT coalesce(jsonb_agg(jsonb_build_object('id', id, 'nome', nome, 'motivo',
        CASE WHEN status='dlq' THEN 'DLQ' WHEN status='erro' THEN erro
             WHEN (metricas->>'views')::int = 0 AND status='ativa' AND inicio < now() - interval '2 days'
             THEN 'ativa há 2+ dias sem métricas' END)), '[]') FROM orion_campanhas
      WHERE status IN ('erro','dlq')
         OR (status='ativa' AND (metricas->>'views')::int = 0 AND inicio < now() - interval '2 days')),
    'motor', (SELECT coalesce(jsonb_object_agg(status, n), '{}') FROM
      (SELECT status, count(*) n FROM motor_publish_requests WHERE origem='campaign_ai' GROUP BY 1) m),
    'expansao', orion_campaign_expansao(),
    'eventos', (SELECT coalesce(jsonb_agg(jsonb_build_object('tipo', tipo, 'quando', criado_em) ORDER BY criado_em DESC), '[]')
      FROM (SELECT tipo, criado_em FROM orion_eventos WHERE tipo LIKE 'campaign_%'
            ORDER BY criado_em DESC LIMIT 15) e),
    'atualizado_em', to_char(now() AT TIME ZONE 'America/Cuiaba', 'DD/MM/YYYY HH24:MI'));
END; $$;
GRANT EXECUTE ON FUNCTION public.orion_campaign_dashboard() TO authenticated;

-- ─────────────────────────────────────────────
-- TICK (cron 10 min): novas + métricas ativas + expiração + DLQ
-- ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.orion_campaign_tick()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE c RECORD;
BEGIN
  PERFORM orion_campaign_processar_novos(10);
  FOR c IN SELECT id FROM orion_campanhas WHERE status = 'ativa' LOOP
    BEGIN PERFORM orion_campaign_metricas(c.id);
    EXCEPTION WHEN OTHERS THEN
      UPDATE orion_campanhas SET tentativas = tentativas + 1,
        status = CASE WHEN tentativas + 1 >= 3 THEN 'dlq' ELSE status END,
        erro = SQLERRM WHERE id = c.id;
    END;
  END LOOP;
  -- concluir expiradas
  PERFORM set_config('orion.campaign_admin', 'on', true);
  UPDATE orion_campanhas SET status = 'concluida'
  WHERE status = 'ativa' AND fim IS NOT NULL AND fim < now();
  PERFORM set_config('orion.campaign_admin', 'off', true);
  -- alerta DLQ
  PERFORM orion_campaign_emit('campaign_alert',
    jsonb_build_object('dlq', (SELECT count(*) FROM orion_campanhas WHERE status='dlq')));
END; $$;

DO $$
BEGIN
  BEGIN PERFORM cron.unschedule('orion_campaign_tick'); EXCEPTION WHEN OTHERS THEN NULL; END;
  PERFORM cron.schedule('orion_campaign_tick', '*/10 * * * *', 'SELECT public.orion_campaign_tick()');
END $$;

-- pref de modelo p/ pareceres do estrategista (painel)
INSERT INTO public.orion_ai_module_prefs (module, model_code) VALUES ('campaign', 'gpt-5-mini')
ON CONFLICT (module) DO NOTHING;
INSERT INTO public.orion_ai_module_prefs (module, model_code) VALUES ('finance', 'gpt-5-nano')
ON CONFLICT (module) DO NOTHING;
