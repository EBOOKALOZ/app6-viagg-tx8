-- ═══════════════════════════════════════════════════════════════
-- ORION-AI-03 — PACKAGE AI v2.0 + FASE 0: Motor de Publicação
--
-- FASE 0 (porta única, que não existia — auditoria 07-14):
--   motor_publish_request/status/cancel/retry + pub_events (imutável)
--   + publication_history + publication_metrics. NENHUM módulo publica
--   fora desta porta. Canais feed/marketplace são intrínsecos à
--   plataforma (anúncio aprovado já está nela) → publicado imediato;
--   whatsapp/push ficam 'aguardando_dispatcher' (M54) — o motor é
--   desacoplado por desenho.
--
-- PACKAGE AI: consome anuncio_aprovado do sistema nervoso (claim
-- idempotente por UNIQUE — evento duplicado NUNCA duplica pacote),
-- worker monta conteúdo via ORION AI Gateway, recomendação comercial
-- EXPLICÁVEL (catálogo oficial = divulgacao_packages), qualidade LGPD
-- (zero telefone/PIX/e-mail), versionamento (nunca sobrescreve),
-- DLQ após 3 tentativas, eventos pacote_* no nervoso.
--
-- Aplicada via Management API em 2026-07-14. Idempotente.
-- ═══════════════════════════════════════════════════════════════

-- ╔════════════ FASE 0 — MOTOR DE PUBLICAÇÃO ════════════╗

CREATE TABLE IF NOT EXISTS public.motor_publish_requests (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  origem        text NOT NULL,
  pacote_id     uuid,
  canal         text NOT NULL,
  cidade        text,
  conteudo      jsonb NOT NULL,
  agendado_para timestamptz,
  status        text NOT NULL DEFAULT 'fila',  -- fila|aguardando_dispatcher|publicado|cancelado|erro|retry|dlq
  tentativas    int NOT NULL DEFAULT 0,
  erro          text,
  idem_key      text UNIQUE,
  criado_por    uuid,
  criado_em     timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_mpr_status ON public.motor_publish_requests (status);
ALTER TABLE public.motor_publish_requests ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS mpr_select_admin ON public.motor_publish_requests;
CREATE POLICY mpr_select_admin ON public.motor_publish_requests
  FOR SELECT TO authenticated USING (mp_is_admin());

CREATE TABLE IF NOT EXISTS public.pub_events (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id uuid,
  tipo       text NOT NULL,
  dados      jsonb DEFAULT '{}'::jsonb,
  criado_em  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_pub_events_req ON public.pub_events (request_id);
ALTER TABLE public.pub_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS pub_events_select_admin ON public.pub_events;
CREATE POLICY pub_events_select_admin ON public.pub_events
  FOR SELECT TO authenticated USING (mp_is_admin());
REVOKE UPDATE, DELETE ON public.pub_events FROM authenticated, anon;

CREATE TABLE IF NOT EXISTS public.publication_history (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id   uuid NOT NULL,
  pacote_id    uuid,
  canal        text,
  cidade       text,
  status_final text NOT NULL,
  duracao_ms   int,
  criado_em    timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.publication_history ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS pub_hist_select_admin ON public.publication_history;
CREATE POLICY pub_hist_select_admin ON public.publication_history
  FOR SELECT TO authenticated USING (mp_is_admin());

CREATE TABLE IF NOT EXISTS public.publication_metrics (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id  uuid,
  pacote_id   uuid,
  canal       text,
  cidade      text,
  categoria   text,
  views       int DEFAULT 0,
  cliques     int DEFAULT 0,
  contatos    int DEFAULT 0,
  conversoes  int DEFAULT 0,
  registrado_em timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.publication_metrics ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS pub_metrics_select_admin ON public.publication_metrics;
CREATE POLICY pub_metrics_select_admin ON public.publication_metrics
  FOR SELECT TO authenticated USING (mp_is_admin());

CREATE OR REPLACE FUNCTION public.motor_emit(p_request uuid, p_tipo text, p_dados jsonb DEFAULT '{}'::jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO pub_events (request_id, tipo, dados) VALUES (p_request, p_tipo, p_dados);
  BEGIN
    INSERT INTO orion_eventos (tipo, origem, dados)
    VALUES (p_tipo, 'motor_publicacao', p_dados || jsonb_build_object('request_id', p_request));
  EXCEPTION WHEN OTHERS THEN NULL;
  END;
END; $$;

-- Porta única de publicação. LGPD: recusa conteúdo com telefone/PIX/e-mail.
CREATE OR REPLACE FUNCTION public.motor_publish_request(
  p_origem text, p_canal text, p_conteudo jsonb,
  p_cidade text DEFAULT NULL, p_pacote_id uuid DEFAULT NULL,
  p_agendar timestamptz DEFAULT NULL, p_idem_key text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_id uuid; v_status text; v_texto text;
BEGIN
  IF coalesce(auth.role(),'') <> 'service_role' AND NOT mp_is_admin() THEN
    RAISE EXCEPTION 'motor_publish_request: acesso negado';
  END IF;
  IF p_canal NOT IN ('whatsapp','feed','marketplace','push') THEN
    RAISE EXCEPTION 'Canal inválido: %', p_canal;
  END IF;

  v_texto := lower(p_conteudo::text);
  IF v_texto ~ '\(?\d{2}\)?[\s\.\-]*9?\d{4}[\s\.\-]?\d{4}'   -- (66) 99999-8888 e variações
     OR v_texto ~ '\d{5}[\s\.\-]\d{4}'                        -- 99999-8888 sem DDD
     OR v_texto ~ '\d{9,}'                                    -- telefone colado (11 dígitos)
     OR v_texto LIKE '%pix%'
     OR v_texto ~ '[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}' THEN
    RAISE EXCEPTION 'LGPD: conteúdo contém telefone/PIX/e-mail — publicação recusada';
  END IF;

  -- idempotência: mesma idem_key nunca duplica
  IF p_idem_key IS NOT NULL THEN
    SELECT id INTO v_id FROM motor_publish_requests WHERE idem_key = p_idem_key;
    IF v_id IS NOT NULL THEN
      RETURN jsonb_build_object('ok', true, 'request_id', v_id, 'duplicado', true);
    END IF;
  END IF;

  -- feed/marketplace: a plataforma É o canal (anúncio aprovado já visível) → publicado
  v_status := CASE WHEN p_canal IN ('feed','marketplace') THEN 'publicado'
                   ELSE 'aguardando_dispatcher' END;

  INSERT INTO motor_publish_requests
    (origem, pacote_id, canal, cidade, conteudo, agendado_para, status, idem_key, criado_por)
  VALUES (p_origem, p_pacote_id, p_canal, p_cidade, p_conteudo, p_agendar, v_status, p_idem_key, auth.uid())
  RETURNING id INTO v_id;

  PERFORM motor_emit(v_id, 'publicacao_solicitada',
    jsonb_build_object('origem', p_origem, 'canal', p_canal, 'cidade', p_cidade, 'pacote_id', p_pacote_id));
  IF v_status = 'publicado' THEN
    INSERT INTO publication_history (request_id, pacote_id, canal, cidade, status_final, duracao_ms)
    VALUES (v_id, p_pacote_id, p_canal, p_cidade, 'publicado', 0);
    PERFORM motor_emit(v_id, 'pacote_publicado',
      jsonb_build_object('canal', p_canal, 'pacote_id', p_pacote_id));
  END IF;

  RETURN jsonb_build_object('ok', true, 'request_id', v_id, 'status', v_status);
END; $$;
GRANT EXECUTE ON FUNCTION public.motor_publish_request(text, text, jsonb, text, uuid, timestamptz, text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.motor_publish_status(p_request uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF coalesce(auth.role(),'') <> 'service_role' AND NOT mp_is_admin() THEN
    RAISE EXCEPTION 'acesso negado';
  END IF;
  RETURN jsonb_build_object(
    'request', (SELECT to_jsonb(r) FROM motor_publish_requests r WHERE id = p_request),
    'eventos', (SELECT coalesce(jsonb_agg(jsonb_build_object('tipo', tipo, 'quando', criado_em) ORDER BY criado_em), '[]')
                FROM pub_events WHERE request_id = p_request));
END; $$;
GRANT EXECUTE ON FUNCTION public.motor_publish_status(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.motor_publish_cancel(p_request uuid, p_motivo text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_rows int;
BEGIN
  IF coalesce(auth.role(),'') <> 'service_role' AND NOT mp_is_admin() THEN
    RAISE EXCEPTION 'acesso negado';
  END IF;
  UPDATE motor_publish_requests
     SET status = 'cancelado', erro = coalesce(p_motivo, erro), atualizado_em = now()
   WHERE id = p_request AND status IN ('fila','aguardando_dispatcher','erro','retry');
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows = 0 THEN RAISE EXCEPTION 'Request % não cancelável', p_request; END IF;
  INSERT INTO publication_history (request_id, status_final)
    SELECT p_request, 'cancelado';
  PERFORM motor_emit(p_request, 'pacote_cancelado', jsonb_build_object('motivo', p_motivo));
  RETURN jsonb_build_object('ok', true);
END; $$;
GRANT EXECUTE ON FUNCTION public.motor_publish_cancel(uuid, text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.motor_publish_retry(p_request uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_rows int;
BEGIN
  IF coalesce(auth.role(),'') <> 'service_role' AND NOT mp_is_admin() THEN
    RAISE EXCEPTION 'acesso negado';
  END IF;
  UPDATE motor_publish_requests
     SET status = 'retry', tentativas = tentativas + 1, atualizado_em = now()
   WHERE id = p_request AND status IN ('erro','dlq','cancelado');
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows = 0 THEN RAISE EXCEPTION 'Request % não elegível para retry', p_request; END IF;
  PERFORM motor_emit(p_request, 'publicacao_retry', '{}'::jsonb);
  RETURN jsonb_build_object('ok', true);
END; $$;
GRANT EXECUTE ON FUNCTION public.motor_publish_retry(uuid) TO authenticated, service_role;

-- ╔════════════ PACKAGE AI ════════════╗

CREATE TABLE IF NOT EXISTS public.orion_pacotes (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  evento_id     bigint,   -- orion_eventos.id é bigserial
  tabela        text NOT NULL,
  listing_id    uuid NOT NULL,
  modulo        text,
  cidade        text,
  categoria     text,
  titulo_original text,
  status        text NOT NULL DEFAULT 'montando', -- montando|montado|enviado_motor|publicado|cancelado|expirado|erro|dlq
  conteudo      jsonb,
  recomendacao  jsonb,
  qualidade     jsonb,
  horario       jsonb,
  versao        int NOT NULL DEFAULT 1,
  tentativas    int NOT NULL DEFAULT 0,
  erro          text,
  motor_requests jsonb NOT NULL DEFAULT '[]'::jsonb,
  criado_em     timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now(),
  expira_em     timestamptz NOT NULL DEFAULT now() + interval '30 days',
  CONSTRAINT orion_pacotes_um_por_anuncio UNIQUE (tabela, listing_id)
);
CREATE INDEX IF NOT EXISTS idx_orion_pacotes_status ON public.orion_pacotes (status);
ALTER TABLE public.orion_pacotes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS orion_pacotes_select_admin ON public.orion_pacotes;
CREATE POLICY orion_pacotes_select_admin ON public.orion_pacotes
  FOR SELECT TO authenticated USING (mp_is_admin());

CREATE TABLE IF NOT EXISTS public.orion_pacotes_versoes (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pacote_id  uuid NOT NULL,
  versao     int NOT NULL,
  conteudo   jsonb,
  recomendacao jsonb,
  motivo     text,
  autor      uuid,
  criado_em  timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.orion_pacotes_versoes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS orion_pacotes_versoes_admin ON public.orion_pacotes_versoes;
CREATE POLICY orion_pacotes_versoes_admin ON public.orion_pacotes_versoes
  FOR SELECT TO authenticated USING (mp_is_admin());

-- Pacote publicado é imutável para humanos (só service_role muda)
CREATE OR REPLACE FUNCTION public.orion_pacotes_guard()
RETURNS trigger AS $$
BEGIN
  IF OLD.status = 'publicado' AND coalesce(current_setting('role', true),'') <> 'service_role' THEN
    RAISE EXCEPTION 'Pacote publicado é imutável';
  END IF;
  NEW.atualizado_em := now();
  RETURN NEW;
END; $$ LANGUAGE plpgsql SECURITY DEFINER;
DROP TRIGGER IF EXISTS trg_orion_pacotes_guard ON public.orion_pacotes;
CREATE TRIGGER trg_orion_pacotes_guard BEFORE UPDATE ON public.orion_pacotes
  FOR EACH ROW EXECUTE FUNCTION public.orion_pacotes_guard();

-- ── Fila do worker: claim idempotente (evento duplicado NUNCA duplica pacote) ──
CREATE OR REPLACE FUNCTION public.orion_package_fila(p_limite int DEFAULT 5)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  ev RECORD; v_titulo text; v_desc text; v_preco text; v_cidade text;
  col_t text; col_d text; col_c text; col_p text;
  claimed jsonb := '[]'::jsonb; v_pid uuid; v_tab text; v_lid uuid;
BEGIN
  IF coalesce(auth.role(),'') <> 'service_role' AND NOT mp_is_admin() THEN
    RAISE EXCEPTION 'orion_package_fila: acesso negado';
  END IF;

  FOR ev IN
    SELECT e.id, e.dados->>'tabela' AS tabela, (e.dados->>'listing_id')::uuid AS listing_id
    FROM orion_eventos e
    WHERE (e.tipo = 'anuncio_aprovado'
           OR (e.tipo = 'anuncio_revisado_manual' AND e.dados->>'decisao' = 'aprovar'))
      AND e.dados->>'tabela' IS NOT NULL AND e.dados->>'listing_id' IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM orion_pacotes p
                      WHERE p.tabela = e.dados->>'tabela'
                        AND p.listing_id = (e.dados->>'listing_id')::uuid)
    ORDER BY e.criado_em
    LIMIT p_limite
  LOOP
    v_tab := ev.tabela; v_lid := ev.listing_id;
    CONTINUE WHEN to_regclass('public.'||v_tab) IS NULL;

    -- claim atômico: UNIQUE garante 1 pacote por anúncio mesmo com workers concorrentes
    INSERT INTO orion_pacotes (evento_id, tabela, listing_id, status)
    VALUES (ev.id, v_tab, v_lid, 'montando')
    ON CONFLICT (tabela, listing_id) DO NOTHING
    RETURNING id INTO v_pid;
    CONTINUE WHEN v_pid IS NULL;

    col_t := NULL; col_d := NULL; col_c := NULL; col_p := NULL;
    SELECT column_name INTO col_t FROM information_schema.columns
     WHERE table_schema='public' AND table_name=v_tab AND column_name = ANY (ARRAY['title','name','property_type'])
     ORDER BY array_position(ARRAY['title','name','property_type'], column_name) LIMIT 1;
    SELECT column_name INTO col_d FROM information_schema.columns
     WHERE table_schema='public' AND table_name=v_tab AND column_name = ANY (ARRAY['description','descricao']) LIMIT 1;
    SELECT column_name INTO col_c FROM information_schema.columns
     WHERE table_schema='public' AND table_name=v_tab AND column_name = ANY (ARRAY['city','cidade']) LIMIT 1;
    SELECT column_name INTO col_p FROM information_schema.columns
     WHERE table_schema='public' AND table_name=v_tab AND column_name = ANY (ARRAY['price','valor','price_per_person','total_price']) LIMIT 1;

    EXECUTE format('SELECT %s, %s, %s, %s FROM public.%I WHERE id = $1',
      CASE WHEN col_t IS NULL THEN 'NULL::text' ELSE format('%I::text', col_t) END,
      CASE WHEN col_d IS NULL THEN 'NULL::text' ELSE format('left(%I::text,1500)', col_d) END,
      CASE WHEN col_c IS NULL THEN 'NULL::text' ELSE format('%I::text', col_c) END,
      CASE WHEN col_p IS NULL THEN 'NULL::text' ELSE format('%I::text', col_p) END,
      v_tab)
    INTO v_titulo, v_desc, v_cidade, v_preco USING v_lid;

    UPDATE orion_pacotes SET cidade = v_cidade, titulo_original = v_titulo,
      modulo = v_tab, categoria = v_tab WHERE id = v_pid;

    claimed := claimed || jsonb_build_object(
      'pacote_id', v_pid, 'tabela', v_tab, 'listing_id', v_lid,
      'titulo', v_titulo, 'descricao', v_desc, 'cidade', v_cidade, 'preco', v_preco);
  END LOOP;

  RETURN claimed;
END; $$;
GRANT EXECUTE ON FUNCTION public.orion_package_fila(int) TO authenticated, service_role;

-- ── Recomendação comercial EXPLICÁVEL (catálogo oficial: divulgacao_packages) ──
CREATE OR REPLACE FUNCTION public.orion_package_recomendar(p_cidade text, p_categoria text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_grupos int; v_membros int; v_alcance int; v_opcoes jsonb; v_melhor jsonb; v_conf numeric;
  v_janela text;
BEGIN
  SELECT count(*), coalesce(sum(members_count),0) INTO v_grupos, v_membros
  FROM whatsapp_groups
  WHERE is_active AND coalesce(is_valid, true)
    AND (p_cidade IS NULL OR lower(coalesce(city_name,'')) = lower(p_cidade));
  IF v_grupos = 0 THEN
    SELECT count(*), coalesce(sum(members_count),0) INTO v_grupos, v_membros
    FROM whatsapp_groups WHERE is_active AND coalesce(is_valid, true);
  END IF;

  v_alcance := greatest(1, round(v_membros * 0.6));
  v_janela := CASE
    WHEN p_categoria LIKE '%service%'     THEN '09:00–11:00 (contratação de serviços de manhã)'
    WHEN p_categoria LIKE '%real_estate%' THEN '19:00–21:00 (imóveis à noite, decisão em família)'
    WHEN p_categoria LIKE '%vehicle%'     THEN '12:00–14:00 e 18:00–20:00 (veículos no intervalo e pós-expediente)'
    WHEN p_categoria LIKE '%travel%'      THEN '20:00–22:00 (viagens no lazer noturno)'
    ELSE '18:00–20:00 (pico geral de atenção)' END;

  SELECT coalesce(jsonb_agg(jsonb_build_object(
      'pacote', nome, 'qtd_divulgacoes', qtd_divulgacoes, 'preco_brl', preco_brl,
      'alcance_estimado', v_alcance * qtd_divulgacoes,
      'cliques_estimados', round(v_alcance * qtd_divulgacoes * 0.02),
      'conversoes_estimadas', greatest(1, round(v_alcance * qtd_divulgacoes * 0.002)),
      'alcance_por_real', round((v_alcance * qtd_divulgacoes) / nullif(preco_brl,0))
    ) ORDER BY preco_brl), '[]')
  INTO v_opcoes FROM divulgacao_packages WHERE ativo;

  SELECT o INTO v_melhor FROM jsonb_array_elements(v_opcoes) o
  ORDER BY (o->>'alcance_por_real')::numeric DESC LIMIT 1;

  v_conf := least(0.9, 0.35 + 0.15 * (CASE WHEN v_grupos > 0 THEN 1 ELSE 0 END)
                        + 0.10 * (CASE WHEN v_membros > 100 THEN 1 ELSE 0 END)
                        + 0.10 * (CASE WHEN p_cidade IS NOT NULL THEN 1 ELSE 0 END));

  RETURN jsonb_build_object(
    'melhor', v_melhor,
    'alternativas', v_opcoes,
    'gratuito', '1 divulgação gratuita por dia (regra vigente do ecossistema)',
    'motivo', format('Com %s grupo(s) ativo(s)%s somando ~%s membros, o pacote %s tem o melhor alcance por real investido.',
      v_grupos, CASE WHEN p_cidade IS NOT NULL THEN ' em '||p_cidade ELSE '' END, v_membros, coalesce(v_melhor->>'pacote','—')),
    'indicadores', jsonb_build_object(
      'grupos_ativos', v_grupos, 'membros_total', v_membros,
      'alcance_por_publicacao', v_alcance,
      'ctr_baseline', '2%', 'conversao_baseline', '0,2%',
      'fonte', 'whatsapp_groups + divulgacao_packages (banco oficial)'),
    'riscos', jsonb_build_array(
      'Estimativas baseadas em médias históricas do setor — resultados variam por anúncio',
      'Cobertura de grupos ainda em expansão em algumas cidades'),
    'confianca', v_conf,
    'horario_recomendado', v_janela,
    'decisao', 'A compra do pacote é SEMPRE do usuário — a ORION apenas recomenda.');
END; $$;
GRANT EXECUTE ON FUNCTION public.orion_package_recomendar(text, text) TO authenticated, service_role;

-- ── Worker aplica resultado da montagem (com DLQ após 3 tentativas) ──
CREATE OR REPLACE FUNCTION public.orion_package_aplicar(
  p_pacote uuid, p_status text, p_conteudo jsonb DEFAULT NULL,
  p_recomendacao jsonb DEFAULT NULL, p_qualidade jsonb DEFAULT NULL,
  p_horario jsonb DEFAULT NULL, p_erro text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_pac RECORD; v_final text;
BEGIN
  IF coalesce(auth.role(),'') <> 'service_role' AND NOT mp_is_admin() THEN
    RAISE EXCEPTION 'acesso negado';
  END IF;
  SELECT * INTO v_pac FROM orion_pacotes WHERE id = p_pacote;
  IF v_pac IS NULL THEN RAISE EXCEPTION 'Pacote % não existe', p_pacote; END IF;

  IF p_status = 'erro' THEN
    v_final := CASE WHEN v_pac.tentativas + 1 >= 3 THEN 'dlq' ELSE 'erro' END;
    UPDATE orion_pacotes SET status = v_final, tentativas = tentativas + 1, erro = p_erro
     WHERE id = p_pacote;
    IF v_final = 'dlq' THEN
      BEGIN
        INSERT INTO orion_eventos (tipo, origem, dados) VALUES
          ('pacote_dlq', 'package_ai', jsonb_build_object('pacote_id', p_pacote, 'erro', p_erro,
            'acao_requerida', 'Revisão administrativa: pacote falhou 3x'));
      EXCEPTION WHEN OTHERS THEN NULL; END;
    END IF;
    RETURN jsonb_build_object('ok', true, 'status', v_final);
  END IF;

  UPDATE orion_pacotes SET status = 'montado',
    conteudo = coalesce(p_conteudo, conteudo),
    recomendacao = coalesce(p_recomendacao, recomendacao),
    qualidade = coalesce(p_qualidade, qualidade),
    horario = coalesce(p_horario, horario),
    erro = NULL
  WHERE id = p_pacote;

  BEGIN
    INSERT INTO orion_eventos (tipo, origem, dados) VALUES
      ('pacote_montado', 'package_ai', jsonb_build_object('pacote_id', p_pacote,
        'tabela', v_pac.tabela, 'listing_id', v_pac.listing_id, 'cidade', v_pac.cidade)),
      ('pacote_recomendado', 'package_ai', jsonb_build_object('pacote_id', p_pacote,
        'pacote_comercial', p_recomendacao->'melhor'->>'pacote', 'confianca', p_recomendacao->>'confianca'));
  EXCEPTION WHEN OTHERS THEN NULL; END;

  RETURN jsonb_build_object('ok', true, 'status', 'montado');
END; $$;
GRANT EXECUTE ON FUNCTION public.orion_package_aplicar(uuid, text, jsonb, jsonb, jsonb, jsonb, text) TO authenticated, service_role;

-- ── Ações do admin ──
CREATE OR REPLACE FUNCTION public.orion_package_enviar_motor(p_pacote uuid, p_canais text[] DEFAULT ARRAY['feed','whatsapp'])
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_pac RECORD; v_canal text; v_res jsonb; v_reqs jsonb := '[]'::jsonb; v_todos_pub boolean := true;
BEGIN
  IF NOT mp_is_admin() THEN RAISE EXCEPTION 'Apenas administradores'; END IF;
  SELECT * INTO v_pac FROM orion_pacotes WHERE id = p_pacote AND status IN ('montado','erro','enviado_motor');
  IF v_pac IS NULL THEN RAISE EXCEPTION 'Pacote % não está pronto para envio', p_pacote; END IF;

  FOREACH v_canal IN ARRAY p_canais LOOP
    v_res := motor_publish_request(
      'package_ai', v_canal,
      coalesce(v_pac.conteudo->v_canal, v_pac.conteudo->'feed', v_pac.conteudo),
      v_pac.cidade, p_pacote, NULL,
      p_pacote::text || ':' || v_canal || ':v' || v_pac.versao);
    v_reqs := v_reqs || jsonb_build_object('canal', v_canal, 'request_id', v_res->>'request_id', 'status', v_res->>'status');
    IF coalesce(v_res->>'status','') <> 'publicado' THEN v_todos_pub := false; END IF;
  END LOOP;

  UPDATE orion_pacotes SET
    status = CASE WHEN v_todos_pub THEN 'publicado' ELSE 'enviado_motor' END,
    motor_requests = motor_requests || v_reqs
  WHERE id = p_pacote;

  RETURN jsonb_build_object('ok', true, 'requests', v_reqs);
END; $$;
GRANT EXECUTE ON FUNCTION public.orion_package_enviar_motor(uuid, text[]) TO authenticated;

CREATE OR REPLACE FUNCTION public.orion_package_reprocessar(p_pacote uuid, p_motivo text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_pac RECORD;
BEGIN
  IF NOT mp_is_admin() THEN RAISE EXCEPTION 'Apenas administradores'; END IF;
  SELECT * INTO v_pac FROM orion_pacotes WHERE id = p_pacote;
  IF v_pac IS NULL THEN RAISE EXCEPTION 'Pacote não existe'; END IF;
  IF v_pac.status = 'publicado' THEN RAISE EXCEPTION 'Pacote publicado é imutável'; END IF;

  -- versionamento: nunca sobrescreve — versão anterior arquivada
  INSERT INTO orion_pacotes_versoes (pacote_id, versao, conteudo, recomendacao, motivo, autor)
  VALUES (p_pacote, v_pac.versao, v_pac.conteudo, v_pac.recomendacao, p_motivo, auth.uid());

  UPDATE orion_pacotes SET status = 'montando', versao = versao + 1, tentativas = 0, erro = NULL
  WHERE id = p_pacote;

  BEGIN
    INSERT INTO orion_eventos (tipo, origem, dados) VALUES
      ('pacote_reprocessado', 'package_ai',
       jsonb_build_object('pacote_id', p_pacote, 'nova_versao', v_pac.versao + 1, 'motivo', p_motivo));
  EXCEPTION WHEN OTHERS THEN NULL; END;

  PERFORM public.orion_package_ping_worker();
  RETURN jsonb_build_object('ok', true, 'versao', v_pac.versao + 1);
END; $$;
GRANT EXECUTE ON FUNCTION public.orion_package_reprocessar(uuid, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.orion_package_cancelar(p_pacote uuid, p_motivo text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT mp_is_admin() THEN RAISE EXCEPTION 'Apenas administradores'; END IF;
  UPDATE orion_pacotes SET status = 'cancelado', erro = coalesce(p_motivo, erro)
  WHERE id = p_pacote AND status <> 'publicado';
  IF NOT FOUND THEN RAISE EXCEPTION 'Pacote não cancelável (publicado é imutável)'; END IF;
  BEGIN
    INSERT INTO orion_eventos (tipo, origem, dados) VALUES
      ('pacote_cancelado', 'package_ai', jsonb_build_object('pacote_id', p_pacote, 'motivo', p_motivo));
  EXCEPTION WHEN OTHERS THEN NULL; END;
  RETURN jsonb_build_object('ok', true);
END; $$;
GRANT EXECUTE ON FUNCTION public.orion_package_cancelar(uuid, text) TO authenticated;

-- ── Ping do worker (pg_net) + trigger em eventos aprovados + cron backstop ──
CREATE OR REPLACE FUNCTION public.orion_package_ping_worker()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM net.http_post(
    url     := 'https://broifhfqmnzqoongtokm.supabase.co/functions/v1/package-worker',
    headers := jsonb_build_object('Content-Type', 'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJyb2lmaGZxbW56cW9vbmd0b2ttIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njc4Mjc2NzAsImV4cCI6MjA4MzQwMzY3MH0.Zk_AsCPkqaRozf0Nbsxd_S8HBef52VBu7rU4fOD0Hv8'),
    body    := '{}'::jsonb);
EXCEPTION WHEN OTHERS THEN NULL;
END; $$;

CREATE OR REPLACE FUNCTION public.orion_package_tg_evento()
RETURNS trigger AS $$
BEGIN
  IF NEW.tipo = 'anuncio_aprovado'
     OR (NEW.tipo = 'anuncio_revisado_manual' AND NEW.dados->>'decisao' = 'aprovar') THEN
    PERFORM public.orion_package_ping_worker();
  END IF;
  RETURN NEW;
END; $$ LANGUAGE plpgsql SECURITY DEFINER;
DROP TRIGGER IF EXISTS trg_orion_package_evento ON public.orion_eventos;
CREATE TRIGGER trg_orion_package_evento AFTER INSERT ON public.orion_eventos
  FOR EACH ROW EXECUTE FUNCTION public.orion_package_tg_evento();

CREATE OR REPLACE FUNCTION public.orion_package_tick()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  -- pendências: eventos aprovados sem pacote OU pacotes montando/erro (não-DLQ)
  IF EXISTS (
    SELECT 1 FROM orion_eventos e
    WHERE (e.tipo = 'anuncio_aprovado'
           OR (e.tipo = 'anuncio_revisado_manual' AND e.dados->>'decisao' = 'aprovar'))
      AND e.dados->>'listing_id' IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM orion_pacotes p
                      WHERE p.tabela = e.dados->>'tabela'
                        AND p.listing_id = (e.dados->>'listing_id')::uuid)
    LIMIT 1)
     OR EXISTS (SELECT 1 FROM orion_pacotes WHERE status IN ('montando','erro') LIMIT 1)
  THEN
    PERFORM public.orion_package_ping_worker();
  END IF;
  -- expiração
  UPDATE orion_pacotes SET status = 'expirado'
  WHERE status IN ('montado','enviado_motor') AND expira_em < now();
END; $$;

DO $$
BEGIN
  BEGIN PERFORM cron.unschedule('orion_package_tick'); EXCEPTION WHEN OTHERS THEN NULL; END;
  PERFORM cron.schedule('orion_package_tick', '*/5 * * * *', 'SELECT public.orion_package_tick()');
END $$;

-- ── Retomada de pacotes com erro (worker também processa retry) ──
CREATE OR REPLACE FUNCTION public.orion_package_fila_retry(p_limite int DEFAULT 3)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF coalesce(auth.role(),'') <> 'service_role' AND NOT mp_is_admin() THEN
    RAISE EXCEPTION 'acesso negado';
  END IF;
  UPDATE orion_pacotes SET status = 'montando'
  WHERE id IN (SELECT id FROM orion_pacotes WHERE status = 'erro' ORDER BY atualizado_em LIMIT p_limite);
  RETURN (SELECT coalesce(jsonb_agg(jsonb_build_object(
    'pacote_id', p.id, 'tabela', p.tabela, 'listing_id', p.listing_id,
    'titulo', p.titulo_original, 'cidade', p.cidade)), '[]')
    FROM orion_pacotes p WHERE p.status = 'montando' AND p.conteudo IS NULL);
END; $$;
GRANT EXECUTE ON FUNCTION public.orion_package_fila_retry(int) TO authenticated, service_role;

-- ── Dashboard (admin) ──
CREATE OR REPLACE FUNCTION public.orion_package_dashboard()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT mp_is_admin() THEN RAISE EXCEPTION 'Apenas administradores'; END IF;
  RETURN jsonb_build_object(
    'por_status', (SELECT coalesce(jsonb_object_agg(status, n), '{}') FROM
      (SELECT status, count(*) n FROM orion_pacotes GROUP BY 1) s),
    'fila_eventos', (SELECT count(*) FROM orion_eventos e
      WHERE e.tipo = 'anuncio_aprovado' AND e.dados->>'listing_id' IS NOT NULL
        AND NOT EXISTS (SELECT 1 FROM orion_pacotes p
          WHERE p.tabela = e.dados->>'tabela' AND p.listing_id = (e.dados->>'listing_id')::uuid)),
    'motor_por_status', (SELECT coalesce(jsonb_object_agg(status, n), '{}') FROM
      (SELECT status, count(*) n FROM motor_publish_requests GROUP BY 1) m),
    'tempo_medio_ms', (SELECT round(avg((qualidade->>'tempo_ms')::numeric)) FROM orion_pacotes
      WHERE qualidade->>'tempo_ms' IS NOT NULL),
    'por_cidade', (SELECT coalesce(jsonb_agg(jsonb_build_object('cidade', cidade, 'n', n) ORDER BY n DESC), '[]') FROM
      (SELECT cidade, count(*) n FROM orion_pacotes WHERE cidade IS NOT NULL GROUP BY 1 ORDER BY n DESC LIMIT 6) c),
    'por_categoria', (SELECT coalesce(jsonb_agg(jsonb_build_object('categoria', categoria, 'n', n) ORDER BY n DESC), '[]') FROM
      (SELECT categoria, count(*) n FROM orion_pacotes WHERE categoria IS NOT NULL GROUP BY 1 ORDER BY n DESC LIMIT 6) k),
    'serie_14d', (SELECT coalesce(jsonb_agg(jsonb_build_object('dia', d, 'montados', n) ORDER BY d), '[]') FROM
      (SELECT criado_em::date d, count(*) n FROM orion_pacotes
       WHERE criado_em > now() - interval '14 days' GROUP BY 1) z),
    'pacotes', (SELECT coalesce(jsonb_agg(to_jsonb(p) ORDER BY p.criado_em DESC), '[]') FROM
      (SELECT * FROM orion_pacotes ORDER BY criado_em DESC LIMIT 40) p),
    'motor_recentes', (SELECT coalesce(jsonb_agg(to_jsonb(r) ORDER BY r.criado_em DESC), '[]') FROM
      (SELECT id, origem, canal, cidade, status, tentativas, erro, criado_em
       FROM motor_publish_requests ORDER BY criado_em DESC LIMIT 25) r),
    'metricas', (SELECT jsonb_build_object('publicados_hist', count(*),
      'tempo_medio_pub_ms', round(coalesce(avg(duracao_ms),0))) FROM publication_history WHERE status_final = 'publicado'),
    'atualizado_em', to_char(now() AT TIME ZONE 'America/Cuiaba', 'DD/MM/YYYY HH24:MI'));
END; $$;
GRANT EXECUTE ON FUNCTION public.orion_package_dashboard() TO authenticated;

-- ── Aprendizado: resultado de publicação alimenta orion_aprendizado ──
CREATE OR REPLACE FUNCTION public.motor_publish_metrics_registrar(
  p_request uuid, p_views int, p_cliques int, p_contatos int, p_conversoes int)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_req RECORD;
BEGIN
  IF coalesce(auth.role(),'') <> 'service_role' AND NOT mp_is_admin() THEN
    RAISE EXCEPTION 'acesso negado';
  END IF;
  SELECT * INTO v_req FROM motor_publish_requests WHERE id = p_request;
  IF v_req IS NULL THEN RAISE EXCEPTION 'Request não existe'; END IF;
  INSERT INTO publication_metrics (request_id, pacote_id, canal, cidade, views, cliques, contatos, conversoes)
  VALUES (p_request, v_req.pacote_id, v_req.canal, v_req.cidade, p_views, p_cliques, p_contatos, p_conversoes);
  BEGIN
    INSERT INTO orion_aprendizado (contexto, dados)
    VALUES ('publicacao_resultado', jsonb_build_object(
      'canal', v_req.canal, 'cidade', v_req.cidade, 'pacote_id', v_req.pacote_id,
      'views', p_views, 'cliques', p_cliques, 'conversoes', p_conversoes,
      'ctr', CASE WHEN p_views > 0 THEN round(p_cliques::numeric / p_views, 4) ELSE 0 END));
  EXCEPTION WHEN OTHERS THEN NULL; END;
END; $$;
GRANT EXECUTE ON FUNCTION public.motor_publish_metrics_registrar(uuid, int, int, int, int) TO authenticated, service_role;
