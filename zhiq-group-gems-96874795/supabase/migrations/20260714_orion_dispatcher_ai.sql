-- ═══════════════════════════════════════════════════════════════
-- ORION-AI-06 — DISPATCHER AI v1.0 (o M54 sob a arquitetura nova)
--
-- Orquestra a EXECUÇÃO: pega requests 'aguardando_dispatcher' do
-- Motor (whatsapp/push), seleciona grupos SÓ da cidade (orion_norm),
-- respeita cooldowns (grupo 6h, pacote/campanha intervalo do plano,
-- mesmo anúncio no mesmo grupo 24h), prioriza (fórmula explicável),
-- agenda na janela da campanha e entrega via CONTRATO DE PULL ao GLM
-- (auto-poster OU operador humano no painel = plugin GLM).
-- Publicar continua sendo SÓ do Motor: a confirmação chama
-- motor_publish_execute (novo). Idempotência: UNIQUE(request,grupo)
-- + claims por UPDATE condicional. Retry backoff exponencial → DLQ
-- após 3. Failover: worker sem heartbeat 10min devolve itens à fila.
--
-- Aplicada via Management API em 2026-07-14. Idempotente.
-- ═══════════════════════════════════════════════════════════════

-- ── Motor: executar publicação (transição oficial p/ 'publicado') ──
CREATE OR REPLACE FUNCTION public.motor_publish_execute(p_request uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_req RECORD;
BEGIN
  IF session_user <> 'postgres' AND coalesce(auth.role(),'') <> 'service_role' AND NOT mp_is_admin() THEN
    RAISE EXCEPTION 'acesso negado';
  END IF;
  UPDATE motor_publish_requests
     SET status = 'publicado', atualizado_em = now()
   WHERE id = p_request AND status IN ('aguardando_dispatcher','fila','retry')
  RETURNING * INTO v_req;
  IF v_req IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'request não executável (já publicado/cancelado?)');
  END IF;
  INSERT INTO publication_history (request_id, pacote_id, canal, cidade, status_final, duracao_ms)
  VALUES (v_req.id, v_req.pacote_id, v_req.canal, v_req.cidade, 'publicado',
          (extract(epoch FROM now() - v_req.criado_em) * 1000)::int);
  PERFORM motor_emit(v_req.id, 'pacote_publicado',
    jsonb_build_object('canal', v_req.canal, 'pacote_id', v_req.pacote_id, 'via', 'dispatcher'));
  UPDATE orion_pacotes SET status = 'publicado' WHERE id = v_req.pacote_id AND status = 'enviado_motor';
  RETURN jsonb_build_object('ok', true);
END; $$;
GRANT EXECUTE ON FUNCTION public.motor_publish_execute(uuid) TO authenticated, service_role;

-- ── Workers (GLM auto ou humano) ──
CREATE TABLE IF NOT EXISTS public.orion_dispatch_workers (
  id           text PRIMARY KEY,
  tipo         text NOT NULL DEFAULT 'glm',   -- glm | humano
  ativo        boolean NOT NULL DEFAULT true,
  heartbeat_em timestamptz NOT NULL DEFAULT now(),
  criado_em    timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.orion_dispatch_workers ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS odw_admin ON public.orion_dispatch_workers;
CREATE POLICY odw_admin ON public.orion_dispatch_workers
  FOR SELECT TO authenticated USING (mp_is_admin());

-- ── Fila de despacho (auditoria permanente: sem UPDATE/DELETE p/ usuários) ──
CREATE TABLE IF NOT EXISTS public.orion_dispatch_queue (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id    uuid NOT NULL,
  pacote_id     uuid,
  campanha_id   uuid,
  listing_id    uuid,
  canal         text NOT NULL,
  grupo_id      uuid,
  grupo_nome    text,
  cidade        text,
  prioridade    int NOT NULL DEFAULT 20,
  score_detalhe jsonb,
  agendado_para timestamptz NOT NULL DEFAULT now(),
  status        text NOT NULL DEFAULT 'agendada', -- agendada|processando|confirmada|falha|dlq|cancelada
  worker_id     text,
  tentativas    int NOT NULL DEFAULT 0,
  proxima_tentativa timestamptz,
  erro          text,
  criado_em     timestamptz NOT NULL DEFAULT now(),
  entregue_em   timestamptz,
  confirmada_em timestamptz,
  latencia_ms   int,
  CONSTRAINT odq_unico UNIQUE (request_id, grupo_id)
);
CREATE INDEX IF NOT EXISTS idx_odq_status ON public.orion_dispatch_queue (status, agendado_para);
ALTER TABLE public.orion_dispatch_queue ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS odq_admin ON public.orion_dispatch_queue;
CREATE POLICY odq_admin ON public.orion_dispatch_queue
  FOR SELECT TO authenticated USING (mp_is_admin());
REVOKE UPDATE, DELETE ON public.orion_dispatch_queue FROM authenticated, anon;

CREATE OR REPLACE FUNCTION public.orion_dispatch_emit(p_tipo text, p_dados jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  BEGIN
    INSERT INTO orion_eventos (tipo, origem, dados) VALUES (p_tipo, 'dispatcher_ai', p_dados);
  EXCEPTION WHEN OTHERS THEN NULL;
  END;
END; $$;

-- ─────────────────────────────────────────────
-- PLANEJADOR: requests aguardando → itens agendados por grupo
-- ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.orion_dispatcher_planejar(p_limite int DEFAULT 20)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  r RECORD; g RECORD; c RECORD;
  v_janela text; v_ini int; v_fim int; v_agenda timestamptz;
  v_prio int; v_horas_fila numeric; v_itens int := 0; v_reqs int := 0;
  v_intervalo int; v_agora_local timestamptz;
BEGIN
  IF session_user <> 'postgres' AND coalesce(auth.role(),'') <> 'service_role' AND NOT mp_is_admin() THEN
    RAISE EXCEPTION 'acesso negado';
  END IF;
  v_agora_local := now() AT TIME ZONE 'America/Cuiaba';

  FOR r IN
    SELECT m.* FROM motor_publish_requests m
    WHERE m.status IN ('aguardando_dispatcher','retry') AND m.canal IN ('whatsapp','push')
    ORDER BY m.criado_em LIMIT p_limite
  LOOP
    SELECT * INTO c FROM orion_campanhas WHERE pacote_id = r.pacote_id;

    -- janela da campanha (HH:MM-HH:MM) ou pico geral
    v_janela := coalesce(substring(c.plano->>'janela_horario' from '\d{2}:\d{2}-\d{2}:\d{2}'), '18:00-20:00');
    v_ini := split_part(v_janela, ':', 1)::int;
    v_fim := split_part(split_part(v_janela, '-', 2), ':', 1)::int;
    v_intervalo := coalesce((c.plano->'frequencia'->>'intervalo_min_horas')::int, 6);

    IF extract(hour FROM v_agora_local) BETWEEN v_ini AND v_fim - 1 THEN
      v_agenda := now();
    ELSIF extract(hour FROM v_agora_local) < v_ini THEN
      v_agenda := date_trunc('day', now()) + (v_ini || ' hours')::interval
                  + interval '4 hours';  -- Cuiabá = UTC-4
    ELSE
      v_agenda := date_trunc('day', now()) + interval '1 day' + (v_ini || ' hours')::interval
                  + interval '4 hours';
    END IF;

    -- prioridade explicável: campanha + urgência (tempo em fila) + alcance
    v_horas_fila := extract(epoch FROM now() - r.criado_em) / 3600;
    v_prio := CASE coalesce(c.prioridade,'normal') WHEN 'alta' THEN 30 WHEN 'normal' THEN 20 ELSE 10 END
              + least(20, v_horas_fila)::int;

    FOR g IN
      SELECT w.id, coalesce(w.real_name, w.group_name) AS nome, w.members_count
      FROM whatsapp_groups w
      WHERE w.is_active AND coalesce(w.is_valid, true)
        AND coalesce(w.link_status,'') NOT IN ('blocked','suspended')
        AND r.cidade IS NOT NULL
        AND public.orion_norm(coalesce(w.city_name,'')) = public.orion_norm(r.cidade)
        -- cooldown do grupo: 6h desde a última postagem
        AND (w.last_posted_at IS NULL OR w.last_posted_at < now() - interval '6 hours')
        -- mesmo anúncio no mesmo grupo: 24h
        AND NOT EXISTS (SELECT 1 FROM orion_dispatch_queue q2
                        WHERE q2.grupo_id = w.id AND q2.listing_id = r.pacote_id
                          AND q2.confirmada_em > now() - interval '24 hours')
        -- cooldown da campanha/pacote: intervalo mínimo do plano
        AND NOT EXISTS (SELECT 1 FROM orion_dispatch_queue q3
                        WHERE q3.pacote_id = r.pacote_id
                          AND q3.confirmada_em > now() - (v_intervalo || ' hours')::interval)
      ORDER BY w.members_count DESC NULLS LAST
      LIMIT 10
    LOOP
      INSERT INTO orion_dispatch_queue
        (request_id, pacote_id, campanha_id, listing_id, canal, grupo_id, grupo_nome,
         cidade, prioridade, score_detalhe, agendado_para)
      VALUES
        (r.id, r.pacote_id, c.id, r.pacote_id, r.canal, g.id, g.nome, r.cidade,
         v_prio + least(10, coalesce(g.members_count,0) / 100),
         jsonb_build_object('base_campanha', coalesce(c.prioridade,'normal'),
           'urgencia_horas_fila', round(v_horas_fila,1),
           'bonus_membros', least(10, coalesce(g.members_count,0) / 100),
           'janela', v_janela, 'formula', 'base(10/20/30) + min(20,horas_fila) + min(10,membros/100)'),
         v_agenda)
      ON CONFLICT (request_id, grupo_id) DO NOTHING;
      IF FOUND THEN v_itens := v_itens + 1; END IF;
    END LOOP;

    v_reqs := v_reqs + 1;
    PERFORM orion_dispatch_emit('dispatch_started',
      jsonb_build_object('request_id', r.id, 'canal', r.canal, 'cidade', r.cidade,
        'agendado_para', v_agenda, 'prioridade', v_prio));
  END LOOP;

  RETURN jsonb_build_object('ok', true, 'requests_processados', v_reqs, 'itens_criados', v_itens);
END; $$;
GRANT EXECUTE ON FUNCTION public.orion_dispatcher_planejar(int) TO authenticated, service_role;

-- ─────────────────────────────────────────────
-- CONTRATO DE PULL DO GLM (auto-poster OU operador humano)
-- ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.orion_dispatcher_glm_pull(p_worker text, p_limite int DEFAULT 1)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_itens jsonb;
BEGIN
  IF session_user <> 'postgres' AND coalesce(auth.role(),'') <> 'service_role' AND NOT mp_is_admin() THEN
    RAISE EXCEPTION 'acesso negado';
  END IF;

  INSERT INTO orion_dispatch_workers (id, tipo)
  VALUES (p_worker, CASE WHEN p_worker LIKE 'humano%' THEN 'humano' ELSE 'glm' END)
  ON CONFLICT (id) DO UPDATE SET heartbeat_em = now(), ativo = true;

  WITH claim AS (
    SELECT id FROM orion_dispatch_queue
    WHERE status = 'agendada' AND agendado_para <= now()
      AND (proxima_tentativa IS NULL OR proxima_tentativa <= now())
    ORDER BY prioridade DESC, agendado_para
    LIMIT p_limite
    FOR UPDATE SKIP LOCKED
  )
  UPDATE orion_dispatch_queue q
     SET status = 'processando', worker_id = p_worker, entregue_em = now()
    FROM claim WHERE q.id = claim.id;

  SELECT coalesce(jsonb_agg(jsonb_build_object(
      'item_id', q.id, 'grupo', q.grupo_nome, 'grupo_link',
        (SELECT group_link FROM whatsapp_groups w WHERE w.id = q.grupo_id),
      'cidade', q.cidade, 'prioridade', q.prioridade,
      'conteudo', m.conteudo, 'canal', q.canal)), '[]')
    INTO v_itens
  FROM orion_dispatch_queue q
  JOIN motor_publish_requests m ON m.id = q.request_id
  WHERE q.worker_id = p_worker AND q.status = 'processando';

  IF jsonb_array_length(v_itens) > 0 THEN
    PERFORM orion_dispatch_emit('worker_assigned',
      jsonb_build_object('worker', p_worker, 'itens', jsonb_array_length(v_itens)));
  END IF;
  RETURN jsonb_build_object('ok', true, 'itens', v_itens);
END; $$;
GRANT EXECUTE ON FUNCTION public.orion_dispatcher_glm_pull(text, int) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.orion_dispatcher_glm_confirm(p_item uuid, p_sucesso boolean, p_erro text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_it RECORD; v_final text;
BEGIN
  IF session_user <> 'postgres' AND coalesce(auth.role(),'') <> 'service_role' AND NOT mp_is_admin() THEN
    RAISE EXCEPTION 'acesso negado';
  END IF;
  SELECT * INTO v_it FROM orion_dispatch_queue WHERE id = p_item AND status = 'processando';
  IF v_it IS NULL THEN RAISE EXCEPTION 'Item % não está em processamento', p_item; END IF;

  IF p_sucesso THEN
    UPDATE orion_dispatch_queue SET status = 'confirmada', confirmada_em = now(),
      latencia_ms = (extract(epoch FROM now() - criado_em) * 1000)::int
    WHERE id = p_item;
    UPDATE whatsapp_groups SET last_posted_at = now() WHERE id = v_it.grupo_id;
    PERFORM motor_publish_execute(v_it.request_id);
    BEGIN
      INSERT INTO orion_aprendizado (contexto, dados)
      VALUES ('dispatch_resultado', jsonb_build_object(
        'cidade', v_it.cidade, 'grupo', v_it.grupo_nome, 'canal', v_it.canal,
        'worker', v_it.worker_id, 'hora', extract(hour FROM now() AT TIME ZONE 'America/Cuiaba'),
        'latencia_ms', (extract(epoch FROM now() - v_it.criado_em) * 1000)::int, 'sucesso', true));
    EXCEPTION WHEN OTHERS THEN NULL; END;
    PERFORM orion_dispatch_emit('dispatch_completed',
      jsonb_build_object('item', p_item, 'grupo', v_it.grupo_nome, 'worker', v_it.worker_id));
    RETURN jsonb_build_object('ok', true, 'status', 'confirmada');
  ELSE
    v_final := CASE WHEN v_it.tentativas + 1 >= 3 THEN 'dlq' ELSE 'falha' END;
    UPDATE orion_dispatch_queue SET status = v_final, tentativas = tentativas + 1,
      erro = p_erro, worker_id = NULL,
      proxima_tentativa = now() + (power(2, tentativas + 1) * 5 || ' minutes')::interval
    WHERE id = p_item;
    PERFORM orion_dispatch_emit(CASE WHEN v_final = 'dlq' THEN 'dispatch_failed' ELSE 'dispatch_retry' END,
      jsonb_build_object('item', p_item, 'tentativas', v_it.tentativas + 1, 'erro', p_erro,
        'acao_requerida', CASE WHEN v_final = 'dlq' THEN 'Revisão administrativa (DLQ)' ELSE NULL END));
    RETURN jsonb_build_object('ok', true, 'status', v_final);
  END IF;
END; $$;
GRANT EXECUTE ON FUNCTION public.orion_dispatcher_glm_confirm(uuid, boolean, text) TO authenticated, service_role;

-- ─────────────────────────────────────────────
-- FAILOVER: worker sem heartbeat 10 min devolve itens
-- ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.orion_dispatcher_liberar_workers()
RETURNS int LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_n int := 0; w RECORD;
BEGIN
  FOR w IN SELECT id FROM orion_dispatch_workers
           WHERE ativo AND heartbeat_em < now() - interval '10 minutes' LOOP
    UPDATE orion_dispatch_queue SET status = 'agendada', worker_id = NULL
    WHERE worker_id = w.id AND status = 'processando';
    GET DIAGNOSTICS v_n = ROW_COUNT;
    UPDATE orion_dispatch_workers SET ativo = false WHERE id = w.id;
    IF v_n > 0 THEN
      PERFORM orion_dispatch_emit('worker_released',
        jsonb_build_object('worker', w.id, 'itens_devolvidos', v_n, 'motivo', 'heartbeat expirado'));
    END IF;
  END LOOP;
  RETURN v_n;
END; $$;

-- ─────────────────────────────────────────────
-- TICK (cron 5 min): planejar + retries + failover + congestionamento
-- ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.orion_dispatcher_tick()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_fila int;
BEGIN
  PERFORM orion_dispatcher_planejar(20);
  PERFORM orion_dispatcher_liberar_workers();
  -- retries vencidos voltam para a fila
  UPDATE orion_dispatch_queue SET status = 'agendada'
  WHERE status = 'falha' AND proxima_tentativa <= now();
  -- congestionamento
  SELECT count(*) INTO v_fila FROM orion_dispatch_queue WHERE status = 'agendada';
  IF v_fila > 50 THEN
    PERFORM orion_dispatch_emit('dispatch_alert',
      jsonb_build_object('tipo', 'congestionamento', 'fila', v_fila,
        'recomendacao', 'Ativar mais workers GLM ou ampliar janelas'));
  END IF;
END; $$;

DO $$
BEGIN
  BEGIN PERFORM cron.unschedule('orion_dispatcher_tick'); EXCEPTION WHEN OTHERS THEN NULL; END;
  PERFORM cron.schedule('orion_dispatcher_tick', '*/5 * * * *', 'SELECT public.orion_dispatcher_tick()');
END $$;

-- ─────────────────────────────────────────────
-- COMMAND CENTER (admin)
-- ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.orion_dispatcher_dashboard()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_thr numeric; v_fila int;
BEGIN
  IF NOT mp_is_admin() AND session_user <> 'postgres' AND coalesce(auth.role(),'') <> 'service_role' THEN
    RAISE EXCEPTION 'Apenas administradores';
  END IF;
  SELECT count(*) INTO v_fila FROM orion_dispatch_queue WHERE status = 'agendada';
  SELECT count(*)::numeric INTO v_thr FROM orion_dispatch_queue
   WHERE status = 'confirmada' AND confirmada_em > now() - interval '1 hour';

  RETURN jsonb_build_object(
    'fila_por_status', (SELECT coalesce(jsonb_object_agg(status, n), '{}') FROM
      (SELECT status, count(*) n FROM orion_dispatch_queue GROUP BY 1) s),
    'motor_aguardando', (SELECT count(*) FROM motor_publish_requests WHERE status = 'aguardando_dispatcher'),
    'workers', (SELECT coalesce(jsonb_agg(jsonb_build_object('id', id, 'tipo', tipo, 'ativo', ativo,
        'heartbeat', heartbeat_em) ORDER BY heartbeat_em DESC), '[]') FROM orion_dispatch_workers),
    'throughput_hora', v_thr,
    'tps', round(v_thr / 3600, 4),
    'latencia_media_ms', (SELECT round(avg(latencia_ms)) FROM orion_dispatch_queue WHERE latencia_ms IS NOT NULL),
    'latencia_max_ms', (SELECT max(latencia_ms) FROM orion_dispatch_queue),
    'previsao', jsonb_build_object(
      'fila_pendente', v_fila,
      'tempo_estimado_min', CASE WHEN v_thr > 0 THEN round(v_fila / v_thr * 60) ELSE NULL END,
      'nota', CASE WHEN v_thr = 0 THEN 'Sem throughput na última hora — estimativa indisponível' ELSE NULL END),
    'por_cidade', (SELECT coalesce(jsonb_agg(jsonb_build_object('cidade', cidade, 'n', n) ORDER BY n DESC), '[]')
      FROM (SELECT cidade, count(*) n FROM orion_dispatch_queue GROUP BY 1 ORDER BY n DESC LIMIT 8) c),
    'itens', (SELECT coalesce(jsonb_agg(to_jsonb(q) ORDER BY q.prioridade DESC, q.agendado_para), '[]') FROM
      (SELECT id, grupo_nome, cidade, canal, prioridade, status, agendado_para, worker_id,
              tentativas, erro, latencia_ms, score_detalhe
       FROM orion_dispatch_queue
       WHERE status IN ('agendada','processando','falha','dlq')
       ORDER BY prioridade DESC, agendado_para LIMIT 30) q),
    'dlq', (SELECT count(*) FROM orion_dispatch_queue WHERE status = 'dlq'),
    'eventos', (SELECT coalesce(jsonb_agg(jsonb_build_object('tipo', tipo, 'quando', criado_em, 'dados', dados)
        ORDER BY criado_em DESC), '[]')
      FROM (SELECT tipo, criado_em, dados FROM orion_eventos
            WHERE tipo LIKE 'dispatch_%' OR tipo LIKE 'worker_%'
            ORDER BY criado_em DESC LIMIT 15) e),
    'health', jsonb_build_object(
      'cron_ativo', (SELECT count(*) FROM cron.job WHERE jobname = 'orion_dispatcher_tick'),
      'ultimo_worker', (SELECT max(heartbeat_em) FROM orion_dispatch_workers),
      'grupos_em_cooldown', (SELECT count(*) FROM whatsapp_groups
        WHERE is_active AND last_posted_at > now() - interval '6 hours')),
    'atualizado_em', to_char(now() AT TIME ZONE 'America/Cuiaba', 'DD/MM/YYYY HH24:MI'));
END; $$;
GRANT EXECUTE ON FUNCTION public.orion_dispatcher_dashboard() TO authenticated;
