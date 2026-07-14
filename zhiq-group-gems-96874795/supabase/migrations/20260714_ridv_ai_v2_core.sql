-- ═══════════════════════════════════════════════════════════════
-- ORION-AI-02 — RIDV AI V2.0 (núcleo do pipeline automático)
--
-- Fecha o elo que faltava: anúncios nascem 'pending_ai_analysis'
-- (blindagem) mas NADA os processava no servidor. Agora:
--
--   INSERT anúncio → trigger AFTER INSERT pinga a edge ridv-worker
--   (pg_net, assíncrono) → worker analisa o texto com IA → aplica
--   veredito via ridv_worker_aplicar (approved entra no ar /
--   blocked some / manual_review vai à fila humana) → auditoria em
--   ridv_decisions_log → eventos ORION (anuncio_aprovado,
--   anuncio_bloqueado, anuncio_revisao_manual, moderacao_concluida).
--   Backstop: cron a cada 5 min reprocessa pendentes esquecidos.
--
-- + RPCs do painel: ridv_dashboard, ridv_historico, ridv_reprocessar.
-- Aplicada via Management API em 2026-07-14. Idempotente.
-- ═══════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────
-- 1) Fila normalizada para o worker (service_role)
--    Une as 9 tabelas detectando colunas disponíveis por módulo.
-- ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.ridv_worker_fila(p_limite int DEFAULT 10)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_tabelas  text[] := ARRAY['real_estate_listings','vehicle_listings','travel_listings',
                             'freight_listings','service_listings','product_listings',
                             'advertiser_listings','marketplace_products','auction_listings'];
  t          text;
  col_titulo text; col_desc text; col_cidade text; col_preco text;
  parte      jsonb;
  resultado  jsonb := '[]'::jsonb;
BEGIN
  IF coalesce(auth.role(), '') <> 'service_role' AND NOT mp_is_admin() THEN
    RAISE EXCEPTION 'ridv_worker_fila: acesso negado';
  END IF;

  FOREACH t IN ARRAY v_tabelas LOOP
    CONTINUE WHEN jsonb_array_length(resultado) >= p_limite;
    CONTINUE WHEN NOT EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = t);

    col_titulo := NULL; col_desc := NULL; col_cidade := NULL; col_preco := NULL;
    SELECT column_name INTO col_titulo FROM information_schema.columns
     WHERE table_schema='public' AND table_name=t
       AND column_name = ANY (ARRAY['title','name','property_type','model'])
     ORDER BY array_position(ARRAY['title','name','property_type','model'], column_name) LIMIT 1;
    SELECT column_name INTO col_desc FROM information_schema.columns
     WHERE table_schema='public' AND table_name=t
       AND column_name = ANY (ARRAY['description','descricao','details'])
     ORDER BY array_position(ARRAY['description','descricao','details'], column_name) LIMIT 1;
    SELECT column_name INTO col_cidade FROM information_schema.columns
     WHERE table_schema='public' AND table_name=t
       AND column_name = ANY (ARRAY['city','cidade'])
     ORDER BY array_position(ARRAY['city','cidade'], column_name) LIMIT 1;
    SELECT column_name INTO col_preco FROM information_schema.columns
     WHERE table_schema='public' AND table_name=t
       AND column_name = ANY (ARRAY['price','valor','price_per_person','total_price'])
     ORDER BY array_position(ARRAY['price','valor','price_per_person','total_price'], column_name) LIMIT 1;

    EXECUTE format(
      'SELECT coalesce(jsonb_agg(jsonb_build_object(
         ''tabela'', %L, ''id'', x.id,
         ''titulo'', %s, ''descricao'', %s, ''cidade'', %s, ''preco'', %s)), ''[]''::jsonb)
       FROM (SELECT * FROM public.%I
             WHERE moderation_status = ''pending_ai_analysis''
             LIMIT %s) x',
      t,
      CASE WHEN col_titulo IS NULL THEN 'NULL' ELSE format('x.%I::text', col_titulo) END,
      CASE WHEN col_desc   IS NULL THEN 'NULL' ELSE format('left(x.%I::text, 2000)', col_desc) END,
      CASE WHEN col_cidade IS NULL THEN 'NULL' ELSE format('x.%I::text', col_cidade) END,
      CASE WHEN col_preco  IS NULL THEN 'NULL' ELSE format('x.%I::text', col_preco) END,
      t, greatest(1, p_limite - jsonb_array_length(resultado)))
    INTO parte;

    resultado := resultado || parte;
  END LOOP;

  RETURN resultado;
END;
$$;
GRANT EXECUTE ON FUNCTION public.ridv_worker_fila(int) TO authenticated, service_role;

-- ─────────────────────────────────────────────
-- 2) Aplicação do veredito da IA (service_role)
--    Só transiciona quem AINDA está pendente (seguro p/ concorrência).
-- ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.ridv_worker_aplicar(
  p_tabela    text,
  p_id        uuid,
  p_status    text,               -- approved | manual_review | blocked
  p_verdict   text,
  p_confianca numeric,
  p_motivo    text,
  p_categoria_violacao text DEFAULT 'ok',
  p_tempo_ms  int DEFAULT NULL,
  p_modelo    text DEFAULT 'anthropic/claude-haiku'
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_tabelas   text[] := ARRAY['real_estate_listings','vehicle_listings','travel_listings',
                              'freight_listings','service_listings','product_listings',
                              'advertiser_listings','marketplace_products','auction_listings'];
  v_categoria text;
  v_cidade    text;
  v_rows      int;
  v_evento    text;
BEGIN
  IF coalesce(auth.role(), '') <> 'service_role' AND NOT mp_is_admin() THEN
    RAISE EXCEPTION 'ridv_worker_aplicar: acesso negado';
  END IF;
  IF NOT (p_tabela = ANY (v_tabelas)) THEN
    RAISE EXCEPTION 'Tabela inválida: %', p_tabela;
  END IF;
  IF p_status NOT IN ('approved','manual_review','blocked') THEN
    RAISE EXCEPTION 'Status inválido: %', p_status;
  END IF;

  v_categoria := CASE p_tabela
    WHEN 'real_estate_listings' THEN 'real_estate'
    WHEN 'vehicle_listings'     THEN 'vehicle'
    WHEN 'travel_listings'      THEN 'travel'
    WHEN 'freight_listings'     THEN 'freight'
    WHEN 'service_listings'     THEN 'service'
    WHEN 'auction_listings'     THEN 'auction'
    ELSE 'product'
  END;

  PERFORM set_config('ridv.manual_override', 'on', true);
  EXECUTE format(
    'UPDATE public.%I SET
        moderation_status = CASE WHEN $1 = ''manual_review'' THEN ''manual_review'' ELSE $1 END,
        ai_status = ''done'', ai_verdict = $2, ai_confidence = $3,
        moderation_reason = $4
     WHERE id = $5 AND moderation_status = ''pending_ai_analysis''', p_tabela)
  USING p_status, p_verdict, round(coalesce(p_confianca,0)/100.0, 4), p_motivo, p_id;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  PERFORM set_config('ridv.manual_override', 'off', true);

  IF v_rows = 0 THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'já processado por outro worker');
  END IF;

  BEGIN
    EXECUTE format('SELECT x.c FROM (SELECT CASE WHEN EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema=''public'' AND table_name=%L AND column_name=''city'')
      THEN (SELECT city::text FROM public.%I WHERE id=%L) ELSE NULL END c) x',
      p_tabela, p_tabela, p_id) INTO v_cidade;
  EXCEPTION WHEN OTHERS THEN v_cidade := NULL;
  END;

  INSERT INTO public.ridv_decisions_log
    (listing_id, category, content_type, status, confidence, reason, verdict,
     ai_provider, metadata)
  VALUES
    (p_id, v_categoria, 'text', p_status, p_confianca, p_motivo, p_verdict,
     p_modelo,
     jsonb_build_object('tabela', p_tabela, 'cidade', v_cidade,
                        'categoria_violacao', p_categoria_violacao,
                        'tempo_ms', p_tempo_ms, 'origem', 'ridv-worker'));

  v_evento := CASE p_status
    WHEN 'approved' THEN 'anuncio_aprovado'
    WHEN 'blocked'  THEN 'anuncio_bloqueado'
    ELSE 'anuncio_revisao_manual'
  END;
  BEGIN
    INSERT INTO public.orion_eventos (tipo, origem, dados) VALUES
      (v_evento, 'ridv_worker',
       jsonb_build_object('tabela', p_tabela, 'listing_id', p_id,
                          'confianca', p_confianca, 'cidade', v_cidade,
                          'categoria_violacao', p_categoria_violacao)),
      ('moderacao_concluida', 'ridv_worker',
       jsonb_build_object('tabela', p_tabela, 'listing_id', p_id,
                          'status', p_status, 'tempo_ms', p_tempo_ms));
  EXCEPTION WHEN OTHERS THEN NULL;
  END;

  RETURN jsonb_build_object('ok', true, 'status', p_status);
END;
$$;
GRANT EXECUTE ON FUNCTION public.ridv_worker_aplicar(text, uuid, text, text, numeric, text, text, int, text) TO authenticated, service_role;

-- ─────────────────────────────────────────────
-- 3) Reanálise (admin): devolve o anúncio à fila da IA
-- ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.ridv_reprocessar(p_tabela text, p_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_tabelas text[] := ARRAY['real_estate_listings','vehicle_listings','travel_listings',
                            'freight_listings','service_listings','product_listings',
                            'advertiser_listings','marketplace_products','auction_listings'];
  v_rows int;
BEGIN
  IF NOT mp_is_admin() THEN
    RAISE EXCEPTION 'Apenas administradores podem solicitar reanálise';
  END IF;
  IF NOT (p_tabela = ANY (v_tabelas)) THEN
    RAISE EXCEPTION 'Tabela inválida: %', p_tabela;
  END IF;

  PERFORM set_config('ridv.manual_override', 'on', true);
  EXECUTE format(
    'UPDATE public.%I SET moderation_status = ''pending_ai_analysis'',
            ai_status = ''queued'', ai_verdict = NULL, ai_confidence = NULL
     WHERE id = $1', p_tabela)
  USING p_id;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  PERFORM set_config('ridv.manual_override', 'off', true);

  IF v_rows = 0 THEN
    RAISE EXCEPTION 'Anúncio % não encontrado em %', p_id, p_tabela;
  END IF;

  INSERT INTO public.ridv_decisions_log
    (listing_id, category, content_type, status, reason, verdict, ai_provider,
     reviewed_by, reviewed_at, metadata)
  VALUES
    (p_id, 'reanalise', 'text', 'manual_review', 'Reanálise solicitada por administrador',
     'reprocessar', 'human/manual-review', auth.uid(), now(),
     jsonb_build_object('tabela', p_tabela));

  PERFORM public.ridv_ping_worker();
  RETURN jsonb_build_object('ok', true);
END;
$$;
GRANT EXECUTE ON FUNCTION public.ridv_reprocessar(text, uuid) TO authenticated;

-- ─────────────────────────────────────────────
-- 4) Ping da edge ridv-worker via pg_net (assíncrono, nunca falha)
-- ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.ridv_ping_worker()
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  PERFORM net.http_post(
    url     := 'https://broifhfqmnzqoongtokm.supabase.co/functions/v1/ridv-worker',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJyb2lmaGZxbW56cW9vbmd0b2ttIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njc4Mjc2NzAsImV4cCI6MjA4MzQwMzY3MH0.Zk_AsCPkqaRozf0Nbsxd_S8HBef52VBu7rU4fOD0Hv8'),
    body    := '{}'::jsonb);
EXCEPTION WHEN OTHERS THEN NULL;
END;
$$;

-- Trigger AFTER INSERT: qualquer anúncio novo pinga o worker na hora
CREATE OR REPLACE FUNCTION public.ridv_tg_ping_worker()
RETURNS trigger AS $$
BEGIN
  PERFORM public.ridv_ping_worker();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DO $$
DECLARE
  t text;
  tables text[] := ARRAY['real_estate_listings','vehicle_listings','travel_listings',
                         'freight_listings','service_listings','product_listings',
                         'advertiser_listings','marketplace_products','auction_listings'];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    IF EXISTS (SELECT 1 FROM information_schema.tables
               WHERE table_schema='public' AND table_name = t) THEN
      EXECUTE format('DROP TRIGGER IF EXISTS trg_ridv_ping_worker ON public.%I', t);
      EXECUTE format('CREATE TRIGGER trg_ridv_ping_worker AFTER INSERT ON public.%I
                      FOR EACH ROW EXECUTE FUNCTION public.ridv_tg_ping_worker()', t);
    END IF;
  END LOOP;
END $$;

-- Cron backstop: a cada 5 min, se houver pendências, pinga o worker
CREATE OR REPLACE FUNCTION public.ridv_worker_tick()
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_tem boolean := false;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM public.real_estate_listings WHERE moderation_status='pending_ai_analysis'
    UNION ALL SELECT 1 FROM public.vehicle_listings WHERE moderation_status='pending_ai_analysis'
    UNION ALL SELECT 1 FROM public.travel_listings WHERE moderation_status='pending_ai_analysis'
    UNION ALL SELECT 1 FROM public.freight_listings WHERE moderation_status='pending_ai_analysis'
    UNION ALL SELECT 1 FROM public.service_listings WHERE moderation_status='pending_ai_analysis'
    UNION ALL SELECT 1 FROM public.advertiser_listings WHERE moderation_status='pending_ai_analysis'
    LIMIT 1) INTO v_tem;
  IF v_tem THEN
    PERFORM public.ridv_ping_worker();
  END IF;
END;
$$;

DO $$
BEGIN
  BEGIN PERFORM cron.unschedule('ridv_worker_tick'); EXCEPTION WHEN OTHERS THEN NULL; END;
  PERFORM cron.schedule('ridv_worker_tick', '*/5 * * * *', 'SELECT public.ridv_worker_tick()');
END $$;

-- ─────────────────────────────────────────────
-- 5) Dashboard do painel RIDV (admin)
-- ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.ridv_dashboard()
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE r jsonb;
BEGIN
  IF NOT mp_is_admin() THEN
    RAISE EXCEPTION 'Apenas administradores';
  END IF;

  SELECT jsonb_build_object(
    'pendentes_agora', (SELECT public.ridv_fila_revisao(500)),
    'decisoes_total',  (SELECT count(*) FROM ridv_decisions_log),
    'decisoes_hoje',   (SELECT count(*) FROM ridv_decisions_log WHERE created_at::date = current_date),
    'por_status_30d',  (SELECT coalesce(jsonb_object_agg(status, n), '{}'::jsonb) FROM (
                          SELECT status, count(*) n FROM ridv_decisions_log
                          WHERE created_at > now() - interval '30 days' GROUP BY 1) s),
    'top_motivos',     (SELECT coalesce(jsonb_agg(jsonb_build_object('motivo', reason, 'n', n)), '[]'::jsonb) FROM (
                          SELECT left(reason, 90) reason, count(*) n FROM ridv_decisions_log
                          WHERE status IN ('blocked','manual_review') AND reason IS NOT NULL
                          GROUP BY 1 ORDER BY n DESC LIMIT 6) m),
    'top_categorias_rejeitadas', (SELECT coalesce(jsonb_agg(jsonb_build_object('categoria', category, 'n', n)), '[]'::jsonb) FROM (
                          SELECT category, count(*) n FROM ridv_decisions_log
                          WHERE status IN ('blocked','manual_review')
                          GROUP BY 1 ORDER BY n DESC LIMIT 6) c),
    'top_cidades_rejeicao', (SELECT coalesce(jsonb_agg(jsonb_build_object('cidade', cid, 'n', n)), '[]'::jsonb) FROM (
                          SELECT metadata->>'cidade' cid, count(*) n FROM ridv_decisions_log
                          WHERE status IN ('blocked','manual_review') AND metadata->>'cidade' IS NOT NULL
                          GROUP BY 1 ORDER BY n DESC LIMIT 6) c2),
    'tempo_medio_ms',  (SELECT round(avg((metadata->>'tempo_ms')::numeric)) FROM ridv_decisions_log
                          WHERE metadata->>'tempo_ms' IS NOT NULL),
    'por_dia_14d',     (SELECT coalesce(jsonb_agg(jsonb_build_object('dia', d, 'aprovados', a, 'bloqueados', b, 'revisao', r2) ORDER BY d), '[]'::jsonb) FROM (
                          SELECT created_at::date d,
                                 count(*) FILTER (WHERE status = 'approved') a,
                                 count(*) FILTER (WHERE status = 'blocked') b,
                                 count(*) FILTER (WHERE status = 'manual_review') r2
                          FROM ridv_decisions_log
                          WHERE created_at > now() - interval '14 days'
                          GROUP BY 1) dd),
    'por_mes_6m',      (SELECT coalesce(jsonb_agg(jsonb_build_object('mes', m2, 'n', n) ORDER BY m2), '[]'::jsonb) FROM (
                          SELECT to_char(created_at, 'YYYY-MM') m2, count(*) n
                          FROM ridv_decisions_log
                          WHERE created_at > now() - interval '6 months'
                          GROUP BY 1) mm),
    'uso_ia',          (SELECT coalesce(jsonb_object_agg(ai_provider, n), '{}'::jsonb) FROM (
                          SELECT coalesce(ai_provider,'?') ai_provider, count(*) n
                          FROM ridv_decisions_log GROUP BY 1) u),
    'atualizado_em',   to_char(now() AT TIME ZONE 'America/Cuiaba', 'DD/MM/YYYY HH24:MI')
  ) INTO r;
  RETURN r;
END;
$$;
GRANT EXECUTE ON FUNCTION public.ridv_dashboard() TO authenticated;

-- ─────────────────────────────────────────────
-- 6) Histórico com filtros e busca (admin)
-- ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.ridv_historico(
  p_status    text DEFAULT NULL,
  p_categoria text DEFAULT NULL,
  p_busca     text DEFAULT NULL,
  p_limite    int  DEFAULT 80
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT mp_is_admin() THEN
    RAISE EXCEPTION 'Apenas administradores';
  END IF;

  RETURN coalesce((
    SELECT jsonb_agg(jsonb_build_object(
      'id', id, 'listing_id', listing_id, 'categoria', category,
      'tipo', content_type, 'status', status, 'confianca', confidence,
      'motivo', reason, 'verdict', verdict, 'ia', ai_provider,
      'tabela', metadata->>'tabela', 'cidade', metadata->>'cidade',
      'tempo_ms', metadata->>'tempo_ms',
      'revisor', reviewed_by, 'criado_em', created_at) ORDER BY created_at DESC)
    FROM (
      SELECT * FROM ridv_decisions_log
      WHERE (p_status IS NULL OR status = p_status)
        AND (p_categoria IS NULL OR category = p_categoria)
        AND (p_busca IS NULL OR reason ILIKE '%'||p_busca||'%'
             OR metadata->>'cidade' ILIKE '%'||p_busca||'%'
             OR metadata->>'title' ILIKE '%'||p_busca||'%'
             OR listing_id::text = p_busca)
      ORDER BY created_at DESC
      LIMIT least(p_limite, 200)
    ) x), '[]'::jsonb);
END;
$$;
GRANT EXECUTE ON FUNCTION public.ridv_historico(text, text, text, int) TO authenticated;
